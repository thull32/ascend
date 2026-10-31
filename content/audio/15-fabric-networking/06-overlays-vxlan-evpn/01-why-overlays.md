---
lesson: why-overlays
source: 717ad15df955c3a0
fit: great
desk:
  - "The broadcast storm visualisation on a three-switch triangle"
  - "The tenant-placement model code and its table for 500, 1,500 and 5,000 tenants"
  - "The VLAN-to-VNI table, the underlay versus overlay table and diagram, and the parcel table"
  - "The VXLAN encapsulation visualisation from leaf1.ams to leaf2.sin"
  - "The leaf, spine, reflector and gateway state table, the illustrative Linux VTEP output and the ASIC lookup chain"
  - "The trade-offs table of ways to give tenants segments"
---
## Introduction

Acme rents servers from Meridian in two places. acme-web1, 10.1.1.10, sits behind leaf1.ams in Amsterdam. acme-web2, 10.1.1.11, sits behind leaf2.sin in Singapore. Acme wants both in one subnet, on one Ethernet segment, so a virtual machine can move between them without changing its address. Globex, another tenant, uses the same subnet and the same VLAN number, 100, and must never see a single Acme frame.

Meridian's fabric wants the opposite. Every link between a leaf and a spine is its own routed slash 31, every device is a router, and layer 2 ends at the server port. That is what makes the fabric fast to converge, safe from loops, and able to use every link at once. A tenant asking for one Ethernet segment across 10,500 kilometres of fibre is asking a routed fabric to behave like a switch.

An overlay resolves the conflict. The fabric stays routed. The tenant's frame is wrapped in a new header at the first leaf, carried across as an ordinary IP packet, and unwrapped at the last leaf. Coming up: why stretching VLANs fails, underlay versus overlay, a tunnel pictured as a labelled parcel, and which state lives on leaves and which on spines.

A tenant, a customer with its own slice of the network, asks for two things. One is a layer-2 segment: one broadcast domain, hosts reaching each other by MAC address. Live migration keeps a virtual machine's IP and MAC, so its connections survive only if the subnet exists at the new host. Clusters that elect a leader by broadcast heartbeat do not work across a router. And a bare-metal customer keeps its subnets rather than renumbering hundreds of servers.

The other is a wall: Acme's frames never reach a Globex port, and both can use 10.1.1.0 slash 24 at once. On one switch, VLANs build the wall, because the MAC table is keyed by VLAN and MAC together; overlapping IP addresses also need separate routing tables, VRFs, which have their own lesson in this module. And one cost: a segment is a failure domain. A loop inside it affects every port in it, wherever those ports are.

## Stretching VLANs, and the 4,094 limit

In the routed fabric, IS-IS gives every leaf four equal-cost paths to every other leaf and ECMP hashes each flow onto one. A dead spine costs a quarter of the capacity, and a routing loop is bounded, because every IP packet carries a TTL.

Now give Acme its segment the old way: VLAN 100 on every leaf and spine, trunked over every link. Three things go wrong. First, the loops come back. A leaf-spine fabric is full of them, Ethernet frames have no TTL, and a broadcast in a looped VLAN circles forever. Spanning tree cures it by blocking ports: Amsterdam's 20 switches keep 19 of their 64 leaf-spine links, so about 70 percent of the capacity sits idle. Second, a spine that bridges every VLAN learns every MAC in the site, and hardware MAC tables top out between tens of thousands and a few hundred thousand entries. Third, the failure domain becomes the whole fabric: one server with a bridging bug, and the storm reaches every switch carrying the VLAN.

Then the famous number. The VLAN ID is 12 bits: 4,096 values, minus 0 and 4095, which are reserved, so 4,094. It bites because, trunked across the fabric, 100 is a fabric-wide name, so nobody else can use it. Carriers stacked a second tag, QinQ, for about 16.7 million combinations, but the core is still bridged, learns every MAC and needs spanning tree.

VXLAN, Meridian's overlay, carries a 24-bit VXLAN network identifier, the VNI, also about 16.7 million values. The important change is not the bigger number: the VLAN stops being a fabric-wide name. Each leaf maps its local VLAN to a VNI, and only the VNI crosses the fabric. On leaf1.ams, VLAN 100 is Acme, VNI 10100. On leaf2.ams, VLAN 100 is Globex, VNI 10200.

The lesson models the Amsterdam site, 16 leaves and 4 spines, each tenant with one to five segments of 20 hosts. Before I give you the result: at 5,000 tenants, how big is a spine's table in the overlay design?

[pause]

88 routes, the same as at 500 tenants: 24 loopbacks plus 64 leaf-spine links, with no tenant term at all. The stretched design runs out of VLAN numbers between 1,000 and 1,500 tenants, and its spines hold about 30 thousand MACs at 500 tenants and 300 thousand at 5,000. The overlay's honest limit is on the leaves: at 5,000 tenants the busiest leaf has nearly 2,900 local VLANs and 58 thousand MACs, because a leaf must know which far leaf every remote host sits behind. Leaf tables become the constraint.

## Underlay and overlay

The underlay is the physical routed network. Its only job is to deliver packets between the fabric's own addresses, above all each device's loopback, a slash 32 that belongs to the device rather than a link. At Meridian that is IS-IS on every device, holding loopbacks and link subnets and nothing a tenant owns.

The overlay is a virtual network on top, whose links are tunnels between edge devices and whose addresses are the tenants'. VNI 10100 is logically one switch with ports on leaf1.ams and leaf2.sin, and physically a stream of IP packets between two loopbacks. The device that adds and removes the overlay header is the VTEP, the VXLAN tunnel endpoint. Every Meridian leaf is one, addressed by its loopback: leaf1.ams is 10.255.1.11, leaf2.sin is 10.255.2.12.

The underlay answers "how do I reach 10.255.2.12?" It holds tens to a few hundred routes per site and changes when links fail. The overlay answers "behind which VTEP is this MAC, in VNI 10100?" It is BGP EVPN, holds every tenant MAC and IP, and changes when hosts appear, move or leave.

They meet in exactly one place. To use an overlay entry pointing at 10.255.2.12, the leaf asks the underlay how to reach 10.255.2.12. That second lookup is recursive next-hop resolution, the same relationship BGP has with the IGP. Here is the rule to remember: the overlay is only as healthy as the underlay under it. A perfect EVPN table pointing at a loopback the underlay cannot reach forwards nothing.

It also explains why spines need no tenant routes, and at Meridian no BGP at all: unlike the BGP black hole, the middle router sees a packet addressed to a loopback it already knows.

## A parcel with labels

Picture a delivery network. A household, the tenant host, hands a sealed parcel, its frame, to the local depot, its leaf. The depot looks up the recipient's depot in its address book, EVPN, boxes the parcel with an account code, the VNI, and a depot-to-depot label, the outer IP header, and hands it to the roads. Sorting centres, the spines, read only the destination depot. The far depot opens the box and delivers the untouched parcel.

Follow one parcel. acme-web1 sends an ordinary frame to acme-web2's MAC. Same subnet, so no router is involved and the inner TTL stays at 64; it has no idea a tunnel exists. leaf1.ams maps VLAN 100 to VNI 10100 and finds the MAC behind VTEP 10.255.2.12, learned from EVPN. It adds the VXLAN header, then UDP to port 4789 with a source port hashed from the inner headers, then outer IP from its loopback to 10.255.2.12 with TTL 64, then outer Ethernet towards spine1.ams, picked by the ECMP hash. 50 bytes in all.

spine1.ams routes on the outer destination only. It drops the outer TTL to 63, rewrites the outer MACs, and sends the packet over the 10,500-kilometre circuit, about 52.5 milliseconds one way at 5 microseconds per kilometre. spine1.sin does the same, outer TTL 62, down to leaf2.sin. leaf2.sin sees its own address and port 4789, reads VNI 10100, maps it to its local VLAN 100, strips the 50 bytes, and delivers the frame to acme-web2, byte for byte what acme-web1 sent. Neither spine held a single Acme MAC or route.

The picture misleads in three places, each a real failure. The box is bigger than the parcel: a 1,500-byte tenant packet becomes 1,550 bytes in the underlay, and any link with a smaller MTU drops it, which is why Meridian runs 9,216 bytes on fabric links. Sorting centres send no notice to the household: a spine's ICMP error goes to the ingress leaf, not the tenant host, so the sender never learns why. And a wrong address book delivers to the wrong door, silently. A leaf that maps Globex's VLAN to 10100 by mistake delivers Globex frames into Acme's segment while every device reports healthy.

## Leaves, spines and reflectors

Where state lives is the picture interviewers probe. The leaf does almost everything: VLAN-to-VNI mapping, a MAC table per VNI, encapsulation, tenant VRFs and the gateway, EVPN sessions, and broadcast replication. The spine runs the underlay and forwards on the outer address. No VNIs, no tenant MACs, and at Meridian no EVPN.

So adding a tenant touches leaves only, spine silicon is chosen for ports and buffers rather than table size, and leaves carry the scale, which makes tenant placement a capacity question.

The route reflectors, rr1.ams and rr2.ams, relay EVPN routes but carry no tenant packet. Losing one changes nothing. Losing both closes every leaf's EVPN sessions, at once or when the 9-second hold timer expires; the leaves withdraw what they learned, and overlay traffic stops unless graceful restart keeps the routes for a few minutes. Out of the data path, still shared fate.

Clouds put the tunnel end in the hypervisor or a smart NIC instead. In Kubernetes, Flannel uses port 8472, the old Linux default, and a Linux VTEP created without an explicit port still listens there, so a hardware leaf sending to 4789 gets silence while both ends show the tunnel configured. And the decisive question for any design: do the core's tables grow with the tenant count? Only overlays say no.

## When it breaks

Four failures. In the first, acme-web1 can ping acme-web2 and SSH logs in, but file copies hang. Full-size packets became 1,550 bytes, and one underlay link, perhaps a port left at the 1,500 default, cannot carry them. VTEPs do not fragment VXLAN. Loopback-to-loopback pings at 1,550 bytes with don't-fragment set find the link.

In the second, every host behind leaf2.sin goes dark, yet every EVPN session is Established and leaf1.ams still lists acme-web2's MAC behind 10.255.2.12. The overlay entry is there; its next hop is not, because an IS-IS adjacency dropped or the loopback stopped being advertised. Alert on overlay next hops that do not resolve.

The third is a storm inside a VNI: a tenant bridged two of its own server ports. The core forms no loop, but the segment is still a broadcast domain, and every VTEP serving it replicates each circulating broadcast, across the ocean included. MAC-move counters climb. Storm control and duplicate-MAC detection, which by default freezes a MAC after five moves in 180 seconds, contain it.

The fourth is silent: a new Globex server on leaf4.ams reaches Acme hosts, because its leaf maps VLAN 100 to VNI 10100 instead of 10200. No protocol notices. The only check is comparing mappings with intent.

So the platform should show which leaves serve each VNI; whether every remote VTEP resolves in each leaf's underlay right now; full-size probes between VTEPs, where failure at large size only is the MTU signature; mappings diffed against the source of truth; leaf table headroom; and flood and MAC-move rates per VNI.

## In the interview

First follow-up: a spine fails. What happens to tenants?

[pause]

Nothing tenant-specific, because no tenant state lives there. Leaves drop it from their ECMP groups, its flows rehash onto the remaining spines, nothing is relearned, and capacity falls by one spine's share, a quarter in Amsterdam. Detection time is the underlay's, not EVPN's. The common wrong answer is that EVPN has to reconverge and relearn the MACs.

Second: is the VNI a security boundary?

[pause]

It is isolation, not security. VXLAN has no authentication or encryption, so anyone who can send UDP to port 4789 at a VTEP address can inject frames into the VNIs it serves, unless the VTEP checks the outer source against the VTEPs it learned from EVPN. The boundary holds only if the underlay is closed: VTEP addresses unreachable from tenants and the internet, and 4789 filtered at every edge. Confirm the exact filters with the network team, and build a check that no VTEP loopback is reachable from any tenant VRF.

## Recap

Tenants want a segment and a wall, the fabric wants routing everywhere, and an overlay gives both by tunnelling layer 2 over a routed core. The 4,094 limit matters less than what stretched VLANs do: spanning tree, every MAC on every spine, one storm everywhere. In the overlay the VLAN is local to a leaf and the VNI is the name. The overlay is only as healthy as the underlay, so watch for VTEPs that do not resolve and links that cannot carry 1,550 bytes. And tenant state lives on leaves, never spines, so a spine failure costs only capacity.

At your desk: the broadcast storm and encapsulation visualisations, the tenant-placement model, the comparison and parcel tables, the state table with the Linux output, and the trade-offs table.
