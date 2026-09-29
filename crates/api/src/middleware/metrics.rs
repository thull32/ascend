//! Request metrics: one histogram of durations labelled by method, route
//! template and status (`http.server.request.duration`), which the
//! availability and latency SLOs are computed from (docs/SLO.md).
//!
//! The route template is only known after routing, but the request should be
//! timed from the outside so that responses produced before routing (rate
//! limits, CSRF refusals, timeouts) are counted too. So an inner route layer
//! stamps the matched template onto the response, and the outer layer times
//! the request and reads it back. Templates (`/api/problems/{slug}`) keep the
//! label set small; raw paths would not.
use std::time::Instant;

use ascend_core::metrics::{get, kv};
use axum::body::Body;
use axum::extract::MatchedPath;
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;

#[derive(Clone)]
struct RouteLabel(String);

/// Inner (route layer): copies the matched route template to the response.
pub async fn stamp_route(req: Request<Body>, next: Next) -> Response {
    let route = req.extensions().get::<MatchedPath>().map(|m| m.as_str().to_owned());
    let mut res = next.run(req).await;
    if let Some(route) = route {
        res.extensions_mut().insert(RouteLabel(route));
    }
    res
}

/// Outer: times every request. For a streamed response this is the time to
/// the headers, which is what a latency objective should measure.
pub async fn record(req: Request<Body>, next: Next) -> Response {
    let started = Instant::now();
    let method = req.method().as_str().to_owned();
    let api = req.uri().path().starts_with("/api");
    let res = next.run(req).await;
    let route = res
        .extensions()
        .get::<RouteLabel>()
        .map(|r| r.0.clone())
        .unwrap_or_else(|| if api { "/api (unrouted)" } else { "static" }.to_string());
    get().http_duration.record(
        started.elapsed().as_secs_f64(),
        &[
            kv("http.request.method", method),
            kv("http.route", route),
            kv("http.response.status_code", i64::from(res.status().as_u16())),
        ],
    );
    res
}
