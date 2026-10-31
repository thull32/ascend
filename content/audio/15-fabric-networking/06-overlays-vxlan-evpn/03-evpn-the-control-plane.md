---
lesson: evpn-the-control-plane
source: f4fbafa307c5fd48
fit: partial
desk:
  - "The EVPN MAC-learning visualisation and its MAC-move variant"
  - "The extended-community table, the five-route-type table and the field tables for types 2, 3 and 5"
  - "The Python route builder and parser, with its byte dump read field by field"
  - "The receive-pipeline diagram and the VRF ACME routing table on leaf2.sin"
  - "The RD and route-target field tables"
  - "The MAC mobility simulator and its cloned-VM trace"
  - "The Linux bridge, neighbour and BGP output on leaf2.sin"
  - "The failure-modes table, the trade-offs table and the platform audit code"
---
## Introduction

A VXLAN tunnel can carry a tenant's frame from one leaf to another, but someone has to tell the ingress leaf which leaf. Plain VXLAN answers the way an Ethernet switch does: flood the first frame to every leaf in the segment, and learn from whatever comes back. On a segment spread over 50 leaves and two continents, every ARP request reaches all 49 other leaves, and a host that moves stays pointed at its old leaf until it speaks, or until a five-minute timer expires.

EVPN, Ethernet VPN, replaces that guessing with a control plane. A leaf that learns a host on its own port tells every other leaf, in a BGP route: this MAC, with this IP, lives behind my VTEP, in this segment. Remote leaves install the location before the first frame is sent, answer ARP on the host's behalf, and learn about a move from a sequence number rather than a timer.

Here is the sentence to hold onto. Learning on a leaf's own ports stays in the data plane; learning across the fabric happens only through routes. A remote leaf never learns a MAC from a decapsulated frame.

Coming up: one MAC followed to every leaf, the three route types that matter most, route distinguishers and route targets, what happens when a host moves, and how a leaf answers ARP itself.

## One MAC, learned once

First, the envelope. EVPN is an address family of multiprotocol BGP, AFI 25 and SAFI 70, defined in RFC 7432 in 2015 and adapted to VXLAN by RFC 8365 in 2018. Its routes ride in ordinary BGP UPDATEs, and the next hop is the advertising leaf's VTEP address. EVPN was written for MPLS, so its routes have label fields, and over VXLAN they carry VNIs: label 1 is the layer-2 segment's VNI, label 2 the tenant's layer-3 VNI for routed traffic. Most of the rest of the meaning sits in extended communities, 8-byte tags such as the route target.

There are five route types. A fabric whose servers each attach to one leaf sends only types 2, 3 and 5: a host, a segment's flood membership, and an IP prefix. Types 1 and 4 appear only with EVPN multihoming.

Now the story. Acme's web server, acme-web1, address 10.1.1.10, boots on port 1 of leaf1 in Amsterdam and broadcasts an ARP request for its gateway. From that one frame, leaf1 learns that the MAC is on port 1 in VNI 10100, and that 10.1.1.10 belongs to it.

Leaf1 builds one type-2 route. Route distinguisher, its loopback 10.255.1.11 colon 10100. The MAC and the IP. Label 1, 10100; label 2, 50001. Route targets 65000 colon 10100 and 65000 colon 50001. It sends this to both Amsterdam reflectors.

The reflector adds its loop protection and passes the route to its other clients and to the reflector in Singapore. It installs nothing: a reflector has no VNIs and sits outside the data path. Leaf2 in Amsterdam carries only Globex, imports only Globex's route targets, and discards the route. Leaf3 and leaf4 import it. The Singapore reflector passes it on, next hop unchanged, after 10,500 kilometres: about 52 and a half milliseconds one way.

Leaf2 in Singapore imports the route, resolves leaf1's loopback through IS-IS, and writes three entries: the MAC behind leaf1's VTEP, the IP-to-MAC binding for ARP suppression, and a host route in VRF ACME through VNI 50001. Later, acme-web2 asks who has 10.1.1.10. Its leaf answers on acme-web1's behalf, and no copy leaves the leaf. Within a site, all this takes milliseconds to tens of milliseconds.

Receiving a route is not using it. A receiving leaf runs a pipeline. Does a route target match a local table? If not, discard. Is the next-hop VTEP reachable in the underlay? If not, the route is held in BGP and not installed. Is it the best route for this MAC by mobility sequence? If not, it waits as a backup. Then install, which can itself fail on a full hardware table. The BGP session stays established through every one of these stops, so each needs its own signal: for one MAC, the reflector's routes against each leaf's MAC entry and next hop.

## Floods and prefixes

Some traffic still has to be flooded: broadcasts, multicast, and unicast to a MAC nobody has advertised. Together, BUM traffic. Type 3 tells every leaf which VTEPs want a copy.

Each leaf sends one type-3 route per VNI it carries, so 16 leaves with 200 VNIs each make 3,200 routes. Receivers turn them into a flood list per VNI. In VNI 10100, leaf1 imports four, so a broadcast from acme-web1 becomes four unicast VXLAN copies. Type 3 is membership: a leaf that has the VNI but sends no type 3 never receives floods. Hosts known through type 2 stay reachable; first contact to the others fails. The signal is flood lists of different lengths on leaves that carry the same VNI.

Type 5 describes prefixes, with no MAC at all. Leaf3 advertises Acme's 10.1.2.0 slash 24 with VNI 50001 as its label. Most fabrics use the interface-less model: the receiver routes straight to the advertising VTEP in the layer-3 VNI. Type 5 does three jobs. It makes silent hosts reachable: a host that has never sent a frame has no type-2 route, but the slash 24 brings packets to a leaf that can ARP for it. It carries external routes, such as the default route the border gateways advertise. And it carries summaries between sites.

Host routes and prefixes meet in the same tenant table, and longest-prefix match picks. The subtle part: Acme's 10.1.1.0 slash 24 is connected on every Acme leaf, because the subnet is stretched, so it says nothing about which leaf holds 10.1.1.10. The slash 32 from type 2 does. And when a host goes silent and its type 2 is withdrawn, the covering slash 24 still delivers to its leaf.

Types 1 and 4, briefly, serve a server attached to two leaves through one Ethernet segment: type 4 elects which leaf forwards floods to it, and type 1 gives load balancing to both leaves and a one-message mass withdrawal. The multihoming lesson takes them apart.

## Distinguishers and targets

Two identifiers ride on every route, and interviews check that you keep them apart.

BGP keeps one best path per destination key, and a reflector reflects only its best. But tenants reuse addresses: globex-app1 is 10.1.1.10, the same as acme-web1. The route distinguisher is an 8-byte value prefixed to every EVPN route so that otherwise identical routes get different keys. It means nothing beyond that.

Meridian's rule is loopback colon VNI, unique per leaf and per segment. That matters even inside one tenant. If three Amsterdam leaves advertise the same slash 24 as type 5 with per-leaf distinguishers, that is three routes, all reflected, and traffic spreads over three next hops. With one shared distinguisher, the reflector sees one route with three paths and reflects only its best. Two paths vanish, and nothing logs an error. The signal: one distinguisher originated by two next hops. A design limit hides in the format too: the type-1 distinguisher has only 16 bits for its number, so loopback colon VNI breaks above VNI 65,535.

The route target answers a different question. The distinguisher asks, is this the same route? The target asks, who wants it? Exporters attach targets, and each table imports every route carrying one on its import list. A type-2 route carries two because it serves two tables: one for bridging in the segment, one for the host route in VRF ACME. That import filter is the isolation between tenants. Reflectors, having no VRFs, keep everything; leaves discard what they do not import.

How a target breaks: a typo in one leaf's import list. The session is up, the routes are on the reflector, and nothing is imported, so that leaf's hosts reach their local neighbours and nobody remote. The signal is zero imported routes in a VNI on one leaf while its peers hold hundreds. The target shows only in detailed output, which is why the typo hides.

## When a MAC moves

acme-web1 is live-migrated behind leaf4 in Amsterdam and announces itself with a gratuitous ARP. Now two type-2 routes exist for one MAC, with distinguishers from leaf1 and from leaf4. Before I tell you the rule: does BGP's best-path selection pick between them?

[pause]

It does not. Different distinguishers make them different routes, and best path never compares them. So RFC 7432 adds the MAC mobility extended community, carrying a sequence number.

A first advertisement carries no community, which counts as sequence 0. A leaf that learns a MAC locally while holding a remote route for it advertises one more than the highest it has seen, so leaf4 sends sequence 1. Every receiver installs the highest sequence; on a tie, the lower VTEP address wins. The old owner, seeing a higher sequence for a MAC it learned locally, flushes and withdraws its own route. And a sticky MAC, a static one like a gateway's, must never move; seeing it elsewhere is an alarm. The far site converges about one long-haul delay, roughly 53 milliseconds, after the gratuitous ARP.

A MAC that keeps moving is rarely a virtual machine on tour. Usually it is a cloned VM sharing the MAC, or a layer-2 loop. RFC 7432's defence: a leaf that sees a MAC move 5 times within 180 seconds alerts and stops advertising it.

The lesson's simulator plays out the clone, with copies behind leaf1 and leaf4 both talking. Each frame makes its leaf advertise one higher than the other, and the other withdraws: sequence 2, 3, 4, 5. At 320 seconds the fifth move inside the window freezes the MAC on leaf1, and the fabric settles on leaf4. The clone behind leaf1 is now unreachable, and that is the point: one wrong host down instead of a churning segment, and an alert naming the MAC. Many MACs moving at once means a loop.

## ARP suppression

Most broadcast traffic in a tenant segment is ARP. Over 50 VTEPs each request costs 49 copies. A boot storm of 1,000 virtual machines each resolving ten peers is 10,000 broadcasts, 490,000 packets and about 54 megabytes on the uplinks, to learn bindings the fabric already knows.

ARP suppression uses the IP field of type-2 routes. Each leaf keeps IP-to-MAC bindings per VNI and looks up every ARP request's target. On a hit, the leaf replies itself and nothing is flooded. On a miss, the request is flooded to the type-3 flood list, exactly as without suppression. IPv6 does the same for neighbor solicitations, though ND suppression often arrives later, partly because the reply must also say whether the target is a router, which the leaf learns only from an extra community.

How it breaks. A VNI where leaves learn no IPs sends only MAC-only routes, and the hit rate is zero. A stale binding answers with the old MAC after a shared address fails over. And on a switch, ARP is trapped to the CPU behind a policer, so in a storm dropped requests look like an unreachable neighbour. The signals: hit and miss counters per VNI, the share of type-2 routes carrying an IP, and policer drops.

The platform view follows. Per leaf and per VNI: routes it should import, routes imported, entries installed, each gap naming a stop in the pipeline. Flood-list symmetry. MAC location history. Distinguisher and target lint at deploy time. And data-plane probes beside route counts.

## In the interview

The question you will get: what is the difference between a route distinguisher and a route target?

[pause]

The distinguisher makes a route unique so BGP keeps routes that should coexist, with no policy meaning. The target is the policy: exporters attach it, VRFs import by it. A duplicated distinguisher hides paths or collapses tenants' routes; a wrong target silently stops imports. The common wrong answer is that both identify the VRF.

And a second: ARP suppression is on, yet ARP broadcasts still cross the fabric. Why?

[pause]

Misses are flooded by design: silent hosts, hosts known only from MAC-only routes, and on many platforms gratuitous ARPs. Measure hit and miss counters per VNI and the share of type-2 routes carrying an IP. The wrong answer is "suppression is broken, turn it off".

## Recap

Five things to remember. EVPN moves cross-fabric learning into BGP: a remote leaf never learns a MAC from a decapsulated frame. Type 2 says where a host lives, type 3 builds each VNI's flood list, type 5 carries prefixes so silent hosts and default routes work. The distinguisher makes routes unique, the target decides who imports them, and a received route must still pass import, next hop, mobility and hardware while the session stays green. MAC mobility is a sequence number, needed because different distinguishers stop BGP comparing routes, with 5 moves in 180 seconds as the duplicate alarm. And ARP suppression answers from type-2 bindings, while misses still flood.

At your desk: the MAC-learning visualisation and its move variant, the community and route-type field tables, the route builder and byte dump, the receive pipeline and tenant routing table, the distinguisher and target tables, the mobility simulator, the Linux and BGP output, and the failure, trade-off and audit material.
