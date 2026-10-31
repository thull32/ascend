---
lesson: mpls-and-segment-routing
source: 9c1ff9ddcd3767ab
fit: partial
desk:
  - "The label stack entry field table and the hand decode of the eight bytes pe1.sin sends"
  - "The Python label-switching model: LDP, SR-MPLS on one SRGB, and SR-MPLS with p1.ams on a different SRGB"
  - "The LDP bindings table and the illustrative label forwarding table on p1.sin"
  - "The RSVP-TE worked example: two tunnels and CSPF pruning circuit 1"
  - "The VPNv4 route field by field and the hop-by-hop table for acme-web2's SYN"
  - "The two visualisations: MPLS L3VPN label switching, and the same VPN over SR-MPLS"
  - "The L3VPN to EVPN inheritance table"
  - "The SRv6 header table, the overhead-by-packet-size table and the MPLS versus VXLAN comparison"
  - "The failure modes table and the label-agreement trade-offs table"
  - "The platform checks in Python and their four findings"
---
## Introduction

Carriers had this module's problem more than ten years before VXLAN existed: tenants with overlapping addresses, carried across a core that knows nothing about them. Their answer was MPLS. Put a 4-byte label in front of the packet, and have the core forward on the label alone. It still runs most service-provider backbones, it is where route distinguishers and route targets come from, and it is why every EVPN route has a field called "MPLS label".

"MPLS or VXLAN?" is a common interview question. The answer shows whether you see one idea with two wire formats.

Picture the backbone Meridian would build between Singapore and Amsterdam if it ran it as a carrier does. Two provider edge routers, the PEs, hold the tenant VRFs: pe1.sin and pe1.ams. Two provider routers, the Ps, only switch labels: p1.sin and p1.ams, joined by the 10,500-kilometre circuit. acme-web2 sits behind pe1.sin, acme-db1 behind pe1.ams, and IS-IS carries every loopback.

## The label: push, swap and pop

MPLS slips one or more label entries between the Ethernet header and the packet. Each is 32 bits: a 20-bit label, 3 bits of traffic class for queueing, a bottom-of-stack bit, and an 8-bit TTL. Only the top entry is read in transit, and nothing says what the payload is. The router that removes the last label knows, because it assigned it.

Each router allocates its own labels, so a label means something only to the router that chose it. p1.sin reading 24017 and p1.ams reading 24031 both mean "towards pe1.ams". Why labels at all? In 1997 an exact match on a short label was cheaper than a longest-prefix match. Modern chips do both at line rate. What survives is the indirection: the label names a meaning, an exit router, a VRF, a path, and the core forwards without knowing any customer address. That is the move VXLAN makes with an outer IP header.

The ingress PE pushes a label. Each P router swaps: it looks the label up in its label forwarding table, replaces it with the one the next router asked for, and decrements the TTL. At the end, a router pops. The chain of swaps is a label-switched path, an LSP, and it is one-way. Traffic back from acme-db1 rides a separate LSP, which can break on its own, so test each direction.

If pe1.ams received its own transport label, it would look it up only to learn "that is me". So it advertises label 3, implicit null, and p1.ams pops instead of swapping. That is penultimate-hop popping; label 3 never appears in a packet. If the last link needs the traffic-class bits, the egress asks for explicit null, label 0.

In the uniform TTL model, the ingress copies the IP TTL into the label and the egress copies it back, as if the core were plain IP. In the pipe model, the customer's traceroute shows no P routers, which is why many carriers choose it. Uniform has a surprise. acme-web2 traceroutes to acme-db1. Hop 1 answers in 0.4 milliseconds. Hop 2 is p1.sin, a few kilometres away. What time does it show?

[pause]

About 105 milliseconds. p1.sin must send "time exceeded" to an Acme address it has no route for, so it sends it onward along the LSP to pe1.ams, which routes it back. The reply crossed to Amsterdam and back. Every P hop shows the round trip to the egress, so the jump appears at the first P hop, not after the long-haul circuit.

## LDP: labels that follow the IGP

Something has to tell p1.sin that p1.ams wants 24031. Usually that is LDP, the Label Distribution Protocol. It runs beside the IGP and computes no paths: its labels follow whatever path IS-IS chose. Neighbours find each other with hellos, then open a TCP session on port 646 between their loopbacks.

The LSP to pe1.ams is built from the far end back. pe1.ams tells p1.ams: label 3 for my loopback. p1.ams tells p1.sin: 24031. p1.sin tells pe1.sin: 24017. The label a router advertises is the one it wants to receive, and it becomes the upstream router's outgoing label. Routers keep every binding they hear but program only the one from their IGP next hop, so after a reroute the new label is already in memory.

Two traps. First, an LDP session down on a link whose IS-IS adjacency stays up: traffic keeps flowing over that link and leaves it unlabelled. The fix, LDP and IGP synchronisation, is traced in the BGP black hole lesson.

Second, LDP binds a label only to an exact routing-table match. Summarise the Amsterdam loopbacks into a slash 24, and no LSP to pe1.ams's slash 32 is built. Every VPN route behind it becomes unusable, while the summary still pings. So MPLS networks do not summarise PE loopbacks. The signals: per link, IGP up and LDP down; per PE pair, a missing labelled route.

## RSVP-TE in brief

LDP sends everything on the shortest path. Sometimes a path must satisfy a constraint: this 50 gigabits per second must avoid the full circuit. RSVP-TE builds such traffic-engineering tunnels. IS-IS advertises each link's unreserved bandwidth. The head end removes every link that cannot fit the request, then runs Dijkstra on what is left. It signals the path hop by hop, each router allocates a label and deducts the bandwidth, and the state is refreshed every 30 seconds or it expires.

Two circuits of 100 gigabits, circuit 1 shorter. Tunnel A asks for 70 and takes circuit 1, leaving 30. Tunnel B asks for 50: circuit 1 is pruned before Dijkstra runs, so it takes circuit 2. LDP would have put all 120 on circuit 1 and dropped 20. RSVP-TE also gives fast reroute, a pre-signalled bypass around each link, recovering in tens of milliseconds.

The costs: every router on a tunnel holds its state, and a full mesh of 200 PEs is 39,800 tunnels. And a reservation is bookkeeping, not policing. A tunnel that reserved 50 but carries 90 still carries 90, so links congest while every reservation looks healthy. Watch reserved against measured bandwidth, per tunnel.

## L3VPN: the design EVPN inherited

The transport label reaches pe1.ams but does not name the tenant, and Acme and Globex both use 10.1.1.0 slash 24. L3VPN adds a second label, carried in BGP. PEs advertise customer prefixes to each other over iBGP, through reflectors, in the VPNv4 family. pe1.ams's route for Acme's 10.1.2.0 slash 24 carries VPN label 92001, a route distinguisher that makes it unique, a route target, 65000 colon 50001, that decides who imports it, and pe1.ams's loopback as next hop. That next hop must resolve to an LSP; an IGP route is not enough, and a route without one is held but hidden.

Follow a packet. acme-web2 opens TCP to acme-db1 on port 5432. The SYN reaches pe1.sin as plain IPv4, TTL 64, in VRF ACME. pe1.sin finds next hop pe1.ams and VPN label 92001, resolves the LSP, and pushes two labels: 24017 on top, 92001 beneath, TTL 63. Eight bytes, against VXLAN's 50. p1.sin reads only the top label and swaps it to 24031. p1.ams pops it, exposing 92001. pe1.ams reads 92001, its own label for VRF ACME, pops it, and routes to acme-db1 with TTL 60. The P routers never read 10.1.2.20, just as Meridian's spines never read a VXLAN packet's inner header.

EVPN was written in 2015 for MPLS networks, aimed at VPLS, the older layer-2 VPN that learned MACs by flooding. It moved MAC learning into BGP with L3VPN's machinery unchanged: VRFs, unique distinguishers, route targets, reflectors. Later the same routes learned to describe VXLAN tunnels. The VPN label became the VNI in the route's MPLS label field, and the LSP became an outer IP header to the VTEP. A leaf receiving a type-5 route with VNI 50001 does what pe1.sin does with label 92001. Only the wrapper differs.

## Segment routing over MPLS

LDP and RSVP-TE both agree labels with a protocol that must stay in step with the IGP. Segment routing removes that layer. The IGP itself advertises a few global identifiers, and the ingress writes the path into the packet as a list of segments. Over MPLS, a segment is a label.

A prefix SID means "towards this prefix by the shortest path", advertised in IS-IS as an index: 241 for pe1.ams, unique across the domain. Each router reserves a label block, and its label for a prefix is its block's base plus the index. With the common block starting at 16000, index 241 is label 16241 everywhere. An adjacency SID is local: out of this specific link. No extra protocol, and the VPN layer is unchanged.

Now move p1.ams to a block starting at 20000. Does the path break?

[pause]

No. p1.sin swaps 16241 for 20241, computing its neighbour's label from the neighbour's advertised block. The index is global; the label is global only if every block matches, which is why operators standardise it.

Traffic engineering becomes a segment list at the head end. For tunnel B over circuit 2, pe1.sin pushes the SID of the Singapore end of circuit 2, its adjacency SID for that circuit, 16241, then the VPN label. Four labels, and no state beyond the head end; bandwidth accounting moves to a controller, or nowhere. Segment routing also brings TI-LFA, precomputed repair with full coverage.

The limits are in the packet: 4 bytes per segment, and a chip pushes only three to a dozen labels in one pass. The classic break is two routers given one index: one wins, and the other loopback silently loses its segment. Check uniqueness before every change.

## SRv6: the segment is an IPv6 address

SRv6 keeps segment routing and drops MPLS. A segment is an IPv6 address: a locator, a prefix that leads to one router, plus a function. pe1.ams might allocate one meaning "decapsulate and look the inner packet up in VRF ACME", replacing both the transport and the VPN label.

With one segment, the P routers need only IPv6 routing: like VXLAN, the core forwards on an outer IP address. To steer further, a segment routing header lists the segments, 16 bytes each, and two segments cost 80 bytes against 8 for two labels. The gains: one data plane, entropy in the IPv6 flow label, and segments a Linux host can push. The caveats: uneven hardware support, and SRv6 must be filtered at the edge, because a segment is an address anyone could target.

## Backbones choose MPLS, data centers choose VXLAN

Both designs make one move: a tenant identifier plus an address for the far edge, over a core that reads only the outer part. On a 128-byte packet, two labels add under 5 percent on the wire and VXLAN about 30. On a 9,000-byte jumbo frame, both stay under 1 percent. On ocean-crossing circuits leased by the gigabit, a few percent is money. Inside a data center it barely registers.

In a data center the deciding factor is the endpoints. Servers and SmartNICs encapsulate VXLAN, almost nothing on a host speaks MPLS, and any IP switch can join. On a backbone it is traffic engineering, fast reroute in about 50 milliseconds, and decades of L3VPN service. Networks needing both stitch them with EVPN gateways between sites and WAN.

Tooling should show, per core link, IGP, LDP and sync state together; per PE pair, both directions, a tested label path rather than a ping; path MTU with the deepest stack, because a core too small for the labels drops full-size packets while TCP hangs after the handshake; and load per ECMP member, because hashing on labels alone shows as one hot link.

## In the interview

"MPLS or VXLAN for a new data-center fabric? And for the WAN?"

[pause]

Same idea, different wrapper. In the data center, VXLAN: any IP fabric carries it, hosts can be endpoints, the UDP source port gives entropy, and 50 bytes hardly matter in jumbo frames. On the WAN, MPLS, now usually segment routing: small overhead, traffic engineering, 50-millisecond protection, existing VPN services. The wrong answer is "MPLS is faster because label lookups are cheaper". True of 1997 hardware, not today's.

The follow-up: what does segment routing remove? LDP and RSVP-TE, so no label protocol drifts from the IGP and the core holds no tunnel state. It costs label depth, index discipline, and bandwidth awareness, which moves to a controller. The wrong answer is "it removes MPLS": only SRv6 does that.

## Recap

Four things to remember. A label means something only to the router that chose it, and LSPs are one-way, so test both directions. A VPN route is only as good as the LSP to its next hop, which is why summarising PE loopbacks hides every route behind them while ping still works. L3VPN is EVPN's ancestor, with the VPN label turned into a VNI. And segment routing removes the label protocols, SRv6 removes MPLS, and the MPLS or VXLAN choice comes down to endpoints, overhead and traffic engineering.

At your desk: the label encoding and its decode, the label-switching code, the LDP and RSVP-TE tables, the VPNv4 route and the hop-by-hop walk, the two visualisations, the overhead and comparison tables, the failure modes, and the platform checks.
