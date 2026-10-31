---
slug: switches-vlans-and-loops
title: "Switches, VLANs and loops: how layer 2 learns, splits and melts"
description: How an Ethernet switch learns MAC addresses, floods what it does not know and ages out what falls silent; how VLANs and the 802.1Q tag split one switch into many broadcast domains; why a single loop melts a layer-2 network and how spanning tree stops it; and how LACP and MLAG add links without loops, with what breaks and the signal that shows it.
minutes: 50
difficulty: intro
tags: [fabric-networking, switching, mac-learning, broadcast-domain, vlan, 802.1q, spanning-tree, lacp, mlag, layer-2]
problems: [mac-learning-switch]
---
Plug four servers into a switch and they talk to each other at once, with no configuration. Nobody told the switch which server is on which port; it works that out from the frames themselves. The same three rules that make this work also explain the most destructive outage layer 2 can produce: join three switches in a triangle for redundancy, forget one setting, and a single ARP request can fill every link in seconds.

The fabrics later in this track avoid most of that by routing between switches. You still need the mechanism, because every server plugs into a switch port, every tenant asks for a layer-2 segment, and "is it a loop?" is a question you will be asked.

## The switch and its table

A **switch** (the standards say *bridge*) forwards Ethernet frames between its ports by reading each frame's destination **MAC address**, the 48-bit address of a network interface. [Links, frames and Ethernet](/learn/fabric-networking/from-zero/links-frames-and-ethernet) takes the frame apart; here you need three facts. Every frame starts with a destination MAC, then a source MAC. `ff:ff:ff:ff:ff:ff` is the **broadcast** address: every interface on the segment. Any other address whose first byte is odd (the lowest bit, the group bit, set) is **multicast**: a group of interfaces. Everything else is **unicast**: one interface.

Switching is **layer 2**: it works on Ethernet, below IP (layer 3), and never reads an IP address to forward. A switch keeps one table, the **MAC address table** (also the forwarding database, FDB, or CAM table, after the content-addressable memory early switches used), mapping each MAC it has seen to a port. Three rules maintain and use it:

1. **Learn from the source.** When a frame arrives, record "source MAC is behind this port, seen now". A frame proves where its *sender* is; it says nothing about where its destination is.
2. **Forward, flood or filter by the destination.** If the destination is in the table, send the frame out of that one port. If it is unknown, broadcast or multicast, **flood** it: one copy out of every port except the one it came in on. If the table says the destination is on the port the frame arrived on, **filter** it: drop it, because the destination already heard it.
3. **Age out the silent.** An entry not refreshed by a new frame from that source for the **aging time** (300 seconds by default, from IEEE 802.1D, and the Linux bridge's default) is deleted.

**What it solves:** plug-and-play delivery at line rate. **How it breaks:** floods land where they are not wanted, and everything depends on the table being right. **Signal:** the table itself (`bridge fdb show` on Linux, `show mac address-table` on most switches) and per-port flood counters.

### One switch, traced

`leaf1.ams` stands in here as a classic learning switch for VLAN 100 (Meridian's leaves actually learn remote MACs from EVPN, a BGP-based protocol that advertises where each MAC lives, in [EVPN, the control plane](/learn/fabric-networking/overlays-vxlan-evpn/evpn-the-control-plane)). Four Acme servers sit on ports 1 to 4: `acme-web1` (`00:00:5e:00:53:0a`), `acme-app1` (`…53:0d`), `acme-app2` (`…53:0e`) and `acme-app3` (`…53:10`). All MACs come from the documentation range `00:00:5e:00:53:xx`. The table starts empty.

| t (s) | Frame | In port | Learned | Destination lookup | Sent out of |
|---|---|---|---|---|---|
| 0 | web1 → app2 | 1 | `…53:0a` on 1 | unknown | 2, 3, 4 (flood) |
| 0 | app2 → web1 (reply) | 3 | `…53:0e` on 3 | known, port 1 | 1 |
| 1 | web1 → app2 | 1 | `…53:0a` refreshed, age 0 | known, port 3 | 3 |
| 5 | app3 → broadcast (ARP) | 4 | `…53:10` on 4 | broadcast | 1, 2, 3 (flood) |
| 290 | web1 ↔ app2 traffic | 1, 3 | both refreshed | known | one port each |
| 306 | (none) | | `…53:10` aged out (301 s old) | | |
| 340 | web1 → app3 | 1 | `…53:0a` refreshed | unknown again | 2, 3, 4 (flood) |

`acme-app1` never sends, so every frame for it would be flooded; after aging, `acme-app3` costs a flood again until it next speaks.

```viz
{"type": "fabric", "scenario": "mac-learning", "title": "MAC learning: learn the source, flood the unknown, forward the known, age out the silent", "caption": "leaf1.ams as a classic learning switch for VLAN 100 with four Acme servers. acme-web1's first frame to acme-app2 is flooded to ports 2 to 4; the reply teaches the switch where acme-app2 is, so later frames go out of one port. acme-app3's broadcast is learned and flooded; after 300 s of silence its entry is aged out and the next frame to it is flooded again. acme-app1 never sends, so it is never learned."}
```

### Aging: why forget, and what forgetting costs

Aging exists because the table cannot tell when a host leaves. A virtual machine migrates, a NIC (network interface card) is replaced: the old entry points at the wrong port. Usually the host's first frame from its new port overwrites the entry (rule 1 updates the port, not only the time); aging is the safety net for hosts that move and stay silent.

Forgetting costs flooding, and one timer interaction is a classic production bug. Routers keep **ARP** entries (the IP-to-MAC mappings from [ARP and the default gateway](/learn/fabric-networking/from-zero/arp-and-the-default-gateway)) for hours; four is a common router default. Switches forget MACs after five minutes. Take a host whose outgoing traffic leaves through one router while replies return through another (asymmetric routing). The return router still has the host's ARP entry and keeps sending unicast frames to its MAC, but the switch in front of the host hears nothing *from* the host on that path, ages the entry out, and from then on floods every frame for it to every port in the VLAN: a steady stream of unknown unicast, sometimes gigabits, landing on unrelated servers. The fix is an ARP timeout no longer than the MAC aging time (the router re-ARPs, and the host's reply re-teaches the switch), or symmetric routing.

### Under the hood: the table in hardware

In a switch ASIC (the forwarding chip, in [planes, ASICs and network operating systems](/learn/fabric-networking/from-zero/planes-asics-and-network-operating-systems)), the MAC table is an exact-match hash table in on-chip SRAM (fast static memory), keyed by VLAN and MAC: the same structure as [a hash table](/learn/data-structures/hashing/hash-tables), with a few hashed buckets of several entries each. A lookup takes a fixed few nanoseconds at any table size, and a learn can fail before the table is full, when every slot in a new MAC's buckets is taken: that MAC is then flooded while counters report free space. Capacity ranges from tens of thousands of entries to a few hundred thousand, depending on the chip and how its shared table memory is carved up.

Many ASICs learn in hardware; others hand each new MAC to the CPU, which installs thousands per second, so a burst of new MACs shows up as flooding while it catches up. On a Linux switch or host bridge the table is visible directly (illustrative output):

```text
$ bridge fdb show br br0 | grep -v permanent
00:00:5e:00:53:0a dev swp1 vlan 100 master br0
00:00:5e:00:53:0e dev swp3 vlan 100 master br0
00:00:5e:00:53:10 dev swp4 vlan 100 master br0
```

A full table is also an attack: a **MAC flooding attack** sends frames from thousands of random source MACs until the table fills, and the switch then floods everyone's traffic to the attacker's port. Port security, a per-port cap on learned MACs, is the defence.

## Broadcast domains

A **broadcast domain** is the set of interfaces that all receive each other's broadcasts and floods. On a plain switch that is every port, and switches joined by cables merge into one larger domain. Broadcasts are not optional: ARP and DHCP (how a booting host gets its IP address) depend on them, and IPv6 neighbour discovery uses multicast that a switch floods like a broadcast unless it snoops MLD (Multicast Listener Discovery, IPv6's group-membership protocol; IGMP is IPv4's).

The bandwidth is usually trivial: 2,000 hosts each broadcasting once every 30 seconds deliver about 67 broadcasts a second to every host, tens of kilobits per second plus an interrupt each. The real cost is the **blast radius**: every switch in the domain must learn every MAC, and one misbehaving host, or one loop, damages every host at once. A broadcast domain is a failure domain, so network engineers keep them small.

## VLANs: many switches in one

A **VLAN** (virtual LAN) splits one physical switch into several logical ones. Each port is assigned to a VLAN, numbered 1 to 4094; a frame in VLAN 100 is learned, looked up and flooded only among VLAN 100 ports, and the MAC table is keyed by (VLAN, MAC). Each VLAN is its own broadcast domain, so Acme's web servers in VLAN 100 (`10.1.1.0/24`) and its databases in VLAN 200 (`10.1.2.0/24`) share a switch and never see each other's ARP requests. Traffic between VLANs must be routed, by a router or a routed VLAN interface on the switch (an SVI, switched virtual interface; Meridian's leaves are gateway `10.1.1.1` for VLAN 100 this way).

### Access ports and trunk ports

An **access port** belongs to one VLAN and carries ordinary untagged frames; the server on it never knows VLANs exist. A **trunk port** carries many VLANs over one link, typically between switches, and marks each frame's VLAN with a 4-byte **IEEE 802.1Q tag** inserted after the source MAC.

| Field | Size | Value in this example | What reads it |
|---|---|---|---|
| TPID (tag protocol identifier) | 16 bits | `0x8100` | The receiver's parser: in the position where an EtherType normally sits, `0x8100` means "a VLAN tag follows" |
| PCP (priority code point) | 3 bits | 0 | Queueing: eight classes of service; GPU clusters' lossless RoCE (RDMA over Ethernet) traffic uses it ([lossless Ethernet](/learn/fabric-networking/ai-fabrics/lossless-ethernet-pfc-ecn-dcqcn)) |
| DEI (drop eligible indicator) | 1 bit | 0 | Congested queues may drop marked frames first |
| VID (VLAN identifier) | 12 bits | 100 | The receiving trunk port: assigns the frame to VLAN 100 |
| EtherType (the original) | 16 bits | `0x0806` (ARP) | The receiving host, once the tag is removed |

The tag grows a maximum-size frame from 1,518 to 1,522 bytes, and every switch that adds or removes it recomputes the FCS (the frame's checksum). Twelve bits give 4,096 values; 0 ("priority only") and 4095 are reserved, leaving **4,094 usable VLANs**, a ceiling an operator with tens of thousands of tenants outgrows. VXLAN, which carries Ethernet frames inside UDP packets across a routed network, has a 24-bit identifier, about 16 million segments ([why overlays](/learn/fabric-networking/overlays-vxlan-evpn/why-overlays)).

Follow `acme-web1`'s ARP request for `acme-web3` across two switches joined by a trunk on port 49 (a classic design; Meridian's leaves are not linked to each other like this):

1. `acme-web1` sends it untagged on access port 1 of `leaf1.ams`, VLAN 100.
2. `leaf1.ams` floods it to the other VLAN 100 ports only. `acme-db2` on port 2 is in VLAN 200 and gets no copy, though it shares the switch.
3. Leaving trunk port 49, the frame gains the tag: TPID `0x8100`, VID 100.
4. `leaf2.ams` reads VID 100 and floods within its own VLAN 100.
5. Leaving access port 1, `leaf2.ams` strips the tag. `acme-web3` receives the frame byte for byte as `acme-web1` sent it.

```viz
{"type": "fabric", "scenario": "vlan-trunk", "title": "VLANs on a trunk: tagged VID 100 or 200 between switches, untagged at every server", "caption": "leaf1.ams and leaf2.ams each have an Acme web server in VLAN 100 and a database server in VLAN 200 on access ports, joined by a trunk on port 49. acme-web1's ARP broadcast is tagged VID 100 on the trunk and reaches only acme-web3; acme-db2's broadcast crosses the same cable tagged VID 200 and reaches only acme-db3. Watch the header stack gain and lose the 4-byte tag."}
```

### How VLANs break

**A VLAN missing from the trunk's allowed list.** Add VLAN 300 on two switches but not on the trunk between them, and each side sees only its own VLAN 300 hosts. Nothing errors. *Signal:* ARP requests with no reply; the far switch never learns the near host's MAC.

**Native VLAN mismatch.** A trunk may carry one VLAN untagged, the **native VLAN** (VLAN 1 by default on most platforms). If one end maps untagged frames to VLAN 1 and the other to VLAN 10, the two VLANs are silently bridged into one broadcast domain. *Signal:* MACs from one VLAN appearing in another's table.

**Double-tagging (VLAN hopping).** An attacker in the native VLAN sends a frame with two tags, the outer matching the native VLAN. The first switch strips it (native frames cross the trunk untagged) and the next delivers the frame into the inner tag's VLAN: one-way, but enough for an attack. Defence: no hosts in the native VLAN.

**A server port in the wrong VLAN.** The link is up, the address is right, and the server reaches nobody, because its broadcast domain holds none of its peers. It is the commonest VLAN fault and belongs on every connectivity checklist.

Providers carrying customers' own VLANs stack a second tag (IEEE 802.1ad, "QinQ", outer TPID `0x88a8`).

## Why loops kill layer 2

A second path between switches is a loop. Join `leaf1.ams`, `leaf2.ams` and `leaf3.ams` in a triangle (a classic layer-2 design, not Meridian's), all ports in VLAN 100, one host on each, spanning tree off. `acme-web1` sends one ARP broadcast:

1. `leaf1.ams` floods it to both neighbours: two copies.
2. `leaf2.ams` delivers its copy to `acme-web3` and floods it on to `leaf3.ams`; `leaf3.ams` does the same in the other direction. Every host has its ARP request, which is all that should happen.
3. Each copy reaches the far switch and is flooded again: the hosts receive the request a second time, and both copies head back to `leaf1.ams`.
4. `leaf1.ams` floods each returning copy out of every port except the one it arrived on. One copy sets off round the triangle again in each direction, and `acme-web1` receives its own broadcast back.

Nothing ends it. An IP packet carries a TTL (time to live) that every router decrements, so a packet in a routing loop dies after at most 255 hops ([the packet walk](/learn/fabric-networking/from-zero/the-packet-walk)). **The Ethernet header has no TTL or hop count**, and switches do not remember what they have forwarded. At roughly 1 µs per switch a lap takes about 3 µs, so every host receives this one request about 670,000 times a second, and its CPU processes each copy.

Every new broadcast adds two more immortal copies. On 10 Gb/s links with 64-byte frames, a copy crossing a link about 333,000 times a second uses 2.2% of it, so 45 broadcasts fill every link in both directions; hosts send ARP and DHCP constantly, so that takes seconds. Where switches have three or more looped ports, every copy is copied again on each lap and the count grows exponentially.

Three side effects make the outage total. **MAC flapping:** the looping copies carry `acme-web1`'s source MAC into `leaf1.ams` on ports 49 and 50 in turn, so the entry moves back and forth and real unicast for `acme-web1` goes the wrong way. **CPU exhaustion:** broadcasts reach the switches' CPUs too, so control protocols, spanning tree included, time out, and management stops answering when you need it. **Spread:** the storm reaches every switch carrying the VLAN.

```viz
{"type": "fabric", "scenario": "broadcast-storm", "title": "A broadcast storm in a three-switch loop, stopped when spanning tree blocks one port", "caption": "Spanning tree off: one ARP broadcast from acme-web1 circles the triangle in both directions forever, every host receives it again on every lap, leaf1.ams's MAC entry for acme-web1 flaps between ports 49 and 50, and the chart shows 45 broadcasts filling 10 Gb/s links. Then RSTP elects leaf1.ams root, leaf3.ams's port 50 becomes an alternate port and discards, and the same broadcast reaches each host exactly once."}
```

**What the redundant link solves:** survival of a link failure. **How it breaks:** without loop prevention, totally, within seconds, for every host in the VLAN. **Signal:** MAC flap logs (one MAC learned on two ports in turn), broadcast counters jumping on every port at once, switch CPU at 100%, links at line rate with no rise in useful traffic. **Storm control**, a per-port cap on broadcast, multicast and unknown-unicast rate (say 1% of line rate), limits the damage but leaves the loop.

## Spanning tree: breaking loops by switching links off

The **Spanning Tree Protocol** (STP, IEEE 802.1D; its rapid version RSTP, 802.1w, now part of 802.1D-2004) puts just enough ports into a discarding state that the active topology is a tree: one path between any two switches. Switches exchange **BPDUs** (bridge protocol data units), small frames sent every 2 seconds (the hello time) to the reserved multicast address `01:80:c2:00:00:00`, saying which switch each believes is the root and its cost to reach it.

1. **Elect a root bridge.** Each switch has a **bridge ID**: a priority (default 32768) followed by its MAC; the lowest wins. With equal priorities the lowest MAC decides: `leaf1.ams` (`…53:80`) beats `leaf2.ams` (`…53:81`) and `leaf3.ams` (`…53:82`). Many platforms add the VLAN number to the priority (32868 for VLAN 100) to run one tree per VLAN.
2. **Every other switch picks one root port,** its port with the lowest total path cost to the root. The 802.1D-2004 default cost is 20 Tb/s divided by link speed: 20,000 for 1 Gb/s, 2,000 for 10 Gb/s, 200 for 100 Gb/s (some platforms default to the older "short" scale, 4 for 1 Gb/s and 2 for 10 Gb/s, so check which one a network uses). For `leaf2.ams` and `leaf3.ams` the direct link (2,000) beats the way round (4,000), so port 49 is the root port on both.
3. **Every link gets one designated port:** the end offering the lower cost to the root, ties broken by lower bridge ID, then lower port ID. On the `leaf2`–`leaf3` link both ends offer 2,000, so `leaf2.ams`, the lower bridge ID, is designated.
4. **Every other port discards.** `leaf3.ams` port 50 becomes an **alternate** port: it still receives BPDUs but forwards no data and learns no MACs. The loop is broken.

The result is a shortest-path tree from the root (Dijkstra's shape, not a minimum spanning tree, as [minimum spanning trees](/learn/algorithms/graph-algorithms/minimum-spanning-trees) notes). A transcription, run on the triangle and then after someone gives `leaf3.ams` a lower priority:

```python
import heapq

COST = {1: 20_000, 10: 2_000, 100: 200, 400: 50}   # IEEE 802.1D-2004, by Gb/s


def spanning_tree(bridges, links):
    """bridges: name -> (priority, mac). links: (a, a_port, b, b_port, gbps)."""
    bid = {n: (prio, mac) for n, (prio, mac) in bridges.items()}
    root = min(bridges, key=lambda n: bid[n])              # lowest bridge ID wins
    adj = {n: [] for n in bridges}
    for a, ap, b, bp, gbps in links:
        adj[a].append((ap, b, bp, COST[gbps]))
        adj[b].append((bp, a, ap, COST[gbps]))
    # best[n]: the best BPDU n has heard (cost to root, sender bridge ID, sender port).
    best, root_port = {root: (0, bid[root], "")}, {}
    heap = [((0, bid[root], ""), root)]
    while heap:                                            # Dijkstra from the root
        offer, n = heapq.heappop(heap)
        if offer != best[n]:
            continue                                       # stale: n heard better since
        for port, nbr, nport, c in adj[n]:
            heard = (offer[0] + c, bid[n], port)           # n's BPDU as nbr receives it
            if nbr != root and (nbr not in best or heard < best[nbr]):
                best[nbr], root_port[nbr] = heard, nport
                heapq.heappush(heap, (heard, nbr))
    roles = {}
    for a, ap, b, bp, gbps in links:
        # The designated end of a link is the one advertising the better (cost, bridge ID, port).
        va, vb = (best[a][0], bid[a], ap), (best[b][0], bid[b], bp)
        des, other = ((a, ap), (b, bp)) if va < vb else ((b, bp), (a, ap))
        roles[des] = "designated / forwarding"
        if root_port.get(other[0]) == other[1]:
            roles[other] = "root / forwarding"
        else:
            roles[other] = "alternate / discarding"
    return root, best, roles


bridges = {"leaf1.ams": (32768, "00:00:5e:00:53:80"),
           "leaf2.ams": (32768, "00:00:5e:00:53:81"),
           "leaf3.ams": (32768, "00:00:5e:00:53:82")}
links = [("leaf1.ams", "p49", "leaf2.ams", "p49", 10),
         ("leaf1.ams", "p50", "leaf3.ams", "p49", 10),
         ("leaf2.ams", "p50", "leaf3.ams", "p50", 10)]

for label, prio3 in (("default priorities", 32768), ("leaf3.ams priority 4096", 4096)):
    bridges["leaf3.ams"] = (prio3, "00:00:5e:00:53:82")
    root, best, roles = spanning_tree(bridges, links)
    print(f"{label}: root {root}")
    for (dev, port), role in sorted(roles.items()):
        print(f"  {dev} {port:4} cost to root {best[dev][0]:>5}  {role}")
```

```text
default priorities: root leaf1.ams
  leaf1.ams p49  cost to root     0  designated / forwarding
  leaf1.ams p50  cost to root     0  designated / forwarding
  leaf2.ams p49  cost to root  2000  root / forwarding
  leaf2.ams p50  cost to root  2000  designated / forwarding
  leaf3.ams p49  cost to root  2000  root / forwarding
  leaf3.ams p50  cost to root  2000  alternate / discarding
leaf3.ams priority 4096: root leaf3.ams
  leaf1.ams p49  cost to root  2000  designated / forwarding
  leaf1.ams p50  cost to root  2000  root / forwarding
  leaf2.ams p49  cost to root  2000  alternate / discarding
  leaf2.ams p50  cost to root  2000  root / forwarding
  leaf3.ams p49  cost to root     0  designated / forwarding
  leaf3.ams p50  cost to root     0  designated / forwarding
```

The tuple comparisons carry the protocol: `min(..., key=bid)` is the election, `heard < best[nbr]` is a better BPDU replacing a worse one, and the per-link `(cost, bridge ID, port)` comparison picks the designated end. The second run shows why a priority change is an event: the blocked link moves from `leaf2`–`leaf3` to `leaf1`–`leaf2`, changing paths across the VLAN. Real switches reach the same result incrementally from BPDUs.

### Timers and versions

The original 802.1D was slow by design: a switch that stopped hearing the root waited **max age** (20 s), then spent **forward delay** (15 s) listening and 15 s learning, so 30 to 50 seconds of outage per change. RSTP replaced waiting with a handshake: a designated port *proposes*, the neighbour *agrees* after blocking its other ports, and the link forwards at once, so a direct failure converges in well under a second; a silent neighbour is declared lost after three missed hellos, 6 seconds. MSTP (802.1s, now part of 802.1Q) maps many VLANs onto a few trees; Cisco's PVST+ runs one per VLAN. **Edge ports** (declared server-facing) forward immediately, and **BPDU guard** shuts an edge port that receives a BPDU, because a switch where a server should be is a loop waiting to happen.

### How spanning tree breaks

**A switch that stops sending BPDUs.** Spanning tree is fail-open: an alternate port that stops hearing BPDUs assumes the path is gone and starts forwarding. A CPU too busy to send them, or a fibre that fails in one direction only, recreates the loop. *Signal:* a port moving to forwarding with no link event, then a storm. *Fix:* loop guard (never unblock on BPDU silence alone) and unidirectional link detection.

**A new root.** A switch plugged in with priority 4096, or a lab switch with a lower MAC, becomes root, as in the code's second run, and paths move. *Signal:* a root change in the logs. *Fix:* set root priorities deliberately; root guard where a root must never appear.

**Topology-change flushing.** When a non-edge port starts forwarding, RSTP sends a topology change through the tree and every switch it reaches flushes the MACs learned on its non-edge ports (legacy 802.1D instead cuts the aging time to 15 seconds), so everything floods until relearned. A flapping server port without edge configuration triggers this every few seconds. *Signal:* a rising topology-change counter and its source port.

## Why fabrics avoid spanning tree

Spanning tree buys loop-freedom by wasting links: in the triangle a third carry nothing, and a leaf with four uplinks to four spines in one VLAN forwards on one and blocks three. Recovery from a silent failure takes seconds and every change floods, where a routed fabric with fast failure detection reconverges in well under a second; and one mistake endangers every host in the VLAN.

Leaf-spine fabrics route instead ([Clos and leaf-spine](/learn/fabric-networking/fabric-architecture/clos-and-leaf-spine)). Each leaf-to-spine link is its own layer-3 subnet (a /31), every link forwards, ECMP (equal-cost multipath: hashing each flow onto one of several equal next hops, in [ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)) spreads flows across all spines, and a looping packet dies at TTL zero. Layer 2 shrinks to the server-to-leaf link; a tenant VLAN stretched across leaves rides VXLAN tunnels over the routed core ([why overlays](/learn/fabric-networking/overlays-vxlan-evpn/why-overlays)), with EVPN distributing MAC locations over BGP (the Border Gateway Protocol, the internet's routing protocol, modules 04 and 05) instead of flood-and-learn. Spanning tree often stays on server ports as a safety net with BPDU guard, blocking nothing.

## Link aggregation and LACP

Two cables between the same two devices form a loop, and spanning tree would block one. **Link aggregation** (a LAG; also a bond, port channel or aggregated Ethernet interface) makes several physical links one logical port, which spanning tree and the MAC table see as one; frames are spread across its **members**. It solves two problems: more bandwidth than one link, and survival when a member fails.

Spreading is per flow. Each end hashes header fields of the frames it sends (MACs, IPs, ports; Linux's `layer3+4` transmit hash policy uses the source and destination IP addresses and TCP or UDP ports) to pick a member, so a flow's frames take one link and arrive in order. The two ends hash independently, so a flow's request and reply may use different members. The cost: **one flow never exceeds one member's speed.** A 2 × 25 Gb/s bond has 50 Gb/s in aggregate, but one TCP stream tops out at 25, and two large flows may share a member while the other idles (ECMP's problem one layer up). Members must share speed and duplex. When a member fails, its flows rehash onto the survivors, provided the failure is detected.

### LACP: agreeing on what is bundled

A **static** LAG declares the members bundled at each end. If one end is bundled and the other is not (a configuration slip, or a cable in the wrong switch), the far end treats hashed frames as arriving on unrelated ports: black holes, duplicate floods, even loops. The **Link Aggregation Control Protocol** (LACP, IEEE 802.3ad, now 802.1AX) makes both ends agree before a member carries traffic. Each end sends LACPDUs on every member to the slow-protocols address `01:80:c2:00:00:02` (EtherType `0x8809`), describing itself (the *actor*) and what it has heard from the far end (the *partner*):

| Field | Size | Example (server end) | What reads it |
|---|---|---|---|
| System priority + system ID | 2 + 6 bytes | 65535, the bond's MAC | The far end: all members of one LAG must lead to the same system |
| Key | 2 bytes | 15 | Groups ports that may aggregate together on one system |
| Port priority + port number | 2 + 2 bytes | 255, 1 | Picks which ports are active when more are offered than allowed |
| State | 1 byte | activity, timeout, aggregation, synchronisation, collecting, distributing, defaulted, expired | Both ends: a member carries traffic only once both report collecting and distributing |

A member joins only if its partner's system ID and key match the other members'. A cable in the wrong switch reports a different partner and stays out of the bundle instead of black-holing a share of the flows. LACPDUs go every 30 seconds (slow) or every second (fast); each end asks for the rate it wants to receive through its timeout bit. A member is dead after three missed intervals: 90 or 3 seconds. Fast rate matters for failures that leave the physical link up, which only missing LACPDUs reveal: a fibre cut in one direction behind a media converter or optical transport system, or a peer whose software has hung while its port stays lit.

What a host shows when one member is cabled to the wrong place (illustrative, trimmed Linux bonding status):

```text
$ cat /proc/net/bonding/bond0
Bonding Mode: IEEE 802.3ad Dynamic link aggregation
Transmit Hash Policy: layer3+4 (1)
LACP rate: fast
Active Aggregator Info:
        Aggregator ID: 1
        Number of ports: 1
        Partner Mac Address: 00:00:5e:00:53:a0
Slave Interface: ens1f0
MII Status: up
Aggregator ID: 1
Slave Interface: ens1f1
MII Status: up
Aggregator ID: 2          <- link up, but in a different aggregator: not carrying traffic
```

Both links are up, yet the server has half its bandwidth and no redundancy: the members heard different partners and landed in different aggregators, which link state alone never shows.

## MLAG: one bundle, two switches

A LAG to one switch does not survive that switch failing. **MLAG** (multi-chassis link aggregation) terminates a server's bond on two switches, say `leaf1.ams` and `leaf2.ams`, that both send the same LACP system ID, so the bond sees one partner and aggregates both links. The server gets both links' bandwidth, survives the loss of either switch, and nothing is blocked. Making two switches act as one takes three pieces:

- **A peer link** between them, a trunk carrying the shared VLANs (like the one in the VLAN walk). It carries synchronisation (MAC and ARP entries learned on one side are installed on the other) and data for hosts attached to only one switch.
- **A rule against duplicates.** A flood arriving over the peer link is not sent out of a dual-attached port whose local link is up, because the peer already delivered it.
- **A keepalive** on a separate path, usually the out-of-band management network, so each switch can tell "my peer is dead" from "the peer link is dead".

The failure that matters is the peer link. If the keepalive still works, the secondary shuts its MLAG ports and servers fall back to the primary; hosts attached only to the secondary (orphan ports) may be cut off. If the keepalive is down too, both switches believe they are alone and keep forwarding with the same identity: **split brain**, with duplicate floods, inconsistent MAC tables and sometimes loops.

MLAG is vendor-specific (Arista MLAG, Cisco vPC, Cumulus Linux's CLAG, among others) and limited to pairs. EVPN fabrics, Meridian included, get the same dual attachment from **EVPN multihoming**: the two leaves share an Ethernet segment identifier and coordinate through BGP instead of a peer link ([EVPN multihoming](/learn/fabric-networking/overlays-vxlan-evpn/evpn-multihoming)); [redundancy and failure domains](/learn/fabric-networking/fabric-architecture/redundancy-and-failure-domains) compares the two designs.

## Failure modes in production

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Layer-2 loop (STP off, BPDU loss, a cable between two edge ports) | Everything in the VLAN unreachable at once; switches unmanageable | MAC flap logs; broadcast counters at line rate on every port; CPU at 100% | Shut one link of the loop (often via the out-of-band network); then BPDU guard, loop guard, storm control |
| Unknown-unicast flooding from timer mismatch | Unrelated servers receive gigabits not addressed to them; links busy | Flood counters steady; the destination MAC absent from the table while the router's ARP entry is present | ARP timeout ≤ MAC aging time, or make the routing symmetric |
| MAC table full or hash collisions | Flooding for some hosts only; "table full" or learn-failure counters | Table usage against capacity; a burst of new source MACs on one port | Port security limits; fix the source; a larger table profile |
| VLAN not on trunk, or wrong access VLAN | One host or one VLAN unreachable; link up, no errors | ARP unanswered; MAC not learned on the far switch; trunk allowed list | Correct the VLAN membership, from the source of truth |
| LACP member not bundled | Half the bandwidth, no redundancy, links "up" | Members in different aggregators; partner system IDs differ; defaulted state | Fix cabling or the partner configuration |
| MLAG split brain | Duplicate frames, MAC moves between peers, intermittent loss | Peer link and keepalive both down; both peers claim primary | Restore the keepalive path; run it separately from the peer link |

## Trade-offs: ways to get redundancy at layer 2

| | STP / RSTP | LAG with LACP | MLAG | Routed fabric (+ overlay for L2) |
|---|---|---|---|---|
| Links in use | One path; redundant links block | All members, per flow | All members to both switches | All links, ECMP per flow |
| Survives | Any link (after reconvergence) | A member link | A link or one whole switch | Any link or switch the design allows |
| Recovery time | Sub-second to 6 s (RSTP); 30–50 s (802.1D) | Fast LACP: 3 s to detect one-way failure; immediate on link loss | Similar to LAG; peer-link failure is the hard case | Milliseconds to a second ([convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd)) |
| Loop risk | A mistake loops the whole VLAN | Low with LACP | Split brain | Bounded by TTL |
| Scope | Any topology | Two devices | A pair of switches | Thousands of switches |

## What the platform should show

Layer-2 faults hide behind green link lights. Surface:

- **MAC flaps as an event,** keyed by switch, VLAN and MAC, with the ports. One move is a migration; several in seconds is a loop.
- **Flood rates per port and VLAN against a baseline,** split into broadcast, multicast and unknown unicast, because each has a different cause.
- **MAC table usage against hardware capacity,** plus learn-failure counters, per switch.
- **Spanning-tree events:** root changes, topology-change counts with their source port, ports moving to forwarding without a link event.
- **LAG health as membership, not link state:** members bundled versus configured, partner system IDs that disagree, LACP timeouts.
- **MLAG pair state:** peer link, keepalive and role as one object, so "peer link down, keepalive up" and "both down" look different.
- **Intent versus reality for VLANs:** access VLANs and trunk allowed lists from the source of truth diffed against the device ([network automation and source of truth](/learn/fabric-networking/operating-fabrics/network-automation-and-source-of-truth)).

Switches report learn and move events by syslog or streaming telemetry ([telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability)). Turning them into the first item takes a sliding window:

```python
from collections import defaultdict, deque


def mac_flaps(events, window_s=10, threshold=3):
    """events: (time_s, switch, vlan, mac, port) learn notifications, in time order.
    Report a MAC that moved between ports `threshold` or more times inside `window_s`."""
    last_port = {}
    moves = defaultdict(deque)                 # (switch, vlan, mac) -> times it moved
    alerts = {}
    for t, sw, vlan, mac, port in events:
        key = (sw, vlan, mac)
        prev = last_port.get(key)
        last_port[key] = port
        if prev is None or prev == port:
            continue                           # first sighting, or a refresh
        q = moves[key]
        q.append((t, prev, port))
        while q and t - q[0][0] > window_s:
            q.popleft()                        # forget moves older than the window
        if len(q) >= threshold:
            ports = sorted({p for _, a, b in q for p in (a, b)})
            alerts[key] = f"{len(q)} moves in {window_s} s between {', '.join(ports)}"
    return alerts


WEB1, APP2 = "00:00:5e:00:53:0a", "00:00:5e:00:53:0e"
events = [(0.0, "leaf1.ams", 100, WEB1, "port 1"),
          (0.5, "leaf1.ams", 100, APP2, "port 3"),
          (40.0, "leaf1.ams", 100, APP2, "port 2"),          # a server moved: one move, no alert
          (61.0, "leaf1.ams", 100, WEB1, "port 49"),         # a loop: back and forth
          (61.0, "leaf1.ams", 100, WEB1, "port 50"),
          (61.1, "leaf1.ams", 100, WEB1, "port 49"),
          (61.1, "leaf1.ams", 100, WEB1, "port 50")]
for (sw, vlan, mac), why in mac_flaps(events).items():
    print(f"MAC flap on {sw} VLAN {vlan}: {mac} {why}  -> suspect a layer-2 loop")
```

```text
MAC flap on leaf1.ams VLAN 100: 00:00:5e:00:53:0a 4 moves in 10 s between port 1, port 49, port 50  -> suspect a layer-2 loop
```

The window separates the two causes of a move: `acme-app2` moving once raises nothing, `acme-web1` bouncing between inter-switch ports is a loop, and the alert names the links to shut.

## Interviewer follow-ups

**"Why don't modern data center fabrics run spanning tree?"** Model answer: it blocks redundant links, leaving most uplink capacity idle; it takes seconds to recover from a silent failure and floods on every change; and one mistake loops a whole VLAN. A routed leaf-spine uses every link with ECMP, bounds loops with TTL, and carries layer 2 in an overlay where tenants need it. Honest addition: "whether a site keeps STP on server ports as a safety net I'd confirm with the network team; I'd alert on BPDUs on edge ports, topology changes and MAC flaps." Common wrong answer: "STP is obsolete"; it is still the safety net.

**"A server has a 2 × 25 Gb/s LACP bond, but one iperf stream gets 25. Is the bond broken?"** Model answer: no; a LAG hashes per flow. Run several streams with different ports, check the hash policy includes layer-4 ports, and confirm both members share an aggregator, since an unbundled member gives the same number. Common wrong answer: "LACP is misconfigured, it should give 50".

**"What happens when an MLAG peer link fails?"** Model answer: the keepalive decides. If it works, the secondary shuts its MLAG ports and traffic continues through the primary, though orphan hosts on the secondary may be cut off; if it is down too, both switches act as primary: split brain. Hence a separate keepalive path. Common wrong answer: "nothing, the server still has a link to each switch", ignoring that the switches can no longer coordinate.

## What mid-level engineers get wrong

- **Thinking a switch learns destinations.** It learns only sources; a host that never sends is never learned and is always flooded to.
- **Treating "the link is up" as "the server is connected".** A wrong access VLAN, a VLAN missing from a trunk or an unbundled LAG member all keep the light green.
- **Ignoring timers.** An ARP timeout longer than MAC aging floods unicast; slow LACP takes 90 seconds to notice a failure that leaves the link up.

## Exercise: a learning switch

```exercise
id: learning-switch
title: Simulate a VLAN-aware learning switch
prompt: |
  Implement the three rules of a learning switch with VLANs and aging.

  `ports` lists the switch's access ports as `[port, vlan]` pairs. `aging`
  is the aging time in seconds. `frames` lists arriving frames in time
  order as `[time, in_port, src_mac, dst_mac]`, with MACs as lowercase
  strings such as "00:00:5e:00:53:0a". The table starts empty.

  For each frame, in order:
  1. The frame's VLAN is the VLAN of `in_port`.
  2. An entry is expired, and treated as absent, when
     `time - last_seen > aging` (an entry exactly `aging` seconds old is
     still valid).
  3. Learn: record `src_mac` in the frame's VLAN on `in_port`, last seen
     at `time` (overwriting any earlier port).
  4. If `dst_mac` is a group address (broadcast, or any multicast: the
     first byte is odd), flood.
  5. Otherwise, if `dst_mac` is in the table for this VLAN: send it out of
     that port, or out of no port if that port is `in_port` (filter).
  6. Otherwise (unknown unicast), flood.

  Flooding sends the frame out of every other port in the same VLAN.
  Return, for each frame, the list of ports it is sent out of, ascending.
languages: [python, javascript]
entry: learning_switch
starter:
  python: |
    def learning_switch(ports, aging, frames):
        # your code here
        return []
  javascript: |
    function learning_switch(ports, aging, frames) {
      // your code here
      return [];
    }
tests:
  - args: [[[1,100],[2,100],[3,100],[4,100]], 300, [[0,1,"00:00:5e:00:53:0a","00:00:5e:00:53:0e"],[0,3,"00:00:5e:00:53:0e","00:00:5e:00:53:0a"],[1,1,"00:00:5e:00:53:0a","00:00:5e:00:53:0e"],[5,4,"00:00:5e:00:53:10","ff:ff:ff:ff:ff:ff"],[340,1,"00:00:5e:00:53:0a","00:00:5e:00:53:10"]]]
    expected: [[2,3,4],[1],[3],[1,2,3],[2,3,4]]
    label: the trace from the lesson
  - args: [[[1,100],[2,100],[3,200],[4,200],[5,100]], 300, [[0,1,"00:00:5e:00:53:01","ff:ff:ff:ff:ff:ff"],[0,3,"00:00:5e:00:53:03","ff:ff:ff:ff:ff:ff"],[1,3,"00:00:5e:00:53:03","00:00:5e:00:53:01"],[2,2,"00:00:5e:00:53:02","00:00:5e:00:53:01"]]]
    expected: [[2,5],[4],[4],[1]]
    label: VLANs are separate tables and separate floods
  - args: [[[1,10],[2,10],[3,10]], 300, [[0,1,"00:00:5e:00:53:01","00:00:5e:00:53:02"],[0,1,"00:00:5e:00:53:02","00:00:5e:00:53:01"],[1,2,"00:00:5e:00:53:03","00:00:5e:00:53:02"]]]
    expected: [[2,3],[],[1]]
    label: destination on the arrival port is filtered
  - args: [[], 300, []]
    expected: []
    label: no frames
  - args: [[[1,1],[2,1],[3,1]], 300, [[0,1,"00:00:5e:00:53:01","ff:ff:ff:ff:ff:ff"],[5,2,"00:00:5e:00:53:02","00:00:5e:00:53:01"],[6,3,"00:00:5e:00:53:01","00:00:5e:00:53:02"],[7,2,"00:00:5e:00:53:02","00:00:5e:00:53:01"]]]
    expected: [[2,3],[1],[2],[3]]
    label: a host moves to another port
    hidden: true
  - args: [[[1,1],[2,1],[3,1]], 10, [[0,1,"00:00:5e:00:53:01","ff:ff:ff:ff:ff:ff"],[10,2,"00:00:5e:00:53:02","00:00:5e:00:53:01"],[21,3,"00:00:5e:00:53:03","00:00:5e:00:53:01"]]]
    expected: [[2,3],[1],[1,2]]
    label: aging boundary
    hidden: true
  - args: [[[1,1],[2,1],[3,1]], 300, [[0,1,"00:00:5e:00:53:01","01:00:5e:00:00:fb"],[1,2,"00:00:5e:00:53:02","33:33:00:00:00:01"],[2,3,"00:00:5e:00:53:03","00:00:5e:00:53:01"]]]
    expected: [[2,3],[1,3],[1]]
    label: multicast is flooded
    hidden: true
  - args: [[[1,100],[2,200]], 300, [[0,1,"00:00:5e:00:53:01","ff:ff:ff:ff:ff:ff"]]]
    expected: [[]]
    label: a VLAN with one port floods nowhere
    hidden: true
hints:
  - "Key the table by (VLAN, MAC), storing the port and the time last seen."
  - "Learn before you look up, and check expiry against the current frame's time."
  - "The group bit is the lowest bit of the first byte: int(mac[0:2], 16) & 1."
```

## Senior signals

- You state a switch as three rules (learn sources; forward, flood or filter on destinations; age out) and predict any frame's ports from them.
- You treat a broadcast domain as a failure domain and size it for blast radius, not bandwidth.
- You explain a broadcast storm by mechanism (no TTL, flooding multiplies, CPUs starve), reach for MAC flap logs first, and know spanning tree is fail-open, which is one reason routed fabrics replace it.
- You know a LAG balances per flow, that LACP's job is to refuse a miscabled member, and that bundle membership, not link state, is the health signal.
- You can say what MLAG's peer link and keepalive each do, what split brain is, and that EVPN multihoming replaces the pair.

## Check yourself

```quiz
- q: >-
    The peer link between an MLAG pair fails, while the keepalive over the management network still works. What should happen?
  options: ["The secondary shuts its MLAG ports, so dual-attached servers use the primary", "The servers' bonds go down, since LACP now hears two different partners", "Both switches keep forwarding, since each still has a link to every server", "Spanning tree blocks one server link, since the pair now forms a loop"]
  answer: 0
  explanation: >-
    The keepalive tells the secondary that its peer is alive, so the problem is the peer link, not the peer. Without the peer link the two switches can no longer synchronise MAC tables or suppress duplicate floods, so the secondary steps aside and shuts its MLAG ports; each server's bond loses one member but stays up, because the primary still sends the shared system ID. Hosts attached only to the secondary may be cut off. Both switches carrying on alone is split brain, what happens when the keepalive is lost as well.
- q: >-
    After a routing change, return traffic to a server comes through a router whose ARP entry for the server is three hours old, while the server's outgoing traffic leaves through another router. Unrelated servers in the VLAN start receiving gigabits of frames not addressed to them. What is the most likely cause?
  options: ["A native VLAN mismatch bridging two VLANs on one trunk", "The switch aged out the silent MAC, so it floods each frame", "A MAC flooding attack filling the switch's table with random MACs", "A layer-2 loop circulating the server's broadcasts"]
  answer: 1
  explanation: >-
    The router keeps ARP entries for hours and keeps sending unicast frames to the server's MAC, but the switch hears nothing from the server on that path and ages the MAC out after 300 seconds, so every frame for it becomes unknown unicast and is flooded. A loop would show MAC flaps and multiplying broadcasts, not steady unicast to one MAC. The fix is an ARP timeout no longer than the MAC aging time, so the router re-ARPs and the reply re-teaches the switch, or symmetric routing.
- q: >-
    A frame in VLAN 200 crosses a trunk. What sits in the two bytes right after the source MAC, where an untagged frame has its EtherType?
  options: ["0x8100, the 802.1Q tag protocol identifier", "0x88a8, the provider tag used on every trunk", "0x00C8, the VLAN ID 200 in hexadecimal", "0x0800, the EtherType of the IPv4 payload"]
  answer: 0
  explanation: >-
    The 802.1Q tag is inserted after the source MAC, and its first 16 bits, the TPID 0x8100, sit where the EtherType normally is, telling the parser a tag follows. The VLAN ID 200 is in the 12-bit VID field after the PCP and DEI bits, and the original EtherType follows the tag. 0x88a8 is the outer tag of 802.1ad QinQ, used by providers stacking tags, not on ordinary trunks.
- q: >-
    Three switches form a triangle, all links 10 Gb/s, all priorities 32768. Their MACs end in :80 (leaf1), :81 (leaf2) and :82 (leaf3). Which port does RSTP put in the discarding state?
  options: ["leaf2's port towards leaf3, as that link's lower bridge ID end", "leaf3's port towards leaf1, as the root port with the higher MAC", "leaf1's port towards leaf3, as the root's highest-numbered port", "leaf3's port towards leaf2, as that link's non-designated end"]
  answer: 3
  explanation: >-
    leaf1 has the lowest bridge ID and becomes root; its ports are designated. leaf2 and leaf3 each choose the direct link to leaf1 as root port (cost 2,000 against 4,000 the long way). On the leaf2 to leaf3 link both ends offer cost 2,000, so the lower bridge ID, leaf2, is designated, and leaf3's port there is an alternate port that discards. The root never blocks its own ports.
- q: >-
    A server has a 2 x 25 Gb/s LACP bond with both members bundled. A single TCP transfer runs at about 25 Gb/s. Why?
  options: ["LACP reserves one member as a standby for failover", "Each frame alternates members, and reordering halves the rate", "The 802.1Q tag overhead takes half of the aggregate bandwidth", "The LAG hashes per flow, so one flow uses one member"]
  answer: 3
  explanation: >-
    A LAG hashes header fields so every frame of a flow takes the same member and arrives in order; one flow therefore never exceeds one member's speed. Several flows with different ports spread across both members. LACP in its normal mode keeps all members active, and per-frame spraying is precisely what a LAG avoids to prevent reordering.
- q: >-
    Why does a layer-2 loop take down a network when a layer-3 routing loop usually does not?
  options: ["Switches forward frames more slowly than routers forward packets", "Spanning tree turns every redundant link off, which isolates hosts", "Broadcast frames are much larger than the IP packets in a loop", "Ethernet frames have no TTL, so flooded copies circle and multiply"]
  answer: 3
  explanation: >-
    IP packets carry a TTL that each router decrements, so a looping packet dies after at most 255 hops and the damage is bounded. Ethernet has no hop count, and switches flood broadcasts out of every port, so the copies live forever and each new broadcast adds more, until links fill and switch CPUs starve. Spanning tree is the cure, not the cause, and frame size or switch speed has nothing to do with it.
```
