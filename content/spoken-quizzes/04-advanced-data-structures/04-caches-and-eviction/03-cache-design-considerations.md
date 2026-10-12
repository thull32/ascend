---
lesson: cache-design-considerations
source: f1365b35319d5de2
---
## 1

A cache in front of a 50 millisecond backend has a 90 percent hit ratio, with 1 millisecond hits. What happens to the 99th percentile latency, compared with no cache?

A, it drops to about 1 millisecond, because 90 percent of requests are now hits. B, it stays near 50 milliseconds, since 1 request in 10 is still a miss. C, it drops to about 5.9 milliseconds, the weighted mix of hits and misses. D, it drops to about 45 milliseconds, since hits pull the tail down by 10 percent.

[think]

The answer is B: it stays near 50 milliseconds, since 1 in 10 is still a miss.

The 99th percentile is the slowest request in a hundred, and with 10 misses per hundred, it is a miss, costing the backend's latency. 5.9 milliseconds is the average, not a tail percentile. The tail only improves once the miss ratio is below 1 percent.

## 2

Improving the hit ratio from 99 percent to 99.9 percent looks like a change of under one percent. What does it do to the backend load?

A, reduces it by about 90 percent. B, reduces it by about 1 percent. C, no measurable change. D, reduces it by about 10 percent.

[think]

The answer is A: it reduces it by about 90 percent.

Backend load is the miss ratio times the traffic. Misses go from 1 percent to 0.1 percent, a tenfold reduction, so 90 percent of the backend's remaining load disappears.

## 3

All the entries were written during a deploy, with the same 10-minute TTL. What do you expect, and what is the fix?

A, a miss storm every 10 minutes; add random jitter to each TTL. B, a stampede on a single hot key; lock around its refill. C, memory grows without bound; add LRU eviction on top. D, nothing unusual, since each key's TTL is tracked independently.

[think]

The answer is A: a miss storm every 10 minutes; add random jitter to each TTL.

Entries written together expire together, and the backend sees the full load for a moment every period. Spreading the TTLs by plus or minus 10 percent flattens the expiries into a steady trickle. It is every key expiring at once, not one hot key, so a per-key refill lock does not spread the load.

## 4

With probabilistic early expiration, beta is 1 and the recompute time, delta, is 50 milliseconds. Roughly how likely is a single request to trigger a refresh 100 milliseconds before the entry expires, and 1 second before?

A, about 50 percent and about 5 percent, because the probability falls linearly with the time remaining. B, about 2 percent at both, because the probability is a fixed constant per request. C, about 100 percent at both, because every request refreshes once the entry is within its TTL. D, about 13 percent and about zero, because the probability decays exponentially with the distance to expiry, measured in deltas.

[think]

The answer is D: about 13 percent, and about zero.

The refresh probability is e to the minus the remaining time over beta times delta. That is e to the minus 2, about 13.5 percent, at 100 milliseconds, and e to the minus 20, effectively zero, at 1 second. That shape is the point: nobody refreshes early in the TTL, someone almost surely refreshes in the last couple of deltas, and the herd never forms.

## 5

Which situation is a good candidate for negative caching?

A, a fetch for a user that failed because the backend timed out. B, a user whose record changes too often to cache the value itself. C, a lookup for a user ID the database confirmed does not exist. D, every miss, so repeated misses stop reaching the backend.

[think]

The answer is C: a lookup for a user ID the database confirmed does not exist.

Cache only definitive absences, with a short TTL, so repeated requests for missing keys stop reaching the backend. Caching a timeout as an absence makes the outage sticky, which is also why caching every miss is wrong.

## 6

In cache-aside, a reader misses and fetches the old value. A writer then updates the database and deletes the cache key. Finally, the reader writes its value into the cache. What is the result, and what is a real fix?

A, the delete is lost; update the cache on writes instead of deleting. B, a lost database write; wrap the read and the write in a transaction. C, a stale value cached until the next write; use leases, or a short TTL. D, correct behaviour, because the writer's delete ran after the read.

[think]

The answer is C: a stale value cached until the next write; use leases, or a short TTL.

The slow reader's refill lands after the delete and revives the old value. Facebook's memcache leases reject a set whose token was invalidated by a delete in between, and a short TTL bounds how long the stale value survives. Updating the cache on writes has its own race, since concurrent writes can reach the cache in the opposite order from the database.
