//! Graceful shutdown, over real sockets: what a deploy does to open
//! connections. `serve` is the function `main` runs; these tests give it
//! their own shutdown trigger and short timeouts.
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use ascend_api::serve::{Drain, finish_tasks, serve};
use axum::Router;
use axum::body::{Body, Bytes};
use axum::routing::get;
use futures::StreamExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Notify, oneshot};
use tokio::task::JoinHandle;
use tokio_util::task::TaskTracker;

#[derive(Default)]
struct Gate {
    started: Notify,
    release: Notify,
}

fn router(gate: Arc<Gate>) -> Router {
    Router::new()
        .route("/fast", get(|| async { "ok" }))
        // Held open until the test releases it.
        .route(
            "/slow",
            get(move || {
                let gate = gate.clone();
                async move {
                    gate.started.notify_one();
                    gate.release.notified().await;
                    "done"
                }
            }),
        )
        // One chunk, then nothing, ever: a stream whose reader has stalled.
        .route(
            "/forever",
            get(|| async {
                let first = futures::stream::once(async { Ok::<_, Infallible>(Bytes::from_static(b"tick")) });
                Body::from_stream(first.chain(futures::stream::pending()))
            }),
        )
}

struct Server {
    addr: SocketAddr,
    gate: Arc<Gate>,
    trigger: oneshot::Sender<()>,
    handle: JoinHandle<std::io::Result<Drain>>,
}

async fn start(drain_timeout: Duration) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let gate = Arc::new(Gate::default());
    let (trigger, signal) = oneshot::channel::<()>();
    let shutdown = async move {
        let _ = signal.await;
    };
    let handle = tokio::spawn(serve(listener, router(gate.clone()), shutdown, drain_timeout));
    Server { addr, gate, trigger, handle }
}

async fn send(addr: SocketAddr, path: &str) -> TcpStream {
    let mut conn = TcpStream::connect(addr).await.unwrap();
    conn.write_all(format!("GET {path} HTTP/1.1\r\nhost: test\r\n\r\n").as_bytes()).await.unwrap();
    conn
}

/// Reads until `needle` has arrived (or panics after two seconds).
async fn read_until(conn: &mut TcpStream, needle: &str) -> String {
    let mut seen = Vec::new();
    let mut buf = [0u8; 1024];
    tokio::time::timeout(Duration::from_secs(2), async {
        while !String::from_utf8_lossy(&seen).contains(needle) {
            let n = conn.read(&mut buf).await.unwrap();
            assert!(n > 0, "connection closed before {needle:?}: {}", String::from_utf8_lossy(&seen));
            seen.extend_from_slice(&buf[..n]);
        }
    })
    .await
    .unwrap_or_else(|_| panic!("no {needle:?} within 2 s: {}", String::from_utf8_lossy(&seen)));
    String::from_utf8_lossy(&seen).into_owned()
}

#[tokio::test]
async fn an_in_flight_request_finishes_while_new_connections_are_refused() {
    let s = start(Duration::from_secs(10)).await;
    let mut conn = send(s.addr, "/slow").await;
    s.gate.started.notified().await;
    s.trigger.send(()).unwrap();

    // The listener closes promptly, while the slow request is still open.
    let refused = tokio::time::timeout(Duration::from_secs(2), async {
        while TcpStream::connect(s.addr).await.is_ok() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await;
    assert!(refused.is_ok(), "still accepting connections after the shutdown signal");
    assert!(!s.handle.is_finished(), "the server stopped before its in-flight request finished");

    s.gate.release.notify_one();
    let response = read_until(&mut conn, "done").await;
    assert!(response.starts_with("HTTP/1.1 200"), "{response}");
    let drained = tokio::time::timeout(Duration::from_secs(2), s.handle).await.expect("server exits").unwrap();
    assert_eq!(drained.unwrap(), Drain::Clean);
}

#[tokio::test]
async fn idle_keep_alive_connections_do_not_delay_shutdown() {
    let s = start(Duration::from_secs(10)).await;
    let mut conn = send(s.addr, "/fast").await;
    read_until(&mut conn, "ok").await;
    // `conn` stays open (HTTP/1.1 keep-alive) but has nothing in flight.
    let began = Instant::now();
    s.trigger.send(()).unwrap();
    let drained = tokio::time::timeout(Duration::from_secs(2), s.handle).await.expect("server exits").unwrap();
    assert_eq!(drained.unwrap(), Drain::Clean);
    assert!(began.elapsed() < Duration::from_secs(2));
    drop(conn);
}

#[tokio::test]
async fn a_stalled_stream_cannot_hold_shutdown_past_the_drain_timeout() {
    let drain = Duration::from_millis(300);
    let s = start(drain).await;
    let mut conn = send(s.addr, "/forever").await;
    read_until(&mut conn, "tick").await;
    let began = Instant::now();
    s.trigger.send(()).unwrap();
    let drained = tokio::time::timeout(Duration::from_secs(3), s.handle).await.expect("server exits").unwrap();
    assert_eq!(drained.unwrap(), Drain::TimedOut);
    let took = began.elapsed();
    assert!(took >= drain, "gave up after {took:?}, before the {drain:?} drain");
    assert!(took < drain * 4, "took {took:?} for a {drain:?} drain");
    drop(conn);
}

#[tokio::test]
async fn background_tasks_get_to_finish_but_not_forever() {
    let tasks = TaskTracker::new();
    let persisted = Arc::new(AtomicBool::new(false));
    let flag = persisted.clone();
    tasks.spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        flag.store(true, Ordering::SeqCst);
    });
    assert!(finish_tasks(&tasks, Duration::from_secs(2)).await);
    assert!(persisted.load(Ordering::SeqCst), "the task was cut off");

    let hung = TaskTracker::new();
    hung.spawn(std::future::pending::<()>());
    let began = Instant::now();
    assert!(!finish_tasks(&hung, Duration::from_millis(100)).await);
    assert!(began.elapsed() < Duration::from_secs(1));
}
