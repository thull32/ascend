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
use crate::extractors::{AppJson, CurrentUser, DEVICE_COOKIE, SESSION_COOKIE};
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

/// Marks this browser as a known device for the account (see
/// `migration::m0010_login_devices`). Scoped to the auth routes, the only
/// place it is read, and strict: it is only ever sent by our own pages.
fn device_cookie(state: &AppState, token: String) -> Cookie<'static> {
    Cookie::build((DEVICE_COOKIE, token))
        .path("/api/auth")
        .http_only(true)
        .secure(state.config.cookie_secure)
        .same_site(SameSite::Strict)
        .max_age(time::Duration::days(365))
        .build()
}

/// The device cookie's hash when it belongs to this account, else `None`.
async fn known_device(state: &AppState, jar: &CookieJar, email: &str) -> ApiResult<Option<String>> {
    let raw = jar.get(DEVICE_COOKIE).map(|c| c.value().to_string());
    if state.auth.is_known_device(email, raw.as_deref()).await? {
        Ok(raw.map(|t| ascend_core::auth::token::hash(&t)))
    } else {
        Ok(None)
    }
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
    let device = state.auth.remember_device(user.id).await?;
    let jar = jar.add(session_cookie(&state, session.token, session.expires_at)).add(device_cookie(&state, device));
    Ok((jar, Json(user)))
}

async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    AppJson(input): AppJson<LoginInput>,
) -> ApiResult<Response> {
    let device = known_device(&state, &jar, &input.email).await?;
    if let Some(throttled) = state.limiter.check_password_attempt(&input.email, device.as_deref()).await {
        return Ok(throttled);
    }
    let (user, session) = state.auth.login(input, user_agent(&headers)).await?;
    let mut jar = jar.add(session_cookie(&state, session.token, session.expires_at));
    if device.is_none() {
        jar = jar.add(device_cookie(&state, state.auth.remember_device(user.id).await?));
    }
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
    let device = known_device(&state, &jar, &user.email).await?;
    if let Some(throttled) = state.limiter.check_password_attempt(&user.email, device.as_deref()).await {
        return Ok(throttled);
    }
    state.auth.delete_account(user.id, body.password).await?;
    let jar = jar.remove(Cookie::build(SESSION_COOKIE).path("/").build());
    Ok((jar, Json(serde_json::json!({ "deleted": true }))).into_response())
}
