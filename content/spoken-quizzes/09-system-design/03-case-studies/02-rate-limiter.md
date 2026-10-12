---
lesson: rate-limiter
source: 8c43eb4bebbed801
---
## 1

A fixed-window limiter allows 100 requests per minute. What is the most requests a client can get through in any two-second interval?

A, 150. B, about 103. C, 100. D, 200.

[think]

The answer is D: 200.

The client sends 100 at the end of one window, and 100 at the start of the next. The counter resets at the boundary, so 200 requests land within two seconds. 100 is what the limit promises, not what fixed windows enforce, and this boundary problem is what sliding windows and token buckets avoid.

## 2

A sliding window counter has a limit of 100 a minute. The previous minute counted 84 requests, the current minute has 36, and you are 15 seconds into the current minute. What does the limiter decide for the next request?

A, reject, because 84 plus three quarters of 36 is 111, over 100. B, reject, because 84 plus 36 is 120, over the limit. C, allow, because only the current window's 36 requests count. D, allow, because 36 plus three quarters of 84 is 99, under 100.

[think]

The answer is D: allow, because 36 plus three quarters of 84 is 99, under 100.

45 of the previous window's 60 seconds still overlap the sliding window, so the previous count is weighted by three quarters, and the current count is taken in full: 36 plus 63 is 99. Summing both raw counts over-penalises the client, and applying the weight to the current window instead of the previous one gets the formula backwards.

## 3

Two gateway nodes check the same API key at the same instant. Both read one token from Redis, both admit, and both write zero tokens back. What is the correct fix?

A, wrap every check in a distributed lock acquired from the same Redis. B, run the read, refill, decide and write as one atomic server-side script. C, route all traffic through one gateway, so only one process decides. D, shorten the TTL on the bucket key, so stale token counts expire sooner.

[think]

The answer is B: run the read, refill, decide and write as one atomic server-side script.

The bug is a non-atomic read-modify-write. A Lua script runs without interleaving in Redis, which fixes it at the cost of one round trip. A distributed lock would also serialise the check, but it adds several round trips and a new failure mode. A single gateway removes the race by removing the scale, and the TTL has nothing to do with the race.

## 4

The Redis cluster behind the limiter is unreachable. Which policy is best?

A, fail closed for every rule, so no client can exceed any of its limits. B, fail open for every rule, since API availability matters most of all. C, queue requests at the gateway until the Redis cluster is reachable again. D, fail open through local buckets for fairness limits, and closed for security limits.

[think]

The answer is D: fail open through local buckets for fairness limits, and closed for security limits.

Fairness limits exist to share capacity, and a few approximate minutes through a local fallback bucket beat an API outage. Login and one-time-code limits exist to stop brute force, and admitting those unmetered opens exactly the window an attacker wants, so they fail closed, or fall back to a strict local limit. Failing open for everything misses that distinction, and queueing turns the outage into latency and memory growth.

## 5

An abusive client sends 40,000 requests a second against a limit of 100 a second, spread over 200 gateways. What effect does adding a 50 millisecond denial cache on each gateway have?

A, Redis calls fall about tenfold, but the client now gets about 20 times its limit. B, the client is starved below its limit, because gateways stop checking. C, Redis calls stay the same, since every single request must still be counted. D, Redis calls fall about tenfold, and the client is admitted exactly as before.

[think]

The answer is D: Redis calls fall about tenfold, and the client is admitted exactly as before.

Each gateway re-checks the key at most 20 times a second while denied, so the shard sees about 200 times 20, or 4,000 calls a second instead of 40,000; the simulation measured 3,780. Those checks still find every token as it refills, so admission stays at the bucket's 100 a second, plus its initial burst. Rejected requests do not need to reach Redis to be rejected, and nobody is starved.

## 6

Three regions replicate per-region counters to each other with 100 milliseconds of lag. A client sends 1,000 requests a second to each region, against a global limit of 100 a second. Roughly how many requests a second get through?

A, about 200, since only the remote regions overshoot. B, about 100, since the lag only delays convergence. C, about 300, since each region spends the whole limit. D, about 110, since the overshoot is the lag times the limit.

[think]

The answer is C: about 300, since each region spends the whole limit.

At 1,000 a second, a region exhausts 100 tokens in 100 milliseconds, before it hears about the other regions' admissions, so each region admits the full limit: about 300 a second, as simulated. A per-key budget split between regions avoids this, at the cost of under-admitting when traffic shifts between regions.
