---
lesson: designing-for-failure
source: 6cd39f434775b7e4
---
## 1

Two regions are each 99.9 percent available, but a tenth of each region's downtime comes from a global config push that takes both down together. What is the pair's availability?

A, about 99.8 percent, since the availabilities multiply. B, about 99.9999 percent, since the regions are redundant. C, about 99.9 percent, since one region is the limit. D, about 99.99 percent, set by the shared cause.

[think]

The answer is D: about 99.99 percent, set by the shared cause.

Model the config push as a serial term of 0.01 percent unavailability. The independent part of each region is 0.09 percent, and both failing independently adds almost nothing, so the total is about 0.01 percent: 99.99 percent available. Six nines assumes an independence the shared cause breaks, and multiplying availabilities is the rule for serial dependencies, not redundant ones.

## 2

An active-passive database replicates asynchronously at 20,000 writes a second, normally 200 milliseconds behind. The link between regions degraded for 60 seconds before the primary region died. Roughly how many acknowledged writes are lost on failover?

A, about 72 million. B, about 1.2 million. C, about 20,000. D, about 4,000.

[think]

The answer is B: about 1.2 million.

Lost writes are the rate times the lag at the moment of failure, and the lag had grown to about 60 seconds: 20,000 times 60 is 1.2 million. 4,000 uses the normal 200 millisecond lag, which is not the lag at failure; 20,000 is one second of writes; and 72 million treats the lag as an hour. An acknowledgement from an asynchronous primary does not mean the replica has the write.

## 3

A quorum needs any 2 of 3 replicas, each 99.9 percent available, failing independently. What is its availability?

A, about 99.9 percent. B, about 99.9997 percent. C, about 99.7 percent. D, about 99.9999999 percent.

[think]

The answer is B: about 99.9997 percent.

The quorum fails when two or three replicas are down, which works out to about 3 in a million, so 99.9997 percent, or about 8 seconds a month. That is worse than a plain redundant pair, at 1 in a million, because any two of three failing is enough. 99.7 percent treats the replicas as serial.

## 4

A bug writes corrupted values into a table replicated synchronously to three regions. Which defence recovers the data?

A, failing over to one of the other two regions. B, point-in-time recovery, or a delayed replica. C, raising the replication factor in each region. D, adding a fourth replica in a new region.

[think]

The answer is B: point-in-time recovery, or a delayed replica.

Replication copies the corruption everywhere within milliseconds, so failover and extra replicas hold the same bad data. Only a copy from before the corruption gets you back: point-in-time recovery, a replica applying changes an hour behind, or an immutable log.

## 5

An active-active service resolves conflicts by last-writer-wins. A downloads-remaining counter is decremented in two regions within the replication lag. What happens?

A, one decrement is silently lost. B, the later write is rejected as a conflict. C, both apply, since both were acknowledged. D, the regions stay permanently divergent.

[think]

The answer is A: one decrement is silently lost.

Each region writes a new absolute value, and after replication both keep the one with the later timestamp, so they converge on a value that reflects only one decrement. Nothing errors, and nothing stays divergent. Counters need a CRDT that merges per-region counts, or a home region that owns the writes.

## 6

A service targets 99.99 percent availability. Its incidents take about 30 minutes to resolve when a human is paged. What does the target imply?

A, the target holds, provided the incidents are short. B, about one such incident a month fits the budget. C, the target is met if the service is multi-region. D, about one such incident every seven months.

[think]

The answer is D: about one such incident every seven months.

99.99 percent allows about 4.3 minutes a month, or 52 minutes a year, so 30-minute incidents fit roughly once every seven months. Meeting the target with normal incident rates needs recovery measured in a minute or two, which means automated detection and rollback. Multi-region helps only if the failover itself is automatic, and the regions share no cause.
