---
lesson: benchmarking-reality
source: b30b6375e3777c2c
fit: great
desk:
  - "The insertion sort versus merge sort crossover table"
  - "The benchmark harness code, and the table of benchmarking tools by runtime"
  - "The dead-code elimination timings and the profiler output read as a budget"
  - "Exercises: a stable insertion sort, and summarising benchmark samples"
---
## Introduction

A colleague replaces a linear scan over a 30-element list with a hash-map lookup, because order 1 beats order n, and the endpoint gets slower. Another swaps a sort-based top k for a heap-based one, textbook-correct, and measures no difference at all. A third spends a week rewriting a service's inner loop in a faster language, and the 99th percentile does not move, because 95 percent of the request time was a database round trip.

All three knew their complexity classes. None of them measured first, and two of them, when they finally did, measured wrong.

Four ideas: how big constant factors really are, where the crossover between classes sits, how micro-benchmarks lie to you, and why you profile before you optimise.

## Constant factors are large

Big O hides a multiplicative constant, and that constant varies by orders of magnitude between implementations of the same class. Interpreted against compiled code: 10 to 100 times. A pure-Python merge sort costs about 54 nanoseconds per unit of n log n; the built-in sort, written in C, costs 5 or 6. A cache miss against a cache hit: 10 to 500 times per access. A just-in-time compiler's tiers: 5 to 10 times between the first run and the optimised one. Vectorisation: 4 to 16 times.

Two consequences. Within one complexity class, implementation choices routinely swing performance by more than the gap between adjacent classes at realistic sizes. And a "worse" class with a tiny constant is often the right choice at the sizes you actually have.

## The crossover, measured

Insertion sort is quadratic, but it works on adjacent memory with no function calls and no allocation. Merge sort is n log n, but it allocates, recurses and touches memory less predictably. Where does the quadratic one stop winning?

Measured in CPython 3.14 on random floats: at 8 elements, insertion sort is 4 times faster. At 32, still twice as fast. At 64, a tie. At 128, merge sort wins by about 1.4. At 1,024, merge sort wins by 10 times. So in CPython, the crossover sits between 64 and 128 elements.

In compiled code it sits lower, because a comparison is one cycle rather than a dynamic dispatch. That is why the thresholds baked into production sorts are in the tens: libstdc++ switches to insertion sort at 16, Go at 12, Java at 44, and CPython's Timsort builds its runs up to 32 to 64 elements with insertion sort. Each of those thresholds is a crossover measured for that runtime.

And notice the other lesson in that table. At 1,024 elements, the C sort was about 40 times faster than the same family of algorithm in Python. A bigger gap than the one between the two algorithms.

The same crossover moves with the runtime for lookups. In CPython, a set membership test costs about 18 nanoseconds whether the set has 1 element or 32. A list scan costs 20 nanoseconds at one element and 124 at 32. The set wins from the start, because one Python comparison costs about as much as a whole hash lookup. In C++ or Rust, the linear scan wins up to somewhere between 8 and 32 elements.

The rule: when n is bounded and small, the constant is the cost. Know your n before you pick the algorithm, and know your runtime before you quote a crossover.

Sometimes a worse class wins at large n too. Radix sort on 32-bit integers beats a comparison sort at ten million elements, because its passes stream through memory. A binary-heap Dijkstra usually beats a Fibonacci-heap one, because the Fibonacci heap's pointer-linked nodes cost far more per operation. The pattern: the algorithm that touches memory sequentially, with fewer allocations and fewer pointer hops, wins the constant-factor fight.

## How micro-benchmarks lie

A good harness does four things a naive timer around one call does not: it warms up first, it loops enough that the timer is not the cost, it keeps the result alive, and it reports the minimum and median, never the mean. Here is the evidence for each.

No warm-up. In Node, a function that sums a million-element array took 3.13 milliseconds on its first call and about 0.47 on every call after. Six and a half times. During that first call, the V8 engine compiled the loop while it was running, recompiled it with its optimising compiler, and even threw that away once when the running sum outgrew its small-integer representation. Timing the first call measures the interpreter and two compiles.

Type feedback pollution. Take that same fast function and call it once with an array of strings. The next call takes 11 milliseconds to deoptimise and recompile. And then every call after that takes 2.35 milliseconds, permanently. Five times slower for the rest of the process's life, because the add site has now seen two types and keeps the generic path.

[pause]

Dead-code elimination. If a result is never used, an optimising compiler may delete the computation. A C loop summing a billion integers reported essentially zero time with its result unused. With the result printed, it still reported zero: the compiler recognised the arithmetic series and replaced the whole loop with the closed-form formula. Using the result is not enough when the compiler can compute it algebraically. You need an input it cannot see and an output it cannot remove: a black box in Rust, a blackhole in the Java benchmark harness.

The timer itself. In CPython, reading the high-resolution clock costs about 39 nanoseconds. Anything you time within a factor of ten of that is mostly the timer.

And the wrong statistic. Thirty back-to-back runs of a half-millisecond merge sort on an idle desktop spread by about 2 percent. On a laptop that throttles, or a shared build runner, the spread is routinely 20 to 50 percent, and one context switch adds an outlier that moves the mean by a third. Report the minimum, the closest you get to the code's real cost, alongside the median, what you will typically see. For latency, use percentiles.

Finally, unrepresentative input. A first-element-pivot quicksort sorted 8,000 random elements in 3.6 milliseconds, and the same elements pre-sorted in 589. A benchmark on either input alone tells you nothing about the other.

When you report, give the machine and runtime version, the input size and shape, the warm-up and iteration count, the statistic, the comparison as a ratio, and a scaling check: what happened when you doubled n. The ratio and the scaling check survive a change of machine. Absolute times do not.

## Profile before you optimise

The third engineer rewrote a loop that was not the bottleneck. This is the most expensive mistake in performance work, and the defence is a rule: do not optimise anything you have not profiled.

Two kinds of profiler. Sampling profilers interrupt the program a few hundred times a second and record the stack: a few percent overhead, safe in production. Instrumenting profilers record every call: exact counts, but they can slow small Python functions by two to five times, distorting the very ratios you want to read.

Here is a profile read as a budget. A request handler takes 179 milliseconds in total. 120 are spent waiting on the database. 33 are in a quadratic de-duplication loop. 11 are serialising. Now apply Amdahl's law: if a part takes a fraction of the time, speeding it up can only remove that fraction.

Here is the question. If you make the quadratic loop infinitely fast, what is the best overall speed-up?

[pause]

About 1.22 times. The loop is 18 percent of the time, so removing it entirely leaves 82 percent. Halving the database time instead gives 1.5 times. The complexity fix is the most intellectually satisfying, and the least valuable of the two. The profile is the only thing that tells you so.

In a flame graph, width is time. Find the widest frame you own. Ask whether it is computing or waiting, because a wide frame blocked on a socket does not get faster with a better algorithm. Apply Amdahl. Only then change code, and re-profile to confirm the width moved.

## When this bites in production

A canary judged during warm-up. Every deploy of a JVM or Node service shows the canary 30 to 50 percent slower for its first minutes, and automated analysis rolls it back. The baseline has been optimised for days; the canary is still interpreting. Compare against a baseline deployed at the same time, or warm the canary with mirrored traffic first.

A ten-times-faster pull request that was not. The micro-benchmark's result was unused and the compiler deleted the work, or a tiny fixed input sat in cache while production data does not. Keep results alive, use production-shaped inputs, and report a scaling check.

The mean hid the tail. A new structure improves the average by 20 percent, and after deploy the 99th percentile doubles, because it allocates more and the benchmark never saw a garbage collection. Report percentiles from thousands of samples, with the collector on.

And a deoptimisation storm. A Node service's median latency rises from 2 to 10 milliseconds with no deploy, because a field started arriving as a string instead of a number and a hot site went polymorphic. Normalise types at the boundary.

## In the interview

A follow-up the lesson expects: you benchmarked both versions and yours is 3 times faster. How do you know the benchmark is right?

[pause]

Say what you controlled. You warmed up, looped enough that the timer is under 1 percent of each sample, kept the result alive, took the minimum and median of seven runs, used production-shaped input at production size, and checked that doubling n scales the way the complexity predicts. The wrong answer is "I ran it a few times and it was consistently faster", which answers none of the questions.

And: both approaches are n log n, which do you ship? The class does not decide, so look at memory access pattern, allocation per element and whether the working set fits in cache, then benchmark both at the real n and report the ratio with its conditions.

## Recap

Four things to remember. Constants vary by 10 to 500 times within a class, so complexity decides for growth and constants decide for small, bounded n. The crossover is real and runtime-specific: in CPython, insertion beats merge sort up to 64 to 128 elements, and a set beats a list scan from the first element. A benchmark needs warm-up, enough iterations, a result kept alive, representative input, and the minimum and median of many runs, with its conditions. And profile before optimising, then apply Amdahl's law to the widest frame.

At your desk: the crossover table, the harness code and the tools table, the dead-code timings and the profile, and the two exercises.
