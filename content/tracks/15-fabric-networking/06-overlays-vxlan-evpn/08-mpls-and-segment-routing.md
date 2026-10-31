---
slug: mpls-and-segment-routing
title: "MPLS and segment routing: the backbone's answer to the same problem"
description: How MPLS forwards on a 4-byte label instead of an IP address, push, swap and penultimate-hop pop traced on a backbone between Singapore and Amsterdam, LDP and RSVP-TE in brief, L3VPN with VPNv4 routes as the design EVPN inherited, SR-MPLS and SRv6 as labels without a label protocol, and why backbones choose MPLS while data centers choose VXLAN.
minutes: 45
difficulty: hard
tags: [fabric-networking, mpls, ldp, rsvp-te, l3vpn, vpnv4, segment-routing, sr-mpls, srv6, overlay, backbone, interview]
problems: []
---
Carriers had the problem this module solves (tenants with overlapping addresses carried across a core that knows nothing about them) more than ten years before VXLAN existed. Their answer, MPLS, puts a 4-byte **label** in front of the packet and has the core forward on the label alone. It still runs most service-provider backbones, it is where route distinguishers and route targets come from, and it is why EVPN routes have an "MPLS label" field that a VXLAN fabric fills with a VNI. "MPLS or VXLAN?" is a common interview question: the answer shows whether you see one idea with two wire formats.

Meridian runs VXLAN everywhere ([why overlays](/learn/fabric-networking/overlays-vxlan-evpn/why-overlays)). To compare like with like, this lesson draws the backbone Meridian would build between Singapore and Amsterdam if it ran it as a carrier does. Two **PE** (provider edge) routers hold the tenant VRFs (one routing table per tenant): `pe1.sin` (loopback `10.255.2.241`) and `pe1.ams` (`10.255.1.241`). Two **P** (provider) routers in the middle only switch labels: `p1.sin` (`10.255.2.251`) and `p1.ams` (`10.255.1.251`), joined by the 10,500 km long-haul circuit. Acme's `acme-web2` (`10.1.1.11`) sits behind `pe1.sin` and `acme-db1` (`10.1.2.20`) behind `pe1.ams`. The device on the customer's side of a PE is a **CE** (customer edge). IS-IS is the IGP (interior gateway protocol) and carries every loopback, as in [IS-IS from zero](/learn/fabric-networking/underlay/is-is-from-zero).

## The label: 4 bytes in front of the packet

**MPLS** (Multiprotocol Label Switching: architecture in RFC 3031, encoding in RFC 3032, both 2001) inserts one or more **label stack entries** between the Ethernet header and the packet. The Ethernet header's EtherType becomes `0x8847` (MPLS unicast) so the receiver knows a label follows, not IP. Each entry is 32 bits:

| Field | Size | Value in the top entry leaving `pe1.sin` | What reads it |
|---|---|---|---|
| Label | 20 bits | 24017 | The next router's label table: an exact-match index |
| Traffic class (TC, once "EXP") | 3 bits | 0 | Queueing at each hop, like the DSCP class field in IP |
| Bottom of stack (S) | 1 bit | 0: another entry follows | Every router that pops: is the payload next? |
| TTL | 8 bits | 63 | Decremented at each hop; at 0 the packet is dropped with an ICMP error |

A packet can carry several entries, a **label stack**. Only the top one is read in transit; the entry with S = 1 is the last, and the payload follows it. Nothing in the stack says what the payload is (IPv4, IPv6, an Ethernet frame): the router that removes the last label knows because it assigned that label. Transit routers spreading flows over equal-cost paths (ECMP, by a hash of header fields) have to guess, a failure mode below.

Twenty bits give 1,048,576 label values. Labels 0 to 15 are reserved; the ones you meet are 0 (IPv4 explicit null), 2 (IPv6 explicit null), 3 (implicit null, below) and 7 (the entropy label indicator). Each router allocates the rest from its own dynamic range, so values are arbitrary: IOS XR starts at 24000 (hence 24017 here), Junos near 299776.

The **FEC** (forwarding equivalence class) is the set of packets a label stands for: here, "everything heading for `pe1.ams`'s loopback `10.255.1.241/32`". A label means a FEC only to the router that chose it. `p1.sin` reading 24017 and `p1.ams` reading 24031 both mean "towards `pe1.ams`".

Why labels at all? In 1997 an exact-match lookup on a short label was cheaper than a longest-prefix match on a 32-bit address; modern ASICs do both at line rate. What survives is the indirection: the label names a *meaning* (an exit router, a VRF, a chosen path, a backup route), and the core forwards on it without knowing the customer's address, the move VXLAN makes with an outer IP header.

The code packs two entries as `pe1.sin` will, reads them back, and forwards the packet through label tables built the way the next sections describe.

```python
import struct

IMPLICIT_NULL = 3


def lse(label, s, ttl, tc=0):
    """One label stack entry: label (20 bits), traffic class (3), bottom of stack (1), TTL (8)."""
    return struct.pack("!I", label << 12 | tc << 9 | s << 8 | ttl)


def parse_stack(data):
    """Read entries until the one with S = 1; what follows is the payload (no type field says what)."""
    stack = []
    while True:
        (word,) = struct.unpack("!I", data[:4])
        stack.append({"label": word >> 12, "tc": word >> 9 & 7, "s": word >> 8 & 1, "ttl": word & 0xFF})
        data = data[4:]
        if stack[-1]["s"]:
            return stack, data


# The illustrative backbone: IGP next hop towards pe1.ams's loopback 10.255.1.241/32.
PATH = ["pe1.sin", "p1.sin", "p1.ams", "pe1.ams"]
NEXT_HOP = {"pe1.sin": "p1.sin", "p1.sin": "p1.ams", "p1.ams": "pe1.ams"}


def ldp_labels():
    # Each router picks its own label for the FEC; the egress asks for implicit null (PHP).
    return {"pe1.sin": 24005, "p1.sin": 24017, "p1.ams": 24031, "pe1.ams": IMPLICIT_NULL}


def sr_labels(srgb_base, index=241):
    # Segment routing: one global index, label = the router's own SRGB base + index.
    # pe1.ams clears its No-PHP flag, so its neighbour pops instead of swapping.
    labels = {r: srgb_base[r] + index for r in PATH}
    labels["pe1.ams"] = IMPLICIT_NULL
    return labels


def build_lfib(local):
    """In-label -> (action, out-label, next hop). The out-label is the one the NEXT HOP chose."""
    lfib = {}
    for router, nh in NEXT_HOP.items():
        out = local[nh]
        lfib[router] = {local[router]: ("pop" if out == IMPLICIT_NULL else "swap", out, nh)}
    return lfib


def forward(local, vpn_label=92001):
    lfib = build_lfib(local)
    ip_ttl = 64 - 1                                  # pe1.sin routes in VRF ACME first
    top = local[NEXT_HOP["pe1.sin"]]                 # FTN: push the next hop's label
    stack = [(top, ip_ttl), (vpn_label, ip_ttl)]     # uniform TTL model: copy IP TTL
    wire = b"".join(lse(l, int(i == len(stack) - 1), t) for i, (l, t) in enumerate(stack))
    print(f"pe1.sin  push {top} over {vpn_label}: {wire.hex(' ')}")
    router = "p1.sin"
    while router != "pe1.ams":
        entries, _ = parse_stack(wire)
        label, ttl = entries[0]["label"], entries[0]["ttl"] - 1
        action, out, nh = lfib[router][label]
        rest = [(e["label"], e["ttl"]) for e in entries[1:]]
        if action == "swap":
            stack = [(out, ttl)] + rest
        else:                                        # PHP: copy TTL into the exposed label
            stack = [(rest[0][0], ttl)] + rest[1:]
        wire = b"".join(lse(l, int(i == len(stack) - 1), t) for i, (l, t) in enumerate(stack))
        step = f"swap {label} -> {out}" if action == "swap" else f"pop {label} (PHP)"
        print(f"{router:<8} {step:<20} to {nh:<8} "
              f"stack {[l for l, _ in stack]}, top TTL {stack[0][1]}")
        router = nh
    entries, _ = parse_stack(wire)
    assert entries[0]["label"] == vpn_label and entries[0]["s"] == 1
    print(f"pe1.ams  pop {vpn_label} -> VRF ACME, IP TTL {entries[0]['ttl'] - 1}")


print("LDP:"); forward(ldp_labels())
print("SR-MPLS, every SRGB 16000:"); forward(sr_labels(dict.fromkeys(PATH, 16000)))
print("SR-MPLS, p1.ams on SRGB 20000:")
forward(sr_labels({"pe1.sin": 16000, "p1.sin": 16000, "p1.ams": 20000, "pe1.ams": 16000}))
```

```text
LDP:
pe1.sin  push 24017 over 92001: 05 dd 10 3f 16 76 11 3f
p1.sin   swap 24017 -> 24031  to p1.ams   stack [24031, 92001], top TTL 62
p1.ams   pop 24031 (PHP)      to pe1.ams  stack [92001], top TTL 61
pe1.ams  pop 92001 -> VRF ACME, IP TTL 60
SR-MPLS, every SRGB 16000:
pe1.sin  push 16241 over 92001: 03 f7 10 3f 16 76 11 3f
p1.sin   swap 16241 -> 16241  to p1.ams   stack [16241, 92001], top TTL 62
p1.ams   pop 16241 (PHP)      to pe1.ams  stack [92001], top TTL 61
pe1.ams  pop 92001 -> VRF ACME, IP TTL 60
SR-MPLS, p1.ams on SRGB 20000:
pe1.sin  push 16241 over 92001: 03 f7 10 3f 16 76 11 3f
p1.sin   swap 16241 -> 20241  to p1.ams   stack [20241, 92001], top TTL 62
p1.ams   pop 20241 (PHP)      to pe1.ams  stack [92001], top TTL 61
pe1.ams  pop 92001 -> VRF ACME, IP TTL 60
```

Decode the first line by hand. 24017 is `0x5DD1`; shifted left 12 bits it fills the top 20 bits, giving `05 dd 1`, then 3 bits of TC (0) and S = 0 make the next nibble `0`, and TTL 63 is `3f`. The second entry, 92001 = `0x16761`, ends in `1 3f`: that `1` is the bottom-of-stack bit. Eight bytes in total, against VXLAN's 50.

**What the label solves:** the core forwards on a meaning chosen at the edge, so it needs no customer routes. **How it breaks:** every router on the path needs a binding for the label it receives; without one the packet is dropped or reaches a router that cannot read it. **Signal:** label-lookup-failure drops, and next hops with no outgoing label.

## Push, swap, pop

A router that forwards on labels is an **LSR** (label switching router); one at the edge of the MPLS domain, which adds or removes the labels, is an **LER** (label edge router). The PEs are LERs, the Ps are LSRs. There are three operations:

- **Push** (at the ingress LER): classify the packet into a FEC and add a label. The table that does this is the FTN (FEC-to-NHLFE map, an NHLFE being a "next hop label forwarding entry": which label, which next hop): "for next hop `10.255.1.241`, push 24017 and send to `p1.sin`".
- **Swap** (at each LSR): look the incoming label up in the **LFIB** (label forwarding information base), replace it with the outgoing label the next router asked for, decrement the TTL, send.
- **Pop** (at the end): remove the top label and act on what is underneath, another label or the payload.

The chain of swaps from ingress to egress is an **LSP** (label-switched path). An LSP is one-way. Traffic from `acme-db1` back to `acme-web2` rides a separate LSP towards `pe1.sin`'s loopback, and the two can break independently: a broken return LSP makes forward probes look lost too, so each direction needs its own test.

### Penultimate-hop popping

If `pe1.ams` received its own transport label, it would look it up only to learn "that is me, pop it", then look up what was underneath. **Penultimate-hop popping** (PHP) moves the first lookup to the router before it: `pe1.ams` advertises label 3, **implicit null**, for its loopback ("send these to me with the transport label removed"), and `p1.ams` pops instead of swapping. Label 3 never appears in a packet; it is a control-plane instruction.

When the last link needs the label's TC bits, because the egress queues on them, the egress advertises **explicit null** (label 0 for IPv4) instead: the penultimate router swaps to 0, and the egress pops a label whose only job was to carry the TC bits.

### TTL: uniform or pipe

At push, the ingress chooses the label's TTL (RFC 3443). In the **uniform** model it copies the IP TTL (63 here), every hop decrements the label TTL, and the egress copies it back into IP, so the packet arrives with TTL 60 as if the core were IP. In the **pipe** model the ingress writes a fixed value (typically 255) and the P routers never touch the IP TTL, so the customer's traceroute shows the two PEs and no P routers; many carriers choose pipe to hide their core.

Uniform mode has a surprise. When a label's TTL expires at `p1.sin`, it must send an ICMP "time exceeded" to `10.1.1.11`, an Acme address it has no route for. RFC 3032's answer: the P router sends the ICMP *onward along the same LSP* to `pe1.ams`, which routes it back to `acme-web2` in VRF ACME. RFC 4950 adds the received label stack to the ICMP (illustrative output, uniform model):

```text
acme-web2$ traceroute -n 10.1.2.20                     (illustrative output)
 1  10.1.1.1       0.4 ms
 2  10.254.201.0   105.3 ms  [MPLS: Label 24017 Exp 0 S 0 TTL 1 | Label 92001 Exp 0 S 1 TTL 1]
 3  10.254.200.1   105.2 ms  [MPLS: Label 24031 Exp 0 S 0 TTL 1 | Label 92001 Exp 0 S 1 TTL 2]
 4  10.1.2.1       105.4 ms
 5  10.1.2.20      105.5 ms
```

Hop 2 is `p1.sin`, a few kilometres from `acme-web2`, yet it shows 105 ms: its reply went to Amsterdam and back, 52.5 ms each way at 5 µs per km over 10,500 km. Every P hop shows the round trip to the egress, so the jump appears at the first P hop, not after the long-haul circuit as in an IP traceroute ([the packet walk](/learn/fabric-networking/from-zero/the-packet-walk) has traceroute's other lies).

**What PHP solves:** one lookup at the egress instead of two. **How it breaks:** a QoS design that queues on TC at the last hop loses it, unless explicit null is used. **Signal:** the penultimate router's LFIB shows "pop" for the egress loopback.

## LDP: labels that follow the IGP

Something has to tell `p1.sin` that `p1.ams` wants 24031 for packets to `10.255.1.241`. The common answer is **LDP** (Label Distribution Protocol, RFC 5036). It runs beside the IGP on every core link and computes no paths: LDP labels follow whatever path IS-IS chose.

1. **Discovery.** Each router sends LDP hellos on every enabled link, UDP to port 646 at `224.0.0.2` (all routers on this link), by default every 5 s with a 15 s hold time.
2. **Session.** Two routers that hear each other open a TCP session to port 646 between their loopbacks, like BGP but on its own port. Each is identified by an LDP ID such as `10.255.1.251:0` (the loopback plus label space 0, one label space for all interfaces).
3. **Bindings.** Each router assigns a local label to each FEC (Cisco by default binds every IGP prefix, Junos only its own loopback; the PE loopbacks are the FECs that matter) and sends a Label Mapping message to *every* LDP neighbour, unasked. This is **downstream unsolicited** distribution: labels flow from the destination back towards the sources.
4. **Selection.** A router keeps every binding it hears (liberal retention), but programs into its LFIB only the one from its IGP next hop for that FEC. When IS-IS reroutes, the label from the new next hop is already in memory.

The three bindings that build the LSP to `pe1.ams`, in the order they flow:

| Step | Advertised by | To | FEC | Label | Resulting LFIB entry |
|---|---|---|---|---|---|
| 1 | `pe1.ams` | `p1.ams` | `10.255.1.241/32` | 3 (implicit null) | `p1.ams`: in 24031 → pop, to `pe1.ams` |
| 2 | `p1.ams` | `p1.sin` | `10.255.1.241/32` | 24031 | `p1.sin`: in 24017 → swap 24031, to `p1.ams` |
| 3 | `p1.sin` | `pe1.sin` | `10.255.1.241/32` | 24017 | `pe1.sin` FTN: next hop `10.255.1.241` → push 24017, to `p1.sin` |

The advertised label is the one the advertiser *wants to receive*; it becomes the upstream router's *outgoing* label, the join `build_lfib` does above. On `p1.sin`:

```text
p1.sin# show mpls forwarding                           (illustrative output)
Local   Outgoing  Prefix or FEC       Outgoing    Next hop       Bytes switched
24017   24031     10.255.1.241/32     to-p1.ams   10.254.200.1   18.4T
24018   Pop       10.255.2.241/32     to-pe1.sin  10.254.201.1   17.9T
```

The second line is the LSP in the other direction, towards `pe1.sin`, where `p1.sin` is the penultimate hop and pops.

Under **independent control** (Cisco's default) a router advertises a label as soon as the FEC is in its routing table, so the ingress can push labels into a path broken further on; under **ordered control** (Junos's default) it waits for a label from its own next hop, so an incomplete LSP is never used.

LDP's own black hole, an LDP session down on a link whose IGP adjacency stays up, and its fix, LDP–IGP synchronisation (RFC 5443), are traced in [the BGP black hole](/learn/fabric-networking/bgp-fundamentals/the-bgp-black-hole). The subtler trap: LDP binds a label only to a FEC that *exactly* matches a routing-table entry. If the IGP summarises loopbacks, so `p1.sin` holds `10.255.1.0/24` instead of `10.255.1.241/32`, no LSP to `pe1.ams` is built and every VPN route behind it becomes unusable while the summary still pings. So MPLS networks do not summarise PE loopbacks (RFC 5283 relaxes the rule; few rely on it).

**What LDP solves:** labels for every IGP destination, automatically, on the IGP's paths. **How it breaks:** a session down on one link while IS-IS still forwards over it (desync), summarised loopbacks (no exact match). **Signal:** per link, IGP adjacency up and LDP session down; per PE pair, a missing labelled route to the far loopback.

## RSVP-TE in brief

LDP sends everything on the IGP's shortest path. Sometimes the path must satisfy constraints instead: "this 50 Gb/s must avoid the circuit that is already full". **RSVP-TE** (Resource Reservation Protocol with traffic-engineering extensions, RFC 3209) builds such paths, called **TE tunnels** or TE LSPs.

1. **Advertise capacity.** IS-IS carries, per link, its maximum and unreserved bandwidth in TE extensions; every head end holds this traffic-engineering database.
2. **Compute.** The ingress (the **head end**) runs **CSPF**, constrained shortest path first: remove every link that cannot satisfy the request, then run Dijkstra on what is left ([routing algorithms](/learn/networking/network-algorithms/routing-algorithms) has Dijkstra itself).
3. **Signal.** The head end sends an RSVP PATH message hop by hop along the computed route (written into it as an explicit route object, ERO) with the requested bandwidth. The tail end answers with a RESV message travelling back; each router on the way allocates a label and passes it upstream, so labels come from downstream *on demand*. Each router also deducts the bandwidth from the link's unreserved pool, and the IGP floods the new figure.
4. **Keep alive.** RSVP is soft state: every router refreshes every tunnel through it, every 30 s by default, or it expires.

Worked on a variant of the backbone with two Singapore–Amsterdam circuits of 100 Gb/s each, circuit 1 shorter and preferred by the IGP. Two demands leave `pe1.sin` for `pe1.ams`: 70 Gb/s and 50 Gb/s.

| Request | Circuit 1 unreserved | Circuit 2 unreserved | CSPF result |
|---|---|---|---|
| (start) | 100 | 100 | |
| Tunnel A, 70 Gb/s | 100 → 30 | 100 | Circuit 1, the shortest path that fits |
| Tunnel B, 50 Gb/s | 30: pruned | 100 → 50 | Circuit 2, because circuit 1 was removed before Dijkstra ran |

LDP would have put all 120 Gb/s on circuit 1 and dropped 20. RSVP-TE also gives **fast reroute** (RFC 4090): a pre-signalled bypass tunnel around each protected link, so the router beside a failure pushes the bypass label and traffic recovers in tens of milliseconds, the 50 ms target inherited from SONET optical transport.

The costs are why segment routing replaced much of it. Every router on a tunnel holds and refreshes its state, and a full mesh between N PEs is N(N − 1) tunnels: 39,800 for 200 PEs. And a reservation is bookkeeping, not policing: a tunnel that reserved 50 Gb/s but carries 90 still carries 90, so links congest while the reservations look healthy, unless the head end measures and resizes (auto-bandwidth).

**What RSVP-TE solves:** explicit, bandwidth-aware paths and fast reroute. **How it breaks:** reservations drift from real traffic; tunnels stay on a detour after the failure is fixed until reoptimisation runs; midpoint state grows with the square of the PEs. **Signal:** reserved versus measured bandwidth per tunnel, and tunnels whose current path differs from their computed best.

## L3VPN: the VPN label and the VPNv4 route

The transport label gets a packet to `pe1.ams` but does not say which tenant it belongs to, and Acme and Globex both use `10.1.1.0/24`. **BGP/MPLS IP VPNs** (RFC 2547 in 1999, RFC 4364 since 2006), usually called **L3VPN**, add a second label for that and carry it in BGP.

On each PE, every customer-facing interface belongs to a **VRF** ([VRFs and multi-tenancy](/learn/fabric-networking/overlays-vxlan-evpn/vrfs-and-multi-tenancy)). A PE learns the customer's prefixes from the CE (by static routes or a BGP session) and advertises them to the other PEs over iBGP, usually through route reflectors, in the **VPNv4** address family: address family identifier (AFI) 1 for IPv4, subsequent AFI (SAFI) 128 for MPLS-labelled VPN, negotiated in the OPEN like any other family ([BGP sessions and the FSM](/learn/fabric-networking/bgp-fundamentals/bgp-sessions-and-the-fsm)). `pe1.ams`'s route for Acme's `10.1.2.0/24`:

| Field | Size | Value | What reads it |
|---|---|---|---|
| NLRI length | 1 byte | 112 bits (24 label + 64 RD + 24 prefix) | The UPDATE parser |
| Label | 3 bytes | 92001, with its bottom-of-stack bit set | `pe1.sin`: the VPN label to push under the transport label |
| Route distinguisher | 8 bytes | `10.255.1.241:50001` (type 1: IPv4 address, number) | BGP's tables: makes this prefix unique from any other tenant's `10.1.2.0/24` |
| Prefix | 3 bytes | `10.1.2` (/24) | The importing VRF |
| Next hop (in MP_REACH_NLRI) | 12 bytes | RD 0 + `10.255.1.241` | `pe1.sin`: resolved to an LSP, not merely to an IGP route |
| Route target (extended community) | 8 bytes | `65000:50001` | `pe1.sin`: import into every VRF that imports this RT |

The route distinguisher (RD) makes overlapping prefixes distinct in BGP; the route target (RT) decides which VRFs install the route. RD unique, RT shared, worked in depth in [VRFs and multi-tenancy](/learn/fabric-networking/overlays-vxlan-evpn/vrfs-and-multi-tenancy). Two things are specific to L3VPN.

**The next hop must resolve to an LSP.** `pe1.sin` may use the route only if it holds a labelled path to `10.255.1.241`; an IGP route is not enough, because without a transport label a P router would see an Acme address or a VPN label it never allocated. Implementations keep a separate labelled table for this check (Junos calls it `inet.3`); a VPN route whose next hop is missing there is held but not installed, shown as "hidden" or "inaccessible".

**The egress PE chooses what the VPN label means.** One label per VRF (92001 = "look up in VRF ACME") costs a second IP lookup on arrival; one per CE next hop lets the PE forward straight from the label; one per prefix is the most precise and spends a label per route, 100,000 labels for 100,000 VPN routes.

### The packet, hop by hop

`acme-web2` opens TCP to `acme-db1` on port 5432. Its SYN arrives at `pe1.sin` as plain IPv4 with TTL 64, on an interface in VRF ACME.

| Hop | Device | Reads | Does | Labels leaving | TTL leaving |
|---|---|---|---|---|---|
| 1 | `pe1.sin` | IP `10.1.2.20` in VRF ACME → `10.1.2.0/24`, next hop `10.255.1.241`, VPN label 92001 → LSP: push 24017 | Pushes two labels; EtherType `0x8847` | 24017 (S=0), 92001 (S=1) | 63 in both labels |
| 2 | `p1.sin` | Top label 24017 only | Swap to 24031 | 24031, 92001 | 62 |
| 3 | `p1.ams` | Top label 24031 (implicit null from `pe1.ams`) | Pop (PHP), copy TTL into the exposed label | 92001 | 61 |
| 4 | `pe1.ams` | Label 92001: its own, "VRF ACME" | Pop, IP lookup in ACME: `10.1.2.0/24` connected, ARP for `acme-db1` | none, EtherType `0x0800` | IP TTL 60 |

The P routers never read `10.1.2.20` and hold no Acme routes, as Meridian's spines never read a VXLAN packet's inner header. The visualisation runs the control plane and this walk together.

```viz
{"type": "fabric", "scenario": "mpls-label-switching", "title": "MPLS L3VPN across a backbone: LDP bindings, the VPNv4 route, then push, swap, PHP and the VPN label", "caption": "pe1.ams, p1.ams and p1.sin bind labels 3, 24031 and 24017 to pe1.ams's loopback, and pe1.ams advertises VPNv4 10.1.2.0/24 with VPN label 92001. acme-web2's SYN gets the stack 24017 over 92001 at pe1.sin, swapped to 24031 at p1.sin, popped at p1.ams, and pe1.ams maps 92001 to VRF ACME, IP TTL 64 to 60. It closes with an MPLS-versus-VXLAN table."}
```

**What L3VPN solves:** overlapping tenant routes across a shared core whose routers hold no tenant state. **How it breaks:** a next hop without an LSP hides every route behind it; a duplicated RD or RT hides paths or leaks tenants, as in EVPN. **Signal:** per PE and VRF, routes received versus installed, with the hidden ones and their reason.

## From L3VPN to EVPN: what was inherited

EVPN (RFC 7432, 2015) was written for MPLS networks. Its target was VPLS, the older MPLS layer-2 VPN that learned MACs by flooding, as flood-and-learn VXLAN later did ([VXLAN encapsulation](/learn/fabric-networking/overlays-vxlan-evpn/vxlan-encapsulation)). EVPN moved MAC learning into BGP using L3VPN's machinery unchanged, and RFC 8365 (2018) then let the same routes describe VXLAN tunnels.

| Job | MPLS L3VPN | EVPN over VXLAN on Meridian |
|---|---|---|
| Tenant table on the edge | VRF on each PE | VRF (and MAC-VRF) on each leaf |
| Make overlapping routes unique | RD `10.255.1.241:50001` | RD `<loopback>:<vni>` |
| Decide who imports | RT `65000:50001` | RT `65000:<vni>` |
| Carry the routes | MP-BGP, AFI 1 / SAFI 128, via reflectors | MP-BGP, AFI 25 / SAFI 70, via `rr1.ams`, `rr2.ams` |
| Tenant identifier in the packet | VPN label 92001 | VNI (L3VNI 50001), carried in the route's "MPLS label" field |
| Reach the egress | Transport label, LSP to the PE loopback | Outer IP header to the VTEP loopback |
| What the core needs | MPLS on every router, LDP or SR | IP routing only |
| Layer 2 | Not in L3VPN (VPLS separately) | MAC routes (type 2), flooding lists (type 3), multihoming (types 1, 4) |

That is why [EVPN's routes](/learn/fabric-networking/overlays-vxlan-evpn/evpn-the-control-plane) carry 3-byte label fields. A leaf receiving a type-5 route for `10.1.2.0/24` with VNI 50001 and next hop `10.255.1.13` does what `pe1.sin` does with label 92001 and next hop `10.255.1.241`; only the wrapper differs.

## Segment routing: labels without a label protocol

LDP and RSVP-TE both agree labels hop by hop with a protocol that must stay in step with the IGP. **Segment routing** (SR, RFC 8402, 2018) removes that layer: the IGP itself advertises a few global identifiers, and the ingress writes the path into the packet as a list of **segments**. Over MPLS (SR-MPLS, RFC 8660) a segment is a label.

- **Prefix SID**: a segment meaning "towards this prefix by the shortest path", usually a loopback (then also called a **node SID**). It is advertised in IS-IS as a small **index** attached to the prefix (RFC 8667), here 241 for `10.255.1.241/32`. The index must be unique across the whole IGP domain, so `pe1.sin` (`10.255.2.241`) cannot take 241 as well; the plan gives Singapore its own block (1241 for `pe1.sin`).
- **SRGB** (segment routing global block): the label range each router reserves for prefix SIDs, advertised in its IS-IS router capability. A router's label for a prefix SID is its own SRGB base plus the index. With the common 16000–23999 block on every router, index 241 is label 16241 everywhere.
- **Adjacency SID**: a locally significant label meaning "out of this specific link", for steering over a link the shortest path would not choose.

Each router computes its LFIB entries from the IS-IS database with no extra protocol: `p1.sin`'s entry for `10.255.1.241/32` is "in 16241, swap 16241 (the next hop's SRGB base plus 241), towards `p1.ams`". PHP works as before, requested by leaving the SID's No-PHP flag clear, and the L3VPN layer above, VPN label included, is unchanged.

```viz
{"type": "fabric", "scenario": "mpls-label-switching", "variant": "sr-mpls", "title": "The same VPN over SR-MPLS: prefix SID index 241 as label 16241, with no LDP", "caption": "pe1.ams advertises prefix SID index 241 in IS-IS; with SRGB 16000 to 23999 on every router it becomes label 16241 everywhere. pe1.sin pushes 16241 over VPN label 92001, p1.sin swaps 16241 for 16241, p1.ams pops it (PHP), and pe1.ams maps 92001 to VRF ACME, with no LDP running."}
```

The last run of the code shows the caveat. With `p1.ams` on SRGB 20000, `p1.sin` swaps 16241 for 20241 and the path still works, because each router computes its neighbour's label from the neighbour's advertised SRGB. The *index* is global; the *label* is global only if every SRGB matches, which is why operators standardise it.

Traffic engineering becomes a **segment list** pushed at the head end. To send tunnel B of the RSVP example over circuit 2, `pe1.sin` pushes the prefix SID of `p2.sin`, the Singapore end of circuit 2 (index 1252, label 17252), then `p2.sin`'s adjacency SID for circuit 2 (from `p2.sin` the shortest path might lead back over circuit 1), then 16241 for `pe1.ams`, then the VPN label: four labels, and no state anywhere but the head end. Bandwidth accounting moves to a controller (a PCE, path computation element, speaking PCEP, RFC 5440) or is not done at all. SR also gives TI-LFA (topology-independent loop-free alternate), the precomputed repair path of [convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd).

The new limits are in the packet. Each segment is 4 more bytes, and an ASIC can push only so many labels in one pass, its **MSD** (maximum SID depth, advertised in IS-IS by RFC 8491), typically three to a dozen depending on the chip.

**What SR-MPLS solves:** no LDP and no RSVP state; paths written by the head end; TI-LFA. **How it breaks:** two routers configured with the same index (implementations pick a winner by a preference rule, and the other loopback silently loses its segment); mismatched SRGBs confusing tools; segment lists deeper than the hardware can push. **Signal:** SID-conflict logs, a static uniqueness check, SRGB per router, and MSD against the deepest list in use.

## SRv6: the segment is an IPv6 address

**SRv6** keeps the segment-routing idea and drops MPLS. A segment is a 128-bit IPv6 address, a **SID**, structured as a **locator** (a routable prefix that leads to one router), a **function** (what that router should do) and optional arguments (RFC 8986). `pe1.ams` might own locator `2001:db8:1:241::/64` and allocate `2001:db8:1:241::e001` with the behaviour **End.DT4**: "decapsulate, and look the inner IPv4 packet up in VRF ACME". That SID replaces both the transport and the VPN label, and BGP carries it with the VPN route (RFC 9252) as it carried label 92001.

`pe1.sin` sends Acme's packet as:

| Header | Size | Value | What reads it |
|---|---|---|---|
| Ethernet | 14 B | `pe1.sin` → `p1.sin` port MACs, EtherType `0x86dd` (IPv6) | This link only |
| Outer IPv6 | 40 B | source `2001:db8:2:241::1`, destination `2001:db8:1:241::e001`, next header 4 (IPv4), hop limit 64, flow label from a hash of the inner flow | P routers: longest-prefix match on the locator `/64`; the flow label feeds ECMP |
| Inner IPv4, TCP | | `10.1.1.11` → `10.1.2.20`, TTL 63 | `pe1.ams` after End.DT4, then `acme-db1` |

With a single segment there is no extra header, and the P routers need no SRv6 support, only IPv6 routing: like VXLAN, the core forwards on an ordinary outer IP address. To steer through intermediate segments, the head end adds a **segment routing header** (SRH, RFC 8754), an IPv6 routing header of type 4 listing the segments; each listed router decrements a "segments left" counter and copies the SID it now points to into the destination address. The SRH is 8 bytes plus 16 per segment.

That is SRv6's cost: a two-segment SRH makes 80 bytes of overhead against 8 for two MPLS labels, which compressed SIDs (uSID, RFC 9800, 2025) reduce by packing several 16-bit micro-segments into one address. Its gains: one data plane end to end, entropy in the flow label, and SIDs any Linux host can push (the kernel has SRv6 encapsulation since 4.10, 2017). Its caveats: ASIC support for SRH processing varies by chip, and SRv6 must be filtered at the domain edge, because a SID is an address anyone could target.

**What SRv6 solves:** segment routing and VPNs over plain IPv6, with no MPLS anywhere. **How it breaks:** overhead on small packets and MTU, uneven hardware support, and an edge that leaks SID space. **Signal:** locator reachability in the IGP, drops at the edge filter, and the MTU across the deepest SRH in use.

## When backbones choose MPLS and data centers choose VXLAN

Both designs do one thing: the edge adds a tenant identifier and an address for the far edge, and the core forwards on the outer part alone. The choice comes down to who owns the core, what it runs, and what each byte costs.

Overhead first, as extra bytes on the wire over the same packet sent plain (wire bytes include Ethernet's 18 bytes of header and FCS and its 20 bytes of preamble and inter-frame gap):

| IP packet size | MPLS, 2 labels (+8 B) | SRv6, no SRH (+40 B) | VXLAN (+50 B) | SRv6, 2-segment SRH (+80 B) |
|---|---|---|---|---|
| 128 B | +4.8% | +24.1% | +30.1% | +48.2% |
| 512 B | +1.5% | +7.3% | +9.1% | +14.5% |
| 1,500 B | +0.5% | +2.6% | +3.3% | +5.2% |
| 9,000 B | +0.1% | +0.4% | +0.6% | +0.9% |

On ocean-crossing circuits leased by the gigabit, carrying many small packets, a few percent is real money; inside a jumbo-frame data center it barely registers.

| Axis | MPLS backbone (LDP or SR, L3VPN or EVPN) | VXLAN data-center fabric (EVPN) |
|---|---|---|
| What every core router must run | MPLS forwarding, plus LDP, RSVP-TE or SR in the IGP | IP routing only |
| Traffic engineering | Mature: RSVP-TE, SR-TE, controllers | ECMP over equal paths; little else, and a Clos rarely needs it |
| Fast reroute | RSVP FRR, TI-LFA, about 50 ms | BFD plus fast IGP convergence; ECMP absorbs single failures ([redundancy](/learn/fabric-networking/fabric-architecture/redundancy-and-failure-domains)) |
| ECMP entropy | Hash on labels, guess at the payload, or an entropy label | UDP source port from the inner flow ([ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)) |
| Tunnel endpoints | Provider routers | Leaves, and also hypervisors, SmartNICs (BlueField-class) and Kubernetes nodes |
| Hardware | Provider-class routers with large label tables and deep buffers | Merchant-silicon switches with strong VXLAN support |
| Skills and existing services | Carriers already sell L3VPN to enterprises and run it | Data-center teams already run BGP and IP |

In a data center the deciding row is usually the endpoints: servers and SmartNICs encapsulate VXLAN, almost nothing on a host speaks MPLS, and any IP switch can join a VXLAN fabric. On a backbone it is traffic engineering, fast reroute and decades of L3VPN service. Networks needing both stitch them: EVPN-VXLAN inside each site, EVPN-MPLS across the WAN, gateways re-originating routes between the two (RFC 9014). One option in [connecting sites and backbones](/learn/fabric-networking/fabric-architecture/connecting-sites-and-backbones) is buying an MPLS VPN from a carrier, which runs this lesson's backbone with Meridian's VXLAN inside.

## Failure modes in production

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| LDP session down, IGP adjacency up on one link | Loss for VPN traffic hashed onto that link; plain IP fine | Per link, IS-IS up and LDP down; label-lookup-failure drops on the next router | LDP–IGP synchronisation, so the link stays at maximum metric until LDP is up |
| PE loopback summarised | Every VPN route behind one PE hidden; the IGP summary still pings | Labelled table has no entry for the /32; VPN routes show "next hop inaccessible" | Advertise PE loopbacks as /32 everywhere |
| Core MTU too small for the stack | 1,500-byte customer packets lost, smaller ones fine; TCP sessions hang after the handshake | A don't-fragment ping of 1,492 bytes passes, 1,500 fails across the PE pair | Core MTU at least the customer MTU plus 4 bytes per label, with headroom for repair and TE labels ([transport as the network sees it](/learn/fabric-networking/from-zero/transport-as-the-network-sees-it)) |
| Labels-only hashing | All traffic between two PEs on one core link while its siblings idle | Per-member utilisation; every flow carries the same two labels | Entropy label (RFC 6790), or hashing on the IP header under the stack |
| A layer-2 VPN misparsed | Reordering for one customer's frames whose destination MAC starts with 4 or 6 | A transit router guessed the payload was IPv4 or IPv6 from the first nibble and hashed it per flow, wrongly | The pseudowire control word (RFC 4385), which puts a 0 nibble first |
| Duplicate prefix SID | One loopback unreachable by segment routing; traffic falls back to LDP or IP, or drops at the ingress | SID-conflict log; two prefixes with one index in the IS-IS database | Allocate indices from the source of truth and check uniqueness before deployment |
| RSVP reservation drift | A circuit congests while every tunnel's reservation fits | Measured traffic per tunnel far above its reservation | Auto-bandwidth, or SR-TE with a controller fed by real measurements |

## Trade-offs: how labels get agreed

| | LDP | RSVP-TE | SR-MPLS | SRv6 |
|---|---|---|---|---|
| Who decides the path | The IGP | The head end (CSPF) | The IGP, or the head end's segment list | The IGP, or the head end's segment list |
| Extra protocol | LDP on every link | RSVP on every router of every tunnel | None: IS-IS or OSPF extensions | None: IS-IS or OSPF extensions |
| State in the core | One label per FEC per router | Per tunnel, refreshed every 30 s | One label per SID per router | None beyond IPv6 routes to locators |
| Bandwidth-aware | No | Yes, in the control plane | Only with a controller | Only with a controller |
| Fast reroute | LFA or remote LFA, partial coverage | Facility backup, full coverage | TI-LFA, full coverage | TI-LFA, full coverage |
| Overhead per segment | 4 B | 4 B | 4 B | 16 B (40 B base) |
| Main risk | LDP–IGP desync | State scale, stale reservations | SID conflicts, label depth | Overhead, hardware support, edge filtering |

## Under the hood: what the hardware does with a label

An LFIB lookup is an exact match on 20 bits, so an ASIC implements it as a direct-indexed or hashed table, and push, swap and pop rewrite a few bytes at the front of the packet in the same pipeline pass as the Ethernet rewrite ([planes, ASICs and network operating systems](/learn/fabric-networking/from-zero/planes-asics-and-network-operating-systems)). The limits that matter are push depth (the MSD), how deep the chip parses for the hash, and label-table size: provider routers support close to the full million, data-center ASICs typically far fewer. The Linux kernel forwards MPLS too (the `mpls_router` module, since 4.1; `ip -f mpls route` lists label routes), so labs can test all this without vendor hardware.

## What the platform should show

Tooling for an MPLS or SR backbone checks that each layer agrees with the one beneath it. Surface:

- **Per core link: IGP adjacency, LDP session and sync state together.** "IS-IS up, LDP down, metric normal" is the combination that drops traffic silently.
- **Per PE pair, both directions: does a labelled path exist?** LSPs are one-way, so test A→B and B→A separately and actively, with LSP ping and traceroute (RFC 8029), which test the label path rather than the IP path.
- **Per PE and VRF: routes received, installed and hidden**, with the reason.
- **Path MTU per PE pair, including the deepest label stack** (VPN, transport, TE or repair labels).
- **Segment routing hygiene:** SID uniqueness and SRGB consistency, checked against the source of truth before a change, and the deepest segment list against each head end's MSD.
- **For TE: reserved versus measured bandwidth per tunnel.**
- **Load per member of every core ECMP group**, because labels-only hashing shows as one hot link.

The checks are joins across data the collectors already have, sketched over illustrative state:

```python
LABEL = 4          # bytes per label stack entry
CUSTOMER_MTU = 1500

# What the collectors report (illustrative state of the backbone).
links = {
    ("pe1.sin", "p1.sin"): {"isis": True, "ldp": True, "max_metric": False, "mtu": 9192},
    ("p1.sin", "p1.ams"):  {"isis": True, "ldp": True, "max_metric": False, "mtu": 9192},
    ("p1.ams", "pe1.ams"): {"isis": True, "ldp": True, "max_metric": False, "mtu": 1500},
    ("p1.ams", "p2.ams"):  {"isis": True, "ldp": False, "max_metric": False, "mtu": 9192},
}
labelled_routes = {          # per PE: egress loopbacks it holds a working LSP to
    "pe1.sin": {"10.255.1.241"},
}
vpn_routes = {               # per PE: (VRF, prefix, BGP next hop, labels the path pushes)
    "pe1.sin": [("ACME", "10.1.2.0/24", "10.255.1.241", 2),
                ("GLOBEX", "10.1.1.0/24", "10.255.1.242", 2)],
}
lsp_paths = {("pe1.sin", "10.255.1.241"): ["pe1.sin", "p1.sin", "p1.ams", "pe1.ams"]}
prefix_sids = {"pe1.ams": 241, "pe2.ams": 242, "p1.ams": 251, "p2.ams": 241}


def link(a, b):
    return links.get((a, b)) or links.get((b, a))


def findings():
    out = []
    for (a, b), l in links.items():
        if l["isis"] and not l["ldp"] and not l["max_metric"]:
            out.append(f"{a}-{b}: IS-IS up, LDP down, metric normal: labelled traffic may leave unlabelled")
    for pe, routes in vpn_routes.items():
        for vrf, prefix, nh, labels in routes:
            if nh not in labelled_routes.get(pe, set()):
                out.append(f"{pe} VRF {vrf} {prefix}: next hop {nh} has no LSP, route unusable")
                continue
            path = lsp_paths[(pe, nh)]
            mtu = min(link(x, y)["mtu"] for x, y in zip(path, path[1:]))
            need = CUSTOMER_MTU + labels * LABEL
            if mtu < need:
                out.append(f"{pe} VRF {vrf} {prefix}: path MTU {mtu} < {need} for "
                           f"{CUSTOMER_MTU}-byte packets with {labels} labels")
    seen = {}
    for router, index in sorted(prefix_sids.items()):
        if index in seen:
            out.append(f"prefix SID index {index} claimed by {seen[index]} and {router}")
        seen.setdefault(index, router)
    return out


for line in findings():
    print(line)
```

```text
p1.ams-p2.ams: IS-IS up, LDP down, metric normal: labelled traffic may leave unlabelled
pe1.sin VRF ACME 10.1.2.0/24: path MTU 1500 < 1508 for 1500-byte packets with 2 labels
pe1.sin VRF GLOBEX 10.1.1.0/24: next hop 10.255.1.242 has no LSP, route unusable
prefix SID index 241 claimed by p2.ams and pe1.ams
```

Each line names the layer and the fix, which is what the on-call engineer needs; a manager's view rolls the same findings up to "Acme's Singapore–Amsterdam path is at risk: MTU on one link".

## Interviewer follow-ups

**"Walk me through an L3VPN packet across an MPLS core."** Model answer: the ingress PE looks the destination up in the customer's VRF and finds a VPNv4 route with a BGP next hop (the egress PE's loopback) and a VPN label. It pushes the VPN label, then the transport label towards that loopback. P routers swap the top label only; the penultimate router pops it (implicit null); the egress PE reads the VPN label, picks the VRF and routes. Mention the TTL and the 8 bytes. Common wrong answer: P routers "look up the VPN" or hold customer routes; they hold neither.

**"MPLS or VXLAN for a new data-center fabric? And for the WAN?"** Model answer: same idea, different wrapper. In the data center, VXLAN: any IP fabric carries it, hosts and SmartNICs can be endpoints, the UDP source port gives ECMP entropy, and 50 bytes hardly matter in jumbo frames. On the WAN, MPLS (now usually SR-MPLS): small overhead on expensive circuits, traffic engineering, 50 ms protection, existing L3VPN services. Stitch them with EVPN at gateways. Common wrong answer: "MPLS is faster because label lookups are cheaper"; that was true of 1997 hardware, not today's.

**"What does segment routing remove, and what does it cost?"** Model answer: it removes LDP and RSVP-TE, so no label protocol can desynchronise from the IGP and the core holds no per-tunnel state; paths become segment lists at the head end, and TI-LFA gives full repair coverage. It costs label depth (MTU, the hardware's MSD), the discipline of unique SID indices and one SRGB, and bandwidth awareness, which moves to a controller. Common wrong answer: "SR removes MPLS"; SR-MPLS keeps the MPLS data plane and only SRv6 replaces it. Honest add-on: "I'd defer to the network team on a platform's MSD and the LDP migration plan, but I'd build SID-uniqueness and SRGB checks into the change pipeline and measure label depth in use."

## What mid-level engineers get wrong

- **Treating labels as global.** An LDP label means something only to the router that chose it; even SR labels are global only when every SRGB matches. A tool that maps label values to destinations network-wide reports the wrong exits.
- **Forgetting LSPs are one-way.** A healthy A→B LSP says nothing about B→A; a check run from one side misses a one-way failure.
- **Checking IP reachability and calling the VPN healthy.** A pingable loopback without a labelled path hides every VPN route behind it.
- **Assuming SRv6 needs SRv6 everywhere.** With a single segment, the core needs only IPv6 routing to the locator.

## Senior signals

- You describe MPLS and VXLAN as the same move, a tenant identifier plus an address for the far edge over a core that reads only the outer part, and map VPN label to VNI and LSP to outer IP header.
- You trace push, swap and PHP with TTLs, and read an MPLS traceroute knowing every P hop shows the round trip to the egress.
- You know a VPN route is only as good as the LSP to its next hop, and that summarising PE loopbacks breaks LDP, so you test label paths, not pings.
- You choose VXLAN for the data center because of the endpoints and the IP-only core, and MPLS for the WAN because of overhead, TE and fast reroute, stitched with EVPN.

## Check yourself

```quiz
- q: >-
    p1.sin receives Acme's packet with labels 24017 over 92001 and forwards it towards p1.ams. Which part of the packet does p1.sin use to decide?
  options: ["The top label 24017, by exact match in its label table", "The VPN label 92001, to find the right tenant table", "The destination address 10.1.2.20, by longest-prefix match", "Both labels together, matched as one combined key"]
  answer: 0
  explanation: >-
    A P router reads only the top label, looks it up in its LFIB, swaps it for 24031 and forwards. It never reads the VPN label or the IP header, which is why it needs no Acme routes, just as a spine reads only the outer header of a VXLAN packet. Only pe1.ams, which allocated 92001, interprets the VPN label.
- q: >-
    pe1.ams advertises label 3 (implicit null) to p1.ams for its own loopback. What arrives at pe1.ams on the last link?
  options: ["A plain IPv4 packet with every label removed", "A packet carrying only the VPN label 92001", "A packet carrying label 0, explicit null", "A packet whose transport label has value 3"]
  answer: 1
  explanation: >-
    Implicit null asks the penultimate router to pop the transport label rather than swap it, so the label 3 never appears in a packet. The VPN label underneath remains, because only pe1.ams can act on it. Explicit null (label 0) is a different request, used when the last link needs the label's traffic-class bits.
- q: >-
    After a change, pe1.sin still pings pe1.ams's loopback 10.255.1.241, but every Acme VPN route via pe1.ams shows as hidden on pe1.sin. The IGP now carries 10.255.1.0/24 instead of the /32. Why?
  options: ["The route distinguisher changed when the loopback was summarised", "The route target no longer matches the summary prefix", "LDP binds labels only to exact routing-table matches, so no LSP exists", "Ping uses ICMP, and VPN routes need the BGP session reset"]
  answer: 2
  explanation: >-
    A VPN route is usable only if its next hop resolves to a labelled path. LDP binds a label only to a FEC that exactly matches a routing-table entry, so with only the /24 in the IGP no LSP to 10.255.1.241/32 is built and the VPN routes are held but not installed. IP reachability to the summary is unaffected, which is why ping works. RDs and RTs are configured values that summarisation does not touch.
- q: >-
    In SR-MPLS, pe1.ams has prefix SID index 241 and every router uses SRGB 16000 to 23999. Then p1.ams is moved to SRGB 20000 to 27999. What happens to traffic from pe1.sin to pe1.ams?
  options: ["It falls back to LDP until all the SRGBs match again", "It drops at p1.sin, which has no label 16241 any more", "It still arrives, and every hop keeps the label 16241", "It still arrives, with p1.sin swapping 16241 for 20241"]
  answer: 3
  explanation: >-
    Each router derives its neighbour's label from the neighbour's advertised SRGB base plus the global index, so p1.sin swaps 16241 for 20241 and the path works. The index is global; the label value is global only while every SRGB matches, which is why operators standardise the block and why tools must not assume a label means the same thing everywhere.
- q: >-
    Why do data-center fabrics usually choose VXLAN over MPLS for tenant overlays?
  options: ["Any IP fabric carries VXLAN, and hosts and SmartNICs can be endpoints", "VXLAN has less overhead per packet than an MPLS label stack", "MPLS cannot carry more than a few thousand tenants in one fabric", "MPLS label lookups are too slow for today's switch ASICs"]
  answer: 0
  explanation: >-
    VXLAN needs nothing from the core but IP routing, servers, hypervisors and SmartNICs can encapsulate it, and its UDP source port gives ECMP entropy. MPLS has less overhead (8 bytes against 50), not more, and label lookups are fast; with 20-bit labels and a VPN label per VRF, tenant count is not the constraint. The overhead matters on expensive backbone circuits, not inside jumbo-frame fabrics.
- q: >-
    A customer's traceroute across an MPLS provider (uniform TTL model) shows 0.4 ms at hop 1 and about 105 ms at hop 2, a P router in the same city, then about 105 ms for every later hop. What explains hop 2?
  options: ["The long-haul circuit begins at the P router, so its delay shows there", "The P router forwards its ICMP reply along the LSP to the egress PE first", "The P router rate-limits ICMP generation, so its replies are delayed", "The P router has a congested queue that delays every labelled packet"]
  answer: 1
  explanation: >-
    A P router has no route to the customer's address, so RFC 3032 has it send the time-exceeded message onward down the same LSP to the egress PE, which routes it back. Every P hop therefore reports the round trip to the far end, about 105 ms for 10,500 km. Rate limiting or congestion would show as variable delay or loss at that hop alone, not the egress's round trip repeated on every later hop, and in a plain IP network a router at the start of a long circuit replies without crossing it.
```
