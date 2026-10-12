---
lesson: benchmarking-reality
source: c11ffae1bdec37da
---
## 1

In Rust, you replace a linear scan over a 12-element list of small integers with a hash set lookup, and the code gets slower. What is the most likely explanation?

A, hashing costs more than a dozen cached comparisons. B, hash sets degrade to order n for small integer keys. C, the set was built with the wrong load factor for 12 keys. D, Rust vectors are always faster than sets for integer data.

[think]

The answer is A: hashing costs more than a dozen cached comparisons.

At 12 elements in compiled code, the scan is a handful of comparisons that sit in one or two cache lines and predict perfectly. The set lookup pays for hashing, a modulo, a probe and a key comparison: still constant time, only with a bigger constant. In CPython the answer would differ, because each list comparison is a dynamic dispatch and the set wins almost at once. The crossover belongs to the runtime.

## 2

A Node benchmark reports that the first call of a function took 3.1 milliseconds, and later calls take 0.47 milliseconds. Which number should you report as the function's cost?

A, the mean of all runs, so both regimes are represented. B, 3.1 milliseconds, because the worst case is the honest number. C, 0.47 milliseconds: the first run was interpreted, then compiled. D, neither: a 6 times gap means the function is broken.

[think]

The answer is C: 0.47 milliseconds, because the first run was interpreted, then compiled.

V8 runs new code in its interpreter, then compiles hot functions with Maglev and TurboFan. The first-run time is a warm-up artefact, interpreter plus compilation plus cold caches, not the code's steady-state cost. The mean is skewed by that one outlier: report the minimum or the median after warm-up, and note the cold-start cost separately if it matters for your use.

## 3

A request spends 120 milliseconds in a database call, 11 in serialisation, and 33 in a quadratic loop that you can make linear. By Amdahl's law, what is the maximum overall speed-up from fixing the loop?

A, about 20 times, as the loop was the only quadratic code. B, about 1.2 times, since the loop is under a fifth of the time. C, it depends on n, since the loop's cost grows as n squared. D, about 2 times, because quadratic to linear is a big win.

[think]

The answer is B: about 1.2 times, since the loop is under a fifth of the time.

The loop is 33 of 164 milliseconds, about 20 percent. Even if it became infinitely fast, the total would drop to 131 milliseconds: about a 1.25 times improvement, whatever n is today. The database call is where the time is. Profile first, then apply Amdahl's law to decide what is worth optimising.

## 4

A C benchmark of a loop that sums the integers below N reports zero milliseconds when compiled with optimisation, even though the sum is printed afterwards. What happened?

A, the processor ran the loop in parallel across its cores. B, printing the result happens before the loop finishes. C, the clock's resolution is too coarse to see a fast loop. D, the compiler replaced the loop with the closed-form formula, N times N minus 1, over 2.

[think]

The answer is D: the compiler replaced the loop with the closed-form formula.

Using the result is not enough when the compiler can compute it algebraically. Gcc recognises the arithmetic series and emits a multiplication. Only an input the compiler cannot see, read at run time, and an output it cannot remove, a volatile store or a black-box sink, force the loop to run. The clock resolves nanoseconds, and compilers do not spread a loop across cores at that setting.

## 5

In the middle of an integer benchmark, you call a JIT-compiled JavaScript function once with an array of strings. What does the timing show afterwards?

A, a speed-up, because the JIT now has more type information. B, no change: each call is compiled fresh for its argument types. C, a one-off slow call, after which it returns to full speed. D, a permanent slowdown, since the add site is now polymorphic.

[think]

The answer is D: a permanent slowdown, since the add site is now polymorphic.

The measured sequence was 0.47 milliseconds per call, then 11 milliseconds for the deoptimise-and-recompile, then 2.35 milliseconds for every call after. The site's feedback now includes strings, so the recompiled code keeps the generic path and runs 5 times slower for the life of the process. Feedback is per site, not per call, and more types means less specialisation, not more.

## 6

Which single practice most improves the honesty of a reported micro-benchmark result?

A, running the benchmark on the fastest machine available. B, using the mean of exactly ten runs, for statistical validity. C, timing a single call, so that warm-up effects are included. D, reporting the minimum and median of many runs, with their conditions.

[think]

The answer is D: reporting the minimum and median of many runs, with their conditions.

The minimum approximates the code's cost with the noise stripped out, and the median approximates what you will see. The conditions, meaning machine, runtime version, input, warm-up, iteration count and a scaling check, let someone reproduce or refute it. A fast machine changes the absolute numbers but not the ratios, the mean of ten runs is moved by a single outlier, and a single cold call measures the runtime's warm-up, not the code.
