//! Invite-only sign-up.
//!
//! `invites` holds the SHA-256 of each invite code (the raw code only exists
//! in the link handed out), how many accounts it may create, how many it has,
//! and when it stops working. Registration consumes a use in the same
//! transaction that inserts the user, so a code can never create more
//! accounts than `max_uses`, even under concurrent sign-ups.
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Invites::Table)
                .if_not_exists()
                .col(ColumnDef::new(Invites::CodeHash).string_len(64).not_null().primary_key())
                // Who it is for, to tell invites apart when listing them.
                .col(ColumnDef::new(Invites::Note).string_len(200).not_null().default(""))
                .col(ColumnDef::new(Invites::MaxUses).integer().not_null().default(1))
                .col(ColumnDef::new(Invites::Uses).integer().not_null().default(0))
                .col(ColumnDef::new(Invites::ExpiresAt).timestamp_with_time_zone().null())
                .col(ColumnDef::new(Invites::LastUsedAt).timestamp_with_time_zone().null())
                .col(
                    ColumnDef::new(Invites::CreatedAt)
                        .timestamp_with_time_zone()
                        .not_null()
                        .default(Expr::current_timestamp()),
                )
                .check(Expr::col(Invites::Uses).gte(0).and(Expr::col(Invites::Uses).lte(Expr::col(Invites::MaxUses))))
                .to_owned(),
        )
        .await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.drop_table(Table::drop().table(Invites::Table).if_exists().to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Invites {
    Table,
    CodeHash,
    Note,
    MaxUses,
    Uses,
    ExpiresAt,
    LastUsedAt,
    CreatedAt,
}
