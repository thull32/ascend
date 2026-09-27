---
slug: testing-strategy
title: "Testing strategy: the pyramid, contract and property tests, test data and flaky tests"
description: Decide which level each behaviour should be tested at, use contract and property-based tests where examples fall short, keep test data isolated, and treat flaky tests as the production bugs they usually are.
minutes: 30
difficulty: medium
tags: [testing, test-pyramid, contract-testing, property-based-testing, flaky-tests, ci, senior-craft]
---
A team has 4,000 tests and a 40-minute CI run. They still ship a release that breaks login, because every test that touched users mocked the database, and a migration renamed the column the real query used. Meanwhile about one CI run in thirty fails for no reason, so everyone has learned to click "re-run" without reading the failure. That reflex is how the next real regression gets merged.

The problem is not a lack of tests. It is a lack of strategy: no one decided what each test is supposed to prove, at what level, at what cost. Tests are an investment portfolio. This lesson is about allocating it, using this repository's actual test suite, gaps included, as the example.

## What a test buys, and what it costs

Every test trades off three properties, and no single kind of test maximises all of them:

- **Fidelity**: how closely the test's world resembles production. A test against a real Postgres has high fidelity; a mocked repository has low fidelity.
- **Speed**: how fast it runs, which decides how often people run it. A pure-function test runs in microseconds; a browser test in seconds.
- **Precision**: how well a failure points at the cause. A failing unit test names a function; a failing end-to-end test says "something between the button and the database".

On the cost side sit runtime, maintenance (how often the test breaks when behaviour did *not* change) and flakiness. A test that fails whenever someone refactors internals is a tax on change, not a safety net. The guiding rule: **test behaviour at the lowest level that can observe it with realistic fidelity**, and no lower.

## The pyramid and its successors

The classic test pyramid says: many unit tests, fewer integration tests, very few end-to-end tests. Its logic is cost: lower tests are faster and more precise. Its failure mode is the story above: thousands of unit tests with mocks that encode the author's assumptions about the database, and nothing that checks those assumptions.

Two later shapes correct for that. The "testing trophy" puts the bulk of effort into integration tests that exercise real modules together, on the grounds that they give the most confidence per test. The "honeycomb", proposed for microservices, argues the same: in a service whose main job is talking to a database and other services, the interesting bugs live in the integration, so test there.

The shapes disagree less than they seem. All of them say: push each check to the cheapest level that can *actually* catch the bug. For pure logic that is a unit test. For SQL, configuration and wiring it is an integration test against the real dependency, because a mock of your database can only confirm what you already believed.

```mermaid
flowchart TD
  N["A behaviour to protect"] --> Q1{"Can it fail without I/O?"}
  Q1 -->|yes| U["Unit or property test"]
  Q1 -->|no| Q2{"Is the risk in our SQL, config or wiring?"}
  Q2 -->|yes| I["Integration test against real Postgres"]
  Q2 -->|no| Q3{"Does another team or client depend on the shape?"}
  Q3 -->|yes| C["Contract test"]
  Q3 -->|no| E["End-to-end journey, only if business-critical"]
```

## How this repository tests itself

Read the suite as an inventory, the way you would when joining a team.

**Rust unit tests guard the sharp edges.** They are few and deliberately placed: `crates/core/src/auth/password.rs` checks that a hash starts with `$argon2id$`, that the right password verifies, the wrong one does not, and a missing user (`None`) never verifies. `crates/core/src/auth/token.rs` checks that two generated tokens differ, match the expected 43-character URL-safe format, and hash to 64 hex characters. `crates/core/src/content/blocks.rs` checks that quiz answers are stripped from the public body, which is a security property: the answer key must never reach the browser. `crates/api/src/middleware/csrf.rs` tests its `allowed()` decision directly, including the look-alike origin `https://ascend.example.evil.net` that an earlier prefix comparison would have accepted, and `crates/core/src/ai/anthropic.rs` asserts on the serialised request body that the stable system block carries the cache breakpoint and the volatile context block does not. The CSRF decision was deliberately pulled out of the Axum middleware into a plain function over a `HeaderMap` so that a unit test can reach every case without building a router.

**Content is validated as a test.** The curriculum you are reading is code. `crates/core/src/content/loader.rs` contains a test, `embedded_curriculum_loads`, whose comment calls it "the content CI": a broken front matter or dangling reference fails `cargo test`. CI runs the strict validator as its own step, and the production build goes further: the Dockerfile runs the compiled binary with `--check-content` (the flag is handled at the top of `crates/api/src/main.rs`), strict unless a preview build deliberately opts out, so a broken lesson fails the image build instead of the deploy. There is a `CONTENT_LENIENT=1` escape hatch for authors working concurrently, and the loader's doc comment is explicit that it is never set in CI.

**Frontend visualisers get invariant tests.** Each file in `web/src/viz/families/*.test.ts` feeds every visualiser its example input plus hostile edge inputs (zero or one bucket, forty identical keys, unknown operations) and asserts properties that must always hold: at least one frame, a frame count bounded by the engine's `MAX_FRAMES` cap, and a non-empty explanation on every frame. They do not assert exact output, so they survive changes to wording and layout while still catching crashes and runaway loops.

**API integration tests carry the most weight.** `crates/api/tests/api.rs` builds the *exact production router* against a real Postgres and drives it in-process with `tower::ServiceExt::oneshot`: no sockets, no browser, milliseconds per request. That is possible only because the api crate is also a library (`crates/api/src/lib.rs` says so in its first comment), which is architecture paying for testability. Read the test names and you have the system's promises: `login_errors_do_not_leak_account_existence`, `csrf_rejects_requests_without_header_or_with_foreign_origin`, `lesson_payload_hides_quiz_answers`, `comments_threading_and_authorisation`, `ai_features_degrade_gracefully_without_a_key`, `malformed_json_uses_the_api_error_shape`, `request_ids_are_server_controlled`. The session test even queries the `sessions` table to prove the raw cookie token is not stored, and `ai_budget_reservation_cannot_be_overshot_by_concurrency` tests a race the only way a race can be tested: it spawns 30 budget reservations at once against a limit of 10 and asserts that exactly 10 succeed. Two newer tests use the same technique on races a review found: `concurrent_registrations_for_one_email_yield_one_account_and_conflicts` fires four sign-ups for one email at once and asserts exactly one `200` and the rest `409` (registration used to check for the email and then insert, so two simultaneous requests could both pass the check and one surfaced as a `500`), and `a_learner_has_at_most_one_active_interview_and_solo_locks_the_coach` races five interview starts and asserts that exactly one is left active. These are the tests that would have caught the renamed column in the opening story.

Two design choices are worth copying, and a third was worth questioning until it was fixed. The suite loads a small fixture curriculum from `crates/api/tests/fixtures/content` instead of the real one, so editing a lesson can never break an API test. Every test registers its own uniquely named user, so tests share one database and run in parallel. The questionable one: when `TEST_DATABASE_URL` was unset, each test printed a notice and *passed*, so `cargo test` worked offline. CI's workflow provides a Postgres service container, so the tests really ran there, but nothing checked that they did: a workflow edit that dropped the variable would have turned the whole integration suite into silent passes. Now the skip path starts with `assert!(std::env::var_os("CI").is_none(), "TEST_DATABASE_URL must be set in CI")`. GitHub Actions sets `CI` on every runner, so offline laptops still skip and a misconfigured pipeline fails loudly. The general rule: a skipped test must never look like a passing one in the place that gates merges.

**End-to-end tests cover the journeys only a browser can.** `web/e2e/smoke.spec.ts` drives the real binary and a real Postgres with Playwright, on a desktop and a mobile (`Pixel 7`) profile from `web/playwright.config.ts`. It used to run only on demand, with `make e2e` against a running server, which meant a change that broke the browser journey could merge with every CI check green. CI now has an `e2e` job that runs after the Rust and web jobs pass: it starts Postgres as a service container, builds the SPA and the binary, starts the server, polls `/api/readyz` until it answers, runs `e2e/smoke.spec.ts` in Chromium and uploads the Playwright report and server log if anything fails. It covers register to roadmap to lesson completion, quiz grading and comments, running JavaScript and Python in the browser, and one security regression: a `PUT` with `origin: https://evil.example` and no custom header must get a 403. The integration suite checks the same CSRF rule below the browser; the end-to-end copy proves the real browser, cookies and SPA behave as the server expects. Security controls deserve tests at both levels because they are exactly what a refactor silently removes.

## Contract tests

When two teams (or a client and a server) depend on a shape, an end-to-end test across both is slow, flaky and runs too late. A **contract test** pins the shape at the boundary instead.

In **consumer-driven contract testing** (the model behind tools such as Pact), the consumer records the requests it makes and the responses it relies on. The provider's CI replays those expectations against the real provider. If the provider renames a field a consumer uses, the provider's own pull request fails, before anything is deployed.

Inside one repository the idea scales down. The contract between Ascend's SPA and API includes the error shape from the previous lesson, and the integration suite already pins parts of it over HTTP: an unknown endpoint returns code `not_found`, a forged request returns `csrf`, a disabled AI feature returns `ai_disabled`. A table-driven unit test beside the mapping in `crates/api/src/error.rs` would pin *every* variant, including the one that matters most:

```rust
#[tokio::test]
async fn error_contract_is_stable() {
    let cases = [
        (AppError::Validation("email is invalid".into()), 422, "validation_error"),
        (AppError::NotFound("lesson"), 404, "not_found"),
        (AppError::Internal("/srv/secret/path".into()), 500, "internal_error"),
    ];
    for (err, status, code) in cases {
        let res = ApiError(err).into_response();
        assert_eq!(res.status().as_u16(), status);
        let body = axum::body::to_bytes(res.into_body(), 1024).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["code"], code);
        assert!(!json["message"].as_str().unwrap().contains("secret"));
    }
}
```

The last assertion is the valuable one: it turns "internal details never leak" from a comment into a check.

## Property-based tests

An example-based test checks the cases you thought of. A **property-based test** states a rule that must hold for *all* inputs and lets a generator search for a counterexample. When it finds one, it **shrinks** it to a minimal failing input, so you debug `"À-"` instead of a 300-character string.

Good properties are rarely "the output equals X". They are shapes like these:

| Property | Example |
|---|---|
| Round trip | `decode(encode(x)) == x` for a pagination cursor |
| Idempotence | `slugify(slugify(s)) == slugify(s)` |
| Invariant | a visualiser never emits more frames than the engine's cap |
| Oracle / model | your open-addressing table agrees with a `dict` after any operation sequence |
| Metamorphic | sorting a shuffled copy gives the same result as sorting the original |

Heading anchors in lessons are generated twice. The server builds the table of contents with `headings` and `slugify` in `crates/core/src/content/blocks.rs`; the browser renders the Markdown, and `rehype-slug` (which uses github-slugger) puts an `id` on each heading. A table-of-contents link works only if the two agree. The first server version used its own rule: keep alphanumeric characters, lowercase them, collapse everything else into single dashes, trim a trailing dash. Its one example test (`"## Big-O: the intuition"` becomes `big-o-the-intuition`) passed, because on that input both rules agree. On many others they do not: github-slugger drops punctuation instead of turning it into a dash (`Why O(1) is a lie` is `why-o1-is-a-lie`, not `why-o-1-is-a-lie`), keeps underscores, turns every space into its own dash (`Two  spaces` is `two--spaces`), and numbers duplicate headings `-1`, `-2`. Those links silently went nowhere. The fix reimplemented github-slugger's rule, pinned each known disagreement as an example test (`heading_ids_match_github_slugger`), and made the site crawl in `web/e2e/crawl.spec.ts` check that every table-of-contents link lands on a heading.

Examples could only pin the disagreements someone had already noticed. The property that actually matters is an oracle property: for *every* heading text, the server's id equals the browser's. Sketched with Python's Hypothesis, where `slugify` is a port of the Rust function and `github_slug` stands for the reference implementation (in practice, the real github-slugger run through Node on the generated inputs):

```python
from hypothesis import given, strategies as st

@given(st.text())
def test_server_ids_match_the_browser(s):
    assert slugify(s) == github_slug(s)               # oracle: the browser's rule

@given(st.text())
def test_slugify_is_idempotent(s):
    assert slugify(slugify(s)) == slugify(s)          # a slug is its own slug
```

Notice what the old example-based mindset would have asserted instead: "no double dashes, no leading or trailing dash, only alphanumerics and dashes". Every one of those is false for github-slugger, so a property suite written from the old implementation's habits would have locked the bug in. Choose properties from the *requirement* (anchors must match the browser), not from the current code.

Unicode is where the surprises hide. Lowercasing can turn one character into two (the Turkish capital dotted I lowercases to `i` followed by a combining dot above), and whether that combining mark survives depends on how your predicate classifies it. github-slugger keeps it, so the current `slugify` keeps the combining-mark block explicitly rather than trusting a generic "is alphanumeric" check. A generator tries inputs like that within seconds; a human writing examples almost never does.

Rust has the same tooling (`proptest`, `quickcheck`); JavaScript has `fast-check`. The visualiser invariant tests above are property tests with a hand-picked generator, which is a fine place to start.

## Test data

Most brittle suites are brittle because of their data, not their assertions.

- **Each test creates what it needs.** Ascend's `web/e2e/helpers.ts` builds a unique email per registration (`uniqueEmail()` combines a timestamp and a random number), and the API integration tests register a fresh user per test, so tests never collide on the unique email constraint and can run against a database that other tests have already written to.
- **Fixture content, not production content.** The API tests load a tiny purpose-built curriculum, so they test the engine, not whatever lessons happen to exist this week.
- **Factories over shared fixtures.** A `make_user(role="admin")` builder with sensible defaults beats a shared `admin@example.com` row that ten tests mutate.
- **Isolation at the database.** Wrap each integration test in a transaction that is rolled back, give each test its own schema, or, as Ascend's API suite does, make every test's data unique so one shared database is harmless. Order-dependent tests are flaky tests waiting for a parallel runner.
- **Time and randomness are inputs.** `AuthService::authenticate` refreshes `last_seen_at` only when more than an hour has passed since the last touch. Testing that branch means controlling the clock, which argues for a clock port in exactly the place [architecture and boundaries](/learn/senior-craft/software-craft/architecture-and-boundaries) said ports pay off: slow or non-deterministic dependencies.
- **Never production data.** Copying production rows into fixtures copies personal data into every laptop and CI log. Generate data instead.

## Flaky tests are bugs

A flaky test produces different results on the same code. A well-known 2014 study of flaky tests in open-source projects found the largest causes were asynchronous waits, concurrency and dependence on test order; time, randomness, network and leaked resources make up much of the rest.

Every cause has a mechanical fix:

| Cause | Symptom | Fix |
|---|---|---|
| Fixed sleeps | Fails on a slow CI machine | Wait for a condition, not a duration |
| Shared state / order dependence | Passes alone, fails in the suite | Per-test data and teardown; randomise order to find it |
| Wall-clock time | Fails near midnight or across DST | Inject the clock; pin the timezone |
| Randomness | Fails one run in a thousand | Seed and log the seed |
| External services | Fails when a third party is slow | Fake at the boundary; test the real one in a separate, non-blocking job |

Playwright's web-first assertions are the first fix built in: `await expect(page.getByTestId("results")).toContainText(...)` polls until the condition holds or a timeout expires, instead of sleeping a guessed duration. Ascend's config also sets `retries: 0`. That is a policy choice: retries make a suite green while hiding the flake. Where a test is genuinely slow rather than flaky, the suite says so explicitly: the Pyodide test raises its own timeout to 180 seconds because the first run downloads the Python runtime.

A senior team's policy looks like this: a flaky test is **quarantined** (moved out of the blocking suite) with an owner and a deadline, flake rate is **measured** from CI history rather than guessed, and "passed on retry" is recorded as a failure signal, not a success. Measuring starts with a definition you can compute.

```exercise
id: find-flaky-tests
title: Find flaky tests in CI history
prompt: |
  CI history is a list of runs `[test_name, commit, passed]`, where `passed`
  is a boolean. A test is **flaky** if, on at least one commit, it both passed
  and failed. A test that fails on one commit and passes on a later one is a
  regression that got fixed, not a flake.

  Return the names of flaky tests, sorted alphabetically, each listed once.
languages: [python, javascript]
entry: find_flaky
starter:
  python: |
    def find_flaky(runs):
        # your code here
        return []
  javascript: |
    function find_flaky(runs) {
      // your code here
      return [];
    }
tests:
  - args: [[["login_works", "a1", true], ["login_works", "a1", false], ["search_finds_lesson", "a1", true]]]
    expected: ["login_works"]
  - args: [[["csrf_rejects", "a1", false], ["csrf_rejects", "a1", false], ["csrf_rejects", "b2", true]]]
    expected: []
    label: a fixed regression is not a flake
  - args: [[]]
    expected: []
    label: empty history
  - args: [[["z_test", "c3", true], ["a_test", "c3", false], ["z_test", "c3", false], ["a_test", "c3", true], ["m_test", "c3", true]]]
    expected: ["a_test", "z_test"]
    label: sorted output
  - args: [[["t", "a", true], ["t", "a", false], ["t", "b", false], ["t", "b", true]]]
    expected: ["t"]
    hidden: true
    label: flaky on two commits is listed once
  - args: [[["x", "a", true], ["x", "b", false], ["y", "a", true], ["y", "a", true]]]
    expected: []
    hidden: true
    label: mixed outcomes across different commits
hints:
  - "Group outcomes by the pair (test, commit), not by test alone."
  - "A group is flaky when it contains both true and false; collect those test names in a set."
```

## Reviewing a change for tests

When you review a pull request, ask what each new behaviour needs, not "are there tests":

- A new branch in pure logic: a unit test, or a property if the input space is large.
- A new query or migration: an integration test against real Postgres.
- A new endpoint or error: the error-contract table gains a row.
- A new user journey that makes money or protects users: one end-to-end test of the happy path.
- A bug fix: a regression test that **fails before the fix**. If you never saw it fail, you do not know that it tests anything.

The foundations track covers the single-function version of this discipline in [testing your own code](/learn/foundations/problem-solving/testing-your-own-code), and [verifying AI code](/learn/ai-assisted-engineering/tools-and-workflows/verifying-ai-code) applies it to code you did not write.

## Senior signals

- You describe tests by **what they prove and what they cost** (fidelity, speed, precision), not by counting them.
- You test SQL and wiring **against the real database**, and you can explain why a mocked repository cannot catch a renamed column.
- You reach for **contract tests** at team boundaries and **property tests** where the input space is large, and you can name a good property for a given function.
- You treat **flaky tests as bugs** with owners, quarantine them rather than retrying them, and measure flake rate from CI history.
- You put **security controls under test** (CSRF, authorisation, secret non-leakage) because refactors remove them silently.
- You require every bug fix to come with a test that **failed before the fix**.

## Check yourself

```quiz
- q: >-
    Every repository test in a service mocks the database client. A migration renames a column and production breaks, yet CI stayed green. What is the most direct fix?
  options: ["A coverage gate that fails the build below 100% of repository lines", "More unit tests around the repository, each with its own stricter mock", "An end-to-end browser test for every page that reads from that table", "Integration tests that run the real queries against migrated Postgres"]
  answer: 3
  explanation: >-
    The mocks encoded the old column name, so they could only confirm the author's assumption, and stricter mocks or full coverage of mocked code add no fidelity. Only a test that executes the real SQL against the real, migrated schema can catch the drift. Browser tests would catch it too, but slowly, late and imprecisely, which is why the integration level is the direct fix.
- q: >-
    Which is the best property to test for a function that encodes and decodes an opaque pagination cursor?
  options: ["decode(encode(x)) == x for every valid position x", "encode(x) finishes in under 1 ms for any input", "encode(x) is always exactly 43 characters long", "decode(s) returns a position for any string s"]
  answer: 0
  explanation: >-
    Round-trip is the defining property of an encoder/decoder pair and holds for every input, which is exactly what a generator can search. A fixed length is false for variable-length positions, a timing bound is a flaky benchmark rather than a property, and decode should reject garbage input with an error rather than return a position for everything.
- q: >-
    A Playwright test uses page.waitForTimeout(2000) before checking a result and fails about one run in fifty. What is the right fix?
  options: ["Replace the sleep with an assertion that waits for the result", "Raise the wait to 5000 ms so slow CI machines have enough time", "Enable retries: 2 so a single slow run no longer fails the build", "Skip the test on CI and keep running it locally before each merge"]
  answer: 0
  explanation: >-
    Fixed sleeps are the most common flake cause: too short on a slow machine, wasted time on a fast one. A web-first assertion polls for the condition, so the test becomes both faster and deterministic. A longer sleep only moves the failure rate, retries hide the flake (Ascend's Playwright config sets retries: 0 for that reason), and skipping it in CI removes the check from the place that gates merges.
- q: >-
    Why does Ascend's production build run the binary with --check-content in strict mode, in addition to the embedded_curriculum_loads unit test?
  options: ["It lets the server skip parsing the curriculum at every boot", "It shrinks the binary by dropping lessons that fail validation", "It replaces the CI validation step, which only runs in lenient mode", "It checks the exact content compiled into the binary that will ship"]
  answer: 3
  explanation: >-
    Checking the artifact you are about to ship closes the gap between "tests passed somewhere" and "this binary is valid". Found at boot, a content error fails the deploy; found in the build, it blocks the image before anything ships. It complements the CI step, which is strict too, rather than replacing it; nothing is dropped from the binary, and the server still parses the curriculum at every boot.
- q: >-
    Your team's CI retries failing tests up to twice and reports green if any attempt passes. What is the main risk?
  options: ["Flaky tests start failing more often because they run more times", "Real intermittent bugs, such as races in the product, look like noise", "Every run gets slower because each test is now executed three times", "Test order becomes fixed, so order-dependent bugs can no longer appear"]
  answer: 1
  explanation: >-
    Some flakes are real product bugs (races, timeouts) that users will hit, and automatic retries turn them into green builds with no signal. Only failing tests are retried, so passing runs are not slower, and retrying changes neither test order nor how often the underlying bug fires. If you retry at all, record a pass-on-retry as a flake event and track it.
```
