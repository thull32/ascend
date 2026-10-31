---
lesson: vxlan-encapsulation
source: c25a6323e5050a96
---
## 1

acme-web1 sends a 1,500-byte IP packet, which leaf1 in Amsterdam encapsulates in VXLAN over an IPv4 underlay. What is the smallest underlay IP MTU that carries it?

A, 1,550 bytes, because the 50 bytes include the inner Ethernet header. B, 1,536 bytes, because only the IP, UDP and VXLAN headers are added. C, 1,568 bytes, because both the outer and the inner frame checksums are counted. D, 1,500 bytes, because the outer header replaces the inner one.

[think]

The answer is A: 1,550 bytes, because the 50 bytes include the inner Ethernet header.

Inside the outer IP packet sit the outer IP header, 20 bytes, UDP, 8, VXLAN, 8, and the whole inner frame, whose 14-byte Ethernet header is now payload: 1,500 plus 50 is 1,550. Counting only 36 bytes forgets the inner Ethernet header. The outer header is added, not substituted. The inner frame checksum is not carried, and the outer one is not part of the IP MTU.

## 2

spine1 in Amsterdam receives a VXLAN packet from leaf1. Which fields does it use to forward it?

A, the VNI, to choose the tenant's routing table for the lookup. B, the inner destination IP, looked up in the tenant's VRF. C, the outer destination IP, plus the outer ports for the ECMP hash. D, the inner destination MAC, looked up in its EVPN MAC table.

[think]

The answer is C: the outer destination IP, plus the outer ports for the ECMP hash.

A spine routes the outer packet like any UDP packet: a longest-prefix match on the destination VTEP address, with the outer five-tuple hashed to choose among equal-cost links. It has no MAC table, VNI or tenant routes, which is why spines need no VXLAN or EVPN support. Only the egress VTEP reads the VNI and the inner frame.

## 3

Why does a VTEP set the outer UDP source port from a hash of the inner headers?

A, it identifies the tenant segment to the egress VTEP. B, it gives ECMP distinct outer flows, one port per inner flow. C, it is randomised per packet to balance load across links. D, it lets the egress VTEP send replies back to the right flow.

[think]

The answer is B: it gives ECMP distinct outer flows, one port per inner flow.

Between two VTEPs the outer addresses, protocol and destination port never change, so without a varying source port every tunnelled flow would hash to one link. Hashing the inner flow gives each inner flow its own stable outer port, so flows spread and each stays on one path, in order. Randomising per packet would reorder TCP. The tenant is identified by the VNI, and replies get a port chosen by the other VTEP.

## 4

In a site with four spines, about a quarter of large transfers between hosts behind two leaves hang, while pings and SSH logins work. What is the most likely cause?

A, the VLAN-to-VNI mapping differs between the two leaves. B, path MTU discovery is shrinking segments too slowly on some flows. C, the VTEPs write one constant outer source port for every flow. D, one underlay link on one spine has an IP MTU below 1,550.

[think]

The answer is D: one underlay link on one spine has an IP MTU below 1,550.

Small packets fit everywhere, and ECMP puts roughly a quarter of the outer flows on the spine with the undersized link, so only those flows fail once they send full-size packets. A wrong VNI mapping would break all traffic, small packets included. A constant source port would put every flow on one spine, so none or all would fail. And path MTU discovery does not operate for bridged VXLAN traffic: the ICMP goes to the leaf, not the host.

## 5

In flood-and-learn VXLAN, a virtual machine moves from leaf2 to leaf3 in Singapore and sends no announcement. Until when is traffic to it from leaf1 in Amsterdam lost?

A, until the multicast group re-floods every frame for 300 seconds. B, until it sends a frame, or leaf1's MAC entry ages out. C, until leaf2 forwards the frames on to the new VTEP. D, until BGP withdraws the old MAC route from leaf1.

[think]

The answer is B: until it sends a frame, or leaf1's MAC entry ages out.

Locations are learned only from traffic. Leaf1 keeps tunnelling to leaf2's address, and leaf2 keeps sending out its own port, until a frame from the virtual machine teaches the fabric its new VTEP, or the entry ages out, after 300 seconds by default. An egress VTEP never sends a frame back into the fabric, and flood-and-learn has no BGP routes to withdraw; that is the gap EVPN's type-2 routes and mobility sequence numbers fill.

## 6

Acme uses VLAN 100 on leaf1 in Amsterdam, and Globex uses VLAN 100 on leaf2 in Amsterdam. How does the fabric keep them apart?

A, different VNIs, since a VLAN ID is local to its leaf. B, the same VNI, isolated by different outer source ports. C, the same VNI, isolated by the inner VLAN tag carried across. D, different VNIs, since a fabric allows each VLAN ID only once.

[think]

The answer is A: different VNIs, since a VLAN ID is local to its leaf.

Each leaf maps port and VLAN to a VNI at ingress and strips the tag: Acme's VLAN 100 becomes 10100 and Globex's becomes 10200, and every egress leaf maps the VNI back to its own local VLAN. The inner tag is not carried by default, source ports carry flow entropy rather than tenant identity, and nothing stops many leaves using the same VLAN number for different tenants.
