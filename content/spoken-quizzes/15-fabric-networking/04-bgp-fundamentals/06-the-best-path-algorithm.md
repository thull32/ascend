---
lesson: the-best-path-algorithm
source: b8b2a33c519c62d2
---
## 1

gw1.ams holds path A from its own eBGP session to ISP1, with AS path 64501, 64496, 64511, and path B over iBGP from gw2.ams, with AS path 64502, 64511. Local preference, weight and origin are equal. Why does gw1.ams not use its own ISP1 link?

A, iBGP paths are always preferred, because they are already inside the AS. B, B has the lower IGP cost, and IGP cost is compared before AS path length. C, AS path length is compared before eBGP over iBGP, and B's path is shorter. D, MED is compared across both ISPs, and B's MED of 0 beats A's MED of 10.

[think]

The answer is C: AS path length is compared before eBGP over iBGP, and B's path is shorter.

Step 5, AS path length, removes A, three networks against two, before step 8, eBGP over iBGP, could favour it. IGP cost is step 9, after AS path. MED is not compared between different neighbouring networks by default. And eBGP is preferred over iBGP, not the reverse; that step simply comes too late to help A.

## 2

Meridian sets local preference 200 on the routes gw1.ams learns from ISP1. What happens on gw2.ams, which has its own eBGP path from ISP2 with local preference 100?

A, gw2.ams switches to gw1.ams's ISP1 path, because iBGP carries local preference 200. B, gw2.ams load-balances over both paths, because the two exits are now equally preferred. C, gw2.ams keeps its ISP2 path, because eBGP over iBGP is checked before local preference. D, nothing changes, because local preference only affects the router whose import policy set it.

[think]

The answer is A: gw2.ams switches to gw1.ams's ISP1 path, because iBGP carries local preference 200.

Local preference is carried to every iBGP peer, so gw2.ams compares 200 with its own 100 at step 3, switches to A, and stops advertising its ISP2 path. Weight is the attribute that stays on one router. eBGP over iBGP is step 8, far below local preference. And the paths differ at local preference, so they are not equal for multipath.

## 3

A router has three iBGP paths to one prefix that tie all the way down to MED. Two are from AS 64501, with MEDs 100 and 20, and one is from AS 64502, with MED 50. Their IGP costs differ. Operators notice that the chosen path depends on which path arrived last. What removes the dependence?

A, treating a missing MED as the worst value, so that every path carries an explicit MED. B, deterministic MED, which picks the best path of each neighbouring AS before comparing the winners. C, raising local preference on the AS 64502 path, so that MED is compared across both neighbours. D, enabling multipath, so that all three paths are installed and none of them has to win.

[think]

The answer is B: deterministic MED, which picks the best path of each neighbouring AS before comparing the winners.

MED is compared only between paths from the same neighbouring network, so pairwise comparisons are not transitive and the result depends on arrival order. Grouping by neighbour first, then comparing the group winners, gives the same answer whatever the order. Missing-as-worst does not apply, because all three carry a MED. Raising local preference changes the winner without making MED comparable, and multipath needs equality at the MED step, which these paths do not have.

## 4

During maintenance, the IS-IS metrics on gw2.ams's links are raised to 1,000. No BGP session goes down, but latency from Amsterdam to some internet destinations jumps by about 100 milliseconds. What happened?

A, gw1.ams's IGP cost to gw2.ams's next hop rose above its cost to gw1.sin, so its exit moved to Singapore. B, gw2.ams's BGP sessions reset when its metrics changed, withdrawing every route it had sent. C, MED was recomputed from the new IGP metrics, and ISP2 now prefers the Singapore entry point. D, the higher metric made the AS path via gw2.ams look longer to the other gateways in the AS.

[think]

The answer is A: gw1.ams's IGP cost to gw2.ams's next hop rose above its cost to gw1.sin, so its exit moved to Singapore.

This is hot-potato routing. The two ISP2 paths tie down to step 9, so the IGP cost to each next hop decides, and at 1,010 against 120 the Singapore exit wins, adding about 52 milliseconds each way inside Meridian. IGP metrics do not change the AS path or reset BGP sessions. And MED is set by the neighbouring network, not derived from Meridian's IGP unless an operator configures that.

## 5

A border router with sessions to two ISPs has maximum paths set to 4, and holds two eBGP paths to a prefix: one with AS path 64501, 64511, and one with 64502, 64511. Everything else is equal. The forwarding table shows only one next hop. Why?

A, multipath is overridden by the oldest-path rule, which leaves one installed path. B, multipath only applies to iBGP paths, never to paths learned over eBGP sessions. C, multipath needs at least four paths before it installs more than one of them. D, multipath needs the paths to share the same AS path, not only its length, unless relaxed.

[think]

The answer is D: multipath needs the paths to share the same AS path, not only its length, unless relaxed.

By default, multipath candidates must have identical AS path contents, so paths through two different neighbouring networks stay out of the group; a multipath relax option loosens that to equal length. Maximum paths is an upper limit, not a minimum, and eBGP and iBGP multipath are both supported, with separate settings. The oldest-path rule still picks the single best path to advertise, but it does not shrink the multipath set.
