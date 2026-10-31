---
slug: bum-traffic
title: "BUM traffic: ingress replication, multicast trees and the cost of flooding"
description: How an EVPN-VXLAN fabric delivers broadcast, unknown-unicast and multicast frames that have no single destination, traced on Meridian; ingress replication from type-3 routes versus an underlay multicast tree built by PIM sparse mode (rendezvous points, registers, the DR and assert); the replication cost worked with numbers; and why most large fabrics choose ingress replication.
minutes: 45
difficulty: hard
tags: [fabric-networking, evpn, vxlan, bum, ingress-replication, multicast, pim, rendezvous-point, type-3-route, flooding]
problems: [mac-learning-switch]
---
EVPN tells every leaf in advance where each tenant MAC lives, so a frame for a known host goes out in one tunnel to one leaf. Some frames have no single destination, though. An ARP request is addressed to everyone. A frame for a MAC nobody has learned has to go wherever the host might be. An IPv6 neighbour solicitation goes to a multicast address any host could have joined. These three kinds of frame are **BUM** traffic: broadcast, unknown unicast and multicast. The underlay is a routed IP network that delivers a packet to one loopback address, so it cannot carry a frame addressed to everyone without help.

There are two ways to get a BUM frame to every leaf that carries the segment. With **ingress replication**, the leaf where the frame enters makes one unicast copy per remote leaf, using a list that BGP builds from EVPN type-3 routes. With **underlay multicast**, the leaf sends one copy to an IP multicast group, and the underlay routers copy it wherever the distribution tree branches. Building that tree takes a second routing protocol, PIM, with its own rendezvous points, designated routers and assert elections.

You need three earlier ideas. A **VTEP** (VXLAN tunnel endpoint) is the leaf function that wraps a tenant frame in 50 bytes of outer headers addressed to another leaf's loopback ([VXLAN encapsulation](/learn/fabric-networking/overlays-vxlan-evpn/vxlan-encapsulation)). A **VNI** (VXLAN network identifier) is the 24-bit number naming a tenant segment; Acme's VLAN 100 is VNI 10100. EVPN **type-2 routes** advertise one MAC (and usually its IP) behind one VTEP ([EVPN, the control plane](/learn/fabric-networking/overlays-vxlan-evpn/evpn-the-control-plane)); every EVPN route carries a **route distinguisher** (RD, a prefix that keeps each leaf's copy of a route distinct) and one or more **route targets** (RT, tags that decide which leaves import it).

## What BUM traffic is and where it comes from

A classic Ethernet switch floods all three kinds of BUM frame out of every port in the VLAN except the arrival port ([switches, VLANs and loops](/learn/fabric-networking/from-zero/switches-vlans-and-loops)). An overlay does the same across the fabric, so a VNI's **flood scope** is the set of VTEPs that carry it. On Meridian, VNI 10100 sits on five leaves: `leaf1.ams`, `leaf3.ams` and `leaf4.ams` in Amsterdam, and `leaf1.sin` and `leaf2.sin` in Singapore. `leaf2.ams` carries only Globex's VNI 10200 and must never see Acme's floods.

| Kind | Destination MAC | Typical sources in a data center | How much EVPN removes |
|---|---|---|---|
| Broadcast | `ff:ff:ff:ff:ff:ff` | ARP requests, DHCP discover and request, gratuitous ARP after a VM moves or a failover | Most ARP: the local leaf answers from type-2 routes (ARP suppression) |
| Unknown unicast | A real host MAC that is not in the leaf's table | Silent hosts, a MAC that aged out while a sender's ARP cache still holds it, the moments after a move | Most of it: every active MAC is advertised, so few destinations are unknown |
| Multicast | `01:00:5e:…` (IPv4) or `33:33:…` (IPv6) | IPv6 neighbour discovery and router advertisements, mDNS, VRRP, tenant applications (market data, video, cluster heartbeats) | Neighbour discovery is suppressed like ARP; tenant multicast is not |

ARP suppression is what makes BUM traffic small in an EVPN fabric. The leaf intercepts an ARP request for an IP it has already learned from a type-2 route and answers it locally, so the request never enters the fabric. The visualisation below ends with exactly that.

```viz
{"type": "fabric", "scenario": "evpn-mac-learning", "title": "A type-2 route from leaf1.ams to every Acme leaf, then ARP suppression answering locally", "caption": "leaf1.ams learns acme-web1's MAC and IP from one ARP, advertises a type-2 route through rr1.ams and rr1.sin, leaf2.ams (Globex only) discards it on route target, and leaf2.sin installs it; when acme-web2 later ARPs for 10.1.1.10, leaf2.sin answers from its suppression table and no copy crosses the fabric."}
```

What is left after suppression is the ARP for an IP no leaf has learned yet, DHCP, gratuitous ARP, unknown unicast and real tenant multicast. Each of these still has to reach every VTEP in the VNI.

**What flooding solves:** delivery to a destination whose location is unknown or plural, which is how ARP, DHCP and host discovery work at all. **How it breaks:** it costs every member of the segment for every frame, and a loop multiplies it without limit. **Signal:** per-VNI broadcast, unknown-unicast and multicast counters on each leaf's access ports and tunnels, kept as three separate counters, because each has a different cause.

## The flood list and the type-3 route

To flood, a leaf needs a **flood list**: for each VNI, the remote VTEPs that should get a copy. Before EVPN, fabrics that wanted no multicast typed these lists in by hand ("static head-end replication"), so adding a leaf meant editing every other leaf, an outage waiting to happen at dozens of leaves. EVPN builds the list automatically with **route type 3, the inclusive multicast Ethernet tag route** (IMET, RFC 7432). Each VTEP originates one type-3 route per VNI it carries. The route means "I have this VNI; send me its BUM traffic, and here is how".

`leaf3.ams`'s type-3 route for VNI 10100, field by field:

| Field | Size | Value | What reads it |
|---|---|---|---|
| Route distinguisher | 8 bytes | `10.255.1.13:10100` | BGP: makes the route unique fabric-wide, so reflectors keep every leaf's copy |
| Ethernet tag ID | 4 bytes | 0 (VLAN-based service: one VLAN per VNI) | Importing leaf |
| IP address length | 1 byte | 32 (bits) | Parser |
| Originating router's IP | 4 bytes | `10.255.1.13` | Importing leaf: which VTEP to add to the list |
| PMSI tunnel attribute: flags | 1 byte | 0 (no leaf-information request) | Importing leaf |
| PMSI tunnel attribute: tunnel type | 1 byte | 6, ingress replication | Importing leaf: replicate by unicast copy |
| PMSI tunnel attribute: label | 3 bytes | 10100 (RFC 8365 puts the VNI in this MPLS-label field) | Importing leaf: the VNI to stamp on each copy |
| PMSI tunnel attribute: tunnel endpoint | 4 bytes | `10.255.1.13` | Importing leaf: the outer destination of each copy |
| Route target (extended community) | 8 bytes | `65000:10100` | Every leaf: import only if it carries VNI 10100 |
| Encapsulation (extended community) | 8 bytes | tunnel type 8, VXLAN | Importing leaf: how to build the outer headers |

The **PMSI tunnel attribute** (provider multicast service interface, borrowed from MPLS multicast VPNs in RFC 6514) is what makes the type-3 route a choice between the two designs. Type 6 asks for ingress replication. Types 3, 4 and 5 name a PIM source-specific, sparse-mode or bidirectional tree and carry the sender's address and the multicast group instead of a unicast endpoint. In practice many multicast-underlay deployments map VNIs to groups statically on every leaf, and the attribute only confirms what the configuration already says.

A type-3 route is small and stable: one per VNI per VTEP, changing only when a VNI is added or removed. A site with 16 leaves and 200 VNIs each holds 3,200, little next to the hosts' type-2 routes. Through the reflector pair ([route reflectors](/learn/fabric-networking/bgp-fundamentals/route-reflectors)) every leaf hears every type-3 route, keeps those whose route target it imports, and turns them into its flood list. On a Linux-based network operating system (NOS: FRRouting on Cumulus Linux or SONiC) the result is visible in the kernel bridge's forwarding database (FDB, its MAC table) as all-zero MAC entries, one per remote VTEP (illustrative output):

```text
leaf1.ams$ bridge fdb show dev vxlan10100 | grep 00:00:00:00:00:00
00:00:00:00:00:00 dst 10.255.1.13 self permanent
00:00:00:00:00:00 dst 10.255.1.14 self permanent
00:00:00:00:00:00 dst 10.255.2.11 self permanent
00:00:00:00:00:00 dst 10.255.2.12 self permanent
```

An all-zero entry means "a destination for any frame without a better match". The kernel sends a flooded frame to each of them in turn, and a hardware platform programs the same list into the ASIC's replication table.

**What type-3 routes solve:** a flood list that follows the VNI configuration automatically, with no hand-maintained peer lists. **How they break:** a leaf that does not originate the route, or a route target that does not match, silently drops that leaf from everyone's flood list. Known unicast keeps working through type-2 routes, while ARP to a new host, DHCP and anything else that needs a first broadcast fails. **Signal:** for each VNI, the number of type-3 originators compared with the number of leaves that should carry it.

## Ingress replication, traced

`acme-web1` (10.1.1.10, on `leaf1.ams` port 1) ARPs for 10.1.1.50, an address no leaf has learned because the host is silent or not up yet:

1. **Access port.** The ARP request arrives as a 60-byte frame (42 bytes of Ethernet and ARP, padded to Ethernet's minimum), destination `ff:ff:ff:ff:ff:ff`, VLAN 100.
2. **ARP suppression.** `leaf1.ams` finds no entry for 10.1.1.50 in its suppression table (every IP learned from type-2 routes).
3. **Local flood.** It copies the frame to its other VLAN 100 access ports, like a classic switch.
4. **Remote flood.** Its flood list for VNI 10100 holds four VTEPs, so it builds four 110-byte VXLAN packets (the 60-byte frame plus 50 bytes of outer headers) that differ only in outer destination.
5. **Underlay.** Each copy is ordinary unicast to one loopback. ECMP (equal-cost multipath: a router spreads flows over equally good next hops by hashing their headers, [ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)) runs on each copy's outer headers separately: in the trace, three copies take `spine1.ams` and the copy for `leaf4.ams` takes `spine2.ams`. Two copies, for `leaf1.sin` and `leaf2.sin`, cross the 10,500 km Amsterdam–Singapore circuit, one after the other.
6. **Egress.** Each receiving VTEP strips the outer headers, sees VNI 10100, and floods the frame to its own VLAN 100 access ports, never back into the fabric. This is the overlay's **split horizon** rule: the ingress leaf already sent a copy to every VTEP, so passing one on would loop. Where a server is dual-attached to two leaves, as `acme-web2` is to `leaf1.sin` and `leaf2.sin`, only one of them, the designated forwarder, delivers it ([EVPN multihoming](/learn/fabric-networking/overlays-vxlan-evpn/evpn-multihoming)).

Copy 1, as it leaves `leaf1.ams` towards `spine1.ams`:

| Header | Field | Size | Value | What reads it |
|---|---|---|---|---|
| Outer Ethernet | Destination, source MAC, EtherType | 14 bytes | `00:00:5e:00:53:80`, `00:00:5e:00:53:81`, `0x0800` (IPv4) | This link only; rewritten at every hop |
| Outer IPv4 | Source, destination | 20 bytes | `10.255.1.11` → `10.255.1.13`, TTL 64, protocol 17, total length 96 | Every underlay router |
| Outer UDP | Source port, destination port | 8 bytes | 54172 (a hash of the inner frame, for ECMP entropy), 4789 | Spines' hash; the receiving VTEP |
| VXLAN | Flags, VNI | 8 bytes | `0x08`, 10100 | The receiving VTEP |
| Inner Ethernet | Destination, source, EtherType | 14 bytes | `ff:ff:ff:ff:ff:ff`, `00:00:5e:00:53:0a`, `0x0806` (ARP) | Hosts in VLAN 100 |
| ARP | Request | 28 + 18 padding | who-has 10.1.1.50, tell 10.1.1.10 | Every host in VLAN 100 |

The visualisation runs this broadcast twice, first with ingress replication and then with underlay multicast.

```viz
{"type": "fabric", "scenario": "bum-replication", "title": "One ARP broadcast in VNI 10100: four unicast copies from leaf1.ams, then one copy down a PIM tree", "caption": "leaf1.ams builds its flood list from four type-3 routes and sends four 110-byte unicast copies, two of them across the Amsterdam–Singapore circuit; the cost table scales that to 256 VTEPs. Then VNI 10100 is mapped to group 239.1.1.100 with the rendezvous point on spine1.ams: leaf1.ams sends one copy, and spine1.ams and spine1.sin replicate only where the tree branches. It ends with the comparison and the choice most large fabrics make."}
```

The model below builds the flood list from the type-3 routes `leaf1.ams` holds and counts copies per link for both designs, using the same paths as the visualisation.

```python
from collections import Counter

LOOPBACK = {"leaf1.ams": "10.255.1.11", "leaf2.ams": "10.255.1.12", "leaf3.ams": "10.255.1.13",
            "leaf4.ams": "10.255.1.14", "leaf1.sin": "10.255.2.11", "leaf2.sin": "10.255.2.12"}
NAME = {ip: name for name, ip in LOOPBACK.items()}

# Type-3 (inclusive multicast) routes leaf1.ams imported, as (RD, originating router, PMSI type, VNI).
TYPE3 = [
    ("10.255.1.13:10100", "10.255.1.13", 6, 10100),
    ("10.255.1.14:10100", "10.255.1.14", 6, 10100),
    ("10.255.2.11:10100", "10.255.2.11", 6, 10100),
    ("10.255.2.12:10100", "10.255.2.12", 6, 10100),
    ("10.255.1.12:10200", "10.255.1.12", 6, 10200),   # Globex's segment on leaf2.ams
    ("10.255.1.11:10100", "10.255.1.11", 6, 10100),   # leaf1.ams's own route, reflected back
]


def flood_list(routes, vni, me):
    """Remote VTEPs to copy this VNI's BUM traffic to: one per type-3 route for the VNI, never myself."""
    return sorted({orig for _, orig, pmsi, v in routes if v == vni and pmsi == 6 and orig != me})


# Underlay paths from leaf1.ams (the uplink each copy hashed to, as in the visualisation above).
PATH = {"leaf3.ams": ["leaf1.ams", "spine1.ams", "leaf3.ams"],
        "leaf4.ams": ["leaf1.ams", "spine2.ams", "leaf4.ams"],
        "leaf1.sin": ["leaf1.ams", "spine1.ams", "spine1.sin", "leaf1.sin"],
        "leaf2.sin": ["leaf1.ams", "spine1.ams", "spine1.sin", "leaf2.sin"]}
# The PIM shared tree for 239.1.1.100 rooted at the RP, spine1.ams, as (parent, child) links.
TREE = [("leaf1.ams", "spine1.ams"), ("spine1.ams", "leaf3.ams"), ("spine1.ams", "leaf4.ams"),
        ("spine1.ams", "spine1.sin"), ("spine1.sin", "leaf1.sin"), ("spine1.sin", "leaf2.sin")]


def ingress_replication(targets):
    links = Counter()
    for vtep in targets:
        hops = PATH[NAME[vtep]]
        links.update(zip(hops, hops[1:]))       # every copy crosses every link on its own path
    return links


def multicast(tree):
    return Counter(tree)                        # one copy per branch of the tree


frame = 60 + 50                                 # padded ARP frame plus VXLAN's 50 bytes of outer headers
targets = flood_list(TYPE3, 10100, LOOPBACK["leaf1.ams"])
print("flood list for VNI 10100:", [NAME[t] for t in targets])
ir, mc = ingress_replication(targets), multicast(TREE)
print(f"{'link':<24}{'ingress repl.':>14}{'multicast':>11}")
for link in sorted(set(ir) | set(mc)):
    print(f"{link[0] + '->' + link[1]:<24}{ir[link]:>14}{mc[link]:>11}")
print(f"{'transmissions':<24}{sum(ir.values()):>14}{sum(mc.values()):>11}")
print(f"{'bytes on all links':<24}{sum(ir.values()) * frame:>14}{sum(mc.values()) * frame:>11}")
```

```text
flood list for VNI 10100: ['leaf3.ams', 'leaf4.ams', 'leaf1.sin', 'leaf2.sin']
link                     ingress repl.  multicast
leaf1.ams->spine1.ams                3          1
leaf1.ams->spine2.ams                1          0
spine1.ams->leaf3.ams                1          1
spine1.ams->leaf4.ams                0          1
spine1.ams->spine1.sin               2          1
spine1.sin->leaf1.sin                1          1
spine1.sin->leaf2.sin                1          1
spine2.ams->leaf4.ams                1          0
transmissions                       10          6
bytes on all links                1100        660
```

In `flood_list`, `v == vni` stands for the route-target import (Globex's route never joins the list), and `orig != me` drops the leaf's own route reflected back. Every receiving leaf gets one copy either way; the designs differ on the ingress leaf's uplinks (four copies against one) and on the long-haul circuit (two against one).

**What ingress replication solves:** BUM delivery over a unicast-only underlay, with the flood list maintained by BGP. **How it breaks:** the ingress leaf's uplinks carry $n - 1$ copies of every BUM frame, so heavy flooding or tenant multicast on a wide VNI saturates them, and an incomplete flood list silently skips a leaf. **Signal:** BUM bytes on uplinks against BUM bytes from access ports, per VNI, and flood-list length against type-3 route count.

## Replication cost, worked

For a VNI on $n$ VTEPs, ingress replication turns one BUM frame into $n - 1$ copies, all made by the ingress leaf and all leaving on its uplinks:

$$\text{uplink load} = (n - 1) \times \text{BUM packets/s} \times (\text{frame} + 50\ \text{bytes}) \times 8$$

Three things follow from it:

- **Receivers pay the same in both designs.** Every VTEP in the VNI receives every flooded frame once.
- **Total fabric load roughly doubles, and it concentrates.** In one site, each unicast copy crosses two links (leaf to spine, spine to leaf), so ingress replication costs about $2(n-1)$ link transmissions per frame against about $n$ for a tree. Worse, the $n - 1$ copies all leave one leaf's uplinks.
- **Shared long links multiply.** Every remote-site VTEP gets its own copy across the inter-site circuit: with 20 Acme leaves in Singapore, one Amsterdam broadcast crosses the ocean 20 times. Under multicast it crosses once.

The script below works the formula for two kinds of traffic: the trickle a well-run EVPN segment carries (assumed: 50 small BUM frames a second after ARP suppression; the real rate grows with host count and churn), and a tenant pushing a 2 Gb/s multicast stream of 1,000-byte packets (market data or video). The leaf is assumed to have four 100 Gb/s uplinks.

```python
VXLAN_OVERHEAD = 50                           # outer Ethernet 14 + IPv4 20 + UDP 8 + VXLAN 8
UPLINKS_BPS = 4 * 100e9                       # assumed: a leaf with four 100 Gb/s uplinks


def ir_uplink_load(vteps, pps, inner_bytes):
    """Bits per second ingress replication puts on the ingress leaf's uplinks."""
    copies = vteps - 1                        # one per remote VTEP on the flood list
    return copies, copies * pps * (inner_bytes + VXLAN_OVERHEAD) * 8


def pim_entries(groups, sources_per_group, source_trees=True):
    """(*,G) per group, plus one (S,G) per sending VTEP when routers switch to source trees."""
    return groups + (groups * sources_per_group if source_trees else 0)


loads = {"ARP trickle": (50, 60), "2 Gb/s stream": (250_000, 1000)}   # (packets/s, inner frame bytes)
print(f"{'VTEPs':>5}  {'traffic':<14}{'copies':>6}  {'uplink load':>14}  {'of uplinks':>10}")
for vteps in (5, 16, 64, 256):
    for name, (pps, size) in loads.items():
        copies, bps = ir_uplink_load(vteps, pps, size)
        print(f"{vteps:>5}  {name:<14}{copies:>6}  {bps / 1e6:>9,.1f} Mb/s  {bps / UPLINKS_BPS:>10.1%}")

print("multicast entries, 500 groups, 64 sending VTEPs each:",
      pim_entries(500, 64), "with source trees,", pim_entries(500, 64, source_trees=False), "shared trees only")
```

```text
VTEPs  traffic       copies     uplink load  of uplinks
    5  ARP trickle        4        0.2 Mb/s        0.0%
    5  2 Gb/s stream      4    8,400.0 Mb/s        2.1%
   16  ARP trickle       15        0.7 Mb/s        0.0%
   16  2 Gb/s stream     15   31,500.0 Mb/s        7.9%
   64  ARP trickle       63        2.8 Mb/s        0.0%
   64  2 Gb/s stream     63  132,300.0 Mb/s       33.1%
  256  ARP trickle      255       11.2 Mb/s        0.0%
  256  2 Gb/s stream    255  535,500.0 Mb/s      133.9%
multicast entries, 500 groups, 64 sending VTEPs each: 32500 with source trees, 500 shared trees only
```

Check one row by hand: 64 VTEPs, the stream. 250,000 packets a second × 1,050 bytes × 8 = 2.1 Gb/s per copy; × 63 copies = 132.3 Gb/s, a third of the leaf's uplinks for one tenant's stream. At 256 VTEPs the stream needs more than the uplinks have, and BUM copies and unicast compete for the same queues. The trickle costs 11 Mb/s even at 256 VTEPs. The deciding variable is the BUM rate, not the segment size.

The last line is the bill for underlay multicast, paid in state rather than bandwidth. With PIM sparse mode, each group needs a `(*,G)` entry on every router in its tree. Once routers switch to source trees, each VTEP that sends to the group adds an `(S,G)` entry on the routers along its tree, and in an overlay every VTEP is a sender. With 500 VNIs on 500 groups and 64 VTEPs each, a router that sits on every tree (the RP, or a spine every leaf hashes to) holds up to 32,500 multicast routes, the same order as many switch ASICs' multicast tables (the exact size depends on the chip and its memory profile). Hence multicast designs map many VNIs onto few groups, stay on the shared tree, or use bidirectional PIM (below).

## Underlay multicast: one copy, replicated in the network

IP multicast addresses a packet to a **group**, an address in 224.0.0.0/4, rather than to a host; interested receivers join the group and the network delivers one copy to each. The administratively scoped range 239.0.0.0/8, kept inside one organisation, is the usual choice for VXLAN underlays. Meridian maps VNI 10100 to 239.1.1.100.

On Ethernet, a multicast IP becomes a multicast MAC by a fixed rule: the prefix `01:00:5e`, a zero bit, then the low 23 bits of the group address. For 239.1.1.100: the low 7 bits of the second octet (1), then 1 and 100 (`0x64`), giving `01:00:5e:01:01:64`. Five bits are dropped, so 32 groups share each MAC (224.1.1.100 and 239.129.1.100 among them), which matters only on shared layer-2 segments.

With multicast, every VTEP in VNI 10100 is both a receiver and a sender for 239.1.1.100. `leaf1.ams` sends its ARP broadcast once, to 239.1.1.100 and MAC `01:00:5e:01:01:64`, and the underlay copies it wherever the tree branches. Hosts ask their router for a group with IGMP (the Internet Group Management Protocol); a hardware VTEP is itself the router, so it sends the router-to-router PIM join directly and no IGMP appears on fabric links.

Mapping choices:

| Mapping | State | Waste | When |
|---|---|---|---|
| One group per VNI | One tree per VNI, the most state | None: a leaf gets floods only for VNIs it carries | Few VNIs, or heavy BUM per VNI |
| Many VNIs per group (say 4,000 VNIs on 32 groups) | Bounded by the group count | A leaf receives floods for every VNI in the group and drops those it does not carry | The common compromise |
| One group for everything | One tree | Every leaf receives every flood | Small fabrics only |

## PIM sparse mode from zero

**PIM** (Protocol Independent Multicast) builds the delivery trees. "Protocol independent" means it computes no routes of its own: it reuses the unicast table that IS-IS already built ([IS-IS from zero](/learn/fabric-networking/underlay/is-is-from-zero)). **Sparse mode** (PIM-SM, RFC 7761) assumes few routers want any given group, so nothing is forwarded until someone asks. The tree is built from the receivers towards the source, by explicit joins.

Four ideas carry the whole protocol:

- **Reverse-path forwarding (RPF).** A multicast packet has no single destination to route towards, so a router decides where a packet *should* come from instead. A packet from source S is accepted only on the interface the router would use to send unicast traffic *to* S (on the shared tree, towards the RP); anything else is dropped and counted as an RPF failure. That check is PIM's loop prevention, and why a wrong unicast route breaks multicast too. Joins travel the same unicast path towards the source or RP, and data flows back down it.
- **The rendezvous point (RP).** Receivers do not know which leaves will send, so every router agrees on one meeting point per group: on Meridian, `spine1.ams` (10.255.1.1). Receivers' joins build a **shared tree**, written `(*,G)` ("any source, group G"), from the RP down to them.
- **Registers.** A source's first-hop router does not wait for a tree: it wraps each data packet in a unicast **PIM Register** message to the RP, which unwraps it and sends it down the shared tree. The RP then joins a **source tree**, `(S,G)`, back towards the source, and once native packets arrive over that tree it sends **Register-Stop**.
- **Soft state.** Joins are re-sent every 60 s and expire after 210 s (RFC 7761's defaults). A branch nobody refreshes disappears by itself, so a router that loses track of state recovers by waiting.

### Traced: VNI 10100's tree comes up on Meridian

The steps below follow the visualisation's small example (two Amsterdam spines and `spine1.sin`, with the RP on `spine1.ams`):

| Step | Event | State created |
|---|---|---|
| 1 | VNI 10100 is enabled on `leaf3.ams`; its RPF lookup for the RP 10.255.1.1 points at the `spine1.ams` link, and it sends a `(*,239.1.1.100)` join there | `spine1.ams`: `(*,G)`, outgoing to `leaf3.ams` |
| 2 | `leaf4.ams` and `leaf1.ams` do the same | `spine1.ams`: outgoing adds `leaf4.ams`, `leaf1.ams` |
| 3 | `leaf1.sin`'s RPF towards 10.255.1.1 is `spine1.sin`; it joins there, and `spine1.sin`, which has no state yet, creates `(*,G)` and sends its own join on towards the RP over the circuit | `spine1.sin`: `(*,G)` to both Singapore leaves; `spine1.ams`: outgoing adds `spine1.sin` |
| 4 | `spine2.ams` received no join | None: no branch, no copies |
| 5 | `leaf1.ams` floods its ARP: the first packet travels to the RP inside a unicast Register | `spine1.ams`: `(10.255.1.11, G)` |
| 6 | `spine1.ams` unwraps it and forwards it down the shared tree, except back towards `leaf1.ams`, where it came from; it joins `(10.255.1.11, G)` towards `leaf1.ams`, the adjacent link | Source tree from `leaf1.ams` to the RP |
| 7 | Native packets arrive; `spine1.ams` sends Register-Stop | `leaf1.ams` stops wrapping and sends native multicast |

```mermaid
sequenceDiagram
    participant L1 as leaf1.ams (source)
    participant RP as spine1.ams (RP)
    participant L3 as leaf3.ams (receiver)
    L3->>RP: PIM join (*, 239.1.1.100)
    L1->>RP: Register (ARP broadcast inside, unicast)
    RP->>L3: native multicast down the shared tree
    RP->>L1: PIM join (10.255.1.11, 239.1.1.100)
    L1->>RP: native multicast
    RP->>L1: Register-Stop
    Note over L1,RP: 5 s before the 60 s suppression timer ends, a null Register probes; Register-Stop answers
```

Leaves may then switch to source trees: `leaf3.ams` sends an `(S,G)` join along its unicast path to 10.255.1.11. In a Clos (the leaf-spine design where every leaf connects to every spine, [Clos and leaf-spine](/learn/fabric-networking/fabric-architecture/clos-and-leaf-spine)) that path has two equal-cost next hops, `spine1.ams` and `spine2.ams`, and PIM picks one per tree, never per packet (by default often the neighbour with the highest address; with multicast multipath, a hash of source and group). Different trees can land on different spines, but each tree takes one path, so a heavy group is pinned to one spine where unicast would spread across all of them. The visualisation stays on the shared tree, which is why `spine2.ams` holds no state there.

**Two refinements matter in production.** A single RP is a single point of failure for new sources, so fabrics run **anycast RP**: the same RP address on a loopback of two or more spines, with the members telling each other about active sources through PIM itself (RFC 4610) or MSDP (RFC 3446; the Multicast Source Discovery Protocol, a TCP session between RPs that announces active sources). Fabrics where every VTEP sends to every group also often use **bidirectional PIM** (RFC 5015), which keeps only the shared tree (no registers, no `(S,G)`), so state is one entry per group, whatever the number of senders.

**What PIM solves:** one copy per link, with the network replicating at branch points, and trees that follow membership automatically. **How it breaks:** RP unreachable or inconsistent between anycast members, RPF failures after unicast routing changes, joins lost while soft state times out. **Signal:** `(*,G)` and `(S,G)` counts compared with the expected count, RPF-failure counters, PIM neighbour counts per link, and the RP mapping on every router.

## The DR and the assert: when routers share a segment

Two more PIM mechanisms exist for **shared segments**, where several PIM routers sit on one LAN and, uncoordinated, could both pull a group in and forward it, duplicating every packet.

The **designated router (DR)** is elected on each LAN from PIM hellos (sent every 30 s, holdtime 105 s): highest DR priority wins (default 1), then the highest IP address. The DR has two jobs: on the source side it sends the Registers to the RP, and on the receiver side it alone acts on hosts' IGMP reports and joins towards the RP. If the DR fails, the others take over only when its holdtime runs out, a 105 s gap that BFD (bidirectional forwarding detection, a sub-second hello protocol, [convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd)) or a shorter hello interval can shorten.

The **assert** fixes duplicates that slip through anyway, for example when both routers receive downstream joins from another router on the LAN. A router that sees a multicast packet arrive on an interface it is itself forwarding that group onto knows another router is doing the same, and sends an Assert. Both compare, in order: source-tree state beats shared-tree state; then the lower route preference (administrative distance) to the source or RP; then the lower routing metric; then the higher IP address. The loser stops forwarding that stream onto the LAN for 180 s, and the winner repeats its Assert before then.

DR and assert winners are independent. Suppose Meridian's border gateways `gw1.ams` (192.0.2.2) and `gw2.ams` (192.0.2.3) share one VLAN with a partner's multicast receivers (192.0.2.0/24 is a range reserved for documentation, RFC 5737). With equal priority, `gw2.ams` is DR on the higher address. If both forward the stream from `leaf1.ams` (10.255.1.11), and `gw1.ams` has IS-IS metric 20 to it against `gw2.ams`'s 30, then `gw1.ams` wins the assert and forwards that stream, while `gw2.ams` stays DR for everything else.

```python
import ipaddress


def elect_dr(neighbours):
    """PIM DR on a shared segment: highest priority, then highest IP address."""
    return max(neighbours, key=lambda n: (n["priority"], ipaddress.ip_address(n["ip"])))


def assert_winner(contenders):
    """PIM assert: source-tree state beats shared-tree state, then lower route preference,
    then lower metric to the source (or RP), then highest IP address."""
    return min(contenders, key=lambda c: (not c["spt"], c["preference"], c["metric"],
                                          -int(ipaddress.ip_address(c["ip"]))))


segment = [{"name": "gw1.ams", "ip": "192.0.2.2", "priority": 1},
           {"name": "gw2.ams", "ip": "192.0.2.3", "priority": 1}]
print("DR:", elect_dr(segment)["name"])

# Both gateways forward (10.255.1.11, 239.1.1.100) onto the segment; each sees the other's copy.
contenders = [{"name": "gw1.ams", "ip": "192.0.2.2", "spt": True, "preference": 115, "metric": 20},
              {"name": "gw2.ams", "ip": "192.0.2.3", "spt": True, "preference": 115, "metric": 30}]
print("assert winner:", assert_winner(contenders)["name"])
contenders[1]["metric"] = 20                   # equal metrics: the higher address wins
print("assert winner, equal metrics:", assert_winner(contenders)["name"])
```

```text
DR: gw2.ams
assert winner: gw1.ams
assert winner, equal metrics: gw2.ams
```

`not c["spt"]` sorts source-tree contenders first, and the negated address makes the higher IP win inside `min`. Preference 115 is IS-IS's administrative distance on Cisco-style platforms and FRRouting, while Junos uses 15 and 18: between two vendors an assert can be decided by defaults nobody chose.

In a fabric this mostly does not matter. Meridian's underlay is all /31 point-to-point links, so every "segment" has exactly two routers, one upstream and one downstream, and the DR and assert decide nothing between spines and leaves. They matter at the edges: a LAN where the fabric's multicast meets an external network, and tenant VLANs when tenant multicast is routed by several leaves. The hard parts of campus multicast mostly do not apply to a Clos; what remains is the RP, the RPF check, the state count and one more protocol to run.

**What the DR and assert solve:** exactly one router registering, joining and forwarding for each stream on a shared LAN. **How they break:** a failed DR leaves the LAN without joins for up to the 105 s hello holdtime, and an assert loser whose routing changes can start duplicating until the next assert. **Signal:** duplicate packets on a segment, assert counters, and DR changes in PIM neighbour logs.

## Which one large fabrics choose, and why

Most large EVPN-VXLAN fabrics use ingress replication, and it is the default on Cumulus/NVUE and SONiC:

1. **There is little to replicate.** Suppression removes most broadcast, type-2 routes most unknown unicast, and the rest is the trickle the cost table showed: megabits, not gigabits.
2. **The ASIC does it at line rate.** Copies cost uplink bandwidth, not CPU. The real limit is how many remote VTEPs a flood list can hold (hundreds to a few thousand, depending on the platform).
3. **One protocol fewer.** No PIM, no RP placement, no multicast table to size, no RPF failures to debug. The flood list is BGP state, visible with the same tools as every other EVPN route.
4. **It crosses sites and clouds.** Leased circuits and carrier services often carry no multicast. Even fabrics that use multicast inside a site usually use ingress replication between sites, with border devices replicating.
5. **Its failures are local.** A wrong flood list hurts one VNI on one leaf. A broken RP hurts every group that uses it.

Underlay multicast wins where the arithmetic turns: segments spanning hundreds of VTEPs with heavy flooding, tenants that send real multicast (trading floors, broadcast media, some clustered storage), and older flood-and-learn VXLAN fabrics (RFC 7348 assumed a multicast underlay because it had no control plane). A middle path is **assisted replication** (RFC 9574): the ingress leaf sends one copy to one of a few designated replicator nodes, which sends the rest, moving the fan-out off small leaves without running PIM.

Tenant multicast has a further refinement that works with either design. With IGMP snooping on access ports (the leaf listens to hosts' group reports), a leaf advertises the tenant groups its hosts want in an EVPN **type-6 route**, the selective multicast Ethernet tag route (RFC 9251), and the ingress leaf replicates a group only to the VTEPs that asked for it. A market-data feed wanted by 4 of 64 leaves costs 4 copies, not 63, which removes most of the case for an underlay tree. Broadcast and unknown unicast still go to every VTEP in the VNI.

| | Ingress replication | PIM-SM underlay | Bidir-PIM underlay | Assisted replication |
|---|---|---|---|---|
| Copies from the ingress leaf | $n - 1$ | 1 | 1 | 1 (to a replicator) |
| Copies on a shared long-haul circuit | One per remote VTEP | 1 | 1 | Depends on replicator placement |
| Underlay state | None | `(*,G)` per group, plus `(S,G)` per sender | `(*,G)` per group | None beyond EVPN |
| Protocols to operate | EVPN only | EVPN (or static maps), PIM, RP and anycast RP | EVPN, Bidir-PIM, RP | EVPN with the RFC 9574 extensions |
| Failure blast radius | One VNI, one leaf's list | Every group on a failed RP | Every group on the RP's path | VNIs served by the replicator |
| Best fit | Typical EVPN fabric, multi-site | Large segments, heavy tenant multicast | Many senders per group | Large VNIs on modest leaves |

## Failure modes in production

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Missing type-3 route (VNI missing on one leaf, route-target typo, export filter) | "Half-alive" segment: established flows work, hosts behind that leaf never answer a first ARP, DHCP fails, a newly booted VM is unreachable | Type-3 originators per VNI compared with intent; the leaf missing from other leaves' flood lists | Fix the VNI or route target; then check every VNI, because a template error rarely hits only one |
| Unknown-unicast flood from timer mismatch | Steady unknown-unicast counters (not spikes); a silent host's leaf uplinks busy with traffic that is not for it | A host's ARP entry (often 4 hours on routers and firewalls) outlives the leaf's MAC entry (minutes, 300 s by IEEE 802.1D default), so the leaf withdraws the type-2 route and traffic to it is flooded to every VTEP | Make MAC aging longer than ARP timeouts, or let the leaf refresh silent hosts' ARP; some fabrics drop unknown unicast once EVPN advertises every MAC |
| Loop on a tenant's side (a server bridging two NICs, a mis-cabled switch) | BUM rate in one VNI jumps by orders of magnitude; MAC flaps between two ports; uplinks and the long-haul circuit fill | BUM counters per port, MAC-move events (EVPN's MAC mobility sequence numbers rising fast) | Storm control (a BUM rate limit per access port) as standing policy; shut the looping port; EVPN duplicate-MAC detection (RFC 7432's default: 5 moves in 180 s freezes the MAC) |
| RP failure or anycast-RP members out of sync (multicast mode) | BUM between some leaf pairs fails while other pairs work; new sources never reach receivers | `(S,G)` present on one RP member only; RP unreachable from some leaves; Registers with no Register-Stop | Anycast RP on at least two spines with a unique ID loopback each; monitor RP reachability from every leaf |
| RPF failure after an underlay change (multicast mode) | Multicast drops after a link cost change or maintenance while unicast is fine | RPF-failure counters rising on one interface; the unicast route to the source or RP points elsewhere | Make the unicast path and the tree agree; rejoin; avoid static multicast routes that freeze the old path |
| Flood list overflow | Some remote VTEPs silently left out of BUM delivery when a VNI is stretched further | Installed flood list shorter than the type-3 route count; hardware resource warnings | Shrink the VNI's span, use assisted replication or multicast for that VNI |

The first row is the one to remember. A segment that passes every ping test between known hosts and still breaks every new host is a BUM problem until proven otherwise.

## Under the hood: how a switch replicates

On a switching ASIC ([planes, ASICs and network operating systems](/learn/fabric-networking/from-zero/planes-asics-and-network-operating-systems)) the flood list becomes a **replication group**: an index into a table of output entries, each one a local port, or a tunnel with its own outer destination and rewrite. A BUM frame's lookup returns the group index instead of one port. The replication engine, normally near the egress of the pipeline, makes the copies and runs each through its own encapsulation, so the copies cost egress bandwidth and replication-engine cycles rather than CPU. Large fan-outs on some chips recirculate the packet (send it through the pipeline again), which costs throughput; only the platform's documented limits are reliable.

On a software VTEP, the Linux VXLAN driver walks the all-zero FDB entries shown earlier and transmits one encapsulated copy per entry, in the kernel. That suits a lab or a hypervisor with a few peers, and is CPU-bound in a way the ASIC is not ([how Linux sends and receives packets](/learn/fabric-networking/from-zero/how-linux-sends-and-receives-packets)). In multicast mode the same device is created with a group address instead of a list, and the kernel joins the group on the underlay interface.

The type-3 route reaches that table like every BGP route: imported on route target, handed to the routing manager (`zebra` in FRRouting), and written to the kernel FDB or the ASIC SDK. A flood list can be wrong in BGP, in the kernel or in hardware, so tooling compares all three.

## What the platform should show

Tooling should answer "is this segment's flooding healthy?" without anyone logging into five leaves. Surface:

- **Per VNI: intended VTEPs, type-3 originators and installed flood lists, diffed.** The source of truth says which leaves should carry the VNI, the reflectors show which leaves advertise it, and each leaf shows what it installed. Any difference is a finding.
- **BUM rate per VNI per leaf, split into broadcast, unknown unicast and multicast.** A steady unknown-unicast rate points at timers, broadcast spikes at a loop or a mass reboot, and multicast at a tenant application.
- **Replication amplification:** bytes of BUM sent on uplinks divided by bytes of BUM received from access ports. Under ingress replication it approaches $n - 1$, and shows which VNIs will cost most as they grow.
- **BUM bytes on inter-site circuits,** because those copies multiply by remote VTEP count on the most expensive links.
- **Storm-control drops per access port,** to tell a loop on the tenant's side from a fabric fault.
- **In multicast mode:** RP reachability from every leaf, the RP mapping on every router (one disagreement splits the domain), `(*,G)` and `(S,G)` counts against expected values, RPF-failure counters and PIM neighbour counts.

The first item, as code:

```python
INTENT = {10100: {"10.255.1.11", "10.255.1.13", "10.255.1.14", "10.255.2.11", "10.255.2.12"},
          10200: {"10.255.1.12"}}
# Originators of type-3 routes for each VNI, as the route reflectors hold them.
TYPE3_AT_RR = {10100: {"10.255.1.11", "10.255.1.13", "10.255.2.11", "10.255.2.12", "10.255.1.16"},
               10200: {"10.255.1.12"}}
# Each leaf's installed flood list (on Linux: the all-zero MAC entries of the VXLAN device).
INSTALLED = {("10.255.1.11", 10100): {"10.255.1.13", "10.255.2.11", "10.255.2.12", "10.255.1.16"},
             ("10.255.1.13", 10100): {"10.255.1.11", "10.255.2.11", "10.255.2.12", "10.255.1.16"},
             ("10.255.2.12", 10100): {"10.255.1.11", "10.255.2.11", "10.255.1.16"}}


def audit(intent, advertised, installed):
    findings = []
    for vni, want in intent.items():
        have = advertised.get(vni, set())
        for vtep in sorted(want - have):
            findings.append(f"VNI {vni}: {vtep} sends no type-3 route; nobody floods to it (hosts behind it miss ARP)")
        for vtep in sorted(have - want):
            findings.append(f"VNI {vni}: {vtep} advertises a type-3 route it should not; wasted copies or a leak")
    for (leaf, vni), flood in sorted(installed.items()):
        expected = advertised.get(vni, set()) - {leaf}
        if flood != expected:
            findings.append(f"{leaf} VNI {vni}: flood list differs from BGP, "
                            f"missing {sorted(expected - flood)}, extra {sorted(flood - expected)}")
    return findings


for line in audit(INTENT, TYPE3_AT_RR, INSTALLED):
    print(line)
```

```text
VNI 10100: 10.255.1.14 sends no type-3 route; nobody floods to it (hosts behind it miss ARP)
VNI 10100: 10.255.1.16 advertises a type-3 route it should not; wasted copies or a leak
10.255.2.12 VNI 10100: flood list differs from BGP, missing ['10.255.1.13'], extra []
```

Three findings. `leaf4.ams` (10.255.1.14) lacks the VNI or has a wrong route target: the half-alive segment from the failure table. `leaf6.ams` (10.255.1.16) carries an Acme VNI that intent does not give it: wasted copies at best, the wrong tenant at worst ([VRFs and multi-tenancy](/learn/fabric-networking/overlays-vxlan-evpn/vrfs-and-multi-tenancy)). `leaf2.sin` holds `leaf3.ams`'s type-3 route in BGP but never installed it, a fault between BGP and the data plane that BGP alone never shows. The engineer needs the leaf and the VNI, the manager "one tenant segment degraded in two sites, no outage yet", and the same diff feeds both ([telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability)).

## Interviewer follow-ups

**"How does a VXLAN fabric handle an ARP broadcast?"** Model answer: first, ARP suppression: if the leaf knows the target IP from a type-2 route, it answers locally. If not, it floods to local ports in the VLAN and to every remote VTEP in the VNI, either one unicast copy per VTEP on the flood list built from type-3 routes, or one copy to the VNI's multicast group. Receivers flood to access ports only. Common wrong answer: "the spines flood it", when spines see only outer packets and know nothing of VNIs.

**"Ingress replication or multicast for a 300-leaf fabric?"** Model answer: it depends on the BUM rate per VNI, not the leaf count. With ARP suppression and no tenant multicast, ingress replication: megabits even at 255 copies, and a unicast-only underlay. If tenants run real multicast, first selective forwarding with type-6 routes; if VNIs still span hundreds of leaves with heavy flooding, multicast for those VNIs, or assisted replication, sized against the multicast table. Common wrong answer: "multicast, because ingress replication doesn't scale", which ignores that receivers get every flooded frame in both designs and that PIM adds a protocol and an RP failure domain. An honest addition: "I'd defer to the network team on the platform's flood-list and multicast-table limits, but I'd measure BUM rate per VNI and replication amplification before deciding."

**"What does the RP do, and what happens if it dies?"** Model answer: it is where receivers' shared-tree joins meet sources' Registers, because receivers cannot know the senders in advance. If it dies with no anycast RP, built source trees keep forwarding (their joins never touch the RP), but the shared tree stops, and new sources cannot register nor new receivers join. BUM senders are bursty, so a leaf that floods rarely lets its `(S,G)` state lapse (210 s keepalive by default) and needs the RP again: flooding breaks between some leaf pairs, and the set grows over minutes. Production runs anycast RP on two or more spines. Common wrong answer: "all multicast stops at once", which misses why failures look partial.

**"Why does a wrong unicast route break multicast?"** Model answer: RPF accepts a packet only on the unicast interface towards its source, and joins follow the same lookup, so when the unicast path moves, packets on the old interface drop until the tree is rebuilt. Common wrong answer: "PIM has its own topology", the opposite of what "protocol independent" means.

## What mid-level engineers get wrong

- **Thinking multicast reduces what receivers handle.** Every VTEP in a VNI gets every flooded frame of that VNI once in both designs. Multicast moves copies off the ingress leaf and shared links, nothing more; only selective forwarding with type-6 routes sends a tenant group to fewer leaves.
- **Treating "unicast works" as "the segment works".** Type-2 routes carry established flows while a missing type-3 route breaks every new host.
- **Stretching a VNI everywhere "in case".** Every extra VTEP adds a copy to every BUM frame, a flood-list entry on every leaf, and copies across inter-site circuits.
- **Ignoring timer mismatches.** ARP caches that outlive MAC tables turn real data traffic into a steady unknown-unicast flood.

## Senior signals

- You start with ARP suppression and type-3 routes, and know that the BUM rate, not the fabric size, decides the replication design.
- You turn $(n - 1)$ copies into uplink gigabits, and know receivers pay the same either way while the ingress uplinks and inter-site circuit do not.
- You explain PIM through RPF, the RP, Registers and soft state, and know a multicast tree takes one path through an ECMP fabric.
- You know the DR and assert are shared-LAN mechanisms a /31 Clos mostly avoids; anycast RP and multicast state are the real costs.
- You diagnose "known hosts fine, new hosts broken" as a flooding problem, and build tooling that diffs intent, type-3 routes and installed flood lists.

## Check yourself

```quiz
- q: >-
    VNI 10100 spans 64 VTEPs, runs ingress replication and floods tenant multicast to the whole VNI. A tenant starts a 2 Gb/s multicast stream from a host on one leaf. What happens to that leaf's uplinks compared with an underlay multicast design?
  options: ["They carry about 63 copies either way, because every receiver needs one", "They carry about 63 copies, over 130 Gb/s, against one copy with multicast", "They carry two copies, one per spine, because ECMP splits the flood", "They carry one copy either way, because the spines do the replication"]
  answer: 1
  explanation: >-
    With ingress replication the ingress leaf makes one unicast copy per remote VTEP, 63 here, so 2.1 Gb/s on the wire per copy becomes about 132 Gb/s on its uplinks. With underlay multicast it sends one copy and the tree replicates at its branches. Spines never replicate unicast VXLAN copies; they forward each on its outer address. Receivers do each get one copy in both designs, but that is downstream of the ingress leaf, not on its uplinks.
- q: >-
    In an EVPN fabric, hosts that have been talking for hours are fine, but a newly booted VM behind leaf4.ams cannot get a DHCP lease or answer ARP. What should you check first?
  options: ["Whether the spines have the VM's MAC address in their forwarding tables", "Whether leaf4.ams sends a type-3 route for the VNI that the other leaves installed", "Whether leaf4.ams sends a type-2 route for every existing host in the VNI", "Whether the route reflectors have the VM's IP host route in their RIB"]
  answer: 1
  explanation: >-
    DHCP and first ARPs are broadcasts. If leaf4.ams originates no type-3 route for the VNI, no other leaf has it on its flood list, so broadcasts never reach it, while established flows keep working on type-2 routes. A new VM has no type-2 route yet, and the reflectors would only hold one after it was learned. Spines carry no tenant MACs at all.
- q: >-
    Why does underlay multicast not reduce the BUM load on each receiving leaf?
  options: ["Receivers get two copies, one from the RP and one from the source", "Multicast copies are larger because they carry a PIM header", "Receivers must send a PIM join for every frame they want", "Each VTEP in the VNI receives every BUM frame once in both designs"]
  answer: 3
  explanation: >-
    Flooding means every member of the segment gets the frame. Ingress replication delivers that one copy by unicast, multicast by the tree; either way each receiver handles each BUM frame of the VNI once. Data packets carry no PIM header, joins are periodic per group rather than per frame, and duplicates from the RP and source tree occur only briefly during switchover.
- q: >-
    An operator changes an IS-IS metric during maintenance. Unicast keeps working, but BUM traffic between some leaves in multicast mode drops for a while. What is the most likely mechanism?
  options: ["The type-3 routes are withdrawn because their next hop metric changed", "IS-IS floods the change as multicast and the RP drops it for being unknown", "PIM recomputes its own shortest paths and loses its adjacencies on the change", "The RPF check drops packets arriving on the old path until the tree rejoins"]
  answer: 3
  explanation: >-
    PIM uses the unicast table for reverse-path forwarding: a packet is accepted only on the interface towards its source or RP. When the unicast path moves, packets on the old interface fail the check until joins rebuild the tree along the new path. PIM computes no routes of its own, type-3 routes do not depend on IGP metrics, and IS-IS flooding is not routed multicast through the RP.
- q: >-
    Meridian's border gateways gw1.ams (192.0.2.2) and gw2.ams (192.0.2.3) share a VLAN, both with DR priority 1. Both forward the same multicast stream onto it; gw1.ams has metric 20 to the source and gw2.ams metric 30, same route preference. Which router forwards the stream afterwards?
  options: ["gw1.ams, because the assert prefers the lower metric to the source", "Both, because PIM cannot stop duplicates on a shared segment", "gw2.ams, because the DR always forwards every stream on its LAN", "gw2.ams, because the assert prefers the higher IP address first"]
  answer: 0
  explanation: >-
    gw2.ams is DR on the higher address, but the assert is a separate election for one stream: source-tree state, then lower route preference, then lower metric, then higher IP. Preferences are equal, so gw1.ams wins on metric 20 and gw2.ams prunes the LAN for that stream. The IP address is only the last tie-break, and stopping such duplicates is the assert's whole purpose.
```
