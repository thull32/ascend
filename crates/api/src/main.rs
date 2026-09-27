//! Process entry point: load config, connect to Postgres, run migrations,
//! build the router, serve with graceful shutdown.
//!
//! Boot order matters: migrations run before the server binds so a healthy
//! `/readyz` means "schema is current". If migrations fail the process exits
//! non-zero and the platform keeps the previous deployment serving.
use std::sync::Arc;
use std::time::Duration;

use ascend_core::Config;
use sea_orm_migration::MigratorTrait;
use tokio::signal;

use ascend_api::{app, state, telemetry};

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
    dotenvy::dotenv().ok();
    let config = Config::from_env().map_err(|e| anyhow::anyhow!("configuration: {e}"))?;
    telemetry::init(config.log_json);

    tracing::info!(env = ?config.env, addr = %config.bind_addr, "booting ascend-api");

    let db = state::connect_db(&config).await?;
    tracing::info!("running migrations");
    migration::Migrator::up(&db, None).await?;

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

    let state = state::AppState::build(Arc::new(config.clone()), db, curriculum)?;
    let app = app::build(state.clone());

    // Background maintenance: sweep expired sessions hourly.
    {
        let auth = state.auth.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(3600));
            loop {
                tick.tick().await;
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
    axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())
        .with_graceful_shutdown(shutdown_signal())
        .await?;
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
