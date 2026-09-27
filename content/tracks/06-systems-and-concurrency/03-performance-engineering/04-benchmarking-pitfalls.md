---
slug: benchmarking-pitfalls
title: "Benchmarking pitfalls: warm-up, noise, statistics and coordinated omission"
description: How JIT warm-up, dead-code elimination, frequency scaling and memory layout corrupt benchmarks; the statistics needed to trust a small difference; why closed-loop load tests hide tail latency; and how to catch regressions in CI without crying wolf.
minutes: 30
difficulty: hard
tags: [performance, benchmarking, statistics, jit, load-testing, coordinated-omission, ci]
---
A pull request claims a 12% speed-up in JSON string escaping, backed by a microbenchmark on the author's laptop: 812 ns per call before, 715 ns after. It merges. Production CPU per request does not move. Two weeks later the nightly CI benchmark job flags an 8% regression in the same function on a commit that only edited a comment. An engineer loses a day bisecting it.

Neither result was a lie in the sense of a bug in the timer. The first measured something real that did not matter (escaping was 3% of request CPU, so a 12% improvement is worth 0.4%, well under production's noise), and the second measured noise precisely. Benchmarks go wrong in two ways: they measure something other than what you think, or they cannot distinguish a real change from variation. [Benchmarking reality](/learn/foundations/complexity/benchmarking-reality) introduced the classic traps; this lesson goes a level deeper into the mechanisms, the statistics and the load-testing error that hides the latency your users actually see.

## Decide what question you are asking

Three kinds of benchmark answer three different questions:

| Kind | Question | Scale | Tools |
|---|---|---|---|
| Micro | Is this function faster? | Nanoseconds to microseconds | JMH, criterion, `go test -bench`, pyperf, Benchmark.js |
| Macro | Is this service or job faster end to end on real data? | Milliseconds to minutes | Replay of production traffic or datasets |
| Load test | How do throughput and latency behave under concurrency, and where is the knee? | Minutes to hours | wrk2, k6, Gatling, Vegeta |

A microbenchmark result is a hypothesis about the macro result, not evidence for it. Its value in production is bounded by Amdahl's law ([profiling and measurement](/learn/systems/performance-engineering/profiling-and-measurement)): a component that is 3% of the work can move the total by at most 3%. Two more framing mistakes are common: optimising throughput with a change that worsens latency (batching, bigger buffers), and benchmarking on input that production never sends (short ASCII strings when real payloads are 40 KB of mixed Unicode; sorted keys when real keys arrive at random).

## Warm-up, JITs and the steady state

JIT-compiled runtimes change the code they run while you measure it. The JVM starts in an interpreter, compiles hot methods with a quick compiler (C1) and later recompiles the hottest ones with an optimising compiler (C2) using the types and branch frequencies it has observed. V8 has a similar pipeline of tiers. Three consequences go beyond "remember to warm up":

- **On-stack replacement.** A benchmark that times a long loop inside `main` gets the loop compiled mid-flight into a special version that can differ from how the same code runs when called normally. You measure an artefact.
- **Profile-guided speculation.** If the benchmark only ever passes one implementation of an interface, the call site is *monomorphic* and gets inlined. In production, with five implementations seen at that call site, it is *megamorphic*, and every call is an indirect dispatch the benchmark never paid for.
- **Profile pollution and deoptimisation.** Running benchmark B in the same JVM after benchmark A can leave A's type profile in shared code and make B slower. When a speculative assumption breaks, compiled code is thrown away and execution drops back to a slower tier.

This is why JMH runs each benchmark in freshly forked JVMs, with explicit warm-up and measurement iterations:

```java
@State(Scope.Thread)
@Warmup(iterations = 5, time = 1)
@Measurement(iterations = 10, time = 1)
@Fork(3)                                   // three fresh JVMs: layout and JIT decisions vary
public class EscapeBench {
    String input;

    @Setup public void setup() { input = loadRealPayload(); }

    @Benchmark public void escape(Blackhole bh) {
        bh.consume(Json.escape(input));    // keep the result alive
    }
}
```

The same care in Rust and Go looks like this. `black_box` stops the compiler from constant-folding the input or deleting unused results; in Go, assigning to a package-level variable does the same job:

```rust
use criterion::{criterion_group, criterion_main, Criterion};
use std::hint::black_box;

fn bench_escape(c: &mut Criterion) {
    let input = std::fs::read_to_string("testdata/order.json").unwrap();
    c.bench_function("escape order", |b| b.iter(|| escape(black_box(&input))));
}
criterion_group!(benches, bench_escape);
criterion_main!(benches);
```

```go
var sink string

func BenchmarkEscape(b *testing.B) {
    input := loadPayload(b)
    b.ResetTimer()                  // exclude setup from the measurement
    for i := 0; i < b.N; i++ {
        sink = escape(input)        // a package-level sink defeats dead-code elimination
    }
}
```

Even ahead-of-time compiled code has a warm-up: the first iterations take page faults, fill the instruction and data caches and train the branch predictors. Whether you *want* those effects measured depends on the question. A function called once per request on a cold cache is not described by a benchmark that calls it ten million times in a hot loop:

```viz
{"type": "memory", "algorithm": "cache-lines", "n": 32, "values": [0, 8, 16, 24, 0, 8, 16, 24, 0, 8, 16, 24],
 "title": "Cold first iteration, warm steady state",
 "caption": "The first pass over the data misses on every line; every later pass hits. A benchmark reports the warm number, which production sees only if the data stays hot between requests."}
```

The opposite trap is a benchmark whose data fits in cache while production's does not. Add one more line than the cache holds and the same loop never hits at all:

```viz
{"type": "memory", "algorithm": "cache-lines", "n": 40, "values": [0, 8, 16, 24, 32, 0, 8, 16, 24, 32, 0, 8, 16, 24, 32],
 "title": "One line too many",
 "caption": "Five lines cycling through a four-line LRU cache: every access misses. Benchmark with production-sized data, or the cache flatters you by an order of magnitude."}
```

## Where noise comes from

Run the same binary twice and you get two different numbers. The sources, roughly in order of how much they hurt:

- **Frequency scaling.** Modern CPUs change clock speed with temperature, power limits and how many cores are busy. Turbo frequency with one busy core can be far higher than with all cores busy, so a benchmark gets faster when the rest of the machine is idle. Laptops also change behaviour on battery.
- **Thermal throttling** during long runs, which makes later measurements slower than earlier ones.
- **Other work**: background processes, interrupts, an SMT sibling thread sharing your core's execution units.
- **Memory and code layout.** Address-space layout randomisation, the size of the environment variables (which shifts the initial stack), link order and whether a hot loop straddles a 64-byte boundary can all move timings by several percent. Mytkowicz and colleagues showed in 2009 ("Producing Wrong Data Without Doing Anything Obviously Wrong!") that such incidental changes produced differences as large as the optimisations being evaluated. This is why you need many *process* runs, not just many iterations inside one process.
- **Virtualisation.** Cloud VMs and CI runners share hardware with strangers, may land on different CPU models under the same instance type, and lose time to the hypervisor (`st` in `vmstat`). Run-to-run differences of 5–10% on shared CI runners are common.

On a machine you control, reduce what you can and measure what remains:

```bash
sudo cpupower frequency-set -g performance        # stop the governor changing clocks
echo 1 | sudo tee /sys/devices/system/cpu/intel_pstate/no_turbo   # Intel: disable turbo
taskset -c 3 ./bench                                # pin to one core
perf stat -r 20 ./bench                             # 20 runs; prints mean and variation
#        0.41268 +- 0.00312 seconds time elapsed  ( +-  0.76% )
```

`pyperf system tune` applies similar settings for Python benchmarks. None of this makes a laptop a lab, which is why the statistics matter.

## Statistics: enough not to fool yourself

Benchmark timings are not normally distributed. There is a hard floor (the code cannot run faster than its true cost) and interference only ever adds time, so distributions are skewed to the right and often have several modes (for example, "interrupted once" and "not interrupted"). A mean plus or minus a standard deviation describes a symmetric bell curve that is not there. Report instead:

- the **median** for typical cost, with a robust spread such as the interquartile range;
- the **minimum** as an estimate of the noise-free cost of a microbenchmark;
- the **tail** (p99, max) when the question is about latency.

To claim that B is faster than A, you need many samples of each, preferably **interleaved** (A, B, A, B, and so on) so that thermal drift and background activity affect both equally, and a comparison that does not assume normality. Go's `benchstat` uses a Mann–Whitney U test; Rust's criterion bootstraps a confidence interval for the change:

```text
          │   old.txt   │              new.txt               │
          │   sec/op    │   sec/op     vs base               │
Escape-8    812.3n ± 2%   715.0n ± 1%  -11.98% (p=0.000 n=10)
```

```text
escape order            time:   [712.41 ns 715.02 ns 717.93 ns]
                        change: [-12.408% -11.950% -11.502%] (p = 0.00 < 0.05)
                        Performance has improved.
Found 6 outliers among 100 measurements (6.00%)
```

Criterion's three numbers are the lower bound, point estimate and upper bound of the interval. Three more ideas separate a careful reading from a careless one:

- **Significance is not importance.** With enough samples, a 0.3% difference becomes statistically significant and remains irrelevant. Decide in advance the smallest effect you care about.
- **Multiple comparisons.** A suite of 200 benchmarks tested at $p < 0.05$ will report about ten "significant" changes on every run even when nothing changed. A dashboard that alerts on each one trains everyone to ignore it. Require a minimum effect size, re-run anything flagged, and look for shifts sustained across several commits.
- **Run an A/A test.** Benchmark the same binary against itself. The differences you see are your noise floor. If A/A comparisons routinely show 4%, a 3% "win" is not a result.

## Load tests and coordinated omission

Microbenchmarks mislead you about code. Load tests can mislead you about users, through an error Gil Tene named **coordinated omission**.

Most simple load generators are **closed-loop**: each virtual user sends a request, waits for the response, then sends the next. Real users are **open-loop**: they keep arriving whether or not your server is slow. Suppose a closed-loop generator sends one request every 10 ms per connection and the server stalls for 200 ms. During the stall the generator sends nothing, because it is waiting. It records one 200 ms sample. Open-loop traffic would have sent 20 requests during that stall, waiting 200, 190, 180 ... 10 ms respectively. The generator has coordinated with the server to omit exactly the samples that describe the stall, and the reported percentiles look healthy while users suffer.

Two fixes. Use an **open-loop** generator that sends on a fixed schedule and measures latency from the *intended* send time: `wrk2` with `-R`, k6's `constant-arrival-rate` executor, Vegeta, or Gatling's open workload model. Or correct the recorded data as HdrHistogram does: whenever a sample $L$ exceeds the expected interval $I$, also record the samples that would have been observed, $L - I$, $L - 2I$, and so on while they are at least $I$.

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

Two more load-testing habits: plot latency percentiles against offered load and find the **knee** where latency starts climbing (that is your real capacity, usually well below the throughput maximum), and check the load generator's own CPU, because a saturated generator reports its own queueing as your server's latency.

## Benchmarking in CI

Performance regressions are easiest to fix on the commit that introduced them, so teams want benchmarks in CI. The obstacle is noise: shared runners vary by more than the regressions you care about. The workable approaches:

1. **Dedicated hardware.** Bare-metal runners with fixed frequency, turbo off and nothing else running give the best timing signal and cost real money and maintenance.
2. **Count instructions instead of time.** Tools built on Valgrind's Cachegrind (such as iai-callgrind for Rust) execute the benchmark on a simulated CPU and report instruction counts that are deterministic to well under 1% on any runner. They are blind to cache and parallelism effects, but they catch algorithmic and code-size regressions reliably; the Rust compiler's own performance tracking leans on instruction counts for this reason.
3. **Compare on the same machine in the same job.** Build the base and the head, run them interleaved many times, and report the ratio. Absolute numbers from different runs on different runners are not comparable; a ratio from one runner often is.
4. **Detect sustained shifts, not single points.** Alert when a benchmark's history shows a change that persists over several commits (change-point detection), with a minimum effect size, and re-run automatically before paging anyone.

Record the context with every result (hardware model, kernel, compiler or runtime version, flags, input data version), or six months later nobody can tell a regression from an upgraded runner. And remember the final benchmark is production: a canary that compares CPU per request and latency percentiles between the old and new versions under real traffic answers the question every other benchmark approximates ([CI/CD and deployment](/learn/senior-craft/software-craft/ci-cd-and-deployment)).

## Senior signals

- You state what question a benchmark answers (micro, macro or load) and bound its production impact with Amdahl's law before celebrating.
- You know how JITs make benchmarks lie beyond warm-up (on-stack replacement, monomorphic call sites, profile pollution) and use JMH, criterion, `benchstat` or pyperf rather than hand-rolled loops.
- You control frequency scaling and pinning where you can, run many processes rather than many iterations, and know that layout effects alone can move results by several percent.
- You report medians and robust spreads, compare with a nonparametric test or bootstrap interval, run A/A tests for the noise floor, and account for multiple comparisons.
- You load test open-loop, measure from intended send time, and can explain coordinated omission and how HdrHistogram corrects for it.
- You make CI benchmarks trustworthy with dedicated hardware, instruction counts or same-machine ratios, plus change-point detection, and you treat canaries as the final benchmark.

## Check yourself

```quiz
- q: >-
    A microbenchmark shows a function is 12% faster after a change. A production CPU profile shows the function accounts for 3% of request CPU. What production improvement should you expect?
  options: ["About 0.4%, likely below production noise", "About 12%", "About 3%", "None, microbenchmarks never transfer to production"]
  answer: 0
  explanation: >-
    By Amdahl's law, speeding up 3% of the work by 12% saves about 0.36% of the total. The microbenchmark can be accurate and still irrelevant. It does transfer, just in proportion to the function's share.
- q: >-
    A closed-loop load test with 50 connections reports a p99 of 40 ms. Users report multi-second hangs, and server logs show periodic 2-second garbage-collection pauses. What explains the discrepancy?
  options: ["The load test used too few connections", "The server's logs are wrong", "Coordinated omission: during each pause the generator stopped sending, so it recorded one slow sample per connection instead of the many requests that real users would have sent", "p99 is the wrong percentile; the mean would show it"]
  answer: 2
  explanation: >-
    A closed-loop generator waits for responses, so a stall suppresses the very samples that describe it. An open-loop generator measuring from intended send time, or HdrHistogram-style correction, would reveal the pauses in the tail.
- q: >-
    A CI suite runs 200 benchmarks after every commit and flags any change with p below 0.05. It flags around ten benchmarks on commits that only change documentation. Why?
  options: ["The benchmarks are broken", "With 200 independent tests at a 5% false-positive rate, about ten false positives per run are expected even when nothing changed", "Documentation changes affect binary layout", "p below 0.05 is too strict"]
  answer: 1
  explanation: >-
    This is the multiple-comparisons problem. The remedy is a stricter threshold or minimum effect size, automatic re-runs of flagged benchmarks and alerts on sustained shifts rather than single-commit p-values. Layout effects exist but do not explain a steady false-alarm rate on every commit.
- q: >-
    A JVM benchmark exercises an interface method with a single implementation and shows a large speed-up from a refactor. In production, where the call site sees five implementations, the gain disappears. What is the most likely cause?
  options: ["The JVM was not warmed up", "Production uses a different garbage collector", "The benchmark forgot to use a Blackhole", "In the benchmark the call site was monomorphic and got inlined; in production it is megamorphic, so each call is an indirect dispatch the benchmark never measured"]
  answer: 3
  explanation: >-
    The JIT speculates on observed types. A benchmark with one type gets inlining and devirtualisation that production cannot. Benchmark with a realistic mix of types, or measure in production.
- q: >-
    Why do benchmark tools report medians and interquartile ranges (or bootstrap intervals) rather than mean plus or minus standard deviation?
  options: ["Means are slower to compute", "Standard deviations are always zero for fast code", "Timing distributions have a hard lower bound and a long right tail from interference, often with several modes, so symmetric summaries misdescribe them", "Medians are always smaller, which looks better"]
  answer: 2
  explanation: >-
    Interference only adds time, so timings are skewed and multimodal. The mean is dragged by rare outliers and the standard deviation assumes symmetry. Robust statistics and nonparametric tests describe and compare these distributions honestly.
```
