---
lesson: wide-column-stores
source: d62bdbe1ad633a89
---
## 1

A Cassandra table stores sensor readings with a primary key of device ID and timestamp. After six months, reads for busy devices time out and compaction falls behind. What is the fix?

A, raise the replication factor, so each partition has more readers. B, add a secondary index on the timestamp, so time-range reads skip old rows. C, add a time bucket, such as the day, to the partition key to bound it. D, switch reads to quorum, so slow replicas stop holding reads back.

[think]

The answer is C: add a time bucket, such as the day, to the partition key.

A partition keyed only by device grows forever. At one reading a second it passes 100 megabytes within weeks and reaches about a gigabyte a year, and every read, compaction and repair of it degrades. Bucketing by day bounds it at about 86 thousand rows. Consistency level and replication factor do not change partition size, and a secondary index on the clustering column adds nothing.

## 2

With a replication factor of 3, a service writes at consistency level one and reads at one. Users occasionally see their update disappear and then reappear. Why?

A, tombstones from earlier deletes are hiding the row on some reads. B, one read replica plus one write replica makes 2, which is not above 3, so a read can miss the write. C, the commit log was not fsynced, so the replica lost the write. D, hinted handoff is disabled, so the write never reaches a replica.

[think]

The answer is B: one plus one is not above 3, so a read can miss the write.

Reads and writes at one have a guaranteed overlap of 1 plus 1 minus 3, which is zero replicas. So a read served by a replica the write has not reached returns the old value, until hints, read repair or repair catch it up. Quorum on both sides, 2 plus 2, which is above 3, forces an overlap of at least one replica.

## 3

A team lowers the tombstone garbage collection grace period from ten days to one hour to reclaim disk faster, and runs repair weekly. What is the likely consequence?

A, compaction stalls, because tombstones under an hour old are locked. B, deleted rows come back, because repair revives copies that missed the delete. C, nothing bad; tombstones are purged sooner, so reads become faster. D, quorum writes start failing until the next weekly repair finishes.

[think]

The answer is B: deleted rows come back.

A tombstone must survive until every replica has been repaired. With a one-hour grace period and weekly repair, a replica that missed the delete keeps the row. Once compaction purges the tombstone elsewhere, repair treats the old copy as live data and streams it back. The rule: repair must complete more often than the grace period.

## 4

Two regions each have a replication factor of 3. Writes use local quorum in Europe, and a US service reads the same row at local quorum a few milliseconds later. Is the read guaranteed to see the write?

A, yes, because 2 plus 2 is greater than 3 in each of the regions. B, no, because local quorum reads are always served by one node. C, yes, because quorum and local quorum give the same guarantee. D, no, because the guaranteed overlap across the regions is zero.

[think]

The answer is D: no, because the guaranteed overlap across regions is zero.

The write is guaranteed only on two European replicas, and the read hears only from US replicas, so the two sets need not share any replica; the US copies receive the write asynchronously. Writing at each quorum, or routing the user's reads to the region they wrote in, restores the guarantee. The overlap rule holds within one region only.

## 5

Which workload is the worst fit for Cassandra?

A, append-only sensor time series, with a 30-day TTL on every row. B, a user activity feed, read back by user ID in time order. C, a job queue, with rows inserted and deleted within seconds. D, write-heavy event ingestion at 300 thousand events per second.

[think]

The answer is C: a job queue with rows inserted and deleted within seconds.

Deletes are tombstone writes, kept for the grace period, so an insert-and-delete queue leaves partitions that are mostly tombstones, and every read scans through them, hitting the warning threshold at a thousand and the failure threshold at a hundred thousand. The other three are what the partition-plus-clustering model and the LSM engine are built for.

## 6

A DynamoDB table is provisioned at 10 thousand write units, but writes of 1 kilobyte items to one popular product key throttle at about a thousand per second. Why, and what fixes it?

A, eventually consistent writes throttle hot keys, so make the writes strong. B, global secondary indexes are consuming the write capacity, so drop the unused ones. C, the table's per-second limit was exceeded, so provision more write units. D, one key lives in one partition, capped at a thousand write units, so add a suffix to the key.

[think]

The answer is D: one key lives in one partition with a cap of a thousand write units; add a key suffix.

Capacity is enforced per physical partition, a thousand write units and three thousand read units, and one partition key lives in one partition. Adaptive capacity moves unused throughput to that partition, but cannot raise the ceiling, and more table capacity does not help. Write sharding, with a suffix from 0 to N minus 1 and reads of all N, spreads the key across partitions.
