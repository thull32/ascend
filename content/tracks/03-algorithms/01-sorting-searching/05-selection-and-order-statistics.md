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

### The partition, element by element

This is Lomuto's partition. The invariant during the scan: everything in `a[lo:i]` is `< pivot`, everything in `a[i:j]` is `>= pivot`, and `a[j:hi]` is unexamined. `i` is the boundary where the next small element will go. Take `a = [3, 2, 1, 5, 6, 4]` with the last element, 4, as pivot:

| `j` | `a[j]` | `a[j] < 4`? | action | `i` after | array |
|---|---|---|---|---|---|
| 0 | 3 | yes | swap `a[0], a[0]` (no-op) | 1 | `[3, 2, 1, 5, 6, 4]` |
| 1 | 2 | yes | swap `a[1], a[1]` (no-op) | 2 | `[3, 2, 1, 5, 6, 4]` |
| 2 | 1 | yes | swap `a[2], a[2]` (no-op) | 3 | `[3, 2, 1, 5, 6, 4]` |
| 3 | 5 | no | nothing | 3 | `[3, 2, 1, 5, 6, 4]` |
| 4 | 6 | no | nothing | 3 | `[3, 2, 1, 5, 6, 4]` |
| end | | | swap pivot into `a[3]` | | `[3, 2, 1, 4, 6, 5]` |

The pivot lands at index 3, with `{3, 2, 1}` before it and `{6, 5}` after, neither side sorted. Five comparisons and one real swap. The self-swaps happen because the small elements were already at the front; on a shuffled array `i` lags `j` and each small element is swapped back to position `i`.

Now the whole selection for `k = 1` (the second smallest):

| range | pivot | after partition | `p` | decision |
|---|---|---|---|---|
| `[0, 5]` | 4 | `[3, 2, 1, 4, 6, 5]` | 3 | `k=1 < 3`, keep `[0, 2]` |
| `[0, 2]` | 1 | `[1, 2, 3, 4, 6, 5]` | 0 | `k=1 > 0`, keep `[1, 2]` |
| `[1, 2]` | 3 | `[1, 2, 3, 4, 6, 5]` | 2 | `k=1 < 2`, keep `[1, 1]` |
| `[1, 1]` | | | | `lo == hi`, return `a[1] = 2` |

Three partitions over 6, then 3, then 2 elements: 11 element visits instead of the 15 or so a full sort would take. The gap widens with `n`.

### Why it is expected O(n)

With a random pivot, the pivot lands in the middle half of the range (between the 25th and 75th percentiles) with probability ½. Whenever that happens, the surviving side has at most ¾ of the elements. So on average every two partitions shrink the problem by a factor of at least ¾, and the total work is bounded by a geometric series:

$$2\left(n + \tfrac{3}{4}n + \left(\tfrac{3}{4}\right)^2 n + \dots\right) = 8n$$

That is a loose upper bound; the "wait for a good pivot" accounting is pessimistic. The exact analysis (Knuth's, for Hoare's original FIND with uniformly random pivots) gives an expected comparison count that depends on `k`: about `2n` when `k` is near either end and about `2(1 + \ln 2)\,n ≈ 3.39n` for the median. So a median costs three to four passes over the data, and the number is independent of the input's order because the randomness is in the algorithm. Contrast with quicksort, which at each level does work proportional to *all* elements at that level and has $\log n$ levels; the "throw one side away" step is exactly where the logarithm disappears.

The worst case is still $O(n^2)$: an adversarial pivot sequence that removes one element per partition. Random pivots make that a probability event rather than an input property, the same argument as for [quicksort](/learn/algorithms/sorting-searching/comparison-sorts). With a *deterministic* pivot, the same killer-adversary attack applies, and if the data is untrusted, that matters.

## Duplicates: the three-way partition

Run the two-way partition above on an array of 10⁶ identical values. `a[j] < pivot` is never true, so `i` stays at `lo` and the pivot is swapped into position `lo`; `p = lo`. If `k > lo`, the range shrinks by exactly one element. The next partition does the same. Selecting the median of an all-equal array costs `n + (n−1) + … + n/2 ≈ 3n²/8` comparisons: for 10⁶ elements, about 4 × 10¹¹, which is minutes in C and hours in Python. Equal keys are not exotic: timestamps at second resolution, HTTP status codes, quantised scores.

The fix is a **three-way partition** (Dijkstra's Dutch national flag): one pass produces `[< pivot | == pivot | > pivot]`. If `k` falls inside the equal band, the answer is the pivot and the search ends immediately; an all-equal array is selected in one linear pass.

```viz
{"type": "array", "algorithm": "dutch-flag", "values": [1, 2, 0, 2, 1, 0, 2, 1, 0], "title": "Three-way partition: 0 = below the pivot, 1 = equal, 2 = above", "caption": "lo, mid and hi pointers keep the invariant [0,lo) < pivot, [lo,mid) == pivot, (hi,n) > pivot. Elements equal to the pivot are never moved again."}
```

```python
def partition3(a, lo, hi, pivot):
    """Return (lt, gt): a[lo:lt] < pivot, a[lt:gt+1] == pivot, a[gt+1:hi+1] > pivot."""
    lt, i, gt = lo, lo, hi
    while i <= gt:
        if a[i] < pivot:
            a[lt], a[i] = a[i], a[lt]; lt += 1; i += 1
        elif a[i] > pivot:
            a[i], a[gt] = a[gt], a[i]; gt -= 1        # i stays: the swapped-in value is unexamined
        else:
            i += 1
    return lt, gt
```

In quickselect, after `lt, gt = partition3(...)`: if `lt <= k <= gt` return `pivot`; if `k < lt` keep `[lo, lt−1]`; else keep `[gt+1, hi]`. Every partition now removes at least the pivot's whole equivalence class, so duplicates can only help.

## Median of medians: guaranteed linear time

In 1973 Blum, Floyd, Pratt, Rivest and Tarjan showed how to pick a pivot that is *guaranteed* to be reasonably central, making selection worst-case $O(n)$. The pivot rule:

1. Split the array into groups of 5.
2. Sort each group (at most 7 comparisons each) and take its median, giving `n/5` medians.
3. Recursively select the median of those medians. That is the pivot.

Trace it on 15 elements, `[12, 3, 7, 25, 1, 18, 9, 30, 4, 22, 15, 6, 28, 11, 19]`:

| group | elements | sorted | median |
|---|---|---|---|
| 1 | `12, 3, 7, 25, 1` | `1, 3, 7, 12, 25` | 7 |
| 2 | `18, 9, 30, 4, 22` | `4, 9, 18, 22, 30` | 18 |
| 3 | `15, 6, 28, 11, 19` | `6, 11, 15, 19, 28` | 15 |

The medians are `[7, 18, 15]`; their median, found recursively, is **15**. Now count what the guarantee promises. At least half of the three groups (two of them, groups 1 and 3) have a median `<= 15`, and in each such group the median and the two elements below it are `<= 15`: that is `2 × 3 = 6` elements guaranteed at or below the pivot, and symmetrically `6` guaranteed at or above (groups 2 and 3 contribute `18, 22, 30` and `15, 19, 28`). Actual counts on this array: 9 elements `<= 15` and 7 elements `>= 15` (15 counted in both); 15 sits at sorted index 8 of 15, dead centre here, though the guarantee only promised it would avoid the outer 30%. Partition around 15 and the recursion continues on at most 8 elements instead of 14.

In general at least half of the `n/5` group medians are `<=` the pivot, and each such median has two more elements in its group that are `<=` it, so at least `3 · (n/10) = 3n/10` elements are `<=` the pivot. Symmetrically, at least `3n/10` are `>=` it. The pivot is therefore never in the outer 30% of the data, and the recursion after partitioning is on at most `7n/10` elements.

### Solving the recurrence

`T(n) <= T(n/5) + T(7n/10) + cn`: the first term finds the median of medians, the second is the surviving side, and `cn` covers grouping, sorting the groups and partitioning. Guess `T(n) <= 10cn` and check by substitution, assuming it holds for all smaller sizes:

$$T(n) \le 10c \cdot \tfrac{n}{5} + 10c \cdot \tfrac{7n}{10} + cn = 2cn + 7cn + cn = 10cn.$$

The guess is consistent, so `T(n) = O(n)`. The thing that made it work is `1/5 + 7/10 = 9/10 < 1`: the recursive calls together process less than the whole input, so the geometric series converges. With groups of 3 the pivot is still central (at least `n/3` on each side, so the surviving side is at most `2n/3`), but the recursive call on the medians is `n/3`, and `1/3 + 2/3 = 1`. Try the same substitution: `T(n) <= 10cn/3 + 20cn/3 + cn = 11cn`, which exceeds the guess, and no linear guess works; the recurrence solves to $\Theta(n \log n)$. Five is the smallest odd group size for which the fractions sum to less than 1. [Recurrences](/learn/foundations/complexity/recurrences-and-master-theorem) has the general technique; this recurrence is the one the master theorem does not cover, because the two subproblems have different sizes.

So why does almost nobody use it? The constant. Sorting groups of five, recursing for the pivot, then partitioning costs several times the comparisons of a random-pivot partition (implementations land in the range of 10–20 comparisons per element against quickselect's 2–3.4), and on real hardware a randomised quickselect beats median of medians by a wide margin on every input that is not adversarial. It is a proof that selection is in $O(n)$ worst case, and the interview answer is exactly that sentence: "median of medians makes selection worst-case linear; the constant is much worse than random pivots, so libraries use introselect to get both."

**Introselect** is the hybrid: run quickselect, and if the number of partitions exceeds a bound (typically a small multiple of `log₂ n`), switch to a guaranteed method for the rest. Which guaranteed method depends on the library, and the section on what the libraries do lists who does what.

## Heap, quickselect or sort for the k largest

The other classic route to the k-th largest is a **min-heap of size k**: push each element, pop the minimum whenever the heap exceeds `k`, and after the pass the heap holds the `k` largest with the k-th largest at the root.

```viz
{"type": "heap", "algorithm": "top-k", "values": [3, 2, 1, 5, 6, 4, 9, 7], "k": 3, "kind": "min", "title": "Top 3 with a min-heap of size 3", "caption": "The root is the smallest of the k largest seen so far; anything smaller than it is rejected in O(1)."}
```

| | Quickselect | Min-heap of size k | Full sort |
|---|---|---|---|
| Time | $O(n)$ expected | $O(n \log k)$ | $O(n \log n)$ |
| Extra space | $O(1)$ (in place) | $O(k)$ | $O(n)$ (Timsort) or $O(\log n)$ (in-place quicksort) |
| Needs the whole array in memory | yes | **no**: works on a stream | yes |
| Returns the k largest in sorted order | no (one side, unordered) | yes, with $O(k \log k)$ to drain | yes |
| Mutates input | yes | no | in place, or copies |
| Worst case | $O(n^2)$ without introselect | $O(n \log k)$ always | $O(n \log n)$ always |
| Sweet spot | `k` a constant fraction of `n` | `k ≪ n`, or streaming | you need the order anyway |

The choice depends on two questions. **Is `k` small relative to `n`?** For `k = 10`, `log k` is about 3 and the heap's rejection test (`x <= root`, no heap operation at all) filters most elements in one comparison; the heap wins or ties, and it has better constants than a partition. For `k = n/2`, `log k` is about 20 and the heap does roughly `20n` operations against quickselect's `3.4n`. **Is the data streaming?** A stream of 10⁹ events cannot be partitioned in place; a heap of size `k` needs `k` slots and one pass. Top-k over a stream is the heap, full stop ([top-k and k-way merge](/learn/data-structures/heaps/top-k-and-k-way-merge)).

For [k-closest-points](/practice/k-closest-points) the interviewer expects you to present both and choose on those two axes; for [kth-largest-array](/practice/kth-largest-array) they usually want quickselect written out and the heap mentioned.

## Median of two sorted arrays

One more selection problem is asked often enough to name: the median of two sorted arrays in $O(\log(\min(m, n)))$ ([median-two-sorted](/practice/median-two-sorted)). It is not quickselect; it is [binary search](/learn/algorithms/sorting-searching/binary-search) over how many elements of the smaller array go into the left half of the merged order.

Take `A = [1, 3, 8]` and `B = [7, 9, 10, 11]`, seven elements, so the left half has `half = (7 + 1) // 2 = 4`. Cut `A` after `i` elements and `B` after `j = half − i`; the cut is correct when every element left of both cuts is `<=` every element right of both: `A[i−1] <= B[j]` and `B[j−1] <= A[i]` (missing elements count as `±∞`). If `A[i−1] > B[j]`, too much of `A` is on the left, so move `i` down; if `B[j−1] > A[i]`, move `i` up. That predicate is monotone in `i`, which is what makes it a binary search.

| `lo` | `hi` | `i` | `j` | `A[i−1]`, `A[i]` | `B[j−1]`, `B[j]` | check | decision |
|---|---|---|---|---|---|---|---|
| 0 | 3 | 1 | 3 | 1, 3 | 10, 11 | `B[2]=10 > A[1]=3` | `B` gives too much: `lo = 2` |
| 2 | 3 | 2 | 2 | 3, 8 | 9, 10 | `B[1]=9 > A[2]=8` | `lo = 3` |
| 3 | 3 | 3 | 1 | 8, ∞ | 7, 9 | `8 <= 9` and `7 <= ∞` | valid cut |

Left half `{1, 3, 8, 7}`, right half `{9, 10, 11}`; with an odd total the median is the largest on the left, `max(8, 7) = 8`. Merged, the arrays are `[1, 3, 7, 8, 9, 10, 11]` and the middle is 8. For an even total the median averages `max(left)` and `min(right)`. Search the *shorter* array so that `j` never goes out of range, and treat `i = 0` and `i = m` as legal cuts with infinities. It is the hardest common binary search and you should attempt it after this module.

## Under the hood: what the libraries do

Your language almost certainly has selection built in, and knowing what it does tells you what it costs. These descriptions are of current releases and can change.

- **Python `statistics.median`** calls `sorted(data)` and indexes the middle: $O(n \log n)$ and a full copy. `median_low` and `median_high` do the same. There is no quickselect in the standard library.
- **Python `heapq.nlargest(k, it)` / `nsmallest`** keep a heap of size `k` decorated with a sequence number for stability, $O(n \log k)$. The implementation switches to `sorted(it)[:k]` when `k` is at least the input size, and the docs say to use `max`/`min` when `k == 1`. Each decorated entry is a 2-tuple, so memory is a few tens of bytes per kept element, not per input element.
- **NumPy `np.partition(a, kth)`** is introselect: median-of-3 pivots, and if the number of partitions exceeds a depth limit it switches to median of medians (of 5) for the pivot, so it is worst-case linear. `np.median` calls `partition` with `kth = [n//2 − 1, n//2]` for even `n` and averages the two, so a median of 10⁸ floats is two selections, not a sort. `np.percentile` is the same machinery.
- **C++ `std::nth_element`** in libstdc++ is introselect with depth limit `2·log₂ n`, but its fallback is *heap select* (build a heap of the prefix, sift the rest through it), which is $O(n \log n)$ worst case rather than linear. libc++'s version is a median-of-3 quickselect without a depth-limit fallback and has known quadratic inputs. The standard only promises linear *average* time.
- **Rust `slice::select_nth_unstable`** is quickselect with a depth limit whose fallback is median of medians, so it is worst-case linear (a guarantee added in recent releases; older versions were average-case only).
- **Go** has nothing in the standard library; write quickselect or use `container/heap`.
- **Floyd–Rivest** is the fewer-comparisons variant: sample $\sqrt{n}$-ish elements, select two pivots from the sample that bracket the target rank with high probability, and partition once. Expected comparisons `n + min(k, n−k) + O(√n log n)`, about `1.5n` for the median against quickselect's `3.39n`. It is what you would reach for if selection were the hot loop.

### Sketches for streams

The production version of the streaming question is different again. **Exact** selection needs either the whole array (quickselect) or `O(k)` memory for the top `k` (heap). A *percentile* of a stream of 10⁹ latencies needs neither if you accept a bounded error: **quantile sketches** (t-digest, KLL, GK) keep a few hundred weighted centroids per series, a few kilobytes, and answer p99 with a rank error around 1% and much better accuracy in the tails, which is where p99 lives. Every monitoring system (Prometheus histograms, Datadog's distributions, the `PERCENTILE_APPROX` functions in warehouses) makes that trade on your behalf; the exact answer is a batch job over stored samples. The same idea, bounded memory for bounded error, is what [Count-Min sketch and HyperLogLog](/learn/advanced-data-structures/probabilistic-structures/count-min-sketch-and-hyperloglog) do for frequencies and cardinalities.

## Quantified costs

- **Comparisons for the median of `n`:** sort, about `n log₂ n` (`2.7 × 10⁹` for `n = 10⁸`); quickselect, about `3.4n` (`3.4 × 10⁸`); Floyd–Rivest, about `1.5n`; median of medians, of the order of `10n–20n`. The ratio sort : quickselect grows with `n` and is around 8 at `10⁸`.
- **Heap of size `k` on `n` items:** `n` comparisons against the root plus `O(log k)` per accepted element; with random data the root rejects all but about `k ln(n/k)` elements, so for `k = 100`, `n = 10⁷` the heap does roughly `10⁷ + 1,200 × 7` operations, which is a single pass.
- **Memory:** quickselect `O(1)` extra but mutates; heap `k` slots; sort `n` slots for Timsort's merge buffer in the worst case; sketch a few KB regardless of `n`.
- **The quadratic cliff:** deterministic pivot on sorted input, or two-way partition on all-equal input, costs about `n²/2` to `3n²/8` comparisons: `10⁶` elements become `4 × 10¹¹` operations, minutes to hours.

## Failure modes

**A request pins a CPU for minutes.** Symptom: p99 of a ranking endpoint jumps from milliseconds to minutes on specific payloads; a profile shows all the time in `partition`. Diagnosis: quickselect with a deterministic pivot (first, last or middle element) on data a client controls; sorted or reverse-sorted input, or a crafted "median-of-3 killer" sequence, makes every partition remove one element. Fix: random pivot, or introselect; and treat any $O(n^2)$ worst case on untrusted input as a denial-of-service bug, not a performance nit.

**Selecting the median of a column of identical timestamps takes hours.** Symptom: a job that is fast on varied data hangs on a batch where every value is the same. Diagnosis: two-way partition with strict `<`, so every partition strips one element; the all-equal input is the worst case regardless of pivot choice. Fix: three-way partition, which finishes an all-equal array in one pass.

**The k-th largest is consistently one element off.** Symptom: unit tests with distinct values pass for `k = 1`, fail for `k = 2` by returning the wrong neighbour. Diagnosis: 1-based `k` used as a 0-based index, or "k-th largest" translated to index `k` instead of `n − k`. Fix: convert once at the API boundary into a named `target_index`, and test `k = 1`, `k = n` and `k = n/2` explicitly.

**`RecursionError` on large sorted inputs only.** Symptom: a recursive quickselect passes every test and crashes in production on a pre-sorted feed. Diagnosis: with bad pivots the recursion depth is $O(n)$, past CPython's default limit of 1,000. Fix: the iterative loop above (tail-call the surviving side), plus random pivots.

**A later `bisect` on the same list returns garbage.** Symptom: unrelated code that searched a sorted list starts returning wrong indices after the selection feature shipped. Diagnosis: quickselect mutates its input, and the caller's list was shared. Fix: copy before selecting (`list(a)`), or document the mutation in the function's name and contract as `np.partition` (returns a copy) versus `ndarray.partition` (in place) do.

## Interviewer follow-ups

**"The data is a stream of unknown length and you have 1 MB of memory. Find the 100 largest values."** Model answer: a min-heap of 100 entries; each incoming value is compared with the root and rejected in $O(1)$ unless it is larger; $O(n \log 100)$ time, 100 slots of memory. Common wrong answer: buffer everything and run quickselect, which needs the whole stream in memory.

**"Exact median of 10¹⁰ 8-byte integers on a machine with 16 GB of RAM."** Model answer: the data is 80 GB, so it does not fit; make one pass counting values by their top 16 bits (65,536 counters), find the bucket containing rank `n/2`, then a second pass keeping only that bucket's values (on average `10¹⁰ / 65,536 ≈ 150,000` values, trivially in memory) and quickselect within it; two passes over the file. Common wrong answer: an external merge sort, which works but does $O(n \log n)$ work and several passes; or a sketch, when the question said exact.

**"Now return the k smallest in sorted order."** Model answer: quickselect to place the k-th element, then sort the prefix: $O(n + k \log k)$; or the heap at $O(n \log k)$ if streaming. Common wrong answer: sort everything, $O(n \log n)$, or claim quickselect leaves the prefix sorted (it does not).

**"Median of medians is linear. Why does NumPy not use it from the start?"** Model answer: its constant is several times worse than a random pivot's, so introselect runs quickselect and only falls back when a depth limit is hit, getting the average of one and the guarantee of the other. Common wrong answer: "median of medians is approximate", which confuses it with the median-of-3 heuristic.

**"Median of two sorted arrays of sizes `m` and `n` in better than $O(m + n)$."** Model answer: binary search the number of elements taken from the shorter array into the left half; the cut is valid when the last-left of each array is `<=` the first-right of the other; $O(\log \min(m, n))$. Common wrong answer: merge until the middle, which is $O(m + n)$ and is what the interviewer is trying to move you past.

## What mid-level engineers get wrong

- **Sorting to get one order statistic.** Consequence: `log₂ n` times more work, about 27× at `n = 10⁸`, plus a full copy.
- **Two-way partition on data with many duplicates.** Consequence: quadratic time on the most boring input imaginable, an all-equal column.
- **Deterministic pivots on untrusted data.** Consequence: a CPU-exhaustion attack that a sorted payload triggers.
- **A heap for the median.** Consequence: `k = n/2` makes it $O(n \log n)$ with a heap of half the data, worse than sorting in constants and no better in complexity.
- **"k-th largest" mapped to index `k`.** Consequence: off-by-one results that only show on `k > 1`.
- **Assuming `nth_element` guarantees linear time.** Consequence: a plan that relies on a worst-case bound the C++ standard never promised.
- **Mutating a shared array.** Consequence: corruption that shows up in a different module.

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

- You know selection is $O(n)$ expected and can explain **why** the logarithm vanishes: only one side of the partition is ever revisited, so the work is a geometric series; you can quote roughly `3.4n` comparisons for a median with random pivots.
- You trace a **Lomuto partition** by hand, state its invariant, and know that an all-equal array makes the two-way version quadratic and a **three-way partition** fixes it.
- You can sketch **median of medians** (groups of 5, `3n/10` guarantee, `1/5 + 7/10 < 1`), solve its recurrence by substitution, say why groups of 3 fail, and say honestly that libraries use it only as a fallback.
- You choose between **quickselect, a size-k heap and a sort** on `k` relative to `n`, streaming, and whether the order is needed.
- You know what `statistics.median`, `heapq.nlargest`, `np.partition`, `std::nth_element` and `select_nth_unstable` do, including which of them guarantee a linear worst case.
- You know that exact percentiles of a stream need memory proportional to the data, and that monitoring systems use **quantile sketches** with a few KB per series instead.
- You can explain the median-of-two-sorted-arrays cut condition and trace the binary search on a concrete pair.

## Check yourself

```quiz
- q: >-
    Quickselect with random pivots is expected O(n) while quicksort is expected O(n log n). What accounts for the difference?
  options: ["Its random pivot guarantees an even split every time", "Its partition does fewer comparisons per element scanned", "Quicksort must also keep equal keys in their input order", "One-sided recursion makes the work a geometric series"]
  answer: 3
  explanation: >-
    Both use the same partition. Sorting must process every element at every recursion level, n per level times log n levels; selection discards the side that cannot contain index k, and the surviving sizes shrink geometrically: n + 3n/4 + ... A random pivot guarantees nothing about any single split; it only makes good splits likely, which is why the bound is expected.
- q: >-
    Median of medians uses groups of 5. Why not groups of 3?
  options: ["Fractions 1/3 + 2/3 sum to 1, so it becomes O(n log n)", "The pivot is no longer guaranteed to avoid the outer 30%", "Sorting groups of 3 costs more comparisons per element", "The recursion on n/3 medians makes it O(n²) worst case"]
  answer: 0
  explanation: >-
    The linear bound needs the two recursive fractions to sum to less than 1. With groups of 5 they are 1/5 + 7/10 = 9/10; with groups of 3 they are 1/3 + 2/3 = 1, and the recurrence solves to n log n, not n². The pivot is still central (at least n/3 on each side); the problem is that the recursive call on the n/3 medians is too large.
- q: >-
    You need the 20 largest scores from a stream of 500 million events that does not fit in memory. The right approach is:
  options: ["Median of medians: O(n) worst case, no bad pivots", "A max-heap of all events: O(n) build, then pop 20", "Quickselect for rank 20: O(n) expected, O(1) extra space", "A min-heap of size 20: O(n log 20) time, O(20) space"]
  answer: 3
  explanation: >-
    Quickselect, median of medians and a heap of all events need the whole data set in memory, which is exactly what you do not have. A bounded min-heap does one pass with constant memory and rejects most elements with a single comparison against the root.
- q: >-
    A colleague uses quickselect with the first element as pivot on data received from external clients. What is the risk?
  options: ["Crafted input can make it return the wrong element", "Duplicate values in the input can make it never finish", "Its expected O(n) becomes O(n log n) on any input", "Crafted input can force O(n²) time and exhaust the CPU"]
  answer: 3
  explanation: >-
    Deterministic pivots have inputs that force the worst case, where every partition removes one element, and an adversary who controls the data can supply one: a CPU-exhaustion attack. Correctness is not affected either way, and it always terminates. Random pivots or introselect remove the attack.
- q: >-
    Which statement about std::nth_element (or NumPy's np.partition) is accurate?
  options: ["It sorts the prefix up to k and leaves the rest alone", "It moves the k largest elements to the front, sorted", "It is O(n log n), since it is built on a heap sort", "It places the k-th element and leaves both sides unsorted"]
  answer: 3
  explanation: >-
    nth_element is a partition-based selection (introselect), linear on average. The k-th element lands in its sorted position with smaller elements before and larger after, but the two sides are otherwise unordered; that is what makes it linear. Sorting any part of it, prefix or top k, would cost more.
- q: >-
    Selecting the median of one million identical values with the two-way Lomuto partition (strict less-than) and random pivots takes minutes. Why?
  options: ["Every partition strips one element, so the work is quadratic", "Random pivots repeat, so the same partition is redone many times", "Equal keys break the invariant and the loop restarts from lo", "The comparisons are all ties, which the CPU cannot branch-predict"]
  answer: 0
  explanation: >-
    With no element strictly less than the pivot, i never advances, the pivot lands at lo, and the range shrinks by exactly one each time: about 3n²/8 comparisons, some 4 × 10¹¹ for a million elements, whatever pivot is chosen. A three-way partition puts the whole equal band in place in one pass and stops. The invariant is intact and branch prediction is not the issue.
```
