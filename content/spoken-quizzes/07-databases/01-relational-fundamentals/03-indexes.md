---
lesson: indexes
source: 91eb0166289f58ec
---
## 1

A bigint primary key on a million rows has 367 entries per leaf page, and three levels. How many buffers does a point lookup touch, and why?

A, four: the root, an internal page, a leaf, then the heap page. B, two: the leaf found by hashing, then the heap page. C, about 20, one per level of a balanced binary tree. D, one, because the whole index is cached in the root.

[think]

The answer is A: four, the root, an internal page, a leaf, then the heap page.

A B-tree lookup reads one page per level, then the heap page that the tuple pointer names, which explain reports as four buffers. A fan-out of several hundred keeps the tree shallow; a binary tree would need about 20 levels. The root holds only separators, and B-trees do not hash.

## 2

An index on created-at, then account ID, serves a query for one account's rows from the last seven days. Both columns appear in the index condition, yet 30 thousand buffers are read for 12 rows. What fixes it?

A, adding a separate single-column index on account ID. B, reordering the index to account ID first, then created-at. C, running cluster, so the heap follows created-at order. D, moving account ID into an include clause on the index.

[think]

The answer is B: reorder the index to account ID first, then created-at.

Only the leading range column bounds the scan, so every entry from the last week, for every account, is walked and filtered. Equality first, then range, makes the matching entries one contiguous slice: in the lab, 2,300 buffers became 8. The wasted reads are index pages, so clustering the heap cannot help, and include columns are never used to bound a scan.

## 3

An index-only scan reports about 22 thousand heap fetches for about 20 thousand rows, and it is slower than a plain bitmap scan. What happened?

A, writes cleared visibility-map bits, and vacuum has not set them again. B, the index lacks an include column, so the values come from the heap. C, the planner picked a stale index, so every row had to be rechecked. D, the query selects every column, which forces every row to the heap.

[think]

The answer is A: writes cleared visibility-map bits, and vacuum has not reset them.

Index entries carry no visibility information, so the executor may skip the heap only for pages marked all-visible. Updating 10 percent of the rows cleared the bit on every page. After a vacuum, the same scan took 160 buffers and 1.4 milliseconds. A missing column, or selecting every column, would prevent an index-only plan entirely, and this plan is one.

## 4

After switching primary keys from a sequence to version 4 UUIDs, the write-ahead log written per insert roughly triples. What is the main mechanism?

A, random keys hit most leaves, and each is logged in full after a checkpoint. B, UUIDs are 16 bytes, so each index entry needs twice the log space. C, UUID indexes cannot use deduplication, so each entry is logged twice. D, UUID generation is logged as its own record for every inserted row.

[think]

The answer is A: random keys hit most leaves, each logged in full after a checkpoint.

The measurement showed 32 megabytes of full-page images for 100 thousand random inserts, against 5 kilobytes for time-ordered keys of the same width, plus splits in the middle of pages. Width adds a little; randomness adds the page images. Generating a UUID writes no log, and deduplication is irrelevant for unique keys.

## 5

A users table is updated on every request to set the last-seen time. Someone adds an index on last-seen for an admin report. What is the most important side effect?

A, every lookup by ID now misses the cache, because the index is so large. B, the report's scans lock the table against those frequent updates. C, none, because an index costs nothing until a query actually reads it. D, those updates lose heap-only tuple updates, and now write every index on the table.

[think]

The answer is D: those updates lose heap-only updates and now write every index.

A heap-only update requires that no indexed column changes. Indexing last-seen took heap-only updates from 97.6 percent to zero in the lab, so the busiest write now inserts into every index, with the matching write-ahead log and bloat. Index scans take no locks that block updates, and the cost is paid on every write whether or not the report ever runs.

## 6

Which workload is the best fit for a BRIN index?

A, containment searches for a key inside a large binary JSON column. B, point lookups of users by email, on a 50 million row table. C, filtering a five-value status column that is updated constantly. D, time-range queries over a 2 terabyte table appended in time order.

[think]

The answer is D: time-range queries over a large table appended in time order.

A BRIN index stores a minimum and a maximum per block range: 24 kilobytes in the lab, against 43 megabytes for a B-tree. But it only excludes ranges when physical order follows the column, which append-only, time-ordered data guarantees. Email lookups want a B-tree, JSON containment wants GIN, and constant updates destroy the physical correlation BRIN depends on.
