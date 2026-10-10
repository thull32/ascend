---
lesson: paxos-and-zab-intuition
source: 4b31f4fbf17615a9
fit: great
desk:
  - "The two-proposer Paxos trace as a table, in both message orders"
  - "The duelling-proposer simulation table"
  - "The ZAB leader-change trace with zxids, DIFF and TRUNC"
  - "The Multi-Paxos, Raft and ZAB comparison table"
---
## Introduction

Three servers must agree on one value: who the leader is, or what the next log entry is. Any of them may crash, messages may be delayed arbitrarily, and nobody has a reliable clock.

"Vote and take the majority" sounds sufficient until you write down what happens when a server crashes mid-vote. Or when two servers each believe they have a majority because a message was delayed. Or when a server that was slow rather than dead wakes up with a stale view and starts proposing.

Paxos, published by Leslie Lamport in a paper so odd it took years to be taken seriously, was the first algorithm to get every one of those cases right. Its core is two rounds of messages and one invariant. Raft is best understood as Multi-Paxos with the leader and the log made mandatory. And ZooKeeper's protocol, ZAB, is the same family adapted to a primary-backup system. Three things, then: why consensus is hard, how Paxos survives it, and what ZooKeeper actually guarantees its clients.

## Why it is hard

In 1985, Fischer, Lynch and Paterson proved that in an asynchronous system, with no bound on message delay, no deterministic algorithm can guarantee to reach consensus if even one process may crash. This is the FLP result.

The reason is simple to say. A crashed process looks exactly like a slow one. An algorithm that waits for it may wait forever. One that proceeds without it may decide differently from what the slow process later decides.

Practical algorithms escape by giving up guaranteed termination in pathological schedules, and using timeouts and randomness to make those schedules rare. Paxos and Raft are always safe, never deciding two values, and they eventually decide whenever the network behaves for long enough. Safety unconditionally, liveness under partial synchrony: that is the shape of every correct consensus protocol. Any design that promises both with no timing assumption is wrong.

And why majorities? Because any two majorities share a node, and that shared node is the memory that carries a decision from one round to the next.

## Single-decree Paxos

Paxos decides one value. Proposers propose; acceptors vote, and their collective state is the decision. Every proposal carries a unique number, ordered, with the proposer's id as a tie-breaker.

Phase one is prepare and promise. The proposer sends prepare with its number. An acceptor that has not already promised a number at least that high promises to ignore every lower proposal, and replies with the highest-numbered proposal it has already accepted, if any.

Phase two is accept. With promises from a majority, the proposer picks a value, and here is the rule that makes Paxos work. If any promise reported an accepted proposal, the proposer must use the value of the highest-numbered one. Only if none did may it use its own. When a majority accepts the same proposal, the value is chosen.

The invariant: once a value is chosen, every higher-numbered proposal that reaches phase two carries that same value.

Now a trace with two proposers and three acceptors. P wants X, Q wants Y. P sends prepare 1 to two acceptors and gets two promises, a majority. P's accept of X reaches only the first acceptor. Then Q sends prepare 2 to all three, and the first acceptor's promise says "I accepted proposal 1 with value X". Q wants Y. What must Q propose?

[pause]

X. X was not actually chosen; only one acceptor of three had it. But Q cannot tell that apart from a majority it did not hear from, so the rule makes it assume one might have. Q proposes X under number 2, all three accept, and X is chosen. Meanwhile P's late accept for proposal 1 is rejected, because the acceptors promised 2.

Swap the order, so Q's prepare reaches the acceptors before P's accept does. Then Q's promises are empty, Q proposes Y, P's accept is rejected, and Y is chosen. Either order ends with exactly one value, which is all Paxos promises.

One non-negotiable cost: acceptors must flush their promise and accepted proposal to disk before replying. An acceptor that forgets a promise after a restart can accept an older proposal and let two values be chosen.

## Duels, Multi-Paxos and Flexible Paxos

Two proposers can keep invalidating each other. P prepares 1, Q prepares 2, P prepares 3, and so on. Safety holds throughout; progress does not. That is FLP showing up in practice.

How bad is it? The lesson simulated it, 20 thousand runs per setting. Every run eventually decided, because random delays end duels. The cost is tail latency. One stable proposer reached a decision at the 99th percentile in about 2.2 round trips. Two proposers retrying immediately: about 5.4, roughly two and a half times worse. Random backoff of up to three round trips brought it back to about 2.7. That is why every production Paxos elects a leader and forwards proposals to it.

A log is a sequence of single-decree instances, one per slot. Running both phases per entry costs two round trips. Multi-Paxos runs phase one once, for every slot from here on, and then only phase two per entry: one round trip, the same as Raft. Phase one is the leader election. The part implementers got wrong was the leader change: a new leader must re-propose the highest-numbered accepted value for every slot anyone reports, and fill holes with no-ops, before serving anything new.

Flexible Paxos, from 2016, noticed that the proof needs only every phase-one quorum to overlap every phase-two quorum, not majorities for both. With five acceptors, you can commit with any two, if leader changes need four. Steady-state writes get faster; leader changes need four of five alive.

And reads face Raft's problem: a replaced leader does not know it. Spanner gives each Paxos leader a lease, 10 seconds by default, during which the others promise not to elect anyone else. TrueTime's bounded clock error is what makes "the lease has not expired" a safe judgement.

## ZooKeeper's ZAB

ZooKeeper is a replicated, in-memory tree of small nodes, used for configuration, locks, leader election and group membership by HBase, Hadoop, Solr and, until KRaft, Kafka. ZAB is built for primary-backup: one primary executes each write, turns it into an idempotent state change, and broadcasts the changes in order.

Every transaction gets a zxid: the high half is the epoch, bumped on each new leader, and the low half is a counter within the epoch. The leader proposes, followers log and flush and acknowledge, and on a quorum the leader commits. On a leader change, the new leader first establishes a new epoch, then brings a quorum up to its own history before accepting anything new.

Here is a leader change. Five servers in epoch 1, everything up to counter 4 committed. The leader proposes counter 5, which reaches only one follower, Z2, before the leader crashes. The leader had also logged counter 6 locally without sending it. Z2 has the highest zxid among the live servers, so it wins.

Synchronisation brings a quorum up to Z2's history, so entry 5 becomes committed, though no client was ever told it succeeded. When the old leader restarts, it is told to truncate back to entry 5, and entry 6 disappears, because no quorum member ever saw it.

The two guarantees that implements: primary order, where a primary's broadcasts are delivered in the order it sent them; and prefix recovery, where a new leader's history contains everything any earlier leader committed.

## What ZooKeeper clients actually get

Reads are local. Any server answers from memory without contacting the leader. Read throughput grows as you add servers; write throughput falls, because every write involves every voter.

So reads are not linearizable. A follower can lag the leader. Clients get sequential consistency, a view that is always a prefix of the true history and never moves backwards within a session, plus FIFO order for their own requests. The sync call makes your server catch up with the leader before the next read, at the cost of a round trip.

Sessions are kept alive by heartbeats. With the sample configuration, the timeout is 4 to 40 seconds. When a session expires, its ephemeral nodes are deleted. That is how a dead client's locks are released, and also how a live client that stalls past the timeout loses its lock without knowing.

And the limits. The whole dataset lives in memory on every server, and a node holds at most about one megabyte. ZooKeeper holds coordination state, not data.

## In the interview

A follow-up the lesson expects. You hold a ZooKeeper lock, and your JVM pauses for 40 seconds. What happens?

[pause]

The session expires at the server, since the timeout is at most 40 seconds by default. The ephemeral node is deleted and the next waiter takes the lock. When your process resumes, it may write before it notices. So the protected resource must check a fencing token, and the client must treat session expiry as fatal. The wrong answer is "the lock is held until I release it."

And: if Paxos and Raft are equivalent, why did everyone switch to Raft? Same fault tolerance and steady-state cost. But Raft specifies the whole system: a contiguous log, a log-complete leader so there is no per-slot reconciliation, membership, snapshots and client sessions. Multi-Paxos leaves all of that to implementers. "Raft is faster" is the wrong answer.

## Recap

Four things to remember. FLP means consensus cannot guarantee termination in a fully asynchronous system, so real protocols are always safe and buy liveness with timeouts, randomness and a stable leader. Paxos's safety is one rule: adopt the value of the highest-numbered accepted proposal you hear about, because majorities overlap. Duelling proposers cost tail latency, not safety, which is why everyone elects a leader. And ZooKeeper's writes are linearizable through the leader, but its reads are local and can be stale unless you sync, and an expired session silently drops your lock.

At your desk: the Paxos trace in both orders, the duel simulation, the ZAB leader-change trace, and the three-protocol comparison table.
