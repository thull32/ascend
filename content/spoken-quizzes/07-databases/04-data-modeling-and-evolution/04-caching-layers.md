---
lesson: caching-layers
source: d3a834ff7d86d808
---
## 1

A service handles 50 thousand reads a second with a 98 percent cache hit ratio. A deploy changes the cache key format, and the hit ratio drops to 60 percent for twenty minutes. How does database read load change?

A, it stays near 1,000 a second, since misses refill the cache. B, it rises twentyfold, from 1,000 to 20 thousand queries a second. C, it roughly doubles, from 1,000 to 2,000 queries a second. D, it rises by about 40 percent, from 1,000 to 1,400 queries a second.

[think]

The answer is B: it rises twentyfold, from 1,000 to 20 thousand.

Database load follows the miss ratio: 2 percent of 50 thousand is 1,000, and 40 percent is 20 thousand. Refilling does not help while every new key starts cold. Small changes in hit ratio are large changes in miss ratio, which is why key-format changes and cold starts need warming and a gradual rollout.

## 2

A handler begins a transaction, updates a product's price, deletes the product's cache key, and then commits. Occasionally the old price stays cached for a full TTL. Why?

A, the TTL is too short, so the key is refilled before the commit lands. B, the delete was sent before the update finished, so Redis ignored it. C, a reader refills the old committed price between the delete and the commit. D, a Redis delete runs asynchronously, so the key can outlive the transaction.

[think]

The answer is C: a reader refills the old committed price between the delete and the commit.

Until the commit, other transactions see the old row under MVCC, as the lab's two sessions showed. A reader that misses after the delete reads the old price and fills the cache, and the commit then lands behind a stale entry. Delete after the commit, or invalidate from the write-ahead log, which only carries committed changes.

## 3

Cache fills read a replica that is usually a second behind. The writer deletes the key after commit, and the cache supports memcache-style leases. Some users still see an old name for an hour. Why did leases not help?

A, the reader's miss came after the delete, so its lease was still valid. B, leases expire after ten seconds, which is shorter than the replica lag. C, the replica ignored the lease token that the cache issued to the reader. D, leases only work when every fill is read from the primary database.

[think]

The answer is A: the reader's miss came after the delete, so its lease was still valid.

A lease is revoked only by invalidations that happen after it was granted. Here the miss, and the lease, came after the delete, so the fill of the replica's old value was accepted. A versioned marker left by the writer rejects any fill older than the new version, wherever it was read from.

## 4

Why does adding a version check to cache fills not, by itself, fix the slow-reader race when writers delete the key?

A, after a delete the key holds no version, so the stale fill is accepted. B, readers always read the newest version, so there is nothing to reject. C, the database increments versions only after the cache has been filled. D, version numbers cannot be compared atomically inside a Redis script.

[think]

The answer is A: after a delete the key holds no version, so the stale fill is accepted.

The check compares the fill's version with what the cache holds, and a delete leaves nothing, so the old value goes in unchallenged. The writer must leave a tombstone carrying the new version instead of deleting; then a fill with an older version is rejected. A Lua script, or memcached's compare and swap, makes the comparison atomic.

## 5

A key costs 200 milliseconds to recompute and is read 2,000 times a second. What happens when it expires, and what does probabilistic early refresh, XFetch, change?

A, about 20 recomputes, and XFetch cuts that to a handful per expiry. B, about 400 recomputes, and XFetch cuts it to about 3, at 1.3 seconds early. C, one recompute, since the cache serialises misses, and XFetch adds none. D, about 400 recomputes, and XFetch spreads them evenly over the TTL.

[think]

The answer is B: about 400 recomputes, and XFetch cuts it to about 3, at 1.3 seconds early.

Every request during the 200 millisecond recompute also misses, so the request rate times the recompute time, about 400, run at once. XFetch lets readers refresh early with a probability that rises near expiry. For these numbers, the first refresh lands a median of 1.27 seconds early, and the simulation averaged 2.8 recomputes per expiry. A remote cache does not serialise misses unless you add single-flight.

## 6

Ascend serves its hashed front-end assets with a max age of one year, marked immutable, and its curriculum responses with an ETag, a max age of zero, and must-revalidate. What makes a year-long cache safe for the assets?

A, browsers revalidate immutable responses on every reload anyway. B, a changed file gets a new hashed name, so old copies are never asked for. C, the ETag on the curriculum invalidates the assets whenever content changes. D, the server purges browser caches on deploy, using the clear-site-data header.

[think]

The answer is B: a changed file gets a new hashed name, so old copies are never asked for.

Versioned names make invalidation unnecessary: a new build references new file names, and the old cached ones are never requested again. The index page, which holds those names, is served with no-cache, so browsers always fetch the current one. The curriculum cannot be renamed per version, so it uses an ETag over the content version, the build ID and the index page, and the browser revalidates with a cheap conditional request.
