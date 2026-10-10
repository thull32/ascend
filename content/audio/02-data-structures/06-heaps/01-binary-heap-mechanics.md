---
lesson: binary-heap-mechanics
source: 9c4691ce69f79cd1
fit: partial
desk:
  - "The nine-element example array and its tree, with the invariant check"
  - "The push and pop code, the six-push trace and the one-pop trace"
  - "The heapify code and its four-step trace, and the series behind the order n bound"
  - "The in-place heap sort code and its extraction trace"
  - "The heappop trace with Floyd's bottom-up trick, and the library notes for CPython, Java, Rust, C++ and Go"
  - "The cost table and the comparison against sorted arrays and balanced trees"
  - "Exercises: implement a binary min-heap, and in-place heap sort"
---
## Introduction

You have a collection of items with priorities, and you repeatedly need the most urgent one: the next timer to fire, the closest unvisited vertex, the smallest of a million timestamps. A sorted array answers "smallest?" instantly, but inserting costs order n shifts. An unsorted array inserts in constant time, but finding the minimum is order n. A balanced tree does both in log n, but pays with pointers, allocations and cache misses.

The binary heap does both in log n with a plain array and no pointers. It gets there by relaxing the search tree's total order to something far weaker: a parent is never larger than its children. That is all. Nothing about siblings, nothing about cousins. Exactly enough order to know where the minimum is.

Four ideas. The two invariants. Push and pop, and why each is log n. Heapify, which builds a heap in linear time, and why that surprises people. And what real libraries do differently from the textbook.

## The two invariants

A binary min-heap is an array with two properties. The shape: read as a tree in level order, it is complete, every level full except perhaps the last, filled from the left. Equivalently, the array has no gaps. And the order: every element is at least as large as its parent. Every path from the root downward is non-decreasing.

The tree is implicit in the indices. The children of index i sit at 2i plus 1 and 2i plus 2. Its parent is at i minus 1, halved and rounded down. No pointers at all.

The consequence of the order invariant is that the minimum is always at index zero, readable in constant time. Everything else about heaps is how to remove it, or add something, while restoring both invariants in log n.

And notice how weak the order is. An ascending array is a valid min-heap. But the converse fails: 1, 3, 2 is a valid heap that is not sorted, because siblings are unordered. So searching for an arbitrary element is order n, and the array order is not priority order. Printing the heap's array as if it were the queue in order is a classic bug.

A max-heap flips the comparison. Python's heapq is min-only on older versions; Java's priority queue is min by default; C++ and Rust default to max.

## Push and pop

To push, append the new element at the end. The shape still holds. The order may not, because the new element could be smaller than its parent. So compare with the parent and swap while it is smaller, walking up. That is sift up.

Let's build one, small enough to hold. Push 5: it is the root. Push 3: it lands below 5, is smaller, and swaps to the top. Push 8: it lands as the root's right child, and 8 is not smaller than 3, so it stays. Push 1: it lands under 5, swaps with 5, then swaps with 3, and reaches the root. Push 9: it lands under 3 and stays. The array now reads 1, 3, 8, 5, 9. As a tree: 1 at the root, 3 on its left, 8 on its right, and under 3, the leaves 5 and 9. Five pushes, three swaps.

Each swap moves one level up, so a push is at most log n swaps. Most pushes stop after zero or one swap: measured over 100 thousand random pushes, the average was 1.27, whatever the size. But strictly descending input makes every push climb to the root, measured at nearly 15 swaps per push at 100 thousand elements. "Average constant time push" is a statement about random input, and a sorted feed will hand you the worst case.

To pop, you cannot just delete index zero; that leaves a hole at the root. Instead, move the last element into index zero, which keeps the shape, then push it down. At each step, compare it with both children, and if either is smaller, swap with the smaller one.

Before I go on: why must it be the smaller child?

[pause]

Because the child that moves up becomes the parent of the other child, so it must be no larger than it. Swap with the larger child and you put a big value above a small one, and the sift then moves away from that broken pair and never revisits it.

Pop the five-element heap. Return 1. Move the last element, 9, to the root. Its children are 3 and 8; the smaller is 3, so swap. Now 9 sits where 3 was, with one child, 5. 5 is smaller, so swap. The heap is 3 at the root, 5 and 8 below it, and 9 under 5. Valid again.

Pop is also log n, and unlike push, it almost always goes all the way down, because the element moved to the root came from the bottom level, where the large values live.

## Heapify in linear time

Given a whole array up front, the obvious way to build a heap is n pushes: n times log n. There is a better way, and the analysis is a favourite interview question.

Every leaf is already a one-element heap, and the leaves are the second half of the array. So start at the last non-leaf, index n over 2 minus 1, and walk backwards to zero, sifting each node down. When you reach a node, both of its subtrees are already heaps, so sifting it down makes a valid heap rooted there.

Now the question. Each sift-down is log n, and heapify calls it about n over 2 times. Why is the total order n, and not n log n?

[pause]

Because the cost of a sift-down is the height of the node, not the height of the tree. Half the nodes are leaves and cost nothing. A quarter have height 1 and cost one level. An eighth cost two. The sum of n times h, over 2 to the h plus 1, converges to at most n. So heapify does at most about n swaps and 2n comparisons, in the worst case. The expensive nodes near the root are few; the many nodes near the leaves are cheap. Repeated pushing is the opposite: the many late elements each pay their full depth.

Measured on 100 thousand random values: 1.88 comparisons and 0.74 swaps per element, under the bounds of 2 and 1. The common wrong answer is "because the sifts stop early on average", which is an average-case claim; the linear bound is worst case. For a million elements, descending data, the kind a batch job often produces, makes repeated pushing about ten times worse than heapify.

## Heap sort

If you can extract the minimum in log n, you can sort: heapify, then pop n times. The elegant version is in place, with a max-heap: each extracted maximum goes exactly where the heap has just shrunk from, the end of the array. Order n log n in the worst case, in place, no recursion.

On paper that beats quicksort's worst case and merge sort's extra memory. On real hardware, it is the slowest of the three. Every sift jumps between i, 2i plus 1 and 2i plus 2, which are far apart for large i, so once the heap outgrows the cache, the bottom levels of every sift are cache misses. Quicksort and merge sort scan sequentially, and the prefetcher hides their latency.

Where heap sort really lives is as the fallback in introsort: quicksort, until the recursion depth exceeds about twice log n, then heap sort on that partition to guarantee the bound. And it is not stable: equal elements can come out in swapped order, because sifts jump.

## What the libraries actually do

CPython's heapq does not do the sift-down you just learned. Its pop moves the hole all the way to a leaf, at each level choosing the smaller child with one comparison, child against child, and never comparing against the moved element. Only at the bottom does it place the element and bubble it back up a step or two. Why? The element came from the last position, so it is almost always large, and checking "am I in place yet?" at every level wastes a comparison per level. That is Floyd's trick. Measured on a heap of 100 thousand, the classic loop averaged 28 comparisons per pop and Floyd's about 15. In Python, each comparison is an interpreted call, so halving them matters. Rust's BinaryHeap and libstdc++ use the same trick. Java's PriorityQueue does not.

Two more library facts worth knowing. Java's PriorityQueue iterator walks the array in index order, not priority order; code that iterates it expecting sorted output is a recurring review finding. And Rust's BinaryHeap of 64-bit floats does not compile, because floats are not totally ordered. That is the language refusing to let a not-a-number value corrupt your heap. Every comparison with NaN is false, so it never moves and never blocks a move, and the sifts around it make wrong decisions silently. Reject it at push.

Memory is the array, and its contents decide the constant. A CPython heap of a million priority, sequence and item tuples is about 136 bytes per entry, roughly 136 megabytes. The same in Rust is 24 bytes per entry. About five to one.

For large heaps, the bottom levels dominate the cost, because the top dozen levels fit in the fastest cache and the rest do not. A 4-ary heap, with four children per node, halves the height, and puts the four children side by side in memory. Pop does more comparisons per level, push fewer, so it suits push-heavy work like Dijkstra. Go's runtime keeps its timers in a 4-ary heap for this reason.

## In the interview

A follow-up the lesson expects. How do you find the k-th smallest element of a min-heap without destroying it?

[pause]

Keep a second min-heap of candidate positions, seeded with the root. Pop the smallest candidate, push its two children, and repeat k times. That is order k log k, independent of the heap's size. The wrong answer is "read index k minus 1", which is only right for a sorted array.

And: can you merge two binary heaps faster than rebuilding? No. Concatenate and heapify, order n plus m, which is what Rust does when the sizes are comparable. Pushing the smaller heap's elements one by one is never better. Heaps that merge in log n, leftist, binomial and pairing heaps, exist for exactly this reason.

## Recap

Four things to remember. A heap is two invariants, complete shape and parent no larger than child, so the minimum is at index zero and nothing else is ordered. Push sifts up and pop moves the last element to the root and sifts down toward the smaller child, both log n. Heapify is order n in the worst case, because a sift-down costs the node's height and most nodes are near the bottom; use it whenever the batch arrives up front. And libraries go further: Floyd's trick halves comparisons per pop, heap sort is the in-place, unstable fallback that loses on cache, and NaN keys silently corrupt a float heap.

At your desk: the example arrays and trees, the push, pop and heapify code with their traces, the heap sort trace, the library details, the cost tables, and the two exercises.
