---
lesson: bgp-as-the-underlay
source: 73d0eded8c94e601
fit: partial
desk:
  - "The AS plan table: unique, per tier, shared leaf AS and five-stage"
  - "The UPDATE field by field, and leaf3's BGP table and kernel route with two next hops"
  - "The eBGP underlay visualisation and its shared-leaf-AS variant with allowas-in"
  - "The path-hunting simulation: shared versus unique spine ASNs, and allowas-in"
  - "The unnumbered UPDATE with an IPv6 next hop, and the placeholder route and neighbour entry"
  - "The IS-IS versus eBGP table, the failure-mode table, and the AS-plan audit code"
---
## Introduction

Meridian's underlay is IS-IS. Yet many of the largest data centers in the world run no IS-IS or OSPF at all. They run one protocol, BGP, on every link, and every switch, or every tier of switches, is its own small autonomous system: a set of routers under one routing policy, named by an AS number.

The design was written down in RFC 7938, an informational RFC from August 2016, by engineers who ran some of the biggest data centers of the time. Most SONiC deployments and NVIDIA's Cumulus Linux reference designs follow it. And "why IS-IS and not eBGP?" is a question principal network engineers use to find out whether you understand either protocol.

Coming up: what eBGP brings to a fabric, how the AS plan decides which paths exist, why the spines share one AS, the two knobs that bend the rules, allowas-in and BGP unnumbered, and then that interview question, answered both ways.

## One protocol on every link

The underlay's job is to make every device's loopback reachable from every other device, over every spine, and to repair itself fast. The loopback is a virtual interface that never goes down, holding one address that names the device: leaf1.ams is 10.255.1.11.

eBGP, BGP between two different autonomous systems, has three properties that fit. Its next hop is the neighbour itself, so every route a leaf learns points at a directly connected spine, and no second protocol is needed to resolve it. It re-advertises what it learns: iBGP, inside one AS, never passes a route from one iBGP peer to another, but eBGP passes its best path to every neighbour, so a route crosses the fabric hop by hop. And it detects loops by itself: every speaker prepends its own AS number to the route's AS path, and a router that finds its own number in a received path throws the route away.

RFC 7938's recipe uses all three: one single-hop eBGP session on every leaf-to-spine link, with a TTL of 1. Each leaf originates its loopback and server subnets; link subnets are not advertised, or are summarised, because nothing needs to reach a link address. The full Amsterdam site, four spines and sixteen leaves, has 64 sessions, the same count as IS-IS adjacencies.

Why bother? One implementation to configure, monitor and upgrade; at tens of thousands of switches, removing a protocol removes a class of incidents. Less flooding: link-state sends every change to every router and every router recomputes, while BGP sends only best paths, and only when they change. Policy at every hop: draining a spine is prepending its AS path or tagging its routes with a community. The catch: the AS plan becomes configuration that can be wrong, and BGP's internet defaults, slow timers and a single best path, are wrong for a fabric until tuned.

## The AS plan, and a loopback's journey

RFC 7938's plan is per tier: all spines share one AS, every leaf gets its own. Meridian's variant uses 65100 for the spines and 65101 upwards for the leaves. These are private numbers, stripped at the internet edge. Among the old 2-byte numbers there are only 1,023 private ones; among 4-byte numbers, about 95 million, so today many operators keep every number unique.

Now follow one route, on the small Amsterdam fabric: two spines, both 65100, and four leaves, 65101 to 65104. leaf1 sends each spine an update: here is my loopback, the AS path is just 65101, and the next hop is my end of our link. The packet has a TTL of 1, so it can never leave that cable.

spine1 scans the path for its own number, finds only 65101, accepts and installs it. Then it sends it on to the other three leaves, prepending itself: 65100, 65101, next hop spine1. spine2 does the same.

So leaf3 receives two copies with identical paths. Normal BGP would install one. With BGP multipath, off by default on most traditional routers and on in every fabric, both are installed: two next hops, the same equal-cost result IS-IS would compute, from a protocol that knows nothing beyond its neighbours.

Then leaf3 passes its best path on to spine2, as 65103, 65100, 65101. To spine2 that is a path that goes down to leaf3, up to spine1 and down again: a valley. Before I tell you: what does spine2 do with it?

[pause]

It discards it. It finds 65100, its own number, in the path. That the 65100 belongs to a different box doesn't matter.

Now cut the link between leaf1 and spine2. The session runs over that one cable, so it drops the moment the interface goes down, or when BFD declares it dead with the light still on. spine2 has no other usable path, so it withdraws the loopback from the other leaves, which keep their path through spine1. One withdrawal per leaf, no computation anywhere else. The price: spine2 can no longer reach leaf1 at all. Under IS-IS it would detour; here, packets sent to spine2 before the withdrawal lands are dropped for those milliseconds.

One seam across sites. If every site reuses the plan, the long-haul session between spine1.ams and spine1.sin is 65100 to 65100, so it is iBGP, which doesn't prepend, doesn't pass routes on, and leaves a next hop Amsterdam can't resolve. And leaf1.sin, also 65101, looks exactly like leaf1.ams and is discarded as a loop that never happened. The fix is a spine AS per site, 65100, 65300, 65400, plus unique leaf numbers or allowas-in. IS-IS has no such question.

## Why the spines share one AS

With one spine AS, any path through two spines contains 65100, and no spine accepts it. Only valley-free paths survive: leaf, spine, leaf. The AS plan has turned the loop rule into a topology rule.

It is tempting to give each spine its own number, 65201 and 65202, "for clarity". Two things change. Valleys become legal: spine2 now stores the path through leaf3 and spine1 as a backup, one from each other leaf. And equal-cost multipath collapses. leaf3 hears 65201, 65101 from one spine and 65202, 65101 from the other: same length, different numbers, and standard multipath requires identical AS paths. One uplink carries everything until someone enables multipath relax.

The bigger cost shows when a route disappears. Path hunting is what a path-vector protocol does after a withdrawal: each router falls back to a stale alternative, advertises it, and only learns it is dead when that one is withdrawn in turn. The lesson simulates leaf1 dying on the full Amsterdam site. Here is the number to remember. Shared spine AS: 2 rounds and 120 updates until every router agrees. Unique spine numbers: 8 rounds and 366 updates. Hunting rounds are paced by the minimum advertisement interval, which the BGP standard suggests be 30 seconds on eBGP. Data-center profiles set it to zero, so a round costs milliseconds; at internet defaults, one dead switch means minutes of churn.

So the shared spine AS is not about saving numbers. It removes valleys, keeps multipath intact, and stops path hunting.

## allowas-in: accepting your own AS on purpose

Sometimes one number legitimately appears in two places: leaves that share an AS, numbers reused across clusters, Meridian's repeated per-site plan. The loop check then refuses routes that never looped. allowas-in N relaxes it on one session: accept a path containing my own number up to N times.

Picture every leaf in 65101. leaf1's loopback reaches leaf3 as 65100, 65101, and leaf3 rejects it. Its sessions are Established, its received counts look normal, and it reaches nothing. Set allowas-in 1 and both copies are installed.

Is it safe? It depends on what else still checks. The spines' 65100 still rejects every path through two spines, so the only loop allowas-in 1 admits is leaf3's own route coming back, which loses to the route it originates locally. That is RFC 7938's argument for reuse. It becomes unsafe with a large N, or where nothing else bounds the path: a withdrawn route can circulate until the count is exceeded. Unique 4-byte numbers need none of this. The signal when it's forgotten: Established sessions, normal received counts, near-zero accepted routes, and "denied: AS path loop" counters climbing.

## BGP unnumbered

The numbered design needs, per link, a slash 31, an address on each end, and a neighbour entry naming the far end's address and AS: on the full Amsterdam site, 128 addresses and 128 entries, each a chance for a typo. BGP unnumbered names only the interfaces and learns the peer.

Three IPv6 mechanisms do it. Every IPv6 interface gives itself a link-local address, valid only on that cable. Each side sends router advertisements every few seconds with that address as the source. BGP reads the source of the advertisement arriving on its port, and that is its peer; it opens TCP to port 179 there. Even the peer's AS is left out: "remote-as external" accepts any AS different from your own. Every leaf's configuration becomes nearly identical.

The routes are IPv4, though, and classic BGP's next hop holds only IPv4. So both ends announce the extended next hop capability, RFC 8950, and IPv4 routes travel with an IPv6 link-local next hop.

How does an IPv4 packet get forwarded towards that? The next hop is only ever used to find the MAC address for the frame, and IPv6 neighbour discovery maps the link-local address to the peer's MAC. Linux accepts IPv4 routes with IPv6 gateways since kernel 5.2. Before that, and still in many deployments, FRRouting installs the route through a placeholder next hop, 169.254.0.1, plus a permanent neighbour entry mapping it to the peer's MAC. The chip sees an ordinary route with a port and a MAC. Nothing is converted to IPv6.

The costs. IPv6 must work on every fabric port: a hardening setting that disables it, copied onto a switch image, means a session that never finds its peer. Addressing no longer catches miscabling: a cable from leaf3 straight to leaf6 forms a healthy session, leaf6 is one AS hop away instead of two, and all leaf3's traffic for it squeezes down that cable. LLDP checks against the cabling plan become the safety net.

## Why IS-IS and not eBGP?

Side by side: with IS-IS every router knows the whole topology; with eBGP, only its neighbours' best paths. When a leaf-to-spine link fails, IS-IS floods to every router and every router reruns its shortest-path calculation, about a millisecond; eBGP withdraws the affected prefixes and nothing else. Either way every leaf is touched: the scope comes from the Clos, not the protocol. The difference is cost per change, and that IS-IS detours where eBGP drops.

Here is the question as a principal engineer asks it. Why does Meridian run IS-IS rather than eBGP in its underlay?

[pause]

For IS-IS: Meridian is three sites and a backbone run as one routing domain. The full map means a spine that loses a leaf link detours instead of dropping. Maintenance is a metric change or the overload bit, "do not route through me", with no AS plan to keep consistent across sites. And underlay and overlay stay separate, so an overlay policy mistake cannot take down loopback reachability.

For eBGP, the hyperscaler's answer: one site, tens of thousands of switches, one team. One protocol, cheap local failure handling, policy at every hop, and with unnumbered, near-identical configuration. The choice follows the shape of the network and the team. The common wrong answer is "IS-IS converges faster". With fabric timers, keepalive 3 seconds and hold 9, teardown on link-down, and BFD, both converge in well under a second.

A story about why tooling matters. An operator rebuilds a leaf from its neighbour's template, changing the loopback and router ID but not the AS number. Every session comes up green. But the two leaves discard each other's routes as loops, so the database servers behind one cannot reach the application servers behind the other, and nothing alarms until a customer notices. The fix takes a minute; detection takes as long as the gap between "sessions Established" and "every loopback reachable over every spine".

So the platform should check every device against the AS plan, show accepted and denied routes per session with the reason, and show equal-cost width per loopback: 3 of 4 is a session down, 1 of 4 is a multipath setting. And the AS path's shape: inside a site, every leaf-to-leaf path is exactly the spine AS then the origin leaf. Longer is a valley; shorter is a cable that should not exist.

## Recap

Four things to remember. RFC 7938 in one sentence: single-hop eBGP on every link, one AS for the spine tier, one per leaf, loopbacks advertised, link subnets not. The shared spine AS exists for its effects: no valleys, multipath intact, no path hunting, 2 rounds against 8 when a leaf dies. allowas-in 1 under a tier that still checks is benign, and unique 4-byte numbers avoid it. BGP unnumbered peers over IPv6 link-local addresses learned from router advertisements, and moves the risk to IPv6 being on and to cables. Above all, Established is not reachability.

At your desk: the AS plan table, the update field by field and leaf3's tables, the two visualisations, the path-hunting simulation, the unnumbered update and placeholder route, and the comparison, failure-mode table and audit code.
