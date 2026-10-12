---
lesson: sql-and-query-plans
source: f8ecf032025e6b48
---
## 1

Inside a nested loop, a plan node estimated 1 row and produced 228 thousand. Yet the query takes only 636 milliseconds with everything cached. Why should you still fix it?

A, a misestimate stops autovacuum from analysing the table until it is fixed. B, the planner will keep this plan forever, even after the data changes again. C, the plan wins only while the pages stay cached; cold, its reads cost seconds. D, nested loops are never correct above a thousand outer rows, so the plan is invalid.

[think]

The answer is C: the plan only wins while the pages stay cached.

With every page cached, 1.77 million buffer hits cost about 0.3 microseconds each. The same plan issued about 59 thousand reads, which at roughly 0.1 milliseconds per cold NVMe read is several seconds, and worse on network storage. Fixing the estimate, with analyze or extended statistics, lets the planner choose on real sizes. Nested loops are fine for small outer inputs, and plans are recomputed as statistics change.

## 2

The planner chose a hash join costing about 3,400 over a nested loop costing about 6,200. But the loop ran in 5 milliseconds, against 14.7 for the hash join. What most plausibly explains it?

A, a random page cost of 4 overprices index probes on cached or SSD data. B, the statistics for users were stale, so the hash join looked cheaper. C, hash joins are always estimated wrongly when the build side is large. D, the nested loop only won because its 2,880 probes were served by the JIT.

[think]

The answer is A: a random page cost of 4 overprices index probes on cached data.

The loop's cost is dominated by 2,880 index probes, each charged as a random page read at 4.0. With the data in memory, those reads are nearly free, and setting the random page cost to 1.1 made the planner pick the nested loop itself. The estimates were accurate, so this is a cost-constant problem, not a statistics problem.

## 3

At 20 percent selectivity, on a column uncorrelated with the table's physical order, a forced index scan took 126 milliseconds, a bitmap scan 53, and a sequential scan 65. Why does the index scan lose?

A, it fetches a heap page for every matching row, about 400 thousand times. B, the index is larger than the table at this selectivity, so it reads more. C, it must sort the 400 thousand matches before returning any of them. D, index scans cannot use shared buffers, so every access goes to disk.

[think]

The answer is A: it fetches a heap page for every matching row.

With no correlation between index order and physical order, each match costs its own heap page access: about 400 thousand buffer accesses, for pages that the bitmap scan visits once each, in physical order. The sequential scan reads about 16,700 pages regardless. Index scans do use shared buffers, and they return rows in index order without sorting.

## 4

A query filters on country equals Japan and currency equals yen. The planner estimates 965 rows, but the query returns 10 thousand. What is wrong, and what fixes it?

A, the most-common-values list is stale; run vacuum full so analyze sees every row. B, both columns need a composite index before any estimate can be made. C, the histogram is too coarse; raise the statistics target on country. D, the planner assumed the columns are independent; create extended statistics.

[think]

The answer is D: it assumed the columns are independent, so create extended statistics.

The planner multiplied one tenth by one tenth, because it assumes columns are independent, but currency is determined by country. Creating extended statistics with dependencies and most-common values lets it know that, and the estimate became about 10,200. Indexes do not change row estimates, and neither a larger histogram nor a table rewrite captures a dependency between columns.

## 5

A query asks for the ten newest pending orders. It walks an index on the placed-at time, takes 185 milliseconds, and throws away nearly 2 million rows with a filter. The statistics correctly say 1 percent of orders are pending. What is the best fix?

A, index status and then placed-at together, so the scan starts at the pending rows. B, replace the limit with an offset of zero, so the planner stops expecting an early exit. C, run analyze, so the planner sees that 1 percent of the rows are pending. D, raise work mem, so the filter can be applied inside the index.

[think]

The answer is A: a composite index on status, then placed-at.

The count is right. What is wrong is the assumption that pending rows are spread evenly along placed-at, when they all sit at the old end. A composite index with status first makes the scan read only pending entries, in placed-at order: 5 buffers and 0.17 milliseconds. Analyze would only confirm the same 1 percent, and work mem has nothing to do with filtering during an index walk.

## 6

A hash join reports 16 batches and 163 megabytes of temporary file traffic, yet it is no slower than with work mem large enough for a single batch. What is the most likely reason?

A, the temporary files stayed in the operating system's page cache and never hit disk. B, batches only affect the probe side, which was already read from disk. C, the batches ran in parallel workers, hiding the extra disk cost. D, Postgres ignored work mem, because the hash memory multiplier overrode it.

[think]

The answer is A: the temporary files stayed in the page cache and never hit disk.

Temporary files are ordinary files. On a machine with plenty of free memory, they are written to and read back from the page cache. Under memory pressure, the same spill goes to disk and costs real time, so more than one batch is a signal to check temporary file traffic, not proof of a problem. Parallelism was disabled for the measurement, and the hash memory multiplier only raises the in-memory limit.
