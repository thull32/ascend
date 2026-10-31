---
lesson: bgp-as-the-underlay
source: 3c3ae26591bd531e
---
## 1

In an RFC 7938 fabric, both spines are in AS 65100. leaf3.ams, in AS 65103, re-advertises leaf1's loopback to spine2.ams with the AS path 65103, 65100, 65101. What does spine2.ams do with it?

A, keeps it as a backup path in case its direct link to leaf1 fails. B, prefers it, because a path through a leaf spreads load better. C, discards it, because its own AS, 65100, is already in the path. D, installs it alongside the direct path as a two-way equal-cost route.

[think]

The answer is C: it discards it, because its own AS, 65100, is already in the path.

A router excludes any route whose AS path contains its own number, and spine2 shares 65100 with spine1, so every path through another spine is refused. That is the point of the shared spine AS: no spine-leaf-spine valley paths exist to fall back on, so a withdrawal is not followed by path hunting. Keeping it as a backup is what would happen with a unique number per spine, and it could never be equal-cost with the direct path anyway, being longer.

## 2

An operator gives every spine its own AS number, 65201, 65202 and so on, and leaves the leaves at 65101 upwards, with default multipath settings. What changes for traffic between leaves?

A, traffic doubles, because valley paths are added to the equal-cost set. B, each leaf uses one spine, because the paths' AS numbers now differ. C, nothing, since all the AS paths are still two numbers long. D, the leaves reject every route, because each spine's number repeats.

[think]

The answer is B: each leaf uses one spine, because the paths' AS numbers now differ.

Paths via spine1 and spine2 now read 65201, 65101 and 65202, 65101: the same length but different numbers, and standard multipath requires identical AS paths, so the leaf installs one next hop until multipath relax is enabled. Equal length is why the "nothing changes" answer is tempting, but length is not what multipath compares. Valley paths do become possible at the spines, but they are longer and never enter a leaf's equal-cost set.

## 3

All of Meridian's leaves in a site are put in AS 65101 to simplify the plan. leaf3.ams's sessions to both spines are Established, yet it has no route to leaf1.ams's loopback. What is the most likely explanation?

A, the spines are stripping 65101 from the path before sending it. B, the routes arrive but are denied, since 65101 is already in the path. C, the sessions need multihop because the leaves share an AS number. D, the spines refuse to send routes to a leaf that shares their AS.

[think]

The answer is B: the routes arrive but are denied, since 65101 is already in the path.

leaf1's route reaches leaf3 as 65100, 65101, and leaf3 is also 65101, so its loop check rejects it although nothing looped. The fix is allowas-in 1 on leaf3's sessions, or unique AS numbers. The spines are in 65100 and send normally, nothing strips the AS, and the sessions are directly connected eBGP, so multihop is irrelevant.

## 4

With BGP unnumbered, how does leaf1.ams learn the address of its peer on the port called swp51?

A, from an LLDP frame carrying the spine's loopback address. B, from the IPv4 slash 31 configured on swp51, by taking the other address. C, from the source of IPv6 router advertisements arriving on swp51. D, from a DHCP lease that the spine hands out on each fabric port.

[think]

The answer is C: from the source of IPv6 router advertisements arriving on swp51.

Every IPv6 interface has a link-local address, and the spine's router advertisements to all nodes carry it as their source; BGP connects to that address on port 179, scoped to swp51. There is no slash 31 in an unnumbered design, which is the point. Neither DHCP nor LLDP forms the session, although LLDP is how you check that the cable goes where the plan says.

## 5

A principal engineer asks why Meridian runs IS-IS rather than eBGP in its underlay. Which answer is strongest?

A, eBGP cannot carry loopbacks, so a link-state protocol must do that. B, eBGP needs a route reflector on every spine, which IS-IS does not. C, IS-IS suits one routing domain across sites, while eBGP suits one large site and one team. D, IS-IS converges faster, while eBGP takes seconds to react to failures.

[think]

The answer is C: IS-IS suits one routing domain across sites, while eBGP suits one large site and one team.

A multi-site backbone run as one domain benefits from a full topology map, detours instead of drops, metric-based draining and no AS plan across sites, while a single huge data center gains from one protocol, local failure handling and policy at every hop. With fabric timers, link-down teardown and BFD, both converge in well under a second, so speed is not the reason. eBGP carries loopbacks routinely and needs no reflectors, since it re-advertises on its own.
