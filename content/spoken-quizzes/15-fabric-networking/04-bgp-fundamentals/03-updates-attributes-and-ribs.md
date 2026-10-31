---
lesson: updates-attributes-and-ribs
source: 244e58e2805cc61b
---
## 1

gw2.ams receives one UPDATE from ISP2 announcing two prefixes, 192.0.2.0 slash 24 and 192.0.2.128 slash 25. Import policy rejects the slash 25. Which statement about the message and the tables is true?

A, the slash 25 is placed in the Loc-RIB, but marked by the router as not best. B, each prefix needs its own UPDATE, so ISP2 must have sent two messages. C, both prefixes share one set of attributes, and the slash 25 remains only in the pre-policy view. D, rejecting the slash 25 makes gw2.ams send ISP2 a NOTIFICATION and reset the session.

[think]

The answer is C: both prefixes share one set of attributes, and the slash 25 remains only in the pre-policy view.

One UPDATE carries one attribute set for any number of prefixes, so both arrived together. Import policy runs between the Adj-RIB-In and the Loc-RIB, so a rejected prefix never reaches the Loc-RIB; it survives only in a pre-policy copy, if the router keeps one. Rejecting a route by policy is normal and sends nothing to the peer. NOTIFICATIONs are for protocol errors.

## 2

A leaf shows a BGP route to 192.0.2.0 slash 24 as best, learned over iBGP, but the routing table forwards that prefix using a static route someone added. What explains it?

A, the static route has a lower administrative distance, and wins the RIB. B, the FIB always prefers static routes over any dynamic protocol's route. C, the static route was received more recently, so it wins by being newest. D, the BGP path loses because its MED is higher than the static route's metric.

[think]

The answer is A: the static route has a lower administrative distance, and wins the RIB.

BGP's best path is offered to the RIB manager, which compares routes for the same prefix from different sources by administrative distance: 1 for the static against 200 for iBGP. The BGP path is shown as best but not installed, a RIB-failure on some platforms. MED is compared only between BGP paths, age is a late BGP tie-breaker, and the FIB installs whatever the RIB selected, not a fixed protocol order.

## 3

gw2.ams sets a local preference of 300 on the routes it announces to ISP2, hoping ISP2 will prefer Meridian's link. What happens?

A, ISP2 copies it into the MED, since MED is the external version of local preference. B, ISP2 prefers the link, because local preference outranks every other attribute. C, ISP2 resets the session, because local preference on eBGP is a protocol error. D, nothing: local preference is not sent over eBGP, and is ignored if received.

[think]

The answer is D: nothing. Local preference is not sent over eBGP, and is ignored if received.

Local preference expresses an AS's own preference and travels on iBGP only; it is not included in eBGP UPDATEs, and a receiver ignores one from an eBGP peer. To influence how a neighbour sends traffic to you, you use MED towards one neighbour with several links, AS path prepending, more-specific prefixes, or the neighbour's own communities. It is not a session-reset error, and nothing converts it into MED.

## 4

A monitoring dashboard shows that ISP2 sent zero routes for 198.51.100.0 slash 24, and the team concludes ISP2 never announced it. What should you check before accepting that?

A, whether the session is Established, since routes only appear after that. B, whether the dashboard reads the router's FIB rather than its BGP table. C, whether the count is post-policy, since filtered prefixes would vanish from it. D, whether the hold time is short enough for the route to have arrived.

[think]

The answer is C: whether the count is post-policy, since filtered prefixes would vanish from it.

Many counters and show commands report the post-policy Adj-RIB-In, where a prefix rejected by import policy looks identical to one never sent. A pre-policy view, from soft reconfiguration, a hidden-route display or BMP's pre-policy feed, tells the two apart. Session state and hold time do not explain a single missing prefix, and the FIB would hide the route for different reasons, such as losing the best-path decision.

## 5

Acme and Globex both use 10.1.1.0 slash 24, and their routes cross the same route reflectors in the EVPN family. Why do both survive best-path selection?

A, the VNI in the next hop field separates them before best path runs. B, reflectors run best path per VRF, so the two tenants never actually meet. C, each route is keyed by route distinguisher plus prefix, so they are two separate NLRI. D, the route target is part of the NLRI, so the two prefixes look different.

[think]

The answer is C: each route is keyed by route distinguisher plus prefix, so they are two separate NLRI.

The route distinguisher is prepended to the prefix inside the NLRI, so leaf1.ams's Acme route and leaf2.ams's Globex route are different routes, and no router picks one over the other. The route target is an extended community that decides which VRF imports the route; it does not make the key unique. Reflectors hold no tenant VRFs, and the VNI is a label in the NLRI, not the next hop.

## 6

After ISP2 withdraws 192.0.2.0 slash 24, gw2.ams's best path becomes the one it learned from gw1.sin over iBGP. What does gw2.ams send to gw1.ams?

A, an UPDATE with gw1.sin's path, and its own loopback as the next hop. B, an UPDATE with gw1.sin's path, since gw1.ams needs the replacement. C, a withdrawal, since an iBGP-learned best path is not re-sent to iBGP peers. D, nothing at all, since gw1.ams will time out the old route by itself.

[think]

The answer is C: a withdrawal, since an iBGP-learned best path is not re-sent to iBGP peers.

gw2.ams last advertised ISP2's path to gw1.ams. Its new best came from an iBGP peer, and the iBGP split-horizon rule forbids passing it to another iBGP peer, so the Adj-RIB-Out diff produces a withdrawal, and gw1.ams falls back to the path it already holds directly from gw1.sin. BGP routes do not time out on their own, so silence would leave a stale path pointing at gw2.ams.
