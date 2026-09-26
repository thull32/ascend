---
slug: two-sum-sorted
title: Two Sum on a Sorted Array
difficulty: medium
patterns: [two-pointers]
lists: [ascend-150]
companies: [amazon, adobe, apple]
order: 2
lesson: interview-patterns/array-patterns/two-pointers
hints:
  - The hash-map solution still works, but it ignores the sortedness. What does the order tell you about which pairs can be skipped?
  - Start with the smallest and largest elements. If their sum is too small, the smallest element cannot pair with anything (its best partner was the largest), so move the left pointer. If too large, move the right pointer.
  - Each step discards one element for good, so the walk is O(n) and needs no extra memory.
signatures:
  python:
    name: two_sum_sorted
    starter: |
      def two_sum_sorted(nums: list[int], target: int) -> list[int]:
          pass
  javascript:
    name: two_sum_sorted
    starter: |
      function two_sum_sorted(nums, target) {
      }
tests:
  - args: [[1, 3, 4, 6, 10], 10]
    expected: [2, 3]
  - args: [[2, 7, 11, 15], 9]
    expected: [0, 1]
  - args: [[-5, -2, 0, 4, 8], 3]
    expected: [0, 4]
    label: negatives and positives
  - args: [[1, 2], 3]
    expected: [0, 1]
    label: two elements
  - args: [[-3, -1, 0, 2, 5], -4]
    expected: [0, 1]
    label: negative target
  - args: [[0, 1, 2, 4], 4]
    expected: [0, 3]
  - args: [[3, 3, 5], 6]
    expected: [0, 1]
    hidden: true
    label: equal values
  - args: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 19]
    expected: [8, 9]
    hidden: true
time_limit_ms: 4000
---
You are given an array of integers `nums` sorted in non-decreasing order and an integer `target`. Return the 0-based indices `[i, j]` with `i < j` of the two elements whose values add up to `target`.

Exactly one such pair exists. Your solution must use `O(1)` extra space.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [1, 3, 4, 6, 10]`, `target = 10` | `[2, 3]` | `4 + 6 = 10` |
| `nums = [-5, -2, 0, 4, 8]`, `target = 3` | `[0, 4]` | `-5 + 8 = 3` |
| `nums = [3, 3, 5]`, `target = 6` | `[0, 1]` | Equal values at distinct indices |

### Constraints

- `2 ≤ len(nums) ≤ 10⁵`
- `-10⁹ ≤ nums[i], target ≤ 10⁹`
- `nums` is sorted; exactly one valid answer exists.

### Follow-up

The interviewer asks: "Prove the two-pointer walk cannot skip the answer." Then: "There may be several valid pairs and I want all of them, without duplicates by value."

## Solution

### The naive approach

The hash map from [Two Sum](/practice/two-sum) works unchanged: `O(n)` time, `O(n)` space. It ignores the sorting, and the problem's `O(1)` space requirement is there to make you use it. Binary searching for `target - nums[i]` for each `i` also works: `O(n log n)` time, `O(1)` space, and it is a legitimate intermediate answer.

### The insight

Sortedness gives you a way to *rule out* elements. Consider the pair `(nums[lo], nums[hi])` with `lo = 0` and `hi = n - 1`. If the sum is less than `target`, then `nums[lo]` cannot be in the answer at all: its largest possible partner was `nums[hi]` and even that was too small. So `lo` can move right. Symmetrically, if the sum is too large, `nums[hi]` is eliminated and `hi` moves left. Every step eliminates one element permanently, so after at most `n - 1` steps you find the pair.

### The optimal approach

```python
def two_sum_sorted(nums: list[int], target: int) -> list[int]:
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        s = nums[lo] + nums[hi]
        if s == target:
            return [lo, hi]
        if s < target:
            lo += 1
        else:
            hi -= 1
    return []  # unreachable given the guarantee
```

Trace `[1, 3, 4, 6, 10]`, target `10`. `1 + 10 = 11 > 10` → `hi = 3`. `1 + 6 = 7 < 10` → `lo = 1`. `3 + 6 = 9 < 10` → `lo = 2`. `4 + 6 = 10` → `[2, 3]`.

Time `O(n)`, space `O(1)`.

### The proof

Suppose the answer is `(a, b)` with `a < b`. Before the pointers reach it, either `lo ≤ a` and `hi ≥ b` (the pair is still inside the window) or one pointer has passed it. The pointers only move when the current sum is wrong. If `hi = b` and `lo < a`, then `nums[lo] + nums[b] ≤ nums[a] + nums[b] = target`, so the sum is at most `target`; if it is less, `lo` moves right (towards `a`), and `hi` never moves off `b`. The symmetric argument holds for `lo = a`. So neither pointer can step over its half of the answer. This is the argument the interviewer wants when they ask "why can't you skip it?"

### Common mistakes

- Returning 1-based indices because a well-known version of this problem does; read the prompt.
- Using `lo <= hi`, which lets an element pair with itself.
- Moving both pointers on a mismatch, which can skip the answer.

### How to discuss it

State the hash map and its `O(n)` space, then the binary-search version, then say "sorted means I can eliminate from the ends" and write the two-pointer walk. Give the elimination argument in a sentence without being asked. For the all-pairs follow-up: on a match, record it, then advance `lo` past all copies of `nums[lo]` and retreat `hi` past all copies of `nums[hi]`, and keep going instead of returning. That duplicate-skipping inner loop is the exact building block of [Three Sum](/practice/three-sum).
