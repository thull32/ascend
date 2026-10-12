---
lesson: b-tree-vs-lsm
source: 9a656c5878f7e065
---
## 1

An engine writes 100-byte rows into 16 kilobyte pages, and flushes each dirty page once per update. Its WAL is negligible. Which statement about write amplification is correct?

A, about 16 times, because 16 kilobyte pages hold 16 rows. B, about 160 times, all of it sequential. C, about 1 times, because the WAL absorbs the write. D, about 160 times, all of it random I/O.

[think]

The answer is D: about 160 times, all of it random I/O.

16 kilobytes over 100 bytes is about 164 bytes written per byte changed, and each page lands wherever its key sits in the tree, so the I/O pattern is random. The WAL adds to this figure; it does not replace the page write.

## 2

Leveled compaction has a fanout of 10 and six levels, 1 to 6. In the exercise's simple model, a row that eventually settles in level 6 has been rewritten roughly how many times?

A, about 51. B, about 100 thousand. C, about 6. D, about 10.

[think]

The answer is A: about 51.

The model counts one write for the flush into level 1, plus ten rewrites for each of the five moves between levels: 1 plus 50, which is 51. Multiplying by the fanout at every level confuses capacity, which grows geometrically, with rewrites, which add up linearly. Real numbers are lower, because overwritten versions never descend, but the shape, linear in levels times the fanout, is right.

## 3

A workload updates the same 5 gigabytes of rows over and over, on a server with a 32 gigabyte buffer pool. Which engine's write amplification does this locality reduce?

A, the LSM tree's, because hot keys stay in the memtable and never flush. B, neither, because amplification depends only on row and page sizes. C, the B-tree's, because each page absorbs many updates before one flush. D, both equally, because fewer distinct bytes change in either engine.

[think]

The answer is C: the B-tree's, because each page absorbs many updates before one flush.

A B-tree page updated many times between checkpoints is written once, so its amplification falls towards 1. An LSM tree flushes every memtable version, and compaction rewrites whatever descends, however hot the key; locality does not change its arithmetic. That asymmetry is why you must measure the write distribution before choosing.

## 4

Which workload is the strongest fit for a size-tiered LSM store, rather than a B-tree?

A, event ingestion of 300 thousand immutable rows a second, read by key within the hour. B, a config table of 10 thousand rows, updated a few times a day by operators. C, a bank ledger with strict transactions, and indexes on account and date. D, a product catalogue read 1,000 times per write, with range queries by price.

[think]

The answer is A: event ingestion of 300 thousand immutable rows a second, read by key.

Write-dominated, append-only data, read by key, is exactly what the LSM write path is built for, and size-tiered compaction keeps write amplification lowest. The catalogue and the ledger want a B-tree, for range scans, transactions and indexes, and the tiny table does not care.

## 5

Your RocksDB service has 1.2 terabytes of live data on 1.4 terabytes of disk, with leveled compaction. A colleague proposes switching to size-tiered compaction to cut write amplification. What is the main risk?

A, space amplification can approach twice the data, exceeding the disk. B, the WAL must double in size to cover the larger merges. C, write amplification rises, since tiers are rewritten more often. D, Bloom filters stop working under size-tiered compaction.

[think]

The answer is A: space amplification can approach twice the data, exceeding the disk.

Size-tiered compaction keeps stale copies across tiers, and needs room for both the inputs and the output of a merge, so peak usage can approach twice the live data, which 1.4 terabytes cannot absorb. Leveled stays near 1.1 times, which is why it fits. The switch would lower write amplification, as the colleague says; disk space is the cost.

## 6

A point lookup for a key that does not exist is served by a leveled LSM store, with a Bloom filter on each file at a 1 percent false-positive rate, and six candidate files. Roughly how many disk reads does it cost, on average?

A, six, one read per candidate file. B, zero, as filters never err on absent keys. C, about 0.06, from false positives. D, one, to confirm the key is absent.

[think]

The answer is C: about 0.06, from false positives.

Each filter answers "definitely absent" with no I/O, except on a false positive, which happens 1 percent of the time per file, so six files give about 0.06 expected reads. Zero is wrong, because false positives happen precisely on absent keys; what a Bloom filter never gives is a false negative. That is why LSM stores are fast on negative lookups, and why the filters are essential to them.
