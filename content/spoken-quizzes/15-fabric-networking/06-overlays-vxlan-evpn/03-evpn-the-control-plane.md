---
lesson: evpn-the-control-plane
source: 113a3bf218c1dd7d
---
## 1

Leaf2 in Amsterdam, which carries only the tenant Globex, receives acme-web1's type-2 route from the reflector and does not install it. Why?

A, its route targets, 65000 colon 10100 and 65000 colon 50001, match no import list on that leaf. B, its next hop, leaf1's address 10.255.1.11, cannot be resolved through the Amsterdam underlay. C, the reflector marked it with a cluster list that the leaf rejects as a loop. D, its route distinguisher, 10.255.1.11 colon 10100, is not configured on that leaf.

[think]

The answer is A: its route targets match no import list on that leaf.

Import is decided by route targets. The Globex leaf's tables import only Globex's targets, 65000 colon 10200 and 65000 colon 50002, so it discards the route. The distinguisher only makes the route unique and is never matched against local configuration. The cluster list holds the reflector's cluster ID, not the leaf's, so there is no loop, and leaf1's address is reachable through IS-IS.

## 2

After acme-web1 migrates, leaf2 in Singapore holds two type-2 routes for its MAC. One has the distinguisher from leaf1, 10.255.1.11, and no MAC mobility community. The other has the distinguisher from leaf4, 10.255.1.14, and sequence 1. Which does it install, and why?

A, both, load-balanced, because different distinguishers make them equal-cost paths. B, the one from leaf1, because the lower VTEP address breaks the tie. C, the one from leaf1, because BGP prefers the older and more stable route. D, the one from leaf4, because sequence 1 beats an absent community, which counts as 0.

[think]

The answer is D: the one from leaf4, because sequence 1 beats an absent community, which counts as 0.

The highest sequence wins, and the lower-address rule applies only when sequences are equal. BGP best path never compares the two, because their distinguishers make them different routes, which is exactly why the sequence number exists. Load-balancing one MAC across two single-homed leaves would deliver half the frames to a leaf the host has left.

## 3

On one VNI, ARP suppression is enabled on every leaf, yet its hit counter stays at zero, while type-2 routes for all its hosts are present. What is the most likely cause?

A, the type-2 routes are MAC-only, because the leaves learn no IP bindings in that VNI. B, the VTEPs are in different sites, so suppression answers only inside one site. C, the type-3 routes for the VNI use ingress replication rather than multicast. D, the VNI's route targets are auto-derived instead of configured by hand.

[think]

The answer is A: the type-2 routes are MAC-only, because the leaves learn no IP bindings in that VNI.

Suppression answers from IP-to-MAC bindings carried in MAC and IP routes. A leaf with no gateway interface or ARP snooping in that VNI learns only MACs and sends MAC-only routes, so there is nothing to answer from. The replication mode affects how misses are flooded, not hits; auto-derived targets still import; and bindings are installed from routes regardless of site.

## 4

Leaf4 in Amsterdam carries VNI 10100 but has stopped sending its type-3 route. What do you expect to see?

A, all traffic to leaf4's hosts stops, because the VTEP is withdrawn. B, other leaves stop sending it floods, so new ARP requests for its hosts fail. C, nothing, because type-2 routes already tell other leaves where its hosts are. D, duplicate frames at leaf4's hosts, because floods arrive by two paths.

[think]

The answer is B: other leaves stop sending it floods, so new ARP requests for its hosts fail.

Type 3 is how a leaf joins a VNI's flood list. Without it, no other leaf sends it broadcasts or unknown unicast, so ARP requests for its hosts that miss suppression never arrive, while flows to hosts already known through type-2 routes keep working. The VTEP itself is still reachable, and duplicates are a multihoming problem, not this one.

## 5

Leaf2 in Singapore has 10.1.2.0 slash 24 from a type-5 route, and 10.1.2.20 slash 32 from a type-2 route, both with leaf3 in Amsterdam as next hop. Why advertise the slash 24 at all?

A, so the slash 24 overrides the slash 32 when the two next hops disagree. B, because a slash 32 host route cannot be installed without a covering prefix. C, because type-2 routes carry no layer-3 VNI, so routing needs the type 5. D, so silent hosts in the subnet, which have no type-2 route, are still reachable.

[think]

The answer is D: so silent hosts in the subnet, which have no type-2 route, are still reachable.

A host that has never sent a frame has no type-2 route; the slash 24 still brings packets for it to a leaf that has the subnet, which ARPs for it locally. Longest-prefix match picks the slash 32 whenever it exists, so the 24 never overrides it. Host routes need no covering prefix, and with symmetric IRB, type-2 routes carry the layer-3 VNI in label 2.

## 6

Two Amsterdam leaves advertise Acme's 10.1.1.0 slash 24 as type 5 with the same route distinguisher, 65000 colon 50001, instead of per-leaf distinguishers. What happens?

A, every leaf imports both routes and spreads traffic over the two next hops. B, the routes are discarded, because EVPN distinguishers must contain an IP address. C, the session to the reflector resets with an UPDATE error for the duplicate distinguisher. D, the reflector keeps one best path and reflects only that, so a path disappears.

[think]

The answer is D: the reflector keeps one best path and reflects only that, so a path disappears.

With one distinguisher, the two advertisements are the same route with two paths, and a reflector reflects only its best path, so receivers lose the second next hop without any error. Per-leaf distinguishers make them two routes, both reflected. A duplicate distinguisher is not a protocol error, and although RFC 7432 asks for IP-based distinguishers, receivers do not discard routes over the type.
