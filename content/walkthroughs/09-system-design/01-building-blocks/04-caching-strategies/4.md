---
lesson: caching-strategies
viz: One expiry, forty identical database queries
frames: 13
source: 8ddd20ea3a2f27e7
---
@0
This is a cache stampede, also called a dog-pile. A single popular key lives in the cache, and the database behind it is sized for the trickle of misses a healthy cache lets through.

@1
The key's time to live runs out, and it vanishes from the cache. Nothing else has changed: 40 requests a second are still asking for it.

@2
Forty requests arrive in the same instant.

@3
Each one checks the cache first, exactly as cache-aside says it should.

@4
And each one misses, because nobody has put the value back yet. Every request now independently decides to rebuild it.

@5
So the database, sized for about one query a second on this key, receives 40 copies of the same expensive query at once. Latency climbs, the connection pool drains, and queries that have nothing to do with this key start waiting too.

@6
Eventually all 40 return the same answer, and all 40 write the same value back into the cache. Thirty-nine of those queries were wasted work, and this pile-up is exactly where cascading failures tend to start.

@7
The first fix is to coalesce. The first request to miss takes a short lock on the key, and everyone else waits for its result instead of querying.

@8
One request wins the lock with a set-if-not-exists. The other 39 see the lock and wait briefly, or serve a stale copy if one is still around.

@9
Only the lock holder goes to the database.

@10
It writes the fresh value and releases the lock, and the waiters read it from the cache. The database saw 1 query instead of 40.

@11
Two more defences. Serve the stale value while a single background refresh runs, so nobody waits at all. And add random jitter to expiry times, so thousands of keys warmed by the same deploy never expire in the same second.

@12
Each fix has a price. The lock adds a round trip and a short wait on every miss, and serving stale data means readers briefly see an old value. Both are far cheaper than a database that falls over under 40 times its normal load.
