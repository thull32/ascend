//! In-process rate limiting keyed by client IP (and by user for AI routes).
//!
//! In-memory is the right call for a single-instance deployment; the state
//! is per process. If we scale horizontally the same interface can be backed
//! by Redis. Limits are deliberately generous for normal use and tight for
//! abuse-prone endpoints (auth, AI).
use std::net::{IpAddr, SocketAddr};
use std::num::NonZeroU32;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::{Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;
use governor::clock::DefaultClock;
use governor::state::keyed::DefaultKeyedStateStore;
use governor::{Quota, RateLimiter};

use crate::error::ErrorBody;
use crate::state::AppState;

type Keyed<K> = RateLimiter<K, DefaultKeyedStateStore<K>, DefaultClock>;

pub struct Limiters {
    /// Login/register: 10 per minute per IP, burst 10.
    pub auth: Keyed<IpAddr>,
    /// Everything else: 300 per minute per IP.
    pub general: Keyed<IpAddr>,
    /// AI routes: 20 per minute per IP (the daily budget is enforced separately).
    pub ai: Keyed<IpAddr>,
}

impl Limiters {
    pub fn new() -> Self {
        let per_min = |n: u32| Quota::per_minute(NonZeroU32::new(n).expect("non-zero"));
        Self {
            auth: RateLimiter::keyed(per_min(10)),
            general: RateLimiter::keyed(per_min(300)),
            ai: RateLimiter::keyed(per_min(20)),
        }
    }
}

impl Default for Limiters {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy)]
pub enum Bucket {
    Auth,
    General,
    Ai,
}

/// Resolves the client IP. Behind a proxy, only a header the proxy itself
/// sets (and overwrites) is trustworthy: `X-Forwarded-For`'s first entry is
/// whatever the client sent. Railway sets `X-Real-IP`, so production is
/// configured with `CLIENT_IP_HEADER=x-real-ip`.
fn client_ip(req: &Request<Body>, header: Option<&str>) -> IpAddr {
    if let Some(name) = header
        && let Some(ip) = req.headers().get(name).and_then(|v| v.to_str().ok()).and_then(|v| v.trim().parse().ok())
    {
        return ip;
    }
    req.extensions().get::<ConnectInfo<SocketAddr>>().map(|c| c.0.ip()).unwrap_or(IpAddr::from([0, 0, 0, 0]))
}

pub async fn limit(bucket: Bucket, State(state): State<AppState>, req: Request<Body>, next: Next) -> Response {
    let ip = client_ip(&req, state.config.client_ip_header.as_deref());
    let limiters: &Arc<Limiters> = &state.limiter;
    let result = match bucket {
        Bucket::Auth => limiters.auth.check_key(&ip),
        Bucket::General => limiters.general.check_key(&ip),
        Bucket::Ai => limiters.ai.check_key(&ip),
    };
    if result.is_err() {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            [("retry-after", "60")],
            Json(ErrorBody { code: "rate_limited", message: "too many requests; slow down".into() }),
        )
            .into_response();
    }
    next.run(req).await
}
