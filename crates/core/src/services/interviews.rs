use std::sync::Arc;

use chrono::Utc;
use sea_orm::sea_query::Expr;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::content::Curriculum;
use crate::entities::interviews;
use crate::entities::prelude::*;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterviewKind {
    Coding,
    SystemDesign,
    Behavioral,
}

impl InterviewKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Coding => "coding",
            Self::SystemDesign => "system_design",
            Self::Behavioral => "behavioral",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "coding" => Some(Self::Coding),
            "system_design" => Some(Self::SystemDesign),
            "behavioral" => Some(Self::Behavioral),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssistantMode {
    /// Classic interview: no AI help. The coach is locked out.
    Solo,
    /// "AI-native" interview: the candidate may use an AI pair-programmer and
    /// is judged on direction, verification and judgement, not typing.
    Assisted,
}

impl AssistantMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Solo => "solo",
            Self::Assisted => "assisted",
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct StartInterview {
    pub kind: InterviewKind,
    pub assistant_mode: AssistantMode,
    /// For coding interviews: pick a specific problem, or let the service choose.
    pub problem_slug: Option<String>,
    pub difficulty: Option<String>,
    pub duration_minutes: Option<i16>,
    pub language: Option<String>,
}

/// One entry in the interview transcript.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptEntry {
    pub role: String, // "interviewer" | "candidate" | "assistant" | "system"
    pub content: String,
    pub at: chrono::DateTime<Utc>,
}

const MAX_TRANSCRIPT_ENTRIES: usize = 400;

#[derive(Clone)]
pub struct InterviewService {
    db: DatabaseConnection,
    curriculum: Arc<Curriculum>,
}

/// System-design prompts. Kept in code (not content) because they are short
/// and the interviewer prompt references them directly.
pub const SYSTEM_DESIGN_PROMPTS: &[(&str, &str)] = &[
    (
        "video-streaming",
        "Design the playback path for a Netflix-scale video streaming service: catalogue browse → play → adaptive bitrate delivery, for 200M subscribers across the globe.",
    ),
    (
        "url-shortener",
        "Design a URL shortener handling 100M new links/month and 10B redirects/month with sub-50ms p99 redirect latency.",
    ),
    (
        "news-feed",
        "Design a social news feed (fan-out, ranking, and pagination) for 500M users where the median user follows 300 accounts.",
    ),
    (
        "chat",
        "Design a real-time messaging system supporting 1:1 and group chat, delivery receipts, and offline users, at WhatsApp scale.",
    ),
    (
        "rate-limiter",
        "Design a distributed rate limiter used by an API gateway across 50 regions, supporting per-user and per-endpoint limits.",
    ),
    (
        "metrics",
        "Design a metrics ingestion and query system (like Datadog) that ingests 10M data points/second and serves dashboards with 1s resolution.",
    ),
    (
        "search-autocomplete",
        "Design typeahead search suggestions for a product with 1B queries/day and a p99 latency budget of 100ms.",
    ),
    (
        "ride-matching",
        "Design the driver–rider matching and location tracking system for a ride-hailing app in a city with 100k concurrent drivers.",
    ),
    (
        "payments",
        "Design a payment processing system with exactly-once charge semantics, idempotent retries, and reconciliation with external providers.",
    ),
    (
        "notifications",
        "Design a notification platform delivering push, email, and SMS with per-user preferences, rate limits, and at-least-once delivery.",
    ),
];

pub const BEHAVIORAL_PROMPTS: &[&str] = &[
    "Tell me about a time you disagreed with a technical decision made by someone more senior. What did you do, and what happened?",
    "Describe the most complex system you have owned end to end. What would you change if you rebuilt it today?",
    "Tell me about a production incident you were responsible for. Walk me through detection, mitigation, and what changed afterwards.",
    "Describe a time you had to deliver hard feedback to a peer. How did you approach it?",
    "Tell me about a project where the requirements kept changing. How did you keep the team effective?",
    "Describe a situation where you chose the boring technology over the exciting one, or vice versa, and why.",
    "Tell me about a time you had to influence a decision without having authority over the people involved.",
    "What is a technical bet you made that turned out wrong? What did you learn?",
];

impl InterviewService {
    pub fn new(db: DatabaseConnection, curriculum: Arc<Curriculum>) -> Self {
        Self { db, curriculum }
    }

    pub async fn start(&self, user_id: Uuid, input: StartInterview) -> AppResult<interviews::Model> {
        // Validate and resolve everything first: a bad request must not
        // abandon the interview the learner already has in progress.
        let duration = input.duration_minutes.unwrap_or(match input.kind {
            InterviewKind::Coding => 45,
            InterviewKind::SystemDesign => 45,
            InterviewKind::Behavioral => 30,
        });
        if !(10..=90).contains(&duration) {
            return Err(AppError::validation("duration must be 10–90 minutes"));
        }

        let (problem_slug, prompt) = match input.kind {
            InterviewKind::Coding => {
                let problem = match &input.problem_slug {
                    Some(slug) => self.curriculum.problem(slug).ok_or(AppError::NotFound("problem"))?,
                    None => self.pick_problem(input.difficulty.as_deref(), user_id).await?,
                };
                (Some(problem.slug.clone()), problem.statement.clone())
            }
            InterviewKind::SystemDesign => {
                let idx = pseudo_random(SYSTEM_DESIGN_PROMPTS.len());
                (Some(SYSTEM_DESIGN_PROMPTS[idx].0.to_string()), SYSTEM_DESIGN_PROMPTS[idx].1.to_string())
            }
            InterviewKind::Behavioral => {
                (None, BEHAVIORAL_PROMPTS[pseudo_random(BEHAVIORAL_PROMPTS.len())].to_string())
            }
        };

        let now = Utc::now();
        let model = interviews::ActiveModel {
            id: Set(Uuid::now_v7()),
            user_id: Set(user_id),
            kind: Set(input.kind.as_str().into()),
            assistant_mode: Set(input.assistant_mode.as_str().into()),
            problem_slug: Set(problem_slug),
            prompt: Set(prompt),
            duration_minutes: Set(duration),
            status: Set("active".into()),
            transcript: Set(serde_json::json!([])),
            final_code: Set(None),
            language: Set(input.language),
            evaluation: Set(None),
            score: Set(None),
            started_at: Set(now),
            ended_at: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        };
        // One active interview per user: abandon the old one and insert the new
        // one atomically. The partial unique index (m0007) turns a concurrent
        // double-start into a clean conflict instead of two active rows.
        let txn = self.db.begin().await?;
        Interviews::update_many()
            .col_expr(interviews::Column::Status, Expr::value("abandoned"))
            .col_expr(interviews::Column::EndedAt, Expr::value(Utc::now()))
            .filter(interviews::Column::UserId.eq(user_id))
            .filter(interviews::Column::Status.eq("active"))
            .exec(&txn)
            .await?;
        let created = model.insert(&txn).await.map_err(|e| match e.sql_err() {
            Some(SqlErr::UniqueConstraintViolation(_)) => {
                AppError::Conflict("another interview was started at the same moment; try again".into())
            }
            _ => AppError::Database(e),
        })?;
        txn.commit().await?;
        Ok(created)
    }

    async fn pick_problem(&self, difficulty: Option<&str>, user_id: Uuid) -> AppResult<Arc<crate::content::Problem>> {
        use crate::content::Difficulty;
        let want = match difficulty {
            Some("easy") => Some(Difficulty::Easy),
            Some("hard") => Some(Difficulty::Hard),
            Some("medium") => Some(Difficulty::Medium),
            _ => None,
        };
        // Prefer problems this user has never been interviewed on.
        let seen: Vec<String> = Interviews::find()
            .select_only()
            .column(interviews::Column::ProblemSlug)
            .filter(interviews::Column::UserId.eq(user_id))
            .filter(interviews::Column::ProblemSlug.is_not_null())
            .into_tuple::<Option<String>>()
            .all(&self.db)
            .await?
            .into_iter()
            .flatten()
            .collect();
        let candidates: Vec<&Arc<crate::content::Problem>> = self
            .curriculum
            .problems
            .iter()
            .filter(|p| want.as_ref().is_none_or(|d| &p.difficulty == d))
            .filter(|p| !seen.contains(&p.slug))
            .collect();
        let pool: Vec<&Arc<crate::content::Problem>> = if candidates.is_empty() {
            self.curriculum.problems.iter().filter(|p| want.as_ref().is_none_or(|d| &p.difficulty == d)).collect()
        } else {
            candidates
        };
        pool.get(pseudo_random(pool.len().max(1))).map(|p| (*p).clone()).ok_or(AppError::NotFound("problem"))
    }

    pub async fn get(&self, user_id: Uuid, id: Uuid) -> AppResult<interviews::Model> {
        let i = Interviews::find_by_id(id).one(&self.db).await?.ok_or(AppError::NotFound("interview"))?;
        if i.user_id != user_id {
            return Err(AppError::NotFound("interview"));
        }
        Ok(i)
    }

    pub async fn list(&self, user_id: Uuid) -> AppResult<Vec<interviews::Model>> {
        Ok(Interviews::find()
            .filter(interviews::Column::UserId.eq(user_id))
            .order_by_desc(interviews::Column::StartedAt)
            .limit(50)
            .all(&self.db)
            .await?)
    }

    pub fn transcript(model: &interviews::Model) -> Vec<TranscriptEntry> {
        serde_json::from_value(model.transcript.clone()).unwrap_or_default()
    }

    /// Appends entries (and optionally the latest code) in one statement.
    ///
    /// The interviewer reply and an assistant reply can be persisted by two
    /// background tasks at the same moment. A read-modify-write of the JSON
    /// array would let one overwrite the other; `transcript || $2` appends
    /// server-side, and the length cap is enforced in the same statement.
    pub async fn append_transcript(
        &self,
        model: interviews::Model,
        entries: Vec<TranscriptEntry>,
        code: Option<String>,
    ) -> AppResult<interviews::Model> {
        if code.as_ref().is_some_and(|c| c.len() > 64 * 1024) {
            return Err(AppError::validation("code exceeds 64 KiB"));
        }
        let new_entries = serde_json::to_value(&entries).map_err(AppError::internal)?;
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE interviews
               SET transcript = transcript || $2::jsonb,
                   final_code = COALESCE($3, final_code),
                   updated_at = now()
             WHERE id = $1
               AND jsonb_array_length(transcript) + jsonb_array_length($2::jsonb) <= $4
            RETURNING *
            "#,
            [model.id.into(), new_entries.into(), code.into(), (MAX_TRANSCRIPT_ENTRIES as i32).into()],
        );
        Interviews::find()
            .from_raw_sql(stmt)
            .one(&self.db)
            .await?
            .ok_or_else(|| AppError::validation("interview transcript is too long"))
    }

    /// True while the user has a solo interview in progress (within its time
    /// box plus a grace period, so an abandoned tab cannot lock the coach
    /// forever). Used to enforce "no AI help" on the server, not just the UI.
    pub async fn has_active_solo(&self, user_id: Uuid) -> AppResult<bool> {
        let active = Interviews::find()
            .filter(interviews::Column::UserId.eq(user_id))
            .filter(interviews::Column::Status.eq("active"))
            .filter(interviews::Column::AssistantMode.eq("solo"))
            .all(&self.db)
            .await?;
        let now = Utc::now();
        Ok(active.iter().any(|i| now < i.started_at + chrono::Duration::minutes(i.duration_minutes as i64 + 15)))
    }

    pub async fn finish(
        &self,
        model: interviews::Model,
        evaluation: serde_json::Value,
        score: i16,
        status: &str,
    ) -> AppResult<interviews::Model> {
        let mut active: interviews::ActiveModel = model.into();
        active.evaluation = Set(Some(evaluation));
        active.score = Set(Some(score));
        active.status = Set(status.into());
        active.ended_at = Set(Some(Utc::now()));
        active.updated_at = Set(Utc::now());
        Ok(active.update(&self.db).await?)
    }
}

fn pseudo_random(n: usize) -> usize {
    use rand::RngExt;
    if n == 0 { 0 } else { rand::rng().random_range(0..n) }
}
