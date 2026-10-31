---
review: bgp-in-the-real-world
source: 20a16b92b0edb96d
---
## Introduction

Twelve questions from the second half of the BGP in the real world module. Answer out loud before the answer comes.

They run in the order of the lessons: leaks, hijacks and RPKI, convergence and scale, and operating BGP safely. Meridian is still the network in most of them, with gateways gw1.ams and gw2.ams and providers ISP1 and ISP2. Each question has four options, A to D, then a few seconds for you to commit to one.

## Question 1

AS 64510 announces 203.0.113.0 slash 25, with an AS path three hops longer than the path to Meridian's 203.0.113.0 slash 24. At a network that accepts both, where does traffic for 203.0.113.10 go?

A, to AS 64510, because longest-prefix match prefers the slash 25. B, split between the two by equal-cost multipath, because both routes match. C, to Meridian, because the slash 24 was learned first and is older. D, to Meridian, because its AS path is three hops shorter.

[think]

The answer is A: to AS 64510, because longest-prefix match prefers the slash 25.

The slash 24 and the slash 25 are different prefixes, so BGP never compares their paths. Both are installed, and the forwarding lookup uses the longest match containing the address. Path length, route age and multipath only decide between routes for the same prefix, which is why a sub-prefix hijack reaches every network that accepts it.

## Question 2

Meridian's ROA is 203.0.113.0 slash 24, maximum length 24, AS 64500. AS 64510 announces 203.0.113.0 slash 24 with the AS path 64510 then 64500. What does route origin validation say?

A, Invalid, because the route arrived from AS 64510. B, NotFound, because the path holds two networks. C, Valid, because the origin and length match the ROA. D, Invalid, because the path is longer than the ROA allows.

[think]

The answer is C: Valid, because the origin and length match the ROA.

Origin validation checks only the origin, the last AS in the path, and the prefix length. Both match, so the forged path is Valid. Detecting that AS 64510 is not really adjacent to Meridian needs a path check: ASPA would mark it Invalid, because Meridian's ASPA does not list AS 64510 as a provider.

## Question 3

Both of a network's RPKI validators have been down for four hours. What happens to BGP routes at its border routers?

A, once the RTR data expires, routes become NotFound and are accepted. B, routers keep the last data forever, so nothing changes at all. C, routers fetch and verify the ROAs themselves until a validator returns. D, every route is treated as Invalid and dropped, cutting the network off.

[think]

The answer is A: once the RTR data expires, routes become NotFound and are accepted.

Routers discard RTR data after its expire interval, two hours by default. With no validated payloads, every route is NotFound, and NotFound is accepted: protection fails open while no route changes. That is why validator data age, not process state, needs an alert.

## Question 4

Which defence would have prevented Facebook's October 2021 outage?

A, max-prefix limits on the sessions between Facebook and its peers. B, RPKI route origin validation at the networks Facebook peers with. C, none of these, since Facebook's own servers withdrew the routes. D, IRR prefix filters at the transit providers serving Facebook.

[think]

The answer is C: none of these, since Facebook's own servers withdrew the routes.

Facebook's DNS sites withdrew their own anycast routes when a backbone failure made all of them fail their health check at once, and the internet removed routes their legitimate origin withdrew. Origin validation, prefix filters and max-prefix all check unwanted announcements, not missing ones. The fixes were guard rails on the change tooling, health checks whose failures are independent, and out-of-band access.

## Question 5

AS 64511 withdraws 192.0.2.0 slash 24. For the next minute, Meridian receives from ISP1 first a three-AS path, then a four-AS path for that prefix, and only then a withdrawal. Why?

A, ISP1 is prepending its own AS to slow the withdrawal down. B, each transit network falls back to stale paths that still name AS 64511. C, the withdrawal is delayed by MRAI while the stale paths are not. D, Meridian's import policy is lengthening the paths that ISP1 sends.

[think]

The answer is B: each transit network falls back to stale paths that still name AS 64511.

Every network still holds alternatives learned earlier through its neighbours. After the origin withdraws, all of them are stale, but a router can only discard one when its own AS comes back in the path or the neighbour withdraws it, so each tries ever-longer paths: path hunting. MRAI only sets how far apart the stale announcements arrive; pacing cannot make a path longer.

## Question 6

gw1.ams prefers ISP1, with a local preference of 200. gw2.ams has ISP2's paths, but it also prefers gw1.ams's. PIC edge is enabled in gw1.ams's hardware, yet ISP1 failing still costs a minute. What is most likely missing?

A, BFD on the iBGP sessions between the gateways and the reflectors. B, route flap dampening on gw2.ams for the paths received from ISP2. C, a shorter MRAI on the eBGP session between gw1.ams and ISP1. D, gw2.ams's ISP2 paths, present in gw1.ams's RIB as backups.

[think]

The answer is D: gw2.ams's ISP2 paths, present in gw1.ams's RIB as backups.

PIC can only install a backup that the RIB already holds. gw2.ams's best path is the iBGP one through gw1.ams, so its ISP2 paths are not advertised, and reflectors send one path per prefix anyway. Best-external on gw2.ams and ADD-PATH on the reflectors put the backup in gw1.ams's RIB.

## Question 7

gw1.ams's BGP process restarts for an upgrade, and its session to ISP1 drops without a NOTIFICATION. Both sides negotiated graceful restart with a restart time of 120 seconds. What does ISP1 do?

A, holds Meridian's routes indefinitely, until an operator clears them. B, keeps forwarding on Meridian's routes, marked stale, for up to 120 seconds. C, withdraws Meridian's routes at once, and re-learns them on reconnect. D, moves Meridian's routes to ISP2's path until End-of-RIB arrives.

[think]

The answer is B: keeps forwarding on Meridian's routes, marked stale, for up to 120 seconds.

As a helper, ISP1 marks the paths stale and keeps using them while the restart timer runs. When the session returns, it waits for End-of-RIB and deletes any stale path that was not re-advertised. Withdrawing at once is the behaviour without graceful restart, and keeping routes for hours is long-lived graceful restart.

## Question 8

Which question can a BMP feed answer that polling a router's BGP summary every five minutes cannot?

A, what the router's configured hold time is for each of its peers. B, whether the router's BGP sessions are currently established. C, which AS paths a prefix went through during a 60-second hunt, and when. D, how many prefixes each peer has sent the router at this moment.

[think]

The answer is C: which AS paths a prefix went through during a 60-second hunt, and when.

BMP streams every update as the router received it, with the router's timestamp, so a hunt that lasts a minute is recorded path by path. A poll every five minutes sees the before and the after at best. Session state, current prefix counts and configured timers are all visible to a poll; the transient history is not.

## Question 9

During maintenance, an engineer shuts gw1.ams's IS-IS adjacencies before touching BGP. gw1.ams announces 203.0.113.0 slash 24 to ISP1 from a static discard route, over a directly connected eBGP session. What happens to inbound traffic from ISP1?

A, it is delivered normally, because gw1.ams still has the static route installed. B, it loops between ISP1 and gw1.ams until the time to live expires on every packet. C, it moves to ISP2 within seconds, because the eBGP session follows IS-IS down. D, it arrives at gw1.ams and is discarded, because the announcement does not depend on IS-IS.

[think]

The answer is D: it arrives at gw1.ams and is discarded, because the announcement does not depend on IS-IS.

The eBGP session runs over the direct link and the aggregate comes from a static route, so the session stays Established and the prefix stays announced. Without IS-IS, gw1.ams cannot resolve the next hop of the slash 26 behind leaf1.ams, so the longest match becomes the slash 24 discard route and inbound packets are dropped. The static route is installed, but it discards, so it delivers nothing.

## Question 10

Why does draining gw1.ams by withdrawing its routes cause a few seconds of loss on the leaves, while graceful shutdown causes none?

A, a withdrawal resets the iBGP sessions to the reflectors, while a community change does not. B, withdrawals are rate-limited by MRAI timers, while community changes are always sent immediately. C, graceful shutdown preinstalls the backup path in every forwarding table, while a withdrawal has to wait for SPF. D, routers advertise only their best path, so gw2.ams's exit is unknown until gw1.ams's path is gone.

[think]

The answer is D: routers advertise only their best path, so gw2.ams's exit is unknown until gw1.ams's path is gone.

While gw1.ams's path is best at gw2.ams, gw2.ams advertises nothing, so the reflectors and leaves have never heard of the ISP2 exit, and a withdrawal makes them lose the old path before the new one reaches them. Local preference zero keeps the old path valid while gw2.ams's own path becomes best and propagates. Graceful shutdown installs nothing in advance; it changes which path wins.

## Question 11

After an upgrade, gw1.ams's sessions are back up. When should the graceful shutdown community be removed?

A, after the IS-IS overload bit has been set on the router again. B, as soon as all BGP sessions reach Established again. C, before the BGP sessions are brought back up, to speed convergence. D, after End-of-RIB from every peer, and the forwarding table matching the BGP table.

[think]

The answer is D: after End-of-RIB from every peer, and the forwarding table matching the BGP table.

Established says only that the session is up; the table may still be loading and the hardware still being programmed. Removing the community too early attracts traffic to a router with only part of its routes, a black hole like the boot race. End-of-RIB from every peer shows the tables are complete, and a forwarding table count equal to the BGP table count shows the hardware is ready.

## Question 12

gw1.ams's session to ISP1 is Established, it advertises one prefix as usual, and its churn is normal, but inbound traffic is being discarded. Which check catches this?

A, an alert on any BGP session that leaves the Established state. B, an alert on an aggregate announced with no route inside it. C, an alert on received prefix counts that drop below the baseline. D, an alert on update rates that exceed ten times the usual baseline.

[think]

The answer is B: an alert on an aggregate announced with no route inside it.

Every session-level signal is normal, but the routes behind the announced aggregate are gone, so arriving traffic matches only the discard route. A coverage check, at least one route present inside each announced aggregate, catches it on the device. An outside-in probe through ISP1 catches it end to end.

## Recap

Three ideas kept coming back. Many protections check the wrong thing for the failure in front of them: origin validation passes a forged path, every filter misses a legitimate withdrawal, and a healthy session can still be announcing an aggregate with nothing behind it. A router advertises only its best path, so backups stay invisible until you add them deliberately, with best-external and ADD-PATH, or let them propagate first, with graceful shutdown before a drain. And Established is not the same as ready: wait for End-of-RIB and a complete forwarding table, and watch what happens in between, because a minute of path hunting is invisible to a five-minute poll.
