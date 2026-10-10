---
lesson: divide-and-conquer-thinking
source: 6652bd57ae62e13d
fit: partial
desk:
  - "The generic recursive skeleton annotated with a, b and f of n"
  - "Merge sort's recursion tree on eight values, with the work-per-level table, and the master theorem case table"
  - "The merge sort and count-inversions code, and the every-merge inversion table on eight values"
  - "Under the hood: Timsort, call-stack costs, slice costs, and the inversion-counter comparison table"
  - "Exercises: count inversions with merge sort, and maximum subarray by divide and conquer"
---
## Introduction

Two engineers each write a recursive function that splits an array in half, recurses on both halves and combines the results. One runs in a few milliseconds on a million elements. The other takes minutes. The code looks nearly identical. The difference is entirely in the combine step: one merges in a single pass, the other does something quadratic, and neither engineer noticed, because neither wrote down the recurrence.

Divide and conquer is three steps: split the input into smaller instances of the same problem, solve them recursively, combine the answers. The pattern is easy. The engineering is in the recurrence, because it tells you before you run anything whether the recursion is buying you something or merely rearranging the same work.

Three ideas. How to read the recurrence off the code and solve it with a picture. The master theorem as a lookup. And how a one-line change to merge sort's combine step counts inversions for free.

## Reading the recurrence off the code

Every divide-and-conquer function has three numbers. Call them a, b and f. a is how many recursive calls it makes. b is how many times smaller each call's input is. And f of n is the non-recursive work at this level, the splitting and combining. The cost is a copies of the cost on n over b, plus f of n.

Merge sort: two calls, each on half, and a linear merge. Binary search: one call on half, constant work. Karatsuba multiplication, in the next lesson: three calls on half, linear work. Writing those three numbers down is the whole skill. The rest is a lookup.

One trap before the lookup. In Python, slicing a list copies it. So the split itself costs linear time even when the algorithm's logic says constant. For merge sort that changes nothing, because the merge was already linear. But it turns binary search from constant work per level into linear work per level, and the whole search from logarithmic into linear, silently. The lesson measured it on a million elements: about 1.6 milliseconds per search with slices, against 0.8 microseconds with indices. A factor of two thousand. Pass indices, not slices, when f of n matters.

## The recursion tree

Unroll the recurrence into a tree. The root does f of n work. Its a children each do f of n over b. Their children do f of n over b squared, and so on down to the leaves. The total is the sum over levels.

For merge sort, picture eight values. The root merges 8 elements. The next level has two merges of 4, total 8. Then four merges of 2, total 8. Then eight single elements, which are base cases. Three levels of 8 moves each: 24, which is 8 times log base 2 of 8. Double n and you add one more level of n work. That is what n log n means operationally.

The tree also shows the three regimes the master theorem formalises. If work per level shrinks going down, the root dominates and the total is just f of n. If every level does the same work, the total is f of n times the number of levels, which adds a log factor. If work grows going down, the leaves dominate, and the total is the number of leaves: n to the power log base b of a.

## The master theorem as a lookup

So compare f of n with the leaf count, n to the log base b of a. Call that exponent c. Below it, leaves win. Equal, multiply by log n. Above it, the root wins.

Run the lookups you should be able to do in your head. Binary search: one call, halving, so c is zero, and constant work matches it. Balanced case: order log n.

Naive divide-and-conquer multiplication: four calls on half the input with linear combining. c is log base 2 of 4, which is 2. Linear is below that, so the leaves dominate: n squared. Four subproblems bought nothing over the schoolbook method.

Before I say the next one: Karatsuba makes three calls on half instead of four. What does that change?

[pause]

c becomes log base 2 of 3, about 1.585. Still above the linear combine, so the leaves still win, but there are fewer of them: n to the 1.585. That one fewer subproblem is the whole improvement. Strassen's matrix multiplication is the same move: seven calls instead of eight, and the exponent drops from 3 to about 2.807.

A divide and conquer with a quadratic combine, two calls on half plus n squared work: c is 1, the combine is above it, so the root dominates and the total is n squared. The recursion is decoration; a plain nested loop would be the same complexity and simpler.

And the awkward one: two calls on half plus n log n combining. That is not polynomially bigger than n, so the basic theorem does not apply. The extended form, and the tree, both give n times log squared n.

The theorem has gaps. Unequal splits, like a third and two thirds, are still n log n by the tree. And a split that shrinks by one, T of n minus 1 plus n, is not divide and conquer at all. It has n levels and costs n squared, and it is really a loop. When in doubt, draw the tree. The master theorem is a shortcut for the common cases, not the theory.

## Inversions: a combine step that does more

An inversion is a pair of positions where the earlier value is bigger than the later one. It is the standard measure of how unsorted an array is: a sorted array has none, a reversed one has every pair. The brute force checks every pair, n squared.

Now watch merge sort's merge. When it takes an element from the right half before the next element of the left half, it is because that left element is bigger. But the left half is sorted, so every element still waiting in the left half is also bigger. And every one of them came before that right element in the original array. So that single step has found as many inversions as there are elements left waiting on the left.

Try it on 2, 4, 1, 3, 5. Split into 2, 4 and 1, 3, 5. Both halves are already sorted. Merge. Compare 2 with 1: take 1, and both 2 and 4 are still waiting, so that is two inversions. Compare 2 with 3: take 2. Compare 4 with 3: take 3, and 4 is waiting, one more. Then 4, then 5. Three inversions: 2 before 1, 4 before 1, 4 before 3.

The count was free. The merge already did the comparisons; you only had to notice what a comparison implied. The recurrence is unchanged, two halves plus linear, so inversion counting is n log n. That is the pattern to keep: divide and conquer gives you a place, the combine step, where the two halves meet, and any question about pairs that straddle the split can often be answered there in linear time.

Two details decide whether it is right. Ties: on equal values, take from the left. Take from the right and equal elements get counted as inversions; on 2, 2, 1 the right answer is 2 and the wrong comparison gives 3. And size: the maximum count, n times n minus 1 over 2, passes the 32-bit limit at 65,537 elements. A Java port with an int counter returns a negative number on a reversed array of 100 thousand. Use a 64-bit counter.

## When the split is not in the middle

The recurrence punishes unequal splits. Quicksort with a good pivot is two halves plus linear. With the worst pivot it is one call on n minus 1, plus linear: n squared, and fast on random input while timing out on sorted input.

Recursing into only one side is the opposite. Quickselect recurses into one half with linear partitioning: the root dominates, and the total is linear, which is why it beats sorting. Median of Two Sorted Arrays discards a constant fraction of the search space each step with constant work, so it is logarithmic.

Maximum subarray shows divide and conquer as an honest but beaten solution. Split in the middle; the best subarray is entirely left, entirely right, or crosses the middle, and the crossing case takes one linear scan outward from the middle. n log n. Kadane's algorithm does it in one linear pass. A senior engineer presents Kadane, and explains why the divide-and-conquer version is the one that generalises: its per-segment summaries, best left, best right, best crossing, are exactly what a segment tree node stores.

## Under the hood, briefly

Python's sorted is Timsort, the same two-pointer merge in C, plus detection of already-sorted runs. A hand-written merge sort on 200 thousand random integers took 176 milliseconds against 22 for sorted, about eight times slower. And on already-sorted input, sorted finishes in linear time, 1.6 milliseconds. So when you need the sort, call the library. Write the merge yourself only when you need the combine step for something the library cannot give you, like inversions.

Recursion depth is not a worry for balanced splits: merge sort on a million elements is 20 frames deep. Only the shrink-by-one shape reaches Python's default limit of 1,000.

## In the interview

"Count the pairs where the earlier value is more than twice the later one."

[pause]

Same merge sort, but the counting can no longer ride on the merge comparison, because the condition is not the sort order. Before merging, run a separate two-pointer pass over the two sorted halves, linear per level, then merge as usual. Still n log n. The wrong answer is changing the merge condition itself, which breaks the sort and therefore every later merge.

"Why is the median-of-two-sorted-arrays recurrence one call on half, and not two?" Each step discards a constant fraction of one array without recursing into the other. Only one subproblem survives, so the leaves never multiply and the cost is the depth. "Because the arrays are sorted" is the precondition, not the recurrence.

## Recap

Four things to remember. Write the recurrence before the code: how many calls, how much smaller, how much combine work. Compare the combine with n to the log base b of a, and draw the tree when the theorem does not fit. Four half-size subproblems give n squared, three give n to the 1.585, and a quadratic combine makes the recursion pointless. And the combine step is where the halves meet, so pair questions like inversions come free there, as long as ties go left and the counter is 64 bits.

At your desk: the annotated skeleton, the recursion tree and master theorem table, the merge and inversion code with the eight-value table, the Timsort and slice measurements, and the two exercises.
