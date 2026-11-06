//! The admin API, behind the dashboard at `/admin`. Two ways in:
//!
//! * a session whose account has the `admin` role (the dashboard), or
//! * `Authorization: Bearer <ADMIN_TOKEN>`, a secret kept only in Railway.
//!   The production image has no shell, so this is how the first admin is
//!   made (`PUT /api/admin/roles`) and how invites were managed before the
//!   dashboard (docs/RUNBOOK.md, "Admin"). Without `ADMIN_TOKEN` a bearer
//!   request answers 404.
//!
//! Anonymous requests get 401 and signed-in learners 403. Every change is
//! written to the audit log by `AdminService`.
use ascend_core::AppError;
use ascend_core::auth::invites::{self, Invite};
use ascend_core::services::admin::{
    Account, Actor, AuditEntry, CommentFilter, CommentRow, ContentReport, Overview, Page, Paged, UsageReport,
    UserDetail, UserFilter, UserRow,
};
use axum::extract::{FromRequestParts, Path, Query, State};
use axum::http::HeaderMap;
use axum::http::request::Parts;
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use secrecy::ExposeSecret;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};
use crate::extractors::{AppJson, MaybeUser};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/overview", get(overview))
        .route("/admin/users", get(users))
        .route("/admin/users/{id}", get(user).delete(delete_user))
        .route("/admin/users/{id}/role", put(set_role))
        .route("/admin/users/{id}/sign-out", post(sign_out))
        .route("/admin/users/{id}/password-reset", post(password_reset))
        .route("/admin/roles", put(set_role_by_email))
        .route("/admin/content", get(content))
        .route("/admin/comments", get(comments))
        .route("/admin/comments/{id}", delete(delete_comment))
        .route("/admin/ai-usage", get(ai_usage))
        .route("/admin/audit", get(audit))
        .route("/admin/invites", get(list_invites).post(create_invite))
        .route("/admin/invites/{id}", delete(revoke_invite))
}

/// The authorised caller of an admin route.
pub struct Operator(pub Actor);

impl FromRequestParts<AppState> for Operator {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        if parts.headers.contains_key(axum::http::header::AUTHORIZATION) {
            check_token(state, &parts.headers)?;
            return Ok(Operator(Actor::Token));
        }
        match MaybeUser::from_request_parts(parts, state).await?.0 {
            Some(u) if u.is_admin() => Ok(Operator(Actor::Admin { id: u.id, email: u.email })),
            Some(_) => Err(AppError::Forbidden.into()),
            None => Err(AppError::Unauthorized.into()),
        }
    }
}

fn check_token(state: &AppState, headers: &HeaderMap) -> Result<(), AppError> {
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

async fn overview(_: Operator, State(state): State<AppState>) -> ApiResult<Json<Overview>> {
    Ok(Json(state.admin.overview().await?))
}

async fn users(
    _: Operator,
    State(state): State<AppState>,
    Query(filter): Query<UserFilter>,
    Query(page): Query<Page>,
) -> ApiResult<Json<Paged<UserRow>>> {
    Ok(Json(state.admin.users(filter, page).await?))
}

async fn user(_: Operator, State(state): State<AppState>, Path(id): Path<Uuid>) -> ApiResult<Json<UserDetail>> {
    Ok(Json(state.admin.user(id).await?))
}

#[derive(Deserialize)]
struct RoleChange {
    role: String,
}

async fn set_role(
    Operator(actor): Operator,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    AppJson(body): AppJson<RoleChange>,
) -> ApiResult<Json<Account>> {
    Ok(Json(state.admin.set_role(&actor, id, &body.role).await?))
}

#[derive(Deserialize)]
struct RoleByEmail {
    email: String,
    role: String,
}

async fn set_role_by_email(
    Operator(actor): Operator,
    State(state): State<AppState>,
    AppJson(body): AppJson<RoleByEmail>,
) -> ApiResult<Json<Account>> {
    Ok(Json(state.admin.set_role_by_email(&actor, &body.email, &body.role).await?))
}

async fn sign_out(
    Operator(actor): Operator,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    Ok(Json(json!({ "sessions": state.admin.sign_out_everywhere(&actor, id).await? })))
}

async fn password_reset(
    Operator(actor): Operator,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    if !state.mailer.enabled() {
        return Err(super::auth::email_unavailable().into());
    }
    let email = state.admin.password_reset_requested(&actor, id).await?;
    super::auth::send_password_reset(&state, email);
    Ok(Json(json!({ "ok": true })))
}

async fn delete_user(
    Operator(actor): Operator,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    state.admin.delete_user(&actor, id).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn content(_: Operator, State(state): State<AppState>) -> ApiResult<Json<ContentReport>> {
    Ok(Json(state.admin.content().await?))
}

async fn comments(
    _: Operator,
    State(state): State<AppState>,
    Query(filter): Query<CommentFilter>,
    Query(page): Query<Page>,
) -> ApiResult<Json<Paged<CommentRow>>> {
    Ok(Json(state.admin.comments(filter, page).await?))
}

async fn delete_comment(
    Operator(actor): Operator,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    state.admin.delete_comment(&actor, id).await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct UsageQuery {
    #[serde(default = "thirty")]
    days: i32,
}

fn thirty() -> i32 {
    30
}

async fn ai_usage(
    _: Operator,
    State(state): State<AppState>,
    Query(q): Query<UsageQuery>,
) -> ApiResult<Json<UsageReport>> {
    Ok(Json(state.admin.ai_usage(q.days).await?))
}

async fn audit(
    _: Operator,
    State(state): State<AppState>,
    Query(page): Query<Page>,
) -> ApiResult<Json<Paged<AuditEntry>>> {
    Ok(Json(state.admin.audit(page).await?))
}

async fn list_invites(_: Operator, State(state): State<AppState>) -> ApiResult<Json<Vec<Invite>>> {
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

async fn create_invite(
    Operator(actor): Operator,
    State(state): State<AppState>,
    AppJson(body): AppJson<NewInvite>,
) -> ApiResult<Json<Value>> {
    if body.days.is_some_and(|d| !(1..=365).contains(&d)) {
        return Err(AppError::Validation("days must be between 1 and 365".into()).into());
    }
    let code = invites::create(&state.db, body.uses, body.days.map(chrono::Duration::days), &body.note).await?;
    state.admin.record_invite_created(&actor, body.uses, body.days, &body.note).await?;
    Ok(Json(json!({
        "link": format!("{}/register?invite={code}", state.config.public_origin.trim_end_matches('/')),
        "uses": body.uses,
        "days": body.days,
        "note": body.note,
    })))
}

async fn revoke_invite(
    Operator(actor): Operator,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let revoked = invites::revoke(&state.db, &id).await?;
    state.admin.record_invite_revoked(&actor, &id, revoked).await?;
    Ok(Json(json!({ "revoked": revoked })))
}
