use ascend_core::auth::service::ProfileUpdate;
use ascend_core::auth::{LoginInput, RegisterInput};
use axum::extract::State;
use axum::http::HeaderMap;
use axum::middleware;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};

use crate::error::ApiResult;
use crate::extractors::{AppJson, CurrentUser, SESSION_COOKIE};
use crate::middleware::rate_limit::{Bucket, limit};
use crate::state::AppState;

pub fn router(state: AppState) -> Router<AppState> {
    let throttled = Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .layer(middleware::from_fn_with_state(state, |s, r, n| limit(Bucket::Auth, s, r, n)));
    Router::new()
        .merge(throttled)
        .route("/logout", post(logout))
        .route("/logout-all", post(logout_all))
        .route("/me", get(me).patch(update_profile).delete(delete_account))
}

fn session_cookie(state: &AppState, token: String, expires_at: chrono::DateTime<chrono::Utc>) -> Cookie<'static> {
    let max_age = (expires_at - chrono::Utc::now()).num_seconds().max(0);
    Cookie::build((SESSION_COOKIE, token))
        .path("/")
        .http_only(true)
        .secure(state.config.cookie_secure)
        .same_site(SameSite::Lax)
        .max_age(time_duration(max_age))
        .build()
}

fn time_duration(secs: i64) -> time::Duration {
    time::Duration::seconds(secs)
}

fn user_agent(headers: &HeaderMap) -> Option<String> {
    headers.get("user-agent").and_then(|v| v.to_str().ok()).map(str::to_owned)
}

async fn register(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    AppJson(input): AppJson<RegisterInput>,
) -> ApiResult<(CookieJar, Json<ascend_core::auth::CurrentUser>)> {
    let (user, session) = state.auth.register(input, user_agent(&headers)).await?;
    let jar = jar.add(session_cookie(&state, session.token, session.expires_at));
    Ok((jar, Json(user)))
}

async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    AppJson(input): AppJson<LoginInput>,
) -> ApiResult<Response> {
    if let Some(throttled) = state.limiter.check_password_attempt(&input.email) {
        return Ok(throttled);
    }
    let (user, session) = state.auth.login(input, user_agent(&headers)).await?;
    let jar = jar.add(session_cookie(&state, session.token, session.expires_at));
    Ok((jar, Json(user)).into_response())
}

async fn logout(State(state): State<AppState>, jar: CookieJar) -> ApiResult<(CookieJar, Json<serde_json::Value>)> {
    if let Some(c) = jar.get(SESSION_COOKIE) {
        state.auth.logout(c.value()).await?;
    }
    let jar = jar.remove(Cookie::build(SESSION_COOKIE).path("/").build());
    Ok((jar, Json(serde_json::json!({ "ok": true }))))
}

async fn logout_all(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    jar: CookieJar,
) -> ApiResult<(CookieJar, Json<serde_json::Value>)> {
    let n = state.auth.logout_everywhere(user.id).await?;
    let jar = jar.remove(Cookie::build(SESSION_COOKIE).path("/").build());
    Ok((jar, Json(serde_json::json!({ "revoked": n }))))
}

async fn me(CurrentUser(user): CurrentUser) -> Json<ascend_core::auth::CurrentUser> {
    Json(user)
}

async fn update_profile(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    AppJson(update): AppJson<ProfileUpdate>,
) -> ApiResult<Json<ascend_core::auth::CurrentUser>> {
    Ok(Json(state.auth.update_profile(user.id, update).await?))
}

#[derive(serde::Deserialize)]
struct DeleteAccount {
    password: String,
}

async fn delete_account(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    jar: CookieJar,
    AppJson(body): AppJson<DeleteAccount>,
) -> ApiResult<Response> {
    // A stolen session must not become a password-guessing oracle.
    if let Some(throttled) = state.limiter.check_password_attempt(&user.email) {
        return Ok(throttled);
    }
    state.auth.delete_account(user.id, body.password).await?;
    let jar = jar.remove(Cookie::build(SESSION_COOKIE).path("/").build());
    Ok((jar, Json(serde_json::json!({ "deleted": true }))).into_response())
}
