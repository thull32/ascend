use ascend_core::services::progress::{LessonStatus, ModulePreference, ProgressSummary};
use ascend_core::services::quiz::{GradeInput, GradeResult};
use axum::extract::{Path, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde::Deserialize;

use crate::error::ApiResult;
use crate::extractors::{AppJson, CurrentUser};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/progress", get(summary))
        .route("/progress/lessons/{track}/{module}/{lesson}", put(set_lesson))
        .route("/progress/modules/{track}/{module}", put(set_module))
        .route("/quizzes/{track}/{module}/{lesson}/grade", post(grade))
        .route("/quizzes/{track}/{module}/{lesson}/generated", post(record_generated))
}

async fn summary(State(state): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Json<ProgressSummary>> {
    Ok(Json(state.progress.summary(user.id).await?))
}

#[derive(Deserialize)]
struct LessonBody {
    status: LessonStatus,
}

async fn set_lesson(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path((t, m, l)): Path<(String, String, String)>,
    AppJson(body): AppJson<LessonBody>,
) -> ApiResult<Json<ascend_core::entities::lesson_progress::Model>> {
    Ok(Json(state.progress.set_lesson_status(user.id, &format!("{t}/{m}/{l}"), body.status).await?))
}

#[derive(Deserialize)]
struct ModuleBody {
    preference: ModulePreference,
}

async fn set_module(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path((t, m)): Path<(String, String)>,
    AppJson(body): AppJson<ModuleBody>,
) -> ApiResult<Json<serde_json::Value>> {
    state.progress.set_module_preference(user.id, &format!("{t}/{m}"), body.preference).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn grade(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path((t, m, l)): Path<(String, String, String)>,
    AppJson(input): AppJson<GradeInput>,
) -> ApiResult<Json<GradeResult>> {
    Ok(Json(state.quiz.grade(user.id, &format!("{t}/{m}/{l}"), input).await?))
}

#[derive(Deserialize)]
struct GeneratedBody {
    score: usize,
    total: usize,
    answers: serde_json::Value,
}

async fn record_generated(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path((t, m, l)): Path<(String, String, String)>,
    AppJson(body): AppJson<GeneratedBody>,
) -> ApiResult<Json<serde_json::Value>> {
    state.quiz.record_generated(user.id, &format!("{t}/{m}/{l}"), body.score, body.total, body.answers).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
