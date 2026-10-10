---
lesson: build-and-deploy
source: c35003a8df9d0de0
fit: great
desk:
  - "The Dockerfile stage by stage, and the table of which layers each commit rebuilds"
  - "The railway.ts excerpt, the burn-rate alert arithmetic and the idle-memory table"
  - "The boot order in main and the rollout sequence diagram"
  - "Exercise: resolve the client IP behind a proxy"
---
## Introduction

Every deployment answers three questions, whether or not anyone asks them. What exactly is running in production? How did it get there? And how do you know it is healthy before users find out it is not? Most outages not caused by traffic come from a wrong answer to one of those: an artifact that differs from the one tested, a pipeline step that was skipped, a health check that checks the wrong thing.

Ascend's answers sound tidy: one Rust binary with the curriculum and the frontend compiled in, in a minimal image, deployed by Railway from main, and switched to only after its readiness check passes. This is the story of where each answer turned out weaker than it looked: a deploy path that skipped CI, a monitoring stack that only looked deployed, a bill five times too big, a rollback that could not boot, and a header any attacker could write.

## One artifact

The binary embeds everything it serves: the lessons, about 15 megabytes of Markdown, and the built single-page app, about 8. The rejected alternatives were a CDN-hosted frontend with a separate API, which means two pipelines, CORS and cross-origin cookies, and content in a database or CMS, which means migrations, backups, and content that drifts from the code that renders it.

What embedding buys is an entire failure class removed. There is no "the new binary is live but the content is stale", and no "the frontend expects a field the API does not have yet", because all three ship together. What it costs is that fixing a typo in a lesson is a full deploy. With cached layers, that takes about a minute.

Embedding had one trap. The macro that reads the files at compile time does not tell the Rust build tool which files it read. So an incremental build did not notice an edited lesson and reused a binary with the old lesson inside. A clean Docker build never hits that, which is why it survived. A small build script now tells the compiler to rerun when the content or the frontend changes.

## The Dockerfile, and why a content change takes a minute

A naive Rust Dockerfile copies the source and builds. Any change to any file then invalidates the layer that compiles every dependency, and a one-line fix rebuilds hundreds of crates.

cargo-chef splits that step in two. A planner stage reads only the manifests and the lockfile, and writes a recipe describing the dependency graph. The builder copies only that recipe and compiles the dependencies alone. Then it copies the real source and compiles the workspace.

So here is the question. A commit changes one route handler. The planner copies the source, so the planner re-runs. Does the dependency layer rebuild?

[pause]

No. The planner re-runs but writes a byte-identical recipe, and Docker keys the dependency layer on the content of the file it copies. So every dependency stays cached and only the workspace compiles. The only change that rebuilds every dependency is adding a crate, which changes the recipe. Explain a caching trick by which inputs invalidate which layer, not by its name.

Two more details. The build ends by running the freshly built binary against its own embedded curriculum, strictly, so a broken lesson cannot become an image. The build is the content gate. And the runtime image is distroless: system libraries, certificates, and not much else. No shell, no package manager, a non-root user. The cost is operational. You cannot open a shell inside the container to poke around, so debugging happens through logs, health endpoints, and running the same image locally.

## The deploy path that did not wait for CI

CI runs four jobs on every push: Rust formatting, lints and tests against a real Postgres, problem and quiz checks, the web typecheck and tests, and the image job, which builds the production image, runs the browser tests against it and requires a graceful stop. Actions are pinned to exact commits rather than movable tags, because a tag is a pointer its owner can move, and a commit hash is the code you reviewed.

Now compare that with what actually deployed. Until a later commit, Railway was told not to wait for the GitHub checks. It built and deployed every push to main straight away. The only gates on the path to production were inside the Dockerfile: the code compiled and the content validated. A failing API test, a broken animation, a failing reference solution showed up as a red CI run after the change was already live. Five jobs of evidence, and none of them on the path to production.

The fix was one word in the infrastructure file: check suites, true. The lesson is broader. Find the gates that exist, and check they are actually on the path.

One divergence remains. CI tests the image it built and throws it away; Railway builds its own from the same inputs. Close, not identical. At scale, you push the tested image and deploy that exact digest.

## Infrastructure as code, and the stack that only looked deployed

The whole project, Postgres, its volume, the API, a grading service and four observability services, is one TypeScript file. A plan command shows the diff against the live project, and secrets are never written in it. Everything else is reviewed like code. One entry used to say "whatever the dashboard says" for the content leniency flag, so a setting left over from an authoring sprint could quietly have disabled the content gate. It is now pinned to strict.

Then came scale work: a separate grading service, two API replicas, and a monitoring stack with Prometheus, Alertmanager, Jaeger and Grafana. The service-level objectives became burn-rate alerts: a 99.5 percent success target over 30 days is an error budget of 3.6 hours, and burning it 14.4 times faster than sustainable for an hour pages someone.

Every service came up green, and three were not doing their job. Prometheus evaluated the alert rules but had no block telling it where to send them, so no alert ever reached Alertmanager. Grafana could not search traces after a Jaeger upgrade removed the API it called. And two entries in the infrastructure file had a shape the config engine silently ignored: the database backup schedules, and the Prometheus volume. Metrics vanished at every deploy. Green proves a process runs, not that its output arrives. Fire a test alert, open a trace, restart Prometheus and look for yesterday.

## Paying for capacity nobody used

The scaled stack worked, and it sat idle. Railway bills memory held, every minute, traffic or not. Idle, the stack held about 2.7 gigabytes, Grafana alone about 920 megabytes. That came to about 27 dollars a month against about 5 for the app alone, on an invite-only site. And the alerts went nowhere, because the webhook they would be sent to had never been set.

A later change switched the grading service and the observability stack off, behind two flags in the reviewed file. Turning them back on is one apply.

Then the remaining process. Idle, it used 470 megabytes. Why? The container reports the platform's 24 virtual CPU limit as its CPU count, so the async runtime started 24 worker threads and the memory allocator allowed up to 8 arenas per core. Setting both to 2 brought it to 342. Then the grader, which compiled its Python and JavaScript runtimes at boot into about 250 megabytes, switched to precompiled files mapped from disk. 97 megabytes, against 92 with no grader at all. At this size, grading in-process costs about 5 megabytes.

Building the scale work was not the mistake; it is tested and one apply away. Running it before anyone needed it was. Measure idle cost before scaling out.

## Readiness, rollbacks, and shutdown

The boot order is the design. Configuration is validated first. Migrations run before the port is bound, under a database advisory lock so replicas booting together cannot race. So if the process is listening, the schema is current. The readiness endpoint runs a trivial query and returns 503 if the database is unreachable. Railway polls it for up to 120 seconds and only moves traffic once it returns 200.

A failed migration is the good failure: the new container never becomes healthy and the old one keeps serving. The dangerous one is a migration that succeeds, followed by code broken in a way the readiness query cannot see. Traffic moves, errors climb, and you roll back.

[pause]

Rolling back redeploys old code, not the old schema. The previous binary now runs against the new schema. Until a later fix, it did not even get that far: the migrator refused to start when the database held a migration the binary did not know, so every rollback after a migrating release crash-looped. Now the binary sees a schema ahead of it, warns, and starts. But if the migration renamed or dropped a column the old code reads, the rollback boots and then fails every query naming it. Append-only migrations are necessary but not sufficient. Every migration must leave the schema usable by the previous release: expand first, contract in a later deploy.

And shutdown. The server drains open connections for up to 25 seconds, then lets in-flight AI replies finish saving for up to 30. But Railway's draining window defaulted to zero seconds, so the kill signal followed the shutdown signal at once, and none of it ran in production. The window is now 60 seconds. A shutdown guarantee is only as long as the window the platform grants.

## The client IP incident

Some rate limits are keyed by client address. Behind Railway's edge, the connection comes from the proxy, so the real address must come from a header. The first version read the first entry of X-Forwarded-For.

That header is a list each proxy appends to. If a client sends a made-up address, the edge appends the real one after it, and the first entry is whatever the client chose. An attacker who put a random value there on every request got a fresh rate-limit bucket every time. The login limiter became unlimited password guessing. Run in reverse, an attacker could spend a victim's bucket by claiming their address.

The fix trusts only a header the edge sets and overwrites, X-Real-IP, and only when configured to. Why configuration and not a hard-coded name? Because trust depends on topology, not on the header. Exposed directly to the internet, X-Real-IP would be as client-controlled as the other one, and the only honest source would be the socket address. So the setting lives in the infrastructure file, next to the fact that makes it true.

## In the interview

A follow-up the lesson expects: a migration succeeded and the new code is broken. Walk me through the rollback.

[pause]

Readiness passed, because a trivial query cannot see a logic bug. Traffic moved. Rolling back redeploys old code, not old schema, so the previous binary runs against the new one, and if the migration renamed or dropped anything it reads, the rollback fails too. Prevent it with expand and contract. The common wrong answer is "roll back the deployment", as though that restored the database.

And: is the artifact in production the one you tested? Not exactly, and a senior says where: CI tests one build, the platform runs another of the same inputs. Push the tested image and deploy it by digest.

## Recap

Five things to remember. Embedding content and frontend in one binary removes a whole class of version skew, at the price of a deploy per typo. Every gate you have must actually be on the path to production. Green proves a process runs, not that its output arrives, and idle capacity costs money every minute. Rollback runs old code on the new schema, so expand before you contract. And never key anything on a header the client can write.

At your desk: the Dockerfile and its layer table, the infrastructure file with the alert arithmetic and memory table, the boot order and rollout diagram, and the client IP exercise.
