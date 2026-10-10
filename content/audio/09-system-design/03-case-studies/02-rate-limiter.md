---
lesson: rate-limiter
source: 953acd270f8bb689
fit: great
desk:
  - "The sizing tables and the gRPC check and response formats"
  - "The token bucket function and the Lua script, line by line"
  - "The single-request trace and the Redis failover timeline"
  - "Exercise: replay a token bucket"
---
## Introduction

A public API serves 10 million API keys through 200 gateway nodes. Sooner or later a customer's retry loop sends 40 thousand requests a second, a scraper rotates through thousands of IP addresses, or an internal batch job forgets to throttle itself. Without a rate limiter, each of those degrades the service for everyone else.

A badly designed limiter is worse, in a quieter way. It adds a synchronous dependency to every request. When the limiter slows down, the API slows down. When it fails, the API fails.

So the problem is this: make a correct-enough decision per request in well under a millisecond, consistently across hundreds of nodes that each see a slice of one client's traffic, without the limiter ever being on the critical failure path. The algorithm is the easy part, and it is where most candidates spend their time. Senior candidates spend theirs on three things, and they are the three deep dives: choosing the algorithm quickly, making one limit hold across 200 nodes, and failing safely.

## Requirements and the numbers

The requirements. Limit by identity: API key, user, or client IP for anonymous traffic. Several rules per request, for example 100 a second with bursts to 200 per key, 10 a minute on the payments endpoint, and a thousand a minute per anonymous IP prefix. A request is rejected if any rule rejects it, with a four-twenty-nine, too many requests, plus a Retry-After header. Rules change live within 30 seconds, and new rules can run in shadow mode, logging would-be rejections without enforcing them. Monthly billing quotas are out of scope: exact, durable counting belongs in a metering system.

The non-functional side. Under 1 millisecond added at the 99th percentile for local decisions, under 2 when shared state is consulted. Accuracy within about 10 percent for protective limits, and for contractual limits, never reject a customer below their limit, so when in doubt, admit. And the limiter is never the reason the API is down.

The scale: a million requests a second at peak, three regions, 200 gateways, 10 million keys, about three rules each. That is 30 million counters. At about 100 bytes each, 3 gigabytes. Memory is trivial.

What is not trivial is round trips. One atomic check per request is a million calls a second to shared state. A primary handles on the order of 50 to 100 thousand short scripts a second, so the design starts at 16 Redis primaries and 16 replicas.

Two alternatives die right here. A sliding log, which stores one timestamp per request, is exact, but a thousand-a-minute rule costs 60 kilobytes per key: 60 gigabytes for a million keys, against 100 megabytes of buckets. And local-only limiting, splitting the limit across nodes, turns 100 a second into half a request a second per node. A burst of 200 becomes one per node, and any load-balancer imbalance becomes a false rejection.

Here is the design sentence. Memory is trivial and round trips are the cost, so the question is how many requests must touch shared state, and the answer should be far below a million a second.

The architecture, in words. Each gateway runs a local tier in process: coarse limits per IP prefix and per upstream service, plus a denial cache, decided in nanoseconds with no network. Behind it, a shared tier in Redis Cluster for per-key rules that must agree across nodes. Rules come from a configuration service that pushes versioned bundles, off the request path. A request that fails locally never touches Redis, which is exactly what you want during an attack, because floods are what fail the local checks.

## Deep dive one: the algorithm

Fixed windows are cheap: one increment and an expiry. Their flaw is the boundary. With 100 a minute, a client sends 100 in the last second of one minute and 100 in the first second of the next: 200 in two seconds, double the designed load.

The sliding window counter fixes that with two integers. Keep the current and previous window's counts, and weight the previous one by how much of it still overlaps. Say the limit is 100 a minute, the previous minute had 84, the current has 36, and you are 15 seconds in, so three quarters of the previous window still overlaps. 36 plus three quarters of 84 is 99. Under 100, so allow. It assumes the previous window's requests were evenly spread, which is fine for per-IP limits.

The token bucket is the default for per-key limits, because its two parameters match how clients behave. Capacity is the largest burst. Refill rate is the sustained average. And refill is lazy: on each arrival, add elapsed time times rate, capped at capacity.

Capacity is a product decision with a measurable effect. Take a client averaging 80 a second under a 100 a second limit, but sending each second's 80 requests in the first 200 milliseconds. With a capacity of 20, half its requests were rejected. With 50, 14 percent. With 100 or more, none. Same average, same limit; the capacity alone decides whether the customer files a ticket.

GCRA is the same token bucket stored as a single timestamp, the theoretical arrival time of the next conforming request. Half the state, and no floating-point token count. The choice: token bucket, or GCRA, per key; sliding window counter per IP; sliding log only for very low limits like login attempts.

## Deep dive two: one limit across 200 nodes

Two gateways handle the same key in the same millisecond. Both read one token, both admit, both write zero. Two requests on one token, and at 5 thousand requests a second per node, that happens constantly for any busy key.

The fix makes the read, decide and write atomic inside the store: a short Lua script that Redis runs without interleaving. It reads the store's own clock, so gateway clock skew cannot mint tokens. All of one client's buckets share a hash tag, so they live in one slot, and one script checks every rule and consumes from all of them only if every rule admits. Otherwise a client over one limit keeps burning its other budgets on rejected requests. Traced, the whole check took about 0.45 milliseconds of the 2 millisecond budget, and the network round trip was 90 percent of that.

Keep the script small. Redis runs it on its single command thread, so a script that loops over thousands of keys stalls every client of that shard.

Now the hash tag's cost: one abusive key's traffic all lands on one shard. The lesson simulated it. A key limited to 100 a second, whose owner's retry loop sends 40 thousand a second across 200 gateways. Before I give you the fix: what can you do that cuts Redis load without admitting a single extra request?

[pause]

A denial cache. When Redis says no, the gateway remembers the denial for 50 milliseconds and rejects locally. Undefended, the abuser drove about 40 thousand Redis calls a second. With a 50 millisecond denial cache, about 3,800, a tenfold cut, and admitted traffic was unchanged at 140 a second, because 200 gateways each re-checking 20 times a second still find every refilled token.

Honest heavy users get the mirror image: token leasing. A gateway takes 10 tokens per call instead of one. A legitimate key sending 3 thousand a second went from about 3 thousand Redis calls a second to about 300. The cost is overshoot of up to the lease size times the number of nodes, and leased tokens idling on one node.

So the chosen design is central counters in Redis, a 50 millisecond denial cache everywhere, and 10-token leases for keys above about a thousand requests a second.

## Deep dive three: failing open, and regions

A Redis primary dies. Here is what happens. The gateway gives the limiter a 2 millisecond budget, wrapped in a circuit breaker. For the first second, calls time out at 2 milliseconds. Then the breakers open, and gateways fall back to a local bucket at twice the node's fair share. Redis Cluster takes 15 to 20 seconds to declare the failure and promote a replica. At about 21 seconds, breakers probe, succeed, and close. One sixteenth of clients got approximate fairness for about 20 seconds, erring toward admitting, and the API stayed up.

But fail closed where the limit is a security control. Login attempts, one-time password checks, and password-reset emails are limited to stop brute force, not to share capacity. Admitting them unmetered during an outage hands an attacker the window they want. Their fallback is a strict local limit, and without one, rejection. Fail open for fairness, fail closed for security. Saying that in one sentence is a strong senior signal.

Now regions. A cross-region round trip costs 70 to 150 milliseconds, so an exact global counter cannot sit on the request path. Replicating per-region counters asynchronously looks attractive. The simulation: limit 100 a second, an aggressive client sending a thousand a second to each of three regions. With zero lag, 100 admitted. At 50 milliseconds of lag, 200. At 100 milliseconds or more, 300. Each region spends the whole budget before hearing from the others.

So per-key limits use a budget split instead. Each region gets a share in proportion to the key's recent traffic, say 50, 30 and 20 percent, rebalanced every minute, with no overshoot at all. Its failure is the opposite: a client that moves all its traffic to the 20 percent region gets 20 a second until the next rebalance. Asynchronous counters stay right for long windows, like a daily free-tier quota, where a second of lag is nothing.

## When it breaks

Three more failure modes. The retry herd: 5 thousand clients rejected in one second and all told to retry after 42 seconds come back in the same second 42 seconds later. Spreading each over a random extra zero to 50 percent cut the simulated peak from 5 thousand to 263 a second. Jitter Retry-After, and make the rejection path cheaper than success.

A bad rule push: a rate of zero matching everything, and the four-twenty-nine rate jumps fleet-wide. Shadow-evaluate every change on live traffic, refuse changes that would reject more than a small percentage of admitted requests without an override, roll out one region at a time, and keep one-click rollback.

And carrier-grade NAT: thousands of mobile users behind one IP address get rejected in clusters. Keep per-IP limits generous, and strict limits only on authenticated identity.

At ten times the traffic, one script call per request would mean 160 Redis primaries, and the round trip becomes the cost worth removing. Per-key rules move to an affinity tier: consistent-hash each key to a limiter process that decides in memory, in about a microsecond. Keys that move when a node leaves restart full, which errs in the client's favour.

## In the interview

A follow-up the lesson expects. A customer says they are limited at 80 requests a second under a 100 a second limit. Who is wrong?

[pause]

Possibly neither. Check the burst shape first: 80 requests in 200 milliseconds against a capacity of 50 rejects 14 percent. Check which rule fired, since every four-twenty-nine names it. Check whether their traffic moved to a region with a smaller budget share, and whether retries of timed-out requests are each taking a token. Make the limiter explain itself. The wrong answer is "the limiter has a bug" before you have looked at the burst shape.

And another: is a rate limiter the same as load shedding? No, and you need both. A rate limit is a per-client fairness policy, configured ahead of time. Load shedding protects the service from whatever arrives now, and must adapt, because capacity changes with deploys, failures and cache hit rates. A service with only rate limits still falls over when every client is legitimately under its limit at once.

## Recap

Four things to remember. Price the design in shared-state round trips, not memory, and keep most requests away from Redis with a 50 millisecond denial cache and token leases. Make the check atomic in the store with one small script, using the store's clock, all rules or nothing. Size bucket capacity from burst shape, not the average. And fail open for fairness, closed for security, and use a budget split across regions because asynchronous counters overshoot up to three times.

At your desk: the sizing tables, the token bucket and Lua code, the request and failover traces, and the token bucket exercise.
