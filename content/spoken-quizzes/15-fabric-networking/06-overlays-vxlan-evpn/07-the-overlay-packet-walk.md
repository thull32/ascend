---
lesson: the-overlay-packet-walk
source: 41e22a3e47123b96
---
## 1

acme-web1, behind leaf1 in Amsterdam, sends a full-size frame to acme-web2, behind leaf2 in Singapore, in the same subnet. On the circuit between spine1 in Amsterdam and spine1 in Singapore, which fields differ from what leaf1 originally put on its uplink?

A, the outer MACs and the outer time to live, both set again by spine1 in Amsterdam. B, the outer destination IP, rewritten to spine1 in Singapore's loopback. C, the outer MACs, the outer time to live and the inner time to live. D, the VNI, which each spine rewrites for its own site.

[think]

The answer is A: the outer MACs and the outer time to live, both set again by spine1 in Amsterdam.

The spine forwards on the outer destination IP only: it rewrites the outer MACs for the next link and decrements the outer time to live, patching the outer checksum. The outer IPs stay VTEP to VTEP, and the VNI, the UDP ports and the inner frame are untouched. The inner time to live falls only where the inner packet is routed, and this frame is bridged, so it stays 64 end to end.

## 2

Why does leaf1 in Amsterdam answer acme-web1's ARP for 10.1.1.11 itself, instead of flooding it?

A, the spines cache ARP replies for remote hosts in their forwarding tables. B, its suppression table holds the IP from leaf2 in Singapore's type-2 route. C, its anycast gateway owns every address in the subnet. D, leaf2 in Singapore forwards a copy of every ARP reply to all leaves.

[think]

The answer is B: its suppression table holds the IP from leaf2 in Singapore's type-2 route.

A type-2 route carries a MAC and optionally an IP. leaf1 imported leaf2's route for acme-web2's MAC with 10.1.1.11, and uses that binding to reply locally, so nothing crosses the circuit. The anycast gateway answers only for the gateway address, and the spines hold no tenant state at all.

## 3

Every flow between leaf1 in Amsterdam and leaf2 in Singapore has the same outer source and destination IP. What lets the spines spread those flows across paths?

A, the outer UDP source port, hashed from the inner headers. B, the outer DSCP value, which differs per tenant flow. C, the outer IP identification field, unique per packet. D, the VNI, which ECMP hashes as part of the outer key.

[think]

The answer is A: the outer UDP source port, hashed from the inner headers.

The ingress VTEP sets the outer source port from a hash of the inner addresses and ports, so it is constant within one flow and varies between flows, and ordinary five-tuple ECMP hashing then spreads them. Most switches do not hash on the VNI, DSCP is usually the same for a whole class of traffic, and hashing on a per-packet field would reorder packets within a flow.

## 4

Globex is configured on leaf2 in Amsterdam by copying Acme's configuration from leaf1; the VNIs are changed, but the route distinguishers and route targets are not. What actually makes Acme's segment on leaf2 in Singapore install globex-app1's MAC?

A, the route distinguisher, which makes the route look like leaf1's. B, the label VNI 10200, which leaf2 in Singapore maps into VLAN 100. C, the route reflector, which rewrites the next hop to leaf1. D, the route target 65000 colon 10100, which Acme's VNI imports.

[think]

The answer is D: the route target 65000 colon 10100, which Acme's VNI imports.

Import is decided by the route target alone: any segment importing that target installs the route. The duplicate route distinguisher does not change that, and for type-2 routes it does not even collide, because the BGP key also includes the MAC. Label VNI 10200 is what leaf2 in Singapore later puts in the VXLAN header, and the reflector leaves the next hop as leaf2 in Amsterdam's VTEP.

## 5

In that same copied-configuration incident, why does Globex's type-5 route for 10.1.1.0 slash 24 disappear from the other leaves?

A, its route target is Acme's, so the reflector drops it as a loop. B, Acme's leaves withdraw it after detecting a duplicate IP. C, type-5 routes are not reflected across sites by default. D, its route distinguisher equals Acme's, so the reflector treats both as one route.

[think]

The answer is D: its route distinguisher equals Acme's, so the reflector treats both as one route.

A type-5 route's key is the route distinguisher plus the prefix. With the same distinguisher on both, Acme's and Globex's prefixes become two paths for one key; the reflector selects one best path, here Acme's, through the lower originator, and advertises only that. Route targets play no part in loop prevention, which uses the originator ID and the cluster list.

## 6

A tenant's SSH sessions across sites log in and then hang on large output, while ping works. The fabric was extended with a new circuit yesterday. What is the most likely cause?

A, ARP suppression has a stale binding for the remote host. B, the new circuit's latency exceeds the TCP retransmission timer. C, the VNI on the new circuit is filtered by the carrier. D, the new circuit's MTU is below the 1,550 bytes VXLAN needs.

[think]

The answer is D: the new circuit's MTU is below the 1,550 bytes VXLAN needs.

Full-size 1,500-byte tenant packets become 1,550-byte VXLAN packets, and on a 1,500-byte link they are dropped, while small pings and the login exchange fit. The ICMP error goes to the VTEP's loopback, not the tenant host, so path MTU discovery cannot recover. A stale ARP binding would break small packets too, and a carrier sees only outer IP packets, never the VNI.
