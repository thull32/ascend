---
lesson: url-shortener
source: 52e151b751983435
---
## 1

You expect 30 billion links over five years. Why choose 7 base-62 characters for the short key, rather than 6?

A, 6 characters give only about 5.7 billion keys, fewer than the 30 billion needed. B, 6 characters would be over half full, so collisions and guesses get common. C, 7 characters leave headroom for custom aliases and the reserved-word blocklist. D, 7 characters make sequential counter keys impossible to enumerate.

[think]

The answer is B: 6 characters would be over half full, so collisions and guesses get common.

6 characters give about 57 billion keys, not 5.7 billion, so they can technically hold 30 billion links: capacity is the wrong reason. At 53 percent density, random generation becomes retry-heavy, and a guesser hits a real link about every other try. With 7 characters the space is under 1 percent full, so both problems vanish. Length does nothing to stop a sequential counter being walked.

## 2

One link takes 30,000 requests a second. Your Redis cluster has 8 primaries, each good for about 100,000 operations a second. What is the real risk, and what is the fix?

A, one primary takes all 30,000 operations a second, so cache the key in-process with coalescing. B, Redis evicts the hottest key under pressure, so raise the cluster's memory limit. C, none, since the 8 primaries share the load for 800,000 operations a second in total. D, the link store is overloaded by misses, so add more read replicas behind the cache.

[think]

The answer is A: one primary takes all 30,000 operations a second, so cache the key in-process with coalescing.

Cluster capacity is irrelevant for a single key, because one key maps to one slot on one node, so that primary gives up nearly a third of its capacity, and every other key on it queues. Caching the key in each of 50 redirect instances for 10 seconds turns 30,000 Redis reads a second into about 5. The key is hot, not missing, so the store is not the bottleneck.

## 3

Requirements say a disabled link must stop redirecting everywhere within one minute, and every click must be counted. Which redirect design fits?

A, a 301 with a max-age of one year, plus a CDN purge on disable. B, a 301 without cache headers, plus an invalidation broadcast on disable. C, a 302 with a public max-age of one day, plus an invalidation broadcast on disable. D, a 302 without freshness headers, a 12-second in-process TTL, and a disable broadcast.

[think]

The answer is D: a 302 without freshness headers, a 12-second in-process TTL, and a disable broadcast.

Browsers may cache a 301 heuristically even without cache headers, so repeat clicks are invisible, and neither a purge nor a broadcast reaches clients that cached it. A 302 without freshness information is not cached by browsers, and the short in-process TTL is the backstop if an invalidation message is lost. A day-long public max-age lets browsers and proxies keep serving the link, which breaks the one-minute requirement whatever the servers are told.

## 4

Link creation goes active-active across three regions, on a table that replicates with last-writer-wins, and keys are random. What can go wrong?

A, every insert now waits on a cross-region quorum, so creation latency triples. B, keys become guessable, because each region draws from a smaller range. C, two regions mint the same key, and replication overwrites one destination. D, nothing, since conditional puts guarantee uniqueness across all regions.

[think]

The answer is C: two regions mint the same key, and replication overwrites one destination.

Under last-writer-wins replication, conditional puts are only linearizable within a region. Two regions can generate the same key in the same second, both local puts succeed, and replication resolves the conflict by discarding one write, which re-points a link a user has already shared. Partitioning the key space by region makes the collision impossible, instead of merely unlikely.

## 5

Why does the design pre-aggregate clicks in each instance and partition the clicks topic by producer, instead of keying raw events by short link?

A, Kafka cannot use a string such as the short key as its partition key. B, pre-aggregating by producer makes the counts exact, which keyed events cannot. C, counting needs no ordering, and keying puts a viral link on one partition. D, keying by link drops events whenever a partition's leader fails over.

[think]

The answer is C: counting needs no ordering, and keying puts a viral link on one partition.

Counting is commutative, so keyed partitioning buys per-key ordering you do not need, and concentrates a viral link's entire load on one partition and one consumer. Pre-aggregation turns 30,000 events a second into one message per instance per second. It does not make counts exact: the design accepts losing up to one second of one instance's counts per crash.

## 6

Volume grows tenfold, so the 7-character key space will be 8.5 percent full by year five. What is the right response?

A, mint new keys with 8 characters, while old 7-character keys keep working. B, switch to a global counter, since random keys no longer scale at ten times the volume. C, nothing, since an 8.5 percent retry rate costs one extra put per twelve creates. D, rehash every existing link into an 8-character key during a migration.

[think]

The answer is A: mint new keys with 8 characters, while old 7-character keys keep working.

Lookups are by exact key, so lengths can coexist: new 8-character keys put the space at 0.14 percent used, while every printed 7-character link keeps resolving. Tolerating 8.5 percent density keeps creation cheap, but makes guessing easier: roughly one random guess in twelve hits a live link. Rewriting existing keys breaks every link already shared, and a global counter reintroduces enumeration.
