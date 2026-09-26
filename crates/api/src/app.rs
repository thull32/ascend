//! Router assembly and the middleware stack.
//!
//! Order matters (outermost first): request-id → tracing → timeout → body
//! limit → compression → security headers → routes. CSRF and rate limiting
//! are applied to the API sub-router only; static assets skip them.
use std::time::Duration;

use axum::body::Body;
use axum::extract::DefaultBodyLimit;
use axum::http::{HeaderValue, Request, StatusCode, Uri, header};
use axum::middleware;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use include_dir::{Dir, include_dir};
use tower_http::compression::CompressionLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::{DefaultOnResponse, TraceLayer};
use tracing::Level;

use crate::middleware::{csrf, security_headers};
use crate::routes;
use crate::state::AppState;

/// The built SPA (`web/dist`) is embedded so the release artifact is one
/// binary. `web/dist` must exist at compile time (the Dockerfile builds it
/// first; `make web` locally).
static WEB_DIST: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/../../web/dist");

pub fn build(state: AppState) -> Router {
    let api = Router::new()
        .merge(routes::health::router())
        .nest("/auth", routes::auth::router(state.clone()))
        .merge(routes::curriculum::router())
        .merge(routes::problems::router())
        .merge(routes::progress::router())
        .merge(routes::comments::router())
        .merge(routes::coach::router(state.clone()))
        .merge(routes::interviews::router(state.clone()))
        .fallback(api_not_found)
        .layer(middleware::from_fn_with_state(state.clone(), csrf::enforce))
        .layer(middleware::from_fn_with_state(state.clone(), |s, r, n| {
            crate::middleware::rate_limit::limit(crate::middleware::rate_limit::Bucket::General, s, r, n)
        }))
        .layer(DefaultBodyLimit::max(512 * 1024));

    Router::new()
        .nest("/api", api)
        .fallback(get(static_handler))
        .layer(middleware::from_fn(security_headers::apply))
        .layer(CompressionLayer::new().br(true).gzip(true))
        .layer(TimeoutLayer::with_status_code(StatusCode::REQUEST_TIMEOUT, Duration::from_secs(240)))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|req: &Request<Body>| {
                    let request_id = req
                        .headers()
                        .get("x-request-id")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("-");
                    tracing::info_span!("request", method = %req.method(), uri = %req.uri().path(), request_id)
                })
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .with_state(state)
}

async fn api_not_found() -> Response {
    (StatusCode::NOT_FOUND, axum::Json(crate::error::ErrorBody { code: "not_found", message: "no such endpoint".into() })).into_response()
}

/// Serves the SPA. Hashed assets under `/assets/` are immutable; everything
/// else falls back to `index.html` (client-side routing) with no-cache.
async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    if let Some(file) = WEB_DIST.get_file(path) {
        return file_response(path, file.contents(), path.starts_with("assets/"));
    }
    match WEB_DIST.get_file("index.html") {
        Some(index) => file_response("index.html", index.contents(), false),
        None => (StatusCode::NOT_FOUND, "frontend not built: run `make web`").into_response(),
    }
}

fn file_response(path: &str, bytes: &'static [u8], immutable: bool) -> Response {
    let mime = mime_for(path);
    let cache = if immutable { "public, max-age=31536000, immutable" } else { "no-cache" };
    (
        [
            (header::CONTENT_TYPE, HeaderValue::from_static(mime)),
            (header::CACHE_CONTROL, HeaderValue::from_static(cache)),
        ],
        bytes,
    )
        .into_response()
}

fn mime_for(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("html") => "text/html; charset=utf-8",
        Some("js") | Some("mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("ico") => "image/x-icon",
        Some("webp") => "image/webp",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("wasm") => "application/wasm",
        Some("txt") => "text/plain; charset=utf-8",
        Some("webmanifest") => "application/manifest+json",
        _ => "application/octet-stream",
    }
}
