---
slug: writing-effective-specs
title: "Writing specs agents can execute: task briefs, CLAUDE.md and AGENTS.md"
description: The anatomy of a task spec and a trace of how an agent executes it, acceptance criteria a machine can check, constraints backed by enforcement, standing memory files that stay short and true (this repository's own CLAUDE.md annotated, and how each tool loads its files), a linter for stale memory files, and the real brief that drove the parallel agents who wrote this curriculum.
minutes: 25
difficulty: medium
tags: [ai-tools, specs, claude-md, agents-md, acceptance-criteria, documentation]
---
The agent did exactly what you said. You said "add pagination to `GET /v1/orders`". It added offset pagination with `page` and `size` query parameters, a default size of 20, no maximum, and a `total` count. Your API uses cursor pagination with `limit` capped at 100 and a `next_cursor` field, and forbids totals because they force a full scan. That convention lives in a wiki page the agent cannot see. Everything it produced is reasonable, and all of it is wrong for your codebase.

Every decision you do not write down is made by the model's defaults, which are roughly the average of the public code it learned from. Your codebase is not average; that is why it has conventions. A spec is how you move decisions from the model's defaults to yours, and it is the highest-leverage thing you write when working with agents, because it is reused on every attempt and every retry. This lesson covers the two kinds of spec, traces how an agent turns one into actions, shows the memory file this repository actually uses and how each tool loads such files, and ends with the brief that produced this curriculum.

## Two kinds of spec

| | Standing context | Task brief |
|---|---|---|
| What | Facts true for every task in this repo | What this task must achieve |
| Where | Memory files: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules` | Your prompt, an issue, a file you point the agent at |
| Loaded | Automatically, at the start of every session | Once, for this task |
| Contents | Commands, architecture map, conventions, gotchas | Goal, constraints, acceptance criteria, verification |
| Lifetime | Months; reviewed like code | Hours |

The rule for which is which: if you have typed the same instruction into two task prompts, it belongs in the memory file. If it is only true for this task, keep it out of the memory file, where it would mislead every future session.

## Anatomy of a task spec

A task spec that agents execute well has seven parts. Here is the pagination request rewritten:

```text
Goal
  GET /v1/orders can return 10,000 rows; p99 latency is 2.3 s. Add cursor
  pagination so every response is bounded.

Context
  - Handler: api/orders/list.py. Follow api/invoices/list.py, which already
    paginates with encode_cursor/decode_cursor from api/pagination.py.
  - Orders sort by (created_at DESC, id DESC). Index: (tenant_id, created_at, id).

Requirements
  - Query params: limit (default 50, max 100) and cursor (opaque string).
  - Response: {"data": [...], "next_cursor": "<string>" or null}.
  - An invalid cursor returns 400 with error code "invalid_cursor".

Constraints and non-goals
  - Do not change other endpoints. Do not modify api/pagination.py.
  - No new dependencies. No offset pagination. No total count.

Acceptance criteria
  - Paging through 250 orders with limit=100 returns 100, 100, then 50
    items, and the last response has next_cursor null.
  - Orders sharing the same created_at are neither skipped nor duplicated
    across a page boundary.
  - limit=0 and limit=101 return 400.
  - Existing tests pass without modification.

Verify
  pytest tests/api/test_orders.py && ruff check api

Report
  Files changed; every decision you made that this spec did not cover;
  anything you could not do.
```

Three details carry most of the value.

**The pointer to an existing example.** "Follow `api/invoices/list.py`" transfers dozens of conventions (error handling, cursor encoding, response shape) in one line. Examples beat adjectives for agents exactly as they do for new hires.

**The tie-breaker criterion.** Keyset pagination on `created_at` alone has a classic bug: if orders 57 and 58 share a timestamp and the page boundary falls between them, the next page's `WHERE created_at < :last` skips 58. The fix is to compare the tuple `(created_at, id)`. A model will often write the single-column version, because most examples it has seen do. Naming the edge case in the acceptance criteria forces a test for it, and the test forces the right query.

**"Report every decision this spec did not cover."** Agents fill gaps silently. This line turns silent defaults into a list you can review: "I chose to return 400 rather than clamp when limit exceeds 100" is a decision you can accept or reverse in ten seconds, if you know it was made.

## How an agent executes the spec: a trace

Watch what each line of the spec does once an agent reads it. The session below is illustrative, but the mapping from spec line to action is what you should expect from any capable agent, and it is how you diagnose a spec that did not work: find the action that went wrong and ask which line should have prevented it.

| Step | Spec line that drives it | Agent action | What you would check |
|---|---|---|---|
| 1 | Context: "Follow `api/invoices/list.py`" | Reads `invoices/list.py` and `pagination.py`; notes `encode_cursor` takes a `(created_at, id)` tuple | Without this line it would grep for "pagination" and may find nothing |
| 2 | Context: index `(tenant_id, created_at, id)` | Plans a keyset `WHERE (created_at, id) < (:c, :i)` query that the index serves | Without it, `ORDER BY created_at OFFSET` is the default |
| 3 | Acceptance: 100, 100, 50 with `next_cursor` null | Writes `test_pages_250_orders` first, seeds 250 rows, asserts the three sizes and the final null | The test exists before the handler does |
| 4 | Acceptance: ties neither skipped nor duplicated | Writes `test_tie_break` with 5 orders sharing one timestamp across a boundary | The single-column query fails this test; the tuple query passes |
| 5 | Requirements: `limit` bounds | Writes `test_limit_bounds` for 0 and 101 → 400 | Clamp-versus-reject was decided by you, not the model |
| 6 | Non-goals: no new dependencies, do not modify `pagination.py` | Implements the handler in `orders/list.py` only | `git diff --stat` shows one source file and one test file |
| 7 | Verify | Runs `pytest tests/api/test_orders.py && ruff check api` until green | Exit code 0, no test file modified |
| 8 | Report | Lists: "limit below 1 returns 400 rather than clamping; cursor is base64 of the tuple, as in invoices" | Two decisions the spec left open, now visible |

Eight actions, and every one is traceable to a line. Now remove the tie-break criterion and rerun the trace in your head: step 4 disappears, the handler passes the remaining tests with the single-column query, and the bug ships. That is the exact value of one sentence in the acceptance criteria.

## Acceptance criteria a machine can check

An acceptance criterion is good if a test or a command can decide it. Rewrite vague criteria until they pass that bar:

| Vague | Checkable |
|---|---|
| "Should be fast" | "p99 under 200 ms for a 1,000-order tenant on the benchmark fixture" |
| "Handle errors properly" | "A timeout from the payments client returns 503 with `Retry-After: 5` and logs `payment_timeout` with the order id" |
| "Clean code" | "`ruff` and `mypy --strict` pass on changed files; no function over 50 lines" |
| "Secure" | "Every query filters by `tenant_id`; a test proves tenant A cannot read tenant B's order by id" |
| "Backwards compatible" | "The existing contract tests in `tests/contract/` pass unmodified" |

Checkable criteria have a second benefit: the agent can check them itself, in its own loop, before it ever reports back.

## Constraints, non-goals and what enforces them

Agents over-deliver. Asked to fix a bug, they reformat the file; asked to add a field, they refactor the serializer; asked for a function, they add a dependency that provides it. Non-goals are the cheapest scope control you have:

- "Do not modify files outside `api/orders/` and `tests/api/`."
- "Do not add dependencies."
- "Do not rename or move existing functions."
- "Do not change formatting of lines you are not otherwise editing."

Prefer concrete negatives ("do not add dependencies") to soft positives ("keep it minimal"), which the model interprets through its own taste.

Then remember what a constraint in a prompt is: a request. Under pressure (a failing test, a long session, a conflicting instruction) models do not always honour it. If a constraint matters, back it with something that enforces it. Each constraint has a mechanical counterpart:

| Constraint in the spec | Enforced by |
|---|---|
| "Never edit shipped migrations" | Claude Code: `"deny": ["Edit(migrations/**)", "Write(migrations/**)"]` in `.claude/settings.json`; a CI job that fails when a file under `migrations/` with an existing version changes |
| "Do not modify the tests during implementation" | A `PreToolUse` hook that denies `Edit`/`Write` on `tests/**` for the implementation step (see [the agentic workflow](/learn/ai-assisted-engineering/tools-and-workflows/agentic-coding-workflow)) |
| "No new dependencies" | CI fails if the lockfile changes without a `deps:` label; `CODEOWNERS` routes lockfile changes to a named reviewer |
| "Do not touch `.env`" | `"deny": ["Read(./.env)", "Read(./.env.*)"]` plus a sandbox filesystem deny, because a Python one-liner that opens the file is invisible to the rule |
| "Stay inside `api/orders/`" | A worktree or checkout containing only what the task needs; review of `git diff --stat` before anything else |

The spec states the intent; the harness and the pipeline enforce it. [MCP and integrations](/learn/ai-assisted-engineering/tools-and-workflows/mcp-and-integrations) ranks the enforcement layers by how well they hold.

## Memory files: CLAUDE.md and AGENTS.md

A memory file is loaded into the context at the start of every session, in full. Two consequences follow. Every line costs tokens on every task, and every line competes for the model's attention with the task itself. A 2,000-line memory file does not make the agent twice as informed as a 200-line one; it buries the ten rules that matter. Claude Code's own guidance, at the time of writing, is to keep the main file under about 200 lines and move topic-specific material into scoped rule files.

Put in it what the agent cannot cheaply discover and gets wrong without being told:

- **Commands**: how to build, test one file, test everything, run locally.
- **Architecture map**: one line per top-level directory, including what does *not* belong there.
- **Conventions that differ from common defaults**: money as integer cents, UTC via an injected clock, cursor pagination.
- **Gotchas**: the slow fixture, the client that already retries.
- **Definition of done**.

Leave out general advice ("write clean, well-tested code"), anything the agent can read from the code itself (duplicated documentation rots), long style guides (enforce style with a formatter), and anything secret.

### This repository's CLAUDE.md, annotated

The file at the root of this repository is 26 lines and 1,735 characters, about 430 tokens: under a quarter of a percent of a 200,000-token window, loaded into every session. Here it is, with what each part is doing.

```markdown
# Ascend

Free learning platform taking mid-level engineers to senior at top-tier companies. Rust/Axum/SeaORM API
+ React SPA in one binary; curriculum is Markdown in `content/`. Architecture: `docs/ARCHITECTURE.md`.

## Commands

- `make db` Postgres on :5433 · `make web` build SPA · `make run` server on :8080 · `make check` everything CI runs
- API integration tests: `TEST_DATABASE_URL=postgres://ascend:ascend@localhost:5433/ascend_test cargo test -p ascend-api --test api`
- Content: `cargo run -q -p ascend-core --example validate_content -- ./content` (add `CONTENT_LENIENT=1` while authoring)
- Problems: `python3 scripts/validate_problems.py [content/problems/<slug>.md]` (executes reference solutions)
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
```

- **The two-line header** says what the system is and points at `docs/ARCHITECTURE.md` instead of duplicating it. The architecture document is long and changes; the pointer does not rot.
- **Commands** are exact, including the environment variable the integration tests need and the `CONTENT_LENIENT=1` flag for authoring. Each one saves an exploratory failure: an agent that runs `cargo test` without the database URL gets a connection error and a wasted iteration.
- **Rules** are the conventions that differ from defaults, each with a location or a reason: the core/HTTP boundary, the single place errors map to HTTP, append-only migrations, the CSRF wrapper. A model's default would put SQL in a handler and build error JSON inline; these lines override the default.
- **The hazard is named.** "A runaway script once took the machine down" is eleven words of history that make the `safe_py.sh` rule stick and let the agent generalise it to Node or a shell loop.
- **One line has already gone false.** Since commit `e47282a`, `validate_problems.py` checks structure only, and the server's grader runs the reference solutions (`make solutions`); the "(executes reference solutions)" note was not in that commit's diff. The path checker below cannot catch that: the path still exists; only the claim beside it changed.
- **Nothing secret, nothing general.** No "write good code", no credentials, no restated documentation.

What it deliberately leaves out is as instructive: no description of every crate (the agent can list them), no style guide (rustfmt and the linter enforce it), no task-specific instructions.

### Under the hood: how each tool loads its files

The loading rules differ, and they decide where a line must live to be seen. At the time of writing:

| Tool | Files | Loading rule |
|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md`, `./CLAUDE.md` (or `.claude/CLAUDE.md`), `CLAUDE.local.md`, `.claude/rules/*.md`; `AGENTS.md` when there is no `CLAUDE.md` | User and project files load in full at session start and are concatenated, broadest first, so project lines come later; nothing resolves a contradiction between them; subdirectory files load when Claude reads files there; a rule file with a `paths:` front matter (glob list) loads only when a matching file is read, one without it loads at start; `@path` imports nest up to four hops; edits apply at `/clear`, `/compact` or restart; `/init` drafts one |
| OpenAI Codex | `~/.codex/AGENTS.override.md` or `~/.codex/AGENTS.md`, then `AGENTS.md` (or `AGENTS.override.md`) in each directory from the project root down to the working directory | One file per directory, concatenated root-first so the closest file appears last and overrides; stops at 32 KiB total (`project_doc_max_bytes`); `/init` scaffolds one |
| Cursor | `.cursor/rules/*.mdc`, `AGENTS.md` (root and nested), `CLAUDE.md` | A rule's front matter (`description`, `globs`, `alwaysApply`) sets one of four types: always applied, applied when the model judges it relevant from the description, attached when a file matching `globs` is in context, or only when mentioned; nested `AGENTS.md` files combine with the closest taking precedence; rules apply to the agent, not to Tab completion |
| GitHub Copilot | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `AGENTS.md`, root `CLAUDE.md` or `GEMINI.md` | Repository-wide file always; an instructions file's `applyTo:` glob scopes it to matching paths; the nearest `AGENTS.md` wins; on GitHub.com the path-specific files apply to the cloud agent and code review |
| Gemini CLI | `~/.gemini/GEMINI.md`, `GEMINI.md` in the workspace and parents, files found when a tool touches a directory | Global, then workspace, then just-in-time discovery in that directory and its ancestors up to a trusted root; `context.fileName` can point at `AGENTS.md` instead; `@file` imports nest to depth 5 |

[`AGENTS.md`](https://agents.md/) itself is a plain-Markdown convention with one rule, "the closest `AGENTS.md` to the edited file wins; explicit user chat prompts override everything", stewarded since December 2025 by the Agentic AI Foundation under the Linux Foundation, and read by Codex, Cursor, Copilot, Gemini CLI (by configuration) and many others. Claude Code, at the time of writing, reads it directly when a repository has no `CLAUDE.md`, and alongside `CLAUDE.md` if you change one setting.

### Nesting and scope

Two consequences for where you write things. First, nesting is real in every tool, so a monorepo's `services/billing/AGENTS.md` can hold the billing invariants and the root file the repository-wide facts, and the closest file wins where they conflict. Second, scoped rules exist for a reason: a 40-line rule about test conventions belongs in a file that loads only when tests are in context, not in the 430 tokens every session pays.

```text
# web/AGENTS.md
- Package manager: pnpm. Never npm or yarn.
- Type check: pnpm tsc -b. Unit tests: pnpm vitest run <path>.
- Server state goes through React Query hooks in src/lib/queries.ts;
  never fetch() directly from components.
```

### One source of truth across tools

If your team uses several tools, keep one canonical file and point the others at it, for example with a symlink (`ln -s AGENTS.md CLAUDE.md`, the same trick the AGENTS.md site recommends for the older `AGENT.md` name) or a one-line tool-specific file that imports it, and keep only genuinely tool-specific settings in the tool-specific files. Copilot and Cursor read `CLAUDE.md` directly, Claude Code reads `AGENTS.md` when no `CLAUDE.md` exists, and Gemini CLI can be told to read `AGENTS.md`, so the symlink is often unnecessary; check the current documentation for the tools you run.

### Maintaining memory files

Treat them as code. They are reviewed in pull requests, and they are updated from evidence: when an agent makes the same mistake twice, or a reviewer leaves the same comment twice, that becomes a line. When a line stops being true, delete it the same day. A wrong memory file is worse than none, because the agent trusts it more than the code it contradicts.

The most common way a memory file goes wrong is silently: a path it names is renamed, a command it lists changes its flags. A linter in CI catches the first kind. This one checks every backticked path in the file and estimates the token cost:

```python
"""Lint a memory file: flag paths that no longer exist and estimate its token cost."""
import pathlib, re, sys

path = pathlib.Path(sys.argv[1])
root = path.parent
text = path.read_text(encoding="utf-8")

candidates = {                                    # backticked spans that look like paths
    span for span in re.findall(r"`([^`\s]+)`", text)
    if ("/" in span or re.search(r"\.[a-z]{1,5}$", span)) and not span.startswith(("http", "$", "-", "<"))
}
missing = sorted(c for c in candidates if not (root / c.split(":")[0]).exists())

print(f"{path}: {text.count(chr(10)) + 1} lines, {len(text):,} chars, about {len(text) / 4:,.0f} tokens")
print(f"paths mentioned: {len(candidates)}, missing: {len(missing)}")
for m in missing:
    print(f"  MISSING {m}")
sys.exit(1 if missing else 0)
```

Run against this repository's file today:

```text
CLAUDE.md: 26 lines, 1,735 chars, about 433 tokens
paths mentioned: 9, missing: 0
```

Wire it into CI and a renamed `scripts/safe_py.sh` fails the build instead of misleading every future session. Commands are harder to lint mechanically; the practical check is that the memory file's commands are the same ones CI runs, so a change to one forces a change to the other.

## Case study: the brief behind this curriculum

This curriculum was written by parallel agents from two files you can read in the repository: `content/AGENT_BRIEF.md` (the task brief every author received) and `content/CONTENT_GUIDE.md` (the contract). They show what a spec for unattended agents needs.

**Read-first ordering with an exemplar.** The brief says to read the guide, then the outline, then an exemplar lesson and problem, and to "match that depth, structure and voice". One good example communicates tone and depth that no amount of description can.

**Designed for nobody being there.** "Write files directly. Do not ask questions; make judgement calls and note them in your final report." An agent working unattended cannot ask; the brief anticipates that and converts silent judgement calls into reported ones.

**Exact identifiers.** Slugs come from the outline and are "stable forever", because learner progress is keyed by them. An agent that invents a nicer slug breaks data.

**Rules with the hazard named.** A paragraph in the guide opens with "YAML rules that bite" and says to write quiz `q:` and `explanation:` fields as `>-` folded block scalars "so colons, quotes and # inside the text are safe". Quiz text is full of colons, and in plain YAML a colon followed by a space starts a mapping, so an unquoted question breaks the parse. Naming the hazard lets the agent generalise the rule to cases the example did not cover.

### The rules that made unattended work safe

**A contract backed by a checker.** "Only use the types and algorithms listed here. Unknown types fail the build." The brief gives the exact validation command, says to run it after each module, and lists which warnings are acceptable while other authors are still writing.

**The environment's traps.** "The interactive shell may be fish. For anything beyond a one-liner, write a script file and run it with `bash script.sh`, or use `bash -c '...'`." An agent cannot infer this until a command fails; one sentence saves every author the failure.

**The history of what went wrong.** The resource-safety section begins "A previous authoring run crashed the machine because a buggy reference solution looped forever allocating memory" and then mandates limits: "Never run `python3` or `node` directly on ad-hoc test code", with the exact wrapper (`scripts/safe_py.sh`, 2 GiB and 60 seconds) and "Run at most one validation/test process at a time." The reason makes the rule stick and tells the agent what the rule is protecting against, so it can apply it to cases the rule did not list.

**A report format.** Files written with word counts, items merged or renamed and why, anything incomplete, and a final instruction born from observed failures: "Before finishing, re-read each file you wrote end to end once. Files cut off mid-write are the most common defect." The final report is the agent's acceptance criteria turned into evidence.

What generalises: a spec for agents is a contract with examples, a checkable definition of done, the environment's traps, the history of past failures, and a report that surfaces every judgement call. The same brief, with a scope and a file list, is what produced the lesson you are reading.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| The agent runs a test command from the memory file and it fails with an unknown flag; it then tries five variants | A stale command: the tool changed and the memory file did not | Keep memory-file commands identical to CI's; lint paths in CI; delete lines the day they stop being true |
| The agent follows a rule in `services/billing/AGENTS.md` that contradicts the root file, and the reviewer expected the root rule | Nested files override; the closer file won, as designed | Decide which rule is right, delete the other; never state one convention in two files |
| A production credential appears in a vendor transcript although nobody pasted it | It was in the memory file "for convenience", so it went out with every session | Memory files carry nothing secret; deny reads on `.env*`; rotate the credential |
| The agent ignores a rule that is present in a 2,000-line memory file | Dilution: the rule competed with 1,999 other lines for attention | Prune to what changes behaviour; move topic rules into scoped files that load only when relevant |
| Every session after a hotfix keeps "returning 503 for the payments timeout" in unrelated endpoints | A task-specific instruction was added to the memory file and now applies everywhere | Task facts live in the task spec; the memory file holds only what is true for every task |
| The agent implements "the usual way" in a way nobody recognises | Hidden context: "as discussed" and "the usual way" refer to a conversation it was not in | Link the file or paste the decision; point at an existing example in the codebase |
| Two acceptance criteria conflict ("keep it minimal", "handle every edge case") and the agent picks silently | Contradiction resolved by the model's defaults | Rank priorities explicitly, and ask for a report of decisions the spec did not cover |

## Spec smells

| Smell | Why it fails | Fix |
|---|---|---|
| Vague verbs: "improve", "clean up", "make robust" | The model's taste decides what they mean | State the observable change |
| No done condition | The agent stops when it feels finished | Give a command that exits 0 |
| Several concerns in one task | A diff too large to review | Split into tasks |
| Hidden context: "as discussed", "the usual way" | The agent cannot read your Slack | Link the file or paste the decision |
| Contradictions: "keep it minimal" and "handle every edge case" | Resolved arbitrarily and silently | Rank the priorities |
| A 2,000-line memory file | Important rules drown | Prune to what changes behaviour |
| Guardrails written only as instructions | Ignored under pressure | Enforce with permissions, hooks or CI |

## Interviewer follow-ups

**"An agent produced a reasonable feature that violates three of your team's conventions. Whose fault, and what do you change?"** Model answer: the spec's; unwritten decisions default to the model's training average, so the conventions that differ from that average go in the memory file, and the task spec points at an existing example. Common wrong answer: "the model should have inferred it from the codebase", which it can only do if the convention is visible in the files it happened to read.

**"What goes in `CLAUDE.md` versus a task prompt, and how do you keep the file from growing forever?"** Model answer: standing facts (commands, architecture map, conventions that differ from defaults, gotchas, definition of done) in the memory file, evidence-driven and pruned; task facts in the prompt; a line is added when a mistake or review comment recurs and deleted the day it stops being true; scoped rule files hold topic material. Common wrong answer: "everything useful, the more context the better", which dilutes the rules that matter.

**"How do you make 'never edit shipped migrations' actually hold?"** Model answer: state it in the memory file, deny it in the harness (an `Edit` deny rule or a pre-tool hook), and fail CI when a shipped migration changes; review is the backstop. Common wrong answer: capital letters at the top of the file.

**"Why ask the agent to report decisions the spec did not cover?"** Model answer: because agents fill gaps silently and the report turns each default into a ten-second review decision; it also tells you which lines the next version of the spec needs. Common wrong answer: "so the summary is longer", which confuses the report with the agent's self-assessment, a claim rather than evidence.

**"Your monorepo has a root `AGENTS.md` and one in `web/`. A rule differs between them. What happens?"** Model answer: in the tools that define an order, the closer file wins for work under `web/` (Codex and Claude Code place it later in the prompt; Cursor and Copilot give the nearest file precedence), and a chat instruction overrides both; the right fix is to delete the duplicate so one convention lives in one place. Common wrong answer: "the root file has priority", which is backwards.

## What mid-level engineers get wrong

- **Writing adjectives instead of pointers.** "Follow our conventions" transfers nothing; "follow `api/invoices/list.py`" transfers dozens of them.
- **Leaving the edge case out of the acceptance criteria.** The tie-break criterion is one sentence; without it the default single-column query passes every other test and ships the bug.
- **Putting task facts in the memory file.** The deadline, the customer and this ticket's limit cap then mislead every later session.
- **Treating a written constraint as enforced.** "Do not modify the tests" is a request; the hook or deny rule is the enforcement.
- **Growing the memory file without pruning.** Each addition seems harmless; at a few hundred lines the ten rules that matter are diluted, and stale commands cost an iteration each.
- **Using different memory files per tool with different content.** The conventions drift apart and each tool follows a different one; one canonical file with symlinks or imports keeps them identical.
- **Skipping the report line.** They review the code and never learn which decisions the model made unprompted, so the next spec has the same gaps.

## Senior signals

- You know every unwritten decision is made by the **model's defaults**, and you write down the decisions where your codebase differs from them.
- You point the agent at an **existing example** in the codebase instead of describing conventions in prose.
- Your acceptance criteria are **checkable by a command**, and they name the edge case the default implementation gets wrong; you can trace which spec line produced which agent action.
- You keep memory files **short, true and evidence-driven**, lint their paths in CI, use scoped rule files for topic material, and know how each tool loads and overrides them.
- You back important constraints with **enforcement** (deny rules, hooks, CI, CODEOWNERS), because a prompt is a request.
- You ask agents to **report the decisions the spec did not cover**, so silent defaults become reviewable.

## Check yourself

```quiz
- q: >-
    An agent implements pagination with offset, page size 20 and a total count, although your codebase uses cursor pagination capped at 100. What is the root cause?
  options: ["The agent found the wiki convention but ignored it, as agents often ignore guidance", "Offset pagination is the safer default, so the agent rightly overrode the convention", "The spec never stated those decisions, so the model filled them with its own defaults", "The model was too small for API work; a larger model would have inferred the convention"]
  answer: 2
  explanation: >-
    Every decision you do not write down is made by the model's defaults, and offset pagination is among the most common patterns in public code. The wiki page was invisible to the agent, and a more capable model would still have had to guess. Pointing the agent at the existing cursor implementation, or stating the convention, fixes it.
- q: >-
    Which acceptance criterion is most useful for a cursor pagination task?
  options: ["Pagination works like other modern APIs, so clients can page through orders without surprises", "The code is clean and well tested, and the paging logic is easy for reviewers to follow", "Pagination follows industry best practices and stays robust under heavy concurrent load", "Paging 250 orders at limit=100 yields 100, 100, 50, with no skips or repeats on created_at ties"]
  answer: 3
  explanation: >-
    Only the 250-order criterion can be decided by a test, and it names the edge case (timestamp ties at a page boundary) that a single-column keyset query gets wrong. Best practices, clean code and behaving like other modern APIs are judged by the model's taste, so they mean whatever the model thinks they mean.
- q: >-
    Which of these belongs in the repository's standing memory file rather than in a single task spec?
  options: ["The payments client already retries with backoff, so never wrap it in a retry", "For this ticket, cap the limit parameter at 100 and return 400 above it", "Rename the variable total to order_count in api/orders/list.py for clarity", "The customer who reported this bug is on the enterprise plan and needs it by Friday"]
  answer: 0
  explanation: >-
    The retry behaviour is a stable fact about the codebase that every future task touching payments needs. The limit cap, the rename and the customer's deadline are true only for one task, and putting them in the memory file would mislead every later session.
- q: >-
    A monorepo has a root AGENTS.md saying "use npm" and web/AGENTS.md saying "use pnpm". An agent edits a file under web/. Which instruction applies, at the time of writing, in tools that support nested files?
  options: ["Both are sent and the model picks whichever it reads first", "The web/ file, because the closest file to the edited code wins", "Neither, because a conflict makes the tool ignore both files and ask", "The root file, because repository-wide instructions take priority over local ones"]
  answer: 1
  explanation: >-
    Nesting is designed so the closest file overrides: Codex concatenates root-first so the closer file appears last, Cursor and Copilot apply the nearest AGENTS.md, and the convention's own rule is that the closest file wins with chat prompts overriding everything. The right fix is still to delete the duplicate so one convention lives in one place.
- q: >-
    Editing existing database migrations must never happen. What is the most reliable way to make that hold for agent-driven work?
  options: ["State it in the memory file and enforce it with a deny rule or hook and a CI check", "Rely on code review, since a human reads every migration diff before it merges", "Write it in capital letters at the top of CLAUDE.md so the model weights it highly", "Repeat it in every task prompt so it is always the most recent instruction"]
  answer: 0
  explanation: >-
    Instructions are requests that models can fail to follow under pressure, however loud or recent they are. The memory file states the intent; a permission rule denying edits to migrations/ (or a pre-tool hook) and a CI check that fails when a shipped migration changes enforce it mechanically, and review remains a backstop rather than the only defence.
- q: >-
    Why is a 2,000-line memory file usually worse than a 200-line one?
  options: ["Memory files load only when the agent asks for them, so a long one is rarely read", "It loads into every session, costing tokens and diluting attention on the key rules", "Long memory files are always out of date, because nobody reviews them after a month", "A long file overflows the context window, so the task itself no longer fits"]
  answer: 1
  explanation: >-
    Memory files are loaded in full at the start of every session, so every line costs tokens on every task and competes with the task for the model's attention; the rules that matter get buried, which is why the tools offer scoped rule files that load only when relevant. They are not loaded on request, 2,000 lines fits easily in a modern context window, and length alone does not make a file stale: irrelevant length is the problem.
```
