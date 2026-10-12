---
lesson: segment-trees
source: 6f660e48f14e07fe
---
## 1

An array of a million elements receives 50 thousand point updates and 50 thousand range-sum queries, interleaved. Which structure minimises the total work?

A, prefix sums, rebuilt after every update. B, a hash map from each range to its sum. C, a segment tree, or a Fenwick tree. D, a plain array, scanned for every query.

[think]

The answer is C: a segment tree, or a Fenwick tree.

Rebuilding prefix sums costs 50 thousand times a million operations, and scanning costs the same order for the queries. A log-time structure does 100 thousand operations of about 20 steps each, around 2 million in total. A hash map keyed by range cannot be kept consistent under updates.

## 2

Why can a range query on a segment tree never touch more than about 2 log n nodes?

A, each node stores the answer for every sub-range of its interval. B, earlier query results are memoised in the internal nodes. C, each level halves the remaining range, as in a binary search. D, on each level, only the two nodes at the endpoints can be partial.

[think]

The answer is D: on each level, only the two nodes at the endpoints can be partial.

At any level, the query range partially overlaps at most two nodes, the ones containing its two ends. Fully covered nodes are taken whole, and nodes fully outside are pruned, so the recursion continues into at most two nodes per level. The range is not halved at each level; it is cut into whole nodes plus two boundary nodes.

## 3

In the iterative query loop, l and r are converted to leaf indices, and the range is made half-open. At some level, l is odd. What does that mean, and what happens?

A, l is a right child: skip it, and let its parent cover it later. B, l is a leaf, so the loop terminates on this iteration. C, l is a left child, so its parent lies fully inside the query. D, l is a right child: take its value, move l right, then go up.

[think]

The answer is D: l is a right child; take its value, move l right, then go up.

Odd indices are right children. Their parent also covers the left sibling, which lies outside the range, so the parent cannot be used, and the node itself must be taken now. Moving l one to the right then makes its parent the next node that is still a candidate.

## 4

A 2 n iterative segment tree over the letters a to h concatenates strings. The query from position 1 to position 6, with a single accumulator, returns b g c d e f instead of b c d e f g. Why?

A, the half-open conversion dropped the last element and shifted the rest. B, left pieces arrive left to right and right pieces right to left, interleaved. C, the tree has a ragged shape, because 8 is not a valid leaf count. D, string concatenation is not associative, so no segment tree can do it.

[think]

The answer is B: left pieces arrive left to right, and right pieces right to left, interleaved.

The loop takes b, then g, then c d, then e f, appending each as it is found. Pieces taken on the left side come in order, but pieces taken on the right side come from the right end inwards, so one accumulator mixes them. Two accumulators, one grown on its right and one on its left, fix it. Concatenation is associative, and 8 leaves make a perfect tree.

## 5

A colleague implements the tree with a node class holding left and right pointers, and reports that queries are 8 times slower than your array version at 10 million elements. What is the most likely cause?

A, Python recursion is slower than an iterative loop. B, garbage collection pauses run during every single query. C, every step chases a pointer to a new heap node, which is a cache miss. D, building pointer nodes takes n log n, which slows the queries.

[think]

The answer is C: every step chases a pointer to a new heap node, a cache miss.

Both versions take log n steps; the difference is memory locality. Siblings in an array share cache lines, so a query touches a few lines, while separately allocated nodes scatter across the heap, and each hop is a dependent load the CPU cannot prefetch. Recursion versus iteration changes a constant factor, not the number of cache misses per query.

## 6

You need the first index at or after l whose value is at least x, on an array with point updates. What is the log n approach?

A, a sparse table of maxima, rebuilt after every point update. B, a Fenwick tree over the values, answered by prefix subtraction. C, binary search on the index, with a range-maximum query at each probe. D, a descent through a maximum tree, pruning nodes that end before l or whose maximum is below x.

[think]

The answer is D: descend a maximum tree, pruning nodes that end before l or whose maximum is below x.

The descent keeps at most two live nodes per level and stops at the first qualifying leaf, which is the AtCoder library's max-right pattern. Binary search with a range maximum per probe costs log squared n. Maximum has no inverse, so a Fenwick tree cannot answer it by subtraction, and a sparse table costs linear time per update.
