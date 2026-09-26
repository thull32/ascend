use ascend_core::services::comments::{CommentView, NewComment};
use axum::extract::{Path, Query, State};
use axum::routing::{delete, get};
use axum::{Json, Router};
use serde::Deserialize;
use uuid::Uuid;

use crate::error::ApiResult;
use crate::extractors::CurrentUser;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/comments", get(list).post(create)).route("/comments/{id}", delete(remove))
}

#[derive(Deserialize)]
struct ListQuery {
    kind: String,
    slug: String,
}

async fn list(State(state): State<AppState>, Query(q): Query<ListQuery>) -> ApiResult<Json<Vec<CommentView>>> {
    Ok(Json(state.comments.list(&q.kind, &q.slug).await?))
}

async fn create(State(state): State<AppState>, CurrentUser(user): CurrentUser, Json(input): Json<NewComment>) -> ApiResult<Json<serde_json::Value>> {
    let id = state.comments.create(user.id, input).await?;
    Ok(Json(serde_json::json!({ "id": id })))
}

async fn remove(State(state): State<AppState>, CurrentUser(user): CurrentUser, Path(id): Path<Uuid>) -> ApiResult<Json<serde_json::Value>> {
    state.comments.delete(user.id, user.role == "admin", id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
