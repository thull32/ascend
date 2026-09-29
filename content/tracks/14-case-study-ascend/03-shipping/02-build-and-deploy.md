---
slug: build-and-deploy
title: "Build and deploy: one binary, cargo-chef, distroless and health-gated rollouts"
description: How Ascend turns a commit into a running container, why content and the SPA are compiled into the binary, how cargo-chef keeps builds fast, how readiness gates a rollout, and the client-IP bug hiding at the edge.
minutes: 45
difficulty: hard
tags: [case-study, docker, ci-cd, infrastructure-as-code, deployment, rate-limiting, migrations]
---
Every deployment answers three questions whether or not anyone asks them. What exactly is running in production? How did it get there? And how do you know it is healthy before users find out it is not? Most outages that are not caused by traffic are caused by a wrong answer to one of those: an artifact that differs from the one that was tested, a pipeline step that was skipped, a health check that checks the wrong thing.

Ascend's answers: one Rust binary with the curriculum and the built SPA compiled into it, beside the grader's pinned WebAssembly runtimes, in a distroless image built by a multi-stage Dockerfile, deployed by Railway from `main`, switched to only after its readiness endpoint reports healthy. The same image runs twice, as the API and as the grading service, beside four small services that answer the third question: Prometheus, Alertmanager, Jaeger and Grafana. This lesson reads the `Dockerfile`, `.github/workflows/ci.yml`, `.railway/railway.ts`, `ops/`, `docs/SLO.md`, the `Makefile`, `crates/api/src/main.rs` and the rate limiter's client-IP logic, and finds where each answer is weaker than it looks.

## One artifact

The binary embeds everything it serves. The curriculum is compiled in by the content loader:

```rust
// crates/core/src/content/loader.rs
static EMBEDDED: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/../../content");
```

and so is the built frontend:

```rust
// crates/api/src/app.rs
/// The built SPA (`web/dist`) is embedded so the release artifact is one
/// binary. `web/dist` must exist at compile time (the Dockerfile builds it
/// first; `make web` locally).
static WEB_DIST: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/../../web/dist");
```

The static handler serves files under `assets/` with `Cache-Control: public, max-age=31536000, immutable` (their names contain content hashes, so a new build means new names) and everything else, including `index.html` for client-side routes, with `no-cache`. One exception arrived with commit `8f82820`: a *missing* file under `assets/` is a 404 with `no-store`. Before it, a tab still running the previous build asked for a code-split chunk the new binary did not have, received `index.html`, and failed to parse HTML as JavaScript; now the 404 fires Vite's `vite:preloadError`, and `web/src/main.tsx` reloads the page once into the new build.

ADR 0001 records the trade. The rejected alternatives were a CDN-hosted frontend plus a separate API (two pipelines, CORS, cross-origin cookies) and content in a database or CMS (migrations, backups, a sync story, and content that drifts from the code rendering it). What embedding buys is an entire failure class removed: there is no "the new binary is live but the content volume is stale" and no "the SPA expects an API field the server does not have yet", because the three always ship together. What it costs is that a typo fix in a lesson is a full deploy. With cached dependency layers that takes about a minute, which is acceptable while content changes arrive as reviewed pull requests.

Embedding has one trap worth knowing. `include_dir!` reads files at compile time but does not tell Cargo which files it read, so an incremental build did not notice an edited lesson or a rebuilt SPA and reused a binary with stale content inside. A clean Docker build never hits it, which is why it survived; a developer running `make run` after editing a lesson could get the old lesson back. A `build.rs` in each crate now fixes it with `cargo:rerun-if-changed=../../content` (in `ascend-core`) and `cargo:rerun-if-changed=../../web/dist` (in `ascend-api`, which also reruns when `ASCEND_BUILD_ID` changes).

## The Dockerfile, stage by stage

```text
# Dockerfile (Rust stages)
FROM lukemathwalker/cargo-chef:latest-rust-1.98-slim-trixie@sha256:38dfdbf4fda95c516f873f33032e490baa988b75f7d83c7d12f788f770785b36 AS chef
WORKDIR /app

FROM chef AS runtimes
# ... curl, unzip and CA certificates from apt, then:
COPY scripts/grader-runtimes.sh /tmp/grader-runtimes.sh
RUN bash /tmp/grader-runtimes.sh /opt/ascend/grader

FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY crates crates
COPY migration migration
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
# Keep 0 for releases. 1 downgrades dangling cross-references to warnings
# (only for preview builds while content is being authored).
ARG CONTENT_LENIENT=0
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json -p ascend-api
COPY Cargo.toml Cargo.lock ./
COPY crates crates
COPY migration migration
COPY content content
COPY --from=web /app/web/dist web/dist
# Railway passes the commit as a build argument; it becomes the build id that
# /api/readyz reports and that content ETags include.
ARG RAILWAY_GIT_COMMIT_SHA=""
ENV ASCEND_BUILD_ID=${RAILWAY_GIT_COMMIT_SHA}
RUN cargo build --release -p ascend-api \
 && cp target/release/ascend-api /ascend-api \
 # Strict content validation: a broken lesson fails the build, not the deploy.
 && CONTENT_LENIENT=${CONTENT_LENIENT} /ascend-api --check-content
# Precompile the grader's Python standard library with the same interpreter
# (about 0.2 s saved on every graded run).
COPY --from=runtimes /opt/ascend/grader /opt/ascend/grader
RUN /ascend-api --prepare-grader /opt/ascend/grader
```

Docker caches a layer until one of its inputs changes. A naive Rust Dockerfile copies the source and runs `cargo build`, so any change to any file invalidates the layer that compiles every dependency, and a one-line fix costs a full rebuild of hundreds of crates. cargo-chef splits that step in two. The **planner** reads only the manifests and lockfile and writes `recipe.json`, a description of the dependency graph. The **builder** copies only the recipe and runs `cargo chef cook`, which compiles the dependencies alone. That layer's only input is the recipe, so it stays cached until `Cargo.toml` or `Cargo.lock` changes. Then the real sources are copied and `cargo build` compiles only the workspace crates. The Dockerfile's own comment sums up the result: "a content-only change rebuilds in about a minute". The **runtimes** stage, added with server grading, downloads CPython and QuickJS for WASI and checks their SHA-256 digests; its only input is `grader-runtimes.sh`, so it stays cached until a pin changes. Its output joins the builder *after* the build, where the fresh binary precompiles the Python standard library (`--prepare-grader`), so that step reruns on every commit: a few seconds bought back as about 0.2 s on every graded run.

Trace four commits through the stages to see which layers Docker reuses:

| Commit changes | `planner` | `cook` (dependencies) | `web` | Workspace `cargo build` and `--check-content` |
|---|---|---|---|---|
| A lesson in `content/` | Cached: it never copies `content/` | Cached | Cached | Rebuilt: the `COPY content` layer changed |
| A route handler in `crates/api` | Re-runs, and writes a byte-identical `recipe.json` | Cached: its input is the recipe's contents, which did not change | Cached | Rebuilt |
| A React component | Cached | Cached | Rebuilt | Rebuilt: `web/dist` changed |
| A new crate in `Cargo.toml` | New recipe | **Rebuilt: every dependency compiles again** | Cached | Rebuilt |

The second row is the whole trick: the planner does re-run on every source change, but Docker keys the cook layer on the *content* of the file it copies, and the recipe describes only the dependency graph. Every row ends in the final build, because the commit SHA, declared after `cook`, is compiled in as the build id.

Two more details matter. The **web** stage (Node 24, `pnpm install --frozen-lockfile`, `pnpm build`) is independent and runs in parallel; its only output is `web/dist`, copied into the builder because `include_dir!` needs it at compile time. And the builder ends by running the freshly built binary with `--check-content`, which loads the embedded curriculum strictly and exits non-zero on any broken lesson. The build *is* the content gate; a broken lesson cannot become an image. The lines above the build came later: the commit SHA becomes `ASCEND_BUILD_ID`, compiled into the binary, reported by `/api/readyz` and mixed into every content ETag, so a deploy that changes a response's shape can never be answered with a browser's stale body ([The content engine](/learn/case-study-ascend/the-system/the-content-engine) has the before and after).

```text
# Dockerfile (runtime stage)
FROM gcr.io/distroless/cc-debian13:nonroot@sha256:54df941ed0d06a1bd95ef5e0ce391fd8d9f94b64782dc9a60062727849ee3f97 AS runtime
COPY --from=builder /ascend-api /usr/local/bin/ascend-api
COPY --from=builder /opt/ascend/grader /opt/ascend/grader
ENV APP_ENV=production \
    GRADER_DIR=/opt/ascend/grader \
    HOST=0.0.0.0 \
    PORT=8080 \
    RUST_LOG=info,ascend_api=info,ascend_core=info,tower_http=info,sea_orm=warn,sea_orm_migration=info,sqlx=warn
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/usr/local/bin/ascend-api"]
```

The runtime image is distroless: glibc, CA certificates and not much else, no shell, no package manager, running as a non-root user. It holds two things: the binary, which carries about 15 MB of Markdown and 8 MB of built SPA inside it (measured from `content/` and `web/dist` at the time of writing), and the grader's runtimes, about 55 MB of WebAssembly and Python standard library by the Dockerfile header's count. The builder image is over a gigabyte. Every `FROM` is pinned by digest as well as tag, so a rebuild of the same commit pulls the same bases. `RUST_LOG` names `sea_orm_migration=info` explicitly because targets match by prefix, and `sea_orm=warn` alone silenced the lines that say which migrations ran at boot.

| Runtime base | Why not |
|---|---|
| The builder image itself | Over a gigabyte, ships a compiler and a shell to production |
| `scratch` | No CA certificates (the Anthropic calls are HTTPS) and no glibc for a dynamically linked binary |
| Alpine with a musl build | Workable, but musl's default allocator is widely reported to be slower under multi-threaded allocation (measure it for your workload), and it adds a second libc to test against |
| Debian slim | Fine, but ships a shell and apt, which are attack surface nobody uses |

The cost of distroless is operational: you cannot `exec` into the container and poke around. Debugging happens through structured logs, the health endpoints, and a local reproduction with the same image (`make image`).

## CI

```yaml
# .github/workflows/ci.yml — the rust job
rust:
  name: Rust (fmt, clippy, tests)
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:17-alpine
      env:
        POSTGRES_USER: ascend
        POSTGRES_PASSWORD: ascend
        POSTGRES_DB: ascend_test
      ports: ["5432:5432"]
  env:
    TEST_DATABASE_URL: postgres://ascend:ascend@localhost:5432/ascend_test
    # Grading tests must run here, not skip for want of the runtimes.
    GRADER_REQUIRED: "1"
  steps:
    - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
    - uses: dtolnay/rust-toolchain@6bed0761d98439e5a578e2877258200ad565ba87 # stable
      with:
        # Pinned by SHA, the action cannot read the toolchain from its ref.
        toolchain: stable
        components: rustfmt, clippy
    - uses: Swatinem/rust-cache@6323deb102c322ba6fcbdcafc7e3dddab59af2b6 # v2
    # The server embeds web/dist at compile time; a placeholder is enough for Rust CI.
    - run: mkdir -p web/dist && echo '<!doctype html><title>ci</title>' > web/dist/index.html
    # ... grader runtimes: restored from a cache keyed by the hash of
    # scripts/grader-runtimes.sh, or fetched and prepared with --prepare-grader
    - run: cargo fmt --all -- --check
    - run: cargo clippy --workspace --all-targets
    - run: cargo test --workspace
    # then: strict validate_content, and cargo audit against the RustSec database
```

Four jobs run on every push and pull request: **rust** (format, clippy with `RUSTFLAGS=-D warnings` set for the whole workflow, tests against a Postgres service including the grader's sandbox tests and `grading_parity`, which grades all 1,430 reference solutions, strict content validation), **problems** (problem structure and quiz checks on Python 3.14), **web** (typecheck, Vitest, production build), and **image**, which builds the Dockerfile with GitHub Actions layer caching, then (since `8861312`, replacing a separate job that tested a debug build) runs the image against Postgres, checks that `/api/readyz` reports the commit, runs the Playwright smoke suite on desktop and phone profiles, and requires `docker stop` to exit 0 within 25 s; the image is not pushed. A `concurrency` group cancels superseded runs on the same branch. Since `8f82820` the workflow runs with a read-only token (`permissions: contents: read`), pins every action to a commit SHA rather than a movable tag such as `v4`, audits Rust dependencies with `cargo audit` and web production dependencies with `pnpm audit --prod`, and `.github/dependabot.yml` proposes weekly, grouped updates to the pins, the base images, and the Cargo and npm dependencies. A tag is a pointer its owner can move; a SHA is the code you reviewed. Pins only help if they move, so since `040cf0a` `dependabot-automerge.yml` enables auto-merge for patch, minor and digest-only updates once every required check passes, image smoke test included; majors wait for a person, and Node's base image ignores majors until they are adopted at LTS together with CI's `node-version`. The placeholder `web/dist` is a small, useful trick: the Rust job needs the directory to exist for `include_dir!` but does not need a real frontend, so it skips a Node install.

### Before and after: a deploy path that did not wait for CI

Now compare this pipeline with what actually deploys. Until commit `6ab2be2`, the Railway service was declared with `source: github("thull32/ascend", { checkSuites: false })`: Railway built and deployed every push to `main` without waiting for the GitHub checks. The deploy path's only gates were the ones inside the Dockerfile, so the code had to compile and the content had to validate, and nothing else. A failing API test, a failing Vitest suite (including the one that renders every visualisation), a clippy warning or a broken reference solution showed up as a red CI run *after* the change was already live. Five jobs of evidence, and none of them on the path to production.

The fix is one word, `checkSuites: true`, and the comment above it now says what it means: "A push to main deploys once CI passes." Find the gates that exist and check that they are actually *on the path*.

One divergence remains. CI now runs the smoke suite against the image it built, but Railway builds its own image from the repository, so the image that runs is a second build of the same inputs (the same Dockerfile, lockfiles, and base images pinned by digest), not the one that was tested. The 100x version is to push CI's image to a registry and deploy that image by digest, so the artifact you tested is byte-for-byte the artifact you run.

## Infrastructure as code

```typescript
// .railway/railway.ts (excerpt)
const PHASE_2 = false; // true once the grader service is healthy: the API grades through it

const grader = service("grader", {
  source: github(REPO, { checkSuites: true }),
  // Same image as the API, a different role: see crates/api/src/grading_service.rs.
  startCommand: "/usr/local/bin/ascend-api --serve-grader",
  replicas: { [region]: 2 },
  networking: { privateNetworkEndpoint: "grader" },
  env: { GRADER_TOKEN: preserve(), GRADER_SLOTS: "2", /* ... */ },
});

const app = service("ascend", {
  // Builds the root Dockerfile. A push to main deploys once CI passes.
  source: github(REPO, { checkSuites: true }),
  replicas: { [region]: PHASE_2 ? 2 : 1 },
  // Migrations run on boot before the server binds, so a passing readiness
  // probe means the schema is current and Postgres is reachable.
  healthcheck: "/api/readyz",
  healthcheckTimeout: 120,
  env: {
    APP_ENV: "production",
    PUBLIC_ORIGIN: "https://${{RAILWAY_PUBLIC_DOMAIN}}",
    DATABASE_URL: db.env.DATABASE_URL,
    // 2 replicas, and up to 4 while a deploy overlaps old and new: 4 x 15
    // = 60 of Postgres's 100 connections, leaving room for migrations and
    // psql. Boot warns if the headroom drops below 10.
    DATABASE_POOL_MAX: "15",
    // Railway's edge sets X-Real-IP; the rate limiter trusts only that header.
    CLIENT_IP_HEADER: "x-real-ip",
    AI_MODEL: "claude-opus-5-5",
    AI_DAILY_REQUESTS: "150",
    AI_DAILY_OUTPUT_TOKENS: "120000",
    ANTHROPIC_API_KEY: preserve(),
    ...(PHASE_2 ? { GRADER_URL: internal("grader", 8080), GRADER_TOKEN: grader.env.GRADER_TOKEN } : {}),
    // Strict: a dangling cross-reference or malformed block fails the build.
    CONTENT_LENIENT: "0",
    // Time between SIGTERM and SIGKILL for a replaced deployment. The
    // server's own shutdown is bounded to fit inside it: 25 s for open
    // connections, then 30 s for replies still being persisted.
    RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "60",
    ...telemetry,
  },
});
```

The whole project (Postgres, a 50 GB volume with usage alerts at 80, 95 and 100 percent, the API, the grader and the four observability services) is a TypeScript file. `railway config plan` shows the diff against the live project and `railway config apply` applies it. Secrets never appear: `preserve()` keeps whatever value is set in Railway. Everything else, including the model name, the AI budgets and the trusted client-IP header, is in version control, reviewed like code, and recoverable if the project is deleted (the configuration, that is; the data needs backups).

Settings changed by hand in a dashboard are invisible to review and forgotten in a rebuild; the client-IP fix at the end of this lesson is one line that `railway.ts` makes impossible to lose.

One entry used to deserve a raised eyebrow: `CONTENT_LENIENT: preserve()`, meaning "whatever the dashboard says". Lenient mode downgrades dangling cross-references to warnings and skips files that fail to parse. It is useful while a hundred lessons are being written in parallel, and a `1` left over from that sprint would have quietly disabled the gate the Dockerfile comment describes as "a broken lesson fails the build, not the deploy", in the build and at boot alike. The file now pins it to `"0"`, so the value is reviewed like any other line of code. The binary itself still honours the flag if it is set some other way; a check that refuses to boot when `APP_ENV=production` and lenient mode are both set would make the mistake impossible rather than unlikely. Notice the pattern shared with `checkSuites`: both fixes were one line in the infrastructure file, and both were invisible from the application code.

### Before and after: one replica, and logs as the only telemetry

ADR 0006 records the starting point: one replica grading in-process, a pool sized for one process, and logs as the only telemetry. Commits `3658224`, `c0b3151` and `d3e239b` changed three things, and the file now rolls them out in two phases. First the `grader` service comes up: the same image started with `--serve-grader`, two replicas of two slots each, no public domain, holding the runtimes and a token but no database URL or AI key. Then `PHASE_2` flips: the API goes to two replicas and grades through `GRADER_URL`. Grading and serving scale separately, and untrusted code runs away from every secret.

**Connections are a budget.** `DATABASE_POOL_MAX` (default 20) is 15 in production, and at boot `check_connection_budget` compares `max_connections` with the connections in use plus this pool, warning below 10 spare. Work the number: a rolling deploy briefly runs old and new replicas side by side, so two replicas become four, 4 × 15 = 60 of Postgres's default 100, which is why ADR 0006 puts PgBouncer at about the fifth replica, not the second.

**Telemetry is pushed.** Each process records metrics through the OpenTelemetry API (`crates/core/src/metrics.rs`) and pushes them every 15 s over OTLP/HTTP to Prometheus, labelled with its `RAILWAY_REPLICA_ID`; ADR 0006 chose push because Railway's documentation does not say how internal DNS resolves for a multi-replica service, and push needs no discovery. The main histogram is `http.server.request.duration` by method, route template and status: an inner route layer stamps the matched template on the response and an outer layer times the request, so rate-limit and CSRF refusals are counted too (a 240 s timeout, which fires outside it, is not), and templates such as `/api/problems/{slug}` keep the label set small. Beside it sit grading, AI, rate-limit, retention and email counters and pool and grading-slot gauges, with no personal data in any label. Traces go to Jaeger, one request in five sampled (`OTEL_TRACES_SAMPLE_RATIO: "0.2"`), spans only.

**SLOs are code.** `docs/SLO.md` sets three objectives: 99.5% of API requests do not fail on the server's side over 30 days, 95% of ordinary API requests answer within 250 ms, and 95% of graded submissions within 5 s. `ops/prometheus/rules.yml` turns the first into multi-window burn-rate alerts from Google's SRE workbook. Trace the arithmetic: 0.5% of 720 hours is an error budget of 3.6 hours. `ApiErrorBudgetFastBurn` fires when the 1-hour *and* 5-minute error ratios both exceed 14.4 × 0.5% = 7.2%; burning at 14.4 times the sustainable rate for an hour spends 14.4 / 720 = 2% of the month's budget, which pages. `ApiErrorBudgetSlowBurn` uses 6 × 0.5% over 6 hours and 30 minutes: 36 / 720 = 5% of the budget, a ticket.  Alertmanager routes to `ALERT_WEBHOOK_URL`, each alert links into `docs/RUNBOOK.md`, and Grafana is the only observability service with a public domain.

## Boot order, readiness and rollouts

```rust
// crates/api/src/main.rs — main
let db = state::connect_db(&config).await?;
match ascend_api::migrate::run(&db).await? { /* advisory lock; Apply, UpToDate or SchemaAhead */ }
// ... load the curriculum, load the grader, build state and router, start the hourly sweep
let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
// serve.rs: stop accepting on SIGTERM, let open connections finish, but give
// up after DRAIN_TIMEOUT (25 s), because a stalled stream would hold it forever.
if serve::serve(listener, app, shutdown_signal(), DRAIN_TIMEOUT).await? == serve::Drain::TimedOut {
    tracing::warn!("connections still open after the drain timeout; shutting down anyway");
}
// Connections are drained; now let in-flight AI replies finish persisting
// (bounded, so a hung upstream cannot block the deploy).
if !serve::finish_tasks(&state.tasks, TASK_TIMEOUT).await { // 30 s
    tracing::warn!(remaining = state.tasks.len(), "background tasks still running at shutdown");
}
tracing::info!("shutdown complete");
```

The order is the design. Configuration is validated first (production refuses to start with insecure cookies). Migrations run before the port is bound, under a Postgres advisory lock so replicas booting together cannot race, so if the process is listening, the schema is at least as new as the build needs ([Data and migrations](/learn/case-study-ascend/the-system/data-and-migrations) traces `migrate::plan`). `/api/readyz` runs `SELECT 1` and returns 503 if the database is unreachable, plus the content version, the build id and whether AI is configured. Railway polls it for up to 120 seconds and only moves traffic to the new container once it returns 200.

```mermaid
sequenceDiagram
  participant G as GitHub main
  participant R as Railway
  participant N as New container
  participant O as Old container
  participant PG as Postgres
  G->>R: push
  R->>R: docker build, compile and check content
  R->>N: start
  N->>PG: run pending migrations
  N->>N: bind port 8080
  R->>N: poll /api/readyz for up to 120 s
  alt returns 200
    R->>N: route traffic
    R->>O: SIGTERM, then SIGKILL after 60 s
  else never healthy
    R->>N: stop, deployment failed
    Note over O: keeps serving the previous version
  end
```

A failed migration exits non-zero, the new container never becomes healthy, and the old one keeps serving. That is the good failure. The dangerous one is a migration that *succeeds* followed by code that is broken in a way `SELECT 1` cannot see. Traffic moves, errors climb, you roll back to the previous deployment, and the previous binary now runs against the **new** schema. Until `8f82820` it did not even get that far: `Migrator::up` refuses to start when `seaql_migrations` holds a version the binary has no file for, so every rollback after a migrating release crash-looped at boot. Now `migrate::plan` recognises a schema *ahead* of the build, logs a warning and starts without migrating. That is safe only because of the next rule: if the migration renamed or dropped a column the old code reads, the rollback boots and then fails on every query that names it.

```viz
{"type": "system", "algorithm": "blue-green", "title": "Why rollback depends on the migration", "caption": "Both versions run against one schema, briefly during a switch and indefinitely after a rollback. Expand first (add, never rename or drop), contract in a later deploy."}
```

"Migrations are append-only" (a rule in `CLAUDE.md`, discussed in [Data and migrations](/learn/case-study-ascend/the-system/data-and-migrations)) is necessary but not sufficient. Append-only means shipped migration files are never edited. Rollback safety needs a stronger rule: every migration must leave the schema usable by the *previous* release, which is the expand/contract discipline covered in [Schema migrations at scale](/learn/databases/data-modeling-and-evolution/schema-migrations-at-scale).

Two smaller weaknesses sit in the same code, and a third has been fixed:

- **Readiness checks one dependency.** A deploy with a revoked `ANTHROPIC_API_KEY` reports `ai: true` (which means "configured", not "working") and goes live. A readiness check should not call a paid API on every poll, but a boot-time probe of the key, logged loudly, would catch it.
- **Migrate-on-boot assumed one replica** (fixed in `8f82820`). Several replicas starting at once each ran the migrator, and one failed on "relation already exists". `migrate::run` now holds `pg_advisory_xact_lock` for the whole run; `boot_migrations_are_locked_and_tolerate_a_newer_schema` boots twice at once and expects two `UpToDate`s.
- **Graceful shutdown that never ran** (fixed, then tested). First, background work lived in a bare `tokio::spawn`, so an AI reply whose browser had gone was dropped when `main` returned; a `TaskTracker` drained for up to 30 s fixed that. Then the platform: Railway's draining window defaulted to 0 seconds, so SIGKILL followed SIGTERM at once and none of that code ran in production. `RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "60"` now gives it room, and the drain is bounded to fit: 25 s for open connections (a stalled SSE reader cannot hold the process), then 30 s for tasks. Finally it gained evidence: `95b6623` moved the drain into `serve.rs`, where `crates/api/tests/shutdown.rs` checks over real sockets that an in-flight request finishes, idle keep-alive connections do not delay shutdown and a stalled stream is abandoned at the deadline; and CI's image job stops the real container. A shutdown guarantee is only as long as the window the platform grants, so read that setting rather than assuming it.

## The edge, and the client IP incident

Some rate limits are keyed by client IP (today 30 per minute for login and registration and 1,200 for everything else; model calls and graded submissions are limited per session, password attempts per account or per known device). Behind Railway's edge, the TCP peer the server sees is the proxy, not the user, so the real address has to come from a header. The first version read it from the first entry of `X-Forwarded-For`.

`X-Forwarded-For` is a list that each proxy *appends* to. If a client sends `X-Forwarded-For: 6.6.6.6` and the edge sees the connection from 203.0.113.7, the server receives:

```text
X-Forwarded-For: 6.6.6.6, 203.0.113.7
```

The first entry is whatever the client chose to send. An attacker who puts a random value there on every request gets a fresh rate-limit bucket every time. With the limits of that version, all keyed by IP, the login limiter became unlimited password guessing and the AI limiter stopped limiting (the per-user daily budget still applied, but only to that account). Today's per-account password limit would hold even then, which is the argument for keying each limit by what it protects. The same trick run in reverse lets an attacker spend a victim's bucket by claiming their address.

The fix trusts only a header the edge *sets and overwrites*, and only when told to:

```rust
// crates/api/src/middleware/rate_limit.rs — client_ip
/// Resolves the client IP. Behind a proxy, only a header the proxy itself
/// sets (and overwrites) is trustworthy: `X-Forwarded-For`'s first entry is
/// whatever the client sent. Railway sets `X-Real-IP`, so production is
/// configured with `CLIENT_IP_HEADER=x-real-ip`.
fn client_ip(req: &Request<Body>, header: Option<&str>) -> IpAddr {
    if let Some(name) = header
        && let Some(ip) = req.headers().get(name).and_then(|v| v.to_str().ok()).and_then(|v| v.trim().parse().ok())
    {
        return ip;
    }
    req.extensions().get::<ConnectInfo<SocketAddr>>().map(|c| c.0.ip()).unwrap_or(IpAddr::from([0, 0, 0, 0]))
}
```

Why is the header name configuration instead of a hard-coded `x-real-ip`? Because trust depends on topology, not on the header. Behind Railway, `X-Real-IP` is written by the edge. If the same binary were exposed directly to the internet, `X-Real-IP` would be exactly as client-controlled as `X-Forwarded-For`, and the only honest source would be the socket address, which is what an unset `CLIENT_IP_HEADER` gives you. The value lives in `railway.ts`, next to the fact that makes it true.

There is a second valid design worth knowing: take the *rightmost* entry of `X-Forwarded-For` (or the Nth from the right, for N trusted proxies), since those were appended by infrastructure you control. It works; it is also easy to get wrong when a CDN or a second proxy is added in front and N silently changes. A single header that one trusted hop overwrites is harder to misconfigure. Note one consequence of the parse: if you configured `x-forwarded-for` as the trusted header, a multi-entry value does not parse as a single IP, so the code falls back to the socket address rather than trusting any entry.

**At 100x**, this function survives unchanged, and so do the counters: since `427ed78` the security-relevant buckets live in Postgres and every replica charges the same allowance, and only the loose 1,200-a-minute general bucket stays per process, on purpose ([Authentication and security](/learn/case-study-ascend/the-system/authentication-and-security) has the design). The algorithms themselves are covered in [Rate limiting algorithms](/learn/networking/network-algorithms/rate-limiting-algorithms).

## At 100x

```viz
{"type": "system", "algorithm": "canary", "requests": 20, "title": "The rollout you would want with real traffic", "caption": "Readiness gates only whether a container can start. A canary gates whether the new version behaves, by comparing its error rate and latency with the stable version on live traffic."}
```

- **Build once, deploy by digest.** CI already builds the image and runs the smoke suite and a graceful stop against it; pushing it and having the platform deploy that exact digest closes the last gap between what CI tested and what runs.
- **Canary instead of all-at-once.** One replica on the new version, automated comparison of error rate and p99 against the stable version, then promotion. The per-replica metrics now exist; the comparison and the promotion do not.
- **PgBouncer past about four API replicas**, and Jaeger on persistent storage (today a restart loses every trace), both named in ADR 0006's "revisit when".
- **Migrations as their own step**, run once, with expand/contract enforced in review.
- **A job queue for AI replies**, so no deploy cuts off a stream, however long it runs; the task tracker covers 30 seconds.

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| The deploy path skips CI | A red CI run for a change that is already live | Railway deployed before the check suite finished | `checkSuites: true` (in place since `6ab2be2`) |
| An incremental build embeds stale content | `make run` serves the lesson as it was before the edit | `include_dir!` read the files, but Cargo was never told to watch them | `build.rs` with `rerun-if-changed` (in place) |
| A migration succeeds and the code is broken | Errors after traffic moves, and the rollback fails too | The previous binary queries a column the migration renamed or dropped | Expand and contract: every migration usable by the previous release |
| A revoked model API key | Readiness says 200 with `ai: true`; every coach call fails | `ai` means "configured", not "working" | A boot-time probe of the key, logged loudly |
| A moving base-image or action tag | The same commit builds a different image next week, or CI runs code nobody reviewed | Image digests differ between two builds of one commit | Pins by digest and SHA, kept current by Dependabot (in place since `8f82820`) |
| Alerts never arrive | An alert fires in Prometheus and nobody is told | `ALERT_WEBHOOK_URL` is empty, so the entrypoint wrote a receiver with nothing to send to | Set the variable |
| A drain window of 0 s | Replies cut off at every deploy although the code drains them | Railway's `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` unset | 60 s, with the server's own drain bounded to 55 s (in place) |

## Interviewer follow-ups

**"Is the artifact in production the one you tested?"** Model answer: not exactly, and a senior says where. CI builds an image and runs the smoke suite and a graceful stop against it, then throws it away; Railway builds its own from the repository. Base images and actions are pinned by digest and SHA, which makes two builds of one commit close but not identical in process. Push the tested image and deploy it by digest. Common wrong answer: "same Dockerfile, same image", which ignores tags, build profiles and the embedded SPA.

**"A migration succeeded and the new code is broken. Walk me through the rollback."** Model answer: readiness passed, because `SELECT 1` cannot see a logic bug; traffic moved; rolling back redeploys old code, not old schema, so the previous binary now runs against the new schema. If the migration renamed or dropped anything the old code reads, the rollback fails too. Prevent it with expand and contract. Common wrong answer: "roll back the deployment", as though that restored the database.

**"Why does readiness check only the database?"** Model answer: readiness answers "can this process take traffic". The database is required for almost every route; the model is required for one feature, and a readiness check that calls a paid API on every poll costs money and would take the whole site out during a provider outage. Probe the key once at boot instead, and let AI routes degrade on their own. Common wrong answer: "check every dependency", which turns a partial outage into a total one.

**"What changes to run three replicas?"** Model answer: less than it would have, because ADR 0006 did the groundwork. Migrations run under an advisory lock; sessions, budgets and the security limits live in Postgres, and only the loose general bucket multiplies; retention takes an advisory lock so one replica runs it; grading is its own service; telemetry is pushed per replica. What remains is arithmetic: three replicas become six during a deploy, 6 × 15 = 90 of 100 connections, under the boot check's 10 spare, so lower `DATABASE_POOL_MAX` or add PgBouncer first. Common wrong answer: "set `replicas: 3`".

## What mid-level engineers get wrong

- **Copying all the source before building dependencies.** Every commit recompiles hundreds of crates.
- **Treating a green readiness probe as proof the release is good.** It proves the process can take traffic; a canary proves the release behaves.
- **Building gates that are not on the deploy path.** Five CI jobs guarded nothing while the deploy did not wait for them.
- **Changing settings in a dashboard.** Nobody reviews them, and a rebuilt project forgets them.
- **Keying anything on the first `X-Forwarded-For` entry.** The client wrote it.
- **Renaming a column in one release.** The old code still serving during the switch, and after any rollback, breaks.

## Exercise

```exercise
id: resolve-client-ip
title: Resolve the client IP behind a proxy
prompt: |
  Implement `resolve_client_ip(headers, trusted_header, socket_ip)`, a version of
  `client_ip` in `rate_limit.rs` restricted to IPv4.

  - `headers` is an object of header name to value. Header names are
    case-insensitive.
  - `trusted_header` is the configured header name, or `null`/`None` when no
    proxy header is trusted.
  - If a trusted header is configured and present, trim its value; if the
    result is a valid dotted-quad IPv4 address (four parts, each 1 to 3 digits,
    each 0 to 255), return it.
  - In every other case return `socket_ip`. Never read any other header.
languages: [python, javascript]
entry: resolve_client_ip
starter:
  python: |
    def resolve_client_ip(headers, trusted_header, socket_ip):
        # your code here
        return socket_ip
  javascript: |
    function resolve_client_ip(headers, trusted_header, socket_ip) {
      // your code here
      return socket_ip;
    }
tests:
  - args: [{"x-real-ip": "203.0.113.7"}, "x-real-ip", "10.0.0.5"]
    expected: "203.0.113.7"
  - args: [{"x-forwarded-for": "1.1.1.1", "x-real-ip": "203.0.113.7"}, "x-real-ip", "10.0.0.5"]
    expected: "203.0.113.7"
    label: a spoofed X-Forwarded-For is ignored
  - args: [{"x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1"}, null, "10.0.0.5"]
    expected: "10.0.0.5"
    label: no trusted header configured
  - args: [{}, "x-real-ip", "10.0.0.5"]
    expected: "10.0.0.5"
    label: header missing
  - args: [{"x-real-ip": "not-an-ip"}, "x-real-ip", "10.0.0.5"]
    expected: "10.0.0.5"
    hidden: true
  - args: [{"X-Real-IP": "  198.51.100.4 "}, "x-real-ip", "10.0.0.5"]
    expected: "198.51.100.4"
    hidden: true
    label: case-insensitive name, trimmed value
  - args: [{"x-forwarded-for": "1.1.1.1, 203.0.113.7"}, "x-forwarded-for", "10.0.0.5"]
    expected: "10.0.0.5"
    hidden: true
    label: a list is not a single address
  - args: [{"x-real-ip": "256.1.1.1"}, "x-real-ip", "10.0.0.5"]
    expected: "10.0.0.5"
    hidden: true
    label: octet out of range
hints:
  - "Compare header names after lower-casing both sides."
  - "Validate by splitting on dots: exactly four parts, each made only of digits, one to three characters long, with a value of at most 255."
```

## Senior signals

- You can say, for your own service, whether the artifact that runs in production is **byte-for-byte** the one that was tested, and if not, where they diverge.
- You explain cargo-chef (or any layer-caching trick) by which inputs invalidate which layer, not by its name.
- You treat readiness as "can take traffic", know it does not prove the release is good, and name what does (canary analysis, error budgets).
- You insist that every migration leaves the schema usable by the previous release, because rollback runs old code on new schema.
- You never trust a client-supplied header for identity, and you tie trust in a proxy header to the deployment topology in configuration that lives next to the infrastructure.
- You read infrastructure as code for footguns (a lenient flag, a deploy that does not wait for CI) the same way you read application code for bugs, and you check that every gate you have is actually on the path to production.

## Check yourself

```quiz
- q: >-
    Which change causes the cargo chef cook layer to rebuild all dependencies?
  options: ["Adding a crate to Cargo.toml, which changes the dependency recipe", "Changing a React component, which changes the SPA embedded in the binary", "Editing a lesson in content/, which the binary embeds when it compiles", "Editing a Rust source file in crates/api, such as a route handler"]
  answer: 0
  explanation: >-
    The cook layer's only input is recipe.json, derived from the manifests and the lockfile. Source, content and SPA changes invalidate only the later layers that compile the workspace crates, which is why a content-only deploy takes about a minute.
- q: >-
    Railway now waits for CI, and CI validates content strictly. Why does the Dockerfile still run --check-content?
  options: ["The Docker step also executes every problem's reference solution", "CI validates content in lenient mode, so only the Docker check is strict", "It checks the exact content embedded in this binary, on the path that builds it", "It is redundant now, and it stays only because nobody has got round to removing it"]
  answer: 2
  explanation: >-
    Validation belongs on the path that produces the artifact: the Docker check runs the freshly built binary against the curriculum compiled into it, not a checkout that might differ, and it holds even if a deploy ever bypasses CI. CI's validate_content step is strict too, and reference solutions are executed by a separate CI job.
- q: >-
    A release renames a column in its migration. The new version passes readiness, then starts returning errors, and you roll back to the previous deployment. What happens?
  options: ["Nothing, because SeaORM maps the old and new column names to each other", "Railway refuses to roll back any deployment whose migration succeeded", "The old binary boots, skips migrating, then fails every query naming the old column", "The rollback restores the old schema automatically before starting"]
  answer: 2
  explanation: >-
    Migrations ran forward on boot and nothing runs them backward, so rollback redeploys code, not schema. migrate::plan sees a schema ahead of the build and starts without migrating, and the old queries then name a column that no longer exists. Rollback safety requires expand and contract: add the new column in one release, move reads and writes, and remove the old one in a later release.
- q: >-
    The rate limiter originally used the first X-Forwarded-For entry as the client IP. What could an attacker do?
  options: ["Send a new fake address each time and get a fresh bucket every time", "Only slow down their own requests, since the limiter keys on them", "Nothing, because Railway strips the header before the app sees it", "Bypass the CSRF check by claiming the site's own origin in that same header"]
  answer: 0
  explanation: >-
    Proxies append to X-Forwarded-For, so its first entry is client-supplied. Keying a limiter on it lets the client choose its own key, which made every IP-keyed limit, login included, meaningless. Trusting only a header the edge overwrites, configured explicitly, fixes it.
- q: >-
    Readiness returns 200 when SELECT 1 succeeds. Which bad deploy does it let through?
  options: ["A migration that fails part-way through and exits the process", "A deploy whose ANTHROPIC_API_KEY has been revoked", "A container that cannot reach Postgres over the network", "A binary that panics during boot before it binds its port"]
  answer: 1
  explanation: >-
    A failing migration or a boot panic never binds the port, and an unreachable database makes readyz return 503. The ai field only says a key is configured, not that it works, so a revoked key goes live; a boot-time probe would catch it without calling a paid API on every health poll.
- q: >-
    A commit changes only one route handler in crates/api. Which Docker layers rebuild?
  options: ["Only the web stage, because the SPA is embedded into the API binary", "Every Rust layer, because the planner copies crates/ and so its cache is invalid", "The planner and the final workspace build; the dependency cook stays cached", "Nothing but --check-content, because the source is only embedded, not compiled"]
  answer: 2
  explanation: >-
    The planner copies crates/, so it re-runs, but it writes the same recipe.json, and the cook layer is keyed on that file's contents, so every dependency stays cached. Only the workspace crates compile again. The web stage never sees Rust sources, and source is compiled, not embedded.
```
