---
lesson: vrfs-and-multi-tenancy
source: cdba4368f9928600
fit: great
desk:
  - "The illustrative per-VRF routing tables on gw1.ams"
  - "The route distinguisher types table and the route distinguisher versus route target table"
  - "The L2VNI versus L3VNI table and the type-2 route field by field"
  - "The two IRB visualisations: asymmetric, bridged across in VNI 10101, and symmetric, carried in L3VNI 50001"
  - "The per-leaf state table and the centralised, asymmetric and symmetric comparison"
  - "The route leaking diagram for VRF SERVICES"
  - "The Python model of reflection and import, and its four tables"
  - "The leaking approaches table and the failure modes table"
---
## Introduction

Meridian's Amsterdam fabric carries two customers who have never heard of each other, and both chose 10.1.1.0 slash 24. Acme's acme-web1 is 10.1.1.10, behind leaf1.ams. Globex's globex-app1 is also 10.1.1.10, behind leaf2.ams. Both use 10.1.1.1 as their gateway, and every route crosses the same route reflectors.

Nothing may ever deliver an Acme packet to Globex. Yet Acme must route between its own two subnets, reach Meridian's shared DNS servers, and reach the internet.

Five mechanisms do this, and interviews probe whether you keep them apart. A VRF gives each tenant its own routing table. A route distinguisher keeps identical prefixes apart inside BGP. A route target decides which VRF installs each route. A per-tenant L3VNI tells the receiving leaf which table to route in. And the distributed anycast gateway makes every leaf answer as 10.1.1.1. Then come routing between subnets, and route leaking.

## VRFs and route distinguishers

A VRF, a virtual routing and forwarding instance, is a complete, separate routing table inside one device. Every layer-3 interface belongs to exactly one VRF, and a packet is looked up in its incoming interface's VRF. So the lookup key is the VRF plus the destination, and two routes for 10.1.1.10 coexist on one box.

Meridian's devices carry three kinds. The default VRF holds the underlay, and tenant addresses never enter it. One VRF per tenant, ACME and GLOBEX. And a management VRF, so SSH and telemetry never depend on the fabric they observe. Both tenants even use VLAN 100, because a VLAN ID is local to one switch: leaf1 maps its VLAN 100 to VNI 10100 for Acme, leaf2 to 10200 for Globex. The VNI is the fabric-wide name of the segment.

How it breaks: an interface left in the wrong VRF by a template error, or a tool that pings 10.1.1.10 in the default VRF and declares the host down. Every reachability test must name its VRF.

Between devices, the VRF no longer helps. Every tenant route travels in one BGP session from a leaf to its reflector, and BGP keys routes by the announced prefix. If both leaves announced a bare 10.1.1.10, the reflector would see two paths to one prefix and reflect only the winner. One tenant would vanish.

The route distinguisher fixes this by prepending 8 bytes to the prefix, so the route's identity becomes distinguisher plus prefix. Meridian builds every distinguisher from the device's loopback and the VNI, so Acme's host arrives keyed by leaf1's loopback, Globex's by leaf2's, and the reflectors reflect both.

Why unique per device, not per tenant? Both border gateways originate a default route into VRF ACME. With their own distinguishers those are two routes, and every leaf installs both next hops. Now copy gw1's configuration to gw2 without changing the distinguisher. The reflector sees one route, reflects one path, and every leaf learns only gw1. No alarm fires, but all of Acme's internet traffic crosses one gateway, and when gw1 fails, leaves wait for the reflector instead of switching to a path they already hold. The signal: a prefix with fewer paths than originators.

And remember this for later: the distinguisher carries no policy. Nothing reads it to decide where a route goes, and it is stripped when the route is installed in a VRF.

## Route targets

That decision is the route target's job. It is a BGP extended community, an 8-byte tag on the route. Each VRF has export targets, attached to every route it originates, and import targets: a received route is installed if it carries any of them. Meridian uses 65000 colon the VNI, so VRF ACME exports and imports 65000 colon 50001, and GLOBEX 65000 colon 50002.

The import is a set intersection, per route, per local VRF. leaf3.ams receives gw1's default tagged 65000 colon 50001. ACME imports that target, so it installs the route. GLOBEX does not, so it ignores it.

Here is the rule in four words: RD unique, RT shared. The distinguisher is unique per device and VRF, so paths stay distinct through the reflectors. The target is the same everywhere for one tenant, and it alone decides installation.

The worst target mistake is quiet. An engineer builds Globex's VRF on a new leaf by copying Acme's: the name, the VNIs and the distinguisher are changed, the import target is not. Before I tell you: does the unique distinguisher keep Acme's routes out?

[pause]

It does not. GLOBEX now imports 65000 colon 50001, so Acme's routes land in it while every session stays Established. And it is a data-plane failure. On a platform that encapsulates with the route's own label, Globex packets on those paths arrive in Acme's L3VNI and are routed in VRF ACME: a real cross-tenant leak. On one that uses its local L3VNI, they reach Acme's leaves in Globex's VNI, where nothing can deliver them: a black hole.

## Two kinds of VNI, and one gateway

An L2VNI is a stretched layer-2 segment, one per tenant subnet: 10100 and 10101 for Acme's two subnets, 10200 for Globex. Frames within one subnet travel in it and are bridged at both ends, with no TTL change and with flooding.

An L3VNI is one per tenant VRF: 50001 for Acme, 50002 for Globex. No host is attached to it, nothing is flooded in it, and it carries only packets a leaf has already routed. Its job is a label. When leaf3 decapsulates a packet with VNI 50001, its map says: route this in VRF ACME.

So a host's type-2 route carries both. The route leaf3 sends for acme-db1 has label 1, the L2VNI 10101, for leaves that bridge to it, and label 2, the L3VNI 50001, for leaves that route to it. It also carries leaf3's router MAC, the inner destination of routed packets.

How it breaks: VRF ACME mapped to 50001 everywhere but to 50010 on one leaf, a typing error. That leaf sends Acme's routed packets in a VNI nobody else maps to a VRF, and they are dropped, while bridged traffic and every session stay up. The signal is unknown-VNI decapsulation drops on the receiving leaves.

Now the gateway. Every leaf with a port in Acme's VLAN 100 owns 10.1.1.1 with the same MAC, so a host's own leaf answers its ARP and routing happens at the first hop.

The shared MAC matters most when a host moves. acme-web1, a virtual machine, migrates live from leaf1 to leaf4 and keeps its cached gateway entry. leaf4 owns that MAC too, so it routes the very first packet, and advertises the host with a higher MAC mobility sequence number so the old route is withdrawn. With per-leaf gateway MACs, the host would keep sending to leaf1's MAC, bridged back across the fabric, and since a live TCP connection keeps confirming the ARP entry, that hairpin can last as long as the connection.

## Routing between subnets

IRB, integrated routing and bridging, means the leaf both bridges within a subnet and routes between subnets. acme-web1 on leaf1, VLAN 100, opens a TCP connection to acme-db1, 10.1.2.20, on leaf3, VLAN 200. Some leaf must route the SYN, and there are two designs.

In asymmetric IRB, every leaf with Acme hosts carries every Acme subnet, and there is no L3VNI. The SYN arrives at leaf1 with TTL 64. Leaf1 has a gateway on 10.1.2.0 too, so the destination is directly connected, and its ARP table gives acme-db1's MAC. It rewrites the frame to that MAC, drops the TTL to 63, and bridges it into VNI 10101 towards leaf3. Leaf3 decapsulates and simply bridges. acme-db1 sees TTL 63. The reply travels in 10100: each direction uses the destination's L2VNI, hence asymmetric.

In symmetric IRB, each leaf carries only its local subnets, plus one L3VNI per tenant. Same SYN. Before I tell you: which VNI crosses the spine, and whose MAC is inside?

[pause]

VNI 50001, and leaf3's router MAC. Leaf1 routes in VRF ACME and finds a host route for 10.1.2.20, installed from leaf3's type-2 route: next hop leaf3, label 50001, leaf3's router MAC. It drops the TTL to 63 and writes an inner header from its own router MAC to leaf3's. It never needs to ARP for acme-db1. The spine forwards on the outer address and holds no Acme route at all. Leaf3 reads 50001, which its map ties to VRF ACME, sees its own router MAC, and routes again: TTL 62, and a last header from the gateway MAC to acme-db1. The reply also travels in 50001.

Both forward at line rate. What decides large fabrics is state. Take Acme with 20 subnets over 16 leaves, each subnet on 4 leaves, 960 hosts. Asymmetric: every leaf provisions all 20 subnets and holds 960 MAC, ARP and rewrite entries. Symmetric: 5 local subnets plus the L3VNI, 240 MAC entries, and about 900 host routes for remote hosts.

So symmetric does not shrink the routing table. It removes per-host rewrite entries, which live in a scarce ASIC table: the 720 hosts in subnets a leaf does not serve share 15 of them, one per remote leaf. And a new subnet is a change on its 4 leaves, not all 16. That is why symmetric IRB is the default in large EVPN fabrics.

## Route leaking

Route leaking is the deliberate installation of a route from one VRF into another. In EVPN, it is the target mechanism used on purpose: import another VRF's target, with a filter.

Meridian runs a VRF SERVICES on leaf16.ams, holding 10.100.0.0 slash 24 with its DNS server. ACME additionally imports SERVICES' target, filtered to that one prefix, and SERVICES imports Acme's target, filtered to Acme's prefixes, so replies have a way back. Two rules keep it safe. Filter every import, or anything SERVICES exports lands in ACME. And never re-export imported routes, or Globex, which also imports SERVICES, would learn Acme's routes through it.

Then the overlap trap. Give Globex the same service, and SERVICES receives 10.1.1.10 from both tenants. BGP carried both, since their distinguishers differ. But a VRF table has no distinguisher, so in SERVICES they are two paths to one prefix. Best path picks one, and the DNS server's answers to one tenant go to the other tenant's host. A table that serves several tenants cannot hold their overlapping addresses. The fixes: NAT in front of the shared service, addresses unique across tenants for anything shared, or a firewall with one interface per tenant VRF.

The internet works the same way at the border. Each tenant VRF on the gateways has its own sub-interface and BGP session towards a NAT and firewall layer, and its own default route originated into EVPN with that tenant's target. The NAT translates Acme to Acme's public pool and Globex to Globex's, so return traffic to an Acme pool address re-enters VRF ACME, never GLOBEX, though both inner destinations may be 10.1.1.10. And a gateway that loses both ISP sessions must withdraw its default, or it black-holes half of every tenant's internet traffic with every fabric session up.

What should the platform show? A tenant reachability graph computed from configuration: whose export targets meet whose imports, diffed against intent. For every installed route, the VRF its L3VNI maps to; a GLOBEX route labelled 50001 is the copied-target incident, found from state alone. And probes inside each tenant VRF, including tests that must fail, Acme to Globex, so isolation is measured, not assumed.

## In the interview

A principal engineer asks: what is the difference between a route distinguisher and a route target?

[pause]

The distinguisher is part of the route's identity, 8 bytes prepended to the prefix so identical prefixes stay separate inside BGP, and it carries no policy. The target is an extended community that is pure policy: a VRF installs a route carrying one of its import targets. The common wrong answer is that the distinguisher identifies the route's VRF, which leads people to believe a unique distinguisher prevents leaks.

A follow-up: a tenant says they can reach another tenant's server. Scope first, one leaf or every leaf. Then the tenant's VRF table: any route whose L3VNI belongs to another tenant, the import that let it in, and every device built from the same template. Packet captures on the spines are the wrong answer: they see only outer headers.

## Recap

Four things to remember. A VRF keys every lookup on the VRF plus the address, and the L3VNI in the packet tells the receiving leaf which VRF to use. RD unique, RT shared: the distinguisher keeps paths distinct through the reflectors, the target alone decides installation, and a copied import target leaks or black-holes a tenant while every session stays up. Symmetric IRB routes at both leaves, crosses in the tenant's L3VNI with router MACs inside, and arrives two TTL lower; it wins on state, not speed. And never put overlapping tenants into one shared table: hand each VRF off separately, with its own NAT pool.

At your desk: the per-VRF route output, the distinguisher, target and VNI tables, the type-2 fields, the two IRB visualisations, the state tables, the leaking diagram, the Python model, and the failure tables.
