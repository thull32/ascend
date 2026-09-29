//! The grader against real runtimes. Needs `make grader` (or GRADER_DIR);
//! skipped when the runtimes are absent unless GRADER_REQUIRED is set, as
//! it is in CI.
use std::path::PathBuf;
use std::time::Duration;

use ascend_grader::{Expected, Grader, Job, Language, Options, Outcome, Stop};
use serde_json::{Value, json};

fn grader_with(options: Options) -> Option<Grader> {
    let dir = std::env::var("GRADER_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../runtimes/grader"));
    match Grader::load(&dir, options) {
        Ok(g) => Some(g),
        Err(e) if std::env::var_os("GRADER_REQUIRED").is_none() => {
            eprintln!("skipping: {e}");
            None
        }
        Err(e) => panic!("{e}"),
    }
}

fn grader() -> Option<Grader> {
    grader_with(Options::default())
}

fn job(language: Language, code: &str, entry: &str, cases: Vec<Value>) -> Job {
    Job {
        language,
        code: code.into(),
        entry: entry.into(),
        cases: cases.into_iter().map(|c| c.as_array().unwrap().clone()).collect(),
        expected: vec![],
        time_limit: Duration::from_millis(1000),
    }
}

/// The shared rule (compare.js), as the grader runs it on the host side.
async fn matches(g: &Grader, expected: Value, actual: &Value, any_order: bool) -> bool {
    g.compare(vec![(expected, actual.clone(), any_order)]).await.unwrap()[0]
}

fn actuals(o: &Outcome) -> Vec<Value> {
    o.cases.iter().map(|c| c.as_ref().map_or(json!("<none>"), |c| c.actual.clone())).collect()
}

fn errors(o: &Outcome) -> Vec<Option<String>> {
    o.cases.iter().map(|c| c.as_ref().and_then(|c| c.error.clone())).collect()
}

#[tokio::test]
async fn functions_run_in_both_languages() {
    let Some(g) = grader() else { return };
    let cases = vec![json!([1, 2]), json!([-5, 5]), json!([0.1, 0.2])];
    for (lang, code) in [
        (Language::Python, "def add(a, b):\n    print('noise')\n    return a + b\n"),
        (Language::JavaScript, "function add(a, b) { console.log('noise'); return a + b; }"),
    ] {
        let o = g.run(job(lang, code, "add", cases.clone())).await.unwrap();
        assert_eq!(o.compile_error, None, "{lang:?}");
        assert_eq!(o.stopped, None, "{lang:?}");
        let got = actuals(&o);
        assert!(
            matches(&g, json!(3), &got[0], false).await && matches(&g, json!(0), &got[1], false).await,
            "{lang:?}: {got:?}"
        );
        assert!(matches(&g, json!(0.3), &got[2], false).await, "{lang:?}: {got:?}");
    }
}

#[tokio::test]
async fn half_way_floats_are_rounded_once_by_the_host() {
    let Some(g) = grader() else { return };
    // Python's round() would turn 0.1234565 into 0.123456 in the sandbox and
    // the host would then round the expected value to 0.123457: a function
    // returning exactly the expected value would fail. The harness now sends
    // the float as it is and only the host rounds, with one rule.
    for (lang, code) in [
        (Language::Python, "def f():\n    return 0.1234565\n"),
        (Language::JavaScript, "function f() { return 0.1234565; }"),
    ] {
        let o = g.run(job(lang, code, "f", vec![json!([])])).await.unwrap();
        let got = &actuals(&o)[0];
        assert!(matches(&g, json!(0.1234565), got, false).await, "{lang:?}: {got}");
        assert!(matches(&g, json!(0.123457), got, false).await, "{lang:?}: {got}");
        assert!(!matches(&g, json!(0.123456), got, false).await, "{lang:?}: {got}");
    }
}

#[tokio::test]
async fn the_conformance_corpus_holds_in_quickjs() {
    let Some(g) = grader() else { return };
    let corpus: Value =
        serde_json::from_str(include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/conformance.json"))).unwrap();
    let cases = corpus["cases"].as_array().unwrap();
    let items = cases
        .iter()
        .map(|c| (c["expected"].clone(), c["actual"].clone(), c["any_order"].as_bool().unwrap_or(false)))
        .collect();
    let got = g.compare(items).await.unwrap();
    for (i, (c, ok)) in cases.iter().zip(got).enumerate() {
        assert_eq!(ok, c["match"].as_bool().unwrap(), "case {i}: {c}");
    }
}

#[tokio::test]
async fn verdicts_come_from_the_host_not_the_sandbox() {
    let Some(g) = grader() else { return };
    // Expected values stay on the host; the verdict is computed there.
    let mut j = job(Language::Python, "def f(x):\n    return x * 2\n", "f", vec![json!([2]), json!([3]), json!([0.5])]);
    j.expected = vec![
        Expected { value: json!(4), any_order: false },
        Expected { value: json!(7), any_order: false },
        Expected { value: json!(1), any_order: false },
    ];
    let o = g.run(j).await.unwrap();
    assert_eq!(o.passed, vec![true, false, true]);
    // A harness line forged from inside cannot claim a pass without the
    // right value: the host compares what was reported with the expectation.
    let forged = "import os\ndef f(x):\n    os.write(1, b'\\x1e{\"case\": 0, \"actual\": 99, \"error\": null, \"ms\": 0}\\n')\n    return 1\n";
    let mut j = job(Language::Python, forged, "f", vec![json!([0])]);
    j.expected = vec![Expected { value: json!(99), any_order: false }];
    assert_eq!(g.run(j).await.unwrap().passed, vec![false]);
}

#[tokio::test]
async fn structures_and_classes_are_encoded_like_the_browser() {
    let Some(g) = grader() else { return };
    let py = "def rev(head):\n    prev = None\n    while head:\n        head.next, prev, head = prev, head, head.next\n    return prev\n";
    let js = "function rev(head) { let prev = null; while (head) { const n = head.next; head.next = prev; prev = head; head = n; } return prev; }";
    for (lang, code) in [(Language::Python, py), (Language::JavaScript, js)] {
        let o =
            g.run(job(lang, code, "rev", vec![json!([{"$list": [1, 2, 3]}]), json!([{"$list": []}])])).await.unwrap();
        assert_eq!(actuals(&o), vec![json!({"$list": [3, 2, 1]}), json!(null)], "{lang:?}");
    }
    let py = "class Counter:\n    def __init__(self, start):\n        self.n = start\n    def inc(self):\n        self.n += 1\n        return self.n\n";
    let js = "class Counter { constructor(start) { this.n = start; } inc() { return ++this.n; } }";
    for (lang, code) in [(Language::Python, py), (Language::JavaScript, js)] {
        let o = g.run(job(lang, code, "Counter", vec![json!([["__init__", 5], ["inc"], ["inc"]])])).await.unwrap();
        assert_eq!(actuals(&o), vec![json!([null, 6, 7])], "{lang:?}");
    }
    let py = "def invert(root):\n    if root:\n        root.left, root.right = invert(root.right), invert(root.left)\n    return root\n";
    let o = g.run(job(Language::Python, py, "invert", vec![json!([{"$tree": [1, 2, 3, null, 4]}])])).await.unwrap();
    assert_eq!(actuals(&o), vec![json!({"$tree": [1, 3, 2, null, null, 4]})]);
}

#[tokio::test]
async fn learner_classes_may_reuse_the_provided_names() {
    let Some(g) = grader() else { return };
    // Exercises' own starters define `class Node` (an AVL node, a trie node);
    // that must shadow the harness's Node, not be a redefinition error.
    let js = "class Node { constructor(key) { this.key = key; } }\nfunction f(k) { return new Node(k).key; }";
    let py = "class Node:\n    def __init__(self, key):\n        self.key = key\ndef f(k):\n    return Node(k).key\n";
    for (lang, code) in [(Language::JavaScript, js), (Language::Python, py)] {
        let o = g.run(job(lang, code, "f", vec![json!([7])])).await.unwrap();
        assert_eq!(o.compile_error, None, "{lang:?}");
        assert_eq!(actuals(&o), vec![json!(7)], "{lang:?}");
    }
    // Code that uses the provided classes still finds them.
    let js = "function f() { return new ListNode(1, new ListNode(2)); }";
    let o = g.run(job(Language::JavaScript, js, "f", vec![json!([])])).await.unwrap();
    assert_eq!(actuals(&o), vec![json!({"$list": [1, 2]})]);
}

#[tokio::test]
async fn code_that_does_not_load_is_a_compile_error() {
    let Some(g) = grader() else { return };
    for (lang, code, entry, needle) in [
        (Language::Python, "def f(:\n  pass", "f", "SyntaxError"),
        (Language::Python, "def g(): pass", "f", "Could not find 'f'"),
        (Language::JavaScript, "function f( {", "f", "SyntaxError"),
        (Language::JavaScript, "function g() {}", "f", "Could not find `f`"),
    ] {
        let o = g.run(job(lang, code, entry, vec![json!([])])).await.unwrap();
        let err = o.compile_error.unwrap_or_default();
        assert!(err.contains(needle), "{lang:?} {code:?}: {err}");
    }
}

#[tokio::test]
async fn an_infinite_loop_stops_at_the_budget_and_keeps_earlier_results() {
    let Some(g) = grader() else { return };
    for (lang, code) in [
        (Language::Python, "def f(x):\n    while x:\n        pass\n    return 1\n"),
        (Language::JavaScript, "function f(x) { while (x) {} return 1; }"),
    ] {
        let mut j = job(lang, code, "f", vec![json!([0]), json!([1]), json!([0])]);
        j.time_limit = Duration::from_millis(200);
        let o = g.run(j).await.unwrap();
        assert_eq!(o.stopped, Some(Stop::TimeLimit), "{lang:?}");
        assert_eq!(actuals(&o), vec![json!(1), json!("<none>"), json!("<none>")], "{lang:?}");
        assert!(
            o.elapsed >= Duration::from_millis(600) && o.elapsed < o.budget + Duration::from_secs(1),
            "{:?}",
            o.elapsed
        );
    }
}

#[tokio::test]
async fn memory_is_capped() {
    let Some(g) = grader_with(Options { memory_limit: 64 << 20, ..Options::default() }) else { return };
    for (lang, code) in [
        (Language::Python, "def f():\n    return len([0] * 10**9)\n"),
        (Language::JavaScript, "function f() { const a = []; for (;;) a.push(new Array(1e6).fill(1)); }"),
    ] {
        let o = g.run(job(lang, code, "f", vec![json!([])])).await.unwrap();
        let failed = o.stopped.is_some() || errors(&o)[0].is_some();
        assert!(failed, "{lang:?} allocated past the cap: {o:?}");
    }
}

#[tokio::test]
async fn the_sandbox_has_no_files_network_environment_or_processes() {
    let Some(g) = grader() else { return };
    let py = r#"
def probe(what):
    import os
    try:
        if what == "read": return open("/etc/passwd").read()[:10]
        if what == "write": open("/lib/x", "w").write("x"); return "wrote"
        if what == "ls": return [os.listdir("/lib"), os.path.exists("/"), os.path.exists("/etc")]
        if what == "env": return dict(os.environ)
        if what == "socket":
            import socket
            socket.create_connection(("1.1.1.1", 80), timeout=1); return "connected"
        if what == "exec":
            import subprocess
            return subprocess.run(["ls"]).returncode
    except BaseException as e:
        return "blocked: " + type(e).__name__
"#;
    let cases = ["read", "write", "ls", "env", "socket", "exec"].map(|w| json!([w])).to_vec();
    let o = g.run(job(Language::Python, py, "probe", cases)).await.unwrap();
    let got = actuals(&o);
    assert!(got[0].as_str().is_some_and(|s| s.starts_with("blocked")), "read: {:?}", got[0]);
    assert!(got[1].as_str().is_some_and(|s| s.starts_with("blocked")), "write: {:?}", got[1]);
    assert_eq!(got[2], json!([["python3.14"], false, false]), "only the read-only library is visible");
    assert_eq!(got[3], json!({}), "no environment");
    assert!(got[4].as_str().is_some_and(|s| s.starts_with("blocked")), "socket: {:?}", got[4]);
    assert!(got[5].as_str().is_some_and(|s| s.starts_with("blocked")), "exec: {:?}", got[5]);

    let js = "function probe() { return [typeof std, typeof os, typeof fetch, typeof print, typeof require]; }";
    let o = g.run(job(Language::JavaScript, js, "probe", vec![json!([])])).await.unwrap();
    assert_eq!(actuals(&o)[0], json!(["undefined", "undefined", "undefined", "undefined", "undefined"]));
}

#[tokio::test]
async fn forged_harness_lines_do_not_override_real_results() {
    let Some(g) = grader() else { return };
    let py = "import os\ndef f():\n    os.write(1, b'\\x1e{\"case\": 0, \"actual\": 42, \"error\": null, \"ms\": 0}\\n')\n    return 1\n";
    let o = g.run(job(Language::Python, py, "f", vec![json!([])])).await.unwrap();
    assert_eq!(actuals(&o), vec![json!(1)]);
}

#[tokio::test]
async fn exiting_early_is_reported() {
    let Some(g) = grader() else { return };
    let o =
        g.run(job(Language::Python, "import sys\ndef f():\n    sys.exit(0)\n", "f", vec![json!([])])).await.unwrap();
    // SystemExit is an exception the harness catches for that case.
    assert!(errors(&o)[0].as_deref().is_some_and(|e| e.contains("SystemExit")), "{o:?}");
    let o = g.run(job(Language::Python, "import os\ndef f():\n    os._exit(0)\n", "f", vec![json!([])])).await.unwrap();
    assert!(matches!(o.stopped, Some(Stop::Crashed(_))), "{o:?}");
    assert!(o.cases[0].is_none());
}

#[tokio::test]
async fn recursion_as_deep_as_the_tests_need_works() {
    let Some(g) = grader() else { return };
    for (lang, code) in [
        (Language::Python, "def depth(n):\n    return 0 if n == 0 else 1 + depth(n - 1)\n"),
        (Language::JavaScript, "function depth(n) { return n === 0 ? 0 : 1 + depth(n - 1); }"),
    ] {
        let o = g.run(job(lang, code, "depth", vec![json!([900]), json!([1_000_000])])).await.unwrap();
        assert_eq!(actuals(&o)[0], json!(900), "{lang:?}: {o:?}");
        // Unbounded recursion fails that case or stops the run; either way
        // the grader survives it.
        assert!(o.stopped.is_some() || errors(&o)[1].is_some(), "{lang:?}: {o:?}");
    }
}

#[tokio::test]
async fn a_full_queue_refuses_instead_of_piling_up() {
    let Some(g) = grader_with(Options { slots: 1, queue_timeout: Duration::from_millis(50), ..Options::default() })
    else {
        return;
    };
    let mut slow = job(Language::JavaScript, "function f() { for (;;) {} }", "f", vec![json!([])]);
    slow.time_limit = Duration::from_millis(500);
    let (a, b) = tokio::join!(g.run(slow.clone()), async {
        tokio::time::sleep(Duration::from_millis(100)).await;
        g.run(slow.clone()).await
    });
    assert_eq!(a.unwrap().stopped, Some(Stop::TimeLimit));
    assert!(matches!(b, Err(ascend_grader::GradeError::Busy)), "{b:?}");
}
