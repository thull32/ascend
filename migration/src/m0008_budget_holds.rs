//! Budget holds: reserve a call's maximum spend before it runs.
//!
//! The daily AI budget was checked before each call and charged after it, so
//! a learner one token under the limit could still start a call worth
//! thousands of tokens. Like a card authorisation hold, a call now reserves
//! its `max_tokens` of output (capped at what is left) and an estimate of its
//! billed input; settling replaces the hold with actual usage. Holds live on
//! the day's row, so one left by a crashed process expires with the day.
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
                .add_column_if_not_exists(ColumnDef::new(Hold::ReservedInputTokens).big_integer().not_null().default(0))
                .add_column_if_not_exists(
                    ColumnDef::new(Hold::ReservedOutputTokens).big_integer().not_null().default(0),
                )
                .to_owned(),
        )
        .await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(
            Table::alter()
                .table(AiUsage::Table)
                .drop_column(Hold::ReservedInputTokens)
                .drop_column(Hold::ReservedOutputTokens)
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum Hold {
    ReservedInputTokens,
    ReservedOutputTokens,
}
