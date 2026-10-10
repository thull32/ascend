---
lesson: sql-and-query-plans
source: bbf98c44219614d1
fit: partial
desk:
  - "The annotated EXPLAIN ANALYZE output, read node by node"
  - "The cost formulas: sequential scan by hand, and correlation squared"
  - "The access-path and join-algorithm tables, with forced plans"
  - "The pg_stats output and the work_mem spill table"
  - "Exercise: estimate rows from column statistics"
---
## Introduction

A job-runner dashboard asks for the ten newest pending orders. On Monday it takes a tenth of a millisecond. On Tuesday, after a failed batch leaves the backlog of pending orders stuck at the start of the table, it takes 185 milliseconds. Nobody deployed anything. The statistics still say 1 percent of orders are pending. And explain shows the same plan both days.

The query got 1,700 times slower because the plan rests on an assumption the data stopped satisfying. The only way to see which assumption is to read the plan the way the executor runs it.

SQL is declarative: you say what, and the optimiser decides how. Three ideas about the how. Where the planner's numbers come from. Which access paths and joins it can pick, and when each wins. And the handful of ways its estimates go wrong in production. Everything was measured on Postgres 17, with 2 million orders and the data in memory, and that last detail matters more than you would think.

## From SQL to a plan

Postgres parses your query, rewrites views into base tables, plans, and executes. The planning step enumerates every access path for each table, every join order and join algorithm, estimates the cost of each from statistics, and keeps the cheapest.

Execution is a tree of iterators. Each node implements one call: give me the next row. It pulls from its children, so rows stream upwards, and a limit node can stop the whole tree early. Hold onto that; it is half of the opening mystery.

Planning is not free. A four-table join planned in 2.7 milliseconds and executed in 0.2. For a query running 5,000 times a second, a prepared statement that reuses a cached plan saves more than any index. Postgres builds a custom plan with the real parameter values for the first five executions, then switches to a generic plan if that is not meaningfully worse.

## Reading a plan

Plain explain shows estimates. Explain with analyze and buffers runs the query and shows what actually happened. You read it from the innermost node outwards, because that is where work starts.

On every node, compare two numbers first: the rows the planner estimated, and the rows that actually came out. In the lesson's example it estimated about 19 thousand and got about 20 thousand. Healthy. A factor of 10 is suspicious. A factor of a thousand means the plan was chosen on fiction.

The second thing to read is buffers, not node names. Shared hit means the page was in Postgres's own cache. Read means it was requested from the operating system, which may still have served it from memory. An index scan that touches 487 thousand buffers to return 10 rows is not a good plan, whatever it is called.

The planner's costs are plain arithmetic you can reproduce. A sequential scan costs one unit per page, plus a little CPU per row and per filter. For the orders table that is 41,667 units, and explain prints exactly that. Index scans are priced between a best case, where matching rows sit on consecutive pages, and a worst case, where every row is a random page fetch. The blend is decided by the square of the column's correlation, meaning how closely index order matches the physical order of rows on disk. That one squared term explains most of the access-path choices you will see.

## Access paths

Three ways to read a table. A sequential scan reads every page once, in order. An index scan walks the index and fetches each matching row from the table. A bitmap scan walks the index first, marks every matching row in a bitmap in memory, then visits the table pages in physical order, each page once.

The measurements tell the story. On the order total, a column with no relation to insertion order, 1 percent of rows were spread over 70 percent of the table's pages. There, the plain index scan touches one page per row, and it loses to the bitmap scan once more than a few percent match. At 20 percent, the index scan took 126 milliseconds, the bitmap 53, and the sequential scan 65.

On the placed-at timestamp, inserted in time order with correlation of one, the index scan won even at half the table: 58 milliseconds against 74, because its page reads are sequential.

And the sequential scan barely moves: 53 to 74 milliseconds whatever the selectivity. It is the floor every other plan is compared against.

One memory note. The bitmap has to fit in work mem. Shrink that to 64 kilobytes and the bitmap degrades to one bit per page instead of per row, so Postgres has to recheck every row on those pages. The scan went from 30 milliseconds to 85.

## The three join algorithms

Every join is one of three algorithms, and knowing their costs lets you predict a plan before you run explain.

A nested loop takes each outer row and looks up its matches on the inner side. Catastrophic with no index on the inner side, excellent with a small outer side and an index probe. It produces its first row almost immediately, which is why it wins under a limit.

A hash join builds a hash table on the smaller input, then streams the larger one and probes. Linear, needs no index and no order, but only works for equality, and must read its whole build side before producing anything.

A merge join walks two sorted inputs in lockstep. Little memory, handles inputs bigger than memory, and is cheapest when both sides already arrive sorted from indexes. Like the hash join, it needs equality.

Now a surprise. The lesson forced each algorithm on two queries. One day's 2,880 orders joined to users: the nested loop took 5 milliseconds, the hash join almost 15. 20 thousand pending orders joined to 4 million order lines: nested loop 154 milliseconds, hash join 360. The planner picked the hash join both times. Before I explain: why would a correct cost model pick the slower plan?

[pause]

Because of one setting. Random page cost defaults to 4, pricing a random read at four times a sequential one. That default already assumes most random reads hit cache. Here every probe hit memory, so even 4 overpriced it. Set it to 1.1 and the planner picks the nested loops on both queries. On a server whose working set is cached or on fast SSDs, lowering it globally is a legitimate correction. On a table ten times bigger than memory, the default may be the honest one.

## Where estimates come from, and where they go wrong

The planner has never seen your data. Analyze samples 30 thousand rows by default and stores, per column, the null fraction, the number of distinct values, the most common values and their frequencies, a histogram of the rest, and the correlation. Pending is a common value with a frequency of about nine tenths of a percent, so the estimate is that frequency times 2 million: 18,133 rows, exactly what explain printed. Several conditions get their selectivities multiplied, which assumes the columns are independent.

That assumption is the first failure. Add a currency column to users, fully determined by country. For Japan and yen, the planner multiplies one tenth by one tenth and estimates 965 rows. There are 10 thousand. Extended statistics on the column pair fix it, and the estimate becomes about 10,200.

The second failure is stale statistics. With autovacuum off, 228 thousand orders were moved to a status the statistics had never seen. The planner estimated one row and built nested loops: 228 thousand probes into one index, then 228 thousand into another. Here is the honest part. That bad plan took 636 milliseconds, and the correct hash plan, after analyze, took 858, because every page was in memory. But the same loops also issued about 58 thousand reads. On a cold cache, at a tenth of a millisecond per read, that is six seconds. A misestimate is a bet that the working set is cached, and it loses when the data outgrows memory. Run analyze yourself after bulk loads, because autovacuum waits for 10 percent of the table to change.

The third failure is the opening story. The planner believes pending rows are spread uniformly, so walking the timestamp index backwards should find ten pending orders within about 1,100 entries. When they were spread evenly, it was 0.11 milliseconds. When the pending rows were the oldest 20 thousand, the same walk discarded nearly 2 million rows: 185 milliseconds. The statistics were right about how many, and wrong about where. The fix is an index on status and then placed-at, which answers the question directly: 5 buffers and 0.17 milliseconds, whatever the distribution.

And a fourth, quickly: filtering on lower of email has no statistics and cannot use an index on email. An expression index gives you both.

## Memory, pagination and the traps

Work mem, 4 megabytes by default, is a limit per sort or hash operation, per query, per parallel worker. Not per connection. A query with three hash joins and a sort can use four times it. When a hash join's build side does not fit, it splits into batches on disk. In the lab, a join spilled 163 megabytes across 16 batches and was not measurably slower, because the temp files landed in the operating system's cache on a machine with plenty of free memory. Treat batches as a warning, not a verdict, and raise work mem per session or role for known heavy queries rather than globally.

Some things the optimiser will not save you from. Offset pagination reads and throws away every earlier row: offset one million took 110 milliseconds for 20 rows. Keyset pagination, asking for rows before the last timestamp and ID you showed, on a matching index, read 10 buffers: 0.06 milliseconds. Not in against a nullable subquery returns nothing once one null appears. An or across two columns needs an index on each side. And volatile functions, the default for user-defined ones, are re-evaluated per row and block index use.

## In the interview

A follow-up the lesson expects. The estimate says one row, and the actual is 228 thousand. Is the query necessarily slow?

[pause]

Not if the probes hit cached pages; it was 636 milliseconds with everything in memory. But the plan is a bet on cache residency that fails once the data outgrows memory, so fix the estimate first, with analyze or extended statistics. The wrong answer is "add an index", which the planner will still misuse because it believes the input is one row.

And: how does order by with limit 10 become slower than the full query? The planner assumes matches are spread uniformly along the index and expects to stop early. When they cluster at the far end, it walks the whole index. An index leading with the filter column removes the assumption.

## Recap

Four things to remember. Read plans from the inside out, compare estimated rows with actual rows first, and measure work in buffers. Correlation squared decides between index, bitmap and sequential scans. The default random page cost can make the planner pick a hash join that is three times slower on cached data. And every misestimate is a bet that the data is in memory: stale statistics, correlated columns and clustered values under a limit all win on a laptop and lose in production.

At your desk: the annotated plan, the cost formulas, the access-path and join tables, the statistics and spill tables, and the row-estimation exercise.
