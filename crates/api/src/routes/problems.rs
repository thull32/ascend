use std::sync::Arc;

use ascend_core::content::{Problem, ProblemSummary};
use ascend_core::services::submissions::{GradedSubmission, SubmissionInput};
use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router, middleware};
use serde::{Deserialize, Serialize};

use crate::error::{ApiError, ApiResult};
use crate::extractors::{AppJson, CurrentUser};
use crate::middleware::rate_limit::{Bucket, limit};
use crate::state::AppState;

pub fn router(state: AppState) -> Router<AppState> {
    // Each submission runs code on the server, so it has its own allowance.
    let grading = Router::new()
        .route("/submissions", post(submit))
        .layer(middleware::from_fn_with_state(state, |s, r, n| limit(Bucket::Grade, s, r, n)));
    Router::new()
        .route("/problems", get(list))
        .route("/problems/{slug}", get(detail))
        .route("/problems/{slug}/solution", get(solution))
        .merge(grading)
        .route("/submissions/{target}", get(list_submissions))
}

#[derive(Deserialize)]
struct ListQuery {
    pattern: Option<String>,
    list: Option<String>,
    difficulty: Option<String>,
}

async fn list(State(state): State<AppState>, Query(q): Query<ListQuery>) -> Json<Vec<ProblemSummary>> {
    let out = state
        .curriculum
        .problems
        .iter()
        .filter(|p| q.pattern.as_ref().is_none_or(|pat| p.patterns.contains(pat)))
        .filter(|p| q.list.as_ref().is_none_or(|l| p.lists.contains(l)))
        .filter(|p| q.difficulty.as_ref().is_none_or(|d| format!("{:?}", p.difficulty).to_lowercase() == *d))
        .map(|p| ProblemSummary::from(&**p))
        .collect();
    Json(out)
}

#[derive(Serialize)]
struct ProblemResponse {
    #[serde(flatten)]
    problem: Arc<Problem>,
    /// Only visible tests are sent; hidden ones are evaluated on submit via
    /// the same client runner but not shown in the UI beforehand.
    visible_tests: usize,
}

async fn detail(State(state): State<AppState>, Path(slug): Path<String>) -> ApiResult<Json<ProblemResponse>> {
    let p = state.curriculum.problem(&slug).ok_or(ApiError(ascend_core::AppError::NotFound("problem")))?;
    let visible_tests = p.tests.iter().filter(|t| !t.hidden).count();
    Ok(Json(ProblemResponse { problem: p, visible_tests }))
}

#[derive(Serialize)]
struct SolutionResponse {
    slug: String,
    solution: String,
}

/// The editorial is gated behind login so the "try first" nudge means something.
async fn solution(
    State(state): State<AppState>,
    CurrentUser(_): CurrentUser,
    Path(slug): Path<String>,
) -> ApiResult<Json<SolutionResponse>> {
    let p = state.curriculum.problem(&slug).ok_or(ApiError(ascend_core::AppError::NotFound("problem")))?;
    Ok(Json(SolutionResponse { slug: p.slug.clone(), solution: p.solution.clone() }))
}

/// Runs the code in the grader and records the server's verdict.
async fn submit(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    AppJson(input): AppJson<SubmissionInput>,
) -> ApiResult<Json<GradedSubmission>> {
    Ok(Json(state.submissions.record(user.id, input).await?))
}

async fn list_submissions(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(target): Path<String>,
) -> ApiResult<Json<Vec<ascend_core::entities::submissions::Model>>> {
    Ok(Json(state.submissions.list_for_target(user.id, &target, 20).await?))
}
