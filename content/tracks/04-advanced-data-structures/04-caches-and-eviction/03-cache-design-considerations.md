---
slug: cache-design-considerations
title: "Cache design: hit ratios, TTLs, stampedes and when a cache makes things worse"
description: The arithmetic that turns a hit ratio into backend load and tail latency, how to size a cache and choose TTLs with jitter, a stampede counted request by request and stopped with coalescing, stale-while-revalidate and probabilistic early expiry (with the probabilities computed), negative caching, hot keys, invalidation races, what Redis, memcached and EVCache do underneath, and the cases where a cache hurts.
minutes: 50
difficulty: medium
tags: [cache, ttl, stampede, hit-ratio, thundering-herd, negative-caching, design]
---
You put a cache in front of the database. Average latency dropped from 40 ms to 6 ms and everyone was pleased. Then two things happened. The p99 did not move, because one request in ten still went to the database and a p99 is the slowest one in a hundred. And at 09:00 on Monday, when a popular key's TTL expired under peak traffic, four thousand requests missed at the same moment, all four thousand queried the database for the same row, and the database, which had been sized for one tenth of the traffic because "the cache handles the rest", fell over. The cache had not failed. It had done exactly what it was configured to do.

The data structure inside a cache is the easy part; the [LRU](/learn/advanced-data-structures/caches-and-eviction/lru-cache) and [LFU](/learn/advanced-data-structures/caches-and-eviction/lfu-and-modern-policies) lessons covered it. This lesson is about the numbers and the failure modes around it: what a hit ratio actually buys you, how to size and expire entries, how to survive the moment a hot entry expires (counted request by request), and how to tell when a cache is making your system worse. Where caches sit in an architecture is the subject of [caching strategies](/learn/system-design/building-blocks/caching-strategies); this lesson is what happens inside the box.

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

Hit ratio is a function of cache size, and the function is concave: the first megabytes capture the hottest keys and buy most of the hits, and each doubling after that buys less. Web and database access follows a roughly Zipfian distribution (the `k`-th most popular key gets traffic proportional to `1/k^α`). Under a Zipf with `α = 1` over 100,000 keys, the top 0.1% of keys receive 43% of requests, the top 1% receive 62%, and the top 10% receive 81%: a cache holding 1% of the keys serves most of the traffic, and holding ten times more keys buys only 19 more points.

The way to size a cache is to measure that curve rather than guess. Replay a sample of the access log through a simulated LRU of increasing size and plot hits against size (a *miss-ratio curve*; tools like SHARDS produce it from a sample with tiny memory). The knee of the curve is the working set; capacity beyond it is wasted memory, and capacity below it is a hit ratio that collapses under the slightest change in traffic mix.

When you convert "entries" into "bytes", count the overhead. A Redis key with a short string value costs roughly 50–100 bytes beyond the payload (the key string, the object header, the dictionary entry, the allocator rounding). A Java `HashMap` entry with boxed values is similar. A cache of a million 20-byte values is not 20 MB; it is closer to 100 MB. Memcached's slab allocator adds another twist: memory is carved into 1 MB pages assigned to slab classes whose chunk sizes grow by a factor of 1.25 (96 bytes, 120, 152, … up to the item-size maximum), and a shift in your value-size distribution can leave one class starved while another sits empty (*slab calcification*), so the hit ratio drops without the cache being full; the slab automover rebalances pages between classes, slowly.

## TTLs and jitter

A TTL is a statement about how stale a value may be. Pick it from the product requirement (how long may a user see an old price?), not from a default. A TTL is also a load-smoothing mechanism, and that is where it bites.

Suppose you deploy at 09:00 and the cache warms in the first minute with a uniform 10-minute TTL. At 09:10 everything expires within the same minute; the backend sees a full miss storm every ten minutes, synchronised by your deployment. The fix is **jitter**: set each entry's TTL to `base × (1 ± 0.1)` or `base + uniform(0, base/10)`. Expiries spread out and the miss rate becomes flat.

Expiry itself is usually **lazy**: the entry stays until someone reads it and finds it dead, or until an eviction sweep reaches it. Lazy expiry means `size()` overstates the live entries and dead entries hold memory. Redis pairs lazy expiry with an active sampler: on each of its `hz` (10 per second) timer ticks it takes 20 random keys with TTLs, deletes the expired ones, and repeats immediately while more than 10% of the sample was expired (a quarter before 6.0), bounded by a time budget; since 6.0, `active-expire-effort` (1–10) raises the sample size and lowers that threshold. The first exercise at the end has you build the lazy half.

## Stampedes, counted

The Monday incident in the introduction is a **cache stampede** (also *thundering herd* or *dog-pile*). A hot key expires; every request that arrives in the window between the expiry and the first successful refill misses; every one of those misses calls the backend for the same value.

```viz
{"type": "system", "scenario": "cache-stampede",
 "title": "A hot key expires under load",
 "caption": "Between expiry and the first refill, every request misses and hits the backend for the same value."}
```

Count it. The key receives 4,000 requests per second, the backend takes 50 ms, and the entry expires at `T`:

| Time since `T` | Requests arriving | Without coalescing | With coalescing |
|---|---|---|---|
| 0–10 ms | 40 | 40 backend calls in flight | 1 call in flight, 39 waiting |
| 10–50 ms | 160 more | 200 in flight | 1 in flight, 199 waiting |
| 50 ms | the first call returns and refills | the other 199 also return, one by one, each rewriting the same value | all 200 waiters receive the value |
| after 50 ms | 4,000/s | hits | hits |

Two hundred identical queries in flight on a backend that was sized for ten. The second exercise counts exactly this. There are three families of fix, and a senior answer names all three and picks one.

**Request coalescing.** The first miss for a key takes a per-key lock (or registers in a map of in-flight loads); later misses for the same key wait for that load's result instead of issuing their own. Go's `singleflight` package is exactly this; Guava's and Caffeine's `LoadingCache.get(key, loader)` do it per key. One backend call per key per expiry, whatever the request rate. The cost is that waiters see the backend latency, and in a distributed cache the lock must itself be distributed (a `SET key:lock NX PX 100` in Redis) or you accept one load per application instance, which for 50 instances is 50 calls rather than 200.

**Serve stale while refreshing.** Keep the old value past its logical TTL and let *one* request refresh it in the background while the others get the stale value. HTTP has this built in (`Cache-Control: stale-while-revalidate=30`), CDNs implement it, and Caffeine's `refreshAfterWrite` does it in-process. Nobody waits, the backend sees one call, and the product tolerates a few seconds of staleness, which it usually does.

**Probabilistic early expiration.** Instead of every client agreeing that the entry dies at time `T`, each request decides independently to refresh slightly early, with a probability that rises as `T` approaches. The formula from the XFetch paper is: recompute now if

$$\text{now} - \beta \cdot \delta \cdot \ln(\text{rand}()) \ge T,$$

where `δ` is the time the recompute takes and `β ≈ 1`. Since `ln(rand())` is negative, `−δ·ln(rand())` is a random non-negative offset, typically around `δ`, occasionally several times `δ`. The probability that a single request refreshes is `e^{−(T − now)/(βδ)}`. With `δ = 50 ms` and `β = 1`:

| Time before `T` | Probability a given request refreshes | Expected refreshers at 4,000 rps in that window |
|---|---|---|
| 1,000 ms | e⁻²⁰ ≈ 2 × 10⁻⁹ | none |
| 200 ms | 1.8% | |
| 100 ms | 13.5% | about 23 in the 200–100 ms window |
| 50 ms | 36.8% | |
| 10 ms | 81.9% | about 170 in the final 100 ms |

Well before the deadline nobody refreshes; in the last couple of `δ` someone almost certainly does, and the refreshed value pushes `T` forward before the herd forms. The tens of refreshers in the final window are each *one* backend call spread over 100 ms, not 200 simultaneous ones at `T`, and combining early expiry with coalescing collapses them to one. It needs no locks and no coordination, only that each entry store its `δ` and `T`.

The three compose. A CDN edge typically does stale-while-revalidate plus coalescing at the origin; a Redis-backed application cache does a lock with a stale fallback.

### The cold cache is the worst stampede

Everything above assumes one key at a time. When a cache node restarts or a new cache cluster goes live, *every* key is missing at once, and the backend receives the full uncached load. If the backend cannot take it (and the reason you have a cache is that it cannot), the cache never warms because the backend is failing. Plan for it: warm the cache from a snapshot or a replica before taking traffic, ramp traffic to a new cache node gradually, or rate-limit misses so the backend degrades instead of collapsing. The cache's capacity should be in your failure model, not only its latency.

## Negative caching

A miss for a key that does not exist in the backend is the most expensive kind of miss: the cache cannot help because there is nothing to store, so every request for a nonexistent key goes to the database. An attacker (or a buggy client) requesting random IDs bypasses your cache entirely. The fix is to **cache the absence**: store a sentinel for "not found" with a short TTL (seconds to a minute). DNS resolvers have done this for decades (negative caching of `NXDOMAIN`, RFC 2308, with the TTL taken from the zone's SOA minimum).

The trap is caching a *transient* failure as an absence. If the backend timed out, that is not "the key does not exist", and caching it as such makes the outage sticky for the TTL. Cache only definitive negative answers, and give them a shorter TTL than positive ones. For truly random-key attacks, a [Bloom filter](/learn/advanced-data-structures/probabilistic-structures/bloom-filters) of all existing keys in front of the cache rejects nonexistent keys without any backend call at all.

## Keys, hot keys and consistency

**Key design.** Include everything the value depends on: tenant, locale, API version, the user's role if the response differs. Two requests that should get different values but share a key is a data leak; two requests that should share a value but have different keys is a hit ratio bug. Namespace keys (`user:123:profile:v2`) so a schema change can bump the version and orphan the old entries instead of deleting them. Hash keys longer than a few hundred bytes.

**Hot keys.** A distributed cache shards keys across nodes, so one key lives on one node. If that key is a celebrity's profile or the homepage configuration, that one node takes the whole load for it while its peers idle, and a node's network interface is the ceiling: a 100 KB value on a 10 Gbps link caps that node at about 12,500 reads per second of that one key, whatever its CPU. Mitigations: replicate the hot key under several suffixes (`key#0` … `key#9`, read a random one), add a small in-process L1 cache in front of the distributed cache for the very hottest keys, or use client-side caching with server-driven invalidation (Redis 6 `CLIENT TRACKING`, which pushes an invalidation message when a tracked key changes). Detect hot keys before they hurt: a [count-min sketch](/learn/advanced-data-structures/probabilistic-structures/count-min-sketch-and-hyperloglog) over the request stream is the right tool, and `redis-cli --hotkeys` samples the LFU counters to find them.

**Invalidation.** There are two ways to keep the cache and the database consistent on a write: update the cache with the new value, or delete the cache entry and let the next read refill it. Delete is safer, because two concurrent writes can update the cache in the opposite order from the database. But delete has its own race: a reader misses, reads the *old* value from the database, is delayed; a writer updates the database and deletes the cache entry; the slow reader then writes its stale value into the cache, where it lives until the next write. Facebook's memcache paper solved it with **leases**: the cache hands the missing reader a token, a delete invalidates outstanding tokens, and a set with a stale token is rejected. Cheaper approximations are a short TTL on every entry (bounding the damage) or a delayed second delete. For cache invalidation driven by the database itself, change data capture (Debezium and friends) turns every committed row change into an event that deletes the corresponding key.

```viz
{"type": "system", "scenario": "cache-aside",
 "title": "Cache-aside read and write paths",
 "caption": "The application reads the cache first and fills it on a miss; on a write it updates the database and deletes the cache entry. The race between a slow miss-refill and a concurrent delete is the classic stale-cache bug."}
```

## Under the hood: three caches at scale

**Redis.** Single-threaded command execution (I/O threads since 6.0 only read and write sockets), so a 5 MB value serialised on the event loop stalls every other client for the duration; `maxmemory` with an eviction policy from the previous lesson; expiry by the sampler above; `CLIENT TRACKING` for client-side caches; and no built-in coalescing, which is why the lock pattern (`SET lock NX PX`) exists.

**memcached.** Multi-threaded, slab-allocated, with the segmented LRU per slab class, a background crawler that reclaims expired items, and a maximum item size of 1 MB by default (`-I` raises it). Its classic protocol has no server-side lock, so coalescing happens in the client; Facebook added leases in its own deployment, and mainline memcached's meta commands offer the same idea (on a miss one client gets a "win" flag and the right to refill, and later readers see that the refill is already claimed).

**Netflix EVCache.** memcached nodes wrapped in a client that writes every key to every availability zone and reads from the local zone, so a zone failure costs no hits. The design decision that matters for this lesson is zone fallback: when enabled, a miss in the local zone becomes a read from another zone's copy before going to the backend, a second tier of protection against the cold-cache stampede when a zone's nodes are replaced. The [distributed cache case study](/learn/system-design/case-studies/distributed-cache) designs this kind of system from scratch.

## When a cache makes things worse

- **Low hit ratio.** Below about 50%, every miss pays a cache round trip plus the backend, and the average latency can exceed the uncached one. Measure before you ship.
- **Large values.** A 5 MB value in Redis blocks the single-threaded event loop while it is serialised, and a hot large value saturates the network. Compress, split, or do not cache it.
- **Load-bearing caches.** If the backend cannot serve the traffic without the cache, the cache is not an optimisation, it is a dependency with its own availability, and your capacity plan must include the cache being cold or gone.
- **Hidden staleness.** A cache with a 10-minute TTL in front of a feature-flag service means a kill switch takes 10 minutes to work. Every TTL is a promise about staleness; write it down.
- **Two caches disagreeing.** An in-process L1 plus a distributed L2 plus a CDN each with their own TTL produce values that differ between two users for minutes. Either accept it or make the outer layers shorter-lived than the inner ones.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Backend QPS spikes to full uncached load for a second every few minutes | Synchronised expiry: entries written together (a deploy, a warm-up) share one TTL | Jitter every TTL by ±10%; stagger warm-ups |
| One hot key expires and the database sees hundreds of identical queries | Stampede: no coalescing, no stale-serving, hard TTL | Per-key coalescing, stale-while-revalidate, or probabilistic early expiry; measure "duplicate in-flight loads" |
| A cache node replacement takes the backend down | Cold cache: every key misses at once | Warm from a peer or snapshot before taking traffic, ramp traffic, rate-limit misses |
| One cache node at 100% network while the rest idle | Hot key pinned to one shard | Replicate the key under suffixes, add an L1, or client-side caching with invalidation |
| Users see a value that was updated minutes ago | Stale refill race in cache-aside, or a TTL longer than the product tolerates | Leases or a short TTL; CDC-driven deletes; document the staleness budget |
| An outage in the backend persists for the TTL after the backend recovers | A timeout was cached as a negative result | Cache only definitive absences, with a shorter TTL than positives |
| Hit ratio drops although memory is not full | Slab calcification in memcached: the class that fits the new value size has no pages | Enable the slab automover, or restart with a value-size-appropriate growth factor |

## Interviewer follow-ups

**"We have a 95% hit ratio and the p99 is still the database's latency. Why, and what would fix it?"** Model answer: 5% of requests miss, so 5 in 100 see backend latency and the p99 is one of them; only a miss ratio under 1% moves the p99, so either raise the hit ratio past 99% (size, admission policy) or hide the miss latency (stale-while-revalidate, prefetching). Common wrong answer: "add more cache nodes", which changes capacity, not the miss ratio for the tail.

**"A key gets 4,000 requests per second and its TTL has expired. Walk me through what happens and how you stop it."** Model answer: with a 50 ms backend, about 200 identical queries pile up before the first refill; coalesce with a per-key in-flight map or a distributed lock, serve stale while one request refreshes, or use probabilistic early expiry so one request refreshes a few `δ` before the deadline. Common wrong answer: "make the TTL longer", which delays the stampede.

**"Should the write path update the cache or delete the key?"** Model answer: delete, because two concurrent updates can reach the cache in the opposite order from the database; and guard the delete against the slow-reader refill race with leases, a short TTL, or a delayed second delete. Common wrong answer: "update, so the next read is a hit", ignoring both races.

**"How do you find hot keys before they melt a shard?"** Model answer: a count-min sketch over the request stream in the client or proxy, or Redis's `--hotkeys` sampling of LFU counters; then replicate the key under suffixes or add a local L1. Common wrong answer: "look at the slow log", which shows slow commands, not frequent keys.

**"When would you remove a cache?"** Model answer: when its hit ratio is below the break-even where miss cost plus cache round trip exceeds the backend alone, when the staleness it introduces violates a product promise, or when it has become load-bearing without a plan for being cold. Common wrong answer: "never, caches only help".

## What mid-level engineers get wrong

- **Quoting the hit ratio in a tail-latency discussion.** The tail is decided by the miss ratio against the percentile.
- **Uniform TTLs**, which turn every deploy into a periodic miss storm.
- **No plan for the cold cache**, then discovering the backend cannot take one minute of uncached load.
- **Caching timeouts as absences**, making outages sticky.
- **Updating the cache on write "for freshness"**, and shipping the reordering race.
- **Counting entries, not bytes, and ignoring the 50–100 bytes of overhead per entry** when sizing Redis.

## Exercises

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

```exercise
id: stampede-backend-calls
title: Count backend calls during a stampede
prompt: |
  Implement `backend_calls(arrivals, expiry, latency, coalesce)`. One key
  is cached until time `expiry` (a request at time `t` is a hit when
  `t < expiry`). `arrivals` lists request times for that key, in any
  order. A miss triggers a backend call that takes `latency` time units;
  the first miss's call refills the cache at `first_miss_time + latency`,
  and every request arriving at or after that refill time is a hit again.

  Without coalescing (`coalesce` false), every request that misses before
  the refill makes its own backend call. With coalescing, the requests
  that miss before the refill share the first call. Return the number of
  backend calls.
languages: [python, javascript]
entry: backend_calls
starter:
  python: |
    def backend_calls(arrivals, expiry, latency, coalesce):
        # sort the arrivals, track the refill time of the first miss
        return 0
  javascript: |
    function backend_calls(arrivals, expiry, latency, coalesce) {
      // sort the arrivals, track the refill time of the first miss
      return 0;
    }
tests:
  - args: [[0, 10, 20, 30, 40, 50, 60, 70, 80, 90], 25, 50, false]
    expected: 5
    label: every miss before the refill at 80 calls the backend
  - args: [[0, 10, 20, 30, 40, 50, 60, 70, 80, 90], 25, 50, true]
    expected: 1
    label: coalescing shares the first call
  - args: [[0, 10, 20], 100, 50, false]
    expected: 0
    label: nothing expires
  - args: [[], 0, 50, false]
    expected: 0
    label: no requests
  - args: [[100, 101, 102, 103, 200], 100, 5, false]
    expected: 4
    label: the request at 200 arrives after the refill at 105
  - args: [[100, 101, 102, 103, 200], 100, 5, true]
    expected: 1
    hidden: true
    label: coalesced version of the same trace
  - args: [[30, 10, 20, 40], 15, 10, false]
    expected: 1
    hidden: true
    label: unsorted input, refill at 30 makes the later requests hits
  - args: [[50, 50, 50], 50, 0, false]
    expected: 1
    hidden: true
    label: zero latency refills instantly, so only the first request misses
hints:
  - "Sort first. Keep `refill = None`; on the first miss set `refill = t + latency`."
  - "A request is a miss when `t >= expiry` and (`refill` is unset or `t < refill`). With coalescing, count only the first miss."
```

## Senior signals

- You quote the **miss ratio** and what it does to backend load and to the tail, not "we'll get ~90% hits", and you know that the p99 moves only when misses are rarer than 1%.
- You size from a **miss-ratio curve** on real traffic, you know a Zipf(1) workload puts about 60% of requests on 1% of keys, and you count per-entry overhead in bytes.
- You add **jitter** to TTLs without being asked, and you can explain the synchronised-expiry incident it prevents.
- You can count a stampede (200 duplicate calls at 4,000 rps and 50 ms), name **coalescing, stale-while-revalidate and probabilistic early expiry**, compute XFetch's refresh probability at a given distance from expiry, and plan for the cold-cache case.
- You cache **negative results** with a short TTL and refuse to cache transient errors.
- You know the **stale-refill race** in cache-aside and at least one real mitigation (leases, short TTLs, CDC-driven deletes), and you know Redis's expiry sampler and memcached's slab classes well enough to predict their failure modes.
- You can say when a cache should be **removed**.

## Check yourself

```quiz
- q: >-
    A cache in front of a 50 ms backend has a 90% hit ratio with 1 ms hits. What happens to the p99 latency compared with no cache?
  options: ["It drops to about 1 ms, because 90% of requests are now hits", "It stays near 50 ms, since 1 in 10 requests is still a miss", "It drops to about 5.9 ms, the weighted mix of hits and misses", "It drops to about 45 ms, since hits pull the tail down by 10%"]
  answer: 1
  explanation: >-
    The p99 is the slowest request in a hundred; with 10 misses per hundred, it is a miss and costs the backend latency. 5.9 ms is the average, not a tail percentile. The tail only improves once the miss ratio is below 1%.
- q: >-
    Improving the hit ratio from 99% to 99.9% seems like a 0.9% change. What does it do to backend load?
  options: ["Reduces it by about 90%", "Reduces it by about 1%", "No measurable change", "Reduces it by about 10%"]
  answer: 0
  explanation: >-
    Backend load is the miss ratio times traffic. Misses go from 1% to 0.1%, a 10× reduction, so 90% of the backend's remaining load disappears.
- q: >-
    All entries were written during a deploy with a uniform 10-minute TTL. What do you expect, and what is the fix?
  options: ["A miss storm every 10 minutes; add random jitter to each TTL", "A stampede on a single hot key; lock around its refill", "Memory grows without bound; add an LRU eviction policy on top", "Nothing unusual, since each key's TTL is tracked independently"]
  answer: 0
  explanation: >-
    Entries written together expire together and the backend sees the full load for a moment every period. Spreading TTLs by ±10% flattens the expiries into a steady trickle. It is every key expiring at once, not one hot key, so a per-key refill lock does not spread the load.
- q: >-
    With probabilistic early expiration (β = 1, recompute time δ = 50 ms), roughly how likely is a single request to trigger a refresh 100 ms before the entry expires, and 1 second before?
  options: ["About 50% and about 5%, because the probability falls linearly with the time remaining", "About 2% and about 2%, because the refresh probability is a fixed constant per request", "About 100% and about 100%, because every request refreshes once the entry is within its TTL", "About 13% and about 0%, because the probability decays exponentially with the distance to expiry in units of δ"]
  answer: 3
  explanation: >-
    The refresh probability is e^(−remaining/(βδ)): e^(−2) ≈ 13.5% at 100 ms and e^(−20), effectively zero, at 1 s. That shape is the point: nobody refreshes early in the TTL, and someone almost surely refreshes in the last couple of δ, so the herd never forms.
- q: >-
    Which situation is a good candidate for negative caching?
  options: ["A fetch for a user that failed because the backend timed out", "A user whose record changes too often to cache the value itself", "A lookup for a user ID the database confirmed does not exist", "Every miss, so that repeated misses stop reaching the backend"]
  answer: 2
  explanation: >-
    Cache only definitive absences, with a short TTL, so repeated requests for missing keys stop reaching the backend. Caching a timeout as an absence makes the outage sticky, which is also why caching every miss is wrong.
- q: >-
    In cache-aside, a reader misses and fetches the old value; a writer then updates the database and deletes the cache key; the reader finally writes its value into the cache. What is the result and a real fix?
  options: ["The delete is lost; update the cache on writes instead of deleting", "A lost database write; wrap the read and the write in a transaction", "A stale value cached until the next write; use leases or a short TTL", "Correct behaviour, because the writer's delete ran after the read"]
  answer: 2
  explanation: >-
    The slow reader's refill lands after the delete and revives the old value. Facebook's memcache leases reject sets whose token was invalidated by an intervening delete; a short TTL bounds how long the stale value survives. Updating the cache on writes instead has its own race, since concurrent writes can reach the cache in the opposite order from the database.
```
