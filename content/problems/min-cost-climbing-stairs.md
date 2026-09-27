---
slug: min-cost-climbing-stairs
title: Min Cost Climbing Stairs
difficulty: easy
patterns: [dynamic-programming]
lists: [ascend-150]
companies: [amazon, google, bloomberg]
order: 2
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Define the cost of *standing* on a position, before you pay its fee. What does it cost to stand on step 0 or step 1?"
  - "You reach position `i` from `i - 1` (paying `cost[i - 1]`) or from `i - 2` (paying `cost[i - 2]`). Take the cheaper."
  - "The top is position `n`, one past the last step, and it has no fee of its own."
signatures:
  python:
    name: min_cost_climbing_stairs
    starter: |
      def min_cost_climbing_stairs(cost: list[int]) -> int:
          pass
  javascript:
    name: min_cost_climbing_stairs
    starter: |
      function min_cost_climbing_stairs(cost) {
      }
tests:
  - args: [[5, 10, 3]]
    expected: 8
  - args: [[2, 7]]
    expected: 2
    label: two steps, start on the cheaper
  - args: [[0, 0]]
    expected: 0
    label: free steps
  - args: [[4, 1, 4, 1, 4, 1]]
    expected: 3
    label: always skip the expensive steps
  - args: [[3, 8, 1, 1, 9, 2]]
    expected: 7
  - args: [[10, 5, 20]]
    expected: 5
    label: start on step 1 and jump to the top
  - args: [[7, 7, 7, 7, 7]]
    expected: 14
    hidden: true
  - args: [[3, 8, 1, 1, 9, 2, 6, 4]]
    expected: 11
    hidden: true
  - args: [[6, 2, 2, 6, 1, 9, 9, 1, 3, 5, 8, 2]]
    expected: 22
    hidden: true
time_limit_ms: 4000
---
A staircase has steps numbered `0` to `n - 1`. Step `i` carries a fee `cost[i]`, which you pay when you step off it. From step `i` you may move up to step `i + 1` or step `i + 2`. You may begin on step `0` or step `1` without paying anything to get there.

Your goal is the landing just past the last step, position `n`. Return the minimum total fee you pay to reach it.

### Examples

| Input | Output | Why |
|---|---|---|
| `cost = [5, 10, 3]` | `8` | Start on 0, pay 5 to jump to 2, pay 3 to step to the top |
| `cost = [10, 5, 20]` | `5` | Start on 1, pay 5, jump two to the top |
| `cost = [4, 1, 4, 1, 4, 1]` | `3` | Start on 1 and jump 1 → 3 → 5 → top, paying 1 each time |

### Constraints

- `2 ≤ len(cost) ≤ 1000`
- `0 ≤ cost[i] ≤ 999`

### Follow-up

The interviewer asks: "Return the steps you actually stand on, not just the total." Then: "Now you may jump up to `k` steps at once, with `k` as large as `n`. Can you stay at `O(n)`?"

## Solution

### The naive approach

Recurse from each possible start: pay the fee here, then try both moves. Every position branches in two, so the recursion does `O(2ⁿ)` work, and position `i` is re-solved once for every distinct route that reaches it. With `n = 1000` that never finishes.

### The insight

The cheapest way to continue from a position does not depend on how you got there. So the only thing worth remembering about a partial climb is where you are standing and what it cost. That is `n + 1` subproblems, each with two choices.

Frame the state as "cost to **stand on** position `i`", before paying that step's fee. The two free starts become two zero base cases, and the top, which has no fee, is just position `n`.

### The DP

- **State.** `best[i]` is the minimum total fee paid to stand on position `i`, for `0 ≤ i ≤ n`.
- **Transition.** `best[i] = min(best[i - 1] + cost[i - 1], best[i - 2] + cost[i - 2])` for `i ≥ 2`. The first term arrives with a one-step move and pays the fee of the step it left; the second arrives with a two-step move.
- **Base cases.** `best[0] = best[1] = 0`, the two free starts.
- **Iteration order.** Increasing `i`.
- **Answer.** `best[n]`.

### Worked table for `cost = [3, 8, 1, 1, 9, 2]`

| `i` | 0 | 1 | 2 | 3 | 4 | 5 | 6 (top) |
|---|---|---|---|---|---|---|---|
| from `i - 1`: `best[i-1] + cost[i-1]` | – | – | 0 + 8 = 8 | 3 + 1 = 4 | 4 + 1 = 5 | 4 + 9 = 13 | 5 + 2 = 7 |
| from `i - 2`: `best[i-2] + cost[i-2]` | – | – | 0 + 3 = 3 | 0 + 8 = 8 | 3 + 1 = 4 | 4 + 1 = 5 | 4 + 9 = 13 |
| `best[i]` | 0 | 0 | 3 | 4 | 4 | 5 | **7** |

Walking the choices back from the top: position 6 came from 5 (fee 2), 5 from 3 (fee 1), 3 from 2 (fee 1), 2 from 0 (fee 3). Total `3 + 1 + 1 + 2 = 7`, and the expensive steps 1 and 4 are never stood on.

### Tabulated version

```python
def min_cost_climbing_stairs_table(cost: list[int]) -> int:
    n = len(cost)
    best = [0] * (n + 1)
    for i in range(2, n + 1):
        best[i] = min(best[i - 1] + cost[i - 1], best[i - 2] + cost[i - 2])
    return best[n]
```

Time `O(n)`, space `O(n)`.

### Space-optimised version

Each entry reads only the two before it.

```python
def min_cost_climbing_stairs(cost: list[int]) -> int:
    two_back, one_back = 0, 0          # best[i - 2], best[i - 1]
    for i in range(2, len(cost) + 1):
        two_back, one_back = one_back, min(one_back + cost[i - 1], two_back + cost[i - 2])
    return one_back
```

Time `O(n)`, space `O(1)`.

### Common mistakes

- Treating the top as the last step (`n - 1`) instead of one past it. On `[10, 5, 20]` that returns 10 instead of 5, because it forces you to stand on the fee-20 step or pay 10 to get there.
- Using the other framing ("cost including the fee of step `i`") and then returning `best[n - 1]` instead of `min(best[n - 1], best[n - 2])`. Both framings work; mixing them does not.
- Charging a fee for the starting step. Starting is free; leaving is not.

### How to discuss it

Say the state in one sentence ("minimum fee to stand on position `i`, before paying its own fee"), then the two incoming moves. That framing makes both base cases zero and the answer `best[n]`, with no special cases at either end. Trace the table for a four-element input out loud, then collapse to two variables.

For the path follow-up, keep the full `best` array (or a `came_from` array) and walk back from `n`, choosing whichever predecessor produced the minimum; that is the standard reason not to throw the table away. For jumps of up to `k`, the transition becomes `best[i] = min(best[j] + cost[j] for j in i-k..i-1)`, which is `O(nk)` naively. The window of candidates slides by one each step, so a monotonic deque of indices with increasing `best[j] + cost[j]` gives the minimum in amortised `O(1)`, for `O(n)` total. Recognising "min over a sliding window of previous DP values" as a monotonic-deque job is the senior move.
