---
slug: subsets
title: Subsets
difficulty: medium
patterns: [backtracking]
lists: [core-75, ascend-150]
companies: [amazon, meta, google, bloomberg]
order: 1
lesson: interview-patterns/combinatorial-patterns/backtracking-pattern
hints:
  - "Every element is either in a subset or not. Making that choice for each element in turn generates each subset exactly once."
  - "Backtrack with a start index: at position `i`, record the current path as a subset, then for each `j ≥ i` add `nums[j]`, recurse from `j + 1`, and remove it."
  - "The start index is what prevents `[1, 2]` and `[2, 1]` from both appearing; you only ever add elements to the right of the last one chosen."
signatures:
  python:
    name: subsets
    starter: |
      def subsets(nums: list[int]) -> list[list[int]]:
          pass
  javascript:
    name: subsets
    starter: |
      function subsets(nums) {
      }
tests:
  - args: [[1, 2, 3]]
    expected: [[], [1], [2], [3], [1, 2], [1, 3], [2, 3], [1, 2, 3]]
    any_order: true
  - args: [[]]
    expected: [[]]
    any_order: true
    label: empty input has one subset
  - args: [[0]]
    expected: [[], [0]]
    any_order: true
    label: single element
  - args: [[4, 7]]
    expected: [[], [4], [7], [4, 7]]
    any_order: true
  - args: [[-1, 5]]
    expected: [[], [-1], [5], [-1, 5]]
    any_order: true
  - args: [[3, 1, 2]]
    expected: [[], [3], [1], [2], [3, 1], [3, 2], [1, 2], [3, 1, 2]]
    any_order: true
    hidden: true
    label: subsets keep the input order
  - args: [[1, 2, 3, 4]]
    expected: [[], [1], [2], [3], [4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4], [1, 2, 3], [1, 2, 4], [1, 3, 4], [2, 3, 4], [1, 2, 3, 4]]
    any_order: true
    hidden: true
time_limit_ms: 4000
---
Given an array `nums` of distinct integers, return every possible subset (the power set), including the empty subset and `nums` itself. Within each subset, list the elements in the order they appear in `nums`. The subsets themselves may be returned in any order, and no subset may appear twice.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 2, 3]` | `[[], [1], [2], [3], [1,2], [1,3], [2,3], [1,2,3]]` | `2³ = 8` subsets |
| `[]` | `[[]]` | The empty set has exactly one subset |
| `[3, 1, 2]` | `[[], [3], [1], [2], [3,1], [3,2], [1,2], [3,1,2]]` | `[3, 1]`, not `[1, 3]`: input order is kept |

### Constraints

- `0 ≤ len(nums) ≤ 10`
- `-10 ≤ nums[i] ≤ 10`, all distinct

### Follow-up

The interviewer asks: "Generate the subsets iteratively, without recursion." Then: "Now `len(nums)` is 40 and I only want subsets whose sum is exactly `T`. Enumerating all of them is impossible; what do you do?"

## Solution

### The naive approach

There is no cheaper way to *output* `2ⁿ` subsets than to produce each one, so the output size is the lower bound. The question is whether you produce each subset exactly once and without wasted work. A first attempt that generates all permutations of all lengths and deduplicates does `O(n! )` work for `O(2ⁿ)` output.

### The insight

A subset is a sequence of `n` independent yes/no decisions, one per element. Backtracking makes those decisions in order and undoes them on the way back, so every path through the decision tree is a distinct subset and the recursion visits each of the `2ⁿ` leaves once. Keeping a start index guarantees elements are only ever added to the right of the previous choice, which is what keeps the input order inside each subset and prevents `[1, 2]` from also appearing as `[2, 1]`.

### The optimal approach

```python
def subsets(nums: list[int]) -> list[list[int]]:
    result: list[list[int]] = []
    path: list[int] = []

    def backtrack(start: int) -> None:
        result.append(path[:])
        for i in range(start, len(nums)):
            path.append(nums[i])
            backtrack(i + 1)
            path.pop()

    backtrack(0)
    return result
```

Every call records the current path before extending it, so the empty subset is recorded first and every prefix of every path is recorded exactly once. Time `O(n · 2ⁿ)`: `2ⁿ` subsets, each copied in `O(n)`. Space `O(n)` for the recursion and path, excluding the output.

Two alternatives worth knowing. Iterative doubling: start with `[[]]` and, for each element, append a copy of every existing subset with the element added; same complexity and no recursion. Bitmask: for `mask` in `0 .. 2ⁿ - 1`, include `nums[i]` when bit `i` is set; this is the most direct encoding of "each element is one bit" and is the natural answer to the iteration follow-up.

### Common mistakes

- Appending `path` itself rather than a copy, so every entry of `result` aliases the same list and ends up empty.
- Recursing from `start` instead of `i + 1`, which allows an element to be reused and produces duplicates.
- Forgetting the empty subset by recording the path only when it is non-empty or only at leaves.

### How to discuss it

Say "each element is a binary choice, so the decision tree has `2ⁿ` leaves and backtracking with a start index visits each exactly once." Give the `O(n · 2ⁿ)` bound and note that it is output-bound. Offer the bitmask version for the iterative follow-up. For the sum-`T` follow-up with `n = 40`, `2⁴⁰` is out of reach, so this is no longer an enumeration problem: prune the backtracking on partial sums (sort, stop when the running sum exceeds `T`), and if that is still too slow use meet-in-the-middle (enumerate `2²⁰` sums of each half and match them with a hash map), which is the classic bridge from backtracking to algorithmic technique.
