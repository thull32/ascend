---
lesson: evpn-multihoming
source: 9ded31943b4529d6
fit: partial
desk:
  - "The ESI type table, and the type-3 ESI and the type-4 route field by field"
  - "The DF election code: modulo against HRW, VLAN against VNI, and the three-leaf reshuffle"
  - "The type-1 route tables and the remote-leaf aliasing model with its hardware-write count"
  - "The local bias table: four flooded frames and the copies each server receives"
  - "The mass withdrawal timeline and sequence diagram"
  - "The EVPN multihoming visualisation, end to end on Meridian"
  - "The MLAG comparison table and the failure modes table"
  - "The segment audit code and its findings"
---
## Introduction

Acme's web server in Singapore, acme-web2, has two 25 gigabit links, one to leaf1 in Singapore and one to leaf2, bundled on the server into one LACP bond, so it survives a leaf failing or being upgraded. Two independent leaves on one server create four problems a single leaf never has.

A broadcast from the fabric reaches both leaves, so the server could receive it twice. A broadcast from the server can come back to it through the other leaf. A remote leaf learns the server's MAC from whichever leaf saw it first and sends everything there, idling the other link. And when one link fails, every remote leaf must quickly stop using that leaf for every MAC behind the bond.

MLAG answers all four with a cable between the two leaves and a vendor protocol over it. EVPN multihoming answers them with BGP: two new route types, one field in an existing one, an election, and a forwarding rule. It comes from RFC 7432, in 2015, adapted to VXLAN by RFC 8365, in 2018.

So: the ethernet segment and how its members find each other. The designated forwarder and split horizon, for the two flooding problems. Aliasing, for the idle link. Mass withdrawal, for failover. And the comparison with MLAG.

## The segment and type-4 routes

An ethernet segment is the set of links connecting one device, a server, a hypervisor or a customer's switch, to two or more leaves. Its name is the ESI, the ethernet segment identifier: 10 bytes. The whole design hangs on one rule. Every leaf on the segment configures the same ESI towards the device, and no other segment in the fabric uses it.

The first byte is a type saying how the other nine were built. Meridian uses type 3: a 6-byte MAC address plus a 3-byte local discriminator. Both Singapore leaves share one segment system MAC, and give acme-web2's bond discriminator 1.

Here is the trap. The server never sees the ESI. It sees LACP, the protocol that decides which links join a bond, and both leaves must send the same LACP system ID. If not, the server thinks its links go to two partners, puts them in different aggregators, and carries traffic on one. So two things must match: the ESI, which the fabric reads, and the LACP system ID, which the server reads. Type-3 designs derive both from one configured MAC.

Segments are all-active, where every member forwards known unicast, the common case for anything that bonds; or single-active, for devices that cannot bond, where only the elected forwarder carries traffic. Everything here is all-active.

Next, the members must find each other without a peer link. When the bond port comes up, each leaf advertises an ethernet segment route, EVPN type 4, with the ESI and its own address. Its route target, the ES-Import target, is derived from the ESI itself, so every leaf on the segment imports it automatically and every other leaf discards it. The reflectors must still pass it on. A reflector policy written only for the per-VNI targets, or RT constraint, can drop it, and then each member concludes it is alone.

## The designated forwarder and split horizon

Ingress replication sends every flooded frame in Acme's VNI 10100 to every leaf carrying the VNI, so both Singapore leaves receive every ARP request acme-web1 broadcasts from Amsterdam. If both delivered it, acme-web2 would see each twice: harmless for ARP, wrong for multicast or a cluster heartbeat. So per segment and VLAN, the members elect a designated forwarder, the DF: the only member that sends flooded traffic from the fabric down to the segment.

The default election, service carving, needs nothing beyond the type-4 routes. Advertise, wait the DF timer, 3 seconds by default, to collect the others. Sort the members' addresses, lowest first, numbered from zero. For each VLAN, the DF is the member at position VLAN modulo the number of members. Everyone computes the same list, so nobody negotiates. VLAN 100 modulo 2 is zero: leaf1 is DF.

The point people get wrong: the DF governs one direction of one kind of traffic. A known unicast frame for acme-web2 arriving at leaf2 goes down leaf2's link, DF or not. The non-DF is not a standby.

Modulo has three problems. Imbalance: VLANs are numbered in round tens and hundreds, and with two members every even VLAN lands on position zero; give the segment VLANs 100 through 1000 and leaf1 is DF for all ten. Reshuffling: when a member leaves, the divisor changes and most VLANs move. On a three-leaf segment with twelve VLANs, losing one leaf should move four; modulo moves eight.

The third is the nastiest. Some implementations elect on the VNI instead of the VLAN, and the bond also carries VLAN 200, which is VNI 10101. If leaf1 computes from the VLAN and leaf2 from the VNI, who is DF for VLAN 200?

[pause]

Both. 200 modulo 2 gives leaf1; 10101 modulo 2 gives leaf2. The server gets duplicates on that VLAN only. The other way round, neither is DF, and floods are black-holed. Mixed vendors or releases disagree in exactly this way.

RFC 8584, from 2019, added highest random weight, or rendezvous hashing: score each member with a hash of the VLAN, the ESI and its address, highest wins. A departure moves only the departed member's VLANs, exactly five in the three-leaf example. It balances only over many VLANs: 6, 1 and 5 over twelve, but 344, 333 and 323 over a thousand.

Now the reverse problem. acme-web2's bond hashes an ARP request to leaf2, which floods it to every leaf in the VNI, leaf1 included. By the DF rule alone, leaf1 would send it down to acme-web2, and the server would receive its own frame; a hypervisor's bridge would relearn its own machines' MACs on the uplink. Split horizon forbids that: a frame from a segment never goes back into it.

MPLS-based EVPN marks such frames with a label. VXLAN has no room for one: its header carries a single 24-bit VNI. So RFC 8365 uses local bias, keyed on the outer source IP. A leaf receiving a flood from a local segment delivers it to all its other local ports, even where it is not DF. A leaf receiving a flood from the fabric sends nothing to any segment it shares with the sending leaf, DF or not, because the sender already delivered it there.

A leaf knows who shares what from the per-ES type-1 routes, coming next; miss one, and the echo returns. And since the outer source must identify one leaf, multihoming cannot hide the pair behind one anycast VTEP, as MLAG does.

## Aliasing

Many bonds hash on MAC addresses alone, and all of acme-web2's routed traffic goes to one gateway MAC, so it leaves on one link. Say that is leaf2's. Leaf2 learns the MAC and advertises a type-2 route; leaf1 may never see a frame from it. Every remote leaf sends everything to leaf2, and leaf1's link idles.

Aliasing fixes that: remote leaves send to every member that reaches the segment, whoever learned the MAC. Two additions. The type-2 route carries the segment's ESI instead of zeros. And each member advertises Ethernet auto-discovery routes, EVPN type 1, in two flavours: per ES, one per segment, carrying the all-active flag and serving mass withdrawal; and per EVI, one per segment and VNI, serving aliasing. A member counts only if the remote leaf holds both.

So the Amsterdam leaf, holding leaf2's type-2 route with the ESI plus both type-1 routes from both leaves, installs the MAC behind both and hashes each flow onto one; in the lesson's model, eight flows split four and four. Meanwhile the reflector also sends leaf2's type-2 to leaf1, which sees its own ESI and installs the MAC locally, so an aliased frame is not flooded.

When aliasing breaks, nothing goes down. A reflector filter drops the type-1 routes, every session stays up, and half the server's inbound capacity quietly disappears. The signal: VTEPs installed per multihomed MAC at remote leaves, and one member's inbound traffic near zero.

## Mass withdrawal

Now the story the design is built for. The link between acme-web2 and leaf2 dies. Within milliseconds of losing light, the server's LACP moves everything to leaf1. The fabric's side is harder. Every remote leaf has an entry for every MAC on the segment pointing partly at leaf2, and a hypervisor with 500 virtual machines is 500 MACs. Withdrawing 500 type-2 routes costs every remote leaf 500 hardware writes, tens of milliseconds to seconds, and until an entry changes, traffic hashed to leaf2 is lost.

Mass withdrawal replaces 500 with one. Leaf2 withdraws its per-ES type-1 route. The reflectors carry it, to Amsterdam too, about 53 milliseconds one way. Each remote leaf drops leaf2 from the segment's VTEP set, and every MAC pointing at that set moves at once. Leaf1 reruns the election alone and becomes DF for everything. Type-2 withdrawals follow as bookkeeping. One write needs indirection, each MAC pointing at the segment and the segment at its VTEPs; without it, the lesson's model counts 500.

Harder case: leaf2 loses power. How do remote leaves find out?

[pause]

Not from a withdrawal; a dead leaf sends nothing. Its loopback vanishes from IS-IS, and BGP's next-hop tracking voids every route with that next hop, type-1 and type-2 alike. That needs each loopback carried as its own slash 32. Behind an aggregate, remote leaves wait for the hold timer: 9 seconds with a 3-second keepalive, 90 or more with common defaults. Link failure rides on BGP; leaf failure rides on the IGP.

Two more failures turn redundancy against the server. Core isolation: a leaf loses every uplink while its server links stay up, so half the server's outbound flows go nowhere, and nothing is withdrawn because the segment looks fine. Uplink tracking fixes it by taking the segment ports down. And after a reboot, ports come up in seconds and routes much later, so implementations hold segment ports down for a startup delay, 180 seconds by default in FRRouting. Hence upgrading a pair one member at a time.

## Against MLAG

MLAG makes two leaves act as one switch over a peer link, and in VXLAN the pair shares an anycast VTEP. Type-2 routes carry ESI zero and the anycast next hop, and no type-1 or type-4 routes exist; a fabric with only types 2, 3 and 5 is an MLAG fabric, not a broken multihoming one. Remote leaves see one VTEP, so no aliasing; no DF election; and when a server link fails, nothing in BGP changes, while about half the inbound traffic crosses the peer link.

The trade: MLAG has exactly two members, a peer link to size, split brain as its worst failure, and barely any visibility. Multihoming has two or more members, no peer link, DF disagreement and ESI errors as its worst failures, and full visibility in BGP, for modest state: 24 dual-homed servers with four VNIs each cost a pair 288 routes. Sometimes the answer is neither: Meridian's GPU cluster single-homes every NIC to its rail's leaf and survives a lost rail by slowing down.

## In the interview

Duplicate broadcasts on dual-homed servers, in one pod only. Where do you look?

[pause]

Scope first. Every segment on the pair points at discovery: type-4 routes not arriving, so each member elects itself. Some VLANs only, often odd VNIs, points at the election: different algorithms or inputs, usually a version difference. One server points at its ESI. You can defer to the network team on the platform's DF options, but the audit comparing DF claims across members is the tool to build. The wrong answer is a spanning-tree loop, which would melt the VLAN, not double each frame.

And what should that tooling show? Each segment as one object from all its members: the ESI and LACP partner each sees, exactly one DF per VLAN, the VTEP count at remote leaves, two of two links or one of two, isolated members, and failover time.

## Recap

Five things. Every member configures the same unique ESI, and the LACP system ID must match too. Type-4 routes find the members; the DF, per VLAN, governs only floods into the segment, and HRW fixes modulo's imbalance and reshuffle. Local bias keys split horizon on the outer source IP, ruling out an anycast VTEP. Aliasing needs the ESI in the type-2 route plus both type-1 routes, and fails silently. And one per-ES withdrawal moves every MAC on a failed link, while a dead leaf is caught by the underlay.

At your desk: the ESI and type-4 field tables, the DF election code, the type-1 tables and aliasing model, the local bias table, the withdrawal timeline, the visualisation, the MLAG and failure tables, and the segment audit.
