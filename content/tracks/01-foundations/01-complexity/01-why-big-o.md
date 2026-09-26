---
slug: why-big-o
title: "The cost model: why we count operations and drop constants"
description: The RAM model behind every complexity claim, how to count the operations in a piece of code, why constants get dropped, and the concrete situations where that simplification misleads you.
minutes: 40
difficulty: intro
tags: [complexity, big-o, cost-model, ram-model, fundamentals]
problems: [contains-duplicate, two-sum]
---
Two engineers each write a function that checks whether a list of user IDs contains a duplicate. One loops over every pair. The other builds a set. On the ten-element list in the unit test both return in microseconds, and the pair version is actually faster because it allocates nothing. On the production list of two million IDs the pair version has not finished after an hour and the set version took 200 milliseconds. Nothing about the small test told you which one to ship.

You cannot benchmark every function on every input size, so you need a way to predict cost from the code itself. That is what a cost model is: a deliberately simplified machine on which you can count steps by reading the source. Big-O is the notation for the answer; this lesson is about the model that produces it, and about the places where the model is wrong enough to matter.

## A machine you can count on

The model almost everyone uses without naming it is the **RAM model** (random-access machine). It makes three assumptions:

1. **Every primitive operation costs one unit.** Arithmetic on a machine word, comparison, reading or writing one memory cell, following one pointer, calling or returning from a function: each is one step.
2. **Memory is one flat array with unit-cost access.** Reading address 7 costs the same as reading address 7 billion, and it costs the same whether you read it once or a million times.
3. **A word is big enough to hold any value you care about**, including an index into the input. Formally the word has $\Theta(\log n)$ bits, so adding two indices is one step, but adding two thousand-digit numbers is not.

None of these is literally true of the laptop you are reading on, and the last section of this lesson is about exactly how they fail. The point of the model is not accuracy; it is that under these rules you can look at a loop and *count*.

## Counting operations on real code

Take the simplest possible function.

```python
def total(nums):
    s = 0                 # 1 assignment
    for x in nums:        # n iterations: n reads, n loop tests
        s += x            # n additions, n assignments
    return s              # 1 return
```

Tally it: one assignment, then per iteration one read, one loop test, one addition, one store, then one return. With $n$ elements that is $1 + 4n + 1 = 4n + 2$ steps. Change the compiler and it might be $3n + 2$ or $6n + 5$; the exact coefficient depends on details you cannot see from source. What you *can* see from source is that the cost is a straight line in $n$.

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

The inner statement runs once for every pair $(i, j)$ with $i < j$. For $i = 0$ it runs $n - 1$ times, for $i = 1$ it runs $n - 2$ times, and so on down to zero:

$$
(n-1) + (n-2) + \cdots + 1 + 0 = \frac{n(n-1)}{2} = \frac{n^2}{2} - \frac{n}{2}.
$$

Each execution of the inner body is a handful of unit operations (two reads, one comparison, one branch), so the total cost in the worst case (no duplicate, every pair checked) is roughly $c \cdot n^2/2$ for some small constant $c$. The early `return True` only helps on inputs that *do* contain a duplicate, and complexity analysis is usually about the worst case, so we ignore it for now.

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

At $n = 10$ the two are within a small factor of each other and the set version's overhead (allocating the set, hashing) can make it slower in practice. At two million elements the ratio is half a million to one. No constant factor in any real implementation is anywhere near half a million, which is the entire argument for looking at growth rather than exact counts.

Watch the pair version do its work on a small input; the number of comparisons is the thing to notice.

```viz
{"type": "array", "algorithm": "bubble-sort", "values": [5, 3, 8, 1, 9, 2], "title": "Every pair gets compared", "caption": "Bubble sort is the same nested-pair loop shape as the duplicate check: the number of comparisons grows with n squared, not n."}
```

## Why the constants are dropped

Take the exact count $4n + 2$ for `total`. Two things about it are unreliable:

- **The 4 depends on the machine.** A compiler that keeps `s` in a register turns the store into nothing. A CPU with fused multiply-add turns two operations into one. Python's interpreter turns each "unit" operation into dozens of real instructions. You cannot know the coefficient from the source, so any analysis that depends on it is guessing.
- **The +2 stops mattering immediately.** At $n = 100$ it is 0.5% of the total.

What *is* reliable is the shape: the cost is proportional to $n$. Big-O notation keeps exactly that and discards the rest. $4n + 2$ is $O(n)$; $n^2/2 - n/2$ is $O(n^2)$; $3n^2 + 500n + 10^6$ is still $O(n^2)$, because for large enough $n$ the $n^2$ term dominates the others no matter what their coefficients are.

"Large enough" is doing real work in that sentence. For $3n^2 + 500n$, the quadratic term only overtakes the linear one at $n \approx 167$. For a function that is genuinely $10n^2$ versus one that is $1000 n \log n$, the quadratic one is faster until $n$ is about 1,000. Dropping constants is a statement about the limit, and you are responsible for knowing whether your inputs are anywhere near it. The [next lesson](/learn/foundations/complexity/asymptotic-notation) makes this precise; the [benchmarking lesson](/learn/foundations/complexity/benchmarking-reality) shows what happens when it is ignored.

The reason engineers accept the simplification anyway is the table above. Growth classes differ by *factors that grow with $n$*, while constants are fixed. Any fixed constant, however ugly, is eventually beaten.

## Reading cost off code

A few rules cover most code you will ever analyse. Each one is just the counting above, generalised.

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

## Where the model lies

Everything above assumes the three RAM-model rules. Here is where each one breaks and what it costs you.

### Memory access is not unit cost

A read that hits the L1 cache takes about a nanosecond. A read that misses every cache and goes to main memory takes about 100 nanoseconds. That is a factor of 100 inside what the model calls "one step". Code that walks memory sequentially (an array scan) gets almost every read from cache because the hardware prefetches the next line. Code that follows pointers to scattered addresses (a linked list, a tree of individually allocated nodes) pays the miss on almost every hop.

The consequence: two algorithms that are both $O(n)$ can differ by 10–50× in wall-clock time based only on their memory access pattern. Summing a linked list of a million integers is routinely slower than summing an array of ten million. The [memory hierarchy lesson](/learn/foundations/complexity/space-complexity-and-memory-hierarchy) covers this properly; for now, remember that the model's "flat memory" is the assumption most likely to be wrong in a way you can measure.

### Words are not infinitely wide

The model lets you add two numbers in one step because it assumes they fit in a word. Python integers grow without bound, so adding two 10,000-digit numbers costs about 10,000 steps, and multiplying them costs far more. Hashing a string costs time proportional to its length, so a hash map keyed by 1 KB strings does not do $O(1)$ lookups in any sense that matters; it does $O(L)$ lookups where $L$ is the key length. When keys are long, say so: "$O(n \cdot L)$ where $L$ is the average key length" is the senior version of "$O(n)$".

### Constants are sometimes the whole story

Real sort implementations (Python's Timsort, Rust's and C++'s pattern-defeating quicksort variants) switch to insertion sort, which is $O(n^2)$, for runs shorter than a few dozen elements. They do this because insertion sort's constant is so small that it beats merge or quick sort until $n$ is around 16–32. Real hash maps are often slower than a linear scan of an array with fewer than about ten entries, for the same reason: hashing costs more than a few comparisons. When $n$ is bounded and small, the constant factor *is* the cost, and the asymptotic answer is irrelevant.

### Worst case is not always the case you have

The pairs-based duplicate check is $O(n^2)$ in the worst case, but if duplicates are common it returns after a few iterations. Quicksort is $O(n^2)$ in the worst case and $O(n \log n)$ on average, and the average is what you get in practice with a randomised pivot. Hash tables are $O(n)$ per operation in the worst case and $O(1)$ on average. Saying which case you are analysing is part of the answer, and the [amortised analysis lesson](/learn/foundations/complexity/amortized-analysis) adds a third notion that is neither.

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

If `b` is a list, this is $O(|a| \cdot |b|)$. If you convert `b` to a set first ($O(|b|)$), the loop becomes $O(|a|)$ and the total is $O(|a| + |b|)$. For two lists of 10,000 elements that is the difference between 100 million comparisons and 20,000 hash operations. The conversion costs memory ($O(|b|)$ extra) and, for very small `b`, may be slower. You should be able to say all of that in about fifteen seconds; that is the standard a senior interviewer holds you to.

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

## Senior signals

- You derive the cost of a loop nest by counting, and you can write the sum ($\sum_{i<n} (n - 1 - i) = n(n-1)/2$) rather than asserting "it's quadratic".
- You name the cost of every library call inside a loop (`in` on a list, `insert(0)`, `sort`, string concatenation) instead of treating the body as one step.
- You state which case you are analysing: worst, average, or amortised, and why that is the one that matters for this input distribution.
- You know the three RAM-model assumptions and can say which one your workload violates: cache misses for pointer-heavy structures, key length for hashing, tiny $n$ for constant factors.
- You refuse to call something "$O(1)$" when it is really $O(L)$ in the key length or $O(\text{digits})$ in the number size, and you say so before the interviewer asks.
- When two candidate approaches are in different growth classes, you choose the better class first and only then think about constants; when they are in the same class, you reach for a benchmark.

## Check yourself

```quiz
- q: >-
    A function does a single O(n) pass and then, inside a loop over all n elements, calls `list.insert(0, x)` on a list that grows to n elements. What is its overall time complexity?
  options: ["O(n)", "O(n log n)", "O(n²)", "O(2n)"]
  answer: 2
  explanation: >-
    insert(0, x) shifts every existing element, costing O(current length). Summed over n inserts that is 0 + 1 + ... + (n-1) = O(n²), which dominates the earlier O(n) pass. "O(2n)" is not a distinct class; constants are dropped.
- q: >-
    Two algorithms cost exactly 50n and n²/10 operations. For which input sizes is the "worse" quadratic one actually cheaper?
  options: ["Never; O(n) always beats O(n²)", "For n below 500", "For n below 5", "For n above 500"]
  answer: 1
  explanation: >-
    Set n²/10 < 50n and solve: n < 500. Below that, the quadratic algorithm does fewer operations. Big-O describes the limit as n grows; it says nothing about which one wins at a specific small n, which is exactly why you check the constants when n is bounded.
- q: >-
    Under the RAM model, which of these costs is most likely to be badly underestimated on real hardware?
  options: ["Comparing two integers", "Following a pointer to a node allocated far away in memory", "Adding two 32-bit integers", "Reading the next element of an array you are scanning"]
  answer: 1
  explanation: >-
    The model charges one unit for any memory access. A scattered pointer dereference misses cache and costs ~100 ns versus ~1 ns for a cached sequential read. The array scan benefits from prefetching, and the arithmetic operations really are about one step each.
- q: >-
    You have a hash map keyed by strings that average 2 KB in length, with n entries. Which statement about lookup cost is the most honest?
  options: ["O(1), because it is a hash map", "O(n), because the strings are long", "O(L) where L is the key length, because hashing and comparing a key costs time proportional to its size", "O(log n), because long keys force a tree"]
  answer: 2
  explanation: >-
    Hashing a 2 KB key touches every byte, and a successful lookup also compares the full key. That is O(L) per operation regardless of n. It is still independent of n, so it is not O(n); calling it O(1) hides a 2,000× factor relative to short keys.
- q: >-
    A production sort routine switches to insertion sort (O(n²)) for slices shorter than about 20 elements. Why is this not a bug?
  options: ["For tiny n, insertion sort's small constant factor makes it faster than merge or quick sort despite the worse growth class", "Insertion sort is O(n log n) for small inputs", "It reduces memory usage from O(n) to O(1), which matters more than time", "Small slices are always already sorted"]
  answer: 0
  explanation: >-
    Asymptotic classes only decide the winner for large n. Below a crossover point (empirically around 16–32 elements) the recursive overhead of merge/quick sort exceeds the cost of insertion sort's few dozen comparisons. Its growth class does not change with n, and small slices are not assumed sorted.
```
