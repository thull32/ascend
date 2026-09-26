//! Mock interviews. A session is a timed, single-problem conversation with an
//! AI interviewer. `assistant_mode` records whether the candidate was allowed an
//! AI pair-programmer ("assisted") or not ("solo"), because the two are scored
//! against different rubrics.
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
                    .table(Interviews::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Interviews::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Interviews::UserId).uuid().not_null())
                    // "coding" | "system_design" | "behavioral"
                    .col(ColumnDef::new(Interviews::Kind).string_len(24).not_null())
                    // "solo" | "assisted"
                    .col(ColumnDef::new(Interviews::AssistantMode).string_len(16).not_null())
                    .col(ColumnDef::new(Interviews::ProblemSlug).string_len(200).null())
                    .col(ColumnDef::new(Interviews::Prompt).text().not_null())
                    .col(ColumnDef::new(Interviews::DurationMinutes).small_integer().not_null())
                    // "active" | "completed" | "abandoned"
                    .col(ColumnDef::new(Interviews::Status).string_len(16).not_null().default("active"))
                    .col(ColumnDef::new(Interviews::Transcript).json_binary().not_null())
                    .col(ColumnDef::new(Interviews::FinalCode).text().null())
                    .col(ColumnDef::new(Interviews::Language).string_len(16).null())
                    .col(ColumnDef::new(Interviews::Evaluation).json_binary().null())
                    .col(ColumnDef::new(Interviews::Score).small_integer().null())
                    .col(ColumnDef::new(Interviews::StartedAt).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                    .col(ColumnDef::new(Interviews::EndedAt).timestamp_with_time_zone().null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Interviews::Table, Interviews::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    ),
            )
            .to_owned(),
        )
        .await?;
        m.create_index(
            Index::create()
                .name("idx_interviews_user_started")
                .table(Interviews::Table)
                .col(Interviews::UserId)
                .col(Interviews::StartedAt)
                .to_owned(),
        )
        .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.drop_table(Table::drop().table(Interviews::Table).to_owned()).await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
pub enum Interviews {
    Table,
    Id,
    UserId,
    Kind,
    AssistantMode,
    ProblemSlug,
    Prompt,
    DurationMinutes,
    Status,
    Transcript,
    FinalCode,
    Language,
    Evaluation,
    Score,
    StartedAt,
    EndedAt,
}
