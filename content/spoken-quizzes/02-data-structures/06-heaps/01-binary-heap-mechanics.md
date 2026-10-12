---
lesson: binary-heap-mechanics
source: 4758f67768ab3b3e
---
## 2

During sift-down, you swap the node with its left child whenever the left child is smaller, without checking the right. What can go wrong?

A, the shape breaks, because the array gains a gap at the end. B, nothing, because the right child is checked on the next pass. C, a smaller right child ends up below a larger new parent. D, it only slows down, costing an extra level of swaps per pop.

[think]

The answer is C: a smaller right child ends up below a larger new parent.

The child that moves up becomes the parent of the other child, so it must be the smaller of the two. Swapping with the larger child puts a bigger value above a smaller one, and the next step moves down, away from the broken pair, so it is never revisited. Swaps never create gaps, so the shape is unaffected.

## 3

Building a heap from a million elements by calling push for each one takes about how many element moves, compared with bottom-up heapify?

A, a million times more, since each push rescans the array. B, up to 20 times more, as each push climbs log base 2 of n levels. C, fewer, since push is constant time on average for any input. D, about the same, since both run n sift operations in total.

[think]

The answer is B: up to 20 times more, as each push climbs log base 2 of n levels.

Heapify is linear: under about n swaps, because most sift-downs start near the leaves. Repeated push is n log n in the worst case, and log base 2 of a million is about 20. The constant-time average push only applies to random input; descending input makes every push climb to the root.

## 4

CPython's heap pop moves the hole all the way down to a leaf, choosing the smaller child at each level, before bubbling the last element back up. Why does this beat the classic loop that compares against both children?

A, it avoids the swap at each level, by using a temporary hole. B, it reads only the left child, halving the memory traffic. C, it stops one level earlier, because leaves need no comparison. D, it skips the per-level test against an element that is usually large.

[think]

The answer is D: it skips the per-level test against an element that is usually large.

The element moved to the root came from the bottom of the heap, so it is almost always larger than both children at every level, and the classic loop spends a comparison per level confirming that. Floyd's variant uses one child-against-child comparison per level and a short bubble-up afterwards: about log n plus a constant, instead of 2 log n. The hole technique saves writes, not comparisons, and both children are still read.

## 5

Why is heap sort typically slower than quicksort on real hardware, despite its better worst-case bound?

A, its sift-downs jump across the array, defeating the cache. B, it is not in place, so it copies the array into a heap. C, it needs deep recursion, so call overhead dominates. D, it makes asymptotically more comparisons than quicksort.

[think]

The answer is A: its sift-downs jump across the array, defeating the cache.

Both are n log n expected. Heap sort's sift-down touches indexes i, 2 i plus 1 and 2 i plus 2, which spread across the array, so once the heap outgrows the cache, each lower level of each sift is a likely miss. Quicksort's partition streams through memory. Heap sort is in place and iterative, so neither copying nor recursion is the cost.

## 6

A heap of latencies keyed by floats starts returning values that are not the minimum, with no exception thrown. What is the most likely cause?

A, a NaN key, since every comparison with it is false. B, duplicate keys, which the sift cannot order. C, the array outgrew the cache, so sifts lose precision. D, negative latencies, which a min-heap rejects.

[think]

The answer is A: a NaN key, since every comparison with it is false.

Every comparison involving NaN is false, so a NaN never moves and never blocks a move, and nearby sifts make locally wrong decisions that compound silently. Duplicates and negatives are ordered fine by a heap, and cache misses cost time, not correctness. Reject NaN at push, or key on a total order, such as Java's double compare.
