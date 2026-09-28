//! One error type for the whole domain.
//!
//! The variants are *semantic* (what went wrong for the caller), not
//! *mechanical* (which library failed). The API layer maps each variant to an
//! HTTP status once, in one place, and internal details never leak to clients.
use std::fmt;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("authentication required")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("{0} not found")]
    NotFound(&'static str),
    #[error("{0}")]
    Conflict(String),
    #[error("rate limit exceeded: {message}")]
    RateLimited {
        message: String,
        /// When a retry can succeed, if known; sent as `Retry-After`.
        retry_after_secs: Option<u64>,
    },
    #[error("AI features are not configured on this deployment")]
    AiDisabled,
    /// A capacity or configuration problem on our side; the request itself
    /// was fine.
    #[error("{message}")]
    Unavailable {
        message: String,
        /// When a retry can succeed, if known; sent as `Retry-After`.
        retry_after_secs: Option<u64>,
    },
    #[error("upstream AI provider error: {0}")]
    AiUpstream(String),
    #[error("database error")]
    Database(#[from] sea_orm::DbErr),
    #[error("internal error: {0}")]
    Internal(String),
}

impl AppError {
    pub fn internal(e: impl fmt::Display) -> Self {
        Self::Internal(e.to_string())
    }
    pub fn validation(msg: impl Into<String>) -> Self {
        Self::Validation(msg.into())
    }
    /// An upstream AI failure. `public` is shown to the learner; `detail`
    /// (provider messages, transport errors, parse errors) is logged only,
    /// because it can echo request content or internal addresses.
    pub fn ai_upstream(public: &str, detail: impl fmt::Display) -> Self {
        tracing::warn!(detail = %detail, "{public}");
        Self::AiUpstream(public.to_string())
    }
    /// Machine-readable code for clients (stable across wording changes).
    pub fn code(&self) -> &'static str {
        match self {
            Self::Validation(_) => "validation_error",
            Self::Unauthorized => "unauthorized",
            Self::Forbidden => "forbidden",
            Self::NotFound(_) => "not_found",
            Self::Conflict(_) => "conflict",
            Self::RateLimited { .. } => "rate_limited",
            Self::AiDisabled => "ai_disabled",
            Self::Unavailable { .. } => "unavailable",
            Self::AiUpstream(_) => "ai_upstream",
            Self::Database(_) => "database_error",
            Self::Internal(_) => "internal_error",
        }
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        Self::Internal(format!("{e:#}"))
    }
}

impl From<validator::ValidationErrors> for AppError {
    fn from(e: validator::ValidationErrors) -> Self {
        // Flatten to "field: message" lines; good enough for a form UI.
        let mut parts: Vec<String> = e
            .field_errors()
            .into_iter()
            .map(|(field, errs)| {
                let msg = errs
                    .iter()
                    .filter_map(|v| v.message.as_ref().map(|m| m.to_string()))
                    .next()
                    .unwrap_or_else(|| "is invalid".to_string());
                format!("{field} {msg}")
            })
            .collect();
        parts.sort();
        Self::Validation(parts.join("; "))
    }
}
