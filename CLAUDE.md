# Ascend

Free learning platform taking mid-level engineers to senior at top-tier companies. Rust/Axum/SeaORM API
+ React SPA in one binary; curriculum is Markdown in `content/`. Architecture: `docs/ARCHITECTURE.md`.

## Commands

- `make db` Postgres on :5433 · `make web` build SPA · `make run` server on :8080 · `make check` everything CI runs
- API integration tests: `TEST_DATABASE_URL=postgres://ascend:ascend@localhost:5433/ascend_test cargo test -p ascend-api --test api`
- Content: `cargo run -q -p ascend-core --example validate_content -- ./content` (add `CONTENT_LENIENT=1` while authoring)
- Problems: `python3 scripts/validate_problems.py [content/problems/<slug>.md]` (structure only). Reference solutions
  (`solutions/`) are graded by the server sandbox: `cargo run -q -p ascend-api -- --grade-solutions [PREFIX]`
- Quizzes: `make quizzes` after editing any quiz (canonical option order; CI checks it). `make minutes` after editing lesson prose.
- Web: `cd web && pnpm typecheck && pnpm test`; e2e: `make e2e` (needs a running server)

## Rules

- `crates/core` must not depend on HTTP types. Routes stay thin; logic lives in services.
- Return `AppError` variants; map to HTTP only in `crates/api/src/error.rs`. Never leak internal errors.
- Migrations are append-only. Add a new one; never edit a shipped migration.
- Every mutating request from the browser goes through `web/src/lib/api.ts` (it adds the CSRF header).
- Content follows `content/CONTENT_GUIDE.md`. Quote YAML strings that contain `: `. Only use visualisation
  types/algorithms from the catalogue (implemented in `web/src/viz/families`).
- Run throwaway Python through `scripts/safe_py.sh` (memory/time limits). A runaway script once took the
  machine down.
- Secrets live in the environment (`.env` locally, Railway variables in production). Never commit them.
