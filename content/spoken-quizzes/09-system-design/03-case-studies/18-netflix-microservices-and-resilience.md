---
lesson: netflix-microservices-and-resilience
source: 7c852e4c2afefcab
---
## 1

A home page synchronously depends on 30 services, each 99.99 percent available. What does the arithmetic imply for the design?

A, it fails about 0.3 percent of the time, so failures must degrade, not error. B, the page should call the services in sequence, not in parallel. C, the page is 99.99 percent available, so nothing is needed. D, each dependency must be 99.999 percent available, and that is sufficient.

[think]

The answer is A: it fails about 0.3 percent of the time, so failures must degrade, not error.

0.9999 to the 30th is about 0.997, so the page fails about 0.3 percent of the time, even when every dependency meets its SLO. At high volume, that is a constant stream of failed pages, so most dependency failures must become degraded success. Tightening every SLO helps less, and costs far more.

## 2

In the simulation, adding one-second timeouts still left 72 percent of requests rejected, including playback requests that never call the slow dependency. Why?

A, 700 home pages a second, held for 1 second each, need about 700 threads, and the pool has 200. B, playback shares the slow dependency's database connection. C, the breaker opened, and rejected every request at the edge. D, timeouts add retries, which double the load on the pool.

[think]

The answer is A: 700 home pages a second, held for 1 second each, need about 700 threads, and the pool has 200.

By Little's law, threads in use equal the arrival rate times the time each is held. Each home page now holds its thread for the full one-second timeout, so about 715 threads are wanted against 200, and every other request, playback included, finds the pool full. A bulkhead sized from normal concurrency caps what the slow dependency can hold.

## 3

The dependency fails at 10 seconds, but the Hystrix-style breaker, with a 10-second window, a 20-request minimum and a 50 percent error threshold, opens only at about 15 seconds. Why the delay?

A, timeouts are not counted as failures until the call is retried. B, the breaker waits one sleep window of 5 seconds before it may open. C, the volume threshold of 20 requests takes 5 seconds to accumulate. D, its window held 5 seconds of successes, so errors reached 50 percent late.

[think]

The answer is D: its window held 5 seconds of successes, so errors reached 50 percent late.

The error percentage is computed over the whole rolling window. At 700 calls a second, 20 requests arrive in milliseconds, but the window also holds the healthy calls from before the incident, so failures reach half of it only when about half the window is after the incident. The sleep window applies after opening, not before.

## 4

The API, a mid-tier service, and a client library each make up to three attempts. The bottom dependency is fully down. How many attempts reach it per home page?

A, 3, one set of retries for the whole request. B, 27, three at each of three nested layers. C, 9, three attempts at each of the top two layers. D, about 2, because retries mostly succeed.

[think]

The answer is B: 27, three at each of three nested layers.

Each attempt at a layer triggers the full retry sequence of the layer below, so attempts multiply: 3 times 3 times 3 is 27. At a 50 percent failure rate, the same policy gives about 2, because upper layers mostly see success, which is why amplification peaks exactly when the dependency is down. One retrying layer with a 10 percent budget caps it at 1.1.

## 5

A chaos experiment uses 1 percent of traffic for the control group and 1 percent for the experiment group, at 5,000 stream starts a second. What does one minute of data let you detect at 3 standard deviations?

A, a drop of about half a percent, the natural noise in stream starts. B, any drop at all, because the groups are large. C, a drop of about 8 percent or more in the experiment's starts. D, only a complete outage of the experiment group.

[think]

The answer is C: a drop of about 8 percent or more in the experiment's starts.

Each group sees about 3,000 starts in a minute. The standard deviation of the difference is the square root of 6,000, about 77, so 3 standard deviations is about 232 starts, 7.7 percent of 3,000. After ten minutes, the same threshold resolves about 2.4 percent. The metric's volume sets how small a blast radius can still detect harm quickly.

## 6

Three active-active regions each run at 65 percent of capacity at peak. One region must be evacuated. What happens if traffic is shifted before the survivors scale up?

A, each survivor hits about 98 percent, with almost no headroom left. B, the evacuated region keeps serving until the survivors scale. C, nothing, because each survivor rises to about 72 percent of capacity. D, DNS drops the evacuated region's traffic until scaling ends.

[think]

The answer is A: each survivor hits about 98 percent, with almost no headroom left.

The survivors must carry one and a half times their load, so 65 percent becomes about 98, and any wobble overloads them and spreads the failure. Pre-scaling, or permanent headroom, comes before the shift.
