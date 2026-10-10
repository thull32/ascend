---
review: sorting-searching
source: aa23c1543502da19
---
## Introduction

Twelve questions from the sorting and searching module: comparison sorts, the sorts that beat n log n, binary search, binary search on the answer, and selection. Each has four options. Answer out loud before the answer comes.

## Question 1

You sort a million records by department, then by salary, and you expect records with equal salary to stay grouped by department. Which sort makes that work without a composite key?

A, an in-place sort, such as heap sort or introsort. B, any comparison sort that runs in n log n time. C, a stable sort, such as merge sort or Timsort. D, quicksort with a random pivot, to avoid bias.

[think]

The answer is C: a stable sort, such as merge sort or Timsort. Only a stable sort preserves the department order among equal salaries. Running time says nothing about stability, and a random pivot does not help. In-place is a different property: quicksort and heap sort both work in place, yet move equal elements past each other, so the earlier ordering is destroyed.

## Question 2

Heap sort has an n log n worst case and constant extra space, yet library sorts are built on quicksort or merge sort. What is the main reason?

A, building the initial heap costs n log n. B, duplicate keys degrade it to quadratic time. C, sift-down's scattered memory accesses miss the cache. D, its instability rules it out for library use.

[think]

The answer is C: sift-down's scattered accesses miss the cache. Heap sort jumps from index i to 2i plus 1 to 4i plus 3, which defeats the cache and the prefetcher, while partition and merge scan memory in order. Instability is true, but quicksort is unstable too. Building the heap is linear, and duplicates do not hurt heap sort's bound.

## Question 3

A quicksort recurses on the smaller partition and loops on the larger one, instead of recursing on both. What does this change?

A, the worst-case time drops from n squared to n log n. B, the stack depth is capped at about log n on any input. C, equal keys stop causing lopsided partitions. D, the partition step no longer needs a pivot choice.

[think]

The answer is B: the stack depth is capped at about log n on any input. The recursive call is always on a side of at most half the elements, so nested calls cannot go deeper than log n, even with the worst pivots. The time bound is unchanged; a bad pivot still costs n squared, which is what introsort's depth limit fixes. Equal keys are a partition-scheme problem, solved by three-way partitioning.

## Question 4

Why can counting sort run in time n plus k, when the comparison lower bound says sorting needs n log n?

A, indexing by the key's value learns log k bits per step. B, it relies on the input already being nearly sorted. C, spending order k extra memory lets it beat the bound. D, the bound applies only to recursive comparison sorts.

[think]

The answer is A: indexing by the key's value learns log k bits per step. The decision-tree bound assumes every step is a two-way comparison, which learns one bit. Using a value as an array index is a many-way step, so the model, and the bound, do not apply. Extra memory alone does not escape it: merge sort uses linear extra memory and is still n log n.

## Question 5

In least-significant-digit radix sort, what goes wrong if a single digit pass is not stable?

A, nothing, since the last pass fixes earlier mistakes. B, only negative numbers end up in the wrong order. C, elements that tie on this digit lose the order from earlier passes. D, the output is still sorted, but the time becomes quadratic.

[think]

The answer is C: ties on this digit lose the order from earlier passes. Each pass relies on the previous passes' order surviving among elements that share the current digit. An unstable pass shuffles those ties, so the final output is wrong. The last pass cannot repair it, because it only orders by its own digit, and the running time is unaffected.

## Question 6

Your input is two sorted arrays, concatenated. Which library sort does close to linear work on it?

A, heap sort, which skips work on ordered input. B, the C plus plus standard sort, through its median-of-three pivots. C, any sort, since sorted input is always fast. D, Python's Timsort, which merges the two sorted runs.

[think]

The answer is D: Python's Timsort. It scans for natural runs, finds two, and does a single galloping merge. Introsort and heap sort do not exploit existing runs, and a good pivot only balances the partitions, so "any sort" is wrong too.

## Question 7

When you binary search over doubles, why is a fixed number of iterations preferred over looping while hi minus lo is bigger than 10 to the minus 9?

A, epsilon tests lose accuracy as the interval shrinks. B, subtracting lo from hi can overflow for large doubles. C, it is faster, because it skips a comparison per step. D, doubles near large values are spaced wider than 10 to the minus 9.

[think]

The answer is D: doubles near large values are spaced wider than the epsilon. At large magnitudes, the midpoint equals lo or hi, the range stops shrinking, and the epsilon loop never ends. A hundred halvings always terminate and go beyond double precision anyway. Speed is not the reason, and subtracting doubles does not overflow the way adding integers can.

## Question 8

You search a rotated sorted array, and duplicates are allowed, as in 1, 1, 1, 0, 1. What does the guaranteed complexity become?

A, linear, because equal endpoints hide which half is sorted. B, log n, since one half is always sorted. C, unbounded, since the loop may never terminate. D, log squared n, from a nested search per probe.

[think]

The answer is A: linear. One half is still sorted, but when the first and middle elements are equal you cannot tell which, so the safe move is to shrink the range by one. That always makes progress, so it terminates, but an all-equal array with one odd element forces n such steps.

## Question 9

Which of these is not a valid target for binary search on the answer?

A, the minimum number of coins needed to make amount x, searched over x. B, the smallest ship capacity that delivers packages in d days. C, the smallest eating speed that finishes the piles in h hours. D, the largest minimum distance when placing k cows in n stalls.

[think]

The answer is A: minimum coins for amount x. Coins needed is not monotone in the amount: amount 6 may need one coin and amount 7 three, so there is no false-then-true shape. The other three each have a threshold that, once satisfied, stays satisfied as it grows, or, for the cows, as it shrinks.

## Question 10

In split-array, the predicate greedily extends the current piece as far as it can under the cap. Why does that greedy compute the minimum number of pieces for that cap?

A, it works because the input array is sorted. B, it is only a heuristic; dynamic programming gives the exact count. C, moving any earlier cut to the right never adds an extra piece. D, with small k, the greedy happens to match the dynamic programming answer.

[think]

The answer is C: moving any earlier cut right never adds an extra piece. Any solution that cuts earlier can have its cut moved right without exceeding the cap, so cutting as late as possible never costs a piece. That exchange argument makes the predicate exact for any k. Sortedness is irrelevant, because the pieces are contiguous.

## Question 11

Quickselect with random pivots is expected linear time, while quicksort is expected n log n. What accounts for the difference?

A, its random pivot guarantees an even split every time. B, its partition does fewer comparisons per element scanned. C, quicksort must also keep equal keys in their input order. D, recursing on only one side makes the work a geometric series.

[think]

The answer is D: one-sided recursion makes the work a geometric series. Both use the same partition. Sorting must process every element at every level, n per level for log n levels. Selection discards the side that cannot hold index k, so the sizes shrink geometrically: n, plus three quarters of n, and so on. A random pivot guarantees nothing about any single split; it only makes good splits likely.

## Question 12

Median of medians uses groups of 5. Why not groups of 3?

A, the fractions one third and two thirds sum to one, so it becomes n log n. B, the pivot is no longer guaranteed to avoid the outer 30 percent. C, sorting groups of 3 costs more comparisons per element. D, the recursion on the n over 3 medians makes it quadratic in the worst case.

[think]

The answer is A: one third plus two thirds is one, so it becomes n log n. The linear bound needs the two recursive fractions to sum to less than one. With groups of 5 they are one fifth plus seven tenths, nine tenths. With groups of 3 they sum to one, and the recurrence solves to n log n, not n squared. The pivot is still central; the problem is that the recursive call on the medians is too large.

## Recap

Three ideas kept coming back. The cost that decides a race is often not the one big O counts: cache misses sink heap sort, and stack depth, not time, is what recursing on the smaller side fixes. Stability is a contract that whole algorithms lean on, from two-key sorts to every pass of radix sort. And binary search, on an array or on the answer, is only as good as its invariant and its monotone predicate: lose monotonicity, or let the range stop shrinking, and it fails silently or never ends.
