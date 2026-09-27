---
slug: writing-effective-specs
title: "Writing specs agents can execute: task briefs, CLAUDE.md and AGENTS.md"
description: The anatomy of a task spec, acceptance criteria a machine can check, standing memory files that stay short and true, and the real brief that drove the parallel agents who wrote this curriculum.
minutes: 25
difficulty: medium
tags: [ai-tools, specs, claude-md, agents-md, acceptance-criteria, documentation]
---
The agent did exactly what you said. You said "add pagination to `GET /v1/orders`". It added offset pagination with `page` and `size` query parameters, a default size of 20, no maximum, and a `total` count. Your API uses cursor pagination with `limit` capped at 100 and a `next_cursor` field, and forbids totals because they force a full scan. That convention lives in a wiki page the agent cannot see. Everything it produced is reasonable, and all of it is wrong for your codebase.

Every decision you do not write down is made by the model's defaults, which are roughly the average of the public code it learned from. Your codebase is not average; that is why it has conventions. A spec is how you move decisions from the model's defaults to yours, and it is the highest-leverage thing you write when working with agents, because it is reused on every attempt and every retry.

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

## Constraints and non-goals

Agents over-deliver. Asked to fix a bug, they reformat the file; asked to add a field, they refactor the serializer; asked for a function, they add a dependency that provides it. Non-goals are the cheapest scope control you have:

- "Do not modify files outside `api/orders/` and `tests/api/`."
- "Do not add dependencies."
- "Do not rename or move existing functions."
- "Do not change formatting of lines you are not otherwise editing."

Prefer concrete negatives ("do not add dependencies") to soft positives ("keep it minimal"), which the model interprets through its own taste.

Then remember what a constraint in a prompt is: a request. Under pressure (a failing test, a long session, a conflicting instruction) models do not always honour it. If a constraint matters, back it with something that enforces it: a permission rule that denies edits to `migrations/`, a CI job that fails when a protected path changes, a `CODEOWNERS` entry that requires a specific reviewer. The spec states the intent; the harness and the pipeline enforce it.

## Memory files: CLAUDE.md and AGENTS.md

A memory file is loaded into the context at the start of every session, in full. Two consequences follow. Every line costs tokens on every task, and every line competes for the model's attention with the task itself. A 2,000-line memory file does not make the agent twice as informed as a 200-line one; it buries the ten rules that matter.

Put in it what the agent cannot cheaply discover and gets wrong without being told:

- **Commands**: how to build, test one file, test everything, run locally.
- **Architecture map**: one line per top-level directory, including what does *not* belong there.
- **Conventions that differ from common defaults**: money as integer cents, UTC via an injected clock, cursor pagination.
- **Gotchas**: the slow fixture, the client that already retries.
- **Definition of done**.

Leave out general advice ("write clean, well-tested code"), anything the agent can read from the code itself (duplicated documentation rots), long style guides (enforce style with a formatter), and anything secret.

```text
# Orders service

## Commands
- Everything:   make check        (ruff, mypy --strict, pytest; about 90 s)
- One file:     pytest tests/api/test_orders.py -q
- Local DB:     docker compose up -d db && make migrate

## Architecture
- api/         HTTP handlers only. No SQL here; call services/.
- services/    Business logic. Pure functions where possible.
- repo/        All SQL. Every query takes tenant_id as its first argument.
- migrations/  Alembic. Never edit an existing migration; add a new one.

## Conventions
- Pagination is cursor-based via api/pagination.py. Never offset.
- Money is integer cents. Never float.
- Errors: raise AppError(code, status). Handlers never build error JSON.
- Time: use clock.now(), never datetime.now(); tests inject the clock.

## Gotchas
- tests/fixtures/big_tenant.sql takes 40 s to load; mark its tests @slow.
- payments.Client already retries with backoff. Never wrap it in a retry.

## Before you report done
- make check passes.
- List any decision you made that the task did not specify.
```

That is about 30 lines and a few hundred tokens. Each line either saves a wrong turn or prevents a review comment.

### One source of truth across tools

`AGENTS.md` is an open, tool-neutral convention for the same content: Codex reads it, and a growing list of other tools do too. Other tools have their own file names. If your team uses several tools, keep one canonical file and point the others at it, for example with a symlink (`ln -s AGENTS.md CLAUDE.md`) or a one-line tool-specific file that refers to it, and keep only genuinely tool-specific settings in the tool-specific files.

In a monorepo, nest files: a root file for repository-wide facts, and `web/AGENTS.md` or `services/billing/AGENTS.md` for the frontend's commands or the billing service's invariants. Tools that support nesting generally give the file nearest the code being edited precedence, so local rules override global ones.

```text
# web/AGENTS.md
- Package manager: pnpm. Never npm or yarn.
- Type check: pnpm tsc -b. Unit tests: pnpm vitest run <path>.
- Server state goes through React Query hooks in src/lib/queries.ts;
  never fetch() directly from components.
```

### Maintaining memory files

Treat them as code. They are reviewed in pull requests, and they are updated from evidence: when an agent makes the same mistake twice, or a reviewer leaves the same comment twice, that becomes a line. When a line stops being true, delete it the same day. A wrong memory file is worse than none, because the agent trusts it more than the code it contradicts.

## Case study: the brief behind this curriculum

This curriculum was written by parallel agents from two files you can read in the repository: `content/AGENT_BRIEF.md` (the task brief every author received) and `content/CONTENT_GUIDE.md` (the contract). They show what a spec for unattended agents needs.

**Read-first ordering with an exemplar.** The brief says to read the guide, then the outline, then an exemplar lesson and problem, and to "match that depth, structure and voice". One good example communicates tone and depth that no amount of description can.

**Designed for nobody being there.** "Write files directly. Do not ask questions; make judgement calls and note them in your final report." An agent working unattended cannot ask; the brief anticipates that and converts silent judgement calls into reported ones.

**Exact identifiers.** Slugs come from the outline and are "stable forever", because learner progress is keyed by them. An agent that invents a nicer slug breaks data.

**Rules with the hazard named.** A paragraph in the guide opens with "YAML rules that bite" and says to write quiz `q:` and `explanation:` fields as `>-` folded block scalars "so colons, quotes and # inside the text are safe". Quiz text is full of colons, and in plain YAML a colon followed by a space starts a mapping, so an unquoted question breaks the parse. Naming the hazard lets the agent generalise the rule to cases the example did not cover.

**A contract backed by a checker.** "Only use the types and algorithms listed here. Unknown types fail the build." The brief gives the exact validation command, says to run it after each module, and lists which warnings are acceptable while other authors are still writing.

**The environment's traps.** "The interactive shell may be fish. For anything beyond a one-liner, write a script file and run it with `bash script.sh`, or use `bash -c '...'`." An agent cannot infer this until a command fails; one sentence saves every author the failure.

**The history of what went wrong.** The resource-safety section begins "A previous authoring run crashed the machine because a buggy reference solution looped forever allocating memory" and then mandates limits. The reason makes the rule stick and tells the agent what the rule is protecting against, so it can apply it to cases the rule did not list.

**A report format.** Files written with word counts, items merged or renamed and why, anything incomplete. The final report is the agent's acceptance criteria turned into evidence.

What generalises: a spec for agents is a contract with examples, a checkable definition of done, the environment's traps, the history of past failures, and a report that surfaces every judgement call.

## Spec smells

| Smell | Why it fails | Fix |
|---|---|---|
| Vague verbs: "improve", "clean up", "make robust" | The model's taste decides what they mean | State the observable change |
| No done condition | The agent stops when it feels finished | Give a command that exits 0 |
| Several concerns in one task | A diff too large to review | Split into tasks |
| Hidden context: "as discussed", "the usual way" | The agent cannot read your Slack | Link the file or paste the decision |
| Contradictions: "keep it minimal" and "handle every edge case" | Resolved arbitrarily and silently | Rank the priorities |
| A 2,000-line memory file | Important rules drown | Prune to what changes behaviour |
| Guardrails written only as instructions | Ignored under pressure | Enforce with permissions or CI |

## Senior signals

- You know every unwritten decision is made by the **model's defaults**, and you write down the decisions where your codebase differs from them.
- You point the agent at an **existing example** in the codebase instead of describing conventions in prose.
- Your acceptance criteria are **checkable by a command**, and they name the edge case the default implementation gets wrong.
- You keep memory files **short, true and evidence-driven**, with one canonical file across tools.
- You back important constraints with **enforcement** (permissions, CI, CODEOWNERS), because a prompt is a request.
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
    Editing existing database migrations must never happen. What is the most reliable way to make that hold for agent-driven work?
  options: ["State it in the memory file and enforce it with a permission rule and a CI check", "Rely on code review, since a human reads every migration diff before it merges", "Write it in capital letters at the top of CLAUDE.md so the model weights it highly", "Repeat it in every task prompt so it is always the most recent instruction"]
  answer: 0
  explanation: >-
    Instructions are requests that models can fail to follow under pressure, however loud or recent they are. The memory file states the intent; a permission rule denying edits to migrations/ and a CI check that fails when a shipped migration changes enforce it mechanically, and review remains a backstop rather than the only defence.
- q: >-
    Why is a 2,000-line memory file usually worse than a 200-line one?
  options: ["Memory files load only when the agent asks for them, so a long one is rarely read", "It loads into every session, costing tokens and diluting attention on the key rules", "Long memory files are always out of date, because nobody reviews them after a month", "A long file overflows the context window, so the task itself no longer fits"]
  answer: 1
  explanation: >-
    Memory files are loaded in full at the start of every session, so every line costs tokens on every task and competes with the task for the model's attention; the rules that matter get buried. They are not loaded on request, 2,000 lines fits easily in a modern context window, and length alone does not make a file stale: irrelevant length is the problem.
```
