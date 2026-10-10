---
lesson: caching-layers
source: 7ae19c1b51b41437
fit: great
desk:
  - "The four race timelines, step by step, and the table of which fix closes which race"
  - "The careful cache-aside code and the fill-if-newer Lua script"
  - "The XFetch rule, its code and its simulated numbers"
  - "This app's three caches: the compiled curriculum, hashed assets and ETags"
  - "Exercises: replay a cache race with and without leases, and close the races with versioned markers"
---
## Introduction

A team puts Redis in front of user profiles with the textbook cache-aside pattern. Read the cache, fall back to the database on a miss, fill the cache with a one-hour TTL, and delete the key whenever the profile changes. A week later, support tickets arrive. A user changed her display name, and her comments still show the old one to some people, for up to an hour. The write path deletes the key. The tests pass. The code looks right.

It is right, for every interleaving except one. A reader missed the cache and read the old name from the database a moment before the rename committed. Then it was delayed for a few milliseconds, by a garbage collection pause or a slow network hop, and wrote that old name into the cache after the writer had deleted the key. Nothing corrects it until the TTL expires. At a few thousand reads a second on a popular profile, a race with a window of milliseconds happens every day.

Every caching strategy has races like this with the database, and each race has a specific interleaving and a specific fix. So: first, whether you need the cache at all. Then four races, and which fix closes which; only one closes all four. Then the stampede, in numbers.

## The arithmetic of a cache

A cache helps in two ways: it answers faster, and it keeps load off the database. The second usually matters more. With half-millisecond hits and 5-millisecond database reads, a 90 percent hit ratio gives a mean of 1 millisecond and 99 percent gives 0.55. A modest gain.

Database load, though, follows the miss ratio. At 20 thousand requests a second, 90 percent hits sends 2,000 queries a second to the database. 99 percent sends 200. What looks like a 10 percent improvement is a tenfold cut in load. And it works in reverse: a cache that drops from 99 to 90 percent, after a deploy that changes key names, a cold restart, or an eviction storm, multiplies database load by ten at once. If the database cannot survive the cache being cold, the cache is part of your availability story, whether or not you designed it that way.

The latency argument is weaker than people assume. The lesson before this one measured a primary-key lookup on a warm Postgres at about a tenth of a millisecond, almost all of it the round trip, and a Redis get is also one round trip. Caching one indexed row saves little and adds a second system to keep consistent. Caches pay off for results that are expensive to compute: the leaderboard aggregate that took 749 milliseconds, multi-join reads, rendered fragments, permission sets, slow external APIs.

This app runs one Postgres and no Redis, and it still caches in three places, each with a named invalidation rule. The curriculum is compiled into the binary, so its invalidation strategy is "deploy". Front-end assets have a hash in their file name and are cached for a year: a changed file gets a new name, so no copy ever needs invalidating. And curriculum responses carry an ETag, so the browser revalidates with a cheap conditional request. Sessions, deliberately, are not cached: a revoked session stops working immediately, not when a TTL expires.

## Four strategies

Cache-aside: the application reads the cache, on a miss reads the database and fills the cache, and on a write updates the database and invalidates the key. Read-through has the same semantics, but a cache library does the load from a function you supply, and a good library coalesces concurrent misses for one key into one load.

Write-through sends writes through the cache, which writes the database synchronously before acknowledging. It does nothing about writes that bypass it, another service, a migration, a manual fix, and a crash between the database commit and the cache update leaves the cache stale, so it still needs a TTL.

Write-behind acknowledges from the cache and writes the database later, in batches. Four writes to one counter cost one database write. But it turns the cache into a database with a cache's durability: a node that dies before a flush loses acknowledged writes. Use it only where losing the last second is acceptable, like counters and last-seen times, and never for anything a user was told was saved.

## Four races

Now the races, with cache-aside's three deliberate rules: delete rather than set, delete after commit, and always a TTL.

Race one: two writers that set. If writers put the new value into the cache instead of deleting, two renames can commit in one order and reach the cache in the other. Writer one commits "Ana", writer two commits "Ana B." and sets it, then writer one's delayed set lands "Ana". The cache disagrees with the database until the TTL. A delete is idempotent and commutative: two deletes in any order leave the key empty, and the next reader fills it from the database. That is why cache-aside writes delete.

Race two: deleting inside the transaction. The writer begins, updates the name, and deletes the key before committing. Before I go on: what does a reader who misses right then get from the database?

[pause]

The old name. Until the commit, other transactions see the last committed version; that is MVCC doing its job, and the lab reproduced it with two sessions on Postgres 17. So the reader fills the cache with the old name, the writer commits, and the cache is stale for the full TTL. Deleting after commit closes this race.

Race three is the opening incident, and deleting after commit does not fix it. The reader misses and reads "Ana". It pauses. The writer commits "Ana B." and deletes the key, which is already empty. The reader wakes and sets "Ana". Its value was correct when it read it and wrong when it wrote it. The window is usually a millisecond, and occasionally a 200 millisecond garbage collection pause.

Race four: filling from a lagging replica. Fills often read a replica to spare the primary. The writer commits and deletes. A reader misses after the delete, reads the replica, which is 800 milliseconds behind, and fills the old name. The replica catches up, but the cache is now wrong for the full TTL. Replica lag, normally a sub-second annoyance, has become an hour of staleness. Hold on to one detail: here the reader's miss came after the invalidation.

## Which fix closes which race

Deleting instead of setting closes race one. Deleting after commit closes race two. Neither touches three or four.

Leases come from Facebook's memcache paper. On a miss, the cache hands the reader a token bound to the key. A delete invalidates outstanding tokens, and a fill carrying an invalidated token is rejected. In race three, the writer's delete revokes the token the reader got at its miss, so the stale fill fails harmlessly. But in races two and four, the reader's miss came after the delete, so its token is fresh, and the stale fill is accepted. Leases only guard against invalidations that happen after the miss.

Versioned markers close all four, because the database decides, not timing. Every update increments a version column. The writer's invalidation writes a tombstone carrying the new version instead of deleting. A fill is accepted only if its version is newer than a cached value, or at least as new as a tombstone. A stale read carries an old version, whichever of the four paths produced it, and is rejected. Notice why the tombstone matters: with a plain delete, there is nothing left to compare against, so a version check alone does not fix race three. In Redis, a short Lua script does the compare-and-set atomically, because Redis runs a script as a whole, one at a time.

Change data capture invalidation tails the database's log and deletes keys for every committed change, in commit order, including writes from other services, migrations and a manual update in a terminal, which all bypass the application. Because the delete arrives tens of milliseconds after commit, a slow fill that lands in between is removed, which narrows race three without closing it. A "delayed double delete", deleting again a fixed interval later, is the same narrowing by hand; call it a heuristic in the design doc.

And under all of them, a TTL with jitter bounds all four races. Redis never returns an expired key, so the TTL is a hard bound on how long any stale entry can be served. No TTL, and every race becomes permanent.

## Stampedes and cold caches

A single hot key expires: the home-page feed, a popular product. Every request that arrives during the recompute also misses and recomputes. The expected number of concurrent recomputes is the request rate times the recompute time. At 2,000 requests a second and a 200 millisecond query, that is 400 copies of the expensive query at once. The database, sized for one such query a second, receives 400, the connection pool drains, and unrelated endpoints time out.

The fixes, from simplest. Jitter TTLs, so keys filled together do not expire together. Single-flight: within a process, coalesce concurrent loads of one key; across processes, the first miss takes a short lock and recomputes while the others wait briefly or serve a stale copy. Stale-while-revalidate: keep the value past a soft expiry and serve it while one background refresh runs.

And probabilistic early refresh, called X-Fetch. Each reader independently refreshes a little before expiry, with a probability that rises as expiry approaches and with the recompute time. It needs no coordination. For these numbers, the first refresh lands a median of about 1.3 seconds before expiry, and a simulation of 400 expiries averaged 2.8 recomputes per expiry, 12 at worst, instead of 400. For a cold key read 5 times a second, it expires unrefreshed about 37 percent of the time, and then one request recomputes, which is harmless. Stampedes need the request rate times the recompute time to be well above one.

Two more cold-cache problems. Requests for keys that do not exist miss every time, whether from a bug, a scraper, or an attacker enumerating IDs. Cache the absence too, as a sentinel with a short TTL, tens of seconds, and delete it on insert. And a cache that comes up cold after a restart, a failover or a key-format change sends the whole miss ratio to the database at once. Warm it before shifting traffic, from access logs or from a warm cluster, shift gradually, and watch database concurrency, not only the hit ratio.

Finally, stay honest. Write down, per cached key family, the staleness bound, the fix for each race you care about, and what a user sees right after their own write. Read-your-writes needs its own mechanism, such as bypassing the cache for that user for a few seconds.

## In the interview

The follow-up the lesson expects: you delete the key after every update. How can the cache still be stale?

[pause]

A reader that read the old row before the commit can fill after the delete: race three. A reader can fill from a lagging replica after it: race four. And a delete inside the transaction lets a reader refill the old committed row: race two. Delete after commit, add leases or versioned markers, and keep a TTL as the bound. The wrong answer is "Redis is single-threaded, so operations cannot interleave". True of Redis, and irrelevant to the gap between the database read and the cache write.

And one more: should we cache sessions in Redis to take load off Postgres? A session check is one primary-key lookup, about one round trip, the same as a Redis get. Caching it saves little and makes revocation eventual, unless every logout and permission change invalidates reliably. Measure first. "Yes, caches are always faster" is the wrong answer.

## Recap

Four things to remember. Justify a cache by the miss ratio, because database load follows it: 99 to 90 percent hits is ten times the load, so make sure the database survives a cold cache. Delete rather than set, delete after commit, and always set a jittered TTL as the bound on every race. Know the four races and their fixes: leases only guard against invalidations after the miss, and versioned markers with a tombstone close all four. And a hot key's stampede is its request rate times its recompute time, 400 in the example; prevent it with single-flight, stale-while-revalidate or X-Fetch.

At your desk: the four race timelines and the fix table, the careful cache-aside code and the fill-if-newer script, the X-Fetch rule and its numbers, this app's three caches, and the two exercises on leases and versioned markers.
