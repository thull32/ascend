---
review: array-patterns
source: 81dc0d8dd0957849
---
## Introduction

Twelve questions from the array-patterns module. Answer out loud before the answer comes.

They run through the module in order: two pointers, sliding windows, prefix sums, binary search, sorting, intervals, cyclic sort, Kadane, and matrix traversal. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

In Container With Most Water, the left line has height 5 and the right line has height 9. Why is moving the right pointer inward never beneficial?

A, it can be; a taller line to the left of the right pointer might raise the area, so you should try both moves. B, because every container that keeps the left line and uses a line further in is narrower, and still capped at height 5. C, because 9 is the tallest line, so no container without it can be taller. D, because width dominates the area, so the widest pair seen so far always wins.

[think]

The answer is B: every such container is narrower and still capped at 5.

A container's height is the shorter of its two lines. With the shorter line fixed at 5, the height cannot rise, and moving inward only shrinks the width. Only moving the shorter line can raise the cap. Nothing says 9 is the tallest line overall, and trying both moves would make the search exponential.

## Question 2

The problem asks for the two indices in an unsorted array whose values sum to a target. A candidate sorts the array and runs two pointers from the ends. What is wrong?

A, two pointers needs non-negative values, and the input may hold negatives. B, nothing; sorting and then sweeping two pointers is the optimal approach here. C, sorting loses the original indices, so a map from value to index fits better. D, two pointers breaks when the array holds duplicate values that could pair.

[think]

The answer is C: sorting loses the original indices.

The positions the sweep returns refer to the sorted array, not the input. You would have to carry the indices through the sort, and at that point a single pass with a value-to-index map is simpler and linear. Negatives and duplicates are no problem for two pointers. Its signal is sorted input where the values, not the positions, are the answer.

## Question 3

You must take exactly k cards from the two ends of a row, some from the left and some from the right, to maximise their total. Which window solves it in linear time?

A, a variable window that grows while its sum stays below the best total seen. B, none; choosing between the two ends needs dynamic programming over how many cards come from each side. C, a window of width n minus k, minimising the sum of the cards left behind. D, a window of width k over the row, maximising the sum of the cards inside it.

[think]

The answer is C: a window of width n minus k, minimising what is left behind.

Whatever split you choose, the cards you do not take form one contiguous block of width n minus k. So the best take is the total minus the lightest such block. A width-k window describes contiguous cards, but the taken cards wrap around the two ends. The dynamic programming approach is correct, just slower and unnecessary.

## Question 4

Return the length of the longest subarray with equal numbers of 0s and 1s. Which plan solves it in linear time?

A, map each 0 to minus 1, then store the first position at which each prefix sum appears. B, keep the values as they are, and store the last position of each prefix sum. C, map each 0 to minus 1, then store how many times each prefix sum appears. D, slide a window that shrinks whenever the 0s outnumber the 1s.

[think]

The answer is A: map 0 to minus 1, and store the first position of each prefix sum.

With 0 as minus 1, a balanced subarray is exactly a subarray that sums to zero, and that lies between two positions with equal prefix sums. For the longest, keep the earliest position of each value. Counts answer how many, not how long. The last position gives the shortest. And balance is not preserved under shrinking, so a window cannot track it.

## Question 5

On the same machine, a JavaScript binary search takes 51 nanoseconds per lookup on a thousand sorted integers, and 343 nanoseconds on a hundred million. The number of probes rises only from 10 to 27. What explains the rest?

A, the JIT deoptimises the loop for large arrays, which runs it in the interpreter. B, later probes miss the caches once the array outgrows them, and wait on main memory. C, Math dot floor becomes slow past two to the 31, which penalises every midpoint. D, typed arrays above ten million elements are paged to disk by the engine.

[think]

The answer is B: later probes miss the caches and wait on main memory.

A small array sits in the fastest cache, and each probe costs a few nanoseconds, mostly a mispredicted branch. A 400 megabyte array is far bigger than the 96 megabyte last-level cache, so the middle probes, which land on elements no recent search touched, each wait on main memory. Layouts like the Eytzinger order or B-tree nodes reduce those misses.

## Question 6

A list of a million integers sorts in 145 milliseconds when it is random, but in 22 milliseconds when it was sorted and then had 10 random pairs swapped. What explains the difference?

A, Timsort finds the long existing runs and merges them, galloping through stretches. B, the swapped list reuses cached comparison results from its earlier sort. C, the specialised integer comparison is only enabled for nearly sorted input. D, nearly sorted input keeps the list in the fastest cache, removing all misses.

[think]

The answer is A: Timsort finds the long runs and merges them.

Timsort scans for ascending or strictly descending runs, so ten swaps leave about twenty long runs. Merging them costs close to one comparison per element, and galloping skips stretches where one run keeps winning. The specialised integer comparison applies to any list of all integers, nothing is cached between sorts, and a million pointers do not fit in the fastest cache either way.

## Question 7

To keep the maximum number of non-overlapping intervals, you sort by end time and keep greedily. Why is sorting by start time wrong?

A, start order fails only when several intervals share the same start. B, an early start can be a long interval that blocks many short ones. C, it is not wrong; both orders keep the same number of intervals. D, start order is fine for the count, but cannot name which intervals to remove.

[think]

The answer is B: an early start can be a long interval that blocks many short ones.

On the intervals 1 to 100, 2 to 3, and 4 to 5, the start-order greedy keeps 1 to 100 and removes the other two, while the optimum removes only one. The exchange argument shows the earliest-ending interval belongs to some optimal solution and leaves the most room for the rest. No such argument exists for the earliest-starting one.

## Question 8

A job computes peak concurrent requests from an access log without sorting it, because the log is already in time order. The peaks come out too low. Why?

A, access logs interleave hosts, so timestamps are only sorted per host. B, each line is written when the request completes, so the log is ordered by end time. C, the sweep needs half-open intervals, and the log stores closed ones. D, Timsort was skipped, so the heap receives its end times in reverse order.

[think]

The answer is B: each line is written at completion, so the log is ordered by end.

Long requests appear after short ones that started later. A sweep that assumes start order closes intervals before it has seen all the starts that overlap them. Sorting by start fixes it, and because the data is nearly sorted, it cost about half as much as sorting random data. Host interleaving and boundary conventions cause other bugs, but not this systematic undercount.

## Question 9

Why is cyclic sort linear time, even though a single index can be examined many times?

A, each index is examined at most twice, by the way the guard is built. B, re-examination happens only on duplicates, which are rare in the input. C, it is really n log n, and the log factor is small enough to ignore. D, each swap puts one value home for good, so there are at most n swaps.

[think]

The answer is D: each swap puts one value home for good, capping swaps at n.

The bound counts swaps, not visits. A value that reaches its home never moves again, so there are at most n swaps, and every iteration that does not swap advances the index, so there are n of those. An index can be revisited many times, not just twice, but each revisit is paid for by a value placed permanently. Duplicates are not needed for revisits; any displaced value causes one.

## Question 10

Find the Duplicate Number forbids modifying the array and requires constant extra space. What is the intended approach?

A, a hash set of the values seen so far, stopping at the first repeat. B, cyclic sort on a copy of the array, then read the first misplaced value. C, XOR every value against the range 1 to n, so that pairs cancel. D, Floyd's cycle detection, on the function from each index to the value stored there.

[think]

The answer is D: Floyd's cycle detection on the index-to-value function.

With n plus 1 indices mapping into the values 1 to n, the path from index 0 must enter a cycle, and the entry point is a value held at two indices: the duplicate. Floyd finds it in linear time and constant space without writing anything. A copy or a hash set costs linear space, and XOR fails when the duplicate appears more than twice or other values are missing.

## Question 11

Which of these problems is not solved by a Kadane-style single pass with constant state?

A, the number of contiguous subarrays whose sum equals k. B, the maximum sum of a contiguous subarray, with negatives present. C, the best single buy-then-sell profit over daily prices. D, the largest number of 1s after flipping one segment of a bit array.

[think]

The answer is A: counting the subarrays whose sum equals k.

An exact target has no best-ending-here structure. You need prefix sums and a hash map of prefix counts. The stock problem is Kadane on the daily price differences, and the flip problem is Kadane after mapping each 0 to plus 1 and each 1 to minus 1.

## Question 12

Which two in-place operations compose to a 90-degree clockwise rotation of a square matrix?

A, reverse the order of the rows, then reverse each row. B, reverse each row, then reverse each column. C, transpose, then reverse the entries of each row. D, transpose, then reverse the entries of each column.

[think]

The answer is C: transpose, then reverse each row.

Transposing sends row i, column j to row j, column i. Reversing each row then sends that to row j, column n minus 1 minus i, which is exactly the clockwise rotation. Transposing and then reversing each column gives the anticlockwise rotation, and the two double reversals give a rotation of 180 degrees.

## Recap

Three ideas kept returning. First, a pattern is justified by an argument about what one move safely discards: the shorter line in Container With Most Water, the earliest-ending interval, a value placed home for good. Second, recognition comes from the shape of the statement, not its words: a block left behind, a balanced subarray as a zero sum, a duplicate as a cycle entry, an exact target as prefix sums. And third, the constant matters: caches, nearly sorted runs, and the order in which a log was written all changed the measured answer.
