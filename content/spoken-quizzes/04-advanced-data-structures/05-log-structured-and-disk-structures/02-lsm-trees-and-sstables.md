---
lesson: lsm-trees-and-sstables
source: 9a70a5aa8396ac9c
---
## 1

A key was written once, months ago, and never touched since. An LSM store with leveled compaction, five levels, and a Bloom filter on each file serves a point read for it. Roughly how many SSTable data blocks are read from disk?

A, one per SSTable, since every file is checked from newest to oldest. B, zero, because the in-memory index and filters return the value. C, one, because the Bloom filters rule out the levels that lack the key. D, five, because each level must be read to find the newest copy.

[think]

The answer is C: one, because the Bloom filters rule out the levels that lack the key.

Each level contributes at most one candidate file, by key range. The filters of the levels that lack the key reject it without any I/O, apart from the occasional false positive, and the file that holds it needs one block read after an in-memory index lookup. The filters and index only locate the block; the value itself still costs that one read.

## 2

Why can leveled compaction only drop a tombstone once it reaches the bottom level?

A, only the bottom level has Bloom filters to record the deletion. B, tombstones keep files within a level from overlapping in key range. C, an older copy may still sit in a lower level, and would come back to life. D, dropping it earlier would break WAL replay after a crash.

[think]

The answer is C: an older copy may still sit in a lower level, and would come back to life.

Lower levels hold older data. If the tombstone vanished while an older copy remained below, a read would fall through to that copy, and the deleted value would reappear. At the bottom level nothing older exists, so the tombstone is safe to discard. Non-overlapping ranges come from how compaction splits files, not from tombstones.

## 3

In the lesson's timeline, moving one 64 megabyte file from level 1 into a full level 2 writes about 704 megabytes. Why so much?

A, Bloom filters and indexes for the whole level are regenerated on each merge. B, the file is rewritten once per level it has passed through, ten times so far. C, the file overlaps about ten level-2 files, and all of them are rewritten with it. D, level 2 must be rewritten entirely to keep its files non-overlapping.

[think]

The answer is C: the file overlaps about ten level-2 files, and all of them are rewritten with it.

With a fanout of 10 and evenly spread keys, one level-1 file spans the key range of about ten level-2 files. The merge reads all eleven, and writes eleven files' worth of sorted output: 11 times 64 megabytes. The rest of level 2 is untouched, and filters are per file, rebuilt only for the files written.

## 4

Your Cassandra table is used as a work queue: every row is inserted, read once, and deleted within minutes. Reads get slower every week. What is the most likely cause?

A, reads scan tombstones, which are kept until the GC grace period passes. B, the memtable is too small, so every read goes to many SSTables. C, leveled compaction is short of disk, so old runs pile up in level 0. D, Bloom filters degrade as rows churn, so false positives climb.

[think]

The answer is A: reads scan tombstones, kept until the GC grace period passes.

Each delete adds a tombstone that must be kept for the grace period, 10 days by default, so that repairs can spread it. A queue pattern produces far more tombstones than live rows, and every read scans through them. The remedy is a different data model, not a knob such as the memtable size.

## 5

You ingest a terabyte of data that is almost never overwritten, and you have 1.3 terabytes of disk. Which compaction strategy is the safer choice?

A, leveled, because it needs about 1.1 times the space, and tiered may need twice. B, size-tiered, because its runs never overlap, so no space is wasted. C, either, since data that is rarely overwritten needs no extra space. D, size-tiered, because its write amplification is the lower of the two.

[think]

The answer is A: leveled, since it needs about 1.1 times the space, and tiered may need twice.

Size-tiered compaction can need free space equal to the runs being merged, approaching twice the data set, which 1.3 terabytes cannot provide, even when nothing is overwritten. Leveled keeps the total near 1.1 times, at the cost of more write I/O, which is acceptable when data is rarely rewritten.

## 6

RocksDB write latency at the 99th percentile suddenly jumps from microseconds to tens of milliseconds, while the CPU is idle. What is the first metric to check?

A, the block cache hit ratio and the row cache size. B, memtable lookup time and the size of the skip list. C, Bloom filter bits per key and the false-positive rate. D, the number of level-0 files, and the pending compaction bytes.

[think]

The answer is D: the number of level-0 files, and the pending compaction bytes.

That pattern is a write stall: level 0 has reached its slowdown or stop trigger, 20 or 36 files, or the pending compaction bytes passed the soft limit, because compaction fell behind ingestion, and the engine throttles writers on purpose. Read-side metrics do not explain slow writes. The fixes are more compaction threads, a faster disk, or a strategy with less write amplification.
