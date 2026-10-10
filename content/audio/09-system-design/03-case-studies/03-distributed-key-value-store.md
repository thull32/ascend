---
lesson: distributed-key-value-store
source: 0f07a93a7e0e74f2
fit: great
desk:
  - "The estimates table and the tokens-per-node simulation"
  - "The sloppy-quorum write and read-repair traces, millisecond by millisecond"
  - "The version-vector cart example and the Merkle-tree arithmetic"
  - "Exercise: build zone-aware preference lists on a token ring"
---
## Introduction

Design a distributed key-value store. It sounds like the most abstract prompt in the set. It is the most concrete, because every other case study is built on one: the feed stores timelines in one, the chat system its messages, the rate limiter its counters. The interviewer wants to know whether you understand what those systems are made of.

What happens to a write when one of its three replicas is down? What does a read return when replicas disagree? How do you add a node without moving every key? And what does "eventually consistent" cost the developer who lives with it?

The reference point is the design Amazon published in its 2007 Dynamo paper, which Cassandra, Riak and ScyllaDB inherited in various forms. Its priority is specific: accept writes even during failures and partitions, because a rejected "add to cart" is lost revenue, while a cart that briefly shows a removed item is an annoyance. That one product decision drives every mechanism that follows. Three deep dives: partitioning, quorums, and conflicts and repair.

## Requirements and the numbers

The interface is small. Put, get and delete. Keys up to 256 bytes, values up to a megabyte with a median around a kilobyte. Consistency is chosen per request: one replica, a quorum, or all. Range scans, secondary indexes and multi-key transactions are out of scope.

The non-functional requirements carry the design. Always writable: a write succeeds while enough nodes are reachable, including during a zone outage. Under 10 milliseconds at the 99th percentile for quorum reads and writes. An acknowledged write survives the permanent loss of any single node. And elastic: add or remove nodes without downtime, moving only a proportional share of the data.

The scale: 10 billion keys, a million operations a second at peak, 80 percent reads. That is 11 terabytes of logical data, about 50 on disk with three replicas and compaction headroom. At the replicas, quorum reads touch two copies and writes touch three, so the cluster does about 2.2 million replica operations a second.

Storage alone would allow 25 nodes of 2 terabytes each. But that puts around 90 thousand replica operations a second on each node, too close to the ceiling for a 10 millisecond tail. So the answer is 48 nodes, 16 per zone, about a terabyte of data each on 4 terabyte drives, kept under half full because compaction needs free space.

Here is the sentence to remember. This cluster is sized by throughput and by recovery time, not by storage. A failed 1 terabyte node re-replicates in about 1.4 hours at a throttled 200 megabytes a second. A 4 terabyte node would take 5.6 hours, and every hour with only two copies is exposure.

The architecture, in words. No leader, no master. Any node can coordinate any request, and a token-aware client driver sends it straight to a replica, saving a hop. The coordinator sends to the key's three replicas in parallel and replies once enough of them answer. Nodes learn about each other by gossip. And missed writes are repaired on three timescales: hinted handoff in minutes, read repair on access, and Merkle-tree anti-entropy over hours to days.

Under the hood, each node runs a log-structured merge tree. A write appends to a commit log, goes into an in-memory table, and is acknowledged. One detail interviewers like: Cassandra's default syncs the commit log to disk every 10 seconds, not per write, so an acknowledged write's durability comes from being on two machines in two zones, not from a disk flush.

## Deep dive one: partitioning

The naive placement is the hash of the key modulo the node count. Add a 49th node, and a key stays put only if its hash gives the same answer modulo 48 and modulo 49, about one key in 49. So 98 percent of the data moves.

Consistent hashing puts nodes and keys on one circle, and a key belongs to the first node clockwise. A new node takes over one arc, about one 49th of the data. With one position per node, though, arcs are random and the largest is often several times the average. So each machine gets many positions, virtual nodes. Load evens out, a bigger machine takes more positions, and a replacement node streams from dozens of peers in parallel, which is what makes the 1.4 hour recovery possible.

The replicas for a key come from walking clockwise and collecting the next three distinct physical nodes in distinct zones. That is what lets the store lose a whole zone and still hold two copies of every key.

Now a trap. More virtual nodes sounds strictly better. Before I give you the numbers, think about what happens when two nodes in different zones fail at once.

[pause]

They take some range below quorum if they share any replica set. The lesson simulated it on 48 nodes. With 4 tokens per node, 39 percent of cross-zone node pairs share a range. With 16 tokens, 87 percent. With 256, every pair. So with 256 tokens, any two failures in different zones leave some keys unable to reach a quorum. No data is lost while one copy remains, but those keys are unavailable. This is why Cassandra 4.0 lowered its default from 256 tokens to 16, with an allocation algorithm that keeps a few tokens balanced. This design uses 16.

## Deep dive two: quorums, traced

With three replicas, a write waits for W acknowledgements and a read for R responses. If W plus R is greater than three, every read set overlaps every write set in at least one node, so a read sees the latest completed write. The default is two and two.

Quorums also cut tail latency. A quorum write waits for the second-fastest of three replicas. If each replica is slow one percent of the time, the write is slow only when two of them are, about 0.03 percent of the time. Reads get most of that benefit with speculative retry: ask two replicas, and the third only if one has not answered by the 95th percentile.

Now a write with one replica down. The coordinator is A in zone a, B is in zone b, and C in zone c has been down for 40 minutes. A writes locally in about 20 microseconds and sends to B. C is down, so A sends C's copy to D, the next zone-c node on the ring, with a note saying "this is for C". B acknowledges. Two acknowledgements, so the client gets success in about one millisecond. When C comes back, D replays its hints to C, throttled.

This is the Dynamo paper's sloppy quorum. The substitute's acknowledgement counts, so the store stays writable. And the overlap guarantee is gone. During a partition, substitutes can acknowledge a write that a read of the home replicas never sees. Cassandra differs in a detail worth knowing: its hints stay on the coordinator and do not count toward the consistency level.

The read side. C is back but its hints have not replayed. A quorum read asks A for the data and C for a digest. The digest does not match. A fetches C's full value, finds it older, writes the newer value to C and waits, so a later quorum read cannot go backwards, and only then answers the client. The read took about 2.6 milliseconds instead of about one. One mismatch roughly triples a read's latency, which is why the 99th percentile rises for hours after a node returns, until hints and repair catch up.

## Deep dive three: conflicts and repair

Two clients write the same key concurrently. Three ways to resolve it.

Last-writer-wins keeps the highest timestamp. One of the two writes is silently discarded, and a node whose clock runs 30 seconds fast wins every conflict for 30 seconds.

Version vectors with siblings, the Dynamo paper's choice, detect that neither write descends from the other and keep both. The next reader merges them, for a cart by taking the union, and writes the result back. Nothing is lost, every client needs a merge function, and a union brings deleted items back.

Or CRDTs: counters, sets and maps with a defined merge, so the store merges without the application. The choice is per key family. Last-writer-wins for data written once or by one owner, like sessions and profiles. Vectors or CRDTs where losing a write is a bug, like carts and counters. And say which keys are which.

Membership. A silent node is treated as temporarily unavailable: hints accumulate and nothing moves. Removing a node is an explicit operator action, because a gossip-driven removal would turn a 30-second garbage collection pause into a terabyte of data movement.

Anti-entropy fixes what hints and read repair miss. Each replica hashes each range into a Merkle tree, and replicas compare roots and descend only into subtrees that differ. With about 13 million keys a range and 100 keys out of sync, they stream at most about 40 thousand keys instead of 13 million. But building the tree reads every key, so repair is a scheduled, throttled job.

And the tombstone trap. A delete writes a tombstone, which compaction drops after a grace period, 10 days by default in Cassandra. If replica C missed the delete and is not repaired within those 10 days, A and B compact away both the tombstone and the value. C still holds the value, and the next repair treats it as a missed write and copies the deleted data back everywhere. So a full repair must finish on every range more often than the grace period. A slipping repair schedule is a correctness incident.

## When it breaks

A slow node is worse than a dead one. Gossip says it is up, so it stays in every quorum it serves and drags their tails. Speculative retry and latency-aware replica selection route around it.

A zone outage, then a hint flood. Every key has one replica in the lost zone, so hints pile up at 200 megabytes a second: about 2.2 terabytes over a 3-hour hint window, about 135 gigabytes for each of the 16 returning nodes. Unthrottled replay saturates them. Bound the hint window, throttle replay, and past the window run a full repair before trusting single-replica reads.

A hot key saturates its three replicas while the cluster idles. Put a cache with request coalescing above the store, or split the key into sub-keys and fan in on read.

At ten times the size, 480 nodes, tokens per node decide availability: with 256, a random double failure breaks some quorum 99 percent of the time, with 16 only 18 percent. And repair becomes the scarce resource, so incremental repair becomes mandatory to beat the grace period.

## In the interview

The classic follow-up. With three replicas, writes to two and reads from two, is the store linearizable?

[pause]

No. Sloppy quorums break the overlap during failures. A read concurrent with an in-flight write can see the new value on one replica while a later read of the other two sees the old one. And there is no compare-and-set. Linearizable operations need consensus per key or range, like Cassandra's lightweight transactions running Paxos per partition, or CockroachDB and TiKV running Raft per range. The wrong answer is "yes, because W plus R is greater than N".

And a sharp one: a disk dies, how long are you exposed? The replacement streams each range from surviving replicas: 1 terabyte at 200 megabytes a second is 1.4 hours with two copies. A second failure in the same replica set loses quorum for those keys; a third loses data. Exposure is bytes per node divided by stream rate, which is why 48 nodes of 1 terabyte beat 12 of 4. The wrong answer is "no exposure, there are three replicas".

## Recap

Five things to remember. Size the cluster by throughput and recovery time, not storage. Consistent hashing moves one Nth of the data, but more virtual nodes make double failures worse, which is why 16 beat 256. W plus R greater than N gives overlap, and sloppy quorums give it up to stay writable. Pick last-writer-wins or vectors per key family, and know what each loses or brings back. And repair must beat the tombstone grace period, or deleted data comes back.

At your desk: the estimates and token simulation, the write and read traces, the cart and Merkle examples, and the preference-list exercise.
