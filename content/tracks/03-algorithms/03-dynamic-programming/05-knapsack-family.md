---
slug: knapsack-family
title: "The knapsack family: 0/1, unbounded, subset sum and partition"
description: Derive the 0/1 knapsack table, collapse it to one row, and learn the sweep-direction rule that turns the same line of code into unbounded knapsack, subset sum, partition and target sum.
minutes: 50
difficulty: hard
tags: [dynamic-programming, knapsack, subset-sum, partition, unbounded-knapsack, pseudo-polynomial]
problems: [partition-equal-subset, target-sum, coin-change-ii]
---
You have a bag that holds 7 kg and four items: 1 kg worth 1, 3 kg worth 4, 4 kg worth 5, 5 kg worth 7. Which items maximise value? Greedy by value takes the 5 kg item (7), then the 1 kg item (1), for 8 with 1 kg spare. Greedy by value-per-kilogram ranks them 1.4, 1.33, 1.25, 1.0, takes the 5 kg and the 1 kg again, for 8. The optimum is the 3 kg and 4 kg items, for 9. Greedy fails because items are indivisible: a partially filled bag cannot be topped up with a fraction of the next-best item. (Allow fractions and greedy by density is optimal; that is the exchange argument in [the greedy lesson](/learn/algorithms/greedy/greedy-and-exchange-arguments).)

0/1 knapsack is the template for every "choose a subset under a capacity constraint" problem: subset sum, partition into equal halves, target sum with plus and minus signs, and the unbounded and bounded variants where items can repeat. They are all one recurrence with the sweep direction flipped or the combine operator swapped, and this lesson makes that explicit.

## 0/1 knapsack: state and transition

Items `0..n-1` with weights `w[i]` and values `v[i]`; capacity `W`. Each item is taken at most once.

**State.** `dp[i][c]` = the maximum value achievable using only items `0..i-1` (the first `i` items) with total weight at most `c`.

**Transition.** Consider item `i-1`, the last one in the prefix. Either it is not in the optimal subset, in which case the best is `dp[i-1][c]`; or it is, in which case it consumes `w[i-1]` of the capacity and the rest of the subset is the best from the first `i-1` items within `c - w[i-1]`:

$$dp[i][c] = \max\big(dp[i-1][c],\; dp[i-1][c - w_{i-1}] + v_{i-1}\big) \quad (\text{second term only if } w_{i-1} \le c)$$

**Order and base cases.** `dp[0][c] = 0` (no items, no value). Increasing `i`; within a row, any order, since the transition reads only row `i-1`.

**Answer.** `dp[n][W]`.

Trace with the four items above and `W = 7`:

| items ↓ / capacity → | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| none | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| {1kg:1} | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| +{3kg:4} | 0 | 1 | 1 | 4 | 5 | 5 | 5 | 5 |
| +{4kg:5} | 0 | 1 | 1 | 4 | 5 | 6 | 6 | 9 |
| +{5kg:7} | 0 | 1 | 1 | 4 | 5 | 7 | 8 | **9** |

Check `dp[3][7]` (first three items, capacity 7): skip the 4 kg item gives `dp[2][7] = 5`; take it gives `dp[2][3] + 5 = 4 + 5 = 9`. So 9. Check `dp[4][6]`: skip gives `dp[3][6] = 6`; take the 5 kg gives `dp[3][1] + 7 = 1 + 7 = 8`. So 8. And `dp[4][7]`: skip 9, take `dp[3][2] + 7 = 8`; 9 wins, so the 5 kg item is not in the optimal bag.

```viz
{"type": "dp", "algorithm": "knapsack-01", "weights": [1, 3, 4, 5], "values": [1, 4, 5, 7], "capacity": 7, "title": "0/1 knapsack: dp[i][c] = max(skip item, take item + dp[i-1][c - w])", "caption": "Each row adds one item. The 'take' arrow always points to the previous row, which is what makes each item count at most once."}
```

```python
def knapsack_01(weights: list[int], values: list[int], W: int) -> int:
    n = len(weights)
    dp = [[0] * (W + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        w, v = weights[i - 1], values[i - 1]
        for c in range(W + 1):
            dp[i][c] = dp[i - 1][c]
            if w <= c:
                dp[i][c] = max(dp[i][c], dp[i - 1][c - w] + v)
    return dp[n][W]
```

Time `O(nW)`, space `O(nW)`. The running time depends on the *value* of `W`, not its bit length, so this is pseudo-polynomial: fine for `W ≤ 10⁵`, hopeless for `W = 10¹²`. The general 0/1 knapsack is NP-hard, and this DP does not contradict that; it is exponential in the size of the input when `W` is written in binary.

## Collapsing to one row: the sweep-direction rule

The transition reads only row `i-1`, so one array suffices, if you are careful about *when* each cell is overwritten. Let `dp[c]` be the current row. To compute the new `dp[c]` you need the old `dp[c]` (skip) and the old `dp[c - w]` (take). If you sweep `c` upward, `dp[c - w]` has already been overwritten with the *new* row's value, which already includes item `i-1`; you would be taking the item twice. Sweep `c` **downward** and `dp[c - w]` is still the old row when you read it:

```python
def knapsack_01(weights, values, W):
    dp = [0] * (W + 1)
    for w, v in zip(weights, values):
        for c in range(W, w - 1, -1):        # downward: each item used at most once
            dp[c] = max(dp[c], dp[c - w] + v)
    return dp[W]
```

```javascript
function knapsack01(weights, values, W) {
  const dp = new Array(W + 1).fill(0);
  for (let i = 0; i < weights.length; i++) {
    for (let c = W; c >= weights[i]; c--) {      // downward
      dp[c] = Math.max(dp[c], dp[c - weights[i]] + values[i]);
    }
  }
  return dp[W];
}
```

Trace the last item (5 kg, value 7) on the row `[0, 1, 1, 4, 5, 6, 6, 9]`: `c = 7`: `max(9, dp[2] + 7 = 8) = 9`; `c = 6`: `max(6, dp[1] + 7 = 8) = 8`; `c = 5`: `max(6, dp[0] + 7 = 7) = 7`. Row becomes `[0, 1, 1, 4, 5, 7, 8, 9]`, matching the table.

Now flip the sweep to **upward** and something remarkable happens: `dp[c - w]` is the *new* row, which may already include this item, so the item can be taken again and again. That is exactly the **unbounded knapsack** (each item available in unlimited quantity):

```python
def knapsack_unbounded(weights, values, W):
    dp = [0] * (W + 1)
    for w, v in zip(weights, values):
        for c in range(w, W + 1):             # upward: item may repeat
            dp[c] = max(dp[c], dp[c - w] + v)
    return dp[W]
```

The same three lines with the loop reversed. This is the single most useful thing to know about knapsack: **downward sweep = each item at most once; upward sweep = unlimited copies.** The [coin change lesson](/learn/algorithms/dynamic-programming/one-dimensional-dp) was unbounded knapsack all along: coins are items with weight equal to their value, minimising count instead of maximising value, swept upward.

## Subset sum and partition: knapsack with booleans

Subset sum asks whether some subset of `nums` sums to exactly `target`. It is 0/1 knapsack where every item's value is irrelevant and the question is feasibility.

**State.** `dp[c]` = true if some subset of the items seen so far sums to exactly `c`.

**Transition.** `dp[c] = dp[c] or dp[c - x]` for each item `x`, swept downward so each item is used once.

**Base.** `dp[0] = true` (the empty subset). **Answer.** `dp[target]`.

Partition equal subset sum ([the practice problem](/practice/partition-equal-subset)) asks whether `nums` splits into two halves of equal sum. If the total `S` is odd, no; otherwise it is subset sum with `target = S / 2`.

Trace `nums = [1, 5, 11, 5]`, `S = 22`, `target = 11`. Reachable sums after each item (true cells):

| after item | reachable sums |
|---|---|
| start | {0} |
| 1 | {0, 1} |
| 5 | {0, 1, 5, 6} |
| 11 | {0, 1, 5, 6, 11, 12, 16, 17} |
| 5 | {0, 1, 5, 6, 10, 11, 12, 16, 17, 21, 22} |

`dp[11]` is true (after the third item, via the 11 alone, and after the fourth also via 1 + 5 + 5). The array has `target + 1` cells; in Python a `bytearray` or a big integer used as a bitset (`bits |= bits << x`) is dramatically faster than a list of booleans, and that bitset trick is worth knowing for `target` in the millions.

```python
def can_partition(nums: list[int]) -> bool:
    total = sum(nums)
    if total % 2:
        return False
    target = total // 2
    dp = [False] * (target + 1)
    dp[0] = True
    for x in nums:
        for c in range(target, x - 1, -1):
            if dp[c - x]:
                dp[c] = True
    return dp[target]
```

## Target sum: a transformation, not a new DP

Assign `+` or `-` to each number so the expression equals `T`. Count the assignments. This looks like a different problem until you split the numbers into the positive set `P` and the negative set `N`: `sum(P) - sum(N) = T` and `sum(P) + sum(N) = S`, so `sum(P) = (S + T) / 2`. The question becomes "how many subsets sum to `(S + T) / 2`", which is subset sum with counting (`+`) instead of `or`:

```python
def find_target_sum_ways(nums, T):
    S = sum(nums)
    if (S + T) % 2 or abs(T) > S:
        return 0
    target = (S + T) // 2
    dp = [0] * (target + 1)
    dp[0] = 1
    for x in nums:
        for c in range(target, x - 1, -1):
            dp[c] += dp[c - x]
    return dp[target]
```

The lesson here is not the code; it is that many problems that *feel* new are knapsack after an algebraic rewrite. The tell is "choose a subset" plus a numeric constraint.

## Bounded knapsack: at most k copies

Each item `i` has a count `k[i]`. The naive approach expands item `i` into `k[i]` copies and runs 0/1, costing `O(W · Σk)`. The standard trick is **binary splitting**: split `k` copies into bundles of size 1, 2, 4, …, and a remainder, so every count from 0 to `k` is expressible as a sum of bundles. Item with `k = 13` becomes bundles `{1, 2, 4, 6}`; any count 0–13 is a subset sum of those. Then run 0/1 on `O(log k)` bundles per item, `O(W · Σ log k)` total. A monotonic-deque optimisation gets to `O(nW)` but is rarely expected in interviews; naming binary splitting is.

## The family in one table

| Variant | Copies per item | Sweep | Combine | Base | Answer |
|---|---|---|---|---|---|
| 0/1 knapsack | ≤ 1 | downward | `max(skip, take + v)` | 0 | `dp[W]` |
| Unbounded knapsack | unlimited | upward | `max` | 0 | `dp[W]` |
| Coin change (min coins) | unlimited | upward | `min(skip, take + 1)` | `dp[0]=0`, else ∞ | `dp[amount]` |
| Coin change (count combos) | unlimited | upward | `+` | `dp[0]=1` | `dp[amount]` |
| Subset sum | ≤ 1 | downward | `or` | `dp[0]=true` | `dp[target]` |
| Partition | ≤ 1 | downward | `or` | `dp[0]=true` | `dp[S/2]` |
| Target sum (count) | ≤ 1 | downward | `+` | `dp[0]=1` | `dp[(S+T)/2]` |
| Bounded knapsack | ≤ k | downward on binary bundles | `max` | 0 | `dp[W]` |

Every row is the same loop: `for item: for capacity (in the right direction): dp[c] = combine(dp[c], dp[c - w] ⊕ item)`. When you meet a new capacity-constrained subset problem in an interview, fill in this table's columns for it out loud before writing code: how many copies, therefore which sweep; what the combine operator is; what `dp[0]` must be for the transition to produce the first real cell.

## Knapsack with "exactly" instead of "at most"

Two subtly different questions: "best value with weight **at most** `W`" (knapsack) and "best value with weight **exactly** `W`" (needed when the capacity must be filled, or when counting subsets of an exact sum). The transition is identical; the base cases differ. For at-most, `dp[c] = 0` for all `c` initially: an empty bag of any capacity is worth 0. For exactly, `dp[0] = 0` and every other `dp[c] = -∞`: you cannot fill a positive capacity exactly with nothing, and the `-∞` propagates so that only exactly-fillable capacities become finite. Interviewers use this distinction to check whether you understand *why* the base cases are what they are rather than copying them.

## Exercises

```exercise
id: knapsack-01
title: 0/1 knapsack
prompt: |
  `weights[i]` and `values[i]` describe item `i` (same length, may be
  empty). Return the maximum total value of a subset of items whose total
  weight is at most `capacity`. Each item may be used at most once.

  Use the one-row form with a downward capacity sweep: O(n · capacity)
  time, O(capacity) space.
languages: [python, javascript]
entry: knapsack_01
starter:
  python: |
    def knapsack_01(weights, values, capacity):
        # dp[c] = best value with total weight <= c, using items seen so far
        return 0
  javascript: |
    function knapsack_01(weights, values, capacity) {
      // dp[c] = best value with total weight <= c, using items seen so far
      return 0;
    }
tests:
  - args: [[1, 3, 4, 5], [1, 4, 5, 7], 7]
    expected: 9
  - args: [[2, 3], [3, 4], 1]
    expected: 0
    label: nothing fits
  - args: [[], [], 10]
    expected: 0
    label: no items
  - args: [[5], [10], 5]
    expected: 10
    label: exact fit
  - args: [[1, 2, 3], [6, 10, 12], 5]
    expected: 22
  - args: [[10, 20, 30], [60, 100, 120], 50]
    expected: 220
    hidden: true
  - args: [[4, 5, 6], [10, 11, 12], 10]
    expected: 22
    hidden: true
hints:
  - "for each item: for c from capacity down to weight: dp[c] = max(dp[c], dp[c - weight] + value)."
  - "If you sweep upward you will get 220 + extra on the third hidden test because items get reused; the downward sweep is what enforces at-most-once."
```

```exercise
id: can-partition
title: Partition into two equal-sum subsets
prompt: |
  Return `true` if the positive integers in `nums` can be split into two
  groups with equal sums, otherwise `false`. `nums` has at least one
  element.

  Reduce to subset sum on `target = sum / 2` and use a one-row boolean
  table with a downward sweep.
languages: [python, javascript]
entry: can_partition
starter:
  python: |
    def can_partition(nums):
        # odd total -> False; otherwise subset sum to total // 2
        return False
  javascript: |
    function can_partition(nums) {
      // odd total -> false; otherwise subset sum to total / 2
      return false;
    }
tests:
  - args: [[1, 5, 11, 5]]
    expected: true
  - args: [[1, 2, 3, 5]]
    expected: false
  - args: [[1]]
    expected: false
    label: single element
  - args: [[2, 2]]
    expected: true
  - args: [[1, 1, 1, 1, 1, 1]]
    expected: true
  - args: [[3, 3, 3, 4, 5]]
    expected: true
    hidden: true
  - args: [[1, 2, 5]]
    expected: false
    hidden: true
hints:
  - "dp[0] = True; for each x: for c from target down to x: dp[c] = dp[c] or dp[c - x]."
  - "An odd total can never split evenly; return early."
```

## Senior signals

- You derive the 0/1 transition from **"is the last item in or out"** and can point to the `dp[i-1]` on the take branch as the reason each item counts once.
- You state the **sweep-direction rule** (downward = at most once, upward = unlimited) and use it to turn 0/1 into unbounded in one line.
- You call the running time **pseudo-polynomial** and explain in one sentence why this is compatible with knapsack being NP-hard.
- You recognise **subset sum, partition and target sum as knapsack in disguise** and do the algebraic rewrite for target sum before coding.
- You distinguish **"at most W" from "exactly W"** by their base cases (`0` everywhere versus `0` at zero and `-∞` elsewhere).
- You know **binary splitting** for bounded knapsack and the bitset trick for subset sum on large targets.

## Check yourself

```quiz
- q: >-
    In the one-row 0/1 knapsack, you accidentally sweep capacity upward. On weights [2], values [3], capacity 6, what do you get?
  options: ["3, the correct answer", "9, because the single item is taken three times", "0", "6"]
  answer: 1
  explanation: >-
    Upward sweep reads dp[c-2] after it has already been updated with this item, so dp[2]=3, dp[4]=6, dp[6]=9. That is the unbounded answer. Downward sweep reads the previous row's values and yields 3.
- q: >-
    Why does knapsack have a polynomial-looking O(nW) algorithm even though it is NP-hard?
  options: ["It is not actually NP-hard", "O(nW) is polynomial in the numeric value of W but exponential in the number of bits used to write W; the input size is measured in bits", "Because the DP only works for small n", "Because NP-hard problems can be solved in polynomial time with DP"]
  answer: 1
  explanation: >-
    A capacity of 10¹² is written in 40 bits but produces 10¹² table cells. This is the definition of pseudo-polynomial. The DP is exact and useful whenever W is small in absolute terms.
- q: >-
    Target sum asks for the number of ± assignments reaching T. Which reduction is correct?
  options: ["Count subsets with sum T", "Count subsets with sum (S + T) / 2, where S is the total; if S + T is odd or |T| > S the answer is 0", "Count subsets with sum S − T", "Run unbounded knapsack with target T"]
  answer: 1
  explanation: >-
    Let P be the positives: sum(P) − (S − sum(P)) = T gives sum(P) = (S + T)/2. Each such subset corresponds to exactly one sign assignment. Items are used once, so it is 0/1 (downward sweep), not unbounded.
- q: >-
    You need the best value with weight exactly W, not at most W. What changes?
  options: ["The sweep direction", "The combine operator", "The base cases: dp[0] = 0 and all other dp[c] = −∞, so only exactly-fillable capacities become finite", "Nothing; the answers coincide"]
  answer: 2
  explanation: >-
    With all-zero initialisation, an unfilled capacity is worth 0, which is the at-most semantics. With −∞ the transition can only produce a finite value at c by adding an item to an exactly-fillable c − w. Sweep and combine are unchanged.
- q: >-
    Bounded knapsack has an item with 1000 copies. The fastest reasonable approach among these is:
  options: ["Expand into 1000 identical 0/1 items", "Binary-split into bundles of 1, 2, 4, …, 512 (and a remainder) and run 0/1 on the ~10 bundles", "Use unbounded knapsack and hope the optimum uses at most 1000", "Run 0/1 knapsack 1000 times"]
  answer: 1
  explanation: >-
    Every count from 0 to 1000 is a sum of a subset of the bundles, so 0/1 on the bundles is exact with O(log k) items instead of k. Unbounded ignores the limit and can overshoot. Expansion is correct but 100× slower.
```
