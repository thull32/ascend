---
lesson: distributed-cache
source: e21b0a2ddaa75e77
---
## 1

A cluster of 130 cache nodes places keys by their hash modulo N. One node is added. Roughly what fraction of keys now maps to a different node?

A, about 99 percent. B, about 1 percent. C, about 50 percent. D, about 0 percent.

[think]

The answer is A: about 99 percent.

A key stays put only if its hash modulo 130 equals its hash modulo 131; over a million random hashes, 99.24 percent moved, so the hit rate collapses. Moving about 1 key in 131 is what consistent hashing gives you, not modulo hashing.

## 2

9 million reads a second hit a 130-node cache at a 99 percent hit rate. One node dies, and its keys all miss. What happens to the database's read load?

A, it stays at about 90,000 a second. B, it rises by about 1 percent, to 91,000 a second. C, it rises to about 159,000 a second. D, it drops, because fewer nodes are answering.

[think]

The answer is C: it rises to about 159,000 a second.

Normal misses are 90,000 a second. The dead node's share of reads, about 69,000 a second, now all misses, giving about 159,000: roughly 1.77 times normal. That is why the cache needs replicas or a gutter pool, even though it stores nothing irreplaceable.

## 3

In the simulation, a dead node's keys went to one neighbour with one ring point per node, but spread over 92 nodes with 160 points. Why does that matter?

A, one point per node lets keys be stored on two nodes at once. B, more points make the ring lookup faster for every key. C, spreading the load stops one neighbour doubling and cascading. D, more points reduce the fraction of keys that move on a change.

[think]

The answer is C: spreading the load stops one neighbour doubling and cascading.

With one point, the dead node's whole arc falls to its successor, which suddenly carries twice its load, and may fail too. With 160 points, the arc is 160 small pieces spread over many nodes, each gaining under 5 percent. The fraction of keys moved on a change is about 1 over N either way.

## 4

A replacement cache node starts empty. Under a Zipf popularity model with exponent 1, its hit rate reaches about 72 percent after a minute. Roughly how long until it reaches 93 percent?

A, about 5 seconds, once the hottest keys return. B, never, because a cold node cannot reach steady state. C, about 5 minutes, one refill of the arc. D, about 1 hour, because the long tail arrives slowly.

[think]

The answer is D: about 1 hour, because the long tail arrives slowly.

The head of the distribution returns in seconds, but the tail, many keys each requested rarely, takes time to be requested even once: the model gives 90 percent at 30 minutes, and 93 percent at an hour. That is why a warm-up plan copies from a replica, or dual-reads from a warm source, instead of waiting.

## 5

A reader misses, reads v1 from the database, and pauses. A writer commits v2 and deletes the key. The reader then sets v1 in the cache. What prevents the stale value from living until its TTL?

A, having the reader fetch from a database replica. B, a shorter TTL, so the stale value expires sooner. C, a lease, where the delete voids the reader's token. D, having the writer update the cache, rather than delete.

[think]

The answer is C: a lease, where the delete voids the reader's token.

The race is between a slow set and a delete. A lease, or a set guarded by a version, makes the slow set fail. Updating instead of deleting creates an ordering race between writers, a shorter TTL only shortens the window, and a replica adds lag and makes it worse.

## 6

One key receives a million reads a second from 2,000 app servers. Which mitigation reduces the load on its cache node the most, and what does it cost?

A, add more cache nodes, at the cost of the extra hardware. B, raise the key's TTL, at the cost of holding it in memory longer. C, an in-process near cache, at the cost of up to 1 second of staleness. D, use consistent hashing, at the cost of a ring lookup per read.

[think]

The answer is C: an in-process near cache, at the cost of up to 1 second of staleness.

More nodes and ring changes do not help: one key lives on one node. A near cache with a one-second TTL means each app server fetches once a second, so about 2,000 reads a second reach the node. The trade is bounded staleness without invalidation, which is why it is opt-in per key type.
