---
lesson: connecting-sites-and-backbones
source: c2821a7912aa357b
---
## 1

Meridian's Amsterdam to Singapore square has two 100 gigabit circuits. At the busiest hour, each carries 70 gigabits a second from Amsterdam to Singapore. Circuit 1 is cut, and IS-IS converges. What happens?

A, circuit 2 is offered 140 gigabits a second, and spine 2 in Amsterdam drops the excess. B, traffic spreads over circuit 2 and the leaf links, so nothing is dropped. C, IS-IS keeps half the traffic on spine 1 in Amsterdam until the circuit is repaired. D, circuit 2 runs at 70 percent, because the cut traffic is lost with circuit 1.

[think]

The answer is A: circuit 2 is offered 140 gigabits a second, and spine 2 drops the excess.

After convergence every Amsterdam leaf sends its Singapore traffic to spine 2, so circuit 2 is offered 140 percent of its capacity and the queue overflows. Leaf links only feed the spines; they are not another way to Singapore. Spine 1 keeps a detour through a leaf, but the leaves stop using it once it costs 1,040 against 1,020. The cut traffic is rerouted, not lost, which is why each circuit must stay under 50 percent at peak.

## 2

Singapore and San Jose are joined by about 13,600 kilometres of fibre. What is the lowest round-trip time any application between them can see?

A, about 68 milliseconds, because each direction has its own fibre. B, it depends on circuit speed: about 14 milliseconds at 400 gigabits. C, about 91 milliseconds, at the speed of light in vacuum. D, about 136 milliseconds, from 5 microseconds per kilometre each way.

[think]

The answer is D: about 136 milliseconds.

Light in fibre covers about 5 microseconds per kilometre, so 13,600 kilometres is 68 milliseconds one way and 136 there and back. 68 is only the one-way figure; a fibre per direction does not shorten either trip. Vacuum would give about 91, but the signal travels in glass, about a third slower. Circuit speed changes serialisation, microseconds per packet, not propagation.

## 3

Two Amsterdam spines and two Singapore spines are joined either by a square of two 100 gigabit circuits, or by a full mesh of four 50 gigabit circuits. With plain ECMP in IS-IS, what is the largest total load that survives any single circuit failure?

A, square 100 gigabits a second, mesh 150. B, square 50, mesh 150. C, square 100, mesh 100. D, square 200, mesh 200.

[think]

The answer is C: 100 gigabits a second for both.

In the mesh, the leaves still see both Amsterdam spines at equal cost after a failure, so half the load still goes to the spine with only one 50 gigabit circuit left. It fills at 100 gigabits of total load, the same point where the square's survivor fills. The mesh's remaining 150 is usable only with weighted multipath, sending that spine a third of the traffic. And 200 ignores the failure entirely.

## 4

Round-trip time on one Amsterdam to Singapore circuit steps from 105 milliseconds to 128, and stays flat for days. Utilisation and drops are unchanged. What is the most likely cause?

A, the carrier rerouted the circuit onto a longer path. B, a failing optic adding error-correction delay on every frame. C, congestion on the circuit, adding queueing delay. D, IS-IS moved traffic onto the detour through a leaf.

[think]

The answer is A: the carrier rerouted the circuit onto a longer path.

A step that stays flat is a longer path: 23 milliseconds more round trip is about 2,300 kilometres more fibre each way, typical of a carrier protection path or a reroute after a fault. Queueing would vary with load and show in drops and utilisation. Error correction adds microseconds, not milliseconds. The detour through a leaf adds two switch hops, also microseconds, and leaf traffic does not use it after convergence.

## 5

A backup job copies data from Amsterdam to Singapore over a single TCP connection with a 4 megabyte window, and achieves about 320 megabits a second. The 100 gigabit circuits are at 40 percent, with no drops. What limits it?

A, ECMP, which pins the flow to one circuit of the two. B, the window: 4 megabytes per 105 millisecond round trip is about 320 megabits a second. C, the VXLAN overhead of 50 bytes per packet on the circuit. D, the circuits, which are too busy at 40 percent to give more.

[think]

The answer is B: the window.

A TCP sender can have at most one window of unacknowledged data in flight per round trip, so 4 megabytes every 105 milliseconds is about 320 megabits a second. Filling 100 gigabits at this distance needs about 1.3 gigabytes in flight. Each circuit has 60 gigabits free, so neither its load nor ECMP pinning is the limit, and VXLAN costs only about 3 percent of a full-size packet. The fix is on the hosts: bigger buffers, parallel streams, or a tool built for long paths.

## 6

Meridian orders its two Amsterdam to Singapore circuits from two different carriers. A single seabed landslide takes both down at the same time. What did the planning miss?

A, IS-IS needed BFD to keep the second circuit from failing as well. B, the circuits should have been protected wavelengths with 50 millisecond switching. C, the carriers' circuits rode one cable or landing station: a shared-risk group. D, two circuits are too few; a square cannot survive any failure.

[think]

The answer is C: the circuits shared a cable or landing, a shared-risk link group.

Two carriers do not guarantee two routes: carriers lease capacity on the same subsea cables and land at the same stations. Diversity has to be checked on the carriers' route maps. BFD detects failures faster but cannot prevent one, and carrier protection switches within the carrier's own network, which may share the same cable. A square survives any single failure; this was one event taking out both.
