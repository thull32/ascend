---
lesson: ibgp-loops-and-next-hops
source: c120cc6773052369
fit: partial
desk:
  - "The AS path ring table, the loop-check code, and the BGP update propagation visualisation"
  - "The iBGP simulator and its three runs: full mesh, one missing session, and the ghost-route ring"
  - "The session-count table for full meshes from 4 to 1,000 speakers"
  - "The next hop rules table and the illustrative output with an inaccessible next hop"
  - "The next hop resolution visualisation, and the resolution code with its six cases"
  - "The failure-mode and trade-off tables, the next-hop cache output, and the platform checks code"
---
## Introduction

A BGP route is a claim: this prefix is reachable, and here is the address to send it to. Passed from router to router, a claim can go wrong in two ways. It can come back to where it started and keep circulating long after the original is withdrawn. Or the address it names can be one the receiver has no idea how to reach.

BGP handles the first with two loop rules, one between networks and one inside a network. It handles the second by handing the address to the interior routing protocol, the IGP, to resolve. Most "BGP is up but the route is not used" mysteries are one of these three rules doing exactly what it says.

The examples run on Meridian's internet edge in Amsterdam: border gateways gw1.ams, loopback 10.255.1.201, and gw2.ams, loopback 10.255.1.202, both in AS 64500. ISP1 is attached to gw1, ISP2 to gw2, and as a small example the site has two spines. IS-IS, Meridian's IGP, carries every router's loopback, a slash 32 that never goes down.

## eBGP: the AS path remembers

Every time a route crosses an AS boundary, the sender prepends its own AS number to the AS path. Every eBGP receiver scans the whole path for its own number. If it is there, the route has already been through this network: RFC 4271 calls it an AS loop and excludes it from best-path selection, and most implementations discard it on arrival. That is enough, because any loop between networks passes through some AS twice.

Follow Meridian's own prefix, 203.0.113.0 slash 24. gw1.ams announces it to ISP1 with a path of just 64500. ISP1 passes it to a transit provider, AS 64496, and the transit provider to ISP2, each prepending its number. Then ISP2 sends it to gw2.ams, with 64502 at the front and 64500 at the end.

Before I tell you: gw2.ams never sent this route to anyone. Does it accept it?

[pause]

It discards it. The check is per AS, not per router. Its own AS is in the path, so whichever router sent it, the route has been here.

The check bites in two places. In the eBGP underlay design, both spines of a site share AS 65100, so a path that has crossed one spine is rejected by the other: the rule, used on purpose, forbids spine to leaf to spine detours. And an enterprise that reuses one private AS at every branch finds that each site rejects the others' routes. The fixes, allowas-in on the customer or as-override on the provider, both switch off loop detection for that AS, so a backdoor link between sites can now carry a loop. The signal is a prefix the peer says it sent that never appears in the received table, listed as rejected for "AS loop" where the device keeps it.

## iBGP: no relaying, so a full mesh

Inside an AS, nothing is prepended. It cannot be: if gw1 added 64500, gw2 would find its own AS and discard the route. So the AS path is identical on every router in the AS, and an iBGP loop is invisible to it.

RFC 4271's answer is a blunt rule, usually called iBGP split horizon: a route learned from an iBGP peer is never advertised to another iBGP peer. Routes learned over eBGP, or originated locally, go to every iBGP peer. A route crosses at most one iBGP session and cannot circulate.

Here is the failure the rule prevents. Four Amsterdam leaves in a ring of four sessions, rule switched off. leaf3.ams advertises Acme's 10.1.2.0 slash 24 with its own loopback, 10.255.1.13, as next hop. leaf1 hears it and passes it to leaf2. Then leaf1 hears it back from leaf2, cannot tell an echo of its own route from a genuine one, and on the tie-break, the sender's lowest router ID, prefers leaf2's copy: 10.255.1.12 beats 10.255.1.13. Now leaf1 and leaf2 each prefer the other's copy.

Then leaf3 withdraws. And nothing changes. leaf1 and leaf2 keep believing each other, and leaf3 even learns its own former prefix back. That is a ghost route, stable forever, because BGP routes do not age out and nothing in the copies says the original is gone. Every ghost still points at leaf3, so Acme's traffic goes there and dies.

With split horizon and a full mesh, the same withdrawal clears one round after the origin withdraws. But remove one session, between leaf3 and leaf4, and leaf4 never learns the route: leaf1 and leaf2 hold it and are forbidden to relay it. Every existing session is healthy, and a router is still missing routes.

So every router that brings routes in must peer with every other: a full mesh. For n speakers that is n times n minus one, over two. Four leaves: 6 sessions. Meridian's six border gateways: 15. Three sites of 16 leaves, 48 in all: 1,128. And a 49th leaf means editing all 48 existing ones, while every update is sent 47 times where a pair of route reflectors would need 2. Reflectors relax split horizon with their own loop detection, the subject of the next lesson.

## The next hop names the exit

The next hop depends on who sends to whom. Originating a route to an iBGP peer, a router puts its own loopback. Sending to an eBGP peer, it puts its own address on the shared link. But a route learned over eBGP and passed on over iBGP keeps the external neighbour's address, unchanged, and a route reflector should not change it either.

The next hop names the exit. Keeping it lets each router reach the exit by its own shortest IGP path, compare its distance to competing exits, which is hot-potato routing, and keep reflectors out of the forwarding path.

The cost shows at the edge. ISP2 sends 192.0.2.0 slash 24 to gw2 with next hop 198.51.100.0, ISP2's address on the link. gw2 passes it to gw1 unchanged. But IS-IS carries loopbacks and fabric links, not links to other companies, so gw1 cannot reach that address. The route stays in the table, excluded from best-path selection. The session is Established, the prefix was received, and the path is never used. Look for the word "inaccessible", or "unresolved".

Two fixes. Next-hop-self makes gw2 rewrite the next hop to its own loopback towards iBGP peers, which IS-IS carries; it is standard at almost every internet edge. Or advertise the ISP link's slash 31 into IS-IS as a passive interface. The difference is failure signalling. If the ISP2 link drops while gw2 stays up, with about a million routes behind it, next-hop-self means gw2 withdraws every prefix through BGP: seconds to tens of seconds. With the link in IS-IS, one update kills every path at once. The price is external addresses in the IGP, and most networks keep the IGP clean.

In the EVPN overlay, the next hop is the payload: a leaf's loopback is its VTEP, where tunnelled traffic for it is sent. Next-hop-self on a reflector would pull tenant traffic to a box that is not a VTEP, which is why FRRouting and Cisco IOS ignore a plain next-hop-self on reflected routes.

## Recursive resolution: BGP picks the exit, the IGP picks the way

Forwarding hardware cannot send a packet "to 10.255.1.202"; it needs an outgoing interface and a neighbour's MAC. Recursive resolution looks the next hop up in the routing table, and repeats until it reaches a directly connected address.

Walk it on gw1, with next-hop-self in place. BGP picks the best path for 192.0.2.0 slash 24: next hop 10.255.1.202, one AS shorter than ISP1's path. A longest-prefix match for that address finds the IS-IS slash 32, with two equal-cost next hops, spine1 and spine2. Each of those is on a connected link, and the recursion stops. The forwarding table gets the prefix with both spines, each with its interface and MAC, and packets are hashed across them.

BGP chose the exit; IS-IS chose the way. Neither knows the other's half. When the link between gw2 and spine1 fails, the forwarding entry drops to one spine and BGP sends nothing, because the exit is the same. When gw2 loses power, its loopback leaves IS-IS, the path becomes unusable, and traffic moves to ISP1.

Resolvers add guard rules. Never through the default route, which matches everything and would make every next hop look alive. Never through the route itself; when that address is a BGP peer's, you get the recursive routing failure, a session that learns a route to its peer through the peer, loses its real path, drops, and repeats on a fixed period. And a cap on the depth of the chain.

## When an exit dies

Here is the trap. Suppose IS-IS also carries 10.255.0.0 slash 16, a summary of the other sites' loopbacks through the spines. gw2 loses power and its slash 32 disappears. What happens to its traffic?

[pause]

10.255.1.202 still falls inside the slash 16, so the next hop still resolves, the path stays best, and traffic heads for an exit that no longer exists. It is dropped until the session's hold timer expires. A covering route has made a dead exit look alive. The fix: resolve loopback next hops only through slash 32 host routes.

Speed is the other half. Older implementations rescanned next hops every 60 seconds on classic Cisco IOS. Modern ones use next-hop tracking: BGP is told the moment a resolving route changes. IS-IS withdraws gw2's loopback within about a second, the path goes unusable, traffic moves, and the session still shows Established for up to 9 more seconds with the fabric's hold time, 90 with the RFC's suggestion. Next-hop tracking, not the session, decided how fast traffic left.

And scale. Suppose half of gw1's million prefixes use gw2. Rewriting them one by one takes tens of seconds, so routers store them hierarchically: each prefix points to one shared entry for gw2's loopback, which points to the spines. Change one entry and every prefix follows. That is BGP PIC Core, prefix-independent convergence; PIC Edge also precomputes a backup exit.

One incident ties it together. In an IS-IS purge storm, one router's clock jump erased the IS-IS database everywhere. Every loopback vanished, every overlay next hop went unresolvable, tenant traffic stopped, and BGP sessions stayed Established for up to a hold time more. A dashboard watching sessions was the last to know.

So tooling should show per peer prefixes received, eligible and best, because received but not eligible is an unresolved next hop or an AS-loop discard. Per next hop, what resolves it and its prefix length: a loopback resolved by anything but a slash 32 is a latent black hole. And mesh completeness from intent, because a missing session is invisible on any one device: "14 of 15 sessions, one pair missing" for the engineer, "every exit reachable, redundancy reduced" for the manager.

## In the interview

A principal engineer asks: why does iBGP need a full mesh?

[pause]

iBGP does not prepend the AS, so the AS path cannot detect a loop inside an AS. RFC 4271 therefore forbids relaying an iBGP-learned route to another iBGP peer, so every router must peer with every router that brings routes in: n times n minus one over two, 1,128 for 48 leaves. The common wrong answer is "for redundancy".

A second: a border router loses power; how quickly does traffic move off? As fast as its loopback leaves the IGP, about a second, because next-hop tracking invalidates every path at once and a hierarchical forwarding table repoints them in one operation, unless a covering route keeps the next hop resolvable. The wrong answer is "after the hold time", which describes the session, not the forwarding. It is honest to add: I'd defer to the network team on the resolution policy, but I'd measure it by killing a test loopback.

## Recap

Four things. Between networks, the AS path is the loop detector, checked per AS, not per router. Inside a network it does not grow, so iBGP never relays, which forces a full mesh or reflectors. iBGP carries the next hop unchanged because it names the exit, and next-hop-self belongs where routes enter the AS. And BGP picks the exit while the IGP picks the way: traffic leaves a dead exit at IGP speed, unless a covering route makes it look alive.

At your desk: the AS path ring and its code, the iBGP simulator's three runs, the session-count table, the next hop rules and the inaccessible output, the resolution visualisation with its six-case code, and the failure, trade-off and platform-check tables.
