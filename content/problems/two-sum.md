---
slug: two-sum
title: Two Sum
difficulty: easy
patterns: [hash-map]
lists: [core-75, ascend-150]
companies: [netflix, google, amazon, meta]
order: 1
lesson: data-structures/hashing/hash-tables
hints:
  - Brute force checks every pair in O(n²). What would you need to remember about earlier elements to avoid the inner loop?
  - For each number x, the partner you need is `target - x`. A dictionary from value to index answers "have I seen the partner?" in O(1).
  - Insert x into the dictionary *after* checking for its partner, so an element cannot pair with itself.
signatures:
  python:
    name: two_sum
    starter: |
      def two_sum(nums: list[int], target: int) -> list[int]:
          pass
  javascript:
    name: two_sum
    starter: |
      function two_sum(nums, target) {
      }
tests:
  - args: [[2, 7, 11, 15], 9]
    expected: [0, 1]
  - args: [[3, 2, 4], 6]
    expected: [1, 2]
  - args: [[3, 3], 6]
    expected: [0, 1]
    label: duplicate values
  - args: [[-1, -2, -3, -4, -5], -8]
    expected: [2, 4]
    label: negatives
  - args: [[0, 4, 3, 0], 0]
    expected: [0, 3]
    hidden: true
    label: zero target with zeros
  - args: [[1, 5, 1, 5], 10]
    expected: [1, 3]
    hidden: true
    label: partner appears later, not earlier
  - args: [[5, 75, 25], 100]
    expected: [1, 2]
    hidden: true
time_limit_ms: 4000
---
You are given an array of integers `nums` and an integer `target`. Return the indices of the two distinct elements whose values add up to `target`, as a two-element list `[i, j]` with `i < j`.

Exactly one such pair exists in every input. You may not use the same element twice.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [2, 7, 11, 15]`, `target = 9` | `[0, 1]` | `2 + 7 = 9` |
| `nums = [3, 2, 4]`, `target = 6` | `[1, 2]` | `2 + 4 = 6`; note `[0, 0]` is not allowed |
| `nums = [3, 3]`, `target = 6` | `[0, 1]` | Duplicate values at different indices are fine |

### Constraints

- `2 ≤ len(nums) ≤ 10⁵`
- `-10⁹ ≤ nums[i], target ≤ 10⁹`
- Exactly one valid answer exists.

### Follow-up

The interviewer asks: "Now the array is sorted. Can you do it in O(1) extra space?" And then: "Now I want *all* pairs, and there may be duplicates. What changes?"

## Solution

### The naive approach

Check every pair `(i, j)` with `i < j`. Two nested loops, `O(n²)` time, `O(1)` space. For `n = 10⁵` that is 5 billion comparisons; too slow, and the interviewer knows you know that. State it in one sentence and move on.

### The insight

The inner loop exists to answer one question: "is there an earlier element equal to `target - nums[j]`?" That is a membership query, and membership queries are what hash tables are for. Trade `O(n)` memory for `O(1)` lookups and the inner loop disappears.

### The optimal approach

Walk the array once. For each `x` at index `i`, compute `need = target - x`. If `need` is already in the map, you have found the pair: the stored index and `i`. Otherwise store `x → i` and continue.

Inserting *after* the lookup guarantees the two indices are distinct and that `i < j` (the stored index is always earlier).

```python
def two_sum(nums: list[int], target: int) -> list[int]:
    seen: dict[int, int] = {}
    for i, x in enumerate(nums):
        need = target - x
        if need in seen:
            return [seen[need], i]
        seen[x] = i
    return []  # unreachable given the problem guarantee
```

Time `O(n)`: one pass, each with an expected-`O(1)` dictionary operation. Space `O(n)` for the map.

### Common mistakes

- Inserting before checking, which lets `[3, 2, 4]` with target 6 return `[0, 0]`.
- Building the whole map first and then scanning, which works but needs a second pass and an explicit `seen[need] != i` guard.
- Returning values instead of indices; read the prompt.

### How to discuss it

Say the brute force and its cost. Say "the inner loop is a membership check, so I'll use a hash map keyed by value, storing the index" before you write code. After coding, trace `[3, 2, 4], 6` by hand to show the insert-after-check ordering. Then answer the follow-ups: sorted input → two pointers from both ends, `O(n)` time, `O(1)` space; all pairs with duplicates → sort, two pointers, skip duplicate values on both sides (the same skeleton as Three Sum).
