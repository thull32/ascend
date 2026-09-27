---
slug: partition-equal-subset
title: Partition Equal Subset Sum
difficulty: medium
patterns: [dynamic-programming]
lists: [ascend-150]
companies: [amazon, meta, google]
order: 12
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "If the total is odd, the answer is immediately false. Otherwise you need one subset that sums to exactly `total / 2`; the rest automatically sums to the other half."
  - "This is 0/1 knapsack with booleans: `reach[s]` says whether some subset of the items processed so far sums to `s`. Each item either joins a subset or does not."
  - "With a single 1-D array, loop the sums downwards for each item, so the item cannot be counted twice within the same pass."
signatures:
  python:
    name: can_partition
    starter: |
      def can_partition(nums: list[int]) -> bool:
          pass
  javascript:
    name: can_partition
    starter: |
      function can_partition(nums) {
      }
tests:
  - args: [[3, 1, 4, 2, 2]]
    expected: true
  - args: [[2, 3, 4]]
    expected: false
    label: odd total
  - args: [[1, 2, 5]]
    expected: false
    label: even total but no subset reaches half
  - args: [[7, 7]]
    expected: true
  - args: [[1]]
    expected: false
    label: single element
  - args: [[2, 2, 3, 5]]
    expected: false
  - args: [[3, 3, 3, 4, 5]]
    expected: true
  - args: [[99, 98, 97, 96, 95, 94, 1, 2]]
    expected: true
    hidden: true
  - args: [[23, 13, 11, 7, 6, 5, 5]]
    expected: true
    hidden: true
  - args: [[37, 28, 91, 64, 12, 55, 43, 19, 76, 8, 33, 50]]
    expected: true
    hidden: true
  - args: [[8, 6, 3, 2, 3, 20]]
    expected: false
    hidden: true
  - args: [[1, 3, 9, 27, 81, 1]]
    expected: false
    hidden: true
time_limit_ms: 4000
---
Given an array of positive integers `nums`, decide whether it can be split into two groups with equal sums. Every element must go into exactly one of the two groups. Return `true` or `false`.

### Examples

| Input | Output | Why |
|---|---|---|
| `[3, 1, 4, 2, 2]` | `true` | `{4, 2}` and `{3, 1, 2}` both sum to 6 |
| `[2, 3, 4]` | `false` | The total, 9, is odd |
| `[1, 2, 5]` | `false` | The total is 8, but no subset sums to 4 |

### Constraints

- `1 ≤ len(nums) ≤ 200`
- `1 ≤ nums[i] ≤ 100`

### Follow-up

The interviewer asks: "Return the two groups." Then: "Now split into `k` groups of equal sum. Does the same DP extend?" And: "If an equal split is impossible, what is the smallest achievable difference between the two sums?"

## Solution

### The naive approach

Try all `2ⁿ` ways to assign elements to the two groups. With `n = 200` that is `2²⁰⁰`. Even the observation that you only need one subset with sum `total / 2` leaves `2ⁿ` subsets.

### The insight

The number of *subsets* is exponential, but the number of distinct subset *sums* is small: every sum lies between 0 and `total ≤ 20,000`. So instead of remembering which subsets you have built, remember only which sums are reachable. Processing items one at a time, the reachable set after an item is the old set plus the old set shifted by that item's value.

That is the 0/1 knapsack structure: each item is used at most once, and the "capacity" is `total / 2`.

### The DP

- **State.** `reach[i][s]` is true exactly when some subset of the first `i` items sums to `s`, for `0 ≤ s ≤ target = total / 2`.
- **Transition.** `reach[i][s] = reach[i-1][s] or (s ≥ x and reach[i-1][s - x])`, where `x` is item `i`: leave it out, or put it in.
- **Base case.** `reach[0][0] = True` (the empty subset); `reach[0][s] = False` for `s > 0`.
- **Iteration order.** Items in any order, outer; sums inner.
- **Answer.** `reach[n][target]`, after first returning `false` if `total` is odd.

### Worked table for `[3, 1, 4, 2, 2]` (total 12, target 6)

| after item \ `s` | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| none | T | F | F | F | F | F | F |
| 3 | T | F | F | T | F | F | F |
| 1 | T | T | F | T | T | F | F |
| 4 | T | T | F | T | T | T | F |
| 2 | T | T | T | T | T | T | **T** |
| 2 | T | T | T | T | T | T | T |

Each row is the row above OR the row above shifted right by the item's value. After the first 2, sum 6 becomes reachable from sum 4 (`{4, 2}` or `{3, 1, 2}`), and the answer is `true`.

### Tabulated version

```python
def can_partition_table(nums: list[int]) -> bool:
    total = sum(nums)
    if total % 2:
        return False
    target = total // 2
    n = len(nums)
    reach = [[False] * (target + 1) for _ in range(n + 1)]
    reach[0][0] = True
    for i in range(1, n + 1):
        x = nums[i - 1]
        for s in range(target + 1):
            reach[i][s] = reach[i - 1][s] or (s >= x and reach[i - 1][s - x])
    return reach[n][target]
```

Time `O(n · target)`: at most `200 × 10,000 = 2 × 10⁶` cells. Space the same.

### Space-optimised version

Row `i` reads only row `i - 1`, and only at indices `s` and `s - x ≤ s`. So one row suffices if you update it from the **highest sum down**: when you write `reach[s]`, the entry `reach[s - x]` you read has not been updated in this pass yet, so it still means "reachable without the current item". Going upwards would let an item be used twice (after `reach[x]` turns true, `reach[2x]` would read it in the same pass): that is the unbounded knapsack, which is a different problem.

```python
def can_partition(nums: list[int]) -> bool:
    total = sum(nums)
    if total % 2:
        return False
    target = total // 2
    reach = [False] * (target + 1)
    reach[0] = True
    for x in nums:
        for s in range(target, x - 1, -1):     # downwards: each item used at most once
            if reach[s - x]:
                reach[s] = True
        if reach[target]:
            return True                        # early exit
    return reach[target]
```

Time `O(n · target)`, space `O(target)`. A further constant-factor trick is a bitset: keep the reachable sums as bits of one integer and do `bits |= bits << x` per item, which processes 64 sums per machine word (in Python, a big integer does this for you).

### Common mistakes

- Looping sums upwards in the 1-D version, which silently turns it into the unbounded problem: `[1, 2, 5]` would report `true` because 1 can be reused to make 4.
- Forgetting the odd-total check and asking for `target = total // 2`, which rounds down and can find a "half" that is not one.
- Trying greedy (sort descending, put each item in the lighter group). `[3, 3, 2, 2, 2]` defeats it: greedy ends with 3 + 2 + 2 = 7 against 3 + 2 = 5, but `{3, 3}` and `{2, 2, 2}` both sum to 6.

### How to discuss it

Reduce first: "equal halves means one subset summing to `total / 2`, and odd totals are out". Then name it: "0/1 knapsack on booleans; the state is the set of reachable sums". Draw two or three rows of the table, then give the 1-D version and say *why* the inner loop runs downwards. That last sentence is what the interviewer is listening for.

Complexity is `O(n · total)`, which is **pseudo-polynomial**: polynomial in the numeric value of the total, not in the input's bit length. Partition is NP-complete in general; the DP is fast here only because values are at most 100. Say that. For the reconstruction follow-up, keep the 2-D table and walk back from `(n, target)`: if `reach[i-1][s]` is true, item `i` was not needed; otherwise it was, and move to `s - x`. For `k` groups the reachable-sum trick no longer suffices; use backtracking with pruning, or a bitmask DP over subsets in `O(2ⁿ · n)` for small `n`. For the minimum difference, run the same DP to `total // 2` and take the largest reachable `s`; the answer is `total - 2s`.
