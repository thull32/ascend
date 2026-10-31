---
slug: bgp-best-path
title: BGP Best Path
difficulty: medium
patterns: [greedy]
lists: [network-practice, ascend-150]
companies: [cisco, arista, juniper, nvidia]
order: 4
lesson: fabric-networking/bgp-fundamentals/the-best-path-algorithm
hints:
  - "Run the decision as a series of filters. Each step keeps every route that ties for the best value of one attribute and drops the rest; stop caring about a route the moment it is dropped."
  - "LOCAL_PREF, AS_PATH length and ORIGIN, then eBGP, IGP cost and router ID, are ordinary keys. MED is the odd one: group the survivors by neighbor_as and keep, in each group, the routes with that group's lowest MED. Routes in different groups never knock each other out at MED."
  - "Compute the MED groups from the routes still alive after ORIGIN, not from the whole input. A missing MED (null) counts as 0. Convert router IDs to 32-bit numbers before comparing them, and let the lower index win a full tie."
signatures:
  python:
    name: bgp_best_path
    starter: |
      def bgp_best_path(routes: list[dict]) -> int:
          pass
  javascript:
    name: bgp_best_path
    starter: |
      function bgp_best_path(routes) {
      }
tests:
  - args: [[{"local_pref": 100, "as_path": [64501, 64496, 64511], "origin": "IGP", "med": 10, "neighbor_as": 64501, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.2"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64502, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64502, "ebgp": false, "igp_cost": 120, "router_id": "10.255.2.201"}]]
    expected: 1
    label: "gw1.ams: three paths to 192.0.2.0/24, decided at IGP cost"
  - args: [[{"local_pref": 200, "as_path": [64501, 64496, 64511], "origin": "IGP", "med": 10, "neighbor_as": 64501, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.2"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64502, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64502, "ebgp": false, "igp_cost": 120, "router_id": "10.255.2.201"}]]
    expected: 0
    label: "LOCAL_PREF 200 beats a shorter AS_PATH"
  - args: [[{"local_pref": 100, "as_path": [64501, 64511], "origin": "IGP", "med": 100, "neighbor_as": 64501, "ebgp": false, "igp_cost": 10, "router_id": "10.255.1.201"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 50, "neighbor_as": 64502, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}, {"local_pref": 100, "as_path": [64501, 64511], "origin": "IGP", "med": 20, "neighbor_as": 64501, "ebgp": false, "igp_cost": 30, "router_id": "10.255.2.201"}]]
    expected: 1
    label: "MED compared only within each neighbouring AS"
  - args: [[{"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 10, "neighbor_as": 64502, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.4"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": null, "neighbor_as": 64502, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}]]
    expected: 1
    label: "a missing MED counts as 0 and beats eBGP over iBGP"
  - args: [[{"local_pref": 100, "as_path": [64502, 64511], "origin": "INCOMPLETE", "med": null, "neighbor_as": 64502, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}]]
    expected: 0
    label: "a single route"
  - args: [[{"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64502, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.10"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64502, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.9"}]]
    expected: 1
    label: "router IDs compare as numbers, not text"
  - args: [[{"local_pref": 100, "as_path": [64501, 64511], "origin": "INCOMPLETE", "med": 0, "neighbor_as": 64501, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.2"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "EGP", "med": 0, "neighbor_as": 64502, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}, {"local_pref": 100, "as_path": [64502, 64496], "origin": "IGP", "med": 50, "neighbor_as": 64502, "ebgp": false, "igp_cost": 120, "router_id": "10.255.2.201"}]]
    expected: 2
    label: "ORIGIN: IGP before EGP before INCOMPLETE, and ORIGIN is decided before MED"
  - args: [[{"local_pref": 100, "as_path": [64502], "origin": "IGP", "med": 0, "neighbor_as": 64502, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.4"}, {"local_pref": 100, "as_path": [], "origin": "INCOMPLETE", "med": null, "neighbor_as": 64500, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}]]
    expected: 1
    label: "an empty AS_PATH (originated inside AS 64500) is length 0"
  - args: [[{"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64502, "ebgp": false, "igp_cost": 20, "router_id": "10.255.1.202"}, {"local_pref": 100, "as_path": [64501, 64511], "origin": "IGP", "med": 500, "neighbor_as": 64501, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.2"}]]
    expected: 1
    hidden: true
    label: "different neighbours: MED 500 is not compared with MED 0"
  - args: [[{"local_pref": 100, "as_path": [64501, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64501, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.2"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64502, "ebgp": true, "igp_cost": 0, "router_id": "10.0.0.4"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64502, "ebgp": true, "igp_cost": 0, "router_id": "10.0.0.4"}]]
    expected: 1
    hidden: true
    label: "router IDs are unsigned (198.51.100.2 is above 10.0.0.4); a full tie between two sessions to one router goes to the lower index"
  - args: [[{"local_pref": 100, "as_path": [64501, 64496, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64501, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.2"}, {"local_pref": 100, "as_path": [64501, 64511], "origin": "IGP", "med": 100, "neighbor_as": 64501, "ebgp": false, "igp_cost": 10, "router_id": "10.255.1.201"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 50, "neighbor_as": 64502, "ebgp": false, "igp_cost": 30, "router_id": "10.255.1.202"}, {"local_pref": 90, "as_path": [64502], "origin": "IGP", "med": 0, "neighbor_as": 64502, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.4"}]]
    expected: 1
    hidden: true
    label: "MED groups are formed from survivors only"
  - args: [[{"local_pref": 100, "as_path": [64496, 64511], "origin": "IGP", "med": 10, "neighbor_as": 64496, "ebgp": false, "igp_cost": 120, "router_id": "10.255.3.202"}, {"local_pref": 100, "as_path": [64496, 64511], "origin": "IGP", "med": 50, "neighbor_as": 64496, "ebgp": false, "igp_cost": 20, "router_id": "10.255.2.201"}, {"local_pref": 100, "as_path": [64501, 64496, 64511], "origin": "IGP", "med": 50, "neighbor_as": 64501, "ebgp": false, "igp_cost": 20, "router_id": "10.255.2.11"}, {"local_pref": 100, "as_path": [64501, 64496, 64511], "origin": "EGP", "med": null, "neighbor_as": 64501, "ebgp": false, "igp_cost": 140, "router_id": "10.255.2.13"}, {"local_pref": 100, "as_path": [64501, 64496, 64511], "origin": "IGP", "med": 10, "neighbor_as": 64501, "ebgp": false, "igp_cost": 140, "router_id": "10.255.2.202"}, {"local_pref": 100, "as_path": [64501, 64511], "origin": "EGP", "med": null, "neighbor_as": 64501, "ebgp": false, "igp_cost": 140, "router_id": "10.255.2.201"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 100, "neighbor_as": 64502, "ebgp": false, "igp_cost": 120, "router_id": "10.255.1.12"}, {"local_pref": 100, "as_path": [64496, 64511], "origin": "IGP", "med": 100, "neighbor_as": 64496, "ebgp": false, "igp_cost": 120, "router_id": "10.255.1.201"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "INCOMPLETE", "med": 100, "neighbor_as": 64502, "ebgp": false, "igp_cost": 30, "router_id": "10.255.2.202"}, {"local_pref": 100, "as_path": [64496, 64511], "origin": "IGP", "med": 20, "neighbor_as": 64496, "ebgp": false, "igp_cost": 140, "router_id": "10.255.1.202"}, {"local_pref": 100, "as_path": [64502, 64496, 64511], "origin": "IGP", "med": 10, "neighbor_as": 64502, "ebgp": false, "igp_cost": 30, "router_id": "10.255.3.12"}, {"local_pref": 100, "as_path": [64496, 64511], "origin": "EGP", "med": 10, "neighbor_as": 64496, "ebgp": false, "igp_cost": 30, "router_id": "10.255.2.13"}, {"local_pref": 100, "as_path": [64501, 64511], "origin": "EGP", "med": 10, "neighbor_as": 64501, "ebgp": false, "igp_cost": 140, "router_id": "10.255.3.13"}, {"local_pref": 90, "as_path": [64501, 64511], "origin": "INCOMPLETE", "med": 20, "neighbor_as": 64501, "ebgp": false, "igp_cost": 30, "router_id": "10.255.1.13"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 20, "neighbor_as": 64502, "ebgp": false, "igp_cost": 30, "router_id": "10.255.1.202"}, {"local_pref": 100, "as_path": [64501, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64501, "ebgp": false, "igp_cost": 120, "router_id": "10.255.2.201"}, {"local_pref": 100, "as_path": [64501, 64511], "origin": "IGP", "med": 10, "neighbor_as": 64501, "ebgp": false, "igp_cost": 120, "router_id": "10.255.3.201"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 100, "neighbor_as": 64502, "ebgp": false, "igp_cost": 30, "router_id": "10.255.2.13"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 20, "neighbor_as": 64502, "ebgp": false, "igp_cost": 120, "router_id": "10.255.1.202"}, {"local_pref": 90, "as_path": [64501, 64511], "origin": "IGP", "med": null, "neighbor_as": 64501, "ebgp": false, "igp_cost": 30, "router_id": "10.255.3.11"}, {"local_pref": 90, "as_path": [64496, 64511, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64496, "ebgp": false, "igp_cost": 30, "router_id": "10.255.3.11"}, {"local_pref": 100, "as_path": [64496, 64511, 64511], "origin": "IGP", "med": 20, "neighbor_as": 64496, "ebgp": false, "igp_cost": 30, "router_id": "10.255.1.202"}, {"local_pref": 100, "as_path": [64502, 64496, 64511], "origin": "IGP", "med": 50, "neighbor_as": 64502, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.20"}, {"local_pref": 100, "as_path": [64496, 64511], "origin": "IGP", "med": 10, "neighbor_as": 64496, "ebgp": false, "igp_cost": 30, "router_id": "10.255.1.12"}, {"local_pref": 100, "as_path": [64501, 64511], "origin": "IGP", "med": null, "neighbor_as": 64501, "ebgp": false, "igp_cost": 30, "router_id": "10.255.2.13"}, {"local_pref": 90, "as_path": [64501, 64496, 64511], "origin": "IGP", "med": 0, "neighbor_as": 64501, "ebgp": false, "igp_cost": 30, "router_id": "10.255.2.13"}, {"local_pref": 100, "as_path": [64501, 64511], "origin": "IGP", "med": 50, "neighbor_as": 64501, "ebgp": false, "igp_cost": 30, "router_id": "10.255.2.201"}, {"local_pref": 100, "as_path": [64496, 64511], "origin": "IGP", "med": 20, "neighbor_as": 64496, "ebgp": false, "igp_cost": 20, "router_id": "10.255.2.12"}, {"local_pref": 100, "as_path": [64501, 64511], "origin": "EGP", "med": null, "neighbor_as": 64501, "ebgp": false, "igp_cost": 30, "router_id": "10.255.1.201"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 100, "neighbor_as": 64502, "ebgp": false, "igp_cost": 30, "router_id": "10.255.3.11"}, {"local_pref": 100, "as_path": [64501, 64496, 64511], "origin": "IGP", "med": 100, "neighbor_as": 64501, "ebgp": false, "igp_cost": 120, "router_id": "10.255.3.201"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 10, "neighbor_as": 64502, "ebgp": false, "igp_cost": 120, "router_id": "10.255.2.202"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 20, "neighbor_as": 64502, "ebgp": false, "igp_cost": 140, "router_id": "10.255.2.11"}, {"local_pref": 100, "as_path": [64496, 64511], "origin": "INCOMPLETE", "med": 20, "neighbor_as": 64496, "ebgp": false, "igp_cost": 120, "router_id": "10.255.2.202"}, {"local_pref": 100, "as_path": [64496, 64511], "origin": "EGP", "med": 50, "neighbor_as": 64496, "ebgp": false, "igp_cost": 30, "router_id": "10.255.3.202"}, {"local_pref": 100, "as_path": [64502, 64511], "origin": "IGP", "med": 50, "neighbor_as": 64502, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.43"}, {"local_pref": 100, "as_path": [64502, 64496, 64511], "origin": "INCOMPLETE", "med": 50, "neighbor_as": 64502, "ebgp": false, "igp_cost": 30, "router_id": "10.255.3.202"}, {"local_pref": 100, "as_path": [64496, 64511], "origin": "IGP", "med": 10, "neighbor_as": 64496, "ebgp": false, "igp_cost": 30, "router_id": "10.255.1.201"}, {"local_pref": 100, "as_path": [64501, 64496, 64511], "origin": "IGP", "med": 200, "neighbor_as": 64501, "ebgp": true, "igp_cost": 0, "router_id": "198.51.100.27"}, {"local_pref": 100, "as_path": [64501, 64511], "origin": "IGP", "med": null, "neighbor_as": 64501, "ebgp": false, "igp_cost": 120, "router_id": "10.255.2.202"}]]
    expected: 23
    hidden: true
    label: "40 routes from three neighbouring ASes"
time_limit_ms: 4000
---
A router often hears about the same destination from several neighbours. It can forward along only one of those routes (or a few equal ones), so it needs a rule that turns a pile of candidates into one winner. In BGP that rule is the **decision process**, and this problem asks you to implement it.

### The networking idea in one minute

**BGP** (Border Gateway Protocol) is how networks tell each other which address blocks they can reach. Each network is an **autonomous system** (AS), identified by a number. A **route** in BGP is a prefix plus a set of **path attributes**: facts and preferences attached to that announcement. For one prefix a router may hold one route from each neighbour, and it ranks them by walking a fixed ladder of attributes. At each rung, routes that are worse than the best on that attribute are dropped; the walk stops when one route is left.

The rungs used here, in order:

| Step | Attribute | Better is | What it means |
|---|---|---|---|
| 1 | `local_pref` | higher | The operator's own preference, set by policy when the route is received and shared across the whole AS |
| 2 | `as_path` | shorter | The list of ASes the announcement crossed. Fewer networks, not fewer miles |
| 3 | `origin` | `IGP` < `EGP` < `INCOMPLETE` | How the route entered BGP. A historical attribute that still breaks ties |
| 4 | `med` | lower, **only among routes from the same `neighbor_as`** | The MULTI_EXIT_DISC: a neighbouring AS that connects to you in several places uses it to say which of its entry points it prefers |
| 5 | `ebgp` | `true` | Prefer a route learned directly from another AS (eBGP) over one relayed by a router inside your own AS (iBGP) |
| 6 | `igp_cost` | lower | The internal routing cost to reach the route's next hop: leave your network by the nearest exit ("hot potato") |
| 7 | `router_id` | lower, as an unsigned 32-bit number | A unique ID of the advertising router. A final tie-breaker that makes the answer deterministic |

Step 4 is the trap. A MED is a ranking that one neighbour assigns to its own routers, so ISP1's MED of 10 and ISP2's MED of 0 are numbers on two unrelated scales. RFC 4271 compares MED only between routes whose **neighbouring AS** (the AS the route was learned from) is the same. A consequence is that "is route X better than route Y?" is no longer a consistent comparison: X can beat Y, Y beat Z and Z beat X. RFC 4271 therefore describes this step as an elimination over the whole set of candidates, and routers that would otherwise compare routes two at a time in arrival order get the same effect with *deterministic MED*: compare MEDs inside each neighbour group, then let the group survivors compete on the remaining steps. That is the behaviour you implement.

Real implementations have a few more rungs (a vendor-local weight, locally originated routes, multipath, oldest path, peer address); this problem uses the seven above, which are the ones interviewers expect you to reason about. The examples use Meridian's Amsterdam gateway `gw1.ams` in AS 64500, its two internet providers ISP1 (AS 64501) and ISP2 (AS 64502), a transit provider AS 64496 and a content network AS 64511 that originates `192.0.2.0/24`. All of these numbers and prefixes come from the ranges reserved for documentation (RFC 5398 for AS numbers, RFC 5737 for IPv4).

### The task

Write `bgp_best_path(routes)`. `routes` is a non-empty list of candidate routes for **one prefix**, each a dictionary (an object in JavaScript) with:

- `local_pref`: integer
- `as_path`: list of AS numbers; may be empty for a route that originated inside your own AS
- `origin`: `"IGP"`, `"EGP"` or `"INCOMPLETE"`
- `med`: integer, or `None` (`null`) when the route carries no MED. **A missing MED counts as 0**, as RFC 4271 specifies.
- `neighbor_as`: the neighbouring AS the route came from. Use this field for MED grouping; do not derive it from `as_path`. For a route originated inside your own AS it is your own AS number.
- `ebgp`: `true` if learned over eBGP, `false` if over iBGP
- `igp_cost`: non-negative integer
- `router_id`: dotted IPv4 string such as `"10.255.1.202"`. It is an identifier, not necessarily a reachable address; compare it as the unsigned 32-bit number the four octets spell (`a·2²⁴ + b·2¹⁶ + c·2⁸ + d`).

Apply steps 1 to 7 as filters. At step 4, group the routes still alive by `neighbor_as`; within each group keep the routes whose MED equals that group's lowest MED. Routes in different groups do not eliminate each other at step 4. If several routes survive step 7 (they tie on everything, for example two sessions to the same router), the one with the **lowest index** wins.

Return the index of the best route in `routes`.

### Examples

**1. Three ways out of Amsterdam.** `gw1.ams` holds three routes to `192.0.2.0/24`. A comes from its own eBGP session to ISP1. B and C are ISP2's route, relayed over iBGP by `gw2.ams` (in Amsterdam, 20 away in IGP cost) and by `gw1.sin` (in Singapore, 120 away across the long-haul circuit). Every route has `local_pref` 100 and `origin` `IGP`.

| Index | Route | `as_path` | `med` | `neighbor_as` | `ebgp` | `igp_cost` | `router_id` |
|---|---|---|---|---|---|---|---|
| 0 | A, ISP1 direct | `[64501, 64496, 64511]` | 10 | 64501 | true | 0 | `198.51.100.2` |
| 1 | B, via `gw2.ams` | `[64502, 64511]` | 0 | 64502 | false | 20 | `10.255.1.202` |
| 2 | C, via `gw1.sin` | `[64502, 64511]` | 0 | 64502 | false | 120 | `10.255.2.201` |

Output: `1`. LOCAL_PREF ties. A falls at step 2: three ASes against two. B and C tie on ORIGIN, on MED (both 0 from AS 64502) and on eBGP (both iBGP). B wins at step 6, 20 against 120. Note that `gw1.ams` ignores its own ISP1 link: AS_PATH length outranks "prefer eBGP".

**2. MED is compared within a neighbour only.** Three iBGP routes, identical through ORIGIN (`local_pref` 100, two-AS paths, `IGP`):

| Index | Route | `neighbor_as` | `med` | `igp_cost` |
|---|---|---|---|---|
| 0 | P1 | 64501 | 100 | 10 |
| 1 | P2 | 64502 | 50 | 20 |
| 2 | P3 | 64501 | 20 | 30 |

Output: `1`. The ISP1 group {P1, P3} keeps P3 (20 beats 100); the ISP2 group {P2} keeps P2. P2 and P3 are both iBGP, and P2 wins on IGP cost. A router that compares each new route only with its current best, in arrival order, gets P3 for the order P1, P2, P3 (P1 beats P2 on IGP cost, then P3 beats P1 on MED) and P1 for the order P2, P3, P1. The set-wise rule gives P2 whatever the order.

**3. A missing MED is the best MED.** Two routes from ISP2, both with `local_pref` 100, path `[64502, 64511]` and `IGP`:

| Index | `med` | `ebgp` | `igp_cost` | `router_id` |
|---|---|---|---|---|
| 0 | 10 | true | 0 | `198.51.100.4` |
| 1 | `None` | false | 20 | `10.255.1.202` |

Output: `1`. The missing MED counts as 0, which beats 10 inside the AS 64502 group, and MED is decided before eBGP over iBGP gets a say.

### Constraints

- `1 ≤ len(routes) ≤ 10⁵`
- `0 ≤ local_pref, med, igp_cost < 2³²`
- `0 ≤ len(as_path) ≤ 255`
- Every `origin` is one of the three strings; every `router_id` is a valid dotted-quad IPv4 address.

### Follow-up

"Your function returns one winner. The router's forwarding table may install several equal routes for ECMP, and the routing team wants to know *why* each prefix's best path is what it is. Return the multipath set and the step that decided, then tell me what happens to your answer if this router is a route reflector that only hears its clients' best paths, and how deterministic MED interacts with that."

## Solution

### The naive approach

There are two tempting shortcuts, and both are wrong.

**Sort by one big key.** Build a tuple `(-local_pref, len(as_path), origin_rank, med, not ebgp, igp_cost, router_id, index)` and take the minimum. This compares MED between every pair of routes, including routes from different neighbours. In example 2 it picks P3 (MED 20 is the lowest overall), and in the hidden test where ISP1 sends MED 500 over eBGP and ISP2 sends MED 0 over iBGP, it picks ISP2's route, although the two MEDs should never meet and eBGP should decide. It runs in `O(n)` and is incorrect.

**Pairwise against the incumbent.** Keep a current best and compare each new route with it, using a two-route comparator that skips MED when the neighbours differ. This is how many router implementations historically worked, and it runs in `O(n)`, but the comparator is not transitive, so the winner depends on input order. Example 2 shows all three routes can win depending on arrival order. Sorting with that comparator is no fix: a sort assumes a consistent order and may return any of them.

### The insight

Six of the seven steps are lexicographic: once a route is worse on an earlier attribute, nothing later can save it. That makes the decision process greedy in the cleanest sense. Each step makes a final choice about which routes survive, and you never revisit it. A filter that keeps every tie at step `k` loses nothing, because the eventual winner must be among those ties.

MED is the only step that is not a total order across all routes. It is still a total order *within a neighbour group*. So step 4 is itself a filter, applied per group: each group keeps its own lowest-MED routes, and the union of those survivors goes on to step 5. Doing this as a set operation over the survivors, rather than as a pairwise comparison, is what removes the order dependence.

This set-wise rule gives the same answer as deterministic MED as routers implement it (pick the best route of each neighbour group with the full ladder, then compare the group winners). A route that survives ORIGIN has the globally best `(local_pref, as_path length, origin)`, so within its group the full ladder keeps exactly the same routes up to step 3, and then the same MED survivors. After MED the remaining steps are a total order again, and the best of the group bests is the best of their union.

### The optimal approach

1. Keep every route with the highest `local_pref`, then the shortest `as_path`, then the lowest origin rank.
2. Over the survivors only, compute each `neighbor_as` group's lowest MED (missing as 0), and keep every route that matches its own group's lowest.
3. Keep eBGP routes if any survived, then the lowest `igp_cost`, then the lowest router ID as a number.
4. Return the lowest index left. Filters preserve input order, so that is the first survivor.

```python
ORIGIN_RANK = {"IGP": 0, "EGP": 1, "INCOMPLETE": 2}


def _router_id(text: str) -> int:
    a, b, c, d = (int(part) for part in text.split("."))
    return (a << 24) | (b << 16) | (c << 8) | d


def _med(route: dict) -> int:
    return 0 if route.get("med") is None else route["med"]   # a missing MED counts as 0


def _keep_lowest(alive: list, key) -> list:
    """One rung of the ladder: keep every (index, route) that ties for the lowest key."""
    best = min(key(route) for _, route in alive)
    return [(i, route) for i, route in alive if key(route) == best]


def bgp_best_path(routes: list[dict]) -> int:
    alive = list(enumerate(routes))
    alive = _keep_lowest(alive, lambda r: -r["local_pref"])           # 1. highest LOCAL_PREF
    alive = _keep_lowest(alive, lambda r: len(r["as_path"]))          # 2. shortest AS_PATH
    alive = _keep_lowest(alive, lambda r: ORIGIN_RANK[r["origin"]])   # 3. IGP < EGP < INCOMPLETE

    lowest: dict[int, int] = {}                                       # 4. MED within each neighbour AS,
    for _, r in alive:                                                #    over the survivors only
        group = r["neighbor_as"]
        lowest[group] = min(lowest.get(group, _med(r)), _med(r))
    alive = [(i, r) for i, r in alive if _med(r) == lowest[r["neighbor_as"]]]

    alive = _keep_lowest(alive, lambda r: 0 if r["ebgp"] else 1)      # 5. eBGP over iBGP
    alive = _keep_lowest(alive, lambda r: r["igp_cost"])              # 6. lowest IGP cost
    alive = _keep_lowest(alive, lambda r: _router_id(r["router_id"])) # 7. lowest router ID
    return alive[0][0]                                                # full tie: lowest index
```

Trace example 2. After step 3 all three routes are alive. Step 4 builds `lowest = {64501: 20, 64502: 50}` and keeps P2 and P3; P1 is out because 100 is above its own group's 20. Both are iBGP, so step 5 keeps both. Step 6 keeps P2 (20 against 30). Index 1.

Steps 5 to 7 plus the index could collapse into one `min` over `(not ebgp, igp_cost, router_id, index)`, since after MED everything is lexicographic. Keeping each step separate costs nothing asymptotically and makes it trivial to report which step decided, which the follow-up asks for.

**Complexity.** Each step is one or two passes over the survivors, and there are seven steps, so time is `O(n)` (router-ID parsing is constant work per route). Space is `O(n)` for the survivor list and `O(g)` for the MED groups, where `g` is the number of distinct neighbouring ASes.

### Common mistakes

- **Comparing MED across neighbours.** A single sort key with MED in it, or a global "lowest MED" filter. This is the bug the problem is built around. Real routers have a knob for it, `always-compare-med`, for operators whose neighbours have agreed to set MEDs on one shared scale; without that agreement it is wrong.
- **Grouping before filtering.** Computing each group's lowest MED over the whole input instead of over the routes alive after ORIGIN. A route already eliminated at AS_PATH can then set a group's lowest MED that no survivor matches, and the whole group vanishes, sometimes leaving no route at all. One hidden test is built for exactly this.
- **Treating a missing MED as worst.** RFC 4271 says missing means 0, the best value. Several vendors offer "missing as worst" as an option because the default surprises people; here the default applies.
- **Comparing router IDs as strings.** `"10.255.1.10" < "10.255.1.9"` as text. Convert to a 32-bit integer, and keep it unsigned: in JavaScript `(a << 24) | ...` turns any ID from `128.0.0.0` up into a negative number, so `198.51.100.2` would beat `10.0.0.4`. Multiply (`a * 16777216 + ...`) or finish with `>>> 0`. A hidden test checks this.
- **Getting the direction wrong.** Higher LOCAL_PREF wins; lower everything else wins. Writing `max` for AS_PATH or `min` for LOCAL_PREF passes the tests where only one attribute differs and fails the rest.
- **Using `as_path[0]` instead of `neighbor_as`.** For a route originated inside your AS the path is empty and `as_path[0]` crashes; with confederations or AS_PATH manipulation it can also disagree with the actual neighbour.

### How to discuss it

Start with the ladder as a principle, not a list: the operator's explicit policy first (LOCAL_PREF), then what the route says about itself (AS_PATH, ORIGIN, MED), then your own geometry (eBGP over iBGP, IGP cost), then a deterministic tie-breaker. Say up front "every step except MED is lexicographic, so I'll implement each step as a filter that keeps ties", and name the MED rule before you write code: grouped by neighbouring AS, missing as 0, computed over survivors. Mention the sort-by-tuple and pairwise approaches and why each fails, with example 2 as the counterexample. After coding, trace example 2, because it exercises the grouping, and point out the router-ID conversion.

For the follow-up: the multipath set is the survivors after step 6 (real routers additionally require the same neighbouring AS and identical AS_PATH by default, or "multipath relax" to accept any equal-length path). The deciding step is the first step after which one route remains, which this structure gives for free. On a route reflector: the reflector advertises only its own best path to its clients, so clients choose among reflectors' choices rather than among all paths. Because each reflector hides the paths it did not pick, MED can make the system never settle: a reflector's choice depends on which routes from one neighbouring AS it can see, the MED rule on those routes changes which route its peers prefer, and their new advertisements change its view again (persistent MED oscillation, RFC 3345). Deterministic MED removes the order dependence inside one router but does not fix this, since the cause is the missing paths. The fixes are giving routers the hidden paths (ADD-PATH, RFC 7911, or a full mesh), IGP costs that make each cluster prefer its own exits, not accepting MEDs, or `always-compare-med` where MEDs share one scale.

### Networking follow-ups

A network-org interviewer will push from the function to how this behaves on real routers.

- **"Why is LOCAL_PREF before AS_PATH?"** Because it is your decision and AS_PATH is someone else's claim. LOCAL_PREF is set on import by your policy and carried to every iBGP router in the AS, so the whole AS agrees on an exit. AS_PATH length counts networks, not latency or bandwidth; a two-AS path across an ocean beats a three-AS path across town. The common wrong answer is "BGP picks the shortest or fastest path". It picks the policy-preferred path, and shortest AS_PATH only among equal policy.
- **"Where do weight and locally originated fit?"** Weight is a vendor extension (Cisco, Arista, FRRouting) compared before LOCAL_PREF and never advertised, so it affects one router only. Locally originated routes (injected into BGP by this router itself, through configuration, aggregation or redistribution) are preferred right after LOCAL_PREF. Neither is in RFC 4271's decision process, which is why this problem leaves them out.
- **"Two equal external paths, and after a reboot traffic moved to the other provider. Why?"** Many implementations prefer the *oldest* eBGP path before router ID (RFC 5004), to avoid churn. After a reboot the other session came up first and became older. Express the preference with LOCAL_PREF if you care; comparing router IDs buys determinism, not intent.
- **"How do you steer inbound traffic, then?"** You cannot set your neighbours' LOCAL_PREF. You can prepend your own AS to make a path look longer, send MED to a neighbour that connects to you in several places, announce a more-specific prefix where you want traffic (longest-prefix match beats any BGP attribute, since it is a different prefix), or use the provider's communities. All of these are requests; only LOCAL_PREF on your own routers is a decision.
- **"What does the IGP cost step mean for maintenance?"** Hot-potato routing ties BGP exits to the IGP. Change an IS-IS metric in Amsterdam and BGP best paths for thousands of prefixes can move with no BGP change at all. That is why a drain shifts BGP away from a router before touching the IGP, and why a platform should record which step decided each best-path change.
- **"What is step 0?"** A route is a candidate only if its next hop is reachable through the IGP (and it passed import policy and loop checks). An unresolvable next hop removes the route before LOCAL_PREF is ever looked at, which is how a gateway can lose its preferred exit without any BGP message. The [best-path lesson](/learn/fabric-networking/bgp-fundamentals/the-best-path-algorithm) walks this and the rest of the ladder on Meridian's gateways.
- **"How would you verify your implementation against a real router?"** Feed the same candidates to FRRouting or a vendor lab image and diff the chosen path and the reason string (FRR prints, for example, `best (IGP Metric)`, Junos shows an inactive reason per losing path). Disagreements cluster in four places: weight, missing-MED handling, oldest-path defaults and multipath rules. It is fair to say "I'd confirm the late tie-breakers with the network team for our vendors; the structure doesn't change."
