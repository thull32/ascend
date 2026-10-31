---
review: bgp-fundamentals
source: 9321b430d79bd434
---
## Introduction

Twelve questions from the BGP fundamentals module, second part. Answer out loud before the answer comes.

They run in the order of the lessons: route reflectors, the best-path algorithm, and the BGP black hole. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

The reflector rr1.sin learns Acme's 10.1.2.0 slash 24 from rr1.ams, which is its non-client peer. To whom does rr1.sin reflect it?

A, to Singapore's clients only, never to other reflectors. B, to nobody, since iBGP-learned routes are never relayed. C, to Singapore's clients and to rr2.sin, its partner. D, to every client and every non-client, including San Jose's reflectors.

[think]

The answer is A: to Singapore's clients only, never to other reflectors.

A route learned from a non-client is reflected to clients only. The reflectors are fully meshed as ordinary iBGP peers, so rr2.sin and San Jose's reflectors heard the route from Amsterdam directly, and plain split horizon applies among them. Reflecting to everyone is the rule for routes learned from a client, and relaying to nobody is the plain iBGP rule that reflection exists to relax.

## Question 2

After a hardware swap, leaf7.ams and leaf8.ams were both given router ID 10.255.1.17. All sessions are Established. What do you expect?

A, nothing changes, since router IDs only break best-path ties. B, both leaves' sessions to the reflectors fail with Bad BGP Identifier. C, each leaf is missing the routes that the other one originates. D, the reflectors drop both leaves' routes as a cluster loop.

[think]

The answer is C: each leaf is missing the routes that the other one originates.

The reflector stamps the originator ID with the originating leaf's router ID. When leaf8's routes are reflected to leaf7, they carry 10.255.1.17, leaf7's own ID, so it discards them as a loop, and the same in reverse. The OPEN check refuses only a peer with the receiver's own ID, so the leaf-to-reflector sessions come up, and the cluster list holds cluster IDs, not router IDs.

## Question 3

gw1.ams and gw2.ams both originate a default route that ties on every attribute. Every leaf has BGP multipath enabled, yet all internet traffic leaves via gw1. Why?

A, the leaves' IGP cost to gw2 must be higher than to gw1. B, each reflector advertises only its best path, so the leaves never see gw2's. C, the reflectors rewrite the next hop to gw1 on both routes. D, multipath needs the two gateways to be in different ASes.

[think]

The answer is B: each reflector advertises only its best path, so the leaves never see gw2's.

The reflectors hold both paths but each advertises one, the tie-break winner gw1, so the leaves receive two copies of the same next hop and multipath has nothing to spread over. ADD-PATH, or distinct route distinguishers in a VPN family, would deliver gw2's path. Reflectors do not rewrite next hops, and in a symmetric leaf-spine site the leaves' IGP costs to the two gateways are equal.

## Question 4

Both of Amsterdam's reflectors lose power at once. No graceful restart is configured, and the fabric's links and IS-IS are healthy. What happens to traffic between acme-web1 on leaf1.ams and acme-db1 on leaf3.ams?

A, it continues until the next route change, then the routes freeze. B, it stops within the hold time, when the leaves delete the overlay routes. C, it shifts to the spines, which hold a copy of every overlay route. D, it continues indefinitely, because no packet ever crossed the reflectors.

[think]

The answer is B: it stops within the hold time, when the leaves delete the overlay routes.

The data plane never used the reflectors, but every overlay route came from them. When the sessions time out, 9 seconds on Meridian and faster with BFD, each leaf deletes the routes learned on them, so leaf1 no longer knows where 10.1.2.20 lives. Stale routes survive only with graceful restart, and Meridian's spines carry no overlay routes; they forward VXLAN on outer addresses.

## Question 5

gw1.ams holds path A from its own eBGP session to ISP1, with AS path 64501, 64496, 64511, and path B over iBGP from gw2.ams, with AS path 64502, 64511. Local preference, weight and origin are equal. Why does gw1.ams not use its own ISP1 link?

A, iBGP paths are always preferred, because they are already inside the AS. B, B has the lower IGP cost, and IGP cost is compared before AS path length. C, AS path length is compared before eBGP over iBGP, and B's path is shorter. D, MED is compared across both ISPs, and B's MED of 0 beats A's MED of 10.

[think]

The answer is C: AS path length is compared before eBGP over iBGP, and B's path is shorter.

Step 5, AS path length, removes A, three networks against two, before step 8, eBGP over iBGP, could favour it. IGP cost is step 9, after AS path. MED is not compared between different neighbouring networks by default. And eBGP is preferred over iBGP, not the reverse; that step simply comes too late to help A.

## Question 6

Meridian sets local preference 200 on the routes gw1.ams learns from ISP1. What happens on gw2.ams, which has its own eBGP path from ISP2 with local preference 100?

A, gw2.ams switches to gw1.ams's ISP1 path, because iBGP carries local preference 200. B, gw2.ams load-balances over both paths, because the two exits are now equally preferred. C, gw2.ams keeps its ISP2 path, because eBGP over iBGP is checked before local preference. D, nothing changes, because local preference only affects the router whose import policy set it.

[think]

The answer is A: gw2.ams switches to gw1.ams's ISP1 path, because iBGP carries local preference 200.

Local preference is carried to every iBGP peer, so gw2.ams compares 200 with its own 100 at step 3, switches, and stops advertising its ISP2 path. Weight is the attribute that stays on one router. eBGP over iBGP is step 8, far below local preference. And the paths differ at local preference, so they are not equal for multipath.

## Question 7

During maintenance, the IS-IS metrics on gw2.ams's links are raised to 1,000. No BGP session goes down, but latency from Amsterdam to some internet destinations jumps by about 100 milliseconds. What happened?

A, gw1.ams's IGP cost to gw2.ams's next hop rose above its cost to gw1.sin, so its exit moved to Singapore. B, gw2.ams's BGP sessions reset when its metrics changed, withdrawing every route it had sent. C, MED was recomputed from the new IGP metrics, and ISP2 now prefers the Singapore entry point. D, the higher metric made the AS path via gw2.ams look longer to the other gateways in the AS.

[think]

The answer is A: gw1.ams's IGP cost to gw2.ams's next hop rose above its cost to gw1.sin, so its exit moved to Singapore.

This is hot-potato routing. The two ISP2 paths tie down to step 9, so the IGP cost to each next hop decides, and at 1,010 against 120 the Singapore exit wins, adding about 52 milliseconds each way inside Meridian. IGP metrics do not change the AS path or reset BGP sessions, and MED is set by the neighbouring network, not derived from Meridian's IGP.

## Question 8

A border router with sessions to two ISPs has maximum paths set to 4, and holds two eBGP paths to a prefix: one with AS path 64501, 64511, and one with 64502, 64511. Everything else is equal. The forwarding table shows only one next hop. Why?

A, multipath is overridden by the oldest-path rule, which leaves one installed path. B, multipath only applies to iBGP paths, never to paths learned over eBGP sessions. C, multipath needs at least four paths before it installs more than one of them. D, multipath needs the paths to share the same AS path, not only its length, unless relaxed.

[think]

The answer is D: multipath needs the paths to share the same AS path, not only its length, unless relaxed.

By default, multipath candidates must have identical AS path contents, so paths through two different neighbouring networks stay out of the group; a multipath relax option loosens that to equal length. Maximum paths is an upper limit, not a minimum, and eBGP and iBGP multipath are both supported. The oldest-path rule still picks the single best path to advertise, but it does not shrink the multipath set.

## Question 9

R1, R2 and R3 all run IS-IS. R1 and R3 run iBGP between their loopbacks, and R2 runs no BGP. R3 advertises 10.1.2.0 slash 24 with its own loopback as the next hop. What happens to a packet from a host behind R1 to 10.1.2.20?

A, R1 refuses to install the route, because R2 is not a BGP speaker. B, the iBGP session never comes up, because R2 does not run BGP. C, R2 forwards it towards R3, because R1 resolved the next hop through R2. D, R2 drops it, because R2 has no route for the customer destination.

[think]

The answer is D: R2 drops it, because it has no route for the customer destination.

The session comes up, since it is TCP between loopbacks IS-IS carries, and R1 installs the route resolved through R2. But the packet carries only its destination, 10.1.2.20. R2 looks that up in its own table, finds nothing and drops it. The resolved next hop chose R1's first hop and travels nowhere with the packet.

## Question 10

Meridian's spines run IS-IS only, yet tenant traffic between leaves is delivered. Why?

A, the spines learn tenant routes from IS-IS through redistribution. B, route reflectors install tenant routes into the spines' hardware tables. C, the spines flood packets with unknown destinations to every leaf. D, the leaves encapsulate packets to the far leaf's loopback, which IS-IS carries.

[think]

The answer is D: the leaves encapsulate packets to the far leaf's loopback, which IS-IS carries.

VXLAN wraps each tenant packet in an outer IP header addressed to the egress leaf's loopback, so the spine's lookup is for a slash 32 that IS-IS already gave it. Nothing is redistributed into IS-IS, the reflectors sit beside the spines and program nothing on them, and routers do not flood unknown IP destinations.

## Question 11

In an MPLS core, the LDP session on one link goes down while the IS-IS adjacency on that link stays up. What happens to customer traffic routed over that link?

A, it is rerouted at once, since IS-IS removes the link when LDP fails. B, it is delivered normally, because labels are only an optimisation. C, it is delivered, but with an extra label added by the IS-IS process. D, it is sent unlabelled, and the next router drops it for lack of a customer route.

[think]

The answer is D: it is sent unlabelled, and the next router drops it for lack of a customer route.

The ingress router still routes over that link, because IS-IS says so, but has no label from that neighbour. It sends plain IP, and the transit router does an IP lookup on a customer address it does not hold: the original black hole. IS-IS does not react to LDP unless LDP and IGP synchronization makes it advertise the link at maximum metric until LDP is back.

## Question 12

A transit router that runs BGP everywhere reboots. Traffic through it drops for about three minutes after its IS-IS adjacencies come back, then recovers. What prevents this?

A, increasing the IS-IS hello interval so adjacencies form later. B, setting the IS-IS overload bit at startup until BGP has converged. C, enabling next-hop-self on the router's iBGP sessions. D, lowering the BGP hold time so sessions establish more quickly.

[think]

The answer is B: setting the IS-IS overload bit at startup until BGP has converged.

IS-IS converges in seconds and draws traffic through the router while BGP is still loading its table, so packets for prefixes not yet installed are dropped. The overload bit tells other routers not to use it for transit until BGP is ready, while its own addresses stay reachable. Hold time affects failure detection, not loading speed, and slower hellos only delay the race.

## Recap

Three ideas kept coming back. Reflectors are in the control plane only, but they shape what everyone sees: each advertises one best path, so multipath can starve, a duplicate router ID hides a leaf's routes, and losing both reflectors deletes the overlay within a hold time. Best path is an ordered list, and order decides: local preference travels across the AS and beats everything below it, AS path length comes before eBGP over iBGP, and the IGP cost to the next hop, hot potato, decides late ties. And the black hole: a resolved next hop picks only the first hop, so every router on the path needs a route for the destination, unless encapsulation or labels carry the packet across, and only a hop-by-hop check of the forwarding tables finds the one that does not.
