---
lesson: clos-and-leaf-spine
source: 2fb078b1d30b5744
fit: great
desk:
  - "The three leaf-spine visualisations: six flows hashed over four spines, and one spine lost with two spines and with four"
  - "The three-tier oversubscription table and the 2n minus 1 worst-case table"
  - "The crosspoint count and call-churn simulation"
  - "The spine port budget, the oversubscription and spines tables, and the sizing code"
  - "The fabric check against LLDP neighbours and peak load"
  - "The trade-offs and failure modes tables"
---
## Introduction

A server in a modern data center talks mostly to other servers. One page view fans out into hundreds of internal calls. Every write to storage is copied to two or three other machines. A training job's GPUs exchange gigabytes after every step.

Diagrams put the internet at the top, so traffic to and from the outside world runs north-south, and traffic between servers inside runs east-west. At Meridian, a user loading a page is north-south: through an ISP, a border gateway, a spine, the web server's leaf. Everything that page view causes inside is east-west.

East-west wins by a wide margin. Cisco's forecasts of the late 2010s put about 70 percent of data center traffic inside the data center. Fan-out multiplies it: a request touching 100 shards makes 100 requests and 100 replies. Replication multiplies it: writing 1 terabyte with three replicas sends 2 more across the fabric.

So the network must give any server a fast path to any other, at equal latency, and keep doing so when a switch dies. A tree of ever-bigger switches cannot. Nearly every large data center since about 2010 uses a Clos fabric instead. Coming up: why the tree broke, the 1953 idea behind the fix, and the numbers that size a fabric.

## The three-tier tree

Until roughly 2010, data center networks copied the enterprise campus: a tree of three layers. Access switches at the top of each rack. A pair of aggregation switches above them, acting as the servers' default gateway. And big core chassis joining the aggregation pairs.

Below aggregation everything was layer 2, with VLANs stretched across racks, and layer 2 has no TTL, so a loop circulates broadcasts forever. Each access switch had an uplink to each aggregation switch, and the two were linked: a triangle, which is a loop, so spanning tree blocked one uplink. The gateway ran under VRRP, one switch active and one on standby.

Oversubscription is the capacity that can arrive at a switch from below, divided by the capacity it has towards the rest of the network. At four to one, if every server sends at once, each gets a quarter of its port. In a tree the ratios multiply. The lesson's late-2000s example: 4.8 to one at the access switch, five to one at aggregation, so 24 to one across the core. A server with a 1 gigabit port gets about 42 megabits per second.

Then traffic turned sideways. Storage, shuffles and microservices sent most bytes between arbitrary racks, through the most oversubscribed layer. Half the links did nothing: blocked uplinks, a standby gateway. Growth meant a bigger chassis, with a hard ceiling and a fork-lift replacement each time. Failures were large: losing an aggregation switch took the gateway from thousands of servers, and a classic spanning-tree recalculation took 30 to 50 seconds. And latency depended on placement: one switch apart in a rack, five apart across aggregation blocks.

The signal of a tree in trouble: output discards on aggregation and core uplinks, idle blocked ports, and latency that changes when a server moves.

## Clos, 1953

A telephone exchange connects any of N incoming lines to any of N outgoing lines. A crossbar does it with a crosspoint at every intersection, N squared of them: 1,024 lines need over a million. Charles Clos, at Bell Labs, built the same guarantee from small crossbars in three stages: ingress switches with n inputs each, middle switches linked to every ingress and every egress switch, and egress switches with n outputs each.

How many middle switches guarantee that a new call between two idle lines always finds a path, without moving anyone? Think about the worst case.

[pause]

Two n minus one. The call needs a middle switch whose link from its ingress switch and whose link to its egress switch are both free. In the worst case, the other n minus one inputs on the ingress switch use n minus one middle switches, and the other n minus one outputs on the egress switch use n minus one different ones. One more is needed. That is strictly non-blocking. If existing calls may be moved, n middle switches suffice: rearrangeably non-blocking.

It is cheap, too: a strictly non-blocking 1,024-line Clos needs about a fifth of the crossbar's crosspoints. And blocking happens in the middle, never at the ends.

Fold the network in half. Each ingress switch and its matching egress switch become one switch, the leaf. The middle switches become the spines. Up, across, down: that is why leaf-spine is a 3-stage Clos.

Packets change the arithmetic. A call held a link for minutes; a 1,500 byte packet holds a 400 gigabit link for 30 nanoseconds, so links are shared and capacity is what counts. If a leaf's uplink capacity equals its server capacity, every server can send at full rate, provided traffic is spread evenly. In a data center, non-blocking means one to one oversubscription.

That "provided" is where fabrics part from the theorem. ECMP hashes each flow's five-tuple onto one spine, like a circuit chosen by hash rather than by looking for a free one. Two large flows can share an uplink while another idles. One to one guarantees capacity in total, not per flow. The ECMP and hashing lesson goes deeper.

## Leaf-spine

The rules are short. Everything that is not a fabric switch attaches to a leaf. Every leaf connects to every spine, with the same links. Leaves never connect to each other, nor spines to each other. Meridian bends the first rule: it hangs route reflectors, gateways and long-haul circuits off its spines, which costs spine ports.

Meridian's Amsterdam site has 4 spines and 16 leaves. Every fabric link is routed, with its own slash 31 subnet, so there is no spanning tree and every link carries traffic. Each switch has a loopback address, its identity in routing, and the underlay, IS-IS at metric 10 per link, makes every loopback reachable.

So: two hops, always. Leaf, spine, leaf, three switches, the same latency for every pair of leaves. Paths equal spines: leaf1 reaches leaf3's loopback at metric 20 through four equal next hops, one ECMP group. And spines are simple: they route to loopbacks and forward, and with VXLAN never see a tenant address.

How it breaks: a lost spine or link removes a fraction of the paths, often without any alarm, and a miscabled leaf has fewer paths than its peers. The signal: ECMP group width per leaf, which should equal the spine count, and an uplink drifting apart from its siblings.

## Ports and oversubscription

Two port counts bound a two-tier fabric. Each leaf uses one port on every spine, so leaves are at most the spine's port count. Each spine uses one uplink on every leaf, so spines are at most the leaf's uplink ports. 

Meridian's numbers. Each Amsterdam leaf has 48 server ports at 100 gigabits and 8 uplinks at 400, of which 4 are used. Each spine has 32 ports. So the site can grow to 8 spines. And leaves? Each spine gives 16 ports to leaves, 2 to route reflectors, 2 to gateways and 1 to the circuit to Singapore, leaving 11 free. The real ceiling is 27 leaves, not 32.

Leaf oversubscription: 4,800 gigabits of server ports against 1,600 of uplink. Three to one. Read it three ways. Worst case: if all 48 servers on leaf1 send off the leaf at once, each gets about 33 gigabits of its 100. Local traffic is free: two servers on one leaf never touch an uplink, so three to one is a bet on how much traffic leaves the rack. And bisection bandwidth: cut the servers into two halves the worst way and add up what crosses. For Amsterdam that is 12.8 terabits against 38.4 on each side: three to one again. It is the number large operators quote.

Ratios follow the workload. Web and general compute run three or four to one, because bursts are short and do not coincide. AI training runs one to one, because every GPU sends at once and the slowest flow sets the step time. In two tiers, oversubscription lives only at the leaf. Add tiers and ratios multiply: three to one at the leaf and two to one at the spine is six to one between pods.

And one to one is not congestion-free. ECMP collisions still drop packets, and so does incast, many senders converging on one receiver's 100 gigabit port. The signal of a hot leaf: discards on its uplinks while its server ports run well below line rate.

## Adding and losing spines

A fabric grows without touching existing links. A new leaf is cabled to every spine. A new spine gets one link from every leaf, and every ECMP group widens by one: the move the tree could never make.

Here is why fabrics have four, eight or sixteen spines rather than two big ones. Losing one of N spines costs one Nth of every leaf's uplink, and the survivors carry the same load. The formula to remember: utilisation is multiplied by N over N minus one.

Picture leaf1 at 62.5 percent with two spines: 500 gigabits over 800. Then spine2 loses power. Within milliseconds to tens of milliseconds of its ports going dark, every leaf drops it from the group, before any routing message arrives. Every flow moves to spine1, and 500 gigabits meets 400. That is 125 percent. Queues fill, packets drop, and no redundancy is left.

Replay it with four spines: a terabit over 1,600. Spine2 dies, the group shrinks to three, capacity falls to 1,200, and utilisation rises to 83 percent: survivable, though bursts queue. With eight spines, 71.

Another number to remember: adding spines does not add leaves. The maximum stays at 32, two spines or eight, because it depends on spine ports. Spines buy capacity and resilience; only bigger spines, or another tier, buy leaves.

A quieter failure: a leaf cabled twice to one spine and never to another raises no alarm. So the platform should show ECMP width against intent, LLDP neighbours against the cabling plan, and each leaf's peak load against what remains after its worst spine loss: "green now, red if spine2 fails." In the lesson's check, leaf2 looks fine at 44 percent, but half its uplinks go to spine2, so losing that spine would take it to 88.

## Pods, super-spines and five stages

When the spine ports run out, repeat the Clos idea one level up. Group 16 leaves and 4 spines into a pod. Each spine uses 16 of its 32 ports for its leaves and sends the other 16 up to super-spines. The super-spines form planes, one per spine position: spine 1 of every pod connects to every super-spine in plane 1, and so on, four planes of 16. Each super-spine has a port per pod, so 32 pods.

That is 512 leaves and 24,576 server ports, sixteen times the two-tier limit, from the same 32-port switches. Spines are one to one, so the only oversubscription is still the leaf's three to one. Within a pod, three switches; between pods, five: leaf, spine, super-spine, spine, leaf. The 5-stage Clos.

The costs: two more hops between pods, upper tiers that multiply oversubscription unless kept at one to one, and a plane-wide error that touches every pod. Watch capacity per plane, which should be equal.

## In the interview

How many leaves can this fabric hold, and what do you do when it is full?

[pause]

Leaves are bounded by spine ports, minus anything else on the spines: 27 at Meridian's Amsterdam site. Spines are bounded by leaf uplink ports. When it is full, buy higher-radix spines or add a tier: pods joined by super-spine planes. The common wrong answer is "add more spines", which adds capacity but not a single leaf.

And: what happens when a spine dies, and how much headroom do you need?

[pause]

Each leaf removes it from its ECMP groups when the ports go dark, flows rehash, and every leaf loses one Nth of its uplink, so load is multiplied by N over N minus one. To stay under 80 percent after losing one of four spines, peak load must stay under 60 percent today. The wrong answer is "nothing, it's redundant": it is still connected, but at reduced capacity.

## Recap

Five things to remember. The three-tier tree broke on east-west traffic: compounding oversubscription, blocked links, growth by bigger boxes. Clos needs two n minus one middle switches never to block; folded, that is leaf-spine, where non-blocking means one to one plus even spreading, and ECMP spreads only statistically. Spine ports bound leaves and leaf uplinks bound spines, after subtracting what else hangs off the spines. Losing one of N spines multiplies load by N over N minus one, so many small spines beat two big ones. And pods with super-spine planes make a 5-stage Clos, with two more hops and a second ratio to keep at one to one.

At your desk: the three leaf-spine visualisations, the oversubscription and worst-case tables, the call-churn simulation, the port budget and sizing code, the fabric check against LLDP, and the trade-off and failure tables.
