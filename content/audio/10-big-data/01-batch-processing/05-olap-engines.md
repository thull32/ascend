---
lesson: olap-engines
source: 1719e4a5611220b3
fit: great
desk:
  - "The two-architecture diagram and comparison table"
  - "The Volcano iterator and vectorised filter code, and the eight-row batch trace"
  - "A MergeTree part on disk, and the sparse index trace with its granule table"
  - "Exercise: which granules must a sparse primary index read"
---
## Introduction

A product team wants a dashboard of streaming quality: rebuffer rate by device, country and title over the last 30 days, filterable by any of those, refreshing in under two seconds for a few hundred internal users. The table holds about 100 billion rows. A Spark job can compute the answer, but it takes a minute just to acquire executors before reading a byte. The warehouse's batch path is correct and far too slow. You need an engine whose whole design assumes a human is waiting.

Online analytical processing engines, OLAP engines, are that design. They take the columnar ideas from the previous lesson and add three more: execution that processes a column in batches instead of one row at a time, indexes and layouts that skip most data before reading it, and an architecture chosen for either raw speed on local disks or elasticity over object storage.

Knowing which trade-off each engine made is what lets you pick one in a design review instead of repeating a benchmark. So: the two architectures, how vectorised execution works, how ClickHouse's sort key and sparse index skip almost everything, and how pre-aggregation makes the query small in the first place.

## Two architectures

The first is storage-coupled, or shared-nothing. ClickHouse, Apache Druid and Apache Pinot keep data on the local disks of the nodes that query it, in their own formats, sorted and indexed at ingest. Each node owns a shard; a query fans out to all of them and merges the partial results. There is no network hop between storage and compute, so these engines answer a pruned query in tens to hundreds of milliseconds, serve hundreds to thousands of queries a second, and show streamed data within seconds. The cost is operational: data must be ingested into the engine, capacity is tied to disks, and resharding means moving data.

The second is disaggregated. BigQuery, Snowflake and Trino separate compute from storage. Data lives in columnar files in a distributed store, S3 for Trino over Iceberg tables, and a fleet of stateless workers reads it for each query. Compute scales on its own, with no data to move, and one copy of the data serves many engines. The cost is latency: every query reads over the network, so these engines lean on pruning and caching and land in the one-to-ten-second range, with tens to hundreds of concurrent queries.

Netflix has written about using both: Presto for interactive queries over its S3 warehouse, and Druid for real-time playback-quality metrics, where queries must return well under a second over data that arrived moments ago.

The cost models differ too. A storage-coupled engine costs the cluster you keep running. A disaggregated engine on demand charges for what you scan; BigQuery, at the time of writing, charges 6 dollars and 25 cents per tebibyte in its US regions. There, a careless select star over a petabyte-scale table can cost thousands of dollars in one query, so the pruning lessons are also lessons about the bill.

## How a distributed query runs

A coordinator parses the SQL, optimises it, and splits the plan into stages connected by exchanges, just as in Spark. Leaf stages scan the data and apply filters and partial aggregations. Middle stages hash-partition rows by the group-by or join key. The final stage merges and sorts.

The crucial difference from Spark is how exchanges move data. Trino and BigQuery pipeline it between stages, so every stage runs at once and the first results can stream out before the scan finishes. That is why they are fast. In Trino, it is also why, by default, one worker failing fails the whole query: the exchange data lived in that worker's memory. Trino added an optional fault-tolerant mode in 2022 that writes exchange data to storage, trading latency for the ability to retry tasks. Spark's disk-based shuffle is the opposite choice: slower, but a three-hour job survives losing machines.

Two optimisations are worth naming. Partial aggregation at the leaves: every worker aggregates before the exchange, so a group-by country over 100 billion rows ships at most a few hundred rows per worker. And dynamic filtering: when joining a huge fact table with a filtered dimension, say titles in the anime genre, the engine builds the small side first, collects its title ids, and pushes them into the fact table's scan, so row groups without a matching id are skipped.

In Trino, the usual way a query dies is memory. The build side of a hash join must fit in memory across the workers, and a query that exceeds its per-node memory limit fails at once. The common cause is missing or stale statistics, so the optimiser guessed and built the hash table from the large table. Collect statistics, and let it pick the right side.

## Vectorised execution

The textbook query engine is the iterator model, sometimes called Volcano. Every operator has a next function that returns one row by calling next on its child. It is elegant and slow at analytical scale. Scanning a billion rows through scan, filter, project and aggregate is 4 billion next calls, each an indirect call with poor branch prediction. At a few nanoseconds each, the overhead alone is 10 to 20 seconds per core, before any useful work.

Vectorised execution changes the unit of work from a row to a batch of one column's values, typically a thousand to eight thousand. In batches of about 4 thousand, a billion rows is about 244 thousand calls per operator instead of a billion. Each call runs a tight loop over a contiguous array that the CPU can prefetch and pipeline, using instructions that compare 8 to 16 values at once.

Picture one batch of eight rows. The query sums duration where duration is at least 60 and country is US. First, the planner looks up US in the column's dictionary, once: it is id 3. The string is never compared again. Then one pass over the durations produces a yes-or-no mask, one pass over the country ids produces another, and the two are combined. Three rows survive, at positions 0, 3 and 5, and that list of positions is the selection vector. The aggregate reads duration only at those three positions: 70 plus 60 plus 120, 250. Nothing was copied, and the other columns were never touched.

ClickHouse, DuckDB, Snowflake and BigQuery are vectorised. Spark took the other route, code generation, compiling a whole stage into one loop. Both beat the row-at-a-time iterator by roughly an order of magnitude on scan-heavy queries.

## Sort once, skip most

ClickHouse's main table engine, MergeTree, is the model of the storage-coupled design. You declare a sort key, say title, then country, then date. Each insert creates an immutable part, its columns sorted by that key, and background merges combine small parts into larger ones, exactly like compaction in an LSM tree.

The index is sparse. It stores one entry per granule of 8,192 rows, not one per row. For 100 billion rows that is about 12 million entries, a few hundred megabytes that stay in memory. A per-row B-tree over the same data would be terabytes. A query binary-searches the index for granules whose keys can match and reads only those, often a few thousand out of millions.

Trace it. Each index entry records only the first key of its granule. Granule 3 starts at title 81234, country Argentina. Granule 4 starts at title 81234, Brazil. Granules 5 and 6 also start at 81234, Brazil, and granule 7 starts at 81234, Canada. The query wants title 81234 and Brazil. Granules 4, 5 and 6 clearly qualify, and granule 7 is skipped. But what about granule 3, which starts at Argentina?

[pause]

It must be read. It runs from Argentina right up to where granule 4 begins at Brazil, so its last rows may already be Brazil rows, which the index cannot see. Four granules, about 32 thousand rows, out of a part of about 82 thousand. Then a mark file per column turns each granule into a byte offset, so three column reads of a few hundred kilobytes replace a scan.

The sort key is the whole performance story. Filters on a prefix of the key are fast. A filter on device alone, which is not in the key, reads every granule. Skip indexes and projections, which store a second copy in another order, cover other access paths, at a storage cost.

The failure mode follows from the design. Every insert creates a part. Five hundred application servers inserting one row per event create parts far faster than merges can combine them. Past a limit of active parts, inserts are first delayed, at 1,000 by default, and then rejected with a "too many parts" error. The fix is to batch: thousands to hundreds of thousands of rows per insert, about once a second per table, or asynchronous inserts, or Kafka in front with a consumer that batches. Updates and deletes are expensive for the same reason: they are mutations that rewrite whole parts in the background.

## Pre-aggregation

The fastest scan is the one you do not do. Roll the data up at ingest, to title, country, device and hour, storing sums and counts. If the raw table has 100 billion rows and the rollup has 200 million, dashboard queries get 500 times cheaper. You lose any dimension you rolled away, so keep the raw table for ad-hoc work. And if a rollup is as big as its source, check whether it kept a high-cardinality column like user id, which shrinks nothing.

Store only additive measures: sums and counts, never averages or ratios. Sums merge across rollups and across nodes; an average of averages weights every group equally and is wrong. The dashboard's rebuffer rate is computed at query time, from two sums. It is the same algebra as the MapReduce combiner.

For distinct counts, exact counting needs every id in memory and cannot be rolled up. A HyperLogLog sketch uses a few kilobytes per group, merges across rollups, and is accurate to within a few percent; Trino's default standard error is 2.3 percent. Druid and Pinot make the rollup the storage format itself, and Pinot's star-tree index pre-computes aggregates for combinations of dimensions.

So which engine? User-facing analytics, sub-second, high query rates, fresh data: ClickHouse, Druid or Pinot. Ad-hoc SQL over the lakehouse, with joins across sources: Trino. A managed warehouse with no cluster to run: BigQuery or Snowflake. Heavy transformations and hours-long jobs: Spark, whose durable shuffle survives failures.

## In the interview

A follow-up the lesson expects: why can ClickHouse answer in 50 milliseconds where Trino needs 3 seconds on the same data?

[pause]

Architecture. ClickHouse reads local, pre-sorted storage with a sparse index resident in memory. Trino reads remote object storage over the network on every query, pays first-byte latency per file, and must plan from metadata. The wrong answer is "ClickHouse is written in C++", which explains a constant factor, not the gap.

And to close the loop on the opening: how would you keep that dashboard sub-second over 100 billion rows?

[pause]

Pre-aggregate at ingest to the dashboard's grain, with sums, counts and HyperLogLog sketches. Choose the sort key from the filters people actually use. Batch the ingestion. And keep the raw table elsewhere for ad-hoc questions. The wrong answer is "add nodes", which does not change how much work each query does.

## Recap

Four things to remember. Classify an engine as storage-coupled or disaggregated first, and the latency, concurrency, elasticity and cost model follow. In-memory pipelined exchanges make interactive engines fast and fragile, so keep hours-long jobs in an engine with a durable shuffle. Vectorised execution wins by paying call overhead per batch, running tight loops, and working on dictionary ids and selection vectors. And a sorted, sparsely indexed engine only helps filters on a prefix of its sort key, needs batched inserts, and should be fed rollups of additive measures and sketches before anyone adds hardware.

At your desk: the architecture table, the iterator and vectorised code with the batch trace, the part layout and granule table, and the sparse index exercise.
