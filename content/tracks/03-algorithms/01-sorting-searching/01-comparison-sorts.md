---
slug: comparison-sorts
title: "Comparison sorts: insertion, merge, quick and heap"
description: How the four comparison sorts move data, why quicksort beats merge sort on real hardware despite the worse worst case, and what stability and memory really cost.
minutes: 55
difficulty: medium
tags: [sorting, quicksort, merge-sort, heap-sort, insertion-sort, stability, partition]
problems: [sort-colors, kth-largest-array]
---
You have a list of 10 million events and need them in timestamp order, then within each timestamp in the order they arrived. You call `sort`. What runs? Whether that call finishes in a second or a minute, whether it needs another 80 MB of memory, and whether the "arrived in" order survives all depend on which algorithm sits behind the name.

Every comparison sort answers the same three questions differently: how it picks the next two elements to compare, how it moves data once it knows the answer, and what it costs in memory to do so. This lesson takes the four sorts that matter (insertion, merge, quick, heap), shows each one moving real numbers, and then explains why the one with the worst worst case is the one everybody uses.

## Insertion sort: the sort you already do by hand

Take the elements one at a time and slide each one leftwards until it sits behind something smaller or equal. After processing `i` elements, the prefix `a[0..i]` is sorted; that is the loop invariant.

```viz
{"type": "array", "algorithm": "insertion-sort", "values": [5, 2, 4, 6, 1, 3], "title": "Insertion sort", "caption": "Each element walks left past larger neighbours into the sorted prefix."}
```

```python
def insertion_sort(a):
    for i in range(1, len(a)):
        x = a[i]
        j = i - 1
        while j >= 0 and a[j] > x:   # strict >, so equal keys keep their order
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = x
    return a
```

Trace `[5, 2, 4, 6, 1, 3]`, showing the array after each element is inserted:

| i | x | shifts | array after |
|---|---|---|---|
| 1 | 2 | 5 moves right (1) | `[2, 5, 4, 6, 1, 3]` |
| 2 | 4 | 5 moves right (1) | `[2, 4, 5, 6, 1, 3]` |
| 3 | 6 | none (0) | `[2, 4, 5, 6, 1, 3]` |
| 4 | 1 | 6, 5, 4, 2 move right (4) | `[1, 2, 4, 5, 6, 3]` |
| 5 | 3 | 6, 5, 4 move right (3) | `[1, 2, 3, 4, 5, 6]` |

Nine moves in all. The number of moves equals the number of **inversions**, pairs `(i, j)` with `i < j` and `a[i] > a[j]`: each shift removes exactly one inversion. A random permutation has `n(n-1)/4` inversions on average (each pair is inverted with probability ½), so insertion sort is $\Theta(n^2)$ on average, about `n²/4` comparisons and `n²/4` moves. A nearly-sorted array has few inversions, so it is $O(n + \text{inversions})$, close to linear.

**Why the invariant makes it correct.** Before iteration `i`, `a[0..i)` is sorted. The inner loop shifts every element greater than `x` one slot right and stops at the first element `<= x` (or at the left end), so `x` lands after everything `<= x` and before everything `> x`: `a[0..i]` is sorted. After the last iteration the whole array is. Because the loop uses strict `>`, an element equal to `x` is never moved past it, which is what makes the sort stable.

That second property is why insertion sort is not a toy. Every production sort switches to it for small subarrays (the cutoff sits between about 8 and 32 elements depending on the library and element size) because its inner loop is a tight sequence of compares and moves over memory already in cache, with no recursion and no allocation. At `n = 16` the `n²/4 = 64` moves cost less than the bookkeeping of a partition or a merge.

## Merge sort: split, sort halves, merge

Split the array in the middle, sort each half recursively, then merge the two sorted halves by repeatedly taking the smaller head.

```viz
{"type": "array", "algorithm": "merge-sort", "values": [38, 27, 43, 3, 9, 82, 10], "title": "Merge sort", "caption": "Halves are sorted independently, then merged in one linear pass."}
```

```python
def merge_sort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    left, right = merge_sort(a[:mid]), merge_sort(a[mid:])
    out, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:        # <= keeps merge sort stable
            out.append(left[i]); i += 1
        else:
            out.append(right[j]); j += 1
    out.extend(left[i:]); out.extend(right[j:])
    return out
```

### The merge, step by step

For `[38, 27, 43, 3, 9, 82, 10]` the split is `[38, 27, 43]` and `[3, 9, 82, 10]`, which the recursive calls return as `left = [27, 38, 43]` and `right = [3, 9, 10, 82]`. The final merge:

| compare | take | out |
|---|---|---|
| 27 vs 3 | 3 | `[3]` |
| 27 vs 9 | 9 | `[3, 9]` |
| 27 vs 10 | 10 | `[3, 9, 10]` |
| 27 vs 82 | 27 | `[3, 9, 10, 27]` |
| 38 vs 82 | 38 | `[3, 9, 10, 27, 38]` |
| 43 vs 82 | 43 | `[3, 9, 10, 27, 38, 43]` |
| left empty | copy 82 | `[3, 9, 10, 27, 38, 43, 82]` |

Six comparisons to merge seven elements; a merge of `m + n` elements never needs more than `m + n − 1`. The invariant: `out` is sorted and every element in it is `<=` both current heads. Each step appends the smaller head, which is `<=` everything still unconsumed on either side because both sides are sorted; when one side runs out, the rest of the other is already `>=` everything in `out` and is copied without comparing.

The recurrence is `T(n) = 2T(n/2) + Θ(n)`, which the [master theorem](/learn/foundations/complexity/recurrences-and-master-theorem) solves as $\Theta(n \log n)$. The important word is *theta*: merge sort does the same work on every input. Sorted, reversed, random, all-equal; it does not care, because the split never looks at the values. The exact worst-case comparison count is $n\lceil\log_2 n\rceil - 2^{\lceil\log_2 n\rceil} + 1$, which for `n = 8` is `24 − 8 + 1 = 17`.

The cost is memory. The merge step needs somewhere to write its output that is not the input, so a straightforward merge sort allocates $O(n)$ extra space. In-place merging exists but is slow enough that nobody uses it; the practical trick is a single auxiliary buffer of size `n/2` reused at every level: copy the shorter half out, then merge back into the original array from the left. That is what Timsort does.

Merge sort's second selling point is that it is naturally **stable**: when `left[i] == right[j]`, taking from `left` first keeps equal elements in their original order. Change `<=` to `<` and stability is gone.

## Quicksort: partition, then recurse on both sides

Pick a pivot, rearrange the array so everything less than the pivot is on its left and everything greater is on its right, then recurse on the two sides. The work is in the partition; the recursion is bookkeeping.

```viz
{"type": "array", "algorithm": "quick-sort", "values": [3, 8, 2, 5, 1, 4, 7, 6], "title": "Quicksort", "caption": "Partition around a pivot; the pivot lands in its final position and never moves again."}
```

### Lomuto partition

The simplest scheme uses the last element as pivot and sweeps one pointer `j` across the array while a second pointer `i` marks the end of the "less than or equal" region.

```python
def lomuto(a, lo, hi):
    pivot = a[hi]
    i = lo - 1
    for j in range(lo, hi):
        if a[j] <= pivot:
            i += 1
            a[i], a[j] = a[j], a[i]
    a[i + 1], a[hi] = a[hi], a[i + 1]
    return i + 1          # final index of the pivot
```

Trace on `[3, 8, 2, 5, 1, 4, 7, 6]`, pivot 6:

| j | a[j] | ≤ 6? | i after | array after the swap |
|---|---|---|---|---|
| 0 | 3 | yes | 0 | `[3, 8, 2, 5, 1, 4, 7, 6]` (swapped with itself) |
| 1 | 8 | no | 0 | unchanged |
| 2 | 2 | yes | 1 | `[3, 2, 8, 5, 1, 4, 7, 6]` |
| 3 | 5 | yes | 2 | `[3, 2, 5, 8, 1, 4, 7, 6]` |
| 4 | 1 | yes | 3 | `[3, 2, 5, 1, 8, 4, 7, 6]` |
| 5 | 4 | yes | 4 | `[3, 2, 5, 1, 4, 8, 7, 6]` |
| 6 | 7 | no | 4 | unchanged |

Final swap puts the pivot at index 5: `[3, 2, 5, 1, 4, 6, 7, 8]`. Everything left of 6 is smaller, everything right is larger, and 6 is exactly where it will be in the sorted output. Seven comparisons, five swaps plus the final one.

**The invariant.** At the top of each iteration the range is in four zones: `a[lo..i]` is `<= pivot`, `a[i+1..j-1]` is `> pivot`, `a[j..hi-1]` is unexamined, and `a[hi]` is the pivot. Initially `i = lo − 1` and `j = lo`, so the first two zones are empty and the invariant holds vacuously. If `a[j] > pivot`, advancing `j` grows the `>` zone by one. If `a[j] <= pivot`, incrementing `i` and swapping `a[i]` with `a[j]` moves the first element of the `>` zone to the end (it is still `>`) and puts `a[j]` at the end of the `<=` zone. At `j = hi` the unexamined zone is empty; the final swap moves the first `>` element to the end and the pivot to `i + 1`, between the two zones. Every recursive call is on a strictly shorter range, so the recursion terminates, and an array whose every element sits between its neighbours' final positions is sorted.

Lomuto is easy to get right and easy to explain at a whiteboard. It has two weaknesses. It does `n − 1` comparisons and up to `n − 1` swaps per pass even when many elements are already on the correct side, and it is quadratic on arrays of **equal keys**: every element is `<= pivot`, so `i` walks all the way to the end and the pivot lands at the last position, splitting `n` elements into `n − 1` and `0`.

### Hoare partition

Hoare's original scheme runs two pointers inwards from both ends, swapping when the left one finds something too big and the right one finds something too small.

```python
def hoare(a, lo, hi):
    pivot = a[(lo + hi) // 2]
    i, j = lo - 1, hi + 1
    while True:
        i += 1
        while a[i] < pivot: i += 1
        j -= 1
        while a[j] > pivot: j -= 1
        if i >= j:
            return j          # a[lo..j] <= pivot <= a[j+1..hi]; pivot is NOT fixed
        a[i], a[j] = a[j], a[i]
```

Trace on the same `[3, 8, 2, 5, 1, 4, 7, 6]`, pivot `a[3] = 5`:

| step | i stops at | j stops at | action | array after |
|---|---|---|---|---|
| 1 | 1 (`8 ≥ 5`) | 5 (`4 ≤ 5`) | swap | `[3, 4, 2, 5, 1, 8, 7, 6]` |
| 2 | 3 (`5 ≥ 5`) | 4 (`1 ≤ 5`) | swap | `[3, 4, 2, 1, 5, 8, 7, 6]` |
| 3 | 4 (`5 ≥ 5`) | 3 (`1 ≤ 5`) | `i >= j`, return 3 | unchanged |

Two swaps where Lomuto needed six, and the return value 3 says `a[0..3] = [3, 4, 2, 1]` is `<= 5` and `a[4..7] = [5, 8, 7, 6]` is `>= 5`. On random input Hoare does roughly a third as many swaps as Lomuto and, because both inner loops stop on elements *equal* to the pivot, equal keys get swapped across the middle and the split stays balanced. The price is subtlety: the pivot does not end up in a known position, so the recursion is `quicksort(lo, j)` and `quicksort(j + 1, hi)`, not `j − 1` and `j + 1`, and getting that wrong produces either an infinite loop or a lost element. If an interviewer asks you to write quicksort, write Lomuto and *say* Hoare exists and why it is better.

### Three-way partition

When duplicates are common the right tool is a three-way (Dutch national flag) partition into `< pivot`, `== pivot`, `> pivot`, which then recurses only on the outer two regions. With `k` distinct keys quicksort becomes $O(n \log k)$; on an array of a single repeated value it is linear. [Sort Colors](/practice/sort-colors) is one three-way partition with the pivot fixed at 1.

### Pivot choice and the O(n²) adversary

Quicksort is $O(n \log n)$ *expected* and $O(n^2)$ worst case, and the gap between those is entirely about the pivot. If the pivot is always the smallest or largest element, each partition peels off one element and the recursion depth is `n`: `T(n) = T(n−1) + n = Θ(n²)`. With a first-element pivot, that happens on sorted input, which is not exotic; it is the most common input in the world.

The fixes, in increasing order of paranoia:

- **Middle element.** Defeats sorted and reversed input, but there are still fixed permutations that trigger the worst case.
- **Median of three** (first, middle, last). Cheap and good on real data; still beatable by a crafted input.
- **Random pivot.** Now no fixed input is bad; only an unlucky sequence of random choices is, and the probability of the depth exceeding `c log n` shrinks exponentially in `c`.
- **Introsort.** Track the recursion depth; if it exceeds `2 log₂ n`, switch to heap sort for that subarray. This guarantees $O(n \log n)$ worst case while keeping quicksort's speed on the common path. C++ `std::sort` has done this since the late 1990s.

The adversary is real. In 1999 McIlroy published "A Killer Adversary for Quicksort", a procedure that, given any quicksort with a deterministic pivot rule, produces an input that makes it quadratic by answering comparisons lazily. Sorting attacker-controlled data with a deterministic pivot hands them a CPU-exhaustion attack, for the same reason unsalted hash tables hand them a [HashDoS attack](/learn/data-structures/hashing/hash-tables).

## Heap sort: a priority queue in disguise

Build a max-heap over the array in $O(n)$ (sift down from the last internal node), then repeatedly swap the root with the last element, shrink the heap by one, and sift the new root down. Each extraction is $O(\log n)$, so the whole sort is $O(n \log n)$ in every case, and it uses $O(1)$ extra space.

```viz
{"type": "heap", "algorithm": "heap-sort", "values": [4, 10, 3, 5, 1, 8], "kind": "max", "title": "Heap sort", "caption": "The maximum is swapped to the end and the heap shrinks; the sorted suffix grows."}
```

Trace the first phase on `[4, 10, 3, 5, 1, 8]` (`n = 6`, children of `i` at `2i+1` and `2i+2`, last internal node is index 2):

| step | action | array |
|---|---|---|
| sift 2 | 3 vs child 8: swap | `[4, 10, 8, 5, 1, 3]` |
| sift 1 | 10 vs children 5, 1: stays | unchanged |
| sift 0 | 4 vs children 10, 8: swap with 10; then 4 vs children 5, 1: swap with 5 | `[10, 5, 8, 4, 1, 3]` |
| extract | swap root with `a[5]`, heap size 5, sift 3 down: children 5, 8 → swap with 8 | `[8, 5, 3, 4, 1 · 10]` |
| extract | swap root with `a[4]`, heap size 4, sift 1 down: children 5, 3 → swap with 5; then children 4 → swap | `[5, 4, 3, 1 · 8, 10]` |

The heapify phase did three sifts for six elements, which is the $O(n)$ build: a node at height `h` sifts at most `h` levels and there are about `n / 2^{h+1}` nodes at that height, so the sum is `n · Σ h / 2^{h+1} < 2n` swaps. Each extraction then sifts through up to `log₂ n` levels, and each level costs **two** comparisons (pick the larger child, then compare it with the parent), so the sort phase does about `2 n log₂ n` comparisons. Floyd's variant sifts the hole all the way to a leaf first and then bubbles the element back up, cutting that to about `n log₂ n + O(n)`, and library heap sorts use it.

On paper heap sort is the best of both worlds: merge sort's worst-case guarantee and quicksort's memory. On real hardware it is the slowest of the three on large inputs, typically by a factor of two or more. Sift-down touches `a[i]`, then `a[2i+1]`, then `a[4i+3]`: the addresses double each step, so after the first few levels every comparison is a cache miss, while partition and merge stream through memory sequentially and the hardware prefetcher keeps them fed. Heap sort survives as the fallback inside introsort and wherever a hard $O(n \log n)$ bound with no allocation is worth more than speed. See [binary heap mechanics](/learn/data-structures/heaps/binary-heap-mechanics) for the heap itself.

## Counting the work: comparisons, moves and cache misses

Big-O hides the constants that decide which sort wins. These are the standard analyses (Knuth volume 3 and Sedgewick's quicksort papers) for `n` distinct random keys:

| Sort | Comparisons | Data moves | Access pattern |
|---|---|---|---|
| Insertion | `n²/4` | `n²/4` | sequential, cache-resident for small `n` |
| Merge | `n log₂ n − n + 1` (worst) | `n log₂ n` copies, plus the buffer | two sequential input streams, one output |
| Quick (random pivot) | `≈ 1.39 n log₂ n` (`2n ln n`) | `≈ 0.33 n log₂ n` swaps with Hoare | two sequential scans per partition |
| Heap | `≈ 2 n log₂ n` (`≈ n log₂ n` with Floyd's trick) | `≈ n log₂ n` swaps | addresses double each level: random after the first few levels |

For `n = 10⁷`, `log₂ n ≈ 23`: merge sort makes roughly 2.2 × 10⁸ comparisons, quicksort 3.2 × 10⁸, heap sort 4.6 × 10⁸. Quicksort does *more* comparisons than merge sort and still wins because comparing two integers in registers costs a cycle or less, while a DRAM miss costs about 100 ns.

Where the misses come from: an L1 data cache is 32–48 KB on current x86 and Arm cores, which is 4,000–6,000 8-byte keys. A heap of `10⁷` keys is 80 MB. The top 12 levels (`2¹² = 4,096` keys) stay hot; the remaining 11 levels of every sift-down are misses, so an extraction costs of the order of ten DRAM round trips, around a microsecond, and there are 10⁷ of them. Quicksort's partition touches elements in address order, so the prefetcher has the next line ready before the loop reaches it; the same 80 MB streams at bandwidth (of the order of 10 GB/s, about 10 ms per pass) rather than latency. That gap in access pattern, not the comparison count, is the factor of two to three you measure. The exact ratio depends on cache sizes, key width and whether the branch predictor can guess the comparisons; on random data it cannot, which is why the branchless partition in the next lesson matters.

The crossover with insertion sort follows from the same table. At `n = 16`, insertion sort's 64 moves and 64 comparisons sit within two cache lines with no calls; a quicksort call on 16 elements spends more than that on partition overhead and two recursive calls. Between roughly 8 and 32 elements the quadratic sort is faster, and that is where every library sets its cutoff.

## Memory: buffers and stack depth

Three different memory costs hide behind "extra space":

- **Merge sort** needs a buffer. The textbook version allocates `n` per level or `n` once; Timsort's merge copies the *shorter* run out (at most `n/2` elements) and merges back into place, so the buffer is bounded by `n/2` and usually much smaller.
- **Quicksort** needs a stack. Naive recursion on both sides has depth equal to the recursion tree's height: about `3 log₂ n` for random pivots (the tree is a random binary search tree, expected height about `4.3 ln n`), but `n` in the worst case, which for `n = 10⁶` overflows every default thread stack. The fix is to **recurse on the smaller side and loop on the larger**: the smaller side is at most `n/2`, so the depth is at most `log₂ n` regardless of pivot quality. The worst case is still $O(n^2)$ time, but it no longer crashes.
- **Heap sort** needs neither: the heap is the array and the sift-down is a loop.

```python
def quicksort(a):
    lo, hi = 0, len(a) - 1
    stack = []                              # explicit stack of (lo, hi) ranges
    while True:
        while hi - lo > 16:                 # insertion-sort cutoff
            p = lomuto(a, lo, hi)           # or hoare, with the range fix
            if p - lo < hi - p:             # left side smaller: push the larger right side
                stack.append((p + 1, hi)); hi = p - 1
            else:
                stack.append((lo, p - 1)); lo = p + 1
        insertion_sort_range(a, lo, hi)
        if not stack:
            return a
        lo, hi = stack.pop()
```

The stack holds at most `log₂ n` ranges because every push is for the larger side while the loop continues into the smaller one, and the smaller side halves the range at least. `insertion_sort_range` is the earlier insertion sort restricted to `[lo, hi]`.

## Stability: sorting by two keys

A sort is stable if elements that compare equal keep their input order. Insertion and merge sort are stable when written with the right inequality; quicksort and heap sort are not, because partitioning and sifting move elements long distances past their equals.

Stability matters whenever you sort by one key after another. To order the events from the opening paragraph by timestamp, then by arrival within a timestamp, you sort by arrival first (or leave them in arrival order) and then run a *stable* sort by timestamp. With an unstable sort you would have to build a composite key `(timestamp, arrival)` and compare both, which costs more comparisons and more memory for the key. Python's `sort`, Java's `Collections.sort`, JavaScript's `Array.prototype.sort` (since ES2019) and Rust's `sort` are all stable for exactly this reason; Rust's `sort_unstable`, C++ `std::sort` and Go's `sort.Slice` are not, and they say so in the name or the docs because it is a contract users depend on.

If you ever need a stable sort out of an unstable one, append the original index as a tiebreaker. That is the universal fallback and it costs one integer per element.

## Under the hood: what a library quicksort looks like

Nobody ships the twelve-line quicksort. libstdc++'s `std::sort` is introsort: median-of-three pivot, a Hoare-style partition, a depth limit of `2·⌊log₂ n⌋` after which the range is heap-sorted, and a cutoff of 16 elements below which the range is *left unsorted*; one final insertion-sort pass over the whole array finishes the job, linear because every element is within 16 slots of its place. libc++ and the Rust and Go unstable sorts are variants of the same design with the pattern-defeating additions covered in the [next lesson](/learn/algorithms/sorting-searching/non-comparison-sorts-and-lower-bounds).

CPython's `list.sort` is a merge sort (Timsort), but what decides your call's cost is the comparison. Every `a < b` on arbitrary objects goes through `PyObject_RichCompare`, which dispatches on both types, and that dispatch dominates. Since Python 3.7 the sort starts with a pre-pass that checks whether every element has the same exact type; if all are `int`, `str` or `float` it swaps in a specialised comparison that skips the dispatch, measured by its author as tens of percent up to roughly 2× faster depending on the type (treat it as an order of magnitude; it depends on version and key type). A list mixing `int` and `float` loses the fast path for the whole sort. The `key=` argument computes each key once, so `key=str.lower` costs `n` calls where a comparator via `cmp_to_key` costs `n log₂ n` calls, roughly 20× more at `n = 10⁶`.

V8's `Array.prototype.sort` used an unstable quicksort for arrays longer than 10 elements until V8 7.0 in 2018, when it switched to Timsort to meet ES2019's stability requirement. Code that relied on secondary order surviving a sort worked by accident in Firefox (stable for years) and broke in Chrome; that is the canonical example of why stability must be a stated contract.

## Putting the four side by side

| Sort | Best | Average | Worst | Extra space | Stable | Why you would pick it |
|---|---|---|---|---|---|---|
| Insertion | $O(n)$ | $O(n^2)$ | $O(n^2)$ | $O(1)$ | yes | Tiny arrays, nearly-sorted data, base case of everything else |
| Merge | $O(n \log n)$ | $O(n \log n)$ | $O(n \log n)$ | $O(n)$ | yes | Stability, linked lists, external sorting, predictable time |
| Quick | $O(n \log n)$ | $O(n \log n)$ | $O(n^2)$ | $O(\log n)$ stack | no | Fastest on arrays in memory; in-place |
| Heap | $O(n \log n)$ | $O(n \log n)$ | $O(n \log n)$ | $O(1)$ | no | Guaranteed bound with no allocation; introsort fallback |

Quicksort wins on arrays because its inner loop is a sequential scan doing one compare and occasionally one swap, and its working set streams through the cache. The $O(n^2)$ worst case is handled by pivot randomisation or introsort, not by avoiding quicksort.

The honest caveat: this is about arrays. On a linked list, merge sort wins outright because it needs no random access and no auxiliary array, and a linked list has no cache locality to lose. When the data does not fit in memory, merge sort is the only one of the four that works at all: sort runs that fit in RAM, write them out, then k-way merge them with a [heap](/learn/data-structures/heaps/binary-heap-mechanics) of run heads. Spark's shuffle and every database's `ORDER BY` on a large table do exactly that, spilling sorted runs to disk and merging.

## Failure modes

**A sort that took 2 s takes 20 minutes after a data change.** Symptom: CPU pegged in the sort, time growing with the square of the input. Diagnosis: a hand-written or legacy quicksort with a first- or last-element pivot, and the input changed from random to sorted (an export that started coming out of a database with `ORDER BY`, for instance); profile the recursion depth and it will be near `n`. Fix: a random or median-of-three pivot as a patch, the library sort as the real fix, three-way partitioning if keys repeat.

**Stack overflow or `RecursionError` inside a sort.** Symptom: a crash on a large or degenerate input, fine on small ones. Diagnosis: quicksort recursing on both partitions, so the depth equals the recursion tree height, which is `n` under a bad pivot sequence; CPython's default limit is 1,000 frames. Fix: recurse on the smaller side and loop on the larger (depth `<= log₂ n`), plus the introsort depth check so time is capped too.

**`Comparison method violates its general contract!`** Symptom: an intermittent `IllegalArgumentException` from Java's `Collections.sort`, only on some inputs. Diagnosis: the comparator is not a strict weak ordering, most often `return a.value - b.value` on ints that overflow, a `compare` that is not antisymmetric, or a field that changes during the sort. Timsort's merge invariants detect the inconsistency and throw; C++ `std::sort` with the same comparator reads outside the array (undefined behaviour); other libraries return a silently misordered list. Fix: `Integer.compare`, a comparator that reads no mutable state, and an explicit rule for NaN.

**Rows reorder after a runtime upgrade.** Symptom: a table sorted by one column shows rows within each group in a different order than last week, and no code changed. Diagnosis: the sort was unstable and the platform's algorithm changed, or the input order changed and the unstable sort exposed it. Fix: a composite key, or the stable sort with the secondary order documented as a contract.

## Interviewer follow-ups

**"You have 1 TB of records on a machine with 16 GB of RAM. How do you sort them?"** Model answer: external merge sort. Read chunks of about 10 GB, sort each in memory with the library sort, write ~100 sorted runs, then merge them in one pass with a min-heap of 100 run heads. Two full passes over the data; at 1 GB/s of disk bandwidth about 35 minutes, so the cost is I/O, not comparisons. Common wrong answer: "quicksort, it is the fastest", which needs random access to the whole array.

**"Your comparator calls a locale-aware collation that costs 2 µs. What changes?"** Model answer: comparisons now dominate, so use the sort with the fewest (merge sort or Timsort, `n log₂ n` rather than quicksort's `1.39 n log₂ n`), and better still precompute one sort key per element (`key=` in Python, ICU collation keys) so the expensive function runs `n` times instead of `n log n`. Common wrong answer: switching to a "faster" algorithm while keeping the comparator.

**"Why recurse on the smaller partition first?"** Model answer: the smaller side is at most half the range, so the stack depth is bounded by `log₂ n` even when the pivot is terrible; the larger side is handled by the loop. Common wrong answer: "for cache locality"; it is a stack-depth guarantee.

**"Is heap sort ever the right choice?"** Model answer: yes, when you need a hard $O(n \log n)$ bound with no allocation and no randomness: introsort's fallback, an embedded or real-time system, or extracting only the smallest `k` elements in $O(n + k \log n)$. Common wrong answer: "never, it is the slowest".

**"Can you sort faster than n log n?"** Model answer: not by comparing ([the lower bound](/learn/algorithms/sorting-searching/non-comparison-sorts-and-lower-bounds)); with integer keys of bounded width, radix sort does it in a few linear passes. Common wrong answer: "yes, with a hash table", which orders nothing.

## What mid-level engineers get wrong

- **Believing quicksort's O(n²) is theoretical.** A first-element pivot on sorted input hits it, and sorted input is the most common input there is: a 1000× slowdown that appears only on production data.
- **Reasoning about speed from the comparison count alone.** Heap sort has the better worst case and loses by 2–3× because of cache misses; the consequence is picking algorithms that benchmark badly.
- **Treating stability as a detail.** Two-key sorts silently break on an unstable sort; the bug appears after a runtime upgrade or a data change.
- **Writing a comparator that is not a strict weak order** (`a - b` on ints, a `<` that is not antisymmetric). Timsort throws, `std::sort` corrupts memory, other sorts return wrong output.
- **Recursing on both sides of the partition.** Works until the input is adversarial and the stack overflows.

## Exercises

```exercise
id: stable-merge-sort
title: Implement a stable merge sort
prompt: |
  Return a new sorted list from `nums` using merge sort. Do not use the
  built-in sort. Your merge must be stable: when the two heads are equal,
  take from the left half first (the tests cannot see stability on plain
  integers, but write it correctly anyway; the hidden tests include
  duplicates and negatives).
languages: [python, javascript]
entry: merge_sort
starter:
  python: |
    def merge_sort(nums):
        # your code here
        return nums
  javascript: |
    function merge_sort(nums) {
      // your code here
      return nums;
    }
tests:
  - args: [[5, 2, 4, 6, 1, 3]]
    expected: [1, 2, 3, 4, 5, 6]
  - args: [[]]
    expected: []
    label: empty input
  - args: [[1]]
    expected: [1]
    label: single element
  - args: [[3, 3, 1, -2, 3]]
    expected: [-2, 1, 3, 3, 3]
    label: duplicates and a negative
  - args: [[10, 9, 8, 7, 6, 5, 4, 3, 2, 1]]
    expected: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    hidden: true
    label: reversed
  - args: [[0, -1, 0, -1]]
    expected: [-1, -1, 0, 0]
    hidden: true
hints:
  - "Base case: a list of length 0 or 1 is already sorted."
  - "Merge with two indices i and j; append left[i] when left[i] <= right[j], otherwise right[j]; then append whatever is left over."
```

```exercise
id: lomuto-partition
title: Implement Lomuto partition
prompt: |
  Partition `nums` in place around its last element using the Lomuto
  scheme exactly as described in the lesson: sweep `j` from left to right,
  keep `i` as the end of the `<= pivot` region, swap when `nums[j] <= pivot`,
  and finally swap the pivot into position `i + 1`.

  Return `[p, nums]` where `p` is the pivot's final index and `nums` is the
  partitioned array. Because the scheme is deterministic, the tests check
  the exact array.
languages: [python, javascript]
entry: lomuto_partition
starter:
  python: |
    def lomuto_partition(nums):
        # your code here
        return [0, nums]
  javascript: |
    function lomuto_partition(nums) {
      // your code here
      return [0, nums];
    }
tests:
  - args: [[3, 8, 2, 5, 1, 4, 7, 6]]
    expected: [5, [3, 2, 5, 1, 4, 6, 7, 8]]
  - args: [[2, 1]]
    expected: [0, [1, 2]]
  - args: [[1]]
    expected: [0, [1]]
    label: single element
  - args: [[5, 5, 5]]
    expected: [2, [5, 5, 5]]
    label: all equal keys land the pivot at the end
  - args: [[9, 4, 7, 1]]
    expected: [0, [1, 4, 7, 9]]
    label: pivot is the minimum
  - args: [[4, 1, 3, 9, 7, 5]]
    expected: [3, [4, 1, 3, 5, 7, 9]]
    hidden: true
  - args: [[1, 2, 3, 4, 5]]
    expected: [4, [1, 2, 3, 4, 5]]
    hidden: true
    label: already sorted
hints:
  - "Start i at -1. For each j from 0 to len-2, if nums[j] <= pivot then increment i and swap nums[i] with nums[j]."
  - "After the loop, swap nums[i+1] with the last element and return i+1."
```

## Senior signals

- You say which **partition scheme** you are writing and why: Lomuto for clarity, Hoare for fewer swaps and duplicate-friendliness, three-way when keys repeat; and you can state Lomuto's four-zone invariant.
- You know quicksort's $O(n^2)$ is a **pivot-choice** problem, that sorted input triggers it under a naive rule, and that random pivots or introsort remove it; you can name the adversary attack on deterministic pivots.
- You explain why heap sort loses using **cache behaviour** and the comparison constants (`2 n log₂ n` versus `1.39 n log₂ n`), not big-O.
- You bound quicksort's stack at `log₂ n` by **recursing on the smaller side**, and you know why that matters on adversarial input.
- You treat **stability** as a contract: you know which of your language's sorts are stable and you use it instead of building composite keys.
- You know every real sort switches to **insertion sort** below a small threshold and can say why that helps.
- You reach for merge sort on **linked lists** and for external sorting, and for quicksort on arrays, without hesitation; and you know a comparator must be a **strict weak ordering** or the library sort may throw or corrupt.

## Check yourself

```quiz
- q: >-
    You sort a list of 1,000,000 records by department, then by salary, and expect records with equal salary to remain grouped by department. Which sort makes that work without a composite key?
  options: ["An in-place sort, such as heap sort or introsort", "Any comparison sort that runs in O(n log n)", "A stable sort, such as merge sort or Timsort", "Quicksort with a random pivot to avoid bias"]
  answer: 2
  explanation: >-
    Only a stable sort preserves the department grouping among equal salaries. Running time says nothing about stability, a random pivot does not help, and in-place is a different property: quicksort and heap sort both work in place yet move equal elements past each other, so the earlier ordering is destroyed.
- q: >-
    A quicksort using the first element as pivot is run on an already-sorted array of n elements. What happens?
  options: ["O(n), because no element ever needs to move", "O(n log n), as the recursion depth stays log n", "O(n²), since each partition peels off one element", "It never terminates, since the left side stays empty"]
  answer: 2
  explanation: >-
    The first element is the minimum, so the partition puts zero elements on the left and n-1 on the right. Recursion depth becomes n and total work is n + (n-1) + ... = O(n²). It does terminate, because the right side still shrinks by one each call, and "nothing moves" does not save the comparisons. Random or median-of-three pivots avoid this.
- q: >-
    Heap sort has an O(n log n) worst case and O(1) extra space, yet library sorts are built on quicksort or merge sort. The main reason is:
  options: ["Building the initial heap costs O(n log n)", "Duplicate keys degrade it to quadratic time", "Sift-down's scattered accesses miss the cache", "Its instability rules it out for library use"]
  answer: 2
  explanation: >-
    Heap sort's access pattern (i, 2i+1, 4i+3, ...) defeats the cache and the prefetcher; partition and merge scan sequentially, so heap sort's constant factor is much larger. Instability is true but merge sort's rival, quicksort, is unstable too. Heapify is O(n), and duplicates do not hurt heap sort's bound.
- q: >-
    Lomuto partition is run on an array where every element equals the pivot. The split it produces is:
  options: ["Three-way, with all n in the equal region", "Balanced, with about n/2 elements on each side", "Undefined, since Lomuto requires distinct keys", "Lopsided, with n-1 elements on one side and 0"]
  answer: 3
  explanation: >-
    Every element satisfies a[j] <= pivot, so i advances to the end and the pivot lands at the last index, leaving n-1 on one side and 0 on the other. The balanced split is what Hoare partition gives, since it swaps equal elements across the middle; the three-region split is what a separate three-way partition gives, handling this case in linear time.
- q: >-
    Which statement about merge sort's memory is correct?
  options: ["It needs O(n log n) space, one buffer per level", "It sorts in place with O(1) extra space", "It needs only O(log n) space for the stack", "It needs O(n) auxiliary space for merging"]
  answer: 3
  explanation: >-
    A straightforward merge needs an output area; a single reusable buffer of size n (or n/2 with care) suffices, so O(n), not one buffer per level. In-place merging exists but is impractically slow. The recursion stack is O(log n) on top of that buffer, not instead of it.
- q: >-
    A quicksort recurses on the smaller partition and loops on the larger one instead of recursing on both. What does this change?
  options: ["Worst-case time drops from O(n²) to O(n log n)", "Stack depth is capped at about log₂ n on any input", "Equal keys stop causing lopsided partitions", "The partition step no longer needs a pivot choice"]
  answer: 1
  explanation: >-
    The recursive call is always on a side of at most n/2 elements, so the depth of nested calls cannot exceed log₂ n, even with the worst pivot sequence. The time bound is unchanged (a bad pivot still costs O(n²); that is what introsort's depth limit fixes), the pivot rule is untouched, and equal keys are a partition-scheme issue, solved by three-way partitioning.
```
