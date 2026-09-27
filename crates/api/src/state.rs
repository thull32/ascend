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
    pub roadmap: Arc<RoadmapService>,
    pub interviews: InterviewService,
    pub coach: CoachService,
    pub limiter: Arc<crate::middleware::rate_limit::Limiters>,
    /// Background work that must finish even if the client disconnects
    /// (persisting streamed AI replies). Drained on graceful shutdown.
    pub tasks: tokio_util::task::TaskTracker,
    /// Validator for content responses; see [`crate::build_info::content_etag`].
    pub content_etag: Arc<str>,
}

pub async fn connect_db(config: &Config) -> anyhow::Result<DatabaseConnection> {
    let mut opts = ConnectOptions::new(config.database_url.expose_secret().to_string());
    opts
        // Sized for one replica on a small Postgres (max_connections ~100):
        // leaves headroom for migrations, psql, and a second replica during
        // a rolling deploy.
        .max_connections(20)
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
    let db = Database::connect(opts).await?;
    Ok(db)
}

impl AppState {
    pub fn build(config: Arc<Config>, db: DatabaseConnection, curriculum: Arc<Curriculum>) -> anyhow::Result<Self> {
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
            },
        );
        let coach = CoachService::new(db.clone(), curriculum.clone(), client, budget, config.ai.model.clone());
        Ok(Self {
            auth: AuthService::new(db.clone(), config.session_ttl),
            progress: ProgressService::new(db.clone(), curriculum.clone()),
            quiz: QuizService::new(db.clone(), curriculum.clone()),
            submissions: SubmissionService::new(db.clone(), curriculum.clone()),
            comments: CommentService::new(db.clone(), curriculum.clone()),
            roadmap: Arc::new(RoadmapService::new(curriculum.clone())),
            interviews: InterviewService::new(db.clone(), curriculum.clone()),
            coach,
            limiter: Arc::new(crate::middleware::rate_limit::Limiters::new()),
            tasks: tokio_util::task::TaskTracker::new(),
            content_etag: crate::build_info::content_etag(&curriculum.version, crate::app::index_html()).into(),
            config,
            db,
            curriculum,
        })
    }
}
