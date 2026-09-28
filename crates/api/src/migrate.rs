//! Boot-time migrations that stay safe across rolling deploys and rollbacks.
//!
//! Two things go wrong with a bare `Migrator::up` at boot:
//!
//! * **Two replicas booting together race.** Both see migration N pending and
//!   both run it; the second fails on "relation already exists" (or, worse,
//!   half-applies a non-transactional step). A Postgres advisory lock, held
//!   for the whole run, makes the second replica wait and then find nothing
//!   to do.
//! * **A rollback cannot boot.** `sea-orm-migration` refuses to start when
//!   the database records a migration the binary has no file for, so
//!   redeploying the previous image after a release that migrated fails at
//!   boot, and so does a restart of any replica still running the old
//!   image. Because every migration here follows expand/contract (additive
//!   first, destructive only after no running code needs the old shape),
//!   an older binary can run against a newer schema; it must simply not
//!   try to migrate. So when the database is *ahead* and this binary has
//!   nothing of its own pending, boot continues without migrating.
//!
//! A database that is ahead *and* missing one of this binary's migrations
//! has diverged (two branches deployed against one database). That is the
//! one case that refuses to boot.
use std::collections::HashSet;

use migration::Migrator;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement, TransactionTrait};
use sea_orm_migration::MigratorTrait;

/// Every replica takes the same advisory lock; the value is arbitrary but
/// must never change ("ascend" in ASCII, then 1).
const MIGRATION_LOCK_KEY: i64 = 0x6173_6365_6e64_0001;

/// What to do, given the migrations this binary knows (in order) and the
/// versions the database has applied.
#[derive(Debug, PartialEq, Eq)]
pub enum Plan {
    UpToDate,
    Apply(Vec<String>),
    /// The database has migrations this binary does not know, and nothing of
    /// this binary's is pending: an older build running on a newer schema.
    SchemaAhead(Vec<String>),
    Diverged {
        unknown: Vec<String>,
        pending: Vec<String>,
    },
}

pub fn plan(known: &[String], applied: &HashSet<String>) -> Plan {
    let known_set: HashSet<&str> = known.iter().map(String::as_str).collect();
    let mut unknown: Vec<String> = applied.iter().filter(|v| !known_set.contains(v.as_str())).cloned().collect();
    unknown.sort();
    let pending: Vec<String> = known.iter().filter(|k| !applied.contains(*k)).cloned().collect();
    match (unknown.is_empty(), pending.is_empty()) {
        (true, true) => Plan::UpToDate,
        (true, false) => Plan::Apply(pending),
        (false, true) => Plan::SchemaAhead(unknown),
        (false, false) => Plan::Diverged { unknown, pending },
    }
}

/// Runs pending migrations under the advisory lock and returns the plan it
/// acted on. `Diverged` is an error.
pub async fn run(db: &DatabaseConnection) -> anyhow::Result<Plan> {
    // A transaction-scoped lock on one pooled connection, held while the
    // migrations run on others; committing releases it. A replica that
    // crashes mid-run drops its connection, which releases the lock too.
    let lock = db.begin().await?;
    lock.execute_raw(Statement::from_string(
        DbBackend::Postgres,
        format!("SELECT pg_advisory_xact_lock({MIGRATION_LOCK_KEY})"),
    ))
    .await?;

    let known: Vec<String> = Migrator::migrations().iter().map(|m| m.name().to_string()).collect();
    let decided = plan(&known, &applied_versions(db).await?);
    let result = match &decided {
        Plan::UpToDate | Plan::SchemaAhead(_) => Ok(()),
        Plan::Apply(_) => Migrator::up(db, None).await.map_err(anyhow::Error::from),
        Plan::Diverged { unknown, pending } => Err(anyhow::anyhow!(
            "database and build have diverged: the database has migrations this build does not know \
             ({unknown:?}) and lacks migrations this build has ({pending:?}); refusing to guess"
        )),
    };
    lock.commit().await?;
    result.map(|()| decided)
}

async fn applied_versions(db: &DatabaseConnection) -> anyhow::Result<HashSet<String>> {
    let present = db
        .query_one_raw(Statement::from_string(
            DbBackend::Postgres,
            "SELECT to_regclass('seaql_migrations') IS NOT NULL AS present",
        ))
        .await?
        .map(|row| row.try_get::<bool>("", "present"))
        .transpose()?
        .unwrap_or(false);
    if !present {
        return Ok(HashSet::new());
    }
    let rows =
        db.query_all_raw(Statement::from_string(DbBackend::Postgres, "SELECT version FROM seaql_migrations")).await?;
    rows.iter().map(|row| row.try_get::<String>("", "version").map_err(anyhow::Error::from)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }
    fn set(v: &[&str]) -> HashSet<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn fresh_database_applies_everything() {
        assert_eq!(plan(&names(&["m1", "m2"]), &set(&[])), Plan::Apply(names(&["m1", "m2"])));
    }

    #[test]
    fn current_database_does_nothing() {
        assert_eq!(plan(&names(&["m1", "m2"]), &set(&["m1", "m2"])), Plan::UpToDate);
    }

    #[test]
    fn a_rollback_boots_against_the_newer_schema() {
        assert_eq!(plan(&names(&["m1", "m2"]), &set(&["m1", "m2", "m3"])), Plan::SchemaAhead(names(&["m3"])));
    }

    #[test]
    fn diverged_histories_refuse_to_boot() {
        assert_eq!(
            plan(&names(&["m1", "m2", "m4"]), &set(&["m1", "m2", "m3"])),
            Plan::Diverged { unknown: names(&["m3"]), pending: names(&["m4"]) }
        );
    }
}
