---
slug: comparison-sorts
title: "Comparison sorts: insertion, merge, quick and heap"
description: How the four comparison sorts move data, why quicksort beats merge sort in practice despite the worse worst case, and what stability and memory really cost.
minutes: 40
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

Trace `[5, 2, 4, 6, 1, 3]`: inserting 2 shifts 5 (1 move), inserting 4 shifts 5 (1 move), 6 shifts nothing, 1 shifts 6, 5, 4, 2 (4 moves), 3 shifts 6, 5, 4 (3 moves). Nine moves in all. The number of moves equals the number of **inversions**, pairs `(i, j)` with `i < j` and `a[i] > a[j]`. A random permutation has about `n²/4` inversions, so insertion sort is $\Theta(n^2)$ on average. A nearly-sorted array has few inversions, so it is $O(n + \text{inversions})$, which is close to linear.

That second property is why insertion sort is not a toy. Every production sort switches to it for small subarrays (typically below 16–32 elements) because its inner loop is a tight sequence of compares and moves over memory that is already in cache, with no recursion and no allocation. For `n = 10`, it beats quicksort.

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

The recurrence is `T(n) = 2T(n/2) + Θ(n)`, which the [master theorem](/learn/foundations/complexity/recurrences-and-master-theorem) solves as $\Theta(n \log n)$. The important word is *theta*: merge sort does the same work on every input. Sorted, reversed, random, all-equal; it does not care, because the split never looks at the values.

The cost is memory. The merge step needs somewhere to write its output that is not the input, so a straightforward merge sort allocates $O(n)$ extra space. In-place merging exists but is slow enough that nobody uses it; the practical trick is a single auxiliary buffer of size `n/2` reused at every level, which is what Timsort does.

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

| j | a[j] | ≤ 6? | i after | array |
|---|---|---|---|---|
| 0 | 3 | yes | 0 | `[3, 8, 2, 5, 1, 4, 7, 6]` |
| 1 | 8 | no | 0 | unchanged |
| 2 | 2 | yes | 1 | `[3, 2, 8, 5, 1, 4, 7, 6]` |
| 3 | 5 | yes | 2 | `[3, 2, 5, 8, 1, 4, 7, 6]` |
| 4 | 1 | yes | 3 | `[3, 2, 5, 1, 8, 4, 7, 6]` |
| 5 | 4 | yes | 4 | `[3, 2, 5, 1, 4, 8, 7, 6]` |
| 6 | 7 | no | 4 | unchanged |

Final swap puts the pivot at index 5: `[3, 2, 5, 1, 4, 6, 7, 8]`. Everything left of 6 is smaller, everything right is larger, and 6 is exactly where it will be in the sorted output.

Lomuto is easy to get right and easy to explain at a whiteboard. It has two weaknesses. It does `n - 1` comparisons and up to `n - 1` swaps per pass even when many elements are already on the correct side, and it is quadratic on arrays of **equal keys**: every element is `<= pivot`, so `i` walks all the way to the end and the pivot lands at the last position, splitting `n` elements into `n - 1` and `0`.

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

Hoare does about three times fewer swaps on average than Lomuto and, because both inner loops stop on elements *equal* to the pivot, equal keys get swapped across the middle and the split stays balanced. The price is subtlety: the pivot does not end up in a known position, so the recursion is `quicksort(lo, j)` and `quicksort(j + 1, hi)`, not `j - 1` and `j + 1`, and getting that wrong produces either an infinite loop or a lost element. If an interviewer asks you to write quicksort, write Lomuto and *say* Hoare exists and why it is better.

### Three-way partition

When duplicates are common the right tool is a three-way (Dutch national flag) partition into `< pivot`, `== pivot`, `> pivot`, which then recurses only on the outer two regions. With `k` distinct keys quicksort becomes $O(n \log k)$; on an array of a single repeated value it is linear.

### Pivot choice and the O(n²) adversary

Quicksort is $O(n \log n)$ *expected* and $O(n^2)$ worst case, and the gap between those is entirely about the pivot. If the pivot is always the smallest or largest element, each partition peels off one element and the recursion depth is `n`: `T(n) = T(n-1) + n = Θ(n²)`. With a first-element pivot, that happens on sorted input, which is not exotic; it is the most common input in the world.

The fixes, in increasing order of paranoia:

- **Middle element.** Defeats sorted and reversed input, but there are still fixed permutations that trigger the worst case.
- **Median of three** (first, middle, last). Cheap and good on real data; still beatable by a crafted input.
- **Random pivot.** Now no fixed input is bad; only an unlucky sequence of random choices is, and the probability of the depth exceeding `c log n` shrinks exponentially in `c`.
- **Introsort.** Track the recursion depth; if it exceeds `2 log₂ n`, switch to heap sort for that subarray. This guarantees $O(n \log n)$ worst case while keeping quicksort's speed on the common path. C++ `std::sort` has done this since the late 1990s.

The adversary is real. In 1999 McIlroy published "A Killer Adversary for Quicksort", a procedure that, given any quicksort with a deterministic pivot rule, produces an input that makes it quadratic by answering comparisons lazily. If you sort attacker-controlled data with a deterministic pivot, you have handed them a CPU-exhaustion attack, for the same reason unsalted hash tables hand them a [HashDoS attack](/learn/data-structures/hashing/hash-tables).

## Heap sort: a priority queue in disguise

Build a max-heap over the array in $O(n)$ (sift down from the last internal node), then repeatedly swap the root with the last element, shrink the heap by one, and sift the new root down. Each extraction is $O(\log n)$, so the whole sort is $O(n \log n)$ in every case, and it uses $O(1)$ extra space.

```viz
{"type": "heap", "algorithm": "heap-sort", "values": [4, 10, 3, 5, 1, 8], "kind": "max", "title": "Heap sort", "caption": "The maximum is swapped to the end and the heap shrinks; the sorted suffix grows."}
```

On paper heap sort is the best of both worlds: merge sort's worst-case guarantee and quicksort's memory. In practice it is the slowest of the three on large inputs, usually by a factor of two or more, and the reason is worth understanding because it applies to everything you build. Sift-down touches `a[i]`, then `a[2i+1]`, then `a[4i+3]`: the addresses double each step, so after the first few levels every comparison is a cache miss. Quicksort's partition and merge sort's merge stream through memory sequentially, and the hardware prefetcher keeps them fed. Heap sort survives as the fallback inside introsort and in situations where a hard $O(n \log n)$ bound with no allocation is worth more than speed. See [binary heap mechanics](/learn/data-structures/heaps/binary-heap-mechanics) for the heap itself.

## Stability: sorting by two keys

A sort is stable if elements that compare equal keep their input order. Insertion and merge sort are stable when written with the right inequality; quicksort and heap sort are not, because partitioning and sifting move elements long distances past their equals.

Stability matters whenever you sort by one key after another. To order the events from the opening paragraph by timestamp, then by arrival within a timestamp, you sort by arrival first (or leave them in arrival order) and then run a *stable* sort by timestamp. With an unstable sort you would have to build a composite key `(timestamp, arrival)` and compare both, which costs more comparisons and more memory for the key. Python's `sort`, Java's `Collections.sort`, JavaScript's `Array.prototype.sort` (since ES2019) and Rust's `sort` are all stable for exactly this reason; Rust's `sort_unstable`, C++ `std::sort` and Go's `sort.Slice` are not, and they say so in the name or the docs because it is a contract users depend on.

If you ever need a stable sort out of an unstable one, append the original index as a tiebreaker. That is the universal fallback and it costs one integer per element.

## Putting the four side by side

| Sort | Best | Average | Worst | Extra space | Stable | Why you would pick it |
|---|---|---|---|---|---|---|
| Insertion | $O(n)$ | $O(n^2)$ | $O(n^2)$ | $O(1)$ | yes | Tiny arrays, nearly-sorted data, base case of everything else |
| Merge | $O(n \log n)$ | $O(n \log n)$ | $O(n \log n)$ | $O(n)$ | yes | Stability, linked lists, external sorting, predictable time |
| Quick | $O(n \log n)$ | $O(n \log n)$ | $O(n^2)$ | $O(\log n)$ stack | no | Fastest in practice on arrays; in-place |
| Heap | $O(n \log n)$ | $O(n \log n)$ | $O(n \log n)$ | $O(1)$ | no | Guaranteed bound with no allocation; introsort fallback |

Quicksort wins in practice because its inner loop is a sequential scan doing one compare and occasionally one swap, its data fits the cache, and it moves each element about `1.4 log₂ n` times versus merge sort's `log₂ n` copies *plus* a full write of the output buffer at each level. The constant factor is smaller by around 2 in careful measurements, and merge sort's allocation shows up on the profile too. The $O(n^2)$ worst case is handled by pivot randomisation or introsort, not by avoiding quicksort.

The honest caveat: this is about arrays. On a linked list, merge sort wins outright because it needs no random access and no auxiliary array, and the "cache locality" argument does not apply because a linked list has none to begin with.

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

- You say which **partition scheme** you are writing and why: Lomuto for clarity, Hoare for fewer swaps and duplicate-friendliness, three-way when keys repeat.
- You know quicksort's $O(n^2)$ is a **pivot-choice** problem, that sorted input triggers it under a naive rule, and that random pivots or introsort remove it; you can name the adversary attack on deterministic pivots.
- You explain why heap sort loses in practice using **cache behaviour**, not big-O.
- You treat **stability** as a contract: you know which of your language's sorts are stable and you use it instead of building composite keys.
- You know every real sort switches to **insertion sort** below a small threshold and can say why that helps.
- You reach for merge sort on **linked lists** and for external sorting, and for quicksort on arrays, without hesitation.

## Check yourself

```quiz
- q: >-
    You sort a list of 1,000,000 records by department, then by salary, and expect records with equal salary to remain grouped by department. Which sort makes that work without a composite key?
  options: ["A stable sort, such as merge sort or Timsort", "Quicksort with a random pivot to avoid bias", "Any comparison sort that runs in O(n log n)", "An in-place sort, such as heap sort or introsort"]
  answer: 0
  explanation: >-
    Only a stable sort preserves the department grouping among equal salaries. Running time says nothing about stability, a random pivot does not help, and in-place is a different property: quicksort and heap sort both work in place yet move equal elements past each other, so the earlier ordering is destroyed.
- q: >-
    A quicksort using the first element as pivot is run on an already-sorted array of n elements. What happens?
  options: ["O(n²), since each partition peels off one element", "O(n log n), as the recursion depth stays log n", "It never terminates, since the left side stays empty", "O(n), because no element ever needs to move"]
  answer: 0
  explanation: >-
    The first element is the minimum, so the partition puts zero elements on the left and n-1 on the right. Recursion depth becomes n and total work is n + (n-1) + ... = O(n²). It does terminate, because the right side still shrinks by one each call, and "nothing moves" does not save the comparisons. Random or median-of-three pivots avoid this.
- q: >-
    Heap sort has an O(n log n) worst case and O(1) extra space, yet library sorts are built on quicksort or merge sort. The main reason is:
  options: ["Its instability rules it out for library use", "Sift-down's scattered accesses miss the cache", "Duplicate keys degrade it to quadratic time", "Building the initial heap costs O(n log n)"]
  answer: 1
  explanation: >-
    Heap sort's access pattern (i, 2i+1, 4i+3, ...) defeats the cache and the prefetcher; partition and merge scan sequentially, so heap sort's constant factor is much larger. Instability is true but merge sort's rival, quicksort, is unstable too. Heapify is O(n), and duplicates do not hurt heap sort's bound.
- q: >-
    Lomuto partition is run on an array where every element equals the pivot. The split it produces is:
  options: ["Undefined, since Lomuto requires distinct keys", "Balanced, with about n/2 elements on each side", "Three-way, with all n in the equal region", "Lopsided, with n-1 elements on one side and 0"]
  answer: 3
  explanation: >-
    Every element satisfies a[j] <= pivot, so i advances to the end and the pivot lands at the last index, leaving n-1 on one side and 0 on the other. The balanced split is what Hoare partition gives, since it swaps equal elements across the middle; the three-region split is what a separate three-way partition gives, handling this case in linear time.
- q: >-
    Which statement about merge sort's memory is correct?
  options: ["It sorts in place with O(1) extra space", "It needs only O(log n) space for the stack", "It needs O(n log n) space, one buffer per level", "It needs O(n) auxiliary space for merging"]
  answer: 3
  explanation: >-
    A straightforward merge needs an output area; a single reusable buffer of size n (or n/2 with care) suffices, so O(n), not one buffer per level. In-place merging exists but is impractically slow. The recursion stack is O(log n) on top of that buffer, not instead of it.
```
