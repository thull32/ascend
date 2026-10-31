---
lesson: convergence-and-bfd
source: f9a3b04fe9d4fb56
---
## 1

spine1.ams runs BFD with 300 millisecond transmit and receive intervals and a multiplier of three. spine1.sin's template asks for 100 millisecond intervals and a multiplier of five. After a silent failure, what is the longest spine1.ams waits before declaring the session down?

A, 500 milliseconds: the peer's multiplier times the peer's 100. B, 300 milliseconds, because the faster configured side always wins. C, 900 milliseconds: its own multiplier times its own interval. D, 1,500 milliseconds: the peer's multiplier times the agreed 300.

[think]

The answer is D: 1,500 milliseconds, the peer's multiplier times the agreed 300.

Each side sends at the slower of its own desired interval and the peer's required receive interval, so both send every 300 milliseconds. Detection uses the remote side's multiplier, because the remote declares how many of its packets may be missed: five times 300 at spine1.ams, while spine1.sin uses three times 300, 900. Using your own multiplier is the common slip, and 100 is never used because spine1.ams refuses to receive that fast.

## 2

A fibre breaks inside a carrier's network on a leased circuit, and both spine ports stay up. Without BFD, what detects the failure, and roughly when?

A, the IS-IS hold timer, up to about 30 seconds on common defaults. B, SPF notices the missing link at its next scheduled run. C, ECMP removes the member in hardware within a millisecond. D, loss of light on the spine ports, within milliseconds.

[think]

The answer is A: the IS-IS hold timer, up to about 30 seconds on common defaults.

The spines receive light from the carrier's equipment, not from each other, so the ports never go down, and hardware ECMP pruning, which reacts to port state, never fires. SPF runs only when an LSP changes, which needs detection first. What remains is IS-IS's own hello hold time: three missed hellos at 10 seconds on common defaults.

## 3

After a circuit failure, spine1.ams converges 52 milliseconds before the leaves. Why do some packets loop between spine1.ams and a leaf during that window?

A, IS-IS sends data packets along with the LSP until SPF completes. B, the leaf's old ECMP set still includes spine1.ams, so it may hash them back. C, the leaf's TTL check is disabled while it waits for its SPF delay. D, spine1.ams floods the packets to every leaf while its tables are empty.

[think]

The answer is B: the leaf's old ECMP set still includes spine1.ams, so it may hash them back.

spine1.ams's new path goes down through a leaf to spine2.ams. A leaf that has not yet converged still has spine1.ams in its equal-cost set, and for some flows its hash picks it, so the packet returns, again and again, until the TTL expires or the leaf updates. Routers do not flood data packets in a routed fabric, IS-IS carries no data, and TTL is always decremented.

## 4

Why does spine1.ams have no loop-free alternate, in the sense of RFC 5286, for traffic to Singapore when its circuit fails?

A, its leaves are reachable only at a higher cost than the circuit itself. B, loop-free alternates work only for IPv6 destinations, not IPv4 loopbacks. C, a loop-free alternate needs BFD offloaded to hardware before it can activate. D, each leaf's shortest path to Singapore can pass through spine1.ams.

[think]

The answer is D: each leaf's shortest path to Singapore can pass through spine1.ams.

A neighbour is a safe alternate only if its distance to the destination is strictly less than its distance back to the failing router plus that router's own distance. Every leaf reaches Singapore at 1,020, exactly 10 plus 1,010, because its equal-cost set includes spine1.ams, so the test fails and the leaf might hash the packet back. That is typical above a spine in a Clos, which is why TI-LFA with segment routing exists. Address family and BFD placement have nothing to do with it.

## 5

An optic elsewhere in the domain has been flapping for a minute. Then a real link fails. Under RFC 8405's back-off, what happens to the SPF for the real failure?

A, it runs after the long delay, about 2 seconds with the RFC's example values. B, it runs after the initial delay, 50 milliseconds, as for any change. C, it runs at once, because a link failure bypasses the SPF throttle. D, it is skipped, because the throttle discards changes during flapping.

[think]

The answer is A: it runs after the long delay, about 2 seconds with the RFC's example values.

Continued changes put the router in the long-wait state, where any new change waits the long delay, and it stays there until the hold-down period passes with no changes. The throttle cannot tell a real failure from another flap, and it delays SPF but never discards a change. That is the cost of stability, and why a flapping link should be costed out quickly.

## 6

IS-IS shows the new topology on a leaf within 120 milliseconds of a failure, but data-plane probes show loss lasting one and a half seconds. The leaf holds 20,000 tenant prefixes. What is the most likely explanation?

A, the flood to the leaf was paced at one LSP per 33 milliseconds per interface. B, its FIB rewrites the next hops of every prefix one by one. C, BFD on the leaf's uplinks is configured too aggressively for its CPU. D, the leaf's SPF computation takes over a second for 20,000 prefixes.

[think]

The answer is B: its FIB rewrites the next hops of every prefix one by one.

The protocol has converged, so the remaining delay lies between the RIB and the hardware. With a flat FIB every one of the 20,000 prefixes is rewritten, and at tens of thousands of writes a second that is around a second. A hierarchical FIB rewrites one next-hop group and moves them all at once. SPF and a single LSP flood take milliseconds, and an aggressive BFD causes false failures, not slow recovery.
