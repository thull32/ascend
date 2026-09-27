---
slug: maximum-subarray
title: Maximum Subarray
difficulty: medium
patterns: [greedy]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, linkedin, apple]
order: 1
lesson: interview-patterns/combinatorial-patterns/greedy-pattern
hints:
  - "Brute force tries every (start, end) pair. Instead, ask: for the best subarray that ends exactly at index i, what are the only two possibilities?"
  - "The best subarray ending at i either extends the best subarray ending at i - 1, or starts fresh at i. It should start fresh exactly when the running sum before i is negative, because a negative prefix can only drag the total down."
  - "Keep two numbers: the best sum ending here, and the best sum seen anywhere. Initialise both from nums[0], not from 0, or an all-negative array returns the wrong answer."
signatures:
  python:
    name: max_subarray
    starter: |
      def max_subarray(nums: list[int]) -> int:
          pass
  javascript:
    name: max_subarray
    starter: |
      function max_subarray(nums) {
      }
tests:
  - args: [[3, -4, 5, -1, 2, -6, 4]]
    expected: 6
  - args: [[-3, -1, -2]]
    expected: -1
    label: all negative
  - args: [[7]]
    expected: 7
    label: single element
  - args: [[1, 2, 3]]
    expected: 6
    label: all positive takes everything
  - args: [[2, -1, 2, -1, 2]]
    expected: 4
    label: small dips are worth crossing
  - args: [[-2, 5, -9, 6, -1, 4]]
    expected: 9
  - args: [[0, -1, 0]]
    expected: 0
    hidden: true
    label: zeros
  - args: [[-5, 4, -1, -1, 3, -10, 2]]
    expected: 5
    hidden: true
  - args: [[10, -11, 10]]
    expected: 10
    hidden: true
    label: a dip deeper than either side forces a restart
time_limit_ms: 4000
---
You are given an integer array `nums`. Find the contiguous, non-empty subarray with the largest sum and return that sum.

A subarray is a run of adjacent elements; you may not skip elements inside it. It must contain at least one element, so an array of all negative numbers still has an answer (its largest element).

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [3, -4, 5, -1, 2, -6, 4]` | `6` | `[5, -1, 2]` sums to `6`; crossing the `-1` is worth it, crossing the `-6` is not |
| `nums = [-3, -1, -2]` | `-1` | Every subarray is negative; the best is the single element `-1` |
| `nums = [2, -1, 2, -1, 2]` | `4` | The whole array: each `-1` is paid back by the `2` after it |

### Constraints

- `1 ≤ len(nums) ≤ 10⁵`
- `-10⁴ ≤ nums[i] ≤ 10⁴`

### Follow-up

The interviewer asks: "Return the start and end indices as well as the sum." Then: "The array is circular, so a subarray may wrap from the end back to the start. What changes?"

## Solution

### The naive approach

Try every start `i` and every end `j ≥ i`, keeping a running sum as `j` advances. That is `O(n²)` time and `O(1)` space: about 5 × 10⁹ additions for `n = 10⁵`. The truly naive version that re-sums each subarray from scratch is `O(n³)`. Say the `O(n²)` version exists and move on.

### The insight

Fix the *end* of the subarray instead of enumerating both ends. Let `best_here` be the largest sum of a subarray that ends exactly at index `i`. There are only two candidates:

- `nums[i]` on its own (start fresh at `i`), or
- `best_here(i - 1) + nums[i]` (extend the best run that ended one step earlier).

The second beats the first exactly when `best_here(i - 1) > 0`. That is the greedy rule: **a running sum that has gone negative is dead weight, so drop it and restart**. No prefix with a negative sum can ever help a subarray that comes after it, because removing that prefix raises the total.

The overall answer is the largest `best_here` seen at any index. This is Kadane's algorithm. It is also the textbook example of a one-dimensional dynamic programme whose state collapses to a single variable; it is filed under greedy here because the decision at each step ("extend or restart") is made locally and never revisited.

### The optimal approach

```python
def max_subarray(nums: list[int]) -> int:
    best_here = best = nums[0]
    for x in nums[1:]:
        # Extend the current run only if it is still contributing positively.
        best_here = max(x, best_here + x)
        best = max(best, best_here)
    return best
```

Trace `[3, -4, 5, -1, 2, -6, 4]`:

| x | best_here | best |
|---|---|---|
| 3 | 3 | 3 |
| -4 | max(-4, -1) = -1 | 3 |
| 5 | max(5, 4) = 5 | 5 |
| -1 | 4 | 5 |
| 2 | 6 | 6 |
| -6 | 0 | 6 |
| 4 | max(4, 4) = 4 | 6 |

At `x = 5` the running sum was `-1`, so the algorithm restarts: that is the greedy decision in action.

Time `O(n)`, one pass. Space `O(1)`. (`nums[1:]` copies the list in Python; iterate by index if the interviewer cares about the extra `O(n)`.)

### Common mistakes

- Initialising `best = 0`. On `[-3, -1, -2]` that returns `0`, the sum of an empty subarray, which the problem forbids.
- Resetting when the *current element* is negative rather than when the *running sum* is negative. In `[2, -1, 2]` the `-1` should be crossed; the answer is `3`, not `2`.
- Resetting to `0` and then comparing, which works only if you update `best` before the reset; writing it as `max(x, best_here + x)` avoids the ordering trap.

### How to discuss it

State the `O(n²)` enumeration, then say: "The best subarray ending at `i` either extends the best one ending at `i - 1` or starts at `i`, and it should restart when the running sum is negative." That sentence is the whole algorithm; write the four lines after it. For the indices follow-up, record a tentative start whenever you restart and copy it to the answer when `best` improves. For the circular follow-up, the best wrapping subarray is the total minus the *minimum* subarray, so run Kadane twice (max and min) and take `max(best, total - min_sub)`, except when every element is negative, where `total - min_sub` would describe an empty subarray and you must return `best`. A senior candidate also mentions the divide-and-conquer `O(n log n)` version exists (combine left best, right best, and the best crossing the midpoint) and why nobody uses it: it is slower and harder, but it parallelises and underlies segment-tree range-max-subarray queries. The same "extend or restart" shape reappears in [Maximum Product Subarray](/practice/max-product-subarray), where you must track the minimum too because a negative times a negative flips sign.
