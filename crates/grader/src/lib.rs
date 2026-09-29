//! # ascend-grader
//!
//! Runs learner code on the server, so a recorded result ("solved") is one
//! the server computed rather than one the browser reported.
//!
//! Learner code is untrusted, so it runs inside WebAssembly: CPython and
//! QuickJS compiled to WASI, executed by Wasmtime. The sandbox gets no
//! network, no environment variables, no clock beyond reading one, and no
//! files except (for Python) a read-only standard library. CPU time is
//! bounded by epoch interruption, memory by a store limit, and concurrency by
//! a semaphore, so a hostile submission costs at most one slot for its time
//! budget.
//!
//! The harnesses (`harness/harness.py`, `harness/runner.js`, shared with the
//! browser's runners) run the learner's function on each case's arguments and
//! report what it returned. They never see expected values: the host compares
//! afterwards, running the one definition of the rule (`harness/compare.js`,
//! also the browser's) in a fresh QuickJS instance. Code that tampers with
//! the harness from inside the sandbox can therefore only report return
//! values of its choosing, which it could do anyway by returning them.
//!
//! The runtimes live in a directory laid out as
//! `python.wasm`, `lib/python3.x/…` and `qjs.wasm`; `scripts/grader-runtimes.sh`
//! downloads pinned builds and `ascend-api --prepare-grader` precompiles the
//! standard library.
mod sandbox;

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use sandbox::{Grader, precompile_stdlib};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Python,
    /// Also TypeScript, which the browser strips to JavaScript.
    JavaScript,
}

/// What one case must return. Used only on the host side: expected values
/// never enter the learner's sandbox.
#[derive(Debug, Clone)]
pub struct Expected {
    pub value: Value,
    pub any_order: bool,
}

/// One grading run: the learner's code, the name the tests call, each
/// case's arguments, and what each case must return.
#[derive(Debug, Clone)]
pub struct Job {
    pub language: Language,
    pub code: String,
    pub entry: String,
    pub cases: Vec<Vec<Value>>,
    pub expected: Vec<Expected>,
    /// Per case, as in the browser; the run's budget is this times the
    /// number of cases, plus the interpreter's start-up allowance.
    pub time_limit: Duration,
}

/// What the learner's code did with one case.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseRun {
    pub actual: Value,
    pub error: Option<String>,
    pub ms: f64,
}

/// Why a run ended before every case reported.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "detail")]
pub enum Stop {
    TimeLimit,
    StackOverflow,
    /// The interpreter exited or crashed; the detail is its last output.
    Crashed(String),
}

impl Stop {
    /// What to tell the learner about a case the run never reached.
    pub fn message(&self, budget: Duration) -> String {
        match self {
            Stop::TimeLimit => format!(
                "Time limit exceeded ({:.1} s for all tests). Check for an infinite loop or a slower-than-expected algorithm.",
                budget.as_secs_f64()
            ),
            Stop::StackOverflow => "Stack overflow: recursion too deep.".into(),
            Stop::Crashed(detail) if detail.is_empty() => "The program exited before the tests finished.".into(),
            Stop::Crashed(detail) => format!("The program exited before the tests finished: {detail}"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Outcome {
    /// The code did not load (syntax error, missing entry point, …).
    pub compile_error: Option<String>,
    /// One entry per case, in order; `None` for cases the run never reached.
    pub cases: Vec<Option<CaseRun>>,
    /// Whether each case returned its expected value without an error,
    /// decided by the shared rule (`harness/compare.js`).
    pub passed: Vec<bool>,
    pub stopped: Option<Stop>,
    /// The time budget the run had.
    pub budget: Duration,
    pub elapsed: Duration,
}

#[derive(Debug, Clone)]
pub struct Options {
    /// Runs at once. Each holds a core for up to its budget.
    pub slots: usize,
    /// How long a run may wait for a slot before the request is refused.
    pub queue_timeout: Duration,
    /// Linear memory per run.
    pub memory_limit: usize,
}

impl Default for Options {
    fn default() -> Self {
        let cores = std::thread::available_parallelism().map_or(2, |n| n.get());
        Self { slots: (cores / 2).clamp(1, 4), queue_timeout: Duration::from_secs(20), memory_limit: 256 << 20 }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum GradeError {
    #[error("grader runtimes not found in {0} (run `make grader`)")]
    Missing(PathBuf),
    #[error("every grading slot is busy")]
    Busy,
    #[error("grader failure: {0}")]
    Internal(String),
}
