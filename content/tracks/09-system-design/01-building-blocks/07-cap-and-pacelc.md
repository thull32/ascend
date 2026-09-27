---
slug: cap-and-pacelc
title: "CAP and PACELC: what the theorem actually says and how to choose per operation"
description: Why "pick two of three" is wrong, what CAP really constrains during a partition, how PACELC adds the latency trade-off you pay every day, and how to choose per operation instead of per system.
minutes: 25
difficulty: hard
tags: [system-design, cap-theorem, pacelc, availability, partitions, trade-offs]
---
An interviewer asks "is your system CP or AP?" and the answer they are listening for is not two letters. They are checking whether you know that the question is malformed. CAP is about one moment: the network has split, a node has a request in hand, and it must either answer with what it has (and risk being wrong) or refuse (and be unavailable). Everything else people attribute to CAP, the "pick two", the "CA databases", the idea that it describes normal operation, is folklore.

The reason this matters at the senior bar is that the real decision is made per operation, not per database, and it is made with numbers: how long a partition lasts, how much a quorum round trip costs, what the user sees in each case. This lesson gives you the precise version of the theorem, its extension PACELC that covers the 99.9% of time when there is no partition, and a method for choosing.

## What CAP says

The formal statement (Gilbert and Lynch, 2002) concerns a single register replicated across nodes in an asynchronous network. Three properties:

- **Consistency** here means linearizability: every read returns the most recent acknowledged write, as if there were one copy. This is the strong meaning from [Consistency models](/learn/system-design/building-blocks/consistency-models), not ACID consistency.
- **Availability** means every request to a non-failed node eventually gets a non-error response. Not "fast", and not "the service as a whole is up": every node must answer.
- **Partition tolerance** means the system keeps operating when messages between nodes are dropped or delayed indefinitely.

The theorem: no system can provide all three. The proof is one paragraph. Split the nodes into two groups that cannot talk. A client writes `x = 1` to group one. Another client reads `x` from group two. Group two has not heard of the write. If it answers, it answers `x = 0`, which violates linearizability. If it refuses or waits until the partition heals, it violates availability. There is no third option.

Now the consequences that most descriptions get wrong.

**P is not a choice.** Networks partition. Switches fail, cables get cut, a misconfigured firewall drops one direction of traffic, a garbage-collection pause of 20 seconds makes a node look partitioned even though no packet was lost. A system that "chooses CA" is a system that has not decided what to do when a partition happens, which means it will do something arbitrary. In a real deployment you are choosing between C and A *during a partition*.

**It says nothing about normal operation.** When the network is healthy, nothing in CAP stops a system from being both consistent and available. The trade-off you pay every day is a different one, and CAP does not name it. That gap is what PACELC fills.

**It is per operation and per request.** The register in the proof is one key. A system can refuse writes to a key whose leader is unreachable while serving reads for other keys. It can serve stale reads on one endpoint and block on another. "Is Cassandra AP?" is answerable only with "at which consistency level, for which query?".

**Availability is binary in the theorem and continuous in reality.** A node that answers after 30 seconds is "available" to Gilbert and Lynch and down to your users. The moment you introduce a timeout, you have already picked: a CP system with a 1-second timeout returns errors during a partition; an AP system returns stale data. Both are decisions your product experiences.

## The partition, step by step

```viz
{"type": "system", "scenario": "quorum", "replicas": 3,
 "title": "A write during a partition", "caption": "With N=3 and W=2, the side of the partition holding two replicas can still commit; the side with one replica cannot reach a quorum and must either reject the write (C) or accept it locally and reconcile later (A)."}
```

Take three replicas and a quorum of two. A partition isolates one replica from the other two. The majority side keeps a quorum, so it can keep accepting linearizable reads and writes. The minority side cannot. A CP design makes the minority replica return errors (or redirect); every client that can reach the majority is served, and clients that can only reach the minority are not. An AP design lets the minority replica accept writes locally and answer reads from its own state; those writes are reconciled when the partition heals, which requires a conflict-resolution rule.

Note that the CP system is not "unavailable". It is unavailable *for clients stuck on the minority side*. If your partitions split a data centre from the rest of the world, that may be one region's users for a few minutes. If they split a single rack, it may be nobody, because the load balancer routes around it. Quantify which partitions you actually expect before you decide what to give up.

## PACELC: the trade-off you pay every day

Daniel Abadi's extension: **if** there is a **P**artition, choose **A**vailability or **C**onsistency; **E**lse, choose **L**atency or **C**onsistency. The "else" branch is the one that costs you in production every second of every day.

The mechanism behind EL vs EC is replication: a write that waits for acknowledgement from a quorum of replicas before returning is consistent and slow; a write that returns after one replica and propagates asynchronously is fast and allows stale reads. The number attached is the round trip to the second-fastest replica.

| Deployment | Consistent write latency (wait for quorum) | Latency-first write (local ack) |
|---|---|---|
| Three replicas in one availability zone | ~1 ms (0.5 ms RTT plus fsync) | ~0.5 ms |
| Three availability zones in one region | 1 to 3 ms | ~0.5 ms |
| Three regions (US-East, US-West, EU) | 60 to 80 ms (second-fastest cross-region RTT) | ~0.5 ms |

A cross-region EC system costs roughly 100 times the latency of an EL one on every write. That is why multi-region databases that are strongly consistent (Spanner, CockroachDB in multi-region mode) either accept ~100 ms commits or use placement rules that keep a row's quorum in the region that mostly writes it.

Classifying systems by their defaults:

| System | During a partition | Normal operation | Note |
|---|---|---|---|
| DynamoDB (default reads) | PA | EL | Strongly consistent reads make it EC per read |
| Cassandra (`ONE`/`LOCAL_QUORUM`) | PA | EL | `EACH_QUORUM` cross-DC pushes it toward EC at a large latency cost |
| Riak, Dynamo-style stores | PA | EL | Conflict resolution via vector clocks or CRDTs |
| MongoDB (primary reads, majority write concern) | PC | EC | Reads from secondaries are EL |
| Single-leader Postgres/MySQL with sync replica | PC | EC | Async replica reads move reads to EL |
| Spanner, CockroachDB | PC | EC | TrueTime / HLC keep EC latency bounded by regional placement |
| etcd, ZooKeeper | PC | EC | Minority side refuses writes; ZK reads are EL unless `sync()` |
| Cosmos DB | tunable | tunable | Five named consistency levels, per request |

The table's real lesson is the tunable rows. Modern systems expose the choice per request, so "what database" is the wrong level to decide at.

## Choose per operation

The method: list the operations, and for each ask two questions. What does the user see if this returns stale data? What does the user see if this returns an error for the duration of a partition, say two minutes? Then pick the cheaper failure.

### A shopping cart

| Operation | Stale answer costs | Error for 2 minutes costs | Choice |
|---|---|---|---|
| Add to cart | Nothing; the item shows up on the next sync | A lost sale on a large share of sessions | PA/EL: accept locally, merge later |
| View cart | An item appears missing briefly | Cart page down | PA/EL |
| Apply coupon | Coupon applied twice across replicas | User waits or retries | PC/EC on the coupon counter |
| Checkout: reserve inventory | Oversold item | User retries checkout | PC/EC with a conditional write on the leader |

Amazon's original Dynamo paper made exactly this call for the cart: never refuse an add, and merge concurrent cart versions by union, accepting that a deleted item might occasionally reappear. That is a product decision expressed as a consistency choice.

### A bank ledger

Balance display: PA/EL is acceptable if the display says "as of 10:32". Transfer: PC/EC; a transfer that cannot reach the ledger's leader must fail, because a stale balance can be overdrawn twice. The ledger's leader lives in one region; a partition isolating that region makes transfers fail there for its duration, and the design says so explicitly with an error the app can show.

### A social feed

Post: accept locally (PA/EL) with read-your-writes for the author. Feed read: PA/EL. Like counter: PA/EL with a CRDT-style counter so that concurrent increments on both sides of a partition sum correctly on heal ([CRDTs](/learn/system-design/distributed-systems/crdts-and-collaboration)). Account deletion: PC, because a partition must not let a deleted account keep posting.

```mermaid
flowchart TD
    Op["Operation"] --> Q1{"Is a stale or duplicated result harmful?"}
    Q1 -- "No" --> AP["PA/EL: local ack, async replicate, merge on heal"]
    Q1 -- "Yes" --> Q2{"Can the client wait or retry?"}
    Q2 -- "Yes" --> CP["PC/EC: quorum or leader, error on partition"]
    Q2 -- "No" --> Redesign["Redesign: reserve ahead, escrow, or make it idempotent and PA"]
```

The bottom-right box is the senior move. Some operations look like they need consistency and can be redesigned not to: ticket sales that hand each region a pre-allocated block of seats (escrow), rate limits that tolerate a few per cent overshoot, ID generation that pre-allocates ranges per node. Each removes a cross-region coordination point from the hot path.

## Multi-leader: the honest AP design

```viz
{"type": "system", "scenario": "replication-multi-leader", "nodes": 2,
 "title": "Two leaders accept writes to the same key", "caption": "Each region commits locally in under a millisecond and ships the write asynchronously. When the same key is written on both sides, the system needs a merge rule; last-writer-wins silently discards one of them."}
```

Choosing PA is only half a decision. The other half is the reconciliation rule for writes that happened on both sides of a partition. The options, from worst to best: last-writer-wins with wall-clock timestamps (drops data, and the clock skew decides which; see [Time and ordering](/learn/system-design/distributed-systems/time-and-ordering)); keep both versions as siblings and make the application merge (Riak, early Dynamo); use a data type whose merge is defined, a CRDT; or partition the key space so each key has exactly one home region and cross-region writes are forwarded, which is PA only for keys whose home is reachable. If you pick PA in an interview and cannot say which of these you use, the interviewer has found the gap.

## Failure modes

**Consistency for everything, availability for nothing.** A team declares the whole platform "CP" because payments need it. A cross-region link flaps for 90 seconds; product browsing, search and the cart all return errors, because they share the strongly consistent store. Revenue lost far exceeds anything a stale catalogue page could have cost. Detect: an outage review that finds unrelated features down together. Mitigate: classify operations; isolate the few PC operations in their own store or endpoint.

**Availability with no reconciliation path.** A team declares "AP" and configures last-writer-wins because it was the default. A partition lasts 20 minutes; both sides accept writes to user settings; on heal, half of one side's changes vanish, chosen by clock skew. Nobody notices for a week. Detect: count sibling or conflicting versions on heal, and alert when it is non-zero. Mitigate: choose a merge rule per data type before you choose AP.

**Assuming partitions are rare.** Full network splits are rare. Things that look identical to one node are not: a 15-second stop-the-world GC, a saturated NIC, an asymmetric routing failure where A can reach B but B cannot reach A. Detect: failure-detector false-positive rate from [Failure detection and leases](/learn/system-design/distributed-systems/failure-detection-and-leases). Mitigate: design the partition behaviour, then inject it in a game day.

**Timeouts that turn CP into "neither".** A CP store with a 30-second client timeout during a partition means every request holds a thread for 30 seconds. Thread pools fill; the callers of the callers time out; the outage spreads to services that never touched the partitioned store. Detect: thread-pool saturation on services upstream of the partition. Mitigate: fail fast with a short timeout and a circuit breaker; see [Resilience patterns](/learn/system-design/building-blocks/resilience-patterns).

## Interviewer follow-ups

**Q: "Is your design CP or AP?"**

Neither as a whole. During a partition, checkout and inventory reservation refuse rather than oversell: they are CP, served by a single-leader store with a conditional write. Browsing, cart edits and the feed keep serving from whatever replica is reachable: AP, with a merge rule I can name (cart is a union with tombstones; counters are CRDTs). In normal operation I take the latency side for reads and the consistency side for the two writes that matter, and I can put a number on it: a quorum write in-region is about 2 ms, cross-region about 70 ms, so the CP writes stay in-region by keeping their leader near the user.

**Q: "Which partitions do you expect, and how long do they last?"**

Intra-region partitions from a bad switch or a GC pause: seconds, frequent, handled by the load balancer and a failure detector with a few seconds of timeout. Cross-region partitions: minutes to an hour, a few times a year, and this is the case I design for. AZ-level partitions in between. My quorum placement follows that: three replicas in three AZs of one region give me a quorum through any single-AZ failure at ~2 ms; I add cross-region replicas for disaster recovery, not for the write quorum, unless the product requires surviving a regional loss with zero data loss, which is a much more expensive requirement I would confirm before assuming.

**Q: "Your write-heavy service is multi-region. How do you keep writes fast without losing data on a partition?"**

Give every key a home region chosen by the user's location, so writes commit with an in-region quorum in a few milliseconds and replicate asynchronously to other regions for reads. A partition that isolates a home region makes writes for those users fail or degrade rather than fork; their reads elsewhere serve slightly stale data. If the product cannot tolerate that failure, I make the affected write types mergeable (CRDT or append-only event with a merge) and accept that a rare conflict is resolved by a rule I can explain. What I would not do is turn on multi-leader last-writer-wins and call it availability.

**Q: "Why does DynamoDB charge double for strongly consistent reads?"**

Because an eventually consistent read can be served by any one replica, while a strongly consistent one must consult the leader or a quorum, doubling the replica work and adding a round trip. The price tells you the mechanism. It also tells you the design: use eventual reads for display and strongly consistent reads only before a conditional write, and remember that global secondary indexes cannot do strongly consistent reads at all.

**Q: "Can a system be CA?"**

Only if it never partitions, which means a single node, and a single node's availability is bounded by one machine. As soon as there are two nodes with a network between them, a partition is possible, and the system's behaviour during it is either C or A whether the designers chose it or not. When I hear "CA" I read it as "we have not decided", and I ask what happens when the replica cannot reach the primary.

## Senior signals

- You state that **P is not a choice** and that CAP constrains behaviour only **during** a partition, and you reach for PACELC to name the latency cost paid every day.
- You choose **per operation**, and you can list the two or three operations in a design that must be CP and why every other one is better off AP.
- You attach a **number** to each side: quorum latency in-region vs cross-region, expected partition duration, replication lag.
- When you choose AP you name the **merge rule** for concurrent writes, and you refuse last-writer-wins for anything users care about.
- You know that a **timeout** is where CP becomes an outage, and that a slow node is indistinguishable from a partitioned one.
- You look for ways to **remove coordination** from the hot path (escrow, pre-allocation, idempotent appends) instead of paying cross-region quorum on every write.

## Check yourself

```quiz
- q: >-
    A three-replica system with a quorum of two suffers a partition that isolates one replica. Under a CP design, which clients are affected?
  options: ["All clients, since the system refuses requests during any partition", "No clients, because a quorum of two still exists", "Only writing clients; reads continue everywhere", "Only clients that can reach just the isolated replica"]
  answer: 3
  explanation: >-
    The majority side still has a quorum and serves both reads and writes. The isolated minority replica cannot reach a quorum and refuses. CP does not mean global unavailability; it means the minority side stops answering. Reads on the minority side must also refuse or they could return stale data.
- q: >-
    Which statement about CAP is correct?
  options: ["CAP's consistency is the same property as the C in ACID", "A single-region system can be CA because partitions do not happen there", "The theorem only constrains behaviour while a partition is occurring", "Systems choose two of consistency, availability and partition tolerance"]
  answer: 2
  explanation: >-
    The proof is about a partition in progress; when the network is healthy nothing prevents a system being both consistent and available. Partitions happen in every multi-node deployment (including GC pauses that look like them), so P is not optional, and CAP's C is linearizability, not ACID's integrity constraints.
- q: >-
    A checkout service must not oversell inventory. During a cross-region partition, the correct behaviour under a deliberate CP choice is:
  options: ["Fail fast with a retryable error until the leader is reachable", "Switch the inventory store to last-writer-wins for the duration", "Accept locally and reconcile inventory once the partition heals", "Reserve against the local cache copy of the inventory count"]
  answer: 0
  explanation: >-
    Overselling is the harmful stale outcome, so this operation is CP: refuse rather than guess until the inventory leader is reachable, and refuse fast so threads are not held. Local accept, cache, or LWW all risk two regions reserving the same unit; reconciling after the heal means discovering the oversell after it happened.
- q: >-
    Why does a strongly consistent write in a three-region deployment cost roughly 100 times the latency of a local acknowledgement?
  options: ["It waits for a quorum, which needs a cross-region round trip", "It must fsync to disk three times, once in each region", "Each cross-region hop needs a fresh TLS handshake per write", "Cross-region links have far lower bandwidth than local ones"]
  answer: 0
  explanation: >-
    Quorum acknowledgement waits for the second-fastest replica; if that replica is in another region, the wait is a 60 to 80 ms RTT versus about 0.5 ms locally. Bandwidth, disk writes and TLS are unchanged; a small write is latency-bound, not bandwidth-bound.
- q: >-
    A team chooses AP for user settings with default last-writer-wins. What is the most likely production consequence after a 20-minute partition?
  options: ["Settings are unavailable on the minority side during the partition", "Nothing; LWW guarantees convergence to the truly newest value", "Some writes are silently discarded, with clock skew picking which", "Both sides' writes conflict on heal and the merge step deadlocks"]
  answer: 2
  explanation: >-
    LWW converges, but to the value with the highest timestamp, which under clock skew may be the older write. Data is lost without an error. AP requires choosing a merge rule that preserves both sides' intent (siblings, CRDTs, per-field merge). An AP design keeps both sides available, so unavailability is the CP outcome, not this one.
```
