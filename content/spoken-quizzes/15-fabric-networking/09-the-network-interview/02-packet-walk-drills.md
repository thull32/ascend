---
lesson: packet-walk-drills
source: b0efe4d2eaa8bb05
---
## 1

In the VXLAN walk from acme-web1 on leaf1 in Amsterdam to acme-web2 on leaf2 in Singapore, what does spine1 in Amsterdam use to forward the packet?

A, the inner destination IP, from the Acme VRF. B, the VNI 10100, mapped to a VLAN on the spine. C, the outer destination IP, routed via IS-IS. D, the inner destination MAC, from a type-2 route.

[think]

The answer is C: the outer destination IP, routed via IS-IS.

The spine reads only the outer IPv4 header, addressed to VTEP 10.255.2.12, a loopback the underlay knows, and rewrites the outer MACs. It holds no tenant MACs, VNIs or VRFs; the EVPN type-2 route was used once, at leaf1, to pick the VTEP. A spine that needed tenant state would recreate the BGP black hole.

## 2

A server can't ping its gateway. The server's neighbour table shows the gateway at the anycast gateway MAC, reachable, and the server reaches a host in another subnet through the gateway. What is the most likely explanation?

A, the server's MTU exceeds the port's MTU. B, the leaf's IS-IS adjacency to a spine is down. C, the server port is in the wrong VLAN. D, ICMP to the leaf's own address is rate-limited.

[think]

The answer is D: ICMP to the leaf's own address is rate-limited.

ARP resolving rules out layer 2 and the VLAN, and forwarding through the gateway works, so the gateway is fine. A ping addressed to the gateway itself is punted to the switch CPU under control-plane policing, which may drop or rate-limit it. A one-hop ping never involves IS-IS, and an MTU problem would affect large packets through the gateway too.

## 3

After a change, requests across one site of the fabric show median and 99th percentile latency both up by 40 milliseconds, equally on every spine. Where should you look first?

A, the inter-site circuit, for a detour through Singapore. B, one spine's uplinks, for congestion and output drops. C, the route reflectors, for EVPN route churn. D, the hosts and the application, for a fixed added wait.

[think]

The answer is D: the hosts and the application, for a fixed added wait.

An equal shift at every percentile and on every path is a fixed wait added to each request, not a path problem; 40 milliseconds matches Linux's minimum delayed-ACK timer meeting Nagle's algorithm. One congested spine would affect only the flows hashed onto it. A switch queue inside the site cannot add 40 milliseconds, since a 32-megabyte buffer at 100 gigabits per second drains in about 2.6, and a detour to Singapore would add over 100.

## 4

Leaf5 in Amsterdam shows its IS-IS adjacency to spine2 in Initializing. Spine2 shows no adjacency at all, and counts oversize frames on that port. What is the cause?

A, a hello authentication key mismatch between them. B, a duplicate system ID copied from a template. C, spine2's port MTU is smaller than leaf5's. D, mismatched hello timers on the two ends.

[think]

The answer is C: spine2's port MTU is smaller than leaf5's.

By default IS-IS pads its hellos to the interface MTU. Spine2 drops leaf5's padded hellos as oversize, so it never hears leaf5; leaf5 hears spine2's smaller hellos, which do not list it, and waits in Initializing. An authentication mismatch keeps both ends Down with auth-failure counters, and IS-IS hello timers do not need to match.

## 5

Meridian wants inbound traffic via ISP1, and has prepended its AS three times towards ISP2. Yet traffic from ISP2's own customers still arrives via ISP2. Why?

A, ISP2 strips prepended ASes from customer announcements. B, ISP2 prefers customer routes by local preference before path length. C, ISP2 compares MED, which prepending does not change. D, prepending works only on routes announced over iBGP.

[think]

The answer is B: ISP2 prefers customer routes by local preference before path length.

Local preference is compared before AS path length, and ISP2 gives routes from its paying customers a higher local preference than routes from peers, so it keeps the direct path to Meridian however long it looks. ISP2's published community for lowering local preference, or a more-specific announced only via ISP1, moves that traffic. MED is not compared between routes from different neighbouring ASes.

## 6

In the laptop-to-website walk, which statement about the routing step, across the internet and into Meridian, is correct?

A, each router queries BGP for the best next hop of the packet. B, only the home router consults BGP, choosing between ISPs. C, the spines inside Meridian look up BGP routes for 203.0.113.10. D, BGP filled each forwarding table in advance, and packets meet only the forwarding table.

[think]

The answer is D: BGP filled each forwarding table in advance, and packets meet only the forwarding table.

BGP is a control-plane protocol that ran before the packet existed and installed best paths in each router's forwarding table. Per packet, each router does a longest-prefix match in its FIB and rewrites the MACs. A home router has a default route and no BGP. Inside Meridian, the border gateway and the leaves use BGP-learned routes, while the spines forward on underlay routes.
