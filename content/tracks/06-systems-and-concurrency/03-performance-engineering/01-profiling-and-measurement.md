---
slug: profiling-and-measurement
title: "Profiling and measurement: flame graphs, p99 thinking and Amdahl's law"
description: Why the mean lies, how tail latency compounds under fan-out, the difference between on-CPU and off-CPU time, sampling versus instrumenting profilers, how to read perf output and flame graphs, and how Amdahl's law tells you what an optimisation can possibly buy.
minutes: 40
difficulty: medium
tags: [performance, profiling, flame-graphs, latency, percentiles, amdahl, perf]
---
After a deploy, your checkout service's p99 latency goes from 120 ms to 310 ms. The average moves from 38 ms to 41 ms and CPU usage is flat. Someone captures a CPU profile, sees JSON serialisation at the top (as it always has been) and proposes a faster JSON library. It would not help. The slow requests lost their time *waiting*, for a database connection that the new code holds a little longer, and a CPU profiler cannot see waiting.

Two mistakes stack up in that story: looking at the wrong statistic (the mean, which barely moved) and the wrong kind of profile (on-CPU, when the time was off-CPU). Performance work goes wrong at measurement far more often than at optimisation. This lesson is about measuring so that the next step is obvious: latency as a distribution, where wall-clock time goes, how profilers work and lie, how to read `perf` output and flame graphs, and how to bound the payoff of a change before you write it.

## Latency is a distribution, not a number

Suppose 95% of requests take 10 ms and 5% take 1,000 ms. The mean is 59.5 ms, a latency that no request actually experienced. The median (p50) is 10 ms and the p99 is 1,000 ms, and those two numbers describe the service honestly: most users are fine, and one in twenty waits a second.

A **percentile** $p$ is the value below which $p$% of observations fall. The simplest definition, **nearest rank**, sorts the $n$ samples and takes the one at rank $\lceil p \cdot n / 100 \rceil$. Monitoring systems use approximations of this over histograms, but the idea is the same.

The tail matters more than its size suggests, for two reasons.

**Fan-out amplifies it.** A page that calls 100 backend services in parallel is as slow as the slowest call. If each backend exceeds its p99 on 1% of calls, the chance that at least one of the 100 does is $1 - 0.99^{100} \approx 63\%$. The backends' p99 has become the page's *median*. Dean and Barroso's paper "The Tail at Scale" is the standard reference, and it is why large services put SLOs on p99 or p99.9 rather than averages.

**Users repeat.** A user who loads 50 pages in a session will very likely see the p99 at least once: $1 - 0.99^{50} \approx 40\%$.

Two operational rules follow from percentiles being order statistics:

- **You cannot average percentiles.** The mean of ten hosts' p99 values is not the fleet's p99; one bad host can have all the slow requests. Aggregate the *histograms* (HdrHistogram, Prometheus histogram buckets, t-digest, DDSketch) and compute the percentile from the merged distribution.
- **Histogram buckets set your resolution.** Prometheus's `histogram_quantile` interpolates linearly inside a bucket; if your buckets are 100 ms and 500 ms, a reported p99 of 320 ms means "somewhere between 100 and 500". Put bucket boundaries around your SLO.

The mean is still useful for one thing: capacity. Throughput times mean service time is the average number of busy workers (Little's law, covered in [I/O-bound versus CPU-bound](/learn/systems/performance-engineering/io-bound-vs-cpu-bound)). Use means to size, percentiles to judge.

```exercise
id: nearest-rank-percentile
title: Nearest-rank percentile
prompt: |
  Return the `p`-th percentile of `samples` using the nearest-rank method:
  sort ascending and return the element at 1-based rank ceil(p * n / 100).
  `p` is an integer from 1 to 100. Return `None`/`null` for an empty list.

  Use integer arithmetic for the rank if you can: floating-point `p / 100 * n`
  can land a hair above an integer and push the rank up by one.
languages: [python, javascript]
entry: percentile
starter:
  python: |
    def percentile(samples, p):
        # your code here
        return None
  javascript: |
    function percentile(samples, p) {
      // your code here
      return null;
    }
tests:
  - args: [[5, 1, 3, 2, 4], 50]
    expected: 3
  - args: [[5, 1, 3, 2, 4], 100]
    expected: 5
    label: p100 is the maximum
  - args: [[12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 900], 95]
    expected: 12
    label: one slow request in 20 is invisible at p95
  - args: [[12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 900], 99]
    expected: 900
    label: and dominates p99
  - args: [[], 99]
    expected: null
    label: empty input
  - args: [[3, 1, 2], 1]
    expected: 1
    hidden: true
  - args: [[7, 7, 7, 1], 26]
    expected: 7
    hidden: true
hints:
  - "Sort a copy of the samples. In JavaScript, pass a numeric comparator: sort((a, b) => a - b)."
  - "rank = ceil(p * n / 100); in Python, -(-p * n // 100) does it with integers."
  - "Return sorted[rank - 1]."
```

## Where the time goes: on-CPU and off-CPU

Every millisecond of wall-clock time a thread spends is either **on-CPU** (executing instructions, including the kernel's on its behalf) or **off-CPU**: blocked on I/O, waiting for a lock or a pool slot, sleeping, stalled on a page fault, or runnable but waiting for a core. A CPU profiler samples only the first kind. That is its entire blind spot, and it is the one that caught the team in the opening.

The quickest check is `time`, which reports wall-clock (`real`) against CPU time in user and kernel mode:

```text
$ time ./nightly-report            $ time ./image-resize --threads 8
real    0m41.203s                  real    0m12.010s
user    0m6.118s                   user    1m31.442s
sys     0m1.904s                   sys     0m2.113s
```

The report job spent 8 seconds on-CPU out of 41: it spent 33 seconds waiting, and no CPU optimisation can save more than 8. The resize job used 93 seconds of CPU in 12 seconds of wall time, so about 7.8 cores were busy throughout: it is CPU-bound and parallel, and a CPU profile is exactly the right tool.

For off-CPU time you need different instruments: off-CPU flame graphs built from scheduler events (`offcputime` from the BCC tools, or `perf sched`), Go's block and mutex profiles, async-profiler's wall-clock mode on the JVM, and at the request level, distributed tracing spans that show time spent waiting on each dependency.

A useful companion is Brendan Gregg's **USE method**: for every resource (CPUs, memory, disks, network, and also connection pools and locks), check **U**tilisation, **S**aturation (is work queueing?) and **E**rrors. It turns "the service is slow" into a short list of places the time could be going, and it often finds a saturated resource before you open a profiler at all.

## Sampling versus instrumentation

| | Sampling profiler | Instrumenting profiler |
|---|---|---|
| How | Interrupt each thread periodically (for example 99 times a second) and record its stack | Hook every function entry and exit and record timings |
| Overhead | Low and fixed, often around 1% | Proportional to the number of calls; can double the run time |
| Accuracy | Statistical: precise for anything over about 1% of samples | Exact call counts, but timing is distorted for small, frequent functions |
| Safe in production | Usually | Rarely |
| Examples | `perf`, `pprof`, `py-spy`, async-profiler, browser devtools | `cProfile`, manual timers, tracing spans |

Sampling works because of statistics. At 99 Hz for 30 seconds on 8 cores you collect about 23,800 samples. A function that really uses 1% of CPU appears in about 238 of them, and the standard error on that estimate is $\sqrt{p(1-p)/n} \approx 0.065$ percentage points. Anything big enough to be worth optimising is measured precisely. The odd frequency, 99 rather than 100 Hz, avoids sampling in lockstep with timers that fire every 10 ms.

Instrumentation distorts in a specific direction: every call pays a fixed probe cost, so code that makes many small calls looks much slower than it is (the **probe effect**). `cProfile` on function-heavy Python can double the run time and blame the wrong functions. Tracing is instrumentation at a coarse grain, one span per RPC or query, which keeps overhead low and is exactly right for "which dependency is slow" but useless for "which line".

The per-language defaults:

- **Go**: `pprof` is built in. `import _ "net/http/pprof"` exposes CPU, heap, goroutine, block and mutex profiles over HTTP.
- **Python**: `py-spy` attaches to a running process from outside, with no restart and no code change: `py-spy top --pid 4212` or `py-spy record`.
- **JVM**: async-profiler. Older JVM profilers sample only at *safepoints*, so hot loops without safepoints are invisible and their time is blamed on whatever comes next (**safepoint bias**); async-profiler avoids this.
- **Rust, C, C++**: `perf`, or `cargo flamegraph`, which wraps it.
- **Node**: `--cpu-prof` or the Chrome DevTools profiler.

**Continuous profiling** (Google published its fleet-wide version in 2010; Pyroscope, Parca and commercial agents do the same) samples every production host all the time at around 1% overhead, so you can diff the profile from before and after a deploy instead of trying to reproduce the problem.

## perf in practice

On Linux, `perf` reads the CPU's hardware counters. `perf stat` gives you the shape of a program's execution in one run:

```text
$ perf stat -e task-clock,cycles,instructions,cache-misses,branch-misses ./ingest

 Performance counter stats for './ingest':

          8,412.37 msec task-clock          #    0.997 CPUs utilized
    33,104,221,870      cycles              #    3.935 GHz
    14,902,118,334      instructions        #    0.45  insn per cycle
       612,440,118      cache-misses
        41,227,905      branch-misses

       8.437152118 seconds time elapsed
```

The number to read first is **IPC**, instructions per cycle. A modern core can retire four or more instructions per cycle; well-tuned compute loops reach 2–4. An IPC of 0.45 means the core spends most of its cycles stalled, which with 612 million cache misses points at memory: the fix is data layout ([CPU caches and memory layout](/learn/systems/performance-engineering/cpu-caches-and-memory-layout)), not fewer arithmetic instructions.

To find *where*, sample with call stacks:

```bash
perf record -F 99 -g -p 4212 -- sleep 30     # sample PID 4212 for 30 s
perf report --stdio --no-children | head -20
```

```text
# Samples: 23K of event 'cycles'
# Overhead  Command  Shared Object   Symbol
    18.42%  api      api             [.] json::escape_str
    11.07%  api      libc.so.6       [.] __memmove_avx_unaligned_erms
     9.88%  api      api             [.] regex::compile
     6.12%  api      [kernel.kallsyms] [k] copy_user_enhanced_fast_string
```

Two practical traps. First, stack walking needs frame pointers or unwind information. Many builds omit frame pointers for a small speed gain, which produces truncated, useless stacks; compile with `-fno-omit-frame-pointer` (or `-C force-frame-pointers=yes` in Rust), or use `--call-graph dwarf` at a higher cost. Several Linux distributions have recently re-enabled frame pointers by default for exactly this reason, and Go has kept them on by default for years. Second, JIT-compiled code has no symbols on disk. Node needs `--perf-basic-prof`, Python 3.12+ has `-X perf`, and the JVM is best served by async-profiler.

## Reading a flame graph

A flame graph is the standard way to look at thousands of stack samples at once. Each sample is a snapshot of the call stack at one instant, like the stack below; the profiler records tens of thousands of them.

```viz
{"type": "memory", "algorithm": "call-stack", "n": 4,
 "title": "Each sample is one snapshot of this stack",
 "caption": "A sampling profiler freezes the thread and records the frames from main() to the innermost call. A flame graph stacks thousands of these snapshots, merging identical prefixes."}
```

The pipeline is: record stacks, **fold** identical stacks into one line with a count, then render.

```bash
perf record -F 99 -a -g -- sleep 30
perf script | ./stackcollapse-perf.pl | ./flamegraph.pl > cpu.svg
# or: py-spy record -o cpu.svg --pid 4212
# or: go tool pprof -http=:8080 cpu.pprof   (then View -> Flame Graph)
```

The folded format is worth knowing, because you can reason about it directly:

```text
main;serve;handle_order;render_json;escape_str 1840
main;serve;handle_order;render_json;write_buf 310
main;serve;handle_order;validate;regex_compile 1210
main;serve;handle_order;validate;regex_match 240
main;serve;handle_order;load_customer;db_query 95
main;serve;accept_loop 105
```

There are 3,800 samples. In the rendered graph each function is a box whose **width is its share of samples**: `handle_order` spans 3,695 (97%), `render_json` 2,150 (57%), `escape_str` 1,840 (48%), `validate` 1,450 (38%), `regex_compile` 1,210 (32%). The rules for reading it:

- **The x-axis is not time.** Frames are sorted alphabetically so identical stacks merge. Left-to-right order means nothing.
- **Callers are below, callees above.** A frame's width includes everything it called; the part of its top edge with nothing above it is its **self time**, where the CPU actually was.
- **Look for wide plateaus, not tall towers.** A tall narrow tower is a deep call chain that costs little. A wide flat top is where the time goes.
- **Colours are usually decoration**, except in differential flame graphs, where red means "grew since the baseline" and blue means "shrank".

This graph tells a story in two boxes. `regex_compile` at 32% means the code compiles a regular expression on every request; hoisting it into a static or a lazily initialised global removes almost a third of the CPU. `escape_str` at 48% is JSON string escaping; a faster serialiser, or caching serialised payloads for objects that rarely change, attacks it. Notice also what is *not* there: `db_query` shows only 95 samples because a CPU profile sees only the CPU spent issuing the query, not the milliseconds spent waiting for the answer.

Variants exist for other questions: **icicle graphs** (inverted), **off-CPU flame graphs** (width is time blocked rather than time running) and **allocation flame graphs** (width is bytes allocated), which often explain a garbage-collection problem faster than a GC log does.

## Amdahl's law: what an optimisation can possibly buy

If a fraction $p$ of the run time is sped up by a factor $s$ and the rest is untouched, the overall speed-up is

$$ S = \frac{1}{(1 - p) + p / s} $$

and more generally, if parts $f_i$ of the time are each sped up by $s_i$, $S = 1 / \sum_i (f_i / s_i)$, counting untouched parts with $s_i = 1$.

Apply it to the flame graph. Eliminating `regex_compile` ($p = 0.318$, $s \to \infty$) gives $1 / 0.682 \approx 1.47\times$. Making `escape_str` twice as fast ($p = 0.484$, $s = 2$) gives $1 / (0.516 + 0.242) \approx 1.32\times$. Both together give $1 / (0.198 + 0.242) \approx 2.27\times$. That is CPU time. If half of each request's *wall-clock* time is waiting on the database, apply the law again to latency: a 2.27× CPU speed-up on the other half gives $1 / (0.5 + 0.5 / 2.27) \approx 1.39\times$ faster requests. Amdahl's law is how you avoid promising a 2× latency win and delivering 1.4×.

The same law bounds parallelism. With a serial fraction $\sigma$ and $N$ cores, $S = 1 / (\sigma + (1 - \sigma)/N)$. With just 5% serial work, 8 cores give 5.9×, 64 cores give 15.4× and infinitely many give at most 20×. In practice it is worse: shared locks and cache-line contention add a cost that *grows* with $N$, so real throughput often peaks and then declines as you add cores. The Universal Scalability Law models that coherence penalty and fits many real systems better than Amdahl does. The opposite, optimistic view (Gustafson's law) is that larger machines are used for larger problems, where the serial fraction shrinks.

```exercise
id: amdahl-speedup
title: Amdahl's law for several components
prompt: |
  `parts` lists the components you plan to speed up as `[fraction, speedup]`
  pairs: `fraction` is that component's share of the original run time and
  `speedup` is the factor by which it gets faster. Fractions sum to at most 1;
  the remaining time is unchanged.

  Return the overall speed-up rounded to 2 decimal places.
languages: [python, javascript]
entry: amdahl
starter:
  python: |
    def amdahl(parts):
        # your code here
        return 1.0
  javascript: |
    function amdahl(parts) {
      // your code here
      return 1.0;
    }
tests:
  - args: [[[0.6, 3]]]
    expected: 1.67
  - args: [[[0.05, 1000000]]]
    expected: 1.05
    label: a 5% component made essentially free
  - args: [[[0.5, 2], [0.3, 3]]]
    expected: 1.82
  - args: [[]]
    expected: 1.0
    label: nothing changed
  - args: [[[0.95, 64]]]
    expected: 15.42
    label: 64 cores with 5% serial work
  - args: [[[0.2, 1.5], [0.7, 10]]]
    expected: 3.3
    hidden: true
  - args: [[[1.0, 4]]]
    expected: 4.0
    hidden: true
hints:
  - "New time = (1 - sum of fractions) + sum of fraction / speedup, taking the original time as 1."
  - "Speed-up = 1 / new time. Round with round(x, 2) in Python or Math.round(x * 100) / 100 in JavaScript."
```

## A workflow that works

1. **Name the metric and the target.** "p99 of checkout under 200 ms at 2,000 requests per second", not "make it faster".
2. **Measure a baseline under realistic load** and keep the distribution, not just a summary.
3. **Find the saturated resource** with USE, and decide whether the time is on-CPU or off-CPU (`time`, `vmstat`, tracing).
4. **Profile the right way.** A CPU flame graph for on-CPU time; off-CPU profiles, block profiles or traces for waiting.
5. **Estimate the payoff with Amdahl** before writing code, and pick the change with the best payoff per unit of effort and risk.
6. **Change one thing and re-measure identically.** Keep the before and after profiles; a differential flame graph is the best evidence in a pull request.

## Senior signals

- You report latency as percentiles from merged histograms, never as a mean and never as an average of per-host percentiles, and you can compute how fan-out turns backend p99 into user-facing median.
- You check `real` versus `user + sys` before profiling, and you know a CPU profiler cannot see time spent waiting.
- You choose sampling for production and know its statistical resolution; you know instrumentation's probe effect and safepoint bias on the JVM.
- You read IPC from `perf stat` as a first split between compute-bound and memory-bound code, and you make sure stacks are walkable (frame pointers, JIT symbol maps).
- You read a flame graph by width and self time, not by position or height, and you name the widest frame you own.
- You bound every proposed optimisation with Amdahl's law, applied to wall-clock time, before anyone writes code.

## Check yourself

```quiz
- q: >-
    A page fans out to 50 backend calls in parallel and waits for all of them. Each backend exceeds 200 ms on 1% of calls, independently. Roughly how often does the page wait more than 200 ms?
  options: ["1% of the time", "About 5% of the time", "About 40% of the time", "About 99% of the time"]
  answer: 2
  explanation: >-
    The page is slow if any call is slow: 1 - 0.99^50 is about 0.39. Tail latency compounds under fan-out, which is why backends that serve fan-out traffic need tight p99 or p99.9 targets, not good averages.
- q: >-
    A batch job reports real 60 s, user 10 s, sys 2 s on a machine with 16 idle cores. A teammate proposes rewriting its hottest function, which takes 50% of the samples in a CPU profile. What is the most the rewrite can save?
  options: ["About 30 s", "About 24 s", "Nothing can be concluded", "About 6 s"]
  answer: 3
  explanation: >-
    Only 12 s of the 60 is on-CPU, and the function is half of that, about 6 s. The other 48 s is off-CPU waiting, which a CPU profile does not show; 30 s would be right only if the profile covered wall-clock time. Look at what the job waits on first.
- q: >-
    In a flame graph, function A is drawn wide at the bottom with a tall narrow tower above it, and function B is a wide flat box at the top of a short stack. Where is the CPU actually spending time?
  options: ["In B, because wide top edges are self time where the CPU was sampled", "In A, because it is the widest", "In the tower, because it is the tallest", "Wherever is leftmost, because the x-axis is time"]
  answer: 0
  explanation: >-
    Width includes callees, so A is wide because of what it calls. Self time is the exposed top edge, and B's wide flat top is where samples landed. Height is only stack depth and the x-axis is alphabetical, not time.
- q: >-
    Why do sampling profilers commonly use 99 Hz rather than 100 Hz?
  options: ["99 Hz has lower overhead", "To avoid sampling in lockstep with periodic activity such as 10 ms timers, which would bias the samples", "Kernel limits forbid 100 Hz", "99 is prime, so hashes of stacks collide less"]
  answer: 1
  explanation: >-
    If the sampling period aligns with a periodic task, samples systematically land on (or miss) that task. An odd frequency decorrelates them. 99 is not prime (9 times 11); the point is avoiding alignment, not primality.
- q: >-
    A service is 10% serial work and 90% perfectly parallel. Going from 8 to 32 cores changes the maximum speed-up from about what to about what?
  options: ["8x to 32x", "7.2x to 28.8x", "4.7x to 7.8x", "4.7x to 10x"]
  answer: 2
  explanation: >-
    1 / (0.1 + 0.9/8) is about 4.7, and 1 / (0.1 + 0.9/32) is about 7.8. Quadrupling cores gains less than 1.7x, and the ceiling is 10x no matter how many cores you add. Real contention usually makes it worse.
```
