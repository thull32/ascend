---
lesson: the-bgp-black-hole
source: a445e616b9cd5389
---
## 1

R1, R2 and R3 all run IS-IS. R1 and R3 run iBGP between their loopbacks, and R2 runs no BGP. R3 advertises 10.1.2.0 slash 24 with its own loopback as the next hop. What happens to a packet from a host behind R1 to 10.1.2.20?

A, R1 refuses to install the route, because R2 is not a BGP speaker. B, the iBGP session never comes up, because R2 does not run BGP. C, R2 forwards it towards R3, because R1 resolved the next hop through R2. D, R2 drops it, because R2 has no route for the customer destination.

[think]

The answer is D: R2 drops it, because it has no route for the customer destination.

The session comes up, since it is TCP between loopbacks IS-IS carries, and R1 installs the route resolved through R2. But the packet carries only its destination, 10.1.2.20. R2 looks that up in its own table, finds nothing and drops it. The resolved next hop chose R1's first hop and travels nowhere with the packet.

## 2

Meridian's spines run IS-IS only, yet tenant traffic between leaves is delivered. Why?

A, the spines learn tenant routes from IS-IS through redistribution. B, route reflectors install tenant routes into the spines' hardware tables. C, the spines flood packets with unknown destinations to every leaf. D, the leaves encapsulate packets to the far leaf's loopback, which IS-IS carries.

[think]

The answer is D: the leaves encapsulate packets to the far leaf's loopback, which IS-IS carries.

VXLAN wraps each tenant packet in an outer IP header addressed to the egress leaf's loopback, so the spine's lookup is for a slash 32 that IS-IS already gave it. Nothing is redistributed into IS-IS, the reflectors sit beside the spines and program nothing on them, and routers do not flood unknown IP destinations.

## 3

In an MPLS core, the LDP session on one link goes down while the IS-IS adjacency on that link stays up. What happens to customer traffic routed over that link?

A, it is rerouted at once, since IS-IS removes the link when LDP fails. B, it is delivered normally, because labels are only an optimisation. C, it is delivered, but with an extra label added by the IS-IS process. D, it is sent unlabelled, and the next router drops it for lack of a customer route.

[think]

The answer is D: it is sent unlabelled, and the next router drops it for lack of a customer route.

The ingress router still routes over that link, because IS-IS says so, but has no label from that neighbour. It sends plain IP, and the transit router does an IP lookup on a customer address it does not hold: the original black hole. IS-IS does not react to LDP unless LDP and IGP synchronization makes it advertise the link at maximum metric until LDP is back.

## 4

An operator summarises each site's loopbacks into one slash 24 between sites. A leaf in Amsterdam loses power, and Amsterdam's IS-IS removes its loopback within a second. Why can Singapore keep sending traffic towards it for longer?

A, the EVPN routes are cached in hardware until the next refresh. B, Singapore's BGP processes rescan every next hop every 60 seconds. C, IS-IS in Singapore must rerun its shortest-path computation first. D, the next hop still resolves through the summary until BGP withdraws the routes.

[think]

The answer is D: the next hop still resolves through the summary until BGP withdraws the routes.

The summary stays up while any Amsterdam loopback exists, so next-hop tracking in Singapore sees the dead leaf's loopback still covered and keeps its routes. Traffic stops only when a withdrawal arrives: quickly if a reflector that still sees the slash 32 checks the next hop, at worst when the reflector's hold timer expires. Periodic scanners are the old design that event-driven tracking replaced.

## 5

A dashboard shows every BGP session Established, every prefix count at baseline and every IS-IS adjacency up. Which check would detect a transit router without a route for a customer prefix?

A, alerting when BGP session uptime falls below the hold time. B, walking each router's forwarding table along the resolved path for that destination. C, comparing negotiated address families with the source of truth. D, checking that every BGP next hop resolves through any IGP route.

[think]

The answer is B: walking each router's forwarding table along the resolved path for that destination.

The fault is in a router that holds no BGP session and receives no prefixes, so only a hop-by-hop lookup of the destination, or a data-plane probe, finds it. The address families, uptimes and prefix counts are all correct, and the next hop does resolve, even through a slash 32. Next-hop resolution checks only the first hop's view.

## 6

A transit router that runs BGP everywhere reboots. Traffic through it drops for about three minutes after its IS-IS adjacencies come back, then recovers. What prevents this?

A, increasing the IS-IS hello interval so adjacencies form later. B, setting the IS-IS overload bit at startup until BGP has converged. C, enabling next-hop-self on the router's iBGP sessions. D, lowering the BGP hold time so sessions establish more quickly.

[think]

The answer is B: setting the IS-IS overload bit at startup until BGP has converged.

IS-IS converges in seconds and draws traffic through the router while BGP is still loading its table, so packets for prefixes not yet installed are dropped. The overload bit tells other routers not to use it for transit until BGP is ready, while its own addresses stay reachable. Hold time affects failure detection, not loading speed; next-hop-self changes next hops; and slower hellos only delay the race.
