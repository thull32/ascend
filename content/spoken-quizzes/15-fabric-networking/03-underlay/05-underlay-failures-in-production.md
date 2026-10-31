---
lesson: underlay-failures-in-production
source: 95f2670d26d71a51
---
## 1

After a line-card replacement on spine1, leaf1 shows its IS-IS adjacency to spine1 as Initializing, spine1 shows no adjacency to leaf1 at all, and an oversize-frame counter on spine1's port rises every few seconds. What is the most likely cause?

A, leaf1 was rendered as level 1 only while spine1 is level 2. B, the two ends use different hello intervals and hold times. C, the two ends are configured with different authentication keys. D, the replaced port has a smaller MTU than leaf1's padded hellos.

[think]

The answer is D: the replaced port has a smaller MTU than leaf1's padded hellos.

IS-IS pads hellos to the interface MTU, so leaf1's large hellos are dropped by spine1's smaller port while spine1's smaller hellos arrive. leaf1 hears the spine but is not listed in its hellos, so it sits in Initializing. An authentication or level mismatch fails in both directions and leaves both sides Down, and different hello timers do not block an IS-IS adjacency at all.

## 2

leaf1 sends IS-IS hellos every 10 seconds with a 30 second holding time; spine1 sends every 3 seconds with a 9 second holding time. What happens?

A, the adjacency comes up, then flaps every 9 seconds on the spine's timer. B, both sides adopt the lower holding time, as BGP does with hold time. C, no adjacency forms until the hello intervals are made to match. D, the adjacency comes up and each side times out the other on its own terms.

[think]

The answer is D: the adjacency comes up and each side times out the other on its own terms.

Each IS-IS hello carries its sender's holding time, and the receiver uses that value for that neighbour, so spine1 waits 30 seconds for leaf1 and leaf1 waits 9 seconds for spine1. Nothing is compared or negotiated. Matching intervals is an OSPF requirement, and taking the lower of the two is BGP's rule for hold time.

## 3

During an outage, every IS-IS adjacency stays Up, but every router's link-state database in all three sites drops from about 70 LSPs to two in the same second, and tenant traffic stops. Where should you look first?

A, at hello timers, since adjacencies must be flapping too fast to see. B, at the BGP route reflectors, since EVPN routes are being withdrawn. C, at purges in the database, and the router named in their purge-originator TLV. D, at the optics and CRC counters on the spine uplinks across the site.

[think]

The answer is C: at purges in the database, and the router named in their purge-originator TLV.

Adjacencies up with the database collapsing everywhere at once is the signature of purges, which any router can send and which flood the whole area. The purge-originator TLV names the router that sent them, so check its clock. Link faults would take adjacencies down, the reflectors only show the symptom of next hops no longer resolving, and flapping adjacencies would show transitions, not a steady Up.

## 4

Why did a single leaf's clock step purge LSPs that other routers had originated, instead of only affecting the leaf itself?

A, NTP replies are flooded by IS-IS, so every router's clock jumped too. B, SPF treats LSPs from a router with a wrong clock as a routing loop. C, LSPs carry wall-clock timestamps that every router compares to its own. D, any router may purge an expired LSP, and the purge floods to every router.

[think]

The answer is D: any router may purge an expired LSP, and the purge floods to every router.

Aging is distributed so that a dead router's stale LSP still disappears, which means any router can purge any LSP and every router honours the purge. LSPs carry a remaining lifetime, not a timestamp; the bug was the leaf's own conversion of that lifetime into a wall-clock expiry. NTP is unicast UDP and was never flooded, and SPF has no notion of clocks.

## 5

A two-spine site has already lost spine1 to a hardware fault. Someone now starts maintenance on spine2. Which cost-out method keeps leaf-to-leaf traffic flowing?

A, raising its metrics to 16,777,214, because that path remains a last resort. B, neither one, because IS-IS needs at least one spine left at normal metric. C, either one, because both leave spine2 reachable and usable as before. D, setting the overload bit, because it removes spine2 cleanly from ECMP.

[think]

The answer is A: raising its metrics to 16,777,214, because that path remains a last resort.

A maximum metric still lets SPF use spine2 when it is the only path, at a cost of about 16.8 million between leaves. The overload bit is absolute: spine2 stays reachable itself but is never used for transit, so every leaf loses every other leaf. The two tools behave identically only while other spines exist, and a pre-check should block the change either way.

## 6

A leaf with a duplicated system ID sits several hops away from the other router using that ID. What symptom shows it?

A, both routers' adjacencies stay Down, with a duplicate-ID log at each end. B, one LSP ID's sequence number climbs several times a second, area-wide. C, both routers report the adjacency between them as Initializing. D, every router's SPF ignores the duplicated LSP ID as a corrupt entry.

[think]

The answer is B: one LSP ID's sequence number climbs several times a second, area-wide.

Each router sees an LSP with its own ID and a higher sequence number it did not write, and re-originates to beat it; the other does the same, so the sequence number climbs fast and routes to both flap everywhere. A duplicate ID refuses an adjacency only between direct neighbours, which these are not. Nothing treats the LSP as corrupt, because both copies are well-formed.
