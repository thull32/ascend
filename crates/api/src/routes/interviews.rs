//! Mock interview endpoints.
//!
//! Flow: `POST /interviews` → `POST /interviews/{id}/turns` (SSE, repeated)
//! → optional `POST /interviews/{id}/assistant` (SSE, assisted mode only)
//! → `POST /interviews/{id}/finish` (JSON evaluation).
use ascend_core::ai::interview;
use ascend_core::ai::{ChatMessage, Role};
use ascend_core::entities::interviews::Model;
use ascend_core::services::interviews::{InterviewService, StartInterview, TranscriptEntry};
use axum::extract::{Path, State};
use axum::middleware;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use uuid::Uuid;

use crate::error::{ApiError, ApiResult, bad_request};
use crate::extractors::{AppJson, CurrentUser};
use crate::middleware::rate_limit::{Bucket, limit};
use crate::routes::sse;
use crate::state::AppState;

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/interviews", get(list).post(start))
        .route("/interviews/prompts", get(prompts))
        .route("/interviews/{id}", get(detail))
        .route("/interviews/{id}/turns", post(turn))
        .route("/interviews/{id}/assistant", post(assistant))
        .route("/interviews/{id}/finish", post(finish))
        .layer(middleware::from_fn_with_state(state, |s, r, n| limit(Bucket::Ai, s, r, n)))
}

#[derive(Serialize)]
struct Prompts {
    system_design: Vec<serde_json::Value>,
    behavioral: &'static [&'static str],
}

async fn prompts() -> Json<Prompts> {
    Json(Prompts {
        system_design: ascend_core::services::interviews::SYSTEM_DESIGN_PROMPTS
            .iter()
            .map(|(slug, text)| serde_json::json!({ "slug": slug, "prompt": text }))
            .collect(),
        behavioral: ascend_core::services::interviews::BEHAVIORAL_PROMPTS,
    })
}

async fn list(State(state): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Json<Vec<Model>>> {
    Ok(Json(state.interviews.list(user.id).await?))
}

async fn start(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    AppJson(input): AppJson<StartInterview>,
) -> ApiResult<Json<Model>> {
    state.coach.client()?;
    Ok(Json(state.interviews.start(user.id, input).await?))
}

async fn detail(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Model>> {
    Ok(Json(state.interviews.get(user.id, id).await?))
}

#[derive(Deserialize)]
struct TurnBody {
    content: String,
    code: Option<String>,
}

fn now() -> chrono::DateTime<chrono::Utc> {
    chrono::Utc::now()
}

async fn turn(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
    AppJson(body): AppJson<TurnBody>,
) -> ApiResult<impl axum::response::IntoResponse> {
    let client = state.coach.client()?.clone();
    let model = state.interviews.get(user.id, id).await?;
    if model.status != "active" {
        return Err(bad_request("interview is not active"));
    }
    let content = body.content.trim().to_string();
    if content.is_empty() || content.chars().count() > 6000 {
        return Err(bad_request("message must be 1–6000 characters"));
    }
    state.coach.budget().check_and_reserve(user.id).await?;
    let model = state
        .interviews
        .append_transcript(model, vec![TranscriptEntry { role: "candidate".into(), content, at: now() }], body.code)
        .await?;
    let transcript = InterviewService::transcript(&model);
    let request = interview::turn_request(&state.coach, &model, &transcript);
    let upstream = client.stream(&request).await?;

    let (tx, rx) = sse::channel();
    let interviews = state.interviews.clone();
    let coach = state.coach.clone();
    state.tasks.spawn(
        async move {
            futures::pin_mut!(upstream);
            let (reply, usage, error) = sse::pump(upstream, &tx).await;
            if let Some(e) = error {
                tracing::warn!(error = %e, interview = %model.id, "interviewer stream error");
            }
            if !reply.trim().is_empty()
                && let Err(e) = interviews
                    .append_transcript(
                        model,
                        vec![TranscriptEntry { role: "interviewer".into(), content: reply, at: now() }],
                        None,
                    )
                    .await
            {
                tracing::error!(error = %e, "failed to persist interviewer turn");
            }
            let _ = coach.budget().record(user.id, usage).await;
        }
        .instrument(tracing::Span::current()),
    );
    Ok(sse::respond(rx))
}

#[derive(Deserialize)]
struct AssistantBody {
    /// Client-held assistant chat history, ending with the new user prompt.
    messages: Vec<ChatMessage>,
}

async fn assistant(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
    AppJson(body): AppJson<AssistantBody>,
) -> ApiResult<impl axum::response::IntoResponse> {
    let client = state.coach.client()?.clone();
    let model = state.interviews.get(user.id, id).await?;
    if model.status != "active" {
        return Err(bad_request("interview is not active"));
    }
    if model.assistant_mode != "assisted" {
        return Err(ApiError(ascend_core::AppError::Forbidden));
    }
    let Some(last) = body.messages.last().filter(|m| m.role == Role::User) else {
        return Err(bad_request("messages must end with a user prompt"));
    };
    if body.messages.len() > 60 || body.messages.iter().any(|m| m.content.chars().count() > 12_000) {
        return Err(bad_request("assistant history too long"));
    }
    state.coach.budget().check_and_reserve(user.id).await?;
    let prompt = last.content.clone();
    let model = state
        .interviews
        .append_transcript(
            model,
            vec![TranscriptEntry { role: "candidate_to_assistant".into(), content: prompt, at: now() }],
            None,
        )
        .await?;
    let request = interview::assistant_request(&state.coach, &model, body.messages);
    let upstream = client.stream(&request).await?;

    let (tx, rx) = sse::channel();
    let interviews = state.interviews.clone();
    let coach = state.coach.clone();
    state.tasks.spawn(
        async move {
            futures::pin_mut!(upstream);
            let (reply, usage, _) = sse::pump(upstream, &tx).await;
            if !reply.trim().is_empty() {
                let _ = interviews
                    .append_transcript(
                        model,
                        vec![TranscriptEntry { role: "assistant".into(), content: reply, at: now() }],
                        None,
                    )
                    .await;
            }
            let _ = coach.budget().record(user.id, usage).await;
        }
        .instrument(tracing::Span::current()),
    );
    Ok(sse::respond(rx))
}

#[derive(Deserialize)]
struct FinishBody {
    code: Option<String>,
}

async fn finish(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
    AppJson(body): AppJson<FinishBody>,
) -> ApiResult<Json<Model>> {
    let model = state.interviews.get(user.id, id).await?;
    if model.status != "active" {
        return Err(bad_request("interview is not active"));
    }
    let model = state.interviews.append_transcript(model, vec![], body.code).await?;
    if InterviewService::transcript(&model).iter().filter(|e| e.role == "candidate").count() < 2 {
        // Not enough signal to grade; mark abandoned rather than burn tokens.
        let m = state
            .interviews
            .finish(
                model,
                serde_json::json!({ "summary": "Interview ended before enough discussion to evaluate." }),
                0,
                "abandoned",
            )
            .await?;
        return Ok(Json(m));
    }
    let evaluation = interview::evaluate(&state.coach, user.id, &model).await?;
    let score = evaluation.overall_score as i16;
    let value = serde_json::to_value(&evaluation).map_err(|e| ApiError(ascend_core::AppError::internal(e)))?;
    Ok(Json(state.interviews.finish(model, value, score, "completed").await?))
}
