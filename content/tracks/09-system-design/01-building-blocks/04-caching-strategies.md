---
slug: caching-strategies
title: "Caching strategies: levels, write policies, invalidation and stampedes"
description: How each cache level and write policy actually moves data, the specific inconsistency each one permits, the arithmetic of hit ratios, and how a cache stampede takes down a database.
minutes: 30
difficulty: hard
tags: [system-design, caching, redis, cache-aside, invalidation, stampede]
---
A product page takes 20 ms to assemble from the database and is requested 15,000 times a second. That is 300 database-seconds of work every second, or roughly 300 cores of database, for data that changes a few times a day. A cache turns that into a 1 ms lookup and a database that sees 150 requests a second. It also introduces the two hardest problems in the system: what happens when the cached copy is wrong, and what happens when it is missing at the moment everyone wants it.

Every cache decision is a decision about staleness and about failure. This lesson works through where caches sit, how each write policy moves data and what inconsistency it permits, how to invalidate, and how stampedes happen and are prevented, with the numbers you need to size and defend the design.

## The levels and their latencies

Requests pass through a hierarchy of caches before touching a database, and each level has a different owner, scope and staleness model.

| Level | Where | Latency to hit | Scope | Who invalidates |
|---|---|---|---|---|
| Browser / client | User's device | 0 (no network) | One user | `Cache-Control`, `ETag`, the user |
| CDN / edge | PoP near the user | 10–30 ms (the user's RTT to the edge) | All users near that PoP | TTL, purge API, versioned URLs |
| API gateway / reverse proxy | Your edge | ~1 ms | All users, one region | TTL, explicit purge |
| In-process | Inside each service replica | ~100 ns | One replica | TTL; cannot be invalidated coherently |
| Distributed (Redis, Memcached, EVCache) | Shared cluster | ~0.5–1 ms | All replicas in a region | TTL, explicit delete, CDC |
| Database buffer pool | Inside Postgres | ~100 µs (memory) vs ~100 µs–10 ms (disk) | The database | The database, transparently |

The two that carry most of the load in a typical design are the CDN, for anything static or public, and the distributed cache, for per-user or fast-changing data. The in-process cache is the fastest by three orders of magnitude and the hardest to keep correct, because every replica has its own copy and there is no mechanism to update them all at once; it is right for reference data with a short TTL (feature flags, config, a lookup table) and wrong for anything users edit. [CDNs and edge](/learn/networking/application-protocols/cdns-and-edge) covers the edge tier; this lesson concentrates on the distributed cache in front of the database.

```mermaid
flowchart LR
  B["Browser cache"] --> E["CDN edge, 10-30 ms"]
  E --> G["API gateway, ~1 ms"]
  G --> S["Service + in-process cache, ~100 ns"]
  S --> R["Redis cluster, ~1 ms"]
  R -->|"miss"| DB["Postgres, buffer pool then disk"]
```

### Hit-ratio arithmetic

The effective read latency of a cache-fronted store is

$$L = h \cdot L_{cache} + (1 - h) \cdot L_{db}$$

With $L_{cache}$ = 1 ms and $L_{db}$ = 20 ms:

| Hit ratio | Effective mean latency | Database QPS at 15,000 reads/s |
|---|---|---|
| 0.80 | 4.8 ms | 3,000 |
| 0.95 | 1.95 ms | 750 |
| 0.99 | 1.19 ms | 150 |
| 0.999 | 1.02 ms | 15 |

Two things to say about this table in an interview. The mean is dominated by misses once the hit rate is over 90%, so the p99 is a miss and improving hit latency does nothing for it. And the database load is $(1-h)$ times the traffic: going from 95% to 99% cuts database load by 5×, which is the difference between one primary and a sharded cluster. The hit ratio is the design parameter, and it is set by the TTL, the cache size relative to the working set, and the access distribution (Zipfian access, where 1% of keys get most of the reads, caches well; uniform access does not).

## Write policies

The read side of a cache is straightforward: look in the cache, fall through on a miss. The write side decides consistency, and there are four policies with different mechanisms.

### Cache-aside (lazy loading)

The application owns both the cache and the database. On read: get from cache; on miss, read the database, write the value into the cache, return. On write: write the database, then **delete** the cache key.

```viz
{"type": "system", "scenario": "cache-aside", "title": "Cache-aside: the application does the work",
 "caption": "A miss reads the database and populates the cache; a write updates the database and deletes the key. Watch the window between the database write and the delete: a concurrent reader can see the old value."}
```

```python
def get_product(pid):
    v = cache.get(f"product:{pid}")
    if v is None:
        v = db.query_one("SELECT ... FROM products WHERE id = %s", pid)
        cache.set(f"product:{pid}", v, ttl=3600 + random.randint(0, 300))
    return v

def update_product(pid, fields):
    db.execute("UPDATE products SET ... WHERE id = %s", pid)
    cache.delete(f"product:{pid}")          # delete, do not set
```

Why delete rather than set the new value on write? Two reasons. First, setting means computing the cached form on the write path, which may need data the writer does not have. Second, and more important, two concurrent writers setting the cache can interleave so the cache ends with the older value while the database has the newer; two concurrent deletes cannot disagree.

Cache-aside is the default for a reason: the cache holds only what is read, a cache failure degrades to slower reads rather than lost writes, and the policy is simple. Its inconsistency window is real, though. Consider:

1. Reader A misses the cache and reads `price = 10` from the database.
2. Writer B updates the database to `price = 12` and deletes the cache key (which is not there yet).
3. Reader A, delayed by a garbage-collection pause, writes `price = 10` into the cache.

The cache now serves 10 until the TTL expires, and no subsequent write will fix it unless another update happens. The window is narrow (a reader has to be paused between its database read and its cache set while a write completes) but at 15,000 reads/s it will happen. Mitigations: a short TTL bounds the damage; a *versioned* set (compare the row's `updated_at` or version against what is in the cache before writing) closes it; or write the cache with a short "tentative" TTL of a few seconds on miss-fill and a long TTL only on an authoritative path.

The related ordering question is "delete cache then write database" versus "write then delete". Delete-first leaves a window where a reader misses, reads the old database value, and repopulates the cache with it before the write lands; write-first leaves the smaller window above. Write-then-delete is the right default, and some teams add a second delayed delete (a few hundred milliseconds later) to clean up the race.

### Read-through and write-through

In read-through the cache itself loads from the database on a miss; the application only talks to the cache. In write-through, the application writes to the cache and the cache synchronously writes to the database before acknowledging.

```viz
{"type": "system", "scenario": "write-through", "title": "Write-through: cache and database updated together",
 "caption": "Every write goes through the cache to the database before the client gets an acknowledgement. Reads never miss for recently written data, at the cost of write latency equal to the sum of both."}
```

Write-through's property is that the cache is never stale with respect to writes that went through it, so reads after writes hit. Its cost is write latency (cache write plus database write, sequentially) and cache pollution: every written row is cached whether or not anyone will read it. The inconsistency it permits: writes that bypass the cache (a batch job, a migration, another service) are invisible to it until TTL. With one writer, write-through is close to consistent; with many, it is a trap.

### Write-around

Write to the database only; do not touch the cache (or delete the key). Reads populate on miss. This is cache-aside's write path, and it is the right choice when written data is rarely read soon after (logs, audit rows, bulk imports), because it avoids filling the cache with cold data.

### Write-behind (write-back)

Write to the cache and acknowledge immediately; the cache flushes to the database asynchronously, batched, seconds later.

```viz
{"type": "system", "scenario": "write-behind", "title": "Write-behind: acknowledge now, persist later",
 "caption": "Writes land in the cache and are flushed to the database in batches. Throughput is high and write latency is a cache write; a cache node crash before the flush loses every unflushed write."}
```

Write-behind gives the lowest write latency and the highest throughput (coalescing 1,000 increments to a counter into one database update), and it is how a CPU cache and a database buffer pool work internally. As an application pattern its failure mode is severe: the cache is now the system of record for unflushed data, and a Redis node loss drops it. It is appropriate for data you can afford to lose a few seconds of (view counters, "last seen" timestamps, rate-limit state) and inappropriate for anything with the word "order" or "payment" in it, unless the cache is itself durably replicated, at which point you have built a database.

### Summary

| Policy | Read miss | Write path | Inconsistency permitted | Use when |
|---|---|---|---|---|
| Cache-aside | App loads and fills | DB, then delete key | Narrow race on concurrent read/write; stale until TTL after bypassing writes | Default; read-heavy; many writers |
| Read-through | Cache loads | (pair with a write policy) | Same as the write policy | Want the cache as a data-access abstraction |
| Write-through | Cache loads | Cache writes DB synchronously | Bypassing writes invisible | Read-after-write must hit; single writer |
| Write-around | App loads and fills | DB only | Stale until TTL after write | Written data rarely read soon |
| Write-behind | Cache loads | Cache, async flush | Data loss on cache failure | Counters, telemetry, tolerable loss |

## TTLs and invalidation

A TTL is the maximum staleness you accept, and it is also the miss rate you accept: with a 1-hour TTL, every key misses at least once an hour regardless of load. Choosing it is a product decision phrased as a number. A product price can be a minute stale; a user's own profile edit cannot be stale to that user at all; a leaderboard can be 30 seconds stale. Say the number and the reason.

**Jitter the TTL.** If a deploy warms 100,000 keys at once with a 3,600 s TTL, they all expire together an hour later. Add a random 5–10% to each TTL and the expiry spreads.

**Invalidation strategies**, from simplest to most precise:

1. **TTL only.** Accept staleness up to the TTL. Simple, and correct for most read-mostly data.
2. **Explicit delete on write.** The writer knows the key and deletes it. Requires every writer to know every derived key, which is the maintenance burden: a product update must invalidate `product:42`, `category:7:page:1`, `search:...`. Missed keys are the most common cache bug.
3. **Versioned keys.** Include a version in the key (`product:42:v17`) and bump the version on write; old entries expire naturally. Readers need to find the current version, usually from a small, separately cached record.
4. **CDC-driven.** A change-data-capture stream from the database's WAL feeds an invalidator that deletes or updates keys. This removes the burden from writers and catches bypassing writes, at the cost of a pipeline and a lag of tens to hundreds of milliseconds. [Change data capture](/learn/big-data/streaming/change-data-capture) covers the mechanism; [Caching layers](/learn/databases/data-modeling-and-evolution/caching-layers) has the database-side view.

## Stampedes

A cache stampede (thundering herd, dog-pile) happens when a popular key expires or is evicted and every request that would have hit it misses at the same moment. At 15,000 reads/s on a key whose recompute takes 20 ms, 300 requests are in flight before the first one has repopulated the cache, and all 300 go to the database for the same 20 ms query. If the recompute is expensive (a 500 ms aggregation), 7,500 identical queries land on the database, it slows, the recompute takes longer, more requests miss, and the cache never repopulates because the database is now too slow to answer. This is the mechanism behind "the cache expired and the site went down".

```viz
{"type": "system", "scenario": "cache-stampede", "requests": 40, "title": "One expiry, forty identical database queries",
 "caption": "Every request that arrives during the recompute window misses and recomputes. The database sees the same query forty times; with a slow recompute this feedback loop keeps the cache empty."}
```

The fixes, in rough order of preference:

**Request coalescing (single-flight).** Only one request per key per replica recomputes; the others wait for its result. Go's `singleflight`, or a per-key mutex with a promise. This cuts the stampede from N to (number of replicas), which is usually enough.

```python
inflight = {}                              # key -> Future, per process
def get_coalesced(key, loader):
    v = cache.get(key)
    if v is not None:
        return v
    fut = inflight.get(key)
    if fut is None:
        fut = inflight[key] = executor.submit(loader)
        try:
            v = fut.result()
            cache.set(key, v, ttl=ttl_with_jitter())
        finally:
            inflight.pop(key, None)
        return v
    return fut.result()                    # piggyback on the in-flight load
```

**A distributed lock on recompute.** `SET lock:key NX EX 5`; the winner recomputes, the losers either wait briefly and re-read or serve stale. Cuts the stampede to one across the whole fleet; adds a Redis round trip to every miss and a failure mode if the lock holder dies (the TTL handles it).

**Stale-while-revalidate.** Store the value with a logical expiry earlier than the physical TTL. When the logical expiry passes, the first reader triggers a background refresh and *everyone keeps serving the stale value* until the refresh completes. Nobody waits, nobody stampedes, and staleness grows only by the refresh time. This is what CDNs do with `stale-while-revalidate` and it is the best default for anything that tolerates a few seconds of staleness.

**Probabilistic early expiration.** Each reader independently decides, with a probability that rises as expiry approaches, to refresh early (the XFetch formula: refresh when $\text{now} - \Delta \beta \ln(\text{rand}) \ge \text{expiry}$, where $\Delta$ is the recompute time). On average one reader refreshes shortly before expiry and the key never actually expires under load, with no coordination.

## Hot keys

A cache cluster partitions keys across nodes by hash; one node handles one key. A key read 500,000 times a second (a live event's scoreboard, a celebrity's profile) exceeds one Redis node's ~100,000 ops/s and no amount of cluster size helps, because it is one key. Fixes: replicate the key under N suffixes (`score:1`, `score:2`, …) and have readers pick one at random, spreading the load N ways at the cost of N writes per update; put an in-process cache with a 1-second TTL in front, which turns 500,000 reads/s across 50 replicas into 50 reads/s at the distributed cache; or serve it from the CDN. Detection is the hard part: per-key metrics are expensive, so sample, or watch for one node's CPU far above the others.

## Sizing and eviction

Memory for a Redis cache is roughly entries × (key bytes + value bytes + ~50–100 bytes of overhead per key for the dictionary entry, expiry and allocator rounding). Ten million product entries with a 20-byte key and a 500-byte JSON value need about 10 million × 600 B = 6 GB, plus fragmentation; plan for 8–10 GB. Small values dominated by overhead argue for packing (one hash per user rather than a hundred keys per user); values over ~100 KB argue for compression or for not caching them at all, because a single 5 MB value blocks a single-threaded Redis for milliseconds and takes 40 ms to move over a 1 Gbps link.

When memory is full the cache evicts. **LRU** is the default and it is fooled by scans: one batch job touching a million keys once evicts the entire hot set. **LFU** resists scans and adapts slowly to a changing working set. **TinyLFU** with a small admission window (Caffeine's design) gets most of both: a new key must beat the least-valuable resident's frequency to be admitted, so a scan cannot pollute the cache. Redis implements approximate LRU and LFU by sampling a few keys rather than keeping an exact order; the approximation costs almost nothing in hit rate.

## Failure modes

**Stampede on expiry.** Described above. Detection: database QPS spikes at regular intervals matching a TTL; identical queries in the slow log. Mitigation: coalescing, stale-while-revalidate, jittered TTLs.

**Stale reads after a cache failover.** Redis primary fails; the replica promoted was lagging by 200 ms; every delete-on-write in that 200 ms is lost, so those keys serve stale data until TTL. Detection: hard, which is the problem; user reports of "my edit disappeared" clustered after a failover event. Mitigation: short TTLs on user-editable data, versioned reads on critical paths, and a post-failover flush of keys written in the last few seconds if writers can enumerate them.

**The cache becomes the source of truth.** Someone writes data into the cache that is not in the database (a write-behind without a flush, a "temporary" counter). A cache flush or node loss deletes it. Detection: code review; a grep for `cache.set` with no corresponding database write. Mitigation: policy, and treating a cache flush as a routine operation you actually perform, so the assumption is tested.

**A cache node failure lands on the database.** With 99% hit rate and 15,000 reads/s, the database serves 150/s. Lose the cache and it serves 15,000/s, which it cannot; latency climbs, the service's thread pools fill, and the outage is total rather than partial. Detection: cache availability alarms are obvious; the question is whether the database survives the minute before failover. Mitigation: replicated cache with automatic failover (Redis Sentinel or Cluster; EVCache's zone replication), load shedding at the service so that the database sees a bounded rate and the rest fail fast, and a warm-up plan that repopulates the hottest keys before taking full traffic.

**Negative caching gone wrong.** Caching "not found" prevents repeated database lookups for missing keys (a real attack vector: request random IDs and every one misses to the database). But cache the negative result for an hour and a newly created item is invisible for an hour. Detection: "I just created it and it says not found". Mitigation: short negative TTL (seconds), and delete the negative entry on create.

## Interviewer follow-ups

**Q: "You chose cache-aside with delete-on-write. Walk me through the race that leaves the cache stale forever, and what you would do about it."**

A reader misses, reads the old row, is delayed; a writer commits the new row and deletes the key; the delayed reader then sets the old value. The cache now serves the old value until TTL, and further writes will delete it, so "forever" is really "until the next write or the TTL", which for a rarely written row can be the whole TTL. I would keep the TTL short enough that this is tolerable (minutes for product data), and for data where it is not tolerable, I would make the miss-fill conditional: store the row's version alongside the value and only set if the version is not older than what is already there, which Redis can do with a small Lua script. I would not switch to write-through to fix this, because with multiple writers write-through has a bigger hole.

**Q: "Your cache hit rate is 99%. The cache cluster goes down. What happens in the first sixty seconds?"**

Database load goes from 150 to 15,000 reads/s in one second. If the database can do 5,000/s of this query, two thirds of requests queue; service thread pools fill within a few seconds (Little's law: 15,000/s × a latency that is now climbing past 100 ms is over 1,500 in flight); the service starts timing out all requests, not just the ones that would have missed. So without protection, a cache outage is a total outage, not a 1% degradation. With protection: a concurrency limit on database calls per replica sheds the excess as fast 503s so the 5,000/s the database can serve still succeed; the cache fails over to a replica in 10–30 s; and a warm-up job repopulates the top keys. I would design for "a cache loss is a partial outage lasting the failover time" and I would test it by killing a cache node in production during business hours, once I trust the protection.

**Q: "Why not put the cache in-process and skip the network hop entirely? 100 ns versus 1 ms."**

For read-only reference data with a short TTL, yes, and I would do both: an in-process cache with a 1–5 s TTL in front of the distributed cache, which also solves hot keys. For anything a user edits, an in-process cache means each of 50 replicas has its own stale copy and there is no way to invalidate all of them on a write short of a pub/sub broadcast, which is a distributed cache with extra steps. The user would see their edit on one request and not on the next, depending on which replica the load balancer chose. The 1 ms is buying coherence, and coherence is worth 1 ms.

**Q: "A single key is being read 400,000 times a second. Your cluster has 20 nodes. What is the problem and what do you do?"**

The problem is that one key lives on one node, and that node caps out around 100,000 operations a second, so the cluster size is irrelevant. I would first put an in-process cache with a 1-second TTL in front, which turns 400,000 reads/s into one read per replica per second and costs a second of staleness; for a live scoreboard that is fine. If it were not fine, I would replicate the key under ten suffixes and read a random one, accepting ten writes per update. I would also want to know why the key is that hot, because it may belong on the CDN.

**Q: "Write-behind gives you 10× the write throughput. Where would you use it and where would you refuse?"**

Where losing the last few seconds of writes is a metrics problem rather than a money problem: view counts, presence, rate-limit buckets, the "last active" timestamp. For those, coalescing 1,000 increments into one database write is the whole point. I would refuse it for orders, balances, inventory and anything with a legal record, because a cache node loss silently drops committed-looking writes and the users have already been told "success". If someone insists on the throughput for such data, the correct design is a durable log (Kafka) in front of the database, which gives the same decoupling with an acknowledged, replicated write.

## Senior signals

- You name the write policy and the specific inconsistency it permits, and you can describe the cache-aside race step by step.
- You compute the hit ratio's effect on database load and you know that going from 95% to 99% is a 5× reduction.
- You treat the TTL as a product decision and you jitter it.
- You have a stampede answer ready (coalescing plus stale-while-revalidate) and you know what a stampede does to the database.
- You know the cache-loss scenario is a total outage without load shedding, and you have a warm-up plan.
- You know that hot keys defeat cluster size and that in-process caches fix them at the cost of coherence.

The [distributed cache case study](/learn/system-design/case-studies/distributed-cache) builds a cache cluster from these pieces, including consistent hashing and replication across zones.

## Check yourself

```quiz
- q: >-
    A cache-fronted read path has a 1 ms cache hit and a 25 ms database read. Raising the hit ratio from 96% to 99% mostly changes which of these?
  options: ["The p99 latency, which falls from 25 ms to 1 ms", "Neither load nor latency; both rates are high", "The p50 latency, which falls by about 20 ms", "The database load, which falls by about 4x"]
  answer: 3
  explanation: >-
    Database QPS is proportional to the miss rate: 4% to 1% is a 4x reduction. The mean drops only from about 1.96 ms to 1.24 ms. The p99 remains a miss (25 ms) in both cases because more than 1% of requests still miss at 96%, and at 99% the p99 sits right at the boundary; the p50 was already a hit.
- q: >-
    In cache-aside, a writer updates the database and then deletes the cache key. Which interleaving leaves the cache serving stale data until the TTL?
  options: ["A slow reader fetches the old row and sets it after the delete", "Two readers miss together and both set the freshly written row", "Two writers update the row and both delete the key at once", "A reader hits the cache while the writer is updating the database"]
  answer: 0
  explanation: >-
    The reader misses and reads the old row before the update; its delayed set lands after the writer's delete and installs the pre-write value, which nothing will remove until the TTL or the next write. Concurrent deletes are harmless (that is why delete is preferred over set); a hit during the update simply returns the old value once, which is expected.
- q: >-
    A popular key with a 500 ms recompute expires under 10,000 reads/s. Without protection, roughly how many identical database queries are started before the cache is repopulated?
  options: ["About 10", "Exactly 1", "About 10,000", "About 5,000"]
  answer: 3
  explanation: >-
    Every request during the 500 ms recompute window misses: 10,000 x 0.5 = 5,000, not the full 10,000 of a whole second. If those queries slow the database so the recompute takes longer, the window grows and the feedback loop can keep the key empty, which is why coalescing or stale-while-revalidate is needed.
- q: >-
    Which data is an acceptable candidate for write-behind caching?
  options: ["User password hashes", "A per-video view counter", "Customer account balances", "Order line items at checkout"]
  answer: 1
  explanation: >-
    Write-behind acknowledges before persisting, so a cache node loss drops unflushed writes. A view counter tolerates losing a few seconds of increments and benefits from coalescing thousands of them; balances and orders do not tolerate silent loss.
- q: >-
    A single cache node's CPU is at 95% while the other 19 nodes sit at 10%. The most likely cause and fix is:
  options: ["Uneven hash ranges; rebalance by adding more nodes", "One hot key on that node; replicate it or cache it in-process", "Slower hardware on that node; replace it with a larger instance", "Too many client connections to it; put a connection pool in front"]
  answer: 1
  explanation: >-
    Keys are partitioned by hash, so a single very hot key saturates its node regardless of cluster size. Adding nodes does not split one key. A short-TTL in-process cache or replicating the key under several suffixes spreads the reads.
- q: >-
    You cache "not found" results to stop repeated lookups of missing IDs. Which TTL choice is safest?
  options: ["No TTL, since an ID that is missing now will stay missing", "A few seconds, and delete the entry when the item is created", "The same TTL as positive entries, so both expire consistently", "A one-day TTL, since lookups of missing IDs are rare anyway"]
  answer: 1
  explanation: >-
    Negative caching protects the database from lookups of non-existent keys, but a long TTL makes newly created items invisible. A short TTL bounds the damage and deleting on create removes it entirely; reusing the positive TTL applies a freshness budget meant for existing data to data that is about to exist.
```
