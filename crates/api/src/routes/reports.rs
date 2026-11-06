//! Learners report problems in lessons and problems; admins work the queue
//! through `routes::admin`.
use ascend_core::services::reports::NewReport;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router, extract::State};

use crate::error::ApiResult;
use crate::extractors::{AppJson, CurrentUser};
use crate::middleware::rate_limit::REPORTS_PER_ACCOUNT;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/reports", post(create))
}

async fn create(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    AppJson(input): AppJson<NewReport>,
) -> ApiResult<Response> {
    if let Some(throttled) = state.limiter.charge(&format!("report:{}", user.id), REPORTS_PER_ACCOUNT).await {
        return Ok(throttled);
    }
    let id = state.reports.create(user.id, input).await?;
    Ok(Json(serde_json::json!({ "id": id })).into_response())
}
