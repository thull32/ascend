---
lesson: the-troubleshooting-method
source: 1d3577afd3511f90
---
## 1

A customer says latency between two of their servers in one Meridian site rose from 10 milliseconds to 50. Hash-spread probes between the two leaves show a 60-microsecond round trip on every stream, unchanged, and the kernel's socket statistics on the server show a round trip of 84 microseconds. What is the most likely conclusion?

A, the 40 milliseconds are spent in the hosts, not the network. B, one spine is congested and adds 40 milliseconds of queueing. C, the probes take different paths from the real traffic. D, the tenant's EVPN route moved to a remote site.

[think]

The answer is A: the 40 milliseconds are spent in the hosts, not the network.

TCP's own round-trip estimate and the probes agree that the network round trip is tens of microseconds, so the extra 40 milliseconds are added above the network, in the hosts or the application. Here it was Nagle's algorithm meeting the 40-millisecond delayed-acknowledgement timer. Forty milliseconds of fabric queueing at 400 gigabits per second would need 2 gigabytes of buffer, far more than a shallow-buffer switch has, and the probes would have seen it. A move to a remote site would add more than 100 milliseconds, and the kernel's round trip would show it.

## 2

Sixteen probe streams between leaf1 and leaf3 in Amsterdam spread across four spines. Three streams, all through spine3, lose about 4 percent; the rest lose nothing. What should you do next to tell spine3 itself from one of its links?

A, raise the probe rate tenfold to measure the loss more precisely. B, reload spine3 and check whether the loss stops. C, ping spine3's loopback from leaf1 to test its control plane. D, probe from a second leaf pair to triangulate spine3's links.

[think]

The answer is D: probe from a second leaf pair to triangulate spine3's links.

Another leaf pair separates the elements. If leaf2 to leaf3 streams through spine3 also lose, and leaf1 to leaf2 streams through spine3 do not, the shared element is the link from spine3 to leaf3. A ping to the loopback tests the control plane and one path. More probes refine the number, not the location, and a reload destroys the evidence before the cause is known.

## 3

A device's interface counters show no discards and no errors, yet 6.3 billion of the 36 billion frames it received in five minutes were neither transmitted nor sent to its CPU. What does this show?

A, a link next to it is corrupting frames in transit. B, it forwarded those frames over its management port. C, it dropped frames somewhere its counters do not cover. D, the counters wrapped, so the totals are not reliable.

[think]

The answer is C: it dropped frames somewhere its counters do not cover.

Conservation says frames in must equal frames out, plus counted drops, plus frames sent to the CPU. The remainder was dropped without being counted, for example on a lookup miss in the pipeline after a hardware table lost an entry. Corruption on a link shows up as frame check errors at the receiving end and a gap between sent and received on that link. Sixty-four-bit counters do not wrap in five minutes, and data traffic never leaves through the management port.

## 4

Streaming telemetry from leaf2 in Amsterdam stops. The out-of-band ping to its management port answers in 0.6 milliseconds, and the spines report their links to leaf2 up, with IS-IS adjacencies up and near-full load arriving from it. What is the verdict?

A, alive and congested: its telemetry is being dropped. B, alive but cut off from the fabric by its uplinks. C, dead: page on-call, its servers are cut off. D, the collector has failed and every device is quiet.

[think]

The answer is A: alive and congested: its telemetry is being dropped.

The heartbeat proves the device is powered and running, and the neighbours prove its links and routing are up and saturated, so the telemetry is being dropped with the rest of the best-effort traffic. Dead would show out-of-band timeouts and loss of signal. Cut off would show adjacencies down while the out-of-band ping answers. A failed collector would make every device quiet at once, which scoping rules out here.

## 5

On a RoCE fabric, pause frames are rising on many rail-3 switch ports, and one server's NIC sends 41,200 pauses a second while receiving none. Which statement is right?

A, the pausing switch ports have the most congestion and should be drained. B, ECN must be disabled on rail 3, because pauses are replacing marks. C, the server is the root, and the switch ports are pausing on its behalf. D, the busiest spine port is the cause, since it carries the most pauses.

[think]

The answer is C: the server is the root, and the switch ports are pausing on its behalf.

Pauses travel upstream from where buffers fill, so a node that sends pauses without receiving any is where the congestion starts, and every paused switch port is passing the problem along, which makes it a victim. Here the server's PCIe link had come back at half width, so its NIC could not drain at line rate. ECN marks are present too. Ranking ports by pause count points at victims, not the cause.
