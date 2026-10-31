---
lesson: bum-traffic
source: 847dac88e1a93af6
---
## 1

VNI 10100 spans 64 VTEPs, runs ingress replication, and floods tenant multicast to the whole VNI. A tenant starts a 2-gigabit-a-second multicast stream from a host on one leaf. What happens to that leaf's uplinks, compared with an underlay multicast design?

A, they carry about 63 copies either way, because every receiver needs one. B, they carry about 63 copies, over 130 gigabits a second, against one copy with multicast. C, they carry two copies, one per spine, because ECMP splits the flood. D, they carry one copy either way, because the spines do the replication.

[think]

The answer is B: about 63 copies, over 130 gigabits a second, against one copy with multicast.

With ingress replication the ingress leaf makes one unicast copy per remote VTEP, 63 here, so 2.1 gigabits on the wire per copy becomes about 132 gigabits on its uplinks. With underlay multicast it sends one copy, and the tree replicates at its branches. Spines never replicate unicast VXLAN copies. Receivers do each get one copy in both designs, but that is downstream of the ingress leaf, not on its uplinks.

## 2

In an EVPN fabric, hosts that have been talking for hours are fine, but a newly booted VM behind leaf4 in Amsterdam cannot get a DHCP lease or answer ARP. What should you check first?

A, whether the spines have the VM's MAC address in their forwarding tables. B, whether leaf4 sends a type-3 route for the VNI that the other leaves installed. C, whether leaf4 sends a type-2 route for every existing host in the VNI. D, whether the route reflectors have the VM's IP host route.

[think]

The answer is B: whether leaf4 sends a type-3 route for the VNI that the other leaves installed.

DHCP and first ARPs are broadcasts. If leaf4 originates no type-3 route for the VNI, no other leaf has it on its flood list, so broadcasts never reach it, while established flows keep working on type-2 routes. A new VM has no type-2 route yet, and the reflectors would only hold one after it was learned. Spines carry no tenant MACs at all.

## 3

Why does underlay multicast not reduce the BUM load on each receiving leaf?

A, receivers get two copies, one from the RP and one from the source. B, multicast copies are larger, because they carry a PIM header. C, receivers must send a PIM join for every frame they want. D, each VTEP in the VNI receives every BUM frame once in both designs.

[think]

The answer is D: each VTEP in the VNI receives every BUM frame once in both designs.

Flooding means every member of the segment gets the frame. Ingress replication delivers that one copy by unicast, multicast by the tree, so either way each receiver handles each BUM frame once. Data packets carry no PIM header, joins are periodic per group rather than per frame, and duplicates from the RP and the source tree occur only briefly during switchover.

## 4

An operator changes an IS-IS metric during maintenance. Unicast keeps working, but BUM traffic between some leaves in multicast mode drops for a while. What is the most likely mechanism?

A, the type-3 routes are withdrawn because their next hop's metric changed. B, IS-IS floods the change as multicast, and the RP drops it as unknown. C, PIM recomputes its own shortest paths and loses its adjacencies on the change. D, the RPF check drops packets arriving on the old path until the tree rejoins.

[think]

The answer is D: the RPF check drops packets arriving on the old path until the tree rejoins.

PIM uses the unicast table for reverse-path forwarding: a packet is accepted only on the interface towards its source or RP. When the unicast path moves, packets on the old interface fail the check until joins rebuild the tree along the new path. PIM computes no routes of its own, type-3 routes do not depend on IGP metrics, and IS-IS flooding is not routed multicast through the RP.

## 5

Meridian's border gateways gw1 and gw2 in Amsterdam, at 192.0.2.2 and 192.0.2.3, share a VLAN, both with DR priority 1. Both forward the same multicast stream onto it. gw1 has metric 20 to the source and gw2 metric 30, with the same route preference. Which router forwards the stream afterwards?

A, gw1, because the assert prefers the lower metric to the source. B, both, because PIM cannot stop duplicates on a shared segment. C, gw2, because the DR always forwards every stream on its LAN. D, gw2, because the assert prefers the higher IP address first.

[think]

The answer is A: gw1, because the assert prefers the lower metric to the source.

gw2 is DR on the higher address, but the assert is a separate election for one stream: source-tree state, then lower route preference, then lower metric, then higher IP. Preferences are equal, so gw1 wins on metric 20, and gw2 stops forwarding that stream onto the LAN. The IP address is only the last tie-break, and stopping such duplicates is the assert's whole purpose.
