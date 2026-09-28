---
slug: benchmarking-reality
title: "Benchmarking reality: when the asymptotic answer is wrong"
description: Constant factors that decide real performance, the measured input sizes where O(n²) beats O(n log n), a benchmark harness that survives warm-up, JIT tiers, dead-code elimination and noise, what to report, and the profile-before-optimising discipline that separates senior engineers from fast typists.
minutes: 55
difficulty: easy
tags: [complexity, benchmarking, profiling, constant-factors, performance, jit]
problems: [kth-largest-array, top-k-frequent]
---
A colleague replaces a linear scan over a 30-element list with a hash-map lookup because "$O(1)$ beats $O(n)$", and the endpoint gets slower. Another swaps a sort-based top-$k$ for a heap-based one, textbook-correct at $O(n \log k)$ versus $O(n \log n)$, and measures no difference at all. A third spends a week rewriting a service's inner loop in a faster language, and the p99 does not move, because 95% of the request time was a database round trip.

All three engineers knew their complexity classes. None of them measured first, and two of them, when they finally did measure, measured wrong. This lesson is about the gap between the model and the machine: how big it is, where it comes from, how to measure it without fooling yourself (with a harness you can copy and the numbers it produced on one real machine), what to write down afterwards, and how to decide when the asymptotic answer is the wrong one.

## Constant factors are real and they are large

Big-O hides a multiplicative constant, and that constant varies by orders of magnitude between implementations of the same complexity class. The sources, with rough sizes (each depends on the workload; the examples are measured in this track):

| Source | Typical factor | Measured example |
|---|---|---|
| Interpreter vs compiled code | 10–100× | A pure-Python merge sort costs 54 ns per unit of $n \log_2 n$; `sorted()`, the same algorithm family in C, costs 5–6 ns ([recurrences lesson](/learn/foundations/complexity/recurrences-and-master-theorem)) |
| Cache miss vs cache hit | 10–500× per access | Sequential read 0.2 ns per element; dependent pointer chase from DRAM 100 ns ([cost model lesson](/learn/foundations/complexity/why-big-o)) |
| JIT tier | 5–10× | The same Node loop: 3.13 ms on its first call, 0.47 ms once TurboFan has compiled it (below) |
| Type feedback pollution | 5× | The same Node loop after one call with strings: 2.35 ms, permanently (below) |
| Allocation per element | 2–10× | Building a list of objects vs a typed array |
| Branch misprediction | 2–5× on branchy code | Sorting random vs sorted data with the same algorithm |
| SIMD / vectorisation | 4–16× | `gcc -O2` sums a contiguous array at 0.19 ns per element; a scalar loop cannot go below one cycle per add |

Two consequences. First, within a complexity class, implementation choices routinely swing performance by more than the difference between adjacent classes at realistic $n$. Second, a "worse" class with a tiny constant is often the right choice at the sizes you actually have.

## The crossover point, measured

Insertion sort does about $n^2/4$ comparisons and moves on random input, all on adjacent memory with no function calls. Merge sort does about $n \log_2 n$ comparisons but allocates, recurses and touches memory less predictably. Where does the quadratic one stop winning? Measured with the harness in the next section (AMD Ryzen 9 9950X3D, CPython 3.14.7, random floats, minimum of seven runs):

| $n$ | Insertion sort | Merge sort | Winner | `sorted()` (C) |
|---|---|---|---|---|
| 8 | 0.47 µs | 1.88 µs | insertion, 4× | 0.07 µs |
| 16 | 2.1 µs | 4.5 µs | insertion, 2.2× | 0.11 µs |
| 32 | 4.8 µs | 10.3 µs | insertion, 2.1× | 0.22 µs |
| 64 | 21.3 µs | 22.8 µs | tie | 0.58 µs |
| 128 | 70 µs | 51 µs | merge, 1.4× | 1.3 µs |
| 256 | 306 µs | 114 µs | merge, 2.7× | 3.0 µs |
| 1,024 | 5.6 ms | 0.54 ms | merge, 10× | 15 µs |

The crossover in CPython sits between 64 and 128 elements. In compiled code it is lower, because a comparison is a cycle rather than a dynamic dispatch, which is why the thresholds baked into production sorts are in the tens: CPython's Timsort extends runs to a minimum of 32–64 elements with binary insertion sort; libstdc++'s `std::sort` switches to insertion sort at 16; Go's `sort` (pdqsort since 1.19) uses insertion sort below 12; Java's dual-pivot quicksort switches in the mid-40s. Each of those numbers was chosen by someone running this table on their runtime.

The last column is the other lesson in the table: the C implementation is 40× faster than the same algorithm in Python at $n = 1{,}024$, a bigger gap than the one between the two algorithms. Watch both algorithms on a small input and count the work; then remember that which one wins depends on what one unit of that work costs.

```viz
{"type": "array", "algorithm": "insertion-sort", "values": [9, 4, 7, 1, 8, 2], "title": "Insertion sort on six elements", "caption": "Tight, adjacent memory accesses and no allocation. On inputs this small it beats every O(n log n) sort."}
```

```viz
{"type": "array", "algorithm": "merge-sort", "values": [9, 4, 7, 1, 8, 2], "title": "Merge sort on the same six elements", "caption": "Fewer comparisons asymptotically, but recursion, temporary arrays and scattered writes cost more than they save at this size."}
```

The same crossover exists for every pair of classes, and it moves with the runtime. Measured in CPython 3.14, `x in some_set` costs 18 ns whether the set has 1 element or 32; `x in some_list` costs 20 ns at one element and 124 ns at 32 (for a miss, which scans everything). The set wins from $n = 1$, because one Python-level comparison costs about as much as a whole hash lookup. In C++ or Rust, where a comparison is a cycle, the linear scan wins up to somewhere in the range of 8–32 elements depending on key type; the exact figure is whatever you measure on your keys. Binary search on a sorted array of a few dozen integers can lose to a linear scan because the branch predictor handles the scan perfectly and the search's data-dependent branches badly.

The rule this gives you: **when $n$ is bounded and small, the constant is the cost**. Know your $n$ before you pick the algorithm, and know your runtime before you quote a crossover.

## When $O(n \log n)$ loses at large $n$ too

Small $n$ is the obvious case. Less obvious: sometimes a worse class wins at large $n$ because the better one has a bad memory access pattern.

- **Radix sort** ($O(nk)$ for $k$-digit keys) versus **comparison sort** ($O(n \log n)$): on 32-bit integers radix is a small integer factor faster at $n = 10^7$, because its passes stream through memory sequentially and the comparison sort's do not.
- **Dense matrix multiply** ($O(n^3)$, blocked and vectorised) routinely beats **Strassen** ($O(n^{2.81})$) until $n$ is in the thousands, because Strassen's extra additions and awkward memory layout cost more than they save.
- **Fibonacci heap** Dijkstra ($O(E + V \log V)$) loses to **binary heap** Dijkstra ($O(E \log V)$) on essentially every real graph, because the Fibonacci heap's pointer-heavy structure has a constant factor so large that the theoretical win never materialises.
- **A hash map** loses to **a sorted array plus binary search** for read-mostly sets that fit in cache, because the array is contiguous and the map's buckets are not.

The pattern: the algorithm that touches memory sequentially and predictably, with fewer allocations and fewer pointer hops, usually wins the constant-factor fight, and that fight decides the outcome until $n$ is very large.

## A harness that does not lie to you

Every number in this lesson came from a harness like this one. The four comments mark the four things a naive `time.time()` around one call gets wrong.

```python
import time, statistics

def bench(fn, *args, repeats=7, inner=None):
    for _ in range(3):                          # 1. warm up: caches, allocator, JIT tiers
        fn(*args)
    if inner is None:                           # 2. loop enough that the timer is not the cost
        t0 = time.perf_counter(); fn(*args)
        inner = max(1, int(0.01 / max(time.perf_counter() - t0, 1e-9)))
    samples = []
    for _ in range(repeats):
        t0 = time.perf_counter()
        for _ in range(inner):
            result = fn(*args)                  # 3. keep the result alive
        samples.append((time.perf_counter() - t0) / inner)
    return min(samples), statistics.median(samples), result   # 4. report min and median, never mean
```

The `inner` auto-sizing targets about 10 ms per sample so that a 20 ns operation is timed over half a million iterations. That matters because `time.perf_counter()` itself costs about 39 ns per call on this machine (it reads `CLOCK_MONOTONIC` through the vDSO, no system call, but still a function call and a clock read), so timing a single 6 ns bytecode operation directly would report the timer, not the operation. `timeit` does the same auto-sizing for you (`timeit.repeat("x + 1", "x = 5", number=10**6, repeat=5)` reports 5.8 ns per addition here) and additionally disables the cyclic garbage collector during timing, which is why its numbers are slightly lower and steadier than a hand loop's.

For anything that matters, use a purpose-built tool, because each of them has already rediscovered the failure modes below:

| Tool | Runtime | Handles warm-up | Statistics | Dead-code guard | Reach for it when |
|---|---|---|---|---|---|
| `timeit` | Python | no (you loop first) | min of repeats | no | one-liners in a shell |
| `pyperf` / `pytest-benchmark` | Python | yes, plus process spawning | mean, stdev, outlier detection | no | CI-tracked benchmarks |
| `criterion` | Rust | yes | bootstrap confidence intervals, regression detection | `black_box` | any Rust hot path |
| `go test -bench` + `benchstat` | Go | yes, auto-sizes `b.N` | p-value comparison between runs | `runtime.KeepAlive`, `testing.B.Loop` | any Go hot path |
| JMH | JVM | yes, forks and tiers | percentiles, error bars | `Blackhole` | anything on the JVM |
| `perf stat` | any native | n/a | cycles, instructions, cache misses | n/a | when you need to know *why* |

The [benchmarking pitfalls lesson](/learn/systems/performance-engineering/benchmarking-pitfalls) goes into these tools; the rest of this section is the evidence for why they exist.

## How micro-benchmarks lie, with the receipts

**No warm-up.** JIT-compiled runtimes run code slowly first and compile it later. Timing one call to a function that sums a million-element array in Node 24 (V8), call by call:

```text
call:  1     2     3     4     5     6     7     8
ms:    3.13  0.50  0.48  0.47  0.48  0.52  0.49  0.48
```

The first call is 6.6× the steady state. Run with `--trace-opt` and V8 says what happened during it: the function is marked "hot and stable", compiled by **Maglev** *while the loop is running* (the trace says `OSR`, on-stack replacement: the running interpreter frame is swapped for compiled code mid-loop), then recompiled by **TurboFan**; there is even a deopt in the middle (`reason: overflow`) when the running sum exceeds $2^{31}$ and stops fitting in V8's small-integer representation. Timing the first call measures the interpreter, a compile and a deopt. Run until timings stabilise before recording anything, and if cold-start cost is what you care about, measure that separately and say so.

**Type feedback pollution.** The same loop with a `+` site that has only ever seen integers runs in 0.47 ms. Call it *once* with an array of strings, then go back to integers: 11.2 ms for the next call (deoptimise and recompile), then 2.35 ms for every call after that. The site is now polymorphic, the generic add path stays, and the function is 5× slower for the rest of the process's life. A benchmark that shares a function between two test inputs of different types measures neither.

**Dead-code elimination.** If the result of a computation is never used, an optimising compiler may delete the computation. Measured with `gcc -O2` on a loop summing $10^9$ integers:

| Variant | Time |
|---|---|
| Result unused | 0.001 ms (the loop is gone) |
| Result printed | 0.000 ms (the loop is *also* gone: gcc recognised $\sum_{i<N} i = N(N-1)/2$ and emitted the closed form) |
| Accumulator declared `volatile` | 179 ms (every store forced to memory) |
| Same source at `-O0` | 337 ms |

Using the result is not enough when the compiler can compute the result algebraically. The standard defence is an opaque input *and* an opaque output: `std::hint::black_box` in Rust, `testing.B` with `b.Loop` or `runtime.KeepAlive` in Go, JMH's `Blackhole`, or in C a value read from `argv` and written through `volatile`. For contrast, V8 did *not* remove the equivalent unused JavaScript loop (50 ms either way): JITs are more conservative, which means a JS benchmark that "runs in 0 ms" is broken in some other way.

**Cache state.** The second run of anything on the same data is faster because the data is in cache. Decide whether you are measuring hot or cold behaviour and control for it: run enough iterations that the warm state dominates, or evict the cache between runs by touching a large unrelated buffer. The 100 ns-per-element gap between cached and uncached pointer chasing (from the cost model lesson) is bigger than most algorithmic differences.

**Noise and the wrong statistic.** Thirty back-to-back timings of the same 0.5 ms merge sort on an otherwise idle desktop: minimum 525 µs, median 537 µs, p90 555 µs, maximum 558 µs, mean 538 µs, standard deviation 10 µs. That is a 2% spread on a good day. On a laptop with thermal throttling, or a shared CI runner, the spread is routinely 20–50% and one context switch adds a 10 ms outlier that moves the mean by a third. Report the **minimum** (the closest you can get to the code's cost, with the noise stripped out) alongside the **median** (what you will typically see); use percentiles for latency. Never the mean of a handful of runs.

**Unrepresentative input.** Sorting already-sorted data, hashing keys that are all the same length, searching for elements that are always present: each picks a branch of the algorithm that production may not take. The recurrences lesson measured the classic: a first-element-pivot quicksort sorts 8,000 random elements in 3.6 ms and the same 8,000 elements pre-sorted in 589 ms. A benchmark on either input alone tells you nothing about the other.

**Measuring the harness.** A loop of `perf_counter()` calls with nothing inside reports 39 ns per iteration. Anything you time that is within a factor of ten of that is mostly the timer.

## What to report

A benchmark result without its conditions is a rumour. The minimum that lets someone else reproduce or refute it:

| Item | Example |
|---|---|
| Machine and runtime version | AMD Ryzen 9 9950X3D, CPython 3.14.7 |
| Input: size, distribution, hot or cold | $n = 1{,}024$ random floats, hot cache |
| Warm-up and iteration count | 3 warm-up calls, 7 samples of ~10 ms each |
| Statistic | minimum and median per sample |
| The comparison, as a ratio | insertion 5.6 ms vs merge 0.54 ms: 10× |
| Scaling check | doubling $n$ from 512 to 1,024 cost 4.4× for insertion, 2.2× for merge |

The ratio and the scaling check are the two numbers that survive a change of machine. Absolute times do not.

## Profile before you optimise

The third engineer in the opening rewrote a loop that was not the bottleneck. This is the most expensive mistake in performance work, and the defence is a rule: **do not optimise anything you have not profiled.**

Two kinds of profiler:

- **Sampling profilers** (`py-spy`, `perf`, `pprof`, the browser devtools profiler, async-profiler on the JVM) interrupt the program periodically (typically 100–1,000 times per second) and record the stack. Overhead of a few percent, safe in production, statistically accurate for anything that takes more than a few percent of the time.
- **Instrumenting profilers** (`cProfile`, tracing) record every call. Exact counts, but they slow small Python functions by 2–5× and so distort the very ratios you are trying to read.

Here is `cProfile` on a request handler that loads rows (a 120 ms sleep standing in for a database call), deduplicates them with an $O(n^2)$ `x not in out` loop, and serialises them to JSON, sorted by cumulative time:

```text
ncalls  tottime  cumtime  filename:lineno(function)
     1    0.000    0.179  handler.py:12(handle)
     1    0.002    0.135  handler.py:3(load)
     1    0.120    0.120  {built-in method time.sleep}
     1    0.033    0.033  handler.py:7(dedupe_quadratic)
 20000    0.006    0.013  random.py:335(randint)
     1    0.007    0.011  handler.py:5(serialise)
```

Read it as a budget: 179 ms total, 120 ms waiting on "the database", 33 ms in the quadratic loop, 11 ms serialising. Then apply **Amdahl's law**: if a component takes fraction $p$ of the time and you speed it up by a factor $s$, the total speed-up is $1 / ((1 - p) + p/s)$. Making the quadratic loop infinitely fast ($p = 0.18$, $s = \infty$) gives $1 / 0.82 = 1.22\times$. Halving the database time ($p = 0.67$, $s = 2$) gives $1 / (0.33 + 0.335) = 1.5\times$. The complexity fix is the most intellectually satisfying and the least valuable of the two, and the profile is the only thing that tells you so.

In a flame graph the same information is width (time) against depth (stack). Find the widest frame you own; ask whether it is CPU, memory, I/O or waiting (a wide frame blocked on a socket does not get faster with a better algorithm); apply Amdahl; then, and only then, change code, and re-profile to confirm the width moved.

## Under the hood: what the runtime does to your benchmark

**Tiers and on-stack replacement.** V8 runs new code in the Ignition interpreter, collecting type feedback at every operation and property access. A function that becomes hot is compiled by Sparkplug (a baseline compiler, no optimisation), then Maglev, then TurboFan, each taking longer to compile and producing faster code. A hot *loop* inside a function that is still running is compiled and entered mid-execution through on-stack replacement, which is why the first call in the table above got faster before it finished. The [source-to-execution lesson](/learn/foundations/how-code-runs/from-source-to-execution) covers the pipeline; for benchmarking, the consequence is that "the same function" is at least four different pieces of machine code during a run, and your timing loop decides which one you measure. The JVM does the same with C1 and C2; CPython 3.14 has a specialising interpreter that rewrites bytecodes in place after a few executions (`BINARY_OP` becomes `BINARY_OP_ADD_INT`) and an experimental JIT, so even Python has a warm-up phase, on the order of a few hundred executions per bytecode.

**Small integers and deoptimisation.** V8 stores integers that fit in 31 bits as tagged immediates ("Smis") and everything else as heap-allocated doubles. The trace's `reason: overflow` deopt was the running sum crossing $2^{31}$; the compiled code assumed Smi arithmetic and had to be thrown away. A benchmark whose accumulator happens to stay below $2^{31}$ measures a different machine-code path from one that does not.

**What the clock reads.** `time.perf_counter()` and `process.hrtime.bigint()` read `CLOCK_MONOTONIC` via `clock_gettime`, which on Linux is served from the vDSO without a system call, at nanosecond resolution and roughly 20–40 ns per read. That resolution is finer than the CPU's frequency changes: a modern core moves between idle, base and boost clocks in microseconds, so two consecutive samples can run at different speeds. Pinning the frequency (or disabling turbo) is what serious benchmark rigs do; when you cannot, take the minimum of many samples.

**What `timeit` does that a loop does not.** It disables the cyclic garbage collector for the duration of the timing (`gc.disable()` in `Timer.timeit`), so allocation-heavy code looks a little better than it will in production, where collections happen. `pyperf` goes further and spawns fresh processes so that address-space layout and hash seeds vary between runs, which is where a surprising amount of run-to-run variance comes from.

## Failure modes in production

**A canary judged during warm-up.** *Symptom:* every deploy of a JVM or Node service shows the canary 30–50% slower than the baseline for its first minutes, and the automated analysis rolls it back. *Diagnosis:* the baseline fleet has been running for days with fully optimised code; the canary is interpreting. Plot canary latency against time since start and the curve is the warm-up curve from the table above. *Fix:* send synthetic or mirrored traffic to the canary before it counts, or start the comparison window after a warm-up period; Netflix's open-source canary analysis tool Kayenta compares the canary against a freshly started baseline instance for exactly this reason.

**A ten-times-faster pull request that was not.** *Symptom:* a micro-benchmark in the PR shows a 10× win; the production dashboard shows nothing. *Diagnosis:* the benchmark's result was unused and the compiler deleted the work (the `0.001 ms` row above), or the benchmark used one small fixed input that sat in L1 while production data does not, or it ran a function that shares a type-feedback site with other callers. *Fix:* keep results alive through an opaque sink, use production-shaped inputs at production $n$, and report a scaling check (2× $n$ → how much time?) alongside the number.

**The mean hid the tail.** *Symptom:* a new data structure improves the benchmark's average by 20%, and after deploy p99 latency doubles. *Diagnosis:* the new structure allocates more per operation, which is cheap on average and expensive every time the garbage collector runs; a mean over a few runs never saw a collection. *Fix:* report percentiles from thousands of samples, benchmark with the GC enabled and allocation counted (`tracemalloc`, Go's `-benchmem`, JMH's GC profiler), and watch p99 in the canary, not the mean.

**A crossover quoted from the wrong runtime.** *Symptom:* a Python service replaces a five-element list scan with a set "because linear scans win below ten elements", or a Rust service replaces a five-element linear probe with a hash map "because $O(1)$", and each gets slower. *Diagnosis:* the folklore came from the other runtime; the crossover moved. *Fix:* measure at your $n$ on your runtime; the whole measurement takes a minute with the harness above.

**A deoptimisation storm after a schema change.** *Symptom:* a Node service's p50 rises from 2 ms to 10 ms with no deploy, and stays there. *Diagnosis:* a new field arrived with a different type (a string where a number was), a hot site became polymorphic, and V8 recompiled it with the generic path; `node --trace-deopt` names the function and reason. *Fix:* normalise input types at the boundary, keep object shapes consistent, and restart the process if the pollution is a one-off.

## Making the decision

1. **Complexity first, for growth.** If the input can grow without bound, pick the better class; no constant survives a factor of $n$.
2. **Constants next, for bounded $n$.** If $n$ is known to be small (a fixed enum, a config list, a per-request header set), pick the simplest code with the best locality and stop.
3. **Measure at the real size on real data, with the harness above.** Crossovers are empirical and runtime-specific.
4. **Profile before rewriting.** Find the widest frame. Apply Amdahl's law. Only then optimise, and re-measure after.
5. **Report honestly, with conditions.** "$O(n \log n)$, but for our $n \le 50$ the $O(n^2)$ insertion sort measured 2× faster in CPython (min of 7, hot cache), so that is what I shipped" is a senior answer. "$O(n \log n)$ is better" is a textbook answer.

```exercise
id: stable-insertion-sort
title: Insertion sort, the small-n workhorse
prompt: |
  Implement `insertion_sort(nums)` returning a new list sorted ascending, using the insertion sort algorithm: for each element from left to right, shift larger elements one slot right and drop it into place. It must be **stable** (equal elements keep their original relative order), which is why production sorts use it for small runs.

  Do not call the built-in sort. The tests include a list of pairs sorted by their first element, where stability is visible in the output.
languages: [python, javascript]
entry: insertion_sort
starter:
  python: |
    def insertion_sort(nums):
        out = list(nums)
        # for i in range(1, len(out)): shift larger elements right, insert out[i]
        return out
  javascript: |
    function insertion_sort(nums) {
      const out = nums.slice();
      // for i from 1: shift larger elements right, insert out[i]
      return out;
    }
tests:
  - args: [[9, 4, 7, 1, 8, 2]]
    expected: [1, 2, 4, 7, 8, 9]
  - args: [[]]
    expected: []
    label: empty input
  - args: [[5]]
    expected: [5]
    label: single element
  - args: [[3, 3, 1, 1]]
    expected: [1, 1, 3, 3]
    label: duplicates
  - args: [[1, 2, 3, 4]]
    expected: [1, 2, 3, 4]
    label: already sorted is O(n)
  - args: [[-2, 0, -5, 3]]
    expected: [-5, -2, 0, 3]
    hidden: true
  - args: [[[2, "b"], [1, "a"], [2, "a"], [1, "b"]]]
    expected: [[1, "a"], [1, "b"], [2, "b"], [2, "a"]]
    hidden: true
    label: stable on pairs compared by first element only
hints:
  - "Keep the prefix out[0..i] sorted. Take x = out[i], walk j from i - 1 down while out[j] > x (strictly greater, to stay stable), moving out[j] to out[j + 1], then place x at out[j + 1]."
  - "For the pair test compare only the first element: out[j][0] > x[0]. In JavaScript, arrays are compared by reference, so you must index into them explicitly."
```

```exercise
id: timing-summary
title: Summarise benchmark samples the honest way
prompt: |
  `samples` is a non-empty list of timings in microseconds from repeated runs of the same code. Return `[minimum, p50, p90]`, where the p-th percentile is defined on the sorted samples as the value at 0-based index `ceil(p * n) - 1` (so p50 of `[1, 2, 3, 4, 5]` is the element at index `ceil(2.5) - 1 = 2`, which is 3, and p90 is at index `ceil(4.5) - 1 = 4`, which is 5).

  Use integer arithmetic for the index (`ceil(9 * n / 10)` computed exactly) so the result does not depend on floating-point rounding. Do not modify the input list.
languages: [python, javascript]
entry: timing_summary
starter:
  python: |
    def timing_summary(samples):
        # return [min, p50, p90]
        return [0, 0, 0]
  javascript: |
    function timing_summary(samples) {
      // return [min, p50, p90]
      return [0, 0, 0];
    }
tests:
  - args: [[5, 1, 4, 2, 3]]
    expected: [1, 3, 5]
  - args: [[7]]
    expected: [7, 7, 7]
    label: a single sample is every statistic
  - args: [[10, 10, 10, 10, 10, 10, 10, 10, 10, 1000]]
    expected: [10, 10, 10]
    label: one outlier moves the mean to 109 and none of these
  - args: [[0.5, 0.52, 0.51, 0.9]]
    expected: [0.5, 0.51, 0.9]
  - args: [[2, 1]]
    expected: [1, 1, 2]
    hidden: true
  - args: [[558, 525, 537, 555, 540, 530, 549, 533, 545, 528, 552, 535]]
    expected: [525, 537, 555]
    hidden: true
    label: twelve real samples
hints:
  - "Sort a copy. For p = 0.5 the index is ceil(n / 2) - 1; for p = 0.9 it is ceil(9 n / 10) - 1. In Python, ceil(a / b) for positive integers is -(-a // b)."
  - "In JavaScript, Math.ceil(9 * n / 10) is exact because 9 * n and 10 are exact integers and division is correctly rounded."
```

## Interviewer follow-ups

**"You benchmarked both versions and yours is 3× faster. How do you know the benchmark is right?"** *Model answer:* I warmed up, looped enough that the timer is under 1% of the sample, kept the result alive, took the minimum and median of seven runs, used production-shaped input at production $n$, and checked that doubling $n$ scales the way the complexity predicts; here are those numbers. *Common wrong answer:* "I ran it a few times and it was consistently faster", which answers none of the questions.

**"The JVM service is slower for the first five minutes after deploy. Is that a regression?"** *Model answer:* no, it is JIT warm-up: code runs interpreted until it is profiled and compiled by C1 then C2. Compare the canary after a warm-up window, or warm it with mirrored traffic; if the steady state is also slower, then it is a regression. *Common wrong answer:* "the new build must have a slower code path", or rolling back on the first minute's numbers.

**"Both approaches are $O(n \log n)$. Which do you ship?"** *Model answer:* the class does not decide, so I look at memory access pattern, allocation per element and whether the working set fits in cache, then benchmark both at the real $n$ on real data and report the ratio with its conditions; I expect the one with sequential access and fewer allocations to win, and I check rather than assume. *Common wrong answer:* the one with the cleverer algorithm or the better name.

**"Your profile shows the hot loop is 15% of request time. What is the most you can gain by optimising it?"** *Model answer:* Amdahl: $1 / (0.85 + 0.15/s)$, which is at most $1.18\times$ even at infinite speed-up; the 60% database call is where the time is, so I would index or batch that first. *Common wrong answer:* "a lot, because it is $O(n^2)$", which ignores where the time actually goes.

**"A hash lookup is $O(1)$; why did replacing the linear scan make it slower?"** *Model answer:* $n$ was small enough that the scan's handful of cached comparisons cost less than one hash plus probe plus key compare; the crossover depends on the runtime (in CPython the set wins from about one element; in Rust a linear scan of a few elements wins) and on key type, so I measure at our $n$. *Common wrong answer:* "it should not be slower; the benchmark is wrong", when the benchmark is the only thing in the conversation that is right.

## What mid-level engineers get wrong

- **Timing one call, cold.** The first call of anything measures caches, page faults and JIT compilation, not the code; it can be 5–10× the steady state and it is the number that gets pasted into the PR.
- **Reporting the mean of three runs.** One context switch or a garbage collection moves it by 30%; the minimum and median are stable, the mean is not.
- **Letting the compiler delete the benchmark.** An unused result, or a result the compiler can compute in closed form, produces a "0 ns" that gets reported as a win.
- **Sharing one function between test inputs of different types.** In a JIT, the second input's types pollute the first's feedback; both benchmarks then measure the generic path.
- **Quoting a crossover from a different runtime.** "Linear scan wins below ten" and "hash map is always faster" are both true somewhere and both wrong on the runtime in front of you.
- **Optimising the function they understand instead of the one the profiler shows.** The $O(n^2)$ loop is 15% of the time; the database call is 60%; the week goes to the loop.
- **Benchmarking without allocation and GC.** A structure that is faster on average and allocates more shows up as a p99 regression that the average never predicted.

## Senior signals

- You know the crossover exists, that it depends on the runtime, and roughly where it sits in yours (CPython: a set beats a list scan from about one element; insertion beats merge sort up to 64–128 elements; compiled code moves both lower), and you know that every production sort exploits it with a threshold in the tens.
- You can name three constant-factor sources larger than 10× (interpreter overhead, cache misses, JIT tier) and say which one applies to a given piece of code.
- You describe a benchmark's controls before its result: warm-up, iteration count, result kept alive, hot versus cold cache, minimum and median of many, representative input, and a scaling check.
- You can say what V8 or the JVM did to your function during the benchmark (tiers, on-stack replacement, deoptimisation) and why the first call is not the number.
- You reach for a profiler before an optimisation and quote Amdahl's law when someone proposes speeding up a component that is a small fraction of the time.
- You can tell a story where the asymptotically better algorithm lost (Fibonacci heaps, Strassen, a hash map on tiny keys) and give the memory-access reason.
- In an interview you give the complexity answer first, then add "for small $n$ I would measure; the simpler quadratic version is often faster below a few dozen elements", and you can produce the table that shows it.

## Check yourself

```quiz
- q: >-
    You replace a linear scan over a 12-element list of small integers with a hash-set lookup in Rust and the code gets slower. What is the most likely explanation?
  options: ["Hashing costs more than a dozen cached comparisons", "Hash sets degrade to O(n) for small integer keys", "The set was built with the wrong load factor for 12 keys", "Rust vectors are always faster than sets for integer data"]
  answer: 0
  explanation: >-
    At n = 12 in compiled code the scan is a handful of comparisons that sit in one or two cache lines and predict perfectly. The set lookup pays for hashing, a modulo, a probe and a key comparison; it is still O(1), only with a bigger constant. In CPython the answer would differ, because each list comparison is a dynamic dispatch and the set wins almost immediately; the crossover belongs to the runtime.
- q: >-
    A Node benchmark reports that the first call of a function took 3.1 ms and subsequent calls take 0.47 ms. Which number should you report as the function's cost?
  options: ["The mean of all runs, so both regimes are represented", "3.1 ms, because the worst case is the honest number", "0.47 ms; the first run was interpreted, then compiled", "Neither; a 6× gap means the function is broken"]
  answer: 2
  explanation: >-
    V8 runs new code in the interpreter, then compiles hot functions with Maglev and TurboFan, replacing the running loop on the stack. The first-run time is a warm-up artefact (interpreter plus compilation plus cold caches), not the code's steady-state cost. The mean is skewed by that one outlier; report the minimum or median after warm-up, and separately note the cold-start cost if it matters for your use.
- q: >-
    A request spends 120 ms in a database call, 11 ms in serialisation and 33 ms in an O(n²) loop you can make O(n). By Amdahl's law, what is the maximum overall speed-up from fixing the loop?
  options: ["About 20×, as the loop was the only O(n²) code", "About 1.2×, since the loop is under a fifth of the time", "It depends on n, since the loop's cost grows as n²", "About 2×, because quadratic to linear is a big win"]
  answer: 1
  explanation: >-
    The loop is 33 of 164 ms, about 20%. Even at infinite speed-up of that part the total drops to 131 ms: a 1.25× improvement, whatever n is today. The database call is where the time is. Profile first, then apply Amdahl's law to decide what is worth optimising.
- q: >-
    A C benchmark of a loop that sums the integers below N reports 0.000 ms at -O2 even though the sum is printed afterwards. What happened?
  options: ["The CPU ran the loop in parallel across its cores", "Printing the result happens before the loop finishes", "The clock's resolution is too coarse to see a fast loop", "The compiler replaced the loop with the closed-form N(N-1)/2"]
  answer: 3
  explanation: >-
    Using the result is not enough when the compiler can compute it algebraically: gcc recognises the arithmetic series and emits a multiplication. Only an input the compiler cannot see (read at run time) and an output it cannot remove (a volatile store or a black-box sink) force the loop to run. The clock resolves nanoseconds, and compilers do not auto-parallelise across cores at -O2.
- q: >-
    You call a JIT-compiled JavaScript function once with an array of strings in the middle of an integer benchmark. What does the timing show afterwards?
  options: ["A speed-up, because the JIT now has more type information", "No change; each call is compiled fresh for its argument types", "A one-off slow call, after which it returns to full speed", "A permanent slowdown, since the add site is now polymorphic"]
  answer: 3
  explanation: >-
    The measured sequence was 0.47 ms per call, then 11 ms for the deoptimise-and-recompile, then 2.35 ms for every call after: the site's feedback now includes strings, so the recompiled code keeps the generic path and runs 5× slower for the life of the process. Feedback is per site, not per call, and more types means less specialisation, not more.
- q: >-
    Which single practice most improves the honesty of a reported micro-benchmark result?
  options: ["Running the benchmark on the fastest machine available", "Using the mean of exactly ten runs for statistical validity", "Timing a single call so that warm-up effects are included", "Reporting the minimum and median of many runs with their conditions"]
  answer: 3
  explanation: >-
    The minimum approximates the code's cost with noise stripped out, the median approximates what you will see, and the conditions (machine, runtime version, input, warm-up, iteration count, scaling check) let someone reproduce or refute it. A fast machine changes the absolute numbers but not the ratios; the mean of ten runs is moved by a single outlier; a single cold call measures the runtime's warm-up, not the code.
```
