---
lesson: divide-and-conquer-thinking
source: 45bae668121d7289
---
## 1

A recursive function makes 4 calls on inputs of half the size, and does linear work to combine. What is its complexity?

A, n squared. B, n log n. C, n to the 1.585. D, linear.

[think]

The answer is A: n squared.

Log base 2 of 4 is 2, so the leaves contribute n squared. The linear combine is polynomially smaller, the master theorem's first case, so the leaves dominate and the total is n squared. Four half-size subproblems is exactly what naive divide-and-conquer multiplication does, which is why it gains nothing.

## 2

Merge sort written with Python slices is still n log n, but binary search written with slices becomes linear. Why the difference?

A, merge sort already does linear work per call, so the slice is absorbed; binary search did constant work. B, merge sort splits the slice cost across its two calls, so each call pays only half. C, merge sort frees each slice after merging, while binary search keeps every slice alive. D, merge sort slices only at the top level; its deeper calls reuse the same lists.

[think]

The answer is A: merge sort already does linear work per call, so the slice is absorbed.

The recurrence's combine term absorbs the slice cost. For merge sort it goes from n to 2 n, the same class, because the merge was already linear. For binary search it goes from constant to linear, which turns the whole search linear. Sharing the cost is not the reason: every call on n elements pays for its own slices, and that only hurts when the combine was less than linear.

## 3

During a merge, the left half holds 2, 4 and 7, and the right half holds 1, 5 and 6. The 1 from the right is taken first. How many inversions does that single step account for?

A, 0. B, 1. C, 2. D, 3.

[think]

The answer is D: 3.

Every element still waiting in the left half, 2, 4 and 7, is greater than 1 and came before it in the original array, so 3 inversions are found at once. That is why the count adds the number of elements left in the left half, not 1, and why nothing needs counting separately at the end.

## 4

Which recurrence does the master theorem not directly solve?

A, T of n equals T of n minus 1, plus n. B, T of n equals T of n over 2, plus 1. C, T of n equals 2 T of n over 2, plus n. D, T of n equals 7 T of n over 2, plus n squared.

[think]

The answer is A: T of n equals T of n minus 1, plus n.

The theorem needs the input to shrink by a constant factor greater than 1. Subtracting one is not a divide-and-conquer shape: the recursion tree has n levels of decreasing linear work, summing to n squared, and the recursion is really a loop.

## 5

The divide-and-conquer maximum-subarray algorithm is n log n, while Kadane's is linear. Why is the slower one still worth knowing?

A, its per-segment summaries are what a segment tree stores, enabling range queries. B, its recursion has better cache locality than Kadane's pass, so it is faster on real hardware. C, it handles all-negative arrays, which Kadane's pass cannot do without a fix. D, it uses log n stack space, less than the linear table Kadane's algorithm needs.

[think]

The answer is A: its per-segment summaries are what a segment tree stores.

Kadane is a single pass, with no structure to reuse. The divide-and-conquer decomposition, the best from the left, from the right, and crossing the middle, for each segment, is exactly what a segment tree node holds. That lets you answer maximum-subarray queries on any range after point updates, in log n. Kadane's needs no table, handles all-negative input when started from the first element, and is as cache-friendly as code gets.

## 6

A Java port of the inversion counter keeps the count in an int, and returns a negative number for a reversed array of 100 thousand elements. Why, and at what size does the problem start?

A, n times n minus 1, over 2, exceeds the largest int once n reaches 65,537, so the count wraps; use a long. B, Timsort's run detection skipped merges, so counts were lost. C, the count of remaining left elements goes negative when the right half is exhausted; clamp it at zero. D, the recursion depth overflowed the JVM stack; increase the thread stack size.

[think]

The answer is A: the count passes the largest int at 65,537 elements, and wraps; use a long.

A reversed array has every pair inverted, n times n minus 1 over 2 of them, which passes about 2.1 billion between 65,536 and 65,537 elements. Java wraps silently, JavaScript stays exact up to 2 to the 53, and Python never overflows. The recursion is only 17 deep, the remaining count is never negative, and the counting code does not use the library sort.
