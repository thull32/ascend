//! Record prompt-cache token usage per user per day.
//!
//! Cache reads are billed at a fraction of normal input and cache writes at a
//! premium, so cost reporting needs them separately. Added as a new
//! migration (never by editing m0003): migrations are append-only.
use sea_orm_migration::prelude::*;

use crate::m0003_ai::AiUsage;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(
            Table::alter()
                .table(AiUsage::Table)
                .add_column_if_not_exists(ColumnDef::new(Cache::CacheReadTokens).big_integer().not_null().default(0))
                .add_column_if_not_exists(ColumnDef::new(Cache::CacheWriteTokens).big_integer().not_null().default(0))
                .to_owned(),
        )
        .await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(
            Table::alter()
                .table(AiUsage::Table)
                .drop_column(Cache::CacheReadTokens)
                .drop_column(Cache::CacheWriteTokens)
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum Cache {
    CacheReadTokens,
    CacheWriteTokens,
}
