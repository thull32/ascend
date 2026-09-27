---
slug: build-and-deploy
title: "Build and deploy: one binary, cargo-chef, distroless and health-gated rollouts"
description: How Ascend turns a commit into a running container, why content and the SPA are compiled into the binary, how cargo-chef keeps builds fast, how readiness gates a rollout, and the client-IP bug hiding at the edge.
minutes: 40
difficulty: hard
tags: [case-study, docker, ci-cd, infrastructure-as-code, deployment, rate-limiting, migrations]
---
Every deployment answers three questions whether or not anyone asks them. What exactly is running in production? How did it get there? And how do you know it is healthy before users find out it is not? Most outages that are not caused by traffic are caused by a wrong answer to one of those: an artifact that differs from the one that was tested, a pipeline step that was skipped, a health check that checks the wrong thing.

Ascend's answers are compact: one Rust binary with the curriculum and the built SPA compiled into it, in a distroless image built by a multi-stage Dockerfile, deployed by Railway from `main`, switched to only after its readiness endpoint reports healthy. This lesson reads the `Dockerfile`, `.github/workflows/ci.yml`, `.railway/railway.ts`, the `Makefile`, `crates/api/src/main.rs` and the rate limiter's client-IP logic, and finds where each answer is weaker than it looks.

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

The static handler serves files under `assets/` with `Cache-Control: public, max-age=31536000, immutable` (their names contain content hashes, so a new build means new names) and everything else, including `index.html` for client-side routes, with `no-cache`.

ADR 0001 records the trade. The rejected alternatives were a CDN-hosted frontend plus a separate API (two pipelines, CORS, cross-origin cookies) and content in a database or CMS (migrations, backups, a sync story, and content that drifts from the code rendering it). What embedding buys is an entire failure class removed: there is no "the new binary is live but the content volume is stale" and no "the SPA expects an API field the server does not have yet", because the three always ship together. What it costs is that a typo fix in a lesson is a full deploy. With cached dependency layers that takes about a minute, which is acceptable while content changes arrive as reviewed pull requests.

Embedding has one trap worth knowing. `include_dir!` reads files at compile time but does not tell Cargo which files it read, so an incremental build did not notice an edited lesson or a rebuilt SPA and reused a binary with stale content inside. A clean Docker build never hits it, which is why it survived; a developer running `make run` after editing a lesson could get the old lesson back. A `build.rs` in each crate now fixes it with `cargo:rerun-if-changed=../../content` (in `ascend-core`) and `cargo:rerun-if-changed=../../web/dist` (in `ascend-api`, which also reruns when `ASCEND_BUILD_ID` changes).

## The Dockerfile, stage by stage

```text
# Dockerfile (Rust stages)
FROM lukemathwalker/cargo-chef:latest-rust-1.98-slim-trixie AS chef
WORKDIR /app

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
```

Docker caches a layer until one of its inputs changes. A naive Rust Dockerfile copies the source and runs `cargo build`, so any change to any file invalidates the layer that compiles every dependency, and a one-line fix costs a full rebuild of hundreds of crates. cargo-chef splits that step in two. The **planner** reads only the manifests and lockfile and writes `recipe.json`, a description of the dependency graph. The **builder** copies only the recipe and runs `cargo chef cook`, which compiles the dependencies alone. That layer's only input is the recipe, so it stays cached until `Cargo.toml` or `Cargo.lock` changes. Then the real sources are copied and `cargo build` compiles just the workspace crates. The Dockerfile's own comment sums up the result: "a content-only change rebuilds in about a minute".

Two more details matter. The **web** stage (Node 24, `pnpm install --frozen-lockfile`, `pnpm build`) is independent and runs in parallel; its only output is `web/dist`, copied into the builder because `include_dir!` needs it at compile time. And the builder ends by running the freshly built binary with `--check-content`, which loads the embedded curriculum strictly and exits non-zero on any broken lesson. The build *is* the content gate; a broken lesson cannot become an image. The lines just above the build are newer: the commit SHA becomes `ASCEND_BUILD_ID`, compiled into the binary, reported by `/api/readyz` and mixed into every content ETag, so a deploy that changes a response's shape can never be answered with a browser's stale body ([The content engine](/learn/case-study-ascend/the-system/the-content-engine) has the before and after).

```text
# Dockerfile (runtime stage)
FROM gcr.io/distroless/cc-debian13:nonroot AS runtime
COPY --from=builder /ascend-api /usr/local/bin/ascend-api
ENV APP_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    RUST_LOG=info,ascend_api=info,ascend_core=info,tower_http=info,sea_orm=warn,sqlx=warn
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/usr/local/bin/ascend-api"]
```

The runtime image is distroless: glibc, CA certificates and not much else, no shell, no package manager, running as a non-root user. The final image is around 85 MB and its only moving part is the binary.

| Runtime base | Why not |
|---|---|
| The builder image itself | Over a gigabyte, ships a compiler and a shell to production |
| `scratch` | No CA certificates (the Anthropic calls are HTTPS) and no glibc for a dynamically linked binary |
| Alpine with a musl build | Workable, but musl's default allocator is known to be slow under multi-threaded allocation, and it adds a second libc to test against |
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
  steps:
    - uses: actions/checkout@v4
    - uses: dtolnay/rust-toolchain@stable
      with:
        components: rustfmt, clippy
    - uses: Swatinem/rust-cache@v2
    # The server embeds web/dist at compile time; a placeholder is enough for Rust CI.
    - run: mkdir -p web/dist && echo '<!doctype html><title>ci</title>' > web/dist/index.html
    - run: cargo fmt --all -- --check
    - run: cargo clippy --workspace --all-targets
    - run: cargo test --workspace
```

Five jobs run on every push and pull request: **rust** (format, clippy with `RUSTFLAGS=-D warnings` set for the whole workflow, tests against a Postgres service, strict content validation), **problems** (every reference solution executed on Python 3.14), **web** (typecheck, Vitest, production build), **image** (the Dockerfile builds, with GitHub Actions layer caching, but the image is not pushed), and **e2e** (a debug build of the server started against a Postgres service, with the Playwright smoke suite run on desktop and phone profiles). A `concurrency` group cancels superseded runs on the same branch. The placeholder `web/dist` is a small, useful trick: the Rust job needs the directory to exist for `include_dir!` but does not need a real frontend, so it skips a Node install.

### Before and after: a deploy path that did not wait for CI

Now compare this pipeline with what actually deploys. Until the latest fixes, the Railway service was declared with `source: github("thull32/ascend", { checkSuites: false })`: Railway built and deployed every push to `main` without waiting for the GitHub checks. The deploy path's only gates were the ones inside the Dockerfile, so the code had to compile and the content had to validate, and nothing else. A failing API test, a failing Vitest suite (including the one that renders every visualisation), a clippy warning or a broken reference solution showed up as a red CI run *after* the change was already live. Five jobs of evidence, and none of them on the path to production.

The fix is one word, `checkSuites: true`, and the comment above it now says what it means: "A push to main deploys once CI passes." That is the cheapest possible change with the largest effect, which is why it belongs at the top of any deploy review: find the gates that exist and check that they are actually *on the path*.

One divergence remains. Railway builds its own image from the repository, so the image CI built is not the image that runs; the Dockerfile and lockfiles are the same, but base images are pulled at build time, and `cargo-chef:latest-rust-1.98-slim-trixie` is a moving tag. The e2e job, meanwhile, tests a debug binary built with `cargo build`, not either image. Neither is unusual for a one-person project, and both are what a design review should name. The cheap fix is to pin base images by digest. The 100x version is to build once in CI, run the smoke suite against that image, push it to a registry, and deploy that image by digest, so the artifact you tested is byte-for-byte the artifact you run.

## Infrastructure as code

```typescript
// .railway/railway.ts
const app = service("ascend", {
  // Builds the root Dockerfile. A push to main deploys once CI passes.
  source: github("thull32/ascend", { checkSuites: true }),
  replicas: { [region]: 1 },
  // Migrations run on boot before the server binds, so a passing readiness
  // probe means the schema is current and Postgres is reachable.
  healthcheck: "/api/readyz",
  healthcheckTimeout: 120,
  env: {
    APP_ENV: "production",
    PUBLIC_ORIGIN: "https://${{RAILWAY_PUBLIC_DOMAIN}}",
    DATABASE_URL: db.env.DATABASE_URL,
    // Railway's edge sets X-Real-IP; the rate limiter trusts only that header.
    CLIENT_IP_HEADER: "x-real-ip",
    AI_MODEL: "claude-opus-5-5",
    AI_DAILY_REQUESTS: "150",
    AI_DAILY_OUTPUT_TOKENS: "120000",
    ANTHROPIC_API_KEY: preserve(),
    // Strict: a dangling cross-reference or malformed block fails the build.
    CONTENT_LENIENT: "0",
  },
});
```

The whole project (Postgres, a 50 GB volume with usage alerts at 80, 95 and 100 percent, and the service) is a TypeScript file. `railway config plan` shows the diff against the live project and `railway config apply` applies it. Secrets never appear: `preserve()` keeps whatever value is set in Railway. Everything else, including the model name, the AI budgets and the trusted client-IP header, is in version control, reviewed like code, and recoverable if the project is deleted (the configuration, that is; the data needs backups).

That last point is not academic. Settings changed by hand in a dashboard are invisible to review and forgotten in a rebuild. The client-IP fix in the last section of this lesson is a one-line environment variable; living in `railway.ts` is what makes it impossible to lose in a migration to a new project.

One entry used to deserve a raised eyebrow: `CONTENT_LENIENT: preserve()`, meaning "whatever the dashboard says". Lenient mode downgrades dangling cross-references to warnings and skips files that fail to parse. It is useful while a hundred lessons are being written in parallel, and a `1` left over from that sprint would have quietly disabled the gate the Dockerfile comment describes as "a broken lesson fails the build, not the deploy", in the build and at boot alike. The file now pins it to `"0"`, so the value is reviewed like any other line of code. The binary itself still honours the flag if it is set some other way; a check that refuses to boot when `APP_ENV=production` and lenient mode are both set would make the mistake impossible rather than unlikely. Notice the pattern shared with `checkSuites`: both fixes were one line in the infrastructure file, and both were invisible from the application code.

## Boot order, readiness and rollouts

```rust
// crates/api/src/main.rs — main
let db = state::connect_db(&config).await?;
tracing::info!("running migrations");
migration::Migrator::up(&db, None).await?;
// ... load the curriculum, build state and router, start the hourly session sweep
let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
tracing::info!(addr = %config.bind_addr, "listening");
axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())
    .with_graceful_shutdown(shutdown_signal())
    .await?;
// Connections are drained; now let in-flight AI replies finish persisting
// (bounded, so a hung upstream cannot block the deploy).
state.tasks.close();
if tokio::time::timeout(Duration::from_secs(30), state.tasks.wait()).await.is_err() {
    tracing::warn!(remaining = state.tasks.len(), "background tasks still running at shutdown");
}
```

The order is the design. Configuration is validated first (production refuses to start with insecure cookies). Migrations run before the port is bound, so if the process is listening, the schema is current. `/api/readyz` runs `SELECT 1` and returns 503 if the database is unreachable, plus the content version, the build id and whether AI is configured. Railway polls it for up to 120 seconds and only moves traffic to the new container once it returns 200.

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
    R->>O: SIGTERM, drain in-flight requests
  else never healthy
    R->>N: stop, deployment failed
    Note over O: keeps serving the previous version
  end
```

A failed migration exits non-zero, the new container never becomes healthy, and the old one keeps serving. That is the good failure. The dangerous one is a migration that *succeeds* followed by code that is broken in a way `SELECT 1` cannot see. Traffic moves, errors climb, you roll back to the previous deployment, and the previous binary now runs against the **new** schema. If the migration renamed or dropped a column the old code reads, the rollback fails too.

```viz
{"type": "system", "algorithm": "blue-green", "title": "Why rollback depends on the migration", "caption": "Both versions run against one schema, briefly during a switch and indefinitely after a rollback. Expand first (add, never rename or drop), contract in a later deploy."}
```

"Migrations are append-only" (a rule in `CLAUDE.md`, discussed in [Data and migrations](/learn/case-study-ascend/the-system/data-and-migrations)) is necessary but not sufficient. Append-only means shipped migration files are never edited. Rollback safety needs a stronger rule: every migration must leave the schema usable by the *previous* release, which is the expand/contract discipline covered in [Schema migrations at scale](/learn/databases/data-modeling-and-evolution/schema-migrations-at-scale).

Two smaller weaknesses sit in the same code, and a third has been fixed:

- **Readiness checks one dependency.** A deploy with a revoked `ANTHROPIC_API_KEY` reports `ai: true` (which means "configured", not "working") and goes live. A readiness check should not call a paid API on every poll, but a boot-time probe of the key, logged loudly, would catch it.
- **Migrate-on-boot assumes one replica.** With several replicas starting at once, each runs the migrator. You want exactly one migrator: a Postgres advisory lock around `Migrator::up`, or a separate pre-deploy command that runs migrations once before any new replica starts.
- **Graceful shutdown used to drain connections, not tasks.** On SIGTERM, Axum stops accepting and waits for in-flight requests. An AI reply whose browser had already disconnected lived only in a bare `tokio::spawn` task that nobody waited for, so when `main` returned, the reply and its usage record were lost. The lines at the end of `main` above are the fix: background work is spawned on a `TaskTracker`, and shutdown waits up to 30 seconds for it. The guarantee now has a stated bound, and it only holds if the platform's grace period between SIGTERM and SIGKILL is at least that long, which is worth checking in the platform's settings rather than assuming.

## The edge, and the client IP incident

Some rate limits are keyed by client IP (today 30 per minute for login and registration and 1,200 for everything else; the AI limit is per session and password attempts are per account). Behind Railway's edge, the TCP peer the server sees is the proxy, not the user, so the real address has to come from a header. The first version read it from the first entry of `X-Forwarded-For`.

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

**At 100x**, this function survives unchanged; what changes is where the counters live. With more than one replica, each process has its own buckets, and the next lesson moves them to Redis. The algorithms themselves are covered in [Rate limiting algorithms](/learn/networking/network-algorithms/rate-limiting-algorithms).

## At 100x

```viz
{"type": "system", "algorithm": "canary", "requests": 20, "title": "The rollout you would want with real traffic", "caption": "Readiness gates only whether a container can start. A canary gates whether the new version behaves, by comparing its error rate and latency with the stable version on live traffic."}
```

- **Build once, deploy by digest.** CI builds the image, runs the Playwright smoke suite against that image rather than a debug build, pushes it, and the platform deploys that exact digest. Deploys already wait for CI; this closes the gap between what CI tested and what runs.
- **Pin every base image by digest**, so a rebuild of the same commit produces the same image.
- **Canary instead of all-at-once.** One replica on the new version, automated comparison of error rate and p99 against the stable version, then promotion. It needs the metrics the next lesson adds.
- **Migrations as their own step**, run once, with expand/contract enforced in review.
- **A job queue for AI replies**, so no deploy cuts off a stream, however long it runs; the task tracker covers 30 seconds.

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
  options: ["Adding a crate to Cargo.toml, which changes the dependency recipe", "Editing a lesson in content/, which the binary embeds when it compiles", "Changing a React component, which changes the SPA embedded in the binary", "Editing a Rust source file in crates/api, such as a route handler"]
  answer: 0
  explanation: >-
    The cook layer's only input is recipe.json, derived from the manifests and the lockfile. Source, content and SPA changes invalidate only the later layers that compile the workspace crates, which is why a content-only deploy takes about a minute.
- q: >-
    Railway now waits for CI, and CI validates content strictly. Why does the Dockerfile still run --check-content?
  options: ["The Docker step also executes every problem's reference solution", "It is redundant now, and it stays only because nobody has got round to removing it", "It checks the exact content embedded in this binary, on the path that builds it", "CI validates content in lenient mode, so only the Docker check is strict"]
  answer: 2
  explanation: >-
    Validation belongs on the path that produces the artifact: the Docker check runs the freshly built binary against the curriculum compiled into it, not a checkout that might differ, and it holds even if a deploy ever bypasses CI. CI's validate_content step is strict too, and reference solutions are executed by a separate CI job.
- q: >-
    A release renames a column in its migration. The new version passes readiness, then starts returning errors, and you roll back to the previous deployment. What happens?
  options: ["The rollback restores the old schema automatically before starting", "Railway refuses to roll back any deployment whose migration succeeded", "The old binary starts but then fails on every query that uses the old column name", "Nothing, because SeaORM maps the old and new column names to each other"]
  answer: 2
  explanation: >-
    Migrations ran forward on boot and nothing runs them backward, so rollback redeploys code, not schema. Rollback safety requires expand and contract: add the new column in one release, move reads and writes, and remove the old one in a later release.
- q: >-
    The rate limiter originally used the first X-Forwarded-For entry as the client IP. What could an attacker do?
  options: ["Send a new fake address each time and get a fresh bucket every time", "Bypass the CSRF check by claiming the site's own origin in that same header", "Only slow down their own requests, since the limiter keys on them", "Nothing, because Railway strips the header before the app sees it"]
  answer: 0
  explanation: >-
    Proxies append to X-Forwarded-For, so its first entry is client-supplied. Keying a limiter on it lets the client choose its own key, which made every IP-keyed limit, login included, meaningless. Trusting only a header the edge overwrites, configured explicitly, fixes it.
- q: >-
    Readiness returns 200 when SELECT 1 succeeds. Which bad deploy does it let through?
  options: ["A container that cannot reach Postgres over the network", "A deploy whose ANTHROPIC_API_KEY has been revoked", "A binary that panics during boot before it binds its port", "A migration that fails part-way through and exits the process"]
  answer: 1
  explanation: >-
    A failing migration or a boot panic never binds the port, and an unreachable database makes readyz return 503. The ai field only says a key is configured, not that it works, so a revoked key goes live; a boot-time probe would catch it without calling a paid API on every health poll.
```
