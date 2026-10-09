//! Audio editions (see `ascend_core::services::audio`).
//!
//! Signed in: `GET /audio` lists the episodes, `GET /audio/play/{name}`
//! redirects to the episode's MP3 for the web player, and `POST /audio/feed`
//! makes (or replaces) the learner's private podcast feed URL.
//!
//! With a feed token instead of a session, for podcast apps:
//! `GET /audio/feed/{token}.xml` is the feed, and beneath it
//! `/audio/feed/{token}/{name}.mp3` and `{name}.chapters.json`.
use ascend_core::AppError;
use ascend_core::services::audio::{self, Episode};
use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;

use crate::error::ApiResult;
use crate::extractors::CurrentUser;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/audio", get(list))
        .route("/audio/play/{name}", get(play))
        .route("/audio/feed", post(new_feed))
        .route("/audio/feed/{file}", get(feed))
        .route("/audio/feed/{token}/{file}", get(feed_file))
}

#[derive(Serialize)]
struct Listing {
    episodes: Vec<Episode>,
    has_feed: bool,
}

async fn list(State(state): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Json<Listing>> {
    let episodes = state.audio.manifest().await?.episodes.clone();
    Ok(Json(Listing { episodes, has_feed: state.audio.has_feed(user.id).await? }))
}

async fn play(State(state): State<AppState>, _: CurrentUser, Path(name): Path<String>) -> ApiResult<Redirect> {
    Ok(Redirect::temporary(state.audio.episode_url(&name).await?.as_str()))
}

fn feed_base(state: &AppState, token: &str) -> String {
    format!("{}/api/audio/feed/{token}", state.config.public_origin.trim_end_matches('/'))
}

async fn new_feed(State(state): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Json<serde_json::Value>> {
    if !state.audio.enabled() {
        return Err(AppError::NotFound("audio").into());
    }
    let token = state.audio.new_feed(user.id).await?;
    Ok(Json(serde_json::json!({ "url": format!("{}.xml", feed_base(&state, &token)) })))
}

async fn feed(State(state): State<AppState>, Path(file): Path<String>) -> ApiResult<Response> {
    let token = file.strip_suffix(".xml").ok_or(AppError::NotFound("feed"))?;
    state.audio.feed_owner(token).await?;
    let manifest = state.audio.manifest().await?;
    let xml = audio::rss(&manifest, &feed_base(&state, token), &state.config.public_origin);
    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/rss+xml; charset=utf-8"), (header::CACHE_CONTROL, "private, max-age=300")],
        xml,
    )
        .into_response())
}

async fn feed_file(State(state): State<AppState>, Path((token, file)): Path<(String, String)>) -> ApiResult<Response> {
    state.audio.feed_owner(&token).await?;
    if let Some(name) = file.strip_suffix(".chapters.json") {
        let episode = state.audio.episode(name).await?;
        return Ok(Json(audio::chapters_json(&episode)).into_response());
    }
    let name = file.strip_suffix(".mp3").ok_or(AppError::NotFound("episode"))?;
    Ok(Redirect::temporary(state.audio.episode_url(name).await?.as_str()).into_response())
}
