---
lesson: traffic-engineering-with-bgp
source: ffd9f8bc8651ce68
---
## 1

Meridian's gateway gw1.ams sets local preference 200 on every route learned from ISP1. Which routers' decisions does this change?

A, every router on the internet that learns Meridian's prefix from ISP1. B, every BGP router inside Meridian's AS, but no router in ISP1 or ISP2. C, only gw1.ams, because local preference never leaves the router that set it. D, every router in Meridian's AS and in ISP1, which receives it in Meridian's updates.

[think]

The answer is B: every BGP router inside Meridian's AS, but no router in ISP1 or ISP2.

Local preference is carried on iBGP sessions, so every router in the AS compares the same value and exits via gw1.ams, and RFC 4271 forbids sending it to external peers, so no other AS sees it. The router-local preference that never leaves one box is the vendor "weight". It also affects only outbound traffic: it changes Meridian's choice of exit, not other networks' choice of entry.

## 2

Meridian prepends its own AS number, 64500, twice on its announcement to ISP2. Which network keeps sending Meridian's traffic via ISP2?

A, ISP1, because the prepended path looks shorter from its side. B, the content network AS 64511, multihomed to both ISPs with equal preference. C, no network, because the longer path loses everywhere. D, ISP2 itself, which prefers its customer route by local preference.

[think]

The answer is D: ISP2 itself, which prefers its customer route by local preference.

ISP2 gives customer routes local preference 200 and peer routes 100, and local preference is compared before AS path length, so the prepended direct route still wins inside ISP2, and everything entering ISP2 follows it. The content network's preferences tie, so the length comparison is reached and it moves to ISP1. ISP1 prefers its own customer route. Reaching ISP2's decision needs its local preference community or a more-specific.

## 3

Why does setting a lower MED on the announcement to ISP1 than on the one to ISP2 not pull traffic onto ISP1?

A, higher MED is preferred, so the values are the wrong way round. B, MED is a transitive attribute and every network resets it. C, MED is compared after the router ID, so it is never reached. D, MED is compared only between paths learned from the same neighbouring AS.

[think]

The answer is D: MED is compared only between paths learned from the same neighbouring AS.

A remote router compares MED only among paths from one neighbouring AS, unless both sides enable comparison across ASes, so ISP1's path and ISP2's path are never compared on MED. Lower is better, MED is non-transitive, reaching only the neighbour, and it comes before IGP cost and router ID. Its use is choosing between several links to one neighbour.

## 4

Meridian announces 203.0.113.0 slash 24 to both ISPs, and its two slash 25 halves to ISP1 only. The link between gw1.ams and ISP1 fails. What happens to inbound traffic?

A, it is lost, because the slash 24 is less specific than the slash 25s. B, it keeps using the slash 25s, which stay cached at remote networks. C, it is lost until an operator announces the slash 25s to ISP2. D, it moves to the slash 24 via ISP2 as the slash 25 withdrawals spread.

[think]

The answer is D: it moves to the slash 24 via ISP2 as the slash 25 withdrawals spread.

The halves were learned only through ISP1, so ISP1 withdraws them and remote networks fall back to the covering slash 24, which ISP2 has carried all along. Longest-prefix match only applies among routes a router has; once the slash 25s are withdrawn, the slash 24 is the longest match. Nothing is cached beyond withdrawal and no action is needed, though the move takes seconds to minutes as withdrawals propagate.

## 5

Meridian tags its announcement to ISP2 with ISP2's community 64502 colon 70. A colleague checks public route collectors and finds no path entering Meridian via ISP2. What does that show?

A, the backup is broken, because ISP2 has dropped Meridian's route. B, the community failed, because ISP2 would show the route at local preference 70. C, the prepending removed the route from the collectors' tables. D, nothing yet, since ISP2 prefers the path via ISP1 and exports only that.

[think]

The answer is D: nothing yet, since ISP2 prefers the path via ISP1 and exports only that.

With local preference 70, below its peer value of 100, ISP2's best path for Meridian goes via ISP1, and a router advertises only its best path, so no one downstream of ISP2 sees the direct one. It still sits in ISP2's table and becomes best when ISP1's path disappears. The check is ISP2's looking glass or a planned drill. Local preference is never sent to other ASes, so collectors could not show 70 anyway.

## 6

Meridian anycasts its DNS resolvers from Amsterdam, Singapore and San Jose. Users of a Singapore broadband network see 105 milliseconds of query latency. What is the most likely cause?

A, anycast sends each query to the site with the least load. B, DNS over UDP cannot be anycast across more than two sites. C, the resolvers in Singapore are overloaded and redirecting queries. D, that network's BGP policy selects the Amsterdam announcement.

[think]

The answer is D: that network's BGP policy selects the Amsterdam announcement.

Anycast delivers each sender to the announcement its own network's decision process prefers, by local preference and path length, not by distance or load. About 10,500 kilometres to Amsterdam at 5 microseconds per kilometre is 52 milliseconds each way. The fixes are per-site prepending or communities towards that network's provider, or consistent transit at every site. Anycast knows nothing about load unless announcements are withdrawn, and UDP suits anycast well.
