//! CSRF protection for cookie-authenticated JSON APIs.
//!
//! Two independent layers:
//! 1. The session cookie is `SameSite=Lax`, so browsers don't attach it to
//!    cross-site POSTs.
//! 2. For every state-changing request we also require that the `Origin`
//!    (or `Referer`) header, when present, matches the configured public
//!    origin, and that the request carries the custom `X-Requested-With`
//!    header — a cross-origin page cannot set custom headers without a CORS
//!    preflight, which we never grant.
use axum::body::Body;
use axum::extract::State;
use axum::http::{Method, Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::error::ErrorBody;
use crate::state::AppState;

pub async fn enforce(State(state): State<AppState>, req: Request<Body>, next: Next) -> Response {
    let mutating = matches!(*req.method(), Method::POST | Method::PUT | Method::PATCH | Method::DELETE);
    if mutating {
        let headers = req.headers();
        let expected = state.config.public_origin.trim_end_matches('/');
        let origin_ok = match headers.get("origin").and_then(|v| v.to_str().ok()) {
            Some(origin) => origin.trim_end_matches('/') == expected || is_local_dev(origin, expected),
            None => match headers.get("referer").and_then(|v| v.to_str().ok()) {
                Some(referer) => referer.starts_with(expected) || is_local_dev(referer, expected),
                None => true, // non-browser clients (curl, tests): no ambient cookie credentials
            },
        };
        let header_ok = headers.get("x-requested-with").is_some();
        if !origin_ok || !header_ok {
            return (
                StatusCode::FORBIDDEN,
                Json(ErrorBody { code: "csrf", message: "cross-site request rejected".into() }),
            )
                .into_response();
        }
    }
    next.run(req).await
}

/// In development the Vite dev server (5173) proxies to the API (8080); allow
/// localhost origins only when the configured origin itself is localhost.
fn is_local_dev(origin: &str, expected: &str) -> bool {
    expected.starts_with("http://localhost") && (origin.starts_with("http://localhost") || origin.starts_with("http://127.0.0.1"))
}
