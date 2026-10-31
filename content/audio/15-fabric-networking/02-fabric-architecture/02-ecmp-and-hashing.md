---
lesson: ecmp-and-hashing
source: 33c1c2377a3b5ad2
fit: great
desk:
  - "The ECMP hash visualisation and its five-flow hash trace table"
  - "The elephant collision and polarisation visualisation, and the collision probability table"
  - "The CRC-32 model of modulo versus a bucket table, and the modulo hand trace"
  - "The tunnel entropy table and the outer UDP header field by field"
  - "The gray failure visualisation"
  - "The failure modes and trade-offs tables, and the ECMP findings checker"
  - "Exercise: ECMP uplink choice from a seeded hash"
  - "Practice problem: top k flows"
---
## Introduction

Leaf1 in Meridian's Amsterdam fabric has four uplinks, one to each spine, and each is an equally good way to reach leaf3. Every packet must leave on exactly one. Choose badly and one uplink is full while the others idle, or the packets of one TCP connection take different paths and arrive out of order. And a switch forwarding billions of packets a second has no time to ask anyone or measure anything.

The industry's answer is equal-cost multipath, ECMP, with a hash: read a few header fields that are the same for every packet of a connection, hash them, and use the number to pick an uplink.

That one decision explains why two connections between the same servers run at different speeds, why one backup can hurt every web request on its link, why a tunnel can collapse a fabric onto one spine, and why a dirty optic makes a quarter of requests slow while every dashboard shows green.

## Hashing the five-tuple

Every path from leaf1 to leaf3 has the same length: up to a spine, down to leaf3. IS-IS gives every fabric link the same metric, finds four paths of equal cost, and installs all four. In the forwarding chip, that route points at an ECMP group: a small list of members, numbered 0 to 3.

The chip must pick a member for every packet, and the two obvious designs fail. Round robin per packet balances bytes perfectly, but the paths have different queue depths, so packets of one connection overtake each other. Duplicate acknowledgements make the sender assume loss, retransmit and cut its window, and healthy connections slow as if packets were dropped. Pinning each connection in a table needs state for millions of flows, written at line rate, on every switch.

Hashing is the stateless middle. A flow is the set of packets sharing one five-tuple: source and destination address, protocol, source and destination port. Hash those five values, with a CRC-style hardware hash and a per-device seed, take the result modulo the number of members, and a connection always lands on the same member without anyone remembering it.

The smallest example: two connections from acme-web1 to acme-db1 differ only in source port, 51517 and 51518. In the lesson's trace they land on spine4 and spine3. One changed digit, an unrelated uplink. And five flows on four uplinks split one, one, one and two. Hashing is even only on average: over ten thousand flows, each spine got within 3 percent of a quarter.

Two edge cases matter. A ping has no ports, so every ping between two hosts takes one path. A clean ping proves one path of four is healthy, which is why "ping is fine but the application is slow" is the classic signature of a sick ECMP member. And a Linux router hashes on addresses only by default, so unless someone changes its multipath hash policy, every connection between two servers rides one path.

So: ECMP uses every equal path at once with no state and no reordering inside a flow. But it balances flows, not bytes, and it never looks at load.

## Elephants, mice and flowlets

Data center traffic is mostly mice: short flows of a few kilobytes, such as RPCs and DNS lookups. A few elephants carry most of the bytes: backups, replication, shuffles, and in GPU clusters the gradient exchanges of training. Hashing treats a 60 gigabit backup and a 2 kilobyte request as one flow each. Thousands of mice average out. A handful of elephants do not.

Before I tell you: four elephants hashed onto four spines. How often do at least two collide?

[pause]

Nine times in ten. It is the birthday problem. Even two elephants on four uplinks collide a quarter of the time. That is why an AI cluster, whose training traffic is a few huge flows, cannot rely on plain ECMP.

Picture it with two 100 gigabit uplinks, each carrying about 10 gigabits of mice. Two 60 gigabit backups both hash to spine1: 130 gigabits offered to 100. TCP backs them off to about 45 each, while spine2's uplink carries 10. The mice suffer too: every request on that uplink waits behind a full queue. A one megabyte queue takes 80 microseconds to drain at 100 gigabits, against a few microseconds through an empty fabric.

A new seed reshuffles which flows collide, not whether they do. Real fixes change the unit being balanced. The application can split a transfer into parallel connections. A central scheduler can move detected elephants, though it reacts in hundreds of milliseconds to seconds, after many have finished. Or the fabric can balance pieces smaller than a flow.

Those pieces are flowlets. TCP sends in bursts, then pauses for acknowledgements. If the pause is longer than the delay difference between two paths, the next burst can switch path without overtaking the last one. Trace it: one uplink with 40 microseconds of delay, one with 10, a gap threshold of 100. Twenty packets go on the slow uplink; the last arrives at 240 microseconds. The flow pauses until 350, a gap of 150, so packet 21 goes on the fast uplink and arrives at 360. In order. With a gap of only 20, packet 21 would have arrived at 230, before packet 20. So the threshold must exceed the largest delay difference; real implementations use tens to hundreds of microseconds.

Adaptive routing goes further: pick the uplink per packet by queue depth, and let the receiver reorder. InfiniBand does it, and NVIDIA Spectrum-X does it on Ethernet with NICs that place each RDMA packet at its final memory address. Aimed at an ordinary TCP stack, it brings back the reordering that per-flow hashing exists to avoid. The AI fabric topologies lesson goes deeper.

## Polarisation and tunnels

Two more failures share a root: the hash sees the same thing twice, or sees too little.

Polarisation is a hash defeating itself across two decisions in a row: say a spine choosing between two border gateways after a leaf chose the spine. Leaf1 hashes a flow with seed 0, the hash is even, so it goes to spine1. Spine1 has the same chip and the same factory seed, gets the same number, takes it modulo 2: even, so gateway 1. Every flow that reached spine1 was even, so all of them go to gateway 1, and all of spine2's go to gateway 2. Two links carry nothing. With four members at both tiers, three quarters of that tier sits idle while every link is up and every route correct. The fix is to make the tiers disagree, with a per-device seed derived for example from the loopback. The signal is an imbalance that never moves.

Tunnels starve the hash differently. Tenant traffic crosses Meridian's spines inside VXLAN, and the spines read only the outer headers, from leaf1's VTEP to leaf3's. If every tunnelled packet had the same outer five-tuple, every Acme, Globex and storage flow between those leaves would ride one spine. In the lesson's run, outer port 4789 to 4789 sends every flow to spine4.

VXLAN avoids that by design. The standard recommends the VTEP hash the inner headers and write the result into the outer UDP source port, between 49152 and 65535. Flow A gets 54043, flow B 56774, and the spines spread them again. Each flow keeps one port, so order is kept.

Every tunnel needs an answer. GENEVE uses the same convention. RoCE version 2 uses its UDP source port, usually derived from the queue pair, so more queue pairs give more entropy. MPLS has an entropy label, IPv6 its flow label. GRE and IPsec offer nothing beyond addresses: one tunnel is one flow. Watch for a software VTEP or NIC offload that sets a constant port. The signal: imbalance only for tunnelled traffic, and very few distinct outer source ports between a pair of VTEPs.

## When a spine dies

Spine3 dies. With plain hash modulo N, the divisor goes from 4 to 3. What happens to flows on the three healthy spines?

[pause]

About two thirds of them move anyway. In the hand trace, six of nine healthy flows moved for no reason, and the simulation measured the same 67 percent.

Resilient hashing keeps the indirection fixed. The hash indexes a table of buckets, each naming a member: eight buckets, spines 1 to 4 twice over. When spine3 fails, only its two buckets are rewritten, to spine1 and spine2, and every other flow keeps its spine. It is consistent hashing as an array, like Maglev. The costs: buckets rarely divide evenly, so 64 buckets over three survivors gives 22, 21 and 21. And when the spine returns, some buckets move back, disrupting those flows. Linux has had resilient next-hop groups since kernel 5.13.

A routed TCP flow that changes spine barely notices. It matters when members hold state, as in anycast load balancing: a pool of balancers or firewalls announces one address by BGP, and routers spread flows across them. If one of four dies and the routers rehash modulo N, two thirds of connections on the healthy boxes arrive somewhere that has never seen them, and get reset. Resilient hashing limits the damage to the dead member's connections. The signal: resets on healthy members at the moment the group changes.

## Gray failures

A gray failure is neither working nor down: the system's own failure detector thinks the component is fine, while its users see it failing.

Here is the lesson's story. Leaf1 sends about a terabit a second over four 400 gigabit uplinks. Over five weeks, receive power at spine3's port facing leaf1 falls from minus 1.8 to minus 6.8 dBm. Errors outrun forward error correction, and about 2 percent of frames fail their frame check. But light, neighbour discovery, IS-IS and BFD keep the link up, so routing keeps it in the group, with a quarter of the flows.

The arithmetic. One member in four loses 2 percent, so loss across the group is half a percent, invisible on a dashboard of averages. But a quarter of flows lose 2 percent, and a loss-limited TCP flow's throughput scales with one over the square root of the loss rate. Going from a hundredth of a percent to 2 percent cuts its ceiling about fourteen times. Users report "one request in four is slow".

Routing misses it because hellos and keepalives are small, so errors rarely hit them, and BFD needs three consecutive misses: at 2 percent loss, about eight in a million per window. Other causes give the same shape: a spine whose hardware table missed an entry, an MTU mismatch on one member that kills only big packets, or a line card dropping only packets whose hash hits certain buckets.

The signals: receive-side frame check errors read from the far end, because a sender never learns its frames were discarded, and probes with many different five-tuples, grouped by the member each crossed. Then cost the member out, if the other three have headroom: here they end up at 83 percent.

That is the platform's job. Per-member utilisation, because a leaf at 40 percent can have one uplink at 98. Group width against intent, because three members where four belong is a silent 25 percent loss. Errors attached to links, top flows on a hot member, distinct outer ports per VTEP pair, membership changes as events.

## In the interview

Why does ECMP hash per flow and not per packet?

[pause]

Per-packet spreading reorders TCP segments, duplicate acknowledgements cause spurious retransmissions and a smaller window, and healthy connections slow as if packets were lost. Hashing invariant fields keeps each flow on one path with no state, at the price of balancing flows, not bytes. The wrong answer is "the switch can't track packets": the constraint is the receiver's ordering, and adaptive routing does go per packet when the NIC can reorder.

And: one request in four is slow, the dashboard is green. One in N, with N the spine count, suggests one degraded member still up. Scope first, then per-member receive errors, then probes with varied five-tuples grouped by spine. A single ping proves little. You can defer to the network team on optic thresholds, but you would build the per-member view.

## Recap

Five things to remember. ECMP hashes the five-tuple so each flow keeps one path with no state; it balances flows, not bytes, and never looks at load. Four elephants on four links collide nine times in ten, and reseeding only reshuffles; parallel connections, flowlets and adaptive routing change the unit. Identical hashes at consecutive tiers polarise, and tunnels need entropy in the outer source port. Plain modulo moves two thirds of healthy flows when a member dies; resilient buckets move only the dead member's. And one sick member that stays up makes one request in N slow: find it with per-member counters and hash-spread probes, not ping.

At your desk: the hash trace and its visualisation, the collision and polarisation visualisation with the probability table, the modulo versus bucket code, the tunnel entropy table, the gray failure visualisation, the failure and trade-off tables with the findings checker, the ECMP uplink exercise, and the top k flows problem.
