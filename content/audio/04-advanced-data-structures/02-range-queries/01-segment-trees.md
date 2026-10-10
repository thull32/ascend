---
lesson: segment-trees
source: f380ff11f9ed3083
fit: partial
desk:
  - "The eight-value tree drawn and as its array, indices 1 to 15"
  - "The three recursive query traces and the three iterative parity traces"
  - "The recursive and iterative code, and why the recursive layout needs 4n slots"
  - "The two-accumulator fix for non-commutative operations, and the n equals 6 ragged tree"
  - "The operation table, the AtCoder segtree layout and the max-right trace"
  - "The trade-off and failure-mode tables"
  - "Exercises: point update and range sum; range max with a descent query"
---
## Introduction

You keep a per-second request count for the last day: 86,400 integers. A dashboard asks how many requests landed between two times, a few hundred times a second, while a new count lands every second.

A prefix-sum array answers each query with one subtraction, but every new second invalidates every later prefix, and rebuilding is linear. A plain array makes updates free and every query linear. Both are wrong at 86 thousand elements, and catastrophic at a billion.

The segment tree splits the difference: log n for a point update and log n for a range query. Three ideas. The structure: a summary of every aligned interval, stored in a flat array. Why a query never touches more than about 2 log n nodes. And the traps: the identity element, operations where order matters, and the array size. Then where the same idea runs in production under other names.

## Why prefix sums stop working

Take eight values: 5, 2, 4, 7, 1, 3, 6, 8. Their prefix sums depend on every earlier element. Change the value at index 2 from 4 to 9, and six of the eight prefix entries move. That long chain of dependencies is the problem.

A segment tree replaces it with a tree of short ones, where each element influences only log n plus 1 summaries.

## The structure

Build a complete binary tree whose leaves are the eight values, and whose every internal node stores the sum of its two children. The root holds 36, the sum of everything. Its left child covers indices 0 to 3, sum 18; its right child covers 4 to 7, also 18. Below those, pairs: 7, 11, 4 and 14.

Store it in one array with the root at index 1. Node i has children 2i and 2i plus 1, and its parent is i halved. Leaf k sits at index n plus k. Two things fall out of that layout. Siblings are adjacent, so a parent's children share a cache line. And each level is a contiguous slice of the array.

Build fills the leaves, then walks downward from n minus 1 to 1, summing children. Every node written once: linear.

A point update is a walk up one path. Change index 2 to 9. Its leaf goes from 4 to 9. Its parent, covering 2 and 3, from 11 to 16. The next, covering 0 to 3, from 18 to 23. The root, from 36 to 41. Four writes for eight elements: log n plus 1.

## Why a query is logarithmic

A range query walks down from the root and classifies each node. Covered: the node's interval lies entirely inside the query, so take its stored value and stop. Outside: contribute nothing and stop. Straddling: recurse into both children.

Ask for the sum of indices 2 to 5. The root straddles, its left child straddles. Under it, the pair 0 and 1 is outside; the pair 2 and 3 is covered, take 11. On the right, the pair 4 and 5 is covered, take 4; the pair 6 and 7 is outside. Total 15. Seven nodes visited, two taken.

Before I give you the bound: why can a query never touch more than about 2 log n nodes?

[pause]

Because at any level, only two nodes can partially overlap the query: the one containing the left end and the one containing the right end. Everything strictly between them is fully inside and taken whole. Everything else is outside and pruned. So you recurse into at most two nodes per level. The range is not halved like a binary search; it is cut into whole nodes plus two boundary nodes. For a million elements, that is at most about 80 nodes visited and 40 taken, against a million for a scan.

There is also an iterative version with exactly 2n slots and no recursion. Two cursors start at the leaves and climb together. The rule is parity: an odd index is a right child, whose parent also covers a sibling outside the query, so take it now and step past it. That loop finds exactly the nodes the recursive walk takes, by bit tests alone. The traces are at your desk.

## Three traps

First, the array size for the recursive layout. "The tree has 2n minus 1 nodes" suggests 2n slots. But when n is not a power of two, the halving is uneven, leaves land on two depths, and the numbering leaves holes. With n of 6, you already need 14 slots, so 2n writes past the end. 4n is the round bound that always works.

Second, the identity. The outside case returns the operation's identity, and the iterative accumulators start from it. That is zero for sum, but plus infinity for min. Return zero for a range minimum and every answer is silently capped at zero.

Third, operations where order matters: matrix products, function composition, string concatenation. Build the iterative tree over the letters a to h and concatenate. Ask for positions 1 to 6. You expect "b c d e f g". A single accumulator returns "b g c d e f", because pieces taken from the left cursor arrive left to right, and pieces from the right cursor arrive right to left, interleaved. The fix is two accumulators, one that grows on its right, one that grows on its left, joined once at the end. Commutative test data never catches this; the first matrix product in production does.

## Memory and speed

For a million 64-bit sums, the 2n array is 16 megabytes and the 4n recursive array 32. In CPython, a 2n list of Python ints is about 75 megabytes, which is the kind of number that decides whether a service can afford one tree per tenant.

The array form is where the speed comes from. The top eleven levels, about 2 thousand nodes, 16 kilobytes, stay in L1 cache across queries. A pointer-based node class costs three to four times the memory and turns every step into a dependent load the CPU cannot prefetch. In C++ or Rust, a query on a 16-megabyte tree sitting in L3 is on the order of 100 to 300 nanoseconds; once the tree outgrows L3, it approaches a microsecond. In CPython, a measured 2.2 microseconds per iterative query, 4.5 per recursive. And building the tree with a million point updates took eleven times as long as the linear build.

## Any monoid, and a binary search on the tree

The node needs a summary and one function to combine two summaries. Anything associative with an identity works: sum, min, max, greatest common divisor. The summary need not be one number. For the maximum subarray sum in a range, each node keeps four: its total, its best prefix, its best suffix, and its best overall, and the combined best is the larger of the two bests and the left suffix plus the right prefix.

The AtCoder Library's segment tree, the most-copied production-quality one, makes the identity a parameter and rounds n up to a power of two. That costs at most twice the memory, and only 5 percent for a million elements, and it buys a tree where every node covers a contiguous interval. Which enables its best primitive, max-right: starting at l, how far can you extend while a condition still holds? It is a binary search over the tree in log n.

On the eight values, starting at index 2, with the condition "sum at most 12": 4 plus 7 plus 1 is 12, so you can go through index 4; adding index 5 makes 15. The climb takes whole subtrees while the condition holds, then descends to the exact boundary. That one primitive answers "the first index where the prefix exceeds k" and "the first slot with capacity at least c".

## Where it runs

The name rarely appears outside competitions, but the idea, a summary per aligned interval, is everywhere. An exchange needing total resting volume at or below a price, as orders arrive at hundreds of thousands a second, has a point update and a prefix query over price ticks. The Thanos compactor downsamples monitoring data to 5-minute and 1-hour windows carrying count, sum, min and max; Graphite declares retention tiers like 15-second points for a week and 15-minute points for 5 years. Those tiers are tree levels flattened onto disk: a year-long query reads the coarse level and touches the fine one only at its edges. That is the two-partial-nodes-per-level argument in another costume. ClickHouse keeps summaries per granule of 8,192 rows, and Parquet keeps min, max and null count per row group, so a time-range filter skips whole blocks: one level of a segment tree. And the up-sweep of a parallel GPU prefix scan computes exactly the internal nodes, one level per step.

## In the interview

The tell is a combination: an array, repeated range queries, and updates between them. Say the three costs out loud: prefix sums are constant query and linear update; a plain array is the reverse; a segment tree is log n for both, for 2n memory and a linear build. If there are no updates, say so and use prefix sums. The interviewer wants to hear you not over-engineer. Then ask what the query is: sum, count and XOR are invertible, so a Fenwick tree, simpler and half the memory, will do. Min and max are not.

A follow-up the lesson expects: find the first index at or after l whose value is at least x, in log n.

[pause]

A max tree, descended from the root. Skip any node whose interval ends before l or whose max is below x, and always try the left child first; the first leaf you reach is the answer. That is max-right in disguise. The wrong answer is a binary search on the index with a range-max query per probe, which is log squared.

## Recap

Four things to remember. A segment tree stores a summary of every aligned interval in a flat array, root at 1, children at 2i and 2i plus 1, so update and query are both log n. A query takes at most two partial nodes per level, so about 2 log n nodes, 40 for a million elements. The traps: 4n slots for the recursive layout, the operation's own identity rather than zero, and two accumulators when order matters. And use it only when there are updates; with none, prefix sums win, and with an invertible operation, a Fenwick tree.

At your desk: the tree and its array, the query traces in both styles, the code, the non-commutative fix, the AtCoder layout and the max-right trace, the tables, and the two exercises.
