---
review: the-network-interview
source: 7e0619d81f9e65e7
---
## Introduction

Thirteen questions from the network interview module. Answer out loud before the answer comes.

They follow the order of the lessons: explaining Meridian's network, the packet walk drills, the BGP and fabric question bank, and designing network software. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A principal network engineer asks why Meridian's spines need no BGP, even though tenant routes are carried in BGP EVPN. Which answer is correct?

A, IS-IS carries the tenant prefixes to the spines from each leaf. B, the route reflectors forward tenant packets on behalf of the spines. C, tenant packets reach the spines inside VXLAN, addressed to leaf loopbacks. D, the spine chips lack the table space to hold tenant routes.

[think]

The answer is C: tenant packets reach the spines inside VXLAN, addressed to leaf loopbacks.

The ingress leaf looks the destination up in EVPN and wraps the packet in VXLAN, with an outer header addressed to the egress leaf's loopback, which IS-IS carries. So a spine only ever looks up a loopback. IS-IS never carries tenant prefixes, route reflectors relay routes rather than packets, and table size is not the reason: encapsulation is.

## Question 2

Amsterdam and Singapore are joined by a square of two 100 gigabit per second circuits, carrying 80 gigabits per second between them. One circuit is cut. What is the steady state once the fabric converges?

A, both sites lose reachability until BGP reconverges between them. B, traffic shifts to the San Jose square until the circuit is repaired. C, the surviving circuit carries all 80 gigabits at 80 percent, with no loss. D, the surviving circuit carries 40 gigabits and the other 40 are dropped.

[think]

The answer is C: the surviving circuit carries all 80 gigabits at 80 percent, with no loss.

Each circuit ran at 40 percent, so the survivor can carry both shares, which is why the planning rule keeps each circuit below half. Nothing is dropped once IS-IS converges, because the path through the second spine and its circuit is still valid. Meridian has no Amsterdam to San Jose circuit to shift to, and it is IS-IS, not BGP, that restores the path, in well under a second.

## Question 3

Asked what LSP refresh interval your devices run, you do not know the configured value. Which response is strongest?

A, give 900 seconds as the value your devices use, to sound sure. B, say you would defer to the network team on it, and stop there. C, move on to how your team runs its Kubernetes clusters instead. D, give the mechanism and the defaults, defer the value, and name an alert.

[think]

The answer is D: give the mechanism and the defaults, defer the value, and name an alert.

The three-part move shows how close to the edge you got, names exactly what you don't know, and ends on what you would build, such as an alert on the LSP count collapsing alongside clock steps. Stating a default as your configuration is a bluff the next question can expose. A bare defer leaves nothing to score, and pivoting to an unrelated strength dodges the question.

## Question 4

A server can't ping its gateway. The server's neighbour table shows the gateway at the anycast gateway MAC, reachable, and the server reaches a host in another subnet through the gateway. What is the most likely explanation?

A, the server's MTU exceeds the port's MTU. B, the leaf's IS-IS adjacency to a spine is down. C, the server port is in the wrong VLAN. D, ICMP to the leaf's own address is rate-limited.

[think]

The answer is D: ICMP to the leaf's own address is rate-limited.

ARP resolving rules out layer 2 and the VLAN, and forwarding through the gateway works, so the gateway is fine. A ping addressed to the gateway itself is punted to the switch CPU under control-plane policing, which may drop or rate-limit it. A one-hop ping never involves IS-IS, and an MTU problem would affect large packets through the gateway too.

## Question 5

Leaf5 in Amsterdam shows its IS-IS adjacency to spine2 in Initializing. Spine2 shows no adjacency at all, and counts oversize frames on that port. What is the cause?

A, a hello authentication key mismatch between them. B, a duplicate system ID copied from a template. C, spine2's port MTU is smaller than leaf5's. D, mismatched hello timers on the two ends.

[think]

The answer is C: spine2's port MTU is smaller than leaf5's.

By default IS-IS pads its hellos to the interface MTU. Spine2 drops leaf5's padded hellos as oversize, so it never hears leaf5. Leaf5 hears spine2's smaller hellos, which do not list it, and waits in Initializing. An authentication mismatch keeps both ends Down with authentication failure counters, and IS-IS hello timers do not need to match.

## Question 6

Meridian wants inbound traffic via ISP1, and has prepended its AS three times towards ISP2. Yet traffic from ISP2's own customers still arrives via ISP2. Why?

A, ISP2 strips prepended ASes from customer announcements. B, ISP2 prefers customer routes by local preference before path length. C, ISP2 compares MED, which prepending does not change. D, prepending works only on routes announced over iBGP.

[think]

The answer is B: ISP2 prefers customer routes by local preference before path length.

Local preference is compared before AS path length, and ISP2 gives routes from its paying customers a higher local preference than routes from peers, so it keeps the direct path to Meridian however long it looks. ISP2's published community for lowering local preference, or a more specific prefix announced only via ISP1, moves that traffic. MED is not compared between routes from different neighbouring ASes.

## Question 7

Both route reflectors in Amsterdam lose power at once. The spines and fabric links are healthy. What happens to Acme's traffic between leaf1 and leaf3 in Amsterdam?

A, it is rerouted through the spines, which carry the overlay routes as a backup. B, it continues indefinitely on the last routes the leaves learned. C, it stops once the leaves' sessions time out and their overlay routes are deleted. D, it slows down, because the traffic was passing through the reflectors.

[think]

The answer is C: it stops once the leaves' sessions time out and their overlay routes are deleted.

No traffic ever passed through the reflectors, but every overlay route came from them. When the sessions drop, after the 9-second hold time or sooner with BFD, each leaf deletes the routes learned over them, and tenant traffic between leaves stops. Graceful restart bridges a software restart, not a dead pair, and the spines carry no overlay routes.

## Question 8

A RoCE fabric shows many PFC pause frames and almost no ECN marks. Why is that a problem, even if no packets are dropped?

A, pauses halt a priority link by link, and spread to other flows. B, pauses make the NIC switch from go-back-N to selective repeat. C, PFC disables ECN marking on every port it pauses. D, pause frames corrupt the RDMA payload they hold up.

[think]

The answer is A: pauses halt a priority link by link, and spread to other flows.

PFC is flow control: it stops one priority on the upstream link, not the source. Pauses propagate hop by hop and block every flow sharing that priority, including flows not headed to the congested port, and they can deadlock or storm. ECN with DCQCN should slow the senders early enough that PFC rarely fires, so few marks alongside many pauses usually means the ECN thresholds or the notification path are wrong.

## Question 9

A carrier circuit between spine1 in Amsterdam and spine1 in Singapore breaks inside the carrier's network, and both spine ports stay up. With IS-IS at the default 10-second hellos and no BFD, roughly how long until traffic moves to the other circuit?

A, about one second, because IS-IS floods the change immediately. B, about 30 seconds, when the IS-IS hold time runs out. C, about 180 seconds, when the BGP hold timer expires. D, a few milliseconds, because the ports detect the loss of light.

[think]

The answer is B: about 30 seconds, when the IS-IS hold time runs out.

The carrier's equipment keeps the ports lit, so there is no loss of light to detect, and nothing tells IS-IS until its 30-second hold time of three hellos runs out, 20 to 30 seconds after the cut. Flooding, the shortest path calculation and the forwarding table write then add about a tenth of a second. With BFD at 300 milliseconds times three, the whole sequence takes about a second. The BGP hold timer is irrelevant: the underlay reroutes, and the overlay's next hops stay reachable.

## Question 10

Why does the ingress VTEP set the outer UDP source port of a VXLAN packet from a hash of the inner headers?

A, so the outer packet passes stateful firewalls. B, so spines hashing the outer header spread tenant flows. C, so the egress VTEP can find the tenant's VRF. D, so the receiving VTEP can reorder the packets of a flow.

[think]

The answer is B: so spines hashing the outer header spread tenant flows.

Spines read only the outer header. Between two leaves the outer addresses, the protocol and destination port 4789 are constant, so without a varying source port every tenant flow between that pair would hash onto the same uplink. Deriving the port from the inner flow restores entropy while keeping each flow on one path. The VNI, not the port, identifies the tenant segment.

## Question 11

Your visibility platform's collectors stream over the data network. A site's dashboards freeze at their last values, and no alert fires. What design element was missing?

A, an absence-of-data alert, with heartbeats and the alert path carried out of band. B, polling with SNMP instead of streaming with gNMI from every device. C, a larger message queue between the collectors and the time-series store. D, a faster sample interval, so that the stale values are refreshed sooner.

[think]

The answer is A: an absence-of-data alert, with heartbeats and the alert path carried out of band.

When the path that carries telemetry fails, there is no bad value to alert on, only silence. So the platform must alert on missing data, and confirm over a path that does not share the failure, such as the out-of-band network or a probe from a neighbouring site. A larger queue only helps when data reaches it. SNMP polling rides the same data network, and a faster interval changes nothing when no samples arrive.

## Question 12

A config-as-code pipeline renders an empty configuration for a leaf, because the source of truth returned a partial record, and pushes it in replace mode. Which guard rail stops this before it becomes an outage?

A, a per-device lock, so that only one writer changes the leaf at a time. B, a confirmed commit that rolls back if not confirmed within a timer. C, a circuit breaker that refuses pushes deleting more than a threshold. D, golden-file tests of each template against a fixed sample record.

[think]

The answer is C: a circuit breaker that refuses pushes deleting more than a threshold.

The push is structurally valid, and the tool would confirm its own commit, so only a check on the size of the deletion catches it: refuse any push that deletes more than a set share of owned lines until a person approves. A lock prevents interleaving, not bad content. A confirmed commit protects against losing reachability to the device, and golden files test the template with good data, not a partial read at run time.

## Question 13

Sixteen probe streams between leaf1 and leaf3 in Amsterdam show 0.7 percent average loss. Three of them, all through spine3, lose about 4 percent. What should the platform alert on?

A, nothing yet, because ping between the same two hosts shows no loss. B, the worst path, grouped by the spine each stream crossed. C, the 0.7 percent average, since it is above the fabric's loss threshold. D, the total packets lost per minute across all sixteen streams.

[think]

The answer is B: the worst path, grouped by the spine each stream crossed.

Users on the bad path see 4 percent loss and retransmissions, and the average dilutes that by the number of healthy paths. Grouping streams by the path they took localises the fault to spine3, and then, with a second leaf pair, to one link. Ping uses a single 5-tuple, and so tests a single path, which is why it showed nothing.

## Recap

Three ideas kept coming back. Layers keep the fabric simple: the spines see only the outer header and leaf loopbacks, so tenant state, BGP and route reflectors live at the edge, and the outer source port is what spreads tenant flows across them. Timers and ordering decide outcomes: a 30-second hold time when the ports stay lit, local preference before path length, a padded hello that never arrives. And the hardest failures are quiet ones: a frozen dashboard, an average that hides one bad spine, a push that deletes everything while looking valid. In an interview, name the mechanism, the number, and the signal you would build.
