---
lesson: mvcc-and-locking
source: 605b3c8e1a320c67
fit: great
desk:
  - "The pageinspect dumps of one row through two updates, a delete and a vacuum"
  - "The snapshot format and the two visibility rules, written out"
  - "The pg_locks output during a deadlock, read as a wait-for graph"
  - "The SKIP LOCKED queue schema and the diagnostic queries for the xmin horizon and blockers"
  - "Exercise: which version does this snapshot see?"
---
## Introduction

On Friday afternoon an engineer opens a session on the production primary, types begin, runs one select to check something, and goes home without closing the terminal. By Monday the jobs table, which never holds more than a few thousand rows, occupies gigabytes. Queries against it are several times slower. Autovacuum has run on it hundreds of times without reclaiming anything. Nothing in the application changed.

The lab reproduced it in miniature. A jobs table of 2,000 rows occupies 168 kilobytes. A second session opens a transaction, runs one select and sits idle. After fifty rounds of normal queue work, the table still holds 2,000 live rows, but occupies 17 megabytes, vacuum reports 200 thousand rows "dead but not yet removable", and the query that picks the next job reads 2,188 pages instead of about 20.

Everything in that story follows from one design decision: Postgres never overwrites a row. Four ideas follow from it. How row versions and snapshots work. What vacuum does, and what stops it. How locks still make writers wait for writers. And how to build a job queue that scales.

## One row's versions

Every row version carries two transaction IDs: the one that created it, called xmin, and the one that deleted or replaced it, called xmax, empty if none.

Follow one row. An update does not change it in place. It stamps the old version with the updater's ID, writes a new version on the same page, and points the old one forward to it. If no indexed column changed and the page had room, this is a heap-only tuple update, HOT: no new index entry at all. The index still points at the original version, and a lookup follows the chain. Update again, and the chain grows by one. A delete writes nothing new. It just sets xmax on the existing version.

Then vacuum runs. It removes the dead versions and keeps the survivor. The original slot, the one the index still points at, becomes a redirect to the live version, so the index keeps working without being touched. And the file never shrinks during any of this. Freed space is reused by later inserts.

## Snapshots and visibility

Which version does your query see? That depends on its snapshot. A snapshot says three things: every transaction below one ID had finished when it was taken, every transaction from a higher ID on had not started, and here is the list of the ones that were running in between.

A version is visible when two things hold. The transaction that created it counts as committed for your snapshot. And the transaction that deleted it either does not exist, aborted, or does not count as committed for your snapshot. Read committed takes a new snapshot per statement. Repeatable read and serialisable take one at the first statement and keep it. That is the entire mechanism behind isolation levels.

So readers never block writers. A writer creates a new version; a reader's snapshot simply keeps showing it the old one. Nobody waits. The bill is the old versions, which somebody must clean up.

One oddity follows. Checking the commit log for every row would be slow, so the first reader to learn that a row's creator committed sets a hint bit on the row. Setting it dirties the page. That is why a read-only query can write: after a large update in the lab, the first index scan over the table dirtied about 16 thousand pages. Bookkeeping paid once, and a surprise if you see write traffic from a select after a bulk load.

## HOT, dead tuples and vacuum

HOT is what keeps this affordable on update-heavy tables. When it works, indexes are untouched, and any later visit to the page can prune the dead chain on the spot, without waiting for vacuum. When it fails, every index gets a new entry. In the lab, updating an unindexed column on 100 thousand users whose pages were completely full could not use HOT, and the primary key index doubled in size, its leaves falling to 45 percent full.

A version is dead once its deleter committed before every snapshot still in use. Vacuum finds dead versions, removes their index entries, frees their slots, and sets the visibility map bits that make index-only scans possible. It does not shrink the file. A full vacuum rewrites the table compactly, but under a lock that blocks even reads.

Autovacuum starts on a table once dead rows exceed 50 plus 20 percent of the table. For a 100 million row table, that is 20 million dead rows before vacuum even starts. And it is throttled: with the defaults it can scan cached pages at about 780 megabytes a second, but dirty only about 39 megabytes a second, which is why a vacuum with lots to remove crawls. Large, busy tables need their own settings.

## The xmin horizon

Here is the Friday bug. Vacuum can remove a version only if no snapshot could still see it. The oldest snapshot in the database sets the xmin horizon, and every version deleted after it must be kept.

Three things hold the horizon back. A long-running query or transaction, including a forgotten begin that shows up as idle in transaction. A replication slot whose consumer is down or slow, or a standby reporting its oldest query back to the primary. And a prepared two-phase-commit transaction nobody finished.

Before I give you the measurement: you find the idle session and end it, and vacuum runs. Is the table back to 168 kilobytes?

[pause]

No. Vacuum removed all 200 thousand dead rows, and the file stayed 17 megabytes, almost 99 percent free space. The next-job query still read 2,188 pages, because a sequential scan reads every empty page. Space gets reused, so the table stops growing, but only a rewrite returns it. After a full vacuum: 168 kilobytes, 21 pages, a third of a millisecond. Then set an idle-in-transaction timeout so it cannot happen again.

## Wraparound

Transaction IDs are 32 bits and compared in a circle: each ID sees about two billion IDs in its past and two billion in its future. A row created long enough ago would eventually appear to be from the future, and vanish. Vacuum prevents that by freezing old rows, marking them visible to every snapshot whatever their ID. Autovacuum forces an aggressive freeze once a table's oldest unfrozen ID passes 200 million.

If freezing cannot finish, because of the same pinned horizon or a huge table throttled too hard, Postgres warns tens of millions of IDs ahead, and then, a few million short of the limit, stops assigning transaction IDs. Every write stops until a vacuum completes, which on a large table can take hours or days. Sentry was down for most of a working day in 2015 from this. Mailchimp's Mandrill was down about 40 hours in 2019, with an initial vacuum estimate of weeks. Monitor the age of the oldest frozen ID, and alert well before a billion.

## Row locks and deadlocks

MVCC removes reader-writer blocking. Two writers to the same row still conflict, because only one can create the next version. The second waits for the first to finish.

Postgres stores a row lock in the row's own xmax, not in a shared lock table, so locking ten million rows costs no shared memory. Waiting for a row lock is really waiting for the holder's transaction to end. There are four row lock strengths, and the two weak ones exist for a reason: inserting a comment takes a key-share lock on the user it references, and that must not block someone updating the user's display name.

Every statement also takes a table lock. Selects and writes do not conflict, but most alter table forms take the strongest lock, which conflicts even with select and queues behind any open transaction while every new query queues behind it.

Now deadlocks. Two transfers run in opposite directions. Session A debits account one; session B debits account two. A tries to credit account two and waits for B. B tries to credit account one and waits for A. A cycle: no amount of waiting helps. In the lab you could see it in the lock table, each session holding a lock on its own transaction ID and waiting for a share lock on the other's. When the deadlock timeout expires, one second by default, the waiting session runs the detector, finds the cycle, and aborts itself.

That timeout is what makes deadlocks expensive. Sixteen clients transferring between ten accounts in random order managed 6.7 transactions a second. In ascending account order, about 8,200. The fix is one global lock order: select the rows for update, ordered by ID, and then update them in any order you like.

## A job queue with skip locked

Row locks give you a correct job queue inside Postgres. Each worker runs one update that claims up to ten ready jobs, with a five-minute lease, picked by a subquery that selects for update with skip locked.

Without skip locked, every worker's subquery finds the same oldest row, and all but one wait on its lock. With a 400 thousand job queue and 2 milliseconds of work per job: one worker did about 370 jobs a second either way. Sixteen workers with plain for update did 390. Sixteen workers with skip locked did about 5,800. Fifteen times the throughput. Without it, sixteen workers do the work of one.

The lease means a crashed worker does not lose its job; it becomes claimable again when the lease expires. That is at-least-once delivery, so jobs must be idempotent. And the weakness is the opening story. A queue table is pure churn, an insert, an update and a delete per job, so it bloats instantly when the horizon is pinned. Give it aggressive autovacuum settings and alert on its size.

When the thing to lock is not a row, say only one instance of the nightly billing job, use an advisory lock: a named lock Postgres holds for you. Prefer the transaction-scoped form. A session-scoped lock behind a transaction-mode pooler can end up attached to a connection someone else is now using.

## In the interview

A follow-up the lesson expects. Vacuum runs constantly, but the table keeps growing. Why?

[pause]

Something holds the xmin horizon back, so the dead rows are not yet removable. Look for it in the activity view, the replication slots, and the prepared transactions. The wrong answer is "autovacuum is too slow, add workers", which cannot remove rows a snapshot might still need.

And: why do readers never block writers in Postgres? Writers create new versions instead of modifying the one readers see, and each reader's snapshot decides which version it gets. The cost is dead versions that vacuum must remove. The wrong answer, "reads take shared locks that writers can skip", describes lock-based engines.

## Recap

Four things to remember. Updates write new versions and snapshots pick which one you see, which is why readers never block writers and why somebody must vacuum. One forgotten transaction pins the xmin horizon for the whole database, and even after you end it, vacuum frees space without shrinking the file. Writers still block writers, and deadlocks cost a full second each before detection, so lock in one global order. And build queues with skip locked and a lease: fifteen times the throughput of the naive version.

At your desk: the row-version dumps, the visibility rules, the deadlock in the lock table, the queue schema and diagnostic queries, and the visibility exercise.
