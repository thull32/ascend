//! Every practice problem's reference solution passes every test when the
//! server grades it, so the server's harness agrees with the content (and
//! with `scripts/validate_problems.py`, which runs the same solutions under
//! native CPython). Needs the grader runtimes; see `crates/grader/tests`.
use std::path::{Path, PathBuf};
use std::time::Duration;

use ascend_core::content::{ContentSource, load_curriculum};
use ascend_grader::compare::matches;
use ascend_grader::{Grader, Job, Language, Options};
use futures::StreamExt;

#[tokio::test(flavor = "multi_thread")]
async fn every_reference_solution_passes_on_the_server() {
    let dir = std::env::var("GRADER_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| Path::new(env!("CARGO_MANIFEST_DIR")).join("../../runtimes/grader"));
    let slots = std::thread::available_parallelism().map_or(2, |n| n.get()).clamp(1, 8);
    let grader =
        match Grader::load(&dir, Options { slots, queue_timeout: Duration::from_secs(600), ..Options::default() }) {
            Ok(g) => g,
            Err(e) if std::env::var_os("GRADER_REQUIRED").is_none() => return eprintln!("skipping: {e}"),
            Err(e) => panic!("{e}"),
        };
    let content = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content");
    let curriculum = load_curriculum(&ContentSource::Disk(content)).expect("content loads");
    let python_fence = regex::Regex::new(r"(?s)```python\n(.*?)```").unwrap();

    let jobs: Vec<_> = curriculum
        .problems
        .iter()
        .map(|p| {
            let code: Vec<&str> = python_fence.captures_iter(&p.solution).map(|c| c.get(1).unwrap().as_str()).collect();
            assert!(!code.is_empty(), "{}: no Python reference solution", p.slug);
            let job = Job {
                language: Language::Python,
                code: code.join("\n\n"),
                entry: p.signatures["python"].name.clone(),
                cases: p.tests.iter().map(|t| t.args.clone()).collect(),
                time_limit: Duration::from_millis(u64::from(p.time_limit_ms)),
            };
            (p.clone(), job)
        })
        .collect();
    assert!(jobs.len() > 100, "only {} problems loaded", jobs.len());

    let failures: Vec<String> = futures::stream::iter(jobs)
        .map(|(p, job)| {
            let grader = grader.clone();
            async move {
                let outcome = grader.run(job).await.expect("grader runs");
                if let Some(e) = outcome.compile_error {
                    return vec![format!("{}: {e}", p.slug)];
                }
                p.tests
                    .iter()
                    .enumerate()
                    .filter_map(|(i, t)| {
                        let run = outcome.cases.get(i).and_then(Option::as_ref);
                        match run {
                            Some(r) if r.error.is_none() && matches(&t.expected, &r.actual, t.any_order) => None,
                            Some(r) => Some(format!(
                                "{} test {i}: expected {}, got {} {}",
                                p.slug,
                                t.expected,
                                r.actual,
                                r.error.as_deref().unwrap_or("")
                            )),
                            None => Some(format!("{} test {i}: no result ({:?})", p.slug, outcome.stopped)),
                        }
                    })
                    .collect()
            }
        })
        .buffer_unordered(slots)
        .flat_map(futures::stream::iter)
        .collect()
        .await;
    assert!(failures.is_empty(), "{} failures:\n{}", failures.len(), failures.join("\n"));
}
