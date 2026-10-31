---
slug: route-reflectors
title: "Route reflectors: how iBGP scales without a full mesh"
description: How a route reflector relaxes iBGP's split-horizon rule for clients, non-clients and eBGP peers, how ORIGINATOR_ID and CLUSTER_LIST stop the loops that creates, why reflectors sit out of the forwarding path and come in pairs, how a reflector hides paths and ADD-PATH brings them back, confederations in brief, and what happens when one or both reflectors fail.
minutes: 50
difficulty: medium
tags: [fabric-networking, bgp, ibgp, route-reflector, originator-id, cluster-list, add-path, confederation, evpn, failure-domains]
problems: []
---
Amsterdam has 16 leaves, and each leaf holds tenant routes the others need: Acme's `10.1.2.0/24` lives behind `leaf3.ams`, and `leaf1.ams` must learn it to reach `acme-db1`. All of them speak iBGP (BGP inside one autonomous system, here the overlay's AS 65000), and iBGP has a rule that a route learned from one iBGP peer is never passed on to another. So every leaf needs a session to every other leaf: a full mesh of $n(n-1)/2$ sessions, 120 for 16 leaves, 1,128 if the 48 leaves of three sites shared one mesh. Adding `leaf17.ams` would mean 16 new sessions and a configuration change on 16 routers that have nothing to do with it.

A **route reflector** removes the mesh. It is an iBGP speaker allowed to break the rule, so each leaf needs two sessions (one to each reflector of a redundant pair) however large the site grows. Breaking a loop-prevention rule creates loops, so reflection adds two attributes to catch them; it also hides paths, because a reflector passes on only the one it thinks is best. On Meridian every leaf is a client of `rr1.ams` (`10.255.1.101`) and `rr2.ams` (`10.255.1.102`), and the reflectors of the three sites peer with each other.

The reminder from [iBGP, loops and next hops](/learn/fabric-networking/bgp-fundamentals/ibgp-loops-and-next-hops): inside one AS the AS_PATH (the list of ASes a route has crossed) never grows, so it cannot reveal a loop, and BGP prevents iBGP loops by never relaying iBGP-learned routes to other iBGP peers.

## The reflection rules

Route reflection is defined in RFC 4456 (2006). Its vocabulary:

- A **route reflector** (RR) is an iBGP speaker configured to reflect.
- A **client** is an iBGP peer that the reflector has been told is its client. The client is an ordinary BGP speaker with no setting of its own and does not know it is a client. All of Meridian's leaves are clients of their site's two reflectors.
- A **non-client** is any other iBGP peer of the reflector. Meridian's reflectors are non-clients of each other, within a site and across sites.
- A **cluster** is a reflector plus its clients. Its **cluster ID** is a 32-bit number written like an IPv4 address. It defaults to the reflector's router ID; Meridian configures `10.255.1.100` for both Amsterdam reflectors, `10.255.2.100` for Singapore's and `10.255.3.100` for San Jose's. It need not be a reachable address.

When a reflector selects a best path for a prefix, who hears it depends on where that path came from:

| Best path learned from | Reflected to | Why |
|---|---|---|
| A client | Every client and every non-client | Clients have no mesh, so the reflector must tell everyone |
| A non-client iBGP peer | Clients only | Non-clients are fully meshed with each other, so each heard the route from its source; plain split horizon applies among them |
| An eBGP peer (another AS) | Every client and non-client | Ordinary BGP: eBGP-learned routes always go to iBGP peers |

The second row is the one to remember. The reflectors themselves form a small mesh of ordinary iBGP peers: Meridian's six reflectors need $6 \times 5 / 2 = 15$ sessions among themselves. A route that `rr1.sin` learns from `rr1.ams` goes to Singapore's leaves and to nobody else.

Three more properties follow from the RFC:

- **A reflector reflects only its best path**, as any BGP speaker advertises only its best. That is the origin of hidden paths, below.
- **A reflector changes no forwarding attribute.** RFC 4456 says it should not modify NEXT_HOP, AS_PATH, LOCAL_PREF or MED (the next-hop address, AS list, local preference and multi-exit discriminator from [updates, attributes and RIBs](/learn/fabric-networking/bgp-fundamentals/updates-attributes-and-ribs)) when reflecting. Every client therefore sees the route exactly as if it had a session to the originator, with the originator's loopback as next hop.
- **Clients may still peer with each other.** If they are already meshed, client-to-client reflection can be disabled on the reflector to save the duplicate updates.

The session arithmetic, as the visualisation tabulates it:

| Leaves | Full mesh $n(n-1)/2$ | One reflector pair per site |
|---|---|---|
| 4 (small example) | 6 | 8 + 1 = 9 |
| 16 (all of `ams`) | 120 | 32 + 1 = 33 |
| 48 (three sites) | 1,128 | 96 + 15 = 111 |

For four leaves reflectors cost more sessions than the mesh. The point is the growth: $2n$ plus a constant instead of $n^2/2$, and a new leaf touches no existing router, because Meridian's reflectors accept any session from the site's loopback range ([BGP sessions and the FSM](/learn/fabric-networking/bgp-fundamentals/bgp-sessions-and-the-fsm)).

**What reflection solves:** iBGP without a full mesh, with $O(n)$ sessions and no configuration on existing routers when one is added. **How it breaks:** loops (next section), hidden paths, and a reflector pair whose failure takes the whole overlay with it. **Signal:** per-leaf sessions to the reflectors, and whether both reflectors hold the same table.

## ORIGINATOR_ID and CLUSTER_LIST: closing the loops reflection opens

Split horizon existed to stop loops, and reflection switches it off. Two reflectors reflecting to each other, or a reflector whose client is itself a reflector, could pass a route around a cycle forever, and AS_PATH cannot help because nothing is added to it inside the AS. RFC 4456 adds two optional, non-transitive path attributes ("optional" means a speaker need not understand it; "non-transitive" means a speaker that does not understand it drops it instead of passing it on). Both describe the route's journey inside one AS, so they are never sent to an eBGP peer:

- **ORIGINATOR_ID** (attribute type 9): the router ID of the speaker that injected the route into the AS. The first reflector to reflect the route writes it, using the router ID of the peer it learned the route from. Later reflectors never change it. **Rule:** a router that receives a route carrying its own router ID as ORIGINATOR_ID discards it. That stops a route returning to its originator.
- **CLUSTER_LIST** (attribute type 10): the cluster IDs of every cluster the route has been reflected through, newest first. Each reflector prepends its own cluster ID when it reflects. **Rule:** a reflector that receives a route whose CLUSTER_LIST already contains its own cluster ID discards it. That stops a route circling between reflectors, the iBGP equivalent of AS_PATH loop detection.

Both are encoded like any path attribute: a flags byte, a type code, a length and a value. Here are the two as `rr1.ams` writes them on Acme's `10.1.2.0/24` from `leaf3.ams` (router ID `10.255.1.13`):

| Field | Size | ORIGINATOR_ID | CLUSTER_LIST | What reads it |
|---|---|---|---|---|
| Attribute flags | 1 byte | `0x80` (optional, non-transitive) | `0x80` | Parser; a speaker that does not know the type ignores it and does not forward it |
| Type code | 1 byte | 9 | 10 | Parser |
| Length | 1 byte | 4 | 4 (4 per cluster ID) | Parser |
| Value | 4 bytes, or 4 × entries | `0a ff 01 0d` (10.255.1.13) | `0a ff 01 64` (10.255.1.100) | Every receiver for the originator check; reflectors for the cluster check; best-path selection |

Seven bytes each, fourteen per reflected route; a route reflected through Amsterdam and then Singapore carries an 8-byte CLUSTER_LIST value, `0a ff 02 64 0a ff 01 64`.

The attributes also enter the best-path decision ([the best-path algorithm](/learn/fabric-networking/bgp-fundamentals/the-best-path-algorithm) has the full order). Near the end of the order BGP compares router IDs; for a reflected route RFC 4456 uses its ORIGINATOR_ID instead, the router that injected it, rather than the reflector that relayed it. A new step after it prefers the **shorter CLUSTER_LIST**, the route reflected through fewer clusters. Only then does the last tie-breaker, the lowest peer address, apply.

```viz
{"type": "fabric", "scenario": "route-reflector", "title": "Route reflection on four Amsterdam leaves: from a full mesh to a reflector pair, two loop checks, and one then both reflectors failing", "caption": "Six full-mesh sessions and why split horizon needs them; the reflector pair and the session table; leaf3.ams's 10.1.2.0/24 reflected by rr1.ams with ORIGINATOR_ID 10.255.1.13 and CLUSTER_LIST 10.255.1.100 and its next hop unchanged; leaf1.ams holding two identical copies; rr1's copy to rr2.ams dropped for the shared cluster ID and a copy back to leaf3.ams ignored for its own ORIGINATOR_ID; the cost of the shared cluster ID when leaf3's session to rr2 is down; rr1.ams failing with no traffic impact, then both failing and the overlay routes withdrawn."}
```

**What the two attributes solve:** loop prevention inside one AS once split horizon is off. **How they break:** they compare identifiers, so duplicated identifiers make them discard good routes (two leaves sharing a router ID each discard the other's routes; two sites sharing a cluster ID discard each other's). **Signal:** routes received but discarded for "originator loop" or "cluster loop", a counter or log most implementations keep per peer.

## Traced: one route across Meridian's reflectors

`leaf3.ams` advertises `10.1.2.0/24` (an EVPN route in production, [EVPN, the control plane](/learn/fabric-networking/overlays-vxlan-evpn/evpn-the-control-plane); reflection treats every address family the same way). `acme-web2` on `leaf2.sin` must reach it. Follow it:

| Step | From → to | Rule applied | ORIGINATOR_ID | CLUSTER_LIST on arrival | Result |
|---|---|---|---|---|---|
| 1 | `leaf3.ams` → `rr1.ams`, `rr2.ams` | Ordinary iBGP from the originator | none | empty | Accepted by both |
| 2 | `rr1.ams` → `leaf1.ams`, `leaf2.ams`, `leaf4.ams` … | Learned from a client: reflect to all | 10.255.1.13 | 10.255.1.100 | Accepted; each leaf gets a second identical copy from `rr2.ams` |
| 3 | `rr1.ams` → `rr2.ams` | Learned from a client: reflect to non-clients too | 10.255.1.13 | 10.255.1.100 | **Discarded**: `rr2.ams`'s own cluster ID is in the list (and the same in reverse) |
| 4 | `rr1.ams`, `rr2.ams` → `rr1.sin`, `rr2.sin`, `rr1.sjc`, `rr2.sjc` | Reflect to non-clients | 10.255.1.13 | 10.255.1.100 | Accepted; each remote reflector holds two copies |
| 5 | `rr1.sin` picks its best | ORIGINATOR_ID ties, CLUSTER_LIST length 1 ties, lower peer address `10.255.1.101` | | | `rr1.ams`'s copy wins |
| 6 | `rr1.sin` → Singapore's leaves | Learned from a non-client: clients only, not `rr2.sin`, not San Jose | 10.255.1.13 | 10.255.2.100, 10.255.1.100 | Accepted; `leaf2.sin` holds two copies, from `rr1.sin` and `rr2.sin` |
| 7 | `leaf2.sin` forwards | NEXT_HOP is still `10.255.1.13`, resolved through IS-IS | | | VXLAN from `leaf2.sin` straight to `leaf3.ams`'s loopback |

Step 6 is why the reflector mesh does not loop: `rr1.sin` will never hand the route to another reflector. Step 7 is why reflectors carry no traffic: the next hop names the leaf, never a reflector. The simulator below implements the rules, the two loop checks and the RFC 4456 tie-breaks on that topology (four leaves per site, two sites), then runs the shared-cluster-ID trade-off and the hidden-path case from later sections.

```python
import ipaddress
from collections import deque
from dataclasses import dataclass, replace


@dataclass(frozen=True)
class Route:
    prefix: str
    next_hop: str
    originator_id: str | None = None   # set by the first reflector
    cluster_list: tuple = ()           # cluster IDs, newest first


def ip(a):
    return int(ipaddress.ip_address(a))


class Speaker:
    def __init__(self, name, router_id, cluster_id=None, add_path=False):
        self.name, self.router_id = name, router_id
        self.cluster_id = cluster_id   # None: an ordinary iBGP speaker, not a reflector
        self.add_path = add_path       # reflector sends every path, not only the best
        self.peers = {}                # peer name -> "client" | "non-client" | "ibgp"
        self.paths = {}                # prefix -> {learned from: Route}
        self.out = {}                  # (peer, prefix) -> what we last sent

    def receive(self, route, frm, log):
        if route.originator_id == self.router_id:
            log.append(f"{self.name:<9} drops copy from {frm}: ORIGINATOR_ID is my router ID")
            return
        if self.cluster_id and self.cluster_id in route.cluster_list:
            log.append(f"{self.name:<9} drops copy from {frm}: my cluster ID {self.cluster_id} in CLUSTER_LIST")
            return
        self.paths.setdefault(route.prefix, {})[frm] = route

    def ranked(self, prefix, net):
        def key(item):
            frm, r = item
            # RFC 4456: ORIGINATOR_ID stands in for the router ID, then shorter
            # CLUSTER_LIST, then lower peer address (LOCAL_PREF etc. tie here).
            peer = frm.split("#")[0]                     # "rr1.ams#2": rr1's second path
            rid = r.originator_id or net[peer].router_id
            peer_addr = net[peer].router_id
            return (ip(rid), len(r.cluster_list), ip(peer_addr))
        return sorted(self.paths.get(prefix, {}).items(), key=key)

    def exports(self, prefix, net):
        """(peer, routes) pairs this speaker would advertise for one prefix."""
        ranked = self.ranked(prefix, net)
        if not ranked:
            return []
        frm, best = ranked[0]
        kind = "local" if frm == self.name else self.peers[frm]
        if self.cluster_id is None:                      # plain iBGP split horizon
            targets = list(self.peers) if kind == "local" else []
        elif kind in ("local", "client"):                # client: everyone
            targets = list(self.peers)
        else:                                            # non-client: clients only
            targets = [p for p, k in self.peers.items() if k == "client"]
        chosen = ranked if self.add_path else [(frm, best)]
        result = []
        for peer in targets:
            routes = []
            for src, r in chosen:
                src = src.split("#")[0]
                if src == peer:
                    continue                             # never echo a path to its sender
                if self.cluster_id and src != self.name:  # reflecting: stamp the attributes
                    r = replace(r, originator_id=r.originator_id or net[src].router_id,
                                cluster_list=(self.cluster_id,) + r.cluster_list)
                routes.append(r)
            result.append((peer, tuple(routes)))
        return result


def propagate(net, origins):
    """Deliver UPDATEs until no speaker's advertisements change."""
    log, queue = [], deque()
    for name, route in origins:
        net[name].paths.setdefault(route.prefix, {})[name] = route
        queue.append((name, route.prefix))
    while queue:
        name, prefix = queue.popleft()
        me = net[name]
        for peer, routes in me.exports(prefix, net):
            if me.out.get((peer, prefix)) == routes:
                continue
            me.out[(peer, prefix)] = routes
            held = net[peer].paths.setdefault(prefix, {})
            for key in [k for k in held if k.split("#")[0] == name]:
                del held[key]                            # new UPDATE replaces the old
            for i, r in enumerate(routes):
                net[peer].receive(r, name if i == 0 else f"{name}#{i + 1}", log)
            queue.append((peer, prefix))
    return log


def build(sites, shared_cluster=True, add_path=False, leaves=4):
    net = {}
    rrs = []
    for s in sites:
        for n in (1, 2):
            rid = f"10.255.{s}.{100 + n}"
            cid = f"10.255.{s}.100" if shared_cluster else rid
            net[f"rr{n}.{SITE[s]}"] = Speaker(f"rr{n}.{SITE[s]}", rid, cid, add_path)
            rrs.append(f"rr{n}.{SITE[s]}")
        for i in range(1, leaves + 1):
            leaf = f"leaf{i}.{SITE[s]}"
            net[leaf] = Speaker(leaf, f"10.255.{s}.{10 + i}")
            for n in (1, 2):
                net[leaf].peers[f"rr{n}.{SITE[s]}"] = "ibgp"
                net[f"rr{n}.{SITE[s]}"].peers[leaf] = "client"
    for a in rrs:                                        # reflectors: full mesh, non-clients
        for b in rrs:
            if a != b:
                net[a].peers[b] = "non-client"
    return net


SITE = {1: "ams", 2: "sin"}


def show(net, who, prefix):
    for frm, r in net[who].ranked(prefix, net):
        print(f"  {who} via {frm:<9} next hop {r.next_hop:<12} ORIGINATOR_ID {r.originator_id}  CLUSTER_LIST {list(r.cluster_list)}")


acme = Route("10.1.2.0/24", "10.255.1.13")
print("1. leaf3.ams originates 10.1.2.0/24, shared cluster IDs per site")
net = build([1, 2])
for line in propagate(net, [("leaf3.ams", acme)]):
    print("  " + line)
show(net, "leaf1.ams", acme.prefix)
show(net, "rr1.sin", acme.prefix)
show(net, "leaf2.sin", acme.prefix)

print("\n2. same, but leaf3.ams's session to rr2.ams is down")
for cluster in (True, False):
    net = build([1], shared_cluster=cluster)
    del net["leaf3.ams"].peers["rr2.ams"]
    del net["rr2.ams"].peers["leaf3.ams"]
    propagate(net, [("leaf3.ams", acme)])
    label = "shared cluster ID   " if cluster else "per-reflector IDs   "
    print(f"  {label} rr2.ams paths: {len(net['rr2.ams'].paths.get(acme.prefix, {}))}, "
          f"leaf1.ams paths: {len(net['leaf1.ams'].paths[acme.prefix])}")

print("\n3. gw1.ams and gw2.ams both originate 0.0.0.0/0 (hidden path)")
for add_path in (False, True):
    net = build([1], add_path=add_path)
    for g, rid in (("gw1.ams", "10.255.1.201"), ("gw2.ams", "10.255.1.202")):
        net[g] = Speaker(g, rid)
        for n in (1, 2):
            net[g].peers[f"rr{n}.ams"] = "ibgp"
            net[f"rr{n}.ams"].peers[g] = "client"
    propagate(net, [("gw1.ams", Route("0.0.0.0/0", "10.255.1.201")),
                    ("gw2.ams", Route("0.0.0.0/0", "10.255.1.202"))])
    hops = sorted({r.next_hop for r in net["leaf1.ams"].paths["0.0.0.0/0"].values()})
    print(f"  ADD-PATH {'on ' if add_path else 'off'}: leaf1.ams holds "
          f"{len(net['leaf1.ams'].paths['0.0.0.0/0'])} paths, next hops {hops}")
```

```text
1. leaf3.ams originates 10.1.2.0/24, shared cluster IDs per site
  rr2.ams   drops copy from rr1.ams: my cluster ID 10.255.1.100 in CLUSTER_LIST
  rr1.ams   drops copy from rr2.ams: my cluster ID 10.255.1.100 in CLUSTER_LIST
  leaf1.ams via rr1.ams   next hop 10.255.1.13  ORIGINATOR_ID 10.255.1.13  CLUSTER_LIST ['10.255.1.100']
  leaf1.ams via rr2.ams   next hop 10.255.1.13  ORIGINATOR_ID 10.255.1.13  CLUSTER_LIST ['10.255.1.100']
  rr1.sin via rr1.ams   next hop 10.255.1.13  ORIGINATOR_ID 10.255.1.13  CLUSTER_LIST ['10.255.1.100']
  rr1.sin via rr2.ams   next hop 10.255.1.13  ORIGINATOR_ID 10.255.1.13  CLUSTER_LIST ['10.255.1.100']
  leaf2.sin via rr1.sin   next hop 10.255.1.13  ORIGINATOR_ID 10.255.1.13  CLUSTER_LIST ['10.255.2.100', '10.255.1.100']
  leaf2.sin via rr2.sin   next hop 10.255.1.13  ORIGINATOR_ID 10.255.1.13  CLUSTER_LIST ['10.255.2.100', '10.255.1.100']

2. same, but leaf3.ams's session to rr2.ams is down
  shared cluster ID    rr2.ams paths: 0, leaf1.ams paths: 1
  per-reflector IDs    rr2.ams paths: 1, leaf1.ams paths: 2

3. gw1.ams and gw2.ams both originate 0.0.0.0/0 (hidden path)
  ADD-PATH off: leaf1.ams holds 2 paths, next hops ['10.255.1.201']
  ADD-PATH on : leaf1.ams holds 4 paths, next hops ['10.255.1.201', '10.255.1.202']
```

The non-obvious lines: `exports` is the rule table, with the plain-speaker branch reproducing split horizon (a leaf re-advertises only routes it originated). Stamping happens only when a reflector passes on someone else's route, which is why locally originated routes carry no CLUSTER_LIST. `out` remembers what each peer was last sent, so the loop ends when nothing changes, and a new advertisement replaces the old one, as BGP's implicit withdraw does. Like many implementations, the model never echoes a path to the peer it came from, so the ORIGINATOR_ID check never fires here; the visualisation shows it catching an implementation that does echo.

## Redundant reflector pairs: one cluster ID or two

A reflector is a single point of failure for every route it carries, so reflectors come in pairs and every client peers with both. The pair's design question is the cluster ID, and run 2 above shows the trade-off.

**Shared cluster ID (Meridian's choice, `10.255.1.100`).** Each reflector discards the other's reflected copies (step 3 of the trace), so each holds exactly one path per client route: the one learned directly. Memory per reflector is minimal. The cost appears when one client session is down: if `leaf3.ams`'s session to `rr2.ams` drops, `rr2.ams` cannot use `rr1.ams`'s copy, so every other leaf holds `leaf3.ams`'s routes from `rr1.ams` alone. Nothing is lost yet, but redundancy for those routes has quietly fallen to one reflector.

**One cluster ID per reflector (each defaults to its own router ID).** `rr2.ams` accepts `rr1.ams`'s copy, so it still serves `leaf3.ams`'s routes after the direct session drops (run 2: one path at `rr2.ams`, two at `leaf1.ams`). Each reflector stores roughly twice the paths, one direct and one via its partner. Assume, for Meridian, about 1,300 overlay routes per site (host MAC/IP routes plus prefix routes; the real figure scales with hosts and tenants): doubling that is negligible. For a pair carrying several full internet tables of about a million prefixes each, it is real memory and real update processing.

Both designs are common. Shared IDs suit tightly managed pairs where a single client session down is alarmed and fixed fast; distinct IDs suit designs where client sessions to one reflector can be lost for longer, such as clients spread across distant locations. Either way, the cluster ID must be unique across clusters: if a template copies Amsterdam's `10.255.1.100` into Singapore's reflectors, they discard every route reflected from Amsterdam as a loop, and inter-site tenant traffic fails with every session Established.

**What the pair solves:** no single reflector failure removes a route. **How it breaks:** the redundancy erodes without an outage (one session down under a shared ID; a partner missing routes), and nobody notices until the second failure. **Signal:** the two reflectors' tables diffed against each other, and per-client "how many reflectors does each prefix come from".

## Placement out of the forwarding path

A reflector never appears as a next hop, so no tenant packet ever needs to cross it. Traffic from `leaf1.ams` to `10.1.2.0/24` is VXLAN-encapsulated to `10.255.1.13`, and the spines forward it on the outer IP header alone, through routes they already have from IS-IS. Spines need no overlay routes at all, the arrangement [the BGP black hole](/learn/fabric-networking/bgp-fundamentals/the-bgp-black-hole) explains from the other side. That lets Meridian put `rr1.ams` and `rr2.ams` beside the fabric instead of in it: each is an x86 server running a BGP daemon (FRRouting, or a vendor's virtual router image), attached by two links, `rr1.ams` to `spine1.ams` and `spine2.ams`, `rr2.ams` to `spine3.ams` and `spine4.ams`, on separate racks and power feeds.

What being out of the path buys:

- **The right hardware.** A reflector's work is CPU and memory: best-path runs and updates for every client. A server has tens of cores and hundreds of GB of RAM; a switch has a modest CPU beside an ASIC (the switching chip) a reflector would not use.
- **Maintenance with no traffic impact.** Rebooting `rr1.ams` moves no packets, because `rr2.ams` holds the same routes and next hops do not change.
- **Fewer coupled failures.** A spine that is also a reflector couples forwarding and route distribution, so one crash takes both. Small fabrics still make spines the reflectors to save hardware, a reasonable trade at a few leaves.

Out of the path must also mean out of the IGP's path. To IS-IS, `rr1.ams` is a router between `spine1.ams` and `spine2.ams`. If `leaf3.ams`'s link to `spine1.ams` fails, `spine1.ams` reaches `leaf3.ams` in three hops either through another leaf and spine or through `rr1.ams` and `spine2.ams`, and a server forwarding in software would take a share of that traffic. Meridian sets the IS-IS **overload bit** on its reflectors: "reach my own addresses, but never route through me" ([IS-IS from zero](/learn/fabric-networking/underlay/is-is-from-zero)). Equally, a reflector never rewrites next hops: next-hop-self on `rr1.ams` would make every leaf send VXLAN to `10.255.1.101`, which is not a VTEP (VXLAN tunnel endpoint), and the overlay would black-hole.

One subtlety is the reflector's point of view. When two exits tie on everything up to IGP cost, the reflector picks the one nearest *to itself*, and its clients inherit that choice. In a symmetric leaf-spine site that rarely matters; in a backbone with reflectors in one city and clients in many, it sends traffic to the reflector's nearest exit. RFC 9107 (optimal route reflection) lets a reflector run best path from a client's position instead.

## Hidden paths and ADD-PATH

Each reflector advertises one path per prefix, so any other path it holds is invisible to its clients: a **hidden path**. Run 3 shows it. `gw1.ams` (`10.255.1.201`) and `gw2.ams` (`10.255.1.202`), Amsterdam's internet gateways, are clients of the reflectors like any leaf, and each originates a default route `0.0.0.0/0` into the fabric's IPv4 unicast table, next hop its own loopback. Every attribute ties, and IGP cost from each reflector to each gateway is equal, so both reflectors fall through to the router ID and pick `gw1.ams`. `leaf1.ams` receives two paths, one per reflector, and both say `10.255.1.201`. `gw2.ams`'s path exists only inside the reflectors.

Three consequences:

1. **No load sharing.** All internet-bound traffic leaves through `gw1.ams` while `gw2.ams` idles, even with BGP multipath on every leaf, because multipath can only spread over paths a router holds.
2. **Slower failover.** When `gw1.ams` loses power, IS-IS withdraws its loopback within about a second ([convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd)). The leaves mark the path unusable and have nothing else, so they wait for each reflector to notice, rerun best path and send `gw2.ams`'s path: tens to hundreds of milliseconds more, depending on reflector load, or nine seconds if a reflector learns of it only from its hold timer.
3. **Instability in rarer cases.** When MED is compared only between routes from the same neighbouring AS, hidden paths can make reflectors and clients change their choices in a cycle that never settles (RFC 3345); RFC 7964 lists the cures, including advertising more paths.

Two fixes exist.

**Make the paths different routes.** VPN address families glue a **route distinguisher** (RD, an 8-byte value that makes otherwise identical prefixes distinct) onto every prefix. Meridian writes it as `<loopback>:<vni>`, so the same tenant prefix from two leaves is two routes, and a reflector reflects both: the standard cure in EVPN and MPLS VPNs ([VRFs and multi-tenancy](/learn/fabric-networking/overlays-vxlan-evpn/vrfs-and-multi-tenancy)). When a template gives two routers the same RD, their routes collapse into one at the reflector and the second path vanishes.

**ADD-PATH (RFC 7911, 2016).** The session negotiates capability 69 in the OPEN, per address family, with a send/receive flag: 1 receive, 2 send, 3 both. The reflector must be allowed to send and the client to receive. Each NLRI (the prefix field of an UPDATE) then gains a 4-byte **path identifier**, so two announcements of the same prefix no longer replace each other. The two default routes on the `rr1.ams` → `leaf1.ams` session:

| Field | Size | First path | Second path | What reads it |
|---|---|---|---|---|
| Path identifier | 4 bytes | 1 (`00 00 00 01`) | 2 (`00 00 00 02`) | Receiver: the key, with peer and prefix, that a later announcement or withdrawal must match |
| Prefix length | 1 byte | 0 | 0 | Parser: how many prefix bits follow |
| Prefix | 0 bytes (a /0 has none) | | | Lookup |
| Path attributes (one UPDATE per path, since the next hops differ) | variable | NEXT_HOP 10.255.1.201 | NEXT_HOP 10.255.1.202 | Best path and multipath on the client |

Path identifiers are chosen by the sender and mean something only on that session. With ADD-PATH on, `leaf1.ams` holds four paths with two next hops (run 3), can spread flows over both gateways with multipath, and when `gw1.ams` dies, it drops that next hop locally the moment IS-IS removes the loopback, without waiting for any BGP update. Precomputing that backup in the forwarding table is BGP PIC ([convergence and scale](/learn/fabric-networking/bgp-in-the-real-world/convergence-and-scale)).

The costs: clients store more paths and the reflector sends more updates, so implementations offer "all paths", "best N" or "best plus one backup". Support varies by address family and implementation, one reason EVPN fabrics rely on per-router RDs. A second path is used only if multipath is enabled on the client, and paths with different AS_PATHs, as two ISPs' have, usually need a relaxed comparison too ([the best-path algorithm](/learn/fabric-networking/bgp-fundamentals/the-best-path-algorithm)).

**What ADD-PATH solves:** clients see every path, not the reflector's single choice. **How it breaks:** negotiated in one direction only, or multipath left off, it changes nothing; set to "all" on a large table, it multiplies memory. **Signal:** paths per prefix and distinct next hops per prefix at the client, compared with the same counts at the reflector.

## Confederations in brief

A **confederation** (RFC 5065) is the other way to avoid the full mesh: split the AS into **member ASes**, usually private numbers, that run eBGP-like sessions between them, while the outside world still sees one AS. If Meridian, hypothetically, made each site a member AS of confederation 65000 (`ams` 65010, `sin` 65020, `sjc` 65030), Acme's route would travel like this:

| Hop | Session type | AS_PATH after the hop | Kept unchanged |
|---|---|---|---|
| Inside 65010 | Ordinary iBGP (full mesh or reflectors) | empty | Everything |
| 65010 → 65020 | Confederation eBGP | `(65010)`, an AS_CONFED_SEQUENCE segment | NEXT_HOP, LOCAL_PREF, MED |
| 65020 → 65030 | Confederation eBGP | `(65020 65010)` | NEXT_HOP, LOCAL_PREF, MED |
| 65030 → 65010 (looped) | Confederation eBGP | `(65030 65020 65010)` | Rejected: 65010 is already in the path |
| Leaving the confederation | Real eBGP | `65000`; member ASes stripped | Normal eBGP rules |

The member-AS segments (AS_CONFED_SEQUENCE, segment type 3, and AS_CONFED_SET, type 4) do loop prevention exactly as AS_PATH does between real ASes, and they are not counted in AS_PATH length for best path. Inside each member AS the full-mesh rule still applies, so large confederations use reflectors inside them as well.

Confederations change every router's configuration (each needs its member AS and the confederation's peers), while reflection changes only the reflectors. That is why data center fabrics with an iBGP overlay choose reflectors (fabrics that run eBGP everywhere, as in [BGP as the underlay](/learn/fabric-networking/underlay/bgp-as-the-underlay), have no iBGP mesh to avoid), while confederations appear in large provider backbones and after mergers, where two existing ASes become members of one without renumbering.

## When one or both reflectors fail

Timelines on Meridian, with the 9-second hold time from [BGP sessions and the FSM](/learn/fabric-networking/bgp-fundamentals/bgp-sessions-and-the-fsm):

**`rr1.ams` loses power.**

| Time | What happens | Tenant traffic |
|---|---|---|
| 0 s | `rr1.ams` stops | Unaffected: no packet crosses it |
| about 1 s | IS-IS removes `10.255.1.101/32` (with BFD on the sessions, the session drops in under a second) | Unaffected |
| 6–9 s without BFD | Each leaf's hold timer expires; it deletes `rr1.ams`'s paths | Unaffected |
| Same instant | Best path moves to `rr2.ams`'s identical copy, for every overlay route the leaf holds | Unaffected: same next hops, so the forwarding table does not change |

Nothing a user sees changes, which is the danger: the site now runs on one reflector, and the only signal is a session down and every prefix arriving from one source. When `rr1.ams` returns, implementations can hold back their first best-path run until peers have sent End-of-RIB (an empty UPDATE marking the end of the initial table) or a startup delay expires, so they do not advertise a half-built table; even without that, `rr2.ams`'s copies remain.

**Both reflectors fail.** Within 9 s every leaf deletes every overlay route learned from them. Remote MACs, tenant prefixes and VTEP flood lists vanish, and tenant traffic between leaves stops while every spine, link and IS-IS adjacency is healthy. Traffic between hosts on the same leaf continues.

"Forwarding continues on the last known state" is true only with **graceful restart** (RFC 4724): if it was negotiated and the session dropped without a NOTIFICATION, as when the reflector's process restarts, the leaves keep its routes as stale for the advertised restart time (120 s is a common default). A hold-timer expiry counts as a real failure unless both sides support RFC 8538, and BFD's interaction with graceful restart varies by implementation. Long-lived graceful restart (RFC 9494) can keep stale routes for hours at lowest preference ([convergence and scale](/learn/fabric-networking/bgp-in-the-real-world/convergence-and-scale)). Even then nothing new is learned: a moved VM or a new tenant subnet stays wrong until a reflector returns.

Double failures rarely come from two independent faults. They come from what the two share:

- **Infrastructure:** one hypervisor, rack, power feed or management network.
- **Software:** both receive the same UPDATE. A malformed attribute used to reset every session that carried it; RFC 7606's "treat as withdraw" turns most such errors into the withdrawal of one route. An UPDATE that triggers a bug crashes both daemons, which is why some operators run different software on the two.
- **Change:** both upgraded in one window, or given the same bad template. Work on one reflector at a time, verifying the other holds the full table and every client session first ([operating BGP safely](/learn/fabric-networking/bgp-in-the-real-world/operating-bgp-safely)).

**What the second reflector solves:** a reflector failure becomes a non-event for traffic. **How it breaks:** correlated failure, and a long, unnoticed period on one reflector. **Signal:** client sessions per reflector, alarmed at the first loss, and inventory showing what the two share.

## Failure modes in production

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Both reflectors down | Overlay traffic between leaves stops; underlay fine; sessions to both reflectors down on every leaf | Session state on any leaf; what the two reflectors share (power, host, change ticket) | Restore one; separate the pair's failure domains |
| Cluster ID copied across sites | No routes from one site at another; sessions all Established | "Cluster loop" discards on the receiving reflectors; compare cluster IDs in the source of truth | Unique cluster ID per cluster |
| Duplicate router ID on two leaves after a hardware swap | Each leaf is missing exactly the routes the other originates | Routes from that reflector discarded for "originator loop"; two devices with one router ID | Unique router IDs, checked before deploy |
| Leaf configured as a non-client on one reflector | That leaf receives other sites' routes from the other reflector only, and its own routes leave the site through the other reflector only | Non-client-learned routes go only to clients; compare the leaf's peer type with intent | Mark it a client |
| Next-hop-self applied on the reflector | Overlay traffic black-holes; next hops all show the reflector's loopback | NEXT_HOP on received routes equals a reflector address | Remove the policy; reflectors never rewrite next hops |
| Reflector carries transit traffic | Drops or latency during a fabric link failure, on a server's links | Traceroute or flow data through the reflector; overload bit not set | Set the IS-IS overload bit on reflectors |
| Hidden path | One gateway idles; failover takes BGP updates instead of a local next-hop removal | Reflector holds two paths, clients one | ADD-PATH, or per-router RDs in VPN families |
| Overloaded reflector | MAC moves and new routes take seconds to reach leaves | Reflector CPU, update queue depth, propagation delay of a test route | More CPU, update groups, splitting families across reflectors |

## Trade-offs: ways to avoid the full mesh

| | Full mesh | Reflector pair, shared cluster ID | Reflector pair, distinct IDs | Reflectors + ADD-PATH | Confederation |
|---|---|---|---|---|---|
| Sessions for $n$ routers | $n(n-1)/2$ | $2n + 1$ | $2n + 1$ | $2n + 1$ | Mesh per member AS plus inter-member links |
| Paths a client sees | All | Reflector's best, from each reflector | Same | All, or best N | Best per member-AS link |
| Adding a router touches | Every router | Reflectors only (none with listen ranges) | Reflectors only | Reflectors only | Its member AS |
| Reflector memory | n/a | Lowest: one path per client route | About twice | Clients hold several paths too | n/a |
| Redundancy when one client session fails | n/a | One copy left | Both reflectors still serve it | Same as underlying design | n/a |
| Typical home | Under about 10 routers | Data center fabrics | Distributed clients, backbones | Edges with several exits | Large ISPs, mergers |

## Under the hood: what a reflector does

A reflector daemon (FRRouting on x86, for example) keeps an Adj-RIB-In per client, runs best path per prefix and builds outgoing updates. With 18 clients in Amsterdam (16 leaves, 2 gateways), encoding every update 18 times would waste most of the work, so implementations group peers sharing an outbound policy into **update groups**: each update is encoded once and written to every member's TCP socket. Policy differences between clients split groups and multiply the work, visible in reflector CPU. Large provider backbones push the same design further with a hierarchy: regional reflectors are clients of a top tier, each tier its own cluster, which is where a long CLUSTER_LIST and its loop check do real work.

Reflectors forward nothing, so implementations offer a setting to skip installing reflected routes in the kernel's forwarding table. Memory per path depends on the implementation and the attributes, of the order of a few hundred bytes. An Amsterdam reflector with a shared cluster ID holds its own site's 1,300 routes once and each other site's twice (one copy from each remote reflector): about 6,500 paths, trivial; a pair reflecting full internet tables with ADD-PATH holds millions, which is why such reflectors are sized as servers.

## What the platform should show

A reflector problem rarely shows up as an outage first; it shows up as redundancy quietly lost. Tooling should surface:

- **Per leaf: reflector sessions up, out of two.** Two is green, one is yellow ("routing, no spare"), zero is red. A dashboard that turns red only at zero misses the whole point of the pair.
- **The two reflectors' tables diffed.** Same prefix counts per family and the same set of originating clients; a difference names the missing client session or the missing partner copy.
- **Sources per prefix at clients.** The share of prefixes a leaf holds from only one reflector.
- **Discards for originator and cluster loops,** per peer. Any non-zero count on Meridian means a duplicated identifier.
- **Propagation delay.** A test ("beacon") route announced from one leaf on a schedule, timed until it reaches every other leaf through each reflector, measures reflector health in the units users feel.
- **Static checks before deploy:** unique router IDs, unique cluster IDs per cluster, reflectors with the overload bit, every leaf a client of both its reflectors, and no shared failure domain inside a pair.

The static checks are a few lines against the source of truth:

```python
from collections import defaultdict

inventory = {
    "rr1.ams": {"role": "rr", "router_id": "10.255.1.101", "cluster_id": "10.255.1.100", "rack": "ams-r01", "overload": True},
    "rr2.ams": {"role": "rr", "router_id": "10.255.1.102", "cluster_id": "10.255.1.100", "rack": "ams-r09", "overload": True},
    "rr1.sin": {"role": "rr", "router_id": "10.255.2.101", "cluster_id": "10.255.1.100", "rack": "sin-r02", "overload": True},
    "rr2.sin": {"role": "rr", "router_id": "10.255.2.102", "cluster_id": "10.255.1.100", "rack": "sin-r02", "overload": False},
    "leaf7.ams": {"role": "leaf", "router_id": "10.255.1.17", "clients_of": ["rr1.ams", "rr2.ams"]},
    "leaf8.ams": {"role": "leaf", "router_id": "10.255.1.17", "clients_of": ["rr1.ams"]},
}


def check(inv):
    problems = []
    by_rid = defaultdict(list)
    for name, d in inv.items():
        by_rid[d["router_id"]].append(name)
    problems += [f"router ID {rid} on {', '.join(n)}: each discards the other's reflected routes"
                 for rid, n in by_rid.items() if len(n) > 1]
    clusters = defaultdict(set)                      # cluster ID -> sites using it
    pairs = defaultdict(list)                        # site -> its reflectors
    for name, d in inv.items():
        if d["role"] == "rr":
            site = name.split(".")[1]
            clusters[d["cluster_id"]].add(site)
            pairs[site].append(name)
            if not d["overload"]:
                problems.append(f"{name}: overload bit not set, the IGP may route transit traffic through it")
    problems += [f"cluster ID {cid} used in {sorted(s)}: those sites discard each other's routes"
                 for cid, s in clusters.items() if len(s) > 1]
    for site, rrs in pairs.items():
        if len({inv[r]["rack"] for r in rrs}) < len(rrs):
            problems.append(f"{site}: {' and '.join(rrs)} share a rack, one failure takes both")
    for name, d in inv.items():
        if d["role"] == "leaf":
            site = name.split(".")[1]
            missing = sorted(set(pairs[site]) - set(d["clients_of"]))
            if missing:
                problems.append(f"{name}: not a client of {', '.join(missing)}, a single reflector failure isolates it")
    return problems


for p in check(inventory):
    print(p)
```

```text
router ID 10.255.1.17 on leaf7.ams, leaf8.ams: each discards the other's reflected routes
rr2.sin: overload bit not set, the IGP may route transit traffic through it
cluster ID 10.255.1.100 used in ['ams', 'sin']: those sites discard each other's routes
sin: rr1.sin and rr2.sin share a rack, one failure takes both
leaf8.ams: not a client of rr2.ams, a single reflector failure isolates it
```

Every line is a fault that produces no alarm on the day it is introduced.

## Exercise: one reflection decision

```exercise
id: reflect-route
title: Decide what a route reflector does with one route
prompt: |
  Implement `reflect(route, from_peer, peers, router_id, cluster_id)` for a route reflector.

  - `route` is `{"prefix", "next_hop", "originator_id" (string or null), "cluster_list" (list, newest first)}`.
  - `from_peer` is the name of the peer the route came from.
  - `peers` maps every peer name to `{"kind": "client" | "non-client" | "ebgp", "router_id"}`.
  - `router_id` and `cluster_id` are this reflector's own.

  Apply the loop checks in this order: if `originator_id` equals `router_id`, return
  `{"action": "drop", "reason": "originator-loop"}`; if `cluster_id` is in `cluster_list`, return
  `{"action": "drop", "reason": "cluster-loop"}`.

  Otherwise return `{"action": "send", "to": [...], "route": {...}}`, where `to` is the sorted list of
  iBGP peers (kind client or non-client, never `from_peer`; advertising to eBGP peers is ordinary
  export policy and stays outside this function) that receive it:
  every client and non-client for a route from a client or an eBGP peer, clients only for a route
  from a non-client. For a route from an iBGP peer, the sent route has `originator_id` kept if
  set, otherwise the sender's router ID, and `cluster_id` prepended to `cluster_list`. A route from
  an eBGP peer is not being reflected and is sent unchanged. Never change `next_hop`.
languages: [python, javascript]
entry: reflect
starter:
  python: |
    def reflect(route, from_peer, peers, router_id, cluster_id):
        # your code here
        return {"action": "drop", "reason": ""}
  javascript: |
    function reflect(route, from_peer, peers, router_id, cluster_id) {
      // your code here
      return { action: "drop", reason: "" };
    }
tests:
  - args:
      - {"prefix": "10.1.2.0/24", "next_hop": "10.255.1.13", "originator_id": null, "cluster_list": []}
      - "leaf3.ams"
      - {"leaf1.ams": {"kind": "client", "router_id": "10.255.1.11"}, "leaf2.ams": {"kind": "client", "router_id": "10.255.1.12"}, "leaf3.ams": {"kind": "client", "router_id": "10.255.1.13"}, "rr2.ams": {"kind": "non-client", "router_id": "10.255.1.102"}, "rr1.sin": {"kind": "non-client", "router_id": "10.255.2.101"}}
      - "10.255.1.101"
      - "10.255.1.100"
    expected: {"action": "send", "to": ["leaf1.ams", "leaf2.ams", "rr1.sin", "rr2.ams"], "route": {"prefix": "10.1.2.0/24", "next_hop": "10.255.1.13", "originator_id": "10.255.1.13", "cluster_list": ["10.255.1.100"]}}
    label: route from a client goes to everyone
  - args:
      - {"prefix": "10.1.2.0/24", "next_hop": "10.255.1.13", "originator_id": "10.255.1.13", "cluster_list": ["10.255.1.100"]}
      - "rr1.ams"
      - {"leaf1.sin": {"kind": "client", "router_id": "10.255.2.11"}, "leaf2.sin": {"kind": "client", "router_id": "10.255.2.12"}, "rr2.sin": {"kind": "non-client", "router_id": "10.255.2.102"}, "rr1.ams": {"kind": "non-client", "router_id": "10.255.1.101"}}
      - "10.255.2.101"
      - "10.255.2.100"
    expected: {"action": "send", "to": ["leaf1.sin", "leaf2.sin"], "route": {"prefix": "10.1.2.0/24", "next_hop": "10.255.1.13", "originator_id": "10.255.1.13", "cluster_list": ["10.255.2.100", "10.255.1.100"]}}
    label: route from a non-client goes to clients only
  - args:
      - {"prefix": "10.1.2.0/24", "next_hop": "10.255.1.13", "originator_id": "10.255.1.13", "cluster_list": ["10.255.1.100"]}
      - "rr1.ams"
      - {"leaf1.ams": {"kind": "client", "router_id": "10.255.1.11"}, "rr1.ams": {"kind": "non-client", "router_id": "10.255.1.101"}}
      - "10.255.1.102"
      - "10.255.1.100"
    expected: {"action": "drop", "reason": "cluster-loop"}
    label: partner's copy with the shared cluster ID
  - args:
      - {"prefix": "10.9.0.0/16", "next_hop": "10.255.1.101", "originator_id": "10.255.1.101", "cluster_list": ["10.255.2.100"]}
      - "rr1.sin"
      - {"leaf1.ams": {"kind": "client", "router_id": "10.255.1.11"}, "rr1.sin": {"kind": "non-client", "router_id": "10.255.2.101"}}
      - "10.255.1.101"
      - "10.255.1.100"
    expected: {"action": "drop", "reason": "originator-loop"}
    label: own route coming back
  - args:
      - {"prefix": "192.0.2.0/24", "next_hop": "198.51.100.1", "originator_id": null, "cluster_list": []}
      - "isp1"
      - {"leaf1.ams": {"kind": "client", "router_id": "10.255.1.11"}, "rr2.ams": {"kind": "non-client", "router_id": "10.255.1.102"}, "isp1": {"kind": "ebgp", "router_id": "198.51.100.1"}}
      - "10.255.1.101"
      - "10.255.1.100"
    expected: {"action": "send", "to": ["leaf1.ams", "rr2.ams"], "route": {"prefix": "192.0.2.0/24", "next_hop": "198.51.100.1", "originator_id": null, "cluster_list": []}}
    label: eBGP route is sent, not reflected
  - args:
      - {"prefix": "10.1.1.0/24", "next_hop": "10.255.2.12", "originator_id": "10.255.2.12", "cluster_list": ["10.255.2.100"]}
      - "rr1.sin"
      - {"leaf1.ams": {"kind": "client", "router_id": "10.255.1.11"}, "leaf2.ams": {"kind": "client", "router_id": "10.255.1.12"}, "rr2.ams": {"kind": "non-client", "router_id": "10.255.1.102"}, "rr1.sin": {"kind": "non-client", "router_id": "10.255.2.101"}, "isp1": {"kind": "ebgp", "router_id": "192.0.2.1"}}
      - "10.255.1.101"
      - "10.255.1.100"
    expected: {"action": "send", "to": ["leaf1.ams", "leaf2.ams"], "route": {"prefix": "10.1.1.0/24", "next_hop": "10.255.2.12", "originator_id": "10.255.2.12", "cluster_list": ["10.255.1.100", "10.255.2.100"]}}
    hidden: true
  - args:
      - {"prefix": "10.1.2.0/24", "next_hop": "10.255.1.13", "originator_id": null, "cluster_list": []}
      - "leaf3.ams"
      - {"leaf3.ams": {"kind": "client", "router_id": "10.255.1.13"}}
      - "10.255.1.101"
      - "10.255.1.100"
    expected: {"action": "send", "to": [], "route": {"prefix": "10.1.2.0/24", "next_hop": "10.255.1.13", "originator_id": "10.255.1.13", "cluster_list": ["10.255.1.100"]}}
    label: nobody else to tell
    hidden: true
hints:
  - "Run both loop checks before looking at who the route came from; a dropped route is never reflected."
  - "Build the target list from iBGP peers only, then narrow it to clients when the sender is a non-client."
  - "Copy the route before changing it, and prepend: the newest cluster ID goes first."
```

## Interviewer follow-ups

**"Why do we need route reflectors, and what do they cost?"** Model answer: iBGP never relays iBGP-learned routes, because AS_PATH cannot catch loops inside an AS, so without help every speaker needs a session to every other: $n(n-1)/2$. A reflector relays for its clients, so sessions grow as $2n$ and a new router touches only the reflectors. The costs: loops become possible, closed by ORIGINATOR_ID and CLUSTER_LIST; clients see only each reflector's best path; that best path is chosen from the reflector's position; and the pair becomes a shared fate for every route. Common wrong answer: "to reduce routing table size". A reflector reduces sessions, not routes; every client still holds every route.

**"How does a reflector prevent loops if AS_PATH doesn't change?"** Model answer: ORIGINATOR_ID records the router that injected the route, and a router discards a route carrying its own ID. CLUSTER_LIST records each cluster the route was reflected through, and a reflector discards a route listing its own cluster. Among reflectors, non-client-learned routes go only to clients, so the reflector mesh itself obeys split horizon. Common wrong answer: "the reflector adds its AS to the path"; it is the same AS, and AS_PATH is unchanged.

**"What happens if both route reflectors fail?"** Model answer: the data plane never went through them, but the routes came from them. When the sessions drop, by hold timer (9 s on Meridian) or BFD, the leaves delete every overlay route, and leaf-to-leaf tenant traffic stops with a healthy underlay. Graceful restart keeps routes as stale for a restart time only when the session dropped without a NOTIFICATION, such as a process restart; long-lived graceful restart extends that. Common wrong answer: "nothing, because forwarding doesn't go through the reflectors". An honest addition: "I'd defer to the network team on the graceful-restart behaviour our platforms implement, but I'd alarm on the first reflector lost and on any pair that shares a rack, host or change window."

**"The reflector advertises one path. How do you load-share across two exits?"** Model answer: make the clients see both paths, with ADD-PATH negotiated (send on the reflector, receive on the client) or, in VPN families, with a per-router route distinguisher so the paths are different routes. Then enable multipath on the clients. Common wrong answer: "enable multipath on the leaves"; with one path received, there is nothing to spread over.

## What mid-level engineers get wrong

- **Thinking traffic flows through the reflector.** It never does: next hops are unchanged. Designing reflector capacity for traffic wastes money, and setting next-hop-self on one black-holes the overlay.
- **Configuring "client" on the leaf.** Only the reflector knows who its clients are; the leaf is plain iBGP.
- **Alarming only when both reflectors are down.** The first loss is the last chance to act without an outage.
- **Enabling ADD-PATH on one side or without multipath.** The session negotiates nothing, or the client receives paths it never uses.
- **Copying identifiers between templates.** Duplicated router IDs or cluster IDs do not break sessions; they make the loop checks discard good routes.

## Senior signals

- You explain reflection as a relaxation of iBGP split horizon, applied by row: client routes to everyone, non-client routes to clients only, eBGP routes to everyone.
- You name both loop guards and what each catches: ORIGINATOR_ID a route returning to its originator, CLUSTER_LIST a route circling between clusters, and you know duplicated identifiers turn them against good routes.
- You keep reflectors out of the forwarding path on purpose, with unchanged next hops and the IGP's overload bit, and size them for CPU and memory, not bandwidth.
- You choose shared or distinct cluster IDs for a pair as a memory-versus-redundancy trade, and can say what each loses when one client session drops.
- You recognise hidden paths behind "one exit idles and failover is slow", and fix them with ADD-PATH or per-router RDs plus multipath.
- You answer "both reflectors fail" with withdrawn routes and a stopped overlay, add graceful restart's real conditions, and look for what the pair has in common.

## Check yourself

```quiz
- q: >-
    rr1.sin learns Acme's 10.1.2.0/24 from rr1.ams, which is its non-client peer. To whom does rr1.sin reflect it?
  options: ["To Singapore's clients only, never to other reflectors", "To nobody, since iBGP-learned routes are never relayed", "To Singapore's clients and to rr2.sin, its partner", "To every client and every non-client, including San Jose's"]
  answer: 0
  explanation: >-
    A route learned from a non-client is reflected to clients only. The reflectors are fully meshed as ordinary iBGP peers, so rr2.sin and San Jose's reflectors heard the route from Amsterdam directly, and plain split horizon applies among them. Reflecting to everyone is the rule for routes learned from a client. Relaying to nobody is the plain iBGP rule that reflection exists to relax.
- q: >-
    After a hardware swap, leaf7.ams and leaf8.ams were both given router ID 10.255.1.17. All sessions are Established. What do you expect?
  options: ["Nothing changes, since router IDs only break best-path ties", "Both leaves' sessions to the reflectors fail with Bad BGP Identifier", "Each leaf is missing the routes that the other one originates", "The reflectors drop both leaves' routes as a cluster loop"]
  answer: 2
  explanation: >-
    The reflector stamps ORIGINATOR_ID with the originating leaf's router ID. When leaf8.ams's routes are reflected to leaf7.ams, they carry 10.255.1.17, leaf7.ams's own ID, so it discards them as a loop, and the same in reverse. The OPEN check refuses only a peer with the receiver's own ID, so the leaf-to-reflector sessions come up. CLUSTER_LIST holds cluster IDs, not router IDs.
- q: >-
    gw1.ams and gw2.ams both originate a default route that ties on every attribute. Every leaf has BGP multipath enabled, yet all internet traffic leaves via gw1.ams. Why?
  options: ["The leaves' IGP cost to gw2.ams must be higher than to gw1.ams", "Each reflector advertises only its best path, so leaves never see gw2's", "The reflectors rewrite the next hop to gw1.ams on both routes", "Multipath needs the two gateways to be in different ASes"]
  answer: 1
  explanation: >-
    The reflectors hold both paths but each advertises one, the tie-break winner gw1.ams, so the leaves receive two copies of the same next hop and multipath has nothing to spread over. ADD-PATH, or distinct route distinguishers in a VPN family, would deliver gw2's path. Reflectors do not rewrite next hops, and in a symmetric leaf-spine site the leaves' IGP costs to the two gateways are equal.
- q: >-
    rr1.ams and rr2.ams share cluster ID 10.255.1.100. leaf3.ams's session to rr2.ams goes down; everything else is healthy. What is the state of leaf3's routes?
  options: ["Every other leaf loses them until the session returns", "rr2.ams relearns them from rr1.ams and reflects them again", "Every other leaf holds them from rr1.ams only, with no spare", "Every other leaf still holds them from both reflectors"]
  answer: 2
  explanation: >-
    With a shared cluster ID, rr2.ams discards rr1.ams's reflected copies as a loop, so once its own session to leaf3.ams is down it has no copy. Leaves still reach leaf3.ams through rr1.ams, so nothing breaks, but one more failure would. With distinct cluster IDs rr2.ams would accept rr1's copy and keep serving the routes, at the cost of holding about twice the paths.
- q: >-
    Both of Amsterdam's reflectors lose power at once. No graceful restart is configured; the fabric's links and IS-IS are healthy. What happens to traffic between acme-web1 on leaf1.ams and acme-db1 on leaf3.ams?
  options: ["It continues until the next route change, then the routes freeze", "It stops within the hold time, when the leaves delete the overlay routes", "It shifts to the spines, which hold a copy of every overlay route", "It continues indefinitely because no packet ever crossed the reflectors"]
  answer: 1
  explanation: >-
    The data plane never used the reflectors, but every overlay route came from them. When the sessions time out (9 s on Meridian, faster with BFD), each leaf deletes the routes learned on them, so leaf1.ams no longer knows where 10.1.2.20 lives. Stale routes survive only with graceful restart under its conditions, and even then for a limited time. Meridian's spines carry no overlay routes; they forward VXLAN on outer addresses.
```
