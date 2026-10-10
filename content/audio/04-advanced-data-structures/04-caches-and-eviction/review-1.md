---
review: caches-and-eviction
source: baac8286a8041ee6
---
## Introduction

Twelve questions from the caches-and-eviction module. Answer out loud before the answer comes.

They run through the module in order: the LRU cache, then LFU and the modern policies, then cache design. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

Why does an LRU cache need a doubly linked list rather than a singly linked one?

A, eviction must delete the key from the map, and only a doubly linked node can store it. B, doubly linked nodes use less memory, because sentinels remove the need for null checks. C, pushing to the front needs the old head's address, which a singly linked list does not keep. D, unlinking a node needs its predecessor, which a singly linked node cannot reach in constant time.

[think]

The answer is D: unlinking a node needs its predecessor, which a singly linked node cannot reach in constant time.

The hash map hands you a pointer to the node, not to its predecessor. Unlinking means pointing the predecessor's next at the node's next, and only a previous pointer gets you there without a linear walk. The head is always known, any node can store its key, and a previous pointer costs memory rather than saving it.

## Question 2

A put on a key that is already cached creates a fresh node and pushes it to the front, leaving the old node in the list. What is the first visible consequence?

A, the map and the list disagree, and a later eviction deletes a live key from the map. B, the old node is evicted first, so the cache acts as if the key were refreshed. C, nothing: the map points at the new node, so the old one is unreachable. D, memory use doubles at once, because the value is now stored twice.

[think]

The answer is A: the map and the list disagree, and a later eviction deletes a live key from the map.

The map has one entry for the key, but the list has two nodes. When the stale node reaches the tail, eviction deletes the key from the map while the fresh node is still near the front, so a live entry disappears. Memory grows by one node, not double, and the old node is still reachable through the list.

## Question 3

A nightly job scans every row of a large table through a pure LRU cache in front of the database. What happens to the daytime working set?

A, it survives, because its keys have far higher access counts. B, it survives, because read-only access does not change LRU order. C, it is evicted, because every scanned row becomes the most recent entry. D, part of it survives, because scanned rows enter at the list midpoint.

[think]

The answer is C: it is evicted, because every scanned row becomes the most recent entry.

LRU has no notion of frequency; a single touch makes a scanned row the newest entry, and a scan larger than the cache flushes everything. Midpoint insertion is InnoDB's defence against exactly this, not something pure LRU does. This scan pollution is why Linux, InnoDB and Postgres all deviate from pure LRU.

## Question 4

Why does Redis approximate LRU by sampling a few keys, instead of keeping a linked list?

A, a list needs a lock around every access, and Redis must avoid locks. B, expired keys would clog a list, and sampling purges them for free. C, sampling gives a higher hit ratio than exact LRU for the same memory. D, a list costs 16 bytes per key, and sampling comes close to exact LRU.

[think]

The answer is D: a list costs 16 bytes per key, and sampling comes close to exact LRU.

Sixteen bytes of pointers per key matters when keys are small and numerous. A 24-bit clock, plus sampling 5 to 10 keys with a pool of the 16 best candidates, gets close to exact LRU's hit ratio at a fraction of the memory. It is not more accurate than exact LRU, only nearly as accurate and much cheaper.

## Question 5

In a constant-time LFU cache, why can the minimum-frequency pointer be set to 1 after every insert of a new key, without checking anything?

A, a new key has count 1, so bucket 1 is now the lowest non-empty bucket. B, each insert resets every existing count to 1, so every key sits at the minimum. C, eviction always empties the minimum bucket, so the old minimum is gone. D, it cannot; the minimum must be found by scanning the buckets after an insert.

[think]

The answer is A: a new key has count 1, so bucket 1 is now the lowest non-empty bucket.

The new key lands in bucket 1, which is therefore non-empty and is the smallest possible count. The pointer only has to move up when a promotion empties the bucket it points at. Eviction removes one key from the lowest bucket and need not empty it; the reset is safe because of the new key, not because of the eviction.

## Question 6

Why is pure LFU, with no aging, unusable for a cache in front of a news site?

A, a per-key count costs more memory than caching the stories saves. B, each access costs logarithmic time, too slow for a busy site. C, one-hit wonders flush popular stories, the way a scan does under pure LRU. D, old stories keep huge counts forever, so new stories are evicted first.

[think]

The answer is D: old stories keep huge counts forever, so new stories are evicted first.

Without decay, a count reflects all of history, and old hits crowd out everything new. Periodic halving, as in TinyLFU, or time-based decrements, as in Redis, make counts reflect recent frequency. One-hit wonders are what LFU evicts most readily; its failure is the opposite, counts that never fade.

## Question 7

In ARC, a key that was evicted from the seen-once list is requested again while its ghost is still in the seen-once ghost list. What happens?

A, the key re-enters the seen-once list at the front, and the target is unchanged, since it was a miss. B, the target shrinks, because a recency-side eviction proved correct. C, the key is served from the ghost list without any change. D, the target for the seen-once list grows, and the key enters the seen-twice list, since it has now been seen twice.

[think]

The answer is D: the target grows, and the key enters the seen-twice list.

A ghost hit on the recency side means that side was too small, so the target increases, one entry is evicted to make room, and the returning key goes straight into the seen-twice list because this is its second sighting. Ghost lists hold only keys, not values, so nothing can be served from one. A hit in the other ghost list is what shrinks the target.

## Question 8

What does the count-min sketch in W-TinyLFU decide?

A, how long each entry lives, by turning estimated frequency into a TTL. B, how large the window LRU is, by tracking the hit ratio over time. C, whether a newcomer is admitted, by comparing it with the eviction victim. D, which entry inside the main cache is evicted, by its lowest estimated count.

[think]

The answer is C: whether a newcomer is admitted, by comparing it with the eviction victim.

TinyLFU separates admission from eviction. The main cache evicts by segmented LRU; the sketch is consulted only to decide whether the newcomer deserves the victim's slot, so one-hit wonders lose the comparison and never enter. The window size is tuned by hill-climbing on the hit ratio, not by the sketch.

## Question 9

A cache in front of a 50 millisecond backend has a 90 percent hit ratio, with 1 millisecond hits. What happens to the 99th percentile latency compared with no cache?

A, it drops to about 1 millisecond, because 90 percent of requests are now hits. B, it stays near 50 milliseconds, since one request in ten is still a miss. C, it drops to about 5.9 milliseconds, the weighted mix of hits and misses. D, it drops to about 45 milliseconds, since hits pull the tail down by 10 percent.

[think]

The answer is B: it stays near 50 milliseconds, since one request in ten is still a miss.

The 99th percentile is the slowest request in a hundred, and with ten misses per hundred, it is a miss and costs the backend's latency. 5.9 milliseconds is the average, not a tail percentile. The tail only improves once the miss ratio is below 1 percent.

## Question 10

Improving the hit ratio from 99 percent to 99.9 percent sounds like a 0.9 percent change. What does it do to backend load?

A, reduces it by about 90 percent. B, reduces it by about 1 percent. C, no measurable change. D, reduces it by about 10 percent.

[think]

The answer is A: it reduces backend load by about 90 percent.

Backend load is the miss ratio times traffic. Misses go from 1 percent to a tenth of a percent, a tenfold reduction, so 90 percent of the backend's remaining load disappears.

## Question 11

All entries were written during a deploy, with a uniform 10-minute TTL. What do you expect, and what is the fix?

A, a miss storm every 10 minutes; add random jitter to each TTL. B, a stampede on a single hot key; lock around its refill. C, memory grows without bound; add an LRU eviction policy on top. D, nothing unusual, since each key's TTL is tracked independently.

[think]

The answer is A: a miss storm every 10 minutes; add random jitter to each TTL.

Entries written together expire together, and the backend sees the full load for a moment every period. Spreading TTLs by about 10 percent either way flattens the expiries into a steady trickle. It is every key expiring at once, not one hot key, so a per-key refill lock does not spread the load.

## Question 12

In cache-aside, a reader misses and fetches the old value. A writer then updates the database and deletes the cache key. Finally the reader writes its value into the cache. What is the result, and a real fix?

A, the delete is lost; update the cache on writes instead of deleting. B, a lost database write; wrap the read and the write in a transaction. C, a stale value cached until the next write; use leases or a short TTL. D, correct behaviour, because the writer's delete ran after the read.

[think]

The answer is C: a stale value cached until the next write; use leases or a short TTL.

The slow reader's refill lands after the delete and revives the old value. Facebook's memcache leases reject a set whose token was invalidated by an intervening delete, and a short TTL bounds how long the stale value survives. Updating the cache on writes has its own race, since concurrent writes can reach the cache in the opposite order from the database.

## Recap

Three ideas kept coming back. Composition and its invariants: a map plus an ordered structure gives constant time, but only if the two always agree, on recency for LRU and on a minimum count for LFU. Recency alone is fooled by scans and frequency alone never forgets, so real caches add a probation area, ghosts, aging, or an admission test. And the arithmetic belongs to the miss ratio: it sets backend load and the tail, and expiry, whether synchronised or racing a delete, is where caches fail.
