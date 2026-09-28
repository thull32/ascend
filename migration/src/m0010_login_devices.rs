//! Known login devices.
//!
//! Password attempts are limited per account, which stops a distributed
//! attacker guessing one learner's password but lets anyone who knows the
//! email spend that allowance and lock the owner out. After a successful
//! login (or sign-up) the browser gets a long-lived device cookie; its hash
//! is stored here. Attempts that present a device known for that account are
//! limited per device instead, so an attacker can exhaust only the allowance
//! for unknown devices, never the owner's. (OWASP describes this as "device
//! cookies".) The cookie grants no access by itself.
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared(
                "CREATE TABLE IF NOT EXISTS login_devices (
                     token_hash   text PRIMARY KEY,
                     user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                     created_at   timestamptz NOT NULL DEFAULT now(),
                     last_used_at timestamptz NOT NULL DEFAULT now()
                 );
                 CREATE INDEX IF NOT EXISTS idx_login_devices_user ON login_devices (user_id, last_used_at DESC);",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection().execute_unprepared("DROP TABLE IF EXISTS login_devices").await?;
        Ok(())
    }
}
