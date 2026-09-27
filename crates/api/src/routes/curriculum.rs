use ascend_core::content::{Lesson, LessonSummary, Module, Track};
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::error::{ApiError, ApiResult};
use crate::extractors::MaybeUser;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/curriculum", get(curriculum))
        .route("/curriculum/tracks/{track}", get(track))
        .route("/curriculum/modules/{track}/{module}", get(module))
        .route("/lessons/{track}/{module}/{lesson}", get(lesson))
        .route("/search", get(search))
        .route("/roadmap", get(roadmap))
}

#[derive(Serialize)]
struct TrackOverview<'a> {
    slug: &'a str,
    title: &'a str,
    description: &'a str,
    icon: &'a str,
    phase: u8,
    lesson_count: usize,
    estimated_hours: f32,
    modules: Vec<ModuleOverview<'a>>,
}

#[derive(Serialize)]
struct ModuleOverview<'a> {
    slug: &'a str,
    title: &'a str,
    description: &'a str,
    lesson_count: usize,
    estimated_hours: f32,
    prerequisites: &'a [String],
}

#[derive(Serialize)]
struct CurriculumResponse<'a> {
    version: &'a str,
    tracks: Vec<TrackOverview<'a>>,
    patterns: &'a [ascend_core::content::Pattern],
    lesson_count: usize,
    problem_count: usize,
}

/// Content responses carry an ETag derived from the content fingerprint, so
/// browsers revalidate for free and the payload is served from cache.
fn with_etag(state: &AppState, headers: &HeaderMap, body: impl Serialize) -> Response {
    let etag = format!("\"{}\"", state.curriculum.version);
    if headers.get(header::IF_NONE_MATCH).and_then(|v| v.to_str().ok()) == Some(etag.as_str()) {
        return StatusCode::NOT_MODIFIED.into_response();
    }
    let mut res = Json(body).into_response();
    res.headers_mut().insert(header::ETAG, HeaderValue::from_str(&etag).expect("hex etag"));
    res.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("private, max-age=0, must-revalidate"));
    res
}

async fn curriculum(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let c = &state.curriculum;
    let tracks = c
        .tracks
        .iter()
        .map(|t: &Track| TrackOverview {
            slug: &t.slug,
            title: &t.title,
            description: &t.description,
            icon: &t.icon,
            phase: t.phase,
            lesson_count: t.lesson_count,
            estimated_hours: t.estimated_hours,
            modules: t
                .modules
                .iter()
                .map(|m: &Module| ModuleOverview {
                    slug: &m.slug,
                    title: &m.title,
                    description: &m.description,
                    lesson_count: m.lessons.len(),
                    estimated_hours: m.estimated_hours,
                    prerequisites: &m.prerequisites,
                })
                .collect(),
        })
        .collect();
    with_etag(
        &state,
        &headers,
        CurriculumResponse {
            version: &c.version,
            tracks,
            patterns: &c.patterns,
            lesson_count: c.lesson_count(),
            problem_count: c.problems.len(),
        },
    )
}

async fn track(State(state): State<AppState>, headers: HeaderMap, Path(track): Path<String>) -> ApiResult<Response> {
    let t = state.curriculum.track(&track).ok_or(ApiError(ascend_core::AppError::NotFound("track")))?;
    Ok(with_etag(&state, &headers, t))
}

#[derive(Serialize)]
struct ModuleResponse<'a> {
    #[serde(flatten)]
    module: &'a Module,
    track_title: &'a str,
}

async fn module(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((track, module)): Path<(String, String)>,
) -> ApiResult<Response> {
    let slug = format!("{track}/{module}");
    let t = state.curriculum.track(&track).ok_or(ApiError(ascend_core::AppError::NotFound("track")))?;
    let m = t.modules.iter().find(|m| m.slug == slug).ok_or(ApiError(ascend_core::AppError::NotFound("module")))?;
    Ok(with_etag(&state, &headers, ModuleResponse { module: m, track_title: &t.title }))
}

#[derive(Serialize)]
struct LessonResponse {
    #[serde(flatten)]
    lesson: std::sync::Arc<Lesson>,
    /// Sibling lessons in the same module, for the side navigation.
    siblings: Vec<LessonSummary>,
    problems: Vec<ascend_core::content::ProblemSummary>,
}

async fn lesson(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((track, module, lesson)): Path<(String, String, String)>,
) -> ApiResult<Response> {
    let slug = format!("{track}/{module}/{lesson}");
    let l = state.curriculum.lesson(&slug).ok_or(ApiError(ascend_core::AppError::NotFound("lesson")))?;
    let siblings = state.curriculum.module(&l.module_slug).map(|m| m.lessons.clone()).unwrap_or_default();
    let problems = l.problems.iter().filter_map(|p| state.curriculum.problem(p)).map(|p| (&*p).into()).collect();
    Ok(with_etag(&state, &headers, LessonResponse { lesson: l, siblings, problems }))
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
    #[serde(default = "default_limit")]
    limit: usize,
}
fn default_limit() -> usize {
    20
}

async fn search(
    State(state): State<AppState>,
    Query(q): Query<SearchQuery>,
) -> Json<Vec<ascend_core::content::search::SearchHit>> {
    let q_trim: String = q.q.chars().take(100).collect();
    Json(state.curriculum.search.query(&q_trim, q.limit.min(50)))
}

async fn roadmap(
    State(state): State<AppState>,
    MaybeUser(user): MaybeUser,
) -> ApiResult<Json<ascend_core::services::roadmap::Roadmap>> {
    let (progress, hours) = match &user {
        Some(u) => (Some(state.progress.summary(u.id).await?), u.weekly_hours as f32),
        None => (None, 8.0),
    };
    Ok(Json(state.roadmap.build(progress.as_ref(), hours)))
}
