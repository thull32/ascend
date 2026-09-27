---
slug: target-sum
title: Target Sum
difficulty: medium
patterns: [dynamic-programming]
lists: [ascend-150]
companies: [meta, google, amazon]
order: 17
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "After choosing signs for the first `i` numbers, all that matters for the rest is the running total. Count how many sign choices reach each running total."
  - "Algebra shortcut: if `P` is the sum of the numbers given `+` and `N` the sum given `-`, then `P - N = target` and `P + N = total`. So `P = (total + target) / 2`."
  - "Now count subsets with sum exactly `P`: a 0/1 knapsack count, one array, sums looped downwards. Watch the parity and range checks, and remember that a `0` can take either sign."
signatures:
  python:
    name: target_sum_ways
    starter: |
      def target_sum_ways(nums: list[int], target: int) -> int:
          pass
  javascript:
    name: target_sum_ways
    starter: |
      function target_sum_ways(nums, target) {
      }
tests:
  - args: [[1, 2, 3], 0]
    expected: 2
  - args: [[4], 4]
    expected: 1
  - args: [[4], -4]
    expected: 1
    label: negative target
  - args: [[4], 2]
    expected: 0
  - args: [[0, 0, 1], 1]
    expected: 4
    label: each zero doubles the count
  - args: [[2, 3, 5, 1], 3]
    expected: 1
  - args: [[1, 2, 1, 2, 1], 1]
    expected: 7
  - args: [[10, 20], 5]
    expected: 0
    hidden: true
    label: wrong parity
  - args: [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 0]
    expected: 184756
    hidden: true
  - args: [[0, 0, 0, 0], 0]
    expected: 16
    hidden: true
  - args: [[3, 1, 4, 1, 5], -2]
    expected: 3
    hidden: true
  - args: [[7, 1], 100]
    expected: 0
    hidden: true
    label: target beyond the total
time_limit_ms: 4000
---
You are given an array of non-negative integers `nums` and an integer `target`. Put a `+` or a `-` sign in front of every number, then add everything up. Return how many of the `2ⁿ` sign assignments produce exactly `target`.

Assignments are counted by position, so if `nums` contains two equal values, flipping one or the other gives two different assignments. A `0` can take either sign.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [1, 2, 3]`, `target = 0` | `2` | `+1 +2 -3` and `-1 -2 +3` |
| `nums = [0, 0, 1]`, `target = 1` | `4` | `±0 ±0 +1`: each zero's sign is free |
| `nums = [10, 20]`, `target = 5` | `0` | Every result is `±10 ± 20`, always a multiple of 10 |

### Constraints

- `1 ≤ len(nums) ≤ 20`
- `0 ≤ nums[i] ≤ 1000`, and `sum(nums) ≤ 1000`
- `-1000 ≤ target ≤ 1000`

### Follow-up

The interviewer asks: "`n` is only 20. Is DP even necessary?" Then: "Now `n` is 200 but the numbers are huge (up to `10¹²`). Which approach survives?"

## Solution

### The naive approach

Try all `2ⁿ` assignments. For `n = 20` that is about a million, which is actually fine in a compiled language and borderline in Python. It stops being fine the moment `n` grows, and the interviewer will grow it. The waste: after the first few signs, many different assignments share the same running total, and the rest of the search is identical for all of them.

### The insight

Two views, both DP.

**Running total.** The remaining numbers do not care how you reached a running total, only what it is. So count, for each possible running total `s` after `i` numbers, how many assignments reach it. Totals lie in `[-total, total]`, at most 2001 values.

**Reduction to subset sum.** Let `P` be the sum of the numbers that get `+` and `N` the sum of those that get `-`. Then `P - N = target` and `P + N = total`, so `P = (total + target) / 2`. Every assignment corresponds to exactly one subset (the `+` numbers), so the answer is the number of subsets with sum exactly `P`. If `total + target` is odd or `|target| > total`, the answer is 0. This halves the range and turns the problem into a 0/1 knapsack count.

### The DP (subset-count form)

- **State.** `cnt[i][s]` is the number of subsets of the first `i` numbers whose sum is exactly `s`, for `0 ≤ s ≤ P`.
- **Transition.** `cnt[i][s] = cnt[i-1][s] + cnt[i-1][s - x]` (second term if `s ≥ x`), where `x` is the `i`-th number: leave it out (it gets `-`), or put it in (it gets `+`).
- **Base case.** `cnt[0][0] = 1` (the empty subset), `cnt[0][s] = 0` otherwise.
- **Iteration order.** Numbers outer; sums inner.
- **Answer.** `cnt[n][P]`, after the parity and range checks.

### Worked table for `nums = [1, 2, 1, 2, 1]`, `target = 1`

Here `total = 7`, so `P = (7 + 1) / 2 = 4`.

| after number \ `s` | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| none | 1 | 0 | 0 | 0 | 0 |
| 1 | 1 | 1 | 0 | 0 | 0 |
| 2 | 1 | 1 | 1 | 1 | 0 |
| 1 | 1 | 2 | 2 | 2 | 1 |
| 2 | 1 | 2 | 3 | 4 | 3 |
| 1 | 1 | 3 | 5 | 7 | **7** |

Each row is the row above plus the row above shifted right by the current number. Seven subsets of `[1, 2, 1, 2, 1]` sum to 4 (both 2s; one 2 with any two of the three 1s, which is `2 × 3 = 6` more), so seven sign assignments reach 1.

### Running-total version

```python
def target_sum_ways_running(nums: list[int], target: int) -> int:
    counts = {0: 1}                            # running total -> number of assignments
    for x in nums:
        nxt: dict[int, int] = {}
        for s, c in counts.items():
            nxt[s + x] = nxt.get(s + x, 0) + c
            nxt[s - x] = nxt.get(s - x, 0) + c
        counts = nxt
    return counts.get(target, 0)
```

Time `O(n · total)`, space `O(total)`. Zeros are handled naturally: `s + 0` and `s - 0` are the same key, so the count doubles.

### Space-optimised subset-count version

```python
def target_sum_ways(nums: list[int], target: int) -> int:
    total = sum(nums)
    if abs(target) > total or (total + target) % 2:
        return 0
    goal = (total + target) // 2
    cnt = [0] * (goal + 1)
    cnt[0] = 1
    for x in nums:
        for s in range(goal, x - 1, -1):       # downwards: each number used once
            cnt[s] += cnt[s - x]
    return cnt[goal]
```

Time `O(n · P)`, space `O(P)` with `P ≤ total`. Running the sums downwards is what makes one array behave like two rows: `cnt[s - x]` has not been updated for the current number yet. For `x = 0` the loop visits every `s` including 0 and doubles each count, which is exactly right.

### Common mistakes

- Skipping the parity check and using `(total + target) // 2` anyway. For `[1, 2]` with target 0 that rounds `3 / 2` down to 1, counts the subset `{1}` and returns 1, yet no assignment of `±1 ±2` equals 0.
- Skipping the range check, so a very negative target produces a negative `goal` and an empty or wrong array.
- Looping sums upwards, which lets one number be counted several times.
- Special-casing zeros by hand and getting the factor wrong. Neither DP needs a special case.

### How to discuss it

Start with the running-total DP; it is the one you would derive from the brute force, and it is obviously correct. Then show the algebra `P = (total + target) / 2` and say "this is now subset-sum counting, a 0/1 knapsack", which halves the state and lets you use one array. Mention the parity and range checks before the interviewer finds them.

On the follow-ups: with `n = 20`, brute force (about `10⁶` assignments) is acceptable and some interviewers want you to say so; the DP is still better because it scales with the total, not with `2ⁿ`. With `n = 200` and huge values, the DP's state space (the total) explodes and becomes useless, while `2²⁰⁰` is also impossible. Meet-in-the-middle helps only up to about `n = 40` (split in half, enumerate `2^(n/2)` sums per side, match with a hash map). Beyond that the general problem is NP-hard, and the pseudo-polynomial DP was only ever fast because the numbers were small. Naming that boundary is the senior answer.
