---
review: fabric-architecture
source: dcd090bf1d872113
---
## Introduction

Fourteen questions from the fabric architecture module. Answer out loud before the answer comes.

They run in the order of the lessons: Clos and leaf-spine, ECMP and hashing, optics and the physical layer, connecting sites and backbones, and redundancy and failure domains. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A leaf-spine fabric uses spines with 32 ports, one link per leaf per spine. The operator adds four more spines to the existing four. What happens to the maximum number of leaves?

A, it stays at 32, since it depends on each spine's ports. B, it halves to 16, since each leaf needs more uplinks. C, it doubles to 64, since there are twice the spines. D, it rises to 36, since each new spine adds one port.

[think]

The answer is A: it stays at 32, since it depends on each spine's ports.

Each leaf uses one port on every spine, so the number of leaves is bounded by a single spine's port count, however many spines there are. More spines widen every leaf's ECMP group and add capacity, as long as each leaf has an uplink port for every spine. Growing past 32 leaves needs higher-radix spines or a super-spine tier.

## Question 2

A fabric is built one to one, non-blocking. Yet one leaf uplink shows output discards while its sibling uplinks are half idle. What is the most likely explanation?

A, ECMP hashed several large flows onto that uplink, ignoring load. B, spanning tree has blocked the sibling uplinks to prevent a loop. C, the spines are oversubscribed, so the one to one ratio is only nominal. D, the leaf's forwarding table lost the other next hops after a routing change.

[think]

The answer is A: ECMP hashed several large flows onto that uplink, ignoring load.

Non-blocking means enough capacity in total. ECMP picks an uplink per flow by hashing headers and never checks how busy it is, so a few large flows can collide on one link while others idle. Spines in a two-tier fabric have no uplinks to oversubscribe, a routed fabric runs no spanning tree on its links, and a lost next hop would leave the siblings carrying nothing at all, not half idle.

## Question 3

An ECMP group of four spines loses spine3. With plain hash modulo N, what happens to the flows that were on the three healthy spines?

A, exactly one quarter of them move, to balance the load again. B, none of them move; only spine3's flows are rehashed. C, all of them are dropped until routing fully reconverges. D, about two thirds of them move to a different healthy spine.

[think]

The answer is D: about two thirds of them move to a different healthy spine.

The divisor changes from 4 to 3, so most results change: in the hand trace six of nine flows on healthy spines moved, and the simulation measured 67 percent. Only resilient hashing, which rewrites nothing but the dead member's buckets, leaves healthy flows in place. That matters most when the members hold state, such as anycast load balancers, whose moved connections are reset.

## Question 4

Traffic from leaf1 to leaf3 inside VXLAN all rides one spine, though plain IP traffic between the same leaves spreads evenly. What is the most likely cause?

A, the VTEP sets one fixed outer UDP source port for every flow. B, the outer TTL is too low for the packets to reach the other spines. C, the spines hash the inner headers, and those are all identical. D, VXLAN disables ECMP because the VNI must stay on one path.

[think]

The answer is A: the VTEP sets one fixed outer UDP source port for every flow.

Spines hash only the outer headers. If the encapsulating VTEP does not copy a hash of the inner flow into the outer source port, as the VXLAN standard recommends, every tunnelled packet between two VTEPs has the same outer five-tuple and hashes to one member. Spines do not parse inner headers by default, and nothing in VXLAN pins a VNI to a path.

## Question 5

Two tiers of switches use ECMP, all with the same chip, the same hash fields and the same factory seed. Half of the links between the second tier and the gateways carry no traffic. What fixes it?

A, giving each device its own hash seed so the tiers disagree. B, bundling two links between each spine and gateway. C, lowering the IS-IS metric of the idle links to attract traffic. D, turning on resilient hashing in every ECMP group.

[think]

The answer is A: giving each device its own hash seed so the tiers disagree.

This is polarisation: the second tier computes the same hash as the first and repeats its choice, so each spine uses only some of its uplinks. Different seeds per device make the hashes unrelated. Resilient hashing only changes failure behaviour, a bundle behind the spine polarises too, and a lower metric would make the paths unequal rather than spread them.

## Question 6

Leaf1 in Amsterdam transmits at plus 0.3 dBm per lane, unchanged since commissioning. Spine3, at the other end, now receives minus 5.9 dBm per lane instead of minus 1.8. Where is the fault most likely to be?

A, in the FEC configuration on the two ends. B, in a connector or the fibre between them. C, in leaf1's laser, which has started to age. D, in spine3's receiver electronics.

[think]

The answer is B: in a connector or the fibre between them.

The far end's transmit power is unchanged, so the laser is fine, while about 4 decibels more light is lost before it reaches spine3. That points at the path: a contaminated or damaged connector, a tight bend or a cracked fibre, which is why cleaning comes first. A failing receiver would usually show normal receive power with rising errors, and a FEC mismatch would leave the light normal and the link down.

## Question 7

One of leaf1's four uplinks drops 2 percent of its frames. Why does it stay in the ECMP group?

A, IS-IS removes lossy links only after its SPF timer expires. B, BFD needs three misses in a row, which is rare at 2 percent loss. C, ECMP excludes a link only when its utilisation reaches 100 percent. D, LLDP refreshes every 30 seconds and keeps the link marked up.

[think]

The answer is B: BFD needs three misses in a row, which is rare at 2 percent loss.

Routing asks only whether a link is up, and light is present, so the port is up. Three consecutive misses at 2 percent loss happen about 8 times in a million. Nothing in IS-IS or ECMP reacts to loss, and LLDP does not feed routing, so catching it needs error-rate thresholds and probes.

## Question 8

A team wants to split a 400 gig port into four 100 gig server ports. Which module makes that possible?

A, 400G LR4, because its longer reach leaves spare budget. B, 400G FR4, because its four wavelengths can be separated. C, 400G DR4, because each lane has its own fibre pair. D, 400G FR4, because duplex LC cables split more easily.

[think]

The answer is C: 400G DR4, because each lane has its own fibre pair.

A DR4 module is a parallel optic: four independent lasers on four fibre pairs in one MPO connector, so a fan-out cable can send each lane to a different server. FR4 and LR4 multiplex four wavelengths onto one fibre pair and are one 400 gig interface; separating them would need an optical demultiplexer, and reach has nothing to do with breakout.

## Question 9

Meridian's Amsterdam to Singapore square has two 100 gigabit circuits. At the busiest hour, each carries 70 gigabits a second from Amsterdam to Singapore. Circuit 1 is cut, and IS-IS converges. What happens?

A, circuit 2 is offered 140 gigabits a second, and spine 2 in Amsterdam drops the excess. B, traffic spreads over circuit 2 and the leaf links, so nothing is dropped. C, IS-IS keeps half the traffic on spine 1 in Amsterdam until the circuit is repaired. D, circuit 2 runs at 70 percent, because the cut traffic is lost with circuit 1.

[think]

The answer is A: circuit 2 is offered 140 gigabits a second, and spine 2 drops the excess.

After convergence every Amsterdam leaf sends its Singapore traffic to spine 2, so circuit 2 is offered 140 percent of its capacity and the queue overflows. Leaf links only feed the spines; they are not another way to Singapore. The cut traffic is rerouted, not lost, which is why each circuit must stay under 50 percent at peak.

## Question 10

Round-trip time on one Amsterdam to Singapore circuit steps from 105 milliseconds to 128, and stays flat for days. Utilisation and drops are unchanged. What is the most likely cause?

A, the carrier rerouted the circuit onto a longer path. B, a failing optic adding error-correction delay on every frame. C, congestion on the circuit, adding queueing delay. D, IS-IS moved traffic onto the detour through a leaf.

[think]

The answer is A: the carrier rerouted the circuit onto a longer path.

A step that stays flat is a longer path: 23 milliseconds more round trip is about 2,300 kilometres more fibre each way, typical of a carrier protection path or a reroute after a fault. Queueing would vary with load and show in drops and utilisation. Error correction adds microseconds, not milliseconds, and so does a detour through a leaf.

## Question 11

Meridian orders its two Amsterdam to Singapore circuits from two different carriers. A single seabed landslide takes both down at the same time. What did the planning miss?

A, IS-IS needed BFD to keep the second circuit from failing as well. B, the circuits should have been protected wavelengths with 50 millisecond switching. C, the carriers' circuits rode one cable or landing station: a shared-risk group. D, two circuits are too few; a square cannot survive any failure.

[think]

The answer is C: the circuits shared a cable or landing, a shared-risk link group.

Two carriers do not guarantee two routes: carriers lease capacity on the same subsea cables and land at the same stations. Diversity has to be checked on the carriers' route maps. BFD detects failures faster but cannot prevent one, and carrier protection switches within the carrier's own network, which may share the same cable.

## Question 12

A four-spine fabric runs at 70 percent uplink utilisation in the busiest hour. One spine is drained for an upgrade at that hour, and another spine fails during the window. What do the leaves' uplinks carry?

A, 140 percent, so queues overflow and drop. B, 70 percent, because ECMP rebalances the load. C, 93 percent, over target but without loss. D, 105 percent, slightly over capacity.

[think]

The answer is A: 140 percent, so queues overflow and drop.

With two of four spines gone, the remaining two carry everything, so the load doubles to 140 percent. One loss alone would give about 93. ECMP spreads the load over the survivors but cannot add capacity. To survive a drain plus a failure under an 80 percent target, the peak must stay under 40 percent, which is why drains are scheduled in quiet hours.

## Question 13

The blast-radius model ranks a bug in the spines' shared software release above any single rack or power feed failure. Which change reduces that radius?

A, moving the two route reflectors into separate racks. B, staging upgrades so few spines share a new release. C, adding a fifth spine running the same release. D, giving every spine a second, separately fed power supply.

[think]

The answer is B: staging upgrades so few spines share a new release.

The release is a failure domain shared by every spine that runs it, so hardware redundancy, more spines or more power supplies, leaves it untouched: a fifth spine crashes with the others. Staging limits how many spines can share a new release's bug at once. Separating the reflectors fixes a different shared fate, the rack.

## Question 14

A spine reboots after an upgrade. Its adjacencies come up in seconds, and a share of flows across the site is dropped for several seconds afterwards. What design rule was missing?

A, the spine should have come up costed out until its forwarding table was complete. B, the upgrade should have run with the spine left in service. C, BFD should have been disabled on the spine during the upgrade. D, the leaves should have used a larger ECMP group for that spine.

[think]

The answer is A: the spine should have come up costed out until its forwarding table was complete.

As soon as adjacencies form, leaves add the spine back to their ECMP groups and send it traffic, while its forwarding chip may not yet hold every route, so some flows are black-holed. Coming up with the overload bit or maximum metrics set, and restoring only after verification, prevents it. BFD and group size do not change what an unprogrammed forwarding table does.

## Recap

Three ideas kept coming back. ECMP hashes flows and never measures load, so collisions, fixed outer ports, shared seeds and single-flow pings all follow from that one fact. Capacity has to be planned for what is left after a failure, not for the healthy fabric: a spine drained and another lost, or one circuit of two cut, doubles the load on the survivors. And redundancy only helps when the copies fail independently: two carriers on one cable, two reflectors in one rack, or every spine on one release share a single fate.
