---
lesson: partitioning-and-rebalancing
source: 770128a4a6fd82f9
---
## 1

A cluster places keys by their hash modulo N. Growing N from 20 to 21 moves approximately what fraction of keys?

A, about 5 percent, the new node's fair share of keys. B, about 0 percent, since existing keys keep their nodes. C, about 50 percent, half the keys on average per node. D, about 95 percent, since both remainders rarely agree.

[think]

The answer is D: about 95 percent, since both remainders rarely agree.

A key stays only if its hash modulo 20 equals its hash modulo 21, which happens for about 1 key in 21, so about 95 percent move, and every node both sends and receives. Consistent hashing or fixed partitions bring movement down to about 1 in 21.

## 2

Why do consistent-hashing systems give each node many tokens on the ring?

A, to shrink the routing table each client holds. B, to keep adjacent keys together for range scans. C, to enlarge the hash space, so collisions are rarer. D, to even out the arcs, and spread a failed node's load.

[think]

The answer is D: to even out the arcs, and spread a failed node's load.

In the simulation, one token per node left the largest node with 3.6 times the mean share, and a failure increased one survivor's load by over 600 percent. 256 tokens brought that to 1.12 times, and 10 percent. The routing table grows rather than shrinks, and range scans are unaffected.

## 3

Four nodes grow to five on a consistent-hash ring. With one token per node, where does the moved data come from?

A, from no node, since new keys go to the new node. B, from every node, which also receive data back. C, from one existing node, a random-sized arc. D, evenly from all four existing nodes.

[think]

The answer is C: from one existing node, a random-sized arc.

The new token splits one existing arc, so everything moves from the node that owned it, and the amount is the random size of the arc: 58 percent and 40 percent in two simulated runs. Many tokens, or fixed partitions, draw roughly equal amounts from every node. Sending and receiving everywhere is the modulo N pattern.

## 4

Sensor readings keyed by timestamp, in a range-partitioned store, overload one node. Which fix works?

A, add more nodes, so the ranges spread more thinly. B, lead the key with a hash bucket or the sensor ID. C, split the hot range in half, and move one half away. D, switch to synchronous replication to share the writes.

[think]

The answer is B: lead the key with a hash bucket or the sensor ID.

New timestamps are always larger than existing keys, so they go to the last range, whatever the node count or the splits. Breaking the sort order with a salt, or a natural leading dimension, spreads new writes across ranges.

## 5

During a Redis Cluster slot migration, a client asks the source node for a key that has already moved. What does the source reply, and what does the client do?

A, ASK, and the client retries once at the target, preceded by ASKING. B, MOVED, and the client rewrites its slot map, then retries there. C, the stale value, which the target will later overwrite. D, an error, and the client waits for the migration to finish.

[think]

The answer is A: ASK, and the client retries once at the target, preceded by ASKING.

While a slot is split between two nodes, the source answers ASK for keys it no longer holds, and the client makes a one-off request to the target, preceded by ASKING, without changing its map. Only after the slot's ownership is reassigned does the source answer MOVED, and the client updates its map.

## 6

Keys follow a Zipf distribution with exponent 1.2, and one key carries 19 percent of traffic on a 32-node cluster. What helps most?

A, adding more nodes, so that each one owns fewer keys. B, caching that key near the callers with a short TTL. C, raising the partition count from 1,024 to 8,192. D, switching the hash function to spread keys better.

[think]

The answer is B: caching that key near the callers with a short TTL.

One key lives in one partition, whatever the hash or the partition count, so its node carries at least 19 percent of traffic, against a fair share of about 3 percent. Absorbing its reads in a nearby cache, or splitting it, for writes, is the fix. More nodes or partitions only lower the load on the nodes that were not the problem.
