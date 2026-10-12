---
lesson: microservices-vs-monolith
source: 451c7f41fd693d62
---
## 1

A user request calls five services in sequence, each with 99.9 percent availability. What is the request's availability, approximately?

A, 99.9 percent. B, 99.98 percent. C, 95 percent. D, 99.5 percent.

[think]

The answer is D: 99.5 percent.

Availabilities in series multiply: 0.999 to the fifth is about 0.995. That is about 3.6 hours of downtime a month, against 43 minutes for one service. This is the core cost of synchronous chains.

## 2

Which of these is the strongest signal that a system is a distributed monolith?

A, it runs every service on one shared Kubernetes cluster. B, it has grown to more than ten separately deployed services. C, several services read and write the same tables. D, its services call each other over gRPC instead of REST.

[think]

The answer is C: several services read and write the same tables.

A shared database means schema changes require coordinating every service, which removes independent deployability, the one benefit that justified the split. Protocol, count and platform are neutral, and ten services that deploy independently are not a monolith.

## 3

Each service call has a median of 5 milliseconds and a 99th percentile of 50, with a skewed distribution. Five are made in sequence. In the lesson's simulation, what was the chain's median?

A, about 250 milliseconds, since every call lands in its tail. B, exactly 25 milliseconds, because the medians of sequential calls add up. C, about 5 milliseconds, since sequential calls overlap in time. D, about 35 milliseconds, since skew makes each mean exceed its median.

[think]

The answer is D: about 35 milliseconds, since skew makes each mean exceed its median.

Medians do not add for skewed distributions. Each call's mean is about 8.2 milliseconds, and the sum of five behaves like the sum of the means, so the simulated median was 35.3 milliseconds, and a quarter of requests exceeded 50. Sequential calls do not overlap, and most calls are not in their tail.

## 4

Pricing slows from 20 milliseconds to 2 seconds. Checkout, at 200 requests a second with 100 threads, calls it synchronously, and a shared gateway pool also serves browsing. Why does browsing fail within about two seconds?

A, gateway threads fill up waiting on a saturated checkout. B, browsing calls pricing indirectly through a shared cache layer. C, pricing's slow database also serves every browse request. D, the load balancer marks the whole gateway unhealthy at once.

[think]

The answer is A: gateway threads fill up waiting on a saturated checkout.

By Little's law, checkout would need 200 times 2, or 400 threads, so its 100 fill in half a second. Requests then wait in the gateway's shared pool, which fills too, leaving no thread for browsing. A bulkhead per route, and a timeout near pricing's 99th percentile, would have contained it.

## 5

What is the safest way to move the notifications module out of a monolith?

A, rewrite it as a service, and switch all of the traffic on release day. B, have the new service keep reading the monolith's tables for good. C, move traffic over gradually behind a facade, then retire the module. D, fork the monolith, and delete everything except notifications.

[think]

The answer is C: move traffic over gradually behind a facade, then retire the module.

The strangler fig puts a facade in front, routes a growing share of traffic to the new service, migrates data ownership with change data capture and checksums, and only then retires the module, so each step is reversible and observable. A big-bang switch has no rollback granularity, forking the monolith duplicates everything, and permanently sharing tables recreates the distributed monolith.

## 6

Every call to one internal service takes about 40 milliseconds, whatever the payload size, while the service's own handler time is under 1 millisecond. What is the likely cause?

A, Nagle's algorithm holding a second write until a delayed acknowledgement. B, cross-zone routing that adds a fixed 40 milliseconds to each hop. C, TLS renegotiation on every request over a kept-alive connection. D, serialising JSON payloads on a slow single-threaded server.

[think]

The answer is A: Nagle's algorithm holding a second write until a delayed acknowledgement.

A response written in two small sends, with Nagle on, waits for the acknowledgement of the first, and the client's kernel delays that acknowledgement by at least 40 milliseconds on Linux. The lesson measured 44 milliseconds per call on loopback. The no-delay option, or a single write, fixes it. Serialisation scales with payload size, and cross-zone latency is on the order of a millisecond.
