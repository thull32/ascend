---
slug: caching-layers
title: "Caching layers: cache-aside, invalidation and staying honest with the database"
description: The arithmetic that justifies a cache, cache-aside against read-through, write-through and write-behind, four invalidation races traced step by step with the fix that closes each (delete-after-commit, leases, versioned markers, CDC), stampede maths with probabilistic early refresh simulated, negative caching, warming, and the HTTP caching this app actually does.
minutes: 30
difficulty: hard
tags: [caching, cache-aside, invalidation, redis, consistency, cache-stampede, cdc]
problems: [lru-cache]
---
A team puts Redis in front of user profiles with the textbook cache-aside pattern: read the cache, fall back to the database on a miss, fill the cache with a one-hour TTL, and delete the key whenever the profile changes. A week later support tickets arrive: a user changed her display name, and her comments still show the old one to some people, for up to an hour. The write path deletes the key. The tests pass. The code looks right.

It is right, for every interleaving except one. A reader missed the cache and read the old name from the database a moment before the rename committed, then was delayed for a few milliseconds (a garbage-collection pause, a slow network hop) and wrote that old name into the cache *after* the writer had deleted the key. Nothing corrects it until the TTL expires. At a few thousand reads a second on a popular profile, a race with a window of milliseconds happens every day.

Every caching strategy has races like this with the database, and each race has a specific interleaving you can draw on a whiteboard and a specific fix. This lesson first asks whether you need the cache at all, then traces four races step by step, shows which fix closes which race (only one closes all four), works the stampede maths with a simulation, and ends with the caches this app does and does not run.

## The arithmetic of a cache

A cache helps in two ways: it answers faster, and it keeps load off the database. The second usually matters more. If a hit costs `t_c` and a miss costs `t_c + t_db`, the mean latency at hit ratio `h` is:

$$ \bar{t} = t_c + (1 - h)\, t_{db} $$

With `t_c = 0.5 ms` and `t_db = 5 ms`, a 90% hit ratio gives 1.0 ms and 99% gives 0.55 ms: a modest gain. Database load, though, is proportional to the *miss* ratio. At 20,000 requests a second:

| Hit ratio | Database queries per second |
|---|---|
| 90% | 2,000 |
| 99% | 200 |
| 99.9% | 20 |

Going from 90% to 99% looks like a 10% improvement and is a tenfold cut in database load. It also works in reverse: a cache that drops from 99% to 90% (a deploy that changes key names, a cold restart, an eviction storm) multiplies database load by ten at once. If the database cannot survive the cache being cold, the cache is part of your availability story, whether or not you designed it that way.

Little's law gives the concurrency the database must absorb: misses per second × time per miss. At 50,000 requests a second, 2% misses and 5 ms per database query, that is 50,000 × 0.02 × 0.005 = **5 queries in flight** on average; a cold cache makes it 250.

The latency argument is weaker than people assume for simple lookups. The [ORM lesson](/learn/databases/data-modeling-and-evolution/orms-and-n-plus-one) measured a primary-key lookup on a warm Postgres at about 0.11 ms per round trip, almost all of it the trip itself; a Redis `GET` is also one round trip. Caching one indexed row saves little and adds a second system to keep consistent. Caches pay off for results that are expensive to compute: the [leaderboard aggregate](/learn/databases/data-modeling-and-evolution/modelling-for-access-patterns) that took 749 ms, multi-join reads, rendered fragments, permission sets, slow external APIs.

## Where caches live, and this app's

| Layer | Latency | Copies | Invalidation difficulty |
|---|---|---|---|
| In-process (a map, `moka`, Caffeine) | Nanoseconds to microseconds | One per instance | Hard: every instance must hear about every change |
| Shared remote (Redis, Memcached) | One network round trip | One logical copy | Moderate: one delete, but races with readers |
| Database buffer pool | No extra hop once warm | One | Automatic and always consistent |
| HTTP caches and CDN | Zero to one round trip | Many, at the edge and in browsers | Hard: purge APIs, TTLs, `Cache-Control` |

This app runs one Postgres and no Redis or in-process cache crate, and it still caches in three places, each with a named invalidation rule:

- **The curriculum is compiled into the binary** (`include_dir!` in `crates/core/src/content/loader.rs`) and served from memory: an immutable in-process cache whose invalidation strategy is "deploy".
- **Hashed front-end assets** under `/assets/` are served with `Cache-Control: public, max-age=31536000, immutable`, while `index.html` gets `no-cache`. A changed file gets a new name, so no cached copy ever needs invalidating: the versioned-key pattern at the HTTP layer.
- **Curriculum API responses** carry an `ETag` and `private, max-age=0, must-revalidate`, and the handler answers `304 Not Modified` when `If-None-Match` matches. `content_etag` in `crates/api/src/build_info.rs` hashes the content version, the build ID and `index.html` with SHA-256, and its comment explains why: a content-only fingerprint would let a browser keep a cached body across a deploy that changed the response format.

Sessions are deliberately not cached. `AuthService::authenticate` runs one primary-key join of session and user on every request, so a logged-out or revoked session stops working immediately, not when a TTL expires.

## Four strategies

**Cache-aside**: the application reads the cache, on a miss reads the database and fills the cache, and on a write updates the database and invalidates the key. **Read-through** has the same semantics, but a cache library performs the load from a loader function you supply, which centralises it; a good library coalesces concurrent misses for one key into one load (Rust's `moka` with `get_with`, Java's Caffeine loading cache). **Write-through** sends writes through the cache, which writes the database synchronously before acknowledging. **Write-behind** acknowledges from the cache and writes the database later, in batches.

```viz
{"type": "system", "scenario": "cache-aside", "title": "Cache-aside, including its classic race",
 "caption": "Reads fill the cache lazily, so only hot keys use memory. Writes update the database and then delete the key. The final steps show the race from the opening: a slow reader fills the cache with a value it read before the write."}
```

| Strategy | Read staleness | Write latency | Durability | When the cache is down | Typical use |
|---|---|---|---|---|---|
| Cache-aside | Bounded by TTL; has reader races | Database only | The database's | Reads fall through to the database | Default for read-heavy entities |
| Read-through | Same as cache-aside | Database only | The database's | Same, if the library allows | Same, with built-in single-flight |
| Write-through | Fresh for writes that go through the cache | Cache + database | The database's | Writes fail or bypass | Read-after-write heavy data |
| Write-behind | Cache ahead of the database | Cache only | Weaker: the flush window can be lost | Acknowledged writes can be lost | Counters, last-seen times, telemetry |

```viz
{"type": "system", "scenario": "write-through", "title": "Write-through keeps cache and database in step",
 "caption": "The write is acknowledged only after the database commits, so reads through the cache are never stale for writes that went through it. Writes are slower, fail when the database is down, and fill the cache with keys that may never be read."}
```

Write-through does nothing about writes that bypass it (another service, a migration, a manual fix), and a crash between the database commit and the cache update leaves the cache stale, so it still needs a TTL. Write-behind turns the cache into a database with a cache's durability: four writes to one counter cost one database write, and a node that dies before a flush loses acknowledged writes. Use it only where losing the last second is acceptable, never for anything a user was told was saved.

```viz
{"type": "system", "scenario": "write-behind", "title": "Write-behind trades durability for write speed",
 "caption": "Writes are acknowledged from memory and flushed in coalesced batches, so four writes to one counter cost one database write. If the cache node dies before a flush, acknowledged writes are lost."}
```

## Cache-aside, written carefully

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

Three details are deliberate, and each exists because of a race below: the write **deletes** rather than sets (race 1), the delete happens **after commit** (race 2), and every value has a **TTL**, because races 3 and 4 survive both of the first two rules. The key is also **versioned** (`profile:v2:`): a deploy that changes the cached shape reads a new key family instead of entries written by the old code, at the cost of a cold start for that family, so check the hit-ratio arithmetic first.

## Race 1: two writers that set

If writers set the new value instead of deleting, two concurrent renames can commit in one order and reach the cache in the other:

| # | Writer 1 | Writer 2 | Database | Cache |
|---|---|---|---|---|
| 1 | `UPDATE ... 'Ana'` · commit | | Ana | old |
| 2 | | `UPDATE ... 'Ana B.'` · commit | Ana B. | old |
| 3 | | `SET 'Ana B.'` | Ana B. | Ana B. |
| 4 | `SET 'Ana'` (delayed) | | Ana B. | **Ana** |

The cache disagrees with the database until the TTL expires. A delete is idempotent and commutative: two deletes in any order leave the key empty, and the next reader fills it from the database. That is why cache-aside writes delete.

## Race 2: deleting inside the transaction

| # | Writer | Reader | Database (committed) | Cache |
|---|---|---|---|---|
| 1 | `BEGIN; UPDATE ... 'Ana B.'` | | Ana | Ana |
| 2 | `DEL profile:42` | | Ana | empty |
| 3 | | `GET` → miss | Ana | empty |
| 4 | | `SELECT` → **'Ana'** | Ana | empty |
| 5 | | `SET 'Ana'` | Ana | Ana |
| 6 | `COMMIT` | | Ana B. | **Ana (stale)** |

Step 4 is MVCC doing its job: other transactions see the last committed version. The lab reproduced it on PostgreSQL 17 with two sessions: while the writer's `UPDATE` was uncommitted, the reader's `SELECT` returned `Ana` with version 1; after `COMMIT` it returned `Ana B.` with version 2. The [MVCC lesson](/learn/databases/relational-fundamentals/mvcc-and-locking) explains the visibility rule. Deleting after commit closes this race; so does invalidating from the WAL, which only ever sees committed changes.

## Race 3: the slow reader's fill

This is the opening incident, and deleting after commit does not fix it:

| # | Reader | Writer | Database | Cache |
|---|---|---|---|---|
| 1 | `GET profile:42` → miss | | Ana | empty |
| 2 | `SELECT ...` → 'Ana' | | Ana | empty |
| 3 | (paused) | `UPDATE ... 'Ana B.'` · commit | Ana B. | empty |
| 4 | (paused) | `DEL profile:42` | Ana B. | empty |
| 5 | `SET profile:42 'Ana'` | | Ana B. | **Ana (stale)** |

The reader's value was correct when it read it and wrong when it wrote it. The window is the reader's time between step 2 and step 5, which is usually a millisecond and occasionally a 200 ms garbage-collection pause.

## Race 4: filling from a lagging replica

Fills often read a replica to spare the primary:

| # | Writer | Reader | Primary | Replica | Cache |
|---|---|---|---|---|---|
| 1 | `UPDATE ... 'Ana B.'` · commit | | Ana B. | Ana | Ana |
| 2 | `DEL profile:42` | | Ana B. | Ana | empty |
| 3 | | `GET` → miss | Ana B. | Ana | empty |
| 4 | | `SELECT` on replica → 'Ana' | Ana B. | Ana | empty |
| 5 | | `SET 'Ana'` | Ana B. | Ana | Ana |
| 6 | | | Ana B. | Ana B. (caught up) | **Ana (stale)** |

The replica was 800 ms behind; the cache is now wrong for the full TTL. Replica lag, normally a sub-second annoyance, has become an hour of staleness. Note that the reader's miss happened *after* the invalidation, which matters for the fixes. The [replication lesson](/learn/databases/storage-and-scale/replication) covers the lag itself.

## The fixes, and which race each closes

| Fix | Race 1: sets | Race 2: delete before commit | Race 3: slow fill | Race 4: replica fill | Cost |
|---|---|---|---|---|---|
| Delete, never set | closes | no | no | no | One extra miss per write |
| Delete after commit | no | closes | no | no | A crash between commit and delete leaves the key stale until TTL |
| Leases | not needed once writers delete | no | closes | no | Needs lease support in the cache |
| Versioned marker, fills only if newer | closes | closes | closes | closes | A version column; a marker write per update; misses until readers see the new version |
| CDC invalidation from the WAL | closes (deletes) | closes | narrows | closes only if deletes follow replica apply | A pipeline to run; its lag is staleness |
| TTL with jitter | bounds all four | | | | Staleness up to the TTL; more misses when shorter |

## Under the hood: leases and versioned markers

Most of these fixes work by giving the cache a way to refuse a write, or by moving the delete to a point where no stale read can follow it. Two properties of the cache server matter first. Redis executes commands, and a Lua script as a whole, one at a time, so a compare-and-set inside a script cannot interleave with another client's write. And an expired key is never returned: Redis checks expiry when a key is accessed and reclaims expired keys it samples in a background cycle, so the TTL is a hard bound on how long any stale entry can be served.

**Leases** come from Facebook's memcache paper (Nishtala et al., NSDI 2013). On a miss the cache hands the reader a 64-bit lease token bound to the key; a delete invalidates outstanding tokens; a fill carrying an invalidated token is rejected. In race 3, step 4 revokes the token issued at step 1, so step 5 fails harmlessly. In races 2 and 4 the reader's miss comes *after* the delete, so its token is fresh and the stale fill is accepted: leases only guard against invalidations that happen after the miss. The paper also used leases against stampedes, handing out a token for a key at most once every 10 seconds and telling other readers to wait briefly, and reports that this cut peak database query rate from 17,000 to 1,300 per second.

**Versioned markers** work because the database, not timing, decides. Every update increments a `version` column (`UPDATE ... SET version = version + 1 RETURNING version`); the invalidation writes a tombstone carrying the new version instead of deleting; a fill is accepted only if its version is newer than a cached value, or at least as new as a tombstone. A stale read carries an old version, whichever of the four paths produced it, and is rejected. With a plain delete there is nothing left to compare against, which is why a version check alone does not fix race 3. The writer's invalidation becomes `HSET key v <new version> tomb 1` with a short `EXPIRE`; readers treat a tombstone as a miss. In Redis a short Lua script performs the fill's compare-and-set atomically; memcached offers `gets` and `cas` for the same check.

```python
FILL_IF_NEWER = redis.register_script("""
local v, tomb = redis.call('HGET', KEYS[1], 'v'), redis.call('HGET', KEYS[1], 'tomb')
local new = tonumber(ARGV[1])
if v then
  if tomb == '1' and tonumber(v) > new then return 0 end
  if tomb ~= '1' and tonumber(v) >= new then return 0 end
end
redis.call('HSET', KEYS[1], 'v', ARGV[1], 'data', ARGV[2], 'tomb', '0')
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1
""")
```

## Invalidating from the database's log

**CDC invalidation** tails the database's log and deletes keys for every committed change, in commit order, including changes from other services, migrations and a manual `UPDATE` in `psql`, which all bypass the application's write path. Facebook's paper describes daemons (McSqueal) that tail the MySQL commit log and broadcast deletes. Because the delete arrives tens of milliseconds after commit, a slow fill that lands in between is removed, which narrows race 3 without closing it. The [change data capture lesson](/learn/big-data/streaming/change-data-capture) covers the pipeline. A "delayed double delete" (delete again a fixed interval later) is the same narrowing by hand; call it a heuristic in the design doc.

```viz
{"type": "system", "scenario": "cdc", "title": "Invalidating the cache from the database's log", "caption": "Each committed change appears in the WAL; a consumer turns it into a cache delete. Every writer is covered, including ones that bypass the application, and the consumer's lag is how long a stale entry can survive."}
```

## Stampedes, in numbers

A single hot key (the home-page feed, a popular product) expires. Every request that arrives during the recompute also misses and recomputes. With λ requests per second on the key and a recompute time δ, the expected number of concurrent recomputes is λδ. At 2,000 requests a second and a 200 ms query that is **400 copies of the expensive query at once**; a Monte Carlo run of the same numbers averaged 401. The database, sized for one such query a second, receives 400, the connection pool drains, and unrelated endpoints time out.

```viz
{"type": "system", "scenario": "cache-stampede", "requests": 40,
 "title": "One expiry, forty identical queries",
 "caption": "Every concurrent reader misses at the same instant and recomputes. Single-flight lets one request recompute while the others wait; stale-while-revalidate serves the old value during the refresh; jittered TTLs stop many keys expiring together."}
```

The fixes, from simplest:

- **Jitter TTLs** so keys filled together do not expire together (the `random.randint(0, 300)` above).
- **Single-flight.** Within a process, coalesce concurrent loads of one key (read-through libraries do it). Across processes, the first miss takes a short lock (`SET lock:key token NX PX 5000`) and recomputes; the others wait briefly or serve a stale copy.
- **Stale-while-revalidate.** Keep the value past a soft expiry, serve it while one background refresh runs, and hard-expire much later.
- **Probabilistic early refresh (XFetch).** Each reader independently refreshes a little *before* expiry, with a probability that rises as expiry approaches and with the recompute time. The rule, from Vattani, Chierichetti and Lowenstein, needs no coordination: refresh if $now - \delta \beta \ln(u) \geq expiry$ for $u$ uniform in $(0, 1]$.

```python
import math, random, time

def fetch(key, recompute, ttl, beta=1.0):
    entry = cache.get(key)              # (value, delta, expiry) or None
    now = time.time()
    # -log(u) is exponential with mean 1: refresh roughly delta * beta seconds early.
    if entry is None or now - entry.delta * beta * math.log(1.0 - random.random()) >= entry.expiry:
        start = time.time()
        value = recompute()
        delta = time.time() - start
        cache.set(key, (value, delta, now + ttl), ex=ttl)
        return value
    return entry.value
```

`1.0 - random.random()` keeps `u` in (0, 1] and avoids `log(0)`. The maths of why it works: with requests arriving at rate λ, the chance that nobody has refreshed by expiry is $e^{-\lambda\delta\beta}$, which for λ = 2,000, δ = 0.2 s, β = 1 is $e^{-400}$: effectively never. The first refresh lands a median $\delta\beta \ln(\lambda\delta\beta / \ln 2)$ = **1.27 s** before expiry. Simulating 400 expiries with those numbers gave a median lead of 1.25 s (5th–95th percentile 0.98–1.80 s) and **2.8 recomputes per expiry on average**, 12 at worst, instead of 400. For a cold key at 5 requests a second there is a 37% chance ($e^{-1}$) it expires un-refreshed, and then one request recomputes, which is harmless: stampedes need λδ well above one.

## Negative caching, warming and cache honesty

**Negative caching.** Requests for keys that do not exist miss every time and always reach the database, whether from a bug, a scraper or an attacker enumerating IDs (cache penetration). Cache the absence too, as a sentinel with a short TTL (tens of seconds, far shorter than positive entries, so a newly created row appears quickly), and delete the sentinel on insert like any other key. For enumerable key spaces a [Bloom filter](/learn/advanced-data-structures/probabilistic-structures/bloom-filters) of existing IDs rejects most absent keys before either the cache or the database.

**Warming.** A cold cache after a restart, a region failover or a key-format change sends the whole miss ratio to the database at once, the reverse of the arithmetic above. Warm before shifting traffic: replay the top keys from access logs, or let a new cache cluster read through from a warm one, as Facebook's paper describes for bringing up new clusters (with a short hold-off on deletes to close the race that introduces). Shift traffic gradually and watch database concurrency, not only the hit ratio.

**Staying honest with the database.** Write down, per cached key family, the staleness bound (the TTL, or the CDC lag if deletes are reliable), the fix that closes each race you care about, and what a user sees right after their own write. Read-your-writes needs its own mechanism: bypass the cache for that user's next reads for a few seconds, or read with a version at least as new as their write. The [consistency models lesson](/learn/system-design/building-blocks/consistency-models) names the guarantees; the cache is where they are most often lost.

## Deciding what to cache

Cache when the value is expensive to produce, read far more often than it changes, and tolerant of a staleness you can state. Be wary when:

- **the data needs immediate revocation**: sessions, permissions, entitlements. A cached "yes" outlives the revocation unless invalidation is reliable on every node, which is why this app does not cache sessions;
- **the read is already cheap**: an indexed primary-key lookup costs about one round trip, the same as the cache;
- **reuse is low**: personalised results with one reader each have low hit ratios and still cost memory;
- **the user must read their own writes** and nothing in the design guarantees it.

Size the cache from the working set, watch hit ratio and eviction rate, and bound the number of distinct keys. Most caches start from LRU eviction; the [LRU cache lesson](/learn/advanced-data-structures/caches-and-eviction/lru-cache) builds it, and [cache design considerations](/learn/advanced-data-structures/caches-and-eviction/cache-design-considerations) and the [caching strategies](/learn/system-design/building-blocks/caching-strategies) lesson cover sizing and topology.

```viz
{"type": "system", "scenario": "lru-cache", "title": "LRU eviction keeps the working set",
 "caption": "Each hit moves a key to the front; a full cache evicts from the back. A working set larger than the cache turns hits into a steady stream of evictions, which shows up as a falling hit ratio and rising database load."}
```

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A few users see an old value for up to exactly the TTL after an update | A stale fill: races 2–4; check whether the fill read a replica and where the delete sits relative to commit | Delete after commit; fill hot keys from the primary; versioned markers or leases |
| Database CPU and connections spike every time one popular key expires | Stampede: λδ concurrent recomputes, visible as a burst of identical queries | Single-flight lock, stale-while-revalidate, XFetch, jittered TTLs |
| Database load jumps tenfold after a deploy and recovers slowly | New key format or cold nodes: hit ratio fell, and load follows the miss ratio | Warm before shifting traffic; roll key-format changes gradually |
| Database load stays high although the hit ratio looks healthy | Absent keys miss every time (penetration) | Negative caching with a short TTL; Bloom filter for enumerable IDs |
| Acknowledged writes missing after a cache node restarts | Write-behind lost its unflushed window | Use write-behind only for loss-tolerant data; shorten the flush interval or persist the queue |
| Changes made by another service or a manual fix never appear | Invalidation lives only in one application's write path | CDC-driven invalidation from the database log |
| A revoked permission keeps working on some nodes | An in-process cache per instance never heard the invalidation | Do not cache revocable decisions, or broadcast invalidations and keep TTLs short |

## Interviewer follow-ups

**"You delete the key after every update. How can the cache still be stale?"** Model answer: a reader that read the old row before the commit can fill after the delete (race 3), a reader can fill from a lagging replica after it (race 4), and a delete inside the transaction lets a reader refill the old committed row (race 2). Delete after commit, add leases or versioned markers, and keep a TTL as the bound. Common wrong answer: "Redis is single-threaded, so operations cannot interleave", which is true of Redis and irrelevant to the gap between the database read and the cache write.

**"Why do leases not fix a fill from a lagging replica?"** Model answer: a lease protects against invalidations that happen after the miss; in the replica race the miss comes after the delete, so the lease is valid and the stale fill is accepted. Versioned markers fix it because the marker's version is newer than anything the replica can return. Common wrong answer: "leases make every fill safe".

**"A hot key with a 200 ms recompute is read 2,000 times a second. What happens at expiry, and what would you do?"** Model answer: about λδ = 400 concurrent recomputes; use single-flight or stale-while-revalidate for that key, or XFetch, which in simulation refreshed about 1.3 s early with about 2.8 recomputes per expiry. Common wrong answer: "make the TTL longer", which makes each expiry rarer but no smaller.

**"Should we cache sessions in Redis to take load off Postgres?"** Model answer: a session check is one primary-key lookup, about one round trip, the same as a Redis `GET`; caching it saves little and makes revocation eventual unless every logout and permission change invalidates reliably. Measure first; if you do cache, keep TTLs short and invalidate on logout. Common wrong answer: "yes, caches are always faster".

## What mid-level engineers get wrong

- **Setting the new value on write** instead of deleting, and losing a race between two writers.
- **Deleting inside the transaction**, so a reader refills the old committed row before the commit.
- **Filling from a replica** and turning sub-second lag into TTL-long staleness.
- **Adding a version check without a marker**, so a delete leaves nothing to compare against.
- **No TTL**, so every race above becomes permanent.
- **Justifying a cache by latency** for lookups the database already answers in one round trip, and ignoring what a cold cache does to the database.
- **Caching revocable decisions** such as sessions and permissions without reliable invalidation.

## Exercises

The first exercise replays the lease protocol; the second shows why a versioned marker closes the races that leases leave open.

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

```exercise
id: cache-versioned-fills
title: Close the races with versioned markers
prompt: |
  Simulate one cache key in front of a primary and a replica, and compare plain
  deletes with versioned markers.

  The primary and the replica both start at `(initial, version 1)`; the cache
  starts empty. Process `events` in order:
  - `["write", v]`: the primary commits `v` with its version plus one.
  - `["replicate"]`: the replica catches up to the primary.
  - `["read", r]` / `["read_replica", r]`: reader `r` copies the (value,
    version) of the primary or of the replica into its local variable.
  - `["invalidate"]`: in mode `"delete"` the key is removed. In mode
    `"marker"` it is replaced by a tombstone carrying the primary's current
    version.
  - `["fill", r]`: in mode `"delete"` reader `r` stores its local (value,
    version) unconditionally. In mode `"marker"` it stores it only if the key is
    empty, or holds a tombstone whose version is less than or equal to the
    reader's, or holds a value whose version is strictly less than the reader's.

  Return `{"cache": c, "stale": s}` where `c` is the cached value, or null when
  the key is empty or a tombstone, and `s` is true when `c` is not null and
  differs from the primary's value.
languages: [python, javascript]
entry: simulate_versioned
starter:
  python: |
    def simulate_versioned(initial, events, mode):
        return {"cache": None, "stale": False}
  javascript: |
    function simulate_versioned(initial, events, mode) {
      return { cache: null, stale: false };
    }
tests:
  - args: ["Ana", [["read", "A"], ["write", "Ana B."], ["invalidate"], ["fill", "A"]], "delete"]
    expected: {"cache": "Ana", "stale": true}
    label: slow fill after a delete
  - args: ["Ana", [["read", "A"], ["write", "Ana B."], ["invalidate"], ["fill", "A"]], "marker"]
    expected: {"cache": null, "stale": false}
    label: the marker rejects the slow fill
  - args: ["Ana", [["read", "A"], ["write", "Ana B."], ["invalidate"], ["fill", "A"], ["read", "B"], ["fill", "B"]], "marker"]
    expected: {"cache": "Ana B.", "stale": false}
    label: an equal version replaces the tombstone
  - args: ["Ana", [["write", "Ana B."], ["invalidate"], ["read_replica", "A"], ["fill", "A"]], "delete"]
    expected: {"cache": "Ana", "stale": true}
    label: fill from a lagging replica
  - args: ["Ana", [["write", "Ana B."], ["invalidate"], ["read_replica", "A"], ["fill", "A"]], "marker"]
    expected: {"cache": null, "stale": false}
    hidden: true
  - args: ["Ana", [["write", "Ana B."], ["invalidate"], ["read_replica", "A"], ["fill", "A"], ["replicate"], ["read_replica", "B"], ["fill", "B"]], "marker"]
    expected: {"cache": "Ana B.", "stale": false}
    hidden: true
    label: the replica catches up
  - args: ["a", [["write", "x"], ["read", "A"], ["write", "y"], ["read", "B"], ["fill", "B"], ["fill", "A"]], "marker"]
    expected: {"cache": "y", "stale": false}
    hidden: true
    label: an older fill cannot overwrite a newer value
  - args: ["a", [["write", "x"], ["read", "A"], ["write", "y"], ["read", "B"], ["fill", "B"], ["fill", "A"]], "delete"]
    expected: {"cache": "x", "stale": true}
    hidden: true
hints:
  - "Represent the cache as null or a small record of value (null for a tombstone) and version."
  - "Keep the fill rule in one boolean expression with three cases: empty, tombstone, value."
```

## Senior signals

- You justify a cache with miss-ratio arithmetic and Little's law on database load, and you check that the database survives the cache being cold.
- You delete rather than set on writes, delete after commit, and always set a jittered TTL as the bound on every race.
- You can draw all four races (concurrent sets, delete before commit, slow fill, replica fill) and say which fix closes which: leases only guard against invalidations after the miss, and versioned markers close all four.
- You compute a stampede as λδ concurrent recomputes and prevent it with single-flight, stale-while-revalidate or XFetch, and you cache negative results with short TTLs.
- You choose write-through or write-behind by durability requirement and treat a write-behind cache as a database with weaker guarantees.
- You can argue for not caching, as this app does for sessions, and you reach for versioned names and validators (immutable hashed assets, ETags) where they make invalidation unnecessary.

## Check yourself

```quiz
- q: >-
    A service handles 50,000 reads per second with a 98% cache hit ratio. A deploy changes the cache key format and the hit ratio drops to 60% for twenty minutes. How does database read load change?
  options: ["It stays near 1,000 per second, since misses refill the cache", "It roughly doubles, from 1,000 to 2,000 queries per second", "It rises by about 40%, from 1,000 to 1,400 queries per second", "It rises twentyfold, from 1,000 to 20,000 queries per second"]
  answer: 3
  explanation: >-
    Database load is proportional to the miss ratio: 2% of 50,000 is 1,000 and 40% is 20,000. Refilling does not help while every new key starts cold. Small changes in hit ratio are large changes in miss ratio, which is why key-format changes and cold starts need warming and gradual rollout.
- q: >-
    A handler runs BEGIN; UPDATE products SET price = ...; DEL product:7; COMMIT. Occasionally the old price stays cached for a full TTL. Why?
  options: ["Redis DEL runs asynchronously, so the key can outlive the transaction", "The TTL is too short, so the key is refilled before the commit lands", "A reader refills the old committed price between the DEL and COMMIT", "The DEL was sent before the UPDATE finished, so Redis ignored it"]
  answer: 2
  explanation: >-
    Until COMMIT, other transactions see the old row under MVCC, as the lab's two sessions showed. A reader that misses after the DEL reads the old price and fills the cache, and the commit then lands behind a stale entry. Delete after the commit, or invalidate from the WAL, which only carries committed changes.
- q: >-
    Cache fills read a replica that is usually a second behind. The writer deletes the key after commit, and the cache supports memcache-style leases. Some users still see an old name for an hour. Why did leases not help?
  options: ["The reader's miss came after the delete, so its lease was still valid", "Leases only work when every fill is read from the primary database", "The replica ignored the lease token that the cache issued to the reader", "Leases expire after ten seconds, which is shorter than the replica lag"]
  answer: 0
  explanation: >-
    A lease is revoked only by invalidations that happen after it was granted. Here the miss, and the lease, came after the delete, so the fill of the replica's old value was accepted. A versioned marker left by the writer rejects any fill older than the new version, whatever it was read from.
- q: >-
    Why does adding a version check to fills not, by itself, fix the slow-reader race when writers delete the key?
  options: ["Version numbers cannot be compared atomically inside a Redis script", "After a delete the key holds no version, so the stale fill is accepted", "The database increments versions only after the cache has been filled", "Readers always read the newest version, so there is nothing to reject"]
  answer: 1
  explanation: >-
    The check compares the fill's version with what the cache holds; a delete leaves nothing, so the old value goes in unchallenged. The writer must leave a tombstone carrying the new version instead of deleting; then a fill with an older version is rejected. A Lua script or memcached's cas makes the comparison atomic.
- q: >-
    A key costs 200 ms to recompute and is read 2,000 times a second. What happens when it expires, and what does probabilistic early refresh (XFetch) change?
  options: ["About 20 recomputes; XFetch cuts that to a handful per expiry", "About 400 recomputes; XFetch cuts it to about 3 at 1.3 s early", "One recompute, since the cache serialises misses; XFetch adds none", "About 400 recomputes; XFetch spreads them evenly over the TTL"]
  answer: 1
  explanation: >-
    Every request during the 200 ms recompute also misses, so about λδ = 400 run at once. XFetch lets readers refresh early with a probability that rises near expiry; for these numbers the first refresh lands a median 1.27 s early and the simulation averaged 2.8 recomputes per expiry. A remote cache does not serialise misses unless you add single-flight.
- q: >-
    This app serves hashed front-end assets with max-age=31536000, immutable, and curriculum responses with an ETag and max-age=0, must-revalidate. What makes a year-long cache safe for the assets?
  options: ["Browsers revalidate immutable responses on every reload anyway", "A changed file gets a new hashed name, so old copies are never asked for", "The server purges browser caches on deploy using the Clear-Site-Data header", "The ETag on the curriculum invalidates the assets whenever content changes"]
  answer: 1
  explanation: >-
    Versioned names make invalidation unnecessary: a new build references new file names, and the old cached ones are never requested again. index.html, which holds those names, is served with no-cache so browsers always fetch the current one. The curriculum cannot be renamed per version, so it uses an ETag over the content version, build ID and index.html, and the browser revalidates with a cheap conditional request.
```
