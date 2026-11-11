//! Problem reports: a learner flags a mistake, a broken visualisation or an
//! unclear explanation in a lesson or problem, and admins work the queue at
//! `/admin/reports` (m0018).
//!
//! Reports are about the content, so they outlive the reporter's account
//! (`user_id` becomes null). Closed reports expire a year after closing
//! (`services::retention`). Closing and reopening are audited; the audit
//! detail names the report and its target, never the message.
use std::sync::Arc;

use chrono::{DateTime, Utc};
use sea_orm::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use super::admin::{Actor, Page, Paged, record, stmt};
use crate::content::Curriculum;
use crate::error::{AppError, AppResult};

pub const CATEGORIES: [&str; 4] = ["mistake", "broken", "unclear", "other"];
pub const STATUSES: [&str; 3] = ["open", "resolved", "dismissed"];
/// More open reports than this from one learner is a sign of a script, or of
/// a queue we are not keeping up with; either way, stop taking more.
pub const MAX_OPEN_PER_LEARNER: i64 = 25;

#[derive(Debug, Deserialize, Validate)]
pub struct NewReport {
    pub target_kind: String,
    pub target_slug: String,
    pub category: String,
    #[validate(length(min = 10, max = 2000, message = "must be 10–2000 characters"))]
    pub message: String,
}

#[derive(Debug, Default, Deserialize)]
pub struct ReportFilter {
    /// `open`, `resolved` or `dismissed`; all when absent.
    #[serde(default)]
    pub status: Option<String>,
    /// Only this learner's reports (the admin user page).
    #[serde(default)]
    pub reporter: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct ReportRow {
    pub id: Uuid,
    pub reporter_id: Option<Uuid>,
    pub reporter_name: Option<String>,
    pub reporter_email: Option<String>,
    pub target_kind: String,
    pub target_slug: String,
    /// Null when the lesson or problem is no longer in the curriculum.
    pub target_title: Option<String>,
    pub category: String,
    pub message: String,
    pub status: String,
    pub closed_at: Option<DateTime<Utc>>,
    pub closed_by: Option<String>,
    pub created_at: DateTime<Utc>,
    /// For a coding problem, the reporter's latest attempt when they
    /// reported it (its code opens through the audited admin endpoint).
    pub attempt: Option<ReportAttempt>,
}

/// The attempt attached to a report, without its code.
#[derive(Debug, Serialize)]
pub struct ReportAttempt {
    pub id: Uuid,
    pub language: String,
    pub passed: bool,
    pub passed_count: i16,
    pub total_count: i16,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, FromQueryResult)]
struct Row {
    id: Uuid,
    reporter_id: Option<Uuid>,
    reporter_name: Option<String>,
    reporter_email: Option<String>,
    target_kind: String,
    target_slug: String,
    category: String,
    message: String,
    status: String,
    closed_at: Option<DateTime<Utc>>,
    closed_by: Option<String>,
    created_at: DateTime<Utc>,
    attempt_id: Option<Uuid>,
    attempt_language: Option<String>,
    attempt_passed: Option<bool>,
    attempt_passed_count: Option<i16>,
    attempt_total_count: Option<i16>,
    attempt_created_at: Option<DateTime<Utc>>,
}

const SELECT: &str = "SELECT r.id, r.user_id AS reporter_id, u.display_name AS reporter_name, \
       u.email AS reporter_email, r.target_kind, r.target_slug, r.category, r.message, r.status, r.closed_at, \
       c.email AS closed_by, r.created_at, s.id AS attempt_id, s.language AS attempt_language, \
       s.passed AS attempt_passed, s.passed_count AS attempt_passed_count, s.total_count AS attempt_total_count, \
       s.created_at AS attempt_created_at \
     FROM content_reports r LEFT JOIN users u ON u.id = r.user_id LEFT JOIN users c ON c.id = r.closed_by \
       LEFT JOIN submissions s ON s.id = r.submission_id";

#[derive(Clone)]
pub struct ReportService {
    db: DatabaseConnection,
    curriculum: Arc<Curriculum>,
}

impl ReportService {
    pub fn new(db: DatabaseConnection, curriculum: Arc<Curriculum>) -> Self {
        Self { db, curriculum }
    }

    fn title(&self, kind: &str, slug: &str) -> Option<String> {
        match kind {
            "lesson" => self.curriculum.lesson(slug).map(|l| l.summary.title.clone()),
            "problem" => self.curriculum.problem(slug).map(|p| p.title.clone()),
            _ => None,
        }
    }

    fn row(&self, r: Row) -> ReportRow {
        let attempt = match (r.attempt_id, r.attempt_language, r.attempt_passed, r.attempt_passed_count) {
            (Some(id), Some(language), Some(passed), Some(passed_count)) => Some(ReportAttempt {
                id,
                language,
                passed,
                passed_count,
                total_count: r.attempt_total_count.unwrap_or_default(),
                created_at: r.attempt_created_at.unwrap_or(r.created_at),
            }),
            _ => None,
        };
        ReportRow {
            attempt,
            target_title: self.title(&r.target_kind, &r.target_slug),
            id: r.id,
            reporter_id: r.reporter_id,
            reporter_name: r.reporter_name,
            reporter_email: r.reporter_email,
            target_kind: r.target_kind,
            target_slug: r.target_slug,
            category: r.category,
            message: r.message,
            status: r.status,
            closed_at: r.closed_at,
            closed_by: r.closed_by,
            created_at: r.created_at,
        }
    }

    /// A learner's report. Returns its id.
    pub async fn create(&self, user_id: Uuid, input: NewReport) -> AppResult<Uuid> {
        input.validate()?;
        if !CATEGORIES.contains(&input.category.as_str()) {
            return Err(AppError::validation(format!("category must be one of {}", CATEGORIES.join(", "))));
        }
        if self.title(&input.target_kind, &input.target_slug).is_none() {
            return Err(AppError::NotFound("report target"));
        }
        let open: i64 = self
            .db
            .query_one_raw(stmt(
                "SELECT count(*)::bigint AS n FROM content_reports WHERE user_id = $1 AND status = 'open'",
                [user_id.into()],
            ))
            .await?
            .map(|r| r.try_get("", "n"))
            .transpose()?
            .unwrap_or(0);
        if open >= MAX_OPEN_PER_LEARNER {
            return Err(AppError::Conflict(
                "you have a lot of reports waiting already; we will get to them before taking more".into(),
            ));
        }
        let id = Uuid::now_v7();
        self.db
            .execute_raw(stmt(
                // A report on a coding problem keeps the reporter's latest attempt at it.
                "INSERT INTO content_reports (id, user_id, target_kind, target_slug, category, message, submission_id) \
                 VALUES ($1, $2, $3, $4, $5, $6, \
                   CASE WHEN $3 = 'problem' THEN (SELECT s.id FROM submissions s WHERE s.user_id = $2 \
                     AND s.target_kind = 'problem' AND s.target_slug = $4 ORDER BY s.created_at DESC LIMIT 1) END)",
                [
                    id.into(),
                    user_id.into(),
                    input.target_kind.into(),
                    input.target_slug.into(),
                    input.category.into(),
                    input.message.trim().to_string().into(),
                ],
            ))
            .await?;
        Ok(id)
    }

    /// Newest first.
    pub async fn list(&self, filter: ReportFilter, page: Page) -> AppResult<Paged<ReportRow>> {
        let (offset, limit) = page.clamped();
        let status = filter.status.filter(|s| !s.is_empty());
        if let Some(s) = status.as_deref()
            && !STATUSES.contains(&s)
        {
            return Err(AppError::validation(format!("status must be one of {}", STATUSES.join(", "))));
        }
        let filter_sql = "($1::text IS NULL OR r.status = $1) AND ($2::uuid IS NULL OR r.user_id = $2)";
        let total: i64 = self
            .db
            .query_one_raw(stmt(
                &format!("SELECT count(*)::bigint AS n FROM content_reports r WHERE {filter_sql}"),
                [status.clone().into(), filter.reporter.into()],
            ))
            .await?
            .map(|r| r.try_get("", "n"))
            .transpose()?
            .unwrap_or(0);
        let items = Row::find_by_statement(stmt(
            &format!("{SELECT} WHERE {filter_sql} ORDER BY r.created_at DESC LIMIT $3 OFFSET $4"),
            [status.into(), filter.reporter.into(), limit.into(), offset.into()],
        ))
        .all(&self.db)
        .await?
        .into_iter()
        .map(|r| self.row(r))
        .collect();
        Ok(Paged { total, offset, limit, items })
    }

    /// Opens, resolves or dismisses a report, and records who did it.
    pub async fn set_status(&self, actor: &Actor, id: Uuid, status: &str) -> AppResult<ReportRow> {
        if !STATUSES.contains(&status) {
            return Err(AppError::validation(format!("status must be one of {}", STATUSES.join(", "))));
        }
        let txn = self.db.begin().await?;
        let current = txn
            .query_one_raw(stmt(
                "SELECT status, target_kind, target_slug FROM content_reports WHERE id = $1 FOR UPDATE",
                [id.into()],
            ))
            .await?
            .ok_or(AppError::NotFound("report"))?;
        let from: String = current.try_get("", "status")?;
        if from != status {
            txn.execute_raw(stmt(
                "UPDATE content_reports SET status = $2, \
                   closed_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END, \
                   closed_by = CASE WHEN $2 = 'open' THEN NULL ELSE $3 END \
                 WHERE id = $1",
                [id.into(), status.into(), actor.id().into()],
            ))
            .await?;
            let detail = serde_json::json!({
                "report": id,
                "from": from,
                "to": status,
                "target_kind": current.try_get::<String>("", "target_kind")?,
                "target_slug": current.try_get::<String>("", "target_slug")?,
            });
            record(&txn, actor, "set_report_status", None, detail).await?;
        }
        txn.commit().await?;
        let row = Row::find_by_statement(stmt(&format!("{SELECT} WHERE r.id = $1"), [id.into()]))
            .one(&self.db)
            .await?
            .ok_or(AppError::NotFound("report"))?;
        Ok(self.row(row))
    }
}
