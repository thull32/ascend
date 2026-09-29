---
slug: benchmarking-pitfalls
title: "Benchmarking pitfalls: warm-up, noise, statistics and coordinated omission"
description: Dead-code elimination, JIT warm-up and profile pollution, timer resolution, turbo frequency, run-to-run noise and the statistics needed to trust a 3% difference, coordinated omission in load tests, and CI gates that neither cry wolf nor miss regressions, each demonstrated with a measured run.
minutes: 35
difficulty: hard
tags: [performance, benchmarking, statistics, jit, load-testing, coordinated-omission, ci]
---
A pull request claims a 12% speed-up in JSON string escaping, backed by a microbenchmark on the author's laptop: 812 ns per call before, 715 ns after. It merges. Production CPU per request does not move. Two weeks later the nightly CI benchmark job flags an 8% regression in the same function on a commit that only edited a comment. An engineer loses a day bisecting it.

Neither result was a bug in the timer. The first measured something real that did not matter (escaping was 3% of request CPU, so a 12% improvement is worth 0.4%, well under production's noise), and the second measured noise precisely. Benchmarks go wrong in two ways: they measure something other than what you think, or they cannot tell a real change from variation. [Benchmarking reality](/learn/foundations/complexity/benchmarking-reality) introduced the classic traps. This lesson demonstrates each one with a measured run on a Ryzen 9 9950X3D under WSL2 (Rust 1.98, Node 24, CPython 3.14), then builds the statistics and CI practice that survive them.

## Decide what question you are asking

| Kind | Question | Scale | Tools |
|---|---|---|---|
| Micro | Is this function faster? | Nanoseconds to microseconds | JMH, criterion, `go test -bench`, pyperf, mitata |
| Macro | Is this service or job faster end to end on real data? | Milliseconds to minutes | Replayed production traffic or datasets |
| Load test | How do throughput and latency behave under concurrency, and where is the knee? | Minutes to hours | wrk2, k6, Gatling, Vegeta |

A microbenchmark result is a hypothesis about the macro result, not evidence for it. Its value in production is bounded by Amdahl's law ([profiling and measurement](/learn/systems/performance-engineering/profiling-and-measurement)): a component that is 3% of the work can move the total by at most 3%. Two framing mistakes are as common as any measurement error: optimising throughput with a change that worsens latency (batching, bigger buffers), and benchmarking on input production never sends (short ASCII strings when real payloads are 40 KB of mixed Unicode; sorted keys when real keys arrive at random).

## Dead-code elimination, measured

An optimising compiler deletes work whose result nobody observes, and computes at compile time anything whose inputs it can see. A naive Rust benchmark of an FNV-1a checksum over a 256-byte buffer, one million calls, `rustc -O`, three runs:

| Loop body | Time per call |
|---|---|
| `checksum(&owned);` (result unused) | 0.000 ns |
| `acc += checksum(LITERAL);` (input is a compile-time constant) | 0.000 ns |
| `black_box(checksum(black_box(&owned)));` | 157–167 ns |
| Same `black_box` loop, built without optimisation (`-C opt-level=0`) | 304 ns |

The first loop was removed: `checksum` has no side effects, so the optimiser proved the call unobservable. The second kept its result but not the work: the input was a constant, so the checksum was folded or hoisted out of the loop. Both report an infinitely fast function. The debug build reports a real number that is twice the optimised cost, which is the other classic mistake.

```rust
use std::hint::black_box;
use std::time::Instant;

fn checksum(data: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;          // FNV-1a
    for &b in data {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

fn main() {
    let owned: Vec<u8> = (0..256u32).map(|i| (i * 7) as u8).collect();
    let t = Instant::now();
    for _ in 0..1_000_000 {
        checksum(&owned);                          // deleted: 0.000 ns/call
    }
    println!("unused:    {:?}", t.elapsed() / 1_000_000);
    let t = Instant::now();
    for _ in 0..1_000_000 {
        black_box(checksum(black_box(&owned)));    // must run: 157-167 ns/call
    }
    println!("black_box: {:?}", t.elapsed() / 1_000_000);
}
```

**Under the hood.** `std::hint::black_box` is an identity function that tells the optimiser to be maximally pessimistic about it: it may read and write the value in ways the compiler cannot see, so the input cannot be assumed constant and the output cannot be assumed dead. Its documentation calls this "best-effort", not a guarantee, which is one more reason for the sanity bound below. JMH's `Blackhole.consume` does the same for the JVM, and in Go, assigning to a package-level `sink` variable defeats the same elimination. The check that catches every variant is a sanity bound: 256 bytes in 0 ns is impossible, and 157 ns is 0.61 ns per byte, about three cycles per byte for a dependent multiply chain.

## Warm-up and JIT tiers, measured

JIT-compiled runtimes change the code while you measure it. V8 starts functions in its Ignition interpreter, then compiles hot ones with Sparkplug (baseline), Maglev (mid-tier optimising) and TurboFan (fully optimising), using the types it has observed. The JVM's pipeline is interpreter, C1, then C2. Timing the same JavaScript checksum on a 280-character string in Node 24, three processes:

| Phase | Time per call |
|---|---|
| The very first call | 24–35 µs |
| First batch of 100 calls | 4.4–5.6 µs |
| Batches 2–40 (calls 101–4,000) | 725–830 ns, with spikes past 1,000 ns |
| Steady state (median of 200 batches of 1,000 afterwards) | 241–244 ns |

`node --trace-opt` shows the transitions: the function is marked "hot and stable", compiled by Maglev (first with **on-stack replacement**, which swaps a running loop into compiled code mid-flight), then by TurboFan. A benchmark that times its first 1,000 calls reports about five times the steady-state cost; one that times a single call reports a hundred times. The spikes in the middle batches are compilation and garbage collection landing inside timed regions.

Whether you *want* the cold number depends on the question. A serverless function or a CLI invoked once lives in the first rows of that table; a long-running service lives in the last. JMH answers the steady-state question with explicit warm-up iterations and forks:

```java
@State(Scope.Thread)
@Warmup(iterations = 5, time = 1)
@Measurement(iterations = 10, time = 1)
@Fork(3)                                   // three fresh JVMs: JIT decisions and layout vary per process
public class EscapeBench {
    String input;

    @Setup public void setup() { input = loadRealPayload(); }     // production-shaped input

    @Benchmark public void escape(Blackhole bh) {
        bh.consume(Json.escape(input));    // keep the result alive
    }
}
```

Ahead-of-time compiled code also warms up: the first iterations take page faults, fill instruction and data caches and train branch predictors ([CPU caches and memory layout](/learn/systems/performance-engineering/cpu-caches-and-memory-layout)).

## Speculation and profile pollution, measured

JITs speculate on what they have seen. A call site that has only ever seen one class is **monomorphic**: the JIT inlines the method behind a cheap type check. One that has seen many classes is **megamorphic**: every call is an indirect lookup. Summing `shape.area()` over 10,000 objects in Node 24, median of 60 batches, three processes:

| Run, in order, in one process | Time per element |
|---|---|
| 1 class at the call site (fresh process) | 0.82 ns |
| 6 classes at the same call site | 6.65–6.69 ns |
| 1 class again (same process, after the 6-class run) | 5.93–5.99 ns |

A benchmark with one implementation measures 0.82 ns; production, with six, pays 6.7 ns. Worse, the third row shows **profile pollution**: once the call site went megamorphic (the trace shows a deoptimisation), V8 did not return to the fast path, so the single-class input ran seven times slower than it did in a fresh process. Benchmarks that share one process contaminate each other in exactly this way, which is why JMH forks a JVM per benchmark and why you should run one benchmark per process in Node and Python.

The same cache effects exist without a JIT. A loop that walks data once misses on every line; every later pass hits:

```viz
{"type": "memory", "algorithm": "cache-lines", "n": 32, "values": [0, 8, 16, 24, 0, 8, 16, 24, 0, 8, 16, 24],
 "title": "Cold first iteration, warm steady state",
 "caption": "The first pass over the data misses on every line; every later pass hits. A benchmark reports the warm number, which production sees only if the data stays hot between requests."}
```

And a benchmark whose data fits in cache flatters code whose production data does not. One line more than the cache holds and the same loop never hits:

```viz
{"type": "memory", "algorithm": "cache-lines", "n": 40, "values": [0, 8, 16, 24, 32, 0, 8, 16, 24, 32, 0, 8, 16, 24, 32],
 "title": "One line too many",
 "caption": "Five lines cycling through a four-line LRU cache: every access misses. Benchmark with production-sized data, or the cache flatters you by an order of magnitude."}
```

## Timer resolution and overhead, measured

Every measurement includes the clock. On this machine (clocksource `tsc`, read through the vDSO without a system call):

| Clock | Cost per read | Smallest step observed |
|---|---|---|
| C `clock_gettime(CLOCK_MONOTONIC)` | 15.5 ns | 10 ns |
| Node `process.hrtime.bigint()` | 26 ns | 20 ns |
| Node `performance.now()` | 27 ns | 20 ns |
| Python `time.perf_counter_ns()` (loop included) | 99 ns | 80 ns |

`clock_getres` claims 1 ns, which is the unit, not what you get. Timing one call of a trivial Python function between two `perf_counter_ns` reads gave a minimum of 40 ns and a median of 50 ns; timing a million calls and dividing gave 18 ns per call, loop included. The single-call number is mostly clock. The rule: make every timed region at least a hundred times longer than a clock read (microseconds, not nanoseconds) by timing batches, and subtract nothing by hand; batch sizes are what criterion, JMH and pyperf choose for you. Browsers coarsen `performance.now()` further as a Spectre mitigation (Chrome to 100 µs, or 5 µs on cross-origin-isolated pages).

## Where noise comes from

Run the same binary twice and you get two numbers. The sources, roughly in order of harm:

- **Frequency scaling.** A chain of dependent one-cycle additions measures the effective clock. On one core with idle neighbours it read 5.60–5.64 GHz; with seven other cores busy it read 5.14 GHz, twice. The same single-threaded benchmark runs about 9% slower when the rest of the machine is busy, three times the effect you might be trying to detect.
- **Thermal limits** during long runs, so later measurements are slower than earlier ones.
- **Other work**: background processes, interrupts, and an SMT sibling sharing your core's execution units.
- **Memory and code layout.** Address-space randomisation, environment size (which shifts the initial stack), link order and whether a hot loop straddles a 64-byte boundary can each move timings by several percent. Mytkowicz and colleagues ("Producing Wrong Data Without Doing Anything Obviously Wrong!", 2009) showed such incidental changes producing differences as large as the optimisations being evaluated. CPython adds per-process hash randomisation, which changes dict layout. You need many *process* runs, not only many iterations in one process.
- **Virtualisation.** Cloud VMs and CI runners share hardware, may land on different CPU models under one instance type, and lose time to the hypervisor (`st` in `vmstat`).

On a Linux machine you control, reduce what you can and measure the rest:

```bash
sudo cpupower frequency-set -g performance         # stop the governor changing clocks
echo 0 | sudo tee /sys/devices/system/cpu/cpufreq/boost   # disable boost, where the driver exposes it
echo 1 | sudo tee /sys/devices/system/cpu/intel_pstate/no_turbo   # Intel's equivalent
taskset -c 3 ./bench                               # pin to one core
pyperf system tune                                 # the same, packaged for Python benchmarks
```

None of these knobs exist inside WSL2 or on most CI runners, which is why the statistics matter.

## Statistics: two benchmarks, measured

The same experiment on two workloads: A, B with exactly 3% more work, and A2 identical to A (an **A/A test**), each run as 30 separate processes interleaved A, B, A2, A, B, A2 so that drift hits all three equally.

| | Rust checksum loop (58 ms) | CPython dict and JSON loop (16 ms) |
|---|---|---|
| A median, IQR | 58.13 ms, 58.07–58.29 | 15.66 ms, 15.36–15.96 |
| A max ÷ min | 4.1% | 23.3% |
| B ÷ A, ratio of medians | +2.99% | +2.61% |
| 95% bootstrap CI for B ÷ A | +2.80% to +3.11% | +0.51% to +5.42% |
| A2 ÷ A (should be 0), 95% CI | −0.21% to +0.12% | −2.42% to +1.52% |
| B slower in interleaved pairs | 30 of 30 | 23 of 30 |

The compiled loop is quiet enough that three runs detect 3%. The interpreted one is not: in 7 of 30 pairs the version doing *more* work was faster. An A/A test is the cheapest honest number in benchmarking: it is the difference you will see when nothing changed, so any claimed effect inside it is not a result.

## How many runs? The bootstrap and resampling

A **bootstrap** confidence interval needs no assumption about the distribution's shape. For the ratio B ÷ A:

1. Draw 30 values from A's 30 runs *with replacement* (some runs appear twice, some not at all), and the same for B.
2. Compute median(B) ÷ median(A) for that draw.
3. Repeat 10,000 times, collecting 10,000 ratios.
4. Sort them; the 250th and 9,750th values are the 95% interval.

For the CPython workload that gave +0.51% to +5.42%: the change is real, and its size is poorly known. Resampling $n$ runs per side from the recorded 30 shows what fewer runs would have told you:

| Runs per side | Observed B ÷ A, 5th to 95th percentile | Reports under 1% or faster | A/A range, 5th to 95th |
|---|---|---|---|
| 1 | −6.0% to +11.1% | 32% of the time | −9.5% to +5.9% |
| 3 | −1.9% to +8.3% | 24% | −5.3% to +3.6% |
| 5 | −0.5% to +6.9% | 19% | −3.9% to +2.8% |
| 10 | +0.6% to +5.6% | 10% | −2.6% to +1.7% |

Timing distributions are skewed (a hard floor, and interference only adds time) and often multimodal, so report the **median** with a robust spread (IQR), the **minimum** as the noise-free estimate for microbenchmarks, and the tail when the question is latency. Compare with a test that does not assume normality: Go's `benchstat` reports medians with confidence intervals and a Mann–Whitney U p-value; criterion bootstraps an interval for the change. Two more rules:

- **Significance is not importance.** With enough runs, 0.3% becomes significant and stays irrelevant. Decide the smallest effect you care about first.
- **Multiple comparisons.** 200 benchmarks tested at $p < 0.05$ report about ten "significant" changes on every run even when nothing changed.

## Load tests and coordinated omission, traced

Load tests mislead through an error Gil Tene named **coordinated omission**. Most simple load generators are **closed-loop**: each connection sends a request, waits for the response, then sends the next. Real users are **open-loop**: they keep arriving whether or not your server is slow.

Trace one stall. The schedule is one request per millisecond; each normally takes 0.2 ms; at $t = 5.000$ s the server pauses for 500 ms:

| Time | Open loop (users) | Closed loop (one connection) |
|---|---|---|
| 5.000 s | Request 1 sent; it waits for the pause | Request 1 sent; it waits for the pause |
| 5.001 s | Request 2 sent and queued | Nothing sent: still waiting on request 1 |
| 5.002–5.499 s | Requests 3–500 sent and queued | Nothing sent |
| 5.500 s | Pause ends; queued requests complete in order, the first with 500 ms of latency, each later one about 0.8 ms less | Request 1 completes: one sample of 500 ms |
| 5.500–5.625 s | The backlog of 500 drains at 0.2 ms each while new requests keep arriving | Catches up, sending the overdue requests back to back, each measured at about 0.2 ms from its actual send |

The open loop records 500 slow samples; the closed loop records one. The generator has coordinated with the server to omit exactly the samples that describe the problem. Measuring the closed loop's requests from their *intended* send time (5.001, 5.002 …) instead of their actual send time recovers the missing latency.

## Coordinated omission, measured

A simulation of 100 seconds of that server, with a pause every 10 seconds, shows the size of the error. One server, 0.2 ms average service time, and a 500 ms stall (a garbage-collection pause) every 10 seconds; load of one request per millisecond for 100 seconds:

| Measurement | p50 | p99 | p99.9 | Max | Requests over 10 ms |
|---|---|---|---|---|---|
| Open loop, from the scheduled send time | 0.15 ms | 420 ms | 493 ms | 500 ms | 6.13% |
| Closed loop, from the actual send time | 0.14 ms | 0.93 ms | 1.38 ms | 500 ms | 0.010% |
| Closed loop, from the *intended* send time | 0.15 ms | 420 ms | 493 ms | 500 ms | 6.13% |
| Closed loop with HdrHistogram correction | 0.15 ms | 396 ms | 490 ms | 500 ms | – |

Ten stalls produce ten slow samples out of 100,000 in the closed loop, and the reported p99 of 0.93 ms says the service is excellent while 6% of real users wait over 10 ms.

The fixes: send on a fixed schedule and measure from the *intended* send time (`wrk2 -R`, k6's `constant-arrival-rate`, Vegeta, Gatling's open model), or correct recorded data as HdrHistogram does: for each sample $L$ above the interval $I$, also record $L - I$, $L - 2I$, and so on while they are at least $I$. Also plot percentiles against offered load to find the **knee**, and check the generator's own CPU: a saturated generator reports its own queueing as your latency.

```exercise
id: coordinated-omission
title: Correct a latency percentile for coordinated omission
prompt: |
  A closed-loop load generator intended to send one request every `interval`
  ms and recorded `latencies` (in ms). Return `[raw, corrected]`: the p-th
  percentile (nearest rank: sort ascending, take the element at 1-based rank
  ceil(p * n / 100)) of the raw samples, and of the corrected samples.

  Correction: for each recorded latency L, keep L and also add
  L - interval, L - 2*interval, ... for as long as the added value is at least
  `interval`. If `interval` is 0 or less, add nothing.
languages: [python, javascript]
entry: co_percentiles
starter:
  python: |
    def co_percentiles(latencies, interval, p):
        # your code here
        return [0, 0]
  javascript: |
    function co_percentiles(latencies, interval, p) {
      // your code here
      return [0, 0];
    }
tests:
  - args: [[2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 200], 10, 90]
    expected: [2, 170]
    label: one 200 ms stall hides behind a 2 ms p90
  - args: [[5, 5, 5, 5], 10, 50]
    expected: [5, 5]
    label: nothing exceeds the interval
  - args: [[25], 10, 50]
    expected: [25, 15]
  - args: [[30, 30], 10, 50]
    expected: [30, 20]
  - args: [[10], 10, 100]
    expected: [10, 10]
    label: exactly one interval adds nothing
  - args: [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1000], 100, 90]
    expected: [1, 900]
    hidden: true
  - args: [[50, 3], 0, 100]
    expected: [50, 50]
    hidden: true
hints:
  - "Build the corrected list: for each L, append L, then m = L - interval, and while m >= interval append m and subtract interval again."
  - "Write one nearest-rank percentile helper and apply it to both lists. Use integer arithmetic for the rank: ceil(p * n / 100)."
```

## Benchmarking in CI

Regressions are cheapest to fix on the commit that introduced them, but shared runners vary more than the regressions you care about. Resampling the CPython benchmark above shows the trade-off every CI gate makes:

| Gate | Runs per side | False alarms (A/A) | Real 3% regression caught |
|---|---|---|---|
| Fail if more than 2% slower | 1 | 25.5% | 59% |
| Fail if more than 2% slower | 10 | 2.8% | 72% |
| Fail if more than 5% slower | 1 | 8.4% | 32% |
| Fail if more than 5% slower | 10 | 0% | 10% |

One run per side pages someone every fourth commit; a loose threshold misses what it exists to catch. The workable approaches:

1. **Compare on the same machine in the same job.** Build base and head, run them interleaved many times, and gate on the ratio's confidence interval. Absolute numbers from different runners are not comparable; a ratio from one runner often is.
2. **Count instructions instead of time.** Valgrind-based tools (Callgrind and Cachegrind; for Rust, Gungraun, formerly iai-callgrind) run the benchmark on a simulated CPU and report instruction counts that are nearly deterministic on any runner. They are blind to cache, branch and parallelism effects but catch algorithmic and code-size regressions; the Rust compiler's own performance tracking leans on instruction counts for this reason.
3. **Dedicated hardware** with fixed frequency, boost off and nothing else running, at the cost of money and maintenance.
4. **Detect sustained shifts, not single points.** Alert on changes that persist over several commits (change-point detection; MongoDB has published its use of the E-Divisive algorithm for this), with a minimum effect size and automatic re-runs before paging anyone.

Record the context with every result (CPU model, kernel, compiler or runtime version, flags, input data version), or six months later nobody can tell a regression from an upgraded runner. The final benchmark is production: a canary that compares CPU per request and latency percentiles between old and new versions under real traffic answers the question every other benchmark approximates. Netflix and Google open-sourced Kayenta for exactly this automated canary analysis ([CI/CD and deployment](/learn/senior-craft/software-craft/ci-cd-and-deployment)).

## Failure modes in production

| Symptom | Diagnosis | Fix |
|---|---|---|
| A benchmark reports 0 ns, or a speed-up too good to be true | Dead-code elimination or constant folding; check ns per byte against physics | `black_box`, `Blackhole`, a package-level sink; non-constant inputs |
| The micro win does not appear in production | Amdahl: the function is a small share; or unrealistic inputs | Profile production first; benchmark with real payloads |
| JVM or Node gain vanishes in production | Monomorphic benchmark versus megamorphic production, or profile pollution between benchmarks | Realistic type mix; one benchmark per process; forks |
| CI flags regressions on comment-only commits | Noise above the threshold, multiple comparisons, runner changes | Same-job interleaved ratios, instruction counts, change-point detection |
| Load test green, users report multi-second hangs | Closed-loop generator and coordinated omission | Open-loop generator measuring from intended send time |
| Benchmark faster on a quiet laptop than in the nightly job | Boost clock with idle neighbours (9% here) | Pin, fix frequency where possible, compare only within one job |

## Trade-offs: ways to measure a change

| Method | Noise | Catches | Blind to | Cost |
|---|---|---|---|---|
| In-process microbenchmark loop | Low within a run, high between processes | Code-level regressions | Layout and pollution effects, production mix | Cheap |
| Many interleaved process runs | Quantified with a CI | Small changes, given enough runs | Production traffic shape | Minutes of CI |
| Instruction counts (Cachegrind) | Near zero | Algorithmic and code-size changes | Cache, branch, I/O and parallelism | Slow execution, deterministic |
| Open-loop load test | Moderate | Throughput knee, tail latency | Real traffic mix | Hours, an environment |
| Production canary | Real traffic noise | Everything that matters | Nothing, but needs traffic | Deployment machinery |

## Interviewer follow-ups

**"Your microbenchmark says the new code is 40% faster. What do you check before believing it?"** Model answer: that the work still happens (`black_box`, a sink, non-constant inputs, ns per byte against physics), that it is the optimised build, steady state versus cold as the question requires, realistic inputs and type mix, and several processes with a confidence interval; then bound the production gain with the function's share of CPU. Common wrong answer: "run it more iterations", which makes a deleted loop look fast more precisely.

**"How many runs do you need to trust a 3% difference?"** Model answer: it depends on the noise, so measure it with an A/A test. Here a compiled loop's A/A interval was ±0.2% and three runs sufficed; a CPython workload's was about ±2% even at 30 runs, and five runs misreported the 3% regression 19% of the time. Interleave, use medians and a bootstrap or Mann–Whitney comparison. Common wrong answer: "a fixed number, like five".

**"What is coordinated omission, and how would you notice it?"** Model answer: a closed-loop generator stops sending while the server stalls, so it records one slow sample instead of all the requests real users would have sent; you notice when max latency is huge but p99 is tiny, or when the achieved request rate dips during stalls. Fix with open-loop load and latency from intended send time. Common wrong answer: "use more connections", which reduces but does not remove it.

**"How would you gate performance in CI without flaky failures?"** Model answer: same-job base-versus-head interleaved runs gated on a confidence interval and a minimum effect size, instruction counts for deterministic signals, change-point detection over history, automatic re-runs, and a canary as the final check. Common wrong answer: "fail the build if any benchmark is 5% slower than last night's number".

## What mid-level engineers get wrong

- **Benchmarking a debug build.** Consequence: numbers twice the real cost, and the wrong function blamed.
- **Discarding the result.** Consequence: a 0 ns benchmark and an optimisation that does nothing.
- **Timing single calls.** Consequence: measuring the clock (80 ns steps in Python) instead of the code.
- **Running several benchmarks in one JIT process.** Consequence: profile pollution that makes the later ones seven times slower.
- **Comparing one run to one run.** Consequence: 25% false alarms at a 2% threshold, or a real regression called noise.
- **Load testing closed-loop.** Consequence: a p99 of under 1 ms reported for a service that stalls for 500 ms every 10 seconds.
- **Celebrating a micro win without Amdahl.** Consequence: a 12% improvement that moves production by 0.4%.

## Senior signals

- You state what question a benchmark answers (micro, macro or load) and bound its production impact with Amdahl's law before celebrating.
- You check that the work happens (`black_box`, sinks, physics), and you know how JIT tiers, on-stack replacement, speculation and profile pollution distort results.
- You know your clock's resolution and cost and time batches, not calls.
- You control frequency and pinning where you can, run many interleaved processes, run A/A tests for the noise floor, and report medians with bootstrap or nonparametric intervals.
- You load test open-loop, measure from intended send time, and can explain and correct coordinated omission.
- You design CI gates from measured false-alarm and detection rates, prefer same-job ratios, instruction counts and change-point detection, and treat canaries as the final benchmark.

## Check yourself

```quiz
- q: >-
    A microbenchmark shows a function is 12% faster after a change. A production CPU profile shows the function accounts for 3% of request CPU. What production improvement should you expect?
  options: ["About 0.4%, likely lost in production noise", "About 12%, the same as the microbenchmark", "About 3%, the function's whole share of CPU", "None, since microbenchmarks never transfer"]
  answer: 0
  explanation: >-
    By Amdahl's law, speeding up 3% of the work by 12% saves about 0.36% of the total; 3% would require deleting the function outright. The microbenchmark can be accurate and still irrelevant. It does transfer, in proportion to the function's share.
- q: >-
    A Rust loop calls a checksum function a million times with -O and discards each result. The benchmark reports 0.000 ns per call. What happened?
  options: ["The loop ran on a boosted core while neighbours idled", "The clock is too coarse to time a nanosecond-scale call", "The optimiser removed the call, as its result was unused", "The CPU cached the checksum result after the first call"]
  answer: 2
  explanation: >-
    A pure function whose result is unused has no observable effect, so the optimiser removes it; the same happens when the input is a compile-time constant. Wrapping input and output in black_box forces the work, measured at about 160 ns for 256 bytes. The loop was timed as a whole, so clock resolution is not the issue, and CPUs do not cache function results.
- q: >-
    A closed-loop load test reports a p99 of 0.9 ms and a max of 500 ms. Server logs show a 500 ms garbage-collection pause every 10 seconds. What explains the tiny p99?
  options: ["The generator stopped sending during each pause", "The server logs overstate how long pauses last", "p99 is the wrong statistic, and the mean shows it", "The test used too few connections to trigger them"]
  answer: 0
  explanation: >-
    A closed-loop generator waits for each response, so during a pause it records one slow sample instead of the hundreds of requests real users would have sent: coordinated omission. In a simulation of exactly this server, open-loop measurement gave a p99 of 420 ms with 6% of requests over 10 ms. More connections shrink the effect but do not remove it.
- q: >-
    A CI suite runs 200 benchmarks after every commit and flags any change with p below 0.05. It flags around ten benchmarks on commits that only change documentation. Why?
  options: ["A threshold of p < 0.05 is too strict for benchmarks", "Documentation changes shift the binary's code layout", "The benchmarks are broken and time the wrong code", "200 tests at p < 0.05 give about ten false positives per run"]
  answer: 3
  explanation: >-
    With 200 independent tests at a 5% false-positive rate, about ten false alarms per run are expected when nothing changed. The remedy is a minimum effect size, automatic re-runs and alerts on sustained shifts. Layout effects exist but do not explain a steady false-alarm rate on every commit.
- q: >-
    In one Node process, a benchmark of a call site with one class runs at 0.8 ns per element. After a second benchmark feeds the same function six classes, re-running the one-class benchmark gives 6 ns. Why?
  options: ["The timer's resolution changed after the process warmed up", "The call site stayed megamorphic after the six-class run", "Garbage from the six-class run is still being collected", "The CPU cache was evicted by the larger six-class objects"]
  answer: 1
  explanation: >-
    V8 speculates from observed types. Once the call site has seen six classes it is compiled as megamorphic, and it does not return to the inlined single-class path, so the earlier benchmark's profile pollutes the later one. Fresh processes per benchmark, or JMH-style forks, avoid it. Garbage collection and cache effects would not persist at a sevenfold cost.
- q: >-
    An A/A test of your benchmark, with 5 runs per side, ranges from about -4% to +3%. A change measures 3% slower with 5 runs per side. What can you conclude?
  options: ["Nothing yet, since it is inside the A/A noise band", "It is a real regression, since the median moved 3%", "It is a real regression, since 5 runs is plenty", "It is an improvement, since noise favours the change"]
  answer: 0
  explanation: >-
    The A/A range is the spread you see when nothing changed, so a 3% difference inside it is not evidence of a regression. More interleaved runs, a bootstrap confidence interval on the ratio, or a quieter benchmark (instruction counts, a pinned machine) are needed. On one measured CPython workload, 5 runs per side misreported a real 3% regression 19% of the time.
```
