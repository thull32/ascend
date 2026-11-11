//! The admin dashboard: read models over every learner and over the content,
//! and the account actions an operator takes.
//!
//! What it deliberately does not show: learners' coach conversations and
//! interview transcripts. Those stay between the learner and the product
//! (the privacy page says so). Admins see accounts, progress, scores, counts
//! and usage. Submitted code is never listed: an admin opens one attempt at
//! a time ([`AdminService::submission_code`]) and each opening is audited.
//!
//! Every change goes into the audit log (`admin_audit`, m0017) with who made
//! it. The log never stores email addresses or comment text, so it holds no
//! personal data beyond account UUIDs, and it expires after a year.
use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, NaiveDate, Utc};
use sea_orm::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::progress::{ProgressService, ProgressSummary};
use crate::content::Curriculum;
use crate::content::model::Difficulty;
use crate::entities::prelude::*;
use crate::entities::users;
use crate::error::{AppError, AppResult};

/// Who is acting: a signed-in admin, or the bearer-token operator API.
#[derive(Debug, Clone)]
pub enum Actor {
    Admin { id: Uuid, email: String },
    Token,
}

impl Actor {
    pub(crate) fn id(&self) -> Option<Uuid> {
        match self {
            Actor::Admin { id, .. } => Some(*id),
            Actor::Token => None,
        }
    }
    fn label(&self) -> String {
        match self {
            Actor::Admin { email, .. } => email.clone(),
            Actor::Token => "operator token".into(),
        }
    }
}

pub const ROLES: [&str; 2] = ["user", "admin"];

/// Offset pagination. Admin lists are small enough that keyset pagination
/// would buy nothing.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Page {
    #[serde(default)]
    pub offset: u64,
    #[serde(default = "default_limit")]
    pub limit: u64,
}

fn default_limit() -> u64 {
    50
}

impl Page {
    pub(crate) fn clamped(self) -> (i64, i64) {
        (std::cmp::Ord::min(self.offset, 1_000_000) as i64, self.limit.clamp(1, 200) as i64)
    }
}

#[derive(Debug, Serialize, PartialEq, Eq, FromQueryResult)]
pub struct Totals {
    pub users: i64,
    pub users_new_7d: i64,
    pub users_new_30d: i64,
    pub users_verified: i64,
    pub users_onboarded: i64,
    pub admins: i64,
    pub active_1d: i64,
    pub active_7d: i64,
    pub active_30d: i64,
    pub lessons_completed: i64,
    pub submissions: i64,
    pub submissions_7d: i64,
    pub quiz_attempts: i64,
    pub interviews: i64,
    pub comments: i64,
    pub live_sessions: i64,
    pub ai_requests_today: i64,
    pub ai_input_tokens_today: i64,
    pub ai_output_tokens_today: i64,
    pub reports_open: i64,
}

#[derive(Debug, Serialize, FromQueryResult)]
pub struct DayCount {
    pub day: NaiveDate,
    pub signups: i64,
    pub active: i64,
    pub submissions: i64,
}

#[derive(Debug, Serialize)]
pub struct Overview {
    pub totals: Totals,
    /// The last 30 UTC days, oldest first, every day present.
    pub daily: Vec<DayCount>,
    pub lessons_total: usize,
    pub problems_total: usize,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UserSort {
    #[default]
    Newest,
    Oldest,
    LastActive,
    Lessons,
    Email,
}

impl UserSort {
    /// Fixed fragments, never user input.
    fn order_by(self) -> &'static str {
        match self {
            UserSort::Newest => "u.created_at DESC",
            UserSort::Oldest => "u.created_at ASC",
            UserSort::LastActive => "last_active DESC NULLS LAST, u.created_at DESC",
            UserSort::Lessons => "lessons_completed DESC, u.created_at DESC",
            UserSort::Email => "u.email ASC",
        }
    }
}

#[derive(Debug, Default, Deserialize)]
pub struct UserFilter {
    /// Matches anywhere in the email or the display name, case-insensitively.
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub sort: UserSort,
    /// An invite's short id: only the accounts that signed up with it.
    #[serde(default)]
    pub invite: Option<String>,
}

#[derive(Debug, Serialize, FromQueryResult)]
pub struct UserRow {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub role: String,
    pub target_company: Option<String>,
    pub email_verified: bool,
    pub onboarded: bool,
    pub created_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
    /// The learner's most recent activity day, in their time zone.
    pub last_active: Option<NaiveDate>,
    pub lessons_completed: i64,
    pub problems_solved: i64,
    /// The note of the invite the account signed up with.
    pub invite_note: Option<String>,
    pub invite_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Paged<T> {
    pub total: i64,
    pub offset: i64,
    pub limit: i64,
    pub items: Vec<T>,
}

/// The account as an admin sees it: everything but the password hash.
#[derive(Debug, Serialize)]
pub struct Account {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub role: String,
    pub target_company: Option<String>,
    pub target_level: Option<String>,
    pub weekly_hours: i16,
    pub preferred_language: String,
    pub timezone: Option<String>,
    pub email_verified_at: Option<DateTime<Utc>>,
    pub onboarded_at: Option<DateTime<Utc>>,
    pub last_login_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<users::Model> for Account {
    fn from(u: users::Model) -> Self {
        Self {
            id: u.id,
            email: u.email,
            display_name: u.display_name,
            role: u.role,
            target_company: u.target_company,
            target_level: u.target_level,
            weekly_hours: u.weekly_hours,
            preferred_language: u.preferred_language,
            timezone: u.timezone,
            email_verified_at: u.email_verified_at,
            onboarded_at: u.onboarded_at,
            last_login_at: u.last_login_at,
            created_at: u.created_at,
            updated_at: u.updated_at,
        }
    }
}

/// A graded attempt, without the code.
#[derive(Debug, Serialize, FromQueryResult)]
pub struct SubmissionRow {
    pub id: Uuid,
    pub target_kind: String,
    pub target_slug: String,
    pub language: String,
    pub passed: bool,
    pub passed_count: i16,
    pub total_count: i16,
    pub runtime_ms: Option<i32>,
    pub created_at: DateTime<Utc>,
}

/// A graded attempt with its code, returned only by
/// [`AdminService::submission_code`], which audits the opening.
#[derive(Debug, Serialize)]
pub struct SubmissionCode {
    pub id: Uuid,
    pub user_id: Uuid,
    pub target_kind: String,
    pub target_slug: String,
    pub language: String,
    pub code: String,
    pub passed: bool,
    pub passed_count: i16,
    pub total_count: i16,
    pub runtime_ms: Option<i32>,
    /// The server's verdict per test, as recorded at grading.
    pub results: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

/// A quiz attempt, without the answers.
#[derive(Debug, Serialize, FromQueryResult)]
pub struct QuizRow {
    pub lesson_slug: String,
    pub source: String,
    pub score: i16,
    pub total: i16,
    pub created_at: DateTime<Utc>,
}

/// A mock interview, without the transcript, code or written evaluation.
#[derive(Debug, Serialize, FromQueryResult)]
pub struct InterviewRow {
    pub id: Uuid,
    pub kind: String,
    pub assistant_mode: String,
    pub problem_slug: Option<String>,
    pub status: String,
    pub score: Option<i16>,
    pub duration_minutes: i16,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, FromQueryResult)]
pub struct UsageRow {
    pub day: NaiveDate,
    pub requests: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_read_tokens: i64,
}

#[derive(Debug, Serialize, FromQueryResult)]
pub struct SessionRow {
    pub created_at: DateTime<Utc>,
    pub last_seen_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub user_agent: Option<String>,
}

#[derive(Debug, Serialize, FromQueryResult)]
pub struct Counts {
    pub comments: i64,
    pub conversations: i64,
    pub review_items: i64,
    pub review_due: i64,
    pub episodes_heard: i64,
}

#[derive(Debug, Serialize)]
pub struct UserDetail {
    pub account: Account,
    pub progress: ProgressSummary,
    /// Activity days of the last 182 days, in the learner's time zone.
    pub activity: Vec<NaiveDate>,
    pub submissions: Vec<SubmissionRow>,
    pub quizzes: Vec<QuizRow>,
    pub interviews: Vec<InterviewRow>,
    pub ai_usage: Vec<UsageRow>,
    pub sessions: Vec<SessionRow>,
    pub counts: Counts,
    pub audit: Vec<AuditEntry>,
    /// The invite the account signed up with, if it needed one.
    pub invite: Option<InviteSource>,
    pub reports: Vec<super::reports::ReportRow>,
}

#[derive(Debug, Serialize, FromQueryResult)]
pub struct InviteSource {
    pub invite_id: String,
    pub note: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromQueryResult)]
pub struct AuditEntry {
    pub id: Uuid,
    pub actor_id: Option<Uuid>,
    pub actor_label: String,
    pub action: String,
    pub target_id: Option<Uuid>,
    /// The target's current email; null once the account is gone.
    pub target_email: Option<String>,
    pub detail: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromQueryResult)]
pub struct CommentRow {
    pub id: Uuid,
    pub author_id: Option<Uuid>,
    pub author_email: Option<String>,
    pub author_name: Option<String>,
    pub target_kind: String,
    pub target_slug: String,
    pub parent_id: Option<Uuid>,
    pub body: String,
    pub deleted: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Default, Deserialize)]
pub struct CommentFilter {
    #[serde(default)]
    pub include_deleted: bool,
}

#[derive(Debug, Serialize)]
pub struct LessonStats {
    pub slug: String,
    pub title: String,
    pub minutes: u32,
    pub difficulty: Difficulty,
    pub has_quiz: bool,
    pub has_viz: bool,
    pub quiz_questions: usize,
    pub exercises: usize,
    pub started: i64,
    pub completed: i64,
    pub quiz_attempts: i64,
    pub quiz_learners: i64,
    /// Mean score of all attempts, 0 to 1; null without attempts.
    pub quiz_avg: Option<f64>,
    pub exercise_attempts: i64,
    pub comments: i64,
}

#[derive(Debug, Serialize)]
pub struct ModuleStats {
    pub slug: String,
    pub title: String,
    pub estimated_hours: f32,
    pub lessons: Vec<LessonStats>,
}

#[derive(Debug, Serialize)]
pub struct TrackStats {
    pub slug: String,
    pub title: String,
    pub phase: u8,
    pub lesson_count: usize,
    pub estimated_hours: f32,
    pub modules: Vec<ModuleStats>,
}

#[derive(Debug, Serialize)]
pub struct ProblemStats {
    pub slug: String,
    pub title: String,
    pub difficulty: Difficulty,
    pub patterns: Vec<String>,
    pub tests: usize,
    pub has_walkthrough: bool,
    pub attempts: i64,
    pub learners: i64,
    pub solvers: i64,
    pub comments: i64,
}

#[derive(Debug, Serialize)]
pub struct ContentReport {
    pub version: String,
    pub lessons: usize,
    pub quiz_questions: usize,
    pub exercises: usize,
    pub problems: usize,
    pub tracks: Vec<TrackStats>,
    pub problem_stats: Vec<ProblemStats>,
}

#[derive(Debug, Serialize, FromQueryResult)]
pub struct UsageDay {
    pub day: NaiveDate,
    pub users: i64,
    pub requests: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_read_tokens: i64,
}

#[derive(Debug, Serialize, FromQueryResult)]
pub struct UsageUser {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub requests: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
}

#[derive(Debug, Serialize)]
pub struct UsageReport {
    pub days: i32,
    pub by_day: Vec<UsageDay>,
    pub top_users: Vec<UsageUser>,
}

pub(crate) fn stmt(sql: &str, values: impl IntoIterator<Item = Value>) -> Statement {
    Statement::from_sql_and_values(DatabaseBackend::Postgres, sql, values)
}

/// `%text%` for ILIKE, with the pattern characters in `text` escaped.
fn contains_pattern(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('%');
    for c in text.chars() {
        if matches!(c, '\\' | '%' | '_') {
            out.push('\\');
        }
        out.push(c);
    }
    out.push('%');
    out
}

/// Records one admin action. Generic over the connection so a change and
/// its record commit together.
pub(crate) async fn record<C: ConnectionTrait>(
    conn: &C,
    actor: &Actor,
    action: &str,
    target: Option<Uuid>,
    detail: serde_json::Value,
) -> AppResult<()> {
    conn.execute_raw(stmt(
        "INSERT INTO admin_audit (id, actor_id, actor_label, action, target_id, detail) VALUES ($1, $2, $3, $4, $5, $6)",
        [
            Uuid::now_v7().into(),
            actor.id().into(),
            actor.label().into(),
            action.into(),
            target.into(),
            detail.into(),
        ],
    ))
    .await?;
    Ok(())
}

/// Changes a learner's role. An admin cannot take away their own role, so
/// the last admin can never lock everyone out by accident. The change takes
/// effect on the account's next request: sessions load the role each time.
pub async fn set_role(db: &DatabaseConnection, actor: &Actor, id: Uuid, role: &str) -> AppResult<Account> {
    if !ROLES.contains(&role) {
        return Err(AppError::validation(format!("role must be one of {}", ROLES.join(", "))));
    }
    if actor.id() == Some(id) && role != "admin" {
        return Err(AppError::Conflict("you cannot remove your own admin role; ask another admin".into()));
    }
    let txn = db.begin().await?;
    let user = Users::find_by_id(id).lock_exclusive().one(&txn).await?.ok_or(AppError::NotFound("user"))?;
    if user.role == role {
        txn.rollback().await?;
        return Ok(user.into());
    }
    let from = user.role.clone();
    let mut active: users::ActiveModel = user.into();
    active.role = Set(role.to_string());
    active.updated_at = Set(Utc::now());
    let user = active.update(&txn).await?;
    record(&txn, actor, "set_role", Some(id), serde_json::json!({ "from": from, "to": role })).await?;
    txn.commit().await?;
    Ok(user.into())
}

/// For the operator API and the command line, which know accounts by email:
/// how the first admin is made.
pub async fn set_role_by_email(db: &DatabaseConnection, actor: &Actor, email: &str, role: &str) -> AppResult<Account> {
    let email = email.trim().to_lowercase();
    let user =
        Users::find().filter(users::Column::Email.eq(&email)).one(db).await?.ok_or(AppError::NotFound("user"))?;
    set_role(db, actor, user.id, role).await
}

#[derive(Clone)]
pub struct AdminService {
    db: DatabaseConnection,
    curriculum: Arc<Curriculum>,
    progress: ProgressService,
}

impl AdminService {
    pub fn new(db: DatabaseConnection, curriculum: Arc<Curriculum>) -> Self {
        let progress = ProgressService::new(db.clone(), curriculum.clone());
        Self { db, curriculum, progress }
    }

    pub async fn overview(&self) -> AppResult<Overview> {
        let totals = Totals::find_by_statement(stmt(
            "SELECT \
               (SELECT count(*) FROM users)::bigint AS users, \
               (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days')::bigint AS users_new_7d, \
               (SELECT count(*) FROM users WHERE created_at > now() - interval '30 days')::bigint AS users_new_30d, \
               (SELECT count(*) FROM users WHERE email_verified_at IS NOT NULL)::bigint AS users_verified, \
               (SELECT count(*) FROM users WHERE onboarded_at IS NOT NULL)::bigint AS users_onboarded, \
               (SELECT count(*) FROM users WHERE role = 'admin')::bigint AS admins, \
               (SELECT count(DISTINCT user_id) FROM activity_days WHERE day >= current_date - 1)::bigint AS active_1d, \
               (SELECT count(DISTINCT user_id) FROM activity_days WHERE day >= current_date - 7)::bigint AS active_7d, \
               (SELECT count(DISTINCT user_id) FROM activity_days WHERE day >= current_date - 30)::bigint AS active_30d, \
               (SELECT count(*) FROM lesson_progress WHERE status = 'completed')::bigint AS lessons_completed, \
               (SELECT count(*) FROM submissions)::bigint AS submissions, \
               (SELECT count(*) FROM submissions WHERE created_at > now() - interval '7 days')::bigint AS submissions_7d, \
               (SELECT count(*) FROM quiz_attempts)::bigint AS quiz_attempts, \
               (SELECT count(*) FROM interviews)::bigint AS interviews, \
               (SELECT count(*) FROM comments WHERE deleted_at IS NULL)::bigint AS comments, \
               (SELECT count(*) FROM sessions WHERE expires_at > now())::bigint AS live_sessions, \
               (SELECT coalesce(sum(requests), 0) FROM ai_usage WHERE day = current_date)::bigint AS ai_requests_today, \
               (SELECT coalesce(sum(input_tokens), 0) FROM ai_usage WHERE day = current_date)::bigint AS ai_input_tokens_today, \
               (SELECT coalesce(sum(output_tokens), 0) FROM ai_usage WHERE day = current_date)::bigint AS ai_output_tokens_today, \
               (SELECT count(*) FROM content_reports WHERE status = 'open')::bigint AS reports_open",
            [],
        ))
        .one(&self.db)
        .await?
        .ok_or_else(|| AppError::internal("overview returned no row"))?;
        // Signups and submissions by UTC day; active learners by their own
        // calendar day (activity_days is kept in each learner's zone).
        let daily = DayCount::find_by_statement(stmt(
            "SELECT d.day, \
               (SELECT count(*) FROM users WHERE (created_at AT TIME ZONE 'UTC')::date = d.day)::bigint AS signups, \
               (SELECT count(*) FROM activity_days WHERE day = d.day)::bigint AS active, \
               (SELECT count(*) FROM submissions WHERE created_at >= d.day::timestamp AT TIME ZONE 'UTC' \
                  AND created_at < (d.day + 1)::timestamp AT TIME ZONE 'UTC')::bigint AS submissions \
             FROM (SELECT generate_series(current_date - 29, current_date, interval '1 day')::date AS day) d \
             ORDER BY d.day",
            [],
        ))
        .all(&self.db)
        .await?;
        Ok(Overview {
            totals,
            daily,
            lessons_total: self.curriculum.lesson_count(),
            problems_total: self.curriculum.problems.len(),
        })
    }

    pub async fn users(&self, filter: UserFilter, page: Page) -> AppResult<Paged<UserRow>> {
        let (offset, limit) = page.clamped();
        let q = filter
            .q
            .as_deref()
            .map(str::trim)
            .filter(|q| !q.is_empty())
            .map(|q| contains_pattern(&q.chars().take(200).collect::<String>()));
        if let Some(role) = filter.role.as_deref().filter(|r| !r.is_empty())
            && !ROLES.contains(&role)
        {
            return Err(AppError::validation(format!("role must be one of {}", ROLES.join(", "))));
        }
        let role = filter.role.filter(|r| !r.is_empty());
        let invite = filter.invite.map(|i| i.trim().to_ascii_lowercase()).filter(|i| !i.is_empty());
        if invite.as_deref().is_some_and(|i| i.len() != 8 || !i.bytes().all(|b| b.is_ascii_hexdigit())) {
            return Err(AppError::validation("invite must be the 8-character id from the invite list"));
        }
        let filter_sql = "($1::text IS NULL OR u.email ILIKE $1 OR u.display_name ILIKE $1) \
                          AND ($2::text IS NULL OR u.role = $2) \
                          AND ($3::text IS NULL OR r.invite_id = $3)";
        let total: i64 = self
            .db
            .query_one_raw(stmt(
                &format!(
                    "SELECT count(*)::bigint AS n FROM users u \
                     LEFT JOIN invite_redemptions r ON r.user_id = u.id WHERE {filter_sql}"
                ),
                [q.clone().into(), role.clone().into(), invite.clone().into()],
            ))
            .await?
            .map(|r| r.try_get("", "n"))
            .transpose()?
            .unwrap_or(0);
        let items = UserRow::find_by_statement(stmt(
            &format!(
                "SELECT u.id, u.email, u.display_name, u.role, u.target_company, \
                   u.email_verified_at IS NOT NULL AS email_verified, u.onboarded_at IS NOT NULL AS onboarded, \
                   u.created_at, u.last_login_at, \
                   (SELECT max(day) FROM activity_days a WHERE a.user_id = u.id) AS last_active, \
                   (SELECT count(*) FROM lesson_progress p WHERE p.user_id = u.id AND p.status = 'completed')::bigint \
                     AS lessons_completed, \
                   (SELECT count(DISTINCT target_slug) FROM submissions s \
                     WHERE s.user_id = u.id AND s.target_kind = 'problem' AND s.passed)::bigint AS problems_solved, \
                   r.note AS invite_note, r.invite_id \
                 FROM users u LEFT JOIN invite_redemptions r ON r.user_id = u.id \
                 WHERE {filter_sql} ORDER BY {} LIMIT $4 OFFSET $5",
                filter.sort.order_by()
            ),
            [q.into(), role.into(), invite.into(), limit.into(), offset.into()],
        ))
        .all(&self.db)
        .await?;
        Ok(Paged { total, offset, limit, items })
    }

    pub async fn user(&self, id: Uuid) -> AppResult<UserDetail> {
        let user = Users::find_by_id(id).one(&self.db).await?.ok_or(AppError::NotFound("user"))?;
        let by_user = |sql: &str| stmt(sql, [id.into()]);
        let progress = self.progress.summary(id).await?;
        let activity: Vec<NaiveDate> = self
            .db
            .query_all_raw(by_user(
                "SELECT day FROM activity_days WHERE user_id = $1 AND day >= current_date - 182 ORDER BY day",
            ))
            .await?
            .iter()
            .map(|r| r.try_get("", "day"))
            .collect::<Result<_, DbErr>>()?;
        let submissions = SubmissionRow::find_by_statement(by_user(
            "SELECT id, target_kind, target_slug, language, passed, passed_count, total_count, runtime_ms, created_at \
             FROM submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
        ))
        .all(&self.db)
        .await?;
        let quizzes = QuizRow::find_by_statement(by_user(
            "SELECT lesson_slug, source, score, total, created_at FROM quiz_attempts \
             WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
        ))
        .all(&self.db)
        .await?;
        let interviews = InterviewRow::find_by_statement(by_user(
            "SELECT id, kind, assistant_mode, problem_slug, status, score, duration_minutes, started_at, ended_at \
             FROM interviews WHERE user_id = $1 ORDER BY started_at DESC LIMIT 50",
        ))
        .all(&self.db)
        .await?;
        let ai_usage = UsageRow::find_by_statement(by_user(
            "SELECT day, requests::bigint AS requests, input_tokens, output_tokens, cache_read_tokens \
             FROM ai_usage WHERE user_id = $1 AND day > current_date - 30 ORDER BY day DESC",
        ))
        .all(&self.db)
        .await?;
        let sessions = SessionRow::find_by_statement(by_user(
            "SELECT created_at, last_seen_at, expires_at, user_agent FROM sessions \
             WHERE user_id = $1 AND expires_at > now() ORDER BY last_seen_at DESC",
        ))
        .all(&self.db)
        .await?;
        let counts = Counts::find_by_statement(by_user(
            "SELECT \
               (SELECT count(*) FROM comments WHERE user_id = $1 AND deleted_at IS NULL)::bigint AS comments, \
               (SELECT count(*) FROM conversations WHERE user_id = $1)::bigint AS conversations, \
               (SELECT count(*) FROM review_items WHERE user_id = $1)::bigint AS review_items, \
               (SELECT count(*) FROM review_items WHERE user_id = $1 AND due <= current_date)::bigint AS review_due, \
               (SELECT count(*) FROM audio_listens WHERE user_id = $1 AND heard_at IS NOT NULL)::bigint \
                 AS episodes_heard",
        ))
        .one(&self.db)
        .await?
        .ok_or_else(|| AppError::internal("counts returned no row"))?;
        let audit = AuditEntry::find_by_statement(by_user(
            "SELECT a.id, a.actor_id, a.actor_label, a.action, a.target_id, u.email AS target_email, a.detail, \
               a.created_at \
             FROM admin_audit a LEFT JOIN users u ON u.id = a.target_id \
             WHERE a.target_id = $1 ORDER BY a.created_at DESC LIMIT 50",
        ))
        .all(&self.db)
        .await?;
        let invite = InviteSource::find_by_statement(by_user(
            "SELECT invite_id, note, created_at FROM invite_redemptions WHERE user_id = $1",
        ))
        .one(&self.db)
        .await?;
        let reports = super::reports::ReportService::new(self.db.clone(), self.curriculum.clone())
            .list(super::reports::ReportFilter { status: None, reporter: Some(id) }, Page { offset: 0, limit: 50 })
            .await?
            .items;
        Ok(UserDetail {
            invite,
            reports,
            account: user.into(),
            progress,
            activity,
            submissions,
            quizzes,
            interviews,
            ai_usage,
            sessions,
            counts,
            audit,
        })
    }

    /// See [`set_role`].
    pub async fn set_role(&self, actor: &Actor, id: Uuid, role: &str) -> AppResult<Account> {
        set_role(&self.db, actor, id, role).await
    }

    /// See [`set_role_by_email`].
    pub async fn set_role_by_email(&self, actor: &Actor, email: &str, role: &str) -> AppResult<Account> {
        set_role_by_email(&self.db, actor, email, role).await
    }

    /// Ends every session of the account. Returns how many there were.
    pub async fn sign_out_everywhere(&self, actor: &Actor, id: Uuid) -> AppResult<u64> {
        let txn = self.db.begin().await?;
        Users::find_by_id(id).one(&txn).await?.ok_or(AppError::NotFound("user"))?;
        let n = txn.execute_raw(stmt("DELETE FROM sessions WHERE user_id = $1", [id.into()])).await?.rows_affected();
        record(&txn, actor, "sign_out_everywhere", Some(id), serde_json::json!({ "sessions": n })).await?;
        txn.commit().await?;
        Ok(n)
    }

    /// Deletes the account and everything it owns, as the learner deleting
    /// it themselves would (`AuthService::delete_account`). Admins are
    /// refused: remove the role first, deliberately.
    pub async fn delete_user(&self, actor: &Actor, id: Uuid) -> AppResult<()> {
        if actor.id() == Some(id) {
            return Err(AppError::Conflict("delete your own account from your profile".into()));
        }
        let txn = self.db.begin().await?;
        let user = Users::find_by_id(id).lock_exclusive().one(&txn).await?.ok_or(AppError::NotFound("user"))?;
        if user.is_admin() {
            return Err(AppError::Conflict("this account is an admin; remove the admin role first".into()));
        }
        let joined = user.created_at;
        Users::delete_by_id(id).exec(&txn).await?;
        record(&txn, actor, "delete_user", Some(id), serde_json::json!({ "joined": joined })).await?;
        txn.commit().await?;
        Ok(())
    }

    /// Records that an admin sent a password-reset link, and returns the
    /// address to send it to.
    pub async fn password_reset_requested(&self, actor: &Actor, id: Uuid) -> AppResult<String> {
        let user = Users::find_by_id(id).one(&self.db).await?.ok_or(AppError::NotFound("user"))?;
        record(&self.db, actor, "send_password_reset", Some(id), serde_json::json!({})).await?;
        Ok(user.email)
    }

    /// One graded attempt with its code, for an admin who opened it (to
    /// answer a question about it, or check a problem report). Every opening
    /// is audited, naming the attempt but never holding the code.
    pub async fn submission_code(&self, actor: &Actor, id: Uuid) -> AppResult<SubmissionCode> {
        let s = Submissions::find_by_id(id).one(&self.db).await?.ok_or(AppError::NotFound("submission"))?;
        record(
            &self.db,
            actor,
            "view_submission_code",
            Some(s.user_id),
            serde_json::json!({ "submission": s.id, "target_kind": s.target_kind, "target_slug": s.target_slug }),
        )
        .await?;
        Ok(SubmissionCode {
            id: s.id,
            user_id: s.user_id,
            target_kind: s.target_kind,
            target_slug: s.target_slug,
            language: s.language,
            code: s.code,
            passed: s.passed,
            passed_count: s.passed_count,
            total_count: s.total_count,
            runtime_ms: s.runtime_ms,
            results: s.results,
            created_at: s.created_at,
        })
    }

    /// Records that an admin took a password-reset link to hand over
    /// themselves (when email is not set up, or the learner cannot get it),
    /// and returns the address to issue it for.
    pub async fn password_reset_link_requested(&self, actor: &Actor, id: Uuid) -> AppResult<String> {
        let user = Users::find_by_id(id).one(&self.db).await?.ok_or(AppError::NotFound("user"))?;
        record(&self.db, actor, "copy_password_reset_link", Some(id), serde_json::json!({})).await?;
        Ok(user.email)
    }

    pub async fn comments(&self, filter: CommentFilter, page: Page) -> AppResult<Paged<CommentRow>> {
        let (offset, limit) = page.clamped();
        let total: i64 = self
            .db
            .query_one_raw(stmt(
                "SELECT count(*)::bigint AS n FROM comments WHERE $1 OR deleted_at IS NULL",
                [filter.include_deleted.into()],
            ))
            .await?
            .map(|r| r.try_get("", "n"))
            .transpose()?
            .unwrap_or(0);
        let items = CommentRow::find_by_statement(stmt(
            "SELECT c.id, c.user_id AS author_id, u.email AS author_email, u.display_name AS author_name, \
               c.target_kind, c.target_slug, c.parent_id, c.body, c.deleted_at IS NOT NULL AS deleted, c.created_at \
             FROM comments c LEFT JOIN users u ON u.id = c.user_id \
             WHERE $1 OR c.deleted_at IS NULL ORDER BY c.created_at DESC LIMIT $2 OFFSET $3",
            [filter.include_deleted.into(), limit.into(), offset.into()],
        ))
        .all(&self.db)
        .await?;
        Ok(Paged { total, offset, limit, items })
    }

    /// Removes a comment's text, as its author deleting it would; replies
    /// keep their place. The log records where it was, not what it said.
    pub async fn delete_comment(&self, actor: &Actor, id: Uuid) -> AppResult<()> {
        let txn = self.db.begin().await?;
        let row = txn
            .query_one_raw(stmt(
                "UPDATE comments SET body = '', deleted_at = now(), updated_at = now() \
                 WHERE id = $1 AND deleted_at IS NULL RETURNING user_id, target_kind, target_slug",
                [id.into()],
            ))
            .await?;
        let Some(row) = row else {
            txn.rollback().await?;
            return match Comments::find_by_id(id).one(&self.db).await? {
                Some(_) => Ok(()),
                None => Err(AppError::NotFound("comment")),
            };
        };
        let author: Option<Uuid> = row.try_get("", "user_id")?;
        let detail = serde_json::json!({
            "comment": id,
            "target_kind": row.try_get::<String>("", "target_kind")?,
            "target_slug": row.try_get::<String>("", "target_slug")?,
        });
        record(&txn, actor, "delete_comment", author, detail).await?;
        txn.commit().await?;
        Ok(())
    }

    pub async fn record_invite_created(
        &self,
        actor: &Actor,
        uses: i32,
        days: Option<i64>,
        note: &str,
    ) -> AppResult<()> {
        let detail =
            serde_json::json!({ "uses": uses, "days": days, "note": note.chars().take(200).collect::<String>() });
        record(&self.db, actor, "create_invite", None, detail).await
    }

    pub async fn record_invite_revoked(&self, actor: &Actor, id: &str, revoked: u64) -> AppResult<()> {
        record(&self.db, actor, "revoke_invite", None, serde_json::json!({ "invite": id, "revoked": revoked })).await
    }

    pub async fn audit(&self, page: Page) -> AppResult<Paged<AuditEntry>> {
        let (offset, limit) = page.clamped();
        let total: i64 = self
            .db
            .query_one_raw(stmt("SELECT count(*)::bigint AS n FROM admin_audit", []))
            .await?
            .map(|r| r.try_get("", "n"))
            .transpose()?
            .unwrap_or(0);
        let items = AuditEntry::find_by_statement(stmt(
            "SELECT a.id, a.actor_id, a.actor_label, a.action, a.target_id, u.email AS target_email, a.detail, \
               a.created_at \
             FROM admin_audit a LEFT JOIN users u ON u.id = a.target_id \
             ORDER BY a.created_at DESC LIMIT $1 OFFSET $2",
            [limit.into(), offset.into()],
        ))
        .all(&self.db)
        .await?;
        Ok(Paged { total, offset, limit, items })
    }

    /// AI usage over the last `days` UTC days (1 to 90, which is as long as
    /// the counters are kept).
    pub async fn ai_usage(&self, days: i32) -> AppResult<UsageReport> {
        if !(1..=90).contains(&days) {
            return Err(AppError::validation("days must be between 1 and 90"));
        }
        let by_day = UsageDay::find_by_statement(stmt(
            "SELECT day, count(*)::bigint AS users, sum(requests)::bigint AS requests, \
               sum(input_tokens)::bigint AS input_tokens, sum(output_tokens)::bigint AS output_tokens, \
               sum(cache_read_tokens)::bigint AS cache_read_tokens \
             FROM ai_usage WHERE day > current_date - $1 GROUP BY day ORDER BY day",
            [days.into()],
        ))
        .all(&self.db)
        .await?;
        let top_users = UsageUser::find_by_statement(stmt(
            "SELECT u.id, u.email, u.display_name, sum(a.requests)::bigint AS requests, \
               sum(a.input_tokens)::bigint AS input_tokens, sum(a.output_tokens)::bigint AS output_tokens \
             FROM ai_usage a JOIN users u ON u.id = a.user_id WHERE a.day > current_date - $1 \
             GROUP BY u.id, u.email, u.display_name ORDER BY sum(a.output_tokens) DESC LIMIT 20",
            [days.into()],
        ))
        .all(&self.db)
        .await?;
        Ok(UsageReport { days, by_day, top_users })
    }

    /// The whole curriculum with how learners use each lesson and problem.
    pub async fn content(&self) -> AppResult<ContentReport> {
        let counts = |sql: &'static str| async move {
            let rows = self.db.query_all_raw(stmt(sql, [])).await?;
            rows.iter()
                .map(|r| {
                    Ok((r.try_get::<String>("", "slug")?, (r.try_get::<i64>("", "a")?, r.try_get::<i64>("", "b")?)))
                })
                .collect::<Result<HashMap<String, (i64, i64)>, DbErr>>()
                .map_err(AppError::from)
        };
        let progress = counts(
            "SELECT lesson_slug AS slug, count(*) FILTER (WHERE status <> 'completed')::bigint AS a, \
               count(*) FILTER (WHERE status = 'completed')::bigint AS b \
             FROM lesson_progress GROUP BY lesson_slug",
        )
        .await?;
        let quizzes = counts(
            "SELECT lesson_slug AS slug, count(*)::bigint AS a, count(DISTINCT user_id)::bigint AS b \
             FROM quiz_attempts GROUP BY lesson_slug",
        )
        .await?;
        let quiz_avg: HashMap<String, f64> = self
            .db
            .query_all_raw(stmt(
                "SELECT lesson_slug AS slug, avg(score::float8 / total)::float8 AS avg \
                 FROM quiz_attempts WHERE total > 0 GROUP BY lesson_slug",
                [],
            ))
            .await?
            .iter()
            .map(|r| Ok((r.try_get("", "slug")?, r.try_get("", "avg")?)))
            .collect::<Result<_, DbErr>>()?;
        let exercises = counts(
            "SELECT split_part(target_slug, '#', 1) AS slug, count(*)::bigint AS a, \
               count(DISTINCT user_id)::bigint AS b \
             FROM submissions WHERE target_kind = 'exercise' GROUP BY 1",
        )
        .await?;
        let problems = self
            .db
            .query_all_raw(stmt(
                "SELECT target_slug AS slug, count(*)::bigint AS attempts, count(DISTINCT user_id)::bigint AS learners, \
                   count(DISTINCT user_id) FILTER (WHERE passed)::bigint AS solvers \
                 FROM submissions WHERE target_kind = 'problem' GROUP BY target_slug",
                [],
            ))
            .await?
            .iter()
            .map(|r| {
                Ok((
                    r.try_get::<String>("", "slug")?,
                    (r.try_get::<i64>("", "attempts")?, r.try_get::<i64>("", "learners")?, r.try_get::<i64>("", "solvers")?),
                ))
            })
            .collect::<Result<HashMap<_, _>, DbErr>>()?;
        let comments = counts(
            "SELECT target_kind || ':' || target_slug AS slug, count(*)::bigint AS a, 0::bigint AS b \
             FROM comments WHERE deleted_at IS NULL GROUP BY 1",
        )
        .await?;
        let get = |m: &HashMap<String, (i64, i64)>, k: &str| m.get(k).copied().unwrap_or((0, 0));

        let (mut quiz_questions, mut exercise_count) = (0, 0);
        let tracks = self
            .curriculum
            .tracks
            .iter()
            .map(|t| TrackStats {
                slug: t.slug.clone(),
                title: t.title.clone(),
                phase: t.phase,
                lesson_count: t.lesson_count,
                estimated_hours: t.estimated_hours,
                modules: t
                    .modules
                    .iter()
                    .map(|m| ModuleStats {
                        slug: m.slug.clone(),
                        title: m.title.clone(),
                        estimated_hours: m.estimated_hours,
                        lessons: m
                            .lessons
                            .iter()
                            .map(|l| {
                                let full = self.curriculum.lesson(&l.slug);
                                let questions = full.as_ref().map_or(0, |f| f.quiz_question_count);
                                let exercise_n = full.as_ref().map_or(0, |f| f.exercises.len());
                                quiz_questions += questions;
                                exercise_count += exercise_n;
                                let (started, completed) = get(&progress, &l.slug);
                                let (quiz_attempts, quiz_learners) = get(&quizzes, &l.slug);
                                LessonStats {
                                    slug: l.slug.clone(),
                                    title: l.title.clone(),
                                    minutes: l.minutes,
                                    difficulty: l.difficulty.clone(),
                                    has_quiz: l.has_quiz,
                                    has_viz: l.has_viz,
                                    quiz_questions: questions,
                                    exercises: exercise_n,
                                    started: started + completed,
                                    completed,
                                    quiz_attempts,
                                    quiz_learners,
                                    quiz_avg: quiz_avg.get(&l.slug).copied(),
                                    // Exercise slugs are `<lesson>#<id>`; the query groups by lesson.
                                    exercise_attempts: get(&exercises, &l.slug).0,
                                    comments: get(&comments, &format!("lesson:{}", l.slug)).0,
                                }
                            })
                            .collect(),
                    })
                    .collect(),
            })
            .collect();
        let problem_stats = self
            .curriculum
            .problems
            .iter()
            .map(|p| {
                let (attempts, learners, solvers) = problems.get(&p.slug).copied().unwrap_or((0, 0, 0));
                ProblemStats {
                    slug: p.slug.clone(),
                    title: p.title.clone(),
                    difficulty: p.difficulty.clone(),
                    patterns: p.patterns.clone(),
                    tests: p.tests.len(),
                    has_walkthrough: self.curriculum.solution_trace(&p.slug).is_some(),
                    attempts,
                    learners,
                    solvers,
                    comments: get(&comments, &format!("problem:{}", p.slug)).0,
                }
            })
            .collect();
        Ok(ContentReport {
            version: self.curriculum.version.clone(),
            lessons: self.curriculum.lesson_count(),
            quiz_questions,
            exercises: exercise_count,
            problems: self.curriculum.problems.len(),
            tracks,
            problem_stats,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_text_cannot_inject_pattern_characters() {
        assert_eq!(contains_pattern("ann"), "%ann%");
        assert_eq!(contains_pattern("100%_a\\b"), "%100\\%\\_a\\\\b%");
    }

    #[test]
    fn pages_are_clamped() {
        assert_eq!(Page { offset: 5, limit: 0 }.clamped(), (5, 1));
        assert_eq!(Page { offset: 0, limit: 10_000 }.clamped(), (0, 200));
    }
}
