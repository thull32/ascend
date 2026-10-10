---
lesson: cache-design-considerations
source: ceb844484983fdef
fit: great
desk:
  - "The hit-ratio table with average, backend load and 99th percentile"
  - "The stampede counted in time slices, and the probabilistic early-expiry formula with its probability table"
  - "The Redis, memcached and EVCache details, and the failure-modes table"
  - "Exercises: a TTL cache with lazy expiry; count backend calls during a stampede"
---
## Introduction

You put a cache in front of the database. Average latency dropped from 40 milliseconds to 6, and everyone was pleased. Then two things happened.

The 99th percentile did not move, because one request in ten still went to the database, and the 99th percentile is the slowest request in a hundred. And at 9 on Monday morning, a popular key's TTL expired under peak traffic. Four thousand requests missed at the same moment, all four thousand queried the database for the same row, and the database, sized for a tenth of the traffic because "the cache handles the rest", fell over. The cache had not failed. It did exactly what it was configured to do.

The data structure inside a cache is the easy part. This is about the numbers and failures around it. Three ideas: what a hit ratio actually buys you, how to survive the moment a hot entry expires, and when a cache makes your system worse.

## The hit-ratio arithmetic

Two formulas, in words. Average latency is the hit ratio times the hit latency, plus the miss ratio times the miss latency. And backend load is the miss ratio times traffic.

Take 1 millisecond hits, 50 millisecond misses, and 10 thousand requests a second. At 90 percent hits, the average is 5.9 milliseconds and the backend sees a thousand requests a second. At 99 percent, 1.5 milliseconds and a hundred requests a second.

The first lesson is that backend load depends on the miss ratio, not the hit ratio. Going from 90 to 99 percent hits does not improve things by 10 percent. It cuts backend traffic ten times. Every additional nine removes 90 percent of the remaining load. So going from 99 to 99.9 percent, which sounds like nothing, removes 90 percent of what the backend was still doing.

The second lesson is the one from the introduction. Before I say it: at a 95 percent hit ratio, where is the 99th percentile?

[pause]

Still at the database's latency. Five requests in a hundred miss, so the slowest one in a hundred is a miss. The tail does not move until the miss ratio drops below the tail percentile: under 1 percent for the 99th, under a tenth of a percent for the 99.9th. If your objective is on a tail percentile, quote the miss ratio in the design review, not the hit ratio. And "add more cache nodes" does not fix it; that changes capacity, not the miss ratio. You either push hits past 99 percent, or hide the miss latency, with stale-while-revalidate or prefetching.

## Sizing

Hit ratio grows with cache size, but with diminishing returns. Real access is roughly Zipfian: a few keys are very popular, and a long tail is rare. With the standard skew over 100 thousand keys, the top 1 percent of keys get 62 percent of requests, and the top 10 percent get 81. So a cache holding 1 percent of the keys serves most of the traffic, and holding ten times more buys only 19 more points.

Do not guess the curve; measure it. Replay a sample of the access log through a simulated cache of increasing sizes and plot hits against size. That is a miss-ratio curve. The knee is your working set. Capacity beyond it is wasted memory. Capacity below it is a hit ratio that collapses at the slightest change in traffic.

And count bytes, not entries. A Redis key with a short string value costs roughly 50 to 100 bytes beyond the payload. So a million 20-byte values is not 20 megabytes; it is closer to 100. memcached adds its own twist: memory is carved into slab classes by value size, and if your value sizes shift, one class can starve while another sits empty. The hit ratio drops although the cache is not full. That is called slab calcification.

## TTLs and jitter

A TTL is a statement about how stale a value may be. Pick it from the product, how long may a user see an old price, not from a default.

A TTL is also load smoothing, and that is where it bites. You deploy at 9, the cache warms in the first minute, and everything gets the same 10-minute TTL. At 10 past, everything expires within the same minute. The backend sees a full miss storm every ten minutes, synchronised by your deploy. The fix is jitter: spread each entry's TTL by about 10 percent either way, and the miss rate goes flat.

Expiry is usually lazy: an entry stays until someone reads it and finds it dead, so the size overstates the live entries and dead ones hold memory. Redis pairs that with an active sampler: ten times a second it takes 20 random keys with TTLs, deletes the expired ones, and repeats while more than 10 percent of the sample was expired.

## Stampedes, counted

Now the Monday incident: a cache stampede, also called a thundering herd. A hot key gets 4 thousand requests a second. The backend takes 50 milliseconds. The entry expires. Every request that arrives before the first refill misses, and every miss calls the backend for the same value. 4 thousand a second for 50 milliseconds is 200 identical queries in flight, on a backend sized for ten.

Three families of fix, and a senior answer names all three and picks one.

First, request coalescing. The first miss for a key registers an in-flight load; later misses for the same key wait for its result instead of issuing their own. Go's single-flight package does exactly this, and so do Guava's and Caffeine's loading caches. One backend call per key per expiry, whatever the request rate. The cost: waiters still see the backend latency. And in a distributed cache, either the lock is distributed too, a Redis set-if-not-exists with a short expiry, or you accept one load per application instance, which for 50 instances is 50 calls rather than 200.

Second, serve stale while refreshing. Keep the old value past its logical TTL, let one request refresh it in the background, and give everyone else the stale value. HTTP has this built in as the stale-while-revalidate directive, CDNs implement it, and Caffeine's refresh-after-write does it in-process. Nobody waits, and the backend sees one call.

Third, probabilistic early expiration, from the XFetch paper. Instead of everyone agreeing the entry dies at one moment, each request independently decides to refresh a little early, with a probability that rises as the deadline approaches. The probability falls off exponentially with the time remaining, measured in units of the recompute time. With a 50 millisecond recompute: 100 milliseconds before expiry, a given request refreshes about 13 percent of the time. One second before, effectively never. In the last couple of recompute times, someone almost certainly refreshes, and the new value pushes the deadline forward before the herd forms. No locks, no coordination. Combine it with coalescing and the early refreshers collapse to one.

The three compose. A CDN edge typically does stale-while-revalidate plus coalescing at the origin; a Redis-backed application cache does a lock with a stale fallback.

And the worst stampede of all is the cold cache. When a cache node restarts or a new cluster goes live, every key is missing at once, and the backend gets the full uncached load. The reason you have a cache is that the backend cannot take that load, so the cache never warms. Warm it from a snapshot or a peer before taking traffic, ramp traffic gradually, or rate-limit misses so the backend degrades instead of collapsing.

## Negative caching, hot keys and invalidation

A miss for a key that does not exist is the most expensive miss: there is nothing to store, so every request for it goes to the database. A client requesting random IDs bypasses your cache entirely. Cache the absence: a "not found" marker with a short TTL. DNS resolvers have done it for decades. The trap is caching a timeout as an absence, which makes an outage sticky for the TTL after the backend recovers. Cache only definitive absences, with a shorter TTL than positive entries.

Hot keys. A distributed cache puts each key on one node. A 100 kilobyte value on a 10 gigabit link caps that node at about 12,500 reads a second of that key, whatever its CPU. Replicate the key under several suffixes and read one at random, add a small in-process cache in front, or use client-side caching with server-pushed invalidation. Find hot keys with a count-min sketch over the request stream, not the slow log, which shows slow commands, not frequent keys.

Invalidation. On a write, delete the key rather than updating it, because two concurrent writes can reach the cache in the opposite order from the database. But delete has its own race: a reader misses and reads the old value, a writer updates the database and deletes the key, and then the slow reader writes its stale value into the cache, where it lives until the next write. Facebook's fix is leases: the cache hands the missing reader a token, a delete invalidates it, and a set with a stale token is rejected. Cheaper options are a short TTL to bound the damage, or a delayed second delete.

## When a cache makes things worse

Below about 50 percent hits, every miss pays a cache round trip plus the backend, and the average can exceed the uncached one. A 5 megabyte value in Redis blocks its single-threaded command loop while it is serialised. A cache the backend cannot live without is not an optimisation; it is a dependency with its own availability. A 10-minute TTL in front of a feature-flag service means your kill switch takes 10 minutes to work. Every TTL is a promise about staleness; write it down.

## In the interview

A follow-up the lesson expects. A key gets 4 thousand requests a second and its TTL has just expired. Walk me through what happens, and how you stop it.

[pause]

With a 50 millisecond backend, about 200 identical queries pile up before the first refill. Coalesce with a per-key in-flight map or a distributed lock; or serve stale while one request refreshes; or use probabilistic early expiry so one request refreshes a little before the deadline. The wrong answer is "make the TTL longer", which only delays the stampede.

And the one that shows judgement: when would you remove a cache? When its hit ratio is below break-even, when the staleness it adds breaks a product promise, or when it has become load-bearing with no plan for being cold. "Never, caches only help" is the wrong answer.

## Recap

Five things to remember. Backend load is the miss ratio times traffic, and each extra nine removes 90 percent of what is left. The tail only moves when misses are rarer than the percentile. Jitter every TTL. Have a stampede answer with numbers: 200 duplicate calls at 4 thousand a second and 50 milliseconds, fixed by coalescing, stale-while-revalidate, or early expiry, and plan for the cold cache. And cache only definitive absences, and delete on write, guarding the refill race with leases or a short TTL.

At your desk: the hit-ratio table, the stampede counted in time slices and the early-expiry probabilities, the Redis, memcached and EVCache details, and two exercises, a TTL cache with lazy expiry and counting backend calls in a stampede.
