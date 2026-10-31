---
lesson: ibgp-loops-and-next-hops
source: 1a8230f2d924814d
---
## 1

gw2.ams, in AS 64500, receives Meridian's own prefix, 203.0.113.0 slash 24, from ISP2, with the AS path 64502, 64496, 64501, 64500. gw2.ams never advertised that prefix to anyone. What does it do?

A, accepts it, because gw2.ams itself never sent the route. B, discards it, because the AS path is longer than four. C, accepts it as a backup path with a lower local preference. D, discards it, because its own AS appears in the AS path.

[think]

The answer is D: it discards it, because its own AS appears in the AS path.

The eBGP loop check is per AS, not per router: any route carrying the receiver's AS number has already been through this network, whichever router sent it. gw1.ams announced it to ISP1, so the route has looped back. There is no length limit at four, and BGP does not keep looped routes as backups.

## 2

Why does a router not re-advertise a route learned from one iBGP peer to another iBGP peer?

A, re-advertising would double the keepalive load on each session. B, the next hop would have to be rewritten at every iBGP hop. C, iBGP sessions cannot carry more than one copy of each prefix. D, the AS path does not change inside an AS, so loops would go unseen.

[think]

The answer is D: the AS path does not change inside an AS, so loops would go unseen.

iBGP does not prepend the local AS, so every copy of a route inside the AS has the same AS path, and a loop cannot be detected from it. Forbidding relay means a route crosses at most one iBGP session, and the side effect is the full mesh. Next hops are deliberately left unchanged across iBGP, and keepalives have nothing to do with route relay.

## 3

gw1.ams shows its iBGP session to gw2.ams as Established, with a million prefixes received from it, but none is used, and gw1.ams sends all traffic through ISP1. The paths' next hop is 198.51.100.0, ISP2's link address. What is the most likely fix?

A, a higher local preference on routes learned from gw2.ams. B, allowas-in on gw1.ams for the iBGP session. C, a shorter hold time on the session between gw1.ams and gw2.ams. D, next-hop-self on gw2.ams towards its iBGP peers.

[think]

The answer is D: next-hop-self on gw2.ams towards its iBGP peers.

iBGP leaves the external next hop unchanged, and IS-IS does not carry the ISP's link, so gw1.ams cannot resolve 198.51.100.0 and the paths are ineligible. Next-hop-self makes gw2.ams advertise its own loopback, which IS-IS carries. A higher local preference cannot make an ineligible path win, allowas-in is about AS loops, and the hold time has nothing to do with resolution.

## 4

The link between gw2.ams and spine1.ams fails. gw1.ams's best path for 192.0.2.0 slash 24 has next hop 10.255.1.202, which is gw2.ams, and IS-IS still reaches it through spine2.ams. What changes on gw1.ams?

A, the BGP session flaps and the route is re-learned through spine2. B, only the forwarding entry, which drops to one spine; BGP sends nothing. C, gw2.ams withdraws the prefix and re-advertises it with a new next hop. D, nothing until the next periodic BGP scan, up to 60 seconds later.

[think]

The answer is B: only the forwarding entry changes, dropping to one spine, and BGP sends nothing.

BGP chose the exit, and the exit has not changed. IS-IS recomputes the way to 10.255.1.202 and next-hop tracking updates the resolved forwarding entry, so the route now uses spine2 only. No BGP message is sent, and the session between loopbacks survives because IS-IS still reaches them. The 60-second periodic scan describes old implementations without next-hop tracking.

## 5

gw2.ams loses power, and its loopback, 10.255.1.202 slash 32, disappears from IS-IS. gw1.ams also has an IS-IS route for 10.255.0.0 slash 16 through the spines. What happens to traffic for gw2.ams's prefixes?

A, it moves to ISP1 at once, because the slash 32 is gone. B, it is sent to the spines and dropped until the hold timer expires. C, it loops between gw1.ams and the spines until the TTL expires. D, it is dropped on gw1.ams, because the forwarding entry is deleted.

[think]

The answer is B: it is sent to the spines and dropped until the hold timer expires.

10.255.1.202 still matches the slash 16, so the next hop still resolves and the path stays best. gw1.ams keeps forwarding towards the spines and a gateway that is gone, and the packets are dropped there. Only when the iBGP hold timer expires are gw2.ams's paths removed. Resolving loopback next hops only through slash 32 routes would have made the path unusable at once and moved traffic to ISP1.

## 6

Meridian considers running its 48 overlay leaves in a full iBGP mesh, with no route reflectors. How many sessions is that, and what does adding a 49th leaf cost?

A, 96 sessions; the new leaf needs 2, and only it is changed. B, 1,128 sessions; the new leaf needs 2, so only two leaves change. C, 1,128 sessions; the new leaf needs 48, so every existing leaf changes. D, 2,304 sessions; the new leaf needs 48, and only it is changed.

[think]

The answer is C: 1,128 sessions, and the new leaf needs 48, so every existing leaf changes.

A full mesh has n times n minus one, over two sessions: 48 times 47, halved, is 1,128. Counting each session from both ends gives 2,304, twice the real number. The 49th leaf needs a session to each of the 48 others, so each of them must be configured too. Two sessions per leaf describes a reflector pair, which is why Meridian uses one.
