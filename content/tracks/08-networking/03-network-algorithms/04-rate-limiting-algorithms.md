---
slug: rate-limiting-algorithms
title: "Rate limiting: token buckets, leaky buckets, sliding windows and GCRA"
description: How fixed windows, sliding logs, sliding counters, token buckets, leaky buckets and GCRA decide which requests to admit, what each costs per key, how Ascend's own per-IP, per-account and per-session limits and daily AI budgets use them, and how to limit across a fleet.
minutes: 45
difficulty: medium
tags: [networking, rate-limiting, token-bucket, leaky-bucket, sliding-window, gcra, redis, api-design]
problems: []
---
A credential-stuffing botnet starts hitting your login endpoint at 2,000 requests per second from a few hundred IP addresses. Somewhere else, a mobile release ships with a retry loop that has no backoff, and one tenant's nightly batch job hammers a shared API at ten times its usual rate. In each case you need to cap how fast one *key* (an IP, a user, an API key, a tenant) can consume a resource, without breaking the normal user whose page load fires eight requests in 200 ms. The decision has to take microseconds, cost a few bytes of state per key, and ideally hold across every instance of your service.

There are only a handful of algorithms for this, and you have configured all of them, possibly without knowing which. They differ in three places: what happens at window boundaries, how much memory each key costs, and whether a burst is allowed through, queued, or refused. This lesson takes each apart with numbers, then walks through how Ascend itself limits requests.

## What a limiter decides

Every rate limiter is configured by the same handful of choices:

- **Key**: whose budget is this? Per IP is cheap and needs no authentication, but everyone behind one office NAT or mobile carrier gateway shares it. Per user or API key is fairer but only works after authentication.
- **Rate** `r`: the sustained admission rate, such as 5 requests per second.
- **Burst** `b`: how many requests may arrive at once after a quiet period. "100 per minute" is not a specification until you say whether all 100 may arrive in the first second.
- **Action**: reject with `429 Too Many Requests`, delay (queue until allowed), or shed load with `503` when the whole service is overloaded.
- **Scope**: one process, or the whole fleet.

The algorithms are different answers to the rate and burst questions.

## Fixed window counter

Divide time into windows of length `W` and count requests per key per window. In Redis this is two commands: `INCR ratelimit:{key}:{window_index}` and `EXPIRE` on the first increment. Accept while the count is at most the limit.

It is O(1) in time and memory, and it has a boundary problem. With a limit of 100 per minute, a client sends 100 requests at 00:59.5 (allowed, the window has room) and 100 more at 01:00.1 (allowed, a new window started). That is 200 requests in 0.6 seconds, twice the intended rate, and a client that knows your window boundaries can do it every minute. Worse, every rejected client learns that its budget resets at the top of the minute, so they all retry at :00 at once.

Fixed windows are the right tool when only the **total** matters: a daily quota, a monthly bill, a free-tier cap. You will see exactly that use later in this lesson.

## Sliding window log

Keep the timestamp of every accepted request. When a request arrives at time `t`, discard timestamps older than `t − W`, and accept only if fewer than `limit` remain.

```viz
{"type": "system", "scenario": "sliding-window-log", "title": "Sliding window log: 3 requests per 10 seconds", "caption": "The limiter keeps each accepted timestamp and evicts those older than 10 s. There is no boundary to game: any 10-second interval contains at most 3 accepted requests."}
```

It is exact: any interval of length `W` contains at most `limit` accepted requests. The cost is memory proportional to the limit. A limit of 10,000 per hour needs up to 10,000 timestamps per key, 80 KB at 8 bytes each; with a million active keys that is 80 GB.

In Redis the log is a sorted set scored by timestamp: `ZREMRANGEBYSCORE key 0 (t − W)`, `ZCARD key`, and `ZADD key t t` if allowed, wrapped in a Lua script or `MULTI` so that two concurrent requests cannot both read a count of 99. Log only accepted requests: logging rejections too means a client that keeps hammering never recovers.

## Sliding window counter

The sliding window counter gets most of the log's accuracy with two integers per key. Keep fixed-window counts for the current and the previous window, and assume the previous window's requests were spread evenly. The estimated count over the last `W` seconds is

$$
\text{estimate} = \text{prev} \times \left(1 - \frac{\text{elapsed}}{W}\right) + \text{curr}
$$

where `elapsed` is how far you are into the current window.

Worked example: limit 100 per minute. The previous minute had 84 requests. You are 15 seconds into the current minute, which has seen 36 so far. The estimate is $84 \times \frac{45}{60} + 36 = 63 + 36 = 99$, so this request is accepted and becomes the 37th.

The approximation is wrong only when the previous window's traffic was bunched rather than even, and the error is bounded by that one window. For per-client API limits it is usually the best trade: O(1) memory, no boundary burst, and two `INCR`s in Redis.

## Token bucket

The token bucket is the algorithm most API gateways, cloud APIs and Linux traffic shaping implement, because it separates the two numbers you actually want to set. A bucket holds at most `b` tokens and gains `r` tokens per second. Each request removes one token (or `c` tokens for an expensive request). With no token left, the request is rejected.

Nothing actually adds tokens on a timer. The bucket stores two numbers, `tokens` and `last`, and refills **lazily** when a request arrives:

```python
import time

class TokenBucket:
    def __init__(self, capacity: float, rate: float):
        self.capacity = capacity          # burst size b
        self.rate = rate                  # tokens per second r
        self.tokens = capacity            # start full
        self.last = time.monotonic()

    def allow(self, cost: float = 1.0) -> bool:
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.rate)
        self.last = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False
```

The guarantee is precise: in any interval of length `T`, the bucket admits at most $b + r \cdot T$ requests. A bucket with `b = 10` and `r = 5` per second admits at most $10 + 5 \times 4 = 30$ requests in any four seconds, and a client that sends steadily at 5 per second never notices it exists.

```viz
{"type": "system", "scenario": "token-bucket", "requests": 12, "title": "Token bucket: capacity 5, refill 1 token per second", "caption": "Seven requests at t = 0: the first five drain the bucket and the next two are rejected. Two seconds later two tokens have refilled. By t = 9 the bucket has refilled to its capacity of 5, not to 6: tokens do not accumulate beyond the burst size."}
```

Choosing `b` is the part people skip. Set it from real client behaviour (if a page load fires eight API calls, `b` below 8 rejects legitimate users on every page) and from what the protected resource can absorb in one instant, because the bucket will happily let `b` requests through simultaneously. Weighted costs extend the idea naturally: a GraphQL gateway charges a query by its estimated complexity, and an LLM gateway charges by tokens rather than by request.

## Leaky bucket: two different algorithms with one name

"Leaky bucket" means two things, and people argue past each other because of it.

**As a queue (a shaper)**: requests pour into a FIFO of size `b` that drains to the backend at exactly `r` per second. Arrivals that find the queue full are dropped. The output is perfectly smooth no matter how bursty the input is. NGINX's `limit_req` is documented as this algorithm: with a `burst=` parameter, excess requests wait in the queue and are released at the configured rate.

```viz
{"type": "system", "scenario": "leaky-bucket", "title": "Leaky bucket as a queue: size 4, drains 1 per second", "caption": "Six requests arrive together. Four are queued and reach the server at t = 0, 1, 2, 3; two overflow and are dropped. The server sees a steady 1 per second, and the burst has been converted into queueing delay."}
```

The price is latency. A request at the back of a full queue waits $b / r$ seconds before it even starts, and it holds a connection the whole time. Size the queue by the delay you can accept, not by memory. NGINX's `nodelay` option forwards queued requests immediately while still counting them against the rate, which turns the shaper back into a token bucket.

**As a meter**: a counter that fills by one per request, leaks at `r` per second, and rejects any request that would overflow `b`. That is the token bucket upside down, and it makes identical decisions. When someone says "leaky bucket", ask whether requests wait or are rejected.

## GCRA: a token bucket in one number

The **generic cell rate algorithm** comes from ATM networks and is the cleverest implementation of a token bucket, because it stores one timestamp per key instead of two numbers.

Define the **emission interval** $T = 1/r$ (the time between requests at the sustained rate) and the **tolerance** $\tau = (b - 1) \cdot T$ (how far ahead of schedule a client may run). Each key stores a **theoretical arrival time** `TAT`, the time at which the client's schedule would be exactly caught up. For a request at time `t`:

```text
tat = max(TAT, t)
if tat - t > tau:
    reject; the request would be allowed at time tat - tau
else:
    TAT = tat + T; accept
```

Work it for a limit of 10 per minute with a burst of 10. Then $T = 6$ s and $\tau = 54$ s.

- Ten requests at t = 0: each is accepted and pushes `TAT` forward by 6 s. After the tenth, `TAT = 60`.
- An eleventh request at t = 0: `tat − t = 60 > 54`, rejected. It would be allowed at $60 - 54 = 6$ s, so `Retry-After: 6`.
- A request at t = 6: `60 − 6 = 54`, not greater than 54, accepted; `TAT = 66`.

One token regenerates every 6 seconds, the burst is 10, and the only state is `TAT`. That matters in practice: a single 64-bit value can be updated with an atomic compare-and-swap and no lock, and the rejection path computes an exact `Retry-After` for free. In Redis it is one key per client; the `redis-cell` module exposes it as a single command.

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

These are `governor` limiters, and `governor` implements GCRA. `Quota::per_minute(n)` means a burst of `n` and one replenished cell every $60/n$ seconds, so the password-attempt limiter is exactly the worked example above (one attempt per 6 s after a burst of 10), the auth limiter replenishes every 2 s after a burst of 30, the general limiter every 50 ms after a burst of 1,200, and the AI limiter every 3 s after a burst of 20. The state per key is one atomic timestamp in a concurrent map.

Things a reviewer should notice:

- **Layering.** The general limiter wraps every `/api` route and the routes that call the model add their own layer inside it, so a model call spends from both buckets. The auth bucket wraps only `/auth/register` and `/auth/login`, the unauthenticated routes that pay for an Argon2 password hash. Cheap, strict checks go on the expensive endpoints; a generous one protects everything.
- **For auth and general traffic the key is an IP, which is both too coarse and too fine.** Every user behind one university NAT shares a bucket, which is why the general limit was raised from 300 to a loose 1,200 per minute; the comment above gives the reasoning, and it only works because every expensive route has a tight bucket of its own. And an attacker with a botnet has thousands of keys. Per-IP limits are an abuse brake, not fairness.
- **The key decides what an attacker must vary.** A per-IP login limit does little against someone guessing one learner's password from a thousand addresses: each address gets its own allowance. So login and account deletion also call `Limiters::check_password_attempt`, which charges the attempt to the account, keyed by the email trimmed, lowercased and capped at 254 characters (the address has not been validated at that point, so an unbounded key would let a client fill the map with very long strings). Now the attacker gets 10 guesses a minute per account however many addresses they own, and case or whitespace variants do not buy a fresh allowance. Deletion is included because it asks for the password too, and a stolen session must not become a password-guessing oracle. The price, shared by every per-account limit, is that anyone who knows a learner's email can spend that learner's allowance and make their real login wait; a per-minute quota keeps that wait to seconds rather than a lockout.
- **The AI bucket is keyed by session instead.** Twenty model calls a minute shared by a whole classroom behind one address would throttle everyone, so that limiter's key is `enum ClientKey { Ip(IpAddr), Session([u8; 16]) }`. The middleware hashes the session cookie with SHA-256 and keeps the first 16 bytes (so raw session tokens never sit in the limiter's memory), falling back to the IP when there is no cookie. A client that invents cookies gets a fresh bucket for each, but authentication then rejects the request, and every attempt still spends from the per-IP general bucket. The bucket also wraps only the routes that call the model (sending a coach message, generating a quiz or roadmap suggestions, interview turns); listing conversations or reading history is ordinary traffic. `ai_throttling_is_per_session_and_only_for_model_calls` tests both: one learner's quiz requests start getting 429s once the burst of 20 is spent, while a second learner on the same IP is unaffected.
- **Which IP?** Behind a proxy the TCP peer is the proxy, so keying on it would put every user in one bucket and let one abuser lock everyone out. The fix is to read the client address from a header, but `X-Forwarded-For`'s first entry is whatever the client chose to send, and a client that sends a random value per request gets a fresh bucket per request. The code's comment records the rule: trust only a header that your own proxy sets and overwrites (Railway's `X-Real-IP` here, selected by `CLIENT_IP_HEADER`), and fall back to the socket peer.
- **`Retry-After` used to be a constant 60.** GCRA already knows the exact earliest time a request would be admitted (`governor` returns it in the rejection as a `NotUntil`), and for the password-attempt limiter that is 6 seconds, not 60. The limiter now sends the real value: `not_until.wait_time_from(now)`, rounded up to whole seconds and never less than 1, checked by `throttled_responses_say_when_to_retry` in `crates/api/tests/api.rs`, which also checks that a second account from the same address is not throttled. The web client uses it: a read that fails with 429 is retried at most twice, after the number of seconds the server asked for (capped at 10).
- **State is per process.** The module comment says so and names Redis as the path to horizontal scale. With three instances behind a round-robin balancer, each key effectively gets three times the limit.
- **Keys never expire on their own.** `governor`'s keyed store keeps an entry for every key it has ever seen until something calls `retain_recent()`. The first version never called it, so the maps grew with every distinct visitor. Now `Limiters::prune` calls `retain_recent()` and `shrink_to_fit()` on every limiter, from the same hourly task in `main.rs` that sweeps expired sessions.

The second layer is `crates/core/src/ai/budget.rs`, and it solves a different problem. The in-memory limiters smooth bursts; the budget caps **cost**: each user gets a daily allowance of AI requests and tokens, reset at midnight UTC. It is a fixed window counter stored in Postgres, one row per `(user_id, day)`. The fixed window is fine here: a user could spend a day's budget at 23:59 and another at 00:01, and the daily bill is still bounded.

The interesting part is how a request slot is reserved. The obvious version reads today's usage, compares it with the limit, and increments it in a second statement. Two concurrent requests from a user at 119 of 120 can then both read 119, both pass the check, and end at 121; with N concurrent requests the overshoot is N − 1. `check_and_reserve` does it in one statement instead:

```sql
INSERT INTO ai_usage (user_id, day, input_tokens, output_tokens, requests)
VALUES ($1, $2, 0, 0, 1)
ON CONFLICT (user_id, day) DO UPDATE
   SET requests = ai_usage.requests + 1
 WHERE ai_usage.requests < $3
   AND ai_usage.input_tokens < $4
   AND ai_usage.output_tokens < $5
RETURNING requests
```

The first request of the day inserts the row. Every later one hits the conflict, locks the existing row, and increments it only if the `WHERE` clause holds against the latest committed values. If the user is at a limit, nothing is updated, `RETURNING` produces no row, and the caller gets a rate-limit error. The check and the increment are one atomic step, so concurrent requests queue on the row lock instead of racing past the limit. It is the same move as the Redis script later in this lesson: put the read, the decision and the write in one place that executes atomically.

Ascend's first version was the obvious one (read the status, then increment in a second statement), and a design review caught it. The fix shipped with a test aimed at exactly that race: `ai_budget_reservation_cannot_be_overshot_by_concurrency` in `crates/api/tests/api.rs` fires 30 reservations at once against a limit of 10 and asserts that exactly 10 succeed, where the read-then-write version could grant more. A race you fixed without a concurrent test is a race you believe you fixed.

The token limits are softer, and it is worth being able to say why. Token counts are only known after the model responds, so `record` adds them after the call, and the reservation can only check that the user was under the token limits *before* the call. One long response can carry a user past the cap. A hard cap would need a reservation in tokens too: debit the request's `max_tokens` up front and refund the unused part afterwards, the way a card pre-authorisation works.

The pattern generalises: a cheap in-memory limiter absorbs bursts before any request touches the database, and a durable per-user quota enforces the thing the business actually cares about.

## Limiting across a fleet

Once there are `N` instances, per-process buckets stop meaning what their numbers say. There are three designs.

**Divide the limit.** Give each instance `limit / N`. It needs no coordination, and it is wrong whenever traffic is not spread evenly: sticky sessions, a client with one long-lived HTTP/2 connection pinned to one instance, or an autoscaler that changes `N` without anyone updating the division.

**Centralise the state.** Keep the bucket in Redis and update it atomically per request with a script:

```lua
-- KEYS[1]: bucket key. ARGV: capacity, rate (tokens/s), now (ms), cost
local capacity, rate = tonumber(ARGV[1]), tonumber(ARGV[2])
local now, cost = tonumber(ARGV[3]), tonumber(ARGV[4])
local state = redis.call("HMGET", KEYS[1], "tokens", "ts")
local tokens = tonumber(state[1]) or capacity
local ts = tonumber(state[2]) or now
tokens = math.min(capacity, tokens + (now - ts) / 1000 * rate)
local allowed = tokens >= cost
if allowed then tokens = tokens - cost end
redis.call("HSET", KEYS[1], "tokens", tokens, "ts", now)
redis.call("PEXPIRE", KEYS[1], math.ceil(capacity / rate * 1000))
return allowed and 1 or 0
```

The `PEXPIRE` is a small elegance: after `capacity / rate` seconds of silence the bucket would be full anyway, so deleting it is equivalent to keeping it, and idle keys clean themselves up. The costs are an extra round trip per request (well under a millisecond in the same zone), a new dependency on the request path, and hot keys: one huge tenant's bucket lives on one Redis shard. Take `now` from a single clock, or skew between application servers becomes rate error. And decide in advance what happens when Redis is unreachable. For abuse protection, **fail open**: an outage in the limiter should not become an outage of the site. For a paid quota, failing closed may be the right call.

**Go hybrid.** Each instance runs a local bucket and periodically synchronises with the central store, or leases a batch of tokens (say 50) at a time and returns to the store only when the lease runs out. Accuracy drops by at most the unsynchronised amount; load on the store drops by the batch size. Envoy offers both ends of this spectrum: a local rate limit filter (a token bucket per proxy) and a global rate limit service called over gRPC.

The full design, including multi-region and per-tenant configuration, is the [rate limiter case study](/learn/system-design/case-studies/rate-limiter). As a coding question ("implement a thread-safe limiter") it appears in [Concurrency interview problems](/learn/systems/concurrency/concurrency-interview-problems).

### Rate limits do not bound concurrency

A limit of 100 requests per second says nothing about how many are in flight. If each request takes 30 seconds because a dependency is slow, 100 per second means 3,000 concurrent requests, by Little's law, and your threads and connection pools are gone. Mature APIs run a **concurrency limiter** (a semaphore per key or per service) alongside the rate limiter, and shed low-priority load when the whole service is saturated. Netflix's open-source `concurrency-limits` library goes a step further and adjusts the limit automatically from observed latency, the same way TCP congestion control adjusts a window.

## Telling clients what happened

- **429** means this client is over its budget; **503** means the service is shedding load regardless of who is asking.
- **`Retry-After`** tells the client when to come back. GCRA and the sliding log compute it exactly.
- Budget headers (`X-RateLimit-Remaining` and friends, or the IETF draft's `RateLimit` fields) let clients pace themselves before they hit the wall.
- Clients must honour `Retry-After` with jitter, or every rejected client returns at the same instant, the retry discipline from [Timeouts, retries and backoff](/learn/networking/networking-in-practice/timeouts-retries-and-backoff).

## The algorithms side by side

| Algorithm | State per key | Burst behaviour | Boundary effect | Typical use |
|---|---|---|---|---|
| Fixed window | 1 counter | Up to 2× limit across a boundary | Yes, and synchronised resets | Daily or monthly quotas, billing caps |
| Sliding log | Up to `limit` timestamps | Exact | None | Low limits where exactness matters (login attempts) |
| Sliding counter | 2 counters | Approximate, bounded error | Smoothed | Per-client API limits in Redis |
| Token bucket | tokens + timestamp | Bursts up to `b`, then `r` | None | API gateways, cloud APIs, traffic shaping |
| Leaky bucket (queue) | Queue of up to `b` | Bursts become delay | None | Smoothing traffic to a fragile backend |
| GCRA | 1 timestamp | Same as token bucket | None | High-throughput limiters, exact `Retry-After` |

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
- You can name the fixed-window **boundary burst** and the synchronised-reset herd, and you still choose a fixed window for daily quotas because only the total matters there.
- You know "leaky bucket" means a **queue** (bursts become latency) or a **meter** (identical to a token bucket), and you ask which.
- You can explain **GCRA** as a token bucket stored in one timestamp, and why that makes lock-free updates and exact `Retry-After` values easy.
- You separate **rate limits, concurrency limits and quotas**, and you layer them: a cheap in-memory brake in front, a durable per-user cost budget behind, with the check and the increment in one atomic statement.
- For a fleet, you choose between divided, centralised and hybrid limiting explicitly, and you decide **fail-open versus fail-closed** before the limiter's datastore has its first outage.
- You check where the client IP comes from before trusting any per-IP limit.

## Check yourself

```quiz
- q: >-
    A fixed window limiter allows 100 requests per minute per client. What is the most a client can get through in any 2-second interval?
  options: ["About 3", "200", "Unlimited", "100"]
  answer: 1
  explanation: >-
    Send 100 in the last second of one window and 100 in the first second of the next: both windows are within their limit, and 200 requests land within two seconds. Sliding windows, token buckets and GCRA do not have this boundary effect.
- q: >-
    A sliding window counter has a limit of 60 per minute. The previous minute had 40 requests; you are 30 seconds into the current minute, which has had 35. Is the next request admitted?
  options: ["No, because the previous window alone used two thirds of the limit", "No, because 40 + 35 = 75 is more than the limit of 60", "Yes, because the estimate is 40 × 0.5 + 35 = 55, below 60", "Yes, because the current window's 35 is below 60"]
  answer: 2
  explanation: >-
    The previous window is weighted by the fraction of it still inside the sliding minute (0.5), giving 20 + 35 = 55. Adding the raw counts ignores that half the previous window has slid out; ignoring the previous window entirely would allow the boundary burst.
- q: >-
    A token bucket has capacity 10 and refills 5 tokens per second. Starting full, what is the maximum number of requests it admits in the first 4 seconds?
  options: ["10", "20", "30", "40"]
  answer: 2
  explanation: >-
    At most b + r·T = 10 + 5 × 4 = 30: the initial burst of 10, plus 20 tokens refilled over 4 seconds. The capacity bounds the burst, the rate bounds everything after it.
- q: >-
    You put a leaky bucket queue of size 50, draining at 10 requests per second, in front of a fragile service. What is the main new risk?
  options: ["Queued requests can wait about 5 s, past many clients' timeouts", "The service now receives bursts of up to 50 requests at once", "Queued requests are processed out of order when the queue fills", "Memory grows without bound because the queue never fully drains"]
  answer: 0
  explanation: >-
    A shaping queue converts bursts into delay: the last of 50 queued requests waits about 50 / 10 = 5 s, holding its connection the whole time. If the client's timeout is shorter, the work is wasted and probably retried. The service itself sees a steady 10 per second, never the burst, and the queue is bounded at 50. Size the queue by the delay you can accept.
- q: >-
    A daily quota is enforced by reading the user's usage and then incrementing it in a separate statement. A user at 119 of 120 sends two requests at the same instant. What can happen, and how does Ascend's budget code avoid it?
  options: ["Nothing; Postgres serialises the two statements, so Ascend needs no special care", "Both can read 119 and end at 121; Ascend's single conditional upsert rules it out", "Both are rejected as conflicts; Ascend retries the loser after a short backoff", "The second request deadlocks; Ascend avoids it by taking SELECT ... FOR UPDATE"]
  answer: 1
  explanation: >-
    Check-then-act across two statements is a race under the default isolation level (Read Committed does not serialise them): both reads can see 119 before either write lands. Ascend reserves with one statement, INSERT ... ON CONFLICT DO UPDATE SET requests = requests + 1 WHERE requests < limit RETURNING requests, so the two requests queue on the row lock; the second finds 120, updates nothing, gets no row back from RETURNING, and is rejected.
- q: >-
    Your service runs 5 instances, each with an in-process limit of 100 requests per second per API key, behind a round-robin load balancer. What does a client actually get, and what is the usual fix?
  options: ["Up to about 500 per second; keep one shared bucket per key, for example in Redis", "100 per second, since the limit is per key and every instance sees the same key", "20 per second, since the balancer splits the 100 limit five ways across instances", "It depends only on the client's retry policy, since rejected calls are retried"]
  answer: 0
  explanation: >-
    Each instance enforces its own bucket and none of them knows about the others, so a client spread across all five gets up to five times the limit. Centralised state gives one bucket per key at the cost of a round trip and a dependency. Dividing the limit by the instance count is the no-coordination alternative: free, but wrong under uneven balancing or autoscaling.
```
