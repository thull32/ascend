---
lesson: connecting-sites-and-backbones
source: 8850f4f87284ba1c
fit: great
desk:
  - "The two site-square visualisations: the cut at 80 gigabits a second, and the same cut at 140"
  - "The lease products table and the field-by-field table of a tenant packet crossing circuit 1"
  - "The latency table from leaf to leaf up to Amsterdam to San Jose"
  - "The square simulation code and its output, and the square versus mesh design table"
  - "The metro versus long-haul table and the failure modes table"
  - "Exercise: find the circuits whose loss overloads a site pair"
  - "Practice problems: SPF next hops, and blast radius"
---
## Introduction

Inside one site, Meridian builds a Clos: every leaf wired to every spine, dozens of equal paths, links bought once and owned outright. Between Amsterdam and Singapore, 10,500 kilometres apart, none of that holds. Every link is a circuit leased from a carrier and paid for monthly. It adds 52 milliseconds each way that no hardware can remove. And it runs through a subsea cable that a ship's anchor can cut.

So a backbone, the network that joins sites, asks three questions a fabric never does. What are you leasing? What does distance cost the software on top? And how few circuits can you buy and still survive a cut? Meridian's answer is the square: two circuits per site pair, each sized to carry everything alone.

## What you lease

Data center interconnect, or DCI, is the name for the links between an operator's own sites. They carry tenant traffic inside VXLAN tunnels, replication and backup, which is usually the bulk of the bytes, the control plane, and telemetry. Meridian's DCI is routed, not stretched. Stretching a VLAN across the circuit makes both sites one flood domain, so a broadcast storm in Amsterdam floods Singapore over the most expensive link you own. Routing puts the circuit between two routers with IS-IS over it, and tenants still get segments spanning sites because the overlay provides them.

What does a carrier sell? Under everything is fibre, in pairs, one strand per direction, and DWDM puts dozens of signals on one pair, each on its own wavelength of light, each carrying 100, 400 or 800 gigabits a second. Dark fibre is a bare pair: total control, months to get, mostly metro. A wavelength is one colour on the carrier's system, fixed speed, available anywhere including subsea. An Ethernet private line hands you a port at each end, and the carrier may cap the MTU. An MPLS VPN or IP transit gives the least control.

Meridian's long-haul circuits are 100 gigabit wavelengths, handed off in a colocation building over a cross-connect to a spine's port. Each has a carrier circuit ID, which is what appears in maintenance notices and outage tickets; mapping it to your devices is the first thing backbone tooling must get right. Carriers also sell protected wavelengths, which switch to a standby path in about 50 milliseconds. Meridian buys unprotected ones and protects them itself, with the square's second circuit.

The oceans are subsea cables: a few centimetres thick in deep water, a handful of fibre pairs, repeaters every 50 to 100 kilometres. Faults are routine, roughly 150 to 200 a year worldwide, mostly fishing gear and anchors in shallow water. Repair takes a ship days in a good case, weeks in a bad one. And failures cluster: the Hengchun earthquake off Taiwan in 2006 broke several cables at once, and in 2024 a disabled ship in the Red Sea dragged its anchor across three. That names a concept: the shared-risk link group, or SRLG, a set of links one physical event can take down together. Diversity is the route the light takes, not the carrier's name.

## Latency is distance

Light in glass travels at about 4.9 microseconds per kilometre, and the track rounds it to 5. Here is the number to remember: 5 microseconds per kilometre, one way. Nothing else on a long path comes close. A faster circuit puts more bytes in flight; it does not get the first byte there sooner.

So Amsterdam to Singapore, 10,500 kilometres, is 52 and a half milliseconds one way and 105 round trip. Singapore to San Jose is 136. One honesty note: real cables follow coasts and pass through Suez, and measured round trips are commonly 150 milliseconds or more. The arithmetic is a floor.

What does the floor do to software? A database that waits for the Singapore replica to confirm each write cannot commit in under 105 milliseconds, whatever the hardware, which is why synchronous replication lives within a metro. TCP needs a window as large as the bandwidth-delay product: to fill 100 gigabits for 105 milliseconds, about 1.3 gigabytes in flight. A 64 kilobyte window moves 5 megabits a second; 4 megabytes, 320 megabits. That is the commonest "the network is slow" ticket on a backbone, and the circuit is fine.

And loss costs more on long paths, because the round trip divides loss-limited throughput. With one packet in ten thousand lost, a flow at a 1 millisecond round trip reaches about 1.4 gigabits a second; at 105 milliseconds, about 13 and a half megabits. A loss rate nobody notices inside a site cripples transfers between sites.

## The square and the cut

A full mesh between two sites joins every Amsterdam spine to every Singapore spine: four circuits for two spines a side. The square buys reachability with two. Circuit 1 joins the two spine 1s, circuit 2 the two spine 2s. The other two sides already exist: from spine 1 to spine 2 in the same site, you go down to any leaf and up again, over links Meridian owns.

To IS-IS, a circuit has a metric of 1,000, against 10 inside a site, so every local path is cheaper than any path that leaves, and local traffic never wanders onto an ocean.

Now the story. It is the busy hour, and Amsterdam is sending 80 gigabits a second to Singapore. From leaf 1 in Amsterdam to leaf 2 in Singapore there are two paths, one through each spine, each costing 10, plus 1,000, plus 10: 1,020. They are equal, so the leaves hash flows across both, and each circuit carries 40 percent.

At time zero, an anchor cuts the cable carrying circuit 1. Light stops, and everything in the glass, 52 milliseconds of traffic each way, is gone.

Before I go on: spine 1 in Amsterdam has just lost its only way to Singapore. Where does it send the traffic still arriving from the leaves?

[pause]

First, detection. If the carrier passes on the loss of signal, both spines declare the port down within milliseconds. If it passes nothing, detection falls to BFD, small hellos Meridian runs at 300 milliseconds, three missed and the link is dead. Without BFD, only the IS-IS hold time is left, commonly 30 seconds, and that wait is the outage. Then each spine floods a new link-state record: microseconds to its own leaves, at least 52 milliseconds to the far site.

Spine 1 recomputes first, and here is the answer. Its best way to Singapore is now down to a leaf, up to its sister, spine 2, and over circuit 2: 1,030. That is the detour, two extra hops. A leaf that has not yet recomputed still sends half its flows to spine 1, which sends some straight back: a microloop, until a TTL expires or the leaf converges.

Then the leaves converge, well under a second. Through spine 1 now costs 1,040, through spine 2 still 1,020, so everything goes to spine 2. Circuit 2 carries all 80 gigabits, 80 percent. Half the inter-site capacity is gone, and nothing is broken. The signal: both ports of circuit 1 down, an adjacency lost on both spines, and a step from 40 to 80 percent on circuit 2.

## Square versus mesh

Surely the full mesh is better? Take four 50 gigabit circuits instead of two at 100. Same 200 total, and after one cut the mesh keeps 150 against the square's 100.

But the leaves still see both Amsterdam spines at the same cost, 1,020. So plain ECMP still sends half the traffic to the spine that lost a circuit, which has one 50 gigabit circuit left. It fills at 100 gigabits of total load, exactly where the square's survivor does. ECMP splits by path count, not capacity. The lesson's simulation confirms it: both survive at most 100 through any single failure.

The mesh's spare capacity becomes usable only with weighted multipath, sending that spine a third of the traffic; then it survives 150. Plain IS-IS ECMP cannot do that. What the mesh buys without weighting is survival of double failures. And each contract has a fixed cost, so fewer, larger circuits are usually cheaper per gigabit.

Across many sites, a full mesh grows fast: 45 site pairs for ten sites. So backbones are sparse. Meridian leases two squares with Singapore as the hub, so every Amsterdam to San Jose packet crosses Singapore, at least 241 milliseconds round trip, where a direct transatlantic route gives 140 to 160. If both Amsterdam circuits fail, Amsterdam is cut off from both other sites. A third square makes a triangle, where any one pair can fail and traffic goes the long way round.

Metro links, up to about 100 kilometres, are a different world: round trips under a millisecond, usually dark fibre, a mesh affordable, synchronous replication possible, and a backhoe cut repaired in hours. Two buildings 40 kilometres apart can even be one site. The boundary is latency and link cost, not geography.

## Planning for the cut

The square only works if one circuit can carry what two carried. With k equal circuits, each must stay below k minus one over k at the busiest hour: 50 percent for two, 75 for four. Meridian's 40 percent is inside the rule.

Now run the same cut at 140 gigabits. Each circuit runs at 70 percent, which looks healthy every day. After the cut, all 140 lands on circuit 2: 140 percent. Spine 2's queue overflows, and TCP slows far more than the drop rate suggests, because each loss costs a long recovery at 105 milliseconds.

Plan on the 95th or 99th percentile of the busiest hour, per direction. Count carrier maintenance, which leaves the square without redundancy for a few hours. And mind lead time: at 80 gigabits growing 3 percent a month, the survivor is full in about seven and a half months, so with a five-month lead time Meridian orders within two months, while dashboards still show 40 percent. Two circuits in one SRLG count as one.

The same rule governs the north-south edge, where border gateways run eBGP to two ISPs and to clouds. If the busiest hour sends 30 gigabits out of Amsterdam, each ISP port must take 30 alone. The cloud providers ask for connections at two locations: the square again. And AWS caps the routes you announce on a private connection at 100, at the time of writing, dropping the session when you exceed it.

So the platform should show site pairs as objects, with the survivors' headroom forecast against the order date; a circuit inventory with carrier, circuit ID, MTU and SRLG; latency baselines per circuit; and one alert per circuit event, named by its circuit ID.

## In the interview

A follow-up the lesson expects. Latency between two sites jumped from 105 to 128 milliseconds and stays flat. Utilisation and drops are unchanged. What happened?

[pause]

A flat step is a longer path; congestion would vary. Most likely the carrier moved the circuit to a protection path or rerouted it: 23 milliseconds more round trip is about 2,300 kilometres more fibre each way. Check which circuit moved, rule out queueing, read the carrier's notices. The wrong answer is "it is congested, add capacity".

And a second. A replication job gets 300 megabits a second on a 100 gigabit circuit. Is it the network?

[pause]

If the circuit is not busy or dropping, it is the transfer. 300 megabits at 105 milliseconds is about a 4 megabyte window, against 1.3 gigabytes needed. Check buffers on both hosts, try parallel streams, look at retransmits. You can leave tuning a storage product to its owners; throughput against window and round trip settles it. The wrong answer is "upgrade the circuit".

## Recap

Five things to remember. Between sites every link is a lease, so backbones are sparse and fabrics are dense. Distance costs 5 microseconds per kilometre each way, 105 milliseconds round trip to Singapore as a floor, which forces asynchronous replication and big windows. When a square loses a circuit, the orphaned spine detours through a leaf, the leaves converge on its sister, and 40 percent becomes 80. Keep each of two circuits under 50 percent at peak; a mesh with plain ECMP survives no more load. And two circuits in one shared-risk group are one circuit.

At your desk: the two site-square visualisations, the lease and packet field tables, the latency table, the square simulation and design table, the metro and failure modes tables, the circuits-at-risk exercise, and the SPF next hops and blast radius problems.
