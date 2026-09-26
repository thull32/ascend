//! Shared application state. Cloning is cheap: every field is an `Arc` or a
//! pool handle. Constructed once in `main`, injected into handlers via
//! `State<AppState>`.
use std::sync::Arc;
use std::time::Duration;

use ascend_core::ai::coach::CoachService;
use ascend_core::ai::{AnthropicClient, BudgetService};
use ascend_core::auth::AuthService;
use ascend_core::content::Curriculum;
use ascend_core::services::*;
use ascend_core::Config;
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
}

pub async fn connect_db(config: &Config) -> anyhow::Result<DatabaseConnection> {
    let mut opts = ConnectOptions::new(config.database_url.expose_secret().to_string());
    opts.max_connections(20)
        .min_connections(2)
        .connect_timeout(Duration::from_secs(10))
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_secs(300))
        .sqlx_logging(false);
    let db = Database::connect(opts).await?;
    Ok(db)
}

impl AppState {
    pub fn build(config: Arc<Config>, db: DatabaseConnection, curriculum: Arc<Curriculum>) -> anyhow::Result<Self> {
        let client = match &config.ai.api_key {
            Some(key) => Some(AnthropicClient::new(key.clone(), config.ai.base_url.clone(), config.ai.request_timeout)?),
            None => {
                tracing::warn!("ANTHROPIC_API_KEY not set: AI coach, quizzes and interviews are disabled");
                None
            }
        };
        let budget = BudgetService::new(db.clone(), config.ai.daily_request_budget, config.ai.daily_output_token_budget);
        let coach = CoachService::new(
            db.clone(),
            curriculum.clone(),
            client,
            budget,
            config.ai.model.clone(),
            config.ai.fast_model.clone(),
        );
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
            config,
            db,
            curriculum,
        })
    }
}
