---
slug: benchmarking-reality
title: "Benchmarking reality: when the asymptotic answer is wrong"
description: Constant factors that decide real performance, the input sizes where O(n²) beats O(n log n), how micro-benchmarks lie (warm-up, JIT, caching, dead code), and the profile-before-optimising discipline that separates senior engineers from fast typists.
minutes: 40
difficulty: easy
tags: [complexity, benchmarking, profiling, constant-factors, performance]
problems: [kth-largest-array, top-k-frequent]
---
A colleague replaces a linear scan over a 30-element list with a hash-map lookup because "$O(1)$ beats $O(n)$", and the endpoint gets slower. Another swaps a sort-based top-$k$ for a heap-based one, textbook-correct at $O(n \log k)$ versus $O(n \log n)$, and measures no difference at all. A third spends a week rewriting a service's inner loop in a faster language, and the p99 does not move, because 95% of the request time was a database round trip.

All three engineers knew their complexity classes. None of them measured first. This lesson is about the gap between the model and the machine: how big it is, where it comes from, how to measure it without fooling yourself, and how to decide when the asymptotic answer is the wrong one.

## Constant factors are real and they are large

Big-O hides a multiplicative constant, and that constant varies by orders of magnitude between implementations of the same complexity class. Some sources of it, with rough sizes:

| Source | Typical factor | Example |
|---|---|---|
| Interpreter vs compiled code | 10–100× | A Python loop vs the same loop in Rust or Go |
| Cache misses vs cache hits | 10–100× per access | Linked list vs array traversal |
| Allocation per element | 2–10× | Building a list of objects vs a typed array |
| Branch misprediction | 2–5× on branchy code | Sorting random vs sorted data with the same algorithm |
| Hashing overhead | 3–20× per operation vs a comparison | Hash-map lookup vs comparing a small integer |
| Function call overhead in interpreters | 2–5× | Recursion vs iteration in Python |
| SIMD / vectorisation | 4–16× | NumPy sum vs Python `sum()` over a list |

Two consequences. First, within a complexity class, implementation choices routinely swing performance by more than the difference between adjacent classes at realistic $n$. Second, a "worse" class with a tiny constant is often the right choice at the sizes you actually have.

## The crossover point

Take a concrete pair. Insertion sort does about $n^2/4$ comparisons and moves on random input, but they are all on adjacent memory with no function calls and almost no branch mispredictions. Merge sort does about $n \log_2 n$ comparisons but allocates temporary buffers, recurses, and touches memory less predictably. Suppose insertion sort costs $c_1 = 1$ unit per basic step and merge sort costs $c_2 = 8$ (a plausible ratio in practice):

| $n$ | Insertion: $n^2/4$ | Merge: $8 n \log_2 n$ | Winner |
|---|---|---|---|
| 8 | 16 | 192 | insertion (12×) |
| 16 | 64 | 512 | insertion (8×) |
| 32 | 256 | 1,280 | insertion (5×) |
| 64 | 1,024 | 3,072 | insertion (3×) |
| 128 | 4,096 | 7,168 | insertion |
| 256 | 16,384 | 16,384 | tie |
| 1,024 | 262,144 | 81,920 | merge (3×) |
| 100,000 | $2.5 \times 10^9$ | $1.3 \times 10^7$ | merge (190×) |

The crossover is somewhere in the low hundreds with these constants; in practice most measured crossovers for insertion versus merge/quick sort land between 16 and 64, which is why every production sort switches to insertion sort below a threshold in that range. Watch both on a small input and count the work.

```viz
{"type": "array", "algorithm": "insertion-sort", "values": [9, 4, 7, 1, 8, 2], "title": "Insertion sort on six elements", "caption": "Tight, adjacent memory accesses and no allocation. On inputs this small it beats every O(n log n) sort."}
```

```viz
{"type": "array", "algorithm": "merge-sort", "values": [9, 4, 7, 1, 8, 2], "title": "Merge sort on the same six elements", "caption": "Fewer comparisons asymptotically, but recursion, temporary arrays and scattered writes cost more than they save at this size."}
```

The same crossover exists for every pair of classes. A linear scan of an array beats a hash-map lookup below about 8–32 elements, depending on the key type. A list of pairs beats a `dict` for tiny maps; CPython's own `**kwargs` handling and Rust's `smallvec`/`SmallMap`-style crates exploit this. Binary search on a sorted array of a few dozen integers can lose to a linear scan because the branch predictor handles the scan perfectly and the search's data-dependent branches badly.

The rule this gives you: **when $n$ is bounded and small, the constant is the cost**. Know your $n$ before you pick the algorithm.

## When $O(n \log n)$ loses at large $n$ too

Small $n$ is the obvious case. Less obvious: sometimes a worse class wins at large $n$ because the better one has a bad memory access pattern.

- **Radix sort** ($O(nk)$ for $k$-digit keys) versus **comparison sort** ($O(n \log n)$): on 32-bit integers radix is typically 2–4× faster at $n = 10^7$, and yet its passes stream through memory, so it also wins on cache behaviour.
- **Linear search** in an $L1$-resident array versus **hash map**: the hash map wins for $n$ in the thousands, but if lookups are mostly misses, a Bloom filter in front of it wins again.
- **Dense matrix multiply** ($O(n^3)$, blocked and vectorised) routinely beats **Strassen** ($O(n^{2.81})$) until $n$ is in the thousands, because Strassen's extra additions and awkward memory layout cost more than they save.
- **Fibonacci heap** Dijkstra ($O(E + V \log V)$) loses to **binary heap** Dijkstra ($O(E \log V)$) on essentially every real graph, because the Fibonacci heap's pointer-heavy structure has a constant factor so large that the theoretical win never materialises.

The pattern: the algorithm that touches memory sequentially and predictably, with fewer allocations and fewer pointer hops, usually wins the constant-factor fight, and that fight decides the outcome until $n$ is very large.

## How micro-benchmarks lie

Having decided to measure, you can still get the wrong answer. These are the standard failure modes; an interviewer who asks "how would you verify that?" is checking whether you know them.

**No warm-up.** JIT-compiled runtimes (JVM, V8, .NET, PyPy) run code slowly the first few thousand times, then compile it. Timing the first call measures the interpreter, not the code. Run the benchmark until timings stabilise before recording.

**Dead-code elimination.** If the result of your computation is never used, an optimising compiler may delete the computation. A loop that "runs in 0 ns" did not run. Use the result: return it, print a checksum, or pass it through a black-box function that the compiler cannot see through (`std::hint::black_box` in Rust, `runtime.KeepAlive` in Go, benchmark frameworks provide equivalents).

**Cache state.** The second run of anything on the same data is faster because the data is now in cache. Decide whether you are measuring hot or cold behaviour and control for it: either run enough iterations that the warm state dominates, or evict the cache between runs by touching a large unrelated buffer.

**Noise and the wrong statistic.** A laptop's clock speed changes with temperature; other processes interrupt; the first run pays page faults. Never report one run. Run many, and report the **minimum** or a low percentile (which approximates the true cost of the code, with noise stripped out) alongside the **median** (which approximates what you will actually see). Do not report the mean: one context switch skews it.

**Unrepresentative input.** Sorting already-sorted data, hashing keys that are all the same length, searching for elements that are always present: each of these picks a branch of the algorithm that production may not take. Quicksort on sorted input with a naive pivot is the classic: the benchmark is perfect and production is quadratic.

**Measuring the harness.** In Python, `time.perf_counter()` around a one-microsecond operation mostly measures the call to `perf_counter`. Loop the operation enough times that the total is milliseconds, then divide. `timeit` does this for you; use it.

A minimal Python harness that avoids the worst of these:

```python
import time, statistics

def bench(fn, *args, repeats=7, inner=1000):
    for _ in range(3):                  # warm-up
        fn(*args)
    samples = []
    for _ in range(repeats):
        t0 = time.perf_counter()
        for _ in range(inner):
            result = fn(*args)          # keep the result alive
        samples.append((time.perf_counter() - t0) / inner)
    return min(samples), statistics.median(samples), result
```

For anything that matters, use a purpose-built tool: `pytest-benchmark` or `pyperf` in Python, `criterion` in Rust, `go test -bench` with `benchstat` in Go, JMH on the JVM. They handle warm-up, statistics and dead-code problems that you will otherwise rediscover one at a time. The [benchmarking pitfalls lesson](/learn/systems/performance-engineering/benchmarking-pitfalls) goes into these tools.

## Profile before you optimise

The third engineer in the opening rewrote a loop that was not the bottleneck. This is the most expensive mistake in performance work, and the defence is a rule: **do not optimise anything you have not profiled.**

A profiler tells you where the time goes. Two kinds:

- **Sampling profilers** (`py-spy`, `perf`, `pprof`, the browser devtools profiler) interrupt the program periodically and record the stack. Low overhead, safe in production, statistically accurate for anything that takes more than a few percent of the time.
- **Instrumenting profilers** (`cProfile`, tracing) record every call. Exact counts, but heavy overhead that distorts the timing of small functions.

The output is usually viewed as a flame graph: width is time, depth is the call stack. What you do with it:

1. Find the widest frame that you own. That is where the time goes. It is very often not where you guessed.
2. Ask whether it is CPU, memory, I/O or waiting. A frame that is wide because it is blocked on a socket does not get faster with a better algorithm.
3. Apply **Amdahl's law**: if a component takes fraction $p$ of the time and you speed it up by a factor $s$, the total speed-up is $1 / ((1 - p) + p/s)$. Making something that is 5% of the time infinitely fast gains you 5%. Making something that is 60% of the time 3× faster gains you 1.67×.

A worked example. A request takes 200 ms: 120 ms in a database query, 50 ms serialising JSON, 30 ms in application logic. The application logic contains an $O(n^2)$ loop that could be $O(n)$. Rewriting it perfectly saves at most 30 ms (15%). Adding an index that turns the query into 20 ms saves 100 ms (50%). Switching to a faster JSON library saves perhaps 35 ms. The complexity fix is the most intellectually satisfying and the least valuable of the three.

## Making the decision

Put the pieces together into a procedure you can state out loud.

1. **Complexity first, for growth.** If the input can grow without bound, pick the better class; no constant survives a factor of $n$. This is the interview default and it is right whenever $n$ is unbounded.
2. **Constants next, for bounded $n$.** If $n$ is known to be small (a fixed enum, a config list, a per-request header set), pick the simplest code with the best locality and stop.
3. **Measure at the real size on real data.** Crossovers are empirical. A one-line benchmark at your actual $n$ ends most arguments.
4. **Profile before rewriting.** Find the widest frame. Apply Amdahl's law. Only then optimise, and re-measure after.
5. **Report honestly.** "$O(n \log n)$, but for our $n \le 50$ the $O(n^2)$ insertion sort measured 3× faster, so that is what I shipped" is a senior answer. "$O(n \log n)$ is better" is a textbook answer.

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

## Senior signals

- You know the crossover exists and roughly where it is (linear scan vs hash map below ~10–30 elements; insertion vs merge sort below ~16–64), and you know that every production sort exploits it.
- You can name three constant-factor sources larger than 10× (interpreter overhead, cache misses, allocation) and say which one applies to a given piece of code.
- You describe a benchmark's controls before its result: warm-up, keeping results alive, hot versus cold cache, minimum-of-many, representative input.
- You reach for a profiler before an optimisation and quote Amdahl's law when someone proposes speeding up a component that is a small fraction of the time.
- You can tell a story where the asymptotically better algorithm lost (Fibonacci heaps, Strassen, a hash map on tiny keys) and explain the memory-access reason it lost.
- In an interview you give the complexity answer first, then add "for small $n$ I'd measure; the simpler quadratic version is often faster below a few dozen elements", and you can say why.

## Check yourself

```quiz
- q: >-
    You replace a linear scan over a 12-element list of small integers with a hash-set lookup and the code gets slower. What is the most likely explanation?
  options: ["Hashing costs more than a dozen cached comparisons", "Python lists are always faster than sets for integer data", "Hash sets degrade to O(n) for small integer keys", "The set was built with the wrong load factor for 12 keys"]
  answer: 0
  explanation: >-
    At n = 12 the scan is a handful of comparisons that sit in one or two cache lines and predict perfectly. The set lookup pays for hashing, a modulo, a probe and a key comparison; it is still O(1), just with a bigger constant. The asymptotic advantage only shows up once n is large enough for the scan's n comparisons to exceed that fixed overhead, typically in the tens.
- q: >-
    A benchmark of a JavaScript function reports that the first run took 4 ms and subsequent runs take 0.02 ms. Which number should you report as the function's cost?
  options: ["The mean of all runs, so both regimes are represented", "4 ms, because the worst case is the honest number", "Neither; a 200× gap means the function is broken", "0.02 ms; the first run was pre-JIT with cold caches"]
  answer: 3
  explanation: >-
    V8 runs new code in the interpreter, then compiles hot functions. The first-run time is a warm-up artefact (interpreter plus cold caches), not the code's steady-state cost. The mean is skewed by that one outlier; report the minimum or median after warm-up, and separately note the cold-start cost if it matters for your use.
- q: >-
    A request spends 150 ms in a database call, 40 ms in serialisation and 10 ms in an O(n²) loop you can make O(n). By Amdahl's law, what is the maximum overall speed-up from fixing the loop?
  options: ["About 2×, because quadratic to linear is a big win", "It depends on n, since the loop's cost grows as n²", "About 1.05×, since the loop is only 5% of the time", "About 20×, as the loop was the only O(n²) code"]
  answer: 2
  explanation: >-
    The loop is 10 of 200 ms. Even at infinite speed-up of that part, the total drops to 190 ms: a 1.05× improvement, whatever n is today. The database call is where the time is. Profile first, then apply Amdahl's law to decide what is worth optimising.
- q: >-
    Which benchmark defect makes an optimising compiler report that a computation takes almost zero time?
  options: ["Not warming up the JIT before timing the loop", "Running on a laptop that throttles its clock speed", "Reporting the mean of the runs rather than the minimum", "Ignoring the result, so the compiler deletes the work"]
  answer: 3
  explanation: >-
    If the result is unobservable, the compiler is entitled to remove the work that produced it (dead-code elimination). Passing the result through a black-box function or accumulating a checksum keeps the computation alive. Skipping warm-up makes timings too slow, not too fast, and the other defects add noise or bias but do not make work vanish.
- q: >-
    Why do production sorting routines such as Timsort and pdqsort switch to insertion sort for short runs?
  options: ["Its small constant wins below roughly 16–64 elements", "Short runs in real data are almost always pre-sorted", "Insertion sort becomes O(n log n) on short inputs", "It uses less memory, and memory bounds sorting speed"]
  answer: 0
  explanation: >-
    The crossover is empirical: at small n the recursive sorts pay for calls, buffers and scattered writes that insertion sort avoids (it works on adjacent memory with few mispredictions). Its growth class stays O(n²); the constant factor decides at small n. Memory savings are real but not the reason, and short runs are not assumed sorted.
```
