//! Rate limits shared by every replica, stored in Postgres.
//!
//! GCRA (the generic cell rate algorithm, the same one `governor` runs in
//! memory) keeps one number per key: the theoretical arrival time (TAT) of
//! the next request if the client sent at exactly the allowed rate. A
//! request is allowed when `TAT - now <= tolerance`, and then the TAT moves
//! to `max(TAT, now) + interval`. With `interval = period / limit` and
//! `tolerance = (burst - 1) * interval`, a client can send `burst` requests
//! at once and then one per interval. Both the check and the update are one
//! conditional upsert, so concurrent requests on any replica cannot both
//! take the last slot.
use std::time::Duration;

use sea_orm::{ConnectionTrait, DatabaseBackend, DatabaseConnection, Statement};

use crate::error::AppResult;

/// `limit` requests per `period`, all of which may arrive at once.
#[derive(Debug, Clone, Copy)]
pub struct Quota {
    pub limit: u32,
    pub period: Duration,
}

impl Quota {
    pub const fn per_minute(limit: u32) -> Self {
        Self { limit, period: Duration::from_secs(60) }
    }

    /// Time between requests at the sustained rate.
    pub fn interval(&self) -> Duration {
        self.period / self.limit.max(1)
    }

    /// How far ahead of now the TAT may run before requests are refused.
    pub fn tolerance(&self) -> Duration {
        self.interval() * self.limit.saturating_sub(1)
    }
}

/// Pure GCRA step, used by tests and as the specification of the SQL below:
/// returns the new TAT if allowed, or how long to wait if not.
pub fn gcra(tat: Option<f64>, now: f64, quota: Quota) -> Result<f64, f64> {
    let interval = quota.interval().as_secs_f64();
    let tolerance = quota.tolerance().as_secs_f64();
    let base = tat.map_or(now, |t| t.max(now));
    if base - now <= tolerance { Ok(base + interval) } else { Err(base - tolerance - now) }
}

#[derive(Clone)]
pub struct SharedLimiter {
    db: DatabaseConnection,
}

impl SharedLimiter {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    /// Charges one request to `key`. `Ok(Ok(()))` means allowed;
    /// `Ok(Err(wait))` means refused, with how long until a retry can pass.
    pub async fn check(&self, key: &str, quota: Quota) -> AppResult<Result<(), Duration>> {
        let interval = quota.interval().as_secs_f64();
        let tolerance = quota.tolerance().as_secs_f64();
        let allowed = self
            .db
            .query_one_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                INSERT INTO rate_limits (key, tat) VALUES ($1, now() + make_interval(secs => $2))
                ON CONFLICT (key) DO UPDATE
                   SET tat = GREATEST(rate_limits.tat, now()) + make_interval(secs => $2)
                 WHERE GREATEST(rate_limits.tat, now()) - now() <= make_interval(secs => $3)
                RETURNING tat
                "#,
                [key.into(), interval.into(), tolerance.into()],
            ))
            .await?;
        if allowed.is_some() {
            return Ok(Ok(()));
        }
        // Refused: the earliest time a request passes is TAT - tolerance.
        let wait = self
            .db
            .query_one_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "SELECT GREATEST(EXTRACT(EPOCH FROM (tat - now())) - $2, 0)::float8 AS wait FROM rate_limits WHERE key = $1",
                [key.into(), tolerance.into()],
            ))
            .await?
            .map(|row| row.try_get::<f64>("", "wait"))
            .transpose()?
            .unwrap_or(interval);
        Ok(Err(Duration::from_secs_f64(wait.max(0.0))))
    }

    /// Deletes keys whose TAT has passed: they are indistinguishable from a
    /// key never seen. Called periodically.
    pub async fn sweep(&self) -> AppResult<u64> {
        let res = self
            .db
            .execute_raw(Statement::from_string(DatabaseBackend::Postgres, "DELETE FROM rate_limits WHERE tat < now()"))
            .await?;
        Ok(res.rows_affected())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_burst_of_limit_passes_then_one_per_interval() {
        let quota = Quota::per_minute(10); // interval 6 s, tolerance 54 s
        let mut tat = None;
        for i in 0..10 {
            tat = Some(gcra(tat, 0.0, quota).unwrap_or_else(|_| panic!("request {i} of the burst refused")));
        }
        // The 11th at the same instant waits one interval.
        let wait = gcra(tat, 0.0, quota).unwrap_err();
        assert!((wait - 6.0).abs() < 1e-9, "wait {wait}");
        // Six seconds later exactly one more passes.
        let tat = Some(gcra(tat, 6.0, quota).unwrap());
        assert!(gcra(tat, 6.0, quota).is_err());
        // After a full minute of silence the whole burst is back.
        let mut tat = tat;
        for _ in 0..10 {
            tat = Some(gcra(tat, 120.0, quota).unwrap());
        }
        assert!(gcra(tat, 120.0, quota).is_err());
    }
}
