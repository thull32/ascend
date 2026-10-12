---
lesson: gossip-and-anti-entropy
source: ef43afb3cfa30695
---
## 1

In the lesson's simulation, push-pull gossip with a fanout of 3 reached every one of 1,000 nodes in how many rounds, and how does that grow?

A, about 5, adding 1 or 2 rounds per tenfold growth in nodes. B, about 330, since a third of the nodes are reached each round. C, about 1,000, since every node needs a round of its own. D, about 30, growing linearly with the number of nodes.

[think]

The answer is A: about 5, adding 1 or 2 rounds per tenfold growth in nodes.

Informed nodes multiply each round, so the count grows logarithmically: the simulated mean was 5.1 rounds at 1,000 nodes, and 6.7 at 10,000. The linear answers assume one informer at a time; in gossip, every informed node spreads in parallel.

## 2

In SWIM, why does a prober ask three other members to ping the target before suspecting it?

A, to elect a leader that decides whether the target is dead. B, to average the round-trip latency measured from several places. C, so a bad link to the target is not mistaken for its death. D, to spread the probing load more evenly across all members.

[think]

The answer is C: so a bad link to the target is not mistaken for its death.

If any indirect prober gets an acknowledgement, the target is alive, and the problem was the path from the original prober. This removes the false positive from a single bad link, without a coordinator. The indirect probes add traffic rather than spreading it, and no leader is involved.

## 3

Node E learns, from a piggybacked message, that it is suspected with incarnation 4. What does it do so the cluster keeps it alive?

A, it waits until its heartbeat version passes the suspicion's. B, it gossips alive with incarnation 5, which overrides suspect 4. C, it pings the accuser directly, so the accuser cancels its timer. D, it asks a majority of members to vote that it is still alive.

[think]

The answer is B: it gossips alive with incarnation 5, which overrides suspect 4.

Only E increments its own incarnation, and an alive message replaces a suspect message whenever its incarnation is greater, so alive 5 overrides every copy of suspect 4 as it spreads. Other members' timers are cancelled by that update, not by a direct message, and SWIM has no vote.

## 4

Two replicas compare Merkle trees level by level. The trees have 2 to the 15th leaves, and exactly one leaf differs. How many hash comparisons does the walk make?

A, 31 comparisons, two per level below the root. B, 15 comparisons, one for each level of the tree. C, 65,535 comparisons, one for every tree node. D, 32,768 comparisons, one for every leaf hash.

[think]

The answer is A: 31 comparisons, two per level below the root.

The roots are compared once. At each of the 15 levels below, only the children of the one differing node are compared, two hashes per level: 1 plus 2 times 15 is 31. Equal subtrees are never entered, which is the point of the tree, and comparing every leaf or node is what it avoids.

## 5

A Cassandra repair streams 27 gigabytes to fix about 1 gigabyte of scattered differences. What is the most likely cause?

A, repair streaming always sends data without compression. B, tombstones are streamed alongside every row they shadow. C, each differing leaf streams every partition it covers. D, every replica streams its full copy of each changed row.

[think]

The answer is C: each differing leaf streams every partition it covers.

With about 30 partitions per leaf, a single differing partition makes its whole leaf stream, so scattered differences inflate the transfer about 26 to 30 times. Smaller subranges, or incremental repair, make the leaves finer or the data smaller; throttling would only slow the same transfer.

## 6

A replica misses a delete, stays down for 15 days, and rejoins a Cassandra cluster whose tombstone grace period is 10 days. What is the likely outcome?

A, nothing, because repair treats the stale row as already deleted. B, the deleted row comes back, because its tombstone is gone elsewhere. C, the cluster rejects the node for exceeding the grace window. D, the delete reaches it on rejoin, through normal hinted handoff.

[think]

The answer is B: the deleted row comes back, because its tombstone is gone elsewhere.

The tombstone was purged from the other replicas after 10 days, so nothing shadows the old value, and repair copies the stale row back to them. Hints expire after 3 hours by default, and nothing rejects the node automatically: a node down longer than the grace window must be rebuilt.
