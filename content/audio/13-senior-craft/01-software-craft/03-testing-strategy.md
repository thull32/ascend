---
lesson: testing-strategy
source: fa009d4e2e54d30a
fit: great
desk:
  - "The table of each test level's measured cost on this repository"
  - "The contract-test example and the error-contract unit test"
  - "The shrinking script and its trace, from 20 characters to one"
  - "The flaky-test causes table and the rerun arithmetic"
  - "Exercise: find flaky tests in CI history"
---
## Introduction

A team has 4 thousand tests and a 40-minute CI run. They still ship a release that breaks login, because every test that touched users mocked the database, and a migration renamed the column the real query used. Meanwhile about one CI run in thirty fails for no reason, so everyone has learned to click "re-run" without reading the failure. That reflex is how the next real regression gets merged.

The problem is not a lack of tests. It is a lack of strategy: nobody decided what each test should prove, at what level, at what cost. Tests are an investment portfolio.

Four ideas. What a test buys and costs, with real numbers. Where each kind of test earns its place, including contract and property tests. How to keep test data from making a suite brittle. And why a flaky test is usually a bug.

## What a test buys, and what it costs

Every test trades off three properties, and no single kind maximises all of them. Fidelity: how closely the test's world resembles production. A real Postgres is high fidelity; a mocked repository is low. Speed: which decides how often people run it. A pure-function test runs in microseconds; a browser test in seconds. And precision: how well a failure points at the cause. A failing unit test names a function. A failing end-to-end test says "something between the button and the database".

On the cost side sit runtime, maintenance, meaning how often the test breaks when behaviour did not change, and flakiness. A test that fails whenever someone refactors internals is a tax on change, not a safety net.

Here is the rule to carry: test behaviour at the lowest level that can observe it with realistic fidelity, and no lower.

## The pyramid and its successors

The classic test pyramid says many unit tests, fewer integration tests, very few end-to-end tests. Its logic is cost. Its failure mode is the opening story: thousands of mocks encoding the author's assumptions about the database, and nothing that checks them.

Two later shapes correct for that. Kent C. Dodds's testing trophy puts most of the effort into integration tests of real modules together. The honeycomb, from Spotify engineers, argues that when a service mostly talks to a database and other services, the interesting bugs live in the integration.

They disagree less than they seem. All of them say: push each check to the cheapest level that can actually catch the bug. For pure logic, that is a unit test. For SQL, configuration and wiring, it is an integration test against the real dependency, because a mock of your database can only confirm what you already believed.

This repository measured the cost of each level in CI. Rust unit tests in the api crate: microseconds each. Integration tests against real Postgres: about 70 milliseconds each, run in parallel, after a database container that takes 12 seconds to start. Over a thousand frontend tests at about a millisecond each. And the browser tests: 2 to 7 seconds each, after about a minute and a half of building and installing before the first assertion. Each level up costs one to two orders of magnitude more per test. That is why the browser suite has 12 journeys and the frontend unit suite has over a thousand cases.

## How this repository spends its budget

Rust unit tests guard the sharp edges, and they are few and deliberately placed. A missing user must never verify a password. Quiz answers must be stripped from the public lesson body, which is a security property: the answer key must never reach the browser. The CSRF decision is tested directly, including the look-alike origin an earlier prefix comparison accepted.

The integration suite carries the most weight. It builds the exact production router against a real Postgres and drives it in-process: no sockets, no browser, milliseconds per request. Read its test names and you have the system's promises. Login errors do not leak account existence. Lesson payloads hide quiz answers. Submissions are graded on the server.

And it tests races the only way a race can be tested. One test spawns 30 AI budget reservations at once against a limit of 10, and asserts that exactly 10 succeed. Another fires four simultaneous sign-ups for one email and expects one success and three conflicts. These are the tests that would have caught the opening story's renamed column.

One choice in that suite was worth questioning until it was fixed. When the test database variable was unset, each integration test printed a notice and passed, so a workflow edit that dropped the variable would have turned the whole suite into silent passes. Now the skip path fails if it is running in CI. A skipped test must never look like a passing one in the place that gates merges.

End-to-end tests cover only the journeys a browser can, and they run against the exact production image, not a debug build. They include two security regressions: a forged request from a foreign origin must get a 403, and a request claiming 99 of 99 tests passed for a wrong solution must be graded by the server as failed. Security controls deserve tests at both levels, because a refactor removes them silently.

## Contract tests and property tests

When two teams, or a client and a server, depend on a shape, an end-to-end test across both is slow, flaky and runs too late. A contract test pins the shape at the boundary instead. In consumer-driven contract testing, the model behind tools like Pact, the consumer records the requests it makes and the responses it relies on, and the provider's CI replays them.

Picture the frontend relying on the CSRF error: status 403, code "csrf", and a message that can be any string. Rename the code, and the provider's own pull request fails. Reword the message, and it passes. That is the stable-code rule from API design, made executable.

An example-based test checks the cases you thought of. A property-based test states a rule that must hold for all inputs, and lets a generator search for a counterexample. When it finds one, it shrinks it to a minimal failing input. Good properties are rarely "the output equals X". They are shapes: a round trip, where decoding an encoded cursor gives back the original. Idempotence, where slugifying a slug changes nothing. An oracle, where your implementation agrees with a trusted reference.

Here is the real story. Heading anchors in Ascend's lessons are generated twice: by the server, for the table of contents, and by the browser, for the page. A link only works if the two agree. The server's first rule passed its one example test, because on that input both rules agreed. On many others they did not, and those links silently went nowhere.

The property that actually matters is an oracle: for every heading text, the server's ID equals the browser's. The lesson's shrinking demo found a 20-character failing string on the second try, and twelve evaluations shrank it to a single character: a subscript two. The server's rule accepted it as alphanumeric; the browser's dropped it. Unicode is where the surprises hide. And a shrunk counterexample is the regression test to keep.

## Test data

Most brittle suites are brittle because of their data, not their assertions.

Each test creates what it needs. Ascend's tests register a uniquely named user every time, so they share one database and run in parallel without colliding. Prefer factories, a builder with sensible defaults, over a shared admin row that ten tests mutate. Isolate at the database: a rolled-back transaction, a schema per test, or, as here, data unique per test.

Treat time and randomness as inputs. Ascend's tests control time through data rather than a clock: one backdates a session's last-seen time past the idle limit; another gives two learners time zones 25 hours apart, so their local dates differ whenever the test runs.

And never use production data. Copying production rows into fixtures copies personal data onto every laptop and into every CI log. Generate it instead.

## Flaky tests are bugs

A flaky test gives different results on the same code. A 2014 study classified the root causes of over 160 flaky-test fixes in Apache projects: asynchronous waits were 45 percent, concurrency 20 percent, and test-order dependence 12 percent.

Diagnosis starts with a number. Before I give it: a test fails 2 percent of the time. How many reruns on the same commit do you need to see at least one failure with 95 percent confidence?

[pause]

About 150. A flake of one in a thousand needs about 3 thousand. Ten green reruns catch a 2 percent flake only 18 percent of the time, so "I reran it ten times and it passed" rules out almost nothing. Running once single-threaded and once in parallel separates order dependence from everything else.

The fixes follow the causes. A fixed sleep fails on a slow CI machine: wait for a condition, not a duration. Playwright's web-first assertions poll until the condition holds. Shared state passes alone and fails in the suite: give each test its own data. Wall-clock time fails near midnight: inject the clock. Randomness fails one run in a thousand: log the seed and keep the case.

And the cause that matters most: a race in the product. Ascend's coach once dropped the first streamed reply of a new conversation, because creating the conversation remounted the page mid-stream. A test that flickered on that was reporting a real bug.

That is why Ascend's browser config sets retries to zero. Retries make a suite green while hiding the flake. A senior team quarantines a flaky test, out of the blocking suite, with an owner and a deadline. It measures flake rate from CI history rather than guessing. And it records "passed on retry" as a failure signal, not a success.

## In the interview

A follow-up the lesson expects: when is a mock the wrong tool?

[pause]

When the thing mocked is the thing most likely to be wrong: your SQL, your schema, your serialisation. A mock only confirms the author's belief. Fake slow, costly or non-deterministic vendors at the boundary instead. The wrong answer is "mock everything so tests are fast".

And: your CI takes 40 minutes; how do you cut it without losing confidence? Measure per job and per test first. Push checks down, so a browser test that only checks an API response becomes an integration test. Parallelise independent jobs, cache dependencies, and keep a small end-to-end set on every change, with the long tail on a schedule. Not "delete the slow tests", or "run them nightly only", which moves the failure to after the merge.

## Recap

Five things to remember. Describe tests by what they prove and cost, fidelity, speed and precision, and test at the lowest level that observes the behaviour realistically. Test SQL and wiring against the real database; a mock cannot catch a renamed column. Use contract tests at team boundaries and property tests where the input space is large, and keep every shrunk counterexample. Flaky tests are bugs: quarantine them with an owner, measure the rate, and never let a retry turn red into green. And every bug fix needs a test that failed before the fix.

At your desk: the measured cost table, the contract and error-contract tests, the shrinking trace, the flaky-test table and its arithmetic, and the flaky-test exercise.
