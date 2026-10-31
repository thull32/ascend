---
slug: packet-walk-drills
title: "Packet-walk drills: six classic walks, model answers and the slips"
description: The six walk and troubleshooting questions network organisations ask (laptop to website, VXLAN across a fabric, can't ping the gateway, latency jumped, adjacency down, two ISPs), each with a spoken model answer on the Meridian fabric, the layer named at every step, the numbers that prune hypotheses, and the slips interviewers listen for.
minutes: 40
difficulty: medium
tags: [fabric-networking, interview, packet-walk, troubleshooting, vxlan, arp, is-is, bgp, latency, traffic-engineering]
problems: [ip-in-subnet, longest-prefix-match]
---
A packet-walk question is a structure test dressed as a knowledge test. "A laptop opens a website", "server one can't ping its gateway", "latency went from 10 to 50 ms": the interviewer listens for three things. Do you place every step at a layer and know which device reads which header there? Do you start with scope instead of a command? At the edge of what you know, do you say so and turn to what you would measure? Most wrong answers come from knowing the facts and putting them at the wrong layer: BGP "at every hop", IS-IS in a one-hop ping failure, MED across two ISPs.

This lesson drills the six walks that come up most at network and AI-infrastructure companies, on the Meridian fabric the track has built. Each drill gives the question, a model answer written to be spoken, the slips, and a link to the lesson with the full mechanism. At about 150 words a minute the longest, the laptop walk, takes two minutes, leaving room for interruptions in the three minutes it is usually given.

## Naming the layer at every step

Every walk answer rests on one habit: say the layer before you say the step. A device processes a packet from the outside in, so each layer has its own reader, table and test: "layer 2" means a switch reading MAC addresses in its MAC table, with `ip neigh` on the host as the test. The layer tells the interviewer which box and which table you mean.

| Layer | What is read there | Table it is looked up in | Test you name |
|---|---|---|---|
| 1, physical | Light or electrical signal; damage surfaces one layer up as frames failing the FCS (frame check sequence, the CRC at the end of each frame) | none: is the link up, and are bits arriving intact? | link state, LLDP neighbour (the link-layer discovery protocol: each port announces the device and port at its end), CRC counters, optic receive power |
| 2, data link | Destination MAC, VLAN tag | MAC table; the host's ARP cache | `ip neigh`, the switch's MAC table for that VLAN |
| 3, network | Destination IP, TTL (time to live, a hop counter each router decrements) | FIB (forwarding information base, the forwarding table), by longest-prefix match | `ip route get`, ping, traceroute |
| 4, transport | Ports, TCP flags and sequence numbers | connection state on the hosts, NAT and firewall tables | `ss -ti`, SYN retransmit counters, captures |
| above 4 | TLS, HTTP, DNS payloads | application state | `curl -w` timings, `dig`, status codes |

Run a second axis across those rows: **control plane versus data plane**. IS-IS (the link-state routing protocol of Meridian's underlay), BGP (the path-vector protocol between networks) and EVPN (BGP carrying tenant MAC and IP routes) are control-plane protocols: they run between routers ahead of time and fill the FIB and MAC tables listed above. No packet passes through them. The packet only meets the tables they built ([planes, ASICs and network operating systems](/learn/fabric-networking/from-zero/planes-asics-and-network-operating-systems)). Two of the six drills turn on this: the laptop walk, where BGP decided the path long before the packet left, and the gateway ping, where no routing protocol is involved at all.

A walk answer has one skeleton, and each drill below is an instance of it:

1. **Scope.** One host or many, one site or several, since when, what changed. "Is it only you, or your peers too?": one user means local, everyone means real.
2. **Walk the layers in the order the packet meets them**, naming at each step which device reads which header and which table.
3. **At each step say how it breaks and which signal shows it.** That is where the walk turns into troubleshooting.
4. **Offer depth on one segment** and let the interviewer pick it.
5. **Close with what you would build or measure.** From a software engineer, that is the strongest ending.

## Drill 1: a new laptop opens a website

**The question:** "A new laptop joins the Wi-Fi and types `www.meridian.example`. What happens?" [The packet walk](/learn/fabric-networking/from-zero/the-packet-walk) has the full mechanism; this is the spoken version and its traps.

**The model answer** (two minutes spoken; budget three):

> "I'll go in ten steps and name the layer as I go. **One, Wi-Fi, layer 2:** the laptop associates with the access point and the WPA2 or WPA3 four-way handshake derives the session keys: a link, no address. **Two, DHCP, the dynamic host configuration protocol:** it broadcasts a Discover from 0.0.0.0, UDP 68 to 67, gets an Offer, sends a Request, gets an Ack with an address, mask, default gateway and DNS server. If nothing answers it self-assigns 169.254, which is the signal. **Three, DNS over UDP 53:** browser cache, OS cache, then the resolver walks root, `.example`, Meridian's authoritative servers, and returns 203.0.113.10 with a TTL. **Four, ARP, layer 2:** that address is off my subnet, so I need the gateway's MAC, not the server's; in fact I already ARPed for the router to send the DNS query, so it's cached. The first frame goes laptop MAC to router MAC, and private IP to 203.0.113.10. **Five, NAT, network address translation, layers 3 and 4:** the home router rewrites my source to its public address and port, and keeps the mapping for the reply. **Six, routing, layer 3:** every router does a longest-prefix match on the destination, rewrites the MACs, keeps the IPs and decrements the TTL. BGP chose the path across the internet ahead of time, ISP2 to Meridian's AS 64500 (an autonomous system: one network under one routing policy) at `gw2.ams`, and wrote it into each router's forwarding table; it is not consulted per packet. **Seven, TCP to 443:** SYN, SYN-ACK, ACK, one round trip. **Eight, TLS 1.3:** ClientHello with the server name and a key share, the server's certificate, which the laptop verifies, one more round trip. **Nine, HTTP:** GET over HTTP/2, 200 with the HTML, back through the NAT. **Ten, render:** sub-resources repeat three and seven to nine, then paint. Three round trips after DNS before the first byte of HTML. Which segment do you want deeper? I'd suggest six, inside Meridian's fabric."

**Where the time goes.** Without a budget the answer runs out on step 3.

| Steps | Seconds | What the interviewer listens for |
|---|---|---|
| 1–2, Wi-Fi and DHCP | 25 | That you did not skip them: "new laptop" was in the question for a reason |
| 3, DNS | 20 | UDP 53, caching, the TTL, "a CDN may answer with a nearby edge" |
| 4–5, ARP and NAT | 25 | Gateway MAC, not server MAC; NAT as the one deliberate rewrite of the IP |
| 6, routing | 40 | MAC rewritten, IP kept, TTL down; BGP decided in advance |
| 7–9, TCP, TLS, HTTP | 50 | Round trips counted; the order is TCP then TLS (QUIC merges them) |
| 10, render | 10 | Sub-resources repeat steps 3 and 7–9 |
| Close | 10 | An offer to go deep on one segment |

**Going deep on step 6.** If the interviewer takes the offer, walk it from `gw2.ams`, the border gateway, into Amsterdam's fabric, leaf to spine to leaf. Say this sentence: **"Inside Meridian, BGP's routes are used once, at the edge that chooses the exit or builds the tunnel; every transit device forwards on underlay routes from IS-IS."** It prevents the most common slip in the drill. (On the internet, ISP routers do hold BGP-learned routes in their FIBs, but there too BGP wrote the table in advance.)

**The slips:**

- **"Each router runs BGP to pick the next hop."** BGP ran earlier and filled the FIB. The follow-up "what does a spine know about `203.0.113.10`?" has the answer "only the underlay route to the leaf's loopback", which needs BGP kept out of the per-packet path.
- **Addressing the first frame to the server's MAC.** That MAC never leaves the server's subnet.
- **TLS before TCP, or "HTTPS uses UDP".** TLS rides on TCP. HTTP/3 over QUIC uses UDP 443 and merges the two handshakes into one round trip: name it as the exception.
- **Skipping NAT,** then failing to explain how the reply finds a private address.
- **Burning three minutes on DNS** and never reaching routing, the part a network organisation is hiring for.

## Drill 2: VXLAN across the fabric

**The question:** "Walk me through a packet between two servers across your EVPN fabric." Use Meridian's cross-site case: `acme-web1` (`10.1.1.10`, behind `leaf1.ams`) to `acme-web2` (`10.1.1.11`, behind `leaf2.sin`), the same Acme subnet, VLAN 100, carried as VNI 10100. A VNI (VXLAN network identifier) is the 24-bit segment number that names the tenant's layer-2 segment inside the tunnel. A VTEP (VXLAN tunnel endpoint) is the leaf that wraps and unwraps; at Meridian its address is the leaf's loopback.

> "Same subnet, so `acme-web1` ARPs for `acme-web2` directly. `leaf1.ams` answers from its ARP-suppression table, which EVPN filled, so the ARP never crosses the fabric. The host sends an ordinary frame to `acme-web2`'s MAC. **At `leaf1.ams`, the ingress VTEP:** the port and VLAN map to VNI 10100, and the MAC table for that VNI says this MAC sits behind VTEP 10.255.2.12, learned from an EVPN type-2 route, a MAC/IP advertisement, through the route reflectors. So it wraps the whole frame: 8 bytes of VXLAN with VNI 10100, 8 of UDP to port 4789 with a source port hashed from the inner headers, 20 of outer IP from 10.255.1.11 to 10.255.2.12, 14 of outer Ethernet. 50 bytes, which is why the underlay runs a jumbo MTU. **The spines** read only the outer destination IP, a loopback that IS-IS knows, rewrite the outer MACs, decrement the outer TTL, and never see Acme's addresses. **At `leaf2.sin`, the egress VTEP:** the outer destination is its own address and port 4789, so it strips the 50 bytes, maps VNI 10100 to its VLAN 100 and switches the frame out. EVPN was used once, at the ingress leaf; IS-IS carried it at every hop."

```viz
{"type": "fabric", "scenario": "vxlan-encap", "title": "VXLAN across two sites: leaf1.ams adds 50 bytes, two spines route on the outer header only, leaf2.sin strips it", "caption": "acme-web1 to acme-web2, the same Acme subnet in Amsterdam and Singapore. leaf1.ams maps VLAN 100 to VNI 10100, finds the MAC behind VTEP 10.255.2.12 and builds VXLAN, UDP 4789 with source port 58479, outer IPv4 and outer Ethernet from the inside out. spine1.ams and spine1.sin decrement the outer TTL from 64 to 62 and rewrite the outer MACs; the inner frame arrives byte for byte, TTL 64."}
```

The header stack as the spine receives it is the table interviewers want you to be able to draw:

| Header | Size | Value on `leaf1.ams` → `spine1.ams` | Who reads it |
|---|---|---|---|
| Outer Ethernet | 14 bytes | `leaf1.ams` uplink MAC → `spine1.ams` port MAC | Each underlay hop, then replaced |
| Outer IPv4 | 20 bytes | 10.255.1.11 → 10.255.2.12, protocol UDP, TTL 64, length 1,550 | Every spine (the lookup key) |
| Outer UDP | 8 bytes | source 58479 (hash of inner flow), destination 4789 | The ECMP (equal-cost multipath) hash; the egress VTEP |
| VXLAN | 8 bytes | flags (VNI valid), VNI 10100 | Egress VTEP only |
| Inner Ethernet | 14 bytes | `00:00:5e:00:53:0a` → `00:00:5e:00:53:0b` | Egress VTEP's MAC table for VNI 10100 |
| Inner IPv4 and TCP | 1,500 bytes | 10.1.1.10 → 10.1.1.11, TTL 64, port 443 | The hosts |

**The routed follow-up.** "Now `acme-web2` talks to `acme-db1`, `10.1.2.20` on `leaf3.ams`, a different subnet." With symmetric IRB (each leaf routes the tenant's traffic at both ingress and egress) the host ARPs for its gateway `10.1.1.1` and gets the anycast gateway MAC, which every leaf shares. `leaf2.sin` looks the destination up in VRF ACME (a VRF, virtual routing and forwarding instance, is the tenant's own routing table), finds a host route from `leaf3.ams`, rewrites the inner MACs to the two leaves' router MACs, decrements the inner TTL to 63 and sends it in L3VNI 50001, Acme's routing segment. `leaf3.ams` routes again (inner TTL 62) and delivers. The spines behave identically in both cases: routing between tenant subnets adds lookups at the edges and none in the middle ([VRFs and multi-tenancy](/learn/fabric-networking/overlays-vxlan-evpn/vrfs-and-multi-tenancy), [the overlay packet walk](/learn/fabric-networking/overlays-vxlan-evpn/the-overlay-packet-walk)).

**The slips:**

- **"The spines run EVPN" or "the spines look up the tenant MAC".** They hold neither tenant MACs nor tenant routes. If they needed them, the fabric would face the BGP black hole ([the BGP black hole](/learn/fabric-networking/bgp-fundamentals/the-bgp-black-hole)); encapsulation is the fix.
- **"VXLAN runs over TCP."** It is UDP; the inner TCP handles reliability end to end.
- **A random source port per packet.** It is a hash of the inner flow: one flow keeps one port and one path, so its packets stay in order, and different flows spread across spines by ECMP (equal-cost multipath: each switch hashes a flow onto one of several equal next hops) ([ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)).
- **Forgetting the 50 bytes.** A 1,500-byte inner packet needs a 1,550-byte underlay IP MTU (maximum transmission unit, the largest packet a link carries); one link left at 1,500 drops every full-size tunnelled packet while small pings pass ([VXLAN encapsulation](/learn/fabric-networking/overlays-vxlan-evpn/vxlan-encapsulation)).
- **Treating the VNI as the VLAN.** The VLAN is local to a leaf; the VNI is fabric-wide, and `leaf2.sin` could map VNI 10100 to another VLAN number.

## Drill 3: the server can't ping its default gateway

**The question:** "Server one can't ping its default gateway. What do you check?" The gateway is one hop away, so no IS-IS, BGP or spine is involved. [ARP and the default gateway](/learn/fabric-networking/from-zero/arp-and-the-default-gateway) has the full checklist with outputs; here is the answer and the reasoning behind its order.

> "First, scope: this server, or every server in the VLAN? If the others can reach `10.1.1.1` it's this server or its port; if none can, it's the gateway interface or the VLAN on the leaf. It's one hop, so no routing protocol is involved; I'd go up the layers. **Layer 1:** is the link up at the expected speed, and does LLDP show the leaf and port I expect? **Host config:** right address, right mask, a gateway inside the subnet, on the interface that's cabled. **Layer 2, the pivot:** does ARP resolve the gateway? `ip neigh` showing INCOMPLETE then FAILED means requests leave and nothing comes back: the port's VLAN, the leaf's MAC table for that VLAN, the gateway interface missing or down. If ARP resolves to the anycast gateway MAC and ping still fails, layer 2 works and it's policy: an ACL, a packet filter, or control-plane policing, the rate limiter in front of the leaf's CPU, because a ping *to* the gateway is punted to that CPU. So I'd test *through* the gateway, pinging a host in another subnet. Last, size: small pings fine and jumbo pings with don't-fragment failing means an MTU mismatch on that port."

```viz
{"type": "fabric", "scenario": "arp-gateway", "variant": "no-reply", "title": "Can't reach the gateway: three ARP probes, no reply, a FAILED entry and an error from the server itself", "caption": "acme-web1 decides 10.1.2.20 is off its subnet and needs the MAC of its gateway 10.1.1.1. leaf1.ams floods the broadcast through VLAN 100, but its VLAN 100 gateway interface is missing, so nobody answers. Three probes one second apart go unanswered; at 3 s the entry becomes FAILED and connect() returns No route to host from acme-web1, before any packet to acme-db1 was sent."}
```

Why this order works: each step can only pass once the step below does. ARP cannot succeed on a dead link, and a ping, an IP packet in a frame addressed to the MAC that ARP found, cannot succeed without ARP. So the first test that fails names the layer:

| What you observe | Layer | Where the fault is |
|---|---|---|
| Link down, or LLDP names the wrong neighbour | 1 | Cable, optic, port shut or cabled elsewhere |
| Mask too narrow (a `/30` on 10.1.1.10 leaves 10.1.1.1 outside it), so the gateway is not on-link and the default route is refused | host config | The server's address, mask or route |
| `ip neigh` INCOMPLETE, then FAILED | 2 | VLAN on the port, tagged versus untagged, gateway interface missing or down |
| ARP resolves to an unexpected MAC | 2 | A duplicate IP answering for the gateway |
| ARP resolves to `00:00:5e:00:01:01`, ping fails, traffic *through* the gateway works | 3, control plane | ICMP to the switch rate-limited or filtered: the gateway is fine |
| Small pings work, `ping -M do -s 8972` fails | 2 / 3, size | Server MTU larger than the port's |

**The slips:**

- **Starting with IS-IS adjacencies or the BGP summary.** The interviewer hears that you do not know where the gateway is.
- **Concluding "the gateway is down" from a failed ping** when ARP resolves. The leaf may forward perfectly while rate-limiting pings to itself.
- **Not saying the layer.** "Check the VLAN" is correct; "that's layer 2: the VLAN, the MAC table, the gateway interface" shows the model.

## Drill 4: latency went from 10 ms to 50 ms

**The question:** "A customer's latency went from 10 to 50 ms across the EVPN fabric. What do you collect, and how do you find the cause among tens of thousands of links?" Here numbers do the most work: they rule out whole layers before you collect anything. [The troubleshooting method](/learn/fabric-networking/operating-fabrics/the-troubleshooting-method) works the case in full.

> "First I'd ask what the 50 is: median or p99, measured by whom, for which flows, since when, and what changed. Then I'd prune with numbers. Inside one site the fabric round trip is tens of microseconds, so the 10 ms is mostly the application. 40 ms extra is too much for switch queueing: even a full 32 MB buffer at 100 Gb/s drains in about 2.6 ms, and the path has three switches. It's too little for a detour to another site: Amsterdam to Singapore adds over 100 ms. What does add tens to hundreds of milliseconds is TCP recovering from loss, or the hosts. So I'd split three ways. If every request got 40 ms slower, median and p99 together, it's a fixed wait, likely on the host: 40 ms is Linux's minimum delayed-ACK timer meeting Nagle's algorithm. If the median held and the tail exploded, it's loss on some paths: probes between the two leaves with many source ports hash over every spine, and grouped by path the bad ones share a spine or a link. Then that link's counters at both ends, and TCP retransmits per destination on the hosts."

**The arithmetic behind the pruning.** Each line is a cause and the size of delay it can produce:

| Cause | How much it can add | Provenance |
|---|---|---|
| Fibre distance | 10 µs of round trip per km of path; +40 ms needs 4,000 km more path | about 5 µs per km one way |
| A switch queue | at most buffer ÷ drain rate: 32 MB at 100 Gb/s ≈ 2.6 ms, at 400 Gb/s ≈ 0.64 ms | shared buffers of tens of MB on current data-center switches; one queue usually gets only a share, so this is a ceiling |
| A lost segment that only a timeout recovers | 200 ms or more | Linux's minimum retransmission timeout (RTO) |
| A lost SYN | 1 s, then 2 s, 4 s | the initial RTO of RFC 6298, doubling per retry |
| Nagle's algorithm meeting a delayed ACK | 40 ms per affected exchange | Linux's minimum delayed-ACK timer ([TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive)) |
| Inter-site detour, `ams`–`sin` | ≥ 105 ms round trip | 10,500 km of fibre path |

**The distribution names the layer.** A small simulation makes the three signatures concrete: requests hashed over four spines, about 10 ms each when healthy, with three different faults. Illustrative parameters: the lossy link makes 15% of requests through `spine3` lose a segment that only the RTO recovers; the queueing case puts every queue on the path somewhere between empty and full.

```python
import random
import statistics

SPINES = ["spine1", "spine2", "spine3", "spine4"]
RTO_MS = 200.0            # Linux minimum retransmission timeout
DELAYED_ACK_MS = 40.0     # Linux minimum delayed-ACK timer
BUFFER_DRAIN_MS = 32e6 * 8 / 100e9 * 1e3   # a full 32 MB buffer at 100 Gb/s


def request(rng, fault):
    """Latency of one request in ms, and the spine its flow hashed onto."""
    spine = rng.choice(SPINES)                 # stands in for the ECMP hash
    ms = rng.gauss(10.0, 1.0)                  # server time plus a fabric RTT
    if fault == "host":
        ms += DELAYED_ACK_MS                   # Nagle meets delayed ACK, every request
    elif fault == "lossy-link" and spine == "spine3":
        if rng.random() < 0.15:                # tail segment lost: only a timeout recovers it
            ms += RTO_MS
    elif fault == "queueing":
        for _ in range(3):                     # leaf, spine, leaf: each queue adds 0..full drain
            ms += rng.random() * BUFFER_DRAIN_MS
    return spine, ms


def pct(values, p):
    values = sorted(values)
    return values[min(len(values) - 1, int(p / 100 * len(values)))]


rng = random.Random(7)
print(f"{'fault':<11} {'p50':>6} {'p90':>6} {'p99':>6} {'mean':>6}   p99 by spine")
for fault in ["none", "host", "lossy-link", "queueing"]:
    runs = [request(rng, fault) for _ in range(20_000)]
    all_ms = [ms for _, ms in runs]
    by_spine = {s: pct([ms for sp, ms in runs if sp == s], 99) for s in SPINES}
    spread = " ".join(f"{s[-1]}:{v:5.0f}" for s, v in by_spine.items())
    print(f"{fault:<11} {pct(all_ms, 50):6.1f} {pct(all_ms, 90):6.1f} {pct(all_ms, 99):6.1f} "
          f"{statistics.fmean(all_ms):6.1f}   {spread}")
```

```text
fault          p50    p90    p99   mean   p99 by spine
none          10.0   11.3   12.3   10.0   1:   12 2:   12 3:   12 4:   12
host          50.0   51.3   52.3   50.0   1:   52 2:   52 3:   52 4:   52
lossy-link    10.0   11.5  210.6   17.3   1:   12 2:   12 3:  211 4:   12
queueing      13.8   16.0   17.6   13.8   1:   17 2:   18 3:   17 4:   18
```

Read it row by row. **Host:** every percentile moves by 40 ms and every spine looks the same: no path is guilty, so leave the fabric. **Lossy link:** the median holds, the p99 jumps to 210 ms, the mean rises only to 17 ms, and grouping by spine puts it all on `spine3`; a fabric-wide mean would hide it. **Queueing:** with every queue on the path half full on average, the distribution moves by under 4 ms, so in-fabric queueing explains a few milliseconds at most, not 40. (`pct` takes the sample at that rank without interpolation, enough to compare shapes.)

The localisation step is the one that scales to tens of thousands of links. Its probes are TWAMP Light (the two-way active measurement protocol, RFC 5357, in its stateless reflector form): timestamped UDP packets bounced off an agent behind the far leaf.

```viz
{"type": "fabric", "scenario": "probe-localisation", "title": "Localising a path that loses packets: ping says 0%, 16 hashed probe streams find spine3 and then one link", "caption": "Acme's requests from leaf1.ams to leaf3.ams are sometimes slow. One ping 5-tuple takes one path and shows no loss. TWAMP Light streams with 16 source ports spread over the four spines, TTL-2 probes map each stream to its spine, and only the three streams through spine3 lose about 4% while probe round-trip times stay at 61 µs. A second leaf pair narrows it to the spine3 to leaf3 link, whose counters show 3.9% frames failing the frame check on one weak optic lane; costing it out clears every stream."}
```

Note what the probes saw: round-trip time unchanged, loss on one path. The customer's "latency" was TCP recovering from that loss, the `lossy-link` row of the simulation. On a suspect link, read both ends: utilisation, output discards, FCS errors, optic light levels, flaps, and where the fabric carries RoCE (RDMA, remote direct memory access, over Ethernet), ECN marks (explicit congestion notification: a switch marks a packet instead of dropping it) and PFC pauses (priority flow control, pausing one traffic class upstream). Frames transmitted at one end against frames received at the other turn "somewhere" into "this link" ([active measurement](/learn/fabric-networking/operating-fabrics/active-measurement)).

**The slips:**

- **Listing counters without a method.** Nobody reads tens of thousands of links one by one; hashed probes grouped by path name the suspects.
- **Pinging and declaring the network clean.** ICMP has no ports, so on most hash settings every echo between two addresses takes one path out of four.
- **Blaming congestion for 40 ms inside a site** without the buffer arithmetic that rules it out.
- **Never asking which statistic moved.** Median and tail point at different layers.

## Drill 5: an IS-IS adjacency went down

**The question:** "An IS-IS adjacency went down. What do you check?" IS-IS is Meridian's underlay: the link-state protocol that makes every loopback reachable. An adjacency is the neighbour relationship two routers form over one link by exchanging hellos. [Underlay failures in production](/learn/fabric-networking/underlay/underlay-failures-in-production) has the checklist item by item; the drill is the order and the reasons.

> "Scope first: one adjacency, every adjacency on the box, or many boxes? One link is cabling or the two ends' configuration. Every adjacency on one router is the router: its process, CPU, an upgrade, its clock. Many routers at once is one change, a template or a key rollover. For one adjacency I'd check both ends, bottom-up, in the order the hello travels. **The interface:** up, IS-IS enabled, LLDP showing the right neighbour, both ends point-to-point. **MTU:** by default IS-IS pads its hellos to the full interface MTU, so a mismatch stops the adjacency: one side sits in Initializing and the small-MTU side counts oversize frames. **Authentication:** a hello key mismatch keeps both Down with auth-failure counters. **Level and area:** both ends must share a level, and only a level-1 adjacency also needs the same area; Meridian is all level 2. **Duplicate system ID**, usually from a copied template. **Timers** last: in IS-IS they don't have to match, because each hello carries its sender's hold time, commonly three times a hello of about 10 seconds; a hold time too close to the hello interval flaps under CPU load. Then what went with it: a leaf that lost all its adjacencies took its loopback, its BGP sessions and its VXLAN tunnels with it."

What each end shows separates the causes before you read a single configuration line:

| Cause | This end | Far end | Counter that rises |
|---|---|---|---|
| Link down or IS-IS off on one end | Down, no hellos received | Down | none, or interface errors |
| MTU mismatch (far end at 1,500) | Initializing: hears small hellos that do not list it | no adjacency at all | oversize frames on the 1,500-byte port, one per hello |
| Hello authentication mismatch | Down | Down | authentication failures, both ends |
| LSP authentication mismatch only | Up | Up, but the neighbour's routes never arrive | LSP authentication failures |
| Level mismatch (a leaf rendered level-1 only) | Down | Down | level-mismatch drops |
| Duplicate system ID | between neighbours, Down: the hello is rejected | Down | between non-neighbours adjacencies stay up, but one LSP ID (link-state packet, a router's description of its links) has a sequence number climbing several times a second |

**The slips:**

- **Answering with the BGP summary.** BGP rides on the underlay; it is a consequence of this failure, not a place to look for its cause.
- **"The hello timers must match."** True in OSPF, false in IS-IS, where each router announces its own hold time.
- **Checking one end.** Most of the table is a disagreement between two configurations, visible only from both.
- **Missing the blast radius:** one adjacency on a leaf with four uplinks costs a quarter of its capacity; all four take every overlay session to that leaf with them ([convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd)).

## Drill 6: two ISPs, prefer one, fail over to the other

**The question:** "You have two ISPs. Prefer ISP1 for traffic in both directions; fail over to ISP2." Meridian (AS 64500, announcing `203.0.113.0/24`) has `gw1.ams` on ISP1 (AS 64501) and `gw2.ams` on ISP2 (AS 64502). These addresses and AS numbers come from the ranges reserved for documentation (RFC 5737 and RFC 5398). [Traffic engineering with BGP](/learn/fabric-networking/bgp-in-the-real-world/traffic-engineering-with-bgp) builds the whole design. The drill turns on one distinction: outbound, Meridian decides; inbound, other networks decide.

> "Egress and ingress are different problems. **Egress I control:** on `gw1.ams` I set LOCAL_PREF 200 on everything learned from ISP1. LOCAL_PREF travels to every router in my AS over iBGP, BGP inside one AS, and is compared before path length, so everyone exits via ISP1; if ISP1 fails, those routes are withdrawn and ISP2's at the default 100 win. **Ingress I can only influence,** because every other network runs its own decision process. Three tools, weakest to strongest. Prepend my AS towards ISP2 so that path looks longer. That loses wherever path length is compared, but not inside ISP2, which prefers customer routes by LOCAL_PREF first, so I'd also tag ISP2's published community that lowers my LOCAL_PREF there below its peer routes. Strongest is a more-specific: announce two halves only to ISP1 and the aggregate to both, so longest-prefix match pulls traffic to ISP1, and the aggregate via ISP2 carries it when ISP1 goes. Most networks drop IPv4 routes longer than /24, so in practice that is two /24s out of a /23. MED, the multi-exit discriminator, doesn't help: it's compared only between paths from the same neighbouring AS. Then I'd test the failover and run BFD, bidirectional forwarding detection, on both sessions, because a failure that leaves the light on waits for the BGP hold timer."

```viz
{"type": "fabric", "scenario": "two-isp-te", "title": "Two ISPs: LOCAL_PREF fixes egress; prepending, a community and more-specifics move ingress; then failover", "caption": "Meridian, AS 64500, on ISP1 and ISP2. LOCAL_PREF 200 on ISP1's routes sends every outbound packet via gw1.ams. Inbound, AS 64511 first picks ISP2; prepending moves it, but ISP2 keeps its customer route until community 64502:70 lowers its LOCAL_PREF, and two /25s announced only to ISP1 win by longest match. When the gw1 to ISP1 fibre is cut, both directions move to ISP2."}
```

The failover, as the interviewer expects it stated: outbound moves as fast as Meridian's routers withdraw and reselect, about a second with a default route from each ISP, but seconds to tens of seconds with full tables of about a million IPv4 prefixes rewritten into the FIB one by one, unless the routers keep a precomputed backup next hop (BGP PIC, prefix-independent convergence). Inbound moves as fast as other networks process ISP1's withdrawals: seconds for ISP1's own customers, up to minutes for distant networks. A failure that keeps the light on (ISP1's router dying behind a carrier switch) waits for the hold timer: 90 s as RFC 4271 suggests (180 s on several vendors' defaults), so 60 to 90 s with 30 s keepalives. BFD at 300 ms × 3 cuts that to about 0.9 s.

**The slips:**

- **MED to steer between two ISPs.** MED is compared only between routes from the same neighbouring AS; it chooses between two links to one ISP.
- **Getting prefix length backwards.** A /25 is more specific than a /24; a /16 is less specific. Say "longer prefix, more specific, wins" as you use it.
- **"Prepending guarantees ISP1."** It works only where path length is reached; an ISP's LOCAL_PREF for its customers decides first.
- **Claiming you control ingress.** Say "influence", then say how you would measure whether it worked.
- **Forgetting failback.** A flapping ISP1 circuit makes the prefixes flap across the internet, and networks that run route-flap damping may suppress them for tens of minutes; operators keep a flapping circuit down until it has been stable for a while.

## The six mechanisms in three lines each

For each walk's mechanism, a network engineer expects what it solves, how it breaks and which signal shows it:

| Walk | Mechanism | What it solves | How it breaks | Signal that shows it |
|---|---|---|---|---|
| Laptop to website | Layered lookups: DHCP, DNS, ARP, NAT, FIB, TCP, TLS | Turning a name into bytes with no prior configuration | One step fails and every later step inherits it | 169.254 address, DNS timeout, SYN retransmits, certificate error |
| VXLAN across a fabric | Encapsulation at the leaf, routing on the outer header | Tenant segments stretched over a routed underlay | MTU short by 50 bytes, missing type-2 route, VNI mapped wrong | Large packets lost while pings pass; flooding instead of unicast |
| Can't ping the gateway | ARP resolving the gateway MAC, then a CPU-bound ping | Reaching the first router | Wrong VLAN, missing gateway interface, control-plane policing drops | `ip neigh` FAILED; ARP fine but echo replies missing |
| Latency jumped | ECMP spreading flows; TCP recovering loss | Bandwidth from many paths; reliability over loss | One gray link loses packets while still up | Tail up, median flat; probes grouped by spine; FCS errors on one link |
| Adjacency down | IS-IS hellos with a three-way handshake | Every loopback reachable, so BGP and tunnels can run | MTU, authentication, level or system-ID mismatch | Initializing on one end; oversize or auth-failure counters |
| Two ISPs | LOCAL_PREF out; prepend, communities, more-specifics in | Choosing exits and attracting entries | Ingress influence ignored; silent failure waits for hold timer | Traffic per ISP against intent; failover time measured |

## Trade-offs: how deep to go, and when

Every walk allows several answer shapes; picking one deliberately, and saying so, is itself a signal.

| Answer shape | Time | What it shows | Risk | Use when |
|---|---|---|---|---|
| Protocol list in order | 30 s | Vocabulary | Reads as memorised; no layers, no failures | Never as the whole answer |
| Breadth: every step, layer, one breakage each | 2–3 min | The whole picture held at once | Running out of time on early steps | The opening of any walk |
| Depth on one segment, headers per hop | 2–4 min | Mechanism at byte level | Picking a segment the interviewer does not care about | After breadth, on the segment they pick |
| Troubleshooting ladder, scope first | 1–2 min | Method under uncertainty | Skipping scope and opening a terminal in your head | "X can't reach Y", "latency jumped", "adjacency down" |
| "I'd defer on that detail; here is what I'd measure" | 20 s | Honesty and the software engineer's role | Used too early, it reads as evasion | Past the edge of what you know, after showing what you do know |

## What the platform should show

Each drill is a question an on-call engineer asks at 3 a.m., so each needs a view that answers it in seconds:

- **Laptop to website: per-step client timing.** DNS, connect, TLS and time to first byte from synthetic clients in every region; the step that grew names the layer.
- **VXLAN walk: the path as lookups.** For a source and destination, every table hit: VNI map, MAC or VRF entry, the EVPN route with its route distinguisher, route target and next hop, the underlay ECMP set, the egress mapping, each marked healthy or not.
- **Gateway ping: one-hop state in one place.** The host's neighbour entry, the leaf's MAC table for that VLAN, the gateway interface's state, control-plane policing drops on that leaf: four lookups that otherwise need two logins.
- **Latency: distributions by path.** Probe results and host retransmits grouped by the spine and link each flow crossed, with p50 and p99 side by side; a fabric-wide average hides the 4% path.
- **Adjacency down: both ends with a reason.** State on each side, the counter that explains it (oversize, auth failure, level mismatch), and what rode on that adjacency: loopbacks, BGP sessions, tunnels.
- **Two ISPs: traffic per ISP against intent.** Inbound and outbound rates per upstream and source network, flagged when they disagree with the declared preference, and the last failover test's measured time.

Engineers want the reason; managers want the colour and whether to step in: one adjacency of four down on a leaf is yellow, all four is red ([telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability)).

## Interviewer follow-ups

**"In your VXLAN walk, what does the spine know about Acme?"** Model answer: nothing. It routes on the outer destination, a leaf loopback learned from IS-IS, and its FIB holds only underlay prefixes. That is why spines stay tenant-agnostic and adding a tenant never touches them. Common wrong answer: "the spine has the EVPN routes and forwards by MAC".

**"Why does the inner TTL not drop at the spines?"** Model answer: the spines never read the inner header; they decrement the outer TTL. The inner TTL drops only where the inner packet is routed: never for same-subnet traffic, once at each leaf with symmetric IRB. That is also why a traceroute between two servers in different subnets shows the two leaves and no spines. Common wrong answer: "VXLAN copies the TTL across".

**"The IS-IS adjacency is Up on both ends, yet the spine has no route to the leaf's loopback. What now?"** Model answer: an adjacency only proves hellos work; routes come from the LSPs flooded over it. I'd check whether the leaf's LSP reached the spine's database at all (an LSP authentication mismatch drops it while hellos pass), and if it did, what it says: the overload bit, which tells others not to route through the leaf and which many operators set for a few minutes after boot, or a loopback that was never advertised. Common wrong answer: "the adjacency is up, so IS-IS is fine; look at BGP".

**"Your probes between the two leaves show no loss and no change in delay, but the customer still says it's slow. Now what?"** Model answer: the probes cover the fabric between two agents, not the customer's hosts, VRF or leaves, so I'd collect on the customer's side: `ss -ti` on a slow connection for its RTT and retransmits, and a capture at both ends. A 40 ms gap before each ACK points at Nagle and delayed ACK, which `TCP_NODELAY` fixes. I'd hand back the per-path probe data as evidence, not as a verdict. Common wrong answer: "the network is clean, close the ticket".

**"How exactly does ISP2 handle your community?"** Model answer: I'd defer to the network team on a given provider's scheme, since each publishes its own, but the mechanism is that ISP2's import policy matches the community and sets its own LOCAL_PREF. What I'd build is the check: inbound traffic per ISP and source network against intent, before and after the change. Common wrong answer: inventing a precise community value and its effect, which a principal engineer will probe.

## What mid-level engineers get wrong

- **Putting the control plane in the data path.** "BGP at every hop" or "the spine looks up EVPN" fails the follow-up about what a transit device knows.
- **Opening a terminal before scoping.** A one-host fault and a site-wide fault need different first commands, and "one or many?" costs nothing.
- **Using the wrong layer's tool.** IS-IS for a one-hop ARP failure, the BGP summary for an adjacency, MED for two ISPs: the facts are right, the layer is wrong.
- **Answering every step at the same depth.** The clock runs out on step 3 and the segment the interviewer cared about never comes up.
- **Never closing with measurement.** The role is building the tool that answers the question; an answer without one misses it.

## Senior signals

- You name the layer, device and table at each step, and keep IS-IS, BGP and EVPN in the control plane, used once at the edge of the path.
- You open every troubleshooting walk with scope (one host or many, one site or several, since when, what changed) as the first split of the search.
- You prune with numbers: 5 µs per km, a 32 MB buffer draining in 2.6 ms, a 200 ms minimum RTO, a 40 ms delayed ACK, 50 bytes of VXLAN.
- You ask which statistic moved, because a median shift and a tail explosion point at different layers.
- You check both ends of anything with two ends and read asymmetric states (Initializing on one side, nothing on the other) as evidence.
- You say "control" for outbound and "influence" for inbound, and verify both with measurement.
- At the edge of your knowledge you say so and turn to what you would build or measure.

## Check yourself

```quiz
- q: >-
    In the VXLAN walk from acme-web1 on leaf1.ams to acme-web2 on leaf2.sin, what does spine1.ams use to forward the packet?
  options: ["The inner destination IP, from the Acme VRF", "The VNI 10100, mapped to a spine VLAN", "The outer destination IP, routed via IS-IS", "The inner destination MAC, from a type-2 route"]
  answer: 2
  explanation: >-
    The spine reads only the outer IPv4 header, addressed to VTEP 10.255.2.12, a loopback the underlay knows, and rewrites the outer MACs. It holds no tenant MACs, VNIs or VRFs; the EVPN type-2 route was used once, at leaf1.ams, to pick the VTEP. A spine that needed tenant state would recreate the BGP black hole.
- q: >-
    A server can't ping its gateway. ip neigh shows the gateway at the anycast gateway MAC, REACHABLE, and the server reaches a host in another subnet through the gateway. What is the most likely explanation?
  options: ["The server's MTU exceeds the port's MTU", "The leaf's IS-IS adjacency to a spine is down", "The server port is in the wrong VLAN", "ICMP to the leaf's own address is rate-limited"]
  answer: 3
  explanation: >-
    ARP resolving rules out layer 2 and the VLAN, and forwarding through the gateway works, so the gateway is fine. A ping addressed to the gateway itself is punted to the switch CPU under control-plane policing, which may drop or rate-limit it. A one-hop ping never involves IS-IS, and an MTU problem would affect large packets through the gateway too.
- q: >-
    After a change, requests across one site of the fabric show median and p99 latency both up by 40 ms, equally on every spine. Where should you look first?
  options: ["The inter-site circuit, for a detour through Singapore", "One spine's uplinks, for congestion and output drops", "The route reflectors, for EVPN route churn", "The hosts and application, for a fixed added wait"]
  answer: 3
  explanation: >-
    An equal shift at every percentile and on every path is a fixed wait added to each request, not a path problem; 40 ms matches Linux's minimum delayed-ACK timer meeting Nagle's algorithm. One congested spine would affect only flows hashed onto it, an in-site switch queue cannot add 40 ms (a 32 MB buffer at 100 Gb/s drains in about 2.6 ms), and a detour to Singapore would add over 100 ms.
- q: >-
    leaf5.ams shows its IS-IS adjacency to spine2.ams in Initializing; spine2.ams shows no adjacency at all and counts oversize frames on that port. What is the cause?
  options: ["A hello authentication key mismatch between them", "A duplicate system ID copied from a template", "spine2.ams's port MTU is smaller than leaf5's", "Mismatched hello timers on the two ends"]
  answer: 2
  explanation: >-
    By default IS-IS pads hellos to the interface MTU. spine2.ams drops leaf5's padded hellos as oversize, so it never hears leaf5; leaf5 hears spine2's smaller hellos, which do not list it, and waits in Initializing. An authentication mismatch keeps both ends Down with auth-failure counters, and IS-IS hello timers do not need to match.
- q: >-
    Meridian wants inbound traffic via ISP1 and has prepended its AS three times towards ISP2, yet traffic from ISP2's own customers still arrives via ISP2. Why?
  options: ["ISP2 strips prepended ASes from customer announcements", "ISP2 prefers customer routes by LOCAL_PREF before path length", "ISP2 compares MED, which prepending does not change", "Prepending works only on routes announced over iBGP"]
  answer: 1
  explanation: >-
    LOCAL_PREF is compared before AS path length, and ISP2 gives routes from its paying customers a higher LOCAL_PREF than routes from peers, so it keeps the direct path to Meridian however long it looks. ISP2's published community for lowering LOCAL_PREF, or a more-specific announced only via ISP1, moves that traffic. MED is not compared between routes from different neighbouring ASes.
- q: >-
    In the laptop-to-website walk, which statement about step 6, routing across the internet into Meridian, is correct?
  options: ["Each router queries BGP for the best next hop of the packet", "Only the home router consults BGP, choosing between ISPs", "The spines inside Meridian look up BGP routes for 203.0.113.10", "BGP filled each FIB in advance; packets meet only the FIB"]
  answer: 3
  explanation: >-
    BGP is a control-plane protocol that ran before the packet existed and installed best paths in each router's forwarding table; per packet, each router does a longest-prefix match in its FIB and rewrites the MACs. A home router has a default route and no BGP. Inside Meridian the border gateway and leaves use BGP-learned routes, while the spines forward on underlay routes.
```
