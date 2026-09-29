---
slug: write-ahead-logs
title: "Write-ahead logs: how a commit survives a crash"
description: Why every database appends to a log before touching its pages, what a log record looks like byte by byte in Postgres, RocksDB and Kafka, what fsync really promises and costs, how group commit amortises it, and how redo with page LSNs and checkpoints bound recovery time.
minutes: 50
difficulty: medium
tags: [wal, durability, fsync, group-commit, checkpoint, storage-engine]
---
A client sends `UPDATE accounts SET balance = balance - 100 WHERE id = 7`, the database replies "committed", and the power goes out 3 milliseconds later. When the machine comes back, that update must be there. That is the durability half of ACID, and it is harder than it sounds, because the row lives in the middle of an 8 KB page on disk, and there is no way to overwrite 8 KB atomically. A crash mid-write leaves a *torn page*: the first 4 KB new, the last 4 KB old, the row's checksum wrong, and the B-tree that page belongs to possibly corrupted.

You cannot make random page writes atomic. What you can do is stop relying on them. The write-ahead log (WAL) is the structure that does that, and it is inside Postgres, MySQL, SQLite, RocksDB, etcd and Kafka. Once you understand it, half of storage-engine design and most of replication become obvious. This lesson shows the record formats those systems write, puts numbers on `fsync`, traces group commit and recovery step by step, and ends with the failures a WAL produces in production. It assumes the [B+ tree](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees) page model and the filesystem view in [filesystems and storage](/learn/systems/operating-systems/filesystems-and-storage).

## The rule

The WAL rule has one sentence: **before you modify a data page, append a record describing the modification to a log, and make that log record durable.** Everything else follows.

A log record for the update above says which page changed, what changed, and (in a redo/undo log) both the old and new bytes:

```text
LSN 0x1A3F0C8  xid 4412  page 1093  offset 264  old: 00 00 07 D0   new: 00 00 07 6C
```

`LSN` is the *log sequence number*: a byte offset into the log that increases monotonically and doubles as a global clock for "which changes happened before which".

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

## What a record looks like on disk

The abstract record above is a real byte layout in every engine, and the layouts differ in instructive ways.

**Postgres `XLogRecord`.** Every record starts with a 24-byte header: total length (4 bytes), transaction id (4), the LSN of the previous record (8, which is how recovery walks backwards and how a torn tail is detected), an info byte and a resource-manager id (1 + 1, "this is a heap update" versus "a B-tree split"), 2 bytes of padding and a CRC-32C (4) over the whole record. Then come one block reference per page touched (a 4-byte block header, a 12-byte relation identifier and a 4-byte block number, so 20 bytes per page unless the relation repeats), then the record's own data, then per-block data, all padded to 8-byte alignment. A single-row heap update on one page is on the order of 100–150 bytes; the first update of that page after a checkpoint adds the full 8 KiB page image (compressible with `wal_compression`, which typically shrinks it several-fold). Records are packed into 8 KiB WAL pages, each with its own 24-byte page header (40 at the start of a segment), inside 16 MiB segment files under `pg_wal/`.

**RocksDB / LevelDB log.** The log file is a sequence of 32 KiB blocks. Each record fragment has a 7-byte header, CRC-32C (4), length (2) and type (1), or 11 bytes in the recyclable format that adds a 4-byte log number so a reused file cannot be confused with old contents. A write batch larger than the space left in a block is split into `FIRST`, `MIDDLE` and `LAST` fragments across blocks; a whole one is `FULL`. The 32 KiB block boundary is why recovery can resynchronise after a corrupt fragment: it skips to the next block and continues.

**Kafka `RecordBatch`.** A batch header is 61 bytes (base offset 8, batch length 4, leader epoch 4, magic 1, CRC 4, attributes 2, last offset delta 4, first and max timestamps 8 + 8, producer id 8, producer epoch 2, base sequence 4, record count 4), followed by variable-length records with delta-encoded offsets and timestamps. The producer id, epoch and sequence fields are what make idempotent producers possible: the broker rejects a batch whose sequence it has already appended. A partition segment file is this batch stream; there is no other data structure to keep consistent.

The common design across all three: a length, a checksum, a monotonically increasing position, and a way to recognise where a record ends so the tail can be trusted or discarded.

## What fsync actually promises

`write()` does not put bytes on disk. It copies them into the kernel's page cache and returns. The data reaches the device when the kernel feels like it, typically within tens of seconds (`dirty_expire_centisecs`, 30 s by default), or when you call `fsync(fd)`, which blocks until the device reports the data and the file's metadata as stable. `fdatasync` skips metadata that is not needed to read the data back (timestamps), which is why Postgres defaults `wal_sync_method` to `fdatasync` on Linux and why RocksDB uses it for its WAL. Both send a cache-flush (or a FUA write) to the device as part of the call on modern kernels.

Two caveats a senior engineer knows:

- **The device may lie.** Consumer disks and many SSDs have a volatile write cache and will acknowledge a write once it is in that cache. If the cache is write-back without power-loss protection, "stable" means "in a capacitor-less DRAM buffer". Enterprise SSDs with power-loss protection are the fix; so is disabling the write cache on spinning disks, at a large cost in throughput.
- **`fsync` errors are not retryable.** On Linux, if `fsync` fails once (an I/O error), the dirty pages may be marked clean anyway, and a second `fsync` can return success while the data is gone. Postgres discovered this in 2018 ("fsyncgate") and now panics and restarts on any fsync failure rather than trusting a retry. If your storage code retries `fsync` on error, it is wrong.

The cost is what makes this a design problem rather than a checklist item. Order-of-magnitude numbers, which depend on the device's cache policy and queue depth:

| Device | `fsync` latency | Sustained fsyncs per second, single writer |
|---|---|---|
| 7200 rpm HDD | ~5–10 ms (one rotation plus seek) | ~100–200 |
| SATA SSD | ~0.5–2 ms | ~500–2,000 |
| NVMe SSD with power-loss protection | ~20–100 µs | ~10,000–50,000 |
| Cloud network block volume | ~1–5 ms, high variance | a few hundred to a few thousand |

A transaction that must fsync before acknowledging cannot commit faster than the device can fsync. On a cloud volume with 2 ms fsyncs, a naïve database that fsyncs once per transaction is capped at ~500 commits per second per log file, no matter how many CPU cores it has. That cap has nothing to do with the query and everything to do with the `fsync` at step 3.

## Group commit, traced

The fix is to notice that one `fsync` makes durable *everything* written to the log before it, not only one transaction's records. If 40 transactions all reach step 3 within the same millisecond, one fsync serves all 40. That is **group commit**: a transaction that wants to fsync first checks whether another one is already about to; if so, it waits for that fsync and then returns.

Trace it on a device with a 2 ms fsync and 40 clients that each commit continuously:

| Time | Event | Log state |
|---|---|---|
| 0.00 ms | T1 appends its records (LSN 100–160) and calls fsync | fsync #1 in flight, covering ≤ 160 |
| 0.05–1.95 ms | T2…T40 append (LSN 161–2,500); each sees an fsync in flight and waits on it | 40 transactions queued, none acknowledged |
| 2.00 ms | fsync #1 returns; only T1's bytes were guaranteed by it (it was issued at LSN 160) | T1 acknowledged; T2…T40 still waiting |
| 2.00 ms | The leader of the waiting group (T2) issues fsync #2 covering ≤ 2,500 | fsync #2 in flight |
| 4.00 ms | fsync #2 returns; T2…T40 all acknowledged at once | 40 commits in 4 ms |
| 4.00 ms | The next 40 have queued during #2; fsync #3 covers all of them | steady state: 40 commits per 2 ms |

Without grouping, 40 transactions serialise into 40 fsyncs: 80 ms for the batch, 500 commits/s. With grouping, steady-state throughput is 40 × 500 = **20,000 commits/s** with 2–4 ms latency each. Throughput scales with concurrency; latency stays pinned to one or two fsyncs. The subtlety in the trace is the first row: a transaction that arrives after an fsync was *issued* is not covered by it, because the kernel only guarantees bytes written before the call; that is why implementations track the LSN each fsync covers rather than a boolean.

Every serious engine does a version of this:

- **Postgres** groups implicitly (a backend waiting for the WAL flush lock finds its LSN already flushed by whoever held the lock) and can be told to wait a little longer to grow the group: `commit_delay` in microseconds, applied only when at least `commit_siblings` (5) other transactions are active.
- **MySQL/InnoDB** has a three-stage binary log group commit (flush, sync, commit stages) so the redo log and the binlog are synced together in batches; `binlog_group_commit_sync_delay` is the equivalent wait.
- **Kafka** takes the idea to its limit: producers batch records (`linger.ms`), brokers append to a partition's log, and durability is defined by replication (`acks=all` with the in-sync replica set), not by fsync, which is left to the OS (`log.flush.interval.messages` defaults to the maximum long). Kafka's log *is* the database; there is no other structure to update.

The dial you are turning is *latency per commit* against *fsyncs per second*. Postgres's `synchronous_commit = off` moves the fsync off the commit path entirely: the client is acknowledged as soon as the record is in the WAL buffer, and a crash can lose up to about three times `wal_writer_delay` (200 ms) of *acknowledged* commits. That is a legitimate choice for a metrics table and an unacceptable one for a ledger; the point is that it is a per-transaction setting, not a database-wide one.

## Recovery traced: redo, page LSNs and undo

On restart after a crash, the engine has a log that is authoritative and a set of data pages in unknown states: some written after their log records, some not, some torn. Recovery repairs the pages from the log.

**Redo.** Scan the log forward from the last checkpoint. Every page stores the LSN of the last record applied to it (`pageLSN`). For each record: if `record.LSN > pageLSN`, the page is stale, apply the change and set `pageLSN = record.LSN`; otherwise the change is already there, skip. Trace it on three records and two pages, with the crash having flushed page 1 but not page 2:

| Record | Page on disk before | Compare | Action | Page after |
|---|---|---|---|---|
| LSN 1: page 1 ← `a1` | page 1: `pageLSN 3`, `a2` | 1 > 3? no | skip (already newer) | unchanged |
| LSN 2: page 2 ← `b1` | page 2: `pageLSN 0`, `b0` | 2 > 0? yes | apply | page 2: `pageLSN 2`, `b1` |
| LSN 3: page 1 ← `a2` | page 1: `pageLSN 3`, `a2` | 3 > 3? no | skip | unchanged |

One record applied, two skipped, and the pages end in the state the log describes. Now crash *during* recovery and start again from the same checkpoint: page 2 now carries `pageLSN 2`, so LSN 2 is skipped too, and the second pass applies nothing. That comparison is what makes redo **idempotent**, and idempotence is what lets recovery tolerate its own failures. The exercise at the end has you implement exactly this loop.

**Undo.** Transactions that had log records but no `COMMIT` record when the crash hit must be rolled back. In an undo/redo log (ARIES, InnoDB), their records carry the old values, so recovery walks them backwards and reverts, writing *compensation log records* so that a crash during undo does not undo twice. Postgres avoids undo entirely: its MVCC keeps old row versions in the heap, so an uncommitted transaction's rows are invisible because its transaction ID is never marked committed in `pg_xact`. That is one of the reasons Postgres needs `VACUUM` and InnoDB does not, and it is a good example of how one storage decision echoes through a whole engine ([MVCC and locking](/learn/databases/relational-fundamentals/mvcc-and-locking) has the visibility rules).

**Torn pages, again.** Redo assumes it can read the page's `pageLSN`. A torn page might have a corrupted header. Postgres handles this with **full-page writes**: the first time a page is modified after a checkpoint, the WAL record contains the *entire* 8 KiB page, not only the diff. Redo can then reconstruct the page from scratch without reading the damaged one. The cost is easy to compute: a workload of 1,000 small updates per second touching 500 distinct pages per second writes about 100 KB/s of records but, right after a checkpoint, about **4 MB/s of page images** (500 × 8 KiB) until every hot page has been logged once. That is why Postgres WAL volume spikes after each checkpoint, and why doubling the checkpoint interval often halves WAL traffic. InnoDB solves the same problem with a *doublewrite buffer*: pages are written to a scratch area, synced, then written to their real location, so a torn page always has an intact copy somewhere.

## Checkpoints: bounding recovery time

If redo scans the log from the beginning of time, recovery takes as long as the database has been alive. A **checkpoint** fixes that. Periodically the engine:

1. Writes a `CHECKPOINT BEGIN` record with the current LSN (the *redo point*).
2. Flushes every dirty page in the buffer pool to disk, spread over time to avoid an I/O storm: Postgres's `checkpoint_completion_target` (0.9 by default since PostgreSQL 14, 0.5 before) spreads it over 90% of the interval.
3. Writes `CHECKPOINT END` and records its LSN in the control file.

After a checkpoint, every change with an LSN below the redo point is on disk in its data page. Recovery starts redo from the last completed checkpoint and ignores the log before it. Log segments older than the checkpoint can be deleted or recycled (**log truncation**), unless something else still needs them: a replica that has not received them, a base backup that will need them for point-in-time recovery, or a logical replication slot. A forgotten replication slot pinning WAL is the classic way to fill a Postgres disk.

Postgres triggers a checkpoint every `checkpoint_timeout` (5 minutes) or when the WAL written since the last one reaches `max_wal_size` (1 GB); a write burst that hits the size trigger early produces the "checkpoints are occurring too frequently" log line, and each early checkpoint brings a fresh round of full-page writes.

| Checkpoint interval | Recovery time | Steady-state I/O | WAL volume (Postgres) |
|---|---|---|---|
| Short (1 min) | Seconds | Frequent dirty-page flushes, more page rewrites | High: full-page writes after every checkpoint |
| Long (30 min) | Minutes of redo | Fewer flushes, dirty pages coalesce | Low |

Longer intervals are cheaper in steady state and more expensive at the moment you least want expense, which is during an outage. Most teams run intervals of minutes and accept recovery in the tens of seconds; redo speed on a modern server is on the order of tens to a few hundred MB of WAL per second, so a gigabyte of WAL since the last checkpoint is roughly 5–30 s of recovery.

## The log as the replication stream

Once you have a durable, ordered, self-describing record of every change, you have solved a second problem for free: replication. A replica does not need to re-execute SQL; it needs to receive log records and apply them with the same redo logic as recovery. Postgres streaming replication ships WAL bytes over a TCP connection; the replica is permanently "recovering". Synchronous replication means the leader waits for a replica to fsync the record before acknowledging the commit, which adds a network round trip to every commit but means a single machine loss cannot lose acknowledged data.

```viz
{"type": "system", "scenario": "replication-leader-follower",
 "title": "The WAL stream is the replication stream",
 "caption": "Followers apply the leader's log records with the same redo path used for crash recovery; replication lag is how far behind the follower's applied LSN is."}
```

The same shape appears elsewhere under other names. Raft's replicated log (etcd, CockroachDB, TiKV) is a WAL whose ordering is agreed by consensus ([consensus and Raft](/learn/system-design/distributed-systems/consensus-raft)). MySQL's binlog is a logical WAL consumed by replicas and by change-data-capture tools like Debezium. Kafka is a distributed WAL with consumers instead of a buffer pool. When someone says "log-based", they mean this structure.

## Under the hood: where each system puts its log

| System | Log | Durability default | Detail that matters |
|---|---|---|---|
| **Postgres** | `pg_wal/`, 16 MiB segments, 8 KiB WAL pages | `fdatasync` on commit | Redo-only (MVCC is the undo); full-page writes after checkpoints; streaming and logical replication read the same stream |
| **MySQL InnoDB** | Redo log (`ib_logfile*` / `#innodb_redo`), undo logs in the tablespace, plus the binlog | `innodb_flush_log_at_trx_commit = 1` (fsync per commit); `2` writes without fsync and loses up to a second on power loss | Three-stage group commit keeps redo and binlog consistent; doublewrite buffer for torn pages |
| **SQLite** | Rollback journal (copies the *old* page before overwriting: an undo log; readers block writers) or `-wal` file (appends *new* pages; readers and one writer proceed) | `synchronous = FULL` by default in both modes; `NORMAL`, the usual choice with WAL, syncs only at checkpoints and can lose the last transactions on power loss but never corrupts | `wal_autocheckpoint` every 1,000 pages (~4 MB) copies WAL pages back into the main file |
| **RocksDB / LevelDB** | One WAL per memtable, 32 KiB blocks | `WriteOptions.sync = false` by default: the OS flushes; `sync = true` fsyncs per write | The WAL exists only to recover the memtable and is deleted after the flush ([LSM lesson](/learn/advanced-data-structures/log-structured-and-disk-structures/lsm-trees-and-sstables)) |
| **Kafka** | The partition segment files *are* the store | Replication (`acks=all`, `min.insync.replicas`); fsync left to the OS | Retention by time or size, not checkpoint; `flush.messages` can force fsync and almost nobody sets it |
| **etcd** | Raft log on disk plus a bbolt B-tree snapshot | fsync on every append | The `wal_fsync_duration_seconds` p99 alert at 10 ms is the most common etcd health signal, which is why etcd wants a dedicated fast disk |

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Commit throughput caps at a few hundred per second on a many-core box; CPU idle; `pg_stat_wal` or `iostat` shows one fsync per commit | Each commit is paying a full device fsync and nothing is grouping them (low concurrency, or a serial batch job committing row by row) | Batch rows into fewer transactions; enable or lengthen group commit (`commit_delay`); for non-ledger data, `synchronous_commit = off` per transaction |
| Disk fills with WAL although the database is not growing | An inactive replication slot (or a base backup left "in progress") pins segments so they are never recycled; `pg_replication_slots` shows `active = f` with an old `restart_lsn` | Drop the slot; set `max_slot_wal_keep_size` so a dead slot cannot take the primary down |
| Periodic latency spikes every few minutes, with a burst of write I/O | Checkpoint storms: dirty pages flushed in a burst, or `max_wal_size` reached early so checkpoints run back to back, each followed by a full-page-write surge | Raise `max_wal_size`, keep `checkpoint_completion_target` near 0.9, enable `wal_compression` |
| After a power loss the database will not start: "invalid page header" or checksum failures on data pages | Torn pages with full-page writes disabled, or a device that acknowledged writes it had not persisted | Keep `full_page_writes` on unless the filesystem guarantees atomic 8 KiB writes (ZFS); use drives with power-loss protection; restore from backup plus WAL |
| A retry loop around `fsync` "recovers" from an I/O error, and data is later found missing | Linux may mark the dirty pages clean after the first write-back error, so the retry succeeds vacuously | Treat any fsync failure as fatal: crash and recover from the log (Postgres's `data_sync_retry = off`) |
| Replica lag grows without bound during a bulk load | The replica applies WAL single-threaded (Postgres) and the primary generates it from many cores; full-page writes after checkpoints multiply the bytes to ship | Throttle the load, raise the checkpoint interval during it, or use logical batching; measure `replay_lag` |

## Interviewer follow-ups

**"The database said 'committed' and the machine lost power. What exactly guarantees the update is there?"** Model answer: the commit record was appended to the WAL and `fsync` returned before the acknowledgement; on restart, redo replays from the last checkpoint and reapplies any record whose LSN is above the page's LSN, including this one if the page was never flushed. Common wrong answer: "the page was written to disk before the commit returned", which is the thing WAL exists to avoid.

**"How would you make a single-disk system commit 20,000 transactions per second when the disk does 500 fsyncs per second?"** Model answer: group commit, so one fsync covers all transactions that arrived while the previous one was in flight; latency stays at one or two fsync times, throughput scales with concurrency. Common wrong answer: "more threads", which adds concurrency without changing the fsync count, or "turn off fsync", which changes the guarantee.

**"Why is redo safe to run twice?"** Model answer: every record is applied only if its LSN is greater than the page's stored LSN, so a second pass finds every page already at or beyond each record and does nothing; the first-post-checkpoint full-page image handles pages whose header cannot be trusted. Common wrong answer: "recovery takes a lock so it cannot crash", or "the log is truncated as it is applied".

**"What does a longer checkpoint interval buy and cost?"** Model answer: fewer full-page writes and coalesced dirty-page flushes (less I/O in steady state) against a longer redo on restart, in proportion to the WAL written since the checkpoint; and more WAL retained on disk. Common wrong answer: "longer intervals risk losing data", which confuses checkpoints (a performance mechanism) with durability (the fsynced log).

**"Why does Postgres not have an undo log?"** Model answer: MVCC keeps old row versions in place; an aborted transaction's rows are never marked committed, so there is nothing to revert, at the cost of `VACUUM` to reclaim dead versions. InnoDB keeps undo in the tablespace instead and purges it. Common wrong answer: "Postgres does not support rollback of crashed transactions".

## What mid-level engineers get wrong

- **Equating `write()` with durability.** The bytes are in the page cache; only `fsync`/`fdatasync` (and a device that honours flushes) makes them stable.
- **Committing row by row in a batch job**, paying one fsync per row and blaming the database for being slow.
- **Retrying `fsync`.** After the first failure the kernel may have dropped the data; the retry lies.
- **Treating checkpoints as a durability mechanism** and shortening them "to be safe", which raises I/O and WAL volume and buys nothing.
- **Forgetting the replication slot** after decommissioning a consumer, then paging at 3 a.m. for a full disk.
- **Calling Kafka "only a queue".** It is a replicated log whose durability comes from replication, and the record batch format is why exactly-once producers can exist.

## Exercises

The first exercise strips the log to its skeleton: an append-only list of `(lsn, key, value)` records, a durable-LSN watermark that `commit()` advances, a `crash()` that throws away everything above the watermark, and a `recover()` that rebuilds a key-value map by replaying committed records in order. The invariant you are implementing is: **state is a deterministic function of the committed prefix of the log.** The second is the redo loop with page LSNs.

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

```exercise
id: redo-with-page-lsn
title: Idempotent redo with page LSNs
prompt: |
  Implement `redo(pages, log, checkpoint_lsn)`.

  `pages` maps a page id to `[page_lsn, value]`: the page as found on disk
  after the crash. `log` is a list of `[lsn, page_id, value]` records in
  increasing LSN order. Redo starts at the checkpoint: ignore every record
  whose `lsn` is below `checkpoint_lsn`. For each remaining record, if its
  `lsn` is greater than the page's `page_lsn`, set the page's value and
  `page_lsn` to the record's; otherwise skip it. A record for a page that
  is not in `pages` creates it (treat the missing page as `[0, null]`).

  Return `[pages_after, applied]`, where `pages_after` is the map of page
  id to `[page_lsn, value]` and `applied` is how many records were applied.
languages: [python, javascript]
entry: redo
starter:
  python: |
    def redo(pages, log, checkpoint_lsn):
        # copy `pages` so the input is not mutated, then replay
        return [{}, 0]
  javascript: |
    function redo(pages, log, checkpoint_lsn) {
      // copy `pages` so the input is not mutated, then replay
      return [{}, 0];
    }
tests:
  - args: [{"p1": [0, "a0"], "p2": [0, "b0"]}, [[1, "p1", "a1"], [2, "p2", "b1"], [3, "p1", "a2"]], 0]
    expected: [{"p1": [3, "a2"], "p2": [2, "b1"]}, 3]
    label: nothing was flushed, everything is replayed
  - args: [{"p1": [3, "a2"], "p2": [0, "b0"]}, [[1, "p1", "a1"], [2, "p2", "b1"], [3, "p1", "a2"]], 0]
    expected: [{"p1": [3, "a2"], "p2": [2, "b1"]}, 1]
    label: the trace from the lesson, page 1 already flushed
  - args: [{"p1": [3, "a2"], "p2": [2, "b1"]}, [[1, "p1", "a1"], [2, "p2", "b1"], [3, "p1", "a2"]], 0]
    expected: [{"p1": [3, "a2"], "p2": [2, "b1"]}, 0]
    label: a second recovery pass applies nothing
  - args: [{"p1": [0, "a0"]}, [[5, "p1", "a5"], [7, "p3", "c7"]], 6]
    expected: [{"p1": [0, "a0"], "p3": [7, "c7"]}, 1]
    label: records before the checkpoint are ignored and a new page is created
  - args: [{}, [], 0]
    expected: [{}, 0]
    label: empty
  - args: [{"p1": [10, "x"]}, [[4, "p1", "old"], [10, "p1", "x"], [11, "p1", "y"]], 0]
    expected: [{"p1": [11, "y"]}, 1]
    hidden: true
    label: equal LSN is skipped, only the newer record applies
hints:
  - "Build a fresh dictionary/object from `pages` first; the tests compare the returned map, but mutating the argument is bad practice for a recovery routine."
  - "The condition is strictly greater: a record whose LSN equals the page LSN has already been applied."
```

## Senior signals

- You say "durable means the WAL record is fsynced, not that the page is written", and you can explain why the page can lag by minutes without risk.
- You can sketch a Postgres record (24-byte header with a CRC and the previous LSN, block references, data, an 8 KiB image after a checkpoint) and say what each field is for.
- You know that `fsync` throughput, not CPU, caps commit rate on a single log, and you reach for **group commit** before you reach for more cores; you can trace why a transaction arriving after an fsync was issued waits for the next one.
- You can name the torn-page problem and two different fixes (Postgres full-page writes, InnoDB doublewrite buffer), and compute the WAL surge after a checkpoint.
- You can trace redo with page LSNs and explain why a crash during recovery is harmless.
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
    In the group-commit trace, transaction T2 appends its records 50 µs after T1 issued an fsync. When is T2 acknowledged?
  options: ["Immediately, because the log buffer already holds its records", "When T1's fsync returns, since the device flushed everything in its cache", "When the next fsync, issued after T1's returns, completes", "Only after every one of the 40 queued transactions has been fsynced individually"]
  answer: 2
  explanation: >-
    An fsync guarantees only the bytes written before the call was made. T2's bytes arrived after T1's call, so they are covered by the following fsync, which the waiting group issues as soon as the first one returns. Grouping shares fsyncs; it never skips one, and it never fsyncs per transaction.
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
    Recovery is interrupted by a second crash halfway through redo. What makes it safe to start recovery again from the same checkpoint?
  options: ["Pages changed during recovery stay in memory until recovery finishes", "Undo runs before redo and reverts whatever the partial redo applied", "Recovery rewrites the log as it goes, so the second pass is shorter", "Redo skips every record whose LSN is not above the page's stored LSN"]
  answer: 3
  explanation: >-
    Each page carries the LSN of the last applied record. A record whose LSN is not greater than the page's is skipped, so re-running redo over already-repaired pages does nothing: redo is idempotent. That property is what lets recovery tolerate its own failures; nothing needs to be held back or reverted first.
```
