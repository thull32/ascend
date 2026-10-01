//! One public host. Requests to a host in `REDIRECT_HOSTS` (the platform's
//! own domain, `www`) get a 308 to the same path on `PUBLIC_ORIGIN`, which
//! keeps the method and body. Only listed hosts redirect, so the platform's
//! health checks and private-network calls, which use other host names, are
//! served as before.
use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::state::AppState;

pub async fn redirect(State(state): State<AppState>, req: Request<Body>, next: Next) -> Response {
    let hosts = &state.config.redirect_hosts;
    if hosts.is_empty() {
        return next.run(req).await;
    }
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .map(|h| h.rsplit_once(':').map_or(h, |(name, port)| if port.parse::<u16>().is_ok() { name } else { h }))
        .map(str::to_ascii_lowercase);
    if !host.is_some_and(|h| hosts.contains(&h)) {
        return next.run(req).await;
    }
    let target = format!(
        "{}{}",
        state.config.public_origin.trim_end_matches('/'),
        req.uri().path_and_query().map_or("/", |p| p.as_str())
    );
    (StatusCode::PERMANENT_REDIRECT, [(header::LOCATION, target)]).into_response()
}
