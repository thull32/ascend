---
lesson: consistency-models
source: 119ba0afb5c1e254
---
## 1

A write of x equals 1 returns at 20 milliseconds. A different client starts a read at 50 milliseconds, and receives 0. Which models permit this history?

A, only eventual consistency, since the others forbid stale reads. B, sequential, causal and eventual, but not linearizable. C, all of them, because reads overlapping writes may return either value. D, none, because an acknowledged write must be visible to all.

[think]

The answer is B: sequential, causal and eventual, but not linearizable.

Linearizability orders operations by real time, so a read that begins after the write returned must see it. Sequential and causal consistency only need an order consistent with each client's program order, and the read can be placed before the write. The read does not overlap the write, so the "either value" rule does not apply.

## 2

There are 3 replicas, with writes and reads each needing 2. A write has reached one replica so far. Client B reads replicas 1 and 2, and gets the new value. After B returns, client C reads replicas 2 and 3, and gets the old one. Which statement is right?

A, it violates only read-your-writes, since C never wrote anything. B, it is linearizable, since the write had not yet been acknowledged. C, it cannot happen, since quorums of 2 out of 3 always overlap. D, it violates linearizability, because B's read fixed the write's moment.

[think]

The answer is D: it violates linearizability, because B's read fixed the write's moment.

Once B returned the new value, the write must take effect before B's response, and C began afterwards, so C must see it too. Quorum overlap covers the last completed write, not one in flight. A write-back phase, where a reader that sees disagreement writes the newest value to a quorum before returning, removes the inversion, at the cost of a second round trip.

## 3

Client C reads a reply to a post, then reads the post, and finds nothing. Which is the weakest model that forbids this?

A, read-your-writes. B, causal consistency. C, eventual consistency. D, linearizability.

[think]

The answer is B: causal consistency.

The reply was written by someone who had read the post, so the post happens before the reply, and causal consistency requires anyone who sees the reply to see the post. Linearizability also forbids it, but is stronger than needed. Read-your-writes covers only a client's own writes, and eventual consistency allows it.

## 4

A user sees a new profile value on one request and the old one on the next, as the balancer alternates between two replicas with different lag. Which guarantee is missing, and what is the cheap fix?

A, read-your-writes, so add more replicas to cut the lag. B, monotonic writes, so number every write in the session. C, linearizability, so route all reads through the leader. D, monotonic reads, so carry the highest log position seen.

[think]

The answer is D: monotonic reads, so carry the highest log position seen.

Seeing a newer state and then an older one violates monotonic reads. Carrying the highest position seen, and refusing replicas behind it, or pinning the session to one replica, fixes it with one token. The user did not write anything, so read-your-writes and monotonic writes are not the issue, and routing everything to the leader works but gives up the replicas.

## 5

A service reads an inventory count from a replica, subtracts one, and writes the result to the primary. What is the likely bug?

A, a lost update, from computing on a stale replica value. B, a phantom read, from rows inserted during the transaction. C, write amplification, from updating the primary and the replicas. D, a deadlock, from reading and writing on two different nodes.

[think]

The answer is A: a lost update, from computing on a stale replica value.

The replica's value may lag the primary, and writing a value computed from it overwrites decrements the replica had not seen. An atomic update on the primary, or a conditional write that checks the expected version, prevents it. No locks span the two nodes, so there is nothing to deadlock.

## 6

How does etcd serve a linearizable read without writing to its log?

A, the read waits for the next log compaction to finish. B, the follower that receives it answers from its locally applied state. C, the leader confirms it still leads, then waits for its commit index. D, the client reads from a majority and takes the newest value.

[think]

The answer is C: the leader confirms it still leads, then waits for its commit index.

The leader records its commit index, confirms with a round of heartbeats that a majority still follows it, so no newer leader has committed anything, waits until its state machine has applied that index, and answers. A follower answering locally is etcd's serializable read, which may be stale.
