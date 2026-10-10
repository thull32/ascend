---
lesson: tour-of-the-repository
source: 26d774d0637f56b2
fit: great
desk:
  - "The repository map and the one-hour protocol tables"
  - "The boot sequence, step by step, with what each step changes and what happens when it fails"
  - "The composition root in state.rs, and the system diagram"
  - "Exercise: a dependency fitness function that finds forbidden crates reachable from core"
---
## Introduction

You join a team on Monday. By Wednesday you are reviewing a pull request against a service you have never seen, and on Friday someone in a design review asks whether it survives ten times the traffic. Nobody gives you a week to read the code. What separates a senior engineer here is not reading speed. It is knowing what to read, in which order, and what to be suspicious of.

This module practises that on a codebase you already know from the outside: Ascend itself. It is small enough to hold in your head, about 14 thousand lines of Rust and 23 thousand of TypeScript, 17 thousand of which are the visualisation engine. And it is real enough to contain trade-offs, shortcuts and a history of bugs you can read in its fix commits.

Three facts shape almost every other decision, so take them first. One process, nearly stateless: a single binary serves the JSON API and the built React app, and sessions, AI budgets and the security rate limits are rows in Postgres. Only a loose per-IP flood bucket lives in process memory, on purpose. Second, the hottest reads never touch the database. The curriculum is Markdown compiled into the binary and parsed once at boot, so serving a lesson is a hash lookup plus JSON serialisation. Third, learner code runs twice: in the browser for instant feedback, and again on the server in a WebAssembly sandbox, which records only its own verdict.

What follows: a one-hour protocol for reading any codebase, the one boundary that organises this backend, the decision to ship one binary, and what happened when the comments and the code disagreed.

## The one-hour protocol

The order is the method. Ten minutes on the README, the architecture document and the decision records. Five on the build manifests. Ten on the entry point, ten on the router, fifteen on one vertical slice from route to SQL, and the last ten on tests, CI and recent fix commits. Intent first, evidence last. Documentation records what someone believed when they wrote it; code and tests record what is true today.

Treat the docs as claims to verify. Ascend has six architecture decision records. Each lists the alternatives it considered, which is where the design actually lives, and ends with "revisit when" conditions: a second replica, content editors who do not use Git, a second model provider.

Write each claim down as a question. The architecture document used to say the service was stateless apart from the in-process rate limiter, and the first decision record said horizontal scaling needed that limiter moved to a shared store. Both were true, and they are why the security limits later moved, to Postgres rather than Redis. Is it stateless now? Nearly. The hourly sweeper runs in every process, harmlessly. The flood bucket is per process by design. And an in-flight AI reply lives in a task that shutdown waits for, up to 30 seconds.

Then check the manifest against the code, because that check has already paid off once. The manifests used to list moka, an in-memory cache, in both backend crates, and no source file used it. A dead dependency costs compile time and supply-chain surface, and it signals intent: someone planned a cache that was never built. A fix removed it. Manifests show what was planned; code shows what was done.

For the slice, pick the most common write: marking a lesson complete. The handler's signature is its contract: a session, three path segments, a JSON body, and exactly one service call. Fifteen minutes on one slice tells you more about a codebase's conventions than an hour of browsing directories.

## Boot order, and what the tests promise

Now the entry point, because boot order is a design decision. Configuration is read and validated first, so a missing variable is a crash loop with a clear message instead of a 500 an hour later. Then the database pool. Then migrations, under a Postgres advisory lock, applied to the shared schema. Then the curriculum is loaded. Then the services and the grader are built, and only then does the server bind its port. Migrations before binding means that a process passing its readiness probe has a current schema. And before any of this, the Docker build itself runs the binary in a content-check mode, so a broken lesson fails the build and nothing deploys.

There is a flaw in that order. Before I say it: which two steps are the wrong way round?

[pause]

Migrations and content loading. Loading the curriculum is pure and takes milliseconds. Migrating mutates a shared database. Cheap, side-effect-free checks belong first. Today it costs nothing, because the build already validated the embedded content. But point the content directory at a broken folder and the process would apply a migration and then crash-loop. 

Last ten minutes: tests. Ascend has 36 integration tests whose names read like a specification. Login errors do not leak account existence. The lesson payload hides quiz answers. The AI budget reservation cannot be overshot by concurrency. Replicas share the security limits. CI runs four jobs, the last of which runs the production image end to end in a real browser on desktop and mobile.

Anything not in that list is a hope. Three comments in the code made promises that no test checked: that shutdown lets in-flight AI replies finish, that an abandoned tab cannot lock the coach forever, and that a grade stuck for five minutes may be retried. All three were true on reading. All three are now pinned by tests. The shutdown drain first needed a refactor, because it lived inline in main; a later change moved it into its own module, so a test could supply its own trigger and deadlines. Code you cannot call from a test is a promise you cannot check.

And read the git log. Fix commits are a map of where a codebase has been fragile, written by the people who paid for it: a CSRF check that matched origins by prefix, a cascade that deleted other people's comments, a registration race that answered 500. Each returns later in this module.

## The core and api boundary

The backend is two crates with one rule, plus a leaf crate that runs learner code. Core is the domain: transport-agnostic, no Axum, no HTTP types. The API crate is a thin adapter that maps HTTP to core's services and back. Each service owns one bounded context, such as progress, quizzes, submissions, comments or interviews, and the API crate wires them together exactly once, in a single composition root. Every field there is a shared handle, so handing the whole state to each request costs a few reference-count increments.

Why it pays. A second binary already uses the boundary: a content validator that CI runs with no web server at all. Swapping Axum would touch only the API crate. And every business rule lives in one service instead of being re-checked in each handler.

What was rejected. First, one crate where handlers query the database directly: faster to start, but rules spread across handlers and drift apart. Second, full ports and adapters, with a repository trait per table and mocks in unit tests: for a one-maintainer codebase, the indirection costs more than it buys. Ascend chose the middle: a real domain crate, concrete SeaORM types inside it, and integration tests against a real Postgres.

What it costs. There are no fast unit tests of service logic with in-memory fakes. Pure functions, such as the streak calculation and the rate limiter's core step, have unit tests; everything else is tested through the API with a database. That is a defensible trade. Say it out loud.

Where the rule bends. Ask cargo for the dependency tree and you find http, hyper and even tower-http inside core, pulled in by reqwest for the Anthropic client. So the rule really means no inbound transport types in the domain: no extractors, no status codes, no request objects. Outbound clients inside the domain crate, the AI client, the mailer and the remote grader, are a reasonable shortcut at this size. At a larger size you would move them into their own crates and turn the rule into a CI check, because a rule enforced only by review decays.

## One binary, and what changes at 100x

The first decision record says a single Rust binary serves the API and the built front end, with the curriculum compiled in, and Postgres is the only stateful dependency. It rejects three alternatives, and you will argue each in design reviews. Putting the front end on a CDN with a separate API service buys edge caching and independent deploys, but costs two pipelines, CORS and cross-origin cookies. Putting content in a database or a CMS lets non-developers edit, but content then needs migrations, backups and a sync story, and edits skip review and CI. And microservices for auth, content and AI: no team or traffic reason, and every hop adds latency and failure modes, in a system run by one person.

One claim deserves a correction. One binary does not remove version skew. A tab opened before a deploy keeps running the old JavaScript against the new API, and its lazily loaded chunks name files the new build no longer has. The server used to answer those with index.html; after a later fix it sends a 404 and the app reloads once. For the API itself, the mitigation is discipline, not architecture: additive changes, and fields old clients can ignore.

Now the 100x question, and the habit it teaches: separate what becomes incorrect from what merely gets slower. The in-process rate limiter was the one thing that would have been wrong with two replicas, because every limit silently multiplies by the replica count. So it moved first, while Ascend still ran one. The grading service and the connection budget followed, before the second replica. Everything left is merely slower, such as 15 database connections per replica, which needs PgBouncer past about four replicas.

The same order made the way back cheap. When idle capacity cost five times the app, Ascend returned to one replica with a flag, because nothing that kept the system correct depended on the second.

## When comments and code disagree

When this module was first drafted, reading Ascend closely turned up four comments the code did not keep. The most costly said heading ids followed the same rule as the front end. They did not, so some table-of-contents links went nowhere. All four were corrected in one fix. Three changed the comment to describe the code. One changed the code, because the claim mattered: the anchors now follow the front end's algorithm, with a test.

Drift never runs out. The security-headers comment said the Content Security Policy allowed the Pyodide CDN and nothing else, and that the code runners' workers got a separate, stricter policy. The policy also allowed PyPI and Google Fonts, and there was never a second policy. The comment was fixed, then drifted again when a later change dropped Google Fonts and left the comment naming it, and had to be fixed a second time. A comment that lists what the code does goes stale with every change to the list. And one wrong comment stays wrong on purpose, inside a shipped migration, because shipped migrations are never edited, comments included: the file is a record of what ran.

The senior response is neither outrage nor indifference. Trust the code, fix the comment in the same change, and where the claim matters, add a test that makes it true by construction.

## In the interview

Here is the follow-up you will get. What breaks first at 100 times the users?

[pause]

Separate incorrect from slower. The things that used to become wrong at two replicas are fixed: the security limits are shared in Postgres, and migrations, which used to race, queue behind an advisory lock. Only the loose flood bucket multiplies, by design. Then 15 connections per replica against the database's limit, past about four replicas. Then AI spend, bounded per user but not in total. Grading CPU moves to its own service with one flag. Serving lessons stays cheap, because the content is in memory. The wrong answer is "the database", with no number and no mechanism.

And a second one. Why integration tests against Postgres instead of repository traits and mocks? Because this codebase's correctness lives in SQL semantics: a row lock for the budget hold, a conditional upsert for the shared rate limits, a partial unique index for one active interview. A mock returns whatever the test author believed, so it would pass exactly the races those statements exist to stop.

## Recap

Four things to remember. Read in a fixed order, intent first and evidence last, and turn every documented claim into a question. Ascend's backend is organised by one boundary, no inbound transport types in the domain, which bends for outbound clients and should become a CI check. Order boot steps so that cheap, pure validation runs before anything irreversible. And at 100x, fix what becomes incorrect before what gets slower, which is why the rate limiter moved first.

At your desk: the repository map, the boot sequence table, the composition root, and the dependency fitness function exercise.
