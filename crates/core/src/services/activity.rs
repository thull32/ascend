//! Learning activity log: one row per (user, local day). Every service that
//! records learning (lesson progress, quiz attempts, submissions) calls
//! [`record`]. Streaks are computed from this table.
//!
//! A day is the learner's own calendar day, in the IANA time zone stored on
//! their account (UTC when unset). Postgres does the conversion, so the day
//! is computed from the database clock and tz data in one place.
use sea_orm::*;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

/// The learner's local date, as SQL. `$1` is the user id.
const LOCAL_TODAY: &str = "(now() AT TIME ZONE COALESCE(u.timezone, 'UTC'))::date";

pub async fn record<C: ConnectionTrait>(db: &C, user_id: Uuid) -> AppResult<()> {
    db.execute_raw(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        format!(
            "INSERT INTO activity_days (user_id, day) SELECT u.id, {LOCAL_TODAY} FROM users u WHERE u.id = $1 \
             ON CONFLICT (user_id, day) DO NOTHING"
        ),
        [user_id.into()],
    ))
    .await?;
    Ok(())
}

/// Today's date where the learner is.
pub async fn today<C: ConnectionTrait>(db: &C, user_id: Uuid) -> AppResult<chrono::NaiveDate> {
    db.query_one_raw(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        format!("SELECT {LOCAL_TODAY} AS today FROM users u WHERE u.id = $1"),
        [user_id.into()],
    ))
    .await?
    .ok_or(AppError::NotFound("user"))?
    .try_get::<chrono::NaiveDate>("", "today")
    .map_err(Into::into)
}

/// Whether `name` is a time zone Postgres knows. Checked on write, so the
/// conversions above never meet a name they cannot resolve.
pub async fn is_known_timezone<C: ConnectionTrait>(db: &C, name: &str) -> AppResult<bool> {
    let row = db
        .query_one_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = $1) AS known",
            [name.into()],
        ))
        .await?;
    Ok(row.map(|r| r.try_get::<bool>("", "known")).transpose()?.unwrap_or(false))
}
