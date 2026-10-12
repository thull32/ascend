---
lesson: two-heaps
source: 1e962d9ee2a43201
---
## 1

In the running median, every value in the lower max-heap is at most every value in the upper min-heap, and the lower heap holds exactly one more element than the upper. Why is the lower heap's maximum the median?

A, listing the lower half and then the upper half gives sorted order, and the lower maximum sits in the middle. B, because the lower heap is a max-heap, its root is always the largest value overall. C, because the two heaps are sorted arrays, their roots sit at the centre. D, because balance alone makes the root of either heap the median.

[think]

The answer is A: the lower half then the upper half is sorted order, and its maximum is in the middle.

The order invariant means every element of the lower heap comes before every element of the upper heap in sorted order, so the lower maximum sits at the position equal to the lower heap's size. With 2m plus 1 values in total and m plus 1 in the lower heap, that is the middle. The lower maximum is the largest of the lower half only, heaps are not sorted arrays, and balance without order says nothing about where values sit.

## 2

A sliding-window median uses lazy deletion, and balances its two heaps using their physical lengths. What goes wrong?

A, nothing, because stale entries are always removed before balancing. B, balancing becomes linear, because measuring the length scans the heap for stale entries. C, stale entries inflate the lengths, so odd-sized windows report averages. D, the heaps overflow, because the length is only valid for arrays without gaps.

[think]

The answer is C: stale entries inflate the lengths, and odd windows report averages.

Removed values stay physically in the heaps until they surface at a root, so the length overcounts one side. On the lesson's trace, the length-based version returns 7.5 and 2.5 for windows whose true medians are 7 and 4. Live counts, updated on every add, remove and move, are the only correct basis. Reading the length itself is constant time.

## 3

Over a hundred thousand random values, with a window of 1,001 and no compaction, roughly how many entries did the lazy heaps hold at their peak?

A, about 91 thousand, since values far from the median never surface. B, about 2 thousand, because each heap is bounded by the size of the window. C, about 500, because half of each window is pruned on every step. D, about a thousand, because every stale entry surfaces within one window.

[think]

The answer is A: about 91 thousand.

A removed value is discarded only when it reaches a root. Values well below the median sit at the bottom of the max-heap and stay there, so the garbage grows with the stream: 91,741 entries were measured. Rebuilding from the window whenever the physical size exceeds twice the window brought the peak down to 2,003, which is where the 2 thousand figure comes from.

## 4

Fifty shards each hold part of a dataset. What finds the exact global median without moving the data?

A, binary search on the value, asking each shard how many of its values are at or below the midpoint. B, averaging the fifty shard medians, weighted by each shard's element count. C, the median of the fifty shard medians, which is exact when the shards are equal in size. D, merging the fifty shards' two-heap structures into one pair of heaps.

[think]

The answer is A: binary search on the value, with per-shard counts.

Counts add across shards, so the global count at or below the midpoint is exact, and about 32 rounds of fifty small messages cover a 32-bit value range. Medians do not add, so neither a weighted average nor a median of medians is the global median, even for equal shards. Merging the heaps is exact, but it moves every element, which the question rules out.

## 5

A two-heap bag with lazy deletion records one pending removal of 7 when it is asked to remove a 7 it does not contain. What happens later?

A, the median shifts once, then corrects itself on the next add. B, a later 7 is discarded as stale when it reaches a root. C, nothing, since pending counts are ignored for absent values. D, the bag raises a KeyError the next time 7 is added to the lower heap.

[think]

The answer is B: a later 7 is discarded as stale when it reaches a root.

Pruning cannot tell a genuinely removed 7 from a new one. Whenever a 7 reaches a root while a removal of 7 is pending, it is popped, and the live counts no longer match what is physically present. Tracking live copies per value, and making the removal of an absent value do nothing, prevents it. The error does not correct itself.

## 6

Why can Kth Largest in a Stream keep only a min-heap of size k, while the kth largest with deletions needs a second heap?

A, a size-k min-heap cannot delete, but a max-heap of the rest can delete anything. B, with deletions the answer becomes the median, which always needs two heaps. C, insert-only, the boundary never falls, but a deletion can need an evicted value. D, deletions make the min-heap unstable, so a max-heap is needed to break ties.

[think]

The answer is C: insert-only, the boundary never falls, but a deletion can need an evicted value.

In an insert-only stream, the kth largest never falls, so nothing below it is read again, and the lower side need not be stored. Deleting a top-k value lowers the boundary, and the replacement is the largest of the rest, which is exactly what a max-heap of the rest provides. Stability and heap-specific deletion are not the issue.
