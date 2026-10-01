//! Configuration is loaded exactly once from the environment and validated
//! eagerly. A misconfigured deploy fails at boot with a clear message rather
//! than at the first request that touches the missing value.
use std::time::Duration;

use secrecy::{ExposeSecret, SecretString};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Signups {
    Open,
    Invite,
}

#[derive(Debug, Clone)]
pub struct Config {
    /// Address the HTTP server binds to. Railway injects `PORT`.
    pub bind_addr: String,
    pub database_url: SecretString,
    /// Connections this replica may hold (`DATABASE_POOL_MAX`, default 20).
    /// Replicas × this must stay under Postgres's `max_connections` with
    /// headroom; boot checks and warns (see `state::check_connection_budget`).
    pub database_pool_max: u32,
    /// Public origin of the app, e.g. `https://ascend.up.railway.app`. Used for
    /// CSRF origin checks and cookie `Secure` flag decisions.
    pub public_origin: String,
    /// Hosts that answer only with a permanent redirect to `public_origin`
    /// (`REDIRECT_HOSTS`, comma-separated): the platform's own domain and
    /// `www` once a custom domain is canonical. The CSRF check accepts one
    /// origin, so the app must be used through one host.
    pub redirect_hosts: Vec<String>,
    /// Who may create an account (`SIGNUPS`): `open` (default) or `invite`
    /// (a valid invite code is required; see `auth::invites`).
    pub signups: Signups,
    pub cookie_secure: bool,
    pub session_ttl: Duration,
    /// Sessions unused for this long are signed out (`SESSION_IDLE_DAYS`).
    pub session_idle: Duration,
    pub ai: AiConfig,
    pub log_json: bool,
    pub env: Environment,
    /// Header set by the trusted reverse proxy that carries the real client
    /// IP (Railway: `x-real-ip`). `None` means use the socket address. Never
    /// trust `X-Forwarded-For` blindly: its first entry is client-controlled.
    pub client_ip_header: Option<String>,
    /// Where the grader's WebAssembly runtimes live (`GRADER_DIR`; the image
    /// sets `/opt/ascend/grader`, `make grader` fills `runtimes/grader`).
    pub grader_dir: std::path::PathBuf,
    /// Grading runs at once (`GRADER_SLOTS`); default half the cores, 1–4.
    pub grader_slots: Option<usize>,
    /// The grading service (`GRADER_URL`, e.g. `http://grader.railway.internal:8080`).
    /// When set, submissions are graded there instead of in this process.
    pub grader_url: Option<String>,
    /// Shared secret for the grading service (`GRADER_TOKEN`).
    pub grader_token: Option<SecretString>,
    /// Pwned Passwords range API for screening new passwords
    /// (`PWNED_PASSWORDS_URL`; empty disables the check).
    pub pwned_passwords_url: Option<String>,
    pub email: EmailConfig,
    /// `CONTACT_EMAIL`: shown on the privacy page for data requests.
    pub contact_email: Option<String>,
}

/// Outgoing email (password resets, address verification) via Resend.
#[derive(Debug, Clone)]
pub struct EmailConfig {
    /// `RESEND_API_KEY`. Without it, development logs messages and
    /// production reports account recovery as unavailable.
    pub resend_api_key: Option<SecretString>,
    /// `EMAIL_FROM`, e.g. `Ascend <noreply@example.com>`, on a domain
    /// verified with the provider. Required when a key is set.
    pub from: Option<String>,
    /// `RESEND_BASE_URL`, for tests.
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    Development,
    Production,
}

#[derive(Debug, Clone)]
pub struct AiConfig {
    /// `None` disables every AI feature gracefully (the UI shows a notice).
    pub api_key: Option<SecretString>,
    pub model: String,
    pub base_url: String,
    /// Per-user, per-day output-token ceiling. Free product; this is the fuse.
    pub daily_output_token_budget: i64,
    /// Per-user, per-day ceiling on *billed* input tokens: cache writes
    /// count 1.25x and cache reads 0.1x (large lessons and editor contents
    /// make input the bigger share of cost).
    pub daily_input_token_budget: i64,
    pub daily_request_budget: i32,
    pub request_timeout: Duration,
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("missing required environment variable {0}")]
    Missing(&'static str),
    #[error("invalid value for {name}: {reason}")]
    Invalid { name: &'static str, reason: String },
}

fn var(name: &'static str) -> Result<String, ConfigError> {
    std::env::var(name).map_err(|_| ConfigError::Missing(name))
}

fn var_or(name: &'static str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

fn parse_or<T: std::str::FromStr>(name: &'static str, default: T) -> Result<T, ConfigError>
where
    T::Err: std::fmt::Display,
{
    match std::env::var(name) {
        Ok(raw) => raw.parse::<T>().map_err(|e| ConfigError::Invalid { name, reason: e.to_string() }),
        Err(_) => Ok(default),
    }
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let env = match var_or("APP_ENV", "development").as_str() {
            "production" | "prod" => Environment::Production,
            _ => Environment::Development,
        };
        let port = parse_or::<u16>("PORT", 8080)?;
        let host = var_or("HOST", "0.0.0.0");
        let public_origin = var_or("PUBLIC_ORIGIN", &format!("http://localhost:{port}"));
        let cookie_secure = parse_or::<bool>("COOKIE_SECURE", public_origin.starts_with("https://"))?;
        let session_ttl_days = parse_or::<u64>("SESSION_TTL_DAYS", 30)?;
        let session_idle_days = parse_or::<u64>("SESSION_IDLE_DAYS", 14)?;

        let api_key = std::env::var("ANTHROPIC_API_KEY").ok().filter(|k| !k.trim().is_empty()).map(SecretString::from);

        let cfg = Self {
            bind_addr: format!("{host}:{port}"),
            database_url: SecretString::from(var("DATABASE_URL")?),
            database_pool_max: parse_or::<u32>("DATABASE_POOL_MAX", 20)?.max(2),
            public_origin,
            signups: match var_or("SIGNUPS", "open").trim().to_ascii_lowercase().as_str() {
                "open" => Signups::Open,
                "invite" => Signups::Invite,
                other => {
                    return Err(ConfigError::Invalid {
                        name: "SIGNUPS",
                        reason: format!("{other:?}: use open or invite"),
                    });
                }
            },
            redirect_hosts: std::env::var("REDIRECT_HOSTS")
                .unwrap_or_default()
                .split(',')
                .map(|h| h.trim().to_ascii_lowercase())
                .filter(|h| !h.is_empty())
                .collect(),
            cookie_secure,
            session_ttl: Duration::from_secs(session_ttl_days * 86_400),
            session_idle: Duration::from_secs(session_idle_days * 86_400),
            ai: AiConfig {
                api_key,
                model: var_or("AI_MODEL", "claude-opus-5-5"),
                base_url: var_or("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
                daily_output_token_budget: parse_or::<i64>("AI_DAILY_OUTPUT_TOKENS", 60_000)?,
                daily_input_token_budget: parse_or::<i64>("AI_DAILY_INPUT_TOKENS", 2_000_000)?,
                daily_request_budget: parse_or::<i32>("AI_DAILY_REQUESTS", 120)?,
                request_timeout: Duration::from_secs(parse_or::<u64>("AI_TIMEOUT_SECS", 180)?),
            },
            log_json: parse_or::<bool>("LOG_JSON", env == Environment::Production)?,
            env,
            client_ip_header: std::env::var("CLIENT_IP_HEADER")
                .ok()
                .map(|h| h.trim().to_ascii_lowercase())
                .filter(|h| !h.is_empty()),
            grader_dir: var_or("GRADER_DIR", "runtimes/grader").into(),
            grader_url: std::env::var("GRADER_URL").ok().filter(|u| !u.trim().is_empty()),
            grader_token: std::env::var("GRADER_TOKEN").ok().filter(|t| !t.trim().is_empty()).map(SecretString::from),
            pwned_passwords_url: Some(var_or("PWNED_PASSWORDS_URL", "https://api.pwnedpasswords.com"))
                .filter(|u| !u.trim().is_empty()),
            contact_email: std::env::var("CONTACT_EMAIL").ok().filter(|c| c.contains('@')),
            email: EmailConfig {
                resend_api_key: std::env::var("RESEND_API_KEY")
                    .ok()
                    .filter(|k| !k.trim().is_empty())
                    .map(SecretString::from),
                from: std::env::var("EMAIL_FROM").ok().filter(|f| !f.trim().is_empty()),
                base_url: std::env::var("RESEND_BASE_URL").ok().filter(|u| !u.trim().is_empty()),
            },
            grader_slots: std::env::var("GRADER_SLOTS").ok().map(|v| v.parse()).transpose().map_err(|_| {
                ConfigError::Invalid { name: "GRADER_SLOTS", reason: "must be a positive integer".into() }
            })?,
        };
        cfg.validate()?;
        Ok(cfg)
    }

    fn validate(&self) -> Result<(), ConfigError> {
        if !self.database_url.expose_secret().starts_with("postgres") {
            return Err(ConfigError::Invalid { name: "DATABASE_URL", reason: "must be a postgres:// URL".into() });
        }
        if self.grader_url.is_some() && self.grader_token.is_none() {
            return Err(ConfigError::Invalid { name: "GRADER_TOKEN", reason: "required with GRADER_URL".into() });
        }
        if self.email.resend_api_key.is_some() && self.email.from.is_none() {
            return Err(ConfigError::Invalid {
                name: "EMAIL_FROM",
                reason: "required with RESEND_API_KEY (an address on a domain verified with Resend)".into(),
            });
        }
        if self.env == Environment::Production && !self.cookie_secure {
            return Err(ConfigError::Invalid {
                name: "COOKIE_SECURE",
                reason: "must be true in production (set PUBLIC_ORIGIN to an https:// URL)".into(),
            });
        }
        Ok(())
    }

    pub fn is_production(&self) -> bool {
        self.env == Environment::Production
    }
}
