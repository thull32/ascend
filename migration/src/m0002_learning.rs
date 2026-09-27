//! Learning progress: lesson completion, roadmap personalisation, quiz attempts,
//! and code submissions.
//!
//! Curriculum content itself is *not* in the database: it is versioned Markdown
//! compiled into the binary (see `ascend_core::content`). Rows here reference
//! content by stable slug, so content can be edited and redeployed without a
//! migration, and progress survives content re-ordering.
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
                    .table(LessonProgress::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(LessonProgress::UserId).uuid().not_null())
                    .col(ColumnDef::new(LessonProgress::LessonSlug).string_len(160).not_null())
                    .col(ColumnDef::new(LessonProgress::Status).string_len(16).not_null().default("in_progress"))
                    .col(ColumnDef::new(LessonProgress::CompletedAt).timestamp_with_time_zone().null())
                    .primary_key(Index::create().col(LessonProgress::UserId).col(LessonProgress::LessonSlug))
                    .foreign_key(
                        ForeignKey::create()
                            .from(LessonProgress::Table, LessonProgress::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    ),
            )
            .to_owned(),
        )
        .await?;

        m.create_table(
            timestamps(
                Table::create()
                    .table(ModulePreferences::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(ModulePreferences::UserId).uuid().not_null())
                    .col(ColumnDef::new(ModulePreferences::ModuleSlug).string_len(160).not_null())
                    // "normal" | "confident" (skip in roadmap, still browsable) | "priority"
                    .col(ColumnDef::new(ModulePreferences::Preference).string_len(16).not_null().default("normal"))
                    .primary_key(Index::create().col(ModulePreferences::UserId).col(ModulePreferences::ModuleSlug))
                    .foreign_key(
                        ForeignKey::create()
                            .from(ModulePreferences::Table, ModulePreferences::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    ),
            )
            .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(QuizAttempts::Table)
                .if_not_exists()
                .col(ColumnDef::new(QuizAttempts::Id).uuid().not_null().primary_key())
                .col(ColumnDef::new(QuizAttempts::UserId).uuid().not_null())
                .col(ColumnDef::new(QuizAttempts::LessonSlug).string_len(160).not_null())
                .col(ColumnDef::new(QuizAttempts::Source).string_len(16).not_null().default("authored"))
                .col(ColumnDef::new(QuizAttempts::Score).small_integer().not_null())
                .col(ColumnDef::new(QuizAttempts::Total).small_integer().not_null())
                .col(ColumnDef::new(QuizAttempts::Answers).json_binary().not_null())
                .col(
                    ColumnDef::new(QuizAttempts::CreatedAt)
                        .timestamp_with_time_zone()
                        .not_null()
                        .default(Expr::current_timestamp()),
                )
                .foreign_key(
                    ForeignKey::create()
                        .from(QuizAttempts::Table, QuizAttempts::UserId)
                        .to(Users::Table, Users::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;
        m.create_index(
            Index::create()
                .name("idx_quiz_attempts_user_lesson")
                .table(QuizAttempts::Table)
                .col(QuizAttempts::UserId)
                .col(QuizAttempts::LessonSlug)
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Submissions::Table)
                .if_not_exists()
                .col(ColumnDef::new(Submissions::Id).uuid().not_null().primary_key())
                .col(ColumnDef::new(Submissions::UserId).uuid().not_null())
                // Either a practice problem slug or a lesson exercise id ("lesson-slug#exercise-id").
                .col(ColumnDef::new(Submissions::TargetKind).string_len(16).not_null())
                .col(ColumnDef::new(Submissions::TargetSlug).string_len(200).not_null())
                .col(ColumnDef::new(Submissions::Language).string_len(16).not_null())
                .col(ColumnDef::new(Submissions::Code).text().not_null())
                .col(ColumnDef::new(Submissions::Passed).boolean().not_null())
                .col(ColumnDef::new(Submissions::PassedCount).small_integer().not_null())
                .col(ColumnDef::new(Submissions::TotalCount).small_integer().not_null())
                .col(ColumnDef::new(Submissions::RuntimeMs).integer().null())
                .col(ColumnDef::new(Submissions::Results).json_binary().not_null())
                .col(
                    ColumnDef::new(Submissions::CreatedAt)
                        .timestamp_with_time_zone()
                        .not_null()
                        .default(Expr::current_timestamp()),
                )
                .foreign_key(
                    ForeignKey::create()
                        .from(Submissions::Table, Submissions::UserId)
                        .to(Users::Table, Users::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;
        // Query pattern: "my submissions for problem X, newest first".
        m.create_index(
            Index::create()
                .name("idx_submissions_user_target")
                .table(Submissions::Table)
                .col(Submissions::UserId)
                .col(Submissions::TargetSlug)
                .col(Submissions::CreatedAt)
                .to_owned(),
        )
        .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.drop_table(Table::drop().table(Submissions::Table).to_owned()).await?;
        m.drop_table(Table::drop().table(QuizAttempts::Table).to_owned()).await?;
        m.drop_table(Table::drop().table(ModulePreferences::Table).to_owned()).await?;
        m.drop_table(Table::drop().table(LessonProgress::Table).to_owned()).await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
pub enum LessonProgress {
    Table,
    UserId,
    LessonSlug,
    Status,
    CompletedAt,
}

#[derive(DeriveIden)]
pub enum ModulePreferences {
    Table,
    UserId,
    ModuleSlug,
    Preference,
}

#[derive(DeriveIden)]
pub enum QuizAttempts {
    Table,
    Id,
    UserId,
    LessonSlug,
    Source,
    Score,
    Total,
    Answers,
    CreatedAt,
}

#[derive(DeriveIden)]
pub enum Submissions {
    Table,
    Id,
    UserId,
    TargetKind,
    TargetSlug,
    Language,
    Code,
    Passed,
    PassedCount,
    TotalCount,
    RuntimeMs,
    Results,
    CreatedAt,
}
