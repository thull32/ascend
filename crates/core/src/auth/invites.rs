//! Invite codes, for invite-only sign-up (`SIGNUPS=invite`).
//!
//! A code is a 256-bit random token handed out as a link
//! (`/register?invite=<code>`); only its SHA-256 is stored. Each code allows
//! `max_uses` accounts and may expire. Codes are created and revoked from the
//! admin dashboard, the operator API or the command line (docs/RUNBOOK.md).
//! Each account records the invite it used (`invite_redemptions`, m0018).
use chrono::{DateTime, Duration, Utc};
use sea_orm::*;
use serde::Serialize;

use super::token;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
pub struct Invite {
    /// The first 8 hex characters of the code's hash: enough to name it when
    /// listing or revoking, useless for signing up.
    pub id: String,
    pub note: String,
    pub max_uses: i32,
    pub uses: i32,
    /// Accounts that signed up with it and still exist.
    pub accounts: i64,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Creates an invite and returns its raw code (shown once, never stored).
pub async fn create(
    db: &DatabaseConnection,
    max_uses: i32,
    valid_for: Option<Duration>,
    note: &str,
) -> AppResult<String> {
    if !(1..=10_000).contains(&max_uses) {
        return Err(AppError::Validation("uses must be between 1 and 10000".into()));
    }
    let code = token::generate();
    let expires_at = valid_for.map(|d| Utc::now() + d);
    db.execute_raw(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        "INSERT INTO invites (code_hash, note, max_uses, expires_at) VALUES ($1, $2, $3, $4)",
        [
            token::hash(&code).into(),
            note.chars().take(200).collect::<String>().into(),
            max_uses.into(),
            expires_at.into(),
        ],
    ))
    .await?;
    Ok(code)
}

/// The invite an account signed up with, as [`consume`] found it.
#[derive(Debug, Clone)]
pub struct Redeemed {
    /// The short id from [`list`].
    pub id: String,
    pub note: String,
}

/// Uses one sign-up from the code, inside the caller's transaction, or
/// refuses. Unknown, used-up and expired codes get the same answer.
pub async fn consume<C: ConnectionTrait>(conn: &C, code: Option<&str>) -> AppResult<Redeemed> {
    let refused = || AppError::Validation("an invite is required to sign up, and this one is not valid".into());
    let code = code.map(str::trim).filter(|c| token::looks_valid(c)).ok_or_else(refused)?;
    let row = conn
        .query_one_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "UPDATE invites SET uses = uses + 1, last_used_at = now() \
             WHERE code_hash = $1 AND uses < max_uses AND (expires_at IS NULL OR expires_at > now()) \
             RETURNING code_hash, note",
            [token::hash(code).into()],
        ))
        .await?
        .ok_or_else(refused)?;
    Ok(Redeemed {
        id: row.try_get::<String>("", "code_hash")?.chars().take(8).collect(),
        note: row.try_get("", "note")?,
    })
}

/// Records which invite created the account (see m0018), in the sign-up's
/// transaction.
pub async fn record_redemption<C: ConnectionTrait>(conn: &C, user_id: uuid::Uuid, invite: &Redeemed) -> AppResult<()> {
    conn.execute_raw(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        "INSERT INTO invite_redemptions (user_id, invite_id, note) VALUES ($1, $2, $3)",
        [user_id.into(), invite.id.clone().into(), invite.note.clone().into()],
    ))
    .await?;
    Ok(())
}

pub async fn list(db: &DatabaseConnection) -> AppResult<Vec<Invite>> {
    let rows = db
        .query_all_raw(Statement::from_string(
            DatabaseBackend::Postgres,
            "SELECT i.code_hash, i.note, i.max_uses, i.uses, i.expires_at, i.created_at, \
               (SELECT count(*) FROM invite_redemptions r WHERE r.invite_id = left(i.code_hash, 8))::bigint AS accounts \
             FROM invites i ORDER BY i.created_at",
        ))
        .await?;
    rows.iter()
        .map(|r| {
            Ok(Invite {
                id: r.try_get::<String>("", "code_hash")?.chars().take(8).collect(),
                note: r.try_get("", "note")?,
                max_uses: r.try_get("", "max_uses")?,
                uses: r.try_get("", "uses")?,
                accounts: r.try_get("", "accounts")?,
                expires_at: r.try_get("", "expires_at")?,
                created_at: r.try_get("", "created_at")?,
            })
        })
        .collect::<Result<_, DbErr>>()
        .map_err(Into::into)
}

/// Revokes the invite whose hash starts with `id` (from [`list`]). Accounts
/// it already created are unaffected. Returns how many invites matched.
pub async fn revoke(db: &DatabaseConnection, id: &str) -> AppResult<u64> {
    if id.len() < 8 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(AppError::Validation("give the 8-character id from the invite list".into()));
    }
    let n = db
        .execute_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM invites WHERE code_hash LIKE $1",
            [format!("{}%", id.to_ascii_lowercase()).into()],
        ))
        .await?
        .rows_affected();
    Ok(n)
}
