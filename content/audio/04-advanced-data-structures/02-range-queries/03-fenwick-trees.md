---
lesson: fenwick-trees
source: d28bc3a61cd87908
fit: partial
desk:
  - "The lowbit table for indices 1 to 8, and the block diagram"
  - "The query and update path tables for a 16-element tree, and the proof that adding the low bit finds the next enclosing block"
  - "The Fenwick class with its linear build, and the build trace"
  - "The two-tree range-add derivation and its trace"
  - "The inversion counter, the k-th element descent trace, and the 2D tree"
  - "AtCoder's fenwick tree, the measured-cost table, and the trade-off and failure tables"
  - "Exercises: implement a Fenwick tree; count inversions with a Fenwick tree"
---
## Introduction

A segment tree answers range sums with updates in log n, but it costs 2n to 4n integers, a fiddly walk, and a build step. For the most common case, sums, or anything else with an inverse, like counts, XOR, or products modulo a prime, there is a structure that does the same job in n plus 1 integers with two five-line loops.

Peter Fenwick described it in 1994, for the frequency tables of arithmetic coding. Every competitive programmer types it from memory, and every backend engineer rediscovers it when building a leaderboard.

Three ideas. The binary representation of an index decides which block of elements it owns. That trick needs an inverse, and it needs indices to start at 1, and both facts are traps. And what you build on top: range updates with two trees, and a k-th element search that is a binary search performed on the tree itself.

## Each index owns a block

Use indices starting at 1. Define lowbit of i as the value of its lowest set bit, computed as i AND minus i. 12 is 1100 in binary, so lowbit of 12 is 4. Lowbit of 6 is 2, of 8 is 8, of 7 is 1.

Cell i stores the sum of the lowbit-of-i elements ending at position i. So cell 12 holds positions 9 through 12. Odd cells hold one element. Multiples of 2 but not 4 hold two. Multiples of 4 but not 8 hold four. Cell 8 holds positions 1 to 8. Picture a segment tree with every right child deleted: each cell is exactly the node whose interval ends at i.

## Query: strip the lowest bit

To sum positions 1 through i, take cell i, which is a block ending at i. Jump to the block immediately before it, which ends at i minus lowbit of i. Repeat until you reach zero.

Said aloud on eight values, 3, 1, 4, 1, 5, 9, 2, 6. The prefix up to 7: cell 7 holds just position 7, which is 2. Strip the low bit, 7 becomes 6. Cell 6 holds positions 5 and 6, which is 14; running total 16. Strip again, 6 becomes 4. Cell 4 holds positions 1 to 4, which is 9; total 25. Strip again, 4 becomes 0, stop. Three steps, and 3 plus 1 plus 4 plus 1 plus 5 plus 9 plus 2 is indeed 25.

Each step clears one set bit, so the loop runs once per set bit of i: at most log n plus 1 times. Not because i halves; 7 went to 6, not 3.

A range sum is two prefixes: the prefix to r, minus the prefix to l minus 1. Before I go on: why does that make a Fenwick tree the wrong tool for range minimum?

[pause]

Because the subtraction is the whole trick, and minimum has no inverse. Nothing recovers the minimum of l to r from the minimum of 1 to r and the minimum of 1 to l minus 1. Sum, count and XOR work. Min and max need a segment tree. A Fenwick "min tree" does pass tests where values only fall, and then breaks the first time a value goes up.

## Update: add the lowest bit

To add to position i, every cell whose block contains i must change. The first is i itself. The next enclosing block ends at i plus lowbit of i. Update position 3: cells 3, then 4, then 8. Exactly the three blocks that contain position 3. The update climbs enclosing blocks in increasing size; the query walks disjoint blocks leftward. Subtract the low bit to step left, add it to step up.

Building with one add per element is n log n. The linear build puts each value in its own cell, then hands each finished cell's total to its parent, i plus its low bit. In CPython, for a million elements, that is 0.08 seconds against 0.41 for a million adds.

## Why it starts at 1

Lowbit of zero is zero. Cell 0 would own an empty block, and the update loop, adding the low bit each time, would add zero forever. So a 0-based index passed to a 1-based add is not an exception. It is a hang: a process pinning a core with no error.

In the 1-based layout, zero is the empty prefix, and reaching it is what stops the query loop. A 0-based variant exists, but its two loops are no longer mirror images. So nearly every implementation keeps 1-based arithmetic inside and converts at the boundary. AtCoder's library does exactly that: its public interface is 0-based and half-open, and the first line of its add increments the position.

AtCoder makes one more choice worth copying: it stores sums as unsigned integers. An intermediate prefix that overflows wraps, which is defined behaviour for unsigned types in C++, and the difference of two prefixes is still exact whenever the true range sum fits.

## Range updates, with one tree and with two

Store the differences instead of the values: the value at i is the sum of differences up to i. Then adding x to the range l to r is two point updates, plus x at l and minus x at r plus 1, and reading one value is one prefix query. That is range update with point query, in one tree.

Range update with range sum needs one more tree. The derivation is at your desk; the result, in words, is: keep one tree over the differences and a second over each difference times its position minus 1. The prefix sum up to i is i times the first tree's prefix, minus the second tree's prefix. A range add touches two cells in each tree.

Measured in CPython over a million elements: 3 microseconds per range add and 2.7 per range sum, against 16.9 and 9.3 for the lazy segment tree on the same workload. Over five times faster on adds, over three on sums, in a fifth of the code. The price is generality: it works only because an add's effect on a sum is linear in the index.

## Inversions and the k-th element

An inversion is a pair of positions where the earlier element is larger. Walk left to right, keeping a frequency tree indexed by value. For each element, the earlier ones greater than it number "how many seen so far" minus "how many seen are at most it", and that second term is a prefix count.

Values may be huge or negative, so first replace each value by its rank among the distinct values, starting at 1. That step is called coordinate compression, and ranks start at 1 for the reason you just heard: a rank of zero would hang the add. On 2, 4, 1, 3, 5, the count is 3: 2 before 1, 4 before 1, and 4 before 3.

Now the k-th element. Given a tree of non-negative frequencies, you want the smallest index whose prefix reaches k. Binary search over prefix queries works, at log squared. But the tree supports a direct descent, deciding the answer one bit at a time from the top: try the biggest power-of-two block; if its total is still short of k, absorb it and subtract; then try the next smaller step. It is bisect, performed on the implicit tree. In CPython: 1.7 microseconds per descent against 8.8 for the binary search over prefixes.

The same descent gives weighted random sampling with changing weights. Draw a number uniformly from 1 to the total weight, find its index, and changing a weight is one add. Both log n.

And in two dimensions, a Fenwick tree of Fenwick trees answers rectangle sums with point updates, at the square of the one-dimensional cost. On a 4,096 by 4,096 heat map, an operation touches at most 169 cells, and the table is 128 mebibytes. For sparse points on a huge plane, compress coordinates and sweep instead.

## Speed, and where it runs

In CPython, one walk is about 0.65 microseconds, so a range sum, two walks, is about 1.3, against 2.2 for the iterative segment tree. Each walk is a short loop with no parity tests. In Node over typed arrays, a query was 13 nanoseconds at a million elements and 30 nanoseconds at 17 million, once the array outgrew L3 cache: the last cells of every query path stay cached, but the first few, near i, are random misses.

Where you meet it. Leaderboards with bounded scores: a tree over score buckets, with the k-th descent answering "who is at position 1,000". Redis solves the same rank question with skip-list spans. Order books: total resting volume at or below a price is a prefix sum over price ticks. Arithmetic coding, Fenwick's original use: every symbol needs its cumulative frequency, and every encoded symbol bumps one. And lottery scheduling or weighted load balancing, with the sampling descent.

The traps, briefly. The add-at-zero hang. A range sum computed as prefix of r minus prefix of l, which drops the left edge. The k-th descent fed a k above the total, or negative counts, since it assumes non-negative blocks. And JavaScript, where i AND minus i is a 32-bit operation, so indices at or above 2 to the 31 break.

## In the interview

A follow-up the lesson expects. Pick a server with probability proportional to its weight, and the weights change every second.

[pause]

A Fenwick tree over the weights. Each pick draws a random number from 1 to the total and runs the k-th descent; each weight change is one add of the new weight minus the old. Both log n. The wrong answer is rebuilding a cumulative array on every change, which is linear.

And another: for each element, count the smaller elements to its right. Compress values to ranks, walk right to left, query the prefix below each rank, then add one at that rank. n log n: the inversion loop, mirrored. Sorting a copy and binary-searching loses the positions the count depends on.

## Recap

Four things to remember. Cell i owns the lowbit-of-i elements ending at i: subtract the low bit to walk disjoint blocks for a query, add it to climb enclosing blocks for an update, each in at most log n plus 1 steps. It needs an inverse, so sums, counts and XOR, never min or max. It is 1-indexed because lowbit of zero is zero, and a zero index hangs rather than throws; convert at the boundary and rank from 1. And on top of it: range add with range sum from two trees, several times faster than a lazy tree in Python, and a bit-by-bit descent for the k-th element and weighted sampling.

At your desk: the lowbit table and path tables, the class and its linear build, the two-tree derivation, the inversion counter, the descent trace, the 2D tree, the measured costs, and the two exercises.
