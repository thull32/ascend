---
review: heaps
source: df49e105e6a8c84b
---
## Introduction

Twelve questions from the heaps module. Answer out loud before the answer comes.

Three from each lesson, in order: binary heap mechanics, priority queues in practice, top-k and k-way merge, and indexed heaps with decrease-key. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

During sift-down, you swap the node with its left child whenever the left child is smaller, without checking the right. What can go wrong?

A, the shape breaks, because the array gains a gap at the end. B, nothing, because the right child is checked on the next pass. C, a smaller right child ends up below a larger new parent. D, it only slows down, costing an extra level of swaps per pop.

[think]

The answer is C: a smaller right child ends up below a larger new parent.

The child that moves up becomes the parent of the other child, so it must be the smaller of the two. Swapping with the larger child puts a bigger value above a smaller one, and the next step moves down, away from the broken pair, so it is never revisited. Swaps never create gaps, so the shape is unaffected.

## Question 2

Building a heap from a million elements by calling push for each one takes about how many element moves, compared with bottom-up heapify?

A, a million times more, since each push rescans the array. B, up to 20 times more, as each push climbs log base 2 of n levels. C, fewer, since push is constant time on average for any input. D, about the same, since both run n sift operations in total.

[think]

The answer is B: up to 20 times more.

Heapify is order n: under about n swaps, because most sift-downs start near the leaves. Repeated push is n log n in the worst case, and log base 2 of a million is about 20. The constant-time average push only applies to random input; descending input makes every push climb to the root.

## Question 3

Why is heap sort typically slower than quicksort on real hardware, despite its better worst-case bound?

A, its sift-downs jump across the array, defeating the cache. B, it is not in place, so it copies the array into a heap. C, it needs deep recursion, so call overhead dominates. D, it makes asymptotically more comparisons than quicksort.

[think]

The answer is A: its sift-downs jump across the array.

Both are n log n expected. Heap sort's sift-down touches indices i, 2i plus 1 and 2i plus 2, which spread across the array, so once the heap outgrows the cache, each lower level of each sift is a likely miss. Quicksort's partition streams through memory. Heap sort is in place and iterative, so neither copying nor recursion is the cost.

## Question 4

In Python you push tuples of priority and task, where the task is a dictionary. Everything works until two tasks share a priority, then you get a type error. Why, and what is the fix?

A, ties fall through to comparing the dictionaries; put a counter before them. B, heap priorities must be unique; add a small random jitter to each. C, heapq accepts only numbers; push the task's id instead of the dictionary. D, dictionaries are unhashable, which heapq forbids; wrap each in a class.

[think]

The answer is A: ties fall through to comparing the dictionaries, so put a counter before them.

Tuple comparison goes element by element and stops at the first difference, so on a priority tie Python compares the dictionaries, which is unsupported. An increasing counter in the second position guarantees a difference before the payload is reached, and gives first-in, first-out order among ties as a bonus. Heapq never hashes anything, and priorities may repeat freely.

## Question 5

A max-heap job queue uses tuples of priority and sequence number, with the sequence number increasing. Among equal priorities, which job pops first?

A, the earliest pushed, since the sequence keeps first-in, first-out order. B, the latest pushed, since its larger sequence number wins. C, any of them, since heaps are not stable. D, the one nearest the root, whatever its sequence number.

[think]

The answer is B: the latest pushed.

A max-heap pops the largest tuple, and with equal priorities, the larger sequence number, the most recent push, wins. The sequence number makes every tuple unique, so the order is deterministic, but it is last in, first out. For first in, first out in a max-heap, negate the sequence number.

## Question 6

A service schedules millions of request timeouts per minute and cancels almost all of them when the response arrives. Tokio and Kafka both chose a hierarchical timing wheel over a heap for this. Why?

A, a wheel needs no memory per timer, only per slot. B, heaps cannot hold more than a few million entries at once. C, insert and cancel are constant time, and slot precision is enough. D, a wheel fires timers in exact deadline order, and a heap does not.

[think]

The answer is C: insert and cancel are constant time, and slot precision is enough.

With cancellations dominating, both the log n cost of heap operations and the dead entries left by lazy deletion hurt. A wheel makes both constant-time array operations, at the price of coarser precision for far-off timers. The heap is the more exact structure, not the less exact one, and both hold one entry per timer.

## Question 7

To find the 100 largest values in a stream of a billion numbers with minimal memory, you keep:

A, a max-heap of size 100, evicting its root for smaller values. B, a max-heap of all values seen, popping 100 times at the end. C, a min-heap of size 100, evicting its root for larger values. D, a sorted list of size 100, inserting each value by bisection.

[think]

The answer is C: a min-heap of size 100.

The root of a min-heap of the current best 100 is the weakest candidate, exactly the one to evict. A max-heap's root is the strongest, useless for eviction, and a heap of all values needs a billion slots. The sorted list works, but each insert is order k instead of log k.

## Question 8

A top-10 job over 200 million items in random order does far fewer than 200 million heap operations. About how many, and what input makes it do the full amount?

A, about 200 heap operations; input sorted ascending by the ranking key. B, about 200 heap operations; input with many duplicate keys. C, about 20 million heap operations; input with many duplicate keys. D, about 2 million heap operations; input sorted descending by the key.

[think]

The answer is A: about 200, and the worst case is input sorted ascending by the key.

On random order, the i-th item enters the heap with probability k over i, so the expected count is about k times the natural log of n over k, plus k: around 180 for these numbers. Every other item costs one comparison against the root. Ascending input makes every item beat the root and forces the full n log k. Descending input is the best case, and duplicates are rejected by the comparison.

## Question 9

Each of 100 shards returns its local top 10. For which ranking is the merged result guaranteed to be the true global top 10?

A, only for an aggregated count, because counts add across shards. B, for neither, because shards can hold different numbers of items. C, only for a per-item score, because a global leader must lead its own shard. D, for both, because the union of local top tens always contains the global top ten.

[think]

The answer is C: only for a per-item score.

An item with one of the highest scores globally has that same score in its own shard, so it is in that shard's top 10. An item's count is spread across shards, so it can rank below the local top 10 everywhere while leading overall. The fix for counts is returning full counts, a mergeable sketch, or a second round that fetches counts for every candidate.

## Question 10

Dijkstra with lazy deletion, pushing duplicates, has a heap size bounded by what?

A, the maximum degree, since one vertex relaxes at a time. B, E, the number of edges, since each relaxation can push an entry. C, V log V, since each vertex re-enters log V times. D, V, the number of vertices, since each vertex is finalised only once.

[think]

The answer is B: E, the number of edges.

Each successful relaxation pushes an entry, and there are at most E of them, so the heap can hold order E entries even though each vertex is finalised once. The indexed heap variant holds at most V. The running time stays E log V, because log E is at most twice log V. On random graphs the measured peak is a small multiple of V, but the bound is what an adversary can force.

## Question 11

Deleting a middle element of an indexed heap swaps it with the last element and shrinks the array. What must then happen to the swapped-in element?

A, sift it up only, since the deleted slot was above it. B, leave it in place, since the heap shape is already restored. C, sift it both up and down, since it came from another branch. D, sift it down only, since it came from the bottom level.

[think]

The answer is C: sift it both up and down.

The last element belongs to some other branch, so relative to its new parent and children it may be too small or too large. The lesson's trace shows a value of 4 landing under a parent of 10 and needing to move up. Calling both sifts is correct, because at most one of them moves it. The shrink restores the shape, but not the order.

## Question 12

A lazy-deletion queue implements remove of x by adding one to x's pending count, unconditionally. Now run this sequence: remove 7, push 7, pop. What is returned?

A, an error, since removing an absent 7 raises. B, 7, since the removal came before the push. C, nothing, as the pending removal eats the push. D, 7, since each push clears pending removals.

[think]

The answer is C: nothing; the pending removal eats the push.

The unconditional remove records a pending removal without any error, and nothing clears it. When 7 is pushed and reaches the root, it matches the pending removal and is discarded. Remove must check that a live copy exists before recording anything.

## Recap

Three ideas kept coming back. A heap's order is deliberately weak: only parent against child, so the smaller child must win every sift, the minimum is all you get cheaply, and changing or removing anything else needs lazy deletion or a position map. Ties and order are your job: put a sequence number in every entry, and know which way it breaks ties in a max-heap. And bounded heaps are windows: a min-heap of size k for the k largest, one head per stream for a merge, but local top lists only compose when the score belongs to the item, not to a count spread across shards.
