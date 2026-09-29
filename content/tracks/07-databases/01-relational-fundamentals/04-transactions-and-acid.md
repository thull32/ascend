---
slug: transactions-and-acid
title: "Transactions and ACID: what the database actually promises"
description: What atomicity, consistency, isolation and durability each guarantee mechanically in Postgres, the exact WAL records one money transfer writes, what synchronous_commit and group commit do to latency and loss, and the five transaction bugs that application code keeps reintroducing.
minutes: 30
difficulty: medium
tags: [transactions, acid, wal, durability, postgres, atomicity, synchronous-commit]
---
A wallet service moves money in two statements: debit the customer, credit the merchant. The process is killed by the out-of-memory killer between them. The driver was in autocommit mode, so each statement was its own transaction: the debit is committed and durable, and the credit never happened. Forty pounds has left the system, and nobody notices until the monthly reconciliation fails.

Wrap both statements in one transaction and the same crash leaves neither. That is the promise people remember from ACID. The other three letters promise something narrower than most engineers assume, and the gaps between what they promise and what people believe are where production bugs live. This lesson opens each promise to its mechanism on PostgreSQL 17: the status bits behind atomicity, the exact write-ahead-log records one transfer produces, and what a commit costs at each durability setting, measured.

## The transaction boundary

A transaction is a group of statements the database treats as one unit: either all of their effects become visible and permanent, or none do.

```sql
BEGIN;
UPDATE accounts SET balance_cents = balance_cents - 4000 WHERE id = 17;
UPDATE accounts SET balance_cents = balance_cents + 4000 WHERE id = 912;
COMMIT;
```

Without `BEGIN`, Postgres runs every statement in its own implicit transaction. Drivers add defaults on top, and they differ in ways that bite:

- **psycopg** (Python) is *not* in autocommit mode by default. The first statement silently opens a transaction that stays open until you call `commit()`. A script that runs one `SELECT` and then sleeps holds a transaction open the whole time; `pg_stat_activity` shows it as `idle in transaction`, and it blocks vacuum (see [MVCC and locking](/learn/databases/relational-fundamentals/mvcc-and-locking)).
- **sqlx and SeaORM** (Rust) run statements in autocommit mode. You open a transaction with `db.begin()`, pass `&txn` to each query, and call `txn.commit()`. Dropping the transaction without committing rolls it back, so an early `?` return undoes the work. Calling `begin()` on a transaction issues a `SAVEPOINT`.
- **ORMs in general** often wrap each `save()` in its own transaction: atomic per object, not across objects.

```rust
let txn = db.begin().await?;
debit(&txn, 17, 4000).await?;   // an error here drops txn: ROLLBACK
credit(&txn, 912, 4000).await?;
txn.commit().await?;
```

## Atomicity: commit is a status flip

How can Postgres undo a transaction that has already written a million rows to pages, some of which may already be on disk? It does not undo anything.

Every row version a transaction writes is stamped with that transaction's ID in its `xmin` field. The fate of each transaction ID is recorded separately in `pg_xact` (the commit log): two bits per transaction for in progress, committed, aborted or sub-committed, so one 8 KiB page covers 32,768 transactions. A reader that meets a row version checks the status of its `xmin`; if that transaction aborted, the version is invisible, wherever it sits.

- **Commit** writes a commit record to the WAL, flushes it, and sets two bits in `pg_xact`. Before that, nothing the transaction wrote is visible to others; after it, everything is.
- **Abort** sets the bits to aborted. The row versions stay where they are, dead, until vacuum reclaims them.

Measured on a 2-million-row table: `UPDATE oc SET total_cents = total_cents + 1` took **16.3 s**; the `ROLLBACK` that followed took **0.2 ms**. The cost moved elsewhere: the table grew from 143 MB to 260 MB and `pg_stat_user_tables` showed 2,000,000 dead tuples for vacuum to clean up.

InnoDB (MySQL) makes the opposite choice. It updates rows in place and keeps the old values in an undo log; a rollback applies the undo log backwards, which the [MySQL manual](https://dev.mysql.com/doc/refman/8.4/en/optimizing-innodb-transaction-management.html) warns can take several times as long as the original changes. Killing the server does not help: after a crash, a background thread rolls the transaction back after restart, and the manual estimates that at three or four times the time the transaction had been running.

| | Postgres (new versions in the heap) | InnoDB (in-place with undo log) |
|---|---|---|
| Rollback of a large transaction | Instant status flip | Proportional to the work done |
| Where old versions live | In the table, as dead tuples | In the undo tablespace |
| Who cleans up | `VACUUM` | Purge threads |
| Symptom of a long-running reader | Table bloat, vacuum cannot remove tuples | Undo log (history list) grows, reads walk longer version chains |

Two behaviours follow that surprise people. **One error poisons the transaction**: after any error inside a block, every further statement fails with `current transaction is aborted, commands ignored until end of transaction block` until you roll back. To continue after an expected error, set a savepoint first and roll back to it, or better, use a single-statement form such as `INSERT ... ON CONFLICT DO NOTHING`. **Savepoints are not free**: each savepoint that writes gets a subtransaction ID, and each backend caches only 64 of them in shared memory. Past that, visibility checks must look up parent transaction IDs in `pg_subtrans`, a small shared cache backed by disk, and contention on it produces sharp throughput cliffs. [GitLab's 2021 write-up](https://about.gitlab.com/blog/2021/09/29/why-we-spent-the-last-month-eliminating-postgresql-subtransactions/) traced stalls that hit only its replicas to this, and fixed them by removing every `SAVEPOINT` its Rails code issued, mostly in favour of `INSERT ... ON CONFLICT`.

## Under the hood: the WAL records of one transfer

Durability and atomicity both rest on the write-ahead log. `pg_walinspect` shows exactly what the transfer above writes. Here it is at steady state, on a 1,000-row `accounts` table:

```sql
SELECT pg_current_wal_lsn() AS s \gset
BEGIN;
UPDATE accounts SET balance_cents = balance_cents - 4000 WHERE id = 18;
UPDATE accounts SET balance_cents = balance_cents + 4000 WHERE id = 913;
COMMIT;
SELECT pg_current_wal_lsn() AS e \gset
SELECT resource_manager, record_type, record_length, fpi_length
FROM pg_get_wal_records_info(:'s', :'e');
```

```text
 resource_manager |   record_type   | record_length | fpi_length
------------------+-----------------+---------------+-----------
 Heap2            | PRUNE_ON_ACCESS |            56 |          0
 Heap             | HOT_UPDATE      |            72 |          0
 Heap2            | PRUNE_ON_ACCESS |            56 |          0
 Heap             | HOT_UPDATE      |            72 |          0
 Transaction      | COMMIT          |            34 |          0
```

Walk through it:

1. **Prune.** Before updating, each statement cleaned dead versions left on the page by earlier updates, logged so replicas and recovery do the same.
2. **Two heap-only (HOT) updates**, 72 bytes each: the new row version, written on the same page, with no index change because `balance_cents` is not indexed.
3. **Commit**, 34 bytes: the transaction ID and a timestamp. When this record is flushed to disk, the transfer is durable. The whole transaction is **296 bytes** of WAL.

Now the same transfer immediately after a `CHECKPOINT`, on pages that were completely full:

```text
 record_type | record_length | fpi_length
-------------+---------------+-----------
 LOCK        |          8223 |       8164
 UPDATE      |          3441 |       3368
 INSERT_LEAF |          7453 |       7400    (Btree)
 LOCK        |          8223 |       8164
 UPDATE      |            90 |          0
 INSERT_LEAF |          5473 |       5420    (Btree)
 COMMIT      |            34 |          0
```

Three things changed. The first change to any page after a checkpoint writes a **full-page image** (`fpi_length`), so that recovery can restore a page torn by a crash mid-write; that is `full_page_writes = on`, and it turned a 296-byte transfer into about 33 KB. The full pages had no room for the new versions, so each update became a non-HOT update to another page, which also inserted a new entry into the primary-key index (`INSERT_LEAF`). And before moving a row to another page, Postgres logged a `LOCK` on the old version so the row stays locked while the page lock is released to find space. A rollback writes an `ABORT` record of 34 bytes and does not wait for it to reach disk, since losing it changes nothing. A read-only transaction gets no transaction ID and writes no commit record at all.

The rule underneath is **WAL before data**: every page carries the LSN of the last WAL record that changed it, and the buffer manager will not write a dirty page to disk until the WAL up to that LSN is flushed. Data pages can therefore stay dirty in memory for minutes; after a crash, replay from the last checkpoint rebuilds them. [Storage engine internals](/learn/databases/storage-and-scale/storage-engine-internals) covers checkpoints and recovery.

```viz
{"type": "system", "scenario": "wal", "title": "Durability comes from the log, not the data files",
 "caption": "The commit is acknowledged once the log record is fsynced; the data page is written later at a checkpoint. After a crash, recovery replays the log from the last checkpoint and redoes every change whose page is behind."}
```

## Consistency: the letter that belongs to you

The database cannot know your invariants ("a balance never goes negative", "ledger entries sum to the balance"). It promises something narrower: a transaction moves the database from one state satisfying the **declared constraints** to another, or it fails. Declare them:

```sql
ALTER TABLE accounts ADD CONSTRAINT balance_non_negative CHECK (balance_cents >= 0);
```

With that constraint, a race that would have overdrawn an account becomes an error (`violates check constraint "balance_non_negative"`) instead of silent corruption. `CHECK` and `NOT NULL` are checked on each row as it is written, and so are non-deferrable unique constraints; foreign keys are checked at the end of the statement. Foreign-key, unique and exclusion constraints declared `DEFERRABLE INITIALLY DEFERRED` wait until commit, which is how you insert two rows that reference each other; `CHECK` and `NOT NULL` can never be deferred. Every invariant you cannot declare is enforced by your code, inside transactions, under whatever isolation level you chose.

## Durability: what a commit costs

"Durable" means that once `COMMIT` returns, the transaction survives a crash, because its commit record has been flushed with `fsync` (or `fdatasync`). That flush is the most expensive thing an OLTP transaction does. Measured with `pgbench` running single-row updates for 8 seconds on this lab machine (a WSL2 virtual disk, where one flush takes about 1.4 ms):

| `synchronous_commit` | Clients | Throughput | Average latency | WAL flushes | Commits per flush |
|---|---|---|---|---|---|
| `on` | 1 | 623 per second | 1.60 ms | 4,987 | 1.0 |
| `on` | 16 | 7,749 per second | 2.07 ms | 7,802 | 7.9 |
| `off` | 1 | 6,373 per second | 0.157 ms | 40 | about 1,300 |
| `off` | 16 | 71,852 per second | 0.223 ms | 65 | about 8,800 |

Read the rows in pairs. With one client and `on`, every commit waits for its own flush: throughput is one over the flush time. With 16 clients it is 12 times higher at similar latency, because of **group commit**: a flush writes all WAL up to a position, so while one backend waits for the disk, others append their commit records behind it, and the next flush covers all of them, 7.9 commits per flush here. With `off`, `COMMIT` returns as soon as the record is in the WAL buffers, and the WAL writer flushes every `wal_writer_delay` (200 ms): 40 flushes in 8 seconds. On an enterprise NVMe with a power-loss-protected cache a flush takes tens of microseconds and the gap narrows; on network block storage it can be a millisecond or more and the gap widens.

`synchronous_commit` can be set per transaction, which makes durability a dial:

| Setting | `COMMIT` returns after | Lost if |
|---|---|---|
| `off` | Record in WAL buffers | The server crashes before the flush: up to 3 × `wal_writer_delay` (600 ms) of acknowledged commits, never corruption |
| `local` | WAL flushed on the primary | The primary's disk is lost |
| `remote_write` | Standby received it into OS memory | The primary is lost and the standby's OS crashes too |
| `on` (with a synchronous standby) | Standby flushed it | Both primary and standby lose their disks |
| `remote_apply` | Standby flushed and replayed it | As above; also a read on the standby sees it |

Without a synchronous standby configured, `on` means `local`. `off` for page views, `on` with a synchronous standby for payments; the [replication](/learn/databases/storage-and-scale/replication) lesson prices the remote settings.

Durability is also conditional on layers below Postgres. **The disk must tell the truth about `fsync`**: consumer SSDs and some virtual disks acknowledge writes from a volatile cache, and a power cut loses commits the database was told were safe; drives with power-loss protection do not. **Postgres must hear about `fsync` failures**: in 2018 it emerged that Linux could drop dirty pages after a failed `fsync` and report success on retry; since the 2019 minor releases, Postgres treats an `fsync` failure on data files as fatal and recovers from the WAL (`data_sync_retry = off`). **Durable means this machine**: a dead disk loses everything not on a replica or in a backup.

## Isolation: a spectrum, not a switch

If transactions ran one at a time, each would see a database nobody else was changing. That property, **serialisability**, costs coordination, so every mainstream database defaults to something weaker:

| Database | Default level | What that permits, in brief |
|---|---|---|
| Postgres | Read committed | A fresh snapshot per statement; lost updates and write skew are possible |
| MySQL (InnoDB) | Repeatable read | A snapshot for plain reads, but locking reads and writes see the latest data |
| Oracle, SQL Server | Read committed | Similar to Postgres |
| CockroachDB | Serialisable | Correct by default; conflicting transactions retry |

The next lesson, [isolation levels and anomalies](/learn/databases/relational-fundamentals/isolation-levels-and-anomalies), reproduces every anomaly with two interleaved sessions. For now: "we use transactions" does not mean "we are safe from concurrency bugs".

## Five transaction bugs that application code keeps reintroducing

### 1. Read-modify-write in the application

Two requests both read a balance of 10,000, both write 6,000, and one withdrawal disappears. A transaction at the default level does not help. Push the arithmetic into one statement, which Postgres evaluates against the latest committed row version:

```sql
UPDATE accounts SET balance_cents = balance_cents - 4000
WHERE id = 17 AND balance_cents >= 4000
RETURNING balance_cents;       -- zero rows means insufficient funds
```

This app uses the same technique throughout. `ProgressService::set_lesson_status` is one `INSERT ... ON CONFLICT (user_id, lesson_slug) DO UPDATE ... RETURNING`, commented "Upsert returning the row: one statement, one round trip, no read-modify-write race". `InterviewService::append_transcript` appends with `transcript = transcript || $2::jsonb` server-side instead of reading the JSON array, extending it and writing it back, and the integration test `transcripts_freeze_when_an_interview_ends_and_appends_never_lose_entries` fires 20 concurrent appends and asserts all 20 survive.

The AI budget shows where one statement stops being enough. Its first version checked the day's usage before a model call and charged the tokens the call actually used after it returned. Each step was atomic, but a learner one token under the output limit could still start a call worth thousands, because nothing was reserved in between. `BudgetService::reserve` in `crates/core/src/ai/budget.rs` now works like a card authorisation hold. In one short transaction it makes sure the day's `ai_usage` row exists (`INSERT ... ON CONFLICT DO NOTHING`), locks it with `SELECT ... FOR UPDATE`, checks the request count, the billed input plus an estimate for this call, and the output still unreserved, then adds this call's holds to `reserved_input_tokens` and `reserved_output_tokens` (columns added by migration `m0008_budget_holds`) and lowers the request's `max_tokens` to the output it could hold. The decision reads several columns and computes a cap, so the service takes the row lock and decides in code, and it commits before the model is called, which is bug 2's rule below. Settling replaces the hold with the actual usage in one `UPDATE`, and a reservation dropped unsettled releases its hold. The test `ai_budget_reservation_cannot_be_overshot_by_concurrency` fires 30 reservations at a 10-request daily limit and gets exactly 10.

### 2. Slow work inside a transaction

A handler opens a transaction, locks the order row, calls a payment provider (800 ms at p50, 30 s at worst), then writes the result. For that whole time it holds row locks, a pooled connection and the oldest snapshot vacuum must respect. At 50 requests per second the pool drains in seconds. Record the intent, commit, make the call, record the outcome in a second transaction with an idempotency key, and set guard rails:

```sql
ALTER ROLE app SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE app SET statement_timeout = '5s';
```

### 3. Not retrying the failures that are meant to be retried

Serialisation failures (SQLSTATE `40001`) and deadlocks (`40P01`) mean the database aborted your transaction to protect correctness; running it again will probably succeed. Retry the whole transaction, reads included, with jittered backoff:

```python
import random, time
import psycopg
from psycopg import errors

class InsufficientFunds(Exception): ...
class RetriesExhausted(Exception): ...

def transfer(conn: psycopg.Connection, src: int, dst: int, cents: int, attempts: int = 5) -> None:
    # conn was opened with autocommit=True, so conn.transaction() issues BEGIN/COMMIT.
    for attempt in range(attempts):
        try:
            with conn.transaction():          # COMMIT on exit, ROLLBACK on exception
                cur = conn.execute(
                    "UPDATE accounts SET balance_cents = balance_cents - %s "
                    "WHERE id = %s AND balance_cents >= %s",
                    (cents, src, cents),
                )
                if cur.rowcount != 1:
                    raise InsufficientFunds(src)          # a business error: not retried
                conn.execute(
                    "UPDATE accounts SET balance_cents = balance_cents + %s WHERE id = %s",
                    (cents, dst),
                )
            return
        except (errors.SerializationFailure, errors.DeadlockDetected):
            time.sleep(random.uniform(0, 0.01 * 2 ** attempt))   # full jitter, doubling cap
    raise RetriesExhausted(src, dst)
```

### 4. The commit whose outcome you do not know

The client sends `COMMIT` and the connection drops before the reply. The commit may or may not have reached disk, and the client cannot tell. Make the transaction idempotent: store a client-generated key under a unique constraint in the same transaction, so a retry of a committed transfer fails with a unique violation that the application maps to "already done". Payment APIs expose the same contract to their callers, such as Stripe's `Idempotency-Key` request header, for exactly this reason.

```sql
INSERT INTO transfers (idempotency_key, src, dst, cents) VALUES ($1, $2, $3, $4);
```

### 5. The transaction that is too big

`UPDATE events SET region = 'eu' WHERE region IS NULL` on 80 million rows writes 80 million new versions and tens of gigabytes of WAL that replicas must replay, holds every row lock until the end, and if it fails at 95% throws all of it away. At the lab's 16.3 s per 2 million rows, that is about 11 minutes of one transaction. Update 5,000 rows per transaction by primary-key range, commit, repeat; [schema migrations at scale](/learn/databases/data-modeling-and-evolution/schema-migrations-at-scale) measures batch sizes.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Balances drift by exactly one operation under load | Read-modify-write in application code; `pg_stat_activity` shows the pattern `SELECT` then `UPDATE ... SET x = <literal>` | Single-statement updates, conditional upserts, or `SELECT ... FOR UPDATE` |
| Connection pool exhausted, many sessions `idle in transaction` | A transaction held open across a network call or a forgotten psycopg transaction | Move external calls outside the transaction; `idle_in_transaction_session_timeout` |
| Commit latency jumps from under a millisecond to several after moving to new storage | Each commit waits for a WAL flush; the new volume's flush latency is higher (`pg_stat_wal.wal_sync_time` with `track_wal_io_timing = on`) | Faster WAL volume, more concurrency for group commit, or `synchronous_commit = off` for loss-tolerant writes |
| Throughput collapses on replicas after an ORM upgrade | Subtransaction cache overflow: more than 64 savepoints in open transactions | Remove per-call savepoints; use `ON CONFLICT` instead of catch-and-retry blocks |
| Duplicate charges after network blips | Blind retries of commits with unknown outcome | Idempotency keys under a unique constraint |

## Interviewer follow-ups

**"Why is a Postgres rollback instant but an InnoDB rollback is not?"** Model answer: Postgres writes new versions and makes them invisible by flipping the transaction's status bits; InnoDB updated rows in place and must apply its undo log. Postgres pays later in vacuum. Common wrong answer: "Postgres keeps changes in memory until commit", when 2 million new versions were already on pages.

**"What exactly is on disk when COMMIT returns?"** Model answer: the WAL records up to and including the commit record, flushed; the data pages may still be dirty in memory and are rebuilt from the WAL after a crash. Common wrong answer: "the updated rows are written to the table".

**"How does throughput rise with more clients if each commit needs an fsync?"** Model answer: group commit; one flush covers every commit record appended before it, 7.9 commits per flush with 16 clients in the lab. Common wrong answer: "Postgres batches commits on a timer", which is closer to what `synchronous_commit = off` does.

**"What can you lose with `synchronous_commit = off`?"** Model answer: up to three times `wal_writer_delay` of acknowledged commits on a server crash, with no corruption and no partial transactions. Common wrong answer: "it risks corrupting the database", which is `fsync = off`, a different and dangerous setting.

## What mid-level engineers get wrong

- **Assuming a transaction prevents lost updates.** At read committed, `SELECT` then `UPDATE` with an application-computed value still loses writes.
- **Calling external services inside a transaction.** Locks, connections and vacuum horizons are held for the duration of someone else's latency.
- **Retrying only the failed statement.** A `40001` invalidates every read the transaction made.
- **Confusing `synchronous_commit = off` with `fsync = off`.** The first loses recent commits; the second can corrupt the cluster.
- **Wrapping every ORM call in a savepoint.** Subtransaction overflow degrades every session.
- **Running one giant backfill transaction.** Hours of locks, a WAL burst, and all-or-nothing failure.

## Exercise

The exercise implements the core of crash recovery for an engine that updates pages in place and therefore needs an undo phase (the ARIES family: SQL Server documents its recovery as ARIES, and InnoDB likewise applies its redo log and then rolls back incomplete transactions). At a crash, pages on disk can contain uncommitted changes (flushed early) and lack committed ones (not flushed yet). The log has everything: repeat history, then undo the losers.

```exercise
id: redo-undo-recovery
title: Recover a database from its log
prompt: |
  Implement `recover(disk, log)`.

  `disk` maps keys to integer values: the state of the data pages at the moment
  of the crash. `log` is the write-ahead log in order. Each record is either
  `["update", txn, key, old_value, new_value]` or `["commit", txn]`.

  Recover in two passes:
  1. Redo: walk the log forwards and apply every update's `new_value`,
     whether or not its transaction committed.
  2. Undo: walk the log backwards and, for every update whose transaction has
     no commit record anywhere in the log, restore `old_value`.

  Return the recovered state as a dictionary (keys not mentioned in the log
  keep their disk values). Do not mutate the input.
languages: [python, javascript]
entry: recover
starter:
  python: |
    def recover(disk, log):
        state = dict(disk)
        # redo, then undo losers
        return state
  javascript: |
    function recover(disk, log) {
      const state = { ...disk };
      // redo, then undo losers
      return state;
    }
tests:
  - args: [{"A": 100, "B": 0}, [["update", "T1", "A", 100, 50], ["update", "T1", "B", 0, 50], ["commit", "T1"]]]
    expected: {"A": 50, "B": 50}
    label: committed transfer, pages not flushed
  - args: [{"A": 50, "B": 0}, [["update", "T1", "A", 100, 50], ["update", "T1", "B", 0, 50]]]
    expected: {"A": 100, "B": 0}
    label: uncommitted transfer, half flushed
  - args: [{"x": 1, "y": 2}, [["update", "T1", "x", 1, 10], ["update", "T2", "y", 2, 20], ["commit", "T2"], ["update", "T1", "x", 10, 11]]]
    expected: {"x": 1, "y": 20}
    label: interleaved winner and loser
  - args: [{"k": 7}, []]
    expected: {"k": 7}
    label: empty log
  - args: [{"a": 5, "b": 5, "c": 5, "d": 1}, [["update", "T1", "a", 5, 6], ["commit", "T1"], ["update", "T2", "b", 5, 7], ["update", "T3", "c", 5, 8], ["commit", "T3"], ["update", "T2", "a", 6, 9]]]
    expected: {"a": 6, "b": 5, "c": 8, "d": 1}
    hidden: true
  - args: [{"p": 0}, [["update", "T1", "p", 0, 3], ["commit", "T1"], ["update", "T2", "p", 3, 4], ["commit", "T2"]]]
    expected: {"p": 4}
    hidden: true
  - args: [{"x": 10, "y": 0}, [["update", "T1", "x", 0, 10], ["update", "T1", "y", 5, 0]]]
    expected: {"x": 0, "y": 5}
    hidden: true
hints:
  - "Collect the set of committed transaction ids in a first pass over the log."
  - "Undo must run in reverse log order so that a key updated twice by a loser ends at the oldest value."
```

## Senior signals

- You know where each letter's promise stops: atomicity is a status flip in Postgres, consistency means declared constraints only, durability means "this machine's disk, if it tells the truth", and isolation defaults to a level that permits anomalies.
- You can list the WAL records of a simple transaction (heap or HOT update, index insert when not HOT, commit) and explain full-page images after a checkpoint.
- You reason about commit latency as flush latency, know group commit is why throughput scales with clients, and set `synchronous_commit` per operation knowing what each setting loses.
- You push read-modify-write into single statements (`SET x = x - $1 ... RETURNING`, conditional upserts, server-side appends) before reaching for locks.
- You never hold a transaction across a network call, you retry `40001` and `40P01` by re-running the whole transaction, and you use idempotency keys for commits with unknown outcomes.
- You batch large backfills and can say what one giant transaction does to WAL, replicas, locks and rollback.

## Check yourself

```quiz
- q: >-
    A Postgres transaction updates 2 million rows in 16 seconds and then rolls back in 0.2 ms. Where did the cost of undoing it go?
  options: ["Nowhere; the new versions were only in memory and are discarded", "To WAL replay, which reverts the pages during the next checkpoint", "To vacuum, which must later remove 2 million dead row versions", "To an undo log that background threads apply after the rollback returns"]
  answer: 2
  explanation: >-
    The rollback only marks the transaction aborted in pg_xact, which makes every version it wrote invisible. Those versions remain on the pages as dead tuples (the table grew from 143 MB to 260 MB) until vacuum reclaims them. Postgres has no undo log, and the versions were already written to shared buffers and partly to disk.
- q: >-
    A two-row transfer writes 296 bytes of WAL at steady state but about 33 KB immediately after a checkpoint. Why?
  options: ["Each page's first change after a checkpoint logs a full image", "Checkpoints disable HOT updates until the next autovacuum finishes", "The commit record carries every modified row after a checkpoint", "WAL compression is only applied between checkpoints, not after them"]
  answer: 0
  explanation: >-
    With full_page_writes on, the first modification of a page after a checkpoint includes an image of the whole page, so recovery can repair a page torn by a crash mid-write. Later changes to the same page log only the change. In the traced case the full pages also forced non-HOT updates and index inserts, but the images account for most of the bytes.
- q: >-
    With synchronous_commit = on and one client, a laptop does 623 commits per second. With 16 clients it does 7,749. What explains the scaling?
  options: ["Each client uses its own WAL file, so the flushes run in parallel", "Commits from different clients do not need a flush once the first has one", "Postgres switches to asynchronous commit once there are many clients", "Group commit: one flush makes all queued commit records durable"]
  answer: 3
  explanation: >-
    There is one WAL stream. A flush writes everything up to a position, so commit records appended while a flush is in progress are covered by the next one; the lab measured 7.9 commits per flush with 16 clients. Every commit still waits for a flush that includes its record; nothing switches to asynchronous mode.
- q: >-
    Two concurrent requests each run SELECT balance, subtract 40 in application code, then UPDATE accounts SET balance = <computed value>, inside a transaction at Postgres's default isolation level. What can happen?
  options: ["A deadlock, since each request holds the row lock the other needs", "Nothing bad, because the transaction serialises both read-modify-write cycles", "A serialisation error on one of them, which must then be retried", "A lost update, as both read the same balance and the second write wins"]
  answer: 3
  explanation: >-
    Under read committed nothing stops both transactions reading the same value; the second UPDATE waits for the first's row lock, then overwrites its result. There is no serialisation error at this level and no deadlock with a single row. Compute in SQL (balance = balance - 40), lock with SELECT ... FOR UPDATE, or run at a stricter level with retries.
- q: >-
    Your client sends COMMIT for a money transfer and the TCP connection resets before any reply. What is the safe handling?
  options: ["Assume it committed, because COMMIT is only sent after every write", "Store an idempotency key under a unique constraint and retry", "Assume it failed and retry, since unacknowledged commits roll back", "Reconnect and check pg_stat_activity to see how the session ended"]
  answer: 1
  explanation: >-
    The outcome is unknown to the client: the commit record may or may not have been flushed. Blind retries risk a double transfer and assuming success risks a lost one; the old session is gone from pg_stat_activity either way. A key in the same transaction turns the retry into a detectable duplicate if the first attempt committed.
- q: >-
    A service sets synchronous_commit = off for its page_views inserts. What is the real risk?
  options: ["Inserts may become durable in a different order than they committed", "A server crash can lose up to about 600 ms of acknowledged inserts", "Other sessions may read page views before their transactions commit", "A crash can leave data pages corrupted because WAL was never flushed"]
  answer: 1
  explanation: >-
    COMMIT returns before the WAL flush, and the WAL writer flushes every wal_writer_delay (200 ms), so a crash can lose up to three times that of acknowledged transactions. Ordering and visibility rules are unchanged, and nothing is corrupted because WAL-before-data still holds. Corruption is the risk of fsync = off, a different setting.
```
