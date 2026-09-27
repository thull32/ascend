---
slug: coin-change
title: Coin Change
difficulty: medium
patterns: [dynamic-programming]
lists: [core-75, ascend-150]
companies: [amazon, google, microsoft, bloomberg]
order: 8
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Greedy (largest coin first) is wrong: with coins `[1, 3, 4]` and amount 6 it uses `4 + 1 + 1` instead of `3 + 3`."
  - "Think about the last coin in an optimal pile for amount `a`. If it is coin `c`, the rest is an optimal pile for `a - c`."
  - "`fewest[a] = 1 + min(fewest[a - c] for each coin c ≤ a)`, with `fewest[0] = 0` and infinity meaning unreachable."
signatures:
  python:
    name: coin_change
    starter: |
      def coin_change(coins: list[int], amount: int) -> int:
          pass
  javascript:
    name: coin_change
    starter: |
      function coin_change(coins, amount) {
      }
tests:
  - args: [[1, 3, 4], 6]
    expected: 2
    label: greedy would use three coins
  - args: [[2], 3]
    expected: -1
    label: unreachable
  - args: [[7], 0]
    expected: 0
    label: zero amount needs zero coins
  - args: [[5, 10, 25], 30]
    expected: 2
  - args: [[2, 5, 10, 1], 27]
    expected: 4
    label: unsorted coins
  - args: [[9, 6, 5, 1], 11]
    expected: 2
  - args: [[6, 10, 15], 13]
    expected: -1
  - args: [[4, 6], 7]
    expected: -1
    hidden: true
  - args: [[7, 11, 13], 10000]
    expected: 770
    hidden: true
  - args: [[3, 7, 405, 436], 8839]
    expected: 25
    hidden: true
  - args: [[25, 10, 1], 30]
    expected: 3
    hidden: true
    label: greedy would use six coins
time_limit_ms: 4000
---
You have an unlimited supply of coins of each denomination in `coins`. Return the fewest coins whose values add up to exactly `amount`. If no combination of coins adds up to `amount`, return `-1`.

### Examples

| Input | Output | Why |
|---|---|---|
| `coins = [1, 3, 4]`, `amount = 6` | `2` | `3 + 3`. Taking the largest coin first gives `4 + 1 + 1` |
| `coins = [2]`, `amount = 3` | `-1` | Only even totals are reachable |
| `coins = [7]`, `amount = 0` | `0` | The empty pile already sums to 0 |

### Constraints

- `1 ≤ len(coins) ≤ 12`
- `1 ≤ coins[i] ≤ 2³¹ − 1`, all distinct
- `0 ≤ amount ≤ 10⁴`

### Follow-up

The interviewer asks: "Return the actual coins, not just the count." Then: "For which coin systems is the greedy algorithm correct, and how would you check a given system?"

## Solution

### The naive approach

Try every first coin and recurse on the remainder: `fewest(a) = 1 + min(fewest(a - c))`. The branching factor is the number of coins and the depth is up to `amount`, so the call tree is exponential. Yet there are only `amount + 1` distinct arguments; for amount 6 with `[1, 3, 4]`, `fewest(2)` is reached by `6 → 2` (coin 4), `6 → 3 → 2` (coins 3 then 1), `6 → 5 → 2` (coins 1 then 3) and more.

Greedy (always take the largest coin that fits) is fast and wrong: it is only optimal for *canonical* coin systems such as `[1, 5, 10, 25]`. The test `[25, 10, 1]`, amount 30, makes greedy use `25 + 1 + 1 + 1 + 1 + 1` (six coins) instead of `10 + 10 + 10`.

### The insight

In any optimal pile for amount `a`, remove one coin `c`. What is left must be an optimal pile for `a - c`; if it were not, you could swap in a smaller pile and beat the optimum. That is optimal substructure, and it means `fewest(a)` only needs `fewest` of smaller amounts.

### The DP

- **State.** `fewest[a]` is the minimum number of coins summing to exactly `a`, or infinity if `a` cannot be made.
- **Transition.** `fewest[a] = 1 + min(fewest[a - c] for c in coins if c ≤ a)`.
- **Base case.** `fewest[0] = 0`. Every other entry starts at infinity, the sentinel for "unreachable", so `min` ignores it and `1 + ∞` stays `∞`.
- **Iteration order.** Increasing `a`, since every dependency `a - c` is smaller.
- **Answer.** `fewest[amount]`, or `-1` if it is still infinity.

### Worked table for `coins = [1, 3, 4]`, `amount = 6`

| `a` | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| via coin 1: `fewest[a-1] + 1` | – | 1 | 2 | 3 | 2 | 2 | 3 |
| via coin 3: `fewest[a-3] + 1` | – | – | – | 1 | 2 | 3 | **2** |
| via coin 4: `fewest[a-4] + 1` | – | – | – | – | 1 | 2 | 3 |
| `fewest[a]` | 0 | 1 | 2 | 1 | 1 | 2 | **2** |

At `a = 6`, going through coin 4 lands on `fewest[2] = 2` (two 1s), while going through coin 3 lands on `fewest[3] = 1`. The table sees both and keeps the better. Greedy only ever looks at the coin-4 row.

### Reference solution

```python
def coin_change(coins: list[int], amount: int) -> int:
    INF = amount + 1                       # more coins than any real answer can use
    fewest = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and fewest[a - c] + 1 < fewest[a]:
                fewest[a] = fewest[a - c] + 1
    return fewest[amount] if fewest[amount] != INF else -1
```

Time `O(amount × k)` for `k` coins: `10⁴ × 12` is about `1.2 × 10⁵` steps. Space `O(amount)`. Using `amount + 1` as infinity keeps everything an integer: no real answer can exceed `amount` coins because every coin is at least 1.

### Space

The natural two-dimensional state, `fewest[i][a]` over the first `i` coin types, has already been collapsed to one row here, because coins may be reused and the same row can be read while it is being written (the unbounded-knapsack trick). Going below `O(amount)` is possible but rarely useful: `fewest[a]` reads at most `max(coins)` positions back, so a circular buffer of size `max(coins) + 1` works when the amount is huge and the coins are small.

```viz
{"type": "dp", "algorithm": "coin-change", "coins": [1, 3, 4], "amount": 6, "title": "Coin Change on the worked example", "caption": "Each cell tries every coin as the last one and keeps the smallest count."}
```

### Common mistakes

- Using greedy, or sorting coins and breaking at the first success.
- Initialising unreachable amounts to `0` or `-1` and then taking `min`, which makes unreachable amounts look cheap.
- Using `float('inf')` and then returning `fewest[amount]` without converting: the answer for an unreachable amount must be `-1`, not `inf`.
- Recursing top-down with `lru_cache` on amounts near `10⁴`: correct, but the recursion depth reaches `amount` when coin 1 exists, which exceeds Python's default limit of 1000.

### How to discuss it

Kill greedy with a two-line counterexample first. Then give the state ("fewest coins for exactly `a`"), the recurrence from the last coin, the base case and the sentinel. Mention that this is a shortest-path problem in disguise: amounts are nodes, each coin is an edge of weight 1, and BFS from 0 finds the answer too, stopping as soon as it reaches `amount`, which can be faster when the answer is small.

For the reconstruction follow-up, store `last_coin[a]` whenever `fewest[a]` improves, then walk `a → a - last_coin[a]` back to 0. For the canonical-system follow-up: greedy is optimal for many real currencies but not in general, and whether it is optimal for a given system can be decided in polynomial time; a practical check is to run both greedy and this DP for every amount up to the sum of the two largest coins, since any counterexample to greedy appears below that bound.
