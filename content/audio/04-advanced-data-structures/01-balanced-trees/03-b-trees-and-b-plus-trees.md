---
lesson: b-trees-and-b-plus-trees
source: e15d78741ec3397e
fit: partial
desk:
  - "The fan-out arithmetic and the levels table for full and 70 percent full pages, plus the Postgres page numbers"
  - "The ten-insert split trace and the three-delete borrow and merge trace, node by node"
  - "The Postgres, InnoDB and SQLite page formats"
  - "The trade-off and failure-mode tables"
  - "Exercises: implement a small B-plus tree; compute fan-out and height from a page layout"
---
## Introduction

A billion-row table has an index on the user ID. A lookup in a balanced binary tree over a billion keys touches about 30 nodes. If each node is a separate page on disk, that is 30 page reads. Even on an NVMe drive at roughly 100 microseconds per random read, that is 3 milliseconds per lookup, on a machine that has to do 50 thousand of them a second.

The binary tree is the wrong shape for anything on disk, and for anything in RAM but not in cache, for the same reason: each level costs one slow memory access and buys you one bit of information. The fix is to make each node as wide as one unit of slow-memory transfer. A node holding 250 keys buys about 8 bits per access, and a billion keys need 4 levels instead of 30.

That is the B-tree, and its variant the B-plus tree is the index in Postgres, MySQL's InnoDB, SQLite, Oracle, SQL Server, MongoDB's WiredTiger and most filesystems. When a database's documentation says "B-tree index", it means B-plus tree.

Three ideas. The fan-out arithmetic, and why a lookup on a billion rows usually costs one disk read. How splits and merges keep the tree balanced with no rotations at all. And what that means for your choice of keys, your deletes, and your write costs.

## The shape

Every node holds between half full and full of sorted keys, except the root, which may hold as few as one. A node with k keys has k plus 1 children, and each child holds the keys between its two neighbouring separators. And all leaves are at the same depth.

That last rule is the balance guarantee, and it costs nothing. The tree only grows taller when the root splits, and a root split adds one level to every path at once. There are no rotations anywhere.

The B-plus tree adds two changes databases care about. Internal nodes hold only keys and child pointers; the records, or pointers to them, live only in the leaves. So internal nodes are denser, the fan-out is higher, and the tree is shorter. And the leaves are linked into a sorted list, so a range scan descends once and then walks sideways.

A lookup binary-searches within a page to pick a child, descends, and repeats. The comparisons are cheap, because the page is in memory once read. The page reads are the whole cost.

## The fan-out arithmetic

Take the smallest common page, 4 kilobytes, and 8-byte integer keys. A leaf entry is the key plus an 8-byte row reference, 16 bytes. An internal entry is the key plus a child page number, also 16 bytes. Allow 40 bytes of page header. That gives 253 keys per full page. Under random inserts pages average about 70 percent full, so the working fan-out is about 177.

With full pages, four levels reach 4.1 billion keys. At 70 percent, four levels reach just under a billion, and five reach 174 billion. So a billion keys is a 4- or 5-level tree.

Before I go on: if the tree is 4 levels deep, why does a point lookup usually cost only one disk read?

[pause]

Because the top levels are tiny. With 253 keys a page, the top three levels are about 64 thousand pages, 251 megabytes. The leaf level is about 4 million pages, 15 gigabytes. Any buffer pool bigger than a few hundred megabytes keeps every internal page resident permanently. So a point lookup reads one leaf from disk, plus one more for the table row if the index does not cover the query. On NVMe that is about 200 microseconds. On cloud block storage at roughly a millisecond a read, 2 milliseconds. On a spinning disk at 8 milliseconds, 16.

Postgres's real numbers agree. Its 8-kilobyte page fits about 407 index entries. A billion keys is 4 levels, and the top three are 1.3 gigabytes, which is why a buffer pool of a few gigabytes serves billion-row indexes from memory for everything but the leaf. Compare the AVL tree: 30 levels, no wide top to keep hot, and a pointer chase per level.

## Splits

Insert descends to the right leaf and puts the key in sorted position. If the leaf is now over capacity, it splits: half the keys go to a new sibling, and a separator goes into the parent. In a B-plus tree the separator is a copy of the new sibling's first key, because the leaf must keep its own copy of every record. In a classic B-tree the middle key moves up instead. If the parent overflows, it splits too, and if the root splits, a new root appears and the tree gets one level taller.

The smallest example, with at most three keys per node. Insert 10, 20, 30: they fit in one leaf. Insert 40: four keys, so split into a leaf of 10 and 20 and a leaf of 30 and 40, and copy 30 up into a brand-new root. Keep inserting in order up to 100, and you get four leaf splits and one internal split, and the height grows exactly once, at the root. The lesson traces all ten inserts; do that one at your desk.

Notice what sorted input does. Every split happens on the rightmost leaf, and the left half of every split stays half full forever. Postgres and InnoDB detect this rightmost-insert case and split unevenly, leaving the left page full, so ascending keys produce densely packed pages.

Random keys, such as version 4 UUIDs, split all over the tree. Pages sit around 70 percent full, and every insert dirties an unpredictable page. That is the mechanism behind the standard advice to prefer time-ordered identifiers, auto-increment, version 7 UUIDs or ULIDs, for clustered keys.

## Merges, and why databases skip them

Delete is the mirror. Remove the key from the leaf. If the leaf drops below half full, borrow a key from a sibling that has a spare, and update the separator in the parent. If neither sibling can spare one, merge with a sibling and remove the separator from the parent, which can underflow in turn. When the root is left empty, its only child becomes the root, and the tree shrinks a level.

The step people get wrong on paper is the internal borrow. Keys do not move sideways between internal siblings. They rotate through the parent: the parent's separator comes down into the underfull node, and the sibling's nearest key goes up to replace it. Move a key sideways directly and you break the ordering the parent's separator promised.

Now the honest part: most databases do not do this eagerly. Postgres leaves underfull pages in place, and only reclaims a page once it is completely empty and vacuum has confirmed no scan can still reach it. InnoDB merges when a page falls below half full. So delete 80 percent of a table's rows, and the index file has not moved, and range scans still walk every nearly-empty leaf. The fix is a rebuild, a concurrent reindex, or for recurring bulk deletes, partitioning by time and dropping partitions.

## Range scans and composite indexes

A query for every row created between two timestamps, in order, is one descent to the first, then a walk along the leaf chain. Every page read yields hundreds of rows already sorted, so the query never revisits internal nodes and never sorts. In a red-black tree, the same query hops between scattered heap allocations, one key per hop.

The same chain makes "order by this column, limit 10" cheap: descend to one end and read 10 entries. And a composite index on tenant and creation time can serve "this tenant, ordered by time" with no sort, because one tenant's leaves are contiguous and already in time order. The index is sorted by the concatenated key, and it can only walk prefixes of it. Filter on creation time alone, and that index cannot help.

## Inside real engines

Postgres implements Lehman and Yao's B-link tree. Every page carries a pointer to its right sibling and a high key bounding what it may contain. A reader that races a concurrent split notices its key is above the high key and simply moves right, instead of anyone locking the whole path. Postgres also deduplicates repeated keys into posting lists since version 13, and since 14 tries deleting dead entries before splitting a page.

InnoDB's table is itself a B-plus tree keyed by the primary key, with the full row in the leaves: a clustered index. Secondary indexes store the primary key, not a row pointer, so a secondary lookup is two tree descents. Two consequences follow. A wide primary key bloats every secondary index. And random primary keys split pages in the table itself, not only in an index.

In memory, the same argument holds with the cache line as the unit. Rust's BTreeMap uses nodes of up to 11 keys, and the Linux kernel's maple tree replaced a red-black tree in 6.1 for cache behaviour.

## What it costs

Write amplification first. Updating one 100-byte row rewrites at least one 8-kilobyte page, about 80 times the data, plus the write-ahead log record, plus in Postgres a full image of the page the first time it changes after a checkpoint. A leaf split right after a checkpoint can log 24 kilobytes for a 16-byte insert. Add secondary indexes, each its own tree, and one row insert becomes a dozen page writes. That is the cost LSM trees exist to reduce.

Space: at 70 percent fill, a B-plus tree costs about 1.4 times its raw data. And concurrency: under sequential inserts, every insert wants the rightmost leaf, so that one page becomes a contention point. Often that is fine; if not, hash-partition.

And one trap that is pure fan-out: a key stored as a 36-character UUID string instead of 16 bytes of binary cuts fan-out from hundreds to dozens, adds a level and multiplies the pages.

## In the interview

A follow-up the lesson expects. Version 4 UUID primary keys are hurting insert performance. What exactly is the mechanism?

[pause]

Random keys hit random leaves, defeating the rightmost-split optimisation. Each insert dirties a random page, splits scatter and leave pages around 70 percent full, and in a clustered engine like InnoDB the table pages split too, so both write traffic and space go up. The wrong answers are "the tree becomes unbalanced", when a B-plus tree is always balanced, and "UUIDs are slow to compare".

And another: Postgres has a covering index. When does an index-only scan still read the table? When the visibility map does not mark the table page all-visible, because the index carries no visibility information. After a vacuum, the map catches up and the table reads disappear.

## Recap

Four things to remember. Make the node the size of the transfer unit: fan-out in the hundreds means 4 or 5 levels for a billion keys. The upper levels are a few hundred megabytes and stay cached, so a point lookup is one leaf read, plus the row. The tree stays balanced with no rotations because it only grows at the root; internal borrows go through the parent, and real databases skip eager merging and pay for it in bloat. And your key choice is a page-split pattern: random UUIDs scatter splits and leave pages 70 percent full, time-ordered keys pack them.

At your desk: the fan-out table, the split and merge traces, the three page formats, the trade-off and failure tables, and the two exercises.
