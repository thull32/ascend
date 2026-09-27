# Architecture

Ascend is one Rust binary that serves a JSON API under `/api` and a React single-page app for everything
else, backed by one PostgreSQL database. The curriculum is Markdown compiled into the binary. The only
external runtime dependency is the Anthropic API, and the app degrades gracefully without it.

```mermaid
flowchart LR
  subgraph Browser
    SPA[React SPA]
    JSW[JS/TS worker]
    PYW[Pyodide worker]
  end
  subgraph Server["ascend-api (one binary)"]
    MW[middleware: request id, trace, timeout, compression, security headers, rate limit, CSRF]
    R[routes]
    CORE[ascend-core services]
    CUR[(curriculum: embedded Markdown)]
    DIST[(embedded web/dist)]
  end
  PG[(PostgreSQL)]
  AN[Anthropic API]
  SPA -- "/api JSON + SSE" --> MW --> R --> CORE
  SPA -- "static assets" --> DIST
  CORE --> PG
  CORE --> CUR
  CORE -- "HTTPS, streaming" --> AN
  SPA --> JSW
  SPA --> PYW
```

## Repository layout

```
crates/core      domain layer: config, errors, entities, content engine, auth, AI, services (no HTTP)
crates/api       HTTP adapter: router, middleware, extractors, routes, static hosting (lib + bin)
migration        SeaORM migrations, append-only
content          curriculum (tracks/modules/lessons) and practice problems, Markdown + YAML
web              React SPA, code runners (Web Workers), visualisation engine
scripts          problem validator, dev helpers
docs             this file and architecture decision records
```

## Request lifecycle

1. **Edge.** Railway terminates TLS and forwards to the container; it sets `X-Real-IP`, which is the only
   client-IP source the rate limiter trusts (`CLIENT_IP_HEADER=x-real-ip`).
2. **Middleware** (outermost first, `crates/api/src/app.rs`): request ID (generated, then propagated to the
   response), tracing span, 240 s timeout, Brotli/gzip compression, security headers (CSP, HSTS, frame
   denial). Under `/api` only: a 512 KiB body limit, a per-IP rate limit, and CSRF enforcement.
3. **Extractors** resolve the session cookie once per request and cache the user in request extensions
   (`crates/api/src/extractors.rs`). `CurrentUser` rejects with 401; `MaybeUser` never fails.
4. **Routes** are thin: parse input, call one service, map the result. They never touch the database
   directly.
5. **Services** (`crates/core/src/services`, `crates/core/src/auth`, `crates/core/src/ai`) own the logic and
   return `AppResult<T>`. `AppError` is semantic (`NotFound`, `Conflict`, `RateLimited`, `AiDisabled`, …); the
   API maps it to HTTP in exactly one place (`crates/api/src/error.rs`) and never leaks internal details.

## Data

Eleven tables in five migrations: `users`, `sessions`, `lesson_progress`, `module_preferences`,
`quiz_attempts`, `submissions`, `conversations`/`messages`, `ai_usage`, `comments`, `interviews`.
Everything a user owns cascades on user deletion. Progress and preferences use composite primary keys
and single-statement upserts (`INSERT … ON CONFLICT DO UPDATE`), so there is no read-modify-write race.

Content is **not** in the database. Rows reference content by stable slug (`track/module/lesson`), so
lessons can be edited and redeployed without a migration, and progress survives re-ordering.

## Content engine

`crates/core/src/content` embeds `content/` with `include_dir!`, parses front matter, extracts the special
fenced blocks (`exercise`, `quiz`, `viz`), strips quiz answers from what the client receives, builds a table
of contents, links previous/next lessons, validates every cross-reference, fingerprints the whole corpus
for ETags, and builds an in-memory search index. It runs once at boot and again in the Docker build
(`ascend-api --check-content`), so a broken lesson fails the build, not the deploy.

## Authentication

- Argon2id password hashing on Tokio's blocking pool; login verifies against a dummy hash for unknown
  emails so timing does not reveal which emails are registered.
- Opaque 256-bit session tokens in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie. The database stores only
  the SHA-256 of the token, so a database leak cannot be replayed. Sessions are revocable individually or
  all at once; an hourly task sweeps expired rows.
- CSRF: `SameSite=Lax`, plus an `Origin`/`Referer` check against the configured origin, plus a required
  `X-Requested-With` header that cross-origin pages cannot send without a CORS preflight (which is never
  granted).

See [ADR 0002](adr/0002-server-side-sessions.md).

## AI features

`crates/core/src/ai` holds a small typed client for the Anthropic Messages API (non-streaming and SSE
streaming, JSON-schema constrained output, adaptive thinking with an effort level, prompt caching on the
system prompt). Three products sit on top:

- **Coach**: the system prompt is ordered stable-first (persona, curriculum map) and volatile-last (the
  current lesson, the learner's code, progress) so repeated turns hit the prompt cache. It is instructed to
  give hints and questions, never full solutions to exercises.
- **Quiz generation**: JSON-schema output, validated again server-side.
- **Mock interviews**: an interviewer persona per round type; in assisted mode a separate pair-programmer
  endpoint is enabled and everything the candidate asks it is recorded in the transcript; the evaluation is a
  JSON-schema rubric with an extra "AI direction and verification" dimension for assisted rounds.

Every model call first reserves a request slot in `ai_usage` (per user per UTC day, atomic upsert) and
records actual tokens afterwards. Streaming replies run in a spawned task that persists the reply even if
the browser disconnects; the HTTP response is only a consumer of a channel. See
[ADR 0004](adr/0004-llm-cost-controls.md).

## Code execution

Learner code never runs on the server. `web/src/runner` runs JavaScript/TypeScript (TypeScript stripped by
Sucrase) and Python (Pyodide) in dedicated Web Workers with network APIs removed, and enforces wall-clock
limits by terminating the worker. Results are reported to `/api/submissions`, which validates that the test
counts match the target (the server trusts the learner, since this is practice, not a contest). See
[ADR 0003](adr/0003-client-side-code-execution.md).

## Visualisations

`web/src/viz` is a frame-based engine: each algorithm is a pure generator from input to a list of frames
(full state snapshot plus one explanatory sentence), capped at 600 frames. The player scrubs, steps and
plays at variable speed; renderers share one set of primitives and tones. Content embeds a visualisation
with a JSON fence (` ```viz {"type": "graph", "algorithm": "dijkstra", …} `).

## Operations

- **Config** is read once from the environment and validated at boot (`crates/core/src/config.rs`);
  production refuses to start with insecure cookies.
- **Logs** are JSON in production, one line per request with the request ID.
- **Health**: `/api/healthz` (liveness) and `/api/readyz` (database reachable, AI configured, content
  version). Railway gates rollouts on `/api/readyz`.
- **Migrations** run on boot before the server binds; a failing migration exits non-zero and the previous
  deployment keeps serving.
- **Shutdown** drains in-flight requests on SIGTERM.

## Scaling notes

The service is stateless apart from the in-process rate limiter. To run more than one replica, move rate
limiting to Redis (the `Limiters` type is the seam) and keep everything else as is. Postgres is the
bottleneck long before the app servers; the hot read paths (curriculum, lessons, problems) never touch it.
