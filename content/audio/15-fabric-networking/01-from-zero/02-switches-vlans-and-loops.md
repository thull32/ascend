---
lesson: switches-vlans-and-loops
source: b9fa77e2df0da5df
fit: partial
desk:
  - "The MAC learning trace, and the MAC learning, VLAN trunk and broadcast storm visualisations"
  - "The 802.1Q tag and LACPDU field tables, and the bonding status with a miscabled member"
  - "The spanning tree election and the MAC flap detector in Python"
  - "The failure-modes and layer-2 redundancy trade-off tables"
  - "Exercise: simulate a VLAN-aware learning switch"
---
## Introduction

Plug four servers into a switch and they talk to each other at once, with no configuration. Nobody told the switch which server is on which port. It works that out from the frames themselves.

The same three rules that make this work explain the most destructive outage layer 2 can produce. Join three switches in a triangle for redundancy, forget one setting, and a single ARP request can fill every link in seconds. Fabrics route to avoid it, but every server still plugs into a switch port, and you will be asked "is it a loop?"

Four ideas, then. How a switch learns, floods and forgets. How VLANs split one switch into many. Why one loop melts a network, and how spanning tree stops it. And how link aggregation and MLAG add links without making loops.

## Learn, flood, forget

A switch forwards Ethernet frames by their destination MAC address, the 48-bit address of a network interface; every frame starts with a destination MAC, then a source MAC. Switching is layer 2: it never reads an IP address. It keeps one table, the MAC address table, mapping each MAC it has seen to a port, and runs three rules.

First, learn from the source. When a frame arrives, record that its source MAC is behind this port, seen now. A frame proves where its sender is. It says nothing about where its destination is.

Second, forward, flood or filter by the destination. If the destination is in the table, send the frame out of that one port. If it is unknown, broadcast or multicast, flood it: one copy out of every port except the one it came in on. And if the destination sits on the very port the frame arrived on, drop it, because the destination already heard it.

Third, age out the silent. An entry not refreshed by a frame from that source for 300 seconds, the usual default, is deleted.

Picture leaf1 in Meridian's Amsterdam site as a learning switch, four Acme servers on ports 1 to 4, table empty. acme-web1 sends to acme-app2. The switch learns acme-web1 on port 1, has never heard of acme-app2, and floods to ports 2, 3 and 4. acme-app2 replies from port 3. Now the switch learns acme-app2, already knows acme-web1, and sends the reply out of port 1 alone. From then on, one port each way.

Two consequences. A server that never sends is never learned, so every frame for it is flooded. And a server silent for five minutes is forgotten, and costs a flood again until it next speaks.

## The timer bug, and the table in hardware

Forgetting costs flooding, and one timer interaction is a classic production bug. Routers keep ARP entries, the mapping from IP address to MAC, for hours; four is a common default. Switches forget MACs after five minutes.

Take a host whose outgoing traffic leaves through one router while replies come back through another. The return router keeps sending unicast frames to the host's MAC. But the switch in front of the host hears nothing from it on that path, ages the entry out, and from then on floods every frame for it to the whole VLAN: sometimes gigabits, landing on unrelated servers.

The fix is an ARP timeout no longer than the MAC aging time, so the router re-ARPs and the reply re-teaches the switch, or symmetric routing.

In a switch chip, the table is a hash table in on-chip memory, keyed by VLAN and MAC. A learn can fail before it is full, when a new MAC's buckets are taken, and that MAC is flooded while counters still show free space. A full table is also an attack: thousands of random source MACs fill it, and the switch floods everyone's traffic to the attacker. Port security, a per-port cap on learned MACs, is the defence.

## Broadcast domains and VLANs

A broadcast domain is the set of interfaces that all receive each other's broadcasts and floods: on a plain switch, every port, and switches joined by cables merge into one. The bandwidth is trivial: 2,000 hosts each broadcasting once every 30 seconds deliver about 67 broadcasts a second to each host. The real cost is blast radius. One misbehaving host, or one loop, damages every host at once. A broadcast domain is a failure domain, so engineers keep them small.

A VLAN, a virtual LAN, splits one physical switch into several logical ones. Each port belongs to a VLAN, numbered 1 to 4094, and a frame in VLAN 100 is learned and flooded only among VLAN 100 ports. Acme's web servers in VLAN 100 and its databases in VLAN 200 share a switch and never see each other's ARP requests; traffic between them must be routed.

An access port belongs to one VLAN and carries untagged frames; the server never knows VLANs exist. A trunk port carries many VLANs over one link and marks each frame with a 4-byte 802.1Q tag inserted after the source MAC. Its first two bytes, hex 8100, sit where the EtherType normally is and tell the receiver a tag follows. Then three priority bits, used by lossless RoCE traffic, a drop-eligible bit, and a 12-bit VLAN ID. Twelve bits leave 4,094 usable VLANs, a ceiling an operator with tens of thousands of tenants outgrows, and one reason VXLAN, with about 16 million segments, exists.

Follow one ARP request across two switches joined by a trunk. acme-web1 sends it untagged in VLAN 100. Its switch floods it to VLAN 100 ports only; acme-db2, in VLAN 200, gets nothing. On the trunk the frame carries a tag saying VLAN 100. The far switch floods it within its VLAN 100 and strips the tag, and acme-web3 receives the frame exactly as it was sent.

VLANs break quietly. A VLAN missing from the trunk's allowed list leaves each side seeing only its own hosts, with no error. A native VLAN mismatch, the ends of a trunk putting untagged frames in different VLANs, silently merges two broadcast domains. And the commonest fault: a server port in the wrong VLAN. The link is up, the address is right, and the server reaches nobody.

## Why loops kill layer 2

Now the story. Join leaf1, leaf2 and leaf3 in a triangle, all in VLAN 100, one host on each, spanning tree off. acme-web1 sends one ARP broadcast.

leaf1 floods it to both neighbours: two copies. leaf2 delivers its copy to its host and floods it on to leaf3; leaf3 does the same the other way. Every host now has its request, which is all that should happen. But each copy reaches the far switch and is flooded again, the hosts hear the request a second time, and both copies head back to leaf1. leaf1 floods each one onward, and the copies set off round the triangle again.

Before I go on: what normally kills a packet that goes round in circles, and why doesn't it here?

[pause]

An IP packet carries a TTL that every router decrements, so a routing loop kills it within 255 hops. The Ethernet header has no TTL and no hop count, and switches do not remember what they have forwarded. Nothing ends it.

At about a microsecond per switch, a lap takes 3 microseconds, so every host receives this one request about 670,000 times a second, and its CPU processes every copy. Each new broadcast adds two more immortal copies, and on 10 gigabit links 45 of them fill every link in both directions. Hosts send ARP and DHCP constantly, so that takes seconds.

Side effects make the outage total. The looping copies carry acme-web1's source MAC into leaf1 on one inter-switch port, then the other, so its entry flaps and real traffic for it goes the wrong way. Switch CPUs drown, control protocols time out, and management stops answering just when you need it. The signals are MAC flap logs, broadcast counters jumping on every port at once, and CPU at 100 percent. Storm control, a per-port cap on broadcast rate, limits the damage but leaves the loop.

## Spanning tree, and why fabrics avoid it

The Spanning Tree Protocol, and its rapid version RSTP, discards on just enough ports that the active topology is a tree. Switches exchange small frames called BPDUs every 2 seconds, saying which switch each believes is the root and its cost to reach it.

On the triangle: first, elect a root. The lowest bridge ID wins, a priority, default 32768, followed by the MAC; with equal priorities leaf1 has the lowest MAC. Second, every other switch picks a root port, its cheapest way to the root. A 10 gigabit link costs 2,000, so the direct link beats the way round at 4,000. Third, every link gets one designated port, the end with the lower cost to the root. Between leaf2 and leaf3 both offer 2,000, so the tie goes to the lower bridge ID, leaf2. Every remaining port discards: leaf3's port towards leaf2 becomes an alternate port, hearing BPDUs but forwarding nothing. Give leaf3 a lower priority and the blocked link moves, which is why a priority change is an event.

The original standard took 30 to 50 seconds per change; RSTP's handshake converges a direct failure in well under a second, and declares a silent neighbour lost after 6 seconds. BPDU guard shuts a server-facing port that receives a BPDU, because a switch where a server should be is a loop waiting to happen.

And spanning tree is fail-open. An alternate port that stops hearing BPDUs starts forwarding, so a CPU too busy to send them, or a fibre failing in one direction, recreates the loop; loop guard is the fix. Every topology change also flushes learned MACs, so everything floods until relearned.

So why do fabrics avoid it? It buys loop-freedom by wasting links: a leaf with four uplinks to four spines in one VLAN forwards on one and blocks three. Leaf-spine fabrics route instead. Every link forwards, ECMP spreads flows across all spines, and a looping packet dies at TTL zero. Layer 2 shrinks to the server's link, and a tenant VLAN stretched across leaves rides VXLAN tunnels, with EVPN saying where every MAC lives.

## Link aggregation, LACP and MLAG

Two cables between the same two devices form a loop. Link aggregation makes several links one logical port that spanning tree and the MAC table see as one: more bandwidth, and survival when a member fails. Spreading is per flow: each end hashes MACs, IPs and ports to pick a member, so a flow stays in order. The number to remember: one flow never exceeds one member's speed. A bond of two 25 gigabit links has 50 in aggregate, but one TCP stream tops out at 25.

A static bundle with one cable in the wrong switch black-holes flows. LACP, the Link Aggregation Control Protocol, makes both ends agree first. A member joins only if the partner it hears reports the same system ID and key as the others, so the miscabled link stays out. At the slow rate a dead member takes 90 seconds to notice, at the fast rate 3, which matters for failures that leave the light on, like a one-way fibre cut. The trap on a Linux host is both links up but sitting in different aggregators: half the bandwidth, no redundancy, and link state never shows it.

MLAG, multi-chassis link aggregation, terminates a server's bond on two switches that send the same LACP system ID, so the server survives losing a whole switch. It takes a peer link that synchronises MAC and ARP entries, a rule that floods from the peer link are not sent out of dual-attached ports, and a keepalive on a separate path, usually the management network. MLAG is vendor-specific and limited to pairs; EVPN fabrics like Meridian use EVPN multihoming over BGP instead.

## In the interview

A classic follow-up: what happens when an MLAG peer link fails?

[pause]

The keepalive decides. If it still works, the secondary shuts its MLAG ports and traffic continues through the primary, though hosts attached only to the secondary may be cut off. If the keepalive is down too, both switches act as primary: split brain, with duplicate floods and inconsistent MAC tables. Hence a separate keepalive path. The wrong answer is "nothing, the server still has a link to each switch".

And for the tooling you build: layer-2 faults hide behind green link lights. Alert on MAC flaps, with a window that tells one migration from a loop, and show bundle membership rather than link state.

## Recap

Four things to remember. A switch learns sources, floods unknown destinations and ages out after 300 seconds, so an ARP timeout longer than that floods unicast. A broadcast domain is a failure domain, and VLANs shrink it, with a 4-byte tag on trunks and a ceiling of 4,094. Ethernet has no TTL, so a loop multiplies broadcasts until links fill; spanning tree blocks ports, is fail-open and wastes links, which is why fabrics route. And a bundle balances per flow, and membership, not link state, is its health signal.

At your desk: the three visualisations, the tag and LACP field tables, the spanning tree and MAC flap code, the failure and trade-off tables, and the learning-switch exercise.
