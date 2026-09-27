---
slug: one-dimensional-dp
title: "One-dimensional DP: house robber, coin change, decode ways"
description: Derive the state and transition for the classic 1-D problems, watch each table fill, and learn the loop-order rule that separates counting combinations from counting permutations.
minutes: 45
difficulty: medium
tags: [dynamic-programming, 1d-dp, house-robber, coin-change, decode-ways]
problems: [house-robber, house-robber-ii, coin-change, coin-change-ii, decode-ways]
---
A row of houses holds cash: `[2, 7, 9, 3, 1]`. You may rob any subset, but robbing two adjacent houses trips the alarm. What is the most you can take? Greedy ("take the biggest, skip its neighbours") picks 9, then 2 and 1, for 12; here that happens to be right, but on `[3, 5, 3]` the same greedy takes the 5, which forbids both 3s, and ends with 5 while the optimum is 3 + 3 = 6. "Take every other house" fails on `[2, 1, 1, 2]` if you start at the wrong parity, and "take the house with the best value minus its neighbours" fails on longer chains. Every plausible local rule has a counterexample. The problem needs DP, and it is the cleanest possible introduction to one-dimensional state.

One-dimensional DP means the state is a single index into a sequence: "the best answer for the prefix ending at `i`" or "the number of ways to make amount `a`". This lesson derives three canonical recurrences, fills each table by hand, and covers the one subtlety, loop order, that produces wrong counts even when the recurrence is right.

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
| `dp[i-2] + nums[i]` | – | – | 2 + 9 = 11 | 7 + 3 = 10 | 11 + 1 = 12 |
| `dp[i-1]` | – | 2 | 7 | 11 | 11 |
| `dp[i]` | 2 | 7 | **11** | **11** | **12** |

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

`dp[6] = 2` via `dp[3] + 1`, that is, coin 3 then coin 3. The greedy path (4, then 1, then 1) is one of the candidates the DP considers, `1 + dp[2] = 3`, and it loses.

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

Time `O(amount × |coins|)`, space `O(amount)`. Using `amount + 1` as infinity instead of `float('inf')` keeps the array all-integer, which matters for speed in Python and for avoiding `Infinity` leaking into JSON in JavaScript.

Note the complexity is *pseudo-polynomial*: it is polynomial in the numeric value of `amount`, not in the number of bits needed to write it. For `amount = 10⁹` this DP is hopeless, which is exactly why the general problem is NP-hard while the DP is fine for the `amount ≤ 10⁴` an interviewer gives you. Saying "pseudo-polynomial" unprompted is a senior signal; the [knapsack lesson](/learn/algorithms/dynamic-programming/knapsack-family) returns to it.

## Counting ways: the loop-order rule

Change the question: *how many* ways are there to make the amount? Two versions exist, and they have different answers:

- **Combinations** (the usual "Coin Change II"): `{1, 3}` and `{3, 1}` are the same way. For `coins = [1, 2]`, `amount = 3`, there are 2 ways: `1+1+1` and `1+2`.
- **Ordered sequences** (like climbing stairs): `1+2` and `2+1` are different. Same input gives 3 ways.

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

Why does swapping the loops change the meaning? In `count_combinations`, when the outer loop is on coin `c`, the table holds "number of ways using only the coins considered so far". Adding coin `c` extends those ways in a fixed order (all 1s, then all 2s, …), so each multiset is built exactly once. In `count_ordered`, every amount considers every coin as the *last* coin, so each ordering is a distinct path through the table.

Trace `coins = [1, 2]`, `amount = 3` for combinations. After the `c = 1` pass: `dp = [1, 1, 1, 1]` (one way each, all ones). During the `c = 2` pass: `dp[2] += dp[0]` → 2; `dp[3] += dp[1]` → 2. Answer 2. For ordered: `dp[1] = dp[0] = 1`; `dp[2] = dp[1] + dp[0] = 2`; `dp[3] = dp[2] + dp[1] = 3`. Answer 3.

This is the single most common DP bug in interviews: right recurrence, wrong loop nesting, off by a factor that grows with the input. When you write a counting DP, say which version the problem wants and then say which loop is outer and why.

## Decode ways: a state with validity constraints

A string of digits encodes letters as `1 → A … 26 → Z`. Count the decodings of `"226"`: `2|2|6` (BBF), `22|6` (VF), `2|26` (BZ), so 3. Zeros complicate it: `"06"` has no decoding because `06` is not a valid code and `0` alone is not either; `"10"` has exactly one.

**State.** `dp[i]` = the number of ways to decode the prefix `s[0..i)` (the first `i` characters). `dp[0] = 1`: the empty prefix has one decoding, the empty one.

**Transition.** The last letter came from one digit or two:

$$dp[i] = \big[\,s[i-1] \ne 0\,\big]\cdot dp[i-1] \;+\; \big[\,10 \le s[i-2..i) \le 26\,\big]\cdot dp[i-2]$$

where `[·]` is 1 if the condition holds and 0 otherwise.

**Order.** Increasing `i`. **Answer.** `dp[n]`.

Trace `"1201234"`:

| `i` | 1 (`1`) | 2 (`2`) | 3 (`0`) | 4 (`1`) | 5 (`2`) | 6 (`3`) | 7 (`4`) |
|---|---|---|---|---|---|---|---|
| single digit valid? | yes | yes | **no** | yes | yes | yes | yes |
| two-digit valid? | – | `12` yes | `20` yes | `01` no | `12` yes | `23` yes | `34` no |
| `dp[i]` | 1 | 2 | 1 | 1 | 2 | 3 | **3** |

Read `dp[3]`: the `0` cannot stand alone, but `20` is valid, so `dp[3] = dp[1] = 1`. Read `dp[4]`: `1` alone is fine (`dp[3] = 1`), `01` is not, so 1. The table tells you exactly why zeros are dangerous: a `0` contributes nothing on its own and only survives if the digit before it is 1 or 2.

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

## The shape of every 1-D DP

Step back and look at the three recurrences side by side:

| Problem | State `dp[i]` | Transition | Combine with |
|---|---|---|---|
| Climbing stairs | ways to reach `i` | `dp[i-1] + dp[i-2]` | sum |
| House robber | best from `0..i` | `max(dp[i-1], dp[i-2] + v[i])` | max |
| Coin change (min) | fewest coins for `a` | `1 + min_c dp[a-c]` | min |
| Coin change (count) | ways to make `a` | `sum_c dp[a-c]` | sum |
| Decode ways | decodings of prefix `i` | `dp[i-1]·[ok1] + dp[i-2]·[ok2]` | sum |

Counting problems combine with `+`; optimisation problems combine with `min`/`max`. The "last decision" in each is: the last step size, whether to rob the last house, the last coin, the last letter's width. If you can enumerate the possible last decisions and each leaves a smaller instance of the same problem, you have a 1-D DP, and the state is the size of the remaining instance.

When the last decision leaves something that is *not* a smaller instance of the same problem (for example, "best profit so far" depends on whether you currently hold a share), you need to add that information to the state, which is the topic of [sequence DP](/learn/algorithms/dynamic-programming/sequence-dp).

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

- You derive each transition by naming the **last decision** (last coin, rob-or-skip, one-or-two digits) and can say why the branches are exhaustive.
- You pick **base values that make the transition produce the first cells**, so the code has no special cases for `n = 0` or `n = 1`.
- You know that **loop order changes meaning** in counting DPs (coins-outer counts combinations; amount-outer counts ordered sequences) and you say which one the problem wants before coding.
- You call coin change **pseudo-polynomial** and can explain why the DP is fine for `amount ≤ 10⁴` and useless for `10⁹`.
- You use an integer sentinel (`amount + 1`) rather than `inf` for "impossible", and you know why.
- You reduce `O(n)` memory to `O(1)` with rolling variables **only after** the `O(n)` version is correct, and you can say which cells the transition reads to justify it.

## Check yourself

```quiz
- q: >-
    For coins = [1, 3, 4] and amount = 6, what does the minimum-coins DP return, and what does greedy "largest coin first" return?
  options: ["DP 3 (4 + 1 + 1); greedy 3 (4 + 1 + 1)", "DP 2 (3 + 3); greedy 3 (4 + 1 + 1)", "DP 2 (4 + 2); greedy 3 (4 + 1 + 1)", "DP 2 (3 + 3); greedy 2 (3 + 3)"]
  answer: 1
  explanation: >-
    dp[6] = 1 + min(dp[5], dp[3], dp[2]) = 1 + min(2, 1, 2) = 2 via coin 3 then coin 3. Greedy commits to the 4 and is left making 2 from ones. There is no coin 2, so 4 + 2 is not available, and the DP does not follow greedy: the 4 + 1 + 1 path is one of the candidates it considers (1 + dp[2] = 3), and it loses.
- q: >-
    You want the number of multisets of coins that make the amount (order does not matter). Which loop nesting is correct?
  options: ["Outer loop over coins, inner over amounts downwards", "Outer loop over coins, inner loop over amounts", "Either nesting, since addition is commutative", "Outer loop over amounts, inner loop over coins"]
  answer: 1
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
  options: ["0, since neither 0 nor 00 is a valid code at the end", "1, via the two-digit code 10 followed by a single 0", "1, since 100 is read as one three-digit letter code", "2, via 1|00 and 10|0, since each split counts once"]
  answer: 0
  explanation: >-
    dp[2] = 1 from '10'. At i = 3 the single digit '0' is invalid and the pair '00' is not in 10..26, so dp[3] = 0. The trailing 0 cannot stand alone, so '10' followed by '0' is not a decoding. Any string with a zero not preceded by 1 or 2 has no decoding.
- q: >-
    The coin change DP runs in O(amount × coins). An interviewer says amount can be up to 10¹². What do you say?
  options: ["Use memoisation, so that only reachable amounts are computed", "Sort the coins, so the inner loop can stop at the first c > a", "It is infeasible: pseudo-polynomial means 10¹² table cells", "It still works, because the running time is linear in amount"]
  answer: 2
  explanation: >-
    The table has one cell per unit of amount. Polynomial in the numeric value means exponential in the input's bit length, so "linear in amount" is exactly the problem; you need a different approach or a restriction on the coin system. Memoisation does not reduce the number of reachable states meaningfully here, and sorting does not change the count.
```
