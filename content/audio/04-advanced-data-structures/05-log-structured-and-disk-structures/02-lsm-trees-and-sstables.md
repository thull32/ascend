---
lesson: lsm-trees-and-sstables
source: 66ffbbffcdeed382
fit: partial
desk:
  - "The SSTable layout diagram, and inside a data block: prefix compression, restart points, the footer and the MANIFEST"
  - "Cassandra's SSTable files and the Lucene parallel"
  - "The flush-and-compaction timeline in megabytes, and the write-amplification arithmetic"
  - "The size-tiered against leveled comparison table, the RocksDB stall triggers, and the failure-modes table"
  - "Exercises: a toy LSM store with flush and compaction; locate the data block with a sparse index"
---
## Introduction

You are ingesting 200 thousand events a second into a key-value store on an SSD. With a B-tree, each insert lands on a random leaf page: read the page, change 100 bytes, eventually write back 8 kilobytes. On an SSD, random 8 kilobyte writes are the expensive operation, and at some point the disk is saturated rewriting pages that changed by 1 percent.

The log-structured merge tree, the LSM tree, starts from an observation. The write-ahead log already absorbed those writes sequentially. What if the log were the database, and you kept it queryable by sorting it in chunks and merging the chunks in the background? That is the whole design, and it runs RocksDB, LevelDB, Cassandra, ScyllaDB, HBase and Bigtable.

Three ideas: the write path that makes every disk write sequential, the read path and what keeps it from checking every file, and compaction, the bill you pay later, in two very different shapes.

## The write path

An LSM tree has one mutable structure in memory, and many immutable files on disk.

Every write goes to the memtable, an in-memory sorted structure, usually a skip list, and at the same time to a write-ahead log for durability. A put inserts or overwrites. A delete inserts a tombstone, a marker that says "this key is deleted as of now", because nothing on disk is ever modified in place, so a delete has to be a new write.

When the memtable reaches its limit, 64 megabytes by default in RocksDB, it is frozen, a fresh one takes new writes, and a background thread writes the frozen one to disk as a sorted string table, an SSTable. That is a file of key-value pairs in sorted order, written front to back and never modified again. Once it is durable, that memtable's log is deleted.

That is the invariant. The disk only ever sees whole files written sequentially. No page is ever updated in place.

An SSTable is more than a sorted list. Its data is in blocks of about 4 kilobytes. At the end sit a Bloom filter, about ten bits per key, and a sparse index: one entry per block, the block's last key, not one per key. For a 64 megabyte file that is about 16 thousand entries, small enough to keep in memory. So a lookup in one file binary-searches the index in memory, reads one block, and scans it.

## The read path

A read cannot know which file holds the newest version of a key, so it checks from newest to oldest. The active memtable. Any frozen memtables. Every file in level zero, because level-zero files overlap each other. Then one file per level below, found by binary search over that level's non-overlapping key ranges. It stops at the first hit, and a tombstone counts as a hit whose answer is "absent".

If there were 30 files and you read them all, that is read amplification: storage reads per logical read. Three things keep it bounded. Bloom filters skip files that definitely lack the key. Key ranges skip files whose range excludes it, which only works if ranges do not overlap. And compaction keeps the number of runs small.

The smallest example. A key that lives in level three, with two level-zero files and levels one to three populated. The memtable misses. The two level-zero filters, the level-one filter and the level-two filter each say no, each with a 1 percent chance of a wasted read. The level-three filter says maybe, the index points at a block, and that block is one disk read. Expected disk reads: about 1.04, roughly one NVMe read, around 100 microseconds. For an absent key, about 0.05 reads.

Range scans are the weakness. A scan has to merge the matching slice of every run, and Bloom filters cannot help, because you are not asking about a specific key. That is why LSM engines are weaker at wide range scans than B-trees, and why Cassandra's data model pushes you to make a query hit one partition.

## Tombstones

Two things about deletes catch people out.

First, deletes do not free space. Delete 10 gigabytes and the store gets bigger for a while, because tombstones are new writes and the old values stay in older files until compaction reaches them.

Second, a tombstone must outlive every older copy of its key. Before I say why, imagine compaction dropped a tombstone early. What would a read see?

[pause]

The old value, resurrected. The read falls through the place the tombstone used to be, and finds the older copy below it. So leveled compaction can only drop a tombstone at the bottom level, where nothing older exists. Cassandra keeps tombstones for 10 days by default, so that a replica that was down during the delete can still receive it through repair. And it warns when one read scans a thousand tombstones, and aborts it at a hundred thousand.

The famous pathology is a queue on Cassandra: every row inserted, read once, deleted. Reads scan thousands of tombstones per live row, latency climbs week after week, and the fix is a different data model, not a tuning knob.

## Compaction, two ways

Compaction merges runs into fewer runs, discards overwritten versions and expired tombstones, and rewrites everything sequentially. It is a background merge, and it costs CPU, disk bandwidth and temporary disk space. The two mainstream strategies make opposite trades.

Size-tiered compaction groups runs of similar size, and when there are four of them, merges them into one run about four times bigger. Write amplification is low: each byte is rewritten once per tier, about 7 times over its life for a terabyte of data. But space amplification is high. Runs in different tiers overlap, so a key can have stale copies in every tier, and merging four 100 gigabyte runs needs 400 gigabytes free while the output is written. Plan for twice your data size in disk. Cassandra uses this by default.

Leveled compaction organises files into levels, each ten times bigger than the one above, and within a level, files never overlap. When a level is over budget, take one file, find the roughly ten files below it that overlap its key range, merge them, and write the result one level down. Reads touch at most one file per level. Space stays around 1.1 times the live data, because the bottom level holds about 90 percent of it. But write amplification is high. Moving one 64 megabyte file into a full level rewrites it together with the ten files it overlaps: 11 times 64, about 704 megabytes written. A byte that ends up four levels down has been written about 36 times, plus once in the log. Real numbers are usually lower, because many values are overwritten before they descend. RocksDB uses leveled by default.

So: leveled is low read and low space, high write. Tiered is the reverse. And write amplification is an SSD endurance number more than a throughput number. Thirty times amplification at 50 megabytes a second ingested is 1.5 gigabytes a second written, which on a 2 terabyte drive rated for one full drive-write a day is over 60 drive-writes a day.

## Write stalls

Compaction is asynchronous, but not optional. If writes arrive faster than compaction can merge them, level-zero files pile up, and every read has to check all of them. So the engine pushes back. RocksDB slows writes to 16 megabytes a second when level zero reaches 20 files, or pending compaction passes 64 gigabytes. It stops writes entirely at 36 files, or 256 gigabytes.

From the application, this is a 99th-percentile latency cliff, from microseconds to tens of milliseconds, with the CPU idle and no obvious cause. The senior diagnosis is to look at the compaction backlog, level-zero file count and pending compaction bytes, before touching application code. The fixes: more compaction threads, larger memtables, a faster disk, or a strategy with less write amplification. And not turning compaction off, which trades a background cost for an unbounded read cost.

## In the interview

A follow-up the lesson expects. The service does a bulk import of 500 gigabytes. How do you avoid a week of write stalls?

[pause]

Sort the data, write SSTables directly with RocksDB's file writer, and ingest them straight into the bottom level, bypassing the memtable, the log and level zero. Or raise the stall triggers and compaction parallelism for the duration. The wrong answer is "disable compaction during the import", which turns level zero into hundreds of overlapping files that every read must check.

And the opener: how does an LSM store make a random write sequential? The write goes to a log, which is an append, and to a memtable in memory. The memtable is later written as one sorted file, front to back, and compaction rewrites data in large sequential merges. "It sorts the writes" is only the memtable half.

## Recap

Four things to remember. Sequential writes now, merging later: memtable, sorted immutable files, and no page ever updated in place. A point read checks newest to oldest, and Bloom filters and non-overlapping ranges make it about one disk read, but they do nothing for range scans. Deletes are writes: tombstones grow the store and must outlive every older copy, so never model a queue as a delete-heavy table. And compaction is the bill: leveled trades write amplification for low read and space cost, tiered the reverse, and when writes stall, look at the compaction backlog first.

At your desk: the SSTable and data-block layouts, the flush-and-compaction timeline in megabytes, the strategy comparison and stall triggers, the failure modes, and two exercises, a toy LSM store and a sparse-index lookup.
