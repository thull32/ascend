---
lesson: route-reflectors
source: 4a75791e16d7ecf2
fit: great
desk:
  - "The reflection rules table, the session arithmetic table and the trade-offs table"
  - "The byte layout of the originator ID and cluster list attributes, and of an ADD-PATH announcement"
  - "The route reflector visualisation: full mesh, the pair, the two loop checks, and one then both reflectors failing"
  - "The traced route table and the reflection simulator with its three runs"
  - "The confederation path table, the failure timelines and the failure-mode table"
  - "The static-check code for identifiers, racks and client sessions"
  - "Exercise: decide what a route reflector does with one route"
---
## Introduction

Amsterdam has 16 leaves, and each holds tenant routes the others need. Acme's 10.1.2.0 slash 24 lives behind leaf3.ams, and leaf1.ams must learn it. They all speak iBGP, BGP inside one autonomous system, here AS 65000. And iBGP never passes a route learned from one iBGP peer on to another. So every leaf needs a session to every other: 120 sessions for 16 leaves, 1,128 if three sites' 48 leaves shared one mesh. Adding leaf17 would mean changing 16 routers that have nothing to do with it.

A route reflector removes the mesh. It is an iBGP speaker allowed to break the rule, so each leaf needs two sessions, one to each reflector of a pair, however large the site grows. On Meridian every leaf is a client of rr1.ams and rr2.ams, and the reflectors of the three sites peer with each other.

Breaking a loop-prevention rule has consequences, and they are the lesson: the reflection rules, the two attributes that catch the new loops, pairs and placement, hidden paths, and what happens when one reflector fails, then both.

## The reflection rules

Inside one AS the AS path never grows, so it cannot reveal a loop; that is why iBGP never relays. Route reflection, RFC 4456, relaxes the rule. A client is an iBGP peer the reflector has been told is its client; the client has no setting and does not know. A non-client is any other iBGP peer; Meridian's reflectors are non-clients of each other. A cluster is a reflector plus its clients, and its cluster ID is a 32-bit number written like an IPv4 address. Both Amsterdam reflectors use 10.255.1.100.

Who hears a reflector's best path depends on where it came from. From a client: every client and every non-client, because clients have no mesh. From an eBGP peer: also everyone, as in ordinary BGP. From a non-client: clients only.

That third rule is the one to remember. The reflectors form a small mesh of ordinary iBGP peers, 15 sessions for Meridian's six, and each heard the route from its source. So a route rr1.sin learns from rr1.ams goes to Singapore's leaves and to nobody else.

Two more properties. A reflector reflects only its best path. And it changes no forwarding attribute: not the next hop, not the AS path, not local preference. Every client sees the route as if it had a session to the originator, with the originator's loopback as next hop.

The arithmetic: for four leaves, reflectors cost more than the mesh, 9 sessions against 6. For Amsterdam's 16, 33 against 120. For three sites, 111 against 1,128. The point is the growth, two per router instead of roughly n squared over two, and a new leaf touches no existing router.

## Two loop guards, and one route's journey

With split horizon off, two reflectors could pass a route around a cycle forever. So RFC 4456 adds two optional, non-transitive attributes, which never leave the AS.

The originator ID, attribute type 9, is the router ID of the speaker that injected the route. The first reflector writes it and nobody changes it. A router receiving a route with its own router ID as originator ID discards it: the route has come home. The cluster list, type 10, holds the cluster IDs the route was reflected through, newest first. A reflector that finds its own cluster ID in the list discards the route: the iBGP equivalent of AS path loop detection. Both also enter best path: a reflected route compares its originator ID where BGP would compare router IDs, and a new step prefers the shorter cluster list.

Now follow Acme's prefix from leaf3.ams to acme-web2 on leaf2.sin in Singapore. leaf3 advertises it to both Amsterdam reflectors. rr1.ams learned it from a client, so it tells everyone. The other Amsterdam leaves get it with originator ID 10.255.1.13, leaf3's router ID, and cluster list 10.255.1.100, plus an identical copy from rr2.

rr1 also sends it to its partner, rr2.ams. Before I tell you: does rr2 keep that copy?

[pause]

It discards it. Its own cluster ID, the shared 10.255.1.100, is already in the list, and the same happens in reverse. Both reflectors also send the route to the reflectors in Singapore and San Jose, so rr1.sin holds two copies. Originator IDs tie, cluster list lengths tie at one, and the lower peer address, rr1.ams's, wins. Having learned it from a non-client, rr1.sin sends it to Singapore's leaves only, with 10.255.2.100 now first in the list. leaf2.sin holds two copies, and the next hop is still 10.255.1.13. It resolves that through IS-IS and sends VXLAN straight to leaf3.

Two moments carry the design. rr1.sin never hands the route to another reflector, so the reflector mesh cannot loop. And the next hop names the leaf, never a reflector, so reflectors carry no traffic.

The guards compare identifiers, so duplicated identifiers make them discard good routes. Two leaves sharing a router ID each lose the other's routes; two sites sharing a cluster ID lose each other's. The signal is the per-peer count of routes discarded for an originator or cluster loop.

## Pairs, cluster IDs and placement

A reflector is a single point of failure for every route it carries, so reflectors come in pairs and every client peers with both. The design question is the cluster ID.

Meridian shares one ID across the pair. Each reflector discards the other's copies and holds one path per client route, so memory is minimal. The cost appears when one client session is down. If leaf3's session to rr2 drops, rr2 cannot use rr1's copy, so every other leaf holds leaf3's routes from rr1 alone. Nothing is lost yet, but redundancy has quietly fallen to one reflector.

With one cluster ID per reflector, rr2 accepts rr1's copy and keeps serving leaf3's routes, at roughly twice the paths. For about 1,300 overlay routes per site that is negligible; for several full internet tables of about a million prefixes each, it is real memory. Both designs are common. Either way, the cluster ID must be unique across clusters: copy Amsterdam's into Singapore's reflectors by template and they discard every route reflected from Amsterdam, with every session Established.

Because the next hop never changes, no tenant packet crosses a reflector. So Meridian puts rr1.ams and rr2.ams beside the fabric: x86 servers running a BGP daemon such as FRRouting, attached to different spines, on separate racks and power feeds. That buys CPU and memory, which is what a reflector needs, and maintenance with no traffic impact. Small fabrics still make the spines the reflectors to save hardware.

Out of the path must also mean out of the IGP's path. To IS-IS, a reflector is a router between two spines, and during a link failure it could carry transit traffic in software. So Meridian sets the IS-IS overload bit: reach my addresses, never route through me. And a reflector never rewrites next hops: next-hop-self on rr1 would send every leaf's VXLAN to a box that is not a tunnel endpoint, and the overlay would black-hole.

## Hidden paths, ADD-PATH and confederations

A reflector advertises one path per prefix, so any other path it holds is hidden. Amsterdam's internet gateways, gw1.ams and gw2.ams, are clients like any leaf, and each originates a default route. Everything ties, so both reflectors pick gw1 on router ID, and leaf1 receives two paths that both say gw1.

The consequences: no load sharing, because multipath can only spread over paths a router holds, so gw2 idles. And slower failover: when gw1 dies, IS-IS withdraws its loopback in about a second, but the leaves have no other path and wait for the reflectors to send gw2's. That is tens to hundreds of milliseconds more, or nine seconds if a reflector notices only by hold timer.

Two fixes. VPN families attach a route distinguisher to every prefix, built on Meridian from the leaf's loopback and the VNI, so the same tenant prefix from two leaves is two routes and both are reflected: the standard cure in EVPN. Or ADD-PATH, RFC 7911, negotiated per address family, with the reflector allowed to send and the client to receive. Each announcement carries a 4-byte path identifier, so two paths for one prefix no longer replace each other. leaf1 holds both gateways, spreads flows with multipath, and drops gw1 locally the moment IS-IS removes its loopback. Negotiated in one direction only, or with multipath off, ADD-PATH changes nothing.

Confederations, in brief, are the other way to avoid the mesh: split the AS into member ASes with eBGP-like sessions between them, while the world still sees one AS. But every router's configuration changes, while reflection changes only the reflectors. So iBGP overlay fabrics choose reflectors, and confederations live in large provider backbones and after mergers.

## When one reflector fails, and then both

rr1.ams loses power. Tenant traffic is unaffected: no packet crosses it. About a second later IS-IS removes its loopback, and within 9 seconds without BFD every leaf's hold timer expires and deletes rr1's paths. Best path moves to rr2's identical copy, with the same next hops, so the forwarding table does not change.

Nothing a user sees changes, and that is the danger. The site runs on one reflector, and the only signal is a session down and every prefix arriving from one source.

Now both reflectors fail, with every spine, link and IS-IS adjacency healthy. What happens to traffic from acme-web1 on leaf1 to acme-db1 on leaf3?

[pause]

It stops. Within 9 seconds every leaf deletes every overlay route learned from the reflectors, and traffic between leaves stops; only hosts on the same leaf still talk. The routes survive as stale only with graceful restart, and only when the session dropped without a NOTIFICATION, as in a process restart, for the restart time, 120 seconds being a common default. Even then nothing new is learned.

Double failures come from what the pair shares: one rack, power feed or hypervisor; the same software receiving the same UPDATE that crashes both daemons; or both changed in one window. Work on one at a time, after checking the other holds the full table.

So the platform should show, per leaf, reflector sessions up out of two: two green, one yellow, zero red. A dashboard that turns red only at zero misses the point of the pair. Diff the two reflectors' tables, alarm on any loop discard, time a beacon route between leaves, and check before deploy that identifiers are unique, overload bits are set, every leaf is a client of both reflectors, and the pair shares no failure domain.

## In the interview

A principal engineer asks: why do we need route reflectors, and what do they cost?

[pause]

iBGP never relays iBGP-learned routes, because the AS path cannot catch loops inside an AS, so without help every speaker needs a session to every other. A reflector relays for its clients, so sessions grow as two per router and a new router touches only the reflectors. The costs: loops become possible, closed by the originator ID and cluster list; clients see only each reflector's best path, chosen from the reflector's position; and the pair becomes a shared fate. The common wrong answer is "to reduce routing table size". A reflector reduces sessions, not routes.

A follow-up: how do you load-share across two exits? Make the clients see both paths, with ADD-PATH or per-router route distinguishers, then enable multipath. "Just enable multipath" is wrong: with one path received, there is nothing to spread over.

## Recap

Four things to remember. Routes from clients and eBGP peers are reflected to everyone, routes from non-clients to clients only, which keeps the reflector mesh loop-free. The originator ID stops a route returning home and the cluster list stops it circling, and duplicated identifiers turn both against good routes. Reflectors sit out of the forwarding path, with unchanged next hops and the overload bit, and a shared cluster ID trades memory for redundancy that quietly erodes. And a reflector hides all but its best path, cured by ADD-PATH or route distinguishers plus multipath; when both reflectors fail, the overlay stops on a healthy underlay.

At your desk: the rules, session and trade-off tables, the attribute layouts, the route reflector visualisation, the traced route and simulator, the confederation and failure tables, the static checks, and the reflection exercise.
