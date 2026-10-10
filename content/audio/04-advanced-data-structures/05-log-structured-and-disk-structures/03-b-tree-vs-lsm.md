---
lesson: b-tree-vs-lsm
source: 17df8c3d5466f3c1
fit: great
desk:
  - "The comparison table across B-tree, leveled LSM and size-tiered LSM"
  - "The one-workload table: bytes per second, operations per second, bytes per day and drive writes per day"
  - "Where to read real amplification: RocksDB's compaction stats, InnoDB status counters, Postgres WAL and checkpoint views, and smartctl"
  - "The engine-choice flowchart and the failure-modes table"
  - "Exercise: compute B-tree and leveled-LSM amplification factors"
---
## Introduction

A design interview reaches the storage layer. You say "Postgres", or "Cassandra", and the interviewer asks the question that separates candidates: why that one, for this workload?

"Cassandra scales writes" is a brand answer. The senior answer names the structure under each database, says what each structure amplifies, and matches that to the read and write mix, the data size and the disk.

Every storage engine ends up as one of two shapes. The B-tree family, Postgres, InnoDB, SQLite, WiredTiger, updates pages in place. The LSM family, RocksDB, Cassandra, ScyllaDB, HBase, MyRocks, Pebble, appends immutable sorted runs and merges them. Three ideas: the three currencies every engine pays in, one workload computed for both, and how to choose from the workload rather than the brand.

## Three currencies

Every structure that stores and retrieves data pays in three currencies: read cost, update cost, and space. The RUM conjecture says you can push two of the three toward their minimum only by letting the third grow. It is not a theorem, but it is a reliable lens.

A B-tree minimises read cost, one path from root to leaf, and space, one copy of each row, and pays in update cost: a whole page rewritten for a small change. A leveled LSM tree keeps space low and writes sequential, and pays in read cost. A size-tiered LSM tree makes writes cheapest and pays in reads and space. And a plain unsorted log takes update cost to the floor, with unbounded reads.

The way to compare engines is to turn each currency into an amplification factor: how many bytes the engine actually reads, writes or stores per byte the application asked about.

## Write amplification

Take a 100-byte row update.

In a B-tree, the row lives in an 8 kilobyte page. Eventually the whole page is written back: 8,192 divided by 100, about 82 times, if nothing else on that page changed. Add the WAL record, and in Postgres a full-page image after a checkpoint. Realistic B-tree write amplification for small random updates is in the tens, and it is random I/O.

But here is the B-tree's escape hatch. If updates cluster on a hot set of pages, a page absorbs many updates before it is flushed. A page updated 50 times between checkpoints is written once, so the amplification drops to about 1.6. That is why a B-tree with a big buffer pool is fine for a typical transactional database, and not for a uniformly random write stream over 5 terabytes.

In a leveled LSM tree, the row is written once to the log and once in the memtable flush, a 64 megabyte sequential write shared with a million other rows. Then compaction carries it down: about 2 units for the first merge, and about 11 for each level after that. With five levels, about 36 times in the model, less in practice because many versions are overwritten before they descend. But every one of those writes is large and sequential. Size-tiered compaction is cheaper still, about 5 to 8 times.

## Read and space amplification

Reads. A B-tree point lookup walks a few levels. With 8 kilobyte pages and a fan-out around 400, a billion keys is four levels, and the upper levels are always cached, so a cold point read costs about one disk read for the index and one for the row. Range scans are where B-trees shine: leaf pages are linked, so a scan reads consecutive pages with no merging.

An LSM point read may consult the memtable, every level-zero file, and one file per level, five to eight candidates. Bloom filters reject almost all the ones that lack the key, so a present key costs about one block read plus filter checks. An absent key, with six candidate files at 1 percent false positives each, costs about 0.06 reads. Range scans cannot use the filters and must merge every run whose range overlaps, so a scan that touches five runs does five times the I/O of a B-tree scan.

And the read cost that surprises people is hiding in compaction: it reads every byte it writes. At write amplification 20, that is 40 bytes of disk traffic per ingested byte in the background, competing with your queries. That is why an LSM store's read latency can rise during the day and fall at night.

Space. B-tree pages run 60 to 80 percent full after random inserts, and Postgres keeps dead row versions until VACUUM reclaims them. Baseline about 1.3 to 1.5 times, and an update-heavy table that is not vacuumed aggressively can reach twice its live size. A leveled LSM tree keeps one version of each key in its bottom level, which holds about 90 percent of the data, so space is about 1.1 times. That was the biggest reason Meta moved its user database from InnoDB to MyRocks: it reported half the storage of compressed InnoDB for the same data. Size-tiered: plan for up to 2 times.

So, in one breath. B-tree: write amplification in the tens, random; reads of one or two pages; the best range scans; space 1.3 to 2 times; smooth latency with checkpoint spikes. Leveled LSM: 10 to 40, sequential; about one block read; merged scans; 1.1 times; compaction stalls at the tail. Size-tiered: 5 to 8; more runs to read; up to 2 times.

Two more rows matter as much. In-place updates make row locking, secondary indexes and transactions straightforward, which is why the relational engines are B-trees. Immutable sorted blocks compress very well, which is why storage-cost-sensitive systems lean LSM.

## One workload, computed for both

Ten thousand updates a second, 200-byte rows, spread uniformly over a 1 terabyte dataset, on a 2 terabyte NVMe drive rated for one full drive-write per day. Uniform spread means the B-tree cannot coalesce anything.

The B-tree writes 10 thousand 8 kilobyte pages a second: about 82 megabytes a second, all random, about 7 terabytes a day. That is 3.5 drive-writes a day against a rating of one. It wears the drive in about a third of its warranty life.

The leveled LSM, at write amplification 25, writes 10 thousand times 200 bytes times 25: 50 megabytes a second, sequential, about 4.3 terabytes a day, 2.2 drive-writes a day. Still over the rating, wearing the drive in under half its life. Size-tiered, at about 7 times, would bring it to about 0.6.

Now change one assumption. Before I say it: the updates hit a 20 gigabyte hot set instead of the whole terabyte. Which engine benefits?

[pause]

Only the B-tree. Its pages now absorb dozens of updates between checkpoints, so page writes fall toward the checkpoint rate, about 70 megabytes a second at worst, far less with coalescing, and it wins on read latency because everything is a cached path. The LSM store's arithmetic does not change: compaction rewrites whatever descends, hot or not. The general rule: locality helps the B-tree and does nothing for the LSM tree. Measure your write distribution before you choose.

## What the disk changes

On a spinning disk, a random 8 kilobyte write costs a seek, 5 to 10 milliseconds, while sequential writes stream at 100 to 200 megabytes a second. The LSM tree was invented for this: 20 times write amplification is worth it when the alternative is 200 random writes a second.

On an SSD there are no seeks, but the drive erases in large blocks, and random small writes force it to copy live pages around, its own internal write amplification, sometimes several times. Large sequential writes stay near one. And the two multiply: a B-tree at 40 times on an SSD at 3 times wears the drive at 120 bytes per logical byte. The gap is smaller than on spinning disks, but it has not closed.

On NVMe with deep queues, random reads are nearly as fast as sequential ones, which shrinks the LSM's point-read penalty and makes Bloom filters the thing that matters.

And every engine exposes the real numbers. RocksDB prints a write-amplification column in its compaction stats. InnoDB counts bytes written in its status variables. Postgres reports WAL bytes. And the drive itself, through smartctl, reports data units written, which includes its own amplification and predicts when it dies.

## Choosing

If your working set fits in RAM and writes are not your bottleneck, a B-tree relational database is the right default, and the simpler one to operate. Reach for an LSM engine when write throughput per disk, storage cost, or SSD endurance is the constraint you are actually hitting, and budget for compaction tuning when you do.

The examples line up. Cassandra and ScyllaDB fit write-heavy, append-mostly event and time-series data, and fit queues and wide secondary-index queries badly. CockroachDB and TiDB put a distributed SQL layer on an LSM store and accept its read profile. Time-series databases are LSM-shaped because they ingest far more than they read, and dropping whole expired files makes retention cheap. MyRocks halved Meta's storage, at the cost of slower descending scans and secondary-index lookups and a lot of engineering. And MongoDB's WiredTiger had an LSM mode for years, then removed it. LSM is not a free upgrade.

## In the interview

A follow-up the lesson expects. Give me a workload where the B-tree beats the LSM tree on writes.

[pause]

A small hot set updated repeatedly, like counters or session rows. The B-tree page absorbs many updates per flush, so its amplification approaches 1, while the LSM tree still rewrites each version through compaction. "Never, LSM is write-optimised" ignores locality.

And a judgement one. Your LSM store holds 1.2 terabytes on 1.4 terabytes of disk under leveled compaction, and a colleague wants size-tiered to cut write amplification. No: tiered compaction's peak space can approach twice the data during its largest merge, and 1.4 terabytes cannot hold that. Keep leveled, or add disk first.

## Recap

Four things to remember. Compare engines by read, write and space amplification, not by brand. A B-tree rewrites a whole page per small change, randomly, but locality can shrink that toward one; an LSM tree writes sequentially at 10 to 40 times, indifferent to locality. Leveled LSM gets space down to 1.1 times, tiered can need 2, and compaction's background reads compete with queries. And write amplification is a drive-endurance number: compute drive-writes per day before you choose.

At your desk: the comparison table, the one-workload table with drive-writes per day, where to read real amplification on RocksDB, InnoDB, Postgres and the drive, the choice flowchart and failure modes, and the amplification exercise.
