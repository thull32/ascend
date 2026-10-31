---
lesson: active-measurement
source: 256c2c6b4e208287
fit: great
desk:
  - "The probe-localisation visualisation: ping on spine1, sixteen TWAMP Light streams mapped to four spines, three bad streams through spine3.ams, and the cost-out"
  - "The ICMP echo and TWAMP test and reply packets, field by field"
  - "The full TWAMP control exchange and the four-timestamp worked run in Python, with its output"
  - "The tomography code over a four-leaf mesh, its leaf-by-leaf matrix, and the reverse-loss edge case table"
  - "The matrix patterns table, the measurement failure modes table and the toolbox comparison"
---
## Introduction

Acme reports that some requests from its web servers behind leaf1 in Amsterdam to its databases behind leaf3 are slow, now and then. Every device in Meridian's Amsterdam fabric reports healthy: interfaces up, IS-IS adjacencies up, BGP sessions Established, CPUs normal. A ping between the two racks shows zero loss. All of that is true, and one link is still dropping 4 percent of the packets that cross it.

Device telemetry is passive: it reports what each device believes about itself. Active measurement sends test traffic and watches what happens to it, so it sees what an application sees, including failures no device notices, like a link that corrupts frames while staying up. The cost is that a probe measures only the path it took, and in a leaf-spine fabric that path has to be chosen on purpose.

So: what ping and traceroute can and cannot tell you. TWAMP and its four timestamps. Probes that cover every spine. Reachability matrices and the signals hosts already have. And the story of how probe results become one suspect link.

## What ping and traceroute miss

Ping sends an ICMP echo request and gets an echo reply. A reply proves IP works both ways between two addresses, with a real round-trip time for that path. With the don't-fragment bit and a large size, it also tests the path MTU. Here is what it cannot do.

It tests one path out of many. ICMP has no ports, so every echo between two hosts hashes onto the same spine. With four spines, a clean ping has checked one of four paths. A missing reply could have been lost going out or coming back, which may be different spines. Pinging a switch measures its CPU, because an echo to the switch's own address is answered by rate-limited software, not the chip that forwards transit traffic; ping through switches, between hosts. Networks may police or deprioritise ICMP. And ping is too sparse for small loss: at one a second, 0.1 percent loss costs one reply every 17 minutes.

So, before I tell you: a hundred pings, a hundred replies. What loss have you ruled out?

[pause]

Only loss above about 3 percent. The rule of three says zero losses in n packets bounds the loss rate below roughly three over n, with 95 percent confidence. And only on the one path that address pair hashes to.

Traceroute sends probes with time-to-live 1, 2, 3 and so on, and each router that takes it to zero answers "time exceeded". Two facts matter in a fabric. The overlay hides the spines: tenant traffic crosses them inside VXLAN, and they decrement only the outer TTL, so to see spines you probe in the underlay. And the useful one: the hash ignores the TTL, so a probe that copies a stream's exact five-tuple with TTL 2 follows that stream's path and expires at its spine, whose reply names it. That is Paris traceroute's idea. The spine rate-limits those replies, so mapping needs pacing, and the map goes stale when a link joins or leaves the group.

## TWAMP and its four timestamps

A measurement protocol needs timestamps at both ends, sequence numbers for loss, and probes that can look like real traffic. The IETF's answer is TWAMP, the Two-Way Active Measurement Protocol, RFC 5357. A session-sender sends UDP test packets to a session-reflector, which timestamps each on arrival and departure and sends it back. Full TWAMP negotiates sessions over a TCP control connection on port 862; TWAMP Light drops that, and STAMP, RFC 8762, standardises the light idea. Inside one fabric the operator owns both ends, so the light variants win.

Four timestamps. T1, the sender sends. T2, the reflector receives. T3, the reflector replies. T4, the sender receives. T1 and T4 are on the sender's clock, T2 and T3 on the reflector's.

The round trip is T4 minus T1, less T3 minus T2. Each difference stays on one clock, so no synchronisation is needed, and the reflector's processing drops out. One-way delay, T2 minus T1, mixes two clocks, so it is only as good as their synchronisation. Jitter is the change in delay between consecutive packets. And loss splits by direction, because a stateful reflector numbers its own replies: gaps in its numbering are replies lost on the way back, and the rest of the missing probes died on the way out.

A worked run: 30 microseconds each way, the reflector's clock 1,500 microseconds ahead. The round trip comes out right, 60 microseconds. The one-way delay reads 1,530: 30 of delay and 1,500 of clock error. The reply also carries the TTL the probe arrived with: sent at 255 through leaf, spine, leaf, it arrives at 252, and a sudden 250 means a longer path, such as a detour through another site.

Clocks decide whether one-way numbers mean anything. Agent to agent across one fabric is tens of microseconds. NTP keeps servers within tens of microseconds to milliseconds; PTP with hardware timestamping gets below a microsecond. So inside a fabric, trust one-way numbers only between PTP-synchronised agents. From Amsterdam to Singapore, about 52 milliseconds one way, a millisecond of error still leaves a useful figure. And where the timestamp is taken matters: user space includes scheduler delay, so an overloaded agent reports its own latency, the same spike on every pair involving it.

## Probes that cover every spine

A leaf with four uplinks hashes each packet's five-tuple, modulo four, to choose a spine. One probe stream is one spine. To cover all four, the agent runs streams that differ only in source port.

How many? Hash values behave randomly, so this is the coupon collector's problem: about 8 random streams to touch all four spines, about 54 for 16 paths. And the expectation is not enough. With 16 random ports over four spines, each spine still has about a 1 percent chance of getting none, and across hundreds of pairs some paths go unprobed. So real systems map, then fill: learn each port's spine with the TTL 2 trick, and keep adding ports until every member has at least two streams.

At what rate? The smallest loss you must see sets the detection time. At 10 packets a second, 4 percent loss is obvious within a minute; saying "below 0.1 percent" takes about 3,000 clean packets, five minutes. The cost is tiny. A full mesh of 16 Amsterdam leaves, 240 pairs, 16 streams each, is about 80 megabits a second against 25.6 terabits of uplink.

Probe like the traffic you care about: the same protocol, the same sizes, up to 9,000 bytes to catch MTU problems, and every traffic class. Only a probe marked with RoCE's DSCP value exercises the lossless queues. Probe the underlay to localise, and the overlay to confirm what the tenant sees.

One trap. The reply's five-tuple is reversed and hashed by the far leaf with its own function and seed, so a reply may cross a different spine from its request. A round-trip loss belongs to two paths. You need TWAMP's direction split and a map of return spines, made from the reflector side.

## The matrix, and what hosts already know

Covering every path between two leaves is half the job; the other half is every pair. Microsoft's Pingmesh, published in 2015, set the pattern. Every server runs an agent with a ping list from a controller, and measures with TCP connections and HTTP requests, so probes are treated like application traffic. The lists are hierarchical, because a full mesh is quadratic: within racks, between racks, between data centers. Facebook's NetNORAD did the same with UDP.

The results are drawn as a matrix: sources down, destinations across, each cell a pair of leaves coloured by loss or latency. The shape of the red names the scope. One cell: something between that pair. One row: everything from one leaf, its uplinks or its probe agent. One column: everything into one leaf. A block: a pod, a super-spine, an inter-site circuit. Everything: a shared element, or the probe system itself. In Meridian's AI cluster in San Jose, the matrix follows the rails, 128 NICs per rail, probed with RDMA in the lossless class, not ICMP.

Meanwhile every TCP host is already probing with production traffic. A lost segment shows up as a retransmission, fast, or after a timeout of at least 200 milliseconds on Linux. Map each remote address to its leaf through the source of truth, and retransmissions per leaf pair become a matrix built from real traffic, at no cost. The catch: hosts cause retransmissions too, so read their drop counters alongside. Microsoft's 007 system closed the path gap: when a connection retransmits, the host traceroutes with that connection's five-tuple, and each affected flow votes for the links on its path.

RDMA hosts report a different set, because the NIC runs the transport: receiver sequence gaps, negative acknowledgements, ACK timeouts, congestion notifications, pause frames. In RoCE, a receiver NIC that cannot drain its buffers pauses the switch, so switch counters show pauses and no drops while the job slows. And the coarsest probe is the job itself: step time growing on a subset of servers is a result to localise like any other.

## From probes to one suspect link

The ping between leaf1's and leaf3's agents shows zero loss, because its one five-tuple hashes to spine1. So the agent starts sixteen TWAMP Light streams, and TTL 2 probes map them: 4, 5, 3 and 4 streams on spine1 through spine4.

Five minutes later, 3,000 packets per stream, the three streams through spine3 lose 3.9, 4.1 and 3.8 percent, all forward. The rest are clean. Here is the number to remember: averaged over all sixteen, the loss is 0.7 percent. The average hides a broken path.

Is spine3 broken? Not proven. Leaf1's uplink, the spine and its downlink to leaf3 are all on those paths. So add pairs. Leaf2 to leaf3 through spine3 also loses about 4 percent. Leaf1 to leaf2 through spine3 loses nothing. Which element is left?

[pause]

The link from spine3 down to leaf3. The good path through spine3 clears the spine and leaf1's uplink. That downlink is the only element on every bad path and on no good one. This is boolean network tomography: links on every bad path, minus links on any good path. It needs good paths as much as bad ones.

Then confirm with counters at both ends. In five minutes spine3 sent 3 billion frames on that link; leaf3 discarded 117 million of them, 3.9 percent, with frame check errors, and its uncorrectable forward error correction count climbs. One receive lane of its optic reads minus 8.6 dBm against about minus 2 on the others. The link stays up throughout. Cost it out by raising its IS-IS metric at both ends, and the same sixteen streams rehash over three spines with zero loss, confirming the diagnosis.

A twist: suppose the fault hit replies instead, from spine2 down to leaf1. Grouped by forward spine, the bad streams sit on spine1 and spine3 while a spine2 stream is clean, a pattern no element explains. TWAMP says the loss is all reverse, so group by return spine, and both bad streams come back through spine2. Ping cannot localise a one-directional fault.

The measurement system fails too, in ways that look like the network. An overloaded agent paints a row and a column. A rate-limited reflector shows loss that rises with probe rate. An ECMP change leaves a spine unprobed. One spine fault fires 240 pair alerts, so alert on the localised element. And a dead agent must show as blindness, never as a healthy path.

## In the interview

Ping between two leaves is clean, but a customer sees intermittent loss between them. How can both be true?

[pause]

Ping is one five-tuple, so it tests one ECMP path out of N. If a link behind one of four spines drops a few percent, a quarter of the customer's connections suffer, and ping, hashed elsewhere, sees nothing. You would run probes with varied source ports, map each to its spine, and group the results. The common wrong answer is "then it isn't the network".

Another: on a RoCE cluster, what would you measure that switch counters do not show? The host side: sequence gaps, negative acknowledgements, ACK timeouts, congestion notifications, and pauses the NIC sent, because a slow receiver can pause the fabric with no drop anywhere. The wrong answer is "check the switch for drops", which are often zero during the incident.

## Recap

Five things. A clean ping covered one path, at one rate, in one class, and a hundred replies only rule out loss above 3 percent. TWAMP's round trip needs no clock sync, one-way delay does, and the reflector's numbering splits loss by direction. Cover every ECMP member on purpose, map then fill, and never average loss across paths. Matrices name the scope by their shape, and host retransmits and RDMA counters are a free probe mesh. And localise by set arithmetic, bad paths minus good, then confirm with counters at both ends of one link.

At your desk: the probe-localisation visualisation, the packets field by field, the four-timestamp worked run, the tomography code and reverse-loss table, and the tables of matrix patterns, measurement failures and tools.
