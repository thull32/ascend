//! Listening that counts, and the daily review.
//!
//! `audio_listens`: where each learner is in each episode, and when they
//! finished it, so playback resumes on any device and a finished lesson
//! episode counts as progress (`lesson` is its lesson key, `track/module/lesson`).
//!
//! `review_items`: a Leitner schedule of quiz questions per learner. A
//! question (`<lesson key>#<n>`, n 1-based in the lesson's quiz) sits in a
//! box; each box has a longer gap before it is due again. A miss sends it
//! back to box 1.
//!
//! `audio_reviews`: each learner's daily review episode, assembled from the
//! questions' clips into one MP3 in the audio bucket (`key`); `items` lists
//! the questions in order with their start times and the learner's grades.
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared(
                "CREATE TABLE IF NOT EXISTS audio_listens (
                    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name varchar(200) NOT NULL,
                    lesson varchar(300) NULL,
                    position double precision NOT NULL DEFAULT 0,
                    heard_at timestamptz NULL,
                    updated_at timestamptz NOT NULL DEFAULT now(),
                    PRIMARY KEY (user_id, name)
                );
                CREATE TABLE IF NOT EXISTS review_items (
                    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    question varchar(300) NOT NULL,
                    box smallint NOT NULL,
                    due date NOT NULL,
                    updated_at timestamptz NOT NULL DEFAULT now(),
                    PRIMARY KEY (user_id, question)
                );
                CREATE INDEX IF NOT EXISTS review_items_due ON review_items (user_id, due);
                CREATE TABLE IF NOT EXISTS audio_reviews (
                    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    day date NOT NULL,
                    key varchar(200) NOT NULL,
                    items jsonb NOT NULL,
                    duration double precision NOT NULL,
                    bytes bigint NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    PRIMARY KEY (user_id, day)
                );
                CREATE INDEX IF NOT EXISTS audio_reviews_day ON audio_reviews (day);",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared("DROP TABLE IF EXISTS audio_reviews; DROP TABLE IF EXISTS review_items; DROP TABLE IF EXISTS audio_listens;")
            .await?;
        Ok(())
    }
}
