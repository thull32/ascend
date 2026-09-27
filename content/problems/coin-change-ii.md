---
slug: coin-change-ii
title: Coin Change II
difficulty: medium
patterns: [dynamic-programming]
lists: [ascend-150]
companies: [amazon, google, bloomberg]
order: 16
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "You are counting combinations (multisets), not sequences: `1 + 2` and `2 + 1` are the same way. Fix an order on the coin types so each multiset is built exactly once."
  - "Let `ways[i][a]` count the ways to make `a` using only the first `i` coin types. Either coin `i` is not used at all, or it is used at least once."
  - "In one dimension: loop over coins in the outer loop and amounts upward in the inner loop, doing `ways[a] += ways[a - c]`. Swapping the loops counts sequences instead."
signatures:
  python:
    name: coin_change_ways
    starter: |
      def coin_change_ways(coins: list[int], amount: int) -> int:
          pass
  javascript:
    name: coin_change_ways
    starter: |
      function coin_change_ways(coins, amount) {
      }
tests:
  - args: [[1, 2, 3], 4]
    expected: 4
  - args: [[2], 3]
    expected: 0
    label: unreachable
  - args: [[7], 0]
    expected: 1
    label: zero amount has exactly one way, using no coins
  - args: [[3, 5], 15]
    expected: 2
  - args: [[2, 5, 10], 20]
    expected: 6
  - args: [[1, 5, 10, 25], 100]
    expected: 242
  - args: [[4, 6, 9], 30]
    expected: 5
    hidden: true
  - args: [[1, 2], 1000]
    expected: 501
    hidden: true
  - args: [[5, 7], 1]
    expected: 0
    hidden: true
  - args: [[3, 4, 7], 21]
    expected: 5
    hidden: true
time_limit_ms: 4000
---
You have an unlimited supply of coins of each denomination in `coins`. Return the number of different combinations of coins that add up to exactly `amount`.

Two combinations are the same if they use the same number of each coin, regardless of order: `1 + 1 + 2` and `2 + 1 + 1` count once. If `amount` is 0, the empty combination counts as one way.

### Examples

| Input | Output | Why |
|---|---|---|
| `coins = [1, 2, 3]`, `amount = 4` | `4` | `1+1+1+1`, `1+1+2`, `2+2`, `1+3` |
| `coins = [3, 5]`, `amount = 15` | `2` | Five 3s, or three 5s |
| `coins = [1, 5, 10, 25]`, `amount = 100` | `242` | The classic "ways to change a dollar" count |

### Constraints

- `1 ≤ len(coins) ≤ 300`
- `1 ≤ coins[i] ≤ 5000`, all distinct
- `0 ≤ amount ≤ 5000`
- The answer fits in a signed 32-bit integer.

### Follow-up

The interviewer asks: "What if order *does* matter, so `1 + 2` and `2 + 1` are different?" Then: "What if each coin can be used at most once?"

## Solution

This is the counting sibling of [Coin Change](/practice/coin-change), which asks for the fewest coins.

### The naive approach

Recurse over the coin types: for coin `i`, try using it 0, 1, 2, … times and recurse on coin `i + 1` with what remains. That counts each combination once, but the same `(coin index, remaining amount)` pair is reached again and again: with coins `[1, 2, 5, 10]` and amount 1000, the call for coin 10 with remainder 500 is reached once for every combination of 1s, 2s and 5s that makes the other 500, and each of those calls redoes the same work.

The other naive idea, "count sequences of coins that sum to `amount`, then divide out the reorderings", does not work: the number of reorderings differs from combination to combination.

### The insight

To count each multiset once, decide the coins in a fixed order: first how many of coin 0, then how many of coin 1, and so on. A combination is then a single path through that sequence of decisions. Subproblems are "ways to make `a` using only the first `i` coin types", and there are `(k + 1)(amount + 1)` of them.

### The DP

- **State.** `ways[i][a]` is the number of combinations of the first `i` coin types that sum to exactly `a`.
- **Transition.** With `c` the `i`-th coin, `ways[i][a] = ways[i-1][a] + ways[i][a - c]` (second term only if `a ≥ c`). The first term never uses coin `c`; the second uses it at least once, removes one copy, and stays on row `i` because more copies are still allowed.
- **Base cases.** `ways[i][0] = 1` for every `i` (the empty combination); `ways[0][a] = 0` for `a > 0` (no coins, positive amount).
- **Iteration order.** Coin types outer, amounts inner and increasing, so `ways[i][a - c]` is already final when `ways[i][a]` reads it.
- **Answer.** `ways[k][amount]`.

### Worked table for `coins = [1, 2, 3]`, `amount = 4`

| coins allowed \ `a` | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| none | 1 | 0 | 0 | 0 | 0 |
| {1} | 1 | 1 | 1 | 1 | 1 |
| {1, 2} | 1 | 1 | 2 | 2 | 3 |
| {1, 2, 3} | 1 | 1 | 2 | 3 | **4** |

For example `ways[{1,2}][4] = ways[{1}][4] + ways[{1,2}][2] = 1 + 2 = 3`: the one all-ones combination, plus every combination for 2 with an extra 2 added (`1+1+2` and `2+2`). The last row adds `1+3` to get 4.

### Tabulated version

```python
def coin_change_ways_table(coins: list[int], amount: int) -> int:
    k = len(coins)
    ways = [[0] * (amount + 1) for _ in range(k + 1)]
    for i in range(k + 1):
        ways[i][0] = 1
    for i in range(1, k + 1):
        c = coins[i - 1]
        for a in range(1, amount + 1):
            ways[i][a] = ways[i - 1][a] + (ways[i][a - c] if a >= c else 0)
    return ways[k][amount]
```

Time `O(k · amount)`: up to `300 × 5000 = 1.5 × 10⁶` cells. Space the same.

### Space-optimised version

Row `i` reads row `i - 1` at the same index (which, in a single array, is simply the value *before* you update it) and row `i` at a smaller index (already updated, since amounts go upward). So one array updated in place, amounts ascending, is exactly the 2-D recurrence.

```python
def coin_change_ways(coins: list[int], amount: int) -> int:
    ways = [0] * (amount + 1)
    ways[0] = 1
    for c in coins:                            # coin types outer: fixes an order
        for a in range(c, amount + 1):         # ascending: coin c may repeat
            ways[a] += ways[a - c]
    return ways[amount]
```

Time `O(k · amount)`, space `O(amount)`.

### Why the loop order matters

Swap the loops (amount outer, coins inner) and each `ways[a]` sums over "which coin comes *last*", with no order imposed on the coins before it. That counts **sequences**: for `[1, 2, 3]` and 4 it gives 7 (`1+1+1+1`, `1+1+2`, `1+2+1`, `2+1+1`, `2+2`, `1+3`, `3+1`). Both are valid DPs for different questions; knowing which loop order answers which question is the point of this problem.

### Common mistakes

- Amount-outer loop order, which counts permutations.
- `ways[0] = 0`, which makes everything 0; the empty combination is the seed of every count.
- Iterating amounts downward, which turns it into "each coin at most once" (0/1 knapsack counting).
- Reusing the Coin Change (fewest coins) code and replacing `min` with `+` without thinking about loop order; the fewest-coins problem does not care about order, so either loop order works there, and that habit misleads here.

### How to discuss it

Say "counting multisets, so I fix an order on the coin types; that is the outer loop". Give the 2-D state and the "not used / used at least once" split, then collapse to one row and say why ascending amounts allow reuse. Answer the permutations question unprompted: swap the loops, and the count becomes sequences.

For "each coin at most once", keep coins outer but run amounts **downward**, so `ways[a - c]` still refers to the row without coin `c`; this is the counting version of [Partition Equal Subset Sum](/practice/partition-equal-subset). The three variants (unbounded combinations, ordered sequences, 0/1) differ only in loop nesting and direction, and a senior candidate can say which is which and why.
