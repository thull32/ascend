//! Request extractors. `CurrentUser` fails with 401; `MaybeUser` never fails
//! (public endpoints that personalise when a session exists).
use ascend_core::auth::CurrentUser as User;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum_extra::extract::CookieJar;

use crate::error::ApiError;
use crate::state::AppState;

pub const SESSION_COOKIE: &str = "ascend_session";

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
/// (`{"code": "validation_error", "message": ...}`) instead of Axum's
/// plain-text rejection, so clients handle every error the same way.
#[derive(Debug, Clone, Copy, Default, axum::extract::FromRequest)]
#[from_request(via(axum::Json), rejection(ApiError))]
pub struct AppJson<T>(pub T);

impl From<axum::extract::rejection::JsonRejection> for ApiError {
    fn from(rejection: axum::extract::rejection::JsonRejection) -> Self {
        ApiError(ascend_core::AppError::Validation(format!("invalid request body: {}", rejection.body_text())))
    }
}
