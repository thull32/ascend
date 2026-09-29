---
slug: dp-patterns
title: "DP patterns: six state shapes that cover the interview canon"
description: Recognise the optimisation-or-count signal and the statements that only look like DP, classify the problem by its state shape, and see Coin Change, LCS, Word Break, House Robber II, Cooldown and Burst Balloons filled cell by cell, with the top-down and bottom-up costs measured in CPython and Node.
minutes: 45
difficulty: hard
tags: [dynamic-programming, memoisation, tabulation, knapsack, lcs, state-design, pattern:dynamic-programming]
problems: [climbing-stairs, min-cost-climbing-stairs, house-robber, house-robber-ii, longest-palindromic-substring, palindromic-substrings, decode-ways, coin-change, max-product-subarray, word-break, longest-increasing-subsequence, partition-equal-subset, unique-paths, longest-common-subsequence, best-time-cooldown, coin-change-ii, target-sum, interleaving-string, edit-distance, burst-balloons, regular-expression-matching, distinct-subsequences, longest-increasing-path]
---
"Minimum number of coins." "How many ways." "Longest subsequence." "Can the array be split into two equal halves." Each is an optimisation or a count over an exponential set of choices, and each has a brute-force recursion that takes forever because it solves the same subproblem millions of times. The recursion for coins of amount 11 calls itself on amount 9 through three different first coins, and each of those calls amount 7 several ways, and so on. There are only 12 distinct amounts. Dynamic programming is the observation that if you store the answer for each distinct subproblem, the exponential tree collapses to a polynomial table.

The hard part of DP in an interview is not the table; it is naming the state. "What is the smallest description of a partial solution such that the rest of the problem depends only on that description?" Once you can say `dp[i]` means *the answer for the first `i` items* or `dp[i][j]` means *the answer for prefix `i` of A and prefix `j` of B*, the recurrence is usually one line and the code is ten.

The [dynamic programming module](/learn/algorithms/dynamic-programming/the-dp-mindset) teaches the mindset and each family in depth, [the knapsack family](/learn/algorithms/dynamic-programming/knapsack-family) included. This lesson is the interview layer on top: the statements that select DP and the ones that only look like it, the six state shapes that cover the Ascend 150, and the execution details (recursion limits, memo keys, number widths) that decide whether a correct recurrence passes.

## The signal

Reach for DP when the statement contains a **superlative or a count** ("minimum", "maximum", "longest", "fewest", "number of ways", "is it possible") *and* the choices overlap: making a choice leaves a smaller instance of the same problem, and different choice sequences lead to the same smaller instance. Then classify by state shape:

| shape | signal in the statement | state | canonical problems |
|---|---|---|---|
| **Linear** | one sequence, answer for a prefix depends on a few previous positions | `dp[i]` | [Climbing Stairs](/practice/climbing-stairs), [Min Cost Climbing Stairs](/practice/min-cost-climbing-stairs), [House Robber](/practice/house-robber), [Decode Ways](/practice/decode-ways), [Max Product Subarray](/practice/max-product-subarray) |
| **Choice over a target** | "coins", "sum to target", "fill capacity", "subset with sum" | `dp[amount]` or `dp[i][amount]` | [Coin Change](/practice/coin-change), [Coin Change II](/practice/coin-change-ii), [Partition Equal Subset](/practice/partition-equal-subset), [Target Sum](/practice/target-sum) |
| **Two sequences** | two strings or arrays compared or aligned | `dp[i][j]` = answer for prefixes | [Longest Common Subsequence](/practice/longest-common-subsequence), [Edit Distance](/practice/edit-distance), [Distinct Subsequences](/practice/distinct-subsequences), [Interleaving String](/practice/interleaving-string), [Regular Expression Matching](/practice/regular-expression-matching) |
| **Grid** | paths moving right/down, or the best value ending at a cell | `dp[r][c]` | [Unique Paths](/practice/unique-paths), [Longest Increasing Path](/practice/longest-increasing-path) |
| **Interval** | "substring", "both ends", "burst/remove one and the neighbours join" | `dp[i][j]` = answer for range `i..j` | [Longest Palindromic Substring](/practice/longest-palindromic-substring), [Palindromic Substrings](/practice/palindromic-substrings), [Burst Balloons](/practice/burst-balloons) |
| **Scan-back** | "can be segmented", "longest increasing", the transition scans earlier positions | `dp[i]` with an `O(i)` transition | [Word Break](/practice/word-break), [Longest Increasing Subsequence](/practice/longest-increasing-subsequence) |

A seventh shape, the **state machine**, is a linear DP with a few modes per position ("holding a stock, sold today, resting"): [Best Time with Cooldown](/practice/best-time-cooldown). "How many variables do I need per position?" is the question that makes it click.

What rules it out:

- **You need every solution.** Memoisation cannot shrink the output: [Backtracking](/learn/interview-patterns/combinatorial-patterns/backtracking-pattern).
- **A local rule is provably optimal**: [Greedy](/learn/interview-patterns/combinatorial-patterns/greedy-pattern) in `O(n)` beats DP in `O(n²)`, if you can state the exchange argument.
- **No overlap.** Each subproblem reached once means memoising adds memory for nothing.
- **The state would need the whole history** (which elements were used, in which order), unless the history is a set of at most about 20 items that fits in a bitmask.

### Near misses

| Statement | Looks like | Actually | The tell |
|---|---|---|---|
| "Fewest jumps to reach the end", `n = 10⁵` | DP over positions, `O(n²)` | greedy BFS levels, `O(n)` | positions reachable in `k` jumps form one contiguous range |
| "Most meetings one room can host" | DP over intervals | greedy by earliest end | every meeting is worth the same |
| "Most *valuable* set of non-overlapping jobs" | greedy by end | DP over jobs sorted by end, plus binary search | values differ, so the exchange argument fails |
| "Cheapest path from corner to corner, moving in four directions" | grid DP | Dijkstra | moves go up and left too, so no fill order exists |
| "Fewest one-letter changes from `hit` to `cog`" | string DP | BFS over an implicit graph | every edge costs 1 |
| "Best single buy and sell" | state-machine DP | running minimum | one number summarises the past |
| "Largest contiguous-subarray sum" | `dp[i][j]` over ranges | Kadane, `O(n)` | the best sum ending at `i` needs only the one ending at `i − 1` |
| "Longest simple path in a graph" | DP over nodes | NP-hard with cycles; DP only on a DAG | the graph has cycles |

## The template

Write the brute-force recursion, name the arguments that change (they are the state), cache it, and convert to a loop only if depth or speed demands it. Say the four things before writing code:

1. **State**: what `dp[...]` means, in a full sentence with "exactly" or "at most" in it.
2. **Recurrence**: how a state is computed from smaller states, and which choice each term represents.
3. **Base cases**: the states with no choices, and the sentinel for impossible (`inf` for minimising, `0` for counting, `False` for feasibility).
4. **Order and answer**: which state is the answer and what fill order puts its dependencies first.

```python
from functools import cache

def coin_change_top_down(coins, amount):
    @cache                                    # a dict from argument tuple to result
    def f(a):                                 # state: amount still to make
        if a == 0:
            return 0                          # base: nothing left
        best = float("inf")                   # sentinel: impossible so far
        for c in coins:
            if c <= a:
                best = min(best, f(a - c) + 1)   # choice: the last coin is c
        return best
    r = f(amount)                             # recursion depth up to amount / min(coins)
    return -1 if r == float("inf") else r


def coin_change_bottom_up(coins, amount):
    INF = float("inf")
    dp = [0] + [INF] * amount                 # dp[a] = fewest coins summing to exactly a
    for a in range(1, amount + 1):            # order: every a - c < a is already final
        for c in coins:
            if c <= a and dp[a - c] + 1 < dp[a]:
                dp[a] = dp[a - c] + 1
    return -1 if dp[amount] == INF else dp[amount]
```

```javascript
function coinChangeTopDown(coins, amount) {
  const memo = new Int32Array(amount + 1).fill(-2);   // -2 = not computed; -1 = impossible
  function f(a) {
    if (a === 0) return 0;
    if (memo[a] !== -2) return memo[a];
    let best = Infinity;
    for (const c of coins) {
      if (c <= a) {
        const sub = f(a - c);
        if (sub >= 0 && sub + 1 < best) best = sub + 1;
      }
    }
    memo[a] = best === Infinity ? -1 : best;
    return memo[a];
  }
  return f(amount);                           // deep amounts overflow the stack: prefer bottom-up
}

function coinChangeBottomUp(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let a = 1; a <= amount; a++)
    for (const c of coins)
      if (c <= a && dp[a - c] + 1 < dp[a]) dp[a] = dp[a - c] + 1;
  return dp[amount] === Infinity ? -1 : dp[amount];
}
```

The JavaScript memo is a typed array indexed by the state, not a `Map` keyed by strings; the measured difference is below. Complexity is **states × transition cost**, stated as both factors: "`amount + 1` states, each scanning `len(coins)` options: `O(amount · coins)`."

```viz
{"type": "dp", "algorithm": "coin-change", "coins": [1, 2, 5], "amount": 11, "title": "Coin Change bottom-up", "caption": "dp[a] is the fewest coins for exactly a; each cell looks back one coin value for each coin."}
```

## Why the table is correct

**Exhaustive, optimal cases.** The recurrence must split every solution of a state into cases by one choice, the last coin, the last character pair, the last balloon, and each case must reduce to a smaller state whose *optimal* answer is the one to use. The second part is optimal substructure, and it is argued by cut and paste: if an optimal way to make amount `a` ends with coin `c`, the coins before it make `a − c`, and if a cheaper way to make `a − c` existed, swapping it in would beat the optimum.

**Induction over the fill order.** If every state a cell reads is final when the cell is computed, and the recurrence is exhaustive and optimal, then every cell is final when written; by induction on the order, so is the answer. That is why the order is part of the answer and why "moves in four directions" breaks grid DP: there is no order in which every neighbour is final first.

**State sufficiency.** The state must capture everything the future depends on. Take `dp[i]` = "length of the longest increasing subsequence in the first `i` elements" on `[1, 5, 2, 3]`: after three elements it is 2, achieved by `[1, 5]` and by `[1, 2]`. Whether the 3 extends it depends on which, and the state does not say. The fix changes the definition: "longest increasing subsequence *ending at* index `i`", which gives `[1, 2, 2, 3]` and a recurrence over earlier `j` with `a[j] < a[i]`. When a recurrence will not close, the state is missing a fact; add the fact to the index, not a global variable.

## Worked problems

### Coin Change

[Coin Change](/practice/coin-change): fewest coins to make `amount`, unlimited supply, −1 if impossible. State `dp[a]` = fewest coins summing to exactly `a`; `dp[a] = 1 + min(dp[a − c])`; base `dp[0] = 0`, others `inf`; increasing `a`.

Trace with `coins = [1, 2, 5]`, `amount = 11`:

| `a` | candidates `dp[a − c] + 1` for c = 1, 2, 5 | `dp[a]` |
|---|---|---|
| 0 | | 0 |
| 1 | 1 | 1 |
| 2 | 2, 1 | 1 |
| 3 | 2, 2 | 2 |
| 4 | 3, 2 | 2 |
| 5 | 3, 3, 1 | 1 |
| 6 | 2, 3, 2 | 2 |
| 7 | 3, 2, 2 | 2 |
| 8 | 3, 3, 3 | 3 |
| 9 | 4, 3, 3 | 3 |
| 10 | 4, 4, 2 | 2 |
| 11 | 3, 4, 3 | 3 |

Answer 3 (5 + 5 + 1). Largest-coin-first greedy also gives 3 here, but on `coins = [1, 3, 4]`, `amount = 6` it gives 4 + 1 + 1 while the table gives 3 + 3. That counterexample is the standard answer to "why not greedy". [Coin Change II](/practice/coin-change-ii) counts combinations with `+` instead of `min` and the coin loop *outside* the amount loop, so each multiset is counted once; amount outside counts `1 + 2` and `2 + 1` separately.

### Longest Common Subsequence

[Longest Common Subsequence](/practice/longest-common-subsequence): `dp[i][j]` = LCS length of `a[:i]` and `b[:j]`. If `a[i−1] == b[j−1]`, `dp[i−1][j−1] + 1`; else `max(dp[i−1][j], dp[i][j−1])`. Base row and column 0.

```python
def lcs(a, b):
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1          # match: extend the diagonal
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])  # drop a char from one side
    return dp[m][n]
```

Trace with `a = "abcde"`, `b = "ace"`:

| | `""` | `a` | `ac` | `ace` |
|---|---|---|---|---|
| `""` | 0 | 0 | 0 | 0 |
| `a` | 0 | **1** | 1 | 1 |
| `ab` | 0 | 1 | 1 | 1 |
| `abc` | 0 | 1 | **2** | 2 |
| `abcd` | 0 | 1 | 2 | 2 |
| `abcde` | 0 | 1 | 2 | **3** |

Bold cells are matches; every other cell copies the larger of above and left. Answer 3. `O(m · n)` time; `O(min(m, n))` space with two rows, since row `i` reads only row `i − 1`. [Edit Distance](/practice/edit-distance), [Distinct Subsequences](/practice/distinct-subsequences) and [Interleaving String](/practice/interleaving-string) are this grid with different three-way choices.

```viz
{"type": "dp", "algorithm": "lcs", "a": "abcde", "b": "ace", "title": "LCS table", "caption": "A match extends the diagonal; a mismatch takes the better of dropping a character from either string."}
```

### Word Break

[Word Break](/practice/word-break): `dp[i]` = can `s[:i]` be segmented; true if some `j < i` has `dp[j]` and `s[j:i]` in the dictionary. Base `dp[0] = True`.

```python
def word_break(s, word_dict):
    words = set(word_dict)
    max_len = max(map(len, words), default=0)
    dp = [True] + [False] * len(s)
    for i in range(1, len(s) + 1):
        for j in range(max(0, i - max_len), i):   # no word is longer than max_len
            if dp[j] and s[j:i] in words:
                dp[i] = True
                break
    return dp[len(s)]
```

Trace with `s = "leetcode"`, `dict = ["leet", "code"]`, `max_len = 4`:

| `i` | `s[:i]` | `j` with `dp[j]` true | `s[j:i]` in dict? | `dp[i]` |
|---|---|---|---|---|
| 1–3 | l, le, lee | 0 | no | F |
| 4 | leet | 0 | "leet" **yes** | T |
| 5–7 | leetc, leetco, leetcod | 4 | "c", "co", "cod": no | F |
| 8 | leetcode | 4 | "code" **yes** | T |

The `max_len` bound matters at scale: on `"aaa…ab"` of length 5,000 with words `"a"` to `"aaaaaaaaaa"`, the bounded loop made 5,009 checks (1 ms) and the unbounded one 12.5 million (3.4 s) in CPython 3.14.

```viz
{"type": "dp", "algorithm": "word-break", "s": "leetcode", "words": ["leet", "code"], "title": "Word Break", "caption": "dp[i] turns true when a dictionary word ends at i and the prefix before it is breakable."}
```

### House Robber II

[House Robber II](/practice/house-robber-ii): houses in a circle, no two adjacent robbed. The linear version is `dp[i] = max(dp[i−1], dp[i−2] + nums[i−1])`, two variables. The circle only links house 0 and house `n − 1`, so an optimum skips at least one of them: run the linear DP on `nums[1:]` and on `nums[:-1]` and take the better.

```python
def rob_circle(nums):
    if len(nums) == 1:
        return nums[0]
    def rob_line(a):
        prev, cur = 0, 0
        for x in a:
            prev, cur = cur, max(cur, prev + x)
        return cur
    return max(rob_line(nums[1:]), rob_line(nums[:-1]))
```

On `[1, 2, 3, 1]`: `[2, 3, 1]` gives `(prev, cur)` = `(0,0) → (0,2) → (2,3) → (3,3)`, 3; `[1, 2, 3]` gives `(0,0) → (0,1) → (1,2) → (2,4)`, 4. Answer 4. The move generalises: when one constraint links the ends of a linear structure, *case-split on it* and reuse the linear solution.

### Best Time with Cooldown

[Best Time with Cooldown](/practice/best-time-cooldown): unlimited trades, one share at a time, and a day of rest after each sale. Three modes per day: `hold` (own a share), `sold` (sold today), `rest` (no share, free to buy). Transitions: `hold = max(hold, rest − p)`, `sold = hold + p`, `rest = max(rest, sold)`, all from yesterday's values.

| price | `hold` | `sold` | `rest` |
|---|---|---|---|
| start | −∞ | −∞ | 0 |
| 1 | −1 | −∞ | 0 |
| 2 | −1 | 1 | 0 |
| 3 | −1 | 2 | 1 |
| 0 | 1 | −1 | 2 |
| 2 | 1 | 3 | 2 |

Answer `max(sold, rest) = 3`: buy at 1, sell at 2, rest, buy at 0, sell at 2. Buying reads `rest`, never `sold`, and that single choice encodes the cooldown. Updating the three variables in sequence rather than simultaneously lets today's sale feed today's rest, a bug that survives most small tests.

### Burst Balloons

[Burst Balloons](/practice/burst-balloons): bursting balloon `k` earns `left · k · right` with its current neighbours. Choosing the *first* balloon to burst leaves two halves that still interact; choosing the *last* balloon in an open interval `(i, j)` fixes its neighbours at `a[i]` and `a[j]` and makes the halves independent: `dp[i][j] = max over k of dp[i][k] + a[i]·a[k]·a[j] + dp[k][j]`, filled by increasing interval length. On `[3, 1, 5, 8]`, padded to `[1, 3, 1, 5, 8, 1]`:

| length | ends `a[i]`, `a[j]` | balloons inside | best | burst last |
|---|---|---|---|---|
| 2 | 1, 1 | 3 | 3 | 3 |
| 2 | 3, 5 | 1 | 15 | 1 |
| 2 | 1, 8 | 5 | 40 | 5 |
| 2 | 5, 1 | 8 | 40 | 8 |
| 3 | 1, 5 | 3, 1 | 30 | 3 |
| 3 | 3, 8 | 1, 5 | 135 | 5 |
| 3 | 1, 1 | 5, 8 | 48 | 8 |
| 4 | 1, 8 | 3, 1, 5 | 159 | 3 |
| 4 | 3, 1 | 1, 5, 8 | 159 | 8 |
| 5 | 1, 1 | 3, 1, 5, 8 | **167** | 8 |

One cell worked: the ends 3 and 8 around `[1, 5]`. Bursting 1 last earns `0 + 3 · 1 · 8 + 40 = 64` (the 40 is the 5 burst earlier between 1 and 8); bursting 5 last earns `15 + 3 · 5 · 8 + 0 = 135`. The whole row: 8 last gives `159 + 1 · 8 · 1 = 167`.

`O(n³)`: `n²` intervals, `n` choices of the last balloon each.

## Variations

| Variant | Change to the template | Why it stays correct |
|---|---|---|
| Space optimisation | keep the last `k` values, or two rows | the recurrence reads only that window |
| 0/1 versus unbounded knapsack | sweep capacity downward for 0/1, upward for unbounded | downward reads the previous item's row |
| Count instead of optimise | `+` for `min`, base `1` for `0` | the cases partition the solutions |
| Combinations versus orderings | items outer for combinations, amount outer for orderings | one canonical order per multiset |
| Interval DP | fill by length; pick a split or the *last* element | shorter intervals are final first |
| LIS in `O(n log n)` | sorted tails plus binary search | `tails[k]` is the smallest tail of a length-`k + 1` run |
| Memoised DFS on a DAG | recursion with a cache, no fill order | strictly increasing values rule out cycles |
| State machine | a few variables per position | one variable per mode |
| Reconstruction | keep the table, walk back from the answer | each step re-derives which case won |

## Complexity, derived

| Problem | States | Transition | Time | Space after compression |
|---|---|---|---|---|
| Coin Change | `amount + 1` | `len(coins)` | `O(amount · coins)` | `O(amount)` |
| LCS, Edit Distance | `(m + 1)(n + 1)` | `O(1)` | `O(m · n)` | `O(min(m, n))` |
| Word Break | `n + 1` | `max_len` substring checks of up to `max_len` chars | `O(n · L²)` | `O(n)` |
| House Robber II | `2n` | `O(1)` | `O(n)` | `O(1)` |
| Cooldown | `3n` | `O(1)` | `O(n)` | `O(1)` |
| Burst Balloons | `n²` | `n` | `O(n³)` | `O(n²)` |
| LIS | `n` | `O(n)`, or `O(log n)` with tails | `O(n²)` or `O(n log n)` | `O(n)` |

The factor a follow-up attacks is usually the transition: LIS `O(n)` → `O(log n)`, Word Break's scan bounded by the longest word. Measured in CPython 3.14: LIS on 10,000 random values took 832 ms as `O(n²)` and 0.7 ms with tails; at 10⁵ the tails version took 8 ms, where the quadratic one would need on the order of 80 s.

## Under the hood

### Top-down in CPython

The memoised coin change above, with coins `[1, 2, 5]`, raised `RecursionError` for every amount above 997: the first call descends through `a − 1`, `a − 2`, … one frame per unit before anything is cached, and CPython's default limit is 1,000 frames. Top-down LCS on two 1,000-character strings recurses up to `m + n` = 2,000 deep and fails the same way. With the limit raised, it ran in 242 ms against 58 ms bottom-up, visited 703,040 of the 10⁶ states, and peaked at 128 MB under `tracemalloc`: each cached state is a tuple key plus a dict slot, on the order of 100–200 bytes ([Recursion limits and `lru_cache`](/learn/algorithms/recursion-backtracking/from-backtracking-to-memoisation) has the per-entry breakdown). Top-down wins only when most states are unreachable.

### Memo keys in JavaScript

Top-down LCS on 1,000-character strings in Node 24: a `Map` keyed by `` `${i},${j}` `` took 216 ms, a `Map` keyed by `i * (n + 1) + j` 77 ms, and an `Int32Array` indexed the same way 15 ms. String keys allocate and hash a string per lookup. Bottom-up on 2,000 × 2,000 took about 25–47 ms with nested arrays and 16–19 ms with one flat `Int32Array`; CPython took 168 ms for the same table with row references hoisted out of the inner loop, 259 ms without.

### When the count outgrows the number

Counting DPs grow exponentially. The ways to make an amount from the eight UK coin denominations first exceed 2⁵³ at 13,512 pence; at 13,600 a JavaScript `Number` table returns 9,422,355,624,004,784 where the exact count ends in 785 (checked against `BigInt` in Node 24). No error is raised. The fixes are the modulus the problem asks for, applied after every addition (sums of two values below 10⁹ + 7 stay exact), or `BigInt`, which ran the same table about ten times slower. A product of two residues, `a * b % MOD`, is not exact in doubles: `999999999 * 999999998 % (10⁹ + 7)` gives 70 instead of 72. Python's integers never overflow but grow a 30-bit digit at a time, so an unreduced count costs more per addition as it grows.

### Table memory

A 2,001 × 2,001 list of lists of small ints is 32 MB of pointers in CPython; when most cells hold distinct ints above 256, each is also a 28-byte object and the table reached 159 MB. Two rows of 2,001 cells are 32 KB. Say the compressed version exists, and write the full table first unless memory is the question.

## Failure modes

**Symptom: minimisation returns 0 for an impossible amount.** Diagnosis: `0` used as the "impossible" sentinel collides with a real answer. Fix: `inf` (or a value larger than any answer), converted to −1 at the end.

**Symptom: Coin Change II returns 3 for amount 3 with coins `[1, 2]`.** Diagnosis: the amount loop is outside, so orderings are counted. Fix: coins outside, amount inside.

**Symptom: a correct top-down solution raises `RecursionError` or a JavaScript `RangeError` on the largest hidden test.** Diagnosis: depth equals the chain of first-choice calls (amount, `m + n`). Fix: bottom-up. Raising the limit does not rescue a `@cache` recursion, because every call also passes through the cache's C wrapper and so uses C stack: on CPython 3.14 with the limit set to 10⁶, a depth of 20,000 stopped with `RecursionError: Stack overflow` (the `sys` docs warn that on other builds a too-high limit can crash the interpreter).

**Symptom: the cooldown answer is too high.** Diagnosis: `hold`, `sold` and `rest` updated one after another, so a sale on day `t` feeds a purchase on day `t`. Fix: compute all three from the previous day's values (tuple assignment in Python, temporaries in JavaScript).

**Symptom: large counts differ in the last digits between Python and JavaScript.** Diagnosis: the JavaScript table passed 2⁵³. Fix: reduce modulo after every addition, or `BigInt`.

**Symptom: fast on the samples, memory limit on the hidden tests.** Diagnosis: memo keys built from slices (`f(s[i:])`), which store an `O(n)` string per state and cost `O(n)` to hash. Fix: key on indices.

## Trade-offs

| Approach | Code to write | Speed (measured) | Memory | Depth risk | Reconstructs |
|---|---|---|---|---|---|
| Top-down, `@cache` | least; mirrors the recursion | 4× slower on LCS | 100–200 B per visited state | yes | yes, from the cache |
| Bottom-up table | order must be derived | baseline | one cell per state | none | yes |
| Rolling rows / variables | order plus window | same | `O(window)` | none | no |
| Bitset row (boolean DPs) | shift-and-or | about 1,200× faster for subset sum ([knapsack family](/learn/algorithms/dynamic-programming/knapsack-family)) | 1 bit per state | none | no |

## Interviewer follow-ups

**"Return the actual subsequence, not its length."** Model answer: keep the full table and walk back from `dp[m][n]`: on a match go diagonally and emit the character, otherwise move to the neighbour holding the same value; `O(m + n)` after the fill. Common wrong answer: tracking a "current best string" in each cell, which copies strings and costs `O(m · n · L)`.

**"Now `n` is 10⁵."** Model answer: name the factor to cut. LIS goes to sorted tails with binary search; Word Break bounds the scan by the longest word or walks a trie; an `O(n²)` interval DP is out and you look for a greedy or monotonic-stack structure. Common wrong answer: "memoise it", which does not change the state count.

**"Return every segmentation, not whether one exists."** Model answer: the output is exponential, so backtrack over split points, using the DP (or a memo of "suffix `i` is breakable") to refuse split points that lead nowhere: [Backtracking](/learn/interview-patterns/combinatorial-patterns/backtracking-pattern). Common wrong answer: storing lists of sentences in each DP cell, which is the exponential output held `n` times.

**"Parallelise the LCS table" or "can several threads share the memo?"** Model answer: cells on one anti-diagonal (`i + j` constant) depend only on the two previous anti-diagonals, so each anti-diagonal can be computed in parallel, a wavefront. SIMD implementations of Smith–Waterman sequence alignment, a grid DP of the same shape, are the production example of parallelising such a fill at the instruction level. A shared memo of a pure function tolerates races: `functools.lru_cache` stays coherent across threads but may compute a value twice. Common wrong answer: splitting the rows across threads, which serialises on the row dependency.

**"Memory is limited to `O(n)`."** Model answer: two rows, or one row with a saved diagonal; reconstruction then needs Hirschberg's divide and conquer ([DP craft](/learn/algorithms/dynamic-programming/dp-craft)). Common wrong answer: dropping to one row and still claiming the path can be recovered.

## What mid-level engineers get wrong

- **A state that is not a full sentence.** "`dp[i]` is the best so far" without saying whether `i` is included; the recurrence fails on the first case it does not cover.
- **Treating every "minimum" as DP.** Four-direction grids are Dijkstra, fewest jumps is greedy, fewest transformations is BFS.
- **Top-down on a deep chain in Python**, which passes the samples and dies at depth 1,000 on the hidden tests.
- **String memo keys in JavaScript**, three to fourteen times slower than numeric or typed-array memos.
- **Counting without the modulus in JavaScript**, which silently loses exactness past 2⁵³.
- **Optimising space before correctness.** A one-row update with an off-by-one is worse than a correct full table.
- **Forgetting the greedy counterexample** (`[1, 3, 4]`, amount 6) when the interviewer asks "why not greedy".

## Exercises

```exercise
id: coin-change-min
title: Fewest coins
prompt: |
  Given a list of positive coin denominations `coins` (unlimited supply of
  each) and a non-negative integer `amount`, return the fewest coins whose
  values sum to exactly `amount`, or -1 if it cannot be made. `amount` of
  0 needs 0 coins.

  Use bottom-up DP over amounts: dp[a] is the fewest coins for exactly a.
languages: [python, javascript]
entry: coin_change
starter:
  python: |
    def coin_change(coins, amount):
        # your code here
        return -1
  javascript: |
    function coin_change(coins, amount) {
      // your code here
      return -1;
    }
tests:
  - args: [[1, 2, 5], 11]
    expected: 3
  - args: [[2], 3]
    expected: -1
    label: impossible
  - args: [[1], 0]
    expected: 0
    label: zero amount
  - args: [[1, 3, 4], 6]
    expected: 2
    label: greedy would answer 3
  - args: [[2, 5, 10, 1], 27]
    expected: 4
  - args: [[186, 419, 83, 408], 6249]
    expected: 20
    hidden: true
    label: large amount, needs the full table
  - args: [[3, 7], 5]
    expected: -1
    hidden: true
hints:
  - "Initialise dp[0] = 0 and every other dp[a] to infinity; fill a from 1 to amount."
  - "For each coin c <= a, dp[a] = min(dp[a], dp[a - c] + 1)."
  - "Return -1 if dp[amount] is still infinity."
```

```exercise
id: decode-ways-linear
title: Count the decodings
prompt: |
  A message of letters was encoded as digits with A = 1, B = 2, ..., Z = 26
  and the separators were lost. Given the digit string `s` (possibly
  starting with "0"), return how many ways it can be decoded. A group such
  as "06" is not a valid code for F; only "6" is. Return 0 when no
  decoding exists.

  Use a linear DP: dp[i] is the number of decodings of s[:i], and it needs
  only dp[i - 1] (last digit alone) and dp[i - 2] (last two digits
  together), so two variables suffice. The longest test has 45 digits, so
  plain recursion without a memo will time out.
languages: [python, javascript]
entry: num_decodings
starter:
  python: |
    def num_decodings(s):
        # your code here
        return 0
  javascript: |
    function num_decodings(s) {
      // your code here
      return 0;
    }
tests:
  - args: ["12"]
    expected: 2
  - args: ["226"]
    expected: 3
  - args: ["06"]
    expected: 0
    label: leading zero
  - args: ["10"]
    expected: 1
    label: a zero must pair with the digit before it
  - args: ["27"]
    expected: 1
    label: 27 is not a letter
  - args: ["2101"]
    expected: 1
    hidden: true
  - args: ["100"]
    expected: 0
    hidden: true
    label: "00 cannot be decoded"
  - args: ["111111111111111111111111111111111111111111111"]
    expected: 1836311903
    hidden: true
    label: 45 ones, a Fibonacci number
hints:
  - "dp[0] = 1 (the empty prefix has one decoding); dp[1] = 1 unless s[0] is '0'."
  - "dp[i] gets dp[i - 1] if s[i - 1] is not '0', plus dp[i - 2] if s[i - 2:i] is between 10 and 26."
  - "Keep only the last two values; a string of ones gives Fibonacci numbers."
```

## Senior signals

- You **state the state in a sentence** before coding, with "exactly" or "at most", and fix a stuck recurrence by adding the missing fact to the state.
- You **reject DP when it is the wrong tool**: four-direction grids are Dijkstra, fewest jumps is greedy, unit-cost transformations are BFS, and you say why (no fill order, or an exchange argument).
- You classify by **state shape** and can name three problems with the same shape, which tells the interviewer you will finish.
- You know the **loop-order and direction rules** for combinations versus orderings and for 0/1 versus unbounded, and explain them by what each order allows.
- You recognise **case-splitting** (House Robber II), **choose the last element** (Burst Balloons) and **one variable per mode** (Cooldown) as the moves that unstick a DP.
- You quote cost as **states × transition** and know the runtime: 1,000 frames of recursion in CPython, top-down about 4× slower than a table when most states are visited, typed arrays over string keys in JavaScript, and exactness ending at 2⁵³.

## Check yourself

```quiz
- q: >-
    Coin Change II (count combinations) with coins [1, 2] and amount 3. Looping amounts outside and coins inside gives:
  options: ["2, which is the correct count", "1, since only 1+1+1 is found", "4, since 1+1+1 is counted twice", "3, since 1+2 and 2+1 both count"]
  answer: 3
  explanation: >-
    With amounts outermost, every ordering of the same multiset of coins reaches the amount by a different path and is added separately, so 1+1+1, 1+2 and 2+1 give 3. Putting the coin loop outermost fixes the coin order and counts each multiset once, giving the correct 2.
- q: >-
    Which statement of the DP state for the longest increasing subsequence lets the recurrence close?
  options: ["dp[i] is the LIS length within the first i elements", "dp[i] is the LIS length of a run ending at index i", "dp[i] is 1 if a[i] exceeds a[i - 1], and 0 otherwise", "dp[i] is the largest value seen in the first i elements"]
  answer: 1
  explanation: >-
    Whether a new element extends a subsequence depends on that subsequence's last value. The prefix version loses it: on [1, 5, 2, 3] the prefix of three has LIS 2 via [1, 5] or [1, 2], and only one of them accepts the 3. Fixing where the run ends puts the needed fact into the index.
- q: >-
    The cheapest path from the top-left to the bottom-right of a cost grid, where moves may go in all four directions. Why is grid DP the wrong tool?
  options: ["The table would need one extra dimension per direction", "DP cannot handle a grid wider than a few hundred cells", "No fill order finalises each neighbour before its cell", "Grid DP needs every cost in the grid to be positive"]
  answer: 2
  explanation: >-
    DP is correct by induction over a fill order in which every state a cell reads is already final. With up and left moves allowed, cells depend on each other in cycles, so no such order exists. With non-negative costs this is a shortest-path problem, and Dijkstra settles cells in order of distance instead.
- q: >-
    A memoised top-down Coin Change in CPython passes every sample and raises RecursionError on amount 5,000 with coin 1 present. What is the fix an interviewer expects?
  options: ["Replace @cache with @lru_cache(maxsize=None)", "Store the memo in a global dict instead of a decorator", "Sort the coins so that the largest one is tried first", "Rewrite it bottom-up, looping over amounts upward"]
  answer: 3
  explanation: >-
    The first call descends one frame per unit of amount before anything is cached, and CPython stops at 1,000 frames. The cache type and where it lives do not change the depth, and trying larger coins first only moves the problem to inputs without them. A loop over amounts has no depth at all.
- q: >-
    Counting coin combinations for large amounts in JavaScript, the answers differ from Python in the last digit, with no error. What happened?
  options: ["Array.fill shared one object across every cell", "The loop order counted orderings for large amounts", "Integer addition in JavaScript wraps at 2^31 - 1", "The counts passed 2^53 and Number rounded them"]
  answer: 3
  explanation: >-
    JavaScript numbers are doubles, exact for integers only up to 2^53. The UK-coin count passes that near 13,500 pence and from there on sums are rounded silently. Reducing modulo the requested prime after each addition, or using BigInt, restores exactness; plain addition does not wrap at 2^31.
- q: >-
    Burst Balloons defines dp[i][j] by the balloon burst last in the open interval (i, j), not the one burst first. Why?
  options: ["Choosing first would count every order twice over", "It lets the table be filled in a single left-to-right pass", "Last means its neighbours are a[i] and a[j]: halves split", "It reduces the running time from O(n^3) down to O(n^2)"]
  answer: 2
  explanation: >-
    If balloon k is burst last in (i, j), everything between i and k and between k and j is gone before it, so its neighbours at that moment are exactly a[i] and a[j], and the two sides never interact. Bursting k first leaves its neighbours adjacent, so the halves depend on each other. The table is still O(n^2) intervals with O(n) choices, filled by increasing length.
```
