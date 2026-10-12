---
lesson: mvcc-and-locking
source: 11119b384bf5a531
---
## 1

A queue table of 168 kilobytes has grown to 17 megabytes. Vacuum verbose reports 200 thousand tuples that are dead but not yet removable. What should you check first?

A, whether autovacuum is disabled, or throttled too hard to keep up. B, whether the disk is too full for vacuum to compact the file. C, whether the table is missing an index on its run-at column. D, what is pinning the oldest visible transaction horizon, such as an idle transaction.

[think]

The answer is D: what is pinning the horizon, such as an idle transaction.

Vacuum ran and found the tuples, so it is not disabled. It refused to remove them because some snapshot might still need them. Look in the activity view for sessions holding old snapshots, then at replication slots and prepared transactions. In the lab, ending one idle session let the next vacuum remove all 200 thousand.

## 2

After the culprit session is ended and vacuum runs, the 17 megabyte table still occupies 17 megabytes. Why?

A, the visibility map must be rebuilt before any space is freed. B, the dead tuples are still needed by the next autovacuum cycle. C, freed space is only returned to the operating system at the next checkpoint. D, vacuum makes space reusable; only a rewrite returns it.

[think]

The answer is D: vacuum makes the space reusable, and only a rewrite returns it.

Plain vacuum frees line pointers and space inside pages for future inserts, and only truncates empty pages at the very end of the file. The measured file was 98.7 percent free space, and a sequential scan still read all 2,188 pages. Vacuum full, or the pg repack tool, rewrites the table, which brought it back to 168 kilobytes.

## 3

An update of an unindexed column, on a page with free space, leaves the primary-key index unchanged. How does a lookup by ID still find the new version?

A, Postgres updates the row in place when no indexed column changes. B, the index entry is rewritten lazily by the next index scan. C, vacuum adds the new entry to the index before any read occurs. D, the lookup lands on the old version, and follows the heap-only chain.

[think]

The answer is D: the lookup lands on the old version and follows the heap-only chain.

A heap-only update writes the new version on the same page, flags it as heap-only, and points the old version at it. The index still points at the root line pointer, and readers follow the chain; after vacuum, the root becomes a redirect. Postgres never updates in place, and no index entry is added for heap-only tuples.

## 4

During a lock wait, the locks view shows session A holding an exclusive lock on its own transaction ID and waiting for a share lock on session B's transaction ID. Session B holds its own and waits for A's. What is happening?

A, a deadlock: each waits for the other's transaction to end. B, two readers are blocked behind a single writer on one busy row. C, both sessions are waiting on disk reads, and the locks are only bookkeeping. D, a lock escalation from row locks to a table lock is in progress.

[think]

The answer is A: a deadlock, each waiting for the other's transaction to end.

Row-lock waits appear as a share-lock request on the holder's transaction ID, and every writing transaction holds an exclusive lock on its own ID. Each session waits for the other's, which is a cycle. After the deadlock timeout, one backend runs the detector and aborts itself with a deadlock error. Postgres never escalates row locks.

## 5

Twenty workers each select the oldest job, ordered by run-at, limit one, for update, then process the job and delete it. Throughput equals one worker's. Why, and what fixes it?

A, Postgres limits concurrent writers per table, so partition the jobs table. B, for update takes a table lock, so workers run one by one; use for share. C, without an index on run-at, every worker scans the table; add one. D, all workers pick the same oldest row and queue on it; add skip locked.

[think]

The answer is D: they all queue on the same row, so add skip locked.

Every worker's query finds the same row first, so all but one wait on its row lock. The lab measured 390 jobs a second with 16 workers, against 5,807 with skip locked. For update locks rows, not tables, and there is no per-table writer limit. A lease column covers workers that crash mid-job.

## 6

A cron job takes a session-level advisory lock with try-advisory-lock, and releases it with advisory-unlock, through PgBouncer in transaction mode. Sometimes two instances run, and sometimes the lock seems stuck. Why?

A, session locks stay on one server connection, while the client's transactions may move. B, advisory locks are released at the end of each statement that takes them. C, PgBouncer strips advisory lock calls, so they never reach the server. D, hash collisions map different job names onto one advisory lock key.

[think]

The answer is A: session locks stay on one server connection, while transactions may move.

In transaction mode, a client owns a server connection only for the duration of a transaction. A session lock taken in one transaction stays with that server connection after the client moves on, so the unlock may go to a connection that does not hold it, while other clients reuse the one that does. A collision could make a lock look stuck, but cannot let two instances run. Use the transaction-scoped advisory lock inside one transaction.
