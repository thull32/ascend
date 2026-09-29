---
slug: one-dimensional-dp
title: "One-dimensional DP: house robber, coin change, decode ways"
description: Derive the state and transition for the classic 1-D problems, watch each table fill, and learn the loop-order rule that separates counting combinations from counting permutations.
minutes: 50
difficulty: medium
tags: [dynamic-programming, 1d-dp, house-robber, coin-change, decode-ways]
problems: [house-robber, house-robber-ii, coin-change, coin-change-ii, decode-ways]
---
A row of houses holds cash: `[2, 7, 9, 3, 1]`. You may rob any subset, but robbing two adjacent houses trips the alarm. What is the most you can take? Greedy ("take the biggest, skip its neighbours") picks 9, then 2 and 1, for 12; here that happens to be right, but on `[3, 5, 3]` the same greedy takes the 5, which forbids both 3s, and ends with 5 while the optimum is 3 + 3 = 6. "Take every other house" fails on `[2, 1, 1, 2]` if you start at the wrong parity, and "take the house with the best value minus its neighbours" fails on longer chains. Every plausible local rule has a counterexample. The problem needs DP, and it is the cleanest possible introduction to one-dimensional state.

One-dimensional DP means the state is a single index into a sequence: "the best answer for the prefix ending at `i`" or "the number of ways to make amount `a`". This lesson derives the canonical recurrences with the four-step procedure from [the DP mindset](/learn/algorithms/dynamic-programming/the-dp-mindset), fills each table by hand, proves why increasing order is enough, and covers the one subtlety, loop order, that produces wrong counts even when the recurrence is right.

## House robber: a state with a decision

**State.** `dp[i]` = the maximum cash obtainable from houses `0..i` inclusive (whether or not house `i` itself is robbed).

**Transition.** Consider the last house, `i`. Either you rob it, in which case you could not have robbed `i-1` and the best you did before is `dp[i-2]`; or you skip it, and the best is `dp[i-1]`:

$$dp[i] = \max(dp[i-1],\; dp[i-2] + nums[i])$$

That is the whole algorithm. The `max` is the decision; both branches are fully described by smaller states because "the best from `0..i-2`" does not care what you do at `i`.

**Order and base cases.** `dp[0] = nums[0]`, `dp[1] = max(nums[0], nums[1])`, then increasing `i`.

**Answer.** `dp[n-1]`.

Trace `[2, 7, 9, 3, 1]`:

| `i` | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| `nums[i]` | 2 | 7 | 9 | 3 | 1 |
| rob: `dp[i-2] + nums[i]` | – | – | 2 + 9 = 11 | 7 + 3 = 10 | 11 + 1 = 12 |
| skip: `dp[i-1]` | – | 2 | 7 | 11 | 11 |
| `dp[i]` | 2 | 7 | **11** | **11** | **12** |

Two cells in full: `dp[2] = max(dp[1], dp[0] + nums[2]) = max(7, 2 + 9) = 11` (rob wins), and `dp[3] = max(dp[2], dp[1] + nums[3]) = max(11, 7 + 3) = 11` (skip wins; the 3 is never worth losing the 9). Then `dp[4] = max(11, 11 + 1) = 12`: houses 0, 2 and 4.

```viz
{"type": "dp", "algorithm": "house-robber", "values": [2, 7, 9, 3, 1], "title": "House robber: dp[i] = max(dp[i-1], dp[i-2] + nums[i])", "caption": "Each cell compares 'skip this house' against 'rob it plus the best from two houses back'."}
```

```python
def rob(nums: list[int]) -> int:
    prev2, prev1 = 0, 0            # dp[i-2], dp[i-1] with dp[-1] = dp[-2] = 0
    for x in nums:
        prev2, prev1 = prev1, max(prev1, prev2 + x)
    return prev1
```

Starting both rolling variables at 0 removes the special-casing of the first two houses: `dp[0] = max(0, 0 + nums[0]) = nums[0]`, and it handles the empty array (returns 0) for free. This is a general trick: pick base values that make the transition itself produce the first real cells.

The circular variant ([House Robber II](/practice/house-robber-ii), houses in a ring) is the same recurrence run twice, once on `nums[0..n-2]` and once on `nums[1..n-1]`, taking the max, because the only new constraint is "not both the first and the last".

## Coin change: minimising over a set of moves

Given coin denominations and an amount, find the fewest coins that sum to it. Greedy by largest coin works for `{1, 5, 10, 25}` and fails for `{1, 3, 4}` with amount 6 (greedy: 4 + 1 + 1 = 3 coins; optimal: 3 + 3 = 2). The [greedy lesson](/learn/algorithms/greedy/greedy-and-exchange-arguments) explains why; here we fix it.

**State.** `dp[a]` = the minimum number of coins that make amount `a` exactly, or `∞` if impossible.

**Transition.** The last coin used had some denomination `c`. Before it, the amount was `a - c`, made optimally:

$$dp[a] = 1 + \min_{c \in coins,\, c \le a} dp[a - c]$$

**Order and base cases.** `dp[0] = 0` (zero coins make zero). Increasing `a`, because `a - c < a`.

**Answer.** `dp[amount]`, or `-1` if it is still `∞`.

Trace `coins = [1, 3, 4]`, `amount = 6`:

| `a` | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| candidates `1 + dp[a-c]` | – | 1+dp[0]=1 | 1+dp[1]=2 | 1+dp[2]=3, 1+dp[0]=1 | 1+dp[3]=2, 1+dp[1]=2, 1+dp[0]=1 | 1+dp[4]=2, 1+dp[2]=3, 1+dp[1]=2 | 1+dp[5]=3, 1+dp[3]=2, 1+dp[2]=3 |
| `dp[a]` | 0 | 1 | 2 | 1 | 1 | 2 | **2** |

Two cells in full: `dp[4] = 1 + min(dp[3], dp[1], dp[0]) = 1 + min(1, 1, 0) = 1` (the 4-coin alone), and `dp[6] = 1 + min(dp[5], dp[3], dp[2]) = 1 + min(2, 1, 2) = 2` via `dp[3]`, that is, coin 3 then coin 3. The greedy path (4, then 1, then 1) is one of the candidates the DP considers, `1 + dp[2] = 3`, and it loses.

```viz
{"type": "dp", "algorithm": "coin-change", "coins": [1, 3, 4], "amount": 6, "title": "Coin change (minimum coins): dp[a] = 1 + min over coins of dp[a - c]", "caption": "Amount 6 resolves to 2 coins through dp[3], not through the greedy 4 + 1 + 1."}
```

```python
def coin_change(coins: list[int], amount: int) -> int:
    INF = amount + 1                       # any real answer uses at most `amount` coins
    dp = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and dp[a - c] + 1 < dp[a]:
                dp[a] = dp[a - c] + 1
    return dp[amount] if dp[amount] <= amount else -1
```

Time `O(amount × |coins|)`, space `O(amount)`. The complexity is *pseudo-polynomial*: polynomial in the numeric value of `amount`, not in the number of bits needed to write it. For `amount = 10⁹` this DP needs `10⁹` cells (8 GB as a typed array, about 36 GB as a Python list) and `10⁹ × |coins|` steps, which is why the general problem is NP-hard while the DP is fine for the `amount ≤ 10⁴` an interviewer gives you. Saying "pseudo-polynomial" unprompted is a senior signal; the [knapsack lesson](/learn/algorithms/dynamic-programming/knapsack-family) returns to it.

### The "unreachable" sentinel

`dp[a]` must hold something for amounts no coin combination makes, and that something must lose every `min`. Four candidates:

| Sentinel | Array stays all-`int` | `sentinel + 1` still loses | Transition needs a guard | Survives JSON |
|---|---|---|---|---|
| `float('inf')` / `Infinity` | No (mixed types) | Yes | No | No (`JSON.stringify(Infinity)` is `null`) |
| `amount + 1` | Yes | Yes (at most `amount + 2`, no overflow) | No | Yes |
| `-1` | Yes | **No** (`-1 + 1 = 0` wins every `min`) | Yes (`if dp[a-c] != -1`) | Yes |
| `None` / `null` | No | Raises `TypeError` in Python; `null + 1` is `1` in JavaScript | Yes | Yes |

`amount + 1` works because every coin is at least 1, so any amount `a` that can be made at all uses at most `a ≤ amount` coins; a value of `amount + 1` can never be a real answer and therefore never wins a `min` against one. Adding 1 to it gives at most `amount + 2`, far from any overflow. `-1` without a guard is the classic bug: run `coins = [2]`, `amount = 3` with the unguarded transition and you get `dp = [0, -1, 1, 0]`, because `dp[3] = dp[1] + 1 = 0` claims that zero coins make 3. The poison then spreads: `dp[5] = dp[3] + 1 = 1`. If you must use `-1`, guard the read; if you can choose, use `amount + 1`, which keeps the array all-integer (faster in CPython, packed small integers in V8) and JSON-clean.

## Counting ways: the loop-order rule

Change the question: *how many* ways are there to make the amount? Two versions exist, and they have different answers:

- **Combinations** (the usual "Coin Change II"): `{1, 3}` and `{3, 1}` are the same way. For `coins = [1, 2]`, `amount = 4`, there are 3 ways: `1+1+1+1`, `1+1+2` and `2+2`.
- **Ordered sequences** (like climbing stairs): `1+1+2`, `1+2+1` and `2+1+1` are different. Same input gives 5 ways.

The recurrences look almost identical and differ only in loop order.

```python
def count_ordered(coins, amount):          # sequences: 1+2 and 2+1 both count
    dp = [1] + [0] * amount
    for a in range(1, amount + 1):          # outer: amount
        for c in coins:                     # inner: coins
            if c <= a:
                dp[a] += dp[a - c]
    return dp[amount]

def count_combinations(coins, amount):     # multisets: 1+2 == 2+1
    dp = [1] + [0] * amount
    for c in coins:                         # outer: coins
        for a in range(c, amount + 1):      # inner: amount
            dp[a] += dp[a - c]
    return dp[amount]
```

Fill both tables for `coins = [1, 2]`, `amount = 4` and watch the numbers diverge. Combinations, showing the row after each outer pass over a coin:

| after | `dp[0]` | `dp[1]` | `dp[2]` | `dp[3]` | `dp[4]` |
|---|---|---|---|---|---|
| initialisation | 1 | 0 | 0 | 0 | 0 |
| coin 1 pass | 1 | 1 | 1 | 1 | 1 |
| coin 2 pass | 1 | 1 | 2 | 2 | **3** |

In the coin-2 pass, `dp[2] += dp[0]` gives `1 + 1 = 2` (`{1,1}` and `{2}`), and `dp[4] += dp[2]` gives `1 + 2 = 3`, where the `dp[2]` read is *already the updated value*. That in-pass read is deliberate: it is what lets `{2, 2}` use the coin twice.

Ordered sequences, showing the row after each amount:

| after | `dp[0]` | `dp[1]` | `dp[2]` | `dp[3]` | `dp[4]` |
|---|---|---|---|---|---|
| initialisation | 1 | 0 | 0 | 0 | 0 |
| `a = 1` | 1 | 1 | 0 | 0 | 0 |
| `a = 2` | 1 | 1 | 2 | 0 | 0 |
| `a = 3` | 1 | 1 | 2 | 3 | 0 |
| `a = 4` | 1 | 1 | 2 | 3 | **5** |

`dp[4] = dp[3] + dp[2] = 3 + 2 = 5`: the sequences `1111`, `112`, `121`, `211`, `22`. The three sequences `112`, `121`, `211` are one multiset, which is the whole difference between 5 and 3.

Why does swapping the loops change the meaning? Each version keeps a different invariant. Coins-outer: *after processing coins `c₁..cₖ`, `dp[a]` is the number of multisets of those coins summing to `a`*. Adding coin `cₖ` preserves it because a multiset either contains no `cₖ` (already counted in the old `dp[a]`) or contains at least one; remove one `cₖ` and you have a multiset for `a − cₖ` over the same `k` coins, which is the new `dp[a − cₖ]`. Disjoint, exhaustive, so each multiset is counted once. Amount-outer: *`dp[a]` is the number of sequences summing to `a`*; the last element is any coin `c`, and the rest is a sequence for `a − c`, so `dp[a] = Σ_c dp[a − c]` counts every ordering separately.

This is the single most common DP bug in interviews: right recurrence, wrong loop nesting, off by a factor that grows with the input. When you write a counting DP, say which version the problem wants and then say which loop is outer and why. The [combinatorics lesson](/learn/foundations/math-for-engineers/counting-and-combinatorics) is where multisets versus sequences is defined.

## Decode ways: a state with validity constraints

A string of digits encodes letters as `1 → A … 26 → Z`. Count the decodings of `"226"`: `2|2|6` (BBF), `22|6` (VF), `2|26` (BZ), so 3. Zeros complicate it: `"06"` has no decoding because `06` is not a valid code and `0` alone is not either; `"10"` has exactly one.

**State.** `dp[i]` = the number of ways to decode the prefix `s[0..i)` (the first `i` characters). `dp[0] = 1`: the empty prefix has one decoding, the empty one.

**Transition.** The last letter came from one digit or two:

$$dp[i] = \big[\,s[i-1] \ne 0\,\big]\cdot dp[i-1] \;+\; \big[\,10 \le s[i-2..i) \le 26\,\big]\cdot dp[i-2]$$

where `[·]` is 1 if the condition holds and 0 otherwise.

**Order.** Increasing `i`. **Answer.** `dp[n]`.

Trace `"120127"`, which contains both a zero and a `27`-style pair (two digits above 26):

| `i` | 1 (`1`) | 2 (`2`) | 3 (`0`) | 4 (`1`) | 5 (`2`) | 6 (`7`) |
|---|---|---|---|---|---|---|
| single digit valid? | yes | yes | **no** | yes | yes | yes |
| two-digit valid? | – | `12` yes | `20` yes | `01` no | `12` yes | `27` **no** |
| `dp[i]` | 1 | 2 | 1 | 1 | 2 | **2** |

Two cells in full: `dp[3] = [0 ≠ 0]·dp[2] + [10 ≤ 20 ≤ 26]·dp[1] = 0·2 + 1·1 = 1`, and `dp[6] = [7 ≠ 0]·dp[5] + [10 ≤ 27 ≤ 26]·dp[4] = 1·2 + 0·1 = 2`. The two decodings are `1|20|1|2|7` and `1|20|12|7`. The table tells you exactly why zeros are dangerous: a `0` contributes nothing on its own and only survives if the digit before it is 1 or 2, and why `27` is harmless: the pair fails but the single digit `7` carries `dp[5]` forward.

```python
def num_decodings(s: str) -> int:
    n = len(s)
    dp = [0] * (n + 1)
    dp[0] = 1
    for i in range(1, n + 1):
        if s[i - 1] != '0':
            dp[i] += dp[i - 1]
        if i >= 2 and 10 <= int(s[i - 2:i]) <= 26:
            dp[i] += dp[i - 2]
    return dp[n]
```

The `dp[0] = 1` base is a common stumbling point. It is not "one way to decode nothing" in any physical sense; it is the value that makes the transition produce `dp[2] = 1` for `"12"`'s two-digit reading. When a base case feels arbitrary, check it by asking what the transition needs it to be.

## Why increasing order is enough: the invariant

Every 1-D DP in this lesson is proved the same way, with the loop [invariant](/learn/foundations/problem-solving/invariants-and-loop-reasoning):

**Invariant.** When the loop is about to compute `dp[i]`, every cell `dp[0..i-1]` holds the exact answer for its prefix (or amount).

- *Initially*: the base cells are set by hand and checked against the state sentence (`dp[0] = 1` decodings of the empty string; `dp[0] = 0` coins for amount 0; `prev2 = prev1 = 0` for house robber).
- *Preserved*: the transition for `dp[i]` reads only cells with a smaller index: `i-1` and `i-2` for house robber and decode ways, `a − c` with `c ≥ 1` for coin change. Increasing order therefore guarantees that every cell read is already final. The transition itself is exact because it partitions the objects being counted or optimised by their last decision (last house robbed or skipped; last coin; last code width) into disjoint, exhaustive cases, each a smaller instance of the same state.
- *At the end*: the invariant at `i = n` (or `a = amount`) says the last cell is the answer.

The one place the argument needs care is the coins-outer counting loop, whose inner loop reads `dp[a − c]` *from the current pass*. That is not a violation: the invariant for that loop is per pass ("multisets over the coins seen so far"), and reading the updated cell is exactly what lets a coin be reused. If the coins were use-once, the same read would be a bug, and the inner loop must run downwards so `dp[a − c]` is still the previous pass's value; that sweep-direction rule is the centre of the [knapsack lesson](/learn/algorithms/dynamic-programming/knapsack-family).

## The shape of every 1-D DP

Step back and look at the recurrences side by side:

| Problem | State `dp[i]` | Transition | Combine with |
|---|---|---|---|
| Climbing stairs | ways to reach `i` | `dp[i-1] + dp[i-2]` | sum |
| House robber | best from `0..i` | `max(dp[i-1], dp[i-2] + v[i])` | max |
| Coin change (min) | fewest coins for `a` | `1 + min_c dp[a-c]` | min |
| Coin change (count) | ways to make `a` | `sum_c dp[a-c]` | sum |
| Decode ways | decodings of prefix `i` | `dp[i-1]·[ok1] + dp[i-2]·[ok2]` | sum |

Counting problems combine with `+`; optimisation problems combine with `min`/`max`. The "last decision" in each is: the last step size, whether to rob the last house, the last coin, the last letter's width. If you can enumerate the possible last decisions and each leaves a smaller instance of the same problem, you have a 1-D DP, and the state is the size of the remaining instance.

When the last decision leaves something that is *not* a smaller instance of the same problem (for example, "best profit so far" depends on whether you currently hold a share), you need to add that information to the state, which is the topic of [sequence DP](/learn/algorithms/dynamic-programming/sequence-dp).

## Under the hood: integers, overflow and rolling variables

### JavaScript numbers above 2⁵³

A JavaScript `number` is an IEEE 754 double with a 53-bit significand, so every integer up to `Number.MAX_SAFE_INTEGER = 2⁵³ − 1 = 9,007,199,254,740,991` is exact and above it only every second integer exists, then every fourth. Counting DPs get there fast: climbing stairs gives `ways(n) = fib(n+1)`; `ways(77) = 8,944,394,323,791,464` is exact, but `ways(78) = 14,472,334,024,676,221` is odd and above `2⁵³`, and the double arithmetic returns `14,472,334,024,676,220`. Off by one, no exception, no warning, and `Number.isSafeInteger` is the only thing that would have told you. Decode ways on a string of 78 ones hits the same wall. Two fixes: reduce modulo a prime such as `10⁹ + 7` at every addition (the sum of two residues stays below `2 × 10⁹`, safe), or use `BigInt` (`1n`, `a + b`), accepting slower arithmetic (each value is a heap-allocated arbitrary-precision integer, not a double in a register) that cannot mix with `number`. A DP that *multiplies* residues needs `BigInt` even with the modulus, because `(10⁹ + 6)² ≈ 10¹⁸` is above `2⁵³`. [Numbers, strings and Unicode](/learn/foundations/how-code-runs/numbers-strings-unicode) has the bit layout.

### Python's arbitrary precision and its cost

Python ints never overflow: `ways(78)` is exact and `fib(1000)` (209 decimal digits, 694 bits) is a single object of 120 bytes, a 28-byte object holding the first 30-bit digit plus 4 bytes for each of the other 23 digits. The price is that addition is linear in the digit count, so a counting DP whose answers grow exponentially costs `O(n × digits)`, not `O(n)`: `fib(10⁵)` has about 20,900 digits, about 69,400 bits, so by then each add walks some 2,300 of CPython's 30-bit digits. When the problem hands you a modulus, use it; it keeps every cell a one-digit int (28 bytes, or a shared singleton for values in `-5..256`).

### Rolling variables

A `dp` list for `n = 10⁶` distinct values costs 36–40 MB in CPython (an 8-byte slot plus a 28-byte int object per cell, plus up to 12.5% list over-allocation), 8 MB as `array('q')`, and two ints as rolling variables, since every transition above reads at most two earlier cells. `prev2, prev1 = prev1, max(prev1, prev2 + x)` allocates no tuple: CPython compiles two- and three-target unpacking into stack operations, and the bytecode contains no `BUILD_TUPLE`. The order matters: the right-hand side is evaluated in full before either name is bound, so the `prev1` read inside `max` is the old value. Coin change cannot roll to `O(1)` because its transition reads `dp[a − c]` for every coin; it rolls to `O(max coin)` at best.

## Production and interview failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| The count is too large, by a factor that grows with the amount (5 instead of 3 for `[1, 2]`, amount 4) | The amount loop is outer, so each ordering of the same multiset is counted separately | Coins outer, amounts inner, upward |
| `coin_change([2], 3)` returns `0`; larger unreachable amounts return small positive numbers | `-1` sentinel read without a guard: `-1 + 1 = 0` wins the `min` and the zero propagates | Use `amount + 1` as the sentinel, or guard `dp[a-c] != -1` |
| `num_decodings` returns `0` for every input | `dp[0] = 0`, so the two-digit term never contributes and the single-digit term multiplies zeros forward | `dp[0] = 1`; check the base by asking what the transition needs |
| A JavaScript counting service is correct for small inputs and silently wrong for large ones; the wrong answers are always even | The count passed `2⁵³` and the double rounded | Reduce modulo a prime, or `BigInt`; assert `Number.isSafeInteger` in tests |
| Coin change times out and the process is killed for memory on `amount = 10⁹` | Pseudo-polynomial: one cell per unit of amount, 36 GB as a Python list, 8 GB as a typed array | Say "pseudo-polynomial" and renegotiate: bounded amounts, a canonical coin system (greedy), or a different formulation |
| House robber on a ring returns the linear answer, robbing both the first and the last house | The ring constraint is not in the state | Run the linear DP on `nums[0..n-2]` and `nums[1..n-1]` and take the max |

## Interviewer follow-ups

**"Why does swapping the two loops in Coin Change II change the answer?"** Model answer: each nesting keeps a different invariant; coins-outer builds each multiset in one canonical coin order, amount-outer sums over every possible last coin and so counts orderings. Common wrong answer: "it should not; addition is commutative", which confuses the order of additions with what is being added.

**"Why `amount + 1` rather than `float('inf')` for impossible amounts?"** Model answer: every coin is at least 1, so a real answer never exceeds `amount`; the sentinel can never win a `min`, `+ 1` on it cannot overflow, the array stays all-integer, and it serialises to JSON. Common wrong answer: "`inf` is safer because it is truly infinite", which ignores the mixed-type and JSON costs and is not more correct.

**"Your JavaScript counting DP must return an 18-digit number. What breaks?"** Model answer: doubles are exact only to `2⁵³ ≈ 9 × 10¹⁵`; use modular arithmetic if the problem gives a modulus, otherwise `BigInt`. Common wrong answer: "use `Math.round` / `parseInt`", which cannot restore bits that were never stored.

**"House robber, but the houses form a circle."** Model answer: the only new constraint is that houses 0 and `n-1` cannot both be robbed, so run the linear DP twice, excluding each end, and take the max. Common wrong answer: adding a wraparound term such as "`dp[n-1]` also reads `dp[0]`", which breaks the acyclic dependency order the proof relies on.

**"Can you make coin change `O(1)` memory like house robber?"** Model answer: no; the transition reads `dp[a − c]` for every coin, so you need at least the last `max(coins)` cells, a ring buffer of that size. Common wrong answer: "yes, keep two variables", which only works when the transition reads a fixed pair of offsets.

## What mid-level engineers get wrong

- **Nesting loops by habit.** Consequence: a combination count that is actually a permutation count, wrong by a factor that grows with the input and passes the smallest test.
- **Using `-1` for "impossible" and adding 1 to it.** Consequence: zero coins "make" unreachable amounts, and the zero poisons every larger cell that routes through it.
- **Hand-writing `n = 0` and `n = 1` cases.** Consequence: three branches instead of one transition, and an `IndexError` on the empty array the special cases forgot.
- **Reading `O(amount × coins)` as linear.** Consequence: proposing the DP for `amount = 10⁹` and discovering the 8–36 GB table in production.
- **Trusting `number` for counts in JavaScript.** Consequence: answers that are off by one above `2⁵³` with no error to catch.
- **Rolling to two variables before the array version works.** Consequence: no table to inspect when the answer is wrong, and no path to reconstruct when the interviewer asks which houses.

## Exercises

```exercise
id: house-robber
title: House robber
prompt: |
  `nums[i]` is the cash in house `i`. Return the maximum total you can take
  without robbing two adjacent houses. The array may be empty (return 0).

  Use the rolling two-variable form: O(n) time, O(1) extra space.
languages: [python, javascript]
entry: rob
starter:
  python: |
    def rob(nums):
        # prev2, prev1 = best up to i-2, best up to i-1
        return 0
  javascript: |
    function rob(nums) {
      // prev2, prev1 = best up to i-2, best up to i-1
      return 0;
    }
tests:
  - args: [[1, 2, 3, 1]]
    expected: 4
  - args: [[2, 7, 9, 3, 1]]
    expected: 12
  - args: [[]]
    expected: 0
    label: no houses
  - args: [[5]]
    expected: 5
    label: single house
  - args: [[2, 1, 1, 2]]
    expected: 4
    label: skip two in a row
  - args: [[6, 1, 1, 6, 1, 6]]
    expected: 18
    hidden: true
  - args: [[3, 5, 3]]
    expected: 6
    hidden: true
    label: greedy-by-largest fails here
  - args: [[1, 3, 1, 3, 100]]
    expected: 103
    hidden: true
hints:
  - "dp[i] = max(dp[i-1], dp[i-2] + nums[i]); start both rolling values at 0 so the first houses need no special case."
  - "For [2, 1, 1, 2] the answer skips two adjacent houses in the middle; the recurrence handles that because dp[i-1] can itself have skipped."
```

```exercise
id: decode-ways
title: Decode ways
prompt: |
  A non-empty string `s` of digits was produced by mapping letters to
  numbers `A=1 … Z=26` and concatenating. Return the number of distinct
  ways to decode it back to letters. `"06"` cannot be decoded (leading
  zeros are not valid codes) and yields 0.

  Define `dp[i]` as the number of decodings of the first `i` characters,
  with `dp[0] = 1`, and fill it left to right.
languages: [python, javascript]
entry: num_decodings
starter:
  python: |
    def num_decodings(s):
        # dp[0] = 1; consider one-digit and two-digit final codes
        return 0
  javascript: |
    function num_decodings(s) {
      // dp[0] = 1; consider one-digit and two-digit final codes
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
  - args: ["27"]
    expected: 1
    label: 27 is not a code
  - args: ["1111"]
    expected: 5
  - args: ["2101"]
    expected: 1
    hidden: true
  - args: ["1201234"]
    expected: 3
    hidden: true
hints:
  - "A single digit is a valid code only if it is not '0'. A two-digit code is valid only if it is between 10 and 26 inclusive."
  - "dp[i] = (s[i-1] != '0' ? dp[i-1] : 0) + (10 <= int(s[i-2:i]) <= 26 ? dp[i-2] : 0)."
```

## Senior signals

- You derive each transition by naming the **last decision** (last coin, rob-or-skip, one-or-two digits) and can say why the branches are disjoint and exhaustive.
- You can state the **invariant** ("`dp[i]` is the exact answer for the prefix of length `i`") and explain why increasing order guarantees every dependency is final.
- You pick **base values that make the transition produce the first cells**, so the code has no special cases for `n = 0` or `n = 1`.
- You know that **loop order changes meaning** in counting DPs (coins-outer counts combinations; amount-outer counts ordered sequences), you can fill both tables for a tiny input, and you say which one the problem wants before coding.
- You call coin change **pseudo-polynomial** and can explain why the DP is fine for `amount ≤ 10⁴` and useless for `10⁹`.
- You use an integer sentinel (`amount + 1`) rather than `inf` or `-1` for "impossible", and you can show the input on which unguarded `-1` returns 0.
- You know that JavaScript counts are exact only to `2⁵³` and reach for a modulus or `BigInt`, and that Python's big ints cost 4 bytes per 30-bit digit and linear-time additions.
- You reduce `O(n)` memory to `O(1)` with rolling variables **only after** the `O(n)` version is correct, and you can say which cells the transition reads to justify it.

## Check yourself

```quiz
- q: >-
    For coins = [1, 3, 4] and amount = 6, what does the minimum-coins DP return, and what does greedy "largest coin first" return?
  options: ["DP 3 (4 + 1 + 1); greedy 3 (4 + 1 + 1)", "DP 2 (3 + 3); greedy 2 (3 + 3)", "DP 2 (4 + 2); greedy 3 (4 + 1 + 1)", "DP 2 (3 + 3); greedy 3 (4 + 1 + 1)"]
  answer: 3
  explanation: >-
    dp[6] = 1 + min(dp[5], dp[3], dp[2]) = 1 + min(2, 1, 2) = 2 via coin 3 then coin 3. Greedy commits to the 4 and is left making 2 from ones. There is no coin 2, so 4 + 2 is not available, and the DP does not follow greedy: the 4 + 1 + 1 path is one of the candidates it considers (1 + dp[2] = 3), and it loses.
- q: >-
    You want the number of multisets of coins that make the amount (order does not matter). Which loop nesting is correct?
  options: ["Outer loop over coins, inner over amounts downwards", "Outer loop over amounts, inner loop over coins", "Outer loop over coins, inner loop over amounts", "Either nesting, since addition is commutative"]
  answer: 2
  explanation: >-
    With coins outermost the table means "ways using only the coins seen so far", so each multiset is built in one canonical order. Amount-outermost counts every ordering separately, so the nesting is not interchangeable. Downward iteration is the 0/1 (use-once) variant, which is a different problem.
- q: >-
    In house robber, why can the transition use dp[i-2] + nums[i] without checking what happened at house i-3?
  options: ["Because the optimum alternates houses, so i-3 is always skipped", "It cannot; a correct recurrence must also consult dp[i-3]", "Because dp[i-2] already covers houses 0..i-2, robbed or not", "Because house i-2 is always robbed whenever house i is robbed"]
  answer: 2
  explanation: >-
    The state definition is 'best from houses 0..i-2, whether or not house i-2 was robbed', so it already encodes the best compatible history. Robbing house i only forbids house i-1, and dp[i-2] is by definition the best of everything up to i-2, so nothing further back needs inspecting. Adding dp[i-3] is redundant, not required, and the optimum need not alternate (on [2, 1, 1, 2] it robs houses 0 and 3).
- q: >-
    num_decodings("100") returns what, and which transition rule produces it?
  options: ["1, since 100 is read as one three-digit letter code", "0, since neither 0 nor 00 is a valid code at the end", "2, via 1|00 and 10|0, since each split counts once", "1, via the two-digit code 10 followed by a single 0"]
  answer: 1
  explanation: >-
    dp[2] = 1 from '10'. At i = 3 the single digit '0' is invalid and the pair '00' is not in 10..26, so dp[3] = 0. The trailing 0 cannot stand alone, so '10' followed by '0' is not a decoding. Any string with a zero not preceded by 1 or 2 has no decoding.
- q: >-
    The coin change DP runs in O(amount × coins). An interviewer says amount can be up to 10¹². What do you say?
  options: ["Sort the coins, so the inner loop can stop at the first c > a", "Use memoisation, so that only reachable amounts are computed", "It still works, because the running time is linear in amount", "It is infeasible: pseudo-polynomial means 10¹² table cells"]
  answer: 3
  explanation: >-
    The table has one cell per unit of amount. Polynomial in the numeric value means exponential in the input's bit length, so "linear in amount" is exactly the problem; you need a different approach or a restriction on the coin system. Memoisation does not reduce the number of reachable states meaningfully here, and sorting does not change the count.
- q: >-
    A JavaScript climbing-stairs function returns 14472334024676220 for n = 78; the exact answer ends in 1. What happened, and what is the fix?
  options: ["The base cases were off by one; start from dp[0] = dp[1] = 1 rather than 0", "The value wrapped past 2^31; switch the table to a Float64Array", "The sum passed 2^53 and the double rounded; reduce modulo a prime or use BigInt", "The rolling variables were bound in the wrong order; compute the sum first"]
  answer: 2
  explanation: >-
    ways(78) = fib(79) = 14,472,334,024,676,221 is above Number.MAX_SAFE_INTEGER = 2^53 - 1, where doubles can represent only every second integer, so the odd answer rounds to its even neighbour with no error raised. A wrong base case would be wrong for every n, not only above 77; JavaScript numbers do not wrap at 2^31; and the two-target assignment evaluates its right-hand side before binding. Reduce modulo a prime at each addition, or use BigInt.
```
