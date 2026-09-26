//! Maps `AppError` to HTTP once. Handlers return `ApiResult<T>` and never
//! think about status codes. Error bodies follow RFC 9457 ("problem details")
//! loosely: `{ "code": "...", "message": "..." }`.
use ascend_core::AppError;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

pub type ApiResult<T> = Result<T, ApiError>;

#[derive(Debug)]
pub struct ApiError(pub AppError);

impl From<AppError> for ApiError {
    fn from(e: AppError) -> Self {
        Self(e)
    }
}

impl From<sea_orm::DbErr> for ApiError {
    fn from(e: sea_orm::DbErr) -> Self {
        Self(AppError::Database(e))
    }
}

#[derive(Serialize)]
pub struct ErrorBody {
    pub code: &'static str,
    pub message: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let e = self.0;
        let status = match &e {
            AppError::Validation(_) => StatusCode::UNPROCESSABLE_ENTITY,
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::Forbidden => StatusCode::FORBIDDEN,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::RateLimited(_) => StatusCode::TOO_MANY_REQUESTS,
            AppError::AiDisabled => StatusCode::SERVICE_UNAVAILABLE,
            AppError::AiUpstream(_) => StatusCode::BAD_GATEWAY,
            AppError::Database(_) | AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        // Internal details are logged, never returned.
        let message = match &e {
            AppError::Database(inner) => {
                tracing::error!(error = %inner, "database error");
                "internal error".to_string()
            }
            AppError::Internal(inner) => {
                tracing::error!(error = %inner, "internal error");
                "internal error".to_string()
            }
            other => other.to_string(),
        };
        (status, Json(ErrorBody { code: e.code(), message })).into_response()
    }
}

/// Convenience for handlers that produce ad-hoc validation failures.
pub fn bad_request(msg: impl Into<String>) -> ApiError {
    ApiError(AppError::Validation(msg.into()))
}
