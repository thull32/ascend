//! The grading service: `ascend-api --serve-grader`.
//!
//! Same image as the API, different role. It holds the WebAssembly runtimes
//! and a shared token, and nothing else: it never reads `DATABASE_URL`, the
//! AI key or any other secret, so a learner's code that somehow escaped the
//! sandbox would find nothing worth taking. The API sends it jobs over the
//! private network (`GRADER_URL`); it has no public domain.
//!
//! Environment: `GRADER_TOKEN` (required, 32+ characters), `GRADER_DIR`,
//! `GRADER_SLOTS`, `HOST`/`PORT`, `LOG_JSON`, and the OTLP endpoints.
use std::sync::Arc;
use std::time::Duration;

use ascend_grader::{GradeError, Grader, Job, Options};
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use sha2::{Digest, Sha256};

use crate::{serve, telemetry};

struct Service {
    grader: Grader,
    /// SHA-256 of the token, compared in constant time.
    token_hash: [u8; 32],
}

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.trim().is_empty())
}

pub async fn run() -> anyhow::Result<()> {
    let json_logs = env("LOG_JSON").is_none_or(|v| v == "true" || v == "1");
    let telemetry = telemetry::init(json_logs, "ascend-grader");
    let token = env("GRADER_TOKEN").ok_or_else(|| anyhow::anyhow!("GRADER_TOKEN is required"))?;
    anyhow::ensure!(token.len() >= 32, "GRADER_TOKEN must be at least 32 characters");
    let dir = env("GRADER_DIR").unwrap_or_else(|| "/opt/ascend/grader".into());
    let mut options = Options::default();
    if let Some(slots) = env("GRADER_SLOTS").and_then(|s| s.parse().ok()) {
        options.slots = slots;
    }
    let slots = options.slots;
    let grader = tokio::task::spawn_blocking(move || Grader::load(std::path::Path::new(&dir), options)).await??;
    telemetry::observe_grader(&grader);
    let app = router(grader, &token);
    let addr =
        format!("{}:{}", env("HOST").unwrap_or_else(|| "::".into()), env("PORT").unwrap_or_else(|| "8080".into()));
    let addr =
        if addr.starts_with("::") { format!("[::]:{}", addr.rsplit(':').next().unwrap_or("8080")) } else { addr };
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(%addr, slots, "grading service listening");
    let drained = serve::serve(listener, app, serve::shutdown_signal(), Duration::from_secs(25)).await?;
    if drained == serve::Drain::TimedOut {
        tracing::warn!("grading runs still open after the drain timeout");
    }
    telemetry.shutdown();
    Ok(())
}

/// The service's routes: `GET /healthz` and `POST /grade` (bearer token).
pub fn router(grader: Grader, token: &str) -> Router {
    let service = Arc::new(Service { grader, token_hash: Sha256::digest(token.as_bytes()).into() });
    Router::new()
        .route("/healthz", get(|| async { Json(serde_json::json!({ "status": "ok" })) }))
        .route("/grade", post(grade))
        // 64 KiB of code plus the test cases.
        .layer(DefaultBodyLimit::max(4 << 20))
        .layer(axum::middleware::from_fn(crate::middleware::metrics::record))
        .with_state(service)
}

fn authorised(service: &Service, headers: &HeaderMap) -> bool {
    let Some(given) = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
    else {
        return false;
    };
    let given: [u8; 32] = Sha256::digest(given.as_bytes()).into();
    // Constant time over equal-length digests.
    given.iter().zip(service.token_hash.iter()).fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0
}

async fn grade(State(service): State<Arc<Service>>, headers: HeaderMap, Json(job): Json<Job>) -> Response {
    if !authorised(&service, &headers) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    use tracing::Instrument;
    use tracing_opentelemetry::OpenTelemetrySpanExt;
    let span = tracing::info_span!("grade", cases = job.cases.len());
    // Continue the API's trace; without a traceparent this is a new one.
    let _ = span.set_parent(telemetry::remote_context(&headers));
    match service.grader.run(job).instrument(span).await {
        Ok(outcome) => Json(outcome).into_response(),
        Err(GradeError::Busy) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
        Err(e) => {
            tracing::error!(error = %e, "grading failed");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
