use std::sync::Arc;

use chrono::Utc;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::content::Curriculum;
use crate::entities::prelude::*;
use crate::entities::{comments, users};
use crate::error::{AppError, AppResult};

#[derive(Debug, Deserialize, Validate)]
pub struct NewComment {
    pub target_kind: String,
    pub target_slug: String,
    pub parent_id: Option<Uuid>,
    #[validate(length(min = 1, max = 5000, message = "must be 1–5000 characters"))]
    pub body: String,
}

#[derive(Debug, Serialize)]
pub struct CommentView {
    pub id: Uuid,
    pub parent_id: Option<Uuid>,
    pub body: String,
    pub author_name: String,
    pub author_id: Uuid,
    pub deleted: bool,
    pub created_at: chrono::DateTime<Utc>,
    pub replies: Vec<CommentView>,
}

/// Flat projection of a comment plus its author's display name.
#[derive(Debug, FromQueryResult)]
struct CommentRow {
    id: Uuid,
    user_id: Uuid,
    target_kind: String,
    target_slug: String,
    parent_id: Option<Uuid>,
    body: String,
    deleted_at: Option<chrono::DateTime<Utc>>,
    created_at: chrono::DateTime<Utc>,
    updated_at: chrono::DateTime<Utc>,
    author_name: Option<String>,
}

impl CommentRow {
    fn comment(&self) -> comments::Model {
        comments::Model {
            id: self.id,
            user_id: self.user_id,
            target_kind: self.target_kind.clone(),
            target_slug: self.target_slug.clone(),
            parent_id: self.parent_id,
            body: self.body.clone(),
            deleted_at: self.deleted_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Clone)]
pub struct CommentService {
    db: DatabaseConnection,
    curriculum: Arc<Curriculum>,
}

impl CommentService {
    pub fn new(db: DatabaseConnection, curriculum: Arc<Curriculum>) -> Self {
        Self { db, curriculum }
    }

    fn validate_target(&self, kind: &str, slug: &str) -> AppResult<()> {
        let ok = match kind {
            "lesson" => self.curriculum.lesson(slug).is_some(),
            "problem" => self.curriculum.problem(slug).is_some(),
            _ => false,
        };
        if ok { Ok(()) } else { Err(AppError::NotFound("comment target")) }
    }

    pub async fn create(&self, user_id: Uuid, input: NewComment) -> AppResult<Uuid> {
        input.validate()?;
        self.validate_target(&input.target_kind, &input.target_slug)?;
        if let Some(parent) = input.parent_id {
            let p = Comments::find_by_id(parent).one(&self.db).await?.ok_or(AppError::NotFound("parent comment"))?;
            if p.target_slug != input.target_slug || p.parent_id.is_some() {
                // One level of nesting keeps threads readable on a phone.
                return Err(AppError::validation(
                    "replies can only be attached to top-level comments on the same target",
                ));
            }
        }
        let now = Utc::now();
        let id = Uuid::now_v7();
        comments::ActiveModel {
            id: Set(id),
            user_id: Set(user_id),
            target_kind: Set(input.target_kind),
            target_slug: Set(input.target_slug),
            parent_id: Set(input.parent_id),
            body: Set(input.body.trim().to_string()),
            deleted_at: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(&self.db)
        .await?;
        Ok(id)
    }

    pub async fn list(&self, kind: &str, slug: &str) -> AppResult<Vec<CommentView>> {
        self.validate_target(kind, slug)?;
        // One query with the author's display name joined (not the whole user
        // row: never select password hashes you don't need). Newest 500 first,
        // then reversed so threads read oldest to newest.
        let mut rows: Vec<(comments::Model, Option<String>)> = Comments::find()
            .select_only()
            .columns(comments::Column::iter())
            .column_as(users::Column::DisplayName, "author_name")
            .left_join(Users)
            .filter(comments::Column::TargetKind.eq(kind))
            .filter(comments::Column::TargetSlug.eq(slug))
            .order_by_desc(comments::Column::CreatedAt)
            .limit(500)
            .into_model::<CommentRow>()
            .all(&self.db)
            .await?
            .into_iter()
            .map(|r| (r.comment(), r.author_name))
            .collect();
        rows.reverse();
        let mut roots: Vec<CommentView> = Vec::new();
        let mut replies: Vec<CommentView> = Vec::new();
        for (c, author) in rows {
            let deleted = c.deleted_at.is_some();
            let view = CommentView {
                id: c.id,
                parent_id: c.parent_id,
                body: if deleted { String::new() } else { c.body },
                author_name: author.unwrap_or_else(|| "deleted user".into()),
                author_id: c.user_id,
                deleted,
                created_at: c.created_at,
                replies: Vec::new(),
            };
            if c.parent_id.is_some() { replies.push(view) } else { roots.push(view) }
        }
        for r in replies {
            if let Some(root) = roots.iter_mut().find(|x| Some(x.id) == r.parent_id) {
                root.replies.push(r);
            }
        }
        Ok(roots)
    }

    pub async fn delete(&self, user_id: Uuid, is_admin: bool, id: Uuid) -> AppResult<()> {
        let c = Comments::find_by_id(id).one(&self.db).await?.ok_or(AppError::NotFound("comment"))?;
        if c.user_id != user_id && !is_admin {
            return Err(AppError::Forbidden);
        }
        let mut active: comments::ActiveModel = c.into();
        active.deleted_at = Set(Some(Utc::now()));
        active.body = Set(String::new());
        active.update(&self.db).await?;
        Ok(())
    }
}
