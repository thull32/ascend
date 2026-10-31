---
lesson: convergence-and-bfd
source: d983d69f5df5b214
fit: partial
desk:
  - "The four-phase timeline table and both BFD convergence visualisations, at 300 and at 50 milliseconds"
  - "The BFD control packet field by field, the state diagram and the bring-up trace"
  - "The BFD timer, detection window and TCP stall code and its output"
  - "The RFC 8405 SPF back-off simulation and its trace"
  - "The microloop simulation, with the loop-free alternate check"
  - "The graceful restart steps, the end-to-end numbers table, the failure-mode table and the detector trade-offs"
---
## Introduction

A fibre breaks. Every packet hashed onto it is lost until every router whose forwarding table points at the dead link has been told, and has rewritten that table. "Routing heals itself" hides the question that matters in production and in interviews: how fast, and where does the time go?

Convergence is that process, and that time, from a topology change until every router forwards on the new topology. It has four phases. Detection: a router notices. Propagation: it tells the others. Computation: each recomputes its routes. And FIB programming: each writes the result into its forwarding hardware.

Here is the case Meridian worries about most. leaf1.ams sends 80 gigabits a second to leaf2.sin, split by ECMP over the two Amsterdam to Singapore circuits. A fibre breaks inside the carrier network that carries circuit 1, and the carrier's equipment keeps sending light to both spines. Neither port goes down.

With BFD at 300 milliseconds and a multiplier of three, detection takes up to 900 milliseconds. Then spine1.ams waits 50 milliseconds to batch further changes, and floods a new LSP in 2. leaf1.ams waits 50 before its SPF run, which takes 1. Writing the new next hops into the chip takes 15. Total: 1,018 milliseconds, and detection is 88 percent of it. Without BFD, the same cut takes about 30 seconds, and 150 gigabytes are lost on that one circuit.

Applications see worse. A TCP flow that lost a segment at the cut backs off its retransmissions, so it resumes at about 2.2 seconds, double the network's outage.

Coming up: what the port cannot see, BFD, the deliberate waits, the microloop a Clos makes, graceful restart, and the interview.

## The port, and what it cannot see

Most failures are detected by hardware. When fibre runs directly between two ports, a cut removes the received light: the optic reports loss of signal within microseconds, and Ethernet's link fault signalling takes the far end down too. The network operating system learns of it within milliseconds to tens of milliseconds.

Two refinements. Debounce reports a down transition only if it lasts, say, 100 milliseconds. It hides blips from a marginal optic and adds its full value to every real cut; a 2-second debounce left at an old default turns a fibre cut into a 2-second outage. And many chips remove a dead port from every ECMP group by themselves, in well under a millisecond, so a leaf that loses one of four uplinks has repaired its own traffic before IS-IS has generated anything.

Loss of light is the best detector: fast, free and almost never wrong. But it sees only the fibre attached to the port. It misses a carrier in the middle that keeps the light on, a hung neighbour whose frozen chip still sends idle signal, and partial loss, a gray failure that needs error counters and probes.

The fallback is the protocol's own hellos: on common defaults, IS-IS drops the adjacency after 30 seconds of silence. Faster hellos are handled on the CPU and padded to the full MTU, so they are heavy. A tiny, purpose-built detector is the better design.

## BFD

BFD, Bidirectional Forwarding Detection, is a hello protocol and nothing else. Two routers send each other small UDP packets at a negotiated interval. A router that hears nothing for the detection time declares the session down and tells its clients: IS-IS, BGP, static routes. One session per link serves them all, and it is simple enough to run in the chip instead of on the CPU.

The control packet is 24 bytes: a state, a diagnostic code saying why this side last went down, a multiplier, and the intervals each side wants to send and is willing to receive. Bandwidth is never the cost; deadlines are. A spine with 64 sessions at 50 milliseconds must send 1,280 packets a second, each on time.

A session comes up in three steps, which is the "bidirectional". spine1.ams says Down. spine1.sin, hearing a stranger, answers Init: I hear you. spine1.ams hears Init and goes Up, because each side has now proved it hears the other. If one direction is broken, the deaf side stays Down, and neither reaches Up.

Now the timers, where people slip. Each side transmits at the slower of its own desired interval and the peer's required receive interval. And each side's detection time is the remote's multiplier times the agreed interval: the remote says how many of its packets may be missed.

A drifted pair: spine1.ams wants 300 milliseconds and a multiplier of three; spine1.sin's template asks for 100 and five. Before I tell you: how long does spine1.ams wait before declaring its peer dead?

[pause]

1,500 milliseconds. spine1.ams will not receive faster than 300, so both send every 300, and spine1.ams uses its peer's multiplier, five. spine1.sin uses three times 300, 900. One cut, detected 600 milliseconds apart at the two ends, so tooling must compare the negotiated values at both ends with intent.

And the timer runs from the last packet, which arrived up to one interval before the cut, so 300 times three detects somewhere between 600 and 900 milliseconds. At 50 times three, traffic recovers at 268 milliseconds, and TCP's first retransmission already finds the path repaired.

Whether 50 is safe depends on where BFD runs. In software, a CPU busy loading a BGP table can miss three of its own transmissions, and the peer declares a healthy link dead, so software BFD usually stays at 100 to 300 milliseconds. Offloaded to the chip, it goes down to a few milliseconds. Meridian runs offloaded BFD at 100 times three inside sites and 300 times three on circuits, slower on purpose: a protected carrier circuit switches in about 50 milliseconds, and that should not trigger an intercontinental reroute.

Two variants matter. Micro-BFD runs one session per member of a link bundle, because a single session tests one hashed member. And IS-IS can require BFD before the adjacency comes up; otherwise BFD configured on one end only leaves an adjacency with no fast detection that nobody notices.

## Flooding, SPF and the FIB

After detection, most of the time is waiting by design. spine1.ams does not send its new LSP at once. A generation throttle waits 50 milliseconds in case more changes arrive, then longer, backing off to 5 seconds while changes continue. A line card failure that drops 16 adjacencies over 20 milliseconds becomes one LSP, not 16.

Flooding itself is fast: one to two milliseconds per hop, plus 52.5 milliseconds of light to Singapore. Its old pacing, about 30 LSPs a second, only hurts in a burst: a purge storm that refloods 300 LSPs takes 10 seconds.

Computation is the cheapest phase: Dijkstra over a site's few hundred nodes takes under a millisecond. The time goes into a deliberate wait, standardised in RFC 8405 so every router waits the same way. A first change in a quiet network waits 50 milliseconds. Changes in the next half second wait 200. After that, until the network has been quiet for 10 seconds, every change waits 2 seconds.

So picture an optic elsewhere flapping every 300 milliseconds. The throttle settles into the long wait, and nine changes cost two SPF runs. The price: a real failure during that flap waits 2 seconds too, because the throttle cannot tell it from another flap. Cost out a flapping link quickly.

Then the FIB. SPF fills the RIB, the software table; traffic moves only when the chip's table is rewritten. In a flat FIB, each prefix holds its own next hops, so every prefix that used spine1.ams is rewritten, at a few thousand to tens of thousands a second: 2,000 tenant prefixes take a tenth of a second to a second, a million-prefix internet table tens of seconds. In a hierarchical FIB, prefixes share a next-hop group, and one write moves them all: the timeline's 15 milliseconds. Until then, a dashboard reading the RIB says "converged" while packets still go to the dead path.

## Microloops

Routers do not converge at the same moment. spine1.ams sees the failure itself and converges at 966 milliseconds. Its new route to Singapore goes down to an Amsterdam leaf, up to spine2.ams and across circuit 2. The leaves converge at 1,018. In between, spine1.ams sends Singapore flows down to a leaf that has not converged yet. Before I tell you: what can that leaf do with them?

[pause]

Send them straight back. Its old ECMP set still includes spine1.ams, and for some flows its hash picks it. The packet bounces until the leaf updates or the TTL runs out: a microloop.

The lesson walks 16 flows from leaf1.ams. Until 966 milliseconds, the 6 hashed onto spine1.ams are black-holed into the dead circuit. Then four of them meet a leaf that hashes them on to spine2.ams, and two meet one that hashes them back, and loop, because each router's hash of a flow is deterministic. The loop window, 52 milliseconds, is the generation wait plus the flood: the head start of the router next to the failure.

A microloop is worse than a black hole of the same length. A packet with a TTL of 64 crosses its looping link about 31 times each way, so two looping flows, 10 gigabits a second, offer that one link about 310 gigabits a second each way, and unrelated traffic on it is dropped too. The signal is a burst of TTL-expired discards and a utilisation spike on spine to leaf links right after a failure.

The textbook fix is fast reroute: a precomputed backup next hop, used the moment detection fires. Its classic form, the loop-free alternate, needs a neighbour whose own shortest path does not come back through you. Above a spine in a Clos there is none: every leaf reaches Singapore at 1,020, exactly 10 plus 1,010, because its equal-cost set includes spine1.ams. What works: TI-LFA, where segment routing exists, though a plain IP fabric like Meridian's has none; and uniform throttles, which narrow the window to the flooding time.

## Graceful restart

Sometimes the right answer is not to converge. When a router's routing software restarts, its chip keeps forwarding on the last FIB. If neighbours reroute around it and then back, that is two disruptions for zero failures. Graceful restart is the agreement to wait: the neighbours, as helpers, keep the adjacency and the routes through it for a bounded time while it resynchronises.

It is a bet that the forwarding plane is fine. If forwarding is actually broken, helpers send traffic into it for the whole restart time. That is what BFD's control-plane-independent flag is for: such a session going down means forwarding failed, so the helper converges at once. In a Clos, many operators disable underlay graceful restart or keep it short: with four spines, routing around a restarting box costs a quarter of capacity for a second, while trusting stale state for a minute risks an invisible black hole. It earns its keep in planned upgrades and on boxes with no redundant path, such as a single border router.

## In the interview

The first question a principal engineer asks: a link fails, where does the time go?

[pause]

Detection: loss of light, else BFD's interval times the multiplier, else the IGP hold time. Propagation: a generation wait, then one to two milliseconds per flooding hop. Computation: an SPF wait, then a sub-millisecond run. FIB programming: one group write if hierarchical, per prefix otherwise. Detection usually dominates; once it is fast, the throttles do. The common wrong answer is "Dijkstra", the cheapest phase.

The follow-up: should we set BFD to 10 milliseconds times three everywhere? Only where it is offloaded and nothing underneath recovers on its own. On a carrier circuit with a 50 millisecond protection switch, 30 millisecond detection turns every carrier event into a reroute, and in software it fires falsely under CPU load. "Faster is always safer" trades rare slow detection for frequent false reroutes. It is honest to defer to the network team on each platform's hardware minimum, and offer to build the report showing which sessions are offloaded.

That report is the platform's job. A convergence event lasts about a second, invisible to a once-a-minute poll, so join the port, BFD, LSP, SPF and FIB events into one timeline per event: "1,018 milliseconds, of which 900 BFD" says what to tune. And group BFD flaps by device: many sessions on one box at once is the box, one session is the path.

## Recap

Four things to remember. Convergence is detection, propagation, computation and FIB programming, and detection usually dominates: 900 of 1,018 milliseconds with BFD, 30 seconds without. BFD's detection time is the remote's multiplier times the agreed interval; run it offloaded, and slower than any protection switch beneath it. SPF is cheap, the waits are the cost, and a flat FIB can add seconds after the protocol says it is done. And in a Clos the spine next to a failure converges first, so microloops appear and no loop-free alternate exists: measure them with probes and TTL-expired counters.

At your desk: the timeline and both visualisations, the BFD packet, state diagram and bring-up trace, the timer code, the SPF back-off simulation, the microloop simulation, and the graceful restart steps with the end-to-end, failure-mode and detector tables.
