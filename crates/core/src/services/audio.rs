//! Audio editions: lessons rewritten for listening (content/AUDIO_GUIDE.md),
//! rendered to MP3 by `scripts/audio/render.py` and uploaded with a manifest
//! by `scripts/audio/publish.py` to a bucket. This service reads the
//! manifest, signs short-lived URLs to the files, and serves each learner a
//! private podcast feed so episodes play in any podcast app, in the car and
//! offline.
//!
//! The feed URL carries a 256-bit token (only its hash is stored, one per
//! learner; making a new one revokes the old). It authorises reading the feed
//! and its episodes and nothing else.
use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use rusty_s3::{Bucket, Credentials, S3Action, UrlStyle};
use sea_orm::*;
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::auth::token;
use crate::config::AudioStorage;
use crate::error::{AppError, AppResult};

/// How long a signed link to an episode stays valid. Podcast apps fetch the
/// enclosure right after reading the feed; a resumed download re-reads it.
const LINK_TTL: Duration = Duration::from_secs(6 * 3600);
/// How long the manifest is cached before it is fetched again.
const MANIFEST_TTL: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub title: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Episode {
    /// File stem in the bucket: `audio/<name>.mp3`.
    pub name: String,
    pub title: String,
    /// The lesson this edition is of; `None` for a review episode.
    pub lesson: Option<String>,
    /// The module a review episode covers.
    pub review: Option<String>,
    pub track: String,
    pub module: String,
    pub module_title: String,
    /// Position in the curriculum: episodes play in this order.
    pub order: u32,
    pub duration: f64,
    pub bytes: u64,
    #[serde(default)]
    pub fit: Option<String>,
    #[serde(default)]
    pub desk: Vec<String>,
    #[serde(default)]
    pub chapters: Vec<Chapter>,
    pub published: DateTime<Utc>,
}

/// A narrated walkthrough of one of a lesson's visualisations: an MP3 and
/// the frame each cue shows, which the web player steps in time with it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Walkthrough {
    pub name: String,
    pub title: String,
    pub lesson: String,
    pub track: String,
    pub module: String,
    /// The visualisation's title in the lesson, which identifies it.
    pub viz: String,
    pub duration: f64,
    pub bytes: u64,
    pub cues: Vec<Cue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cue {
    pub frame: u32,
    /// The last frame of a range cue (`@3-7`), played across the cue.
    #[serde(default)]
    pub to: Option<u32>,
    pub start: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub episodes: Vec<Episode>,
    #[serde(default)]
    pub walkthroughs: Vec<Walkthrough>,
}

/// The last manifest fetched, and when.
type CachedManifest = Option<(Instant, Arc<Manifest>)>;

struct Store {
    bucket: Bucket,
    credentials: Credentials,
}

#[derive(Clone)]
pub struct AudioService {
    db: DatabaseConnection,
    store: Option<Arc<Store>>,
    http: reqwest::Client,
    manifest: Arc<RwLock<CachedManifest>>,
}

impl AudioService {
    pub fn new(db: DatabaseConnection, storage: Option<&AudioStorage>) -> anyhow::Result<Self> {
        let store = match storage {
            Some(s) => {
                let style = if s.path_style { UrlStyle::Path } else { UrlStyle::VirtualHost };
                let bucket = Bucket::new(url::Url::parse(&s.endpoint)?, style, s.bucket.clone(), s.region.clone())?;
                let credentials = Credentials::new(s.access_key_id.clone(), s.secret_access_key.expose_secret());
                Some(Arc::new(Store { bucket, credentials }))
            }
            None => None,
        };
        let http = reqwest::Client::builder().timeout(Duration::from_secs(10)).build()?;
        Ok(Self { db, store, http, manifest: Arc::default() })
    }

    pub fn enabled(&self) -> bool {
        self.store.is_some()
    }

    fn store(&self) -> AppResult<&Store> {
        self.store.as_deref().ok_or(AppError::NotFound("audio"))
    }

    /// A signed, short-lived URL to an object in the bucket.
    fn sign(&self, key: &str) -> AppResult<url::Url> {
        let store = self.store()?;
        Ok(store.bucket.get_object(Some(&store.credentials), key).sign(LINK_TTL))
    }

    /// The published episodes, cached for a few minutes. If the bucket is
    /// unreachable, the last good manifest is served.
    pub async fn manifest(&self) -> AppResult<Arc<Manifest>> {
        if let Some((at, m)) = self.manifest.read().await.as_ref()
            && at.elapsed() < MANIFEST_TTL
        {
            return Ok(m.clone());
        }
        let fetched = async {
            let url = self.sign("manifest.json")?;
            let res = self.http.get(url).send().await.map_err(|e| AppError::Unavailable {
                message: format!("audio manifest: {e}"),
                retry_after_secs: None,
            })?;
            if res.status() == reqwest::StatusCode::NOT_FOUND {
                return Ok(Manifest { episodes: Vec::new(), walkthroughs: Vec::new() });
            }
            let res = res.error_for_status().map_err(|e| AppError::Unavailable {
                message: format!("audio manifest: {e}"),
                retry_after_secs: None,
            })?;
            res.json::<Manifest>()
                .await
                .map_err(|e| AppError::Unavailable { message: format!("audio manifest: {e}"), retry_after_secs: None })
        }
        .await;
        let mut cache = self.manifest.write().await;
        match fetched {
            Ok(mut m) => {
                m.episodes.sort_by_key(|e| e.order);
                let m = Arc::new(m);
                *cache = Some((Instant::now(), m.clone()));
                Ok(m)
            }
            Err(e) => match cache.as_ref() {
                Some((_, stale)) => {
                    tracing::warn!(error = %e, "audio manifest unavailable; serving the cached one");
                    Ok(stale.clone())
                }
                None => Err(e),
            },
        }
    }

    pub async fn episode(&self, name: &str) -> AppResult<Episode> {
        self.manifest().await?.episodes.iter().find(|e| e.name == name).cloned().ok_or(AppError::NotFound("episode"))
    }

    /// Where to fetch an episode's or a walkthrough's MP3 from, for the
    /// next few hours.
    pub async fn episode_url(&self, name: &str) -> AppResult<url::Url> {
        let manifest = self.manifest().await?;
        let known =
            manifest.episodes.iter().any(|e| e.name == name) || manifest.walkthroughs.iter().any(|w| w.name == name);
        if !known {
            return Err(AppError::NotFound("episode"));
        }
        self.sign(&format!("audio/{name}.mp3"))
    }

    /// Makes the learner's feed token, replacing any earlier one. Returned
    /// once; only its hash is kept.
    pub async fn new_feed(&self, user_id: Uuid) -> AppResult<String> {
        let raw = token::generate();
        let txn = self.db.begin().await?;
        txn.execute_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM audio_feeds WHERE user_id = $1",
            [user_id.into()],
        ))
        .await?;
        txn.execute_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "INSERT INTO audio_feeds (token_hash, user_id) VALUES ($1, $2)",
            [token::hash(&raw).into(), user_id.into()],
        ))
        .await?;
        txn.commit().await?;
        Ok(raw)
    }

    pub async fn has_feed(&self, user_id: Uuid) -> AppResult<bool> {
        let row = self
            .db
            .query_one_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "SELECT 1 AS one FROM audio_feeds WHERE user_id = $1",
                [user_id.into()],
            ))
            .await?;
        Ok(row.is_some())
    }

    /// The learner a feed token belongs to; unknown tokens are `NotFound`.
    pub async fn feed_owner(&self, raw: &str) -> AppResult<Uuid> {
        if !token::looks_valid(raw) {
            return Err(AppError::NotFound("feed"));
        }
        let row = self
            .db
            .query_one_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "SELECT user_id FROM audio_feeds WHERE token_hash = $1",
                [token::hash(raw).into()],
            ))
            .await?
            .ok_or(AppError::NotFound("feed"))?;
        Ok(row.try_get("", "user_id")?)
    }
}

/// XML text escaping for element content and attribute values.
fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

fn duration(seconds: f64) -> String {
    let s = seconds.round() as u64;
    format!("{}:{:02}:{:02}", s / 3600, s / 60 % 60, s % 60)
}

/// The private podcast feed. `base` is the feed's own directory URL, e.g.
/// `https://ascend.engineering/api/audio/feed/<token>`; episodes and their
/// chapter files are served beneath it.
pub fn rss(manifest: &Manifest, base: &str, site: &str) -> String {
    let mut out = String::with_capacity(4096 + manifest.episodes.len() * 1200);
    out.push_str(r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>Ascend</title>
"#);
    out.push_str(&format!("<link>{}</link>\n", esc(site)));
    out.push_str(
        "<description>Ascend's lessons, rewritten for listening: system design, distributed systems, databases and \
         senior engineering, plus spoken quizzes. A private feed: do not share its address.</description>\n\
         <language>en</language>\n<itunes:author>Ascend</itunes:author>\n<itunes:type>serial</itunes:type>\n\
         <itunes:explicit>false</itunes:explicit>\n<itunes:block>Yes</itunes:block>\n\
         <itunes:category text=\"Education\"><itunes:category text=\"Courses\"/></itunes:category>\n",
    );
    out.push_str(&format!(
        "<itunes:image href=\"{0}/podcast-artwork.png\"/>\n<image><url>{0}/podcast-artwork.png</url><title>Ascend</title><link>{0}</link></image>\n",
        esc(site.trim_end_matches('/'))
    ));
    for (i, e) in manifest.episodes.iter().enumerate() {
        let mut notes = String::new();
        notes.push_str(&format!("{}.", e.module_title));
        if let Some(lesson) = &e.lesson {
            notes.push_str(&format!(
                " Lesson: {}/learn/{}/{}/{}",
                site.trim_end_matches('/'),
                e.track,
                e.module,
                lesson
            ));
        }
        if !e.desk.is_empty() {
            notes.push_str(&format!(" At your desk: {}.", e.desk.join("; ")));
        }
        out.push_str("<item>\n");
        out.push_str(&format!("<title>{}</title>\n", esc(&e.title)));
        out.push_str(&format!("<description>{}</description>\n", esc(&notes)));
        out.push_str(&format!(
            "<guid isPermaLink=\"false\">ascend-audio-{}-{}</guid>\n",
            esc(&e.name),
            e.published.timestamp()
        ));
        out.push_str(&format!("<pubDate>{}</pubDate>\n", e.published.to_rfc2822()));
        out.push_str(&format!(
            "<enclosure url=\"{}/{}.mp3\" length=\"{}\" type=\"audio/mpeg\"/>\n",
            esc(base),
            esc(&e.name),
            e.bytes
        ));
        out.push_str(&format!("<itunes:duration>{}</itunes:duration>\n", duration(e.duration)));
        out.push_str(&format!("<itunes:episode>{}</itunes:episode>\n", i + 1));
        out.push_str("<itunes:episodeType>full</itunes:episodeType>\n");
        if !e.chapters.is_empty() {
            out.push_str(&format!(
                "<podcast:chapters url=\"{}/{}.chapters.json\" type=\"application/json+chapters\"/>\n",
                esc(base),
                esc(&e.name)
            ));
        }
        out.push_str("</item>\n");
    }
    out.push_str("</channel>\n</rss>\n");
    out
}

/// Podcasting 2.0 chapters for one episode.
pub fn chapters_json(e: &Episode) -> serde_json::Value {
    serde_json::json!({
        "version": "1.2.0",
        "chapters": e.chapters.iter().map(|c| serde_json::json!({ "startTime": c.start, "title": c.title })).collect::<Vec<_>>(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn episode(name: &str, order: u32) -> Episode {
        Episode {
            name: name.into(),
            title: "Caching & <stampedes>".into(),
            lesson: Some("caching-strategies".into()),
            review: None,
            track: "system-design".into(),
            module: "building-blocks".into(),
            module_title: "System design building blocks".into(),
            order,
            duration: 678.4,
            bytes: 5_400_000,
            fit: Some("great".into()),
            desk: vec!["The single-flight code".into()],
            chapters: vec![Chapter { title: "Introduction".into(), start: 0.0, end: 54.0 }],
            published: "2026-10-09T12:00:00Z".parse().unwrap(),
        }
    }

    #[test]
    fn the_feed_is_escaped_ordered_and_points_beneath_its_own_url() {
        let m = Manifest { episodes: vec![episode("caching-strategies", 4)], walkthroughs: Vec::new() };
        let xml = rss(&m, "https://ascend.engineering/api/audio/feed/TOKEN", "https://ascend.engineering");
        assert!(xml.contains("<title>Caching &amp; &lt;stampedes&gt;</title>"), "{xml}");
        assert!(xml.contains(r#"<enclosure url="https://ascend.engineering/api/audio/feed/TOKEN/caching-strategies.mp3" length="5400000" type="audio/mpeg"/>"#));
        assert!(xml.contains("<itunes:duration>0:11:18</itunes:duration>"));
        assert!(xml.contains("<itunes:block>Yes</itunes:block>"), "never listed in public directories");
        assert!(xml.contains("/learn/system-design/building-blocks/caching-strategies"));
        assert!(xml.contains("At your desk: The single-flight code."));
        assert_eq!(chapters_json(&m.episodes[0])["chapters"][0]["title"], "Introduction");
    }
}
