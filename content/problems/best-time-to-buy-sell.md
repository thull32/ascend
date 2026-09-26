---
slug: best-time-to-buy-sell
title: Best Time to Buy and Sell Stock
difficulty: easy
patterns: [sliding-window]
lists: [core-75, ascend-150]
companies: [amazon, meta, google, bloomberg]
order: 1
lesson: interview-patterns/array-patterns/sliding-window
hints:
  - For any sell day, the best buy day is the cheapest day before it. What single number do you need to carry as you scan?
  - Keep the minimum price seen so far. At each day, the profit if you sold today is `price - min_so_far`.
  - The window here is "from the cheapest day so far to today"; its left edge jumps forward whenever a new minimum appears.
signatures:
  python:
    name: max_profit
    starter: |
      def max_profit(prices: list[int]) -> int:
          pass
  javascript:
    name: max_profit
    starter: |
      function max_profit(prices) {
      }
tests:
  - args: [[7, 1, 5, 3, 6, 4]]
    expected: 5
  - args: [[7, 6, 4, 3, 1]]
    expected: 0
    label: prices only fall
  - args: [[1, 2]]
    expected: 1
  - args: [[5]]
    expected: 0
    label: single day
  - args: [[]]
    expected: 0
    label: no prices
  - args: [[1, 100, 1, 50]]
    expected: 99
  - args: [[2, 4, 1, 7]]
    expected: 6
    hidden: true
    label: best buy is after an earlier peak
  - args: [[3, 3, 3]]
    expected: 0
    hidden: true
time_limit_ms: 4000
---
You are given an array `prices` where `prices[i]` is the price of a stock on day `i`. You may buy on one day and sell on a later day, at most once. Return the maximum profit you can make. If no profitable trade exists, return `0`.

### Examples

| Input | Output | Why |
|---|---|---|
| `[7, 1, 5, 3, 6, 4]` | `5` | Buy on day 1 at `1`, sell on day 4 at `6` |
| `[7, 6, 4, 3, 1]` | `0` | Every later day is cheaper; do nothing |
| `[2, 4, 1, 7]` | `6` | Buy at `1`, sell at `7`; the earlier `2 → 4` is worse |

### Constraints

- `0 ≤ len(prices) ≤ 10⁵`
- `0 ≤ prices[i] ≤ 10⁴`

### Follow-up

The interviewer asks: "Allow as many trades as you like, but you must sell before buying again." Then: "Allow at most k trades."

## Solution

### The naive approach

Try every buy day `i` and every later sell day `j`, take the maximum of `prices[j] - prices[i]`: `O(n²)`. For `n = 10⁵` that is five billion pairs.

### The insight

Fix the sell day. The best buy day for it is simply the cheapest day before it. So if you scan left to right carrying the minimum price seen so far, each day's best possible profit is one subtraction, and the answer is the maximum over days. The "window" is implicit: it stretches from the running minimum to the current day, and its left edge jumps forward whenever a cheaper day appears. That is why this sits in the sliding-window family even though there is no explicit window size.

### The optimal approach

```python
def max_profit(prices: list[int]) -> int:
    best = 0
    lowest = float("inf")
    for p in prices:
        if p < lowest:
            lowest = p
        elif p - lowest > best:
            best = p - lowest
    return best
```

Trace `[7, 1, 5, 3, 6, 4]`. `7`: new low. `1`: new low. `5`: profit 4, best 4. `3`: profit 2. `6`: profit 5, best 5. `4`: profit 3. Answer 5.

Time `O(n)`, space `O(1)`.

The `elif` is deliberate: on the day a new minimum appears, selling that same day yields zero, so there is nothing to compare. It also documents the constraint that you cannot buy and sell on the same day.

### Common mistakes

- Taking `max(prices) - min(prices)`, which ignores that the sale must come *after* the purchase: `[7, 1]` would return 6.
- Initialising `lowest` to `prices[0]` without guarding against an empty array.
- Returning a negative number when every trade loses; the problem says return `0`, and starting `best` at `0` enforces it.
- Trying to track the buy *day* and sell *day*; the problem asks for the profit, and tracking indices just adds ways to be wrong.

### How to discuss it

State the `O(n²)`, then say "for each sell day the best buy is the minimum before it, so I carry the running minimum". Write it, trace the example, and point out that the running minimum is the left edge of a window that only moves forward. For unlimited trades: the answer is the sum of every positive day-to-day difference, because any profitable multi-day climb decomposes into consecutive single-day steps; `O(n)`. For at most `k` trades: that is a dynamic programme over `(day, trades used, holding or not)`, `O(nk)` time with `O(k)` space after rolling the day dimension; and when `k ≥ n / 2` it collapses back to the unlimited case, which is the observation that stops the DP from blowing up on large `k`.
