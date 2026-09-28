//! Per-user daily AI budgets, enforced like a card authorisation hold.
//!
//! A call first **reserves** its worst case: one request, its `max_tokens` of
//! output (capped at what is left today) and an estimate of its billed input.
//! The reservation is checked and written under a row lock, so concurrent
//! calls cannot all see "99 of 100" and proceed. When the call finishes it
//! **settles**: the hold is released and the actual usage recorded. A
//! reservation dropped without settling (an error path, a panic) releases
//! itself, and a hold orphaned by a crash expires with the day's row.
//!
//! Before holds, the check ran before a call and the charge after it, so a
//! learner one token under the limit could start a call worth thousands.
//!
//! The input limit is in *billed* input tokens: a cache write costs 1.25x an
//! ordinary input token and a cache read 0.1x, so both count at that weight.
//! Counting only uncached input would leave cache writes, the most expensive
//! input of all, outside the budget.
//!
//! Because this is the only place that touches `ai_usage`, changing the
//! policy (e.g. per-plan tiers) is a one-file change.
use chrono::{Duration, NaiveDate, Utc};
use sea_orm::sea_query::Expr;
use sea_orm::*;
use serde::Serialize;
use uuid::Uuid;

use super::anthropic::{Request, Usage};
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

    /// Reserves one call's worst case, or refuses with `RateLimited` (retry
    /// at the next reset) and changes nothing. On success the request's
    /// `max_tokens` is lowered to the output actually held, so the call
    /// cannot outspend what is left today.
    pub async fn reserve(&self, user_id: Uuid, request: &mut Request) -> AppResult<Reservation> {
        let day = Utc::now().date_naive();
        let input_hold = request.estimated_billed_input();
        let max_output = i64::from(request.max_tokens);
        // Below this much remaining output the call would likely be cut off
        // mid-answer; refusing is better than a truncated reply.
        let min_output = Ord::min((max_output / 4).clamp(256, 4_000), max_output);

        let txn = self.db.begin().await?;
        txn.execute_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "INSERT INTO ai_usage (user_id, day, input_tokens, output_tokens, requests) VALUES ($1, $2, 0, 0, 0) \
             ON CONFLICT (user_id, day) DO NOTHING",
            [user_id.into(), day.into()],
        ))
        .await?;
        // The row lock serialises one learner's concurrent reservations.
        let row = AiUsage::find_by_id((user_id, day))
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::internal("ai_usage row vanished inside its transaction"))?;
        let remaining_output = self.limits.daily_output_tokens - row.output_tokens - row.reserved_output_tokens;
        let within_requests = row.requests < self.limits.daily_requests;
        let within_input =
            billed_input(&row) + row.reserved_input_tokens + input_hold <= self.limits.daily_input_tokens;
        if !within_requests || !within_input || remaining_output < min_output {
            txn.rollback().await?;
            return Err(self.exhausted());
        }
        let output_hold = Ord::min(max_output, remaining_output);
        let col = |c: ai_usage::Column| Expr::col((ai_usage::Entity, c));
        AiUsage::update_many()
            .col_expr(ai_usage::Column::Requests, col(ai_usage::Column::Requests).add(1))
            .col_expr(ai_usage::Column::ReservedInputTokens, col(ai_usage::Column::ReservedInputTokens).add(input_hold))
            .col_expr(
                ai_usage::Column::ReservedOutputTokens,
                col(ai_usage::Column::ReservedOutputTokens).add(output_hold),
            )
            .filter(ai_usage::Column::UserId.eq(user_id))
            .filter(ai_usage::Column::Day.eq(day))
            .exec(&txn)
            .await?;
        txn.commit().await?;

        request.max_tokens = u32::try_from(output_hold).unwrap_or(request.max_tokens);
        Ok(Reservation { budget: self.clone(), user_id, day, input_hold, output_hold, settled: false })
    }

    fn exhausted(&self) -> AppError {
        AppError::RateLimited {
            message: format!(
                "daily AI budget reached ({} requests / {}k output tokens per day). Resets at midnight UTC.",
                self.limits.daily_requests,
                self.limits.daily_output_tokens / 1000
            ),
            retry_after_secs: Some(seconds_until_reset()),
        }
    }

    /// Releases a hold and records what the call actually used, in one
    /// statement on the day the hold was taken.
    async fn apply(
        &self,
        user_id: Uuid,
        day: NaiveDate,
        input_hold: i64,
        output_hold: i64,
        usage: Usage,
    ) -> AppResult<()> {
        self.db
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                UPDATE ai_usage
                   SET reserved_input_tokens  = GREATEST(reserved_input_tokens - $3, 0),
                       reserved_output_tokens = GREATEST(reserved_output_tokens - $4, 0),
                       input_tokens       = input_tokens + $5,
                       output_tokens      = output_tokens + $6,
                       cache_read_tokens  = cache_read_tokens + $7,
                       cache_write_tokens = cache_write_tokens + $8
                 WHERE user_id = $1 AND day = $2
                "#,
                [
                    user_id.into(),
                    day.into(),
                    input_hold.into(),
                    output_hold.into(),
                    usage.input_tokens.into(),
                    usage.output_tokens.into(),
                    usage.cache_read_input_tokens.into(),
                    usage.cache_creation_input_tokens.into(),
                ],
            ))
            .await?;
        Ok(())
    }
}

/// A held slice of today's budget for one call. Settle it with the call's
/// usage as soon as the call returns; if it is dropped unsettled (the call
/// never ran, or an error path returned early), the hold is released with no
/// usage recorded.
#[must_use = "settle the reservation with the call's usage, or drop it to release the hold"]
pub struct Reservation {
    budget: BudgetService,
    user_id: Uuid,
    day: NaiveDate,
    input_hold: i64,
    output_hold: i64,
    settled: bool,
}

impl std::fmt::Debug for Reservation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Reservation")
            .field("user_id", &self.user_id)
            .field("day", &self.day)
            .field("input_hold", &self.input_hold)
            .field("output_hold", &self.output_hold)
            .finish_non_exhaustive()
    }
}

impl Reservation {
    pub async fn settle(mut self, usage: Usage) -> AppResult<()> {
        self.settled = true;
        self.budget.apply(self.user_id, self.day, self.input_hold, self.output_hold, usage).await
    }

    /// The output tokens held (also the call's effective `max_tokens`).
    pub fn output_hold(&self) -> i64 {
        self.output_hold
    }
}

impl Drop for Reservation {
    fn drop(&mut self) {
        if self.settled {
            return;
        }
        let (budget, user_id, day, input_hold, output_hold) =
            (self.budget.clone(), self.user_id, self.day, self.input_hold, self.output_hold);
        match tokio::runtime::Handle::try_current() {
            Ok(handle) => {
                handle.spawn(async move {
                    if let Err(e) = budget.apply(user_id, day, input_hold, output_hold, Usage::default()).await {
                        tracing::error!(error = %e, %user_id, "failed to release an AI budget hold");
                    }
                });
            }
            Err(_) => tracing::warn!(%user_id, "AI budget hold dropped outside a runtime; it expires with the day"),
        }
    }
}
