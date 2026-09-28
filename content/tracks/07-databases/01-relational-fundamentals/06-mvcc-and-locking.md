---
slug: mvcc-and-locking
title: "MVCC and locking: how Postgres lets readers and writers coexist"
description: Row versions traced through INSERT, UPDATE, HOT chains and VACUUM with pageinspect, snapshots and visibility rules, bloat from a pinned xmin horizon measured, wraparound, row and table locks, a deadlock caught in pg_locks, and a SKIP LOCKED job queue that is fifteen times faster than the naive one.
minutes: 35
difficulty: hard
tags: [mvcc, vacuum, locking, deadlock, postgres, concurrency, skip-locked, hot-updates]
problems: [time-based-kv]
---
On Friday afternoon an engineer opens a `psql` session on the production primary, runs `BEGIN;` and a `SELECT` to check something, and goes home without closing the terminal. By Monday the `jobs` table, which never holds more than a few thousand rows, occupies gigabytes, queries against it are several times slower, and autovacuum has run on it hundreds of times without reclaiming anything. Nothing in the application changed.

The lab reproduces it in miniature on PostgreSQL 17. A `jobs` table holding 2,000 rows occupies 168 kB. A second session runs `BEGIN ISOLATION LEVEL REPEATABLE READ` and one `SELECT`, then sits idle. Fifty rounds of the queue's normal work (claim every job with an `UPDATE`, finish it with a `DELETE`, enqueue 2,000 more) later, the table still holds 2,000 live rows but occupies **17 MB**, `VACUUM VERBOSE` reports `0 removed ... 200000 are dead but not yet removable`, and the query that picks the next job reads 2,188 pages instead of about 20. Everything in that story follows from one design decision: Postgres never overwrites a row.

## Under the hood: one row's versions, traced

Every row version (a *tuple*) carries `xmin`, the transaction that created it, and `xmax`, the transaction that deleted or replaced it (0 if none). `pageinspect` shows the lifecycle of one row, step by step, on a table `mv(id int primary key, balance_cents bigint)` holding two rows written by transaction 1515930:

**Step 1, after `UPDATE mv SET balance_cents = 6000 WHERE id = 1` (transaction 1515932):**

| lp | t_xmin | t_xmax | t_ctid | flags |
|---|---|---|---|---|
| 1 | 1515930 | 1515932 | (0,3) | HOT_UPDATED |
| 2 | 1515930 | 0 | (0,2) | |
| 3 | 1515932 | 0 | (0,3) | HEAP_ONLY |

The old version (line pointer 1) is still on the page, stamped with the updater in `xmax` and pointing forward to its replacement at `(0,3)`. Because `balance_cents` is not indexed and the page had room, this was a **heap-only tuple (HOT) update**: the new version is flagged `HEAP_ONLY` and no index entry was created. The primary-key index still holds exactly two entries, pointing at `(0,1)` and `(0,2)`; a lookup for id 1 lands on line pointer 1 and follows the chain.

**Step 2, after another update of id 1 (1515933) and `DELETE FROM mv WHERE id = 2` (1515934):**

| lp | t_xmin | t_xmax | t_ctid | flags |
|---|---|---|---|---|
| 1 | 1515930 | 1515932 | (0,3) | HOT_UPDATED |
| 2 | 1515930 | 1515934 | (0,2) | |
| 3 | 1515932 | 1515933 | (0,4) | HOT_UPDATED, HEAP_ONLY |
| 4 | 1515933 | 0 | (0,4) | HEAP_ONLY |

The chain is now 1 → 3 → 4. The delete wrote nothing new: it set `xmax` on line pointer 2.

**Step 3, after `VACUUM`:**

| lp | lp_flags | points to | t_xmin |
|---|---|---|---|
| 1 | REDIRECT | 4 | |
| 2 | UNUSED | | |
| 3 | UNUSED | | |
| 4 | NORMAL | | 1515933 |

Vacuum removed the three dead versions and compacted the survivor to the end of the page. Line pointer 1 became a **redirect** to 4, because the index still points at `(0,1)` and must keep working without an index update. The index entry for the deleted id 2 was removed (`VACUUM VERBOSE`: `3 removed ... 1 dead item identifiers removed`). The file never shrinks during this; freed space is reused by later inserts.

## Snapshots and visibility

Which version does a query see? That depends on its **snapshot**:

```sql
SELECT pg_current_snapshot();
--  815:819:815,817
```

That reads `xmin:xmax:in-progress list`. Every transaction ID below 815 had finished when the snapshot was taken; every ID from 819 up had not started; 815 and 817 were running. A transaction ID *counts as committed for this snapshot* when `pg_xact` says committed, it is below the snapshot's `xmax`, and it is not in the in-progress list. A tuple is visible when:

1. its `xmin` counts as committed for this snapshot (or is the current transaction), and
2. its `xmax` is empty, belongs to an aborted transaction, or does not count as committed for this snapshot.

`READ COMMITTED` takes a snapshot per statement; `REPEATABLE READ` and `SERIALIZABLE` take one at the first statement and keep it. That is the entire mechanism behind the [isolation levels](/learn/databases/relational-fundamentals/isolation-levels-and-anomalies).

```viz
{"type": "system", "scenario": "mvcc", "title": "Two transactions, two answers, both correct",
 "caption": "T1's snapshot predates T2, so T1 keeps seeing the old version even after T2 commits; T3 starts later and sees the new one. Nobody waits. When T1 tries to write the row T2 changed, repeatable read aborts it. The old version becomes garbage only when no snapshot can see it."}
```

Consulting `pg_xact` for every tuple would be slow, so the first reader to learn that a tuple's `xmin` committed sets a **hint bit** in the tuple header (`XMIN_COMMITTED` in the step 1 dump). Setting it modifies the page, which makes it dirty. That is why a read-only query can write: in the lab, the first index scan over `orders` after a 124,541-row `UPDATE` reported `dirtied=16531 written=15468`, setting hint bits and pruning dead versions on the pages it visited. It is bookkeeping paid once, and it surprises people who see write I/O from a `SELECT` after a bulk load.

## HOT and page pruning

HOT is what keeps MVCC affordable on update-heavy tables. It requires two things: no indexed column changed, and the new version fits on the same page. When both hold, indexes are untouched, and any later access to the page can **prune** it: collapse the dead chain members into a redirect and free their space, without waiting for vacuum. The `PRUNE_ON_ACCESS` WAL records in the [transactions lesson](/learn/databases/relational-fundamentals/transactions-and-acid) are exactly that. The [indexes lesson](/learn/databases/relational-fundamentals/indexes) measured 97.6% HOT with `fillfactor = 90` and 0% once the updated column was indexed.

When HOT fails, every index gets a new entry for the new version, and old entries become garbage too. In the lab, updating the unindexed `currency` column on every one of 100,000 users, whose pages were 100% full, could not use HOT: the users primary key grew from 276 to 551 pages and its leaf density fell to 45%.

## The bill: dead tuples and vacuum

A tuple whose `xmax` committed before every snapshot still in use is **dead**: nobody can see it again. `VACUUM` scans pages that the visibility map does not mark all-visible, collects dead tuple IDs, removes their index entries (one pass over each index), then frees the heap line pointers. Along the way it sets visibility-map bits (which make index-only scans possible) and freezes old tuples. It does not shrink the file, except for empty pages at the end. `VACUUM FULL` rewrites the table compactly under an `ACCESS EXCLUSIVE` lock that blocks even reads; `pg_repack` does the rewrite online.

Autovacuum starts on a table when dead tuples exceed `autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor × reltuples` (50 + 20%), or, since Postgres 13, when inserts exceed 1,000 + 20% (so append-only tables get their visibility map set). For a 100-million-row table that is 20 million dead tuples before vacuum starts. Autovacuum (3 workers by default) is throttled by cost accounting: a page found in shared buffers costs 1 unit, one read from the OS costs 2, one it dirties costs 20, and after 200 units it sleeps 2 ms, a budget shared among the active workers. That is 100,000 units a second: about 780 MB/s of cached pages, 390 MB/s of pages read, but only 39 MB/s of pages it has to dirty, which is why a vacuum that removes many dead tuples crawls. Large, busy tables need per-table settings:

```sql
ALTER TABLE events SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_cost_limit = 2000);
```

## The xmin horizon

Here is the Friday bug. Vacuum can remove a tuple only if no snapshot could still see it. The oldest snapshot in the database sets the **xmin horizon**, and every version deleted after it must be kept. Things that hold it back:

- a long-running query or transaction, including a forgotten `BEGIN` (`idle in transaction`);
- a replication slot whose consumer is down or slow, and a physical standby with `hot_standby_feedback = on` reporting its oldest query;
- a prepared two-phase-commit transaction nobody finished.

In the lab, the pinned session showed `backend_xmin = 1515944` in `pg_stat_activity`, and vacuum reported `removable cutoff: 1515944`. Every one of the 200,000 versions the queue had deleted since was kept. Finding and removing the culprit is mechanical:

```sql
SELECT pid, usename, state, backend_xmin, now() - xact_start AS xact_age, left(query, 60)
FROM pg_stat_activity WHERE backend_xmin IS NOT NULL
ORDER BY age(backend_xmin) DESC LIMIT 5;

SELECT slot_name, active, xmin, catalog_xmin FROM pg_replication_slots;
SELECT gid, prepared FROM pg_prepared_xacts;
```

Measured before and after ending the idle session:

| State | Heap size | Dead tuples | Next-job query |
|---|---|---|---|
| Baseline, 2,000 jobs | 168 kB | 0 | |
| After churn, horizon pinned | 17 MB | 200,000 (89% of the file) | 2,188 pages, 2.2 ms |
| Session ended, `VACUUM` | 17 MB | 0 (98.7% free space) | 2,188 pages, 2.1 ms |
| `VACUUM FULL` | 168 kB | 0 | 21 pages, 0.34 ms |

The third row is the part people miss: once the horizon moves, vacuum removes the garbage, but the file stays 17 MB and a sequential scan still reads every empty page. Space is reused by future inserts, so the table stops growing; only a rewrite returns it. Set `idle_in_transaction_session_timeout` so the bug cannot recur.

## Transaction ID wraparound

Transaction IDs are 32 bits and compared modulo 2³²: each ID sees about two billion IDs in its past and two billion in its future, so a tuple created long enough ago would eventually appear to be from the future and vanish. Vacuum prevents that by **freezing** old tuples, marking them visible to every snapshot regardless of ID. Autovacuum forces an aggressive anti-wraparound vacuum on any table whose oldest unfrozen ID is older than `autovacuum_freeze_max_age` (200 million), and since Postgres 14 a failsafe drops cost throttling once a table passes `vacuum_failsafe_age` (1.6 billion).

If freezing cannot finish (the same pinned horizon, or a huge table throttled too hard), Postgres logs warnings tens of millions of IDs before the limit and, a few million before it, refuses to assign new transaction IDs: every write stops until a manual vacuum completes, which on a large table takes hours. Sentry and Mailchimp both published outage write-ups about exactly this. Monitor it:

```sql
SELECT datname, age(datfrozenxid) AS xid_age FROM pg_database ORDER BY 2 DESC;
-- alert well before 1,000,000,000; writes stop a few million short of about 2,100,000,000
```

Multi-transaction IDs (below) have their own counter and their own freeze age (`autovacuum_multixact_freeze_max_age`, 400 million).

## Row locks: writers still block writers

MVCC removes reader–writer blocking. Two writers to the same row still conflict, because only one can create the next version. The second waits for the first to commit or abort; then at read committed it re-evaluates against the new version, and at repeatable read it fails with a serialisation error.

Postgres records a row lock in the tuple's own `xmax`, not in a shared lock table, so locking ten million rows costs no shared memory. When several transactions share-lock one row, `xmax` holds a **MultiXact ID** pointing at a list of lockers. Waiting for a row lock is implemented as waiting for the holder's *transaction* to end, which is why lock waits show up as `ShareLock on transaction 1516002`.

| Clause | Taken implicitly by | Blocks |
|---|---|---|
| `FOR UPDATE` | `DELETE`; `UPDATE` of a key column | All other row locks |
| `FOR NO KEY UPDATE` | `UPDATE` that changes no key column | Everything except `FOR KEY SHARE` |
| `FOR SHARE` | (explicit only) | Updates and deletes |
| `FOR KEY SHARE` | Foreign-key checks on the referenced row | Deletes and key changes only |

The two weak modes exist so that inserting a comment (whose foreign-key check takes `FOR KEY SHARE` on the user row) does not block updating the user's display name (`FOR NO KEY UPDATE`). `NOWAIT` errors instead of waiting, `SKIP LOCKED` ignores locked rows, and `SET lock_timeout = '2s'` bounds the wait.

Every statement also takes a *table* lock: `SELECT` takes `ACCESS SHARE`, writes take `ROW EXCLUSIVE`, and the two do not conflict. Most `ALTER TABLE` forms take `ACCESS EXCLUSIVE`, which conflicts with everything including `SELECT`, and queues behind any open transaction on the table while every new query queues behind it. [Schema migrations at scale](/learn/databases/data-modeling-and-evolution/schema-migrations-at-scale) measures that trap.

## Deadlocks, caught in the act

Two transfers run in opposite directions, and the lab set `deadlock_timeout = '4s'` in both sessions to leave time to look:

| # | Session A | Session B |
|---|---|---|
| 1 | `BEGIN;` debit account 1 | |
| 2 | | `BEGIN;` debit account 2 |
| 3 | credit account 2 → waits for B | |
| 4 | | credit account 1 → waits for A |

`pg_locks` one second into the wait:

```text
    who    |   locktype    |  target   |       mode       | granted
-----------+---------------+-----------+------------------+---------
 session_a | relation      | acct      | RowExclusiveLock | t
 session_a | relation      | acct_pkey | RowExclusiveLock | t
 session_a | transactionid | 1516001   | ExclusiveLock    | t
 session_a | transactionid | 1516002   | ShareLock        | f
 session_a | tuple         | acct 0,2  | ExclusiveLock    | t
 session_b | relation      | acct      | RowExclusiveLock | t
 session_b | relation      | acct_pkey | RowExclusiveLock | t
 session_b | transactionid | 1516001   | ShareLock        | f
 session_b | transactionid | 1516002   | ExclusiveLock    | t
 session_b | tuple         | acct 0,1  | ExclusiveLock    | t
```

Read it as a graph. Each session holds an `ExclusiveLock` on its own transaction ID (every writing transaction does, so others can wait for it to end). Each wants a `ShareLock` on the *other's* transaction ID (`granted = f`), which is how a row-lock wait is expressed. The `tuple` locks mark which row each is queued for, so a third waiter would queue behind them in order. `pg_blocking_pids` showed A blocked by B and B blocked by A: a cycle. When A's `deadlock_timeout` expired, its backend ran the detector, found the cycle and aborted itself:

```text
ERROR:  deadlock detected
DETAIL:  Process 13992 waits for ShareLock on transaction 1516002; blocked by process 13993.
Process 13993 waits for ShareLock on transaction 1516001; blocked by process 13992.
CONTEXT:  while updating tuple (0,2) in relation "acct"
```

B's update then completed. Detection only runs after a waiter has waited `deadlock_timeout` (1 s by default), which makes deadlocks expensive: the [isolation lesson](/learn/databases/relational-fundamentals/isolation-levels-and-anomalies) measured 16 clients transferring between 10 accounts in random order at **6.7 transactions per second** with a 2.4 s average latency, against **8,233 per second** when each transaction updated its two accounts in ascending id order.

```viz
{"type": "concurrency", "scenario": "deadlock", "threads": 2,
 "title": "Two transactions, two row locks, opposite order",
 "caption": "Each thread holds one lock and waits for the other's. The wait-for graph has a cycle, so no amount of waiting helps. Postgres detects the cycle after deadlock_timeout and aborts one transaction with SQLSTATE 40P01; the fix is to acquire locks in a consistent order."}
```

The fix is to make the cycle impossible by acquiring locks in one global order. `UPDATE ... WHERE id IN (2, 1)` does not guarantee an order, so lock first:

```sql
SELECT id FROM accounts WHERE id = ANY($1) ORDER BY id FOR UPDATE;
-- now update both rows in any order; the locks are already held
```

`log_lock_waits = on` logs every wait longer than `deadlock_timeout`, which usually reveals the pattern before it becomes a cycle. The general theory is in [deadlock](/learn/systems/concurrency/deadlock).

## A job queue with SKIP LOCKED

Row locks give you a correct job queue inside Postgres:

```sql
CREATE TABLE jobs (
  id           bigserial PRIMARY KEY,
  queue        text        NOT NULL,
  payload      jsonb       NOT NULL,
  run_at       timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  attempts     int         NOT NULL DEFAULT 0
);
CREATE INDEX jobs_ready_idx ON jobs (queue, run_at);

-- Each worker claims up to 10 jobs with a 5-minute lease.
UPDATE jobs
SET locked_until = now() + interval '5 minutes', attempts = attempts + 1
WHERE id IN (
  SELECT id FROM jobs
  WHERE queue = 'email' AND run_at <= now()
    AND (locked_until IS NULL OR locked_until < now())
  ORDER BY run_at
  LIMIT 10
  FOR UPDATE SKIP LOCKED
)
RETURNING id, payload;
-- after processing: DELETE FROM jobs WHERE id = $1;
```

Without `SKIP LOCKED`, every worker's subquery finds the same oldest row and all but one wait on its lock. Measured with a 400,000-job queue where each job holds its lock for 2 ms of work:

| Claim clause | 1 worker | 16 workers |
|---|---|---|
| `FOR UPDATE` | 373 jobs per second | 390 jobs per second, 41 ms average latency |
| `FOR UPDATE SKIP LOCKED` | 373 jobs per second | 5,807 jobs per second, 2.8 ms average latency |

Sixteen workers without `SKIP LOCKED` do the work of one. The lease means a crashed worker does not lose its job; it becomes claimable when the lease expires, which is at-least-once delivery, so jobs must be idempotent. The weakness is the opening story: a queue table is pure churn (every job is an insert, an update and a delete) and it bloats instantly when the horizon is pinned. Give it aggressive per-table autovacuum settings and alert on its size.

| Queue option | Throughput | Ordering | Failure handling | Operational cost |
|---|---|---|---|---|
| Postgres `SKIP LOCKED` | Thousands of jobs per second per table | Approximate (by `run_at`) | Leases; transactional enqueue with your data | None extra; bloat-sensitive |
| Advisory locks on job ids | Similar | Approximate | Session or transaction scoped | Easy to leak with poolers |
| Dedicated broker (SQS, RabbitMQ, Kafka) | Tens of thousands per second and up | Per queue or partition | Visibility timeouts, dead-letter queues | Another system, and an outbox to enqueue transactionally |

## Advisory locks

Sometimes the thing to lock is not a row: "only one instance of the nightly billing job", or "serialise balance changes for user 42 including inserts into tables where no row exists yet". Advisory locks are named locks on a 64-bit key that Postgres holds for you and never takes on its own:

```sql
-- Transaction-scoped: released automatically at COMMIT or ROLLBACK.
SELECT pg_advisory_xact_lock(42);

-- Session-scoped, non-blocking: returns false if someone else holds it.
SELECT pg_try_advisory_lock(hashtext('nightly-billing'));
-- ... run the job ...
SELECT pg_advisory_unlock(hashtext('nightly-billing'));
```

Prefer the transaction-scoped form. Session locks survive until unlock or disconnect, and behind a transaction-mode pooler (see [connection management](/learn/databases/storage-and-scale/connection-management)) your next transaction may run on a different server connection, so the unlock goes to a session that does not hold the lock while the lock stays attached to a connection someone else is now using. `hashtext` returns 32 bits, so unrelated names can collide; use the two-argument form `pg_advisory_xact_lock(namespace, key)` when several features share the key space.

## Seeing who blocks whom

```sql
SELECT pid, pg_blocking_pids(pid) AS blocked_by, wait_event_type, wait_event, state,
       now() - query_start AS waiting_for, left(query, 60) AS query
FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0;
```

Follow `blocked_by` to the root: usually a single transaction at the head of a chain, often `idle in transaction`. That is the first query to run in any "the database is hanging" incident.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A small, high-churn table grows without bound; vacuum reports "dead but not yet removable" | Something pins the xmin horizon: an idle transaction, a stale replication slot, an orphaned prepared transaction | End it; `idle_in_transaction_session_timeout`; monitor slot lag; then `pg_repack` or `VACUUM FULL` to return space |
| Writes stop with "database is not accepting commands" | Transaction ID wraparound protection: freezing never completed | Single-user or manual `VACUUM` of the oldest tables; alert on `age(datfrozenxid)` long before |
| Throughput collapses to a few transactions per second under contention, errors mention deadlock | Lock cycles, each costing `deadlock_timeout` before detection | Lock rows in a consistent order; `log_lock_waits` to find the pair |
| Adding workers to a job table does not raise throughput | All workers queue on the same row lock | `FOR UPDATE SKIP LOCKED` with a lease |
| Two instances of a singleton job run at once, or its lock is stuck | Session-level advisory lock behind a transaction-mode pooler | `pg_advisory_xact_lock` inside one transaction, or a session-mode pool for the job |

## Interviewer follow-ups

**"Why do readers never block writers in Postgres?"** Model answer: writers create new versions instead of modifying the one readers see, and each reader's snapshot decides which version it sees, so nobody waits on a read. The cost is dead versions that vacuum must remove. Common wrong answer: "reads take shared locks that writers can skip", which describes lock-based engines.

**"Vacuum runs constantly but the table keeps growing. Why?"** Model answer: something holds the xmin horizon back, so dead tuples are not yet removable; find it in `pg_stat_activity`, `pg_replication_slots` and `pg_prepared_xacts`. Common wrong answer: "autovacuum is too slow; add workers", which cannot remove tuples a snapshot might still need.

**"Where does Postgres store row locks, and why does it matter?"** Model answer: in the tuple's `xmax`, so locking millions of rows costs no shared memory, and waiters block on the holder's transaction ID. Common wrong answer: "in a lock table in memory, which escalates to a table lock", which is SQL Server behaviour.

**"How do you build a work queue in Postgres that scales with workers?"** Model answer: `FOR UPDATE SKIP LOCKED` on an index ordered by readiness, a lease column for crashed workers, idempotent jobs, and aggressive autovacuum; measured fifteen times the throughput of plain `FOR UPDATE` with 16 workers. Common wrong answer: "`SELECT` the oldest job then `UPDATE` it", which double-assigns jobs.

## What mid-level engineers get wrong

- **Leaving transactions open** in psql, notebooks or psycopg scripts, pinning the horizon for the whole database.
- **Expecting `VACUUM` to shrink the file.** It frees space for reuse; only a rewrite returns it.
- **Relying on the 20% autovacuum default for large tables**, letting tens of millions of dead tuples accumulate.
- **Locking rows in whatever order the code happens to reach them**, and then retrying deadlocks forever.
- **Building a queue without `SKIP LOCKED`**, then adding workers that only wait.
- **Using session-level advisory locks behind a transaction-mode pooler.**

```exercise
id: mvcc-visibility
title: Which version does this snapshot see?
prompt: |
  Implement Postgres-style tuple visibility (ignoring the current transaction's
  own writes).

  `versions` is a list of row versions for one row, each
  `{"value": ..., "xmin": int, "xmax": int or null}`. `snapshot` is
  `{"xmin": int, "xmax": int, "xip": [int, ...]}`. `committed` lists every
  transaction id that has committed by now; any other id is still running or
  aborted.

  A transaction id counts as committed for the snapshot if it is in
  `committed`, is less than `snapshot["xmax"]`, and is not in `snapshot["xip"]`.
  A version is visible if its `xmin` counts as committed and its `xmax` is null
  or does not count as committed.

  Return the `value` of the visible version, or `None`/`null` if no version is
  visible (for example, the row was deleted or never committed).
languages: [python, javascript]
entry: visible_value
starter:
  python: |
    def visible_value(versions, snapshot, committed):
        return None
  javascript: |
    function visible_value(versions, snapshot, committed) {
      return null;
    }
tests:
  - args: [[{"value": 100, "xmin": 5, "xmax": 12}, {"value": 80, "xmin": 12, "xmax": null}], {"xmin": 12, "xmax": 12, "xip": []}, [5, 12]]
    expected: 100
    label: snapshot taken before xid 12 began
  - args: [[{"value": 100, "xmin": 5, "xmax": 12}, {"value": 80, "xmin": 12, "xmax": null}], {"xmin": 13, "xmax": 13, "xip": []}, [5, 12]]
    expected: 80
    label: snapshot taken after xid 12 committed
  - args: [[{"value": 100, "xmin": 5, "xmax": 12}, {"value": 80, "xmin": 12, "xmax": null}], {"xmin": 12, "xmax": 14, "xip": [12]}, [5, 12, 13]]
    expected: 100
    label: xid 12 was in progress when the snapshot was taken
  - args: [[{"value": 100, "xmin": 5, "xmax": 12}, {"value": 80, "xmin": 12, "xmax": null}], {"xmin": 13, "xmax": 13, "xip": []}, [5]]
    expected: 100
    label: the updater aborted
  - args: [[{"value": "x", "xmin": 3, "xmax": 7}], {"xmin": 10, "xmax": 10, "xip": []}, [3, 7]]
    expected: null
    label: deleted row
  - args: [[{"value": 1, "xmin": 20, "xmax": null}], {"xmin": 18, "xmax": 22, "xip": [18, 20]}, []]
    expected: null
    hidden: true
  - args: [[{"value": 10, "xmin": 2, "xmax": 4}, {"value": 20, "xmin": 4, "xmax": 9}, {"value": 30, "xmin": 9, "xmax": null}], {"xmin": 9, "xmax": 11, "xip": [9]}, [2, 4, 9, 10]]
    expected: 20
    hidden: true
  - args: [[{"value": "a", "xmin": 3, "xmax": null}], {"xmin": 5, "xmax": 5, "xip": []}, []]
    expected: null
    hidden: true
hints:
  - "Write a helper `counts(xid)` that applies the three conditions, then test each version."
  - "A version whose deleter aborted or is invisible to the snapshot is still live for this reader."
```

The [time-based key-value store](/practice/time-based-kv) problem is the same idea in miniature: keep every version with a timestamp, and answer each read with the newest version at or before the reader's point in time.

## Senior signals

- You explain MVCC as "updates write new versions; snapshots decide which version each transaction sees", and derive both "readers never block writers" and "somebody must vacuum" from it.
- You can read a `heap_page_items` dump: `xmin`, `xmax`, `t_ctid` chains, HOT flags, and the redirect line pointer vacuum leaves behind.
- When a table bloats or vacuum reports "dead but not yet removable", you look for what pins the xmin horizon, and you know vacuum frees space without shrinking the file.
- You tune autovacuum per table, alert on `age(datfrozenxid)`, and know why a read-only query can dirty thousands of pages.
- You can read `pg_locks` during a lock wait (transaction-ID locks, tuple locks, `granted = f`), prevent deadlocks by ordering lock acquisition, and know each one costs `deadlock_timeout`.
- You build queues with `SKIP LOCKED` and leases, prefer transaction-scoped advisory locks, and know why session locks break behind a transaction-mode pooler.

## Check yourself

```quiz
- q: >-
    A 168 kB queue table has grown to 17 MB. VACUUM VERBOSE reports 200,000 tuples that are dead but not yet removable. What should you check first?
  options: ["Whether autovacuum is disabled or throttled too hard to keep up", "Whether the disk is too full for vacuum to compact the file", "Whether the table is missing an index on its run_at column", "What pins the xmin horizon, e.g. an idle transaction"]
  answer: 3
  explanation: >-
    Vacuum ran and found the tuples, so it is not disabled; it refused to remove them because some snapshot might still need them. Look in pg_stat_activity for old backend_xmin values, then replication slots and prepared transactions. In the lab, ending one idle session let the next vacuum remove all 200,000.
- q: >-
    After the culprit session is ended and VACUUM runs, the 17 MB table still occupies 17 MB. Why?
  options: ["The visibility map must be rebuilt before any space is freed", "The dead tuples are still needed by the next autovacuum cycle", "Freed space is only returned to the OS at the next checkpoint", "Vacuum makes space reusable; only a rewrite returns it"]
  answer: 3
  explanation: >-
    Plain VACUUM frees line pointers and space inside pages for future inserts, and only truncates empty pages at the very end of the file. The measured file was 98.7% free space and a sequential scan still read all 2,188 pages. VACUUM FULL or pg_repack rewrites the table, which returned it to 168 kB.
- q: >-
    An UPDATE of an unindexed column on a page with free space leaves the primary-key index unchanged. How does a lookup by id still find the new version?
  options: ["Postgres updates the row in place when no index column changes", "The index entry is rewritten lazily by the next index scan", "Vacuum adds the new entry to the index before any read occurs", "The lookup lands on the old version and follows the HOT chain"]
  answer: 3
  explanation: >-
    A HOT update writes the new version on the same page, flags it heap-only and points the old version's t_ctid at it. The index still points at the root line pointer, and readers follow the chain; after vacuum the root becomes a redirect. Postgres never updates in place, and no index entry is added for heap-only tuples.
- q: >-
    In pg_locks during a lock wait, session A holds ExclusiveLock on transaction 1516001 and waits for ShareLock on transaction 1516002, while B holds 1516002 and waits for 1516001. What is happening?
  options: ["A deadlock: each waits for the other's transaction to end", "Two readers are blocked behind a single writer on one busy row", "Both sessions are waiting on I/O and the locks are only bookkeeping", "A lock escalation from row locks to a table lock is in progress"]
  answer: 0
  explanation: >-
    Row-lock waits appear as a ShareLock request on the holder's transaction ID, and every writing transaction holds an ExclusiveLock on its own ID. Each session waits for the other's, which is a cycle; after deadlock_timeout one backend runs the detector and aborts itself with 40P01. Postgres never escalates row locks.
- q: >-
    Twenty workers run SELECT id FROM jobs ... ORDER BY run_at LIMIT 1 FOR UPDATE, process the job and delete it. Throughput equals one worker's. Why, and what fixes it?
  options: ["Postgres limits concurrent writers per table; partition the jobs table", "FOR UPDATE takes a table lock, so workers run one by one; use FOR SHARE", "Without an index on run_at every worker scans the table; add one", "All workers pick the same oldest row and queue on it; add SKIP LOCKED"]
  answer: 3
  explanation: >-
    Every worker's query finds the same row first, so all but one wait on its row lock; the lab measured 390 jobs per second with 16 workers against 5,807 with SKIP LOCKED. FOR UPDATE locks rows, not tables, and there is no per-table writer limit. A lease column covers workers that crash mid-job.
- q: >-
    A cron job uses pg_try_advisory_lock(key) and pg_advisory_unlock(key) through PgBouncer in transaction mode. Sometimes two instances run, and sometimes the lock seems stuck. Why?
  options: ["Session locks stay on one server connection; transactions may move", "Advisory locks are released at the end of each statement that takes them", "PgBouncer strips advisory lock calls so they never reach the server", "hashtext collisions map different job names onto one advisory lock key"]
  answer: 0
  explanation: >-
    In transaction mode a client owns a server connection only for the duration of a transaction. A session lock taken in one transaction stays with that server connection after the client moves on, so the unlock may go to a connection that does not hold it while other clients reuse the one that does. A collision could make a lock look stuck but cannot let two instances run. Use pg_advisory_xact_lock inside one transaction.
```
