//! Per-user daily AI budgets.
//!
//! Every model call reserves a request slot up front (`check_and_reserve`)
//! and records actual usage afterwards (`record`). Limits are per UTC day.
//! Because this is the only place that touches `ai_usage`, changing the
//! policy (e.g. per-plan tiers) is a one-file change.
//!
//! The reservation is one conditional upsert: the increment only happens if
//! the row is still under every limit, and `RETURNING` tells us whether it
//! did. A read-then-write version would let N concurrent requests all read
//! "99 of 100" and all proceed.
//!
//! The input limit is in *billed* input tokens: a cache write costs 1.25x an
//! ordinary input token and a cache read 0.1x, so both count at that weight.
//! Counting only uncached input would leave cache writes, the most expensive
//! input of all, outside the budget.
use chrono::{Duration, Utc};
use sea_orm::sea_query;
use sea_orm::sea_query::Expr;
use sea_orm::*;
use serde::Serialize;
use uuid::Uuid;

use super::anthropic::Usage;
use crate::entities::ai_usage;
use crate::entities::prelude::*;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
pub struct BudgetStatus {
    pub requests_used: i32,
    pub requests_limit: i32,
    pub input_tokens_used: i64,
    pub input_tokens_limit: i64,
    pub output_tokens_used: i64,
    pub output_tokens_limit: i64,
    pub cache_read_tokens: i64,
}

#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub daily_requests: i32,
    pub daily_input_tokens: i64,
    pub daily_output_tokens: i64,
}

/// Billed input tokens, in SQL over `ai_usage` columns (integer maths).
const BILLED_INPUT_SQL: &str =
    "(ai_usage.input_tokens + ai_usage.cache_write_tokens * 5 / 4 + ai_usage.cache_read_tokens / 10)";

fn billed_input(row: &ai_usage::Model) -> i64 {
    row.input_tokens + row.cache_write_tokens * 5 / 4 + row.cache_read_tokens / 10
}

/// Seconds until the budgets reset at the next UTC midnight.
fn seconds_until_reset() -> u64 {
    let now = Utc::now();
    let midnight = (now.date_naive() + Duration::days(1)).and_hms_opt(0, 0, 0).expect("valid time").and_utc();
    Ord::max(u64::try_from((midnight - now).num_seconds()).unwrap_or(0), 1)
}

#[derive(Clone)]
pub struct BudgetService {
    db: DatabaseConnection,
    limits: Limits,
}

impl BudgetService {
    pub fn new(db: DatabaseConnection, limits: Limits) -> Self {
        Self { db, limits }
    }

    pub async fn status(&self, user_id: Uuid) -> AppResult<BudgetStatus> {
        let today = Utc::now().date_naive();
        let row = AiUsage::find_by_id((user_id, today)).one(&self.db).await?;
        Ok(BudgetStatus {
            requests_used: row.as_ref().map(|r| r.requests).unwrap_or(0),
            requests_limit: self.limits.daily_requests,
            input_tokens_used: row.as_ref().map(billed_input).unwrap_or(0),
            input_tokens_limit: self.limits.daily_input_tokens,
            output_tokens_used: row.as_ref().map(|r| r.output_tokens).unwrap_or(0),
            output_tokens_limit: self.limits.daily_output_tokens,
            cache_read_tokens: row.as_ref().map(|r| r.cache_read_tokens).unwrap_or(0),
        })
    }

    /// Atomically reserves one request if the user is under every daily
    /// limit; otherwise fails with `RateLimited` (retry at the next reset)
    /// and changes nothing.
    pub async fn check_and_reserve(&self, user_id: Uuid) -> AppResult<()> {
        let today = Utc::now().date_naive();
        let sql = format!(
            r#"
            INSERT INTO ai_usage (user_id, day, input_tokens, output_tokens, requests)
            VALUES ($1, $2, 0, 0, 1)
            ON CONFLICT (user_id, day) DO UPDATE
               SET requests = ai_usage.requests + 1
             WHERE ai_usage.requests < $3
               AND {BILLED_INPUT_SQL} < $4
               AND ai_usage.output_tokens < $5
            RETURNING requests
            "#
        );
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            sql,
            [
                user_id.into(),
                today.into(),
                self.limits.daily_requests.into(),
                self.limits.daily_input_tokens.into(),
                self.limits.daily_output_tokens.into(),
            ],
        );
        match self.db.query_one_raw(stmt).await? {
            Some(_) => Ok(()),
            None => Err(AppError::RateLimited {
                message: format!(
                    "daily AI budget reached ({} requests / {}k output tokens per day). Resets at midnight UTC.",
                    self.limits.daily_requests,
                    self.limits.daily_output_tokens / 1000
                ),
                retry_after_secs: Some(seconds_until_reset()),
            }),
        }
    }

    /// Records actual token usage for a completed (or aborted) call.
    pub async fn record(&self, user_id: Uuid, usage: Usage) -> AppResult<()> {
        let today = Utc::now().date_naive();
        let col = |c: ai_usage::Column| Expr::col((ai_usage::Entity, c));
        AiUsage::insert(ai_usage::ActiveModel {
            user_id: Set(user_id),
            day: Set(today),
            input_tokens: Set(usage.input_tokens),
            output_tokens: Set(usage.output_tokens),
            requests: Set(0),
            cache_read_tokens: Set(usage.cache_read_input_tokens),
            cache_write_tokens: Set(usage.cache_creation_input_tokens),
        })
        .on_conflict(
            sea_query::OnConflict::columns([ai_usage::Column::UserId, ai_usage::Column::Day])
                .value(ai_usage::Column::InputTokens, col(ai_usage::Column::InputTokens).add(usage.input_tokens))
                .value(ai_usage::Column::OutputTokens, col(ai_usage::Column::OutputTokens).add(usage.output_tokens))
                .value(
                    ai_usage::Column::CacheReadTokens,
                    col(ai_usage::Column::CacheReadTokens).add(usage.cache_read_input_tokens),
                )
                .value(
                    ai_usage::Column::CacheWriteTokens,
                    col(ai_usage::Column::CacheWriteTokens).add(usage.cache_creation_input_tokens),
                )
                .to_owned(),
        )
        .exec(&self.db)
        .await?;
        Ok(())
    }
}
