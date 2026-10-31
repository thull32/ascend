---
lesson: route-reflectors
source: 1e823725e3f1af86
---
## 1

The reflector rr1.sin learns Acme's 10.1.2.0 slash 24 from rr1.ams, which is its non-client peer. To whom does rr1.sin reflect it?

A, to Singapore's clients only, never to other reflectors. B, to nobody, since iBGP-learned routes are never relayed. C, to Singapore's clients and to rr2.sin, its partner. D, to every client and every non-client, including San Jose's reflectors.

[think]

The answer is A: to Singapore's clients only, never to other reflectors.

A route learned from a non-client is reflected to clients only. The reflectors are fully meshed as ordinary iBGP peers, so rr2.sin and San Jose's reflectors heard the route from Amsterdam directly, and plain split horizon applies among them. Reflecting to everyone is the rule for routes learned from a client, and relaying to nobody is the plain iBGP rule that reflection exists to relax.

## 2

After a hardware swap, leaf7.ams and leaf8.ams were both given router ID 10.255.1.17. All sessions are Established. What do you expect?

A, nothing changes, since router IDs only break best-path ties. B, both leaves' sessions to the reflectors fail with Bad BGP Identifier. C, each leaf is missing the routes that the other one originates. D, the reflectors drop both leaves' routes as a cluster loop.

[think]

The answer is C: each leaf is missing the routes that the other one originates.

The reflector stamps the originator ID with the originating leaf's router ID. When leaf8's routes are reflected to leaf7, they carry 10.255.1.17, leaf7's own ID, so it discards them as a loop, and the same in reverse. The OPEN check refuses only a peer with the receiver's own ID, so the leaf-to-reflector sessions come up. And the cluster list holds cluster IDs, not router IDs.

## 3

gw1.ams and gw2.ams both originate a default route that ties on every attribute. Every leaf has BGP multipath enabled, yet all internet traffic leaves via gw1. Why?

A, the leaves' IGP cost to gw2 must be higher than to gw1. B, each reflector advertises only its best path, so the leaves never see gw2's. C, the reflectors rewrite the next hop to gw1 on both routes. D, multipath needs the two gateways to be in different ASes.

[think]

The answer is B: each reflector advertises only its best path, so the leaves never see gw2's.

The reflectors hold both paths but each advertises one, the tie-break winner gw1, so the leaves receive two copies of the same next hop and multipath has nothing to spread over. ADD-PATH, or distinct route distinguishers in a VPN family, would deliver gw2's path. Reflectors do not rewrite next hops, and in a symmetric leaf-spine site the leaves' IGP costs to the two gateways are equal.

## 4

rr1.ams and rr2.ams share cluster ID 10.255.1.100. leaf3.ams's session to rr2.ams goes down; everything else is healthy. What is the state of leaf3's routes?

A, every other leaf loses them until the session returns. B, rr2 relearns them from rr1 and reflects them again. C, every other leaf holds them from rr1 only, with no spare. D, every other leaf still holds them from both reflectors.

[think]

The answer is C: every other leaf holds them from rr1 only, with no spare.

With a shared cluster ID, rr2 discards rr1's reflected copies as a loop, so once its own session to leaf3 is down it has no copy. Leaves still reach leaf3 through rr1, so nothing breaks, but one more failure would. With distinct cluster IDs, rr2 would accept rr1's copy and keep serving the routes, at the cost of holding about twice the paths.

## 5

Both of Amsterdam's reflectors lose power at once. No graceful restart is configured, and the fabric's links and IS-IS are healthy. What happens to traffic between acme-web1 on leaf1.ams and acme-db1 on leaf3.ams?

A, it continues until the next route change, then the routes freeze. B, it stops within the hold time, when the leaves delete the overlay routes. C, it shifts to the spines, which hold a copy of every overlay route. D, it continues indefinitely, because no packet ever crossed the reflectors.

[think]

The answer is B: it stops within the hold time, when the leaves delete the overlay routes.

The data plane never used the reflectors, but every overlay route came from them. When the sessions time out, 9 seconds on Meridian and faster with BFD, each leaf deletes the routes learned on them, so leaf1 no longer knows where 10.1.2.20 lives. Stale routes survive only with graceful restart, under its conditions and for a limited time. Meridian's spines carry no overlay routes; they forward VXLAN on outer addresses.
