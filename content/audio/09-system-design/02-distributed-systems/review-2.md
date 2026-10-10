---
review: distributed-systems
source: 3a4aa3d6e784f93d
---
## Introduction

Twelve more questions from the distributed-systems module, none of them repeated from the first review. Answer out loud before the answer comes.

They follow the lessons in order: clocks, quorums, Raft, Paxos, two-phase commit, partitioning, leases and fencing, ZooKeeper locks, Kafka transactions, Cassandra repair and CRDT counters, with one more on Raft and disks at the end. Four options each, then a few seconds to commit.

## Question 1

Replica clocks have independent offsets of up to 50 milliseconds either way. A user's two writes land on different replicas 10 milliseconds apart. Roughly how often does last-writer-wins keep the older write?

A, never, since NTP keeps the clocks within 50 milliseconds. B, always, since the older write carries more skew. C, about 40 percent of the time, close to a coin flip. D, about 1 percent of the time, only during rare clock steps.

[think]

The answer is C: about 40 percent of the time, close to a coin flip.

With offsets spread evenly across that range, the chance of keeping the wrong write works out to about 0.4, and the lesson's simulation reproduced it. When writes are closer together than the clock skew, their timestamp order is mostly noise. A tighter clock bound lowers the rate, but never to zero for close writes.

## Question 2

With 5 replicas, writes acknowledged by 3 and reads answered by 3, why must every read see the latest acknowledged write?

A, hinted handoff copies each write to all five replicas first. B, reads wait for the slowest replica, which has every write. C, any two sets of 3 out of 5 share at least one replica. D, the coordinator forwards reads to the replica that wrote last.

[think]

The answer is C: any two sets of 3 out of 5 share at least one replica.

The read set and the write set overlap in at least R plus W minus N members, here one. So some replica in the read set holds the write, and comparing versions returns it. A read waits for 3 responses, not the slowest, and hinted handoff weakens this guarantee rather than creating it.

## Question 3

Why does a newly elected Raft leader append a no-op entry immediately?

A, to trigger a snapshot so lagging followers can catch up. B, to announce the membership configuration to followers. C, to commit an entry from its own term, which commits the older ones. D, to reset every follower's election timer in the new term.

[think]

The answer is C: to commit an entry from its own term, which commits the older ones.

A leader may not commit an entry from an earlier term just by counting replicas, because a server with a higher last term could still win an election and overwrite it. Committing an entry from the current term makes the whole prefix safe, through log matching. Heartbeats, not the no-op, reset election timers.

## Question 4

A Paxos proposer holds promises from a majority for proposal 7. One promise reports an accepted proposal 3 with value X. Another reports an accepted proposal 5 with value Z. The proposer wants value Y. What must it propose?

A, Z, from the highest-numbered accepted proposal reported. B, Y, because its number 7 beats both reported proposals. C, nothing, until it finds out which value was chosen. D, X, because it was the first value any acceptor accepted.

[think]

The answer is A: Z, from the highest-numbered accepted proposal reported.

The rule is to adopt the value of the highest-numbered accepted proposal among the promises. If any value could have been chosen, the latest such proposal carries it. The proposer's own number only entitles it to run phase two, and it never needs to know whether a value was chosen; the rule preserves it either way.

## Question 5

In two-phase commit, at what moment is the transaction irrevocably committed?

A, when every participant has voted yes to the coordinator. B, when the client receives the commit acknowledgement. C, when the first participant has committed locally. D, when the coordinator durably logs its commit decision.

[think]

The answer is D: when the coordinator durably logs its commit decision.

Yes votes are promises, not a decision; the coordinator may still abort if another vote is missing. The logged decision is the commit point, and after it, recovery always drives every participant to commit. Participants commit, and the client hears about it, afterwards.

## Question 6

Sensor readings keyed by timestamp, in a range-partitioned store, overload one node. Which fix works?

A, add more nodes, so the ranges spread more thinly. B, lead the key with a hash bucket or the sensor id. C, split the hot range in half and move one half away. D, switch to synchronous replication to share the writes.

[think]

The answer is B: lead the key with a hash bucket or the sensor id.

New timestamps are always larger than existing keys, so they all go to the last range, whatever the node count and however often you split. Breaking the sort order, with a salt or a natural leading dimension like the sensor, spreads new writes across ranges.

## Question 7

Client B is granted fencing token 34 and reads a record. Client A's delayed write, with token 33, then arrives, and B writes based on what it read. What closes this gap?

A, the lease service revokes token 33 at the resource when it expires. B, a shorter lease, so that A's writes arrive before B is granted. C, A re-checks its lease immediately before sending each write. D, B touches the resource with token 34 before it reads anything.

[think]

The answer is D: B touches the resource with token 34 before it reads anything.

Storage rejects 33 only after it has seen 34. A fenced read, or a no-op write with 34, raises the stored highest token before B relies on the data, so A's late write is rejected. A re-check by A cannot help, because the write was already in flight, and the lease service has no channel to the resource.

## Question 8

Waiters B, C and D queue behind holder A in a ZooKeeper lock, each watching its predecessor. C's session expires. What should D do?

A, nothing, since its watch was set on the parent. B, watch A's node, because A is the current holder. C, take the lock, since its predecessor has gone. D, re-list the children, find B ahead, and watch B.

[think]

The answer is D: re-list the children, find B ahead, and watch B.

D's watch fires because C's node was deleted, but a notification means re-check, not granted. D lists the children, sees A and B still ahead, and watches B, its new predecessor. Taking the lock would give two holders, and watching A or the parent brings back the herd effect.

## Question 9

After a rebalance, a paused old instance wakes up and produces to the output topic with the same transactional id as its replacement. What rejects its writes?

A, the group protocol revoking its input partitions. B, the epoch its replacement bumped at initialisation. C, the output partition moving to a new leader broker. D, its expired session, which stops it producing.

[think]

The answer is B: the epoch its replacement bumped at initialisation.

When the replacement initialised its producer, the coordinator bumped the epoch and aborted the open transaction. The broker and the coordinator then refuse the old epoch with a producer-fenced error. The zombie never has to notice the rebalance, which is the point: a paused process has not noticed anything.

## Question 10

A Cassandra replica misses a delete, stays down for 15 days, and then rejoins a cluster whose tombstone grace period is 10 days. What is the likely outcome?

A, nothing; repair treats the stale row as already deleted. B, the deleted row comes back, because its tombstone is gone everywhere else. C, the cluster rejects the node for exceeding the grace window. D, the delete reaches it on rejoin, through normal hinted handoff.

[think]

The answer is B: the deleted row comes back, because its tombstone is gone everywhere else.

The tombstone was purged from the other replicas after 10 days, so nothing shadows the old value, and repair copies the stale row back to them. Hints expire after 3 hours by default, and nothing rejects the node automatically. A node down longer than the grace period must be rebuilt.

## Question 11

A retailer replicates inventory across three regions with a PN-Counter, so every region can sell without coordination. What goes wrong?

A, nothing; the counter converges to the correct total. B, two regions sell the last unit, and stock goes negative. C, increments made during a partition are lost on merge. D, a PN-Counter cannot represent the decrements of sales.

[think]

The answer is B: two regions sell the last unit, and stock goes negative.

Convergence is not an invariant. Each region's decrement is valid locally, and the merge faithfully sums both, giving minus one. Preventing oversell needs coordination: a home region for each product, or stock escrowed between regions.

## Question 12

An etcd cluster's write latency jumps and leader elections become frequent. What is the most likely cause?

A, too many clients holding watches open on the leader. B, clock skew between nodes corrupting the election timers. C, an even number of members splitting every vote. D, slow disk syncs on the write-ahead log, delaying appends and heartbeats alike.

[think]

The answer is D: slow disk syncs on the write-ahead log, delaying appends and heartbeats alike.

Commits wait for a disk sync on the leader and a majority, and heartbeats share that path, so a stalling disk delays heartbeats, followers time out, and they elect. Election timers are local durations on a monotonic clock, so skew does not affect them. Fix the disk first, with the 99th percentile sync under 10 milliseconds, before raising timeouts.

## Recap

Two ideas ran through these questions. Overlap is what makes coordination safe: quorums that must share a member, a Paxos proposer forced to adopt the latest accepted value, a Raft leader committing in its own term, a commit point that is one durable log record. And the resource, not the actor, has the last word: fencing tokens checked at storage, epochs refused by the broker, a re-list after every watch, a tombstone that must outlive every replica's absence. When an actor's own belief is what keeps you safe, assume it is stale.
