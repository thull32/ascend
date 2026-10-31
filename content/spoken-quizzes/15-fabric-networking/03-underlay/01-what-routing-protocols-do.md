---
lesson: what-routing-protocols-do
source: b8542411b0b52589
---
## 1

In the small Amsterdam fabric, two spines and four leaves, running on static routes only, the link between leaf3.ams and spine2.ams fails. What happens to traffic from leaf1.ams to leaf3.ams's loopback?

A, all of it is lost until leaf1.ams's static route times out. B, about a quarter is lost, because spine1.ams carries the rest twice. C, none is lost, because leaf1.ams's interfaces never went down. D, about half is lost: flows hashed to spine2.ams are dropped there.

[think]

The answer is D: about half is lost, because flows hashed to spine2.ams are dropped there.

leaf1.ams's static route keeps both next hops, because its own uplinks are up, and a static route tests nothing beyond them. Flows hashed onto spine2.ams arrive at a router that lost its only route to 10.255.1.13 with the failed link, and are dropped. Static routes never time out, and leaf1.ams's interfaces staying up is exactly why it keeps sending into the failure.

## 2

A fibre breaks inside a carrier network, and both spines' ports stay up. With BFD at 300 milliseconds times three, the fabric recovers in about one second. Without BFD, it takes about 30 seconds. Which phase accounts for most of the difference?

A, the SPF computation on every router in the domain. B, detecting the failure, by BFD or by the IS-IS hold timer. C, flooding the new LSP across both of the sites. D, writing the changed routes into the hardware FIB.

[think]

The answer is B: detecting the failure, by BFD or by the IS-IS hold timer.

Generating the LSP, flooding it, running SPF and updating the FIB take about 118 milliseconds together, in both cases. Detection is 900 milliseconds with BFD, and up to 30 seconds with IS-IS's 10-second hellos and a multiplier of three. SPF on a few hundred routers takes around a millisecond, so tuning the algorithm changes nothing measurable.

## 3

Meridian runs iBGP in AS 65000 between its leaves and route reflectors. Why is that iBGP not the fabric's IGP?

A, it computes no topology, and relies on IS-IS to reach its peers and next hops. B, an IGP must run over UDP, and BGP sessions always run over TCP. C, iBGP sessions cannot be sourced from loopback addresses on a leaf. D, only eBGP sessions can ever carry routes between routers in one site.

[think]

The answer is A: it computes no topology, and relies on IS-IS to reach its peers and next hops.

An IGP's role is to learn the topology and make every router reachable. The overlay's iBGP carries tenant reachability, such as "this MAC is behind 10.255.1.13", and depends on IS-IS both to reach its peer's loopback and to resolve that next hop. iBGP is normally sourced from loopbacks, and OSPF and IS-IS do not use UDP at all.

## 4

An OSPF design summarises each remote site's leaf loopbacks into one slash 24. What goes wrong when leaf2.sin fails?

A, the summary still covers its slash 32, so BGP keeps using that next hop. B, every leaf in Amsterdam reruns a full SPF for each loopback. C, the designated router for the Singapore area must be re-elected before recovery. D, OSPF refuses to form adjacencies across summarised areas.

[think]

The answer is A: the summary still covers its slash 32, so BGP keeps using that next hop.

Remote routers hold only the aggregate, which stays up while any Singapore loopback exists, so the failure of one slash 32 is invisible to them, and BGP next-hop tracking sees nothing change. Traffic to the dead VTEP black-holes until the route reflectors' BGP sessions to leaf2.sin time out, seconds to minutes later. Summaries reduce SPF work rather than adding it, and fabric links elect no designated router.

## 5

Four OSPF routers share a segment. R2 has priority 10. R1 and R3 have priority 1, with router IDs 10.0.0.1 and 10.0.0.4. R4 has priority 0. Later, R5 joins with priority 255. Who is the designated router after R5 joins?

A, R5, because the highest priority always takes over the role. B, R4, because priority 0 marks the preferred designated router. C, R2, because the election does not pre-empt a working designated router. D, R3, because the highest router ID wins once R5 has joined.

[think]

The answer is C: R2, because the election does not pre-empt a working designated router.

R2 won the original election on priority and keeps the role. OSPF's election is not pre-emptive, so R5 gains a role only through a later election: it becomes the backup once R2 fails and R3 is promoted. Priority 0 means never eligible, and router ID only breaks ties between equal priorities.

## 6

Which property of IS-IS most directly explains why it can form adjacencies on a brand-new fabric link before any IP routing works there?

A, it refreshes its LSPs every 900 seconds instead of every 1,800. B, it runs directly in Ethernet frames rather than inside IP. C, it elects a DIS on every link before exchanging any hellos. D, its hellos use TCP, which retries until the link is ready.

[think]

The answer is B: it runs directly in Ethernet frames rather than inside IP.

IS-IS packets are carried straight in layer 2 frames, so two routers on a link can exchange hellos and LSPs with no IP addressing or routes in place, and no distant IP host can send them one. It does not use TCP, fabric links elect no DIS, and the refresh interval has nothing to do with bringing an adjacency up.
