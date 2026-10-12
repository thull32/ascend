---
lesson: ride-sharing
source: b7effa77fb4ad8ad
---
## 1

Two riders are 18 metres apart. One is in the geohash cell 9q8yykx, and the other in 9q8yys8: the strings share only their first five characters. What does this show about geohash proximity search?

A, geohash distorts badly at this latitude, so switch to S2. B, points can straddle a cell edge, so search the 8 neighbouring cells too. C, geohash only supports exact-match lookups, not proximity. D, the precision is too high, so drop to 3 characters to merge them.

[think]

The answer is B: points can straddle a cell edge, so search the 8 neighbouring cells too.

A shared prefix implies proximity, but proximity does not imply a shared prefix. Points either side of a cell boundary diverge early in the string, so a query searches the cell and its eight neighbours. Dropping to 3 characters makes cells about 150 kilometres wide, and still has boundaries; latitude distortion is real, but it is not what this example shows.

## 2

1.5 million drivers send a position every 4 seconds. What is the most important conclusion from the estimate?

A, the positions need a sharded, disk-based database for storage. B, bandwidth is the bottleneck, at roughly 37.5 gigabytes a second of updates. C, the data must be replicated synchronously across regions. D, 375,000 writes a second over 150 megabytes of state, so keep it in memory.

[think]

The answer is D: 375,000 writes a second over 150 megabytes of state, so keep it in memory.

The state is tiny and the rate is huge. An in-memory index, kept as soft state and sharded for write rate rather than size, handles it, and rebuilds from the stream in seconds after a crash. The bandwidth is 37.5 megabytes a second, not gigabytes, and the data is worthless after a few seconds, so synchronous replication would be waste.

## 3

Two matcher threads both see driver 17 as available, and both run an update that sets the driver's state to offered, where the driver is 17 and the state is available. What happens?

A, the second blocks on the row lock, re-checks, and updates no rows. B, the one with the older index snapshot is rejected by version. C, both fail with a serialization error, and must retry the claim. D, both succeed, and the later offer replaces the earlier one.

[think]

The answer is A: the second blocks on the row lock, re-checks, and updates no rows.

The second update blocks on the first's row lock, and, after the first commits, re-evaluates its condition against the new row, which is now offered, so it matches nothing, and the matcher moves to the next candidate. Check and write are one statement, so there is no window between them, and no retry loop or version from the index is involved.

## 4

In the simulation, batched matching cut mean pickup time by 14 percent with 11 drivers for 10 riders, but only by 4.5 percent with 30 drivers. What should you conclude?

A, batching pays most when supply is tight, so tune the window per zone. B, the batch should grow until every rider gets the nearest driver. C, greedy matching is optimal once there are more drivers than riders. D, batching always pays, so every zone should batch requests.

[think]

The answer is A: batching pays most when supply is tight, so tune the window per zone.

With plentiful drivers, greedy choices rarely conflict, so the optimal assignment gains little, while the batch window still adds delay. With scarce supply, one greedy choice often steals the only good driver for the next rider. Greedy is not optimal even with surplus drivers, and no assignment guarantees each rider their individually nearest driver.

## 5

Postgres sustained 89,400 position updates a second with synchronous commit off, and its spatial index grew from 6.5 megabytes to 178 in 30 seconds. What does the growth show?

A, spatial indexes store every historical position by design. B, the index was rebuilt from scratch on every committed update. C, each update leaves a dead row version and index entry for vacuum. D, asynchronous commit turns off the page-level compression of the index.

[think]

The answer is C: each update leaves a dead row version and index entry for vacuum.

Under multi-version concurrency control, an update creates a new row version, and because the indexed column changed, it cannot skip the index, so each update also inserts a new index entry. The old versions and entries remain until vacuum removes them, and at this rate vacuum falls behind. That churn, not query speed, is why live positions do not belong in a relational table.

## 6

The matcher needs driving times from 14 nearby drivers to one pickup. What is the efficient way to get them from plain Dijkstra?

A, use straight-line distance, and skip the road graph. B, run Dijkstra once from each driver to the pickup. C, run Dijkstra from the pickup, on the reversed graph. D, run Floyd-Warshall once over the whole city graph.

[think]

The answer is C: run Dijkstra from the pickup, on the reversed graph.

One search from the pickup over reversed edges gives every driver's time to the pickup, and it can stop once all 14 are settled, about 2,000 nodes in the grid measurement. Fourteen separate searches cost fourteen times as much, Floyd-Warshall is cubic in a million nodes, and straight-line distance ranks the car across the river first.
