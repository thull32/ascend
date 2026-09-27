---
slug: routing-algorithms
title: "Routing algorithms: link-state, distance-vector and path-vector"
description: How OSPF runs Dijkstra on a flooded map, why RIP counts to infinity, and why BGP picks routes by policy rather than distance.
minutes: 28
difficulty: medium
tags: [routing, ospf, bgp, dijkstra, bellman-ford, distance-vector, link-state]
problems: []
---
A packet leaving your laptop for a server in another continent crosses somewhere between ten and twenty routers, none of which has a complete picture of the internet, and none of which agreed on anything with the others in advance. Each one looks at the destination address, consults a table, and forwards. The whole question of routing is: how do those tables get filled in so that the sequence of independent local decisions adds up to a path that actually arrives, and keeps arriving when a link goes down at 3 a.m.?

There are only three answers in production, and you already know the algorithms behind two of them. Link-state routing (OSPF, IS-IS) floods a map of the network to every router and has each one run Dijkstra. Distance-vector routing (RIP, EIGRP) is Bellman-Ford executed by gossip between neighbours. Path-vector routing (BGP) is distance-vector with the whole path attached, so that policy can override distance entirely. Knowing which one is in play tells you how fast a failure heals, what the failure modes look like, and why "shortest" is not what the internet optimises.

## The forwarding table is the output, not the algorithm

Every router keeps a **forwarding information base** (FIB): a longest-prefix-match table from destination prefix to next hop and outgoing interface. The data plane consults only this table, per packet, in hardware. Everything in this lesson is about the control plane that computes the table.

```text
Destination        Next hop        Interface   Metric
10.0.0.0/8         10.1.1.2        eth0        20
10.2.0.0/16        10.1.1.6        eth1        10
203.0.113.0/24     192.0.2.1       eth2        30
0.0.0.0/0          192.0.2.1       eth2        -
```

The routing protocols differ in *what information they exchange* and *who does the computation*. That single distinction explains almost every property below.

| Family | What is exchanged | Who computes | Convergence | Scale | Examples |
|---|---|---|---|---|---|
| Link-state | The full topology (every link and its cost) | Every router, independently, via Dijkstra | Fast (sub-second inside a domain) | One administrative domain, split into areas | OSPF, IS-IS |
| Distance-vector | Your own best distances to each destination | Each router, from neighbours' vectors, via Bellman-Ford | Slow; pathological on failure | Small networks | RIP, EIGRP (with fixes) |
| Path-vector | Distances plus the full path of autonomous systems | Each router, by policy | Minutes across the internet | The internet | BGP |

## Link-state: flood the map, run Dijkstra

In a link-state protocol every router does three things.

1. **Discover neighbours** with periodic hello packets on each interface (OSPF defaults: hello every 10 s, neighbour declared dead after 40 s on broadcast networks; tuned much lower in modern deployments, and bidirectional forwarding detection can bring it to tens of milliseconds).
2. **Flood a link-state advertisement** (LSA) describing its own links and their costs to every other router in the area. Flooding is reliable: each LSA carries a sequence number, each router re-floods a new LSA to all interfaces except the one it came from, and duplicates (same or older sequence number) are dropped. After flooding, every router holds an identical **link-state database**: the complete graph.
3. **Run Dijkstra** with itself as the source on that graph, and install the first hop of each shortest path into the FIB.

The graph below is a small OSPF area with link costs; OSPF's default cost is `reference_bandwidth / link_bandwidth`, so a 10 Gbit/s link with a 100 Gbit/s reference costs 10 and a 1 Gbit/s link costs 100. Step through it from `R1` and watch the shortest-path tree grow the same way it did in [Dijkstra](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra).

```viz
{"type": "graph", "algorithm": "dijkstra", "directed": false, "start": "R1",
 "title": "OSPF SPF calculation from R1",
 "nodes": [{"id":"R1"},{"id":"R2"},{"id":"R3"},{"id":"R4"},{"id":"R5"},{"id":"R6"}],
 "edges": [{"from":"R1","to":"R2","w":10},{"from":"R1","to":"R3","w":100},{"from":"R2","to":"R3","w":10},{"from":"R2","to":"R4","w":100},{"from":"R3","to":"R5","w":10},{"from":"R4","to":"R6","w":10},{"from":"R5","to":"R6","w":10},{"from":"R5","to":"R4","w":100}]}
```

From `R1`, the path to `R6` is `R1 → R2 → R3 → R5 → R6` at cost 40, not the two-hop `R1 → R2 → R4 → R6` at cost 120. Fewer hops is not shorter. Every router runs the same computation on the same database and gets a consistent set of trees, which is the property that makes forwarding loop-free: if `R1` sends to `R2` believing `R2` is on the shortest path to `R6`, then `R2`'s own tree, computed on the same graph, agrees.

```viz
{"type": "network", "scenario": "link-state", "title": "LSA flooding and per-router SPF"}
```

### Why link-state converges fast

When a link fails, the two routers on either end detect it (missed hellos or a loss-of-signal interrupt), originate new LSAs with higher sequence numbers, and flood. Every router receives the change within a flooding delay (milliseconds per hop) and reruns Dijkstra. There is no rumour to chase down: the map changed, everyone recomputes. Convergence time is dominated by *detection* plus a deliberate SPF hold-down timer (routers wait a few tens of milliseconds to batch changes, backing off exponentially under churn so a flapping link does not pin every CPU in the area).

The cost is that every router stores the full graph and runs $O(E \log V)$ per change. That is why OSPF has **areas**: routers inside an area see the full topology of the area, and area border routers summarise the area into a few prefixes for the backbone (area 0). Summarisation trades optimality for scale; the backbone does not know the intra-area topology, so an inter-area path can be worse than the true shortest path. Large operators run IS-IS for the same reason people run OSPF and choose it for slightly better scaling and because it runs directly over layer 2 rather than IP.

### Equal-cost multipath

If two paths tie, Dijkstra picks one arbitrarily. Real routers install *all* of them (ECMP) and hash each flow (5-tuple: source and destination address, protocol, source and destination port) onto one of the next hops. Hashing by flow, not by packet, keeps a TCP connection's packets on one path so they do not reorder. This is the same idea as load balancing by consistent hash in [Consistent hashing and routing](/learn/networking/networking-in-practice/service-meshes-and-proxies), and it has the same failure mode: a single elephant flow cannot be split, and a fixed hash of a small number of flows can be badly balanced.

## Distance-vector: Bellman-Ford by gossip

A distance-vector router knows nothing about the topology. It knows the cost of its own links, and every 30 s (RIP) it sends its neighbours a vector: "here is my current best distance to every destination I know about". On receiving a neighbour's vector, it relaxes:

$$
d(x, y) = \min_{v \in N(x)} \big( c(x, v) + d(v, y) \big)
$$

That is exactly the relaxation step of [Bellman-Ford](/learn/algorithms/graph-algorithms/bellman-ford-and-floyd-warshall), except that the rounds are asynchronous and the "graph" is never assembled anywhere. Each router only ever sees the vectors of its direct neighbours.

Watch the classic single-source version run on the same router topology, and then compare it with the gossip version below it.

```viz
{"type": "graph", "algorithm": "bellman-ford", "directed": false, "start": "A",
 "title": "Bellman-Ford relaxation on a three-router network",
 "nodes": [{"id":"A"},{"id":"B"},{"id":"C"}],
 "edges": [{"from":"A","to":"B","w":1},{"from":"B","to":"C","w":2},{"from":"A","to":"C","w":5}]}
```

```viz
{"type": "network", "scenario": "distance-vector", "title": "Neighbours exchanging distance vectors"}
```

### A worked convergence

Three routers `A`, `B`, `C` with links `A–B = 1`, `B–C = 2`, `A–C = 5`. Each starts knowing only its direct links.

| Round | A's vector | B's vector | C's vector |
|---|---|---|---|
| 0 (initial) | A:0, B:1, C:5 | A:1, B:0, C:2 | A:5, B:2, C:0 |
| 1 (after first exchange) | A:0, B:1, **C:3 via B** | A:1, B:0, C:2 | **A:3 via B**, B:2, C:0 |
| 2 | unchanged | unchanged | unchanged |

In round 1, `A` receives `B`'s vector and computes `c(A,B) + d(B,C) = 1 + 2 = 3 < 5`, so its route to `C` moves to next hop `B`. `C` does the symmetric thing. Nothing changes in round 2, so the network has converged. Bellman-Ford's bound of `V − 1` rounds holds here too: two exchanges is the most this three-node network ever needs to settle after a *good* change.

### Count to infinity: why bad news travels slowly

Good news (a link came up, a cost dropped) propagates in one round per hop. Bad news is where distance-vector earns its reputation. Take a line `R1 – R2 – R3 – N` where `N` is a network attached to `R3`, all link costs 1:

- `R3` reaches `N` at cost 1.
- `R2` reaches `N` at cost 2 via `R3`.
- `R1` reaches `N` at cost 3 via `R2`.

Now the `R3–N` link fails. `R3` sets `d(R3, N) = ∞`. But before it can tell anyone, `R2`'s periodic update arrives at `R3` saying "I can reach `N` at cost 2". `R3` has no idea that `R2`'s route goes *through `R3`*; the vector carries no path. So `R3` relaxes: `c(R3,R2) + d(R2,N) = 1 + 2 = 3`, and installs a route to `N` via `R2`.

| Update | R3 thinks | R2 thinks | R1 thinks |
|---|---|---|---|
| link fails | ∞ | 2 via R3 | 3 via R2 |
| R2 → R3 | **3 via R2** | 2 via R3 | 3 via R2 |
| R3 → R2 | 3 via R2 | **4 via R3** | 3 via R2 |
| R2 → R3, R2 → R1 | **5 via R2** | 4 via R3 | **5 via R2** |
| … | 7 | 6 | 7 |
| … | 15 | 16 = ∞ | 15 |

Packets for `N` bounce between `R2` and `R3` the whole time, and each round of updates raises the metric by one. RIP defines 16 as infinity precisely so this loop terminates in a bounded number of rounds; at 30 s per update, that is several minutes of black-holed traffic for a single link failure, and it also caps a RIP network at 15 hops.

Two mitigations are standard and both are heuristics, not fixes:

- **Split horizon**: never advertise a route back out of the interface you learned it from. `R2` would not tell `R3` about `N` at all, killing the two-node loop above.
- **Poison reverse**: do advertise it, but with metric ∞, so the neighbour explicitly overwrites any stale route. Costs bandwidth, converges faster.

Neither prevents loops of three or more routers, which is why EIGRP added a diffusing computation (DUAL) that queries neighbours before accepting a worse route, and why nobody deploys plain RIP in anything they care about. The lesson generalises beyond routing: any system where nodes forward second-hand claims without provenance can amplify a single stale fact into a persistent loop. Gossip protocols and cache invalidation have the same problem in different clothing.

## Path-vector: BGP and the primacy of policy

The internet is roughly seventy-five thousand **autonomous systems** (ASes), each a network under one administration (an ISP, a cloud, a university, Netflix's AS2906). Inside an AS, OSPF or IS-IS computes shortest paths. *Between* ASes, no one is willing to flood their topology to a competitor, no one agrees on a common metric, and "shortest" is not the goal: an ISP wants traffic to go where it is cheapest or where a contract says it must. Link-state is unusable; distance-vector loops. BGP solves both with one change to the vector: it carries the **list of ASes the route has passed through**.

```text
Prefix            Next hop       AS_PATH               LOCAL_PREF  MED
203.0.113.0/24    192.0.2.1      64501 64502 64505     100         0
203.0.113.0/24    198.51.100.1   64510 64505           200         0
```

Loop prevention becomes trivial: if an AS sees its own number in the `AS_PATH` of an incoming advertisement, it discards it. There is no count-to-infinity because the path itself is the proof of where the route has been.

```viz
{"type": "network", "scenario": "bgp-path", "title": "AS_PATH growing as a route propagates between ASes"}
```

### The decision process is a policy, not a metric

When a BGP router has several routes to the same prefix, it runs a fixed tie-break ladder. The first rungs that matter:

1. **Highest `LOCAL_PREF`**: an operator-set value. "Prefer the customer's route (they pay us) over the peer's route (free) over the transit provider's route (we pay them)." This overrides everything below it, which is why the internet does not route by distance.
2. **Shortest `AS_PATH`**: the only rung that resembles a distance metric, and it counts ASes, not hops or latency. An AS can make itself look worse by **prepending** its own number several times.
3. **Lowest origin type**, then **lowest `MED`** (multi-exit discriminator, a hint from the neighbouring AS about which of several links into it they prefer you to use).
4. **eBGP over iBGP**, then lowest internal cost to the next hop (**hot-potato routing**: hand the packet to the other network at the nearest exit and let them carry it), then oldest route, then lowest router ID.

Within an AS, routes learned from external peers (eBGP) are redistributed to every border router over internal sessions (iBGP), which must be a full mesh or use route reflectors, because iBGP does not re-advertise routes learned from another iBGP peer (there is no `AS_PATH` growth inside an AS to prevent loops). iBGP neighbours are typically several hops apart, reached via the interior link-state protocol; BGP depends on OSPF or IS-IS underneath it.

### Convergence and failure at internet scale

BGP is slow on purpose. A route withdrawal ripples through ASes as each one re-evaluates and re-advertises; path exploration (routers briefly choosing successively longer alternates as each is withdrawn) can take minutes. The minimum route advertisement interval (about 30 s between updates for the same prefix to an eBGP peer by default, though often lowered) rate-limits the churn. During a large failure, the global table sees bursts of hundreds of thousands of updates.

The famous failures are not bugs in the algorithm but consequences of trust:

- **Route leaks**: an AS re-advertises routes it learned from one provider to another provider, in violation of the valley-free rule (customer routes go to everyone; provider and peer routes go only to customers). Traffic between two large networks suddenly transits a small ISP whose links melt.
- **Hijacks**: an AS announces a prefix it does not own. Because longest-prefix match wins in every FIB, announcing a more-specific `/24` of someone's `/22` attracts all their traffic globally within minutes. The 2008 incident where a national ISP announced a more-specific of YouTube's prefix, intended to block it locally, took the site offline for much of the world for a couple of hours.
- **RPKI** (Resource Public Key Infrastructure) is the deployed fix for origin hijacks: prefix holders publish signed Route Origin Authorisations stating which AS may originate a prefix, and validating routers drop announcements that fail. It does not authenticate the path, only the origin; path validation (BGPsec, ASPA) is still being deployed. Ask a senior network engineer about it and they will tell you the honest status: partial coverage, growing.

## Anycast: routing as a load balancer

Because BGP will happily accept the same prefix from many origins, a service can announce one IP from twenty data centres and let the decision process deliver each client to the "closest" one by policy and `AS_PATH`. That is **anycast**, and it is how public DNS resolvers and CDN edges pick a location without any client-side logic. It is stateless per packet, so long-lived TCP connections can break if a route change moves a client mid-flow; DNS over UDP does not care, which is why anycast and DNS were made for each other. See [IP addressing and routing](/learn/networking/fundamentals/ip-addressing-and-routing) for where anycast sits in the addressing story, and [Load balancing](/learn/networking/application-protocols/load-balancing) for the global load-balancing layer that sits on top of it.

## The three algorithms as one table

| Property | Link-state (OSPF) | Distance-vector (RIP) | Path-vector (BGP) |
|---|---|---|---|
| Information per router | Full graph | Neighbours' distance vectors | Neighbours' paths and attributes |
| Loop prevention | Consistent SPF on identical database | None inherent; split horizon, hop cap | Own AS in `AS_PATH` |
| Bad-news convergence | Detection + flooding + SPF, ~100s of ms | Count to infinity, minutes | Path exploration, minutes |
| Metric | Additive link cost | Hop count | Policy ladder, then AS count |
| Scale limit | Database size and SPF CPU per area | 15 hops | Global table size (~1M IPv4 prefixes) and update churn |
| Trust model | One administrator | One administrator | Adversarial; RPKI patches origin |

## Senior signals

- You can explain a routing failure by naming the family: "that's a link-state domain, so if it took 5 minutes to reroute the problem is detection or a hold-down timer, not the algorithm" versus "that's BGP, so 3 minutes of path exploration is normal".
- You know that BGP does not pick short paths, that `LOCAL_PREF` beats `AS_PATH`, and that "hot-potato" is why asymmetric routing (different paths in each direction) is the norm on the internet and why traceroute from your side tells you nothing about the return path.
- You reach for ECMP's flow hashing when someone asks why one link in a bundle is saturated while the others idle, and you know the same hashing argument applies to load balancers and shards.
- You can reproduce count-to-infinity on a whiteboard in under two minutes and say why split horizon does not save a three-node loop.
- You know that anycast is BGP being used as a global load balancer, and that it is safe for UDP and best-effort for TCP.
- When designing a control plane of your own (service discovery, a mesh, a cache invalidation fan-out), you ask "is this link-state or distance-vector?" because the answer determines whether stale second-hand information can loop.

## Check yourself

```quiz
- q: >-
    In an OSPF area, a link fails. Which of the following most directly determines how long until every router forwards around it?
  options: ["The number of ASes in the AS_PATH", "The hello dead interval plus the SPF hold-down timer", "The 30-second periodic update interval", "The count-to-infinity bound of 16"]
  answer: 1
  explanation: >-
    Link-state convergence is detection time (hellos or BFD) plus flooding plus the deliberate SPF delay; the algorithm itself is not the bottleneck. The 30 s update and the 16 cap belong to RIP, and AS_PATH belongs to BGP.
- q: >-
    Why does adding the full AS path to a route advertisement eliminate count-to-infinity?
  options: ["It makes the metric additive so Bellman-Ford converges", "A router can see that a route already passes through itself and discard it, so stale routes cannot be re-learned", "It forces all routers to run Dijkstra on the same map", "It reduces the update interval"]
  answer: 1
  explanation: >-
    Count-to-infinity happens because a distance vector has no provenance, so R3 cannot tell that R2's route to N goes through R3. The AS_PATH is exactly that provenance; seeing your own AS in it proves the loop.
- q: >-
    Two routes to the same prefix arrive at a BGP router. Route X has AS_PATH length 2 and LOCAL_PREF 100 (learned from a transit provider). Route Y has AS_PATH length 5 and LOCAL_PREF 200 (learned from a paying customer). Which is installed?
  options: ["X, because a shorter AS_PATH means lower latency", "Y, because LOCAL_PREF is compared before AS_PATH length", "Whichever arrived first", "Both, using ECMP"]
  answer: 1
  explanation: >-
    LOCAL_PREF is the first rung of the decision ladder and encodes business policy (customer routes earn money). AS_PATH length only breaks ties among equal LOCAL_PREF, and it never measured latency anyway. BGP multipath across different AS paths is not the default.
- q: >-
    A four-link ECMP bundle between two data centres shows one link at 95% and the others at 20%. The most likely cause is:
  options: ["Dijkstra chose the wrong shortest path", "A few very large flows hashed onto the same link, because ECMP balances flows, not bytes", "The RIP hop limit was reached", "The LSA sequence numbers wrapped"]
  answer: 1
  explanation: >-
    ECMP keys each flow to one link by hashing the 5-tuple so packets do not reorder. Load is balanced only in expectation over many similar flows; a handful of elephant flows can pile onto one link. The fix is more, smaller flows or flowlet-aware hashing, not a routing change.
- q: >-
    A network announces a /24 that sits inside another organisation's /22 and traffic for that /24 is pulled worldwide within minutes. Which mechanism is responsible for the speed and reach, and what stops it?
  options: ["OSPF flooding; split horizon", "Longest-prefix match in every FIB plus BGP propagation; RPKI origin validation dropping unauthorised announcements", "Count-to-infinity; poison reverse", "Anycast; MED"]
  answer: 1
  explanation: >-
    A more-specific prefix wins longest-prefix match everywhere it is accepted, and BGP propagates it globally. RPKI lets routers check whether the originating AS is authorised for the prefix and discard the hijack; it does not validate the path, so route leaks need other controls.
```
