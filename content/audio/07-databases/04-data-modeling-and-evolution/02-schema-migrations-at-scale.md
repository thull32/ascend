---
lesson: schema-migrations-at-scale
source: 63f38503abb9b4a5
fit: great
desk:
  - "The table of locks and rewrites for each common DDL statement, and how to measure your own"
  - "The lock queue reproduced with four sessions, and the lock timeout retry loop with its per-second numbers"
  - "The phases of a concurrent index build and the two invalid-index states"
  - "The batched backfill procedure and the batch-size table"
  - "This app's migrations, read closely"
  - "Exercise: simulate the table-lock queue"
---
## Introduction

At two minutes past two, an engineer ran a migration that added a public ID column to the orders table: a UUID, not null, defaulting to a freshly generated random UUID. In staging, with ten thousand rows, it took 40 milliseconds. In production, with 400 million rows, it held an access exclusive lock on orders while it rewrote every row. Every select on orders queued behind the lock, the connection pool filled with waiting queries, the API returned errors, and checkout was down until the rewrite finished. The migration had been code-reviewed and had passed CI.

The same statement with a constant default, say zero, would have taken under a millisecond. Since Postgres 11, a constant default is stored once in the catalog instead of in every row. A random UUID is different: each row needs its own value, so the table is rewritten. On a lab table of 2 million orders, the rewrite took 2.7 seconds and wrote 293 megabytes of write-ahead log. Scaled to 400 million rows, that is about nine minutes.

Schema changes are the most dangerous routine database operation. The same statement is free at small scale and an outage at large scale, and the failure is not "the migration errors". It is "everything else stops". Three ideas: which statements rewrite or scan, the lock queue that turns even an instant statement into an outage, and the expand and contract sequence that makes any change boring.

## Catalog-only, scan, or rewrite

Here is the first surprise. Almost every alter table statement takes access exclusive, the strongest lock, which blocks reads and writes alike. Adding a nullable column takes it, and finishes in a quarter of a millisecond. A rename takes it, and finishes in a fifth of a millisecond. So the lock level alone never tells you a statement is safe. What matters is how long the statement holds it, and that depends on whether it is catalog-only, scans the table, or rewrites it.

Catalog-only is cheap because of how rows are stored. Each row's header records how many columns it holds, and when Postgres reads a column beyond that, it returns a default instead of failing. Since version 11, a non-volatile default is evaluated once and stored in the catalog, and old rows simply read that missing value. Dropping a column is the same trick in reverse: the column is marked dropped, and its bytes stay in old rows until the table is rewritten.

Two traps hide in "non-volatile". The function now counts as stable, so it is evaluated once: every existing row gets the moment of the alter, catalog-only and probably not what you meant. Clock timestamp, random, and generate random UUID are volatile, and force a rewrite.

A rewrite builds new files for the table and every index under access exclusive, and swaps them in at commit. Type changes do it too: int to bigint rewrote the heap and every index, and text to a varchar of 20 rewrote the table because every value had to be checked. Widening a varchar from 20 to 40 did not. And some statements scan without rewriting: setting not null and adding a check constraint both read every row under access exclusive, 71 and 48 milliseconds on 2 million rows, which grows with the table. The constant default, by comparison, wrote 27 kilobytes of log.

The way to know is to measure. In a transaction, note the table's file node, run the statement, and check the file node again. A new one means a complete new copy of the table.

## The lock queue

Rewrites explain the opening incident. They do not explain why a quarter-millisecond add column can also take a site down. The lock queue does.

Postgres grants table locks in arrival order. A new request is granted only if it conflicts neither with the locks already held nor with the requests already waiting ahead of it. That second rule stops a stream of readers from starving a writer forever. So picture three actors: a report, a migration, and the application. The report has an open transaction that read orders, so it holds the weakest lock, access share. The migration's alter arrives and needs access exclusive, so it waits for the report. Now the application sends a simple select. Does it run?

[pause]

No. The select is compatible with the report, but it conflicts with the alter that is waiting ahead of it, so it queues behind the alter. So does every update. The pool fills and the API returns errors. In the lab, the report committed three seconds later and everything completed, so a one-row lookup took three seconds. A real report holding its transaction for four minutes means four minutes of outage for a statement that runs in 0.3 milliseconds. And the readers are blocked by the migration, not by the report.

The defence is to make the migration give up quickly, and retry until it finds a gap. Set a lock timeout of 200 milliseconds and wrap the statement in a retry loop. The lab ran 36 thousand reads a second while a report held its lock for 4 seconds. Without a timeout, reads stopped completely for over two seconds, and the unlucky ones waited 3 and a half seconds. With the timeout, the migration failed six times, succeeded on the seventh once the report committed, and no read waited more than 200 milliseconds. Pick the timeout from your latency budget, because every attempt can delay readers by up to its value.

Two more guards belong in the runbook: a statement timeout, so a supposedly catalog-only statement cannot silently rewrite for ten minutes, and an idle-in-transaction timeout on application roles, to kill the forgotten session before it blocks you.

## Constraints and indexes without the long lock

Constraints have a two-step form. Add the check constraint as not valid: that takes under a millisecond, and checks new and updated rows from then on, but not old ones. Then validate it, which scans the table under a much weaker lock, share update exclusive, while reads and writes continue. The same trick gets you not null on a big table. Add a check that the column is not null, not valid; validate it; then set not null. Since Postgres 12, that last step sees the validated check and skips its own scan. Then drop the redundant check. Foreign keys follow the same pattern.

Indexes have a concurrent form. A plain create index takes a share lock: reads continue, but every write waits for the whole build. Create index concurrently lets writes continue too, for about 10 percent more time on the idle lab table, and more under heavy writes. Three behaviours catch teams out.

It cannot run inside a transaction block, so a framework that wraps each migration in a transaction must be told not to for this one. It waits for old transactions it has nothing to do with: its last phase waits until every transaction in the database whose snapshot predates it has finished, so one long analytics query anywhere can stretch a five-minute build to an hour. And a failure leaves an invalid index behind.

That last one has two flavours. A unique build that hits a duplicate fails early and leaves harmless debris. But a build cancelled during that final wait has already been marked ready, so every write maintains it, while the planner never uses it. In the lab, 200 thousand inserts went from 356 milliseconds to 504 with that dead index present. Check for invalid indexes after every concurrent build, and drop them concurrently or rebuild them in place.

## Expand and contract

Everything so far makes one statement safe. Real changes, renaming a column, splitting one, moving data, are several statements plus code, and you cannot deploy the application and the schema atomically. During a rolling deploy, two code versions run at once, so every schema change must be compatible with the code already running.

The pattern is expand and contract. Take a users table whose name column holds "Ada Lovelace", which must become a first name and a last name. Five phases, each its own deploy. Expand: add the two new columns, catalog-only. Write both: the code writes the old and new columns in one statement, and still reads the old. Backfill: a batched job, not a migration, fills the new columns for older rows. Read new: the code switches its reads. And contract: drop the old column, days later.

Why write before reading? Because once every write fills both shapes, only rows older than that deploy need the backfill, and the read switch can be verified against complete data. At every phase you can roll the code back one step, except the last. Contract is the one step that makes rollback impossible, so it waits longest, until metrics show nothing reads the old column.

Watch for one trap in the write-both phase. If the two shapes are written by separate statements, two requests can interleave and leave the columns describing different names, with no request at fault. Inside one database, write both shapes in one statement or one transaction. Across two stores no such lock exists, so write one store and derive the other from its change stream.

## Backfills, and verifying before you switch

The backfill was measured on 2 million rows, with a procedure that commits after every batch while application updates ran alongside. Total log volume was about the same whatever the batch size, roughly 300 bytes per row. Batch size does not change how much work there is. It changes how that work lands.

The single update of all 2 million rows finished in 4.4 seconds, about as fast as batches. But every updated row stays locked until commit, so application updates waited a mean of 1.2 seconds and up to 4.2. With 10 thousand row batches, they waited at most about 80 milliseconds. The single statement also reached replicas and change data capture as one burst of 690 megabytes. Batches of a few thousand to ten thousand rows, sized to your latency budget, are the usual choice: sleep between them and pause when replica lag passes your threshold.

Two details make batches work. Key them on the primary key, "id greater than the last one", not with an offset: one offset batch near the end walked 2 million index entries in 67 milliseconds, while the keyset version read 63 pages in under a millisecond. And skip rows whose new column is already filled, so a rerun after a crash is harmless.

Then verify, because "the backfill ran" does not make it right. The lab's split rule turned "Prince" into a first name and no last name, and "Mary Ann Evans" into Mary and "Ann Evans". Nothing errored. Count the rows the backfill missed, check that the round trip loses no information, and ask the product whether "reversible" is also "correct". Better still, ship shadow reads behind a flag: read both shapes, serve the old one, count disagreements, watch the count at zero for a day, then switch. Feature flags make the write-both and read-new switches instant and reversible, and each data-migration flag gets an owner and a removal date.

## In the interview

Here is the follow-up the lesson leads with. The migration only adds a nullable column. Why did it cause an outage?

[pause]

The statement is catalog-only, but it needs access exclusive. It queued behind a long-running transaction, and because lock requests are granted in order, every later select queued behind it. A lock timeout with retries bounds the damage to the timeout. The wrong answer is "adding a column rewrites the table", which is false for nullable columns and blind to the queue.

And one more. Your primary key is an int approaching 2.1 billion. What is the plan? Changing the type to bigint rewrites the heap and every index under access exclusive, and the lab's 2 million rows took 1.3 seconds on a table a thousand times smaller than yours. So: add a bigint column, write both, backfill in keyset batches, build a unique index concurrently, then swap the primary key to it and rename in one short transaction. Not "run the alter at night".

## Recap

Four things to remember. The lock level never tells you a statement is safe; whether it is catalog-only, a scan or a rewrite does, and volatile defaults and incompatible type changes rewrite. Lock requests are granted in order, so an instant alter behind an open transaction stops every reader; never run DDL on a busy table without a lock timeout and a retry loop. Add constraints not valid and then validate, build indexes concurrently, and check for invalid leftovers that still cost every write. And break incompatible changes into expand, write both, backfill in keyset batches, verify, read new, and contract, with rollback meaning rolling the code back one phase.

At your desk: the lock and rewrite table, the lock queue reproduction and its retry numbers, the phases of a concurrent build, the backfill procedure and batch-size table, this app's own migrations, and the lock-queue simulation exercise.
