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

0/1 knapsack is the template for every "choose a subset under a capacity constraint" problem: subset sum, partition into equal halves, target sum with plus and minus signs, and the unbounded and bounded variants where items can repeat. They are all one recurrence with the sweep direction flipped or the combine operator swapped, and this lesson makes that explicit, including what the wrong sweep computes and why.

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

Four cells, worked:

| cell | skip | take | value |
|---|---|---|---|
| `dp[2][4]` (items {1, 3 kg}, cap 4) | `dp[1][4] = 1` | `dp[1][4−3] + 4 = 1 + 4 = 5` | 5 |
| `dp[3][5]` (+4 kg, cap 5) | `dp[2][5] = 5` | `dp[2][1] + 5 = 1 + 5 = 6` | 6 |
| `dp[3][7]` (+4 kg, cap 7) | `dp[2][7] = 5` | `dp[2][3] + 5 = 4 + 5 = 9` | 9 |
| `dp[4][6]` (+5 kg, cap 6) | `dp[3][6] = 6` | `dp[3][1] + 7 = 1 + 7 = 8` | 8 |

And `dp[4][7]`: skip 9, take `dp[3][2] + 7 = 8`; 9 wins, so the 5 kg item is not in the optimal bag.

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

Time `O(nW)`, space `O(nW)`.

### Reconstructing the chosen items

Walk back from `dp[n][W]`. At row `i`, if `dp[i][c] == dp[i-1][c]` the item was not needed; otherwise it was taken, so subtract its weight and continue in row `i-1`:

| at | compare | decision | new `c` |
|---|---|---|---|
| `dp[4][7] = 9` | `dp[3][7] = 9`, equal | 5 kg not taken | 7 |
| `dp[3][7] = 9` | `dp[2][7] = 5`, differs | 4 kg taken | 3 |
| `dp[2][3] = 4` | `dp[1][3] = 1`, differs | 3 kg taken | 0 |
| `dp[1][0] = 0` | `dp[0][0] = 0`, equal | 1 kg not taken | 0 |

Items {3 kg, 4 kg}, weight 7, value 9. The walk needs the full `(n+1) × (W+1)` table, which the next section throws away; when the items are required, either keep the table (`n · W` cells) or keep one bit per cell recording "taken" (`n · W` bits, 1.25 MB for `n = 100`, `W = 10⁵`) alongside a one-row value array.

## Why the recurrence is correct

**Optimal substructure.** Take an optimal subset `S` for the first `i` items and capacity `c`. If item `i-1` is in `S`, then `S` minus that item is a subset of the first `i-1` items with weight at most `c − w[i-1]`, and it must be an optimal such subset: if a better one existed, adding item `i-1` back would beat `S`. If item `i-1` is not in `S`, then `S` is a subset of the first `i-1` items within `c` and must be optimal for that. The two cases are exhaustive, so the max over them is the optimum.

**State sufficiency.** The future of a partial packing depends only on which items remain (an index) and how much capacity is left (a number), never on which items were chosen so far. That is why `(i, c)` is enough and why two different packings arriving at the same `(i, c)` are the same subproblem.

**Why the running time is `O(nW)` and what that means.** `n · (W+1)` states, constant work each. The running time depends on the *value* of `W`, not its bit length, so this is **pseudo-polynomial**: fine for `W ≤ 10⁵`, hopeless for `W = 10¹²`. The general 0/1 knapsack is NP-hard, and this DP does not contradict that; a capacity of `10¹²` is written in 40 bits but produces `10¹²` cells, so the algorithm is exponential in the size of the input when `W` is written in binary.

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

**What the upward sweep computes.** Run the first item (1 kg, value 1) upward from `c = 1`: `dp[1] = max(0, dp[0] + 1) = 1`; `dp[2] = max(0, dp[1] + 1) = 2`, but `dp[1]` is already the *new* row, so this packs the 1 kg item twice; `dp[3] = 3`, and so on up to `dp[7] = 7`. After all four items the row reads `[0, 1, 2, 4, 5, 7, 8, 9]` instead of `[0, 1, 1, 4, 5, 7, 8, 9]`: `dp[2] = 2` claims two copies of a single item. On this input only one cell differs, which is why the bug survives small tests.

### Upward on purpose: unbounded knapsack

Now use that behaviour on purpose. With the sweep **upward**, `dp[c - w]` is the *new* row, which may already include this item, so the item can be taken again and again. That is exactly the **unbounded knapsack** (each item available in unlimited quantity):

```python
def knapsack_unbounded(weights, values, W):
    dp = [0] * (W + 1)
    for w, v in zip(weights, values):
        for c in range(w, W + 1):             # upward: item may repeat
            dp[c] = max(dp[c], dp[c - w] + v)
    return dp[W]
```

Trace weights `[2, 3]`, values `[3, 4]`, `W = 6`. Item 2 kg upward: `[0, 0, 3, 3, 6, 6, 9]`, three copies at capacity 6. Item 3 kg: `dp[3] = max(3, dp[0] + 4) = 4`, `dp[5] = max(6, dp[2] + 4) = 7`, `dp[6] = max(9, dp[3] + 4) = 9`: final `[0, 0, 3, 4, 6, 7, 9]`, answer 9. The 0/1 version of the same input gives `[0, 0, 3, 4, 4, 7, 7]`, answer 7 (one of each).

The same three lines with the loop reversed. This is the single most useful thing to know about knapsack: **downward sweep = each item at most once; upward sweep = unlimited copies.** The [coin change lesson](/learn/algorithms/dynamic-programming/one-dimensional-dp) was unbounded knapsack all along: coins are items with weight equal to their value, minimising count instead of maximising value, swept upward.

```viz
{"type": "dp", "algorithm": "coin-change", "coins": [1, 3, 4], "amount": 6, "title": "Unbounded knapsack in disguise: fewest coins, swept upward", "caption": "Each amount reads smaller amounts already updated for the same coin, so a coin may repeat. The answer for 6 is two coins (3 + 3), not the greedy 4 + 1 + 1."}
```

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

`dp[11]` is true (after the third item, via the 11 alone, and after the fourth also via 1 + 5 + 5).

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

### The bitset form

A row of booleans is a row of bits, and "`dp[c] |= dp[c − x]` for every `c`, downward" is one operation on the whole row: `reach |= reach << x`. The shift reads the *old* bits (the right-hand side is evaluated before the assignment), so the at-most-once semantics come for free; there is no sweep to get wrong. Same trace, as integers (bit `c` set means sum `c` is reachable):

| item | `reach` after the shift-or | set bits |
|---|---|---|
| start | `1` | {0} |
| 1 | `0b11` | {0, 1} |
| 5 | `0b1100011` | {0, 1, 5, 6} |
| 11 | `0b110001100001100011` | {0, 1, 5, 6, 11, 12, 16, 17} |
| 5 | `0b11000110001110001100011` | {0, 1, 5, 6, 10, 11, 12, 16, 17, 21, 22} |

Python's arbitrary-precision integers make this a two-line solution, and the machine does 30 bits per digit operation (CPython stores big integers in 30-bit digits) instead of one Python-level boolean per step. Measured here on CPython 3.14 with 100 items and `target = 10⁵`: the list-of-booleans loop took 0.39 s, the bitset 0.33 ms, about 1,200× faster, with identical reachable sets. Memory: a list of 10⁶ booleans is 8 MB of pointers; the same row as an integer is 133 KB. When `target` reaches the millions this is the difference between a solution and a timeout, and it generalises to any boolean DP whose transition is a shift and an OR.

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

Trace `nums = [1, 1, 1, 1, 1]`, `T = 3`: `S = 5`, `target = 4`. After each item the row is `[1, 1, 0, 0, 0]`, `[1, 2, 1, 0, 0]`, `[1, 3, 3, 1, 0]`, `[1, 4, 6, 4, 1]`, `[1, 5, 10, 10, 5]`: the rows of Pascal's triangle, because with all-ones items "subsets summing to `c`" is "choose `c` of them", and the answer `dp[4] = C(5, 4) = 5`. The counting variant is where fixed-width integers overflow: the number of ways to make £100 (10,000 pence) from the eight UK coin denominations is `1,133,873,304,647,601`, past 2³¹ though within 2⁶³; larger amounts or more denominations pass 2⁶³ too, which is why counting problems ask for the answer modulo 10⁹ + 7.

The lesson here is not the code; it is that many problems that *feel* new are knapsack after an algebraic rewrite. The tell is "choose a subset" plus a numeric constraint.

## Bounded knapsack: at most k copies

Each item `i` has a count `k[i]`. The naive approach expands item `i` into `k[i]` copies and runs 0/1, costing `O(W · Σk)`. The standard trick is **binary splitting**: split `k` copies into bundles of size 1, 2, 4, …, and a remainder, so every count from 0 to `k` is expressible as a sum of bundles. An item with `k = 13` becomes bundles `{1, 2, 4, 6}`; any count 0–13 is a subset sum of those (`11 = 1 + 4 + 6`, `13 = 1 + 2 + 4 + 6`), and no subset exceeds 13. An item with `k = 1000` becomes ten bundles, `{1, 2, 4, 8, 16, 32, 64, 128, 256, 489}`. Then run 0/1 on `O(log k)` bundles per item, `O(W · Σ log k)` total. A monotonic-deque optimisation gets to `O(nW)` but is rarely expected in interviews; naming binary splitting is.

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

One more ordering rule hides in the counting rows. With items outer and capacity inner, each multiset is counted once, built in the order the items appear. Swap the loops, capacity outer and coins inner, and the same code counts *ordered* sums: for amount 3 with coins `{1, 2}` the combinations are `{1, 1, 1}` and `{1, 2}`, two of them, while the ordered sums are `1+1+1`, `1+2` and `2+1`, three. Combinations need the coins loop outside; counting ordered sums, the climbing-stairs kind of count, needs it inside.

## Knapsack with "exactly" instead of "at most"

Two subtly different questions: "best value with weight **at most** `W`" (knapsack) and "best value with weight **exactly** `W`" (needed when the capacity must be filled, or when counting subsets of an exact sum). The transition is identical; the base cases differ. For at-most, `dp[c] = 0` for all `c` initially: an empty bag of any capacity is worth 0. For exactly, `dp[0] = 0` and every other `dp[c] = -∞`: you cannot fill a positive capacity exactly with nothing, and the `-∞` propagates so that only exactly-fillable capacities become finite. On the four items, the exact row ends as `[0, 1, −∞, 4, 5, 7, 8, 9]`: capacity 2 stays `−∞` because no subset weighs exactly 2. Interviewers use this distinction to check whether you understand *why* the base cases are what they are rather than copying them.

## Under the hood: sizes, and what to do past them

The row is `W + 1` cells. As a Python list of ints that is 8 bytes of pointer per cell plus a 28-byte object for every distinct value above 256, so a `W = 10⁶` row costs roughly 8–36 MB; as a NumPy `int64` array, 8 MB; as a bitset for the boolean variants, 125 KB. The full 2-D table for reconstruction multiplies by `n`: `n = 100`, `W = 10⁵` is 10⁷ cells, 80 MB as `int64`, or 1.25 MB as one "taken" bit per cell. Time is about 100 ns per cell in CPython (measured on 3.14 here; older interpreters are slower by a small constant) and a few nanoseconds compiled, so `nW = 10⁸` is around ten seconds in Python and well under a second in Rust or Go.

Past those sizes the tool changes:

| Regime | Tool | Cost |
|---|---|---|
| `W ≤ ~10⁷` | DP over capacity | `O(nW)` |
| `W` huge, values small (`Σv ≤ ~10⁷`) | DP over value: `dp[v]` = minimum weight achieving value exactly `v`; answer is the largest `v` with `dp[v] ≤ W` | `O(n · Σv)` |
| `W` and values huge, `n ≤ ~40` | [meet in the middle](/learn/algorithms/technique-mastery/meet-in-the-middle-and-randomisation): enumerate `2^{n/2}` subsets of each half (about 10⁶ for `n = 40`), sort one side, binary search the other | `O(2^{n/2} · n)` |
| Everything huge, approximate answer acceptable | FPTAS: scale values by `K = εv_max/n`, run the value DP on scaled values; result within `(1 − ε)` of optimal | `O(n³/ε)` |
| Exact answer, large `n` and `W` | branch and bound with the fractional-knapsack greedy as the upper bound, or an ILP solver | exponential worst case, fast on typical inputs |

The value-indexed DP is the one candidates forget: when `W = 10⁹` but every value is at most 1,000 and `n = 100`, the value axis has at most 10⁵ cells and the problem is easy again.

## Failure modes

**The answer exceeds the value of every feasible subset.** Symptom: the one-row 0/1 solution returns 9 on `weights = [2]`, `values = [3]`, `W = 6`. Diagnosis: the capacity loop runs upward, so the item is packed three times. Fix: sweep downward; keep the 2-D version and diff the two on the four-item example before trusting the optimisation.

**Exact fits are missed.** Symptom: `weights = [5]`, `values = [10]`, `W = 5` returns 0. Diagnosis: the loop is `range(W, w, -1)`, which stops at `w + 1` and never updates `dp[w]`. Fix: `range(W, w - 1, -1)`; the JS equivalent is `c >= w`, not `c > w`.

**Coin-change counts are too large.** Symptom: `ways(3, [1, 2])` returns 3 instead of 2. Diagnosis: the loops are nested amount-outer, coins-inner, so `1+2` and `2+1` are counted separately. Fix: coins outer, amount inner, which counts each multiset once.

**Counts go negative in Java or C++.** Symptom: correct for small amounts, wrong (first negative) from 1,367 pence, where the UK-coin count first passes 2³¹. Diagnosis: 32-bit overflow; UK-coin ways for £100 is 1.1 × 10¹⁵. Fix: reduce modulo the requested prime at each addition, or use 64-bit with the constraints checked.

**Target sum crashes with a negative index or returns 0 for a feasible input.** Symptom: `IndexError`, or 0 when `T` is negative. Diagnosis: `(S + T)` is odd or `|T| > S` and the code did not guard, or `T < 0` was mishandled; the transformation needs `S + T` even and non-negative. Fix: the two guards up front; note that negative `T` is fine after the guard because `(S + T) / 2` is then still a valid non-negative target.

**The partition DP takes minutes.** Symptom: `target` in the millions, a list-of-booleans loop. Diagnosis: `O(n · target)` Python-level iterations. Fix: the bitset form, three orders of magnitude faster on the same machine.

## Trade-offs

| Approach | Exact | Time | Memory | Reconstructs items | When |
|---|---|---|---|---|---|
| 2-D table | yes | `O(nW)` | `O(nW)` | yes | small inputs, items required |
| One row + taken bits | yes | `O(nW)` | `O(W)` + `nW` bits | yes | items required, `nW` bits affordable |
| One row | yes | `O(nW)` | `O(W)` | no | the default |
| Bitset row (boolean variants) | yes | `O(nW / word)` | `W` bits | no | subset sum / partition with large targets |
| Value-indexed DP | yes | `O(n Σv)` | `O(Σv)` | yes | huge `W`, small values |
| Meet in the middle | yes | `O(2^{n/2} n)` | `O(2^{n/2})` | yes | `n ≤ ~40`, everything else huge |
| FPTAS | within `1 − ε` | `O(n³/ε)` | `O(n²/ε)` | yes | huge everything, approximation acceptable |
| Greedy by density | no (unless fractional) | `O(n log n)` | `O(1)` | yes | fractional knapsack, or as a bound |

## Interviewer follow-ups

**"The capacity is 10⁹ and there are 40 items."** Model answer: `nW` is 4 × 10¹⁰ cells, so the capacity DP is out; with `n = 40`, split the items in half, enumerate the `2²⁰ ≈ 10⁶` subsets of each half as (weight, value) pairs, sort one half by weight keeping a running best value, and for each subset of the other half binary search the heaviest compatible partner. `O(2^{n/2} · n)`. Common wrong answer: "compress the capacity", which does not apply when weights are arbitrary.

**"Capacity is 10⁹ but every value is at most 1,000 and `n = 100`."** Model answer: index the DP by value: `dp[v]` = the minimum weight that achieves value exactly `v`, `O(n · Σv) = 10⁷` cells; the answer is the largest `v` with `dp[v] ≤ W`. Common wrong answer: meet in the middle, which is `2⁵⁰` here.

**"Your one-row solution returns 9. Which items?"** Model answer: the row cannot say; keep the 2-D table and walk back comparing `dp[i][c]` with `dp[i-1][c]`, or keep one bit per `(item, capacity)` recording "taken" next to the one-row values, which is `nW` bits. Common wrong answer: recomputing from the one-row values, which have lost the per-item information.

**"Why can you count combinations with the coins loop outside, and what does swapping the loops count?"** Model answer: with coins outside, `dp[a]` after processing coin `k` counts multisets using only the first `k` coins, so each multiset is built in one canonical order; with amount outside, every ordering of the same multiset is a separate path, which is the count of ordered sums (compositions), the climbing-stairs kind of count. Common wrong answer: "the order of loops does not matter for counting".

**"Now each item has a weight and a volume, with limits on both."** Model answer: the capacity becomes two-dimensional, `dp[c][u]`, swept downward in both, `O(n · W · U)`; at `W = U = 1,000` that is 10⁶ cells per item, fine for hundreds of items. Common wrong answer: running two independent knapsacks and intersecting, which is not exact.

## What mid-level engineers get wrong

- **Sweeping upward in 0/1 knapsack.** Consequence: items reused; the bug survives any test where reuse does not change the optimum.
- **Off-by-one on the lower bound of the capacity loop.** Consequence: exact fits never happen; `dp[w]` is never written.
- **Nesting the loops the wrong way when counting.** Consequence: compositions counted instead of combinations, 3 instead of 2 on the first non-trivial input.
- **Treating `O(nW)` as polynomial.** Consequence: a plan that works at `W = 10⁵` and cannot be run at `W = 10⁹`; the senior answer names the value DP, meet in the middle or an approximation.
- **Copying the at-most base cases for an exactly-W question.** Consequence: unfillable capacities report the value of a smaller bag.
- **A list of booleans for subset sum on large targets.** Consequence: minutes where the bitset takes milliseconds.
- **Not recognising the rewrite.** Consequence: target sum solved by `2ⁿ` search when it is subset sum with counting.

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

- You derive the 0/1 transition from **"is the last item in or out"**, give the cut-and-paste argument for why that is exhaustive and optimal, and point to the `dp[i-1]` on the take branch as the reason each item counts once.
- You state the **sweep-direction rule** (downward = at most once, upward = unlimited), you can show what the wrong direction computes on a four-item example, and you use it to turn 0/1 into unbounded in one line.
- You know which **loop nesting counts combinations** and which counts ordered sums, and why.
- You call the running time **pseudo-polynomial**, explain in one sentence why this is compatible with knapsack being NP-hard, and name what replaces the DP past its limits: the value-indexed DP, meet in the middle at `n ≤ 40`, the FPTAS, branch and bound.
- You recognise **subset sum, partition and target sum as knapsack in disguise**, do the algebraic rewrite for target sum before coding, and reach for the **bitset** when the target is large, with a number for the speed-up.
- You distinguish **"at most W" from "exactly W"** by their base cases (`0` everywhere versus `0` at zero and `-∞` elsewhere).
- You know **binary splitting** for bounded knapsack, and that reconstruction needs the 2-D table or one taken-bit per cell.

## Check yourself

```quiz
- q: >-
    In the one-row 0/1 knapsack, you accidentally sweep capacity upward. On weights [2], values [3], capacity 6, what do you get?
  options: ["6, since only dp[4] reads an updated cell", "0, since dp[c-2] is read before it is filled", "3, since each item is still used at most once", "9, since the one item is taken three times"]
  answer: 3
  explanation: >-
    Upward sweep reads dp[c-2] after it has already been updated with this item, so dp[2]=3, dp[4]=6, dp[6]=9: the item is taken three times. That is the unbounded answer. Every cell from dp[4] up reads an already-updated cell, not only dp[4]. Downward sweep reads the previous row's values and yields the correct 3.
- q: >-
    Why does knapsack have a polynomial-looking O(nW) algorithm even though it is NP-hard?
  options: ["The DP is exact only for small n; large n needs approximation", "It is not truly NP-hard; the O(nW) DP shows it lies in P", "O(nW) is exponential in the number of bits used to write W", "DP caches states, which makes NP-hard problems polynomial"]
  answer: 2
  explanation: >-
    Input size is measured in bits. A capacity of 10¹² is written in 40 bits but produces 10¹² table cells, so O(nW) is polynomial in the numeric value of W but exponential in the input size. This is the definition of pseudo-polynomial, and it does not put knapsack in P. The DP is exact for any n and useful whenever W is small in absolute terms.
- q: >-
    Target sum asks for the number of ± assignments reaching T. Which reduction is correct?
  options: ["Count subsets summing to (S + T) / 2, the positives' total", "Count subsets summing to T, the net total of positives", "Run unbounded knapsack to T, since each sign can repeat", "Count subsets summing to S − T, the negatives' total"]
  answer: 0
  explanation: >-
    Let P be the positives: sum(P) − (S − sum(P)) = T gives sum(P) = (S + T)/2, where S is the total; if S + T is odd or |T| > S the answer is 0. Each such subset corresponds to exactly one sign assignment. The negatives sum to (S − T)/2, not S − T. Items are used once, so it is 0/1 (downward sweep), not unbounded.
- q: >-
    You need the best value with weight exactly W, not at most W. What changes?
  options: ["The base cases: dp[0] = 0 and every other dp[c] = −∞", "The combine operator, so a take must land on c exactly", "Nothing; the at-most and exactly answers always coincide", "The sweep direction, so that no capacity is left part-empty"]
  answer: 0
  explanation: >-
    With all-zero initialisation, an unfilled capacity is worth 0, which is the at-most semantics. With −∞ everywhere except dp[0], the transition can only produce a finite value at c by adding an item to an exactly-fillable c − w, so only exactly-fillable capacities become finite. Sweep and combine are unchanged, and the answers differ whenever W cannot be filled exactly.
- q: >-
    Bounded knapsack has an item with 1000 copies. The fastest reasonable approach among these is:
  options: ["Expand into 1000 identical 0/1 items and run 0/1 once", "Split into bundles 1, 2, 4, …, 256 plus a remainder, then 0/1", "Run 0/1 knapsack 1000 times, once for each allowed count", "Run unbounded knapsack, as 1000 copies is effectively unlimited"]
  answer: 1
  explanation: >-
    Every count from 0 to 1000 is a sum of a subset of the bundles, so 0/1 on the 10 bundles (1, 2, 4, …, 256 and 489) is exact with O(log k) items instead of k. Expansion is correct but about 100× slower. Unbounded ignores the limit and can overshoot it.
- q: >-
    Counting the ways to make amount 3 from coins {1, 2}, a colleague loops over amounts on the outside and coins on the inside and gets 3. The correct combination count is 2. What did the code count?
  options: ["Ordered sums, so 1+2 and 2+1 were counted separately", "Subsets of coins, so it counted {1}, {2} and {1, 2}", "Each coin at most once, so it dropped the 1+1+1 option", "Nothing wrong; 3 is the correct number of combinations"]
  answer: 0
  explanation: >-
    With the amount loop outside, dp[a] gathers every ordering of every multiset, so 1+2 and 2+1 are distinct paths: 1+1+1, 1+2 and 2+1 make 3, which is the count of ordered sums. With coins outside, each multiset is built in one canonical order and the answer is 2. Both loops sweep upward, so coins are still unlimited in either nesting.
```
