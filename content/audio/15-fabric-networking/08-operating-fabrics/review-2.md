---
review: operating-fabrics
source: 35bea38fd78ce96f
---
## Introduction

Twelve questions from the operating fabrics module, second part. Answer out loud before the answer comes.

They run in the order of the lessons: the troubleshooting method, safe change and maintenance, and incidents and what they teach. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A customer says latency between two of their servers in one Meridian site rose from 10 milliseconds to 50. Hash-spread probes between the two leaves show a 60-microsecond round trip on every stream, unchanged, and the kernel's socket statistics on the server show a round trip of 84 microseconds. What is the most likely conclusion?

A, the 40 milliseconds are spent in the hosts, not the network. B, one spine is congested and adds 40 milliseconds of queueing. C, the probes take different paths from the real traffic. D, the tenant's EVPN route moved to a remote site.

[think]

The answer is A: the 40 milliseconds are spent in the hosts, not the network.

TCP's own round-trip estimate and the probes agree that the network round trip is tens of microseconds, so the extra 40 milliseconds are added above the network, in the hosts or the application. Here it was Nagle's algorithm meeting the 40-millisecond delayed-acknowledgement timer. Forty milliseconds of fabric queueing at 400 gigabits per second would need 2 gigabytes of buffer, far more than a shallow-buffer switch has, and the probes would have seen it.

## Question 2

Sixteen probe streams between leaf1 and leaf3 in Amsterdam spread across four spines. Three streams, all through spine3, lose about 4 percent; the rest lose nothing. What should you do next to tell spine3 itself from one of its links?

A, raise the probe rate tenfold to measure the loss more precisely. B, reload spine3 and check whether the loss stops. C, ping spine3's loopback from leaf1 to test its control plane. D, probe from a second leaf pair to triangulate spine3's links.

[think]

The answer is D: probe from a second leaf pair to triangulate spine3's links.

Another leaf pair separates the elements. If leaf2 to leaf3 streams through spine3 also lose, and leaf1 to leaf2 streams through spine3 do not, the shared element is the link from spine3 to leaf3. A ping to the loopback tests the control plane and one path. More probes refine the number, not the location, and a reload destroys the evidence before the cause is known.

## Question 3

A device's interface counters show no discards and no errors, yet 6.3 billion of the 36 billion frames it received in five minutes were neither transmitted nor sent to its CPU. What does this show?

A, a link next to it is corrupting frames in transit. B, it forwarded those frames over its management port. C, it dropped frames somewhere its counters do not cover. D, the counters wrapped, so the totals are not reliable.

[think]

The answer is C: it dropped frames somewhere its counters do not cover.

Conservation says frames in must equal frames out, plus counted drops, plus frames sent to the CPU. The remainder was dropped without being counted, for example on a lookup miss in the pipeline after a hardware table lost an entry. Corruption on a link shows up as frame check errors at the receiving end. Sixty-four-bit counters do not wrap in five minutes, and data traffic never leaves through the management port.

## Question 4

On a RoCE fabric, pause frames are rising on many rail-3 switch ports, and one server's NIC sends 41,200 pauses a second while receiving none. Which statement is right?

A, the pausing switch ports have the most congestion and should be drained. B, ECN must be disabled on rail 3, because pauses are replacing marks. C, the server is the root, and the switch ports are pausing on its behalf. D, the busiest spine port is the cause, since it carries the most pauses.

[think]

The answer is C: the server is the root, and the switch ports are pausing on its behalf.

Pauses travel upstream from where buffers fill, so a node that sends pauses without receiving any is where the congestion starts, and every paused switch port is passing the problem along, which makes it a victim. Here the server's PCIe link had come back at half width, so its NIC could not drain at line rate. Ranking ports by pause count points at victims, not the cause.

## Question 5

Meridian's Amsterdam fabric has four spines. Leaf3 carries 270 gigabits per second on each of its four 400 gigabit uplinks at 2 in the afternoon, and the ceiling after a drain is 80 percent. What should the pre-check for draining spine2 decide?

A, pass, because the drained spine's share spreads evenly over three spines. B, block, because a drain always needs half the uplinks to be idle. C, pass, because 270 gigabits is only 67.5 percent of a 400 gigabit uplink. D, block, because each remaining uplink would carry 360 gigabits, 90 percent.

[think]

The answer is D: block, because each remaining uplink would carry 360 gigabits, 90 percent.

With one of four spines drained, each leaf's traffic spreads over three uplinks, so each carries four thirds of its current load: 360 gigabits, 90 percent of 400 and over the ceiling. Checking today's 67.5 percent misses that the drain itself raises the load. The traffic does spread evenly, which is exactly why the survivors become too full.

## Question 6

A rollout planner puts spine1 and spine2 in Singapore, the two spines of a two-spine site, in the same wave, because the wave is only 5 percent of the fleet. What is wrong?

A, the wave is too small to give the canary statistically useful results. B, spines must always go last, after every leaf has been upgraded. C, the wave breaks the redundancy group, so one bad release takes the whole site. D, nothing, because a small percentage keeps the blast radius small.

[think]

The answer is C: the wave breaks the redundancy group, so one bad release takes the whole site.

A bad release is the same on every device in a wave, so a wave's blast radius is every device in it failing at once. Both spines of a two-spine site failing together cuts every leaf in that site off from every other. A fleet percentage says nothing about failure domains; the rule is at most one member of each redundancy group per wave.

## Question 7

During the spine2 change window, with spine2 drained but not yet rebooted, leaf4 loses its link to spine1. How should change-aware monitoring treat it?

A, suppress it, because it falls within the declared maintenance window. B, amplify it, because leaf4 now has two of four uplinks. C, ignore it until the change closes, then raise it as a new incident. D, log it as expected, because adjacency changes are part of a spine drain.

[think]

The answer is B: amplify it, because leaf4 now has two of four uplinks.

The change declared only spine2's own adjacencies as expected. A second loss in the same fabric while one spine is drained is the drain-plus-failure case, with leaf4 on half its uplink capacity, which is more urgent than on a normal night. Since the reboot has not started, restoring spine2's metrics is the fastest fix. Suppressing everything in the window is how real outages go unnoticed during maintenance.

## Question 8

Spine2 comes back from its reboot and fails the device check: two of its five adjacencies stay down. What should the procedure do?

A, reboot it again immediately, then restore the metrics if it comes up. B, restore its metrics so the three good links carry traffic again. C, close the change, because the fabric is running on three spines anyway. D, keep it costed out and roll back the work by booting the old image.

[think]

The answer is D: keep it costed out and roll back the work by booting the old image.

After the point of no return, restoring the metric would put a device that failed its check into service. Staying costed out costs nothing, because the fabric was already sized for three spines, and the rollback is a second piece of work done while it carries no traffic: boot the previous image and check again. Closing the change leaves a drained spine with no owner, a leftover that removes a quarter of the capacity for weeks.

## Question 9

During an upgrade that reboots one leaf at a time, every reboot is followed a minute later by a site-wide loss of tenant traffic, while no link and no IS-IS adjacency goes down. Which pair of signals best identifies the cause?

A, CRC errors on the rebooted leaf's uplinks, followed by ECMP rehashing. B, a clock step on the rebooted leaf, then LSP counts collapsing on every router. C, a CPU spike on both spines, followed by a drop in interface utilisation. D, a BGP hold-timer expiry on the rebooted leaf, followed by session resets.

[think]

The answer is B: a clock step on the rebooted leaf, then LSP counts collapsing on every router.

A purge storm empties every router's link-state database with no link or adjacency down. The device that purged is the one whose clock just stepped, and the collapse appears on every router in the flooding domain at once. CRC errors and CPU spikes are local and would not remove the whole topology. BGP session resets are a consequence in large domains, not the cause.

## Question 10

A border gateway is taken out of the IGP before its BGP is withdrawn. Its eBGP session stays Established, and the ISP link shows normal inbound utilisation. Why does utilisation look normal?

A, the ISP has already failed over, so the traffic seen is only control-plane keepalives. B, interface counters freeze while a device is in a maintenance window. C, packets still arrive on the link and are discarded inside the gateway. D, the gateway forwards the inbound traffic to the other gateway over iBGP.

[think]

The answer is C: packets still arrive on the link and are discarded inside the gateway.

Interface utilisation counts arrivals, not delivery. The ISP still prefers the gateway's announcement, so traffic arrives at the normal rate and is dropped on the discard route; only the discard counter and an external probe show it. Counters do not freeze in maintenance, keepalives are a few bytes every few seconds, and iBGP carries routes, not packets.

## Question 11

One of a leaf's four uplinks loses 2 percent of its frames but stays up. The leaf's dashboard reports 0.5 percent loss on its uplinks. Why is that number misleading?

A, it is measured on the sender, which overcounts loss by a factor of four. B, it is sampled, so the true loss on every link is about 2 percent. C, it averages one sick link over four, while a quarter of the flows lose 2 percent. D, it counts only TCP traffic, while the loss affects only UDP flows.

[think]

The answer is C: it averages one sick link over four, while a quarter of the flows lose 2 percent.

ECMP pins each flow to one uplink, so the flows on the sick link lose 2 percent while the rest lose nothing, and averaging over the group divides that by four. Those flows run far slower, because TCP throughput falls roughly with the square root of the loss rate. A sender cannot see receive-side frame check failures at all, so it undercounts rather than overcounts.

## Question 12

In the Facebook outage of October 2021, why did a mechanism designed to protect users make the outage complete?

A, it rerouted traffic to a single backup site that was then overloaded. B, every DNS site withdrew at once, because they all shared the failed backbone. C, it throttled DNS queries, so resolvers gave up on Facebook's names. D, it required RPKI validation, which failed and rejected Facebook's own routes.

[think]

The answer is B: every DNS site withdrew at once, because they all shared the failed backbone.

Each DNS edge site withdrew its anycast announcement when it could not reach the data centers, which is right when one site is sick. The backbone failure was a shared cause, so every site withdrew together and the DNS prefixes disappeared from the internet. RPKI was not involved, since the legitimate origin withdrew its own routes.

## Recap

Three ideas kept coming back. Locate before you fix: compare the network's view with the host's, triangulate with a second leaf pair, and follow pauses upstream to the node that sends them without receiving any. Counters and averages can hide the fault: drops the counters do not cover, utilisation that counts arrivals rather than delivery, and one sick link averaged over four. And safe change is about failure domains and capacity under the change itself: check the load the drain will create, keep one member of each redundancy group per wave, and treat a second failure during a window as more urgent, not less.
