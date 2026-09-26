//! Identity: users and server-side sessions.
//!
//! Why server-side sessions instead of JWTs? Sessions can be revoked instantly
//! (logout-everywhere, compromised device), rotate cheaply, and the cookie only
//! ever carries an opaque random token. We store the SHA-256 of the token, so
//! a leaked database dump cannot be replayed as a login.
use sea_orm_migration::prelude::*;

use crate::timestamps;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            timestamps(
                Table::create()
                    .table(Users::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Users::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Users::Email).string_len(320).not_null().unique_key())
                    .col(ColumnDef::new(Users::PasswordHash).string_len(255).not_null())
                    .col(ColumnDef::new(Users::DisplayName).string_len(80).not_null())
                    .col(ColumnDef::new(Users::Role).string_len(16).not_null().default("user"))
                    .col(ColumnDef::new(Users::TargetCompany).string_len(80).null())
                    .col(ColumnDef::new(Users::TargetLevel).string_len(40).null())
                    .col(ColumnDef::new(Users::WeeklyHours).small_integer().not_null().default(8))
                    .col(ColumnDef::new(Users::PreferredLanguage).string_len(16).not_null().default("python"))
                    .col(ColumnDef::new(Users::OnboardedAt).timestamp_with_time_zone().null())
                    .col(ColumnDef::new(Users::LastLoginAt).timestamp_with_time_zone().null()),
            )
            .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Sessions::Table)
                .if_not_exists()
                // Primary key is the SHA-256 hex digest of the opaque cookie token.
                .col(ColumnDef::new(Sessions::TokenHash).string_len(64).not_null().primary_key())
                .col(ColumnDef::new(Sessions::UserId).uuid().not_null())
                .col(ColumnDef::new(Sessions::ExpiresAt).timestamp_with_time_zone().not_null())
                .col(ColumnDef::new(Sessions::UserAgent).string_len(255).null())
                .col(ColumnDef::new(Sessions::CreatedAt).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                .col(ColumnDef::new(Sessions::LastSeenAt).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                .foreign_key(
                    ForeignKey::create()
                        .from(Sessions::Table, Sessions::UserId)
                        .to(Users::Table, Users::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;

        // Query pattern: "delete all sessions for user X" (logout everywhere) and
        // the periodic sweep of expired sessions.
        m.create_index(
            Index::create()
                .name("idx_sessions_user_id")
                .table(Sessions::Table)
                .col(Sessions::UserId)
                .to_owned(),
        )
        .await?;
        m.create_index(
            Index::create()
                .name("idx_sessions_expires_at")
                .table(Sessions::Table)
                .col(Sessions::ExpiresAt)
                .to_owned(),
        )
        .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.drop_table(Table::drop().table(Sessions::Table).to_owned()).await?;
        m.drop_table(Table::drop().table(Users::Table).to_owned()).await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
pub enum Users {
    Table,
    Id,
    Email,
    PasswordHash,
    DisplayName,
    Role,
    TargetCompany,
    TargetLevel,
    WeeklyHours,
    PreferredLanguage,
    OnboardedAt,
    LastLoginAt,
}

#[derive(DeriveIden)]
pub enum Sessions {
    Table,
    TokenHash,
    UserId,
    ExpiresAt,
    UserAgent,
    CreatedAt,
    LastSeenAt,
}
