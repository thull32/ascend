//! Problem reports, invite attribution and the weekly admin digest.
//!
//! * `content_reports`: a learner flags a mistake, a broken visualisation or
//!   something unclear in a lesson or problem; admins work the queue at
//!   `/admin/reports`. `user_id` becomes null when the reporter deletes
//!   their account (the report is about the content, not them). Resolved
//!   and dismissed reports expire a year after they were closed
//!   (`services::retention`).
//! * `invite_redemptions`: which invite created each account. It keeps the
//!   invite's short id and note rather than a foreign key, so attribution
//!   survives revoking the invite. Deleted with the account.
//! * `admin_digest_weeks`: one row per weekly digest sent, claimed before
//!   sending, so two replicas (or a restart) never send the same week twice.
//! * `admin_preferences`: per-admin settings; a missing row means defaults
//!   (the weekly email is on).
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared(
                "CREATE TABLE IF NOT EXISTS content_reports (
                    id uuid PRIMARY KEY,
                    user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
                    target_kind varchar(16) NOT NULL CHECK (target_kind IN ('lesson', 'problem')),
                    target_slug varchar(200) NOT NULL,
                    category varchar(16) NOT NULL CHECK (category IN ('mistake', 'broken', 'unclear', 'other')),
                    message text NOT NULL,
                    status varchar(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
                    closed_at timestamptz NULL,
                    closed_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    CHECK ((status = 'open') = (closed_at IS NULL))
                );
                CREATE INDEX IF NOT EXISTS content_reports_created ON content_reports (created_at DESC);
                CREATE INDEX IF NOT EXISTS content_reports_open ON content_reports (created_at DESC)
                    WHERE status = 'open';
                CREATE INDEX IF NOT EXISTS content_reports_target ON content_reports (target_kind, target_slug);
                CREATE INDEX IF NOT EXISTS content_reports_closed ON content_reports (closed_at)
                    WHERE closed_at IS NOT NULL;

                CREATE TABLE IF NOT EXISTS invite_redemptions (
                    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    invite_id varchar(8) NOT NULL,
                    note varchar(200) NOT NULL DEFAULT '',
                    created_at timestamptz NOT NULL DEFAULT now()
                );
                CREATE INDEX IF NOT EXISTS invite_redemptions_invite ON invite_redemptions (invite_id);

                CREATE TABLE IF NOT EXISTS admin_digest_weeks (
                    week date PRIMARY KEY,
                    sent_at timestamptz NOT NULL DEFAULT now(),
                    recipients integer NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS admin_preferences (
                    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    weekly_digest boolean NOT NULL DEFAULT true,
                    updated_at timestamptz NOT NULL DEFAULT now()
                );",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared(
                "DROP TABLE IF EXISTS admin_preferences; DROP TABLE IF EXISTS admin_digest_weeks; \
                 DROP TABLE IF EXISTS invite_redemptions; DROP TABLE IF EXISTS content_reports;",
            )
            .await?;
        Ok(())
    }
}
