---
slug: caching-strategies
title: "Caching strategies: levels, write policies, invalidation and stampedes"
description: Each write policy's race traced as a timeline (the cache-aside stale set, write-through with two writers, write-behind loss), hit ratios simulated on Zipf workloads, a stampede simulated under four defences, TTL jitter, eviction choice under scans, and how Redis, Memcached and Facebook's leases implement it.
minutes: 30
difficulty: hard
tags: [system-design, caching, redis, cache-aside, invalidation, stampede]
---
A product page takes 20 ms to assemble from the database and is requested 15,000 times a second: 300 database-seconds of work every second, roughly 300 cores, for data that changes a few times a day. A cache turns that into a sub-millisecond lookup and a database that sees 150 requests a second. It also introduces the two hardest problems in the system: what happens when the cached copy is wrong, and what happens when it is missing at the moment everyone wants it.

Every cache decision is a decision about staleness and about failure. This lesson traces each write policy's race on a timeline, simulates hit ratios and stampedes to put numbers on them, and ends with how Redis, Memcached and Facebook's memcache deployment implement the pieces.

## Levels and the hit-ratio arithmetic

| Level | Latency to hit | Scope | Who invalidates |
|---|---|---|---|
| Browser | 0 | One user | `Cache-Control`, `ETag` |
| CDN edge | 10–30 ms (the user's RTT to the edge) | Users near one point of presence | TTL, purge API, versioned URLs |
| In-process | ~100 ns | One replica | TTL only; no coherent invalidation across replicas |
| Distributed (Redis, Memcached, EVCache) | 0.2–0.5 ms | Every replica in a region | TTL, explicit delete, change data capture |
| Database buffer pool | ~0.1 ms including the query | The database | The database, transparently |

The CDN carries public and static content ([CDNs and edge](/learn/networking/application-protocols/cdns-and-edge)); the distributed cache carries per-user and fast-changing data and is this lesson's subject. The in-process cache is three orders of magnitude faster and the hardest to keep correct, so it suits reference data with a short TTL (feature flags, configuration) and not data users edit.

With hit ratio $h$, effective latency is $L = h \cdot L_{cache} + (1-h) \cdot L_{db}$ and database load is $(1-h)$ times traffic. With 1 ms hits, 20 ms misses and 15,000 reads/s:

| Hit ratio | Mean latency | Database reads/s |
|---|---|---|
| 0.80 | 4.8 ms | 3,000 |
| 0.95 | 1.95 ms | 750 |
| 0.99 | 1.19 ms | 150 |
| 0.999 | 1.02 ms | 15 |

Going from 95% to 99% cuts database load 5×, which can be the difference between one primary and a sharded cluster. Above 90% the p99 is a miss, so faster hits do nothing for it.

## What the hit ratio depends on: a Zipf workload, simulated

Real access is skewed: the $k$-th most popular key is requested with probability proportional to $1/k^s$ (a Zipf distribution, $s$ near 1 for many web workloads). Simulated: 100,000 keys, 600,000 requests, the first 100,000 discarded as warm-up, an LRU cache of various sizes, against the best any policy could do without knowing the future (always holding the most popular keys):

| Skew $s$ | Cache = 1% of keys | 5% | 10% | 20% |
|---|---|---|---|---|
| 0.8 | LRU 0.20 (best 0.34) | 0.37 (0.51) | 0.47 (0.60) | 0.59 (0.70) |
| 1.0 | 0.51 (0.62) | 0.67 (0.75) | 0.74 (0.81) | 0.81 (0.87) |
| 1.2 | 0.79 (0.85) | 0.89 (0.92) | 0.92 (0.94) | 0.94 (0.96) |

Three things to take into a design review. Skew matters more than size: at 5% of the keys, the hit ratio ranges from 37% to 89% depending on $s$. Each doubling of the cache adds a roughly constant few points, so the last points are expensive. And LRU leaves 6–14 points on the table against perfect frequency knowledge, which is the gap frequency-aware policies (below) recover. Measure your workload's skew before promising a hit ratio.

## Write policies, traced

### Cache-aside

The application owns both stores. Read: get from the cache; on a miss, read the database and set the value. Write: update the database, then **delete** the key.

```viz
{"type": "system", "scenario": "cache-aside", "title": "Cache-aside: the application does the work",
 "caption": "A miss reads the database and populates the cache; a write updates the database and deletes the key. Watch the window between the database read and the cache set: a concurrent write can land in it."}
```

Delete rather than set on write, because two writers setting values can interleave and leave the older one cached, while two deletes cannot disagree. Delete does not close every hole. Trace the stale-set race with a reader that pauses between its database read and its cache set:

| t (ms) | Reader A | Writer B | Database | Cache |
|---|---|---|---|---|
| 0 | `GET product:42`: miss | | price 10 | – |
| 1 | `SELECT`: price 10 | | 10 | – |
| 2 | GC pause begins (50 ms) | `UPDATE price = 12; COMMIT` | 12 | – |
| 3 | | `DEL product:42` (nothing to delete) | 12 | – |
| 52 | `SET product:42 10 EX 3600` | | 12 | **10** |
| 52 → 3,600,052 | | | 12 | 10 for every reader until TTL or the next write |

At 15,000 reads a second the window (a reader paused across an entire write) will be hit. Three fixes: a short TTL bounds the damage; a **versioned set** writes only if the value's version is newer than the cached one (a Redis Lua script comparing a version field); or **leases**, Memcached-style, which make B's delete invalidate A's right to set (under the hood, below).

The other ordering, delete then write, is worse, because its window is the whole write transaction rather than a pause:

| t (ms) | Writer W | Reader R | Database | Cache |
|---|---|---|---|---|
| 0 | `DEL key` | | 10 | – |
| 1 | `BEGIN; UPDATE → 12` (uncommitted) | `GET`: miss; `SELECT`: 10 | 10 | – |
| 2 | | `SET key 10` | 10 | 10 |
| 3 | `COMMIT` | | 12 | **10** |

Some teams add a second, delayed delete a few hundred milliseconds after the write to catch both races; it narrows the window but does not close it.

### Write-through and read-through

Read-through moves the miss-load into the cache layer. Write-through writes the cache and the database synchronously before acknowledging, so a read after a write through the cache hits.

```viz
{"type": "system", "scenario": "write-through", "title": "Write-through: cache and database updated together",
 "caption": "Every write goes through the cache to the database before the client gets an acknowledgement. Reads never miss for recently written data, at the cost of write latency equal to both writes."}
```

With two writers and no per-key serialisation, the two stores can order the writes differently:

| t | Writer A (price 11) | Writer B (price 12) | Cache | Database |
|---|---|---|---|---|
| 0 | cache ← 11 | | 11 | 10 |
| 1 | | cache ← 12 | 12 | 10 |
| 2 | | database ← 12 | 12 | 12 |
| 3 | database ← 11 | | **12** | **11** |

The cache and the database now disagree until the TTL, and neither writer saw an error. Write-through is close to consistent with one writer per key; with many it needs per-key ordering (a lock, or writing the database first and caching the committed row with its version). Writes that bypass the cache (a batch job, a migration) are invisible to it until TTL.

### Write-behind

Write to the cache, acknowledge, flush to the database asynchronously in batches. It coalesces 1,000 increments of a counter into one database write, which is how CPU caches and the database's own buffer pool work. As an application pattern the cache becomes the system of record for unflushed data:

| t (s) | Event | Acknowledged | In the database |
|---|---|---|---|
| 0.0 | 300 view increments | 300 | 0 |
| 1.0 | Flush | 300 | 300 |
| 1.0–1.9 | 250 more increments | 550 | 300 |
| 1.9 | Cache node dies before the next flush | 550 | 300 |
| after failover | | – | 300: 250 acknowledged writes are gone |

```viz
{"type": "system", "scenario": "write-behind", "title": "Write-behind: acknowledge now, persist later",
 "caption": "Writes land in the cache and are flushed to the database in batches. Throughput is high and write latency is a cache write; a node crash before the flush loses every unflushed write."}
```

For view counts that loss is noise. For orders, balances or anything a user was told succeeded, it is a silent data-loss bug; if you need the throughput, put a durable log in front of the database instead.

| Policy | Read miss | Write latency | Inconsistency it permits | Loss if the cache dies | Use when |
|---|---|---|---|---|---|
| Cache-aside | App loads | Database only | Stale set race; bypassing writes until TTL | None | Default; read-heavy; many writers |
| Read-through | Cache loads | Per write policy | As the write policy | As the write policy | Cache as a data-access layer |
| Write-through | Cache loads | Cache + database | Two-writer reordering; bypassing writes | None | Read-after-write must hit; one writer per key |
| Write-around | App loads | Database only | Stale until TTL | None | Written data rarely read soon (logs, imports) |
| Write-behind | Cache loads | Cache only | Database behind by the flush interval | Everything unflushed | Counters, presence, tolerable loss |

## TTLs, jitter and invalidation

A TTL is the maximum staleness you accept and a floor on misses: with a one-hour TTL every key misses at least hourly. Say the number and the reason: a price may be a minute stale; a user's own profile edit may not be stale to that user at all.

**Jitter.** A deploy warms 100,000 keys within 60 s, all with a 3,600 s TTL, and each key is read at least once a second, so it is refilled the second it expires. Simulated over three hourly cycles:

| Cycle | Peak refills per second, fixed TTL | Peak refills per second, TTL + uniform 0–10% |
|---|---|---|
| Hour 1 | 1,743 | 328 |
| Hour 2 | 1,744 | 314 |
| Hour 3 | 1,765 | 236 |

Without jitter the keys expire together, refill together and therefore expire together again, every hour, forever. With jitter the first cycle spreads over about 420 s instead of 60 s and each later cycle spreads further.

**Invalidation**, from simplest to most precise:

1. **TTL only.** Correct for most read-mostly data.
2. **Delete on write.** Every writer must know every derived key (`product:42`, `category:7:page:1`, search results); the missed derived key is the commonest cache bug.
3. **Versioned keys.** `product:42:v17`; bump the version on write and let old entries expire. Readers need the current version from a small, separately cached record.
4. **Change data capture.** An invalidator tails the database's WAL and deletes keys, catching writes that bypass the application, with tens to hundreds of milliseconds of lag ([Change data capture](/learn/big-data/streaming/change-data-capture)).

Cache negative results ("no such ID") too, or random-ID requests all reach the database, but for seconds, and delete the negative entry on create.

## Stampedes, simulated

When a hot key expires, every request in the refill window misses. Simulated: a key read 10,000 times a second (Poisson) across 50 service replicas, expiring at t = 0; the database has 16 worker slots and the recompute needs 50 ms of one; a hit costs 1 ms. Two seconds of traffic:

| Defence | Identical database queries | Database saturated for | Reader p99 |
|---|---|---|---|
| None | 489 | 1.55 s | 872 ms |
| Single-flight per replica | 50 | 0.2 s | 83 ms |
| Fleet-wide lock (`SET lock NX EX 5`) | 1 | 0.05 s | 29 ms |
| Stale-while-revalidate | 1 | 0.05 s | 1 ms |

With a 500 ms recompute the undefended case issued 5,055 queries and kept the database saturated for 158 s, so every other query waited behind them: the cache "expired and the site went down". Single-flight (Go's `singleflight`) cuts duplicates to one per replica with no network coordination:

```python
import threading
import time
from concurrent.futures import Future

class SingleFlight:
    """At most one in-flight load per key in this process; other callers wait for it."""
    def __init__(self):
        self._lock = threading.Lock()
        self._inflight: dict[str, Future] = {}

    def do(self, key, fn):
        with self._lock:
            fut = self._inflight.get(key)
            leader = fut is None
            if leader:
                fut = self._inflight[key] = Future()
        if not leader:
            return fut.result()                   # piggyback on the leader's load
        try:
            fut.set_result(fn())
        except BaseException as exc:              # waiters see the same error
            fut.set_exception(exc)
        finally:
            with self._lock:
                del self._inflight[key]
        return fut.result()

cache: dict[str, dict] = {}
db_calls = 0
flights = SingleFlight()

def load_product(key):
    global db_calls
    db_calls += 1
    time.sleep(0.05)                              # a 50 ms query
    return {"id": 42, "price": 12}

def get(key):
    v = cache.get(key)
    if v is not None:
        return v
    def fill():
        v = cache.get(key)                        # re-check: a previous leader may have just filled it
        if v is None:
            v = load_product(key)
            cache[key] = v                        # fill before the in-flight entry is removed
        return v
    return flights.do(key, fill)

threads = [threading.Thread(target=get, args=("product:42",)) for _ in range(50)]
for t in threads:
    t.start()
for t in threads:
    t.join()
print("database calls:", db_calls)                # 1, not 50
```

The two commented lines matter: filling the cache before removing the in-flight entry, and re-checking inside `fill`, stop a late caller from starting a second load just after the first finished.

```viz
{"type": "system", "scenario": "cache-stampede", "requests": 40, "title": "One expiry, forty identical database queries",
 "caption": "Every request that arrives during the recompute window misses and recomputes. With a slow recompute the database backs up and the cache stays empty."}
```

**Stale-while-revalidate** stores a logical expiry before the physical TTL; after it passes, one reader refreshes in the background while everyone keeps getting the old value, so nobody waits. **Probabilistic early expiration** (XFetch) has each reader refresh early with rising probability, when $\text{now} - \Delta\beta\ln(\text{rand}) \ge \text{expiry}$ with $\Delta$ the recompute time, so under load one reader refreshes shortly before expiry without coordination.

## Hot keys

A cluster puts each key on one node, and a single Redis instance tops out around 100,000–200,000 simple operations a second, so a key read 500,000 times a second (a live score, a celebrity profile) saturates its node whatever the cluster size. Fixes: an in-process cache with a 1 s TTL in front (50 replicas turn 500,000 reads into 50 a second, for a second of staleness); or replicate the key under N suffixes and read one at random (N writes per update); or serve it from the CDN. Detect it by one node's CPU far above its peers, or by sampling keys (`redis-cli --hotkeys` needs an LFU eviction policy).

## Eviction: choosing a policy

When memory is full the cache evicts. Simulated on the Zipf workload ($s = 1.0$, cache = 5% of keys), with and without a batch job that reads 20,000 cold keys once each every 50,000 requests:

| Policy | Steady hit ratio | With scans | First 1,000 requests after a scan |
|---|---|---|---|
| Exact LRU | 0.666 | 0.646 | 0.38 |
| Sampled LRU (evict the oldest of 5 random keys; Redis adds a candidate pool) | 0.662 | 0.641 | – |
| LRU with TinyLFU-style admission | 0.722 | 0.711 | 0.71 |

A scan flushes an LRU cache: the hot set is evicted by keys that will never be read again, and the hit ratio falls to 38% until it rewarms. Frequency-based admission (a newcomer is admitted only if it has been seen more often than the victim) ignores the scan and recovers most of the gap to perfect frequency knowledge. Sampling five keys instead of keeping an exact order cost less than half a point. [LFU and modern policies](/learn/advanced-data-structures/caches-and-eviction/lfu-and-modern-policies) builds these structures.

```exercise
id: cache-eviction-sim
title: Simulate LRU and LFU eviction
prompt: |
  Implement `simulate_cache(capacity, policy, accesses)`. `accesses` is a list
  of string keys read in order from a cache holding at most `capacity` keys
  (`capacity >= 1`). A read of a resident key is a hit. A miss admits the key;
  if the cache is full it first evicts one resident key:

  - `"lru"`: the key whose most recent access is oldest.
  - `"lfu"`: the key with the fewest accesses since it was admitted (a newly
    admitted key has 1), ties broken by the oldest most recent access.

  Return `{"hits": <number of hits>, "evicted": [<evicted keys in order>]}`.
languages: [python, javascript]
entry: simulate_cache
starter:
  python: |
    def simulate_cache(capacity, policy, accesses):
        hits = 0
        evicted = []
        # your code here
        return {"hits": hits, "evicted": evicted}
  javascript: |
    function simulate_cache(capacity, policy, accesses) {
      let hits = 0;
      const evicted = [];
      // your code here
      return { hits, evicted };
    }
tests:
  - args: [2, "lru", ["a", "b", "a", "c", "b", "a"]]
    expected: {"hits": 1, "evicted": ["b", "a", "c"]}
  - args: [2, "lfu", ["a", "b", "a", "c", "b", "a"]]
    expected: {"hits": 2, "evicted": ["b", "c"]}
  - args: [3, "lru", ["h", "h", "h", "s1", "s2", "s3", "h"]]
    expected: {"hits": 2, "evicted": ["h", "s1"]}
    label: a scan evicts the hot key under LRU
  - args: [3, "lfu", ["h", "h", "h", "s1", "s2", "s3", "h"]]
    expected: {"hits": 3, "evicted": ["s1"]}
    label: LFU keeps the hot key
  - args: [1, "lru", []]
    expected: {"hits": 0, "evicted": []}
    label: no accesses
  - args: [2, "lfu", ["x", "y", "z", "x", "y", "z"]]
    expected: {"hits": 0, "evicted": ["x", "y", "z", "x"]}
    label: a loop one larger than the cache never hits
    hidden: true
  - args: [3, "lfu", ["a", "b", "c", "a", "b", "d", "e", "a", "d", "d", "c"]]
    expected: {"hits": 4, "evicted": ["c", "d", "e", "b"]}
    hidden: true
  - args: [3, "lru", ["a", "b", "c", "a", "b", "d", "e", "a", "d", "d", "c"]]
    expected: {"hits": 4, "evicted": ["c", "a", "b", "e"]}
    hidden: true
hints:
  - "Track, per resident key, the time of its last access and its access count; the victim is the minimum of (last) for LRU and of (count, last) for LFU."
  - "An evicted key that comes back starts again with a count of 1."
```

## Under the hood: Redis, Memcached and Facebook's leases

**Redis** evicts only when `maxmemory` is set ([key eviction](https://redis.io/docs/latest/develop/reference/eviction/)). `allkeys-lru` does not keep a global LRU list: it samples `maxmemory-samples` keys (5 by default) and evicts the oldest, keeping a small pool of good candidates between evictions, which is why the sampled simulation above lands within a point of exact LRU. `allkeys-lfu` (Redis 4.0 and later) stores an 8-bit logarithmic counter per key that is incremented probabilistically and decays each minute (`lfu-decay-time`), so it tracks recent popularity rather than lifetime counts. Expired keys are removed lazily when touched and by an active cycle that samples keys with TTLs several times a second, so memory held by expired keys lags a little. Each key costs roughly 50–100 bytes of overhead (dictionary entry, object header, expiry entry, allocator rounding) on top of its bytes, which is why many tiny keys should be packed into hashes.

**Memcached** allocates memory in 1 MB pages split into fixed-size chunks per *slab class*, classes growing by a factor of 1.25. Eviction is per class, so when value sizes drift, memory stays assigned to classes that no longer need it (slab calcification) until the slab rebalancer moves pages. Since 1.5 each class has a segmented LRU (hot, warm, cold) so one-hit items age out before touching the warm set, a built-in defence against scans. It is multi-threaded, whereas Redis executes commands on one thread.

**Netflix's EVCache** is memcached with client-side replication: every write goes to a copy of the cache in each availability zone, and reads are served from the local zone, falling back to another zone on a miss, so losing a zone's cache nodes does not send that zone's reads to the database.

**Facebook's memcache leases** (NSDI 2013) close both the stale-set race and the stampede. On a miss the server hands the client a lease token; a delete of that key invalidates outstanding tokens, so reader A's late `SET` in the first trace is rejected. In the paper's deployment the server issues a token for a key only once every 10 seconds; other missing clients are told to wait briefly and retry, by which time the value is usually present. The paper reports peak database query rates for a hot key-set falling from 17,000/s to 1,300/s.

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Stampede on expiry | Database load spikes at intervals matching a TTL | Identical queries in the slow log, clustered in time | Single-flight, a fleet lock or leases, stale-while-revalidate, jittered TTLs |
| Stale value after a cache failover | "My edit disappeared", clustered after a Redis failover | The promoted replica missed the last deletes (asynchronous replication) | Short TTLs on editable data; versioned sets; flush recently written keys after failover |
| Cache as source of truth | Data vanishes after a flush or node loss | A write-behind or "temporary" value never persisted | Persist first; flush the cache routinely so the assumption is tested |
| Cache loss lands on the database | Total outage, not a 1% degradation, when the cache cluster fails | Database load jumps from $(1-h)$ to all of traffic | Replicated cache with failover, concurrency limits that shed load, a warm-up plan |
| Scan pollution | Hit ratio collapses every night | A batch job reading through the cache | Bypass the cache for scans, or frequency-based admission |
| Negative entry too long | "I just created it and it says not found" | Negative results cached with a long TTL | Seconds of negative TTL; delete on create |

## Interviewer follow-ups

**"Walk me through the race that leaves cache-aside stale, and fix it."** Model answer: a reader misses and reads the old row, pauses; a writer commits and deletes; the reader sets the old value, which lives until the TTL or the next write. Fix with a short TTL, a versioned conditional set, or Memcached-style leases that invalidate the reader's right to set. I would not switch to write-through, which with two writers can leave cache and database disagreeing. Common wrong answer: "delete then write instead", which widens the window to the whole transaction.

**"Your hit ratio is 99% and the cache cluster dies. What happens in the first minute?"** Model answer: database reads go from 150 to 15,000 a second; if it can serve 5,000, queues form, service threads fill (Little's law) and every request times out, not only the misses. With a per-replica concurrency limit on database calls, the 5,000 it can serve succeed and the rest fail fast while the cache fails over; then warm the hottest keys before full traffic. Common wrong answer: "a 1% degradation", from reading the hit ratio as the blast radius.

**"How big should the cache be?"** Model answer: from the access distribution, not the dataset. On a Zipf workload with $s = 1$, 5% of keys gave 67% hits under LRU and 20% gave 81%; with $s = 1.2$ the same sizes gave 89% and 94%. I would sample real keys, replay them through a simulator at candidate sizes, and buy the size at which the next doubling adds too little. Common wrong answer: "the working set", without saying how that is measured.

**"A single key is read 400,000 times a second on a 20-node cluster. What do you do?"** Model answer: one key lives on one node, which saturates near 100,000–200,000 operations a second, so cluster size is irrelevant. An in-process cache with a 1 s TTL turns 400,000 reads into one per replica per second; if a second of staleness is unacceptable, replicate the key under ten suffixes. Common wrong answer: "add nodes".

**"Where would you use write-behind, and where would you refuse?"** Model answer: where losing the last flush interval is a metrics problem: views, presence, rate-limit state. Refuse for orders and balances, where acknowledged writes would vanish with the node; a durable log gives the same decoupling with a replicated acknowledgement. Common wrong answer: "Redis persistence makes it safe", when `appendfsync everysec` can still lose a second and replicas are asynchronous.

## What mid-level engineers get wrong

- Setting the cache on write instead of deleting, and debugging the two-writer race for weeks.
- Promising a hit ratio without measuring skew; the same cache size gives 37% or 89%.
- Identical TTLs on everything warmed by a deploy, then a stampede on the hour.
- Treating a 99% hit ratio as a 1% dependency on the database.
- Write-behind for data a user was told is saved.
- Forgetting derived keys when invalidating.
- Letting batch jobs read through an LRU cache.

## Senior signals

- You name the write policy and trace its specific race, with the fix (versioned sets, leases) rather than a switch to another policy with a different race.
- You compute database load as $(1-h)$ of traffic and know hit ratio depends on skew more than size.
- You treat TTL as a product decision and jitter it.
- You have a stampede answer with numbers: single-flight to one query per replica, leases or a lock to one per fleet, stale-while-revalidate to none waiting.
- You choose eviction for the workload (LRU is fooled by scans; frequency admission is not) and know how Redis approximates it.
- You design for cache loss as a partial outage with load shedding and a warm-up plan. The [distributed cache case study](/learn/system-design/case-studies/distributed-cache) builds a cluster from these parts.

## Check yourself

```quiz
- q: >-
    A cache-fronted read path has 1 ms hits and 25 ms database reads. Raising the hit ratio from 96% to 99% mostly changes which of these?
  options: ["The p50 latency, which falls by about 20 ms", "The p99 latency, which falls from 25 ms to 1 ms", "Neither load nor latency; both rates are high", "The database load, which falls by about 4x"]
  answer: 3
  explanation: >-
    Database load is proportional to the miss rate: 4% to 1% is a 4x reduction. The mean drops only from about 1.96 ms to 1.24 ms. The p99 is still a miss at 96% and sits at the boundary at 99%; the p50 was already a hit.
- q: >-
    In cache-aside, a writer updates the database and then deletes the key. Which interleaving leaves the cache serving stale data until the TTL?
  options: ["Two readers miss together and both set the freshly written row", "A reader hits the cache while the writer is updating the database", "Two writers update the row and both delete the key at once", "A slow reader fetches the old row and sets it after the delete"]
  answer: 3
  explanation: >-
    The reader misses and reads the old row before the update; its delayed set lands after the delete and installs the pre-write value, which nothing removes until the TTL or the next write. Concurrent deletes are harmless, and a hit during the update returns the old value once, which is expected.
- q: >-
    Two writers use write-through without per-key locking. Writer A caches 11 then writes the database; writer B caches 12 and writes the database in between. What is the end state?
  options: ["Cache 11 and database 11, since A finished last", "An error, since write-through detects the conflict", "Cache 12 and database 12, since the last cache write wins", "Cache 12 and database 11, which now disagree"]
  answer: 3
  explanation: >-
    The cache saw A then B, so it holds 12; the database saw B then A, so it holds 11. Nothing detects the disagreement, which lasts until the TTL. Write-through needs one writer per key or per-key ordering to stay consistent.
- q: >-
    A key read 10,000 times a second across 50 replicas expires; the recompute takes 50 ms. With per-replica single-flight, roughly how many identical database queries does the expiry cause?
  options: ["About 50, one per replica", "About 10, one per database worker", "About 500, one per request in the window", "Exactly one for the whole fleet"]
  answer: 0
  explanation: >-
    Single-flight coalesces within a process, so each replica that sees a miss during the window starts one load: about 50, matching the simulation. A fleet-wide lock or leases reduce it to one; with no defence it is about 10,000 x 0.05 = 500.
- q: >-
    A nightly batch job reads a million rarely used keys through an LRU cache, and the daytime hit ratio takes an hour to recover. What fixes it most directly?
  options: ["Admit new keys only if seen more often than the victim", "Double the cache size so the scan fits beside the hot set", "Switch the eviction policy to random replacement", "Lower every TTL so scanned keys expire more quickly"]
  answer: 0
  explanation: >-
    A scan evicts the hot set because LRU admits every miss. Frequency-based admission (TinyLFU-style) refuses keys seen once, so the hot set survives; in the simulation it kept a 71% hit ratio through scans while LRU fell to 38%. Doubling the cache still would not hold a million-key scan, and TTLs do not stop admission.
- q: >-
    You cache "not found" results to stop repeated lookups of missing IDs. Which TTL choice is safest?
  options: ["No TTL, since an ID that is missing now will stay missing", "A few seconds, and delete the entry when the item is created", "The same TTL as positive entries, so both expire consistently", "A one-day TTL, since lookups of missing IDs are rare anyway"]
  answer: 1
  explanation: >-
    Negative caching protects the database from lookups of non-existent keys, but a long TTL makes newly created items invisible. A short TTL bounds the damage and deleting on create removes it; reusing the positive TTL applies a freshness budget meant for existing data to data about to exist.
```
