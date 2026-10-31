---
lesson: ecmp-and-hashing
source: e5959f355f86478c
---
## 1

Two TCP connections between acme-web1 and acme-db1 differ only in their source port, 51517 and 51518. Leaf1 in Amsterdam has four equal-cost uplinks. What can you say about their paths?

A, they alternate uplinks packet by packet to balance the load. B, they take the least-loaded uplink, measured when the SYN arrives. C, they may take different uplinks, because one changed field changes the hash. D, they always share an uplink, because the addresses are equal.

[think]

The answer is C: they may take different uplinks, because one changed field changes the hash.

The hash covers all five fields, so changing the source port gives an unrelated hash and an effectively random member. In the walkthrough they landed on spine4 and spine3. Sharing an uplink would only be guaranteed with an address-only hash policy. ECMP never measures load, and alternating per packet would reorder TCP segments.

## 2

An ECMP group of four spines loses spine3. With plain hash modulo N, what happens to the flows that were on the three healthy spines?

A, exactly one quarter of them move, to balance the load again. B, none of them move; only spine3's flows are rehashed. C, all of them are dropped until routing fully reconverges. D, about two thirds of them move to a different healthy spine.

[think]

The answer is D: about two thirds of them move to a different healthy spine.

The divisor changes from 4 to 3, so most results change: in the hand trace six of nine flows on healthy spines moved, and the simulation measured 67 percent. Only resilient hashing, which rewrites nothing but the dead member's buckets, leaves healthy flows in place. That matters most when the members hold state, such as anycast load balancers, whose moved connections are reset.

## 3

Traffic from leaf1 to leaf3 inside VXLAN all rides one spine, though plain IP traffic between the same leaves spreads evenly. What is the most likely cause?

A, the VTEP sets one fixed outer UDP source port for every flow. B, the outer TTL is too low for the packets to reach the other spines. C, the spines hash the inner headers, and those are all identical. D, VXLAN disables ECMP because the VNI must stay on one path.

[think]

The answer is A: the VTEP sets one fixed outer UDP source port for every flow.

Spines hash only the outer headers. If the encapsulating VTEP does not copy a hash of the inner flow into the outer source port, as the VXLAN standard recommends, every tunnelled packet between two VTEPs has the same outer five-tuple and hashes to one member. Spines do not parse inner headers by default, and nothing in VXLAN pins a VNI to a path.

## 4

Two tiers of switches use ECMP, all with the same chip, the same hash fields and the same factory seed. Half of the links between the second tier and the gateways carry no traffic. What fixes it?

A, giving each device its own hash seed so the tiers disagree. B, bundling two links between each spine and gateway. C, lowering the IS-IS metric of the idle links to attract traffic. D, turning on resilient hashing in every ECMP group.

[think]

The answer is A: giving each device its own hash seed so the tiers disagree.

This is polarisation: the second tier computes the same hash as the first and repeats its choice, so each spine uses only some of its uplinks. Different seeds per device make the hashes unrelated. Resilient hashing only changes failure behaviour, a bundle behind the spine picks its member with the same correlated hash and polarises too, and a lower metric would make the paths unequal rather than spread them.

## 5

One of leaf1's four uplinks drops 2 percent of frames but stays up, so the loss across the group is half a percent. Why does a ping from leaf1's servers to leaf3's servers show no loss at all?

A, half a percent on average is too small for a ping ever to detect. B, the ping is one flow, hashed onto one path that avoids the bad link. C, ICMP is prioritised over TCP traffic, so it is never dropped. D, BFD removed the bad link from the group before the ping ran.

[think]

The answer is B: the ping is one flow, hashed onto one path that avoids the bad link.

Every ping between two hosts shares one hash input, so it tests one member, three times in four a healthy one. BFD needs three consecutive misses and almost never sees them at 2 percent loss. A ping that happened to hash onto the bad member would see about 2 percent, not half a percent. Detecting a gray member needs probes with many five-tuples, grouped by the member each one crossed.

## 6

Two 60 gigabit per second backup flows collide on one 100 gigabit uplink. Which change addresses the collision itself?

A, reseeding the hash on the leaf so the flows rehash. B, raising the hash table to more buckets per member. C, enabling symmetric hashing so replies take the same path. D, splitting each backup into several parallel connections.

[think]

The answer is D: splitting each backup into several parallel connections.

More flows give the hash more chances to spread the bytes. A new seed only reshuffles which flows collide; with two elephants on two uplinks they still share one half the time. Symmetric hashing aligns the two directions of a flow, and more buckets improve balance after failures, but neither changes the fact that one flow is pinned to one member.
