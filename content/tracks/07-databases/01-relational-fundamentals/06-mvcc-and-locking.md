---
slug: mvcc-and-locking
title: "MVCC and locking: how Postgres lets readers and writers coexist"
description: Row versions, snapshots and visibility rules in Postgres, why they leave garbage that vacuum must collect, how one forgotten transaction bloats a table, and how row locks, deadlocks, SKIP LOCKED and advisory locks work.
minutes: 27
difficulty: hard
tags: [mvcc, vacuum, locking, deadlock, postgres, concurrency, skip-locked]
problems: [time-based-kv]
---
On Friday afternoon an engineer opens a `psql` session on the production primary, runs `BEGIN;` and a `SELECT` to check something, and goes home without closing the terminal. By Monday the `jobs` table, which never holds more than a few thousand rows, occupies 11 GB. Queries against it that took 2 ms take 400 ms. Autovacuum has run on it hundreds of times and reclaimed nothing. Nothing in the application changed.

Everything in that story follows from one design decision: Postgres never overwrites a row. It writes a new version and leaves the old one where it is, so that transactions which started earlier can keep reading it. That is multi-version concurrency control (MVCC), and it is why readers never block writers in Postgres. It is also why somebody has to clean up the old versions, and why a single open transaction can stop the cleanup for the whole database.

## Versions, not overwrites

Every row version (a *tuple*) carries a header with two transaction IDs: `xmin`, the transaction that created it, and `xmax`, the transaction that deleted or replaced it (0 if none). You can see them as hidden columns:

```sql
CREATE TABLE accounts (id int PRIMARY KEY, balance_cents bigint NOT NULL);
INSERT INTO accounts VALUES (1, 10000);
SELECT xmin, xmax, ctid, * FROM accounts;
```

```text
 xmin | xmax | ctid  | id | balance_cents
------+------+-------+----+---------------
  812 |    0 | (0,1) |  1 |         10000
```

`ctid` is the physical address: page 0, slot 1. Now update it in transaction 815 and look again, including at the raw page:

```sql
UPDATE accounts SET balance_cents = 6000 WHERE id = 1;
SELECT xmin, xmax, ctid, * FROM accounts;

CREATE EXTENSION IF NOT EXISTS pageinspect;
SELECT lp, t_xmin, t_xmax, t_ctid FROM heap_page_items(get_raw_page('accounts', 0));
```

```text
 xmin | xmax | ctid  | id | balance_cents
------+------+-------+----+---------------
  815 |    0 | (0,2) |  1 |          6000

 lp | t_xmin | t_xmax | t_ctid
----+--------+--------+--------
  1 |    812 |    815 | (0,2)
  2 |    815 |      0 | (0,2)
```

The page holds both versions. The old one is stamped `xmax = 815` and points forward to its replacement. A `DELETE` does even less: it sets `xmax` and writes nothing new. The table's physical size only ever grows until something removes the versions nobody can see any more.

## Snapshots and visibility

Which version does a query see? That depends on its **snapshot**, a record of which transactions had committed at the moment the snapshot was taken:

```sql
SELECT pg_current_snapshot();
--  815:819:815,817
```

That reads as `xmin:xmax:in-progress list`. Every transaction ID below 815 had finished (committed or aborted) when the snapshot was taken; every ID from 819 upwards had not started; 815 and 817 were still running. A transaction ID counts as committed *for this snapshot* when its status in the commit log is committed, it is below the snapshot's `xmax`, and it is not in the in-progress list. A tuple is visible when:

1. its `xmin` counts as committed for this snapshot (or is the current transaction itself), and
2. its `xmax` is empty, or belongs to a transaction that aborted, or does not count as committed for this snapshot.

`READ COMMITTED` takes a new snapshot for each statement; `REPEATABLE READ` and `SERIALIZABLE` take one at the first statement and keep it. That is the entire mechanism behind the [isolation levels](/learn/databases/relational-fundamentals/isolation-levels-and-anomalies).

```viz
{"type": "system", "scenario": "mvcc", "title": "Two transactions, two answers, both correct",
 "caption": "T1's snapshot predates T2, so T1 keeps seeing the old version even after T2 commits; T3 starts later and sees the new one. Nobody waits. When T1 tries to write the row T2 changed, repeatable read aborts it. The old version becomes garbage only when no snapshot can see it."}
```

Checking `pg_xact` for every tuple would be slow, so the first reader to learn that a tuple's `xmin` committed sets a **hint bit** on the tuple. That modifies the page, which makes it dirty, which means it must be written back to disk. So the first `SELECT` after a large bulk load can generate a surprising amount of write I/O. It is not a bug; it is the visibility bookkeeping being paid once.

## The bill: dead tuples and vacuum

A tuple whose `xmax` committed before every snapshot still in use is **dead**: nobody can ever see it again. `VACUUM` finds dead tuples, removes their index entries, and marks their space reusable. It also updates the visibility map (which makes [index-only scans](/learn/databases/relational-fundamentals/indexes) possible) and freezes old tuples (covered below). It does not shrink the file; freed space is reused by future inserts. `VACUUM FULL` rewrites the table compactly but holds an `ACCESS EXCLUSIVE` lock for the duration, which blocks even reads; tools like `pg_repack` do the rewrite online.

Autovacuum starts on a table when its dead tuples exceed `autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor × rows`, which is 50 + 20% by default. For a 100-million-row table that means 20 million dead tuples accumulate before vacuum even starts. Large, update-heavy tables need per-table settings:

```sql
ALTER TABLE events SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_cost_limit = 2000);
```

### The xmin horizon

Here is the Friday bug. Vacuum can only remove a tuple if no snapshot anywhere in the cluster could still see it. The oldest such snapshot sets the **xmin horizon**, and everything deleted after it must be kept. Things that hold the horizon back:

- a long-running query or transaction (including the forgotten `BEGIN` in a terminal, visible as `idle in transaction`);
- a replication slot whose consumer is down or slow (logical slots hold back catalog cleanup; a physical standby with `hot_standby_feedback = on` reports its oldest query's snapshot to the primary);
- a prepared two-phase-commit transaction that nobody committed or rolled back.

The `jobs` table processes around a hundred jobs a second, and every job leaves two dead versions behind: claiming it is an update and finishing it is a delete. With the horizon pinned since Friday, every one of those dead versions is kept. Autovacuum runs, finds millions of dead tuples, and reports that it cannot remove them:

```text
INFO:  vacuuming "app.public.jobs"
INFO:  finished vacuuming "app.public.jobs": index scans: 0
pages: 0 removed, 1402117 remain, 1402117 scanned (100.00% of total)
tuples: 0 removed, 18204332 remain, 18198211 are dead but not yet removable
removable cutoff: 815, which was 2210944 XIDs old when operation ended
```

"Dead but not yet removable" plus a large "XIDs old" figure is the signature. Find the culprit:

```sql
SELECT pid, usename, state, backend_xmin,
       now() - xact_start AS xact_age, left(query, 60) AS query
FROM pg_stat_activity
WHERE backend_xmin IS NOT NULL
ORDER BY age(backend_xmin) DESC
LIMIT 5;

SELECT slot_name, active, xmin, catalog_xmin FROM pg_replication_slots;
```

Then terminate it (`SELECT pg_terminate_backend(pid)`), and set `idle_in_transaction_session_timeout` so it cannot happen again. The table will not shrink by itself after the next vacuum, but it will stop growing and the space will be reused.

### Transaction ID wraparound

Transaction IDs are 32 bits, and comparisons wrap modulo 2^32: each ID sees about two billion IDs in its past and two billion in its future. A tuple created long ago would eventually appear to be *from the future* and vanish. To prevent that, vacuum **freezes** old tuples, marking them visible to everyone regardless of ID. Autovacuum forces an aggressive anti-wraparound vacuum on any table whose oldest unfrozen ID is older than `autovacuum_freeze_max_age` (200 million by default).

If something stops freezing from finishing (the same pinned horizon, or an enormous table with vacuum throttled too hard), Postgres will, a few million IDs before disaster, refuse to assign new transaction IDs at all, with an error along the lines of `database is not accepting commands to avoid wraparound data loss`. Every write in the database stops until a manual vacuum completes, which on a large table takes hours. Several companies, Sentry and Mailchimp among them, have published write-ups of outages caused by exactly this. Monitor it:

```sql
SELECT datname, age(datfrozenxid) AS xid_age FROM pg_database ORDER BY 2 DESC;
-- alert well before 1,000,000,000; the hard stop is near 2,100,000,000
```

## Row locks: writers still block writers

MVCC removes reader–writer blocking. Two writers to the same row still conflict, because only one of them can create the next version. The second writer waits for the first to commit or abort; then, under `READ COMMITTED`, it re-evaluates against the new version, and under `REPEATABLE READ` it fails with a serialisation error.

Postgres records a row lock in the tuple's own `xmax` field, not in a shared lock table, so locking ten million rows costs no shared memory. (When several transactions share-lock the same row, the `xmax` holds a *MultiXact* ID pointing at a list of lockers, which has its own storage and its own wraparound limit.) Waiting for a row lock is implemented as waiting for the holding *transaction* to end, which is why lock waits show up as `ShareLock on transaction 9120`.

You can take row locks explicitly. From strongest to weakest:

| Clause | Taken implicitly by | Blocks |
|---|---|---|
| `FOR UPDATE` | `DELETE`, `UPDATE` of a key column | All other row locks |
| `FOR NO KEY UPDATE` | `UPDATE` that changes no key column | Everything except `FOR KEY SHARE` |
| `FOR SHARE` | (explicit only) | Updates and deletes |
| `FOR KEY SHARE` | Foreign-key checks on the referenced row | Deletes and key changes only |

The two weak modes exist so that inserting a comment (whose foreign-key check takes `FOR KEY SHARE` on the user row) does not block updating the user's display name (`FOR NO KEY UPDATE`). Modifiers change what happens on conflict: `NOWAIT` errors immediately, `SKIP LOCKED` ignores locked rows, and `SET lock_timeout = '2s'` bounds the wait.

Every statement also takes a *table*-level lock. `SELECT` takes `ACCESS SHARE`, writes take `ROW EXCLUSIVE`, and neither conflicts with the other. Most `ALTER TABLE` forms take `ACCESS EXCLUSIVE`, which conflicts with everything, including `SELECT`, and queues behind any long-running transaction on the table while every new query queues behind it. [Schema migrations at scale](/learn/databases/data-modeling-and-evolution/schema-migrations-at-scale) covers that trap.

## Deadlocks

Two transfers run in opposite directions:

| # | Session A | Session B |
|---|---|---|
| 1 | `BEGIN;` `UPDATE accounts SET balance_cents = balance_cents - 100 WHERE id = 1;` | |
| 2 | | `BEGIN;` `UPDATE accounts SET balance_cents = balance_cents - 100 WHERE id = 2;` |
| 3 | `UPDATE accounts SET balance_cents = balance_cents + 100 WHERE id = 2;` (waits for B) | |
| 4 | | `UPDATE accounts SET balance_cents = balance_cents + 100 WHERE id = 1;` (waits for A) |

Each holds a row lock the other needs. Neither can proceed. After `deadlock_timeout` (1 s by default), the waiting backend runs the deadlock detector, which builds the wait-for graph, finds the cycle, and aborts one participant:

```text
ERROR:  deadlock detected
DETAIL:  Process 4211 waits for ShareLock on transaction 9120; blocked by process 4187.
Process 4187 waits for ShareLock on transaction 9121; blocked by process 4211.
HINT:  See server log for query details.
```

```viz
{"type": "concurrency", "scenario": "deadlock", "threads": 2,
 "title": "Two transactions, two row locks, opposite order",
 "caption": "Each thread holds one lock and waits for the other's. The wait-for graph has a cycle, so no amount of waiting helps. Postgres detects the cycle after deadlock_timeout and aborts one transaction with SQLSTATE 40P01; the fix is to acquire locks in a consistent order."}
```

The survivor carries on; the victim gets SQLSTATE `40P01` and should be retried. The real fix is to make the cycle impossible by acquiring locks in a consistent order. `UPDATE ... WHERE id IN (2, 1)` does not guarantee an order, so lock explicitly first:

```sql
SELECT id FROM accounts WHERE id = ANY($1) ORDER BY id FOR UPDATE;
-- now update both rows in any order; the locks are already held
```

A deadlock every few hours under load is a code smell to fix, not noise to retry forever: each one costs a full second of both transactions' lock time before detection. `log_lock_waits = on` logs every lock wait longer than `deadlock_timeout`, which usually shows you the pattern before it becomes a cycle. The general theory is in [deadlock](/learn/systems/concurrency/deadlock) in the concurrency track.

## A job queue with SKIP LOCKED

The row-lock machinery gives you a correct, reasonably fast job queue inside Postgres, with no extra infrastructure:

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

Without `SKIP LOCKED`, every worker's subquery finds the same oldest row, all but one block on its lock, and your twenty workers process jobs one at a time. With it, each worker takes the next rows nobody else holds. The lease (`locked_until`) means a worker that crashes mid-job does not lose the job: it becomes claimable again when the lease expires. That is at-least-once delivery, so jobs must be idempotent.

This pattern handles thousands of jobs per second on ordinary hardware. Its weakness is the one from the opening: a queue table is pure churn, every job is an insert, an update and a delete, and it bloats instantly when the xmin horizon is pinned. Give it aggressive per-table autovacuum settings and alert on its size.

## Advisory locks

Sometimes the thing you need to lock is not a row: "only one instance of the nightly billing job may run", or "serialise all balance changes for user 42, including inserts into tables where no row exists yet". Advisory locks are named locks on a 64-bit key that Postgres holds for you and never takes on its own:

```sql
-- Transaction-scoped: released automatically at COMMIT or ROLLBACK.
SELECT pg_advisory_xact_lock(42);

-- Session-scoped, non-blocking: returns false if someone else holds it.
SELECT pg_try_advisory_lock(hashtext('nightly-billing'));
-- ... run the job ...
SELECT pg_advisory_unlock(hashtext('nightly-billing'));
```

Prefer the transaction-scoped form. Session-scoped locks survive until you unlock or disconnect, and behind a connection pooler in transaction mode (see [connection management](/learn/databases/storage-and-scale/connection-management)) your next transaction may run on a different server connection, so the unlock goes to a session that does not hold the lock while the lock stays attached to a connection someone else is now using. `hashtext` produces a 32-bit value, so unrelated names can collide; use a namespace (the two-argument form, `pg_advisory_xact_lock(namespace_id, key)`) when several features share the key space.

## Seeing who blocks whom

```sql
SELECT pid,
       pg_blocking_pids(pid) AS blocked_by,
       wait_event_type, wait_event, state,
       now() - query_start AS waiting_for,
       left(query, 60) AS query
FROM pg_stat_activity
WHERE cardinality(pg_blocking_pids(pid)) > 0;
```

Follow `blocked_by` to the root: usually a single transaction at the head of a chain, often `idle in transaction`. That query is the first thing to run in any "the database is hanging" incident.

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

- You explain MVCC as "updates write new versions; snapshots decide which version each transaction sees", and you can derive both "readers never block writers" and "somebody must vacuum" from that sentence.
- When a table bloats or vacuum reports "dead but not yet removable", you look for what pins the xmin horizon: long transactions, `idle in transaction`, stale replication slots, orphaned prepared transactions.
- You tune autovacuum per table for large or high-churn tables instead of relying on the 20% default, and you alert on `age(datfrozenxid)` long before wraparound.
- You know row locks live in the tuple header, which lock modes foreign keys take, and why `FOR UPDATE SKIP LOCKED` turns a table into a workable job queue.
- You prevent deadlocks by ordering lock acquisition, treat `40P01` as retryable, and turn on `log_lock_waits` to find the pattern.
- You prefer transaction-scoped advisory locks, and you know why session-scoped ones break behind a transaction-mode pooler.

## Check yourself

```quiz
- q: >-
    A 30 MB queue table has grown to 9 GB. VACUUM VERBOSE reports millions of tuples that are dead but not yet removable. What should you check first?
  options: ["Whether the disk is full, since vacuum needs free space to compact files", "Whether autovacuum is disabled, or throttled too hard to keep pace", "Whether the queue table is missing an index on its run_at column", "What pins the xmin horizon, such as an idle-in-transaction session"]
  answer: 3
  explanation: >-
    Dead but not yet removable means vacuum ran and found the tuples, but some snapshot might still need them, so autovacuum is clearly running. Check pg_stat_activity for long-running or idle-in-transaction sessions, then inactive replication slots and orphaned prepared transactions. The fix is to end whatever holds the oldest snapshot; after that the space is reused, and a VACUUM FULL or pg_repack reclaims the file size if needed.
- q: >-
    Why does Postgres not need memory proportional to the number of rows a transaction has locked?
  options: ["Row locks live in each tuple's xmax field on the data page itself", "It releases each row lock as soon as the statement that took it ends", "It escalates row locks to a single table lock past a set threshold", "It only locks the index pages that point at the rows being changed"]
  answer: 0
  explanation: >-
    A row lock is marked in the tuple header, so it costs no shared memory. A waiter blocks on the lock of the transaction that set xmax, rather than on a per-row lock entry, which is why lock waits appear as ShareLock on transaction N. SQL Server-style lock escalation does not exist in Postgres, and row locks are held until commit.
- q: >-
    Twenty workers run SELECT id FROM jobs WHERE run_at <= now() ORDER BY run_at LIMIT 1 FOR UPDATE, process the job, and delete it. Throughput is the same as with one worker. Why, and what is the fix?
  options: ["Postgres caps concurrent writers per table; partition the jobs table", "All workers pick the same oldest row and queue on its lock; add SKIP LOCKED", "FOR UPDATE takes a table lock, so the workers run one at a time; use FOR SHARE", "Without an index on run_at every worker scans the table; add one"]
  answer: 1
  explanation: >-
    Every worker's query finds the same row first, so they serialise on its row lock. SKIP LOCKED makes each worker skip rows other workers hold and take the next unlocked one, which spreads the work. FOR UPDATE locks rows, not the table. A lease column protects against workers that crash mid-job.
- q: >-
    Two services each update rows in accounts for transfers, sometimes locking account 1 then 2 and sometimes 2 then 1. They see occasional deadlocks. What is the durable fix?
  options: ["Add NOWAIT to every update so transfers proceed without waiting", "Lock the rows in a consistent order, e.g. ORDER BY id FOR UPDATE first", "Raise deadlock_timeout so that each lock wait has time to resolve itself", "Run the transfers at SERIALIZABLE so that lock cycles cannot form"]
  answer: 1
  explanation: >-
    A deadlock needs a cycle in the wait-for graph. If every transaction locks rows in the same global order (SELECT ... WHERE id = ANY($1) ORDER BY id FOR UPDATE before updating), no cycle can form. Raising deadlock_timeout only delays detection, SERIALIZABLE does not remove row-lock waits, and NOWAIT turns waits into errors rather than letting transfers proceed.
- q: >-
    A cron job uses pg_try_advisory_lock(key) and pg_advisory_unlock(key) to ensure one instance runs, through PgBouncer in transaction pooling mode. Sometimes two instances run at once, and sometimes the lock appears stuck. Why?
  options: ["Advisory locks are released at the end of each statement that takes them", "PgBouncer intercepts advisory lock calls and never forwards them to the server", "hashtext collisions map unrelated job names onto the same advisory lock key", "Session locks stay on one server connection, but each transaction may get another"]
  answer: 3
  explanation: >-
    In transaction mode, a client only owns a server connection for the duration of a transaction. A session lock taken in one transaction stays with that server connection after the client moves on, so the unlock can go to a connection that does not hold it while other clients reuse the one that does. A hash collision could make a lock look stuck but cannot let two instances run. Use pg_advisory_xact_lock inside a single transaction, or a session-mode pool for the job.
```
