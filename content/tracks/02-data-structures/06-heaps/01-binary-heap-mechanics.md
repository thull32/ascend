---
slug: binary-heap-mechanics
title: "Binary heap mechanics: an array that behaves like a tree"
description: The complete-tree array layout, sift-up and sift-down, why heapify is O(n) and not O(n log n), and heap sort as the payoff.
minutes: 40
difficulty: medium
tags: [heaps, priority-queue, heapify, heap-sort, complete-binary-tree]
problems: [kth-largest-array, last-stone-weight, kth-largest-stream]
---
You have a collection of items with priorities and you repeatedly need the most urgent one: the next timer to fire, the closest unvisited vertex, the smallest of a million log timestamps. A sorted array answers "smallest?" instantly but inserting a new item costs O(n) shifts. An unsorted array inserts in O(1) but finding the minimum is O(n). A balanced BST does both in O(log n) but pays for it with pointers, allocations and cache misses.

The binary heap does both in O(log n) with a plain array, no pointers, and a memory layout so regular that the CPU prefetcher loves it. It gets there by relaxing the BST's total order to something far weaker: a parent is never larger than its children, and that is all. Nothing about siblings, nothing about cousins. Just enough order to know where the minimum is.

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

Check the order property: 3 ≥ 1, 2 ≥ 1, 7 ≥ 3, 4 ≥ 3, 8 ≥ 2, 5 ≥ 2, 9 ≥ 7, 6 ≥ 7? No: 6 < 7, so this is *not* a valid heap. Swap them and it is. That kind of check, "compare each element with its parent", is the whole invariant; note that 4 < 8 and 5 < 7 across subtrees are perfectly fine.

The consequence of the order invariant: **the minimum is at index 0**. Reading it is O(1). Everything else about heaps is about how to remove it, or add a new element, while restoring both invariants in O(log n).

A **max-heap** flips the comparison. Everything below applies with `≤` and `≥` swapped; Python's `heapq` is min-only (negate values, or wrap them, to get a max-heap), Java's `PriorityQueue` is min by default with a comparator to flip, C++'s `priority_queue` and Rust's `BinaryHeap` are max by default.

## Push: append, then sift up

To insert, put the new element at the end of the array. The shape invariant holds (the array just got one longer with no gaps). The order invariant may not: the new element could be smaller than its parent. So compare it with its parent and swap while it is smaller, walking up the tree. This is **sift up** (also bubble up, percolate up).

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

Each step moves one level up, and the tree has ⌊log₂ n⌋ levels, so at most ⌊log₂ n⌋ swaps: O(log n). In practice most pushes stop after zero or one swap, because a random new element is unlikely to be smaller than most of its ancestors; the *average* number of swaps for random input is O(1).

## Pop: replace with last, then sift down

To remove the minimum, you cannot simply delete index 0: that leaves a hole at the root and breaks the shape. Instead, move the *last* element into index 0 (shape restored: one shorter, no gaps), then push it down to where it belongs. At each step, compare it with its two children; if either child is smaller, swap with the *smaller* child. Swapping with the smaller child is essential: the child that moves up becomes the parent of the other child, so it must be no larger than it.

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

Again at most ⌊log₂ n⌋ levels, O(log n). Unlike push, pop almost always goes all the way down: the element you moved to the root came from the bottom level, where the large elements live.

```viz
{"type": "heap", "algorithm": "push-pop", "kind": "min", "values": [5, 3, 8, 1, 9, 2],
 "title": "Push and pop on a min-heap", "caption": "Each push appends and sifts up; each pop swaps the last element into the root and sifts it down, always toward the smaller child."}
```

Trace one pop on the corrected heap `[1, 3, 2, 7, 4, 8, 5, 9, 6]` (with 6 and 7 swapped: `[1, 3, 2, 6, 4, 8, 5, 9, 7]`). Return 1. Move 7 to index 0: `[7, 3, 2, 6, 4, 8, 5, 9]`. Children of 0 are 3 and 2; smaller is 2 at index 2; swap: `[2, 3, 7, 6, 4, 8, 5, 9]`. Children of index 2 are 8 (index 5) and 5 (index 6); smaller is 5; swap: `[2, 3, 5, 6, 4, 8, 7, 9]`. Index 6 has no children. Done, three comparisons per level, two levels.

## Heapify: building a heap in O(n)

Given an arbitrary array of `n` elements, the obvious way to make it a heap is to push each element: `n` pushes of O(log n) each, O(n log n). There is a better way, and the analysis is a favourite interview question because the answer surprises people.

Observe that every leaf is already a valid one-element heap. The leaves are the second half of the array (indices `n//2` to `n − 1`), because the last non-leaf is the parent of the last element, `(n − 1 − 1) // 2 = n//2 − 1`. So start at index `n//2 − 1` and walk *backwards* to 0, calling `sift_down` at each. When you reach a node, both of its subtrees are already heaps (they were processed earlier), so sifting it down produces a valid heap rooted there.

```python
def heapify(a):
    n = len(a)
    for i in range(n // 2 - 1, -1, -1):
        sift_down(a, i, n)
```

```viz
{"type": "heap", "algorithm": "heapify", "kind": "min", "values": [9, 4, 7, 1, 8, 3, 6, 2, 5],
 "title": "Bottom-up heapify", "caption": "Leaves need no work. Each internal node, from the last to the root, sifts down into two subtrees that are already heaps."}
```

Why is this O(n) and not O(n log n)? Sifting down from a node costs at most its *height*, not the tree's height. Half the nodes are leaves (height 0, cost 0). A quarter have height 1. An eighth have height 2. In general about `n / 2^(h+1)` nodes have height `h`, and the total work is

$$\sum_{h=0}^{\log n} \frac{n}{2^{h+1}} \cdot h \;\le\; n \sum_{h=0}^{\infty} \frac{h}{2^{h+1}} \;=\; n$$

The series `Σ h/2^(h+1)` converges to 1, so the whole heapify does at most about `n` swaps and `2n` comparisons. The intuition: the expensive nodes near the root are few, and the numerous nodes near the leaves are cheap. Pushing one at a time is the opposite: the numerous late insertions each pay the full height.

In practice this matters when you receive a batch of items and only then start extracting. Python's `heapq.heapify` is O(n); calling `heappush` in a loop is O(n log n). Both are fast enough for a few thousand items, and heapify is measurably faster for a few million.

## Heap sort

If you can extract the minimum in O(log n), you can sort: build a heap in O(n), then pop `n` times. O(n log n) total. The elegant version does it *in place* with a max-heap: after each pop, the extracted maximum goes exactly where the heap just shrank from, the end of the array.

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

```viz
{"type": "heap", "algorithm": "heap-sort", "values": [5, 2, 9, 1, 5, 6],
 "title": "In-place heap sort", "caption": "The array is split into a shrinking max-heap prefix and a growing sorted suffix. Each step swaps the root to the boundary and sifts the new root down."}
```

Heap sort is O(n log n) worst case, in place, and needs no recursion; on paper it dominates quicksort (O(n²) worst case) and merge sort (O(n) extra memory). In practice it is the slowest of the three on typical hardware, because every sift-down jumps between indices `i`, `2i + 1`, `2i + 2` that are far apart for large `i`, and a million-element sort touches memory in a cache-hostile pattern. Quicksort and merge sort scan sequentially. Where heap sort shows up in real code is as the *fallback* in introsort (C++ `std::sort`, Rust's `sort_unstable`): quicksort until the recursion gets suspiciously deep, then switch to heap sort to guarantee O(n log n). It is also not stable: equal elements can change relative order, because sift operations jump.

## Complexity, and what the constants hide

| Operation | Time | Notes |
|---|---|---|
| peek (min) | O(1) | index 0 |
| push | O(log n) worst, O(1) average for random input | sift up |
| pop | O(log n) | sift down; almost always goes to the bottom |
| heapify from array | O(n) | bottom-up |
| build by n pushes | O(n log n) | avoid when you have the batch up front |
| search for arbitrary element | O(n) | no ordering beyond parent–child |
| delete arbitrary element | O(n) to find, then O(log n) | needs an index map; see [indexed heaps](/learn/data-structures/heaps/indexed-heaps-and-decrease-key) |
| heap sort | O(n log n), in place, unstable | cache-unfriendly |

The comparison a senior engineer makes is heap versus balanced BST. Both are O(log n) for insert and extract-min. The heap wins on constants: one contiguous array, no allocation per element, about 2 comparisons per level versus the BST's 1 comparison plus a pointer dereference per level, and a memory footprint of exactly `n` values versus `n` nodes of value-plus-two-pointers-plus-header. The BST wins only when you need something a heap cannot do: find an arbitrary element, iterate in order, find the successor, delete by key. If the interface is `push` and `pop_min`, the heap is the right structure, and reaching for a `TreeMap` is a signal that you do not know why heaps exist.

A last detail that bites in real implementations: the `2i + 1` layout means the children of index 0 are at 1 and 2, and the *right* child is in a different cache line from the left one only when `i` is large. A **d-ary heap** (each node has `d` children, at `d·i + 1 … d·i + d`) reduces the height to log_d n and puts all children in one cache line for `d = 4` or `8`. Pop becomes slightly more expensive (d comparisons per level) but push gets cheaper, and for Dijkstra-style workloads with many more pushes than pops, 4-ary heaps beat binary ones by 20–30% in benchmarks. Go's runtime timer heap is 4-ary for this reason.

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

- You describe a heap by its **two invariants** (complete shape, parent ≤ child) and you know the order is partial: siblings are unordered, which is why search is O(n).
- You can write sift-up and sift-down from the index arithmetic without looking anything up, including the "swap with the smaller child" detail and why it matters.
- You know **heapify is O(n)** and can sketch the series argument, and you use it instead of n pushes when the batch is available up front.
- You know heap sort is O(n log n) in place and unstable, why it loses to quicksort on real hardware, and where it is actually used (introsort's fallback).
- You choose a heap over a balanced BST when the interface is push and pop-min, and you can say what the BST buys you that the heap cannot do.
- You have heard of d-ary heaps and can explain the cache-line argument for them.

## Check yourself

```quiz
- q: >-
    Which of these arrays is a valid min-heap?
  options: ["[1, 4, 3, 5, 2, 6, 7]", "[2, 5, 3, 9, 6, 4, 8]", "[1, 3, 4, 5, 7, 2, 8]", "[1, 2, 3, 0, 4, 5, 6]"]
  answer: 1
  explanation: >-
    Check each index against its parent at (i-1)//2. In [2,5,3,9,6,4,8]: 5≥2, 3≥2, 9≥5, 6≥5, 4≥3, 8≥3; 5 sitting before 3 is fine because siblings are unordered. [1,4,3,5,2,6,7] has 2 at index 4 under 4 at index 1; [1,3,4,5,7,2,8] has 2 at index 5 under 4 at index 2; [1,2,3,0,4,5,6] has 0 at index 3 under 2.
- q: >-
    During sift-down you swap the node with its left child whenever the left child is smaller, without checking the right. What can go wrong?
  options: ["It only slows down, costing an extra level of swaps per pop", "The shape breaks, because the array gains a gap at the end", "Nothing, because the right child is checked on the next pass", "A smaller right child ends up below a larger new parent"]
  answer: 3
  explanation: >-
    The child moved up becomes the parent of the other child, so it must be the smaller of the two. Swapping with the larger child puts a bigger value above a smaller one, and the next iteration moves down away from the broken pair, so it is never revisited. Swaps never create gaps, so the shape is unaffected.
- q: >-
    Building a heap from 1,000,000 elements by calling push for each takes about how many element moves compared with bottom-up heapify?
  options: ["About the same, since both run n sift operations in total", "Fewer, since push is O(1) on average for any input", "A million times more, since each push rescans the array", "Up to 20 times more, as each push climbs log₂ n levels"]
  answer: 3
  explanation: >-
    Heapify is O(n): under about n swaps, because most sift-downs start near the leaves. Repeated push is O(n log n) worst case, with log2(10^6) ≈ 20. The average-case O(1) push applies to random input only; sorted-descending input makes every push climb to the root.
- q: >-
    Why is heap sort typically slower than quicksort on real hardware despite the better worst-case bound?
  options: ["It needs deep recursion, so call overhead dominates", "It is not in place, so it copies the array into a heap", "It makes asymptotically more comparisons than quicksort", "Its sift-downs jump across the array, defeating the cache"]
  answer: 3
  explanation: >-
    Both are O(n log n) expected; heap sort's sift-down touches indices i, 2i+1, 2i+2 that spread across the array, so each level of each sift is a likely cache miss. Quicksort's partition streams through memory. Heap sort is in place and iterative, so neither copying nor recursion is the cost.
- q: >-
    You need a structure supporting push, pop-min, and "remove the element with key k" for arbitrary k, all in O(log n). A plain binary heap:
  options: ["Makes push and pop-min O(log n), but removal by key O(n)", "Makes removal O(log n) via binary search on the array", "Makes all three O(log n), since removal is a sift like pop", "Makes push O(n), since each append shifts elements up"]
  answer: 0
  explanation: >-
    The heap order is only parent-child, so the array is not sorted and locating an arbitrary key is a linear scan before the O(log n) sift. Removal becomes O(log n) only with an auxiliary key-to-index map (an indexed heap) or with lazy deletion.
```
