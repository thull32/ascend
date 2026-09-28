---
slug: why-big-o
title: "The cost model: why we count operations and drop constants"
description: The RAM model behind every complexity claim, how to count the operations in a piece of code, why constants get dropped, and the concrete situations where that simplification misleads you.
minutes: 55
difficulty: intro
tags: [complexity, big-o, cost-model, ram-model, fundamentals]
problems: [contains-duplicate, two-sum]
---
Two engineers each write a function that checks whether a list of user IDs contains a duplicate. One loops over every pair. The other builds a set. On the ten-element list in the unit test both return in microseconds, and the pair version is competitive because it allocates nothing. On the production list of two million IDs the pair version has not finished after an hour and the set version took 200 milliseconds. Nothing about the small test told you which one to ship.

You cannot benchmark every function on every input size, so you need a way to predict cost from the code itself. That is what a cost model is: a deliberately simplified machine on which you can count steps by reading the source. Big-O is the notation for the answer; this lesson is about the model that produces it, what one "step" of that model costs on a real CPU (measured, not guessed), and the four places where the model is wrong enough to matter.

## A machine you can count on

The model almost everyone uses without naming it is the **RAM model** (random-access machine). It makes three assumptions:

1. **Every primitive operation costs one unit.** Arithmetic on a machine word, comparison, reading or writing one memory cell, following one pointer, calling or returning from a function: each is one step.
2. **Memory is one flat array with unit-cost access.** Reading address 7 costs the same as reading address 7 billion, and it costs the same whether you read it once or a million times.
3. **A word is big enough to hold any value you care about**, including an index into the input. Formally the word has $\Theta(\log n)$ bits, so adding two indices is one step, but adding two thousand-digit numbers is not.

None of these is literally true of the laptop you are reading on, and the second half of this lesson measures exactly how far off each one is. The point of the model is not accuracy; it is that under these rules you can look at a loop and *count*.

## Counting operations on real code

Take the simplest possible function.

```python
def total(nums):
    s = 0                 # 1 assignment
    for x in nums:        # n iterations: n reads, n loop tests
        s += x            # n additions, n assignments
    return s              # 1 return
```

Tally it: one assignment, then per iteration one read, one loop test, one addition, one store, then one return. With $n$ elements that is $1 + 4n + 1 = 4n + 2$ steps. Here is the same count as a ledger you can check by hand, on `nums = [3, 5, 8]`:

| Step | What runs | Units charged | Running total | `s` afterwards |
|---|---|---|---|---|
| 1 | `s = 0` | 1 | 1 | 0 |
| 2 | test loop, read `nums[0]` | 2 | 3 | 0 |
| 3 | `s += 3` (add, store) | 2 | 5 | 3 |
| 4 | test loop, read `nums[1]` | 2 | 7 | 3 |
| 5 | `s += 5` | 2 | 9 | 8 |
| 6 | test loop, read `nums[2]` | 2 | 11 | 8 |
| 7 | `s += 8` | 2 | 13 | 16 |
| 8 | test loop, exhausted | 1 | 14 | 16 |
| 9 | `return s` | 1 | 15 | 16 |

Fifteen units for $n = 3$; the formula $4n + 2$ gives 14 because it ignores the final failed loop test. Change the compiler and it might be $3n + 2$ or $6n + 5$; the exact coefficient depends on details you cannot see from source. What you *can* see from source is that the cost is a straight line in $n$.

Now the duplicate check from the opening.

```python
def has_duplicate_pairs(nums):
    n = len(nums)
    for i in range(n):
        for j in range(i + 1, n):
            if nums[i] == nums[j]:
                return True
    return False
```

Trace it on `[4, 9, 4, 7]`. The pairs are visited in the order $(0,1), (0,2), (0,3), (1,2), (1,3), (2,3)$:

| Comparison | `i` | `j` | `nums[i]` vs `nums[j]` | Result |
|---|---|---|---|---|
| 1 | 0 | 1 | 4 vs 9 | continue |
| 2 | 0 | 2 | 4 vs 4 | `return True` |

Two comparisons, because the duplicate sat near the front. On `[4, 9, 2, 7]` there is no duplicate, and all six pairs are compared before `return False`. That second case is the **worst case**, and it is the one complexity analysis reports by default, because it is the only one you can promise.

In general the inner statement runs once for every pair $(i, j)$ with $i < j$. For $i = 0$ it runs $n - 1$ times, for $i = 1$ it runs $n - 2$ times, and so on down to zero:

$$
(n-1) + (n-2) + \cdots + 1 + 0 = \frac{n(n-1)}{2} = \frac{n^2}{2} - \frac{n}{2}.
$$

Check it against the trace: $n = 4$ gives $4 \cdot 3 / 2 = 6$ pairs, which is what the worst case visited. Each execution of the inner body is a handful of unit operations (two reads, one comparison, one branch), so the total cost is roughly $c \cdot n^2/2$ for some small constant $c$.

The set version:

```python
def has_duplicate_set(nums):
    seen = set()
    for x in nums:
        if x in seen:         # hash + probe: ~1 step in the model
            return True
        seen.add(x)           # hash + insert: ~1 step in the model
    return False
```

One pass, two hash-table operations per element, each counted as a constant number of steps (that "constant" is a promise that the [hash table lesson](/learn/data-structures/hashing/hash-tables) examines closely). Total: about $c' \cdot n$.

Put concrete numbers on the two:

| $n$ | Pairs: $n(n-1)/2$ | Set: $2n$ |
|---|---|---|
| 10 | 45 | 20 |
| 1,000 | 499,500 | 2,000 |
| 100,000 | ~5 billion | 200,000 |
| 2,000,000 | ~2 × 10¹² | 4,000,000 |

At $n = 10$ the two are within a small factor of each other. At two million elements the ratio is half a million to one. No constant factor in any real implementation is anywhere near half a million, which is the entire argument for looking at growth rather than exact counts.

Watch the pair version do its work on a small input; the number of comparisons is the thing to notice.

```viz
{"type": "array", "algorithm": "bubble-sort", "values": [5, 3, 8, 1, 9, 2], "title": "Every pair gets compared", "caption": "Bubble sort is the same nested-pair loop shape as the duplicate check: the number of comparisons grows with n squared, not n."}
```

## Why the constants are dropped

Take the exact count $4n + 2$ for `total`. Two things about it are unreliable:

- **The 4 depends on the machine.** A compiler that keeps `s` in a register turns the store into nothing. A vectorising compiler adds eight elements per instruction. Python's interpreter turns each "unit" operation into dozens of real instructions. You cannot know the coefficient from the source, so any analysis that depends on it is guessing.
- **The +2 stops mattering immediately.** At $n = 100$ it is 0.5% of the total.

What *is* reliable is the shape: the cost is proportional to $n$. Big-O notation keeps exactly that and discards the rest. $4n + 2$ is $O(n)$; $n^2/2 - n/2$ is $O(n^2)$; $3n^2 + 500n + 10^6$ is still $O(n^2)$, because for large enough $n$ the $n^2$ term dominates the others no matter what their coefficients are.

"Large enough" is doing real work in that sentence. For $3n^2 + 500n$, the quadratic term only overtakes the linear one at $n \approx 167$. For a function that is genuinely $10n^2$ versus one that is $1000 n \log n$, the quadratic one is faster until $n$ is about 1,000. Dropping constants is a statement about the limit, and you are responsible for knowing whether your inputs are anywhere near it. The [next lesson](/learn/foundations/complexity/asymptotic-notation) makes this precise; the [benchmarking lesson](/learn/foundations/complexity/benchmarking-reality) shows what happens when it is ignored.

The reason engineers accept the simplification anyway is the table above. Growth classes differ by *factors that grow with $n$*, while constants are fixed. Any fixed constant, however ugly, is eventually beaten.

## Reading cost off code

A few rules cover most code you will ever analyse. Each one is the counting above, generalised.

**Sequential statements add.** Do an $O(n)$ pass, then an $O(n \log n)$ sort: total $O(n + n \log n) = O(n \log n)$. The larger term wins.

**Nested loops multiply.** An outer loop of $n$ iterations, each doing $m$ units of work, costs $O(nm)$. If the inner bound depends on the outer index (as in the pairs loop), sum the series; a triangular sum like $\sum_{i=0}^{n-1} i$ is $\Theta(n^2)$, and the general rule is that a loop from $0$ to $n$ whose body costs $i^k$ totals $\Theta(n^{k+1})$.

**A loop that halves its range runs $\log_2 n$ times.** Start at $n$, divide by 2 until you reach 1: that takes $\lfloor \log_2 n \rfloor + 1$ steps. Binary search, the height of a balanced tree, and the number of times a dynamic array doubles are all this shape.

```viz
{"type": "array", "algorithm": "binary-search", "values": [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], "target": 56, "title": "A halving loop", "caption": "Ten elements, at most four probes. A million elements would need at most twenty."}
```

**A function call costs whatever the callee costs**, and if you cannot see the callee you have to know it. `list.sort()` is $O(n \log n)$. `x in some_list` is $O(n)$; `x in some_set` is $O(1)$ on average. `some_list.insert(0, x)` is $O(n)$ because every element shifts right. `len()` is $O(1)$ because the length is stored. The single most common analysis mistake in interviews is calling something $O(n)$ that has an $O(n)$ operation hiding inside its loop body, which makes it $O(n^2)$.

```python
def dedupe_keep_order(items):
    out = []
    for x in items:
        if x not in out:      # O(len(out)) list scan inside an O(n) loop
            out.append(x)
    return out                # total: O(n^2)
```

Replacing `out` with a set for the membership test (keeping the list for order) makes it $O(n)$. Same shape, one hidden cost removed.

**Recursion is a loop you have to unroll.** A function that calls itself once on half the input does $\log n$ levels of work; one that calls itself twice on halves, with linear work at each level, does $O(n \log n)$; one that calls itself twice on $n - 1$ does $O(2^n)$. The [recurrences lesson](/learn/foundations/complexity/recurrences-and-master-theorem) gives you the general tool.

## Under the hood: what one "step" costs

The model says `s += x` is one step. Here is what CPython 3.14 actually executes for the body of `total`, from `dis.dis(total)`:

```text
L1: FOR_ITER                 11 (to L2)     ; advance the list iterator, or exit
    STORE_FAST                2 (x)         ; bind the element to x
    LOAD_FAST_BORROW_LOAD_FAST_BORROW 18 (s, x) ; push s and x (one superinstruction)
    BINARY_OP                13 (+=)        ; add; specialises to BINARY_OP_ADD_INT
    STORE_FAST                1 (s)         ; rebind s, decref the old value
    JUMP_BACKWARD            13 (to L1)
```

Six bytecodes per iteration, and each bytecode is a dispatch through the interpreter loop plus the work itself: `BINARY_OP_ADD_INT` checks both operands are exact ints, adds their digit arrays, and allocates a *new* int object for the result (ints are immutable, and only $-5$ to $256$ are cached). `STORE_FAST` decrements the reference count of the previous `s`, freeing it. Measured on one machine (AMD Ryzen 9 9950X3D, CPython 3.14.7, one million ints, best of seven runs), the loop costs **11.2 ns per element**. The built-in `sum(nums)`, a C loop over the same list, costs **2.4 ns per element**: it skips the six dispatches and adds directly. A C program compiled with `gcc -O2` summing a contiguous `int64_t` array costs **0.19 ns per element**, because the compiler vectorises the loop to add four or eight elements per instruction and the prefetcher keeps the array streaming in.

All three are $O(n)$. The constants are 11.2, 2.4 and 0.19: a 60× spread inside one growth class, on one machine, for one line of code. That is what "we drop the constant" is asking you to accept, and it is why the next lesson's "which class fits in a second" table is quoted to one significant figure.

The other assumption to price is unit-cost memory. On the same machine, a C loop that sums an array three different ways gives these per-element times (best of several runs; the exact figures are specific to this CPU's 32 KB L1, 1 MB L2 and 96 MB L3, but the shape is universal):

| Working set | Sequential scan | Random index (independent loads) | Pointer chase (dependent loads) |
|---|---|---|---|
| 32 KB (fits L1) | 0.18 ns | 0.19 ns | 0.9 ns |
| 512 KB (fits L2) | 0.18 ns | 0.21 ns | 2.5 ns |
| 32 MB (fits L3) | 0.20 ns | 2.3 ns | 22 ns |
| 512 MB (DRAM) | 0.19 ns | 4.0 ns | 100 ns |

Three things to read off this table. Sequential access is flat: the hardware prefetcher sees the pattern and has the next 64-byte cache line ready before you ask, so a 512 MB array streams as fast as a 32 KB one. Random access to *independent* addresses degrades to 4 ns, not 100, because an out-of-order core keeps a few dozen cache misses in flight at once and overlaps them. A *dependent* chain (read a pointer, then read where it points, as in a linked list or a tree of separately allocated nodes) cannot be overlapped, so every hop pays the full latency of wherever the data lives: about 1 ns from L1, 100 ns from DRAM. The model charges one unit for all three columns.

## Where the model lies

Everything above assumes the three RAM-model rules. Here is where each one breaks and what it costs you.

### Memory access is not unit cost

The table above is the evidence: a factor of about 500 between a sequential read (0.2 ns) and a dependent DRAM read (100 ns), both "one step". Code that walks memory sequentially gets almost every read from cache. Code that follows pointers to scattered addresses pays the miss on almost every hop.

The consequence: two algorithms that are both $O(n)$ can differ by 10–50× in wall-clock time based only on their memory access pattern. Summing a linked list of a million nodes scattered across a fragmented heap is routinely slower than summing an array of ten million. The [memory hierarchy lesson](/learn/foundations/complexity/space-complexity-and-memory-hierarchy) covers this properly; for now, remember that the model's "flat memory" is the assumption most likely to be wrong in a way you can measure.

### Words are not infinitely wide

The model lets you add two numbers in one step because it assumes they fit in a word. Python integers grow without bound, so the cost of `a + b` grows with the number of digits, and multiplication grows faster. Measured on the same machine:

| Operation | 10 digits | 1,000 digits | 10,000 digits | 100,000 digits |
|---|---|---|---|---|
| `a + b` | 50 ns | 120 ns | | 6,000 ns |
| `a * b` | | 4.5 µs | 180 µs | 6.4 ms |

Addition is linear in the digit count (the 100,000-digit add is 50× the 1,000-digit one). Multiplication goes up by about 40× for each 10× in digits, which is the signature of Karatsuba's $\Theta(d^{1.585})$ algorithm ($10^{1.585} \approx 38$), the one CPython switches to once an operand exceeds 70 of its internal 30-bit digits (about 600 decimal digits). Naive `fib(100000)` or a factorial loop is not $O(n)$ additions; it is $O(n)$ additions on numbers whose length grows with $n$, which is $O(n^2)$ digit operations.

Strings have the same problem. Hashing a key reads every byte: measured, 10 ns for an 8-character string, 160 ns for 1 KB, 110 µs for 1 MB. A hash map keyed by 1 KB strings does not do $O(1)$ lookups in any sense that matters; it does $O(L)$ lookups where $L$ is the key length, and a successful lookup then compares the full key as well. When keys are long, say so: "$O(n \cdot L)$ where $L$ is the average key length" is the senior version of "$O(n)$".

### Constants are sometimes the whole story

Real sort implementations (Python's Timsort, Rust's and C++'s pattern-defeating quicksort variants) switch to insertion sort, which is $O(n^2)$, for runs shorter than a few dozen elements. They do this because insertion sort's constant is so small that it beats merge or quick sort until $n$ is around 16–32. When $n$ is bounded and small, the constant factor *is* the cost, and the asymptotic answer is irrelevant.

Be careful which folklore you repeat, though. "A linear scan beats a hash lookup below ten elements" is true in compiled code, where a comparison is one cycle and a hash is twenty. Measured in CPython 3.14, `x in a_set` (about 13 ns) beats `x in a_list` already at $n = 3$ (23 ns), because every list comparison is itself a dynamic dispatch costing about 10 ns, so the hash's fixed overhead has nothing to beat. The crossover exists; where it sits depends on what one comparison costs in your runtime, and the only way to know is to measure at your $n$.

### Worst case is not always the case you have

The pairs-based duplicate check is $O(n^2)$ in the worst case, but if duplicates are common it returns after a few iterations, as the trace on `[4, 9, 4, 7]` showed. Quicksort is $O(n^2)$ in the worst case and $O(n \log n)$ on average, and with a randomised pivot the expected cost is $O(n \log n)$ on every input, because no fixed input can be bad for every pivot sequence. Hash tables are $O(n)$ per operation in the worst case and $O(1)$ on average. Saying which case you are analysing is part of the answer, and the [amortised analysis lesson](/learn/foundations/complexity/amortized-analysis) adds a third notion that is neither.

## Which cost model to reason in

The RAM model is one of several, and a senior engineer picks the one whose lie is smallest for the problem at hand.

| Model | What counts as one step | Predicts well | Misses | Reach for it when |
|---|---|---|---|---|
| RAM | any word operation or memory access | growth class, algorithm choice for unbounded $n$ | cache effects, word width, constants | choosing between algorithms in different classes |
| Word-RAM with explicit $w$ | operations on $w$-bit words; big numbers cost $\lceil \text{bits}/w \rceil$ | big-integer and long-key costs | cache effects | keys or numbers are longer than a word |
| External-memory (I/O) model | one transfer of a block of $B$ items between fast and slow memory | B-trees, external sorts, anything disk- or DRAM-bound | CPU work inside a block | the working set does not fit in the fast level |
| Cache-oblivious | as I/O model, but the algorithm does not know $B$ | recursive blocked algorithms across every cache level | constants, associativity | you want one code path to be cache-friendly everywhere |
| Measurement | wall-clock time on real hardware and data | the actual answer at your $n$ | why, and how it changes with $n$ | $n$ is bounded or two candidates are in the same class |

The mid-level habit is to use the first row for everything. The senior habit is to use the first row to eliminate the wrong class, the third row when data outgrows a cache or fits on disk, and the last row before shipping.

## Failure modes in production

**A hidden linear operation inside a loop.** *Symptom:* an endpoint that processes a batch is fine at 1,000 items and times out at 20,000; doubling the batch quadruples the latency. *Diagnosis:* a sampling profiler (`py-spy`, `perf`) shows the time inside `list.__contains__`, `list.insert` or string concatenation rather than in your logic; plotting latency against batch size on log-log axes gives a slope of 2. Measured in CPython, `insert(0, x)` 100,000 times costs 356 ms against 1 ms for `append`, and 10× the $n$ costs 100× the time. *Fix:* a set for membership, a `deque` or reversed append for front insertion, `"".join` for strings; then re-plot to confirm the slope is 1.

**The working set crosses a cache boundary.** *Symptom:* per-item throughput drops five to twenty times after the dataset grows, with no code change and the same complexity. *Diagnosis:* `perf stat -e cache-misses,instructions` shows misses per instruction jumping; a plot of per-item time against data size is a step function with steps near the L2 and L3 sizes. *Fix:* contiguous layout instead of one allocation per element, struct-of-arrays for hot fields, sorting or grouping input so that accesses become sequential, or processing in cache-sized batches.

**Long keys that make "O(1)" cost microseconds.** *Symptom:* a cache with a hit rate of 99% still spends 50 µs per lookup. *Diagnosis:* the key is the full request URL plus the serialised body (tens of kilobytes), so every lookup hashes and compares tens of kilobytes; the profiler shows the time in the hash function and in `memcmp`. *Fix:* hash the payload once into a fixed 16- or 32-byte digest and key the cache by the digest, or use a shorter surrogate key (an ID) when one exists.

**An adversary chooses the worst case.** *Symptom:* one tenant's requests take seconds while everyone else's take milliseconds; the profile shows very long probe chains in a hash table or a quicksort recursing $n$ deep. *Diagnosis:* the input was chosen (or happens) to be the worst case: thousands of keys with the same hash, or already-sorted data fed to a first-element-pivot quicksort. *Fix:* a keyed hash with a per-process random seed (CPython has randomised string hashing since 3.3; Rust's `HashMap` uses SipHash with random keys by default), a randomised or median-of-three pivot, and a per-tenant rate limit so that one client's worst case cannot become everyone's.

## Putting it to work

The discipline this lesson asks for is small: when you write or read a loop, know its shape. Here is the whole workflow on a fresh function.

```python
def common_elements(a, b):
    result = []
    for x in a:               # len(a) iterations
        if x in b:            # if b is a list: O(len(b)); if a set: O(1)
            result.append(x)  # amortised O(1)
    return result
```

If `b` is a list, this is $O(|a| \cdot |b|)$. If you convert `b` to a set first ($O(|b|)$), the loop becomes $O(|a|)$ and the total is $O(|a| + |b|)$. For two lists of 10,000 elements that is the difference between 100 million comparisons and 20,000 hash operations. The conversion costs memory ($O(|b|)$ extra) and, in a compiled language with very small `b`, may be slower. You should be able to say all of that in about fifteen seconds; that is the standard a senior interviewer holds you to.

Scale the same arithmetic up and it becomes a capacity argument. A service handling $10^5$ requests per second that does an $O(n^2)$ pass over a 1,000-item candidate list per request needs $10^6 \times 10^5 = 10^{11}$ inner-loop executions per second; at a few nanoseconds each that is hundreds of CPU cores doing nothing else. The same service with an $O(n)$ pass needs $10^8$ per second, well within one machine. At Netflix scale, where a personalisation call can look at thousands of candidates per member and the fleet serves hundreds of millions of members, the growth class of the per-request loop decides whether the feature is affordable at all, before anyone has profiled a line.

```exercise
id: count-inner-iterations
title: Count the iterations of a nested loop
prompt: |
  The function below runs `op()` some number of times that depends on `n`:

  ```python
  for i in range(n):
      for j in range(i + 1, n):
          op()
  ```

  Implement `inner_runs(n)` that returns exactly how many times `op()` is called, **without simulating the loops** (the tests include an `n` large enough that simulating would be too slow). Return an integer.
languages: [python, javascript]
entry: inner_runs
starter:
  python: |
    def inner_runs(n):
        # return the exact number of calls to op()
        return 0
  javascript: |
    function inner_runs(n) {
      // return the exact number of calls to op()
      return 0;
    }
tests:
  - args: [0]
    expected: 0
    label: empty range
  - args: [1]
    expected: 0
    label: single element has no pairs
  - args: [2]
    expected: 1
  - args: [4]
    expected: 6
  - args: [10]
    expected: 45
  - args: [1000]
    expected: 499500
    hidden: true
  - args: [20000000]
    expected: 199999990000000
    hidden: true
    label: too large to simulate
hints:
  - "For i = 0 the inner loop runs n - 1 times, for i = 1 it runs n - 2 times, and so on down to 0. Sum that series."
  - "The closed form is n(n - 1)/2; it fits in a JavaScript number for the tested n. Use integer division in Python (//) or Math.floor in JavaScript."
```

```exercise
id: has-duplicate-linear
title: Detect a duplicate in linear time
prompt: |
  Return `true` if any value appears more than once in `nums`, otherwise `false`.

  The pairs-based version is O(n²). Write one that is O(n) time; O(n) extra space is allowed. One of the hidden tests uses a list with 200,000 elements, which a quadratic solution will not finish in time.
languages: [python, javascript]
entry: has_duplicate
starter:
  python: |
    def has_duplicate(nums):
        # your code here
        return False
  javascript: |
    function has_duplicate(nums) {
      // your code here
      return false;
    }
tests:
  - args: [[1, 2, 3, 4]]
    expected: false
  - args: [[1, 2, 3, 1]]
    expected: true
  - args: [[]]
    expected: false
    label: empty input
  - args: [[7]]
    expected: false
    label: single element
  - args: [[-1, 0, -1]]
    expected: true
    label: negatives
  - args: [[3, 3]]
    expected: true
    hidden: true
hints:
  - "The inner loop of the pairs version answers one question: have I seen this value before? A set answers it in O(1)."
  - "Insert into the set after checking membership, and return as soon as you find a repeat."
```

## Interviewer follow-ups

**"You said this is O(n). What is the actual cost per element, roughly, and what does it depend on?"** *Model answer:* in CPython a simple loop body is about six bytecodes at roughly 2 ns each, so around 10 ns per element; the same loop in Go or Rust is 0.2–1 ns per element if the data is contiguous, and 20–100 ns per element if each step follows a pointer to a cache-cold node. So the per-element constant depends on the runtime and on the memory access pattern more than on the arithmetic. *Common wrong answer:* "it's O(n), so the constant doesn't matter": it matters by a factor of 50–500 within the class, which decides whether the feature fits in its latency budget.

**"Your solution hashes each record as a key. Is the lookup really O(1)?"** *Model answer:* it is $O(L)$ in the key length, because the hash reads every byte and a hit compares the whole key; independent of $n$, so still "constant" with respect to the input count, but a 2 KB key costs about 200× an 8-byte one. If keys are large, I hash once to a fixed-size digest and key by that. *Common wrong answer:* "yes, hashing is constant time", which hides the key length entirely.

**"Both candidates are O(n log n). How do you pick?"** *Model answer:* the class no longer decides, so I look at constants: memory access pattern (sequential beats pointer-chasing), allocation per element, and whether the data fits in cache; then I benchmark both at the real $n$ with representative data and report the minimum of several runs. *Common wrong answer:* picking the one with the "cleverer" algorithm, or the one with the smaller number of lines.

**"n is at most 8 here. Would you still use the hash set?"** *Model answer:* in Python yes, because a list scan pays a 10 ns dynamic comparison per element and the set's 13 ns lookup already wins at $n = 3$ on a modern machine; in Rust or Go a linear scan over 8 integers is a handful of cycles and usually beats hashing. I would say which runtime I am assuming and, if it mattered, measure. *Common wrong answer:* "a linear scan is always faster below ten elements", repeated as folklore without knowing which runtime it was measured in.

**"Why do we report the worst case rather than the typical case?"** *Model answer:* because the worst case is the only bound you can promise without knowing the input distribution, and in a multi-tenant system an adversary or an unlucky tenant will eventually supply the worst case; I report the worst case, then the average with the assumption it rests on (uniform hashing, random pivot). *Common wrong answer:* "because interviews expect it", which is true and not a reason.

## What mid-level engineers get wrong

- **Treating a library call as one step.** `x in list`, `list.insert(0, x)`, `s += piece`, `sorted(...)` inside a loop turns $O(n)$ into $O(n^2)$ or $O(n^2 \log n)$; the code passes review and fails at the first large batch.
- **Believing "O(1)" for a hash lookup with no thought for the key.** Long or slow-to-hash keys (nested tuples, long strings, objects with a Python-level `__hash__`) make each lookup cost microseconds; the growth class is fine and the endpoint is still slow.
- **Choosing a structure by its Big-O row and ignoring the memory layout.** A linked list "for O(1) insertion" that then gets traversed at 100 ns per hop, or a tree of individually allocated nodes where a sorted array would have served.
- **Quoting a crossover ("linear scan wins below ten") from a different runtime.** Constants are properties of the runtime and the hardware, not of the algorithm; the number has to be re-measured where it will be used.
- **Reporting the average case as though it were guaranteed.** Quicksort with a fixed pivot, a hash table with a non-randomised hash, a regex with nested quantifiers: each is fast on typical input and catastrophic on the input someone eventually sends.

## Senior signals

- You derive the cost of a loop nest by counting, and you can write the sum ($\sum_{i<n} (n - 1 - i) = n(n-1)/2$) rather than asserting "it's quadratic".
- You name the cost of every library call inside a loop (`in` on a list, `insert(0)`, `sort`, string concatenation) instead of treating the body as one step.
- You can put an order of magnitude on one "step" in your runtime (about 10 ns per simple Python loop iteration, under 1 ns in compiled code on contiguous data, about 100 ns per dependent DRAM access) and you say what those numbers depend on.
- You state which case you are analysing: worst, average, or amortised, and why that is the one that matters for this input distribution.
- You know the three RAM-model assumptions and can say which one your workload violates: cache misses for pointer-heavy structures, key length for hashing, tiny $n$ for constant factors.
- You refuse to call something "$O(1)$" when it is really $O(L)$ in the key length or $O(\text{digits})$ in the number size, and you say so before the interviewer asks.
- When two candidate approaches are in different growth classes, you choose the better class first and only then think about constants; when they are in the same class, you reach for a benchmark.

## Check yourself

```quiz
- q: >-
    A function does a single O(n) pass and then, inside a loop over all n elements, calls `list.insert(0, x)` on a list that grows to n elements. What is its overall time complexity?
  options: ["O(n)", "O(n²)", "O(2n)", "O(n log n)"]
  answer: 1
  explanation: >-
    insert(0, x) shifts every existing element, costing O(current length). Summed over n inserts that is 0 + 1 + ... + (n-1) = O(n²), which dominates the earlier O(n) pass. "O(2n)" is not a distinct class; constants are dropped.
- q: >-
    Two algorithms cost exactly 50n and n²/10 operations. For which input sizes is the "worse" quadratic one actually cheaper?
  options: ["Whenever n is below 500", "Whenever n is below 5", "Whenever n is above 500", "Never; linear always wins"]
  answer: 0
  explanation: >-
    Set n²/10 < 50n and solve: n < 500. Below that, the quadratic algorithm does fewer operations. Big-O describes the limit as n grows; it says nothing about which one wins at a specific small n, which is exactly why you check the constants when n is bounded.
- q: >-
    Summing a 512 MB array by random independent indices measured about 4 ns per element, while following a random pointer chain through the same array measured about 100 ns per hop. What explains the 25× gap?
  options: ["Index arithmetic is vectorised while pointer loads are scalar", "The pointer chain touches 25 times more cache lines per element", "The prefetcher predicts random indices but not pointer targets", "Independent misses overlap in flight; dependent loads serialise"]
  answer: 3
  explanation: >-
    An out-of-order core can keep dozens of cache misses outstanding at once when the addresses do not depend on each other, so their ~100 ns latencies overlap. In a pointer chain the next address is unknown until the current load returns, so each hop pays the full latency. Both patterns touch one line per element, and the prefetcher cannot predict either random pattern.
- q: >-
    You have a hash map keyed by strings that average 2 KB in length, with n entries. Which statement about lookup cost is the most honest?
  options: ["O(n), because long keys cause many more collisions", "O(1), because hashing is constant time for any key", "O(L) in key length, since hashing reads every byte", "O(log n), because long keys force a tree-based map"]
  answer: 2
  explanation: >-
    Hashing a 2 KB key touches every byte, and a successful lookup also compares the full key. That is O(L) per operation regardless of n. It is still independent of n, so it is not O(n); calling it O(1) hides a 200× factor relative to short keys.
- q: >-
    A colleague insists that a linear scan over a list is faster than a set lookup for fewer than ten elements, citing a C++ benchmark. In CPython the set wins already at three elements. Why does the crossover move?
  options: ["CPython sets skip hashing for lists shorter than ten elements", "Each list comparison in CPython is a dynamic dispatch costing about as much as a hash", "CPython lists store elements non-contiguously, so scans miss cache", "C++ hash tables are slower than CPython sets at small sizes"]
  answer: 1
  explanation: >-
    The crossover is where n comparisons cost the same as one hash plus one probe. In C++ a comparison is a cycle and a hash is around twenty, so the scan wins up to a dozen or so elements. In CPython each comparison is a ~10 ns dynamic call, about the cost of the whole set lookup, so the set wins almost immediately. CPython list elements are pointers in a contiguous array, and sets always hash.
- q: >-
    Computing fib(n) iteratively with two Python integers takes n additions. Why is calling the whole thing O(n) an understatement for large n?
  options: ["Python loop overhead adds a log n factor per iteration", "The interpreter re-parses the loop body on every iteration", "Each addition allocates a new object, which is O(n) in CPython", "The integers have Θ(n) digits, so each addition costs Θ(n)"]
  answer: 3
  explanation: >-
    fib(n) has about 0.21n decimal digits, so the RAM model's "one step per addition" assumption fails: the k-th addition costs Θ(k) digit operations, and the total is Θ(n²). Allocation of a new int is proportional to its length, not to n, and the interpreter compiles the body to bytecode once.
```
