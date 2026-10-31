---
lesson: evpn-multihoming
source: 73154cb8258e22c1
---
## 1

Leaf1 in Singapore is the designated forwarder for VLAN 100 on acme-web2's all-active segment, and leaf2 in Singapore is not. Which traffic does that difference govern?

A, flooded broadcast, unknown unicast and multicast traffic arriving from the fabric towards acme-web2. B, routed traffic through the anycast gateway on VLAN 100. C, all unicast towards acme-web2, which only the DF may deliver. D, every frame acme-web2 sends, which only the DF may accept.

[think]

The answer is A: flooded traffic arriving from the fabric towards acme-web2.

In all-active mode the DF only decides who delivers flooded traffic from the fabric into the segment, per VLAN, so the server gets one copy. Known unicast is delivered by whichever member a remote leaf's hash picks, and the server's own frames are accepted on whichever link its bond uses. Single-active mode is where the DF also carries unicast.

## 2

Leaf1 in Amsterdam holds a type-2 route for acme-web2's MAC from leaf2 in Singapore only, carrying the segment's ESI. It also holds per-ES and per-EVI type-1 routes for that ESI from both Singapore leaves, 10.255.2.11 and 10.255.2.12. Where does it send acme-web2's traffic?

A, flooded to both VTEPs until leaf1 in Singapore learns the MAC too. B, to 10.255.2.12 only, the VTEP that advertised the MAC. C, hashed per flow over 10.255.2.11 and 10.255.2.12. D, to 10.255.2.11 only, the lower address and so the DF.

[think]

The answer is C: hashed per flow over both VTEPs.

This is aliasing. The ESI in the type-2 route says the MAC is on the segment, and the type-1 routes say both leaves reach that segment in this VNI, so the MAC is installed behind both VTEPs and flows are hashed across them. Being DF is irrelevant to unicast, and nothing is flooded because the MAC is known.

## 3

A hypervisor with 500 virtual machines is dual-homed to two leaves. The link to one leaf fails. What lets remote leaves move all 500 MACs to the surviving leaf at once?

A, the leaf that lost the link withdrawing its per-ES type-1 route. B, the leaf that lost the link withdrawing its 500 type-2 routes. C, the surviving leaf re-advertising all 500 MACs with a higher sequence number. D, the reflectors' hold timer expiring for that leaf's session.

[think]

The answer is A: the leaf that lost the link withdrawing its per-ES type-1 route.

Remote leaves resolve every MAC on the segment through the segment's set of VTEPs, so withdrawing that one route removes the leaf for all of them, ideally with one hardware write. Type-2 withdrawals and re-advertisements follow but are no longer on the critical path. The leaf is alive, so its BGP sessions and hold timers are unaffected.

## 4

Why does EVPN over VXLAN implement split horizon with local bias, rather than with an ESI label as MPLS-based EVPN does?

A, VXLAN encrypts its payload, so labels cannot be read by the egress leaf. B, VXLAN fabrics use MLAG anycast VTEPs that make labels redundant. C, VXLAN carries one 24-bit VNI and has no room for a second label. D, VXLAN's UDP header already marks frames that came from a segment.

[think]

The answer is C: VXLAN carries one 24-bit VNI and has no room for a second label.

With no label stack, the receiving leaf uses the outer source IP instead: it never forwards a flooded frame to a segment it shares with the sending VTEP, and the sending leaf delivers to its own local segments itself. That is why local bias needs a unique VTEP address per leaf, which rules out MLAG's anycast VTEP. VXLAN is not encrypted, and the UDP header carries only ports.

## 5

Every dual-homed server on one leaf pair receives two copies of each broadcast, on every VLAN. Which cause fits best?

A, the type-1 routes never reached remote leaves, so aliasing is off. B, one member computes the DF from the VNI and the other from the VLAN. C, a spanning-tree loop formed between the two leaves of the pair. D, neither member gets the other's type-4 route, so each elects itself.

[think]

The answer is D: neither member gets the other's type-4 route, so each elects itself.

Without the peer's type-4 route, each member believes it is alone on every segment and becomes DF for every VLAN, so both deliver every flood. A VLAN-or-VNI disagreement affects only the services where the two inputs give different answers, such as odd VNIs. Missing type-1 routes break load sharing, not flooding, and a layer-2 loop multiplies frames without limit rather than doubling them.

## 6

Leaf2 in Singapore, 10.255.2.12, loses power. It was a member of 40 multihomed segments. How do remote leaves stop sending traffic to it?

A, the underlay loses 10.255.2.12, and next-hop tracking voids its routes. B, each remote leaf's MAC aging timer expires for every affected MAC. C, leaf2 sends per-ES withdrawals for all 40 segments as it fails. D, the surviving member withdraws leaf2's routes on its behalf.

[think]

The answer is A: the underlay loses its address, and next-hop tracking voids its routes.

A powered-off leaf sends nothing. Its spines see the links go dark, IS-IS withdraws its loopback, and BGP's next-hop tracking on every remote leaf marks all routes with that next hop unusable, type-1 and type-2 alike. No leaf withdraws another's routes, and waiting for MAC aging would take minutes.
