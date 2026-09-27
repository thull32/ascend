---
slug: max-product-subarray
title: Maximum Product Subarray
difficulty: medium
patterns: [dynamic-programming]
lists: [ascend-150]
companies: [amazon, linkedin, microsoft, google]
order: 9
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Kadane's idea (best subarray ending here) almost works, but multiplying by a negative number turns the smallest product into the largest."
  - "Track two values for the subarray ending at each index: the maximum product and the minimum product."
  - "At each element `x`, the new maximum and minimum are among `x`, `max_prev * x` and `min_prev * x`. A zero resets both."
signatures:
  python:
    name: max_product
    starter: |
      def max_product(nums: list[int]) -> int:
          pass
  javascript:
    name: max_product
    starter: |
      function max_product(nums) {
      }
tests:
  - args: [[3, -1, 4]]
    expected: 4
  - args: [[-2, 3, -4]]
    expected: 24
    label: two negatives cancel
  - args: [[-2]]
    expected: -2
    label: a single negative element
  - args: [[0, 2]]
    expected: 2
  - args: [[-1, -3, -10, 0, 60]]
    expected: 60
    label: zero splits the array
  - args: [[2, -5, -2, -4, 3]]
    expected: 24
  - args: [[-3, 0, -2]]
    expected: 0
    label: the best is the zero itself
  - args: [[6, -3, -10, 0, 2]]
    expected: 180
    hidden: true
  - args: [[-1, -1]]
    expected: 1
    hidden: true
  - args: [[1, -2, -3, 0, 7, -8, -2]]
    expected: 112
    hidden: true
  - args: [[-4, 0, -5, 0]]
    expected: 0
    hidden: true
time_limit_ms: 4000
---
Given an integer array `nums`, return the largest product of any non-empty contiguous subarray.

### Examples

| Input | Output | Why |
|---|---|---|
| `[3, -1, 4]` | `4` | `[4]`; any subarray containing `-1` has a negative product or is `-1` itself |
| `[-2, 3, -4]` | `24` | The whole array: the two negatives cancel |
| `[-3, 0, -2]` | `0` | Every non-empty subarray without the zero is negative |

### Constraints

- `1 ≤ len(nums) ≤ 2 × 10⁴`
- `-10 ≤ nums[i] ≤ 10`
- The product of every subarray fits in a signed 32-bit integer.

### Follow-up

The interviewer asks: "Why is tracking only the maximum, as in maximum *sum* subarray, not enough?" Then: "Drop the 32-bit guarantee: values up to `10⁹` and length up to `10⁵`. What breaks, and how do you compare products without computing them?"

## Solution

### The naive approach

Fix each start `i`, extend to every end `j` keeping a running product, and track the maximum: `O(n²)` time, `O(1)` space. For `n = 2 × 10⁴` that is `2 × 10⁸` multiplications, too slow in an interpreted language.

### The insight

For maximum *sum*, Kadane keeps one number per position: the best sum of a subarray ending here, `max(x, best_prev + x)`. That works because adding `x` preserves order: a bigger previous sum always gives a bigger new sum.

Multiplication by a negative reverses order. If the previous subarrays ending at `i - 1` have products 5 and −20, then after multiplying by −2 they become −10 and 40: the *smallest* one became the largest. So you need both extremes at every position. With both in hand, the new maximum is one of three candidates: start fresh at `x`, extend the previous maximum, or extend the previous minimum. The same three candidates give the new minimum.

### The DP

- **State.** `hi[i]` and `lo[i]` are the maximum and minimum product of a subarray that ends exactly at index `i`.
- **Transition.** With `x = nums[i]`: `hi[i] = max(x, hi[i-1]·x, lo[i-1]·x)` and `lo[i] = min(x, hi[i-1]·x, lo[i-1]·x)`.
- **Base case.** `hi[0] = lo[0] = nums[0]`.
- **Iteration order.** Left to right.
- **Answer.** `max(hi[i])` over all `i`. The answer is not `hi[n-1]`: the best subarray can end anywhere.

A zero needs no special case: all three candidates become `0` (or `x = 0`), so both `hi` and `lo` reset to 0 and the next element starts fresh via the `x` candidate.

### Worked table for `[2, -5, -2, -4, 3]`

| `i` | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| `x` | 2 | −5 | −2 | −4 | 3 |
| candidates `x`, `hi·x`, `lo·x` | – | −5, −10, −10 | −2, 10, **20** | −4, −80, 8 | 3, **24**, −240 |
| `hi[i]` | 2 | −5 | 20 | 8 | 24 |
| `lo[i]` | 2 | −10 | −2 | −80 | −240 |
| best so far | 2 | 2 | 20 | 20 | **24** |

At `i = 2`, the maximum 20 comes from the previous *minimum* (−10, the product of `[2, −5]`) times −2. At `i = 4`, the best subarray `[−2, −4, 3]` wins with 24. Had you tracked only the maximum, you would have lost the −10 at `i = 1` and never found 20.

### Tabulated version

```python
def max_product_table(nums: list[int]) -> int:
    n = len(nums)
    hi = [0] * n
    lo = [0] * n
    hi[0] = lo[0] = nums[0]
    for i in range(1, n):
        x = nums[i]
        candidates = (x, hi[i - 1] * x, lo[i - 1] * x)
        hi[i] = max(candidates)
        lo[i] = min(candidates)
    return max(hi)
```

Time `O(n)`, space `O(n)`.

### Space-optimised version

Each position reads only the previous pair, so two variables and a running best suffice.

```python
def max_product(nums: list[int]) -> int:
    hi = lo = best = nums[0]
    for x in nums[1:]:
        candidates = (x, hi * x, lo * x)
        hi, lo = max(candidates), min(candidates)   # both computed from the old pair
        best = max(best, hi)
    return best
```

Time `O(n)`, space `O(1)`. Computing both from the same `candidates` tuple avoids the classic bug of updating `hi` first and then using the new `hi` to compute `lo`.

### Common mistakes

- Tracking only the running maximum (straight Kadane). Fails on `[-2, 3, -4]`, returning 3 instead of 24.
- Updating `hi` in place and then computing `lo` from the already-updated `hi`.
- Returning the final `hi` instead of the best over all positions.
- Initialising `best` to 0. For `[-2]` the answer is −2, and there is no empty subarray to fall back on.

### How to discuss it

Start from Kadane and say exactly where it breaks: "a negative flips the order, so yesterday's minimum can be today's maximum; I'll carry both". Give the three-candidate transition, note that zero needs no special handling, and trace an input with two negatives.

A second correct approach is worth mentioning: within a zero-free segment, the best product is either a prefix or a suffix of that segment (if the count of negatives is even, take the whole segment; if odd, drop everything up to the first negative or from the last one). So the maximum over all running prefix products and all running suffix products, resetting at zeros, is the answer. Same `O(n)`, and a nice way to show you understand *why* the two-variable DP is correct.

For huge values, fixed-width products overflow long before `10⁵` elements. Compare products by the sum of `log|x|` and track sign parity separately, handling zeros as segment breaks; or in Python rely on big integers, accepting that each multiplication gets slower as the numbers grow.
