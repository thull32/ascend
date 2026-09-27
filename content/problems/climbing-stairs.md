---
slug: climbing-stairs
title: Climbing Stairs
difficulty: easy
patterns: [dynamic-programming]
lists: [core-75, ascend-150]
companies: [amazon, google, apple, adobe]
order: 1
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Think about the very last move. It was either a one-step or a two-step. Where were you standing just before it?"
  - "If `ways(i)` counts the move sequences that land exactly on step `i`, then `ways(i) = ways(i - 1) + ways(i - 2)`. What are `ways(0)` and `ways(1)`?"
  - "Each value depends only on the two before it, so two variables are enough; no array needed."
signatures:
  python:
    name: climbing_stairs
    starter: |
      def climbing_stairs(n: int) -> int:
          pass
  javascript:
    name: climbing_stairs
    starter: |
      function climbing_stairs(n) {
      }
tests:
  - args: [1]
    expected: 1
    label: single step
  - args: [2]
    expected: 2
  - args: [4]
    expected: 5
  - args: [5]
    expected: 8
  - args: [10]
    expected: 89
  - args: [3]
    expected: 3
    hidden: true
  - args: [30]
    expected: 1346269
    hidden: true
  - args: [45]
    expected: 1836311903
    hidden: true
    label: largest input; plain recursion times out here
time_limit_ms: 4000
---
You are at the bottom of a staircase with `n` steps. Each move takes you up either one step or two steps. Return the number of distinct sequences of moves that end exactly on step `n`.

Two sequences are different if they differ at any position, so `1 then 2` and `2 then 1` count separately.

### Examples

| Input | Output | Why |
|---|---|---|
| `n = 2` | `2` | `1+1` or `2` |
| `n = 4` | `5` | `1+1+1+1`, `1+1+2`, `1+2+1`, `2+1+1`, `2+2` |
| `n = 5` | `8` | the 5 ways to reach step 4, each followed by a 1, plus the 3 ways to reach step 3, each followed by a 2 |

### Constraints

- `1 ≤ n ≤ 45`
- The answer fits in a signed 32-bit integer.

### Follow-up

The interviewer asks: "Now the allowed step sizes are an arbitrary set, say `{1, 3, 5}`. What changes?" Then: "Now `n` is up to `10¹⁸` and I want the answer modulo `10⁹ + 7`. You cannot loop to `n`."

## Solution

### The naive approach

Recurse on the first move: `count(n) = count(n - 1) + count(n - 2)`. It is correct and it is exponential. The call tree for `count(45)` has about `1.8 × 10⁹` leaves, because `count(43)` is computed from both `count(45)` and `count(44)`, and the duplication compounds at every level. The recursion is the Fibonacci recursion, and its cost grows like `φⁿ ≈ 1.618ⁿ`.

### The insight

There are only `n + 1` distinct subproblems: "how many ways to land on step `i`" for `i = 0..n`. The exponential tree recomputes each one many times. Compute each once, in an order where its inputs are already known, and the cost collapses to `O(n)`.

The recurrence comes from asking about the *last* move rather than the first. Any sequence that ends on step `i` finished with a 1-step (so it was on `i - 1` before) or a 2-step (so it was on `i - 2`). Those two groups do not overlap and together cover everything, so their counts add.

### The DP

- **State.** `ways[i]` is the number of move sequences that end exactly on step `i`.
- **Transition.** `ways[i] = ways[i - 1] + ways[i - 2]` for `i ≥ 2`.
- **Base cases.** `ways[0] = 1` (the empty sequence: you are already there) and `ways[1] = 1` (a single 1-step). `ways[0] = 1` is not a trick; it is what makes `ways[2] = ways[1] + ways[0] = 2` count the lone 2-step correctly.
- **Iteration order.** Increasing `i`, because each entry reads the two entries below it.
- **Answer.** `ways[n]`.

### Worked table for `n = 5`

| `i` | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| `ways[i - 1]` | – | – | 1 | 2 | 3 | 5 |
| `ways[i - 2]` | – | – | 1 | 1 | 2 | 3 |
| `ways[i]` | 1 | 1 | 2 | 3 | 5 | **8** |

Read the last column as a sentence: of the 8 ways to reach step 5, 5 arrive from step 4 with a 1-step and 3 arrive from step 3 with a 2-step.

### Tabulated version

```python
def climbing_stairs_table(n: int) -> int:
    ways = [0] * (n + 1)
    ways[0] = 1
    ways[1] = 1
    for i in range(2, n + 1):
        ways[i] = ways[i - 1] + ways[i - 2]
    return ways[n]
```

Time `O(n)`, space `O(n)`.

### Space-optimised version

Row `i` reads only rows `i - 1` and `i - 2`, so keep two rolling variables.

```python
def climbing_stairs(n: int) -> int:
    prev2, prev1 = 1, 1          # ways[i - 2], ways[i - 1], starting at i = 2
    for _ in range(2, n + 1):
        prev2, prev1 = prev1, prev1 + prev2
    return prev1
```

Time `O(n)`, space `O(1)`. For `n = 1` the loop does not run and the function returns `ways[1] = 1`.

```viz
{"type": "dp", "algorithm": "climbing-stairs", "n": 6, "title": "Climbing Stairs bottom-up", "caption": "Each cell is the sum of the two before it: the last move was a 1-step or a 2-step."}
```

### Common mistakes

- Setting `ways[0] = 0`. Then `ways[2] = 1` and every later value is off by a Fibonacci shift. The empty sequence is one way to stand on step 0.
- Writing the memoised recursion without the memo, or with a memo keyed on something other than `i`, and hitting a timeout at `n = 45`.
- Allocating `ways` of size `n` rather than `n + 1`, then indexing `ways[n]`.

### How to discuss it

State the recurrence from the last move ("the last step was 1 or 2, those cases are disjoint, so add"), name the base case `ways[0] = 1` and justify it, then write the two-variable loop. Mention that this is the Fibonacci sequence shifted by one, so `ways[n] = F(n + 1)`.

For the arbitrary step set, the transition becomes `ways[i] = Σ ways[i - s]` over allowed sizes `s ≤ i`; time `O(n · |steps|)`, and the rolling window must hold `max(steps)` values instead of two. For `n = 10¹⁸`, the recurrence is linear, so write it as a matrix: `[ways[i], ways[i - 1]] = [[1, 1], [1, 0]] · [ways[i - 1], ways[i - 2]]`, and raise the matrix to the `n`-th power by repeated squaring in `O(log n)` multiplications of `2 × 2` matrices, reducing modulo `10⁹ + 7` after each. That generalises to any fixed step set with a `k × k` companion matrix in `O(k³ log n)`. Knowing that linear recurrences admit matrix exponentiation is the senior signal on an otherwise easy problem.
