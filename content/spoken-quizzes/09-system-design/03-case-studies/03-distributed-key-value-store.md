---
lesson: distributed-key-value-store
source: 0541bcec371c5caa
---
## 1

A 48-node cluster places keys by their hash modulo N. You add a 49th node. Roughly what fraction of keys move, and what would consistent hashing move?

A, about 98 percent with modulo N, and about 2 percent with consistent hashing. B, about 98 percent with modulo N, and about 50 percent with consistent hashing. C, about 2 percent with modulo N, and about 2 percent with consistent hashing. D, about 50 percent with modulo N, and about 25 percent with consistent hashing.

[think]

The answer is A: about 98 percent with modulo N, and about 2 percent with consistent hashing.

A key stays put under modulo N only if its hash modulo 48 equals its hash modulo 49, which holds for about 1 key in 49, so about 98 percent move. Consistent hashing moves only the arc the new node takes over, about 1 forty-ninth of the data, not half of anything.

## 2

There are 3 replicas, and writes and reads each wait for just 1. A client writes v2 and receives an acknowledgement, then immediately reads the key. What can it see?

A, both v1 and v2 as siblings, because the replicas disagree. B, always v2, because the write was acknowledged before the read. C, possibly v1, because the read may hit a replica without v2. D, an error, because the read and write counts together do not exceed the replica count.

[think]

The answer is C: possibly v1, because the read may hit a replica without v2.

With 1 plus 1, not more than 3, the replica that acknowledged the write and the one that serves the read need not overlap. An acknowledgement means one replica has v2. A configuration without overlap is legal and fast, with no overlap guarantee; it is not an error.

## 3

During a partition, a write that needs 2 acknowledgements is acknowledged by two substitute nodes holding hints, and a read that needs 2 replies is answered by two of the key's home replicas. What is returned?

A, possibly the old value, because substitutes count toward the write quorum. B, an error, because hinted replicas cannot be read until handoff. C, the new value, because read repair runs before the reply. D, the new value, because overlapping quorums guarantee the sets intersect.

[think]

The answer is A: possibly the old value, because substitutes count toward the write quorum.

Sloppy quorums keep the store writable by accepting writes on any healthy nodes, so the read and write sets need not overlap, and the quorum arithmetic no longer guarantees anything. The home replicas never saw the write; the hints reach them only when the partition heals.

## 4

A key is deleted while replica C is down. C returns after 12 days without having been repaired, and the tombstone grace period is 10 days. What is the risk?

A, C will reject writes until an operator runs a full repair on it. B, repair treats C's old value as a missed write, and resurrects it. C, none, because C will receive the tombstone through hinted handoff. D, repair deletes C's data, because A and B have no record of the key.

[think]

The answer is B: repair treats C's old value as a missed write, and resurrects it.

Hints expire long before 12 days, and after the grace period, A and B have compacted away the tombstone along with the value. Repair cannot tell a deleted value from a missed write, so it copies C's old value back to every replica. Full repair must complete more often than the grace period.

## 5

A quorum read finds that one replica's digest does not match the coordinator's data. What happens before the client gets its answer?

A, the coordinator fetches the full data, writes the newest back, then replies. B, the read fails, and the driver retries it on a different coordinator. C, the client receives both versions, and must merge them itself. D, the coordinator returns its own value at once, and repairs later.

[think]

The answer is A: the coordinator fetches the full data, writes the newest back, then replies.

On a digest mismatch, the coordinator reads the full data from the replicas, picks the newest version, and, with blocking read repair, writes it to the stale replica before replying, so a later quorum read cannot return the older value. That costs extra round trips, roughly tripling the read's latency in the trace. Siblings go back to the client only with version vectors, and last-writer-wins data has one winner.

## 6

A 48-node, three-zone cluster uses 256 tokens per node. Two nodes in different zones fail at the same time. What happens?

A, almost surely some key range loses its quorum, since the pair shares a range. B, nothing, because zone-aware placement always leaves two replicas of each key. C, only the keys on the two nodes' primary arcs lose quorum, about 4 percent of the data. D, data is lost for the keys whose replicas were on both of the failed nodes.

[think]

The answer is A: almost surely some key range loses its quorum, since the pair shares a range.

With 256 tokens each, every cross-zone pair of nodes shares at least one replica set, every pair in the simulation, and that range is left with one replica, below a quorum of two. No data is lost while one copy remains. Zone-aware placement protects against losing one zone, not two nodes in two zones. Fewer tokens per node make this far less likely, which is why Cassandra 4.0 lowered the default to 16.
