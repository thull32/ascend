---
slug: non-comparison-sorts-and-lower-bounds
title: "Beating n log n: counting, radix, bucket, and the lower bound"
description: Why no comparison sort can beat n log n, how counting and radix sort sidestep the proof, and what Timsort and pdqsort do inside your language's sort().
minutes: 50
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

Trace on `[4, 2, 2, 8, 3, 3, 1]` with `k = 8`. The histogram is `counts = [0, 1, 2, 2, 1, 0, 0, 0, 1]` (index = key), and the running total turns it into starting positions `[0, 0, 1, 3, 5, 6, 6, 6, 6]`: key 1 starts at 0, key 2 at 1, key 3 at 3, key 4 at 5, key 8 at 6. The placement pass, one element at a time:

| x | position `counts[x]` | `out` after | `counts` after |
|---|---|---|---|
| 4 | 5 | `[_, _, _, _, _, 4, _]` | key 4 → 6 |
| 2 | 1 | `[_, 2, _, _, _, 4, _]` | key 2 → 2 |
| 2 | 2 | `[_, 2, 2, _, _, 4, _]` | key 2 → 3 |
| 8 | 6 | `[_, 2, 2, _, _, 4, 8]` | key 8 → 7 |
| 3 | 3 | `[_, 2, 2, 3, _, 4, 8]` | key 3 → 4 |
| 3 | 4 | `[_, 2, 2, 3, 3, 4, 8]` | key 3 → 5 |
| 1 | 0 | `[1, 2, 2, 3, 3, 4, 8]` | key 1 → 1 |

**Why it is correct and stable.** After the prefix pass, `counts[v]` is the number of elements with key `< v`, which is exactly the index where the first element with key `v` belongs in sorted order. The placement pass visits elements in input order, so the first element with key `v` goes to that slot and each later one with the same key goes one slot further right: equal keys land in input order. Run the placement pass *backwards* and it is still a correct sort but no longer stable, which is the classic bug in hand-written versions.

The cost is $O(n + k)$: `n` to histogram and place, `k` to convert counts to positions, and `k + 1` integers of memory. If `k` is a million and `n` is ten, that is a bad trade; counting sort wants `k = O(n)`. The interview appearance is usually disguised: "sort characters of a lowercase string" (`k = 26`), "sort colours" (`k = 3`, though [Sort Colors](/practice/sort-colors) wants a single pass, which is the Dutch national flag), or "sort by frequency" where the frequencies are bounded by `n` ([top-k-frequent](/practice/top-k-frequent) is bucket-by-frequency followed by a walk from the top).

## Radix sort

If keys are wider than a small range, say 32-bit integers, `k = 4 billion` kills counting sort: the `counts` array alone would be 16 GB. Radix sort fixes that by counting-sorting on one **digit** at a time, from least significant to most (LSD), relying on the stability of each pass to keep earlier digits in order.

Base-10 trace on `[170, 45, 75, 90, 802, 24, 2, 66]`:

| pass | digit | result |
|---|---|---|
| 1 | ones | `[170, 90, 802, 2, 24, 45, 75, 66]` |
| 2 | tens | `[802, 2, 24, 45, 66, 170, 75, 90]` |
| 3 | hundreds | `[2, 24, 45, 66, 75, 90, 170, 802]` |

After pass 2, `45` precedes `66` because 4 < 6, and `802` precedes `2` because both have a zero tens digit and 802 came first *from the previous pass* (stability). Break stability and the whole thing falls apart.

**The induction.** Claim: after pass `i`, the array is sorted by the low `i` digits. Pass 1 sorts by the ones digit, so the claim holds for `i = 1`. Assume it holds after pass `i`. Pass `i + 1` places elements by digit `i + 1`; two elements with different digits end up in the right order because of that digit, and two with the same digit keep their relative order from pass `i` because the pass is stable, and that order was already correct on the low `i` digits. So the array is sorted on the low `i + 1` digits. After `d` passes it is sorted on all `d` digits, which is the full key.

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

With `d` digits in base `b`, the cost is $O(d \cdot (n + b))$. For 32-bit keys and a base of 256 (one byte per pass), that is 4 passes of `n + 256`, and each pass is two sweeps over the data (histogram, then scatter), so about 8 sweeps in total. Compare that with `log₂ n ≈ 20` levels of comparisons for a comparison sort at `n = 10⁶`, each level a full sweep. Radix sort genuinely wins on large arrays of fixed-width keys, which is why GPU sorting libraries (CUB, Thrust) and database sort operators use it, and why sorting floats can be done by radix sorting their bit patterns after a sign fix-up.

The digit width is a real engineering choice. With 8-bit digits the scatter pass writes to 256 destination streams, which fits the store buffers and the L1 cache; with 16-bit digits there are only 2 passes but 65,536 streams, each touching its own page, and TLB and cache misses erase the gain. The measured sweet spot on current CPUs is 8 to 11 bits per digit; the exact value depends on cache and TLB sizes.

Why does everyone not use it? Three reasons: it needs keys that decompose into digits (integers, fixed-length strings, floats with a trick; not arbitrary comparators), it needs $O(n + b)$ scratch memory (a full second copy of the data plus the histogram), and for small `n` or narrow keys the comparison sort's cache-resident inner loop wins: below a few thousand elements the fixed cost of 8 sweeps and histogram setup is more than `n log₂ n` comparisons cost. MSD radix (most significant digit first, recursing into buckets) handles variable-length strings and is the basis of burstsort, but it is a niche tool.

## Bucket sort

If the keys are real numbers spread roughly uniformly over a range, drop each into one of `n` buckets by scaling (`bucket = floor(x * n)` for `x` in `[0, 1)`), sort each bucket with insertion sort, and concatenate.

Trace on `[0.78, 0.17, 0.39, 0.26, 0.72, 0.94, 0.21, 0.12, 0.23, 0.68]` with 10 buckets:

| bucket | contents in arrival order | after insertion sort |
|---|---|---|
| 1 | 0.17, 0.12 | 0.12, 0.17 |
| 2 | 0.26, 0.21, 0.23 | 0.21, 0.23, 0.26 |
| 3 | 0.39 | 0.39 |
| 6 | 0.68 | 0.68 |
| 7 | 0.78, 0.72 | 0.72, 0.78 |
| 9 | 0.94 | 0.94 |

Concatenating the buckets in index order gives the sorted list. Under the uniformity assumption each bucket holds one element on average, the insertion sorts cost $O(1)$ expected each, and the total is $O(n)$ expected.

The word doing the work is *uniform*. Feed bucket sort a heavily skewed distribution and one bucket receives most of the elements, at which point you are running insertion sort on almost everything and the cost is $O(n^2)$. Bucket sort is an algorithm for when you *know* your data's distribution. The interview form is "the values are between 0 and 1, uniformly random", and the senior answer includes the sentence "if they are not uniform, this degrades, so I would check that or fall back to a comparison sort". The production form is **sample sort**: draw a sample, take its quantiles as bucket boundaries, and now every bucket is balanced regardless of the distribution. That is what Spark's `RangePartitioner` does before a distributed sort, and why it samples the RDD first.

## The lower bound: why n log n is the floor

Take any algorithm that sorts by comparing elements. Model its behaviour on an input of `n` distinct elements as a binary **decision tree**: each internal node is a comparison `a[i] < a[j]?`, the two children are what the algorithm does next depending on the answer, and each leaf is a final output permutation.

Here is the whole tree for insertion sort on three elements `a, b, c`:

```text
                    a < b ?
             yes /           \ no
           b < c ?           a < c ?
        yes /   \ no       yes /   \ no
       [a,b,c]  a < c ?   [b,a,c]  b < c ?
             yes /  \ no        yes /  \ no
           [a,c,b] [c,a,b]    [b,c,a] [c,b,a]
```

Six leaves, one per permutation of three elements; height 3, so insertion sort makes at most three comparisons on three elements, and `⌈log₂ 6⌉ = 3` says no algorithm can do it in two.

Three facts, and the theorem falls out:

1. There are `n!` possible input orders, and a correct algorithm must be able to produce a different output permutation for each, so the tree needs at least `n!` leaves.
2. A binary tree of height `h` has at most `2^h` leaves.
3. Therefore `2^h ≥ n!`, so `h ≥ log₂(n!)`.

The height of the tree is the number of comparisons on the worst-case input. Stirling's approximation gives `log₂(n!) ≈ n log₂ n − 1.44n`, which is $\Omega(n \log n)$. Any comparison sort makes at least that many comparisons on some input.

Make it concrete for `n = 8`: `8! = 40,320` and `log₂ 40,320 ≈ 15.3`, so *every* comparison sort needs at least 16 comparisons on some 8-element input. Merge sort on 8 elements does at most 17. Insertion sort in the worst case does 28. The bound is tight up to a constant, and merge sort is close to it.

The argument is also a lower bound on *average* comparisons, not only worst case, because a binary tree with `n!` leaves has average leaf depth at least `log₂(n!)` as well. So randomisation does not help either; quicksort's expected `1.39 n log₂ n` is about as good as it gets.

Counting sort escapes because a single operation `counts[x] += 1` learns the exact value of `x`, which is `log₂ k` bits of information, where a comparison learns one bit. That is the whole trick: a richer model of what one step can do. Whenever an interviewer asks "can you do better than n log n?", the answer is "not with comparisons; if the keys have bounded structure, yes, and here is how".

## Under the hood: Timsort

Nobody ships textbook quicksort or merge sort. The two designs that dominate are Timsort and pattern-defeating quicksort, and knowing which one you are calling tells you its behaviour on your data.

Timsort, written by Tim Peters for Python 2.3 in 2002, is a merge sort that refuses to do work the input has already done. Its pieces, in the order they run:

- **Run detection.** Scan forward from the current position for a stretch that is ascending (`a[i] <= a[i+1]`) or *strictly* descending, and reverse a descending run in place. Strict descent is required so that reversing keeps equal elements in their original order, which keeps the sort stable.
- **minrun.** A run shorter than `minrun` is extended to `minrun` elements with binary insertion sort. `minrun` is computed from `n` by taking its six most significant bits and adding one if any lower bit is set, which yields a value in `32..64` chosen so that `n / minrun` is a power of two or slightly below one; that makes the later merges balanced. For `n = 10⁶` (`11110100001001000000` in binary), the top six bits are `111101 = 61` and lower bits are set, so `minrun = 62`, and `10⁶ / 62 ≈ 16,129`, which sits below `2¹⁴ = 16,384`.
- **The run stack.** Runs are pushed onto a stack and merged whenever the top three lengths `A, B, C` violate `A > B + C` or `B > C`. Keeping those invariants bounds the stack at about `log_φ n` entries (85 for 2⁶⁴ elements) and keeps the merge tree balanced, which is what makes the whole thing $O(n \log n)$.
- **The merge.** To merge two adjacent runs, copy the *shorter* one into a temporary buffer (at most `n/2` elements, often far fewer) and merge back into place from the appropriate end, so the buffer is the only extra memory.
- **Galloping.** In the merge, count how many times in a row one run wins the comparison. Once that count reaches `MIN_GALLOP = 7`, switch from one-at-a-time compares to an exponential search (probe positions 1, 3, 7, 15, ... then binary search the gap) to find how many elements of the winning run precede the next element of the other, and copy that block in one `memmove`. On data made of long sorted pieces this replaces `k` comparisons with `2 log₂ k`. The threshold adapts: it drops while galloping keeps paying off and rises when it does not, so random data does not pay the galloping overhead.

On sorted input Timsort finds one run and does `n − 1` comparisons. On two sorted files concatenated it finds two runs and does one galloping merge, close to linear. On random input it is an ordinary merge sort with `minrun`-sized insertion-sorted leaves.

The stack invariants had a real bug: in 2015 de Gouw and colleagues, formally verifying the Java port, found that the invariant was only checked on the top three runs, and a crafted input could push a fourth run that broke it and overflow the fixed-size run stack. The input needed about 67 million elements in Java; CPython's fixed stack of 85 pending runs was large enough that no list that fits in memory could trigger it, but Tim Peters fixed the invariant check there too. CPython 3.11 then replaced the merge policy with **powersort**, which picks merge order from the run lengths near-optimally. The lesson is that even a twenty-year-old library sort can hide a bug that only a proof finds.

## Under the hood: pattern-defeating quicksort

pdqsort, by Orson Peters (2014 onwards), is the modern unstable sort. It is introsort (quicksort with a median-of-three pivot, or a "ninther" median of three medians above about 128 elements, heap sort fallback on excessive depth, insertion sort below about 24 elements) with three additions:

- If a partition step moved nothing (the range was already partitioned around the pivot), it tries a **partial insertion sort** with a small budget of moves; if the range turns out sorted, that returns in $O(n)$, giving linear time on sorted, reversed and all-equal inputs.
- When the pivot equals the previous pivot, it partitions so that elements *equal* to the pivot are excluded from recursion, giving $O(n \log k)$ for `k` distinct keys.
- When a partition is badly unbalanced (one side smaller than `n/8`), it **breaks the pattern** by swapping a few elements at fixed offsets from the ends before recursing, so inputs crafted to fool median-of-three are shuffled out of their shape; after `log n` such bad partitions it falls back to heap sort.

Its inner loop is the block partition from BlockQuicksort: scan 64-element blocks from each end, record the offsets of misplaced elements in two small arrays *without branching*, then swap them pairwise. A conventional partition mispredicts about half its branches on random data, and at 15–20 cycles per mispredict that is most of the running time; the branchless version replaces the branch with a conditional increment and runs two to three times faster on random integers. On nearly-sorted data, where the branches were predictable anyway, the gain is small.

## What your language's sort() is

| Language | Stable sort | Unstable sort | Notes |
|---|---|---|---|
| Python `list.sort` / `sorted` | Timsort (powersort merge policy since 3.11) | — | `sorted` copies the list first; `list.sort` is in place |
| JavaScript (V8) `Array.prototype.sort` | Timsort | — | Stable since ES2019; before V8 7.0 arrays over 10 elements used an unstable quicksort |
| Java `Arrays.sort` | Timsort for objects | Dual-pivot quicksort for primitives | Primitives have no identity, so instability is unobservable |
| Go `sort.Stable` / `slices.SortStableFunc` | Insertion + symmerge (in-place merge) | pdqsort (`sort.Slice`, `slices.Sort`) | pdqsort arrived in Go 1.19 |
| Rust `slice::sort` / `sort_unstable` | driftsort (since Rust 1.81) | ipnsort (since 1.81) | Both rewritten in 2024; earlier versions were merge sort and pdqsort |
| C++ `std::sort` / `std::stable_sort` | Merge sort with a buffer, in-place merge if allocation fails | Introsort (libstdc++), pdqsort-derived (libc++ since 2022) | `std::sort` is unstable and says so |

The practical takeaways: if you sort by a key and need ties preserved, use the stable one. If you sort primitives or do not care about ties, the unstable one is typically 20–50% faster because it does not allocate and its partition is branchless. And if your input is mostly sorted already, Timsort will be close to linear and pdqsort will be fully linear, so "sorting is n log n" is not the right mental model for the cost of `sort()` on real data, which is very often nearly sorted.

## Failure modes

**`MemoryError` (or a 16 GB allocation) from a counting sort.** Symptom: the sort works in tests and dies on production data. Diagnosis: the key range `k` was assumed small but is actually the full 32-bit range, or a user-controlled value; the `counts` array is `k + 1` integers, 16 GB at `k = 2³²` with 4-byte counters. Fix: bound `k` by inspecting `max(keys)` first, switch to radix sort (fixed `256` counters per pass), or fall back to the comparison sort when `k > c · n`.

**Negative numbers or floats come out in the wrong order from a radix sort.** Symptom: `[-3, 5, -1]` sorts as `[5, -1, -3]` or similar. Diagnosis: two's complement puts negative values above positive ones when read as unsigned digits, and IEEE floats compare correctly as integers only when positive. Fix: flip the sign bit before sorting (and back after) for signed integers; for floats, flip the sign bit of positives and all bits of negatives, which makes the bit patterns order like the values, including `-0.0 < +0.0`.

**Bucket sort p99 explodes on one tenant's data.** Symptom: the median sort takes milliseconds, one customer's takes minutes. Diagnosis: their keys are skewed (timestamps clustered in one hour, prices clustered under 10), so one bucket holds nearly everything and the per-bucket insertion sort is quadratic; a histogram of bucket sizes shows it immediately. Fix: sample the input and use its quantiles as bucket boundaries (sample sort), or sort each bucket with the library sort so the worst case is `n log n` rather than `n²`.

**Sorting objects is 10× slower than sorting ints for the same `n`.** Symptom: profiling shows time in the comparison, not in data movement. Diagnosis: the comparator dominates (`__lt__` in Python is a full method call with dispatch; a Java `Comparator` lambda boxes), and Timsort's comparison count is fixed. Fix: precompute a primitive sort key per element (`key=` in Python, a parallel array of ints), sort the keys, and permute; or for fixed-width keys use a radix sort on the key array.

## Interviewer follow-ups

**"Sort 10⁹ distinct 32-bit integers with 1 GB of RAM."** Model answer: a bitmap of `2³²` bits is 512 MB; set each integer's bit in one pass, then walk the bitmap in order. That is counting sort with a 1-bit counter, $O(n + k)$ with `k = 2³²`, and it is the answer only because the integers are distinct. With duplicates, an external LSD radix sort on bytes (4 passes, each streaming the data through 256 output files) or an external merge sort. Common wrong answer: quicksort, which needs the whole array in memory.

**"Why does the lower bound still hold for randomised algorithms?"** Model answer: a randomised comparison sort is a probability distribution over deterministic decision trees; every one of those trees has at least `n!` leaves, so the average leaf depth of each, and hence the expected comparison count, is at least `log₂ n!`. Common wrong answer: "randomisation avoids the worst case, so the bound does not apply" (it avoids the worst *input*, not the information-theoretic floor).

**"Your keys are strings of up to 100 bytes. Radix or comparison?"** Model answer: MSD radix on bytes with insertion sort for small buckets (that is burstsort, and it wins on large string sets because most comparisons in a comparison sort only look at the first few bytes anyway), or a three-way radix quicksort. LSD would need 100 passes and touch every byte of every string. Common wrong answer: LSD radix "because it is linear".

**"Two sorted files concatenated, 10⁶ elements each. What does `sorted()` cost?"** Model answer: Timsort detects two runs of 10⁶, makes one merge, and gallops through it: roughly `2 × 10⁶` element moves and far fewer comparisons than `n log₂ n ≈ 4 × 10⁷`. Common wrong answer: "`n log n`, the same as any input."

**"When does bucket sort beat everything?"** Model answer: when the key distribution is known and near-uniform, or when you can make it so with sampled quantiles; then `n` buckets of expected size 1 give linear expected time. Common wrong answer: "whenever the keys are floats", which ignores the distribution assumption entirely.

## What mid-level engineers get wrong

- **Quoting "sorting is n log n" as a law.** It is a bound on *comparison* sorts; the consequence is missing linear-time solutions on bounded integer keys and misjudging the cost of `sort()` on nearly-sorted data.
- **Believing counting sort is always the fast one.** With `k ≫ n` it is slower and can exhaust memory; the check `k = O(n)` is part of the algorithm.
- **Writing the placement pass of counting sort backwards, or a radix pass that is not stable.** The output is wrong or the stability contract silently breaks.
- **Applying bucket sort without checking the distribution.** One skewed tenant turns linear into quadratic.
- **Not knowing what their runtime's `sort()` is.** They cannot predict that Timsort is linear on sorted input, that Node before 2018 was unstable, or that `sort_unstable` is faster and why.
- **Treating Timsort's minrun and galloping as trivia.** They explain why sorting *almost*-sorted data (a table with a batch appended) is nearly free, which changes how you design incremental pipelines.

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
- You know counting sort escapes it by using **values as indices**, that it only pays off when `k = O(n)`, and why the forward placement pass is what makes it stable.
- You explain LSD radix sort's dependence on **stability** with the induction on digits, give its cost as `d(n + b)`, and know that the digit width is a cache and TLB trade-off.
- You name what your language's `sort()` does (Timsort, pdqsort, dual-pivot quicksort), can describe **minrun, the run stack invariants and galloping**, and predict its behaviour on nearly-sorted input.
- You know bucket sort's $O(n)$ is conditional on a **uniform distribution**, say what happens otherwise, and reach for sampled quantiles (sample sort) when the distribution is unknown.
- You choose the stable or unstable variant deliberately and can explain the performance gap between them, including why a **branchless partition** matters on random data.

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
- q: >-
    Timsort's galloping mode switches on after one run has won MIN_GALLOP = 7 comparisons in a row. What does it do, and why is the threshold adaptive?
  options: ["It swaps the two runs so the shorter one is always copied to the buffer", "It raises minrun so that later runs are longer and fewer merges are needed", "It sorts the winning run again, since a long streak suggests it was never sorted", "It exponentially searches how far the streak extends and block-copies, backing off when streaks stop paying"]
  answer: 3
  explanation: >-
    A streak means many elements of one run precede the next element of the other, so an exponential-then-binary search finds the boundary in about 2 log₂ k comparisons and one memmove copies the block. The threshold drops while galloping keeps winning and rises when it does not, so random data, where streaks are short, does not pay the search overhead. Runs are already sorted, the buffer choice is fixed by length, and minrun is computed once from n.
```
