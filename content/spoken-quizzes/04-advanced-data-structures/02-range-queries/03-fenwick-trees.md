---
lesson: fenwick-trees
source: 8bf7f84014a8b9d2
---
## 1

In a Fenwick tree, which elements does cell 12 summarise?

A, values 9 to 12. B, value 12 only. C, values 12 to 15. D, values 1 to 12.

[think]

The answer is A: values 9 to 12.

12 is 1 1 0 0 in binary, so its lowest set bit is 4, and cell 12 covers the 4 elements ending at 12: positions 9 to 12. Only powers of two cover a prefix starting from 1.

## 2

Why does a Fenwick prefix query finish in at most log n plus 1 steps?

A, it walks one level up a tree whose height is log n. B, it stops at the first cell whose stored sum is zero. C, each step clears one of i's set bits, and there are at most log n plus 1 of them. D, each step halves i, so it reaches 0 within log n steps.

[think]

The answer is C: each step clears one of i's set bits.

Subtracting the lowest set bit removes exactly one set bit, and a number up to n has at most log n plus 1 of them. i is not halved: 7 goes to 6, not to 3. No tree height is being climbed, and cells are never tested for zero.

## 3

You need range-minimum queries with arbitrary point updates. Why is a Fenwick tree the wrong tool?

A, minimum has no inverse to turn two prefixes into a range. B, its lowest-bit arithmetic breaks when values are negative. C, storing a minimum per block would need n log n cells. D, its point updates would cost linear time, not log n.

[think]

The answer is A: minimum has no inverse to turn two prefixes into a range.

A Fenwick tree answers prefixes, and a range sum is one prefix minus another, which relies on subtraction. Nothing recovers the minimum of a range from the minimum up to its right end and the minimum before its left end. Memory and update cost are strengths, and the bit tricks work on indices, so negative values are fine.

## 4

To count inversions in the array 40, minus 7, 40, 12 with a Fenwick tree, what is the first thing you do?

A, reverse the array, so later elements are processed first. B, sort the array, so the tree can be filled in value order. C, map each value to its rank: minus 7 to 1, 12 to 2, 40 to 3. D, build a frequency array of size 41, indexed by value.

[think]

The answer is C: map each value to its rank.

Coordinate compression turns arbitrary values, negatives included, into dense indices starting from 1. A frequency array sized by the largest value fails for negatives and wastes memory, and sorting destroys the order the count depends on. Ranks start at 1, because index 0 would never advance in an update.

## 5

For range add with range sum, you keep two Fenwick trees over the difference array: B1 over each difference, and B2 over each difference times its position minus 1. What is the sum of the first i values?

A, i times B1's prefix up to i, minus B2's prefix up to i. B, i times the difference of the two prefixes. C, B1's prefix plus B2's prefix. D, B1's prefix minus i times B2's prefix.

[think]

The answer is A: i times B1's prefix, minus B2's prefix.

Each difference at position t contributes to i minus t plus 1 of the first i values. That splits into i times the sum of the differences, minus the sum of each difference times t minus 1. The first term needs the multiplication by i outside the prefix; the second is B2's prefix, unchanged.

## 6

A call to add 5 at index 0, on a 1-based Fenwick tree, never returns. Why?

A, the lowest set bit of 0 is 0, so adding it never moves i past 0. B, the loop walks down past 0 and reads outside the array. C, negative indices wrap around and restart the walk at n. D, index 0 holds the total, so every cell must be rewritten.

[think]

The answer is A: the lowest set bit of 0 is 0, so i never moves.

The update loop adds the lowest set bit to i on every iteration, and for 0 that is zero. In the 1-based layout, index 0 is the empty prefix, not a cell, which is why implementations convert 0-based indices by adding one at the boundary.
