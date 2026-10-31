---
lesson: is-is-from-zero
source: 80dec1fcc1f17e04
fit: partial
desk:
  - "The IS-IS vocabulary table, the hello frame field by field and the NET breakdown"
  - "The three-way hello timeline and the illustrative adjacency output"
  - "The LSP header and TLV tables, and the code that builds and parses leaf1.ams's LSP with its checksum"
  - "The sequence-number worked cases table"
  - "The flooding simulation and the IS-IS flooding visualisation"
  - "The SPF table from leaf1.ams, the levels diagram and the overload versus maximum metric table"
  - "The IS-IS, OSPF and eBGP comparison table, and the failure modes table"
  - "The database consistency checker and its findings"
  - "Exercise: compute IS-IS routes and ECMP next hops from an LSDB"
---
## Introduction

Every BGP session, VXLAN tunnel and RoCE flow in a fabric is addressed to some device's loopback, the always-up virtual interface that names a router. The underlay's single job is to make every loopback reachable from everywhere, and to fix the paths within milliseconds when a fibre is cut.

Meridian does it with IS-IS, a link-state protocol: every router describes its own links in a small record, every router gets a copy of every record, and each computes shortest paths over the identical map. The engineering is in keeping those copies identical and current with no central server, no loops, and no dependence on the IP routing being built. We follow a router's order: find neighbours, advertise, spread and expire, then compute.

## An OSI protocol below IP

IS-IS was designed at Digital Equipment Corporation in the late 1980s, and standardised by ISO in 1992. It routed CLNP, the network protocol of the OSI suite, which was meant to replace TCP/IP and mostly did not. In 1990 an RFC added IP prefixes, and that is what routers run today. The vocabulary stayed. An intermediate system is a router. An LSP, a link-state PDU, is one router's description of its own links and prefixes. The set of everyone's LSPs, the link-state database, is the map.

The idea that made IS-IS age well is the TLV: type, length, value. A router that meets a type it does not understand skips it using the length byte, and floods the LSP on unchanged. That is how IPv6, traffic engineering and segment routing arrived, one router at a time.

Built for a network layer that was not IP, IS-IS does not ride inside IP at all: its packets sit directly in Ethernet frames. Four consequences. Adjacencies form before any IP route exists, so flooding never waits for the routing it builds. Nothing off the wire can reach it: no router forwards these frames. IPv4 and IPv6 are just TLVs in one instance. And there is no fragmentation. LSPs are built no larger than 1,492 bytes, and hellos are padded to the interface's MTU, so an MTU mismatch shows up as an adjacency that never forms.

How it breaks: anything that filters those multicast frames, a misprogrammed trap, the switch's CPU rate limiter, a carrier circuit that does not pass them, silently prevents the adjacency while ping works. The signal is hello counters: sent rising, received flat. Ping proves nothing about IS-IS.

## Names, hellos and adjacencies

Each router has a system ID, six bytes unique across the domain, and a NET, its OSI address: area plus system ID. Meridian derives the system ID from the loopback: pad each octet to three digits and regroup the twelve digits in fours. leaf1.ams, 10.255.1.11, becomes 0102, 5500, 1011. The NET puts 49, private addressing, and the area, 0001, in front. Unique loopbacks give unique system IDs for free. When two routers do share one, each keeps replacing the other's LSP, and its sequence number climbs by dozens a minute.

An adjacency is a neighbour relationship on one link. Hellos go every 10 seconds by default, with a holding time of 30; fabrics often leave fast detection to BFD.

A hello proves my frames reach you only if you tell me so. Watch leaf1.ams and spine1.ams bring up their link. leaf1 sends a hello: "I am down, and I have heard nobody." spine1 hears it and moves to Initializing. Its own hello says "Initializing, and I have heard leaf1." leaf1 sees itself listed and goes Up, and its next hello says "Up, and I have heard spine1." spine1 sees itself listed and goes Up too.

Before this three-way extension, any hello brought the adjacency up, so a fibre failed in one direction gave an adjacency one side believed in and the other could not use. Now an adjacency stuck in Initializing means frames flow one way only. If spine1 shows leaf3 stuck in Init, look at the spine1-to-leaf3 direction: that optic, leaf3's receive counters.

Hellos are also checked for a shared level, matching authentication and a padded hello that fits; the full checklist is in the underlay failures lesson. And fabric links run point-to-point: electing a designated router for a two-router fibre buys nothing.

## LSPs, sequence numbers and lifetime

An LSP says: this is me, these are my neighbours with their metrics, these are the prefixes I own. In full-size Amsterdam, leaf1.ams lists its four spines at metric 10, the graph's edges, plus its loopback and uplink subnets: 146 bytes. A checksum guards it, because a corrupt LSP installed everywhere gives every router the same wrong map. It skips the remaining lifetime, which changes every second.

Two fields decide which copy is the truth. The sequence number is a 32-bit counter the originator raises whenever it changes anything. The higher number wins. If the numbers are equal and one copy has zero lifetime left, that copy, a purge, wins. Otherwise they are the same.

The remaining lifetime counts down from 1,200 seconds on every router's copy. The originator refreshes every 900 seconds, with the sequence plus one; many operators raise the lifetime to its maximum, about 18 hours. A copy that reaches zero is purged: stripped to its header, flooded with lifetime zero, and the header kept 60 seconds more so late stale copies are beaten.

Follow leaf3.ams's LSP, held everywhere at sequence 42. The fibre between leaf3 and spine2 is cut, and leaf3 rebuilds at 43. spine1 sees a newer copy: it installs, acknowledges, floods it on. A slow neighbour re-sends the old 42, and spine1 sends 43 back. If leaf3 died for good, its copy would be purged after 1,200 seconds.

Instead, leaf3 reboots and starts its sequence numbers at 1, while the network still holds 43. Why doesn't the network ignore it?

[pause]

Because its neighbour sends the newer copy, 43, back. leaf3 sees "its own" LSP numbered above anything it holds, and re-originates at 44. The network remembers a higher number than the router does, and the originator outbids it, instead of waiting 20 minutes for the stale copy to age out.

How it breaks: any router may purge any LSP, so one router aging LSPs wrongly can delete the map from every database in the area. The underlay failures lesson traces a purge storm caused by a clock jump at boot. The signals: purge counters, the purging router's name where routers record it, the lowest remaining lifetime in the database, and how fast each sequence number moves.

## Flooding and SPF

A router receiving an LSP newer than its copy installs it, acknowledges it, and sends it on every other adjacency; a duplicate is acknowledged and goes nowhere; an older copy gets the newer one sent back. There is no time to live and no loop, because each router passes each version on at most once.

On point-to-point links, a sent LSP is resent every 5 seconds until the neighbour acknowledges it with a PSNP, a partial list of LSP IDs and sequence numbers. A CSNP is the complete list of everything a router holds. When an adjacency comes up, both sides send one; whoever has the newer copy of an entry sends it, and whoever lacks it asks with a PSNP.

Here is the flood after the cut, on the small Amsterdam fabric of two spines and four leaves, one millisecond per round. Round one: leaf3 sends to spine1, its only remaining neighbour. Round two: spine1 installs it and sends to leaf1, leaf2 and leaf4, not back to leaf3. Round three: each leaf sends it to its other neighbour, spine2. spine2 receives three copies at once, installs one, drops two as duplicates, acknowledges all three, and has nobody left. Seven transmissions, three hops.

On the full-size site, 20 routers need 19 deliveries, but the flood makes 63, about one per link, because every leaf hears it from each spine. When a link drops large frames, or a CPU is too busy, one database falls behind. The signal: every router's LSPs and sequence numbers, compared.

Then each router runs Dijkstra's shortest-path-first algorithm, SPF, from itself, with three details.

First, the two-way check: an edge between two routers is used only if each one's LSP lists the other. When leaf1 holds leaf3's new LSP but still spine2's old one, the link is already gone. One end's news is enough.

Second, a router needs next hops, not just distances: the first hop of every shortest path, all of them when several tie. That set becomes an ECMP group. Healthy, leaf1 reaches leaf3 at metric 20 through both spines. After the cut it is still 20, through spine1 only. And spine2 now reaches leaf3 at metric 30: down to any of three leaves, up to spine1, down again.

Third, topology first, prefixes after: a route's metric is the distance to the router plus the prefix's own metric, so a prefix-only change skips the full SPF.

It is cheap: under a millisecond for 1,000 routers in pure Python, and Meridian has about 70.

## Levels, metrics and the overload bit

IS-IS has two levels, separate flooding domains: level 1 inside an area, level 2 the backbone between areas. An area belongs to a router, so boundaries fall on links between routers. Level-1 routers see only their area, plus a default route towards the nearest router that sets the attached bit.

Meridian rejected per-site areas because of the overlay. An EVPN route's next hop is a remote leaf's loopback: leaf1.ams's route to acme-web2 points at leaf2.sin. A level-1 leaf would have only the default, which many BGP implementations refuse for next-hop resolution, and which hides a dead remote leaf. Leaking every loopback back in removes most of the benefit. At about 70 routers, one level-2 domain is small, so every Meridian router is level 2 only.

Metrics. The original narrow metric was 6 bits, 1 to 63 per link. Against a 1 terabit reference, a 10 gigabit link needs 100, which does not fit. Wide metrics carry 24 bits per link, up to about 16.7 million. Meridian sets leaf-spine links to 10, and long-haul circuits to their one-way latency in microseconds: about 52,500 from Amsterdam to Singapore. The top value means "never use this link"; one below it is the usual cost-out value. The trap is migration: a router reading only one style computes a different graph from its neighbours, and different graphs loop. Advertise both everywhere first, then wide only.

The overload bit is one flag that says "do not route through me": its own prefixes stay reachable, but no path continues through it. Route reflectors carry it permanently, so a cut never makes one a transit path. A booting router sets it while still programming its chip, and clears it when BGP converges or a timer expires, 180 seconds on Meridian's spines. Maintenance uses it to move transit off a spine at once.

But overload means never transit, even as the only path, while maximum metric means transit only as a last resort. Watch the flag against intent: one a boot timer should have cleared ten minutes ago is capacity silently lost.

## Why backbones choose it, and the interview

Many of the largest ISP backbones adopted IS-IS in the 1990s and kept it, for these mechanisms. One flat level scales: one LSP per router, at most two transmissions per link per change, so thousands of routers need no area design. Unknown TLVs flood unchanged, so features arrive a router at a time. It is independent of IP. One LSP format per level means fewer moving parts than OSPF's many advertisement types. And a drain is one metric or one bit, computable in advance. The case against, inside one data center, is the next lesson's eBGP underlay, which confines a bad router's damage, where an IS-IS purge reaches everyone in its level.

Now the interview. "IS-IS doesn't run over IP. Why does that matter?"

[pause]

Adjacencies and flooding work before any IP route exists, nothing off the wire can reach it, and IPv4 and IPv6 share one instance. The cost is no fragmentation, so hellos are padded to catch MTU mismatches, and ping between neighbours proves nothing. The wrong answer is "it runs over UDP".

"Overload bit or maximum metric, to drain both spines of a small pod?"

[pause]

Maximum metric, because overload forbids transit even as a last resort, so overloading both spines partitions the leaves. The wrong answer is "they're equivalent". And honestly: I'd defer to the network team on their platforms' drain behaviour, but I'd make the tooling refuse any drain that leaves a loopback unreachable, which it can compute from the database first.

## Recap

Five things. IS-IS runs on layer 2, not IP, so it bootstraps itself and pads hellos to expose MTU mismatches. Newer means a higher sequence number, then a purge, and any router can purge any LSP. Flooding is forward only if newer, acknowledge everything. One level-2 domain keeps every loopback visible to the overlay. And overload is for reflectors and single boxes, maximum metric when more go at once. Build tooling on database consistency, sequence velocity, lifetimes, purges and overload state, not adjacency state alone.

At your desk: the field tables and LSP code, the flooding simulation and visualisation, the SPF table, the comparison and failure tables, the database checker, and the SPF exercise.
