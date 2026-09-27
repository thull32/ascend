# 0001. One Rust binary with embedded content and SPA

- Status: accepted
- Date: 2026-09-26

## Context

Ascend is free, run by one person, and must be cheap to operate, fast on a phone, and easy to reason about.
The workload is read-heavy (lessons, problems) with small per-user writes (progress, submissions) and a few
long-lived streaming responses (AI).

## Decision

Ship a single Rust (Axum + SeaORM) binary that serves the JSON API and the built React SPA, with the
curriculum compiled in via `include_dir!`. PostgreSQL is the only stateful dependency.

## Alternatives considered

- **Separate frontend hosting (CDN) + API service.** Better cache locality for assets, but two deploy
  pipelines, CORS, and cross-origin cookies. Immutable hashed assets with a year-long `Cache-Control`
  behind Railway's edge get most of the benefit.
- **Content in the database or a headless CMS.** Enables non-developer editing, but content then needs
  migrations, backups and a sync story, and it can drift from the code that renders it. Pull requests give
  review, history and CI for free.
- **Microservices (auth, content, AI).** No team or scale reason to pay the operational cost.

## Consequences

- A content change is a deploy (about a minute with cached dependency layers). Acceptable.
- The binary is self-contained and the image is small; there is no "content missing in prod" failure mode.
- The content validator runs at build time, so bad content cannot ship.
- Horizontal scaling needs one change: the in-process rate limiter moves to a shared store.

## Revisit when

- Content editors who do not use Git join the project (consider a CMS that
  commits to the repository rather than a database-backed CMS).
- A second replica is needed (move rate limiting to Redis first).
- Build times for a content-only change exceed a few minutes.
