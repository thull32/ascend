---
slug: product-except-self
title: Product of Array Except Self
difficulty: medium
patterns: [hash-map]
lists: [core-75, ascend-150]
companies: [amazon, meta, microsoft, apple]
order: 7
lesson: interview-patterns/sequence-patterns/hash-map-patterns
hints:
  - Dividing the total product by `nums[i]` breaks on zero (and the problem forbids division anyway). What does "everything except i" look like as two pieces?
  - The product of everything before `i` times the product of everything after `i`. Both can be built with one pass each.
  - Write the prefix products into the output array, then sweep from the right carrying a running suffix product, so you never allocate a second array.
signatures:
  python:
    name: product_except_self
    starter: |
      def product_except_self(nums: list[int]) -> list[int]:
          pass
  javascript:
    name: product_except_self
    starter: |
      function product_except_self(nums) {
      }
tests:
  - args: [[1, 2, 3, 4]]
    expected: [24, 12, 8, 6]
  - args: [[-1, 1, 0, -3, 3]]
    expected: [0, 0, 9, 0, 0]
    label: one zero
  - args: [[2, 3]]
    expected: [3, 2]
    label: two elements
  - args: [[0, 0]]
    expected: [0, 0]
    label: two zeros
  - args: [[1, 1, 1, 1]]
    expected: [1, 1, 1, 1]
  - args: [[-2, -3, 4]]
    expected: [-12, -8, 6]
    hidden: true
    label: negatives
  - args: [[5, 0]]
    expected: [0, 5]
    hidden: true
  - args: [[3, 0, 2, 1]]
    expected: [0, 6, 0, 0]
    hidden: true
time_limit_ms: 4000
---
You are given an array of integers `nums`. Return an array `out` of the same length where `out[i]` is the product of every element of `nums` except `nums[i]`.

You may not use division. Aim for `O(n)` time and `O(1)` extra space, not counting the output array.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 2, 3, 4]` | `[24, 12, 8, 6]` | `out[0] = 2·3·4`, `out[1] = 1·3·4`, … |
| `[-1, 1, 0, -3, 3]` | `[0, 0, 9, 0, 0]` | Only position 2 excludes the zero |
| `[0, 0]` | `[0, 0]` | Excluding one zero still leaves another |

### Constraints

- `2 ≤ len(nums) ≤ 10⁵`
- `-30 ≤ nums[i] ≤ 30`
- Every product fits in a 32-bit signed integer.

### Follow-up

The interviewer asks: "Why did I forbid division?" Then: "Now the array is a stream and I need `out[i]` as soon as `nums[i]` arrives. What can and cannot be done?"

## Solution

### The naive approach

For each `i`, multiply all the other elements: `O(n²)`. The tempting shortcut is `total / nums[i]`, which is `O(n)` but breaks on zeros (one zero means every other position is zero and the zero's position is the product of the rest; two zeros mean everything is zero), and the problem forbids it regardless.

### The insight

"Everything except `i`" is the product of the elements to the left of `i` times the product of the elements to the right. Both halves are prefix computations. `left[i] = nums[0] · … · nums[i-1]` is a running product from the left; `right[i] = nums[i+1] · … · nums[n-1]` is a running product from the right. Two passes, `O(n)`, and zeros are handled without special cases because a zero on the left of `i` makes `left[i]` zero for every later `i`, exactly as the arithmetic demands.

This is the same structure as prefix sums, applied to multiplication: precompute one direction, then combine with the other.

### The optimal approach

Use the output array to hold the left products, then sweep from the right with a single running variable for the right product, multiplying it into `out[i]` as you go. That removes the second array and gets to `O(1)` extra space.

```python
def product_except_self(nums: list[int]) -> list[int]:
    n = len(nums)
    out = [1] * n

    running = 1                      # product of nums[0..i-1]
    for i in range(n):
        out[i] = running
        running *= nums[i]

    running = 1                      # product of nums[i+1..n-1]
    for i in range(n - 1, -1, -1):
        out[i] *= running
        running *= nums[i]
    return out
```

Trace `[1, 2, 3, 4]`. After the left pass: `out = [1, 1, 2, 6]`. Right pass, `running` goes `1, 4, 12, 24`: `out[3] = 6·1 = 6`, `out[2] = 2·4 = 8`, `out[1] = 1·12 = 12`, `out[0] = 1·24 = 24`.

Time `O(n)`, two passes. Extra space `O(1)`.

### Common mistakes

- Off-by-one in the left pass: writing `running` *after* multiplying, which puts `nums[i]` into its own product.
- Allocating both a `left` and a `right` array. Correct, `O(n)` space; interviewers accept it as a first version but expect you to fold one away.
- Special-casing zeros. The prefix approach needs no special case; if you find yourself counting zeros, you are still thinking in terms of division.
- Overflow in languages with fixed-width integers. The constraints promise the products fit, but say that you checked.

### How to discuss it

Name the division approach and its zero problem in one breath, then say "left product times right product" and code it with the output array as scratch. Trace the small example. For "why no division": besides zeros, floating-point division of large products loses precision, and in fixed-width integer arithmetic the total may overflow even when each answer fits. For the streaming follow-up: `left[i]` is available as soon as `nums[i]` arrives, but `right[i]` depends on the entire future, so exact `out[i]` is impossible online; you can emit `left[i]` and patch results when the stream closes, or accept a bounded delay if the stream comes in fixed windows.
