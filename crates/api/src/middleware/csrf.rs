//! CSRF protection for cookie-authenticated JSON APIs.
//!
//! Two independent layers:
//! 1. The session cookie is `SameSite=Lax`, so browsers don't attach it to
//!    cross-site POSTs.
//! 2. For every state-changing request we also require that the `Origin`
//!    (or, failing that, the `Referer`) has exactly the configured origin, and
//!    that the request carries the custom `X-Requested-With` header: a
//!    cross-origin page cannot set custom headers without a CORS preflight,
//!    which we never grant.
//!
//! Origins are compared exactly (scheme, host and port). A prefix match
//! would accept `https://ascend.example.evil.net` for `https://ascend.example`.
use axum::Json;
use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderMap, Method, Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::error::ErrorBody;
use crate::state::AppState;

pub async fn enforce(State(state): State<AppState>, req: Request<Body>, next: Next) -> Response {
    let mutating = matches!(*req.method(), Method::POST | Method::PUT | Method::PATCH | Method::DELETE);
    if mutating && !allowed(req.headers(), &state.config.public_origin) {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorBody { code: "csrf", message: "cross-site request rejected".into() }),
        )
            .into_response();
    }
    next.run(req).await
}

/// The decision, separated from Axum so it can be unit tested exhaustively.
pub fn allowed(headers: &HeaderMap, public_origin: &str) -> bool {
    if headers.get("x-requested-with").is_none() {
        return false;
    }
    let expected = public_origin.trim_end_matches('/');
    let header = |name: &str| headers.get(name).and_then(|v| v.to_str().ok());
    let claimed = match (header("origin"), header("referer")) {
        (Some(origin), _) => Some(origin.trim_end_matches('/')),
        (None, Some(referer)) => origin_of(referer),
        // Non-browser clients (curl, tests) send neither and carry no ambient
        // cookie credentials, so there is nothing to forge.
        (None, None) => return true,
    };
    match claimed {
        Some(o) => o == expected || is_local_dev(o, expected),
        None => false,
    }
}

/// `scheme://host[:port]` of a URL, without path, query or fragment.
fn origin_of(url: &str) -> Option<&str> {
    let after_scheme = url.find("://")? + 3;
    let end = url[after_scheme..].find(['/', '?', '#']).map(|i| after_scheme + i).unwrap_or(url.len());
    Some(&url[..end])
}

/// In development the Vite dev server (5173) proxies to the API (8080): allow
/// exact localhost origins, but only when the configured origin is localhost.
fn is_local_dev(origin: &str, expected: &str) -> bool {
    let local = |o: &str| {
        let host_port = o.strip_prefix("http://").unwrap_or("");
        let host = host_port.split(':').next().unwrap_or("");
        host == "localhost" || host == "127.0.0.1"
    };
    local(expected) && local(origin)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&'static str, &str)]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for (k, v) in pairs {
            h.insert(*k, v.parse().unwrap());
        }
        h
    }

    const PROD: &str = "https://ascend.example";

    #[test]
    fn requires_the_custom_header() {
        assert!(!allowed(&headers(&[("origin", PROD)]), PROD));
    }

    #[test]
    fn exact_origin_match_only() {
        let ok = |o: &str| allowed(&headers(&[("x-requested-with", "fetch"), ("origin", o)]), PROD);
        assert!(ok("https://ascend.example"));
        assert!(ok("https://ascend.example/"));
        assert!(!ok("https://ascend.example.evil.net"));
        assert!(!ok("http://ascend.example"));
        assert!(!ok("https://ascend.example:8443"));
        assert!(!ok("null"));
    }

    #[test]
    fn referer_is_reduced_to_its_origin() {
        let ok = |r: &str| allowed(&headers(&[("x-requested-with", "fetch"), ("referer", r)]), PROD);
        assert!(ok("https://ascend.example/learn/foo?x=1"));
        assert!(!ok("https://ascend.example.evil.net/learn"));
        assert!(!ok("not a url"));
    }

    #[test]
    fn localhost_only_in_local_dev() {
        let h = headers(&[("x-requested-with", "fetch"), ("origin", "http://localhost:5173")]);
        assert!(allowed(&h, "http://localhost:8080"));
        assert!(!allowed(&h, PROD));
        let evil = headers(&[("x-requested-with", "fetch"), ("origin", "http://localhost.evil.net")]);
        assert!(!allowed(&evil, "http://localhost:8080"));
    }

    #[test]
    fn headerless_clients_are_allowed() {
        assert!(allowed(&headers(&[("x-requested-with", "curl")]), PROD));
    }
}
