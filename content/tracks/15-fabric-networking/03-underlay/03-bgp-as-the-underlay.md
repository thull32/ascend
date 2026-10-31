---
slug: bgp-as-the-underlay
title: "BGP as the underlay: RFC 7938, AS plans and BGP unnumbered"
description: How a data center runs eBGP as its only routing protocol (RFC 7938), with an AS per leaf and one AS for the spines, how AS-path loop prevention removes every spine-leaf-spine detour, when allowas-in is needed, how BGP unnumbered peers over IPv6 link-local addresses and forwards IPv4 through them, and how to answer "why IS-IS and not eBGP?" both ways.
minutes: 45
difficulty: medium
tags: [fabric-networking, bgp, ebgp, underlay, rfc-7938, clos, as-path, allowas-in, bgp-unnumbered, ipv6-link-local, is-is, interview]
problems: []
---
Meridian's underlay is IS-IS, yet many of the largest data centers run no IS-IS or OSPF at all: one protocol, BGP, on every link, with each switch or each tier of switches its own small autonomous system. RFC 7938, "Use of BGP for Routing in Large-Scale Data Centers" (informational, August 2016, from engineers who operated some of the largest data centers of the time), wrote the design down, and most SONiC deployments (SONiC is the open-source switch operating system that started at Microsoft) and NVIDIA's Cumulus Linux reference designs follow it. "Why IS-IS and not eBGP?" is a question principal network engineers use to find out whether you understand either protocol.

Session mechanics (TCP port 179, OPEN, the state machine) are in [BGP sessions and the FSM](/learn/fabric-networking/bgp-fundamentals/bgp-sessions-and-the-fsm); IS-IS is in [IS-IS from zero](/learn/fabric-networking/underlay/is-is-from-zero).

## What the underlay needs, and what eBGP brings to it

The **underlay** is the routing layer that makes every device's loopback reachable from every other device ([what routing protocols do](/learn/fabric-networking/underlay/what-routing-protocols-do)). A **loopback** is a virtual interface that never goes down, holding a /32 that names the device (`leaf1.ams` is `10.255.1.11`, also its VXLAN tunnel endpoint, where overlay tunnels start and end). The underlay must deliver a route to every loopback, equal-cost multipath (ECMP) across every spine ([ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)), and fast repair.

An **autonomous system** (AS) is a set of routers under one routing policy, named by an AS number (ASN). **eBGP** is BGP between two different ASes, **iBGP** BGP inside one ([what BGP is for](/learn/fabric-networking/bgp-fundamentals/what-bgp-is-for)). eBGP has three properties that suit a fabric:

- **Its next hop is the neighbour itself.** An eBGP speaker sets NEXT_HOP to its own address on the link, so every route a leaf learns points at a directly connected spine. No second protocol is needed to resolve it, which is the job IS-IS does for iBGP ([iBGP, loops and next hops](/learn/fabric-networking/bgp-fundamentals/ibgp-loops-and-next-hops)).
- **It re-advertises what it learns.** iBGP never passes a route from one iBGP peer to another (that is what forces route reflectors); eBGP passes on its best path to every neighbour, so a route crosses the fabric hop by hop.
- **It detects loops by itself.** Every eBGP speaker prepends its ASN to the AS_PATH attribute, and a router that finds its own ASN in a received path discards the route.

RFC 7938's recipe uses all three: one **single-hop eBGP session on every leaf-spine link**, between the two ends' link addresses (or none, with BGP unnumbered, below), with IP TTL 1. Each leaf originates its loopback and server subnets. The RFC suggests not advertising the /31 link subnets, or summarising them: nothing needs to reach a link address. The full Amsterdam site (4 spines, 16 leaves) has 64 sessions, one per link, the same count as IS-IS adjacencies.

## Why one protocol everywhere is attractive

Meridian runs IS-IS for the underlay and BGP for the overlay (EVPN, the BGP address family that carries tenant MAC and IP routes) and the internet edge: two protocols, two sets of timers, two failure vocabularies. RFC 7938's argument for BGP only:

- **One implementation to know.** Configuration, monitoring, troubleshooting and upgrades cover one daemon and one kind of table; at tens of thousands of switches, removing a protocol removes a class of incidents.
- **Less flooding.** A link-state protocol floods every topology change to every router in the area, and every router recomputes its shortest-path tree. BGP sends only best paths, and only when what a router would advertise changes. If a router loses one of several equal paths, its advertisement is unchanged and it tells nobody.
- **Policy at every hop.** Any switch can filter, tag or prepend a route with the internet edge's tools ([policy and communities](/learn/fabric-networking/bgp-in-the-real-world/policy-and-communities)). Draining a spine is prepending its AS path or tagging its routes with a community (a label other routers match on), and a controller can inject routes with arbitrary next hops.
- **Simpler internals.** BGP leaves reliable delivery to TCP, and its state is per neighbour: received (Adj-RIB-In), chosen (Loc-RIB), sent (Adj-RIB-Out), each comparable with the other end ([updates, attributes and RIBs](/learn/fabric-networking/bgp-fundamentals/updates-attributes-and-ribs)).
- **Mature everywhere.** Every network operating system ships a well-tested BGP; not every one shipped a good IS-IS when the RFC's authors were buying merchant-silicon switches (built on a chip bought from a vendor such as Broadcom) from several suppliers.

**What it solves:** one protocol, one toolset, local failure handling, policy anywhere. **How it breaks:** the AS plan itself becomes configuration that can be wrong, and BGP's internet-scale defaults (slow timers, single-path selection) are wrong for a fabric until tuned. **Signal:** session counts and ASNs that differ from the plan, ECMP narrower than the number of spines, convergence measured in seconds rather than milliseconds.

## The AS plan: per leaf, per tier, or shared

Every device needs an ASN, and the choice decides which paths loop prevention allows.

| Plan | Spines | Leaves | Loop check does | Costs |
|---|---|---|---|---|
| Every device unique | 65201, 65202, ... | 65101, 65102, ... | Rejects only true loops through the same device | Spines accept spine-leaf-spine paths; ECMP across spines needs "multipath relax"; path hunting on withdrawal |
| Per tier (RFC 7938) | all 65100 | 65101, 65102, ... | Rejects any path through two spines | One ASN per leaf to manage |
| Shared leaf AS | all 65100 | all 65101 | Rejects every leaf-to-leaf route | Needs allowas-in on every leaf, which weakens the check |
| 5-stage, per tier and pod | super-spines one AS; each pod's spines one AS | unique per leaf, reusable across pods with allowas-in | Rejects paths that re-enter a tier | The most planning; what RFC 7938 actually describes |

RFC 7938 is written for a 5-stage Clos ([Clos and leaf-spine](/learn/fabric-networking/fabric-architecture/clos-and-leaf-spine)): "Tier 1" super-spines share one ASN, the "Tier 2" spines of each cluster share an ASN unique to that cluster, and every "Tier 3" top-of-rack leaf gets its own. Meridian's sites are 3-stage, so the plan collapses to two rows of that: one AS for the spine tier, one per leaf. The trace below shows why the spines share.

### Private AS numbers and how many there are

A fabric's ASNs never appear on the internet, so they come from the **private-use** ranges (RFC 6996): 64512–65534 among 2-byte ASNs, 1,023 numbers, and 4200000000–4294967294 among 4-byte ASNs, about 95 million. RFC 7938, written when 4-byte support was patchy, reused leaf ASNs in every cluster with allowas-in (below); today many operators use 4-byte private ASNs and keep every number unique.

Private ASNs are stripped at the edge: Meridian's gateways announce `203.0.113.0/24` as AS 64500 with no 651xx in the path. (AS 64496–64511 and the 203.0.113.0/24, 198.51.100.0/24 and 192.0.2.0/24 prefixes are documentation ranges, RFC 5398 and RFC 5737.)

### Meridian's plan, and what happens across sites

In this lesson's eBGP variant every Meridian site uses the same plan: spines AS 65100, leaves from 65101 (`leaf16.ams` is 65116). Inside one site that is the RFC 7938 plan. Across sites the reuse bites twice:

1. `spine1.ams` and `spine1.sin` are both AS 65100, so the long-haul session between them is iBGP, not eBGP. iBGP does not prepend, does not pass routes between iBGP peers, and leaves the next hop unchanged: `leaf1.sin`'s loopback arrives at `spine1.ams` pointing at a Singapore link address that nothing in Amsterdam can resolve. The hop-by-hop recipe stops at the site boundary.
2. Even with the next hop fixed, `leaf1.sin` is also AS 65101. Its loopback reaches `leaf1.ams` with AS_PATH `65100 65101`, indistinguishable from a route that came from `leaf1.ams` itself, and `leaf1.ams` discards it as a loop, though no loop exists.

The clean fix gives each site's spine tier its own ASN (65100 in `ams`, 65300 in `sin`, 65400 in `sjc`, leaving 652xx free for the per-spine example below), RFC 7938's per-cluster Tier 2 AS, and either numbers leaves uniquely across sites (4-byte ASNs make that easy) or accepts allowas-in on the leaves. IS-IS has no such question, part of the answer to "why IS-IS?" below.

## Traced: leaf1's loopback crosses the fabric

Take the small Amsterdam fabric: two spines (`spine1.ams`, `spine2.ams`, both AS 65100) and four leaves (`leaf1.ams` to `leaf4.ams`, AS 65101 to 65104). Point-to-point links use /31s from `10.254.0.0/16`, spine on the even address and leaf on the odd: `leaf1.ams`–`spine1.ams` is `10.254.1.0/31` (leaf `.1`), `leaf1.ams`–`spine2.ams` is `10.254.2.0/31`, `leaf3.ams`–`spine1.ams` is `10.254.1.4/31` (spine `.4`, leaf `.5`).

**Step 1: leaf1 originates.** Once its two sessions are Established, `leaf1.ams` sends each spine an UPDATE for its loopback. The one to `spine1.ams`, field by field:

| Field | Size | Value in this UPDATE | What reads it |
|---|---|---|---|
| BGP header | 19 bytes | marker, length 48, type 2 (UPDATE) | Framing |
| Withdrawn routes length | 2 bytes | 0 | Parser: nothing withdrawn |
| Total path attribute length | 2 bytes | 20 | Parser |
| ORIGIN | 4 bytes | IGP (0): originated by this AS | Best-path tie-break |
| AS_PATH | 9 bytes | AS_SEQUENCE of one 4-byte ASN: 65101 | Loop check, path length, multipath |
| NEXT_HOP | 7 bytes | 10.254.1.1 (leaf1's end of the /31) | spine1: where to forward |
| NLRI (network layer reachability information: the prefixes announced) | 5 bytes | 10.255.1.11/32 (prefix length 32, then 4 bytes) | spine1: the route itself |

The TCP segment carrying it has IP TTL 1 and destination `10.254.1.0`, so it can never leave the link. The copy to `spine2.ams` differs only in NEXT_HOP, `10.254.2.1`.

**Step 2: each spine checks and installs.** `spine1.ams` scans the AS_PATH for 65100, finds only 65101, and accepts. One path, so it is best; the FIB (forwarding information base, the table the switching chip forwards from: [the routing table](/learn/fabric-networking/from-zero/the-routing-table)) gets `10.255.1.11/32 via 10.254.1.1`.

**Step 3: each spine re-advertises.** `spine1.ams` sends its best path to every other neighbour, `leaf2.ams`, `leaf3.ams` and `leaf4.ams`, prepending its own ASN (AS_PATH `65100 65101`) and setting NEXT_HOP to its own address on each link. To `leaf3.ams` that is `10.254.1.4`. `spine2.ams` does the same with `10.254.2.4`.

**Step 4: leaf3 has two identical paths.** Both copies have AS_PATH `65100 65101`. The [best-path algorithm](/learn/fabric-networking/bgp-fundamentals/the-best-path-algorithm) would install only one of them, chosen by its tie-breakers (for two eBGP paths, usually the one received first, then the lower router ID, the 32-bit identifier each BGP speaker uses, normally its loopback), but with **BGP multipath** enabled (off by default on most traditional routers, on in every fabric) all paths equal through the AS-path comparison are installed. Illustrative FRRouting-style output on `leaf3.ams` (Cumulus-style port names):

```text
leaf3.ams# show bgp ipv4 unicast 10.255.1.11/32            (illustrative output)
BGP routing table entry for 10.255.1.11/32
Paths: (2 available, best #1, table default)
  65100 65101
    10.254.1.4 from spine1.ams (10.255.1.1)
      Origin IGP, valid, external, multipath, best (Older Path)
  65100 65101
    10.254.2.4 from spine2.ams (10.255.1.2)
      Origin IGP, valid, external, multipath

leaf3.ams$ ip route show 10.255.1.11
10.255.1.11 proto bgp metric 20
        nexthop via 10.254.1.4 dev swp51 weight 1
        nexthop via 10.254.2.4 dev swp52 weight 1
```

Two next hops, the same ECMP result IS-IS would compute, from a protocol that knows nothing about the topology beyond its neighbours.

**Step 5: leaf3 passes it on, and spine2 refuses.** `leaf3.ams` advertises its best path (via `spine1.ams`) to its other neighbour, `spine2.ams`, with AS_PATH `65103 65100 65101`. To `spine2.ams` that is a path to `leaf1.ams` that goes down to `leaf3.ams`, up to `spine1.ams` and down again: a **valley**. `spine2.ams` finds 65100 in it and discards it.

**Step 6: a link fails.** The `leaf1.ams`–`spine2.ams` link goes dark. The session runs over that one link, so it drops the moment the interface goes down (or when BFD, Bidirectional Forwarding Detection, a fast hello protocol, declares it dead with the light still on: [convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd)). `spine2.ams` has no other usable path (every path through a leaf contained 65100), so it withdraws `10.255.1.11/32` from `leaf2.ams`, `leaf3.ams` and `leaf4.ams`, which keep their `spine1.ams` next hop: one withdrawal per leaf, no computation anywhere else.

```viz
{"type": "fabric", "scenario": "ebgp-clos-underlay", "title": "eBGP underlay: leaf1's loopback crosses both spines, a valley path is rejected, a link failure withdraws it", "caption": "The small Amsterdam fabric with spines in AS 65100 and leaves in 65101 to 65104, eight single-hop sessions and no IS-IS. leaf1.ams announces 10.255.1.11/32; each spine prepends 65100 and passes it on; leaf3.ams installs both identical paths as ECMP; leaf3's re-advertisement (65103 65100 65101) is refused by spine2.ams because 65100 is in it; then the leaf1–spine2 link fails, spine2 withdraws the route and leaf3 keeps the path via spine1. Watch the UPDATE headers and the BGP tables on leaf3 and the spines."}
```

After the failure `spine2.ams` cannot reach `leaf1.ams` at all. Under IS-IS it would detour, `spine2.ams` → any leaf → `spine1.ams` → `leaf1.ams`. That is the price of valley-free paths: packets a leaf sends to `spine2.ams` before the withdrawal lands are dropped for those milliseconds rather than carried on a detour.

## AS-path loop prevention in a Clos

The rule is RFC 4271's: a route whose AS_PATH contains the receiver's own ASN is excluded from best-path selection. It is how BGP avoids distance-vector's count to infinity, because the path itself proves where the route has been ([routing algorithms](/learn/networking/network-algorithms/routing-algorithms) traces the alternative). In a fabric the AS plan turns that rule into a topology rule.

### Why the spines share one AS

With per-tier ASNs, any path that touches two spines contains 65100, and no spine accepts it: only valley-free paths, leaf → spine → leaf, survive. Give every spine its own ASN (65201, 65202) and two things change, both visible in the simulation below:

1. **Valleys become legal.** `spine2.ams` (65202) now accepts `65103 65201 65101` from `leaf3.ams`, a backup path through a leaf and the other spine. It holds three of them, one from each other leaf.
2. **ECMP collapses.** `leaf3.ams` receives `65201 65101` from `spine1.ams` and `65202 65101` from `spine2.ams`: equal length, different ASNs. Standard multipath requires identical AS paths, so `leaf3.ams` installs one next hop until someone enables "multipath relax" (equal-length paths through different neighbouring ASes), which RFC 7938 discusses.

The bigger cost of valleys shows when a route disappears entirely. **Path hunting** is what a path-vector protocol does after a withdrawal: each router falls back to a stale alternative it still holds, advertises it, and only learns it is dead when that alternative is withdrawn in turn, so the network tries ever-longer paths before giving up ([convergence and scale](/learn/fabric-networking/bgp-in-the-real-world/convergence-and-scale)). With valleys allowed, the spines hold stale paths through each other; with one spine AS, they hold none.

### Path hunting, simulated

The model runs BGP for one prefix, `leaf1.ams`'s loopback, in synchronous rounds: every router picks its best path (shortest AS_PATH, then lowest neighbour name), prepends its ASN, and sends it to every neighbour if it changed. Receivers store everything and apply the loop check when selecting, which gives the same result as rejecting on arrival and lets the printout show the denied paths.

```python
class Fabric:
    """Path-vector BGP for one prefix (leaf1's loopback) on a leaf-spine Clos."""

    def __init__(self, spines, leaves, spine_as, leaf_as, allowas_in=0):
        self.asn = {f"spine{s}": spine_as(s) for s in range(1, spines + 1)}
        self.asn |= {f"leaf{l}": leaf_as(l) for l in range(1, leaves + 1)}
        self.links = {frozenset((f"leaf{l}", f"spine{s}"))
                      for l in range(1, leaves + 1) for s in range(1, spines + 1)}
        self.allowas_in = allowas_in
        self.rib_in = {n: {} for n in self.asn}   # node -> {neighbour: AS_PATH}
        self.sent = {}                            # (from, to) -> last AS_PATH sent, None = withdrawn
        self.origin_up = True

    def neighbours(self, n):
        return sorted(m for link in self.links if n in link for m in link if m != n)

    def usable(self, n):
        """Paths n accepts: its own AS may appear at most allowas_in times (RFC 4271 loop check)."""
        return {nb: p for nb, p in self.rib_in[n].items() if p.count(self.asn[n]) <= self.allowas_in}

    def best(self, n):
        """(AS_PATH, multipath next hops), or None. Shortest path wins, then lowest neighbour name;
        multipath keeps every path with an identical AS_PATH (no 'multipath relax')."""
        if n == "leaf1":
            return ((), ["local"]) if self.origin_up else None
        paths = self.usable(n)
        if not paths:
            return None
        nb = min(paths, key=lambda m: (len(paths[m]), m))
        return paths[nb], [m for m in sorted(paths) if paths[m] == paths[nb]]

    def round(self):
        """Every router sends its current best (own AS prepended) to every neighbour, if it changed."""
        msgs = []
        for n in self.asn:
            b = self.best(n)
            out = (self.asn[n],) + b[0] if b else None
            msgs += [(n, nb, out) for nb in self.neighbours(n) if self.sent.get((n, nb)) != out]
        for n, nb, out in msgs:                   # deliver after everyone has decided
            self.sent[(n, nb)] = out
            if out is None:
                self.rib_in[nb].pop(n, None)
            else:
                self.rib_in[nb][n] = out
        return msgs

    def converge(self, watch=None, limit=50):
        for r in range(1, limit + 1):
            msgs = self.round()
            if not msgs:
                return r - 1
            if watch:
                print(f"  round {r}: {len(msgs):>2} msgs, {watch} best = {self.best(watch)}")
        raise RuntimeError("no convergence")

    def fail_link(self, a, b):
        self.links.discard(frozenset((a, b)))
        for x, y in ((a, b), (b, a)):
            self.rib_in[y].pop(x, None)
            self.sent.pop((x, y), None)

    def fail_leaf1(self):
        self.origin_up = False
        for s in [n for n in self.asn if n.startswith("spine")]:
            self.fail_link("leaf1", s)


shared = lambda s: 65100                 # RFC 7938: one AS for the whole spine tier
unique = lambda s: 65200 + s             # the tempting alternative: an AS per spine
per_leaf = lambda l: 65100 + l           # leaf1 = 65101 ... leaf16 = 65116

for name, spine_as in [("spines share AS 65100", shared), ("spine AS per device", unique)]:
    f = Fabric(2, 4, spine_as, per_leaf)
    f.converge()
    print(f"{name}: spine2 Adj-RIB-In {f.usable('spine2')}")
    print(f"  leaf3 best = {f.best('leaf3')}")
    f.fail_link("leaf1", "spine2")
    f.converge()
    print(f"  after leaf1-spine2 fails: spine2 best = {f.best('spine2')}, leaf3 best = {f.best('leaf3')}")

print("\nleaf1 dies (2 spines, 4 leaves):")
for name, spine_as in [("shared", shared), ("unique", unique)]:
    f = Fabric(2, 4, spine_as, per_leaf)
    f.converge()
    print(f" {name} spine AS")
    f.fail_leaf1()
    f.converge(watch="spine2")

print("\nleaf1 dies, full ams (4 spines, 16 leaves): rounds and UPDATEs until every router agrees")
for name, spine_as in [("shared", shared), ("unique", unique)]:
    f = Fabric(4, 16, spine_as, per_leaf)
    f.converge()
    f.fail_leaf1()
    total = rounds = 0
    while msgs := f.round():
        rounds, total = rounds + 1, total + len(msgs)
    print(f"  {name:<6} spine AS: {rounds} rounds, {total} UPDATEs")

print("\nevery leaf in AS 65101:")
for allow in (0, 1):
    f = Fabric(2, 4, shared, lambda l: 65101, allowas_in=allow)
    f.converge()
    print(f"  allowas-in {allow}: leaf3 best = {f.best('leaf3')}")
```

```text
spines share AS 65100: spine2 Adj-RIB-In {'leaf1': (65101,)}
  leaf3 best = ((65100, 65101), ['spine1', 'spine2'])
  after leaf1-spine2 fails: spine2 best = None, leaf3 best = ((65100, 65101), ['spine1'])
spine AS per device: spine2 Adj-RIB-In {'leaf1': (65101,), 'leaf2': (65102, 65201, 65101), 'leaf3': (65103, 65201, 65101), 'leaf4': (65104, 65201, 65101)}
  leaf3 best = ((65201, 65101), ['spine1'])
  after leaf1-spine2 fails: spine2 best = ((65102, 65201, 65101), ['leaf2']), leaf3 best = ((65201, 65101), ['spine1'])

leaf1 dies (2 spines, 4 leaves):
 shared spine AS
  round 1:  6 msgs, spine2 best = None
  round 2:  6 msgs, spine2 best = None
 unique spine AS
  round 1:  6 msgs, spine2 best = ((65102, 65201, 65101), ['leaf2'])
  round 2:  6 msgs, spine2 best = None
  round 3:  3 msgs, spine2 best = None
  round 4:  4 msgs, spine2 best = None

leaf1 dies, full ams (4 spines, 16 leaves): rounds and UPDATEs until every router agrees
  shared spine AS: 2 rounds, 120 UPDATEs
  unique spine AS: 8 rounds, 366 UPDATEs

every leaf in AS 65101:
  allowas-in 0: leaf3 best = None
  allowas-in 1: leaf3 best = ((65100, 65101), ['spine1', 'spine2'])
```

Read the four blocks against the mechanism:

- **Shared versus unique spine ASNs:** `spine2.ams` holds only the direct path (unique: three valley paths), `leaf3.ams` has 2-way ECMP (unique: one spine), and after the link failure `spine2.ams` has no route, as in the visualisation (unique: a detour via `leaf2.ams` and `spine1.ams`).
- **leaf1 dies, small fabric:** with a shared spine AS, round 1 is the spines' withdrawals and round 2 the leaves withdrawing the looped copies they had sent back. With unique ASNs, `spine2.ams` first *selects and announces* a stale valley path, and agreement takes four rounds.
- **leaf1 dies, full site:** 2 rounds and 120 UPDATEs against 8 rounds and 366. Hunting rounds carry new announcements, which are paced by the MRAI (minimum route advertisement interval) timer, 30 s on eBGP sessions by RFC 4271's suggestion; most implementations send withdrawals without waiting for it. Data-center profiles set it to 0 and a round costs milliseconds; at internet defaults one dead switch means minutes of churn.

The model is synchronous and carries one prefix, so real timings interleave differently; which paths exist, and the hunting, do not change.

**What loop prevention solves:** in a Clos with per-tier ASNs it removes every path that re-enters a tier, leaving only the valley-free paths. **How it breaks:** reused ASNs make it reject legitimate routes; per-device spine ASNs make it allow valleys, single-path ECMP and path hunting. **Signal:** received-but-denied route counts per session, ECMP width below the spine count, AS paths longer than two hops inside a site.

## allowas-in: accepting your own AS on purpose

Sometimes one ASN legitimately appears in two places: leaves that share an AS (a shortcut that keeps the plan to two numbers), leaf ASNs reused across RFC 7938 clusters, Meridian's repeated per-site plan, or a customer whose two sites share an ASN across a provider. The loop check then refuses routes that never looped. **allowas-in** *N* relaxes it on one session: accept a path that contains my own ASN up to *N* times.

```viz
{"type": "fabric", "scenario": "ebgp-clos-underlay", "variant": "shared-leaf-as", "title": "Every leaf in AS 65101: leaf3 rejects leaf1's loopback as a loop, then allowas-in 1 accepts it", "caption": "The same eight-session fabric, but all four leaves share AS 65101. leaf1.ams announces its loopback, the spines prepend 65100, and leaf3.ams rejects both copies because 65101 is already in the path. With allowas-in 1 both are accepted and installed as ECMP. The spines' own check still works: spine2.ams refuses leaf3's re-advertisement (65101 65100 65101), and the leaf1–spine2 failure ends in a withdrawal as before."}
```

Is it safe? It depends on what else still checks. In the shared-leaf case the spines' AS 65100 still rejects every path through two spines, so the only loop allowas-in 1 admits is leaf3's own route coming back to it, which loses to its locally originated route. That is RFC 7938's argument for cluster reuse: the AS path grows at each tier and the top tier still rejects its own ASN. It becomes unsafe when nothing else bounds the path, with a large *N* or where a genuine loop through another device of the same AS is possible: a withdrawn route can then circulate until the count is exceeded. Narrower tools exist: "allowas-in origin" (FRRouting) accepts the own ASN only as the origin, and **as-override**, on the sending side, replaces the neighbour's ASN in the path with the sender's own. Unique 4-byte ASNs need none of them.

**What allowas-in solves:** ASN reuse without losing reachability. **How it breaks:** forgotten on one leaf, that leaf has no routes to any other leaf while its sessions are all Established; set everywhere with a large *N*, it lets real loops live longer. **Signal:** a leaf with Established sessions, normal received counts and near-zero accepted routes, with "denied: AS-path loop" counters rising.

## BGP unnumbered: peering on IPv6 link-local addresses

The numbered design needs, for every link, a /31, an address on each end and a neighbour statement naming the far end's address and ASN: on the full Amsterdam site 128 addresses and 128 neighbour entries (one at each end of each of the 64 sessions), each a chance for a typo. **BGP unnumbered** removes all of it: the operator names only the interfaces, and the peer's address is learned.

### How a session forms without an address

Three IPv6 mechanisms do the work ([IP addressing and subnets](/learn/fabric-networking/from-zero/ip-addressing-and-subnets) has the IPv6 basics):

1. **Link-local addresses.** Every IPv6-enabled interface configures an address in `fe80::/64` (part of the `fe80::/10` link-local block) on its own, valid only on that link and never routed. Derived from the MAC by EUI-64 (flip one bit, insert `ff:fe`), `leaf1.ams`'s uplink MAC `00:00:5e:00:53:80` becomes `fe80::200:5eff:fe00:5380`; `spine1.ams`'s port facing it (`00:00:5e:00:53:81`) becomes `fe80::200:5eff:fe00:5381`.
2. **Router advertisements.** Each side sends ICMPv6 router advertisements (RAs, type 134) to the all-nodes group `ff02::1`, at an interval of seconds that the BGP daemon sets on the port (RFC 4861's defaults allow minutes); the source address is its link-local. BGP on `leaf1.ams` reads the source of the RA arriving on `swp51` and learns its peer: `fe80::200:5eff:fe00:5381%swp51` (the `%swp51` is needed because every link has its own `fe80::` space).
3. **TCP to port 179 on that address.** The session then forms exactly as in [BGP sessions and the FSM](/learn/fabric-networking/bgp-fundamentals/bgp-sessions-and-the-fsm). The peer's ASN is usually not configured either: "remote-as external" accepts any ASN different from the local one.

The leaf's configuration becomes "BGP on swp51 and swp52, AS 65101, router ID 10.255.1.11", identical on every leaf apart from those two values, a large gain for templates and the [source of truth](/learn/fabric-networking/operating-fabrics/network-automation-and-source-of-truth).

### An IPv4 route with an IPv6 next hop

The session is IPv6, but the fabric's routes are IPv4. Classic BGP's NEXT_HOP attribute holds only an IPv4 address, so both ends announce the **Extended Next Hop Encoding** capability (code 5, RFC 8950, which replaced RFC 5549) in their OPENs, for AFI 1 / SAFI 1 (address family identifier and subsequent AFI: IPv4 unicast) with next-hop AFI 2 (IPv6). Routes then travel in the multiprotocol attribute MP_REACH_NLRI. `leaf1.ams`'s loopback over the unnumbered session:

| Field | Size | Value | What reads it |
|---|---|---|---|
| ORIGIN | 4 bytes | IGP | Best path |
| AS_PATH | 9 bytes | 65101 | Loop check, path length |
| MP_REACH_NLRI header | 3–4 bytes | flags, type 14, length | Parser |
| AFI / SAFI | 3 bytes | 1 / 1 (IPv4 unicast) | Receiver: these are IPv4 routes |
| Next-hop length | 1 byte | 16 or 32 (RFC 2545's layout: a global slot, then an optional link-local slot; implementations differ on which they fill when the port has no global address) | Parser |
| Next hop | 16 or 32 bytes | `fe80::200:5eff:fe00:5380` | spine1: where to forward |
| Reserved | 1 byte | 0 | |
| NLRI | 5 bytes | 10.255.1.11/32 | The route |

There is no NEXT_HOP attribute at all; the IPv6 next hop inside MP_REACH_NLRI replaces it.

### How the forwarding plane uses it

An IPv4 next hop is used for one thing: finding the MAC address to put in the frame ([ARP and the default gateway](/learn/fabric-networking/from-zero/arp-and-the-default-gateway)). An IPv6 link-local next hop works as well, because IPv6 neighbour discovery maps it to the peer's MAC. Linux has accepted IPv4 routes with IPv6 gateways since kernel 5.2 (`via inet6 fe80::...`). Before that, and still in many deployments, FRRouting installs the route through a placeholder IPv4 next hop, `169.254.0.1`, marked "onlink", plus a permanent neighbour entry on each interface mapping `169.254.0.1` to the peer's MAC learned from IPv6:

```text
spine1.ams$ ip route show 10.255.1.11                     (illustrative output)
10.255.1.11 nhid 62 via 169.254.0.1 dev swp1 proto bgp metric 20 onlink

spine1.ams$ ip neigh show 169.254.0.1 dev swp1
169.254.0.1 lladdr 00:00:5e:00:53:80 PERMANENT proto zebra
```

The ASIC sees an ordinary route with an egress port and a destination MAC; nothing in the data plane knows that no IPv4 address exists on the link.

### What it costs

- **IPv6 must work on every fabric port,** even in an IPv4-only fabric. A port with IPv6 disabled (a hardening sysctl copied onto a switch image, say) has no link-local address and sends no RAs, and the session never learns a peer.
- **Addressing no longer catches miscabling.** A cable from `leaf3.ams` straight to `leaf6.ams` forms a healthy eBGP session under "remote-as external", `leaf6.ams`'s loopback is now one AS hop away instead of two, and `leaf3.ams` sends all its `leaf6.ams` traffic over that one cable. LLDP (Link Layer Discovery Protocol, in which each port announces its device and port name to the far end) checks against the cabling plan ([optics, cabling and the physical layer](/learn/fabric-networking/fabric-architecture/optics-cabling-and-the-physical-layer)) become the safety net.
- **Traceroute shows loopbacks.** With no IPv4 address on the link, ICMP "time exceeded" replies come from another address, usually the loopback, so tools that map link addresses to links lose their key.

**What unnumbered solves:** per-link address and neighbour bookkeeping, and the typo class that comes with it. **How it breaks:** no IPv6 on a port, filtered RAs, accidental sessions on wrong cables. **Signal:** interfaces enabled for BGP with no learned peer, LLDP neighbours that differ from the plan, AS paths of length one between leaves.

## Under the hood: what the daemon and the switch do

On a Linux-based NOS (network operating system: FRRouting on SONiC or Cumulus), `bgpd` checks every received path for its own ASN on arrival. A looped path counts as received but not accepted, the source of "received 1,342, accepted 0"; whether it is kept varies (Junos keeps it as a hidden route, FRRouting drops it unless soft-reconfiguration inbound keeps an unfiltered copy). After the best path, `bgpd` collects the paths that tie through the AS-path comparison, up to a maximum-paths limit at or above the spine count. `zebra` installs the set in the kernel as a next-hop group over netlink (the kernel's routing API). Cumulus's `switchd` mirrors the kernel's table into the ASIC (the switching chip); SONiC's zebra also writes routes to SONiC's database, and `orchagent` programs the chip through SAI, the vendor-neutral switch API. Either way the chip gets an ECMP group: one FIB entry pointing at a table of egress ports and MACs that the hash selects among. On a leaf every remote loopback resolves to the same spines, so they share one group, and hardware ECMP tables scale with distinct groups, not prefixes.

Timers are tuned away from the internet's: keepalive 3 s and hold 9 s in FRRouting's data-center profile, MRAI 0. Most failures beat any timer: each session runs over one link and is torn down the moment the interface goes down ("fast external fallover", on by default for directly connected eBGP in most implementations), and BFD covers links that stay up but stop passing traffic. In a 3-stage fabric the withdrawal is one hop from every leaf, so detection plus milliseconds of UPDATE processing and FIB programming is the whole budget: sub-second convergence is the normal expectation, and detection usually dominates it.

## IS-IS or eBGP: the comparison

| | IS-IS underlay + iBGP overlay (Meridian) | eBGP underlay (RFC 7938) |
|---|---|---|
| Protocols in the fabric | Two: IS-IS for loopbacks, BGP for EVPN and the edge | One, possibly with EVPN as a second address family on the same sessions |
| What each router knows | The whole topology of its level | Only its neighbours' best paths |
| A leaf-spine link fails | Two LSPs (link-state packets) flooded to every router; every router reruns SPF, the shortest-path computation (about a millisecond on a few hundred nodes) | The spine withdraws that leaf's prefixes to every other leaf; no one recomputes a topology |
| Spine with a dead leaf link | Detours through another leaf and spine | No route; traffic sent to it is dropped until the leaves process its withdrawal |
| Addressing and config | Interfaces enabled for IS-IS, one NET (the device's IS-IS address) per device; no peer addresses | Per-link /31s and neighbour entries, or unnumbered interfaces; an AS plan |
| Loop prevention | SPF on a consistent map; brief micro-loops during convergence | AS_PATH; the AS plan decides which paths exist |
| Steering and draining | Metrics, the overload bit ("do not route through me") | AS-path prepending, communities such as GRACEFUL_SHUTDOWN (RFC 8326: "lower this route's preference, I am going away"), any policy |
| Multi-site, one domain | Natural: one level-2 domain across sites | AS plan per site, allowas-in or unique 4-byte ASNs |
| Who runs it at scale | Large backbones, carriers, multi-site fabrics | Hyperscale single-site data centers, SONiC, NVIDIA Cumulus reference designs |

The failure row is less dramatic than "flooding versus no flooding" suggests. In a 3-stage Clos a leaf-spine link failure touches every leaf under either protocol, because every leaf's path to that leaf changes: the failure scope comes from the Clos topology, not from the protocol. The difference is cost per change: IS-IS makes every router flood and recompute; eBGP sends a withdrawal of the affected prefixes and nothing else.

### "Why IS-IS and not eBGP?" answered both ways

**For IS-IS (Meridian's answer).** Meridian is three sites and a backbone run as one routing domain. Link-state gives every router the full map, so a spine that loses a leaf link detours instead of dropping, and maintenance is a metric change or the overload bit, with no AS plan to keep consistent across sites. Underlay and overlay are separate by design: IS-IS answers "how do I reach that loopback", iBGP to the reflectors "which leaf has this tenant's MAC", and an overlay policy mistake cannot take down loopback reachability. IS-IS needs no IP addressing on links to form adjacencies, and with tuned timers and BFD converges in well under a second.

**For eBGP (the hyperscaler's answer).** One site, tens of thousands of switches, one team: one protocol to qualify, monitor and upgrade, cheap local failure handling, policy at every hop, and with unnumbered nearly identical configuration on every switch.

**The honest synthesis:** both work, and the choice follows the shape of the network and the team. A single large data center with one operator leans eBGP; a multi-site backbone run as one domain, with overlay services on top, leans IS-IS.

## Failure modes in production

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Duplicate leaf ASN (a rebuilt switch got another leaf's template) | Two leaves cannot reach each other's loopbacks; everything else works | Each shows the other's routes as denied for an AS-path loop; the ASN differs from the plan | Correct the ASN from the source of truth; validate uniqueness before every push |
| Shared leaf AS without allowas-in on one leaf | One leaf reaches nothing, all sessions Established | Received counts normal, accepted near zero, loop denials rising | Add allowas-in 1 there, or move to unique ASNs |
| Spines in different ASNs, no multipath relax | One uplink per leaf carries everything; the rest idle | FIB shows one next hop per loopback instead of one per spine; uplink utilisation skewed | Put the spines in one AS, or enable multipath relax |
| Path hunting after a withdrawal | Seconds to minutes of churn and transient detours after one switch dies | AS paths longer than two hops inside a site; update bursts in BMP (the BGP Monitoring Protocol, below) | Shared spine AS, so no valley paths exist to hunt through; MRAI 0 keeps any hunting to milliseconds |
| Unnumbered port with IPv6 disabled | One link never forms a session after an image change | No link-local address on the port; no RAs received | Enable IPv6 on fabric ports; check it in the build pipeline |
| Miscabled leaf-to-leaf link with "remote-as external" | Traffic between two leaves bypasses the spines and saturates one cable | AS path of length one between leaves; LLDP neighbour differs from the plan | Fix the cable; restrict accepted peer ASNs per interface role |
| Private ASNs leaking at the edge | ISPs reject or filter Meridian's prefixes | AS path at the ISP contains 651xx | Strip private ASNs on the gateways' external sessions |

A case worth telling in full: an operator rebuilds a leaf from its neighbour's template, changing the loopback and router ID but not the ASN. Every session comes up and every session dashboard is green, but the two leaves discard each other's routes, so the database servers behind one cannot reach the application servers behind the other, and nothing alarms until a customer notices. The fix takes a minute; detection takes as long as the gap between "sessions Established" and "every loopback reachable over every spine", the gap the platform should close.

## What the platform should show

An eBGP underlay moves the important facts from "is the session up" to "does every device hold every loopback over every spine, along the path the AS plan predicts". Surface:

- **The AS plan as data,** in the source of truth, and a check that every device runs its planned ASN and that leaf ASNs are unique (or deliberately shared, with allowas-in recorded).
- **Received, accepted and denied per session,** with the denial reason. "AS-path loop" on a leaf session is the duplicate-ASN or missing-allowas-in signature.
- **ECMP width per loopback,** against the number of spines that are up: 3 of 4 is a session down, 1 of 4 is a multipath setting.
- **AS-path shape.** Inside a 3-stage site every leaf-to-leaf path is exactly `65100 <origin leaf AS>` via a spine; anything longer is a valley, anything shorter is a cable that should not exist.
- **Unnumbered health:** BGP-enabled interfaces without a learned peer, and LLDP neighbours against the cabling plan.
- **Convergence as a measurement:** time from a link-down event to the last withdrawal received, from BMP (the BGP Monitoring Protocol, which streams every UPDATE a router receives), so "sub-second" is measured, not assumed.

The audit below runs those checks on one leaf's table, trimmed to six leaves on a 4-spine site:

```python
SPINE_AS = 65100
SPINES = {"spine1.ams", "spine2.ams", "spine3.ams", "spine4.ams"}
PLAN = {f"leaf{n}.ams": 65100 + n for n in range(1, 7)}       # trimmed to six leaves


def loopback(leaf):
    return f"10.255.1.{10 + int(leaf[4:leaf.index('.')])}/32"


def audit(reported_as, tables, denied):
    """reported_as: leaf -> AS it actually runs; tables: leaf -> {prefix: [(peer, AS_PATH)]}
    (the installed multipath set); denied: leaf -> routes dropped by the AS-path loop check."""
    out, by_as = [], {}
    for dev, asn in reported_as.items():
        by_as.setdefault(asn, []).append(dev)
        if asn != PLAN[dev]:
            out.append(f"{dev}: runs AS {asn}, plan says {PLAN[dev]}")
    for asn, devs in by_as.items():
        if len(devs) > 1:
            out.append(f"AS {asn} on {' and '.join(sorted(devs))}: each rejects the other's routes as loops")
    for dev, table in tables.items():
        for leaf in PLAN:
            if leaf == dev:
                continue
            pfx = loopback(leaf)
            paths = table.get(pfx, [])
            if not paths:
                hint = f" ({denied[dev]} routes denied as AS-path loops)" if denied.get(dev) else ""
                out.append(f"{dev}: no route to {leaf} {pfx}{hint}")
                continue
            want = (SPINE_AS, reported_as[leaf])
            good = [peer for peer, path in paths if peer in SPINES and tuple(path) == want]
            for peer, path in paths:
                if peer not in good:
                    out.append(f"{dev}: {pfx} via {peer} with AS_PATH {' '.join(map(str, path))}, "
                               f"expected {want[0]} {want[1]} via a spine")
            if len(good) < len(SPINES):
                out.append(f"{dev}: {pfx} is {len(good)}-way ECMP, expected {len(SPINES)}-way")
    return out


four_way = lambda origin: [(s, [65100, origin]) for s in sorted(SPINES)]
reported = dict(PLAN) | {"leaf5.ams": 65103}           # leaf5 rebuilt from leaf3's template
tables = {"leaf3.ams": {
    "10.255.1.11/32": four_way(65101),
    "10.255.1.12/32": four_way(65102)[:3],              # leaf2's session to spine4 is down
    "10.255.1.14/32": four_way(65104),
    "10.255.1.16/32": [("leaf6.ams", [65106])],         # a cable from leaf3 straight to leaf6
}}
for line in audit(reported, tables, denied={"leaf3.ams": 4}):
    print(line)
```

```text
leaf5.ams: runs AS 65103, plan says 65105
AS 65103 on leaf3.ams and leaf5.ams: each rejects the other's routes as loops
leaf3.ams: 10.255.1.12/32 is 3-way ECMP, expected 4-way
leaf3.ams: no route to leaf5.ams 10.255.1.15/32 (4 routes denied as AS-path loops)
leaf3.ams: 10.255.1.16/32 via leaf6.ams with AS_PATH 65106, expected 65100 65106 via a spine
leaf3.ams: 10.255.1.16/32 is 0-way ECMP, expected 4-way
```

Each line names a cause, not a symptom: a plan violation, a lost spine session, a duplicate ASN with the denial count that proves it, and a miscabled link whose one-hop path beat the four correct ones. An engineer wants those lines; a manager's view of the same data counts loopbacks reachable over full ECMP and turns yellow at 3 of 4.

## Interviewer follow-ups

**"Why IS-IS and not eBGP for your underlay?"** Model answer: eBGP suits one huge site and one team (one protocol, local failure handling, per-hop policy); IS-IS suits a multi-site domain (the full map, detours, metric draining, no AS plan across sites, an overlay kept separate). The deciding fact is the shape of the network and the team. Common wrong answer: "IS-IS converges faster" or "BGP is too slow". With fabric timers, link-down teardown and BFD, both converge in well under a second; the difference is architecture and operations, not speed.

**"Why do all the spines share one AS?"** Model answer: so that AS-path loop prevention rejects any path through two spines. That removes valley paths, which stops path hunting after a withdrawal, and gives leaves identical AS paths via every spine, so standard multipath installs all of them. Common wrong answer: "to save AS numbers". There are 95 million private 4-byte ASNs; the shared AS is about which paths exist.

**"What is allowas-in, and is it dangerous?"** Model answer: it lets a session accept paths containing the router's own ASN up to *N* times, for ASN reuse. With *N* = 1 under a tier that still rejects its own ASN it admits only the router's own routes coming back, which lose to local origination; with a large *N*, or nothing else bounding the path, real loops live longer. Common wrong answer: "it disables loop prevention", or "it's harmless".

**"How does an IPv4 packet get forwarded when the BGP next hop is an IPv6 link-local address?"** Model answer: the next hop only exists to find the egress port and the destination MAC. The extended-next-hop capability lets BGP carry IPv4 routes with an IPv6 next hop; IPv6 neighbour discovery maps that link-local to the peer's MAC; the kernel either installs the IPv6 gateway directly (Linux 5.2 and later) or uses a placeholder `169.254.0.1` with a static neighbour entry, and the ASIC gets an ordinary route. Common wrong answer: "the packet is converted to IPv6", or "the link needs an IPv4 address after all". An honest addition: "I'd defer to the network team on how a given ASIC SDK programs it, but I'd monitor BGP-enabled ports without a learned peer."

## What mid-level engineers get wrong

- **Treating Established as reachability.** In an eBGP underlay a session can be up with every route denied; the check is loopbacks reachable over every spine.
- **Giving each spine its own ASN "for clarity".** ECMP falls to one spine and withdrawals start path hunting.
- **Reusing one AS plan in every site without thinking about the seams.** Spine-to-spine sessions turn into iBGP and leaf routes from the other site are denied as loops.
- **Assuming unnumbered means "no addressing to get wrong".** It moves the risk to IPv6 being enabled and to cables, which addressing used to catch.

## Senior signals

- You state RFC 7938's design in one sentence: single-hop eBGP on every link, one AS for the spine tier, one per leaf, loopbacks and server subnets advertised, link subnets not.
- You explain the shared spine AS through its effects (no valleys, multipath intact, no path hunting), not as a convention.
- You know where allowas-in is needed, why *N* = 1 under a checking tier is benign, and that unique 4-byte ASNs avoid it.
- You can describe BGP unnumbered from the RA to the `169.254.0.1` neighbour entry, and name its new failure modes: IPv6 off on a port, sessions on miscabled links.
- You answer "why IS-IS and not eBGP?" both ways and land on the shape of the network and the team, not on speed.
- You put "every loopback over every spine with the planned AS path" on the dashboard, above session state.

## Check yourself

```quiz
- q: >-
    In an RFC 7938 fabric with both spines in AS 65100, leaf3.ams (AS 65103) re-advertises leaf1's loopback to spine2.ams with AS_PATH 65103 65100 65101. What does spine2.ams do with it?
  options: ["Keeps it as a backup path in case its direct link to leaf1 fails", "Prefers it, because a path through a leaf spreads load better", "Discards it, because its own AS 65100 is already in the path", "Installs it with the direct path as a two-way ECMP route"]
  answer: 2
  explanation: >-
    A router excludes any route whose AS_PATH contains its own ASN, and spine2 shares 65100 with spine1, so every path that passes through another spine is refused. That is the point of the shared spine AS: no spine-leaf-spine valley paths exist to fall back on, so a withdrawal is not followed by path hunting. Keeping it as a backup is what would happen with a unique ASN per spine. It could never be ECMP with the direct path anyway, being longer.
- q: >-
    An operator gives every spine its own ASN (65201, 65202, ...) and leaves the leaves at 65101 upwards, with default multipath settings. What changes for traffic between leaves?
  options: ["Traffic doubles, because valley paths are added to the ECMP set", "Each leaf uses one spine, because the paths' ASNs now differ", "Nothing, since all AS paths are still two ASNs long", "Leaves reject every route, because each spine's ASN repeats"]
  answer: 1
  explanation: >-
    Paths via spine1 and spine2 now read 65201 65101 and 65202 65101: the same length but different ASNs, and standard multipath requires identical AS paths, so the leaf installs one next hop until multipath relax is enabled. The paths are equally long, which is why the length argument is tempting, but length is not what multipath compares. Valley paths become possible at the spines, but they are longer and never enter a leaf's ECMP set.
- q: >-
    All Meridian leaves in a site are put in AS 65101 to simplify the plan. leaf3.ams's sessions to both spines are Established, yet it has no route to leaf1.ams's loopback. What is the most likely explanation?
  options: ["The spines are stripping 65101 from the path before sending it", "The routes arrive but are denied, since 65101 is already in the path", "The sessions need multihop because the leaves share an AS number", "The spines refuse to send routes to a leaf that shares their AS"]
  answer: 1
  explanation: >-
    leaf1's route reaches leaf3 as 65100 65101, and leaf3 is also 65101, so its loop check rejects it although nothing looped. The fix is allowas-in 1 on leaf3's sessions (or unique ASNs). The spines are in 65100 and send normally, nothing strips the AS, and the sessions are directly connected eBGP, so multihop is irrelevant.
- q: >-
    With BGP unnumbered, how does leaf1.ams learn the address of its peer on swp51?
  options: ["From an LLDP frame carrying the spine's loopback address", "From the IPv4 /31 configured on swp51, by taking the other address", "From the source of IPv6 router advertisements arriving on swp51", "From a DHCP lease that the spine hands out on each fabric port"]
  answer: 2
  explanation: >-
    Every IPv6 interface has a link-local address, and the spine's router advertisements to ff02::1 carry it as their source; BGP connects to that address on port 179, scoped to swp51. There is no /31 in an unnumbered design, which is the point, and neither DHCP nor LLDP is used to form the session, although LLDP is how you check that the cable goes where the plan says.
- q: >-
    A principal engineer asks why Meridian runs IS-IS rather than eBGP in its underlay. Which answer is strongest?
  options: ["eBGP cannot carry loopbacks, so a link-state protocol must do that", "eBGP needs a route reflector on every spine, which IS-IS does not", "IS-IS suits one domain across sites; eBGP suits one large site and team", "IS-IS converges faster, while eBGP takes seconds to react to failures"]
  answer: 2
  explanation: >-
    The choice follows the network's shape: a multi-site backbone run as one domain benefits from a full topology map, detours instead of drops, metric-based draining and no AS plan across sites, while a single huge data center gains from one protocol, local failure handling and policy at every hop. With fabric timers, link-down teardown and BFD both converge in well under a second, so speed is not the reason. eBGP carries loopbacks routinely and needs no reflectors, since eBGP re-advertises on its own.
```
