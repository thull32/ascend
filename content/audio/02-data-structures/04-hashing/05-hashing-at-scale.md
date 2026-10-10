---
lesson: hashing-at-scale
source: 76e50d7ee0c5decd
fit: partial
desk:
  - "The ring trace: nine virtual-node positions, eight keys, then removing B and adding D"
  - "The rendezvous score table, the jump hash bucket sequences, and the Maglev table-building trace"
  - "The comparison table of ring, rendezvous, jump and Maglev"
  - "The Bloom filter trace and the false-positive formula worked for 10 bits per key"
  - "The hash against range sharding table, and the production failure table"
  - "Exercises: a consistent hash ring with virtual nodes, and a 64-bit Bloom filter"
---
## Introduction

Your cache is spread over four servers, and a key goes to server "hash of key, modulo 4." You add a fifth server to handle growth. Now a key goes to "hash modulo 5," and for 80 percent of keys that is a different server than before. The cache is effectively empty. Every request misses and hits the database, and the database, which was fine at a 95 percent hit rate, falls over. Adding capacity caused an outage.

Hashing is how systems decide where data lives once it no longer fits on one machine. At that scale, the question is not only "does the function spread keys evenly?" but "what happens to the mapping when the set of servers changes?"

Three ideas: consistent hashing and its virtual nodes, the three alternatives and when each is ruled out, and Bloom filters. Then how to choose the key you shard by, which is the decision that is hardest to undo.

## The problem with modulo n

A key stays put across a change from n to n plus 1 servers only if its hash gives the same remainder for both. That is rare. Growing from 4 to 5 servers moves 80 percent of keys. From 9 to 10, 90 percent. From 99 to 100, 98.9 percent. In general, about n out of n plus 1 keys move, and they move to servers that must fetch them from scratch.

The ideal is that only one in n plus 1 keys move: exactly the share the new server should take, and nothing else. Inside one process, a rehash is a few milliseconds of CPU. Across a cluster, it is a thundering herd of cache misses and possibly a cascading failure. That is why consistent hashing was invented, in 1997, for web caches, and why it underlies Dynamo, Cassandra and memcached client libraries.

## Consistent hashing on a ring

Picture the space of 32-bit hash values bent into a circle. Hash every server onto it, and hash every key onto it. A key belongs to the first server point you meet walking clockwise from the key, wrapping around past the top.

The lesson traces it with three servers, A, B and C, each at three points, and eight keys. Remove server B. Its points vanish, and only the keys that were walking to B's points move on to the next point clockwise. Two of the eight keys move. The other six do not change owner at all. Only the departed server's keys move, and nothing else is disturbed.

Now add a server D with three new points. Each new point claims only the arc just before it. Three of the eight keys move, and every one of them moves to D. Nothing shuffles between the old servers. That is the one-in-n ideal, within rounding.

The implementation is small: a sorted array of points and a binary search for the first point at or after the key's hash, wrapping to the start if you run off the end. That is the ceiling operation from ordered maps. For a thousand servers with 256 points each, a lookup is about 12 comparisons.

## Virtual nodes, and a hash that can do it

With one point per server, the arcs are wildly uneven; three random points routinely give one server half the keys. So each server gets many points, called virtual nodes. The spread of a server's share falls roughly as one over the square root of the number of points: 100 points puts a typical server within about 10 percent of its fair share, and a thousand within about 3.

Virtual nodes buy two more things. Weighting: a server with twice the capacity gets twice the points. And spread on failure: when a server dies, its arcs were scattered, so its load goes to all the remaining servers rather than to one neighbour, which might then fail in turn. Cassandra used 256 tokens per node by default until version 4, which lowered it to 16 with a smarter allocator. The memcached ring known as ketama uses 160 points per server.

There is a hash-function trap here. The point names are short, similar strings, like "node 1, number 0" and "node 1, number 1". FNV-1a alone has weak avalanche on those, so a server's points cluster together, and it ends up owning one big arc instead of many small ones. Production rings use MurmurHash3, xxHash or MD5, or run FNV's output through a finaliser. And for replication, walk clockwise to the next distinct physical servers, or a key's replicas can land on two virtual nodes of the same machine.

## Three alternatives to the ring

Rendezvous hashing, also called highest random weight. For a key, score every server by hashing the key and the server name together, and pick the highest score. No ring, no sorted array, no virtual nodes. Balance is excellent, and when a server leaves, only its keys move, each to its runner-up. The runner-up list is a replica list for free. The catch: every lookup scores every server, so it is linear in servers. Fine for tens, wrong for thousands.

Jump consistent hash, from Google in 2014, is a short loop with no memory at all. It moves exactly one in n plus 1 keys when a bucket is added, because a key only ever moves to the newest bucket. The restriction is that buckets are numbered and can only be added or removed at the end. You cannot remove bucket 3 of 8. So it suits sharding by number, not clusters where arbitrary machines fail.

Maglev hashing, from Google's load balancer in 2016, builds a lookup table of prime size, 65,537 slots in their deployment. Each backend gets its own permutation of the slots, and backends take turns claiming the next free slot in their permutation until the table is full. A lookup is one array index: constant time. Remove a backend and rebuild, and the only slots that change are the ones it owned. The cost is the rebuild on every change, and a table of tens of thousands of entries.

## Bloom filters

Once data is spread over many servers or files, the question "does this key exist here?" can cost a disk read or a network round trip. A Bloom filter answers "definitely not here" or "possibly here" from a small bit array.

Take an array of m bits, all zero, and k hash functions. To add an item, set the k bits its hashes point at. To query, check those k bits. If any is zero, the item was never added: certain. If all are one, it probably was, but other items may have set those bits. In the lesson's tiny filter, 64 bits and 3 hashes, "apple" and "banana" are added, and a query for "cherry" lands on a bit that is still zero: definitely absent.

So: no false negatives, a tunable false-positive rate, and no deletion, because clearing a bit might clear someone else's. The number to remember: at 10 bits per key, with about 7 hash functions, the false-positive rate is about 0.8 percent. Roughly one byte per key to skip 99 percent of pointless disk reads. RocksDB recommends about 9.9 bits per key for a 1 percent rate, and LSM engines keep one filter per file, so a read for a missing key opens no file at all.

But a filter is sized for a number of items. Load it far past that, and its bits saturate, and it says "maybe" to almost everything, until disk reads for absent keys approach 100 percent.

## What real systems do, and choosing the shard key

Redis Cluster does not use a ring at all. It has 16,384 fixed hash slots, a table from slot to node, and explicit migration of whole slots. A fixed slot table is the simplest consistent scheme when you can choose the number of buckets once. Kafka assigns a record to its partition by hash modulo the partition count, and never moves existing records. So raising the partition count re-maps most keys, and each key's ordering splits across two partitions from that moment. That is why teams over-provision partitions up front. And memcached clients and Envoy run the ring in the client, so every client of one cluster must use the same hash and the same virtual-node count, or they disagree about who owns each key.

Consistent hashing decides which server owns a key. Something must first decide what the key is, and that choice is the hard one to change. You want high cardinality and even spread: user id is good; country, with one value carrying 40 percent of traffic, is not; creation time sends every new write to one shard. You want query locality: if you always read a user's orders together, shard orders by user, not by order id, even though order id spreads more evenly. And watch hot keys. A key carrying 5 percent of all traffic gives its shard five times the average load across 100 shards, whatever the hash does.

## In the interview

The lesson's follow-up. One key gets 20 percent of all traffic. What does consistent hashing do about it?

[pause]

Nothing. Hashing places keys; it does not split them. Split the key into sub-keys and fan out on read, put a local cache in front of the shard, or route that key specially, and detect it with a heavy-hitter sketch. The wrong answer is "add virtual nodes", which balances keys, not traffic per key.

And: consistent hashing moves one in n keys; can you do better? No. One in n is the minimum for any scheme that keeps balance, because the new server must take its fair share from somewhere. What you can improve is where the moved keys come from, evenly from all servers, which virtual nodes and rendezvous give you, and the lookup cost, which Maglev makes constant. More virtual nodes changes the spread of the moved keys, not their number.

## Recap

Four things to remember. Modulo n moves about n out of n plus 1 keys when n changes; consistent hashing moves the minimum, one in n plus 1, all of them to the new server. Virtual nodes, a hundred or more per server with a well-mixed hash, fix both imbalance and the failure that dumps a whole arc on one neighbour. Rendezvous is linear in servers, jump can only change at the end, and Maglev is constant-time lookup with a rebuild per change. And a Bloom filter's "no" is certain and its "yes" is probable, about 0.8 percent wrong at 10 bits per key, until you overfill it.

At your desk: the ring trace before and after a change, the rendezvous, jump and Maglev traces, the comparison and sharding tables, the Bloom filter trace with its formula, and the two exercises.
