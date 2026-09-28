---
slug: indexes
title: "Indexes: from B-tree pages to index-only scans"
description: What a Postgres B-tree looks like page by page, why random keys cost three times the WAL of ordered ones, how composite column order, covering and partial indexes change the buffers a query touches, why index-only scans depend on vacuum, and what each index costs every write, all measured.
minutes: 34
difficulty: medium
tags: [indexes, b-tree, gin, brin, covering-index, postgres, query-planner, hot-updates]
---
The comments section of a lesson loads slowly. The query is the one this app's `CommentService::list` sends: the comments on one target, newest first, capped at 500, with each author's display name joined in.

```sql
SELECT c.*, u.display_name AS author_name
FROM comments c
LEFT JOIN users u ON u.id = c.user_id
WHERE c.target_kind = 'lesson' AND c.target_slug = $1
ORDER BY c.created_at DESC
LIMIT 500;
```

On a lab replica of the schema with 1 million comments (206 MB) spread over 2,000 lessons, without an index Postgres has one strategy: read all 26,316 pages, test every row, keep the 279 that match, sort them. That took 75 ms with the table in memory, and it grows linearly: at 40 million comments it is 8 GB of reading for a few hundred rows. With the index this app declares, the comments come back from 286 buffer accesses in 0.45 ms. The query did not change; the data structure underneath it did.

This lesson opens that data structure with `pageinspect`, shows how the planner decides whether to use it, how to design one for a query rather than a column, and what it costs every time you write. All measurements are on PostgreSQL 17 with data in memory.

## Under the hood: a B-tree, page by page

A Postgres B-tree is a separate file of 8 KiB pages organised as a B+tree (the Lehman–Yao variant, which lets readers move right past a concurrent page split without locking the parent). Leaf pages hold index entries in key order; each entry is the key plus a **TID**, the `(block, offset)` address of a row version in the heap. Internal pages hold separator keys and child pointers. Every leaf is at the same depth, and each leaf links to its right sibling so a range scan walks sideways.

```viz
{"type": "system", "scenario": "b-tree-index", "keys": [52, 55, 58, 61],
 "title": "Lookup, range scan and a page split",
 "caption": "A lookup reads one page per level. The inserts here are ascending, like a sequence or UUIDv7 primary key, so they all land in the rightmost leaf; when it fills, it splits and a separator is promoted. Random keys (UUIDv4) would instead touch a random leaf on every insert."}
```

Look at a real one: the primary key of a 1-million-row table with a `bigint` id.

```sql
SELECT tree_level, internal_pages, leaf_pages, avg_leaf_density FROM pgstatindex('k_bigint_pkey');
--  tree_level | internal_pages | leaf_pages | avg_leaf_density
--           2 |             11 |       2733 |            90.06
SELECT live_items, avg_item_size, free_size FROM bt_page_stats('k_bigint_pkey', 1);   -- a leaf
--  live_items | avg_item_size | free_size
--         367 |            16 |       808
```

Every number can be derived. An index tuple for a `bigint` is an 8-byte header (the TID plus flags) and the 8-byte key, 16 bytes, plus a 4-byte line pointer: 20 bytes. A page has 8,192 − 24 (page header) − 16 (B-tree "special" area with sibling links and level) = 8,152 usable bytes, room for 407 entries. A bulk build fills leaves to `fillfactor = 90`, leaving 808 bytes free, hence **367 items per leaf**. One of them is the page's *high key*, the upper bound that tells a concurrent reader whether to move right, so each leaf holds 366 entries: 1,000,000 / 366 = 2,733 leaves, exactly as measured. The root holds 10 downlinks to 10 internal pages, which hold the 2,733 leaf pointers. `tree_level = 2` means three levels: root, internal, leaf.

A point lookup therefore reads three index pages and one heap page, and `EXPLAIN (ANALYZE, BUFFERS)` agrees: `Buffers: shared hit=4`. With a fan-out of about 367, heights grow slowly:

| Rows | Leaves (367 per page) | Levels | Pages per lookup (index + heap) |
|---|---|---|---|
| 100,000 | 273 | 2 | 3 |
| 1,000,000 | 2,733 | 3 | 4 |
| 100,000,000 | about 272,000 | 4 | 5 |
| 10,000,000,000 | about 27 million | 5 | 6 |

The root and internal levels of a 100-million-row index are a few megabytes and stay in memory, so even for tables far larger than RAM a lookup costs about one leaf read and one heap read. A binary search tree over the same rows would be 27 levels deep. The fan-out is the point; [B-trees and B+trees](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees) covers the algorithm.

## Insert order shapes the tree

Ascending keys (a sequence, a timestamp, UUIDv7) always insert into the rightmost leaf. Postgres caches that leaf's location (the "fastpath"), and when it fills, it splits so that the old page stays full: indexes on ascending keys stay at 90% density. Random keys (UUIDv4) land in a random leaf; pages split in the middle and settle near 70% full, and the whole index becomes the working set. Measured with 1 million rows each:

| Key | Index size | Leaf density | 100,000 more inserts right after a checkpoint |
|---|---|---|---|
| `bigint` sequence | 21 MB | 90% | |
| UUIDv7 (time-ordered) | 30 MB | 90% | 75 ms, 15 MB of WAL |
| UUIDv4 (random) | 38 MB | 71% | 202 ms, 43 MB of WAL |

`pg_walinspect` shows where the extra WAL comes from. For UUIDv4, the 99,368 `Btree/INSERT_LEAF` records carried **32 MB of full-page images**: the first change to each page after a checkpoint logs the whole page (so crash recovery never sees a torn page), and random inserts touch nearly every leaf. There were also 642 page splits, half of them mid-page (`SPLIT_L`). For UUIDv7 the same records carried 5 KB of page images and 384 splits, all at the right edge (`SPLIT_R`). Three times the WAL means three times the replication traffic and backup volume for the same rows. This app generates UUID keys with `Uuid::now_v7()` for that reason.

**Duplicates are compressed.** Since Postgres 13, leaves deduplicate equal keys into one key with a posting list of TIDs. An index on a four-value `status` column over 2 million rows measured 33 MB with deduplication and 44 MB with `deduplicate_items = off`. Smaller does not mean more useful, as the next section shows.

## How the planner decides to use an index

The planner compares estimated costs of each access path (the arithmetic is worked in [SQL and query plans](/learn/databases/relational-fundamentals/sql-and-query-plans)):

| Node | What it does | Wins when |
|---|---|---|
| `Seq Scan` | Reads every heap page in physical order | A large fraction of rows match, or the table is small |
| `Index Scan` | Walks the index; fetches each matching row's heap page by TID | Few rows match, rows are physically clustered, or the index order is needed |
| `Bitmap Index Scan` + `Bitmap Heap Scan` | Collects TIDs into a page-sorted bitmap, reads each heap page once | A moderate fraction matches, or several indexes are combined with `AND`/`OR` |
| `Index Only Scan` | Answers from the index, visiting the heap only for pages not marked all-visible | Every column the query needs is in the index |

The deciding quantities are **selectivity** and **correlation**. On the lab `orders` table (2 million rows), a range on the uncorrelated `total_cents` matching 20% of rows cost 126 ms as a forced index scan (one heap page access per row, 399,667 in all), 53 ms as a bitmap scan and 65 ms as a sequential scan; on the perfectly correlated `placed_at`, an index scan beat the sequential scan even at 50%. An index on a column where each value matches a large, scattered fraction of the table is dead weight for those values.

A **partial index** is usually what you wanted instead:

```sql
-- Only the rows the job runner looks for; tiny, and always selective.
CREATE INDEX orders_pending_idx ON orders (placed_at) WHERE status = 'pending';
```

On the lab table that index is 416 kB against 13 MB for a full index on `status`, and `WHERE status = 'pending' ORDER BY placed_at LIMIT 20` reads 3 buffers.

## Composite indexes and the leftmost-prefix rule

A composite index on `(a, b, c)` is sorted by `a`, then by `b` within equal `a`, then by `c`: a phone book sorted by surname, then first name. The planner can **bound** a scan (jump to a start key, stop at an end key) on a leading run of equality columns plus at most one range column, and nothing after the range. Conditions on later columns are still checked inside the index, saving heap visits, but they do not shrink the slice of the index that is read.

Measured on `orders` with `WHERE customer_id = 42 AND placed_at >= '2026-01-01'` (5 matching rows):

```text
-- index on (placed_at, customer_id)
Index Scan using orders_placed_cust_idx on orders  (cost=0.43..15290.67 rows=6) (actual time=1.887..13.666 rows=5)
  Index Cond: ((placed_at >= '2026-01-01 00:00:00+00') AND (customer_id = 42))
  Buffers: shared hit=3 read=2297
-- index on (customer_id, placed_at)
Index Scan using orders_cust_placed_idx on orders  (cost=0.43..28.55 rows=6) (actual time=0.025..0.032 rows=5)
  Index Cond: ((customer_id = 42) AND (placed_at >= '2026-01-01 00:00:00+00'))
  Buffers: shared hit=5 read=3
```

Both list both columns under `Index Cond`, which looks identical at a glance. The first read 2,300 index pages (every entry since 1 January, for every customer, checking `customer_id` on each) for 13.7 ms; the second read 8 pages for 0.054 ms. The `Buffers` line is the tell. With `(customer_id, placed_at)`:

| Query | Bounded on | Measured |
|---|---|---|
| `WHERE customer_id = 42` | `customer_id` | leading column, equality |
| `WHERE customer_id = 42 AND placed_at >= $1` | both | 8 buffers |
| `WHERE placed_at >= $1` alone | nothing | the planner uses a different index or scans |
| `WHERE customer_id = 42 ORDER BY placed_at DESC LIMIT 5` | `customer_id`, no sort | `Index Scan Backward`, 8 buffers, 0.038 ms |
| `WHERE customer_id IN (1, 2, 3) ORDER BY placed_at DESC LIMIT 5` | `customer_id`, then a sort | three slices merged: bitmap scan plus `top-N heapsort`, 64 buffers |

The rule: **equality columns first, then the range or sort column.** "Most selective column first" is mostly irrelevant; what matters is which queries can use a prefix. Postgres 18 adds **skip scan**, which lets `(a, b)` serve a condition on `b` alone by jumping between the distinct values of `a`; it helps when `a` has few distinct values and cannot rescue a leading column with millions of values. The lab here runs Postgres 17, so none of the plans above use it.

## This app's comments index

The migration `m0004_community` creates `idx_comments_target` on `(target_kind, target_slug, created_at)`, commented "Query pattern: all comments on target X, oldest first". `CommentService::list` filters on both leading columns and orders by `created_at DESC` with `LIMIT 500`, then reverses the rows in Rust so threads read oldest first. Two equalities then the sort column means the index both finds the rows and delivers them in order, scanned backwards, so the `LIMIT` can stop early. On the lab replica:

- A popular lesson (22,364 comments): `Index Scan Backward` stopped after 500 entries (348 buffers), and a `Memoize` node over the `users` primary key fetched the authors: **1.55 ms** in total.
- A typical lesson (279 comments): the index scan took 0.45 ms and 286 buffers, about one heap page per comment, because comments on one lesson are written over months and scattered through the heap. Then the planner, expecting 406 rows and charging `random_page_cost = 4` per author lookup, chose to hash all 50,000 users and re-sort: **7.7 ms**, of which 6.2 ms was building the hash. With `random_page_cost = 1.1` it chose a nested loop: **1.7 ms**.

The index is right; the join strategy around it depends on cost constants that should describe your storage. And for small targets, the heap, not the index, is where the reads go.

## Covering indexes and index-only scans

If the index contains every column a query needs, Postgres can skip the heap. Non-key columns go in `INCLUDE`: stored in the leaf entries, not part of the sort order.

```sql
CREATE INDEX oc_cust_cov_idx ON oc (customer_id, placed_at) INCLUDE (total_cents, status);
EXPLAIN (ANALYZE, BUFFERS) SELECT sum(total_cents) FROM oc WHERE customer_id BETWEEN 1000 AND 1999;
```

Measured on a 2-million-row copy of `orders`, for 20,239 matching rows:

| State | Plan | Heap fetches | Buffers | Time |
|---|---|---|---|---|
| Plain `(customer_id, placed_at)` index | Bitmap heap scan | (all rows) | 11,835 | 30.1 ms |
| Covering index, table freshly vacuumed | Index-only scan | 0 | 129 | 1.47 ms |
| Covering index, after updating 10% of rows | Index-only scan | 22,201 | 22,348 | 65.6 ms |
| Covering index, after `VACUUM` | Index-only scan | 0 | 160 | 1.40 ms |

The covering index is 95 MB against 60 MB for the plain one, the price of carrying two extra columns in every leaf. The third row is the trap. Index entries carry no visibility information (which transaction created or deleted each version; see [MVCC and locking](/learn/databases/relational-fundamentals/mvcc-and-locking)), so Postgres may trust an entry without visiting the heap only if the heap page is marked **all-visible** in the **visibility map**, two bits per heap page that vacuum sets and any write clears. Updating 10% of rows, spread over every page, cleared all 16,667 bits (`pg_visibility_map_summary` went from 16,667 all-visible pages to 0), and the "index-only" scan became slower than the plain bitmap scan. After `VACUUM`, 18,334 pages were all-visible again. The fix for climbing `Heap Fetches` is vacuum tuning, not another index. It is also why `SELECT *` matters: it forces a heap visit per row, so an ORM that always selects every column never gets an index-only scan.

## Expression and partial indexes

An index is on whatever you tell it to be on:

```sql
-- Case-insensitive login: queries must use the same expression.
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));
SELECT id FROM users WHERE lower(email) = lower($1);

-- Soft deletes: most queries only want live rows.
CREATE INDEX comments_live_target_idx
  ON comments (target_kind, target_slug, created_at)
  WHERE deleted_at IS NULL;
```

The planner uses a partial index only when it can prove the query's `WHERE` implies the index predicate, which means the query must contain the same condition, textually close enough for the prover to match. `WHERE deleted_at IS NULL` matches; a parameterised `WHERE deleted_at IS NOT DISTINCT FROM $1` does not, because the proof happens at plan time.

A unique partial index is a constraint tool. This app's `m0007_integrity` migration creates `uq_interviews_one_active_per_user` on `interviews (user_id) WHERE status = 'active'`: at most one active interview per user, enforced by the database, because the service's "abandon the old one, then insert" sequence could race when two requests arrived together. No plain `UNIQUE` constraint can express "unique among active rows".

## Beyond B-trees

| Type | Structure | Supports | Use it for | Watch out for |
|---|---|---|---|---|
| B-tree | Balanced tree of sorted keys | `=`, `<`, `>`, `BETWEEN`, `ORDER BY`, `LIKE 'abc%'` | The default, most indexes | Useless for `LIKE '%abc%'`, arrays, JSON containment |
| Hash | Hash buckets | `=` only | Very long keys where only equality is needed | No ordering, no uniqueness constraints |
| GIN | Inverted index: element → posting list of TIDs | `@>`, `?`, `&&`, full text `@@`, trigram `LIKE '%abc%'` | `jsonb`, arrays, full-text search, `pg_trgm` | One row inserts many entries; a pending list (`fastupdate`) that searches must also scan |
| GiST | Balanced tree of bounding predicates | Overlap, containment, nearest neighbour | Geometry, ranges, exclusion constraints | Lossy; rechecks against the heap |
| BRIN | Min and max per block range (128 pages by default) | Ranges on physically ordered data | Append-only time series and logs | Worthless when physical order drifts from the column |
| `bloom` (extension) | A bit signature per row | `=` on any subset of many columns | Wide tables filtered by arbitrary column combinations | Lossy; equality only |

Two measurements. **BRIN** on `placed_at` for the 2-million-row table is **24 kB**; the B-tree on the same column is **43 MB**, 1,800 times larger. For one day of data (2,880 rows) the B-tree answered in 0.5 ms; BRIN in 3.0 ms, because it can only say "these 384 pages may contain matches" (`Heap Blocks: lossy=384`) and then rechecks 41,344 rows. BRIN trades a few milliseconds for gigabytes on large append-only tables, and it stops working the day a backfill or a large `UPDATE` scatters rows so every block range's min and max widen.

**Trigram GIN** answers infix searches a B-tree cannot. `WHERE email LIKE '%er4242%'` on 100,000 users was a sequential scan (4.7 ms, 2,166 buffers) even with a B-tree on `email`; with `CREATE INDEX ... USING gin (email gin_trgm_ops)` it became a bitmap scan over the posting lists of the trigrams `er4`, `r42`, `424` and `242`: 0.21 ms, 16 buffers, and 3.5 MB of index.

The `bloom` extension answers "users filter on any combination of 12 columns": twelve B-trees cost twelve index writes per insert, while one signature per row rejects most rows cheaply.

```viz
{"type": "system", "scenario": "bloom-filter", "keys": ["colour=red", "size=L", "brand=acme"],
 "title": "The idea behind a bloom index",
 "caption": "Each row's column values are hashed into a small bit signature. A query hashes its conditions the same way and skips every row whose signature lacks one of those bits. A match might be a false positive, so Postgres rechecks the heap row."}
```

## What every index costs

Reads get cheaper with each index. Writes pay for every index, on every insert, forever. Inserting the same 500,000 rows into tables that differed only in their indexes:

| Indexes | Insert time | WAL written |
|---|---|---|
| none | 0.26 s | 57 MB |
| primary key (sequential) | 0.52 s | 89 MB |
| primary key + 2 secondary | 1.62 s | 161 MB |
| primary key + 5 secondary | 4.24 s | 298 MB |

Six indexes made the insert **16 times slower** and wrote **5 times the WAL**, which replicas replay and backups store. Adding a seventh index for one report makes every insert more expensive. At scale this is a platform decision: Uber's 2016 write-up on moving from Postgres to MySQL cited exactly this write amplification, where updating one field wrote a new tuple and an entry in every index, multiplied across replicas.

**Updates may write every index too.** Postgres never updates in place: an `UPDATE` writes a new row version at a new TID, and every index needs an entry pointing at it. The exception is the **heap-only tuple (HOT) update**: if no indexed column changed and the new version fits on the same heap page, the old version points to the new one within the page and no index is touched. Measured with 200,000 scattered single-row updates of `views` and `last_seen`:

| Table | HOT updates |
|---|---|
| `fillfactor = 100`, `last_seen` not indexed | 85.9% (page pruning freed room after the first update per page) |
| `fillfactor = 90`, `last_seen` not indexed | 97.6% |
| `fillfactor = 90`, `last_seen` indexed | 0% |

Indexing a column that changes on every request disables HOT for the busiest write in the system. Leaving free space with `fillfactor` makes HOT likelier on update-heavy tables. Since Postgres 14, **bottom-up index deletion** removes obsolete versions from a leaf before splitting it, which kept the primary key of the indexed table at 4.4 MB despite 200,000 non-HOT updates.

```sql
-- How often do updates avoid index maintenance?
SELECT relname, n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / nullif(n_tup_upd, 0), 1) AS hot_pct
FROM pg_stat_user_tables ORDER BY n_tup_upd DESC LIMIT 10;

-- Indexes never used since statistics were last reset.
SELECT indexrelid::regclass AS index, relid::regclass AS table, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

An index with `idx_scan = 0` after a month of traffic costs write throughput, WAL, backup size, replica lag and buffer-pool space for nothing. Statistics are per server, so check replicas (a read replica may be its only user) before dropping it.

**Building an index blocks writes** unless you ask otherwise. `CREATE INDEX` takes a `SHARE` lock that blocks inserts, updates and deletes for the whole build. `CREATE INDEX CONCURRENTLY` does not, at the price of two table scans and a build that can fail and leave an `INVALID` index behind. [Schema migrations at scale](/learn/databases/data-modeling-and-evolution/schema-migrations-at-scale) measures both.

## Designing an index for a query

1. Write down the query with its `ORDER BY` and `LIMIT`. Indexes serve queries, not columns.
2. Put equality-filtered columns first, in an order that lets other queries share the prefix.
3. Add at most one range column, or the `ORDER BY` column when the sort is what makes the query expensive.
4. If the query is hot and reads few columns, `INCLUDE` them for an index-only scan, and make sure vacuum keeps the visibility map current.
5. If the query targets a small, well-defined subset, make the index partial.
6. Check with `EXPLAIN (ANALYZE, BUFFERS)` and read the buffers, not the node names.
7. Drop what it makes redundant: `(a)` is redundant next to `(a, b)`.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A two-column query reads thousands of buffers for a handful of rows although both columns appear in `Index Cond` | The range column leads the index, so only it bounds the scan | Reorder to equality columns first; confirm with `Buffers` |
| An index-only scan gets slower over the day | `Heap Fetches` climbs as writes clear visibility-map bits faster than autovacuum sets them | Lower `autovacuum_vacuum_scale_factor` for the table; check nothing pins the xmin horizon |
| Insert throughput halves after a release that "only added an index" | Every insert now maintains one more random-access index; WAL volume and replica lag rise with it | Question the index; use a partial or covering index that replaces two; build with `CONCURRENTLY` |
| WAL volume and replica lag jump after switching IDs to UUIDs | Random keys touch every leaf between checkpoints, logging a full-page image each time | UUIDv7 or a sequence; `wal_compression` to shrink page images |
| A frequently updated table bloats and its indexes grow | Updates to an indexed column, or full pages, prevent HOT | Stop indexing the churning column; lower `fillfactor`; check `n_tup_hot_upd` |

## Interviewer follow-ups

**"How many disk reads does a primary-key lookup cost on a billion-row table?"** Model answer: the tree is about five levels at a fan-out near 370; the upper levels are a few megabytes and stay cached, so typically one leaf read and one heap read. Common wrong answer: "log₂ of a billion, about 30", which is a binary tree, not a B-tree.

**"Both columns appear under Index Cond. Why is the query still slow?"** Model answer: in a composite index only the leading equality columns and the first range column bound the scan; later conditions are filters inside the index, and the `Buffers` line shows how much was walked. Common wrong answer: "the planner chose the wrong index".

**"When does an index-only scan still touch the heap?"** Model answer: for every entry on a heap page not marked all-visible in the visibility map, because index entries carry no visibility information; vacuum sets the bits, writes clear them. Common wrong answer: "only when a column is missing from the index", which would prevent the index-only plan altogether.

**"Why is UUIDv4 a poor primary key for a write-heavy table if UUIDv7 is the same width?"** Model answer: randomness, not width: random inserts spread over every leaf, splitting pages mid-way (71% density) and logging a full-page image per touched leaf after each checkpoint, three times the WAL measured here. Common wrong answer: "16-byte comparisons are slow".

## What mid-level engineers get wrong

- **Indexing columns instead of queries.** An index on each of `customer_id` and `placed_at` is not the same as one on `(customer_id, placed_at)`.
- **Putting the range column first** and reading `Index Cond` instead of `Buffers`.
- **Expecting the planner to use an index for a common value.** At 20% of an uncorrelated table, the sequential or bitmap scan is right.
- **Adding indexes without counting the write cost.** Six indexes made inserts 16 times slower.
- **Indexing a column that changes on every request**, losing HOT on the hottest write.
- **Trusting "Index Only Scan" in the plan** without checking `Heap Fetches`.

```exercise
id: predict-index-usage
title: Predict what a composite B-tree can do
prompt: |
  Given a B-tree index's columns in order, the columns a query constrains with
  equality, the columns it constrains with a range (`<`, `>`, `BETWEEN`), and
  the single column in its `ORDER BY` (ascending), return an object with:

  - `bound_columns`: how many leading index columns bound the scan. Walk the
    index columns in order: an equality column counts and you continue; a range
    column counts and you stop; any other column stops the walk.
  - `sorted`: `true` if the index can return rows already in `ORDER BY` order
    without a sort. That is the case when the `ORDER BY` column is in the index
    and every index column before it is constrained by equality.

  Assume a plain B-tree without skip scan. A column never appears in both
  `equals` and `ranges`.
languages: [python, javascript]
entry: index_usage
starter:
  python: |
    def index_usage(index_cols, equals, ranges, order_by):
        # return {"bound_columns": ..., "sorted": ...}
        pass
  javascript: |
    function index_usage(index_cols, equals, ranges, order_by) {
      // return { bound_columns: ..., sorted: ... }
    }
tests:
  - args: [["target_kind", "target_slug", "created_at"], ["target_kind", "target_slug"], [], "created_at"]
    expected: {"bound_columns": 2, "sorted": true}
    label: this app's comments index
  - args: [["a", "b", "c"], ["b"], [], "c"]
    expected: {"bound_columns": 0, "sorted": false}
    label: leading column unconstrained
  - args: [["customer_id", "placed_at", "status"], ["customer_id", "status"], ["placed_at"], "placed_at"]
    expected: {"bound_columns": 2, "sorted": true}
    label: range stops the walk
  - args: [["placed_at", "customer_id"], ["customer_id"], ["placed_at"], "placed_at"]
    expected: {"bound_columns": 1, "sorted": true}
    label: wrong column order
  - args: [["a", "b"], [], [], "z"]
    expected: {"bound_columns": 0, "sorted": false}
    hidden: true
  - args: [["tenant_id", "user_id", "created_at"], ["tenant_id"], ["created_at"], "created_at"]
    expected: {"bound_columns": 1, "sorted": false}
    hidden: true
  - args: [["a", "b", "c"], ["a", "b", "c"], [], "b"]
    expected: {"bound_columns": 3, "sorted": true}
    hidden: true
hints:
  - "Loop over index_cols with a counter; `continue` on equality, count-and-break on range, break otherwise."
  - "For `sorted`, find the position of order_by in index_cols and check that every earlier column is in equals."
```

## Senior signals

- You can derive a B-tree's shape from first principles (20 bytes per `bigint` entry, 367 per leaf at fillfactor 90, three levels for a million rows) and confirm it with `pageinspect`.
- You design an index from the query (filter, sort and limit together), put equality columns before the range or sort column, and judge the result by `Buffers`.
- You explain random-key write amplification as full-page images and mid-page splits, and you can say how much WAL it cost.
- You know an index-only scan depends on the visibility map, so climbing `Heap Fetches` is a vacuum problem.
- You count the write cost of every index and protect HOT updates by not indexing churning columns and by leaving `fillfactor` headroom.
- You reach for partial, expression, BRIN and trigram GIN indexes when a plain B-tree is the wrong shape, and you use unique partial indexes as constraints.

## Check yourself

```quiz
- q: >-
    A 1-million-row bigint primary key has 367 entries per leaf and three levels. How many buffers does a point lookup touch, and why?
  options: ["Four: root, internal, leaf, then the heap page", "Two: the leaf found by hashing, then the heap page", "About 20, one per level of a balanced binary tree", "One, because the whole index is cached in the root"]
  answer: 0
  explanation: >-
    A B-tree lookup reads one page per level and then the heap page the TID points at, which EXPLAIN reports as four buffers. The fan-out of several hundred keeps the tree shallow; a binary tree would need about 20 levels. The root holds only separators, and B-trees do not hash.
- q: >-
    An index on (created_at, account_id) serves WHERE account_id = $1 AND created_at > now() - interval '7 days'. Both columns appear under Index Cond, but 30,000 buffers are read for 12 rows. What fixes it?
  options: ["Adding a separate single-column index on account_id", "Reordering the index to (account_id, created_at)", "Running CLUSTER so the heap follows created_at order", "Moving account_id into an INCLUDE clause on the index"]
  answer: 1
  explanation: >-
    Only the leading range column bounds the scan, so every entry from the last week for every account is walked and filtered. Equality first, then range, makes the matching entries one contiguous slice, as the measured 2,300 buffers against 8 showed. The wasted reads are index pages, so clustering the heap cannot help, and INCLUDE columns are never used to bound a scan.
- q: >-
    An index-only scan reports Heap Fetches: 22,201 for 20,239 rows and is slower than a plain bitmap scan. What happened?
  options: ["Writes cleared visibility-map bits and vacuum has not reset them", "The index lacks an INCLUDE column, so values come from the heap", "The planner picked a stale index, so every row had to be rechecked", "The query uses SELECT *, which forces every row to the heap"]
  answer: 0
  explanation: >-
    Index entries carry no visibility information, so the executor may skip the heap only for pages marked all-visible. Updating 10% of rows cleared the bit on every page; after VACUUM the same scan took 160 buffers and 1.4 ms. A missing column or SELECT * would prevent an index-only plan entirely, and this plan is one.
- q: >-
    After switching primary keys from a sequence to UUIDv4, WAL volume per insert roughly triples. What is the main mechanism?
  options: ["Random keys hit most leaves, each logged in full after a checkpoint", "UUIDs are 16 bytes, so each index entry needs twice the WAL space", "UUID indexes cannot use deduplication, so each entry is logged twice", "UUID generation is logged as its own WAL record for every inserted row"]
  answer: 0
  explanation: >-
    The measurement showed 32 MB of full-page images for 100,000 random inserts against 5 KB for time-ordered keys of the same width, plus mid-page splits. Width adds a little; randomness adds the page images. UUID generation writes no WAL, and deduplication is irrelevant for unique keys.
- q: >-
    A users table is updated on every request to set last_seen_at. Someone adds an index on last_seen_at for an admin report. What is the most important side effect?
  options: ["Every lookup by id now misses cache because the index is so large", "The report's scans lock the table against those frequent updates", "None; an index costs nothing until a query actually reads it", "Those updates lose HOT and now write every index on the table"]
  answer: 3
  explanation: >-
    A HOT update requires that no indexed column changes. Indexing last_seen_at took HOT from 97.6% to 0% in the lab, so the busiest write now inserts into every index and generates the matching WAL and bloat. Index scans take no locks that block updates, and the cost is paid on writes whether or not the report runs.
- q: >-
    Which workload is the best fit for a BRIN index?
  options: ["Containment searches for a key inside a large jsonb column", "Point lookups of users by email on a 50-million-row table", "Filtering a five-value status column that is updated constantly", "Time-range queries over a 2 TB table appended in time order"]
  answer: 3
  explanation: >-
    BRIN stores a min and max per block range, 24 kB against 43 MB for a B-tree in the lab, but only excludes ranges when physical order follows the column, which append-only time-ordered data guarantees. Email lookups want a B-tree, jsonb containment wants GIN, and constant updates destroy the physical correlation BRIN depends on.
```
