---
lesson: cap-and-pacelc
source: e3f0ff37ec2d66ba
---
## 1

A three-replica system with a quorum of two suffers a partition that isolates one replica. Under a CP design, which clients are affected?

A, all clients, since the system refuses requests during any partition. B, only clients that can reach the isolated replica alone. C, only writing clients, while reads continue everywhere. D, no clients, because a quorum of two still exists.

[think]

The answer is B: only clients that can reach the isolated replica alone.

The majority side keeps a quorum, and serves reads and writes after at most an election. The isolated replica cannot reach a quorum, and refuses. Linearizable reads on the minority side must also refuse, or they could return stale data.

## 2

Writes originate in US East, and the business wants no data loss if US East is lost. Which placement delivers that with the lowest everyday write latency?

A, one replica in each region, with every write waiting for both. B, asynchronous replication to West, with an alert on replica lag. C, two replicas each in East and West, plus a witness in a nearby region. D, two replicas in East and one in West, writing to a majority.

[think]

The answer is C: two replicas each in East and West, plus a witness in a nearby region.

A majority of five that always includes a replica outside US East survives its loss with nothing missing, and a witness near the writer kept the simulated median at 25 milliseconds. Two in East plus one in West commits without the West replica, so it can lose writes. One per region is lossless, but pays 65 milliseconds per write and stops on any partition, and asynchronous replication loses the write rate times the lag.

## 3

During a partition, two Cassandra replicas accept different values for the same cell. The later write came from a node whose clock ran 5 milliseconds slow. After the partition heals, what is stored?

A, the earlier write, since its timestamp is higher. B, the later write, since hinted handoff replays in arrival order. C, both values, kept as siblings for the application to merge. D, an error, since reconciliation detects the conflicting writes.

[think]

The answer is A: the earlier write, since its timestamp is higher.

Cassandra reconciles each cell by write timestamp, and the highest wins. The slow clock gave the later write a lower timestamp, so it silently loses. Siblings are a Riak-style design, and Cassandra reports no conflict.

## 4

Why does a strongly consistent write in a three-region deployment cost around 65 times the median latency of a local acknowledgement?

A, each cross-region hop needs a fresh TLS handshake per write. B, it must fsync to disk three times, once in each region. C, cross-region links have far lower bandwidth than local ones. D, it waits for a majority, which needs a cross-region round trip.

[think]

The answer is D: it waits for a majority, which needs a cross-region round trip.

A majority of three waits for the second-fastest acknowledgement, and with replicas in other regions, that is a round trip of 60 to 80 milliseconds, against about 1 millisecond locally. A small write is bound by latency, not bandwidth, and each replica fsyncs in parallel.

## 5

In the simulation, waiting for 2 of 3 replicas had a far better 99th percentile than waiting for all 3. Why?

A, majority writes skip the fsync on the slowest replica. B, a majority write sends less data to each replica. C, waiting for all three adds extra round trips per write. D, waiting for any two hides a single stalled replica.

[think]

The answer is D: waiting for any two hides a single stalled replica.

The write completes at the second-fastest acknowledgement, so one replica stalling, with a garbage collection pause or a disk hiccup, does not delay it. Waiting for all three makes every replica's stall your stall. The exact 99th percentile depends on the stall rate assumed, but the shape holds for any non-trivial rate.

## 6

A team chooses AP for user settings, with the default last-writer-wins. What is the most likely consequence after a 20-minute partition?

A, settings are unavailable on the minority side during the partition. B, some writes are silently discarded, with clock skew picking which. C, both sides' writes conflict on heal, and the merge step deadlocks. D, nothing, since last-writer-wins guarantees convergence to the truly newest value.

[think]

The answer is B: some writes are silently discarded, with clock skew picking which.

Last-writer-wins converges, but to the highest timestamp, which under skew may be the older write, and no error is raised. AP requires a merge rule that preserves both sides' intent. Unavailability on the minority side is the CP outcome, not this one.
