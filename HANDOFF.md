# Ascend — session handoff (2026-09-26)

## State
- Backend (Rust/Axum/SeaORM 2, Postgres): complete and smoke-tested locally.
  Auth, sessions, CSRF, rate limits, content engine, progress, roadmap, quizzes,
  submissions, comments, AI coach (SSE streaming, prompt caching, daily budgets),
  AI quiz generation, mock interviews (solo + AI-assisted, graded). All verified
  against the real Anthropic API with curl.
- Frontend (React 19 / Vite / TS): all pages built; in-browser JS/TS + Pyodide
  runners; viz engine with array, graph, network, system(core) families.
- Content: ~150 lessons + ~120 problems on disk so far; agents were still
  writing databases, networking, system-design, big-data, AI, AI-assisted
  engineering, senior-craft tracks and graph/greedy/DP/bits problems.
- Viz families in progress by agents: linked-list, stack-queue, hash-table,
  tree, heap, trie, dp, recursion, string(done), bits(done), memory(done),
  system scenario packs A/B, concurrency, ml. `tsc -b` had errors in dp/tree/trie
  when last checked (owners were still working).

## Known failures from the first Playwright run (7/10 passed)
1. Problem page JS test: editor typing test flaky/selector (`.cm-content`), verify.
2. Pyodide test: CSP or CDN load in headless container; check console/CSP `connect-src`.
3. Viz gallery expects >3 families; passes once agent families are registered.
Also: interview curl test failed only because of jq parsing multi-line JSON; the
endpoints themselves streamed correctly (see api.log).

## Not started
- Railway deployment (Dockerfile + railway.toml + Postgres + ANTHROPIC_API_KEY copied
  from the `me` project), GitHub repo creation (`thull32/ascend`, public),
  README/ARCHITECTURE/ADR docs, CLAUDE.md, `case-study-ascend` track,
  big-data / AI / senior-craft content agents (never relaunched after the crash).

## How to run locally
docker start ascend-pg; cargo build -p ascend-api; (cd web && pnpm build);
scripts/dev-api.sh; open http://localhost:8080
Validate content: CONTENT_LENIENT=1 cargo run -q -p ascend-core --example validate_content -- ./content
Problems: python3 scripts/validate_problems.py
E2E: docker run --rm --network host -v $PWD/web:/work -w /work -e HOME=/tmp mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test --project=desktop
