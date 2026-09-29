---
slug: gossip-and-anti-entropy
title: "Gossip and anti-entropy: membership by rumour, SWIM, and Merkle-tree repair"
description: Epidemic dissemination simulated (push, pull and push-pull at fanout 1–3 for 10 to 10,000 nodes, against log₂N + ln N); SWIM traced on five nodes with suspicion and incarnation refutation; Lifeguard in memberlist, Serf and Consul; Cassandra's gossiper and phi threshold; a Merkle-tree comparison traced hash by hash; Cassandra repair, overstreaming arithmetic and resurrected deletes; and where gossip is the wrong tool.
minutes: 35
difficulty: hard
tags: [system-design, distributed-systems, gossip, swim, anti-entropy, merkle-tree, membership]
---
A thousand nodes need to know which of them are alive, which owns which token range, and what the schema version is. A central registry that every node polls becomes the busiest and most fragile component in the system: a thousand nodes polling every second is a thousand requests a second on one box, and when it is down nobody learns anything. Having every node tell every other node directly is N² messages, a million per round. Both designs also give information one place where it can stop spreading: the registry, or the network path to one node.

Gossip takes a third path: each node periodically exchanges what it knows with a few random peers, and they do the same. Information spreads like an epidemic, reaching everyone in a logarithmic number of rounds with constant load per node and no coordinator, and it survives any single node or link failing because the next round picks different peers. Applied to membership it becomes SWIM; applied to replicated data it becomes anti-entropy, with Merkle trees making the comparison cheap. This lesson simulates the convergence, traces SWIM on five nodes and a Merkle comparison hash by hash, and opens up memberlist and Cassandra.

## Epidemic spreading: push, pull and push-pull

Every T seconds each node picks k random peers (the **fanout**) and exchanges state with them.

- **Push**: the node sends what it knows. The number of informed nodes roughly doubles per round at first, but the finish is slow: near the end almost every push lands on a node that already knows, and the last few stragglers wait on luck, like collecting the last coupons of a set.
- **Pull**: the node asks what its peers know. Early on it grows like push, but it finishes fast: an uninformed node stays uninformed only if the peer it asked is also uninformed, so the uninformed fraction squares every round (10% → 1% → 0.01%).
- **Push-pull**: both halves in one exchange, and the standard choice.

What is spread divides protocols in two. **Rumour mongering** spreads a specific new update and retires it after a bounded number of transmissions, so each update costs a bounded number of messages, and a rare node can miss it. **Anti-entropy** periodically exchanges full state (or a digest of it), so any difference, however old, is eventually repaired; it never stops, and it is the safety net under rumour mongering.

Bandwidth decides which one you can afford. With 200 nodes, a 1-second interval, fanout 3 and 2 KB of state per node sent whole in both directions, each node sends 3 × 2 × 2 KB = 12 KB/s and receives about as much: 5 MB/s cluster-wide, which is nothing. At 5,000 nodes carrying 100 KB each it is 600 KB/s per node and 3 GB/s cluster-wide. Real implementations therefore gossip **digests** (node id plus version per entry) and fetch only the entries whose version is newer, so steady-state traffic follows the change rate, not the state size.

```viz
{"type": "system", "scenario": "gossip", "nodes": 8,
 "title": "Push-pull gossip with fanout 3", "caption": "One node learns a fact. Each round, every node exchanges with three random peers. Watch the count of informed nodes multiply per round until it saturates; the last few nodes are reached by pull, not push."}
```

## Convergence, simulated

The textbook says "O(log N) rounds". The constants matter, so this program measures them: synchronous rounds, one node initially informed, each node contacting k peers chosen uniformly from the other N − 1, no message loss or failures, 200 trials per cell with the seeds shown.

```python
import math
import random
import statistics


def rounds_to_full(n, k, mode, rnd):
    """Synchronous rounds until all n nodes know a fact that node 0 starts with."""
    informed = bytearray(n)
    informed[0] = 1
    count, rounds = 1, 0
    while count < n:
        rounds += 1
        start = bytes(informed)                  # decisions use start-of-round state
        for i in range(n):
            if mode == "pull" and start[i]:
                continue                         # pull: only the uninformed ask
            if mode == "push" and not start[i]:
                continue                         # push: only the informed send
            for _ in range(k):
                t = int(rnd.random() * (n - 1))
                t += t >= i                      # uniform over the other n - 1 nodes
                if start[i] and mode != "pull" and not informed[t]:
                    informed[t] = 1              # push half of the exchange
                    count += 1
                elif start[t] and mode != "push" and not informed[i]:
                    informed[i] = 1              # pull half of the exchange
                    count += 1
                    if mode == "pull":
                        break                    # a pulling node stops once it has the fact
    return rounds


for mode in ("push", "pull", "push-pull"):
    for k in (1, 2, 3):
        cells = []
        for n in (10, 100, 1000, 10000):
            rnd = random.Random(20260928 + 1000 * k + n)
            rs = sorted(rounds_to_full(n, k, mode, rnd) for _ in range(200))
            cells.append(f"{statistics.mean(rs):.1f}/{rs[math.ceil(0.99 * len(rs)) - 1]}")
        print(f"{mode:9} k={k}  " + "  ".join(cells))
```

Simulated rounds to full dissemination, mean / p99 over 200 trials (about 30 seconds of CPU for the whole table):

| Mode, fanout | N = 10 | N = 100 | N = 1,000 | N = 10,000 |
|---|---|---|---|---|
| Push, k = 1 | 6.1 / 10 | 12.2 / 16 | 18.1 / 22 | 23.7 / 28 |
| Push, k = 2 | 3.7 / 5 | 7.4 / 9 | 10.7 / 13 | 13.9 / 16 |
| Push, k = 3 | 3.0 / 4 | 5.7 / 7 | 8.2 / 9 | 10.6 / 12 |
| Pull, k = 1 | 4.8 / 9 | 9.7 / 14 | 13.8 / 17 | 17.4 / 21 |
| Pull, k = 3 | 2.7 / 4 | 5.1 / 7 | 7.1 / 8 | 8.9 / 10 |
| Push-pull, k = 1 | 3.5 / 5 | 6.6 / 8 | 9.1 / 10 | 11.6 / 13 |
| Push-pull, k = 2 | 2.5 / 3 | 4.5 / 5 | 6.1 / 7 | 8.0 / 8 |
| Push-pull, k = 3 | 2.1 / 3 | 3.9 / 4 | 5.1 / 6 | 6.7 / 7 |
| log₂N + ln N | 5.6 | 11.2 | 16.9 | 22.5 |

What the numbers say:

- **Push at fanout 1 sits about one round above log₂N + ln N at every size.** That is Pittel's 1987 result for push rumour spreading: log₂N rounds of doubling, then ln N rounds collecting stragglers. Quoting "log N" without the ln N tail underestimates it by 40% at 10,000 nodes.
- **Pull's squaring finish** saves about 6 rounds at 10,000 nodes; **push-pull** halves push, and at fanout 3 covers 1,000 nodes in about 5 rounds and 10,000 in under 7. Each tenfold growth adds 1.5 to 2.5 rounds.
- **Tails are tight at scale**: from 1,000 nodes up, p99 is within 1 to 4 rounds of the mean.
- **Fanout has diminishing returns**: push-pull from k = 2 to k = 3 saves about one round at 10,000 nodes for 50% more messages.

Translated: Cassandra's gossiper is push-pull with about one peer per second, so a change reaches 1,000 nodes in roughly 9 to 10 seconds. memberlist pushes updates to 3 members every 200 ms, so push at k = 3 reaches 1,000 nodes in about 8 rounds, under 2 seconds. The model ignores loss, failures and unsynchronised timers: treat it as the shape, not a latency guarantee.

## SWIM, traced on five nodes

Heartbeating everyone to everyone is N² traffic. SWIM (Das, Gupta and Motivala, 2002) makes detection and dissemination constant per node. Each **protocol period** a member pings one member; if no ack arrives within the timeout it asks k others to **ping-req** the target, so a single bad link cannot condemn it; if none succeeds, it marks the target **suspect** rather than dead. Updates ride **piggybacked** on pings and acks. Every member carries an **incarnation number** that only the member itself increments, and only to refute a suspicion; updates about member M are ordered by these rules:

| Incoming update | Replaces the local entry for M when |
|---|---|
| Alive(M, i) | Local entry is Suspect(M, j) or Alive(M, j) with i > j |
| Suspect(M, i) | Local entry is Suspect(M, j) with i > j, or Alive(M, j) with i ≥ j |
| Dead(M, i) | Always |

Nodes A to E, period 1 s, ping timeout 500 ms, k = 3, suspicion timeout 4 s. E stops responding at t = 0:

| t (s) | Event | A's entry for E | B, C, D's entry for E | E |
|---|---|---|---|---|
| 0.0 | A's probe target this period is E; A pings E | Alive/0 | Alive/0 | Unresponsive |
| 0.5 | No ack within 500 ms; A sends ping-req(E) to B, C, D | Alive/0 | Alive/0 | – |
| 0.5–1.0 | B, C and D each ping E; no acks | Alive/0 | Alive/0 | – |
| 1.0 | Period ends: A records Suspect(E, 0), starts a 4 s timer, queues the update | Suspect/0 | Alive/0 | – |
| 1.0–2.0 | The update rides on A's pings and acks, then on B, C and D's | Suspect/0 | Suspect/0, own timers start | – |
| **Branch 1** | E was in a 2.5 s GC pause | | | |
| 2.6 | E resumes; C's ping to E carries Suspect(E, 0) | Suspect/0 | Suspect/0 | Increments to 1 |
| 2.6 | E acks with Alive(E, 1) piggybacked | Suspect/0 | C: Alive/1 | Alive/1 |
| ≈ 3.5 | Alive(E, 1) reaches everyone; i = 1 > j = 0 replaces the suspicion | Alive/1 | Alive/1 | Alive/1 |
| **Branch 2** | E crashed | | | |
| 5.0 | A's timer fires; A records Dead(E, 0) and gossips it | Dead | Dead within about a round | – |

The indirect probe removes the false positive from a bad A–E link; suspicion plus incarnation removes the false positive from a pause shorter than the timeout. Load stays constant: one ping per period per member, and ping-reqs only after a miss. Detection is fast without anyone watching E specifically: each of the N − 1 others probes one random member per period, so the chance that nobody probes E is (1 − 1/(N−1))^(N−1) ≈ 1/e, and the expected wait for a first probe is e/(e − 1) ≈ 1.6 periods in a large cluster. Implementations such as memberlist walk a shuffled round-robin list instead of picking at random, which bounds the worst case.

## Under the hood: memberlist, Lifeguard, Serf and Consul

HashiCorp's memberlist is the most widely deployed SWIM. Its `DefaultLANConfig`:

| Setting | LAN default | Effect |
|---|---|---|
| `ProbeInterval` / `ProbeTimeout` | 1 s / 500 ms | One direct probe per period; wait for its ack |
| `IndirectChecks` | 3 | Members asked to ping-req |
| `SuspicionMult` | 4 | Minimum suspicion timeout = 4 × max(1, log₁₀N) × `ProbeInterval`: 4 s at 5 nodes, 12 s at 1,000 |
| `SuspicionMaxTimeoutMult` | 6 | Lifeguard's starting timeout is 6 × the minimum |
| `GossipInterval` / `GossipNodes` | 200 ms / 3 | Push queued updates to 3 random members every 200 ms |
| `RetransmitMult` | 4 | Each update is sent 4 × ⌈log₁₀(N+1)⌉ times, then retired (16 at 1,000 nodes) |
| `PushPullInterval` | 30 s | Full-state TCP sync with one random member: the anti-entropy safety net |

**Lifeguard** (Dadgar, Phillips and Currey at HashiCorp) attacked SWIM's remaining false positives, which came mostly from slow *probers* rather than slow targets:

1. **Local health awareness.** Helpers asked to ping-req send a nack when their own probe fails. A prober that hears neither ack nor nacks concludes the problem is local (CPU starvation, a saturated NIC), raises an awareness score up to `AwarenessMaxMultiplier` (8), and multiplies its probe timeout and interval by it. A sick node stops accusing healthy ones.
2. **Dynamic suspicion.** The timeout starts at the maximum and shrinks as independent suspicions arrive: timeout = max − (max − min) × log(c + 1) / log(K + 1), where c counts confirmations from other members and K = `SuspicionMult` − 2 = 2. At five nodes (min 4 s, max 24 s) that is 24 s with no confirmation, about 11.4 s after one and 4 s after two. Branch 2 above takes longer in memberlist until B's and C's own probes of E confirm it.
3. **Buddy system.** A prober that suspects its target says so in the ping itself, so a live but suspected node learns of it at once and refutes.

**Serf** wraps memberlist with user events and queries ordered by Lamport clocks. **Consul** runs a LAN Serf pool of every agent in a datacenter and a WAN pool of servers across datacenters, with a WAN profile of multi-second timeouts. Gossip only detects: the Raft-replicated catalog on the servers decides, and the leader records a failed member as a failing health check, so service discovery changes once, through consensus.

## Under the hood: Cassandra's gossiper

Every second each Cassandra node increments its own heartbeat version and starts an exchange with one random live peer; it may also contact a random unreachable node (to notice recoveries) and a seed if the live peer was not one, so one to three exchanges per second. A node's gossiped state is a **generation** (the epoch second at which it started) and **versions** from one counter, stamped on the heartbeat and on each application state (`STATUS`, `TOKENS`, `SCHEMA`, `DC`, `RACK`, `LOAD`, `HOST_ID`). An exchange is three messages, traced here between A and B about three endpoints:

| Endpoint | A's digest (generation:max version) | B's digest | B's ACK | A's ACK2 |
|---|---|---|---|---|
| X | 1726000000:212 | 1726000000:205 | "Send X after version 205" | X's heartbeat (212) and `LOAD` (209), the states newer than 205 |
| Y | 1726000100:90 | 1726000100:97 | Y's states with versions above 90 | – |
| Z | 1726000500:3 | 1725990000:4410 | "Send all of Z": a newer generation means Z restarted | Z's full state |

A's SYN carries only digests. Equal generations compare versions and ship only the delta, in whichever direction is behind; a higher generation wins regardless of version. This is push-pull anti-entropy on digests, and steady-state bytes follow the change rate.

**Failure detection** is the phi-accrual detector from [failure detection and leases](/learn/system-design/distributed-systems/failure-detection-and-leases), fed by the arrival of a newer heartbeat version for each node from anyone. Cassandra approximates inter-arrival times as exponential, so phi = Δt / (mean × ln 10): with a 1-second mean, the default `phi_convict_threshold` of 8 convicts after about 18 seconds of silence, and each step above 8 adds about 2.3 mean intervals; the shipped `cassandra.yaml` says most users should never need to adjust it. Gossip spreads state but does not order decisions; Cassandra's transactional cluster metadata work (CEP-21) moves token ownership and schema changes onto a linearizable log, keeping gossip for liveness.

## Anti-entropy with Merkle trees, traced

Gossip spreads small state. Replicas of a large dataset diverge for other reasons (a write missed one replica, a node was down for an hour, a hint was lost), and comparing them row by row costs O(data) each time. A **Merkle tree** hashes each slice of the token range into a leaf, and each parent hashes its two children, so equal hashes vouch for everything beneath them ([Merkle trees](/learn/advanced-data-structures/log-structured-and-disk-structures/merkle-trees-and-ring-buffers) builds one). Take 8 token ranges of 3 rows each; replica B missed one update in range 5. Truncated SHA-256 hashes, compared top down:

| Round | Nodes compared | A | B | Result |
|---|---|---|---|---|
| 1 | root | `5a2a2b99` | `609113b7` | Differs: fetch children |
| 2 | ranges 0–3, 4–7 | `f85d94e4`, `aac8f65d` | `f85d94e4`, `9e4f47f5` | 0–3 equal, skipped; 4–7 differs |
| 3 | ranges 4–5, 6–7 | `fd2ad865`, `2f4e4d4b` | `4702ab83`, `2f4e4d4b` | 4–5 differs |
| 4 | ranges 4, 5 | `e31fb404`, `5217e32d` | `e31fb404`, `4f237642` | Range 5 differs: stream its rows |

Seven hash comparisons in four round trips. At this size sending all 8 leaf hashes in one message would be cheaper; the tree pays off as leaves multiply. With 2¹⁵ leaves and one differing leaf the walk costs 1 + 2 × 15 = 31 comparisons instead of 32,768, and d scattered differences cost roughly 2d·log₂(L/d). Cassandra trades round trips for bandwidth: each replica sends its whole tree to the repair coordinator, which diffs them locally and then streams the mismatched ranges between replica pairs.

The expensive part is **building** the tree: every row in the range is read and hashed. At 200 MB/s, 2 TB per replica takes nearly 3 hours of disk and CPU, which is why repair is scheduled, throttled and run per range. Riak's [active anti-entropy](https://docs.riak.com/riak/kv/2.2.3/learn/concepts/active-anti-entropy/index.html) keeps persistent trees updated on every write instead, paying on the write path to avoid the scan.

```exercise
id: merkle-diff
title: Find the differing leaves with a Merkle walk
prompt: |
  Two replicas hold leaf hashes `a` and `b`: integer lists of equal length,
  a power of two (1, 2, 4, 8, ...). Build each Merkle tree bottom up, where a
  parent's hash is

      parent = (left * 1000003 + right) % 2147483647

  Then compare the trees top down, level by level: compare the roots; for
  every internal node pair that differs, compare both of its children; never
  descend into a pair that is equal. Each node pair compared counts as one
  comparison.

  Return `{"diff": [...], "comparisons": n}` where `diff` lists, in ascending
  order, the leaf indexes whose hashes differ and that the walk reached.
languages: [python, javascript]
entry: merkle_diff
starter:
  python: |
    def merkle_diff(a, b):
        # build both trees, then walk down from the roots
        return {"diff": [], "comparisons": 0}
  javascript: |
    function merkle_diff(a, b) {
      // build both trees, then walk down from the roots
      return { diff: [], comparisons: 0 };
    }
tests:
  - args: [[11, 22, 33, 44, 55, 66, 77, 88], [11, 22, 33, 44, 55, 67, 77, 88]]
    expected: {"diff": [5], "comparisons": 7}
    label: one differing leaf out of eight
  - args: [[11, 22, 33, 44, 55, 66, 77, 88], [11, 22, 33, 44, 55, 66, 77, 88]]
    expected: {"diff": [], "comparisons": 1}
    label: identical replicas need one comparison
  - args: [[5], [6]]
    expected: {"diff": [0], "comparisons": 1}
    label: a single leaf is the root
  - args: [[1, 2, 3, 4, 5, 6, 7, 8], [1, 9, 3, 4, 5, 6, 0, 8]]
    expected: {"diff": [1, 6], "comparisons": 11}
    label: differences in both halves
  - args: [[1, 2, 3, 4], [5, 6, 7, 8]]
    expected: {"diff": [0, 1, 2, 3], "comparisons": 7}
    label: everything differs, every node compared
  - args: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], [0, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]]
    expected: {"diff": [0, 1], "comparisons": 9}
    hidden: true
  - args: [[1, 2, 3, 4], [2, 1, 3, 4]]
    expected: {"diff": [0, 1], "comparisons": 5}
    hidden: true
    label: parent hashes are order-sensitive
hints:
  - "Store each tree as a list of levels, leaves first; level i+1 has half as many entries as level i."
  - "Keep a frontier of node indexes to compare at the current level; a differing internal node at index j adds children 2j and 2j+1 to the next frontier."
```

A **Bloom filter** answers the one-sided question "which of my keys do you lack?" in one message: a replica sends a filter of its keys (about 1.2 MB for a million keys at a 1% false-positive rate, 9.6 bits per key), and the peer sends back every key the filter says is absent. A false positive hides a missing key until the next round or a Merkle comparison.

```viz
{"type": "system", "scenario": "bloom-filter", "keys": ["k1","k2","k3","k7","k9"],
 "title": "Bloom filter as a set digest", "caption": "One replica sends a compact filter of its keys. The peer tests each of its own keys: a miss means the first replica definitely lacks it and it is sent; a hit might be a false positive, so a rare missing key survives until the next round or a Merkle comparison."}
```

## Cassandra repair: full, incremental and overstreaming

**Full repair** builds trees over all data in the range on every replica (a validation compaction), diffs them and streams mismatches. **Incremental repair** marks SSTables as repaired after a successful session, splitting mixed files by anti-compaction, so later sessions hash only unrepaired data. Before 4.0 it had correctness problems when sessions failed partway, and many operators ran full repair only; Cassandra 4.0 reworked it (CASSANDRA-9143) so SSTables are marked repaired only when the whole session succeeds. **Subrange repair** (what Cassandra Reaper schedules) splits a range into small pieces so each session is short and its trees are fine-grained. `nodetool repair --preview` (4.0) reports what a repair would stream without streaming it.

**Overstreaming** comes from coarse leaves: a differing leaf streams every partition it covers, even when one differs. Take a range of 1,000,000 partitions of 100 KiB (about 100 GB) under a 2¹⁵-leaf tree, about 30.5 partitions per leaf, with differing partitions scattered at random:

| Partitions that differ | Leaves that differ | Streamed | Actually different | Overstream |
|---|---|---|---|---|
| 100 | 100 | 0.31 GB | 0.01 GB | 30× |
| 1,000 | 985 | 3.1 GB | 0.10 GB | 30× |
| 10,000 | 8,655 | 27 GB | 1.0 GB | 26× |
| 100,000 | 31,453 | 98 GB | 10 GB | 9.6× |

A leaf is clean with probability (1 − d/P)^(P/L); with 10,000 differences that is 0.99^30.5 = 0.74, so 26% of leaves stream about 30 partitions each. With 2²⁰ leaves (about one partition per leaf) the same repair streams 0.98 GB, but each tree grows 32-fold in memory. Cassandra sizes tree depth from the estimated partition count within a memory budget, on the order of 2¹⁵ to 2²⁰ leaves per range depending on version and settings; smaller subranges are the practical lever, because they make every leaf finer.

## Read repair, hinted handoff and full repair

| Mechanism | Trigger | Covers | Misses | Cassandra default |
|---|---|---|---|---|
| Read repair | A read at a consistency level above ONE sees mismatched digests | Keys that are read | Cold keys, forever | Blocking read repair on mismatch; the probabilistic `read_repair_chance` options were removed in 4.0 |
| Hinted handoff | A replica is down at write time; the coordinator stores a hint and replays it on return | Writes during short outages | Outages longer than the window; hints lost with the coordinator | `max_hint_window` 3 hours |
| Full or incremental repair | Scheduled | Every key, including cold ones and long outages | Nothing, if it runs in time | Must complete on every range within `gc_grace_seconds` (10 days) |

Read repair and hints keep divergence small; scheduled repair is the guarantee, and it has a deadline because of **tombstones**. A delete writes a tombstone that shadows older values and is purged after `gc_grace_seconds`. Trace replica C missing a delete:

| Day | Replica A | Replica B | Replica C |
|---|---|---|---|
| 0 | Row r = v | r = v | r = v; C goes down |
| 1 | Delete r: tombstone | Tombstone | Missed |
| 11 | Compaction purges the tombstone (10 days passed) | Purged | Down |
| 12 | – | – | Returns with r = v |
| 13 | Repair: C has v, A has nothing, so v streams to A | v streams to B | r = v |

The deleted row is back. The rules follow: repair every range at least once per `gc_grace_seconds`, and rebuild (wipe and stream) a node down longer than that instead of rejoining it. [Wide-column stores](/learn/databases/nosql-and-specialised/wide-column-stores) covers the rest of Cassandra's write path.

## Choosing a membership mechanism

| Approach | Per-node load | Detection time | View consistency | When the mechanism fails | Fits |
|---|---|---|---|---|---|
| All-to-all heartbeats | N − 1 messages per period | One timeout | Each node's own | No central part | Tens of nodes |
| Central registry | One heartbeat per period; the registry handles N | One timeout | Single view | Registry outage blinds everyone | Hundreds, with a replicated registry |
| Consensus store with leases (etcd, ZooKeeper) | Lease renewals | Lease TTL | Linearizable | Needs a quorum of the store | Membership that decides ownership |
| SWIM gossip | About one ping plus piggybacked updates | ≈ 1.6 periods to first probe, plus suspicion | Eventually consistent | No central part; partitions yield two views | Thousands to tens of thousands |

Gossip is the wrong tool when the answer must be agreed: leader election, ownership reassignment, anything that must happen exactly once needs [consensus](/learn/system-design/distributed-systems/consensus-raft), with gossip as an input. It is overkill below about ten nodes, where broadcasting is simpler. It cannot carry megabytes per node per second; gossip versions and fetch the state from a store. And "converges in about 10 rounds with high probability" is not a hard deadline. Redis Cluster shows the pattern: one node's `PFAIL` is a rumour, promoted to `FAIL` only when a majority of masters report it.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Partition produces two views | Each side reports the other side dead; both keep serving | Membership size diverges by side; cross-side probes fail | Gossip informs, consensus decides: quorum-gated actions, ownership in a consensus store |
| Gossip storm | Gossip bandwidth grows with cluster size and starves traffic | Full-state exchanges; per-node gossip bytes trend with N × state | Digests and deltas, bounded fanout, rate limits |
| False deaths from pauses (flapping) | Dead declarations followed by rejoins within seconds; partitions shuffle | GC or CPU-steal pauses longer than the suspicion timeout | Timeouts above observed pauses, incarnation refutation, Lifeguard awareness |
| Resurrected deletes | Deleted rows reappear after a node returns | A range went unrepaired for longer than `gc_grace_seconds`, or a long-dead node was rejoined | Repair SLO per range with alerts; rebuild nodes down past the window |
| Repair at peak | p99 latency doubles when repair starts | Validation compactions scanning every replica's disk | Schedule off-peak, throttle, subrange or incremental repair |
| Overstreaming | Repair streams tens of GB to fix a handful of rows; disks fill with new SSTables | Coarse Merkle leaves; `--preview` shows streamed bytes far above the mismatch | Smaller subranges, incremental repair, deeper trees where memory allows |
| Hints that never deliver | Writes missing after an outage longer than 3 hours | Expired-hint counters; outage longer than `max_hint_window` | Run repair after any outage longer than the window |

## Interviewer follow-ups

**"How does a 1,000-node cluster learn a node has died, without a coordinator, and how long does it take?"** Model answer: SWIM: each member probes one member per second, indirect probes through three others rule out a bad link, then suspicion; memberlist's minimum suspicion timeout at 1,000 nodes is 12 s (up to 72 s until other members confirm), and the death spreads in a handful of gossip rounds, so tens of seconds end to end, at constant per-node cost. Common wrong answer: "every node heartbeats every other node," which is N² traffic.

**"Why does Cassandra need repair if it has read repair and hinted handoff?"** Model answer: read repair covers only keys that are read and hints only outages under three hours whose coordinator survived; only Merkle repair covers every key, and it must run within `gc_grace_seconds` or deletes resurrect. Common wrong answer: "read repair fixes everything eventually," which never touches cold data.

**"Repair streamed 27 GB to fix about 1 GB of differences. Why, and what do you change?"** Model answer: overstreaming from coarse leaves, each differing leaf dragging about 30 partitions; run subrange or incremental repair and check with `--preview`. Common wrong answer: "throttle streaming," which makes the same 27 GB take longer.

**"When would you not use gossip for membership?"** Model answer: under about ten nodes; when membership decides ownership and must be linearizable, which belongs in etcd or ZooKeeper; when state per node is large. Common wrong answer: "gossip is always more scalable," which ignores that it cannot produce agreement.

**"A node was down for 12 days. Can it rejoin?"** Model answer: not with a 10-day `gc_grace_seconds`: tombstones it missed are purged elsewhere, and repair would copy its stale rows back; wipe it and stream its ranges as a new node. Common wrong answer: "run repair after it rejoins," which is precisely what resurrects the deletes.

## What mid-level engineers get wrong

- **Quoting log₂N rounds for push gossip.** Consequence: at 10,000 nodes the simulated mean is 23.7 rounds, not 13; SLOs set on the smaller number are missed.
- **Setting the suspicion timeout below observed GC pauses.** Consequence: nodes flap dead and alive, and every flap reshuffles ownership.
- **Letting gossip membership decide ownership directly.** Consequence: a partition gives two sides that each own everything.
- **Relying on read repair and hints alone.** Consequence: cold data diverges for months, and the first real repair resurrects deletes.
- **Running full, cluster-wide repair at peak.** Consequence: every replica scans its disks at once and latency doubles.
- **Gossiping full state because it is simpler.** Consequence: bandwidth grows with N × state size until gossip crowds out traffic.

## Senior signals

- You quote convergence with constants: push ≈ log₂N + ln N, push-pull at fanout 3 about 5 rounds for 1,000 nodes, and you know digests keep bandwidth proportional to the change rate.
- You can trace SWIM's ping, ping-req, suspicion and incarnation refutation, and say which false positive each removes.
- You know what Lifeguard changed (local health awareness, dynamic suspicion, buddy system) and what memberlist's timeouts are at your cluster size.
- You separate dissemination from agreement: gossip detects, consensus decides.
- You can walk a Merkle comparison, size overstreaming from leaf granularity, and pick subrange or incremental repair.
- You treat repair within `gc_grace_seconds` as an SLO and rebuild, not rejoin, a node down longer.

## Check yourself

```quiz
- q: >-
    In the lesson's simulation, push-pull gossip with fanout 3 reached every one of 1,000 nodes in how many rounds, and how does that grow?
  options: ["About 5, adding 1–2 rounds per tenfold growth in N", "About 330, since N / 3 nodes are reached each round", "About 1,000, since every node needs a round of its own", "About 30, growing linearly as N divided by 33"]
  answer: 0
  explanation: >-
    Informed nodes multiply each round, so the count grows logarithmically: the simulated mean was 5.1 rounds at 1,000 nodes and 6.7 at 10,000. Linear answers assume one informer at a time; in gossip every informed node spreads in parallel.
- q: >-
    In SWIM, why does a prober ask three other members to ping the target before suspecting it?
  options: ["To elect a leader that decides whether the target is dead", "To average round-trip latency measured from several places", "So a bad link to the target is not mistaken for its death", "To spread the probing load more evenly across all members"]
  answer: 2
  explanation: >-
    If any indirect prober gets an ack, the target is alive and the problem was the path from the original prober. This removes the single-bad-link false positive without a coordinator. The indirect probes add traffic rather than spreading it, and no leader is involved.
- q: >-
    Node E learns from a piggybacked message that it is suspected with incarnation 4. What does it do so the cluster keeps it alive?
  options: ["It waits until its heartbeat version passes the suspicion's", "It gossips Alive with incarnation 5, which overrides Suspect 4", "It pings the accuser directly so the accuser cancels its timer", "It asks a majority of members to vote that it is still alive"]
  answer: 1
  explanation: >-
    Only E increments its own incarnation, and Alive(E, i) replaces Suspect(E, j) whenever i is greater than j, so Alive 5 overrides every copy of Suspect 4 as it spreads. Other members' timers are cancelled by that update, not by a direct message, and SWIM has no vote.
- q: >-
    Two replicas compare Merkle trees level by level. The trees have 2^15 leaves and exactly one leaf differs. How many hash comparisons does the walk make?
  options: ["31 comparisons, two per level below the root", "15 comparisons, one for each level of the tree", "65,535 comparisons, one for every tree node", "32,768 comparisons, one for every leaf hash"]
  answer: 0
  explanation: >-
    The roots are compared once; at each of the 15 levels below, only the children of the one differing node are compared, two hashes per level: 1 + 2 × 15 = 31. Equal subtrees are never entered, which is the point of the tree. Comparing every leaf or node is what the tree avoids.
- q: >-
    A Cassandra repair streams 27 GB to fix about 1 GB of scattered differences. What is the most likely cause?
  options: ["Repair streaming always sends data without compression", "Tombstones are streamed alongside every row they shadow", "Each differing leaf streams every partition it covers", "Every replica streams its full copy of each changed row"]
  answer: 2
  explanation: >-
    With about 30 partitions per leaf, a single differing partition makes its whole leaf stream, so scattered differences inflate the transfer about 26 to 30 times. Smaller subranges or incremental repair make leaves finer or the data smaller; throttling would only slow the same transfer.
- q: >-
    A replica misses a delete, stays down for 15 days, and rejoins a cluster with gc_grace_seconds of 10 days. The likely outcome is:
  options: ["Nothing; repair treats the stale row as already deleted", "The deleted row comes back; its tombstone is gone elsewhere", "The cluster rejects the node for exceeding the grace window", "The delete reaches it on rejoin through normal hinted handoff"]
  answer: 1
  explanation: >-
    The tombstone was purged from the other replicas after 10 days, so nothing shadows the old value, and repair copies the stale row back to them. Hints expire after 3 hours by default, and nothing rejects the node automatically; a node down longer than the grace window must be rebuilt.
```
