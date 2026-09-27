//! Per-user daily AI budgets.
//!
//! Every model call reserves a request slot up front (`check`) and records
//! actual token usage afterwards (`record`). Limits are per UTC day. Because
//! this is the only place that touches `ai_usage`, changing the policy (e.g.
//! per-plan tiers) is a one-file change.
use chrono::Utc;
use sea_orm::ExprTrait;
use sea_orm::sea_query;
use sea_orm::sea_query::Expr;
use sea_orm::*;
use serde::Serialize;
use uuid::Uuid;

use crate::entities::ai_usage;
use crate::entities::prelude::*;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
pub struct BudgetStatus {
    pub requests_used: i32,
    pub requests_limit: i32,
    pub output_tokens_used: i64,
    pub output_tokens_limit: i64,
}

#[derive(Clone)]
pub struct BudgetService {
    db: DatabaseConnection,
    daily_requests: i32,
    daily_output_tokens: i64,
}

impl BudgetService {
    pub fn new(db: DatabaseConnection, daily_requests: i32, daily_output_tokens: i64) -> Self {
        Self { db, daily_requests, daily_output_tokens }
    }

    pub async fn status(&self, user_id: Uuid) -> AppResult<BudgetStatus> {
        let today = Utc::now().date_naive();
        let row = AiUsage::find_by_id((user_id, today)).one(&self.db).await?;
        Ok(BudgetStatus {
            requests_used: row.as_ref().map(|r| r.requests).unwrap_or(0),
            requests_limit: self.daily_requests,
            output_tokens_used: row.as_ref().map(|r| r.output_tokens).unwrap_or(0),
            output_tokens_limit: self.daily_output_tokens,
        })
    }

    /// Fails with `RateLimited` if the user is over budget; otherwise counts
    /// one request atomically (upsert with increment).
    pub async fn check_and_reserve(&self, user_id: Uuid) -> AppResult<()> {
        let status = self.status(user_id).await?;
        if status.requests_used >= status.requests_limit {
            return Err(AppError::RateLimited(format!(
                "daily AI request limit reached ({} / day). Resets at midnight UTC.",
                status.requests_limit
            )));
        }
        if status.output_tokens_used >= status.output_tokens_limit {
            return Err(AppError::RateLimited("daily AI token budget reached. Resets at midnight UTC.".into()));
        }
        self.bump(user_id, 0, 0, 1).await
    }

    pub async fn record(&self, user_id: Uuid, input_tokens: i64, output_tokens: i64) -> AppResult<()> {
        self.bump(user_id, input_tokens, output_tokens, 0).await
    }

    async fn bump(&self, user_id: Uuid, input: i64, output: i64, requests: i32) -> AppResult<()> {
        let today = Utc::now().date_naive();
        AiUsage::insert(ai_usage::ActiveModel {
            user_id: Set(user_id),
            day: Set(today),
            input_tokens: Set(input),
            output_tokens: Set(output),
            requests: Set(requests),
        })
        .on_conflict(
            sea_query::OnConflict::columns([ai_usage::Column::UserId, ai_usage::Column::Day])
                .value(
                    ai_usage::Column::InputTokens,
                    Expr::col((ai_usage::Entity, ai_usage::Column::InputTokens)).add(input),
                )
                .value(
                    ai_usage::Column::OutputTokens,
                    Expr::col((ai_usage::Entity, ai_usage::Column::OutputTokens)).add(output),
                )
                .value(
                    ai_usage::Column::Requests,
                    Expr::col((ai_usage::Entity, ai_usage::Column::Requests)).add(requests),
                )
                .to_owned(),
        )
        .exec(&self.db)
        .await?;
        Ok(())
    }
}
