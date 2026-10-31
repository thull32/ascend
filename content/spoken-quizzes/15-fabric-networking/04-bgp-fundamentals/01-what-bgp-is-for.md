---
lesson: what-bgp-is-for
source: 0102a0d2ff81260c
---
## 1

The gateway gw2.ams, in AS 64500, receives Meridian's own prefix, 203.0.113.0 slash 24, from ISP2, with the AS path 64502 64496 64501 64500. gw2.ams itself never announced this prefix to anyone. What does it do?

A, accepts it as a backup path in case the iBGP route is withdrawn. B, discards it, because its own AS number is already in the path. C, accepts it, because gw2.ams itself never sent this route out. D, discards it, because a four-AS path exceeds BGP's hop limit.

[think]

The answer is B: it discards it, because its own AS number is already in the path.

The loop check is per AS: 64500 in the path proves the route has already been through Meridian, whichever router sent it. Keeping it as a backup would invite exactly the loop the rule prevents. BGP has no hop limit on paths; the AS path itself is the loop detector.

## 2

Meridian prepends its AS three extra times on announcements to ISP2. ISP2 now has a four-AS path from its customer, Meridian, and a three-AS path through its transit provider. Which does ISP2 most likely use?

A, the customer path, because customer routes get a higher local preference. B, both equally, because BGP load-shares across the two paths. C, the transit path, because providers always rank above customers. D, the transit path, because the shorter AS path wins.

[think]

The answer is A: the customer path, because customer routes get a higher local preference.

ISP2 sets local preference by relationship, and local preference is compared before AS path length, so its paying customer's route wins regardless of prepending. Choosing the provider route would mean paying transit to reach a customer who pays ISP2. And BGP does not load-share across paths with different attributes by default.

## 3

In an eBGP-underlay fabric, leaf3.ams and leaf4.ams were both configured as AS 65103. All BGP sessions are Established. What do you expect to see?

A, the spines rejecting both leaves for having a duplicate router ID. B, every leaf losing its routes to every other leaf in the site. C, leaf3.ams and leaf4.ams unable to reach each other, and everything else fine. D, both leaves' sessions to the spines cycling with a Bad Peer AS notification.

[think]

The answer is C: leaf3.ams and leaf4.ams unable to reach each other, and everything else fine.

Each leaf receives the other's routes with the AS path 65100 65103, finds its own AS and discards them as a loop. Routes to and from every other leaf carry different numbers and are accepted. The spines are configured to expect AS 65103 on both sessions, so there is no Bad Peer AS error, and router IDs are a separate value.

## 4

What makes a BGP session eBGP rather than iBGP?

A, the peer being directly connected on a shared link. B, the session carrying routes for internet prefixes. C, the peer being located in a different physical site. D, the peer's AS number differing from the router's own.

[think]

The answer is D: the peer's AS number differing from the router's own.

The only test is whether the two AS numbers differ. iBGP peers can be a hop apart and eBGP peers can be several hops apart. eBGP inside a data center carries no internet routes at all, and Meridian's iBGP spans three sites.

## 5

A public route collector shows a prefix with the AS path 64496 64501 65010. What has most likely happened?

A, AS 65010 hijacked the prefix from its rightful origin, AS 64501. B, AS 64501 did not strip its BGP customer's private AS number on export. C, a 2-byte speaker wrote 65010 as a placeholder for a 4-byte number. D, AS 64501 prepended a second number of its own to steer traffic away.

[think]

The answer is B: AS 64501 did not strip its BGP customer's private AS number on export.

65010 is in the private range: typically a customer that runs BGP only to AS 64501, with a number 64501 assigned, and 64501 should have removed it before passing the route to its provider. A private origin is a stripping failure, not by itself evidence of a hijack. The placeholder for 4-byte numbers is 23456, and prepending repeats a network's own number rather than adding a different one.

## 6

Meridian's ISP2 port is billed at the 95th percentile of five-minute samples over a 30-day month. A backup job doubles the traffic for 30 hours. What happens to the bill?

A, it doubles, because the billed rate is the month's peak. B, it rises by the 30 hours' share of the month, about 4 percent. C, it doubles, because any burst above the commit is charged in full. D, it barely moves, because the top 36 hours of samples are not billed.

[think]

The answer is D: it barely moves, because the top 36 hours of samples are not billed.

A 30-day month has 8,640 samples, and the top 5 percent, 432 samples or 36 hours, are discarded. A 30-hour burst falls entirely inside them, so the billed sample is still an ordinary daily peak, at most a little higher one. A burst of 37 hours or more would set the bill at the burst rate. Peak billing and pro-rated averages are not how the 95th percentile works.
