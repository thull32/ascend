//! Configuration is loaded exactly once from the environment and validated
//! eagerly. A misconfigured deploy fails at boot with a clear message rather
//! than at the first request that touches the missing value.
use std::time::Duration;

use secrecy::{ExposeSecret, SecretString};

#[derive(Debug, Clone)]
pub struct Config {
    /// Address the HTTP server binds to. Railway injects `PORT`.
    pub bind_addr: String,
    pub database_url: SecretString,
    /// Public origin of the app, e.g. `https://ascend.up.railway.app`. Used for
    /// CSRF origin checks and cookie `Secure` flag decisions.
    pub public_origin: String,
    pub cookie_secure: bool,
    pub session_ttl: Duration,
    pub ai: AiConfig,
    pub log_json: bool,
    pub env: Environment,
    /// Header set by the trusted reverse proxy that carries the real client
    /// IP (Railway: `x-real-ip`). `None` means use the socket address. Never
    /// trust `X-Forwarded-For` blindly: its first entry is client-controlled.
    pub client_ip_header: Option<String>,
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
    /// Cheaper model for high-volume, low-stakes calls (titles, quiz grading).
    pub fast_model: String,
    pub base_url: String,
    /// Per-user, per-day output-token ceiling. Free product; this is the fuse.
    pub daily_output_token_budget: i64,
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

        let api_key = std::env::var("ANTHROPIC_API_KEY")
            .ok()
            .filter(|k| !k.trim().is_empty())
            .map(SecretString::from);

        let cfg = Self {
            bind_addr: format!("{host}:{port}"),
            database_url: SecretString::from(var("DATABASE_URL")?),
            public_origin,
            cookie_secure,
            session_ttl: Duration::from_secs(session_ttl_days * 86_400),
            ai: AiConfig {
                api_key,
                model: var_or("AI_MODEL", "claude-opus-5"),
                fast_model: var_or("AI_FAST_MODEL", "claude-haiku-4-5"),
                base_url: var_or("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
                daily_output_token_budget: parse_or::<i64>("AI_DAILY_OUTPUT_TOKENS", 60_000)?,
                daily_request_budget: parse_or::<i32>("AI_DAILY_REQUESTS", 120)?,
                request_timeout: Duration::from_secs(parse_or::<u64>("AI_TIMEOUT_SECS", 180)?),
            },
            log_json: parse_or::<bool>("LOG_JSON", env == Environment::Production)?,
            env,
            client_ip_header: std::env::var("CLIENT_IP_HEADER")
                .ok()
                .map(|h| h.trim().to_ascii_lowercase())
                .filter(|h| !h.is_empty()),
        };
        cfg.validate()?;
        Ok(cfg)
    }

    fn validate(&self) -> Result<(), ConfigError> {
        if !self.database_url.expose_secret().starts_with("postgres") {
            return Err(ConfigError::Invalid { name: "DATABASE_URL", reason: "must be a postgres:// URL".into() });
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
