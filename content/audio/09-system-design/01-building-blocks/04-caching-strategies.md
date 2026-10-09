---
lesson: caching-strategies
source: 8bcb36a587b451f8
fit: great
desk:
  - "The stale-set and write-through traces, as timelines"
  - "The single-flight code, and why its two commented lines matter"
  - "Exercise: simulate LRU and LFU eviction"
---
## Introduction

A product page takes 20 milliseconds to assemble from the database, and it is requested 15 thousand times a second. That is 300 seconds of database work every second, roughly 300 cores, for data that changes a few times a day. Put a cache in front, and each request becomes a lookup of under a millisecond, and the database sees about 150 requests a second.

That is the easy part. A cache also brings in the two hardest problems in the system: what happens when the cached copy is wrong, and what happens when it is missing at the exact moment everyone wants it. Every cache decision is really a decision about staleness and about failure.

Three ideas, then. Where the hit ratio comes from and why it matters more than you think. The race that every write policy has. And what happens in the second after a hot key expires.

## The hit ratio

Here is the one formula worth carrying around. Database load is the miss rate times traffic.

With 15 thousand reads a second, a 95 percent hit ratio sends 750 reads a second to the database. At 99 percent, it sends 150. Going from 95 to 99 percent cuts database load five times, and that can be the difference between one database primary and a sharded cluster.

Notice what it does not change much: latency. The mean barely moves, from about 2 milliseconds to about 1.2. And above 90 percent hits, the 99th percentile request is a miss anyway, so faster hits do nothing for your tail.

So what decides the hit ratio? Not mostly the cache size. Real traffic is skewed: a few keys are hugely popular and a long tail is rarely read. The lesson simulated this with a standard skewed workload, called a Zipf distribution, and a cache holding 5 percent of the keys. Depending on how skewed the traffic was, the hit ratio landed anywhere from 37 percent to 89 percent. Same cache, same size.

Two more things from that simulation. Each doubling of the cache adds a roughly constant few points, so the last points are expensive. And plain least-recently-used eviction, LRU, leaves 6 to 14 points on the table compared with perfect knowledge of which keys are popular. Hold onto that; it comes back at the end.

The lesson for a design review: measure your workload's skew before you promise anyone a hit ratio.

## Cache-aside and its race

The default pattern is cache-aside. The application owns both stores. To read: check the cache, and on a miss, read the database and put the value in the cache. To write: update the database, then delete the key from the cache.

Why delete instead of writing the new value into the cache? Because two writers setting values can interleave and leave the older one cached. Two deletes cannot disagree.

But delete does not close every hole. Picture three actors: a reader, a writer, and the cache. The price is 10.

The reader misses, reads the price from the database, gets 10, and then pauses. Maybe a garbage collection pause, 50 milliseconds. While it is paused, the writer updates the price to 12, commits, and deletes the key, which is not even in the cache yet. Then the reader wakes up and puts 10 into the cache.

[pause]

The database says 12. The cache says 10, and it will keep saying 10 to every reader until the TTL expires or someone writes again. If the TTL is an hour, that is an hour of wrong prices. At 15 thousand reads a second, a reader pausing across a write is not a rare event. It will happen.

Three fixes. A short TTL bounds the damage. A versioned set only writes if the value's version is newer than the one already cached. Or leases, the way Memcached does it at Facebook, where the writer's delete cancels the reader's right to set. More on leases in a moment.

And one tempting fix is wrong: deleting first and then writing. That makes it worse, because now the window is the whole write transaction, not just a pause. A reader can miss, read the old committed value, and cache it while the write is still uncommitted.

## Write-through and write-behind

Write-through writes the cache and the database together before acknowledging, so a read right after a write hits. It sounds safer. With one writer per key, it is close to consistent.

With two writers, it has its own race. Writer A sets the price to 11; writer B sets it to 12. The cache happens to see A then B, so it holds 12. The database happens to see B then A, so it holds 11. They now disagree until the TTL, and neither writer saw an error. Write-through needs one writer per key, or some per-key ordering, to stay honest. And any write that bypasses the cache, a batch job or a migration, is invisible to it.

Write-behind goes further: write to the cache, acknowledge immediately, flush to the database later in batches. It is wonderful for counters: a thousand increments become one database write. But the cache is now the system of record for anything not yet flushed. In the lesson's trace, 550 view increments were acknowledged, 300 had been flushed, and the cache node died. 250 acknowledged writes, gone.

For view counts, that is noise. For orders, balances, or anything a user was told succeeded, it is a silent data-loss bug. If you need that throughput for important writes, put a durable log in front of the database instead.

So: cache-aside by default. Write-through when a read right after a write must hit and there is one writer per key. Write-behind only where losing the last few seconds is acceptable.

## TTLs and stampedes

A TTL is two things at once: the maximum staleness you accept, and a floor on misses. Treat it as a product decision. A price may be a minute stale. A user's own profile edit should not be stale to that user at all.

Now the failure that takes sites down. A deploy warms 100 thousand keys within a minute, all with the same one-hour TTL. An hour later they all expire within the same minute, get refilled together, and expire together again an hour after that. Forever. In the simulation, that meant about 1,700 refills a second at the peak, every hour. Adding random jitter of up to 10 percent to each TTL dropped the peak to around 300 and spread it further every cycle. Jitter your TTLs.

Worse is a single hot key expiring. The simulation: a key read 10 thousand times a second across 50 service replicas, a recompute that takes 50 milliseconds, a database with 16 worker slots. Before I give you the number: how many identical database queries does one expiry cause, with no defence?

[pause]

489. The database stayed saturated for a second and a half, and the 99th percentile reader waited almost 900 milliseconds. With a slow recompute of half a second, it was over 5 thousand queries and the database stayed saturated for 158 seconds. That is how "the cache expired and the site went down" happens.

The defences, in order of strength. Single-flight: within one process, only the first caller loads, and everyone else waits for that result. That got it down to 50 queries, one per replica. A fleet-wide lock, set with "only if not exists" and a short expiry: one query. And stale-while-revalidate: keep serving the old value while one reader refreshes it in the background. Also one query, and nobody waits at all; the 99th percentile was one millisecond.

## Hot keys and eviction

A different problem: one key that is simply too popular. A cluster puts each key on one node, and a single Redis instance tops out somewhere around 100 to 200 thousand simple operations a second. A key read half a million times a second saturates its node, however many nodes you have. Adding nodes does nothing.

The fixes: put a tiny in-process cache with a one-second TTL in front of it, so 50 replicas turn half a million reads into 50 a second, at the cost of a second of staleness. Or store the key under several suffixes and read one at random. Or serve it from the CDN.

Last, eviction. When memory fills, the cache throws something out, and LRU, least recently used, is the default. Its weakness is scans. A nightly batch job that reads 20 thousand cold keys once each pushes the entire hot set out of an LRU cache. In the simulation the hit ratio fell to 38 percent until it rewarmed. Frequency-based admission fixes it: a newcomer is only admitted if it has been seen more often than the key it would evict. The scan keys have been seen once, so they never get in. That policy held 71 percent straight through the scan, and it recovers most of those 6 to 14 points LRU leaves behind.

One aside on Redis: its LRU is approximate. It samples five keys and evicts the oldest of those, and in the simulation that cost less than half a point against exact LRU.

## In the interview

Here is a follow-up the lesson expects. Your hit ratio is 99 percent, and the cache cluster dies. What happens in the first minute?

[pause]

Database reads go from 150 a second to 15 thousand. If the database can serve 5 thousand, queues form, service threads fill up, and every request times out, not just the misses. The wrong answer is "a 1 percent degradation", which reads the hit ratio as the blast radius. The senior answer: a per-replica concurrency limit on database calls, so the requests the database can serve succeed and the rest fail fast while the cache fails over, then warm the hottest keys before letting full traffic back.

And the classic one: walk me through the race that leaves cache-aside stale. You now know it. A reader reads the old row and pauses, a writer commits and deletes, the reader sets the old value. Fix it with a short TTL, a versioned set, or leases. Do not say "delete first", which makes the window wider.

## Recap

Four things to remember. Database load is the miss rate times traffic, and the hit ratio depends on skew more than on cache size. Every write policy has a race: cache-aside's stale set, write-through's two-writer reordering, write-behind's lost acknowledgements. Jitter your TTLs, and have a stampede answer with numbers: single-flight to one query per replica, a lock or leases to one per fleet, stale-while-revalidate to nobody waiting. And design for losing the cache as an outage, not a degradation.

At your desk: the two race timelines, the single-flight code, and the eviction exercise.
