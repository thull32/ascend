//! AI coach: conversations, messages, and per-user daily token budgets.
//!
//! The budget table is the cost-control seam. Every model call records tokens
//! against (user, day); the coach refuses to call the model once the user is
//! over budget. This keeps a free product from being drained by one account.
use sea_orm_migration::prelude::*;

use crate::m0001_identity::Users;
use crate::timestamps;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            timestamps(
                Table::create()
                    .table(Conversations::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Conversations::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Conversations::UserId).uuid().not_null())
                    .col(ColumnDef::new(Conversations::Title).string_len(120).not_null())
                    // Where the conversation was started: {"kind":"lesson","slug":"..."} etc.
                    .col(ColumnDef::new(Conversations::Context).json_binary().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Conversations::Table, Conversations::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    ),
            )
            .to_owned(),
        )
        .await?;
        m.create_index(
            Index::create()
                .name("idx_conversations_user_updated")
                .table(Conversations::Table)
                .col(Conversations::UserId)
                .col(crate::Common::UpdatedAt)
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Messages::Table)
                .if_not_exists()
                .col(ColumnDef::new(Messages::Id).uuid().not_null().primary_key())
                .col(ColumnDef::new(Messages::ConversationId).uuid().not_null())
                .col(ColumnDef::new(Messages::Role).string_len(16).not_null())
                .col(ColumnDef::new(Messages::Content).text().not_null())
                .col(ColumnDef::new(Messages::InputTokens).integer().not_null().default(0))
                .col(ColumnDef::new(Messages::OutputTokens).integer().not_null().default(0))
                .col(ColumnDef::new(Messages::CreatedAt).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                .foreign_key(
                    ForeignKey::create()
                        .from(Messages::Table, Messages::ConversationId)
                        .to(Conversations::Table, Conversations::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;
        m.create_index(
            Index::create()
                .name("idx_messages_conversation_created")
                .table(Messages::Table)
                .col(Messages::ConversationId)
                .col(Messages::CreatedAt)
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(AiUsage::Table)
                .if_not_exists()
                .col(ColumnDef::new(AiUsage::UserId).uuid().not_null())
                .col(ColumnDef::new(AiUsage::Day).date().not_null())
                .col(ColumnDef::new(AiUsage::InputTokens).big_integer().not_null().default(0))
                .col(ColumnDef::new(AiUsage::OutputTokens).big_integer().not_null().default(0))
                .col(ColumnDef::new(AiUsage::Requests).integer().not_null().default(0))
                .primary_key(Index::create().col(AiUsage::UserId).col(AiUsage::Day))
                .foreign_key(
                    ForeignKey::create()
                        .from(AiUsage::Table, AiUsage::UserId)
                        .to(Users::Table, Users::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.drop_table(Table::drop().table(AiUsage::Table).to_owned()).await?;
        m.drop_table(Table::drop().table(Messages::Table).to_owned()).await?;
        m.drop_table(Table::drop().table(Conversations::Table).to_owned()).await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
pub enum Conversations {
    Table,
    Id,
    UserId,
    Title,
    Context,
}

#[derive(DeriveIden)]
pub enum Messages {
    Table,
    Id,
    ConversationId,
    Role,
    Content,
    InputTokens,
    OutputTokens,
    CreatedAt,
}

#[derive(DeriveIden)]
pub enum AiUsage {
    Table,
    UserId,
    Day,
    InputTokens,
    OutputTokens,
    Requests,
}
