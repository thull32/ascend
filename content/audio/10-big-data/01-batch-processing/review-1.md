---
review: batch-processing
source: 13f2f5e5f2734773
---
## Introduction

Twelve questions from the batch-processing module. Answer out loud before the answer comes.

They run in lesson order: MapReduce, distributed file systems, Spark, columnar formats and lakehouses, and OLAP engines. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A job computes the average watch time per title. An engineer adds the reduce function, which returns the mean of its inputs, as a combiner to cut shuffle volume. What happens?

A, the job gets faster, but some averages are wrong. B, the job gets faster and every average stays correct. C, the job fails, because combiners cannot emit floating-point numbers. D, nothing changes, because the framework ignores combiners for averages.

[think]

The answer is A: the job gets faster, but some averages are wrong.

The mean is not associative. The mean of per-mapper means weights each mapper equally, however many records it saw, and the framework will happily run it and produce wrong numbers. Shuffle sum and count pairs instead, combine them by addition, and divide only in the final reduce.

## Question 2

A worker that completed three map tasks dies while the reduce phase is fetching their output. What does the master do?

A, nothing, because those map tasks already completed. B, it asks the reducers to skip that worker's partitions. C, it restarts the whole job, since the shuffle state is lost. D, it re-runs those three map tasks on other workers.

[think]

The answer is D: it re-runs those three map tasks on other workers.

Map output lives on the mapper's local disk, not in the replicated file system, so completed map work is lost with the machine and must be recomputed elsewhere. Only those tasks re-run, and reducers that already fetched a segment keep it. Completed reduce output, by contrast, is already in the distributed file system and survives.

## Question 3

You salt a skewed distinct-count job by appending a random number from 0 to 15 to each title key, then sum the 16 partial distinct counts per title. Why is the result wrong?

A, sums of distinct counts are never correct, whatever the salt. B, random salts create more skew than the original key. C, the second stage needs a combiner to merge the partial results. D, a user can land in several buckets and be counted in each.

[think]

The answer is D: a user can land in several buckets and be counted in each.

Distinct counts only add across disjoint sets. A random salt sends one user's events to several buckets, so that user is counted several times. Salting by a hash of the user id keeps each user in one bucket, makes the partial sets disjoint, and makes the sum correct.

## Question 4

An HDFS cluster stores 400 million files averaging 200 kilobytes. What problem are you most likely to hit first?

A, NameNode heap pressure from its in-memory objects. B, running out of disk capacity on the DataNodes. C, the CPU cost of verifying every block's checksum. D, saturated cross-rack network bandwidth during writes.

[think]

The answer is A: NameNode heap pressure from its in-memory objects.

Every file and every block is an object in the NameNode's heap. 400 million files plus their blocks is on the order of 800 million namespace objects, far past what one NameNode heap handles comfortably, with garbage-collection pauses to match. The total data, about 80 terabytes, is modest. The object count is the problem.

## Question 5

When an 8-terabyte disk fails in a thousand-node HDFS cluster, why is recovery much faster than rebuilding a RAID array?

A, a RAID rebuild must verify checksums, which HDFS skips. B, HDFS compresses the blocks before copying them to new disks. C, the surviving replicas are spread out, so many nodes copy at once. D, HDFS re-replicates only the blocks that clients actually read.

[think]

The answer is C: the surviving replicas are spread out, so many nodes copy at once.

The lost blocks' other replicas are scattered over hundreds of nodes, each copying a few gigabytes at the same time. A RAID rebuild writes all 8 terabytes onto one spare disk at single-disk speed, which takes many hours. HDFS verifies checksums too; the difference is parallelism.

## Question 6

You broadcast a 2-gigabyte dimension table to 300 executors to avoid a sort-merge join. What is the most likely consequence?

A, about 600 gigabytes moved, and a huge hash table in every executor. B, each executor receives only its three-hundredth slice of the table. C, Spark silently falls back to a broadcast nested loop join. D, the join becomes almost free, because no shuffle is needed.

[think]

The answer is A: about 600 gigabytes moved, and a huge hash table in every executor.

Broadcast copies the whole table to every executor: 2 gigabytes times 300 is 600 gigabytes. Each executor builds a full in-memory hash table, usually larger than the on-disk size, risking out-of-memory errors, and the driver has to hold the table first as well. Broadcast wins for small tables, not for anything that merely avoids a shuffle.

## Question 7

One task in a join stage reads 40 gigabytes of shuffle data, while the median task reads 150 megabytes. What is the most likely cause, and a good first move?

A, under-partitioning; raise the number of shuffle partitions. B, a hot join key; check for null keys, then use adaptive query execution or salting. C, slow executor hardware; enable speculative execution. D, too many small input files; compact them before the join.

[think]

The answer is B: a hot join key. Check for null keys, then adaptive execution or salting.

One partition hundreds of times the median is key skew. More partitions cannot split a single key, and speculation only re-runs the same 40 gigabytes somewhere else. Null or placeholder keys are the most common culprit; after that, adaptive execution's skew splitting, or salting the key.

## Question 8

Two Spark jobs commit to the same Iceberg table at the same moment. What happens?

A, the table stays locked until an administrator releases it. B, one pointer swap wins, and the other rebases, retries, or fails. C, the later commit silently overwrites the earlier one's files. D, both succeed, and the catalog merges their metadata files.

[think]

The answer is B: one pointer swap wins, and the other rebases, retries, or fails.

Iceberg uses optimistic concurrency. The catalog swaps the metadata pointer only if it still points at the version the writer started from. The loser re-reads the new base and retries if the changes do not conflict, or fails on a real conflict. Nothing is silently lost, the catalog never merges metadata, and there is no global lock.

## Question 9

A GDPR process deletes a user's rows with a DELETE on a merge-on-read Iceberg table. When are the user's bytes actually gone from storage?

A, immediately, as soon as the delete transaction commits. B, never, because Parquet data files are immutable. C, after the next schema change rewrites the data files. D, after compaction, and expiry of the older snapshots.

[think]

The answer is D: after compaction, and expiry of the older snapshots.

The delete commit only adds delete files. The original data files still exist, and older snapshots still reference them for time travel. Compaction produces files without the rows, and snapshot expiry removes the old files; privacy deletion needs both. Immutability means files are replaced, not that bytes can never be removed.

## Question 10

Why does vectorised execution outperform the row-at-a-time iterator model on analytical queries?

A, it skips reading the columns the query does not need. B, it pays call overhead per batch, in loops that suit SIMD instructions. C, it needs less memory per row than the iterator model. D, it caches query results between repeated executions.

[think]

The answer is B: it pays call overhead per batch, in SIMD-friendly loops.

The classic iterator model, Volcano, pays a virtual call per row per operator. Vectorised engines pay it once per batch of thousands of values, and run tight, cache-friendly loops over contiguous column values. Skipping unneeded columns is a storage-format benefit available to both models, and result caching is unrelated.

## Question 11

Five hundred application servers insert one row per event directly into ClickHouse, and inserts start failing with a "too many parts" error. What is the underlying cause?

A, the sort key has too many columns for each insert. B, each insert makes a part faster than merges can combine them. C, ClickHouse cannot accept 500 concurrent writers at once. D, the sparse primary index has run out of memory on the server.

[think]

The answer is B: each insert makes a part faster than merges can combine them.

MergeTree turns each insert into an immutable sorted part and relies on background merges, much like LSM compaction. Tiny, frequent inserts create parts faster than merges can keep up. The fixes are batch inserts, asynchronous insert buffering, or a Kafka consumer that batches; the number of writers matters only because each one sends tiny inserts.

## Question 12

A dashboard shows average session length per country from an hourly rollup that stores the average per country and hour. The daily numbers disagree with a direct query on the raw data. Why?

A, averages of averages ignore each hour's session count. B, each country must be rolled up in a separate table. C, floating-point rounding builds up across the hourly rollups. D, the hourly rollup is missing late-arriving sessions.

[think]

The answer is A: averages of averages ignore each hour's session count.

Averages are not additive. Averaging hourly averages weights every hour equally, however many sessions it had. Store the sum and the count per hour, and compute the exact average as total sum over total count. Late data could cause small differences, but the systematic error comes from averaging averages.

## Recap

Two ideas kept coming back. First, only some aggregates can be split and recombined: means, distinct counts and stored averages all break when you combine partial results, so carry sums and counts, and keep partial sets disjoint. Second, where intermediate data lives decides what a failure costs: map output on local disk is recomputed, the NameNode's heap caps the file count, and a lake table's old snapshots keep deleted bytes alive until compaction and expiry. And a third, for skew: more partitions never split one hot key.
