---
lesson: spark
source: 647815a8b8ec5909
---
## 1

A job's aggregation stage shows 800 gigabytes of shuffle write. The shuffle partitions setting is 200, and the cluster has 500 cores. Tasks spill heavily. What is the best first change?

A, lower the maximum partition bytes, so every task reads less input. B, cache the input DataFrame, so the scan is not repeated. C, raise the shuffle partitions to roughly 4,000 to 5,000. D, raise the broadcast threshold, so the shuffle is skipped.

[think]

The answer is C: raise the shuffle partitions to roughly 4,000 to 5,000.

800 gigabytes over 200 partitions is 4 gigabytes per task, far beyond execution memory, and only 200 of the 500 cores are busy. About 4,000 to 5,000 partitions, a multiple of the 500 cores, gives 160 to 200 megabytes each. Smaller input partitions change the read stage, not the shuffle, and caching and broadcast do not address the aggregation.

## 2

In a physical plan, you see a hash aggregate doing a partial count below an exchange, and a hash aggregate doing the final count above it. What is the lower operator doing?

A, deduplicating rows within each task before the join. B, pre-aggregating in each task, like a MapReduce combiner. C, sampling rows so adaptive execution can size partitions. D, counting rows to feed the optimizer's table statistics.

[think]

The answer is B: pre-aggregating in each task, like a MapReduce combiner.

Partial aggregation computes per-task partial counts before the exchange, so fewer rows cross the shuffle, and the final aggregate merges them. It is the combiner, and it is why ordinary aggregations tolerate skewed keys better than joins do.

## 3

You broadcast a 2 gigabyte dimension table to 300 executors to avoid a sort-merge join. What is the most likely consequence?

A, about 600 gigabytes moved, and a huge hash table in every executor. B, each executor receives only its three-hundredth slice of the table. C, Spark silently falls back to a broadcast nested loop join. D, the join becomes almost free, because no shuffle is needed.

[think]

The answer is A: about 600 gigabytes moved, and a huge hash table in every executor.

Broadcast copies the whole table to every executor: 2 gigabytes times 300 is 600 gigabytes. Each executor builds a full in-memory hash table, usually larger than the on-disk size, risking out-of-memory errors, and the driver has to hold the table first as well. Broadcast wins for small tables, not for anything that merely avoids a shuffle.

## 4

One task in a join stage reads 40 gigabytes of shuffle data, while the median task reads 150 megabytes. What is the most likely cause, and a good first move?

A, under-partitioning; raise the number of shuffle partitions. B, a hot join key; check for null keys, then use adaptive query execution or salting. C, slow executor hardware; enable speculative execution. D, too many small input files; compact them before the join.

[think]

The answer is B: a hot join key. Check for null keys, then adaptive execution or salting.

One partition hundreds of times the median is key skew. More partitions cannot split a single key, and speculation only re-runs the same 40 gigabytes somewhere else. Null or placeholder keys are the most common culprit; after that, adaptive execution's skew splitting, or salting the key.

## 5

Why is it acceptable to use a random salt when fixing a skewed join, but not when computing a distinct count per key in two stages?

A, Spark removes the duplicate matches from salted joins. B, joins are commutative and associative, and distinct counts are not. C, each fact row still meets exactly one copy of its dimension row. D, Spark only permits random expressions inside join keys.

[think]

The answer is C: each fact row still meets exactly one copy of its dimension row.

The replicated dimension side guarantees that every salted fact row finds its match exactly once, so the join result is unchanged. In the distinct count, the same value could land in several buckets and be counted more than once. Partial distinct counts only add up when the buckets are disjoint, which needs a salt that is a function of the value being counted.

## 6

A job runs on spot instances with no external shuffle service. Each time capacity is reclaimed, its reduce stage fails with fetch failures and the map stage re-runs, although the reducers' own executors are healthy. What is the most likely cause?

A, the shuffle blocks exceeded the 48 megabyte in-flight fetch limit. B, the lost executors held the only copies of their shuffle files. C, adaptive execution coalesced the partitions after the map stage had finished. D, the map tasks wrote their output with a non-deterministic salt.

[think]

The answer is B: the lost executors held the only copies of their shuffle files.

Shuffle files live on the executor that wrote them. When that executor disappears, and neither an external shuffle service nor decommissioning migration kept a copy elsewhere, every fetch of its blocks fails and the scheduler recomputes the missing map outputs. The in-flight limit only throttles fetches, adaptive execution re-plans before the reduce stage runs, and a bad salt changes results rather than causing fetch failures.
