use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "submissions")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub user_id: Uuid,
    pub target_kind: String,
    pub target_slug: String,
    pub language: String,
    pub code: String,
    pub passed: bool,
    pub passed_count: i16,
    pub total_count: i16,
    pub runtime_ms: Option<i32>,
    pub results: Json,
    pub created_at: DateTime<Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
