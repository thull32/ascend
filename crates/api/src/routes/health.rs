use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use sea_orm::{ConnectionTrait, Statement};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/healthz", get(healthz)).route("/readyz", get(readyz)).route("/features", get(features))
}

/// Liveness: the process is up.
async fn healthz() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

/// Readiness: dependencies are reachable. Railway health checks hit this.
async fn readyz(State(state): State<AppState>) -> (StatusCode, Json<serde_json::Value>) {
    let db_ok =
        state.db.execute_raw(Statement::from_string(sea_orm::DatabaseBackend::Postgres, "SELECT 1")).await.is_ok();
    let status = if db_ok { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE };
    (
        status,
        Json(serde_json::json!({
            "status": if db_ok { "ok" } else { "degraded" },
            "database": db_ok,
            "ai": state.coach.enabled(),
            "content_version": state.curriculum.version,
            "build": crate::build_info::BUILD_ID,
        })),
    )
}

/// Which optional features this deployment has, so the UI can hide what
/// cannot work (the coach without an AI key, recovery email without a
/// provider) instead of offering it and failing.
async fn features(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ai": state.coach.enabled(),
        "email": state.mailer.enabled(),
        "contact": state.config.contact_email,
        "signups": state.config.signups,
    }))
}
