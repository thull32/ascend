---
lesson: bum-traffic
source: ea1c2a79d70eab91
fit: partial
desk:
  - "The EVPN MAC learning and ARP suppression visualisation"
  - "The BUM replication visualisation: four unicast copies from leaf1.ams, then one copy down a PIM tree"
  - "The table of BUM kinds and the type-3 route field by field"
  - "The bridge forwarding-table output, the header table for copy 1, and the flood-list and per-link copy model"
  - "The replication cost script and its table"
  - "The VNI-to-group mapping table, the PIM tree trace and the register sequence diagram"
  - "The DR and assert election code"
  - "The design comparison table and the failure modes table"
  - "The flood-list audit code and its findings"
  - "Practice problem: MAC learning switch"
---
## Introduction

Acme's segment, VNI 10100, sits on five leaves: leaf1, leaf3 and leaf4 in Amsterdam, and leaf1 and leaf2 in Singapore. acme-web1, behind leaf1 in Amsterdam, sends an ARP request for 10.1.1.50, an address no leaf has learned. That request is addressed to everyone. But the underlay is a routed IP network that delivers a packet to one loopback, and nothing in it knows what everyone means.

Frames like this are BUM traffic: broadcast, unknown unicast and multicast. There are two ways to deliver them. With ingress replication, the leaf where the frame enters makes one unicast copy per remote leaf, from a list BGP builds out of EVPN type-3 routes. With underlay multicast, the leaf sends one copy to an IP multicast group and the underlay copies it where a tree branches, which takes a second routing protocol, PIM.

So: the flood list, ingress replication and its cost, how PIM builds a tree, and which design large fabrics choose.

## Where BUM comes from, and the flood list

A classic switch floods all three kinds out of every port in the VLAN except the arrival port. An overlay does the same across the fabric, so a VNI's flood scope is the set of VTEPs that carry it. Leaf2 in Amsterdam carries only Globex's VNI 10200, and must never see Acme's floods.

Broadcast is ARP, DHCP, and gratuitous ARP after a move. Unknown unicast is a frame for a MAC the leaf has not learned. Multicast is IPv6 neighbour discovery and tenant applications like market data. EVPN removes most of it. Every active MAC is advertised in a type-2 route, so few destinations are unknown. And with ARP suppression, the local leaf answers an ARP for an IP it already learned, so the request never enters the fabric. What remains is the ARP for an IP nobody has learned yet, DHCP, gratuitous ARP, a little unknown unicast, and real tenant multicast.

To flood, a leaf needs a flood list for each VNI: the remote VTEPs that get a copy. EVPN builds them with route type 3, the inclusive multicast Ethernet tag route. Each VTEP originates one per VNI it carries, and it means: I have this VNI, send me its BUM traffic, and here is how.

The how is the PMSI tunnel attribute. Tunnel type 6 asks for ingress replication, with the leaf's loopback as the destination of each copy; other types name a PIM tree and a multicast group. The route target decides which leaves import it. These routes are small and stable: one per VNI per leaf.

How it breaks: a leaf that does not originate the route, or a route target that does not match, silently drops out of everyone's flood list. The signal: for each VNI, the number of type-3 originators against the number of leaves that should carry it.

## Ingress replication, traced and costed

Back to acme-web1's ARP. It reaches leaf1 in Amsterdam as a 60-byte frame, padded to Ethernet's minimum. Its suppression table has nothing for 10.1.1.50, so it copies the frame to its other VLAN 100 ports, like any switch. Then it reads its flood list for VNI 10100, four VTEPs, and builds four 110-byte VXLAN packets, the frame plus 50 bytes of outer headers, identical except for the outer destination.

Each copy is ordinary unicast to one loopback, hashed by ECMP on its own: three take spine1, one takes spine2. The two copies for Singapore cross the 10,500-kilometre circuit, one after the other. Each receiving leaf strips the outer headers and floods to its own access ports, never back into the fabric. That is split horizon: the ingress leaf already reached every VTEP, so passing a copy on would loop.

Count transmissions on every link: ingress replication makes 10, a multicast tree makes 6. The difference sits on the ingress leaf's uplinks, four copies against one, and on the long-haul circuit, two against one. Before going on: does multicast reduce the load on the leaves that receive the flood?

[pause]

No. Every VTEP in the VNI receives every flooded frame once, in both designs. Multicast moves copies off the ingress leaf and the shared links, nothing more.

The cost formula, in words: uplink load is n minus 1 copies, times the BUM packet rate, times the frame plus 50 bytes, times 8 bits. And shared long links multiply: with 20 Acme leaves in Singapore, one Amsterdam broadcast would cross the ocean 20 times. With multicast, once.

Now the numbers, for a leaf with four 100-gigabit uplinks. First, the trickle a well-run EVPN segment carries, assumed at 50 small frames a second: even at 256 VTEPs, about 11 megabits a second. Second, a tenant's 2-gigabit multicast stream of 1,000-byte packets: 2.1 gigabits per copy with the overhead. At 64 VTEPs, 63 copies make about 132 gigabits, a third of the leaf's uplinks for one tenant's stream. At 256 VTEPs it needs more than the uplinks have. Here is the sentence to remember: the deciding variable is the BUM rate, not the segment size.

Multicast pays in state instead. Each group needs an entry on every router in its tree, and once routers switch to per-source trees, every sending VTEP adds another, and in an overlay every VTEP sends. 500 groups with 64 VTEPs each puts up to 32,500 multicast routes on a router that sits on every tree: the same order as many switch chips' multicast tables.

## Underlay multicast and PIM

IP multicast addresses a packet to a group rather than a host; receivers join, and the network delivers one copy to each. Meridian maps VNI 10100 to 239.1.1.100, from the range kept inside one organisation. Every VTEP in the VNI is both a receiver and a sender. The common compromise packs many VNIs onto few groups, bounding state at the price of leaves dropping floods for VNIs they do not carry.

PIM, Protocol Independent Multicast, builds the trees. Protocol independent means it computes no routes of its own; it reuses the unicast table IS-IS built. Sparse mode forwards nothing until someone asks, and grows trees from receivers towards the source by explicit joins. Four ideas carry it.

First, reverse-path forwarding. A multicast packet has no single destination, so a router decides where it should come from instead: it accepts a packet only on the interface it would use to send unicast to the source, or, on the shared tree, to the rendezvous point. Anything else is dropped as an RPF failure. That check is PIM's loop prevention, and why a wrong unicast route breaks multicast too.

Second, the rendezvous point, the RP. Receivers cannot know which leaves will send, so every router agrees on one meeting point per group; on Meridian, spine1 in Amsterdam. Receivers' joins build a shared tree, the star-G tree, meaning any source for group G, from the RP down to them. Third, registers. A source's first router wraps each packet in a unicast Register message to the RP, which unwraps it and sends it down the shared tree, then joins a source tree back towards the sender and sends Register-Stop. Fourth, soft state. Joins are re-sent every 60 seconds and expire after 210, so a branch nobody refreshes disappears by itself.

Watch VNI 10100's tree come up. The Amsterdam leaves join towards spine1, the RP. The Singapore leaves join through spine1 in Singapore, which sends its own join across the circuit. Spine2 in Amsterdam received no join, so it carries no copies. Then leaf1 floods its ARP inside a Register; the RP sends it down every branch except back towards leaf1, joins a source tree to leaf1, and sends Register-Stop. From then on leaf1 sends one copy.

One catch in a Clos: PIM picks one equal-cost spine per tree, never per packet, so a heavy group is pinned to one spine. And two refinements matter in production. A single RP is a single point of failure for new sources, so fabrics run anycast RP: the same RP address on two or more spines, sharing active sources through PIM or MSDP. And where every VTEP sends to every group, bidirectional PIM keeps only the shared tree: one entry per group, whatever the number of senders.

## The DR and the assert

Two more PIM mechanisms exist for shared segments, where several PIM routers sit on one LAN and could both forward a group, duplicating every packet. The designated router, the DR, is elected from PIM hellos: highest priority, then highest IP address. It sends the Registers on the source side, and alone joins towards the RP on the receiver side. If it fails, the others wait out its 105-second holdtime, a gap BFD or a shorter hello can shrink.

The assert catches duplicates that slip through anyway. A router that sees a packet arrive on an interface it is itself forwarding that group onto sends an Assert, and both compare: source-tree state beats shared-tree state, then lower route preference, then lower metric to the source, then higher IP address. The loser stops forwarding that stream for 180 seconds.

The two elections are independent. Meridian's gateways gw1 and gw2 in Amsterdam share a VLAN, at 192.0.2.2 and 192.0.2.3, with equal priority, so gw2 is DR on the higher address. If both forward a stream from leaf1, and gw1's metric to it is 20 against gw2's 30, gw1 wins the assert and forwards that stream, while gw2 stays DR for everything else.

In the fabric itself this mostly does not matter: Meridian's underlay is all point-to-point links, two routers each. The DR and assert matter at the edges, where fabric multicast meets an external LAN, and on tenant VLANs routed by several leaves.

## The choice, and how it breaks

Most large EVPN fabrics use ingress replication; it is the default on Cumulus and SONiC. Five reasons. There is little to replicate: megabits, not gigabits. The ASIC copies at line rate, so the limit is flood-list size, hundreds to a few thousand VTEPs by platform. One protocol fewer: no PIM, no RP, and the flood list is ordinary BGP state. It crosses sites, because leased circuits often carry no multicast. And its failures are local: a wrong flood list hurts one VNI on one leaf, while a broken RP hurts every group that uses it.

Multicast wins where the arithmetic turns: hundreds of VTEPs with heavy flooding, real tenant multicast, and older flood-and-learn fabrics. Assisted replication is a middle path: one copy to a replicator node that sends the rest. And for tenant multicast, a leaf advertises the groups its hosts want in a type-6 route, so a feed wanted by 4 of 64 leaves costs 4 copies, not 63.

The failure to remember is the half-alive segment. Hosts that have talked for hours are fine, but a newly booted VM behind leaf4 gets no DHCP lease and answers no ARP. Leaf4 sends no type-3 route for the VNI, through a missing VNI or a route-target typo, so it is on nobody's flood list. Known unicast rides type-2 routes; every first broadcast is lost. A segment that passes every ping between known hosts and still breaks every new host is a BUM problem until proven otherwise.

Two more. A host's ARP entry, often four hours on routers and firewalls, outlives the leaf's 300-second MAC entry, so traffic to the silent host floods to every VTEP: a steady unknown-unicast rate, not spikes. And a loop on the tenant's side makes one VNI's BUM rate jump by orders of magnitude, which storm control on access ports contains.

So the platform should diff, per VNI, the intended VTEPs, the type-3 originators and each leaf's installed flood list, because a list can be wrong in BGP, in the kernel or in hardware.

## In the interview

A classic question: what does the RP do, and what happens if it dies?

[pause]

It is where receivers' shared-tree joins meet sources' Registers, because receivers cannot know the senders in advance. If it dies with no anycast RP, source trees already built keep forwarding, but new sources cannot register nor new receivers join. BUM senders are bursty, so a leaf that floods rarely lets its source state lapse and needs the RP again: flooding breaks between some leaf pairs, and the set grows over minutes. The wrong answer: everything stops at once.

And: ingress replication or multicast for a 300-leaf fabric? It depends on the BUM rate per VNI, not the leaf count. With ARP suppression and no tenant multicast, ingress replication: megabits even at 255 copies. With real tenant multicast, type-6 selective forwarding first. The wrong answer is that ingress replication does not scale, which ignores that receivers get every frame either way.

## Recap

Four things to remember. EVPN removes most BUM traffic, and type-3 routes build each VNI's flood list. Ingress replication puts n minus 1 copies on the ingress leaf's uplinks and long circuits, while receivers pay the same either way, so the BUM rate decides. PIM builds one-copy trees from reverse-path forwarding, a rendezvous point, registers and soft state, at the price of state and an RP failure domain; the DR and assert matter only on shared LANs. And "known hosts fine, new hosts broken" means a missing type-3 route.

At your desk: the two visualisations, the route and header tables, the models and scripts, the PIM trace, the comparison and failure tables, and the MAC learning switch problem.
