use chrono::{Duration, Utc};
use sea_orm::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use super::{password, token};
use crate::entities::prelude::*;
use crate::entities::{sessions, users};
use crate::error::{AppError, AppResult};

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterInput {
    #[validate(email(message = "must be a valid email address"))]
    #[validate(length(max = 320))]
    pub email: String,
    #[validate(length(min = 10, max = 200, message = "must be at least 10 characters"))]
    pub password: String,
    #[validate(length(min = 1, max = 80, message = "must be 1–80 characters"))]
    pub display_name: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct LoginInput {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 1, max = 200))]
    pub password: String,
}

/// The authenticated principal attached to a request.
#[derive(Debug, Clone, Serialize)]
pub struct CurrentUser {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub role: String,
    pub target_company: Option<String>,
    pub target_level: Option<String>,
    pub weekly_hours: i16,
    pub preferred_language: String,
    pub onboarded: bool,
    pub created_at: chrono::DateTime<Utc>,
}

impl CurrentUser {
    pub fn is_admin(&self) -> bool {
        self.role == "admin"
    }
}

impl From<users::Model> for CurrentUser {
    fn from(u: users::Model) -> Self {
        Self {
            id: u.id,
            email: u.email,
            display_name: u.display_name,
            role: u.role,
            target_company: u.target_company,
            target_level: u.target_level,
            weekly_hours: u.weekly_hours,
            preferred_language: u.preferred_language,
            onboarded: u.onboarded_at.is_some(),
            created_at: u.created_at,
        }
    }
}

pub struct NewSession {
    /// Raw token for the cookie. Not stored.
    pub token: String,
    pub expires_at: chrono::DateTime<Utc>,
}

#[derive(Clone)]
pub struct AuthService {
    db: DatabaseConnection,
    session_ttl: Duration,
}

impl AuthService {
    pub fn new(db: DatabaseConnection, session_ttl: std::time::Duration) -> Self {
        Self { db, session_ttl: Duration::from_std(session_ttl).unwrap_or_else(|_| Duration::days(30)) }
    }

    pub async fn register(
        &self,
        input: RegisterInput,
        user_agent: Option<String>,
    ) -> AppResult<(CurrentUser, NewSession)> {
        input.validate()?;
        let email = input.email.trim().to_lowercase();
        // Hash first, then insert and let the unique index decide. Checking
        // for the email before hashing made "already registered" responses
        // ~100 ms faster than successful ones (a timing oracle), and a
        // check-then-insert race surfaced as a 500.
        //
        // Registration still says when an email is taken: without an email
        // round trip there is no way to avoid that, and it is rate limited.
        // The login endpoint, which attackers probe at scale, reveals nothing.
        let password_hash = password::hash(input.password).await?;
        let now = Utc::now();
        let user = users::ActiveModel {
            id: Set(Uuid::now_v7()),
            email: Set(email),
            password_hash: Set(password_hash),
            display_name: Set(input.display_name.trim().to_string()),
            role: Set("user".into()),
            target_company: Set(None),
            target_level: Set(None),
            weekly_hours: Set(8),
            preferred_language: Set("python".into()),
            onboarded_at: Set(None),
            last_login_at: Set(Some(now)),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(&self.db)
        .await
        .map_err(|e| match e.sql_err() {
            Some(SqlErr::UniqueConstraintViolation(_)) => {
                AppError::Conflict("an account with that email already exists".into())
            }
            _ => AppError::Database(e),
        })?;
        let session = self.create_session(user.id, user_agent).await?;
        Ok((user.into(), session))
    }

    /// Deletes the account and everything it owns (progress, submissions,
    /// conversations, interviews, sessions cascade). Comments are kept and
    /// shown as "deleted user" so other people's replies survive (m0007).
    /// Requires the password: a stolen session alone cannot erase an account.
    pub async fn delete_account(&self, user_id: Uuid, password: String) -> AppResult<()> {
        let user = Users::find_by_id(user_id).one(&self.db).await?.ok_or(AppError::NotFound("user"))?;
        if !password::verify(password, Some(user.password_hash)).await {
            return Err(AppError::Validation("password is incorrect".into()));
        }
        Users::delete_by_id(user_id).exec(&self.db).await?;
        Ok(())
    }

    pub async fn login(&self, input: LoginInput, user_agent: Option<String>) -> AppResult<(CurrentUser, NewSession)> {
        input.validate()?;
        let email = input.email.trim().to_lowercase();
        let user = Users::find().filter(users::Column::Email.eq(&email)).one(&self.db).await?;
        // Always verify, even for unknown users, to keep timing uniform.
        let ok = password::verify(input.password, user.as_ref().map(|u| u.password_hash.clone())).await;
        let Some(user) = user.filter(|_| ok) else {
            return Err(AppError::Validation("invalid email or password".into()));
        };
        let mut active: users::ActiveModel = user.clone().into();
        active.last_login_at = Set(Some(Utc::now()));
        let user = active.update(&self.db).await?;
        let session = self.create_session(user.id, user_agent).await?;
        Ok((user.into(), session))
    }

    async fn create_session(&self, user_id: Uuid, user_agent: Option<String>) -> AppResult<NewSession> {
        let raw = token::generate();
        let now = Utc::now();
        let expires_at = now + self.session_ttl;
        sessions::ActiveModel {
            token_hash: Set(token::hash(&raw)),
            user_id: Set(user_id),
            expires_at: Set(expires_at),
            user_agent: Set(user_agent.map(|ua| ua.chars().take(255).collect())),
            created_at: Set(now),
            last_seen_at: Set(now),
        }
        .insert(&self.db)
        .await?;
        Ok(NewSession { token: raw, expires_at })
    }

    /// Resolve a cookie token to a user. Touches `last_seen_at` at most once
    /// per hour to avoid a write on every request.
    pub async fn authenticate(&self, raw_token: &str) -> AppResult<Option<CurrentUser>> {
        if !token::looks_valid(raw_token) {
            return Ok(None);
        }
        let hash = token::hash(raw_token);
        let Some((session, user)) = Sessions::find_by_id(&hash).find_also_related(Users).one(&self.db).await? else {
            return Ok(None);
        };
        let now = Utc::now();
        if session.expires_at < now {
            Sessions::delete_by_id(&hash).exec(&self.db).await?;
            return Ok(None);
        }
        let Some(user) = user else { return Ok(None) };
        if now - session.last_seen_at > Duration::hours(1) {
            let mut active: sessions::ActiveModel = session.into();
            active.last_seen_at = Set(now);
            active.update(&self.db).await?;
        }
        Ok(Some(user.into()))
    }

    pub async fn logout(&self, raw_token: &str) -> AppResult<()> {
        if token::looks_valid(raw_token) {
            Sessions::delete_by_id(token::hash(raw_token)).exec(&self.db).await?;
        }
        Ok(())
    }

    pub async fn logout_everywhere(&self, user_id: Uuid) -> AppResult<u64> {
        let res = Sessions::delete_many().filter(sessions::Column::UserId.eq(user_id)).exec(&self.db).await?;
        Ok(res.rows_affected)
    }

    /// Background sweep of expired sessions.
    pub async fn sweep_expired(&self) -> AppResult<u64> {
        let res = Sessions::delete_many().filter(sessions::Column::ExpiresAt.lt(Utc::now())).exec(&self.db).await?;
        Ok(res.rows_affected)
    }

    pub async fn get_user(&self, id: Uuid) -> AppResult<Option<CurrentUser>> {
        Ok(Users::find_by_id(id).one(&self.db).await?.map(Into::into))
    }
}

#[derive(Debug, Deserialize, Validate)]
pub struct ProfileUpdate {
    #[validate(length(min = 1, max = 80))]
    pub display_name: Option<String>,
    #[validate(length(max = 80))]
    pub target_company: Option<String>,
    #[validate(length(max = 40))]
    pub target_level: Option<String>,
    #[validate(range(min = 1, max = 80))]
    pub weekly_hours: Option<i16>,
    pub preferred_language: Option<String>,
    pub onboarded: Option<bool>,
}

impl AuthService {
    pub async fn update_profile(&self, user_id: Uuid, update: ProfileUpdate) -> AppResult<CurrentUser> {
        update.validate()?;
        let user = Users::find_by_id(user_id).one(&self.db).await?.ok_or(AppError::NotFound("user"))?;
        let mut active: users::ActiveModel = user.into();
        if let Some(v) = update.display_name {
            active.display_name = Set(v.trim().to_string());
        }
        if let Some(v) = update.target_company {
            active.target_company = Set(Some(v).filter(|s| !s.trim().is_empty()));
        }
        if let Some(v) = update.target_level {
            active.target_level = Set(Some(v).filter(|s| !s.trim().is_empty()));
        }
        if let Some(v) = update.weekly_hours {
            active.weekly_hours = Set(v);
        }
        if let Some(v) = update.preferred_language {
            if !["python", "javascript", "typescript"].contains(&v.as_str()) {
                return Err(AppError::validation("preferred_language must be python, javascript or typescript"));
            }
            active.preferred_language = Set(v);
        }
        if update.onboarded == Some(true) {
            active.onboarded_at = Set(Some(Utc::now()));
        }
        active.updated_at = Set(Utc::now());
        Ok(active.update(&self.db).await?.into())
    }
}
