//! Shared application state. Cloning is cheap: every field is an `Arc` or a
//! pool handle. Constructed once in `main`, injected into handlers via
//! `State<AppState>`.
use std::sync::Arc;
use std::time::Duration;

use ascend_core::Config;
use ascend_core::ai::coach::CoachService;
use ascend_core::ai::{AnthropicClient, BudgetService};
use ascend_core::auth::AuthService;
use ascend_core::content::Curriculum;
use ascend_core::services::grading::{GradingBackend, RemoteGrader};
use ascend_core::services::*;
use sea_orm::{ConnectOptions, Database, DatabaseConnection};
use secrecy::ExposeSecret;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: DatabaseConnection,
    pub curriculum: Arc<Curriculum>,
    pub auth: AuthService,
    pub progress: ProgressService,
    pub quiz: QuizService,
    pub submissions: SubmissionService,
    pub comments: CommentService,
    pub audio: ascend_core::services::audio::AudioService,
    pub roadmap: Arc<RoadmapService>,
    pub interviews: InterviewService,
    pub coach: CoachService,
    pub limiter: Arc<crate::middleware::rate_limit::Limiters>,
    /// Background work that must finish even if the client disconnects
    /// (persisting streamed AI replies). Drained on graceful shutdown.
    pub tasks: tokio_util::task::TaskTracker,
    /// Validator for content responses; see [`crate::build_info::content_etag`].
    pub content_etag: Arc<str>,
    /// Sends password-reset and verification links.
    pub mailer: ascend_core::email::Mailer,
}

pub async fn connect_db(config: &Config) -> anyhow::Result<DatabaseConnection> {
    let mut opts = ConnectOptions::new(config.database_url.expose_secret().to_string());
    opts
        // DATABASE_POOL_MAX per replica (default 20). Every replica, plus
        // the old ones still draining during a rolling deploy, shares
        // Postgres's max_connections (100 by default), so the budget is
        // checked at boot: see `check_connection_budget`.
        .max_connections(config.database_pool_max)
        .min_connections(2)
        // SeaORM passes this to sqlx as the acquire timeout: how long a
        // request waits for a free connection before failing fast.
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(300))
        // Recycle connections so server-side memory and plan caches reset
        // and failovers are picked up.
        .max_lifetime(Duration::from_secs(30 * 60))
        // Ping only connections idle for a while, not every checkout: saves
        // a round trip per request while still catching dead sockets.
        .test_before_acquire_if_idle_for(Duration::from_secs(60))
        .sqlx_logging(false);
    // A connect error can quote the URL it failed to use, password included;
    // it goes to logs, so strip the credentials first.
    Database::connect(opts)
        .await
        .map_err(|e| anyhow::anyhow!("database connect: {}", redact_credentials(&e.to_string())))
}

/// Logs this replica's share of Postgres's connection limit and warns when
/// adding its pool would leave less than 10 connections of headroom (for
/// migrations, psql and a rolling deploy's overlap). Adding replicas is the
/// usual way to hit it: lower `DATABASE_POOL_MAX` or put a pooler in front.
pub async fn check_connection_budget(db: &DatabaseConnection, pool_max: u32) {
    use sea_orm::ConnectionTrait;
    let q = "SELECT current_setting('max_connections')::int AS max, \
             (SELECT count(*) FROM pg_stat_activity)::int AS used";
    match db.query_one_raw(sea_orm::Statement::from_string(sea_orm::DatabaseBackend::Postgres, q)).await {
        Ok(Some(row)) => {
            let max: i32 = row.try_get("", "max").unwrap_or(0);
            let used: i32 = row.try_get("", "used").unwrap_or(0);
            let headroom = max - used - i32::try_from(pool_max).unwrap_or(i32::MAX);
            if headroom < 10 {
                tracing::warn!(
                    max_connections = max,
                    in_use = used,
                    pool_max,
                    headroom,
                    "connection budget nearly exhausted: lower DATABASE_POOL_MAX, remove replicas, or add a pooler"
                );
            } else {
                tracing::info!(max_connections = max, in_use = used, pool_max, headroom, "connection budget");
            }
        }
        Ok(None) => {}
        Err(e) => tracing::warn!(error = %e, "could not read the connection budget"),
    }
}

/// Replaces the password in any `scheme://user:password@host` in `text`.
pub fn redact_credentials(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(scheme_end) = rest.find("://") {
        let (head, tail) = rest.split_at(scheme_end + 3);
        out.push_str(head);
        let authority_end = tail.find(|c: char| c == '/' || c.is_whitespace()).unwrap_or(tail.len());
        match tail[..authority_end].rfind('@') {
            Some(at) => {
                let userinfo = &tail[..at];
                match userinfo.find(':') {
                    Some(colon) => {
                        out.push_str(&userinfo[..colon]);
                        out.push_str(":***");
                    }
                    None => out.push_str(userinfo),
                }
                out.push('@');
                rest = &tail[at + 1..];
            }
            None => rest = tail,
        }
    }
    out.push_str(rest);
    out
}

/// Chooses where submissions are graded. With `GRADER_URL` set, the grading
/// service does it (production). Otherwise this process loads and compiles
/// the runtimes itself (a second or two of CPU): in production a missing
/// grader is fatal, since no attempt could be recorded; in development it is
/// a warning, so the site runs before `make grader`.
pub async fn load_grader(config: &Config) -> anyhow::Result<Option<GradingBackend>> {
    if let (Some(url), Some(token)) = (&config.grader_url, &config.grader_token) {
        tracing::info!(%url, "grading delegated to the grading service");
        return Ok(Some(GradingBackend::Remote(
            RemoteGrader::new(url, token.clone())?.with_trace_headers(crate::telemetry::trace_headers),
        )));
    }
    let dir = config.grader_dir.clone();
    let mut options = ascend_grader::Options::default();
    if let Some(slots) = config.grader_slots {
        options.slots = slots;
    }
    let slots = options.slots;
    match tokio::task::spawn_blocking(move || ascend_grader::Grader::load(&dir, options)).await? {
        Ok(grader) => {
            tracing::info!(dir = %config.grader_dir.display(), slots, "grader ready");
            Ok(Some(GradingBackend::Local(grader)))
        }
        Err(e) if config.is_production() => Err(anyhow::anyhow!("grader: {e}")),
        Err(e) => {
            tracing::warn!(error = %e, "grader unavailable: attempts cannot be recorded until `make grader`");
            Ok(None)
        }
    }
}

impl AppState {
    pub fn build(
        config: Arc<Config>,
        db: DatabaseConnection,
        curriculum: Arc<Curriculum>,
        grader: Option<GradingBackend>,
    ) -> anyhow::Result<Self> {
        let client = match &config.ai.api_key {
            Some(key) => {
                Some(AnthropicClient::new(key.clone(), config.ai.base_url.clone(), config.ai.request_timeout)?)
            }
            None => {
                tracing::warn!("ANTHROPIC_API_KEY not set: AI coach, quizzes and interviews are disabled");
                None
            }
        };
        let budget = BudgetService::new(
            db.clone(),
            ascend_core::ai::budget::Limits {
                daily_requests: config.ai.daily_request_budget,
                daily_input_tokens: config.ai.daily_input_token_budget,
                daily_output_tokens: config.ai.daily_output_token_budget,
                cache_read_divisor: ascend_core::ai::budget::cache_read_divisor(&config.ai.model),
            },
        );
        let coach = CoachService::new(db.clone(), curriculum.clone(), client, budget, config.ai.model.clone());
        let mailer = match (&config.email.resend_api_key, &config.email.from) {
            (Some(key), Some(from)) => {
                ascend_core::email::Mailer::resend(key.clone(), from.clone(), config.email.base_url.clone())?
            }
            _ if config.is_production() => {
                tracing::warn!("RESEND_API_KEY not set: password reset and email verification are unavailable");
                ascend_core::email::Mailer::Disabled
            }
            _ => ascend_core::email::Mailer::Log,
        };
        Ok(Self {
            auth: match &config.pwned_passwords_url {
                Some(url) => AuthService::new(db.clone(), config.session_ttl, config.session_idle)
                    .with_breach_check(ascend_core::auth::breached::BreachedPasswords::new(url.clone())?),
                None => AuthService::new(db.clone(), config.session_ttl, config.session_idle),
            }
            .invite_only(config.signups == ascend_core::config::Signups::Invite),
            progress: ProgressService::new(db.clone(), curriculum.clone()),
            quiz: QuizService::new(db.clone(), curriculum.clone()),
            submissions: SubmissionService::new(db.clone(), curriculum.clone(), grader),
            comments: CommentService::new(db.clone(), curriculum.clone()),
            audio: ascend_core::services::audio::AudioService::new(db.clone(), config.audio.as_ref())?,
            roadmap: Arc::new(RoadmapService::new(curriculum.clone())),
            interviews: InterviewService::new(db.clone(), curriculum.clone()),
            coach,
            limiter: Arc::new(crate::middleware::rate_limit::Limiters::new(SharedLimiter::new(db.clone()))),
            tasks: tokio_util::task::TaskTracker::new(),
            content_etag: crate::build_info::content_etag(&curriculum.version, crate::app::index_html()).into(),
            mailer,
            config,
            db,
            curriculum,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::redact_credentials;

    #[test]
    fn connect_errors_never_carry_the_password() {
        assert_eq!(
            redact_credentials("error with configuration: postgres://ascend:s3cr3t@db:5432/ascend is invalid"),
            "error with configuration: postgres://ascend:***@db:5432/ascend is invalid"
        );
        assert_eq!(redact_credentials("postgres://u:p%40ss@h/db"), "postgres://u:***@h/db");
        assert_eq!(redact_credentials("postgres://host/db"), "postgres://host/db");
        assert_eq!(redact_credentials("no url here"), "no url here");
    }
}
