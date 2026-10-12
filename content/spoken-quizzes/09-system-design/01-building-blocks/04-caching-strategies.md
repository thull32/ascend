---
lesson: caching-strategies
source: fa6701b5faa0bc5c
---
## 1

A cache-fronted read path has 1 millisecond hits and 25 millisecond database reads. Raising the hit ratio from 96 percent to 99 percent mostly changes which of these?

A, the median latency, which falls by about 20 milliseconds. B, the 99th percentile, which falls from 25 milliseconds to 1. C, neither load nor latency, since both rates are high. D, the database load, which falls by about 4 times.

[think]

The answer is D: the database load, which falls by about 4 times.

Database load is proportional to the miss rate, and going from 4 percent misses to 1 percent is a fourfold reduction. The mean drops only from about 1.96 milliseconds to 1.24. The 99th percentile is still a miss at 96 percent, and sits right at the boundary at 99, and the median was already a hit.

## 2

In cache-aside, a writer updates the database and then deletes the key. Which interleaving leaves the cache serving stale data until the TTL?

A, two readers miss together, and both set the freshly written row. B, a reader hits the cache while the writer is updating the database. C, two writers update the row, and both delete the key at once. D, a slow reader fetches the old row, and sets it after the delete.

[think]

The answer is D: a slow reader fetches the old row, and sets it after the delete.

The reader misses and reads the old row before the update. Its delayed set lands after the delete, and installs the pre-write value, which nothing removes until the TTL or the next write. Concurrent deletes are harmless, and a hit during the update returns the old value once, which is expected.

## 3

Two writers use write-through without per-key locking. Writer A caches 11, then writes the database. Writer B caches 12 and writes the database in between. What is the end state?

A, cache 11 and database 11, since A finished last. B, an error, since write-through detects the conflict. C, cache 12 and database 12, since the last cache write wins. D, cache 12 and database 11, which now disagree.

[think]

The answer is D: cache 12 and database 11, which now disagree.

The cache saw A then B, so it holds 12. The database saw B then A, so it holds 11. Nothing detects the disagreement, which lasts until the TTL. Write-through needs one writer per key, or per-key ordering, to stay consistent.

## 4

A key read 10,000 times a second across 50 replicas expires, and the recompute takes 50 milliseconds. With single-flight in each replica, roughly how many identical database queries does the expiry cause?

A, about 50, one per replica. B, about 10, one per database worker. C, about 500, one per request in the window. D, exactly one for the whole fleet.

[think]

The answer is A: about 50, one per replica.

Single-flight coalesces within a process, so each replica that sees a miss during the window starts one load: about 50, matching the simulation. A fleet-wide lock, or leases, reduce it to one. With no defence, it is about 10,000 a second times 50 milliseconds, which is 500.

## 5

A nightly batch job reads a million rarely used keys through an LRU cache, and the daytime hit ratio takes an hour to recover. What fixes it most directly?

A, admit new keys only if they have been seen more often than the victim. B, double the cache size, so the scan fits beside the hot set. C, switch the eviction policy to random replacement. D, lower every TTL, so scanned keys expire more quickly.

[think]

The answer is A: admit new keys only if they have been seen more often than the victim.

A scan evicts the hot set because LRU admits every miss. Frequency-based admission, in the style of TinyLFU, refuses keys seen once, so the hot set survives; in the simulation, it kept a 71 percent hit ratio through scans, while LRU fell to 38. Doubling the cache still would not hold a million-key scan, and TTLs do not stop admission.

## 6

You cache "not found" results, to stop repeated lookups of missing IDs. Which TTL choice is safest?

A, no TTL, since an ID that is missing now will stay missing. B, a few seconds, and delete the entry when the item is created. C, the same TTL as positive entries, so both expire consistently. D, a one-day TTL, since lookups of missing IDs are rare anyway.

[think]

The answer is B: a few seconds, and delete the entry when the item is created.

Negative caching protects the database from lookups of keys that do not exist, but a long TTL makes newly created items invisible. A short TTL bounds the damage, and deleting on create removes it. Reusing the positive TTL applies a freshness budget meant for existing data to data that is about to exist.
