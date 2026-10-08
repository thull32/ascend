<div align="center">

# Ascend

**From mid-level to senior. Free, in depth, and open source.**

A complete learning platform for working software engineers aiming for a senior role at a top-tier company:
a structured curriculum, step-by-step visualisations of every mechanism, code that runs in your browser,
an AI coach that hints instead of answering, and mock interviews with and without an AI pair-programmer.

</div>

---

## What is in it

| | |
|---|---|
| **Curriculum** | 349 lessons in 14 tracks and 6 phases: foundations, data structures, algorithms, advanced data structures, interview patterns, operating systems and concurrency, databases, networking, system design, big data, AI and LLMs, AI-assisted engineering, senior craft, and a case study of this codebase. Each lesson goes one level deeper than the usual explainer and traces every mechanism on concrete data, measures what it claims, and ends with interviewer follow-ups, "senior signals" and a quiz (535 hands-on exercises and 2,094 quiz questions in all). |
| **Visualisations** | 17 families and 229 steppable animations (sorting, graphs, DP tables, trees, heaps, TCP, DNS, TLS, Raft, consistent hashing, MVCC, LSM trees, attention, RAG pipelines, …). Every frame carries a sentence explaining the step. Scrub backwards, change the input. |
| **Live coding** | Python (CPython 3.14 via Pyodide/WebAssembly) and JavaScript/TypeScript run in sandboxed Web Workers with hard time limits for instant feedback, and the server re-runs every signed-in attempt in its own WebAssembly sandbox (CPython and QuickJS under Wasmtime), so progress records only results the server computed. Lesson exercises and 180 practice problems (the full practice collection and a core practice subset) are graded against visible and hidden tests. |
| **AI coach** | Grounded in the lesson you are reading, the problem you are solving and the code in your editor. It asks the next question; it does not hand over solutions. Also generates fresh quizzes. |
| **Mock interviews** | Coding, system design and behavioural rounds, timed, with a rubric-based evaluation. **Solo** mode locks the coach out. **AI-assisted** mode gives you an AI pair-programmer and grades how you direct, verify and critique it. |
| **Roadmap** | Personalised: mark modules you already know, prioritise the ones you need, or describe your background to the coach and review its suggestions. See a finish date at your weekly pace. |
| **Community** | Threaded discussion on every lesson and problem. |

## The code is part of the curriculum

This repository is written to be read. The final track walks through it as a production reference: a
Rust/Axum/SeaORM backend with a strict domain/transport split, server-side sessions, layered CSRF defence,
rate limiting, structured logs with request IDs, append-only migrations, content validated at build time,
cost-bounded LLM features, and a React frontend with sandboxed code runners.

Start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), then the decision records in [`docs/adr/`](docs/adr/).
Operating it: [`docs/SLO.md`](docs/SLO.md) (objectives and alerts) and [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

## Stack

- **Backend:** Rust 2024, [Axum 0.8](https://github.com/tokio-rs/axum), [SeaORM 2](https://www.sea-ql.org/SeaORM/) on PostgreSQL 17, Tokio
- **AI:** Anthropic Messages API over a small typed client (streaming SSE, JSON-schema outputs, prompt caching)
- **Frontend:** React 19, TypeScript (strict), Vite, Tailwind 4, TanStack Query, CodeMirror 6, Pyodide, Mermaid, KaTeX
- **Tests:** Rust unit tests and API integration tests against real Postgres; Vitest (2,000+ tests, including every visualisation in the curriculum rendered and checked for frames that change after they are recorded); Playwright end-to-end on desktop and mobile against the production Docker image in CI (which also checks the container stops cleanly on SIGTERM), plus an opt-in live-AI suite, a stub-model AI suite in CI and a nightly full-content crawl; reference solutions for all 1,430 exercises and problems, graded in CI by the same server sandbox that grades learners
- **Deploy:** one ~85 MB distroless image on [Railway](https://railway.com), migrations on boot, health-checked rollouts

## Run it locally

Requirements: Rust (stable), Node 24 + pnpm, Docker (for Postgres), Python 3 with `pyyaml` (content validation), and `curl` and `unzip` for `make grader`.

```bash
make db            # Postgres 17 on :5433
cp .env.example .env   # add ANTHROPIC_API_KEY to enable the coach and interviews
make grader        # WebAssembly runtimes the server grades submissions in (once)
make web           # build the SPA (embedded into the server binary)
make run           # http://localhost:8080
```

For frontend work with hot reload, run the API (`cargo run -p ascend-api`) and `cd web && pnpm dev`
(Vite on :5173 proxies `/api`).

```bash
make check         # fmt, clippy, unit + integration tests, content + problem validation, typecheck, vitest
make e2e           # Playwright against the running server
make image         # production Docker image
```

## Contributing content

Lessons are Markdown with YAML front matter in [`content/`](content/). Read
[`content/CONTENT_GUIDE.md`](content/CONTENT_GUIDE.md): it defines the quality bar, the front matter, and
the `viz`, `exercise` and `quiz` blocks. `make content` validates everything; CI rejects a lesson with a
broken reference, a malformed block, or a practice problem whose reference solution fails its own tests.

## Licence

MIT. Practice problems are original statements of classic interview problems.
