---
slug: when-lossless-goes-wrong
title: "When lossless goes wrong: spreading, storms, deadlock and the counters that tell"
description: How PFC's promise of zero drops turns into congestion spreading, head-of-line blocking of innocent flows, pause storms and deadlock from a cyclic buffer dependency, traced on Meridian's GPU fabric; what the PFC watchdog does, why incast at scale outruns ECN, and which switch and NIC counters each tell half the story.
minutes: 40
difficulty: hard
tags: [fabric-networking, rdma, roce, pfc, ecn, dcqcn, deadlock, incast, head-of-line-blocking, congestion, telemetry, ai-infrastructure, interview]
problems: [routing-loop-detect]
---
A training job on Meridian's San Jose GPU cluster slows from 410 ms per step to 1.9 s. The AI team opens a ticket. The network team's dashboards show no drops, no CRC errors, no link down, no interface above 60% utilisation. Both teams are right. A lossless fabric in trouble does not lose packets: it makes them wait, and waiting is contagious. A pause sent to protect one congested port stops unrelated traffic, then the switch behind that, and in the worst case two switches wait for each other forever with no drop counter anywhere to say so. Finding it takes the switch's counters and the NIC's counters together, because each holds half the story.

## The promise, in one paragraph

RoCE (RDMA over Converged Ethernet: remote memory reads and writes done by the network card, carried in UDP port 4791) recovers from loss badly: a reliable-connected queue pair accepts packets only in sequence, so one drop makes the receiver discard everything after it until the sender goes back and resends (go-back-N, in [RDMA from zero](/learn/fabric-networking/ai-fabrics/rdma-from-zero)). So RoCE rides a **lossless class**. PFC (priority flow control, IEEE 802.1Qbb) lets a switch tell its neighbour "stop sending priority 3" when the bytes it holds from that neighbour in that priority cross a threshold called **XOFF**, and "resume" when they fall below **XON**. A **headroom** buffer above XOFF absorbs what was already on the cable. ECN (explicit congestion notification) with DCQCN is the gentler layer: a queue past its marking threshold sets the ECN field to CE ("congestion experienced"), the receiving NIC answers with a CNP (congestion notification packet), and the sender cuts its rate ([lossless Ethernet: PFC, ECN and DCQCN](/learn/fabric-networking/ai-fabrics/lossless-ethernet-pfc-ecn-dcqcn) traces all of it). What matters here is what a PAUSE frame cannot express:

| Field | Size | Value in this example | What reads it |
|---|---|---|---|
| Destination MAC | 6 bytes | `01:80:c2:00:00:01` (reserved for MAC control, never forwarded) | The neighbour's MAC layer, which consumes the frame on this link |
| Source MAC | 6 bytes | The sending port's own MAC | Counters and captures only |
| EtherType | 2 bytes | `0x8808` (MAC control) | The neighbour's parser, in hardware |
| Opcode | 2 bytes | `0x0101` (priority-based flow control) | Distinguishes PFC from the older whole-link PAUSE |
| Class-enable vector | 2 bytes | `0x0008` (priority 3 only) | Which of the 8 timers below apply |
| Eight pause timers | 8 × 2 bytes | priority 3: `0xffff`, others 0 | Pause length in quanta of 512 bit times; 0 means resume |

The frame is padded to Ethernet's 64-byte minimum. At 400 Gb/s one quantum is 512 / 400×10⁹ = 1.28 ns, so the maximum 65,535 quanta pause for 83.9 µs (at 100 Gb/s, 335.5 µs). A switch that stays above XOFF refreshes the pause before it expires, thousands of times per second. Notice what is missing from the table: no flow, no destination, no queue pair. PFC can say "stop priority 3 on this link" and nothing finer. Every failure in this lesson follows from that.

## Congestion spreading: the pause tree

A switch counts lossless bytes against the **ingress** port they arrived on (the "priority group" of that port), because a pause can only be sent back out of the port the bytes came in on. So when one egress port is congested, the switch pauses every ingress port that feeds it, and each paused neighbour now holds bytes it cannot send, charged to its own ingress ports. The pauses climb hop by hop towards the senders, forming a tree rooted at the congested port. That is **congestion spreading**.

Take a small slice of Meridian's San Jose back end: two of its eight spines (`ai-spine1.sjc`, `ai-spine2.sjc`) and three of its sixteen leaves. Rail 1 has two leaves, `rail1-leaf1.sjc` for servers 1 to 64 and `rail1-leaf2.sjc` for servers 65 to 128 ([AI fabric topologies](/learn/fabric-networking/ai-fabrics/ai-fabric-topologies) explains the rails); `rail2-leaf1.sjc` is the first leaf of rail 2. Every link is 400 Gb/s and priority 3 is lossless everywhere. Three RDMA flows run:

- `srv1 → srv3` at 400 Gb/s, both on `rail1-leaf1`.
- `srv65 → srv3` at 200 Gb/s, up through `ai-spine1` and down to `rail1-leaf1`.
- `srv66 → srv5` at 200 Gb/s, the same path, to `srv5`, whose port is idle.

`srv3`'s port is offered 600 Gb/s and can send 400. Use the illustrative XOFF of 200 KB per ingress port from the incast example later in this lesson, and assume the egress queue serves arrivals in proportion to their rates (1 Gb/s is 0.125 KB per µs):

| Step | Where | What fills | Rate of growth | Time to XOFF | Result |
|---|---|---|---|---|---|
| 1 | `rail1-leaf1`, port from `srv1` | bytes for `srv3` | 400 − 266.7 = 133.3 Gb/s, 16.7 KB/µs | 12 µs | PAUSE to `srv1` |
| 2 | `rail1-leaf1`, port from `ai-spine1` | bytes for `srv3` | 200 − 133.3 = 66.7 Gb/s, 8.3 KB/µs | 24 µs or later | PAUSE to `ai-spine1`: all priority 3 on that link stops, `srv5`'s packets included |
| 3 | `ai-spine1`, port from `rail1-leaf2` | everything for `rail1-leaf1` | 400 Gb/s in, 0 out, 50 KB/µs | 4 µs more | PAUSE to `rail1-leaf2` |
| 4 | `rail1-leaf2`, ports from `srv65` and `srv66` | everything for `ai-spine1` | 200 Gb/s each, 25 KB/µs | 8 µs more | PAUSE to both NICs |

The times are first-order (once `srv1` is paused, the spine's bytes get a larger share of the port and step 2 comes later, but it comes). So within a few tens of microseconds of the incast starting, `srv66` is paused although its destination is idle. The tree spread three hops in a tiny fraction of one telemetry sample (streaming telemetry typically samples every 1 to 10 s, SNMP polling every few minutes), so a dashboard of per-interval averages sees the aftermath, never the spread.

- **Solves:** nothing; it is the cost of PFC. Without it, step 1 would have been tail drops at `srv3`'s port and go-back-N retransmissions.
- **Breaks:** throughput of flows that never touched the congested port. The tree lasts as long as the incast, or until DCQCN slows the incast senders, which takes tens to hundreds of microseconds (worked in the incast section below).
- **Signal:** PAUSE-transmitted counters rising on a chain of ports leading back from one egress port that shows a deep queue, and pause-received counters at the far end of each of those links.

## Head-of-line blocking and the victim flow

`srv66`'s flow is the **victim**. Its packets share priority-3 FIFO queues with the packets for `srv3` on the same links, so when PFC freezes those queues, every packet behind the head waits, including those for the idle `srv5`. That is **head-of-line blocking**: a packet that could be delivered stuck behind one that cannot. The term comes from input-queued switch design, where it caps throughput at about 58.6% under uniform random traffic; PFC recreates it across a whole fabric.

Why not a queue per flow? Ethernet has 8 priorities and each lossless one needs its own headroom on every port, so AI fabrics run one, sometimes two: all RoCE traffic of all jobs shares priority 3. Inside `rail1-leaf1` the egress queue towards `srv5` is separate and empty; the blocking happens one hop earlier, on the link from `ai-spine1`, which PFC stops for every destination at once.

- **Solves:** nothing; it is the price of one shared lossless queue instead of thousands.
- **Breaks:** `srv66`'s throughput collapses with zero drops, zero errors and zero ECN marks at `srv5`'s port (that queue is empty).
- **Signal:** pauses received by `srv66`'s NIC; following them (`rail1-leaf2`, then `ai-spine1`, then `rail1-leaf1`) ends at `srv3`'s port with the deep queue.

```viz
{"type": "fabric", "scenario": "pfc-deadlock", "title": "PFC gone wrong: pauses spread to an innocent flow, then a micro-loop deadlocks a link until the watchdog drops", "caption": "Two spines and three leaves of Meridian's San Jose back end, priority 3 lossless at 400 Gb/s. First half: srv1 and srv65 incast into srv3, rail1-leaf1 pauses srv1 and ai-spine1, ai-spine1 pauses rail1-leaf2, rail1-leaf2 pauses srv65 and srv66, and srv66's flow to the idle srv5 stops with zero drops; the incast ends and it clears. Second half: the ai-spine1 to rail1-leaf1 optic fails, ai-spine1 converges onto valley paths before rail1-leaf2 does, srv66's packets ping-pong between them, both directions of that link pause each other into a cyclic buffer dependency that outlives the loop, keeps srv66 paused and traps srv65's flow to rail 2, and the PFC watchdog (200 ms detection, action drop) breaks it. Watch the pause table and the flow statuses."}
```

## PFC storms: a receiver that never drains

Congestion spreading ends when the incast ends. A **PFC storm** does not: a device pauses continuously, the link towards it never moves, and the pause tree grows over every switch with lossless traffic for anything behind that link.

The classic root is a NIC, which sends PFC like a switch port: if its receive path stalls (a firmware bug, a hung PCIe transaction), its buffer fills and it pauses the leaf. Microsoft described exactly this in its 2016 SIGCOMM paper "RDMA over Commodity Ethernet at Scale" (Guo et al.): a malfunctioning NIC sent pause frames continuously, they propagated through the Clos, and lossless traffic stopped across a large part of the network. Their fix, watchdogs on both sides (below), is now standard.

A milder version, the **slow receiver**, is common in GPU servers: a healthy NIC that cannot push data into host or GPU memory as fast as the wire delivers it, because it sits on the wrong PCIe switch relative to its GPU, PCIe trained at a lower generation or width than expected, or its address translation cache misses on a huge registered region (Microsoft's paper fixed one case by using 2 MB pages instead of 4 KB). The NIC pauses for part of every second: not a storm, but it slows every flow behind its leaf port, and the switch shows nothing except pauses *received* on the port facing that NIC ([tuning and benchmarking RDMA](/learn/fabric-networking/ai-fabrics/tuning-and-benchmarking-rdma) covers the placement checks).

The arithmetic of a storm: a maximum pause lasts 83.9 µs at 400 Gb/s, so continuous pausing takes at least 1 / 83.9 µs ≈ 11,900 PAUSE frames per second. The **pause duration** counter (microseconds, on NICs and many switches) is more telling: a port paused for 990 ms of every second is a storm, whatever the frame count.

- **Solves:** nothing; it is a fault amplified by PFC.
- **Breaks:** lossless traffic of every job whose packets cross any link in the growing tree.
- **Signal:** one port whose pause-transmit duration approaches wall-clock time; PAUSE *transmitted by a NIC* (a healthy NIC rarely sends any); the NIC's own storm counters (on ConnectX, `tx_pause_storm_warning_events` and `tx_pause_storm_error_events`).

## PFC deadlock: a cyclic buffer dependency

Congestion spreading needs a congested root and a storm a broken one. A **deadlock** needs neither: once formed, it persists after its cause has gone, with every link and device healthy.

### The four conditions, mapped

Deadlock in operating systems needs four conditions at once ([deadlock](/learn/systems/concurrency/deadlock)): mutual exclusion, hold and wait, no preemption, circular wait. A lossless fabric meets the first three by design:

| Condition | In threads | In a PFC fabric |
|---|---|---|
| Mutual exclusion | A lock has one holder | A buffer slot holds one packet |
| Hold and wait | A thread holds lock A while waiting for B | A packet holds buffer in switch V while waiting for buffer in switch W |
| No preemption | Nobody takes a lock away | Lossless: nobody drops the packet to free the buffer |
| Circular wait | A waits for B waits for A | A **cyclic buffer dependency** (CBD): a chain of "this buffer waits for that one" that comes back to where it started |

Write a node for each directed link's lossless buffer, (U→V): the bytes switch V holds in priority 3 for its port from U. Draw an edge from (U→V) to (V→W) whenever traffic V received from U may be forwarded to W, because those bytes leave only when W has room. If this **buffer dependency graph** has a cycle and every buffer in it fills at once, nothing in the cycle can move. The cycle is necessary, not sufficient: load decides whether the deadlock happens.

### Why a Clos is safe, until it is not

In a healthy leaf-spine fabric every path goes **up then down**. A buffer on an uplink waits only for buffers on downlinks, and a buffer on a downlink waits only for the destination server. Number the buffers by tier, uplinks 1 and downlinks 2: every dependency goes from a lower number to a higher one, so no cycle can exist. It is the lock-ordering proof from concurrent code: take locks in a global order and circular wait is impossible.

A cycle needs a **down-up turn**: a packet that goes down to a leaf and back up to a spine, a *valley* path. Three ways a fabric produces them:

1. **Micro-loops during convergence.** After a failure, routers update their forwarding tables at slightly different times, so for milliseconds one router sends a prefix to a neighbour that sends it straight back ([convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd)). On a lossy fabric the TTL ends that. On a lossless one the looping packets fill both directions of the link first.
2. **Valley detours chosen by the routing protocol.** IS-IS computes shortest paths over whatever links exist, so when a spine loses its link to a leaf it reaches that leaf down through another leaf and up through another spine. An eBGP underlay where all spines share one AS rejects such paths, because a path through two spines would carry that AS twice ([BGP as the underlay](/learn/fabric-networking/underlay/bgp-as-the-underlay)): the spine has no route and drops, which on a lossless fabric is the safer failure.
3. **Flooding lossless packets.** Microsoft's 2016 paper reported a deadlock in which a top-of-rack switch still held an ARP entry for a dead server but had aged out its MAC table entry (ARP entries lived far longer than MAC entries), so it flooded packets for that server to every port in the VLAN. The flooded lossless packets added buffer dependencies that up-down routing never creates, and with ordinary traffic they closed a cycle. Their fix: drop lossless packets that would otherwise be flooded.

### Traced: the micro-loop that deadlocks a link

The second half of the visualisation above, step by step:

1. The optic on the `ai-spine1` to `rail1-leaf1` link fails. `ai-spine1` sees the loss of light almost at once (well under a millisecond, unless a debounce timer holds the interface up) and its IS-IS runs SPF first. Its remaining ways to `rail1-leaf1` are valleys: down to `rail1-leaf2` or `rail2-leaf1`, then up to `ai-spine2`.
2. `rail1-leaf2` has not yet processed the news and still hashes `srv66`'s flow (for `srv5`, behind `rail1-leaf1`) onto `ai-spine1`, which sends it back down, and up it goes again. Each crossing costs one TTL, so a packet starting at 64 crosses the link about 60 more times while `srv66` keeps sending at 200 Gb/s: the `rail1-leaf2` to `ai-spine1` link is offered far more than its 400 Gb/s.
3. Both directions fill. `rail1-leaf2`'s buffer for bytes from `ai-spine1` crosses XOFF, so it pauses `ai-spine1`; `ai-spine1`'s buffer for bytes from `rail1-leaf2` crosses XOFF, so it pauses `rail1-leaf2`.
4. Now (rail1-leaf2→ai-spine1) waits for (ai-spine1→rail1-leaf2), which waits for (rail1-leaf2→ai-spine1). Nothing moves. The TTL cannot rescue it, because TTL falls only when a packet is forwarded.
5. Milliseconds later `rail1-leaf2` converges and sends `rail1-leaf1` traffic only via `ai-spine2`. The loop is gone. The deadlock is not: the packets already sitting in those buffers are queued for ports that stay paused. The new path does not help `srv66` either: its packets queued for `ai-spine1` before the change still fill its ingress buffer, so `rail1-leaf2` keeps pausing it. Any other RoCE flow that `rail1-leaf2` hashes onto `ai-spine1`, such as `srv65`'s flow to `srv2` on rail 2, joins the queue, and `rail1-leaf2` pauses `srv65` in turn.

A few milliseconds of inconsistency left a deadlock that lasts until something drops packets on purpose.

### Finding cycles before they bite

The check is a graph problem: build the buffer dependency graph from forwarding tables and look for a cycle with a depth-first search ([connectivity and cycles](/learn/data-structures/graphs/connectivity-and-cycles) has the three-colour DFS). The program follows next hops for each destination from every leaf that sends to it, and reports down-up turns and any cycle, on three snapshots of the fabric above.

```python
SPINES = {"ai-spine1", "ai-spine2"}


def buffer_dependencies(fib):
    """fib[switch][dest_leaf] -> set of next hops. Returns the edges of the
    buffer dependency graph: (u, v) -> (v, w) means a lossless packet held in
    v's buffer for the port from u waits for room on the link v -> w."""
    deps = {}
    for dest in {d for table in fib.values() for d in table}:
        # Every link that can carry traffic for dest, found by following FIBs
        # from every leaf that sends to it (a loop just revisits links).
        todo = [(src, nh) for src in fib if src not in SPINES and src != dest
                for nh in fib[src].get(dest, ())]
        seen = set()
        while todo:
            u, v = todo.pop()
            if (u, v) in seen or v == dest:
                continue
            seen.add((u, v))
            for w in fib[v].get(dest, ()):
                deps.setdefault((u, v), set()).add((v, w))
                todo.append((v, w))
    return deps


def find_cycle(deps):
    state, stack = {}, []          # state: 1 = on the DFS stack, 2 = finished

    def dfs(node):
        state[node] = 1
        stack.append(node)
        for nxt in deps.get(node, ()):
            if state.get(nxt) == 1:                     # back edge: a cycle
                return stack[stack.index(nxt):] + [nxt]
            if nxt not in state and (cycle := dfs(nxt)):
                return cycle
        state[node] = 2
        stack.pop()
        return None

    for node in list(deps):
        if node not in state and (cycle := dfs(node)):
            return cycle
    return None


def report(name, fib):
    deps = buffer_dependencies(fib)
    turns = sorted(f"{u}->{v}->{w}" for (u, v), outs in deps.items()
                   for (_, w) in outs if u in SPINES and w in SPINES)
    cycle = find_cycle(deps)
    print(f"{name}:")
    print(f"  down-up turns (valleys): {turns or 'none'}")
    print("  cycle: " + (" => ".join(f"{u}->{v}" for u, v in cycle) if cycle
                         else "none, deadlock-free"))


L1, L2, L3 = "rail1-leaf1", "rail1-leaf2", "rail2-leaf1"
up = {"ai-spine1", "ai-spine2"}
healthy = {
    L1: {L2: up, L3: up}, L2: {L1: up, L3: up}, L3: {L1: up, L2: up},
    "ai-spine1": {L1: {L1}, L2: {L2}, L3: {L3}},
    "ai-spine2": {L1: {L1}, L2: {L2}, L3: {L3}},
}
# The ai-spine1 - rail1-leaf1 optic fails. ai-spine1 has run SPF: its only
# ways to rail1-leaf1 now go down through another leaf and up to ai-spine2.
transient = {**healthy,
             "ai-spine1": {L1: {L2, L3}, L2: {L2}, L3: {L3}},
             L1: {L2: {"ai-spine2"}, L3: {"ai-spine2"}},
             L3: {L1: {"ai-spine2"}, L2: up}}          # rail1-leaf2 not yet
converged = {**transient, L2: {L1: {"ai-spine2"}, L3: up}}

report("healthy", healthy)
report("rail1-leaf2 not yet converged", transient)
report("converged", converged)
```

```text
healthy:
  down-up turns (valleys): none
  cycle: none, deadlock-free
rail1-leaf2 not yet converged:
  down-up turns (valleys): ['ai-spine1->rail1-leaf2->ai-spine1', 'ai-spine1->rail1-leaf2->ai-spine2', 'ai-spine1->rail2-leaf1->ai-spine2']
  cycle: rail1-leaf2->ai-spine1 => ai-spine1->rail1-leaf2 => rail1-leaf2->ai-spine1
converged:
  down-up turns (valleys): none
  cycle: none, deadlock-free
```

The edge `(u, v) -> (v, w)` is "this buffer waits for that one". The traversal starts only at leaves that send to the destination, so a valley route sitting unused in a spine's FIB (the converged snapshot: no leaf sends `rail1-leaf1` traffic to `ai-spine1`) adds no edge. All destinations share one graph, because a port's buffer is shared by every destination's traffic. The healthy snapshot is the tier-ordering proof made concrete; the transient one has three valleys, and one closes a cycle.

Two limits: the output is the *possibility* of deadlock, and the window lasted milliseconds, faster than any polled snapshot. So the useful form of this check is pre-change validation ("if this link fails, can any valley carry lossless traffic?"). [Routing loop detection](/practice/routing-loop-detect) is the same graph skill on forwarding tables.

## The PFC watchdog: preemption as a last resort

The four conditions say how to break a deadlock: remove one. Up-down routing removes circular wait. The **PFC watchdog** removes "no preemption": it drops packets to free buffer.

As SONiC (the open-source switch operating system) implements it:

1. **Detection.** The switch checks each lossless queue (in software or in the chip, depending on the platform). A queue that is in the paused state, holds packets, and has transmitted nothing for the whole **detection time** (SONiC default 200 ms) is declared in a **PFC storm**. Ordinary congestion pauses and resumes many times a second and does not trip a 200 ms timer; a storm or deadlock does.
2. **Action.** With the default action `drop`, the switch ignores PAUSE frames received for that queue, drops the packets it holds, and drops new arrivals for it. Alternatives are `forward` (ignore pauses and transmit, which pushes the problem onto the neighbour) and `alert` (log only).
3. **Restoration.** When no pause has been seen on that queue for the **restoration time** (also 200 ms by default), the queue becomes lossless again. Until then it is a lossy queue.

In the trace, the watchdogs on `rail1-leaf2` and `ai-spine1` fire, drop the stuck packets, and the cycle dissolves. Receivers see gaps in the packet sequence numbers (PSNs) and send NAKs, and senders go back to the first missing PSN; where the tail of a burst was dropped, no later packet reveals the gap, so the sender waits for its ACK timer. RC queue pairs compute that timer as 4.096 µs × 2^timeout, so an exponent of 18 means about 1.07 s; NCCL sets it with `NCCL_IB_TIMEOUT` and the retry count with `NCCL_IB_RETRY_CNT`.

The cost in numbers, against the opening job's 410 ms step: 200 ms of detection plus NAK-driven resends is about half a step; a flow whose tail was dropped waits for the 1.07 s ACK timer as well, more than two steps. Every GPU in the job pays it, because the step waits for the slowest transfer ([why AI traffic is different](/learn/fabric-networking/ai-fabrics/why-ai-traffic-is-different)). The trade-off in the timer: shorter detection ends real deadlocks sooner but risks declaring storms during long legitimate incasts; longer detection protects losslessness and lengthens every real outage. Whatever the value, alert on every event.

NICs have the same guard on their side. A ConnectX NIC that has been sending pauses for longer than a configurable timeout (seconds, by default) stops sending them and counts the event (`tx_pause_storm_error_events`), so a stalled host drops its own traffic instead of freezing the fabric: the fix the 2016 paper described.

- **Solves:** turns an unbounded outage (storm or deadlock) into a bounded one of a few hundred milliseconds.
- **Breaks:** it drops in the lossless class, so RoCE pays go-back-N; frequent firing means the fabric is effectively lossy with extra delay.
- **Signal:** storm-detected and storm-restored events per queue, and the watchdog's drop counters. Any non-zero value deserves an alert: the fabric's design assumption failed somewhere.

## Incast at scale: faster than any feedback loop

**Incast** is many senders transmitting to one receiver at the same moment, so a single egress port is offered several times its capacity. In AI clusters it comes from gathers, parallel storage reads, and mixture-of-experts all-to-all exchanges, which are balanced on average but overload a receiver whenever its expert is popular or bursts line up ([why AI traffic is different](/learn/fabric-networking/ai-fabrics/why-ai-traffic-is-different) introduces it). Ring collectives avoid it by design: each GPU receives from one neighbour ([collectives and NCCL](/learn/fabric-networking/ai-fabrics/collectives-and-nccl)).

```viz
{"type": "fabric", "scenario": "incast", "title": "Six-to-one incast into one 400G port: 3 MB tail-dropped when lossy, zero drops but senders paused 83% of the time under PFC", "caption": "Six servers on rail1-leaf1.sjc each send 1 MB to srv001 at once, 2,400 Gb/s into a 400 Gb/s egress port. In a lossy class the queue grows at 250 KB per µs, hits its 2 MB limit at 8 µs and tail-drops five packets in six: 3 MB lost, and go-back-N makes the senders resend about 3.6 MB. In a PFC class with an illustrative 200 KB XOFF per ingress port, pauses start at 4.8 µs, the queue holds at 1.2 MB, each sender averages 66.7 Gb/s and nothing is dropped; the burst ends at 120 µs. The last frames name the counters each side records."}
```

The viz runs six senders. Scale it to the worst case on the same leaf: `rail1-leaf1` serves 64 servers, so 63 of them each sending 1 MB at line rate to one (a gather, or an all-to-all step in which one GPU holds the popular expert) is a 63:1 incast.

| Quantity | Calculation | Value |
|---|---|---|
| Offered load | 63 × 400 Gb/s | 25.2 Tb/s into one 400 Gb/s port |
| Queue growth | 62 × 50 KB/µs | 3.1 MB per µs |
| Lossy class: 2 MB queue full | 2 MB ÷ 3.1 MB/µs | 0.65 µs |
| PFC class: each ingress port reaches 200 KB | 200 KB ÷ (50 − 0.8) KB/µs | about 4.1 µs |
| Bytes parked in the leaf under PFC | 63 × 200 KB | 12.6 MB |
| Minimum time to deliver 63 MB | 63 MB ÷ 50 KB/µs | 1.26 ms |

First, **ECN cannot catch the start**. A CE mark must reach the receiver and its CNP return to each sender before anyone slows: a fabric round trip of a few microseconds, while the lossy queue is full in under one. DCQCN's first cut is at most half the rate, and the DCQCN paper (Zhu et al., SIGCOMM 2015) spaced CNPs per flow about 50 µs apart (NIC defaults vary and are often shorter). Getting 63 senders from 400 Gb/s to a fair 6.3 Gb/s takes about six halvings (2⁶ = 64), on the order of 300 µs at that spacing. DCQCN converges long transfers; PFC carries every short burst. Second, **PFC at this scale is expensive in buffer**. 12.6 MB parked for one port is a large slice of a 64-port 400G switch chip, whose shared buffer is tens to around a hundred megabytes depending on the chip, often split between pipelines so one port can draw on only part of it. Other ports' lossless traffic hits its limits sooner and pauses fire on many ports at once: the incast spreads sideways as well as upstream.

What reduces incast at scale is mostly above the network: collective algorithms that avoid many-to-one patterns, limits on concurrent peers, staggered storage reads, balanced expert routing, and transports in which the receiver grants credit before senders transmit, the direction of Ultra Ethernet ([InfiniBand and RoCE](/learn/fabric-networking/ai-fabrics/infiniband-and-roce)). In the switch, the levers are an ECN threshold low enough to mark early, enough headroom per lossless port, and adaptive routing that keeps an incast's packets off links other flows need.

## The counters to watch

Names below are examples from ConnectX NICs (`/sys/class/infiniband/<dev>/ports/1/hw_counters/` and `ethtool -S`) and common switch operating systems; other vendors count the same events under other names.

| Signal | Side | Example names | What one count means | Healthy pattern | Worry when |
|---|---|---|---|---|---|
| ECN marks | Switch, per egress queue | ECN-marked packets (WRED/ECN counters) | A packet's ECN field set to CE | Rises with load, in bursts | Zero while queues are deep (ECN off or thresholds above XOFF) |
| CE arrivals | Receiver NIC | `np_ecn_marked_roce_packets` | A CE-marked RoCE packet arrived | Tracks the switch's marks | Far below them: the marks were cleared or re-marked on the path |
| CNPs sent | Receiver NIC | `np_cnp_sent` | A CNP generated (rate-limited per QP) | Present when marks are | Zero while CE arrives: congestion control off at the receiver |
| CNPs handled | Sender NIC | `rp_cnp_handled`, `rp_cnp_ignored` | A CNP that cut a rate, or one that did not | Handled ≈ sent towards it | Zero or ignored: DCQCN off, or CNPs in the wrong priority |
| PAUSE frames | Both ends of every link | switch PFC Tx/Rx per priority; `tx_prio3_pause`, `rx_prio3_pause` | A pause or refresh for priority 3 | Short bursts | Continuous; a ring pattern; any sent by a NIC |
| Pause duration | Both ends | `rx_prio3_pause_duration`, `tx_prio3_pause_duration` (µs) | Time the link was stopped | A few percent of wall clock | Near 100%: storm or deadlock |
| Watchdog | Switch | storm detected/restored, watchdog drops | A queue frozen past detection time | Zero | Any |
| Queue and buffer watermarks | Switch | queue and priority-group peak occupancy | Peak bytes since last read | Mostly below the ECN threshold | At XOFF often; headroom in use |
| Lossless drops | Switch queue, NIC | priority-3 egress discards; `rx_discards_phy`; `out_of_buffer` | A packet lost where none should be | Zero | Any: headroom too small, PFC on one side only, NIC overrun, receive queue empty |
| Out of sequence | Receiver NIC | `out_of_sequence` | A packet that arrived after a PSN gap | Near zero | Rising: loss somewhere on the path |
| Sequence-error NAKs | Sender NIC | `packet_seq_err` | A NAK received, so a go-back-N resend | Near zero | Rising with `out_of_sequence` |
| Retransmit timeouts | Sender NIC | `local_ack_timeout_err` | The ACK timer fired; resend from the last ACK | Zero | Any: tail loss or a stall long enough to look like loss |
| Duplicates | Receiver NIC | `duplicate_request` | A resent packet it had already accepted | Near zero | Rising: the sender resends more than was lost (go-back-N) |

Three rules for reading them. **Rates, not totals**: counters only grow, so plot the change per interval. **Duration over count**: one pause frame may stop a link for 1 ns or 84 µs, and only the duration counter says which. **Peaks over averages**: everything here happens in microseconds, so a sampled queue depth is near zero during a pause tree; watermarks (the maximum since the last read) and pause durations survive sampling.

Illustrative output from `rail1-leaf2` after the deadlock above, SONiC-style, priority 3 only, counters cleared after the first half's incast (`Ethernet256` faces `ai-spine1`):

```text
admin@rail1-leaf2.sjc:~$ show pfcwd stats            (illustrative)
          QUEUE   STATUS    STORM DETECTED/RESTORED   TX OK/DROP   RX OK/DROP
  Ethernet256:3   stormed                       1/0     0/18,422      0/3,906

admin@rail1-leaf2.sjc:~$ show pfc counters           (illustrative, PFC3 only)
       Port Rx      PFC3          Port Tx      PFC3
  Ethernet0           0     Ethernet0         8,840   (to srv65)
  Ethernet8           0     Ethernet8         9,113   (to srv66)
  Ethernet256   21,207     Ethernet256      20,996   (to ai-spine1)
```

The tell is the last line: one port sending and receiving pauses at the same high rate. A pause tree pauses each link in one direction only, towards the senders; pauses both ways on a link, or around a ring of links, mean a cycle.

## Two halves of the story

| | The switch knows | The NIC knows |
|---|---|---|
| Where | Which port and queue, which link was paused | Nothing about the path; its packets were hashed somewhere |
| What | Queue depth, marks applied, pauses sent and received, drops per queue, watchdog events | CE arrivals, CNPs sent and handled, PSN gaps, NAKs, timeouts, time spent paused, its own buffer drops |
| Whom | Ports and priorities, not jobs | Queue pairs, hence processes and jobs |
| Blind to | Whether a mark produced a CNP, whether a pause hurt anyone, what the host did | Which switch marked or paused, and why |

Joining them needs three mappings a platform must maintain: queue pair to process and job (from the host), host NIC to leaf port (from LLDP, the link-layer discovery protocol, in which each port announces its device and port name to the neighbour), and flow to path (the ECMP hash is not observable from outside, so probes with the flow's 5-tuple or in-band telemetry stand in, as in [ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)). Then each end of every link should agree: pauses transmitted at one end should roughly equal pauses received at the other, and the receiving end should actually stop. A port without PFC enabled for that priority may still count the pauses it receives but keeps sending, and the side that paused it overflows its headroom and drops: so compare PFC settings on both ends, not only counters.

Most rules below are joins neither side can make alone, run on three illustrative 10-second intervals and the opening slowdown:

```python
def diagnose(sw, rx, tx):
    """Counter deltas over one interval. sw: the switch port facing the
    receiver; rx / tx: the receiver's and the sender's NIC. Returns findings,
    most of which need both halves: one side's counters cannot produce them."""
    found = []
    if sw["pfcwd_storms"]:
        found.append("PFC watchdog fired: a queue stayed paused past its "
                     "detection time (storm or deadlock); its packets were dropped")
    if sw["rx_pause_p3"] and rx["tx_prio3_pause"]:
        found.append("slow receiver: the NIC itself is pausing the switch, so "
                     "the host is not draining it; look at PCIe, memory and "
                     "receive queues, not the fabric")
    if sw["ecn_marked"] and not rx["np_cnp_sent"]:
        found.append("switch marks CE but the receiver sends no CNPs: ECN or "
                     "congestion control is off on the receiving NIC")
    if rx["np_cnp_sent"] and not tx["rp_cnp_handled"]:
        found.append("CNPs sent but never handled: they are dropped or "
                     "mis-queued on the way back, or DCQCN is off at the sender")
    if rx["out_of_sequence"] and not sw["egress_drops_p3"]:
        found.append("receiver sees gaps but this lossless queue dropped "
                     "nothing: loss is elsewhere (another hop, the lossy class "
                     "after a DSCP mismark, or the NIC's own buffer)")
    if tx["local_ack_timeout_err"]:
        found.append("sender timed out waiting for ACKs: tail loss or a stall "
                     "long enough to look like one")
    return found or ["consistent: no cross-side contradiction"]


ZERO_SW = {"ecn_marked": 0, "egress_drops_p3": 0, "rx_pause_p3": 0, "pfcwd_storms": 0}
ZERO_NIC = {"np_cnp_sent": 0, "rp_cnp_handled": 0, "out_of_sequence": 0,
            "tx_prio3_pause": 0, "local_ack_timeout_err": 0}

cases = {
    "healthy DCQCN loop": (
        {**ZERO_SW, "ecn_marked": 48_000},
        {**ZERO_NIC, "np_cnp_sent": 3_100},
        {**ZERO_NIC, "rp_cnp_handled": 3_100}),
    "the AI team sees latency the network does not": (
        {**ZERO_SW, "rx_pause_p3": 91_000},
        {**ZERO_NIC, "tx_prio3_pause": 91_000},
        dict(ZERO_NIC)),
    "CNPs lost on the way back": (
        {**ZERO_SW, "ecn_marked": 52_000},
        {**ZERO_NIC, "np_cnp_sent": 3_400},
        dict(ZERO_NIC)),
    "RoCE marked into the lossy class": (
        dict(ZERO_SW),
        {**ZERO_NIC, "out_of_sequence": 950},
        {**ZERO_NIC, "local_ack_timeout_err": 3}),
}
for name, (sw, rx, tx) in cases.items():
    print(name)
    for line in diagnose(sw, rx, tx):
        print("  -", line)
```

```text
healthy DCQCN loop
  - consistent: no cross-side contradiction
the AI team sees latency the network does not
  - slow receiver: the NIC itself is pausing the switch, so the host is not draining it; look at PCIe, memory and receive queues, not the fabric
CNPs lost on the way back
  - CNPs sent but never handled: they are dropped or mis-queued on the way back, or DCQCN is off at the sender
RoCE marked into the lossy class
  - receiver sees gaps but this lossless queue dropped nothing: loss is elsewhere (another hop, the lossy class after a DSCP mismark, or the NIC's own buffer)
  - sender timed out waiting for ACKs: tail loss or a stall long enough to look like one
```

The second case is the opening ticket. Drops, errors and utilisation were clean, and pause counters on a few leaf and spine ports pointed nowhere, until someone read the leaf port facing `srv3`: 91,000 pauses *received* in ten seconds, a line nobody graphed, matched by `srv3`'s NIC's `tx_prio3_pause`. The host was the root of the pause tree: its NIC sat in a PCIe slot under the wrong CPU socket. Neither team could have found it from its own data alone.

## Failure modes in production

**PFC configured on one side of a link only.** *Symptom:* drops in the "lossless" class at one NIC or switch port, with go-back-N resends. *Diagnosis:* pauses transmitted at one end and ignored at the other; per-priority drops on the side that sent them. *Fix:* make PFC and the priority mapping part of the intended configuration, checked on both ends, so a diff flags the mismatch ([network automation and source of truth](/learn/fabric-networking/operating-fabrics/network-automation-and-source-of-truth)).

**DSCP mismark: RoCE in the lossy queue.** *Symptom:* a job's RDMA traffic shows `out_of_sequence` and timeouts while the lossless queue has zero drops. *Diagnosis:* per-class byte counters on the leaf show the job's traffic counted in the default class; a capture shows DSCP 0 instead of the lossless value (26 at Meridian). *Fix:* correct the NIC's or the application's traffic-class setting, and alert when RoCE bytes (UDP 4791) appear in a lossy class.

**ECN thresholds above XOFF.** *Symptom:* pause counters climb continuously under ordinary load and ECN marks are near zero. *Diagnosis:* queue watermarks reach XOFF before the marking threshold; PFC is doing all the work, so spreading is constant. *Fix:* set ECN to start marking well below XOFF, so DCQCN acts first and PFC is the backstop ([lossless Ethernet](/learn/fabric-networking/ai-fabrics/lossless-ethernet-pfc-ecn-dcqcn)).

**A deadlock after a failure, with no failure left to see.** *Symptom:* lossless traffic through one link stops while the link, optics and routing sessions are healthy; the watchdog fires 200 ms later. *Diagnosis:* pauses in both directions on that link, seconds after a link failure or routing change elsewhere. *Fix:* remove valleys from the underlay (one AS for all spines under eBGP, or checks that refuse to install valley paths for lossless traffic), never flood lossless packets, and keep the watchdog as the backstop.

## Trade-offs: ways to live with congestion in an RDMA fabric

| Approach | Drops in the RDMA class | Spreading and head-of-line blocking | Deadlock risk | What you must tune | Where it is used |
|---|---|---|---|---|---|
| PFC alone | None, until the watchdog | Severe: every burst builds a pause tree | Yes, on any cycle | Headroom and XOFF on every port | Early RoCE deployments |
| PFC with ECN and DCQCN | Rare | Limited if ECN acts first | Yes, if valleys exist | ECN thresholds, NIC rate parameters, headroom | Most RoCE AI fabrics today |
| Lossy RoCE with selective retransmission | Some, recovered cheaply | None from PFC | None from PFC | NIC support and congestion control only | Newer NICs; Ultra Ethernet's direction |
| InfiniBand credits | None | Credit back-pressure spreads in the same way | Possible; the subnet manager's routing avoids cycles (up/down, or engines that separate paths onto virtual lanes) | Mostly the subnet manager's choices | InfiniBand clusters |
| Adaptive routing plus telemetry-driven congestion control | Rare | Lower: bursts spread over all spines | As PFC, if PFC is on | Vendor-specific; NIC and switch must match | NVIDIA Spectrum-X style fabrics ([AI fabric topologies](/learn/fabric-networking/ai-fabrics/ai-fabric-topologies)) |

The trend is away from relying on PFC: keep it as insurance, make it rarely fire, and move loss recovery into NICs good enough that a drop costs one packet, not a window.

## What the platform should show

- **Pause trees, drawn.** From every port with high pause-transmit duration, follow pauses link by link to the root port with the deep queue, and show the tree with the jobs whose traffic crosses it: the walk an engineer otherwise does by hand.
- **Rings flagged.** Pauses both ways on a link, or around a loop of links, raised as a probable deadlock before the watchdog fires.
- **Watchdog events as incidents,** each with the queue, the neighbour and the routing or link events of the preceding seconds.
- **Both halves on one timeline.** Switch marks, pauses and watermarks beside NIC CNPs, PSN gaps, NAKs, timeouts and pause durations, joined through LLDP and the queue-pair-to-job map, so a slow job resolves to a port or a host.
- **Link-end consistency and class hygiene.** Pauses sent at one end against pauses received at the other; PFC settings compared on both ends; RoCE bytes in any lossy class, lossless drops anywhere, NICs that transmit pauses at all.
- **Peaks, not averages.** 1-second gNMI sampling is enough for watermarks and duration counters, because a watermark holds the peak since the last read and a duration counter integrates what happened between samples ([telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability)).
- **Pre-change cycle checks.** For each planned drain or likely single failure, compute the buffer dependency graph and reject changes that open a valley for lossless traffic.

## Interviewer follow-ups

**"A RoCE job is slow, and switch dashboards show no drops. Where do you look?"** Model answer: scope first, one job or many, one rail or all. A lossless fabric slows by pausing, so I read pause durations and queue watermarks on the job's ports and follow pauses to the root; then the hosts: CNPs, `out_of_sequence`, timeouts, and any NIC transmitting pauses. Common wrong answer: "no drops, so not the network". Where it is honest to defer: exact buffer thresholds on a given chip belong to the network team; what I would build is the pause-tree view and the host-switch join.

**"How can a fabric deadlock with no routing loop in the steady state?"** Model answer: deadlock needs a cyclic buffer dependency, which up-down routing on a Clos cannot form. A convergence micro-loop, a valley detour after a failure, or flooded lossless packets create down-up turns, and once the cycle's buffers are full they stay full after routing heals: the packets never move, and TTL falls only on forwarding. Common wrong answer: "TTL will expire them".

**"Why not set the PFC watchdog to 1 ms?"** Model answer: a large legitimate burst can hold an upstream queue paused for a millisecond or more (the 63:1 incast in this lesson lasts 1.26 ms), so a 1 ms timer would declare storms during normal work and drop in the lossless class, turning PFC into an expensive lossy fabric. Detection times of 100 to 200 ms separate frozen from busy. Common wrong answer: "shorter is always safer".

**"Doesn't DCQCN prevent incast?"** Model answer: it reacts in round trips plus CNP spacing, while a 63:1 burst fills a 2 MB queue in under a microsecond; DCQCN tames long transfers and PFC carries the start. Incast is mostly fixed in the communication pattern and the transport. Common wrong answer: "yes, ECN marks before the queue fills".

## What mid-level engineers get wrong

- **Equating "no drops" with "healthy".** In a lossless class trouble shows as pause duration, so a drops-only dashboard stays green through a 4× slowdown.
- **Graphing pauses transmitted only.** The pause received from a NIC is the one that finds a slow host.
- **Blaming the switch that fired the watchdog.** It is the place the deadlock was broken, not where it was caused; look for the routing change seconds earlier.

## Senior signals

- You explain PFC failures from one fact: a pause names a priority on a link, never a flow, so blocking spreads to whoever shares the queue.
- You map deadlock to the four conditions, and say up-down routing is lock ordering and the watchdog is preemption.
- You treat valley paths as a lossless-fabric hazard, and prefer an underlay that drops over one that detours.
- You do incast arithmetic out loud: queue growth per microsecond against the feedback loop's reaction time.
- You read pause durations, watermarks and NIC counters, not averages, on both ends of every link.
- You design the join of host and switch telemetry as the core of the tool, because in RoCE the host is part of the network.

## Check yourself

```quiz
- q: >-
    rail1-leaf1 pauses ai-spine1 on priority 3 because srv3's port is congested. Why does srv66's flow to the idle srv5, which arrives over that link, stop as well?
  options: ["The PAUSE carries srv3's address, and srv66 shares its subnet", "srv5's egress queue fills with srv3's packets and blocks srv5", "ai-spine1 reroutes srv66's flow through the congested srv3 port", "The PAUSE names a priority on the link, so every flow in it stops"]
  answer: 3
  explanation: >-
    A PFC frame has a class-enable vector and eight timers and nothing else: no flow, no destination. ai-spine1 must stop sending all priority-3 traffic on that link, so srv66's packets wait behind srv3's. Inside rail1-leaf1 the egress queues are separate per port, so srv5's queue is empty; the blocking happens one hop earlier, on the paused link. No rerouting happens and the frame carries no address.
- q: >-
    After a link failure, IS-IS on a spine converges onto a path that goes down through a leaf and back up through another spine. Why does that matter on a lossless fabric when it would be harmless on a lossy one?
  options: ["Valley paths cannot use ECN, so DCQCN stops working on them", "Valley paths add hops, and the extra TTL decrements expire packets", "The down-up turn makes a cyclic buffer dependency possible under PFC", "The second spine rejects packets it did not expect from a leaf"]
  answer: 2
  explanation: >-
    In up-down routing every buffer waits only for buffers in a higher tier, so no cycle can form. A down-up turn adds dependencies that can close a cycle, and with PFC a full cycle never drains: a deadlock. On a lossy fabric full buffers drop instead, so the same path is only slower. Two extra hops will not exhaust a TTL of 64, and ECN marking works on any path.
- q: >-
    A switch port shows PFC pauses transmitted and received at the same high rate on priority 3, the link has no errors, and the watchdog fires 200 ms later. What is the most likely cause?
  options: ["A deadlock from a cyclic dependency through that link", "Ordinary incast at the server ports behind that switch", "ECN thresholds set too low on that switch's queues", "A dirty optic corrupting pause frames on that link"]
  answer: 0
  explanation: >-
    In a pause tree a link is paused in one direction, from the congested side towards the senders. Pauses flowing both ways at once mean each end is waiting for the other, a cycle, and a queue frozen for 200 ms is what the watchdog detects. Ordinary incast pauses and resumes often and does not trip the watchdog. A dirty optic shows CRC errors, and low ECN thresholds reduce pausing.
- q: >-
    63 servers each send 1 MB at 400 Gb/s to one server on the same leaf. Why can't DCQCN prevent the queue from overflowing at the start of the burst?
  options: ["DCQCN works only for flows crossing a spine, not within a leaf", "ECN marks are applied only after PFC has already paused the senders", "The queue grows 3.1 MB per µs, faster than a mark and CNP round trip", "DCQCN reacts only to drops, and a lossless queue never drops"]
  answer: 2
  explanation: >-
    62 excess senders at 50 KB per µs each fill a 2 MB queue in about 0.65 µs, while the first mark must reach the receiver and its CNP come back before any sender slows, and each cut is at most half the rate. DCQCN converges over hundreds of microseconds, so PFC must carry the start. DCQCN works within one leaf, reacts to ECN marks rather than drops, and marking happens below XOFF.
- q: >-
    A training job slows down. Switch counters show no drops and no errors. The leaf port facing one server shows many pauses received, and that server's NIC shows tx_prio3_pause rising. What does this point to?
  options: ["A congested spine pausing the leaf from above", "A deadlock between the leaf and that server's NIC", "Misconfigured ECN marking on the leaf's egress port", "A host that cannot drain its NIC, which pauses the fabric"]
  answer: 3
  explanation: >-
    A NIC that transmits pauses is a receiver whose buffer is filling because the host (PCIe placement, memory, receive queues) cannot take data at line rate: a slow receiver, and the root of a pause tree. A congested spine would show pauses transmitted by the spine and a deep queue there. A deadlock needs a cycle between buffers that forward to each other, and a server does not forward. Misconfigured ECN shows as marks without CNPs, or as constant pausing at switch queues, not as pauses sent by a NIC.
```
