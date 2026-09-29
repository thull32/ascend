---
slug: sql-and-query-plans
title: "SQL and query plans: how the optimiser turns your query into work"
description: Read EXPLAIN (ANALYZE, BUFFERS) node by node, compute the planner's cost by hand, see seq, index and bitmap scans and all three join algorithms measured on the same data, and learn how statistics, correlation and LIMIT produce plans that are right on paper and 1,700 times too slow in production.
minutes: 35
difficulty: medium
tags: [sql, explain, query-planner, joins, statistics, postgres, cost-model]
---
The job-runner dashboard runs `SELECT id, placed_at FROM orders WHERE status = 'pending' ORDER BY placed_at DESC LIMIT 10`. On Monday it takes 0.11 ms. On Tuesday, after a failed batch leaves the backlog of pending orders stuck at the start of the table, it takes 185 ms. Nobody deployed anything, the statistics still say 1% of orders are pending, and `EXPLAIN` shows the same plan both days. The query is 1,700 times slower because the plan rests on an assumption the data stopped satisfying, and the only way to see which assumption is to read the plan the way the executor runs it.

SQL is declarative: you say what, and the optimiser decides how. This lesson is about the how, measured on PostgreSQL 17 with a lab schema of 100,000 users, 2 million orders (16,667 heap pages, 130 MB) and 4 million order lines. Every timing below is from that database with its data in memory, which matters for how you read them, as you will see.

## From SQL to a plan

Postgres handles a query in four stages:

1. **Parse** the text into a tree and resolve names against the catalogue.
2. **Rewrite** views and rules into references to base tables.
3. **Plan**: enumerate access paths for each table (sequential scan, each usable index, bitmap combinations), join orders and join algorithms; estimate each candidate's cost from statistics; keep the cheapest. With `geqo_threshold` (12) or more `FROM` items, exhaustive search is replaced by a genetic search. Explicit `JOIN`s are flattened into one reorderable list only while that list stays within `join_collapse_limit` (8) items; beyond that the written join structure constrains the order, and at a limit of 1 the written order is the executed order.
4. **Execute** the plan tree using the iterator (Volcano) model: each node implements "give me the next row" and pulls from its children, so rows stream upwards and a `Limit` node can stop the whole tree early.

Planning is not free. The four-table join in [the relational model](/learn/databases/relational-fundamentals/the-relational-model) plans in 2.66 ms and executes in 0.21 ms. For a query that runs 5,000 times a second, a prepared statement that reuses a cached plan saves more than any index. Postgres builds a **custom plan** with the actual parameter values for the first five executions of a prepared statement, then switches to a **generic plan** if its estimated cost is not meaningfully worse than the average custom plan; `plan_cache_mode = force_custom_plan` overrides that for skewed parameters.

## Reading EXPLAIN (ANALYZE, BUFFERS), node by node

Plain `EXPLAIN` shows estimates. `EXPLAIN (ANALYZE, BUFFERS)` runs the query and adds what happened. Here is a range filter on the uncorrelated column `total_cents`:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT sum(customer_id) FROM orders WHERE total_cents BETWEEN 1000 AND 1199;
```

```text
Aggregate  (cost=18105.23..18105.24 rows=1 width=32) (actual time=19.176..19.177 rows=1 loops=1)
  Buffers: shared hit=7959 read=3755
  ->  Bitmap Heap Scan on orders  (cost=267.62..18056.64 rows=19433 width=8) (actual time=2.063..18.455 rows=20146 loops=1)
        Recheck Cond: ((total_cents >= 1000) AND (total_cents <= 1199))
        Heap Blocks: exact=11694
        Buffers: shared hit=7959 read=3755
        ->  Bitmap Index Scan on orders_total_idx  (cost=0.00..262.76 rows=19433 width=0) (actual time=1.257..1.257 rows=20146 loops=1)
              Index Cond: ((total_cents >= 1000) AND (total_cents <= 1199))
              Buffers: shared read=20
Planning Time: 0.694 ms
Execution Time: 19.286 ms
```

Read it from the innermost node outwards, the order in which work starts:

1. **Bitmap Index Scan** walks `orders_total_idx` for the range and sets one bit per matching tuple in an in-memory bitmap: 20 index pages, 1.26 ms, 20,146 tuple IDs. It returns no rows (`width=0`), only the bitmap.
2. **Bitmap Heap Scan** visits the heap pages named in the bitmap in physical order, once each. `Heap Blocks: exact=11694` means 11,694 of the table's 16,667 pages held at least one match: 1% of the rows were spread over 70% of the pages, because `total_cents` has no relation to insertion order. `Recheck Cond` is the filter it would apply if the bitmap had become lossy (below).
3. **Aggregate** sums the 20,146 values.

On each line, `cost=267.62..18056.64` is the estimated startup and total cost in abstract units, `rows=19433` is the estimate, and `actual time=2.063..18.455 rows=20146 loops=1` is the measured time to the first and last row, the real row count and the number of times the node ran. For a node inside a nested loop, `actual time` and `rows` are per loop: multiply by `loops`. `Buffers: shared hit` counts pages found in Postgres's own buffer pool; `read` counts pages requested from the operating system, which may still have come from the OS page cache rather than the disk, as they did here.

The first comparison to make on any node is estimated rows against actual rows. 19,433 against 20,146 is healthy. A factor of 10 is suspicious; a factor of 1,000 means the plan was chosen on fiction.

## Under the hood: the cost model by hand

The planner's costs are arithmetic you can reproduce. The defaults are `seq_page_cost = 1.0`, `random_page_cost = 4.0`, `cpu_tuple_cost = 0.01`, `cpu_index_tuple_cost = 0.005` and `cpu_operator_cost = 0.0025`. A sequential scan costs one sequential page per page plus CPU per row and per filter operator:

$$\text{seq} = \text{relpages} \times 1.0 + \text{reltuples} \times 0.01 + \text{reltuples} \times 0.0025 \times \text{quals}$$

For `orders` (16,667 pages, 2,000,000 rows) with one filter that is 16,667 + 20,000 + 5,000 = **41,667**, exactly what `EXPLAIN SELECT * FROM orders WHERE total_cents > 20000` prints; without a filter it prints 36,667.

An index scan's I/O cost is an interpolation. `costsize.c` computes a worst case, where every matching row costs a random page fetch (with a cache model, the Mackert–Lohman formula, that accounts for `effective_cache_size`), and a best case, where matching rows are packed into `selectivity × relpages` consecutive pages read sequentially after one random seek. It then blends them by the square of the column's **correlation** between index order and physical order:

$$\text{io} = \text{max\_io} + \text{corr}^2 \times (\text{min\_io} - \text{max\_io})$$

With correlation 1.0 (`placed_at`, inserted in time order) the index scan is priced at its best case; with 0.004 (`total_cents`) it is priced at its worst case. The bitmap heap scan sits between: it reads each page once in physical order, priced between sequential and random depending on how many pages it touches. That single squared term explains most of the access-path choices below.

## Access paths, measured

Same table, same filter shapes, the planner's choice against each path forced with `enable_seqscan`, `enable_indexscan` and `enable_bitmapscan` (times in ms, data in memory):

| Column (correlation) | Rows matched | Planner chose | Index scan | Bitmap scan | Seq scan |
|---|---|---|---|---|---|
| `total_cents` (−0.004) | 199 (0.01%) | bitmap | 0.40 | 0.60 | 53 |
| `total_cents` | about 2,000 (0.1%) | bitmap | 2.7 | 3.1 | 54 |
| `total_cents` | 20,146 (1%) | bitmap | 12.1 | 12.7 | 54 |
| `total_cents` | 100,314 (5%) | bitmap | 36.0 | 27.9 | 57 |
| `total_cents` | about 400,000 (20%) | bitmap | 126 | 53 | 65 |
| `placed_at` (1.0) | 200 | index | 0.10 | | 55 |
| `placed_at` | 200,000 (10%) | index | 12.7 | | 59 |
| `placed_at` | 1,000,000 (50%) | index | 58 | | 74 |

Three lessons fall out. On an uncorrelated column the plain index scan touches one heap page per row (399,667 buffer accesses at 20%) and loses to both alternatives once more than a few per cent match; the bitmap scan dominates the middle because it deduplicates pages and reads them in order. On a perfectly correlated column the index scan wins even at 50%, because its heap reads are sequential. And the sequential scan's cost barely moves (53 to 74 ms) regardless of selectivity: it is the floor every other plan is compared against.

The bitmap has a memory limit. With `work_mem` lowered to 64 kB, the 100,314-row bitmap no longer fits, so Postgres degrades it to one bit per *page*: `Heap Blocks: exact=605 lossy=16032` and `Rows Removed by Index Recheck: 1825496`, 85 ms instead of 30. The planner knows this, which is why at 64 kB it chose the sequential scan (57 ms) unless forced.

## The three join algorithms

Every join is executed by one of three algorithms. Knowing their costs lets you predict a plan before running `EXPLAIN`.

**Nested loop.** For each outer row, look up matching inner rows. Cost is |outer| × cost(inner lookup): catastrophic with an unindexed inner side, excellent with a small outer side and an index probe on the inner. It emits its first row after one outer row and one probe, without consuming either input, which is why it wins under `LIMIT`; a hash join must first read its whole build side, and a merge join must sort unless both inputs arrive ordered from indexes. A `Materialize` node above the inner side caches it when it is rescanned.

**Hash join.** Build a hash table on the smaller input keyed by the join column, then stream the larger input and probe. Cost is O(n + m) and it needs no index or order, but only works for equality, and the whole build side must be consumed before the first output row. The hash table may use `work_mem × hash_mem_multiplier` (4 MB × 2 by default since Postgres 15); beyond that it splits both inputs into `Batches` on disk.

```viz
{"type": "hash-table", "algorithm": "chaining", "buckets": 8, "title": "The build phase of a hash join", "caption": "The planner hashes every row of the smaller input (users, keyed by id) into buckets. The probe phase then streams orders and looks up customer_id in O(1) per row. Watch how collisions chain: a skewed join key (many rows with one value) makes some chains long and the probe side slow.",
 "operations": [["set","u:42","Ana"],["set","u:77","Raj"],["set","u:13","Lee"],["set","u:5","Kim"],["set","u:91","Ivy"],["get","u:42"],["get","u:77"],["get","u:42"],["get","u:13"]]}
```

**Merge join.** Sort both inputs on the key (or read them in order from indexes) and walk them in lockstep. O(n + m) when pre-sorted, little memory, and handles inputs far larger than memory. Like a hash join it needs an equality condition: Postgres merge-joins only on operators marked `MERGES`, and the [operator documentation](https://www.postgresql.org/docs/17/xoper-optimization.html) says such an operator must in practice represent equality. Any inequality in the `ON` clause is applied as a filter on the joined pairs.

Here are all three on the same two queries, each forced by disabling the other two:

| Query | Hash join | Nested loop | Merge join | Planner's pick at `random_page_cost = 4` |
|---|---|---|---|---|
| 2,880 orders from one day ⋈ 100,000 users | 14.7 ms (13 ms is building the 100,000-row hash) | 5.0 ms (2,880 primary-key probes) | 10.1 ms (sort 2,880, walk the users index) | Hash, cost 3,403 against 6,209 for the loop |
| 19,915 pending orders ⋈ 4 million order lines | 360 ms (seq scan of all 4M lines) | 154 ms (19,915 probes of `order_lines_pkey`) | 648 ms (full index walk of order lines) | Hash, cost 121,071 against 200,993 |

The planner picked the slower plan twice, and the reason is instructive. Its default `random_page_cost = 4` prices a random page read at four times a sequential one. The [documentation](https://www.postgresql.org/docs/17/runtime-config-query.html) explains that uncached random access to storage is normally much more expensive than that, and that 4.0 is already lowered on the assumption that most random reads hit cache; it suggests a lower value when the data is likely to be entirely cached. Here every probe was a buffer hit, so even 4 overpriced it. Set `random_page_cost = 1.1` and the planner chooses the nested loops on both queries: 8.0 ms and 166 ms. On a server whose working set is cached or on fast SSDs, lowering `random_page_cost` globally (not per query) is a legitimate correction; on a table ten times larger than memory, the default may be the honest one.

| Join | Requires | Cost | Memory | Wins when | Loses when |
|---|---|---|---|---|---|
| Nested loop | Index on the inner key to be viable | outer × log(inner) | Constant | Small outer side; `LIMIT`; selective index probes | Large outer side with an unindexed inner |
| Hash | Equality condition | outer + inner | Build side, up to `work_mem × hash_mem_multiplier` | Large unsorted equality joins | Build side vastly exceeds memory; inequality; `LIMIT` |
| Merge | Equality condition; both inputs sorted on the key | outer + inner (+ sorts) | Small, unless sorting | Both sides arrive sorted from indexes; huge inputs; output wanted in key order | Unsorted inputs small enough to hash |

## Where the estimates come from

The planner has never seen your data; it has seen `pg_statistic`. `ANALYZE` samples 300 × `default_statistics_target` rows (30,000 by default) and stores per column the fraction of nulls, the number of distinct values (`n_distinct`, negative meaning a fraction of the row count), the most common values and their frequencies (MCVs, up to 100), an equal-frequency histogram of the rest, and the correlation. For the lab `orders`:

```text
   attname   | n_distinct | corr   | most_common_vals                 | most_common_freqs
-------------+------------+--------+----------------------------------+------------------------------------------
 customer_id |      94790 |  0.002 |                                  |
 placed_at   |         -1 |  1.000 |                                  |
 status      |          4 |  0.642 | {shipped,paid,cancelled,pending} | {0.7932,0.1086,0.0891,0.0090666665}
 total_cents |      19925 | -0.004 | {1680,1957,...}                  | {0.00027,...}
```

Estimates follow mechanically:

- **Equality on an MCV**: `status = 'pending'` → 0.0090666665 × 2,000,000 = **18,133**, exactly the `rows=18133` that `EXPLAIN` printed.
- **Equality on a non-MCV value**: the frequency left over after the MCVs and nulls, divided evenly among the remaining distinct values.
- **Range**: MCVs below the bound, plus a linear interpolation within the histogram bucket that contains the bound, scaled by the non-MCV fraction.
- **Several conditions**: the product of their selectivities, which assumes the columns are **independent**.

`n_distinct` for `customer_id` is 94,790 against a true value near 100,000: sampling 30,000 of 2 million rows underestimates distinct counts, which is tolerable here and badly wrong on heavily skewed columns, where you can raise `ALTER TABLE ... ALTER COLUMN ... SET STATISTICS 1000` or override `n_distinct`.

## When estimates go wrong

**Correlated columns.** Add `users.currency`, fully determined by `country`. For `WHERE country = 'JP' AND currency = 'JPY'` the planner multiplies 0.1 by 0.1 and estimates **965** rows; there are **10,000**. For `country = 'DE' AND currency = 'EUR'` it estimates 2,968. Extended statistics fix it:

```sql
CREATE STATISTICS users_country_currency (dependencies, ndistinct, mcv)
  ON country, currency FROM users;
ANALYZE users;
-- estimates now 10,193 and 10,387; pg_stats_ext shows {"country => currency": 1.0, "currency => country": 0.696}
```

**Stale statistics.** With autovacuum disabled on `orders`, 228,338 orders were moved to a new status `on_hold`. The statistics had never seen that value, so the planner estimated **1** row and built three nested loops: 228,338 probes of `users_pkey`, then 228,338 probes of `order_lines_pkey`, 1.77 million buffer hits. After `ANALYZE` it estimated 230,200 and chose two hash joins. The honest result: the nested-loop plan took 636 ms and the "correct" hash plan 858 ms, because every page the loops touched was in memory at about 0.3 µs a hit. The same nested loops also issued 58,632 reads; on a cold cache at roughly 0.1 ms per NVMe read that is six seconds, and on network storage much more. A misestimate is a bet that the working set is cached, and it loses when the data outgrows memory. Autovacuum re-analyses a table after `autovacuum_analyze_threshold + autovacuum_analyze_scale_factor × rows` changes (50 + 10%), so run `ANALYZE` yourself after bulk loads and bulk updates.

**LIMIT over a non-uniform distribution.** The opening regression. The planner estimates 1% of rows are pending and assumes they are spread uniformly, so walking `orders_placed_at_idx` backwards should find 10 within about 1,100 entries: cost 62. With pending rows spread evenly, it removed 891 rows and finished in 0.11 ms. When the pending rows were the oldest 20,000, the same walk removed 1,980,000 rows and touched 487,401 buffers: 185 ms. The statistics were right about *how many* and wrong about *where*. The fix is an index that answers the question directly: on `(status, placed_at)` the query is an index scan backwards over the pending entries, 5 buffers and 0.17 ms, whatever the distribution.

**Hidden expressions.** `WHERE lower(email) = $1` has no statistics for `lower(email)`, so the planner falls back to a default selectivity (0.5% for equality) and cannot use an index on `email`. An expression index provides both the order and, after `ANALYZE`, statistics.

## Memory: work_mem and spills

`work_mem` (4 MB by default) is a limit per sort or hash operation, per query, per parallel worker, not per connection. A query with three hash joins and a sort can use four times it. When a hash join's build side exceeds the limit, the plan says so:

| `work_mem` | Hash node | Temp I/O | Execution |
|---|---|---|---|
| 4 MB | `Batches: 16  Memory Usage: 5164kB` | 20,907 blocks written and read (163 MB) | 1.04–1.17 s |
| 16 MB | `Batches: 4  Memory Usage: 20682kB` | 16,713 blocks | 1.16 s |
| 128 MB | `Batches: 1  Memory Usage: 66312kB` | none | 1.19–1.22 s |

That join (1 million orders against 4 million lines) spilled 163 MB and was not measurably slower, because the temp files landed in the OS page cache of a machine with 26 GB free. `Batches: 16` is a warning to check, not a verdict: on a busy server under memory pressure the same spill goes to disk. Raise `work_mem` per session or per role for known heavy queries rather than globally, because the global value multiplies across every connection.

## Things the optimiser will not save you from

- **`OFFSET` pagination.** `ORDER BY placed_at DESC, id DESC OFFSET 1000000 LIMIT 20` read 1,000,020 index entries and 242,626 buffers: 110 ms for 20 rows. Keyset pagination, `WHERE (placed_at, id) < ($1, $2) ORDER BY placed_at DESC, id DESC LIMIT 20` on an index over `(placed_at, id)`, read 10 buffers: 0.06 ms.
- **`NOT IN` with a nullable subquery.** One `NULL` makes it return nothing, and the planner cannot turn it into an anti-join the way it can `NOT EXISTS`.
- **`OR` across columns.** Each side needs its own index and a `BitmapOr`; otherwise it is a sequential scan.
- **CTEs before Postgres 12** were optimisation fences; since 12 a non-recursive, side-effect-free CTE referenced once is inlined into the outer query unless written `WITH x AS MATERIALIZED`. One referenced twice is still computed once and scanned twice, unless you write `NOT MATERIALIZED`.
- **`VOLATILE` functions** (the default for user-defined functions) are re-evaluated per row and block index use; mark pure functions `IMMUTABLE`.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A stable query becomes 100–1,000× slower with no deploy | `EXPLAIN (ANALYZE, BUFFERS)` shows estimate against actual off by orders of magnitude at one node, or a `Limit` over a filter removing millions of rows | `ANALYZE`; extended statistics for correlated filters; an index that encodes the filter and the order |
| Latency rises as the table grows past memory while plans look unchanged | `read` climbs relative to `hit`; nested loops doing hundreds of thousands of probes that used to be cached | Reduce random probes (hash or merge joins, covering indexes), or add memory; re-check `random_page_cost` for the new storage |
| One parameter value is slow through the app but fast in psql | A generic prepared-statement plan tuned for average selectivity meets a skewed value | Compare `EXPLAIN (ANALYZE) EXECUTE` against a literal; `plan_cache_mode = force_custom_plan` for that statement |
| Queries slow down and temp files appear in the logs | `Batches > 1` or `Sort Method: external merge`; `log_temp_files = 0` shows sizes | Raise `work_mem` for that role or session; shrink the build side (fewer columns, tighter filter) |
| Deep pages of a listing time out | `OFFSET` reads and discards every earlier row | Keyset pagination on an index matching the `ORDER BY` |

## Interviewer follow-ups

**"The estimate says 1 row and the actual is 228,000. Is the query necessarily slow?"** Model answer: not if the probes hit cached pages (636 ms measured with everything in memory), but the plan is a bet on cache residency that fails once the data outgrows RAM; fix the estimate first with `ANALYZE` or extended statistics. Common wrong answer: "add an index", which the planner will still misuse because it believes the input is one row.

**"Why would the planner choose a hash join when a nested loop is three times faster?"** Model answer: `random_page_cost = 4` overprices index probes on cached or SSD-backed data; with 1.1 it picks the nested loop. Common wrong answer: "the planner is dumb", when its arithmetic was consistent with the costs it was given.

**"When is a bitmap heap scan better than an index scan?"** Model answer: when matches are numerous and scattered: the bitmap visits each heap page once in physical order instead of once per row, 53 ms against 126 ms at 20% selectivity on an uncorrelated column; it loses order, so it cannot serve `ORDER BY ... LIMIT`. Common wrong answer: "bitmap scans are for bitmap indexes", which Postgres does not have.

**"How does `ORDER BY ... LIMIT 10` become slower than the full query?"** Model answer: the planner assumes filter matches are spread uniformly along the index order and expects to stop early; when matches cluster at the far end it walks the whole index. An index leading with the filter column removes the assumption. Common wrong answer: "`LIMIT` always makes queries faster".

## What mid-level engineers get wrong

- **Running plain `EXPLAIN`.** Without `ANALYZE` there are no actual rows, so the misestimate that explains the regression is invisible.
- **Reading node names instead of rows and buffers.** An `Index Scan` that touches 487,000 buffers to return 10 rows is not a good plan.
- **Treating `work_mem` as a per-connection budget.** It is per operation and multiplies across joins, sorts and connections.
- **Forgetting `ANALYZE` after bulk loads.** Autovacuum waits for 10% of the table to change.
- **Benchmarking on a warm laptop and extrapolating to production.** Cached pages hide exactly the random-I/O cost that misestimates create.
- **Using `OFFSET` for deep pagination.** It scales with the page number.

## Exercise

The planner's row estimates come from a few lines of arithmetic over `pg_stats`. Implement them.

```exercise
id: estimate-rows
title: Estimate rows from column statistics
prompt: |
  Implement `estimate_rows(stats, op, value)` the way the planner estimates a
  single-column filter. `stats` has:
  - `rows`: the table's row count
  - `null_frac`: fraction of rows where the column is null
  - `n_distinct`: number of distinct non-null values
  - `mcv`: list of `[value, frequency]` (most common values)
  - `histogram`: sorted bounds `[b0, b1, ..., bk]` describing the non-null,
    non-MCV values as `k` buckets, each holding an equal share of them
    (may be empty)

  Let `rest = 1 - null_frac - (sum of MCV frequencies)`.

  For `op == "="`: if `value` is an MCV, selectivity is its frequency.
  Otherwise it is `rest / (n_distinct - len(mcv))`, or 0 when that
  denominator is not positive.

  For `op == "<"`: selectivity is the sum of frequencies of MCVs strictly
  less than `value`, plus `rest * f`, where `f` is the histogram fraction
  below `value`: 0 if the histogram is empty or `value <= b0`; 1 if
  `value >= bk`; otherwise find the largest `i` with `b_i <= value` and use
  `f = (i + (value - b_i) / (b_(i+1) - b_i)) / k`.

  Return `round(selectivity * rows)` as an integer.
languages: [python, javascript]
entry: estimate_rows
starter:
  python: |
    def estimate_rows(stats, op, value):
        return 0
  javascript: |
    function estimate_rows(stats, op, value) {
      return 0;
    }
tests:
  - args: [{"rows": 2000000, "null_frac": 0, "n_distinct": 4, "mcv": [["shipped", 0.8], ["paid", 0.1], ["cancelled", 0.09], ["pending", 0.01]], "histogram": []}, "=", "pending"]
    expected: 20000
    label: equality on a most common value
  - args: [{"rows": 1000000, "null_frac": 0.1, "n_distinct": 1000, "mcv": [[1, 0.2], [2, 0.1]], "histogram": [3, 500, 1000]}, "=", 77]
    expected: 601
    label: equality on a value outside the MCV list
  - args: [{"rows": 1000000, "null_frac": 0, "n_distinct": 20000, "mcv": [], "histogram": [0, 100, 200, 300, 400]}, "<", 150]
    expected: 375000
    label: interpolate inside the second bucket
  - args: [{"rows": 1000000, "null_frac": 0, "n_distinct": 20000, "mcv": [], "histogram": [0, 100, 200, 300, 400]}, "<", -5]
    expected: 0
    label: below the histogram
  - args: [{"rows": 1000, "null_frac": 0.2, "n_distinct": 50, "mcv": [[5, 0.3]], "histogram": [10, 20]}, "<", 25]
    expected: 800
    label: above the histogram, nulls excluded
  - args: [{"rows": 10000, "null_frac": 0, "n_distinct": 100, "mcv": [[10, 0.25], [50, 0.25]], "histogram": [0, 20, 40, 60, 80]}, "<", 30]
    expected: 4375
    hidden: true
    label: MCVs on both sides of the bound
  - args: [{"rows": 500, "null_frac": 0, "n_distinct": 2, "mcv": [[1, 0.5], [2, 0.5]], "histogram": []}, "=", 3]
    expected: 0
    hidden: true
    label: every distinct value is an MCV
  - args: [{"rows": 200, "null_frac": 0, "n_distinct": 30, "mcv": [], "histogram": [0, 10, 20]}, "<", 10]
    expected: 100
    hidden: true
    label: bound exactly on a bucket edge
hints:
  - "Compute `rest` once; both operators use it."
  - "For the histogram, `k = len(histogram) - 1`; scan for the last bound that is less than or equal to `value`."
```

## Senior signals

- You read `EXPLAIN (ANALYZE, BUFFERS)` from the innermost node out, compare estimated with actual rows first, and treat buffers, not node names, as the measure of work.
- You can compute a sequential scan's cost by hand and explain why correlation squared decides between index, bitmap and sequential scans.
- You predict the join algorithm from input sizes and indexes, and you know `random_page_cost = 4` can make the planner pick a hash join that is three times slower on cached data.
- You diagnose misestimates by kind: stale statistics, correlated columns, non-uniform distributions under `LIMIT`, hidden expressions, generic plans; and you fix each with the matching tool.
- You treat a misestimate as a bet on cache residency, which is why a plan can be fine on a laptop and fall over in production.
- You know `work_mem` is per operation, read `Batches` and `lossy` as memory signals, and paginate with keysets.

## Check yourself

```quiz
- q: >-
    A node shows rows=1 estimated and rows=228,338 actual inside a nested loop, yet the query is only 636 ms with everything cached. Why should you still fix it?
  options: ["A misestimate stops autovacuum from analysing the table until it is fixed", "The planner will keep this plan forever, even after the data changes again", "The plan wins only while pages stay cached; cold, its reads cost seconds", "Nested loops are never correct above 1,000 outer rows, so the plan is invalid"]
  answer: 2
  explanation: >-
    With every page cached, 1.77 million buffer hits cost about 0.3 microseconds each. The same plan issued 58,632 reads, which at roughly 0.1 ms per cold NVMe read is several seconds, and worse on network storage. Fixing the estimate with ANALYZE or extended statistics lets the planner choose on real sizes. Nested loops are fine for small outer inputs, and plans are recomputed as statistics change.
- q: >-
    The planner chose a hash join costing 3,403 over a nested loop costing 6,209, but the loop ran in 5 ms against 14.7 ms. What most plausibly explains it?
  options: ["random_page_cost = 4 overprices index probes on cached or SSD data", "The statistics for users were stale, so the hash join looked cheaper", "Hash joins are always estimated wrongly when the build side is large", "The nested loop only won because its 2,880 probes were served by JIT"]
  answer: 0
  explanation: >-
    The loop's cost is dominated by 2,880 index probes charged as random page reads at 4.0 each. With the data in memory those reads are nearly free, and setting random_page_cost to 1.1 made the planner pick the nested loop itself. The estimates were accurate, so this is a cost-constant problem, not a statistics problem.
- q: >-
    At 20% selectivity on an uncorrelated column, a forced index scan took 126 ms, a bitmap scan 53 ms and a sequential scan 65 ms. Why does the index scan lose?
  options: ["It fetches a heap page per matching row, about 400,000 times", "The index is larger than the table at this selectivity, so it reads more", "It must sort the 400,000 matches before returning any of them", "Index scans cannot use shared buffers, so every access goes to disk"]
  answer: 0
  explanation: >-
    With no correlation between index order and physical order, each match costs its own heap page access, about 400,000 buffer accesses for pages that the bitmap scan visits once each in physical order. The sequential scan reads 16,667 pages regardless. Index scans do use shared buffers, and they return rows in index order without sorting.
- q: >-
    WHERE country = 'JP' AND currency = 'JPY' is estimated at 965 rows but returns 10,000. What is wrong and what fixes it?
  options: ["The MCV list is stale; run VACUUM FULL so ANALYZE sees every row", "Both columns need a composite index before any estimate can be made", "The histogram is too coarse; raise the statistics target on country", "It assumed the columns independent; create extended statistics"]
  answer: 3
  explanation: >-
    The planner multiplied 0.1 by 0.1 because it assumes the columns are independent, but currency is determined by country. CREATE STATISTICS with dependencies and mcv lets it know that, and the estimate became 10,193. Indexes do not change row estimates, and neither a larger histogram nor a table rewrite captures a cross-column dependency.
- q: >-
    WHERE status = 'pending' ORDER BY placed_at DESC LIMIT 10 walks an index on placed_at and takes 185 ms, removing 1,980,000 rows by filter. The statistics correctly say 1% are pending. What is the best fix?
  options: ["Index (status, placed_at) so the scan starts at the pending rows", "Replace LIMIT with OFFSET 0 so the planner stops expecting early exit", "Run ANALYZE so the planner sees that 1% of the rows are pending", "Raise work_mem so the filter can be applied inside the index"]
  answer: 0
  explanation: >-
    The count is right; the assumption that pending rows are spread evenly along placed_at is wrong, because they all sit at the old end. A composite index with status first makes the scan read only pending entries in placed_at order: 5 buffers and 0.17 ms. ANALYZE would confirm the same 1%, and work_mem has nothing to do with filtering during an index walk.
- q: >-
    A hash join shows Batches: 16 and 163 MB of temp I/O, yet it is no slower than with work_mem large enough for one batch. What is the most likely reason?
  options: ["The temp files stayed in the OS page cache and never hit disk", "Batches only affect the probe side, which was already read from disk", "The batches ran in parallel workers, hiding the extra I/O cost", "Postgres ignored work_mem because hash_mem_multiplier overrode it"]
  answer: 0
  explanation: >-
    Temp files are ordinary files; on a machine with plenty of free memory they are written to and read back from the page cache. Under memory pressure the same spill goes to disk and costs real time, so Batches greater than 1 is a signal to check temp I/O, not proof of a problem. Parallelism was disabled for the measurement, and hash_mem_multiplier only raises the in-memory limit.
```
