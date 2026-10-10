---
lesson: documentation-and-adrs
source: 7f983832660f4d72
fit: great
desk:
  - "ADR 0002, server-side sessions, in full"
  - "The commit table showing how the ADRs changed in their first days"
  - "The worked ADR: the facts table, the weighted criteria and the scored options"
  - "The runbook entry: checks, the failed-deployment log table, and the SQL queries"
  - "How make help builds its menu, traced"
  - "Exercises: which ADRs are in force, and can this image boot against this database"
---
## Introduction

Two years from now someone opens the file that handles session tokens, sees them hashed with plain SHA-256, remembers that every security article says "use a slow hash", and switches to Argon2id. Every authenticated request gets about 100 milliseconds slower, for zero security gain, because 256-bit random tokens cannot be brute-forced at any speed. Or they notice that login verifies a password even when the user does not exist, call it wasted work, and delete it, reopening the timing leak it closed.

Code records what the system does. It rarely records why, what else was considered, or what would have to change for the decision to be wrong. That knowledge leaves with the people who made the decision. So senior engineers write it down, in the right place, for a specific future reader.

Four ideas: every document has one reader and one moment; how a decision record works and how it drifts; writing one end to end, from facts to scores; and runbooks someone can use at 3 in the morning.

## One reader, one moment

The most useful framing is called Diátaxis. It sorts documentation by what the reader is trying to do right now. A tutorial is for someone new who wants to learn by doing. A how-to guide is for someone with a specific task. Reference is for someone who needs the exact facts. And explanation is for someone who wants to understand why.

Mixing them is how documents fail. A README that is half tutorial and half design essay serves neither the newcomer who wants the first command nor the reviewer who wants the rationale. This repository's README gets you from clone to a running app in four commands, and keeps its rationale to one pointer: start with the architecture document, then the decision records.

The why lives at three altitudes. Local decisions live in module doc comments beside the code: 73 of the 100 Rust files carry one. The map lives in an architecture document. And cross-cutting decisions live in architecture decision records.

The best comment in the repository was two sentences on the rate limiter. In-memory limiting "is the right call for a single-instance deployment; the state is per process. If we scale horizontally the same interface can be backed by Redis." That is a complete decision record. It has the decision, the context that makes it right, and the trigger that would make it wrong. When the trigger approached, the limits moved and the comment was rewritten. A good comment states a constraint or a reason, never a restatement of the code.

## Architecture decision records

An architecture decision record, or ADR, captures one significant decision. The widely copied format comes from Michael Nygard's post in 2011: a title, a status, the context, the decision, and the consequences, often with the alternatives considered. ADRs are numbered, kept beside the code, reviewed in pull requests, and not rewritten after acceptance. A changed decision gets a new ADR that supersedes the old one, so the log reads as a history of the system's thinking.

Take Ascend's ADR on sessions: server-side sessions with hashed opaque tokens, not JSON web tokens. Three things make it good. The context names the constraint that makes the decision right: there is a single backend. So a reader can tell when it stops holding. The alternatives say why the obvious option lost, which stops the question being reopened without new information. And the consequences include the cost: one indexed database lookup per authenticated request. An ADR with only upsides is a sales document.

It also ends with "revisit when" triggers. The strongest kind is tied to a number someone can watch. Another of Ascend's ADRs says: past about four API replicas, add PgBouncer. "Revisit if it becomes a problem" is not a trigger, because nothing ever prompts it.

Now the uncomfortable part. ADRs drift. The ADR on bounded AI costs listed request and output-token budgets. Twenty-eight minutes after it was written, a code commit added a daily input-token budget. The ADR never mentioned it, because nothing checks ADRs against code. A review found the gap two days later. And even the correction drifted twice more before it matched. The cheapest guard is a question on the pull request template: does this change an ADR's decision or consequences?

When should you write one? When the decision is hard to reverse, like a storage engine or an auth model; cross-cutting, touching many modules or teams; or contested, because you had to argue for it. A good test: would you otherwise explain this decision to every new hire?

## Writing one, end to end

The lesson writes a full ADR for a real open question: should database migrations run when the server boots, or in a separate release step?

Step one: write the question as a question. "Move migrations out of boot" is a proposal and presumes the answer. The question is: when should migrations run relative to a new version starting, so that deploys, restarts and rollbacks stay safe?

Step two: collect facts, each with its source and how you know it: read in the code, read in the documentation, or observed by running it. The API ran migrations before binding its port. The migration library took no lock. And it refused to boot when the database recorded a migration the binary did not know.

Step three: follow the facts to what nobody wrote down. Here is the scenario. A release's migration commits, and then the new version fails its health check. The platform keeps the old version serving, which looks safe. What happens next?

[pause]

The database now records a migration the old binary does not know. The old binary refuses to boot against it. So the next time the old process crashes and restarts, it exits, and the service is down with no deploy in progress. That hazard, found only by following the facts, is what makes the decision worth an ADR.

Step four: name the criteria and weight them before scoring, so the weights cannot be tuned to favour the option you already like. Each criterion gets a test someone could run. Can an earlier image boot against the current schema? Are concurrent boots safe? Does a long migration race the health window? How few moving parts for a one-person project? And does a failed migration stop the release with the old version still serving?

Step five: list the options, including the status quo, and score them out of 22. The status quo scored 10. A person running migrations by hand before each deploy scored 12, because it depends on a step someone will forget. Boot migration under a database lock, with a check that tolerates a newer schema, scored 17. And a separate pre-deploy migration step scored 19.

Step six: check what the scores depend on. The pre-deploy step beats the lock only on one criterion, the long migration, which carried a weight of one because every migration so far takes under a second. Set that weight to zero, and the two tie. Naming the weight that decides the outcome tells a reviewer which assumption to challenge.

What shipped? The lock option, not the winner. It buys fewer moving parts at exactly the cost it scored zero on, and an honest record says so in its first revisit trigger: the first migration that approaches the health window moves long work out of boot. The scoring did not make the decision. It shrank the disagreement to one named weight. And the facts did more work than the options: the restart hazard made "do nothing" untenable.

## READMEs and generated docs

A README has one job: get a competent stranger from clone to a running system and a passing test. The rule that keeps it honest: the first command must work, on a clean machine, today. The reliable way is to have CI run the same commands the README lists, so a breaking change fails the build instead of silently rotting the docs.

Generated documentation stays correct only while its generator does. The Makefile's help menu is built by a pattern that scans for described targets. Twelve targets had a description, and the menu printed eleven. The missing one was "e2e", because the pattern allowed no digits in a target name, while the README told readers to run it. Widening the pattern fixed it, and a CI step comparing the two counts would catch the next one.

A newer reader is the coding agent. Writing for an agent is writing for the most literal new hire you will ever have: it follows rules exactly and cannot ask the hallway question. So non-obvious rules need their reason attached, like the rule to run throwaway Python through a memory-limited wrapper, which carries the incident that caused it.

## Runbooks for 3 a.m.

A runbook's reader is on call, stressed, possibly new to the service, and on a phone. Every entry has six parts: the symptom, the impact, the checks, the mitigation, the escalation, and the verification. Google's SRE book reports that recording best practices ahead of time gives roughly a three times improvement in time to recovery over winging it.

The checks are where runbooks fail. "Check the database is healthy" is not a step. A step is an exact command with what healthy and unhealthy output look like. For a failed deploy: call the readiness endpoint, and healthy is a 200 with the previous commit as the build; unhealthy is a 503 with the database marked false. Then read the failed deployment's own log, by its ID. Without the ID, the log command shows the most recent successful deployment, the healthy old one. Then a table maps the last lines you see to a cause and a mitigation.

A service can be designed to make runbooks short. This one names the variable in every configuration error, logs each boot stage, and reports database, AI, content version and build from its readiness endpoint. And mitigations carry their warnings: do not delete rows from the migrations table to make a build boot, because the schema changes they describe stay applied.

## In the interview

"Should migrations run at boot?"

[pause]

It depends on forces you can name. Must an older image boot against a newer schema? Do replicas boot at the same time? And how long do migrations run against the health window, the one force boot-time migration still loses? The common wrong answer is "never at boot, it's an anti-pattern", without the forces that make it fine for one replica with sub-second migrations.

And "an accepted ADR turns out to be wrong. What do you do?" Write a superseding ADR and mark the old one superseded, so both reasonings survive. Editing it in place erases why it was once right.

## Recap

Four things to remember. Write each document for one reader at one moment, and keep tutorials, how-tos, reference and explanation apart. A good decision record states the context that makes it right, the alternatives that lost and why, the costs, and an observable trigger, and it is superseded, not silently edited. Write an ADR from a question, sourced facts, criteria weighted before scoring, and options including the status quo, then name the weight that decides it. And runbook checks are exact commands with healthy and unhealthy output.

At your desk: the sessions ADR in full, the commit table, the worked ADR's facts and scores, the runbook entry with its queries, the make help trace, and the two exercises.
