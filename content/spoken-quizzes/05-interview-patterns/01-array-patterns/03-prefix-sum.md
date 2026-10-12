---
lesson: prefix-sum
source: eb58c032c978ac35
---
## 1

Return the length of the longest subarray with equal numbers of 0s and 1s. Which plan solves it in linear time?

A, map each 0 to minus 1, then store the first position at which each prefix sum appears. B, keep the values as they are, and store the last position of each prefix sum. C, map each 0 to minus 1, then store how many times each prefix sum appears. D, slide a window that shrinks whenever the 0s outnumber the 1s.

[think]

The answer is A: map 0 to minus 1, and store the first position of each prefix sum.

With 0 as minus 1, a balanced subarray is exactly a subarray that sums to zero, and that lies between two positions with equal prefix sums. For the longest, keep the earliest position of each value. Counts answer how many, not how long. The last position gives the shortest. And balance is not preserved under shrinking, so a window cannot track it.

## 2

In the longest-subarray-with-sum-k template, the line that records the first position of each prefix runs on every iteration, instead of only when the prefix is new. What does the input 0, 0, 0 with k equal to 0 return?

A, 1, since each lookup finds the position just before the current one. B, 0, since the lookup happens after the current prefix is overwritten. C, 2, since the seed at position 0 is kept while the later ones move. D, 3, since overwriting the map does not change which prefixes exist.

[think]

The answer is A: 1, since each lookup finds the position just before.

Every prefix is 0, so at each position the lookup of 0 finds the most recent position, one step back, and the best length is 1. Keeping the first position, 0, would give 3. The seed is overwritten at position 1, so it is not kept, and in the template the lookup comes before the insert.

## 3

A prefix array of floats over a million values, each between 0 and 1, gives errors around 10 to the minus 14 for short ranges at the start, but around 10 to the minus 10 for equally short ranges at the end. Why?

A, the hash map loses precision once the keys exceed 2 to the 53. B, float subtraction is not commutative, so the order changes the result. C, the error of a difference of two prefixes scales with the size of the prefixes. D, later elements were rounded more heavily when the list was built.

[think]

The answer is C: the error of a difference of prefixes scales with their size.

Each prefix carries rounding error in proportion to its own magnitude. Near the end the prefixes are around half a million, so their difference inherits an absolute error far larger than a short range's true value would suggest. The inputs are unchanged, nothing here passes 2 to the 53, and float subtraction is commutative in the sense that matters.

## 4

In CPython 3.14, the built-in sum over a million copies of 0.1 returns exactly 100 thousand, but the last value from itertools accumulate over the same list is 100 thousand and about 1.3 millionths. Why do they differ?

A, accumulate uses 32-bit floats internally to save memory on long inputs. B, since Python 3.12, sum compensates for float rounding, while accumulate adds plainly. C, accumulate starts from 0.1 rather than 0.0, which shifts every total. D, sum sorts its input before adding, which reduces the rounding error.

[think]

The answer is B: since 3.12, sum compensates for rounding, and accumulate adds plainly.

CPython 3.12 changed the built-in sum to use Neumaier compensated summation for floats, so it returns the correctly rounded total here. Accumulate performs ordinary float additions and matches a plain loop. Both use 64-bit doubles, sum does not sort, and the starting value does not explain this error.

## 5

Follow-up: the array now arrives as a stream, and between queries new elements are appended. Nothing already seen is ever edited. What happens to the prefix-array solution?

A, queries become order log n, since the prefix array must be binary searched. B, each append extends the prefix array in constant time, and queries stay constant time. C, it no longer works, since prefix sums need the whole array first. D, each append forces a linear rebuild, so switch to a Fenwick tree.

[think]

The answer is B: each append extends the prefix array in constant time, and queries stay constant.

An append adds the last prefix plus the new value at the end, and invalidates nothing, so the structure is ideal for append-only data. Edits to earlier elements are what force a rebuild and justify a Fenwick tree. No search is involved in a range query.

## 6

You want the longest subarray with sum at most k, where values can be negative. Which approach is correct?

A, binary search the running maximum of the prefix sums for each end, in order n log n. B, a hash map of first positions, looking up the prefix minus k at each step. C, a sliding window that shrinks while the window's sum exceeds k. D, a difference array over the input, followed by one prefix pass.

[think]

The answer is A: binary search the running prefix maximum for each end.

You need the smallest start whose prefix is at least the current prefix minus k, which is an inequality. The running maximum of the prefixes never decreases, and the first position where it reaches a value is the first position where the prefix itself does, so a binary search finds the start. A hash map matches only exact values. A window needs a property that survives shrinking, and negatives destroy it. A difference array answers range updates.
