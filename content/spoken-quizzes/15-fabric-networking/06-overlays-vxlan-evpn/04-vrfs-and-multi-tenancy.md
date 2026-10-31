---
lesson: vrfs-and-multi-tenancy
source: a68bfe8102d32adf
---
## 1

A new Globex VRF on leaf5.ams was built by copying Acme's configuration. Its name, VNIs and route distinguisher were changed, but it still imports route target 65000 colon 50001 alongside 65000 colon 50002. What happens?

A, the reflectors reject the session until the route targets match the distinguisher. B, BGP refuses the routes because the distinguisher and target disagree on the tenant. C, GLOBEX installs Acme's routes and steers Globex traffic to Acme. D, nothing, because the unique distinguisher keeps Acme's routes out of GLOBEX.

[think]

The answer is C: GLOBEX installs Acme's routes and steers Globex traffic to Acme.

Installation is decided only by the route target: any route carrying one of the VRF's import targets is installed. Acme's routes carry 65000 colon 50001, so GLOBEX on leaf5 installs them, pointing at Acme's leaves. Depending on the platform, the packets are then routed in VRF ACME, a leak, or dropped, a black hole. The distinguisher only makes routes unique inside BGP and is never consulted for import.

## 2

With symmetric IRB, acme-web1, 10.1.1.10 in VLAN 100 on leaf1.ams, sends a packet to acme-db1, 10.1.2.20 in VLAN 200 on leaf3.ams. Crossing the spine, what are the VNI and the inner destination MAC?

A, VNI 50001 and leaf3's router MAC address. B, VNI 50001 and acme-db1's own MAC address. C, VNI 10101 and acme-db1's own MAC address. D, VNI 10100 and the anycast gateway MAC address.

[think]

The answer is A: VNI 50001 and leaf3's router MAC address.

leaf1 routes the packet in VRF ACME and sends it in the tenant's L3VNI, 50001, addressed at layer 2 to the egress leaf's router MAC, learned from the router MAC extended community. leaf3 then routes again and writes acme-db1's MAC itself. VNI 10101 with acme-db1's MAC is what asymmetric IRB would send, and the anycast gateway MAC is used only between a host and its own leaf.

## 3

gw1.ams and gw2.ams both originate a default route into VRF ACME, but a copied configuration gave them the same route distinguisher. Every Acme leaf shows a single default path, via gw1. Why?

A, gw2's route lacks the route target, so no Acme leaf imports it. B, the leaves accept only one default route per VRF. C, the reflector sees one NLRI and reflects only its best path. D, matching distinguishers make the leaves reject gw2's route as a loop.

[think]

The answer is C: the reflector sees one NLRI and reflects only its best path.

The distinguisher is part of the NLRI, so identical distinguishers turn two routes into two paths for one NLRI. A route reflector advertises only its best path per NLRI, so the leaves never hear of gw2: no multipath, and a failover that waits for the reflector. Unique per-device distinguishers, or Add-Path, keep both. Loop detection uses the originator ID and cluster list, not the distinguisher.

## 4

A virtual machine with gateway 10.1.1.1 migrates live from leaf1.ams to leaf4.ams in an anycast-gateway fabric. Why can it route through its new leaf immediately?

A, every leaf owns the same gateway MAC, so its ARP cache stays valid. B, leaf4 sends it a gratuitous ARP with its own gateway MAC. C, EVPN rewrites the machine's ARP cache through the type-2 route. D, its traffic hairpins to leaf1 until its ARP cache expires.

[think]

The answer is A: every leaf owns the same gateway MAC, so its ARP cache stays valid.

The distributed anycast gateway uses the same gateway IP and MAC on every leaf, so the machine's cached entry for 10.1.1.1 is still correct after the move, and leaf4 routes the first packet. The type-2 route with a higher MAC mobility sequence number updates the other leaves, not the machine. The hairpin is what happens when leaves use different gateway MACs.

## 5

Meridian's VRF SERVICES imports Acme's and Globex's routes so that both can use the shared DNS server. Both tenants have a host at 10.1.1.10. What happens?

A, DNS replies are flooded to both tenants in their own L2VNIs. B, the second import is rejected because the two prefixes overlap. C, SERVICES gets two paths to one prefix and answers the wrong tenant. D, the distinguishers keep the two hosts apart inside the SERVICES table.

[think]

The answer is C: SERVICES gets two paths to one prefix and answers the wrong tenant.

BGP carried both routes because their distinguishers differ, but the distinguisher is stripped when a route is installed in a VRF. In SERVICES there are two paths to 10.1.1.10, best path picks one, and replies meant for one tenant go to the other tenant's host. Nothing rejects overlapping imports automatically. The fixes are per-tenant NAT, unique shared ranges, or per-VRF firewall legs.

## 6

A traceroute from acme-web1 to acme-db1, in different subnets on different leaves, shows how many routed hops before the destination, under symmetric and under asymmetric IRB?

A, two in both cases: the spines are hidden and both leaves always route. B, four and three: both leaves and both spines are counted. C, one and two: asymmetric IRB adds a hop at the egress leaf. D, two and one: symmetric routes at both leaves, asymmetric only at ingress.

[think]

The answer is D: two and one: symmetric routes at both leaves, asymmetric only at ingress.

Symmetric IRB routes at leaf1 and again at leaf3, so the inner TTL drops by two, 64 to 62, and two leaf hops appear. Asymmetric IRB routes only at the ingress leaf and bridges at the egress, so acme-db1 sees TTL 63 and one hop. Spines forward on the outer header and decrement only the outer TTL, so they never appear.
