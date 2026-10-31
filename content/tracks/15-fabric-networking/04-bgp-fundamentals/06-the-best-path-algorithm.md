---
slug: the-best-path-algorithm
title: "The BGP best-path algorithm: which route wins, and why"
description: How a BGP router picks one path out of several for the same prefix, step by step from weight and LOCAL_PREF through AS_PATH, ORIGIN, MED, eBGP over iBGP and IGP cost to multipath and the final tie-breakers, worked on three competing routes at the Meridian edge, with MED's comparison traps, hot-potato routing and what "best" means in production.
minutes: 50
difficulty: medium
tags: [fabric-networking, bgp, best-path, local-pref, med, as-path, hot-potato, multipath, interview]
problems: [bgp-best-path]
---
A border router often hears about the same destination from several neighbours, each announcement a different way out of the network with its own list of networks to cross. It can install only one as the route it forwards on and the route it tells its peers about. It has no latency measurements, no link loads, no view of anyone else's topology, and every router in the network must choose by the same rules for the result to make sense.

BGP's answer is a fixed ladder of comparisons: the first one that tells two paths apart decides, and nothing below it is consulted. The order of the ladder *is* the policy. The operator's preference outranks the path's length, which outranks the neighbour's hints, which outrank the cost inside your own network, which outranks arbitrary tie-breakers. It is one of the most common BGP interview questions, and the strong answer explains why each rung sits where it does.

This lesson walks the ladder on one router, `gw1.ams`, holding three paths to one prefix. It builds on [updates, attributes and RIBs](/learn/fabric-networking/bgp-fundamentals/updates-attributes-and-ribs) and [iBGP, loops and next hops](/learn/fabric-networking/bgp-fundamentals/ibgp-loops-and-next-hops), with a one-line reminder for each attribute; the networking track's [routing algorithms](/learn/networking/network-algorithms/routing-algorithms) has a shorter version.

## What "best" means to a router

A **prefix** is a block of addresses, such as `192.0.2.0/24`. A **path** is one announcement of that prefix from one peer with its **path attributes**: the AS_PATH (the autonomous systems it crossed), the NEXT_HOP (the address to forward to), and the rest. An **autonomous system** (AS) is one organisation's network under one routing policy; **eBGP** runs between routers in different ASes, **iBGP** between routers inside one. A router holds up to one path per peer per prefix (unless ADD-PATH, step 10, is in use).

The **best-path algorithm** (RFC 4271's "decision process") runs per prefix, per router, over the paths that survived import policy in the Adj-RIB-In (the per-peer table of what each neighbour sent). Its winner goes into the Loc-RIB (the router's chosen table), and three things follow:

1. **It goes into the FIB** (forwarding information base, what the hardware forwards on), unless another protocol's route to the same prefix beats it.
2. **It is the only path the router advertises.** A router that heard three paths tells its peers about one.
3. **It is recomputed whenever an input changes**: an UPDATE, a withdrawal, a policy change, or a change in the interior cost to a next hop.

"Best" therefore means *most preferred under this router's policy and position*, not fastest, least loaded or cheapest. BGP knows none of those unless an operator encodes them in an attribute.

## The ladder at a glance

Each step keeps the paths that score best on one attribute and stops as soon as one is left. This is Cisco's documented order, which Arista EOS and FRRouting follow closely; the numbering matches the visualisations. The standard parts come from RFC 4271's decision process: step 1 (section 9.1.2.1), LOCAL_PREF (9.1.1), and steps 5 to 9, router ID and peer address (9.1.2.2), with RFC 4456 adding the route-reflection details of steps 12 and 13. Oldest path is an optional rule RFC 5004 recommends; weight, locally originated and multipath are vendor additions. Some implementations insert further steps that apply only where enabled, such as AIGP (RFC 7311, an IGP cost accumulated across several ASes run by one operator).

| # | Step | Prefer | Set by | Seen by |
|---|---|---|---|---|
| 1 | Usable: next hop resolvable, no AS loop | usable | the routing table | this router |
| 2 | Weight | highest | local configuration | this router only |
| 3 | LOCAL_PREF | highest | your import policy | every router in your AS |
| 4 | Locally originated | local | this router's own config | this router |
| 5 | AS_PATH length | shortest | every AS on the way | everyone downstream |
| 6 | ORIGIN | IGP < EGP < INCOMPLETE | the originating AS | everyone downstream |
| 7 | MED | lowest, same neighbour AS only | the neighbouring AS | your AS only |
| 8 | eBGP over iBGP | eBGP | how the path was learned | this router |
| 9 | IGP cost to next hop | lowest | your IGP | this router |
| 10 | Multipath | install several | configuration | this router's FIB |
| 11 | Oldest eBGP path | oldest | history | this router |
| 12 | Router ID | lowest | the peer's OPEN | this router |
| 13 | CLUSTER_LIST length, then peer address | shortest, lowest | reflectors, addressing | this router |

One principle orders it: **local and deliberate beats global and accidental.** Steps 2 to 4 are what you decided, steps 5 to 7 what the path's journey and the neighbour say, steps 8 and 9 your own network's geometry, and steps 11 to 13 exist only to guarantee exactly one answer.

## Three routes to one prefix

The example sits at Meridian's internet edge. To the internet Meridian is AS 64500 (separate from the overlay's AS 65000), announcing `203.0.113.0/24`. Gateways `gw1.ams` (loopback `10.255.1.201`) and `gw2.ams` (`10.255.1.202`) connect to ISP1 (AS 64501) and ISP2 (AS 64502); `gw1.sin` (`10.255.2.201`) also buys from ISP2. The gateways are fully meshed in iBGP. A content network, AS 64511, originates `192.0.2.0/24`; ISP2 peers with it directly, ISP1 reaches it through a transit provider, AS 64496. The addresses and AS numbers come from ranges reserved for documentation (RFC 5737 and RFC 5398).

| Path | Learned | NEXT_HOP | AS_PATH | LOCAL_PREF | ORIGIN | MED | IGP cost to next hop |
|---|---|---|---|---|---|---|---|
| A | eBGP from ISP1 | 198.51.100.2 (ISP1's side of the link) | 64501 64496 64511 | 100 | IGP | 10 | 0 (directly connected) |
| B | iBGP from `gw2.ams` (ISP2 in Amsterdam) | 10.255.1.202 | 64502 64511 | 100 | IGP | 0 | 20 |
| C | iBGP from `gw1.sin` (ISP2 in Singapore) | 10.255.2.201 | 64502 64511 | 100 | IGP | 0 | 120 |

B and C carry the advertising gateway's loopback as next hop because the gateways set next-hop-self on iBGP. The costs are IS-IS metrics ([IS-IS from zero](/learn/fabric-networking/underlay/is-is-from-zero)): `gw1.ams` reaches `gw2.ams` over two fabric links of metric 10 through `spine1.ams`, and `gw1.sin` over the first of those, the long-haul circuit `spine1.ams`–`spine1.sin` at 100, and one more fabric link: 120. The BGP table (illustrative output in FRRouting's style, where `metric` means MED):

```text
gw1.ams# show bgp ipv4 unicast 192.0.2.0/24            (illustrative)
BGP routing table entry for 192.0.2.0/24
Paths: (3 available, best #2)
  64501 64496 64511
    198.51.100.2 from 198.51.100.2 (198.51.100.2)
      Origin IGP, metric 10, localpref 100, valid, external
  64502 64511
    10.255.1.202 (metric 20) from 10.255.1.202 (10.255.1.202)
      Origin IGP, metric 0, localpref 100, valid, internal, best (IGP Metric)
  64502 64511
    10.255.2.201 (metric 120) from 10.255.2.201 (10.255.2.201)
      Origin IGP, metric 0, localpref 100, valid, internal
```

The answer is B; `best (IGP Metric)` names the deciding step. The sections after the walk take one rung at a time.

```viz
{"type": "fabric", "scenario": "bgp-best-path", "title": "gw1.ams's three paths to 192.0.2.0/24, eliminated step by step: B wins on IGP cost", "caption": "All three paths are usable and tie on weight, LOCAL_PREF and locally originated. A falls at AS_PATH length, three ASes against two. B and C tie on ORIGIN, on MED (both 0 from AS 64502) and on eBGP over iBGP. B wins at IGP cost, 20 against C's 120 across the long-haul circuit; steps 10 to 13 are not reached. gw1.ams forwards via spine1.ams to gw2.ams and out through ISP2, while gw2.ams and gw1.sin each keep their own ISP2 path."}
```

## Step 1: is the path usable at all?

A path is a candidate only if its NEXT_HOP **resolves**: the routing table has a route to it, from the IGP or a connected network. An unresolvable path stays in the BGP table marked inaccessible and takes no part. A path containing your own AS number was already discarded on arrival, eBGP's loop prevention ([what BGP is for](/learn/fabric-networking/bgp-fundamentals/what-bgp-is-for)), and policy can exclude others, such as RPKI-invalid ones ([leaks, hijacks and RPKI](/learn/fabric-networking/bgp-in-the-real-world/leaks-hijacks-and-rpki)).

**On `gw1.ams`:** A's next hop is on a connected /31, B's and C's are IS-IS /32 loopbacks. All three are candidates.

**Solves:** BGP never chooses a path it cannot forward on. **Breaks:** a loopback missing from the IGP silently disqualifies every path through that router. **Signal:** paths marked inaccessible, and a count of unresolved next hops.

## Step 2: weight, a vendor extension that never leaves the router

**Weight** (0 to 65,535, highest wins) exists only inside one router. It is not a path attribute and never travels in an UPDATE. Cisco invented it; Arista EOS and FRRouting implement it; Junos has none, its nearest equivalent being a per-route "preference" (lower wins) that policy can set. On Cisco, routes a router originates get weight 32,768 and learned ones 0. It sits above LOCAL_PREF on purpose: it is the "on this one box, whatever the AS says" override.

**On `gw1.ams`:** Meridian sets no weight; all three are 0.

**Solves:** a per-router override that changes nothing anyone else sees. **Breaks:** one router disagrees with the AS and no UPDATE explains why; a weight left from an incident steers traffic for months. **Signal:** any best path decided at weight, which in a network that does not use it deliberately should be zero.

## Step 3: LOCAL_PREF, the operator's choice of exit

**LOCAL_PREF** (4 bytes, highest wins) is set by import policy as a path enters your AS. iBGP carries it to every router inside; eBGP never carries it. The default is 100 on every major implementation. It is the first standard step because it is the AS's own decision about its way out, which should outrank anything a stranger wrote into the path.

It usually encodes business relationships: a common convention is customer routes 200, peers 150, transit 100. Traffic goes first where the network is paid, then where it is free, last where it pays ([how the internet is glued together](/learn/fabric-networking/bgp-in-the-real-world/how-the-internet-is-glued-together)). It is also the answer to "prefer ISP1 outbound, fail over to ISP2" ([traffic engineering with BGP](/learn/fabric-networking/bgp-in-the-real-world/traffic-engineering-with-bgp)).

**On `gw1.ams`:** all three are 100; nothing changes.

Now let Meridian decide ISP1 is the cheaper contract and set LOCAL_PREF 200 on everything learned from it. `gw1.ams` re-applies import policy to its stored copy of ISP1's routes (or sends ROUTE-REFRESH, a message asking ISP1 to resend them), and A wins at step 3 despite its longer AS_PATH. A is now an eBGP-learned best path, so `gw1.ams` advertises it over iBGP with LOCAL_PREF 200, and the other gateways switch too.

```viz
{"type": "fabric", "scenario": "bgp-best-path", "variant": "local-pref", "title": "LOCAL_PREF 200 on ISP1's routes: A wins at step 3 and the whole AS moves to ISP1", "caption": "Meridian's import policy on gw1.ams's ISP1 session sets LOCAL_PREF 200. A passes the validity and weight steps with B and C, then wins outright at LOCAL_PREF despite its longer AS_PATH, so steps 4 to 13 are never consulted. gw1.ams installs A and advertises it over iBGP; gw2.ams and gw1.sin pick it at step 3 too and withdraw B and C, leaving gw1.ams with a single path."}
```

The last frame shows the cost: `gw2.ams` and `gw1.sin` withdraw their ISP2 paths, which are no longer their best, and `gw1.ams` holds one path. If ISP1 fails, the others must re-select and re-advertise their ISP2 paths before `gw1.ams` has an alternative: a round of UPDATEs, not a pre-installed backup.

**Solves:** one deliberate, AS-wide choice of exit. **Breaks:** a session missing its policy (new circuit, template change) falls back to 100 and quietly moves egress; LOCAL_PREF set on an outbound policy does nothing, since eBGP strips it. **Signal:** egress share per provider against intent, and each session's LOCAL_PREF diffed against the source of truth.

## Step 4: locally originated

A path the router injects itself (a `network` statement, a redistributed static or connected route, or an **aggregate**, one summary covering several more-specifics) beats one learned from a peer; Cisco also prefers the first two over aggregates. BGP displays usually show these with next hop `0.0.0.0` (a redistributed static keeps the static's next hop). The originator of a prefix should not prefer someone else's copy of it, which may be a reflection of its own announcement.

**On `gw1.ams`:** all three were learned from peers; nothing changes.

**Solves:** the originator keeps its own route. **Breaks:** a static redistributed "temporarily" during an incident beats every learned path and is advertised to the whole AS. **Signal:** locally originated prefixes on edge routers that are not in the intended announcement list.

## Step 5: AS_PATH length, fewest networks, not fewest miles

Shorter AS_PATH wins. An AS_SET (an unordered set that aggregation can produce) counts as one; confederation segments (sub-ASes of one organisation) count as zero. It is BGP's only distance-like measure, and a crude one: it counts organisations, not hops, kilometres or milliseconds, and one AS can span continents. Operators also inflate it on purpose by **prepending** their own AS number so others avoid a path ([traffic engineering with BGP](/learn/fabric-networking/bgp-in-the-real-world/traffic-engineering-with-bgp)).

**On `gw1.ams`:** B and C cross two ASes, A crosses three. **A is out**, although it is the only path `gw1.ams` learned directly; step 8, which favours it, is never reached for it.

**Solves:** with no shared metric between organisations, "fewer networks in the way" is a default every AS can compute. **Breaks:** it ignores geography; the shortest AS path can cross an ocean twice. **Signal:** round-trip time per exit for the same destinations.

## Step 6: ORIGIN, a fossil that still breaks ties

**ORIGIN** says how the originating AS put the prefix into BGP: IGP (0, shown `i`, a network statement), EGP (1, `e`, from BGP's long-dead predecessor) or INCOMPLETE (2, `?`, redistributed). Lower wins; the value is set once and carried unchanged.

**On `gw1.ams`:** B and C both say IGP; both stay.

**Solves:** in principle, deliberate announcements over redistributed leaks; in practice, a tie-breaker. **Breaks:** two routers originating one prefix, one by network statement and one by redistribution, make the internet prefer one for no operational reason. **Signal:** inconsistent origin codes across your own announcements.

## Step 7: MED and its comparison rules

**MED**, the MULTI_EXIT_DISC (4 bytes, lowest wins), is how a *neighbouring* AS connected to you in several places says which of its entry points it would rather you used. It is optional and non-transitive: you may pass a received MED to your iBGP peers, never to another AS. Honouring it means carrying traffic further on your own network to the entry the neighbour asked for: **cold-potato routing** on your side, so the neighbour carries it less far on theirs. Three rules make it the most misunderstood step.

### Rule 1: compared only between paths from the same neighbouring AS

The **neighbouring AS** is the first AS in the AS_PATH. ISP1's MED ranks ISP1's routers; comparing it with ISP2's compares two unrelated numbering schemes. An `always-compare-med` option compares across all paths, sensible only when every neighbour sets MED by one rule.

**On `gw1.ams`:** A's MED of 10 would never have met B's and C's 0, being from AS 64501. B and C, both from AS 64502, tie at 0.

### Rule 2: a missing MED counts as 0, the best value

RFC 4271 treats a path without MED as having the lowest possible value, 0, so a neighbour that forgets MED on one session beats its own careful MEDs elsewhere. Several implementations offer "missing as worst" (the top of the 32-bit range, about 4.29 billion) instead; know which your network runs before debugging MED.

### Rule 3: without care, the answer depends on arrival order

Because MED applies only within a group, the comparison is not transitive, and implementations traditionally compare each new path with the current best, two at a time. Take three iBGP paths to `192.0.2.0/24` on a router in AS 64500, identical up to step 6:

| Path | Neighbouring AS | MED | IGP cost |
|---|---|---|---|
| P1 | 64501 | 100 | 10 |
| P2 | 64502 | 50 | 20 |
| P3 | 64501 | 20 | 30 |

Arrival order P1, P2, P3: P1 meets P2, different neighbours, so MED is skipped and P1 wins on IGP cost; P1 meets P3, same neighbour, P3 wins on MED. Best: P3. Order P2, P3, P1: P2 beats P3 on IGP cost, then P1 beats P2 on IGP cost. Best: P1. **Deterministic MED** removes the dependence: pick the best of each neighbour group first (ISP1 gives P3, ISP2 gives P2), then compare the winners (P2 beats P3 on IGP cost). Answer: P2, whatever the order.

```python
from itertools import permutations


def better(a, b):
    """Pairwise comparison of two iBGP paths with equal LOCAL_PREF, AS_PATH length and ORIGIN."""
    if a["as_path"][0] == b["as_path"][0] and a["med"] != b["med"]:
        return a if a["med"] < b["med"] else b      # MED only between the same neighbouring AS
    if a["igp_cost"] != b["igp_cost"]:
        return a if a["igp_cost"] < b["igp_cost"] else b
    return a if a["router_id"] < b["router_id"] else b


def arrival_order(paths):
    best = paths[0]
    for p in paths[1:]:                              # each new path meets the current best
        best = better(best, p)
    return best["id"]


def grouped(paths):
    """Deterministic MED: best of each neighbouring AS first, then compare the group winners."""
    groups = {}
    for p in paths:
        groups.setdefault(p["as_path"][0], []).append(p)
    winners = [min(g, key=lambda p: (p["med"], p["igp_cost"], p["router_id"])) for g in groups.values()]
    return arrival_order(winners)


P1 = {"id": "P1", "as_path": [64501, 64511], "med": 100, "igp_cost": 10, "router_id": 1}
P2 = {"id": "P2", "as_path": [64502, 64511], "med": 50, "igp_cost": 20, "router_id": 2}
P3 = {"id": "P3", "as_path": [64501, 64511], "med": 20, "igp_cost": 30, "router_id": 3}

for order in permutations([P1, P2, P3]):
    names = " ".join(p["id"] for p in order)
    print(f"arrival {names}: best {arrival_order(list(order))}, grouped {grouped(list(order))}")
```

```text
arrival P1 P2 P3: best P3, grouped P2
arrival P1 P3 P2: best P2, grouped P2
arrival P2 P1 P3: best P3, grouped P2
arrival P2 P3 P1: best P1, grouped P2
arrival P3 P1 P2: best P2, grouped P2
arrival P3 P2 P1: best P1, grouped P2
```

On one router this is a puzzle; behind route reflectors it can be an outage. A **route reflector** relays iBGP paths so clients need not all peer with each other, and relays only its own best ([route reflectors](/learn/fabric-networking/bgp-fundamentals/route-reflectors)). When two reflectors' choices change the paths the other sees, there may be no stable state at all: RFC 3345 documents this persistent MED oscillation. Deterministic MED fixes the order dependence on each router but does not by itself stop the oscillation, whose cause is that each reflector sees only some of the paths. RFC 7964's remedies are ADD-PATH so reflectors advertise more than their best, always-compare-med where neighbours' MEDs are comparable, and IGP costs that keep a cluster's own exits cheaper than other clusters' exits.

**Solves:** a neighbour can ask for traffic at a specific interconnect. **Breaks:** accidental cross-neighbour comparison, missing-MED surprises, order dependence, oscillation. **Signal:** best-path changes decided at MED, repeating for one prefix with no session change.

## Step 8: eBGP over iBGP

A path learned directly from another AS beats one learned inside your own: an eBGP path leaves right here, an iBGP path first crosses your network to another border router. It also stabilises the edge, since each border router prefers its own exit rather than two picking each other's. (Paths from inside a confederation count as internal.)

**On `gw1.ams`:** B and C are both iBGP; a tie. A would have won here, had it survived step 5.

**Solves:** keeps traffic off your backbone when an exit is local. **Breaks:** rarely by itself, but it surprises people by sitting *below* AS_PATH and MED, so a router ignores its own link when a peer's path is shorter. **Signal:** the deciding step for edge prefixes; many at step 8 means the edge behaves as designed.

## Step 9: IGP cost to the next hop, or hot-potato routing

Among paths still equal, prefer the next hop that is cheapest to reach in the interior routing protocol (0 for a directly connected eBGP neighbour). This is **hot-potato routing**: hand traffic to the other network at the nearest exit so it spends as little time as possible on your links.

**On `gw1.ams`:** B's next hop is 20 away, C's 120 across the long-haul circuit. **C is out; B is best.** That matters: Amsterdam to Singapore is about 10,500 km of fibre, and at about 5 µs per km, C would add about 52 ms each way inside Meridian.

Hot potato ties BGP to the IGP. Raise `gw2.ams`'s link metrics to 1,000 to drain it, and B's cost becomes 1,010: `gw1.ams` re-runs the decision, picks C, and Amsterdam's traffic to `192.0.2.0/24` leaves through Singapore, over 100 ms more round trip with no BGP session touched. Measurement work on a large ISP (Teixeira and colleagues, 2004) found routine IGP changes behind a noticeable share of its BGP best-path changes. Routers learn of such changes through **next-hop tracking**: BGP registers each next hop with the routing table manager and re-runs the decision only for prefixes whose next-hop cost changed. [Operating BGP safely](/learn/fabric-networking/bgp-in-the-real-world/operating-bgp-safely) has the maintenance order that avoids the surprise.

**Solves:** minimal use of your network when exits are equivalent. **Breaks:** IGP changes move exits silently; a route reflector decides from *its* IGP position and hands that one answer to every client. BGP optimal route reflection (RFC 9107) computes from the client's position instead. **Signal:** best-path changes decided at IGP cost, correlated with IS-IS events.

## Step 10: multipath, when one winner is not enough for forwarding

If paths still tie after step 9 and **multipath** is configured (a "maximum paths" setting, separate for eBGP and iBGP), the router installs several as an ECMP group: equal-cost multipath, spreading flows over next hops by hashing headers ([ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)). The paths must match on every earlier step, and by default most implementations also require identical AS_PATH *contents*; a "multipath relax" option loosens that to equal length, needed when paths come from different neighbouring ASes.

Multipath changes forwarding, not the decision: the router still names one best path and advertises only that. A peer cannot load-balance on paths it never heard. **ADD-PATH** (RFC 7911) fixes that by tagging each path with an identifier so several can share one session.

In the eBGP underlay variant ([BGP as the underlay](/learn/fabric-networking/underlay/bgp-as-the-underlay)), `leaf1.ams` (AS 65101) hears `leaf2.ams`'s loopback from both spines (AS 65100) with the identical AS_PATH 65100 65102. Without multipath one spine would sit idle.

**Solves:** uses parallel paths BGP cannot otherwise tell apart. **Breaks:** a path differing on a hidden attribute drops out of the group, halving capacity with every session up. **Signal:** FIB next hops per prefix against what the topology implies.

## Steps 11 to 13: oldest path, router ID, CLUSTER_LIST and peer address

These steps exist so there is always exactly one answer.

- **Step 11, oldest eBGP path.** When all remaining paths are external, keep the one received first. RFC 5004 recommends it, because switching between equally good external paths only because a newer one has a lower router ID is churn for nothing. The price is history dependence: reboot the router or reset one session, and the other path becomes the older one. A "compare router ID" option skips the step.
- **Step 12, lowest router ID**, the BGP Identifier from the peer's OPEN ([BGP sessions and the FSM](/learn/fabric-networking/bgp-fundamentals/bgp-sessions-and-the-fsm)), compared as a 32-bit number. For a reflected path the ORIGINATOR_ID, the router ID of whoever first injected it into the AS, is used instead of the reflector's.
- **Step 13, shortest CLUSTER_LIST** (the reflection clusters a path crossed, RFC 4456), **then lowest peer address**, which separates two sessions to the same router.

**On `gw1.ams`:** not reached.

**Solves:** determinism. **Breaks:** outcomes that depend on history or on numbering nobody chose for traffic reasons. **Signal:** decisions at steps 11 to 13 between exits that matter; two ISPs tied down to router ID means nobody has expressed a preference.

## The whole walk, traced and in code

| Step | A (ISP1, eBGP) | B (gw2.ams, iBGP) | C (gw1.sin, iBGP) | Result |
|---|---|---|---|---|
| 1 Usable | yes | yes | yes | all candidates |
| 2 Weight | 0 | 0 | 0 | tie |
| 3 LOCAL_PREF | 100 | 100 | 100 | tie |
| 4 Locally originated | no | no | no | tie |
| 5 AS_PATH length | 3 | 2 | 2 | **A out** |
| 6 ORIGIN | | IGP | IGP | tie |
| 7 MED (both from AS 64502) | | 0 | 0 | tie |
| 8 eBGP over iBGP | | iBGP | iBGP | tie |
| 9 IGP cost | | 20 | 120 | **C out, B best** |
| 10 to 13 | | | | not reached |

The comparator walks the ladder set-wise, as the table reads, printing what each step removes and returning the best path, the deciding step and the multipath set. It runs the default walk, the LOCAL_PREF change and the underlay case that oldest path decides, then prints the one-line explanation a platform should produce when a best path changes.

```python
import ipaddress

ORIGIN_RANK = {"IGP": 0, "EGP": 1, "INCOMPLETE": 2}


def ip(a):
    return int(ipaddress.IPv4Address(a))


def keep(best_of, key):
    """A step keeps every path that scores best on one key (max or min)."""
    def step(paths):
        target = best_of(key(p) for p in paths)
        return [p for p in paths if key(p) == target]
    return step


def lowest_med(paths, always_compare=False):
    """Lowest MED, compared only within a group of paths from the same neighbouring AS."""
    groups = {}
    for p in paths:
        group = "any" if always_compare else (p["as_path"][:1] or ["own AS"])[0]
        groups.setdefault(group, []).append(p)
    kept = []
    for group in groups.values():
        low = min(p.get("med") or 0 for p in group)  # a missing MED counts as 0 (RFC 4271)
        kept += [p for p in group if (p.get("med") or 0) == low]
    return kept


def oldest_ebgp(paths):
    if all(p["ebgp"] for p in paths):               # only when every remaining path is external
        return keep(min, lambda p: p.get("learned_at", 0))(paths)
    return paths


LADDER = [
    ("weight", keep(max, lambda p: p.get("weight", 0))),
    ("LOCAL_PREF", keep(max, lambda p: p.get("local_pref", 100))),
    ("locally originated", keep(max, lambda p: p.get("local", False))),
    ("AS_PATH length", keep(min, lambda p: len(p["as_path"]))),
    ("ORIGIN", keep(min, lambda p: ORIGIN_RANK[p["origin"]])),
    ("MED", lowest_med),
    ("eBGP over iBGP", keep(max, lambda p: p["ebgp"])),
    ("IGP cost", keep(min, lambda p: p["igp_cost"])),
    ("oldest eBGP path", oldest_ebgp),
    ("router ID", keep(min, lambda p: ip(p["router_id"]))),
    ("CLUSTER_LIST length", keep(min, lambda p: p.get("cluster_len", 0))),
    ("peer address", keep(min, lambda p: ip(p["peer"]))),
]


def decide(paths, maximum_paths=1, trace=False):
    """Walk the ladder; return (best, deciding step, paths installed for forwarding)."""
    alive = [p for p in paths if p["nh_ok"]]          # step 1: an unresolvable next hop is not a candidate
    decided, multipath = "only usable path", []
    for name, step in LADDER:
        if len(alive) == 1:
            break
        kept = step(alive)
        if trace:
            out = [p["id"] for p in alive if p not in kept]
            print(f"  {name:<20} {'out: ' + ', '.join(out) if out else 'tie'}")
        alive, decided = kept, name
        if name == "IGP cost" and maximum_paths > 1:  # step 10: equal so far, so usable together
            multipath = alive[:maximum_paths]
    best = alive[0]
    same_path = [p for p in multipath if p["as_path"] == best["as_path"]]  # no "multipath-relax"
    return best, decided, same_path or [best]


def explain_change(router, prefix, before, after):
    """One line for the platform: what moved, and the step that moved it."""
    (old, _, _), (new, step, _) = decide(before), decide(after)
    if old["id"] == new["id"]:
        return f"{router} {prefix}: still {new['id']}, decided at {step}"
    return f"{router} {prefix}: best {old['id']} -> {new['id']}, decided at {step}"


# gw1.ams's three paths to 192.0.2.0/24 (AS 64511)
A = {"id": "A", "peer": "198.51.100.2", "router_id": "198.51.100.2", "ebgp": True,
     "as_path": [64501, 64496, 64511], "origin": "IGP", "med": 10, "igp_cost": 0, "nh_ok": True}
B = {"id": "B", "peer": "10.255.1.202", "router_id": "10.255.1.202", "ebgp": False,
     "as_path": [64502, 64511], "origin": "IGP", "med": 0, "igp_cost": 20, "nh_ok": True}
C = {"id": "C", "peer": "10.255.2.201", "router_id": "10.255.2.201", "ebgp": False,
     "as_path": [64502, 64511], "origin": "IGP", "med": 0, "igp_cost": 120, "nh_ok": True}

print("gw1.ams, default policy:")
best, step, _ = decide([A, B, C], trace=True)
print(f"  best {best['id']} at {step}\n")

A_lp = dict(A, local_pref=200)                         # import policy on the ISP1 session
print("gw1.ams, LOCAL_PREF 200 on ISP1's routes:")
best, step, _ = decide([A_lp, B, C], trace=True)
print(f"  best {best['id']} at {step}\n")

# eBGP underlay variant: leaf1.ams (AS 65101) hears leaf2.ams's loopback from both spines (AS 65100)
S1 = {"id": "via spine1", "peer": "10.254.1.0", "router_id": "10.255.1.1", "ebgp": True,
      "as_path": [65100, 65102], "origin": "IGP", "igp_cost": 0, "nh_ok": True, "learned_at": 50}
S2 = dict(S1, id="via spine2", peer="10.254.1.2", router_id="10.255.1.2", learned_at=20)
print("leaf1.ams, 10.255.1.12/32, maximum-paths 4:")
best, step, ecmp = decide([S1, S2], maximum_paths=4, trace=True)
print(f"  best {best['id']} at {step}; installed: {[p['id'] for p in ecmp]}\n")

print(explain_change("gw1.ams", "192.0.2.0/24", [A, B, C], [A_lp, B, C]))
print(explain_change("gw1.ams", "192.0.2.0/24", [A, B, C], [A, dict(B, nh_ok=False), C]))
```

```text
gw1.ams, default policy:
  weight               tie
  LOCAL_PREF           tie
  locally originated   tie
  AS_PATH length       out: A
  ORIGIN               tie
  MED                  tie
  eBGP over iBGP       tie
  IGP cost             out: C
  best B at IGP cost

gw1.ams, LOCAL_PREF 200 on ISP1's routes:
  weight               tie
  LOCAL_PREF           out: B, C
  best A at LOCAL_PREF

leaf1.ams, 10.255.1.12/32, maximum-paths 4:
  weight               tie
  LOCAL_PREF           tie
  locally originated   tie
  AS_PATH length       tie
  ORIGIN               tie
  MED                  tie
  eBGP over iBGP       tie
  IGP cost             tie
  oldest eBGP path     out: via spine1
  best via spine2 at oldest eBGP path; installed: ['via spine1', 'via spine2']

gw1.ams 192.0.2.0/24: best B -> A, decided at LOCAL_PREF
gw1.ams 192.0.2.0/24: best B -> C, decided at AS_PATH length
```

`lowest_med` groups by `as_path[0]` and treats a missing MED as 0; `oldest_ebgp` applies only when every remaining path is external; `decide` takes the multipath set after IGP cost but keeps walking to name one best. The last line is the edge case to remember: when `gw2.ams`'s loopback stops resolving, `gw1.ams` moves to C, the Singapore exit, *not* to A on its own ISP1 link, because AS_PATH length outranks both eBGP over iBGP and hot potato. "Nearest working exit" would need a LOCAL_PREF policy that says so.

## What "best" means operationally

**Best is per router.** `gw2.ams` holds B over eBGP and C over iBGP, ties to step 8, and keeps B; `gw1.sin` keeps C the same way. The three gateways use two different exits for one prefix, correctly. It becomes a problem only when routers *between* them decide independently: a transit router that prefers a different exit from the router that sent it the packet can send it back, a loop. Fabrics avoid that by tunnelling across routers that do not run BGP ([the BGP black hole](/learn/fabric-networking/bgp-fundamentals/the-bgp-black-hole)).

**Best is the only path others hear about.** `gw1.ams`'s best came from an iBGP peer, and iBGP does not relay iBGP-learned paths, so `gw2.ams` and `gw1.sin` do not know A exists. If ISP2 lost the prefix everywhere, they would wait for `gw1.ams` to re-select and advertise A: milliseconds on a quiet router, seconds during a million-prefix churn. ADD-PATH and "best external" (advertise the best eBGP path even while preferring an iBGP one) give peers a backup in advance, and BGP PIC (prefix-independent convergence) pre-installs it in the FIB, so failover is a pointer swap ([convergence and scale](/learn/fabric-networking/bgp-in-the-real-world/convergence-and-scale)).

**Best is not necessarily installed.** The routing table manager compares BGP's winner with other protocols' routes by **administrative distance**, a per-protocol trust ranking where lower wins (Cisco: eBGP 20, IS-IS 115, iBGP 200; Junos: BGP 170). A static route to the same prefix wins, as does an IGP route against iBGP on Cisco's defaults; some platforms flag the loser as a "RIB failure". A full hardware FIB has a similar effect: the best path exists but is not programmed.

**Best is not fastest.** Nothing in the ladder measures delay, loss or load. Networks that want performance-aware egress, large content networks among them, measure outside BGP and feed the result back as LOCAL_PREF.

## Failure modes in production

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Hot-potato shift during IGP maintenance | Latency to some internet destinations jumps by about 100 ms; no BGP session changed | Best path for those prefixes moved to `gw1.sin`, decided at IGP cost, at the moment metrics were raised on `gw2.ams` | Drain BGP before the IGP ([operating BGP safely](/learn/fabric-networking/bgp-in-the-real-world/operating-bgp-safely)); pin the exit with LOCAL_PREF for the maintenance |
| MED oscillation behind route reflectors | The same prefixes change best path every few seconds, indefinitely; CPU and UPDATE counts high; brief packet loss | Changes decided at MED, alternating between two paths from different neighbour ASes; reflectors' choices feeding each other | ADD-PATH on the reflectors, with deterministic MED everywhere; always-compare-med if the neighbours' MEDs are comparable |
| LOCAL_PREF policy missing on one session | Outbound traffic shifts to a provider that should be the backup; bill rises | Paths from the new circuit carry LOCAL_PREF 100 where intent says 200 | Restore the policy from the template; diff rendered policy against intent on every change |
| Leftover weight on one router | One gateway uses a different exit from the rest of the AS; nothing in any UPDATE explains it | Best path decided at weight | Remove the override; alert on any weight in production |
| Reflector picks for its own position | Clients in one site exit through another site's gateway | Clients receive only the reflector's best path; the reflector's IGP cost differs from theirs | ADD-PATH, optimal route reflection (RFC 9107), or reflectors placed per site |
| Exit flips after a reboot | Traffic moves between two equal providers after a router restart, with no change in configuration | Decided at oldest eBGP path both before and after, with the other path now older | Express a preference with LOCAL_PREF, or compare router IDs for determinism |
| Multipath group smaller than expected | Half the uplink capacity idle; sessions all up | FIB shows one next hop; the paths differ in AS_PATH contents or MED | Make attributes consistent, or enable multipath relax where intended |

## Trade-offs: the levers that move a best path

| Lever | Step | Direction it steers | Scope | Who controls it | Risk |
|---|---|---|---|---|---|
| Weight | 2 | Outbound, one router | One router | You | Invisible inconsistency inside your AS |
| LOCAL_PREF | 3 | Outbound, whole AS | Your AS | You | Strongest standard lever; a missing policy changes egress silently |
| AS_PATH prepending | 5 | Inbound, as a hint | Everyone downstream | You ask, others decide | Overridden by any LOCAL_PREF elsewhere; long prepends look odd and are sometimes filtered |
| MED | 7 | Inbound, from one neighbour | One neighbouring AS | You ask, the neighbour decides | Ignored unless the neighbour honours it; order dependence |
| IGP metric | 9 | Outbound, among equal exits | Your AS | You | Moves BGP exits as a side effect of IGP changes |
| More-specific prefix | none (longest match wins in the FIB) | Inbound, strongly | Everyone | You | Table growth, filtering by others, hijack-shaped announcements |

You control your outbound choice firmly and can only *ask* about inbound. The strongest inbound lever, a more-specific prefix, bypasses the algorithm: BGP compares paths for the *same* prefix, while longest-prefix match in the FIB picks between *different* prefixes, so a /25 wins over the /24 whatever the ladder chose for the /24 ([the routing table](/learn/fabric-networking/from-zero/the-routing-table)). It works only where others accept it, since many networks filter announcements longer than /24.

## Under the hood: how implementations run the comparison

RFC 4271 describes the decision over the whole set; most implementations compare a new path with the incumbent, two at a time. FRRouting's `bgp_path_info_cmp()` in `bgpd/bgp_route.c` has exactly that shape and records why each comparison ended, which is why FRR prints `best (IGP Metric)` or `best (Older Path)`; Junos shows an "Inactive reason" on each losing path. Deterministic MED adds a grouping pass first; defaults differ between implementations, so check.

The decision runs only for prefixes whose inputs changed. A full-table border router holds about a million IPv4 prefixes (mid-2020s, still growing), often with a few paths each, so one session reset can re-run it a million times: the CPU spike after a flap, and why churn is measured in prefixes per second. Winners that also win on administrative distance are programmed into the FIB through the kernel or the switch's SDK ([planes, ASICs and network operating systems](/learn/fabric-networking/from-zero/planes-asics-and-network-operating-systems)).

Vendors agree on the core and differ in four places: weight, missing-MED treatment, whether oldest path applies by default, and the exact multipath rules. When two vendors disagree on a best path, look there first.

## What the platform should show

The on-call question is "why is traffic to X leaving through Singapore?", and the manager's is "does the exit match policy?". Surface:

- **The deciding step per prefix, per router**: "B, decided at IGP cost, 20 against 120", from FRR's selection reason, Junos's inactive reason, or a comparator like the one above run over Adj-RIB-In data.
- **The runner-up and the margin.** A path that won by an IGP cost of 1 moves at the next maintenance; one that won on LOCAL_PREF does not.
- **Best-path changes as events with their cause** ("B → C at AS_PATH length; B's next hop unresolvable"), correlated with IGP and session events to separate hot-potato churn from real withdrawals.
- **Exit share per provider against intent**, from flow data joined with each gateway's best paths.
- **Path diversity**: paths held per important prefix. `gw1.ams` after the LOCAL_PREF change has no pre-installed backup.
- **Anomalous deciding steps**: any decision at weight, provider choices settled by oldest path or router ID, MED decisions repeating for one prefix.
- **Policy intent diffs** per session ([network automation and source of truth](/learn/fabric-networking/operating-fabrics/network-automation-and-source-of-truth)).

The feed is the BGP Monitoring Protocol (BMP, RFC 7854), which streams each peer's Adj-RIB-In before and after policy, plus RFC 9069's Loc-RIB monitoring of the best paths themselves ([telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability)). Polling once a minute misses an oscillation with a ten-second period.

## Interviewer follow-ups

**"Walk me through BGP best-path selection."** Model answer: group, don't recite. Eligibility (next hop resolves); local policy (weight, vendor-local, then LOCAL_PREF, AS-wide, set on import); what the path says (shortest AS_PATH, lowest ORIGIN, lowest MED within one neighbouring AS); your geometry (eBGP over iBGP, lowest IGP cost: hot potato); then multipath and tie-breakers that make the answer unique. Add one consequence, such as "a router ignores its own ISP link when an iBGP path has a shorter AS_PATH". Common wrong answer: "BGP picks the shortest or lowest-latency path".

**"Two ISPs: outbound on ISP1, ISP2 as backup. How?"** Model answer: higher LOCAL_PREF on routes learned from ISP1, on import, on every gateway peering with it; iBGP spreads the value, and ISP2's paths take over only when ISP1's are withdrawn. Inbound is separate and can only be influenced: prepending towards ISP2, communities, more-specifics via ISP1. Common wrong answer: MED or prepending for outbound, or LOCAL_PREF on routes sent to the ISP.

**"Why didn't ISP1's MED of 10 lose to ISP2's MED of 0?"** Model answer: MED is compared only between paths from the same neighbouring AS, because it ranks that neighbour's own entry points; always-compare-med changes that, safely only if neighbours use one rule. The same restriction makes pairwise comparison order-dependent, hence deterministic MED. Common wrong answer: "lower MED always wins".

**"Route reflector clients all exit at the gateway nearest the reflector. Why, and what would you do?"** Model answer: the reflector decides from its own IGP position and reflects only its best, so clients never see the alternatives their own hot-potato step would pick. Fixes: ADD-PATH so clients choose, optimal route reflection, or reflectors per site. Common wrong answer: tuning the clients' IGP metrics, which changes nothing while they hold one path. Honest addition: "Which fix fits depends on reflector capacity and platform support, which I'd confirm with the network team; I'd build a per-client comparison of exit used against nearest exit available."

## What mid-level engineers get wrong

- **"BGP picks the shortest or fastest path."** It picks the most preferred under policy; AS_PATH length is step 5 and counts organisations.
- **Setting LOCAL_PREF towards a neighbour.** eBGP strips it; it steers your own egress, set on import.
- **Comparing MED across providers**, or forgetting that a missing MED counts as best.
- **Expecting multipath across two ISPs** without multipath relax: different AS_PATH contents keep them out of the group.

## Exercise: best-path comparison

```exercise
id: best-path
title: Choose the best path and name the deciding step
prompt: |
  Implement BGP's decision process for one prefix on one router, as a set-wise
  walk: at each step keep every path that scores best on that step, and stop as
  soon as one path is left. Return `[id, step]`: the winner's `id` and the name
  of the step at which exactly one path remained.

  `paths` is a non-empty list of objects. Every path has `id` (string),
  `as_path` (list of AS numbers), `origin` ("IGP", "EGP" or "INCOMPLETE"),
  `ebgp` (boolean), `igp_cost` (integer) and `router_id` (dotted IPv4 string).
  These fields may be missing, with these defaults: `weight` 0, `local_pref`
  100, `local` false, `med` missing (a missing or null MED counts as 0).

  Steps, in order, with the name to return:
  1. "weight": highest weight
  2. "local_pref": highest local_pref
  3. "locally_originated": prefer `local` true
  4. "as_path": shortest as_path
  5. "origin": lowest, with IGP < EGP < INCOMPLETE
  6. "med": lowest MED, compared only among paths with the same neighbouring
     AS (the first element of as_path; use 0 for an empty as_path). Within each
     group keep the paths with the group's lowest MED; paths in different
     groups do not eliminate each other. If `always_compare_med` is true,
     all paths form a single group.
  7. "ebgp": prefer ebgp true
  8. "igp_cost": lowest igp_cost
  9. "router_id": lowest router ID compared as a 32-bit number, not as text
     (router IDs in the input are unique)

  If `paths` has exactly one path, return `[its id, "only_path"]`.

  With gw1.ams's three paths from the lesson, A falls at "as_path" and C at
  "igp_cost", so the answer is `["B", "igp_cost"]`.
languages: [python, javascript]
entry: best_path
starter:
  python: |
    def best_path(paths, always_compare_med):
        alive = list(paths)
        if len(alive) == 1:
            return [alive[0]["id"], "only_path"]
        # TODO: walk the nine steps in order; return [id, step] when one path is left
        return [alive[0]["id"], "router_id"]
  javascript: |
    function best_path(paths, always_compare_med) {
      let alive = [...paths];
      if (alive.length === 1) return [alive[0].id, "only_path"];
      // TODO: walk the nine steps in order; return [id, step] when one path is left
      return [alive[0].id, "router_id"];
    }
tests:
  - args: [[{"id": "A", "as_path": [64501, 64496, 64511], "origin": "IGP", "med": 10, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.2"}, {"id": "B", "as_path": [64502, 64511], "origin": "IGP", "med": 0, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}, {"id": "C", "as_path": [64502, 64511], "origin": "IGP", "med": 0, "ebgp": false, "igp_cost": 120, "router_id": "10.255.2.201"}], false]
    expected: ["B", "igp_cost"]
    label: gw1.ams's three paths from the lesson
  - args: [[{"id": "A", "local_pref": 200, "as_path": [64501, 64496, 64511], "origin": "IGP", "med": 10, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.2"}, {"id": "B", "as_path": [64502, 64511], "origin": "IGP", "med": 0, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}, {"id": "C", "as_path": [64502, 64511], "origin": "IGP", "med": 0, "ebgp": false, "igp_cost": 120, "router_id": "10.255.2.201"}], false]
    expected: ["A", "local_pref"]
    label: LOCAL_PREF 200 on ISP1's routes
  - args: [[{"id": "B", "as_path": [64502, 64511], "origin": "IGP", "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}], false]
    expected: ["B", "only_path"]
    label: a single path
  - args: [[{"id": "P1", "as_path": [64501, 64511], "origin": "IGP", "med": 100, "ebgp": false, "igp_cost": 10, "router_id": "10.255.1.201"}, {"id": "P2", "as_path": [64502, 64511], "origin": "IGP", "med": 50, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}, {"id": "P3", "as_path": [64501, 64511], "origin": "IGP", "med": 20, "ebgp": false, "igp_cost": 30, "router_id": "10.255.2.201"}], false]
    expected: ["P2", "igp_cost"]
    label: MED compared within each neighbouring AS only
  - args: [[{"id": "E", "as_path": [64502, 64511], "origin": "IGP", "med": 10, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.0"}, {"id": "I", "as_path": [64502, 64511], "origin": "IGP", "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}], false]
    expected: ["I", "med"]
    label: a missing MED counts as 0 and beats eBGP over iBGP
  - args: [[{"id": "W", "weight": 50, "as_path": [64501, 64496, 64511], "origin": "INCOMPLETE", "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.2"}, {"id": "L", "local_pref": 300, "as_path": [64502, 64511], "origin": "IGP", "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}], false]
    expected: ["W", "weight"]
    label: weight outranks LOCAL_PREF
  - args: [[{"id": "P1", "as_path": [64501, 64511], "origin": "IGP", "med": 100, "ebgp": false, "igp_cost": 10, "router_id": "10.255.1.201"}, {"id": "P2", "as_path": [64502, 64511], "origin": "IGP", "med": 50, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}, {"id": "P3", "as_path": [64501, 64511], "origin": "IGP", "med": 20, "ebgp": false, "igp_cost": 30, "router_id": "10.255.2.201"}], true]
    expected: ["P3", "med"]
    label: always-compare-med
    hidden: true
  - args: [[{"id": "X", "as_path": [64502, 64511], "origin": "IGP", "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.10"}, {"id": "Y", "as_path": [64502, 64511], "origin": "IGP", "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.9"}], false]
    expected: ["Y", "router_id"]
    label: router IDs compared as numbers, not strings
    hidden: true
hints:
  - "Write one helper that keeps the paths with the maximum (or minimum) of a key, and express most steps through it."
  - "For MED, build groups keyed by as_path[0] (or one group when always_compare_med is true), find each group's lowest MED, and keep every path that equals its own group's lowest."
  - "Convert a router ID to a number with ((a*256 + b)*256 + c)*256 + d; comparing the strings would put 10.255.1.10 before 10.255.1.9."
```

## Senior signals

- You explain the ladder's order as a principle, local and deliberate before global and accidental, not as a list.
- You set LOCAL_PREF on import to steer the AS's egress, and treat inbound steering (prepending, MED, more-specifics) as a request to other networks.
- You name MED's three traps unprompted: same neighbouring AS only, missing counts as best, and order dependence fixed by deterministic MED.
- You expect IGP changes to move BGP exits through hot potato, and drain BGP before the IGP.
- You ask "decided at which step?" before "which path?", and build tooling that answers it.

## Check yourself

```quiz
- q: >-
    gw1.ams holds A from its own eBGP session to ISP1 (AS_PATH 64501 64496 64511) and B over iBGP from gw2.ams (AS_PATH 64502 64511). LOCAL_PREF, weight and ORIGIN are equal. Why does gw1.ams not use its own ISP1 link?
  options: ["iBGP paths are always preferred because they are already inside the AS", "B has the lower IGP cost, and IGP cost is compared before AS_PATH length", "AS_PATH length is compared before eBGP over iBGP, and B's path is shorter", "MED is compared across both ISPs, and B's MED of 0 beats A's MED of 10"]
  answer: 2
  explanation: >-
    Step 5, AS_PATH length, removes A (three ASes against two) before step 8 (eBGP over iBGP) could favour it. IGP cost is step 9, after AS_PATH. MED is not compared between different neighbouring ASes by default. And eBGP is preferred over iBGP, not the reverse; that step comes too late in the ladder to help A.
- q: >-
    Meridian sets LOCAL_PREF 200 on routes gw1.ams learns from ISP1. What happens on gw2.ams, which has its own eBGP path from ISP2 with LOCAL_PREF 100?
  options: ["gw2.ams switches to gw1.ams's ISP1 path, because iBGP carries LOCAL_PREF 200", "gw2.ams load-balances over both paths, because the two exits are now equally preferred", "gw2.ams keeps its ISP2 path, because eBGP over iBGP is checked before LOCAL_PREF", "Nothing, because LOCAL_PREF only affects the router whose import policy set it"]
  answer: 0
  explanation: >-
    LOCAL_PREF is carried to every iBGP peer, so gw2.ams compares 200 with its own 100 at step 3 and switches to A, then stops advertising its ISP2 path. Weight is the attribute that stays on one router. eBGP over iBGP is step 8, far below LOCAL_PREF. The paths differ at LOCAL_PREF, so they are not equal for multipath.
- q: >-
    A router has three iBGP paths to one prefix that tie down to MED. Two are from AS 64501 (MED 100 and 20), one from AS 64502 (MED 50), and their IGP costs differ. Operators notice that the chosen path depends on which path arrived last. What removes the dependence?
  options: ["Setting a missing MED to the worst value, so that every path carries an explicit MED", "Deterministic MED, which picks the best path of each neighbouring AS before comparing the winners", "Raising LOCAL_PREF on the AS 64502 path, so that MED is compared across both neighbours", "Enabling multipath, so that all three paths are installed and none of them has to win"]
  answer: 1
  explanation: >-
    MED is compared only between paths from the same neighbouring AS, so pairwise comparisons are not transitive and the result depends on arrival order. Grouping by neighbouring AS first, then comparing the group winners, gives the same answer whatever the order. Missing-as-worst does not apply, because all three carry a MED. Raising LOCAL_PREF changes the winner without making MED comparable across neighbours. Multipath requires equality at the MED step, which these paths do not have.
- q: >-
    During maintenance, IS-IS metrics on gw2.ams's links are raised to 1,000. No BGP session goes down, but latency from Amsterdam to some internet destinations jumps by about 100 ms. What happened?
  options: ["gw1.ams's IGP cost to gw2.ams's next hop rose above the cost to gw1.sin, so its exit moved to Singapore", "gw2.ams's BGP sessions reset when its metrics changed, withdrawing every route it had sent", "MED was recomputed from the new IGP metrics, and ISP2 now prefers the Singapore entry point", "The higher metric made the AS_PATH via gw2.ams look longer to the other gateways in the AS"]
  answer: 0
  explanation: >-
    Hot-potato routing: B and C tie down to step 9, so the IGP cost to each next hop decides. At 1,010 against 120, the Singapore exit wins, adding about 52 ms each way inside Meridian. IGP metrics do not change AS_PATH or reset BGP sessions. MED is set by the neighbouring AS, not derived from Meridian's IGP unless an operator configures that.
- q: >-
    A border router with sessions to two ISPs has maximum-paths set to 4 and holds two eBGP paths to a prefix, one with AS_PATH 64501 64511 and one with 64502 64511. Everything else is equal. The FIB shows only one next hop. Why?
  options: ["Multipath is overridden by the oldest-path rule, which leaves one installed path", "Multipath only applies to iBGP paths, never to paths learned over eBGP sessions", "Multipath needs at least four paths before it installs more than one of them", "Multipath needs the paths to share an AS_PATH, not only its length, unless relaxed"]
  answer: 3
  explanation: >-
    By default, multipath candidates must have identical AS_PATH contents, so paths through two different neighbouring ASes stay out of the group. A multipath relax option loosens the requirement to equal length. Maximum-paths is an upper limit, not a minimum. eBGP and iBGP multipath are both supported, with separate settings. The oldest-path rule still picks the single best path to advertise, but it runs after the multipath set is formed and does not shrink it.
```
