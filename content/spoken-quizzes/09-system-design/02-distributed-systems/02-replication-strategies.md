---
lesson: replication-strategies
source: 735b2cb346bbb691
---
## 1

A leader acknowledges after its local commit and ships the log asynchronously. It handles 5,000 writes a second with 40 milliseconds of replication lag, then crashes, and a follower is promoted. Roughly how many acknowledged writes are lost?

A, none, because the follower has the log. B, about 5,000, one second of writes. C, about 200, the rate times the lag. D, about 40, one per millisecond of lag.

[think]

The answer is C: about 200, the rate times the lag.

Writes inside the lag window exist only on the leader: 5,000 a second times 0.04 seconds is 200. A semi-synchronous follower would reduce this to zero, at 1 to 2 milliseconds per write. The follower has the log only up to the point it was shipped.

## 2

Two regional leaders each run "likes equals likes plus 1" on a post with 10 likes, with perfectly synchronised clocks, and replicate the new values under last-writer-wins. What is the converged value?

A, 11, because each value came from a stale read. B, 12, because synchronised clocks order both writes. C, 10, because the two conflicting writes cancel. D, both 11s are kept as siblings for the reader.

[think]

The answer is A: 11, because each value came from a stale read.

Each leader read 10 and wrote 11, so both replicated values are 11; last-writer-wins picks one, and an increment is lost. Clock accuracy is irrelevant to this loss. A per-leader counter, merged by taking the maximum of each entry, converges to 12.

## 3

With 5 replicas, writes waiting for 3 and reads waiting for 3, why must every read see the latest acknowledged write?

A, hinted handoff copies each write to all five replicas first. B, reads wait for the slowest replica, which has every write. C, any two sets of 3 out of 5 share at least one replica. D, the coordinator forwards reads to the replica that wrote last.

[think]

The answer is C: any two sets of 3 out of 5 share at least one replica.

The read set and the write set overlap in at least 3 plus 3 minus 5, which is one member, so some replica in the read set holds the write, and comparing versions returns it. A read waits for 3 responses, not the slowest, and hinted handoff weakens the guarantee rather than creating it.

## 4

During a partition, a sloppy quorum stores a write on nodes A and D, with a hint for B. A then crashes, and a read that needs 2 replies goes to B and C. What does it return?

A, the new value, because the read and write quorums still exceed the replica count. B, the old value, until D hands the hint to B. C, an error, because a quorum cannot be formed. D, the new value, because D forwards all reads.

[think]

The answer is B: the old value, until D hands the hint to B.

The write set, A and D, and the read set, B and C, do not intersect, since D is not in the key's preference list. The read succeeds with two responses, and returns the old value. Hinted handoff trades the overlap guarantee for write availability.

## 5

A quorum read returns x equals 1 to client B. Client C then does a quorum read of the same key, and gets x equals 0. Which mechanism prevents this?

A, blocking read repair on B's read, before it returns. B, hinted handoff to the replica that missed the write. C, switching the key to last-writer-wins resolution. D, raising the number of replicas from three to five.

[think]

The answer is A: blocking read repair on B's read, before it returns.

B read a write that was still in flight. If B's coordinator writes x equals 1 to the stale replica in its read set before answering, C's quorum must overlap a replica holding 1. Cassandra 4.0's blocking read repair does this, giving monotonic quorum reads, though still not full linearizability. More replicas do not change the in-flight window.

## 6

Which product is the poorest fit for multi-leader replication?

A, a shopping cart edited from sessions in two regions. B, a whiteboard whose users draw from several regions. C, a note app that syncs edits made on offline devices. D, a ledger where every transfer must be totally ordered.

[think]

The answer is D: a ledger where every transfer must be totally ordered.

A ledger needs a total order, and no merged or lost writes, which a single leader with a synchronous follower provides. The note app, the cart and the whiteboard tolerate concurrent writes, because their data types have well-defined merges.
