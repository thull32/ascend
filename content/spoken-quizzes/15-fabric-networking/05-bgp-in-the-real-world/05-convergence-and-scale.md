---
lesson: convergence-and-scale
source: ef3343968de4ca75
---
## 1

AS 64511 withdraws 192.0.2.0 slash 24. For the next minute, Meridian receives from ISP1 first a three-AS path, then a four-AS path for that prefix, and only then a withdrawal. Why?

A, ISP1 is prepending its own AS to slow the withdrawal down. B, each transit network falls back to stale paths that still name AS 64511. C, the withdrawal is delayed by MRAI while the stale paths are not. D, Meridian's import policy is lengthening the paths that ISP1 sends.

[think]

The answer is B: each transit network falls back to stale paths that still name AS 64511.

Every network still holds alternatives learned earlier through its neighbours. After the origin withdraws, all of them are stale, but a router can only discard one when its own AS comes back in the path or the neighbour withdraws it, so each tries ever-longer paths: path hunting. MRAI only sets how far apart the stale announcements arrive, and pacing cannot make a path longer. Nobody is prepending, and import policy does not add ASes.

## 2

An engineer proposes setting MRAI to zero on every internet-facing session to speed up convergence. What is the main risk?

A, withdrawals are no longer sent until the next MRAI interval fires. B, many more transient paths and updates, which can slow convergence again. C, sessions reset, because an MRAI of zero breaks the hold timer negotiation. D, routes are never collapsed, so the FIB needs twice as many entries.

[think]

The answer is B: many more transient paths and updates, which can slow convergence again.

MRAI collapses intermediate states. At zero, every change is sent at once, so asynchronous hunts on a large mesh produce many more updates and CPU spikes, and simulations show convergence getting slower again below some value: a V-shaped curve. MRAI has nothing to do with hold time negotiation or FIB size, and a zero timer holds no withdrawal back.

## 3

gw1.ams prefers ISP1, with a local preference of 200. gw2.ams has ISP2's paths, but it also prefers gw1.ams's. PIC edge is enabled in gw1.ams's hardware, yet ISP1 failing still costs a minute. What is most likely missing?

A, BFD on the iBGP sessions between the gateways and the reflectors. B, route flap dampening on gw2.ams for the paths received from ISP2. C, a shorter MRAI on the eBGP session between gw1.ams and ISP1. D, gw2.ams's ISP2 paths, present in gw1.ams's RIB as backups.

[think]

The answer is D: gw2.ams's ISP2 paths, present in gw1.ams's RIB as backups.

PIC can only install a backup that the RIB already holds. gw2.ams's best path is the iBGP one through gw1.ams, so its ISP2 paths are not advertised, and reflectors send one path per prefix anyway. Best-external on gw2.ams and ADD-PATH on the reflectors put the backup in gw1.ams's RIB. MRAI paces advertisements to peers, not local failover; BFD on iBGP does not create a path; and dampening would only make things worse.

## 4

gw1.ams's BGP process restarts for an upgrade, and its session to ISP1 drops without a NOTIFICATION. Both sides negotiated graceful restart with a restart time of 120 seconds. What does ISP1 do?

A, holds Meridian's routes indefinitely, until an operator clears them. B, keeps forwarding on Meridian's routes, marked stale, for up to 120 seconds. C, withdraws Meridian's routes at once, and re-learns them on reconnect. D, moves Meridian's routes to ISP2's path until End-of-RIB arrives.

[think]

The answer is B: keeps forwarding on Meridian's routes, marked stale, for up to 120 seconds.

As a helper, ISP1 marks the paths stale and keeps using them while the restart timer runs. When the session returns, it waits for End-of-RIB and deletes any stale path that was not re-advertised. Withdrawing at once is the behaviour without graceful restart, and graceful restart is bounded by the restart time, at most 4,095 seconds: keeping routes for hours is long-lived graceful restart.

## 5

With common dampening defaults, a withdrawal costs 1,000 points, an attribute change 500, the suppress threshold is 2,000, the reuse threshold 750, and the half-life 15 minutes. A prefix whose origin flapped twice in five minutes stays suppressed for about half an hour after it became stable. Why did so few flaps trip it?

A, each flap reached the router as several updates, because of path hunting. B, re-announcements cost 2,000 points each, so one flap is always enough. C, suppression is applied by the origin AS, which counts its own flaps. D, the half-life restarts from zero whenever the route is announced again.

[think]

The answer is A: each flap reached the router as several updates, because of path hunting.

Path hunting turns one withdrawal at the origin into a run of longer paths and then a withdrawal at each distant router, so one flap scores about 2,000 points instead of 1,000. Two flaps push the penalty past the threshold, and decaying from about 3,200 to 750 takes roughly two half-lives. Re-announcements cost nothing or 1,000 depending on the vendor, decay is continuous, and the receiving router applies dampening, not the origin.

## 6

Which question can a BMP feed answer that polling a router's BGP summary every five minutes cannot?

A, what the router's configured hold time is for each of its peers. B, whether the router's BGP sessions are currently established. C, which AS paths a prefix went through during a 60-second hunt, and when. D, how many prefixes each peer has sent the router at this moment.

[think]

The answer is C: which AS paths a prefix went through during a 60-second hunt, and when.

BMP streams every update as the router received it, with the router's timestamp, so a hunt that lasts a minute is recorded path by path. A poll every five minutes sees the before and the after at best. Session state, current prefix counts and configured timers are all visible to a poll; the transient history is not.
