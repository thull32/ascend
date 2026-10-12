---
lesson: paxos-and-zab-intuition
source: cddcc11f7efa8daa
---
## 1

A Paxos proposer holds promises from a majority for proposal 7. One promise reports that it accepted proposal 3 with value X, and another reports that it accepted proposal 5 with value Z. The proposer wants Y. What must it propose?

A, Z, from the highest-numbered accepted proposal reported. B, Y, because its number 7 beats both reported proposals. C, nothing, until it finds out which value was chosen. D, X, because it was the first value that any acceptor accepted.

[think]

The answer is A: Z, from the highest-numbered accepted proposal reported.

The rule is to adopt the value of the highest-numbered accepted proposal among the promises: if any value could have been chosen, the latest such proposal carries it. The proposer's own number only entitles it to run phase 2. It never needs to know whether a value was chosen; the rule preserves it either way.

## 2

Proposer P's accept for proposal 1, value X, reaches one acceptor of three. Then proposer Q's prepare for proposal 2 reaches all three. Why can Q not propose its own value, Y?

A, its proposal number 2 is too small to override a proposal of 1. B, X has already been chosen by a majority of acceptors. C, one of its promises reports proposal 1 with X, which may have been chosen. D, acceptors refuse to promise anything once they accept X.

[think]

The answer is C: one of its promises reports proposal 1 with X, which may have been chosen.

X was on only one acceptor, so it was not chosen, but Q cannot distinguish that from a majority it did not hear from, so the rule makes it adopt X. Acceptors still promise higher numbers after accepting. Had Q's prepare arrived before P's accept, its promises would have been empty, and Y could have been chosen.

## 3

In the simulation, two Paxos proposers retrying immediately still always reached a decision. What did duelling cost?

A, nothing measurable, compared with a single proposer. B, tail latency: a 99th percentile about 2.5 times the single proposer's. C, a higher median, but an unchanged tail latency. D, safety: a few runs chose two different values.

[think]

The answer is B: tail latency: a 99th percentile about 2.5 times the single proposer's.

With random message delays, duels end, but runs that collide need several rounds: the 99th percentile was 5.4 round trips against 2.2 with one proposer, and random backoff brought it back to about 2.7. Duels never put safety at risk, which is why the remedy is a stable leader rather than a stronger check.

## 4

A ZooKeeper leader proposed the transaction with epoch 1, counter 5, to one follower of five, and crashed. That follower becomes the new leader. What happens to that transaction?

A, it is committed when the new leader syncs a quorum. B, it is re-proposed under a new epoch-2 transaction ID instead. C, it waits until the old leader restarts and commits it. D, it is discarded, because it never reached a quorum.

[think]

The answer is A: it is committed when the new leader syncs a quorum.

Synchronisation brings a quorum up to the new leader's history before any new proposal, so the transaction becomes committed with its original ID. Entries that only the old leader held, like counter 6 in the lesson's trace, are truncated when it rejoins. A client whose request timed out may therefore find that its write took effect.

## 5

A ZooKeeper client reads a znode from a follower, immediately after another client's write was acknowledged by the leader. What may it see?

A, always the new value, since the write was acknowledged. B, an error, until the follower has applied the write. C, possibly the old value, unless it calls sync first. D, a torn mix of the old and the new values.

[think]

The answer is C: possibly the old value, unless it calls sync first.

Followers answer reads from local memory and may lag, so clients get sequential consistency, a growing prefix of history, rather than linearizable reads. A quorum acknowledgement does not mean every server has applied the write. Calling sync makes the follower catch up with the leader before the read, at the cost of a round trip.

## 6

With Flexible Paxos on five acceptors, commits use any 2 acceptors. How many must a leader change reach?

A, 2, the same number as the commit quorum. B, 3, a plain majority of the five acceptors. C, 4, so the two quorums always intersect. D, 5, every acceptor, to be certain of safety.

[think]

The answer is C: 4, so the two quorums always intersect.

Safety only requires every leader-change quorum to intersect every commit quorum, so the two sizes must add up to more than 5, and with commits at 2, leader changes need at least 4. Steady-state commits get faster, and leader changes need four of five alive. A majority of 3 could miss both acceptors that accepted a committed value.
