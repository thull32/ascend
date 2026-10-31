---
lesson: underlay-failures-in-production
source: abe56396c92789fb
fit: great
desk:
  - "The point-to-point hello field by field, and the system ID derived from the loopback"
  - "The illustrative adjacency and oversize-counter output from the MTU mismatch"
  - "The checklist as code, its seven cases, and the table of checks against adjacency states"
  - "The dampening simulation and its penalty trace"
  - "The purge storm timeline, the wall-clock versus countdown aging code, and the purge storm visualisation"
  - "The cost-out SPF code with its two-spine edge case, and the spine drain visualisation"
  - "The failure-mode and trade-off tables, and the platform checklist"
---
## Introduction

The underlay fails in two shapes. In the common one, a single adjacency, two neighbouring routers agreeing to exchange routing information over their link, refuses to come up, and one link's worth of capacity is missing until someone finds the mismatched setting. In the rare one, every link stays up while the routers' shared map of the network empties, and every loopback, BGP session, VXLAN tunnel and tenant above it goes with it.

The examples run on Meridian's IS-IS underlay, one level-2 domain spanning all three sites. Four ideas: scope first, the adjacency-down checklist, what flapping costs, and a purge storm in which one leaf's clock erased the topology everywhere. Then how to take a device out of service safely.

## Scope first

Before you run anything, ask how much is broken, because each scope shares something different, and what is shared is the suspect.

One adjacency down while both routers' others are up: one link. A cable, two optics, two configurations; run the checklist on both ends. Every adjacency on one router down at once: one device. Its IS-IS process, its CPU, its configuration, its release, its clock. The same kind of adjacency down on many routers at once: one change, so read the change log of the last hour. And every adjacency up but routes missing on every router: the link-state database itself.

That last one needs a reminder. An LSP is one router's description of itself, and every router keeps every LSP in its link-state database and runs SPF over it. The database is the same on every router in the flooding domain, so a fault there breaks everywhere at once, even when the cause sits on one box.

The one-box case: leaf2 in Amsterdam loses all four spine adjacencies in the same second. Four cables do not fail together. A host behind it is flooding ARP, which the leaf punts to its CPU, and the shared control-plane policer drops the IS-IS hellos with it. Checking each link on its own would find nothing wrong.

## The adjacency-down checklist

IS-IS runs directly on layer 2. Each router sends hellos on every enabled interface, every 10 seconds with a 30 second holding time on Meridian. A hello is a list of claims about the sender; the receiver checks each against its own configuration and silently discards a hello that fails, apart from a counter. Knowing what a hello carries is knowing the checklist.

Adjacency state is per side. Down: no acceptable hello heard. Initializing: acceptable hellos arrive, but they do not list me yet. Up: they list me, so the neighbour hears me too. One side Initializing and the other reporting nothing means a fault in one direction only.

Work bottom-up, the way the hello travels, and check both ends. First, the interface: the link down, IS-IS off at one end, the wrong neighbour cabled, or one end broadcast and the other point-to-point, so each discards the other's hellos as the wrong type.

Second, MTU, the largest frame a port accepts; Meridian's fabric ports take 9,216 bytes. IS-IS has no fragmentation, so it deliberately pads its hellos to the full interface MTU, and the adjacency comes up only if the link carries full-size packets. Without padding, small hellos would pass and any LSP too big for the smaller end would be dropped forever, with routes missing for no visible reason. Padding makes that silent failure loud.

Picture it. spine1 gets a replacement line card, and its port to leaf1 comes back at the default MTU of 1,500. Which side ends up in which state?

[pause]

leaf1's hellos, padded to about 9,200 bytes, are dropped by spine1's port as oversize frames before IS-IS sees them. spine1's 1,500-byte hellos reach leaf1, but do not list it, because the spine has never heard it. So leaf1 sits in Initializing, and spine1 has no adjacency at all. The fingerprint: the oversize counter on spine1's port rising by one every 10 seconds, one per hello.

Third, authentication, where hellos and LSPs are often keyed separately. Hello keys differ: both sides stay Down, with authentication failures counted at both ends. Hellos match but LSP keys do not: the adjacency comes Up, but each side rejects the other's LSPs, so the neighbour's prefixes never enter the database while the adjacency dashboard stays green. And key chains carry wall-clock lifetimes, so a device with a wrong clock picks the wrong key by itself.

Fourth, level and area. An adjacency forms only at a level both ends run, and a level-1 adjacency also needs an area in common. Meridian is all level 2, so the classic breakage is a template rendering a new leaf as level 1 only: no shared level, both Down.

Fifth, a duplicate system ID. Between neighbours, each refuses a hello carrying its own ID, and both stay Down. Between routers that are not neighbours it is worse. Each receives "its own" LSP with a higher sequence number and contents it did not write, and re-originates with the number plus one to out-number it. The other does the same. The sequence number climbs several times a second, every router reruns SPF on every flip, and routes to both flap area-wide. The signal: one LSP ID rising far faster than the normal refresh of about once every 15 minutes.

Sixth, timers, the odd one out. Each router advertises its own holding time and the neighbour uses it, so in IS-IS the intervals need not match: leaf1 can send every 10 seconds while spine1 sends every 3. OSPF is different; there, they must match. Timers break IS-IS another way: a holding time too close to the hello interval drops the adjacency whenever one hello is late, and a CPU busy with a big SPF or an upgrade sends hellos late. Fabrics keep hellos moderate and detect failures with BFD.

## Flapping and dampening

A flap is a link going down and up repeatedly, usually from a dying optic or a dirty connector. A dead link costs one convergence event; a flapping one costs one every few seconds, paid by every router in the area: new LSPs flooded, SPF everywhere, hardware reprogrammed, traffic on the link lost until it moves. In an area of 500 routers, one transition costs about 500 SPF runs, and a flap is two transitions.

Debounce timers at the interface hide brief glitches, and backoff in the protocol caps the CPU cost, but neither stops traffic chasing the link. Dampening does.

Dampening keeps a penalty per link. Each flap adds 1,000, the penalty halves every 5 seconds, above 2,000 the link is held down, and it returns when the penalty decays below 1,000, never more than 20 seconds later. Take an optic that drops for 200 milliseconds every 2 seconds, seven times. The second flap brings the penalty to about 1,760, still in use; the third to about 2,330, held down. Later flaps never reach IS-IS, and the link returns about 9 seconds after the last. Fourteen adjacency transitions undamped; six damped. Too aggressive, though, and a healthy link stays out while ECMP quietly runs on three uplinks of four, so export suppression as its own status.

## The purge storm

This failure emptied every router's map while every link and adjacency stayed up. One mechanism first.

Every LSP carries a remaining lifetime, 1,200 seconds by default, which every router counts down; the originator refreshes about every 900 seconds. If a copy reaches zero, the router holding it purges it: floods it with a lifetime of zero and its body removed, and every router deletes it and floods the purge on. A dead router cannot withdraw its own LSP, so stale descriptions must expire by themselves, and any router may notice first. The consequence is the whole story: any router can delete any other router's LSP from every database. The originator's one defence is to re-issue with a higher sequence number when it sees its valid LSP purged.

Now the setting. Meridian had moved its switches' time sync, NTP, off the out-of-band management network to a server reached through the fabric itself. And leaf4's network operating system stored each LSP's expiry as an absolute wall-clock time instead of counting the lifetime down.

leaf4 reboots after an upgrade, and its hardware clock has lost its setting: it believes it is the first of January, 2000. Forty-one seconds in, its adjacencies to both spines come up, and it receives the other five LSPs, and stores their expiries, in the year 2000. Eleven seconds later, with the underlay up, its NTP query reaches the server, and NTP steps the clock forward about 26 years and 10 months. What does leaf4 now believe about every LSP it holds?

[pause]

Every expiry is 26 years in the past. On its next aging pass leaf4 purges all five, sequence numbers unchanged. A purge beats a stored copy with the same sequence number, so within milliseconds every router deletes every LSP except leaf4's and its own. SPF finds almost nothing, every EVPN next hop stops resolving, the VXLAN tunnels come down, and tenant traffic stops. No link went down, and a dashboard of adjacency states stayed green throughout.

Then the originators fight back, re-issuing with the sequence number plus one. The higher number beats the purge, the new copies flood, and SPF rebuilds.

Why the whole domain? A purge's blast radius is the flooding domain, and Meridian's spans all three sites, about 70 routers. On the real fabric leaf4 purges about 69 LSPs, and Singapore and San Jose lose their topology in the same second as Amsterdam. One leaf's clock, a three-site outage.

Why minutes? Flooding is paced, about 33 milliseconds between LSPs by a common default, and SPF throttles back off during the churn: seconds of outage, close to Meridian's 9 second BGP hold timers. Once the gap outlasts them, the sessions to the route reflectors expire, reconnect and resend every EVPN route. Tenants see minutes.

Two lessons generalise. Storing "expires at" instead of "seconds remaining" breaks on a clock step: durations belong on a monotonic clock. And there was a circle: IS-IS needed the clock, the clock needed NTP, NTP needed IS-IS, and only a reboot exposed it. The management plane must not depend on the data plane it manages. So take time over out-of-band, or hold routing until it syncs; ask the vendor to age by countdown; and rely on the purge-originator TLV, which names the router that sent each purge.

## Costing out a device

To work on a spine without dropping traffic, you cost it out: make every other router route around it while it still forwards whatever reaches it. Make before break. IS-IS gives you two tools.

The maximum metric: 16,777,214, the largest value SPF still uses. When spine2 raises all its links to it, leaf to leaf through spine2 costs about 16.8 million against 20 through any other spine, and every leaf drops it from ECMP. Its own loopback still costs 10, so its BGP sessions and monitoring keep working. And a maximum metric is still a metric: if spine2 is the only path left, traffic uses it.

The overload bit, which says "do not use me for transit". Others still reach the router's own prefixes but never route through it. Its best use is startup: a booted router has adjacencies in seconds, but its BGP tables and forwarding hardware may take minutes to fill, so it sets overload for about 300 seconds, or until BGP converges, and attracts no traffic it would black-hole.

With four spines the two forward identically. Take instead a two-spine site that has already lost spine1, and start maintenance on spine2. The maximum metric keeps the site connected through the expensive path. The overload bit partitions it: every leaf loses every other leaf.

Costing out also breaks by being forgotten: a spine left at maximum metric for weeks, until the next failure finds a quarter less capacity than planned.

## In the interview

A follow-up to expect. One side shows Initializing and the other shows nothing. What does that tell you?

[pause]

Hellos cross in one direction only. Either they are too big for the far end, an MTU mismatch confirmed by oversize counters there, or the link is unidirectional. Authentication and level mismatches fail both ways. The wrong answer is "the neighbour's process is slow, wait".

And if asked which drain you would use: defer to the network team's runbook, but build the check that no drain removes the last path, and the alert for a cost-out that outlives its change.

## Recap

Five things. Ask for scope first: one adjacency, one box, or the whole database. Read state per side: Initializing opposite nothing means hellos cross one way, usually MTU, because hellos are padded on purpose. Dampening stops traffic chasing a flapping link; backoff only caps the CPU. Any router can purge any LSP and purges flood the domain, so one clock step can erase the topology while every adjacency stays up: watch LSP counts, purge originators and clock steps. And a maximum metric leaves a last resort; the overload bit never does.

At your desk: the hello field table, the checklist code and its cases, the dampening simulation, the purge storm timeline, aging code and visualisation, the cost-out code and the spine drain, and the failure-mode and trade-off tables.
