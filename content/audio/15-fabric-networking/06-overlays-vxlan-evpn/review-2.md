---
review: overlays-vxlan-evpn
source: 5c3e028e3572ba06
---
## Introduction

Twelve questions from the overlays, VXLAN and EVPN module, the second of two reviews. Answer out loud before the answer comes.

They run in the order of the lessons: broadcast, unknown unicast and multicast traffic, EVPN multihoming, the overlay packet walk, and MPLS and segment routing. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

VNI 10100 spans 64 VTEPs, runs ingress replication, and floods tenant multicast to the whole VNI. A tenant starts a 2-gigabit-a-second multicast stream from a host on one leaf. What happens to that leaf's uplinks, compared with an underlay multicast design?

A, they carry about 63 copies either way, because every receiver needs one. B, they carry about 63 copies, over 130 gigabits a second, against one copy with multicast. C, they carry two copies, one per spine, because ECMP splits the flood. D, they carry one copy either way, because the spines do the replication.

[think]

The answer is B: about 63 copies, over 130 gigabits a second, against one copy with multicast.

With ingress replication the ingress leaf makes one unicast copy per remote VTEP, 63 here, so 2.1 gigabits on the wire per copy becomes about 132 gigabits on its uplinks. With underlay multicast it sends one copy, and the tree replicates at its branches. Spines never replicate unicast VXLAN copies. Receivers do each get one copy in both designs, but that is downstream of the ingress leaf, not on its uplinks.

## Question 2

Why does underlay multicast not reduce the BUM load on each receiving leaf?

A, receivers get two copies, one from the RP and one from the source. B, multicast copies are larger, because they carry a PIM header. C, receivers must send a PIM join for every frame they want. D, each VTEP in the VNI receives every BUM frame once in both designs.

[think]

The answer is D: each VTEP in the VNI receives every BUM frame once in both designs.

Flooding means every member of the segment gets the frame. Ingress replication delivers that one copy by unicast, multicast by the tree, so either way each receiver handles each BUM frame once. Data packets carry no PIM header, joins are periodic per group rather than per frame, and duplicates from the RP and the source tree occur only briefly during switchover.

## Question 3

An operator changes an IS-IS metric during maintenance. Unicast keeps working, but BUM traffic between some leaves in multicast mode drops for a while. What is the most likely mechanism?

A, the type-3 routes are withdrawn because their next hop's metric changed. B, IS-IS floods the change as multicast, and the RP drops it as unknown. C, PIM recomputes its own shortest paths and loses its adjacencies on the change. D, the RPF check drops packets arriving on the old path until the tree rejoins.

[think]

The answer is D: the RPF check drops packets arriving on the old path until the tree rejoins.

PIM uses the unicast table for reverse-path forwarding: a packet is accepted only on the interface towards its source or RP. When the unicast path moves, packets on the old interface fail the check until joins rebuild the tree along the new path. PIM computes no routes of its own, type-3 routes do not depend on IGP metrics, and IS-IS flooding is not routed multicast through the RP.

## Question 4

Leaf1 in Singapore is the designated forwarder for VLAN 100 on acme-web2's all-active segment, and leaf2 in Singapore is not. Which traffic does that difference govern?

A, flooded broadcast, unknown unicast and multicast traffic arriving from the fabric towards acme-web2. B, routed traffic through the anycast gateway on VLAN 100. C, all unicast towards acme-web2, which only the DF may deliver. D, every frame acme-web2 sends, which only the DF may accept.

[think]

The answer is A: flooded traffic arriving from the fabric towards acme-web2.

In all-active mode the DF only decides who delivers flooded traffic from the fabric into the segment, per VLAN, so the server gets one copy. Known unicast is delivered by whichever member a remote leaf's hash picks, and the server's own frames are accepted on whichever link its bond uses. Single-active mode is where the DF also carries unicast.

## Question 5

Leaf1 in Amsterdam holds a type-2 route for acme-web2's MAC from leaf2 in Singapore only, carrying the segment's ESI. It also holds per-ES and per-EVI type-1 routes for that ESI from both Singapore leaves, 10.255.2.11 and 10.255.2.12. Where does it send acme-web2's traffic?

A, flooded to both VTEPs until leaf1 in Singapore learns the MAC too. B, to 10.255.2.12 only, the VTEP that advertised the MAC. C, hashed per flow over 10.255.2.11 and 10.255.2.12. D, to 10.255.2.11 only, the lower address and so the DF.

[think]

The answer is C: hashed per flow over both VTEPs.

This is aliasing. The ESI in the type-2 route says the MAC is on the segment, and the type-1 routes say both leaves reach that segment in this VNI, so the MAC is installed behind both VTEPs and flows are hashed across them. Being DF is irrelevant to unicast, and nothing is flooded because the MAC is known.

## Question 6

A hypervisor with 500 virtual machines is dual-homed to two leaves. The link to one leaf fails. What lets remote leaves move all 500 MACs to the surviving leaf at once?

A, the leaf that lost the link withdrawing its per-ES type-1 route. B, the leaf that lost the link withdrawing its 500 type-2 routes. C, the surviving leaf re-advertising all 500 MACs with a higher sequence number. D, the reflectors' hold timer expiring for that leaf's session.

[think]

The answer is A: the leaf that lost the link withdrawing its per-ES type-1 route.

Remote leaves resolve every MAC on the segment through the segment's set of VTEPs, so withdrawing that one route removes the leaf for all of them, ideally with one hardware write. Type-2 withdrawals and re-advertisements follow but are no longer on the critical path. The leaf is alive, so its BGP sessions and hold timers are unaffected.

## Question 7

acme-web1, behind leaf1 in Amsterdam, sends a full-size frame to acme-web2, behind leaf2 in Singapore, in the same subnet. On the circuit between spine1 in Amsterdam and spine1 in Singapore, which fields differ from what leaf1 originally put on its uplink?

A, the outer MACs and the outer time to live, both set again by spine1 in Amsterdam. B, the outer destination IP, rewritten to spine1 in Singapore's loopback. C, the outer MACs, the outer time to live and the inner time to live. D, the VNI, which each spine rewrites for its own site.

[think]

The answer is A: the outer MACs and the outer time to live, both set again by spine1 in Amsterdam.

The spine forwards on the outer destination IP only: it rewrites the outer MACs for the next link and decrements the outer time to live, patching the outer checksum. The outer IPs stay VTEP to VTEP, and the VNI, the UDP ports and the inner frame are untouched. The inner time to live falls only where the inner packet is routed, and this frame is bridged, so it stays 64 end to end.

## Question 8

Why does leaf1 in Amsterdam answer acme-web1's ARP for 10.1.1.11 itself, instead of flooding it?

A, the spines cache ARP replies for remote hosts in their forwarding tables. B, its suppression table holds the IP from leaf2 in Singapore's type-2 route. C, its anycast gateway owns every address in the subnet. D, leaf2 in Singapore forwards a copy of every ARP reply to all leaves.

[think]

The answer is B: its suppression table holds the IP from leaf2 in Singapore's type-2 route.

A type-2 route carries a MAC and optionally an IP. leaf1 imported leaf2's route for acme-web2's MAC with 10.1.1.11, and uses that binding to reply locally, so nothing crosses the circuit. The anycast gateway answers only for the gateway address, and the spines hold no tenant state at all.

## Question 9

Globex is configured on leaf2 in Amsterdam by copying Acme's configuration from leaf1; the VNIs are changed, but the route distinguishers and route targets are not. What actually makes Acme's segment on leaf2 in Singapore install globex-app1's MAC?

A, the route distinguisher, which makes the route look like leaf1's. B, the label VNI 10200, which leaf2 in Singapore maps into VLAN 100. C, the route reflector, which rewrites the next hop to leaf1. D, the route target 65000 colon 10100, which Acme's VNI imports.

[think]

The answer is D: the route target 65000 colon 10100, which Acme's VNI imports.

Import is decided by the route target alone: any segment importing that target installs the route. The duplicate route distinguisher does not change that, and for type-2 routes it does not even collide, because the BGP key also includes the MAC. Label VNI 10200 is what leaf2 in Singapore later puts in the VXLAN header, and the reflector leaves the next hop as leaf2 in Amsterdam's VTEP.

## Question 10

p1.sin receives Acme's packet carrying label 24017 on top of label 92001, and forwards it towards p1.ams. Which part of the packet does p1.sin use to decide?

A, the top label, 24017, by exact match in its label table. B, the VPN label, 92001, to find the right tenant table. C, the destination address, 10.1.2.20, by longest-prefix match. D, both labels together, matched as one combined key.

[think]

The answer is A: the top label, 24017, by exact match in its label table.

A P router reads only the top label, looks it up in its label forwarding table, swaps it for 24031 and forwards. It never reads the VPN label or the IP header, which is why it needs no Acme routes, just as a spine reads only the outer header of a VXLAN packet. Only pe1.ams, which allocated 92001, interprets the VPN label.

## Question 11

After a change, pe1.sin still pings pe1.ams's loopback, 10.255.1.241, but every Acme VPN route via pe1.ams shows as hidden on pe1.sin. The IGP now carries the slash 24, 10.255.1.0, instead of the loopback's own slash 32. Why?

A, the route distinguisher changed when the loopback was summarised. B, the route target no longer matches the summary prefix. C, LDP binds labels only to exact routing-table matches, so no LSP exists. D, ping uses ICMP, and VPN routes need the BGP session reset.

[think]

The answer is C: LDP binds labels only to exact routing-table matches, so no LSP exists.

A VPN route is usable only if its next hop resolves to a labelled path. With only the slash 24 in the IGP, no LSP to the slash 32 is built, so the VPN routes are held but not installed. IP reachability to the summary is unaffected, which is why ping works. Route distinguishers and route targets are configured values that summarisation does not touch.

## Question 12

Why do data-center fabrics usually choose VXLAN over MPLS for tenant overlays?

A, any IP fabric carries VXLAN, and hosts and SmartNICs can be endpoints. B, VXLAN has less overhead per packet than an MPLS label stack. C, MPLS cannot carry more than a few thousand tenants in one fabric. D, MPLS label lookups are too slow for today's switch chips.

[think]

The answer is A: any IP fabric carries VXLAN, and hosts and SmartNICs can be endpoints.

VXLAN needs nothing from the core but IP routing, servers, hypervisors and SmartNICs can encapsulate it, and its UDP source port gives ECMP entropy. MPLS has less overhead, 8 bytes against 50, not more, and label lookups are fast. With 20-bit labels and a VPN label per VRF, tenant count is not the constraint. The overhead matters on expensive backbone circuits, not inside jumbo-frame fabrics.

## Recap

Three ideas kept coming back. Each EVPN route type has one job: type 2 says where a MAC lives, type 1 says which leaves reach a multihomed segment, type 3 joins the flood list, and type 4 elects the designated forwarder. Most of these failures come from one of them going missing.

Flooding costs land in different places in different designs. Ingress replication puts one copy per remote VTEP on the sending leaf's uplinks, multicast puts one copy on the wire and leans on the unicast table, and every receiver handles each flood once either way.

And the core reads only what it needs. A spine reads the outer header, a P router reads the top label, and neither holds a tenant route; the edge does the tenant work, which is why VXLAN runs over any IP fabric.
