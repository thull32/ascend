---
lesson: is-is-from-zero
source: dedbc573c2b3679f
---
## 1

spine1.ams holds leaf3.ams's LSP at sequence number hex 2B, with 600 seconds of lifetime left. A copy arrives with the same sequence number, hex 2B, and a remaining lifetime of zero. What does spine1 do?

A, raises the sequence number to hex 2C and re-originates the LSP itself. B, treats it as a purge: deletes its copy and floods the purge on. C, sends its own copy back, because a live copy beats an expired one. D, ignores it, because the sequence number is not higher.

[think]

The answer is B: it treats it as a purge, deletes its copy and floods the purge on.

With equal sequence numbers, the zero-lifetime copy counts as newer: it is a purge. So spine1 removes the LSP's body, floods the purge to its other neighbours, and keeps the header for 60 seconds. Ignoring it would be right only for a true duplicate, sending the live copy back inverts the rule, and a router only ever re-originates its own LSPs, never someone else's.

## 2

The fibre between leaf3.ams and spine2.ams is cut. leaf1.ams has received leaf3's new LSP, which no longer lists spine2, but still holds spine2's old LSP, which still lists leaf3. What is leaf1's route to leaf3's loopback, 10.255.1.13 slash 32?

A, metric 30 via spine1, because one path is now longer. B, no route at all, because the two LSPs disagree. C, metric 20 via spine1 only, because the two-way check fails. D, metric 20 via both spines, until spine2's new LSP arrives.

[think]

The answer is C: metric 20 via spine1 only, because the two-way check fails.

SPF uses an edge only when both ends' LSPs list each other. leaf3's LSP no longer lists spine2, so the link between them is unusable even though spine2's stale LSP still claims it: one end's news is enough. The path through spine1 is unchanged at metric 20, so the route survives with one next hop instead of two.

## 3

Why does Meridian run every router as level 2 in one area, instead of making each site a level-1 area?

A, level-2 flooding is faster, because it uses CSNPs instead of PSNPs. B, level-1 leaves would get only a default route, but EVPN next hops need every loopback. C, level-1 areas cannot run over leased long-haul circuits between sites. D, IS-IS supports only one area per routing domain in practice.

[think]

The answer is B: level-1 leaves would get only a default route, but EVPN next hops need every loopback.

EVPN routes resolve their next hop, a remote leaf's loopback, through the underlay. A level-1-only leaf would have just a default route towards the nearest attached router, which many implementations will not use for next-hop resolution, and which hides a dead remote leaf. Leaking every loopback back in removes most of the benefit. The two levels flood the same way, and multiple areas are common.

## 4

An operator sets the overload bit on both spines of the small Amsterdam fabric at once, for maintenance. What happens to traffic from leaf1.ams to leaf3.ams?

A, it shifts to the spine with the lower system ID. B, it keeps flowing, because overload only raises the path metric. C, it stops, because no path may transit an overloaded router. D, it flows through the route reflectors, which take over transit.

[think]

The answer is C: it stops, because no path may transit an overloaded router.

Overload forbids transit even when the router is the only path, so with both spines overloaded the leaves cannot reach each other; only the spines' own prefixes stay reachable. Maximum metric would have left the spines usable as a last resort. The reflectors carry their own permanent overload bit, and nothing picks a spine by system ID.

## 5

On a fabric, one LSP's sequence number is rising by about 35 a minute while every adjacency is up, and SPF runs constantly. What is the most likely cause?

A, two routers configured with the same system ID. B, a router whose clock jumped forward at boot. C, a narrow-metric router mixed into a wide-metric domain. D, an MTU mismatch dropping that router's large LSPs.

[think]

The answer is A: two routers configured with the same system ID.

Two routers originating the same LSP ID each see a copy they did not create with a higher sequence number, and each re-originates above it. So the number climbs steadily, and every change floods and triggers SPF. An MTU mismatch stalls flooding rather than speeding it up, a clock jump causes purges, and a metric-style mismatch gives inconsistent paths without sequence churn.

## 6

A fibre is cut in the full-size Amsterdam site, with 4 spines and 16 leaves. Roughly how many times is leaf3's new LSP transmitted, and why?

A, thousands of times, because each router floods every copy it receives. B, 19 times, once per router, because duplicates are suppressed at the sender. C, once per spine, because leaves never re-flood LSPs from other leaves. D, about once per link, because each leaf hears it from every spine it reaches.

[think]

The answer is D: about once per link, because each leaf hears it from every spine it reaches.

Every leaf receives the LSP from each spine it still reaches, and installs only the first copy, so the flood costs about one transmission per link, 63 here, and at most two per link when copies cross. A sender cannot know which neighbours already have it, so it cannot cut that to one per router. Leaves do re-flood, and only newer copies are passed on, so it never multiplies.
