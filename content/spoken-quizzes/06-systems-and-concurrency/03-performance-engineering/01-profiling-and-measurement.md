---
lesson: profiling-and-measurement
source: 69bcad27a5dbed7e
---
## 1

A page fans out to 50 backend calls in parallel and waits for all of them. Each backend takes more than 200 milliseconds on 1 percent of calls, independently. Roughly how often does the page wait more than 200 milliseconds?

A, about 5 percent of the time. B, about 1 percent of the time. C, about 99 percent of the time. D, about 40 percent of the time.

[think]

The answer is D: about 40 percent of the time.

The page is slow if any one call is slow. The chance that all 50 are fast is 0.99 multiplied by itself 50 times, about 61 percent, so the page is slow about 39 percent of the time. Tail latency compounds under fan-out, which is why backends behind fan-out need tight 99th or 99.9th percentile targets, not good averages. One percent would be right only for a single call.

## 2

cProfile says a validate function is 54 percent of a request's time. py-spy, sampling a thousand times a second, says 30 percent. Validate makes about 330 Python calls per request, while the other hot path makes one call into a C extension. Which figure should drive your priorities?

A, cProfile's, since sampling misses functions shorter than a tick. B, cProfile's, since it records every call instead of a sample. C, neither, since both profilers distort the shares equally. D, py-spy's, since a cost per call inflates call-heavy code.

[think]

The answer is D: py-spy's, since a cost per call inflates call-heavy code.

An instrumenting profiler adds a fixed cost to every call and return, so code that makes hundreds of small calls looks far more expensive than it is, while one call into C looks cheap. Sampling overhead depends on the rate, not the call count, so the shares stay proportional. Short functions are not missed by sampling in aggregate; they appear in proportion to the time they take.

## 3

Host A serves every request in 10 milliseconds. Host B serves 90 percent in 10 milliseconds and 10 percent in 800. Traffic is split evenly. What is the fleet's 99th percentile?

A, about 10 milliseconds, since most requests are fast. B, about 90 milliseconds, the traffic-weighted mean latency. C, about 800 milliseconds, from the merged distribution. D, about 405 milliseconds, the mean of the two hosts' 99th percentiles.

[think]

The answer is C: about 800 milliseconds, from the merged distribution.

Merged, 5 percent of all requests take 800 milliseconds, so the 99th percentile is 800. Averaging the two hosts' 99th percentiles, 10 and 800, gives 405, a latency no request had. Percentiles must be computed from merged histograms, never averaged.

## 4

A Prometheus panel for the 99th percentile has read exactly 1 second for days. The histogram's finite buckets are 0.1, 0.25, 0.5 and 1 second. What does that most likely mean?

A, interpolation rounds the 99th percentile to the nearest bucket. B, the 99th percentile is stable, so the service is behaving well. C, a 1 second client timeout is cutting the slow requests off. D, over 1 percent of requests exceed the 1 second top bucket.

[think]

The answer is D: over 1 percent of requests exceed the top bucket.

When the target rank falls in the infinite overflow bucket, the quantile function returns the largest finite boundary. So a flat 1 second means more than 1 percent of requests are slower than that, and the true 99th percentile is unknown. Inside a finite bucket the function interpolates linearly rather than rounding. Add buckets above the objective, or use exponential histograms.

## 5

A service spends 11 percent of each request on the CPU, and the rest waiting on a database. A function taking 30 percent of the CPU samples is deleted entirely. Roughly how much faster do requests get?

A, about 11 percent faster. B, about 30 percent faster. C, about 3 percent faster. D, about 43 percent faster.

[think]

The answer is C: about 3 percent faster.

The function is 30 percent of the 11 percent on-CPU slice, about 3.3 percent of wall-clock time, so latency improves by about 3 percent. The 43 percent figure, one over 0.7, is the speed-up in CPU time, which is real for cost and throughput per core, but not for latency. Apply Amdahl's law to the metric you care about.

## 6

In a flame graph, function A is drawn wide at the bottom with a tall, narrow tower above it. Function B is a wide, flat box at the top of a short stack. Where is the CPU actually spending its time?

A, leftmost first, because the x-axis shows time. B, in B, because its wide flat top is self time. C, in A, because it is the widest box in the graph. D, in the tower, because it is the tallest stack.

[think]

The answer is B: in B, because its wide flat top is self time.

Width includes everything a function calls, so A is wide because of what sits above it. Self time is the exposed top edge, and B's wide flat top is where the CPU was actually sampled. Height is only stack depth, and the x-axis is sorted alphabetically, not by time.
