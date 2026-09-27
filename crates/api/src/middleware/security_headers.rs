//! Defence-in-depth response headers. The CSP allows the CDN-hosted runtimes
//! we deliberately load (Pyodide from jsDelivr) and nothing else. `unsafe-eval`
//! is required for the in-browser code runners (Pyodide and the JS sandbox
//! both need `new Function`/WebAssembly); the runners live in Web Workers,
//! which get a separate, stricter policy via the worker script itself.
use axum::http::{HeaderValue, header};
use axum::{body::Body, http::Request, middleware::Next, response::Response};

pub async fn apply(req: Request<Body>, next: Next) -> Response {
    let mut res = next.run(req).await;
    let h = res.headers_mut();
    h.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    h.insert("x-frame-options", HeaderValue::from_static("DENY"));
    h.insert("referrer-policy", HeaderValue::from_static("strict-origin-when-cross-origin"));
    h.insert("permissions-policy", HeaderValue::from_static("camera=(), microphone=(), geolocation=()"));
    h.insert(header::STRICT_TRANSPORT_SECURITY, HeaderValue::from_static("max-age=31536000; includeSubDomains"));
    h.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(concat!(
            "default-src 'self'; ",
            "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net blob:; ",
            "worker-src 'self' blob:; ",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; ",
            "font-src 'self' https://fonts.gstatic.com data:; ",
            "img-src 'self' data: blob:; ",
            "connect-src 'self' https://cdn.jsdelivr.net https://pypi.org https://files.pythonhosted.org; ",
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
        )),
    );
    res
}
