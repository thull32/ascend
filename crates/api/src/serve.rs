//! Serving with a bounded graceful shutdown, separate from `main` so tests
//! can drive it with their own shutdown trigger and timeouts.
//!
//! Shutdown has two stages, each with its own deadline, so the whole thing
//! fits inside the platform's drain window
//! (`RAILWAY_DEPLOYMENT_DRAINING_SECONDS`):
//!
//! 1. [`serve`]: on the shutdown signal, stop accepting and let open
//!    connections finish. Idle keep-alive connections close at once;
//!    in-flight responses run to completion. A client that never finishes
//!    reading (a stalled stream) would hold this forever, so after
//!    `drain_timeout` the server stops waiting.
//! 2. [`finish_tasks`]: let background tasks (streamed AI replies being
//!    persisted after the browser left) finish, again bounded.
use std::future::{Future, IntoFuture};
use std::net::SocketAddr;
use std::time::Duration;

use axum::Router;
use tokio::net::TcpListener;
use tokio_util::task::TaskTracker;

/// How a drain ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Drain {
    /// Every connection closed on its own.
    Clean,
    /// Connections were still open at the deadline and were abandoned.
    TimedOut,
}

/// Serves `router` on `listener` until `shutdown` resolves, then drains open
/// connections for at most `drain_timeout`.
pub async fn serve(
    listener: TcpListener,
    router: Router,
    shutdown: impl Future<Output = ()> + Send + 'static,
    drain_timeout: Duration,
) -> std::io::Result<Drain> {
    let (draining_tx, mut draining) = tokio::sync::watch::channel(false);
    let server = axum::serve(listener, router.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(async move {
            shutdown.await;
            let _ = draining_tx.send(true);
        });
    let deadline = async move {
        if draining.wait_for(|started| *started).await.is_ok() {
            tokio::time::sleep(drain_timeout).await;
        } else {
            std::future::pending::<()>().await;
        }
    };
    tokio::select! {
        result = server.into_future() => result.map(|()| Drain::Clean),
        () = deadline => Ok(Drain::TimedOut),
    }
}

/// Closes the tracker and waits up to `timeout` for its tasks. Returns
/// whether they all finished.
pub async fn finish_tasks(tasks: &TaskTracker, timeout: Duration) -> bool {
    tasks.close();
    tokio::time::timeout(timeout, tasks.wait()).await.is_ok()
}
