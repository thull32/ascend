//! Database schema migrations.
//!
//! Conventions (worth copying in your own projects):
//! * One migration per bounded context, applied in order. Migrations are
//!   append-only: never edit a migration that has shipped; add a new one.
//! * Every table has `created_at`/`updated_at` with DB-side defaults so the
//!   application can never forget to set them.
//! * Foreign keys always declare an `ON DELETE` policy. Ownership rows cascade;
//!   audit rows (usage, submissions) also cascade because deleting a user must
//!   remove all of their data (GDPR-style "right to erasure").
//! * Indexes are declared next to the columns they serve, with a comment on
//!   the query pattern that needs them.
pub use sea_orm_migration::prelude::*;

mod m0001_identity;
mod m0002_learning;
mod m0003_ai;
mod m0004_community;
mod m0005_interviews;
mod m0006_ai_usage_cache_tokens;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m0001_identity::Migration),
            Box::new(m0002_learning::Migration),
            Box::new(m0003_ai::Migration),
            Box::new(m0004_community::Migration),
            Box::new(m0005_interviews::Migration),
            Box::new(m0006_ai_usage_cache_tokens::Migration),
        ]
    }
}

/// Shared column helpers so every table gets identical timestamp semantics.
pub(crate) fn timestamps(table: &mut TableCreateStatement) -> &mut TableCreateStatement {
    table
        .col(ColumnDef::new(Common::CreatedAt).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
        .col(ColumnDef::new(Common::UpdatedAt).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
}

#[derive(DeriveIden)]
pub(crate) enum Common {
    CreatedAt,
    UpdatedAt,
}
