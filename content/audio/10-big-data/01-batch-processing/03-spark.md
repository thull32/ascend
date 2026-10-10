---
lesson: spark
source: 586902efd05b1813
fit: great
desk:
  - "The example physical plan from explain, read bottom-up"
  - "The shuffle traced by hand: partial aggregates, the byte matrix and the index file offsets"
  - "The partition-sizing worked example and the salted-join code"
  - "Exercise: compute the shuffle matrix and find skewed partitions"
---
## Introduction

A nightly Spark job joins a day of playback events with a 40-gigabyte title metadata table and adds up viewing time per title and country. It used to take 20 minutes. Since a big series launched, it takes three hours. The Spark UI shows 3,199 of 3,200 tasks in the final stage finishing within two minutes. One task has been running for two and a half hours and has spilled 90 gigabytes to disk. Adding executors changes nothing.

Nothing about that failure is visible in the code, which is ten lines of DataFrame calls. It is visible only if you know what Spark does with those ten lines: build a plan, cut it into stages at every shuffle, run one task per partition, and send every row with the same key to the same task.

Four ideas, then. How your code becomes a plan, stages and tasks. The arithmetic for sizing partitions instead of folklore. How Spark picks a join. And skew: why one task never finishes.

## RDDs and DataFrames

Spark's original abstraction is the RDD, a resilient distributed dataset: a list of partitions, a function that computes each partition from its parents, and the dependencies on those parents. A map produces a partition that depends only on the matching parent partition. That is a narrow dependency. A reduce by key produces partitions that each depend on every parent partition. That is a wide dependency, and it means a shuffle. The chain of dependencies is called lineage, and it is what makes an RDD resilient: a lost partition is recomputed from its parents, not restored from a copy.

RDDs hold arbitrary JVM objects, and that is their limit. A row of three fields is three boxed objects plus a container for the garbage collector to trace. Shuffling it means Java serialisation. And Spark cannot see inside your lambda, so it cannot reorder or prune anything. In PySpark it is worse: every record is pickled, sent to a Python worker process, transformed, and pickled back.

DataFrames fix this with two engines. Catalyst is the optimiser: it understands filter, select and join, and applies rules like pushing predicates down, pruning columns and reordering joins. Tungsten is the execution layer: rows live in a compact binary format Spark manages itself, and whole stages are compiled to bytecode. In Python, a DataFrame keeps the data in the JVM and describes the work declaratively, so a row never has to be pickled.

One RDD habit survives into DataFrame code. Group by key shuffles every value, while reduce by key combines on the map side first. In DataFrames, a group-by with a sum gets that partial aggregation automatically. A group-by that collects a list, or hands each group to pandas, cannot, and behaves like the old group by key.

## From code to stages

Spark is lazy. Filter, select, join and group-by only build a logical plan. An action, like count, collect or write, hands that plan to Catalyst, which rewrites it, picks physical operators and runs it.

Ask for the plan of a simple aggregate-then-join and read it from the bottom up, and every idea from MapReduce is there. The file scan reads only three columns, skips every date directory except one, and hands the duration filter to the Parquet reader. Above it, a partial count and a partial sum: that is the combiner. Above that, an operator called Exchange: that is the shuffle. And at the top, a broadcast hash join, meaning the small titles table was copied to every executor so the big side never moves for the join.

An action becomes a job. The scheduler cuts a stage at every exchange, and runs one task per partition of each stage. Narrow operations, filter, select, partial aggregation, are fused inside one task and compiled into a single tight loop, row by row, writing nothing out. A wide operation ends the stage: each task writes its output to local disk, sorted by target partition, as one data file and one index file, and every task in the next stage fetches its block from every map task. Each exchange is another full write, network transfer and read of the data flowing through it. Counting exchanges in the plan is the fastest way to estimate a job's cost.

When an executor dies, Spark does what MapReduce did: it re-runs lost tasks, up to four times. If shuffle output was lost, the next stage fails to fetch it, and the scheduler re-runs the map stage for only the missing partitions, walking the lineage back to data it still has. That is why transformations must be deterministic. An unseeded random value before a shuffle can produce different rows after a retry, and the totals drift between runs.

## Partition arithmetic

Three partition counts matter: the input, which defaults to 128 megabytes per read task; the shuffle, which defaults to 200 partitions; and the output, which decides how many files you write.

Work an example. The job reads 1.2 terabytes of Parquet and shuffles 600 gigabytes for its aggregation. The cluster has 100 executors with four cores each, so 400 tasks run at once.

Reading at 128 megabytes per task gives about 9,400 tasks, roughly 24 waves of 400. Fine. The shuffle, at the default 200 partitions, gives 3 gigabytes per reduce task. Each task must aggregate 3 gigabytes with a few hundred megabytes of execution memory, so it spills to disk again and again, and only 200 of the 400 cores have any work at all. This is the most common Spark misconfiguration in production.

What does spilling look like? On an executor with a 4-gigabyte heap and four task slots, the shared memory pool is about 2.2 gigabytes, and one task can claim at most about 560 megabytes. A 3-gigabyte partition fills that, sorts it, writes it to disk, empties it, and repeats: about six spilled runs, then a merge that reads them all back. The task takes several times longer. Spill is a partition-size problem, not a cluster-size problem.

So choose a target: roughly 100 to 200 megabytes per shuffle partition. 600 gigabytes divided by 200 megabytes is 3,000. Round to a multiple of the core count so the last wave is full: 3,200 partitions, eight waves. Then check the other side. 9,400 map tasks times 3,200 reducers is about 30 million shuffle blocks, averaging 20 kilobytes, which means per-fetch overhead. Raise the input size to 512 megabytes and the map tasks drop to about 2,350, and the blocks to 7.5 million of about 80 kilobytes.

Adaptive query execution, on by default since Spark 3.2, automates part of this. At each stage boundary it looks at the real shuffle sizes, merges small partitions toward 64 megabytes, switches to a broadcast join when one side turns out small, and splits skewed partitions. So set the shuffle partition count high and let it coalesce down. It cannot split an under-partitioned stage back up, except for skew.

And mind the output. Write 3,200 aggregate partitions and you get 3,200 files of perhaps a megabyte each: the small-files problem. Coalesce to 16 before writing avoids a shuffle, but it is pushed up into the stage that computes the data, cutting that stage to 16 tasks. Repartition to 16 costs a shuffle but keeps the upstream parallelism. Choose by whether the stage before the write is heavy.

## Joins

Spark picks among three joins. A broadcast hash join, when one side is under a threshold of 10 megabytes by default, or when you hint it. A sort-merge join, the default for two large inputs, which shuffles both sides by the join key and sorts them. And a shuffled hash join, which shuffles both but hashes the smaller side of each partition instead of sorting.

Broadcast is not free. Broadcasting a 1-gigabyte table to 100 executors first pulls it into the driver, which fails outright above a 1-gigabyte limit by default. Then it moves 100 gigabytes over the network and puts a hash table in every executor, often several gigabytes once deserialised. So raise the threshold to a few hundred megabytes when the numbers work, not to whatever makes the shuffle go away.

For tables joined on the same key again and again, bucketing pays the shuffle once, at write time. Two tables bucketed identically on the join key can be sort-merge joined with no exchange at all.

## Skew

Back to the three-hour job. Its real join is against the 40-gigabyte metadata table, far too big to broadcast, so Spark shuffles both sides by title and runs a sort-merge join. The new series produced 18 percent of yesterday's plays. Before I say it: why did adding executors do nothing?

[pause]

Because hash partitioning spreads distinct keys evenly, but it cannot split a single key. Every play of that series went to the same join partition, so one task processed tens of times more rows than its neighbours. More executors just means more idle cores waiting for it.

Detect it in the UI by comparing a stage's maximum task duration and shuffle read against the median. A maximum ten times the median is skew. A stage where every task is uniformly slow is under-partitioning or spill instead.

Fix it in this order. First, let adaptive execution split it: for sort-merge joins it splits any partition that is more than five times the median and larger than 256 megabytes into smaller tasks, duplicating the matching partition from the other side. Second, look for null or placeholder keys, like a title id of minus one; they are the most common hot key and usually should not be joined at all. Third, salt the join: spread the hot side over, say, 16 sub-keys, and replicate the other side 16 times so each sub-key finds its match.

Salt only the hot keys. Salting every key would replicate the whole 40-gigabyte side 16 times, a 640-gigabyte mistake. And notice that a random salt is fine here, unlike the distinct count in the MapReduce lesson: each play row still meets exactly one copy of its metadata row, so the join result is unchanged. Seed the random generator, so a retried task produces the same salts.

For aggregations, skew is usually harmless, because partial aggregation collapses the hot key on the map side. One more reason to prefer built-in aggregates over custom per-group Python. The same goes for row-at-a-time Python functions in general: each one ships every row from the JVM to a Python worker and back, typically an order of magnitude slower than the built-in, and invisible to the optimiser. Use built-ins, or pandas functions that move data in Arrow batches.

## In the interview

A follow-up the lesson expects: why 200 shuffle partitions, and what would you set instead?

[pause]

200 is a historical default from before adaptive execution. Size from the shuffle bytes at 100 to 200 megabytes per partition, round to a multiple of the cores, and set it high so adaptive execution can coalesce. The wrong answer is "match the number of cores", which gives multi-gigabyte partitions on a big shuffle.

And another: an executor holding shuffle files dies mid-job. What happens? The next stage's fetches fail, the scheduler re-runs the map stage for only the missing partitions from lineage, and the reduce stage retries. With an external shuffle service, the files outlive the executor, and only losing the whole node forces recomputation. The wrong answer is "the job restarts from the beginning".

## Recap

Four things to remember. Read a plan bottom-up and count the exchanges: each one is a stage boundary and a full write, transfer and read. Size shuffle partitions from shuffle bytes, 100 to 200 megabytes each, never the default 200, and let adaptive execution coalesce; spill means partitions are too big. Pick joins deliberately: broadcast only what is genuinely small, and bucket tables you join repeatedly. And diagnose skew from the task distribution: fix placeholder keys first, then let adaptive execution split, then salt only the hot keys, knowing a random salt is right for joins and wrong for distinct counts.

At your desk: the physical plan, the shuffle traced by hand, the sizing example and salted-join code, and the shuffle matrix exercise.
