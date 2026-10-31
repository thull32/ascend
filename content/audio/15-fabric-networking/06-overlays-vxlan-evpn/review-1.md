---
review: overlays-vxlan-evpn
source: 5c3e028e3572ba06
---
## Introduction

Twelve questions from the overlays, VXLAN and EVPN module, the first of two reviews. Answer out loud before the answer comes.

They run in the order of the lessons: why overlays exist, the VXLAN encapsulation, EVPN as the control plane, and VRFs and multi-tenancy. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

Acme, on VNI 10100, and Globex, on VNI 10200, both use VLAN 100 and the subnet 10.1.1.0 slash 24, on different leaves of Meridian's Amsterdam fabric. On a link between a leaf and a spine, what keeps their frames apart?

A, the VNI in the VXLAN header, read only by the egress VTEP. B, a separate outer UDP destination port assigned to each tenant. C, per-tenant MAC tables on the spines, learned from EVPN. D, the VLAN tag 100, which each spine uses to pick a MAC table.

[think]

The answer is A: the VNI in the VXLAN header, read only by the egress VTEP.

The VLAN tag ends at the leaf. Each leaf maps its local VLAN to a VNI, and only the VNI crosses the fabric, inside the VXLAN header. The spines route on the outer IP header and hold no tenant MACs or EVPN state, so they cannot separate tenants and do not need to. And every tenant uses the same UDP destination port, 4789.

## Question 2

A colleague argues that a fabric with only 300 tenants, each needing two segments, does not need an overlay, because 600 segments fit in 4,094 VLANs. What is the strongest counter-argument?

A, VLAN tags cannot be carried over 400 gigabit per second fabric links. B, only VXLAN supports more than 254 hosts in one segment. C, stretched VLANs bring back spanning tree and MAC learning in the core. D, the 4,094 limit applies per port, so 600 segments overflow.

[think]

The answer is C: stretched VLANs bring back spanning tree and MAC learning in the core.

The VLAN count is the least important reason for an overlay. Trunking VLANs across a leaf-spine fabric reintroduces loops that need spanning tree, which blocks most uplinks; it makes every spine learn every tenant MAC; and it turns one loop into a fabric-wide storm. Segment size and link speed have nothing to do with tagging, and the 4,094 limit applies across a whole bridged domain, not to each port.

## Question 3

Every BGP EVPN session in the Singapore site is Established, and leaf1.ams still lists acme-web2's MAC behind 10.255.2.12, yet all traffic to hosts on leaf2.sin is lost. Where should you look first?

A, whether the outer UDP source ports have stopped varying. B, whether the route reflectors are forwarding the packets. C, whether the VNI-to-VLAN map on leaf1.ams changed. D, whether 10.255.2.12 slash 32 is in the underlay table.

[think]

The answer is D: whether 10.255.2.12 slash 32 is in the underlay table.

The overlay entry exists, so the overlay control plane is fine; it is only usable if its next hop, leaf2.sin's loopback, resolves in the underlay. A lost IS-IS adjacency or an unadvertised loopback leaves the EVPN table intact and forwards nothing. Route reflectors are never in the data path, and a mapping or hashing problem would not take out every host behind one leaf at once.

## Question 4

acme-web1 sends a 1,500-byte IP packet, which leaf1 in Amsterdam encapsulates in VXLAN over an IPv4 underlay. What is the smallest underlay IP MTU that carries it?

A, 1,550 bytes, because the 50 bytes include the inner Ethernet header. B, 1,536 bytes, because only the IP, UDP and VXLAN headers are added. C, 1,568 bytes, because both the outer and the inner frame checksums are counted. D, 1,500 bytes, because the outer header replaces the inner one.

[think]

The answer is A: 1,550 bytes, because the 50 bytes include the inner Ethernet header.

Inside the outer IP packet sit the outer IP header, 20 bytes, UDP, 8, VXLAN, 8, and the whole inner frame, whose 14-byte Ethernet header is now payload: 1,500 plus 50 is 1,550. Counting only 36 bytes forgets the inner Ethernet header. The outer header is added, not substituted. The inner frame checksum is not carried, and the outer one is not part of the IP MTU.

## Question 5

Why does a VTEP set the outer UDP source port from a hash of the inner headers?

A, it identifies the tenant segment to the egress VTEP. B, it gives ECMP distinct outer flows, one port per inner flow. C, it is randomised per packet to balance load across links. D, it lets the egress VTEP send replies back to the right flow.

[think]

The answer is B: it gives ECMP distinct outer flows, one port per inner flow.

Between two VTEPs the outer addresses, protocol and destination port never change, so without a varying source port every tunnelled flow would hash to one link. Hashing the inner flow gives each inner flow its own stable outer port, so flows spread and each stays on one path, in order. Randomising per packet would reorder TCP. The tenant is identified by the VNI, and replies get a port chosen by the other VTEP.

## Question 6

In flood-and-learn VXLAN, a virtual machine moves from leaf2 to leaf3 in Singapore and sends no announcement. Until when is traffic to it from leaf1 in Amsterdam lost?

A, until the multicast group re-floods every frame for 300 seconds. B, until it sends a frame, or leaf1's MAC entry ages out. C, until leaf2 forwards the frames on to the new VTEP. D, until BGP withdraws the old MAC route from leaf1.

[think]

The answer is B: until it sends a frame, or leaf1's MAC entry ages out.

Locations are learned only from traffic. Leaf1 keeps tunnelling to leaf2's address, and leaf2 keeps sending out its own port, until a frame from the virtual machine teaches the fabric its new VTEP, or the entry ages out, after 300 seconds by default. An egress VTEP never sends a frame back into the fabric, and flood-and-learn has no BGP routes to withdraw; that is the gap EVPN's type-2 routes and mobility sequence numbers fill.

## Question 7

Leaf2 in Amsterdam, which carries only the tenant Globex, receives acme-web1's type-2 route from the reflector and does not install it. Why?

A, its route targets, 65000 colon 10100 and 65000 colon 50001, match no import list on that leaf. B, its next hop, leaf1's address 10.255.1.11, cannot be resolved through the Amsterdam underlay. C, the reflector marked it with a cluster list that the leaf rejects as a loop. D, its route distinguisher, 10.255.1.11 colon 10100, is not configured on that leaf.

[think]

The answer is A: its route targets match no import list on that leaf.

Import is decided by route targets. The Globex leaf's tables import only Globex's targets, 65000 colon 10200 and 65000 colon 50002, so it discards the route. The distinguisher only makes the route unique and is never matched against local configuration. The cluster list holds the reflector's cluster ID, not the leaf's, so there is no loop, and leaf1's address is reachable through IS-IS.

## Question 8

After acme-web1 migrates, leaf2 in Singapore holds two type-2 routes for its MAC. One has the distinguisher from leaf1, 10.255.1.11, and no MAC mobility community. The other has the distinguisher from leaf4, 10.255.1.14, and sequence 1. Which does it install, and why?

A, both, load-balanced, because different distinguishers make them equal-cost paths. B, the one from leaf1, because the lower VTEP address breaks the tie. C, the one from leaf1, because BGP prefers the older and more stable route. D, the one from leaf4, because sequence 1 beats an absent community, which counts as 0.

[think]

The answer is D: the one from leaf4, because sequence 1 beats an absent community, which counts as 0.

The highest sequence wins, and the lower-address rule applies only when sequences are equal. BGP best path never compares the two, because their distinguishers make them different routes, which is exactly why the sequence number exists. Load-balancing one MAC across two single-homed leaves would deliver half the frames to a leaf the host has left.

## Question 9

Leaf4 in Amsterdam carries VNI 10100 but has stopped sending its type-3 route. What do you expect to see?

A, all traffic to leaf4's hosts stops, because the VTEP is withdrawn. B, other leaves stop sending it floods, so new ARP requests for its hosts fail. C, nothing, because type-2 routes already tell other leaves where its hosts are. D, duplicate frames at leaf4's hosts, because floods arrive by two paths.

[think]

The answer is B: other leaves stop sending it floods, so new ARP requests for its hosts fail.

Type 3 is how a leaf joins a VNI's flood list. Without it, no other leaf sends it broadcasts or unknown unicast, so ARP requests for its hosts that miss suppression never arrive, while flows to hosts already known through type-2 routes keep working. The VTEP itself is still reachable, and duplicates are a multihoming problem, not this one.

## Question 10

With symmetric IRB, acme-web1, 10.1.1.10 in VLAN 100 on leaf1.ams, sends a packet to acme-db1, 10.1.2.20 in VLAN 200 on leaf3.ams. Crossing the spine, what are the VNI and the inner destination MAC?

A, VNI 50001 and leaf3's router MAC address. B, VNI 50001 and acme-db1's own MAC address. C, VNI 10101 and acme-db1's own MAC address. D, VNI 10100 and the anycast gateway MAC address.

[think]

The answer is A: VNI 50001 and leaf3's router MAC address.

leaf1 routes the packet in VRF ACME and sends it in the tenant's L3VNI, 50001, addressed at layer 2 to the egress leaf's router MAC, learned from the router MAC extended community. leaf3 then routes again and writes acme-db1's MAC itself. VNI 10101 with acme-db1's MAC is what asymmetric IRB would send, and the anycast gateway MAC is used only between a host and its own leaf.

## Question 11

A virtual machine with gateway 10.1.1.1 migrates live from leaf1.ams to leaf4.ams in an anycast-gateway fabric. Why can it route through its new leaf immediately?

A, every leaf owns the same gateway MAC, so its ARP cache stays valid. B, leaf4 sends it a gratuitous ARP with its own gateway MAC. C, EVPN rewrites the machine's ARP cache through the type-2 route. D, its traffic hairpins to leaf1 until its ARP cache expires.

[think]

The answer is A: every leaf owns the same gateway MAC, so its ARP cache stays valid.

The distributed anycast gateway uses the same gateway IP and MAC on every leaf, so the machine's cached entry for 10.1.1.1 is still correct after the move, and leaf4 routes the first packet. The type-2 route with a higher MAC mobility sequence number updates the other leaves, not the machine. The hairpin is what happens when leaves use different gateway MACs.

## Question 12

Meridian's VRF SERVICES imports Acme's and Globex's routes so that both can use the shared DNS server. Both tenants have a host at 10.1.1.10. What happens?

A, DNS replies are flooded to both tenants in their own L2VNIs. B, the second import is rejected because the two prefixes overlap. C, SERVICES gets two paths to one prefix and answers the wrong tenant. D, the distinguishers keep the two hosts apart inside the SERVICES table.

[think]

The answer is C: SERVICES gets two paths to one prefix and answers the wrong tenant.

BGP carried both routes because their distinguishers differ, but the distinguisher is stripped when a route is installed in a VRF. In SERVICES there are two paths to 10.1.1.10, best path picks one, and replies meant for one tenant go to the other tenant's host. Nothing rejects overlapping imports automatically. The fixes are per-tenant NAT, unique shared ranges, or per-VRF firewall legs.

## Recap

Three ideas kept coming back. The spines know nothing about tenants: they route on the outer header to a VTEP loopback, so their tables stay the same size however many tenants ride on top, and every tenant decision happens at the leaves.

The underlay still has to be right underneath. VXLAN adds 50 bytes, so a full-size packet needs 1,550 bytes on every link, and an overlay route is only usable when its next hop resolves in the underlay.

And in EVPN, the route target decides what a leaf installs, while the route distinguisher only makes routes unique inside BGP. Copied targets leak routes between tenants; stripped distinguishers make overlapping addresses collide in a shared VRF.
