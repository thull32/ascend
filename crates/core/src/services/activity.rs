//! Learning activity log: one row per (user, UTC day). Every service that
//! records learning (lesson progress, quiz attempts, submissions) calls
//! [`record`]. Streaks are computed from this table.
use chrono::Utc;
use sea_orm::*;
use uuid::Uuid;

use crate::entities::activity_days;
use crate::entities::prelude::*;
use crate::error::AppResult;

pub async fn record<C: ConnectionTrait>(db: &C, user_id: Uuid) -> AppResult<()> {
    ActivityDays::insert(activity_days::ActiveModel { user_id: Set(user_id), day: Set(Utc::now().date_naive()) })
        .on_conflict_do_nothing_on([activity_days::Column::UserId, activity_days::Column::Day])
        .exec_without_returning(db)
        .await?;
    Ok(())
}
