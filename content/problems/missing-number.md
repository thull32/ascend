---
slug: missing-number
title: Missing Number
difficulty: easy
patterns: [bit-manipulation]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, meta, apple]
order: 5
lesson: interview-patterns/combinatorial-patterns/bit-manipulation-pattern
hints:
  - "The array has n distinct values taken from the n + 1 values 0..n. A set finds the gap in O(n) space. What do you already know about the full range 0..n that the array can be compared against?"
  - "The sum 0 + 1 + ... + n is n(n + 1) / 2. Subtract the array's sum and what is left is the missing value."
  - "The XOR version avoids large intermediate sums: XOR every index 0..n with every value in the array. Every present value cancels its matching index; the missing one has no partner."
signatures:
  python:
    name: missing_number
    starter: |
      def missing_number(nums: list[int]) -> int:
          pass
  javascript:
    name: missing_number
    starter: |
      function missing_number(nums) {
      }
tests:
  - args: [[2, 0, 3]]
    expected: 1
  - args: [[0]]
    expected: 1
    label: missing the top value
  - args: [[1]]
    expected: 0
    label: missing zero
  - args: [[4, 2, 1, 0]]
    expected: 3
  - args: [[5, 3, 1, 0, 2]]
    expected: 4
  - args: [[1, 2]]
    expected: 0
  - args: [[0, 1]]
    expected: 2
    hidden: true
  - args: [[6, 4, 2, 3, 5, 7, 0, 1]]
    expected: 8
    hidden: true
    label: missing n itself
  - args: [[9, 7, 6, 3, 8, 1, 2, 0, 4]]
    expected: 5
    hidden: true
time_limit_ms: 4000
---
You are given an array `nums` of `n` **distinct** integers, each in the range `0` to `n` inclusive. Exactly one number from that range is absent. Return it.

Aim for `O(n)` time and `O(1)` extra space.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [2, 0, 3]` | `1` | `n = 3`, range `0..3`, and `1` is absent |
| `nums = [0]` | `1` | `n = 1`, range `0..1`; the top of the range can be the missing one |
| `nums = [1]` | `0` | Zero can be missing too |

### Constraints

- `1 ≤ n ≤ 10⁴` where `n = len(nums)`
- `0 ≤ nums[i] ≤ n`
- All values are distinct.

### Follow-up

The interviewer asks: "The sum formula can overflow in a fixed-width language. How do you avoid that?" Then: "Now two numbers are missing from `0..n+1`. Find both."

## Solution

### The naive approach

Sort and scan for the first index where `nums[i] != i` (`O(n log n)`), or put everything in a set and test `0..n` (`O(n)` time, `O(n)` space). Both are correct first answers.

### The insight

You know exactly what the complete collection should be: every integer from `0` to `n`. Compare an **aggregate** of the full range against the same aggregate of the array, and the difference is the missing value. Two aggregates work:

- **Sum**: `n(n + 1) / 2 - sum(nums)`. Simple, but in a 32-bit language it overflows once `n` reaches the tens of thousands: the product `n(n + 1)` passes `2³¹` near `n = 46,341`, before the division halves it.
- **XOR**: `(0 ^ 1 ^ … ^ n) ^ (nums[0] ^ … ^ nums[n-1])`. Each value present in the array appears twice in this expression (once as an index, once as a value) and cancels, because `a ^ a = 0`. The missing value appears only once, as an index, and survives. XOR never overflows because it never carries.

### The optimal approach

Pair index `i` with `nums[i]` in a single loop, and fold in `n` itself (the one index that has no array slot):

```python
def missing_number(nums: list[int]) -> int:
    n = len(nums)
    acc = n                       # the index with no array slot
    for i, x in enumerate(nums):
        acc ^= i ^ x
    return acc
```

Trace `[2, 0, 3]`, `n = 3`: `acc = 3`; `i = 0`: `3 ^ 0 ^ 2 = 1`; `i = 1`: `1 ^ 1 ^ 0 = 0`; `i = 2`: `0 ^ 2 ^ 3 = 1`. Result `1`.

Time `O(n)`, space `O(1)`.

The sum version, for comparison, is equally short and in Python (unbounded integers) equally safe:

```python
def missing_number_by_sum(nums: list[int]) -> int:
    n = len(nums)
    return n * (n + 1) // 2 - sum(nums)
```

### Common mistakes

- Forgetting to include `n` in the range. The loop covers indices `0..n-1`; if you do not seed with `n`, the case where `n` itself is missing (`[0, 1]`) returns `0`.
- Using the sum formula in Java or C with `int` for large `n`. In practice the wrap-around cancels out if you do all arithmetic in the same modular type, but most candidates cannot justify that on the spot; XOR sidesteps the question.
- Assuming the array is sorted and returning the first gap without sorting.

### How to discuss it

Name the set and sort solutions, then: "I know what the complete set looks like, so I compare aggregates. Sum works; XOR works too and cannot overflow." Show the pairing of index and value; it is the same cancellation idea as [Single Number](/practice/single-number). For the two-missing follow-up, the XOR of everything is now `a ^ b`. Pick any set bit of it (`x & -x` gives the lowest), partition both the range and the array by that bit, and XOR each partition separately; each yields one missing value. Alternatively use the sum and the sum of squares to get two equations in two unknowns. The cyclic-sort approach (place each value at its own index, then scan) also works in `O(n)` with `O(1)` space if mutating the input is allowed, and it generalises to [First Missing Positive](/practice/first-missing-positive).
