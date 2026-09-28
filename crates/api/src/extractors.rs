//! Request extractors. `CurrentUser` fails with 401; `MaybeUser` never fails
//! (public endpoints that personalise when a session exists).
use ascend_core::auth::CurrentUser as User;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum_extra::extract::CookieJar;

use crate::error::ApiError;
use crate::state::AppState;

pub const SESSION_COOKIE: &str = "ascend_session";
/// Long-lived marker of a browser that has signed in to an account before;
/// grants nothing by itself (see `routes::auth::device_cookie`).
pub const DEVICE_COOKIE: &str = "ascend_device";

#[derive(Debug, Clone)]
pub struct CurrentUser(pub User);

#[derive(Debug, Clone)]
pub struct MaybeUser(pub Option<User>);

/// Sessions are resolved once per request and cached in extensions, so a
/// handler using both extractors still costs one lookup.
async fn resolve(parts: &mut Parts, state: &AppState) -> Result<Option<User>, ApiError> {
    if let Some(cached) = parts.extensions.get::<MaybeUser>() {
        return Ok(cached.0.clone());
    }
    let jar = CookieJar::from_headers(&parts.headers);
    let user = match jar.get(SESSION_COOKIE) {
        Some(cookie) => state.auth.authenticate(cookie.value()).await?,
        None => None,
    };
    parts.extensions.insert(MaybeUser(user.clone()));
    Ok(user)
}

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        match resolve(parts, state).await? {
            Some(u) => Ok(CurrentUser(u)),
            None => Err(ApiError(ascend_core::AppError::Unauthorized)),
        }
    }
}

impl FromRequestParts<AppState> for MaybeUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        Ok(MaybeUser(resolve(parts, state).await?))
    }
}

/// JSON body extractor whose failures use the API's error shape
/// (`{"code": ..., "message": ...}`) instead of Axum's plain-text rejection,
/// while keeping the right status: 400 malformed JSON, 413 too large,
/// 415 wrong content type, 422 well-formed JSON of the wrong shape.
#[derive(Debug, Clone, Copy, Default, axum::extract::FromRequest)]
#[from_request(via(axum::Json), rejection(JsonError))]
pub struct AppJson<T>(pub T);

#[derive(Debug)]
pub struct JsonError {
    status: axum::http::StatusCode,
    message: String,
}

impl From<axum::extract::rejection::JsonRejection> for JsonError {
    fn from(rejection: axum::extract::rejection::JsonRejection) -> Self {
        Self { status: rejection.status(), message: format!("invalid request body: {}", rejection.body_text()) }
    }
}

impl axum::response::IntoResponse for JsonError {
    fn into_response(self) -> axum::response::Response {
        let code = match self.status.as_u16() {
            413 => "payload_too_large",
            400 => "bad_request",
            415 => "unsupported_media_type",
            _ => "validation_error",
        };
        (self.status, axum::Json(crate::error::ErrorBody { code, message: self.message })).into_response()
    }
}
