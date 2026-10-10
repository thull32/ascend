---
review: range-queries
source: f14327967a5d14a8
---
## Introduction

Twelve questions from the range-queries module. Answer out loud before the answer comes.

Three from each lesson, in order: segment trees, lazy propagation, Fenwick trees, and then sparse tables with square-root decomposition. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

An array of a million elements receives 50 thousand point updates and 50 thousand range-sum queries, interleaved. Which structure minimises the total work?

A, prefix sums, rebuilt after every update. B, a hash map from each range to its sum. C, a segment tree or a Fenwick tree. D, a plain array, scanned for every query.

[think]

The answer is C: a segment tree or a Fenwick tree.

Rebuilding prefix sums costs 50 thousand updates times a million elements, and scanning costs the same order for the queries. A log-time structure does 100 thousand operations of about 20 steps each, roughly 2 million steps in all. A hash map keyed by range cannot be kept consistent under updates.

## Question 2

Why can a range query on a segment tree never touch more than about 2 log n nodes?

A, each node stores the answer for every sub-range of its interval. B, earlier query results are memoised in the internal nodes. C, each level halves the remaining range, as in a binary search. D, at each level, only the two nodes at the endpoints can be partial.

[think]

The answer is D: only the two endpoint nodes per level can be partial.

At any level the query range partially overlaps at most two nodes, the ones containing its left and right ends. Fully covered nodes are taken whole and fully outside nodes are pruned, so the recursion continues into at most two nodes per level. The range is not halved at each level; it is cut into whole nodes plus two boundary nodes.

## Question 3

A colleague builds the segment tree from a node class with left and right pointers, and reports queries eight times slower than your array version at 10 million elements. What is the most likely cause?

A, Python recursion is slower than an iterative loop. B, garbage collection pauses run during every single query. C, every step chases a pointer to a new heap node, which is a cache miss. D, building pointer nodes takes n log n time, which slows the queries.

[think]

The answer is C: every step is a pointer chase and a cache miss.

Both versions do log n steps; the difference is memory locality. Siblings in an array share cache lines, so a query touches a few lines, while separately allocated nodes scatter across the heap and each hop is a dependent load the CPU cannot prefetch. Recursion versus iteration changes a constant factor, not the number of cache misses.

## Question 4

A lazy segment tree is correct after one range update. After a second, overlapping update, the sum over positions 2 to 3 returns 14, while the sum of position 2 plus the sum of position 3 returns 34. What is the bug?

A, the build computed the internal sums from the wrong children. B, a tagged node was descended into without a push first. C, closed and half-open intervals are mixed in the length term. D, tags were composed in the wrong order during the push.

[think]

The answer is B: a descent without a push.

The update walked into the tagged node without pushing and recomputed its sum from stale children, throwing away the earlier update. Narrow queries push the surviving tag onto the leaves and come out right; queries that take the node whole read the damaged sum. A length mix-up would already be wrong after the first update, and composition order is invisible when every update is an add.

## Question 5

Why does a push compose the child's existing tag first, and the parent's tag second?

A, parent tags always cover more elements than child tags. B, composition is commutative for every tag, so any order works. C, the child's tag must be older, because writing it pushed the parent first. D, child tags are cleared before the parent's tag is ever applied.

[think]

The answer is C: the child's tag is always the older one.

Any operation that set the child's tag walked through the parent and pushed it first, so whatever tag the parent holds now was set later. Composition is commutative for add but not for assign, which is why the rule matters.

## Question 6

Your updates are all range adds and your queries are all single-element reads, at a high rate, in Python. What should you use?

A, a Fenwick tree over a difference array of the values. B, a prefix-sum array, rebuilt after every range update. C, a plain segment tree, with a point update per element. D, a lazy segment tree with range add and range sum.

[think]

The answer is A: a Fenwick tree over the difference array.

A range add becomes two point updates on the difference array, and reading one element is one prefix sum, each a short loop of about 20 steps. Measured walks cost under a microsecond in CPython, against 17 microseconds per lazy update. Point updates per element cost k log n per range, and rebuilding prefix sums is linear per update.

## Question 7

You need range minimum queries with arbitrary point updates. Why is a Fenwick tree the wrong tool?

A, min has no inverse to turn two prefixes into a range. B, its lowest-bit arithmetic breaks when values are negative. C, storing a min per block would need n log n cells. D, its point updates would cost linear time, not log n.

[think]

The answer is A: min has no inverse.

A Fenwick tree answers prefixes, and a range sum is the prefix to r minus the prefix before l, which relies on subtraction. Nothing recovers the minimum of a range from the minimum of two prefixes. Memory and update cost are its strengths, and the lowest-bit arithmetic works on indices, so negative values are fine.

## Question 8

To count the inversions in the array 40, minus 7, 40, 12 with a Fenwick tree, what is the first thing you do?

A, reverse the array, so later elements are processed first. B, sort the array, so the tree can be filled in value order. C, map each value to its rank: minus 7 to 1, 12 to 2, and 40 to 3. D, build a frequency array of size 41, indexed by value.

[think]

The answer is C: map each value to its rank.

Coordinate compression turns arbitrary values, negatives included, into dense indices starting at 1. A frequency array sized by the maximum value fails for negatives and wastes memory, and sorting destroys the order the count depends on. Ranks start at 1 because an index of 0 would never advance in the add loop.

## Question 9

A call to add 5 at index 0 on a 1-based Fenwick tree never returns. Why?

A, the lowest set bit of 0 is 0, so adding it never moves the index past 0. B, the loop walks down past 0 and reads outside the array. C, negative indices wrap around and restart the walk at n. D, index 0 holds the total, so every cell must be rewritten.

[think]

The answer is A: the lowest set bit of zero is zero.

0 AND minus 0 is 0, so the update loop adds zero to the index on every iteration, forever. In the 1-based layout, index 0 is the empty prefix, not a cell, which is why implementations convert 0-based indices by adding one at the boundary.

## Question 10

Why can a sparse table answer range minimum in constant time, but not range sum?

A, sums of power-of-two windows overflow unless you use 64-bit integers. B, sum has no inverse, so the two windows cannot be subtracted. C, min is idempotent, so two overlapping windows are harmless. D, the table stores only minima, so sum would need a second table.

[think]

The answer is C: min is idempotent.

Any range is covered by two power-of-two windows that may overlap. The min of a value with itself is the value, so the overlap does no harm; sum counts the overlap twice and needs a non-overlapping decomposition. A table of window sums would still double-count, and sum does have an inverse, which is exactly what prefix sums and Fenwick trees rely on.

## Question 11

A Parquet reader evaluates a filter on a timestamp range using the min and max statistics stored for each row group. Which range-query technique is this?

A, square-root decomposition: skip whole blocks by their summary. B, a segment tree query: descend by each node's min and max. C, lazy propagation: push pending bounds down to the rows. D, a sparse table lookup: two overlapping min and max windows.

[think]

The answer is A: square-root decomposition.

Block statistics are the per-block summaries of square-root decomposition: whole blocks in the middle are skipped by their summary, and the partial blocks at the ends are scanned. The block size matches an I/O unit rather than the square root of n, and there is one level of summaries, not a tree of them.

## Question 12

Mo's algorithm sorts offline queries by the block of their left end, then by their right end. What does that ordering guarantee?

A, the left end only moves forward across the whole run. B, within one block of left ends, the right end only moves forward. C, the window never shrinks from either end between queries. D, every query is answered in constant time once the sort completes.

[think]

The answer is B: within a block, the right end only moves forward.

Queries whose left end falls in the same block are sorted by right end, so the right end sweeps forward at most n per block, and the left end moves at most one block's width per query. The window does shrink, as in the traced step from positions 1 to 12 down to 6 to 7, which removes ten elements; individual moves still cost work; and the left end moves back and forth within a block.

## Recap

Three ideas kept coming back. First, pick the structure from the shape of the operation: an inverse allows prefix subtraction and Fenwick trees, idempotence allows overlapping windows and sparse tables, and with neither you need a segment tree or blocks. Second, the costs that matter are often outside the big O: cache misses per step, a sparse table nineteen times the size of its data, and Python's interpreter turning a short walk into microseconds. And third, most bugs hide in the bookkeeping: a missing push, the wrong composition order, or an index of zero that hangs instead of failing.
