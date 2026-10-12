---
lesson: distributed-file-systems
source: e196477aeebe0a0c
---
## 1

A Spark job writes 800 gigabytes to S3 using the classic rename-based output committer. Why is the job commit slow and unsafe?

A, S3 caps objects at 5 gigabytes, so large outputs must be split. B, rename is emulated by copying all 800 gigabytes, and not atomically. C, S3 is eventually consistent, so new files appear late. D, the NameNode must record every one of the written files.

[think]

The answer is B: rename is emulated by copying all 800 gigabytes, and not atomically.

Object stores have no rename. The committer's final rename becomes a server-side copy of all 800 gigabytes plus deletes, which takes a long time and is not atomic across files, so a crash leaves partial output visible. S3 has been strongly consistent since 2020, so consistency is not the issue here, and S3 has no NameNode.

## 2

An HDFS cluster stores 400 million files averaging 200 kilobytes. What problem are you most likely to hit first?

A, NameNode heap pressure from its in-memory objects. B, running out of disk capacity on the DataNodes. C, the CPU cost of verifying every block's checksum. D, saturated cross-rack network bandwidth during writes.

[think]

The answer is A: NameNode heap pressure from its in-memory objects.

Every file and every block is an object in the NameNode's heap. 400 million files plus their blocks is on the order of 800 million namespace objects, far past what one NameNode heap handles comfortably, with garbage-collection pauses to match. The total data, about 80 terabytes, is modest. The object count is the problem.

## 3

Why does HDFS place the second and third replicas of a block on a different rack from the first, but on the same rack as each other?

A, to survive a rack loss, while crossing racks only once per write. B, because the NameNode can only track two racks per block. C, to maximise read bandwidth for clients on the writer's rack. D, so the block can be erasure-coded later without copying.

[think]

The answer is A: to survive a rack loss, while crossing racks only once per write.

A rack can fail as a unit, through its switch or its power. Two racks are enough to survive that, and putting replicas two and three together means the write pipeline crosses racks only once, saving scarce cross-rack bandwidth. Read bandwidth for the writer's rack would argue for keeping replicas local, the opposite of this placement.

## 4

When an 8 terabyte disk fails in a thousand-node HDFS cluster, why is recovery much faster than rebuilding a RAID array?

A, a RAID rebuild must verify checksums, which HDFS skips. B, HDFS compresses the blocks before copying them to new disks. C, the surviving replicas are spread out, so many nodes copy at once. D, HDFS re-replicates only the blocks that clients actually read.

[think]

The answer is C: the surviving replicas are spread out, so many nodes copy at once.

The lost blocks' other replicas are scattered over hundreds of nodes, each copying a few gigabytes at the same time. A RAID rebuild writes all 8 terabytes onto one spare disk at single-disk speed, which takes many hours. HDFS verifies checksums too; the difference is parallelism.

## 5

A streaming job writes one Parquet file per partition every 30 seconds to S3, producing about 3 million files a day of about 300 kilobytes each. Downstream queries are slow and expensive. What is the right first fix?

A, compact into files of 128 megabytes to 1 gigabyte, and buffer longer. B, enable S3 strong consistency for the output prefix. C, switch the bucket's storage to erasure coding. D, raise the S3 request-rate limit on the output bucket.

[think]

The answer is A: compact into files of 128 megabytes to 1 gigabyte, and buffer longer.

Each small file costs a request and its latency for every query that reads it, and it inflates planning. Compaction and larger write batches cut the object count by orders of magnitude. A higher request-rate limit still pays per-request latency and cost for 3 million objects, and consistency and erasure coding are unrelated to the problem.

## 6

During an HDFS write, the second DataNode in the pipeline stops acknowledging packets. A week later, that node comes back with its partial copy of the block. Why is that stale copy not counted as a replica?

A, the NameNode only counts replicas that took part in the final acknowledgement. B, its checksums were rewritten when the pipeline shrank to two nodes. C, its generation stamp is older than the one the NameNode recorded. D, the client deleted it from the node before rebuilding the pipeline.

[think]

The answer is C: its generation stamp is older than the one the NameNode recorded.

Pipeline recovery bumps the block's generation stamp, and the surviving replicas are finalised under the new stamp. The returning replica reports the old stamp, so the NameNode marks it stale and schedules its deletion instead of counting it. The client never talks to the dead node again, and checksums belong to each replica's own bytes.
