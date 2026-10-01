//! End-to-end API tests against a real Postgres, driving the production
//! router in-process with `tower::ServiceExt::oneshot`.
//!
//! Requires `TEST_DATABASE_URL` (CI provides a Postgres service). When it is
//! unset the tests print a notice and pass, so `cargo test` works offline;
//! when `CI` is set they fail instead, so CI can never pass by skipping.
//! Every test registers its own uniquely named user, so tests can share one
//! database and run in parallel.
use std::sync::Arc;
use std::time::Duration;

use ascend_api::{app, state};
use ascend_core::config::{AiConfig, Config, Environment};
use ascend_core::content::{ContentSource, load_curriculum};
use axum::Router;
use axum::body::Body;
use http::{Request, StatusCode, header};
use http_body_util::BodyExt;
use sea_orm::{ConnectionTrait, DatabaseConnection, Statement};
use sea_orm_migration::MigratorTrait;
use secrecy::SecretString;
use serde_json::{Value, json};
use tower::ServiceExt;

static MIGRATED: tokio::sync::OnceCell<()> = tokio::sync::OnceCell::const_new();

struct TestApp {
    router: Router,
    db: DatabaseConnection,
    state: state::AppState,
    /// Each test app is a distinct client address: the per-IP limits are
    /// shared through Postgres, and parallel tests must not share one.
    client_ip: String,
    /// Every email the app sent.
    emails: Arc<std::sync::Mutex<Vec<ascend_core::email::Email>>>,
}

fn config(url: &str) -> Config {
    Config {
        bind_addr: "127.0.0.1:0".into(),
        database_url: SecretString::from(url.to_string()),
        database_pool_max: 20,
        public_origin: "http://localhost:8080".into(),
        redirect_hosts: vec!["old.example.test".into()],
        cookie_secure: false,
        session_ttl: Duration::from_secs(3600),
        session_idle: Duration::from_secs(1800),
        ai: AiConfig {
            api_key: None,
            model: "test-model".into(),
            base_url: "http://127.0.0.1:9".into(),
            daily_output_token_budget: 1000,
            daily_input_token_budget: 100_000,
            daily_request_budget: 10,
            request_timeout: Duration::from_secs(5),
        },
        log_json: false,
        env: Environment::Development,
        client_ip_header: Some("x-test-client-ip".into()),
        grader_dir: grader_dir(),
        grader_slots: None,
        grader_url: None,
        grader_token: None,
        pwned_passwords_url: None,
        email: ascend_core::config::EmailConfig { resend_api_key: None, from: None, base_url: None },
        contact_email: None,
    }
}

fn grader_dir() -> std::path::PathBuf {
    std::env::var("GRADER_DIR")
        .map(Into::into)
        .unwrap_or_else(|_| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../runtimes/grader"))
}

/// One grader for every test: compiling the runtimes takes a second.
/// Absent runtimes skip the grading tests locally; CI sets GRADER_REQUIRED.
fn grader() -> Option<ascend_grader::Grader> {
    static GRADER: std::sync::OnceLock<Option<ascend_grader::Grader>> = std::sync::OnceLock::new();
    GRADER
        .get_or_init(|| match ascend_grader::Grader::load(&grader_dir(), ascend_grader::Options::default()) {
            Ok(g) => Some(g),
            Err(e) if std::env::var_os("GRADER_REQUIRED").is_none() => {
                eprintln!("grader unavailable ({e}); grading tests skip");
                None
            }
            Err(e) => panic!("{e}"),
        })
        .clone()
}

async fn test_app() -> Option<TestApp> {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        // Offline developer runs may skip; CI must never pass by skipping.
        assert!(std::env::var_os("CI").is_none(), "TEST_DATABASE_URL must be set in CI");
        eprintln!("TEST_DATABASE_URL not set; skipping API integration test");
        return None;
    };
    let cfg = config(&url);
    MIGRATED
        .get_or_init(|| async {
            let db = state::connect_db(&cfg).await.expect("connect");
            migration::Migrator::up(&db, None).await.expect("migrate");
        })
        .await;
    let db = state::connect_db(&cfg).await.expect("connect");
    let fixtures = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/content");
    let curriculum = load_curriculum(&ContentSource::Disk(fixtures)).expect("fixture content loads");
    let mut st = state::AppState::build(
        Arc::new(cfg),
        db.clone(),
        curriculum,
        grader().map(ascend_core::services::grading::GradingBackend::Local),
    )
    .expect("state");
    let emails = Arc::new(std::sync::Mutex::new(Vec::new()));
    st.mailer = ascend_core::email::Mailer::Memory(emails.clone());
    let id = uuid::Uuid::now_v7().as_u128();
    let client_ip = format!("fd00::{:x}:{:x}", (id >> 16) & 0xffff, id & 0xffff);
    Some(TestApp { router: app::build(st.clone()), db, state: st, client_ip, emails })
}

struct Res {
    status: StatusCode,
    headers: http::HeaderMap,
    body: Value,
}

impl TestApp {
    async fn call(&self, method: &str, path: &str, body: Option<Value>, cookie: Option<&str>, csrf: bool) -> Res {
        let mut req = Request::builder().method(method).uri(path).header("x-test-client-ip", &self.client_ip);
        if csrf {
            req = req.header("x-requested-with", "fetch");
        }
        if let Some(c) = cookie {
            req = req.header(header::COOKIE, c);
        }
        let req = match body {
            Some(b) => req.header(header::CONTENT_TYPE, "application/json").body(Body::from(b.to_string())),
            None => req.body(Body::empty()),
        }
        .unwrap();
        let res = self.router.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let headers = res.headers().clone();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        let body = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        Res { status, headers, body }
    }

    async fn register(&self) -> (String, Value) {
        let email = format!("t-{}@example.com", uuid::Uuid::now_v7());
        let r = self
            .call(
                "POST",
                "/api/auth/register",
                Some(json!({"email": email, "password": "correct-horse-battery", "display_name": "Tester"})),
                None,
                true,
            )
            .await;
        assert_eq!(r.status, StatusCode::OK, "register: {:?}", r.body);
        let set_cookie = r
            .headers
            .get_all(header::SET_COOKIE)
            .iter()
            .filter_map(|v| v.to_str().ok())
            .find(|v| v.starts_with("ascend_session="))
            .expect("session cookie");
        assert!(set_cookie.contains("HttpOnly"), "cookie must be HttpOnly");
        assert!(set_cookie.contains("SameSite=Lax"), "cookie must be SameSite=Lax");
        let cookie = set_cookie.split(';').next().unwrap().to_string();
        (cookie, r.body)
    }
}

#[tokio::test]
async fn health_and_security_headers() {
    let Some(app) = test_app().await else { return };
    let r = app.call("GET", "/api/readyz", None, None, false).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["database"], true);
    assert_eq!(r.body["ai"], false);
    for h in [
        "content-security-policy",
        "x-frame-options",
        "x-content-type-options",
        "strict-transport-security",
        "x-request-id",
    ] {
        assert!(r.headers.contains_key(h), "missing header {h}");
    }
    let r = app.call("GET", "/api/nope", None, None, false).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    assert_eq!(r.body["code"], "not_found");
}

#[tokio::test]
async fn auth_lifecycle_and_session_storage() {
    let Some(app) = test_app().await else { return };
    let (cookie, user) = app.register().await;
    assert!(user.get("password_hash").is_none(), "hash must never be serialised");

    let me = app.call("GET", "/api/auth/me", None, Some(&cookie), false).await;
    assert_eq!(me.status, StatusCode::OK);
    assert_eq!(me.body["email"], user["email"]);

    // The raw token must not be stored: only its SHA-256.
    let token = cookie.split_once('=').unwrap().1.to_string();
    let rows = app
        .db
        .query_all_raw(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            "SELECT count(*)::bigint AS n FROM sessions WHERE token_hash = $1",
            [token.clone().into()],
        ))
        .await
        .unwrap();
    let n: i64 = rows[0].try_get("", "n").unwrap();
    assert_eq!(n, 0, "raw session token found in the database");

    let out = app.call("POST", "/api/auth/logout", Some(json!({})), Some(&cookie), true).await;
    assert_eq!(out.status, StatusCode::OK);
    let me = app.call("GET", "/api/auth/me", None, Some(&cookie), false).await;
    assert_eq!(me.status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn login_errors_do_not_leak_account_existence() {
    let Some(app) = test_app().await else { return };
    let (_, user) = app.register().await;
    let email = user["email"].as_str().unwrap();
    let wrong_pw = app
        .call("POST", "/api/auth/login", Some(json!({"email": email, "password": "wrong-password-123"})), None, true)
        .await;
    let no_user = app
        .call(
            "POST",
            "/api/auth/login",
            Some(json!({"email": "nobody-xyz@example.com", "password": "wrong-password-123"})),
            None,
            true,
        )
        .await;
    assert_eq!(wrong_pw.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(wrong_pw.body, no_user.body, "responses must be identical");

    let dup = app
        .call(
            "POST",
            "/api/auth/register",
            Some(json!({"email": email, "password": "correct-horse-battery", "display_name": "Dup"})),
            None,
            true,
        )
        .await;
    assert_eq!(dup.status, StatusCode::CONFLICT);

    let weak = app
        .call(
            "POST",
            "/api/auth/register",
            Some(json!({"email": "weak@example.com", "password": "short", "display_name": "W"})),
            None,
            true,
        )
        .await;
    assert_eq!(weak.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(weak.body["message"].as_str().unwrap().contains("password"));
    // 14 characters: one short of NIST's minimum for a single factor.
    let body = json!({"email": "fourteen@example.com", "password": "fourteen-chars", "display_name": "W"});
    let short = app.call("POST", "/api/auth/register", Some(body), None, true).await;
    assert_eq!(short.status, StatusCode::UNPROCESSABLE_ENTITY);
}

/// A stand-in for the Pwned Passwords range API that lists one password.
async fn stub_pwned_passwords(breached: &'static str) -> String {
    use sha1::{Digest, Sha1};
    let hash: String = Sha1::digest(breached.as_bytes()).iter().map(|b| format!("{b:02X}")).collect();
    let router = axum::Router::new().route(
        "/range/{prefix}",
        axum::routing::get(move |axum::extract::Path(prefix): axum::extract::Path<String>| {
            let hash = hash.clone();
            async move {
                // Padding (count 0) the way the real service adds it.
                let mut body = String::from("0000000000000000000000000000000000A:0\r\n");
                if hash.starts_with(&prefix) {
                    body.push_str(&format!("{}:42\r\n", &hash[5..]));
                }
                body
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    format!("http://{addr}")
}

#[tokio::test]
async fn breached_passwords_are_refused_at_sign_up_and_an_outage_does_not_block_it() {
    use ascend_core::auth::breached::BreachedPasswords;
    use ascend_core::auth::service::{AuthService, RegisterInput};
    let Some(app) = test_app().await else { return };
    let url = stub_pwned_passwords("a-breached-passphrase-123").await;
    let auth = AuthService::new(app.db.clone(), Duration::from_secs(3600), Duration::from_secs(1800))
        .with_breach_check(BreachedPasswords::new(url).unwrap());
    let input = |password: &str| RegisterInput {
        email: format!("t-{}@example.com", uuid::Uuid::now_v7()),
        password: password.into(),
        display_name: "T".into(),
        timezone: None,
    };
    match auth.register(input("a-breached-passphrase-123"), None).await {
        Err(ascend_core::AppError::Validation(m)) => assert!(m.contains("data breach"), "{m}"),
        Err(e) => panic!("expected a validation error, got {e:?}"),
        Ok(_) => panic!("a breached password was accepted"),
    }
    assert!(auth.register(input("an-unbreached-passphrase-456"), None).await.is_ok());

    // Nothing listening: the check fails open.
    let down = AuthService::new(app.db.clone(), Duration::from_secs(3600), Duration::from_secs(1800))
        .with_breach_check(BreachedPasswords::new("http://127.0.0.1:9").unwrap());
    assert!(down.register(input("a-breached-passphrase-123"), None).await.is_ok());
}

impl TestApp {
    /// Waits for the background task to send an email to `to` whose subject
    /// contains `subject`, and returns the token in its link.
    async fn link_token(&self, to: &str, subject: &str) -> String {
        for _ in 0..100 {
            let found =
                self.emails.lock().unwrap().iter().rev().find(|e| e.to == to && e.subject.contains(subject)).cloned();
            if let Some(e) = found {
                let at = e.text.find("#token=").expect("link with a token");
                return e.text[at + 7..].split_whitespace().next().unwrap().to_string();
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("no '{subject}' email to {to}");
    }
}

fn session_from(r: &Res) -> String {
    r.headers
        .get_all(header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .find(|v| v.starts_with("ascend_session="))
        .map(|v| v.split(';').next().unwrap().to_string())
        .expect("session cookie")
}

#[tokio::test]
async fn a_forgotten_password_is_reset_by_email_and_signs_out_everywhere() {
    let Some(app) = test_app().await else { return };
    let (old_session, me) = app.register().await;
    let email = me["email"].as_str().unwrap().to_string();

    let r =
        app.call("POST", "/api/auth/password/forgot", Some(json!({"email": email.to_uppercase()})), None, true).await;
    assert_eq!(r.status, StatusCode::OK, "{:?}", r.body);
    let token = app.link_token(&email, "Reset").await;

    // A weak password is refused without spending the link.
    let weak = app
        .call("POST", "/api/auth/password/reset", Some(json!({"token": token, "password": "short"})), None, true)
        .await;
    assert_eq!(weak.status, StatusCode::UNPROCESSABLE_ENTITY);

    let body = json!({"token": token, "password": "a-brand-new-passphrase"});
    let reset = app.call("POST", "/api/auth/password/reset", Some(body.clone()), None, true).await;
    assert_eq!(reset.status, StatusCode::OK, "{:?}", reset.body);
    assert_eq!(reset.body["email_verified"], true, "following the link proves the address");
    let new_session = session_from(&reset);
    assert_eq!(app.call("GET", "/api/auth/me", None, Some(&new_session), false).await.status, StatusCode::OK);
    assert_eq!(
        app.call("GET", "/api/auth/me", None, Some(&old_session), false).await.status,
        StatusCode::UNAUTHORIZED,
        "every other session is signed out"
    );
    // The link works once.
    let again = app.call("POST", "/api/auth/password/reset", Some(body), None, true).await;
    assert_eq!(again.status, StatusCode::UNPROCESSABLE_ENTITY);
    // The new password signs in; the old one does not.
    let login = |password: &str| json!({"email": email, "password": password});
    let ok = app.call("POST", "/api/auth/login", Some(login("a-brand-new-passphrase")), None, true).await;
    assert_eq!(ok.status, StatusCode::OK);
    let old = app.call("POST", "/api/auth/login", Some(login("correct-horse-battery")), None, true).await;
    assert_eq!(old.status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn reset_requests_reveal_nothing_and_links_expire() {
    let Some(app) = test_app().await else { return };
    let before = app.emails.lock().unwrap().len();
    let unknown = format!("nobody-{}@example.com", uuid::Uuid::now_v7());
    let r = app.call("POST", "/api/auth/password/forgot", Some(json!({"email": unknown})), None, true).await;
    assert_eq!(r.status, StatusCode::OK, "same answer for an unknown address");
    app.state.tasks.close();
    app.state.tasks.wait().await;
    assert_eq!(app.emails.lock().unwrap().len(), before, "and no email");

    let Some(app) = test_app().await else { return };
    let (_, me) = app.register().await;
    let email = me["email"].as_str().unwrap().to_string();
    app.call("POST", "/api/auth/password/forgot", Some(json!({"email": email})), None, true).await;
    let token = app.link_token(&email, "Reset").await;
    // Only this account's link: tests share the database and run in parallel.
    app.db
        .execute_raw(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            "UPDATE email_tokens SET expires_at = now() - interval '1 minute' WHERE purpose = 'reset' AND email = $1",
            [email.clone().into()],
        ))
        .await
        .unwrap();
    let body = json!({"token": token, "password": "a-brand-new-passphrase"});
    let expired = app.call("POST", "/api/auth/password/reset", Some(body), None, true).await;
    assert_eq!(expired.status, StatusCode::UNPROCESSABLE_ENTITY, "{:?}", expired.body);

    // Three requests an hour per address: nobody can flood a stranger's inbox.
    for _ in 0..3 {
        app.call("POST", "/api/auth/password/forgot", Some(json!({"email": email})), None, true).await;
    }
    let flood = app.call("POST", "/api/auth/password/forgot", Some(json!({"email": email})), None, true).await;
    assert_eq!(flood.status, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn sign_up_sends_a_verification_link() {
    let Some(app) = test_app().await else { return };
    let (cookie, me) = app.register().await;
    assert_eq!(me["email_verified"], false);
    let email = me["email"].as_str().unwrap().to_string();
    let token = app.link_token(&email, "Confirm").await;
    let r = app.call("POST", "/api/auth/email/verify", Some(json!({"token": token})), None, true).await;
    assert_eq!(r.status, StatusCode::OK, "{:?}", r.body);
    assert_eq!(r.body["email_verified"], true);
    let again = app.call("POST", "/api/auth/email/verify", Some(json!({"token": token})), None, true).await;
    assert_eq!(again.status, StatusCode::UNPROCESSABLE_ENTITY, "single use");
    let resend = app.call("POST", "/api/auth/email/resend", None, Some(&cookie), true).await;
    assert_eq!(resend.body["already_verified"], true);
}

#[tokio::test]
async fn retention_keeps_what_the_privacy_page_promises() {
    use ascend_core::services::retention::{Policy, run};
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    let id = user_id(&app, &cookie).await;
    let db = &app.db;
    let exec = |sql: String| async move {
        db.execute_raw(Statement::from_string(sea_orm::DatabaseBackend::Postgres, sql)).await.unwrap();
    };
    let sub = |target: &str, passed: bool, days: i32| {
        format!(
            "INSERT INTO submissions (id, user_id, target_kind, target_slug, language, code, passed, passed_count, \
             total_count, runtime_ms, results, created_at) VALUES (gen_random_uuid(), '{id}', 'problem', '{target}', \
             'python', '-- {passed} {days}', {passed}, 0, 1, 1, '[]', now() - interval '{days} days')"
        )
    };
    // Target T: an old fail, an old pass, a fail after the pass, a recent fail.
    for (passed, days) in [(false, 200), (true, 190), (false, 185), (false, 1)] {
        exec(sub("retention-t", passed, days)).await;
    }
    // Target U: one old attempt, which is also the latest.
    exec(sub("retention-u", false, 300)).await;
    exec(format!(
        "INSERT INTO conversations (id, user_id, title, context, created_at, updated_at) VALUES \
         (gen_random_uuid(), '{id}', 'old', '{{}}', now() - interval '500 days', now() - interval '400 days'), \
         (gen_random_uuid(), '{id}', 'recent', '{{}}', now() - interval '500 days', now() - interval '10 days')"
    ))
    .await;
    exec(format!(
        "INSERT INTO ai_usage (user_id, day, requests, input_tokens, output_tokens) VALUES \
         ('{id}', current_date - 100, 1, 1, 1), ('{id}', current_date - 10, 1, 1, 1)"
    ))
    .await;
    exec(format!(
        "INSERT INTO activity_days (user_id, day) VALUES ('{id}', current_date - 450), ('{id}', current_date - 5)"
    ))
    .await;

    // While another replica holds the round's lock, this one skips.
    let blocker = sea_orm::TransactionTrait::begin(&app.db).await.unwrap();
    blocker
        .execute_raw(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            "SELECT pg_advisory_xact_lock($1)",
            [0x5245_5445_4e54_i64.into()],
        ))
        .await
        .unwrap();
    assert!(!run(&app.db, Policy::default()).await.unwrap().ran);
    blocker.rollback().await.unwrap();

    let report = run(&app.db, Policy::default()).await.unwrap();
    assert!(report.ran);
    let kept = |sql: &'static str| count(&app, sql, id);
    assert_eq!(
        kept("SELECT count(*)::bigint AS n FROM submissions WHERE user_id = $1 AND target_slug = 'retention-t'").await,
        2,
        "the latest attempt and the latest pass stay"
    );
    assert_eq!(
        kept("SELECT count(*)::bigint AS n FROM submissions WHERE user_id = $1 AND target_slug = 'retention-t' AND passed").await,
        1
    );
    assert_eq!(
        kept("SELECT count(*)::bigint AS n FROM submissions WHERE user_id = $1 AND target_slug = 'retention-u'").await,
        1
    );
    assert_eq!(kept("SELECT count(*)::bigint AS n FROM conversations WHERE user_id = $1").await, 1);
    assert_eq!(kept("SELECT count(*)::bigint AS n FROM ai_usage WHERE user_id = $1").await, 1);
    assert_eq!(kept("SELECT count(*)::bigint AS n FROM activity_days WHERE user_id = $1").await, 1);
}

#[tokio::test]
async fn csrf_rejects_requests_without_header_or_with_foreign_origin() {
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    let path = "/api/progress/lessons/basics/intro/hello";
    let no_header = app.call("PUT", path, Some(json!({"status": "completed"})), Some(&cookie), false).await;
    assert_eq!(no_header.status, StatusCode::FORBIDDEN);
    assert_eq!(no_header.body["code"], "csrf");

    let req = Request::builder()
        .method("PUT")
        .uri(path)
        .header("x-requested-with", "fetch")
        .header("origin", "https://evil.example")
        .header(header::COOKIE, &cookie)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"status":"completed"}"#))
        .unwrap();
    let res = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_retired_host_redirects_to_the_public_origin() {
    let Some(app) = test_app().await else { return };
    // A listed host (any case, with or without a port) gets a 308 to the
    // same path and query on the public origin, whatever the method.
    for (method, host) in [("GET", "old.example.test"), ("POST", "OLD.example.test:443")] {
        let req = Request::builder()
            .method(method)
            .uri("/learn/foundations?tab=quiz")
            .header(header::HOST, host)
            .body(Body::empty())
            .unwrap();
        let res = app.router.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::PERMANENT_REDIRECT, "{method} {host}");
        assert_eq!(res.headers()[header::LOCATION], "http://localhost:8080/learn/foundations?tab=quiz");
    }
    // Any other host (the platform's health check, the private network) is served.
    for host in ["healthcheck.railway.app", "localhost:8080", "old.example.test.evil"] {
        let req = Request::builder().uri("/api/healthz").header(header::HOST, host).body(Body::empty()).unwrap();
        let res = app.router.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK, "{host}");
    }
}

#[tokio::test]
async fn progress_quiz_and_roadmap() {
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;

    let missing = app
        .call(
            "PUT",
            "/api/progress/lessons/basics/intro/nope",
            Some(json!({"status": "completed"})),
            Some(&cookie),
            true,
        )
        .await;
    assert_eq!(missing.status, StatusCode::NOT_FOUND);

    let done = app
        .call(
            "PUT",
            "/api/progress/lessons/basics/intro/hello",
            Some(json!({"status": "completed"})),
            Some(&cookie),
            true,
        )
        .await;
    assert_eq!(done.status, StatusCode::OK);
    // Upsert: repeating is idempotent.
    let again = app
        .call(
            "PUT",
            "/api/progress/lessons/basics/intro/hello",
            Some(json!({"status": "completed"})),
            Some(&cookie),
            true,
        )
        .await;
    assert_eq!(again.status, StatusCode::OK);

    let wrong_len = app
        .call("POST", "/api/quizzes/basics/intro/hello/grade", Some(json!({"answers": [1]})), Some(&cookie), true)
        .await;
    assert_eq!(wrong_len.status, StatusCode::UNPROCESSABLE_ENTITY);
    let graded = app
        .call("POST", "/api/quizzes/basics/intro/hello/grade", Some(json!({"answers": [1, 0]})), Some(&cookie), true)
        .await;
    assert_eq!(graded.status, StatusCode::OK);
    assert_eq!(graded.body["score"], 1);
    assert_eq!(graded.body["total"], 2);
    assert_eq!(graded.body["questions"][1]["answer"], 1, "answers revealed only after grading");

    let summary = app.call("GET", "/api/progress", None, Some(&cookie), false).await;
    assert_eq!(summary.body["lessons_completed"], 1);
    assert_eq!(summary.body["streak_days"], 1);

    let roadmap = app.call("GET", "/api/roadmap", None, Some(&cookie), false).await;
    assert_eq!(roadmap.status, StatusCode::OK);
    assert!(roadmap.body["next_lesson"].is_null(), "only lesson is complete");

    let pref = app
        .call(
            "PUT",
            "/api/progress/modules/basics/intro",
            Some(json!({"preference": "confident"})),
            Some(&cookie),
            true,
        )
        .await;
    assert_eq!(pref.status, StatusCode::OK);
    let summary = app.call("GET", "/api/progress", None, Some(&cookie), false).await;
    assert_eq!(summary.body["module_preferences"]["basics/intro"], "confident");
}

#[tokio::test]
async fn lesson_payload_hides_quiz_answers() {
    let Some(app) = test_app().await else { return };
    let r = app.call("GET", "/api/lessons/basics/intro/hello", None, None, false).await;
    assert_eq!(r.status, StatusCode::OK);
    let body = r.body["body"].as_str().unwrap();
    assert!(body.contains("```quiz"));
    assert!(!body.contains("Arithmetic."), "quiz explanations leaked into the lesson body");
    assert!(!body.contains("\"answer\""), "quiz answers leaked into the lesson body");
    assert!(r.headers.contains_key(header::ETAG));
    let etag = r.headers[header::ETAG].to_str().unwrap().to_string();
    let req = Request::builder()
        .uri("/api/lessons/basics/intro/hello")
        .header(header::IF_NONE_MATCH, etag)
        .body(Body::empty())
        .unwrap();
    let res = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::NOT_MODIFIED);
}

#[tokio::test]
async fn submissions_are_graded_on_the_server() {
    let Some(app) = test_app().await else { return };
    if grader().is_none() {
        return;
    }
    let (cookie, _) = app.register().await;
    let submit = |body: Value| app.call("POST", "/api/submissions", Some(body), Some(&cookie), true);

    // What the browser claims is ignored; the server runs the code.
    let wrong = submit(json!({"target_kind": "problem", "target_slug": "add-two", "language": "python",
        "code": "def add_two(a, b):\n    return a - b\n", "passed_count": 2, "total_count": 2, "results": []}))
    .await;
    assert_eq!(wrong.status, StatusCode::OK, "{:?}", wrong.body);
    assert_eq!(wrong.body["passed"], false);
    assert_eq!(wrong.body["passed_count"], 0);
    assert_eq!(wrong.body["tests"].as_array().unwrap().len(), 2, "hidden tests are graded too");
    let summary = app.call("GET", "/api/progress", None, Some(&cookie), false).await;
    assert_eq!(summary.body["problems_solved"], 0);

    let right = submit(json!({"target_kind": "problem", "target_slug": "add-two", "language": "python",
        "code": "def add_two(a, b):\n    return a + b\n"}))
    .await;
    assert_eq!(right.body["passed"], true, "{:?}", right.body);
    assert_eq!(right.body["passed_count"], 2);
    assert_eq!(right.body["compile_error"], Value::Null);
    let summary = app.call("GET", "/api/progress", None, Some(&cookie), false).await;
    assert_eq!(summary.body["problems_solved"], 1);

    let broken = submit(json!({"target_kind": "problem", "target_slug": "add-two", "language": "python",
        "code": "def add_two(a, b:\n"}))
    .await;
    assert_eq!(broken.body["passed"], false);
    assert!(broken.body["compile_error"].as_str().unwrap().contains("SyntaxError"), "{:?}", broken.body);

    // Exercises, in each language the exercise offers.
    let exercise = "basics/intro/hello#add";
    let js = submit(json!({"target_kind": "exercise", "target_slug": exercise, "language": "javascript",
        "code": "function add(a, b) { return a + b; }"}))
    .await;
    assert_eq!(js.body["passed"], true, "{:?}", js.body);
    // TypeScript runs as the browser's stripped JavaScript.
    let ts = submit(json!({"target_kind": "exercise", "target_slug": exercise, "language": "typescript",
        "code": "function add(a: number, b: number): number { return a + b; }"}))
    .await;
    assert_eq!(ts.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(ts.body["message"].as_str().unwrap().contains("compiled"), "{:?}", ts.body);
    let ts = submit(json!({"target_kind": "exercise", "target_slug": exercise, "language": "typescript",
        "code": "function add(a: number, b: number): number { return a + b; }",
        "compiled": "function add(a, b) { return a + b; }"}))
    .await;
    assert_eq!(ts.body["passed"], true, "{:?}", ts.body);
    assert_eq!(ts.body["language"], "typescript");

    for (body, why) in [
        (
            json!({"target_kind": "problem", "target_slug": "add-two", "language": "javascript", "code": "x"}),
            "not offered",
        ),
        (json!({"target_kind": "problem", "target_slug": "add-two", "language": "cobol", "code": "x"}), "unsupported"),
        (
            json!({"target_kind": "exercise", "target_slug": "basics/intro/hello#nope", "language": "python", "code": "x"}),
            "no such exercise",
        ),
    ] {
        let r = submit(body).await;
        assert!(
            r.status == StatusCode::UNPROCESSABLE_ENTITY || r.status == StatusCode::NOT_FOUND,
            "{why}: {:?}",
            r.status
        );
    }
    let solution = app.call("GET", "/api/problems/add-two/solution", None, None, false).await;
    assert_eq!(solution.status, StatusCode::UNAUTHORIZED, "editorial requires login");
}

#[tokio::test]
async fn comments_threading_and_authorisation() {
    let Some(app) = test_app().await else { return };
    let (alice, _) = app.register().await;
    let (bob, _) = app.register().await;
    let root = app
        .call(
            "POST",
            "/api/comments",
            Some(json!({"target_kind": "lesson", "target_slug": "basics/intro/hello", "body": "Question?"})),
            Some(&alice),
            true,
        )
        .await;
    assert_eq!(root.status, StatusCode::OK);
    let root_id = root.body["id"].as_str().unwrap().to_string();
    let reply = app
        .call("POST", "/api/comments", Some(json!({"target_kind": "lesson", "target_slug": "basics/intro/hello", "body": "Answer.", "parent_id": root_id})), Some(&bob), true)
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    let reply_id = reply.body["id"].as_str().unwrap().to_string();
    let nested = app
        .call("POST", "/api/comments", Some(json!({"target_kind": "lesson", "target_slug": "basics/intro/hello", "body": "Too deep", "parent_id": reply_id})), Some(&alice), true)
        .await;
    assert_eq!(nested.status, StatusCode::UNPROCESSABLE_ENTITY, "only one level of nesting");

    let forbidden = app.call("DELETE", &format!("/api/comments/{root_id}"), None, Some(&bob), true).await;
    assert_eq!(forbidden.status, StatusCode::FORBIDDEN);
    let deleted = app.call("DELETE", &format!("/api/comments/{root_id}"), None, Some(&alice), true).await;
    assert_eq!(deleted.status, StatusCode::OK);

    let list = app.call("GET", "/api/comments?kind=lesson&slug=basics/intro/hello", None, None, false).await;
    let mine = list.body.as_array().unwrap().iter().find(|c| c["id"] == root_id.as_str()).expect("root still present");
    assert_eq!(mine["deleted"], true);
    assert_eq!(mine["body"], "");
    assert_eq!(mine["replies"].as_array().unwrap().len(), 1, "replies survive a soft-deleted parent");
}

#[tokio::test]
async fn ai_features_degrade_gracefully_without_a_key() {
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    let status = app.call("GET", "/api/coach/status", None, Some(&cookie), false).await;
    assert_eq!(status.status, StatusCode::OK);
    assert_eq!(status.body["enabled"], false);
    let start = app
        .call("POST", "/api/interviews", Some(json!({"kind": "coding", "assistant_mode": "solo"})), Some(&cookie), true)
        .await;
    assert_eq!(start.status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(start.body["code"], "ai_disabled");
    let short = app
        .call("POST", "/api/coach/roadmap-suggestions", Some(json!({"background": "too short"})), Some(&cookie), true)
        .await;
    assert_eq!(short.status, StatusCode::UNPROCESSABLE_ENTITY, "input validated before the model is needed");
    let suggest = app
        .call(
            "POST",
            "/api/coach/roadmap-suggestions",
            Some(json!({"background": "Five years of backend work in Go and Postgres."})),
            Some(&cookie),
            true,
        )
        .await;
    assert_eq!(suggest.status, StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test]
async fn spa_fallback_serves_index_for_client_routes() {
    let Some(app) = test_app().await else { return };
    let req = Request::builder().uri("/learn/basics/intro/hello").body(Body::empty()).unwrap();
    let res = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert!(res.headers()[header::CONTENT_TYPE].to_str().unwrap().starts_with("text/html"));
    assert_eq!(res.headers()[header::CACHE_CONTROL], "no-cache");

    // A chunk from a previous build is a 404, not the SPA shell served as JS.
    let req = Request::builder().uri("/assets/index-OLDBUILD.js").body(Body::empty()).unwrap();
    let res = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
    assert_eq!(res.headers()[header::CACHE_CONTROL], "no-store");
}

#[tokio::test]
async fn boot_migrations_are_locked_and_tolerate_a_newer_schema() {
    let Some(app) = test_app().await else { return };
    // Two replicas booting at once: both succeed, neither re-applies anything.
    let (a, b) = tokio::join!(ascend_api::migrate::run(&app.db), ascend_api::migrate::run(&app.db));
    assert_eq!(a.unwrap(), ascend_api::migrate::Plan::UpToDate);
    assert_eq!(b.unwrap(), ascend_api::migrate::Plan::UpToDate);

    // A rollback: the database knows a migration this build does not. The
    // row is removed again before any assertion can fail.
    let exec = |sql: &'static str| app.db.execute_raw(Statement::from_string(sea_orm::DatabaseBackend::Postgres, sql));
    exec("INSERT INTO seaql_migrations (version, applied_at) VALUES ('m9999_from_the_future', 0)").await.unwrap();
    let plan = ascend_api::migrate::run(&app.db).await;
    exec("DELETE FROM seaql_migrations WHERE version = 'm9999_from_the_future'").await.unwrap();
    assert_eq!(plan.unwrap(), ascend_api::migrate::Plan::SchemaAhead(vec!["m9999_from_the_future".into()]));
}

#[tokio::test]
async fn ai_budget_reservation_cannot_be_overshot_by_concurrency() {
    let Some(app) = test_app().await else { return };
    let (_, user) = app.register().await;
    let user_id: uuid::Uuid = user["id"].as_str().unwrap().parse().unwrap();
    let budget = app.state.coach.budget().clone();
    // The test config allows 10 requests per day. Fire 30 at once.
    let attempts = (0..30).map(|_| {
        let b = budget.clone();
        tokio::spawn(async move { b.reserve(user_id, &mut tiny_request(50)).await.ok() })
    });
    let mut holds = Vec::new();
    for h in attempts {
        if let Some(hold) = h.await.unwrap() {
            holds.push(hold);
        }
    }
    assert_eq!(holds.len(), 10, "exactly the daily limit may be reserved");
    assert_eq!(budget.status(user_id).await.unwrap().requests_used, 10);

    // Settling records actual usage, including prompt-cache tokens.
    let usage = ascend_core::ai::Usage {
        input_tokens: 1200,
        output_tokens: 300,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 0,
    };
    holds.pop().unwrap().settle(usage).await.unwrap();
    holds.pop().unwrap().settle(usage).await.unwrap();
    let status = budget.status(user_id).await.unwrap();
    // Billed input: 2 × 1,200 uncached + 10,000 cache reads at a tenth.
    assert_eq!(status.input_tokens_used, 3400);
    assert_eq!(status.output_tokens_used, 600);
    assert_eq!(status.cache_read_tokens, 10_000);
}

fn tiny_request(max_tokens: u32) -> ascend_core::ai::anthropic::Request {
    ascend_core::ai::anthropic::Request {
        model: "test-model".into(),
        system: "s".into(),
        context: None,
        cache_conversation: false,
        messages: vec![ascend_core::ai::ChatMessage { role: ascend_core::ai::Role::User, content: "hi".into() }],
        max_tokens,
        effort: ascend_core::ai::anthropic::Effort::Low,
        json_schema: None,
    }
}

async fn reserved_output(app: &TestApp, id: uuid::Uuid) -> i64 {
    let rows = app
        .db
        .query_all_raw(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            "SELECT COALESCE(SUM(reserved_output_tokens), 0)::bigint AS n FROM ai_usage WHERE user_id = $1",
            [id.into()],
        ))
        .await
        .unwrap();
    rows[0].try_get("", "n").unwrap()
}

#[tokio::test]
async fn a_budget_hold_caps_the_call_at_what_is_left_and_releases_itself() {
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    let id = user_id(&app, &cookie).await;
    let budget = app.state.coach.budget();
    // The test config allows 1,000 output tokens a day.
    let mut first = tiny_request(800);
    let held = budget.reserve(id, &mut first).await.unwrap();
    assert_eq!(held.output_hold(), 800);

    // 200 left is below the least an 800-token call may start with (a
    // quarter of max_tokens, but never under 256): refused rather than
    // letting a reply be cut off, or the day's budget be overshot.
    assert!(matches!(budget.reserve(id, &mut tiny_request(800)).await, Err(ascend_core::AppError::RateLimited { .. })));

    // The first call used 300; 700 are left, and the next call is capped there.
    held.settle(ascend_core::ai::Usage { output_tokens: 300, ..Default::default() }).await.unwrap();
    let mut third = tiny_request(800);
    let capped = budget.reserve(id, &mut third).await.unwrap();
    assert_eq!(third.max_tokens, 700, "the request itself cannot outspend the day");
    assert_eq!(reserved_output(&app, id).await, 700);

    // An early return drops the hold unsettled: it is released, not leaked.
    drop(capped);
    for _ in 0..50 {
        if reserved_output(&app, id).await == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(reserved_output(&app, id).await, 0);
    assert_eq!(budget.status(id).await.unwrap().output_tokens_used, 300);
}

#[tokio::test]
async fn malformed_json_uses_the_api_error_shape() {
    let Some(app) = test_app().await else { return };
    let req = Request::builder()
        .method("POST")
        .uri("/api/auth/login")
        .header("x-requested-with", "fetch")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from("{not json"))
        .unwrap();
    let res = app.router.clone().oneshot(req).await.unwrap();
    // Unparseable JSON is a malformed request (400); well-formed JSON with
    // the wrong fields is a validation failure (422).
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    let body: Value = serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body["code"], "bad_request");
    assert!(body["message"].as_str().unwrap().starts_with("invalid request body"));
}

#[tokio::test]
async fn request_ids_are_server_controlled() {
    let Some(app) = test_app().await else { return };
    let send = |id: &'static str| {
        let router = app.router.clone();
        async move {
            let req = Request::builder().uri("/api/healthz").header("x-request-id", id).body(Body::empty()).unwrap();
            router.oneshot(req).await.unwrap().headers()["x-request-id"].to_str().unwrap().to_string()
        }
    };
    let forged = send("<script>alert(1)</script>").await;
    assert_ne!(forged, "<script>alert(1)</script>");
    assert!(uuid::Uuid::parse_str(&forged).is_ok(), "replaced with a fresh UUID");
    let propagated = send("0192f6a4-5b1a-7c3e-9a7b-3d2f1e0c4b5a").await;
    assert_eq!(propagated, "0192f6a4-5b1a-7c3e-9a7b-3d2f1e0c4b5a", "valid UUIDs propagate");
}

async fn user_id(app: &TestApp, cookie: &str) -> uuid::Uuid {
    let me = app.call("GET", "/api/auth/me", None, Some(cookie), false).await;
    me.body["id"].as_str().unwrap().parse().unwrap()
}

async fn count(app: &TestApp, sql: &str, id: uuid::Uuid) -> i64 {
    let rows = app
        .db
        .query_all_raw(Statement::from_sql_and_values(sea_orm::DatabaseBackend::Postgres, sql, [id.into()]))
        .await
        .unwrap();
    rows[0].try_get("", "n").unwrap()
}

fn solo_coding() -> ascend_core::services::interviews::StartInterview {
    use ascend_core::services::interviews::{AssistantMode, InterviewKind, StartInterview};
    StartInterview {
        kind: InterviewKind::Coding,
        assistant_mode: AssistantMode::Solo,
        problem_slug: Some("add-two".into()),
        difficulty: None,
        duration_minutes: Some(30),
        language: Some("python".into()),
    }
}

#[tokio::test]
async fn deleting_an_account_requires_the_password_and_keeps_discussions_readable() {
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    let id = user_id(&app, &cookie).await;
    let posted = app
        .call(
            "POST",
            "/api/comments",
            Some(json!({"target_kind": "lesson", "target_slug": "basics/intro/hello", "body": "A useful note."})),
            Some(&cookie),
            true,
        )
        .await;
    assert_eq!(posted.status, StatusCode::OK);
    let comment_id = posted.body["id"].as_str().unwrap().to_string();

    let wrong =
        app.call("DELETE", "/api/auth/me", Some(json!({"password": "not-my-password"})), Some(&cookie), true).await;
    // 422, not 401: the session is valid, and a 401 would make the client
    // treat the learner as signed out.
    assert_eq!(wrong.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(count(&app, "SELECT count(*)::bigint AS n FROM users WHERE id = $1", id).await, 1);

    let gone = app
        .call("DELETE", "/api/auth/me", Some(json!({"password": "correct-horse-battery"})), Some(&cookie), true)
        .await;
    assert_eq!(gone.status, StatusCode::OK, "{:?}", gone.body);
    assert_eq!(count(&app, "SELECT count(*)::bigint AS n FROM users WHERE id = $1", id).await, 0);
    assert_eq!(count(&app, "SELECT count(*)::bigint AS n FROM sessions WHERE user_id = $1", id).await, 0);
    let me = app.call("GET", "/api/auth/me", None, Some(&cookie), false).await;
    assert_eq!(me.status, StatusCode::UNAUTHORIZED, "the session died with the account");

    // Other learners' replies keep their context: the comment stays, unattributed.
    let list = app.call("GET", "/api/comments?kind=lesson&slug=basics/intro/hello", None, None, false).await;
    let c = list.body.as_array().unwrap().iter().find(|c| c["id"] == comment_id.as_str()).expect("comment kept");
    assert_eq!(c["author_id"], Value::Null);
    assert_eq!(c["author_name"], "deleted user");
}

#[tokio::test]
async fn concurrent_registrations_for_one_email_yield_one_account_and_conflicts() {
    let Some(app) = test_app().await else { return };
    let email = format!("race-{}@example.com", uuid::Uuid::now_v7());
    let attempts = (0..4).map(|_| {
        let body = json!({"email": email, "password": "correct-horse-battery", "display_name": "Racer"});
        async { app.call("POST", "/api/auth/register", Some(body), None, true).await.status }
    });
    let statuses = futures::future::join_all(attempts).await;
    assert_eq!(statuses.iter().filter(|s| **s == StatusCode::OK).count(), 1, "{statuses:?}");
    assert!(statuses.iter().all(|s| *s == StatusCode::OK || *s == StatusCode::CONFLICT), "{statuses:?}");
}

#[tokio::test]
async fn a_learner_has_at_most_one_active_interview_and_solo_locks_the_coach() {
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    let id = user_id(&app, &cookie).await;

    // Racing starts (double-click, two tabs) must still leave exactly one active.
    let starts = (0..5).map(|_| app.state.interviews.start(id, solo_coding()));
    let results = futures::future::join_all(starts).await;
    assert!(results.iter().any(|r| r.is_ok()));
    for r in &results {
        if let Err(e) = r {
            assert!(matches!(e, ascend_core::AppError::Conflict(_)), "unexpected error: {e:?}");
        }
    }
    let active = "SELECT count(*)::bigint AS n FROM interviews WHERE user_id = $1 AND status = 'active'";
    assert_eq!(count(&app, active, id).await, 1);

    // A new start replaces the old one rather than stacking.
    app.state.interviews.start(id, solo_coding()).await.unwrap();
    assert_eq!(count(&app, active, id).await, 1);

    // "No AI help" is enforced by the server, not only hidden in the UI.
    let quiz = app.call("POST", "/api/coach/quiz/basics/intro/hello", Some(json!({})), Some(&cookie), true).await;
    assert_eq!(quiz.status, StatusCode::CONFLICT, "{:?}", quiz.body);
    assert!(quiz.body["message"].as_str().unwrap().contains("solo mock interview"));

    // An invalid request must not abandon the interview in progress.
    let mut bad = solo_coding();
    bad.duration_minutes = Some(5);
    assert!(app.state.interviews.start(id, bad).await.is_err());
    assert_eq!(count(&app, active, id).await, 1);
}

#[tokio::test]
async fn activity_counts_toward_the_streak_and_is_recorded_once_per_day() {
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    let id = user_id(&app, &cookie).await;
    let before = app.call("GET", "/api/progress", None, Some(&cookie), false).await;
    assert_eq!(before.body["streak_days"], 0);

    for _ in 0..2 {
        let done = app
            .call(
                "PUT",
                "/api/progress/lessons/basics/intro/hello",
                Some(json!({"status": "completed"})),
                Some(&cookie),
                true,
            )
            .await;
        assert_eq!(done.status, StatusCode::OK);
    }
    assert_eq!(count(&app, "SELECT count(*)::bigint AS n FROM activity_days WHERE user_id = $1", id).await, 1);
    let after = app.call("GET", "/api/progress", None, Some(&cookie), false).await;
    assert_eq!(after.body["streak_days"], 1);
    assert!(after.body["xp"].as_u64().unwrap() > 0);
}

#[tokio::test]
async fn a_day_of_learning_is_the_learners_own_day() {
    let Some(app) = test_app().await else { return };
    // Kiritimati (UTC+14) and Pago Pago (UTC-11) are 25 hours apart, so at
    // any instant their calendar dates differ.
    let (east, _) = app.register().await;
    let (west, _) = app.register().await;
    for (cookie, tz) in [(&east, "Pacific/Kiritimati"), (&west, "Pacific/Pago_Pago")] {
        let r = app.call("PATCH", "/api/auth/me", Some(json!({"timezone": tz})), Some(cookie), true).await;
        assert_eq!(r.status, StatusCode::OK, "{:?}", r.body);
        assert_eq!(r.body["timezone"], tz);
        let done = app
            .call(
                "PUT",
                "/api/progress/lessons/basics/intro/hello",
                Some(json!({"status": "completed"})),
                Some(cookie),
                true,
            )
            .await;
        assert_eq!(done.status, StatusCode::OK);
        let progress = app.call("GET", "/api/progress", None, Some(cookie), false).await;
        assert_eq!(progress.body["streak_days"], 1, "{tz}");
    }
    let db = &app.db;
    let day = |id: uuid::Uuid| async move {
        let rows = db
            .query_all_raw(Statement::from_sql_and_values(
                sea_orm::DatabaseBackend::Postgres,
                "SELECT day FROM activity_days WHERE user_id = $1",
                [id.into()],
            ))
            .await
            .unwrap();
        assert_eq!(rows.len(), 1);
        rows[0].try_get::<chrono::NaiveDate>("", "day").unwrap()
    };
    let (east_id, west_id) = (user_id(&app, &east).await, user_id(&app, &west).await);
    let (east_day, west_day) = (day(east_id).await, day(west_id).await);
    assert!(east_day > west_day, "east {east_day} should be ahead of west {west_day}");
    let utc = chrono::Utc::now().date_naive();
    assert!(east_day >= utc && west_day <= utc);
}

#[tokio::test]
async fn time_zones_are_validated() {
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    for bad in ["Mars/Olympus_Mons", "'; DROP TABLE users; --", ""] {
        let r = app.call("PATCH", "/api/auth/me", Some(json!({"timezone": bad})), Some(&cookie), true).await;
        assert_eq!(r.status, StatusCode::UNPROCESSABLE_ENTITY, "{bad}: {:?}", r.body);
    }
    // Sign-up never fails over a zone: an unknown one is dropped.
    let email = format!("t-{}@example.com", uuid::Uuid::now_v7());
    let body =
        json!({"email": email, "password": "correct-horse-battery", "display_name": "T", "timezone": "Nowhere/Land"});
    let r = app.call("POST", "/api/auth/register", Some(body), None, true).await;
    assert_eq!(r.status, StatusCode::OK, "{:?}", r.body);
    assert_eq!(r.body["timezone"], Value::Null);
    let email = format!("t-{}@example.com", uuid::Uuid::now_v7());
    let body =
        json!({"email": email, "password": "correct-horse-battery", "display_name": "T", "timezone": "Asia/Kolkata"});
    let r = app.call("POST", "/api/auth/register", Some(body), None, true).await;
    assert_eq!(r.body["timezone"], "Asia/Kolkata");
}

#[tokio::test]
async fn throttled_responses_say_when_to_retry() {
    let Some(app) = test_app().await else { return };
    // Repeated guesses at one account are throttled per account, whatever
    // the source address.
    let body = json!({"email": "nobody@example.com", "password": "wrong-password-123"});
    let mut throttled = None;
    for _ in 0..15 {
        let r = app.call("POST", "/api/auth/login", Some(body.clone()), None, true).await;
        if r.status == StatusCode::TOO_MANY_REQUESTS {
            throttled = Some(r);
            break;
        }
    }
    let r = throttled.expect("repeated logins to one account are throttled");
    let secs: u64 = r.headers["retry-after"].to_str().unwrap().parse().unwrap();
    assert!((1..=60).contains(&secs), "retry-after {secs}");
    assert_eq!(r.body["code"], "rate_limited");
    // Case and whitespace do not buy a fresh allowance.
    let variant = json!({"email": "  NoBody@Example.com ", "password": "wrong-password-123"});
    assert_eq!(
        app.call("POST", "/api/auth/login", Some(variant), None, true).await.status,
        StatusCode::TOO_MANY_REQUESTS
    );
    // Another account from the same address is unaffected.
    let other = json!({"email": "somebody-else@example.com", "password": "wrong-password-123"});
    assert_eq!(
        app.call("POST", "/api/auth/login", Some(other), None, true).await.status,
        StatusCode::UNPROCESSABLE_ENTITY
    );
}

#[tokio::test]
async fn content_etag_revalidates_and_names_the_build() {
    let Some(app) = test_app().await else { return };
    let r = app.call("GET", "/api/curriculum", None, None, false).await;
    let etag = r.headers[header::ETAG].to_str().unwrap().to_string();
    assert_eq!(etag, &*app.state.content_etag);
    assert_ne!(etag, format!("\"{}\"", app.state.curriculum.version), "the build is part of the validator");
    let ready = app.call("GET", "/api/readyz", None, None, false).await;
    assert_eq!(ready.body["build"], ascend_api::build_info::BUILD_ID);
}

#[tokio::test]
async fn ai_throttling_is_per_session_and_only_for_model_calls() {
    let Some(app) = test_app().await else { return };
    let (alice, _) = app.register().await;
    let (bob, _) = app.register().await;
    // Reading history is ordinary traffic, not an AI call.
    for _ in 0..25 {
        let r = app.call("GET", "/api/coach/conversations", None, Some(&alice), false).await;
        assert_eq!(r.status, StatusCode::OK);
    }
    // Model calls: without an API key they fail with 503 after the limiter,
    // so a 429 can only come from the limiter itself.
    let quiz = |cookie: String| {
        let app = &app;
        async move { app.call("POST", "/api/coach/quiz/basics/intro/hello", Some(json!({})), Some(&cookie), true).await }
    };
    let mut throttled = false;
    for _ in 0..25 {
        let r = quiz(alice.clone()).await;
        if r.status == StatusCode::TOO_MANY_REQUESTS {
            throttled = true;
            break;
        }
        assert_eq!(r.status, StatusCode::SERVICE_UNAVAILABLE);
    }
    assert!(throttled, "one session is throttled after its per-minute allowance");
    // Same IP, different learner: unaffected.
    assert_eq!(quiz(bob).await.status, StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test]
async fn cache_writes_count_against_the_input_budget_and_the_refusal_says_when_to_retry() {
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    let id = user_id(&app, &cookie).await;
    let budget = app.state.coach.budget();
    let hold = budget.reserve(id, &mut tiny_request(50)).await.unwrap();
    // 90k cache-write tokens bill as 112.5k input tokens: over the 100k test limit
    // even though "uncached input" is zero.
    let usage = ascend_core::ai::Usage { cache_creation_input_tokens: 90_000, output_tokens: 10, ..Default::default() };
    hold.settle(usage).await.unwrap();
    match budget.reserve(id, &mut tiny_request(50)).await {
        Err(ascend_core::AppError::RateLimited { retry_after_secs: Some(secs), .. }) => {
            assert!((1..=86_400).contains(&secs), "retry at the next UTC midnight, got {secs}")
        }
        other => panic!("expected the budget to refuse with a retry time, got {other:?}"),
    }
    assert_eq!(budget.status(id).await.unwrap().input_tokens_used, 112_500);
}

#[tokio::test]
async fn transcripts_freeze_when_an_interview_ends_and_appends_never_lose_entries() {
    use ascend_core::services::interviews::{InterviewService, TranscriptEntry};
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    let id = user_id(&app, &cookie).await;
    let interview = app.state.interviews.start(id, solo_coding()).await.unwrap();
    let entry =
        |n: usize| TranscriptEntry { role: "candidate".into(), content: format!("turn {n}"), at: chrono::Utc::now() };

    // Concurrent appends (a reply persisting while the learner types) are
    // each applied exactly once: no read-modify-write lost updates.
    let appends = (0..20).map(|n| app.state.interviews.append_transcript(interview.clone(), vec![entry(n)], None));
    for r in futures::future::join_all(appends).await {
        r.unwrap();
    }
    let current = app.state.interviews.get(id, interview.id).await.unwrap();
    assert_eq!(InterviewService::transcript(&current).len(), 20);

    // Exactly one of two racing "finish" calls wins.
    let finishes =
        (0..2).map(|_| app.state.interviews.finish(current.clone(), json!({"summary": "ok"}), 3, "completed"));
    let results = futures::future::join_all(finishes).await;
    assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    assert!(results.iter().any(|r| matches!(r, Err(ascend_core::AppError::Conflict(_)))));

    // A reply that arrives after the end cannot change what was graded.
    let late = app.state.interviews.append_transcript(current.clone(), vec![entry(99)], None).await;
    assert!(matches!(late, Err(ascend_core::AppError::Conflict(_))), "{late:?}");
    let ended = app.state.interviews.get(id, interview.id).await.unwrap();
    assert_eq!(InterviewService::transcript(&ended).len(), 20);
}

#[tokio::test]
async fn grading_freezes_the_transcript_and_a_failed_grade_reopens_the_interview() {
    use ascend_core::services::interviews::{InterviewService, TranscriptEntry};
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    let id = user_id(&app, &cookie).await;
    let started = app.state.interviews.start(id, solo_coding()).await.unwrap();
    let entry =
        |text: &str| TranscriptEntry { role: "interviewer".into(), content: text.into(), at: chrono::Utc::now() };
    let before = app.state.interviews.append_transcript(started.clone(), vec![entry("first")], None).await.unwrap();

    // The learner clicks "finish": the transcript is frozen with the final code.
    let frozen = app.state.interviews.begin_grading(before.clone(), Some("def f(): pass".into())).await.unwrap();
    assert_eq!(frozen.status, "grading");
    assert_eq!(frozen.final_code.as_deref(), Some("def f(): pass"));

    // An interviewer reply still streaming lands now: refused, not appended.
    let late = app.state.interviews.append_transcript(before.clone(), vec![entry("late")], None).await;
    assert!(matches!(&late, Err(ascend_core::AppError::Conflict(m)) if m.contains("being graded")), "{late:?}");
    // A second click while grading is refused too.
    assert!(matches!(
        app.state.interviews.begin_grading(frozen.clone(), None).await,
        Err(ascend_core::AppError::Conflict(_))
    ));
    // The solo lock still holds while the grade is pending.
    assert!(app.state.interviews.has_active_solo(id).await.unwrap());

    // Grading fails (say the model is unavailable): the interview reopens.
    app.state.interviews.resume_after_failed_grading(frozen.id).await.unwrap();
    let reopened = app.state.interviews.get(id, frozen.id).await.unwrap();
    assert_eq!(reopened.status, "active");
    assert_eq!(InterviewService::transcript(&reopened).len(), 1, "nothing was lost or added");

    // Retry succeeds, and the stored grade matches the frozen transcript.
    let frozen = app.state.interviews.begin_grading(reopened, None).await.unwrap();
    let done = app.state.interviews.finish(frozen, json!({"summary": "ok"}), 70, "completed").await.unwrap();
    assert_eq!(done.status, "completed");
    assert_eq!(InterviewService::transcript(&done).len(), 1);
}

#[tokio::test]
async fn an_abandoned_solo_interview_releases_the_coach_and_a_dead_grade_can_be_retried() {
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    let id = user_id(&app, &cookie).await;
    let interview = app.state.interviews.start(id, solo_coding()).await.unwrap();
    assert!(app.state.interviews.has_active_solo(id).await.unwrap());

    // A tab closed mid-interview must not lock the coach forever: past the
    // time box (30 minutes here) plus the 15-minute grace, the lock lifts.
    let backdate = |sql: String| app.db.execute_raw(Statement::from_string(sea_orm::DatabaseBackend::Postgres, sql));
    backdate(format!("UPDATE interviews SET started_at = now() - interval '44 minutes' WHERE id = '{}'", interview.id))
        .await
        .unwrap();
    assert!(app.state.interviews.has_active_solo(id).await.unwrap(), "still inside the grace period");
    backdate(format!("UPDATE interviews SET started_at = now() - interval '46 minutes' WHERE id = '{}'", interview.id))
        .await
        .unwrap();
    assert!(!app.state.interviews.has_active_solo(id).await.unwrap(), "past time box plus grace");

    // A grade whose request died (deploy, crash) is stuck in `grading`. A
    // second "finish" is refused while it could still be running…
    let grading = app.state.interviews.begin_grading(interview.clone(), None).await.unwrap();
    assert!(matches!(
        app.state.interviews.begin_grading(grading.clone(), None).await,
        Err(ascend_core::AppError::Conflict(_))
    ));
    // …and accepted once it is older than five minutes.
    backdate(format!("UPDATE interviews SET updated_at = now() - interval '6 minutes' WHERE id = '{}'", interview.id))
        .await
        .unwrap();
    let retried = app.state.interviews.begin_grading(grading, None).await.unwrap();
    assert_eq!(retried.status, "grading");
    let done = app.state.interviews.finish(retried, json!({"summary": "ok"}), 60, "completed").await.unwrap();
    assert_eq!(done.status, "completed");
}

/// Every Set-Cookie value (name=value only) the response carried.
fn cookies(res: &Res) -> Vec<String> {
    res.headers
        .get_all(header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .map(|v| v.split(';').next().unwrap().to_string())
        .collect()
}

#[tokio::test]
async fn an_idle_session_is_signed_out() {
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    assert_eq!(app.call("GET", "/api/auth/me", None, Some(&cookie), false).await.status, StatusCode::OK);
    let id = user_id(&app, &cookie).await;
    // The test config signs out after 30 minutes idle.
    app.db
        .execute_raw(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            "UPDATE sessions SET last_seen_at = now() - interval '31 minutes' WHERE user_id = $1",
            [id.into()],
        ))
        .await
        .unwrap();
    assert_eq!(app.call("GET", "/api/auth/me", None, Some(&cookie), false).await.status, StatusCode::UNAUTHORIZED);
    assert_eq!(count(&app, "SELECT count(*)::bigint AS n FROM sessions WHERE user_id = $1", id).await, 0);
}

#[tokio::test]
async fn an_attacker_cannot_lock_the_owner_out_of_a_known_device() {
    let Some(app) = test_app().await else { return };
    let email = format!("owner-{}@example.com", uuid::Uuid::now_v7());
    let reg = app
        .call(
            "POST",
            "/api/auth/register",
            Some(json!({"email": email, "password": "correct-horse-battery", "display_name": "Owner"})),
            None,
            true,
        )
        .await;
    assert_eq!(reg.status, StatusCode::OK);
    let device = cookies(&reg).into_iter().find(|c| c.starts_with("ascend_device=")).expect("device cookie");

    // Someone who knows the email burns the unknown-device allowance.
    let guess = json!({"email": email, "password": "wrong-password-123"});
    let mut refused = false;
    for _ in 0..15 {
        if app.call("POST", "/api/auth/login", Some(guess.clone()), None, true).await.status
            == StatusCode::TOO_MANY_REQUESTS
        {
            refused = true;
            break;
        }
    }
    assert!(refused, "unknown devices are throttled per account");
    // A forged device cookie is just another unknown device.
    let forged = format!("ascend_device={}", "A".repeat(43));
    let r = app.call("POST", "/api/auth/login", Some(guess), Some(&forged), true).await;
    assert_eq!(r.status, StatusCode::TOO_MANY_REQUESTS);

    // The owner, on the browser they signed up with, is unaffected.
    let own = json!({"email": email, "password": "correct-horse-battery"});
    let r = app.call("POST", "/api/auth/login", Some(own), Some(&device), true).await;
    assert_eq!(r.status, StatusCode::OK, "{:?}", r.body);
}

#[tokio::test]
async fn replicas_share_the_security_limits() {
    let (Some(a), Some(b)) = (test_app().await, test_app().await) else { return };
    // Two app instances over one database stand in for two replicas: each
    // has its own process memory and its own client address.
    let guess =
        json!({"email": format!("shared-{}@example.com", uuid::Uuid::now_v7()), "password": "wrong-password-123"});
    for _ in 0..10 {
        let r = a.call("POST", "/api/auth/login", Some(guess.clone()), None, true).await;
        assert_ne!(r.status, StatusCode::TOO_MANY_REQUESTS);
    }
    let r = b.call("POST", "/api/auth/login", Some(guess), None, true).await;
    assert_eq!(r.status, StatusCode::TOO_MANY_REQUESTS, "the second replica sees the first one's attempts");
    let secs: u64 = r.headers["retry-after"].to_str().unwrap().parse().unwrap();
    assert!((1..=60).contains(&secs), "retry-after {secs}");
}
