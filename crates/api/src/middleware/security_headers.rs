//! Defence-in-depth response headers. The CSP names every third-party origin
//! the app deliberately uses: jsDelivr (the Pyodide runtime and its
//! packages), PyPI (pure-Python wheels Pyodide installs on import) and Google
//! Fonts. `unsafe-eval` and `wasm-unsafe-eval` exist for the in-browser code
//! runners: the JS sandbox evaluates learner code with `new Function` and
//! Pyodide compiles WebAssembly. Worker scripts are served through this same
//! middleware, so the runners run under this policy too; there is no
//! separate worker policy.
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
            "style-src 'self' 'unsafe-inline'; ",
            "font-src 'self' data:; ",
            "img-src 'self' data: blob:; ",
            "connect-src 'self' https://cdn.jsdelivr.net https://pypi.org https://files.pythonhosted.org; ",
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
        )),
    );
    res
}
