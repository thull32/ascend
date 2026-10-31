---
lesson: operating-bgp-safely
source: 4592ad79adaa6fd8
---
## 1

During maintenance, an engineer shuts gw1.ams's IS-IS adjacencies before touching BGP. gw1.ams announces 203.0.113.0 slash 24 to ISP1 from a static discard route, over a directly connected eBGP session. What happens to inbound traffic from ISP1?

A, it is delivered normally, because gw1.ams still has the static route installed. B, it loops between ISP1 and gw1.ams until the time to live expires on every packet. C, it moves to ISP2 within seconds, because the eBGP session follows IS-IS down. D, it arrives at gw1.ams and is discarded, because the announcement does not depend on IS-IS.

[think]

The answer is D: it arrives at gw1.ams and is discarded, because the announcement does not depend on IS-IS.

The eBGP session runs over the direct link and the aggregate comes from a static route, so the session stays Established and the prefix stays announced. Without IS-IS, gw1.ams cannot resolve the next hop of the slash 26 behind leaf1.ams, so the longest match becomes the slash 24 discard route and inbound packets are dropped. Outbound recovers by itself, because iBGP routes through gw1.ams depend on its loopback in IS-IS. The static route is installed, but it discards, so it delivers nothing.

## 2

Why does draining gw1.ams by withdrawing its routes cause a few seconds of loss on the leaves, while graceful shutdown causes none?

A, a withdrawal resets the iBGP sessions to the reflectors, while a community change does not. B, withdrawals are rate-limited by MRAI timers, while community changes are always sent immediately. C, graceful shutdown preinstalls the backup path in every forwarding table, while a withdrawal has to wait for SPF. D, routers advertise only their best path, so gw2.ams's exit is unknown until gw1.ams's path is gone.

[think]

The answer is D: routers advertise only their best path, so gw2.ams's exit is unknown until gw1.ams's path is gone.

While gw1.ams's path is best at gw2.ams, gw2.ams advertises nothing, so the reflectors and leaves have never heard of the ISP2 exit. A withdrawal makes them lose the old path before the new one reaches them. Local preference zero keeps the old path valid while gw2.ams's own path becomes best and propagates, so the leaves always have a working route. Graceful shutdown installs nothing in advance; it changes which path wins.

## 3

ISP1 gives customer routes local preference 200 and peer routes 100, and does not honour graceful shutdown. Meridian prepends its AS five times on gw1.ams's announcement to ISP1 to drain it. What does ISP1 do?

A, it load-balances across both paths, because their attributes are now considered equal. B, it moves to the path through ISP2, because that AS path is now shorter. C, it drops the route as malformed, because five prepends exceed the safe AS path length. D, it keeps sending to gw1.ams, because local preference is compared before AS path length.

[think]

The answer is D: it keeps sending to gw1.ams, because local preference is compared before AS path length.

ISP1's customer route at 200 beats its peer route at 100 however long the customer's path is. Prepending changes the choice only of networks where local preference ties. That is why graceful shutdown works at the local preference step, and why the fallback with a provider that ignores it is the provider's own local preference community, or a withdrawal. Five prepends are well within normal AS path filters.

## 4

ISP2 has a prefix list allowing only 203.0.113.0 slash 24 from Meridian, and a maximum-prefix limit of 10 on received routes. Meridian accidentally sends ISP1's full table to ISP2. What happens?

A, nothing happens, because a limit only applies to routes that pass the prefix list. B, the prefix list rejects the leaked routes, and the session stays up with one accepted. C, ISP2 accepts the first ten routes and silently drops the rest of the table. D, the limit trips on received routes and the session goes down, taking 203.0.113.0 slash 24 with it.

[think]

The answer is D: the limit trips on received routes and the session goes down, taking 203.0.113.0 slash 24 with it.

A limit on received routes counts before import policy, so it trips on the eleventh route even though the prefix list would have rejected every leaked one. The session closes with a Cease notification, subcode 1, and Meridian's own prefix is withdrawn from ISP2 with it. Had the limit counted accepted routes, the session would have stayed up with 1 accepted and 512 rejected. Limits close the whole session; they do not keep the first ten routes.

## 5

After an upgrade, gw1.ams's sessions are back up. When should the graceful shutdown community be removed?

A, after the IS-IS overload bit has been set on the router again. B, as soon as all BGP sessions reach Established again. C, before the BGP sessions are brought back up, to speed convergence. D, after End-of-RIB from every peer, and the forwarding table matching the BGP table.

[think]

The answer is D: after End-of-RIB from every peer, and the forwarding table matching the BGP table.

Established says only that the session is up; the table may still be loading and the hardware still being programmed. Removing the community too early attracts traffic to a router with only part of its routes, a black hole like the boot race. End-of-RIB from every peer shows the tables are complete, and a forwarding table count equal to the BGP table count shows the hardware is ready. Removing it before the sessions come up would attract traffic to a router with no routes at all.

## 6

gw1.ams's session to ISP1 is Established, it advertises one prefix as usual, and its churn is normal, but inbound traffic is being discarded. Which check catches this?

A, an alert on any BGP session that leaves the Established state. B, an alert on an aggregate announced with no route inside it. C, an alert on received prefix counts that drop below the baseline. D, an alert on update rates that exceed ten times the usual baseline.

[think]

The answer is B: an alert on an aggregate announced with no route inside it.

Every session-level signal is normal: the session is up, the advertised count matches intent, and churn is at baseline. What has changed is that the routes behind the announced aggregate are gone, so arriving traffic matches only the discard route. A coverage check, at least one route present inside each announced aggregate, catches it on the device. An outside-in probe through ISP1 catches it end to end.
