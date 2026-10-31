---
lesson: why-overlays
source: 2f849ff226dca928
---
## 1

Acme, on VNI 10100, and Globex, on VNI 10200, both use VLAN 100 and the subnet 10.1.1.0 slash 24, on different leaves of Meridian's Amsterdam fabric. On a link between a leaf and a spine, what keeps their frames apart?

A, the VNI in the VXLAN header, read only by the egress VTEP. B, a separate outer UDP destination port assigned to each tenant. C, per-tenant MAC tables on the spines, learned from EVPN. D, the VLAN tag 100, which each spine uses to pick a MAC table.

[think]

The answer is A: the VNI in the VXLAN header, read only by the egress VTEP.

The VLAN tag ends at the leaf. Each leaf maps its local VLAN to a VNI, and only the VNI crosses the fabric, inside the VXLAN header. The spines route on the outer IP header and hold no tenant MACs or EVPN state, so they cannot separate tenants and do not need to. And every tenant uses the same UDP destination port, 4789.

## 2

Meridian's Amsterdam site grows from 500 to 5,000 tenants on the same 16 leaves and 4 spines. In the VXLAN and EVPN design, how does a spine's forwarding table change?

A, it stays about the same: loopbacks and link subnets only. B, it grows with the number of tenant VRFs on the leaves. C, it grows with the number of VNIs, one entry per segment. D, it grows with the number of tenant MACs in the site.

[think]

The answer is A: it stays about the same, loopbacks and link subnets only.

A spine forwards on the outer destination, a VTEP loopback, so its table holds the site's loopbacks and point-to-point links, 88 routes in the lesson's model, however many tenants ride on top. Tenant MACs, VNIs and VRFs live on the leaves, which is why leaf tables, not spine tables, become the limit as tenants grow.

## 3

A colleague argues that a fabric with only 300 tenants, each needing two segments, does not need an overlay, because 600 segments fit in 4,094 VLANs. What is the strongest counter-argument?

A, VLAN tags cannot be carried over 400 gigabit per second fabric links. B, only VXLAN supports more than 254 hosts in one segment. C, stretched VLANs bring back spanning tree and MAC learning in the core. D, the 4,094 limit applies per port, so 600 segments overflow.

[think]

The answer is C: stretched VLANs bring back spanning tree and MAC learning in the core.

The VLAN count is the least important reason for an overlay. Trunking VLANs across a leaf-spine fabric reintroduces loops that need spanning tree, which blocks most uplinks; it makes every spine learn every tenant MAC; and it turns one loop into a fabric-wide storm. Segment size and link speed have nothing to do with tagging, and the 4,094 limit applies across a whole bridged domain, not to each port.

## 4

Between acme-web1 in Amsterdam and acme-web2 in Singapore, pings and SSH logins work, but large file transfers stall. Every EVPN session is up. What is the most likely cause?

A, spine1.ams dropping packets whose inner TTL has reached zero. B, a missing EVPN route for acme-web2's MAC on leaf1.ams. C, the 52.5 millisecond one-way delay between the sites timing out TCP. D, an underlay link whose MTU is below 1,550 bytes.

[think]

The answer is D: an underlay link whose MTU is below 1,550 bytes.

VXLAN adds 50 bytes, so a full-size 1,500-byte packet needs 1,550 bytes in the underlay, and VTEPs do not fragment tunnelled packets. Small packets fit and large ones are dropped, which is exactly "logins work, transfers stall". A missing MAC route would break small packets too, distance adds delay but not size-dependent loss, and spines never read the inner TTL.

## 5

Every BGP EVPN session in the Singapore site is Established, and leaf1.ams still lists acme-web2's MAC behind 10.255.2.12, yet all traffic to hosts on leaf2.sin is lost. Where should you look first?

A, whether the outer UDP source ports have stopped varying. B, whether the route reflectors are forwarding the packets. C, whether the VNI-to-VLAN map on leaf1.ams changed. D, whether 10.255.2.12 slash 32 is in the underlay table.

[think]

The answer is D: whether 10.255.2.12 slash 32 is in the underlay table.

The overlay entry exists, so the overlay control plane is fine; it is only usable if its next hop, leaf2.sin's loopback, resolves in the underlay. A lost IS-IS adjacency or an unadvertised loopback leaves the EVPN table intact and forwards nothing. Route reflectors are never in the data path, and a mapping or hashing problem would not take out every host behind one leaf at once.
