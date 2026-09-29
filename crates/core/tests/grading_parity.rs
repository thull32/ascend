//! Every reference solution passes every test when the server grades it:
//! the Python and JavaScript solution for each lesson exercise
//! (solutions/exercises) and each practice problem (the Python in its
//! `## Solution`, plus solutions/problems/*.js). Same harness, time limits
//! and comparison rule as learners' submissions. Needs the grader runtimes;
//! see `crates/grader/tests`. `REQUIRE_ALL_SOLUTIONS=1` (CI) also fails on
//! a target with no solution.
use std::path::{Path, PathBuf};
use std::time::Duration;

use ascend_core::content::{ContentSource, load_curriculum};
use ascend_core::services::reference::{Scope, check};
use ascend_grader::{Grader, Options};

#[tokio::test(flavor = "multi_thread")]
async fn every_reference_solution_passes_on_the_server() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let dir = std::env::var("GRADER_DIR").map(PathBuf::from).unwrap_or_else(|_| root.join("runtimes/grader"));
    let slots = std::thread::available_parallelism().map_or(2, |n| n.get()).clamp(1, 8);
    let options = Options { slots, queue_timeout: Duration::from_secs(3600), ..Options::default() };
    let grader = match Grader::load(&dir, options) {
        Ok(g) => g,
        Err(e) if std::env::var_os("GRADER_REQUIRED").is_none() => return eprintln!("skipping: {e}"),
        Err(e) => panic!("{e}"),
    };
    let curriculum = load_curriculum(&ContentSource::Disk(root.join("content"))).expect("content loads");
    let report = check(&curriculum, &grader, &root.join("solutions"), None, Scope::All, slots).await;
    assert!(report.graded > 1000, "only {} targets found", report.graded);

    let require_all = std::env::var_os("REQUIRE_ALL_SOLUTIONS").is_some();
    let problems: Vec<String> = report
        .findings
        .iter()
        .filter(|f| require_all || !f.is_missing())
        .map(|f| {
            if f.is_missing() {
                format!("MISSING {} [{}]", f.target, f.language)
            } else {
                format!("FAIL {} [{}]: {}", f.target, f.language, f.failures.join("; "))
            }
        })
        .collect();
    assert!(problems.is_empty(), "{} problems:\n{}", problems.len(), problems.join("\n"));
}
