---
slug: lsm-trees-and-sstables
title: "LSM trees and SSTables: turning random writes into sequential ones"
description: How a memtable, sorted immutable files, tombstones and background compaction make RocksDB and Cassandra absorb write-heavy workloads, and what read amplification and write stalls cost you.
minutes: 27
difficulty: hard
tags: [lsm-tree, sstable, compaction, memtable, rocksdb, cassandra, bloom-filter]
---
You are ingesting 200,000 events per second into a key-value store on an SSD. With a B-tree, each insert lands on a random leaf page: read the page, modify 100 bytes, eventually write back 8 KB. Even with a large buffer pool, the write-back traffic is dominated by page rewrites, and on an SSD random 8 KB writes are the expensive operation. At some point the disk is saturated rewriting pages that changed by 1%.

The log-structured merge tree (LSM tree) starts from the observation that the [write-ahead log](/learn/advanced-data-structures/log-structured-and-disk-structures/write-ahead-logs) already absorbed those writes sequentially. What if the log *were* the database, and you kept it queryable by sorting it in chunks and merging the chunks in the background? That is the whole design, and it is what RocksDB, LevelDB, Cassandra, ScyllaDB, HBase and Bigtable run on.

## The write path

An LSM tree has two kinds of storage: one mutable, in memory; many immutable, on disk.

**Memtable.** Every write goes to an in-memory sorted structure, the memtable, and simultaneously to a WAL for durability. The memtable must support ordered iteration (for flushing and range scans) and fast insert, so it is a skip list (LevelDB, RocksDB's default) or a balanced tree (a red-black tree in some engines). `put(k, v)` inserts or overwrites; `delete(k)` inserts a **tombstone**, a marker meaning "k is deleted as of now". Nothing is ever modified in place on disk, so deletion must be expressed as a new write.

**Flush.** When the memtable reaches its size limit (RocksDB `write_buffer_size`, 64 MB by default), it is frozen, a fresh memtable takes new writes, and a background thread writes the frozen one to disk as a **sorted string table (SSTable)**: a file of key-value pairs in sorted key order, written sequentially, never modified afterwards. Once the SSTable is durable, the frozen memtable's WAL is deleted.

An SSTable is more than a sorted list:

```text
┌───────────────────────────────────────────────┐
│ data block 0  (keys a…c, ~4 KB, compressed)   │
│ data block 1  (keys d…f)                      │
│ …                                             │
│ data block N                                  │
├───────────────────────────────────────────────┤
│ bloom filter  (~10 bits per key)              │
│ index block   (first key of each data block)  │
│ footer        (offsets of index and filter)   │
└───────────────────────────────────────────────┘
```

The **index block** is sparse: one entry per data block, not per key. To find key `e`, binary-search the index for the last block whose first key is ≤ `e` (block 1), read that one block, scan it. The whole index for a 64 MB file with 4 KB blocks is 16,000 entries and fits comfortably in memory; you pay one disk read per lookup per file. The **bloom filter** answers "is this key definitely absent from this file?" with no disk read at all; it is what makes the read path survivable, and the [bloom filters lesson](/learn/advanced-data-structures/probabilistic-structures/bloom-filters) covers its maths.

```viz
{"type": "system", "scenario": "lsm-tree",
 "title": "Writes go to the memtable; flushes create sorted runs; compaction merges them",
 "caption": "Every write is sequential: memtable in memory, then an SSTable written front to back. Reads check the memtable and then each run from newest to oldest."}
```

## The read path and read amplification

A `get(k)` cannot know which file holds the latest version of `k`, so it checks in order from newest to oldest:

1. The active memtable.
2. Any frozen memtables waiting to be flushed.
3. Each on-disk run, newest first, stopping at the first hit. A tombstone counts as a hit whose answer is "absent".

If `k` was written recently, the memtable answers in nanoseconds. If `k` was written a week ago and there are 30 SSTables, a naïve read touches 30 files. That is **read amplification**: the number of storage reads per logical read. Three things keep it bounded:

- **Bloom filters** skip files that definitely lack the key. With a 1% false-positive filter per file, 30 files cost about 0.3 wasted block reads on average for a missing key, not 30.
```viz
{"type": "system", "scenario": "bloom-filter",
 "title": "One bloom filter per SSTable turns most misses into zero disk reads",
 "caption": "A lookup asks each file's filter first; 'definitely absent' skips the file, 'maybe present' costs one index lookup and one block read, which is wasted only on a false positive."}
```

- **Fence keys / key ranges.** Each file records its min and max key; a lookup skips files whose range excludes `k`. This only helps if ranges do not overlap, which is what compaction arranges.
- **Compaction.** Fewer, larger, non-overlapping runs mean fewer places to look.

Range scans are worse: a scan over `[k1, k2)` must merge the matching slice of *every* run (a k-way merge over iterators), and bloom filters do not help because you are not asking about a specific key. This is why LSM engines are weaker at wide range scans than B-trees, and why Cassandra's data model pushes you to design partitions so that a query hits one partition rather than scanning.

## Tombstones and the cost of deleting

A delete writes a tombstone to the memtable; the old values stay in older files until compaction removes them. Two consequences catch people out.

First, **deletes are not free space**. Deleting 10 GB of data from an LSM store makes it temporarily *larger*, and space is reclaimed only when compaction reaches the files holding the old values.

Second, **tombstones must outlive every older copy**. If compaction dropped a tombstone while an older file still held the value, the value would resurrect. Leveled compaction can drop a tombstone only when it reaches the last level (nothing older exists). Cassandra keeps tombstones for `gc_grace_seconds` (default 10 days) so that a replica that was down when the delete happened can still receive the tombstone through repair; drop it earlier and a lagging replica re-introduces the deleted row. The infamous Cassandra pathology is a queue-like table where every row is written once and deleted: reads scan thousands of tombstones per live row, latency climbs, and the fix is a different data model, not a tuning knob.

## Compaction: the background cost of the fast write path

Without compaction, runs accumulate forever and reads degrade. Compaction merges runs into fewer runs, discards overwritten versions and expired tombstones, and rewrites the data sequentially. It is a background k-way merge, and it consumes CPU, disk bandwidth and, briefly, extra disk space. The two mainstream strategies make different trades.

### Size-tiered compaction (STCS)

Group runs of similar size; when there are `T` of them (Cassandra's default is 4), merge them into one run roughly `T` times bigger. Runs form tiers: a few small, fewer medium, fewer large.

- **Write amplification** is low: each byte is rewritten once per tier, about $\log_T(n)$ times over its life. For 1 TB of data and 64 MB memtables with `T = 4`, that is $\log_4(16{,}000) \approx 7$ rewrites.
- **Space amplification** is high. Runs in different tiers overlap in key range, so a key can have a stale copy in every tier; and merging four 100 GB runs needs 400 GB free while the output is written. Plan for **2× your data size** in free disk, and expect steady-state overhead of 1.5×–2× when overwrite-heavy.
- **Read amplification** is moderate: a lookup may check one run per tier plus the tier's siblings.

STCS is Cassandra's default and fits append-mostly, time-series-like workloads where data is rarely overwritten.

### Leveled compaction (LCS)

Organise runs into levels `L0, L1, L2, …` with a size budget that grows by a fanout `F` (10 in LevelDB and RocksDB) per level: L1 = 256 MB, L2 = 2.5 GB, L3 = 25 GB, L4 = 250 GB. Within each level except L0, files have **non-overlapping key ranges**, so a level behaves like one big sorted run split into 64 MB pieces. When a level exceeds its budget, pick one file, find the ~`F` files in the next level whose ranges overlap it, merge them, and write the result into the next level.

- **Read amplification** is low: at most one file per level (found by binary search on ranges) plus all the L0 files, and bloom filters skip most of them. Five levels means at most about five candidate files.
- **Space amplification** is low: overwritten versions live at most one level apart for long, and the last level holds ~90% of the data, so total space is about 1.1× the live data.
- **Write amplification** is high. Moving a file from `L_i` to `L_{i+1}` rewrites about `F` files' worth of data to insert one file's worth: roughly `F` = 10 units of write per unit moved, per level. A key that eventually settles in L4 has been rewritten by roughly `10 × 4` = 40 units of I/O in the worst case; measured write amplification in RocksDB deployments is commonly in the 10–30 range after accounting for overwrites that never descend.

Here is the same 64 MB flush traced through both strategies:

| | Size-tiered (`T = 4`) | Leveled (`F = 10`, L1 = 256 MB) |
|---|---|---|
| After 4 flushes | 4 × 64 MB merged into one 256 MB run | 4 files in L0, then each merged into L1 (rewriting the overlapping ~10% of L1 each time) |
| Runs a point read may touch | one per tier, ~4–7 | L0 files + one per level, ~5–8 before bloom filters |
| Extra disk during the biggest compaction | equal to the runs being merged (up to ~1× data) | ~11 files (~700 MB) |
| Bytes written per byte ingested, lifetime | ~`log_T(runs)` ≈ 5–8 | ~`F` × levels ≈ 20–40 |

RocksDB's default is leveled; Cassandra's is size-tiered with leveled available per table; ScyllaDB adds an *incremental* strategy that keeps STCS's low write amplification while bounding its space overhead. There is also a *time-window* strategy (Cassandra TWCS) for time-series data with TTLs: files are bucketed by write time and whole files are dropped when they expire, which makes deletes nearly free.

### Write stalls

Compaction is asynchronous, but it is not optional. If writes arrive faster than compaction can merge them, L0 accumulates files (every L0 file must be checked on a read because L0 ranges overlap) and the engine applies **backpressure**: RocksDB slows writes when L0 hits `level0_slowdown_writes_trigger` (20 files by default) and stops them entirely at `level0_stop_writes_trigger` (36). From the application's side this is a p99 latency cliff with no obvious cause. The senior diagnosis is to look at compaction backlog (pending compaction bytes, L0 file count), not at the application code, and the fixes are more compaction threads, larger memtables, a faster disk, or a strategy with less write amplification.

## Where the LSM tree lives

- **RocksDB** (Meta's fork of LevelDB) is the embeddable LSM engine under MyRocks (MySQL storage engine), TiKV (TiDB's storage layer), YugabyteDB, Kafka Streams and Flink state stores, and many bespoke services. Its knobs are the ones named above.
- **LevelDB** ships inside Chrome as the backing store for IndexedDB and in early Bitcoin Core.
- **Cassandra / ScyllaDB / HBase / Bigtable** are distributed LSM trees: each node runs memtables and SSTables; replication and partitioning sit on top. The [wide-column stores lesson](/learn/databases/nosql-and-specialised/wide-column-stores) covers the data-model consequences.
- **Lucene / Elasticsearch** are LSM-shaped too: immutable segments, background merges, deletes as marker bitsets.

## A toy LSM store

The exercise reduces the engine to its invariants: a dictionary memtable, a list of immutable sorted runs, tombstones as `None`/`null`, a read path that walks newest to oldest, and a compaction that merges every run with newest-wins and drops tombstones. Hold on to what each method preserves: after `flush()` the memtable is empty and the new run is sorted; after `compact()` there is at most one run and it contains no tombstones; `get()` is always the newest version's answer.

```exercise
id: toy-lsm-store
title: Implement a toy LSM store with flush and compaction
prompt: |
  Implement `LSMStore` with a dictionary memtable and a list of immutable
  sorted runs. Keys and values are strings and integers.

  - `put(key, value)` writes to the memtable. Returns `None`/`null`.
  - `delete(key)` writes a tombstone (`None`/`null`) to the memtable. Returns `None`/`null`.
  - `get(key)` returns the newest value: check the memtable, then the runs from
    newest to oldest. A tombstone means "absent" (return `None`/`null`).
  - `flush()` moves the memtable's entries into a new run, a list of
    `[key, value]` pairs sorted by key (tombstones as `[key, null]`), appends
    it to the run list, and empties the memtable. An empty memtable creates
    no run. Returns the number of runs.
  - `compact()` merges all runs into one (newest version of each key wins),
    drops every tombstone, and replaces the run list with that single run,
    or with no runs if the result is empty. It does not touch the memtable.
    Returns the number of live keys in the merged run.
  - `runs()` returns the list of runs, oldest first.

  The tests replay a sequence of calls and compare the returned values.
languages: [python, javascript]
entry: LSMStore
starter:
  python: |
    class LSMStore:
        def __init__(self):
            self.memtable = {}   # key -> value or None (tombstone)
            self._runs = []      # list of runs; each run is a sorted list of [key, value]

        def put(self, key, value):
            # TODO
            return None

        def delete(self, key):
            # TODO: write a tombstone
            return None

        def get(self, key):
            # TODO: memtable first, then runs newest to oldest
            return None

        def flush(self):
            # TODO: memtable -> new sorted run; return len(self._runs)
            return 0

        def compact(self):
            # TODO: merge all runs, newest wins, drop tombstones
            return 0

        def runs(self):
            return self._runs
  javascript: |
    class LSMStore {
      constructor() {
        this.memtable = new Map();  // key -> value or null (tombstone)
        this._runs = [];            // list of runs; each run is a sorted array of [key, value]
      }
      put(key, value) {
        // TODO
        return null;
      }
      delete(key) {
        // TODO: write a tombstone
        return null;
      }
      get(key) {
        // TODO: memtable first, then runs newest to oldest
        return null;
      }
      flush() {
        // TODO: memtable -> new sorted run; return this._runs.length
        return 0;
      }
      compact() {
        // TODO: merge all runs, newest wins, drop tombstones
        return 0;
      }
      runs() {
        return this._runs;
      }
    }
tests:
  - args: [["put","a",1],["put","b",2],["get","a"],["get","z"]]
    expected: [null, null, 1, null]
  - args: [["put","b",2],["put","a",1],["flush"],["runs"],["get","a"]]
    expected: [null, null, 1, [[["a",1],["b",2]]], 1]
    label: flush produces a sorted run
  - args: [["put","a",1],["flush"],["delete","a"],["get","a"],["flush"],["get","a"],["compact"],["runs"]]
    expected: [null, 1, null, null, 2, null, 0, []]
    label: tombstone hides an older value and compaction drops both
  - args: [["put","a",1],["flush"],["put","a",2],["flush"],["get","a"],["compact"],["runs"]]
    expected: [null, 1, null, 2, 2, 1, [[["a",2]]]]
    label: newest run wins
  - args: [["flush"],["put","a",1],["flush"],["flush"]]
    expected: [0, null, 1, 1]
    label: empty memtable does not create a run
  - args: [["put","a",1],["put","b",2],["flush"],["delete","b"],["put","c",3],["flush"],["put","a",9],["get","a"],["get","b"],["compact"],["runs"],["get","a"]]
    expected: [null, null, 1, null, null, 2, null, 9, null, 2, [[["a",1],["c",3]]], 9]
    hidden: true
    label: compaction ignores the memtable
  - args: [["put","a",1],["delete","a"],["flush"],["put","a",5],["flush"],["get","a"],["compact"],["runs"]]
    expected: [null, null, 1, null, 2, 5, 1, [[["a",5]]]]
    hidden: true
    label: a newer value overrides an older tombstone
hints:
  - "In `get`, distinguish \"key present with a tombstone\" from \"key absent\": use `key in memtable` (Python) or `memtable.has(key)` (JS) before reading the value."
  - "For `compact`, iterate runs oldest to newest into a dictionary so later writes overwrite earlier ones, then drop entries whose value is the tombstone and sort the keys."
  - "Sorting `[key, value]` pairs by key gives the same order in both languages for ASCII keys; sort by the key, not the pair."
```

## Senior signals

- You explain an LSM tree as "sequential writes now, merging later" and immediately name the bill: compaction I/O, read amplification, and space during merges.
- You can say why a delete makes the store bigger and why Cassandra keeps tombstones for ten days.
- You know leveled versus size-tiered by their amplification profile (leveled: low read and space, high write; tiered: the reverse) and pick one from the workload's overwrite ratio and disk headroom.
- When p99 write latency spikes on RocksDB, you look at L0 file count and pending compaction bytes before touching application code.
- You know bloom filters make point reads cheap but do nothing for range scans, and you design keys so scans stay within one run's range where possible.
- You recognise Lucene segments, Kafka log segments and SSTables as the same immutable-file-plus-merge pattern.

## Check yourself

```quiz
- q: >-
    A key was written once, months ago, and never touched since. An LSM store with leveled compaction, five levels and per-file bloom filters serves a point read for it. Roughly how many SSTable data blocks are read from disk?
  options: ["One per SSTable, since every file is checked from newest to oldest", "Zero, because the in-memory index and filters return the value", "One, because bloom filters rule out the levels that lack the key", "Five, because each level must be read to find the newest copy"]
  answer: 2
  explanation: >-
    Each level contributes at most one candidate file by key range; the bloom filters of the levels that lack the key reject it without I/O (apart from the occasional false positive), and the file that holds it needs one block read after an in-memory index lookup. The filters and index only locate the block; the value itself still costs that one read.
- q: >-
    Why can leveled compaction only drop a tombstone when it reaches the bottom level?
  options: ["Only the bottom level has bloom filters to record the deletion", "Tombstones keep files within a level from overlapping in key range", "An older copy may still sit in a lower level and would resurrect", "Dropping it before then would break WAL replay after a crash"]
  answer: 2
  explanation: >-
    Lower levels hold older data. If the tombstone vanished while an older copy remained below, a read would fall through to that copy and the deleted value would reappear. At the bottom level nothing older exists, so the tombstone is safe to discard. Non-overlapping ranges come from how compaction splits files, not from tombstones.
- q: >-
    Your Cassandra table is used as a work queue: every row is inserted, read once, and deleted within minutes. Reads are getting slower every week. What is the most likely cause?
  options: ["Reads scan tombstones that are kept until gc_grace_seconds passes", "The memtable is too small, so every read goes to many SSTables", "Leveled compaction is short of disk, so old runs pile up in L0", "Bloom filters degrade as rows churn, so false positives climb"]
  answer: 0
  explanation: >-
    Each delete adds a tombstone that must be retained for gc_grace_seconds (10 days by default) so repairs can propagate it. A queue pattern produces far more tombstones than live rows, and every read scans through them. The remedy is a different data model, not a knob such as memtable size.
- q: >-
    You ingest 1 TB of data that is almost never overwritten and you have 1.3 TB of disk. Which compaction strategy is the safer choice?
  options: ["Leveled, because it needs about 1.1x space and tiered may need 2x", "Size-tiered, because its runs never overlap, so no space is wasted", "Either, since data that is rarely overwritten needs no extra space", "Size-tiered, because its write amplification is lowest of the two"]
  answer: 0
  explanation: >-
    Size-tiered compaction can need free space equal to the runs being merged, approaching 2x the data set, which 1.3 TB cannot provide, even when nothing is overwritten. Leveled keeps total space near 1.1x at the cost of more write I/O, which is acceptable when data is rarely rewritten.
- q: >-
    RocksDB write latency suddenly jumps from microseconds to tens of milliseconds at p99 while CPU is idle. The first metric to check is:
  options: ["The block cache hit ratio and the row cache size", "Memtable lookup time and the size of the skip list", "Bloom filter bits per key and the false-positive rate", "The number of L0 files and pending compaction bytes"]
  answer: 3
  explanation: >-
    That pattern is a write stall: L0 has reached the slowdown or stop trigger because compaction fell behind ingestion. The engine throttles writers deliberately. Compaction backlog metrics confirm it; read-side metrics such as bloom filters or cache hit ratio do not explain slow writes. The fixes are more compaction threads, a faster disk, or a strategy with less write amplification.
```
