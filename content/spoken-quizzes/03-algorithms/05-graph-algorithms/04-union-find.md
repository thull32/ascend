---
lesson: union-find
source: 904054d5d1c47df0
---
## 1

Using union by rank without path compression, what is the worst-case cost of a single find on n elements?

A, log n. B, log squared n. C, the inverse Ackermann function of n. D, linear.

[think]

The answer is A: log n.

A root of rank r has at least 2 to the r nodes, so the rank, which bounds the height, is at most log base 2 of n. Path compression is what brings the amortised cost down to inverse Ackermann; rank alone is logarithmic.

## 2

After path compression, the rank stored at a root no longer equals its tree's height. Why is the union rule still correct?

A, compression only moves leaves, so heights never actually change. B, rank stays an upper bound on height, and that is all it needs. C, each find resets the root's rank to its new, exact height. D, it is not; heights must be recomputed after each compression.

[think]

The answer is B: rank stays an upper bound on height, and that is all it needs.

Compression only shortens trees, so the height stays at or below the rank, and the counting argument, that a root of rank r has at least 2 to the r nodes, never relied on rank being exact. Compression does change heights, and recomputing them would cost more than the operation they protect.

## 3

Given a log of link-up events, you must answer many queries of the form: were u and v connected at time t? Links are never removed. What is the right approach?

A, build the full union-find, then undo the links after time t. B, sort the events and queries by time, and sweep one union-find. C, a breadth-first search per query, on the graph filtered to links before t. D, Floyd-Warshall once, then look up each pair.

[think]

The answer is B: sort events and queries by time, and sweep one union-find.

With no deletions, connectivity at time t depends only on the events up to t. Sort both lists, advance the union-find through the events, and answer each query when its time is reached: a sort, plus near-constant work per operation. A search per query is the slow approach it replaces, and undoing links is not something union-find supports.

## 4

A stream removes edges from a graph one by one, and after each removal asks for the number of connected components. All the removals are known in advance. How do you use union-find?

A, rebuild the union-find from scratch after each removal. B, replay the removals in reverse order, as insertions. C, union the removed edges first, then split them off in order. D, delete each edge by resetting its endpoints' parent pointers.

[think]

The answer is B: replay the removals in reverse order, as insertions.

Reversing time turns each deletion into an insertion, which union-find handles: start from the graph with all the removed edges absent, and record component counts backwards. Resetting parent pointers is not a valid deletion, because compression has rewired other nodes through them. Rebuilding costs linear time per step; reversal is near-linear overall.

## 5

Two union implementations differ only in this: one hangs the smaller set under the larger, and the other always hangs the second root under the first. Both use full path compression. Which statement is true?

A, the size-aware one is amortised inverse Ackermann; the other is log n. B, the size-aware one is amortised log n; the other is inverse Ackermann. C, both are amortised log n; inverse Ackermann needs a recursive find. D, both are amortised inverse Ackermann, because compression dominates.

[think]

The answer is A: the size-aware one is amortised inverse Ackermann; the other is log n.

Path compression alone gives amortised log n. Combining it with union by rank or by size is what gives the inverse-Ackermann bound. Whether find is recursive or iterative does not matter. Both are fast on typical inputs, but the guarantee differs, and interviewers ask exactly this.

## 6

To delete element x from its set, a colleague proposes making x its own parent. In a forest where 6 and 7 point to 4, and 4 points to 0, what happens after "deleting" 4 this way?

A, 6 and 7 are silently cut off from 0's set, so 6 and 0 are no longer connected. B, 6 and 7 are re-attached to 0 on their next find, so nothing is lost. C, 4 leaves its set cleanly, because only its own pointer changed. D, it raises an error, since a non-root node cannot point to itself.

[think]

The answer is A: 6 and 7 are silently cut off from 0's set.

Union-find has no delete. Node 4 is an internal node, and making it a root takes its whole subtree with it, so 6 and 7 now report a different root from 0, although nothing disconnected them. Compression never re-attaches them, because find stops at the first node that points to itself. The honest options are offline reversal, rollback union-find, or a dynamic connectivity structure.
