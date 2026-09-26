---
slug: cache-design-considerations
title: "Cache design: hit ratios, TTLs, stampedes and when a cache makes things worse"
description: The arithmetic that turns a hit ratio into backend load and tail latency, how to size a cache and choose TTLs with jitter, how to stop a thundering herd with coalescing and probabilistic early expiry, negative caching, hot keys, invalidation races, and the cases where a cache hurts.
minutes: 40
difficulty: medium
tags: [cache, ttl, stampede, hit-ratio, thundering-herd, negative-caching, design]
---
You put a cache in front of the database. Average latency dropped from 40 ms to 6 ms and everyone was pleased. Then two things happened. The p99 did not move, because one request in ten still went to the database and a p99 is the slowest one in a hundred. And at 09:00 on Monday, when a popular key's TTL expired under peak traffic, four thousand requests missed at the same moment, all four thousand queried the database for the same row, and the database, which had been sized for one tenth of the traffic because "the cache handles the rest", fell over. The cache had not failed. It had done exactly what it was configured to do.

The data structure inside a cache is the easy part. This lesson is about the numbers and the failure modes around it: what a hit ratio actually buys you, how to size and expire entries, how to survive the moment a hot entry expires, and how to tell when a cache is making your system worse.

## Hit ratio arithmetic

Let `h` be the hit ratio, `t_hit` the latency of a hit and `t_miss` the latency of a miss (the cache lookup plus the backend call). The average latency is

$$\bar t = h \cdot t_{\text{hit}} + (1 - h) \cdot t_{\text{miss}},$$

and the backend load is `(1 − h) × QPS`. Both are linear in `h`, which hides how the interesting quantity behaves. Work it through with `t_hit = 1 ms`, `t_miss = 50 ms`, 10,000 requests per second:

| `h` | Average latency | Backend QPS | p99 |
|---|---|---|---|
| 0% | 50 ms | 10,000 | 50 ms |
| 90% | 5.9 ms | 1,000 | ~50 ms |
| 99% | 1.5 ms | 100 | ~50 ms |
| 99.5% | 1.25 ms | 50 | ~1 ms |

Two things to take from the table. First, **backend load depends on the miss ratio**, not the hit ratio: going from 90% to 99% hits does not improve things by 10%, it cuts backend traffic by 10×. Every additional nine removes 90% of the remaining load. Second, **the tail does not move until the miss ratio drops below the tail percentile**. At a 90% hit ratio, one request in ten is a miss, so the p99 is a miss and equals the backend's latency. A cache improves the p99 only once misses are rarer than 1%; it improves the p999 only below 0.1%. If your SLO is on a tail percentile, quote the miss ratio in the design review, not the hit ratio.

## Sizing: the working set and the miss-ratio curve

Hit ratio is a function of cache size, and the function is concave: the first megabytes capture the hottest keys and buy most of the hits, and each doubling after that buys less. Web and database access follows a roughly Zipfian distribution (the `k`-th most popular key gets traffic proportional to `1/k^α`), which is why a cache holding 1% of the keys can serve 60–80% of requests, and why holding 10% may only get you to 90%.

The way to size a cache is to measure that curve rather than guess. Replay a sample of the access log through a simulated LRU of increasing size and plot hits against size (a *miss-ratio curve*; tools like SHARDS produce it from a sample with tiny memory). The knee of the curve is the working set; capacity beyond it is wasted memory, and capacity below it is a hit ratio that collapses under the slightest change in traffic mix.

When you convert "entries" into "bytes", count the overhead. A Redis key with a short string value costs roughly 50–100 bytes beyond the payload (the key string, the object header, the dictionary entry, the allocator rounding). A Java `HashMap` entry with boxed values is similar. A cache of a million 20-byte values is not 20 MB; it is closer to 100 MB. Memcached's slab allocator adds another twist: memory is carved into slab classes by item size, and a shift in your value-size distribution can leave one class starved while another sits empty (*slab calcification*), so the hit ratio drops without the cache being full.

## TTLs and jitter

A TTL is a statement about how stale a value may be. Pick it from the product requirement (how long may a user see an old price?), not from a default. A TTL is also a load-smoothing mechanism, and that is where it bites.

Suppose you deploy at 09:00 and the cache warms in the first minute with a uniform 10-minute TTL. At 09:10 everything expires within the same minute; the backend sees a full miss storm every ten minutes, synchronised by your deployment. The fix is **jitter**: set each entry's TTL to `base × (1 ± 0.1)` or `base + uniform(0, base/10)`. Expiries spread out and the miss rate becomes flat.

Expiry itself is usually **lazy**: the entry stays until someone reads it and finds it dead, or until an eviction sweep reaches it. Lazy expiry means `size()` overstates the live entries and dead entries hold memory. Redis pairs lazy expiry with an active sampler: ten times per second it takes 20 random keys with TTLs, deletes the expired ones, and repeats immediately if more than a quarter were expired. The exercise at the end has you build the lazy half.

## Stampedes

The Monday incident in the introduction is a **cache stampede** (also *thundering herd* or *dog-pile*). A hot key expires; every request that arrives in the window between the expiry and the first successful refill misses; every one of those misses calls the backend for the same value. With a 50 ms backend and 4,000 requests per second on that key, that is 200 identical queries in flight before the first one returns, on a backend that was sized for 10.

```viz
{"type": "system", "scenario": "cache-stampede",
 "title": "A hot key expires under load",
 "caption": "Between expiry and the first refill, every request misses and hits the backend for the same value."}
```

There are three families of fix, and a senior answer names all three and picks one.

**Request coalescing.** The first miss for a key takes a per-key lock (or registers in a map of in-flight loads); later misses for the same key wait for that load's result instead of issuing their own. Go's `singleflight` package is exactly this; Guava's and Caffeine's `LoadingCache.get(key, loader)` do it per key. One backend call per key per expiry, whatever the request rate. The cost is that waiters see the backend latency, and in a distributed cache the lock must itself be distributed (a `SET key:lock NX PX 100` in Redis) or you accept one load per application instance.

**Serve stale while refreshing.** Keep the old value past its logical TTL and let *one* request refresh it in the background while the others get the stale value. HTTP has this built in (`Cache-Control: stale-while-revalidate=30`), CDNs implement it, and Caffeine's `refreshAfterWrite` does it in-process. Nobody waits, the backend sees one call, and the product tolerates a few seconds of staleness, which it usually does.

**Probabilistic early expiration.** Instead of every client agreeing that the entry dies at time `T`, each request decides independently to refresh slightly early, with a probability that rises as `T` approaches. The formula from the XFetch paper is: recompute now if

$$\text{now} - \beta \cdot \delta \cdot \ln(\text{rand}()) \ge T,$$

where `δ` is the time the recompute takes and `β ≈ 1`. Since `ln(rand())` is negative, `−δ·ln(rand())` is a random non-negative offset, typically around `δ`, occasionally several times `δ`. A request far from `T` almost never refreshes; as `now` gets within a few `δ` of `T`, the chance climbs steeply, so one lucky request refreshes just before the deadline and the herd never forms. It needs no locks and no coordination, only that each entry store its `δ` and `T`.

The three compose. A CDN edge typically does stale-while-revalidate plus coalescing at the origin; a Redis-backed application cache does a lock with a stale fallback.

### The cold cache is the worst stampede

Everything above assumes one key at a time. When a cache node restarts or a new cache cluster goes live, *every* key is missing at once, and the backend receives the full uncached load. If the backend cannot take it (and the reason you have a cache is that it cannot), the cache never warms because the backend is failing. Plan for it: warm the cache from a snapshot or a replica before taking traffic, ramp traffic to a new cache node gradually, or rate-limit misses so the backend degrades instead of collapsing. The cache's capacity should be in your failure model, not just its latency.

## Negative caching

A miss for a key that does not exist in the backend is the most expensive kind of miss: the cache cannot help because there is nothing to store, so every request for a nonexistent key goes to the database. An attacker (or a buggy client) requesting random IDs bypasses your cache entirely. The fix is to **cache the absence**: store a sentinel for "not found" with a short TTL (seconds to a minute). DNS resolvers have done this for decades (negative caching of `NXDOMAIN`, RFC 2308).

The trap is caching a *transient* failure as an absence. If the backend timed out, that is not "the key does not exist", and caching it as such makes the outage sticky for the TTL. Cache only definitive negative answers, and give them a shorter TTL than positive ones. For truly random-key attacks, a [Bloom filter](/learn/advanced-data-structures/probabilistic-structures/bloom-filters) of all existing keys in front of the cache rejects nonexistent keys without any backend call at all.

## Keys, hot keys and consistency

**Key design.** Include everything the value depends on: tenant, locale, API version, the user's role if the response differs. Two requests that should get different values but share a key is a data leak; two requests that should share a value but have different keys is a hit ratio bug. Namespace keys (`user:123:profile:v2`) so a schema change can bump the version and orphan the old entries instead of deleting them. Hash keys longer than a few hundred bytes.

**Hot keys.** A distributed cache shards keys across nodes, so one key lives on one node. If that key is a celebrity's profile or the homepage configuration, that one node takes the whole load for it while its peers idle, and a node's network interface is the ceiling. Mitigations: replicate the hot key under several suffixes (`key#0` … `key#9`, read a random one), add a small in-process L1 cache in front of the distributed cache for the very hottest keys, or use client-side caching with server-driven invalidation (Redis 6 `CLIENT TRACKING`). Detect hot keys before they hurt: a count-min sketch over the request stream is the right tool.

**Invalidation.** There are two ways to keep the cache and the database consistent on a write: update the cache with the new value, or delete the cache entry and let the next read refill it. Delete is safer, because two concurrent writes can update the cache in the opposite order from the database. But delete has its own race: a reader misses, reads the *old* value from the database, is delayed; a writer updates the database and deletes the cache entry; the slow reader then writes its stale value into the cache, where it lives until the next write. Facebook's memcache paper solved it with **leases**: the cache hands the missing reader a token, a delete invalidates outstanding tokens, and a set with a stale token is rejected. Cheaper approximations are a short TTL on every entry (bounding the damage) or a delayed second delete. For cache invalidation driven by the database itself, change data capture (Debezium and friends) turns every committed row change into an event that deletes the corresponding key.

```viz
{"type": "system", "scenario": "cache-aside",
 "title": "Cache-aside read and write paths",
 "caption": "The application reads the cache first and fills it on a miss; on a write it updates the database and deletes the cache entry. The race between a slow miss-refill and a concurrent delete is the classic stale-cache bug."}
```

## When a cache makes things worse

- **Low hit ratio.** Below about 50%, every miss pays a cache round trip plus the backend, and the average latency can exceed the uncached one. Measure before you ship.
- **Large values.** A 5 MB value in Redis blocks the single-threaded event loop while it is serialised, and a hot large value saturates the network. Compress, split, or do not cache it.
- **Load-bearing caches.** If the backend cannot serve the traffic without the cache, the cache is not an optimisation, it is a dependency with its own availability, and your capacity plan must include the cache being cold or gone.
- **Hidden staleness.** A cache with a 10-minute TTL in front of a feature-flag service means a kill switch takes 10 minutes to work. Every TTL is a promise about staleness; write it down.
- **Two caches disagreeing.** An in-process L1 plus a distributed L2 plus a CDN each with their own TTL produce values that differ between two users for minutes. Either accept it or make the outer layers shorter-lived than the inner ones.

## Exercise

```exercise
id: ttl-cache
title: A TTL cache with lazy expiry
prompt: |
  Implement `TTLCache` with a logical clock. `put(key, value, now, ttl)`
  stores the value with expiry `now + ttl` and returns nothing.
  `get(key, now)` returns the value if the entry exists and `now` is
  strictly before its expiry; otherwise it removes any dead entry and
  returns `None`/`null`. `size(now)` removes every expired entry and
  returns the number of live entries.

  A `put` on an existing key replaces both the value and the expiry.
languages: [python, javascript]
entry: TTLCache
starter:
  python: |
    class TTLCache:
        def __init__(self):
            self.entries = {}   # key -> (value, expiry)

        def put(self, key, value, now, ttl):
            # TODO
            pass

        def get(self, key, now):
            # TODO
            return None

        def size(self, now):
            # TODO
            return 0
  javascript: |
    class TTLCache {
      constructor() {
        this.entries = new Map();  // key -> {value, expiry}
      }
      put(key, value, now, ttl) {
        // TODO
      }
      get(key, now) {
        // TODO
        return null;
      }
      size(now) {
        // TODO
        return 0;
      }
    }
tests:
  - args: [["put","a",1,0,100],["get","a",50],["get","a",100],["get","a",150]]
    expected: [null, 1, null, null]
    label: expiry is exclusive
  - args: [["put","a",1,0,100],["put","a",2,10,100],["get","a",105],["get","a",110]]
    expected: [null, null, 2, null]
    label: put replaces value and expiry
  - args: [["get","zz",0],["size",0]]
    expected: [null, 0]
    label: empty cache
  - args: [["put","a",1,0,10],["put","b",2,0,20],["put","c",3,0,30],["size",15],["size",25],["size",35]]
    expected: [null, null, null, 2, 1, 0]
    label: size purges the dead
  - args: [["put","a",1,0,10],["get","a",10],["put","a",5,10,10],["get","a",15],["size",15]]
    expected: [null, null, null, 5, 1]
    hidden: true
    label: re-put after expiry
  - args: [["put","a",1,0,0],["get","a",0],["size",0]]
    expected: [null, null, 0]
    hidden: true
    label: zero TTL is dead on arrival
hints:
  - "Store the absolute expiry time, not the TTL, so get only compares now with one number."
  - "An entry is live when now < expiry; delete it on the way out when it is not."
```

## Senior signals

- You quote the **miss ratio** and what it does to backend load and to the tail, not just "we'll get ~90% hits".
- You size from a **miss-ratio curve** on real traffic and you count per-entry overhead in bytes.
- You add **jitter** to TTLs without being asked, and you can explain the synchronised-expiry incident it prevents.
- You name **coalescing, stale-while-revalidate and probabilistic early expiry** for stampedes, and you plan for the cold-cache case.
- You cache **negative results** with a short TTL and refuse to cache transient errors.
- You know the **stale-refill race** in cache-aside and at least one real mitigation (leases, short TTLs, CDC-driven deletes).
- You can say when a cache should be **removed**.

## Check yourself

```quiz
- q: >-
    A cache in front of a 50 ms backend has a 90% hit ratio with 1 ms hits. What happens to the p99 latency compared with no cache?
  options: ["It drops to about 1 ms", "It drops to about 5.9 ms", "It stays around 50 ms, because 1 in 10 requests is still a miss", "It rises because of the extra hop"]
  answer: 2
  explanation: >-
    The p99 is the slowest request in a hundred; with 10 misses per hundred, it is a miss and costs the backend latency. 5.9 ms is the average. The tail only improves once the miss ratio is below 1%.
- q: >-
    Improving the hit ratio from 99% to 99.9% seems like a 0.9% change. What does it do to backend load?
  options: ["Reduces it by about 1%", "Reduces it by about 10%", "Reduces it by about 90%", "No measurable change"]
  answer: 2
  explanation: >-
    Backend load is the miss ratio times traffic. Misses go from 1% to 0.1%, a 10× reduction, so 90% of the backend's remaining load disappears.
- q: >-
    All entries were written during a deploy with a uniform 10-minute TTL. What do you expect, and what is the fix?
  options: ["Nothing unusual; TTLs are independent", "A synchronised miss storm every 10 minutes; add random jitter to each TTL", "Memory grows without bound; add an eviction policy", "The cache never expires anything; use active expiry"]
  answer: 1
  explanation: >-
    Entries written together expire together and the backend sees the full load for a moment every period. Spreading TTLs by ±10% flattens the expiries into a steady trickle.
- q: >-
    Which situation is a good candidate for negative caching?
  options: ["The backend timed out while fetching a user", "A lookup for a user ID that the database confirmed does not exist", "A key whose value is 5 MB", "Any miss, to raise the hit ratio"]
  answer: 1
  explanation: >-
    Cache only definitive absences, with a short TTL, so repeated requests for missing keys stop reaching the backend. Caching a timeout as an absence makes the outage sticky.
- q: >-
    In cache-aside, a reader misses and fetches the old value; a writer then updates the database and deletes the cache key; the reader finally writes its value into the cache. What is the result and a real fix?
  options: ["Correct behaviour; the delete ran first", "A stale value cached until the next write; use leases (tokens invalidated by the delete) or a bounded TTL", "A lost database write; use a transaction", "Nothing, because deletes are idempotent"]
  answer: 1
  explanation: >-
    The slow reader's refill lands after the delete and revives the old value. Facebook's memcache leases reject sets whose token was invalidated by an intervening delete; a short TTL bounds how long the stale value survives.
```
