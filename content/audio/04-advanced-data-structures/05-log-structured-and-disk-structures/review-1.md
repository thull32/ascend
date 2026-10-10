---
review: log-structured-and-disk-structures
source: ab92ef4445a5c65d
---
## Introduction

Twelve questions from the log-structured-and-disk-structures module. Answer out loud before the answer comes.

They run through the module in order: write-ahead logs, LSM trees and SSTables, B-trees against LSM trees, and Merkle trees and ring buffers. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A database acknowledges a commit as soon as the log record is in the operating system's page cache, without calling fsync. What is the actual guarantee?

A, it survives a process crash, but not a power loss or a kernel panic. B, it survives everything, because the kernel flushes within seconds. C, it survives a power loss, but not a kernel panic, which clears the cache. D, it survives nothing, because unsynced log bytes are as good as no log.

[think]

The answer is A: it survives a process crash, but not a power loss or a kernel panic.

The page cache belongs to the kernel, so if only the database process crashes, the bytes are intact and the kernel will eventually write them. A power loss or a kernel panic discards the cache, and the kernel's periodic flush does not help if either happens first. This is exactly the trade Postgres offers when synchronous commit is turned off.

## Question 2

In a group commit, transaction two appends its log records 50 microseconds after transaction one issued an fsync. When is transaction two acknowledged?

A, immediately, because the log buffer already holds its records. B, when transaction one's fsync returns, since the device flushed everything in its cache. C, when the next fsync, issued after transaction one's returns, completes. D, only after every one of the 40 queued transactions has been fsynced individually.

[think]

The answer is C: when the next fsync, issued after the first one returns, completes.

An fsync guarantees only the bytes written before the call was made. Transaction two's bytes arrived after that call, so they are covered by the following fsync, which the waiting group issues as soon as the first one returns. Grouping shares fsyncs; it never skips one, and it never fsyncs per transaction.

## Question 3

Recovery is interrupted by a second crash halfway through redo. What makes it safe to start recovery again from the same checkpoint?

A, pages changed during recovery stay in memory until recovery finishes. B, undo runs before redo and reverts whatever the partial redo applied. C, recovery rewrites the log as it goes, so the second pass is shorter. D, redo skips every record whose log sequence number is not above the page's stored one.

[think]

The answer is D: redo skips every record whose log sequence number is not above the page's stored one.

Each page carries the sequence number of the last record applied to it. A record that is not newer than the page is skipped, so re-running redo over pages that were already repaired does nothing. Redo is idempotent, and that is what lets recovery survive its own failures; nothing needs to be held back or reverted first.

## Question 4

Why can leveled compaction only drop a tombstone when it reaches the bottom level?

A, only the bottom level has Bloom filters to record the deletion. B, tombstones keep the files within a level from overlapping in key range. C, an older copy may still sit in a lower level, and would resurrect. D, dropping it earlier would break log replay after a crash.

[think]

The answer is C: an older copy may still sit in a lower level, and would resurrect.

Lower levels hold older data. If the tombstone vanished while an older copy remained below it, a read would fall through to that copy and the deleted value would reappear. At the bottom level nothing older exists, so the tombstone is safe to discard. Non-overlapping ranges come from how compaction splits files, not from tombstones.

## Question 5

Your Cassandra table is used as a work queue: every row is inserted, read once, and deleted within minutes. Reads get slower every week. What is the most likely cause?

A, reads scan tombstones that are kept until the grace period passes. B, the memtable is too small, so every read goes to many SSTables. C, leveled compaction is short of disk, so old runs pile up in level zero. D, Bloom filters degrade as rows churn, so false positives climb.

[think]

The answer is A: reads scan tombstones that are kept until the grace period passes.

Each delete adds a tombstone that must be kept for the grace period, 10 days by default, so that repairs can propagate it. A queue pattern produces far more tombstones than live rows, and every read scans through them. The remedy is a different data model, not a knob such as memtable size.

## Question 6

RocksDB write latency suddenly jumps from microseconds to tens of milliseconds at the 99th percentile, while the CPU is idle. What is the first metric to check?

A, the block cache hit ratio and the row cache size. B, memtable lookup time and the size of the skip list. C, Bloom filter bits per key and the false-positive rate. D, the number of level-zero files and the pending compaction bytes.

[think]

The answer is D: the number of level-zero files and the pending compaction bytes.

That pattern is a write stall. Level zero has reached the slowdown or stop trigger, 20 or 36 files, or pending compaction has passed its soft limit, because compaction fell behind ingestion, and the engine is throttling writers on purpose. Read-side metrics like Bloom filters or the cache hit ratio do not explain slow writes. The fixes are more compaction threads, a faster disk, or a strategy with less write amplification.

## Question 7

A workload updates the same 5 gigabytes of rows over and over, on a server with a 32 gigabyte buffer pool. Which engine's write amplification does this locality reduce?

A, the LSM tree's, because hot keys stay in the memtable and never flush. B, neither, because amplification depends only on row and page sizes. C, the B-tree's, because each page absorbs many updates before one flush. D, both equally, because fewer distinct bytes change in either engine.

[think]

The answer is C: the B-tree's, because each page absorbs many updates before one flush.

A B-tree page updated many times between checkpoints is written once, so its amplification falls toward one. An LSM tree flushes every memtable, and compaction rewrites whatever descends however hot the key is, so locality does not change its arithmetic. That asymmetry is why you measure the write distribution before choosing.

## Question 8

Which workload is the strongest fit for a size-tiered LSM store rather than a B-tree?

A, event ingestion of 300 thousand immutable rows a second, read by key within the hour. B, a config table of 10 thousand rows, updated a few times a day by operators. C, a bank ledger with strict transactions and indexes on account and date. D, a product catalogue read a thousand times per write, with range queries by price.

[think]

The answer is A: event ingestion of 300 thousand immutable rows a second, read by key within the hour.

Write-dominated, append-only data read by key is exactly what the LSM write path is built for, and size-tiered compaction keeps write amplification lowest. The catalogue and the ledger want a B-tree for range scans, transactions and indexes, and the tiny config table does not care.

## Question 9

A point lookup for a key that does not exist goes to a leveled LSM store with per-file Bloom filters at 1 percent false positives, and six candidate files. Roughly how many disk reads does it cost on average?

A, six, one per candidate file. B, zero, since filters never err on absent keys. C, about 0.06, from false positives. D, one, to confirm the key is absent.

[think]

The answer is C: about 0.06, from false positives.

Each filter answers "definitely absent" with no I/O, except on a false positive, which happens 1 percent of the time per file. Six files at 1 percent each is about 0.06 expected block reads. Zero is wrong because false positives happen precisely on absent keys; what a Bloom filter never gives is a false negative.

## Question 10

A Merkle tree hashes leaves and internal nodes with the same function, and no prefix byte. What does that allow?

A, a two-leaf tree whose leaves are the child hashes gives the same root as the original. B, the root changes whenever leaves are reordered, so proofs cannot be verified. C, proofs become twice as long, because the verifier cannot tell the levels apart. D, odd levels can no longer be paired, so the tree must have a power-of-two size.

[think]

The answer is A: a two-leaf tree whose leaves are the child hashes gives the same root as the original.

Without domain separation, presenting two sibling hashes joined together as a leaf reproduces their parent's hash, so a different data set has the same root and a forged inclusion proof verifies. Certificate Transparency prefixes leaves with a zero byte and nodes with a one byte to close it. Order sensitivity is a feature, proof length is unchanged, and odd levels are handled by a pairing rule either way.

## Question 11

A single-producer, single-consumer ring buffer stores the item into its slot, then advances the tail with a plain, relaxed store. What can go wrong on a weakly ordered CPU?

A, the consumer can read a torn tail value that is half updated. B, nothing, because each index has exactly one writer and needs no compare-and-swap. C, the consumer can see the new tail before the item, and read garbage. D, the producer can overwrite a slot the consumer has not read yet.

[think]

The answer is C: the consumer can see the new tail before the item, and read garbage.

Ownership removes the need for compare-and-swap, but not the need for ordering. Without a release store on the tail and an acquire load in the consumer, the two writes can become visible out of order. Overwriting is prevented by the fullness check, and even a relaxed atomic store is never torn.

## Question 12

Your single-producer, single-consumer queue moves 5 million items a second in a benchmark, but only 1.5 million when the producer and consumer run on different cores. What is the most likely cause?

A, the modulo on every index costs a slow division. B, the buffer is too small, so the producer keeps finding it full. C, the consumer needs a mutex to read the tail safely across cores. D, the head and tail share a cache line that bounces between the cores.

[think]

The answer is D: the head and tail share a cache line that bounces between the cores.

Fast on one core and slow across two is the signature of false sharing. Padding the head and tail onto separate 64-byte lines is the fix. The modulo, a mutex, or the capacity would not produce a slowdown that appears only when the cores are separated.

## Recap

Three ideas kept coming back. Append, then repair: a log made durable by fsync is the source of truth, group commit shares that fsync, and comparing sequence numbers makes replay idempotent. Immutability has a bill: LSM stores defer work to compaction, tombstones must outlive older copies, and locality helps the B-tree but not the LSM tree. And correctness lives in small rules: separate leaf and node hashing, single ownership of each ring index, release and acquire ordering, and indices on separate cache lines.
