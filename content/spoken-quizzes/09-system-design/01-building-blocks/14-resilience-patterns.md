---
lesson: resilience-patterns
source: 60502164eda251cc
---
## 1

A service with 200 shared threads calls a dependency at 50 requests per second. The dependency's latency rises to 8 seconds. Roughly how long until every thread is blocked on it?

A, about 4 seconds. B, never, because the calls time out. C, about 40 seconds. D, about 8 seconds.

[think]

The answer is A: about 4 seconds.

Little's law says 50 a second times 8 seconds, or 400 concurrent calls, are needed. The pool has 200, which fills at 50 new blocked calls a second, so in about 4 seconds. A 30-second timeout does not help, because the calls are blocked long before it fires. A bulkhead of 20 threads would cap the damage at 20.

## 2

A circuit breaker trips after a single failed call. What is most likely misconfigured?

A, the number of half-open trial calls. B, the minimum number of calls per window. C, the fallback that runs when a call fails. D, the cool-down period before it tries again.

[think]

The answer is B: the minimum number of calls per window.

An error rate over a window needs a minimum number of samples before it is evaluated, or one failure out of one call is a 100 percent error rate. Cool-down and half-open settings affect recovery, not the initial trip, and the fallback runs after the trip.

## 3

A dependency's latency rises to 5 seconds, but only 30 percent of calls fail outright. The breaker's threshold is 50 percent failures, and slow calls are not counted. What happens to the caller?

A, the load balancer removes the dependency from rotation. B, the breaker opens at once, since latency is above the timeout. C, nothing, because 70 percent of the calls still succeed. D, the breaker stays closed while slow calls fill the caller's pool.

[think]

The answer is D: the breaker stays closed while slow calls fill the caller's pool.

Failures stay under the threshold, so the breaker never opens, yet each call holds a thread for 5 seconds, and by Little's law the pool fills. Counting slow calls as failures, and a bulkhead that caps the dependency's share of threads, both catch it.

## 4

The gateway's timeout is 2 seconds, and the service it calls has a 5-second timeout on its database call. What happens during database slowness?

A, the service returns partial results within the 2-second budget. B, requests fail cleanly at the gateway, with no wasted work. C, the gateway retries while the service is still working. D, the database timeout fires first and protects the gateway.

[think]

The answer is C: the gateway retries while the service is still working.

Timeouts must nest, so the inner worst case fits inside the outer timeout. A longer inner timeout means the caller abandons and retries while the original attempt still consumes capacity, multiplying load for no benefit. Deadline propagation prevents starting work that cannot finish in time.

## 5

In the lesson's simulation, capacity halves while offered load stays at 1,200 requests per second. Why did the server with no concurrency limit deliver only 39 good responses per second?

A, it rejected most arrivals once its sixteen workers were busy. B, its queue grew until every wait exceeded the deadline. C, retries from clients tripled the load it had to serve. D, the workers crashed from memory pressure as the queue grew.

[think]

The answer is B: its queue grew until every wait exceeded the deadline.

The queue grew by 400 requests a second, so waits quickly exceeded the 500 millisecond deadline, and the server spent nearly all its capacity finishing requests nobody was waiting for. There were no rejections and no retries in the model. A limit near capacity kept the good responses at 666 to 800 a second.

## 6

Traffic exceeds capacity by 30 percent. Which shedding policy best protects the business?

A, reject every request from the single busiest client. B, queue the excess, and process everything in arrival order. C, drop expired requests first, then the lowest-priority tiers. D, reject a random 30 percent of requests, spread evenly across tiers.

[think]

The answer is C: drop expired requests first, then the lowest-priority tiers.

Work whose deadline has expired is worthless, and priority tiers preserve the requests that bring in revenue: analytics and prefetch go before browsing, and never checkout or authentication while lower tiers remain. Random shedding drops payments, blocking one client may be unfair and insufficient, and unbounded queues add latency until everything times out.
