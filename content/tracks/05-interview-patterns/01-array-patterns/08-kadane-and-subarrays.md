---
slug: kadane-and-subarrays
title: "Kadane and the subarray family: best subarray ending here"
description: One running value, "the best subarray that ends at this index", solves maximum sum, maximum product and best-time-to-trade in a single pass, and knowing why it works tells you when it does not.
minutes: 28
difficulty: medium
tags: [pattern:subarray, kadane, dynamic-programming, arrays, greedy]
problems: [maximum-subarray, max-product-subarray, best-time-to-buy-sell, subarray-sum-equals-k]
---
An array of integers, some negative. Find the contiguous subarray with the largest sum. There are `n(n+1)/2` subarrays, so enumerating them is `O(n²)` even with prefix sums, and for `n = 10⁵` that is five billion additions. Sorting does not help because contiguity is the whole constraint. A sliding window looks tempting until you notice that adding a negative number sometimes *helps* the eventual answer (the `-1` between `4` and `2, 1` in `[4, -1, 2, 1]` is worth keeping), so there is no rule for when to shrink.

Kadane's algorithm solves it in one pass with two variables. The idea generalises to products, to trading profits, and to a family of "optimal contiguous run" problems, and the reason it works is the reason it fails on the neighbouring problems that look identical.

## The signal

Reach for Kadane when the problem asks you to **optimise over contiguous subarrays** and the objective **decomposes at the right edge**:

- "Maximum (or minimum) sum of a contiguous subarray."
- "Maximum product of a contiguous subarray."
- "Best single buy and sell", which is the maximum sum of a contiguous run of daily price *differences*.
- "Longest run where …" or "largest total where …", whenever you can answer "what is the best run ending exactly here?" from the best run ending one step earlier.

The signal that separates Kadane from its neighbours is the shape of the question:

| Question | Pattern | Why |
|---|---|---|
| Max/min sum or product of *some* subarray | Kadane | The best subarray ending at `i` depends only on the best ending at `i-1` |
| Count or find subarrays whose sum is *exactly* `k` | Prefix sum + hash map ([Prefix sums](/learn/interview-patterns/array-patterns/prefix-sum)) | Exact-target with negatives has no local structure; you need `prefix[j] - prefix[i] = k` |
| Longest/shortest subarray satisfying a *monotone* condition on non-negative data | Sliding window ([Sliding window](/learn/interview-patterns/array-patterns/sliding-window)) | Growing the window only ever makes the condition harder to satisfy, so a two-pointer shrink is safe |
| Max sum with a length constraint `k` | Fixed-size sliding window, or prefix sums | Kadane cannot enforce a length |

Kadane is **not** a sliding window. A sliding window needs a monotone shrink condition: once the window is "too big" by some measure, removing from the left can only help. With negatives in the data, the sum is not monotone in window length, and there is no left-shrink rule that is always correct. Kadane replaces "shrink from the left" with "restart from scratch", and it can only do that because the objective is a sum (or a product), which lets it forget the entire prefix once the prefix is dead weight.

## The template

Define `cur` as the largest sum of any subarray that ends **exactly** at index `i`. There are two candidates: the element alone, or the element appended to the best subarray ending at `i-1`. Take the larger. The global answer is the largest `cur` seen.

```python
def max_subarray(nums: list[int]) -> int:
    best = cur = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)      # extend the previous run, or start fresh at x
        best = max(best, cur)
    return best
```

```javascript
function maxSubarray(nums) {
  let best = nums[0];
  let cur = nums[0];
  for (let i = 1; i < nums.length; i++) {
    const x = nums[i];
    cur = Math.max(x, cur + x);
    best = Math.max(best, cur);
  }
  return best;
}
```

The invariant after processing index `i`: `cur` equals the maximum sum over subarrays ending at `i`, and `best` equals the maximum over all subarrays ending at or before `i`. The `max(x, cur + x)` line is the whole algorithm: `cur + x < x` exactly when `cur < 0`, which is when the prefix is worth abandoning. Many people write the equivalent `cur = x if cur < 0 else cur + x`, which makes the "reset when negative" reasoning explicit.

This is a one-dimensional DP with `dp[i] = max(nums[i], dp[i-1] + nums[i])` where the table has been compressed to a single variable; see [Sequence DP](/learn/algorithms/dynamic-programming/sequence-dp) for the family it belongs to. It is also a greedy argument: no optimal subarray begins with a negative-sum prefix, because dropping that prefix would improve it. Both views give the same code; the DP view is the one that generalises.

```viz
{"type": "array", "algorithm": "kadane", "values": [-2, 1, -3, 4, -1, 2, 1, -5, 4], "title": "Kadane on the classic input", "caption": "Watch cur reset at index 3 when the running sum has gone negative, then survive the -1 at index 4 because the prefix 4 is still worth keeping."}
```

## Worked problems

### Maximum Subarray

Return the largest sum of any contiguous subarray. [Maximum Subarray](/practice/maximum-subarray).

Insight: a subarray ending at `i` either starts at `i` or extends a subarray ending at `i-1`; the best of the latter is `cur`.

Trace on `[-2, 1, -3, 4, -1, 2, 1, -5, 4]`:

| i | x | cur + x | cur = max(x, cur + x) | best |
|---|---|---|---|---|
| 0 | -2 | | -2 | -2 |
| 1 | 1 | -1 | 1 | 1 |
| 2 | -3 | -2 | -2 | 1 |
| 3 | 4 | 2 | 4 | 4 |
| 4 | -1 | 3 | 3 | 4 |
| 5 | 2 | 5 | 5 | 5 |
| 6 | 1 | 6 | 6 | 6 |
| 7 | -5 | 1 | 1 | 6 |
| 8 | 4 | 5 | 5 | 6 |

Answer 6, from `[4, -1, 2, 1]`. Note step 3: `cur + x = 2 < 4`, so the run restarts at 4. Note step 4: `cur + x = 3 > -1`, so the -1 is absorbed, which is what a sliding window could never justify.

`O(n)` time, `O(1)` space. Initialise `best` with `nums[0]`, not `0`: on `[-3, -1, -2]` the answer is -1, and a `best = 0` start returns 0 for the empty subarray, which the problem does not allow.

To also return the indices, record `start` whenever you reset and `(start, i)` whenever `best` improves.

```viz
{"type": "dp", "algorithm": "max-subarray", "values": [5, -3, 5, -7, 4, 2], "title": "The same recurrence as a DP table", "caption": "dp[i] is the best sum ending at i: 5, 2, 7, 0, 4, 6. At i = 3 the choice is max(-7, 7 + (-7)) = 0, so the prefix is kept even though it has been dragged to zero; the answer is 7 from [5, -3, 5]. Check each cell against max(x, dp[i-1] + x)."}
```

### Maximum Product Subarray

Return the largest product of any contiguous subarray. [Maximum Product Subarray](/practice/max-product-subarray).

The one-variable template breaks because a negative number turns the *smallest* product into the largest. Two negatives multiply to a positive, so the best product ending at `i` may come from the worst product ending at `i-1`. Track both.

Insight: keep `hi` (largest product ending here) and `lo` (smallest product ending here). For each `x`, the candidates are `x`, `hi * x`, `lo * x`. Zeros reset both to `x = 0`, which the same three-way max handles without a special case.

Trace on `[-2, 3, -4]`:

| i | x | candidates {x, hi·x, lo·x} | hi | lo | best |
|---|---|---|---|---|---|
| 0 | -2 | | -2 | -2 | -2 |
| 1 | 3 | {3, -6, -6} | 3 | -6 | 3 |
| 2 | -4 | {-4, -12, 24} | 24 | -12 | 24 |

Answer 24, from the whole array. At step 2, the winning candidate is `lo * x`: the worst run ending at index 1 became the best run ending at index 2.

And on `[2, 3, -2, 4]`:

| i | x | candidates | hi | lo | best |
|---|---|---|---|---|---|
| 0 | 2 | | 2 | 2 | 2 |
| 1 | 3 | {3, 6, 6} | 6 | 3 | 6 |
| 2 | -2 | {-2, -12, -6} | -2 | -12 | 6 |
| 3 | 4 | {4, -8, -48} | 4 | -48 | 6 |

Answer 6, from `[2, 3]`. The single negative never pairs with another, so `lo` never becomes useful.

```python
def max_product(nums: list[int]) -> int:
    best = hi = lo = nums[0]
    for x in nums[1:]:
        cands = (x, hi * x, lo * x)
        hi, lo = max(cands), min(cands)
        best = max(best, hi)
    return best
```

`O(n)` time, `O(1)` space. Compute both new values from the *old* `hi` and `lo` (the tuple does this); updating `hi` first and then using it for `lo` is the classic bug.

### Best Time to Buy and Sell Stock

Given daily prices, choose one day to buy and a later day to sell; maximise profit, or return 0 if no profitable trade exists. [Best Time to Buy and Sell Stock](/practice/best-time-to-buy-sell).

Insight: the profit of buying on day `i` and selling on day `j` is `prices[j] - prices[i]`, which is the sum of the daily differences `d[k] = prices[k] - prices[k-1]` for `k` in `i+1..j`. So the best trade is the maximum-sum contiguous subarray of `d`, with one change: the empty trade (profit 0) is allowed, so `cur` is clamped at 0 instead of restarting at `x`.

Trace on `[7, 1, 5, 3, 6, 4]`, differences `d = [-6, 4, -2, 3, -2]`:

| k | d[k] | cur = max(0, cur + d) | best | equivalent min-so-far view: min price, profit if selling now |
|---|---|---|---|---|
| 1 | -6 | 0 | 0 | min 1, profit 0 |
| 2 | 4 | 4 | 4 | min 1, profit 4 |
| 3 | -2 | 2 | 4 | min 1, profit 2 |
| 4 | 3 | 5 | 5 | min 1, profit 5 |
| 5 | -2 | 3 | 5 | min 1, profit 3 |

Answer 5 (buy at 1, sell at 6). The right-hand column is the form most people write directly: track the lowest price so far and the profit from selling today. The two are the same algorithm; `cur` in the Kadane form equals `prices[k] - min_so_far`. Seeing that equivalence is what lets you recognise Kadane in a problem that never mentions subarrays.

`O(n)` time, `O(1)` space.

## Variations

**Minimum subarray sum.** Flip every `max` to `min`. Useful as a building block: the maximum *circular* subarray sum is `max(kadane_max, total - kadane_min)`, unless every element is negative, in which case `total - kadane_min` is the empty subarray and you return `kadane_max`. The exercise below asks for exactly this.

**Return the subarray, not the sum.** Keep a `start` index that you reset to `i` whenever `cur` restarts, and record `(start, i)` whenever `best` improves. Ties: decide up front whether the earliest or the shortest wins, because the interviewer will ask.

**At most one deletion allowed.** Two running values: `keep[i]` (best ending here, no deletion used) and `del[i]` (best ending here, one deletion used, which is `max(keep[i-1], del[i-1] + x)`). This is the standard way to extend Kadane: add a state dimension for each extra decision.

**Two-dimensional maximum-sum submatrix.** Fix a pair of rows, collapse each column between them into a single sum, run Kadane across the collapsed array. `O(rows² · cols)`. The pattern survives because contiguity in one dimension can be enumerated and the other dimension is Kadane.

**Sum exactly `k`, or count of subarrays with sum `k`.** Not Kadane. There is no "best ending here" because the target is exact rather than optimal. Use prefix sums with a hash map of `prefix → count` as in [Subarray Sum Equals K](/practice/subarray-sum-equals-k). Candidates who try to force a window or a Kadane variant onto this problem lose ten minutes; recognising the boundary is the point.

**Multiple transactions, with cooldown or a fee.** These leave Kadane for a small state machine over "holding" and "not holding"; the extension is covered in [Sequence DP](/learn/algorithms/dynamic-programming/sequence-dp).

## Pitfalls

**Initialising `best` to 0.** On an all-negative array the answer is the largest single element, not 0. Start `best` at `nums[0]`, or at negative infinity if the array might be empty and you have decided how to handle that.

**Using the updated `hi` to compute `lo`.** In the product version, `hi = max(x, hi*x, lo*x)` followed by `lo = min(x, hi*x, lo*x)` uses the new `hi` in the second line. Compute both candidates from the old values first (the tuple in the template, or a `prev_hi` temporary).

**Treating zero as a special case in the product version.** Some solutions add `if x == 0: hi = lo = 0; continue`. The general formula already produces `hi = lo = 0` when `x = 0` because `max(0, 0, 0) = 0`. The special case is harmless but it is a place to introduce a bug (forgetting to update `best`).

**Confusing "reset when `cur < 0`" with "skip negative elements".** Kadane does not skip negatives; it absorbs them when the prefix is still worth more than nothing. `[4, -1, 2, 1]` sums to 6 precisely because the -1 is kept.

**Trying to slide a window.** Compare `[2, -1, 3]` (answer 4, keep the -1) with `[2, -5, 3]` (answer 3, drop the prefix). In both arrays the running sum drops when the negative arrives, so any shrink rule that reacts to "the sum went down" treats them identically and gets one of them wrong. Kadane resolves it by comparing the running sum against zero, which only makes sense because the objective is additive. There is no consistent window rule; stop looking for one.

**Overflow in the product version.** In fixed-width languages a run of large values overflows silently. Python does not overflow; JavaScript loses precision above `2⁵³`. State the assumption ("values are small enough that the product fits") or switch to tracking signs and logarithms if the interviewer pushes.

## Exercise

```exercise
id: max-circular-subarray
title: Maximum circular subarray sum
prompt: |
  Given a non-empty array `nums`, return the maximum sum of a non-empty
  contiguous subarray, where the array is treated as circular: a subarray
  may wrap from the last element round to the first, but may not use any
  element more than once.

  Hint on shape: the answer is either an ordinary Kadane maximum, or the
  total minus the minimum-sum subarray (the wrapped case). Handle the
  all-negative array correctly.
languages: [python, javascript]
entry: max_circular_sum
starter:
  python: |
    def max_circular_sum(nums):
        # your code here
        return 0
  javascript: |
    function max_circular_sum(nums) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, -2, 3, -2]]
    expected: 3
  - args: [[5, -3, 5]]
    expected: 10
    label: wraps around
  - args: [[-3, -2, -3]]
    expected: -2
    label: all negative
  - args: [[3, -1, 2, -1]]
    expected: 4
  - args: [[1]]
    expected: 1
    label: single element
  - args: [[-2, 4, -5, 4, -5, 9, 4]]
    expected: 15
    hidden: true
  - args: [[3, -2, 2, -3]]
    expected: 3
    hidden: true
hints:
  - "Run Kadane twice in one pass: once with max to get the best linear subarray, once with min to get the worst."
  - "The wrapped answer is total - min_subarray, because the part you skip is a contiguous block in the middle."
  - "If the best linear sum is negative, every element is negative and the wrapped formula would describe the empty subarray; return the linear answer."
```

## Senior signals

- You describe Kadane as "the best subarray ending at `i`" and can write it as an explicit DP recurrence before compressing it to one variable, which is what makes the product and one-deletion variants routine.
- You say why it is not a sliding window (no monotone shrink condition once negatives are present) instead of trying to make a window work.
- You know the boundary with prefix sums: optimal-over-subarrays is Kadane, exact-target-over-subarrays is prefix sum plus hash map.
- You recognise best-time-to-buy-sell as Kadane on differences and can show that `cur` equals `price - min_so_far`.
- You initialise `best` from the data, not from zero, and test an all-negative array first.
- You handle the product version by tracking both extremes from the *old* values and can explain why a zero needs no special case.

## Check yourself

```quiz
- q: >-
    In Kadane's algorithm, what does `cur` represent after processing index i?
  options: ["The maximum sum of any subarray in nums[0..i]", "The maximum sum of any subarray that ends exactly at index i", "The sum of nums[0..i]", "The maximum element in nums[0..i]"]
  answer: 1
  explanation: >-
    cur is the best subarray that ends at i, which is what the recurrence needs: the best ending at i+1 is either nums[i+1] alone or cur plus nums[i+1]. The global maximum is tracked separately in best.
- q: >-
    Why can a sliding window not solve maximum subarray sum when the array contains negative numbers?
  options: ["Windows only work on strings", "A window requires the array to be sorted", "Growing the window does not change the sum monotonically, so there is no rule for when shrinking from the left is safe", "The window would need O(n) extra space"]
  answer: 2
  explanation: >-
    Sliding window relies on a monotone condition: adding elements only ever makes it worse in one direction. With negatives, adding an element can raise or lower the sum, so no left-shrink rule is always correct. Kadane replaces shrinking with restarting, which is only valid because the objective is additive.
- q: >-
    For maximum product subarray, why must you track the minimum product ending at each index as well as the maximum?
  options: ["To handle zeros", "Because a negative number turns the smallest product so far into the largest", "To detect overflow", "Because the product can be fractional"]
  answer: 1
  explanation: >-
    Multiplying a very negative running product by a negative x yields a large positive value. Without lo, the algorithm would have discarded that negative run and missed the answer. Zeros are handled by the ordinary three-way max without special tracking.
- q: >-
    You run Kadane with best initialised to 0 on [-4, -1, -7]. What is returned, and is it correct?
  options: ["-1, correct", "0, correct because the empty subarray has sum 0", "0, incorrect because the problem requires a non-empty subarray", "-12, incorrect"]
  answer: 2
  explanation: >-
    Every cur is negative so best never rises above its initial 0. The problem asks for a non-empty subarray, whose true maximum is -1. Initialise best with nums[0].
- q: >-
    Which of these problems is NOT solved by a Kadane-style single pass?
  options: ["Maximum sum of a contiguous subarray", "Best single buy-then-sell profit", "Number of contiguous subarrays whose sum equals k, with negatives present", "Maximum product of a contiguous subarray"]
  answer: 2
  explanation: >-
    An exact target has no best-ending-here structure; you need prefix sums and a hash map of prefix counts. The other three all decompose at the right edge and admit the running-value recurrence.
```
