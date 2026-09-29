---
slug: paxos-and-zab-intuition
title: "Paxos and ZAB: why consensus is hard and what ZooKeeper actually guarantees"
description: FLP stated correctly, single-decree Paxos traced acceptor by acceptor with two competing proposers (both orders), duelling proposers simulated with and without backoff, Multi-Paxos, Flexible Paxos quorums, and ZooKeeper's ZAB traced through a leader change with epochs, zxids and DIFF/TRUNC synchronisation, with the Multi-Paxos, Raft and ZAB differences side by side.
minutes: 30
difficulty: expert
tags: [system-design, distributed-systems, paxos, zab, zookeeper, consensus, flp]
---
Three servers must agree on one value: who the leader is, or what the next log entry is. Any of them may crash, messages may be delayed arbitrarily, and nobody has a reliable clock. "Vote and take the majority" sounds sufficient until you write down what happens when a server crashes mid-vote, when two servers each believe they have a majority because a message was delayed, or when a server that was slow rather than dead wakes up with a stale view and starts proposing.

Paxos, published by Leslie Lamport in a paper so odd that it took years to be taken seriously, was the first algorithm to get every one of those cases right; its core is two rounds of messages and one invariant. Raft ([consensus with Raft](/learn/system-design/distributed-systems/consensus-raft)) is best understood as Multi-Paxos with the leader and the log made mandatory; ZooKeeper's ZAB is the same family adapted to a primary-backup system. This lesson traces all three on concrete message schedules.

## Why it is hard

**FLP.** Fischer, Lynch and Paterson proved in 1985 that in an asynchronous system (no bound on message delay or processing time) no deterministic algorithm can guarantee to reach consensus if even one process may crash. The reason: a crashed process is indistinguishable from a slow one, so an algorithm that waits for it may wait forever, and one that proceeds without it may decide differently from what the slow process later decides. Practical algorithms escape by giving up guaranteed termination in pathological schedules and using timeouts and randomness to make those schedules rare. Paxos and Raft are **always safe** (never decide two values) and **live** (eventually decide) whenever the network behaves for long enough. Safety unconditionally, liveness under partial synchrony: that is the shape of every correct consensus protocol, and any design that promises both with no timing assumption is wrong.

**Majorities.** Two generals cannot agree over an unreliable messenger, because every acknowledgement needs an acknowledgement. Consensus among 2f + 1 nodes with at most f failures avoids that regress by never needing every node: each decision needs a majority, any two majorities share a node, and that shared node is the memory that carries a decision from one round to the next.

## Single-decree Paxos

Paxos decides one value. **Proposers** propose values; **acceptors** vote, and their collective state is the decision; **learners** find out what was chosen. In practice every node plays all three. Each proposal carries a unique, totally ordered number n (a counter with the proposer's id as tie-break).

- **Phase 1, prepare/promise.** The proposer sends `prepare(n)`. An acceptor that has not promised a number greater than or equal to n promises to ignore every proposal below n and replies with the highest-numbered proposal `(n_a, v_a)` it has already accepted, if any.
- **Phase 2, accept/accepted.** With promises from a majority, the proposer picks a value: if any promise reported an accepted proposal, it **must** use the value of the highest-numbered one; only if none did may it use its own. It sends `accept(n, v)`. An acceptor accepts unless it has promised a number greater than n. When a majority has accepted the same proposal n, v is **chosen**.

The invariant: **once a value is chosen, every higher-numbered proposal that reaches phase 2 carries the same value.** The chosen majority and any later proposer's promise majority overlap; the overlapping acceptor reports the chosen value (or a later proposal, which by induction carries the same value); the proposer adopts it. Promises close the remaining gap: an acceptor that promised n rejects an older accept that arrives late.

### Traced: two proposers, three acceptors

P wants X, Q wants Y. Each acceptor's state is (promised, accepted):

| Step | Message | A1 | A2 | A3 | Notes |
|---|---|---|---|---|---|
| 0 | | (0, –) | (0, –) | (0, –) | |
| 1 | P: prepare(1) to A1, A2 (A3's copy delayed) | (1, –) | (1, –) | (0, –) | P has a majority of promises, none reporting a value |
| 2 | P: accept(1, X) reaches A1 only | (1, 1:X) | (1, –) | (0, –) | X is not chosen: one acceptor of three |
| 3 | Q: prepare(2) to all | (2, 1:X) | (2, –) | (2, –) | A1's promise reports 1:X |
| 4 | P's delayed accept(1, X) reaches A2 | | rejected | | A2 promised 2 > 1 |
| 5 | Q picks a value | | | | The highest accepted proposal among its promises is 1:X, so Q must propose X |
| 6 | Q: accept(2, X) to all | (2, 2:X) | (2, 2:X) | (2, 2:X) | **X chosen** by proposal 2 |

Q never proposes Y. After step 2, X was *not* chosen, but Q cannot know whether some majority it did not hear from accepted X, so the rule makes it assume one might have. Now swap steps 2 and 3: Q's prepare(2) reaches A1 and A2 before P's accept. Every promise Q receives is empty, so Q proposes Y; P's accept(1, X) is rejected by acceptors that promised 2, and Y is chosen. Either order ends with exactly one value, which is all Paxos promises.

A crash does not change the outcome. If Q crashed after step 6 before telling anyone, a third proposer R running prepare(3) would reach at least one acceptor holding 2:X, adopt X, and re-establish the same decision. That is why acceptors must **fsync their promise and accepted proposal before replying**: an acceptor that forgets a promise after a restart can accept an older proposal and let two values be chosen.

### Duelling proposers, simulated

Two proposers can keep invalidating each other: P prepares 1, Q prepares 2 (P's accept will fail), P prepares 3 (Q's accept will fail), and so on. Safety holds throughout; progress does not, which is FLP appearing in practice. How bad is it? A simulation of three acceptors, 20,000 runs per row, each one-way message taking 0.25 RTT plus an exponential delay averaging 0.25 RTT, with a proposer abandoning its round on any rejection and retrying above the highest number it has seen:

| Proposers and retry policy | Median time to a chosen value | p99 | Worst run | Rounds started, p99 |
|---|---|---|---|---|
| One proposer (a stable leader) | 1.38 RTT | 2.18 RTT | 3.4 RTT | 1 |
| Two, retry immediately | 1.58 RTT | 5.43 RTT | 12.3 RTT | 7 |
| Two, random backoff 0–1 RTT | 1.40 RTT | 3.20 RTT | 6.0 RTT | 5 |
| Two, random backoff 0–3 RTT | 1.39 RTT | 2.67 RTT | 4.4 RTT | 4 |

Every run decided: with random message delays, duels end, and the damage shows up as tail latency, 2.5 times worse at p99 with immediate retries. Randomised backoff recovers most of it, and a single distinguished proposer removes it. That is why every production Paxos elects a leader and forwards proposals to it: duels then happen only in the brief window when two nodes both believe they lead.

## Multi-Paxos, Flexible Paxos and the road to Raft

A log is a sequence of single-decree instances, one per slot. Running both phases per entry costs two round trips. **Multi-Paxos** runs phase 1 once, for "every slot from here on", and then only phase 2 per entry: one round trip, the same as Raft's `AppendEntries`. The stable proposer is a leader, its phase 1 is a leader election, accepted values are log entries, and a majority of accepts is a commit. The part implementers got wrong was the leader change: the new leader must, for every slot that any acceptor reports as accepted, re-propose the highest-numbered value, and fill holes with no-ops, before serving new commands. Google's "Paxos Made Live" (2007) describes how much engineering building Chubby on it took.

**Flexible Paxos** (Howard, Malkhi and Spiegelman, 2016) observed that the proof needs only every phase-1 quorum to intersect every phase-2 quorum, not majorities for both: |Q1| + |Q2| > N. With N = 5 you can commit with any 2 acceptors (Q2 = 2) if leader changes need 4 (Q1 = 4). Steady-state writes wait for the fastest one follower instead of two; leader changes need four of five alive. It is the quorum-overlap argument from [replication strategies](/learn/system-design/distributed-systems/replication-strategies) applied to the two phases separately.

```viz
{"type": "system", "scenario": "quorum", "replicas": 3,
 "title": "Majorities overlap", "caption": "Any two majorities of three acceptors share at least one. That shared acceptor is how a later proposer learns what an earlier majority already accepted; it is the entire reason Paxos can survive proposer crashes."}
```

**Learning and reading.** A value is chosen at the moment a majority accepts it, but nobody knows that until the `accepted` messages are counted. Acceptors can send them to every learner (acceptors × learners messages) or to one distinguished learner, usually the leader, which then tells the others; in Multi-Paxos the leader piggybacks "slots up to k are chosen" on its next accept, exactly as Raft piggybacks `commitIndex`. Reads face the problem Raft's ReadIndex solves: a leader that has been replaced does not know it. Spanner gives each Paxos leader a **lease**, 10 seconds by default according to the Spanner paper, during which the other replicas promise not to elect anyone else, so the leader can serve reads locally; the lease is renewed on every successful write, and TrueTime's bounded clock error is what makes "the lease has not expired" a safe judgement.

```viz
{"type": "system", "scenario": "raft-election", "nodes": 3,
 "title": "A leader election is a Paxos phase 1", "caption": "Raft's RequestVote is Multi-Paxos's prepare for all future slots: the winner may then skip phase 1 and run only accepts. Raft adds the restriction that the winner's log must already be at least as complete as a majority's, which is what lets it avoid per-slot reconciliation."}
```

## ZooKeeper's ZAB

ZooKeeper is a replicated, in-memory tree of small nodes (znodes) used for configuration, locks, leader election and group membership by HBase, Hadoop, Solr and, until KRaft, Kafka. Its protocol, ZooKeeper Atomic Broadcast, is in the Paxos family but built for **primary-backup**: one primary executes each write, turns it into an idempotent state change, and broadcasts the changes in the order it produced them.

Every transaction gets a **zxid**: 64 bits, the high 32 the epoch (incremented on each new leader), the low 32 a counter within the epoch; written below as epoch:counter. Writes go to the leader, which sends `PROPOSAL`; followers append it to their transaction log, fsync and `ACK`; on a quorum of acks the leader sends `COMMIT`, and servers apply in zxid order. ZAB runs in phases: **election** (fast leader election votes for the server with the highest (last epoch, last zxid, server id)); **discovery** (the prospective leader learns its followers' epochs and establishes a new epoch above them); **synchronisation** (it brings a quorum up to its own history before accepting anything new); **broadcast**.

### A leader change traced

Five servers, Z1 leader in epoch 1, everything up to 1:4 committed. Z1 proposes 1:5, which reaches Z2 before Z1 crashes; Z1 had also logged 1:6 locally without sending it.

| Step | Z1 | Z2 | Z3, Z4, Z5 | What happens |
|---|---|---|---|---|
| 1 | 1:1–1:6, crashed | 1:1–1:5 | 1:1–1:4 | 1:5 was acknowledged by two of five: not committed |
| 2 | | votes for itself | vote for Z2 | Z2's last zxid 1:5 is the highest among the four live servers |
| 3 | | leader, epoch 2 | accept epoch 2 | Discovery: no follower has an epoch above 1 |
| 4 | | sends DIFF 1:5 | log 1:5, ack NEWLEADER | Synchronisation: a quorum now holds 1:5, so it is committed as part of the new leader's history |
| 5 | | proposes 2:1, 2:2 | apply in order | Broadcast resumes with the new epoch's counter at 1 |
| 6 | restarts, rejoins | sends TRUNC to 1:5, then DIFF 2:1–2:2 | | Z1 discards 1:6, which no other server ever saw |

1:5, never acknowledged to its client, survives because the new leader had it; 1:6 disappears because no quorum member did. The two guarantees this implements are **primary order** (if a primary broadcasts a before b, every server delivers a before b, and a new primary never delivers an old primary's leftovers after its own) and **prefix recovery** (a new leader's history contains everything any earlier leader committed). Together they give each client session FIFO order for its writes. Followers too far behind for a DIFF receive a **SNAP**, a full snapshot.

| | Multi-Paxos | Raft | ZAB |
|---|---|---|---|
| Order key | Slot number | (term, index) | zxid = (epoch, counter) |
| Leader | An optimisation; any node may propose | Mandatory; only a log-complete node wins | Mandatory primary with the highest zxid |
| Log shape | May have holes, filled with no-ops | Contiguous; followers repaired by probing | Contiguous; followers synced by DIFF, TRUNC or SNAP |
| Leader change | Re-propose highest accepted value per slot | Election restriction, then a no-op in the new term | Discovery and synchronisation before any new proposal |
| Commit signal | Learners told | commitIndex piggybacked on appends | Explicit `COMMIT` |
| Reads | Leader leases (Spanner) | ReadIndex or lease on the leader | Local on any server; `sync()` for freshness |
| Where | Chubby, Spanner | etcd, Consul, CockroachDB, TiKV, KRaft | ZooKeeper |

## Under the hood: what ZooKeeper clients actually get

**Reads are local.** Any server answers reads from memory without contacting the leader, so read throughput grows with servers and reads take microseconds, while every write involves every voter, so write throughput falls as servers are added (the shape of the benchmarks in the 2010 ZooKeeper paper). Reads are **not linearizable**: a follower can lag the leader. Clients get sequential consistency, a view that is always a prefix of the true history and never moves backwards within a session, plus FIFO order for their own requests. `sync()` makes the client's server catch up with the leader before the next read, at the cost of a round trip through the leader. **Observers** are non-voting servers that receive commits and serve reads, adding read capacity (for example in a remote data centre) without enlarging the write quorum.

**Sessions and ephemeral znodes.** A client holds a session kept alive by heartbeats. The server grants a timeout between 2 and 20 ticks by default; with the sample configuration's `tickTime` of 2,000 ms, that is 4 to 40 seconds. When a session expires, its **ephemeral znodes** are deleted, which is how locks and memberships are released when a client dies, and also how they are lost when a live client stalls longer than the timeout, the failure that [distributed locks and coordination](/learn/system-design/distributed-systems/distributed-locks-and-coordination) turns on. Watches are one-shot notifications (persistent, recursive watches were added in 3.6), delivered in order and before any read that would reveal the change.

**Limits.** The whole dataset lives in memory on every server, znodes hold at most about 1 MB (`jute.maxbuffer`), and each server writes a snapshot after a randomly chosen 50,001 to 100,000 transactions (`snapCount` defaults to 100,000; the randomisation stops the whole ensemble snapshotting at once). A write costs a quorum round trip plus an fsync of the transaction log on the leader and the acking followers, a few milliseconds in-region. ZooKeeper holds coordination state, not data.

## Where they live

| System | Protocol | Role |
|---|---|---|
| Chubby (Google) | Multi-Paxos | Lock and name service; the template for ZooKeeper |
| Spanner | Multi-Paxos per shard with leader leases | Replicated storage under a globally consistent database |
| ZooKeeper | ZAB | Coordination for HBase, Hadoop, Solr, Kafka before KRaft |
| etcd, Consul | Raft | Kubernetes' store, service discovery, locks |
| CockroachDB, TiKV | Raft per range or region | Storage for distributed SQL |
| Kafka (KRaft) | Pull-based Raft variant | Kafka's own metadata, replacing ZooKeeper |

One leader serialises one log, so a group tops out at its leader's disk and network; batching amortises fsync; scaling means many groups with different leaders.

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Duelling proposers | Proposal numbers climb, decisions stall, tail latency multiplies | Several nodes act as proposer at once; no stable leader | Elect a distinguished proposer; randomised backoff on rejection |
| Acceptor forgets a promise | Two different values chosen for one slot, found by a checker or a divergent replica | Promise or accept acknowledged before fsync; a disk cache that lies | fsync before every reply; never run consensus on unsafe disks |
| Slow disk in the quorum | Write latency tracks one node; in ZooKeeper, followers fall past `syncLimit` and are dropped | Per-node fsync latency; ZooKeeper's latency metrics per server | Dedicated disk for the transaction log; homogeneous hardware |
| Session expiry unnoticed by the holder | Two clients act on the same lock after a long GC pause | Ephemeral lock znode deleted during the pause; downstream sees writes from both | Fencing tokens (the lock znode's zxid or version) checked by the resource; treat session expiry as fatal |
| ZooKeeper reads assumed fresh | "I wrote it, they cannot see it" between two clients | Reads served by a lagging follower | `sync()` before reads that must be fresh, or design around watches |
| Hand-rolled Multi-Paxos leader change | Holes or conflicting values after failover | New leader did not re-propose accepted values per slot | Use a proven implementation; model-check changes |

## Interviewer follow-ups

**"Explain Paxos's safety in one breath."** Model answer: a value is chosen when a majority accepts one proposal; any later proposer needs promises from a majority, which overlaps it, so some acceptor reports the value, and the proposer must adopt the highest-numbered accepted value it sees; promises block older proposals from sneaking in. Common wrong answer: "the highest proposal number wins," which is exactly what the rule forbids when an earlier value may be chosen.

**"If Paxos and Raft are equivalent, why did everyone switch to Raft?"** Model answer: same fault tolerance and steady-state cost, but Raft specifies the whole system (contiguous log, log-complete leader so no per-slot reconciliation, membership, snapshots, client sessions), while Multi-Paxos leaves it to implementers. Common wrong answer: "Raft is faster."

**"Are ZooKeeper reads linearizable?"** Model answer: no; any server answers from local memory, giving sequential consistency and per-session FIFO; writes are linearizable through the leader; `sync()` then read gives a fresh view at the cost of a leader round trip. Common wrong answer: "yes, ZooKeeper is CP."

**"You hold a ZooKeeper lock and your JVM pauses for 40 seconds. What happens?"** Model answer: the session expires at the server (the timeout is at most 40 s by default), the ephemeral znode is deleted, the next waiter takes the lock, and on resuming my process may write before noticing; the protected resource must check a fencing token and the client must treat expiry as fatal. Common wrong answer: "the lock is held until I release it."

**"What does FLP prevent you from building?"** Model answer: a deterministic protocol guaranteed to terminate in a fully asynchronous system with one crash; it does not prevent protocols that are always safe and terminate once the network behaves, which is what Paxos and Raft are. Common wrong answer: "consensus is impossible."

## What mid-level engineers get wrong

- **Letting a proposer with a higher number use its own value.** Consequence: a chosen value is overwritten, the one thing Paxos exists to prevent.
- **Acknowledging promises before fsync.** Consequence: a restart lets an acceptor contradict itself, and two values are chosen.
- **Running several proposers without a leader.** Consequence: throughput collapses into duels, visible as p99 latency several times the median.
- **Reading from ZooKeeper followers as if they were the leader.** Consequence: stale configuration or lock state read right after another client's write.
- **Setting a ZooKeeper session timeout below the worst GC pause.** Consequence: ephemeral locks and memberships vanish from live clients.
- **Storing data in ZooKeeper.** Consequence: every server holds it all in memory, znodes hit the 1 MB limit, and snapshots slow down every recovery.

## Exercise

```exercise
id: paxos-acceptors
title: Run single-decree Paxos on a message schedule
prompt: |
  Simulate single-decree Paxos with `n_acceptors` acceptors (indexed from 0).
  `values` maps each proposer to the value it would like. Each acceptor
  starts with promised = 0 and no accepted proposal. Process `schedule` in
  order; every step is `[kind, proposer, n, targets]` and is delivered
  instantly to the listed acceptors:

  - `"prepare"`: each target with n > promised sets promised = n and gives the
    proposer a promise reporting its accepted proposal (number and value, or
    none). Targets with promised >= n ignore it.
  - `"accept"`: only if the proposer holds promises for number n from a
    majority of acceptors (otherwise skip the step). The value is the one from
    the highest-numbered accepted proposal among those promises, or the
    proposer's own value if none reported one. Each target with
    n >= promised sets promised = n and accepted = (n, value).

  A value is chosen the first time a majority of acceptors have accepted the
  same proposal number. Return `{"chosen": value or null, "acceptors": [...]}`
  where each acceptor is `[promised, accepted_number, accepted_value]`, using
  0 and null when it has accepted nothing.
languages: [python, javascript]
entry: paxos
starter:
  python: |
    def paxos(n_acceptors, values, schedule):
        promised = [0] * n_acceptors
        accepted = [[0, None] for _ in range(n_acceptors)]
        chosen = None
        return {"chosen": chosen, "acceptors": [[promised[a]] + accepted[a] for a in range(n_acceptors)]}
  javascript: |
    function paxos(n_acceptors, values, schedule) {
      const promised = new Array(n_acceptors).fill(0);
      const accepted = Array.from({ length: n_acceptors }, () => [0, null]);
      let chosen = null;
      return { chosen, acceptors: accepted.map((x, a) => [promised[a], x[0], x[1]]) };
    }
tests:
  - args: [3, {"P": "X", "Q": "Y"}, [["prepare", "P", 1, [0, 1]], ["accept", "P", 1, [0]], ["prepare", "Q", 2, [0, 1, 2]], ["accept", "P", 1, [1]], ["accept", "Q", 2, [0, 1, 2]]]]
    expected: {"chosen": "X", "acceptors": [[2, 2, "X"], [2, 2, "X"], [2, 2, "X"]]}
    label: the lesson's trace, Q must adopt X
  - args: [3, {"P": "X", "Q": "Y"}, [["prepare", "P", 1, [0, 1]], ["prepare", "Q", 2, [0, 1, 2]], ["accept", "P", 1, [0, 1]], ["accept", "Q", 2, [0, 1, 2]]]]
    expected: {"chosen": "Y", "acceptors": [[2, 2, "Y"], [2, 2, "Y"], [2, 2, "Y"]]}
    label: Q's prepare wins the race, so Y is chosen
  - args: [3, {"P": "X", "Q": "Y"}, [["prepare", "P", 1, [0]], ["accept", "P", 1, [0, 1, 2]]]]
    expected: {"chosen": null, "acceptors": [[1, 0, null], [0, 0, null], [0, 0, null]]}
    label: no majority of promises, no accept
  - args: [3, {"P": "X", "Q": "Y"}, [["prepare", "P", 1, [0, 1]], ["prepare", "Q", 2, [1, 2]], ["accept", "P", 1, [0, 1]], ["prepare", "P", 3, [0, 1]], ["accept", "Q", 2, [1, 2]], ["prepare", "Q", 4, [1, 2]], ["accept", "P", 3, [0, 1]]]]
    expected: {"chosen": null, "acceptors": [[3, 3, "X"], [4, 0, null], [4, 2, "Y"]]}
    label: duelling proposers choose nothing
  - args: [3, {"P": "X", "Q": "Y"}, [["prepare", "P", 1, [0, 1, 2]], ["accept", "P", 1, [0, 1]], ["prepare", "Q", 5, [1, 2]], ["accept", "Q", 5, [2]]]]
    expected: {"chosen": "X", "acceptors": [[1, 1, "X"], [5, 1, "X"], [5, 5, "X"]]}
    hidden: true
    label: a chosen value survives a higher proposal
  - args: [5, {"P": "X", "Q": "Y"}, [["prepare", "P", 1, [0, 1, 2]], ["accept", "P", 1, [0]], ["prepare", "Q", 2, [2, 3, 4]], ["accept", "Q", 2, [2, 3, 4]], ["prepare", "P", 3, [0, 1, 2]], ["accept", "P", 3, [0, 1, 2]]]]
    expected: {"chosen": "Y", "acceptors": [[3, 3, "Y"], [3, 3, "Y"], [3, 3, "Y"], [2, 2, "Y"], [2, 2, "Y"]]}
    hidden: true
    label: the highest-numbered accepted value beats an older one
hints:
  - "Store the promises each proposer collects per proposal number: (proposer, n) -> list of reported accepted proposals."
  - "When several promises report accepted proposals, use the value of the one with the largest number, not the most common value."
  - "Check for a chosen value after every accept step by counting acceptors whose accepted number equals n."
```

## Senior signals

- You state FLP correctly and explain how real protocols keep safety unconditional and buy liveness with timeouts, randomness and a stable leader.
- You can run single-decree Paxos by hand in both message orders, and say why the second proposer must adopt the first's value.
- You quantify duelling proposers as a tail-latency problem and know why production Paxos always elects a leader.
- You describe Multi-Paxos, the per-slot reconciliation Raft's election restriction removes, and Flexible Paxos's Q1 + Q2 > N.
- You can trace a ZAB leader change with epochs, zxids and DIFF/TRUNC, and you know ZooKeeper reads are local and not linearizable without `sync()`.
- You tie session expiry and ephemeral znodes to fencing tokens, and treat fsync of promises as the non-negotiable cost of consensus.

## Check yourself

```quiz
- q: >-
    A Paxos proposer holds promises from a majority for proposal 7. One promise reports accepted (3, X), another reports accepted (5, Z). The proposer wants Y. What must it propose?
  options: ["Z, from the highest-numbered accepted proposal reported", "Y, because its number 7 beats both reported proposals", "Nothing, until it finds out which value was chosen", "X, because it was the first value that any acceptor accepted"]
  answer: 0
  explanation: >-
    The rule is to adopt the value of the highest-numbered accepted proposal among the promises: if any value could have been chosen, it is carried by the latest such proposal. Its own number only entitles it to run phase 2. The proposer never needs to know whether a value was chosen; the rule preserves it either way.
- q: >-
    P's accept(1, X) reaches one acceptor of three, then Q's prepare(2) reaches all three. Why can Q not propose its own value Y?
  options: ["Its proposal number 2 is too small to override a proposal of 1", "X has already been chosen by a majority of acceptors", "One of its promises reports 1:X, which may have been chosen", "Acceptors refuse to promise anything once they accept X"]
  answer: 2
  explanation: >-
    X was on only one acceptor, so it was not chosen, but Q cannot distinguish that from a majority it did not hear from, so the rule makes it adopt X. Acceptors still promise higher numbers after accepting. Had Q's prepare arrived before P's accept, its promises would be empty and Y could be chosen.
- q: >-
    In the simulation, two proposers retrying immediately still always reached a decision. What did duelling cost?
  options: ["Nothing measurable compared with a single proposer", "Tail latency: p99 about 2.5 times the single proposer", "A higher median but an unchanged tail latency", "Safety: a few runs chose two different values"]
  answer: 1
  explanation: >-
    With random message delays duels end, but runs that collide need several rounds: p99 was 5.4 RTT against 2.2 RTT with one proposer, and random backoff brought it back to about 2.7. Safety is never at risk from duels, which is why the remedy is a stable leader rather than a stronger check.
- q: >-
    A ZooKeeper leader proposed zxid 1:5 to one follower of five and crashed. That follower becomes the new leader. What happens to 1:5?
  options: ["It is committed when the new leader syncs a quorum", "It is re-proposed with a new epoch-2 zxid instead", "It waits until the old leader restarts and commits it", "It is discarded, because it never reached a quorum"]
  answer: 0
  explanation: >-
    Synchronisation brings a quorum up to the new leader's history before any new proposal, so 1:5 becomes committed with its original zxid. Entries only the old leader held, like 1:6 in the lesson's trace, are truncated when it rejoins. A client whose request timed out may therefore find that its write took effect.
- q: >-
    A ZooKeeper client reads a znode from a follower immediately after another client's write was acknowledged by the leader. What may it see?
  options: ["Always the new value, since the write was acknowledged", "An error until the follower has applied the write", "Possibly the old value, unless it calls sync() first", "A torn mix of the old and the new znode values"]
  answer: 2
  explanation: >-
    Followers answer reads from local memory and may lag, so clients get sequential consistency (a growing prefix of history) rather than linearizable reads. A quorum acknowledgement does not mean every server has applied the write. sync() makes the follower catch up with the leader before the read, at the cost of a round trip.
- q: >-
    With Flexible Paxos on five acceptors, commits use any 2 acceptors. How many must a leader change reach?
  options: ["2, the same number as the commit quorum", "3, a plain majority of the five acceptors", "4, so the two quorums always intersect", "5, every acceptor, to be certain of safety"]
  answer: 2
  explanation: >-
    Safety only requires every phase-1 quorum to intersect every phase-2 quorum: Q1 + Q2 > N, so Q1 must be at least 4 when Q2 is 2. Steady-state commits get faster, and leader changes need four of five alive. A majority of 3 could miss both acceptors that accepted a committed value.
```
