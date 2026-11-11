//! A problem report on a coding problem remembers the reporter's latest
//! attempt at it, so an admin checking the report can open that code
//! (audited, like any opening of submitted code). It becomes null if
//! retention deletes the attempt.
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared(
                "ALTER TABLE content_reports ADD COLUMN IF NOT EXISTS submission_id uuid NULL \
                   REFERENCES submissions(id) ON DELETE SET NULL;
                 CREATE INDEX IF NOT EXISTS content_reports_submission ON content_reports (submission_id) \
                   WHERE submission_id IS NOT NULL;",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared("ALTER TABLE content_reports DROP COLUMN IF EXISTS submission_id;")
            .await?;
        Ok(())
    }
}
