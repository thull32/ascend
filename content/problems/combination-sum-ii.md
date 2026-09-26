---
slug: combination-sum-ii
title: Combination Sum II
difficulty: medium
patterns: [backtracking]
lists: [ascend-150]
companies: [amazon, meta, microsoft, bloomberg]
order: 5
lesson: interview-patterns/combinatorial-patterns/backtracking-pattern
hints:
  - "Each candidate may be used at most once, so recurse from `i + 1`. The input contains duplicates, so the same multiset can be reached through different indices."
  - "Sort, then at each level skip a candidate equal to the previous one at that level (`i > start and c[i] == c[i-1]`). The first copy already covered every combination the second could produce."
  - "Sorting also gives the prune: once `candidates[i] > remaining`, break out of the loop."
signatures:
  python:
    name: combination_sum2
    starter: |
      def combination_sum2(candidates: list[int], target: int) -> list[list[int]]:
          pass
  javascript:
    name: combination_sum2
    starter: |
      function combination_sum2(candidates, target) {
      }
tests:
  - args: [[10, 1, 2, 7, 6, 1, 5], 8]
    expected: [[1, 1, 6], [1, 2, 5], [1, 7], [2, 6]]
    any_order: true
  - args: [[2, 5, 2, 1, 2], 5]
    expected: [[1, 2, 2], [5]]
    any_order: true
  - args: [[1, 1, 1], 2]
    expected: [[1, 1]]
    any_order: true
    label: three equal candidates give one combination
  - args: [[3], 4]
    expected: []
    any_order: true
    label: no combination
  - args: [[1, 2, 3], 6]
    expected: [[1, 2, 3]]
    any_order: true
    label: every candidate used once
  - args: [[5, 5, 5], 10]
    expected: [[5, 5]]
    any_order: true
  - args: [[4, 4, 2, 2], 6]
    expected: [[2, 4]]
    any_order: true
    hidden: true
  - args: [[1, 1, 2, 2, 3], 4]
    expected: [[1, 1, 2], [1, 3], [2, 2]]
    any_order: true
    hidden: true
  - args: [[7, 3, 2], 12]
    expected: [[2, 3, 7]]
    any_order: true
    hidden: true
time_limit_ms: 4000
---
Given an array of positive integers `candidates`, which may contain duplicates, and a positive integer `target`, return every distinct combination of candidates that sums to `target`. Each array position may be used at most once. Two combinations are the same if they contain the same values with the same multiplicities, so list each combination in non-decreasing order. The combinations themselves may be returned in any order.

### Examples

| Input | Output | Why |
|---|---|---|
| `[10, 1, 2, 7, 6, 1, 5]`, `target = 8` | `[[1,1,6], [1,2,5], [1,7], [2,6]]` | `[1, 7]` appears once although there are two `1`s |
| `[1, 1, 1]`, `target = 2` | `[[1, 1]]` | Three ways to pick two positions, one distinct combination |
| `[3]`, `target = 4` | `[]` | Nothing sums to 4 |

### Constraints

- `1 ≤ len(candidates) ≤ 100`, `1 ≤ candidates[i] ≤ 50`
- `1 ≤ target ≤ 30`

### Follow-up

The interviewer asks: "Compare this with Combination Sum I: which single character of code changes to allow reuse, and why does the duplicate-skip rule then become unnecessary?" Then: "Suppose I only need to know whether *any* combination exists. What is the fastest approach for `target = 10⁴`?"

## Solution

### The naive approach

Enumerate all `2ⁿ` subsets, keep those with the right sum, sort each, deduplicate with a set. Exponential in `n` regardless of `target`, and it does the deduplication after the fact instead of in the recursion.

### The insight

Two rules from two earlier problems combine here. From Combination Sum: a start index gives every combination a canonical order, and sorting turns "candidate too large" into a loop break. From Subsets II: with duplicates in the input, skipping a candidate equal to its predecessor *at the same level* prevents the same multiset from being generated through different index choices, while still allowing consecutive levels to take both copies (`[1, 1, 6]`).

### The optimal approach

```python
def combination_sum2(candidates: list[int], target: int) -> list[list[int]]:
    candidates = sorted(candidates)
    result: list[list[int]] = []
    path: list[int] = []

    def backtrack(start: int, remaining: int) -> None:
        if remaining == 0:
            result.append(path[:])
            return
        for i in range(start, len(candidates)):
            c = candidates[i]
            if c > remaining:
                break
            if i > start and c == candidates[i - 1]:
                continue
            path.append(c)
            backtrack(i + 1, remaining - c)
            path.pop()

    backtrack(0, target)
    return result
```

Trace `[1, 1, 2, 2, 3]`, target 4: take `1` (i=0, rem 3) → take `1` (i=1, rem 2) → take `2` (i=2, rem 0) record `[1,1,2]`; `i=3` skipped; back → `i=2`: `2` (rem 1), nothing; `i=3` skipped; `i=4`: `3` (rem 0) record `[1,3]`. Top level `i=1` skipped. `i=2`: `2` (rem 2) → `i=3`: `2` (rem 0, `i > start` is false since start=3) record `[2,2]`. `i=3` at top skipped; `i=4`: `3` (rem 1), nothing.

Worst case `O(2ⁿ)` node visits with `O(n)` copy per result; the sort-and-break prune and duplicate skip make typical inputs far cheaper. Space `O(n)` excluding output.

### Common mistakes

- Skipping with `i > 0`, which loses `[1, 1, 6]`.
- Recursing from `i` instead of `i + 1`, which allows reuse.
- Putting the duplicate check before the `break` check; both orders are correct, but `break` first avoids a useless comparison, and putting the skip first with `continue` on a sorted array is a common source of accidentally never breaking.

### How to discuss it

Name the two ingredients and where they come from. For the first follow-up: `backtrack(i, ...)` versus `backtrack(i + 1, ...)` is the only difference; with reuse allowed and *distinct* candidates there are no duplicate values to skip, and with reuse allowed and duplicate values you would simply deduplicate the candidate list up front because a second copy adds nothing. For the existence follow-up with a large target, backtracking can blow up; the subset-sum DP over a boolean array (or bitset) of size `target + 1` answers "is any combination possible" in `O(n · target)`, and with a bitset shift it is fast even for `10⁴`.
