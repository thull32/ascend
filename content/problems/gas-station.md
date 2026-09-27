---
slug: gas-station
title: Gas Station
difficulty: medium
patterns: [greedy]
lists: [ascend-150]
companies: [amazon, google, bloomberg, uber]
order: 4
lesson: interview-patterns/combinatorial-patterns/greedy-pattern
hints:
  - "If the total gas is less than the total cost, no start can work. Is the converse true: if the totals balance, must some start work?"
  - "Simulate from a candidate start. If the tank goes negative on the way from station s to station j, what can you conclude about every start between s and j?"
  - "None of them can work either: each would arrive at j with no more fuel than starting at s did. So jump the candidate straight to j + 1 and reset the tank. One pass is enough."
signatures:
  python:
    name: can_complete_circuit
    starter: |
      def can_complete_circuit(gas: list[int], cost: list[int]) -> int:
          pass
  javascript:
    name: can_complete_circuit
    starter: |
      function can_complete_circuit(gas, cost) {
      }
tests:
  - args: [[3, 1, 4, 2], [2, 3, 1, 3]]
    expected: 2
  - args: [[2, 2, 2], [3, 2, 2]]
    expected: -1
    label: not enough gas in total
  - args: [[5], [4]]
    expected: 0
    label: single station, enough gas
  - args: [[1], [2]]
    expected: -1
    label: single station, not enough
  - args: [[0, 0, 7, 0], [1, 1, 1, 3]]
    expected: 2
    label: candidate moves twice
  - args: [[4, 0, 0, 0], [1, 1, 1, 1]]
    expected: 0
    label: totals exactly balance
  - args: [[2, 3, 4], [3, 4, 3]]
    expected: -1
    hidden: true
  - args: [[1, 1, 1, 10, 1], [2, 2, 2, 2, 5]]
    expected: 3
    hidden: true
  - args: [[6, 1, 1], [1, 3, 4]]
    expected: 0
    hidden: true
    label: tank reaches exactly zero at the end
  - args: [[2, 0, 1, 3], [1, 2, 2, 0]]
    expected: 3
    hidden: true
    label: answer is the last station
time_limit_ms: 4000
---
There are `n` fuel stations on a circular road, numbered `0` to `n - 1`. At station `i` you can collect `gas[i]` units of fuel, and driving from station `i` to station `i + 1` (with station `n - 1` wrapping to station `0`) burns `cost[i]` units. Your car's tank is unlimited and starts empty.

Return the index of the station where you should start so that you can drive once around the full circle and arrive back at that station, never running the tank below zero. If no starting station works, return `-1`. When a valid start exists, the inputs guarantee it is unique.

### Examples

| Input | Output | Why |
|---|---|---|
| `gas = [3, 1, 4, 2]`, `cost = [2, 3, 1, 3]` | `2` | From 2 the tank reads `3, 2, 3, 1` after each leg. Starting at 0 leaves `1` after the first leg; the second leg nets `-2`, so the tank would hit `-1` |
| `gas = [2, 2, 2]`, `cost = [3, 2, 2]` | `-1` | Total gas `6` is less than total cost `7`; no start can succeed |
| `gas = [4, 0, 0, 0]`, `cost = [1, 1, 1, 1]` | `0` | The tank reads `3, 2, 1, 0`; arriving with exactly zero is allowed |

### Constraints

- `1 ≤ n ≤ 10⁵`, `len(gas) == len(cost) == n`
- `0 ≤ gas[i], cost[i] ≤ 10⁴`
- If a valid start exists, it is unique.

### Follow-up

The interviewer asks: "Prove that if total gas ≥ total cost, a valid start always exists." Then: "The tank now has a capacity limit `C`. What breaks?"

## Solution

### The naive approach

Try each station as the start and simulate the full lap, bailing out as soon as the tank goes negative. Worst case `O(n²)`: for `n = 10⁵` that is 10¹⁰ steps. It is correct, and it is where most candidates begin.

### The insight

Let `diff[i] = gas[i] - cost[i]`, the net change in fuel across leg `i`. Two facts make the problem linear.

**Fact 1: the totals decide existence.** If `sum(diff) < 0`, you burn more than you collect in any full lap, so no start works. If `sum(diff) ≥ 0`, a start exists: take the index `m` where the running prefix sum of `diff` is lowest, and start at `m + 1`. Every partial sum from there is the prefix sum minus that minimum, so it never drops below zero, including across the wrap-around because the total is non-negative.

**Fact 2: a failure eliminates a whole range.** Suppose you start at `s` and the tank first goes negative on the leg out of station `j`. Consider any start `k` strictly between `s` and `j`. Starting at `s`, you arrived at `k` with a tank of at least zero (because `j` was the *first* failure). Starting at `k`, you arrive at `k` with exactly zero. So starting at `k` you have no more fuel than the `s` run at every later point, and you also fail by `j`. Every candidate from `s` to `j` is dead; the next one worth trying is `j + 1`.

Together: sweep once, reset the candidate to `i + 1` whenever the tank goes negative, and at the end return the candidate if the total is non-negative.

### The optimal approach

```python
def can_complete_circuit(gas: list[int], cost: list[int]) -> int:
    total = 0     # net fuel over the whole lap
    tank = 0      # fuel since the current candidate start
    start = 0
    for i in range(len(gas)):
        diff = gas[i] - cost[i]
        total += diff
        tank += diff
        if tank < 0:
            # No station in [start, i] can be the answer.
            start = i + 1
            tank = 0
    return start if total >= 0 else -1
```

Trace `gas = [0, 0, 7, 0]`, `cost = [1, 1, 1, 3]` with `diff = [-1, -1, 6, -3]`:

| i | diff | tank | start |
|---|---|---|---|
| 0 | -1 | -1 → reset | 1 |
| 1 | -1 | -1 → reset | 2 |
| 2 | 6 | 6 | 2 |
| 3 | -3 | 3 | 2 |

`total = 1 ≥ 0`, so the answer is `2`. You never simulate the wrap-around explicitly; Fact 1 guarantees it succeeds.

Time `O(n)`, space `O(1)`.

### Common mistakes

- Returning `start` without checking `total`. On `[2, 2, 2] / [3, 2, 2]` the sweep ends with a candidate, but no lap is possible.
- Resetting `start = i` instead of `i + 1`. Station `i` is the one whose outgoing leg broke the tank; it is inside the eliminated range.
- Believing you must also simulate the wrap-around from `start` to `start - 1`. The total check covers it; re-simulating is harmless but signals you have not seen why.
- Using `tank <= 0` as the failure condition. Arriving with exactly zero is fine.

### How to discuss it

Say the `O(n²)` simulation, then state Fact 2 as the key lemma ("if I fail at `j` starting from `s`, every start in between also fails, because they arrive at each later station with no more fuel"). That lemma is what makes the greedy skip valid; interviewers want it said aloud rather than hidden in code. For the existence proof, the minimum-prefix-sum argument is the clean one and doubles as a second `O(n)` algorithm. With a tank capacity `C`, surplus fuel is lost when the tank is full, so the fuel you carry past a station is no longer the plain prefix sum; Fact 2 no longer holds in its simple form, and you should say the problem has changed rather than force the old solution.
