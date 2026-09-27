//! Integrity fixes found in review.
//!
//! 1. `activity_days`: one row per (user, UTC day) with any learning activity.
//!    Streaks used to be derived from `lesson_progress.updated_at`, which each
//!    update overwrites, so earlier active days vanished. An append-only fact
//!    table is the correct source.
//! 2. At most one active interview per user, enforced by the database with a
//!    partial unique index (the service's "abandon then insert" could race).
//! 3. Comments survive account deletion. `comments.user_id` becomes nullable
//!    with ON DELETE SET NULL; previously deleting a user cascaded to their
//!    comments and, through `parent_id`, to other people's replies.
use sea_orm_migration::prelude::*;

use crate::m0001_identity::Users;
use crate::m0004_community::Comments;
use crate::m0005_interviews::Interviews;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(ActivityDays::Table)
                .if_not_exists()
                .col(ColumnDef::new(ActivityDays::UserId).uuid().not_null())
                .col(ColumnDef::new(ActivityDays::Day).date().not_null())
                .primary_key(Index::create().col(ActivityDays::UserId).col(ActivityDays::Day))
                .foreign_key(
                    ForeignKey::create()
                        .from(ActivityDays::Table, ActivityDays::UserId)
                        .to(Users::Table, Users::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;

        // Backfill from the append-only tables we already have.
        let db = m.get_connection();
        db.execute_unprepared(
            r#"
            INSERT INTO activity_days (user_id, day)
            SELECT user_id, (created_at AT TIME ZONE 'UTC')::date FROM quiz_attempts
            UNION SELECT user_id, (created_at AT TIME ZONE 'UTC')::date FROM submissions
            UNION SELECT user_id, (updated_at AT TIME ZONE 'UTC')::date FROM lesson_progress
            ON CONFLICT DO NOTHING
            "#,
        )
        .await?;

        // Keep only the newest active interview per user before adding the index.
        db.execute_unprepared(
            r#"
            UPDATE interviews i SET status = 'abandoned', ended_at = now()
             WHERE status = 'active'
               AND EXISTS (SELECT 1 FROM interviews j
                            WHERE j.user_id = i.user_id AND j.status = 'active' AND j.started_at > i.started_at)
            "#,
        )
        .await?;
        m.create_index(
            Index::create()
                .name("uq_interviews_one_active_per_user")
                .table(Interviews::Table)
                .col(Interviews::UserId)
                .unique()
                .and_where(Expr::col(Interviews::Status).eq("active"))
                .to_owned(),
        )
        .await?;

        // comments.user_id: NOT NULL + CASCADE  ->  NULL + SET NULL
        db.execute_unprepared("ALTER TABLE comments ALTER COLUMN user_id DROP NOT NULL").await?;
        db.execute_unprepared(
            r#"
            DO $$
            DECLARE fk text;
            BEGIN
              SELECT conname INTO fk FROM pg_constraint
               WHERE conrelid = 'comments'::regclass AND contype = 'f'
                 AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                                      WHERE attrelid = 'comments'::regclass AND attname = 'user_id')];
              IF fk IS NOT NULL THEN
                EXECUTE format('ALTER TABLE comments DROP CONSTRAINT %I', fk);
              END IF;
            END $$
            "#,
        )
        .await?;
        m.create_foreign_key(
            ForeignKey::create()
                .name("fk_comments_user_set_null")
                .from(Comments::Table, Comments::UserId)
                .to(Users::Table, Users::Id)
                .on_delete(ForeignKeyAction::SetNull)
                .to_owned(),
        )
        .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.drop_foreign_key(ForeignKey::drop().name("fk_comments_user_set_null").table(Comments::Table).to_owned())
            .await?;
        let db = m.get_connection();
        db.execute_unprepared("DELETE FROM comments WHERE user_id IS NULL").await?;
        db.execute_unprepared("ALTER TABLE comments ALTER COLUMN user_id SET NOT NULL").await?;
        m.create_foreign_key(
            ForeignKey::create()
                .from(Comments::Table, Comments::UserId)
                .to(Users::Table, Users::Id)
                .on_delete(ForeignKeyAction::Cascade)
                .to_owned(),
        )
        .await?;
        m.drop_index(Index::drop().name("uq_interviews_one_active_per_user").table(Interviews::Table).to_owned())
            .await?;
        m.drop_table(Table::drop().table(ActivityDays::Table).to_owned()).await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
pub enum ActivityDays {
    Table,
    UserId,
    Day,
}
