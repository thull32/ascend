---
slug: caching-layers
title: "Caching layers: cache-aside, invalidation and staying honest with the database"
description: The arithmetic that justifies a cache, the exact interleavings in which cache-aside, write-through and write-behind serve stale or lost data, the fixes for each (leases, versioned writes, invalidation after commit, CDC), and how to stop a stampede.
minutes: 30
difficulty: hard
tags: [caching, cache-aside, invalidation, redis, consistency, cache-stampede, cdc]
problems: [lru-cache]
---
A team puts Redis in front of user profiles with the textbook cache-aside pattern: read the cache, fall back to the database on a miss, fill the cache with a one-hour TTL, and delete the key whenever the profile changes. A week later support tickets arrive: a user changed her display name, and her comments still show the old one to some people, for up to an hour. The write path deletes the key. The tests pass. The code looks right.

It is right, for every interleaving except one. A reader missed the cache and read the old name from the database a moment before the rename committed, then was delayed for a few milliseconds (a garbage-collection pause, a slow network hop) and wrote that old name into the cache *after* the writer had deleted the key. Nothing will correct it until the TTL expires. At a few thousand reads a second on a popular profile, a race with a window of milliseconds happens every day.

Every caching strategy has a race like this with the database. Each has a specific interleaving you can draw on a whiteboard and a specific fix. This lesson goes through them, after first asking whether you need the cache at all.

## The arithmetic of a cache

A cache helps in two ways: it answers faster, and it keeps load off the database. The second usually matters more, and the numbers show why.

If a cache hit costs `t_c` and a miss costs `t_c + t_db` (you check the cache, then go to the database), the average latency at hit ratio `h` is:

$$ \bar{t} = t_c + (1 - h)\, t_{db} $$

With `t_c = 0.5 ms` and `t_db = 5 ms`, a 90% hit ratio gives 1.0 ms and 99% gives 0.55 ms. A modest improvement. Now look at database load, which is proportional to the *miss* ratio. At 20,000 requests a second:

| Hit ratio | Database queries per second |
|---|---|
| 90% | 2,000 |
| 99% | 200 |
| 99.9% | 20 |

Going from 90% to 99% looks like a 10% improvement and is a tenfold reduction in database load. It also works in reverse: a cache that drops from 99% to 90% (a bad deploy that changes key names, a cold restart, an eviction storm) multiplies database load by ten instantly. If the database cannot survive the cache being cold, the cache has become part of your availability story, whether you designed it that way or not.

The latency argument is weaker than people assume for simple lookups. A primary-key lookup on a warm Postgres buffer pool (which is itself a cache; see [storage engine internals](/learn/databases/storage-and-scale/storage-engine-internals)) costs about one network round trip. So does a Redis `GET`. Caching a single indexed row in Redis saves little latency and adds a second system to keep consistent. Caches pay off for results that are expensive to compute: aggregates, multi-join reads, rendered fragments, permission sets, responses from slow external APIs.

This app is a useful example of choosing not to. It runs one Postgres and no Redis. The heaviest read path, the curriculum, is compiled into the binary and served from memory: an immutable in-process cache whose invalidation strategy is "deploy". Authentication hits Postgres on every request, with one primary-key join of session and user. A session cache would save well under a millisecond and would break something the design deliberately guarantees: a logged-out or revoked session stops working immediately, not when a TTL expires.

## Where caches live

| Layer | Latency | Copies | Invalidation difficulty |
|---|---|---|---|
| In-process (a map, `moka`, Caffeine) | Nanoseconds to microseconds | One per instance | Hard: every instance must hear about every change |
| Shared remote (Redis, Memcached) | A network round trip | One logical copy | Moderate: one delete, but races with readers |
| Database buffer pool | No extra hop once warm | One | Automatic and always consistent |
| HTTP caches and CDN | Varies | Many, at the edge | Hard: purge APIs, TTLs, `Cache-Control` |

Most systems use several. The consistency questions below apply to any layer that holds a copy the database does not control.

## Cache-aside

The application owns the logic: read the cache, on a miss read the database and fill the cache, on a write update the database and invalidate the cache.

```viz
{"type": "system", "scenario": "cache-aside", "title": "Cache-aside, including its classic race",
 "caption": "Reads fill the cache lazily, so only hot keys use memory. Writes update the database and then delete the key. The final steps show the race from the opening: a slow reader fills the cache with a value it read before the write."}
```

```python
import json, random

def get_profile(user_id: str) -> dict | None:
    key = f"profile:v2:{user_id}"
    cached = redis.get(key)
    if cached is not None:
        return json.loads(cached)
    row = db.fetch_one(
        "SELECT id, display_name, avatar_url FROM users WHERE id = %s", (user_id,))
    if row is not None:
        # TTL with jitter so keys filled together do not expire together.
        redis.set(key, json.dumps(row), ex=3600 + random.randint(0, 300))
    return row

def rename(user_id: str, name: str) -> None:
    with db.transaction():
        db.execute("UPDATE users SET display_name = %s WHERE id = %s", (name, user_id))
    redis.delete(f"profile:v2:{user_id}")      # after the commit, never before
```

Three details in that code are deliberate.

**The write deletes rather than sets.** If writers set the new value, two concurrent renames can commit in one order and set the cache in the other:

| # | Writer 1 | Writer 2 | Database | Cache |
|---|---|---|---|---|
| 1 | `UPDATE ... 'Ana'` · commit | | Ana | old |
| 2 | | `UPDATE ... 'Ana B.'` · commit | Ana B. | old |
| 3 | | `SET 'Ana B.'` | Ana B. | Ana B. |
| 4 | `SET 'Ana'` | | Ana B. | **Ana** |

The cache now disagrees with the database until the TTL expires. A delete is idempotent: two deletes in any order leave the same state, and the next read fills from the database.

**The delete happens after commit.** Delete inside the transaction and a reader can miss in the gap between the delete and the commit, read the *old* committed row (MVCC shows it the last committed version, as the [MVCC lesson](/learn/databases/relational-fundamentals/mvcc-and-locking) explains), and refill the cache with it. The commit then lands with a stale cache in front of it.

**The key is versioned.** `profile:v2:` changes when the cached shape changes, so a deploy that adds a field never reads entries written by the old code. The cost is a cold cache for that key family after the deploy, so check the arithmetic above first.

## The race that deleting does not fix

Here is the opening incident as a timeline:

| # | Reader | Writer | Database | Cache |
|---|---|---|---|---|
| 1 | `GET profile:42` → miss | | Ana | empty |
| 2 | `SELECT ...` → 'Ana' | | Ana | empty |
| 3 | (paused) | `UPDATE ... 'Ana B.'` · commit | Ana B. | empty |
| 4 | (paused) | `DEL profile:42` | Ana B. | empty |
| 5 | `SET profile:42 'Ana'` | | Ana B. | **Ana (stale)** |

The reader's value was correct when it read it and wrong when it wrote it. Four mitigations exist, and real systems combine them.

**1. A TTL, always.** Every cached value needs an expiry, because it bounds every bug in this section. Choose it from what the product tolerates, not from what makes the hit ratio pretty.

**2. Leases.** Facebook's memcache paper describes the fix most people cite. On a miss, the cache hands the reader a *lease token*. A delete invalidates every outstanding token for the key. When the reader tries to fill, the cache rejects the write if its token was invalidated. In the timeline, step 4 revokes the lease issued at step 1, and step 5 fails harmlessly: the next reader misses and loads 'Ana B.'. Leases also tame stampedes, because the cache can refuse to hand out a second token for the same key for a few seconds and tell other readers to wait briefly. Redis has no built-in leases, but you can build the same check with a small script. The exercise below replays the race with and without leases.

**3. Versioned fills.** Store a version with each cached value (a row version column incremented on every update, or an `updated_at` with enough precision) and only accept a fill whose version is newer than what is there:

```python
SET_IF_NEWER = redis.register_script("""
local cur = redis.call('HGET', KEYS[1], 'v')
if cur and tonumber(cur) >= tonumber(ARGV[1]) then return 0 end
redis.call('HSET', KEYS[1], 'v', ARGV[1], 'data', ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1
""")
```

There is a catch: after a plain delete there is no current version to compare against, so the stale fill in step 5 would still succeed. For versioning to close the race, the writer must leave a marker carrying the new version (write the new value, or a tombstone with the new version and a short TTL) instead of deleting.

**4. Invalidate from the database's log.** A change-data-capture consumer that tails the WAL can delete keys for every committed change, in commit order, including changes made by other services, migrations and someone's manual `UPDATE` in `psql`, all of which bypass your application's write path. It does not by itself close the reader race (the fill can still land after the invalidation), so it is usually combined with a lease or version check, or with a second delete a short, fixed delay after the first. That delayed double delete is a heuristic that shrinks the window rather than closing it; call it that in the design doc. The [change data capture lesson](/learn/big-data/streaming/change-data-capture) covers the pipeline.

```exercise
id: cache-race-with-leases
title: Replay a cache race, with and without leases
prompt: |
  Simulate cache-aside against a single key and report whether the cache ends
  up stale.

  `initial` is the database value; the cache starts empty. Process `events` in
  order:
  - `["miss", r]`: reader `r` finds the cache empty and reads the current
    database value into its own local variable. With leases on, `r` is also
    granted a lease (replacing any lease it held).
  - `["fill", r]`: reader `r` writes its local value into the cache. With leases
    on, the write only happens if `r` holds a valid lease; either way, `r`'s
    lease is used up.
  - `["write", v]`: a writer sets the database value to `v`.
  - `["invalidate"]`: the writer deletes the cache key. With leases on, this
    also revokes every outstanding lease.

  Return `{"db": d, "cache": c, "stale": s}` where `c` is the cached value or
  null if empty, and `s` is true when the cache holds a value different from the
  database.
languages: [python, javascript]
entry: simulate
starter:
  python: |
    def simulate(initial, events, use_leases):
        return {"db": initial, "cache": None, "stale": False}
  javascript: |
    function simulate(initial, events, use_leases) {
      return { db: initial, cache: null, stale: false };
    }
tests:
  - args: [1, [["miss", "R1"], ["fill", "R1"]], false]
    expected: {"db": 1, "cache": 1, "stale": false}
    label: happy path
  - args: [1, [["miss", "R1"], ["write", 2], ["invalidate"], ["fill", "R1"]], false]
    expected: {"db": 2, "cache": 1, "stale": true}
    label: the classic race
  - args: [1, [["miss", "R1"], ["write", 2], ["invalidate"], ["fill", "R1"]], true]
    expected: {"db": 2, "cache": null, "stale": false}
    label: a lease rejects the stale fill
  - args: [1, [["miss", "R1"], ["fill", "R1"], ["write", 2], ["invalidate"]], false]
    expected: {"db": 2, "cache": null, "stale": false}
  - args: [1, [["invalidate"], ["miss", "R1"], ["fill", "R1"], ["write", 2]], true]
    expected: {"db": 2, "cache": 1, "stale": true}
    hidden: true
  - args: [5, [["miss", "R1"], ["write", 6], ["invalidate"], ["miss", "R2"], ["fill", "R2"], ["fill", "R1"]], true]
    expected: {"db": 6, "cache": 6, "stale": false}
    hidden: true
  - args: [5, [["miss", "R1"], ["write", 6], ["invalidate"], ["miss", "R2"], ["fill", "R2"], ["fill", "R1"]], false]
    expected: {"db": 6, "cache": 5, "stale": true}
    hidden: true
hints:
  - "Track the database value, the cache value (or None/null), each reader's local value, and the set of readers holding a valid lease."
  - "A missing invalidate after a write is not something leases can fix; only a TTL bounds that."
```

## Replicas make it worse

Suppose cache fills read from a read replica to spare the primary. The writer commits on the primary and deletes the key. A reader misses, reads the replica, which is 800 ms behind and still has the old row, and fills the cache. The replica catches up a moment later, but the cache now holds the old value for the full TTL. Replica lag, normally a sub-second annoyance, has been converted into an hour of staleness.

The options are to fill hot keys from the primary, to have the CDC consumer invalidate only once the replicas have applied the change (or read the change stream from the replica itself), or to use versioned fills so a fill older than the latest known version is rejected. The [replication lesson](/learn/databases/storage-and-scale/replication) covers read-your-writes techniques that apply here too: a user who just changed their name should at least see *their own* change, which you can guarantee by bypassing the cache for that user's next few reads.

## Read-through, write-through and write-behind

**Read-through** has the same semantics as cache-aside, but the cache library performs the load: you give it a loader function and ask for a key. The benefit is centralisation. A good library coalesces concurrent misses for the same key into one load (Rust's `moka` does this with `get_with`, Java's Caffeine with a loading cache), so single-flight comes for free within a process.

**Write-through** sends writes to the cache, which writes the database synchronously before acknowledging:

```viz
{"type": "system", "scenario": "write-through", "title": "Write-through keeps cache and database in step",
 "caption": "The write is acknowledged only after the database commits, so reads through the cache are never stale for writes that went through it. Writes are slower, fail when the database is down, and fill the cache with keys that may never be read."}
```

It keeps the cache fresh for writes that go through it. It does nothing about writes that do not (another service, a migration, a manual fix), and a crash between the database commit and the cache update leaves the cache stale, so you still need a TTL.

**Write-behind** (write-back) acknowledges from the cache and writes to the database later, in batches:

```viz
{"type": "system", "scenario": "write-behind", "title": "Write-behind trades durability for write speed",
 "caption": "Writes are acknowledged from memory and flushed in coalesced batches, so four writes to one counter cost one database write. If the cache node dies before a flush, acknowledged writes are lost."}
```

It is the right tool for data where losing the last second is acceptable and write volume is high: view counters, last-seen timestamps, rate-limit state, analytics events. It is the wrong tool for anything a user was promised was saved. If you use it, the cache is now a database with a cache's durability, and it needs the operational care of one.

| Strategy | Read staleness | Write latency | Durability | Typical use |
|---|---|---|---|---|
| Cache-aside | Bounded by TTL; reader race | Database only | Database's | Default for read-heavy entities |
| Read-through | Same as cache-aside | Database only | Database's | Same, with built-in single-flight |
| Write-through | Fresh for writes through the cache | Cache + database | Database's | Read-after-write heavy data |
| Write-behind | Cache is ahead of the database | Cache only | Weaker: flush window can be lost | Counters, telemetry |

## Stampedes

A single hot key (the home-page feed, a popular product) expires. In the next 10 milliseconds, 400 requests miss and all 400 run the expensive query that fills it. The database, sized for one such query a second, receives 400 at once, the connection pool drains, and unrelated endpoints start timing out.

```viz
{"type": "system", "scenario": "cache-stampede", "requests": 40,
 "title": "One expiry, forty identical queries",
 "caption": "Every concurrent reader misses at the same instant and recomputes. Single-flight lets one request recompute while the others wait; stale-while-revalidate serves the old value during the refresh; jittered TTLs stop many keys expiring together."}
```

The fixes, from simplest:

- **Jitter TTLs** so keys filled together do not expire together (the `random.randint(0, 300)` in the code above).
- **Single-flight.** Within a process, coalesce concurrent loads of the same key (read-through libraries do it). Across processes, the first miss takes a short lock (`SET lock:key token NX PX 5000`) and recomputes; the others wait briefly or serve a stale copy.
- **Stale-while-revalidate.** Keep the value past its soft expiry, serve it while one background refresh runs, and only hard-expire much later.
- **Probabilistic early refresh.** Each reader independently decides to refresh a little *before* expiry, with a probability that rises as expiry approaches and with how expensive the value is to compute. The XFetch rule (from Vattani, Chierichetti and Lowenstein) needs no coordination:

```python
import math, random, time

def fetch(key, recompute, ttl, beta=1.0):
    entry = cache.get(key)              # (value, delta, expiry) or None
    now = time.time()
    # -log(u) with u in (0, 1] is exponential with mean 1; refresh early by roughly
    # delta * beta seconds on average, where delta is the last recompute time.
    if entry is None or now - entry.delta * beta * math.log(1.0 - random.random()) >= entry.expiry:
        start = time.time()
        value = recompute()
        delta = time.time() - start
        cache.set(key, (value, delta, now + ttl), ex=ttl)
        return value
    return entry.value
```

With a recompute time of 200 ms and many readers per second, one reader almost always refreshes in the last fraction of a second before expiry, and the key never goes cold. (`1.0 - random.random()` avoids `log(0)`, because `random.random()` can return exactly 0.)

A cousin of the stampede is the **penetration** attack: requests for keys that do not exist miss every time and always reach the database. Cache the absence too (**negative caching**), with a short TTL, and rate-limit lookups that can be enumerated.

## Deciding what to cache

Cache when the value is expensive to produce, read far more often than it changes, and tolerant of a bounded staleness you can state. Be wary when:

- **the data needs immediate revocation**: sessions, permissions, feature entitlements. A cached "yes" outlives the revocation unless invalidation is reliable on every node;
- **the read is already cheap**: an indexed primary-key lookup in a warm buffer pool;
- **reuse is low**: highly personalised results with one reader each have low hit ratios and still cost memory;
- **the user must read their own writes** and nothing in the design guarantees it.

Size the cache from the working set, watch the hit ratio and the eviction rate, and bound the number of distinct keys. The [LRU cache](/practice/lru-cache) problem is the eviction policy most caches start from; [cache design considerations](/learn/advanced-data-structures/caches-and-eviction/cache-design-considerations) and the system-design [caching strategies](/learn/system-design/building-blocks/caching-strategies) lesson cover sizing and topology.

## Senior signals

- You justify a cache with miss-ratio arithmetic on database load, and you check whether the database survives the cache being cold.
- You delete rather than set on writes, invalidate after commit, and always set a jittered TTL as the backstop.
- You can draw the stale-fill interleaving for cache-aside and name the fixes: leases, versioned fills with a marker instead of a delete, CDC-driven invalidation.
- You know fills from a lagging replica turn replica lag into TTL-long staleness.
- You choose write-through or write-behind by durability requirement, and treat a write-behind cache as a database with weaker guarantees.
- You prevent stampedes with single-flight, stale-while-revalidate or probabilistic early refresh, and you cache negative results.
- You can argue for *not* caching, as this app does for sessions, when a guarantee such as immediate revocation matters more than a fraction of a millisecond.

## Check yourself

```quiz
- q: >-
    A service handles 50,000 reads per second with a 98% cache hit ratio. A deploy changes the cache key format and the hit ratio drops to 60% for twenty minutes. By how much does database read load change?
  options: ["It stays near 1,000 per second, since misses refill the cache", "It rises twentyfold, from 1,000 to 20,000 queries per second", "It rises by about 40%, from 1,000 to 1,400 queries per second", "It roughly doubles, from 1,000 to 2,000 queries per second"]
  answer: 1
  explanation: >-
    Database load is proportional to the miss ratio, not the hit ratio: 2% of 50,000 is 1,000; 40% is 20,000. Refilling does not help while every new key format starts cold. Small changes in hit ratio are large changes in miss ratio, which is why key-format changes and cold starts need planning.
- q: >-
    In cache-aside, why should the write path delete the key rather than set the new value?
  options: ["Concurrent SETs can land in another order than the commits did", "Redis cannot overwrite a key that already has a TTL attached", "Setting a value would reset and so bypass the key's jittered TTL", "Deleting is cheaper than setting, since no value is serialised"]
  answer: 0
  explanation: >-
    Two concurrent writers can commit in one order and set the cache in the other, and the loser's value sticks until the TTL expires, though the database no longer has it. A delete is idempotent and order-independent: it leaves the cache empty whatever the order, and the next reader fills it from the database.
- q: >-
    A handler runs BEGIN; UPDATE products SET price = ...; DEL product:7; ...; COMMIT. Occasionally the old price is cached for a full TTL after the change. Why?
  options: ["Redis DEL is asynchronous, so the key can outlive the transaction", "The TTL is too short, so the key is refilled before the commit", "The DEL was sent before the UPDATE finished, so Redis rejected it", "A reader refills the old price in the gap between DEL and COMMIT"]
  answer: 3
  explanation: >-
    Until COMMIT, other transactions see the old row under MVCC. Deleting inside the transaction opens a window in which another request misses, reads the last committed (old) price and fills the cache; the commit then lands behind a stale entry. Invalidate after the commit, ideally from the WAL via CDC.
- q: >-
    How do memcache-style leases prevent the stale-fill race?
  options: ["They lock the database row until the reader has filled the cache", "They route every fill to the primary, so no fill reads old data", "They make every cache entry expire after it has been read once", "A delete revokes the miss token, so the late fill is rejected"]
  answer: 3
  explanation: >-
    A reader gets a token on a miss; any delete of the key invalidates outstanding tokens, and a fill with an invalidated token is rejected. The lease ties a fill to the absence of any intervening invalidation, so a reader that loaded data before a write cannot install it afterwards; the next reader misses and loads the new value. Leases also let the cache limit refills per key, which mitigates stampedes.
- q: >-
    Cache fills read from a replica that is typically 1 second behind. A user renames themselves and some pages show the old name for up to an hour. What is the mechanism?
  options: ["A reader refilled from the lagging replica after the invalidation", "Replica lag grows to an hour whenever the primary takes writes", "The CDN cached the rendered page for its own one-hour max-age", "The primary had not yet committed the rename when it was read"]
  answer: 0
  explanation: >-
    After the invalidation, a reader missed, read the not-yet-updated replica, and cached the old value for the full TTL, turning one second of lag into TTL-long staleness. Fill hot keys from the primary, delay invalidation until replicas have applied the change, or use versioned fills.
```
