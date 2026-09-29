//! Account recovery and email verification.
//!
//! `users.email_verified_at` records when the learner proved they control
//! their address (following a verification or password-reset link).
//! `email_tokens` holds single-use links: the SHA-256 of a 256-bit random
//! token (the raw token only ever exists in the email), what it is for, the
//! address it was sent to (so changing the address invalidates old
//! verification links), and when it expires. Rows are deleted when used, when
//! a newer link supersedes them, and by the hourly sweep once expired.
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
                .add_column_if_not_exists(ColumnDef::new(Verify::EmailVerifiedAt).timestamp_with_time_zone().null())
                .to_owned(),
        )
        .await?;
        m.create_table(
            Table::create()
                .table(EmailTokens::Table)
                .if_not_exists()
                .col(ColumnDef::new(EmailTokens::TokenHash).string_len(64).not_null().primary_key())
                .col(ColumnDef::new(EmailTokens::UserId).uuid().not_null())
                // 'reset' or 'verify'
                .col(ColumnDef::new(EmailTokens::Purpose).string_len(16).not_null())
                .col(ColumnDef::new(EmailTokens::Email).string_len(320).not_null())
                .col(ColumnDef::new(EmailTokens::ExpiresAt).timestamp_with_time_zone().not_null())
                .col(
                    ColumnDef::new(EmailTokens::CreatedAt)
                        .timestamp_with_time_zone()
                        .not_null()
                        .default(Expr::current_timestamp()),
                )
                .foreign_key(
                    ForeignKey::create()
                        .from(EmailTokens::Table, EmailTokens::UserId)
                        .to(Users::Table, Users::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;
        // "Supersede this user's other links of the same purpose."
        m.create_index(
            Index::create()
                .if_not_exists()
                .name("idx_email_tokens_user_purpose")
                .table(EmailTokens::Table)
                .col(EmailTokens::UserId)
                .col(EmailTokens::Purpose)
                .to_owned(),
        )
        .await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.drop_table(Table::drop().table(EmailTokens::Table).to_owned()).await?;
        m.alter_table(Table::alter().table(Users::Table).drop_column(Verify::EmailVerifiedAt).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Verify {
    EmailVerifiedAt,
}

#[derive(DeriveIden)]
pub enum EmailTokens {
    Table,
    TokenHash,
    UserId,
    Purpose,
    Email,
    ExpiresAt,
    CreatedAt,
}
