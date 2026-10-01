//! Operator API, authorised by `ADMIN_TOKEN` (a bearer token kept only in
//! Railway) rather than by a session. The production image has no shell,
//! so the `--create-invite` CLI cannot run there; this is how invites are
//! managed instead (docs/RUNBOOK.md, "Invites"). Without `ADMIN_TOKEN` the
//! routes answer 404, as if they did not exist.
use ascend_core::AppError;
use ascend_core::auth::invites::{self, Invite};
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::routing::{delete, get};
use axum::{Json, Router};
use secrecy::ExposeSecret;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::error::ApiResult;
use crate::extractors::AppJson;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/admin/invites", get(list).post(create)).route("/admin/invites/{id}", delete(revoke))
}

fn authorise(state: &AppState, headers: &HeaderMap) -> Result<(), AppError> {
    let Some(token) = &state.config.admin_token else {
        return Err(AppError::NotFound("route"));
    };
    let given = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?;
    let (a, b): ([u8; 32], [u8; 32]) =
        (Sha256::digest(given.as_bytes()).into(), Sha256::digest(token.expose_secret().as_bytes()).into());
    // Constant time over equal-length digests.
    if a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0 {
        Ok(())
    } else {
        Err(AppError::Unauthorized)
    }
}

async fn list(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Json<Vec<Invite>>> {
    authorise(&state, &headers)?;
    Ok(Json(invites::list(&state.db).await?))
}

#[derive(Deserialize)]
struct NewInvite {
    #[serde(default = "one")]
    uses: i32,
    days: Option<i64>,
    #[serde(default)]
    note: String,
}

fn one() -> i32 {
    1
}

async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    AppJson(body): AppJson<NewInvite>,
) -> ApiResult<Json<serde_json::Value>> {
    authorise(&state, &headers)?;
    if body.days.is_some_and(|d| !(1..=365).contains(&d)) {
        return Err(AppError::Validation("days must be between 1 and 365".into()).into());
    }
    let code = invites::create(&state.db, body.uses, body.days.map(chrono::Duration::days), &body.note).await?;
    Ok(Json(serde_json::json!({
        "link": format!("{}/register?invite={code}", state.config.public_origin.trim_end_matches('/')),
        "uses": body.uses,
        "days": body.days,
        "note": body.note,
    })))
}

async fn revoke(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    authorise(&state, &headers)?;
    Ok(Json(serde_json::json!({ "revoked": invites::revoke(&state.db, &id).await? })))
}
