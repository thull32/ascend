---
review: underlay
source: 66abdd21bd6dfe45
---
## Introduction

Fourteen questions from the underlay module. Answer out loud before the answer comes.

They follow the lessons, from what routing protocols do to underlay failures in production. Each has four options, then a few seconds to commit.

## Question 1

In the small Amsterdam fabric, two spines and four leaves, running on static routes only, the link between leaf3.ams and spine2.ams fails. What happens to traffic from leaf1.ams to leaf3.ams's loopback?

A, all of it is lost until leaf1.ams's static route times out. B, about a quarter is lost, because spine1.ams carries the rest twice. C, none is lost, because leaf1.ams's interfaces never went down. D, about half is lost: flows hashed to spine2.ams are dropped there.

[think]

The answer is D: about half is lost, because flows hashed to spine2.ams are dropped there.

leaf1.ams's static route keeps both next hops, because its own uplinks are up, and a static route tests nothing beyond them. Flows hashed onto spine2.ams arrive at a router that lost its only route to leaf3's loopback with the failed link, and are dropped. Static routes never time out, and leaf1.ams's interfaces staying up is exactly why it keeps sending into the failure.

## Question 2

An OSPF design summarises each remote site's leaf loopbacks into one slash 24. What goes wrong when leaf2.sin fails?

A, the summary still covers its slash 32, so BGP keeps using that next hop. B, every leaf in Amsterdam reruns a full SPF for each loopback. C, the designated router for the Singapore area must be re-elected before recovery. D, OSPF refuses to form adjacencies across summarised areas.

[think]

The answer is A: the summary still covers its slash 32, so BGP keeps using that next hop.

Remote routers hold only the aggregate, which stays up while any Singapore loopback exists, so the failure of one slash 32 is invisible to them, and BGP next-hop tracking sees nothing change. Traffic to the dead VTEP black-holes until the route reflectors' BGP sessions to leaf2.sin time out, seconds to minutes later. Summaries reduce SPF work rather than adding it, and fabric links elect no designated router.

## Question 3

Which property of IS-IS most directly explains why it can form adjacencies on a brand-new fabric link before any IP routing works there?

A, it refreshes its LSPs every 900 seconds instead of every 1,800. B, it runs directly in Ethernet frames rather than inside IP. C, it elects a DIS on every link before exchanging any hellos. D, its hellos use TCP, which retries until the link is ready.

[think]

The answer is B: it runs directly in Ethernet frames rather than inside IP.

IS-IS packets are carried straight in layer 2 frames, so two routers on a link can exchange hellos and LSPs with no IP addressing or routes in place, and no distant IP host can send them one. It does not use TCP, fabric links elect no DIS, and the refresh interval has nothing to do with bringing an adjacency up.

## Question 4

spine1.ams holds leaf3.ams's LSP at sequence number hex 2B, with 600 seconds of lifetime left. A copy arrives with the same sequence number, hex 2B, and a remaining lifetime of zero. What does spine1 do?

A, raises the sequence number to hex 2C and re-originates the LSP itself. B, treats it as a purge: deletes its copy and floods the purge on. C, sends its own copy back, because a live copy beats an expired one. D, ignores it, because the sequence number is not higher.

[think]

The answer is B: it treats it as a purge, deletes its copy and floods the purge on.

With equal sequence numbers, the zero-lifetime copy counts as newer: it is a purge. So spine1 removes the LSP's body, floods the purge to its other neighbours, and keeps the header for 60 seconds. Ignoring it would be right only for a true duplicate, and a router only ever re-originates its own LSPs.

## Question 5

The fibre between leaf3.ams and spine2.ams is cut. leaf1.ams has received leaf3's new LSP, which no longer lists spine2, but still holds spine2's old LSP, which still lists leaf3. What is leaf1's route to leaf3's loopback?

A, metric 30 via spine1, because one path is now longer. B, no route at all, because the two LSPs disagree. C, metric 20 via spine1 only, because the two-way check fails. D, metric 20 via both spines, until spine2's new LSP arrives.

[think]

The answer is C: metric 20 via spine1 only, because the two-way check fails.

SPF uses an edge only when both ends' LSPs list each other. leaf3's LSP no longer lists spine2, so the link between them is unusable even though spine2's stale LSP still claims it: one end's news is enough. The path through spine1 is unchanged at metric 20, so the route survives with one next hop instead of two.

## Question 6

Why does Meridian run every router as level 2 in one area, instead of making each site a level-1 area?

A, level-2 flooding is faster, because it uses CSNPs instead of PSNPs. B, level-1 leaves would get only a default route, but EVPN next hops need every loopback. C, level-1 areas cannot run over leased long-haul circuits between sites. D, IS-IS supports only one area per routing domain in practice.

[think]

The answer is B: level-1 leaves would get only a default route, but EVPN next hops need every loopback.

EVPN routes resolve their next hop, a remote leaf's loopback, through the underlay. A level-1-only leaf would have just a default route towards the nearest attached router, which many implementations will not use for next-hop resolution, and which hides a dead remote leaf. Leaking every loopback back in removes most of the benefit. The two levels flood the same way, and multiple areas are common.

## Question 7

In an RFC 7938 fabric, both spines are in AS 65100. leaf3.ams, in AS 65103, re-advertises leaf1's loopback to spine2.ams with the AS path 65103, 65100, 65101. What does spine2.ams do with it?

A, keeps it as a backup path in case its direct link to leaf1 fails. B, prefers it, because a path through a leaf spreads load better. C, discards it, because its own AS, 65100, is already in the path. D, installs it alongside the direct path as a two-way equal-cost route.

[think]

The answer is C: it discards it, because its own AS, 65100, is already in the path.

A router excludes any route whose AS path contains its own number, and spine2 shares 65100 with spine1, so every path through another spine is refused. That is the point of the shared spine AS: no spine-leaf-spine valley paths exist to fall back on, so a withdrawal is not followed by path hunting. Keeping it as a backup is what would happen with a unique number per spine, and it could never be equal-cost with the direct path, being longer.

## Question 8

All of Meridian's leaves in a site are put in AS 65101 to simplify the plan. leaf3.ams's sessions to both spines are Established, yet it has no route to leaf1.ams's loopback. What is the most likely explanation?

A, the spines are stripping 65101 from the path before sending it. B, the routes arrive but are denied, since 65101 is already in the path. C, the sessions need multihop because the leaves share an AS number. D, the spines refuse to send routes to a leaf that shares their AS.

[think]

The answer is B: the routes arrive but are denied, since 65101 is already in the path.

leaf1's route reaches leaf3 as 65100, 65101, and leaf3 is also 65101, so its loop check rejects it although nothing looped. The fix is allowas-in 1 on leaf3's sessions, or unique AS numbers. The spines are in 65100 and send normally, nothing strips the AS, and the sessions are directly connected eBGP, so multihop is irrelevant.

## Question 9

With BGP unnumbered, how does leaf1.ams learn the address of its peer on the port called swp51?

A, from an LLDP frame carrying the spine's loopback address. B, from the IPv4 slash 31 configured on swp51, by taking the other address. C, from the source of IPv6 router advertisements arriving on swp51. D, from a DHCP lease that the spine hands out on each fabric port.

[think]

The answer is C: from the source of IPv6 router advertisements arriving on swp51.

Every IPv6 interface has a link-local address, and the spine's router advertisements carry it as their source; BGP connects to that address on port 179, scoped to swp51. There is no slash 31 in an unnumbered design, which is the point. Neither DHCP nor LLDP forms the session, although LLDP is how you check that the cable goes where the plan says.

## Question 10

After a circuit failure, spine1.ams converges 52 milliseconds before the leaves. Why do some packets loop between spine1.ams and a leaf during that window?

A, IS-IS sends data packets along with the LSP until SPF completes. B, the leaf's old ECMP set still includes spine1.ams, so it may hash them back. C, the leaf's TTL check is disabled while it waits for its SPF delay. D, spine1.ams floods the packets to every leaf while its tables are empty.

[think]

The answer is B: the leaf's old ECMP set still includes spine1.ams, so it may hash them back.

spine1.ams's new path goes down through a leaf to spine2.ams. A leaf that has not yet converged still has spine1.ams in its equal-cost set, and for some flows its hash picks it, so the packet returns, again and again, until the TTL expires or the leaf updates. Routers do not flood data packets in a routed fabric, IS-IS carries no data, and TTL is always decremented.

## Question 11

IS-IS shows the new topology on a leaf within 120 milliseconds of a failure, but data-plane probes show loss lasting one and a half seconds. The leaf holds 20,000 tenant prefixes. What is the most likely explanation?

A, the flood to the leaf was paced at one LSP per 33 milliseconds per interface. B, its FIB rewrites the next hops of every prefix one by one. C, BFD on the leaf's uplinks is configured too aggressively for its CPU. D, the leaf's SPF computation takes over a second for 20,000 prefixes.

[think]

The answer is B: its FIB rewrites the next hops of every prefix one by one.

The protocol has converged, so the remaining delay lies between the RIB and the hardware. With a flat FIB every one of the 20,000 prefixes is rewritten, and at tens of thousands of writes a second that is around a second. A hierarchical FIB rewrites one next-hop group and moves them all at once. SPF and a single LSP flood take milliseconds, and an aggressive BFD causes false failures, not slow recovery.

## Question 12

After a line-card replacement on spine1, leaf1 shows its IS-IS adjacency to spine1 as Initializing, spine1 shows no adjacency to leaf1 at all, and an oversize-frame counter on spine1's port rises every few seconds. What is the most likely cause?

A, leaf1 was rendered as level 1 only while spine1 is level 2. B, the two ends use different hello intervals and hold times. C, the two ends are configured with different authentication keys. D, the replaced port has a smaller MTU than leaf1's padded hellos.

[think]

The answer is D: the replaced port has a smaller MTU than leaf1's padded hellos.

IS-IS pads hellos to the interface MTU, so leaf1's large hellos are dropped by spine1's smaller port while spine1's smaller hellos arrive. leaf1 hears the spine but is not listed in its hellos, so it sits in Initializing. An authentication or level mismatch fails in both directions and leaves both sides Down, and different hello timers do not block an IS-IS adjacency at all.

## Question 13

During an outage, every IS-IS adjacency stays Up, but every router's link-state database in all three sites drops from about 70 LSPs to two in the same second, and tenant traffic stops. Where should you look first?

A, at hello timers, since adjacencies must be flapping too fast to see. B, at the BGP route reflectors, since EVPN routes are being withdrawn. C, at purges in the database, and the router named in their purge-originator TLV. D, at the optics and CRC counters on the spine uplinks across the site.

[think]

The answer is C: at purges in the database, and the router named in their purge-originator TLV.

Adjacencies up with the database collapsing everywhere at once is the signature of purges, which any router can send and which flood the whole area. The purge-originator TLV names the router that sent them, so check its clock. Link faults would take adjacencies down, the reflectors only show the symptom of next hops no longer resolving, and flapping adjacencies would show transitions, not a steady Up.

## Question 14

A two-spine site has already lost spine1 to a hardware fault. Someone now starts maintenance on spine2. Which cost-out method keeps leaf-to-leaf traffic flowing?

A, raising its metrics to the maximum, 16,777,214, because that path remains a last resort. B, neither one, because IS-IS needs at least one spine left at normal metric. C, either one, because both leave spine2 reachable and usable as before. D, setting the overload bit, because it removes spine2 cleanly from ECMP.

[think]

The answer is A: raising its metrics to the maximum, because that path remains a last resort.

A maximum metric still lets SPF use spine2 when it is the only path, at a cost of about 16.8 million between leaves. The overload bit is absolute: spine2 stays reachable itself but is never used for transit, so every leaf loses every other leaf. The two tools behave identically only while other spines exist, and a pre-check should block the change either way.

## Recap

Three ideas kept coming back. A route is only as good as what it checks: a static route tests only its own uplinks, a summary hides a dead loopback, and a port that stays lit hides a broken circuit, so traffic keeps flowing into the failure. Link-state flooding is powerful in both directions: one end's news removes a link, and one router's purge empties every database in the domain. And the small rules decide outcomes: a shared spine AS refuses valley paths, a shared leaf AS refuses real ones, and the overload bit forbids transit even when it is the only path left.
