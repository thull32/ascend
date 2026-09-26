use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "interviews")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[serde(skip_serializing)]
    pub user_id: Uuid,
    pub kind: String,
    pub assistant_mode: String,
    pub problem_slug: Option<String>,
    pub prompt: String,
    pub duration_minutes: i16,
    pub status: String,
    pub transcript: Json,
    pub final_code: Option<String>,
    pub language: Option<String>,
    pub evaluation: Option<Json>,
    pub score: Option<i16>,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
