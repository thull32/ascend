---
slug: combination-sum
title: Combination Sum
difficulty: medium
patterns: [backtracking]
lists: [core-75, ascend-150]
companies: [amazon, meta, airbnb, uber]
order: 2
lesson: interview-patterns/combinatorial-patterns/backtracking-pattern
hints:
  - "A candidate may be reused, so at each step you choose a candidate at or after the current index, not strictly after it."
  - "Sort the candidates and stop the loop as soon as the remaining target drops below the current candidate; every later candidate is larger."
  - "Track `remaining = target - sum(path)` as a parameter rather than recomputing the sum; record the path when it hits zero."
signatures:
  python:
    name: combination_sum
    starter: |
      def combination_sum(candidates: list[int], target: int) -> list[list[int]]:
          pass
  javascript:
    name: combination_sum
    starter: |
      function combination_sum(candidates, target) {
      }
tests:
  - args: [[2, 3, 6, 7], 7]
    expected: [[2, 2, 3], [7]]
    any_order: true
  - args: [[2, 3, 5], 8]
    expected: [[2, 2, 2, 2], [2, 3, 3], [3, 5]]
    any_order: true
  - args: [[2], 1]
    expected: []
    any_order: true
    label: no combination
  - args: [[1], 2]
    expected: [[1, 1]]
    any_order: true
    label: single candidate reused
  - args: [[3, 5, 9], 9]
    expected: [[3, 3, 3], [9]]
    any_order: true
  - args: [[7, 3], 10]
    expected: [[3, 7]]
    any_order: true
    label: output is sorted within a combination
  - args: [[5, 3, 2], 8]
    expected: [[2, 2, 2, 2], [2, 3, 3], [3, 5]]
    any_order: true
    hidden: true
    label: unsorted candidates
  - args: [[4, 6, 8], 5]
    expected: []
    any_order: true
    hidden: true
  - args: [[2, 4, 6], 10]
    expected: [[2, 2, 2, 2, 2], [2, 2, 2, 4], [2, 2, 6], [2, 4, 4], [4, 6]]
    any_order: true
    hidden: true
time_limit_ms: 4000
---
Given an array of distinct positive integers `candidates` and a positive integer `target`, return every distinct combination of candidates that sums to `target`. A candidate may be used any number of times. Two combinations are the same if they contain the same multiset of numbers, so list each combination in non-decreasing order. The combinations themselves may be returned in any order.

### Examples

| Input | Output | Why |
|---|---|---|
| `[2, 3, 6, 7]`, `target = 7` | `[[2, 2, 3], [7]]` | `2 + 2 + 3` and `7`; `6` cannot be completed |
| `[2, 3, 5]`, `target = 8` | `[[2,2,2,2], [2,3,3], [3,5]]` | Three distinct multisets |
| `[7, 3]`, `target = 10` | `[[3, 7]]` | Sorted within the combination even though the input is not |

### Constraints

- `1 ≤ len(candidates) ≤ 30`, `2 ≤ candidates[i] ≤ 40`, all distinct
- `1 ≤ target ≤ 40`
- The number of valid combinations is below 150

### Follow-up

The interviewer asks: "I only want the *count* of combinations, not the list. Is there a faster way?" Then: "Now order matters: `[2, 3]` and `[3, 2]` are different. How does the count change, and does your recursion change?"

## Solution

### The naive approach

Enumerate every sequence of candidates whose sum is `≤ target`, then deduplicate multisets with a set of sorted tuples. The enumeration produces every ordering of every combination, so the work multiplies by up to `k!` for a combination of length `k`, all to be thrown away.

### The insight

Duplicates come from choosing the same multiset in different orders. Force a canonical order: at each level, only consider candidates at or after the index of the last one chosen. `[2, 3]` can then be built but `[3, 2]` cannot. "At or after" rather than "strictly after" is what allows reuse. Sorting the candidates first makes the pruning exact: once `remaining < candidates[i]`, every later candidate is larger and the loop can stop.

### The optimal approach

```python
def combination_sum(candidates: list[int], target: int) -> list[list[int]]:
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
            path.append(c)
            backtrack(i, remaining - c)
            path.pop()

    backtrack(0, target)
    return result
```

Trace `[2, 3, 6, 7]`, target 7: choose 2 (rem 5) → 2 (rem 3) → 2 (rem 1, then 2 > 1 break) → back, 3 (rem 0, record `[2,2,3]`) → back; 3 (rem 2, then 3 > 2 break); back to top: 3 (rem 4) → 3 (rem 1) → nothing; 6 (rem 1) → nothing; 7 (rem 0, record `[7]`).

The recursion depth is at most `target / min(candidates)`, and the branching is bounded by `len(candidates)`, so the worst case is `O(kᵗ)` for `k` candidates and depth `t`; the sort-and-break pruning cuts most of that on real inputs. Space `O(t)` for the path and stack.

### Common mistakes

- Recursing from `i + 1`, which forbids reuse and turns this into the "each candidate once" variant.
- Recursing from `0`, which allows reuse but also produces every permutation of each combination.
- Pruning with `if c > remaining: continue` on unsorted candidates, which is correct but does not stop the loop; sort first and `break`.

### How to discuss it

Say "canonical order via a start index eliminates duplicate multisets; allowing `i` rather than `i + 1` permits reuse; sorting turns the pruning into an early exit." For the count-only follow-up, this is the coin-change counting DP: `ways[t] += ways[t - c]` for each candidate `c` in the outer loop, `O(k · target)`. For the ordered variant, swap the loops (target outer, candidates inner) and the DP counts sequences instead of multisets, with a much larger answer; in the recursion, resetting `start` to `0` on every call gives the same thing. Being able to move between the backtracking and the DP and explain why the loop order controls multiset-versus-sequence is the senior signal here.
