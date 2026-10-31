---
slug: ecmp-and-hashing
title: "ECMP and hashing: how a fabric spreads flows, and how it fails to"
description: How a leaf spreads traffic over equal-cost uplinks by hashing each flow's 5-tuple, traced with real numbers; why elephant flows collide and hashes polarise across tiers; resilient hashing when a member fails; flowlets and adaptive routing; entropy in a tunnel's outer UDP source port; and the gray failures that silently eat one ECMP member's share of traffic.
minutes: 50
difficulty: medium
tags: [fabric-networking, ecmp, hashing, load-balancing, elephant-flows, hash-polarisation, resilient-hashing, flowlets, vxlan, gray-failure]
problems: [top-k-flows]
---
`leaf1.ams` has four uplinks, one to each Amsterdam spine, and each is an equally good way to reach `leaf3.ams`. Every packet has to leave on exactly one of them. Choose badly and one uplink is full while the others idle, or the packets of a single TCP connection take different paths and arrive out of order. A switch forwarding billions of packets a second also has no time to ask a central brain or to measure anything. The answer the industry settled on is equal-cost multipath (ECMP) with a hash: read a few header fields that are the same for every packet of a connection, hash them, and use the number to pick an uplink.

That one decision explains why two connections between the same servers run at different speeds, why one backup can hurt every web request on its link, why a tunnel can collapse a fabric onto one spine, and why a dirty optic makes "a quarter of requests slow" while every dashboard shows green.

## Equal-cost multipath: what the forwarding table holds

In a leaf-spine Clos ([Clos and leaf-spine](/learn/fabric-networking/fabric-architecture/clos-and-leaf-spine)), every leaf connects to every spine, so traffic from one leaf to another can cross any spine, and every such path has the same length: leaf, spine, leaf. The underlay routing protocol (IS-IS at Meridian) gives every fabric link the same metric, so it computes four paths of equal cost from `leaf1.ams` to `leaf3.ams`'s loopback and, instead of picking one, installs all four. Illustrative output:

```text
leaf1.ams# show ip route 10.255.1.13          (illustrative)
10.255.1.13/32  IS-IS level-2, metric 20, 4 equal-cost next hops
    via 10.254.1.0, swp51 (spine1.ams)
    via 10.254.2.0, swp52 (spine2.ams)
    via 10.254.3.0, swp53 (spine3.ams)
    via 10.254.4.0, swp54 (spine4.ams)
```

The metric is 20: 10 for the hop up to a spine plus 10 for the hop down. In the forwarding table (the FIB, built in [the routing table](/learn/fabric-networking/from-zero/the-routing-table)) this route does not point at one next hop but at an **ECMP group**, a small list of members numbered 0 to 3. A BGP underlay reaches the same state once BGP is allowed to install several equal paths ("multipath"), which every [BGP-only fabric](/learn/fabric-networking/underlay/bgp-as-the-underlay) turns on. The [routing algorithms lesson](/learn/networking/network-algorithms/routing-algorithms) shows how Dijkstra produces the tie; this lesson is about what the hardware does with it.

The forwarding chip (the ASIC, application-specific integrated circuit) must choose a member for every packet, and two obvious designs both fail:

- **Round robin per packet** balances bytes perfectly, but the four paths have different queue depths at every instant, so packets of one TCP connection overtake each other. A TCP receiver answers an out-of-order segment with a duplicate acknowledgement; under the classic rule three duplicates make the sender assume loss, retransmit and cut its congestion window (fast retransmit, RFC 5681). Modern stacks (Linux's RACK, RFC 8985) tolerate some reordering, but constant spraying still triggers spurious retransmissions, so healthy connections slow as if packets were being dropped.
- **Pin each connection with a table** ("flow X uses uplink 2") needs per-flow state for millions of flows, written at line rate, on every switch.

ECMP hashing is the stateless middle: compute the uplink from fields that every packet of a connection shares, so the same connection always lands on the same member without anyone remembering it.

- **Solves:** uses every equal path at once with no per-flow state and no reordering inside a flow.
- **Breaks:** it balances *flows*, not bytes, and it never looks at load; a sick member keeps receiving its full share.
- **Signal:** per-member utilisation of each ECMP group; a group with fewer members than the topology says it should have.

## Hashing the 5-tuple

A **flow** is the set of packets that share one **5-tuple**: source IP, destination IP, IP protocol (6 for TCP, 17 for UDP), source port and destination port ([transport as the network sees it](/learn/fabric-networking/from-zero/transport-as-the-network-sees-it)). Every packet of one TCP connection carries the same five values; a second connection between the same two servers has a different source port, so it is a different flow.

The ASIC handles each packet in three steps:

1. **Select fields.** The default is the 5-tuple. Platforms let you add or remove fields: the ingress port, the VLAN, the IPv6 flow label, inner headers of a tunnel.
2. **Hash.** Switch chips use CRC-style hardware hashes (CRC-16 or CRC-32 variants, often several to choose from), mixed with a **seed**, a per-device number that changes the output without changing the function. A hash is deterministic: the same five values always give the same number.
3. **Map to a member.** Conceptually `member = hash mod N` for N members. Real chips index a table of buckets with some of the hash bits and store a member in each bucket, which is what makes resilient hashing possible (below).

The visualisation runs this on `leaf1.ams` with five Acme flows. Its hash is FNV-1a with a finishing mix, a stand-in for a vendor's: real numbers differ, the behaviour does not.

```viz
{"type": "fabric", "scenario": "ecmp-hash", "title": "ECMP on leaf1.ams: hash the 5-tuple, take it modulo 4, pick a spine; then a tunnel's outer source port", "caption": "Five Acme flows hashed onto four uplinks: flows A and B differ only in source port (51517 and 51518) yet land on spine4 and spine3, and the five end up 1/1/1/2. Then A and B inside VXLAN between VTEPs 10.255.1.11 and 10.255.1.13: with one fixed outer source port both hash to spine4; with the port derived from the inner hash (54043 and 56774) they take spine1 and spine4 again."}
```

The trace by hand, using the visualisation's numbers:

| Flow | 5-tuple | Hash | Low two bits (mod 4) | Uplink |
|---|---|---|---|---|
| A | 10.1.1.10:51517 → 10.1.2.20:5432, TCP | 0xb6af131b | 0x1b = 27, 27 mod 4 = 3 | spine4.ams |
| B | 10.1.1.10:51518 → 10.1.2.20:5432, TCP | 0x151fddc6 | 0xc6 = 198, 198 mod 4 = 2 | spine3.ams |
| C | 10.1.1.12:43005 → 10.1.2.21:443, TCP | 0x74d3ff68 | 0 | spine1.ams |
| D | 10.1.1.13:38203 → 10.1.2.20:5432, TCP | 0x1d3c94a3 | 3 | spine4.ams |
| E | 10.1.1.10:55000 → 10.1.2.22:53, UDP | 0x28ddcffd | 1 | spine2.ams |

With four members, `mod 4` is the hash's lowest two bits, so it is a mask, not a division. One changed port moves a flow to an unrelated uplink, and five flows on four uplinks split 1/1/1/2: hashing is even only on average, over many flows.

### What gets hashed, and the edge cases

- **Packets without ports.** ICMP has no ports, so a ping between two hosts hashes on three fields and every ping between them takes one path. A clean ping proves one path of four is healthy, which is why "ping is fine but the application is slow" is the classic signature of a sick ECMP member.
- **Fragments.** Only the first fragment of a fragmented IP packet carries the TCP or UDP header. Hashing the ports would send the first fragment one way and the rest another, so platforms hash fragments on addresses only.
- **Symmetric hashing.** By default the reply direction, with source and destination swapped, hashes to an unrelated path. That is harmless for routers but breaks a pair of stateful firewalls that each see only half of a connection. A symmetric hash sorts the two addresses (and ports) before hashing so both directions agree.
- **Linux does it too.** A Linux host or software router with a multipath route hashes by `net.ipv4.fib_multipath_hash_policy`: 0, the default, uses only source and destination address; 1 adds protocol and ports (IPv6 has its own sysctl, whose default also hashes the flow label). A Linux router left at 0 puts every connection between two servers on one path.

## The hash in code: modulo versus a bucket table

The model below uses CRC-32 (`zlib.crc32`, seeded) as many ASICs do, hashes 10,000 random Acme flows over the four spines, then fails `spine3.ams` two ways: recomputing `hash mod 3`, and a fixed table of 64 buckets where only the dead member's buckets are reassigned.

```python
import random
import zlib
from collections import Counter

SPINES = ["spine1.ams", "spine2.ams", "spine3.ams", "spine4.ams"]


def flow_hash(flow, seed=0):
    src, dst, proto, sport, dport = flow
    key = f"{src}|{dst}|{proto}|{sport}|{dport}".encode()
    return zlib.crc32(key, seed)          # CRC-32 with a seed, as many ASICs do


def modulo_pick(flow, members):
    return members[flow_hash(flow) % len(members)]


class ResilientGroup:
    """ECMP group as a fixed table of buckets, each bucket owned by one member."""

    def __init__(self, members, n_buckets=64):
        self.buckets = [members[i % len(members)] for i in range(n_buckets)]

    def pick(self, flow):
        return self.buckets[flow_hash(flow) % len(self.buckets)]

    def remove(self, dead):
        alive = sorted(set(self.buckets) - {dead})
        k = 0
        for i, owner in enumerate(self.buckets):
            if owner == dead:                 # only the dead member's buckets change
                self.buckets[i] = alive[k % len(alive)]
                k += 1


rng = random.Random(7)
flows = [(f"10.1.1.{rng.randint(10, 250)}", f"10.1.2.{rng.randint(10, 250)}", 6,
          rng.randint(32768, 60999), rng.choice([443, 5432, 8080]))
         for _ in range(10_000)]

before = {f: modulo_pick(f, SPINES) for f in flows}
print("flows per spine:", dict(sorted(Counter(before.values()).items())))

flow_a = ("10.1.1.10", "10.1.2.20", 6, 51517, 5432)
flow_b = ("10.1.1.10", "10.1.2.20", 6, 51518, 5432)
for name, f in (("A", flow_a), ("B", flow_b)):
    h = flow_hash(f)
    print(f"flow {name}: crc32=0x{h:08x}  mod 4 = {h % 4}  -> {SPINES[h % 4]}")

# spine3.ams fails: what happens to flows that were NOT on spine3?
survivors = [s for s in SPINES if s != "spine3.ams"]
innocent = [f for f in flows if before[f] != "spine3.ams"]
moved = sum(modulo_pick(f, survivors) != before[f] for f in innocent)
print(f"modulo-N:  {moved / len(innocent):.0%} of flows on healthy spines moved")

group = ResilientGroup(SPINES)
rb = {f: group.pick(f) for f in flows}
group.remove("spine3.ams")
moved = sum(group.pick(f) != rb[f] for f in flows if rb[f] != "spine3.ams")
print(f"resilient: {moved / len(innocent):.0%} of flows on healthy spines moved")
print("buckets after:", Counter(group.buckets))
```

```text
flows per spine: {'spine1.ams': 2496, 'spine2.ams': 2540, 'spine3.ams': 2436, 'spine4.ams': 2528}
flow A: crc32=0x243c5a32  mod 4 = 2  -> spine3.ams
flow B: crc32=0xd56ae8e7  mod 4 = 3  -> spine4.ams
modulo-N:  67% of flows on healthy spines moved
resilient: 0% of flows on healthy spines moved
buckets after: Counter({'spine1.ams': 22, 'spine2.ams': 21, 'spine4.ams': 21})
```

Over 10,000 flows each spine gets within 3% of a quarter. Flows A and B land on different spines than in the visualisation because CRC-32 and FNV-1a are different functions: two vendors' switches can disagree about a flow's path and both be right. The last line shows a cost of bucket tables: 64 buckets cannot split evenly over three members, so one survivor carries 22/64 = 34% instead of 33.3%; more buckets shrink the error at the price of table memory.

## Elephants and mice

Data center traffic is mostly **mice**: short flows of a few kilobytes, such as RPCs, web requests and DNS lookups, that live for microseconds to milliseconds. A small number of **elephants** carry most of the bytes: backups, storage replication, data shuffles, and in GPU clusters the gradient exchanges of a training job. Production measurements (Microsoft's VL2 paper, 2009; Benson and colleagues, 2010) found most flows small and most bytes in a few large ones; Facebook's 2015 study found the mix varies strongly by service, so how skewed a fabric is depends on what runs on it.

Hashing treats a 60 Gb/s backup and a 2 KB request as one flow each. With thousands of mice the randomness averages out; with a handful of elephants it does not. The probability that k elephants hashed onto n uplinks all land on different links is n!/((n−k)!·nᵏ), so the chance of at least one collision is:

| Uplinks n | 2 elephants | 3 elephants | 4 elephants | 8 elephants |
|---|---|---|---|---|
| 2 | 50% | 100% | 100% | 100% |
| 4 | 25% | 62.5% | 90.6% | 100% |
| 8 | 12.5% | 34.4% | 59.0% | 99.8% |
| 16 | 6.25% | 18.0% | 33.3% | 87.9% |

Four elephants on four spines collide nine times in ten. This is the birthday problem, and it is why an AI cluster, whose training traffic is a few very large flows with little entropy, cannot rely on plain ECMP ([why AI traffic is different](/learn/fabric-networking/ai-fabrics/why-ai-traffic-is-different)).

A collision hurts more than the two elephants. They fill the uplink's egress queue, and every mouse that hashed onto that uplink now waits behind it: a 1 MB queue drains in 80 µs at 100 Gb/s (8 million bits divided by 100 billion bits a second), against a few microseconds through an empty fabric, so RPC tail latency on that one uplink jumps while the leaf's other uplinks are quiet.

```viz
{"type": "fabric", "scenario": "elephant-collision", "title": "Two elephants hash onto one uplink while the other idles; then the same hash polarises two tiers", "caption": "A small example with two spines and two 100G uplinks. Mice put about 10 Gb/s on each; two 60 Gb/s NFS backups both hash to spine1 (130 Gb/s offered to 100), and TCP backs them off to about 45 Gb/s each while spine2 carries 10. Then eight internet-bound flows pass leaf1 and a spine with the same hash and seed: every flow on spine1 goes to gw1 and every flow on spine2 to gw2, two links idle, until per-device seeds give all four spine-gateway links 2 flows each."}
```

Seeds do not fix this: a new seed reshuffles which flows collide, not whether they do. The real fixes change the unit being balanced. An application can split one transfer into several parallel connections (more flows, more chances to spread). The fabric can balance pieces smaller than a flow (flowlets and adaptive routing, below). A central scheduler can move detected elephants off collided paths (Hedera, 2010), though it reacts in hundreds of milliseconds to seconds, after many elephants have finished.

- **Solves (hashing):** with many mice, near-perfect balance for free.
- **Breaks:** a few large flows on few links collide, and the leaf's spare capacity on other uplinks cannot be used.
- **Signal:** one member of an ECMP group much busier than the group's mean, with sFlow samples (one packet in N, exported with its headers) showing a few 5-tuples carrying most of that member's bytes. Finding them is a top-k problem ([top k flows](/practice/top-k-flows)).

## Hash polarisation

Polarisation is a hash defeating itself across two decisions in a row. In a three-stage leaf-spine, a spine has only one path down to `leaf3.ams`, so it makes no second choice. Second choices appear on the way out of the fabric (a spine with equal-cost routes to both border gateways), in five-stage fabrics where a spine also hashes over super-spines, and wherever an ECMP choice is followed by a link bundle whose members are themselves chosen by hash.

The mechanism, as the second half of the visualisation shows: `leaf1.ams` hashes a flow with seed 0 and sends it to spine1 because the hash is even. spine1 runs the same chip with the same factory seed, hashes the same five fields, gets the same number, and takes it mod 2 again: even, so gw1. *Every* flow that reached spine1 is even, so spine1 sends all of them to gw1, and spine2 all of its flows to gw2. The links spine1–gw2 and spine2–gw1 carry nothing. With four members at both tiers it is worse: the flows reaching spine k all have the same low two bits, so each spine uses one of its four upward links and three quarters of that tier sits idle.

- **Breaks:** half (with four members, three quarters) of a tier's upward capacity is unusable while every link is up and every route is correct.
- **Fix:** make the tiers disagree. A per-device seed, derived for example from the loopback as in the visualisation, gives each switch an unrelated hash; platforms also let you choose different hash bits or different fields per tier. Cisco's CEF added a per-router "universal" identifier to its hash for exactly this reason.
- **Signal:** links of one tier at or near zero while their siblings carry everything, with healthy routing. Polarisation looks like an imbalance that never moves.

## Resilient hashing when a member fails

When `spine3.ams` dies, `leaf1.ams` must remove member 2 from the group. With `hash mod N` the divisor changes from 4 to 3 and almost every flow's result changes. Hand trace for hashes 0 to 11, survivors renumbered `[spine1, spine2, spine4]`:

| Hash | mod 4 (before) | mod 3 (after) | Result |
|---|---|---|---|
| 0, 1 | spine1, spine2 | spine1, spine2 | stay |
| 2, 6, 10 | spine3 | spine4, spine1, spine2 | must move (spine3 is dead) |
| 3, 4, 5, 7, 8, 9 | spine4, spine1, spine2, spine4, spine1, spine2 | spine1, spine2, spine4, spine2, spine4, spine1 | moved for no reason |
| 11 | spine4 | spine4 | stays |

Six of the nine flows on healthy spines moved, the same 67% the simulation measured. RFC 2991 and RFC 2992 (2000) analysed exactly this disruption for modulo-N, hash-threshold and highest-random-weight selection.

**Resilient hashing** keeps the indirection fixed. The hash indexes a table of buckets, say 8 here (real tables have hundreds to thousands), filled `[s1, s2, s3, s4, s1, s2, s3, s4]`. When spine3 fails, only buckets 2 and 6 are rewritten, to spine1 and spine2: `[s1, s2, s1, s4, s1, s2, s2, s4]`. A flow in any other bucket keeps its spine. That is consistent hashing as an array, the idea behind Maglev in [consistent hashing and routing](/learn/networking/network-algorithms/consistent-hashing-and-routing). When spine3 returns, some buckets must move back to it, which disrupts those flows; implementations either move them at once or move only buckets that have been idle for a while. Linux has had resilient next-hop groups with such an idle timer since kernel 5.13; Cumulus Linux, SONiC and most data center ASICs offer the equivalent.

When does this matter? A plain routed TCP flow that switches spine survives with at most a brief reordering. Disruption matters when the ECMP members hold **state**. The classic case is anycast load balancing: a pool of L4 load balancers or firewalls all announce one service address by BGP, and routers spread flows across them by ECMP ([load balancing](/learn/networking/application-protocols/load-balancing)). If one of four balancers dies and the routers rehash modulo-N, two thirds of the connections on the *healthy* balancers arrive at a box that has never seen them and get reset (unless the balancers can rebuild state, as Maglev's own consistent hashing partly does). Resilient hashing turns a member failure into "only that member's connections break", which is the best any stateless scheme can do.

- **Solves:** a membership change moves only the flows that must move.
- **Breaks:** uneven bucket counts after a change (the 22/21/21 above), and a burst of moved flows when a member returns.
- **Signal:** connection resets on healthy stateful members at the moment a group's membership changes.

## Flowlets and adaptive routing: a preview

Per-flow hashing pins an elephant for its whole life. It does not have to. TCP sends in bursts: a window of packets, then a pause while it waits for acknowledgements. If a flow pauses for longer than the difference in delay between two paths, the next burst can switch path without overtaking the previous one: every packet of the old burst has already arrived. Each burst is a **flowlet**.

Trace it with two uplinks whose queues give one-way delays of 40 µs and 10 µs, and a flowlet gap threshold of 100 µs:

1. Packets 1 to 20 of flow E1 leave on uplink 1 (40 µs). The last leaves at t = 200 µs and arrives at 240 µs.
2. E1 waits for acknowledgements and sends nothing until t = 350 µs: a gap of 150 µs, above the threshold.
3. The switch picks the less-loaded uplink 2 for packet 21. It arrives at 360 µs, after packet 20 at 240 µs: in order.
4. Had the gap been 20 µs, packet 21 would have left at 220 µs and arrived at 230 µs, *before* packet 20. So the threshold must exceed the largest delay difference between paths; real implementations set it in the tens to hundreds of microseconds.

Flowlet switching was proposed in FLARE (2007) and is the basis of CONGA (2014, built into the ASICs of Cisco's ACI switches) and of the "dynamic load balancing" modes in merchant switch chips: the switch keeps a small table of recent flowlets and, on a gap, assigns the next one to the least-loaded member.

**Adaptive routing** goes further: choose the uplink per packet by current queue depth, and let the receiver put packets back in order. InfiniBand switches have done it for years, and NVIDIA Spectrum-X does it on Ethernet with SuperNICs that place each RDMA packet (remote direct memory access: the NIC writes straight into the other server's memory) at its final address by its sequence number, so reordering costs almost nothing. It needs a reorder-tolerant receiver; aimed at an ordinary TCP stack it brings back the problem per-flow hashing exists to avoid. The full treatment is in [AI fabric topologies](/learn/fabric-networking/ai-fabrics/ai-fabric-topologies).

- **Solves:** an elephant is no longer pinned to one member for its whole life, so collisions dissolve at the next gap or the next packet.
- **Breaks:** a gap threshold below the paths' delay difference reorders flows; adaptive routing towards hosts that cannot reorder looks like loss.
- **Signal:** out-of-order and spurious-retransmission counters on hosts rising after the feature is enabled.

## Entropy for tunnelled traffic

Meridian's tenant traffic crosses the spines inside VXLAN tunnels ([VXLAN encapsulation](/learn/fabric-networking/overlays-vxlan-evpn/vxlan-encapsulation)): `leaf1.ams` wraps Acme's packet in an outer IP header from its VTEP (VXLAN tunnel endpoint, its loopback `10.255.1.11`) to `leaf3.ams`'s `10.255.1.13`, plus an outer UDP header and an 8-byte VXLAN header. The spines read only the outer headers, so the ECMP hash sees the outer 5-tuple. If every tunnelled packet from leaf1 to leaf3 had the same outer 5-tuple, every Acme, Globex and storage flow between those two leaves would hash to one spine: in the visualisation, outer port 4789 to 4789 hashes to spine4 for every flow.

VXLAN avoids that by design. RFC 7348 recommends that the encapsulating VTEP compute a hash of the *inner* headers and write it into the outer UDP **source** port, in the dynamic range 49152 to 65535. The outer UDP header as `leaf1.ams` builds it for flow A:

| Field | Size | Value in this example | What reads it |
|---|---|---|---|
| Source port | 16 bits | 54043 = 49152 + (inner hash 0xb6af131b mod 16384) | Every underlay ECMP hash; nothing else |
| Destination port | 16 bits | 4789 (IANA's VXLAN port) | The egress VTEP, to recognise VXLAN |
| Length | 16 bits | UDP header + VXLAN + inner frame | The egress VTEP |
| Checksum | 16 bits | 0 (RFC 7348 says it SHOULD be zero over IPv4) | Nobody, when 0 |

Flow B gets 56774, the outer 5-tuples differ in one field, and the spines spread them again (spine1 and spine4 in the visualisation). Each packet of a flow still gets the same port, so order is kept.

Every tunnel faces the same problem, with different answers:

| Encapsulation | Where the entropy goes | Note |
|---|---|---|
| VXLAN (UDP 4789) | Outer UDP source port | RFC 7348 |
| GENEVE (UDP 6081) | Outer UDP source port | RFC 8926, same convention |
| RoCEv2 (UDP 4791) | UDP source port, usually derived from the queue pair (one RDMA connection's endpoint) | One RDMA connection is one flow; more queue pairs give more entropy |
| MPLS | An entropy label in the label stack | RFC 6790; otherwise routers parse deep into the payload or hash labels only |
| IPv6 in any tunnel | The 20-bit flow label | RFC 6438 |
| GRE, IPsec ESP | Nothing hashable beyond addresses (ESP's SPI on some platforms) | Unless the ASIC parses the inner packet, one tunnel is one flow |

- **Solves:** tunnelled flows spread over the underlay as plain IP flows do, while each flow keeps one path.
- **Breaks:** a software VTEP or NIC offload that sets a constant source port, or a site-to-site IPsec tunnel carrying everything between two gateways: the fabric collapses that traffic onto one member.
- **Signal:** per-member imbalance that appears only for tunnelled traffic, and very few distinct outer source ports in sFlow samples between a VTEP pair.

## Gray failures that silently eat a share of traffic

A **gray failure** is a component that is neither working nor down. Microsoft's "Gray Failure" paper (HotOS 2017) named the defining property: the system's own failure detector thinks the component is fine while its users see it failing. ECMP turns a gray link into a precise, hard-to-see symptom: if one of N members drops a fraction p of packets but stays up, routing keeps it in the group, so 1/N of all flows cross it and each of those flows loses p of its packets, while the average loss across the group is only p/N.

The commonest cause is physical, an optic or fibre degrading until the receiver discards frames that fail their FCS (frame check sequence, the CRC-32 at the end of every Ethernet frame) because forward error correction (FEC) can no longer repair them, which [optics, cabling and the physical layer](/learn/fabric-networking/fabric-architecture/optics-cabling-and-the-physical-layer) explains in depth. The visualisation shows the ECMP side of it:

```viz
{"type": "fabric", "scenario": "gray-failure", "title": "A gray failure: an optic degrades, the link stays up, and ECMP keeps sending it a quarter of the flows", "caption": "leaf1.ams sends about 1,000 Gb/s over four 400G uplinks. Over five weeks the receive power at spine3.ams's port facing leaf1 falls from −1.8 to −6.8 dBm; errors climb past what forward error correction can repair and about 2% of frames fail their FCS check, yet light, LLDP, IS-IS and BFD keep the link up, so it keeps a 25% share. Costing it out moves the load onto three uplinks at 83%; the repair restores four."}
```

Worked numbers from that run: one member in four loses 2% of its frames, so the group-wide loss is 0.5%, small enough to vanish on a dashboard of averages. But a quarter of flows lose 2%, and a loss-limited TCP flow's throughput scales roughly as 1/√p (the Mathis formula), so going from a background loss of 0.01% to 2% cuts its ceiling by about √200 ≈ 14 times. The user-visible report is "one request in four is slow", which matches nothing on the per-device health page.

Optics are not the only cause. Others produce the same shape:

- **A partially programmed FIB.** One spine's hardware table missed an entry after a software upgrade: that spine drops traffic for some prefixes while its routing software shows the route.
- **An MTU (maximum transmission unit, the largest packet a link accepts) mismatch on one member.** Only large packets die, and only on 1/N of flows: small pings pass, big transfers on some connections hang.
- **Hash-dependent drops.** A failing line card or corrupted table entry drops only packets whose hash lands in certain buckets. Microsoft's Pingmesh paper (SIGCOMM 2015) describes switches that silently dropped packets only for particular combinations of addresses and ports.

Routing cannot see any of these, because the protocol packets that keep a link in service (IS-IS hellos, BFD, BGP keepalives) are small, frequent and sent directly on the link they test, and a short frame has fewer bits for an error to hit than a full-size one. BFD (Bidirectional Forwarding Detection, a fast hello protocol, [convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd)) with the usual detect multiplier of 3 needs three consecutive misses to declare a link down, which at 2% loss happens with probability 0.02³, about 8 in a million per window. The signals come from elsewhere: receive-side FCS errors and discards on the member, and probes with **many different 5-tuples**, so every member is exercised, grouped by the member each crossed ([active measurement](/learn/fabric-networking/operating-fabrics/active-measurement)). Once a member is identified, the fix is to cost it out (raise its metric so routing removes it from every group), which is only safe if the remaining members have the headroom, the subject of [redundancy and failure domains](/learn/fabric-networking/fabric-architecture/redundancy-and-failure-domains).

## Failure modes in production

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Elephant collision | One uplink saturated, others light; some transfers at half speed | Per-member utilisation of the group; sFlow top talkers on the hot member | Split transfers into parallel flows; flowlet or adaptive load balancing; more uplinks |
| Hash polarisation | Some links of a tier at zero, siblings full, routing healthy | Imbalance that never moves; same seed and fields on both tiers | Per-device seeds or different hash bits per tier |
| No tunnel entropy | All VTEP-to-VTEP traffic on one spine | Few distinct outer source ports in samples | Fix the VTEP or NIC to derive the port from inner headers; hash inner headers for GRE |
| Modulo rehash on failure | Connections through healthy anycast balancers or firewalls reset when one member dies | Reset spike at the moment of the membership change, on all members | Resilient hashing on the routers in front of stateful pools |
| Gray member | A fraction of requests slow or failing, average loss tiny, ping clean | Receive FCS errors and discards per member; hash-spread probes grouped by member | Cost out the member, then repair; alert on error trends, not only link state |
| Missing member | Capacity down by 1/N, higher utilisation everywhere, no alarm | ECMP group width against the topology's expected width | Find why the route or adjacency is missing (often one session or adjacency down) |
| Low-entropy hash policy | Connections between two hosts always on one path | Hash fields set to addresses only (Linux policy 0, or a platform default) | Include ports in the hash |

## Trade-offs: ways to spread traffic over parallel paths

| Approach | Reordering inside a flow | Balance with elephants | State in the switch | Behaviour when a member fails | Where it runs |
|---|---|---|---|---|---|
| Per-packet round robin | Constant | Perfect | None | Only lost packets | Rare; some HPC fabrics with reorder-tolerant receivers |
| Static ECMP, `hash mod N` | None | Poor: collisions | None | Most flows move | Default on many routers and hosts |
| Static ECMP, resilient buckets | None | Poor: collisions | Bucket table | Only the failed member's flows move | Data center switches, Linux 5.13+ |
| Flowlet switching | Only if the gap is too short | Good for bursty TCP | Flowlet table | Flows rebalance at the next gap | CONGA-style, merchant-chip dynamic load balancing |
| Per-packet adaptive routing | Constant, repaired at the NIC | Excellent | Queue-depth feedback | Packets avoid the dead path at once | InfiniBand, Spectrum-X AI back ends |
| Weighted ECMP (WCMP) | None | As static ECMP | Weighted buckets | Weights follow capacity | Fabrics with unequal link capacity, such as Google's |

## Under the hood: what the ASIC and the kernel do

In a switch ASIC the hash is computed in the parser and lookup stages of the pipeline, in parallel with the route lookup, so it adds no extra stage: the FIB entry names an ECMP group, the group points to a range in a member table, and hash bits index into that range. Tables are finite: the number of ECMP groups and the total number of member entries are hardware limits on the datasheet, and an EVPN fabric (the overlay control plane of module 06) with many next-hop combinations can exhaust them, at which point new routes fall back to fewer paths or are not installed. Many chips can also remove a member whose port goes down directly in hardware, within well under a millisecond, before routing software has reacted; routing then reconverges around it ([convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd)).

On Linux, kernels from 5.3 can hold next hops as separate nexthop objects shared by many routes, so a member change updates one object instead of every route. The same hashing appears one layer down in link aggregation, where a switch picks the member of a port-channel by hash ([switches, VLANs and loops](/learn/fabric-networking/from-zero/switches-vlans-and-loops)): a bundle after an ECMP decision is a polarisation risk for the same reason.

## What the platform should show

A software engineer building fabric tooling should turn ECMP from invisible to inspectable:

- **Per-member utilisation of every ECMP group**, and the ratio of the busiest member to the group's mean. Interface totals per device hide imbalance; a leaf at 40% can have one uplink at 98%.
- **Group width against intent.** Four spines means four members in every leaf-to-leaf group; three is a silent 25% capacity loss.
- **Error and discard counters per member, attached to the link**, with receive-side FCS errors on the far end, and a trend alert on pre-FEC errors or optical power long before frames drop.
- **Top flows on a hot member** from sFlow or IPFIX (per-flow records the device exports), so "imbalance" becomes "these two NFS connections".
- **Entropy health for tunnels:** distinct outer source ports per VTEP pair over a window.
- **Probes that cover every member,** with varied source ports, grouped by member, as the only reliable detector of gray members.
- **Membership changes as events,** correlated with connection resets on stateful pools behind ECMP.

The core of such a check is small. The device already exposes everything it needs:

```python
def ecmp_findings(device, expected, members, capacity_gbps):
    """Turn per-member counters of one ECMP group into findings for a human."""
    out = []
    if len(members) < expected:
        out.append(f"{len(members)} of {expected} members installed: "
                   f"{len(members) / expected:.0%} of uplink capacity")
    loads = {m["peer"]: m["tx_gbps"] for m in members}
    mean = sum(loads.values()) / len(loads)
    hot = max(loads, key=loads.get)
    if mean > 0 and loads[hot] / mean > 1.3:          # busiest member vs the average
        out.append(f"imbalance: {hot} at {loads[hot] / capacity_gbps:.0%} vs mean "
                   f"{mean / capacity_gbps:.0%}; check top flows on it (sFlow)")
    for m in members:
        loss = m["far_fcs_per_s"] / max(m["tx_frames_per_s"], 1)
        if loss > 1e-6:                               # sick, but routing says "up"
            out.append(f"gray member: {m['peer']} loses {loss:.1%} of frames while up; "
                       f"~{1 / len(members):.0%} of flows cross it")
    return [f"{device}: {line}" for line in out] or [f"{device}: healthy"]


fleet = {
    "leaf1.ams": (4, [{"peer": "spine1.ams", "tx_gbps": 251, "tx_frames_per_s": 31_400_000, "far_fcs_per_s": 0},
                      {"peer": "spine2.ams", "tx_gbps": 248, "tx_frames_per_s": 31_000_000, "far_fcs_per_s": 0},
                      {"peer": "spine3.ams", "tx_gbps": 250, "tx_frames_per_s": 31_250_000, "far_fcs_per_s": 625_000},
                      {"peer": "spine4.ams", "tx_gbps": 251, "tx_frames_per_s": 31_400_000, "far_fcs_per_s": 0}]),
    "leaf5.ams": (4, [{"peer": "spine1.ams", "tx_gbps": 392, "tx_frames_per_s": 46_000_000, "far_fcs_per_s": 0},
                      {"peer": "spine2.ams", "tx_gbps": 61, "tx_frames_per_s": 7_600_000, "far_fcs_per_s": 0},
                      {"peer": "spine3.ams", "tx_gbps": 58, "tx_frames_per_s": 7_200_000, "far_fcs_per_s": 0},
                      {"peer": "spine4.ams", "tx_gbps": 64, "tx_frames_per_s": 8_000_000, "far_fcs_per_s": 0}]),
    "leaf7.ams": (4, [{"peer": "spine1.ams", "tx_gbps": 210, "tx_frames_per_s": 26_000_000, "far_fcs_per_s": 0},
                      {"peer": "spine2.ams", "tx_gbps": 205, "tx_frames_per_s": 25_600_000, "far_fcs_per_s": 0},
                      {"peer": "spine4.ams", "tx_gbps": 212, "tx_frames_per_s": 26_500_000, "far_fcs_per_s": 0}]),
    "leaf9.ams": (4, [{"peer": f"spine{i}.ams", "tx_gbps": 120, "tx_frames_per_s": 15_000_000, "far_fcs_per_s": 0}
                      for i in range(1, 5)]),
}
for device, (expected, members) in fleet.items():
    print("\n".join(ecmp_findings(device, expected, members, capacity_gbps=400)))
```

```text
leaf1.ams: gray member: spine3.ams loses 2.0% of frames while up; ~25% of flows cross it
leaf5.ams: imbalance: spine1.ams at 98% vs mean 36%; check top flows on it (sFlow)
leaf7.ams: 3 of 4 members installed: 75% of uplink capacity
leaf9.ams: healthy
```

`far_fcs_per_s` is read from the spine's receive side, because a sender never learns its frames were thrown away; joining "leaf1's uplink" to "spine3's port" needs the link inventory, so tooling needs the cabling model as much as the counters ([telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability)). The engineer needs the line; the manager needs the colour: leaf1 is degraded but routing, leaf7 is at reduced capacity, neither is an outage yet.

## Interviewer follow-ups

**"Why does ECMP hash per flow and not per packet?"** Model answer: per-packet spreading reorders segments within a TCP connection, duplicate acknowledgements trigger spurious retransmissions and a smaller congestion window, so healthy connections slow down as if packets were lost. Hashing invariant header fields keeps each flow on one path with no state. The price is that it balances flows, not bytes. Common wrong answer: "because the switch can't track packets", which misses that the constraint is the receiver's ordering, and that adaptive routing does go per packet when the NIC can reorder.

**"Users say one request in four is slow, the fabric dashboard is green. What do you think of?"** Model answer: a ratio of 1/N with N equal to the spine count suggests one ECMP member degraded but still up. Scope first (which leaf pairs, which spines), then per-member receive errors and discards, then probes with varied 5-tuples grouped by spine. Ping with one 5-tuple tests one path and proves little. Common wrong answer: "the network is fine because ping has no loss". It is fair to add: "I'd defer to the network team on the optic thresholds, but I'd build the per-member view and the probe grouping."

**"A spine fails. What happens to existing flows?"** Model answer: its flows must move; with modulo hashing most other flows move too, with resilient hashing only the failed member's do. For routed TCP that is a blip; in front of stateful members (anycast balancers, firewalls) a modulo rehash resets healthy connections, so resilient hashing is required there. Common wrong answer: "nothing, only the failed spine's flows move", which is true only with resilient hashing.

**"Why do VXLAN packets have a random-looking UDP source port?"** Model answer: the spines hash the outer headers only; the VTEP copies a hash of the inner flow into the outer source port so that tunnelled flows spread over the spines while each flow keeps one path. Without it all traffic between two VTEPs would ride one spine. Common wrong answer: "for NAT traversal" or "for security".

## What mid-level engineers get wrong

- **Treating ECMP as load balancing by load.** It is load balancing by hash; it never measures utilisation, so "we have four links, so four times the bandwidth" holds only for many small flows.
- **Expecting one connection to use all the uplinks.** A single TCP connection is capped at one member's bandwidth; benchmarks with one stream measure one link.
- **Reading a device total as balance.** Averages over a group hide the one hot or sick member that every complaint traces back to.
- **Testing a fabric with one ping.** One 5-tuple exercises one path; you need many, varied on purpose.

## Exercise

```exercise
id: ecmp-uplink
title: Pick each flow's ECMP uplink from a seeded hash
prompt: |
  A leaf hashes every flow onto one member of its ECMP group. Implement the
  hash and the choice exactly as specified, so results match the hardware
  model bit for bit.

  `flows` is a list of 5-tuples `[src_ip, dst_ip, proto, src_port, dst_port]`
  (IPs as dotted strings, the rest integers). `members` lists the uplinks in
  member order. `seed` is a 32-bit unsigned integer.

  For each flow:
  1. Build the key string `"src|dst|proto|sport|dport"`, for example
     `"10.1.1.10|10.1.2.20|6|51517|5432"`.
  2. Hash it with 32-bit FNV-1a, seeded: start with `h = 2166136261 XOR seed`;
     for each byte of the key (ASCII), `h = h XOR byte`, then
     `h = (h * 16777619) mod 2**32`.
  3. The flow's uplink is `members[h mod len(members)]`.

  Return the list of uplinks, one per flow, in input order. With seed 0 the
  key above hashes to 0xb626ed20; 0xb626ed20 mod 4 is 0, so with four spines
  that flow takes `members[0]`. In JavaScript, use `Math.imul` and `>>> 0` to
  stay within unsigned 32 bits. This is plain FNV-1a, without the
  visualisation's finishing mix, so its picks differ from the walkthrough's.
languages: [python, javascript]
entry: ecmp_uplinks
starter:
  python: |
    def ecmp_uplinks(flows, members, seed):
        picks = []
        for src, dst, proto, sport, dport in flows:
            key = f"{src}|{dst}|{proto}|{sport}|{dport}"
            # TODO: seeded FNV-1a over the key, then pick a member
        return picks
  javascript: |
    function ecmp_uplinks(flows, members, seed) {
      const picks = [];
      for (const [src, dst, proto, sport, dport] of flows) {
        const key = `${src}|${dst}|${proto}|${sport}|${dport}`;
        // TODO: seeded FNV-1a over the key, then pick a member
      }
      return picks;
    }
tests:
  - args: [[["10.1.1.10", "10.1.2.20", 6, 51517, 5432]], ["spine1.ams", "spine2.ams", "spine3.ams", "spine4.ams"], 0]
    expected: ["spine1.ams"]
    label: the worked flow from the prompt
  - args: [[["10.1.1.10", "10.1.2.20", 6, 51517, 5432], ["10.1.1.10", "10.1.2.20", 6, 51518, 5432], ["10.1.1.12", "10.1.2.21", 6, 43005, 443], ["10.1.1.13", "10.1.2.20", 6, 38203, 5432], ["10.1.1.10", "10.1.2.22", 17, 55000, 53]], ["spine1.ams", "spine2.ams", "spine3.ams", "spine4.ams"], 0]
    expected: ["spine1.ams", "spine4.ams", "spine2.ams", "spine3.ams", "spine4.ams"]
    label: five flows, one changed source port moves a flow
  - args: [[], ["spine1.ams", "spine2.ams", "spine3.ams", "spine4.ams"], 0]
    expected: []
    label: no flows
  - args: [[["10.1.1.10", "10.1.2.20", 6, 51517, 5432], ["10.1.1.12", "10.1.2.21", 6, 43005, 443], ["10.1.1.10", "10.1.2.22", 17, 55000, 53]], ["spine1.ams"], 0]
    expected: ["spine1.ams", "spine1.ams", "spine1.ams"]
    label: a group with one member
  - args: [[["10.255.1.11", "10.255.1.13", 17, 4789, 4789], ["10.255.1.11", "10.255.1.13", 17, 4789, 4789], ["10.255.1.11", "10.255.1.13", 17, 54043, 4789], ["10.255.1.11", "10.255.1.13", 17, 56774, 4789]], ["spine1.ams", "spine2.ams", "spine3.ams", "spine4.ams"], 0]
    expected: ["spine4.ams", "spine4.ams", "spine2.ams", "spine3.ams"]
    label: VXLAN flows with a fixed and with a hashed outer source port
  - args: [[["10.1.1.10", "10.1.2.20", 6, 51517, 5432], ["10.1.1.10", "10.1.2.20", 6, 51518, 5432], ["10.1.1.12", "10.1.2.21", 6, 43005, 443], ["10.1.1.13", "10.1.2.20", 6, 38203, 5432], ["10.1.1.10", "10.1.2.22", 17, 55000, 53]], ["spine1.ams", "spine2.ams", "spine3.ams", "spine4.ams"], 184484107]
    expected: ["spine4.ams", "spine1.ams", "spine1.ams", "spine2.ams", "spine3.ams"]
    label: seeded with leaf1's loopback 10.255.1.11 as an integer
    hidden: true
  - args: [[["10.1.1.10", "10.1.2.20", 6, 51517, 5432], ["10.1.1.10", "10.1.2.20", 6, 51518, 5432], ["10.1.1.12", "10.1.2.21", 6, 43005, 443], ["10.1.1.13", "10.1.2.20", 6, 38203, 5432], ["10.1.1.10", "10.1.2.22", 17, 55000, 53]], ["spine1.ams", "spine2.ams", "spine4.ams"], 0]
    expected: ["spine1.ams", "spine4.ams", "spine2.ams", "spine1.ams", "spine1.ams"]
    label: spine3 removed, modulo 3 moves flows on healthy spines
    hidden: true
hints:
  - "Mask after every multiplication: in Python `& 0xFFFFFFFF`, in JavaScript `Math.imul(h, 16777619) >>> 0`."
  - "Apply the seed once, to the starting value, before the loop over bytes."
  - "Compare the last hidden test with the second test: a flow that was on a healthy spine can still move, because the divisor changed."
```

## Senior signals

- You describe ECMP as per-flow hashing of invariant fields, and say in the same breath that it balances flows, not bytes, and never looks at load.
- You quantify collisions (four elephants on four links collide about nine times in ten) and know seeds reshuffle collisions without removing them.
- You recognise polarisation as identical hashing at consecutive tiers and fix it with per-device seeds or different hash bits.
- You know when rehash disruption matters (stateful members such as anycast balancers) and ask for resilient hashing there.
- You check that every tunnel puts entropy in its outer header, and name where: the UDP source port for VXLAN, GENEVE and RoCEv2, the entropy label for MPLS.
- You read "1/N of requests are slow" as one sick ECMP member and reach for per-member counters and hash-spread probes rather than ping.

## Check yourself

```quiz
- q: >-
    Two TCP connections between acme-web1 and acme-db1 differ only in their source port, 51517 and 51518. leaf1.ams has four equal-cost uplinks. What can you say about their paths?
  options: ["They alternate uplinks packet by packet to balance the load", "They take the least-loaded uplink, measured when the SYN arrives", "They may take different uplinks; one changed field changes the hash", "They always share an uplink, because the addresses are equal"]
  answer: 2
  explanation: >-
    The hash covers all five fields, so changing the source port gives an unrelated hash and an effectively random member. In the walkthrough they landed on spine4 and spine3. Sharing an uplink would only be guaranteed with an address-only hash policy. ECMP never measures load, and per-packet alternation would reorder TCP segments.
- q: >-
    An ECMP group of four spines loses spine3. With plain hash mod N, what happens to flows that were on the three healthy spines?
  options: ["Exactly one quarter of them move, to balance the load again", "None of them move, only spine3's flows are rehashed", "All of them are dropped until routing reconverges fully", "About two thirds of them move to a different healthy spine"]
  answer: 3
  explanation: >-
    The divisor changes from 4 to 3, so most results change: in the hand trace six of nine flows on healthy spines moved, and the simulation measured 67%. Only resilient hashing, which rewrites nothing but the dead member's buckets, leaves healthy flows in place. That matters most when the members are stateful, such as anycast load balancers, whose moved connections are reset.
- q: >-
    Traffic from leaf1.ams to leaf3.ams inside VXLAN all rides one spine, though plain IP traffic between the same leaves spreads evenly. What is the most likely cause?
  options: ["The VTEP sets one fixed outer UDP source port for every flow", "The outer TTL is too low for the packets to reach other spines", "The spines hash the inner headers and those are all identical", "VXLAN disables ECMP because the VNI must stay on one path"]
  answer: 0
  explanation: >-
    Spines hash only the outer headers. If the encapsulating VTEP does not copy a hash of the inner flow into the outer source port, as RFC 7348 recommends, every tunnelled packet between two VTEPs has the same outer 5-tuple and hashes to one member. Spines do not parse inner headers by default, and nothing in VXLAN pins a VNI to a path.
- q: >-
    Two tiers of switches use ECMP, all with the same chip, hash fields and factory seed. Half of the links between the second tier and the gateways carry no traffic. What fixes it?
  options: ["Giving each device its own hash seed so the tiers disagree", "Bundling two links between each spine and gateway", "Lowering the IS-IS metric of the idle links to attract traffic", "Turning on resilient hashing in every ECMP group"]
  answer: 0
  explanation: >-
    This is polarisation: the second tier computes the same hash as the first and repeats its choice, so each spine uses only some of its uplinks. Different seeds per device make the hashes unrelated. Resilient hashing only changes failure behaviour, a bundle behind the spine picks its member with the same correlated hash and polarises too, and a lower metric would make the paths unequal rather than spread them.
- q: >-
    One of leaf1.ams's four uplinks drops 2% of frames but stays up. The group-wide loss is 0.5%. Why does a ping from leaf1's servers to leaf3's servers show 0% loss?
  options: ["The 0.5% average is too small for a ping to ever detect it", "The ping is one flow, hashed onto one path that avoids the bad link", "ICMP is prioritised over TCP traffic, so it is never dropped", "BFD removed the bad link from the group before the ping ran"]
  answer: 1
  explanation: >-
    Every ping between two hosts shares one hash input, so it tests one member, three times in four a healthy one. BFD needs three consecutive misses and almost never sees them at 2% loss. A ping that happened to hash onto the bad member would see about 2%, not 0.5%. Detecting a gray member needs probes with many 5-tuples, grouped by the member each crossed.
- q: >-
    Two 60 Gb/s backup flows collide on one 100 Gb/s uplink. Which change addresses the collision itself?
  options: ["Reseeding the hash on the leaf so the flows rehash", "Raising the hash table to more buckets per member", "Enabling symmetric hashing so replies take the same path", "Splitting each backup into several parallel connections"]
  answer: 3
  explanation: >-
    More flows give the hash more chances to spread the bytes. A new seed only reshuffles which flows collide; with two elephants on two uplinks they still share one half the time. Symmetric hashing aligns the two directions of a flow, and more buckets improve balance after failures, but neither changes the fact that one flow is pinned to one member.
```
