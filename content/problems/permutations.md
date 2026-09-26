---
slug: permutations
title: Permutations
difficulty: medium
patterns: [backtracking]
lists: [ascend-150]
companies: [microsoft, amazon, meta, linkedin]
order: 3
lesson: interview-patterns/combinatorial-patterns/backtracking-pattern
hints:
  - "A permutation is built by choosing which element goes first, then which goes second from the rest, and so on. Each position is a level of recursion."
  - "Track which elements are already used, with a boolean array or by swapping the chosen element into the current position in place."
  - "The path is complete when its length equals the input length; copy it into the result and return."
signatures:
  python:
    name: permute
    starter: |
      def permute(nums: list[int]) -> list[list[int]]:
          pass
  javascript:
    name: permute
    starter: |
      function permute(nums) {
      }
tests:
  - args: [[1, 2, 3]]
    expected: [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]
    any_order: true
  - args: [[0, 1]]
    expected: [[0, 1], [1, 0]]
    any_order: true
  - args: [[1]]
    expected: [[1]]
    any_order: true
    label: single element
  - args: [[2, 1]]
    expected: [[2, 1], [1, 2]]
    any_order: true
  - args: [[5, -3, 9]]
    expected: [[5, -3, 9], [5, 9, -3], [-3, 5, 9], [-3, 9, 5], [9, 5, -3], [9, -3, 5]]
    any_order: true
    hidden: true
    label: negatives
  - args: [[1, 2, 3, 4]]
    expected: [[1, 2, 3, 4], [1, 2, 4, 3], [1, 3, 2, 4], [1, 3, 4, 2], [1, 4, 2, 3], [1, 4, 3, 2], [2, 1, 3, 4], [2, 1, 4, 3], [2, 3, 1, 4], [2, 3, 4, 1], [2, 4, 1, 3], [2, 4, 3, 1], [3, 1, 2, 4], [3, 1, 4, 2], [3, 2, 1, 4], [3, 2, 4, 1], [3, 4, 1, 2], [3, 4, 2, 1], [4, 1, 2, 3], [4, 1, 3, 2], [4, 2, 1, 3], [4, 2, 3, 1], [4, 3, 1, 2], [4, 3, 2, 1]]
    any_order: true
    hidden: true
    label: twenty-four permutations
time_limit_ms: 4000
---
Given an array `nums` of distinct integers, return every possible ordering of its elements. The orderings may be returned in any order; each must appear exactly once.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 2, 3]` | `[[1,2,3], [1,3,2], [2,1,3], [2,3,1], [3,1,2], [3,2,1]]` | `3! = 6` orderings |
| `[0, 1]` | `[[0, 1], [1, 0]]` | Two orderings |
| `[1]` | `[[1]]` | One ordering |

### Constraints

- `1 ≤ len(nums) ≤ 6`
- `-10 ≤ nums[i] ≤ 10`, all distinct

### Follow-up

The interviewer asks: "Generate the permutations in lexicographic order without recursion." Then: "Give me the 1,000,000th permutation of ten elements without generating the first 999,999."

## Solution

### The naive approach

Generate every sequence of length `n` over the elements (`nⁿ` of them) and keep those with no repeats. For `n = 6` that is `46,656` sequences to find `720` permutations, and the ratio gets worse fast.

### The insight

Fill positions left to right. For position 0 there are `n` choices; for position 1, `n - 1` of the remaining; and so on. That decision tree has exactly `n!` leaves and every leaf is a distinct permutation, so a backtracking search that tracks which elements are used visits each permutation once and nothing else.

### The optimal approach

The used-array version is the clearest:

```python
def permute(nums: list[int]) -> list[list[int]]:
    result: list[list[int]] = []
    path: list[int] = []
    used = [False] * len(nums)

    def backtrack() -> None:
        if len(path) == len(nums):
            result.append(path[:])
            return
        for i, x in enumerate(nums):
            if used[i]:
                continue
            used[i] = True
            path.append(x)
            backtrack()
            path.pop()
            used[i] = False

    backtrack()
    return result
```

The in-place swap version avoids the extra array: at depth `d`, swap each `nums[i]` for `i ≥ d` into position `d`, recurse on `d + 1`, swap back. It is a little faster and a little easier to get wrong.

Time `O(n · n!)`: `n!` permutations, each copied in `O(n)` (the recursion itself does `O(n!)` node visits with `O(n)` loop work each, but the copy dominates the constant). Space `O(n)` for the path, `used`, and stack.

### Common mistakes

- Not resetting `used[i]` after the recursive call, so later branches see elements as taken.
- Appending `path` without copying.
- In the swap version, swapping back with the wrong index, or recursing on `i + 1` instead of `d + 1`.

### How to discuss it

Describe the decision tree and its `n!` leaves; give the bound and say it is output-bound. For the iterative lexicographic follow-up, describe the "next permutation" step: scan from the right for the first `nums[i] < nums[i+1]`, swap `nums[i]` with the smallest larger element to its right, reverse the suffix; repeating it from the sorted array visits all `n!` in order in `O(n)` amortised per step. For the millionth-permutation follow-up, use the factorial number system: the first element is index `⌊999,999 / 9!⌋` in the sorted remaining list, subtract, repeat with `8!`, and so on, `O(n²)` total and no enumeration. Knowing that permutations can be *indexed* and not just *enumerated* is the difference between a solid and a senior answer.
