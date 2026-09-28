use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "users")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub email: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub display_name: String,
    pub role: String,
    pub target_company: Option<String>,
    pub target_level: Option<String>,
    pub weekly_hours: i16,
    pub preferred_language: String,
    /// IANA time zone name; `None` means UTC. Days (streaks) are the
    /// learner's local days.
    pub timezone: Option<String>,
    pub onboarded_at: Option<DateTime<Utc>>,
    pub last_login_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::sessions::Entity")]
    Sessions,
    #[sea_orm(has_many = "super::lesson_progress::Entity")]
    LessonProgress,
}

impl Related<super::sessions::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Sessions.def()
    }
}

impl Related<super::lesson_progress::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::LessonProgress.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

impl Model {
    pub fn is_admin(&self) -> bool {
        self.role == "admin"
    }
}
