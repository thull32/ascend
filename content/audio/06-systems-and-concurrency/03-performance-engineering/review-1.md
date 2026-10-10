---
review: performance-engineering
source: 56daf511201831d3
---
## Introduction

Twelve questions from the performance-engineering module. Answer out loud before the answer comes.

Three from each lesson, in order: profiling and measurement, CPU caches and memory layout, I/O-bound versus CPU-bound, and benchmarking pitfalls. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A page fans out to 50 backend calls in parallel and waits for all of them. Each backend takes more than 200 milliseconds on 1 percent of calls, independently. Roughly how often does the page wait more than 200 milliseconds?

A, about 5 percent of the time. B, about 1 percent of the time. C, about 99 percent of the time. D, about 40 percent of the time.

[think]

The answer is D: about 40 percent of the time.

The page is slow if any one call is slow. The chance that all 50 are fast is 0.99 multiplied by itself 50 times, about 61 percent, so the page is slow about 39 percent of the time. Tail latency compounds under fan-out, which is why backends behind fan-out need tight 99th or 99.9th percentile targets, not good averages. One percent would be right only for a single call.

## Question 2

Host A serves every request in 10 milliseconds. Host B serves 90 percent in 10 milliseconds and 10 percent in 800. Traffic is split evenly. What is the fleet's 99th percentile?

A, about 10 milliseconds, since most requests are fast. B, about 90 milliseconds, the traffic-weighted mean latency. C, about 800 milliseconds, from the merged distribution. D, about 405 milliseconds, the mean of the two hosts' 99th percentiles.

[think]

The answer is C: about 800 milliseconds, from the merged distribution.

Merged, 5 percent of all requests take 800 milliseconds, so the 99th percentile is 800. Averaging the two hosts' 99th percentiles, 10 and 800, gives 405, a latency no request had. Percentiles must be computed from merged histograms, never averaged.

## Question 3

In a flame graph, function A is drawn wide at the bottom with a tall, narrow tower above it. Function B is a wide, flat box at the top of a short stack. Where is the CPU actually spending its time?

A, leftmost first, because the x-axis shows time. B, in B, because its wide flat top is self time. C, in A, because it is the widest box in the graph. D, in the tower, because it is the tallest stack.

[think]

The answer is B: in B, because its wide flat top is self time.

Width includes everything a function calls, so A is wide because of what sits above it. Self time is the exposed top edge, and B's wide flat top is where the CPU was actually sampled. Height is only stack depth, and the x-axis is sorted alphabetically, not by time.

## Question 4

Eight threads each increment their own element of a shared, 64-byte-aligned array of eight 8-byte counters, with no locks. Adding threads makes total throughput drop below what one thread manages. What is the mechanism?

A, all eight counters share a single cache line that bounces between cores. B, the scheduler keeps migrating threads between cores. C, the array of counters is too large to fit in the first-level cache. D, the threads race and corrupt each other's counters.

[think]

The answer is A: all eight counters share a single cache line that bounces between cores.

Each thread writes only its own counter, so there is no data race. But coherence works on whole 64-byte lines, and these eight counters fill exactly one, so every write needs the line in the Modified state and invalidates every other copy. Padding each counter to its own line, or counting in thread-local variables, removes the traffic.

## Question 5

A first-level data cache is 48 kibibytes, 12-way set associative, with 64-byte lines. A loop repeatedly reads 16 values spaced exactly 4,096 bytes apart. What happens?

A, every access misses because the values straddle two lines. B, all 16 lines fit in the cache, so every pass after the first hits. C, all 16 lines share one 12-way set, so the loop keeps missing. D, the prefetcher hides the misses because the stride is constant.

[think]

The answer is C: all 16 lines share one 12-way set, so the loop keeps missing.

48 kibibytes of 64-byte lines in 12 ways is 64 sets, so the set index repeats every 4,096 bytes, and all 16 lines compete for 12 ways. These are conflict misses in a cache that is almost empty. Measured on such a cache, 12 lines at this stride hit in 0.9 nanoseconds, and 16 lines miss to the next level at 2.7. A stride of 4,160 bytes spreads them across the sets.

## Question 6

An analytics loop averages one 4-byte field across 50 million records of a 64-byte struct. Which change is likely to give the largest speed-up?

A, pad the struct so every field is 8-byte aligned. B, add a branch that skips records whose value is zero. C, link the records in a list so inserts become cheap. D, store each field in its own contiguous array.

[think]

The answer is D: store each field in its own contiguous array.

The loop needs 4 bytes of each 64-byte record, but an array of structs pulls whole lines through the cache. A struct of arrays streams only that one column, measured at about 12 times faster for 10 million records, and lets the compiler vectorise. Padding adds bytes, a data-dependent branch may mispredict, and a linked list adds a dependent miss per record.

## Question 7

A service runs at 30 percent CPU with a high 99th percentile latency. Its database pool metrics show requests waiting an average of 80 milliseconds to acquire a connection. What should you do first?

A, find out why each connection is held so long. B, double the pool size on every pod right away. C, profile the CPU to find the hottest functions. D, add more pods so the load spreads across them.

[think]

The answer is A: find out why each connection is held so long.

The time is going to pool waits, so the bottleneck is how long connections are held, through slow queries or work done while holding one, or the database behind them. Check the database's capacity before touching pool sizes. More pods or bigger pools multiply connections to a database that may already be saturated. And a CPU profile cannot see waiting.

## Question 8

Pidstat shows a process at 48 percent CPU with 52 percent in the wait column, zero voluntary context switches, and about 120 involuntary switches a second. The host is 75 percent idle. What is happening?

A, it is waiting on the disk and should show iowait. B, it is spinning on a lock held by another thread. C, it is runnable but denied a core by a limit or a CPU set. D, it is blocked on the network, which is counted as idle.

[think]

The answer is C: it is runnable but denied a core by a limit or a CPU set.

Involuntary switches plus a high wait column mean the thread wanted to keep running, was preempted, and then queued for a CPU. With the host mostly idle, the process must be confined to fewer CPUs than it wants: a cgroup quota, a CPU set, or pinning. A network or disk wait produces voluntary switches and little CPU, and a spin lock burns CPU without queueing for a core.

## Question 9

On CPython 3.14 with the GIL, each task burns 5 milliseconds of pure-Python CPU, then waits 45 milliseconds on a socket. With a large enough thread pool, what is the throughput ceiling?

A, unlimited, since waiting on a socket releases the GIL. B, about 200 tasks a second, with one core running the CPU parts. C, about 20 tasks a second per thread, times the thread count. D, about 1,600 tasks a second, one per core every 5 milliseconds.

[think]

The answer is B: about 200 tasks a second, with one core running the CPU parts.

The waits overlap freely, because blocking calls release the GIL, but the CPU parts run one at a time: one second divided by 5 milliseconds is 200 tasks a second. Measured, 200 such tasks never finished faster than about one second at any thread count, while the free-threaded build reached 0.21 seconds. Per-thread scaling holds only until the serial CPU part saturates.

## Question 10

A Rust loop calls a checksum function a million times, built with optimisation, and discards each result. The benchmark reports zero nanoseconds per call. What happened?

A, the loop ran on a boosted core while its neighbours idled. B, the clock is too coarse to time a nanosecond-scale call. C, the optimiser removed the call, because its result was unused. D, the CPU cached the checksum result after the first call.

[think]

The answer is C: the optimiser removed the call, because its result was unused.

A pure function whose result is never used has no observable effect, so the optimiser deletes it; the same happens when the input is a compile-time constant. Wrapping input and output in black box forces the work, measured at about 160 nanoseconds for 256 bytes. The loop was timed as a whole, so clock resolution isn't the issue, and CPUs don't cache function results.

## Question 11

A closed-loop load test reports a 99th percentile of 0.9 milliseconds and a maximum of 500. Server logs show a 500 millisecond garbage-collection pause every 10 seconds. What explains the tiny 99th percentile?

A, the generator stopped sending during each pause. B, the server logs overstate how long the pauses last. C, the 99th percentile is the wrong statistic, and the mean would show it. D, the test used too few connections to trigger the pauses.

[think]

The answer is A: the generator stopped sending during each pause.

A closed-loop generator waits for each response, so during a pause it records one slow sample instead of the hundreds of requests real users would have sent. That is coordinated omission. In a simulation of exactly this server, open-loop measurement gave a 99th percentile of 420 milliseconds, with 6 percent of requests over 10. More connections shrink the effect but don't remove it.

## Question 12

A CI suite runs 200 benchmarks after every commit and flags any change significant at the 5 percent level. It flags around ten benchmarks on commits that only change documentation. Why?

A, a 5 percent significance threshold is too strict for benchmarks. B, documentation changes shift the binary's code layout. C, the benchmarks are broken and time the wrong code. D, 200 tests at a 5 percent false-positive rate give about ten false alarms per run.

[think]

The answer is D: 200 tests at a 5 percent false-positive rate give about ten false alarms per run.

With 200 independent tests, each with a 5 percent chance of a false positive, about ten false alarms are expected on every run even when nothing changed. The remedy is a minimum effect size, automatic re-runs, and alerts only on sustained shifts. Layout effects are real, but they don't explain a steady false-alarm rate on every commit.

## Recap

Three ideas kept coming back. First, measure the right thing: percentiles from merged distributions, self time rather than width, wall-clock against CPU, and the time spent waiting for a pool. Second, the hardware and the runtime work in units you don't see in the source: 64-byte lines, sets and ways, a GIL that serialises Python code, an optimiser that deletes unobserved work. And third, noise and omission hide the truth: tails compound under fan-out, closed-loop generators skip the stalls, and many tests at once guarantee false alarms.
