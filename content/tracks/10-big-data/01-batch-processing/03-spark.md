---
slug: spark
title: "Spark: lazy plans, shuffles, partitions, joins and skew"
description: How Spark turns RDD and DataFrame code into stages and tasks, what Tungsten, the sort-based shuffle and adaptive execution actually do, how to size partitions and shuffles with arithmetic instead of folklore, how it picks a join strategy, and how to find and fix skew.
minutes: 45
difficulty: hard
tags: [big-data, spark, pyspark, shuffle, partitioning, joins, data-skew, adaptive-query-execution]
---
A nightly Spark job joins a day of playback events with a 40 GB title metadata table (rights, artwork, localised text) and aggregates viewing time per title and country. It used to take 20 minutes. Since a big series launched, it takes three hours. The Spark UI shows 3,199 of 3,200 tasks in the final stage finishing within two minutes; one task has been running for two and a half hours and has spilled 90 GB to disk. Adding executors changes nothing.

Nothing about that failure is visible in the code, which is ten lines of DataFrame calls. It is visible only if you know what Spark does with those ten lines: build a plan, cut it into stages at every shuffle, run one task per partition, and send every row with the same key to the same task. This lesson gives you that model and the arithmetic to go with it.

## RDDs, DataFrames and Datasets

Spark's original abstraction is the **RDD** (resilient distributed dataset): a list of partitions, a function that computes each partition from its parents, a list of dependencies on parent RDDs, and optionally a partitioner and preferred locations. Everything else is derived. A `map` produces an RDD whose partition *i* depends only on the parent's partition *i* (a **narrow** dependency); a `reduceByKey` produces one whose every partition depends on every parent partition (a **wide** dependency, which is a shuffle). Lineage, the chain of dependencies, is what makes an RDD "resilient": a lost partition is recomputed from its parents rather than restored from a replica.

RDDs hold arbitrary JVM objects, which is their limit. A row of three fields is three boxed objects plus a container, the garbage collector has to trace all of them, sending a row across a shuffle means Java serialisation, and Spark has no idea what your `lambda` does, so it cannot reorder or prune anything. In PySpark it is worse: every record is pickled, sent to a Python worker process, transformed, pickled again and sent back.

**DataFrames** (Spark 1.3, unified with Datasets in 2.0) are RDDs of `InternalRow` with a schema and a declarative API. That buys two engines. **Catalyst** is the optimiser: it sees `filter`, `select` and `join` as expressions it understands and applies rules such as predicate pushdown, column pruning, constant folding and join reordering. **Tungsten** is the execution layer: rows live in a compact binary format that Spark manages itself, and whole stages are compiled to JVM bytecode. A **Dataset[T]** is the typed variant for Scala and Java, with encoders that convert between objects and the binary format; Python has only DataFrames, which is fine, because the point is to keep data in the JVM and describe work declaratively.

| | RDD | DataFrame / Dataset |
|---|---|---|
| Optimisation | None; Spark runs your closures as given | Catalyst: pushdown, pruning, join selection, AQE |
| Memory format | JVM objects on the heap | UnsafeRow binary, on or off heap |
| Shuffle serialisation | Java or Kryo per object | Rows are already bytes; copied, not serialised |
| Python cost | Pickle every record to a worker process | Data stays in the JVM; pandas UDFs move Arrow batches |
| Type safety | Compile-time (Scala) | Runtime schema (DataFrame), compile-time with Dataset[T] |
| Use when | Custom partitioning or algorithms the SQL model cannot express | Everything else |

One RDD habit is worth naming because it survives in DataFrame code: `groupByKey` shuffles every value, while `reduceByKey` combines on the map side first. In DataFrames, `groupBy().agg(sum)` gets the partial aggregate automatically; `groupBy().agg(collect_list)` or `applyInPandas` cannot, and behaves like `groupByKey`.

## From code to a plan

Spark is **lazy**. Transformations (`filter`, `select`, `join`, `groupBy`) only build a logical plan. An **action** (`count`, `collect`, `write`) hands the plan to Catalyst, which rewrites it, chooses physical operators and runs it.

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

- **Column pruning and pushdown.** The scan reads only three columns, skips every date directory except one (`PartitionFilters`) and hands the duration filter to the Parquet reader (`PushedFilters`), which can skip whole row groups using the statistics described in the [columnar formats lesson](/learn/big-data/batch-processing/columnar-formats-and-lakehouses).
- **Partial aggregation.** `partial_count` and `partial_sum` are the combiner. Each task pre-aggregates its rows before the shuffle.
- **`Exchange`** is the shuffle. Everything below it is one stage; everything above it is the next.
- **`BroadcastHashJoin`** means the titles table was small enough to copy to every executor, so the large side is never shuffled for the join.

## Jobs, stages and tasks

An action becomes a **job**. The `DAGScheduler` walks the plan backwards from the action and cuts a **stage** at every `Exchange`; the `TaskScheduler` then runs one **task** per partition of each stage, on whichever executor has a free core, preferring one that holds the input (it waits up to `spark.locality.wait`, 3 seconds, for a local slot before settling for any).

- A **narrow** dependency (`filter`, `select`, `withColumn`, map-side partial aggregation) needs only its own input partition, so consecutive narrow operations are fused and pipelined inside one task, row by row, without writing anything out. Whole-stage code generation compiles each such chain into a single tight loop.
- A **wide** dependency (`groupBy`, `join` without broadcast, `distinct`, `orderBy`, `repartition`) needs rows from every input partition, so Spark ends the stage: each task writes its output sorted by target partition to local disk, and tasks in the next stage fetch their block from every map task.

The plan above is two stages plus a small broadcast. Every `Exchange` you add is another full write, network transfer and read of the data flowing through it. Counting exchanges in `explain()` is the fastest way to estimate a Spark job's cost.

When an executor dies, Spark does what MapReduce did: re-run the lost tasks (up to `spark.task.maxFailures`, 4). For lost shuffle output the next stage's tasks fail with `FetchFailedException`, the scheduler resubmits the map stage for only the missing partitions (up to `spark.stage.maxConsecutiveAttempts`, 4), and walks the **lineage** back to the nearest data it still has. That is why transformations must be deterministic, and why a non-deterministic step such as `F.rand()` before a shuffle can yield inconsistent results after a retry.

## A shuffle traced by hand

Take the aggregation from the plan with four input files and three shuffle partitions. Real Spark partitions by a Murmur3 hash of the key columns; to make this reproducible on paper, use `title_id mod 3`.

Stage 0 has four tasks, one per file. Each runs the fused scan → filter → partial aggregate loop and ends with a small hash map of `(title_id, country) → (plays, watch_s)`:

| Map task | Rows read (title, country, duration) | Partial aggregates | Partition |
|---|---|---|---|
| 0 | (1,US,100) (1,US,50) (2,BR,30) | (1,US)→(2,150); (2,BR)→(1,30) | 1; 2 |
| 1 | (2,BR,60) (3,US,10) | (2,BR)→(1,60); (3,US)→(1,10) | 2; 0 |
| 2 | (1,US,20) (3,US,40) (3,US,5) | (1,US)→(1,20); (3,US)→(2,45) | 1; 0 |
| 3 | (2,US,15) | (2,US)→(1,15) | 2 |

Each partial-aggregate row is an `UnsafeRow` of about 48 bytes (an 8-byte null bitmap, four 8-byte field slots, and `US` padded to 8 bytes in the variable-length region). Each map task sorts its rows by partition id and writes **one data file and one index file**: `shuffle_0_2_0.data` for map task 2 holds partition 0's bytes then partition 1's then partition 2's, and `shuffle_0_2_0.index` holds four 8-byte offsets `[0, 48, 96, 96]`. The map-side output, as a matrix of bytes per (map task, reduce partition):

| Map task | → partition 0 | → partition 1 | → partition 2 |
|---|---|---|---|
| 0 | 0 | 48 | 48 |
| 1 | 48 | 0 | 48 |
| 2 | 48 | 48 | 0 |
| 3 | 0 | 0 | 48 |

Stage 1 has three tasks. Reduce task 0 fetches its block from every map task that has one (offset lookups in two index files, 96 bytes total), merges `(3,US)→(1,10)` and `(3,US)→(2,45)` in a hash map, and emits `(3,US)→(3,55)`. Task 1 merges the two `(1,US)` partials into `(3,170)`. Task 2 receives 144 bytes and emits `(2,BR)→(2,90)` and `(2,US)→(1,15)`. The write then produces three output files, one per reduce task, which is already a hint about the small-files problem to come.

Scale the same shape to production: 9,400 map tasks × 3,200 reduce partitions is 30 million blocks in 9,400 pairs of files, and the Spark UI's "Shuffle Read" and "Shuffle Write" columns are the row and column sums of that matrix. Skew is one column of the matrix being far larger than the rest, which no number of extra columns fixes.

### A spilling reduce task

Now give reduce task 2 a 3 GB block set instead of 144 bytes, on an executor with a 4 GB heap and 4 task slots. Tungsten's unified memory pool is 60% of the heap minus 300 MB reserved (`spark.memory.fraction`), about 2.2 GB, shared by execution and storage; a task can claim between 1/(2 × 4) and 1/4 of it, so this task gets at most about 560 MB. The hash aggregate fills its map to that limit, then falls back to sort-based aggregation: it sorts the map's entries by key, writes them to local disk as a run, empties the map and continues. Three gigabytes at 560 MB per run is about six spilled runs, followed by a merge that reads all six back. The UI records this as "Spill (memory)" of a few gigabytes and "Spill (disk)" of somewhat less after compression, and the task takes several times longer than a task whose input fit. Spill is a partition-size problem, not a cluster-size problem, and the next section is about sizing.

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
2. **Shuffle partitions at the default.** 600 GB / 200 = 3 GB per reduce task. Each task must hash-aggregate or sort 3 GB with a few hundred megabytes of execution memory, so it spills to disk repeatedly, and only 200 of the 400 cores have any work. This is the most common Spark misconfiguration in production.
3. **Choose a target.** Aim for roughly 100–200 MB per shuffle partition: 600 GB / 200 MB = 3,000. Round to a multiple of the core count so the last wave is full: 3,200 partitions, 8 waves.
4. **Check the other side.** The shuffle is now 9,400 map tasks × 3,200 reducers ≈ 30 million blocks averaging 20 KB. Tiny blocks mean random I/O and per-fetch overhead. Raising `maxPartitionBytes` to 512 MB cuts map tasks to about 2,350 and the block count to 7.5 million of about 80 KB each.

**Adaptive query execution** (on by default since Spark 3.2) automates part of this. It re-plans at each stage boundary using the real shuffle statistics: it can **coalesce** many small shuffle partitions toward an advisory size (`spark.sql.adaptive.advisoryPartitionSizeInBytes`, 64 MB), switch a sort-merge join to a broadcast join when one side turns out to be small, and split skewed partitions. Set `spark.sql.shuffle.partitions` high and let AQE coalesce it down; it cannot split an under-partitioned stage back up except for skew.

Output partitions deserve the same care. Writing the 3,200 aggregate partitions produces 3,200 files, perhaps 1 MB each, which is exactly the small-files problem from the [previous lesson](/learn/big-data/batch-processing/distributed-file-systems). `coalesce(16)` before the write merges partitions without a shuffle (but also reduces the parallelism of the stage that computes them, because the coalesce is pushed up into that stage); `repartition(16)` adds a shuffle but keeps upstream parallelism.

## Under the hood: Tungsten, the sort shuffle and AQE

### UnsafeRow and code generation

A row is one contiguous byte region: a null bitmap (8 bytes per 64 fields), then an 8-byte slot per field holding fixed-width values inline and, for strings and arrays, an offset and length into a variable-length tail. Comparing, hashing and copying a row is `memcpy`-style work on bytes, there is nothing for the garbage collector to trace, and the region can live off-heap (`spark.memory.offHeap.enabled`). Sorting uses 8-byte records of a pointer plus a key prefix, so most comparisons never dereference the row; the array of records fits cache lines rather than chasing object references.

Since Spark 2.0 the physical operators inside a stage are collapsed into one generated Java class with a single loop, compiled at runtime with Janino, which removes the per-row virtual calls of the iterator model. The plan shows the fused group as `*(1)` prefixes. Generated methods larger than the JIT's 8,000-byte limit are interpreted rather than compiled, which is why a `select` with hundreds of expressions can be slower than two smaller ones.

### The sort-based shuffle

Since Spark 2.0 there is one shuffle manager. A map task with map-side aggregation or more than 200 output partitions (`spark.shuffle.sort.bypassMergeThreshold`) buffers serialised rows with their partition id, sorts by partition id when memory runs out, spills, and finally merges its spills into one data file plus one index file, keeping file counts at 2 per map task regardless of the reducer count. Below the threshold and without aggregation, the bypass writer opens one file per reducer and concatenates them at the end. Reducers request blocks over Netty, holding at most `spark.reducer.maxSizeInFlight` (48 MB) outstanding. With dynamic allocation, an **external shuffle service** on each node serves the files after the executor that wrote them has been released; without it, losing an executor loses its shuffle output. Spark 3.2 added push-based shuffle, where map tasks pre-merge their blocks onto the reducers' nodes, cutting the number of small fetches.

### Adaptive execution

At each stage boundary AQE reads the `MapStatus` for every map task (the sizes of every block, compressed to a byte per block for large stages), and applies three rules: coalesce adjacent small partitions until they reach the advisory size; for a sort-merge join, split any partition larger than both `spark.sql.adaptive.skewJoin.skewedPartitionFactor` (5) times the median and `skewedPartitionThresholdInBytes` (256 MB) into several tasks that each read one slice of the skewed side and the whole matching partition of the other; and convert the join to a broadcast when the runtime size of one side is below the threshold. That is also why `explain()` before execution shows `AdaptiveSparkPlan isFinalPlan=false`: the real plan is only known once the statistics exist.

## Joins: the most expensive decision in the plan

Spark chooses among three physical joins:

| Strategy | When | Cost |
|---|---|---|
| **Broadcast hash join** | One side is below `spark.sql.autoBroadcastJoinThreshold` (10 MB by default) or hinted with `F.broadcast(df)` | No shuffle of the big side; the small side is collected to the driver, then sent to every executor and built into a hash table |
| **Sort-merge join** | Default for two large inputs | Both sides are shuffled by the join key and sorted, then merged |
| **Shuffled hash join** | Both large, one side's partitions fit in memory | Both sides shuffled; the smaller side of each partition is hashed instead of sorted |

Broadcast is not free. Broadcasting a 1 GB table to 100 executors first pulls it into the driver (which fails outright above `spark.driver.maxResultSize`, 1 GB by default), then moves 100 GB over the network and puts a 1 GB hash table (often several gigabytes once deserialised) in every executor's memory. Raise the threshold to a few hundred megabytes when the numbers work, not to "whatever makes the shuffle go away".

For tables that are joined on the same key again and again, **bucketing** pays the shuffle once at write time: `df.write.bucketBy(512, "user_id").sortBy("user_id").saveAsTable(...)`. Two tables bucketed identically on the join key can be sort-merge joined without an exchange. Table formats offer similar layouts through partition transforms such as `bucket(512, user_id)`.

## Skew: the one task that never finishes

Back to the three-hour job. Its real join is against the 40 GB title metadata table, far too big to broadcast, so Spark shuffles both sides by `title_id` and runs a sort-merge join. Hash partitioning spreads distinct keys evenly across partitions, but it cannot split a single key. The new series produced 18% of yesterday's plays, so every one of its play rows went to the same join partition, and one task processed tens of times more rows than its neighbours. The same arithmetic governs hot keys in any [partitioned store](/learn/system-design/distributed-systems/partitioning-and-rebalancing).

```viz
{"type": "system", "scenario": "sharding-hash", "nodes": 3,
 "title": "Hash partitioning spreads keys, not load",
 "caption": "Each key goes to partition hash(key) mod n, exactly like a shuffle. Distinct keys spread evenly, but every row for one hot key lands in one partition, and changing the partition count reshuffles almost everything."}
```

**Detect it** in the Spark UI: in the stage's task summary, compare the max task duration and shuffle-read size with the median. A max ten times the median is skew; a uniformly slow stage is under-partitioning or spill. Before the job runs, `plays.groupBy("title_id").count().orderBy(F.desc("count")).limit(20)` on a sample tells you whether any key holds more than a few per cent of the rows.

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

The snippet salts every key for brevity, which replicates the whole 40 GB side 16 times: a 640 GB mistake. The production version salts only the handful of hot keys (found with the `groupBy` above) and give every other key salt 0, so only the hot titles' metadata rows are copied. A random salt is correct for a join, because each fact row still matches exactly one copy of its dimension row. That is different from the distinct-count case in the MapReduce lesson, where the salt had to be a function of the record. Seed the random generator so a retried task produces the same salts.

For aggregations, skew is usually harmless because partial aggregation collapses the hot key on the map side, which is one more reason to prefer built-in aggregates over `groupBy(...).applyInPandas` or `collect_list` followed by custom code.

## Production failure modes

**One task runs for hours; the rest finish in minutes.** Symptom: the stage's max task duration and shuffle read are ten to a hundred times the median. Diagnosis: a hot join key, most often a null or placeholder. Fix: filter placeholders, let AQE split, then salt the remaining hot keys.

**Every task in a stage spills and the stage is uniformly slow.** Symptom: "Spill (disk)" is a multiple of the shuffle read; 200 tasks on a 400-core cluster. Diagnosis: `spark.sql.shuffle.partitions` left at 200 for a 600 GB shuffle. Fix: size partitions from the shuffle bytes and let AQE coalesce down.

**The driver dies with `OutOfMemoryError` on a join.** Symptom: the failure happens before any task of the join stage runs; the log mentions `BroadcastExchange` or `maxResultSize`. Diagnosis: the broadcast side is collected to the driver first, and a "small" table grew past the driver's heap or past `spark.driver.maxResultSize`. Fix: lower the broadcast threshold or drop the hint, filter and prune the dimension before joining, or bucket.

**A stage keeps restarting after executors are released.** Symptom: waves of `FetchFailedException`, map stages re-run, the job takes several times longer than expected under dynamic allocation. Diagnosis: executors that held shuffle files were removed when idle, and no external shuffle service was serving them. Fix: enable the external shuffle service (or the storage-decommissioning migration in 3.1+), or keep executors alive across the shuffle.

**Numbers differ between two runs of the same job.** Symptom: a small fraction of rows are missing or duplicated only when tasks were retried. Diagnosis: a non-deterministic expression (`rand()` without a seed, `monotonically_increasing_id()`, a UDF reading the clock) before a shuffle, so a recomputed partition produced different rows. Fix: seed every random expression, derive ids from data, and keep side effects out of transformations.

**A ten-minute job leaves 3,200 one-megabyte files.** Symptom: the next job's scan spends its time opening files. Diagnosis: the write inherited the shuffle partition count. Fix: `coalesce` or `repartition` to a size-based file count before writing, or rely on the table format's compaction.

**A Python job is ten times slower than its SQL equivalent.** Symptom: executors show low CPU in the JVM and busy `pyspark.daemon` workers. Diagnosis: a row-at-a-time Python UDF, pickling every row across the process boundary and hiding the logic from Catalyst. Fix: built-in functions, SQL expressions, or a pandas UDF that moves Arrow batches.

## Caching, memory and Python

- **Cache deliberately.** `df.cache()` keeps a DataFrame in executor memory after the first action, which pays off only if you reuse it in several actions. An unused cache evicts shuffle and execution memory. Unpersist when done.
- **Memory is shared.** Executors split the unified pool between execution (shuffles, joins, aggregations) and storage (cache); when execution runs out, operators spill sorted runs to disk. Spill in the UI means a partition is too big, not that the cluster is too small.
- **Avoid row-at-a-time Python UDFs.** A plain Python UDF ships every row from the JVM to a Python worker and back, typically an order of magnitude slower than the equivalent built-in function, and it is opaque to the optimiser (no pushdown). Use built-ins, SQL expressions, or vectorised pandas UDFs, which move data in Arrow batches.
- **Never `collect()` a large DataFrame.** It pulls every row into the driver's memory.

## What mid-level engineers get wrong

- **Leaving `spark.sql.shuffle.partitions` at 200.** Multi-gigabyte partitions spill and half the cluster idles.
- **Calling `count()` as a sanity check.** Every action re-runs the plan from the source unless the result is cached; the "check" doubles the job.
- **Writing `repartition(1)` to get one file.** The entire dataset flows through one task.
- **Broadcasting anything that "fits".** The table is collected to the driver and copied to every executor; a few hundred megabytes is the sensible ceiling.
- **Using `rand()` without a seed before a shuffle.** Retried tasks produce different rows and the totals drift.
- **Caching every intermediate DataFrame.** Storage memory squeezes execution memory and the job spills more, not less.

## Interviewer follow-ups

**"Why 200 shuffle partitions, and what would you set instead?"** Model answer: 200 is a historical default that predates AQE; size from shuffle bytes at 100–200 MB per partition, rounded to a multiple of the cores, and set it high so AQE can coalesce. Common wrong answer: "match the number of cores", which gives multi-gigabyte partitions on a large shuffle.

**"An executor holding shuffle files dies mid-job. What happens?"** Model answer: the next stage's fetches fail, the scheduler resubmits the map stage for the missing partitions only, recomputes them from lineage, and the reduce stage retries; with an external shuffle service the files survive executor loss and only true node loss triggers recomputation. Common wrong answer: "the job restarts from the beginning".

**"`coalesce(16)` versus `repartition(16)` before a write?"** Model answer: `coalesce` avoids a shuffle but is pushed into the preceding stage, cutting that stage to 16 tasks; `repartition` costs a shuffle and keeps upstream parallelism; choose by whether the preceding stage is heavy. Common wrong answer: "coalesce is always cheaper".

**"When is a broadcast join wrong even though the table fits in memory?"** Model answer: when the driver cannot hold it, when it is joined once by a handful of tasks (the copy to every executor costs more than a shuffle of a small fact side), or when the "small" side is filtered at runtime and AQE would have broadcast it anyway. Common wrong answer: "never, broadcast is always faster than a shuffle".

**"How does AQE decide a partition is skewed?"** Model answer: from the map-side block sizes at the stage boundary, a partition larger than five times the median and larger than 256 MB, for sort-merge joins only; aggregations are left alone because partial aggregation already collapsed the key. Common wrong answer: "it samples the data before the job starts".

## Exercise

```exercise
id: shuffle-plan
title: Compute the shuffle matrix and find skewed partitions
prompt: |
  Simulate the map side of one Spark shuffle. `map_outputs` is a list with one
  entry per map task; each entry is a list of `[key, bytes]` records the task
  emits. A record goes to reduce partition
  `p = (sum of the character codes of key) % num_reducers`.

  Return an object with three fields:
  - `blocks`: a matrix (list per map task) of the bytes each map task writes
    for each reduce partition, index 0 to num_reducers - 1.
  - `reduce_input`: the total bytes each reduce partition will fetch (the
    column sums of `blocks`).
  - `skewed`: the indices (ascending) of reduce partitions whose input is
    strictly greater than 5 times the median of `reduce_input` AND strictly
    greater than `threshold` bytes, which is how adaptive execution decides
    to split a partition. The median of an even-length list is the mean of
    its two middle values.
languages: [python, javascript]
entry: shuffle_plan
starter:
  python: |
    def shuffle_plan(map_outputs, num_reducers, threshold):
        def partition(key):
            return sum(ord(c) for c in key) % num_reducers
        # your code here
        return {"blocks": [], "reduce_input": [], "skewed": []}
  javascript: |
    function shuffle_plan(map_outputs, num_reducers, threshold) {
      const partition = (key) => {
        let s = 0;
        for (const ch of key) s += ch.charCodeAt(0);
        return s % num_reducers;
      };
      // your code here
      return { blocks: [], reduce_input: [], skewed: [] };
    }
tests:
  - args: [[[["a", 10], ["b", 20]], [["a", 30], ["c", 5]]], 2, 0]
    expected: {"blocks": [[20, 10], [0, 35]], "reduce_input": [20, 45], "skewed": []}
  - args: [[[["hot", 500], ["x", 1]], [["hot", 600], ["y", 1]], [["hot", 700], ["z", 1]]], 3, 100]
    expected: {"blocks": [[1, 500, 0], [0, 601, 0], [0, 700, 1]], "reduce_input": [1, 1801, 1], "skewed": [1]}
    label: one hot key lands in one partition however many map tasks emit it
  - args: [[[["hot", 50]], [["x", 1]], [["y", 1]], [["z", 1]]], 4, 256]
    expected: {"blocks": [[0, 0, 0, 50], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], "reduce_input": [1, 1, 1, 50], "skewed": []}
    label: fifty times the median but below the byte threshold is not worth splitting
  - args: [[[], [["a", 7]]], 2, 0]
    expected: {"blocks": [[0, 0], [0, 7]], "reduce_input": [0, 7], "skewed": []}
    label: a map task that emits nothing still has a row of zeros
  - args: [[[["a", 1], ["b", 2]]], 1, 0]
    expected: {"blocks": [[3]], "reduce_input": [3], "skewed": []}
    hidden: true
    label: a single reducer can never be skewed relative to itself
  - args: [[[["hot", 900], ["dog", 800]], [["x", 1], ["z", 1], ["v", 1]]], 5, 100]
    expected: {"blocks": [[0, 900, 0, 0, 800], [1, 0, 1, 1, 0]], "reduce_input": [1, 900, 1, 1, 800], "skewed": [1, 4]}
    hidden: true
    label: two hot keys, two skewed partitions
  - args: [[[["hot", 50]], [["x", 1]], [["y", 1]], [["z", 1]]], 4, 0]
    expected: {"blocks": [[0, 0, 0, 50], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], "reduce_input": [1, 1, 1, 50], "skewed": [3]}
    hidden: true
    label: the same data with a zero threshold is split
hints:
  - "Build `blocks` first: one list of `num_reducers` zeros per map task, adding each record's bytes at `partition(key)`."
  - "`reduce_input[p]` is the sum of `blocks[m][p]` over all map tasks m."
  - "Sort a copy of `reduce_input` to find the median; for an even length average the two middle values."
```

## Senior signals

- You read `explain()` bottom-up and count **exchanges**; you can say which operators are fused into which stage and where the combiner is.
- You know why DataFrames beat RDDs: **Catalyst** sees the work and **Tungsten** keeps rows as bytes, so PySpark code that stays in the DataFrame API never pickles a row.
- You size shuffle partitions from the **shuffle bytes** (100–200 MB per partition, a multiple of cores), check the map × reduce block count, and let AQE coalesce, instead of accepting 200.
- You can explain what a map task writes (**one data file, one index file**), what a reducer fetches, and what "Spill (disk)" in the UI means about partition size versus executor memory.
- You pick joins deliberately: **broadcast** when one side is genuinely small and the driver can hold it, bucketing for repeated large joins, and you know broadcast costs network and memory on every executor.
- You diagnose **skew** from the task-duration distribution, fix null and placeholder keys first, know AQE's 5× and 256 MB rule, and know when a random salt is correct (joins) and when it is not (distinct counts).
- You treat **determinism** as a requirement because Spark recovers by recomputing lineage, and you control **output file counts** as part of the job's design.

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
    Broadcast copies the whole table to every executor: 2 GB × 300 = 600 GB moved, and each executor builds a full in-memory hash table, usually larger than the on-disk size, risking out-of-memory errors; the driver has to hold it first as well. Broadcast wins for small tables, not for anything that merely avoids a shuffle.
- q: >-
    One task in a join stage reads 40 GB of shuffle data; the median task reads 150 MB. What is the most likely cause and a good first move?
  options: ["Under-partitioning; raise the number of shuffle partitions", "A hot join key; check for null keys, then AQE or salting", "Slow executor hardware; enable speculative execution", "Too many small input files; compact them before the join"]
  answer: 1
  explanation: >-
    A single partition hundreds of times the median is key skew. More partitions cannot split one key, and speculation only re-runs the same 40 GB elsewhere. Null or placeholder keys are the most common culprit, then AQE skew splitting or salting the key.
- q: >-
    Why is it acceptable to use a random salt when fixing a skewed join, but not when computing a distinct count per key in two stages?
  options: ["Spark removes the duplicate matches from salted joins", "Joins are commutative and associative; distinct counts are not", "Each fact row still meets exactly one dimension row copy", "Spark only permits random expressions inside join keys"]
  answer: 2
  explanation: >-
    The replicated dimension side guarantees every salted fact row finds its match exactly once, so the join result is unchanged. In the distinct count the same value could land in several buckets and be counted more than once: partial distinct counts only add up when the buckets are disjoint, which requires salting by a function of the value being counted.
- q: >-
    Under dynamic allocation, a job's reduce stage fails repeatedly with FetchFailedException and its map stage keeps re-running, though no machine has crashed. What is the most likely cause?
  options: ["AQE coalesced the partitions after the map stage had finished", "The shuffle blocks exceeded the 48 MB in-flight fetch limit", "Idle executors were released along with the shuffle files they held", "The map tasks wrote their output with a non-deterministic salt"]
  answer: 2
  explanation: >-
    Shuffle files live on the executor that wrote them. When dynamic allocation removes idle executors and no external shuffle service is serving their files, every fetch of those blocks fails and the scheduler recomputes the map stage. The in-flight limit only throttles fetches, AQE re-plans before the reduce stage runs, and a bad salt changes results rather than causing fetch failures.
```
