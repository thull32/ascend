//! Private podcast feeds for the audio editions.
//!
//! Each learner may have one feed URL, `/api/audio/feed/<token>.xml`, which a
//! podcast app polls without a session. The token is 256 random bits shown
//! once; only its SHA-256 is stored. Creating a new feed URL replaces the old
//! one, which is how a leaked URL is revoked.
use sea_orm_migration::prelude::*;

use crate::m0001_identity::Users;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(AudioFeeds::Table)
                .if_not_exists()
                .col(ColumnDef::new(AudioFeeds::TokenHash).string_len(64).not_null().primary_key())
                .col(ColumnDef::new(AudioFeeds::UserId).uuid().not_null().unique_key())
                .col(
                    ColumnDef::new(AudioFeeds::CreatedAt)
                        .timestamp_with_time_zone()
                        .not_null()
                        .default(Expr::current_timestamp()),
                )
                .foreign_key(
                    ForeignKey::create()
                        .from(AudioFeeds::Table, AudioFeeds::UserId)
                        .to(Users::Table, Users::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.drop_table(Table::drop().table(AudioFeeds::Table).if_exists().to_owned()).await
    }
}

#[derive(DeriveIden)]
enum AudioFeeds {
    Table,
    TokenHash,
    UserId,
    CreatedAt,
}
