---
lesson: indexes
source: b0ba6d401c4be852
fit: great
desk:
  - "The pageinspect output and the B-tree arithmetic, entry by entry"
  - "The two composite-index plans side by side, reading the Buffers line"
  - "The index-type table: B-tree, hash, GIN, GiST, BRIN and bloom"
  - "The diagnostic queries for HOT ratio and unused indexes"
  - "Exercise: predict what a composite B-tree can do"
---
## Introduction

The comments section of a lesson loads slowly. The query is simple: the comments on one lesson, newest first, capped at 500, with each author's name joined in. On a lab replica with a million comments spread over 2,000 lessons, and no index, Postgres has one strategy: read all 26 thousand pages, test every row, keep the 279 that match, and sort them. 75 milliseconds with the table in memory, and it grows linearly. At 40 million comments, that is 8 gigabytes of reading for a few hundred rows.

With the index this app declares, the same comments come back in under half a millisecond. The query did not change. The data structure underneath it did.

Four ideas. What a B-tree actually looks like, and why it is so shallow. How to design an index for a query rather than a column. Why an index-only scan depends on vacuum. And what every index costs each time you write.

## A B-tree, page by page

A Postgres B-tree is a separate file of 8 kilobyte pages. Leaf pages hold entries in key order, each one a key plus the address of a row in the table. Internal pages hold separator keys pointing down. Every leaf is at the same depth, and each leaf links to its right neighbour so a range scan can walk sideways.

The numbers are worth deriving once. An entry for a big integer key is 16 bytes, plus a 4 byte pointer: 20 bytes. A page has about 8,150 usable bytes, and a fresh index fills leaves to 90 percent. That gives 367 entries per leaf. A million rows need 2,733 leaves, and the tree is three levels: root, internal, leaf. A point lookup reads three index pages and one table page, and explain agrees: four buffers.

Here is the number to remember: that fan-out of about 367. A hundred million rows is four levels. Ten billion is five. And the upper levels of even a hundred-million-row index are a few megabytes that stay in memory, so a lookup costs about one leaf read and one table read. A binary tree over the same rows would be 27 levels deep. The fan-out is the point.

## Insert order shapes the tree

Ascending keys, a sequence, a timestamp or UUID version 7, always land in the rightmost leaf. When it fills, it splits so the old page stays full, and the index stays at 90 percent density. Random keys, UUID version 4, land in a random leaf. Pages split in the middle, settle near 71 percent full, and the whole index becomes the working set.

Measured on a million rows: a big integer key's index was 21 megabytes, version 7 was 30, version 4 was 38. Then 100 thousand more inserts right after a checkpoint. Version 7 wrote 15 megabytes of write-ahead log. Version 4 wrote 43.

Why three times? The first change to any page after a checkpoint logs the whole page, so crash recovery never sees a torn page. Random inserts touch nearly every leaf, so nearly every insert logs a full page image: 32 megabytes of them. Three times the log means three times the replication traffic and backup volume for the same rows. That is why this app generates its UUID keys as version 7.

## How the planner decides, and partial indexes

The planner chooses between a sequential scan, an index scan, a bitmap scan and an index-only scan by cost, and two quantities decide it: selectivity, how many rows match, and correlation, how closely the index order follows the physical order of the table. On an uncorrelated column, at 20 percent of rows, a forced index scan took 126 milliseconds, the bitmap scan 53, and the sequential scan 65. An index on a column whose values each match a large, scattered fraction of the table is dead weight for those values.

A partial index is usually what you wanted instead. Index only the pending orders, by when they were placed. On the lab table that index is 416 kilobytes, against 13 megabytes for a full index on status, and asking for the 20 oldest pending orders reads three buffers.

## Composite indexes

A composite index on A, B, C is sorted by A, then by B within each A, then by C: a phone book sorted by surname, then first name. The planner can bound a scan, meaning jump to a start and stop at an end, on a leading run of equality columns plus at most one range column. Nothing after the range bounds anything. Later conditions are still checked inside the index, but they do not shrink the slice that gets read.

The lab query: one customer's orders since the first of January. Five rows match. Two indexes, same two columns, opposite orders. Before I tell you the numbers: which order wins, and by how much?

[pause]

With the date first, the scan read 2,300 index pages, every entry since January for every customer, checking the customer on each one. 13.7 milliseconds. With the customer first, it read 8 pages, in about a twentieth of a millisecond. And here is the trap: both plans list both columns under index condition. They look identical at a glance. The buffers line is the tell.

So the rule is: equality columns first, then the range or sort column. "Most selective column first" is mostly irrelevant. What matters is which queries can use a prefix.

This app's comments index follows that rule: the target kind, the target slug, then created-at. Two equalities and then the sort column, so the index both finds the rows and delivers them in order, scanned backwards, and the limit stops early. On the most popular lesson, with 22 thousand comments, the whole query took 1.55 milliseconds. On a typical lesson, the index part took 0.45 milliseconds, but the planner then chose to hash all 50 thousand users to fetch authors, 7.7 milliseconds in total, because of that random page cost default of 4. At 1.1 it chose a nested loop: 1.7 milliseconds. The index was right. The join around it depends on cost constants that should describe your storage.

## Covering indexes and the visibility map

If an index contains every column a query needs, Postgres can skip the table entirely. Extra columns go in an include clause: stored in the leaves, not part of the sort order.

On a 2 million row copy of orders, summing totals for a thousand customers, 20 thousand rows: the plain index with a bitmap scan touched almost 12 thousand buffers in 30 milliseconds. A covering index, freshly vacuumed: an index-only scan, 129 buffers, about one and a half milliseconds.

Then update 10 percent of rows. Same index, same plan name, index-only scan. 22 thousand table fetches, 65 milliseconds. Slower than the plain index.

Here is why. Index entries carry no visibility information; they cannot tell you whether the row version is visible to your transaction. Postgres may skip the table only if the page is marked all-visible in the visibility map, two bits per page that vacuum sets and any write clears. Ten percent of rows spread over every page cleared every bit. After a vacuum, the scan was back to one and a half milliseconds. So a climbing heap-fetches count is a vacuum problem, not a missing index. And it is why select star matters: an ORM that always selects every column never gets an index-only scan.

## Other shapes of index

An index is on whatever you tell it to be on. An expression index on lower of email serves case-insensitive login, as long as queries use the same expression. A unique partial index is a constraint tool: this app enforces at most one active interview per user with a unique index on user, only where status is active, because the service's abandon-then-insert sequence could race when two requests arrived together. No plain unique constraint can say "unique among active rows".

Beyond B-trees, two measurements. A BRIN index stores just the minimum and maximum per range of blocks. On the timestamp of 2 million orders it is 24 kilobytes, against 43 megabytes for the B-tree. For one day of data, the B-tree answered in half a millisecond and BRIN in 3, because BRIN only says "these pages might match" and rechecks. It trades milliseconds for gigabytes on append-only tables, and stops working the day a backfill scatters rows. And a trigram GIN index answers infix searches, a substring in the middle of an email, that a B-tree cannot: from a 4.7 millisecond sequential scan to 0.21 milliseconds.

## What every index costs

Reads get cheaper with each index. Writes pay for every index, on every insert, forever. Inserting the same 500 thousand rows: with no indexes, a quarter of a second. With a primary key and five secondary indexes, 4.2 seconds. Six indexes made the insert 16 times slower and wrote five times the write-ahead log, which replicas replay and backups store. Uber's 2016 write-up on leaving Postgres for MySQL cited exactly this write amplification.

Updates can write every index too, because Postgres never updates in place; a new row version needs new index entries. The exception is the heap-only tuple update, or HOT: if no indexed column changed and the new version fits on the same page, no index is touched. With a 90 percent fillfactor and the churning column unindexed, 97.6 percent of updates were HOT. Index that column, and it dropped to zero. Indexing a column that changes on every request disables HOT for the busiest write in your system.

Two more costs. An index with zero scans after a month costs throughput, log volume and memory for nothing, but check the replicas before dropping it, because statistics are per server. And a plain create index blocks writes for the whole build; build concurrently instead.

## In the interview

A follow-up the lesson expects. How many disk reads does a primary-key lookup cost on a billion-row table?

[pause]

The tree is four levels. The upper levels are a few megabytes and stay cached, so typically one leaf read and one table read. The wrong answer is log base two of a billion, about 30, which describes a binary tree, not a B-tree.

And: why is UUID version 4 a poor primary key if version 7 is the same width? Randomness, not width. Random inserts spread over every leaf, split pages in the middle, and log a full page image per touched leaf after each checkpoint: three times the write-ahead log, measured.

## Recap

Four things to remember. A B-tree's fan-out of a few hundred keeps it three to five levels deep at any size you will meet. Design indexes for queries: equality columns first, then one range or sort column, and judge the result by buffers, not node names. An index-only scan is only as good as vacuum keeps the visibility map. And every index taxes every write: six indexes, 16 times slower inserts, and an index on a churning column kills HOT updates.

At your desk: the B-tree arithmetic, the two composite plans, the index-type table, the diagnostic queries, and the composite-index exercise.
