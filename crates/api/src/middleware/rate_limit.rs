//! In-process rate limiting. Auth and general traffic are keyed by client
//! IP; model-calling routes are keyed by session, so learners sharing one
//! NAT address do not throttle each other. Per-user AI spend is capped
//! separately by the daily budget in `ascend_core::ai::budget`.
//!
//! In-memory is the right call for a single-instance deployment; the state
//! is per process. If we scale horizontally the same interface can be backed
//! by Redis. Limits are deliberately generous for normal use and tight for
//! abuse-prone endpoints (auth, AI).
use std::net::{IpAddr, SocketAddr};
use std::num::NonZeroU32;
use std::sync::Arc;

use axum::Json;
use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::{Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use governor::clock::{Clock, DefaultClock};
use governor::state::keyed::DefaultKeyedStateStore;
use governor::{Quota, RateLimiter};

use crate::error::ErrorBody;
use crate::state::AppState;

type Keyed<K> = RateLimiter<K, DefaultKeyedStateStore<K>, DefaultClock>;

pub struct Limiters {
    /// Login/register: 30 per minute per IP. Loose enough for a class
    /// signing up together behind one NAT address.
    pub auth: Keyed<IpAddr>,
    /// Password attempts: 10 per minute per account (login and account
    /// deletion). This, not the per-IP bucket, is what stops a distributed
    /// attacker guessing one learner's password.
    pub password_attempts: Keyed<String>,
    /// Everything else: 1,200 per minute per IP. Deliberately loose: a whole
    /// class or office can share one NAT address, and every route that is
    /// expensive (password hashing, AI) has its own tight bucket. This one
    /// only stops a single client from flooding cheap reads.
    pub general: Keyed<IpAddr>,
    /// Model-calling routes: 20 per minute per session (IP when there is no
    /// session cookie). The daily budget is enforced separately.
    pub ai: Keyed<ClientKey>,
}

impl Limiters {
    pub fn new() -> Self {
        let per_min = |n: u32| Quota::per_minute(NonZeroU32::new(n).expect("non-zero"));
        Self {
            auth: RateLimiter::keyed(per_min(30)),
            password_attempts: RateLimiter::keyed(per_min(10)),
            general: RateLimiter::keyed(per_min(1200)),
            ai: RateLimiter::keyed(per_min(20)),
        }
    }
}

impl Limiters {
    /// Drops per-IP state for keys whose quota has fully replenished, so the
    /// maps do not grow with every IP ever seen. Called periodically.
    pub fn prune(&self) {
        for l in [&self.auth, &self.general] {
            l.retain_recent();
            l.shrink_to_fit();
        }
        self.ai.retain_recent();
        self.ai.shrink_to_fit();
        self.password_attempts.retain_recent();
        self.password_attempts.shrink_to_fit();
    }

    /// Charges one password attempt to `email`'s account. Returns the 429 to
    /// send when the account is out of attempts.
    pub fn check_password_attempt(&self, email: &str) -> Option<Response> {
        // Bounded key: the address is not validated yet at this point.
        let key: String = email.trim().to_lowercase().chars().take(254).collect();
        self.password_attempts.check_key(&key).err().map(|not_until| throttled(&not_until))
    }
}

impl Default for Limiters {
    fn default() -> Self {
        Self::new()
    }
}

/// Who a request is charged to. Sessions are identified by a digest of the
/// cookie so raw tokens never sit in the limiter's memory. A forged cookie
/// earns its own bucket but is then rejected by authentication, and still
/// counts against the per-IP general bucket.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum ClientKey {
    Ip(IpAddr),
    Session([u8; 16]),
}

fn session_key(req: &Request<Body>) -> Option<[u8; 16]> {
    use sha2::{Digest, Sha256};
    let token = req
        .headers()
        .get_all(http::header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(name, _)| *name == crate::extractors::SESSION_COOKIE)
        .map(|(_, value)| value)?;
    let digest = Sha256::digest(token.as_bytes());
    let mut key = [0u8; 16];
    key.copy_from_slice(&digest[..16]);
    Some(key)
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
        Bucket::Ai => limiters.ai.check_key(&session_key(&req).map_or(ClientKey::Ip(ip), ClientKey::Session)),
    };
    match result {
        Ok(()) => next.run(req).await,
        Err(not_until) => throttled(&not_until),
    }
}

/// 429 telling the client exactly when a request will next be allowed (GCRA
/// knows this), rounded up to whole seconds.
fn throttled(not_until: &governor::NotUntil<<DefaultClock as governor::clock::Clock>::Instant>) -> Response {
    let wait = not_until.wait_time_from(DefaultClock::default().now());
    let secs = wait.as_secs() + u64::from(wait.subsec_nanos() > 0);
    (
        StatusCode::TOO_MANY_REQUESTS,
        [("retry-after", secs.max(1).to_string())],
        Json(ErrorBody { code: "rate_limited", message: "too many requests; slow down".into() }),
    )
        .into_response()
}
