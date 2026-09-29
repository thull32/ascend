---
slug: routing-algorithms
title: "Routing algorithms: link-state, distance-vector and path-vector"
description: How OSPF floods a map and runs Dijkstra, why distance-vector counts to infinity even with split horizon, how OSPF areas and BGP's attributes and decision process work, all traced on one five-router topology, plus what breaks in production.
minutes: 40
difficulty: medium
tags: [routing, ospf, bgp, dijkstra, bellman-ford, distance-vector, link-state]
problems: []
---
A packet leaving your laptop for a server on another continent crosses somewhere between ten and twenty routers, none of which has a complete picture of the internet, and none of which agreed on anything with the others in advance. Each one looks at the destination address, consults a table, and forwards. The whole question of routing is: how do those tables get filled in so that a sequence of independent local decisions adds up to a path that arrives, and keeps arriving when a link goes down at 3 a.m.?

There are three answers in production, and you already know the algorithms behind two of them. Link-state routing (OSPF, IS-IS) floods a map of the network to every router and has each one run Dijkstra. Distance-vector routing (RIP, and EIGRP with repairs) is Bellman-Ford executed by gossip between neighbours. Path-vector routing (BGP) is distance-vector with the whole path attached, so that policy can override distance. Which one is in play tells you how fast a failure heals, what the failure looks like, and why "shortest" is not what the internet optimises. All three run below on the same five routers, so you can compare the traces line by line.

## The forwarding table is the output, not the algorithm

Every router keeps a **forwarding information base** (FIB): a longest-prefix-match table from destination prefix to next hop and outgoing interface. The data plane consults only this table, per packet, in hardware or in the kernel. Everything in this lesson is the control plane that computes it. On this machine (Linux 6.18 under WSL2) the kernel answers the forwarding question directly:

```text
$ ip route get 1.1.1.1
1.1.1.1 via 192.168.34.1 dev eth1 src 192.168.34.197 uid 1000
```

A router's table looks the same with more rows:

```text
Destination        Next hop        Interface   Metric
10.0.0.0/8         10.1.1.2        eth0        20
10.2.0.0/16        10.1.1.6        eth1        10
203.0.113.0/24     192.0.2.1       eth2        30
0.0.0.0/0          192.0.2.1       eth2        -
```

A packet for 10.2.3.4 matches both `10.0.0.0/8` and `10.2.0.0/16`; the longer prefix wins, whatever the metrics say. The protocols differ in *what information they exchange* and *who does the computation*, and that single distinction explains almost every property below (the comparison table near the end collects them).

## One topology for every algorithm

Five routers with link costs. OSPF's default cost is `reference_bandwidth / link_bandwidth`. Many platforms still default the reference to 100 Mbit/s, which makes every link of 100 Mbit/s or faster cost 1, so operators raise it; with a 100 Gbit/s reference a 100 Gbit/s link costs 1 and a 20 Gbit/s link costs 5, which is the kind of cost used below.

```text
        A ---1--- B ---5--- D ---3--- E
         \        |        /
          4       2       1
           \      |      /
            `---- C ----'
```

The right answers, which every algorithm below must reproduce: from A, the cheapest path to E is `A → B → C → D → E` at cost 1 + 2 + 1 + 3 = 7, even though `A → B → D → E` has one hop fewer (cost 9). The direct A–C link (cost 4) is not on any of A's shortest paths, because `A → B → C` costs 3.

## Link-state: flood the map, run Dijkstra

Every link-state router does three things:

1. **Discover neighbours** with hello packets on each interface. OSPF defaults are a hello every 10 s and a neighbour declared dead after 40 s without one on broadcast links; Bidirectional Forwarding Detection (BFD) cuts detection to about 150 ms with three missed 50 ms probes.
2. **Flood a link-state advertisement** (LSA) describing its own links and costs to every router in the area. Each LSA carries a sequence number; a router that receives a newer LSA installs it, acknowledges it, and re-floods it on every interface except the one it arrived on. A duplicate is acknowledged and dropped; for an older copy, the router sends its newer one back.
3. **Run Dijkstra** from itself over the resulting **link-state database** (LSDB), which is identical on every router, and install the first hop of each shortest path in the FIB.

### SPF from A, traced

OSPF's implementation keeps a *tentative* list and a *confirmed* list, which is Dijkstra with the heap written as a list. The "via" column is the first hop out of A, which is all the FIB needs.

| Step | Confirm | Relaxations | Tentative after |
|---|---|---|---|
| 1 | A (0) | B = 1 via B, C = 4 via C | B 1, C 4 |
| 2 | B (1) | C = 1 + 2 = 3 < 4, now via B; D = 1 + 5 = 6 via B | C 3, D 6 |
| 3 | C (3) | D = 3 + 1 = 4 < 6, via B | D 4 |
| 4 | D (4) | E = 4 + 3 = 7 via B | E 7 |
| 5 | E (7) | none | empty |

A's FIB sends everything via B. The two improvements at steps 2 and 3 are the fewest-hops-is-not-cheapest effect twice over. Because every router runs the same algorithm on the same database, the trees agree: when A forwards a packet for E to B, B's own tree also sends it towards C. That consistency is what makes forwarding loop-free once everyone has converged. The walk-through of the algorithm itself, including the stale-entry check, is in [Dijkstra](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra).

```viz
{"type": "graph", "algorithm": "dijkstra", "directed": false, "start": "A", "goal": "E",
 "title": "OSPF SPF calculation from A",
 "nodes": [{"id":"A","x":5,"y":50},{"id":"B","x":35,"y":20},{"id":"C","x":35,"y":80},{"id":"D","x":65,"y":50},{"id":"E","x":95,"y":50}],
 "edges": [{"from":"A","to":"B","w":1},{"from":"A","to":"C","w":4},{"from":"B","to":"C","w":2},{"from":"B","to":"D","w":5},{"from":"C","to":"D","w":1},{"from":"D","to":"E","w":3}]}
```

### A failure, flooded

Now the D–E link fails. D notices (loss of signal, or BFD), and originates a new router-LSA listing only D–B and D–C, with its sequence number one higher than before (OSPF starts at `0x80000001`). Assume one millisecond per hop:

| Time | Event | LSA transmissions |
|---|---|---|
| 0 ms | D floods to B and C | D→B, D→C |
| 1 ms | B installs it (newer), floods to A and C; C installs it, floods to A and B | B→A, B→C, C→A, C→B |
| 2 ms | A installs B's copy, floods to C; C and B receive each other's copy: same sequence, acknowledged and dropped | A→C |
| 3 ms | C receives A's copy: duplicate, dropped | none |

Seven transmissions, every router updated in two hops. A flood crosses each link at most once in each direction, so it costs at most 2 × links messages whatever the topology. Each router then reruns SPF. E's own LSA still lists the E–D link, but OSPF only uses a link that *both* ends advertise (the two-way check), so D's LSA alone removes it and E becomes unreachable everywhere. Bad news took the same few milliseconds as good news. Keep that in mind for the distance-vector trace of the same failure.

```viz
{"type": "network", "scenario": "link-state", "title": "LSA flooding and per-router SPF"}
```

### Where the convergence time goes

Convergence is detection, plus flooding, plus a deliberate SPF delay, plus FIB programming. The algorithm is the cheap part: on this machine a pure-Python heap Dijkstra takes 0.05 ms on a 100-router, 400-link graph and 0.7 ms on 1,000 routers and 4,000 links (measured, averaged over 20 runs). What costs time is the 40 s dead interval when a failure does not raise loss of signal, the SPF throttle (an initial delay that batches a burst of LSAs, 0 ms in FRRouting and 200 ms in Junos by default, then a hold time that backs off to 5 s in both while a link keeps flapping), and writing thousands of changed prefixes into hardware.

### OSPF areas: link-state inside, distance-vector between

Storing the whole graph and rerunning SPF on every change does not scale to thousands of routers, so OSPF splits a domain into **areas** around a backbone, area 0. An **area border router** (ABR) sits in area 0 and one or more other areas and re-advertises each area's prefixes into the others as summaries, without the topology.

| LSA type | Name | Originated by | Flooded through | Carries |
|---|---|---|---|---|
| 1 | Router | Every router | Its own area | Its links and their costs |
| 2 | Network | Designated router on a shared segment | Its own area | The routers attached to the segment |
| 3 | Summary | ABR | Other areas | A prefix and a cost, no topology |
| 4 | ASBR summary | ABR | Other areas | How far away an AS boundary router is |
| 5 | AS-external | AS boundary router | Every non-stub area | Routes redistributed from outside (static, BGP) |
| 7 | NSSA external | AS boundary router in an NSSA | That NSSA; the ABR converts it to type 5 | External routes in a "not-so-stubby" area |

A type-3 summary is a distance vector: "prefix P, cost 30, via me". Distance vectors can loop, so OSPF imposes a topology rule instead of an algorithm: all inter-area traffic crosses area 0, and an ABR ignores summaries it hears from a non-backbone area. A hub-and-spoke graph of areas has no cycles to count around. The price is optimality: the backbone sees a cost per prefix, not the path, so an inter-area route can be worse than the true shortest path. Stub areas go further and replace all external routes with a single default route. On a shared Ethernet segment, a **designated router** keeps the number of adjacencies at 2n − 3 instead of n(n − 1)/2: every router peers only with the DR and its backup.

### Equal-cost multipath

If two paths tie, Dijkstra picks one arbitrarily. Real routers install *all* of them (ECMP) and hash each flow's 5-tuple (source and destination address, protocol, ports) onto one next hop. Hashing by flow, not by packet, keeps a TCP connection on one path so its segments do not reorder. It has the failure mode of every hash-based balancer in [Consistent hashing and routing](/learn/networking/network-algorithms/consistent-hashing-and-routing): one elephant flow cannot be split, and a few large flows can land on the same link.

## Distance-vector: Bellman-Ford by gossip

A distance-vector router knows nothing about the topology. It knows the cost of its own links, and periodically (every 30 s in RIP) it sends each neighbour its vector: "my best distance to every destination I know". On receipt it relaxes:

$$
d(x, y) = \min_{v \in N(x)} \big( c(x, v) + d(v, y) \big)
$$

That is the relaxation step of [Bellman-Ford](/learn/algorithms/graph-algorithms/bellman-ford-and-floyd-warshall), except that the rounds are asynchronous and no router ever assembles the graph. The traces below use synchronous rounds (everyone sends, then everyone recomputes from what they received) and follow one destination, E. Ties go to the neighbour with the lower name.

### Converging from cold

| Round | A | B | C | D |
|---|---|---|---|---|
| 0 | ∞ | ∞ | ∞ | ∞ |
| 1 | ∞ | ∞ | ∞ | 3 via E |
| 2 | ∞ | 8 via D | 4 via D | 3 via E |
| 3 | 8 via C | 6 via C | 4 via D | 3 via E |
| 4 | **7 via B** | 6 via C | 4 via D | 3 via E |

Round 5 changes nothing, so the network has converged with the same distances Dijkstra computed. Two things to notice. Good news travels one hop per round: A is four hops from E and learns about it in round 3. And A's first answer was wrong: in round 3 it knew only C's 4 and B's old 8, so it chose C at 8; B's improvement to 6 reached A one round later. Bellman-Ford's bound of `V − 1` rounds is the worst case for this spreading.

```viz
{"type": "graph", "algorithm": "bellman-ford", "directed": false, "start": "E",
 "title": "Bellman-Ford relaxation towards E",
 "nodes": [{"id":"A","x":5,"y":50},{"id":"B","x":35,"y":20},{"id":"C","x":35,"y":80},{"id":"D","x":65,"y":50},{"id":"E","x":95,"y":50}],
 "edges": [{"from":"A","to":"B","w":1},{"from":"A","to":"C","w":4},{"from":"B","to":"C","w":2},{"from":"B","to":"D","w":5},{"from":"C","to":"D","w":1},{"from":"D","to":"E","w":3}]}
```

```viz
{"type": "network", "scenario": "distance-vector", "title": "Neighbours exchanging distance vectors"}
```

### Count to infinity, traced

Now fail D–E, the same failure the link-state flood handled in two milliseconds. E is unreachable, so every distance should become ∞ (RIP's infinity is 16). But the vectors carry no path, and D cannot tell that C's advertised 4 is a route *through D*:

| Round | A | B | C | D | What happened |
|---|---|---|---|---|---|
| before | 7 via B | 6 via C | 4 via D | 3 via E | converged |
| 1 | 7 | 6 | 4 | **5 via C** | D lost E, took C's stale 4: loop D ⇄ C |
| 2 | 7 | 6 | 6 via D | 5 | C hears D's 5 |
| 3 | 7 | **8 via A** | 6 | 7 | B hears C's 6 and ties with A's 7 + 1 |
| 4 | 9 | 8 | 8 | 7 | every metric climbs by 2 per two rounds |
| … | … | … | … | … | … |
| 11 | 15 | 16 | 14 | 15 | B reaches infinity |
| 13 | 16 | 16 | 16 | 16 | converged: E unreachable |

Thirteen rounds. With RIP's 30 s periodic updates that is six and a half minutes during which packets for E circulate until their TTL expires, and it is why RIP caps a network at 15 hops: infinity must be small for the count to end.

### Split horizon, poison reverse, and the loop they miss

**Split horizon**: never advertise a route back to the neighbour you use as its next hop. **Poison reverse**: advertise it to that neighbour with metric ∞, which overwrites stale state at once instead of waiting for it to time out (in synchronous rounds the two make identical decisions). Run the same failure with split horizon:

| Round | A | B | C | D | What happened |
|---|---|---|---|---|---|
| 1 | 7 via B | 6 via C | 4 via D | **11 via B** | C no longer tells D about E, but B (via C) still does: D ⇄ B ⇄ C ⇄ D |
| 2 | 7 | 6 | **11 via A** | 11 | C's own route died; A, whose route is via B, still advertises 7 to C |
| 3 | 7 | 13 via C | 11 | 11 | loop C → A → B → C |
| 4 | 14 | 13 | 11 | 12 via C | |
| 5 | 14 | 13 | 16 | 12 | C's only offer is A's 14, and 14 + 4 reaches infinity |
| 6 | 14 | 16 | 16 | 16 | |
| 7 | 16 | 16 | 16 | 16 | converged |

Seven rounds instead of thirteen, and still a loop. Split horizon only stops a router from echoing a route to the neighbour it came from, which kills two-router loops. The loop above runs through three routers, and each one's advertisement is legitimate from where it stands. The fixes add information: a **hold-down** timer (ignore any new route to a destination for a while after it goes unreachable; 180 s by default in Cisco's RIP), triggered updates (send on change instead of waiting 30 s), or EIGRP's **DUAL**, which accepts a new next hop only if that neighbour's own distance is strictly less than the router's previous best (the *feasibility condition*, which guarantees the neighbour's path does not run back through you) and otherwise queries its neighbours before using it. Any system that forwards second-hand claims without provenance, gossip and cache invalidation included, can turn one stale fact into a persistent loop.

## Path-vector: BGP and the primacy of policy

The IPv4 internet held roughly 78,000 **autonomous systems** (ASes) at the start of 2026, each a network under one administration: an ISP, a cloud, a university, Netflix's AS2906. Inside an AS, OSPF or IS-IS computes shortest paths. Between ASes nobody will flood their topology to a competitor, there is no common metric, and the goal is not "shortest": an ISP wants traffic to go where it earns money or where a contract says it must. BGP keeps distance-vector's structure and fixes its loop problem with one change: each advertisement carries the **list of ASes it has passed through**, and an AS that sees its own number in an incoming `AS_PATH` discards the route. There is no count-to-infinity because the path itself proves where the route has been.

```viz
{"type": "network", "scenario": "bgp-path", "title": "AS_PATH growing as a route propagates between ASes"}
```

### Path attributes

| Attribute | Kind | Set by | Meaning |
|---|---|---|---|
| `NEXT_HOP` | Well-known, mandatory | Advertising eBGP router | The address to forward to; the route is ignored if it is unreachable |
| `AS_PATH` | Well-known, mandatory | Each AS prepends its number on export | Loop prevention; its length is the only distance-like metric |
| `ORIGIN` | Well-known, mandatory | Originating AS | IGP < EGP < incomplete (redistributed) |
| `LOCAL_PREF` | Well-known, discretionary | Your routers, on import | Preference inside your AS, highest wins; never sent to other ASes |
| `MED` | Optional, non-transitive | The neighbouring AS | Which of their entry links they prefer you to use, lowest wins |
| `COMMUNITY` | Optional, transitive | Anyone | Tags that drive policy: `NO_EXPORT`, provider-defined blackhole or prepend communities |
| Weight | Cisco, router-local | Your router | Highest wins; never advertised |

### The decision process, worked

Router R1 in AS 64500 holds four routes to `203.0.113.0/24`. Every next hop is reachable.

| Route | Learned from | `LOCAL_PREF` | `AS_PATH` | `ORIGIN` | `MED` | Session | IGP cost to next hop |
|---|---|---|---|---|---|---|---|
| r1 | Transit provider, AS 64510 | 100 | 64510 64520 | IGP | 0 | eBGP | 0 |
| r2 | Peer, AS 64530 | 150 | 64530 64531 64520 | IGP | 0 | eBGP | 0 |
| r3 | Peer AS 64530, via border router R2 | 150 | 64530 64520 | IGP | 20 | iBGP | 12 |
| r4 | Peer AS 64530, second link | 150 | 64530 64520 | IGP | 10 | eBGP | 0 |

Walk the ladder, stopping as soon as one route is left:

1. **Highest weight**: not configured, all equal.
2. **Highest `LOCAL_PREF`**: r1 has 100 because the operator marks transit routes lower (a common convention is customer 200, peer 150, transit 100: prefer routes that earn money over free ones over paid ones). r1 is out, although its `AS_PATH` is the shortest of the four.
3. **Locally originated**: none.
4. **Shortest `AS_PATH`**: r2 has three ASes, r3 and r4 have two. r2 is out.
5. **Lowest `ORIGIN`**: both IGP.
6. **Lowest `MED`**, compared only between routes from the same neighbouring AS (unless `always-compare-med` is set): r3 and r4 both come from AS 64530, and r4's 10 beats r3's 20. **r4 wins.**
7. Not reached: eBGP over iBGP, then lowest IGP cost to the next hop (**hot-potato routing**: hand the packet to the other network at the nearest exit), then the oldest eBGP route, lowest router ID and lowest neighbour address.

Change r3's `MED` to 5 and r3 wins at step 6, carrying traffic 12 IGP units across your own network to R2, because the neighbour asked for that entry point. Remove the `MED`s and r4 wins at step 7, being eBGP. The ladder order is the policy.

### Export rules: valley-free routing

Selection decides what you use; export policy decides what you tell others. Operators follow the Gao–Rexford rules, and the internet's stability depends on it:

| Route learned from | Export to customers | Export to peers | Export to providers |
|---|---|---|---|
| A customer | Yes | Yes | Yes |
| A peer | Yes | No | No |
| A provider | Yes | No | No |

A route learned from a provider and re-exported to a peer would make you carry traffic between two networks for free, through a "valley". A **route leak** is exactly that mistake, and the more-specific or wrongly exported route then attracts traffic onto links never sized for it.

### Inside the AS, and convergence

Routes learned over eBGP are distributed to your other border routers over iBGP. iBGP does not re-advertise a route learned from another iBGP peer (there is no `AS_PATH` growth inside an AS to stop a loop), so it needs a full mesh, n(n − 1)/2 sessions (4,950 for 100 routers), or **route reflectors** that re-advertise to their clients. iBGP peers are usually several hops apart and reach each other via the interior protocol: BGP runs on top of OSPF or IS-IS.

BGP is slow on purpose. RFC 4271 suggests a minimum route advertisement interval of 30 s between updates for the same prefix to an eBGP peer (5 s for iBGP); vendors often lower it. A withdrawal triggers **path exploration**: routers briefly select successively longer alternates, each of which is then withdrawn, and a global withdrawal can take minutes to settle.

### Hijacks, leaks and RPKI

A hijack is an AS announcing a prefix it does not own. Longest-prefix match wins in every FIB, so announcing a more-specific `/24` of someone's `/22` attracts their traffic worldwide within minutes. In 2008 an ISP announced a more-specific of YouTube's prefix to block it domestically, the announcement leaked upstream, and the site was unreachable for much of the world for about two hours. **RPKI** is the deployed defence: prefix holders publish signed Route Origin Authorisations saying which AS may originate a prefix and up to what length, and validating routers drop announcements that fail. It checks the origin only, not the path. Path validation is at an early stage: BGPsec (RFC 8205) is standardised but rarely deployed, and ASPA was still an IETF draft in 2026.

## Anycast: routing as a load balancer

Because BGP accepts the same prefix from many origins, a service can announce one address from twenty sites and let the decision process deliver each client to the "closest" one by policy and `AS_PATH`. That is **anycast**: how public DNS resolvers and CDN edges choose a location with no client logic. It is stateless per packet, so a route change can move a long-lived TCP connection to a site that has never heard of it; DNS over UDP does not care, which is why anycast and DNS suit each other. See [IP addressing and routing](/learn/networking/fundamentals/ip-addressing-and-routing) for where anycast sits in addressing, and [Load balancing](/learn/networking/application-protocols/load-balancing) for the global layer on top of it.

## Under the hood: from daemon to forwarding hardware

On a Linux router, routing daemons such as FRRouting (`ospfd`, `bgpd`) or BIRD run the protocols in user space and keep a **RIB**: every candidate route from every protocol. The best route per prefix, chosen first by administrative distance between protocols and then by metric, is sent over netlink to the kernel, which stores IPv4 routes in a level-compressed trie (`fib_trie`) and answers `ip route get` from it. Hardware routers do the same last step into TCAM or algorithmic longest-prefix-match memory on the line card, and that memory has a size.

The wire formats are small and old:

| Protocol | Transport | Timers (defaults) | Notable detail |
|---|---|---|---|
| RIP v2 | UDP 520 | Update 30 s, route timeout 180 s, garbage collection 120 s | Metric 1–15, 16 = infinity, 25 routes per message |
| OSPF v2 | IP protocol 89, multicast 224.0.0.5 and .6 | Hello 10 s, dead 40 s, retransmit 5 s, LSA refresh 30 min, MaxAge 1 h | 20-byte LSA header: age, options, type, link-state ID, advertising router, sequence number, a 16-bit Fletcher checksum, length |
| BGP-4 | TCP 179 | Hold time 90 s suggested by RFC 4271, 180 s common; keepalive a third of it | UPDATE messages carry withdrawals, attributes and prefixes; BFD for fast failure detection |

The Fletcher checksum on every LSA is the kind of check covered in [Error detection](/learn/networking/network-algorithms/error-detection): a corrupted LSA installed in every router's database would give everyone the same wrong map.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Slow detection | A fibre cut black-holes traffic for about 40 s in an OSPF network that "converges in milliseconds" | The link failed behind a media converter or switch, so no loss of signal reached the router; the neighbour died only when the 40 s dead interval expired | BFD on every routed link (for example 3 × 50 ms), or lower hello and dead timers |
| Microloops | Bursts of loss and TTL-exceeded messages for tens to hundreds of milliseconds after every topology change | Routers install their new FIBs at different moments; one uses the new path through a neighbour still using the old one back | Loop-free alternates or TI-LFA (precomputed backup next hops), ordered FIB updates |
| Adjacency stuck in EXSTART or EXCHANGE | Two OSPF neighbours never reach FULL; the routes behind them are missing | Interface MTU mismatch: the larger side's database description packets are dropped by the smaller side | Match the MTUs (ignoring MTU in OSPF is a stopgap that hides the real mismatch) |
| Route leak or hijack | Traffic to a prefix suddenly crosses an unexpected AS, with added latency and loss | Public BGP collectors and looking glasses show an unexpected origin or a more-specific prefix | RPKI origin validation, customer prefix filters, max-prefix limits on sessions, announcing your own more-specifics during the incident |
| FIB exhaustion | Routers log hardware table exhaustion and some prefixes become unreachable or fall back to slow software forwarding | Route count exceeds the TCAM partition: in August 2014 the global IPv4 table passed 512,000 routes, the default IPv4 allocation on Cisco's widely deployed Catalyst 6500 and 7600 (Sup720) | Re-partition the hardware table, filter or aggregate, carry a default route instead of the full table |

## The three algorithms as one table

| Property | Link-state (OSPF) | Distance-vector (RIP) | Path-vector (BGP) |
|---|---|---|---|
| Information per router | Full graph of the area | Neighbours' distance vectors | Neighbours' paths and attributes |
| Loop prevention | Consistent SPF on an identical database | None inherent; split horizon, hold-down, hop cap | Own AS in `AS_PATH` |
| Bad-news convergence | Detection + flooding + SPF, tens to hundreds of ms when tuned | Count to infinity, minutes | Path exploration, tens of seconds to minutes |
| Metric | Additive link cost | Hop count | Policy ladder, then AS count |
| Scale limit | LSDB size and SPF per area | 15 hops | Global table (about 1.05 million IPv4 prefixes at the start of 2026) and update churn |
| Trust model | One administrator | One administrator | Adversarial; RPKI covers origin |

## Interviewer follow-ups

**"Every link-state router runs Dijkstra on the same database. Can packets still loop?"** Model answer: yes, transiently. During convergence routers hold different database versions or have programmed their FIBs at different moments, so two routers can point at each other for tens of milliseconds; loop-free alternates and ordered FIB updates exist for this. Common wrong answer: "no, SPF is consistent so loops are impossible", which is true only after convergence.

**"Why does BGP not use link-state?"** Model answer: ASes will not disclose their internal topology, there is no common metric to add up, and routing must follow contracts rather than distance; path-vector lets each AS export only the routes its policy allows while still detecting loops. Common wrong answer: "Dijkstra is too slow for the internet", when SPF over a million nodes takes seconds and the real obstacles are trust and policy.

**"Split horizon fixes count to infinity, right?"** Model answer: it fixes two-router loops only; the trace above loops through three routers with split horizon on. Hold-down timers, EIGRP's feasibility condition, or carrying the path (BGP) are what stop longer loops. Common wrong answer: "yes, with poison reverse it is solved."

**"A fibre cut took 40 seconds to reroute. Where did the time go?"** Model answer: detection. SPF on a thousand-router area takes around a millisecond and flooding a few more; a 40 s gap is the default dead interval, so the failure was not signalled at layer 1. Enable BFD. Common wrong answer: "SPF is slow, split the area", which changes nothing measurable.

**"Our traffic to a partner goes through one transit provider and their replies come back through another. Is that a misconfiguration?"** Model answer: no, asymmetric paths are normal. Each AS picks its outbound path independently by `LOCAL_PREF` and hot-potato exit, so the two directions are separate decisions; traceroute from one end shows only the forward path. Common wrong answer: "routing should be symmetric; ask them to fix it."

## What mid-level engineers get wrong

- **Equating hops with distance.** On the lesson's topology the fewest-hop path to E costs 9 and the cheapest costs 7; OSPF follows cost.
- **Assuming BGP picks the shortest or fastest path.** `LOCAL_PREF` overrides `AS_PATH`, and `AS_PATH` counts ASes, not milliseconds or hops.
- **Believing split horizon prevents all loops**, then being surprised by a three-router loop that counts to 16.
- **Reading traceroute as the path of your packets.** ECMP sends probes and flows on different paths, return paths differ, and routers deprioritise replies to probes.
- **Putting long-lived TCP on anycast without a plan** for connections that move when a BGP route changes.

## Exercise: count to infinity

```exercise
id: distance-vector-after-failure
title: Distance-vector rounds after a link failure
prompt: |
  Simulate synchronous distance-vector routing towards one destination and
  return what happens after a link fails.

  - Routers are `0..n-1`; `edges` is a list of undirected `[u, v, cost]`.
    Every distance is towards router `dest`, which always has distance 0.
  - One round: every router `x != dest` computes, from the PREVIOUS round's
    state, `min(cost(x, y) + adv(y, x))` over its current neighbours `y`,
    checked in increasing id order and replaced only on a strictly smaller
    value (so ties go to the smaller id). Cap the result at `infinity`.
    That `y` becomes `x`'s next hop (none if the result is `infinity`).
  - `adv(y, x)` is `y`'s previous distance, except that when
    `split_horizon` is true and `y`'s previous next hop is `x`, `y`
    advertises nothing to `x`, which counts as `infinity`.
  - Phase 1: start with every distance `infinity` except `dest` = 0, and
    run rounds on the full graph until a round changes neither any distance
    nor any next hop.
  - Phase 2: remove the edge `failed` = `[u, v]` and keep running rounds
    from the phase 1 state until a round changes neither any distance nor
    any next hop.

  Return the distance lists produced by the phase 2 rounds that changed
  something, in order (an empty list if the failure changes nothing).
languages: [python, javascript]
entry: dv_after_failure
starter:
  python: |
    def dv_after_failure(n, edges, dest, failed, split_horizon, infinity):
        # Build adjacency, write one synchronous round, run phase 1 then phase 2.
        return []
  javascript: |
    function dv_after_failure(n, edges, dest, failed, split_horizon, infinity) {
      // Build adjacency, write one synchronous round, run phase 1 then phase 2.
      return [];
    }
tests:
  - args: [5, [[0,1,1],[0,2,4],[1,2,2],[1,3,5],[2,3,1],[3,4,3]], 4, [3,4], true, 16]
    expected: [[7,6,4,11,0],[7,6,11,11,0],[7,13,11,11,0],[14,13,11,12,0],[14,13,16,12,0],[14,16,16,16,0],[16,16,16,16,0]]
    label: the lesson's split-horizon trace (A..E are 0..4)
  - args: [3, [[0,1,1],[1,2,1]], 2, [1,2], true, 16]
    expected: [[2,16,0],[16,16,0]]
    label: split horizon stops a two-router loop
  - args: [3, [[0,1,1],[1,2,1]], 2, [1,2], false, 16]
    expected: [[2,3,0],[4,3,0],[4,5,0],[6,5,0],[6,7,0],[8,7,0],[8,9,0],[10,9,0],[10,11,0],[12,11,0],[12,13,0],[14,13,0],[14,15,0],[16,15,0],[16,16,0]]
    label: without it, the pair counts to 16
  - args: [5, [[0,1,1],[0,2,4],[1,2,2],[1,3,5],[2,3,1],[3,4,3]], 4, [0,2], false, 16]
    expected: []
    label: failing a link no shortest path uses changes nothing
  - args: [5, [[0,1,1],[0,2,4],[1,2,2],[1,3,5],[2,3,1],[3,4,3]], 4, [3,4], false, 16]
    expected: [[7,6,4,5,0],[7,6,6,5,0],[7,8,6,7,0],[9,8,8,7,0],[9,10,8,9,0],[11,10,10,9,0],[11,12,10,11,0],[13,12,12,11,0],[13,14,12,13,0],[15,14,14,13,0],[15,16,14,15,0],[16,16,16,15,0],[16,16,16,16,0]]
    hidden: true
    label: the lesson's count-to-infinity trace
  - args: [5, [[0,1,1],[0,2,4],[1,2,2],[1,3,5],[2,3,1],[3,4,3]], 4, [2,3], false, 16]
    expected: [[7,6,8,3,0],[7,8,8,3,0],[9,8,10,3,0],[9,8,10,3,0]]
    hidden: true
    label: a round that changes only a next hop still counts
  - args: [4, [[0,1,1],[1,2,1],[2,3,1],[0,2,1]], 3, [2,3], true, 6]
    expected: [[2,2,6,0],[3,3,6,0],[6,6,4,0],[6,5,6,0],[6,6,6,0]]
    hidden: true
    label: a three-router loop despite split horizon, infinity 6
hints:
  - "Compute each round into fresh arrays from the previous round's distances and next hops; updating in place makes the rounds asynchronous and changes the answer."
  - "The same round function runs both phases; only the edge list changes."
  - "Compare both the distance list and the next-hop list to decide whether a round changed anything."
```

## Senior signals

- You name the family before debugging a routing incident: "that's a link-state domain, so five minutes to reroute means detection or a hold-down timer, not the algorithm" versus "that's BGP, so three minutes of path exploration is normal".
- You know OSPF is link-state inside an area and distance-vector between areas, and that the area-0 hub rule is what keeps summaries from looping.
- You can run the BGP decision process on a set of routes, say why `LOCAL_PREF` beats `AS_PATH`, and know `MED` is compared only between routes from the same neighbouring AS.
- You explain asymmetric routing from hot-potato exits and independent policies, and you ask for traceroute from both ends.
- You reach for ECMP's flow hashing when one link in a bundle is saturated, and you know anycast is BGP used as a global load balancer: safe for UDP, best-effort for long TCP.
- When designing your own control plane (service discovery, mesh configuration, cache invalidation), you ask whether it is link-state or distance-vector, because the answer decides whether stale second-hand information can loop.

## Check yourself

```quiz
- q: >-
    In an OSPF area, a link fails. Which of the following most directly determines how long until every router forwards around it?
  options: ["The number of ASes in the route's AS_PATH", "Failure detection plus the SPF hold-down delay", "The 30-second periodic distance-vector update", "The RIP-style count-to-infinity bound of 16"]
  answer: 1
  explanation: >-
    Link-state convergence is detection time (hellos or BFD), plus flooding, plus the deliberate SPF delay, plus FIB programming; the Dijkstra run itself takes around a millisecond for a thousand routers. The 30 s update and the 16 cap belong to RIP, and AS_PATH belongs to BGP.
- q: >-
    Why does adding the full AS path to a route advertisement eliminate count-to-infinity?
  options: ["It forces every router to run Dijkstra on one shared map", "A router drops routes whose path already contains it", "It shortens the interval between routing updates", "It makes the metric additive, so Bellman-Ford converges"]
  answer: 1
  explanation: >-
    Count-to-infinity happens because a distance vector has no provenance, so D cannot tell that C's route to E goes through D. The AS_PATH is exactly that provenance: a router that sees its own AS in it knows the route loops through itself and discards it, so a stale route cannot be re-learned. Nobody runs Dijkstra on a shared map in BGP.
- q: >-
    Two routes to the same prefix reach a BGP router. Route X has AS_PATH length 2 and LOCAL_PREF 100 (from a transit provider). Route Y has AS_PATH length 5 and LOCAL_PREF 200 (from a paying customer). Which is installed?
  options: ["Both, load-shared across them with ECMP", "X, because a shorter AS_PATH means lower latency", "Whichever of the two routes arrived first", "Y, because LOCAL_PREF is compared before AS_PATH"]
  answer: 3
  explanation: >-
    LOCAL_PREF is the first rung of the ladder that operators normally set, and it encodes business policy: customer routes earn money. AS_PATH length only breaks ties among equal LOCAL_PREF, and it never measured latency. Multipath across different AS paths is not the default.
- q: >-
    In the lesson's topology, split horizon is on and the D–E link fails. D immediately installs a route to E at cost 11 via B. Why did split horizon not prevent this?
  options: ["Split horizon applies only to periodic updates, not triggers", "Split horizon needs poison reverse to take effect at all", "D ignores split horizon for routes with a cost below 16", "B's route runs through C, not D, so B may advertise it"]
  answer: 3
  explanation: >-
    Split horizon only stops a router advertising a route back to its own next hop. B reaches E via C, so from B's point of view advertising to D is legitimate, even though C's path runs through D. The loop D, B, C is three routers long, which split horizon cannot see; hold-down timers, a feasibility condition or path information are needed.
- q: >-
    A network announces a /24 that sits inside another organisation's /22 and traffic for that /24 is pulled worldwide within minutes. Which mechanism is responsible for the speed and reach, and what stops it?
  options: ["OSPF flooding spreads it; split horizon stops it", "Count-to-infinity spreads it; poison reverse stops it", "Longest-prefix match spreads it; RPKI stops it", "Anycast spreads it; the MED attribute stops it"]
  answer: 2
  explanation: >-
    A more-specific prefix wins longest-prefix match in every FIB that accepts it, and BGP propagates it globally within minutes. RPKI origin validation lets routers check whether the originating AS is authorised for that prefix and length and drop the announcement; it does not validate the path, so route leaks need other controls.
- q: >-
    Why does OSPF require all inter-area traffic to cross area 0?
  options: ["Only area 0 can carry routes learned from BGP neighbours", "Area 0 routers are the only ones that are able to run SPF", "Summaries carry only a cost, and a hub topology cannot loop", "It keeps each area's link-state database identical to area 0"]
  answer: 2
  explanation: >-
    Inside an area OSPF is link-state, but an ABR re-advertises other areas' prefixes as type-3 summaries: a prefix and a cost, which is a distance vector and could loop like one. Forcing every inter-area path through the backbone makes the graph of areas a star, which has no cycles. Every router runs SPF, external routes can enter any non-stub area, and databases differ by area by design.
```
