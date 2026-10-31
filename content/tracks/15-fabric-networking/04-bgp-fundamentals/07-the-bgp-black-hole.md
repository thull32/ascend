---
slug: the-bgp-black-hole
title: "The BGP black hole: every session up, every packet dropped"
description: Why three routers with IS-IS everywhere and BGP only on the edges drop customer traffic while every session is Established, traced hop by hop on Meridian; how BGP everywhere, MPLS and VXLAN each fix it and what each one's own black hole looks like; next hops the IGP cannot resolve, or resolves when it should not; and the evidence ladder a platform needs because "Established" proves almost nothing about traffic.
minutes: 55
difficulty: medium
tags: [fabric-networking, bgp, ibgp, black-hole, next-hop-resolution, mpls, vxlan, bgp-free-core, health-checks, troubleshooting, interview]
problems: [unresolvable-next-hops]
---
"Three routers in a row, R1, R2 and R3. All three run IS-IS. R1 and R3 run iBGP between their loopbacks; R2 runs no BGP. R3 learns a customer prefix and advertises it to R1. Does the session come up? Does a customer packet from behind R1 reach the prefix?" Network interviewers ask this because the answers are yes and no, and the candidate who explains why has understood how BGP and the IGP divide the work. The session comes up because the loopbacks are reachable. The packet dies at R2, a router that never heard of the destination, while every session and adjacency on the dashboard is green.

The trap proves a rule the rest of this track relies on: **BGP decides which exit a packet should leave by; every router on the way must still forward the packet towards that exit using only what it knows itself.** The lesson builds on [recursive next-hop resolution](/learn/fabric-networking/from-zero/the-routing-table) and [iBGP's next-hop rules](/learn/fabric-networking/bgp-fundamentals/ibgp-loops-and-next-hops): a BGP route names a far router's loopback as its next hop, and the router finds the real outgoing link by looking that loopback up in the IGP.

## The setup: three routers, two protocols

A few terms first. The **control plane** is the software that computes routes (the IS-IS and BGP processes); the **data plane** is the forwarding chip that moves packets using the result, the **FIB** (forwarding information base) ([planes, ASICs and network operating systems](/learn/fabric-networking/from-zero/planes-asics-and-network-operating-systems)). An **IGP** (interior gateway protocol) is the routing protocol that makes every router inside one network reachable; Meridian's is IS-IS ([IS-IS from zero](/learn/fabric-networking/underlay/is-is-from-zero)). **iBGP** is BGP between routers of the same autonomous system. A **transit router** forwards packets that neither start nor end at it.

The lesson's three routers are a cut-down piece of Meridian's Amsterdam fabric with one spine (a second spine would sit in exactly the same position):

| Role | Meridian device | Loopback | Runs | Knows |
|---|---|---|---|---|
| R1, ingress edge | `leaf1.ams` | `10.255.1.11` | IS-IS, iBGP | `acme-web1` (`10.1.1.10`) on VLAN 100, `10.1.1.0/24` |
| R2, transit | `spine1.ams` | `10.255.1.1` | IS-IS only | loopbacks and link subnets |
| R3, egress edge | `leaf3.ams` | `10.255.1.13` | IS-IS, iBGP | `acme-db1` (`10.1.2.20`) on VLAN 200, `10.1.2.0/24` |

The links are `/31`s: `leaf1.ams`–`spine1.ams` is `10.254.1.0/31` (spine `.0`, leaf `.1`) and `spine1.ams`–`leaf3.ams` is `10.254.1.4/31` (spine `.4`, leaf `.5`). IS-IS carries infrastructure addresses only: the three loopbacks and the link subnets, never a customer subnet.

The trap imagines a design Meridian does not use: Acme's subnets in the plain global routing table, advertised by plain IPv4 iBGP (AS 65000) between the two leaves, with no tunnel. Meridian's real design, VXLAN with BGP EVPN, is one of the fixes.

## The trap, traced

The control plane first. Every step succeeds:

| Step | What happens | Why it works |
|---|---|---|
| 1 | IS-IS adjacencies come up on both links; every router installs `/32` routes to the others' loopbacks | IS-IS's one job: every loopback reachable from everywhere |
| 2 | `leaf1.ams` sends a TCP SYN from `10.255.1.11` to `10.255.1.13` port 179 | `spine1.ams` has `10.255.1.13/32` via `10.254.1.5`, so it forwards the SYN like any packet |
| 3 | Handshake, OPENs, KEEPALIVEs: the session reaches Established ([sessions and the FSM](/learn/fabric-networking/bgp-fundamentals/bgp-sessions-and-the-fsm)) | Both ends in AS 65000, loopbacks reachable; nothing asks what lies between them |
| 4 | `leaf3.ams` sends an UPDATE: `10.1.2.0/24`, NEXT_HOP `10.255.1.13`, empty AS_PATH, LOCAL_PREF 100 | It originates the route; iBGP leaves the next hop at the originator's address |
| 5 | `spine1.ams` forwards that UPDATE as TCP payload, decrementing the IP TTL by one (64 to 63 from a Linux-based leaf; some implementations send iBGP at 255) | It runs no BGP process; it has nothing that could read the message, and keeps no copy |
| 6 | `leaf1.ams` resolves the next hop: `10.255.1.13` matches the IS-IS route `10.255.1.13/32` via `10.254.1.0` | Recursive resolution ends at a connected link to `spine1.ams` |
| 7 | FIB entry on `leaf1.ams`: `10.1.2.0/24 via 10.254.1.0` | The route is valid, best and installed |

The dashed line people draw between R1 and R3 is a TCP connection, not a cable: every packet of it crosses `spine1.ams` as ordinary traffic between two loopbacks.

Now the data plane. `acme-web1` opens a connection to `acme-db1` on port 5432:

| Hop | Device | Looks up | Finds | Does |
|---|---|---|---|---|
| 1 | `acme-web1` | `10.1.2.20`: off its subnet | default gateway `10.1.1.1` | Sends the SYN to the gateway MAC with TTL 64 |
| 2 | `leaf1.ams` | `10.1.2.20` | `10.1.2.0/24 via 10.254.1.0` (BGP, resolved through IS-IS) | Rewrites the MACs, TTL 63, sends to `spine1.ams` |
| 3 | `spine1.ams` | `10.1.2.20` | Nothing: four routes (two loopbacks, two `/31`s), no default | Discards the packet and counts a no-route drop |

The packet carries only its destination address, `10.1.2.20`. The knowledge that `10.1.2.0/24` lives behind `10.255.1.13` stayed on `leaf1.ams`, the only router that read the UPDATE; recursive resolution picked the first hop and nothing more, and every later router looks up the original destination itself.

```viz
{"type": "fabric", "scenario": "bgp-blackhole", "title": "BGP only on the leaves: the session is Established, spine1.ams drops the packet", "caption": "R1 = leaf1.ams, R2 = spine1.ams, R3 = leaf3.ams, IS-IS on all three. The iBGP session comes up through the spine, leaf3.ams advertises 10.1.2.0/24 with its loopback as next hop, and leaf1.ams resolves it through IS-IS. acme-web1's SYN to 10.1.2.20 reaches spine1.ams, which has only loopback and link routes and discards it; even the ICMP error has no route back."}
```

### What the host and the operator see

The drop is silent. `spine1.ams` would normally send an ICMP "destination unreachable" to `10.1.1.10`, but it has no route to `10.1.1.0/24` either, so the error is discarded too. `acme-web1` retransmits its SYN: Linux's default `tcp_syn_retries` of 6, with the retransmission timeout starting at 1 s and doubling, sends retries at 1, 3, 7, 15, 31 and 63 s and gives up at 127 s. The application reports a timeout two minutes later, not an error.

traceroute from `acme-web1` shows its gateway and then stars:

```text
acme-web1$ traceroute -n 10.1.2.20                (illustrative output)
 1  10.1.1.1   0.211 ms  0.187 ms  0.175 ms
 2  * * *
 3  * * *
```

Hop 1 answers because `leaf1.ams` has a connected route back to `10.1.1.0/24`. At hop 2 the probe's TTL expires on `spine1.ams`, which generates an ICMP Time Exceeded for `10.1.1.10` and cannot route it. The output looks the same as a dead spine. Source the probe from `leaf1.ams`'s loopback instead and the picture changes, because `spine1.ams` can route replies to `10.255.1.11`:

```text
leaf1.ams$ traceroute -n -s 10.255.1.11 10.1.2.20  (illustrative output)
 1  10.254.1.0   0.402 ms  0.391 ms  0.388 ms
 2  10.254.1.0   0.415 ms !N  0.397 ms !N  0.390 ms !N
```

Hop 1 is the spine's normal Time Exceeded. At hop 2 the probe survives the TTL check, the spine's lookup fails, and it answers with `!N`, "network unreachable": the spine is alive and has no route. (A router that does the lookup before the TTL check reports `!N` at hop 1 instead, and one configured not to send unreachables, common on data center switches, shows stars at hop 2.) Choosing the probe's source address decides whether errors can come back, a detail worth building into any probing tool ([the packet walk](/learn/fabric-networking/from-zero/the-packet-walk) has traceroute's mechanism).

Meanwhile the protocol view is green: the session Established with one prefix received, both IS-IS adjacencies up, the next hop resolvable. **What the trap teaches:** the control plane can be correct and complete while the data plane drops every packet. **How it shows:** timeouts from hosts, traceroute stars after the last router that can route back, and a rising no-route drop counter on a router no protocol alarm mentions. **Signal that finds it:** a per-hop lookup of the packet's destination on every router along the resolved path.

### Why BGP lets this happen

BGP is not a forwarding protocol. It distributes reachability statements ("`10.1.2.0/24` is reachable via `10.255.1.13`") and trusts the network in between to carry packets to the next hop. Within an autonomous system it assumes one of two things: every router in the path also runs BGP and has the route, or the packet is sent in a form those routers can forward without the route.

Early BGP deployments enforced the first assumption with a rule called **synchronization**: a router would not use or pass on an iBGP-learned route until its IGP had learned the same prefix, which meant redistributing BGP routes into the IGP so every transit router had them. Cisco IOS enabled it by default until the early 2000s. It died because the IGP cannot hold BGP's tables. IS-IS gives each router at most 256 link-state fragments of 1,492 bytes by default, about 380 KB, and a `/24` costs about 8 bytes in the extended reachability TLV, so one router can advertise roughly 40,000 of them against an internet table of about a million IPv4 prefixes. Worse, the IGP floods every change to every router and reruns its shortest-path computation; internet churn would keep every router recomputing. Turning synchronization off made the second assumption the designer's job, and the trap is what happens when nobody takes it on.

## Fix 1: run BGP on the transit router

Give `spine1.ams` iBGP sessions too, and it learns `10.1.2.0/24` itself:

1. `spine1.ams` peers with `leaf3.ams`, receives `10.1.2.0/24` with next hop `10.255.1.13`, resolves it through IS-IS to `10.254.1.5` and installs it.
2. `leaf1.ams` forwards the SYN to `spine1.ams` as before.
3. `spine1.ams` looks up `10.1.2.20`, matches `10.1.2.0/24 via 10.254.1.5`, forwards to `leaf3.ams`, which delivers.

The session to `leaf3.ams` is required, not optional. `leaf1.ams` will not re-advertise to `spine1.ams` a route it learned over iBGP from `leaf3.ams`: iBGP has no AS_PATH growth inside one AS to detect a loop, so its split-horizon rule forbids passing iBGP routes to other iBGP peers ([iBGP, loops and next hops](/learn/fabric-networking/bgp-fundamentals/ibgp-loops-and-next-hops)). Three routers need a full mesh of 3 sessions; Amsterdam's 4 spines and 16 leaves would need 20 × 19 / 2 = 190, which is why "BGP everywhere" at scale means [route reflectors](/learn/fabric-networking/bgp-fundamentals/route-reflectors): 2 sessions per client, about 40 in total.

The fix costs state on every transit router: an internet transit network that runs it holds the full table, about a million IPv4 routes, in every core router's FIB. In Meridian's fabric it is worse than expensive: Acme and Globex both use `10.1.1.0/24`, so the spines would need a VRF (a separate routing table) per tenant, turning every spine into a multi-tenant edge router whose configuration changes whenever a tenant does. An eBGP underlay ([BGP as the underlay](/learn/fabric-networking/underlay/bgp-as-the-underlay)) is "BGP everywhere" in its purest form, and data centers that use it still keep tenant routes out of it and tunnel them.

### Its own black hole: the boot race

BGP everywhere brings a black hole of its own: transit routers must have their BGP routes *before* the IGP draws traffic through them. A rebooting transit router gets the order wrong on its own:

| Time after boot | IGP | BGP on R2 | Traffic R1 → R3 |
|---|---|---|---|
| 0–40 s | No adjacencies; R1's SPF routes around R2 through another transit router | Down | Takes the other path |
| 40 s | Adjacencies up, R2 advertises its links at normal metric; R1's SPF picks R2 again | Sessions starting | Arrives at R2 |
| 40 s to about 4 min | Converged | Receiving and installing a full table; prefixes appear one batch at a time | Dropped for every prefix R2 has not installed yet |
| about 4 min | | End-of-RIB from all peers, FIB programmed | Delivered |

(Illustrative timings: full-table load takes seconds to minutes depending on the router's CPU and FIB programming rate.) The IGP is fast because its state is small, BGP is slow because its state is large, and the IGP decides where packets go. The fix keeps the router out of transit until BGP is ready: IS-IS sets the **overload bit** in its link-state packets on startup ("do not route through me", while its own addresses stay reachable), and OSPF advertises maximum link metrics (RFC 6987). Implementations clear it when BGP has converged, with a timer as a backstop, commonly a few minutes. A related ordering mistake during maintenance, costing a router out of the IGP while its BGP routes still draw traffic to it, is in [operating BGP safely](/learn/fabric-networking/bgp-in-the-real-world/operating-bgp-safely).

**What BGP everywhere solves:** every router on the path can look up the real destination. **How it breaks:** FIB size, per-tenant state on transit routers, sessions or reflectors to manage, and the boot race. **Signal:** RIB versus FIB route counts per transit router, and no-route drops in the minutes after a reboot.

## Fix 2: encapsulate towards the exit

The other way out keeps `spine1.ams` exactly as it is. `leaf1.ams` wraps the customer packet in an outer header addressed to the exit, `leaf3.ams`, so the question every transit router asks changes from "where is `10.1.2.20`?" to "where is `10.255.1.13`?", and the IGP answers that on every router. A network built this way is called a **BGP-free core**: BGP runs only at the edges, and the core forwards on IGP state alone.

MPLS wraps it in a short label, VXLAN in a full UDP/IP header; both need only the exit's loopback in the IGP.

### MPLS: a label for the exit's loopback

**MPLS** (Multiprotocol Label Switching) puts a 4-byte **label stack entry** between the Ethernet header and the IP packet (EtherType `0x8847`). Routers forward on the label, an index into a label table, without looking at the IP header behind it.

| Field | Size | Value on the `leaf1.ams` → `spine1.ams` link | What reads it |
|---|---|---|---|
| Label | 20 bits | 24013, the label `spine1.ams` bound to `10.255.1.13/32` | `spine1.ams`'s label table |
| Traffic class | 3 bits | 0 | Queueing on each hop |
| Bottom of stack (S) | 1 bit | 1 (the only label) | The router that pops it: IP comes next |
| TTL | 8 bits | 63, copied from the IP TTL | Each label-switching hop decrements it |

Where the label comes from: LDP (Label Distribution Protocol) runs beside IS-IS on every link. Each router assigns a local label to IGP prefixes (every prefix on some implementations, only loopback `/32`s by default on others) and tells its neighbours. `spine1.ams` assigned 24013 to `10.255.1.13/32`. `leaf3.ams`, which owns that address, advertised the reserved "implicit null" label 3, meaning "pop the label before you send it to me" (**penultimate-hop popping**). The trace:

| Hop | Device | Reads | Does |
|---|---|---|---|
| 1 | `leaf1.ams` | IP `10.1.2.20` → BGP route, next hop `10.255.1.13` → LDP label from `spine1.ams`: 24013 | Pushes label 24013, sends to `spine1.ams` |
| 2 | `spine1.ams` | Label 24013 → "pop, out to `10.254.1.5`" (implicit null from `leaf3.ams`) | Pops the label, sends plain IP to `leaf3.ams`; never reads `10.1.2.20` |
| 3 | `leaf3.ams` | IP `10.1.2.20` → connected `10.1.2.0/24` | Delivers to `acme-db1` |

Customer VPNs add a second, inner label that the exit router uses to pick the tenant's table, the L3VPN design that EVPN descends from ([MPLS and segment routing](/learn/fabric-networking/overlays-vxlan-evpn/mpls-and-segment-routing)). The cost is 4 bytes per label and a second protocol, LDP, that must agree with the IGP on every link.

That agreement is MPLS's own black hole. If the LDP session on the `leaf1.ams`–`spine1.ams` link is down while IS-IS on it is up, `leaf1.ams` still routes `10.255.1.13` via `spine1.ams` but has no label from it. It sends the packet unlabelled, `spine1.ams` does an IP lookup on `10.1.2.20`, and the original black hole returns. **LDP–IGP synchronization** (RFC 5443) closes it: the IGP advertises a link at maximum metric until LDP is up on it, so traffic avoids a link where labels are missing. The signal is a link with an IGP adjacency but no LDP session, or a next hop whose label is missing, both pollable.

### VXLAN: an IP header for the exit's loopback

**VXLAN** wraps the packet in outer Ethernet, IPv4 and UDP headers plus an 8-byte VXLAN header carrying a 24-bit **VNI** (VXLAN network identifier, which names the tenant segment or routing table). The device that wraps and unwraps is a **VTEP** (VXLAN tunnel endpoint); on Meridian each leaf is one, at its loopback.

| Header | Size | Value leaving `leaf1.ams` | What reads it |
|---|---|---|---|
| Outer Ethernet | 14 B | `leaf1.ams` → `spine1.ams` port MACs | This link only |
| Outer IPv4 | 20 B | `10.255.1.11` → `10.255.1.13`, TTL 64, protocol 17 | `spine1.ams` and `leaf3.ams` |
| Outer UDP | 8 B | source port from a hash of the inner flow, destination 4789 | `leaf3.ams` (the source port also feeds [ECMP hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)) |
| VXLAN | 8 B | VNI 50001, Acme's routing VNI | `leaf3.ams`: which tenant table to use |
| Inner Ethernet, IP, TCP | | `10.1.1.10` → `10.1.2.20`, inner TTL 63 | `leaf3.ams`, then `acme-db1` |

That is 50 bytes of overhead, which is why the underlay MTU must exceed the tenant's by at least 50 ([VXLAN encapsulation](/learn/fabric-networking/overlays-vxlan-evpn/vxlan-encapsulation) goes field by field). The route that tells `leaf1.ams` to do this arrives over the same iBGP session, now carrying the EVPN address family: an EVPN type-5 (IP prefix) route for `10.1.2.0/24` with route distinguisher `10.255.1.13:50001`, route target `65000:50001` (import into VRF ACME), next hop `10.255.1.13` and VNI 50001.

```viz
{"type": "fabric", "scenario": "bgp-blackhole", "variant": "vxlan", "title": "The VXLAN fix: same routers, same IS-IS, spine1.ams forwards on leaf3's loopback", "caption": "leaf3.ams advertises 10.1.2.0/24 as an EVPN type-5 route with VNI 50001 and next hop 10.255.1.13. leaf1.ams wraps acme-web1's SYN in outer IPv4, UDP 4789 and VXLAN; spine1.ams looks up only the outer destination 10.255.1.13, which IS-IS gave it, and leaf3.ams decapsulates and delivers. The spine still has no route for 10.1.2.0/24."}
```

The spine's table is the same four routes as before; it still has no route for `10.1.2.0/24` and no longer needs one. Because the routing VNI selects VRF ACME at `leaf3.ams`, Globex's identical `10.1.1.0/24` travels in VNI 50002 to a different table, a separation the spines never see ([VRFs and multi-tenancy](/learn/fabric-networking/overlays-vxlan-evpn/vrfs-and-multi-tenancy)).

VXLAN needs no label protocol: the outer header is routed by IS-IS itself, so there is nothing like LDP to fall out of sync. Its own black holes sit in the underlay: a VTEP loopback missing from IS-IS (the next-hop failures below), and an underlay MTU without room for the 50 bytes, where small packets pass and full-size ones vanish ([transport as the network sees it](/learn/fabric-networking/from-zero/transport-as-the-network-sees-it)).

**What encapsulation solves:** transit routers forward on the exit's address, so they hold only IGP state and no customer or tenant routes. **How it breaks:** the wrapper fails to apply (LDP missing on a link), the exit's loopback is missing or wrongly resolved in the IGP, or the extra bytes exceed an MTU. **Signal:** IGP-versus-LDP mismatches, the tunnel endpoint's `/32` present on every router, and large-packet probes across the underlay.

## The data plane in code

Whether a packet arrives is a property of every FIB along the path, not of any session. The simulator forwards one packet the way the chips do: each router looks up only the outermost destination address in its own FIB. A route's action is a neighbour, `local` (attached, or the router's own loopback, which means "decapsulate"), `discard`, or `vxlan:<router>` (push an outer header to that router's loopback). It runs the three designs, then a failure from the next section.

```python
import ipaddress

LOOPBACK = {"leaf1.ams": "10.255.1.11", "spine1.ams": "10.255.1.1", "leaf3.ams": "10.255.1.13",
            "leaf2.sin": "10.255.2.12", "spine1.sin": "10.255.2.1"}


def lpm(fib, dst):
    """Longest-prefix match: the most specific route covering dst, or None."""
    addr, best = ipaddress.ip_address(dst), None
    for prefix, action in fib:
        net = ipaddress.ip_network(prefix)
        if addr in net and (best is None or net.prefixlen > best[0].prefixlen):
            best = (net, action)
    return best


def walk(fibs, start, dst, ttl=64):
    """Forward one packet as the data plane does: every router looks up only the
    outermost destination address, in its own FIB, and knows nothing else."""
    router, stack, log = start, [dst], []
    while True:
        match = lpm(fibs[router], stack[-1])
        seen = f"{router:<10} looks up {stack[-1]:<11}"
        if match is None:
            return log + [f"{seen} no route: DROP, no-route counter +1"]
        net, action = match
        if action == "discard":                    # a summary's null route
            return log + [f"{seen} matches {str(net):<15} discard route: DROP"]
        if action == "local":
            if len(stack) == 1:
                return log + [f"{seen} matches {str(net):<15} attached: DELIVERED"]
            log.append(f"{seen} matches {str(net):<15} my loopback: decapsulate")
            stack.pop()                             # inner header is outermost again
            continue
        if action.startswith("vxlan:"):             # push an outer header to the VTEP
            stack.append(LOOPBACK[action[6:]])
            log.append(f"{seen} matches {str(net):<15} encapsulate to {stack[-1]}")
            continue
        if ttl == 0:
            return log + [f"{seen} TTL expired: DROP"]
        log.append(f"{seen} matches {str(net):<15} forward to {action}")
        router, ttl = action, ttl - 1


def resolve(fib, next_hop):
    """What next-hop tracking reports for a BGP next hop."""
    match = lpm(fib, next_hop)
    if match is None:
        return "unresolvable: route kept in the RIB, not installed"
    net, _ = match
    kind = "host route" if net.prefixlen == 32 else "COVERING ROUTE, proves nothing"
    return f"resolves via {net} ({kind})"


# IS-IS on all three routers: loopbacks only (link /31s omitted for brevity).
underlay = {
    "leaf1.ams": [("10.255.1.11/32", "local"), ("10.255.1.13/32", "spine1.ams"), ("10.1.1.0/24", "local")],
    "spine1.ams": [("10.255.1.11/32", "leaf1.ams"), ("10.255.1.13/32", "leaf3.ams")],
    "leaf3.ams": [("10.255.1.13/32", "local"), ("10.255.1.11/32", "spine1.ams"), ("10.1.2.0/24", "local")],
}


def design(**extra):
    fibs = {r: list(routes) for r, routes in underlay.items()}
    for router, routes in extra.items():
        fibs[router.replace("_", ".")] += routes
    return fibs


cases = {
    "BGP on the leaves only": design(leaf1_ams=[("10.1.2.0/24", "spine1.ams")]),
    "BGP on the spine too": design(leaf1_ams=[("10.1.2.0/24", "spine1.ams")],
                                   spine1_ams=[("10.1.2.0/24", "leaf3.ams")]),
    "VXLAN to leaf3's loopback": design(leaf1_ams=[("10.1.2.0/24", "vxlan:leaf3.ams")]),
}
for name, fibs in cases.items():
    print(f"--- {name}")
    print("\n".join(walk(fibs, "leaf1.ams", "10.1.2.20")))

# A second site whose loopbacks reach Singapore only as one summary (Meridian does
# not do this; an operator saving IGP state might). leaf3.ams has just lost power.
fibs = design()
fibs["spine1.ams"] = [("10.255.1.11/32", "leaf1.ams"), ("10.255.1.0/24", "discard")]
fibs["spine1.sin"] = [("10.255.1.0/24", "spine1.ams")]
fibs["leaf2.sin"] = [("10.255.2.12/32", "local"), ("10.255.1.0/24", "spine1.sin"),
                     ("10.1.2.0/24", "vxlan:leaf3.ams")]   # EVPN route not yet withdrawn
print("--- leaf3.ams dead, loopbacks summarised between sites")
print("leaf2.sin NHT:", resolve(fibs["leaf2.sin"], "10.255.1.13"))
print("\n".join(walk(fibs, "leaf2.sin", "10.1.2.20")))
print("--- the same failure with host routes in the IGP")
fibs["leaf2.sin"] = [("10.255.2.12/32", "local"), ("10.255.1.11/32", "spine1.sin")]  # .13/32 withdrawn
print("leaf2.sin NHT:", resolve(fibs["leaf2.sin"], "10.255.1.13"))
print("\n".join(walk(fibs, "leaf2.sin", "10.1.2.20")))   # the EVPN route is not in the FIB
```

```text
--- BGP on the leaves only
leaf1.ams  looks up 10.1.2.20   matches 10.1.2.0/24     forward to spine1.ams
spine1.ams looks up 10.1.2.20   no route: DROP, no-route counter +1
--- BGP on the spine too
leaf1.ams  looks up 10.1.2.20   matches 10.1.2.0/24     forward to spine1.ams
spine1.ams looks up 10.1.2.20   matches 10.1.2.0/24     forward to leaf3.ams
leaf3.ams  looks up 10.1.2.20   matches 10.1.2.0/24     attached: DELIVERED
--- VXLAN to leaf3's loopback
leaf1.ams  looks up 10.1.2.20   matches 10.1.2.0/24     encapsulate to 10.255.1.13
leaf1.ams  looks up 10.255.1.13 matches 10.255.1.13/32  forward to spine1.ams
spine1.ams looks up 10.255.1.13 matches 10.255.1.13/32  forward to leaf3.ams
leaf3.ams  looks up 10.255.1.13 matches 10.255.1.13/32  my loopback: decapsulate
leaf3.ams  looks up 10.1.2.20   matches 10.1.2.0/24     attached: DELIVERED
--- leaf3.ams dead, loopbacks summarised between sites
leaf2.sin NHT: resolves via 10.255.1.0/24 (COVERING ROUTE, proves nothing)
leaf2.sin  looks up 10.1.2.20   matches 10.1.2.0/24     encapsulate to 10.255.1.13
leaf2.sin  looks up 10.255.1.13 matches 10.255.1.0/24   forward to spine1.sin
spine1.sin looks up 10.255.1.13 matches 10.255.1.0/24   forward to spine1.ams
spine1.ams looks up 10.255.1.13 matches 10.255.1.0/24   discard route: DROP
--- the same failure with host routes in the IGP
leaf2.sin NHT: unresolvable: route kept in the RIB, not installed
leaf2.sin  looks up 10.1.2.20   no route: DROP, no-route counter +1
```

`stack` is the header stack, and its top is the only address a router reads. The model leaves out ECMP, VRFs (the decapsulating leaf would pick the table from the VNI) and the reverse direction, which needs the same walk from the other end. Run on FIBs collected from real devices, or computed from their configurations as the open-source Batfish does, this walk is how network-modelling tools find black holes before traffic does.

## Next hops the IGP cannot resolve

The black hole above had a perfectly resolvable next hop. Most other BGP black holes start at the next hop, in three forms.

### The next hop is not in the IGP at all

`gw1.ams` learns `192.0.2.0/24` from ISP1 over eBGP with next hop `198.51.100.2`, ISP1's side of their shared link, and passes it to the leaves over iBGP. iBGP leaves the next hop unchanged, and IS-IS carries Meridian's own loopbacks and links, not ISP1's addresses, so every leaf holds a route whose next hop it cannot look up. The route stays in its BGP table marked inaccessible, is never installed, and traffic to `192.0.2.0/24` follows whatever less specific route exists, here the default route, which may point at the other gateway. The standard fix is **next-hop-self**: `gw1.ams` rewrites the next hop to its own loopback `10.255.1.201`, which IS-IS carries ([iBGP, loops and next hops](/learn/fabric-networking/bgp-fundamentals/ibgp-loops-and-next-hops)). The signal is routes received but not installed: on most platforms a count of routes with an inaccessible next hop, which in a healthy fabric is zero.

### The next hop drops out of the IGP

Here unresolvability is the *good* outcome: the IGP telling BGP that an exit is gone. When `leaf3.ams` loses power, `spine1.ams` sees its links go dark within milliseconds, IS-IS floods the change, and within about a second every router has withdrawn `10.255.1.13/32`. **Next-hop tracking** (NHT), in the BGP process, registers interest in each next hop with the routing table and is called back when the route covering it changes. It then re-runs best-path for every prefix using `10.255.1.13`: with an alternative (a host on two leaves, as in [EVPN multihoming](/learn/fabric-networking/overlays-vxlan-evpn/evpn-multihoming)) traffic moves at once; without one, the route is uninstalled and packets drop visibly at the ingress leaf. Older designs re-checked next hops with a periodic scanner, every 60 s by default on Cisco IOS, so a dead exit kept attracting traffic for up to a minute; event-driven NHT replaced that.

### The next hop resolves when it should not

The dangerous case is a next hop that still resolves after the exit is gone, because a less specific route covers it, as the simulator's last runs show. Suppose an operator summarised each site's loopbacks between sites (Meridian does not), so Singapore knows Amsterdam's loopbacks only as `10.255.1.0/24`. When `leaf3.ams` dies, `10.255.1.13/32` disappears inside Amsterdam, but the summary stays up as long as any Amsterdam loopback exists. `leaf2.sin`'s next-hop tracking sees `10.255.1.13` still resolving through `10.255.1.0/24` and keeps the EVPN route. Its packets cross a 10,500 km circuit, about 52 ms one way at 5 µs per km, to be discarded at `spine1.ams` by the summary's discard route (the null route a summarising router installs so that it never loops packets for addresses inside the summary it cannot reach).

How long it lasts is now up to some other BGP speaker that can still see the `/32`. In the fast case `rr1.ams`, inside Amsterdam, sees `10.255.1.13/32` vanish, its own next-hop tracking marks the route unusable within about a second, and a route a reflector cannot use is not its best path, so it withdraws it towards Singapore. In the slow case no reflector on the way checks the next hop against a `/32` (reflectors behind the summary too, or configured to skip next-hop checks, as some dedicated reflectors are), and the route goes away only when the reflector's session to `leaf3.ams` times out: 6 to 9 s with Meridian's 9-second hold time, up to 3 minutes with a 180-second vendor default, under a second only if the reflector runs BFD (a fast liveness check, [convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd)) to the leaf. With host routes in the IGP (the last run), the next hop is unresolvable within about a second and the drop happens visibly at the ingress leaf. A default route in the IGP does the same damage as a summary, which is why FRRouting refuses to resolve BGP next hops through a default unless configured to, and why many operators restrict resolution to host routes for loopback next hops.

**What next-hop resolution solves:** a BGP route is used only while the IGP can reach its exit. **How it breaks:** the next hop is never in the IGP (missing next-hop-self), or a summary or default answers for an exit that is gone. **Signal:** routes with inaccessible next hops, and BGP next hops resolving through anything other than a `/32`; both should be zero in a fabric. [Unresolvable next hops](/practice/unresolvable-next-hops) practises finding them across a table.

## Why "session Established" is not a health check

Established proves that a TCP connection between two loopbacks works, that the two OPENs agreed, and that the peer's BGP process sent something within the hold time. Each has a blind spot:

| Established proves | What it does not prove | How it bites |
|---|---|---|
| TCP between two loopbacks works | That a packet to a *customer* address can cross the same routers | This lesson: the session's packets are addressed to a loopback every router knows |
| On one path | That every ECMP path works | The session's 5-tuple hashes onto one spine; a gray-failing link on another spine drops a share of data traffic ([ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)) |
| For small packets | That full-size packets fit | KEEPALIVEs are 19 bytes; a missing 50 bytes of VXLAN headroom drops only large data packets |
| In the network-control class | That best-effort queues are moving | Control traffic has its own protected queue and a CPU path; customer traffic can be dropping in queue 0 |
| The OPENs matched | That the address family carries routes, or the routes are accepted | The EVPN family configured on one side only, so never negotiated, or an import policy that rejects everything |
| The peer's BGP process is alive | That the routes are in the hardware FIB | A full table or an agent error leaves routes in the RIB only ([the routing table](/learn/fabric-networking/from-zero/the-routing-table)) |
| Nothing about the data | That the routes are *correct* | A copied configuration with a duplicated route target imports one tenant's routes into another's table; every session stays up |

Each row needs its own check. The last row is a classic incident: a tenant's configuration copied from one leaf to another with its route target unchanged, every session up, and the customer the first to notice ([the overlay packet walk](/learn/fabric-networking/overlays-vxlan-evpn/the-overlay-packet-walk) traces it).

The opposite coupling fails too. In Facebook's outage of 4 October 2021, a maintenance command disconnected the backbone; DNS servers that could no longer reach the data centers withdrew their BGP announcements, as designed, and the company's names stopped resolving worldwide for about six hours. Measure the data plane directly, and be deliberate about which health checks may withdraw routes.

## Failure modes in production

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Transit router without the route | Timeouts to a prefix; traceroute stars after the ingress edge; sessions all up | Look up the destination on every router along the resolved path; no-route drops on the transit device | Encapsulate (VXLAN, MPLS) or carry the route on every transit router |
| Boot race on a BGP transit router | Drops for minutes after a reboot, then recovery on their own | Drops correlate with uptime; IGP adjacency up long before BGP End-of-RIB | Overload bit or max-metric on startup until BGP converges |
| LDP down, IGP up on one link | One path drops labelled traffic as plain IP; others fine | IGP adjacency without an LDP session on that link; missing label for the exit's `/32` | LDP–IGP synchronization |
| Next hop resolving through a summary or default | Traffic to a dead exit until BGP withdraws it (up to a hold time), sometimes across a site | NHT shows resolution via a non-`/32`; drops at the summarising router's discard route | Host routes for loopbacks in the IGP; restrict resolution to `/32`s; BFD to reflector clients |
| Next hop never in the IGP | Routes received but not installed; traffic on a less specific route | Inaccessible next-hop count; next hop is an external link address | Next-hop-self at the border |
| Costing out the IGP before withdrawing BGP | A whole router's worth of traffic dropped during maintenance, every session up | Change log against drop counters; BGP still advertising through a drained router | Withdraw BGP first, then the IGP ([operating BGP safely](/learn/fabric-networking/bgp-in-the-real-world/operating-bgp-safely)) |

## Trade-offs: how a core forwards traffic for routes it does not hold

| | BGP on every transit router | MPLS (LDP) | VXLAN | Redistribute BGP into the IGP |
|---|---|---|---|---|
| Transit router state | Every customer or internet route, in the FIB | IGP routes plus one label per IGP prefix | IGP routes only | Every route, in the IGP's database |
| Per-packet overhead | None | 4 bytes per label | 50 bytes | None |
| Overlapping tenant addresses | Needs a VRF per tenant on every transit router | Yes, with an inner VPN label | Yes, by VNI | No |
| Extra protocol to keep in sync | BGP sessions or reflectors to every transit router | LDP with the IGP | None beyond the IGP | None, and the IGP floods every change |
| Its own black hole | Boot race; FIB overflow | LDP–IGP desynchronization | Underlay MTU; VTEP loopback missing | IGP instability; LSP space runs out near 40,000 prefixes |
| Where you find it | Small enterprise cores, eBGP-underlay fabrics | Service-provider backbones | Data center fabrics, Meridian | Historical; small networks |

Backbones pick MPLS for its small overhead and traffic engineering; data centers pick VXLAN because it runs over any IP underlay ([why overlays](/learn/fabric-networking/overlays-vxlan-evpn/why-overlays)).

## Under the hood: what a router does with a packet it cannot route

In the forwarding chip, the destination lookup in the FIB returns no entry, and with no default route the pipeline's verdict is drop, counted under a drop reason. Switch operating systems expose these as per-reason counters (SONiC's debug counters, NVIDIA's What Just Happened on Spectrum switches and similar features elsewhere); on a Linux router the kernel counts it as `IpExtInNoRoutes` in `nstat`. Generating the ICMP unreachable is not the chip's job: where unreachables are enabled at all, it traps the packet to the CPU, which builds the reply under control-plane policing limits, so even a reachable source receives only a rate-limited trickle of errors. A route programmed as `discard` (a summary's null route, or a deliberate blackhole route such as one requested with the BLACKHOLE community of RFC 7999) drops the same way under a different reason.

In the control plane, FRRouting's `bgpd` registers each next hop with `zebra`, the process that owns the routing table, which calls back with the covering prefix whenever it changes: how a tool tells "resolves via `/32`" from "resolves via `/24`".

## What the platform should show

The platform's job is to answer "can a packet from here reach that prefix?" with evidence. Surface:

- **Next-hop resolution per BGP route, and what it resolves through.** Inaccessible next hops, and next hops resolving through a summary or default, are both alarms in a fabric whose loopbacks are all `/32`s.
- **Path consistency from FIB snapshots.** For each ingress leaf and prefix, walk every router's FIB as the simulator does and flag any hop with no route for the address it must look up, before a change ships as well as after.
- **No-route and discard drops per device, by reason.** A spine with rising no-route drops in a fabric where spines should carry only loopbacks is the black hole's fingerprint.
- **RIB against FIB route counts per device,** because a route best in BGP and missing from hardware drops traffic with every session up.
- **Active probes with tenant addresses** from every leaf to every VTEP, varying the 5-tuple to cover every ECMP path, and sourced from addresses that can receive errors ([active measurement](/learn/fabric-networking/operating-fabrics/active-measurement)).
- **Change context:** any maintenance in progress and the order its steps ran in ([safe change and maintenance](/learn/fabric-networking/operating-fabrics/safe-change-and-maintenance)).
- **Two views of one result.** The engineer needs the lowest failing piece of evidence and where to look; a manager needs whether customers are affected and how widely.

The evidence forms a ladder, and the useful output is the lowest rung that fails, because every rung above it is meaningless:

```python
LADDER = [
    ("session", "BGP session Established"),
    ("route", "prefix received and selected as best"),
    ("next_hop", "next hop resolves through a host route"),
    ("fib", "route programmed in the ingress switch's hardware"),
    ("path", "every router on the path has a route for what it must look up"),
    ("probe", "a probe with the tenant's addresses gets an answer"),
]
WHERE = {"session": "TCP, OPEN or hold timer (the FSM lesson)",
         "route": "advertisement or import policy at the far end",
         "next_hop": "the underlay: is the far loopback in the IGP as a /32?",
         "fib": "RIB-to-FIB programming: table full, agent error",
         "path": "a transit router without the route: the BGP black hole",
         "probe": "data plane only: ACL, MTU, a gray-failing link, a VRF mistake"}


def verdict(evidence):
    """Name the lowest rung that fails; the rungs above it are not evidence."""
    for passed, (rung, meaning) in enumerate(LADDER):
        if not evidence.get(rung, False):
            return f"{passed} of {len(LADDER)} rungs pass; failing: {meaning} -> look at {WHERE[rung]}"
    return f"{len(LADDER)} of {len(LADDER)} rungs pass: reachable"


checks = {
    "leaf1.ams -> 10.1.2.0/24, leaves-only BGP": dict(session=True, route=True, next_hop=True, fib=True, path=False, probe=False),
    "leaf2.sin -> 10.1.2.0/24, summary underlay": dict(session=True, route=True, next_hop=False, fib=True, path=False, probe=False),
    "leaf1.ams -> 10.1.2.0/24, VXLAN": dict(session=True, route=True, next_hop=True, fib=True, path=True, probe=True),
    "leaf5.ams -> 10.1.2.0/24, bad optic": dict(session=True, route=True, next_hop=True, fib=True, path=True, probe=False),
}
for name, evidence in checks.items():
    print(f"{name}\n    {verdict(evidence)}")
```

```text
leaf1.ams -> 10.1.2.0/24, leaves-only BGP
    4 of 6 rungs pass; failing: every router on the path has a route for what it must look up -> look at a transit router without the route: the BGP black hole
leaf2.sin -> 10.1.2.0/24, summary underlay
    2 of 6 rungs pass; failing: next hop resolves through a host route -> look at the underlay: is the far loopback in the IGP as a /32?
leaf1.ams -> 10.1.2.0/24, VXLAN
    6 of 6 rungs pass: reachable
leaf5.ams -> 10.1.2.0/24, bad optic
    5 of 6 rungs pass; failing: a probe with the tenant's addresses gets an answer -> look at data plane only: ACL, MTU, a gray-failing link, a VRF mistake
```

The last case is why the probe rung exists: every control-plane check passes and traffic still drops ([telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability)).

## Interviewer follow-ups

**"R1, R2, R3 in a row, IS-IS everywhere, iBGP only between R1 and R3. Does the session come up, and does traffic flow?"** Model answer: the session comes up, because it is TCP between loopbacks the IGP carries. Traffic to the BGP prefix dies at R2: R1 resolves the next hop to R2 and forwards the original packet; R2 looks up the customer destination, has no route, and drops it, usually silently, since its ICMP error cannot route back either. Fix by running BGP on R2 (a full mesh or reflectors, because R1 will not pass iBGP routes on), or by encapsulating towards R3's loopback with MPLS or VXLAN. Common wrong answer: "R1 forwards to R3 because R3 is the next hop". The next hop picks only the first hop; the packet carries no record of it.

**"Why don't Meridian's spines run BGP?"** Model answer: VXLAN addresses every packet to a leaf loopback that IS-IS carries, so the spines need no tenant routes. That keeps their FIBs small, allows overlapping tenant subnets without VRFs on spines, avoids the boot race, and keeps tenant changes off the spines. The price is 50 bytes per packet and underlay MTU headroom. Common wrong answer: "spines are too slow for BGP". Control-plane capacity has nothing to do with it; the design removes the need. Honest addition: "I'd defer to the network team on whether the spines run BGP for anything else, but tenant routes would not be in it."

**"Every BGP session is Established, but a customer cannot reach a prefix. Where do you look?"** Model answer: scope first, one source or many, one prefix or all. Then climb the evidence ladder above from the bottom: route best on the ingress leaf, next hop through a `/32`, route in hardware, a route on every hop, a probe with the customer's addresses. A traceroute sourced from the leaf's loopback shows where it dies; no-route drop counters on the transit devices confirm it. Common wrong answer: resetting the sessions, which withdraws and relearns every route and changes nothing about the data plane.

**"How quickly does traffic stop going to a leaf that loses power?"** Model answer: it depends on how the next hop resolves. With the leaf's loopback as a `/32` in the IGP, the IGP withdraws it within about a second and next-hop tracking pulls every BGP route through it at once. If a summary or default still covers the loopback, the ingress keeps the routes until a withdrawal arrives: about a second if a reflector that still sees the `/32` validates the next hop, otherwise when the reflector's hold timer expires, up to 9 s with fabric timers and up to 3 minutes with defaults, unless BFD runs on the reflector sessions. Common wrong answer: "as fast as the IGP converges", true only when the IGP carries the host route.

**"MPLS or VXLAN for a BGP-free core?"** Model answer: both turn the lookup into "where is the exit's loopback". MPLS costs 4 bytes per label, needs LDP (or segment routing) kept in step with the IGP and has mature traffic engineering, so backbones use it. VXLAN costs 50 bytes, needs only IP and the IGP, and runs on commodity data center switches, so fabrics use it. Common wrong answer: "VXLAN replaces BGP". EVPN, the BGP address family, is what tells each leaf where to send the tunnel.

## What mid-level engineers get wrong

- **Reading the next hop as the path.** The BGP next hop chooses the first hop at one router; every later router decides again on the destination address alone.
- **Treating "Established" as "working".** Dashboards built on session state stay green through black holes, MTU drops, FIB overflow and leaked route targets.
- **Summarising loopbacks to save IGP state.** It turns a fast, visible failure (unresolvable next hop, drop at ingress) into a slow, hidden one (drops at a far summary until some other router's BGP withdraws the route, at worst a whole hold time).
- **Adding BGP to transit routers as the quick fix** without the boot-race protection, which trades a permanent black hole for one after every reboot.

## Exercise: find the black hole

```exercise
id: find-the-black-hole
title: Walk a packet through every router's FIB
prompt: |
  Write `walk_packet(fibs, loopbacks, start, dst, ttl)` that forwards one IPv4 packet
  the way the data plane does and reports where it ends up.

  - `fibs` maps each router name to a list of routes `[prefix, action]`, for example
    `["10.1.2.0/24", "spine1"]`. Every router named as a next hop appears in `fibs`.
  - Each router looks up only the outermost destination address, using longest-prefix
    match over its own routes (`0.0.0.0/0` matches everything). No match: the packet
    is dropped with outcome `"no route at <router>"`.
  - `action` is a neighbour's name (forward to it), `"local"`, or `"vxlan:<router>"`.
  - `"vxlan:R"` pushes an outer destination, `loopbacks[R]`, and the same router then
    looks that address up.
  - `"local"` on an outer destination means "this is my loopback": pop the outer
    destination and look up the next one at the same router. `"local"` on the
    original destination means it is delivered: `"delivered at <router>"`.
  - Every forward to a neighbour spends one unit of `ttl`. A router that must forward
    when `ttl` is already 0 drops the packet: `"ttl expired at <router>"`.

  Return `{"path": [...], "outcome": "..."}`, where `path` lists the routers the packet
  visited in order, starting with `start` (encapsulating or decapsulating does not add
  an entry).
languages: [python, javascript]
entry: walk_packet
starter:
  python: |
    def walk_packet(fibs, loopbacks, start, dst, ttl):
        # your code here
        return {"path": [start], "outcome": ""}
  javascript: |
    function walk_packet(fibs, loopbacks, start, dst, ttl) {
      // your code here
      return { path: [start], outcome: "" };
    }
tests:
  - args: [{"leaf1": [["10.255.1.13/32", "spine1"], ["10.1.2.0/24", "spine1"], ["10.1.1.0/24", "local"]], "spine1": [["10.255.1.11/32", "leaf1"], ["10.255.1.13/32", "leaf3"]], "leaf3": [["10.255.1.13/32", "local"], ["10.1.2.0/24", "local"]]}, {"leaf1": "10.255.1.11", "spine1": "10.255.1.1", "leaf3": "10.255.1.13"}, "leaf1", "10.1.2.20", 64]
    expected: {"path": ["leaf1", "spine1"], "outcome": "no route at spine1"}
    label: BGP on the leaves only
  - args: [{"leaf1": [["10.255.1.13/32", "spine1"], ["10.1.2.0/24", "spine1"], ["10.1.1.0/24", "local"]], "spine1": [["10.255.1.11/32", "leaf1"], ["10.255.1.13/32", "leaf3"], ["10.1.2.0/24", "leaf3"]], "leaf3": [["10.255.1.13/32", "local"], ["10.1.2.0/24", "local"]]}, {"leaf1": "10.255.1.11", "spine1": "10.255.1.1", "leaf3": "10.255.1.13"}, "leaf1", "10.1.2.20", 64]
    expected: {"path": ["leaf1", "spine1", "leaf3"], "outcome": "delivered at leaf3"}
    label: BGP on the spine too
  - args: [{"leaf1": [["10.255.1.13/32", "spine1"], ["10.1.2.0/24", "vxlan:leaf3"], ["10.1.1.0/24", "local"]], "spine1": [["10.255.1.11/32", "leaf1"], ["10.255.1.13/32", "leaf3"]], "leaf3": [["10.255.1.13/32", "local"], ["10.1.2.0/24", "local"]]}, {"leaf1": "10.255.1.11", "spine1": "10.255.1.1", "leaf3": "10.255.1.13"}, "leaf1", "10.1.2.20", 64]
    expected: {"path": ["leaf1", "spine1", "leaf3"], "outcome": "delivered at leaf3"}
    label: VXLAN to the exit's loopback
  - args: [{"r1": [["0.0.0.0/0", "r2"]], "r2": [["0.0.0.0/0", "r1"]]}, {"r1": "10.255.9.1", "r2": "10.255.9.2"}, "r1", "198.51.100.7", 4]
    expected: {"path": ["r1", "r2", "r1", "r2", "r1"], "outcome": "ttl expired at r1"}
    label: two defaults pointing at each other
  - args: [{"leaf1": [["10.1.2.0/24", "spine1"]], "spine1": [["10.1.0.0/16", "leaf4"], ["10.1.2.0/24", "leaf3"]], "leaf3": [["10.1.2.0/24", "local"]], "leaf4": []}, {"leaf1": "10.255.1.11", "spine1": "10.255.1.1", "leaf3": "10.255.1.13", "leaf4": "10.255.1.14"}, "leaf1", "10.1.2.20", 64]
    expected: {"path": ["leaf1", "spine1", "leaf3"], "outcome": "delivered at leaf3"}
    label: the longest prefix wins
  - args: [{"leaf1": [["10.1.1.0/24", "local"], ["10.1.2.0/24", "spine1"]], "spine1": []}, {"leaf1": "10.255.1.11", "spine1": "10.255.1.1"}, "leaf1", "10.1.1.10", 64]
    expected: {"path": ["leaf1"], "outcome": "delivered at leaf1"}
    label: destination attached to the first router
  - args: [{"leaf1": [["10.255.1.13/32", "spine1"], ["10.1.2.0/24", "vxlan:leaf3"]], "spine1": [["10.255.1.11/32", "leaf1"]], "leaf3": [["10.255.1.13/32", "local"], ["10.1.2.0/24", "local"]]}, {"leaf1": "10.255.1.11", "spine1": "10.255.1.1", "leaf3": "10.255.1.13"}, "leaf1", "10.1.2.20", 64]
    expected: {"path": ["leaf1", "spine1"], "outcome": "no route at spine1"}
    hidden: true
  - args: [{"leaf1": [["10.255.1.13/32", "spine1"], ["10.1.3.0/24", "vxlan:leaf3"]], "spine1": [["10.255.1.13/32", "leaf3"]], "leaf3": [["10.255.1.13/32", "local"], ["10.1.2.0/24", "local"]]}, {"leaf1": "10.255.1.11", "spine1": "10.255.1.1", "leaf3": "10.255.1.13"}, "leaf1", "10.1.3.5", 64]
    expected: {"path": ["leaf1", "spine1", "leaf3"], "outcome": "no route at leaf3"}
    hidden: true
hints:
  - "Keep a stack of destinations: the original at the bottom, outer headers pushed on top. Each router looks up only the top."
  - "Convert addresses to 32-bit integers and compare under a mask of the prefix length; a /0 mask is 0 and matches everything."
  - "Encapsulation and decapsulation happen at the same router, so loop back to the lookup without moving or spending TTL."
```

## Senior signals

- You state the rule before the scenario: BGP picks the exit, and every router on the path must forward what it sees with only its own table.
- You explain encapsulation as changing the lookup key from the customer's address to the exit's loopback, and name each wrapper's cost: 4 bytes and LDP, or 50 bytes and MTU headroom.
- You know each fix has its own black hole: the boot race for BGP everywhere, LDP–IGP desync for MPLS, a missing VTEP loopback or MTU for VXLAN.
- You prefer a next hop that becomes unresolvable to one that keeps resolving through a summary or default, because the first fails fast at the ingress and the second fails slowly far away.
- You treat Established as one rung of evidence and build checks for the rest: next-hop resolution through `/32`s, FIB programming, per-hop path consistency, and probes with customer addresses.
- You source diagnostic probes from addresses that can receive the errors, so a "no route" shows up as `!N` rather than as stars.

## Check yourself

```quiz
- q: >-
    R1, R2 and R3 run IS-IS. R1 and R3 run iBGP between loopbacks; R2 runs no BGP. R3 advertises 10.1.2.0/24 with next hop its loopback. What happens to a packet from a host behind R1 to 10.1.2.20?
  options: ["R1 refuses to install the route because R2 is not a BGP speaker", "The iBGP session never comes up because R2 does not run BGP", "R2 forwards it towards R3 because R1 resolved the next hop through R2", "R2 drops it, because R2 has no route for the customer destination"]
  answer: 3
  explanation: >-
    The session comes up (it is TCP between loopbacks IS-IS carries) and R1 installs the route resolved through R2. But the packet carries only its destination, 10.1.2.20; R2 looks that up in its own table, finds nothing and drops it. The resolved next hop chose R1's first hop and travels nowhere with the packet, so R2 has no idea R3 was intended.
- q: >-
    Meridian's spines run IS-IS only, yet tenant traffic between leaves is delivered. Why?
  options: ["The spines learn tenant routes from IS-IS through redistribution", "Route reflectors install tenant routes into the spines' hardware tables", "The spines flood packets with unknown destinations to every leaf", "Leaves encapsulate packets to the far leaf's loopback, which IS-IS carries"]
  answer: 3
  explanation: >-
    VXLAN wraps each tenant packet in an outer IPv4 header addressed to the egress leaf's loopback, so the spine's lookup is for a /32 IS-IS already gave it. Nothing is redistributed into IS-IS, the reflectors sit beside the spines and program nothing on them, and routers do not flood unknown IP destinations.
- q: >-
    In an MPLS core, the LDP session on one link goes down while the IS-IS adjacency on that link stays up. What happens to customer traffic routed over that link?
  options: ["It is rerouted at once, since IS-IS removes the link when LDP fails", "It is delivered normally, because labels are only an optimisation", "It is delivered, but with an extra label added by the IS-IS process", "It is sent unlabelled, and the next router drops it for lack of a customer route"]
  answer: 3
  explanation: >-
    The ingress router still routes via that link (IS-IS says so) but has no label from that neighbour, so it sends plain IP and the transit router does an IP lookup on the customer address it does not hold: the original black hole. IS-IS does not react to LDP unless LDP-IGP synchronization makes it advertise the link at maximum metric until LDP is back.
- q: >-
    An operator summarises each site's loopbacks into one /24 between sites. A leaf in Amsterdam loses power, and Amsterdam's IS-IS removes its loopback within a second. Why can Singapore keep sending traffic towards it for longer?
  options: ["The EVPN routes are cached in hardware until the next refresh", "Singapore's BGP processes rescan every next hop every 60 seconds", "IS-IS in Singapore must rerun its shortest-path computation first", "The next hop still resolves through the summary until BGP withdraws the routes"]
  answer: 3
  explanation: >-
    The summary stays up while any Amsterdam loopback exists, so next-hop tracking in Singapore sees the dead leaf's loopback still covered and keeps its routes. Traffic stops only when a withdrawal arrives: quickly if a reflector that still sees the /32 validates the next hop, at worst after the reflector's hold timer expires. With the /32 in the IGP, the next hop would become unresolvable within about a second. Periodic scanners are the old design that event-driven tracking replaced.
- q: >-
    A dashboard shows every BGP session Established, every prefix count at baseline and every IS-IS adjacency up. Which check would detect a transit router without a route for a customer prefix?
  options: ["Alerting when BGP session uptime falls below the hold time", "Walking each router's FIB along the resolved path for that destination", "Comparing negotiated address families with the source of truth", "Checking that every BGP next hop resolves through any IGP route"]
  answer: 1
  explanation: >-
    The fault is in a router that holds no BGP session and receives no prefixes, so only a hop-by-hop lookup of the destination (or a data-plane probe) finds it. The families, uptimes and prefix counts are all correct, and the next hop does resolve, through a /32 even; next-hop resolution checks only the first hop's view.
- q: >-
    A transit router that runs BGP everywhere reboots. Traffic through it drops for about three minutes after its IS-IS adjacencies come back, then recovers. What prevents this?
  options: ["Increasing the IS-IS hello interval so adjacencies form later", "Setting the IS-IS overload bit at startup until BGP has converged", "Enabling next-hop-self on the router's iBGP sessions", "Lowering the BGP hold time so sessions establish more quickly"]
  answer: 1
  explanation: >-
    IS-IS converges in seconds and draws traffic through the router while BGP is still loading its table, so packets for uninstalled prefixes drop. The overload bit tells other routers not to use it for transit, while its own addresses stay reachable, until BGP is ready. Hold time affects failure detection, not loading speed; next-hop-self changes next hops; slower hellos delay the race without removing it.
```
