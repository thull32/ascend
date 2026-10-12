---
lesson: sliding-window-mastery
source: 111abfcf6e9e6c44
---
## 1

Which property makes the longest-window template correct, the one that grows on the right and shrinks on the left while the window is invalid?

A, each element is admitted and evicted at most once, so the loop is linear. B, validity survives growing: every window containing a valid one is valid. C, validity survives shrinking: every sub-window of a valid window is valid. D, the array is sorted, so the window's sum changes monotonically as it moves.

[think]

The answer is C: validity survives shrinking.

That heredity gives two facts: for each right end, the valid starts form a suffix, and the smallest valid start never decreases as the right end advances. So the left pointer never has to move back. Closure under growing is the mirror property, which justifies the shortest-window template instead. The admit-once argument proves the running time, not correctness, and sortedness is what two pointers need, not windows.

## 2

You need the number of subarrays with a sum of exactly S, in an array that contains negative numbers. What is the right tool?

A, at most S, minus at most S minus 1, each with a sliding window. B, prefix sums, with a hash map of prefix counts. C, sort the array, and move two pointers towards S. D, a sliding window that shrinks while the sum exceeds S.

[think]

The answer is B: prefix sums, with a hash map of prefix counts.

The at-most trick needs the at-most version to be hereditary, and with negatives, "sum at most S" is not: dropping a negative element can push the sum over S. Prefix sums turn "a range sums to S" into "two prefixes differ by S", which a hash map counts in linear time. Sorting destroys contiguity.

## 3

A window loop admits each element once and evicts each at most once. But it checks validity by scanning a map of arbitrary integer keys and counting the entries above zero, against k. What is the worst-case running time?

A, n squared. B, linear. C, n times k. D, n log n.

[think]

The answer is A: n squared.

The pointer argument only bounds the number of iterations. Each iteration pays for a scan of the map, and because keys with a count of zero are kept, the map holds every value seen so far, up to n keys, so the total is quadratic. It is not n times k: the window has at most k plus 1 distinct values, but the map is not the window. Keep the distinct count incrementally to make each step constant time.

## 4

In Longest Repeating Character Replacement, the accepted solution never decreases its best letter frequency, even after that letter leaves the window. Why is the final answer still correct?

A, the window grows only when a valid window of the new length exists, even if it is not this one. B, the best frequency is recomputed from the counts after the loop, fixing any stale value. C, a stale best frequency only makes the check stricter, so it can never over-count. D, the window never shrinks, so no letter ever actually leaves it.

[think]

The answer is A: it grows only when a valid window of the new length exists somewhere.

The window's length tracks the best answer so far and grows by at most one per step. A stale frequency can only let the check pass when a valid window one longer exists earlier in the string, since that frequency was reached in a window no longer than that. A failed check means the current window, the only new candidate, is truly invalid. A stale, too-high frequency makes the check more lenient, not stricter, and this argument shows the leniency is safe.

## 5

You need the longest subarray whose greatest common divisor is above 1. The property is closed under shrinking. What is the obstacle, and what fixes it in amortised constant time per step?

A, the gcd is not associative, so a segment tree is needed to combine ranges. B, there is no obstacle; divide the window's gcd by the evicted element. C, the gcd has no inverse when an element leaves; a two-stack queue of running gcds fixes it. D, the gcd cannot be undone on eviction; a monotonic deque of values keeps it in constant time.

[think]

The answer is C: the gcd has no inverse; a two-stack queue of running gcds fixes it.

The gcd is associative, but it cannot be undone, so the window's value cannot be updated on eviction. The two-stack queue stores running aggregates in each stack, and rebuilds the front stack only when it empties, so each element moves once. A monotonic deque works for maximum and minimum because a dominated value can be dropped forever; gcd has no such dominance. A segment tree works, at log n per query, but is heavier than needed.

## 6

The function that counts subarrays with a product below k is run on the array 2, 3 with k equal to 1, without its guard for k at most 1. The shrink loop runs while the product is at least k. What happens?

A, it raises a division-by-zero error, because the product reaches 0 after the evictions. B, it returns 3, because every subarray of two positive integers is counted. C, it returns 0, because the empty window has product 1, which stops the loop. D, it returns minus 1, because the window empties and the loop keeps evicting past the right pointer.

[think]

The answer is D: it returns minus 1.

An empty window has a product of 1, and 1 is still at least 1, so the loop does not stop there. It divides by the next element, making the product 0, moves left past right, and then adds a window length of minus 1. On a different input the same loop reads past the end and raises an index error instead. Any shrink loop must treat the empty window as a legal place to stop, through a guard on k or a check that left has not passed right.
