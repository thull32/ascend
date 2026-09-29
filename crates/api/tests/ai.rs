//! The AI routes against a stub of the Messages API: a streamed coach reply
//! reaches the browser, is persisted and settles the budget hold; a learner
//! who hangs up mid-stream still gets the reply saved and billed; structured
//! calls (quiz generation) parse. Before these, the streaming path was only
//! covered by the opt-in live suite, which spends real money.
//!
//! Needs `TEST_DATABASE_URL`, like `tests/api.rs`.
use std::convert::Infallible;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use ascend_api::{app, state};
use ascend_core::config::{AiConfig, Config, EmailConfig, Environment};
use ascend_core::content::{ContentSource, load_curriculum};
use axum::Router;
use axum::body::{Body, Bytes};
use futures::StreamExt;
use http::{Request, StatusCode, header};
use http_body_util::BodyExt;
use sea_orm::{ConnectionTrait, DatabaseConnection, Statement};
use sea_orm_migration::MigratorTrait;
use secrecy::SecretString;
use serde_json::{Value, json};
use tower::ServiceExt;

static MIGRATED: tokio::sync::OnceCell<()> = tokio::sync::OnceCell::const_new();

/// A stand-in for `POST /v1/messages`. Streaming requests get a fixed reply
/// in four deltas, `delay` apart; structured requests get JSON that fits the
/// schema they asked for. Every request body is recorded.
async fn stub_model(delay: Duration) -> (String, Arc<Mutex<Vec<Value>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = seen.clone();
    let router = Router::new().route(
        "/v1/messages",
        axum::routing::post(move |axum::Json(body): axum::Json<Value>| {
            let log = log.clone();
            async move {
                log.lock().unwrap().push(body.clone());
                if body["stream"] == json!(true) {
                    let mut events = vec![sse(
                        "message_start",
                        json!({"type": "message_start", "message": {"usage": {"input_tokens": 120,
                            "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}}}),
                    )];
                    for text in ["Hello", ", ", "learner", "."] {
                        events.push(sse(
                            "content_block_delta",
                            json!({"type": "content_block_delta", "delta": {"type": "text_delta", "text": text}}),
                        ));
                    }
                    events.push(sse(
                        "message_delta",
                        json!({"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 42}}),
                    ));
                    events.push(sse("message_stop", json!({"type": "message_stop"})));
                    let stream = futures::stream::iter(events).then(move |e| async move {
                        tokio::time::sleep(delay).await;
                        Ok::<_, Infallible>(Bytes::from(e))
                    });
                    return axum::response::Response::builder()
                        .header(header::CONTENT_TYPE, "text/event-stream")
                        .body(Body::from_stream(stream))
                        .unwrap();
                }
                let schema = &body["output_config"]["format"]["schema"];
                let text = if schema["properties"].get("questions").is_some() {
                    json!({"questions": (0..3).map(|i| json!({
                        "q": format!("Question {i}?"), "options": ["a", "b", "c", "d"], "answer": 1,
                        "explanation": "b is right because it is."
                    })).collect::<Vec<_>>()})
                    .to_string()
                } else {
                    "{}".to_string()
                };
                axum::Json(json!({
                    "content": [{"type": "text", "text": text}],
                    "usage": {"input_tokens": 300, "output_tokens": 150},
                    "stop_reason": "end_turn"
                }))
                .into_response()
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    (format!("http://{addr}"), seen)
}

use axum::response::IntoResponse;

fn sse(event: &str, data: Value) -> String {
    format!("event: {event}\ndata: {data}\n\n")
}

struct App {
    router: Router,
    db: DatabaseConnection,
    state: state::AppState,
    ip: String,
}

async fn app(model_url: String) -> Option<App> {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        assert!(std::env::var_os("CI").is_none(), "TEST_DATABASE_URL must be set in CI");
        eprintln!("TEST_DATABASE_URL not set; skipping");
        return None;
    };
    let cfg = Config {
        bind_addr: "127.0.0.1:0".into(),
        database_url: SecretString::from(url),
        database_pool_max: 20,
        public_origin: "http://localhost:8080".into(),
        cookie_secure: false,
        session_ttl: Duration::from_secs(3600),
        session_idle: Duration::from_secs(1800),
        ai: AiConfig {
            api_key: Some(SecretString::from("test-key")),
            model: "claude-test".into(),
            base_url: model_url,
            daily_output_token_budget: 200_000,
            daily_input_token_budget: 2_000_000,
            daily_request_budget: 50,
            request_timeout: Duration::from_secs(10),
        },
        log_json: false,
        env: Environment::Development,
        client_ip_header: Some("x-test-client-ip".into()),
        grader_dir: "runtimes/none".into(),
        grader_slots: None,
        pwned_passwords_url: None,
        email: EmailConfig { resend_api_key: None, from: None, base_url: None },
        contact_email: None,
    };
    MIGRATED
        .get_or_init(|| async {
            let db = state::connect_db(&cfg).await.expect("connect");
            migration::Migrator::up(&db, None).await.expect("migrate");
        })
        .await;
    let db = state::connect_db(&cfg).await.expect("connect");
    let fixtures = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/content");
    let curriculum = load_curriculum(&ContentSource::Disk(fixtures)).expect("fixtures load");
    let st = state::AppState::build(Arc::new(cfg), db.clone(), curriculum, None).expect("state");
    let id = uuid::Uuid::now_v7().as_u128();
    Some(App {
        router: app::build(st.clone()),
        db,
        state: st,
        ip: format!("fd01::{:x}:{:x}", (id >> 16) & 0xffff, id & 0xffff),
    })
}

impl App {
    fn request(&self, method: &str, path: &str, body: Option<Value>, cookie: Option<&str>) -> Request<Body> {
        let mut req = Request::builder()
            .method(method)
            .uri(path)
            .header("x-test-client-ip", &self.ip)
            .header("x-requested-with", "fetch");
        if let Some(c) = cookie {
            req = req.header(header::COOKIE, c);
        }
        match body {
            Some(b) => req.header(header::CONTENT_TYPE, "application/json").body(Body::from(b.to_string())),
            None => req.body(Body::empty()),
        }
        .unwrap()
    }

    async fn json(&self, method: &str, path: &str, body: Option<Value>, cookie: Option<&str>) -> (StatusCode, Value) {
        let res = self.router.clone().oneshot(self.request(method, path, body, cookie)).await.unwrap();
        let status = res.status();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    async fn signed_in(&self) -> (String, uuid::Uuid) {
        let email = format!("ai-{}@example.com", uuid::Uuid::now_v7());
        let req = self.request(
            "POST",
            "/api/auth/register",
            Some(json!({"email": email, "password": "correct-horse-battery", "display_name": "T"})),
            None,
        );
        let res = self.router.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let cookie = res
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .filter_map(|v| v.to_str().ok())
            .find(|v| v.starts_with("ascend_session="))
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_string();
        let (_, me) = self.json("GET", "/api/auth/me", None, Some(&cookie)).await;
        (cookie, me["id"].as_str().unwrap().parse().unwrap())
    }

    /// (input, output, reserved input, reserved output, requests) today.
    async fn usage(&self, user: uuid::Uuid) -> (i64, i64, i64, i64, i32) {
        let row = self
            .db
            .query_one_raw(Statement::from_sql_and_values(
                sea_orm::DatabaseBackend::Postgres,
                "SELECT input_tokens, output_tokens, reserved_input_tokens, reserved_output_tokens, requests \
                 FROM ai_usage WHERE user_id = $1",
                [user.into()],
            ))
            .await
            .unwrap()
            .expect("a usage row");
        (
            row.try_get("", "input_tokens").unwrap(),
            row.try_get("", "output_tokens").unwrap(),
            row.try_get("", "reserved_input_tokens").unwrap(),
            row.try_get("", "reserved_output_tokens").unwrap(),
            row.try_get("", "requests").unwrap(),
        )
    }

    /// Waits for the background task that persists a reply to finish.
    async fn assistant_reply(&self, cookie: &str, conversation: &str) -> Value {
        for _ in 0..200 {
            let (_, detail) =
                self.json("GET", &format!("/api/coach/conversations/{conversation}"), None, Some(cookie)).await;
            if let Some(m) = detail["messages"].as_array().and_then(|m| m.iter().find(|m| m["role"] == "assistant")) {
                return m.clone();
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        panic!("the reply was never persisted");
    }
}

#[tokio::test]
async fn a_coach_reply_streams_is_saved_and_settles_the_budget() {
    let (url, seen) = stub_model(Duration::ZERO).await;
    let Some(app) = app(url).await else { return };
    let (cookie, user) = app.signed_in().await;
    let (_, conv) = app.json("POST", "/api/coach/conversations", Some(json!({})), Some(&cookie)).await;
    let id = conv["id"].as_str().unwrap().to_string();

    let req = app.request(
        "POST",
        &format!("/api/coach/conversations/{id}/messages"),
        Some(json!({"content": "What is a heap?"})),
        Some(&cookie),
    );
    let res = app.router.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = String::from_utf8(res.into_body().collect().await.unwrap().to_bytes().to_vec()).unwrap();
    for part in ["event: delta", "data: Hello", "data: learner", "event: done"] {
        assert!(body.contains(part), "missing {part:?} in:\n{body}");
    }

    let reply = app.assistant_reply(&cookie, &id).await;
    assert_eq!(reply["content"], "Hello, learner.");
    // Token counts stay server-side; the row has them.
    let row = app
        .db
        .query_one_raw(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            "SELECT input_tokens, output_tokens FROM messages WHERE id = $1",
            [reply["id"].as_str().unwrap().parse::<uuid::Uuid>().unwrap().into()],
        ))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        (row.try_get::<i32>("", "input_tokens").unwrap(), row.try_get::<i32>("", "output_tokens").unwrap()),
        (120, 42)
    );
    // The hold is gone and the real usage recorded.
    assert_eq!(app.usage(user).await, (120, 42, 0, 0, 1));

    // What went to the model: the configured model, streamed, with the
    // learner's message last.
    let sent = seen.lock().unwrap().last().cloned().unwrap();
    assert_eq!(sent["model"], "claude-test");
    assert_eq!(sent["stream"], true);
    let last = sent["messages"].as_array().unwrap().last().unwrap();
    assert!(last["content"].to_string().contains("What is a heap?"), "{last}");
}

#[tokio::test]
async fn a_reply_is_saved_and_billed_when_the_learner_hangs_up_mid_stream() {
    let (url, _) = stub_model(Duration::from_millis(150)).await;
    let Some(app) = app(url).await else { return };
    let (cookie, user) = app.signed_in().await;
    let (_, conv) = app.json("POST", "/api/coach/conversations", Some(json!({})), Some(&cookie)).await;
    let id = conv["id"].as_str().unwrap().to_string();
    let req = app.request(
        "POST",
        &format!("/api/coach/conversations/{id}/messages"),
        Some(json!({"content": "Explain tries."})),
        Some(&cookie),
    );
    let res = app.router.clone().oneshot(req).await.unwrap();
    let mut body = res.into_body();
    // Read the first frame, then close the tab.
    let first = body.frame().await.expect("a first frame").unwrap();
    assert!(first.into_data().is_ok());
    drop(body);

    let reply = app.assistant_reply(&cookie, &id).await;
    assert_eq!(reply["content"], "Hello, learner.", "the whole reply, not the part that was sent");
    assert_eq!(app.usage(user).await, (120, 42, 0, 0, 1));
    // Nothing is left for the drain on shutdown to wait for.
    app.state.tasks.close();
    tokio::time::timeout(Duration::from_secs(5), app.state.tasks.wait()).await.expect("tasks finish");
}

#[tokio::test]
async fn a_generated_quiz_parses_and_is_billed() {
    let (url, seen) = stub_model(Duration::ZERO).await;
    let Some(app) = app(url).await else { return };
    let (cookie, user) = app.signed_in().await;
    let (status, quiz) = app.json("POST", "/api/coach/quiz/basics/intro/hello", Some(json!({})), Some(&cookie)).await;
    assert_eq!(status, StatusCode::OK, "{quiz}");
    assert_eq!(quiz["questions"].as_array().unwrap().len(), 3);
    assert!(quiz["questions"][0].get("answer").is_some());
    assert_eq!(app.usage(user).await, (300, 150, 0, 0, 1));
    let sent = seen.lock().unwrap().last().cloned().unwrap();
    assert_eq!(sent["output_config"]["format"]["type"], "json_schema");
    assert!(sent.get("stream").is_none_or(|s| s == &json!(false)));
}
