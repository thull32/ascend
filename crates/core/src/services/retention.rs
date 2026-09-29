//! Retention: deletes what the privacy page (`web/src/pages/Privacy.tsx`)
//! says is kept only for a while. Change one, change the other.
//!
//! | Data | Kept for |
//! |---|---|
//! | Code submissions | 180 days, except each learner's latest attempt and latest passing attempt per exercise or problem |
//! | Coach conversations | 365 days after their last message |
//! | Mock interviews | 365 days after they started |
//! | AI usage counters | 90 days |
//! | Activity days | 400 days (streaks look back that far) |
//! | Recognised browsers | 365 days after last use |
//!
//! Sessions, email links and rate-limit keys have their own sweeps.
//!
//! Deletes run in batches of [`BATCH`], each committed in its own
//! transaction, so no transaction holds row locks for long or builds a huge
//! WAL burst, and one round does at most [`MAX_BATCHES`] per kind: a backlog
//! drains over several rounds instead of one long one. Every batch takes a
//! transaction-scoped advisory lock first, so with several replicas only one
//! deletes at a time; a replica that finds the lock taken stops its round.
use sea_orm::*;
use serde::Serialize;

use crate::error::AppResult;

pub const BATCH: i64 = 5_000;
pub const MAX_BATCHES: usize = 20;
/// Arbitrary but fixed: identifies the retention round among advisory locks.
const LOCK_KEY: i64 = 0x5245_5445_4e54; // "RETENT"

#[derive(Debug, Clone, Copy)]
pub struct Policy {
    pub submissions_days: i32,
    pub conversations_days: i32,
    pub interviews_days: i32,
    pub ai_usage_days: i32,
    pub activity_days: i32,
    pub devices_days: i32,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            submissions_days: 180,
            conversations_days: 365,
            interviews_days: 365,
            ai_usage_days: 90,
            activity_days: 400,
            devices_days: 365,
        }
    }
}

#[derive(Debug, Default, Clone, Serialize, PartialEq, Eq)]
pub struct Report {
    /// False when another replica held the lock and this one skipped.
    pub ran: bool,
    pub submissions: u64,
    pub conversations: u64,
    pub interviews: u64,
    pub ai_usage: u64,
    pub activity_days: u64,
    pub devices: u64,
}

/// One kind of row to expire: a DELETE that removes at most `$2` rows older
/// than `$1` days and reports how many it removed.
struct Rule {
    name: &'static str,
    sql: &'static str,
}

const SUBMISSIONS: Rule = Rule {
    name: "submissions",
    // An old attempt goes when a newer attempt at the same target exists,
    // and, if it passed, a newer passing attempt too: the latest attempt
    // and the latest pass (which "solved" is computed from) always stay.
    sql: "DELETE FROM submissions WHERE id IN ( \
            SELECT s.id FROM submissions s \
            WHERE s.created_at < now() - make_interval(days => $1) \
              AND EXISTS (SELECT 1 FROM submissions n \
                          WHERE n.user_id = s.user_id AND n.target_slug = s.target_slug AND n.created_at > s.created_at) \
              AND (NOT s.passed OR EXISTS (SELECT 1 FROM submissions p \
                          WHERE p.user_id = s.user_id AND p.target_slug = s.target_slug AND p.passed \
                            AND p.created_at > s.created_at)) \
            LIMIT $2)",
};
const CONVERSATIONS: Rule = Rule {
    name: "conversations",
    // Messages go with their conversation (ON DELETE CASCADE).
    sql: "DELETE FROM conversations WHERE id IN ( \
            SELECT id FROM conversations WHERE updated_at < now() - make_interval(days => $1) LIMIT $2)",
};
const INTERVIEWS: Rule = Rule {
    name: "interviews",
    sql: "DELETE FROM interviews WHERE id IN ( \
            SELECT id FROM interviews WHERE started_at < now() - make_interval(days => $1) LIMIT $2)",
};
const AI_USAGE: Rule = Rule {
    name: "ai_usage",
    sql: "DELETE FROM ai_usage WHERE (user_id, day) IN ( \
            SELECT user_id, day FROM ai_usage WHERE day < current_date - $1::int LIMIT $2)",
};
const ACTIVITY: Rule = Rule {
    name: "activity_days",
    sql: "DELETE FROM activity_days WHERE (user_id, day) IN ( \
            SELECT user_id, day FROM activity_days WHERE day < current_date - $1::int LIMIT $2)",
};
const DEVICES: Rule = Rule {
    name: "login_devices",
    sql: "DELETE FROM login_devices WHERE token_hash IN ( \
            SELECT token_hash FROM login_devices WHERE last_used_at < now() - make_interval(days => $1) LIMIT $2)",
};

/// Whether the batch ran or another replica holds the retention lock.
enum Batch {
    Deleted(u64),
    Busy,
}

/// One batch in its own transaction, under the advisory lock.
async fn batch(db: &DatabaseConnection, rule: &Rule, days: i32) -> AppResult<Batch> {
    let txn = db.begin().await?;
    let locked: bool = txn
        .query_one_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT pg_try_advisory_xact_lock($1) AS locked",
            [LOCK_KEY.into()],
        ))
        .await?
        .map(|r| r.try_get::<bool>("", "locked"))
        .transpose()?
        .unwrap_or(false);
    if !locked {
        txn.rollback().await?;
        return Ok(Batch::Busy);
    }
    let n = txn
        .execute_raw(Statement::from_sql_and_values(DatabaseBackend::Postgres, rule.sql, [days.into(), BATCH.into()]))
        .await?
        .rows_affected();
    txn.commit().await?;
    Ok(Batch::Deleted(n))
}

/// Expires one kind of row. `None` when another replica holds the lock.
async fn expire(db: &DatabaseConnection, rule: &Rule, days: i32) -> AppResult<Option<u64>> {
    let mut total = 0;
    let mut busy = false;
    for _ in 0..MAX_BATCHES {
        match batch(db, rule, days).await? {
            Batch::Busy => {
                busy = true;
                break;
            }
            Batch::Deleted(n) => {
                total += n;
                if n < BATCH as u64 {
                    break;
                }
            }
        }
    }
    if total > 0 {
        tracing::info!(kind = rule.name, deleted = total, "retention");
        crate::metrics::get().retention_deleted.add(total, &[crate::metrics::kv("kind", rule.name)]);
    }
    Ok(if busy && total == 0 { None } else { Some(total) })
}

/// Runs one retention round. Stops early, with `ran: false` if nothing was
/// deleted, when another replica is running one.
pub async fn run(db: &DatabaseConnection, policy: Policy) -> AppResult<Report> {
    let mut report = Report { ran: true, ..Report::default() };
    let rules: [(&Rule, i32, &mut u64); 6] = [
        (&SUBMISSIONS, policy.submissions_days, &mut report.submissions),
        (&CONVERSATIONS, policy.conversations_days, &mut report.conversations),
        (&INTERVIEWS, policy.interviews_days, &mut report.interviews),
        (&AI_USAGE, policy.ai_usage_days, &mut report.ai_usage),
        (&ACTIVITY, policy.activity_days, &mut report.activity_days),
        (&DEVICES, policy.devices_days, &mut report.devices),
    ];
    let mut any = false;
    for (rule, days, out) in rules {
        match expire(db, rule, days).await? {
            Some(n) => {
                *out = n;
                any = true;
            }
            None => break,
        }
    }
    report.ran = any;
    Ok(report)
}
