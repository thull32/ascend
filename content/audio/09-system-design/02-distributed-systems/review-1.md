---
review: distributed-systems
source: 3a4aa3d6e784f93d
---
## Introduction

Twelve questions from the distributed-systems module. Answer out loud before the answer comes.

They run in the order of the lessons: time and ordering, replication, Raft, Paxos and ZooKeeper, distributed transactions, partitioning, failure detection, locks, exactly-once, gossip and CRDTs, with one more on sagas at the end. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

Two events have vector clocks. The first is three, zero, zero. The second is two, three, two. What is their relation?

A, the second happened before the first, because it has the larger sum. B, the first happened before the second, because P1 moved first. C, they are concurrent, since each is larger in some entry. D, they are equal, because both have seen at least two events on P1.

[think]

The answer is C: they are concurrent, since each is larger in some entry.

Neither vector is less than or equal to the other in every entry. The first is larger in P1's entry, the second in P2's and P3's, so no causal path connects them. Sums and single entries never decide order; only the entry-by-entry comparison does.

## Question 2

A leader acknowledges a write after its local commit and ships it to followers asynchronously. It handles 5 thousand writes a second with 40 milliseconds of replication lag. Then it crashes and a follower is promoted. Roughly how many acknowledged writes are lost?

A, none, because the follower has the log. B, about 5 thousand, one second of writes. C, about 200, the write rate times the lag. D, about 40, one per millisecond of lag.

[think]

The answer is C: about 200, the write rate times the lag.

Writes inside the lag window exist only on the leader: 5 thousand a second times four hundredths of a second is 200. A semi-synchronous follower would bring this to zero, at a cost of 1 to 2 milliseconds per write. The follower has the log only up to the point it was shipped.

## Question 3

In a five-server Raft cluster with the leader down, two followers time out 2 milliseconds apart. Both become candidates in term 2, and each collects one other vote. What happens next?

A, the candidate with the higher server id takes over the term. B, both become leaders of term 2 until the next heartbeat. C, the remaining follower breaks the tie by voting again. D, their timers re-arm randomly, and one of them wins a later term.

[think]

The answer is D: their timers re-arm randomly, and one of them wins a later term.

With two votes each and three needed, term 2 has no leader. Each candidate re-arms with a fresh random timeout, and the one that fires first starts term 3 and usually wins. Servers vote once per term, so nobody votes again in term 2, and election safety forbids two leaders in one term.

## Question 4

A ZooKeeper client reads a znode from a follower immediately after another client's write was acknowledged by the leader. What may it see?

A, always the new value, since the write was acknowledged. B, an error until the follower has applied the write. C, possibly the old value, unless it calls sync first. D, a torn mix of the old and new values.

[think]

The answer is C: possibly the old value, unless it calls sync first.

Followers answer reads from local memory and may lag, so clients get sequential consistency, a growing prefix of history, rather than linearizable reads. A quorum acknowledgement does not mean every server has applied the write. Calling sync makes the follower catch up with the leader before the read, at the cost of a round trip.

## Question 5

In two-phase commit, the coordinator crashes after all participants voted yes, but before it logged a decision. It restarts ten minutes later. Using presumed abort, what happened in between, and what is the outcome?

A, participants waited with their locks held, and the transaction aborts. B, participants aborted at once, and the restart finds nothing to do. C, participants elected a new coordinator, which committed. D, participants timed out and committed, since everyone voted yes.

[think]

The answer is A: participants waited with their locks held, and the transaction aborts.

A participant that voted yes is in doubt. It cannot commit, because a vote could have been missing, and it cannot abort, because the coordinator could have committed. So it holds its locks for the whole outage. On restart the coordinator finds no decision record, which under presumed abort means abort.

## Question 6

A cluster places keys by taking the hash of the key modulo the number of nodes. Growing from 20 nodes to 21 moves approximately what fraction of the keys?

A, about 5 percent, the new node's fair share. B, about zero, since existing keys keep their nodes. C, about 50 percent, half the keys on average. D, about 95 percent, since the two remainders rarely agree.

[think]

The answer is D: about 95 percent.

A key stays put only if its hash modulo 20 equals its hash modulo 21, which happens for about one key in 21. So about 95 percent move, and every node both sends and receives. Consistent hashing or fixed partitions bring movement down to about one twenty-first.

## Question 7

A node's heartbeat is 8 seconds late. Which cause can the failure detector rule out from the silence alone?

A, a partition, since the other links are healthy. B, a crash, since a crashed host always resets its TCP connections. C, a garbage collection pause, since pauses never exceed a few seconds. D, none of them; all three produce the same silence.

[think]

The answer is D: none of them; all three produce the same silence.

Silence carries no information about its cause. Pauses can last tens of seconds, a crashed or frozen host need not send a reset, and healthy links elsewhere say nothing about this one. That is why acting on a detection must stay safe when the detection is wrong, through leases and fencing.

## Question 8

A lock is taken with set-if-not-exists, with an expiry, on a Redis primary that replicates asynchronously. The primary crashes and a replica is promoted. What can happen?

A, the replica lacks the key, so a second client acquires the lock. B, all clients disconnect, and the lock is released safely. C, the lock survives, because replicas copy every key at once. D, Redis refuses to promote a replica while any lock is held.

[think]

The answer is A: the replica lacks the key, so a second client acquires the lock.

The primary acknowledged the set before replicating it, so the promoted replica may never have seen the key, and a second client takes the lock while the first is still working. Waiting for a replica to acknowledge narrows the window but does not make Redis strongly consistent. That makes a single-node Redis lock an efficiency lock.

## Question 9

Kafka's idempotent producer prevents which duplicate?

A, the application calling send twice for one event. B, a restarted producer resending its last batch. C, an external sink rewriting a consumer's replay. D, the client resending a batch after a lost acknowledgement.

[think]

The answer is D: the client resending a batch after a lost acknowledgement.

The partition leader recognises a resent batch by its producer id, epoch and sequence number, within one producer session. A restarted producer has a new producer id, so its resend is new. A second send call is a new record with a new sequence, and sinks downstream of Kafka are out of scope.

## Question 10

In SWIM, why does a prober ask three other members to ping the target before suspecting it?

A, to elect a leader that decides whether the target is dead. B, to average round-trip latency measured from several places. C, so that a bad link to the target is not mistaken for its death. D, to spread the probing load more evenly across all members.

[think]

The answer is C: so that a bad link to the target is not mistaken for its death.

If any indirect prober gets an ack, the target is alive and the problem was the path from the original prober. This removes the single-bad-link false positive without a coordinator. The indirect probes add traffic rather than spreading it, and no leader is involved.

## Question 11

Bob reads Alice's new document title and then changes it, but his clock is 500 milliseconds behind hers. Under a last-writer-wins register using wall-clock time, what is the final title?

A, both, kept as siblings for a person to resolve later. B, whichever replica's state reaches the other one last. C, Bob's, because his edit happened later in real time. D, Alice's, because Bob's later edit carries an older timestamp.

[think]

The answer is D: Alice's, because Bob's later edit carries an older timestamp.

Last-writer-wins compares timestamps, and Bob's clock stamped his causally later write lower than Alice's, so his edit is discarded without an error. A hybrid logical clock would advance Bob's clock past Alice's timestamp when he received her write, and let his edit win. Siblings are what a multi-value register does, not last-writer-wins.

## Question 12

A saga's hotel-booking step times out with no response. What should the orchestrator do?

A, mark the saga failed and stop, without compensating. B, run the compensations at once, treating it as a failure. C, retry the step with the same idempotency key. D, skip to the car step, treating the hotel as booked.

[think]

The answer is C: retry the step with the same idempotency key.

A timeout is an unknown outcome: the hotel may have booked. Compensating could cancel something that succeeded, or leave a room nobody pays for, and moving on could build on nothing. An idempotent retry returns the original result if it did succeed. Only a definite failure before the pivot step triggers compensation.

## Recap

Three ideas kept coming back. Silence and timeouts are ambiguous: a missing heartbeat, a coordinator that went quiet, or a saga step that timed out all mean "unknown", so the safe moves are waiting, retrying idempotently, or fencing, never guessing. Asynchronous anything loses whatever sat in the gap, whether that is replication lag on a leader or a lock key that never reached the replica. And order comes from structure, not from wall clocks: vector clocks, sequence numbers and epochs decide what came first, while timestamps quietly drop real edits.
