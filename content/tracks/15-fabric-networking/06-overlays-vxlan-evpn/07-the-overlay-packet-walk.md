---
slug: the-overlay-packet-walk
title: "The overlay packet walk: Amsterdam to Singapore, every lookup and every header"
description: One tenant packet from acme-web1 on leaf1.ams to acme-web2 on leaf2.sin, with all nine lookups and every header on every link (EVPN lookup and VXLAN encapsulation at the ingress leaf, spines forwarding on the outer IP only, decapsulation at the egress leaf), then the failure version where a copied route distinguisher and route target leak Acme's traffic to a Globex server, and the troubleshooting checklist that finds it.
minutes: 45
difficulty: hard
tags: [fabric-networking, packet-walk, vxlan, evpn, overlay, route-distinguisher, route-target, multi-tenancy, troubleshooting, interview]
problems: [unresolvable-next-hops, config-drift]
---
"A host on a leaf in Amsterdam sends to a host on a leaf in Singapore, same tenant, same subnet. Walk me through every lookup." This is the overlay packet-walk question, and it tests whether the last five lessons have become one picture. The weak answer says "VXLAN carries it across". The strong answer names nine lookups on five devices, says which table each one reads, which protocol filled that table and when, and draws the header stack on every link. Then comes the follow-up: "everything is green, but Acme's traffic is arriving at another customer's server. Where do you look?"

This lesson walks one TCP segment from `acme-web1` (`10.1.1.10`, behind `leaf1.ams`) to `acme-web2` (`10.1.1.11`, behind `leaf2.sin`) across Meridian's two sites (a small example, two spines per site), then breaks it with a configuration copied from one leaf to another, a real class of multi-tenant incident, and builds the checklist that finds it. It reuses the per-hop rule from [the packet walk](/learn/fabric-networking/from-zero/the-packet-walk), the header from [VXLAN encapsulation](/learn/fabric-networking/overlays-vxlan-evpn/vxlan-encapsulation), the routes from [EVPN, the control plane](/learn/fabric-networking/overlays-vxlan-evpn/evpn-the-control-plane) and the tenant separation from [VRFs and multi-tenancy](/learn/fabric-networking/overlays-vxlan-evpn/vrfs-and-multi-tenancy).

## Before the first packet: who knows what, and from whom

A packet walk is a walk through tables, so start with what each device holds before `acme-web1` sends anything. Four terms (defined in earlier lessons) carry it:

- A **VTEP** (VXLAN tunnel endpoint) is the leaf function that wraps tenant frames in VXLAN and unwraps them. At Meridian a leaf's VTEP address is its loopback: `leaf1.ams` is `10.255.1.11`, `leaf2.sin` is `10.255.2.12`.
- A **VNI** (VXLAN network identifier) is the 24-bit segment number in the VXLAN header. Acme's VLAN 100 is VNI 10100 on every leaf that carries it; VLAN numbers stay local to a leaf, the VNI is fabric-wide.
- An **EVPN type-2 route** (MAC/IP advertisement) is a BGP route that says "this MAC, and optionally this IP, lives behind this VTEP in this segment".
- A **type-3 route** (inclusive multicast) says "I am a VTEP that carries this VNI; send me its broadcasts" ([BUM traffic](/learn/fabric-networking/overlays-vxlan-evpn/bum-traffic)).

The control plane has already run. When `acme-web2` first sent a frame, `leaf2.sin` learned its MAC on a local port and its IP from its ARP, and advertised a type-2 route to `rr1.sin` and `rr2.sin`. Those reflectors peer with `rr1.ams` and `rr2.ams`, which reflected it to every Amsterdam leaf ([route reflectors](/learn/fabric-networking/bgp-fundamentals/route-reflectors)). Nobody changed the BGP next hop on the way, so it still names `leaf2.sin`'s VTEP. This is what `leaf1.ams` holds (illustrative output, close to what FRRouting prints):

```text
leaf1.ams: EVPN route for 00:00:5e:00:53:0b in VNI 10100   (illustrative)
Route [2]:[0]:[48]:[00:00:5e:00:53:0b]:[32]:[10.1.1.11]   RD 10.255.2.12:10100
  iBGP, AS 65000, best, installed
    Next hop 10.255.2.12 (resolved via IS-IS, metric 1020, 2 paths)
    Originator 10.255.2.12, Cluster list 10.255.1.101 10.255.2.101
    Extended communities: RT:65000:10100 RT:65000:50001 ET:8 Rmac:00:00:5e:00:53:e2
    Label1 (L2VNI) 10100, Label2 (L3VNI) 50001
    Received from 10.255.1.101 (rr1.ams)
```

Field by field: the **route distinguisher** (RD) `10.255.2.12:10100` is an 8-byte prefix that makes the route unique inside BGP; Meridian builds it as `<loopback>:<vni>`, so it says "leaf2.sin's VNI 10100". The **route target** (RT) `65000:10100` is an extended community, a tag that decides which segments on which leaves import the route; every leaf whose VNI 10100 imports `65000:10100` installs it. `ET:8` says the encapsulation is VXLAN. Label 1 is the VNI to put in the header; label 2 and the router MAC (`Rmac`) serve routed traffic (the routed variant below). ORIGINATOR_ID and CLUSTER_LIST are the reflectors' loop-prevention stamps.

| Device | Table | Entry this walk needs | Filled by | When |
|---|---|---|---|---|
| `acme-web1` | routing table | `10.1.1.0/24` connected on eth0 | the host's own address config | at boot |
| `leaf1.ams` | ARP suppression, VNI 10100 | `10.1.1.11` → `00:00:5e:00:53:0b` | the type-2 route above | when `acme-web2` came up |
| `leaf1.ams` | port map | port 1, VLAN 100 → VNI 10100 | configuration | at provisioning |
| `leaf1.ams` | MAC table, VNI 10100 | `00:00:5e:00:53:0b` → VTEP `10.255.2.12` | the type-2 route | when `acme-web2` came up |
| `leaf1.ams` | underlay FIB | `10.255.2.12/32` via both spines, metric 1,020 | IS-IS | when the fabric converged |
| `spine1.ams`, `spine1.sin` | underlay FIB | `10.255.2.12/32` | IS-IS | when the fabric converged |
| `leaf2.sin` | VNI map, MAC table | VNI 10100 → VLAN 100; `00:00:5e:00:53:0b` on a local port | configuration; local learning | at provisioning; when `acme-web2` first sent a frame |

The spines' row is the one to notice: they hold no tenant MAC, no tenant IP, no VNI, no EVPN route. In this example the IS-IS metrics are 10 on every link inside a site and 1,000 on each long-haul circuit, so the path from `leaf1.ams` to `10.255.2.12` costs 10 + 1,000 + 10 = 1,020 through either spine. (A link metric of 1,000 needs IS-IS wide metrics, which modern fabrics run; the original narrow format caps a link at 63; see [IS-IS from zero](/learn/fabric-networking/underlay/is-is-from-zero)).

## Lookups 1 and 2: the host, and an ARP that never leaves Amsterdam

`acme-web1` sends 1,460 bytes of data to `acme-web2`'s HTTPS service on an established TCP connection (port 40112 to 443), in a 1,500-byte IPv4 packet with TTL 64.

**Lookup 1, the host's routing table.** `10.1.1.11` falls inside `acme-web1`'s connected subnet `10.1.1.0/24`, so no router is involved: the frame must be addressed to `acme-web2`'s own MAC, not the gateway's ([ARP and the default gateway](/learn/fabric-networking/from-zero/arp-and-the-default-gateway)). That `acme-web2` is 10,500 km away is invisible to the host; the overlay has made two sites one segment.

**Lookup 2, ARP.** The host's ARP cache holds only the gateway, so it broadcasts "who has 10.1.1.11?" into VLAN 100. A plain switch would flood it to every port in the VLAN, and an overlay to every VTEP carrying VNI 10100, across the circuit too. Instead `leaf1.ams` runs **ARP suppression**: its suppression table already pairs `10.1.1.11` with `00:00:5e:00:53:0b`, taken from the IP half of the type-2 route, so the leaf answers on `acme-web2`'s behalf and the request goes no further. The host caches the reply and sends its data frame: destination `00:00:5e:00:53:0b`, source `00:00:5e:00:53:0a`.

- **Solves:** broadcast traffic across sites: with ingress replication a flooded ARP costs one unicast copy per remote VTEP in the VNI, and every Singapore copy crosses the circuit.
- **Breaks:** a host that never speaks (a "silent host") has no IP in any type-2 route, so the leaf cannot answer and the ARP is flooded to every VTEP in both sites after all; a host scanning the subnet turns every unused address into such a flood. A stale binding answers with a MAC that has moved.
- **Signal:** suppression hit and miss counters per VNI, and BUM rate per VNI on the circuits; the guard is a per-VNI BUM rate limit at the leaves ([BUM traffic](/learn/fabric-networking/overlays-vxlan-evpn/bum-traffic)).

## Lookups 3 to 5: the ingress leaf builds the tunnel

Everything that makes this an overlay happens inside `leaf1.ams`, in a single pass through the switching chip's pipeline on most current ASICs (from [planes, ASICs and network operating systems](/learn/fabric-networking/from-zero/planes-asics-and-network-operating-systems)).

**Lookup 3, the port map.** The frame arrived untagged on access port 1, configured for VLAN 100, and VLAN 100 on this leaf maps to VNI 10100. This is the tenant boundary: from here on the frame is "Acme, segment 10100", whatever VLAN number another leaf uses.

**Lookup 4, the MAC table for VNI 10100.** Destination `00:00:5e:00:53:0b` sits behind remote VTEP `10.255.2.12`, from `leaf2.sin`'s type-2 route with RD `10.255.2.12:10100`. The source MAC `00:00:5e:00:53:0a` is already known on port 1, so nothing new is learned or advertised. A miss here would make this an unknown unicast, flooded to every VTEP in the segment.

**Lookup 5, the underlay FIB.** `10.255.2.12` is a BGP next hop, not a directly connected neighbour, so the leaf resolves it recursively in its underlay table: IS-IS offers `10.254.1.0` (`spine1.ams`) and `10.254.2.0` (`spine2.ams`), both at metric 1,020 ([iBGP, loops and next hops](/learn/fabric-networking/bgp-fundamentals/ibgp-loops-and-next-hops)). The leaf builds the outer headers, and the ECMP hash of those outer headers picks `spine1.ams` ([ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)).

The encapsulation, field by field:

| Header | Field | Size | Value here | What reads it |
|---|---|---|---|---|
| Outer Ethernet | destination MAC | 6 B | `00:00:5e:00:53:80` (`spine1.ams`'s port) | `spine1.ams` only; rewritten every hop |
| | source MAC | 6 B | `00:00:5e:00:53:81` (`leaf1.ams`'s uplink) | nobody beyond this link |
| | EtherType | 2 B | `0x0800` (IPv4) | `spine1.ams`'s parser |
| Outer IPv4 | DSCP | 6 bits | copied or mapped from the inner header (platform-dependent) | every underlay queue |
| | total length | 2 B | 1,550 | every router |
| | TTL | 1 B | 64 (the starting value is platform-specific) | every underlay router, decremented |
| | protocol | 1 B | 17 (UDP) | every router's parser and hash |
| | source | 4 B | `10.255.1.11` (`leaf1.ams`'s VTEP) | the ECMP hash; the egress VTEP's source check |
| | destination | 4 B | `10.255.2.12` (`leaf2.sin`'s VTEP) | **the only lookup key in the underlay** |
| Outer UDP | source port | 2 B | 58479, a hash of the inner headers | the ECMP hash: this is the flow's entropy |
| | destination port | 2 B | 4789 (IANA's VXLAN port) | the egress VTEP: "this is VXLAN" |
| | length, checksum | 2 B + 2 B | 1,530; 0 (allowed for VXLAN over IPv4) | the egress VTEP |
| VXLAN | flags | 1 B | `0x08` (the I bit: VNI is valid) | the egress VTEP |
| | VNI | 3 B | 10100 (`0x002774`) | the egress VTEP: which segment |
| | reserved | 3 B + 1 B | 0 | nobody |
| Inner frame | everything | 1,514 B | `00:00:5e:00:53:0a` → `00:00:5e:00:53:0b`, `10.1.1.10` → `10.1.1.11`, TTL 64, TCP 40112 → 443 | `acme-web2`, carried untouched |

The eight VXLAN bytes on the wire are `08 00 00 00 00 27 74 00`. Two numbers are worth deriving. RFC 7348 recommends deriving the source port from a hash of the inner headers and keeping it in the dynamic range 49,152–65,535; this example uses 49,152 plus the hash modulo 16,384 (the exact hash is the ASIC's choice). Either way it is constant for one inner flow (no reordering) and differs between flows (so different flows between the same two VTEPs spread over spines). Without it, every packet between `leaf1.ams` and `leaf2.sin` would share one outer 5-tuple and one spine. And the outer packet is 1,550 bytes: 1,514 of inner frame, 8 VXLAN, 8 UDP, 20 IPv4. A 1,500-byte link MTU anywhere in the underlay drops it in practice: RFC 7348 forbids VTEPs from fragmenting, lets the egress VTEP discard any fragments a router made, and switch ASICs do not fragment at line rate. That is why Meridian's fabric links run a 9,216-byte MTU ([VXLAN encapsulation](/learn/fabric-networking/overlays-vxlan-evpn/vxlan-encapsulation)).

## Lookups 6 and 7: spines that read one field

**Lookup 6, `spine1.ams`.** The spine parses the outer Ethernet and IPv4 headers, stops, and does a longest-prefix match on `10.255.2.12` as for any IP packet ([the routing table](/learn/fabric-networking/from-zero/the-routing-table)). IS-IS has two candidates: straight over its own circuit to `spine1.sin` and down, metric 1,000 + 10 = 1,010; or down to a leaf, up to `spine2.ams`, over the second circuit and down, 10 + 10 + 1,000 + 10 = 1,030. Only the cheaper one is installed. The spine decrements the outer TTL to 63, patches the outer IP checksum, rewrites the outer MACs (destination `00:00:5e:00:53:82`, `spine1.sin`'s port; source `00:00:5e:00:53:83`, its own) and transmits. The UDP header, the VXLAN header and all 1,514 inner bytes go out exactly as they came in.

Then the circuit: 10,500 km of fibre at about 5 µs per km is about 52.5 ms one way.

**Lookup 7, `spine1.sin`.** `10.255.2.12/32` is one hop away, through `leaf2.sin`'s end of the `10.254.17.2/31` link, metric 10. Outer TTL 62, outer MACs rewritten again (destination `00:00:5e:00:53:84` on `leaf2.sin`, source `00:00:5e:00:53:85`), nothing else touched.

This is why the spines need no BGP and no tenant state. In [the BGP black hole](/learn/fabric-networking/bgp-fundamentals/the-bgp-black-hole), a middle router without the customer's route drops the packet; here the middle routers see only a loopback IS-IS already gave them. The price: the tenant's packet is only as good as the underlay route to one `/32`.

## Lookups 8 and 9: the egress leaf unwraps

**Lookup 8, the VTEP and VNI checks.** `leaf2.sin` sees an outer destination that is its own VTEP address, so the packet is for it; UDP destination port 4789 says VXLAN; VNI 10100 maps to its local VLAN 100. Some platforms also check that the outer source, `10.255.1.11`, is a VTEP they know, here from `leaf1.ams`'s type-3 route, and drop tunnel packets from strangers. Then the leaf strips all 50 bytes of outer headers.

**Lookup 9, the MAC table for VNI 10100.** `00:00:5e:00:53:0b` is on a local port. `leaf2.sin` does not learn `acme-web1`'s MAC from this arriving frame: EVPN already told it that `00:00:5e:00:53:0a` lives behind `10.255.1.11`, and with EVPN the MACs behind remote VTEPs come from BGP, not from the data plane. (Flood-and-learn VXLAN, the pre-EVPN design, learned here from arriving packets, so every unknown destination was first flooded across the fabric.) The leaf bridges the frame out of `acme-web2`'s port with the inner TTL still 64: nothing routed it, so nothing decremented it.

Were `acme-web2` dual-attached to `leaf1.sin` and `leaf2.sin` (one ethernet segment), `leaf1.ams` would hash across both VTEPs, which is aliasing from [EVPN multihoming](/learn/fabric-networking/overlays-vxlan-evpn/evpn-multihoming); the walk is otherwise identical.

```viz
{"type": "fabric", "scenario": "overlay-packet-walk", "title": "acme-web1 to acme-web2 across sites: nine lookups on five devices", "caption": "ARP answered by leaf1.ams's suppression table, the port map to VNI 10100, the MAC table pointing at VTEP 10.255.2.12, the underlay FIB with two paths at metric 1,020, encapsulation, spine1.ams choosing its own circuit at 1,010 over the 1,030 detour, the outer TTL falling 64, 63, 62 while the inner frame stays untouched, the 52.5 ms circuit, leaf2.sin's checks and decapsulation, and a closing table of all nine lookups."}
```

## The packet on every link

The same packet on each of the five links. The inner columns are what the tenant sent; everything above them is the tunnel.

| Field | web1 → leaf1.ams | leaf1.ams → spine1.ams | spine1.ams → spine1.sin | spine1.sin → leaf2.sin | leaf2.sin → web2 | Who changes it |
|---|---|---|---|---|---|---|
| Outer destination MAC | none | `…:53:80` (spine1.ams) | `…:53:82` (spine1.sin) | `…:53:84` (leaf2.sin) | none | every underlay hop |
| Outer source MAC | none | `…:53:81` (leaf1.ams) | `…:53:83` (spine1.ams) | `…:53:85` (spine1.sin) | none | every underlay hop |
| Outer IP | none | `10.255.1.11` → `10.255.2.12` | same | same | none | nobody between the VTEPs |
| Outer TTL | none | 64 | 63 | 62 | none | each spine, minus one |
| Outer UDP | none | 58479 → 4789 | same | same | none | nobody |
| VXLAN VNI | none | 10100 | 10100 | 10100 | none | nobody |
| Inner MACs | `…:53:0a` → `…:53:0b` | same | same | same | same | nobody (bridged, not routed) |
| Inner IP, TTL | `10.1.1.10` → `10.1.1.11`, 64 | same | same | same | same | nobody |
| TCP | 40112 → 443 | same | same | same | same | nobody |
| Frame size (without FCS) | 1,514 B | 1,564 B | 1,564 B | 1,564 B | 1,514 B | the VTEPs, plus or minus 50 |

In the plain routed walk of [the packet walk](/learn/fabric-networking/from-zero/the-packet-walk), the MACs changed on every link and the TTL fell at every router. Here the same rule holds one level out: the outer MACs change per link and the outer TTL falls per spine, while the inner frame rides like a parcel in a box ([why overlays](/learn/fabric-networking/overlays-vxlan-evpn/why-overlays)). The inner TTL never drops, so a traceroute from `acme-web1` to `acme-web2` shows one hop: the destination.

## The walk in code

The model below gives each leaf its MAC-VRF configuration (a MAC-VRF is a leaf's per-segment MAC table instance, with its own RD and RT), lets hosts attach and advertise type-2 routes, imports routes by route target the way a leaf does, and forwards one packet through the chain. It starts at the leaf's ARP suppression and takes the VNI as an argument, so it prints seven of the nine lookups (it skips the host's routing table and the port map). The source port uses the visualisation's FNV-1a hash, so the numbers match. The second half rebuilds the fabric with the failure this lesson turns to next.

```python
import struct
from dataclasses import dataclass


def fnv1a(text):
    h = 2166136261
    for ch in text:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h


@dataclass(frozen=True)
class Type2:                    # an EVPN MAC/IP advertisement route, reduced to what we need
    rd: str
    mac: str
    ip: str
    label_vni: int              # label 1: the VNI the sender wants in the VXLAN header
    rt: str
    next_hop: str               # the advertising leaf's VTEP (loopback)


class Leaf:
    def __init__(self, name, vtep, segments):
        self.name, self.vtep = name, vtep
        self.seg = segments     # vni -> {"rd", "rt"}: MAC-VRF config (import RT = export RT here)
        self.macs = {vni: {} for vni in segments}   # vni -> mac -> ("local", host) or (vtep, vni)
        self.arp = {vni: {} for vni in segments}    # ARP suppression: vni -> ip -> mac

    def attach(self, host, mac, ip, vni):
        self.macs[vni][mac] = ("local", host)
        self.arp[vni][ip] = mac
        cfg = self.seg[vni]
        return Type2(cfg["rd"], mac, ip, vni, cfg["rt"], self.vtep)

    def receive(self, route):
        for vni, cfg in self.seg.items():
            if cfg["rt"] == route.rt and route.next_hop != self.vtep:   # import by route target
                self.macs[vni][route.mac] = (route.next_hop, route.label_vni)
                held = self.arp[vni].get(route.ip)
                if held and self.macs[vni][held][0] == "local":
                    continue                                            # a local host keeps its IP
                self.arp[vni][route.ip] = route.mac                     # newest remote binding wins


def underlay_next(device, vtep):
    """IS-IS result for a VTEP loopback 10.255.<site>.<n>, two spines per site."""
    sites = {"1": "ams", "2": "sin"}
    there = sites[vtep.split(".")[2]]
    role, here = device.split(".")[0], device.split(".")[1]
    if role.startswith("leaf"):
        return [f"spine1.{here}", f"spine2.{here}"]                     # ECMP over both spines
    if here != there:
        return [f"{role}.{there}"]                                      # own long-haul circuit
    return [f"leaf{int(vtep.split('.')[3]) - 10}.{there}"]              # one hop down


def send(leaves, src_leaf, dst_ip, vni, sport_key):
    log, n = [], 0

    def lk(where, table, key, result):
        nonlocal n
        n += 1
        log.append(f"{n:>2}. {where:<10} {table:<22} {key:<18} -> {result}")

    ingress = leaves[src_leaf]
    dst_mac = ingress.arp[vni][dst_ip]                     # answered locally, no flood
    lk(src_leaf, f"ARP suppression {vni}", dst_ip, dst_mac)
    where, out_vni = ingress.macs[vni][dst_mac]
    lk(src_leaf, f"MAC table {vni}", dst_mac, f"VTEP {where}, VNI {out_vni}")
    sport = 49152 + fnv1a(sport_key) % 16384               # entropy for the underlay hash
    vxlan = struct.pack("!B3xI", 0x08, out_vni << 8)       # flags, reserved, VNI, reserved
    log.append(f"    encap: {ingress.vtep} -> {where} UDP {sport}->4789 VXLAN {vxlan.hex(' ')}")
    hops = underlay_next(src_leaf, where)
    device = hops[fnv1a(f"{ingress.vtep}|{where}|17|{sport}|4789") % len(hops)]
    lk(src_leaf, "underlay FIB", where, f"{' or '.join(hops)}: hash picks {device}")
    ttl = 64
    while device.startswith("spine"):
        ttl -= 1                                           # outer TTL only; inner untouched
        nxt = underlay_next(device, where)[0]
        lk(device, "FIB (outer IP only)", where, f"{nxt}, outer TTL {ttl}")
        device = nxt
    egress = leaves[device]
    assert where == egress.vtep and out_vni in egress.macs, "drop: not my VTEP or VNI"
    lk(device, "VTEP/VNI check", f"{where} {out_vni}", "decapsulate")
    port, host = egress.macs[out_vni][dst_mac]
    lk(device, f"MAC table {out_vni}", dst_mac, f"{port} port to {host}")
    return log


def build(globex_cfg):
    acme = lambda leaf: {10100: {"rd": f"{leaf}:10100", "rt": "65000:10100"}}
    leaves = {"leaf1.ams": Leaf("leaf1.ams", "10.255.1.11", acme("10.255.1.11")),
              "leaf2.ams": Leaf("leaf2.ams", "10.255.1.12", {10200: globex_cfg}),
              "leaf2.sin": Leaf("leaf2.sin", "10.255.2.12", acme("10.255.2.12"))}
    routes = [leaves["leaf1.ams"].attach("acme-web1", "00:00:5e:00:53:0a", "10.1.1.10", 10100),
              leaves["leaf2.sin"].attach("acme-web2", "00:00:5e:00:53:0b", "10.1.1.11", 10100),
              leaves["leaf2.ams"].attach("globex-app1", "00:00:5e:00:53:1a", "10.1.1.10", 10200)]
    for route in routes:                                   # the route reflectors pass everything on
        for leaf in leaves.values():
            leaf.receive(route)
    return leaves, routes


def audit(routes):
    findings, by_rd, by_ip = [], {}, {}
    for r in routes:
        by_rd.setdefault(r.rd, set()).add(r.next_hop)
        by_ip.setdefault((r.rt, r.ip), set()).add(r.mac)
        if r.rt != f"65000:{r.label_vni}":
            findings.append(f"RT {r.rt} on a route for VNI {r.label_vni} from {r.next_hop}")
    findings += [f"RD {rd} advertised by {sorted(nh)}" for rd, nh in by_rd.items() if len(nh) > 1]
    findings += [f"{ip} has MACs {sorted(m)} under {rt}" for (rt, ip), m in by_ip.items() if len(m) > 1]
    return findings or ["clean"]


good, routes = build({"rd": "10.255.1.12:10200", "rt": "65000:10200"})
print("acme-web1 -> acme-web2, intended config:")
print("\n".join(send(good, "leaf1.ams", "10.1.1.11", 10100, "10.1.1.10|10.1.1.11|6|40112|443")))
print("audit:", audit(routes))

bad, routes = build({"rd": "10.255.1.11:10100", "rt": "65000:10100"})   # copied from leaf1.ams
print("\nacme-web2 -> acme-web1 (10.1.1.10), Globex config copied from Acme:")
print("\n".join(send(bad, "leaf2.sin", "10.1.1.10", 10100, "10.1.1.11|10.1.1.10|6|443|40112")))
print("audit:", *audit(routes), sep="\n  ")
```

```text
acme-web1 -> acme-web2, intended config:
 1. leaf1.ams  ARP suppression 10100  10.1.1.11          -> 00:00:5e:00:53:0b
 2. leaf1.ams  MAC table 10100        00:00:5e:00:53:0b  -> VTEP 10.255.2.12, VNI 10100
    encap: 10.255.1.11 -> 10.255.2.12 UDP 58479->4789 VXLAN 08 00 00 00 00 27 74 00
 3. leaf1.ams  underlay FIB           10.255.2.12        -> spine1.ams or spine2.ams: hash picks spine1.ams
 4. spine1.ams FIB (outer IP only)    10.255.2.12        -> spine1.sin, outer TTL 63
 5. spine1.sin FIB (outer IP only)    10.255.2.12        -> leaf2.sin, outer TTL 62
 6. leaf2.sin  VTEP/VNI check         10.255.2.12 10100  -> decapsulate
 7. leaf2.sin  MAC table 10100        00:00:5e:00:53:0b  -> local port to acme-web2
audit: ['clean']

acme-web2 -> acme-web1 (10.1.1.10), Globex config copied from Acme:
 1. leaf2.sin  ARP suppression 10100  10.1.1.10          -> 00:00:5e:00:53:1a
 2. leaf2.sin  MAC table 10100        00:00:5e:00:53:1a  -> VTEP 10.255.1.12, VNI 10200
    encap: 10.255.2.12 -> 10.255.1.12 UDP 54923->4789 VXLAN 08 00 00 00 00 27 d8 00
 3. leaf2.sin  underlay FIB           10.255.1.12        -> spine1.sin or spine2.sin: hash picks spine2.sin
 4. spine2.sin FIB (outer IP only)    10.255.1.12        -> spine2.ams, outer TTL 63
 5. spine2.ams FIB (outer IP only)    10.255.1.12        -> leaf2.ams, outer TTL 62
 6. leaf2.ams  VTEP/VNI check         10.255.1.12 10200  -> decapsulate
 7. leaf2.ams  MAC table 10200        00:00:5e:00:53:1a  -> local port to globex-app1
audit:
  RT 65000:10100 on a route for VNI 10200 from 10.255.1.12
  RD 10.255.1.11:10100 advertised by ['10.255.1.11', '10.255.1.12']
  10.1.1.10 has MACs ['00:00:5e:00:53:0a', '00:00:5e:00:53:1a'] under 65000:10100
```

Four lines carry the design. `cfg["rt"] == route.rt` is EVPN import: a route lands in whichever local segment imports its route target, and nothing else is checked. `self.macs[vni][route.mac] = (route.next_hop, route.label_vni)` stores the VNI the *sender* asked for, label 1 of its route, which is why the leaked packet leaves Singapore with VNI 10200 inside Acme's segment. `struct.pack("!B3xI", 0x08, out_vni << 8)` is the whole VXLAN header: one flag byte, three reserved, then the VNI in the top 24 bits of the last word. The `while device.startswith("spine")` loop touches only `ttl` and `where`, the outer header: the spines' entire job. `audit` is a first draft of what a platform should run continuously; its `65000:<vni>` check works only because Meridian derives the route target from the VNI, and with free-form route targets you check against the source of truth instead.

## The routed variant: what changes when the subnets differ

The follow-up: "now `acme-web2` talks to `acme-db1`, `10.1.2.20` on `leaf3.ams`, a different subnet". Meridian routes between a tenant's subnets with **symmetric IRB** (integrated routing and bridging: every leaf is the gateway for its local subnets, and traffic is routed at both the ingress and the egress leaf), explained in depth in [VRFs and multi-tenancy](/learn/fabric-networking/overlays-vxlan-evpn/vrfs-and-multi-tenancy). The differences from the walk above, lookup by lookup:

| Step | Same subnet (above) | Different subnet, symmetric IRB |
|---|---|---|
| Host decision | on-link, ARP for the peer | off-link: ARP for its gateway `10.1.1.1`, answered by `leaf2.sin` with the anycast gateway MAC `00:00:5e:00:01:01` |
| Ingress table | MAC table, VNI 10100 | VRF ACME routing table: `10.1.2.20/32` from `leaf3.ams`'s type-2 route, label 2 = L3VNI 50001 |
| Inner MACs at ingress | untouched | rewritten: source `leaf2.sin`'s router MAC, destination `leaf3.ams`'s router MAC (from the `Rmac` community) |
| Inner TTL | 64 all the way | 63 after `leaf2.sin` routes it, 62 after `leaf3.ams` does |
| VNI on the wire | L2VNI 10100 | L3VNI 50001, Acme's routing segment |
| Spines | outer IP only | outer IP only, identical |
| Egress | MAC table, VNI 10100 | L3VNI 50001 → VRF ACME, route lookup, ARP entry for `10.1.2.20`, then bridged out with source MAC `00:00:5e:00:01:01` |

The spines' row is the same in both columns, which is the point of the design: routing between tenant subnets adds lookups at the edges and none in the middle. If `acme-db1` had never spoken, there would be no `/32` host route, and `leaf2.sin` would follow the type-5 route for `10.1.2.0/24` (an IP prefix route) to a leaf that carries that subnet, here `leaf3.ams`, which would then ARP for the host before it could deliver; the first packets wait or are dropped while it resolves.

## Where the time goes

| Component | One-way contribution | Depends on |
|---|---|---|
| Each lookup in an ASIC | nanoseconds, inside the switch's pipeline latency | the pipeline, not the table size |
| Each switch, port to port | under 1 µs to a few µs per switch on current data-center ASICs | cut-through or store-and-forward, frame size, queueing |
| Serialising 1,564 bytes at 100 Gb/s | 125 ns per fabric link | link speed (500 ns at 25 Gb/s) |
| Queueing | zero to milliseconds | congestion on the chosen spine and circuit |
| Fibre, `ams` to `sin` | about 52.5 ms | 10,500 km of fibre path at about 5 µs per km |

Five devices add perhaps 10 µs; the circuit adds 52,500 µs. The round trip is at least 105 ms whatever the overlay does, so ten sequential cross-site calls cost more than a second: a stretched subnet puts the speed of light inside every round trip of a chatty workload.

## The failure version: a copied config that leaks a tenant

Two reminders from [EVPN, the control plane](/learn/fabric-networking/overlays-vxlan-evpn/evpn-the-control-plane): the RD (`<loopback>:<vni>`) keeps every leaf's routes distinct even when Acme and Globex both use `10.1.1.0/24`, and the RT (`65000:<vni>`) is policy, so Acme's segments import only Acme's routes. The rule to hold is **RD unique per leaf per segment, RT unique per tenant segment.**

The incident pattern: an engineer provisions Globex on `leaf2.ams` by copying Acme's tenant configuration from `leaf1.ams` and editing it. The VNIs are changed to 10200 and 50002; the route distinguishers and route targets are not. `leaf2.ams` now advertises with `leaf1.ams`'s RDs (`10.255.1.11:10100`, `10.255.1.11:50001`) and Acme's route targets (`65000:10100`, `65000:50001`). The push succeeds, every BGP session stays Established, every IS-IS adjacency stays up and no interface counts an error. None of those reads what the routes say.

The trace:

1. `globex-app1` (`10.1.1.10`, MAC `00:00:5e:00:53:1a`) comes up on `leaf2.ams`, which advertises a type-2 route with RD `10.255.1.11:10100`, RT `65000:10100` and, correctly, label 1 = VNI 10200. To every other router this is an Acme route.
2. `rr1.ams` reflects it like any other. Reflectors check loops, not ownership. The duplicate RD hides nothing yet: a type-2 route's BGP key includes the MAC, and `globex-app1`'s MAC differs from `acme-web1`'s, so both routes travel on. The route target does the damage.
3. `leaf2.sin` imports it, because `65000:10100` is exactly what its Acme VNI 10100 imports. Acme's segment now holds a Globex MAC behind VTEP `10.255.1.12` with VNI 10200, and two MACs claim `10.1.1.10`. The suppression table keeps one binding; which one wins is implementation-dependent, and here it is the newer one, `globex-app1`'s.
4. `acme-web2` ARPs for its colleague `acme-web1` at `10.1.1.10`. `leaf2.sin` answers locally with `00:00:5e:00:53:1a`. The host has no way to tell.
5. `acme-web2` sends its data to that MAC. `leaf2.sin` tunnels it to `10.255.1.12` with VNI 10200, the VNI the leaked route asked for, inside a perfectly valid VXLAN header. (A platform that always uses its own local VNI would send 10100, which `leaf2.ams` does not carry, and drop it: a black hole instead of a leak.)
6. `leaf2.ams` decapsulates VNI 10200 into Globex's VLAN 100 and delivers Acme's data to a Globex server. Because Globex reuses `10.1.1.10`, its IP stack accepts the packet and, holding no such connection, typically answers with a TCP reset that the leaked routes carry back to `acme-web2`: Acme sees "connection reset", not a timeout.

The import side was copied too, so the leak runs in both directions: `leaf2.ams`'s Globex segment imports `65000:10100` and fills with Acme MACs, while Globex's other leaves, importing `65000:10200`, never see `globex-app1` at all. One customer gains a stranger and the other loses its own host.

The duplicate RD bites where route keys do collide: the type-5 routes. Both tenants announce `10.1.1.0/24`, and with the same RD `10.255.1.11:50001` the reflector sees one route from two next hops, runs best-path ([the best-path algorithm](/learn/fabric-networking/bgp-fundamentals/the-best-path-algorithm)), and reflects only the winner (without ADD-PATH, one path per key). Every earlier step ties (the reflector's IGP cost to the two Amsterdam leaves is equal), so the router-ID step decides: the lower ORIGINATOR_ID, `10.255.1.11`, picks Acme's, and Globex's prefix silently disappears from every other leaf. A duplicated RD has turned two tenants' routes into one.

```viz
{"type": "fabric", "scenario": "overlay-packet-walk", "variant": "rt-leak", "title": "The failure version: a copied RD and RT send Acme's traffic to a Globex server", "caption": "leaf2.ams's Globex config is copied from leaf1.ams with the RDs and route targets unchanged, and every health check stays green. globex-app1's type-2 route is reflected and imported into Acme's VNI 10100 at leaf2.sin, whose ARP suppression answers acme-web2 with Globex's MAC; the data is tunnelled with VNI 10200 and delivered to globex-app1. Then the signals that do show it, the duplicate RD hiding Globex's type-5 route, and the troubleshooting checklist."}
```

## The troubleshooting checklist

The checklist runs from the outside in; each step maps to rows of the nine-lookup table.

1. **Scope.** Which tenant, which hosts, one site or several, since when, and what changed? An Acme host reaching the wrong server since yesterday's Globex provisioning on `leaf2.ams` is half the answer already ([the troubleshooting method](/learn/fabric-networking/operating-fabrics/the-troubleshooting-method)).
2. **Underlay.** Can the two VTEPs reach each other, at full size? Probes between `10.255.1.11` and `10.255.2.12` in both directions, as 1,550-byte packets with DF (don't fragment) set and from many UDP source ports so they cross every spine, prove lookups 5 to 7 and their mirror image. If small probes pass and large ones fail, it is MTU; if some source ports fail, it is one spine or one link ([active measurement](/learn/fabric-networking/operating-fabrics/active-measurement)). Rule it out first: when the underlay is broken, everything above it lies.
3. **EVPN routes for the affected IP and MAC.** Read the routes, not only the sessions: for `10.1.1.10` in VNI 10100, list every type-2 route with its RD, RT, next hop and label. A route can be present in BGP and still not be installed: it must be selected as best, its RT must match a local import, its encapsulation and VNI must be valid, its next hop must resolve in the underlay, and the hardware table must have room. Each of those is a separate "why is it missing" answer.
4. **Local tables.** On the ingress leaf, the port-to-VNI map, the MAC table and the ARP suppression binding (lookups 2 to 4); on the egress leaf, the VNI-to-VLAN map and the MAC table (lookups 8 and 9). A capture on an uplink, decoded to the inner frame, settles what is on the wire.
5. **Intent.** Compare RD, RT and VNI on each leaf against the source of truth. This is where the incident becomes visible, and where the fix is: restore `leaf2.ams`'s own RDs (`10.255.1.12:10200`, `10.255.1.12:50002`) and Globex's route targets. The leaked routes are withdrawn within seconds, but `acme-web2`'s own ARP cache still holds the Globex MAC until it re-resolves (seconds to a minute on Linux, depending on its neighbour timers); a gratuitous ARP from `acme-web1` usually corrects the caches at once. Then prevent the repeat by rendering tenant configuration from intent and rejecting any duplicate RD or cross-tenant RT before deployment ([network automation and the source of truth](/learn/fabric-networking/operating-fabrics/network-automation-and-source-of-truth)).

In the leaked state, step 3 on `leaf2.sin` shows the smoking gun (illustrative):

```text
leaf2.sin: EVPN type-2 routes for 10.1.1.10, VNI 10100   (illustrative)
Route [2]:[0]:[48]:[00:00:5e:00:53:0a]:[32]:[10.1.1.10]   RD 10.255.1.11:10100
    Next hop 10.255.1.11   Label1 10100   RT:65000:10100 RT:65000:50001
Route [2]:[0]:[48]:[00:00:5e:00:53:1a]:[32]:[10.1.1.10]   RD 10.255.1.11:10100
    Next hop 10.255.1.12   Label1 10200   RT:65000:10100 RT:65000:50001
```

One RD from two next hops; one IP with two MACs; a route in segment 10100 asking for VNI 10200. Each is impossible in a correctly configured Meridian fabric and cheap to compute from data the fabric already exports. Some platforms flag one IP with two MACs as a possible duplicate address; whether anyone sees that alarm depends on the tooling.

## Failure modes in production

**An underlay link left at 1,500 bytes.** *Symptom:* SSH between `acme-web1` and `acme-web2` logs in, then hangs on the first large output; pings work. *Diagnosis:* full-size inner packets become 1,550-byte outer ones, and one link (often a new circuit) has a 1,500 MTU. The ICMP "fragmentation needed" goes to the VTEP's loopback, never to the tenant host, so path-MTU discovery cannot fix it ([transport as the network sees it](/learn/fabric-networking/from-zero/transport-as-the-network-sees-it)). VTEP-to-VTEP probes at 1,550 bytes with DF fail over that link only. *Fix:* correct the MTU, and check MTU consistency on every fabric link before deployment.

**A stale MAC after a host moves.** *Symptom:* `acme-web2` is live-migrated from `leaf2.sin` to `leaf1.sin`, and some peers lose it for seconds or indefinitely. *Diagnosis:* the new leaf must advertise the MAC with a higher MAC mobility sequence number so every leaf prefers it ([EVPN, the control plane](/learn/fabric-networking/overlays-vxlan-evpn/evpn-the-control-plane)); a host that stays silent after moving leaves `leaf1.ams` tunnelling to the old VTEP. A MAC that moves too often (RFC 7432's suggested default: five moves in 180 seconds) is flagged as a duplicate and no longer advertised until an operator clears it. *Fix:* read the type-2 route's sequence number and next hop on the ingress leaf; a gratuitous ARP from the moved host usually repairs it. Chart MAC moves per segment.

**One circuit down: baseline latency normal, capacity halved.** *Symptom:* after `spine1.ams`–`spine1.sin` fails, off-peak latency looks unchanged, but at peak hours cross-site throughput falls while queueing delay and drops rise on the surviving circuit. *Diagnosis:* once IS-IS reconverges, `leaf1.ams` sees 1,020 via `spine2.ams` against 1,040 via `spine1.ams` and sends everything to `spine2.ams`, so the remaining circuit carries all inter-site traffic at half the capacity ([connecting sites and backbones](/learn/fabric-networking/fabric-architecture/connecting-sites-and-backbones)). *Fix:* plan capacity for one circuit down, and make the circuit alert carry the headroom calculation, not only "link down".

## Trade-offs: how to give a tenant a segment across sites

| Design | What crosses the circuit | Failure domain | State on each leaf | Operational cost |
|---|---|---|---|---|
| One EVPN domain stretched across sites (Meridian) | tenant frames, including BUM; every EVPN route | one: a bad route or a broadcast storm reaches both sites | every remote MAC in the tenant's segments, both sites | lowest: one design everywhere |
| Multi-site gateways that re-originate routes at each site's border (RFC 9014 describes the interconnect options) | tenant frames through the border gateways; routes re-originated with the border gateway as next hop | per site: borders filter and rate-limit BUM | local MACs, and remote MACs behind the local border gateway | medium: border gateways are a new tier to operate |
| Layer 3 only between sites (type-5 prefixes, no stretched VLAN) | routed tenant packets only | per site for layer 2; routing still shared | local MACs and remote prefixes | low, but applications must accept different subnets per site |
| MPLS L3VPN backbone between sites | labelled tenant packets ([MPLS and segment routing](/learn/fabric-networking/overlays-vxlan-evpn/mpls-and-segment-routing)) | per site, joined by the provider core | local state; the core holds VPN routes at the edge routers | high unless you already run an MPLS backbone |

## What the platform should show

Tooling for this fabric should make every row of the nine-lookup table visible and checkable:

- **The lookup chain for any pair of hosts.** Given two tenant IPs, show the ARP binding, VNI, MAC entry, VTEP next hop, underlay paths and egress VNI map, live from both leaves.
- **Route-content invariants, evaluated continuously.** Every RD from exactly one next hop; every RT used by exactly one tenant; label VNI equal to the importing VNI; one MAC per IP per segment; route counts per tenant per leaf, with a change marker when a count jumps.
- **VTEP-mesh probes.** Full-size, DF-set probes between every pair of VTEPs, with many source ports so each spine and circuit is covered, reporting loss and latency per path; session state proves nothing about the data plane.
- **Pre-deployment checks.** Diff rendered configuration against intent, and refuse a push that creates a duplicate RD, reuses another tenant's RT, or maps one VNI into two tenants.
- **Circuit context.** Latency baselines per circuit (52.5 ms one way is physics; a step to 55 ms suggests the carrier rerouted the fibre), utilisation against one-circuit-down headroom, and BUM rate per VNI on each circuit.
- **Two views of one data set.** The engineer on call wants the lookup chain and the failing check; the manager wants which tenants are affected, since when, and whether a change caused it.

## Interviewer follow-ups

**"Walk me through it in one minute."** Model answer: the leaf answers the ARP from its EVPN-learned suppression table, maps the port to VNI 10100, finds the MAC behind VTEP `10.255.2.12`, resolves that loopback through IS-IS, and wraps the frame in VXLAN, UDP 4789 and an outer IP. The spines forward on the outer destination only. The egress leaf checks VTEP and VNI, strips 50 bytes and bridges the frame out. BGP-learned state is read at the edges, IS-IS-learned state at every hop. Common wrong answer: "BGP routes the packet across the spines" or "the spines look up the VNI".

**"Why does the outer UDP source port change between flows but the destination port never does?"** Model answer: port 4789 tells the egress VTEP the payload is VXLAN. The source port is a hash of the inner headers because the outer IPs are the same for every flow between two leaves; without that entropy all of them would hash onto one spine. It is stable per inner flow, so one TCP connection is never reordered. Common wrong answer: "it's an ephemeral port like a client socket uses".

**"All sessions are up, but an Acme host is getting ARP answers with a MAC it doesn't recognise. What do you check?"** Model answer: scope and recent changes, then the underlay, then the EVPN routes for that IP in that segment: how many MACs, which RDs, next hops and label VNIs. A Globex route carrying an Acme route target, or one RD from two next hops, is a copied configuration. How a given platform resolves conflicting MAC/IP bindings I would confirm with the network team; what I would build is a continuous check for one IP with two MACs per segment and for duplicate RDs. Common wrong answer: "restart the BGP session to clear it", which re-learns the same wrong routes.

**"Latency between Amsterdam and Singapore went from 106 ms to 112 ms round trip overnight. Is it the overlay?"** Model answer: no; encapsulation costs nanoseconds. Six extra milliseconds round trip is 3 ms each way, about 600 km more fibre at 5 µs per km, so either the circuit's carrier switched to a protection path or traffic now takes the other circuit with a longer route. I would compare per-circuit baselines from the VTEP-mesh probes; whether the carrier rerouted is a question for the provider, but the platform should already show which circuit changed. Common wrong answer: "VXLAN overhead increased".

## What mid-level engineers get wrong

- **Putting tenant knowledge on the spines.** Believing the spines read the VNI or inner MAC leads to sizing spine tables for tenant MACs and blaming a spine for a missing tenant route.
- **Treating Established as healthy.** Session state says routes can flow, not that they are correct; the leak above happens with every session up.
- **Confusing RD and RT.** The RD only makes routes distinct; the RT decides who imports them. Fixing a leak by changing only the RD leaves the routes imported where they should not be.

## Senior signals

- You name the nine lookups and, for each, the table, the protocol that filled it and when: configuration, local learning, EVPN, or IS-IS.
- You say "EVPN state at the edges, underlay state at every hop", and that the spines read one field, the outer destination IP.
- You derive the numbers: 50 bytes of overhead, 1,550-byte outer packets, about 52.5 ms of fibre that dwarfs every lookup.
- You state the RD and RT rule as invariants (RD unique per leaf per segment, RT unique per tenant) and know a duplicated RD hides type-5 routes while a copied RT leaks type-2 routes.
- You debug from the outside in (scope, underlay, route content, local tables, intent) and read route content, not session state.
- You treat the fix as a property of the tooling: configuration rendered from intent and checked for duplicates before it reaches a leaf.

## Check yourself

```quiz
- q: >-
    acme-web1 on leaf1.ams sends a full-size frame to acme-web2 on leaf2.sin in the same subnet. On the circuit between spine1.ams and spine1.sin, which fields differ from what leaf1.ams originally put on its uplink?
  options: ["The outer MACs and the outer TTL, both set again by spine1.ams", "The outer destination IP, rewritten to spine1.sin's loopback", "The outer MACs, the outer TTL and the inner TTL", "The VNI, which each spine rewrites for its own site"]
  answer: 0
  explanation: >-
    spine1.ams forwards on the outer IPv4 destination only: it rewrites the outer MACs for the next link and decrements the outer TTL (patching the outer checksum). The outer IPs stay VTEP to VTEP, and the VNI, UDP ports and inner frame are untouched. The inner TTL is decremented only where the inner packet is routed, and this frame is bridged, so it stays 64 end to end.
- q: >-
    Why does leaf1.ams answer acme-web1's ARP for 10.1.1.11 itself instead of flooding it?
  options: ["The spines cache ARP replies for remote hosts in their FIB", "Its suppression table holds the IP from leaf2.sin's type-2 route", "Its anycast gateway owns every address in 10.1.1.0/24", "leaf2.sin forwards a copy of every ARP reply to all leaves"]
  answer: 1
  explanation: >-
    A type-2 route carries a MAC and optionally an IP. leaf1.ams imported leaf2.sin's route for 00:00:5e:00:53:0b with 10.1.1.11 and uses that binding to reply locally, so nothing crosses the circuit. The anycast gateway answers only for the gateway address, and the spines hold no tenant state at all.
- q: >-
    Every flow between leaf1.ams and leaf2.sin has the same outer source and destination IP. What lets the spines spread those flows across paths?
  options: ["The outer UDP source port, hashed from the inner headers", "The outer DSCP value, which differs per tenant flow", "The outer IP identification field, unique per packet", "The VNI, which ECMP hashes as part of the outer key"]
  answer: 0
  explanation: >-
    The ingress VTEP sets the outer UDP source port from a hash of the inner addresses and ports, so it is constant within one flow and varies between flows, and ordinary 5-tuple ECMP hashing then spreads them. Most switches do not hash on the VNI, DSCP is usually the same for a whole class of traffic, and hashing on a per-packet field would reorder packets within a flow.
- q: >-
    Globex is configured on leaf2.ams by copying Acme's config from leaf1.ams; the VNIs are changed but the RDs and RTs are not. What actually makes Acme's segment on leaf2.sin install globex-app1's MAC?
  options: ["The route distinguisher, which makes the route look like leaf1.ams's", "The label VNI 10200, which leaf2.sin maps into VLAN 100", "The route reflector, which rewrites the next hop to leaf1.ams", "The route target 65000:10100, which Acme's VNI imports"]
  answer: 3
  explanation: >-
    Import is decided by the route target alone: any segment importing 65000:10100 installs the route. The duplicate RD does not change that, and for type-2 routes it does not even collide, because the BGP key also includes the MAC. Label VNI 10200 is what leaf2.sin later puts in the VXLAN header, and the reflector leaves the next hop as leaf2.ams's VTEP.
- q: >-
    In the same incident, why does Globex's type-5 route for 10.1.1.0/24 disappear from the other leaves?
  options: ["Its RT is Acme's, so the reflector drops it as a loop", "Acme's leaves withdraw it after detecting a duplicate IP", "Type-5 routes are not reflected across sites by default", "Its RD equals Acme's, so the reflector treats both as one route"]
  answer: 3
  explanation: >-
    A type-5 route's key is the RD plus the prefix. With RD 10.255.1.11:50001 on both, Acme's and Globex's 10.1.1.0/24 become two paths for one key; the reflector selects one best path (here Acme's, via the lower originator) and advertises only that. Route targets play no part in loop prevention, which uses ORIGINATOR_ID and CLUSTER_LIST.
- q: >-
    A tenant's SSH sessions across sites log in and then hang on large output, while ping works. The fabric was extended with a new circuit yesterday. What is the most likely cause?
  options: ["ARP suppression has a stale binding for the remote host", "The new circuit's latency exceeds the TCP retransmission timer", "The VNI on the new circuit is filtered by the carrier", "The new circuit's MTU is below the 1,550 bytes VXLAN needs"]
  answer: 3
  explanation: >-
    Full-size 1,500-byte tenant packets become 1,550-byte VXLAN packets; on a 1,500-byte link they are dropped, while small pings and the login exchange fit. The ICMP error goes to the VTEP's loopback, not the tenant host, so path-MTU discovery cannot recover. A stale ARP binding would break small packets too, and a carrier sees only outer IP packets, not the VNI.
```
