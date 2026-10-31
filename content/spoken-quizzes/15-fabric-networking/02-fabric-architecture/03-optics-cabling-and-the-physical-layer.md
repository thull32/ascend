---
lesson: optics-cabling-and-the-physical-layer
source: b8232cbfa6189b57
---
## 1

Over four weeks, a 400 gig link's pre-FEC bit error rate rises from 1 in 100 million to 9 in 100,000. The FCS error counter still reads zero. What is the right reading?

A, the rise is normal PAM4 behaviour and needs no tracking at all. B, the link is losing margin, and is approaching the point where FEC fails abruptly. C, the FCS counter is broken, because an error rate of 9 in 100,000 must cause frame loss. D, the link is healthy, because FEC repaired every error and FCS is zero.

[think]

The answer is B: the link is losing margin, and is approaching the point where FEC fails abruptly.

The Reed-Solomon code corrects up to 15 bad symbols per codeword, so at this rate every codeword is still repaired and no frame fails its checksum. But it is within a factor of three of the roughly 2.4 in 10,000 at which the code stops delivering an error-free link, and beyond that loss rises steeply. Some corrected errors are normal on PAM4; a 9,000-fold rise is a trend worth a ticket before FCS errors appear.

## 2

Leaf1 in Amsterdam transmits at plus 0.3 dBm per lane, unchanged since commissioning. Spine3, at the other end, now receives minus 5.9 dBm per lane instead of minus 1.8. Where is the fault most likely to be?

A, in the FEC configuration on the two ends. B, in a connector or the fibre between them. C, in leaf1's laser, which has started to age. D, in spine3's receiver electronics.

[think]

The answer is B: in a connector or the fibre between them.

The far end's transmit power is unchanged, so the laser is fine, while about 4 decibels more light is lost before it reaches spine3. That points at the path: a contaminated or damaged connector, a tight bend or a cracked fibre, which is why cleaning comes first. A failing receiver would usually show normal receive power with rising errors, and a FEC mismatch would leave the light normal and the link down.

## 3

One of leaf1's four uplinks drops 2 percent of its frames. Why does it stay in the ECMP group?

A, IS-IS removes lossy links only after its SPF timer expires. B, BFD needs three misses in a row, which is rare at 2 percent loss. C, ECMP excludes a link only when its utilisation reaches 100 percent. D, LLDP refreshes every 30 seconds and keeps the link marked up.

[think]

The answer is B: BFD needs three misses in a row, which is rare at 2 percent loss.

Routing asks only whether a link is up. Light is present, so the port is up; small BFD packets cross it more reliably than large frames, and IS-IS hellos would need several losses in a row to expire an adjacency. Three consecutive misses at 2 percent loss happen about 8 times in a million. Nothing in IS-IS or ECMP reacts to loss, and LLDP does not feed routing, so catching it needs error-rate thresholds and probes.

## 4

A team wants to split a 400 gig port into four 100 gig server ports. Which module makes that possible?

A, 400G LR4, because its longer reach leaves spare budget. B, 400G FR4, because its four wavelengths can be separated. C, 400G DR4, because each lane has its own fibre pair. D, 400G FR4, because duplex LC cables split more easily.

[think]

The answer is C: 400G DR4, because each lane has its own fibre pair.

A DR4 module is a parallel optic: four independent lasers on four fibre pairs in one MPO connector, so a fan-out cable can send each lane to a different server, given a switch configured for that mode. FR4 and LR4 multiplex four wavelengths onto one fibre pair and are one 400 gig interface; separating them would need an optical demultiplexer, and reach has nothing to do with breakout.

## 5

LLDP shows leaf2's port 51 neighbouring spine4, and its port 52 neighbouring spine3: the reverse of the plan. The fabric uses unnumbered IS-IS. What happens?

A, both adjacencies fail, because the system IDs no longer match. B, routing works, and the swap is found only by an LLDP diff. C, the leaf blocks both ports until the cables are corrected. D, traffic loops, because each spine sees the leaf twice.

[think]

The answer is B: routing works, and the swap is found only by an LLDP diff.

Unnumbered adjacencies form over whatever cable is present, and leaf2 still has one link to each spine, so the Clos is valid and traffic flows. The swap matters later, because per-port descriptions, policy and monitoring are now wrong. With numbered links the two ends would not share a subnet and the error would be loud. A topology manager can hold miswired ports out of service, but that is a feature someone configures, not a default.

## 6

Why do large operators standardise on single-mode fibre for links between racks?

A, single-mode optics draw less power than multimode ones. B, its reach survives speed upgrades, while multimode reach shrinks. C, single-mode connectors need no cleaning or inspection. D, multimode fibre cannot carry PAM4 signals at all.

[think]

The answer is B: its reach survives speed upgrades, while multimode reach shrinks.

Multimode's modal dispersion limits reach, and the limit tightened as symbols got shorter: on OM4, from 400 metres at 10 gig to 100 metres at 25 gig per lane, and 50 metres for the cheaper 100 gig per lane VR optics. Single-mode has no modal dispersion, so a trunk installed now carries 400 gig, 800 gig and 1.6 terabits, and the optics price gap has narrowed. Multimode PAM4 optics exist, single-mode optics are not lower power, and every fibre connector needs cleaning.
