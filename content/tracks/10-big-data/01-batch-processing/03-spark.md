---
slug: spark
title: "Spark: lazy plans, shuffles, partitions, joins and skew"
description: How Spark turns DataFrame code into stages and tasks, how to size partitions and shuffles with arithmetic instead of folklore, how it picks a join strategy, and how to find and fix skew.
minutes: 20
difficulty: hard
tags: [big-data, spark, pyspark, shuffle, partitioning, joins, data-skew, adaptive-query-execution]
---
A nightly Spark job joins a day of playback events with a 40 GB title metadata table (rights, artwork, localised text) and aggregates viewing time per title and country. It used to take 20 minutes. Since a big series launched, it takes three hours. The Spark UI shows 3,199 of 3,200 tasks in the final stage finishing within two minutes; one task has been running for two and a half hours and has spilled 90 GB to disk. Adding executors changes nothing.

Nothing about that failure is visible in the code, which is ten lines of DataFrame calls. It is visible only if you know what Spark does with those ten lines: build a plan, cut it into stages at every shuffle, run one task per partition, and send every row with the same key to the same task. This lesson gives you that model and the arithmetic to go with it.

## From code to a plan

Spark is **lazy**. Transformations (`filter`, `select`, `join`, `groupBy`) only build a logical plan. An **action** (`count`, `collect`, `write`) hands the plan to the optimiser (Catalyst), which rewrites it, chooses physical operators and runs it.

```python
from pyspark.sql import SparkSession, functions as F

spark = SparkSession.builder.appName("title-stats").getOrCreate()

plays = spark.read.parquet("s3://warehouse/plays/")          # billions of rows
titles = spark.read.parquet("s3://warehouse/titles/")        # ~20 MB

stats = (
    plays
    .filter(F.col("event_date") == "2024-05-01")
    .filter(F.col("duration_s") >= 60)
    .groupBy("title_id", "country")
    .agg(F.count("*").alias("plays"), F.sum("duration_s").alias("watch_s"))
    .join(titles.select("title_id", "name"), "title_id")
)
stats.write.mode("overwrite").parquet("s3://warehouse/title_stats/date=2024-05-01/")
```

The code above is a simplified version of that job, joined to a small titles table instead. Call `stats.explain()` and you get the physical plan (abridged):

```text
AdaptiveSparkPlan
+- Project [title_id, country, plays, watch_s, name]
   +- BroadcastHashJoin [title_id], [title_id], Inner, BuildRight
      :- HashAggregate(keys=[title_id, country], functions=[count(1), sum(duration_s)])
      :  +- Exchange hashpartitioning(title_id, country, 200)
      :     +- HashAggregate(keys=[title_id, country], functions=[partial_count(1), partial_sum(duration_s)])
      :        +- Filter (duration_s >= 60)
      :           +- FileScan parquet [title_id, country, duration_s]
      :                PartitionFilters: [event_date = 2024-05-01]
      :                PushedFilters: [GreaterThanOrEqual(duration_s,60)]
      +- BroadcastExchange
         +- FileScan parquet [title_id, name]
```

Read it bottom-up and you can see every idea from [MapReduce](/learn/big-data/batch-processing/mapreduce):

- **Column pruning and pushdown.** The scan reads only three columns, skips every date directory except one (`PartitionFilters`) and hands the duration filter to the Parquet reader (`PushedFilters`), which can skip whole row groups.
- **Partial aggregation.** `partial_count` and `partial_sum` are the combiner. Each task pre-aggregates its rows before the shuffle.
- **`Exchange`** is the shuffle. Everything below it is one stage; everything above it is the next.
- **`BroadcastHashJoin`** means the titles table was small enough to copy to every executor, so the large side is never shuffled for the join.

## Jobs, stages and tasks

An action becomes a **job**. The job is cut into **stages** at every wide dependency, and each stage runs one **task** per partition.

- A **narrow** dependency (`filter`, `select`, `withColumn`, map-side partial aggregation) needs only its own input partition, so consecutive narrow operations are fused and pipelined inside one task, row by row, without writing anything out. Whole-stage code generation compiles each such chain into a single tight loop.
- A **wide** dependency (`groupBy`, `join` without broadcast, `distinct`, `orderBy`, `repartition`) needs rows from every input partition, so Spark ends the stage: each task writes its output sorted by target partition to local disk (one data file plus an index per task), and tasks in the next stage fetch their block from every map task.

The plan above is two stages plus a small broadcast. Every `Exchange` you add is another full write, network transfer and read of the data flowing through it. Counting exchanges in `explain()` is the fastest way to estimate a Spark job's cost.

When an executor dies, Spark does what MapReduce did: re-run the lost tasks. For lost shuffle output it walks the **lineage** (the plan) back to the nearest data it still has and recomputes only the missing partitions. That is why transformations must be deterministic, and why a non-deterministic step such as `F.rand()` before a shuffle can yield inconsistent results after a retry.

## Partition arithmetic

Three different partition counts matter, and most tuning is about getting each one right.

| Where | Controlled by | Default | What it decides |
|---|---|---|---|
| Input (scan) | `spark.sql.files.maxPartitionBytes` | 128 MB | Number of read tasks |
| Shuffle | `spark.sql.shuffle.partitions`, adjusted by adaptive execution | 200 | Number of tasks after each exchange |
| Output | Partitions at write time (`repartition`, `coalesce`) | Whatever the last stage had | Number and size of files written |

### A worked example

The job reads 1.2 TB of Parquet and the Spark UI shows 600 GB of shuffle write for the aggregation. The cluster has 100 executors with 4 cores each, so 400 tasks run at once.

1. **Read tasks.** 1.2 TB / 128 MB ≈ 9,400 tasks, about 24 waves of 400. Fine.
2. **Shuffle partitions at the default.** 600 GB / 200 = 3 GB per reduce task. Each task must hash-aggregate or sort 3 GB with a few gigabytes of execution memory, so it spills to disk repeatedly, and only 200 of the 400 cores have any work. This is the most common Spark misconfiguration in production.
3. **Choose a target.** Aim for roughly 100–200 MB per shuffle partition: 600 GB / 200 MB = 3,000. Round to a multiple of the core count so the last wave is full: 3,200 partitions, 8 waves.
4. **Check the other side.** The shuffle is now 9,400 map tasks × 3,200 reducers ≈ 30 million blocks averaging 20 KB. Tiny blocks mean random I/O and per-fetch overhead. Raising `maxPartitionBytes` to 512 MB cuts map tasks to about 2,350 and the block count to 7.5 million of about 80 KB each.

**Adaptive query execution** (on by default since Spark 3.2) automates part of this. It re-plans at each stage boundary using the real shuffle statistics: it can **coalesce** many small shuffle partitions toward an advisory size (64 MB by default), switch a sort-merge join to a broadcast join when one side turns out to be small, and split skewed partitions. Set `spark.sql.shuffle.partitions` high and let AQE coalesce it down; it cannot split an under-partitioned stage back up except for skew.

Output partitions deserve the same care. Writing the 3,200 aggregate partitions produces 3,200 files, perhaps 1 MB each, which is exactly the small-files problem from the [previous lesson](/learn/big-data/batch-processing/distributed-file-systems). `coalesce(16)` before the write merges partitions without a shuffle (but also reduces the parallelism of the stage that computes them); `repartition(16)` adds a shuffle but keeps upstream parallelism.

## Joins: the most expensive decision in the plan

Spark chooses among three physical joins:

| Strategy | When | Cost |
|---|---|---|
| **Broadcast hash join** | One side is below `spark.sql.autoBroadcastJoinThreshold` (10 MB by default) or hinted with `F.broadcast(df)` | No shuffle of the big side; the small side is copied to every executor and built into a hash table |
| **Sort-merge join** | Default for two large inputs | Both sides are shuffled by the join key and sorted, then merged |
| **Shuffled hash join** | Both large, one side's partitions fit in memory | Both sides shuffled; the smaller side of each partition is hashed instead of sorted |

Broadcast is not free. Broadcasting a 1 GB table to 100 executors moves 100 GB over the network and puts a 1 GB hash table (often several gigabytes once deserialised) in every executor's memory. Raise the threshold to a few hundred megabytes when the numbers work, not to "whatever makes the shuffle go away".

For tables that are joined on the same key again and again, **bucketing** pays the shuffle once at write time: `df.write.bucketBy(512, "user_id").sortBy("user_id").saveAsTable(...)`. Two tables bucketed identically on the join key can be sort-merge joined without an exchange. Table formats offer similar layouts through partition transforms such as `bucket(512, user_id)`.

## Skew: the one task that never finishes

Back to the three-hour job. Its real join is against the 40 GB title metadata table, far too big to broadcast, so Spark shuffles both sides by `title_id` and runs a sort-merge join. Hash partitioning spreads distinct keys evenly across partitions, but it cannot split a single key. The new series produced 18% of yesterday's plays, so every one of its play rows went to the same join partition, and one task processed tens of times more rows than its neighbours.

```viz
{"type": "system", "scenario": "sharding-hash", "nodes": 3,
 "title": "Hash partitioning spreads keys, not load",
 "caption": "Each key goes to partition hash(key) mod n, exactly like a shuffle. Distinct keys spread evenly, but every row for one hot key lands in one partition, and changing the partition count reshuffles almost everything."}
```

**Detect it** in the Spark UI: in the stage's task summary, compare the max task duration and shuffle-read size with the median. A max ten times the median is skew; a uniformly slow stage is under-partitioning or spill.

**Fix it**, in order of preference:

1. **Let AQE split it.** For sort-merge joins, `spark.sql.adaptive.skewJoin.enabled` (on by default) splits a partition that is both more than 5× the median and larger than 256 MB into smaller tasks, duplicating the matching partition from the other side.
2. **Filter or handle the hot keys separately.** Null or placeholder keys (`title_id = -1`, `user_id = ''`) are the most common "hot key" and usually should not be joined at all.
3. **Salt the join.** Spread the hot side over N sub-keys and replicate the other side N times:

```python
N = 16
salted_plays = plays.withColumn("salt", (F.rand(seed=7) * N).cast("int"))
salted_meta = title_meta.crossJoin(spark.range(N).withColumnRenamed("id", "salt"))
joined = salted_plays.join(salted_meta, ["title_id", "salt"]).drop("salt")
```

The snippet salts every key for brevity, which replicates the whole 40 GB side 16 times: a 640 GB mistake. In practice you salt only the handful of hot keys (find them with a `groupBy("title_id").count()` over a sample) and give every other key salt 0, so only the hot titles' metadata rows are copied. A random salt is correct for a join, because each fact row still matches exactly one copy of its dimension row. That is different from the distinct-count case in the MapReduce lesson, where the salt had to be a function of the record. Seed the random generator so a retried task produces the same salts.

For aggregations, skew is usually harmless because partial aggregation collapses the hot key on the map side, which is one more reason to prefer built-in aggregates over `groupBy(...).applyInPandas` or `collect_list` followed by custom code.

## Caching, memory and Python

- **Cache deliberately.** `df.cache()` keeps a DataFrame in executor memory after the first action, which pays off only if you reuse it in several actions. An unused cache evicts shuffle and execution memory. Unpersist when done.
- **Memory is shared.** Executors split their heap between execution (shuffles, joins, aggregations) and storage (cache) under a unified pool; when execution runs out, operators spill sorted runs to disk. Spill in the UI means a partition is too big, not that the cluster is too small.
- **Avoid row-at-a-time Python UDFs.** A plain Python UDF ships every row from the JVM to a Python worker and back, typically an order of magnitude slower than the equivalent built-in function, and it is opaque to the optimiser (no pushdown). Use built-ins, SQL expressions, or vectorised pandas UDFs, which move data in Arrow batches.
- **Never `collect()` a large DataFrame.** It pulls every row into the driver's memory.

## Senior signals

- You read `explain()` bottom-up and count **exchanges**; you can say which operators are fused into which stage and where the combiner is.
- You size shuffle partitions from the **shuffle bytes** (100–200 MB per partition, a multiple of cores) and check the map × reduce block count, instead of accepting 200.
- You pick joins deliberately: **broadcast** when one side is genuinely small, bucketing for repeated large joins, and you know broadcast costs network and memory on every executor.
- You diagnose **skew** from the task-duration distribution, fix null and placeholder keys first, and know when a random salt is correct (joins) and when it is not (distinct counts).
- You treat **determinism** as a requirement because Spark recovers by recomputing lineage.
- You control **output file counts** as part of the job's design, not as a clean-up task.

## Check yourself

```quiz
- q: >-
    A job's aggregation stage shows 800 GB of shuffle write, spark.sql.shuffle.partitions is 200 and the cluster has 500 cores. Tasks spill heavily. What is the best first change?
  options: ["Lower maxPartitionBytes so every task reads less input", "Cache the input DataFrame so the scan is not repeated", "Raise shuffle partitions to roughly 4,000-5,000", "Raise the broadcast threshold so the shuffle is skipped"]
  answer: 2
  explanation: >-
    800 GB / 200 = 4 GB per task, far beyond execution memory, and only 200 of 500 cores are busy. About 4,000-5,000 partitions (a multiple of 500 cores) gives 160-200 MB each. Smaller input partitions change the read stage, not the shuffle; caching and broadcast do not address the aggregation.
- q: >-
    In a physical plan you see HashAggregate(partial_count) below an Exchange and HashAggregate(count) above it. What is the lower operator doing?
  options: ["Deduplicating rows within each task before the join", "Pre-aggregating in each task, like a MapReduce combiner", "Sampling rows so adaptive execution can size partitions", "Counting rows to feed the optimizer's table statistics"]
  answer: 1
  explanation: >-
    Partial aggregation computes per-task partial counts before the exchange, so fewer rows cross the shuffle; the final aggregate merges them. It is the combiner, and it is why ordinary aggregations tolerate skewed keys better than joins do.
- q: >-
    You broadcast a 2 GB dimension table to 300 executors to avoid a sort-merge join. What is the most likely consequence?
  options: ["About 600 GB moved and a huge hash table in every executor", "Each executor receives only its 1/300 slice of the table", "Spark silently falls back to a broadcast nested loop join", "The join becomes almost free, as no shuffle is needed"]
  answer: 0
  explanation: >-
    Broadcast copies the whole table to every executor: 2 GB × 300 = 600 GB moved, and each executor builds a full in-memory hash table, usually larger than the on-disk size, risking out-of-memory errors. Broadcast wins for small tables, not for anything that merely avoids a shuffle.
- q: >-
    One task in a join stage reads 40 GB of shuffle data; the median task reads 150 MB. What is the most likely cause and a good first move?
  options: ["Under-partitioning; raise the number of shuffle partitions", "A hot join key; check for null keys, then AQE or salting", "Slow executor hardware; enable speculative execution", "Too many small input files; compact them before the join"]
  answer: 1
  explanation: >-
    A single partition hundreds of times the median is key skew. More partitions cannot split one key, and speculation just re-runs the same 40 GB elsewhere. Null or placeholder keys are the most common culprit, then AQE skew splitting or salting the key.
- q: >-
    Why is it acceptable to use a random salt when fixing a skewed join, but not when computing a distinct count per key in two stages?
  options: ["Spark removes the duplicate matches from salted joins", "Joins are commutative and associative; distinct counts are not", "Each fact row still meets exactly one dimension row copy", "Spark only permits random expressions inside join keys"]
  answer: 2
  explanation: >-
    The replicated dimension side guarantees every salted fact row finds its match exactly once, so the join result is unchanged. In the distinct count the same value could land in several buckets and be counted more than once: partial distinct counts only add up when the buckets are disjoint, which requires salting by a function of the value being counted.
```
