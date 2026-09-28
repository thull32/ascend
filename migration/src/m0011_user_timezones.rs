//! Each learner's time zone, so a "day" of learning is their day.
//!
//! Streaks were counted in UTC days. For a learner in Sydney (UTC+10), a
//! lesson at 9am and another at 11am the next morning land on UTC days 23:00
//! and 01:00 apart, and one at 8am after a 10am lesson the day before lands
//! on the same UTC day: streaks broke and doubled for reasons the learner
//! could not see. The column holds an IANA name (`Europe/London`), set from
//! the browser and validated against `pg_timezone_names`. NULL means UTC.
use sea_orm_migration::prelude::*;

use crate::m0001_identity::Users;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(
            Table::alter()
                .table(Users::Table)
                .add_column_if_not_exists(ColumnDef::new(Tz::Timezone).string_len(64).null())
                .to_owned(),
        )
        .await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(Table::alter().table(Users::Table).drop_column(Tz::Timezone).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Tz {
    Timezone,
}
