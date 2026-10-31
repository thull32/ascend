---
lesson: optics-cabling-and-the-physical-layer
source: 86793963f85ae170
fit: partial
desk:
  - "The rate overhead table and the physical sublayer diagram, with where each counter lives"
  - "The form factor, cable and fibre comparison tables, and the connector list"
  - "The breakout table and the San Jose rail leaf arithmetic"
  - "The FEC cliff simulation and its table of error rates"
  - "The DOM output, the link budget and the both-ends triangulation table"
  - "The gray failure visualisation"
  - "The LLDP frame field by field, and the cabling validator with its output"
  - "The piece-by-piece and failure modes tables, and the incident comparison table"
---
## Introduction

A spine that loses power is an easy failure. Its links go dark within milliseconds, routing moves the traffic to the other spines, and the alert names the box. A connector with a speck of dust on it is a hard one. The link stays up, routing keeps sending it a full share of traffic, and for weeks nothing at the IP layer notices. Then one connection in four starts to crawl.

Most tickets in a data center fabric start at this layer: the pluggable modules, the cables, and the light between them. Four ideas: how bits become light, why every fast link depends on error correction that turns decline into a cliff, how to read the light and counters to find the sick link, and why physical faults dominate incident counts but not outages.

## From bits to light

A switch's forwarding chip drives SerDes circuits, each turning parallel data into one fast serial signal called a lane. A 400 gig port bonds four lanes of 100 gigabits, an 800 gig port eight.

Older lanes use NRZ: two levels, one bit per symbol. Today's 50 and 100 gig lanes use PAM4: four levels, two bits per symbol, so the bits double without doubling the symbol rate. The price is noise. Four levels in the same signal swing leave each gap the receiver must tell apart a third of the height, about 9.5 decibels worse. So a PAM4 link is designed to make errors constantly, and depends on forward error correction to hide them.

The module slides into a cage on the switch or NIC. The cage shape is the form factor, and it fixes how many lanes reach the module and how much heat it can shed. SFP is one lane, 10 or 25 gig. QSFP28 is four lanes of 25, giving 100 gig. QSFP-DD adds a second row of contacts for eight lanes, 400 or 800 gig, and still accepts a QSFP. OSFP is larger, with room for a heat sink, because an 800 gig module draws up to 17 watts. The switch reads the module's memory on insertion, so a module it does not support in a given mode can be optically perfect and never bring the link up.

Then the cable. A DAC, direct attach copper, has no lasers: almost no power, lowest cost, but copper loss grows with frequency, so reach shrinks every generation, to 2 or 3 metres at 100 gig per lane. An AOC is fibre with the transceivers permanently attached: tens of metres, but replaced whole. Or a separate transceiver at each end, joined through patch panels: most flexible, longest reach, and every connector one more place for dirt. The rule of thumb is copper inside the rack, fibre outside it.

## Fibre, connectors and breakouts

Fibre comes in two kinds, and the core size decides everything. Multimode has a 50 micron core. Light travels it at many angles, each a slightly different distance, so pulses smear with length. That caps reach, and the cap tightened as symbols got shorter: on OM4 fibre, from 400 metres at 10 gig to 100 metres at 25 gig per lane. Its advantage is cheap lasers.

Single-mode has a core of about 9 microns, so light takes one path, and reach is set by attenuation, under half a decibel per kilometre. The hyperscalers moved to single-mode almost everywhere outside the rack: the optics price gap narrowed, and a single-mode trunk installed today carries 400, 800 and 1.6 terabits without being pulled out of the ceiling. Meridian's leaf-to-spine links are 400G DR4 on single-mode, where DR means 500 metres and 4 means four parallel lanes.

Connectors have their own failures. Transmit must meet receive: a duplex cord crossed the wrong way joins transmitter to transmitter, and neither receiver sees any light.

Now breakouts. A DR4 module has four independent lasers on four fibre pairs in one MPO ribbon connector, so a fan-out cable can turn one 400 gig cage into four 100 gig ports. An FR4 module cannot: it multiplexes four wavelengths onto one fibre pair. The switch port's mode, the module and where each leg lands must all agree, and one damaged MPO takes four servers down at once.

## Forward error correction and the cliff

A PAM4 lane is specified to work at a raw bit error rate as high as about 2 in 10,000. At that rate a 1,500 byte frame arrives clean only about 6 percent of the time. So the link repairs its own errors in hardware, with redundancy sent ahead of need: forward error correction.

400 gig Ethernet uses a Reed-Solomon code nicknamed KP4. It groups bits into 10-bit symbols, takes 514 data symbols, and appends 30 parity symbols, about 6 percent overhead. Each error has two unknowns, its position and its value, so 30 parity symbols can fix up to 15 bad symbols per codeword.

Each codeword ends one of three ways. No errors. One to 15 bad symbols: corrected, the frame is intact, and the corrected counter rises, which is normal on PAM4. Or 16 or more: uncorrectable, and every frame touching that codeword fails its checksum and is dropped. Both ends must run the same named mode; a mismatch shows as good light at both ends and a link that stays down or flaps.

At 9 in 100,000, the link repairs 38 million bit errors a second and loses nothing. At about 2.4 in 10,000, KP4 is at its practical limit. Six times higher, it loses almost one codeword in a hundred. Double that, half of them. Up to 15 bad symbols cost nothing; the sixteenth costs the frame.

So here is the number to remember: zero checksum errors does not mean healthy. The pre-FEC bit error rate is the margin gauge, and it moves weeks before frames start dropping.

## The dirty connector

Now the story. Leaf1 in Amsterdam has four 400 gig uplinks, one to each spine. The link to spine3 runs 150 metres of single-mode fibre through two patch panels, and at commissioning the arithmetic is subtraction in decibels. Optical power is measured in dBm, decibels relative to one milliwatt; minus 3 decibels halves the power. Leaf1 transmits at plus 0.3 dBm. Four connector pairs lose about half a decibel each. Expected at spine3: about minus 1.8 dBm, a loss of about 2 decibels against the 3 that DR4 allows.

Four weeks later, the module on spine3 reads about minus 5.9 dBm on every lane. Status: no alarms, no warnings. The vendor's low warning is minus 8.9, because factory thresholds must suit every cable plant on earth. Against this link's own baseline it is alarming: 4 decibels down, so only 39 percent of the light arrives, and the channel now loses about twice what the standard budgets for.

Where is the fault? Before I tell you: leaf1's transmit power is unchanged. What does that rule out?

[pause]

The laser. If the far transmitter were failing, its transmit power would drop by the same amount as the received power. Normal transmit with low receive puts the extra loss in a connector or the fibre between them, so cleaning comes first. Light at the floor on both ends with the link down is a crossed polarity or a cord in the wrong port. And bias current climbing for months with steady transmit power is an ageing laser.

Meanwhile, the pre-FEC error rate climbs from 1 in 100 million towards the cliff, and then over it. Frames start failing their checksum, counted as FCS or CRC errors. This counter names the link and the direction: it is counted where the frame is received, so errors from leaf1 towards spine3 show on spine3's port, and leaf1's counters stay perfect. Two samples a minute apart show 625,000 errors a second, 2 percent of frames.

And the link stays up. This is a gray failure: neither working nor down. Routing asks a binary question, and light is present. BFD, the fast liveness probe, needs three misses in a row, which at 2 percent loss happens about 8 times in a million. So ECMP keeps sending spine3 a quarter of leaf1's traffic. One flow in four suffers. Averaged over four uplinks, the loss is half a percent, small enough to vanish on a dashboard of totals.

What catches it: receive power and pre-FEC error rate against the baseline, both moving since week two; the checksum errors on spine3's receive side; and probes over many flows, where only those hashed through spine3 lose packets. The fix is to cost the link out, raising its IS-IS metric at both ends, after checking that three uplinks can carry the 1,000 gigabits at 83 percent. Then clean the connector.

## Flaps and miscabling

A flap is a link going down and up: a module hovering at its detection threshold, loose seating, or a FEC mismatch failing link training. In Amsterdam's IS-IS domain of 24 routers, both ends re-flood, every router reruns its shortest-path computation, and leaves rewrite their ECMP groups. A link flapping every 30 seconds makes four topology changes a minute on all 24. The mitigations trade hiding noise against slower detection: a debounce of, say, 100 milliseconds, and flap protection that shuts a port flapping five times in ten seconds, because one dead link is cheaper than a churning one.

Bring-up has its own failure. A new site arrives as racks and a cabling plan, thousands of rows patched by hand, and cables land in the wrong port or two uplinks get swapped. With numbered links, a swap breaks the subnets and is loud. With unnumbered links, adjacencies form over whatever cable is there. A swap still gives a valid Clos, so routing hides it.

LLDP reports what is really plugged in. Each port sends a small frame every 30 seconds saying who it is, and switches never forward it, so a port learns only about the device at the far end of its own cable. Validation compares what LLDP sees with the plan, treating a cable as undirected, and sorts every cable into ok, miswired, unexpected, or missing. LLDP cannot see a link that never came up, so missing ones are explained by light: floor on both ends is polarity or an unplugged fibre; good light with the link down is a FEC, speed or breakout mismatch.

## Why physical failures dominate

Count the parts. Amsterdam's 64 fabric links carry 128 optics. San Jose's GPU back-end network has about 2,500 modules and 1,500 fibre runs. Suppose, as a round planning number, that 1 percent degrade enough to act on each year: about 25, one every two weeks, each slowing a synchronous training job to the pace of its worst link.

Three mechanisms explain it: PAM4's thin analogue margin, human hands opening trays near live fibre, and wear on the most numerous active part of the network. Meta's report on training Llama 3 attributed about 8 percent of 419 unexpected job interruptions to switches and cables.

But each fault takes out one link, or four with a breakout, and a Clos absorbs that. The large outages come from configuration and software changes with a site-wide blast radius. So physical repair should be routine and automated: detect against baselines, check headroom, cost out, ticket the field team, verify, restore. The platform should alert when receive power falls 2 to 3 decibels below the link's own baseline, and serve two audiences from one dataset. The engineer needs "clean spine3's connector, 4 decibels over baseline". The manager needs "seven links degraded this week, two drained, zero customer impact".

## In the interview

A principal engineer asks: a link shows zero CRC errors, but its pre-FEC bit error rate rose a hundredfold this month. Do you act?

[pause]

Yes. FEC corrects everything until it suddenly cannot, and a hundredfold rise means the margin is going. Check receive power against baseline at both ends, and schedule cleaning, costing the link out first if headroom allows. The wrong answer is "no checksum errors, so the link is healthy".

A second: spine3 counts FCS errors on the port facing leaf1. Which part do you replace? None yet. The suspects are leaf1's transmitter, that direction's fibre and spine3's receiver. Light readings from both ends narrow it. Defer the replacement procedure to the field team; what you would build is the triangulation, so the ticket already names the part. The wrong answer is replacing spine3's optic because that is where the counter is.

## Recap

Five things to remember. PAM4 trades a third of the signal gap for double the bits, so every fast lane depends on FEC. FEC turns decline into a cliff, so the pre-FEC error rate is the early warning, not the checksum counter. Read light from both ends against the link's own baseline: normal far transmit with low near receive means a connector or the fibre. A 2 percent lossy link stays up and keeps its share of ECMP: a gray failure, fixed by costing it out after a headroom check. And validate cabling as a set diff of LLDP against the plan, because unnumbered routing runs happily over a miswired link.

At your desk: the overhead and sublayer diagram, the form factor, cable and fibre tables, the breakout arithmetic, the FEC cliff simulation, the DOM output and triangulation table, the gray failure visualisation, the LLDP frame and the cabling validator, and the failure mode tables.
