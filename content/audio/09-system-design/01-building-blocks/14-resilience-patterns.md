---
lesson: resilience-patterns
source: 44d853c5045e612f
fit: great
desk:
  - "The timeout budget table for the five-layer call chain"
  - "The circuit breaker traced call by call, and the library defaults"
  - "The overload simulation table and the AIMD limiter code"
  - "Exercise: replay calls through a count-based circuit breaker"
---
## Introduction

The recommendations service starts responding in 8 seconds instead of 80 milliseconds. Nothing is down. But the home page calls recommendations synchronously, with a 30-second timeout, so every home page request now holds a thread for 8 seconds. The home page service has 200 threads. At 50 requests a second it would need 400 to keep up, so within four seconds every thread is waiting on recommendations. The home page, the search bar and the login flow that share the service all return errors. A non-critical feature being slow has taken down the product.

Here is the idea underneath this whole topic. Slow is worse than dead. A dead dependency fails fast and the caller moves on. A slow one eats the caller's capacity while giving nothing back.

Every pattern here does one of three things. It turns slow into fast failure: timeouts and circuit breakers. It bounds how much of your capacity one dependency can hold: bulkheads and bounded queues. Or it chooses what to drop when there is not enough to go round: load shedding and adaptive limits. Each comes with the arithmetic that sets its numbers.

## Timeouts as a budget

Every call has a timeout, and you set it from the callee's latency distribution, not its mean. If a dependency's 99th percentile is 120 milliseconds, a 150-millisecond timeout cuts off about 1 percent of calls, which you retry or degrade, and stops the tail from occupying threads. A 5-second timeout "to be safe" protects nothing. By the time it fires, your own caller has given up.

Then make timeouts nest. Each layer's timeout must exceed the worst case of the layer below, so the callee fails first with a clean error instead of being abandoned mid-work. The lesson builds a chain from a database up to a client. The database has a 60-millisecond statement timeout. Pricing calls it with a 70-millisecond timeout, just above that. Checkout calls pricing with 120 milliseconds per attempt, two attempts, for a worst case of 320. The edge gives checkout 400. And the client's whole deadline is a second, which leaves 570 milliseconds of slack.

Notice that only checkout retries, because it sits next to the flaky dependency. So a pricing service that is hard down receives at most twice its traffic. If all four layers retried twice, it would get 16 times. And three layers of three attempts each send 27 times the traffic to the dependency that is already failing.

The per-attempt numbers are defaults. The real bound is a propagated deadline: pass the remaining milliseconds down with the request, gRPC does it natively, and a hop whose remaining budget is below its own median latency rejects at once instead of starting work that cannot finish.

## Circuit breakers

A timeout still spends the timeout. If recommendations is down, every call waits 150 milliseconds to find out. At 50 requests a second, that is seven and a half thread-seconds every second spent on a dependency you already know is dead. A circuit breaker remembers that the dependency is failing, and fails in microseconds instead.

Follow one, call by call. Its settings: judge the last 6 calls, but only once there are at least 4. Open at 50 percent failures. Stay open 5 seconds, then allow 2 trial calls. And any call slower than 150 milliseconds counts as a failure.

The first two calls succeed. The third fails. Three calls is under the minimum, so nothing is judged yet. The fourth call returns a success, but after 900 milliseconds, so it counts as a failure. Two of four: 50 percent. The breaker opens. For the next 5 seconds, 249 calls fail in microseconds, the fallback is served, and the dependency gets quiet time to recover. Then two trial calls: one fails, one succeeds. Fifty percent again, so it opens for another 5 seconds. Next time both trials succeed, and it closes.

[pause]

Two settings in that trace carry the weight. The minimum call count is why one early failure cannot trip it: without it, one failure out of one call is a 100 percent failure rate, and a low-traffic endpoint flaps all day. And counting slow calls as failures is why the fourth call mattered. It succeeded, eventually, while holding a thread for 900 milliseconds.

Library defaults are starting points, not answers. One popular library counts a call as slow only at 60 seconds and judges only after 100 calls. Sixty seconds is useless for a 150-millisecond dependency, and 100 calls never trips on an endpoint that gets 20 a minute.

Three configuration decisions matter most. Key breakers per dependency, often per operation, because one breaker around all outbound calls opens for everything. Decide the fallback in advance, and make sure it does not depend on the thing that failed. And alert on a breaker that stays open for more than a few minutes, because a breaker that never closes is an outage the dashboard shows as green.

## Bulkheads and bounded queues

A ship's hull is split into compartments so one breach does not sink it. In a service the compartments are pools, threads, connections, queue slots, allocated per dependency, so one dependency's slowness cannot take the capacity another needs.

The opening story is a missing bulkhead. Little's law says the concurrency a dependency demands is throughput times latency: 50 a second times 8 seconds is 400 threads, against a shared pool of 200. Give recommendations its own bulkhead of 20 threads instead. It fills its 20, further calls are rejected at once and the fallback renders, and the other 180 threads keep serving search and login. To size it: rate times the 99th percentile times a margin. 50 a second times 0.12 seconds times 3 is about 20.

A bulkhead and a breaker are not alternatives. A breaker is about time: it stops calling something that has been failing. A bulkhead is about space: it caps what one dependency can hold, failing or not. A dependency at 40 percent errors and 5 seconds of latency never trips a 50 percent breaker, but it fills a shared pool. The bulkhead catches it. You want both, with one fallback behind them.

The same thinking applies to queues. An unbounded queue turns overload into memory exhaustion. It looks fine until it holds two million requests whose clients gave up minutes ago. So size every queue from the delay you will tolerate. At a service rate of a thousand a second, 100 slots add at most 100 milliseconds of waiting. 100 thousand slots add 100 seconds, and nothing that has waited 100 seconds is still wanted. Small queues fail fast. That is the point.

## Shedding and adaptive limits

When demand exceeds capacity, you can serve everyone badly or some people well. Shedding chooses the second, in a set order. First, requests already past their deadline, since nobody is waiting for them. Then by priority tier: analytics beacons and prefetches, then browsing, and never checkout or authentication while a lower tier remains. Then tenants above their fair share. Shed at the edge, where it is cheapest, with a 503 and a Retry-After.

The hard part is knowing where capacity ends. The lesson simulated a server with 16 workers, 1,200 requests a second arriving, and a 500-millisecond client deadline. For 30 seconds it can handle 1,600 a second. Then a slow dependency halves that to 800. With no limit at all, how many good responses a second do you think it delivers in the second half?

[pause]

39. The queue grows by 400 a second, every request waits past its deadline, and the server spends 97 percent of its capacity on work nobody will read. A fixed limit of a thousand in flight, which is too high, behaved the same. A fixed limit of 32 delivered all 800, but only because it was sized knowing the answer in advance. And a fixed limit is right on the day it is measured and wrong after the next deploy or instance change.

Adaptive limits infer capacity from latency, the way TCP infers bandwidth. The simplest is additive increase, multiplicative decrease: add one to the limit on every fast success, and multiply it by 0.9 whenever latency passes a target, 50 milliseconds here. Without being told anything, it delivered 666 a second, about 83 percent of capacity. A naive gradient limiter, which shrinks whenever latency is more than twice the fastest it has ever seen, held latency low by admitting only about half of capacity. Netflix's second-generation limiter uses a smoothed long-term baseline instead of the minimum, for exactly that reason. The choice of baseline is the whole game, and an adaptive limit trades a stale number for a tuning problem you test under load before trusting it.

## Degrading on purpose

Every pattern so far ends in a rejection, and a rejection is graceful only if the product planned for it. Personalised home rows fall back to popular rows by region, from an in-process cache. Search falls back to browsing categories. Shipping options fall back to standard shipping at a default price. Analytics beacons are simply dropped. Netflix described this in 2011: members should keep watching even if the experience is slightly degraded and less personalised, and every dependency had one of three fallbacks: a response built from local data, fail silent, or fail fast.

Watch health checks too. A readiness check that returns healthy only if the shared database answers means that when the database slows, every instance fails together and the load balancer removes the whole fleet, turning degraded into down. Readiness looks at local state only. Shared dependencies are the job of breakers and fallbacks.

And a fallback that has never run has a bug. Resilience that has not been exercised is a hypothesis. Chaos engineering tests it in production with a small blast radius: kill an instance, or add 200 milliseconds of latency to one dependency for 5 percent of traffic. State the steady-state metric, say stream starts per second, inject, watch, and stop the moment it moves.

## In the interview

Recommendations becomes slow. What happens to the home page?

[pause]

Nothing the user notices. The call has a 150-millisecond timeout from its 99th percentile, a bulkhead of 20 threads, and a breaker for that dependency that counts slow calls as failures. When it opens, the page renders popular rows from an in-process cache, and the metric you watch, stream starts, does not move. And you say you have injected exactly this latency before. The wrong answer is "raise the thread pool to a thousand", which by Little's law only delays exhaustion by seconds.

And: you are at capacity and traffic is still rising; what do you drop? Expired work first, then low tiers, with a 503 and Retry-After at the edge, behind an adaptive concurrency limit tested under load. The wrong answer is "queue everything and autoscale", when the queue makes every request late long before new instances arrive.

## Recap

Four things to remember. Slow is worse than dead, so every pattern converts slow into a fast, bounded failure. Set timeouts from the 99th percentile, nest them so callees fail first, retry in one layer only, and propagate the deadline. Use a breaker with a minimum call count that counts slow calls as failures, and a bulkhead sized by Little's law, because each catches what the other misses. And bound every queue, shed by deadline and priority, and remember the simulation: no limit delivered 39 good responses a second under overload, an adaptive limit 666.

At your desk: the timeout budget table, the breaker trace and library defaults, the overload simulation and limiter code, and the circuit breaker exercise.
