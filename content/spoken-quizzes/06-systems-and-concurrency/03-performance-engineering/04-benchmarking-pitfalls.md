---
lesson: benchmarking-pitfalls
source: 3194d8e051608842
---
## 1

A microbenchmark shows a function is 12 percent faster after a change. A production CPU profile shows the function accounts for 3 percent of request CPU. What production improvement should you expect?

A, about 0.4 percent, likely lost in production noise. B, about 12 percent, the same as the microbenchmark. C, about 3 percent, the function's whole share of CPU. D, none, since microbenchmarks never transfer.

[think]

The answer is A: about 0.4 percent, likely lost in the noise.

By Amdahl's law, speeding up 3 percent of the work by 12 percent saves about 0.36 percent of the total. Three percent would require deleting the function outright. The microbenchmark can be accurate and still irrelevant. It does transfer, in proportion to the function's share.

## 2

A Rust loop calls a checksum function a million times, built with optimisation, and discards each result. The benchmark reports zero nanoseconds per call. What happened?

A, the loop ran on a boosted core while its neighbours idled. B, the clock is too coarse to time a nanosecond-scale call. C, the optimiser removed the call, because its result was unused. D, the CPU cached the checksum result after the first call.

[think]

The answer is C: the optimiser removed the call, because its result was unused.

A pure function whose result is never used has no observable effect, so the optimiser deletes it; the same happens when the input is a compile-time constant. Wrapping input and output in black box forces the work, measured at about 160 nanoseconds for 256 bytes. The loop was timed as a whole, so clock resolution is not the issue, and CPUs do not cache function results.

## 3

A closed-loop load test reports a 99th percentile of 0.9 milliseconds and a maximum of 500. Server logs show a 500 millisecond garbage-collection pause every 10 seconds. What explains the tiny 99th percentile?

A, the generator stopped sending during each pause. B, the server logs overstate how long the pauses last. C, the 99th percentile is the wrong statistic, and the mean would show it. D, the test used too few connections to trigger the pauses.

[think]

The answer is A: the generator stopped sending during each pause.

A closed-loop generator waits for each response, so during a pause it records one slow sample instead of the hundreds of requests real users would have sent. That is coordinated omission. In a simulation of exactly this server, open-loop measurement gave a 99th percentile of 420 milliseconds, with 6 percent of requests over 10. More connections shrink the effect but do not remove it.

## 4

A CI suite runs 200 benchmarks after every commit, and flags any change significant at the 5 percent level. It flags around ten benchmarks on commits that only change documentation. Why?

A, a 5 percent significance threshold is too strict for benchmarks. B, documentation changes shift the binary's code layout. C, the benchmarks are broken and time the wrong code. D, 200 tests at a 5 percent false-positive rate give about ten false alarms per run.

[think]

The answer is D: 200 tests at a 5 percent false-positive rate give about ten false alarms per run.

With 200 independent tests, each with a 5 percent chance of a false positive, about ten false alarms are expected on every run, even when nothing changed. The remedy is a minimum effect size, automatic re-runs, and alerts only on sustained shifts. Layout effects are real, but they do not explain a steady false-alarm rate on every commit.

## 5

In one Node process, a benchmark of a call site that sees one class runs at 0.8 nanoseconds per element. After a second benchmark feeds the same function six classes, re-running the one-class benchmark gives 6 nanoseconds. Why?

A, the timer's resolution changed after the process warmed up. B, the call site stayed megamorphic after the six-class run. C, garbage from the six-class run is still being collected. D, the CPU cache was evicted by the larger six-class objects.

[think]

The answer is B: the call site stayed megamorphic after the six-class run.

V8 speculates from the types it has observed. Once the call site has seen six classes, it is compiled as megamorphic, and it does not return to the inlined single-class path, so the earlier benchmark's profile pollutes the later one. A fresh process per benchmark, or JMH-style forks, avoid it. Garbage collection and cache effects would not persist at a sevenfold cost.

## 6

An A A test, running your benchmark against itself with 5 runs per side, ranges from about minus 4 percent to plus 3 percent. A change measures 3 percent slower, with 5 runs per side. What can you conclude?

A, nothing yet, since it is inside the A A noise band. B, it is a real regression, since the median moved 3 percent. C, it is a real regression, since 5 runs is plenty. D, it is an improvement, since noise favours the change.

[think]

The answer is A: nothing yet, since it is inside the noise band.

The A A range is the spread you see when nothing changed, so a 3 percent difference inside it is not evidence of a regression. You need more interleaved runs, a bootstrap confidence interval on the ratio, or a quieter benchmark, such as instruction counts, or a pinned machine. On one measured CPython workload, 5 runs per side misreported a real 3 percent regression 19 percent of the time.
