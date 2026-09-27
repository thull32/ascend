---
slug: sql-and-query-plans
title: "SQL and query plans: how the optimiser turns your query into work"
description: Read an EXPLAIN plan like the executor does, understand the three join algorithms and their costs, and know why bad statistics produce a plan that is right on paper and 400 times too slow in production.
minutes: 32
difficulty: medium
tags: [sql, explain, query-planner, joins, statistics, postgres]
---
A query that ran in 8 ms yesterday takes 3.4 seconds today. Nobody deployed anything. The table grew past some threshold overnight, the planner's estimate crossed a cost boundary, and it switched from an index scan to a hash join over a sequential scan. The query is the same; the plan is not. If you cannot read the plan, you cannot explain the 400× regression, and you certainly cannot fix it.

SQL is declarative: you say *what*, and the optimiser decides *how*. This lesson is about the *how*, because in production the *how* is where the time goes.

## From SQL to a plan

Postgres processes a query in four stages:

1. **Parse** into a tree, resolve names against the catalogue.
2. **Rewrite** views and rules into the base tables.
3. **Plan**: enumerate ways to execute the query, estimate the cost of each using table statistics, pick the cheapest.
4. **Execute** the chosen plan tree, pulling rows from the root node, which pulls from its children (the *Volcano* or iterator model: every node implements `next()`).

The plan is a tree. Leaves read tables (`Seq Scan`, `Index Scan`, `Index Only Scan`, `Bitmap Heap Scan`); interior nodes combine or transform rows (`Nested Loop`, `Hash Join`, `Merge Join`, `Sort`, `Aggregate`, `Limit`). `EXPLAIN` prints that tree; `EXPLAIN (ANALYZE, BUFFERS)` runs the query and annotates each node with what actually happened.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.id, o.placed_at, u.display_name
FROM orders o
JOIN users u ON u.id = o.customer_id
WHERE o.placed_at >= now() - interval '1 day';
```

```text
Hash Join  (cost=35.50..4210.12 rows=18240 width=44) (actual time=0.412..21.903 rows=18102 loops=1)
  Hash Cond: (o.customer_id = u.id)
  Buffers: shared hit=1892
  ->  Index Scan using orders_placed_at_idx on orders o
        (cost=0.43..3990.10 rows=18240 width=24) (actual time=0.031..12.115 rows=18102 loops=1)
        Index Cond: (placed_at >= (now() - '1 day'::interval))
        Buffers: shared hit=1874
  ->  Hash  (cost=23.00..23.00 rows=1000 width=28) (actual time=0.360..0.361 rows=1000 loops=1)
        Buckets: 1024  Batches: 1  Memory Usage: 71kB
        ->  Seq Scan on users u  (cost=0.00..23.00 rows=1000 width=28) (actual time=0.008..0.181 rows=1000 loops=1)
              Buffers: shared hit=13
Planning Time: 0.280 ms
Execution Time: 22.610 ms
```

How to read one line: `cost=35.50..4210.12` is the planner's estimate in abstract units (startup cost before the first row, then total); `rows=18240` is the *estimated* row count; `actual time=0.412..21.903 rows=18102 loops=1` is what happened. The number you compare first is estimated `rows` against actual `rows`. Here 18,240 vs 18,102 means the statistics are good. When they differ by 100× or more, the plan was chosen on a fiction.

Indentation is execution order from the inside out: the `Seq Scan` on `users` runs first to build the hash, then the `Index Scan` on `orders` streams rows through the `Hash Join`. `loops=1` matters: for a node inside a nested loop, `actual time` and `rows` are *per loop*, and you multiply by `loops` to get the total.

## The three join algorithms

Every join between two inputs is executed by one of three algorithms. Which one the planner picks depends on input sizes, available indexes, sort order and memory. Knowing them is what lets you predict a plan before you run `EXPLAIN`.

### Nested loop

For each row of the outer input, scan the inner input for matches.

```python
for o in outer:
    for i in inner_lookup(o.key):   # a full scan, or an index probe
        emit(o, i)
```

Cost is `|outer| × cost(inner lookup)`. With no index on the inner side this is `O(n × m)` and catastrophic past a few thousand rows. With a B-tree index on the inner join key it becomes `O(n log m)`, and it is the *best* join when the outer side is small: 10 outer rows × 4 page reads each is 40 page reads, unbeatable. It is also the only join that can start returning rows immediately (no build phase), which is why it wins under `LIMIT 10`.

```text
Nested Loop  (cost=0.86..92.31 rows=10 width=44) (actual time=0.040..0.188 rows=10 loops=1)
  ->  Index Scan using orders_customer_id_idx on orders o  (rows=10 loops=1)
        Index Cond: (customer_id = 42)
  ->  Index Scan using users_pkey on users u  (rows=1 loops=10)
        Index Cond: (id = o.customer_id)
```

`loops=10` on the inner scan: one index probe per outer row.

### Hash join

Build a hash table on the smaller input keyed by the join column, then stream the larger input and probe.

```viz
{"type": "hash-table", "algorithm": "chaining", "buckets": 8, "title": "The build phase of a hash join", "caption": "The planner hashes every row of the smaller input (users, keyed by id) into buckets. The probe phase then streams orders and looks up customer_id in O(1) per row. Watch how collisions chain: a skewed join key (many rows with one value) makes some chains long and the probe side slow.",
 "operations": [["set","u:42","Ana"],["set","u:77","Raj"],["set","u:13","Lee"],["set","u:5","Kim"],["set","u:91","Ivy"],["get","u:42"],["get","u:77"],["get","u:42"],["get","u:13"]]}
```

Cost is `O(n + m)`: one pass to build, one pass to probe. It needs no indexes and no sort order, which is why it is the default for large joins on equality conditions. Its constraint is memory. The build side must fit in `work_mem` (default 4 MB, which is small); if it does not, Postgres partitions both inputs into `Batches` on disk and joins batch by batch. The line `Batches: 1` in the plan above is the healthy case; `Batches: 16` means temp file I/O and a query that got several times slower than its estimate.

The hash join cannot be used for inequality joins (`ON a.ts BETWEEN b.start AND b.end`), only for equality, and it must consume the entire build input before emitting its first row, which makes it a poor choice under `LIMIT`.

### Merge join

Sort both inputs by the join key (or use inputs that are already sorted, such as index scans), then walk them in lockstep like the merge step of merge sort.

```text
Merge Join  (cost=0.71..8123.40 rows=200000 width=44)
  Merge Cond: (o.customer_id = u.id)
  ->  Index Scan using orders_customer_id_idx on orders o
  ->  Index Scan using users_pkey on users u
```

Cost is `O(n + m)` if both are pre-sorted, `O(n log n + m log m)` if they must be sorted. It uses little memory and handles very large inputs gracefully, which is why it appears in analytical queries joining two huge tables on indexed columns. It also supports inequality conditions on the sort key. The planner picks it when both inputs arrive sorted for free or when the hash would not fit in memory.

| Join | Requires | Cost | Wins when | Loses when |
|---|---|---|---|---|
| Nested loop | Index on inner key (to be viable) | `n × log m` | Outer side small (< ~1000 rows); `LIMIT` queries | Outer side large and inner side unindexed |
| Hash join | Equality condition; memory for build side | `n + m` | Large inputs, no useful sort order | Build side exceeds `work_mem`; inequality joins |
| Merge join | Both inputs sorted on the key | `n + m` (+ sorts) | Both sides already sorted via index; huge inputs | Inputs unsorted and small enough to hash |

## Where the estimates come from

The planner has never seen your data; it has seen `pg_statistic`. `ANALYZE` samples each table (30,000 rows by default, scaled by `default_statistics_target = 100`) and stores per column:

- `n_distinct`: number of distinct values (negative values mean "a fraction of the row count").
- `null_frac`: fraction of nulls.
- `most_common_vals` / `most_common_freqs`: the top 100 values and their frequencies.
- `histogram_bounds`: equal-frequency buckets for the remaining values.
- `correlation`: how well physical row order matches column order, from -1 to 1. High correlation makes an index range scan cheap because it touches contiguous heap pages.

```sql
SELECT attname, n_distinct, null_frac, correlation,
       most_common_vals[1:3] AS top3
FROM pg_stats
WHERE tablename = 'orders';
```

Selectivity of `WHERE status = 'shipped'` is looked up directly from `most_common_freqs` if `shipped` is a common value. Selectivity of `WHERE placed_at > '2026-09-01'` is interpolated from the histogram. Selectivity of `WHERE customer_id = 42 AND status = 'shipped'` is, by default, the *product* of the two selectivities, which assumes the columns are independent.

That independence assumption is the most common source of catastrophic misestimates. Suppose 1% of orders are `cancelled` and 1% of orders come from `customer_id = 9`, but customer 9 is a bot that cancels everything. The planner estimates `0.01 × 0.01 = 0.0001` of rows, expects 30 rows from a 300-million-row table, and picks a nested loop. Actual: 3 million rows, and the nested loop runs for an hour. The fix is extended statistics:

```sql
CREATE STATISTICS orders_cust_status (dependencies, ndistinct)
  ON customer_id, status FROM orders;
ANALYZE orders;
```

The other classic misestimates:

- **Stale statistics** after a bulk load. Autovacuum triggers `ANALYZE` after roughly 10% of rows change (`autovacuum_analyze_scale_factor`), so a fresh 50-million-row table may have *no* statistics until autovacuum wakes up. Run `ANALYZE` explicitly after bulk loads.
- **Functions on columns.** `WHERE lower(email) = 'ana@example.com'` has no statistics for `lower(email)`, so the planner guesses a fixed selectivity (0.5% for equality) and cannot use the plain index on `email`. An expression index gives it both.
- **Parameters unknown at plan time.** A prepared statement planned generically before the value is known uses average selectivity. For a skewed column the generic plan is wrong for the common value. Postgres re-plans the first five executions with actual values and switches to a generic plan only if it is not worse; `plan_cache_mode = force_custom_plan` overrides that.
- **Correlated subqueries and `LIMIT`.** The planner assumes the rows it needs are spread uniformly, so `ORDER BY created_at LIMIT 10` with a `WHERE` that matches only old rows can walk almost the whole index expecting to stop early.

## Reading a bad plan

Here is the regression from the opening, before and after. Before:

```text
Nested Loop  (cost=0.86..2210.31 rows=32 width=44) (actual time=0.9..3401.2 rows=412907 loops=1)
  ->  Index Scan using orders_status_idx on orders o  (cost=0.43..118.2 rows=32 width=24) (actual time=0.03..812.1 rows=412907 loops=1)
        Index Cond: (status = 'pending')
  ->  Index Scan using users_pkey on users u  (cost=0.43..65.1 rows=1 width=28) (actual time=0.005..0.006 rows=1 loops=412907)
```

`rows=32` estimated, `rows=412907` actual. A failed batch job left 400,000 orders in `pending` yesterday, the statistics still say `pending` is 0.01% of rows, and the planner chose a nested loop that does 412,907 index probes. After `ANALYZE orders`:

```text
Hash Join  (cost=35.50..14230.8 rows=409800 width=44) (actual time=0.5..190.4 rows=412907 loops=1)
  Hash Cond: (o.customer_id = u.id)
  ->  Bitmap Heap Scan on orders o  (rows=409800 ...) (actual rows=412907)
        Recheck Cond: (status = 'pending')
        ->  Bitmap Index Scan on orders_status_idx  (rows=409800 ...)
  ->  Hash  (rows=1000 ...)
        ->  Seq Scan on users u
```

Same query, 18× faster, and the only thing that changed is the planner's knowledge. The `Bitmap Heap Scan` is the middle ground between an index scan and a sequential scan: it collects matching tuple IDs from the index into a bitmap sorted by page, then reads each heap page once in physical order. It appears when the index matches too many rows for random-access index scans to be efficient but too few for a full scan.

The workflow a senior engineer follows on any slow query:

1. `EXPLAIN (ANALYZE, BUFFERS)`. Never plain `EXPLAIN`; estimates without actuals cannot show you the misestimate.
2. Find the node where `actual time` is largest relative to its children. That is where the time goes.
3. Compare estimated and actual `rows` at that node and its inputs. A large gap means a statistics problem, not an index problem.
4. Check `Buffers: shared read=` vs `hit=`. A high `read` count means the working set is not in cache, which is a memory or data-layout problem.
5. Only then ask whether an index would change the plan. Adding an index to a query with a 1000× misestimate usually changes nothing, because the planner does not believe the index is worth using.

## Things the optimiser will not save you from

`SELECT *` pulls every column through every node and can prevent an [index-only scan](/learn/databases/relational-fundamentals/indexes). `OFFSET 100000` reads and discards 100,000 rows before returning ten; keyset pagination (`WHERE (placed_at, id) < ($1, $2) ORDER BY placed_at DESC, id DESC LIMIT 10`) reads ten. `NOT IN (subquery)` with a nullable column returns no rows if the subquery yields a single null, and the planner cannot rewrite it to an anti-join the way it can `NOT EXISTS`. `OR` across different columns defeats single-column indexes unless the planner can build a `BitmapOr`. Common table expressions were an optimisation fence before Postgres 12 and are now inlined unless you write `WITH x AS MATERIALIZED`. A function marked `VOLATILE` (the default for user-defined functions) is re-evaluated per row and blocks index use; mark pure functions `IMMUTABLE`.

The optimiser is very good at what it can see. Most "the optimiser is dumb" stories are actually "I hid the information from it".

## Senior signals

- You read `EXPLAIN (ANALYZE, BUFFERS)` from the inside out, compare estimated to actual rows first, and diagnose a statistics problem before proposing an index.
- You can predict the join algorithm from the input sizes: nested loop for small outer with indexed inner, hash for large equality joins, merge when both sides are already sorted.
- You know `work_mem` is per operation per query and that `Batches > 1` on a hash node means the join spilled to disk.
- You know the planner assumes column independence, can name the failure mode, and fix it with `CREATE STATISTICS`.
- You run `ANALYZE` after bulk loads without being asked, because autovacuum's threshold is a fraction of table size.
- You reach for keyset pagination and `NOT EXISTS`, and you know why `OFFSET` and `NOT IN` scale badly.

## Check yourself

```quiz
- q: >-
    A plan node shows estimated rows=40 and actual rows=2,100,000, and the query is 200 times slower than yesterday. What is the most likely root cause and the first fix?
  options: ["work_mem is too low; raise it so the join stops spilling", "Table growth; partition the table so each scan reads less", "Bad statistics; run ANALYZE, then check for correlated filter columns", "A missing index; add one on the column that this node filters on"]
  answer: 2
  explanation: >-
    A 50,000× gap between estimated and actual rows means the planner chose the plan on wrong information, from stale statistics or an independence assumption about correlated columns. An index cannot help until the estimate is realistic, because the planner will still believe the current plan is cheap. ANALYZE first, then extended statistics if two filtered columns are correlated.
- q: >-
    Which join algorithm can start returning rows before consuming either input in full, and why does that matter?
  options: ["Nested loop; it emits matches as it goes, which suits LIMIT queries", "None; every join reads one input fully, so LIMIT never helps", "Merge join; lockstep walking never needs a sort, which suits LIMIT", "Hash join; O(1) probes return a first match well before the build ends"]
  answer: 0
  explanation: >-
    A nested loop emits each match as soon as it finds it; a hash join must build the whole hash table before probing, and a merge join must sort any unsorted input first. Under a small LIMIT the planner strongly prefers a nested loop over an indexed inner side for exactly this reason.
- q: >-
    A hash join node shows Batches: 32 and the query takes 6 seconds instead of the estimated 300 ms. What happened?
  options: ["The hash function collided on most rows, so every probe became a scan", "Stale statistics made it pick a hash join over a nested loop", "The build side exceeded work_mem, so the join spilled to temp files", "The join key had too many distinct values to fit in the buckets"]
  answer: 2
  explanation: >-
    Batches greater than 1 means the hash table exceeded work_mem, so both inputs were partitioned to temporary files and joined batch by batch. Each extra batch adds a write and a read of temp files. Distinct-value count is not the issue; the size of the build side is. Raising work_mem for that session or reducing the build side (fewer columns, tighter filter) fixes it.
- q: >-
    Why does WHERE lower(email) = 'a@x.com' not use a plain B-tree index on email, and what is the fix?
  options: ["The index is ordered by email, not lower(email); index the expression", "lower() is VOLATILE and blocks index use; mark it IMMUTABLE", "It does use the index; EXPLAIN just hides it inside a recheck", "B-tree indexes on text are always case-sensitive; rewrite it using ILIKE"]
  answer: 0
  explanation: >-
    A B-tree on email is ordered by the raw value, which says nothing about lower(email). The planner also has no statistics for the expression and falls back to a default selectivity. An expression index on lower(email) (or a citext column) gives it both the order and the statistics. lower() is already immutable, so volatility is not the problem, and ILIKE cannot use a plain B-tree either.
- q: >-
    A dashboard query uses OFFSET 500000 LIMIT 20 and has become slow as the table grew. What is the mechanism and the fix?
  options: ["It reads and discards 500,000 rows per page; use keyset pagination", "OFFSET disables the planner's statistics; run ANALYZE on the table", "Each new OFFSET value is planned from scratch; use a prepared statement", "The LIMIT forces a sequential scan of the table; remove the LIMIT"]
  answer: 0
  explanation: >-
    OFFSET does not skip work; it performs it and throws the result away, so page N costs O(N). Keyset pagination uses the last row's sort key as a WHERE bound on an indexed (sort_key, id) pair, so each page is an index range scan of exactly the rows returned. Planning cost is negligible next to reading half a million rows.
```
