---
lesson: the-overlay-packet-walk
source: 0957ce3a60dd0c13
fit: partial
desk:
  - "The overlay packet walk visualisation, acme-web1 to acme-web2, and its route-target leak variant"
  - "The who-knows-what table and the illustrative EVPN route on leaf1.ams, field by field"
  - "The encapsulation table, field by field, and the eight VXLAN bytes"
  - "The packet on every link table"
  - "The Python walk model, its two runs and the audit output"
  - "The routed variant table and the where-the-time-goes table"
  - "The leaked routes on leaf2.sin and the trade-offs table for stretching a tenant across sites"
  - "Practice problems: unresolvable next hops, and config drift"
---
## Introduction

"A host on a leaf in Amsterdam sends to a host on a leaf in Singapore, same tenant, same subnet. Walk me through every lookup." It tests whether VXLAN, EVPN and multi-tenancy have become one picture in your head. The weak answer is "VXLAN carries it across". The strong answer names nine lookups on five devices, says which table each one reads and which protocol filled it, and describes the headers on every link.

Then the follow-up: "Everything is green, but Acme's traffic is arriving at another customer's server. Where do you look?"

So, three parts. One packet, walked from acme-web1 behind leaf1 in Amsterdam to acme-web2 behind leaf2 in Singapore. Then the same fabric broken by a configuration copied from one leaf to another. Then the checklist that finds it. The example is small: two spines per site.

## Before the first packet

A packet walk is a walk through tables, so start with what each device already knows, and from whom.

The control plane has already run. When acme-web2 first sent a frame, leaf2 in Singapore learned its MAC on a local port and its IP from its ARP. It advertised both in an EVPN type-2 route, the route that says "this MAC, and this IP, live behind this VTEP in this segment". Singapore's two route reflectors passed it to Amsterdam's, which reflected it to every Amsterdam leaf. Nobody changed the BGP next hop on the way, so it still names leaf2.sin's VTEP address, its loopback, 10.255.2.12.

That route carries three things. A route distinguisher, 10.255.2.12 colon 10100, which only makes the route unique inside BGP. A route target, 65000 colon 10100, which is policy: every leaf whose VNI 10100 imports that tag installs it. And a label, the VNI to put in the header.

The spines hold no tenant MAC, IP, VNI or EVPN route, only IS-IS's route to every loopback. In this example the metric is 10 on links inside a site and 1,000 on each long-haul circuit, so leaf1 in Amsterdam reaches 10.255.2.12 at a cost of 1,020, through either of its spines.

## Amsterdam: an ARP that goes nowhere, and a tunnel

acme-web1 sends 1,460 bytes of data on an established HTTPS connection: a 1,500-byte IP packet, time to live 64.

Lookup 1 is the host's own routing table. acme-web2's address is in acme-web1's connected subnet, so no router is involved, and the frame must go to acme-web2's own MAC. That the destination is 10,500 kilometres away is invisible to the host.

Lookup 2 is ARP. The host broadcasts "who has 10.1.1.11?". An overlay would normally flood that to every VTEP carrying the segment, across the circuit too. Instead leaf1 runs ARP suppression. It already pairs that IP with acme-web2's MAC, taken from the IP half of the type-2 route, so it answers on acme-web2's behalf and the request goes no further.

How it breaks: a host that has never spoken has no IP in any route, so ARPs for it flood to every VTEP in both sites after all. The signal: suppression misses, and broadcast traffic per VNI on the circuits.

The next three lookups happen inside leaf1, in one pass through the switching chip. Lookup 3, the port map: the frame arrived untagged on a port in VLAN 100, which on this leaf is VNI 10100. That is the tenant boundary. Lookup 4, the MAC table for VNI 10100: acme-web2's MAC sits behind remote VTEP 10.255.2.12, from that type-2 route. Lookup 5, the underlay table: 10.255.2.12 is a BGP next hop, so the leaf resolves it recursively through IS-IS, finds two spines at 1,020, and the hash of the outer headers picks spine1.

Then leaf1 builds the tunnel. Eight bytes of VXLAN header carrying VNI 10100. Eight bytes of UDP, destination port 4789, which tells the far leaf "this is VXLAN", and a source port of 58479, a hash of the inner headers. Twenty bytes of outer IP, from leaf1's VTEP to leaf2's. Then outer Ethernet.

Here are the two numbers to derive. The source port is constant for one inner flow, so a connection is never reordered, and different between flows, so flows between the same two leaves spread over spines. Without it, everything between leaf1 and leaf2 would share one outer five-tuple and one spine. And the outer packet is 1,550 bytes: the 1,514-byte inner frame plus 36 bytes of headers. A single underlay link at 1,500 drops it, because VTEPs may not fragment and switch chips do not fragment at line rate. That is why Meridian's fabric links run 9,216.

## Across the spines and out

Lookup 6 is spine1 in Amsterdam. It parses the outer Ethernet and IP headers, stops, and does a longest-prefix match on 10.255.2.12, like any IP packet.

Before I tell you: which path does it pick, its own circuit, or the detour through its sister spine?

[pause]

Its own circuit. Straight over to spine1 in Singapore and down costs 1,010. Down to a leaf, up to spine2, over the second circuit and down costs 1,030. Only the cheaper path is installed. The spine decrements the outer time to live to 63, rewrites the outer MACs and transmits. Everything inside leaves exactly as it came in.

Then the circuit: 10,500 kilometres at about 5 microseconds per kilometre, roughly 52.5 milliseconds one way.

Lookup 7 is spine1 in Singapore. The loopback is one hop away, metric 10. Outer time to live 62, outer MACs rewritten again, nothing else touched.

This is why the spines need no BGP and no tenant state. In the BGP black hole, a middle router without the customer's route dropped the packet. Here the middle routers only ever look up a loopback that IS-IS already gave them. The price: the tenant's packet is only as good as the underlay route to one host address.

Lookup 8 is leaf2 in Singapore checking the tunnel. The outer destination is its own VTEP, port 4789 says VXLAN, and VNI 10100 maps to its local VLAN 100. Some platforms also drop tunnel packets from VTEPs they do not know. Then it strips all 50 bytes of outer headers.

Lookup 9 is its MAC table: acme-web2 is on a local port. leaf2 does not learn acme-web1's MAC from this frame; with EVPN, remote MACs come from BGP, not from traffic. It bridges the frame out with the inner time to live still 64, because nothing routed it.

So the per-hop rule of a plain routed walk holds one level out: the outer MACs change on every link and the outer time to live falls at every spine, while the inner frame rides untouched, like a parcel in a box. A traceroute from acme-web1 shows one hop: the destination.

If the destination were in a different subnet, symmetric routing would add lookups at the two leaves, with Acme's routing VNI, 50001, on the wire, and none in the middle. And the time: five devices add perhaps 10 microseconds, the circuit 52,500. The round trip is at least 105 milliseconds whatever the overlay does, so ten sequential cross-site calls cost more than a second.

## The leak: a copied config

The rule to hold: route distinguisher unique per leaf per segment, route target unique per tenant segment. The distinguisher makes routes distinct. The target decides who imports them.

Now the incident pattern. An engineer provisions Globex on leaf2 in Amsterdam by copying Acme's tenant configuration from leaf1 and editing it. The VNIs are changed to Globex's, 10200 and 50002. The route distinguishers and route targets are not. The push succeeds, every BGP session stays established, every IS-IS adjacency stays up, and no interface counts an error. None of those read what the routes say.

Walk it. globex-app1 comes up on leaf2.ams, with the same IP as acme-web1, 10.1.1.10, because Globex reuses Acme's subnet. Its type-2 route carries leaf1's distinguisher, Acme's route target, and, correctly, label VNI 10200. To every other router, this is an Acme route.

Reflectors check loops, not ownership, so it travels on. The duplicate distinguisher hides nothing yet, because a type-2 route's key includes the MAC, and the two MACs differ. The route target does the damage. leaf2 in Singapore imports it, because 65000 colon 10100 is exactly what Acme's segment imports. Now two MACs claim 10.1.1.10, and in this example the newer one, Globex's, wins the suppression table.

acme-web2 ARPs for its colleague acme-web1. leaf2.sin answers locally with Globex's MAC; the host has no way to tell. acme-web2 sends its data, and leaf2.sin tunnels it to leaf2.ams with VNI 10200, the VNI the leaked route asked for, in a perfectly valid header. leaf2.ams delivers Acme's data into Globex's VLAN, to a Globex server. That server owns the same IP, accepts the packet, has no such connection, and typically answers with a TCP reset. Acme sees "connection reset", not a timeout.

The import side was copied too, so it leaks both ways: Globex's segment on leaf2.ams fills with Acme MACs, while Globex's other leaves never see globex-app1 at all.

And the duplicate distinguisher bites where keys do collide: type-5 prefix routes. Both tenants announce 10.1.1.0 slash 24 under the same distinguisher, so the reflector sees one route from two next hops, runs best path, and reflects only the winner. Everything ties until the router ID step, where the lower originator, leaf1, wins. Globex's prefix silently disappears from every other leaf.

## Finding it, and what the platform should show

The checklist runs from the outside in.

First, scope: which tenant, which hosts, which sites, since when, and what changed. "Acme reaching the wrong server since yesterday's Globex provisioning" is half the answer already.

Second, the underlay. Probe between the two VTEPs in both directions, at 1,550 bytes with don't-fragment set, from many source ports so every spine is crossed. Small probes pass and large ones fail: MTU. Some source ports fail: one spine or one link. Rule it out first, because when the underlay is broken, everything above it lies.

Third, read the routes, not the sessions. For 10.1.1.10 in VNI 10100, list every type-2 route with its distinguisher, target, next hop and label. A route can be in BGP and still not installed: it must be best, match a local import, carry a valid encapsulation and VNI, resolve its next hop, and fit in hardware. Each is a separate answer to "why is it missing".

Fourth, the local tables on both leaves.

Fifth, intent: compare distinguishers, targets and VNIs on each leaf with the source of truth. That is where the fix is: restore leaf2.ams's own distinguishers and Globex's targets. The leaked routes go within seconds, but acme-web2's ARP cache holds the wrong MAC until it re-resolves, seconds to a minute on Linux; a gratuitous ARP from acme-web1 usually corrects it at once.

On leaf2.sin, step three shows the smoking gun: one distinguisher from two next hops, one IP with two MACs, and a route in segment 10100 asking for VNI 10200. Each is impossible in a correct Meridian fabric, and cheap to compute from data the fabric already exports.

So the platform should show the lookup chain for any pair of hosts, evaluate those route invariants continuously, probe at full size between every pair of VTEPs, and refuse a push that duplicates a distinguisher or reuses another tenant's target. And a circuit-down alert should carry the headroom: with one circuit gone, everything crosses the other at half the capacity.

## In the interview

One the lesson asks: why does the outer UDP source port change between flows, while the destination port never does?

[pause]

Port 4789 tells the egress VTEP the payload is VXLAN. The source port is a hash of the inner headers, because the outer IPs are the same for every flow between two leaves, and without that entropy they would all hash onto one spine. It is stable per inner flow, so one TCP connection is never reordered. The common wrong answer: "it's an ephemeral port, like a client socket uses".

And: latency between Amsterdam and Singapore went from 106 to 112 milliseconds round trip overnight. Is it the overlay?

[pause]

No; encapsulation costs nanoseconds. Six milliseconds round trip is three each way, about 600 kilometres more fibre, so either the carrier switched to a protection path or traffic now takes the other circuit. Whether the carrier rerouted is a question for the provider, but the per-circuit probe baselines should already show which circuit changed.

## Recap

Five things to remember. Nine lookups on five devices: the host's table, ARP answered from EVPN, the port map, the MAC table, the underlay route, two spines, then the far leaf's tunnel check and MAC table. EVPN state is read at the edges and IS-IS state at every hop; the spines read one field, the outer destination IP. The outer MACs and time to live change per hop while the inner frame rides untouched, at 1,550 bytes, across 52.5 milliseconds of fibre that dwarfs every lookup. A copied route target leaks type-2 routes into another tenant, and a duplicated distinguisher hides type-5 routes, all with every session up. And debug from the outside in: scope, underlay, route content, local tables, intent.

At your desk: the packet walk visualisation and its leak variant, the who-knows-what and encapsulation tables, the packet on every link, the Python model and its audit, the routed variant and timing tables, the leaked routes and trade-offs, and the unresolvable next hops and config drift problems.
