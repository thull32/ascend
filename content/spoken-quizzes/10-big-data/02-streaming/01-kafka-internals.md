---
lesson: kafka-internals
source: 50d62386b80ffaf5
---
## 1

A topic has replication factor 3 and min in-sync replicas set to 2. The producer uses acks equals all. Two of the three brokers hosting a partition go down. What happens?

A, writes are rejected with a not-enough-replicas error, and reads continue. B, writes continue on the remaining broker, and may be lost later. C, reads and writes both stop until a second replica rejoins. D, Kafka elects an out-of-sync replica so that writes can continue.

[think]

The answer is A: writes are rejected, and reads continue.

With only one in-sync replica, acks-all writes fall below the min in-sync replicas floor and are rejected, choosing consistency over write availability. Consumers can still read already-committed data up to the high watermark, so reads do not stop. Electing an out-of-sync replica only happens with unclean leader election enabled.

## 2

A producer writes with acks equals all. The leader appends offsets 100 and 101, and both followers have already fetched and appended them. Why is the producer still waiting?

A, the followers must fsync the batch before the leader may count them as in sync. B, the acknowledgement is sent by the followers, and their responses were still in flight. C, the high watermark advances only when the controller confirms the in-sync replica set. D, the leader learns a follower's log-end offset only from that follower's next fetch request.

[think]

The answer is D: the leader learns a follower's log-end offset only from that follower's next fetch request.

Replication is pull-based, and the offset a follower asks for in its next fetch is what tells the leader how far it has got. Until both followers fetch from offset 102, the leader still thinks their log-end offsets are 100, and the high watermark cannot advance to 102. Followers never fsync per batch or acknowledge producers, and the controller plays no part in advancing the high watermark.

## 3

An old leader rejoins after a failover. It holds a record at offset 101 written under epoch 3. The new leader reports that epoch 3 ended at offset 101. What does the rejoining replica do?

A, it truncates to its own high watermark, which may be lower than 101. B, it truncates offset 101 away, and fetches the new leader's record for that offset. C, it keeps offset 101, because that offset is below the new leader's log-end offset. D, it forwards its offset 101 to the new leader, which appends it after the epoch 4 records.

[think]

The answer is B: it truncates offset 101 away, and fetches the new leader's record for that offset.

Epoch 3 ending at 101 means the new leader's offset 101 belongs to epoch 4, so the rejoining replica's epoch 3 record there was never committed and must go. It truncates to 101 and fetches the leader's version. Truncating to the local high watermark was the older behaviour, before KIP 101, that could leave logs diverged, and no replica ever pushes its own records into a leader's log.

## 4

A read-committed consumer of a partition stops receiving new records for a minute, even though several producers keep writing and committing normally. What is the most likely cause?

A, the partition's high watermark cannot advance while any transaction is in flight. B, the committing producers are fenced by an older epoch, and their writes are aborted. C, one transactional producer has an open transaction on that partition, holding back the last stable offset. D, the consumer's session timed out, and the partition is being rebalanced away.

[think]

The answer is C: one producer's open transaction is holding back the last stable offset.

The last stable offset is the first offset of the oldest open transaction on the partition, and read-committed consumers only fetch up to it. So one stalled transaction hides every later record, including other producers' committed ones, until it commits or times out. The high watermark advances independently of transactions, and fenced producers fail immediately rather than committing normally.

## 5

A consumer group's batches occasionally take 7 minutes to process, and the group keeps rebalancing. What is the most direct cause?

A, auto-commit is disabled, so offsets are never committed in time. B, the session timeout is too short for 7-minute batches. C, there are more partitions than consumers to spread them over. D, batches exceed the max poll interval, so the member is evicted.

[think]

The answer is D: batches exceed the max poll interval, so the member is evicted.

Heartbeats run on a background thread, so the session timeout is not the issue. Failing to call poll within the max poll interval, 5 minutes by default, is, and the evicted member later rejoins and triggers another rebalance. Shrink batches, speed up processing, or raise the interval deliberately. Cooperative rebalancing, or the newer KIP 848 protocol, plus static membership, reduce the blast radius.

## 6

A compacted changelog topic keeps growing, and a new consumer takes hours to bootstrap from it. Which explanation is consistent with how the log cleaner works?

A, tombstones are removed immediately, so the cleaner has nothing to reclaim. B, the cleaner needs one consumer per partition to confirm keys are no longer read. C, the topic is quiet, so its active segment never rolls and the cleaner never sees it. D, compaction runs only on the active segment, which is too small to matter.

[think]

The answer is C: the topic is quiet, so its active segment never rolls and the cleaner never sees it.

The cleaner works only on closed segments, and only once the dirty ratio is high enough. A quiet topic whose active segment rolls only after the segment time limit keeps every update in that uncleanable segment. Lower the segment time or size for the topic, and set a maximum compaction lag. Tombstones are kept for a retention period, and consumers play no part in compaction.
