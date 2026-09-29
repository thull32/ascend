---
slug: testing-the-system
title: "Testing the system: from unit tests to validators that execute content"
description: Ascend's test portfolio layer by layer, why API tests run against a real PostgreSQL, how a strict loader caught silent YAML bugs, how a validator that executed content took down a machine before the server's grader took the job over, and what is still untested.
minutes: 40
difficulty: hard
tags: [case-study, testing, integration-tests, playwright, vitest, property-testing, resource-limits]
---
Ascend is a small team's product with a large surface: a Rust API with authentication and budgets, three AI products, nearly 350 lessons with embedded quizzes and exercises, 535 exercises and 180 practice problems with reference solutions, a catalogue of about 230 animations embedded more than 700 times, two code runners in the browser and a WebAssembly grader on the server. There is no QA team. Whatever confidence exists comes from automated checks, so the question is not "do we have tests" but "which checks buy the most confidence per minute of CI, and which failures would still ship".

This lesson reads the portfolio as it is (`crates/api/tests/*.rs`, `crates/grader/tests/sandbox.rs`, `crates/core/tests/grading_parity.rs`, the Rust unit tests, the Vitest suites, `web/e2e/*.spec.ts`, `web/playwright.config.ts`, `.github/workflows/ci.yml` and `nightly.yml`) and tells two incidents that shaped it: YAML that silently changed type, and a reference solution that ate a machine.

## The portfolio

| Layer | Where | What it proves | Runs in CI |
|---|---|---|---|
| Rust unit tests | 36 `#[test]` and `#[tokio::test]` functions in the `api` and `core` crates' `src` | Pure logic: role collapsing, the history window, heading ids, password and token helpers, quiz validation, CSRF decisions, error mapping, the boot migration plan, credential redaction, the GCRA step; plus the AI client against a one-shot local server | Yes |
| API integration | `crates/api/tests/api.rs` (36 tests) | The production router, every middleware layer, real PostgreSQL | Yes, with a Postgres service |
| AI routes | `crates/api/tests/ai.rs` (3 tests) | Against a stub Messages API: a streamed coach reply is saved with its token counts and settles its budget hold; a hang-up after the first frame still saves and bills the whole reply; a generated quiz parses and is billed | Yes |
| Shutdown | `crates/api/tests/shutdown.rs` (4 tests) | The bounded drain over real sockets, with a stand-in router | Yes |
| Grader | `crates/grader/tests/sandbox.rs` (15 tests); `crates/api/tests/grading_service.rs` (4) | Escapes, time, memory and stack limits, forged output, a full queue, the conformance corpus in QuickJS, learner classes named `Node`, browser-only APIs; the API grading through the service, a missing token refused, a busy service retried once, a replica that drops the request mid-flight retried with its `traceparent` (`2f1daaa`) | Yes, with the runtimes (`GRADER_REQUIRED=1` forbids skipping) |
| Grading parity | `crates/core/tests/grading_parity.rs` | All 1,430 reference solutions (535 exercises in Python and JavaScript, 180 problems in both) pass when the server grades them | Yes, `REQUIRE_ALL_SOLUTIONS=1`: a missing one fails |
| Content validation | `validate_content` example; `ascend-api --check-content` in the Docker build | Typed front matter, block syntax, every cross-reference | Yes, strict |
| Problem structure | `scripts/validate_problems.py` | Keys, slug, string hints, a hidden test and a Python Solution section; it no longer executes anything | Yes |
| Web unit | Vitest, 16 files: family tests beside the viz families, `viz/content.test.ts`, `viz/frames-immutable.test.ts`, `viz/VizBlock.test.ts`, `lib/markdown.test.ts`, `lib/sse.test.ts`, `runner/harness.test.ts` | Generators produce valid, pure, independent frames; every curriculum animation renders; no frame changes after it is recorded; malformed blocks become warnings; currency and maths parse; the SSE parser handles every line ending and chunk boundary; `compare.js` gives the corpus's answers in V8 | Yes |
| Types | `tsc -b` | The SPA typechecks | Yes |
| E2E smoke | `web/e2e/smoke.spec.ts` (14 tests) | Real browser, real server: pages, both runners and the shared harness, server grading, auth, CSRF, account deletion | Yes, desktop and mobile, against the production image |
| Content crawl | `web/e2e/crawl.spec.ts`, only with `CRAWL=1` | Every lesson and problem renders without errors, and every table-of-contents link lands | Nightly and on demand (`nightly.yml`), against the production image |
| E2E AI | `web/e2e/ai.spec.ts`, only with `E2E_AI=1` | Live coach and interview flows against the real model | No: opt-in |
| Screenshots | `screens*.spec.ts`, only with `SCREENSHOTS=1` | Material for visual review on desktop and mobile | No |

Read the shape before the details. The unit layer is thin, because most of the logic is either database semantics (tested at the API layer) or content (tested by validators). The two most distinctive layers are the ones most teams do not have: checks that *execute* the curriculum (every reference solution, graded by the production sandbox), and a live AI suite that costs money to run, now backed by a stub model in CI. And the most realistic layer, the browser, joined CI late and then moved onto the production image, a story of its own below. (For the general theory of choosing layers, see [Testing strategy](/learn/senior-craft/software-craft/testing-strategy).)

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
    let st = state::AppState::build(Arc::new(cfg), db.clone(), curriculum, grader()).expect("state");
    let id = uuid::Uuid::now_v7().as_u128();
    let client_ip = format!("fd00::{:x}:{:x}", (id >> 16) & 0xffff, id & 0xffff);
    Some(TestApp { router: app::build(st.clone()), db, state: st, client_ip })
}
```

`app::build` is the same function `main` uses, so every request in the tests passes through request IDs, tracing, the timeout, compression, security headers, the body limit, the rate limiter and CSRF enforcement. `tower::ServiceExt::oneshot` calls the router without binding a port, so tests are fast and need no free ports. Each test registers its own user with a UUIDv7 email, so the tests share one database and run in parallel without truncating tables between them. Sharing has a newer consequence: since the security rate limits moved into Postgres, every app built over that database charges the same buckets, so `test_app` gives each app its own client address from `fd00::/8`, sent in the header the test config trusts. A small fixture curriculum keeps the content under test stable while the real curriculum changes daily.

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

A mock would assert what you believe the database does. The real one asserts what it does. The tests read like a security checklist: cookies are `HttpOnly` and `SameSite=Lax`; wrong-password and unknown-email login responses are byte-identical; a mutating request without `X-Requested-With`, or with a foreign `Origin`, gets 403; lesson payloads contain no quiz answers or explanations; an `If-None-Match` with the lesson's ETag gets 304; a submission's claimed counts are ignored and the server's own grade recorded; AI endpoints return `ai_disabled` when no key is configured. The most distinctive are races, the part worth copying: 30 budget reservations against a limit of 10, four registrations for one email, five interview starts for one learner, twenty transcript appends to one interview and two racing finishes, two boots migrating at once, each fired concurrently (as spawned tasks or with `futures::future::join_all`) and each asserting the invariant rather than a particular winner. `replicas_share_the_security_limits` goes one step further: two routers over one database, as two replicas would be, must share one password allowance. `grading_freezes_the_transcript_and_a_failed_grade_reopens_the_interview` is sequential on purpose: it drives the service through each state (freeze, a refused late reply, a refused second click, reopen, retry) and checks the transcript length at every step. A concurrency fix that arrives without the concurrent test that would have caught it is a claim, not a fix.

Trace the budget race test, because its shape is reusable. The test config allows 10 requests a day; the test spawns 30 tasks that each call `reserve` for the same user, joins them, and keeps the holds that come back:

| Step | What happens | What it rules out |
|---|---|---|
| 1 | 30 tasks start; each opens a transaction and creates the day's row if it is missing | Nothing yet |
| 2 | Each runs `SELECT ... FOR UPDATE` on the row; the first takes the lock, the other 29 wait on it in turn | A mutex in Rust; the database serialises |
| 3 | Each waiter reads the row as committed by the one before it and checks `requests < 10`: 10 hold and commit, 20 roll back | Check-then-act overshoot, which would grant more than 10 |
| 4 | `assert_eq!(holds.len(), 10)`, then the stored `requests_used` must also be 10 | Refused requests that still incremented the counter |

It asserts the invariant, exactly ten, never which ten, so it cannot be flaky under a different scheduling order. It also survived a rewrite: written against the one-statement conditional upsert, it passed unchanged in shape when budget holds replaced that statement with a transaction (`bd0dcf0`), because it tests the promise, not the SQL.

Two honest caveats, one of them now closed. When `TEST_DATABASE_URL` is unset the tests print a notice and *pass*, so `cargo test` works offline. That used to be as true in CI as on a laptop, so a misconfigured job would have reported green having tested nothing. The code-review commit added the `assert!` you can see above: offline runs may still skip, but with `CI` set a missing database fails the run. A skip that is silent everywhere is a false green waiting to happen; a skip that is loud where it matters is a convenience. The other caveat is now closed. `api.rs` sets no API key and points the AI base URL at `127.0.0.1:9`, so it covers graceful degradation, the budget and the limiter in front of model calls, never a stream through a route; for a while two unit tests in `ai/anthropic.rs`, each replaying a canned response from a one-shot local server, were the only automated check of the client. Commit `70f15c7` promoted that idea to the routes: `crates/api/tests/ai.rs` starts a stub `POST /v1/messages` that streams "Hello, learner." in four deltas, a configurable delay apart, and records every request body. `a_reply_is_saved_and_billed_when_the_learner_hangs_up_mid_stream` reads one frame, drops the body as a closed tab would, and still expects the whole reply saved, usage of 120 input and 42 output tokens with no hold left, and the task set drained within 5 s, so a shutdown has nothing to wait for. Before this, that path was covered only by the live suite, which spends real money.

## Validators that execute content

The curriculum is code that happens to be written in Markdown and YAML. Ascend tests it like code, twice.

The **content loader** deserialises every front matter block into typed Rust structs, parses every `exercise`, `quiz` and `viz` block, and resolves every cross-reference (module prerequisites, the problem slugs a lesson lists, the lesson each problem points to). CI runs it strictly, and the Docker build runs it again with `ascend-api --check-content`, so a broken lesson fails the build, never the deploy. The **reference solutions** are executed too. Until `e47282a` the problem validator ran each problem's Python solution on the host against its tests with a Python copy of the comparison rule; now `grading_parity` has the server's grader run every exercise's and problem's solutions exactly as it runs a learner's code ([Running code in the browser](/learn/case-study-ascend/product-systems/running-code-in-the-browser) tells what that found), and `validate_problems.py` checks structure only.

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

The validator then limited itself before it ran anything:

```python
# scripts/validate_problems.py, before e47282a
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

and wrapped each test in `signal.alarm(10)` with `signal.alarm(0)` in a `finally`, catching `MemoryError`, `RecursionError` and `TestTimeout` as ordinary test failures.

The two limits catch different failures, and you need both. `RLIMIT_AS` caps the process's virtual address space, so a runaway allocation fails *inside* the process as a `MemoryError` instead of the kernel's OOM killer choosing a victim, which might be your editor, your database or the VM itself. It does nothing against a loop that spins without allocating. The alarm catches that one, by raising an exception at the next bytecode boundary; but it cannot interrupt a single long call into C code until that call returns, and it is far too slow for the doubling loop above, which exhausts memory in milliseconds.

There is a third lesson that no per-process limit fixes. Limits do not compose: twenty validators each allowed 2 GiB can still demand 40 GiB together. The machine-level protections are a concurrency limit (the authoring brief says to run at most one validation process at a time), a cgroup memory limit around the whole job, and `scripts/safe_py.sh`, which applies `ulimit -v` and a 60-second `timeout` to any ad-hoc Python run during authoring.

**After: the grader runs them.** Since the reference solutions moved into the server's WebAssembly sandbox, the same loop meets the grader's limits instead: 256 MiB of linear memory per run (`memory_is_capped` allocates past a smaller cap in both languages and expects the case to fail or the run to stop), an epoch deadline for a loop that spins, and `grading_parity` capping its concurrency at the machine's cores, at most 8. The limits that protected the host became the product's limits, tested once for learners and solutions alike.

## Vitest: property tests for animations

The previous module showed the visualisation tests in detail: the scenarios in the first system pack are run against hostile inputs and checked for invariants (bounded frame counts, notes that are non-empty and never contain `undefined` or `NaN`, messages only between nodes that exist, a final `done` frame), plus purity and snapshot independence by reference. They are property tests in spirit, with a hand-picked input matrix instead of a generator library, and they are cheap: the whole web suite runs in seconds in CI.

The newest viz test shows how a review finding becomes a guard. The case study measured two generators whose frames changed after they were recorded, invisible to every reference check. Commit `7066802` fixed both and added `frames-immutable.test.ts`, which wraps `Frames.prototype.push`, records each frame's JSON as it is pushed, and compares it after the run, for every catalogue algorithm and every curriculum block (954 cases when it landed); with the old lines restored it flags eight. Its sibling `VizBlock.test.ts` feeds malformed specs and asserts `runSpec` returns an error instead of throwing. The exercise at the end of this lesson asks you to write the invariant checker.

## Playwright: the tests that found real bugs

The smoke suite drives a real browser against a real server: landing page and a visualisation step, curriculum navigation, search, a JavaScript solution to Two Sum passing its tests in the browser, a graph "clone" that reuses input nodes being rejected, Python running through Pyodide and passing its tests through the harness the server also runs, the visualisation gallery rendering every family, registration through onboarding and progress, a solve graded on the server while a claimed result is ignored, quiz grading and comments, the CSRF rejection, "sign out everywhere" and account deletion. Each of those is a seam between systems that no unit test crosses.

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

### Before and after: which artifact the browser tests saw

When this track was first drafted, `ci.yml` had four jobs (Rust, problems, web, image) and none ran Playwright; the smoke suite ran only through `make e2e`, against a server someone had started by hand. The code-review commit (`008eee6`) added a fifth job, `e2e`, which built the server with `cargo build`, started it beside a Postgres service and ran `smoke.spec.ts` on the desktop and phone profiles. The layer that found real bugs guarded every push, but it tested `./target/debug/ascend-api` with development settings, not the image the `image` job built and production runs. The two shared source and lockfiles, not the build profile, the embedded `web/dist`, the distroless base or the production configuration.

Commit `8861312` folded the browser tests into the `image` job, so they run against the artifact itself:

1. Build the Dockerfile with `load: true`, passing the commit as `RAILWAY_GIT_COMMIT_SHA`.
2. Run the container with host networking against a Postgres service, with the image's `APP_ENV=production` defaults plus `COOKIE_SECURE=true` (Chromium treats `http://localhost` as a secure context, so production's `Secure` cookies still work).
3. Poll `/api/readyz` for up to 60 s and require its `build` field to equal the commit SHA, which proves the running binary is the one just built.
4. Run the smoke suite on desktop and mobile.
5. `docker stop --time 30`, then require exit code 0 within 25 s and "shutdown complete" in the log. In a distroless image the binary is PID 1 and must handle SIGTERM itself; this step is what would catch a regression in the drain that [Build and deploy](/learn/case-study-ascend/shipping/build-and-deploy) describes.

The crawl now has that schedule. It takes about 20 minutes, too long for every push, so `.github/workflows/nightly.yml` (`6e8d69a`) builds the same image at 06:17 UTC and on demand, starts it against Postgres and opens every lesson and problem, failing on anything that renders as an error or throws. The AI suite still runs only by hand; it belongs in a job with its own small budget.

## The pipeline, job by job

`.github/workflows/ci.yml` runs four jobs on every push to `main` and every pull request, with `RUSTFLAGS: -D warnings` so a warning fails the build, a read-only token, and every action pinned to a commit SHA:

| Job | Needs | Runs | Typical failure it catches |
|---|---|---|---|
| `rust` | Postgres 17 service; the grader runtimes, cached by the hash of `scripts/grader-runtimes.sh` | `cargo fmt --check`, Clippy, `cargo test --workspace` (unit, API, AI stub, shutdown, sandbox, grading-service and parity tests), strict `validate_content`, `cargo audit` | A lost update, a CSRF regression, a sandbox escape, an exercise that fails only on the server, a RustSec advisory |
| `problems` | Python 3.14 | `validate_problems.py` (structure), the quiz-order check, quiz statistics | A problem without a hidden test; a hint that YAML made a mapping |
| `web` | Node 24, pnpm | `pnpm audit --prod`, `tsc -b`, `vitest run`, `vite build` | A misnamed algorithm in a lesson; an SSE parse regression; a vulnerable production dependency |
| `image` | `rust`, `web`; Postgres | The production Docker build, cached; the container started, `readyz` checked for the commit, `smoke.spec.ts` on desktop and phone, a graceful stop | A Dockerfile break; `--check-content` failing in the build; Pyodide not starting; a page that throws; a drain that hangs |

The `needs` edges mean a Rust or web failure stops the expensive job from running at all, and Railway's `checkSuites: true` means none of it is advisory: a push to `main` deploys only after the suites pass ([Build and deploy](/learn/case-study-ascend/shipping/build-and-deploy)).

## What to test more

In priority order, with the failure each one would catch:

1. **The stub stream under shutdown and on the interview routes.** `ai.rs` covers the coach and quiz generation; a truncated stream, an interview reply, and a shutdown arriving while a stubbed stream is in flight (where `shutdown.rs` still uses a stand-in route) are not yet covered.
2. **Stronger assertions in the content scan**: `content.test.ts` runs every `viz` block on its real input, and aliasing now has its own test; a `NaN` check and a purity check would complete the set. A plain `undefined` check would misfire on the memory family's correct sentence about undefined behaviour.
3. **Unit tests for the runner's time budget and `WorkerHandle`**, the frontend logic with sharp edges and no tests: the budget formula, the exactly-once race between an answer and the timer, and `ready` resetting after a timeout.
4. **Learner-shaped values through both engines.** The corpus and the reference solutions pin today's cases; generated values (random nesting, floats near half-way points) run through `matches` in V8 and QuickJS would look for the next difference before a learner does.
5. **The live AI suite on a schedule**, with its own small budget, so the real model's behaviour is checked more often than by hand.

Eleven items have dropped off this list since it was first written, and they show what "done" looks like: a concurrent test for the budget (`ai_budget_reservation_cannot_be_overshot_by_concurrency`), a concurrent test for the transcript (`transcripts_freeze_when_an_interview_ends_and_appends_never_lose_entries`), Playwright in CI, the SSE parser's tests (`web/src/lib/sse.test.ts`, eight cases, one that splits a stream at every offset), a frame-immutability test over every animation, `an_abandoned_solo_interview_releases_the_coach_and_a_dead_grade_can_be_retried`, the shutdown drain's own tests (since `95b6623` and `8861312`), smoke against the built image, the stub model in the API tests (`70f15c7`), the nightly crawl (`6e8d69a`), and the cross-language comparison corpus, which became unnecessary when three of the four copies it was meant to hold together were deleted (`e47282a`). Notice what the remaining items have in common: each targets a seam (process and network, two languages, content and code, concurrent requests) rather than a function. The pure functions in this codebase are few and simple; the bugs live between things.

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| A suite that skips when its dependency is missing | CI green with the API tests never run | The job log shows "skipping API integration test" | Skip offline, fail when `CI` is set (in place) |
| A validator that executes content without limits | The machine runs out of memory during authoring; unrelated processes die | Many validator processes at once, one of them growing without bound | `RLIMIT_AS` and an alarm per test, one process at a time, a cgroup for the whole job |
| An exercise passes in the browser and fails on the server | Learners see "the server's check passed 7 / 8" on a correct answer | Grade the reference solution with `ascend-api --grade-solutions <prefix>` | A reference solution per target, required in CI (in place since `f29c337`) |
| E2E against a different artifact | Smoke passes, production fails to start | The smoke job ran a debug build; the image differs in profile, embedded SPA, base image and configuration | Run the smoke suite against the built image (in place since `8861312`) |
| A flaky end-to-end test hidden by retries | Intermittent production bugs that CI "never" shows | Retries turned red runs green | `retries: 0`, traces kept on failure |
| A concurrency fix tested sequentially | The race returns under load | No test fires the operations at once | Spawn N tasks, join, assert the invariant rather than a winner |

## Interviewer follow-ups

**"Why run API tests against a real Postgres rather than mocks?"** Model answer: the behaviour worth testing is database semantics: conditional upserts, a partial unique index, what lands in a column. A mock restates what the author believes; the real database checks it. Each test registers its own user (and its app its own client address, now that rate limits live in the database too), so 36 tests share one database and run in parallel without truncation, and the cost is a service container in CI. Common wrong answer: "integration tests are too slow", which confuses a real database with a deployed environment.

**"How do you test a race?"** Model answer: fire the operations concurrently (spawned tasks or `join_all`), then assert the invariant rather than a particular winner: exactly 10 of 30 reservations, one account and three 409s, one active interview, twenty entries after twenty appends. The test must fail against the old code, or it proves nothing. Common wrong answer: "add a sleep between the calls", which serialises exactly the thing under test.

**"Your validator executes untrusted reference solutions. How do you keep it from taking the machine down?"** Model answer: both limits, because they catch different failures. `RLIMIT_AS` turns a runaway allocation into a `MemoryError` inside the process, and an alarm stops a loop that spins without allocating. Then a machine-level bound, because per-process limits do not add up: one process at a time, or a cgroup around the job. Better still, if the product already has a sandbox, run the solutions in it, as Ascend now does: one set of limits, tested for learners and solutions alike. Common wrong answer: "a timeout", which a doubling allocation beats by several orders of magnitude.

**"What is still untested, and in what order would you fix it?"** Model answer: rank by seam. First the stubbed stream under shutdown and on the interview routes; then the stronger invariants on every embedded animation; then the runner's time budget; then generated values through both comparison engines; then the live AI suite on a schedule. Common wrong answer: "raise line coverage", which counts executed lines in pure functions while the bugs live between systems.

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
    A reference solution's grow loop allocates a larger array on every pass and never terminates. The old validator ran it on the host with RLIMIT_AS of 2 GiB and a 10-second alarm. Which limit stopped it then, and what stops it now?
  options: ["The kernel's OOM killer then; the grader's 20-second queue timeout now", "The alarm then; the grader's epoch deadline now", "The recursion limit then; the grader's 8 MiB wasm stack now", "RLIMIT_AS then, as a MemoryError; the grader's 256 MiB memory cap now"]
  answer: 3
  explanation: >-
    A doubling allocation reaches gigabytes in milliseconds, so a ten-second alarm or an epoch deadline is far too late. The address-space limit turned the allocation into an exception in the offending process instead of letting the OOM killer pick a victim. Since e47282a the reference solutions run in the server's WebAssembly sandbox, where each run's store is capped at 256 MiB of linear memory, so the growth fails inside the guest. The deadline is for loops that spin without allocating, and the loop is not recursive.
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
    It found a real remount bug and the per-IP throttling of learners behind one NAT, so deleting it throws away proven value. Exact-text assertions would make it flaky, and retries would hide the flakiness. A stub server moves the deterministic part (persistence, settlement after a hang-up) into every CI run, which crates/api/tests/ai.rs now does.
- q: >-
    A concurrency test fires 30 budget reservations at once against a limit of 10. Which assertion makes it a good test?
  options: ["Exactly 10 succeed and the stored count is 10, whichever ten they are", "At least one reservation is refused, which shows the limit is enforced", "The first 10 tasks spawned succeed and the last 20 are all refused", "All 30 finish within one second, which shows no request deadlocked"]
  answer: 0
  explanation: >-
    Asserting the invariant, exactly ten and a stored count of ten, holds under any scheduling order, so the test is deterministic, and it fails against a check-then-act version that grants more than ten. Spawn order does not decide which tasks win the row lock, so naming the winners would be flaky, and one refusal or a time bound would pass against the broken code too.
```
