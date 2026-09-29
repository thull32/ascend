//! Indexes for the retention job (`crates/core/src/services/retention.rs`),
//! which deletes rows by age: each finds its old rows through an index on
//! the timestamp instead of scanning the table. Submissions already have
//! (user_id, target_slug, created_at), which the job uses to check whether
//! a newer attempt exists.
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(DeriveIden)]
enum Submissions {
    Table,
    CreatedAt,
}
#[derive(DeriveIden)]
enum Conversations {
    Table,
    UpdatedAt,
}
#[derive(DeriveIden)]
enum Interviews {
    Table,
    StartedAt,
}
#[derive(DeriveIden)]
enum AiUsage {
    Table,
    Day,
}
#[derive(DeriveIden)]
enum ActivityDays {
    Table,
    Day,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        for (name, table, col) in [
            ("idx_submissions_created", Submissions::Table.into_iden(), Submissions::CreatedAt.into_iden()),
            ("idx_conversations_updated", Conversations::Table.into_iden(), Conversations::UpdatedAt.into_iden()),
            ("idx_interviews_started", Interviews::Table.into_iden(), Interviews::StartedAt.into_iden()),
            ("idx_ai_usage_day", AiUsage::Table.into_iden(), AiUsage::Day.into_iden()),
            ("idx_activity_days_day", ActivityDays::Table.into_iden(), ActivityDays::Day.into_iden()),
        ] {
            m.create_index(Index::create().if_not_exists().name(name).table(table).col(col).to_owned()).await?;
        }
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        for name in [
            "idx_submissions_created",
            "idx_conversations_updated",
            "idx_interviews_started",
            "idx_ai_usage_day",
            "idx_activity_days_day",
        ] {
            m.drop_index(Index::drop().if_exists().name(name).to_owned()).await?;
        }
        Ok(())
    }
}
