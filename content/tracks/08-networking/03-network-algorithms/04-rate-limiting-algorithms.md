---
slug: rate-limiting-algorithms
title: "Rate limiting: token buckets, leaky buckets, sliding windows and GCRA"
description: How fixed windows, sliding logs, sliding counters, token buckets, leaky buckets and GCRA decide which requests to admit, traced on one request timeline; GCRA derived from the token bucket; limiting across a fleet with Redis, Lua and one clock; and how Ascend's own per-IP, per-account and per-session limits and daily AI budgets use them.
minutes: 45
difficulty: medium
tags: [networking, rate-limiting, token-bucket, leaky-bucket, sliding-window, gcra, redis, api-design]
problems: []
---
A credential-stuffing botnet starts hitting your login endpoint at 2,000 requests per second from a few hundred IP addresses. Somewhere else, a mobile release ships with a retry loop that has no backoff, and one tenant's nightly batch job hammers a shared API at ten times its usual rate. In each case you need to cap how fast one *key* (an IP, a user, an API key, a tenant) can consume a resource, without breaking the normal user whose page load fires eight requests in 200 ms. The decision has to take microseconds, cost a few bytes of state per key, and ideally hold across every instance of your service.

There are only a handful of algorithms for this, and you have configured all of them, possibly without knowing which. They differ in three places: what happens at window boundaries, how much memory each key costs, and whether a burst is allowed through, queued, or refused. This lesson runs all of them on one request timeline, derives GCRA from the token bucket, takes the algorithm to a fleet, and then walks through how Ascend itself limits requests.

## What a limiter decides

Every rate limiter is configured by the same handful of choices:

- **Key**: whose budget is this? Per IP is cheap and needs no authentication, but everyone behind one office NAT or mobile carrier gateway shares it. Per user or API key is fairer but only works after authentication.
- **Rate** `r`: the sustained admission rate, such as 5 requests per second.
- **Burst** `b`: how many requests may arrive at once after a quiet period. "100 per minute" is not a specification until you say whether all 100 may arrive in the first second.
- **Action**: reject with `429 Too Many Requests`, delay (queue until allowed), or shed load with `503` when the whole service is overloaded.
- **Scope**: one process, or the whole fleet.

## The algorithms

### Windows and logs

**Fixed window counter.** Divide time into windows of length `W` and count requests per key per window: in Redis, `INCR ratelimit:{key}:{window_index}` plus an `EXPIRE` on the first increment. It is O(1) in time and memory, and it has a boundary problem: with 100 per minute, a client sends 100 requests at 00:59.5 and 100 more at 01:00.1, 200 in 0.6 s, and every rejected client learns that its budget resets at the top of the minute, so they all retry at :00 together. Fixed windows are right when only the **total** matters: a daily quota, a monthly bill.

**Sliding window log.** Keep the timestamp of every accepted request; on arrival at `t`, discard timestamps at or before `t − W` and accept only if fewer than `limit` remain. It is exact, and its memory grows with the limit: 10,000 per hour means up to 10,000 timestamps per key. In Redis it is a sorted set (`ZREMRANGEBYSCORE`, `ZCARD`, `ZADD`), where each member costs tens of bytes of skiplist and hash overhead, so a million active keys at that limit is hundreds of gigabytes. Log only accepted requests, or a client that keeps hammering never recovers.

```viz
{"type": "system", "scenario": "sliding-window-log", "title": "Sliding window log: 3 requests per 10 seconds", "caption": "The limiter keeps each accepted timestamp and evicts those older than 10 s. There is no boundary to game: any 10-second interval contains at most 3 accepted requests."}
```

**Sliding window counter.** Keep counts for the current and previous fixed windows and assume the previous window's requests were spread evenly:

$$
\text{estimate} = \text{prev} \times \left(1 - \frac{\text{elapsed}}{W}\right) + \text{curr}
$$

With a limit of 100 per minute, 84 requests last minute and 36 so far, 15 s into this one: $84 \times \frac{45}{60} + 36 = 99$, so the request is admitted. Two integers per key, no boundary burst, and an error bounded by how uneven the previous window was.

### Buckets

**Token bucket.** A bucket holds at most `b` tokens and gains `r` per second; each request removes one (or `c` for an expensive request), and with no token left it is rejected. Nothing adds tokens on a timer: the bucket stores `tokens` and `last` and refills lazily on arrival.

```python
import time

class TokenBucket:
    def __init__(self, capacity: float, rate: float):
        self.capacity = capacity          # burst size b
        self.rate = rate                  # tokens per second r
        self.tokens = capacity            # start full
        self.last = time.monotonic()      # monotonic: wall-clock jumps must not mint tokens

    def allow(self, cost: float = 1.0) -> bool:
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.rate)
        self.last = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False
```

The guarantee is precise: in any interval of length `T` the bucket admits at most $b + r \cdot T$ requests. With `b = 10` and `r = 5` per second that is at most 30 in any four seconds, and a client sending steadily at 5 per second never notices the bucket.

```viz
{"type": "system", "scenario": "token-bucket", "requests": 12, "title": "Token bucket: capacity 5, refill 1 token per second", "caption": "Seven requests at t = 0: the first five drain the bucket and the next two are rejected. Two seconds later two tokens have refilled. By t = 9 the bucket has refilled to its capacity of 5, not to 6: tokens do not accumulate beyond the burst size."}
```

**Leaky bucket.** The name means two different algorithms. **As a queue** (a shaper), requests enter a FIFO of size `b` that drains to the backend at exactly `r` per second, and arrivals that find it full are dropped: the output is perfectly smooth and the burst becomes latency. **As a meter**, a counter fills by one per request, leaks at `r`, and rejects a request that would overflow `b`: the token bucket upside down, with identical decisions. When someone says "leaky bucket", ask whether requests wait or are rejected.

```viz
{"type": "system", "scenario": "leaky-bucket", "title": "Leaky bucket as a queue: size 4, drains 1 per second", "caption": "Six requests arrive together. Four are queued and reach the server at t = 0, 1, 2, 3; two overflow and are dropped. The server sees a steady 1 per second, and the burst has been converted into queueing delay."}
```

## One timeline, six limiters

Every limiter below is configured as "3 requests per 10 seconds": windows of 10 s with a limit of 3; a token bucket with `b = 3` and `r = 0.3`/s; GCRA with emission interval $T = 10/3$ s; a leaky queue of 3 draining one request every 3.33 s. Nine requests arrive at the times in the first column. Each cell shows the decision and the state that produced it (simulated with exact fractions).

| t (s) | Token bucket: tokens after | GCRA: TAT after, or wait | Fixed window: count | Sliding log: in last 10 s | Sliding counter: estimate | Leaky queue: delay |
|---|---|---|---|---|---|---|
| 0 | ok, 2.0 | ok, 3.33 | ok, 1 | ok, 1 | ok, 0 | 0 |
| 7 | ok, 2.0 (refill capped at 3) | ok, 10.33 | ok, 2 | ok, 2 | ok, 1 | 0 |
| 8 | ok, 1.3 | ok, 13.67 | ok, 3 | ok, 3 | ok, 2 | 2.33 s |
| 9 | ok, 0.6 | ok, 17.00 | **no**, 3 | **no**, 3 | **no**, 3 | 4.67 s |
| 10 | **no**, 0.9 | **no**, wait 0.33 s | ok, 1 (new window) | ok, 3 (t = 0 expired) | **no**, 3 × 1.0 + 0 | 7.00 s |
| 11 | ok, 0.2 | ok, 20.33 | ok, 2 | **no**, 3 | ok, 3 × 0.9 + 0 = 2.7 | 9.33 s |
| 12 | **no**, 0.5 | **no**, wait 1.67 s | ok, 3 | **no**, 3 | **no**, 2.4 + 1 = 3.4 | **dropped**: 3 waiting |
| 16 | ok, 0.7 | ok, 23.67 | **no**, 3 | **no**, 3 (7, 8, 10) | ok, 1.2 + 1 = 2.2 | 7.67 s |
| 22 | ok, 1.5 | ok, 27.00 | ok, 1 | ok, 1 | ok, 2 × 0.8 + 0 = 1.6 | 5.00 s |
| **Admitted** | 7 | 7 | 7 | 5 | 6 | 8, with up to 9.3 s of delay |

Read the columns against each other:

- **The boundary burst.** The fixed window admits 7, 8, 10, 11 and 12: five requests in five seconds against a limit of three per ten, because 10, 11 and 12 fall in a fresh window.
- **The sliding log is the only exact limiter**, so it admits the fewest: at no instant does any 10-second interval contain more than three accepted requests.
- **The token bucket allows `b + r·T`**: 7, 8, 9 and 11 fall within four seconds, the three-token burst plus 1.2 tokens of refill. Its rejections carry an exact wait: at t = 10 the bucket holds 0.9 tokens and needs 0.1 more, $0.1 / 0.3 = 0.33$ s, which is the number GCRA reports.
- **The sliding counter errs in both directions.** At t = 10 it assumes the previous window's three requests were spread evenly and rejects, though the log admits; at t = 16 it admits, though three requests really fell within the last 10 s.
- **The leaky queue never rejects the burst; it delays it.** The request at t = 11 reaches the backend 9.3 s later, which is past many clients' timeouts.

## GCRA: the token bucket in one number

The **generic cell rate algorithm** comes from ATM networks. It makes the same decisions as a token bucket, which the GCRA column shows, while storing one timestamp per key. Derive it from the bucket.

Define the **emission interval** $T = 1/r$ and, for a bucket holding `tokens` at time `last`, the **theoretical arrival time** $TAT = \text{last} + (b - \text{tokens}) \cdot T$: the moment the bucket would be full again if nothing else arrived. At a later time `t`, the bucket holds $b - (TAT - t)/T$ tokens while $TAT > t$, and is full (tokens capped at `b`) once $TAT \le t$, which is the same as replacing `TAT` with $\max(TAT, t)$. A request is admitted when at least one token remains:

$$
b - \frac{\max(TAT, t) - t}{T} \ge 1 \iff \max(TAT, t) - t \le (b - 1)\,T = \tau
$$

and removing one token moves the full-again moment one emission interval later: $TAT \leftarrow \max(TAT, t) + T$. That is the whole algorithm:

```text
tat = max(TAT, t)
if tat - t > tau:
    reject; the request would be allowed at time tat - tau
else:
    TAT = tat + T; accept
```

Work it for 10 per minute with a burst of 10: $T = 6$ s and $\tau = 54$ s. Ten requests at t = 0 each push `TAT` forward by 6 s, to 60. An eleventh at t = 0 finds $60 - 0 > 54$ and is rejected; it would be allowed at $60 - 54 = 6$ s, so `Retry-After: 6`. A request at t = 6 finds $60 - 6 = 54$, not greater than 54: accepted, `TAT = 66`.

One 64-bit value per key is the practical win. It can be updated with a compare-and-swap loop and no lock, the rejection path computes an exact `Retry-After` for free, and in Redis it is one small key per client; the `redis-cell` module exposes it as one command.

## Worked example: how Ascend limits requests

Ascend's API uses two layers of limiting that are worth reading as a pair. The first lives in `crates/api/src/middleware/rate_limit.rs`:

```rust
pub struct Limiters {
    /// Login/register: 30 per minute per IP. Loose enough for a class
    /// signing up together behind one NAT address.
    pub auth: Keyed<IpAddr>,
    /// Password attempts: 10 per minute per account (login and account
    /// deletion). This, not the per-IP bucket, is what stops a distributed
    /// attacker guessing one learner's password.
    pub password_attempts: Keyed<String>,
    /// Everything else: 1,200 per minute per IP. Deliberately loose: a whole
    /// class or office can share one NAT address, and every route that is
    /// expensive (password hashing, AI) has its own tight bucket. This one
    /// only stops a single client from flooding cheap reads.
    pub general: Keyed<IpAddr>,
    /// Model-calling routes: 20 per minute per session (IP when there is no
    /// session cookie). The daily budget is enforced separately.
    pub ai: Keyed<ClientKey>,
}

impl Limiters {
    pub fn new() -> Self {
        let per_min = |n: u32| Quota::per_minute(NonZeroU32::new(n).expect("non-zero"));
        Self {
            auth: RateLimiter::keyed(per_min(30)),
            password_attempts: RateLimiter::keyed(per_min(10)),
            general: RateLimiter::keyed(per_min(1200)),
            ai: RateLimiter::keyed(per_min(20)),
        }
    }
}
```

### The quotas in GCRA terms

These are `governor` limiters (version 0.10), and `governor` implements GCRA. `Quota::per_minute(n)` means a burst of `n` and one replenished cell every $60/n$ seconds. So the password-attempt limiter is exactly the worked example above (one attempt per 6 s after a burst of 10), the auth limiter replenishes every 2 s after a burst of 30, the general limiter every 50 ms after a burst of 1,200, and the AI limiter every 3 s after a burst of 20.

The layering is deliberate. The general limiter wraps every `/api` route, and the routes that call the model add their own layer inside it, so a model call spends from both. The auth bucket wraps only `/auth/register` and `/auth/login`, the unauthenticated routes that pay for an Argon2 password hash. Cheap, strict checks go on the expensive endpoints; a generous one protects everything.

### Keys: what an attacker must vary

- **For auth and general traffic the key is an IP, which is both too coarse and too fine.** Every user behind one university NAT shares a bucket, which is why the general limit was raised from 300 to a loose 1,200 per minute; that only works because every expensive route has a tight bucket of its own. And a botnet has thousands of keys. Per-IP limits are an abuse brake, not fairness.
- **Password guessing is charged to the account.** A per-IP login limit does little against someone guessing one learner's password from a thousand addresses. So login and account deletion also call `Limiters::check_password_attempt`, keyed by the email trimmed, lowercased and capped at 254 characters (the address is not validated yet, and an unbounded key would let a client fill the map with long strings). The attacker gets 10 guesses a minute per account however many addresses they own, and case or whitespace variants do not buy a fresh allowance. Deletion is included because it asks for the password too, and a stolen session must not become a guessing oracle. The price, shared by every per-account limit: anyone who knows a learner's email can spend that allowance and make the real login wait, and a per-minute quota keeps that wait to seconds rather than a lockout.
- **The AI bucket is keyed by session.** Twenty model calls a minute shared by a classroom behind one address would throttle everyone, so the key is `enum ClientKey { Ip(IpAddr), Session([u8; 16]) }`: the first 16 bytes of the SHA-256 of the session cookie (raw tokens never sit in the limiter's memory), falling back to the IP without a cookie. An invented cookie gets a fresh bucket, but authentication then rejects the request, and it still spends from the per-IP general bucket. The bucket wraps only routes that call the model (sending a coach message, generating a quiz or roadmap suggestions, and the interview turn, assistant and finish routes); `ai_throttling_is_per_session_and_only_for_model_calls` checks that one learner's quiz requests get 429s once the burst of 20 is spent while a second learner on the same IP is unaffected.
### Which IP counts

Behind a proxy the TCP peer is the proxy, so keying on it puts every user in one bucket. `X-Forwarded-For`'s first entry is whatever the client chose to send, so a client that sends a random value per request gets a fresh bucket per request. The code trusts only a header its own proxy sets and overwrites (Railway's `X-Real-IP`, selected by `CLIENT_IP_HEADER`) and falls back to the socket peer.

### Retry-After, memory and process scope

`Retry-After` used to be a constant 60. GCRA already knows the earliest admission time (`governor` returns it in the rejection as a `NotUntil`), and for the password limiter that is 6 seconds, not 60, so the limiter now sends `not_until.wait_time_from(now)` rounded up to whole seconds and never less than 1. `throttled_responses_say_when_to_retry` in `crates/api/tests/api.rs` checks it, and that a second account from the same address is not throttled. The web client uses it: a read that fails with 429 is retried at most twice, after the number of seconds the server asked for (capped at 10).

Keys never expired on their own: `governor`'s keyed store keeps an entry for every key it has seen until something calls `retain_recent()`, and the first version never did, so the maps grew with every visitor. Now `Limiters::prune` calls `retain_recent()` and `shrink_to_fit()` on every limiter from the hourly task in `main.rs` that sweeps expired sessions. And the state is per process, as the module comment says: behind a round-robin balancer, three instances would give each key three times the limit.

### The daily budget: a fixed window in Postgres

The second layer, `crates/core/src/ai/budget.rs`, caps **cost** rather than bursts: each user gets a daily allowance of AI requests and tokens, reset at midnight UTC, stored as one row per `(user_id, day)`. That is a fixed window, and here the boundary burst is harmless: spending a day's budget at 23:59 and another at 00:01 still bounds the daily bill.

The obvious reservation reads today's usage, compares, and increments in a second statement; two concurrent requests at 119 of 120 both read 119 and end at 121, and N concurrent requests overshoot by N − 1. `check_and_reserve` is one statement:

```sql
INSERT INTO ai_usage (user_id, day, input_tokens, output_tokens, requests)
VALUES ($1, $2, 0, 0, 1)
ON CONFLICT (user_id, day) DO UPDATE
   SET requests = ai_usage.requests + 1
 WHERE ai_usage.requests < $3
   AND (ai_usage.input_tokens + ai_usage.cache_write_tokens * 5 / 4 + ai_usage.cache_read_tokens / 10) < $4
   AND ai_usage.output_tokens < $5
RETURNING requests
```

The first request of the day inserts the row. Later ones hit the conflict, lock the row, and increment only if the `WHERE` clause holds against the latest committed values; at a limit nothing is updated, `RETURNING` yields no row, and the caller gets a rate-limit error whose `Retry-After` is the seconds until the next UTC midnight. The input condition counts *billed* input: prompt-cache writes cost 1.25 times an ordinary input token and cache reads a tenth, so they count at that weight. An earlier version compared only uncached `input_tokens`, and since conversation caching turns nearly all of a chat's input into cache reads and writes, the limit barely moved while the most expensive input went uncounted. A quota must count the unit the bill counts.

Ascend's first version was the read-then-write one, and a design review caught it. `ai_budget_reservation_cannot_be_overshot_by_concurrency` now fires 30 reservations at once against a limit of 10 and asserts exactly 10 succeed. A race fixed without a concurrent test is a race you believe you fixed.

The token limits are softer. Tokens are known only after the model responds, so `record` adds them afterwards, and one long response can carry a user past the cap. A hard cap would reserve the request's `max_tokens` up front and refund the unused part, the way a card pre-authorisation works. The pattern generalises: a cheap in-memory limiter absorbs bursts before a request touches the database, and a durable per-user quota enforces what the business cares about.

## Limiting across a fleet

With `N` instances, per-process buckets stop meaning what their numbers say. Three designs:

- **Divide the limit.** Each instance enforces `limit / N`. No coordination, and wrong whenever traffic is uneven: sticky sessions, one long-lived HTTP/2 connection pinned to one instance, an autoscaler that changes `N`.
- **Centralise the state** in Redis, updated atomically per request.
- **Go hybrid.** Each instance leases a batch of tokens (say 50) from the store and returns only when the lease runs out; accuracy drops by at most the unsynchronised amount and store load drops by the batch size. Envoy offers both ends: a local rate-limit filter (a token bucket per proxy) and a global rate-limit service over gRPC, whose reference implementation counts fixed windows in Redis.

### Why the script, and whose clock

```lua
-- KEYS[1]: bucket key. ARGV: capacity, rate (tokens/s), cost
local capacity, rate, cost = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local t = redis.call("TIME")                         -- one clock: the Redis server's
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local state = redis.call("HMGET", KEYS[1], "tokens", "ts")
local tokens = tonumber(state[1]) or capacity
local ts = tonumber(state[2]) or now
tokens = math.min(capacity, tokens + math.max(0, now - ts) / 1000 * rate)
local allowed = tokens >= cost
if allowed then tokens = tokens - cost end
redis.call("HSET", KEYS[1], "tokens", tokens, "ts", now)
redis.call("PEXPIRE", KEYS[1], math.ceil(capacity / rate * 1000))
return allowed and 1 or 0
```

**Atomicity.** A `GET`, a decision in the application and a `SET` interleave across servers: two instances both read `tokens = 1`, both admit, and N concurrent requests overshoot by N − 1, the same race as the budget above. Redis executes a script to completion on its single command thread, so no other command runs between the read and the write. The cost is that a slow script blocks every client of that Redis, so scripts must stay O(1). In Redis Cluster every key a script touches must hash to one slot (use a hash tag such as `rl:{user42}`).

**Clocks.** If each application server passes its own `now`, skew becomes rate error: a server whose clock runs δ behind sees every client δ further ahead of schedule. The error is about δ/T requests, so it depends on the emission interval: 100 ms of skew is two requests on a 1,200-per-minute limit (T = 50 ms) and nothing on a 10-per-minute one (T = 6 s). Reading `TIME` inside the script gives one clock; that is safe because Redis 5 and later replicate scripts by their effects, not by re-running them on replicas. The `math.max(0, …)` guards against a clock stepping backwards after a failover.

**Cleanup and failure.** `PEXPIRE` deletes a key after `capacity / rate` seconds of silence, when the bucket would be full anyway, so idle keys clean themselves up. The costs are a round trip per request (typically well under a millisecond within one zone), a new dependency on the request path, and hot keys: one huge tenant's bucket lives on one shard. Decide what happens when Redis is unreachable before it is: for abuse protection **fail open**, so a limiter outage does not become a site outage; for a paid quota, failing closed may be right. The full design, including multiple regions, is the [rate limiter case study](/learn/system-design/case-studies/rate-limiter); as a coding question it appears in [Concurrency interview problems](/learn/systems/concurrency/concurrency-interview-problems).

### Rate limits do not bound concurrency

A limit of 100 requests per second says nothing about how many are in flight. If each request takes 30 seconds because a dependency is slow, 100 per second is 3,000 concurrent requests by Little's law, and your threads and pools are gone. Mature APIs run a **concurrency limiter** (a semaphore per key or per service) beside the rate limiter and shed low-priority load when saturated. Netflix's open-source `concurrency-limits` library adjusts the limit from observed latency, the way TCP adjusts a congestion window.

## Telling clients what happened

- **429** means this client is over its budget; **503** means the service is shedding load regardless of who is asking.
- **`Retry-After`** says when to come back; GCRA and the sliding log compute it exactly.
- Budget headers (`X-RateLimit-Remaining`, or the IETF draft's `RateLimit` fields) let clients pace themselves before they hit the wall.
- Clients must honour `Retry-After` with jitter, or every rejected client returns at the same instant, the retry discipline in [Timeouts, retries and backoff](/learn/networking/networking-in-practice/timeouts-retries-and-backoff).

## Under the hood: three real limiters

| Implementation | Algorithm | State per key | Detail worth knowing |
|---|---|---|---|
| `governor` (Rust) | GCRA | One `AtomicU64` holding the TAT in nanoseconds | `check` is a compare-and-swap loop; keyed state lives in a sharded concurrent map (DashMap) that grows until `retain_recent()` removes keys whose TAT has passed |
| NGINX `limit_req` | Leaky bucket: meter plus an optional queue | A small record in a shared-memory zone; the docs size a 1 MB zone at about 16,000 states | `burst=` queues excess requests and releases them at the rate; `nodelay` forwards them at once while still counting them, which turns it back into a token bucket |
| Envoy local rate limit | Token bucket | `max_tokens`, `tokens_per_fill`, `fill_interval` per filter or route | Per proxy, so a fleet of 50 sidecars admits 50 times the configured rate unless the global service is used |

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Per-process limits multiplied | A client gets about N times its documented limit; the limit changes when the autoscaler does | Count instances; compare admitted rate per key with the configured rate | Central store with atomic updates, or leased batches of tokens |
| Keyed on the proxy's address | One abusive client gets 429s for everyone, or the limiter never fires | Logged client IPs are all the load balancer's; or `X-Forwarded-For` values are random | Key on a header your own proxy sets and overwrites; fall back to the socket peer |
| Synchronised reset herd | Load spikes at the top of every minute; 429 bursts at :00 | Fixed-window limiter; rejected clients retry at the reset boundary | Sliding counter or GCRA; jittered `Retry-After`; clients add jitter |
| Unbounded key growth | Limiter memory climbs for days, then the process is OOM-killed | Keyed map size tracks distinct visitors; nothing ever evicts | Periodic eviction (`retain_recent()`, `PEXPIRE`), bounded key length |
| Limiter store outage | Every request fails, or the limit silently disappears | Redis timeouts on the request path; error handling fails closed (or open) by accident | Choose fail-open or fail-closed per limiter, with a short timeout and a local fallback bucket |

## The algorithms side by side

| Algorithm | State per key | Burst behaviour | Boundary effect | Retry-After | Typical use |
|---|---|---|---|---|---|
| Fixed window | 1 counter | Up to 2× limit across a boundary | Yes, and synchronised resets | Time to next window | Daily or monthly quotas, billing caps |
| Sliding log | Up to `limit` timestamps | Exact | None | Exact (oldest entry expiry) | Low limits where exactness matters |
| Sliding counter | 2 counters | Approximate, errs both ways | Smoothed | Approximate | Per-client API limits in Redis |
| Token bucket | tokens + timestamp | Bursts up to `b`, then `r` | None | Exact | API gateways, cloud APIs, traffic shaping |
| Leaky bucket (queue) | Queue of up to `b` | Bursts become delay | None | Not applicable: requests wait | Smoothing traffic to a fragile backend |
| GCRA | 1 timestamp | Same as token bucket | None | Exact, free | High-throughput limiters |

## Interviewer follow-ups

**"Design a limiter for 10,000 requests per second per API key across 40 gateway instances."** Model answer: GCRA or a token bucket in a sharded Redis, one key per API key, updated by a script that reads the server's clock; add leased token batches if Redis round trips dominate, fail open for abuse limits, and a concurrency limit beside it. Common wrong answer: "each gateway allows 250 per second", which breaks under uneven balancing and autoscaling.

**"Why is GCRA equivalent to a token bucket?"** Model answer: the TAT is the time the bucket would be full again; tokens equal $b - (TAT - t)/T$, so "at least one token" is $TAT - t \le (b-1)T$ and spending a token adds `T` to the TAT. Common wrong answer: "it is a different algorithm with similar behaviour".

**"Your fixed-window limiter lets through double the limit. Fix it without more memory per key."** Model answer: a sliding window counter, two integers per key and a weighted estimate; or GCRA, one integer. Common wrong answer: "switch to a sliding log", which is exact but costs memory proportional to the limit.

**"Why not put the limit check and the increment in two Redis commands?"** Model answer: concurrent requests interleave between them and all pass; the check and the write must be one atomic step, a script or a conditional update, which is the same fix as Ascend's single-statement budget reservation. Common wrong answer: "Redis is single-threaded, so it is already atomic", which is true per command and false across two.

## What mid-level engineers get wrong

- **Accepting "100 per minute" without asking for the burst, the key and the action.** Two limiters with that label can admit anything from 100 to 200 in one minute.
- **Keying on the TCP peer behind a load balancer**, or on the first `X-Forwarded-For` entry, which the client controls.
- **Checking and incrementing in two steps**, in SQL or in Redis, and discovering the overshoot under a concurrent load test.
- **Passing each app server's clock to a shared limiter**, then chasing rate errors that correlate with one host's NTP drift.
- **Using a queueing limiter in front of a client with a short timeout**, so queued requests are served after the client has given up and retried.
- **Treating a rate limit as a concurrency limit**, and running out of threads when a dependency slows down at an unchanged request rate.

## Exercises

```exercise
id: token-bucket-simulation
title: Simulate a token bucket
prompt: |
  Simulate a token bucket and return, for each request, whether it is
  admitted.

  - The bucket starts full with `capacity` tokens and gains `rate` tokens
    per second, continuously, never exceeding `capacity`.
  - `times` is a non-decreasing list of request arrival times in seconds.
  - On each arrival, first refill for the time elapsed since the previous
    arrival (the first arrival refills nothing), then admit the request
    if at least one token is available, removing one token.
  - A rejected request does not consume a token.

  Return a list of booleans, one per request.
languages: [python, javascript]
entry: token_bucket
starter:
  python: |
    def token_bucket(capacity, rate, times):
        tokens = capacity
        last = times[0] if times else 0
        result = []
        # TODO
        return result
  javascript: |
    function token_bucket(capacity, rate, times) {
      let tokens = capacity;
      let last = times.length ? times[0] : 0;
      const result = [];
      // TODO
      return result;
    }
tests:
  - args: [5, 1, [0, 0, 0, 0, 0, 0, 0, 2, 3, 3, 3, 9]]
    expected: [true, true, true, true, true, false, false, true, true, true, false, true]
    label: the schedule from the visualisation
  - args: [3, 1, []]
    expected: []
    label: no requests
  - args: [1, 1, [0, 0.5, 1, 1.5, 2]]
    expected: [true, false, true, false, true]
    label: half a token is not enough
  - args: [3, 0.5, [0, 0, 0, 0, 1, 2, 4]]
    expected: [true, true, true, false, false, true, true]
    label: slow refill
  - args: [2, 2, [0, 0, 0, 0.25, 0.5, 10, 10, 10]]
    expected: [true, true, false, false, true, true, true, false]
    label: capped at capacity after a long gap
    hidden: true
hints:
  - "Refill with `tokens = min(capacity, tokens + (t - last) * rate)`, then set `last = t` whether or not the request is admitted."
  - "Admit when `tokens >= 1`; a bucket holding 0.5 tokens rejects."
```

```exercise
id: gcra-retry-after
title: GCRA with an exact Retry-After
prompt: |
  Implement GCRA. `interval` is the emission interval T (seconds between
  requests at the sustained rate) and `burst` is the burst size b, so the
  tolerance is tau = (burst - 1) * interval. The theoretical arrival time
  TAT starts at 0; `times` are non-decreasing integers, all at least 0.

  For each request at time t: let tat = max(TAT, t). If tat - t > tau the
  request is rejected and you output how many seconds it must wait,
  tat - tau - t (TAT is unchanged). Otherwise output 0 and set
  TAT = tat + interval.

  Return the list of outputs (0 for admitted, the wait for rejected).
languages: [python, javascript]
entry: gcra
starter:
  python: |
    def gcra(interval, burst, times):
        tau = (burst - 1) * interval
        tat = 0
        out = []
        # TODO
        return out
  javascript: |
    function gcra(interval, burst, times) {
      const tau = (burst - 1) * interval;
      let tat = 0;
      const out = [];
      // TODO
      return out;
    }
tests:
  - args: [6, 10, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]
    expected: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6]
    label: 10 per minute, burst 10, then one too many
  - args: [6, 10, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6, 6]]
    expected: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 6]
    label: the next slot opens at t = 6
  - args: [2, 1, [0, 1, 2, 2, 5]]
    expected: [0, 1, 0, 2, 0]
    label: burst 1 means strict spacing
  - args: [5, 2, []]
    expected: []
    label: no requests
  - args: [3, 3, [0, 0, 0, 0, 1, 4, 4, 20, 20, 20, 20]]
    expected: [0, 0, 0, 3, 2, 0, 2, 0, 0, 0, 3]
    hidden: true
hints:
  - "The only state is TAT. A rejected request must not move it."
  - "After a long idle gap, max(TAT, t) resets the schedule to now, which is what refills the burst."
```

## Senior signals

- You never accept "100 per minute" as a specification; you ask for the **burst**, the **key**, and what happens to rejected requests.
- You can run fixed window, sliding log, sliding counter, token bucket and leaky queue on the same timeline and say where each one admits, rejects or delays, including the fixed window's **boundary burst** and the sliding counter's errors in both directions.
- You can **derive GCRA** from the token bucket (TAT is the full-again time) and explain why one timestamp makes lock-free updates and exact `Retry-After` values easy.
- You separate **rate limits, concurrency limits and quotas**, and you layer them: a cheap in-memory brake in front, a durable per-user cost budget behind, with the check and the increment in one atomic statement.
- For a fleet, you choose between divided, centralised and hybrid limiting explicitly, keep the read-decide-write in one **Lua script** reading **one clock**, and decide **fail-open versus fail-closed** before the limiter's datastore has its first outage.
- You check where the client IP comes from before trusting any per-IP limit, and you choose the key by asking what an attacker must vary.

## Check yourself

```quiz
- q: >-
    A fixed window limiter allows 100 requests per minute per client. What is the most a client can get through in any 2-second interval?
  options: ["200", "About 3", "Unlimited", "100"]
  answer: 0
  explanation: >-
    Send 100 in the last second of one window and 100 in the first second of the next: both windows are within their limit, and 200 requests land within two seconds. Sliding windows, token buckets and GCRA do not have this boundary effect.
- q: >-
    A sliding window counter has a limit of 60 per minute. The previous minute had 40 requests; you are 30 seconds into the current minute, which has had 35. Is the next request admitted?
  options: ["Yes, because the estimate is 40 × 0.5 + 35 = 55, below 60", "No, because the previous window alone used two thirds of the limit", "Yes, because the current window's 35 is below 60", "No, because 40 + 35 = 75 is more than the limit of 60"]
  answer: 0
  explanation: >-
    The previous window is weighted by the fraction of it still inside the sliding minute (0.5), giving 20 + 35 = 55. Adding the raw counts ignores that half the previous window has slid out; ignoring the previous window entirely would allow the boundary burst.
- q: >-
    A GCRA limiter has emission interval T = 2 s and burst 3, so tau = 4 s. TAT is 10 when a request arrives at t = 5. What happens?
  options: ["Admitted; TAT becomes 12 after the request", "Admitted; TAT is reset to 5 plus the interval", "Rejected; it may retry after 1 s, at t = 6", "Rejected; it must wait 5 s until TAT is reached"]
  answer: 2
  explanation: >-
    max(TAT, t) − t = 10 − 5 = 5, which exceeds tau = 4, so the request is rejected and TAT is unchanged. It would be admitted once TAT − t ≤ 4, at t = 10 − 4 = 6. In token-bucket terms the bucket holds 3 − 5/2 = 0.5 tokens and needs another half token, one second of refill. Waiting until TAT itself would refill the whole burst, which is more than needed.
- q: >-
    You put a leaky bucket queue of size 50, draining at 10 requests per second, in front of a fragile service. What is the main new risk?
  options: ["The service now receives bursts of up to 50 requests at once", "Memory grows without bound because the queue never fully drains", "Queued requests are processed out of order when the queue fills", "Queued requests can wait about 5 s, past many clients' timeouts"]
  answer: 3
  explanation: >-
    A shaping queue converts bursts into delay: the last of 50 queued requests waits about 50 / 10 = 5 s, holding its connection the whole time. If the client's timeout is shorter, the work is wasted and probably retried. The service itself sees a steady 10 per second, never the burst, and the queue is bounded at 50. Size the queue by the delay you can accept.
- q: >-
    A daily quota is enforced by reading the user's usage and then incrementing it in a separate statement. A user at 119 of 120 sends two requests at the same instant. What can happen, and how does Ascend's budget code avoid it?
  options: ["Both can read 119 and end at 121; Ascend's single conditional upsert rules it out", "Both are rejected as conflicts; Ascend retries the loser after a short backoff", "The second request deadlocks; Ascend avoids it by taking SELECT ... FOR UPDATE", "Nothing; Postgres serialises the two statements, so Ascend needs no special care"]
  answer: 0
  explanation: >-
    Check-then-act across two statements is a race under the default isolation level (Read Committed does not serialise them): both reads can see 119 before either write lands. Ascend reserves with one statement, INSERT ... ON CONFLICT DO UPDATE SET requests = requests + 1 WHERE requests < limit RETURNING requests, so the two requests queue on the row lock; the second finds 120, updates nothing, gets no row back from RETURNING, and is rejected.
- q: >-
    Forty gateway instances share a Redis token bucket per API key, and each instance passes its own clock reading into the Lua script. One host's clock drifts 100 ms. When does this matter most?
  options: ["Only while the Redis primary is failing over to a replica", "At 1,200 per minute, where 100 ms is two requests' spacing", "Never, because the Lua script makes the update atomic", "At 10 per minute, where the 6 s interval magnifies the skew"]
  answer: 1
  explanation: >-
    Skew of δ misstates how far ahead of schedule a client is by about δ/T requests, so it matters when the emission interval T is small: 50 ms at 1,200 per minute, making 100 ms worth two requests, versus 6 s at 10 per minute, where it is negligible. Atomicity prevents interleaving, not wrong inputs. Reading the Redis server's TIME inside the script gives every decision one clock.
```
