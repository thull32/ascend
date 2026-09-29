use std::sync::Arc;
use std::time::Duration;

use ascend_grader::{Expected, GradeError, Grader, Job, Language, Outcome};

use super::grading::GradingBackend;
use chrono::Utc;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::content::{Curriculum, Lesson, Problem, TestCase};
use crate::entities::prelude::*;
use crate::entities::submissions;
use crate::error::{AppError, AppResult};

/// A learner's attempt. The server runs the code and decides the result:
/// results the browser computed are never trusted, so "solved" (and the XP
/// and progress built on it) means the server saw every test pass. See
/// `ascend-grader` for the sandbox.
#[derive(Debug, Deserialize)]
pub struct SubmissionInput {
    pub target_kind: String, // "problem" | "exercise"
    pub target_slug: String,
    pub language: String,
    pub code: String,
    /// TypeScript only: the browser's type-stripped JavaScript, which is
    /// what runs. Trusting it costs nothing: a learner who sends JavaScript
    /// unrelated to their TypeScript could equally have submitted it as
    /// JavaScript.
    #[serde(default)]
    pub compiled: Option<String>,
}

/// The server's verdict on one test. Hidden tests' inputs and expected
/// values are in the page already; only the outcome is returned.
#[derive(Debug, Clone, Serialize)]
pub struct TestVerdict {
    pub index: usize,
    pub passed: bool,
    pub error: Option<String>,
    pub ms: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct GradedSubmission {
    #[serde(flatten)]
    pub submission: submissions::Model,
    pub compile_error: Option<String>,
    pub tests: Vec<TestVerdict>,
}

#[derive(Clone)]
pub struct SubmissionService {
    db: DatabaseConnection,
    curriculum: Arc<Curriculum>,
    grader: Option<GradingBackend>,
}

const MAX_CODE_BYTES: usize = 64 * 1024;

/// What a submission is graded against.
struct Target<'a> {
    entry: &'a str,
    tests: &'a [TestCase],
    time_limit_ms: u32,
}

impl SubmissionService {
    pub fn new(db: DatabaseConnection, curriculum: Arc<Curriculum>, grader: Option<GradingBackend>) -> Self {
        Self { db, curriculum, grader }
    }

    /// The in-process grader, when grading is not delegated to the service.
    pub fn grader(&self) -> Option<&Grader> {
        self.grader.as_ref().and_then(GradingBackend::local)
    }

    fn target<'a>(
        &self,
        kind: &str,
        slug: &str,
        language: &str,
        problem: &'a Option<Arc<Problem>>,
        lesson: &'a Option<Arc<Lesson>>,
    ) -> AppResult<Target<'a>> {
        let unavailable = || AppError::validation(format!("{language} is not offered for this {kind}"));
        match kind {
            "problem" => {
                let p = problem.as_ref().ok_or(AppError::NotFound("problem"))?;
                let sig = p.signatures.get(language).ok_or_else(unavailable)?;
                Ok(Target { entry: &sig.name, tests: &p.tests, time_limit_ms: p.time_limit_ms })
            }
            "exercise" => {
                let (_, id) = slug.split_once('#').ok_or(AppError::NotFound("exercise"))?;
                let ex = lesson
                    .as_ref()
                    .and_then(|l| l.exercises.iter().find(|e| e.id == id))
                    .ok_or(AppError::NotFound("exercise"))?;
                if !ex.languages.iter().any(|l| l == language) {
                    return Err(unavailable());
                }
                Ok(Target { entry: &ex.entry, tests: &ex.tests, time_limit_ms: ex.time_limit_ms })
            }
            _ => Err(AppError::validation("target_kind must be problem or exercise")),
        }
    }

    pub async fn record(&self, user_id: Uuid, input: SubmissionInput) -> AppResult<GradedSubmission> {
        if input.code.len() > MAX_CODE_BYTES || input.compiled.as_ref().is_some_and(|c| c.len() > 2 * MAX_CODE_BYTES) {
            return Err(AppError::validation("code exceeds 64 KiB"));
        }
        let (language, runnable) = match input.language.as_str() {
            "python" => (Language::Python, input.code.clone()),
            "javascript" => (Language::JavaScript, input.code.clone()),
            "typescript" => (
                Language::JavaScript,
                input
                    .compiled
                    .clone()
                    .ok_or_else(|| AppError::validation("typescript needs its compiled JavaScript"))?,
            ),
            _ => return Err(AppError::validation("unsupported language")),
        };
        // Resolve before grading so an unknown target is a cheap 404.
        let problem = (input.target_kind == "problem").then(|| self.curriculum.problem(&input.target_slug)).flatten();
        let lesson = (input.target_kind == "exercise")
            .then(|| input.target_slug.split_once('#').and_then(|(l, _)| self.curriculum.lesson(l)))
            .flatten();
        let target = self.target(&input.target_kind, &input.target_slug, &input.language, &problem, &lesson)?;

        let grader = self.grader.as_ref().ok_or_else(|| AppError::Unavailable {
            message: "code grading is not set up on this server".into(),
            retry_after_secs: None,
        })?;
        let job = Job {
            language,
            code: runnable,
            entry: target.entry.to_string(),
            cases: target.tests.iter().map(|t| t.args.clone()).collect(),
            expected: expected(target.tests),
            time_limit: Duration::from_millis(u64::from(target.time_limit_ms)),
        };
        let lang_label = if language == Language::Python { "python" } else { "javascript" };
        let m = crate::metrics::get();
        let started = std::time::Instant::now();
        let outcome = grader.run(job).await.map_err(|e| {
            let label = if matches!(e, GradeError::Busy) { "busy" } else { "error" };
            m.grader_runs.add(1, &[crate::metrics::kv("language", lang_label), crate::metrics::kv("outcome", label)]);
            match e {
                GradeError::Busy => AppError::Unavailable {
                    message: "every code runner is busy; try again in a few seconds".into(),
                    retry_after_secs: Some(5),
                },
                other => AppError::internal(other),
            }
        })?;
        let total = started.elapsed();
        m.grader_duration.record(outcome.elapsed.as_secs_f64(), &[crate::metrics::kv("language", lang_label)]);
        m.grader_queue_wait.record(total.saturating_sub(outcome.elapsed).as_secs_f64(), &[]);
        let result = match (&outcome.compile_error, &outcome.stopped) {
            (Some(_), _) => "compile_error",
            (_, Some(ascend_grader::Stop::TimeLimit)) => "time_limit",
            (_, Some(_)) => "crashed",
            _ if outcome.passed.iter().all(|p| *p) => "passed",
            _ => "failed",
        };
        m.grader_runs.add(1, &[crate::metrics::kv("language", lang_label), crate::metrics::kv("outcome", result)]);

        let tests = verdicts(target.tests, &outcome);
        let passed_count = tests.iter().filter(|t| t.passed).count();
        let total = target.tests.len();
        let results = serde_json::json!(
            tests.iter().map(|t| serde_json::json!({"i": t.index, "p": t.passed, "e": t.error})).collect::<Vec<_>>()
        );
        let model = submissions::ActiveModel {
            id: Set(Uuid::now_v7()),
            user_id: Set(user_id),
            target_kind: Set(input.target_kind),
            target_slug: Set(input.target_slug),
            language: Set(input.language),
            code: Set(input.code),
            passed: Set(total > 0 && passed_count == total),
            passed_count: Set(i16::try_from(passed_count).unwrap_or(i16::MAX)),
            total_count: Set(i16::try_from(total).unwrap_or(i16::MAX)),
            runtime_ms: Set(Some(i32::try_from(outcome.elapsed.as_millis()).unwrap_or(i32::MAX))),
            results: Set(results),
            created_at: Set(Utc::now()),
        };
        let saved = model.insert(&self.db).await?;
        super::activity::record(&self.db, user_id).await?;
        Ok(GradedSubmission { submission: saved, compile_error: outcome.compile_error, tests })
    }

    pub async fn list_for_target(
        &self,
        user_id: Uuid,
        target_slug: &str,
        limit: u64,
    ) -> AppResult<Vec<submissions::Model>> {
        Ok(Submissions::find()
            .filter(submissions::Column::UserId.eq(user_id))
            .filter(submissions::Column::TargetSlug.eq(target_slug))
            .order_by_desc(submissions::Column::CreatedAt)
            .limit(limit)
            .all(&self.db)
            .await?)
    }

    /// Latest submission per target for a user — used to restore editor state.
    pub async fn latest(&self, user_id: Uuid, target_slug: &str) -> AppResult<Option<submissions::Model>> {
        Ok(Submissions::find()
            .filter(submissions::Column::UserId.eq(user_id))
            .filter(submissions::Column::TargetSlug.eq(target_slug))
            .order_by_desc(submissions::Column::CreatedAt)
            .one(&self.db)
            .await?)
    }
}

/// Compares each case's returned value with the expected one. A case the run
/// never reached fails with the reason the run stopped.
pub(crate) fn verdicts(tests: &[TestCase], outcome: &Outcome) -> Vec<TestVerdict> {
    tests
        .iter()
        .enumerate()
        .map(|(index, _test)| {
            if let Some(e) = &outcome.compile_error {
                return TestVerdict { index, passed: false, error: Some(e.clone()), ms: None };
            }
            match outcome.cases.get(index).and_then(Option::as_ref) {
                Some(run) => TestVerdict {
                    index,
                    passed: outcome.passed.get(index).copied().unwrap_or(false),
                    error: run.error.clone(),
                    ms: Some(run.ms),
                },
                None => TestVerdict {
                    index,
                    passed: false,
                    error: Some(outcome.stopped.as_ref().map_or_else(
                        || "no result was reported for this test".to_string(),
                        |s| s.message(outcome.budget),
                    )),
                    ms: None,
                },
            }
        })
        .collect()
}

/// What each test must return, for the grader's host-side comparison.
pub(crate) fn expected(tests: &[TestCase]) -> Vec<Expected> {
    tests.iter().map(|t| Expected { value: t.expected.clone(), any_order: t.any_order }).collect()
}
