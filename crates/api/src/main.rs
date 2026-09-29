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
    // `ascend-api --grade-solutions [PREFIX] [--exercises|--problems]
    // [--require-all]` grades every
    // reference solution in ./solutions with the server's grader, exactly as
    // learners' submissions are graded. Used by authors and by CI.
    if let Some(i) = std::env::args().position(|a| a == "--grade-solutions") {
        let args: Vec<String> = std::env::args().skip(i + 1).collect();
        let require_all = args.iter().any(|a| a == "--require-all");
        let scope = match () {
            _ if args.iter().any(|a| a == "--problems") => ascend_core::services::reference::Scope::Problems,
            _ if args.iter().any(|a| a == "--exercises") => ascend_core::services::reference::Scope::Exercises,
            _ => ascend_core::services::reference::Scope::All,
        };
        let filter = args.iter().find(|a| !a.starts_with("--")).cloned();
        return grade_solutions(filter.as_deref(), scope, require_all).await;
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

    // Background maintenance, hourly: sweep expired sessions and email
    // links, prune rate-limiter state, and apply the retention policy.
    {
        let auth = state.auth.clone();
        let limiter = state.limiter.clone();
        let db = state.db.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(3600));
            loop {
                tick.tick().await;
                limiter.prune().await;
                match auth.sweep_expired().await {
                    Ok(n) if n > 0 => tracing::info!(removed = n, "swept expired sessions and links"),
                    Ok(_) => {}
                    Err(e) => tracing::warn!(error = %e, "session sweep failed"),
                }
                // One replica per round (advisory lock); see retention.rs.
                if let Err(e) = ascend_core::services::retention::run(&db, Default::default()).await {
                    tracing::warn!(error = %e, "retention round failed");
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

async fn grade_solutions(
    filter: Option<&str>,
    scope: ascend_core::services::reference::Scope,
    require_all: bool,
) -> anyhow::Result<()> {
    let content = std::env::var("CONTENT_DIR").unwrap_or_else(|_| "content".into());
    let curriculum = ascend_core::content::load_curriculum(&ascend_core::content::ContentSource::Disk(content.into()))?;
    let dir = std::env::var("GRADER_DIR").unwrap_or_else(|_| "runtimes/grader".into());
    let parallel = match std::env::var("GRADE_PARALLEL").ok().and_then(|v| v.parse().ok()) {
        Some(n) => n,
        None => std::thread::available_parallelism().map_or(2, |n| n.get()).clamp(1, 8),
    };
    let options =
        ascend_grader::Options { slots: parallel, queue_timeout: Duration::from_secs(3600), ..Default::default() };
    let grader =
        tokio::task::spawn_blocking(move || ascend_grader::Grader::load(std::path::Path::new(&dir), options)).await??;
    let solutions = std::env::var("SOLUTIONS_DIR").unwrap_or_else(|_| "solutions".into());
    let report = ascend_core::services::reference::check(
        &curriculum,
        &grader,
        std::path::Path::new(&solutions),
        filter,
        scope,
        parallel,
    )
    .await;
    let (missing, failed): (Vec<_>, Vec<_>) = report.findings.iter().partition(|f| f.is_missing());
    for f in &failed {
        println!("FAIL {} [{}]", f.target, f.language);
        for line in &f.failures {
            println!("    {line}");
        }
    }
    for f in &missing {
        println!("MISSING {} [{}]", f.target, f.language);
    }
    println!(
        "{} checked, {} passed, {} failed, {} missing",
        report.graded,
        report.graded - failed.len() - missing.len(),
        failed.len(),
        missing.len()
    );
    if !failed.is_empty() || (require_all && !missing.is_empty()) {
        std::process::exit(1);
    }
    Ok(())
}
