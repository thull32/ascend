//! Audio editions (see `ascend_core::services::audio`) and the daily review
//! (`ascend_core::services::review`).
//!
//! Signed in: `GET /audio` lists the episodes and where the learner is in
//! each, `PUT /audio/listens/{name}` saves their place, `GET /audio/play/{name}`
//! redirects to the episode's MP3 for the web player, and `POST /audio/feed`
//! makes (or replaces) the learner's private podcast feed URL.
//! `GET /audio/review` is today's review (made on first request),
//! `GET /audio/review/{day}/play` its MP3, and
//! `POST /audio/review/{day}/grade` the learner's mark for one question.
//!
//! With a feed token instead of a session, for podcast apps:
//! `GET /audio/feed/{token}.xml` is the feed, and beneath it
//! `/audio/feed/{token}/{name}.mp3` and `{name}.chapters.json`, where a
//! daily review's name is `review-<YYYY-MM-DD>`.
use std::collections::HashMap;

use ascend_core::AppError;
use ascend_core::services::audio::{self, Episode, Listen, Walkthrough};
use ascend_core::services::review::DailyReview;
use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::error::ApiResult;
use crate::extractors::{AppJson, CurrentUser};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/audio", get(list))
        .route("/audio/listens/{name}", put(save_listen))
        .route("/audio/play/{name}", get(play))
        .route("/audio/review", get(review_today))
        .route("/audio/review/{day}/play", get(review_play))
        .route("/audio/review/{day}/grade", post(review_grade))
        .route("/audio/feed", post(new_feed))
        .route("/audio/feed/{file}", get(feed))
        .route("/audio/feed/{token}/{file}", get(feed_file))
}

#[derive(Serialize)]
struct Listing {
    episodes: Vec<Episode>,
    walkthroughs: Vec<Walkthrough>,
    has_feed: bool,
    /// Where the learner is in each episode they have started.
    listens: HashMap<String, Listen>,
}

async fn list(State(state): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Json<Listing>> {
    let manifest = state.audio.manifest().await?;
    Ok(Json(Listing {
        episodes: manifest.episodes.clone(),
        walkthroughs: manifest.walkthroughs.clone(),
        has_feed: state.audio.has_feed(user.id).await?,
        listens: state.audio.listens(user.id).await?,
    }))
}

#[derive(Deserialize)]
struct ListenInput {
    position: f64,
    #[serde(default)]
    finished: bool,
}

async fn save_listen(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(name): Path<String>,
    AppJson(input): AppJson<ListenInput>,
) -> ApiResult<StatusCode> {
    state.audio.save_listen(user.id, &name, input.position, input.finished).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn play(State(state): State<AppState>, _: CurrentUser, Path(name): Path<String>) -> ApiResult<Redirect> {
    Ok(Redirect::temporary(state.audio.episode_url(&name).await?.as_str()))
}

fn parse_day(day: &str) -> Result<NaiveDate, AppError> {
    NaiveDate::parse_from_str(day, "%Y-%m-%d").map_err(|_| AppError::NotFound("review"))
}

/// Today's review, or `null` while there is nothing to review yet.
async fn review_today(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> ApiResult<Json<Option<DailyReview>>> {
    Ok(Json(state.review.today(user.id).await?))
}

async fn review_play(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(day): Path<String>,
) -> ApiResult<Redirect> {
    let review = state.review.get(user.id, parse_day(&day)?).await?;
    Ok(Redirect::temporary(state.review.url(&review)?.as_str()))
}

#[derive(Deserialize)]
struct GradeInput {
    question: String,
    got: bool,
}

async fn review_grade(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(day): Path<String>,
    AppJson(input): AppJson<GradeInput>,
) -> ApiResult<Json<DailyReview>> {
    Ok(Json(state.review.grade(user.id, parse_day(&day)?, &input.question, input.got).await?))
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
    let user = state.audio.feed_owner(token).await?;
    let manifest = state.audio.manifest().await?;
    // The feed still works when a review cannot be made right now.
    let reviews = state.review.recent(user).await.unwrap_or_else(|e| {
        tracing::warn!(error = %e, "daily reviews unavailable for a feed");
        Vec::new()
    });
    let xml = audio::rss(&manifest, &reviews, &feed_base(&state, token), &state.config.public_origin);
    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/rss+xml; charset=utf-8"), (header::CACHE_CONTROL, "private, max-age=300")],
        xml,
    )
        .into_response())
}

async fn feed_file(State(state): State<AppState>, Path((token, file)): Path<(String, String)>) -> ApiResult<Response> {
    let user = state.audio.feed_owner(&token).await?;
    if let Some(day) = file.strip_prefix("review-") {
        if let Some(day) = day.strip_suffix(".chapters.json") {
            let review = state.review.get(user, parse_day(day)?).await?;
            return Ok(Json(audio::review_chapters_json(&review)).into_response());
        }
        let day = day.strip_suffix(".mp3").ok_or(AppError::NotFound("review"))?;
        let review = state.review.get(user, parse_day(day)?).await?;
        return Ok(Redirect::temporary(state.review.url(&review)?.as_str()).into_response());
    }
    if let Some(name) = file.strip_suffix(".chapters.json") {
        let episode = state.audio.episode(name).await?;
        return Ok(Json(audio::chapters_json(&episode)).into_response());
    }
    let name = file.strip_suffix(".mp3").ok_or(AppError::NotFound("episode"))?;
    Ok(Redirect::temporary(state.audio.episode_url(name).await?.as_str()).into_response())
}
