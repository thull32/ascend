---
lesson: benchmarking-pitfalls
source: 1311ad66cdc2a0e5
fit: great
desk:
  - "The black box checksum program and the JMH benchmark skeleton"
  - "The JIT warm-up, profile pollution and timer tables"
  - "The bootstrap procedure, the resampling and CI gate tables"
  - "The coordinated omission trace and simulation, and the exercise: correct a percentile for coordinated omission"
---
## Introduction

A pull request claims a 12 percent speed-up in JSON string escaping, backed by a microbenchmark on the author's laptop: 812 nanoseconds per call before, 715 after. It merges. Production CPU per request does not move. Two weeks later the nightly benchmark job flags an 8 percent regression in the same function, on a commit that only edited a comment. An engineer loses a day bisecting it.

Neither result was a bug in the timer. The first measured something real that did not matter: escaping was 3 percent of request CPU, so a 12 percent improvement is worth 0.4 percent, well under production's noise. The second measured noise, precisely.

Benchmarks go wrong in two ways. They measure something other than what you think, or they cannot tell a real change from variation. This tour goes through both: work the compiler deletes, warm-up and speculation, noise and the statistics to beat it, and the load-testing error called coordinated omission.

## Decide the question

There are three kinds of benchmark. A microbenchmark asks whether one function is faster, at nanoseconds to microseconds. A macro benchmark asks whether a service or job is faster end to end on real data. A load test asks how throughput and latency behave under concurrency, and where the knee is.

A microbenchmark result is a hypothesis about the macro result, not evidence for it. Amdahl's law bounds it: a component that is 3 percent of the work can move the total by at most 3 percent. And two framing mistakes are as common as any measurement error: optimising throughput with a change that worsens latency, and benchmarking on input production never sends, like short ASCII strings when real payloads are 40 kilobytes of mixed Unicode.

## Work the compiler deletes

An optimising compiler deletes work whose result nobody looks at, and computes at compile time anything whose inputs it can see.

A naive Rust benchmark called a checksum over a 256-byte buffer a million times and threw the result away. It reported zero nanoseconds per call. Before I tell you: what happened?

[pause]

The optimiser proved the call had no observable effect and removed it. A second version kept the result but used a constant input, so the checksum was computed at compile time: zero again. Wrapping the input and output in black box, a function that tells the optimiser to assume nothing, forced the work: about 160 nanoseconds. And the same loop built without optimisation reported 304, twice the real cost, which is the other classic mistake.

The check that catches every variant is a sanity bound against physics. 256 bytes in zero nanoseconds is impossible. 160 nanoseconds is about 0.6 nanoseconds per byte, roughly three cycles a byte for a chain of dependent multiplies. That's believable. The JVM has the same tool in JMH's black hole, and in Go you assign to a package-level sink.

## Warm-up and speculation

JIT-compiled runtimes change the code while you measure it. V8, Node's engine, starts functions in an interpreter, then compiles hot ones through faster and faster tiers using the types it has observed. Timing one JavaScript checksum in Node: the very first call took about 30 microseconds. Calls in the first hundred, about 5 microseconds. Calls up to about 4 thousand, around 800 nanoseconds with spikes past a thousand. And steady state: about 240.

So a benchmark that times its first thousand calls reports about five times the steady-state cost, and one that times a single call reports a hundred times. Whether you want the cold number depends on the question. A serverless function invoked once lives in the cold rows. A long-running service lives in the steady state. JMH answers the steady-state question with explicit warm-up iterations and three fresh JVMs per benchmark.

JITs also speculate. A call site that has only ever seen one class is monomorphic: the JIT inlines the method behind a cheap type check. One that has seen many classes is megamorphic: every call is an indirect lookup. Summing shape areas over 10 thousand objects in Node: with one class, 0.82 nanoseconds per element. With six classes at the same call site, 6.7. A benchmark with one implementation flatters production with six by eight times.

Worse is profile pollution. Running the one-class benchmark again, in the same process, after the six-class run: about 6 nanoseconds, seven times slower than in a fresh process. Once the call site went megamorphic, V8 never went back. Benchmarks that share one process contaminate each other this way, which is why JMH forks a JVM per benchmark, and why you should run one benchmark per process in Node and Python.

Even without a JIT, the first pass over data misses the cache, and a benchmark whose data fits in cache flatters code whose production data doesn't. Benchmark with production-sized data.

## Clocks and noise

Every measurement includes the clock. Reading it costs about 15 nanoseconds in C and about 100 in Python, with steps of 80 nanoseconds. Timing one call of a trivial Python function gave a median of 50 nanoseconds; timing a million and dividing gave 18. The single-call number is mostly clock. The rule: make every timed region at least a hundred times longer than a clock read, by timing batches.

Then noise. Run the same binary twice and you get two numbers. The biggest source is frequency scaling. On this machine, one core with idle neighbours ran at about 5.6 gigahertz. With seven other cores busy, 5.1. The same single-threaded benchmark runs about 9 percent slower when the rest of the machine is busy, three times the effect you might be trying to detect. Add thermal limits, background work, and memory and code layout: address randomisation, environment size, link order. A well-known 2009 paper showed such incidental changes producing differences as large as the optimisations being evaluated. So you need many process runs, not just many iterations in one process.

On a Linux machine you control, you can pin to a core and turn off boost. Inside a virtual machine or on most CI runners you can't, which is why the statistics matter.

## Statistics that survive

The lesson ran two workloads: A, B with exactly 3 percent more work, and A2, identical to A. That last one is an A/A test. Thirty processes each, interleaved so drift hits all three equally.

The compiled Rust loop was quiet: run to run, under a quarter of a percent of difference between identical versions, and B was slower in all 30 pairs. Three runs would detect 3 percent. The Python workload was not: its A/A interval was about plus or minus 2 percent, and in 7 of 30 pairs the version doing more work was faster.

An A/A test is the cheapest honest number in benchmarking. It is the difference you will see when nothing changed, so any claimed effect inside it is not a result.

How many runs? A bootstrap answers without assuming a bell curve: resample your runs with replacement, compute the ratio of medians, repeat 10 thousand times, and take the middle 95 percent. For the Python workload that gave plus half a percent to plus 5.4: real, but its size poorly known. With 5 runs per side, the 3 percent regression would have been reported as under 1 percent, or as faster, about 19 percent of the time.

Report the median with a robust spread, the minimum for microbenchmarks, and the tail when the question is latency. And two more rules. Significance is not importance: with enough runs, 0.3 percent becomes significant and stays irrelevant. And multiple comparisons: 200 benchmarks tested at the usual 5 percent threshold report about ten "significant" changes on every run, even when nothing changed. That is the comment-only regression from the opening.

## Coordinated omission

Load tests mislead through an error Gil Tene named coordinated omission. Most simple load generators are closed-loop: each connection sends a request, waits for the response, then sends the next. Real users are open-loop: they keep arriving whether or not your server is slow.

Picture one request per millisecond, each normally taking 0.2, and a server that pauses for 500 milliseconds. Real users send 500 requests during the pause, and all 500 wait. The closed-loop generator sends one, waits, and records a single slow sample. When the pause ends, it catches up by firing the overdue requests back to back, each measured as fast. The generator has coordinated with the server to omit exactly the samples that describe the problem.

The simulation: a 500 millisecond pause every 10 seconds, for 100 seconds. Measured open-loop, the 99th percentile was 420 milliseconds, and 6 percent of requests took over 10. Measured closed-loop, the 99th percentile was 0.93 milliseconds. The service looked excellent while 6 percent of real users waited.

The fix: send on a fixed schedule and measure latency from the intended send time, not the actual one. Tools like wrk2 with a fixed rate, k6's constant arrival rate, and Vegeta do this. HdrHistogram can also correct recorded data after the fact.

## In the interview

A follow-up the lesson expects. How would you gate performance in CI without flaky failures?

[pause]

The lesson's resampling shows the trap: gating on one run per side at 2 percent raises a false alarm on a quarter of commits, and loosening to 5 percent with ten runs catches only a tenth of real 3 percent regressions. So: run base and head interleaved in the same job and gate on the confidence interval of the ratio, with a minimum effect size. Use instruction counts from a simulated CPU for nearly deterministic signals. Detect sustained shifts over several commits rather than single points, re-run automatically before paging anyone, and treat a production canary as the final check. The wrong answer: fail the build if any benchmark is 5 percent slower than last night's number.

And: what is coordinated omission, and how would you notice it? You notice when the max latency is huge but the 99th percentile is tiny, or the achieved request rate dips during stalls. More connections reduce it but do not remove it.

## Recap

Four things to remember. Bound any micro win with Amdahl's law before celebrating, and check that the work still happens, against physics. Warm-up and speculation make JIT benchmarks lie, so run one benchmark per process with production-shaped inputs. Measure your noise floor with an A/A test, interleave many process runs, and compare medians with a bootstrap interval. And load test open-loop, measuring from the intended send time, or the stalls vanish from your percentiles.

At your desk: the black box program and the JMH skeleton, the warm-up, pollution and timer tables, the bootstrap and CI gate tables, and the coordinated omission trace with its exercise.
