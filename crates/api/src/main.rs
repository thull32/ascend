//! Process entry point: load config, connect to Postgres, run migrations,
//! build the router, serve with graceful shutdown.
//!
//! Boot order matters: migrations run before the server binds so a healthy
//! `/readyz` means "schema is current". If migrations fail the process exits
//! non-zero and the platform keeps the previous deployment serving. See
//! `migrate.rs` for the advisory lock and the rollback case.
//!
//! Shutdown is bounded end to end so it fits inside the platform's drain
//! window (`RAILWAY_DEPLOYMENT_DRAINING_SECONDS`, set to 60 in
//! `.railway/railway.ts`): up to 25 s for open connections to finish, then up
//! to 30 s for background tasks that persist streamed replies.
use std::sync::Arc;
use std::time::Duration;

use ascend_core::Config;
use tokio::signal;

use ascend_api::{app, migrate, serve, state, telemetry};

/// How long open connections get to finish after SIGTERM.
const DRAIN_TIMEOUT: Duration = Duration::from_secs(25);
/// Then how long background tasks get to persist streamed replies.
const TASK_TIMEOUT: Duration = Duration::from_secs(30);

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // `ascend-api --check-content` validates the embedded curriculum strictly
    // and exits. The Docker build runs it so a broken lesson fails the build
    // instead of the deploy.
    if std::env::args().any(|a| a == "--check-content") {
        let c = ascend_core::content::load_curriculum(&ascend_core::content::ContentSource::Embedded)?;
        println!(
            "content ok: {} tracks, {} lessons, {} problems, version {}",
            c.tracks.len(),
            c.lesson_count(),
            c.problems.len(),
            c.version
        );
        return Ok(());
    }
    // `ascend-api --prepare-grader DIR` precompiles the grader's Python
    // standard library (after scripts/grader-runtimes.sh fetched it).
    if let Some(dir) = std::env::args().skip_while(|a| a != "--prepare-grader").nth(1) {
        ascend_grader::precompile_stdlib(std::path::Path::new(&dir))?;
        println!("grader ready in {dir}");
        return Ok(());
    }
    dotenvy::dotenv().ok();
    let config = Config::from_env().map_err(|e| anyhow::anyhow!("configuration: {e}"))?;
    telemetry::init(config.log_json);

    tracing::info!(env = ?config.env, addr = %config.bind_addr, "booting ascend-api");

    let db = state::connect_db(&config).await?;
    match ascend_api::migrate::run(&db).await? {
        migrate::Plan::Apply(applied) => tracing::info!(?applied, "migrations applied"),
        migrate::Plan::SchemaAhead(unknown) => {
            tracing::warn!(?unknown, "database schema is ahead of this build (a rollback?); starting without migrating")
        }
        _ => tracing::info!("schema up to date"),
    }

    let content_source = match std::env::var("CONTENT_DIR") {
        Ok(dir) => ascend_core::content::ContentSource::Disk(dir.into()),
        Err(_) => ascend_core::content::ContentSource::Embedded,
    };
    let curriculum = ascend_core::content::load_curriculum(&content_source)?;
    tracing::info!(
        tracks = curriculum.tracks.len(),
        lessons = curriculum.lesson_count(),
        problems = curriculum.problems.len(),
        version = %curriculum.version,
        "curriculum loaded"
    );

    let grader = state::load_grader(&config).await?;
    let state = state::AppState::build(Arc::new(config.clone()), db, curriculum, grader)?;
    ascend_core::auth::password::warm_up().await;
    let app = app::build(state.clone());

    // Background maintenance: sweep expired sessions and prune rate-limiter
    // state hourly.
    {
        let auth = state.auth.clone();
        let limiter = state.limiter.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(3600));
            loop {
                tick.tick().await;
                limiter.prune().await;
                match auth.sweep_expired().await {
                    Ok(n) if n > 0 => tracing::info!(removed = n, "swept expired sessions"),
                    Ok(_) => {}
                    Err(e) => tracing::warn!(error = %e, "session sweep failed"),
                }
            }
        });
    }

    let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
    tracing::info!(addr = %config.bind_addr, "listening");
    if serve::serve(listener, app, shutdown_signal(), DRAIN_TIMEOUT).await? == serve::Drain::TimedOut {
        tracing::warn!("connections still open after the drain timeout; shutting down anyway");
    }
    // Connections are drained; now let in-flight AI replies finish persisting
    // (bounded, so a hung upstream cannot block the deploy).
    if !serve::finish_tasks(&state.tasks, TASK_TIMEOUT).await {
        tracing::warn!(remaining = state.tasks.len(), "background tasks still running at shutdown");
    }
    tracing::info!("shutdown complete");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c().await.expect("install ctrl-c handler");
    };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate()).expect("install SIGTERM handler").recv().await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("shutdown signal received, draining connections");
}
