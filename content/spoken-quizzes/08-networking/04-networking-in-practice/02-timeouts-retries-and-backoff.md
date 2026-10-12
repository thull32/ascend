---
lesson: timeouts-retries-and-backoff
source: c0a272399b34dd24
---
## 1

A dependency's latency is 30 milliseconds at the median, 250 at the 99th percentile, and 900 at the 99.9th. Your call has a total budget of 1,000 milliseconds. Which request timeout is the most defensible?

A, 30 milliseconds, the median, to keep the service fast. B, 1,000 milliseconds, matching the caller's whole budget exactly. C, 900 milliseconds, the 99.9th percentile, so almost nothing is cut off. D, 300 milliseconds, slightly above the 99th percentile, leaving room to retry.

[think]

The answer is D: 300 milliseconds, slightly above the 99th percentile, leaving room to retry.

Slightly above the 99th percentile cancels the genuinely stuck 1 percent, while leaving budget for a single backoff and retry within the 1,000 millisecond deadline. 30 milliseconds cuts through the body of the distribution, and would cancel and retry half your traffic. 900 or 1,000 milliseconds leaves no room to recover from a slow attempt.

## 2

A request to create an order, a POST with a 500 millisecond read timeout, times out. The order service does not support idempotency keys. What should the client do?

A, do not retry, and surface the ambiguous outcome. B, send a GET first, then retry the POST if the order is absent. C, retry after a jittered exponential backoff delay. D, retry immediately, since timeouts are usually transient.

[think]

The answer is A: do not retry, and surface the ambiguous outcome.

A read timeout means the server may have created the order. Without an idempotency key, a retry, with or without backoff, risks a duplicate, and a GET cannot reliably tell whether a still-running create will land. Connect failures are retryable; ambiguous outcomes on non-idempotent operations are surfaced to the caller instead.

## 3

A service calls a dependency whose instance was terminated, and packets to the old IP address are silently dropped. The client sets no connect timeout, and Linux uses its defaults. What happens to each call?

A, it blocks for about 130 seconds while the kernel retransmits its connection attempts. B, it fails after about 3 seconds, once two retransmits go unanswered. C, it fails at once, because the kernel receives a reset. D, it blocks until the read timeout fires, since connect has no limit.

[think]

The answer is A: it blocks for about 130 seconds while the kernel retransmits its connection attempts.

A black-holed address sends nothing back, neither an answer nor a reset, so the kernel keeps retransmitting the opening packet with growing timeouts, and gives up after its retry limit: about 130 seconds, as measured in the lesson. A reset only comes from a live host with a closed port, and the read timeout never starts because the connection never opens.

## 4

A gRPC channel uses retry throttling with a maximum of 10 tokens and a token ratio of 0.1. Above roughly what failure rate do retries stay switched off?

A, about 9 percent of attempts. B, about 50 percent. C, about 1 percent. D, about 90 percent.

[think]

The answer is A: about 9 percent of attempts.

Each failure costs 1 token and each success earns 0.1, so the token count drifts downwards once failures exceed 1 attempt in 11, about 9 percent. The tokens then sink below half the maximum, and retries stop. The 50 percent figure confuses the token threshold with a failure rate.

## 5

In the lesson's simulation of a thousand clients, plain exponential backoff without jitter took nearly 33 seconds to drain the herd, while the jittered variants took 2 to 3.7 seconds. Why?

A, every client reached the 10 second cap on its very first retry. B, retries arrived in synchronised waves separated by idle buckets. C, the server penalised deterministic retries with longer queues. D, its sleeps were shorter, so more retries were rejected outright.

[think]

The answer is B: retries arrived in synchronised waves separated by idle buckets.

Without jitter, every rejected client computes the same sleep, so the herd arrives together at 110, 320 and 730 milliseconds, and so on. Each wave gets one bucket's worth of admissions, and the buckets in between sit idle. Jitter spreads the same clients across those idle buckets. The sleeps were the same length, not shorter, and the cap is reached only after several doublings.

## 6

Hedging at the 95th percentile cut the simulated 99th percentile from 145 milliseconds to 36. What does it cost, and what must be true for it to work?

A, about 5 percent more requests, and slowness must be per replica. B, about 50 percent more requests, and the call must be read-only. C, about 5 percent more requests, and replicas must share one queue. D, no extra requests, since the loser is always cancelled.

[think]

The answer is A: about 5 percent more requests, and slowness must be per replica.

Only requests still pending at the 95th percentile send a second copy, so the extra load is about 5 percent. The gain relies on the second replica being unlikely to be slow at the same time; when slowness is shared, the hedge waits just as long and adds load. Cancellation reduces wasted work, but the hedge has already been sent, so the extra requests are not free.
