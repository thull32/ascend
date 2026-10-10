---
lesson: writing-effective-specs
source: 5fd534864019e52a
fit: great
desk:
  - "The seven-part pagination spec and the eight-step trace from spec line to agent action"
  - "The vague-versus-checkable criteria table and the constraint-to-enforcement table"
  - "This repository's CLAUDE.md, annotated, and the per-tool loading rules table"
  - "The memory-file linter script and its output"
---
## Introduction

The agent did exactly what you said. You said "add pagination to the orders endpoint". It added offset pagination with page and size parameters, a default size of 20, no maximum, and a total count. Your API uses cursor pagination, with the limit capped at 100, and forbids totals because they force a full scan. That convention lives in a wiki page the agent cannot see. Everything it produced is reasonable, and all of it is wrong for your codebase.

Here is the idea to hold onto. Every decision you do not write down is made by the model's defaults, which are roughly the average of the public code it learned from. Your codebase is not average; that is why it has conventions. A spec is how you move decisions from the model's defaults to yours. And it is the highest-leverage thing you write when working with agents, because it is reused on every attempt and every retry.

Three parts, then. The task brief, and how an agent turns each line of it into an action. The standing memory file, and how to keep it short and true. And the brief that produced this curriculum, as a case study in specs for unattended agents.

## Two kinds of spec

There are two kinds of spec. Standing context is the set of facts true for every task in the repository. It lives in a memory file: CLAUDE.md, AGENTS.md, GEMINI.md, or the Copilot and Cursor equivalents. It loads automatically at the start of every session, and it lives for months, reviewed like code. A task brief says what this one task must achieve. It lives in your prompt, an issue, or a file you point at, and it lives for hours.

The rule for which is which: if you have typed the same instruction into two task prompts, it belongs in the memory file. If it is only true for this task, keep it out of the memory file, where it would mislead every future session. "The payments client already retries, so never wrap it in a retry" is standing context. "Cap the limit at 100 for this ticket" and "the customer needs it by Friday" are not.

## Anatomy of a task spec

A task spec that agents execute well has seven parts. The goal, with the reason: the orders endpoint can return 10 thousand rows and its 99th percentile latency is 2.3 seconds, so every response must be bounded. Context. Requirements. Constraints and non-goals. Acceptance criteria. A verify command. And what to report back.

Three details in the rewritten pagination spec carry most of the value.

First, a pointer to an existing example. "Follow the invoices list handler", which already paginates with the shared cursor helpers. That one line transfers dozens of conventions: error handling, cursor encoding, response shape. Examples beat adjectives for agents, exactly as they do for new hires.

Second, the tie-breaker criterion. Keyset pagination on the creation timestamp alone has a classic bug. If orders 57 and 58 share a timestamp and the page boundary falls between them, the next page asks for everything older than 57's timestamp, and skips 58. The fix is to compare the pair, timestamp and ID together. A model will often write the single-column version, because most examples it has seen do. So the spec says: orders sharing a timestamp are neither skipped nor duplicated across a page boundary. Naming the edge case forces a test for it, and the test forces the right query.

Third: "report every decision this spec did not cover." Agents fill gaps silently. This line turns silent defaults into a list you can review. "I chose to return a 400 rather than clamp when the limit exceeds 100" is a decision you can accept or reverse in ten seconds, if you know it was made.

## From spec line to agent action

The lesson traces eight agent actions, each driven by one line. The pointer to the invoices handler makes it read that file and learn the cursor encodes the pair. The index in the context makes it plan a keyset query the index can serve, instead of the default offset query. The acceptance criteria make it write tests first: paging through 250 orders at a limit of 100 returns 100, 100, then 50, with no next cursor at the end; five orders sharing one timestamp across a boundary; limits of zero and 101 rejected. The non-goals keep it to one source file and one test file. The verify command runs until it exits zero. And the report lists two decisions the spec left open.

Now run one experiment in your head. Remove the tie-break criterion. What happens?

[pause]

The tie-break test disappears. The handler passes every remaining test with the single-column query, and the bug ships. That is the exact value of one sentence in the acceptance criteria. And this is how you diagnose a spec that did not work: find the action that went wrong, and ask which line should have prevented it.

A criterion is good if a test or a command can decide it. "Should be fast" becomes "the 99th percentile is under 200 milliseconds for a thousand-order tenant on the benchmark fixture". "Secure" becomes "every query filters by tenant, and a test proves tenant A cannot read tenant B's order by ID". "Backwards compatible" becomes "the existing contract tests pass unmodified". A second benefit: the agent can check them itself, in its own loop, before it reports back.

## Constraints, and what enforces them

Agents over-deliver. Asked to fix a bug, they reformat the file. Asked to add a field, they refactor the serializer. Asked for a function, they add a dependency that provides it. Non-goals are the cheapest scope control you have. "Do not modify files outside these two folders." "Do not add dependencies." "Do not change the formatting of lines you are not otherwise editing." Prefer concrete negatives like these to soft positives like "keep it minimal", which the model interprets through its own taste.

Then remember what a constraint in a prompt is: a request. Under pressure, a failing test or a long session, models do not always honour it. If a constraint matters, back it with something that enforces it. "Never edit shipped migrations" gets a deny rule on the migrations folder in the harness, and a CI job that fails when a shipped migration changes. "No new dependencies" gets a CI check on the lockfile, and a code-owners rule that routes lockfile changes to a named reviewer. "Do not touch the environment file" gets a deny rule plus a sandbox, because a Python one-liner that opens the file is invisible to the rule. The spec states the intent; the harness and the pipeline enforce it.

## Memory files, short and true

A memory file is loaded at the start of every session, in full. Two consequences. Every line costs tokens on every task. And every line competes for the model's attention with the task itself. A 2,000-line memory file does not make the agent twice as informed as a 200-line one; it buries the ten rules that matter. Claude Code's own guidance is to keep the main file under about 200 lines, and move topic material into scoped rule files that load only when relevant.

Put in what the agent cannot cheaply discover and gets wrong without being told. Commands: how to build, test one file, test everything. An architecture map, one line per top-level directory. Conventions that differ from common defaults, like money as integer cents or cursor pagination. Gotchas, like the client that already retries. And the definition of done. Leave out general advice like "write clean code", anything the agent can read from the code itself, long style guides that a formatter should enforce, and anything secret. A credential put there "for convenience" goes out with every session.

This repository's own file is 26 lines, about 430 tokens: under a quarter of a percent of a 200 thousand token window. It points at the architecture document instead of duplicating it. Its commands are exact, down to the environment variable the integration tests need, because each saves an exploratory failure. Its rules are the conventions that differ from defaults, each with a reason. And it names a hazard: "a runaway script once took the machine down." Those few words of history make the rule stick, and let the agent generalise it to cases the rule did not list.

It also has one line that has already gone false. A note says a validation script runs the reference solutions; since a later change, it checks structure only. That is the honest lesson: memory files go wrong silently. A wrong one is worse than none, because the agent trusts it more than the code it contradicts. So treat them as code. Add a line when an agent makes the same mistake twice, or a reviewer leaves the same comment twice. Delete it the day it stops being true. A small linter in CI can flag paths that no longer exist, and the practical check for commands is that they are the same ones CI runs.

Two more things about loading. Nesting is real in every tool. A monorepo can keep billing invariants in a file inside the billing service and repository-wide facts at the root, and the closest file wins where they conflict. And if your team uses several tools, keep one canonical file and point the others at it, with a symbolic link or a one-line import, so the conventions cannot drift apart.

## The brief behind this curriculum

This curriculum was written by parallel agents, working unattended from a brief and a content guide. They show what a spec for nobody-is-there work needs.

Read-first ordering with an exemplar: read the guide, then an exemplar lesson, and match its depth, structure and voice. One good example communicates tone that no description can. Designed for nobody being there: do not ask questions; make judgement calls and note them in your final report. Exact identifiers: lesson slugs are stable forever, because learner progress is keyed by them, so an agent that invents a nicer slug breaks data. The environment's traps: the shell may be fish, so write longer commands as a script file. A contract backed by a checker: unknown visualisation types fail the build, with the exact validation command to run.

And the history of what went wrong. The resource section begins with the machine crashing because a buggy script looped forever allocating memory, then mandates a wrapper with two gigabytes and 60 seconds. The final instruction came from observed failures too: re-read each file you wrote end to end, because files cut off mid-write are the most common defect.

What generalises: a spec for agents is a contract with examples, a checkable definition of done, the environment's traps, the history of past failures, and a report that surfaces every judgement call.

## In the interview

A follow-up the lesson expects: an agent produced a reasonable feature that violates three of your team's conventions. Whose fault is it, and what do you change?

[pause]

The spec's. Unwritten decisions default to the model's training average, so the conventions that differ from that average go in the memory file, and the task spec points at an existing example. The common wrong answer is "the model should have inferred it from the codebase", which it can only do if the convention is visible in the files it happened to read.

And a quick one: your monorepo has a root AGENTS.md and another in the web folder, and a rule differs between them. What happens for work under web? The closer file wins, and a chat instruction overrides both. The wrong answer is "the root file has priority", which is backwards. The right fix is to delete the duplicate, so one convention lives in one place.

## Recap

Four things to remember. Every decision you do not write down is made by the model's defaults, so write down where your codebase differs, and point at an existing example rather than describing conventions. Make acceptance criteria checkable by a command, and name the edge case the default implementation gets wrong. Back important constraints with enforcement, because a prompt is a request. And keep memory files short, true and evidence-driven, with standing facts only, and ask every agent to report the decisions the spec did not cover.

At your desk: the full pagination spec and its eight-step trace, the criteria and enforcement tables, this repository's annotated memory file with the per-tool loading rules, and the memory-file linter.
