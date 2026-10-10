---
lesson: profiling-and-measurement
source: 2a80291a01a8798f
fit: great
desk:
  - "The Prometheus bucket interpolation, worked rank by rank"
  - "The folded stacks and the flame graph built from the py-spy run"
  - "The Amdahl, Gustafson and Universal Scalability Law table, and the USE method table"
  - "Exercises: nearest-rank percentile, and Amdahl's law for several components"
---
## Introduction

After a deploy, your checkout service's 99th percentile latency goes from 120 milliseconds to 310. The average moves from 38 to 41, and CPU is flat. Someone captures a CPU profile, sees JSON serialisation at the top, as it always has been, and proposes a faster JSON library.

It would not help. The slow requests lost their time waiting, for a database connection the new code holds a little longer. And a CPU profiler cannot see waiting.

Two mistakes stack up in that story: the wrong statistic, the mean, which barely moved; and the wrong kind of profile, on-CPU, when the time was off-CPU. Performance work goes wrong at measurement far more often than at optimisation. Four ideas: latency as a distribution, on-CPU versus off-CPU time, how profilers lie, and Amdahl's law for bounding a fix before you write it.

## Latency is a distribution

Take a thousand requests. 900 took 12 milliseconds, 89 took 40, 10 took 250 on a cache-miss path, and one took 2 seconds after a retry. The mean is about 19 milliseconds, a latency no request actually experienced. The median is 12. The 99th percentile is 250. The max is 2 seconds, and it's the one you hear about. None of these is "the latency". Keep the distribution, and pick the percentile that matches the promise you made.

The tail matters more than its size suggests. First, fan-out. A page that calls 100 backends in parallel is as slow as the slowest call. If each backend is slow on 1 percent of calls, the chance at least one of the 100 is slow is about 63 percent. The backends' 99th percentile has become the page's median. That is the argument of Dean and Barroso's paper "The Tail at Scale", and why services behind fan-out set objectives on the 99th or 99.9th percentile.

Second, users repeat. A user who loads 50 pages sees a 99th-percentile event at least once with probability about 40 percent.

The mean still has one honest job: capacity. Throughput times mean service time is the number of busy workers. Use means to size, percentiles to judge.

## Histograms and merging

A service doing 20 thousand requests a second cannot keep every sample, so it records a histogram and computes percentiles from bucket counts. Two rules follow.

You cannot average percentiles. Host A serves everything in 10 milliseconds. Host B serves 90 percent in 10 and 10 percent in 800. Traffic is split evenly. What is the fleet's 99th percentile?

[pause]

800 milliseconds. Merge the samples and 5 percent of all requests took 800, so the 99th percentile is 800. Averaging the two hosts' numbers gives 405, which describes no request at all. Percentiles are order statistics, not sums. Add the histograms' bucket counts, then compute.

Second rule: bucket boundaries set your resolution. Prometheus finds the bucket holding the target rank and interpolates inside it. With the lesson's thousand requests and buckets at a tenth, a quarter, a half and one second, the reported numbers were off by two to four times in both directions: the median and 95th overstated, the 99th understated by more than half. And if more than 1 percent of requests land above the top bucket, Prometheus returns the top boundary. A 99th percentile flat at exactly 1 second for a week means "over 1 percent of requests exceed 1 second", and the true value could be 30.

The fix is log-linear buckets, as in HdrHistogram: every power-of-two range is split into the same number of sub-buckets, so the relative error is bounded everywhere. At 2 significant digits, covering a microsecond to an hour needs about 26 kilobytes, and merging two of them is exact.

## On-CPU and off-CPU

Every millisecond a thread spends is either on-CPU, executing instructions, or off-CPU: blocked on I/O, waiting for a lock or a pool slot, sleeping, or queued for a core. A CPU profiler samples only the first kind.

The lesson's profiling target is a toy order service in Python. Each request waits 1 millisecond for a simulated database, validates the order ID with a regular expression built from the customer's prefix, sums 150 order lines, and renders JSON. The shell's time command says the whole run took 3.6 seconds of wall clock and 0.4 seconds of CPU. 11 percent. No CPU optimisation can save more than that 0.4 seconds.

Two recordings of the same run. The CPU view says JSON rendering and regex compiling are each about a quarter of the cost. The wall-clock view, idle time included, says the database wait is 88 percent and JSON is 5. Both are true. They answer different questions: cores per request, or latency per request.

Real off-CPU profilers hook the kernel's context-switch path, record the stack when a thread is switched out and how long until it runs again, and sum the durations. Width in the resulting flame graph is time blocked.

## Flame graphs and profiler overhead

Now the CPU view, with the wait set to zero. A sampling profiler, py-spy, freezes the thread a thousand times a second and records its stack. A flame graph draws those stacks, merging identical prefixes. Four rules for reading one. Width is share of samples. The x-axis is not time: frames are sorted alphabetically, so left to right means nothing. Self time is the exposed top edge of a box, with nothing above it. And look for wide plateaus, not tall towers: a deep tower can be narrow.

In this run, the request handler spans 97 percent. Above it, JSON rendering is 46 percent, almost all inside the C encoder. Validation is 30 percent, almost all inside compiling the regular expression. Why compile on every request? Python's regex module caches compiled patterns, but the cache holds 512 entries, and this service has 5 thousand customers. Every request misses and re-parses. A cache that works in tests with 20 customers thrashes in production. The fix is one pattern compiled at import time.

Now, would a different profiler have told the same story? Same program, timed per request. No profiler: about 73 microseconds. Sampling at 100 times a second: about 1 percent overhead. At a thousand: about 20 percent. And cProfile, Python's instrumenting profiler, which hooks every call and return: 73 percent overhead.

Worse, it reordered the priorities. cProfile ranked validation first at 54 percent; the sampler ranked JSON first at 46. Validation makes about 330 small Python calls per request, inside the regex parser, and each one pays the probe's fixed cost. JSON is one call into C, and pays it once. That is the probe effect. Sampling overhead depends on the rate; instrumentation overhead depends on the number of calls.

Sampling's own error is small and statistical: for a 30 percent share from 3,500 samples, under one percentage point. Its real errors are biases. Missing frame pointers truncate stacks. JIT-compiled code has no symbols unless you ask the runtime for them. And JVM profilers that sample only at safepoints blame time on the wrong line.

## Amdahl's law

If a fraction p of the time gets s times faster and the rest is untouched, the overall speed-up is one over the sum of the untouched part and p divided by s.

Apply it before writing the fix. Deleting the per-request compile removes 29 percent of the CPU, so the bound is one over 0.71: 1.42 times. Measured after the change: 1.35 to 1.41 times. The small shortfall is the regex match that still runs. Had you trusted cProfile's 54 percent, you would have predicted over twice as fast, and been embarrassed.

Now apply it to latency. With the 1 millisecond database wait, CPU is 11 percent of each request. So the compile is about 3 percent of latency. The same fix that saves over a quarter of the CPU makes requests 3 percent faster. Both statements are true, and a senior engineer says which one the change is for: cores per request, or latency.

The law also bounds parallelism. With 5 percent serial work, 64 cores give about 15 times, not 64. The Universal Scalability Law adds a coherence cost, cores that must agree with each other through locks or shared cache lines, and with it throughput peaks and then falls. A measured scaling curve that bends downwards fits that law, not Amdahl's.

And before any profiler, find the saturated resource. Brendan Gregg's USE method checks every resource for utilisation, saturation and errors. Tom Wilkie's RED method checks every service for rate, errors and duration as a distribution. On Linux, the pressure files under proc report the share of time tasks were stalled waiting for CPU, memory or I/O: saturation measured directly.

## In the interview

The lesson's opening, as an interview question. The 99th percentile doubled after a deploy, but CPU and the mean are flat. Walk me through it.

[pause]

Compare latency histograms before and after, split by endpoint and host, to see whether the whole tail moved or one host did. Compare CPU time with wall-clock time. Look at connection-pool acquisition time and trace spans for a dependency that got slower. Take an off-CPU or wall-clock profile, and diff flame graphs across the deploy. The wrong answer is "profile the CPU and speed up the hottest function", which cannot touch time spent waiting.

And: a job scales only 10 times on 64 cores. What does that tell you? Solving Amdahl's law gives about 8.6 percent effective serial work. Measure throughput at 1, 2, 4, up to 64 cores, and if it peaks and falls, a coherence cost like a lock or shared counter is growing with core count. The wrong answer is "buy more cores", which Amdahl caps at under 12 times here.

## Recap

Four things to remember. Latency is a distribution: report percentiles from merged histograms, never averaged percentiles, and put bucket boundaries around your objective. A CPU profiler cannot see waiting, so check wall-clock against CPU time before you profile. Sample at about 100 times a second in production, and distrust instrumenting profilers' percentages, because the probe effect inflates call-heavy code. And bound every fix with Amdahl's law against the metric you named: the same change was 1.4 times cheaper and only 3 percent faster.

At your desk: the bucket interpolation worked rank by rank, the folded stacks and flame graph, the scaling and USE tables, and the exercises on percentiles and Amdahl's law.
