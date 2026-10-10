---
lesson: distributed-cache
source: eae882a45b9cfdfc
fit: great
desk:
  - "The API, the in-node data model and the architecture diagram"
  - "The virtual-node simulation table and the ring code"
  - "The node-failure timeline and the warm-up curves by skew"
  - "The stale-set race as a timeline, with and without leases"
  - "The failure-mode, trade-off and scaling tables"
  - "Exercise: which keys move when the ring changes"
---
## Introduction

"It's only a cache" is the most expensive sentence in infrastructure. A cache that absorbs 99 percent of reads is not an optimisation; it is load-bearing. The database behind it has been sized for the 1 percent that misses. So the day a cache node dies, or a deploy flushes it, or a popular key expires under 50 thousand concurrent readers, the database receives a multiple of the load it was built for, and falls over. And a cache that returns wrong data is worse than a slow one, because nobody notices until a customer does.

So designing a distributed cache is about four things, and none of them is "put Redis in front of it". Partitioning keys across a hundred-plus nodes, so that membership changes move as few keys as possible. Surviving node loss without a miss storm. Handling hot keys and stampedes that concentrate load on one node. And keeping the cache consistent enough with the source of truth. This is the cache cluster itself, the thing a platform team runs for hundreds of services.

## Requirements and the numbers

The operations are small: get, get many, set with a TTL, add only if absent, set only if unchanged, delete, increment. Eviction when memory is full. Separate pools for workloads that must not evict each other. Membership changes without application restarts. And invalidation when the database changes.

The targets: 10 million operations a second at peak, about nine reads to every write. Under a millisecond at the 99th percentile from the same zone. 10 terabytes of hot data, at a 99 percent hit rate. And the one to press on: losing a node must keep the database under one and a half times its normal load, and losing a zone must not take it down. Ask what the database can take on its own. The answer turns "should the cache replicate?" from taste into arithmetic.

Now the numbers. 10 terabytes of roughly 1 kilobyte values is about 9 billion items. With overheads, one copy needs about 13 terabytes of RAM, so about 130 nodes, 260 with a replica of every shard. Each node handles about 77 thousand operations a second: memory-bound, not CPU-bound.

Here is the arithmetic that matters. Normally, 9 million reads a second at 1 percent misses is 90 thousand database reads a second. One node dies with no protection, and its share, about 69 thousand reads a second, all miss. That is 159 thousand: 1.77 times normal, over the 1.5 limit. Lose one zone of three, and a third of all reads miss: 3 million a second. Fatal.

Two more. A single hot key read a million times a second is a gigabyte a second on one node sized for 77 thousand operations. And if clients read across zones, two-thirds of the traffic crosses, about 12,700 dollars a day in cross-zone charges.

The consequences: node loss needs a strategy, and zone loss needs replicas in other zones, even though the cache holds nothing irreplaceable. Per-key load, not aggregate load, breaks a well-sized cluster. Zone-local reads pay for themselves. And with 2,000 app hosts running 20 processes each, every node would hold 40 thousand connections, which argues for a proxy per host.

## The architecture

The client library is part of the design. It hashes keys to nodes using a routing table it watches in a config service. It applies a tight timeout of a few milliseconds, because a cache that takes 50 milliseconds is worse than a miss, and treats timeouts as misses. It prefixes keys with a schema version, so a deploy that changes serialisation reads fresh keys instead of misparsing old ones. And "get many" groups keys by node and asks each node once, in parallel, so a page needing 200 keys costs one round, not 200.

Each shard has a primary and a replica in another zone. Clients read the copy in their own zone, and send writes and deletes to all copies. On a miss, the application reads the database and fills the cache. An invalidation service tails the database's change stream and deletes affected keys, so every write path invalidates, including batch jobs and manual fixes. And a small gutter pool absorbs a dead shard's keys while it is replaced.

The only shared cluster state is tiny: the membership list and the ring, with a version number, in a strongly consistent config service like etcd or ZooKeeper.

## Deep dive one: partitioning

Why not hash the key modulo the number of nodes? Because changing that number remaps almost every key. Going from 130 nodes to 131, a key stays put only if its hash modulo 130 equals its hash modulo 131. Over a million random hashes, 99.24 percent moved. The hit rate collapses, and the database receives all 9 million reads a second.

Consistent hashing places nodes and keys on one ring, and a key belongs to the first node clockwise. Adding a node takes over only the arc before it, ideally 1 in 131 keys, under 1 percent.

But one point per node balances badly. The lesson simulated 130 nodes. With one point each, the busiest node held 5.8 times the average. With 160 virtual points per node, 1.23 times. Before I tell you the more important column: when a node dies, where do its keys go?

[pause]

With one point per node, all of them go to one neighbour, which suddenly carries double its load at the worst moment, and can fail too. With 160 points, the dead node's keys spread over 92 nodes, each gaining under 5 percent. That is the failure argument for virtual nodes.

The alternatives. Redis Cluster hashes keys into 16,384 slots assigned to nodes explicitly, and a client that hits a moved slot gets a redirect and refreshes its map. Rendezvous hashing scores every node per key and picks the highest. And routing can live in the client, in a proxy per host, or in the server. At hundreds of services, a per-host proxy usually wins: one place to change config, and up to 20 times fewer connections per node.

## Deep dive two: a node failure, traced

Node 57 of 130, with no replica, loses power at 9 PM. Its keys draw 69 thousand reads a second. At zero, requests to it time out after 5 milliseconds and are treated as misses: database reads jump from 90 thousand to 159 thousand. At 0.3 seconds, the routing proxy on each app host has seen 10 straight timeouts, so its circuit breaker opens, and node 57's keys go to the empty gutter pool. No more 5 millisecond waits. By 1.3 seconds, the gutter is at about 50 percent hits. At 3 seconds, the health checker's third missed probe marks the node down. That hysteresis matters, so a garbage collection pause does not reshuffle the ring. At 4 seconds, a new ring version is published. And from 10 seconds on, the gutter settles at about 60 percent hits: database load holds at 1.31 times normal, under the limit.

Why per-host proxies? Spread over 40 thousand client processes, each one sees under two requests a second for node 57, so ten timeouts would take six seconds. And why a gutter pool, rather than rehashing node 57's keys onto its neighbours? Rehashing doubles their load and can cascade. The gutter is small, about 1 percent of a cluster in Facebook's memcache paper, here 2 nodes. It needs no invalidations, because its 10 second TTL bounds staleness. And it turns 1.77 times into 1.31.

Now, how fast does the replacement warm? The lesson modelled the dead node's 69 million keys with skewed popularity. With typical skew, a cold node is at about 50 percent hits after a second and 72 percent after a minute. But it takes about an hour to reach 93 percent, because the long tail of rarely requested keys arrives slowly. With flatter popularity it is far worse: 39 percent after a minute. Meanwhile the database carries thousands of extra reads a second. So measure your skew.

So the warm-up plan. With a replica, bulk copy: 69 million items is 76 gigabytes, about 2.5 minutes at 500 megabytes a second, and the replacement serves only after the copy. Without one, dual read: the new node takes writes at once, and a read that misses it falls back to a warm source before the database, then copies the value in. Scale out one or two nodes at a time; adding 20 at once moves 13 percent of keys, 1.2 million fresh misses a second at peak. And never flush a production cache at peak.

With a replica in another zone, the story changes: clients read the replica on the first timeout and the database never sees the spike. The price is doubling RAM. And the decision follows from the zone arithmetic, because no gutter pool can absorb 43 dead nodes.

## Deep dive three: hot keys, stampedes and stale sets

Hot keys are usually a surprise: a celebrity profile, or a feature-flag blob every request reads. Servers sample requests into approximate counts and export the top keys. Then two fixes. A near cache: clients keep keys marked hot in process for a second or two, so a million reads a second across 2,000 app servers becomes 2,000 reads a second at the node. The price is up to a second of staleness with no invalidation, so it is opt-in: fine for a profile, wrong for a balance. Or key replication: store eight copies under eight suffixes, read one at random, and delete all eight on write. Eight times less read load, eight times more write cost.

Stampedes. A key read 50 thousand times a second expires, and rebuilding it takes 20 milliseconds. So a thousand readers miss and query the database before the first one sets the value. The fix, from Facebook's memcache paper, is a lease. On a miss, the server hands the first client a lease token, and tells the others to wait and retry, or take a slightly stale value. One query instead of a thousand. Jittered TTLs and probabilistic early refresh stop most stampedes from starting.

And the same lease fixes the stale-set race. Picture a reader, a writer, and the cache. The reader misses, reads version 1 from the database, and pauses for 50 milliseconds. The writer commits version 2 and deletes the key. The reader wakes and sets version 1, which stays wrong until its TTL. With leases, the reader's miss returned a token, the writer's delete invalidated it, and the reader's late set carries a dead token and is rejected.

The defences, in layers. Delete on write, do not update, because two deletes cannot conflict. Guard the set with a lease or a version. Invalidate from the change stream, which catches the batch job and the manual fix that application code misses. And a TTL on every key as the backstop, so every inconsistency has a bound.

## Failure modes

Zone loss: a third of reads miss, so replicas in other zones and zone-aware routing. A cold start after a deploy: bulk copy or dual read, with a throttled rollout. Split routing, where clients on two ring versions disagree after a membership change: a versioned ring, fast convergence and short TTLs. Big values and slow commands, a 5 megabyte value turning a 1 millisecond 99th percentile into hundreds: cap value sizes and point to object storage instead. A noisy neighbour, where one team's launch evicts another's working set: separate pools with their own budgets. And a connection storm after a deploy: per-host proxies and jittered reconnects.

## In the interview

A follow-up the lesson expects. Should the cache replicate at all?

[pause]

Compute it. Here, one node lost is 1.77 times database load, and a zone lost is 3 million reads a second, so yes, across zones. In front of a database with ten times headroom, replication would be wasted RAM. The wrong answers are "no, it's only a cache", and "always".

And another: you need 20 more nodes during peak. Consistent hashing still moves 13 percent of keys, 1.2 million fresh misses a second. So add one or two at a time with dual reads, watching the hit rate between steps, or better, add capacity before the peak. The wrong answer: "consistent hashing means adding nodes is free".

## Recap

Four things. Treat the cache as load-bearing, and compute what a node and a zone failure do to the database before choosing a gutter pool or replicas: here 1.77 times for a node, 3 million reads a second for a zone. Use consistent hashing with virtual nodes, so a change moves about 1 in N keys and a dead node's load spreads instead of doubling one neighbour. Have a warm-up plan with a time on it: bulk copy in minutes, because organic warm-up takes an hour. And handle hot keys separately, use leases for stampedes and stale sets, and fix consistency with delete on write, change-stream invalidation and a TTL on everything.

At your desk: the API and diagrams, the virtual-node table and ring code, the failure timeline and warm-up curves, the stale-set race, the failure tables, and the ring exercise.
