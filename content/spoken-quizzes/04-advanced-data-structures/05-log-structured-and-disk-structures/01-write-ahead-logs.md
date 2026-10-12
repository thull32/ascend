---
lesson: write-ahead-logs
source: da825abac14c9b30
---
## 1

A database acknowledges a commit as soon as the WAL record is in the operating system's page cache, without calling fsync. What is the actual guarantee?

A, it survives a process crash, but not a power loss or a kernel panic. B, it survives everything, because the kernel flushes within seconds. C, it survives a power loss, but not a kernel panic, which clears the cache. D, it survives nothing, because unsynced log bytes are as good as no log.

[think]

The answer is A: it survives a process crash, but not a power loss or a kernel panic.

The page cache belongs to the kernel, so a crash of the database process leaves the bytes intact, and the kernel writes them out eventually. A power loss or a kernel panic discards the cache, and the periodic flush does not help if either happens first. This is exactly the trade Postgres offers when synchronous commit is turned off.

## 2

Your NVMe device completes an fsync in 50 microseconds, and 200 threads each commit one small transaction per millisecond. Without group commit, roughly what is the commit throughput ceiling of a single WAL?

A, about 200 thousand commits per second. B, unbounded, since NVMe parallelises fsyncs. C, about 20 thousand commits per second. D, about 1,000 commits per second.

[think]

The answer is C: about 20 thousand commits per second.

One fsync per commit, serialised on one log, gives one per 50 microseconds, which is 20 thousand per second, whatever the offered load. Group commit lets one fsync cover many transactions, and lifts the ceiling towards the offered load.

## 3

In the lesson's group-commit trace, transaction T2 appends its records 50 microseconds after T1 has issued an fsync. When is T2 acknowledged?

A, immediately, because the log buffer already holds its records. B, when T1's fsync returns, since the device flushed everything in its cache. C, when the next fsync, issued after T1's returns, completes. D, only after each of the 40 queued transactions has been fsynced individually.

[think]

The answer is C: when the next fsync, issued after T1's returns, completes.

An fsync guarantees only the bytes written before the call was made. T2's bytes arrived after T1's call, so they are covered by the following fsync, which the waiting group issues as soon as the first one returns. Grouping shares fsyncs; it never skips one, and it never syncs per transaction.

## 4

Why does Postgres write the entire 8 kilobyte page into the WAL the first time the page is modified after a checkpoint?

A, because MVCC needs the old row versions in the log for undo. B, so redo can rebuild a torn page without reading its damaged copy. C, so replicas can apply whole pages, and skip replaying small records. D, so every WAL segment holds a whole number of fixed-size pages.

[think]

The answer is B: so redo can rebuild a torn page without reading its damaged copy.

Redo normally reads the page's log sequence number to decide whether a record applies. A torn page may have a corrupt header, so the first record after a checkpoint carries the whole page, and redo rebuilds it from the log alone. Postgres keeps old row versions in the heap and needs no undo from the log, and InnoDB solves torn pages differently, with its doublewrite buffer.

## 5

You double the checkpoint interval on a busy Postgres server. Which combination of effects should you expect?

A, slower recovery, less WAL volume, and fewer dirty-page flushes. B, faster recovery, more WAL volume, and more dirty-page flushes. C, slower recovery, more WAL volume, and more dirty-page flushes. D, faster recovery, less WAL volume, and fewer dirty-page flushes.

[think]

The answer is A: slower recovery, less WAL volume, and fewer dirty-page flushes.

Recovery must redo from the last checkpoint, so a longer interval means more log to replay. In exchange, full-page writes happen half as often, and dirty pages absorb more changes before they are flushed, so both the WAL volume and the background I/O drop.

## 6

Recovery is interrupted by a second crash, halfway through redo. What makes it safe to start recovery again from the same checkpoint?

A, pages changed during recovery stay in memory until recovery finishes. B, undo runs before redo, and reverts whatever the partial redo applied. C, recovery rewrites the log as it goes, so the second pass is shorter. D, redo skips every record whose sequence number is not above the page's stored one.

[think]

The answer is D: redo skips every record whose sequence number is not above the page's.

Each page carries the sequence number of the last record applied to it, and a record that is not newer than that is skipped. So running redo again over pages already repaired does nothing: redo is idempotent. That property is what lets recovery survive its own failures; nothing needs to be held back or reverted first.
