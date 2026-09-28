//! Maps `AppError` to HTTP once. Handlers return `ApiResult<T>` and never
//! think about status codes. Error bodies follow RFC 9457 ("problem details")
//! loosely: `{ "code": "...", "message": "..." }`.
use ascend_core::AppError;
use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
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
            AppError::RateLimited { .. } => StatusCode::TOO_MANY_REQUESTS,
            AppError::AiDisabled | AppError::Unavailable { .. } => StatusCode::SERVICE_UNAVAILABLE,
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
        let mut res = (status, Json(ErrorBody { code: e.code(), message })).into_response();
        if let AppError::RateLimited { retry_after_secs: Some(secs), .. }
        | AppError::Unavailable { retry_after_secs: Some(secs), .. } = e
        {
            res.headers_mut().insert(axum::http::header::RETRY_AFTER, secs.max(1).into());
        }
        res
    }
}

/// Convenience for handlers that produce ad-hoc validation failures.
pub fn bad_request(msg: impl Into<String>) -> ApiError {
    ApiError(AppError::Validation(msg.into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limited_errors_carry_retry_after_when_known() {
        let res =
            ApiError(AppError::RateLimited { message: "slow down".into(), retry_after_secs: Some(42) }).into_response();
        assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(res.headers()[axum::http::header::RETRY_AFTER], "42");
        let res =
            ApiError(AppError::RateLimited { message: "slow down".into(), retry_after_secs: None }).into_response();
        assert!(res.headers().get(axum::http::header::RETRY_AFTER).is_none());
    }

    #[test]
    fn internal_details_are_not_returned() {
        let res = ApiError(AppError::Internal("connection string postgres://secret".into())).into_response();
        assert_eq!(res.status(), StatusCode::INTERNAL_SERVER_ERROR);
        let body = futures::executor::block_on(http_body_util::BodyExt::collect(res.into_body())).unwrap().to_bytes();
        assert!(!String::from_utf8_lossy(&body).contains("secret"));
    }
}
