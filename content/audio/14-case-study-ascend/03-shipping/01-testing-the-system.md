---
lesson: testing-the-system
source: 2dc2c26d805264d0
fit: great
desk:
  - "The portfolio table, layer by layer, and the CI pipeline job by job"
  - "The test app setup and the budget race test, traced step by step"
  - "The validator's resource limits, and the steps that run the browser tests against the image"
  - "Exercise: write the invariant checker for animation frames"
---
## Introduction

Ascend is a small team's product with a large surface: a Rust API with authentication and budgets, three AI products, nearly 350 lessons with quizzes and exercises, 180 practice problems, about 230 animations, two code runners in the browser and a WebAssembly grader on the server. There is no QA team. Whatever confidence exists comes from automated checks.

So the question is not "do we have tests". It is: which checks buy the most confidence per minute of CI, and which failures would still ship?

This is the story of the portfolio as it stands, and of two incidents that shaped it: a colon that silently changed a type, and a reference solution that ate a machine.

## The shape of the portfolio

Read the shape before the details. The unit-test layer is thin, about three dozen functions, because most of the logic is either database behaviour, tested at the API layer, or content, tested by validators.

The two most distinctive layers are ones most teams do not have. Checks that execute the curriculum: every reference solution, 1,430 of them, graded by the production sandbox. And a live AI suite that costs real money to run, now backed by a stub model in CI.

The most realistic layer, the browser, joined CI late, and then moved onto the production image. That story comes later.

## API tests against a real database

The integration tests build the real application state, migrate once, and drive the production router in memory, without binding a port. Because it is the same router the server uses, every request passes through every middleware layer: request IDs, timeouts, security headers, the rate limiter, CSRF. Each test registers its own user with a unique email, so the tests share one database and run in parallel with no truncating between them.

Why a real Postgres instead of mocking the data layer? Because most of what is worth testing here is database behaviour. "Marking a lesson complete twice is idempotent" is a property of a conflict-handling insert. "The raw session token is never stored" is a property of what lands in a column, and the test checks exactly that, by querying for the raw token and expecting zero rows. A mock would assert what you believe the database does. The real one asserts what it does.

The part worth copying is the race tests. Thirty budget reservations against a limit of 10. Four registrations for one email. Twenty transcript appends to one interview. Each is fired concurrently, and each asserts the invariant rather than a particular winner.

Take the budget one. Thirty tasks each open a transaction and lock the user's row for the day. One takes the lock, the other 29 wait in turn. Each waiter reads the row as the one before left it, and checks there is room. Ten hold and commit, twenty roll back. Now, what should the test assert?

[pause]

Exactly ten succeed, and the stored count is ten, whichever ten they are. Never which ten, so it cannot be flaky under a different scheduling order. And it fails against a check-then-act version that grants more than ten. It even survived a rewrite: written against a single conditional upsert, it passed unchanged when budget holds replaced that statement with a transaction, because it tests the promise, not the SQL. A concurrency fix that arrives without the concurrent test that would have caught it is a claim, not a fix.

Two honest caveats. When the test database is not configured, the tests print a notice and pass, so they work offline. That used to be as true in CI as on a laptop, so a misconfigured job would have reported green having tested nothing. A review added one line: offline runs may skip, but in CI a missing database fails the run. A skip that is silent everywhere is a false green waiting to happen.

The other caveat was the AI routes. The API tests set no AI key, so no stream ever went through a route; only the live suite, which spends money, covered it. A later change added a stub model that streams "Hello, learner." in four pieces. One test reads a single frame, drops the connection as a closed tab would, and still expects the whole reply saved and billed.

## Incident: a colon that changed a type

The curriculum is code that happens to be written in Markdown and YAML, and Ascend tests it like code. A strict loader deserialises every lesson's front matter into typed Rust structures and resolves every cross-reference. It runs in CI, and again in the Docker build, so a broken lesson fails the build, never the deploy.

Here is why that matters. YAML parses plain, unquoted values by their shape. A hint like "Track the complement, colon, target minus the current value" is not a string. The colon followed by a space makes it a mapping, a dictionary with one key. A dynamic loader like Python's accepts it without complaint, and the bug surfaces later, somewhere else: a hint that renders as "object Object", or a component that crashes.

The strict loader caught it, because the Rust type says hints are a list of strings, and it refuses a map where a string belongs. The general lesson is about loaders, not YAML: a schema-less loader converts type errors into data, and data errors surface far from their cause. Deserialising into precise types at the boundary turns them back into errors, at build time, with a file name attached.

## Incident: the reference solution that took down a machine

The problem validator used to execute each problem's reference solution. During content authoring, many agents wrote problems in parallel and validated them as they went. One solution had a resize loop that could never end. It doubled the array on every pass, but never updated the capacity its condition tested. It did not fail. It consumed memory until the whole machine ran out, taking every other process down with it. Each pass doubles the allocation, so it reaches gigabytes in well under a second.

The validator then limited itself before running anything: a cap of 2 gigabytes of address space, and a 10-second alarm per test. Which of those stops the doubling loop?

[pause]

The memory cap. It turns a runaway allocation into an ordinary memory error inside the process, instead of the kernel's out-of-memory killer picking a victim, which might be your editor or your database. The alarm is far too slow for a loop that exhausts memory in milliseconds. But the alarm catches what the memory cap cannot: a loop that spins without allocating. You need both.

And there is a third lesson that no per-process limit fixes. Limits do not compose. Twenty validators each allowed 2 gigabytes can still demand 40 together. The machine-level protections are a concurrency limit, one validation at a time, a memory limit around the whole job, and a wrapper script that limits memory and time for any ad hoc Python run.

The ending: the reference solutions now run in the server's WebAssembly grader instead, where each run is capped at 256 megabytes of memory and a deadline. The limits that protected the host became the product's limits, tested once, for learners and solutions alike.

## The browser tests, and which artifact they saw

The browser suite drives a real browser against a real server: curriculum pages, both code runners, server grading with a claimed result ignored, sign-up, CSRF rejection, account deletion. Each is a seam no unit test crosses. Three choices in its configuration matter. Retries are zero, so a flaky test fails loudly instead of being retried into green. Every test runs on a desktop and a phone profile, because the product is designed for phones. And traces are kept on failure, which turns "it failed in CI" into a replayable timeline.

The opt-in live AI suite asserts loose semantic markers, never exact text. It is what found the coach page that dropped a reply mid-stream, because only a real stream reproduces that timing.

Now the before and after. When this track was first drafted, CI ran no browser tests at all. A review added a job that built a debug server and ran the smoke suite against it. Better, but it tested a debug binary with development settings, not the image production runs. A later change moved the browser tests into the image job. It builds the production image, starts it against Postgres, waits until the readiness check reports the exact commit just built, runs the smoke suite on desktop and phone, then stops the container and requires a clean exit within 25 seconds. A debug build is not the image. A full crawl of every lesson and problem takes about 20 minutes, so it runs nightly against the same image.

And none of it is advisory. Railway deploys a push only after CI passes.

## What is still untested

The lesson ranks the gaps by seam: a stubbed stream during shutdown and on the interview routes; a not-a-number check and a purity check on every animation; the browser runner's time budget; generated values through both comparison engines; and the live AI suite on a schedule. Eleven items have already dropped off that list. What the remaining ones share is that each targets a seam between processes, languages, content and code, or concurrent requests. The pure functions here are few and simple. The bugs live between things.

## In the interview

A follow-up the lesson expects: how do you test a race?

[pause]

Fire the operations concurrently, with spawned tasks or join-all, then assert the invariant rather than a particular winner: exactly 10 of 30 reservations, one account, twenty entries after twenty appends. And the test must fail against the old code, or it proves nothing. The common wrong answer is "add a sleep between the calls", which serialises exactly the thing under test.

And: why test against real Postgres rather than mocks? Because the behaviour worth testing is database semantics. A mock restates what the author believes; the database checks it. The wrong answer is "integration tests are too slow", which confuses a real database with a deployed environment.

## Recap

Four things to remember. Choose test layers by where the behaviour lives: database semantics against a database, content against a strict typed loader, timing bugs in a real browser. Test races by firing them concurrently and asserting the invariant. Put both a memory limit and a time limit around code you execute, and remember per-process limits do not add up to a machine limit. And never let a suite skip silently in CI, retry flakes into green, or test a different artifact from the one you ship.

At your desk: the portfolio and pipeline tables, the budget race test, the validator's limits and the image steps, and the invariant-checker exercise.
