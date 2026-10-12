---
lesson: consistent-hashing-and-routing
source: 52db5c16fc04f5cc
---
## 1

A cache tier grows from 10 to 11 servers, and clients choose a server with the key's hash modulo N. Roughly what fraction of keys now map to a different server?

A, about 0 percent. B, about 50 percent. C, about 9 percent. D, about 91 percent.

[think]

The answer is D: about 91 percent.

A key keeps its server only when its hash modulo 10 equals its hash modulo 11, which holds for 1 value in 11, however good the hash is. So about 10 in 11 keys move, 91 percent in the lesson's simulation, and the hit rate collapses. A consistent hash moves only about 1 in 11, all onto the new server.

## 2

A small Maglev table has 7 slots. Removing backend B1 also moves slot 6 from B0 to B2, although B0 is still alive. Why does Maglev accept this?

A, B0 would otherwise hold more than half of all the table's slots. B, it is a bug that larger prime table sizes remove entirely. C, slot 6 had to move because B1 had claimed it originally. D, it trades minimal disruption for balance and constant-time lookup.

[think]

The answer is D: it trades minimal disruption for balance and constant-time lookup.

The rebuild lets the survivors claim slots in turn from their preference lists, which keeps every backend within one slot of its fair share, and keeps lookup to one array index, at the price of occasionally moving a slot between survivors. With a table of 65,537 slots, the lesson measured 0.19 percent such moves. Connection tracking keeps established flows on their old backend, and slot 6 belonged to B0, not B1.

## 3

With 100 virtual nodes per server, placed at random across ten servers, how far above its fair share does the busiest server typically run, and what would get you to about 5 percent?

A, exactly at fair share, since virtual nodes guarantee balance. B, about 15 percent above, and roughly 1,000 virtual nodes per server. C, about 1 percent above, so nothing further is needed. D, about 50 percent above, so switch the tier over to modulo N.

[think]

The answer is B: about 15 percent above, and roughly 1,000 virtual nodes per server.

A server's share is a sum of random arcs, so the spread shrinks with the square root of the number of virtual nodes. The lesson's measurement gave the busiest server 1.15 times its fair share at 100 virtual nodes, and 1.05 at 1,000. Exact balance needs deliberate placement, such as token allocation, Maglev tables or fixed slots, not more randomness.

## 4

Using rendezvous hashing across 8 nodes, you remove one node. Where do its keys go?

A, all to the node with the next-highest name. B, to a randomly chosen survivor on each request. C, they are rehashed across the rest with modulo 7. D, each to its own runner-up, spread across all 7 survivors.

[think]

The answer is D: each to its own runner-up, spread across all 7 survivors.

Every key has a full ranking of nodes by score. Removing the winner promotes the runner-up for that key, and runners-up are independent across keys, so the load spreads evenly across all 7 survivors without virtual nodes. Keys owned by the other nodes do not move at all.

## 5

A consistent-hash load balancer keeps sending one viral video's requests to a single, overloaded cache node. Which change actually helps?

A, add more virtual nodes per server to the ring. B, widen the hash output from 32 to 64 bits. C, switch from the ring to rendezvous hashing. D, replicate the hot key and spread its reads.

[think]

The answer is D: replicate the hot key and spread its reads.

Every consistent-hashing scheme maps one key to one owner by design, so no better hash, extra virtual nodes or different scheme splits a single hot key. Replicating it to several nodes and spreading its reads, splitting the key, coalescing requests, or a small cache in front address the skew. Bounded-load hashing can also overflow requests to the next node.

## 6

Consistent hashing with bounded loads, with a capacity factor of 1.25, caps every node at 1.25 times the average load, rounded up. What does it trade away to do that?

A, determinism, since requests are assigned at random. B, nothing, since it is strictly better than plain hashing. C, simplicity, as each request needs a central coordinator. D, some locality, since overflow goes to the next node.

[think]

The answer is D: some locality, since overflow goes to the next node.

The owner is still found on the ring, but a node at capacity is skipped, and the request walks clockwise to the next node with room; in the lesson's trace, two of eight requests moved from one cache to the next. Those overflow requests lose their cache affinity, and in exchange the maximum load is capped. Routing stays deterministic for a given load state, and needs no coordinator.
