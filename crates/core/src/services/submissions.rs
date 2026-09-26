use std::sync::Arc;

use chrono::Utc;
use sea_orm::*;
use serde::Deserialize;
use uuid::Uuid;

use crate::content::Curriculum;
use crate::entities::prelude::*;
use crate::entities::submissions;
use crate::error::{AppError, AppResult};

/// Results are computed in the learner's browser (Pyodide / a JS worker) and
/// reported here. This is a learning product, not a judge: we trust the
/// client, cap payload sizes, and validate the referenced target exists.
#[derive(Debug, Deserialize)]
pub struct SubmissionInput {
    pub target_kind: String, // "problem" | "exercise"
    pub target_slug: String,
    pub language: String,
    pub code: String,
    pub passed_count: u16,
    pub total_count: u16,
    pub runtime_ms: Option<u32>,
    pub results: serde_json::Value,
}

#[derive(Clone)]
pub struct SubmissionService {
    db: DatabaseConnection,
    curriculum: Arc<Curriculum>,
}

const MAX_CODE_BYTES: usize = 64 * 1024;

impl SubmissionService {
    pub fn new(db: DatabaseConnection, curriculum: Arc<Curriculum>) -> Self {
        Self { db, curriculum }
    }

    pub async fn record(&self, user_id: Uuid, input: SubmissionInput) -> AppResult<submissions::Model> {
        if input.code.len() > MAX_CODE_BYTES {
            return Err(AppError::validation("code exceeds 64 KiB"));
        }
        if !["python", "javascript", "typescript"].contains(&input.language.as_str()) {
            return Err(AppError::validation("unsupported language"));
        }
        let expected_total = match input.target_kind.as_str() {
            "problem" => self.curriculum.problem(&input.target_slug).map(|p| p.tests.len()),
            "exercise" => {
                // "lesson-slug#exercise-id"
                let (lesson, ex) = input.target_slug.split_once('#').ok_or(AppError::NotFound("exercise"))?;
                self.curriculum
                    .lesson(lesson)
                    .and_then(|l| l.exercises.iter().find(|e| e.id == ex).map(|e| e.tests.len()))
            }
            _ => return Err(AppError::validation("target_kind must be problem or exercise")),
        }
        .ok_or(AppError::NotFound("target"))?;
        if input.total_count as usize != expected_total || input.passed_count > input.total_count {
            return Err(AppError::validation("test counts do not match the target"));
        }
        let results_len = serde_json::to_vec(&input.results).map(|v| v.len()).unwrap_or(0);
        if results_len > 128 * 1024 {
            return Err(AppError::validation("results payload too large"));
        }
        let passed = input.passed_count == input.total_count;
        let model = submissions::ActiveModel {
            id: Set(Uuid::now_v7()),
            user_id: Set(user_id),
            target_kind: Set(input.target_kind),
            target_slug: Set(input.target_slug),
            language: Set(input.language),
            code: Set(input.code),
            passed: Set(passed),
            passed_count: Set(input.passed_count as i16),
            total_count: Set(input.total_count as i16),
            runtime_ms: Set(input.runtime_ms.map(|r| i32::try_from(r).unwrap_or(i32::MAX))),
            results: Set(input.results),
            created_at: Set(Utc::now()),
        };
        Ok(model.insert(&self.db).await?)
    }

    pub async fn list_for_target(&self, user_id: Uuid, target_slug: &str, limit: u64) -> AppResult<Vec<submissions::Model>> {
        Ok(Submissions::find()
            .filter(submissions::Column::UserId.eq(user_id))
            .filter(submissions::Column::TargetSlug.eq(target_slug))
            .order_by_desc(submissions::Column::CreatedAt)
            .limit(limit)
            .all(&self.db)
            .await?)
    }

    /// Latest submission per target for a user — used to restore editor state.
    pub async fn latest(&self, user_id: Uuid, target_slug: &str) -> AppResult<Option<submissions::Model>> {
        Ok(Submissions::find()
            .filter(submissions::Column::UserId.eq(user_id))
            .filter(submissions::Column::TargetSlug.eq(target_slug))
            .order_by_desc(submissions::Column::CreatedAt)
            .one(&self.db)
            .await?)
    }
}
