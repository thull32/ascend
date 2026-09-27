//! End-to-end API tests against a real Postgres, driving the production
//! router in-process with `tower::ServiceExt::oneshot`.
//!
//! Requires `TEST_DATABASE_URL` (CI provides a Postgres service). When it is
//! unset the tests print a notice and pass, so `cargo test` works offline.
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
}

fn config(url: &str) -> Config {
    Config {
        bind_addr: "127.0.0.1:0".into(),
        database_url: SecretString::from(url.to_string()),
        public_origin: "http://localhost:8080".into(),
        cookie_secure: false,
        session_ttl: Duration::from_secs(3600),
        ai: AiConfig {
            api_key: None,
            model: "test-model".into(),
            fast_model: "test-fast".into(),
            base_url: "http://127.0.0.1:9".into(),
            daily_output_token_budget: 1000,
            daily_request_budget: 10,
            request_timeout: Duration::from_secs(5),
        },
        log_json: false,
        env: Environment::Development,
        client_ip_header: None,
    }
}

async fn test_app() -> Option<TestApp> {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
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
    let st = state::AppState::build(Arc::new(cfg), db.clone(), curriculum).expect("state");
    Some(TestApp { router: app::build(st), db })
}

struct Res {
    status: StatusCode,
    headers: http::HeaderMap,
    body: Value,
}

impl TestApp {
    async fn call(&self, method: &str, path: &str, body: Option<Value>, cookie: Option<&str>, csrf: bool) -> Res {
        let mut req = Request::builder().method(method).uri(path);
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
        let set_cookie = r.headers.get(header::SET_COOKIE).expect("session cookie").to_str().unwrap();
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
async fn submissions_validate_counts_and_track_solved() {
    let Some(app) = test_app().await else { return };
    let (cookie, _) = app.register().await;
    let bad = app
        .call(
            "POST",
            "/api/submissions",
            Some(json!({"target_kind": "problem", "target_slug": "add-two", "language": "python", "code": "x", "passed_count": 5, "total_count": 5, "results": []})),
            Some(&cookie),
            true,
        )
        .await;
    assert_eq!(bad.status, StatusCode::UNPROCESSABLE_ENTITY, "test count must match the problem");
    let ok = app
        .call(
            "POST",
            "/api/submissions",
            Some(json!({"target_kind": "problem", "target_slug": "add-two", "language": "python", "code": "def add_two(a,b): return a+b", "passed_count": 2, "total_count": 2, "results": []})),
            Some(&cookie),
            true,
        )
        .await;
    assert_eq!(ok.status, StatusCode::OK);
    assert_eq!(ok.body["passed"], true);
    let summary = app.call("GET", "/api/progress", None, Some(&cookie), false).await;
    assert_eq!(summary.body["problems_solved"], 1);
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
}

#[tokio::test]
async fn spa_fallback_serves_index_for_client_routes() {
    let Some(app) = test_app().await else { return };
    let req = Request::builder().uri("/learn/basics/intro/hello").body(Body::empty()).unwrap();
    let res = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert!(res.headers()[header::CONTENT_TYPE].to_str().unwrap().starts_with("text/html"));
    assert_eq!(res.headers()[header::CACHE_CONTROL], "no-cache");
}
