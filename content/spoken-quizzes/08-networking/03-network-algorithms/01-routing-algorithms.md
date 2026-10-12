---
lesson: routing-algorithms
source: 90deebfbc00f6838
---
## 1

In an OSPF area, a link fails. Which of these most directly decides how long it takes until every router forwards around it?

A, the number of autonomous systems in the route's path. B, failure detection, plus the deliberate delay before the shortest-path calculation. C, the 30-second periodic distance-vector update. D, the count-to-infinity bound of 16 from RIP.

[think]

The answer is B: failure detection, plus the deliberate delay before the shortest-path calculation.

Link-state convergence is detection time, from hellos or BFD, plus flooding, plus the deliberate delay before the calculation, plus programming the forwarding table. The Dijkstra run itself takes around a millisecond for a thousand routers. The 30-second update and the cap of 16 belong to RIP, and the path of autonomous systems belongs to BGP.

## 2

Why does adding the full path of autonomous systems to a route advertisement eliminate count-to-infinity?

A, it forces every router to run Dijkstra on one shared map. B, a router drops routes whose path already contains it. C, it shortens the interval between routing updates. D, it makes the metric additive, so Bellman-Ford converges.

[think]

The answer is B: a router drops routes whose path already contains it.

Count-to-infinity happens because a distance vector has no provenance, so D cannot tell that C's route to E goes through D. The path is exactly that provenance: a router that sees its own autonomous system in it knows the route loops through itself and discards it, so a stale route cannot be re-learned. Nobody runs Dijkstra on a shared map in BGP.

## 3

Two routes to the same prefix reach a BGP router. Route X has a path two autonomous systems long and a local preference of 100, from a transit provider. Route Y has a path five long and a local preference of 200, from a paying customer. Which one is installed?

A, both, load-shared across them with equal-cost multipath. B, X, because a shorter path means lower latency. C, whichever of the two routes arrived first. D, Y, because local preference is compared before path length.

[think]

The answer is D: Y, because local preference is compared before path length.

Local preference is the first rung of the ladder that operators normally set, and it encodes business policy: customer routes earn money. Path length only breaks ties among routes with equal local preference, and it never measured latency. Multipath across different paths is not the default.

## 4

Distance-vector routers run with split horizon on. The link between D and E fails, and D immediately installs a route to E at a cost of 11, via B. Why did split horizon not prevent this?

A, split horizon applies only to periodic updates, not to triggered ones. B, split horizon needs poison reverse to take effect at all. C, D ignores split horizon for routes with a cost below 16. D, B's route runs through C, not D, so B may advertise it.

[think]

The answer is D: B's route runs through C, not D, so B may advertise it.

Split horizon only stops a router advertising a route back to its own next hop. B reaches E via C, so from B's point of view, advertising to D is legitimate, even though C's path runs through D. The loop of D, B and C is three routers long, which split horizon cannot see. Hold-down timers, a feasibility condition or path information are needed.

## 5

A network announces a slash 24 that sits inside another organisation's slash 22, and traffic for that slash 24 is pulled worldwide within minutes. Which mechanism is responsible for the speed and reach, and what stops it?

A, OSPF flooding spreads it, and split horizon stops it. B, count-to-infinity spreads it, and poison reverse stops it. C, longest-prefix match spreads it, and RPKI stops it. D, anycast spreads it, and the multi-exit discriminator stops it.

[think]

The answer is C: longest-prefix match spreads it, and RPKI stops it.

A more specific prefix wins longest-prefix match in every forwarding table that accepts it, and BGP propagates it globally within minutes. RPKI origin validation lets routers check whether the originating autonomous system is authorised for that prefix and length, and drop the announcement. It does not validate the path, so route leaks need other controls.

## 6

Why does OSPF require all traffic between areas to cross area 0?

A, only area 0 can carry routes learned from BGP neighbours. B, area 0 routers are the only ones able to run the shortest-path calculation. C, summaries carry only a cost, and a hub topology cannot loop. D, it keeps each area's link-state database identical to area 0's.

[think]

The answer is C: summaries carry only a cost, and a hub topology cannot loop.

Inside an area, OSPF is link-state, but an area border router re-advertises other areas' prefixes as summaries: a prefix and a cost, which is a distance vector, and could loop like one. Forcing every path between areas through the backbone makes the graph of areas a star, which has no cycles. Every router runs the calculation, external routes can enter any non-stub area, and databases differ by area by design.
