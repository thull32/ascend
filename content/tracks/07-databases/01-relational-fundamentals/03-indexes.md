---
slug: indexes
title: "Indexes: from B-tree pages to index-only scans"
description: How a B-tree index turns a scan of millions of rows into a handful of page reads, how to order a composite index, when the planner ignores your index on purpose, and what every index costs on the write path.
minutes: 34
difficulty: medium
tags: [indexes, b-tree, gin, brin, covering-index, postgres, query-planner]
---
The comments page for a popular lesson takes seven seconds to load. The query is simple:

```sql
SELECT * FROM comments
WHERE target_kind = 'lesson' AND target_slug = 'indexes'
ORDER BY created_at
LIMIT 500;
```

The table has 40 million rows across about a million 8 KiB pages. With no index, Postgres has exactly one strategy: read every page, test every row, keep the 312 that match, sort them. That is 8 GB of I/O to return 312 rows. With the right index the same query touches about 320 pages and finishes in under a millisecond. The query did not change. The data structure underneath it did.

This lesson is about that data structure: how it is laid out on disk, how the planner decides whether to use it, how to design one for a query rather than for a column, and what it costs every time you write.

## What a B-tree index is, physically

A Postgres B-tree index is a separate file of 8 KiB pages organised as a balanced tree (strictly a B+tree, following the Lehman–Yao design). Leaf pages hold index entries in key order; each entry is the key plus a **TID**, the `(block, offset)` address of the row in the table's heap file. Internal pages hold separator keys and pointers to child pages. Every leaf is at the same depth, and each leaf has a pointer to its right sibling so a range scan can walk sideways without going back up the tree.

```viz
{"type": "system", "scenario": "b-tree-index", "keys": [52, 55, 58, 61],
 "title": "Lookup, range scan and a page split",
 "caption": "A lookup reads one page per level. The inserts here are ascending, like a sequence or UUIDv7 primary key, so they all land in the rightmost leaf; when it fills, it splits and a separator is promoted. Random keys (UUIDv4) would instead touch a random leaf on every insert."}
```

The numbers are what make B-trees work. An index entry for a `bigint` key is about 16 bytes plus a 4-byte line pointer, so a leaf page holds roughly 370–400 entries (leaves are filled to 90% by default to leave room for inserts). Internal pages fan out by a similar factor. For a 100-million-row table:

- Leaf pages needed: 100,000,000 / 370 ≈ 270,000.
- One level up: 270,000 / 370 ≈ 730 pages.
- Next level: 730 / 370 → 2 pages.
- Root: 1 page.

That is a height of four. A point lookup reads four index pages and one heap page. The root and the internal levels total a few hundred pages, a few megabytes, and are permanently hot in the buffer pool, so in practice a lookup costs one leaf read and one heap read even on a table far larger than memory. A binary search tree over the same rows would be 27 levels deep, one random read per level; the fan-out is the whole point. [B-trees and B+trees](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees) covers the algorithmic side; here we care about what the database does with it.

Two physical details matter in production:

**Insert order shapes the tree.** Ascending keys (a `bigserial`, a timestamp, a UUIDv7) always insert into the rightmost leaf. Postgres has a fast path for exactly this, the hot leaf stays in cache, and full pages are left 90% full. Random keys (UUIDv4) insert into a random leaf every time: each insert may need a leaf that is not in memory, pages split in the middle and settle around 70% full, and the index is larger and colder. This app generates comment IDs with `Uuid::now_v7()` for that reason: time-ordered UUIDs keep global uniqueness without the random-insert penalty.

**Duplicates are compressed.** Since Postgres 13, B-tree leaves deduplicate repeated keys into one key with a list of TIDs, which makes an index on a low-cardinality column (such as `status`) several times smaller than it used to be. It does not make that index more useful, as the next section shows.

## How the planner decides to use an index

Having an index does not mean the planner will use it. It estimates the cost of each access path and picks the cheapest. There are four you will see in `EXPLAIN`:

| Node | What it does | Wins when |
|---|---|---|
| `Seq Scan` | Reads every heap page in physical order | A large fraction of rows match, or the table is small |
| `Index Scan` | Walks the index, fetches each matching row from the heap by TID | Few rows match, or the order of the index is needed |
| `Bitmap Index Scan` + `Bitmap Heap Scan` | Collects matching TIDs into a bitmap sorted by page, then reads each heap page once | A moderate fraction matches, or several indexes are combined with `AND`/`OR` |
| `Index Only Scan` | Answers from the index alone, visiting the heap only for pages not marked all-visible | Every column the query needs is in the index |

The deciding quantity is **selectivity**: the fraction of rows that match. Here is the arithmetic the planner is doing. Take a 10-million-row `orders` table at 80 rows per page, so 125,000 pages. Postgres charges `seq_page_cost = 1` per sequentially read page and `random_page_cost = 4` per randomly read page by default.

- **Sequential scan:** 125,000 pages × 1 = 125,000 units of I/O cost, regardless of the filter.
- **Index scan matching 0.1% (10,000 rows):** if the matching rows are scattered across the table, that is up to 10,000 random heap reads × 4 = 40,000 units. The index wins.
- **Index scan matching 5% (500,000 rows):** up to 500,000 random reads × 4 = 2,000,000 units, sixteen times the sequential scan. The sequential scan wins, and the planner is right to ignore your index.

The crossover depends on **correlation**, the statistic from the [previous lesson](/learn/databases/relational-fundamentals/sql-and-query-plans) that measures how well the physical row order matches the index order. If orders were inserted in `placed_at` order, a range on `placed_at` touches contiguous heap pages and an index scan stays cheap even at 20% of the table. If the matching rows are spread evenly, the crossover can be below 1%. The bitmap scan exists for the middle ground: it sorts TIDs by page so each heap page is read at most once and in physical order, trading the index's ordering for fewer, more sequential reads.

On SSDs the true random-to-sequential ratio is closer to 1.1–2 than 4, and many teams set `random_page_cost = 1.1`. That shifts the crossover towards more index use. It is a legitimate tuning knob, not a hack, but change it globally and deliberately rather than per query.

The consequence for design: **an index on a column where each value matches a large fraction of the table is dead weight.** An index on `status` with five values, one of which covers 60% of rows, will be used for the rare values and ignored for the common one. A **partial index** is usually what you actually wanted:

```sql
-- Only the rows the job runner looks for; tiny, and always selective.
CREATE INDEX orders_pending_idx ON orders (created_at) WHERE status = 'pending';
```

## Composite indexes and the leftmost-prefix rule

A composite index on `(a, b, c)` is sorted by `a`, then by `b` within equal `a`, then by `c` within equal `(a, b)`: a phone book sorted by surname, then first name. That single fact explains every rule about composite indexes.

The planner can use the index to *bound* a scan (jump to a start key, stop at an end key) on a leading prefix of columns constrained by equality, plus at most one column constrained by a range, and nothing after the range. Conditions on later columns can still be checked inside the index, which saves heap visits, but they do not shrink the part of the index that is read.

Take `CREATE INDEX ON orders (customer_id, placed_at)` and walk through queries:

| Query | Bounded on | Why |
|---|---|---|
| `WHERE customer_id = 42` | `customer_id` | Leading column, equality |
| `WHERE customer_id = 42 AND placed_at >= '2026-09-01'` | both | Equality then range: one contiguous slice |
| `WHERE placed_at >= '2026-09-01'` | nothing | Rows for that date are spread across every customer's section |
| `WHERE customer_id = 42 ORDER BY placed_at DESC LIMIT 20` | `customer_id`, and no sort | Within one customer the entries are already in `placed_at` order; scan backwards and stop after 20 |
| `WHERE customer_id IN (1, 2, 3) ORDER BY placed_at` | `customer_id`, but needs a sort | Three separately sorted slices must be merged |

The design rule that falls out: **equality columns first, then the range or sort column.** The rule people are often taught, "most selective column first", is mostly irrelevant. What matters is which queries can use a prefix.

Get the order wrong and `EXPLAIN` will mislead you if you only skim it. With the index on `(placed_at, customer_id)` instead:

```text
Index Scan using orders_placed_at_customer_idx on orders
    (cost=0.56..48210.33 rows=31 width=48) (actual time=0.052..183.402 rows=29 loops=1)
  Index Cond: ((placed_at >= '2026-09-01 00:00:00+00'::timestamptz) AND (customer_id = 42))
  Buffers: shared hit=21877
Planning Time: 0.180 ms
Execution Time: 183.431 ms
```

Both conditions appear under `Index Cond`, which looks perfect. But only `placed_at` bounds the scan: Postgres walks every index entry since 1 September for every customer and checks `customer_id` on each. The `Buffers: shared hit=21877` for 29 rows is the tell. With the columns swapped, the same query reads five pages.

Postgres 18 added **skip scan**, which lets a B-tree on `(a, b)` serve a condition on `b` alone by jumping between the distinct values of `a`. It helps when the leading column has few distinct values (a `region` or `tenant_tier`). It does not rescue the phone-book problem when the leading column has millions of values, so design as if it did not exist and treat it as a bonus.

Now the index this app actually has. The migration for comments creates `idx_comments_target` on `(target_kind, target_slug, created_at)` with the comment "Query pattern: all comments on target X, oldest first". The query from the opening, which is what `CommentService::list` sends, gets this plan:

```text
Limit  (cost=0.69..676.11 rows=318 width=312) (actual time=0.041..0.690 rows=312 loops=1)
  Buffers: shared hit=318 read=4
  ->  Index Scan using idx_comments_target on comments
        (cost=0.69..676.11 rows=318 width=312) (actual time=0.040..0.655 rows=312 loops=1)
        Index Cond: (((target_kind)::text = 'lesson'::text) AND ((target_slug)::text = 'indexes'::text))
        Buffers: shared hit=318 read=4
Planning Time: 0.121 ms
Execution Time: 0.721 ms
```

Two equality columns, then the sort column: the index both finds the rows and delivers them in `created_at` order, so there is no `Sort` node and the `LIMIT` can stop early. Notice where the buffers go: about four index pages and one heap page per comment, because comments on one lesson were written over months and are scattered across the heap. The index is no longer the cost. The heap is.

## Covering indexes and index-only scans

If the index contains every column the query needs, Postgres can skip the heap. You add non-key columns with `INCLUDE`; they are stored in the leaf entries but are not part of the sort order, so they do not affect which queries can use the index.

```sql
CREATE INDEX orders_customer_recent_idx
  ON orders (customer_id, placed_at)
  INCLUDE (total_cents, status);

EXPLAIN (ANALYZE, BUFFERS)
SELECT placed_at, total_cents, status
FROM orders
WHERE customer_id = 42
ORDER BY placed_at DESC
LIMIT 20;
```

```text
Limit  (cost=0.56..5.12 rows=20 width=20) (actual time=0.028..0.041 rows=20 loops=1)
  Buffers: shared hit=4
  ->  Index Only Scan Backward using orders_customer_recent_idx on orders
        (cost=0.56..412.80 rows=1810 width=20) (actual time=0.027..0.037 rows=20 loops=1)
        Index Cond: (customer_id = 42)
        Heap Fetches: 0
        Buffers: shared hit=4
```

Four pages for twenty rows. The line to watch is `Heap Fetches`. The index does not store visibility information (which transaction created or deleted each version; see [MVCC and locking](/learn/databases/relational-fundamentals/mvcc-and-locking)), so Postgres can only trust an index entry without visiting the heap if the heap page is marked **all-visible** in the visibility map. Vacuum sets those bits. On a table with heavy update churn and lagging autovacuum you will see `Heap Fetches: 18000` and an "index-only" scan that is really an index scan with extra steps. The fix is vacuum tuning, not another index.

This is also why `SELECT *` matters. It forces a heap visit for every row, and an ORM that always selects every column never gets an index-only scan, whatever indexes you build.

## Expression and partial indexes

An index is on whatever you tell it to be on, not only on columns.

```sql
-- Case-insensitive login: the query must use the same expression.
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));
SELECT id FROM users WHERE lower(email) = lower($1);

-- Soft deletes: most queries only want live rows.
CREATE INDEX comments_live_target_idx
  ON comments (target_kind, target_slug, created_at)
  WHERE deleted_at IS NULL;
```

The planner uses a partial index only when it can prove the query's `WHERE` implies the index's predicate, which in practice means the query must contain the same condition literally. `WHERE deleted_at IS NULL` matches; a parameterised `WHERE deleted_at IS NOT DISTINCT FROM $1` does not.

A unique partial index is also a constraint tool: `CREATE UNIQUE INDEX ON subscriptions (user_id) WHERE status = 'active'` enforces "at most one active subscription per user", which no plain `UNIQUE` constraint can express.

## Beyond B-trees

B-trees handle equality, ranges, sorting and prefix matching on anything with a total order. Postgres ships other index types for data that does not fit that shape.

| Type | Structure | Supports | Use it for | Watch out for |
|---|---|---|---|---|
| B-tree | Balanced tree of sorted keys | `=`, `<`, `>`, `BETWEEN`, `ORDER BY`, `LIKE 'abc%'` | The default, 95% of indexes | Useless for `LIKE '%abc%'`, arrays, JSON containment |
| Hash | Hash buckets | `=` only | Very long keys (URLs) where only equality is needed | No ordering, no uniqueness constraints, rarely better than B-tree in practice |
| GIN | Inverted index: element → posting list of TIDs | `@>`, `?`, `&&`, full-text `@@`, trigram `LIKE '%abc%'` | `jsonb`, arrays, full-text search, `pg_trgm` | Slow writes: one row inserts many entries; uses a pending list (`fastupdate`) that searches must also scan |
| GiST | Balanced tree of bounding predicates | Overlap, containment, nearest-neighbour | Geometry (PostGIS), ranges, exclusion constraints | Lossy; rechecks against the heap |
| BRIN | Min/max summary per block range (128 pages by default) | Ranges on naturally ordered data | Append-only time-series or log tables, hundreds of GB | Worthless when correlation is low: every range overlaps the query |
| `bloom` (extension) | One Bloom-filter signature per row | `=` on any subset of many columns | Wide tables queried by arbitrary column combinations | Lossy; false positives rechecked; equality only |

BRIN deserves a number because it surprises people. A 500 GB `events` table ordered by insertion time needs a B-tree on `created_at` measured in tens of gigabytes. A BRIN index on the same column stores one min/max pair per 128 pages (1 MiB of table), so it is tens of megabytes, and a query for one day of data skips every block range whose max is before that day or whose min is after it. The catch is that it only works because `created_at` is correlated with physical position. Run a big `UPDATE` that scatters rows or backfill old data at the end of the table, and every range's min/max widens until BRIN excludes nothing.

The `bloom` extension is the lesser-known answer to "users filter on any combination of 12 columns". Twelve B-trees cost twelve index writes per insert and still cannot combine efficiently for every subset. One Bloom signature per row answers "definitely does not match" for most rows cheaply:

```viz
{"type": "system", "scenario": "bloom-filter", "keys": ["colour=red", "size=L", "brand=acme"],
 "title": "The idea behind a bloom index",
 "caption": "Each row's column values are hashed into a small bit signature. A query hashes its conditions the same way and skips every row whose signature lacks one of those bits. A match might be a false positive, so Postgres rechecks the heap row."}
```

## What every index costs

Reads get cheaper with each index. Writes get more expensive, and the bill is easy to miss because it is spread across every `INSERT` and `UPDATE` in the system.

**Every insert writes every index.** A row inserted into a table with eight indexes is one heap write plus eight index insertions, each of which may need to read a leaf page that is not in memory and each of which generates WAL. On a write-heavy table, the indexes are usually most of the write cost. Adding a ninth index to speed up one report makes every insert more expensive, forever.

**Updates may write every index too.** Because Postgres never updates a row in place, an `UPDATE` creates a new row version at a new TID, and every index needs an entry pointing to it. The escape hatch is the **heap-only tuple (HOT)** update: if no indexed column changed *and* the new version fits on the same heap page, Postgres chains the new version from the old one and skips all index writes. Two consequences follow. Indexing a column that is updated constantly (`last_seen_at`, `view_count`) disables HOT for every update that changes it. And leaving free space in pages (`ALTER TABLE ... SET (fillfactor = 90)`) makes HOT more likely on update-heavy tables.

```sql
-- How often do updates avoid index maintenance?
SELECT relname, n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / nullif(n_tup_upd, 0), 1) AS hot_pct
FROM pg_stat_user_tables
ORDER BY n_tup_upd DESC
LIMIT 10;

-- Indexes that have never been used since statistics were last reset.
SELECT indexrelid::regclass AS index, relid::regclass AS table,
       idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

An index with `idx_scan = 0` after a month of production traffic is costing write throughput, WAL volume, backup size, replica lag and buffer-pool space in exchange for nothing. Check replicas before dropping it (statistics are per server, and a read replica may be the one using it), then drop it.

**Building an index locks writes** unless you say otherwise. `CREATE INDEX` blocks inserts, updates and deletes on the table for the whole build. `CREATE INDEX CONCURRENTLY` does not, at the price of two table scans and a build that can fail and leave an `INVALID` index behind. [Schema migrations at scale](/learn/databases/data-modeling-and-evolution/schema-migrations-at-scale) covers the procedure.

## Designing an index for a query

Put it together into a procedure you can run in a design review:

1. Write down the query, including `ORDER BY` and `LIMIT`. Indexes serve queries, not columns.
2. Put equality-filtered columns first, in any order that lets other queries share the prefix.
3. Add at most one range column, or the `ORDER BY` column if the sort is what makes the query expensive.
4. If the query is hot and reads few columns, `INCLUDE` them to get an index-only scan.
5. If the query targets a small, well-defined subset (`status = 'pending'`, `deleted_at IS NULL`), make it partial.
6. Check it with `EXPLAIN (ANALYZE, BUFFERS)`, and look at buffers, not just the node names.
7. Look for an existing index this one makes redundant: `(a)` is redundant next to `(a, b)`.

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

- You design an index from the query (filter, sort and limit together), put equality columns before the range or sort column, and can explain the phone-book reason.
- You read `Buffers` rather than node names, and you know `Index Cond` listing a column does not mean that column bounded the scan.
- You expect the planner to ignore an index for unselective predicates, can do the random-versus-sequential page arithmetic, and reach for a partial index instead.
- You know an index-only scan depends on the visibility map, so `Heap Fetches` climbing is a vacuum problem.
- You count the write cost: every index on every insert, HOT updates lost when you index a hot column, and unused indexes found with `pg_stat_user_indexes` and dropped.
- You know when B-tree is the wrong structure (GIN for `jsonb`, arrays, full-text and trigram search; BRIN for huge append-only tables), and why BRIN stops working when physical order drifts.

## Check yourself

```quiz
- q: >-
    A table has 20 million rows. An index exists on status, and 40% of rows have status = 'complete'. The planner does a sequential scan for WHERE status = 'complete'. What is going on?
  options: ["The index is bloated from updates; REINDEX it and the planner will use it", "The planner is right; 8 million random heap reads cost more than a seq scan", "B-trees cannot serve equality on a text column; it needs a hash index", "Statistics are stale; run ANALYZE and the planner will switch over to the index"]
  answer: 1
  explanation: >-
    At 40% selectivity an index scan would do millions of random heap reads, each charged at random_page_cost, against one sequential pass of the table. Refreshing statistics would only confirm the estimate, and rebuilding the index would not change the arithmetic. If the query only needs the rare statuses, a partial index serves it.
- q: >-
    You have an index on (created_at, account_id). A hot query is WHERE account_id = $1 AND created_at > now() - interval '7 days'. EXPLAIN shows both columns under Index Cond, but the query reads 30,000 buffers to return 12 rows. Why, and what is the fix?
  options: ["Both columns are checked after the heap fetch; add INCLUDE (account_id) to the index", "Only the leading range column bounds the scan; reorder to (account_id, created_at)", "account_id is not selective enough to bound it; add a separate index on account_id", "The heap is not correlated with created_at; CLUSTER the table on that index"]
  answer: 1
  explanation: >-
    In a composite B-tree, scanning stops being bounded after the first range column. With created_at first, every entry from the last 7 days for every account is read and filtered, because one account's entries are scattered through a week of all accounts' entries. Equality first, then range, turns it into one contiguous slice. The buffers are index pages, not heap pages, so clustering the heap would not help.
- q: >-
    An index-only scan shows Heap Fetches: 45,000 for a 50,000-row result. What does that tell you?
  options: ["The query uses SELECT *, so every row is fetched from the heap regardless", "The index lacks an INCLUDE column, so each row's value comes from the heap", "Most heap pages are not all-visible, so vacuum is lagging on this table", "The planner picked the wrong index, so most rows were rechecked in the heap"]
  answer: 2
  explanation: >-
    Index entries carry no visibility information. Postgres can skip the heap only for pages the visibility map says are all-visible, and vacuum sets those bits. Recent heavy writes or lagging autovacuum turn an index-only scan back into heap visits. A missing INCLUDE column or SELECT * would prevent an index-only plan altogether, and this plan already is one.
- q: >-
    A users table is updated on every request to set last_seen_at. Someone adds an index on last_seen_at for an admin report. What is the most important side effect?
  options: ["None of note; an index only adds cost when a query actually reads it", "The index grows past memory, so each request's lookup by id misses cache", "Those updates lose HOT, so each one now writes to every index on the table", "The report's index scan will lock the table against those frequent updates"]
  answer: 2
  explanation: >-
    A HOT update requires that no indexed column changes. Indexing last_seen_at means the most frequent write in the system now inserts a new entry into every index on users, plus WAL and bloat. Indexes cost on every write, not only when read. The report would be better served by a periodically refreshed summary table or an analytics copy of the data.
- q: >-
    Which workload is the best fit for a BRIN index?
  options: ["Point lookups of users by email across a 50-million-row users table", "Range queries on created_at over a 2 TB table appended in time order", "Containment searches for a key across a large table of jsonb documents", "Filtering on a five-value status column that is updated very frequently"]
  answer: 1
  explanation: >-
    BRIN stores a min/max per block range and is tiny, but it only excludes ranges when physical order correlates with the column. Append-only time-ordered data is the ideal case. Email lookups need a B-tree, jsonb containment needs GIN, and a frequently updated low-cardinality column breaks correlation.
```
