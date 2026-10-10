---
lesson: data-and-migrations
source: d680ee2261abe4e5
fit: great
desk:
  - "The schema diagram and the table of indexes and the queries they serve"
  - "The progress upsert, the budget's conditional upsert and its two-request trace"
  - "The retention trace for submissions, and the boot migration plan table"
  - "Exercise: reproduce the streak calculation"
---
## Introduction

The schema is the part of a system you cannot redeploy your way out of. Code can be rolled back in a minute. A column that was dropped, a constraint never added, or rows that reference content that no longer exists stay wrong until someone writes a migration and a backfill. That is why a senior reviewer reads the migrations before the services.

Ascend's database is small: sixteen tables across fourteen migrations, and almost every row is owned, directly or indirectly, by a user. What makes it worth studying is what is not in it, the curriculum; how its writes avoid read-modify-write races; how it forgets; and how the schema changes while the previous version of the code is still serving traffic.

## Content by slug, not by foreign key

There is no lessons table and no problems table. The curriculum is Markdown compiled into the binary, and progress rows reference a lesson by its stable slug: track, module and lesson.

The rejected alternative is to load content into tables on each deploy and point foreign keys at them. That buys referential integrity, and costs a synchronisation step that can fail halfway, plus a migration whenever the content model changes. The failure modes prevented: a content edit that needs a schema change, and reordering lesson files that loses anyone's progress. Identity is the slug in the front matter, never the file position.

What it costs is integrity. The database will accept a slug that says "nonsense"; the only guard is the service, which checks the slug against the in-memory curriculum. A renamed lesson leaves orphan rows, and the dashboard's completed count then disagrees with the per-track bars, which count only lessons that still exist. A slug rename is a coupled change, content plus a data migration, and nothing enforces that the two ship together. At scale, give each lesson an immutable id and treat the slug as an alias.

## Check, then act

Marking a lesson complete is one statement: insert the progress row, and on a conflict on the composite key of user and lesson, update the status and timestamps, returning the row. The creation time is deliberately left out of the update, so it keeps the moment the learner first opened the lesson. And the statement is idempotent: sending it twice leaves the same state as sending it once.

Compare the version everyone writes first: select the row; if it is absent, insert, otherwise update. Two tabs or a client retry run it concurrently, both selects see nothing, both insert, and the second fails on the primary key: a 500 for what should have been a no-op. With the upsert, Postgres resolves the conflict inside one statement and both requests succeed.

The AI budget shows the same principle applied to a limit, and its history teaches more than its final form. An early version read today's usage row, compared the count with the limit in Rust, and then ran an atomic increment. Each statement was atomic. The sequence was not.

Before I tell you what happened: a learner is at 149 of a 150-request limit, and two requests arrive together. What is the count afterwards?

[pause]

151. Both read 149, both passed the check, both incremented. The overshoot was bounded by concurrency, which made it easy to miss. The fix folded the check into the upsert itself: update only where the count is still under the limit, and return the row only if something changed. No row back means over budget. Under Postgres's default isolation, the second request waits for the first one's row lock, then re-checks the condition against the newly committed row: 150 is not under 150, so it is refused. A test fires 30 reservations at once against a limit of 10 and asserts that exactly 10 succeed.

The budget later outgrew one statement, when it began holding tokens for each request in flight. So it now takes the lock explicitly in a transaction, with a select for update, and the same 30-way test still grants exactly ten. The rule: the check and the act must be the same statement, or run under a lock. Ascend has used both.

Review found more places where they were not. Registration selected by email, then inserted, and the loser of a race saw a 500; now it inserts and lets the unique index decide, and a violation becomes a 409. Starting an interview abandoned the old one and inserted a new one, and two concurrent starts left two active interviews. The fix uses two tools at once. A partial unique index, on user, only where the status is active, makes two requests safe: the second insert waits on the first's index entry and fails once it commits. And a transaction makes one request atomic, so a failed insert does not leave the old interview abandoned. A transaction alone would not have done it: under the default isolation, neither sees the other's uncommitted insert, and both succeed.

## Streaks: history from an overwritten column

The dashboard streak used to be computed from the updated-at column of each progress row, plus quiz attempt times, as UTC days. The walk backwards from today was correct. The inputs were not, in three ways.

First, UTC days. A learner in California who studies at eight in the evening on Monday and nine the next morning produces activity at three and sixteen hundred UTC on Tuesday: two local days, a streak of one. Second, a mutable column. Updated-at is overwritten by every upsert, so touching an old lesson moved that lesson's day, and the earlier day vanished. That is the last time each lesson was touched, not a history, and overwritten history cannot be recounted. Third, a day spent only on practice problems broke the streak.

The fix replaced the input, not the walk. A new append-only fact table holds one row per learner per day, and every service that records learning calls one function that inserts today and does nothing on conflict. The migration backfilled it from what survived, and that backfill is the lesson in miniature: it could only recover what had not been overwritten. Derived values need an event log, and the sooner it exists, the more history it holds.

The time-zone problem outlived that fix, because the insert still used the UTC date. A later change stored each learner's time zone and had Postgres compute the local date in the insert itself. Replay the California learner: three UTC on Tuesday is eight on Monday, sixteen hundred is nine on Tuesday. A streak of two.

## How the database forgets

The migration conventions say rows a user owns privately cascade when the user is deleted. That rule used to be simpler, and it had a flaw nobody had exercised.

Comments cascaded from their author, and replies cascaded from their parent. When a learner deleted one comment, the service soft-deleted it and the thread kept its shape. But deleting an account would have hard-deleted that user's comments, and the second cascade would then have deleted every reply other people wrote to them. The listing even had a "deleted user" branch the cascade guaranteed could never run. Nobody noticed, because no account-deletion endpoint existed yet.

The fix shipped with that endpoint: the comment's author becomes null on delete. Other people's replies survive, under "deleted user"; everything else the learner owns still cascades. Why not the alternatives? Stopping the cascade at the parent orphans replies, stripped of the question they answer. Soft-deleting users keeps the whole user row and adds a filter to every query. Setting null removes the identity and keeps the conversation. It is also a product and legal decision, stated on the profile page.

Then retention. Until a later change, nothing was deleted unless a learner deleted it, which a privacy page cannot honestly describe. Now an hourly round enforces the page: submissions kept 180 days, conversations and interviews a year, AI usage 90 days. The subtle rule: deleting history must never unsolve a problem, so an old submission goes only when a newer attempt exists and, if it passed, a newer pass too. Deletes run in batches of 5,000 under an advisory lock. The first version ran the whole round in one transaction, so row locks stayed held until it committed; now each batch commits on its own.

## Migrations: append-only, on boot, compatible with the past

Migrations are append-only. A bookkeeping table records which ones a database has applied, so editing a shipped file changes nothing on a database that already ran it, and development, CI and production silently diverge. New columns arrive in new migrations, nullable or with a constant default, so old code that does not know them keeps working.

They run on boot, before the server binds, inside a transaction holding a Postgres advisory lock, so a second replica booting at the same moment waits and then finds nothing to do. Under the lock, the build compares the migrations it knows with the ones applied. Rollback used to be broken: the migrator refused to start when the database recorded a migration the binary did not know, so after any release that migrated, the previous release could not boot. A later fix made that case a warning: the schema is ahead, start without migrating. Two branches with different new migrations still refuse to boot.

Now the consequence that catches teams out. During a rollout, the old code is still serving traffic against the new schema. Every migration must work with the release before it, which is expand and contract. To rename a column: add the new one beside the old, write both and backfill; switch reads in the next release; drop the old column in the one after.

The comments fix shows a subtler version. Making the author column nullable is an expand step, harmless to old code. But the old release decodes that column as never null, so once the new code has deleted one account, rolling back would turn every thread with an anonymised comment into a 500. An expand step is safe for rollback only until the new code writes values the old code cannot read.

## In the interview

A follow-up you should be ready for. How do you guarantee one active interview per learner when two starts race?

[pause]

A partial unique index on user, where the status is active, makes the second insert wait on the first's index entry and fail once it commits, which becomes a 409. The transaction around abandon-and-insert makes each request atomic. The common wrong answer is "a transaction is enough", which under read committed lets both inserts succeed.

And: what in this schema hurts first at 100 times the users? Submissions, which hold up to 64 kibibytes of code per row; then the dashboard, which loads a learner's whole history per visit; then connections, 15 per replica, doubled during a rolling deploy; then boot time, as replicas queue behind the migration lock. Not "shard the database", which is years early.

## Recap

Five things to remember. Content is referenced by slug, which keeps edits migration-free and costs integrity on renames. The check and the act must be one statement or run under a lock, and a concurrency fix needs a concurrent test. Derived values such as streaks need an append-only event log, because a backfill recovers only what was not overwritten. Cascades and retention are product decisions: never cascade into other people's content, and never let deleting history change a derived fact. And every migration must be compatible with the release still serving, which is expand and contract.

At your desk: the schema diagram and index table, the upsert and budget statements, the retention and migration-plan traces, and the streak exercise.
