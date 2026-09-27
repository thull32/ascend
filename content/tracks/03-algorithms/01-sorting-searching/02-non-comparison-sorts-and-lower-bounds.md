---
slug: non-comparison-sorts-and-lower-bounds
title: "Beating n log n: counting, radix, bucket, and the lower bound"
description: Why no comparison sort can beat n log n, how counting and radix sort sidestep the proof, and what Timsort and pdqsort do inside your language's sort().
minutes: 35
difficulty: medium
tags: [sorting, counting-sort, radix-sort, bucket-sort, lower-bound, timsort, pdqsort]
problems: [sort-colors, top-k-frequent]
---
You are told that sorting is $\Theta(n \log n)$ and then, in the same breath, that counting sort is $O(n)$. Both are true, and the gap between them is one of the few places in an interview where you can show you understand a *proof* rather than a fact. The lower bound applies to algorithms that learn about the input only by comparing elements. Counting sort does not compare; it uses the values as array indices, which is a different and much stronger kind of information.

This lesson has two halves. First, the sorts that exploit structure in the keys: counting, radix and bucket. Second, the decision-tree argument that shows why nothing comparison-based can do better than $n \log n$, and what the sort functions in Python, JavaScript, Java, Go and Rust actually do with that knowledge.

## Counting sort

If every key is an integer in `0..k`, you do not need to compare anything. Count how many times each key occurs, then walk the counts in order and write the keys out.

```viz
{"type": "array", "algorithm": "counting-sort", "values": [4, 2, 2, 8, 3, 3, 1], "title": "Counting sort", "caption": "Histogram the keys, turn counts into starting positions, then place each element."}
```

The version that only sorts bare integers is three lines; the version that sorts *records* by an integer key, stably, is the one worth knowing.

```python
def counting_sort(items, key, k):
    counts = [0] * (k + 1)
    for x in items:
        counts[key(x)] += 1
    # counts[v] becomes the index where the first element with key v goes
    start = 0
    for v in range(k + 1):
        counts[v], start = start, start + counts[v]
    out = [None] * len(items)
    for x in items:                 # forward pass: stable
        out[counts[key(x)]] = x
        counts[key(x)] += 1
    return out
```

Trace on `[4, 2, 2, 8, 3, 3, 1]` with `k = 8`:

| step | array |
|---|---|
| counts | `[0, 1, 2, 2, 1, 0, 0, 0, 1]` (index = key) |
| starting positions | `[0, 0, 1, 3, 5, 6, 6, 6, 6]` |
| place 4 at pos 5, 2 at 1, 2 at 2, 8 at 6, 3 at 3, 3 at 4, 1 at 0 | `[1, 2, 2, 3, 3, 4, 8]` |

Two things to notice. The output is stable because equal keys are placed in input order (each placement bumps the start position for that key). And the cost is $O(n + k)$: `n` to histogram and place, `k` to convert counts to positions. If `k` is a million and `n` is ten, that is a bad trade; counting sort wants `k = O(n)`.

The typical interview appearance is disguised: "sort characters of a lowercase string" (`k = 26`), "sort colours" (`k = 3`, though [Sort Colors](/practice/sort-colors) wants a single pass, which is the Dutch national flag), or "sort by frequency" where the frequencies are bounded by `n`.

## Radix sort

If keys are wider than a small range, say 32-bit integers, `k = 4 billion` kills counting sort. Radix sort fixes that by counting-sorting on one **digit** at a time, from least significant to most (LSD), relying on the stability of each pass to keep earlier digits in order.

Base-10 trace on `[170, 45, 75, 90, 802, 24, 2, 66]`:

| pass | digit | result |
|---|---|---|
| 1 | ones | `[170, 90, 802, 2, 24, 45, 75, 66]` |
| 2 | tens | `[802, 2, 24, 45, 66, 170, 75, 90]` |
| 3 | hundreds | `[2, 24, 45, 66, 75, 90, 170, 802]` |

After pass 2, `45` precedes `66` because 4 < 6, and `802` precedes `2` because both have a zero tens digit and 802 came first *from the previous pass* (stability). Break stability and the whole thing falls apart.

```python
def radix_sort(nums, base=10):
    if not nums:
        return nums
    biggest = max(nums)
    exp = 1
    while biggest // exp > 0:               # terminates: exp grows past biggest
        buckets = [[] for _ in range(base)]
        for x in nums:
            buckets[(x // exp) % base].append(x)
        nums = [x for b in buckets for x in b]
        exp *= base
    return nums
```

With `d` digits in base `b`, the cost is $O(d \cdot (n + b))$. For 32-bit keys and a base of 256 (one byte per pass), that is 4 passes of `n + 256`, which is linear with a constant of about 4 (plus the same again for the copy). Compare that with `log₂ n ≈ 20` passes worth of work for a comparison sort at `n = 10⁶`. Radix sort genuinely wins on large arrays of fixed-width keys, which is why GPU sorting libraries and database sort operators use it, and why sorting floats can be done by radix sorting their bit patterns after a sign fix-up.

Why does everyone not use it? Three reasons: it needs keys that decompose into digits (integers, fixed-length strings, floats with a trick; not arbitrary comparators), it needs $O(n + b)$ scratch memory, and each pass makes a full read and write of the data, so for small `n` or narrow keys the comparison sort's cache-friendly inner loop wins. MSD radix (most significant digit first, recursing into buckets) handles variable-length strings and is the basis of burstsort, but it is a niche tool.

## Bucket sort

If the keys are real numbers spread roughly uniformly over a range, drop each into one of `n` buckets by scaling (`bucket = floor(x * n)` for `x` in `[0, 1)`), sort each bucket with insertion sort, and concatenate. Under the uniformity assumption each bucket holds $O(1)$ elements on average and the total is $O(n)$ expected.

The word doing the work is *uniform*. Feed bucket sort a heavily skewed distribution and one bucket receives most of the elements, at which point you are running insertion sort on almost everything and the cost is $O(n^2)$. Bucket sort is an algorithm for when you *know* your data's distribution. The interview form is "the values are between 0 and 1, uniformly random", and the senior answer includes the sentence "if they are not uniform, this degrades, so I would check that or fall back to a comparison sort".

## The lower bound: why n log n is the floor

Take any algorithm that sorts by comparing elements. Model its behaviour on an input of `n` distinct elements as a binary **decision tree**: each internal node is a comparison `a[i] < a[j]?`, the two children are what the algorithm does next depending on the answer, and each leaf is a final output permutation.

Three facts, and the theorem falls out:

1. There are `n!` possible input orders, and a correct algorithm must be able to produce a different output permutation for each, so the tree needs at least `n!` leaves.
2. A binary tree of height `h` has at most `2^h` leaves.
3. Therefore `2^h ≥ n!`, so `h ≥ log₂(n!)`.

The height of the tree is the number of comparisons on the worst-case input. Stirling's approximation gives `log₂(n!) ≈ n log₂ n − 1.44n`, which is $\Omega(n \log n)$. Any comparison sort makes at least that many comparisons on some input.

Make it concrete for `n = 8`: `8! = 40,320` and `log₂ 40,320 ≈ 15.3`, so *every* comparison sort needs at least 16 comparisons on some 8-element input. Merge sort on 8 elements does at most 17. Insertion sort in the worst case does 28. The bound is tight up to a constant, and merge sort is close to it.

The argument is also a lower bound on *average* comparisons, not just worst case, because a binary tree with `n!` leaves has average leaf depth at least `log₂(n!)` as well. So randomisation does not help either; quicksort's expected `1.39 n log₂ n` is about as good as it gets.

Counting sort escapes because a single operation `counts[x] += 1` learns the exact value of `x`, which is `log₂ k` bits of information, where a comparison learns one bit. That is the whole trick: a richer model of what one step can do. Whenever an interviewer asks "can you do better than n log n?", the answer is "not with comparisons; if the keys have bounded structure, yes, and here is how".

## What your language's sort() actually does

Nobody ships textbook quicksort or merge sort. The two designs that dominate are Timsort and pattern-defeating quicksort, and knowing which one you are calling tells you its behaviour on your data.

### Timsort

Timsort, written by Tim Peters for Python in 2002, is a merge sort that refuses to do work the input has already done. It scans for **runs**, stretches that are already ascending or strictly descending (which it reverses in place), extends short runs to a minimum length (32–64) with insertion sort, then merges runs with a merge that:

- keeps a stack of pending runs and merges only when run lengths violate invariants that keep the merge tree balanced (this is what bounds it at $O(n \log n)$);
- uses a temporary buffer of only `min(len(run1), len(run2))` elements;
- **gallops**: when one run keeps winning the comparison, it switches to binary search to find how many elements of that run go before the next element of the other, copying them in a block instead of one at a time.

On sorted input Timsort finds one run and does `n − 1` comparisons. On input made of a few sorted pieces (two sorted files concatenated; a table with a batch appended) it is nearly linear too. On random input it is an ordinary merge sort. It is stable, which is why Python, Java (for objects) and V8 chose it.

The stack invariants had a real bug: in 2015 formal verification found that the original invariant check could let the run stack overflow on adversarial inputs of a size Python could never allocate but Java could. Both fixed it, and CPython's merge policy was later replaced with **powersort**, which decides merge order from run lengths more optimally. The lesson to take from that is not the details; it is that even a twenty-year-old library sort can hide a bug that only a proof finds.

### Pattern-defeating quicksort (pdqsort)

pdqsort, by Orson Peters, is the modern unstable sort. It is introsort (quicksort with median-of-three or ninther pivots, heap sort fallback on excessive depth, insertion sort on small ranges) with three additions:

- If the partition step finds the range is already partitioned in order, it checks whether the range is sorted and returns in $O(n)$; that gives linear time on sorted, reversed and all-equal inputs.
- When many keys equal the pivot, it partitions so that equal elements are excluded from recursion, giving $O(n \log k)$ for `k` distinct keys.
- When a partition is badly unbalanced, it **breaks the pattern** by swapping a few elements at deterministic positions before retrying, so the inputs that fool median-of-three are shuffled out of their shape. It also uses a branchless block partition (from BlockQuicksort) that avoids mispredicted branches in the inner loop, which is a large part of its speed.

### The table

| Language | Stable sort | Unstable sort | Notes |
|---|---|---|---|
| Python `list.sort` | Timsort (powersort merge policy in recent versions) | — | Only one sort; always stable |
| JavaScript (V8) `Array.prototype.sort` | Timsort | — | Stable since ES2019; earlier V8 used quicksort above 10 elements and was unstable |
| Java `Arrays.sort` | Timsort for objects | Dual-pivot quicksort for primitives | Primitives have no identity, so instability is unobservable |
| Go `sort.Stable` / `slices.SortStableFunc` | Insertion + symmerge (in-place merge) | pdqsort (`sort.Slice`, `slices.Sort`) | pdqsort arrived in Go 1.19 |
| Rust `slice::sort` / `sort_unstable` | Merge sort family (driftsort in recent versions) | pdqsort family (ipnsort in recent versions) | Both rewritten in 2024 for speed; the API contract did not change |
| C++ `std::sort` / `std::stable_sort` | Merge sort with a buffer | Introsort (pdqsort in some implementations) | `std::sort` is unstable and says so |

The practical takeaways: if you sort by a key and need ties preserved, use the stable one. If you sort primitives or do not care about ties, the unstable one is typically 20–50% faster because it does not allocate. And if your input is mostly sorted already, Timsort will be close to linear and pdqsort will be fully linear, so "sorting is n log n" is not the right mental model for the cost of `sort()` on real data, which is very often nearly sorted.

## Exercises

```exercise
id: stable-counting-sort
title: Counting sort with a bounded key
prompt: |
  Sort `nums`, a list of integers each in the range `0..k` inclusive,
  using counting sort. Do not use the built-in sort or any comparison
  between elements. Return a new sorted list.

  Use the position-based version from the lesson (count, then prefix
  sums into start positions, then a forward placement pass) so that the
  same code would be stable for records.
languages: [python, javascript]
entry: counting_sort
starter:
  python: |
    def counting_sort(nums, k):
        # your code here
        return nums
  javascript: |
    function counting_sort(nums, k) {
      // your code here
      return nums;
    }
tests:
  - args: [[4, 2, 2, 8, 3, 3, 1], 8]
    expected: [1, 2, 2, 3, 3, 4, 8]
  - args: [[], 5]
    expected: []
    label: empty input
  - args: [[0, 0, 0], 0]
    expected: [0, 0, 0]
    label: k is zero
  - args: [[5], 5]
    expected: [5]
  - args: [[3, 0, 3, 1, 2, 1], 3]
    expected: [0, 1, 1, 2, 3, 3]
    hidden: true
  - args: [[9, 1, 9, 0], 9]
    expected: [0, 1, 9, 9]
    hidden: true
hints:
  - "Allocate counts of length k + 1 and histogram the values."
  - "Convert counts into starting positions with a running total, then place each element at its key's position and increment that position."
```

```exercise
id: lsd-radix-sort
title: LSD radix sort for non-negative integers
prompt: |
  Sort `nums`, a list of non-negative integers, with least-significant-
  digit radix sort in base 10. Each pass must be a stable distribution
  into ten buckets (or a stable counting sort on that digit). Do not use
  the built-in sort. Return a new sorted list.
languages: [python, javascript]
entry: radix_sort
starter:
  python: |
    def radix_sort(nums):
        # your code here
        return nums
  javascript: |
    function radix_sort(nums) {
      // your code here
      return nums;
    }
tests:
  - args: [[170, 45, 75, 90, 802, 24, 2, 66]]
    expected: [2, 24, 45, 66, 75, 90, 170, 802]
  - args: [[]]
    expected: []
    label: empty input
  - args: [[0]]
    expected: [0]
  - args: [[1000, 1, 10, 100]]
    expected: [1, 10, 100, 1000]
    label: different digit counts
  - args: [[7, 7, 3, 7]]
    expected: [3, 7, 7, 7]
    hidden: true
  - args: [[123456, 65432, 1, 0]]
    expected: [0, 1, 65432, 123456]
    hidden: true
hints:
  - "Loop while max(nums) // exp > 0, with exp = 1, 10, 100, ...; guard the empty list before calling max."
  - "The digit for the current pass is (x // exp) % 10; append x to that bucket, then flatten the buckets in order."
```

## Senior signals

- You state the lower bound as a **decision-tree** argument (`n!` leaves, height `≥ log₂ n!`) and can say it applies to average case and randomised algorithms too.
- You know counting sort escapes it by using **values as indices**, and that it only pays off when `k = O(n)`.
- You explain LSD radix sort's dependence on **stability** and give its cost as `d(n + b)`, then say when it beats comparison sorting (large `n`, fixed-width keys) and when it does not.
- You name what your language's `sort()` does (Timsort, pdqsort, dual-pivot quicksort) and predict its behaviour on **nearly-sorted** input.
- You know bucket sort's $O(n)$ is conditional on a **uniform distribution** and say what happens otherwise.
- You choose the stable or unstable variant deliberately and can explain the performance gap between them.

## Check yourself

```quiz
- q: >-
    Why can counting sort run in O(n + k) when the comparison lower bound says sorting needs Ω(n log n)?
  options: ["Indexing by key value learns log k bits per step", "It relies on the input already being nearly sorted", "Spending O(k) extra memory lets it beat the bound", "The bound applies only to recursive comparison sorts"]
  answer: 0
  explanation: >-
    The decision-tree bound assumes each step is a two-outcome comparison, which learns one bit. Using the key's value as an array index is a many-outcome operation that learns log k bits, so the model, and the bound, do not apply. Extra memory alone does not escape the bound: merge sort uses O(n) extra memory and is still Ω(n log n). Counting sort works on any input order.
- q: >-
    In LSD radix sort, what goes wrong if a single digit pass is not stable?
  options: ["Nothing, since the last pass fixes earlier mistakes", "Only negative numbers end up in the wrong order", "Ties on this digit lose the order from earlier passes", "The output is still sorted, but the time becomes O(n²)"]
  answer: 2
  explanation: >-
    Each pass relies on the previous passes' order surviving among elements that tie on the current digit. An unstable pass reorders those ties arbitrarily, so the final output is wrong; 802 and 2 would no longer be guaranteed in the right order after the tens pass. The last pass cannot repair this, because it too only orders by its own digit, and the running time is unaffected.
- q: >-
    You sort 50 million 32-bit integers. Which approach is likely fastest?
  options: ["Merge sort, since its O(n log n) holds on any input", "Bucket sort with 10 buckets, one per leading digit", "Insertion sort, since it is O(n) on nearly sorted data", "Radix sort on bytes, making four linear passes"]
  answer: 3
  explanation: >-
    Fixed-width keys and large n are radix sort's home ground: 4 passes over n + 256 versus roughly 26 levels of comparisons for merge sort, whose guarantee does not make it faster. Insertion sort is quadratic unless the data is nearly sorted; 10 buckets leaves 5 million elements per bucket.
- q: >-
    What is the minimum number of comparisons any comparison-based sort needs in the worst case on 8 distinct elements?
  options: ["28, one per pair of elements", "8, one comparison per element", "16, since log₂(8!) ≈ 15.3", "24, since 8 · log₂ 8 = 24"]
  answer: 2
  explanation: >-
    There are 40,320 permutations; a binary decision tree needs height at least log₂ 40,320, which rounds up to 16. Merge sort achieves 17, close to optimal, which already rules out 24: n log₂ n is the growth rate, but log₂(n!) is smaller by about 1.44n. 28 is insertion sort's worst case, not a lower bound.
- q: >-
    Your input is two sorted arrays concatenated. Which library sort does close to linear work on it?
  options: ["Heap sort, which skips work on ordered input", "Python's Timsort, which merges the two sorted runs", "Any sort, since sorted input is always fast", "Java's dual-pivot quicksort on primitives"]
  answer: 1
  explanation: >-
    Timsort scans for natural runs, finds two, and performs a single merge with galloping. Quicksort and heap sort do not exploit existing order (pdqsort detects fully sorted input, but two runs still need a full sort), so "any sort" is wrong too.
```
