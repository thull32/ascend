---
slug: binary-heap-mechanics
title: "Binary heap mechanics: an array that behaves like a tree"
description: The complete-tree array layout, sift-up and sift-down traced by hand, why heapify is O(n) and not O(n log n), what CPython, Java and Rust actually do inside push and pop, and heap sort as the payoff.
minutes: 55
difficulty: medium
tags: [heaps, priority-queue, heapify, heap-sort, complete-binary-tree]
problems: [kth-largest-array, last-stone-weight, kth-largest-stream]
---
You have a collection of items with priorities and you repeatedly need the most urgent one: the next timer to fire, the closest unvisited vertex, the smallest of a million log timestamps. A sorted array answers "smallest?" instantly but inserting a new item costs O(n) shifts. An unsorted array inserts in O(1) but finding the minimum is O(n). A balanced BST does both in O(log n) but pays for it with pointers, allocations and cache misses.

The binary heap does both in O(log n) with a plain array, no pointers, and a memory layout so regular that the CPU prefetcher handles it well. It gets there by relaxing the BST's total order to something far weaker: a parent is never larger than its children, and that is all. Nothing about siblings, nothing about cousins. Exactly enough order to know where the minimum is.

## The two invariants

A **binary min-heap** is an array that satisfies two conditions:

1. **Shape.** Read as a binary tree in level order, it is *complete*: every level is full except possibly the last, which is filled from left to right. Equivalently: there are no gaps in the array.
2. **Order.** For every index `i > 0`, `a[parent(i)] ≤ a[i]`. Every path from the root downward is non-decreasing.

With the level-order layout from the [tree fundamentals lesson](/learn/data-structures/trees/tree-fundamentals), the tree is implicit in the indices:

```text
parent(i) = (i - 1) // 2
left(i)   = 2i + 1
right(i)  = 2i + 2
```

```text
index:  0   1   2   3   4   5   6   7   8
value:  1   3   2   7   4   8   5   9   6

              1
           /     \
          3       2
         / \     / \
        7   4   8   5
       / \
      9   6
```

Check the order property: 3 ≥ 1, 2 ≥ 1, 7 ≥ 3, 4 ≥ 3, 8 ≥ 2, 5 ≥ 2, 9 ≥ 7, 6 ≥ 7? No: 6 < 7, so this is *not* a valid heap. Swap them and it is. That check, "compare each element with its parent", is the whole invariant, and it is worth keeping as a test helper: `all(a[(i - 1) // 2] <= a[i] for i in range(1, len(a)))`. Note that 4 < 8 and 5 < 7 across subtrees are fine; the array `[1, 3, 2, 6, 4, 8, 5, 9, 7]` is a valid heap and is nowhere near sorted.

The consequence of the order invariant: **the minimum is at index 0**. Reading it is O(1). Everything else about heaps is about how to remove it, or add a new element, while restoring both invariants in O(log n).

A **max-heap** flips the comparison. Everything below applies with `≤` and `≥` swapped; Python's `heapq` is min-only (negate values, or wrap them, to get a max-heap), Java's `PriorityQueue` is min by default with a comparator to flip, C++'s `priority_queue` and Rust's `BinaryHeap` are max by default.

## Push: append, then sift up

To insert, put the new element at the end of the array. The shape invariant holds (the array got one longer with no gaps). The order invariant may not: the new element could be smaller than its parent. So compare it with its parent and swap while it is smaller, walking up the tree. This is **sift up** (also bubble up, percolate up).

```python
def push(a, x):
    a.append(x)
    i = len(a) - 1
    while i > 0:
        p = (i - 1) // 2
        if a[p] <= a[i]:
            break
        a[p], a[i] = a[i], a[p]
        i = p
```

Trace six pushes onto an empty heap. Each row shows the array after the append and the swaps the sift performed, as `(from → to)` index pairs:

| Push | After append | Swaps | Result |
|---|---|---|---|
| 5 | `[5]` | none (root) | `[5]` |
| 3 | `[5, 3]` | 3 < 5 at parent 0: (1 → 0) | `[3, 5]` |
| 8 | `[3, 5, 8]` | parent of 2 is 0, 8 ≥ 3: none | `[3, 5, 8]` |
| 1 | `[3, 5, 8, 1]` | 1 < 5: (3 → 1); 1 < 3: (1 → 0) | `[1, 3, 8, 5]` |
| 9 | `[1, 3, 8, 5, 9]` | parent of 4 is 1, 9 ≥ 3: none | `[1, 3, 8, 5, 9]` |
| 2 | `[1, 3, 8, 5, 9, 2]` | parent of 5 is 2, 2 < 8: (5 → 2); 2 ≥ 1: stop | `[1, 3, 2, 5, 9, 8]` |

Six pushes, four swaps. Each step moves one level up, and the tree has ⌊log₂ n⌋ levels, so at most ⌊log₂ n⌋ swaps: O(log n). Most pushes stop after zero or one swap, because a random new element is unlikely to be smaller than most of its ancestors. Measured over 100,000 uniformly random pushes, the average is 1.27 swaps per push, independent of `n`; the *worst* case is strictly descending input, where every push climbs to the root, measured at 14.7 swaps per push for n = 100,000 (⌊log₂ n⌋ = 16). "Average O(1)" is a statement about random input, and an adversary or a sorted feed will hand you the worst case.

## Pop: replace with last, then sift down

To remove the minimum, you cannot delete index 0 directly: that leaves a hole at the root and breaks the shape. Instead, move the *last* element into index 0 (shape restored: one shorter, no gaps), then push it down to where it belongs. At each step, compare it with its two children; if either child is smaller, swap with the *smaller* child. Swapping with the smaller child is essential: the child that moves up becomes the parent of the other child, so it must be no larger than it.

```python
def pop(a):
    top = a[0]
    last = a.pop()
    if a:
        a[0] = last
        sift_down(a, 0, len(a))
    return top

def sift_down(a, i, n):
    while True:
        l, r, smallest = 2 * i + 1, 2 * i + 2, i
        if l < n and a[l] < a[smallest]:
            smallest = l
        if r < n and a[r] < a[smallest]:
            smallest = r
        if smallest == i:
            return
        a[i], a[smallest] = a[smallest], a[i]
        i = smallest
```

Again at most ⌊log₂ n⌋ levels, O(log n). Unlike push, pop almost always goes all the way down: the element you moved to the root came from the bottom level, where the large elements live. That observation is the basis of an optimisation every serious library uses (see "Under the hood").

```viz
{"type": "heap", "algorithm": "push-pop", "kind": "min", "values": [5, 3, 8, 1, 9, 2],
 "title": "Push and pop on a min-heap", "caption": "Each push appends and sifts up; each pop swaps the last element into the root and sifts it down, always toward the smaller child."}
```

Trace one pop on the corrected heap `[1, 3, 2, 6, 4, 8, 5, 9, 7]`. Return 1. Move 7 to index 0: `[7, 3, 2, 6, 4, 8, 5, 9]`. Children of 0 are 3 and 2; smaller is 2 at index 2; swap: `[2, 3, 7, 6, 4, 8, 5, 9]`. Children of index 2 are 8 (index 5) and 5 (index 6); smaller is 5; swap: `[2, 3, 5, 6, 4, 8, 7, 9]`. Index 6 has no children. Done: two levels, two comparisons per level plus the final check.

## Heapify: building a heap in O(n)

Given an arbitrary array of `n` elements, the obvious way to make it a heap is to push each element: `n` pushes of O(log n) each, O(n log n). There is a better way, and the analysis is a favourite interview question because the answer surprises people.

Every leaf is already a valid one-element heap. The leaves are the second half of the array (indices `n//2` to `n − 1`), because the last non-leaf is the parent of the last element, `(n − 1 − 1) // 2 = n//2 − 1`. So start at index `n//2 − 1` and walk *backwards* to 0, calling `sift_down` at each. When you reach a node, both of its subtrees are already heaps (they were processed earlier), so sifting it down produces a valid heap rooted there.

```python
def heapify(a):
    n = len(a)
    for i in range(n // 2 - 1, -1, -1):
        sift_down(a, i, n)
```

Trace it on `[9, 4, 7, 1, 8, 3, 6, 2, 5]` (n = 9, so the loop starts at index 3):

| i | Node | Children (index: value) | Action | Array after |
|---|---|---|---|---|
| 3 | 1 | 7: 2, 8: 5 | 1 is smallest, no swap | `[9, 4, 7, 1, 8, 3, 6, 2, 5]` |
| 2 | 7 | 5: 3, 6: 6 | swap with 3; index 5 has no children | `[9, 4, 3, 1, 8, 7, 6, 2, 5]` |
| 1 | 4 | 3: 1, 4: 8 | swap with 1; at index 3 children 2 and 5, swap with 2; index 7 is a leaf | `[9, 1, 3, 2, 8, 7, 6, 4, 5]` |
| 0 | 9 | 1: 1, 2: 3 | swap with 1; at index 1 children 2 and 8, swap with 2; at index 3 children 4 and 5, swap with 4; leaf | `[1, 2, 3, 4, 8, 7, 6, 9, 5]` |

Fourteen comparisons and six swaps for nine elements; check the result against the invariant and note that 5 at index 8 under 4 is fine.

```viz
{"type": "heap", "algorithm": "heapify", "kind": "min", "values": [9, 4, 7, 1, 8, 3, 6, 2, 5],
 "title": "Bottom-up heapify", "caption": "Leaves need no work. Each internal node, from the last to the root, sifts down into two subtrees that are already heaps."}
```

### Why heapify is O(n)

Sifting down from a node costs at most its *height*, not the tree's height. Half the nodes are leaves (height 0, cost 0). A quarter have height 1. An eighth have height 2. In general about `n / 2^(h+1)` nodes have height `h`, and the total work is

$$\sum_{h=0}^{\log n} \frac{n}{2^{h+1}} \cdot h \;\le\; n \sum_{h=0}^{\infty} \frac{h}{2^{h+1}} \;=\; n$$

The series `Σ h/2^(h+1)` converges to 1, so the whole heapify does at most about `n` swaps and `2n` comparisons in the worst case. Measured on 100,000 random floats: 1.88 comparisons and 0.74 swaps per element, against the bound of 2 and 1. The intuition: the expensive nodes near the root are few, and the numerous nodes near the leaves are cheap. Pushing one at a time is the opposite: the numerous late insertions each pay a cost that depends on their *depth*, which is the full height for the second half of the array.

This matters when you receive a batch of items and only then start extracting: `heapq.heapify` is O(n) while `heappush` in a loop is O(n log n). For a million elements the gap is small on random data (about 1.9 million comparisons against about 2.6 million) and a factor of ten on descending data (about 20 million swaps), which is exactly the data a batch job often produces.

## Heap sort

If you can extract the minimum in O(log n), you can sort: build a heap in O(n), then pop `n` times. O(n log n) total. The elegant version does it *in place* with a max-heap: after each pop, the extracted maximum goes exactly where the heap has shrunk from, the end of the array.

```python
def heap_sort(a):
    n = len(a)
    for i in range(n // 2 - 1, -1, -1):           # build a max-heap
        sift_down_max(a, i, n)
    for end in range(n - 1, 0, -1):
        a[0], a[end] = a[end], a[0]               # max to its final slot
        sift_down_max(a, 0, end)                  # heap is now a[0:end]
    return a
```

Trace on `[5, 2, 9, 1, 5, 6]`. Build the max-heap (loop from index 2): index 2 holds 9 with child 6, no swap; index 1 holds 2 with children 1 and 5, swap with 5 → `[5, 5, 9, 1, 2, 6]`; index 0 holds 5 with children 5 and 9, swap with 9, then at index 2 child 6 > 5, swap → `[9, 5, 6, 1, 2, 5]`. Now extract:

| end | Swap root and `a[end]` | Sift root down within `a[0:end]` | Heap prefix / sorted suffix |
|---|---|---|---|
| 5 | `[5, 5, 6, 1, 2, 9]` | 6 is the larger child, swap; index 2 has no child below 5 | `[6, 5, 5, 1, 2]` / `[9]` |
| 4 | `[2, 5, 5, 1, 6, 9]` | children 5 and 5, swap with the left; child 1 < 2, stop | `[5, 2, 5, 1]` / `[6, 9]` |
| 3 | `[1, 2, 5, 5, 6, 9]` | children 2 and 5, swap with 5; no children | `[5, 2, 1]` / `[5, 6, 9]` |
| 2 | `[1, 2, 5, 5, 6, 9]` | child 2 > 1, swap | `[2, 1]` / `[5, 5, 6, 9]` |
| 1 | `[1, 2, 5, 5, 6, 9]` | nothing to sift | `[1]` / `[2, 5, 5, 6, 9]` |

```viz
{"type": "heap", "algorithm": "heap-sort", "values": [5, 2, 9, 1, 5, 6],
 "title": "In-place heap sort", "caption": "The array is split into a shrinking max-heap prefix and a growing sorted suffix. Each step swaps the root to the boundary and sifts the new root down."}
```

### Why heap sort loses on real hardware

Heap sort is O(n log n) worst case, in place, and needs no recursion; on paper it dominates quicksort (O(n²) worst case) and merge sort (O(n) extra memory). On real hardware it is the slowest of the three, because every sift-down jumps between indices `i`, `2i + 1`, `2i + 2` that are far apart for large `i`: once the heap is larger than the L2 cache (typically 1–2 MiB per core, so around 10⁵ to 10⁶ eight-byte elements), the bottom levels of every sift are cache misses, while quicksort and merge sort scan sequentially and the prefetcher hides their latency. Ratios of two to four times slower than a tuned quicksort are typical for arrays of 10⁶ to 10⁷ integers, and the gap widens with `n`.

Where heap sort shows up in real code is as the *fallback* in introsort: quicksort until the recursion depth exceeds about 2·log₂ n (libstdc++'s `std::sort` uses exactly that limit), then heap sort on the remaining partition to guarantee O(n log n). Rust's `sort_unstable` (pattern-defeating quicksort, and its successor ipnsort since Rust 1.81) keeps the same escape hatch. Heap sort is also not stable: in the trace above the two 5s finished in swapped order relative to their input positions, because sifts jump.

## Under the hood: what the libraries actually do

### CPython heapq and the `_siftup` quirk

`heapq` is a module of functions over a plain `list`, with a pure-Python implementation in `Lib/heapq.py` and a C accelerator (`_heapq`) that replaces it at import time. Two things about it surprise people who read the source.

First, the names are backwards relative to this lesson. `heappush` appends and calls `_siftdown(heap, 0, len(heap) - 1)`, which moves the new element *up* toward index 0 (the name describes moving toward the start of the array). `heappop` calls `_siftup(heap, 0)`, which moves the hole *down*. Read the docstrings, not the names.

Second, `_siftup` does not do the sift-down you wrote above. It uses Floyd's bottom-up trick: it moves the hole all the way to a leaf, at each level choosing the smaller child with **one** comparison (child versus child) and never comparing against the new item; only when the hole reaches the bottom does it place the item there and call `_siftdown` to bubble it back up. The comment in the source explains the reasoning: the item that was moved to the root came from the last position, so it is usually large and would fail the "am I in place yet?" test at almost every level anyway; testing costs a comparison per level that is almost always wasted. Going straight to the bottom costs about log₂ n child-versus-child comparisons, and the bubble-up afterwards usually stops within one or two steps.

### Tracing `heappop`

Trace `heappop` on `[1, 2, 3, 4, 8, 7, 6, 9, 5]`. Pop the last element, 5, return `heap[0] = 1`, write 5 at index 0 and sift the hole down: children 2 and 3, 3 < 2 is false so the hole takes index 1 and 2 moves up; children 4 and 8 at indices 3 and 4, 8 < 4 is false so the hole takes index 3 and 4 moves up; index 3's only child is index 7 (9), which moves up and the hole is at index 7, a leaf. Now place 5 at index 7 and bubble up: parent is index 3 holding 9, 5 < 9 so swap; parent is index 1 holding 4, 5 < 4 is false, stop. Result `[2, 4, 3, 5, 8, 7, 6, 9]`, four comparisons. The classic sift-down needs five on this input, and the gap grows with `n`: measured over 100,000 pops from a heap of 100,000 random floats, the classic loop averages 28.3 comparisons per pop and the Floyd version 15.4, against log₂ n ≈ 16.6. Comparisons are what a Python heap pays for, because each one is a `__lt__` call through the interpreter, so the library halves the dominant cost.

Also in `heapq`: `heapreplace(h, x)` pops then pushes with a single sift, `heappushpop(h, x)` pushes then pops and short-circuits when `x` is already ≤ the root (no sift at all), `heapify` is the bottom-up loop from `n//2 − 1`, and `nlargest`/`nsmallest` keep a heap of size `k` with a tiebreak counter so they are stable, switching to a plain `sorted` when `k` is close to `n`.

### Java `PriorityQueue`

`java.util.PriorityQueue` is a min-heap over an `Object[] queue` with an initial capacity of 11. Growth doubles the array plus two while it is smaller than 64 elements and grows it by 50% afterwards, so an unbounded producer pays amortised O(1) per insert with roughly 1.5× over-allocation at the high end. `offer` is the append-and-sift-up you wrote; `poll` is the *classic* sift-down (compare with the smaller child, stop when in place), not Floyd's variant. The constructor from a `Collection` runs the O(n) bottom-up heapify. `remove(Object)` is a linear `indexOf` followed by an O(log n) `removeAt`, which is the O(n) trap this module's [last lesson](/learn/data-structures/heaps/indexed-heaps-and-decrease-key) is about. The iterator walks the array in index order, not priority order; code that iterates a `PriorityQueue` expecting sorted output is a recurring code-review finding. The class is not thread-safe; `PriorityBlockingQueue` wraps the same array in a lock.

### Rust `BinaryHeap`, C++ and Go

Rust's `std::collections::BinaryHeap<T>` is a max-heap over a `Vec<T>`. `push` sifts up; `pop` swaps the last element to the root and calls `sift_down_to_bottom`, which is Floyd's trick again, with a source comment saying it is faster because the element is known to be large. Both sifts use a `Hole` type that moves the element out once, shifts children up with plain writes, and writes the element back once, instead of three-way swaps at every level. `From<Vec<T>>` runs the O(n) rebuild, and `append` picks between rebuilding and pushing depending on the two sizes. `peek_mut` returns a guard that re-sifts the root on drop if you changed it: the one in-place priority change the API allows. `BinaryHeap<f64>` does not compile, because `f64` is not `Ord`, which is the language refusing to let a NaN corrupt your heap (see the failure modes).

C++'s `std::priority_queue` is an adapter over `std::vector` with `std::less`, so a max-heap; libstdc++'s `__adjust_heap`, used by `pop_heap` and `make_heap`, is also the go-to-the-leaf-then-push-up variant. Go's `container/heap` is a set of functions over your own type implementing `Less`, `Swap`, `Push` and `Pop`; `heap.Init` is the O(n) build, and `heap.Fix(h, i)` re-sifts index `i` in whichever direction it needs after you have changed its priority.

### Memory per element

A heap's memory is its array, and what the array holds decides the constant. Measured on CPython 3.14 (64-bit): a list slot is 8 bytes (an object pointer), an `int` outside the cached range −5 to 256 is 28 bytes, a `float` 24 bytes, a 2-tuple 64 bytes and a 3-tuple 72 bytes. A heap of a million `(priority, seq, item)` tuples with two integer fields is therefore about 8 + 72 + 28 + 28 = 136 bytes per entry before the payload, about 136 MB. The same heap in Rust as `Vec<(u64, u64, u32)>` is 24 bytes per entry, and in Java a `PriorityQueue<long[]>` is a 4-byte compressed reference plus a 32-byte two-element array object. The exact figures depend on the runtime version; the ratio, roughly five to one between CPython and a systems language, is stable.

## Cache behaviour and d-ary heaps

The `2i + 1` layout keeps the top of the heap dense: the first 12 levels are 4,095 elements, 32 KiB at 8 bytes each, which fits a typical 32–48 KiB L1 data cache. A sift on a million-element heap spends its first dozen levels in L1 and its last eight in L2, L3 or DRAM, so for large heaps the bottom levels dominate the cost. Two mitigations: keep entries small (8-byte keys, payloads in a separate array) so more levels fit per cache level; or raise the branching factor. A **d-ary heap** puts the children of `i` at `d·i + 1 … d·i + d`, so a 4-ary heap has four 8-byte children in one 32-byte span and height log₄ n instead of log₂ n (10 levels for a million elements instead of 20). Pop does `d` comparisons per level and sift-up one, so 4-ary heaps favour push-heavy workloads such as Dijkstra (about `E` pushes to `V` pops). Reported speed-ups of 4-ary over binary on such workloads are in the 20–30% range, depending on element size and cache sizes; measure your own. Go's runtime keeps timers in a 4-ary heap per processor for this reason.

## Costs and trade-offs

| Operation | Time | Notes |
|---|---|---|
| peek (min) | O(1) | index 0 |
| push | O(log n) worst, about 1.3 swaps average on random input | sift up |
| pop | O(log n) | sift down; almost always reaches the bottom |
| heapify from array | O(n) | under 2n comparisons, under n swaps |
| build by n pushes | O(n log n) worst | avoid when you have the batch up front |
| search for arbitrary element | O(n) | no ordering beyond parent–child |
| delete arbitrary element | O(n) to find, then O(log n) | needs an index map; see [indexed heaps](/learn/data-structures/heaps/indexed-heaps-and-decrease-key) |
| heap sort | O(n log n), in place, unstable | cache-unfriendly below the top levels |

Against the alternatives for the "push and pop-min" interface:

| Structure | push | pop-min | peek | find any key | memory per element | in-order iteration |
|---|---|---|---|---|---|---|
| Binary heap (array) | O(log n) | O(log n) | O(1) | O(n) | 1 slot | no |
| 4-ary heap | O(log₄ n), 1 compare per level | O(log₄ n), 4 compares per level | O(1) | O(n) | 1 slot | no |
| Sorted array | O(n) shifts | O(1) from the end | O(1) | O(log n) | 1 slot | yes |
| Unsorted array | O(1) | O(n) | O(n) | O(n) | 1 slot | no |
| Balanced BST | O(log n) plus allocation | O(log n) | O(log n), or O(1) cached | O(log n) | value plus 2–3 pointers plus header | yes |

The heap wins on constants: one contiguous array, no allocation per element, exactly `n` slots versus `n` nodes of value-plus-pointers. The BST wins only when you need something a heap cannot do: find an arbitrary element, iterate in order, find the successor, delete by key. If the interface is `push` and `pop_min`, the heap is the right structure. When every item is known up front and every item is needed in order, [sort](/learn/algorithms/sorting-searching/comparison-sorts) and do not build a heap at all.

## Production failure modes

**Pops return the wrong element after a "priority bump" feature ships.** Symptom: a scheduler occasionally runs a low-priority job ahead of a high-priority one; unit tests with one or two items pass. Diagnosis: some code path mutates an object's priority field while it sits in the heap, or the comparator reads a field that changes. The array is no longer a heap and nothing re-checks it. Confirm by asserting the parent-child invariant after each operation in a staging build; it fails at the first mutation. Fix: treat entries as immutable; push a new entry and discard the stale one on pop, or use an indexed heap that re-sifts (Go's `heap.Fix`, Rust's `peek_mut`).

**A queue that "sorts on insert" pegs a CPU as the backlog grows.** Symptom: throughput collapses when the queue backs up; a profile shows `list.sort`, `min()` or `Arrays.sort` inside the enqueue path. Diagnosis: O(n log n) or O(n) per operation instead of O(log n); at 10⁵ queued items that is 10⁵ times slower than a heap per insert. Fix: a heap, and `heapify` once if the initial batch arrives together.

**A NaN quietly corrupts the heap.** Symptom: a float-keyed heap (latencies, scores) starts returning non-minimal values with no exception. Diagnosis: every comparison with NaN is false, so a NaN never swaps and never stops anything from swapping; it sits wherever it landed and the sifts around it make locally wrong decisions that compound. Fix: reject NaN at push (`math.isnan`), or key on a total order (`float.total_cmp` in Rust, `Double.compare` in Java, which orders NaN last consistently).

**A hand-written sift that swaps with the left child "if it is smaller".** Symptom: intermittent out-of-order pops that only appear at certain sizes. Diagnosis: the sift compared with the left child only, or the heapify loop started at `n//2 − 2` and skipped a node; both leave a right child smaller than its parent. Fix: compare with both children and pick the smaller, and add a property test that pushes random values and checks that pops come out sorted; it finds this class of bug in seconds. (The tie-comparison `TypeError` on tuple entries is the fourth classic failure; the [next lesson](/learn/data-structures/heaps/priority-queues-in-practice) covers it.)

## Interviewer follow-ups

**"Each sift-down is O(log n) and heapify calls it n/2 times. Why is heapify O(n)?"** Model answer: the cost of a sift-down is the node's height, not the tree's height; half the nodes have height 0, a quarter height 1, and Σ n·h/2^(h+1) is bounded by n. Common wrong answer: "because on average the sifts stop early", which is an average-case claim; the O(n) bound is worst case.

**"Is a sorted array a heap? Is a heap sorted?"** Model answer: an ascending array satisfies both invariants, so it is a valid min-heap; the converse fails because siblings are unordered, and `[1, 3, 2]` is a heap that is not sorted. Common wrong answer: "a heap is sorted level by level", which is not what the invariant says.

**"How many comparisons does a pop cost, and can you do better than 2 log n?"** Model answer: the classic loop does two per level, about 2 log₂ n; Floyd's bottom-up variant sifts the hole to a leaf with one child-versus-child comparison per level and then bubbles up a step or two, so about log₂ n plus a constant, and CPython, Rust and libstdc++ all implement it. Common wrong answer: "one comparison per level, since you only compare with the smaller child", which forgets the comparison that finds the smaller child.

**"How do you find the k-th smallest element in a min-heap without destroying it?"** Model answer: a second min-heap of candidate indices seeded with the root; pop the smallest candidate, push its two children, repeat `k` times, O(k log k) and independent of `n`. Common wrong answer: "read index k − 1", which is only correct for a sorted array.

**"Can you merge two binary heaps faster than rebuilding?"** Model answer: no; concatenating and running heapify is O(n + m), and that is what Rust's `append` does when the sizes are comparable. Leftist, binomial and pairing heaps exist because they merge in O(log n). Common wrong answer: "push the smaller heap's elements one by one", which is O(m log(n + m)) and never better than the rebuild.

## What mid-level engineers get wrong

- **Iterating the heap array as if it were sorted.** Logs, dashboards and "peek at the next five" features print the array order; only index 0 is guaranteed. Consequence: wrong output that looks plausible.
- **Calling `heapq` functions on a list that is not a heap** (a list that was sorted descending, appended to directly, or had an element assigned). Consequence: silent garbage, because `heapq` never validates.
- **Removing from the middle with `list.remove(x)` and re-running `heapify`.** Consequence: O(n) per removal; a cancel-heavy workload becomes quadratic.
- **Building a size-k heap by pushing all n elements and popping n − k.** Consequence: O(n log n) time and O(n) memory instead of O(n log k) and O(k). The [top-k lesson](/learn/data-structures/heaps/top-k-and-k-way-merge) has the right loop.
- **Mixing up one-based and zero-based index arithmetic.** With one-based indices the children are `2i` and `2i + 1`; with zero-based they are `2i + 1` and `2i + 2`. Consequence: a heap that works for the first three elements and breaks at the fourth.
- **Peeking `heap[0]` on an empty list.** Consequence: `IndexError` in the one code path the tests did not cover.

## Exercises

```exercise
id: min-heap-class
title: Implement a binary min-heap
prompt: |
  Implement `MinHeap` over a plain array with `push(x)`, `pop()` (returns and
  removes the smallest element, or `None`/`null` if empty), `peek()` (the
  smallest without removing, or `None`/`null`), and `size()`.

  Use the level-order layout: children of index `i` at `2i + 1` and `2i + 2`.
  `push` appends and sifts up; `pop` moves the last element to the root and
  sifts down toward the **smaller** child.

  The tests replay a sequence of operations and compare the returned values.
languages: [python, javascript]
entry: MinHeap
starter:
  python: |
    class MinHeap:
        def __init__(self):
            self.a = []

        def push(self, x):
            pass

        def pop(self):
            return None

        def peek(self):
            return None

        def size(self):
            return len(self.a)
  javascript: |
    class MinHeap {
      constructor() { this.a = []; }
      push(x) {
      }
      pop() {
        return null;
      }
      peek() {
        return null;
      }
      size() { return this.a.length; }
    }
tests:
  - args: [["push", 5], ["push", 3], ["push", 8], ["peek"], ["pop"], ["pop"], ["size"], ["pop"], ["pop"]]
    expected: [null, null, null, 3, 3, 5, 1, 8, null]
  - args: [["pop"], ["peek"], ["size"]]
    expected: [null, null, 0]
    label: empty heap
  - args: [["push", 1], ["push", 1], ["push", 1], ["pop"], ["pop"], ["pop"], ["size"]]
    expected: [null, null, null, 1, 1, 1, 0]
    label: duplicates
  - args: [["push", 10], ["push", -2], ["push", 7], ["push", -9], ["push", 0], ["pop"], ["pop"], ["push", -1], ["pop"], ["pop"], ["pop"]]
    expected: [null, null, null, null, null, -9, -2, null, -1, 0, 7]
    label: negatives and interleaved pushes
  - args: [["push", 4], ["push", 2], ["push", 6], ["push", 1], ["push", 3], ["pop"], ["peek"], ["size"]]
    expected: [null, null, null, null, null, 1, 2, 4]
    hidden: true
hints:
  - "Sift up: while i > 0 and a[(i-1)//2] > a[i], swap and move to the parent."
  - "Sift down: pick the smaller existing child; stop when neither child is smaller. Handle the case where only a left child exists."
```

```exercise
id: heap-sort
title: In-place heap sort
prompt: |
  Sort `values` ascending and return the sorted list. Build a **max-heap**
  in place with bottom-up heapify (O(n)), then repeatedly swap the root to
  the end of the unsorted prefix and sift the new root down.

  Do not call the language's built-in sort.
languages: [python, javascript]
entry: heap_sort
starter:
  python: |
    def heap_sort(values):
        a = list(values)
        n = len(a)

        def sift_down(i, end):
            # restore the max-heap property for a[i] within a[:end]
            pass

        # heapify, then extract
        return a
  javascript: |
    function heap_sort(values) {
      const a = values.slice();
      const n = a.length;

      function sift_down(i, end) {
        // restore the max-heap property for a[i] within a[0..end)
      }

      // heapify, then extract
      return a;
    }
tests:
  - args: [[5, 2, 9, 1, 5, 6]]
    expected: [1, 2, 5, 5, 6, 9]
  - args: [[]]
    expected: []
    label: empty
  - args: [[1]]
    expected: [1]
  - args: [[3, 3, 3]]
    expected: [3, 3, 3]
    label: all equal
  - args: [[9, 8, 7, 6, 5, 4, 3, 2, 1]]
    expected: [1, 2, 3, 4, 5, 6, 7, 8, 9]
    label: reverse sorted
  - args: [[-1, -5, 0, 2, -5]]
    expected: [-5, -5, -1, 0, 2]
    hidden: true
hints:
  - "Heapify: for i from n//2 - 1 down to 0, sift_down(i, n)."
  - "Extract: for end from n-1 down to 1: swap a[0] and a[end], then sift_down(0, end)."
```

## Senior signals

- You describe a heap by its **two invariants** (complete shape, parent ≤ child) and you know the order is partial: siblings are unordered, which is why search is O(n) and why the array is never sorted.
- You can write sift-up and sift-down from the index arithmetic without looking anything up, including the "swap with the smaller child" detail and why it matters.
- You know **heapify is O(n)** and can sketch the series argument, and you use it instead of n pushes when the batch is available up front.
- You know the "average O(1) push" claim is about random input and that sorted input hits the log n worst case on every push.
- You know that CPython, Rust and libstdc++ sift the hole to a leaf and bubble back up (Floyd's trick), roughly halving comparisons per pop, and that Java's `PriorityQueue` does not.
- You know heap sort is O(n log n) in place and unstable, why it loses to quicksort once the heap outgrows the cache, and where it is actually used (introsort's fallback).
- You choose a heap over a balanced BST when the interface is push and pop-min, you can quote the memory per entry in each, and you can explain the d-ary heap's cache-line argument.

## Check yourself

```quiz
- q: >-
    Which of these arrays is a valid min-heap?
  options: ["[1, 2, 3, 0, 4, 5, 6]", "[1, 4, 3, 5, 2, 6, 7]", "[1, 3, 4, 5, 7, 2, 8]", "[2, 5, 3, 9, 6, 4, 8]"]
  answer: 3
  explanation: >-
    Check each index against its parent at (i-1)//2. In [2,5,3,9,6,4,8]: 5≥2, 3≥2, 9≥5, 6≥5, 4≥3, 8≥3; 5 sitting before 3 is fine because siblings are unordered. [1,4,3,5,2,6,7] has 2 at index 4 under 4 at index 1; [1,3,4,5,7,2,8] has 2 at index 5 under 4 at index 2; [1,2,3,0,4,5,6] has 0 at index 3 under 2.
- q: >-
    During sift-down you swap the node with its left child whenever the left child is smaller, without checking the right. What can go wrong?
  options: ["The shape breaks, because the array gains a gap at the end", "Nothing, because the right child is checked on the next pass", "A smaller right child ends up below a larger new parent", "It only slows down, costing an extra level of swaps per pop"]
  answer: 2
  explanation: >-
    The child moved up becomes the parent of the other child, so it must be the smaller of the two. Swapping with the larger child puts a bigger value above a smaller one, and the next iteration moves down away from the broken pair, so it is never revisited. Swaps never create gaps, so the shape is unaffected.
- q: >-
    Building a heap from 1,000,000 elements by calling push for each takes about how many element moves compared with bottom-up heapify?
  options: ["A million times more, since each push rescans the array", "Up to 20 times more, as each push climbs log₂ n levels", "Fewer, since push is O(1) on average for any input", "About the same, since both run n sift operations in total"]
  answer: 1
  explanation: >-
    Heapify is O(n): under about n swaps, because most sift-downs start near the leaves. Repeated push is O(n log n) worst case, with log2(10^6) ≈ 20. The average-case O(1) push applies to random input only; sorted-descending input makes every push climb to the root.
- q: >-
    CPython's heappop moves the hole all the way to a leaf, choosing the smaller child at each level, before bubbling the last element back up. Why does this beat the classic compare-with-both-children loop?
  options: ["It avoids the swap at each level by using a temporary hole", "It reads only the left child, halving the memory traffic", "It stops one level earlier because leaves need no comparison", "It skips the per-level test against an element that is usually large"]
  answer: 3
  explanation: >-
    The element moved to the root came from the bottom of the heap, so it is almost always larger than both children at every level; the classic loop spends a comparison per level confirming that. Floyd's variant uses one child-versus-child comparison per level and a short bubble-up afterwards, about log n plus a constant instead of 2 log n. The hole technique saves writes, not comparisons, and both children are still read.
- q: >-
    Why is heap sort typically slower than quicksort on real hardware despite the better worst-case bound?
  options: ["Its sift-downs jump across the array, defeating the cache", "It is not in place, so it copies the array into a heap", "It needs deep recursion, so call overhead dominates", "It makes asymptotically more comparisons than quicksort"]
  answer: 0
  explanation: >-
    Both are O(n log n) expected; heap sort's sift-down touches indices i, 2i+1, 2i+2 that spread across the array, so once the heap outgrows the cache each lower level of each sift is a likely miss. Quicksort's partition streams through memory. Heap sort is in place and iterative, so neither copying nor recursion is the cost.
- q: >-
    A float-keyed heap of latencies starts returning non-minimal values with no exception thrown. The most likely cause is:
  options: ["A NaN key, since every comparison with it is false", "Duplicate keys, which the sift cannot order", "The array outgrew the cache, so sifts lose precision", "Negative latencies, which a min-heap rejects"]
  answer: 0
  explanation: >-
    Comparisons involving NaN are all false, so a NaN never moves and never blocks a move; nearby sifts make locally wrong decisions that compound silently. Duplicates and negatives are ordered fine by a heap, and cache misses cost time, not correctness. Reject NaN at push or key on a total order such as total_cmp or Double.compare.
```
