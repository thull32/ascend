---
slug: find-pivot-index
title: Find the Pivot Index
difficulty: easy
patterns: [prefix-sum]
lists: [ascend-150]
companies: [meta, amazon, microsoft]
order: 3
lesson: interview-patterns/array-patterns/prefix-sum
hints:
  - At index `i`, the right sum is `total - left_sum - nums[i]`. So one number (the total) replaces the whole suffix array.
  - Walk left to right carrying the running left sum. Check `left == total - left - nums[i]` before adding `nums[i]` to `left`.
  - The first index that satisfies it is the answer. Index 0 is a valid pivot when the rest of the array sums to zero.
signatures:
  python:
    name: pivot_index
    starter: |
      def pivot_index(nums: list[int]) -> int:
          pass
  javascript:
    name: pivot_index
    starter: |
      function pivot_index(nums) {
      }
tests:
  - args: [[1, 7, 3, 6, 5, 6]]
    expected: 3
  - args: [[1, 2, 3]]
    expected: -1
    label: no pivot
  - args: [[2, 1, -1]]
    expected: 0
    label: pivot at the left edge
  - args: [[1, -1, 0]]
    expected: 2
    label: pivot at the right edge
  - args: [[5]]
    expected: 0
    label: single element
  - args: [[]]
    expected: -1
    label: empty input
  - args: [[-1, -1, -1, -1, -1, 0]]
    expected: 2
  - args: [[0, 0, 0, 0]]
    expected: 0
    hidden: true
    label: several pivots, return the leftmost
  - args: [[3, 1, 4, 2, 2]]
    expected: 2
    hidden: true
time_limit_ms: 4000
---
You are given an array of integers `nums`. The pivot index is an index `i` where the sum of all elements strictly to the left of `i` equals the sum of all elements strictly to the right of `i`. An empty side has sum `0`.

Return the leftmost pivot index, or `-1` if none exists.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 7, 3, 6, 5, 6]` | `3` | Left `1 + 7 + 3 = 11`, right `5 + 6 = 11` |
| `[2, 1, -1]` | `0` | Left is empty (`0`), right `1 + (-1) = 0` |
| `[0, 0, 0, 0]` | `0` | Every index qualifies; return the first |

### Constraints

- `0 ≤ len(nums) ≤ 10⁴`
- `-1000 ≤ nums[i] ≤ 1000`

### Follow-up

The interviewer asks: "Can you do it without knowing the total up front, in a single left-to-right pass?" Then: "Find an index where the left *average* equals the right *average*."

## Solution

### The naive approach

For each index, sum the left part and sum the right part: `O(n²)`. It is obviously correct and obviously wasteful, since the left sum at `i + 1` is the left sum at `i` plus one element.

### The insight

The left sum is a running total, so carry it. The right sum seems to need a second pass or a suffix array, but `right = total - left - nums[i]`: the whole suffix is determined by one precomputed number. So the algorithm is: compute `total` in one pass, then walk once more with a running `left`, checking the equation at each index before folding `nums[i]` into `left`.

This is prefix sums with the array of prefixes collapsed to a single running value, because you only ever need the *current* prefix, never an arbitrary earlier one.

### The optimal approach

```python
def pivot_index(nums: list[int]) -> int:
    total = sum(nums)
    left = 0
    for i, x in enumerate(nums):
        if left == total - left - x:
            return i
        left += x
    return -1
```

Trace `[1, 7, 3, 6, 5, 6]`, `total = 28`. `i = 0`: `0 == 28 - 0 - 1`? No. `left = 1`. `i = 1`: `1 == 28 - 1 - 7 = 20`? No. `left = 8`. `i = 2`: `8 == 28 - 8 - 3 = 17`? No. `left = 11`. `i = 3`: `11 == 28 - 11 - 6 = 11`. Return 3.

Trace `[2, 1, -1]`, `total = 2`. `i = 0`: `0 == 2 - 0 - 2 = 0`. Return 0.

Time `O(n)`, two passes. Space `O(1)`.

### Common mistakes

- Updating `left` before the check, which includes `nums[i]` on the left side and shifts every answer by one.
- Writing the condition as `left == total - left`, forgetting to exclude the pivot itself.
- Starting the loop at index 1 because "the left side cannot be empty". It can; `[2, 1, -1]` pivots at 0.
- Returning the last pivot found instead of the first, or continuing after a match.

### How to discuss it

Say "right sum is total minus left minus me, so I need one precomputed total and one running sum". Write it, trace an edge-pivot case. For the single-pass follow-up: you genuinely cannot decide "is `i` a pivot?" without knowing the suffix, so a single pass must either read the input twice (which is what computing the total is) or buffer it; if the input is a stream you cannot rewind, you store the prefix sums and resolve at the end, which is `O(n)` space instead of `O(1)`. Recognising that the total is an unavoidable piece of global information is the point. For the averages follow-up: the equation becomes `left / i == (total - left - nums[i]) / (n - 1 - i)`; cross-multiply to stay in integers, and handle the two empty-side cases explicitly since an average of nothing is undefined, which is a question to raise with the interviewer rather than answer silently.
