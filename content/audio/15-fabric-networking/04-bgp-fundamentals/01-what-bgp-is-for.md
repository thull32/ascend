---
lesson: what-bgp-is-for
source: 1f9c0ae00bb1eeb8
fit: great
desk:
  - "The table of AS number ranges, with the RFC behind each"
  - "The BGP update visualisation: one announcement around four ASes, rejected as a loop at home, and its step-by-step state table"
  - "The Python that compares shortest path with policy, and the 95th-percentile billing simulation"
  - "The eBGP and iBGP rule table, and the illustrative BGP table on gw2.ams"
  - "The diagram of Meridian's sessions, the eBGP underlay visualisation, and the table of where BGP runs"
  - "The do-you-need-BGP comparison table"
  - "The ASN classifier, asdot conversion and AS path wire encoding, byte by byte"
  - "The failure-modes table and the platform audit code"
  - "Exercise: accept or reject a route by its AS path"
---
## Introduction

Meridian owns one block of addresses, 203.0.113.0 slash 24. For anyone on the internet to reach it, about 78,000 other networks must learn that this block is reached through Meridian, and Meridian must learn where the internet's million or so other blocks live. These networks share no map and no common measure of distance, and each wants traffic to follow its contracts rather than the shortest line. Inside Meridian's fabric, sixteen Amsterdam leaves must learn which tenant addresses sit behind which other leaf, across three sites.

BGP, the Border Gateway Protocol, solves both. It runs between independently operated networks, and it is general enough that data centers use it inside too. A prefix is a block of addresses, and a route is a prefix plus where to send packets for it. BGP delivers routes, with enough attached for each network to choose among them.

Five ideas: what an autonomous system is and how its numbers work; one announcement traced across four networks; why BGP chooses by policy and money rather than distance; the two rule sets called eBGP and iBGP; and where BGP runs, from a server rack to the internet edge.

## Autonomous systems and their numbers

An autonomous system, or AS, is a set of prefixes run under a single, well-defined routing policy. It is defined by who decides how traffic enters and leaves, not by geography or the number of routers. Meridian is AS 64500 to the internet, while its fabric's overlay uses AS 65000 internally. Its three sites are one AS to the outside. And an AS is not a router: it is every gateway, switch and link inside the border, sharing one policy.

Inside an AS, an interior protocol such as IS-IS computes shortest paths over a map every router shares. Between ASes there is no shared map. Each AS sees only its neighbours' announcements: these prefixes, through me, along this path of ASes.

AS numbers come from IANA through the five regional internet registries. Well over 100,000 have been assigned, and roughly 78,000 appear in the global table at any time, most of them stub networks that carry nobody else's traffic.

The original field was 2 bytes, 65,536 numbers. It was extended to 4 bytes, and from about 2009 to 2010 the registries began assigning 4-byte numbers by default. Old routers survive because a large number is replaced by a placeholder, AS trans, 23456, while the real path rides in a separate attribute, the AS4 path, which old routers pass on untouched. For anyone writing filters: in a 2-byte world, 23456 stands for every 4-byte network at once.

Two ranges to recognise on sight. 64496 to 64511 is for documentation, which is why Meridian and its ISPs use 64500, 64501 and 64502. And 64512 to 65534, about a thousand numbers, are private, the AS equivalent of 10.0.0.0 slash 8: free inside your network, meaningless outside. A second private range in the 4-byte space holds about 95 million more, for fabrics that give every switch its own number.

The way numbers break: the loop check you are about to meet assumes they are unique. Two networks using the same number reject each other's routes as loops, and the signal is AS-loop rejections between networks that never exchanged routes.

## One announcement, around the ring

The internet has no centre and no owner, and each connection between ASes is a business arrangement as much as a cable. Transit: a customer pays a provider to reach the whole internet. Meridian buys transit from ISP1 and ISP2, and both buy it from a larger transit provider, AS 64496. Peering: two networks exchange their customers' traffic directly, usually without payment.

BGP is path-vector: each route carries the list of ASes it has passed through, the AS path, and each AS adds its own number as it passes the route on. Watch it on four ASes in a ring.

The gateway gw1.ams originates Meridian's prefix with an empty AS path. It tells its partner gw2.ams over iBGP, and the path stays empty, because nothing has left the AS. Then it announces to ISP1, which receives the path 64500. The transit provider sees 64501 64500. ISP2 sees 64496 64501 64500. And ISP2 hands it to its customer, gw2.ams, with four numbers: 64502 64496 64501 64500.

gw2.ams never sent this route to anyone. What does it do with it?

[pause]

It discards it, because 64500 is already in the path. The loop check is per AS: its own number proves the route has been through Meridian, whichever router sent it. Without that check the announcement would circle the ring forever, because a BGP route carries no hop limit.

Read three more things off the trace. The path grows one number per AS crossed, not per router. It reads right to left: the rightmost number is the origin, the leftmost the neighbour that sent it. And the next hop is replaced at each boundary with the sender's address. The path is the route's history; the next hop is the packet's immediate step.

Then traffic flows the opposite way. An announcement is an invitation: send packets for this prefix to me. Meridian controls what it announces; every other network decides where to send the resulting traffic.

## Why policy beats shortest path

Inside one network, every router wants the same thing. Between networks they want different things, and most of the difference is money.

Transit is commonly billed at the 95th percentile. The provider samples the port every five minutes, sorts the month's samples, discards the top 5 percent and bills the highest one left. A 30-day month has 8,640 samples, so the top 432 are free: 36 hours of bursting. A backup job at double the rate for 20 hours costs almost nothing extra. One that runs 37 hours sets the whole month's bill at its rate.

So nearly every network applies three preferences. A customer's route beats a peer's, because the customer pays you. A peer's beats a provider's, because peering is free. And path length only breaks ties. BGP expresses this with local preference, a number a network attaches to routes as it accepts them, higher wins, compared before AS path length.

Meridian wants less inbound traffic through ISP2, so it repeats its own number towards ISP2, called prepending: 64500 four times. ISP2 now has a four-AS path from its customer and a three-AS path through its transit provider. Which does it use?

[pause]

The customer's. ISP2 gives customer routes a local preference of 200 and provider routes 80. The shorter path would mean paying transit to reach a customer who pays ISP2. Prepending moves only networks with no stronger preference.

The other direction. For a content network's prefix, ISP2 offers Meridian a two-AS path and ISP1 a three-AS path. But ISP1's port is flat-rate with spare capacity, while ISP2 bills at the 95th percentile, so Meridian gives ISP1's routes local preference 150 and sends the traffic the long way. Path length says nothing about latency anyway.

Export policy is the other half. If Meridian passed ISP2's routes on to ISP1, strangers' traffic would come in through one paid port and out through the other. So Meridian announces to its providers only its own prefix; breaking that rule is a route leak. You decide your outbound path completely, and only influence the inbound one, which is someone else's local preference.

## eBGP and iBGP

A router compares each neighbour's AS with its own. Different, and the session is eBGP, external. The same, and it is iBGP, internal. The messages are identical; what changes is what happens to a route as it is passed on.

iBGP exists because gw1.ams learns routes from ISP1 and gw2.ams from ISP2, and each needs both to decide consistently for the AS. IS-IS cannot carry a million external routes, and has nowhere to put an AS path or a local preference.

The rules, briefly. eBGP prepends its AS and sets itself as next hop; iBGP changes neither by default. Local preference is never sent over eBGP and always over iBGP, so the whole AS shares one preference. A route learned from one iBGP peer is never passed to another, because inside an AS the path cannot reveal a loop; the price is a full mesh, which route reflectors avoid. And eBGP sessions default to a time-to-live of 1, so the peer must be one hop away, while iBGP runs between loopbacks anywhere in the AS.

On gw2.ams, ISP2's route to the content network arrives over eBGP, two ASes, local preference 100. gw1.ams's arrives over iBGP: path unchanged at three ASes, local preference 150 carried along, and next hop gw1.ams's loopback, because the gateways set themselves as next hop. The longer path wins on local preference. And here is the module's central trap, coming later: an iBGP next hop is usually several hops away, and every router in between must know how to reach it.

## Where BGP runs

A large operator now runs more BGP sessions inside its data centers than at its edge. Every Amsterdam leaf is an iBGP client of two route reflectors: 32 sessions carrying EVPN routes that say which tenant addresses sit behind which leaf, where a full mesh would need 120. Many fabrics also run the underlay on eBGP instead of IS-IS: spines share one AS, each leaf has its own, and the same loop check stops routes turning back through a second spine.

Down at the hosts, often where software engineers meet BGP first, Calico announces pod subnets from Kubernetes nodes, and load balancers such as MetalLB announce a service's address from every instance. When an instance dies its route is withdrawn: health checking by routing.

Between sites, Meridian's six reflectors are fully meshed, 15 sessions. At the edge, the gateways speak eBGP to the ISPs as AS 64500, take a full table in, announce one prefix out, and strip private numbers, so 65000 never reaches the internet. Each role has its own normal prefix count and timers.

## When it breaks, and what to show

The case that fools people is the one where nothing is down. In an eBGP underlay, leaf4.ams is built from a copy of leaf3.ams's template, and both become AS 65103. leaf4.ams's loopback reaches leaf3.ams with the path 65100 65103, and leaf3.ams faithfully discards it as a loop. Those two cannot reach each other. Every other pair works, and every session is green.

A private number can also leak upstream when a gateway or an ISP forgets to strip it. Many networks drop such routes, so the prefix vanishes from one upstream.

So the platform should show an ASN inventory with uniqueness enforced; sessions grouped by role, because each has a different normal; what you actually send each external neighbour, against intent; rejected routes by reason, where a sudden run of AS-loop rejections between two internal devices is a duplicate number; and egress per upstream against its commit, with the month's 95th percentile so far.

And how the world sees you, on public route collectors. In the lesson's audit, gw2.ams sends the prefix over an Established session, yet nobody reaches Meridian through ISP2, perhaps because ISP2's filters do not list it yet. All inbound traffic arrives through ISP1. The redundancy exists only on paper, and only an outside view shows it.

## In the interview

"What is the difference between eBGP and iBGP?"

[pause]

One protocol. eBGP when the neighbour's AS differs from yours, iBGP when it matches. eBGP prepends the AS and sets itself as next hop; iBGP leaves both unchanged, carries local preference, and never passes one iBGP peer's route to another, which forces a full mesh or reflectors. The common wrong answer is "eBGP is for the internet, iBGP for the data center", which fails on an eBGP-underlay fabric, where every leaf-spine session is eBGP.

"Your company has one ISP. Do you need BGP?" Usually not: a static default does the job. BGP repays its cost when you multihome with your own number and your own addresses, so either provider can carry them. And it is honest to add that you would defer to the network team on contracts and registry paperwork, but would measure failover time and per-link utilisation.

## Recap

Four things to remember. An AS is a unit of routing policy, not a router or a site, and its number must be unique where the loop check applies: a duplicate drops routes with every session up. The AS path grows one entry per AS, reads right to left to the origin, and a router discards any route containing its own number. BGP chooses by policy first: customer over peer over provider, through local preference, compared before path length. And eBGP prepends and rewrites the next hop, while iBGP changes neither and never passes a peer's route to another peer.

At your desk: the AS number ranges, the four-AS announcement visualisation, the policy and billing code, the eBGP and iBGP rule table, the map of where BGP runs, the wire encoding, the failure table and audit code, and the AS path exercise.
