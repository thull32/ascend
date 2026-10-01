use chrono::{Duration, Utc};
use sea_orm::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use super::breached::BreachedPasswords;
use super::{password, token};
use crate::entities::prelude::*;
use crate::entities::{sessions, users};
use crate::error::{AppError, AppResult};
use crate::services::activity;

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterInput {
    #[validate(email(message = "must be a valid email address"))]
    #[validate(length(max = 320))]
    pub email: String,
    /// NIST SP 800-63B-4: at least 15 characters for a password that is the
    /// only factor, and no composition rules. Sign-in accepts any length, so
    /// accounts created under the old 10-character rule keep working.
    #[validate(length(min = 15, max = 200, message = "must be at least 15 characters"))]
    pub password: String,
    #[validate(length(min = 1, max = 80, message = "must be 1–80 characters"))]
    pub display_name: String,
    /// The browser's IANA time zone. Ignored when Postgres does not know it.
    #[serde(default)]
    pub timezone: Option<String>,
    /// Required when sign-up is invite-only; ignored otherwise.
    #[serde(default)]
    pub invite: Option<String>,
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
    pub timezone: Option<String>,
    pub email_verified: bool,
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
            timezone: u.timezone,
            email_verified: u.email_verified_at.is_some(),
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
    /// A session unused for this long is dead even before `session_ttl`:
    /// a forgotten laptop should not stay signed in for a month.
    session_idle: Duration,
    /// Screens new passwords against known breaches; `None` skips it.
    breached: Option<BreachedPasswords>,
    /// Registration needs an invite code (`SIGNUPS=invite`).
    invite_only: bool,
}

impl AuthService {
    pub fn new(db: DatabaseConnection, session_ttl: std::time::Duration, session_idle: std::time::Duration) -> Self {
        Self {
            db,
            session_ttl: Duration::from_std(session_ttl).unwrap_or_else(|_| Duration::days(30)),
            session_idle: Duration::from_std(session_idle).unwrap_or_else(|_| Duration::days(14)),
            breached: None,
            invite_only: false,
        }
    }

    pub fn invite_only(mut self, invite_only: bool) -> Self {
        self.invite_only = invite_only;
        self
    }

    pub fn with_breach_check(mut self, breached: BreachedPasswords) -> Self {
        self.breached = Some(breached);
        self
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
        // Without a well-formed code, refuse before the slow hash and the
        // breach lookup; whether the code is valid is decided below.
        if self.invite_only && !input.invite.as_deref().is_some_and(|c| token::looks_valid(c.trim())) {
            return Err(AppError::Validation("an invite is required to sign up, and this one is not valid".into()));
        }
        self.screen_password(&input.password).await?;
        let password_hash = password::hash(input.password).await?;
        // A bad zone must not block sign-up: fall back to UTC, and the
        // browser sets it again once the learner is signed in.
        let timezone = match input.timezone {
            Some(tz) if tz.len() <= 64 && activity::is_known_timezone(&self.db, &tz).await? => Some(tz),
            _ => None,
        };
        let now = Utc::now();
        // The invite is spent in the same transaction as the insert: a
        // refused or failed sign-up leaves the code unused, and concurrent
        // sign-ups cannot exceed its uses (the UPDATE takes the row lock).
        let txn = self.db.begin().await?;
        if self.invite_only {
            super::invites::consume(&txn, input.invite.as_deref()).await?;
        }
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
            timezone: Set(timezone),
            email_verified_at: Set(None),
            onboarded_at: Set(None),
            last_login_at: Set(Some(now)),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(&txn)
        .await
        .map_err(|e| match e.sql_err() {
            Some(SqlErr::UniqueConstraintViolation(_)) => {
                AppError::Conflict("an account with that email already exists".into())
            }
            _ => AppError::Database(e),
        })?;
        txn.commit().await?;
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

    /// Resolve a cookie token to a user. A session past its absolute expiry
    /// or idle for longer than `session_idle` is deleted and rejected.
    /// Touches `last_seen_at` at most once per hour to avoid a write on
    /// every request, so idleness is measured to within an hour.
    pub async fn authenticate(&self, raw_token: &str) -> AppResult<Option<CurrentUser>> {
        if !token::looks_valid(raw_token) {
            return Ok(None);
        }
        let hash = token::hash(raw_token);
        let Some((session, user)) = Sessions::find_by_id(&hash).find_also_related(Users).one(&self.db).await? else {
            return Ok(None);
        };
        let now = Utc::now();
        if session.expires_at < now || now - session.last_seen_at > self.session_idle {
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

    /// Background sweep of expired and idle sessions.
    pub async fn sweep_expired(&self) -> AppResult<u64> {
        let now = Utc::now();
        let res = Sessions::delete_many()
            .filter(
                Condition::any()
                    .add(sessions::Column::ExpiresAt.lt(now))
                    .add(sessions::Column::LastSeenAt.lt(now - self.session_idle)),
            )
            .exec(&self.db)
            .await?;
        let links = self
            .db
            .execute_raw(Statement::from_string(
                DatabaseBackend::Postgres,
                "DELETE FROM email_tokens WHERE expires_at < now()",
            ))
            .await?;
        Ok(res.rows_affected + links.rows_affected())
    }

    /// Records this browser as a known device for `user_id` and returns the
    /// raw token for its cookie. Only a hash is stored, and each account
    /// keeps its 20 most recent devices.
    pub async fn remember_device(&self, user_id: Uuid) -> AppResult<String> {
        let raw = token::generate();
        self.db
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "INSERT INTO login_devices (token_hash, user_id) VALUES ($1, $2)",
                [token::hash(&raw).into(), user_id.into()],
            ))
            .await?;
        self.db
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "DELETE FROM login_devices WHERE user_id = $1 AND token_hash NOT IN \
                 (SELECT token_hash FROM login_devices WHERE user_id = $1 ORDER BY last_used_at DESC LIMIT 20)",
                [user_id.into()],
            ))
            .await?;
        Ok(raw)
    }

    /// Whether `raw_device` is a device known for the account with this
    /// email. Unknown emails and forged or foreign tokens are simply "no".
    pub async fn is_known_device(&self, email: &str, raw_device: Option<&str>) -> AppResult<bool> {
        let Some(raw) = raw_device.filter(|t| token::looks_valid(t)) else { return Ok(false) };
        let row = self
            .db
            .query_one_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "UPDATE login_devices d SET last_used_at = now() FROM users u \
                 WHERE d.token_hash = $1 AND d.user_id = u.id AND u.email = $2 RETURNING d.user_id",
                [token::hash(raw).into(), email.trim().to_lowercase().into()],
            ))
            .await?;
        Ok(row.is_some())
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
    /// IANA name such as `Europe/London`; validated against Postgres.
    #[validate(length(min = 1, max = 64))]
    pub timezone: Option<String>,
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
        if let Some(v) = update.timezone {
            if !activity::is_known_timezone(&self.db, &v).await? {
                return Err(AppError::validation("timezone must be an IANA time zone name, such as Europe/London"));
            }
            active.timezone = Set(Some(v));
        }
        if update.onboarded == Some(true) {
            active.onboarded_at = Set(Some(Utc::now()));
        }
        active.updated_at = Set(Utc::now());
        Ok(active.update(&self.db).await?.into())
    }
}

/// A new password, as sign-up and reset both require it (NIST SP 800-63B-4:
/// at least 15 characters for a single factor, no composition rules).
#[derive(Debug, Deserialize, Validate)]
struct NewPassword<'a> {
    #[validate(length(min = 15, max = 200, message = "must be at least 15 characters"))]
    password: &'a str,
}

/// What a single-use email link is for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkPurpose {
    Reset,
    Verify,
}

impl LinkPurpose {
    fn as_str(self) -> &'static str {
        match self {
            LinkPurpose::Reset => "reset",
            LinkPurpose::Verify => "verify",
        }
    }

    /// Reset links are short-lived (they grant the account); verification
    /// links only confirm an address the learner already signed up with.
    fn ttl(self) -> Duration {
        match self {
            LinkPurpose::Reset => Duration::hours(1),
            LinkPurpose::Verify => Duration::days(7),
        }
    }
}

/// A link to email: who it goes to and the raw token (never stored).
#[derive(Debug, Clone)]
pub struct EmailLink {
    pub email: String,
    pub display_name: String,
    pub token: String,
}

const INVALID_LINK: &str = "this link is invalid or has expired; ask for a new one";

impl AuthService {
    /// Rejects passwords that are too short or known from breaches.
    pub async fn screen_password(&self, password: &str) -> AppResult<()> {
        NewPassword { password }.validate()?;
        if let Some(check) = &self.breached
            && check.is_breached(password).await == Some(true)
        {
            return Err(AppError::validation(
                "password has appeared in a data breach, so attackers try it early; choose a different one",
            ));
        }
        Ok(())
    }

    /// Creates a single-use link token for `user`, replacing any older link
    /// of the same purpose, and returns what to email.
    async fn issue_link(&self, user: &users::Model, purpose: LinkPurpose) -> AppResult<EmailLink> {
        let raw = token::generate();
        let txn = self.db.begin().await?;
        txn.execute_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM email_tokens WHERE user_id = $1 AND purpose = $2",
            [user.id.into(), purpose.as_str().into()],
        ))
        .await?;
        txn.execute_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "INSERT INTO email_tokens (token_hash, user_id, purpose, email, expires_at) VALUES ($1, $2, $3, $4, $5)",
            [
                token::hash(&raw).into(),
                user.id.into(),
                purpose.as_str().into(),
                user.email.clone().into(),
                (Utc::now() + purpose.ttl()).into(),
            ],
        ))
        .await?;
        txn.commit().await?;
        Ok(EmailLink { email: user.email.clone(), display_name: user.display_name.clone(), token: raw })
    }

    /// Consumes a link token atomically: the row is deleted as it is read,
    /// so a link works once even if clicked twice at the same moment.
    /// Returns the user it belongs to, if the address has not changed since.
    async fn consume_link(&self, raw: &str, purpose: LinkPurpose) -> AppResult<users::Model> {
        if !token::looks_valid(raw) {
            return Err(AppError::validation(INVALID_LINK));
        }
        let row = self
            .db
            .query_one_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "DELETE FROM email_tokens WHERE token_hash = $1 AND purpose = $2 AND expires_at > now() \
                 RETURNING user_id, email",
                [token::hash(raw).into(), purpose.as_str().into()],
            ))
            .await?
            .ok_or_else(|| AppError::validation(INVALID_LINK))?;
        let user_id: Uuid = row.try_get("", "user_id")?;
        let email: String = row.try_get("", "email")?;
        Users::find_by_id(user_id)
            .one(&self.db)
            .await?
            .filter(|u| u.email == email)
            .ok_or_else(|| AppError::validation(INVALID_LINK))
    }

    /// Starts a password reset. `None` when no account has that address;
    /// callers must respond identically either way.
    pub async fn start_password_reset(&self, email: &str) -> AppResult<Option<EmailLink>> {
        let email = email.trim().to_lowercase();
        let Some(user) = Users::find().filter(users::Column::Email.eq(&email)).one(&self.db).await? else {
            return Ok(None);
        };
        Ok(Some(self.issue_link(&user, LinkPurpose::Reset).await?))
    }

    /// Sets a new password from a reset link, signs the account out
    /// everywhere, and signs this browser in. Following the link also proves
    /// the learner controls the address, so it counts as verification.
    pub async fn reset_password(
        &self,
        raw: &str,
        new_password: String,
        user_agent: Option<String>,
    ) -> AppResult<(CurrentUser, NewSession)> {
        self.screen_password(&new_password).await?;
        let user = self.consume_link(raw, LinkPurpose::Reset).await?;
        let password_hash = password::hash(new_password).await?;
        let now = Utc::now();
        let mut active: users::ActiveModel = user.clone().into();
        active.password_hash = Set(password_hash);
        active.email_verified_at = Set(Some(user.email_verified_at.unwrap_or(now)));
        active.last_login_at = Set(Some(now));
        active.updated_at = Set(now);
        let user = active.update(&self.db).await?;
        Sessions::delete_many().filter(sessions::Column::UserId.eq(user.id)).exec(&self.db).await?;
        let session = self.create_session(user.id, user_agent).await?;
        Ok((user.into(), session))
    }

    /// Starts verification of the learner's current address; `None` when it
    /// is already verified.
    pub async fn start_verification(&self, user_id: Uuid) -> AppResult<Option<EmailLink>> {
        let user = Users::find_by_id(user_id).one(&self.db).await?.ok_or(AppError::NotFound("user"))?;
        if user.email_verified_at.is_some() {
            return Ok(None);
        }
        Ok(Some(self.issue_link(&user, LinkPurpose::Verify).await?))
    }

    pub async fn verify_email(&self, raw: &str) -> AppResult<CurrentUser> {
        let user = self.consume_link(raw, LinkPurpose::Verify).await?;
        let mut active: users::ActiveModel = user.clone().into();
        active.email_verified_at = Set(Some(user.email_verified_at.unwrap_or_else(Utc::now)));
        active.updated_at = Set(Utc::now());
        Ok(active.update(&self.db).await?.into())
    }
}
