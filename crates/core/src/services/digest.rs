//! The weekly admin digest: one email to each admin on Monday morning with
//! last week's sign-ups, activity, AI use, new problem reports and where
//! learners went quiet.
//!
//! The hourly maintenance loop calls [`DigestService::send_if_due`]. Each
//! week is claimed in `admin_digest_weeks` (m0018) before anything is sent,
//! so replicas and restarts never send a week twice; if every send fails
//! the claim is released and the next hour tries again. Admins turn it off
//! for themselves on the dashboard (`admin_preferences`).
//!
//! The email holds counts and lesson titles only: no learner's name, email
//! or report text.
use std::sync::Arc;

use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc};
use sea_orm::*;
use serde::Serialize;
use uuid::Uuid;

use super::admin::stmt;
use super::funnel::{FunnelService, QUIET_DAYS};
use crate::content::Curriculum;
use crate::email::{self, Email, Mailer};
use crate::error::{AppError, AppResult};

/// Monday, 16:00 UTC: 08:00 on the US west coast, the evening in Europe.
pub const SEND_HOUR_UTC: u32 = 16;

#[derive(Debug, Clone, Serialize, FromQueryResult)]
pub struct Numbers {
    pub signups: i64,
    pub signups_prev: i64,
    pub active: i64,
    pub active_prev: i64,
    pub lessons_completed: i64,
    pub lessons_completed_prev: i64,
    pub submissions: i64,
    pub ai_requests: i64,
    pub ai_output_tokens: i64,
    pub reports_new: i64,
    pub reports_open: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Digest {
    pub from: NaiveDate,
    /// Inclusive.
    pub to: NaiveDate,
    pub numbers: Numbers,
    /// Category and target title of the newest reports in the period.
    pub reports: Vec<(String, String)>,
    pub quiet_learners: i64,
    /// The lesson quiet learners most often stopped at, and how many.
    pub top_stop: Option<(String, i64)>,
}

#[derive(Debug, Serialize)]
pub struct Rendered {
    pub subject: String,
    pub text: String,
}

#[derive(Debug, Serialize, FromQueryResult)]
pub struct SentWeek {
    pub week: NaiveDate,
    pub sent_at: DateTime<Utc>,
    pub recipients: i32,
}

#[derive(Debug, Serialize)]
pub struct DigestStatus {
    /// Without an email provider nothing is sent.
    pub mail_enabled: bool,
    /// Whether the asking admin gets it; null for the operator token.
    pub subscribed: Option<bool>,
    pub next_send: DateTime<Utc>,
    pub last_sent: Option<SentWeek>,
    /// The email as it would read now, over the last seven days.
    pub preview: Rendered,
}

/// The Monday of the week whose digest is due at `now`, if any: from Monday
/// at [`SEND_HOUR_UTC`] to the end of Sunday, the current week's digest
/// (covering the week before) is due until it has been sent.
pub fn due_week(now: DateTime<Utc>) -> Option<NaiveDate> {
    let today = now.date_naive();
    let monday = today - Duration::days(today.weekday().num_days_from_monday() as i64);
    let opens = Utc.from_utc_datetime(&monday.and_hms_opt(SEND_HOUR_UTC, 0, 0)?);
    (now >= opens).then_some(monday)
}

/// When the next digest goes out, if this week's has been sent (or the
/// window has not opened yet).
pub fn next_send(now: DateTime<Utc>, this_week_sent: bool) -> DateTime<Utc> {
    let today = now.date_naive();
    let monday = today - Duration::days(today.weekday().num_days_from_monday() as i64);
    let at = |d: NaiveDate| Utc.from_utc_datetime(&d.and_hms_opt(SEND_HOUR_UTC, 0, 0).expect("valid hour"));
    match due_week(now) {
        Some(_) if this_week_sent => at(monday + Duration::weeks(1)),
        Some(_) => now,
        None => at(monday),
    }
}

fn thousands(n: i64) -> String {
    let s = n.abs().to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    if n < 0 { format!("-{out}") } else { out }
}

fn compared(now: i64, before: i64) -> String {
    format!("{} (the week before: {})", thousands(now), thousands(before))
}

fn plural(n: i64, one: &str, many: &str) -> String {
    format!("{} {}", thousands(n), if n == 1 { one } else { many })
}

impl Digest {
    pub fn subject(&self) -> String {
        format!(
            "Ascend, week of {}: {}, {}",
            self.from.format("%-d %b"),
            plural(self.numbers.signups, "sign-up", "sign-ups"),
            plural(self.numbers.active, "active learner", "active learners")
        )
    }

    pub fn paragraphs(&self) -> Vec<String> {
        let n = &self.numbers;
        let mut out = vec![
            format!(
                "Here is how Ascend did from {} to {}.",
                self.from.format("%A %-d %B"),
                self.to.format("%A %-d %B")
            ),
            format!("Sign-ups: {}", compared(n.signups, n.signups_prev)),
            format!("Active learners: {}", compared(n.active, n.active_prev)),
            format!("Lessons completed: {}", compared(n.lessons_completed, n.lessons_completed_prev)),
            format!("Graded submissions: {}", thousands(n.submissions)),
            format!(
                "AI: {} and {} output tokens",
                plural(n.ai_requests, "request", "requests"),
                thousands(n.ai_output_tokens)
            ),
        ];
        let mut reports =
            format!("Problem reports: {} new, {} open in total.", thousands(n.reports_new), thousands(n.reports_open));
        for (category, title) in &self.reports {
            reports.push_str(&format!("\n• {category}: {title}"));
        }
        out.push(reports);
        let mut quiet =
            format!("{} with no activity for {QUIET_DAYS} days.", plural(self.quiet_learners, "learner", "learners"));
        if let Some((title, count)) = &self.top_stop {
            quiet.push_str(&format!(" The lesson they most often stopped at: {title} ({count})."));
        }
        out.push(quiet);
        out
    }

    pub fn render(&self) -> Rendered {
        Rendered { subject: self.subject(), text: self.paragraphs().join("\n\n") }
    }

    pub fn email(&self, to: &str, name: &str, origin: &str) -> Email {
        email::notice(
            to,
            &self.subject(),
            &format!("Hi {name},"),
            &self.paragraphs(),
            &format!("{}/admin", origin.trim_end_matches('/')),
            "Open the dashboard",
            "You get this because you are an Ascend admin. Turn it off on the dashboard's overview page.",
        )
    }
}

fn category_label(c: &str) -> &'static str {
    match c {
        "mistake" => "Mistake",
        "broken" => "Something broken",
        "unclear" => "Unclear",
        _ => "Other",
    }
}

#[derive(Clone)]
pub struct DigestService {
    db: DatabaseConnection,
    curriculum: Arc<Curriculum>,
    origin: String,
}

impl DigestService {
    pub fn new(db: DatabaseConnection, curriculum: Arc<Curriculum>, origin: String) -> Self {
        Self { db, curriculum, origin }
    }

    /// The digest for `[from, to)` (UTC days), compared with the same span before it.
    pub async fn build(&self, from: NaiveDate, to: NaiveDate) -> AppResult<Digest> {
        let span = to - from;
        let prev = from - span;
        let at = |d: NaiveDate| Utc.from_utc_datetime(&d.and_hms_opt(0, 0, 0).expect("midnight"));
        let numbers = Numbers::find_by_statement(stmt(
            "SELECT \
               (SELECT count(*) FROM users WHERE created_at >= $1 AND created_at < $2)::bigint AS signups, \
               (SELECT count(*) FROM users WHERE created_at >= $3 AND created_at < $1)::bigint AS signups_prev, \
               (SELECT count(DISTINCT user_id) FROM activity_days WHERE day >= $4 AND day < $5)::bigint AS active, \
               (SELECT count(DISTINCT user_id) FROM activity_days WHERE day >= $6 AND day < $4)::bigint AS active_prev, \
               (SELECT count(*) FROM lesson_progress WHERE completed_at >= $1 AND completed_at < $2)::bigint \
                 AS lessons_completed, \
               (SELECT count(*) FROM lesson_progress WHERE completed_at >= $3 AND completed_at < $1)::bigint \
                 AS lessons_completed_prev, \
               (SELECT count(*) FROM submissions WHERE created_at >= $1 AND created_at < $2)::bigint AS submissions, \
               (SELECT coalesce(sum(requests), 0) FROM ai_usage WHERE day >= $4 AND day < $5)::bigint AS ai_requests, \
               (SELECT coalesce(sum(output_tokens), 0) FROM ai_usage WHERE day >= $4 AND day < $5)::bigint \
                 AS ai_output_tokens, \
               (SELECT count(*) FROM content_reports WHERE created_at >= $1 AND created_at < $2)::bigint AS reports_new, \
               (SELECT count(*) FROM content_reports WHERE status = 'open')::bigint AS reports_open",
            [at(from).into(), at(to).into(), at(prev).into(), from.into(), to.into(), prev.into()],
        ))
        .one(&self.db)
        .await?
        .ok_or_else(|| AppError::internal("digest numbers returned no row"))?;
        let reports = self
            .db
            .query_all_raw(stmt(
                "SELECT category, target_kind, target_slug FROM content_reports \
                 WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at DESC LIMIT 5",
                [at(from).into(), at(to).into()],
            ))
            .await?
            .iter()
            .map(|r| {
                let (kind, slug): (String, String) = (r.try_get("", "target_kind")?, r.try_get("", "target_slug")?);
                let title = match kind.as_str() {
                    "lesson" => self.curriculum.lesson(&slug).map(|l| l.summary.title.clone()),
                    _ => self.curriculum.problem(&slug).map(|p| p.title.clone()),
                };
                Ok((category_label(&r.try_get::<String>("", "category")?).to_string(), title.unwrap_or(slug)))
            })
            .collect::<Result<_, DbErr>>()?;
        let funnel = FunnelService::new(self.db.clone(), self.curriculum.clone()).report(4).await?;
        let top_stop = funnel
            .stop_points
            .first()
            .map(|s| (s.title.clone().unwrap_or_else(|| s.slug.clone()), s.stopped_in + s.stopped_after));
        Ok(Digest {
            from,
            to: to - Duration::days(1),
            numbers,
            reports,
            quiet_learners: funnel.quiet_learners,
            top_stop,
        })
    }

    async fn recipients(&self) -> AppResult<Vec<(String, String)>> {
        Ok(self
            .db
            .query_all_raw(stmt(
                "SELECT u.email, u.display_name FROM users u LEFT JOIN admin_preferences p ON p.user_id = u.id \
                 WHERE u.role = 'admin' AND coalesce(p.weekly_digest, true) ORDER BY u.email",
                [],
            ))
            .await?
            .iter()
            .map(|r| Ok((r.try_get("", "email")?, r.try_get("", "display_name")?)))
            .collect::<Result<_, DbErr>>()?)
    }

    /// Sends this week's digest if it is due and nobody has sent it yet.
    /// Returns how many admins it went to, or `None` when nothing was due.
    pub async fn send_if_due(&self, mailer: &Mailer, now: DateTime<Utc>) -> AppResult<Option<usize>> {
        if !mailer.enabled() {
            return Ok(None);
        }
        let Some(week) = due_week(now) else { return Ok(None) };
        let claimed = self
            .db
            .execute_raw(stmt(
                "INSERT INTO admin_digest_weeks (week) VALUES ($1) ON CONFLICT DO NOTHING",
                [week.into()],
            ))
            .await?
            .rows_affected();
        if claimed == 0 {
            return Ok(None);
        }
        let result = self.send_week(mailer, week).await;
        match result {
            Ok(sent) => {
                self.db
                    .execute_raw(stmt(
                        "UPDATE admin_digest_weeks SET recipients = $2, sent_at = now() WHERE week = $1",
                        [week.into(), (sent as i32).into()],
                    ))
                    .await?;
                Ok(Some(sent))
            }
            Err(e) => {
                // Let the next round try again.
                self.db.execute_raw(stmt("DELETE FROM admin_digest_weeks WHERE week = $1", [week.into()])).await?;
                Err(e)
            }
        }
    }

    async fn send_week(&self, mailer: &Mailer, week: NaiveDate) -> AppResult<usize> {
        let digest = self.build(week - Duration::weeks(1), week).await?;
        let recipients = self.recipients().await?;
        let mut sent = 0;
        let mut last_error = None;
        for (to, name) in &recipients {
            match mailer.send(&digest.email(to, name, &self.origin)).await {
                Ok(()) => sent += 1,
                Err(e) => {
                    tracing::warn!(error = %e, "admin digest email failed");
                    last_error = Some(e);
                }
            }
        }
        match last_error {
            Some(e) if sent == 0 => Err(e),
            _ => Ok(sent),
        }
    }

    pub async fn status(&self, mailer: &Mailer, admin: Option<Uuid>, now: DateTime<Utc>) -> AppResult<DigestStatus> {
        let subscribed = match admin {
            Some(id) => Some(
                self.db
                    .query_one_raw(stmt("SELECT weekly_digest FROM admin_preferences WHERE user_id = $1", [id.into()]))
                    .await?
                    .map(|r| r.try_get::<bool>("", "weekly_digest"))
                    .transpose()?
                    .unwrap_or(true),
            ),
            None => None,
        };
        let last_sent = SentWeek::find_by_statement(stmt(
            "SELECT week, sent_at, recipients FROM admin_digest_weeks ORDER BY week DESC LIMIT 1",
            [],
        ))
        .one(&self.db)
        .await?;
        let this_week_sent = matches!((&last_sent, due_week(now)), (Some(s), Some(w)) if s.week == w);
        let today = now.date_naive();
        let preview = self.build(today - Duration::days(6), today + Duration::days(1)).await?.render();
        Ok(DigestStatus {
            mail_enabled: mailer.enabled(),
            subscribed,
            next_send: next_send(now, this_week_sent),
            last_sent,
            preview,
        })
    }

    pub async fn set_subscribed(&self, admin: Uuid, on: bool) -> AppResult<()> {
        self.db
            .execute_raw(stmt(
                "INSERT INTO admin_preferences (user_id, weekly_digest) VALUES ($1, $2) \
                 ON CONFLICT (user_id) DO UPDATE SET weekly_digest = $2, updated_at = now()",
                [admin.into(), on.into()],
            ))
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(s: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(s).unwrap().with_timezone(&Utc)
    }

    #[test]
    fn the_digest_is_due_from_monday_afternoon_until_sunday() {
        let monday = NaiveDate::from_ymd_opt(2026, 11, 2).unwrap();
        assert_eq!(due_week(t("2026-11-02T15:59:59Z")), None);
        assert_eq!(due_week(t("2026-11-02T16:00:00Z")), Some(monday));
        assert_eq!(due_week(t("2026-11-08T23:59:59Z")), Some(monday));
        assert_eq!(due_week(t("2026-11-09T00:00:00Z")), None);
    }

    #[test]
    fn next_send_is_this_monday_now_or_next_monday() {
        assert_eq!(next_send(t("2026-11-02T09:00:00Z"), false), t("2026-11-02T16:00:00Z"));
        assert_eq!(next_send(t("2026-11-05T09:00:00Z"), false), t("2026-11-05T09:00:00Z"));
        assert_eq!(next_send(t("2026-11-05T09:00:00Z"), true), t("2026-11-09T16:00:00Z"));
    }

    #[test]
    fn numbers_read_naturally() {
        assert_eq!(thousands(1_234_567), "1,234,567");
        assert_eq!(thousands(999), "999");
        assert_eq!(plural(1, "sign-up", "sign-ups"), "1 sign-up");
        assert_eq!(plural(0, "sign-up", "sign-ups"), "0 sign-ups");
    }
}
