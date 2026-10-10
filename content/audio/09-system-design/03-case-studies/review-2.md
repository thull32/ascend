---
review: case-studies
source: e8538709d7d6f871
---
## Introduction

Twelve more questions from the case-studies module, from rate limiting and ride sharing to ticket booking and Netflix's resilience. Answer out loud before the answer comes.

## Question 1

The Redis cluster behind an API rate limiter becomes unreachable. Which policy is best?

A, fail closed for every rule, so no client can exceed any of its limits. B, fail open for every rule, since API availability matters most of all. C, queue requests at the gateway until the Redis cluster is reachable again. D, fail open through local buckets for fairness limits, but fail closed for security limits.

[think]

The answer is D. Fairness limits exist to share capacity, and a few approximate minutes through a local fallback bucket beat an API outage. Login and one-time passcode limits exist to stop brute force, and admitting them unmetered opens exactly the window an attacker wants. Failing open for everything misses that distinction, and queuing turns the outage into latency and memory growth.

## Question 2

In the ride-sharing simulation, batched matching cut mean pickup time by 14 percent with 11 drivers for 10 riders, but only 4.5 percent with 30 drivers. What should you conclude?

A, batching pays most when supply is tight; tune the batch window per zone. B, the batch should grow until every rider gets their nearest driver. C, greedy matching is optimal once there are more drivers than riders. D, batching always pays, so every zone should batch requests.

[think]

The answer is A. With plentiful drivers, greedy choices rarely conflict, so the optimal assignment gains little while the batch window still adds delay. With scarce supply, one greedy choice often steals the only good driver for the next rider. Greedy is not optimal even with surplus drivers, and no assignment guarantees every rider their individually nearest driver.

## Question 3

In the payment system, a call to the payment provider times out during a charge. Which response is correct?

A, mark the payment succeeded, since most charges succeed. B, mark the payment failed so the customer can retry. C, retry immediately on a second provider to get a definite answer. D, keep it in processing, retry with the same idempotency key, and reconcile.

[think]

The answer is D. The outcome is unknown, so the payment stays in processing, is retried with the same key, and is resolved by a webhook or a status query. Marking it failed invites a retry with a new intent, and trying a second provider can charge twice if the first one succeeded. Guessing success gives the product away when the charge actually failed.

## Question 4

In the distributed cache, a reader misses, reads version 1 from the database, and pauses. A writer commits version 2 and deletes the key. The reader then sets version 1. What prevents that stale value from living until its TTL?

A, having the reader fetch from a database replica. B, a shorter TTL, so the stale value expires sooner. C, a lease: the writer's delete voids the reader's token. D, having the writer update the cache instead of deleting.

[think]

The answer is C. The race is between a slow set and a delete, and a lease, or a set guarded by a version, makes the slow set fail. Updating instead of deleting creates an ordering race between writers. A shorter TTL only shortens the window, and a replica adds lag and makes it worse.

## Question 5

A web crawler has two equally important pages, both crawled once a day. Page A changes about once an hour; page B about once a day. You can afford one extra crawl per day. Which choice improves average freshness more?

A, crawl neither, and rely on sitemaps to signal the changes. B, crawl A more, because it changes 24 times as often. C, crawl B more, because one more crawl barely helps A. D, it makes no difference, since both pages matter equally.

[think]

The answer is C. A second daily crawl takes B from about 63 percent fresh to 79. A only goes from about 4 percent to 8, because it changes faster than any affordable crawl rate. Spending budget in proportion to change rate is the intuitive mistake.

## Question 6

A host's robots dot text returns a 503 server error for an hour. What should the crawler do under the robots exclusion standard?

A, crawl only the home page until robots dot text comes back. B, treat it as a full disallow until the file can be fetched. C, delete the host and its URLs from the URL table. D, treat the site as having no restrictions and crawl normally.

[think]

The answer is B. A server error on robots dot text signals an unhealthy site, and the standard says to assume complete disallow, although a crawler may keep using its cached copy meanwhile. A 404, in contrast, means no restrictions. Crawling hard while a site is failing is exactly the rudeness the protocol exists to prevent.

## Question 7

In the ticket booking measurements, holds aimed at the best 2 thousand seats ran at 66,600 attempts a second, while holds spread over all 50 thousand seats ran at about 9 thousand. Why were the contended attempts faster?

A, hot rows stay in the buffer cache, so each read is quicker. B, Postgres batches updates that target the same rows together. C, the hot seats were locked, so attempts were queued and skipped. D, most attempts matched no rows, and an update that changes no rows writes nothing to the write-ahead log.

[think]

The answer is D. Nearly all attempts on the hot seats found them already held, updated nothing, and committed without writing to the log or waiting for a flush. Successful holds pay for a durable commit. So contention on the best seats is not a throughput problem; a single hot counter row is.

## Question 8

A ticket buyer clicks Pay two seconds before their hold expires, and the payment provider takes three seconds. What stops another fan from claiming the seats in the meantime?

A, checkout moves the seats to payment pending, a state no claim matches. B, the client keeps the hold alive by polling the order status. C, the provider's authorisation locks the seats in the database. D, the sweeper skips holds whose owners have clicked Pay recently.

[think]

The answer is A. Checkout's conditional update succeeds only while the hold is live, and moves the seats to a state the lazy-expiry clause does not match, extending the deadline for the payment. The provider knows nothing about seats, polling does not extend holds, and correctness never depends on the sweeper.

## Question 9

In ad click aggregation, the stream job checkpoints after emitting a count of 202, emits 278 ten seconds later, crashes, and replays from the checkpoint. The window's true count is 412. What does a sink that adds increments end up showing?

A, 278, because output after the crash is discarded. B, 488, because the 76 clicks after the checkpoint count twice. C, 412, because the checkpoint restores the job's state. D, 202, because the sink rolls back to the checkpoint.

[think]

The answer is B, 488. The restored job believes it has emitted 202, so it re-emits the increment for 76 clicks it had already reported. The sink is outside the checkpoint and keeps everything written. A sink that upserts the absolute count rewrites the same key and ends at 412.

## Question 10

Pod A serves 9 thousand requests with a 99th percentile of 69 milliseconds. Pod B serves a thousand with a 99th percentile of 520. Which method gives a fleet 99th percentile close to the true 463 milliseconds?

A, sum both pods' histogram buckets, then interpolate. B, weight the two percentiles by traffic, which gives about 114. C, average the two percentiles, which gives about 295. D, take the larger one, since the tail is set by the slow pod.

[think]

The answer is A. Quantiles are not additive, so any average of per-pod percentiles describes nothing. Summing the bucket counts gives the merged distribution, and interpolating inside the 400 to 500 millisecond bucket gives about 484, within one bucket width of the truth. The maximum is only an upper-bound heuristic, here 57 milliseconds too high.

## Question 11

In the Netflix resilience simulation, adding one-second timeouts still left 72 percent of requests rejected, including playback requests that never call the slow dependency. Why?

A, 700 home pages a second, each holding a thread for one second, need about 700 threads, and the pool has 200. B, playback shares the slow dependency's database connection. C, the circuit breaker opened and rejected every request at the edge. D, timeouts add retries, which double the load on the pool.

[think]

The answer is A. By Little's law, threads in use equal the arrival rate times how long each is held. Each home page now holds its thread for the full second, so about 715 threads are wanted against 200, and every other request, playback included, finds the pool full. A bulkhead sized from normal concurrency caps what the slow dependency can hold.

## Question 12

The API, a mid-tier service and a client library each make up to three attempts. The bottom dependency is completely down. How many attempts reach it per home page?

A, 3, one set of retries for the whole request. B, 27, three at each of three nested layers. C, 9, three attempts at each of the top two layers. D, about 2, because retries mostly succeed.

[think]

The answer is B, 27. Each attempt at one layer triggers the full retry sequence of the layer below, so attempts multiply: three times three times three. At a 50 percent failure rate the same policy gives only about 2, because the upper layers mostly see success, which is why amplification peaks exactly when the dependency is down. One retrying layer with a 10 percent budget caps it.

## Recap

Three ideas kept returning. An unknown outcome is not a failure: keep it pending, retry with the same key, and reconcile. Make the claim and the state change one conditional write, so a stale reader, a slow payment or a replay cannot double anything. And do the arithmetic before you trust a mechanism: Little's law for threads, multiplication for retries, and merged histograms, never averaged percentiles.
