//! The admin audit log: one row per change an operator made through the
//! admin dashboard or the operator API (role changes, sign-outs, account
//! deletions, invites, comment removals).
//!
//! `actor_id` is null for the bearer-token operator API, and becomes null
//! when the admin's account is deleted; `actor_label` keeps who it was.
//! `target_id` has no foreign key on purpose: the record of deleting an
//! account must outlive the account. It holds no email address, so a
//! deleted learner is only a UUID here. Rows expire after a year
//! (`services::retention`).
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared(
                "CREATE TABLE IF NOT EXISTS admin_audit (
                    id uuid PRIMARY KEY,
                    actor_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
                    actor_label varchar(320) NOT NULL,
                    action varchar(40) NOT NULL,
                    target_id uuid NULL,
                    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now()
                );
                -- The log page (newest first) and retention (oldest first).
                CREATE INDEX IF NOT EXISTS admin_audit_created ON admin_audit (created_at DESC);
                -- A learner's page shows what was done to their account.
                CREATE INDEX IF NOT EXISTS admin_audit_target ON admin_audit (target_id, created_at DESC)
                    WHERE target_id IS NOT NULL;
                -- The users list sorts and filters on these.
                CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments (created_at DESC);",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared(
                "DROP INDEX IF EXISTS idx_comments_created_at; DROP INDEX IF EXISTS idx_users_created_at; \
                 DROP TABLE IF EXISTS admin_audit;",
            )
            .await?;
        Ok(())
    }
}
