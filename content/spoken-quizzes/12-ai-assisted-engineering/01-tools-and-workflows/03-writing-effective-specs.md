---
lesson: writing-effective-specs
source: a08377c1e76d5d6b
---
## 1

An agent implements pagination with offsets, a page size of 20 and a total count, although your codebase uses cursor pagination capped at 100. What is the root cause?

A, the agent found the wiki convention but ignored it, as agents often ignore guidance. B, offset pagination is the safer default, so the agent rightly overrode the convention. C, the spec never stated those decisions, so the model filled them with its own defaults. D, the model was too small for API work, and a larger model would have inferred the convention.

[think]

The answer is C: the spec never stated those decisions, so the model filled them with its own defaults.

Every decision you do not write down is made by the model's defaults, and offset pagination is among the most common patterns in public code. The wiki page was invisible to the agent, and a more capable model would still have had to guess. Pointing the agent at the existing cursor implementation, or stating the convention, fixes it.

## 2

Which acceptance criterion is most useful for a cursor pagination task?

A, pagination works like other modern APIs, so clients can page through orders without surprises. B, the code is clean and well tested, and the paging logic is easy for reviewers to follow. C, pagination follows industry best practices, and stays robust under heavy concurrent load. D, paging 250 orders at a limit of 100 yields 100, 100, then 50, with no skips or repeats when creation times tie.

[think]

The answer is D: paging 250 orders at a limit of 100 yields 100, 100, then 50, with no skips or repeats on ties.

Only the 250-order criterion can be decided by a test, and it names the edge case, timestamp ties at a page boundary, that a single-column keyset query gets wrong. Best practices, clean code, and behaving like other modern APIs are judged by the model's taste, so they mean whatever the model thinks they mean.

## 3

Which of these belongs in the repository's standing memory file, rather than in a single task spec?

A, the payments client already retries with backoff, so never wrap it in a retry. B, for this ticket, cap the limit parameter at 100, and return a 400 error above it. C, rename the variable total to order count in the orders list module, for clarity. D, the customer who reported this bug is on the enterprise plan, and needs it by Friday.

[think]

The answer is A: the payments client already retries with backoff, so never wrap it in a retry.

The retry behaviour is a stable fact about the codebase that every future task touching payments needs. The limit cap, the rename and the customer's deadline are true only for one task, and putting them in the memory file would mislead every later session.

## 4

A monorepo has a root AGENTS.md file saying "use npm", and another in the web folder saying "use pnpm". An agent edits a file under the web folder. At the time of writing, in tools that support nested files, which instruction applies?

A, both are sent, and the model picks whichever it reads first. B, the web folder's file, because the file closest to the edited code wins. C, neither, because a conflict makes the tool ignore both files and ask. D, the root file, because repository-wide instructions take priority over local ones.

[think]

The answer is B: the web folder's file, because the file closest to the edited code wins.

Nesting is designed so the closest file overrides. Codex concatenates from the root down, so the closer file appears last; Cursor and Copilot apply the nearest file; and the convention's own rule is that the closest file wins, with chat prompts overriding everything. The right fix is still to delete the duplicate, so one convention lives in one place.

## 5

Editing existing database migrations must never happen. What is the most reliable way to make that hold for agent-driven work?

A, state it in the memory file, and enforce it with a deny rule or hook, and a CI check. B, rely on code review, since a human reads every migration diff before it merges. C, write it in capital letters at the top of CLAUDE.md, so the model weights it highly. D, repeat it in every task prompt, so it is always the most recent instruction.

[think]

The answer is A: state it in the memory file, and enforce it with a deny rule or hook, and a CI check.

Instructions are requests that models can fail to follow under pressure, however loud or recent they are. The memory file states the intent. A permission rule denying edits to the migrations folder, or a pre-tool hook, and a CI check that fails when a shipped migration changes, enforce it mechanically. Review remains a backstop, rather than the only defence.

## 6

Why is a 2,000-line memory file usually worse than a 200-line one?

A, memory files load only when the agent asks for them, so a long one is rarely read. B, it loads into every session, costing tokens and diluting attention on the key rules. C, long memory files are always out of date, because nobody reviews them after a month. D, a long file overflows the context window, so the task itself no longer fits.

[think]

The answer is B: it loads into every session, costing tokens and diluting attention on the key rules.

Memory files are loaded in full at the start of every session, so every line costs tokens on every task and competes with the task for the model's attention. The rules that matter get buried, which is why the tools offer scoped rule files that load only when relevant. They are not loaded on request, 2,000 lines fits easily in a modern context window, and length alone does not make a file stale: irrelevant length is the problem.
