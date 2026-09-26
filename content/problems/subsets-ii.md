---
slug: subsets-ii
title: Subsets II
difficulty: medium
patterns: [backtracking]
lists: [ascend-150]
companies: [meta, amazon, bloomberg]
order: 4
lesson: interview-patterns/combinatorial-patterns/backtracking-pattern
hints:
  - "With duplicates in the input, the plain subsets recursion produces the same subset from different index choices. Sort the input so equal values sit next to each other."
  - "At each level, skip a value that equals the previous value *at the same level* (`i > start and nums[i] == nums[i - 1]`). The first copy explores everything the later copies would."
  - "Do not skip duplicates across levels; `[1, 2, 2]` is a valid subset and needs both `2`s chosen in consecutive levels."
signatures:
  python:
    name: subsets_with_dup
    starter: |
      def subsets_with_dup(nums: list[int]) -> list[list[int]]:
          pass
  javascript:
    name: subsets_with_dup
    starter: |
      function subsets_with_dup(nums) {
      }
tests:
  - args: [[1, 2, 2]]
    expected: [[], [1], [1, 2], [1, 2, 2], [2], [2, 2]]
    any_order: true
  - args: [[0]]
    expected: [[], [0]]
    any_order: true
    label: single element
  - args: [[4, 4, 4]]
    expected: [[], [4], [4, 4], [4, 4, 4]]
    any_order: true
    label: all equal
  - args: [[2, 1, 2]]
    expected: [[], [1], [1, 2], [1, 2, 2], [2], [2, 2]]
    any_order: true
    label: unsorted input
  - args: [[1, 2, 3]]
    expected: [[], [1], [2], [3], [1, 2], [1, 3], [2, 3], [1, 2, 3]]
    any_order: true
    hidden: true
    label: no duplicates at all
  - args: [[1, 1, 2, 2]]
    expected: [[], [1], [1, 1], [2], [2, 2], [1, 2], [1, 1, 2], [1, 2, 2], [1, 1, 2, 2]]
    any_order: true
    hidden: true
  - args: [[5, 5, 3]]
    expected: [[], [3], [3, 5], [3, 5, 5], [5], [5, 5]]
    any_order: true
    hidden: true
time_limit_ms: 4000
---
Given an array `nums` that may contain duplicate integers, return every distinct subset. Two subsets are the same if they contain the same values with the same multiplicities, regardless of which original positions were chosen. List each subset in non-decreasing order; the subsets themselves may be returned in any order.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 2, 2]` | `[[], [1], [1,2], [1,2,2], [2], [2,2]]` | Six distinct subsets, not eight: `[2]` and `[1, 2]` each arise from two positions |
| `[4, 4, 4]` | `[[], [4], [4,4], [4,4,4]]` | One subset per multiplicity |
| `[2, 1, 2]` | `[[], [1], [1,2], [1,2,2], [2], [2,2]]` | Sort first; the output is the same as for `[1, 2, 2]` |

### Constraints

- `1 ≤ len(nums) ≤ 10`
- `-10 ≤ nums[i] ≤ 10`

### Follow-up

The interviewer asks: "Explain precisely why skipping `nums[i] == nums[i-1]` only when `i > start` is correct, and what goes wrong with `i > 0`." Then: "How many distinct subsets are there, as a formula, without enumerating?"

## Solution

### The naive approach

Run the ordinary subsets recursion, sort each result, and deduplicate through a set of tuples. It works, but it generates up to `2ⁿ` subsets to keep far fewer, and it hides the reasoning the interviewer wants to see.

### The insight

Duplicates in the output come from choosing a value at position `i` when the same value at position `i - 1` was *available but skipped* at the same level. If the input is sorted, the equal values are adjacent, and the rule becomes: at any level, once you have explored the branch that takes the first copy of a value, every branch that takes a later copy instead would produce the same subsets. Skip them. But copies chosen in *consecutive levels* (`[2, 2]`) are different subsets and must be allowed, which is why the skip condition compares only with the previous index at the current level (`i > start`), not globally (`i > 0`).

### The optimal approach

```python
def subsets_with_dup(nums: list[int]) -> list[list[int]]:
    nums = sorted(nums)
    result: list[list[int]] = []
    path: list[int] = []

    def backtrack(start: int) -> None:
        result.append(path[:])
        for i in range(start, len(nums)):
            if i > start and nums[i] == nums[i - 1]:
                continue
            path.append(nums[i])
            backtrack(i + 1)
            path.pop()

    backtrack(0)
    return result
```

Trace `[1, 2, 2]`: level 0 records `[]`; take `1` → level 1 records `[1]`; take `2` (i=1) → records `[1,2]`; take `2` (i=2, start=2, no skip) → records `[1,2,2]`. Back at level 1, `i=2` has `i > start` and equals `nums[1]`, skipped. Back at level 0, take `2` (i=1) → records `[2]`, then `[2,2]`; `i=2` skipped. Six subsets.

Time `O(n · 2ⁿ)` worst case (no duplicates), less with duplicates; space `O(n)` excluding output.

### Common mistakes

- Skipping with `i > 0` instead of `i > start`, which drops `[2, 2]` and `[1, 2, 2]`.
- Forgetting to sort, so equal values are not adjacent and the skip never fires.
- Deduplicating with a set of lists (unhashable) and reaching for tuples, which works but signals that the recursion itself is not producing distinct output.

### How to discuss it

Explain the "first copy explores everything the later copies would" argument and then the `i > start` subtlety in your own words; that explanation is the whole point of the problem. For the counting follow-up: group the values, and for each value with multiplicity `m` there are `m + 1` choices (take 0, 1, ..., `m` copies), so the number of distinct subsets is `∏ (mᵢ + 1)`. `[1, 2, 2]` gives `2 × 3 = 6`. Deriving that formula also suggests an alternative enumeration, iterating over multiplicities per value, which is sometimes cleaner than the skip rule.
