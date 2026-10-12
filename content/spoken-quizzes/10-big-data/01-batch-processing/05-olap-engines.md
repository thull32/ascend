---
lesson: olap-engines
source: 70ae491152616501
---
## 1

A ClickHouse table is ordered by title id, then country, then event date. Which query benefits least from the sparse primary index?

A, title id equals 42 and device is TV. B, device is TV and app version is 5.2. C, title id is 42 or 43, and country is BR. D, title id equals 42 and country is BR.

[think]

The answer is B: device is TV and app version is 5.2.

The sparse index is sorted by the ordering key, so it can narrow granules only for filters on a prefix of that key. Neither device nor app version is in the key at all, so every granule must be read unless a data-skipping index or a projection covers it. Option A also filters on device, but its title id prefix still narrows the granules.

## 2

Why does vectorised execution outperform the row-at-a-time iterator model on analytical queries?

A, it skips reading the columns the query does not need. B, it pays call overhead per batch, in loops that suit SIMD instructions. C, it needs less memory per row than the iterator model. D, it caches query results between repeated executions.

[think]

The answer is B: it pays call overhead per batch, in SIMD-friendly loops.

The classic iterator model, Volcano, pays a virtual call per row per operator. Vectorised engines pay it once per batch of thousands of values, and run tight, cache-friendly loops over contiguous column values. Skipping unneeded columns is a storage-format benefit available to both models, and result caching is unrelated.

## 3

Five hundred application servers insert one row per event directly into ClickHouse, and inserts start failing with a "too many parts" error. What is the underlying cause?

A, the sort key has too many columns for each insert. B, each insert makes a part faster than merges can combine them. C, ClickHouse cannot accept 500 concurrent writers at once. D, the sparse primary index has run out of memory on the server.

[think]

The answer is B: each insert makes a part faster than merges can combine them.

MergeTree turns each insert into an immutable sorted part and relies on background merges, much like LSM compaction. Tiny, frequent inserts create parts faster than merges can keep up. The fixes are batch inserts, asynchronous insert buffering, or a Kafka consumer that batches; the number of writers matters only because each one sends tiny inserts.

## 4

A dashboard shows average session length per country from an hourly rollup that stores the average per country and hour. The daily numbers disagree with a direct query on the raw data. Why?

A, averages of averages ignore each hour's session count. B, each country must be rolled up in a separate table. C, floating-point rounding builds up across the hourly rollups. D, the hourly rollup is missing late-arriving sessions.

[think]

The answer is A: averages of averages ignore each hour's session count.

Averages are not additive. Averaging hourly averages weights every hour equally, however many sessions it had. Only additive measures can be re-aggregated correctly, so store the sum and the count per hour, and compute the exact average as total sum over total count. Late data could cause small differences, but the systematic error comes from averaging averages.

## 5

Why has Trino traditionally failed a whole query when one worker dies, while Spark retries only the lost tasks?

A, Spark runs two copies of every task in case one fails. B, stages exchange data in memory, with no durable output. C, each Trino worker holds the only copy of its table data. D, Trino's SQL dialect has no way to express a task retry.

[think]

The answer is B: stages exchange data in memory, with no durable output.

Trino pipelines exchange data in memory between stages running at the same time. That is what makes interactive engines fast, and it leaves nothing to restart from. Spark writes shuffle output to disk and recomputes from lineage, so it reruns only the missing work. Trino's optional fault-tolerant mode spools exchanges to storage to get retries back, at a latency cost.

## 6

A MergeTree part's sparse index has granule 3 starting at title 81234, country AR, and granule 4 starting at title 81234, country BR. For a filter on title 81234 and country BR, why must granule 3 be read?

A, the index stores only the first column, so country cannot be checked. B, its last rows may already have country BR before granule 4 begins. C, granules are always read in pairs, so the mark file can be decoded. D, the predicate is on a prefix, so every granule of the part is read.

[think]

The answer is B: its last rows may already have country BR before granule 4 begins.

A mark records only the first row of its granule. Granule 3 starts at country AR and ends just before the first row of granule 4, so its final rows can be BR rows that the index cannot see. A granule whose first key is past the predicate, say country CA, is skipped. The index holds all the sort-key columns, and a prefix predicate is exactly what it prunes.
