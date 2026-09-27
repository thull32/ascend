---
slug: write-ahead-logs
title: "Write-ahead logs: how a commit survives a crash"
description: Why every database appends to a log before touching its pages, what fsync really promises, how group commit amortises it, and how replay and checkpoints bound recovery time.
minutes: 32
difficulty: medium
tags: [wal, durability, fsync, group-commit, checkpoint, storage-engine]
---
A client sends `UPDATE accounts SET balance = balance - 100 WHERE id = 7`, the database replies "committed", and the power goes out 3 milliseconds later. When the machine comes back, that update must be there. That is the durability half of ACID, and it is harder than it sounds, because the row lives in the middle of an 8 KB page on disk, and there is no way to overwrite 8 KB atomically. A crash mid-write leaves a *torn page*: the first 4 KB new, the last 4 KB old, the row's checksum wrong, and the B-tree that page belongs to possibly corrupted.

You cannot make random page writes atomic. What you can do is stop relying on them. The write-ahead log (WAL) is the structure that does that, and it is inside Postgres, MySQL, SQLite, RocksDB, etcd and Kafka. Once you understand it, half of storage-engine design and most of replication become obvious.

## The rule

The WAL rule has one sentence: **before you modify a data page, append a record describing the modification to a log, and make that log record durable.** Everything else follows.

A log record for the update above looks roughly like this:

```text
LSN 0x1A3F0C8  xid 4412  page 1093  offset 264  old: 00 00 07 D0   new: 00 00 07 6C
```

`LSN` is the *log sequence number*: a byte offset into the log that increases monotonically and doubles as a global clock for "which changes happened before which". The record says which page changed, what changed, and (in a redo/undo log) both the old and new bytes.

The commit path is then:

1. Append the log records for the transaction to the WAL buffer in memory.
2. Append a `COMMIT xid 4412` record.
3. Write the WAL buffer to the log file **and call `fsync`** on it.
4. Only now reply "committed" to the client.
5. Modify the in-memory copy of page 1093 in the buffer pool. Do **not** write it to disk yet.

Step 5 can happen whenever the database likes: seconds later, by a background writer, in whatever order is convenient. The data page on disk is stale, but that is fine, because the log has everything needed to rebuild it.

```viz
{"type": "system", "scenario": "wal",
 "title": "Append, fsync, acknowledge, then lazily update pages",
 "caption": "The log is written and synced before the client hears 'committed'; data pages are updated later, and a crash between the two is repaired by replaying the log."}
```

Why does this fix the torn-page problem? Because the log is *append-only*. A crash in the middle of a log write tears the last record, not a page in the middle of a tree. On restart the database scans the log, finds the last record whose checksum is valid, and ignores everything after it. An append-only file has exactly one place that can be torn, and it is the end.

## What fsync actually promises

`write()` does not put bytes on disk. It copies them into the kernel's page cache and returns. The data reaches the device when the kernel feels like it, typically within tens of seconds, or when you call `fsync(fd)`, which blocks until the device reports the data (and, for `fsync`, the file's metadata) as stable.

Two caveats a senior engineer knows:

- **The device may lie.** Consumer disks and many SSDs have a volatile write cache and will acknowledge a write once it is in that cache. The kernel sends a flush command (FUA or a cache flush) as part of `fsync` on most modern setups, but if the cache is configured as write-back without battery backing, "stable" means "in a capacitor-less DRAM buffer". Enterprise SSDs with power-loss protection are the fix; so is `hdparm -W 0` on spinning disks, at a large cost in throughput.
- **`fsync` errors are not retryable.** On Linux, if `fsync` fails once (an I/O error), the dirty pages may be marked clean anyway, and a second `fsync` can return success while the data is gone. Postgres discovered this in 2018 ("fsyncgate") and now panics and restarts on any fsync failure rather than trusting a retry. If your storage code retries `fsync` on error, it is wrong.

The cost is what makes this a design problem rather than a checklist item. Order-of-magnitude numbers:

| Device | `fsync` latency | Sustained fsyncs per second, single writer |
|---|---|---|
| 7200 rpm HDD | ~5–10 ms (one rotation plus seek) | ~100–200 |
| SATA SSD | ~0.5–2 ms | ~500–2,000 |
| NVMe SSD with power-loss protection | ~20–100 µs | ~10,000–50,000 |
| Cloud network block volume | ~1–5 ms, high variance | a few hundred to a few thousand |

A transaction that must fsync before acknowledging cannot commit faster than the device can fsync. On a cloud volume with 2 ms fsyncs, a naïve database that fsyncs once per transaction is capped at ~500 commits per second per log file, no matter how many CPU cores it has. That cap has nothing to do with the query and everything to do with the `fsync` at step 3.

## Group commit

The fix is to notice that one `fsync` makes durable *everything* written to the log before it, not just one transaction's records. If 40 transactions all reach step 3 within the same millisecond, one fsync serves all 40. That is **group commit**: a transaction that wants to fsync first checks whether another one is already about to; if so, it waits for that fsync and then returns.

Worked example. Your device does 2 ms per fsync. Without group commit, 40 concurrent transactions serialise into 40 fsyncs: 80 ms for the batch, 500 commits/s. With group commit, the first transaction issues the fsync at t = 0; the other 39 queue up during those 2 ms; when the fsync returns, all 40 have their records on disk and all 40 are acknowledged. The next batch starts at t = 2 ms. Throughput is now 40 × 500 = 20,000 commits/s with the same 2 ms latency each. Throughput scales with concurrency; latency stays pinned to one fsync.

Every serious engine does a version of this:

- **Postgres** groups implicitly (a backend waiting on the WAL lock sees that its LSN is already flushed) and can be tuned with `commit_delay` / `commit_siblings` to wait a little longer to grow the group.
- **MySQL/InnoDB** has a three-stage binary log group commit (flush, sync, commit stages) so the redo log and the binlog are synced together in batches.
- **Kafka** takes the idea to its limit: producers batch records, brokers append to a partition's log, and durability is defined by replication (`acks=all` with the in-sync replica set), not by fsync, which is left to the OS by default. Kafka's log *is* the database; there is no other structure to update.

The dial you are turning is *latency per commit* against *fsyncs per second*. A short wait (tens of microseconds to a millisecond) can multiply throughput; a long wait makes every commit slow. Postgres's `synchronous_commit = off` moves the fsync off the commit path entirely: the client is acknowledged as soon as the record is in the WAL buffer, and a crash can lose the last few hundred milliseconds of *acknowledged* commits. That is a legitimate choice for a metrics table and an unacceptable one for a ledger; the point is that it is a per-transaction choice, not a database-wide one.

## Recovery: redo, undo and the LSN

On restart after a crash, the engine has a log that is authoritative and a set of data pages in unknown states: some written after their log records, some not, some torn. Recovery repairs the pages from the log.

**Redo.** Scan the log forward from a known starting point. For each record, look at the target page. Every page stores the LSN of the last record applied to it (`pageLSN`). If `record.LSN > pageLSN`, the page is stale: apply the change and set `pageLSN`. If not, the change is already there; skip. That comparison is what makes redo *idempotent*, which matters because a crash *during recovery* just means you redo again from the same start.

**Undo.** Transactions that had log records but no `COMMIT` record when the crash hit must be rolled back. In an undo/redo log (ARIES, InnoDB), their records carry the old values, so recovery walks them backwards and reverts. Postgres avoids undo entirely: its MVCC keeps old row versions in the heap, so an uncommitted transaction's rows are simply invisible because its transaction ID is never marked committed. That is one of the reasons Postgres needs `VACUUM` and InnoDB does not, and it is a good example of how one storage decision echoes through a whole engine.

**Torn pages, again.** Redo assumes it can read the page's `pageLSN`. A torn page might have a corrupted header. Postgres handles this with **full-page writes**: the first time a page is modified after a checkpoint, the WAL record contains the *entire* 8 KB page, not just the diff. Redo can then reconstruct the page from scratch without reading the damaged one. This is why Postgres WAL volume spikes right after each checkpoint, and why doubling the checkpoint interval often halves WAL traffic. InnoDB solves the same problem with a *doublewrite buffer*: pages are written to a scratch area, synced, then written to their real location.

## Checkpoints: bounding recovery time

If redo scans the log from the beginning of time, recovery takes as long as the database has been alive. A **checkpoint** fixes that. Periodically the engine:

1. Writes a `CHECKPOINT BEGIN` record with the current LSN.
2. Flushes every dirty page in the buffer pool to disk (spread over time to avoid an I/O storm; Postgres's `checkpoint_completion_target` spreads it over, say, 90% of the interval).
3. Writes `CHECKPOINT END` and records its LSN in a control file.

After a checkpoint, every change with an LSN below the checkpoint is on disk in its data page. Recovery can start redo from the last completed checkpoint and ignore the log before it. Log segments older than the checkpoint can be deleted or recycled (**log truncation**), unless something else still needs them: a replica that has not received them, a base backup that will need them for point-in-time recovery, or a logical replication slot. A forgotten replication slot pinning WAL is a classic way to fill a Postgres disk.

The trade-off is explicit and worth stating in an interview:

| Checkpoint interval | Recovery time | Steady-state I/O | WAL volume (Postgres) |
|---|---|---|---|
| Short (1 min) | Seconds | Frequent dirty-page flushes, more page rewrites | High: full-page writes after every checkpoint |
| Long (30 min) | Minutes of redo | Fewer flushes, dirty pages coalesce | Low |

Longer intervals are cheaper in steady state and more expensive at the moment you least want expense, which is during an outage. Most teams run intervals of minutes and accept recovery in the tens of seconds.

## The log as the replication stream

Once you have a durable, ordered, self-describing record of every change, you have solved a second problem for free: replication. A replica does not need to re-execute SQL; it needs to receive log records and apply them with the same redo logic as recovery. Postgres streaming replication ships WAL bytes over a TCP connection; the replica is permanently "recovering". Synchronous replication means the leader waits for a replica to fsync the record before acknowledging the commit, which adds a network round trip to every commit but means a single machine loss cannot lose acknowledged data.

```viz
{"type": "system", "scenario": "replication-leader-follower",
 "title": "The WAL stream is the replication stream",
 "caption": "Followers apply the leader's log records with the same redo path used for crash recovery; replication lag is simply how far behind the follower's applied LSN is."}
```

The same shape appears elsewhere under other names. Raft's replicated log (etcd, CockroachDB, TiKV) is a WAL whose ordering is agreed by consensus. MySQL's binlog is a logical WAL consumed by replicas and by change-data-capture tools like Debezium. Kafka is a distributed WAL with consumers instead of a buffer pool. When someone says "log-based", they mean this structure.

## Where each system puts its log

- **Postgres.** `pg_wal/` holds 16 MB segments. Redo-only; MVCC provides undo. Full-page writes after checkpoints. Streaming and logical replication read the same stream.
- **MySQL InnoDB.** A redo log (`ib_logfile*`) for durability plus undo logs in the tablespace for rollback and MVCC, plus a separate binlog for replication; keeping redo and binlog consistent is what the group-commit stages are for.
- **SQLite.** Two modes. Rollback-journal mode copies the *old* page to a journal before overwriting (an undo log; readers block writers). WAL mode appends *new* pages to a `-wal` file and periodically checkpoints them into the main file; readers and one writer proceed concurrently, which is why WAL mode is the default recommendation for anything with concurrency.
- **RocksDB / LevelDB.** A WAL per memtable. When the memtable is flushed to an SSTable, its WAL is deleted. The WAL exists only to recover the memtable, which is the topic of the [next lesson](/learn/advanced-data-structures/log-structured-and-disk-structures/lsm-trees-and-sstables).
- **Kafka.** The partition log is the only storage structure. Retention is by time or size, not by checkpoint. Durability comes from `acks=all` and `min.insync.replicas`; `flush.messages` can force fsync but almost nobody sets it.
- **etcd.** A Raft log on disk (fsynced on every append, which is why etcd wants a fast dedicated disk) plus a bbolt B-tree snapshot for state.

## A toy WAL you can reason about

The exercise below strips the idea to its skeleton: an append-only list of `(lsn, key, value)` records, a durable-LSN watermark that `commit()` advances, a `crash()` that throws away everything above the watermark, and a `recover()` that rebuilds a key-value map by replaying committed records in order. Real logs add checksums, page IDs, transaction IDs and checkpoints, but the invariant is the one you are implementing: **state is a deterministic function of the committed prefix of the log.**

```exercise
id: toy-wal
title: Implement a write-ahead log with commit, crash and recovery
prompt: |
  Implement `WAL` with these methods:

  - `append(key, value)` appends a record and returns its LSN. LSNs are
    1-based and consecutive. After a crash, LSNs continue from the last
    durable LSN + 1 (the discarded tail is reused).
  - `commit()` marks every record appended so far as durable. Returns `None`/`null`.
  - `crash()` discards every record that is not durable. Returns `None`/`null`.
  - `get(key)` returns the latest value for `key` among all records currently
    in the log (durable or not), or `None`/`null` if absent.
  - `recover()` returns a dictionary/plain object mapping each key to its
    latest value, built by replaying only the durable records in LSN order.

  The tests replay a sequence of calls and compare the list of return values.
languages: [python, javascript]
entry: WAL
starter:
  python: |
    class WAL:
        def __init__(self):
            self.records = []      # list of (lsn, key, value)
            self.durable_lsn = 0   # every record with lsn <= durable_lsn is durable

        def append(self, key, value):
            # TODO: append and return the new LSN
            return 0

        def commit(self):
            # TODO: advance durable_lsn to the last record
            return None

        def crash(self):
            # TODO: drop records above durable_lsn
            return None

        def get(self, key):
            # TODO: latest value in the whole log, or None
            return None

        def recover(self):
            # TODO: replay durable records in order into a dict
            return {}
  javascript: |
    class WAL {
      constructor() {
        this.records = [];     // array of [lsn, key, value]
        this.durableLsn = 0;   // every record with lsn <= durableLsn is durable
      }
      append(key, value) {
        // TODO: append and return the new LSN
        return 0;
      }
      commit() {
        // TODO: advance durableLsn to the last record
        return null;
      }
      crash() {
        // TODO: drop records above durableLsn
        return null;
      }
      get(key) {
        // TODO: latest value in the whole log, or null
        return null;
      }
      recover() {
        // TODO: replay durable records in order into a plain object
        return {};
      }
    }
tests:
  - args: [["append","a",1],["append","b",2],["commit"],["recover"]]
    expected: [1, 2, null, {"a": 1, "b": 2}]
  - args: [["append","a",1],["commit"],["append","a",2],["crash"],["get","a"],["recover"]]
    expected: [1, null, 2, null, 1, {"a": 1}]
    label: uncommitted update is lost on crash
  - args: [["append","a",1],["crash"],["recover"],["append","b",5],["commit"],["get","b"]]
    expected: [1, null, {}, 1, null, 5]
    label: LSN restarts from the durable watermark
  - args: [["append","x",1],["append","x",2],["commit"],["recover"]]
    expected: [1, 2, null, {"x": 2}]
    label: last write wins during replay
  - args: [["get","missing"],["recover"]]
    expected: [null, {}]
    label: empty log
  - args: [["append","k",1],["commit"],["append","k",2],["commit"],["append","k",3],["crash"],["append","k",4],["commit"],["recover"],["get","k"]]
    expected: [1, null, 2, null, 3, null, 3, null, {"k": 4}, 4]
    hidden: true
    label: crash then reuse the LSN
  - args: [["append","a",1],["append","b",2],["commit"],["append","c",3],["get","c"],["recover"],["crash"],["get","c"]]
    expected: [1, 2, null, 3, 3, {"a": 1, "b": 2}, null, null]
    hidden: true
    label: recover ignores the uncommitted tail even before a crash
hints:
  - "The next LSN is `len(records) + 1` as long as `crash()` truncates the list to `durable_lsn` records."
  - "`recover()` walks records with `lsn <= durable_lsn` in order and overwrites; later records win."
  - "`get()` is the same walk over the whole list; returning the last match is enough."
```

## Senior signals

- You say "durable means the WAL record is fsynced, not that the page is written", and you can explain why the page can lag by minutes without risk.
- You know that `fsync` throughput, not CPU, caps commit rate on a single log, and you reach for **group commit** before you reach for more cores.
- You can name the torn-page problem and two different fixes (Postgres full-page writes, InnoDB doublewrite buffer).
- You treat the checkpoint interval as a trade between steady-state I/O and recovery time, and you know a stuck replication slot fills the disk.
- You know Postgres has no undo log because MVCC keeps old versions, and that this is why it has `VACUUM`.
- You recognise Kafka, Raft logs and Postgres streaming replication as the same structure, and you can say which one gives durability by fsync and which by replication.

## Check yourself

```quiz
- q: >-
    A database acknowledges a commit as soon as the WAL record is in the OS page cache, without calling fsync. What is the actual guarantee?
  options: ["It survives a process crash but not a power loss or kernel panic", "It survives everything, because the kernel flushes within seconds", "It survives a power loss but not a kernel panic, which clears the cache", "It survives nothing, because unsynced log bytes are as good as no log"]
  answer: 0
  explanation: >-
    The page cache belongs to the kernel, so a crash of the database process leaves the bytes intact and the kernel will eventually write them. Power loss or a kernel panic discards the cache, and the kernel's periodic flush does not help if either happens first. This is exactly the trade Postgres offers with synchronous_commit = off.
- q: >-
    Your NVMe device completes an fsync in 50 µs and 200 threads each commit one small transaction per millisecond. Without group commit, roughly what is the commit throughput ceiling of a single WAL?
  options: ["About 200,000 commits per second", "Unbounded; NVMe parallelises fsyncs", "About 20,000 commits per second", "About 1,000 commits per second"]
  answer: 2
  explanation: >-
    One fsync per commit, serialised on one log, gives 1 / 50 µs = 20,000 fsyncs per second, regardless of the 200 offered commits per millisecond. Group commit lets one fsync cover many transactions and lifts the ceiling toward the offered load.
- q: >-
    Why does Postgres write the entire 8 KB page into the WAL the first time it is modified after a checkpoint?
  options: ["Because MVCC needs the old row versions in the log for undo", "So redo can rebuild a torn page without reading its damaged copy", "So replicas can apply whole pages and skip replaying small records", "So every WAL segment holds a whole number of fixed-size pages"]
  answer: 1
  explanation: >-
    Redo normally reads the page's LSN to decide whether a record applies. A torn page may have a corrupt header, so the first post-checkpoint record carries the whole page and redo reconstructs it from the log alone. Postgres MVCC keeps old row versions in the heap and needs no undo from the log. InnoDB's doublewrite buffer solves the torn-page problem differently.
- q: >-
    You double the checkpoint interval on a busy Postgres server. Which combination of effects should you expect?
  options: ["Slower recovery, less WAL volume and fewer dirty-page flushes", "Faster recovery, more WAL volume and more dirty-page flushes", "Slower recovery, more WAL volume and more dirty-page flushes", "Faster recovery, less WAL volume and fewer dirty-page flushes"]
  answer: 0
  explanation: >-
    Recovery must redo from the last checkpoint, so a longer interval means more log to replay. In exchange, full-page writes happen half as often and dirty pages coalesce before being flushed, so both WAL volume and background I/O drop.
- q: >-
    Recovery is interrupted by a second crash halfway through redo. What makes it safe to simply start recovery again from the same checkpoint?
  options: ["Redo skips every record whose LSN is not above the page's stored LSN", "Recovery rewrites the log as it goes, so the second pass is shorter", "Pages changed during recovery stay in memory until recovery finishes", "Undo runs before redo and reverts whatever the partial redo applied"]
  answer: 0
  explanation: >-
    Each page carries the LSN of the last applied record. A record whose LSN is not greater than the page's is skipped, so re-running redo over already-repaired pages does nothing: redo is idempotent. That property is what lets recovery tolerate its own failures; nothing needs to be held back or reverted first.
```
