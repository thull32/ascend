---
slug: traffic-engineering-with-bgp
title: "Traffic engineering with BGP: the two-ISP problem"
description: The two-ISP interview question worked end to end on Meridian's edge, with LOCAL_PREF controlling traffic out, AS-path prepending, MED, upstream communities and more-specific prefixes influencing traffic in, why inbound can only be influenced, failover traced with timings, anycast services, and what to measure because you cannot control it.
minutes: 40
difficulty: medium
tags: [fabric-networking, bgp, traffic-engineering, local-pref, as-path-prepending, med, communities, more-specifics, anycast, multihoming, interview]
problems: [bgp-best-path, longest-prefix-match]
---
"You have two ISPs. Prefer ISP1 for traffic in both directions and fail over to ISP2 if ISP1 goes away. How?" Network organisations ask some form of this in almost every BGP interview, and the strong answer turns on one asymmetry. Traffic *leaving* your network follows a decision your routers make, so one attribute controls it exactly. Traffic *arriving* follows decisions made by every other network, each with its own policy, so you can only change what you tell them and measure what they do. A strong answer gives each direction its own tool, says which networks each tool cannot reach, and proves the backup works before it is needed.

A reminder of the vocabulary ([what BGP is for](/learn/fabric-networking/bgp-fundamentals/what-bgp-is-for)): an **AS** (autonomous system) is a network under one routing policy, identified by its AS number; BGP between two ASes is **eBGP**, BGP between routers of the same AS is **iBGP**, and the **IGP** (interior gateway protocol, IS-IS at Meridian) supplies the internal path costs. Meridian is AS 64500 and announces `203.0.113.0/24`, its public address block in Amsterdam. Border gateway `gw1.ams` (loopback `10.255.1.201`) connects to ISP1 (AS 64501) and `gw2.ams` (`10.255.1.202`) to ISP2 (AS 64502), and the two gateways run iBGP with each other. All AS numbers and public prefixes here come from the ranges reserved for documentation (AS 64496–64511 by RFC 5398; `192.0.2.0/24`, `198.51.100.0/24` and `203.0.113.0/24` by RFC 5737; `2001:db8::/32` by RFC 3849). The decision process used throughout is in [the best-path algorithm](/learn/fabric-networking/bgp-fundamentals/the-best-path-algorithm); the match-and-set policy that implements it is in [policy and communities](/learn/fabric-networking/bgp-in-the-real-world/policy-and-communities).

## The setup: what Meridian buys and why it cares

**Transit** is the service an ISP sells: carry my traffic to the whole internet and announce my prefixes to it. The buyer is the ISP's **customer**, the ISP its **provider** or upstream. Two networks that exchange only their own customers' traffic, without payment, are **peers** ([how the internet is glued together](/learn/fabric-networking/bgp-in-the-real-world/how-the-internet-is-glued-together)). A network with more than one upstream is **multihomed**. **Egress** (outbound) is traffic leaving Meridian; **ingress** (inbound) is traffic arriving.

Why prefer one ISP? Usually money and quality. Transit is commonly billed at the **95th percentile**: the provider samples the port's rate every 5 minutes, sorts the month's 8,640 samples, discards the top 5% (432 samples, 36 hours) and bills the highest remaining rate, typically the higher of the two directions, against a committed rate. Meridian commits 10 Gb/s to ISP1 at a good price and 1 Gb/s to ISP2, so ISP2 must stay nearly idle except during an outage.

The topology used here, which the visualisation and the code below share:

| Network | AS | Relationship | Notes |
|---|---|---|---|
| Meridian | 64500 | customer of ISP1 and ISP2 | announces `203.0.113.0/24` |
| ISP1 | 64501 | Meridian's preferred provider | peers with ISP2 |
| ISP2 | 64502 | Meridian's backup provider | gives customer routes LOCAL_PREF 200, peer routes 100, its own transit routes 80 |
| Content network | 64511 | customer of both ISPs | announces `192.0.2.0/24`; Meridian's users fetch from it |
| Broadband network | 64503 | customer of ISP2 only | its subscribers are Meridian's users |
| Enterprise | 64504 | customer of both ISPs | prefers ISP2 (LOCAL_PREF 120) because that port is flat-rate |

Without any policy, traffic splits both ways. Outbound, each gateway prefers its own ISP's route, and leaves pick whichever gateway is nearer. Inbound, AS 64511 sees two paths of equal length and its final tie-breaker happens to favour ISP2; the broadband network can only use ISP2; the enterprise prefers ISP2 on cost. Meridian pays ISP2 for traffic it wanted on ISP1.

```viz
{"type": "fabric", "scenario": "two-isp-te", "title": "Two ISPs: LOCAL_PREF pins traffic out, prepending, a community and more-specifics pull traffic in, then ISP1 fails", "caption": "AS 64500 with gw1.ams on ISP1 and gw2.ams on ISP2. Without policy traffic leaves by both gateways; LOCAL_PREF 200 on ISP1's routes makes every router exit via gw1. AS 64511's return traffic arrives via ISP2 until gw2 prepends 64500 twice; ISP2 itself keeps its customer route until Meridian tags it with ISP2's community 64502:70; two /25s announced only to ISP1 win by longest-prefix match. Then the gw1–ISP1 fibre is cut, both directions fall back to ISP2, and the closing table names who decides each direction."}
```

## Egress: LOCAL_PREF is exact control

**LOCAL_PREF** (local preference) is a 4-byte path attribute set by import policy on the router where a route enters the AS. Higher is preferred, the usual default is 100, and it is the first attribute the standard decision process compares (Cisco's "weight" comes before it but never leaves one router). It travels on every iBGP session, so every router in the AS sees the same value, and RFC 4271 forbids sending it to an external peer, which keeps it a purely internal decision.

`gw1.ams` gets one rule of import policy: every route learned from ISP1 gets LOCAL_PREF 200. Before the rule, `gw2.ams` holds two paths to AS 64511's `192.0.2.0/24`. Both have LOCAL_PREF 100, AS_PATH length 2 and origin IGP; MED is not compared because the paths come from different neighbouring ASes; the next step, eBGP over iBGP, keeps its own ISP2 path. After the rule (illustrative output):

```text
gw2.ams# show bgp ipv4 unicast 192.0.2.0/24        (illustrative output)
Paths: 2 available, best #1
  64501 64511
    10.255.1.201 (IGP metric 20) from 10.255.1.201
      Origin IGP, localpref 200, valid, internal, best
  64502 64511
    198.51.100.0 from 198.51.100.0 (10.250.0.1)
      Origin IGP, localpref 100, valid, external
```

The comparison stops at the first step: 200 beats 100, so `gw2.ams` forwards outbound traffic across the fabric to `gw1.ams`. The next hop is `gw1.ams`'s loopback because `gw1.ams` rewrites the next hop to itself (next-hop-self) on iBGP; without that, `gw2.ams` would need a route to ISP1's link address, and an unresolvable next hop makes the route unusable ([iBGP, loops and next hops](/learn/fabric-networking/bgp-fundamentals/ibgp-loops-and-next-hops)).

Three production details:

- **The fabric reaches the gateways by a default route.** Leaves do not carry the internet table. If both gateways originate `0.0.0.0/0` into the fabric, half the outbound flows reach `gw2.ams` first and cross the fabric again to `gw1.ams`; so `gw1.ams` originates it with a better metric, or `gw2.ams` only while ISP1's routes are absent.
- **gw1.ams has no pre-learned backup.** `gw2.ams`'s best path is now the iBGP one, so it advertises nothing about ISP2's routes to `gw1.ams`; on failure it must first select its eBGP paths and send them. Advertise-best-external and ADD-PATH (RFC 7911) pre-load the backup ([convergence and scale](/learn/fabric-networking/bgp-in-the-real-world/convergence-and-scale)).
- **"Everything via ISP1" can be refined.** Traffic to ISP2's own customers now crosses the ISP1–ISP2 peering, which may be congested. A common refinement gives ISP2's direct customers' routes (AS_PATH of ISP2 plus one AS, or the provider's own "learned from customer" community) LOCAL_PREF 250.

How much table to accept is a separate trade-off:

| Option | Routes per gateway | Egress precision | Failure it hides |
|---|---|---|---|
| Default route from each ISP, LOCAL_PREF on ISP1's | 2 | None: all traffic to ISP1 | An ISP1 that lost part of the internet still attracts everything |
| Default plus each ISP's customer routes ("partial") | thousands to hundreds of thousands, by the ISP's size | ISP2's customers go direct | Smaller, but the same for the rest |
| Full table from both | about a million IPv4 plus around 200,000 IPv6 (mid-2020s) | Per prefix | None of the above; costs forwarding-table (FIB) space and CPU on every churn |

**What LOCAL_PREF solves:** exact, AS-wide choice of exit. **How it breaks:** the policy is applied on one gateway and not the other after a change, iBGP between the gateways is down so each uses its own ISP, or the next hop does not resolve. **Signal:** egress bytes per ISP port against intent ("ISP1 at least 90%"), and the LOCAL_PREF of the best path for a few canary prefixes on every border router.

## Ingress: a different kind of problem

For inbound traffic the deciders are AS 64511, AS 64503, AS 64504, ISP1, ISP2 and every other network with users. Meridian sets nothing in their routers. It controls only three things: **which prefixes** it announces, **to which neighbour**, and **with which attributes**. Every ingress tool is one of those three, and each acts at a different step of someone else's decision:

| Step in a remote router's decision | Meridian's tool that acts there | Reaches |
|---|---|---|
| Longest-prefix match, before BGP compares anything ([the routing table](/learn/fabric-networking/from-zero/the-routing-table)) | Announce a more-specific prefix to one ISP only | Every network that accepts the more-specific |
| LOCAL_PREF, the remote network's own preference | An upstream's published community | That upstream, and all traffic entering it |
| AS_PATH length | Prepending | Networks whose LOCAL_PREF ties |
| MED | MED | One neighbour AS with several links to Meridian |
| IGP cost to the exit (hot potato), router ID | none | — |

The earlier the step, the stronger the tool, and the more it costs other people. That table is the answer to the interview question; the sections below take each row apart.

## AS-path prepending

**Prepending** repeats your own AS number in the AS_PATH you send to one neighbour. Path length is compared right after LOCAL_PREF in every router's decision, so the path through that neighbour looks longer. `gw2.ams` prepends twice towards ISP2. The AS_PATH attribute in that UPDATE (4-byte AS numbers, the normal case since RFC 6793):

| Field | Size | Value here | What reads it |
|---|---|---|---|
| Attribute flags | 1 byte | `0x40`: well-known, transitive | Receiver's parser |
| Type code | 1 byte | 2 (AS_PATH) | Receiver's parser |
| Length | 1 byte | 14 | Receiver's parser |
| Segment type | 1 byte | 2 (AS_SEQUENCE, an ordered list) | Loop check and length count |
| Segment length | 1 byte | 3 (AS numbers in the segment) | Length count |
| AS numbers | 12 bytes | 64500 64500 64500 | ISP2's loop check (its own 64502 is absent, so accepted); every router's length comparison |

ISP2 adds its own number when it passes the route on, so AS 64511 now compares `64501 64500` (length 2) with `64502 64500 64500 64500` (length 4) and moves to ISP1. The other networks do not move:

- **ISP2 itself.** It holds the prepended customer route at LOCAL_PREF 200 and the path via its peer ISP1 at 100. LOCAL_PREF is compared before length, so ISP2 keeps delivering directly to `gw2.ams`, and so does everything that enters ISP2.
- **AS 64503,** single-homed to ISP2. It has one path; length is irrelevant.
- **AS 64504,** which prefers ISP2 at LOCAL_PREF 120. Its comparison never reaches path length.

The general rule: prepending moves only networks whose LOCAL_PREF ties, and providers set LOCAL_PREF by relationship (customer over peer over provider) precisely so that path length rarely decides. Each extra copy moves less; past three or so it mostly makes the prepended path easy to beat, so a leak or hijack with a shorter path wins wherever it competes only with that path ([leaks, hijacks and RPKI](/learn/fabric-networking/bgp-in-the-real-world/leaks-hijacks-and-rpki)). Prepend only your own AS: inserting another network's number makes that network reject the route as a loop ("path poisoning").

**What prepending solves:** shifting multihomed networks whose policy ties. **How it breaks:** it does nothing to the backup ISP itself, its single-homed customers, or anyone with a LOCAL_PREF preference. **Signal:** inbound share per ISP before and after, and the AS paths that public **route collectors** (RIPE RIS, RouteViews: routers that peer with hundreds of networks and publish what they receive) show for your prefix.

## MED: for one neighbour with several doors

**MED** (MULTI_EXIT_DISC) is a 4-byte optional, non-transitive attribute. Meridian sends it to a neighbour AS to say which of several links between them it would rather receive traffic on; lower is better. The neighbour compares MED, after LOCAL_PREF, path length and origin, only among paths learned from the *same* neighbouring AS, and does not pass it on. So it cannot help with two ISPs: their paths come from different ASes and no router compares their MEDs.

Where MED belongs: Meridian also buys from ISP1 in Singapore, through `gw1.sin` (`10.255.2.201`), and announces `203.0.113.0/24` there too so the block survives losing Amsterdam's circuits. Without MED, each ISP1 router delivers to its nearest Meridian door by IGP cost (**hot-potato routing**: hand traffic over as early as possible). ISP1's Tokyo router hands it over in Singapore, and Meridian carries it about 10,500 km to Amsterdam on its own long-haul circuit, 52 ms one way at 5 µs per km. With MED 10 from `gw1.ams` and MED 100 from `gw1.sin`, every ISP1 router with otherwise equal paths prefers the Amsterdam door before reaching the IGP-cost step, and ISP1 carries the traffic across its own backbone (**cold-potato** routing for ISP1).

That costs ISP1 backbone capacity, so many providers honour MED only by contract. Three rules bite:

- **A missing MED counts as 0, the best** (RFC 4271), unless the router is configured to treat missing as worst. A forgotten MED on one session silently wins.
- **The result can depend on arrival order.** Comparing MED only within one neighbour AS makes the decision non-transitive; with route reflectors this can oscillate forever (RFC 3345). Implementations group paths by neighbour AS first ("deterministic MED"), or compare MED across all ASes ("always compare MED"), which is only meaningful when every neighbour sets MED on the same scale.
- **MED copied from IGP metrics churns.** Every internal cost change becomes an UPDATE to the neighbour.

**What MED solves:** choosing between several links to one neighbour AS. **How it breaks:** ignored by the neighbour, treated as 0 when missing, or oscillating with reflectors. **Signal:** inbound bytes per door to that neighbour, against the MEDs you advertise.

## Upstream communities: borrowing the provider's LOCAL_PREF

A **community** is a 4-byte tag, written `ASN:value`, attached to a route ([policy and communities](/learn/fabric-networking/bgp-in-the-real-world/policy-and-communities) has the types and the well-known ones). Transit providers publish communities that customers may attach to trigger the provider's own policy, a practice RFC 1998 described in 1996. Real menus are long; a typical one:

| Community (ISP2's scheme) | Action inside AS 64502 |
|---|---|
| 64502:70, 64502:80, 64502:90 | Set this customer route's LOCAL_PREF to 70, 80 or 90 (default 200 for customers) |
| 64502:1xyz | Prepend x times towards peer or region yz |
| 64502:0 or 64502:9yz | Do not announce to anyone, or to peer yz |
| 65535:666 (BLACKHOLE, RFC 7999) | Drop traffic to this prefix (usually one attacked /32) at the provider's edge |

One large transit provider (AS 3356) documents 3356:70 for "set LOCAL_PREF 70", among others. Meridian tags its prepended announcement with 64502:70. The COMMUNITIES attribute it adds:

| Field | Size | Value here | What reads it |
|---|---|---|---|
| Attribute flags | 1 byte | `0xC0`: optional, transitive | Receiver's parser |
| Type code | 1 byte | 8 (COMMUNITIES) | Receiver's parser |
| Length | 1 byte | 4 (one community) | Receiver's parser |
| Community | 4 bytes | `fb f6 00 46` (64502:70) | ISP2's import policy, which matches it and sets LOCAL_PREF |

ISP2's table then reads (illustrative output from ISP2's looking glass, a public web page where a network shows its routers' BGP view):

```text
ISP2 looking glass: 203.0.113.0/24                     (illustrative output)
  Path                 Next hop        LocPref  Communities
* 64501 64500          ISP1 peering    100                     <- best
  64500 64500 64500    gw2.ams         70       64502:70
```

70 is below ISP2's peer value of 100, so ISP2 delivers Meridian's traffic over its peering with ISP1, and so does everything that enters ISP2: AS 64503's subscribers and AS 64504's preferred port. Standard communities hold a 2-byte AS number; providers with 4-byte AS numbers use large communities (RFC 8092, `ASN:value:value`).

A consequence that catches operators: while ISP1 is up, the direct path to `gw2.ams` is no longer ISP2's best, so ISP2 advertises it to nobody. No public route collector can show that the backup exists. It lives only in ISP2's table, which you check through ISP2's looking glass, or by a planned failover drill.

**What communities solve:** reaching the one step prepending cannot, the provider's own LOCAL_PREF. **How it breaks:** a typo or an unpublished value is silently ignored; the provider changes its scheme; a provider strips communities it does not recognise. **Signal:** the provider's looking glass showing the expected LOCAL_PREF, and inbound share on that port.

## More-specific announcements

Longest-prefix match runs before any BGP attribute: a router holding `203.0.113.0/24` and `203.0.113.0/25` forwards `203.0.113.10` by the `/25`, whatever the LOCAL_PREF or path length of each ([the routing table](/learn/fabric-networking/from-zero/the-routing-table)). A longer mask is *more* specific: a `/25` is more specific than a `/24`, a `/16` less. `gw1.ams` announces both halves, `203.0.113.0/25` and `203.0.113.128/25`, to ISP1 only, and the `/24` to both. Every network that accepts the halves sends Meridian's traffic to ISP1, ISP2 included: its best path for the `/24` stays the direct customer route, yet its forwarding table sends `203.0.113.10` by the `/25` from ISP1. Best path and forwarding answer different questions. The `/24` to both makes it failover-safe: if ISP1 fails, the halves go with it and the `/24` via ISP2 carries everything.

The catch: most networks drop IPv4 announcements longer than `/24` and IPv6 longer than `/48`, a widely enforced convention that bounds the global table. A `/25` reaches ISP1, which accepts it from its customer, and few networks beyond. In production the trick needs a block twice as large: a network holding a `/23` announces the `/23` to both ISPs and its two `/24`s to the preferred one only. IPv6 has room: Meridian announces `2001:db8::/32` to both and `2001:db8::/33` plus `2001:db8:8000::/33` to ISP1.

The costs fall on others and on you:

- **Table growth.** Every more-specific is a row in every full-table router on the internet. More than half of the roughly one million IPv4 routes are already `/24`s.
- **RPKI.** A ROA (route origin authorisation, a signed statement of which AS may originate a prefix and up to what length) for `203.0.113.0/24` with maximum length 24 makes the halves *invalid*, and validating networks drop them ([leaks, hijacks and RPKI](/learn/fabric-networking/bgp-in-the-real-world/leaks-hijacks-and-rpki)). Publish ROAs for exactly the prefixes you announce; a loose maximum length lets a forger announce more-specifics with your origin (RFC 9319).
- **Origination must follow health.** If `gw1.ams` originates the halves statically and loses its fabric links while the ISP1 session stays up, all of Meridian's inbound traffic goes to a gateway that cannot deliver it. Originate them only while the servers behind them are reachable.

**What more-specifics solve:** the one lever every accepting network obeys. **How it breaks:** filtered beyond the first hop, rejected by RPKI, or left announced from a gateway that cannot deliver. **Signal:** which prefixes public route collectors see, per origin and length.

## The whole design in code

The simulation below propagates Meridian's announcements across the six networks with the export rule providers actually use (routes from customers go to everyone; routes from peers and providers only to customers), the LOCAL_PREF scheme from the setup table and a lowest-router-ID tie-break, then walks a packet for `203.0.113.10` from each user network, one longest-prefix match per AS.

```python
import ipaddress

CUSTOMER, PEER, PROVIDER = "customer", "peer", "provider"
LP_BY_ROLE = {CUSTOMER: 200, PEER: 100, PROVIDER: 80}   # every AS here uses this scheme
INVERSE = {CUSTOMER: PROVIDER, PROVIDER: CUSTOMER, PEER: PEER}
MERIDIAN, ISP1, ISP2 = 64500, 64501, 64502
NAMES = {64500: "Meridian", 64501: "ISP1", 64502: "ISP2", 64511: "content 64511",
         64503: "broadband 64503", 64504: "enterprise 64504"}
ROUTER_ID = {64501: "10.250.1.1", 64502: "10.250.0.1"}   # final tie-break: lowest wins
LOCAL_POLICY = {(64504, ISP2): 120}   # 64504 prefers its cheaper flat-rate ISP2 port


def topology(isp1_link_up=True):
    roles = {}                        # roles[a][b] = what b is to a

    def link(a, b, role_of_b):
        roles.setdefault(a, {})[b] = role_of_b
        roles.setdefault(b, {})[a] = INVERSE[role_of_b]

    if isp1_link_up:
        link(MERIDIAN, ISP1, PROVIDER)
    link(MERIDIAN, ISP2, PROVIDER)
    link(ISP1, ISP2, PEER)
    for stub, providers in {64511: [ISP1, ISP2], 64503: [ISP2], 64504: [ISP1, ISP2]}.items():
        for p in providers:
            link(stub, p, PROVIDER)
    return roles


def local_pref(asn, nbr, role, communities):
    if asn == ISP2 and role == CUSTOMER and "64502:70" in communities:
        return 70                     # ISP2's published "backup customer" community
    return LOCAL_POLICY.get((asn, nbr), LP_BY_ROLE[role])


def select(asn, rib_in, roles):
    """Best route per prefix: highest LOCAL_PREF, shortest AS_PATH, lowest router ID."""
    best = {}
    for (prefix, nbr), (path, comms) in rib_in.items():
        if asn in path:
            continue                  # AS_PATH loop detection
        lp = local_pref(asn, nbr, roles[asn][nbr], comms)
        key = (-lp, len(path), ipaddress.ip_address(ROUTER_ID.get(nbr, "0.0.0.0")))
        if prefix not in best or key < best[prefix][0]:
            best[prefix] = (key, nbr, path, lp)
    return {p: {"via": v[1], "path": v[2], "lp": v[3]} for p, v in best.items()}


def export(asn, nbr, prefix, best, roles, announce):
    if asn == MERIDIAN:
        if nbr not in announce.get(prefix, {}):
            return None
        prepends, comms = announce[prefix][nbr]
        return (MERIDIAN,) * (1 + prepends), frozenset(comms)
    b = best[asn].get(prefix)
    if b is None or b["via"] == nbr:
        return None
    learned_from = roles[asn][b["via"]]
    if learned_from != CUSTOMER and roles[asn][nbr] != CUSTOMER:
        return None                   # peer and provider routes go to customers only
    return (asn,) + b["path"], frozenset()   # ISP2 strips its action communities


def simulate(announce, isp1_link_up=True):
    roles = topology(isp1_link_up)
    rib_in = {asn: {} for asn in roles}
    prefixes = list(announce)
    for _ in range(50):               # Gao-Rexford policies converge; the cap is a guard
        best = {asn: select(asn, rib_in[asn], roles) for asn in roles}
        best[MERIDIAN] = {}
        changed = False
        for asn in roles:
            for nbr in roles[asn]:
                for prefix in prefixes:
                    route = export(asn, nbr, prefix, best, roles, announce)
                    key = (prefix, asn)
                    if rib_in[nbr].get(key) != route:
                        changed = True
                        if route is None:
                            rib_in[nbr].pop(key, None)
                        else:
                            rib_in[nbr][key] = route
        if not changed:
            return best
    raise RuntimeError("did not converge")


def walk(src, dst, best):
    """Hop-by-hop: each AS does longest-prefix match in its own table."""
    hops, asn = [src], src
    while asn != MERIDIAN and len(hops) < 8:
        matches = [p for p in best[asn] if ipaddress.ip_address(dst) in ipaddress.ip_network(p)]
        if not matches:
            return hops, "no route"
        prefix = max(matches, key=lambda p: ipaddress.ip_network(p).prefixlen)
        asn = best[asn][prefix]["via"]
        hops.append(asn)
    return hops, "gw1.ams" if hops[-2] == ISP1 else "gw2.ams"


BOTH = {ISP1: (0, []), ISP2: (0, [])}
PREPEND = {ISP1: (0, []), ISP2: (2, [])}
PREPEND_COMM = {ISP1: (0, []), ISP2: (2, ["64502:70"])}
HALVES = {"203.0.113.0/25": {ISP1: (0, [])}, "203.0.113.128/25": {ISP1: (0, [])}}
steps = [
    ("1 plain /24 to both", {"203.0.113.0/24": BOTH}, True),
    ("2 prepend x2 to ISP2", {"203.0.113.0/24": PREPEND}, True),
    ("3 prepend + 64502:70", {"203.0.113.0/24": PREPEND_COMM}, True),
    ("4 /25s to ISP1 only", {"203.0.113.0/24": BOTH, **HALVES}, True),
    ("5 all of it, ISP1 cut", {"203.0.113.0/24": PREPEND_COMM, **HALVES}, False),
]
for label, announce, up in steps:
    best = simulate(announce, up)
    print(f"step {label}: ISP2's best /24 is via {NAMES[best[ISP2]['203.0.113.0/24']['via']]}"
          f" (LOCAL_PREF {best[ISP2]['203.0.113.0/24']['lp']})")
    for src in (64511, 64503, 64504):
        hops, entry = walk(src, "203.0.113.10", best)
        print(f"   {NAMES[src]:<17} {' > '.join(str(h) for h in hops):<30} enters at {entry}")
```

```text
step 1 plain /24 to both: ISP2's best /24 is via Meridian (LOCAL_PREF 200)
   content 64511     64511 > 64502 > 64500          enters at gw2.ams
   broadband 64503   64503 > 64502 > 64500          enters at gw2.ams
   enterprise 64504  64504 > 64502 > 64500          enters at gw2.ams
step 2 prepend x2 to ISP2: ISP2's best /24 is via Meridian (LOCAL_PREF 200)
   content 64511     64511 > 64501 > 64500          enters at gw1.ams
   broadband 64503   64503 > 64502 > 64500          enters at gw2.ams
   enterprise 64504  64504 > 64502 > 64500          enters at gw2.ams
step 3 prepend + 64502:70: ISP2's best /24 is via ISP1 (LOCAL_PREF 100)
   content 64511     64511 > 64501 > 64500          enters at gw1.ams
   broadband 64503   64503 > 64502 > 64501 > 64500  enters at gw1.ams
   enterprise 64504  64504 > 64502 > 64501 > 64500  enters at gw1.ams
step 4 /25s to ISP1 only: ISP2's best /24 is via Meridian (LOCAL_PREF 200)
   content 64511     64511 > 64501 > 64500          enters at gw1.ams
   broadband 64503   64503 > 64502 > 64501 > 64500  enters at gw1.ams
   enterprise 64504  64504 > 64502 > 64501 > 64500  enters at gw1.ams
step 5 all of it, ISP1 cut: ISP2's best /24 is via Meridian (LOCAL_PREF 70)
   content 64511     64511 > 64502 > 64500          enters at gw2.ams
   broadband 64503   64503 > 64502 > 64500          enters at gw2.ams
   enterprise 64504  64504 > 64502 > 64500          enters at gw2.ams
```

Read it as a ladder. Step 2: prepending moved only AS 64511, whose LOCAL_PREF tied. Step 3: the community changed ISP2's own LOCAL_PREF, so the two networks behind ISP2 now cross the ISP1–ISP2 peering. Step 4 shows the more-specifics doing everything alone, with ISP2's best `/24` path still pointing at `gw2.ams`. Step 5: with ISP1 gone, the LOCAL_PREF 70 route, prepended and least preferred, is the only one left and carries everything; less preferred never means unusable. Trace AS 64504 at step 3 by hand: it compares `64501 64500` at LOCAL_PREF 80 with `64502 64501 64500` at 120, keeps ISP2, and ISP2's best is via ISP1, so the traffic arrives at `gw1.ams` one network later than it could have. `export` strips communities to keep the model short; real providers often pass them on.

## Failover, worked with timings

The fibre between `gw1.ams` and ISP1 is cut at t = 0.

| Time | Event | Egress | Ingress |
|---|---|---|---|
| ~0 ms | Loss of light on both ends; both drop the eBGP session at once | Packets to ISP1 lost | ISP1's routers still send to the dead link |
| ~1 s (tens of seconds for a full table without precomputed backups) | `gw1.ams` withdraws ISP1's routes over iBGP; `gw2.ams` selects its own eBGP paths and advertises them | Moved to ISP2 | |
| ~1 s | ISP1 withdraws the `/25`s and its `/24` path from its peers and customers | | ISP1's own customers move first |
| seconds to minutes | Withdrawals spread hop by hop; some routers first try stale longer paths (path hunting), and each of those announcements can wait up to the minimum route advertisement interval, MRAI (RFC 4271 suggests 30 s on eBGP; several implementations now default to 0) | | Remote networks move to the `/24` via ISP2 |

Inbound recovers more slowly than outbound because it waits for other networks ([convergence and scale](/learn/fabric-networking/bgp-in-the-real-world/convergence-and-scale)). If the failure leaves the light on, for example ISP1's router dies behind a carrier switch, nothing happens until a hold timer expires: 60 to 90 s after the failure with the 90 s hold time RFC 4271 suggests (the last keepalive arrived up to 30 s before it), during which 45 to 68 GB of Meridian's 6 Gb/s of inbound traffic is lost; platforms that default to 180 s double that. BFD (Bidirectional Forwarding Detection, a fast hello) at 300 ms × 3 cuts detection to about 0.9 s ([convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd); hold timers are in [BGP sessions and the FSM](/learn/fabric-networking/bgp-fundamentals/bgp-sessions-and-the-fsm)).

Failback needs as much care. When the circuit returns, everything snaps back to ISP1 within seconds. A circuit flapping every few minutes makes Meridian's prefixes flap across the internet, and networks running route-flap damping may then suppress them for up to an hour. Operators delay re-announcing the halves until the session has been stable for several minutes. The bill has its own threshold: a failover longer than the 36 discarded hours sets ISP2's 95th percentile (worked in "What the platform should show").

## Anycast services

**Anycast** announces the same prefix from several places and lets BGP deliver each sender to one of them. Meridian runs DNS resolvers at the same address in `ams`, `sin` and `sjc`, announcing `2001:db8:53::/48` from each site's gateways (`gw1.sin` and `gw1.sjc` follow the same naming as Amsterdam); an IPv4 service needs a `/24` of its own, for the filtering reason above. Each remote network picks one announcement by its own decision process; the senders that reach a site are its **catchment**. The root DNS has 13 named servers with well over a thousand anycast instances between them, and CDNs and public resolvers work the same way ([CDNs and edge](/learn/networking/application-protocols/cdns-and-edge)).

- **The catchment follows BGP, not geography.** A Singapore broadband network whose preferred provider connects to Meridian only in Amsterdam sends its users' queries to `ams`: 10,500 km, over 100 ms per query instead of a couple of milliseconds. The same tools apply per site: prepend at `ams` towards that provider, use its communities, or buy the same transit at every site so path lengths compare like for like.
- **Routing is per packet; TCP is not.** A routing change mid-connection moves a TCP flow to a site with no state for it, which answers with a reset. DNS over UDP does not care. CDNs anycast TCP successfully because route changes are rare compared with connection lifetimes; some anycast only to pick a site, then hand out a unicast address.
- **Health must drive the announcement.** A site whose resolvers died while its gateway still announces black-holes its whole catchment. So each resolver runs a small BGP speaker that announces the service address to its leaf while a local health check passes; the leaf spreads queries over the servers by ECMP ([ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)), and the gateways announce the `/48` only while at least one server is healthy.
- **A shared health dependency withdraws everything at once.** In October 2021 Facebook's DNS servers withdrew their anycast prefixes because they could no longer reach Facebook's data centers, a check designed to take one sick site out. A backbone change had cut every site at once, so every site withdrew and the names vanished worldwide ([leaks, hijacks and RPKI](/learn/fabric-networking/bgp-in-the-real-world/leaks-hijacks-and-rpki)).

**What anycast solves:** nearest-site selection and site failover with no client logic. **How it breaks:** catchments that follow policy rather than distance, TCP resets on route changes, announcements that outlive the service, or correlated withdrawal. **Signal:** per-site query rates and latency from many external vantage points (RIPE Atlas probes, for example), and which site answered (a CHAOS-class `hostname.bind` query or the EDNS NSID option, RFC 5001, makes the server name itself).

## What you cannot control

Name the edge of control precisely; it is where operators stop configuring and start measuring:

- **Other networks' LOCAL_PREF.** Customer over peer over provider, cost, contracts. Only the provider's own communities reach it, and only inside that provider.
- **Their filters.** Prefix-length limits, RPKI validation, IRR-based filters (built from the public Internet Routing Registries, where networks record which AS originates which prefix). If ISP2's peers build their filters from the IRR and no record for your prefix exists, they drop it, and the backup reaches only ISP2's own customers.
- **Senders' own exits.** A content network hands traffic over at the exit nearest its servers (hot potato), and the largest CDNs and clouds choose where to send from by measurement and DNS answers, not only AS path; prepending barely moves them, and the working tools are peering, a conversation, or their communities.
- **Congestion between other networks.** Step 3 above put AS 64503's traffic on the ISP1–ISP2 peering. If that link is full, Meridian sees loss that it cannot fix and has no counter for.
- **Convergence timing, damping and return paths.** Every network applies its own timers, and the path your reply takes is chosen by someone else: asymmetric routing is normal.

So the honest design is a loop: change an announcement, measure inbound per ISP and per source network, repeat.

## Failure modes in production

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Backup not actually announced | Months of normal operation, then a total inbound outage when ISP1 fails | ISP2's looking glass has no path learned from Meridian; the Adj-RIB-Out to ISP2 is empty after a filter change | Diff announcements per session against intent continuously; run failover drills |
| More-specifics filtered beyond ISP1 | Prepending and halves deployed, ingress share barely moves | Route collectors show the `/25`s only in ISP1's own path, or nowhere | Use `/24`s out of a `/23`, or communities |
| ROA maximum length too short | RPKI-validating networks ignore the halves and fall back to the `/24`'s policy; ingress share drifts | RPKI validator marks `203.0.113.0/25` invalid | Publish exact ROAs for each announced prefix |
| Asymmetry through stateful devices | Out via ISP1, in via ISP2: connections through a per-gateway firewall stall after the SYN | The SYN-ACK arrives at a firewall that never saw the SYN; its drop counters rise | Synchronise state between firewalls, or keep both directions on one gateway |
| Strict reverse-path filtering at ISP1 | Meridian's outbound traffic to ISP1 dropped during a maintenance that stopped announcing to ISP1 | ISP1 discards packets whose source it does not route back to that port (strict uRPF) | Never egress via an ISP you are not announcing to; withdraw egress first |
| Halves announced from a gateway that cannot deliver | All inbound traffic black-holed while ISP1's session is up | `gw1.ams` lost its fabric uplinks; its static origination stayed | Originate conditionally on internal reachability |
| Silent ISP1 failure | 60–180 s of loss before failover | Interface up, hold timer expiry in the logs | BFD on edge sessions |

## Trade-offs: the tools side by side

| Tool | Direction | Who it moves | Strength | Cost to others | Proof it worked |
|---|---|---|---|---|---|
| LOCAL_PREF | Out | Every router in your AS | Exact | None | Egress bytes per port |
| Prepending | In | Multihomed networks whose LOCAL_PREF ties | Weak | Longer paths in routing tables | Collectors' paths; inbound share |
| MED | In | One neighbour with several links | Moderate, if honoured | That neighbour's backbone carries more | Inbound per door |
| Upstream community | In | The provider and everything behind it | Strong, one provider at a time | None | Provider looking glass |
| More-specifics | In | Every network that accepts them | Strongest | Global table growth; RPKI work | Collectors' prefixes |
| Announce to ISP1 only | In | Everyone | Total, but no backup until a conditional announcement fires | None | Collectors' paths |

## Under the hood: where a router does this

On a BGP router each received UPDATE lands in the Adj-RIB-In for that session; import policy runs per route, matching on prefix, AS path or community and setting LOCAL_PREF; the decision process picks a best path into the Loc-RIB; and export policy per neighbour builds the Adj-RIB-Out, where prepending and communities are added ([UPDATEs, attributes and RIBs](/learn/fabric-networking/bgp-fundamentals/updates-attributes-and-ribs)). Routers group neighbours with identical export policy and build each UPDATE once per group. Changing an import policy needs the peer's routes again, which ROUTE-REFRESH requests without resetting the session, so a policy push is not an outage. A changed export policy only needs new UPDATEs. A more-specific is a separate route all the way down to the forwarding table, which is why it overrides attributes: the forwarding chip never sees LOCAL_PREF, only the longest match.

## What the platform should show

The engineer asks "is traffic where we want it?"; the manager asks "are we protected if ISP1 fails, and what does it cost?". The same data answers both:

- **Bytes per ISP port, per direction, against intent,** from interface counters plus flow samples (sFlow or IPFIX) for the top source and destination networks. "Ingress via ISP1: 62%, intent 90%; top contributors: AS 64504 via ISP2."
- **What we announce, per session,** from the Adj-RIB-Out or BMP (the BGP Monitoring Protocol, which streams a router's tables to a collector): prefixes, prepends and communities, diffed against the source of truth.
- **What the internet sees,** from public route collectors (RIPE RIS, RouteViews) and looking glasses: origin, path and prefix length per vantage point, including where the more-specifics are missing.
- **Backup readiness:** the direct path present in ISP2's table, which collectors cannot show.
- **Cost:** running 95th percentile per port against commit, with the hours of failover headroom left this month.
- **Edge session health:** state, BFD, received prefix count against a baseline (a full table that halves means the ISP lost part of the internet), and the ROA validity of every prefix announced.

```python
import ipaddress
import math

SAMPLES_PER_DAY = 288                  # one sample every 5 minutes
DAYS = 30


def p95(samples):
    """Transit billing: sort the month's 5-minute rates, drop the top 5 %, bill the highest left."""
    ordered = sorted(samples)
    return ordered[math.ceil(0.95 * len(ordered)) - 1]


def diurnal(peak, i):
    hour = (i % SAMPLES_PER_DAY) / 12
    return peak * (0.55 + 0.45 * math.sin(math.pi * hour / 12) ** 2)   # quiet at night


def month_inbound(failover_hours):
    """Gb/s inbound per 5-minute sample: ISP1 normally, ISP2 during a failover."""
    n, start = SAMPLES_PER_DAY * DAYS, 10 * SAMPLES_PER_DAY
    stop = start + failover_hours * 12
    isp1 = [0.0 if start <= i < stop else diurnal(6.0, i) for i in range(n)]
    isp2 = [diurnal(6.0, i) if start <= i < stop else diurnal(0.3, i) for i in range(n)]
    return isp1, isp2


def entry_as(path):
    hops = path.split()
    return hops[hops.index("64500") - 1]            # the AS that hands traffic to us


def lpm(table, ip):
    hits = [p for p in table if ipaddress.ip_address(ip) in ipaddress.ip_network(p)]
    return max(hits, key=lambda p: ipaddress.ip_network(p).prefixlen) if hits else None


def edge_report(views, isp2_glass, failover_hours, commit_gbps=1.0):
    lines = []
    for name, table in views.items():                   # where would traffic enter?
        prefix = lpm(table, "203.0.113.10")
        note = "" if prefix.endswith("/25") else "  (no /25 here: the /24's policy decides)"
        lines.append(f"{name}: matches {prefix:<17} enters via AS {entry_as(table[prefix])}{note}")
    armed = any(p.split()[0] == "64500" for p in isp2_glass)   # a path learned from us directly
    lines.append(f"backup at ISP2: {'armed' if armed else 'MISSING: failover will black-hole'}")
    isp1, isp2 = month_inbound(failover_hours)
    bill = p95(isp2)
    lines.append(f"after a {failover_hours} h failover: ISP1 carried {sum(isp1) / (sum(isp1) + sum(isp2)):.1%}"
                 f" of inbound, ISP2 bills at {bill:.2f} Gb/s" + ("  OVER COMMIT" if bill > commit_gbps else ""))
    return lines


# Best AS path per prefix at four public route collectors (illustrative).
views = {
    "rc-ams": {"203.0.113.0/24": "64501 64500", "203.0.113.0/25": "64501 64500"},
    "rc-sin": {"203.0.113.0/24": "64496 64501 64500", "203.0.113.0/25": "64496 64501 64500"},
    "rc-sjc": {"203.0.113.0/24": "64502 64501 64500", "203.0.113.0/25": "64502 64501 64500"},
    "rc-gru": {"203.0.113.0/24": "64496 64501 64500"},            # its upstream drops > /24
}
# Every path ISP2's looking glass holds for 203.0.113.0/24, best first.
glass_ok = ["64501 64500", "64500 64500 64500"]          # direct path held at LOCAL_PREF 70
glass_bad = ["64501 64500"]          # ISP2 rebuilt its prefix filter for us without the /24

for glass, hours in [(glass_ok, 30), (glass_bad, 40)]:
    print("\n".join(edge_report(views, glass, hours)), end="\n\n")
```

```text
rc-ams: matches 203.0.113.0/25    enters via AS 64501
rc-sin: matches 203.0.113.0/25    enters via AS 64501
rc-sjc: matches 203.0.113.0/25    enters via AS 64501
rc-gru: matches 203.0.113.0/24    enters via AS 64501  (no /25 here: the /24's policy decides)
backup at ISP2: armed
after a 30 h failover: ISP1 carried 91.5% of inbound, ISP2 bills at 0.30 Gb/s

rc-ams: matches 203.0.113.0/25    enters via AS 64501
rc-sin: matches 203.0.113.0/25    enters via AS 64501
rc-sjc: matches 203.0.113.0/25    enters via AS 64501
rc-gru: matches 203.0.113.0/24    enters via AS 64501  (no /25 here: the /24's policy decides)
backup at ISP2: MISSING: failover will black-hole
after a 40 h failover: ISP1 carried 90.2% of inbound, ISP2 bills at 3.36 Gb/s  OVER COMMIT
```

The 30-hour failover (360 samples) fits inside the 432 discarded samples and costs nothing; the 40-hour one (480 samples) pushes ISP2's billed rate past its 1 Gb/s commit. The second report also shows the failure that matters most: every collector looks healthy while the backup is gone. The vantage points are illustrative, and in the production `/23` version the same check runs on the `/24`s. The views come from [telemetry](/learn/fabric-networking/operating-fabrics/telemetry-and-observability) and [active measurement](/learn/fabric-networking/operating-fabrics/active-measurement).

## Interviewer follow-ups

**"Two ISPs: prefer ISP1 both ways, fail over to ISP2."** Model answer: outbound, LOCAL_PREF 200 on ISP1's routes, an exact AS-wide choice; ISP2's routes take over when ISP1's are withdrawn. Inbound I can only influence: prepending towards ISP2 for networks whose preference ties, ISP2's community to lower its own LOCAL_PREF for my route, and more-specifics to ISP1 with the covering prefix to both. The backup stays announced, BFD makes failover fast, and inbound share per ISP is the only proof. Common wrong answer: "prepend for both directions", or using MED between the two ISPs.

**"Why can't you set LOCAL_PREF for inbound traffic too?"** Model answer: LOCAL_PREF is an attribute of my routers' decision and is never sent to another AS; inbound traffic is decided in other networks' routers, by their LOCAL_PREF. The only way to reach theirs is a provider's published community. Common wrong answer: "LOCAL_PREF is transitive, so ISP2 will see it".

**"You prepended five times and half the inbound still arrives on ISP2. Why?"** Model answer: prepending only moves networks whose LOCAL_PREF ties. ISP2 prefers its customer route over any peer path, its single-homed customers have no alternative, and some multihomed networks prefer ISP2 on cost. I would check what ISP2's looking glass selects, then use its LOCAL_PREF community or a more-specific. Common wrong answer: "prepend ten times".

**"How do you know the failover works without failing over?"** Model answer: check that the backup path exists where it matters, in ISP2's table, because with the community applied no collector can show it; diff each session's announcements against intent; then a planned drill in a quiet window, measuring time to shift in both directions. I would defer to the network team on drill timing and change control; the checks and the measurement are what I would build. Common wrong answer: "the BGP session to ISP2 is Established".

**"Would you anycast an HTTPS service?"** Model answer: yes with care: route changes can move a TCP flow mid-connection, so I want stable catchments, health-tied announcements per server and per site, and monitoring of resets and per-site latency from outside. For very long-lived flows, anycast to choose a site and redirect to unicast. Common wrong answer: "anycast always sends users to the nearest site".

## What mid-level engineers get wrong

- **Expecting MED to choose between ISPs.** It is compared only among paths from one neighbouring AS.
- **Withdrawing from the backup to "force" traffic onto ISP1.** That removes the failover; less preferred is the goal, never absent.
- **Announcing `/25`s and declaring success.** Most networks filter them; the collectors show it within minutes.
- **Trusting configuration over measurement for ingress.** Only bytes per port and per source network show what others decided.

## Senior signals

- You split the question by who decides, and say "control" for egress and "influence" for ingress.
- You map each ingress tool to the step of a remote decision it acts on (longest match, LOCAL_PREF via communities, path length), which predicts who moves.
- You keep MED for several links to one neighbour and know its missing-equals-best default and its oscillation with reflectors.
- You keep the backup announced, verify it in the provider's table rather than at collectors, and drill it.
- You count what more-specifics cost others (table growth) and you (RPKI, conditional origination), and know the `/24` and `/48` limits.
- You treat anycast catchments as a BGP outcome and tie announcements to health checks that cannot fail everywhere at once.

## Check yourself

```quiz
- q: >-
    gw1.ams sets LOCAL_PREF 200 on every route learned from ISP1. Which routers' decisions does this change?
  options: ["Every router on the internet that learns Meridian's prefix from ISP1", "Every BGP router inside AS 64500, but no router in ISP1 or ISP2", "Only gw1.ams, because LOCAL_PREF never leaves the router that set it", "Every router in AS 64500 and in ISP1, which receives it in Meridian's UPDATEs"]
  answer: 1
  explanation: >-
    LOCAL_PREF is carried on iBGP sessions, so every router in the AS compares the same value and exits via gw1.ams, and RFC 4271 forbids sending it to external peers, so no other AS sees it. The router-local preference that never leaves one box is the vendor "weight". It also affects only outbound traffic: it changes Meridian's choice of exit, not other networks' choice of entry.
- q: >-
    Meridian prepends 64500 twice on its announcement to ISP2. Which network keeps sending Meridian's traffic via ISP2?
  options: ["ISP1, because the prepended path looks shorter from its side", "AS 64511, multihomed to both ISPs with equal preference", "No network, because the longer path loses everywhere", "ISP2 itself, which prefers its customer route by LOCAL_PREF"]
  answer: 3
  explanation: >-
    ISP2 gives customer routes LOCAL_PREF 200 and peer routes 100, and LOCAL_PREF is compared before AS_PATH length, so the prepended direct route still wins inside ISP2 and everything entering ISP2 follows it. AS 64511's preferences tie, so the length comparison is reached and it moves to ISP1. ISP1 prefers its own customer route. Reaching ISP2's decision needs its LOCAL_PREF community or a more-specific.
- q: >-
    Why does setting a lower MED on the announcement to ISP1 than on the one to ISP2 not pull traffic onto ISP1?
  options: ["Higher MED is preferred, so the values are the wrong way round", "MED is a transitive attribute and every network resets it", "MED is compared after the router ID, so it is never reached", "MED is compared only between paths learned from the same neighbouring AS"]
  answer: 3
  explanation: >-
    A remote router compares MED only among paths from one neighbouring AS (unless both sides enable comparison across ASes), so ISP1's path and ISP2's path are never compared on MED. Lower is better, MED is non-transitive (it reaches only the neighbour), and it comes before IGP cost and router ID. Its use is choosing between several links to one neighbour.
- q: >-
    Meridian announces 203.0.113.0/24 to both ISPs and its two /25 halves to ISP1 only. The gw1.ams–ISP1 link fails. What happens to inbound traffic?
  options: ["It is lost, because the /24 is less specific than the /25s", "It keeps using the /25s, which stay cached at remote networks", "It is lost until an operator announces the /25s to ISP2", "It moves to the /24 via ISP2 as the /25 withdrawals spread"]
  answer: 3
  explanation: >-
    The halves were learned only through ISP1, so ISP1 withdraws them and remote networks fall back to the covering /24, which ISP2 has carried all along. Longest-prefix match only applies among routes a router has; once the /25s are withdrawn, the /24 is the longest match. Nothing is cached beyond withdrawal, and no action is needed, though the move takes seconds to minutes as withdrawals propagate.
- q: >-
    Meridian tags its announcement to ISP2 with ISP2's community 64502:70. A colleague checks public route collectors and finds no path entering Meridian via ISP2. What does that show?
  options: ["The backup is broken, because ISP2 has dropped Meridian's route", "The community failed, because ISP2 would show the route at LOCAL_PREF 70", "The prepending removed the route from the collectors' tables", "Nothing yet, since ISP2 prefers the path via ISP1 and exports only that"]
  answer: 3
  explanation: >-
    With LOCAL_PREF 70 below its peer value of 100, ISP2's best path for Meridian goes via ISP1, and a router advertises only its best path, so no one downstream of ISP2 sees the direct one. It still sits in ISP2's table and becomes best when ISP1's path disappears. The check is ISP2's looking glass or a planned drill. LOCAL_PREF is never sent to other ASes, so collectors could not show 70 anyway.
- q: >-
    Meridian anycasts its DNS resolvers from Amsterdam, Singapore and San Jose. Users of a Singapore broadband network see 105 ms query latency. What is the most likely cause?
  options: ["Anycast sends each query to the site with the least load", "DNS over UDP cannot be anycast across more than two sites", "The resolvers in Singapore are overloaded and redirecting queries", "That network's BGP policy selects the Amsterdam announcement"]
  answer: 3
  explanation: >-
    Anycast delivers each sender to the announcement its own network's decision process prefers, by LOCAL_PREF and path length, not by distance or load. About 10,500 km to Amsterdam at 5 µs per km is 52 ms each way. Fixes are per-site prepending or communities towards that network's provider, or consistent transit at every site. Anycast knows nothing about load unless announcements are withdrawn, and UDP suits anycast well.
```
