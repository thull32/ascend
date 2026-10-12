//! The daily review: a short episode of spoken quiz questions for each
//! learner, picked from what they have missed and what is due again.
//!
//! Scheduling is a Leitner system over quiz questions (`review_items`): each
//! question sits in a box, and box b comes due [`GAP_DAYS`]`[b - 1]` days
//! after it was last reviewed. A question enters the schedule when the
//! learner answers it in a quiz (a miss in box 1, due tomorrow; a correct
//! answer in box 2), or, up to a few a day, from lessons they have studied
//! or heard. Each day's review takes what is due, lowest box first, and tops
//! up with new questions.
//!
//! Hearing a question and its answer counts as a review, so every question in
//! a review moves up a box when the review is made; marking one missed (on
//! the Listen page) sends it back to box 1 for tomorrow. A podcast app gives
//! no feedback, so listening there still advances the schedule.
//!
//! The episode is assembled, not synthesised: the published clips (an
//! intro, "Question one", the question, ..., an outro) are joined byte for
//! byte, which a constant-bitrate MP3 stream allows, and the result is
//! stored once in the audio bucket under a hash of its contents.
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::{DateTime, Days, NaiveDate, Utc};
use sea_orm::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::audio::{AudioService, Manifest};
use crate::content::Curriculum;
use crate::error::{AppError, AppResult};

/// Days until a question in box b (1-based) is due again.
pub const GAP_DAYS: [u64; 7] = [1, 2, 4, 8, 16, 32, 64];
/// Questions in a review.
const TARGET: usize = 8;
/// New questions a day, and from any one lesson.
const MAX_NEW: usize = 5;
const NEW_PER_LESSON: usize = 2;
/// The clips are 96 kbit/s constant bitrate, so time is bytes * 8 / 96,000.
const BYTES_PER_SECOND: f64 = 96_000.0 / 8.0;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReviewItem {
    /// `<lesson key>#<n>`: question n (1-based) of the lesson's quiz.
    pub question: String,
    pub lesson: String,
    pub lesson_title: String,
    /// Where the question starts in the episode, in seconds.
    pub start: f64,
    /// The box the question moved to when this review was made.
    #[serde(rename = "box")]
    pub box_: i16,
    /// The learner's own mark: true got it, false missed it.
    #[serde(default)]
    pub got: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyReview {
    pub day: NaiveDate,
    pub title: String,
    pub duration: f64,
    pub bytes: i64,
    pub items: Vec<ReviewItem>,
    pub created_at: DateTime<Utc>,
    #[serde(skip)]
    pub key: String,
}

#[derive(Clone)]
pub struct ReviewService {
    db: DatabaseConnection,
    audio: AudioService,
    curriculum: Arc<Curriculum>,
}

fn gap(box_: i16) -> Days {
    Days::new(GAP_DAYS[(box_.clamp(1, GAP_DAYS.len() as i16) - 1) as usize])
}

pub fn question_id(lesson: &str, n: u32) -> String {
    format!("{lesson}#{n}")
}

fn title(day: NaiveDate) -> String {
    format!("Daily review, {}", day.format("%A %-d %B"))
}

impl ReviewService {
    pub fn new(db: DatabaseConnection, audio: AudioService, curriculum: Arc<Curriculum>) -> Self {
        Self { db, audio, curriculum }
    }

    fn from_row(row: QueryResult) -> AppResult<DailyReview> {
        let day: NaiveDate = row.try_get("", "day")?;
        let items: serde_json::Value = row.try_get("", "items")?;
        Ok(DailyReview {
            day,
            title: title(day),
            duration: row.try_get("", "duration")?,
            bytes: row.try_get("", "bytes")?,
            items: serde_json::from_value(items).map_err(AppError::internal)?,
            created_at: row.try_get("", "created_at")?,
            key: row.try_get("", "key")?,
        })
    }

    pub async fn get(&self, user_id: Uuid, day: NaiveDate) -> AppResult<DailyReview> {
        let row = self
            .db
            .query_one_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "SELECT day, key, items, duration, bytes, created_at FROM audio_reviews WHERE user_id = $1 AND day = $2",
                [user_id.into(), day.into()],
            ))
            .await?
            .ok_or(AppError::NotFound("review"))?;
        Self::from_row(row)
    }

    /// Today's review (the learner's own day), made on first request.
    /// `None` until audio is published and the learner has studied something.
    pub async fn today(&self, user_id: Uuid) -> AppResult<Option<DailyReview>> {
        if !self.audio.enabled() {
            return Ok(None);
        }
        let day = super::activity::today(&self.db, user_id).await?;
        match self.get(user_id, day).await {
            Ok(r) => return Ok(Some(r)),
            Err(AppError::NotFound(_)) => {}
            Err(e) => return Err(e),
        }
        let manifest = self.audio.manifest().await?;
        let picked = self.pick(user_id, day, &manifest).await?;
        if picked.is_empty() {
            return Ok(None);
        }
        self.make(user_id, day, &manifest, picked).await
    }

    /// The last week's reviews, newest first, with today's made if due: the
    /// podcast feed lists these.
    pub async fn recent(&self, user_id: Uuid) -> AppResult<Vec<DailyReview>> {
        self.today(user_id).await?;
        let rows = self
            .db
            .query_all_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "SELECT day, key, items, duration, bytes, created_at FROM audio_reviews \
                 WHERE user_id = $1 AND day > current_date - 8 ORDER BY day DESC",
                [user_id.into()],
            ))
            .await?;
        rows.into_iter().map(Self::from_row).collect()
    }

    /// Questions for `day`: (question id, its current box or 0 if new),
    /// due ones first, lowest box first; only questions with a clip.
    async fn pick(&self, user_id: Uuid, day: NaiveDate, manifest: &Manifest) -> AppResult<Vec<(String, i16)>> {
        let spoken: HashSet<String> = manifest.questions.iter().map(|q| question_id(&q.lesson, q.question)).collect();
        let rows = self
            .db
            .query_all_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "SELECT question, box, due <= $2 AS is_due FROM review_items WHERE user_id = $1 ORDER BY box, due",
                [user_id.into(), day.into()],
            ))
            .await?;
        let mut known = HashSet::new();
        let mut picked = Vec::new();
        for r in rows {
            let question: String = r.try_get("", "question")?;
            if r.try_get::<bool>("", "is_due")? && spoken.contains(&question) && picked.len() < TARGET {
                picked.push((question.clone(), r.try_get::<i16>("", "box")?));
            }
            known.insert(question);
        }
        if picked.len() >= TARGET {
            return Ok(picked);
        }
        // New questions, from the lessons studied most recently.
        let lessons = self
            .db
            .query_all_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "SELECT lesson FROM ( \
                   SELECT lesson_slug AS lesson, updated_at AS at FROM lesson_progress WHERE user_id = $1 \
                   UNION ALL SELECT lesson, heard_at FROM audio_listens \
                     WHERE user_id = $1 AND heard_at IS NOT NULL AND lesson IS NOT NULL \
                   UNION ALL SELECT lesson_slug, created_at FROM quiz_attempts WHERE user_id = $1 \
                 ) studied GROUP BY lesson ORDER BY max(at) DESC LIMIT 50",
                [user_id.into()],
            ))
            .await?;
        let mut by_lesson: HashMap<&str, Vec<u32>> = HashMap::new();
        for q in &manifest.questions {
            by_lesson.entry(q.lesson.as_str()).or_default().push(q.question);
        }
        let mut new = 0;
        for r in lessons {
            let lesson: String = r.try_get("", "lesson")?;
            let mut numbers = by_lesson.get(lesson.as_str()).cloned().unwrap_or_default();
            numbers.sort_unstable();
            let mut from_this = 0;
            for n in numbers {
                if picked.len() >= TARGET || new >= MAX_NEW || from_this >= NEW_PER_LESSON {
                    break;
                }
                let id = question_id(&lesson, n);
                if !known.contains(&id) {
                    picked.push((id, 0));
                    new += 1;
                    from_this += 1;
                }
            }
        }
        Ok(picked)
    }

    /// Joins the clips, stores the episode, records the review and moves
    /// each question up a box.
    async fn make(
        &self,
        user_id: Uuid,
        day: NaiveDate,
        manifest: &Manifest,
        picked: Vec<(String, i16)>,
    ) -> AppResult<Option<DailyReview>> {
        let clip = |key: &str| manifest.clips.iter().find(|c| c.daily == key);
        let (Some(intro), Some(outro)) = (clip("intro"), clip("outro")) else {
            return Ok(None);
        };
        let questions: HashMap<String, &super::audio::QuestionClip> =
            manifest.questions.iter().map(|q| (question_id(&q.lesson, q.question), q)).collect();
        let mut names = vec![intro.name.clone()];
        let mut items = Vec::new();
        let mut at = intro.bytes;
        for (id, box_) in &picked {
            // Numbered by position in the episode, so a question whose clip is
            // missing leaves no gap.
            let (Some(number), Some(q)) = (clip(&format!("n{}", items.len() + 1)), questions.get(id)) else {
                continue;
            };
            let lesson_title = self.curriculum.lesson(&q.lesson).map(|l| l.summary.title.clone()).unwrap_or_default();
            items.push(ReviewItem {
                question: id.clone(),
                lesson: q.lesson.clone(),
                lesson_title,
                start: at as f64 / BYTES_PER_SECOND,
                box_: Ord::min(*box_ + 1, GAP_DAYS.len() as i16),
                got: None,
            });
            names.push(number.name.clone());
            names.push(q.name.clone());
            at += number.bytes + q.bytes;
        }
        if items.is_empty() {
            return Ok(None);
        }
        names.push(outro.name.clone());
        let keys: Vec<String> = names.iter().map(|n| format!("audio/{n}.mp3")).collect();
        let parts = futures::future::try_join_all(keys.iter().map(|k| self.audio.fetch(k))).await?;
        let body: Vec<u8> = parts.concat();
        let digest = crate::auth::token::hash(&names.join(","));
        let key = format!("reviews/{}.mp3", &digest[..32]);
        self.audio.upload(&key, body.clone(), "audio/mpeg").await?;

        let txn = self.db.begin().await?;
        let inserted = txn
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "INSERT INTO audio_reviews (user_id, day, key, items, duration, bytes) VALUES ($1, $2, $3, $4, $5, $6) \
                 ON CONFLICT (user_id, day) DO NOTHING",
                [
                    user_id.into(),
                    day.into(),
                    key.clone().into(),
                    serde_json::to_value(&items).map_err(AppError::internal)?.into(),
                    (body.len() as f64 / BYTES_PER_SECOND).into(),
                    (body.len() as i64).into(),
                ],
            ))
            .await?
            .rows_affected();
        if inserted == 1 {
            for item in &items {
                schedule(&txn, user_id, &item.question, item.box_, day + gap(item.box_)).await?;
            }
        }
        txn.commit().await?;
        // Lost a race with a concurrent request: theirs is today's review.
        self.get(user_id, day).await.map(Some)
    }

    /// The learner's own mark for one question of a review. A miss sends it
    /// back to box 1, due the next day; "got it" restores the box the
    /// review moved it to.
    pub async fn grade(&self, user_id: Uuid, day: NaiveDate, question: &str, got: bool) -> AppResult<DailyReview> {
        let mut review = self.get(user_id, day).await?;
        let item = review.items.iter_mut().find(|i| i.question == question).ok_or(AppError::NotFound("question"))?;
        item.got = Some(got);
        let (box_, due) = if got { (item.box_, day + gap(item.box_)) } else { (1, day + gap(1)) };
        let txn = self.db.begin().await?;
        txn.execute_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "UPDATE audio_reviews SET items = $3 WHERE user_id = $1 AND day = $2",
            [user_id.into(), day.into(), serde_json::to_value(&review.items).map_err(AppError::internal)?.into()],
        ))
        .await?;
        schedule(&txn, user_id, question, box_, due).await?;
        txn.commit().await?;
        Ok(review)
    }

    pub fn url(&self, review: &DailyReview) -> AppResult<url::Url> {
        self.audio.sign(&review.key)
    }

    /// Deletes reviews older than `days`, and their episodes once no review
    /// uses them (two learners can get the same questions in the same order).
    pub async fn expire(&self, days: i32) -> AppResult<u64> {
        let rows = self
            .db
            .query_all_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "DELETE FROM audio_reviews WHERE day < current_date - $1::int RETURNING key",
                [days.into()],
            ))
            .await?;
        let keys: HashSet<String> = rows.iter().filter_map(|r| r.try_get("", "key").ok()).collect();
        for key in &keys {
            let used = self
                .db
                .query_one_raw(Statement::from_sql_and_values(
                    DatabaseBackend::Postgres,
                    "SELECT 1 AS one FROM audio_reviews WHERE key = $1 LIMIT 1",
                    [key.clone().into()],
                ))
                .await?
                .is_some();
            if !used && let Err(e) = self.audio.remove(key).await {
                tracing::warn!(error = %e, key, "could not delete an expired review episode");
            }
        }
        Ok(rows.len() as u64)
    }
}

async fn schedule<C: ConnectionTrait>(
    db: &C,
    user_id: Uuid,
    question: &str,
    box_: i16,
    due: NaiveDate,
) -> AppResult<()> {
    db.execute_raw(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        "INSERT INTO review_items (user_id, question, box, due, updated_at) VALUES ($1, $2, $3, $4, now()) \
         ON CONFLICT (user_id, question) DO UPDATE SET box = EXCLUDED.box, due = EXCLUDED.due, updated_at = now()",
        [user_id.into(), question.into(), box_.into(), due.into()],
    ))
    .await?;
    Ok(())
}

/// A graded quiz feeds the schedule: a missed question goes to box 1, due
/// tomorrow; a correct one the schedule has not seen enters box 2.
pub async fn record_quiz<C: ConnectionTrait>(db: &C, user_id: Uuid, lesson: &str, correct: &[bool]) -> AppResult<()> {
    let today = super::activity::today(db, user_id).await?;
    for (i, &ok) in correct.iter().enumerate() {
        let question = question_id(lesson, i as u32 + 1);
        if ok {
            db.execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "INSERT INTO review_items (user_id, question, box, due) VALUES ($1, $2, 2, $3) \
                 ON CONFLICT (user_id, question) DO NOTHING",
                [user_id.into(), question.into(), (today + gap(2)).into()],
            ))
            .await?;
        } else {
            schedule(db, user_id, &question, 1, today + gap(1)).await?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gaps_grow_and_clamp() {
        assert_eq!(gap(1), Days::new(1));
        assert_eq!(gap(3), Days::new(4));
        assert_eq!(gap(7), Days::new(64));
        assert_eq!(gap(9), Days::new(64), "past the last box stays at the longest gap");
        assert_eq!(gap(0), Days::new(1));
    }

    #[test]
    fn titles_name_the_day() {
        assert_eq!(title(NaiveDate::from_ymd_opt(2026, 10, 11).unwrap()), "Daily review, Sunday 11 October");
    }
}
