---
lesson: write-ahead-logs
source: 8fd93cc2a4eac0f8
fit: great
desk:
  - "The record layouts byte by byte: Postgres, RocksDB and LevelDB, and Kafka's record batch"
  - "The fsync latency table by device, and the group-commit trace at 2 milliseconds per fsync"
  - "The redo trace with page LSNs, and the full-page-write arithmetic"
  - "The per-system table (Postgres, InnoDB, SQLite, RocksDB, Kafka, etcd) and the failure-modes table"
  - "Exercises: a write-ahead log with commit, crash and recovery; idempotent redo with page LSNs"
---
## Introduction

A client sends an update that takes 100 from account 7. The database replies "committed", and the power goes out 3 milliseconds later. When the machine comes back, that update must be there. That is the durability in ACID, and it is harder than it sounds.

The row lives in the middle of an 8 kilobyte page on disk, and there is no way to overwrite 8 kilobytes atomically. A crash mid-write leaves a torn page: the first 4 kilobytes new, the last 4 old, the checksum wrong, and the B-tree that page belongs to possibly corrupted.

You cannot make random page writes atomic. What you can do is stop relying on them. That is the write-ahead log, the WAL, and it is inside Postgres, MySQL, SQLite, RocksDB, etcd and Kafka. Three ideas: the one rule and why it fixes torn pages, what fsync costs and how group commit beats that cost, and how recovery replays the log safely, even if it crashes itself.

## The rule

The rule is one sentence. Before you modify a data page, append a record describing the change to a log, and make that record durable.

A log record says which page changed and what changed, and it carries a log sequence number, an LSN: a position in the log that only ever increases, and doubles as a global clock for which change happened before which.

The commit path follows. Append the transaction's records to the log buffer. Append a commit record. Write the buffer to the log file and call fsync. Only then reply "committed". And then update the page in memory, and do not write it to disk yet. The page can go to disk whenever the database likes, seconds or minutes later, in whatever order suits it. The page on disk is stale, and that is fine, because the log has everything needed to rebuild it.

Why does that fix torn pages? Because the log is append-only. A crash in the middle of a log write tears the last record, not a page in the middle of a tree. On restart the database scans the log, finds the last record whose checksum is valid, and ignores everything after it. An append-only file has exactly one place that can be torn, and it is the end.

Every engine's record format has the same skeleton: a length, a checksum, a monotonically increasing position, and a way to recognise where a record ends, so the tail can be trusted or thrown away.

## What fsync actually promises

Writing to a file does not put bytes on disk. It copies them into the kernel's page cache and returns. The data reaches the device when the kernel gets round to it, within about 30 seconds by default, or when you call fsync, which blocks until the device reports the data stable.

Two caveats a senior engineer knows. The device may lie: many disks acknowledge a write once it is in a volatile cache, and without power-loss protection, "stable" means "in memory with no capacitor". And fsync errors are not retryable. On Linux, after one failed fsync the dirty pages may be marked clean anyway, so a second fsync can succeed while the data is gone. Postgres learned this in 2018 and now crashes and recovers on any fsync failure. If your code retries fsync, it is wrong.

Then the cost, which is what makes this a design problem. Roughly: a spinning disk takes 5 to 10 milliseconds per fsync. A SATA SSD, half a millisecond to 2. An NVMe drive with power-loss protection, 20 to 100 microseconds. A cloud network volume, 1 to 5 milliseconds, with high variance.

A transaction that must fsync before acknowledging cannot commit faster than the device can fsync. On a cloud volume with 2 millisecond fsyncs, a database that fsyncs once per commit is capped at about 500 commits a second per log, no matter how many cores it has. CPU idle, throughput flat.

## Group commit

The fix comes from noticing that one fsync makes durable everything written to the log before it, not just one transaction's records. If 40 transactions reach the fsync step within the same millisecond, one fsync can serve all 40.

Picture it on that 2 millisecond device, with 40 clients committing continuously. Transaction one appends and issues an fsync. While it is in flight, the other 39 append their records, see an fsync in flight, and wait. Here is the subtle part. When that first fsync returns, before I say it: are the 39 waiters durable?

[pause]

No. An fsync only guarantees bytes written before the call was made, and theirs arrived after. So one of the waiters leads and issues a second fsync covering all of them, and when it returns, all 39 are acknowledged together. That is why implementations track the log position each fsync covers, rather than a yes-or-no flag.

In steady state, 40 commits share every 2 millisecond fsync. That is 40 times 500, 20 thousand commits a second, with each commit waiting one or two fsyncs. Throughput scales with concurrency; latency stays pinned. Postgres does this implicitly and can wait slightly longer to grow the group; MySQL has a three-stage group commit that syncs the redo log and the binary log together.

The other dial is Postgres's synchronous commit setting. Turn it off for a transaction and the client is acknowledged as soon as the record is in the log buffer; a crash can lose up to about three times the WAL writer delay, around 600 milliseconds, of acknowledged commits. Legitimate for a metrics table, unacceptable for a ledger, and it is per transaction, not database-wide. Kafka goes furthest: durability comes from replication to in-sync replicas, and fsync is left to the operating system.

## Recovery, and why it is idempotent

After a crash, the log is authoritative and the data pages are in unknown states: some written after their log records, some not, some torn.

Redo scans the log forward from the last checkpoint. Every page stores the LSN of the last record applied to it. For each record: if the record's LSN is greater than the page's, the page is stale, so apply the change and stamp the page with the new LSN. Otherwise the change is already there, so skip it.

The smallest example. Three records: LSN 1 writes page one, LSN 2 writes page two, LSN 3 writes page one again. Before the crash, page one was flushed, so it carries LSN 3. Page two was not, so it carries LSN 0. Replay. LSN 1 against page one: 1 is not greater than 3, skip. LSN 2 against page two: 2 is greater than 0, apply, and stamp page two with 2. LSN 3 against page one: not greater than 3, skip. One record applied, two skipped.

Now crash during recovery and start over from the same checkpoint. Page two now carries LSN 2, so this time everything is skipped. That comparison makes redo idempotent, and idempotence is what lets recovery survive its own failures.

Undo is for transactions that had records but no commit record. InnoDB and the classic ARIES design keep old values in the log and walk them backwards. Postgres has no undo at all: its multi-version rows keep old versions in the table, and an uncommitted transaction's rows are simply never marked committed. That is one reason Postgres needs VACUUM and InnoDB does not.

And torn pages, again. Redo has to read a page's LSN, and a torn page may have a corrupt header. So Postgres writes the whole 8 kilobyte page into the log the first time a page changes after a checkpoint, and redo rebuilds it from the log alone. The cost is easy to compute: 1,000 small updates a second touching 500 distinct pages writes about 100 kilobytes a second of records, but right after a checkpoint, about 4 megabytes a second of page images. InnoDB solves the same problem differently, with a doublewrite buffer: write the page to a scratch area, sync, then write it to its real place.

## Checkpoints and the log as replication

If redo started at the beginning of time, recovery would take as long as the database has been alive. A checkpoint bounds it. Note the current log position, flush every dirty page, spread over time to avoid an I/O storm, and record that the checkpoint completed. After that, recovery starts from the checkpoint, and older log segments can be recycled.

Unless something still needs them: a replica that has not received them, a backup, or a replication slot. A forgotten Postgres replication slot pinning the log is the classic way to fill a disk at 3 in the morning.

The checkpoint interval is a trade. Longer intervals mean fewer full-page writes and fewer dirty-page flushes, so less I/O in steady state, but more log to replay after a crash, at exactly the moment you least want delay. Redo runs at tens to a few hundred megabytes of log a second, so a gigabyte since the last checkpoint is roughly 5 to 30 seconds of recovery. Most teams run intervals of minutes.

And once you have a durable, ordered record of every change, you have replication for free. A Postgres replica receives log bytes and applies them with the same redo logic as recovery; it is permanently recovering. Raft's replicated log in etcd and CockroachDB is a WAL whose order is agreed by consensus. MySQL's binary log feeds replicas and change-data-capture tools. Kafka is a distributed WAL with consumers instead of a buffer pool. When someone says "log-based", this is the structure they mean.

## In the interview

A follow-up the lesson expects. How would you make a single-disk system commit 20 thousand transactions a second when the disk does 500 fsyncs a second?

[pause]

Group commit. One fsync covers every transaction that arrived while the previous one was in flight, so latency stays at one or two fsyncs and throughput scales with concurrency. "More threads" adds concurrency without changing the fsync count, and "turn off fsync" changes the guarantee.

And a trap question: what does a longer checkpoint interval risk? Not data. Checkpoints are a performance mechanism; durability comes from the fsynced log. The honest answer is less steady-state I/O and less log volume, against a longer redo on restart and more log kept on disk.

## Recap

Four things to remember. Durable means the log record is fsynced, not that the page is written; the page can lag by minutes. On a single log, fsync rate, not CPU, caps commits, and group commit shares each fsync across everyone waiting. Redo applies a record only if its LSN beats the page's, which makes recovery idempotent, and full-page writes or a doublewrite buffer handle torn pages. And checkpoints trade steady-state I/O against recovery time, while the same log doubles as the replication stream.

At your desk: the byte layouts of real log records, the fsync and group-commit tables, the redo trace and full-page arithmetic, the per-system and failure tables, and two exercises, a log with crash and recovery, and idempotent redo with page LSNs.
