//! Rate limiting in two tiers.
//!
//! **Shared (Postgres), for everything security-relevant.** Sign-up and
//! login per IP, password attempts per account (or per known device), model
//! calls and graded submissions per session live in `ascend_core::services::rate_limit`, so
//! every replica charges the same allowance. With in-process state, two
//! replicas would have doubled each of these.
//!
//! **Local (memory), for the general bucket.** 1,200 requests a minute per
//! IP only stops one client flooding cheap reads, so a per-replica
//! approximation is fine, and it avoids a database round trip on every
//! request.
//!
//! Per-user AI spend is capped separately by the daily budget in
//! `ascend_core::ai::budget`.
use std::net::{IpAddr, SocketAddr};
use std::num::NonZeroU32;
use std::time::Duration;

use ascend_core::services::rate_limit::{Quota as SharedQuota, SharedLimiter};
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

/// Sign-up and login: 30 per minute per IP. Loose enough for a class
/// signing up together behind one NAT address.
pub const AUTH_PER_IP: SharedQuota = SharedQuota::per_minute(30);
/// Password attempts: 10 per minute per account for unknown devices, and 10
/// per minute per known device. The per-account limit is what stops a
/// distributed attacker guessing one learner's password; the per-device one
/// means that attacker cannot spend the owner's allowance.
pub const PASSWORD_ATTEMPTS: SharedQuota = SharedQuota::per_minute(10);
/// Model-calling routes: 20 per minute per session (IP when there is no
/// session cookie). The daily budget is enforced separately.
pub const AI_PER_SESSION: SharedQuota = SharedQuota::per_minute(20);
/// Password-reset emails: 3 an hour per address, so nobody can flood a
/// stranger's inbox (the per-IP auth limit covers the rest).
pub const RESET_PER_ADDRESS: SharedQuota = SharedQuota { limit: 3, period: Duration::from_secs(3600) };
/// Verification emails: 3 an hour per account.
pub const VERIFY_PER_ACCOUNT: SharedQuota = SharedQuota { limit: 3, period: Duration::from_secs(3600) };
/// Graded submissions: 20 per minute per session. Each can hold a grading
/// slot for its whole time budget.
pub const GRADE_PER_SESSION: SharedQuota = SharedQuota::per_minute(20);

pub struct Limiters {
    /// Everything else: 1,200 per minute per IP, per replica.
    pub general: Keyed<IpAddr>,
    pub shared: SharedLimiter,
}

impl Limiters {
    pub fn new(shared: SharedLimiter) -> Self {
        let per_min = |n: u32| Quota::per_minute(NonZeroU32::new(n).expect("non-zero"));
        Self { general: RateLimiter::keyed(per_min(1200)), shared }
    }

    /// Drops local state for keys whose quota has fully replenished and
    /// sweeps shared keys whose time has passed. Called periodically.
    pub async fn prune(&self) {
        self.general.retain_recent();
        self.general.shrink_to_fit();
        if let Err(e) = self.shared.sweep().await {
            tracing::warn!(error = %e, "rate-limit sweep failed");
        }
    }

    /// Charges one password attempt, to the device when it is known for this
    /// account and to the account otherwise. Returns the response to send
    /// when the attempt is refused.
    pub async fn check_password_attempt(&self, email: &str, known_device: Option<&str>) -> Option<Response> {
        let key = match known_device {
            Some(device_hash) => format!("pw:device:{device_hash}"),
            // Bounded key: the address is not validated yet at this point.
            None => format!("pw:account:{}", email.trim().to_lowercase().chars().take(254).collect::<String>()),
        };
        self.charge(&key, PASSWORD_ATTEMPTS).await
    }

    /// Charges one request to a shared key; the response to send if refused.
    pub async fn charge(&self, key: &str, quota: SharedQuota) -> Option<Response> {
        match self.shared.check(key, quota).await {
            Ok(Ok(())) => None,
            Ok(Err(wait)) => {
                // The key's prefix names the bucket ("auth", "pw", "ai", ...).
                let bucket = key.split(':').next().unwrap_or("shared").to_string();
                ascend_core::metrics::get().rate_limited.add(1, &[ascend_core::metrics::kv("bucket", bucket)]);
                Some(throttled(wait))
            }
            Err(e) => {
                // Fail closed: these limits guard passwords and spend, and a
                // request that cannot reach Postgres would fail anyway.
                tracing::error!(error = %e, "shared rate limit unavailable");
                Some(
                    (
                        StatusCode::SERVICE_UNAVAILABLE,
                        Json(ErrorBody {
                            code: "unavailable",
                            message: "temporarily unavailable; retry shortly".into(),
                        }),
                    )
                        .into_response(),
                )
            }
        }
    }
}

/// The part of a session cookie that identifies it to the limiter: a digest,
/// so raw tokens are never stored. A forged cookie earns its own bucket but
/// is then rejected by authentication, and still counts against the per-IP
/// general bucket.
fn session_key(req: &Request<Body>) -> Option<String> {
    use sha2::{Digest, Sha256};
    let token = cookie(req, crate::extractors::SESSION_COOKIE)?;
    let digest = Sha256::digest(token.as_bytes());
    Some(digest[..16].iter().map(|b| format!("{b:02x}")).collect())
}

/// Reads one cookie from the request headers.
pub fn cookie<'a>(req: &'a Request<Body>, name: &str) -> Option<&'a str> {
    req.headers()
        .get_all(http::header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(n, _)| *n == name)
        .map(|(_, value)| value)
}

#[derive(Clone, Copy)]
pub enum Bucket {
    Auth,
    General,
    Ai,
    Grade,
}

/// Resolves the client IP. Behind a proxy, only a header the proxy itself
/// sets (and overwrites) is trustworthy: `X-Forwarded-For`'s first entry is
/// whatever the client sent. Railway sets `X-Real-IP`, so production is
/// configured with `CLIENT_IP_HEADER=x-real-ip`.
pub fn client_ip(req: &Request<Body>, header: Option<&str>) -> IpAddr {
    if let Some(name) = header
        && let Some(ip) = req.headers().get(name).and_then(|v| v.to_str().ok()).and_then(|v| v.trim().parse().ok())
    {
        return ip;
    }
    req.extensions().get::<ConnectInfo<SocketAddr>>().map(|c| c.0.ip()).unwrap_or(IpAddr::from([0, 0, 0, 0]))
}

pub async fn limit(bucket: Bucket, State(state): State<AppState>, req: Request<Body>, next: Next) -> Response {
    let ip = client_ip(&req, state.config.client_ip_header.as_deref());
    let limiters = &state.limiter;
    let refused = match bucket {
        Bucket::General => limiters.general.check_key(&ip).err().map(|not_until| {
            let wait = not_until.wait_time_from(DefaultClock::default().now());
            ascend_core::metrics::get().rate_limited.add(1, &[ascend_core::metrics::kv("bucket", "general")]);
            throttled(wait)
        }),
        Bucket::Auth => limiters.charge(&format!("auth:ip:{ip}"), AUTH_PER_IP).await,
        Bucket::Ai => {
            let key = session_key(&req).map_or_else(|| format!("ai:ip:{ip}"), |s| format!("ai:session:{s}"));
            limiters.charge(&key, AI_PER_SESSION).await
        }
        Bucket::Grade => {
            let key = session_key(&req).map_or_else(|| format!("grade:ip:{ip}"), |s| format!("grade:session:{s}"));
            limiters.charge(&key, GRADE_PER_SESSION).await
        }
    };
    match refused {
        Some(response) => response,
        None => next.run(req).await,
    }
}

/// 429 telling the client when a request will next be allowed (GCRA knows
/// this), rounded up to whole seconds.
fn throttled(wait: Duration) -> Response {
    let secs = wait.as_secs() + u64::from(wait.subsec_nanos() > 0);
    (
        StatusCode::TOO_MANY_REQUESTS,
        [("retry-after", secs.max(1).to_string())],
        Json(ErrorBody { code: "rate_limited", message: "too many requests; slow down".into() }),
    )
        .into_response()
}
