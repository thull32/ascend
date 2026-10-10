---
lesson: routing-algorithms
source: 8e74e44ccf2a2a9f
fit: partial
desk:
  - "The SPF trace from A and the LSA flooding timeline, on the five-router topology"
  - "The three distance-vector tables: cold start, count to infinity, and the split-horizon run"
  - "The BGP attribute table and the decision process worked on four routes"
  - "The OSPF LSA types, the wire formats and the production failure-mode table"
  - "Exercise: simulate distance-vector rounds after a link failure"
---
## Introduction

A packet leaving your laptop for a server on another continent crosses somewhere between ten and twenty routers. None of them has a complete picture of the internet, and none agreed on anything with the others in advance. Each one looks at the destination address, consults a table, and forwards. The whole question of routing is how those tables get filled in, so that a chain of independent local decisions adds up to a path that arrives, and keeps arriving when a link goes down at 3 in the morning.

There are three answers in production. Link-state routing, which is OSPF and IS-IS, floods a map of the network to every router and has each one run Dijkstra. Distance-vector routing, RIP, is Bellman-Ford run by gossip between neighbours. Path-vector routing, BGP, is distance-vector with the whole path attached, so that policy can override distance. Which one is in play tells you how fast a failure heals, what the failure looks like, and why "shortest" is not what the internet optimises.

One distinction explains almost everything that follows: what information the routers exchange, and who does the computation. The forwarding table is the output; the algorithm is the control plane that fills it in. And one rule holds in every table: when a packet matches two prefixes, the longer prefix wins, whatever the metrics say.

## Link-state: flood the map

Keep one small network in your head for the whole episode. Five routers, A to E. A connects to B cheaply, at cost 1. B connects to D at cost 5, but B also reaches C for 2, and C reaches D for 1. D connects to E for 3. And there is a direct link from A to C, at cost 4.

From A, the cheapest path to E goes A, B, C, D, E, for a total of 7. The path A, B, D, E has one hop fewer but costs 9. Fewest hops is not cheapest, and every algorithm has to get that right.

A link-state router does three things. It discovers its neighbours with hello packets: by default in OSPF, one every 10 seconds, and a neighbour is declared dead after 40 seconds of silence. It floods a link-state advertisement, describing its own links and their costs, to every router in the area, with a sequence number so newer copies replace older ones. And it runs Dijkstra from itself over the resulting database, which is identical on every router, and installs the first hop of each shortest path.

Because every router runs the same algorithm on the same map, their trees agree. When A sends a packet for E to B, B's own tree sends it on towards C. That agreement is what makes forwarding loop-free once everyone has converged.

Now fail the link between D and E. D notices and floods a new advertisement with a higher sequence number. At a millisecond per hop, every router has it within two hops, after seven transmissions in total, because a flood crosses each link at most once in each direction. Bad news travelled as fast as good news. Hold onto that.

## Where convergence time really goes

Convergence is detection, plus flooding, plus a deliberate delay before running Dijkstra, plus writing the new routes into hardware. The algorithm is the cheap part. The lesson measured a pure-Python Dijkstra at 0.7 milliseconds on a thousand routers and four thousand links.

What costs time is detection. If a failure does not raise loss of signal at the router, say a fibre cut behind a media converter, the neighbour only dies when the 40-second dead interval expires. That is how an OSPF network that "converges in milliseconds" black-holes traffic for 40 seconds. The fix is Bidirectional Forwarding Detection, which cuts detection to about 150 milliseconds with three missed 50-millisecond probes.

Link-state does not scale forever: storing the whole graph and rerunning Dijkstra on every change gets expensive at thousands of routers. So OSPF splits a domain into areas around a backbone, area 0. Between areas, a border router re-advertises each area's prefixes as summaries: a prefix and a cost, with no topology. That is a distance vector, and distance vectors can loop. OSPF's answer is a topology rule rather than an algorithm: all inter-area traffic crosses area 0. A star of areas has no cycles to loop around. The price is that an inter-area route can be worse than the true shortest path.

One more detail. When two paths tie, real routers install both and hash each flow's addresses, protocol and ports onto one of them. That is equal-cost multipath. Hashing by flow keeps a TCP connection on one path, so its segments do not reorder. The price is that one elephant flow cannot be split.

## Distance-vector and count to infinity

A distance-vector router knows nothing about the topology. It knows the cost of its own links, and every 30 seconds in RIP it tells each neighbour its best distance to every destination it knows. For each destination, it takes the cheapest offer: the cost to a neighbour plus that neighbour's claimed distance. That is Bellman-Ford's relaxation step, run asynchronously, with nobody ever holding the graph.

From cold, it works. It reaches the same answers Dijkstra did, but good news travels only one hop per round. A, four hops from E, first hears of it in round 3. And A's first answer was wrong: it chose the path through C at cost 8, before B's better offer reached it a round later.

Now fail D to E again, the failure link-state handled in two milliseconds. Before I tell you what happens: D has just lost its route to E. Its neighbour C is still advertising a distance of 4 to E. What does D do?

[pause]

D takes it. It has no way to know that C's 4 is a route through D itself. So D now claims 5 via C, C hears D's 5 and moves to 6, and the routers keep pushing each other's numbers up, by two every couple of rounds. RIP's infinity is 16. In the lesson's trace it took thirteen rounds for everyone to reach 16 and agree that E is unreachable. At RIP's 30-second updates, that is six and a half minutes of packets circling until their TTL expires. It is also why RIP caps a network at 15 hops: infinity has to be small for the count to end.

## The loop split horizon misses

The textbook fix is split horizon: never advertise a route back to the neighbour you use to reach it. Poison reverse goes one step further and advertises it to that neighbour as infinity.

Run the same failure with split horizon on. C no longer tells D about E. But B, whose route runs through C, still does, and from where B stands that is perfectly legitimate. So D immediately installs a route to E at cost 11, via B, and the network now loops through three routers. It still counts to infinity: seven rounds instead of thirteen, and still a loop.

Split horizon kills two-router loops only. Longer loops need more information. A hold-down timer ignores any new route to a destination for a while after it goes unreachable, 180 seconds by default in Cisco's RIP. Triggered updates send on change instead of waiting 30 seconds. Or EIGRP's feasibility condition accepts a new next hop only if that neighbour's own distance is strictly less than the router's previous best, which guarantees the neighbour's path does not run back through you.

The general lesson is wider than routing. Any system that forwards second-hand claims without provenance, gossip and cache invalidation included, can turn one stale fact into a persistent loop.

## BGP: the path, and the primacy of policy

Between networks, link-state is out. The IPv4 internet held roughly 78 thousand autonomous systems at the start of 2026: ISPs, clouds, universities, each a network under one administration. Nobody will flood their topology to a competitor, there is no common metric, and the goal is not shortest. An ISP wants traffic to go where it earns money, or where a contract says it must.

BGP keeps distance-vector's shape and fixes the loop with one change. Every advertisement carries the list of autonomous systems it has passed through, and a network that sees its own number in that list discards the route. There is no count to infinity, because the path itself proves where the route has been.

Then comes the decision process, a ladder of tie-breakers. The rung that matters first is local preference, set by your own routers on import. A common convention is customers 200, peers 150, transit providers 100: prefer routes that earn money, over free ones, over paid ones. Only among equal local preference does BGP compare the length of the path, and that counts networks, not hops or milliseconds. Further down comes the MED, a neighbour's hint about which of its entry links it prefers, compared only between routes from that same neighbour. Then hot-potato routing: hand the packet to the other network at your nearest exit. The ladder order is the policy.

Export follows rules too. A route learned from a customer goes to everyone. A route learned from a peer or a provider goes only to customers. Re-exporting a provider's route to a peer would mean carrying traffic between two networks for free, and that mistake is a route leak.

BGP is also slow on purpose. The standard suggests at least 30 seconds between updates for the same prefix to an external peer, and a withdrawal sets off path exploration, where routers briefly select successively longer alternates, each withdrawn in turn. A global withdrawal can take minutes to settle.

## Hijacks, anycast and failures

Longest-prefix match is also BGP's biggest weakness. Announce a more specific slice of someone else's prefix and you attract their traffic worldwide within minutes. In 2008 an ISP announced a more-specific of YouTube's prefix to block it domestically, the announcement leaked upstream, and the site was unreachable for much of the world for about two hours. The deployed defence is RPKI: prefix holders publish signed statements saying which network may originate a prefix, and validating routers drop announcements that fail. It checks the origin only, not the path.

The same mechanism, used on purpose, is anycast. A service announces one address from twenty sites and lets BGP deliver each client to the closest one. That is how public DNS resolvers and CDN edges choose a location with no client logic. A route change can move a long-lived TCP connection to a site that has never heard of it, which DNS over UDP does not care about. Safe for UDP, best-effort for long TCP.

Two production stories worth carrying. Microloops: after every topology change, routers install their new tables at slightly different moments, so for tens to hundreds of milliseconds one points at a neighbour that still points back. And hardware table exhaustion: in August 2014 the global IPv4 table passed 512 thousand routes, the default allocation on Cisco's widely deployed Catalyst 6500 and 7600, and some prefixes became unreachable or fell back to slow software forwarding.

## In the interview

A follow-up the lesson expects. Every link-state router runs Dijkstra on the same database. Can packets still loop?

[pause]

Yes, transiently. During convergence routers hold different versions of the database, or have programmed their tables at different moments, so two routers can point at each other for tens of milliseconds. Loop-free alternates and ordered table updates exist for exactly this. The wrong answer is "no, the computation is consistent, so loops are impossible", which is only true after convergence.

And another. Why does BGP not use link-state? Because networks will not disclose their internal topology, there is no common metric to add up, and routing must follow contracts rather than distance. Path-vector lets each network export only what its policy allows while still detecting loops. The wrong answer is "Dijkstra is too slow for the internet": over a million nodes it takes seconds. The real obstacles are trust and policy.

## Recap

Four things to remember. Link-state floods a map and runs Dijkstra, so bad news spreads in milliseconds and the slow part is detection, which is why you turn on BFD. Distance-vector has no provenance, so a stale route counts to infinity, and split horizon only stops two-router loops. BGP carries the path to kill loops, and local preference beats path length, because the internet routes by money and contracts. And longest-prefix match is what makes a hijack spread, with RPKI checking only the origin.

At your desk: the shortest-path and flooding traces, the three distance-vector tables, the BGP decision process worked on four routes, and the count-to-infinity exercise.
