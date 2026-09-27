---
slug: transactions-and-acid
title: "Transactions and ACID: what the database actually promises"
description: What atomicity, consistency, isolation and durability each guarantee mechanically in Postgres, where each promise stops, and the five transaction bugs that application code keeps reintroducing.
minutes: 28
difficulty: medium
tags: [transactions, acid, wal, durability, postgres, atomicity]
---
A wallet service moves money in two statements: debit the customer, credit the merchant. The process is killed by the out-of-memory killer between them. With the driver in autocommit mode, each statement was its own transaction, so the debit is committed and durable and the credit never happened. Forty pounds has left the system. Nobody notices until the monthly reconciliation fails.

Wrap both statements in one transaction and the same crash leaves neither of them. That is the promise people remember from ACID. The other three letters promise something narrower than most engineers assume, and the gaps between what they promise and what people believe they promise are where production bugs live.

## The transaction boundary

A transaction is a group of statements the database treats as one unit: either all of their effects become visible and permanent, or none do.

```sql
BEGIN;
UPDATE accounts SET balance_cents = balance_cents - 4000 WHERE id = 17;
UPDATE accounts SET balance_cents = balance_cents + 4000 WHERE id = 912;
COMMIT;
```

Without `BEGIN`, Postgres runs every statement in its own implicit transaction (autocommit). Drivers add their own defaults on top, and they differ in ways that bite:

- **psycopg** (Python) is *not* in autocommit mode by default. The first statement silently opens a transaction that stays open until you call `commit()`. A script that runs one `SELECT` and then sleeps holds a transaction open the whole time, which shows up in `pg_stat_activity` as `idle in transaction` and blocks vacuum.
- **sqlx and SeaORM** (Rust) run statements on the pool in autocommit mode. You open a transaction explicitly with `db.begin()`, pass `&txn` to every query that belongs to it, and call `txn.commit()`. Dropping the transaction without committing rolls it back, so an early `?` return undoes the work rather than committing half of it. Calling `begin()` on a transaction creates a `SAVEPOINT`, which is how SeaORM does nesting.
- **ORMs in general** often wrap each `save()` in its own transaction, which is atomic per object and not across objects.

```rust
let txn = db.begin().await?;
debit(&txn, 17, 4000).await?;   // an error here drops txn: ROLLBACK
credit(&txn, 912, 4000).await?;
txn.commit().await?;
```

## Atomicity: commit is a status flip

How can Postgres undo a transaction that has already written a million rows to pages in memory, some of which may already be on disk? It does not undo anything.

Every row version a transaction writes is stamped with that transaction's ID (`xmin`). The fate of each transaction ID is recorded separately, in a structure called `pg_xact` (the commit log): two bits per transaction meaning *in progress*, *committed*, *aborted* or *sub-committed*. When another session reads a row version, it checks the status of the version's `xmin`. If the creating transaction aborted, the version is invisible, whatever page it sits on.

So:

- **Commit** appends a commit record to the write-ahead log, flushes it, and flips two bits in `pg_xact`. That is the atomic step. Before it, none of the transaction's writes are visible to anyone else; after it, all of them are.
- **Abort** flips the bits to *aborted*. The row versions stay where they are, dead, until vacuum reclaims them. A rollback of a 10 GB `UPDATE` in Postgres is instant.

InnoDB (MySQL) makes the opposite choice: it updates rows in place and keeps the old values in an undo log. Rollback means applying the undo log backwards, which for a large transaction can take as long as the transaction itself, including during crash recovery. Neither design is free. Postgres pays later, in dead tuples and vacuum; InnoDB pays at rollback time and in undo-log growth. Both come back in [MVCC and locking](/learn/databases/relational-fundamentals/mvcc-and-locking).

Two behaviours follow that surprise people:

**One error poisons the transaction.** After any error inside a transaction block, Postgres rejects every further statement with `ERROR: current transaction is aborted, commands ignored until end of transaction block` until you roll back. You cannot catch a unique violation and carry on. If you want that, set a savepoint first and roll back to it:

```sql
BEGIN;
SAVEPOINT try_insert;
INSERT INTO tags (name) VALUES ('rust');          -- may violate a unique constraint
ROLLBACK TO SAVEPOINT try_insert;                  -- only if it failed
INSERT INTO post_tags (post_id, tag) VALUES (42, 'rust');
COMMIT;
```

(`INSERT ... ON CONFLICT DO NOTHING` is the better answer here; savepoints are for cases with no single-statement form.)

**Savepoints are not free.** Each savepoint that writes gets its own subtransaction ID. Postgres caches a small number of them per backend (64); beyond that, visibility checks must consult an on-disk structure, and workloads that use hundreds of savepoints per transaction (common with ORMs that wrap every nested call in one) have hit sharp performance cliffs, especially on replicas. Use them deliberately.

## Consistency: the letter that belongs to you

The C in ACID is the odd one out. The database cannot know your invariants ("an account balance never goes negative", "the sum of ledger entries equals the balance"). What it promises is narrower: a transaction moves the database from one state that satisfies the **declared constraints** to another, or it fails.

That makes constraints the part of consistency you get for free, and it is why declaring them matters:

```sql
ALTER TABLE accounts ADD CONSTRAINT balance_non_negative CHECK (balance_cents >= 0);
```

With that constraint, a race that would have overdrawn an account becomes an error (`new row for relation "accounts" violates check constraint`) instead of silent corruption. Foreign keys, `UNIQUE`, `NOT NULL`, `CHECK` and exclusion constraints are all checked atomically as each statement completes, or at commit time for constraints declared `DEFERRABLE INITIALLY DEFERRED`, which is how you insert two rows that reference each other.

Every invariant you cannot express as a constraint is enforced by your code, inside transactions, under whatever isolation level you chose. That is where the other letters come in.

## Durability: the commit record is on disk

"Durable" means that once `COMMIT` returns, the transaction survives a crash. Postgres delivers that through the write-ahead log: the commit is acknowledged only after the WAL records describing the transaction, including the commit record, have been flushed to disk with `fsync`. The changed data pages can stay dirty in memory for minutes, because after a crash the log can rebuild them.

```viz
{"type": "system", "scenario": "wal", "title": "Durability comes from the log, not the data files",
 "caption": "The commit is acknowledged once the log record is fsynced; the data page is written later at a checkpoint. After a crash, recovery replays the log from the last checkpoint and redoes every change whose page is behind."}
```

[Storage engine internals](/learn/databases/storage-and-scale/storage-engine-internals) covers the log, checkpoints and group commit in detail. For transactions, what matters is exactly what "durable" is conditional on.

**The disk must tell the truth about `fsync`.** Consumer SSDs and some virtualised storage acknowledge writes from a volatile cache. A power cut then loses commits the database was told were safe. Enterprise drives with power-loss protection and properly configured cloud volumes do not have this problem. You verify it, you do not assume it.

**Postgres must hear about `fsync` failures.** In 2018 it came out that when `fsync` failed, Linux could discard the dirty pages it had failed to write and report success on a retry. Postgres had been retrying. The fix was to treat an `fsync` failure as fatal: the server panics and recovers from the WAL, which still holds the changes. This is worth knowing as an example of how many layers a durability promise passes through.

**Durable means on this machine.** If the disk dies, a committed transaction is only as safe as your replicas and backups. `synchronous_commit` lets you choose, per transaction if you like, how far the commit record must travel before `COMMIT` returns:

| `synchronous_commit` | `COMMIT` returns after | Lost if |
|---|---|---|
| `off` | Commit record is in WAL buffers; the WAL writer flushes it shortly after | The server crashes before that flush, a window of up to three times `wal_writer_delay` (600 ms by default); never corrupts, only loses recent commits |
| `local` | WAL flushed on the primary | The primary's disk is lost |
| `remote_write` | Standby has received it into OS memory | Primary lost and standby's OS crashes together |
| `on` (with a synchronous standby) | Standby has flushed it | Both primary and standby lose their disks |
| `remote_apply` | Standby has flushed and replayed it | As above; also guarantees a read on the standby sees it |

Without a synchronous standby configured, `on` means `local`. The [replication](/learn/databases/storage-and-scale/replication) lesson shows the latency cost of each row. The senior point is that durability is a dial you set per operation: `off` for click tracking, `on` with a synchronous standby for payments.

## Isolation: a spectrum, not a switch

If transactions ran one at a time, every transaction would see a database that nobody else was changing, and correctness would only depend on each transaction being correct on its own. That property is **serialisability**: the result of running transactions concurrently is the same as running them in *some* serial order.

Serialisability costs coordination, so databases offer weaker levels, and the default is always one of the weaker ones:

| Database | Default level | What that permits (in brief) |
|---|---|---|
| Postgres | Read committed | Each statement sees a fresh snapshot; lost updates and write skew are possible |
| MySQL (InnoDB) | Repeatable read | A consistent snapshot for plain reads, but locking reads and writes see the latest data |
| Oracle, SQL Server | Read committed | Similar to Postgres |
| CockroachDB | Serialisable | Correct by default; conflicting transactions must retry |

The ANSI SQL standard defines the levels by which **anomalies** they rule out: dirty reads, non-repeatable reads, phantoms. Real databases implement them with snapshots and locks, and their behaviour does not line up neatly with the standard. The next lesson, [isolation levels and anomalies](/learn/databases/relational-fundamentals/isolation-levels-and-anomalies), goes through each anomaly with a two-session timeline. For now, remember that "we use transactions" does not mean "we are safe from concurrency bugs". Under the default level, two correct transactions running together can produce a result neither could produce alone.

## Five transaction bugs that application code keeps reintroducing

### 1. Read-modify-write in the application

```python
balance = db.fetch_val("SELECT balance_cents FROM accounts WHERE id = %s", (17,))
db.execute("UPDATE accounts SET balance_cents = %s WHERE id = %s", (balance - 4000, 17))
```

Two requests interleave, both read 10,000, both write 6,000, and one withdrawal disappears. Wrapping it in a transaction does not help under read committed. Push the arithmetic into one statement, which Postgres executes atomically against the latest row version:

```sql
UPDATE accounts
SET balance_cents = balance_cents - 4000
WHERE id = 17 AND balance_cents >= 4000
RETURNING balance_cents;       -- zero rows returned means insufficient funds
```

This app does the same for lesson progress. `ProgressService::set_lesson_status` uses a single `INSERT ... ON CONFLICT (user_id, lesson_slug) DO UPDATE` statement, with the comment "Upsert: one statement, no read-modify-write race". Reading the row, deciding whether to insert or update, then writing would race with a second tab doing the same.

### 2. Slow work inside a transaction

A handler opens a transaction, locks the order row, calls a payment provider (800 ms at p50, 30 s at worst), then writes the result. For that whole time the transaction holds its row locks, occupies a pooled connection, and pins the oldest snapshot that vacuum must respect. At 50 requests per second the connection pool is exhausted in seconds. Never hold a transaction open across a network call to anything other than the database. Record the intent, commit, make the call, then record the outcome in a second transaction, with an idempotency key so the call can be retried safely.

Set guard rails so a mistake cannot hold locks forever:

```sql
ALTER ROLE app SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE app SET statement_timeout = '5s';
```

### 3. Not retrying the failures that are meant to be retried

Serialisation failures (SQLSTATE `40001`) and deadlocks (`40P01`) are not bugs. They are the database telling you it aborted your transaction to protect correctness, and that running it again will probably succeed. Retrying must re-run the *whole* transaction, including its reads, because the decisions it made were based on data that has since changed.

```python
import random, time
import psycopg
from psycopg import errors

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
                    raise InsufficientFunds(src)          # not retried
                conn.execute(
                    "UPDATE accounts SET balance_cents = balance_cents + %s WHERE id = %s",
                    (cents, dst),
                )
            return
        except (errors.SerializationFailure, errors.DeadlockDetected):
            time.sleep(random.uniform(0, 0.01 * 2 ** attempt))   # jittered backoff
    raise RetriesExhausted(src, dst)
```

### 4. The commit whose outcome you do not know

The client sends `COMMIT`, and the connection drops before the reply arrives. Did it commit? You cannot tell from the client. Retrying blindly may apply the transfer twice; not retrying may lose it. The fix is to make the transaction idempotent: store a client-generated key under a unique constraint in the same transaction, and have the retry detect that the key already exists.

```sql
INSERT INTO transfers (idempotency_key, src, dst, cents) VALUES ($1, $2, $3, $4);
-- a retry of an already-committed transfer fails here with a unique violation,
-- which the application maps to "already done"
```

### 5. The transaction that is too big

`UPDATE events SET region = 'eu' WHERE region IS NULL` on 80 million rows is one transaction. It writes 80 million new row versions and tens of gigabytes of WAL in a burst that replicas must replay, holds row locks on everything it touched until the end, and if it fails at 95%, all of it is thrown away. Batch it: update 5,000 rows per transaction by primary-key range, commit, repeat. Each batch is atomic; the backfill as a whole is resumable. [Schema migrations at scale](/learn/databases/data-modeling-and-evolution/schema-migrations-at-scale) covers the pattern.

## Recovery, as an exercise

The exercise below implements the core of crash recovery for an engine that, unlike Postgres, updates pages in place and therefore needs an undo phase (the ARIES family, which InnoDB and SQL Server follow). At a crash, the data pages on disk can contain changes from uncommitted transactions (the buffer pool flushed them early) and can be missing changes from committed ones (not flushed yet). The log has everything. Recovery repeats history, then undoes the losers.

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

- You know where each letter's promise stops: atomicity is one status flip in Postgres, consistency means declared constraints only, durability means "this machine's disk, if it tells the truth", and isolation defaults to a level that permits anomalies.
- You push read-modify-write into single statements (`UPDATE ... SET x = x - $1 WHERE ... RETURNING`, `INSERT ... ON CONFLICT`) before reaching for locks.
- You never hold a transaction open across a network call, and you set `idle_in_transaction_session_timeout` so nobody else can either.
- You retry `40001` and `40P01` by re-running the whole transaction with jittered backoff, and you use idempotency keys for the commit whose outcome is unknown.
- You choose `synchronous_commit` per operation and can say what each setting loses on which failure.
- You batch large backfills into many small transactions and can explain what one giant transaction does to WAL, replicas, locks and rollback.

## Check yourself

```quiz
- q: >-
    A Postgres transaction has updated 30 million rows and is then rolled back. Why does the rollback finish almost instantly?
  options: ["It truncates the WAL back to the transaction's start, discarding the changes", "Postgres buffers all the changes in memory and writes nothing until commit", "It marks the transaction aborted; its new row versions just become invisible", "It returns at once and applies the undo log to the pages in the background"]
  answer: 2
  explanation: >-
    Every version carries its creating transaction id, and visibility checks consult that transaction's status in the commit log. Flipping the status to aborted makes all 30 million versions invisible at once; they stay on their pages until vacuum reclaims them. The cost is deferred to vacuum. An undo-log engine such as InnoDB would instead have to reverse each change, and Postgres has no undo log to apply.
- q: >-
    Two concurrent requests each run SELECT balance, subtract 40 in application code, then UPDATE accounts SET balance = <computed value>, both inside a transaction at Postgres's default isolation level. What can happen?
  options: ["A lost update: both read the same balance and the second write wins", "One of them always fails with a serialisation error and must be retried", "They deadlock, because each holds the row lock the other one needs", "Nothing bad; the transaction serialises the two read-modify-write cycles"]
  answer: 0
  explanation: >-
    Under read committed nothing stops two transactions from reading the same value and writing conflicting results; the second UPDATE waits for the first's row lock, then overwrites it. There is no serialisation error at this level and no deadlock, since only one row lock is involved. Compute in SQL (balance = balance - 40), lock the row with SELECT ... FOR UPDATE, or use a stricter isolation level with retries.
- q: >-
    Which statement about the C in ACID is accurate?
  options: ["It guarantees that all of your business invariants hold after every transaction", "It guarantees declared constraints hold; any other invariants are yours to enforce", "It guarantees every replica agrees with the primary once a commit returns", "It guarantees the WAL and data files agree once crash recovery completes"]
  answer: 1
  explanation: >-
    The database cannot know invariants you have not declared. It enforces constraints (CHECK, UNIQUE, NOT NULL, foreign keys) atomically; everything else depends on your transaction logic and the isolation level. Replica agreement is a different use of the word consistency, from distributed systems.
- q: >-
    Your client sends COMMIT and the TCP connection resets before any reply. What is the safe way to handle this for a money transfer?
  options: ["Reconnect and check pg_stat_activity to see whether the session committed", "Make the transfer idempotent with a client key under a unique constraint", "Treat it as committed, since COMMIT is sent only after every write succeeded", "Treat it as failed and retry, since an unacknowledged commit rolls back"]
  answer: 1
  explanation: >-
    The outcome is genuinely unknown to the client: the commit may or may not have been flushed. Blind retries risk double application; assuming success risks loss; the old session is gone from pg_stat_activity either way. An idempotency key turns the retry into a safe no-op if the first attempt committed, and into the real transfer if it did not.
- q: >-
    A service sets synchronous_commit = off for its page_views inserts. What is the actual risk?
  options: ["Other sessions can read page views before their transactions commit", "Inserts can become durable in a different order than they committed", "A server crash can lose the last fraction of a second of acknowledged inserts", "A crash can leave data pages corrupted, because the WAL was not flushed"]
  answer: 2
  explanation: >-
    With synchronous_commit off, COMMIT returns before the WAL flush, so a crash can lose recently acknowledged transactions. It cannot corrupt data or break atomicity, because the WAL ordering rules still hold and the database remains consistent. Visibility rules are unchanged too. For analytics-style inserts this is often a good trade.
```
