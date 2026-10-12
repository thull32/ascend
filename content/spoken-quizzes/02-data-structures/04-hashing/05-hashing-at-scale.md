---
lesson: hashing-at-scale
source: 8e3f8c5ed110c5c3
---
## 1

A cache cluster places keys by hash modulo n. Growing from 9 to 10 servers moves approximately what fraction of keys?

A, none, since each key's hash value is unchanged. B, about 90 percent, since few hashes agree modulo 9 and modulo 10. C, about 10 percent, one server's fair share of the keys. D, about 50 percent, as keys shift toward the new server.

[think]

The answer is B: about 90 percent, since few hashes agree modulo 9 and modulo 10.

A key stays only if its hash modulo 9 equals its hash modulo 10, which happens for about one key in ten, so roughly n out of n plus 1, 90 percent, move; the lesson measured 90.0 percent over 100 thousand keys. The hash is unchanged, but the modulus is not. Consistent hashing cuts the movement to about 10 percent, the new server's fair share.

## 2

Why do consistent-hashing rings use many virtual nodes per server?

A, to save memory, since each point then stores fewer keys. B, to support deleting keys, which one point per server cannot. C, to even out the arcs, allow weighting, and spread failover load. D, to make lookups constant time, by indexing the ring with an array.

[think]

The answer is C: to even out the arcs, allow weighting, and spread failover load.

With one point per server, the arcs are very uneven, and a failure dumps a whole arc on one neighbour. Many points per server average out the arcs, let bigger servers take more points, and scatter each server's responsibility around the ring. Lookups are still logarithmic binary searches, and the ring grows to n times v points.

## 3

Rendezvous hashing picks the server with the highest hash of the key and the server together. What is its main limitation compared with a ring?

A, balance is poor unless each server has virtual nodes. B, it cannot replicate, since one server scores highest. C, the lookup cost is linear in the number of servers. D, many keys move when a server leaves the cluster.

[think]

The answer is C: the lookup cost is linear in the number of servers.

Every lookup scores every server. That is fine for tens of servers, and excellent for balance and minimal disruption: only the leaving server's keys move, each to its runner-up. But a ring's logarithmic binary search wins at thousands of nodes. The runner-up scores give replication for free.

## 4

A Bloom filter reports that a key is present. What do you know?

A, it was added and not deleted, since deletes clear its bits. B, it was definitely added, since there are no false positives. C, nothing, since Bloom filters err in both directions. D, it was probably added; other keys may have set its bits.

[think]

The answer is D: it was probably added; other keys may have set its bits.

Bloom filters have no false negatives, so a "no" is certain, but bits are shared, so a "yes" is only probable. At 10 bits per key with 7 hashes, it is wrong about 0.8 percent of the time, rising as the filter fills past its design size. And a plain Bloom filter does not support deletion; that needs the counting variant.

## 5

A team increases a Kafka topic from 8 to 12 partitions. What happens to per-key ordering?

A, old messages move to the new partitions, keeping their order. B, nothing, since Kafka rebalances existing keys automatically. C, most keys map to a new partition, splitting each key's order. D, ordering improves, since each partition holds fewer keys.

[think]

The answer is C: most keys map to a new partition, splitting each key's order.

Kafka places a key by its murmur2 hash, modulo the partition count, and never moves existing messages. Changing the count changes the mapping for most keys, so a key's new messages are ordered separately from its old ones, in a different partition. This is why partition counts are over-provisioned up front.

## 6

Jump consistent hash moves exactly one in n plus 1 of the keys when a bucket is added, yet clusters that lose arbitrary machines do not use it. Why?

A, it needs a large lookup table, rebuilt on every change. B, buckets are numbered, and can only be removed from the end. C, it cannot be seeded, so all clients compute different buckets. D, its lookup is linear, which is too slow for large clusters.

[think]

The answer is B: buckets are numbered, and can only be removed from the end.

Jump hash maps a key to a bucket number from 0 to n minus 1, with no memory and logarithmic time, and a key only ever moves to the newest bucket. That makes removing bucket 3 of 8 impossible without renumbering, so it suits sharding by number, not membership that changes arbitrarily. The table rebuild describes Maglev, and the linear lookup describes rendezvous hashing.
