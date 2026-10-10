---
lesson: replication-strategies
source: d1997494f18fe4b3
fit: great
desk:
  - "The Postgres, MySQL and Kafka settings that set the loss window, and their traps"
  - "The partial-quorum staleness table, by configuration and time after the acknowledgement"
  - "The sloppy-quorum and non-linearizable quorum traces, step by step"
  - "The Cassandra QUORUM read path and the strategy decision flowchart"
---
## Introduction

A single database server handles somewhere in the tens of thousands of simple writes and reads a second before hardware becomes the limit. And it has one disk, one power supply and one network port between your product and an outage.

Replication answers both problems. Copies on other machines take reads, survive the first machine's death, and sit near users in other regions. The price is that the copies cannot all change at the same instant. So every replicated system answers three questions: who accepts writes, how do the others find out, and what does a client see in between.

There are three answers: one leader, several leaders, or no leader at all. The senior bar is knowing the mechanics of each well enough to say, with a number, what it loses when something breaks.

## Single leader, and what failover loses

One replica, the leader, accepts all writes. It appends each write to its log and ships the log to followers, which apply it in order. Postgres, MySQL, MongoDB replica sets and Kafka partitions all work this way.

The question is when the leader says yes. Asynchronous: after its own commit, adding no latency, but anything not yet shipped dies with the leader. Synchronous to every follower: no loss, but each write waits for the slowest follower, and one dead follower blocks all writes, so you are less available than a single node. The middle ground is semi-synchronous: wait for one follower. That costs the fastest follower's round trip, which is under a millisecond in one availability zone, 1 to 2 milliseconds across zones, and 60 to 150 milliseconds across continents.

Here is the formula to carry. Asynchronous failover loses the write rate times the lag. At 5 thousand writes a second and a healthy 20 milliseconds of lag, a leader crash loses about 100 acknowledged writes. During a bulk import that pushes lag to 30 seconds, it loses 150 thousand. Size the loss window from bad lag, not healthy lag.

Failover itself has four steps. Detect, which takes 10 to 30 seconds, because shorter timeouts fail over on every garbage collection pause. Choose the follower with the most complete log. Redirect clients; AWS documents its managed database failover as typically 60 to 120 seconds end to end. And demote the old leader, which discards writes the new one never had.

And if the old leader was only partitioned, not dead, both nodes accept writes. That is split brain: two divergent histories. The defence is fencing. The promoted leader gets a higher epoch, and storage and clients reject anything stamped with a lower one. Automated failover without fencing is more dangerous than no automated failover.

One trap to name: MySQL's semi-synchronous mode silently falls back to asynchronous after a 10 second timeout during a replica stall. No alert, and the next failover loses data anyway.

## Reading your own writes

Lag becomes a user-visible bug the moment someone edits their profile, gets redirected to a page served by a follower, and sees the old value.

The fix is a log-position token, not a sleep. After a write, the leader returns the position of that commit in its log. The session keeps the highest token it has seen. A follower may serve that session's read only once it has replayed past the token; otherwise the read waits briefly or goes to the leader.

Everyone else keeps reading from any follower. The cost is one number per session and one comparison per read. That beats pinning a user to the leader for a few seconds after a write, a heuristic that fails exactly when lag spikes.

## Multi-leader, and the lost like

Several nodes accept writes and replicate to each other asynchronously. The cases that justify it are specific: a leader per region so users write locally, 1 millisecond instead of 70; devices that work offline and sync later; and collaborative editing.

Now a conflict. A post has 10 likes, held by a US leader and an EU leader with perfectly synchronised clocks. One user likes it in each region within the same second. Each leader reads 10, adds one, writes 11, and replicates the value. Last-writer-wins picks one of the two elevens.

[pause]

Both regions converge on 11, and it is wrong. One like is gone. No clock skew was needed. Last-writer-wins decides which value survives, but each value was computed from a stale read.

Replicate the operation instead. Keep a counter with one entry per leader: the US has added one, the EU has added one. Merging takes the maximum of each entry, so both sides end at 10 plus two, which is 12. That merge is commutative and idempotent, and it loses nothing. It is a CRDT.

The other options: keep both versions as siblings and make every reader merge; write an application merge per type; or avoid conflicts by giving each key a home leader, with other regions forwarding writes. That last one is what most "active-active" deployments really do.

Systems differ in when they notice. CouchDB keeps every branch of a document, picks the same winner everywhere, and flags the loser until your code merges it. DynamoDB global tables, in their default mode, use last-writer-wins, which is the likes trace. MySQL Group Replication catches conflicts before commit, rolling back a transaction whose rows overlap one ordered earlier. And Postgres logical replication simply stops on a conflicting row until an operator steps in.

## Leaderless and the quorum

No replica is special. A coordinator sends each write to all N replicas and succeeds after W acknowledgements. A read asks R replicas and returns the newest version. Amazon's Dynamo paper defined the model; Cassandra, Riak and ScyllaDB implement it. DynamoDB, despite the name, runs a leader per partition.

The rule is R plus W greater than N. The proof is one line: a write set of W and a read set of R, drawn from N, must share at least R plus W minus N replicas, because together they cannot exceed N. So with three replicas, writing to two and reading from two, at least one replica in every read holds the latest acknowledged write.

Three, two, two is the default for a reason: waiting for the second fastest of three costs about the median round trip, while waiting for all three pays for the slowest, including its occasional 50 millisecond pause.

When R plus W is not greater than N, overlap is a probability that decays. The lesson simulated three replicas, writing to one and reading from one, with replicas applying a write after about 5 milliseconds on average. At the moment of acknowledgement, a read misses the write two times in three. Ten milliseconds later, 9 percent. Twenty milliseconds later, about 1 percent. So "eventually" is milliseconds when replicas are healthy, and as long as the outage when one is not.

## Where the quorum guarantee breaks

First, sloppy quorums. Three replicas, write two, read two. A key belongs on A, B and C. A partition cuts off B and C, so the write goes to A and to a neighbour, D, holding a hint that says "this belongs to B". The write is acknowledged. Then the partition heals and A crashes before D delivers the hint. A read goes to B and C.

[pause]

It returns the old value. The two replicas that took the write were not both in the read set, so the overlap proof no longer applies. Hinted handoff buys write availability and pays with the guarantee. Cassandra keeps hints for 3 hours by default; a replica down longer must be fixed by repair.

Second, a quorum is not linearizable. Client A's write lands on replica one while replica two's copy is still in flight. Client B reads replicas one and three and sees the new value. Then client C, after B's read returns, reads replicas two and three and sees the old value. No single real-time order explains both reads.

Blocking read repair fixes that case: B's read writes the new value back to the stale replica before answering, and since version 4.0 that is Cassandra's default. It does not fix concurrent last-writer-wins writes, or a failed write stuck on one replica that read repair later spreads everywhere, so a write the client was told failed becomes visible. Linearizable operations need consensus. Cassandra's lightweight transactions run Paxos per partition, at four round trips per write by default.

## In the interview

Here is the follow-up the lesson expects. Three replicas, W equals 2, R equals 2. Is a read guaranteed to return the latest write?

[pause]

It is guaranteed to include a replica holding the latest acknowledged write, by the overlap proof. It is not linearizable. A write in flight can be seen by one reader and missed by a later one unless read repair blocks, and concurrent last-writer-wins writes or sloppy quorums break the guarantee further. The wrong answer is "yes, R plus W greater than N means strong consistency."

And: the primary fails, what exactly do you lose? With asynchronous replication, the write rate times the lag: about 100 writes at 5 thousand a second and 20 milliseconds, far more if lag had spiked. With a semi-synchronous follower in another zone, nothing, for 1 to 2 milliseconds per write. And the promotion must be fenced. "Nothing, we have replicas" ignores the asynchronous window.

As for choosing: a ledger is single leader with a synchronous follower and fenced failover, never multi-leader. A read-heavy feed is single leader with many followers and read-your-writes for the author. A multi-region whiteboard is multi-leader with CRDTs, because users must write locally and every stroke must survive.

## Recap

Four things to remember. Asynchronous failover loses the write rate times the lag, so size it from the worst lag, buy it down with one semi-synchronous follower, and fence every promotion. Last-writer-wins loses a concurrent increment even with perfect clocks; replicate operations or give keys a home. R plus W greater than N guarantees overlap with acknowledged writes, not linearizability. And sloppy quorums and in-flight writes are exactly where that overlap breaks.

At your desk: the database settings that set the loss window, the staleness table, the sloppy-quorum and in-flight-write traces, and the decision flowchart.
