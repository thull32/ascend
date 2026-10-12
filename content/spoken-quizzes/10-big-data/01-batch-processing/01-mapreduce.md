---
lesson: mapreduce
source: f280f9d12a05e275
---
## 1

A job computes the average watch time per title. An engineer adds the reduce function, which returns the mean of its inputs, as a combiner to cut shuffle volume. What happens?

A, the job gets faster, but some averages are wrong. B, the job gets faster and every average stays correct. C, the job fails, because combiners cannot emit floating-point numbers. D, nothing changes, because the framework ignores combiners for averages.

[think]

The answer is A: the job gets faster, but some averages are wrong.

The mean is not associative. The mean of per-mapper means weights each mapper equally, however many records it saw, and the framework will happily run it and produce wrong numbers. Shuffle sum and count pairs instead, combine them by addition, and divide only in the final reduce.

## 2

A job has 8,000 map tasks and 1,000 reducers, and the shuffle after the combiner is 2 gigabytes. What is the main cost of the shuffle?

A, network bandwidth to move the 2 gigabytes between machines. B, 8 million fetches of about 250 bytes each, dominated by overhead. C, replicating the 2 gigabytes of shuffle data three times in HDFS. D, sorting and merging the 2 gigabytes on the 1,000 reducers.

[think]

The answer is B: 8 million fetches of about 250 bytes each, dominated by overhead.

Every reducer fetches a segment from every map task: 8,000 times 1,000 is 8 million fetches, averaging 2 gigabytes over 8 million, or 250 bytes. Per-request overhead dominates, not bytes. Fewer reducers would make each fetch larger and the job faster. And shuffle data lives on the mappers' local disks, not in replicated HDFS.

## 3

A worker that completed three map tasks dies while the reduce phase is fetching their output. What does the master do?

A, nothing, because those map tasks already completed. B, it asks the reducers to skip that worker's partitions. C, it restarts the whole job, since the shuffle state is lost. D, it re-runs those three map tasks on other workers.

[think]

The answer is D: it re-runs those three map tasks on other workers.

Map output lives on the mapper's local disk, not in the replicated file system, so completed map work is lost with the machine and must be recomputed elsewhere. Only those tasks re-run, and reducers that already fetched a segment keep it. Completed reduce output, by contrast, is already in the distributed file system and survives.

## 4

You salt a skewed distinct-count job by appending a random number from 0 to 15 to each title key, then sum the 16 partial distinct counts per title. Why is the result wrong?

A, sums of distinct counts are never correct, whatever the salt. B, random salts create more skew than the original key. C, the second stage needs a combiner to merge the partial results. D, a user can land in several buckets and be counted in each.

[think]

The answer is D: a user can land in several buckets and be counted in each.

Distinct counts only add across disjoint sets. A random salt sends one user's events to several buckets, so that user is counted several times. Salting by a hash of the user id keeps each user in one bucket, makes the partial sets disjoint, and makes the sum correct.

## 5

Which property of MapReduce made speculative execution of straggling tasks safe?

A, deterministic tasks, committed by an atomic rename. B, the master keeps a copy of every intermediate result. C, reducers receive every key's values in sorted order. D, mappers run on the node that holds their data.

[think]

The answer is A: deterministic tasks, committed by an atomic rename.

A task writes its output to a temporary file and commits it with an atomic rename. Two copies of a deterministic task produce the same output, and exactly one of them becomes visible. Data locality and sorted keys have nothing to do with duplicate execution, and the master holds only metadata.

## 6

A map task's counters show 50 million map output records and 190 million spilled records, and the task spent most of its time in the sort phase. What does that tell you?

A, the partitioner sent most records to a single reducer. B, the combiner ran on every spill and inflated the count. C, the output overflowed the sort buffer and was merged in rounds. D, the reducer fetched each segment several times after failures.

[think]

The answer is C: the output overflowed the sort buffer and was merged in rounds.

The spilled records counter counts every record written to disk on the map side. A ratio near four means the output overflowed the 100 megabyte sort buffer into many spill files, which were then merged in several rounds, rewriting the records each time. A combiner would lower the count, not raise it, and neither partitioning nor reducer fetches affect this counter.
