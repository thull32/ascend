---
lesson: non-comparison-sorts-and-lower-bounds
source: dfc5870971406c44
---
## 1

Why can counting sort run in time n plus k, when the comparison lower bound says sorting needs n log n?

A, indexing by the key's value learns log k bits per step. B, it relies on the input already being nearly sorted. C, spending order k extra memory lets it beat the bound. D, the bound applies only to recursive comparison sorts.

[think]

The answer is A: indexing by the key's value learns log k bits per step.

The decision-tree bound assumes every step is a two-way comparison, which learns one bit. Using a key's value as an array index is a many-way step, so the model, and the bound, do not apply. Extra memory alone does not escape it: merge sort uses linear extra memory and is still n log n. And counting sort works on any input order.

## 2

In least-significant-digit radix sort, what goes wrong if a single digit pass is not stable?

A, nothing, since the last pass fixes earlier mistakes. B, only negative numbers end up in the wrong order. C, elements that tie on this digit lose the order from earlier passes. D, the output is still sorted, but the time becomes quadratic.

[think]

The answer is C: ties on this digit lose the order from earlier passes.

Each pass relies on the previous passes' order surviving among elements that share the current digit. An unstable pass shuffles those ties, so the final output is wrong: 802 and 2 would no longer be sure to come out in the right order after the tens pass. The last pass cannot repair it, because it only orders by its own digit, and the running time is unaffected.

## 3

You need to sort 50 million 32-bit integers. Which approach is likely fastest?

A, merge sort, since its n log n holds on any input. B, bucket sort with 10 buckets, one per leading digit. C, insertion sort, since it is linear on nearly sorted data. D, radix sort on bytes, making four linear passes.

[think]

The answer is D: radix sort on bytes, making four linear passes.

Fixed-width keys and a large n are radix sort's home ground: four passes over n plus 256 buckets, against roughly 26 levels of comparisons for merge sort, whose guarantee does not make it faster. Insertion sort is quadratic unless the data is nearly sorted, and 10 buckets leave 5 million elements in each.

## 4

What is the minimum number of comparisons any comparison sort needs in the worst case, on 8 distinct elements?

A, 28, one per pair of elements. B, 8, one comparison per element. C, 16, since log base 2 of 8 factorial is about 15.3. D, 24, since 8 times log base 2 of 8 is 24.

[think]

The answer is C: 16, since log base 2 of 8 factorial is about 15.3.

There are 40,320 orderings of 8 elements, and a binary decision tree that tells them apart needs a height of at least log base 2 of that, which rounds up to 16. Merge sort manages 17, which already rules out 24: n log n is the growth rate, but log of n factorial is smaller by about 1.44 n. And 28 is insertion sort's worst case, not a lower bound.

## 5

Your input is two sorted arrays, concatenated. Which library sort does close to linear work on it?

A, heap sort, which skips work on ordered input. B, the C plus plus standard sort in libstdc++, through its median-of-three pivots. C, any sort, since sorted input is always fast. D, Python's Timsort, which merges the two sorted runs.

[think]

The answer is D: Python's Timsort, which merges the two sorted runs.

Timsort scans for natural runs, finds two, and does a single merge with galloping. Introsort and heap sort do not exploit existing runs, and a good pivot only balances the partitions, so "any sort" is wrong too. Java's sort for primitives would also do well here, because it checks for a few long runs before partitioning.

## 6

Timsort switches into galloping mode once one run has won 7 comparisons in a row, a threshold called min gallop. What does galloping do, and why is the threshold adaptive?

A, it swaps the two runs, so the shorter one is always copied to the buffer. B, it raises the minimum run length, so later runs are longer and fewer merges are needed. C, it sorts the winning run again, since a long streak suggests it was never sorted. D, it searches exponentially for how far the streak extends and copies the block in one go, backing off when streaks stop paying.

[think]

The answer is D: it searches exponentially for the end of the streak and block-copies, backing off when streaks stop paying.

A streak means many elements of one run come before the next element of the other. An exponential search, then a binary one, finds the boundary in about 2 log k comparisons, and one memory move copies the block. The threshold drops while galloping keeps winning and rises when it does not, so random data, with short streaks, does not pay the search overhead.
