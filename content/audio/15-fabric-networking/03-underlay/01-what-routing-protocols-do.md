---
lesson: what-routing-protocols-do
source: 6d7e077531453032
fit: great
desk:
  - "The static-routes-versus-IGP model, its per-flow loss report and the ECMP width check"
  - "The IGP and EGP table, Meridian's four uses of routing protocols, and the three-families table"
  - "The convergence visualisation and its phase-by-phase timing table, with and without BFD"
  - "The underlay dependency diagram, the IS-IS flooding visualisation and the SPF from spine2.ams worked by hand"
  - "The OSPF LSA header field by field, the LSA type groups and the DR election table"
  - "The OSPF and IS-IS comparison table"
  - "The route from daemon to kernel to chip, with the illustrative show output, and the failure modes table"
---
## Introduction

Meridian's Amsterdam site has 24 routers: 4 spines, 16 leaves, 2 route reflectors and 2 border gateways. Every one needs a route to the loopback address of the other 23, and a leaf's route to another leaf has four next hops, one per spine. That is 552 routes for one site's loopbacks alone.

A script could render all 552 from a spreadsheet. They would be correct on the day they were written, and wrong within a second of the first fibre cut, because a static route knows nothing about the path beyond its own next hop.

A routing protocol is the program that writes those routes and rewrites them whenever the network changes. Coming up: what every protocol does, the three algorithm families, where convergence time goes, the underlay's one job, and OSPF set against the IS-IS that Meridian runs.

## Filling the RIB, then keeping it true

A quick reminder. The RIB, the routing information base, is the control plane's table of every candidate route from every source. The FIB, the forwarding information base, is the copy of the winners that the forwarding chip reads for every packet. A routing protocol is one more source of RIB entries, whose purpose is to keep them true without a human.

Every routing protocol does four things. It finds neighbours, with hellos on each link, or for BGP a TCP session to a configured address. It exchanges reachability. It computes a best route per prefix and installs it. And it reacts: it notices when a neighbour or link disappears, tells the others, and recomputes. The first three fill the RIB. The fourth is why you run the protocol at all.

Here is life without one. Take the small Amsterdam example: two spines, four leaves, every leaf linked to every spine, on static routes. leaf1.ams reaches leaf3.ams's loopback, 10.255.1.13, through both spines.

Now the fibre between leaf3 and spine2 is cut. Both ends lose light within milliseconds and drop every static route over that link, so spine2 loses its only route to leaf3. But leaf1 sees nothing. Both of its own uplinks are fine, so it keeps both next hops, and keeps hashing about half of its flows to leaf3 onto spine2, which drops them. leaf2 and leaf4 suffer the same way. Nothing changes until an engineer edits six routers, and apart from the two ends of the cut fibre, every interface stays green.

With a link-state protocol, leaf3 and spine2 each announce that the link is gone, and every router recomputes. leaf1 drops spine2 as a next hop. spine2 finds a longer path: down to another leaf, up to spine1 and down to leaf3. Every flow is delivered. But six leaf-to-leaf directions now run on one of their two next hops. Everything is reachable, half the capacity is gone, and no "is it up?" check will tell you.

## Interior, exterior, and three families

An autonomous system is a network under one administration with one routing policy, identified by an AS number. Meridian's internet presence is AS 64500.

An IGP, an interior gateway protocol, routes inside one AS. Every neighbour is your own router, so it trusts every message, discovers neighbours automatically, and optimises the lowest total metric. IS-IS and OSPF are IGPs. An EGP, an exterior gateway protocol, routes between ASes. The other end belongs to someone else, so nothing is discovered or trusted: every route is filtered, and path choice follows contracts rather than distance. BGP is the only EGP in use.

The trap is reading these as protocol names rather than roles. Meridian runs BGP inside its own network. IS-IS is the underlay IGP. iBGP carries EVPN routes, which say which tenant address sits behind which leaf. That iBGP is not an IGP: it computes nothing about the topology, and relies on IS-IS to reach every peer and every next hop. And the alternative design later in this module uses eBGP as the IGP.

Now the three algorithm families, because the family predicts how a protocol fails. The routing algorithms lesson in the networking track traces each one.

Link-state, which is IS-IS and OSPF: every router floods a description of its own links to everyone, so all hold the same map, and each runs Dijkstra's shortest-path-first algorithm, SPF, from itself. Bad news travels as fast as the flood, in milliseconds.

Distance-vector, which is RIP and EIGRP: each router tells its neighbours only its distance to every destination. Nobody holds a map, so a router cannot tell that a neighbour's route runs back through itself, and after a failure stale distances climb one step per exchange, the count to infinity. With RIP, that can take minutes.

Path-vector, which is BGP: distance-vector where each route carries the list of ASes it has crossed, and a router that finds its own AS in the list discards the route. That kills count to infinity without revealing anyone's topology, and leaves room for policy. Bad news travels by timer-paced path exploration, in seconds to minutes.

Fabrics run link-state: a few hundred routers is small for it, and one shared map is something a tool can read, diff and reason about.

## Where convergence time goes

Convergence is the interval from a change until every router's FIB matches the new topology. For link-state it has four phases: detection, propagation, computation, and programming the FIB.

Take one of Meridian's Amsterdam to Singapore circuits. A fibre breaks inside the carrier's network, and the carrier keeps the spines' ports lit, so loss of light never arrives. Detection falls to BFD, Bidirectional Forwarding Detection, a lightweight hello every 300 milliseconds, declared down after three misses. Without BFD, it falls to IS-IS's hold timer: 10-second hellos, times three, 30 seconds.

Before I give you the numbers: which of the four phases dominates?

[pause]

Detection, by far. With BFD it takes 900 milliseconds. IS-IS then waits 50 milliseconds and floods, in about 2 milliseconds inside a site. Each router waits a deliberate 50 milliseconds, then runs SPF in about 1. Writing the FIB takes about 15. Seen from leaf1.ams, about 1,018 milliseconds in all, and about 5 gigabytes lost at 40 gigabits per second. Without BFD, the same steps sit behind 30 seconds of detection, and about 150 gigabytes are lost.

Detection is 88 percent of the tuned total and almost all of the untuned one. The algorithm, where textbooks spend their time, is about a millisecond.

And routers do not finish at the same moment. spine1 has removed the circuit and sends Singapore traffic down to a leaf, which, not yet updated, hashes some back up. The packets bounce until their time to live runs out or the leaf catches up, a few milliseconds later. That is a microloop, and it is normal: link-state is loop-free only after convergence. The signal is a burst of TTL-expired counters after each change.

## The underlay's single job

The underlay is the fabric's physical links plus the IGP over them. Its job is narrower than "routing": make every device's loopback reachable from every other device, over every equal-cost path, and keep it so through failures. A loopback is a virtual interface with no cable, so it stays up whatever happens to any one link.

Everything else stands on it, because the loopback is used three times. First, as the BGP session endpoint: leaf1.ams peers with its route reflector between loopbacks, so the session survives any single link failure. If the loopback is unreachable, the session sits in Active, retrying TCP. Second, as the BGP next hop: an EVPN route for Acme's database server says "behind 10.255.1.13", and the router resolves that address through the IGP to a real interface. Third, as the tunnel endpoint: the loopback is also the leaf's VTEP address, so every tenant packet's outer header goes loopback to loopback, and spines forward it on IGP routes alone. When the underlay breaks, everything above it breaks at once.

So the table is small: a few hundred prefixes across three sites, against a million at the internet edge. No tenant subnet ever enters it. Acme and Globex both use 10.1.1.0 slash 24, which would collide in one global table, so tenant routes live in BGP EVPN, in per-tenant tables.

## OSPF, and how IS-IS differs

OSPF is the link-state IGP of most enterprise networks and of many data centers: the same job as IS-IS, in different packaging.

It runs directly over IP, with no TCP or UDP. Hellos go every 10 seconds, and a neighbour silent for 40 is declared down. Neighbours climb a ladder of states, through swapping database summaries in ExStart and Exchange, to Full, where their databases match, and only Full adjacencies carry routes. The classic stuck case: those summaries carry the interface MTU, and a router rejects them when the neighbour's is larger. Routers set to 9,216 and 1,500 hear each other's hellos and never reach Full.

OSPF's unit of information is the LSA, the link-state advertisement. Its age counts up and flushes it at 3,600 seconds, so the originator refreshes it every 1,800, and a higher sequence number means newer. Router and network LSAs, types 1 and 2, are the map. The summary and external types are really distance-vector claims, "prefix P, cost 30, via me", carried inside a link-state protocol.

An area floods its topology only internally. Area 0, the backbone, connects all the others, and an area border router passes prefixes between them as summaries. All inter-area traffic crosses area 0, which keeps those summaries from looping.

On Meridian, an OSPF design might put each site's leaves in their own area. The tempting next step is to summarise Singapore's loopbacks into one slash 24. Here is why that hurts. leaf2.sin dies, but the summary still covers its address, so Amsterdam's BGP keeps that next hop and sends VXLAN traffic towards a dead VTEP, until the route reflectors' sessions to leaf2.sin time out: often 9 seconds in a tuned fabric, 90 to 180 on defaults, instead of milliseconds. Fabrics keep every loopback as its own slash 32, part of why Meridian runs one flat IS-IS domain.

On a shared segment, a full mesh of adjacencies grows with the square of the routers. So OSPF elects a designated router and a backup, and everyone else forms Full adjacencies only with those two: for ten routers, 17 adjacencies instead of 45. Highest priority wins, router ID breaks ties, priority 0 opts out, and the election is not pre-emptive. None of this belongs in a fabric, where every link joins exactly two routers. Left at the broadcast default, a fabric link elects a DR anyway and can wait up to 40 seconds first, so fabrics configure every link as point-to-point. IS-IS's equivalent, the DIS, is pre-emptive with no backup, and fabrics turn it off the same way.

Now IS-IS against OSPF. Both flood with sequence numbers, run SPF and install ECMP. IS-IS runs directly in Ethernet frames, with no IP at all, so an adjacency forms before any IP routing exists, and no distant IP host can send it a packet. It grows by TLVs, type-length-value fields that old routers pass on even when they do not understand them, so IPv4 and IPv6 share one instance, where OSPF needs a separate OSPFv3. Its records count a remaining lifetime down from 1,200 seconds. With an MTU mismatch, IS-IS pads its hellos to the MTU, so the adjacency never forms at all.

That is why Meridian chose IS-IS. The honest addendum: OSPF would also work, plenty of fabrics run it, and the choice often follows what the team knows best.

## In the interview

"Our fabric's topology never changes. Why not static routes?"

[pause]

Because links do change, and a static route tests only its own next hop. In a Clos, a failure one hop away leaves upstream routers hashing a share of flows onto a router that has lost the route: about half the traffic to one leaf in the two-spine case, with almost every interface green. The common wrong answer is "statics are faster". They are only cheaper to evaluate, and never repair themselves.

"Why does the underlay carry slash 32 loopbacks, and why not summarise them?"

[pause]

The loopback never goes down with one link, so sessions, next hops and tunnel endpoints are addressed to it, and each needs its own slash 32, so that one device's failure shows as one route disappearing. A summary keeps covering a dead device's address, and BGP keeps resolving next hops to it. The common wrong answer is "summarise to save TCAM", the switch's route memory, for a table of a few hundred entries.

## Recap

Four things to remember. A routing protocol finds neighbours, exchanges reachability, computes, and reacts, and the reacting is why it exists: a static route cannot see past its own next hop. IGP and EGP are roles, not protocol names: iBGP is Meridian's overlay directory, not its IGP. Convergence time is mostly detection: about a second with BFD, about 30 without, while SPF takes a millisecond. And the underlay's single job is every loopback reachable as its own slash 32 over every equal-cost path, measured by path width as well as reachability.

At your desk: the static-versus-IGP model, the convergence and IS-IS flooding visualisations with their tables, the LSA header and DR election, the OSPF and IS-IS comparison, and the failure modes table.
