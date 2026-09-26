---
slug: selection-and-order-statistics
title: "Selection: the k-th element without sorting"
description: Quickselect in expected linear time, why median of medians guarantees it and is still rarely used, and when a heap beats both for k-th largest.
minutes: 35
difficulty: medium
tags: [selection, quickselect, median, order-statistics, top-k, partition]
problems: [kth-largest-array, k-closest-points, top-k-frequent, median-two-sorted]
---
You need the median response time from 50 million latency samples, or the 100 most-similar vectors out of ten million, or the k-th largest salary. Sorting gives you all of that as a side effect, at $O(n \log n)$. But you asked for one number, and there is a $O(n)$ algorithm that finds it by throwing away most of the array without ever ordering it.

The **k-th order statistic** of a multiset is the element that would sit at index `k` if the data were sorted. The median is the middle one; the minimum is the 0-th. Selection is the problem of finding it, and the interesting part is that it is fundamentally easier than sorting, by a logarithmic factor, for reasons that come straight out of the partition step of quicksort.

## Quickselect: partition, then recurse on one side

Quicksort partitions around a pivot and recurses on *both* sides. Quickselect notices that after partitioning, the pivot is at its final sorted index `p`, so:

- if `p == k`, the pivot is the answer;
- if `k < p`, the answer is in the left part, and the right part can be discarded entirely;
- if `k > p`, the answer is in the right part, and the left part is discarded.

Only one side is ever visited again.

```viz
{"type": "array", "algorithm": "quick-sort", "values": [3, 2, 1, 5, 6, 4], "title": "The partition step quickselect reuses", "caption": "Quicksort recurses on both sides of the pivot. Quickselect keeps only the side that contains index k; the other side is never touched again."}
```

```python
import random

def quickselect(a, k):
    """Value at index k (0-based) of sorted(a). Mutates a."""
    lo, hi = 0, len(a) - 1
    while True:
        if lo == hi:
            return a[lo]
        p = partition(a, lo, hi, random.randint(lo, hi))
        if k == p:
            return a[p]
        if k < p:
            hi = p - 1
        else:
            lo = p + 1

def partition(a, lo, hi, pivot_index):
    a[pivot_index], a[hi] = a[hi], a[pivot_index]     # move pivot to the end
    pivot = a[hi]
    i = lo
    for j in range(lo, hi):
        if a[j] < pivot:
            a[i], a[j] = a[j], a[i]
            i += 1
    a[i], a[hi] = a[hi], a[i]
    return i
```

Trace `a = [3, 2, 1, 5, 6, 4]`, `k = 1` (the second smallest), using the last element as pivot for readability:

| range | pivot | after partition | p | decision |
|---|---|---|---|---|
| `[0, 5]` | 4 | `[3, 2, 1, 4, 6, 5]` | 3 | `k=1 < 3`, keep `[0, 2]` |
| `[0, 2]` | 1 | `[1, 2, 3, 4, 6, 5]` | 0 | `k=1 > 0`, keep `[1, 2]` |
| `[1, 2]` | 3 | `[1, 2, 3, 4, 6, 5]` | 2 | `k=1 < 2`, keep `[1, 1]` |
| `[1, 1]` | | | | `lo == hi`, return `a[1] = 2` |

Three partitions over 6, then 3, then 2 elements: 11 element visits instead of the 15 or so a full sort would take. The gap widens with `n`.

### Why it is expected O(n)

With a random pivot, the pivot lands in the middle half of the range (between the 25th and 75th percentiles) with probability ½. Whenever that happens, the surviving side has at most ¾ of the elements. So on average every two partitions shrink the problem by a factor of at least ¾, and the total work is a geometric series:

$$n + \tfrac{3}{4}n + \left(\tfrac{3}{4}\right)^2 n + \dots = 4n$$

Rough but right: expected comparisons are about `2n` to `3.4n` depending on `k` and the analysis, which is $\Theta(n)$. Contrast with quicksort, which at each level does work proportional to *all* elements at that level and has $\log n$ levels; the "throw one side away" step is exactly where the logarithm disappears.

The worst case is still $O(n^2)$: an adversarial pivot sequence that removes one element per partition. Random pivots make that a probability event rather than an input property, the same argument as for [quicksort](/learn/algorithms/sorting-searching/comparison-sorts). With a *deterministic* pivot, the same killer-adversary attack applies, and if the data is untrusted, that matters.

## Median of medians: guaranteed linear time

In 1973 Blum, Floyd, Pratt, Rivest and Tarjan showed how to pick a pivot that is *guaranteed* to be reasonably central, making selection worst-case $O(n)$. The pivot rule:

1. Split the array into groups of 5.
2. Sort each group (constant work per group) and take its median, giving `n/5` medians.
3. Recursively select the median of those medians. That is the pivot.

At least half of the `n/5` group medians are `<=` the pivot, and each such median has two more elements in its group that are `<=` it, so at least `3 · (n/10) = 3n/10` elements are `<=` the pivot. Symmetrically, at least `3n/10` are `>=` it. The pivot is therefore never in the outer 30% of the data, and the recursion after partitioning is on at most `7n/10` elements.

The recurrence is `T(n) <= T(n/5) + T(7n/10) + O(n)`. Because `1/5 + 7/10 = 9/10 < 1`, the geometric series converges and `T(n) = O(n)`. The group size 5 is the smallest odd number that makes the fractions add to less than 1; with groups of 3 they add to `1/3 + 2/3 = 1` and the bound becomes $O(n \log n)$.

So why does almost nobody use it? The constant. Sorting groups of five, recursing to find the pivot, then partitioning costs roughly 10–20 comparisons per element versus quickselect's 2–3. On real hardware, a randomised quickselect beats median of medians by a wide margin for every input that is not an adversarial one. It is a beautiful proof that selection is in $O(n)$ worst case, and the interview answer is exactly that sentence: "median of medians makes selection worst-case linear; in practice we use random pivots because the constant is much better, or introselect to get both."

**Introselect** is the fix libraries actually ship: run quickselect, and if the recursion depth or the total work exceeds a bound (typically a multiple of `log n` levels), switch to median of medians for the rest. C++'s `std::nth_element` is specified to be linear on average and implementations use this hybrid; NumPy's `np.partition` does the same.

## Heap versus quickselect for the k largest

The other classic route to the k-th largest is a **min-heap of size k**: push each element, pop the minimum whenever the heap exceeds `k`, and after the pass the heap holds the `k` largest with the k-th largest at the root.

```viz
{"type": "heap", "algorithm": "top-k", "values": [3, 2, 1, 5, 6, 4, 9, 7], "k": 3, "kind": "min", "title": "Top 3 with a min-heap of size 3", "caption": "The root is the smallest of the k largest seen so far; anything smaller than it is rejected in O(1)."}
```

| | Quickselect | Min-heap of size k |
|---|---|---|
| Time | $O(n)$ expected | $O(n \log k)$ |
| Extra space | $O(1)$ (in place) | $O(k)$ |
| Needs the whole array in memory | yes | **no**: works on a stream |
| Returns the k largest in sorted order | no (unordered on one side) | yes, with $O(k \log k)$ to drain |
| Mutates input | yes | no |

The choice depends on two questions. **Is `k` small relative to `n`?** For `k = 10`, `log k` is about 3 and the heap's rejection test (`x <= root`, no heap operation at all) filters most elements in one comparison; the heap wins or ties, and it has better constants than a partition. For `k = n/2`, `log k` is 20 and quickselect's linear pass is clearly better. **Is the data streaming?** A stream of 10⁹ events cannot be partitioned in place; a heap of size `k` needs `k` slots and one pass. Top-k over a stream is the heap, full stop.

For [k-closest-points](/practice/k-closest-points) the interviewer expects you to present both and choose on those two axes; for [kth-largest-array](/practice/kth-largest-array) they usually want quickselect written out and the heap mentioned.

## Median of two sorted arrays

One more selection problem is asked often enough to name: the median of two sorted arrays in $O(\log(\min(m, n)))$ ([median-two-sorted](/practice/median-two-sorted)). It is not quickselect; it is [binary search](/learn/algorithms/sorting-searching/binary-search) over how many elements of the smaller array go into the left half of the merged order. The invariant is "left half has `(m + n + 1) / 2` elements and every element in the left half is `<=` every element in the right half". You binary search the cut position `i` in array A; `j = half - i` is forced in B, and the predicate "`A[i-1] <= B[j]` and `B[j-1] <= A[i]`" is monotone in `i`. It is the hardest common binary search and you should attempt it after this module.

## Selection in practice

Your language almost certainly has selection built in and, as with sorting, knowing what it is doing tells you what it costs.

- **C++ `std::nth_element(first, nth, last)`**: rearranges so the element at `nth` is the one that would be there if sorted, everything before is `<=`, everything after is `>=`. Introselect, linear average.
- **NumPy `np.partition(a, k)`** and `np.percentile` use introselect; `np.median` on a large array is a partition, not a sort.
- **Python `heapq.nlargest(k, iterable)` / `nsmallest`**: heap of size `k`, $O(n \log k)$; the docs tell you to use `sorted(...)[:k]` when `k` is close to `n` and `min`/`max` when `k == 1`. Python has no built-in quickselect; `statistics.median` sorts.
- **Rust `slice::select_nth_unstable(index)`**: introselect, in place.
- **Go**: nothing in the standard library; write quickselect or use a heap from `container/heap`.
- **Databases**: `PERCENTILE_CONT` and `median()` over a large table typically sort or use approximate sketches (t-digest, KLL). If you need p99 of a billion latencies in a dashboard, you want an approximate quantile sketch with bounded memory, not exact selection; the exact answer is a batch job.

The last point is the production version of the streaming question: exact selection needs either all the data in memory (quickselect) or `O(k)` memory for the top `k` (heap), but a *percentile* of a stream needs neither if you accept a small error. That trade is what monitoring systems make on your behalf.

## Exercises

```exercise
id: quickselect-kth-smallest
title: Quickselect the k-th smallest
prompt: |
  Return the k-th smallest element of `nums` (1-indexed: `k = 1` is the
  minimum). `1 <= k <= len(nums)`. Duplicates count separately, so the
  2nd smallest of `[5, 5, 1]` is 5.

  Implement quickselect: partition around a pivot and recurse or loop on
  the side that contains the target index. Do not call the built-in
  sort. A random or middle pivot is fine.
languages: [python, javascript]
entry: kth_smallest
starter:
  python: |
    def kth_smallest(nums, k):
        # your code here
        return 0
  javascript: |
    function kth_smallest(nums, k) {
      // your code here
      return 0;
    }
tests:
  - args: [[3, 2, 1, 5, 6, 4], 2]
    expected: 2
  - args: [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4]
    expected: 3
    label: duplicates
  - args: [[1], 1]
    expected: 1
    label: single element
  - args: [[5, 5, 5, 5], 3]
    expected: 5
    label: all equal
  - args: [[-3, 0, -1, 2], 1]
    expected: -3
  - args: [[7, 10, 4, 3, 20, 15], 3]
    expected: 7
    hidden: true
  - args: [[2, 1], 2]
    expected: 2
    hidden: true
  - args: [[9, 8, 7, 6, 5, 4, 3, 2, 1], 9]
    expected: 9
    hidden: true
hints:
  - "Convert k to a 0-based target index t = k - 1 and loop while lo < hi."
  - "After partition returns the pivot's index p: if p == t return nums[p]; if t < p set hi = p - 1; else lo = p + 1."
  - "Use a three-way or a strict-less partition so that all-equal arrays still terminate; check that each step shrinks [lo, hi]."
```

```exercise
id: top-k-largest
title: Top k largest with a bounded heap
prompt: |
  Return the `k` largest elements of `nums` in any order, using a
  structure whose size never exceeds `k` (a min-heap is the intended
  tool; in JavaScript write a small binary heap or keep a sorted array of
  size k). `1 <= k <= len(nums)`. Duplicates are returned as many times
  as they occur among the k largest.
languages: [python, javascript]
entry: top_k
starter:
  python: |
    import heapq

    def top_k(nums, k):
        # your code here
        return []
  javascript: |
    function top_k(nums, k) {
      // your code here
      return [];
    }
tests:
  - args: [[3, 2, 1, 5, 6, 4], 2]
    expected: [5, 6]
    any_order: true
  - args: [[1], 1]
    expected: [1]
    label: single element
  - args: [[5, 5, 1, 5], 3]
    expected: [5, 5, 5]
    any_order: true
    label: duplicates among the top
  - args: [[4, 4, 4, 4], 2]
    expected: [4, 4]
    any_order: true
  - args: [[10, -1, 3, 7], 4]
    expected: [10, -1, 3, 7]
    any_order: true
    hidden: true
    label: k equals length
  - args: [[1, 2, 3, 4, 5, 6], 3]
    expected: [4, 5, 6]
    any_order: true
    hidden: true
hints:
  - "Push each element onto a min-heap; when the heap has more than k elements, pop the minimum."
  - "In Python, heapq.heappush and heapq.heappop; the remaining k elements are the answer."
```

## Senior signals

- You know selection is $O(n)$ expected and can explain **why** the logarithm vanishes: only one side of the partition is ever revisited.
- You can sketch **median of medians** (groups of 5, `3n/10` guarantee, `1/5 + 7/10 < 1`) and say honestly that it is rarely used because of the constant, and that introselect is what ships.
- You choose between **quickselect and a size-k heap** on two axes: `k` relative to `n`, and whether the data is a stream.
- You know `nth_element`, `np.partition`, `select_nth_unstable` and `heapq.nlargest` exist and what each costs.
- You know that exact percentiles of a stream need memory proportional to the data, and that monitoring systems use **quantile sketches** instead.
- You can explain that the median-of-two-sorted-arrays problem is a binary search on a cut position, not a selection by partition.

## Check yourself

```quiz
- q: >-
    Quickselect with random pivots is expected O(n) while quicksort is expected O(n log n). What accounts for the difference?
  options: ["Quickselect uses a better partition", "Quickselect recurses into only one side, so the work forms a geometric series n + 3n/4 + ... instead of n per level times log n levels", "Quickselect does not need to compare elements", "Quicksort has to be stable"]
  answer: 1
  explanation: >-
    Both use the same partition. Sorting must process every element at every recursion level; selection discards the side that cannot contain index k, and the surviving sizes shrink geometrically.
- q: >-
    Median of medians uses groups of 5. Why not groups of 3?
  options: ["Groups of 3 cannot have a median", "With groups of 3 the recursion sizes are n/3 and 2n/3, which sum to n, so the bound degrades to O(n log n)", "Sorting groups of 3 is slower than groups of 5", "Groups of 3 give a pivot in the outer 30%"]
  answer: 1
  explanation: >-
    The linear bound needs the two recursive fractions to sum to less than 1. With groups of 5 they are 1/5 + 7/10 = 9/10; with groups of 3 they are 1/3 + 2/3 = 1, and the recurrence solves to n log n.
- q: >-
    You need the 20 largest scores from a stream of 500 million events that does not fit in memory. The right approach is:
  options: ["Quickselect on the stream", "A min-heap of size 20: O(n log 20) time, O(20) space", "Sort the stream", "Median of medians"]
  answer: 1
  explanation: >-
    Quickselect and sorting need the whole array in memory. A bounded min-heap does one pass with constant memory and rejects most elements with a single comparison against the root.
- q: >-
    A colleague uses quickselect with the first element as pivot on data received from external clients. What is the risk?
  options: ["Incorrect results", "A crafted input makes every partition remove one element, giving O(n²) time: a CPU-exhaustion attack", "The pivot must be the last element", "Quickselect requires distinct values"]
  answer: 1
  explanation: >-
    Deterministic pivots have inputs that force the worst case, and an adversary who controls the data can supply one. Random pivots or introselect remove the attack; correctness is not affected either way.
- q: >-
    Which statement about std::nth_element (or NumPy's np.partition) is accurate?
  options: ["It fully sorts the array", "It places the k-th element in its sorted position with smaller elements before and larger after, in linear average time, without sorting either side", "It returns the k largest elements in sorted order", "It is O(n log n) because it is implemented with heapsort"]
  answer: 1
  explanation: >-
    nth_element is a partition-based selection (introselect). The two sides are partitioned relative to the k-th element but are otherwise unordered; that is what makes it linear.
```
