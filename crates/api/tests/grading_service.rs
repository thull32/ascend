//! The grading service (`ascend-api --serve-grader`) and the API's client for
//! it, over a real socket. Needs the grader runtimes (see crates/grader/tests).
use std::path::PathBuf;
use std::time::Duration;

use ascend_core::services::grading::RemoteGrader;
use ascend_grader::{Expected, GradeError, Grader, Job, Language, Options};
use serde_json::json;

fn grader(options: Options) -> Option<Grader> {
    let dir = std::env::var("GRADER_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../runtimes/grader"));
    match Grader::load(&dir, options) {
        Ok(g) => Some(g),
        Err(e) if std::env::var_os("GRADER_REQUIRED").is_none() => {
            eprintln!("skipping: {e}");
            None
        }
        Err(e) => panic!("{e}"),
    }
}

const TOKEN: &str = "a-test-token-that-is-long-enough-to-pass";

async fn start(g: Grader) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = ascend_api::grading_service::router(g, TOKEN);
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{addr}")
}

fn job(code: &str) -> Job {
    Job {
        language: Language::Python,
        code: code.into(),
        entry: "add".into(),
        cases: vec![vec![json!(1), json!(2)], vec![json!(2), json!(2)]],
        expected: vec![Expected { value: json!(3), any_order: false }, Expected { value: json!(4), any_order: false }],
        time_limit: Duration::from_secs(1),
    }
}

#[tokio::test]
async fn the_api_grades_through_the_service() {
    let Some(g) = grader(Options::default()) else { return };
    let url = start(g).await;
    let remote = RemoteGrader::new(&url, TOKEN.to_string().into()).unwrap();
    let outcome = remote.run(job("def add(a, b):\n    return a + b\n")).await.unwrap();
    assert_eq!(outcome.passed, vec![true, true]);
    let outcome = remote.run(job("def add(a, b):\n    return a * b\n")).await.unwrap();
    assert_eq!(outcome.passed, vec![false, true]);
}

#[tokio::test]
async fn the_service_refuses_callers_without_the_token() {
    let Some(g) = grader(Options::default()) else { return };
    let url = start(g).await;
    for token in ["wrong-token-wrong-token-wrong-token-xx", ""] {
        let remote = RemoteGrader::new(&url, token.to_string().into()).unwrap();
        match remote.run(job("def add(a, b):\n    return a + b\n")).await {
            Err(GradeError::Internal(e)) => assert!(e.contains("401"), "{e}"),
            other => panic!("expected a refusal, got {other:?}"),
        }
    }
    let health = reqwest::get(format!("{url}/healthz")).await.unwrap();
    assert!(health.status().is_success(), "health needs no token");
}

#[tokio::test]
async fn a_full_service_answers_busy_and_the_client_retries_then_reports_it() {
    let Some(g) = grader(Options { slots: 1, queue_timeout: Duration::from_millis(50), ..Options::default() }) else {
        return;
    };
    let url = start(g).await;
    let remote = RemoteGrader::new(&url, TOKEN.to_string().into()).unwrap();
    let mut slow = job("def add(a, b):\n    while True:\n        pass\n");
    slow.time_limit = Duration::from_millis(400);
    let busy = remote.clone();
    let (first, second) = tokio::join!(remote.run(slow.clone()), async move {
        tokio::time::sleep(Duration::from_millis(300)).await;
        busy.run(job("def add(a, b):\n    return a + b\n")).await
    });
    assert!(first.is_ok(), "{first:?}");
    assert!(matches!(second, Err(GradeError::Busy)), "{second:?}");
}

#[tokio::test]
async fn a_replica_that_drops_the_request_is_retried_with_the_trace_context() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    // A stand-in for the service: the first connection is dropped after the
    // request arrives (a replica dying mid-request); the second is answered.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let mut seen = Vec::new();
        for attempt in 0..2 {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 64 * 1024];
            let n = socket.read(&mut buf).await.unwrap();
            seen.push(String::from_utf8_lossy(&buf[..n]).to_lowercase());
            if attempt == 1 {
                let body =
                    r#"{"compile_error":null,"cases":[],"passed":[true],"stopped":null,"budget":1000,"elapsed":5}"#;
                let reply = format!(
                    "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                    body.len()
                );
                socket.write_all(reply.as_bytes()).await.unwrap();
            }
        }
        seen
    });
    fn trace() -> Vec<(String, String)> {
        vec![("traceparent".into(), "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01".into())]
    }
    let remote = RemoteGrader::new(&url, TOKEN.to_string().into()).unwrap().with_trace_headers(trace);
    let outcome = remote.run(job("def add(a, b):\n    return a + b\n")).await.unwrap();
    assert_eq!(outcome.passed, vec![true]);
    let seen = server.await.unwrap();
    assert_eq!(seen.len(), 2, "the dropped request was retried");
    assert!(seen[1].contains("traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-"), "{}", seen[1]);
}
