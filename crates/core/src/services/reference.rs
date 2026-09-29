//! Reference solutions, graded by the server.
//!
//! Every exercise and problem must have a solution in each language it
//! offers, and each must pass every test when the server's grader runs it,
//! exactly as a learner's submission is run. Without this, an exercise whose
//! tests pass in the browser (V8, Pyodide) but not on the server (QuickJS,
//! CPython for WASI) would only be found by a learner.
//!
//! Layout, at the repository root (not embedded in the binary, never served):
//!
//! ```text
//! solutions/exercises/<lesson-slug>/<exercise-id>.py
//! solutions/exercises/<lesson-slug>/<exercise-id>.js
//! solutions/problems/<problem-slug>.js
//! ```
//!
//! A problem's Python reference is the code in its own `## Solution`
//! section, which learners can read. TypeScript is graded as the JavaScript
//! the browser strips it to, so the `.js` solution covers it.
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use ascend_grader::{Grader, Job, Language};
use futures::StreamExt;

use super::submissions::verdicts;
use crate::content::{Curriculum, TestCase};

/// Something wrong with one target in one language.
#[derive(Debug, Clone)]
pub struct Finding {
    /// `lesson-slug#exercise-id` or `problem-slug`.
    pub target: String,
    pub language: &'static str,
    /// Empty when the solution file is missing.
    pub failures: Vec<String>,
}

impl Finding {
    pub fn is_missing(&self) -> bool {
        self.failures.is_empty()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope {
    All,
    Exercises,
    Problems,
}

#[derive(Debug, Default)]
pub struct Report {
    pub graded: usize,
    pub findings: Vec<Finding>,
}

struct Case {
    target: String,
    language: &'static str,
    code: Option<String>,
    entry: String,
    tests: Vec<TestCase>,
    time_limit_ms: u32,
}

fn lang(name: &str) -> Option<(&'static str, Language, &'static str)> {
    match name {
        "python" => Some(("python", Language::Python, "py")),
        "javascript" => Some(("javascript", Language::JavaScript, "js")),
        _ => None, // typescript runs as its JavaScript
    }
}

fn python_fences(markdown: &str) -> Option<String> {
    static FENCE: std::sync::LazyLock<regex::Regex> =
        std::sync::LazyLock::new(|| regex::Regex::new(r"(?s)```python\n(.*?)```").expect("valid regex"));
    let code: Vec<&str> = FENCE.captures_iter(markdown).map(|c| c.get(1).map_or("", |m| m.as_str())).collect();
    (!code.is_empty()).then(|| code.join("\n\n"))
}

/// Grades every reference solution whose target starts with `filter` (all when
/// `None`), `parallel` at a time.
pub async fn check(
    curriculum: &Curriculum,
    grader: &Grader,
    solutions: &Path,
    filter: Option<&str>,
    scope: Scope,
    parallel: usize,
) -> Report {
    let read = |p: std::path::PathBuf| std::fs::read_to_string(p).ok();
    let mut cases = Vec::new();
    for lesson in curriculum.lessons.values().filter(|_| scope != Scope::Problems) {
        for ex in &lesson.exercises {
            let target = format!("{}#{}", lesson.summary.slug, ex.id);
            if filter.is_some_and(|f| !target.starts_with(f)) {
                continue;
            }
            for language in &ex.languages {
                let Some((name, _, ext)) = lang(language) else { continue };
                let path = solutions.join("exercises").join(&lesson.summary.slug).join(format!("{}.{ext}", ex.id));
                cases.push(Case {
                    target: target.clone(),
                    language: name,
                    code: read(path),
                    entry: ex.entry.clone(),
                    tests: ex.tests.clone(),
                    time_limit_ms: ex.time_limit_ms,
                });
            }
        }
    }
    for p in curriculum.problems.iter().filter(|_| scope != Scope::Exercises) {
        if filter.is_some_and(|f| !p.slug.starts_with(f)) {
            continue;
        }
        for (language, sig) in &p.signatures {
            let Some((name, _, ext)) = lang(language) else { continue };
            let code = match name {
                "python" => python_fences(&p.solution),
                _ => read(solutions.join("problems").join(format!("{}.{ext}", p.slug))),
            };
            cases.push(Case {
                target: p.slug.clone(),
                language: name,
                code,
                entry: sig.name.clone(),
                tests: p.tests.clone(),
                time_limit_ms: p.time_limit_ms,
            });
        }
    }
    cases.sort_by(|a, b| (&a.target, a.language).cmp(&(&b.target, b.language)));

    let grader = Arc::new(grader.clone());
    let results: Vec<Option<Finding>> = futures::stream::iter(cases)
        .map(|case| {
            let grader = grader.clone();
            async move {
                let Some(code) = case.code else {
                    return Some(Finding { target: case.target, language: case.language, failures: vec![] });
                };
                let (_, language, _) = lang(case.language).expect("known language");
                let job = Job {
                    language,
                    code,
                    entry: case.entry.clone(),
                    cases: case.tests.iter().map(|t| t.args.clone()).collect(),
                    time_limit: Duration::from_millis(u64::from(case.time_limit_ms)),
                };
                let failures = match grader.run(job).await {
                    Err(e) => vec![format!("grader error: {e}")],
                    Ok(outcome) => verdicts(&case.tests, &outcome)
                        .into_iter()
                        .filter(|v| !v.passed)
                        .map(|v| {
                            let t = &case.tests[v.index];
                            let got = outcome
                                .cases
                                .get(v.index)
                                .and_then(Option::as_ref)
                                .map_or_else(|| "no result".to_string(), |c| c.actual.to_string());
                            format!(
                                "test {}{}: expected {}, got {}{}",
                                v.index,
                                t.label.as_deref().map(|l| format!(" ({l})")).unwrap_or_default(),
                                t.expected,
                                got.chars().take(200).collect::<String>(),
                                v.error.map(|e| format!(" [{}]", e.lines().last().unwrap_or(""))).unwrap_or_default()
                            )
                        })
                        .collect(),
                };
                (!failures.is_empty()).then_some(Finding { target: case.target, language: case.language, failures })
            }
        })
        .buffer_unordered(parallel.max(1))
        .collect()
        .await;
    let graded = results.len();
    let mut findings: Vec<Finding> = results.into_iter().flatten().collect();
    findings.sort_by(|a, b| (&a.target, a.language).cmp(&(&b.target, b.language)));
    Report { graded, findings }
}
