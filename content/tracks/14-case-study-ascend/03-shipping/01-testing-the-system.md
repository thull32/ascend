---
slug: testing-the-system
title: "Testing the system: from unit tests to validators that execute content"
description: Ascend's test portfolio layer by layer, why API tests run against a real PostgreSQL, how validators that execute content caught silent YAML bugs and took down a machine, and what is still untested.
minutes: 40
difficulty: hard
tags: [case-study, testing, integration-tests, playwright, vitest, property-testing, resource-limits]
---
Ascend is a small team's product with a large surface: a Rust API with authentication and budgets, three AI products, nearly 350 lessons with embedded quizzes and exercises, 180 practice problems with reference solutions, a catalogue of about 230 animations embedded more than 700 times, and two code runners in the browser. There is no QA team, and the infrastructure code describes a single production service. Whatever confidence exists comes from automated checks, so the question is not "do we have tests" but "which checks buy the most confidence per minute of CI, and which failures would still ship".

This lesson reads the portfolio as it is (`crates/api/tests/api.rs`, the Rust unit tests, `scripts/validate_problems.py`, the Vitest suites, `web/e2e/*.spec.ts`, `web/playwright.config.ts`, `.github/workflows/ci.yml`) and tells two incidents that shaped it: YAML that silently changed type, and a reference solution that ate a machine.

## The portfolio

| Layer | Where | What it proves | Runs in CI |
|---|---|---|---|
| Rust unit tests | 29 `#[test]` and `#[tokio::test]` functions in `crates/core/src` and `crates/api/src` | Pure logic: role collapsing, streaks, the history window, heading ids, password and token helpers, quiz validation, CSRF decisions, error mapping, the boot migration plan, credential redaction, the embedded curriculum loads; plus the AI client against a one-shot local server | Yes |
| API integration | `crates/api/tests/api.rs` (24 tests) | The production router, every middleware layer, real PostgreSQL | Yes, with a Postgres service |
| Content validation | `validate_content` example; `ascend-api --check-content` in the Docker build | Typed front matter, block syntax, every cross-reference | Yes, strict |
| Problem validation | `scripts/validate_problems.py` | Every reference solution passes every one of its tests | Yes |
| Web unit | Vitest, 13 files: family tests beside the viz families, `viz/content.test.ts`, `lib/markdown.test.ts`, `lib/sse.test.ts` | Generators produce valid, pure, independent frames; every curriculum animation renders; currency and maths parse; the SSE parser handles every line ending and chunk boundary | Yes |
| Types | `tsc -b` | The SPA typechecks | Yes |
| E2E smoke | `web/e2e/smoke.spec.ts` | Real browser, real server: pages, both runners, auth, CSRF, account deletion | Yes, desktop and mobile, against a debug build |
| Content crawl | `web/e2e/crawl.spec.ts`, only with `CRAWL=1` | Every lesson and problem renders without errors, and every table-of-contents link lands | No: on demand |
| E2E AI | `web/e2e/ai.spec.ts`, only with `E2E_AI=1` | Live coach and interview flows against the real model | No: opt-in |
| Screenshots | `screens*.spec.ts`, only with `SCREENSHOTS=1` | Material for visual review on desktop and mobile | No |

Read the shape before the details. The unit layer is thin, because most of the logic is either database semantics (tested at the API layer) or content (tested by validators). The two most distinctive layers are the ones most teams do not have: validators that *execute* the curriculum, and a live AI suite that costs money to run. And the most realistic layer, the browser, has only recently joined CI, which is a story of its own below. (For the general theory of choosing layers, see [Testing strategy](/learn/senior-craft/software-craft/testing-strategy).)

## API tests against a real database

The integration tests build the real application state, run migrations once per process, and drive the production router in memory:

```rust
// crates/api/tests/api.rs — test_app
async fn test_app() -> Option<TestApp> {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        // Offline developer runs may skip; CI must never pass by skipping.
        assert!(std::env::var_os("CI").is_none(), "TEST_DATABASE_URL must be set in CI");
        eprintln!("TEST_DATABASE_URL not set; skipping API integration test");
        return None;
    };
    let cfg = config(&url);
    MIGRATED
        .get_or_init(|| async {
            let db = state::connect_db(&cfg).await.expect("connect");
            migration::Migrator::up(&db, None).await.expect("migrate");
        })
        .await;
    let db = state::connect_db(&cfg).await.expect("connect");
    let fixtures = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/content");
    let curriculum = load_curriculum(&ContentSource::Disk(fixtures)).expect("fixture content loads");
    let st = state::AppState::build(Arc::new(cfg), db.clone(), curriculum).expect("state");
    Some(TestApp { router: app::build(st.clone()), db, state: st })
}
```

`app::build` is the same function `main` uses, so every request in the tests passes through request IDs, tracing, the timeout, compression, security headers, the body limit, the rate limiter and CSRF enforcement. `tower::ServiceExt::oneshot` calls the router without binding a port, so tests are fast and need no free ports. Each test registers its own user with a UUIDv7 email, so the tests share one database and run in parallel without truncating tables between them. A small fixture curriculum keeps the content under test stable while the real curriculum changes daily.

Why a real Postgres instead of mocking the data layer? Because most of what is worth testing here *is* database behaviour. "Marking a lesson complete twice is idempotent" is a property of `INSERT ... ON CONFLICT DO UPDATE`. "The raw session token is never stored" is a property of what lands in a column:

```rust
// crates/api/tests/api.rs — auth_lifecycle_and_session_storage
// The raw token must not be stored: only its SHA-256.
let token = cookie.split_once('=').unwrap().1.to_string();
let rows = app
    .db
    .query_all_raw(Statement::from_sql_and_values(
        sea_orm::DatabaseBackend::Postgres,
        "SELECT count(*)::bigint AS n FROM sessions WHERE token_hash = $1",
        [token.clone().into()],
    ))
    .await
    .unwrap();
let n: i64 = rows[0].try_get("", "n").unwrap();
assert_eq!(n, 0, "raw session token found in the database");
```

A mock would assert what you believe the database does. The real one asserts what it does. The tests read like a security checklist: cookies are `HttpOnly` and `SameSite=Lax`; wrong-password and unknown-email login responses are byte-identical; a mutating request without `X-Requested-With`, or with a foreign `Origin`, gets 403; lesson payloads contain no quiz answers or explanations; an `If-None-Match` with the lesson's ETag gets 304; submissions with a test count that does not match the problem are rejected; AI endpoints return `ai_disabled` when no key is configured. The newest ones are races, which is the part worth copying: 30 budget reservations against a limit of 10, four registrations for one email, five interview starts for one learner, twenty transcript appends to one interview and two racing finishes, two boots migrating at once, each fired concurrently (as spawned tasks or with `futures::future::join_all`) and each asserting the invariant rather than a particular winner. The newest, `grading_freezes_the_transcript_and_a_failed_grade_reopens_the_interview`, is sequential on purpose: it drives the service through each state (freeze, a refused late reply, a refused second click, reopen, retry) and checks the transcript length at every step. A concurrency fix that arrives without the concurrent test that would have caught it is a claim, not a fix.

Trace the budget race test, because its shape is reusable. The test config allows 10 requests a day; the test spawns 30 tasks that each call `check_and_reserve` for the same user, joins them, and counts the `Ok`s:

| Step | What happens | What it rules out |
|---|---|---|
| 1 | 30 tasks start; each sends one conditional upsert | Nothing yet |
| 2 | The first to reach the row takes its lock; the other 29 wait on it in turn | A mutex in Rust; the database serialises |
| 3 | Each waiter re-checks `requests < 10` against the committed row: 10 succeed, 20 get no row back | Check-then-act overshoot, which would grant more than 10 |
| 4 | `assert_eq!(granted, 10)`, then the stored `requests_used` must also be 10 | Refused requests that still incremented the counter |

It asserts the invariant, exactly ten, never which ten, so it cannot be flaky under a different scheduling order.

Two honest caveats, one of them now closed. When `TEST_DATABASE_URL` is unset the tests print a notice and *pass*, so `cargo test` works offline. That used to be as true in CI as on a laptop, so a misconfigured job would have reported green having tested nothing. The code-review commit added the `assert!` you can see above: offline runs may still skip, but with `CI` set a missing database fails the run. A skip that is silent everywhere is a false green waiting to happen; a skip that is loud where it matters is a convenience. The other caveat has narrowed but stands. The API test config sets no API key and points the AI base URL at `127.0.0.1:9`, so the integration tests cover graceful degradation, the solo-interview lock, the budget and the per-session limiter in front of model calls, never a stream through a route. The client itself is now tested against a real socket: two unit tests in `ai/anthropic.rs` start a one-shot local HTTP server that replays a canned response, one a stream ending in a provider `error` event, one a 429, and check what reaches the caller. That is the stub-server idea at the smallest useful scale, and it is how the error-text fix was proven. The route-level code around it (the tracked persistence task, budget settlement after a disconnect, the SSE error event reaching the browser) is still covered only by the live, opt-in browser suite.

## Validators that execute content

The curriculum is code that happens to be written in Markdown and YAML. Ascend tests it like code, twice.

The **content loader** deserialises every front matter block into typed Rust structs, parses every `exercise`, `quiz` and `viz` block, and resolves every cross-reference (module prerequisites, the problem slugs a lesson lists, the lesson each problem points to). CI runs it strictly, and the Docker build runs it again with `ascend-api --check-content`, so a broken lesson fails the build, never the deploy. The **problem validator** goes further: it executes every reference solution in `content/problems/*.md` against every test case, using the same encoding rules as the browser harness.

### Incident: a colon that changed a type

YAML's most dangerous feature is that plain, unquoted scalars are parsed by shape. A hint written like this:

```yaml
hints:
  - Track the complement: target minus the current value.
```

is not a list containing a string. The `: ` makes the item a *mapping*, `{"Track the complement": "target minus the current value."}`. A dynamic loader such as Python's `yaml.safe_load` accepts it without complaint, and the bug surfaces later, somewhere else: a hint that renders as `[object Object]`, or a component that crashes on a type it did not expect.

The strict loader caught it, because the Rust front matter type says `hints: Vec<String>` and serde refuses a map where a string belongs. The Python validator carries an explicit check for the same mistake, with an error message that tells the author the fix:

```python
# scripts/validate_problems.py — validate
for i, h in enumerate(fm.get("hints", []) or []):
    if not isinstance(h, str):
        errors.append(f"{path}: hint {i} is not a string (a ': ' inside an unquoted YAML scalar makes a dict; wrap the hint in double quotes)")
for key in ("patterns", "lists", "companies"):
    if any(not isinstance(x, str) for x in (fm.get(key) or [])):
        errors.append(f"{path}: {key} must be a list of strings")
```

The content guide's YAML rules exist for the same reason: quiz questions and explanations always as `>-` folded blocks, options as double-quoted strings, hints quoted. The general lesson is about loaders, not YAML: **a schema-less loader converts type errors into data**, and data errors surface far from their cause. Deserialising into precise types at the boundary turns them back into errors, at build time, with a file name attached.

### Incident: the reference solution that took down a machine

The problem validator `exec`s code. During content authoring, many agents wrote problems in parallel and validated them as they went. One reference solution contained a resize loop that could never terminate, and it allocated a larger array on every iteration. It did not fail; it consumed memory until the whole machine was out, taking every other process on it down.

A loop of this shape is enough (illustrative, not the exact code):

```python
cap = len(self.slots)
while self.size > self.max_load * cap:
    self.slots = [None] * (2 * len(self.slots))   # the table doubles every pass...
    # ...but `cap` is never updated, so the condition can never become false
```

Each pass doubles the allocation, so it reaches gigabytes in well under a second. Compare it with the correct growth policy, where each resize changes the quantity the condition tests:

```viz
{"type": "hash-table", "algorithm": "resize", "buckets": 2, "operations": [["set", "a", 1], ["set", "b", 2], ["set", "c", 3], ["set", "d", 4], ["set", "e", 5]], "title": "A resize that terminates", "caption": "Each resize doubles the bucket count, which lowers the load factor the next check compares against. The runaway loop grew the array without changing what its condition measured."}
```

The validator now limits itself before it runs anything:

```python
# scripts/validate_problems.py
# Hard safety limits: a buggy reference solution must never take the machine
# down. 2 GiB of address space and 10 s wall clock per test case.
resource.setrlimit(resource.RLIMIT_AS, (2 * 1024 ** 3, 2 * 1024 ** 3))
sys.setrecursionlimit(20_000)


class TestTimeout(Exception):
    pass


def _alarm(_signum, _frame):
    raise TestTimeout("test exceeded 10 s")


signal.signal(signal.SIGALRM, _alarm)
```

and wraps each test in `signal.alarm(10)` with `signal.alarm(0)` in a `finally`, catching `MemoryError`, `RecursionError` and `TestTimeout` as ordinary test failures.

The two limits catch different failures, and you need both. `RLIMIT_AS` caps the process's virtual address space, so a runaway allocation fails *inside* the process as a `MemoryError` instead of the kernel's OOM killer choosing a victim, which might be your editor, your database or the VM itself. It does nothing against a loop that spins without allocating. The alarm catches that one, by raising an exception at the next bytecode boundary; but it cannot interrupt a single long call into C code until that call returns, and it is far too slow for the doubling loop above, which exhausts memory in milliseconds.

There is a third lesson that no per-process limit fixes. Limits do not compose: twenty validators each allowed 2 GiB can still demand 40 GiB together. The machine-level protections are a concurrency limit (the authoring brief now says to run at most one validation process at a time), a cgroup memory limit around the whole job, and `scripts/safe_py.sh`, which applies `ulimit -v` and a 60-second `timeout` to any ad-hoc Python run during authoring.

## Vitest: property tests for animations

The previous module showed the visualisation tests in detail: the scenarios in the first system pack are run against hostile inputs and checked for invariants (bounded frame counts, notes that are non-empty and never contain `undefined` or `NaN`, messages only between nodes that exist, a final `done` frame), plus purity and snapshot independence. They are property tests in spirit, with a hand-picked input matrix instead of a generator library, and they are cheap: the whole web suite runs in seconds in CI. The exercise at the end of this lesson asks you to write that invariant checker.

## Playwright: the tests that found real bugs

The smoke suite drives a real browser against a real server: landing page and a visualisation step, curriculum navigation, search, a JavaScript solution to Two Sum passing its tests in the browser, a graph "clone" that reuses input nodes being rejected, Python running through Pyodide, the visualisation gallery rendering every family, registration through onboarding and progress, quiz grading and comments, the CSRF rejection, and "sign out everywhere". Each of those is a seam between systems that no unit test crosses.

The configuration makes three deliberate choices:

```typescript
// web/playwright.config.ts
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
```

`retries: 0` means a flaky test fails loudly instead of being retried into green, which keeps flakiness visible as a bug to fix. Every test runs on a desktop and a phone profile, because the product is designed for phones. And traces are kept on failure, which turns "it failed in CI" into a replayable timeline.

The AI suite is opt-in because each run costs real tokens and depends on a live key. It asserts on structure and on loose semantic markers, never on exact text: the coach test waits for any of `entries`, `slots` or `buckets` to appear, and the interview tests wait for a second "Interviewer" bubble and an evaluation containing "Dimensions". That suite is what found the coach remount bug from the previous module, because only a real stream reproduces the timing of a navigation in the middle of a reply.

When this track was first drafted, `ci.yml` had four jobs (Rust, problems, web, image) and none of them ran Playwright; the smoke suite ran only through `make e2e`, against a server someone had started by hand. The code-review commit added a fifth job, `e2e`, which builds the SPA, builds the server with `cargo build`, starts it next to a Postgres service, waits for `/api/readyz`, installs Chromium and runs `smoke.spec.ts` on both the desktop and phone profiles, uploading the report and the server log on failure. The layer that found real bugs now guards every push.

Look closely at *what* it tests, though: `./target/debug/ascend-api`, a debug build compiled in the job, not the image that the `image` job builds and that production runs. The two share source and lockfiles but not the build profile, the embedded `web/dist` or the base image. Running the smoke suite against the built image would test the artifact itself. The AI suite belongs in a nightly job with its own small budget, not on every push, and so does the crawl, which takes too long for every push and is the only automated check that every table-of-contents link lands.

## The pipeline, job by job

`.github/workflows/ci.yml` runs five jobs on every push to `main` and every pull request, with `RUSTFLAGS: -D warnings` so a warning fails the build, a read-only token, and every action pinned to a commit SHA:

| Job | Needs | Runs | Typical failure it catches |
|---|---|---|---|
| `rust` | Postgres 17 service | `cargo fmt --check`, Clippy, `cargo test --workspace` (unit and API tests), strict `validate_content`, `cargo audit` | A lost update, a CSRF regression, a quiz with an out-of-range answer, a dependency with a RustSec advisory |
| `problems` | Python 3.14 | `validate_problems.py`, the quiz-order check, quiz statistics | A reference solution that fails its own tests; a hint that YAML made a mapping |
| `web` | Node 24, pnpm | `pnpm audit --prod`, `tsc -b`, `vitest run`, `vite build` | A misnamed algorithm in a lesson; an SSE parse regression; a vulnerable production dependency |
| `image` | `rust`, `web` | The production Docker build, cached | A Dockerfile or cargo-chef break; `--check-content` failing inside the build |
| `e2e` | `rust`, `web`; Postgres | A debug server started beside Postgres, `readyz` polled for 60 s, `smoke.spec.ts` on desktop and phone | Pyodide not starting; a page that throws in a real browser |

The `needs` edges mean a Rust or web failure stops the two expensive jobs from running at all, and Railway's `checkSuites: true` means none of it is advisory: a push to `main` deploys only after the suites pass ([Build and deploy](/learn/case-study-ascend/shipping/build-and-deploy)).

## What to test more

In priority order, with the failure each one would catch:

1. **The stub server, promoted to the API tests.** The one-shot server in the client's unit tests, pointed at by the integration config's AI base URL, would let the API tests drive a real stream through the routes: a disconnect mid-stream still persists the reply and records usage; a truncated stream still settles; shutdown waits for a stream in flight.
2. **A cross-language harness conformance corpus** run by the TypeScript harness, the Pyodide harness and `validate_problems.py`. The float drift between them was fixed by hand, and half-way rounding still differs.
3. **Stronger assertions in the content scan**: `content.test.ts` already runs every `viz` block on its real input; adding a `NaN` check, a purity check and a content-level aliasing check (each frame's JSON when pushed against the same frame at the end, which finds two live bugs today) would give every embedded animation more than the first system pack has. A plain `undefined` check would misfire on the memory family's correct sentence about undefined behaviour.
4. **Unit tests for the runner's time budget and `WorkerHandle`**, the frontend logic with sharp edges and no tests: the budget formula, the exactly-once race between an answer and the timer, and `ready` resetting after a timeout.
5. **Smoke against the built image, and the crawl on a schedule**, so the artifact that ships is the artifact that was tested, and table-of-contents links are checked more often than by hand.

Four items have dropped off this list since it was first written, and they show what "done" looks like: a concurrent test for the budget (`ai_budget_reservation_cannot_be_overshot_by_concurrency`), a concurrent test for the transcript (`transcripts_freeze_when_an_interview_ends_and_appends_never_lose_entries`), Playwright in CI, and the SSE parser's tests (`web/src/lib/sse.test.ts`, eight cases, two of them fed the exact bytes axum's own tests show its encoder producing, one that splits a stream at every offset). The first item has started to move too: the stub server exists, one layer down. Notice what the remaining items have in common: each targets a seam (process and network, two languages, content and code, concurrent requests) rather than a function. The pure functions in this codebase are few and simple; the bugs live between things.

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| A suite that skips when its dependency is missing | CI green with the API tests never run | The job log shows "skipping API integration test" | Skip offline, fail when `CI` is set (in place) |
| A validator that executes content without limits | The machine runs out of memory during authoring; unrelated processes die | Many validator processes at once, one of them growing without bound | `RLIMIT_AS` and an alarm per test, one process at a time, a cgroup for the whole job |
| E2E against a different artifact | Smoke passes, production fails to start | The smoke job ran a debug build; the image differs in profile, embedded SPA and base image | Run the smoke suite against the built image |
| A flaky end-to-end test hidden by retries | Intermittent production bugs that CI "never" shows | Retries turned red runs green | `retries: 0`, traces kept on failure |
| A concurrency fix tested sequentially | The race returns under load | No test fires the operations at once | Spawn N tasks, join, assert the invariant rather than a winner |

## Interviewer follow-ups

**"Why run API tests against a real Postgres rather than mocks?"** Model answer: the behaviour worth testing is database semantics: conditional upserts, a partial unique index, what lands in a column. A mock restates what the author believes; the real database checks it. Each test registers its own user, so 24 tests share one database and run in parallel without truncation, and the cost is a service container in CI. Common wrong answer: "integration tests are too slow", which confuses a real database with a deployed environment.

**"How do you test a race?"** Model answer: fire the operations concurrently (spawned tasks or `join_all`), then assert the invariant rather than a particular winner: exactly 10 of 30 reservations, one account and three 409s, one active interview, twenty entries after twenty appends. The test must fail against the old code, or it proves nothing. Common wrong answer: "add a sleep between the calls", which serialises exactly the thing under test.

**"Your validator executes untrusted reference solutions. How do you keep it from taking the machine down?"** Model answer: both limits, because they catch different failures. `RLIMIT_AS` turns a runaway allocation into a `MemoryError` inside the process, and an alarm stops a loop that spins without allocating. Then a machine-level bound, because per-process limits do not add up: one process at a time, or a cgroup around the job. Common wrong answer: "a timeout", which a doubling allocation beats by several orders of magnitude.

**"What is still untested, and in what order would you fix it?"** Model answer: rank by seam. First a stub model server in the API tests, so a real stream exercises persistence after a disconnect; then a conformance corpus for the three comparison rules; then the stronger invariants on every embedded animation; then the runner's time budget; then smoke against the built image. Common wrong answer: "raise line coverage", which counts executed lines in pure functions while the bugs live between systems.

## What mid-level engineers get wrong

- **Mocking the database to test database behaviour.** The mock passes and the race ships.
- **Letting a suite skip silently in CI.** Green without testing is worse than red.
- **Trusting a schema-less loader.** YAML turns a colon into a mapping, and the error surfaces far from its cause.
- **Putting one limit around executed code.** Memory limits miss spin loops, alarms miss fast allocations, and neither bounds the machine.
- **Retrying flaky end-to-end tests into green.** The flake is a bug you have agreed not to see.
- **Testing a different artifact from the one you ship.** A debug build is not the image.

## Exercise

```exercise
id: frame-invariant-checker
title: Write the invariant checker for animation frames
prompt: |
  Implement `frame_violations(frames, max_frames)`, the checks the Vitest suite
  runs on every generated animation. Each frame is an object with `note`
  (string), `tag` (string), `nodes` (list of node ids) and `messages` (list of
  `[from, to]` pairs). Return a list of violation strings, in this order:

  - If `frames` is empty, return `["no frames"]` and stop.
  - For each frame `i` in order: if the note is empty or only whitespace, add
    `"<i>: empty note"`; otherwise, if the note contains `undefined` or `NaN`,
    add `"<i>: bad note"`. Then for each message in order, add
    `"<i>: unknown node <id>"` for its `from` if it is not in `nodes`, then the
    same for its `to`.
  - If there are more than `max_frames + 1` frames, add `"too many frames"`.
  - If the last frame's tag is not `"done"`, add `"last frame not done"`.

  A valid animation returns an empty list.
languages: [python, javascript]
entry: frame_violations
starter:
  python: |
    def frame_violations(frames, max_frames):
        problems = []
        # your code here
        return problems
  javascript: |
    function frame_violations(frames, max_frames) {
      const problems = [];
      // your code here
      return problems;
    }
tests:
  - args: [[{"note": "start", "tag": "note", "nodes": ["a", "b"], "messages": [["a", "b"]]}, {"note": "end", "tag": "done", "nodes": ["a", "b"], "messages": []}], 600]
    expected: []
    label: a valid animation
  - args: [[], 600]
    expected: ["no frames"]
    label: no frames
  - args: [[{"note": "x is undefined", "tag": "note", "nodes": ["a"], "messages": [["a", "z"]]}, {"note": " ", "tag": "done", "nodes": ["a"], "messages": []}], 600]
    expected: ["0: bad note", "0: unknown node z", "1: empty note"]
    label: note and message checks in order
  - args: [[{"note": "ok", "tag": "step", "nodes": [], "messages": []}], 600]
    expected: ["last frame not done"]
  - args: [[{"note": "a", "tag": "x", "nodes": [], "messages": []}, {"note": "b", "tag": "x", "nodes": [], "messages": []}, {"note": "c", "tag": "done", "nodes": [], "messages": []}], 1]
    expected: ["too many frames"]
    hidden: true
    label: the cap allows max_frames plus one limit frame
  - args: [[{"note": "took NaN ms", "tag": "done", "nodes": ["a"], "messages": [["q", "a"]]}], 5]
    expected: ["0: bad note", "0: unknown node q"]
    hidden: true
  - args: [[{"note": "hop", "tag": "done", "nodes": ["a"], "messages": [["x", "y"]]}], 5]
    expected: ["0: unknown node x", "0: unknown node y"]
    hidden: true
    label: both endpoints are checked
hints:
  - "Handle the empty list first and return early; every later check assumes a last frame exists."
  - "Build a set of node ids per frame, then walk the messages in order, checking from before to."
  - "The frame-count and last-tag checks come after the loop, in that order."
```

## Senior signals

- You choose test layers by **where the behaviour lives**: database semantics are tested against the database, content against a strict loader, timing bugs in a real browser.
- You treat content and configuration as code, deserialise them into precise types at the boundary, and fail the build rather than the page.
- You put **both** a memory limit and a time limit around any code you execute, know which failure each catches, and know that per-process limits do not add up to a machine limit.
- You keep flaky tests visible (`retries: 0`) and assert on structure, not exact text, when the system under test is nondeterministic.
- You can list what is *not* tested and rank it by the seam it covers, you ship concurrency fixes with the concurrent test, and you make a suite fail loudly in CI when its dependency is missing.

## Check yourself

```quiz
- q: >-
    Why do Ascend's API tests run against a real PostgreSQL rather than a mocked repository layer?
  options: ["SeaORM's entities cannot be mocked, so a real database is the only option available", "The behaviours worth testing are database semantics that a mock would only restate", "Mocked repositories are slower than a local Postgres once many tests run in parallel", "GitHub Actions offers no way to run tests without a Postgres service container"]
  answer: 1
  explanation: >-
    ON CONFLICT upserts, partial unique indexes, cascades and what actually lands in a column are properties of Postgres. A mock encodes your belief about the database; a real one checks it. The session test that queries sessions for the raw token is a good example: no mock could prove the raw token never reaches the table.
- q: >-
    A reference solution's grow loop allocates a larger array on every pass and never terminates. The validator sets RLIMIT_AS to 2 GiB and a 10-second alarm per test. Which limit stops it, and how?
  options: ["The alarm, which interrupts the loop after ten seconds of wall-clock time", "RLIMIT_AS: the oversized allocation fails inside the process as a MemoryError", "sys.setrecursionlimit, which caps how deep the growth loop can go", "Neither; only the kernel's OOM killer can stop a runaway allocation"]
  answer: 1
  explanation: >-
    A doubling allocation reaches gigabytes in milliseconds, so the alarm is far too late. The address-space limit turns the allocation into an exception in the offending process instead of letting the OOM killer pick a victim. The alarm is for loops that spin without allocating, and the loop here is not recursive.
- q: >-
    Twenty validators run in parallel, each with RLIMIT_AS of 2 GiB, on a machine with 16 GiB of RAM. Is the machine safe?
  options: ["Yes: each process is individually limited, so the total is bounded too", "No: limits do not compose; bound the job with a cgroup or a queue", "Yes: the kernel shares memory pages between the Python processes anyway", "No: RLIMIT_AS has no effect on a process that is running Python code"]
  answer: 1
  explanation: >-
    RLIMIT_AS bounds one address space, so twenty of them may still demand 40 GiB together. The fix at the machine level is to bound the job, which is why the authoring rules say to run one validation process at a time and to use safe_py.sh for anything ad hoc. RLIMIT_AS works fine under Python; that is how MemoryError arises.
- q: >-
    A problem file has the hint line "- Use a map: value to index" without quotes. What does each loader do?
  options: ["Both loaders read it as a string, since plain YAML strings need no quotes at all", "The Rust loader turns the mapping into a string and carries on loading", "safe_load gives a dict for that hint; the typed Rust loader rejects it", "Both loaders reject the file, because the line is not valid YAML at all"]
  answer: 2
  explanation: >-
    An unquoted colon followed by a space makes a mapping. It is valid YAML, but not the shape you meant, so only a loader that knows the expected type can reject it: hints is Vec<String> in Rust. The problem validator also checks for it explicitly and tells the author to quote the hint.
- q: >-
    The live AI Playwright suite costs tokens and is not run in CI. What is the best way to keep its value?
  options: ["Delete it, because a model's output is nondeterministic and cannot be tested", "Schedule it with a small budget, and put a stub-server stream test in CI", "Make it assert the exact reply text, so that any regression is caught at once", "Run it on every push with retries enabled, so that flaky failures stay quiet"]
  answer: 1
  explanation: >-
    It found a real remount bug and the per-IP throttling of learners behind one NAT, so deleting it throws away proven value. Exact-text assertions would make it flaky, and retries would hide the flakiness. A stub server moves the deterministic part (persistence, settlement, error events) into every CI run.
- q: >-
    A concurrency test fires 30 budget reservations at once against a limit of 10. Which assertion makes it a good test?
  options: ["Exactly 10 succeed and the stored count is 10, whichever ten they are", "At least one reservation is refused, which shows the limit is enforced", "The first 10 tasks spawned succeed and the last 20 are all refused", "All 30 finish within one second, which shows no request deadlocked"]
  answer: 0
  explanation: >-
    Asserting the invariant, exactly ten and a stored count of ten, holds under any scheduling order, so the test is deterministic, and it fails against a check-then-act version that grants more than ten. Spawn order does not decide which tasks win the row lock, so naming the winners would be flaky, and one refusal or a time bound would pass against the broken code too.
```
