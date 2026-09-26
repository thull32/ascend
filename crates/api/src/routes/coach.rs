//! AI coach endpoints. Streaming replies use SSE (see `sse.rs`).
use ascend_core::ai::coach::{CoachContext, SendMessageInput};
use ascend_core::ai::quiz::GeneratedQuiz;
use axum::extract::{Path, State};
use axum::middleware;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::ApiResult;
use crate::extractors::CurrentUser;
use crate::middleware::rate_limit::{Bucket, limit};
use crate::routes::sse;
use crate::state::AppState;

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/coach/status", get(status))
        .route("/coach/conversations", get(list).post(create))
        .route("/coach/conversations/{id}", get(detail).delete(remove))
        .route("/coach/conversations/{id}/messages", post(send))
        .route("/coach/quiz/{track}/{module}/{lesson}", post(generate_quiz))
        .layer(middleware::from_fn_with_state(state, |s, r, n| limit(Bucket::Ai, s, r, n)))
}

#[derive(Serialize)]
struct Status {
    enabled: bool,
    model: String,
    budget: Option<ascend_core::ai::budget::BudgetStatus>,
}

async fn status(State(state): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Json<Status>> {
    let budget = if state.coach.enabled() { Some(state.coach.budget().status(user.id).await?) } else { None };
    Ok(Json(Status { enabled: state.coach.enabled(), model: state.coach.model().to_string(), budget }))
}

async fn list(State(state): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Json<Vec<ascend_core::entities::conversations::Model>>> {
    Ok(Json(state.coach.list_conversations(user.id).await?))
}

#[derive(Deserialize, Default)]
struct CreateBody {
    #[serde(default)]
    context: CoachContext,
}

async fn create(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    body: Option<Json<CreateBody>>,
) -> ApiResult<Json<ascend_core::entities::conversations::Model>> {
    let ctx = body.map(|b| b.0.context).unwrap_or_default();
    Ok(Json(state.coach.create_conversation(user.id, &ctx).await?))
}

#[derive(Serialize)]
struct Detail {
    conversation: ascend_core::entities::conversations::Model,
    messages: Vec<ascend_core::entities::messages::Model>,
}

async fn detail(State(state): State<AppState>, CurrentUser(user): CurrentUser, Path(id): Path<Uuid>) -> ApiResult<Json<Detail>> {
    let (conversation, messages) = state.coach.get_conversation(user.id, id).await?;
    Ok(Json(Detail { conversation, messages }))
}

async fn remove(State(state): State<AppState>, CurrentUser(user): CurrentUser, Path(id): Path<Uuid>) -> ApiResult<Json<serde_json::Value>> {
    state.coach.delete_conversation(user.id, id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn send(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
    Json(input): Json<SendMessageInput>,
) -> ApiResult<impl axum::response::IntoResponse> {
    let client = state.coach.client()?.clone();
    let (conv, _) = state.coach.get_conversation(user.id, id).await?;
    let progress = state.progress.summary(user.id).await.ok();
    let request = state.coach.prepare_turn(user.id, &conv, input, progress.as_ref()).await?;
    let upstream = client.stream(&request).await?;

    let (tx, rx) = sse::channel();
    let coach = state.coach.clone();
    tokio::spawn(async move {
        futures::pin_mut!(upstream);
        let (reply, input_tokens, output_tokens, error) = sse::pump(upstream, &tx).await;
        if let Some(e) = &error {
            tracing::warn!(error = %e, conversation = %conv.id, "coach stream error");
        }
        if let Err(e) = coach.finish_turn(user.id, conv.id, reply, input_tokens, output_tokens).await {
            tracing::error!(error = %e, "failed to persist coach reply");
        }
    });
    Ok(sse::respond(rx))
}

#[derive(Deserialize)]
struct QuizBody {
    #[serde(default = "default_count")]
    count: usize,
}
fn default_count() -> usize {
    5
}

async fn generate_quiz(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path((t, m, l)): Path<(String, String, String)>,
    body: Option<Json<QuizBody>>,
) -> ApiResult<Json<GeneratedQuiz>> {
    let count = body.map(|b| b.0.count).unwrap_or(5);
    Ok(Json(ascend_core::ai::quiz::generate(&state.coach, user.id, &format!("{t}/{m}/{l}"), count).await?))
}
