//! Rate-limit state shared by every replica.
//!
//! The security-relevant limits (sign-up and login per IP, password attempts
//! per account or device, model calls per session) lived in each process's
//! memory, so running two replicas doubled every allowance. They now live
//! here as one GCRA "theoretical arrival time" per key, updated with a single
//! conditional upsert. The table is UNLOGGED: losing it in a crash only
//! forgives some recent requests, and skipping the WAL keeps each check
//! cheap. Rows whose time has passed carry no information and are swept.
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared(
                "CREATE UNLOGGED TABLE IF NOT EXISTS rate_limits (
                     key text PRIMARY KEY,
                     tat timestamptz NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS idx_rate_limits_tat ON rate_limits (tat);",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection().execute_unprepared("DROP TABLE IF EXISTS rate_limits").await?;
        Ok(())
    }
}
