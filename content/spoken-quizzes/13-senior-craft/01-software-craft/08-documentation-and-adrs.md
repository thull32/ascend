---
lesson: documentation-and-adrs
source: 8fca99839b65783b
---
## 1

A decision to rate-limit in memory is documented as: "In-memory is the right call for a single-instance deployment; if we scale horizontally, the same interface can be backed by Redis." What makes this more useful than "We use in-memory rate limiting"?

A, it names a specific technology, so the next engineer knows what to install. B, it is longer, and longer rationale is more likely to survive the next few refactors. C, it lives in a code comment, where readers see it more often than a document. D, it states the context that makes it right, and the trigger that would make it wrong.

[think]

The answer is D: it states the context that makes it right, and the trigger that would make it wrong.

The trigger tells a future engineer when changing the decision is expected rather than reckless, and the context says why it is right until then. Naming Redis is incidental, and where the sentence lives or how long it is matters far less than the conditional reasoning.

## 2

An accepted architecture decision record turns out to be wrong six months later. What should the team do?

A, write a new ADR that supersedes it, and mark the old one as superseded. B, edit the ADR in place so it describes the decision the team made instead. C, leave the ADR alone, and explain the change in a comment next to the code. D, delete the ADR so nobody is misled by an outdated decision.

[think]

The answer is A: write a new ADR that supersedes it, and mark the old one as superseded.

ADRs are a history. Superseding keeps why the first decision was made and why it changed, which is exactly what the next person needs. Editing or deleting erases that history, and a code comment leaves the ADR log asserting something false.

## 3

A release applies migration 15, which only adds a nullable column, and then fails its health check, so Railway keeps the previous deployment serving. An hour later that old process restarts. Now that Ascend plans its own boot migrations, what happens?

A, it waits on the migration lock until the failed release is removed. B, it plans "schema ahead", logs a warning, and serves as before. C, it runs migration 15's down step, so the schema matches its own again. D, it refuses to boot, because its migrator does not know migration 15.

[think]

The answer is B: it plans "schema ahead", logs a warning, and serves as before.

Ascend's planner finds a migration it does not know and none of its own pending, so it starts without migrating, and an expand-only change leaves the old code able to read and write. Before that fix, the migration library's own check refused the unknown migration, so the restart took the service down with no deploy in progress; that is the hazard the lesson's worked ADR exposed. Nothing runs down steps automatically, and the advisory lock is held only while a boot is migrating.

## 4

A runbook step says: check whether the database is healthy. What is the main problem?

A, runbooks should leave databases to the DBA team, and cover only the application. B, it is not actionable: give the exact command, and what healthy output looks like. C, it is too short: runbook steps should explain the database architecture first. D, it belongs in an ADR, because database health is an architectural decision.

[think]

The answer is B: it is not actionable.

On-call readers need checks they can paste, with expected results: for example, call the readiness endpoint and read its database field, which is false both when Postgres is down and when the pool stayed busy for the 5 second acquire timeout. More background, or a different document, does not fix a step nobody can execute.

## 5

Before a recent fix, Ascend's Makefile had 12 targets with a help description, but make help printed only 11. Why?

A, its awk script dropped any target whose recipe spanned several lines. B, its grep pattern allowed no digits in a target name, so the e2e target never matched. C, targets with prerequisites were filtered out by the grep pattern. D, make hid every target that also appeared in the phony declaration.

[think]

The answer is B: its grep pattern allowed no digits in a target name, so the e2e target never matched.

The pattern allowed only letters, underscores and hyphens before the colon, and e2e contains a digit. Prerequisites and multi-line recipes are irrelevant: the run target, which depends on others, still matched, and the phony line fails to match only because it starts with a dot. The fix added digits to the pattern, which prints all 12, and a CI check comparing the counts would have caught it.

## 6

A README's setup section has not been tested for a year. What is the most reliable way to keep it correct?

A, add a banner warning readers that the steps may be out of date. B, ask each new hire to fix whatever breaks during their first week. C, move the setup steps to a wiki, where anyone can edit them. D, have CI run the same setup and test commands the README lists.

[think]

The answer is D: have CI run the same setup and test commands the README lists.

If CI exercises the documented commands, a breaking change fails the build, instead of silently rotting the docs. Warnings and wikis only move the problem, and relying on new hires makes their first day the test.
