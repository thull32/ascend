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
use crate::middleware::rate_limit::{Bucket, RESET_PER_ADDRESS, VERIFY_PER_ACCOUNT, limit};
use crate::state::AppState;

pub fn router(state: AppState) -> Router<AppState> {
    let throttled = Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/password/forgot", post(forgot_password))
        .route("/password/reset", post(reset_password))
        .route("/email/verify", post(verify_email))
        .layer(middleware::from_fn_with_state(state, |s, r, n| limit(Bucket::Auth, s, r, n)));
    Router::new()
        .merge(throttled)
        .route("/logout", post(logout))
        .route("/logout-all", post(logout_all))
        .route("/email/resend", post(resend_verification))
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
    send_verification(&state, user.id);
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

// ---------- account recovery and verification ----------

/// Emails a verification link in the background (a slow provider must not
/// slow sign-up). Nothing is sent when email is not set up.
fn send_verification(state: &AppState, user_id: uuid::Uuid) {
    if !state.mailer.enabled() {
        return;
    }
    let (auth, mailer, origin) = (state.auth.clone(), state.mailer.clone(), state.config.public_origin.clone());
    state.tasks.spawn(async move {
        match auth.start_verification(user_id).await {
            Ok(Some(link)) => {
                // The token rides in the fragment, which browsers never send
                // to a server or in a Referer header.
                let url = format!("{origin}/verify-email#token={}", link.token);
                let email = ascend_core::email::verify_address(&link.email, &link.display_name, &url);
                if let Err(e) = mailer.send(&email).await {
                    tracing::error!(error = %e, "verification email failed");
                }
            }
            Ok(None) => {}
            Err(e) => tracing::error!(error = %e, "could not start verification"),
        }
    });
}

fn email_unavailable() -> ascend_core::AppError {
    ascend_core::AppError::Unavailable {
        message: "email is not set up on this server yet, so passwords cannot be reset by email".into(),
        retry_after_secs: None,
    }
}

#[derive(serde::Deserialize)]
struct ForgotPassword {
    email: String,
}

/// Always answers the same way, whether or not an account exists, and does
/// the work in the background so timing does not tell either.
async fn forgot_password(State(state): State<AppState>, AppJson(body): AppJson<ForgotPassword>) -> ApiResult<Response> {
    if !state.mailer.enabled() {
        return Err(email_unavailable().into());
    }
    let email = body.email.trim().to_lowercase();
    if email.is_empty() || email.len() > 320 || !email.contains('@') {
        return Err(crate::error::bad_request("enter the email address you signed up with"));
    }
    if let Some(throttled) = state.limiter.charge(&format!("reset:{email}"), RESET_PER_ADDRESS).await {
        return Ok(throttled);
    }
    let (auth, mailer, origin) = (state.auth.clone(), state.mailer.clone(), state.config.public_origin.clone());
    state.tasks.spawn(async move {
        match auth.start_password_reset(&email).await {
            Ok(Some(link)) => {
                let url = format!("{origin}/reset-password#token={}", link.token);
                let message = ascend_core::email::password_reset(&link.email, &link.display_name, &url);
                if let Err(e) = mailer.send(&message).await {
                    tracing::error!(error = %e, "password reset email failed");
                }
            }
            Ok(None) => {}
            Err(e) => tracing::error!(error = %e, "could not start a password reset"),
        }
    });
    Ok(Json(serde_json::json!({ "ok": true })).into_response())
}

#[derive(serde::Deserialize)]
struct ResetPassword {
    token: String,
    password: String,
}

/// Sets the new password, signs out every other session, and signs this
/// browser in.
async fn reset_password(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    AppJson(body): AppJson<ResetPassword>,
) -> ApiResult<(CookieJar, Json<ascend_core::auth::CurrentUser>)> {
    let (user, session) = state.auth.reset_password(&body.token, body.password, user_agent(&headers)).await?;
    let device = state.auth.remember_device(user.id).await?;
    let jar = jar.add(session_cookie(&state, session.token, session.expires_at)).add(device_cookie(&state, device));
    Ok((jar, Json(user)))
}

#[derive(serde::Deserialize)]
struct VerifyEmail {
    token: String,
}

async fn verify_email(
    State(state): State<AppState>,
    AppJson(body): AppJson<VerifyEmail>,
) -> ApiResult<Json<ascend_core::auth::CurrentUser>> {
    Ok(Json(state.auth.verify_email(&body.token).await?))
}

async fn resend_verification(State(state): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Response> {
    if user.email_verified {
        return Ok(Json(serde_json::json!({ "sent": false, "already_verified": true })).into_response());
    }
    if !state.mailer.enabled() {
        return Err(email_unavailable().into());
    }
    if let Some(throttled) = state.limiter.charge(&format!("verify:{}", user.id), VERIFY_PER_ACCOUNT).await {
        return Ok(throttled);
    }
    send_verification(&state, user.id);
    Ok(Json(serde_json::json!({ "sent": true })).into_response())
}
