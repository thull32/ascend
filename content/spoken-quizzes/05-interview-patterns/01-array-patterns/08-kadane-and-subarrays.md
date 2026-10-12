---
lesson: kadane-and-subarrays
source: cda1423cad1455b4
---
## 1

In Kadane's algorithm, what does the running value, cur, hold after processing index i?

A, the maximum sum of any subarray that starts at index i. B, the maximum sum of any subarray within the first i plus 1 elements. C, the running total of every element up to index i. D, the maximum sum of any subarray that ends exactly at i.

[think]

The answer is D: the maximum sum of any subarray that ends exactly at i.

That is what the recurrence needs: the best subarray ending at the next index is either the next element alone, or cur plus the next element. The maximum over everything so far is tracked separately, in best. A running total is the prefix sum, which Kadane's value equals only until the first restart.

## 2

An array is repeated k times, with k a billion, and the array sums to a positive total. Kadane's algorithm on two copies gives B. What is the answer?

A, B alone, since a best subarray never spans more than two copies. B, the total times k, since the whole array is always the best. C, B plus k minus 2 times the total, for the whole middle copies. D, B times k, since every copy contributes a best subarray.

[think]

The answer is C: B plus k minus 2 times the total.

A subarray spanning many copies contains whole middle copies worth the total each, and with a positive total, spanning always beats staying inside one copy. So the answer is the best two-copy subarray plus k minus 2 middle copies. Multiplying B by k counts overlapping pieces. B alone is right only when the total is not positive. And the whole repeated array is not best when a copy starts or ends with negatives, as minus 1, 3, minus 1 shows.

## 3

Why must maximum product subarray track the smallest product ending at each index, as well as the largest?

A, the running product can overflow downwards, and needs a guard. B, a zero resets the running maximum, so the minimum is the backup. C, a negative value turns the smallest product into the largest one. D, the answer may be negative, so it must be tracked separately.

[think]

The answer is C: a negative value turns the smallest product into the largest.

Multiplying a very negative run by a negative value gives a large positive product, as at index 2 of the array 2, minus 5, minus 2, minus 4, 3. Without the smallest product, that run is discarded. Zeros are handled by the ordinary three-way maximum, and negative answers are still found through the largest product and the best so far.

## 4

You need the largest sum over subarrays of length at least L. Which change to Kadane is correct?

A, use a fixed window of width L, and slide it across the array. B, run plain Kadane, and discard the answer if it is shorter than L. C, at every position j, take the prefix sum at j minus the running minimum of the prefix sums up to L positions earlier. D, restart cur only after at least L elements have been added.

[think]

The answer is C: subtract a running minimum of prefix sums that lags L behind.

In the prefix-sum view, the best subarray ending at a position is its prefix sum minus the smallest earlier prefix. The length constraint only restricts which earlier prefixes are allowed, so lag the running minimum by L. Discarding a short answer loses the constrained optimum, a width-L window ignores longer subarrays, and delaying restarts does not bound the length.

## 5

A dataset of a billion numbers is split across 100 machines. What should each machine send, so that the global maximum subarray can be computed?

A, its best subarray sum, so the coordinator takes the maximum. B, its full prefix-sum array, so the coordinator can run Kadane. C, its total, its best prefix, its best suffix, and its best subarray sum. D, its minimum and maximum element, so the extremes can be joined.

[think]

The answer is C: its total, best prefix, best suffix and best subarray sum.

The best subarray may cross shard boundaries, so the coordinator needs each shard's best prefix and suffix, and its total to extend prefixes across whole shards. These four values combine associatively. Sending only the best misses crossing subarrays, sending prefix arrays ships the whole dataset, and extremes carry no information about sums.

## 6

Which of these problems is not solved by a Kadane-style single pass with constant state?

A, the number of contiguous subarrays whose sum equals k. B, the maximum sum of a contiguous subarray, with negatives present. C, the best single buy-then-sell profit over daily prices. D, the largest number of 1s after flipping one segment of a bit array.

[think]

The answer is A: counting the subarrays whose sum equals k.

An exact target has no best-ending-here structure. You need prefix sums and a hash map of prefix counts. The stock problem is Kadane on the daily price differences, and the flip problem is Kadane after mapping each 0 to plus 1 and each 1 to minus 1.
