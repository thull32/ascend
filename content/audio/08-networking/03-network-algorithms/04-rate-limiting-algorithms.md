---
lesson: rate-limiting-algorithms
source: b9fe8922ec82bf8a
fit: partial
desk:
  - "The six-limiter timeline: nine requests against three per ten seconds"
  - "The derivation of GCRA from the token bucket"
  - "Ascend's quota table, the conditional upsert and the budget hold trace"
  - "The Redis Lua script, and the comparison and failure-mode tables"
  - "Exercises: simulate a token bucket, and GCRA with an exact Retry-After"
---
## Introduction

A credential-stuffing botnet starts hitting your login endpoint at 2 thousand requests a second from a few hundred IP addresses. Somewhere else, a mobile release ships with a retry loop that has no backoff. In each case you need to cap how fast one key, an IP address, a user, an API key or a tenant, can consume a resource, without breaking the normal user whose page load fires eight requests in 200 milliseconds. The decision has to take microseconds, cost a few bytes of state per key, and ideally hold across every instance of your service.

There are only a handful of algorithms, and they differ in three places: what happens at window boundaries, how much memory each key costs, and whether a burst is let through, queued, or refused. After the algorithms: one timestamp that does the work of a token bucket, how Ascend itself limits requests across replicas, and how to do it across a fleet with Redis.

## What a limiter decides

Every limiter is a handful of choices. The key: whose budget is this? Per IP is cheap and needs no login, but everyone behind one office NAT shares it. Per user or API key is fairer, but only works after authentication. The rate, such as 5 a second. The burst: how many may arrive at once after a quiet period. The action: reject with a 429, delay by queueing, or shed load with a 503. And the scope: one process, or the whole fleet.

Here is the point to take into any design review. "100 per minute" is not a specification until you say whether all 100 may arrive in the first second. Two limiters with that label can admit anything from 100 to 200 in one minute.

## Windows and logs

The fixed window counter divides time into windows and counts requests per key per window. It costs one counter, and it has a boundary problem. With 100 a minute, a client sends 100 requests half a second before the minute turns and 100 more just after: 200 in 0.6 seconds. Worse, every rejected client learns that its budget resets at the top of the minute, so they all retry at the same instant. Fixed windows are right when only the total matters: a daily quota, a monthly bill.

The sliding window log keeps the timestamp of every accepted request, and admits a new one only if fewer than the limit fall within the last window. It is exact, the only exact limiter here. But its memory grows with the limit: 10 thousand per hour means up to 10 thousand timestamps per key, and in a Redis sorted set, a million active keys at that limit is hundreds of gigabytes.

The sliding window counter is the compromise. Keep two counts, this window's and the last one's, and assume the last window's requests were spread evenly. The estimate is the previous count, weighted by how much of the previous window still overlaps the sliding one, plus the current count. With a limit of 100, 84 requests last minute and 36 so far, 15 seconds into this minute: three quarters of 84 is 63, plus 36 is 99. Admitted. Two integers per key, no boundary burst, and an error that runs in both directions, because real traffic is not evenly spread.

## Buckets

The token bucket holds at most b tokens and gains r every second. Each request takes one, and with none left, it is rejected. Nothing adds tokens on a timer. The bucket stores a token count and a timestamp and refills lazily when a request arrives, using a monotonic clock so that a wall-clock jump cannot mint tokens.

Its guarantee is precise: in any interval of length T it admits at most b plus r times T requests. With a burst of 10 and 5 a second, that is at most 30 in any four seconds, and a client sending steadily at 5 a second never notices the bucket.

The leaky bucket names two different algorithms, so always ask which one someone means. As a queue, requests wait in a fixed-size line that drains to the backend at exactly r a second, and arrivals that find it full are dropped. The output is perfectly smooth, and the burst becomes latency. As a meter, a counter fills by one per request and leaks at r: the token bucket upside down, with identical decisions.

The lesson runs six limiters, all set to three requests per ten seconds, over one timeline of nine requests. The fixed window lets five requests through in five seconds, because three of them fall in a fresh window. The sliding log admits the fewest, five of the nine, because it is exact. The token bucket admits seven, including four within four seconds: the three-token burst plus refill. And the leaky queue drops only one request but delays another by 9.3 seconds, which is past many clients' timeouts.

## GCRA: the bucket in one number

The generic cell rate algorithm, GCRA, comes from ATM networks. It makes the same decisions as a token bucket while storing a single timestamp per key: the theoretical arrival time, which is the moment the bucket would be full again if nothing else arrived.

The rule fits in a breath. Call one over the rate the emission interval, and call the burst minus one, times that interval, the tolerance. A request is rejected if the theoretical arrival time is more than the tolerance ahead of now. Otherwise it is admitted, and the theoretical arrival time moves one interval later, starting from now if it had fallen behind.

Work it once. Ten per minute with a burst of 10: the interval is 6 seconds and the tolerance is 54. Ten requests at time zero each push the arrival time forward 6 seconds, to 60. An eleventh at time zero finds it 60 seconds ahead, more than 54: rejected. When could it come back?

[pause]

At 60 minus 54: 6 seconds. That is the payoff. Every rejection computes an exact Retry-After for free. And one 64-bit value per key can be updated with a compare-and-swap loop and no lock.

## How Ascend limits requests

Ascend's own API limits in three layers, and reviews found gaps in two of them.

The first gap: every bucket used to live in each replica's memory. Behind a round-robin balancer, N replicas gave every key N times its limit, including the 10 password guesses a minute that stand between a distributed attacker and one learner's password. Scaling out quietly loosened security. Now the security buckets keep GCRA but store each key's theoretical arrival time in Postgres, checked and updated by one conditional upsert, whose WHERE clause is GCRA's admission test. Two replicas racing for a key's last slot queue on the row lock, and the second sees the first one's update. The database's clock is the only clock, so skew between replicas never enters the arithmetic. And if Postgres is unreachable, these limits fail closed, because they guard passwords and spend. The general bucket, a loose 1,200 a minute per IP, stays in memory on purpose: N times a loose limit is fine.

The second gap: every login attempt for an account shared one bucket, so anyone who knew a learner's email address could send ten wrong passwords a minute and keep the owner waiting indefinitely. The fix is OWASP's device cookie pattern. A browser that has signed up or logged in successfully gets a random token. Logins from a device known for that account are charged to that device's own bucket, and every unknown device shares the account's bucket, the only one an attacker can exhaust. The key choice follows one question: what must an attacker vary? Password guesses are charged to the account, so a thousand addresses buy no extra guesses.

The third layer caps cost: a daily budget per user for calls to the AI model. The first version read the day's usage and incremented it in a second statement, so two requests at 119 of 120 both read 119 and ended at 121. The fix works like a card authorisation hold. In one transaction, lock the day's row, check committed usage plus other calls' holds, hold this call's estimate, and lower the call's output limit to what is left. The hold settles with actual usage, or releases itself if it is dropped. A test fires 30 reservations at a limit of 10 and asserts that exactly 10 succeed. A race fixed without a concurrent test is a race you believe you fixed.

## Across a fleet

With N instances, there are three designs. Divide the limit, with each instance enforcing a share: no coordination, and wrong whenever traffic is uneven or the autoscaler changes N. Centralise the state in Redis, updated atomically per request. Or go hybrid: each instance leases a batch of tokens from the store and returns only when the lease runs out.

The centralised version needs two things. Atomicity: a read, a decision in the application and a write interleave across servers, so two instances both see one token and both admit. Put the read, the decision and the write in one Lua script, which Redis runs to completion before any other command. And one clock: if each server passes its own time, skew becomes rate error of about the skew divided by the emission interval. 100 milliseconds of skew is two requests on a 1,200-a-minute limit, and nothing on a 10-a-minute one. Reading Redis's own time inside the script gives every decision one clock. Then decide, before the first outage, whether the limiter fails open, which suits abuse protection, or closed, which may suit a paid quota.

And remember that a rate limit does not bound concurrency. At 100 requests a second, if a slow dependency makes each one take 30 seconds, that is 3 thousand in flight by Little's law, and your threads and pools are gone. Mature APIs run a concurrency limiter beside the rate limiter.

## In the interview

A follow-up the lesson expects. Design a limiter for 10 thousand requests a second per API key, across 40 gateway instances.

[pause]

GCRA or a token bucket in a sharded Redis, one key per API key, updated by a script that reads the server's clock. Add leased token batches if Redis round trips dominate, fail open for abuse limits, and put a concurrency limit beside it. The wrong answer is "each gateway allows 250 a second", which breaks under uneven balancing and autoscaling.

And: why not check the limit and increment it in two Redis commands? Because concurrent requests interleave between them and all pass. The check and the write must be one atomic step, a script or a conditional update. "Redis is single-threaded, so it is already atomic" is true per command, and false across two.

## Recap

Four things to remember. Never accept "100 per minute" without the burst, the key and the action. Fixed windows let double through at the boundary, sliding logs are exact but cost memory, sliding counters approximate in both directions, and a token bucket admits at most the burst plus the rate times the interval. GCRA is the token bucket in one timestamp, with an exact Retry-After for free. And across a fleet, the check and the update are one atomic step reading one clock, with fail-open or fail-closed decided in advance.

At your desk: the six-limiter timeline, the GCRA derivation, Ascend's upsert and budget hold trace, the Redis script, and the token bucket and GCRA exercises.
