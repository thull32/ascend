---
slug: dp-patterns
title: "DP patterns: six state shapes that cover the interview canon"
description: Recognise the optimisation-or-count signal, classify the problem by its state shape (linear, two-sequence, knapsack, interval, grid, string-with-dictionary), and see Coin Change, Longest Common Subsequence, Word Break and House Robber II traced table by table.
minutes: 40
difficulty: hard
tags: [dynamic-programming, memoisation, tabulation, knapsack, lcs, state-design, pattern:dynamic-programming]
problems: [climbing-stairs, min-cost-climbing-stairs, house-robber, house-robber-ii, longest-palindromic-substring, palindromic-substrings, decode-ways, coin-change, max-product-subarray, word-break, longest-increasing-subsequence, partition-equal-subset, unique-paths, longest-common-subsequence, best-time-cooldown, coin-change-ii, target-sum, interleaving-string, edit-distance, burst-balloons, regular-expression-matching, distinct-subsequences, longest-increasing-path]
---
"Minimum number of coins." "How many ways." "Longest subsequence." "Can the array be split into two equal halves." Each is an optimisation or a count over an exponential set of choices, and each has a brute-force recursion that takes forever because it solves the same subproblem millions of times. The recursion for coins of amount 11 calls itself on amount 9 through three different first coins, and each of those calls amount 7 several ways, and so on. There are only 12 distinct amounts. Dynamic programming is the observation that if you store the answer for each distinct subproblem, the exponential tree collapses to a polynomial table.

The hard part of DP in an interview is not the table; it is naming the state. "What is the smallest description of a partial solution such that the rest of the problem depends only on that description?" Once you can say `dp[i]` means *the answer for the first `i` items* or `dp[i][j]` means *the answer for prefix `i` of A and prefix `j` of B*, the recurrence is usually one line and the code is ten. This lesson gives you the six state shapes that account for nearly every DP problem on the Ascend 150 and the signal that tells you which one you are looking at.

## The signal

Reach for DP when the statement contains a **superlative or a count** ("minimum", "maximum", "longest", "fewest", "number of ways", "is it possible") *and* the choices overlap: making a choice leaves a smaller instance of the same problem, and different choice sequences lead to the same smaller instance. Then classify by state shape:

| shape | signal in the statement | state | canonical problems |
|---|---|---|---|
| **Linear** | one sequence, answer for a prefix depends on a few previous positions | `dp[i]` | [Climbing Stairs](/practice/climbing-stairs), [House Robber](/practice/house-robber), [Decode Ways](/practice/decode-ways), [Max Product Subarray](/practice/max-product-subarray) |
| **Unbounded / bounded choice over a target** | "coins", "sum to target", "fill capacity", "subset with sum" | `dp[amount]` or `dp[i][amount]` | [Coin Change](/practice/coin-change), [Coin Change II](/practice/coin-change-ii), [Partition Equal Subset](/practice/partition-equal-subset), [Target Sum](/practice/target-sum) |
| **Two sequences** | two strings or arrays compared or aligned | `dp[i][j]` = answer for prefixes | [Longest Common Subsequence](/practice/longest-common-subsequence), [Edit Distance](/practice/edit-distance), [Distinct Subsequences](/practice/distinct-subsequences), [Interleaving String](/practice/interleaving-string), [Regular Expression Matching](/practice/regular-expression-matching) |
| **Grid** | paths through a matrix moving right/down, or the best value ending at a cell | `dp[r][c]` | [Unique Paths](/practice/unique-paths), [Longest Increasing Path](/practice/longest-increasing-path) |
| **Interval** | "substring", "subarray defined by both ends", "pop/burst/remove one and the neighbours join" | `dp[i][j]` = answer for range `i..j` | [Longest Palindromic Substring](/practice/longest-palindromic-substring), [Palindromic Substrings](/practice/palindromic-substrings), [Burst Balloons](/practice/burst-balloons) |
| **Sequence with a dictionary or subsequence choice** | "can be segmented", "longest increasing", the transition scans back over earlier positions | `dp[i]` with an `O(i)` transition | [Word Break](/practice/word-break), [Longest Increasing Subsequence](/practice/longest-increasing-subsequence) |

A seventh shape, **state machine**, is a linear DP with a small set of modes per position ("holding a stock / not holding / cooling down"): [Best Time with Cooldown](/practice/best-time-cooldown). It is worth naming because "how many variables per position" is exactly the question that makes it click.

What rules it out:

- **You need every solution, not the best or the count.** Memoisation does not reduce output size. That is [Backtracking](/learn/interview-patterns/combinatorial-patterns/backtracking-pattern).
- **A local rule is provably optimal** (activity selection, jump game): [Greedy](/learn/interview-patterns/combinatorial-patterns/greedy-pattern) in `O(n)` beats DP in `O(n²)`. The test is whether an exchange argument exists; if you cannot state one in a sentence, DP is safer.
- **No overlap.** If each subproblem is reached exactly once, memoising adds memory for nothing; plain recursion or divide and conquer is the answer.
- **The state would have to include the whole history** (which elements were used, in what order). Then the state space is exponential and DP does not help; look for a different decomposition or accept the exponential.

## The template

Top-down (memoised recursion) is the fastest to write and reason about: write the brute-force recursion, then cache it. Bottom-up (tabulation) is what you write when the recursion depth would be a problem or when you want to squeeze memory. Either is acceptable in an interview if you can state the state, the recurrence, the base case and the order.

```python
from functools import lru_cache

def top_down(items, target):
    @lru_cache(maxsize=None)
    def f(i, remaining):                      # state: (index, what is left)
        if remaining == 0:
            return 0                          # base: nothing left to do
        if i == len(items) or remaining < 0:
            return float("inf")               # base: impossible
        take = 1 + f(i, remaining - items[i]) # choice 1 (unbounded reuse)
        skip = f(i + 1, remaining)            # choice 2
        return min(take, skip)
    return f(0, target)


def bottom_up(items, target):
    INF = float("inf")
    dp = [0] + [INF] * target                 # dp[a] = best for amount a
    for a in range(1, target + 1):
        for x in items:
            if x <= a and dp[a - x] + 1 < dp[a]:
                dp[a] = dp[a - x] + 1
    return dp[target]
```

```javascript
function topDown(items, target) {
  const memo = new Map();
  function f(i, remaining) {
    if (remaining === 0) return 0;
    if (i === items.length || remaining < 0) return Infinity;
    const key = i * (target + 1) + remaining;   // pack the state into one number
    if (memo.has(key)) return memo.get(key);
    const take = 1 + f(i, remaining - items[i]);
    const skip = f(i + 1, remaining);
    const best = Math.min(take, skip);
    memo.set(key, best);
    return best;
  }
  return f(0, target);
}

function bottomUp(items, target) {
  const dp = new Array(target + 1).fill(Infinity);
  dp[0] = 0;
  for (let a = 1; a <= target; a++)
    for (const x of items)
      if (x <= a && dp[a - x] + 1 < dp[a]) dp[a] = dp[a - x] + 1;
  return dp[target];
}
```

The four things to say before writing any DP, in order:

1. **State**: what `dp[...]` means, in a full sentence with the word "exactly" or "at most" in it. "`dp[a]` is the minimum number of coins that sum to exactly `a`."
2. **Recurrence**: how a state is computed from smaller states, and which choice each term represents.
3. **Base cases**: the states with no choices, and the sentinel for impossible (`inf` for minimisation, `0` for counting, `False` for feasibility).
4. **Order and answer**: which state is the answer and what order guarantees its dependencies are filled first.

Complexity is the number of states times the cost of the transition. Say both factors: "`O(amount)` states, each scanning `O(coins)` options: `O(amount · coins)`."

Watch the coin-change table fill and see the repeated subproblems disappear:

```viz
{"type": "dp", "algorithm": "coin-change", "coins": [1, 2, 5], "amount": 11, "title": "Coin Change bottom-up", "caption": "dp[a] is the fewest coins for exactly a; each cell looks back one coin value for each coin."}
```

## Worked problems

### Coin Change

[Coin Change](/practice/coin-change): fewest coins to make `amount` with unlimited coins of the given denominations; −1 if impossible.

State: `dp[a]` = fewest coins summing to exactly `a`. Recurrence: `dp[a] = 1 + min(dp[a − c] for c in coins if c ≤ a)`. Base: `dp[0] = 0`; unreachable amounts stay `inf`. Order: increasing `a`. Answer: `dp[amount]` or −1.

Trace with `coins = [1, 2, 5]`, `amount = 11`:

| `a` | candidates `dp[a − c] + 1` | `dp[a]` |
|---|---|---|
| 0 | | 0 |
| 1 | dp[0]+1 = 1 | 1 |
| 2 | dp[1]+1 = 2, dp[0]+1 = 1 | 1 |
| 3 | dp[2]+1 = 2, dp[1]+1 = 2 | 2 |
| 4 | dp[3]+1 = 3, dp[2]+1 = 2 | 2 |
| 5 | dp[4]+1 = 3, dp[3]+1 = 3, dp[0]+1 = 1 | 1 |
| 6 | dp[5]+1 = 2, dp[4]+1 = 3, dp[1]+1 = 2 | 2 |
| 7 | dp[6]+1 = 3, dp[5]+1 = 2, dp[2]+1 = 2 | 2 |
| 8 | dp[7]+1 = 3, dp[6]+1 = 3, dp[3]+1 = 3 | 3 |
| 9 | dp[8]+1 = 4, dp[7]+1 = 3, dp[4]+1 = 3 | 3 |
| 10 | dp[9]+1 = 4, dp[8]+1 = 4, dp[5]+1 = 2 | 2 |
| 11 | dp[10]+1 = 3, dp[9]+1 = 4, dp[6]+1 = 3 | 3 |

Answer 3 (5 + 5 + 1). `O(amount · coins)` time, `O(amount)` space. Greedy (take the largest coin that fits) gives 5 + 5 + 1 = 3 here too, but on `coins = [1, 3, 4]`, `amount = 6` greedy gives 4 + 1 + 1 = 3 coins while DP gives 3 + 3 = 2. That counterexample is the standard answer to "why not greedy".

The counting version, [Coin Change II](/practice/coin-change-ii), has the same table with `+` instead of `min` and one crucial change: the coin loop goes *outside* the amount loop, so that each combination is counted once in a fixed coin order rather than once per permutation. Say this without being asked; it is the most common DP follow-up in this family.

### Longest Common Subsequence

[Longest Common Subsequence](/practice/longest-common-subsequence): the length of the longest sequence that appears in both strings in order (not necessarily contiguously).

State: `dp[i][j]` = LCS length of `a[:i]` and `b[:j]`. Recurrence: if `a[i−1] == b[j−1]` then `dp[i−1][j−1] + 1` (match the last characters), else `max(dp[i−1][j], dp[i][j−1])` (drop one of them). Base: `dp[0][*] = dp[*][0] = 0`. Order: row by row. Answer: `dp[m][n]`.

```python
def lcs(a, b):
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[m][n]
```

Trace with `a = "abcde"`, `b = "ace"` (rows are prefixes of `a`, columns prefixes of `b`):

| | `""` | `a` | `ac` | `ace` |
|---|---|---|---|---|
| `""` | 0 | 0 | 0 | 0 |
| `a` | 0 | **1** | 1 | 1 |
| `ab` | 0 | 1 | 1 | 1 |
| `abc` | 0 | 1 | **2** | 2 |
| `abcd` | 0 | 1 | 2 | 2 |
| `abcde` | 0 | 1 | 2 | **3** |

The bold cells are matches (`a`, `c`, `e`); every other cell copies the larger of the cell above or to the left. Answer 3. `O(m·n)` time; space `O(m·n)`, or `O(min(m, n))` with two rows since each row depends only on the previous one. To *reconstruct* the subsequence, walk back from `dp[m][n]`: on a match go diagonally and record the character; otherwise go to whichever neighbour holds the same value.

[Edit Distance](/practice/edit-distance) is the same grid with three terms (`insert`, `delete`, `replace`) and a base row that counts up instead of zeros. [Distinct Subsequences](/practice/distinct-subsequences) and [Interleaving String](/practice/interleaving-string) are the same grid with different recurrences. Once you can say "two sequences, prefixes as state", the rest is filling in the three-way choice.

```viz
{"type": "dp", "algorithm": "lcs", "a": "abcde", "b": "ace", "title": "LCS table", "caption": "A match extends the diagonal; a mismatch takes the better of dropping a character from either string."}
```

### Word Break

[Word Break](/practice/word-break): can `s` be split into a sequence of dictionary words?

State: `dp[i]` = can `s[:i]` be segmented. Recurrence: `dp[i]` is true if there is a `j < i` with `dp[j]` true and `s[j:i]` in the dictionary. Base: `dp[0] = True` (the empty prefix). Order: increasing `i`. Answer: `dp[n]`.

```python
def word_break(s, word_dict):
    words = set(word_dict)
    max_len = max(map(len, words), default=0)
    dp = [True] + [False] * len(s)
    for i in range(1, len(s) + 1):
        for j in range(max(0, i - max_len), i):     # only look back as far as the longest word
            if dp[j] and s[j:i] in words:
                dp[i] = True
                break
    return dp[len(s)]
```

Trace with `s = "leetcode"`, `dict = ["leet", "code"]`, `max_len = 4`:

| `i` | `s[:i]` | `j` values tried (with `dp[j]` true) | `s[j:i]` in dict? | `dp[i]` |
|---|---|---|---|---|
| 1 | l | 0 | "l" no | F |
| 2 | le | 0 | "le" no | F |
| 3 | lee | 0 | "lee" no | F |
| 4 | leet | 0 | "leet" **yes** | T |
| 5 | leetc | 1, 2, 3, 4 → only 4 has `dp` true | "c" no | F |
| 6 | leetco | 4 | "co" no | F |
| 7 | leetcod | 4 | "cod" no | F |
| 8 | leetcode | 4 | "code" **yes** | T |

Answer true. `O(n · max_len)` substring checks, each `O(max_len)` for the hash. Without the `max_len` bound the inner loop is `O(n)` and the total `O(n²)` substring operations, which is still accepted but shows less care. The follow-up "return all segmentations" switches to backtracking with this table as the prune (only recurse into `j` where `dp[j]` is true).

### House Robber II

[House Robber II](/practice/house-robber-ii): houses in a circle, adjacent houses cannot both be robbed, maximise the take.

The linear version's state is `dp[i]` = best take from the first `i` houses, recurrence `max(dp[i−1], dp[i−2] + nums[i−1])`, which collapses to two variables. The circle adds one constraint: house 0 and house `n−1` are adjacent. Rather than a new state, run the linear DP twice, once excluding the first house and once excluding the last, and take the better. Either the optimal solution skips house 0 (then it is a linear problem on `1..n−1`) or it skips house `n−1` (linear on `0..n−2`); it cannot take both.

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

Trace `rob_line` on `[2, 3, 2]` minus the last house, `[2, 3]`: `(prev, cur)` goes `(0,0) → (0,2) → (2,3)`, result 3. Minus the first, `[3, 2]`: `(0,0) → (0,3) → (3,3)`, result 3. Answer 3. On `[1, 2, 3, 1]`: `[2, 3, 1]` gives `(0,0) → (0,2) → (2,3) → (3,3)`: 3; `[1, 2, 3]` gives `(0,0) → (0,1) → (1,2) → (2,4)`: 4. Answer 4.

The lesson here is a general move: when one extra constraint links the ends of a linear structure, *case-split on the constraint* and reuse the linear solution rather than inventing a bigger state.

## Variations

- **Space optimisation**: linear DPs with a look-back of `k` need `k` variables; two-sequence DPs need two rows (or one row updated right-to-left for 0/1 knapsack). Say the full-table version first, then optimise if asked.
- **0/1 versus unbounded knapsack**: iterate amounts *downward* for 0/1 (each item once), *upward* for unbounded. [Partition Equal Subset](/practice/partition-equal-subset) is 0/1 with a boolean table and target `sum / 2`; [Target Sum](/practice/target-sum) reduces to counting subsets with sum `(total + S) / 2`.
- **Counting versus optimising**: same table, `+` instead of `min`/`max`, base `1` instead of `0`. Loop order matters for counting combinations versus permutations.
- **Interval DP**: fill by increasing length `len = 2..n`, then by start `i`, with `j = i + len − 1`, and the transition picks a split point or the *last* element removed ([Burst Balloons](/practice/burst-balloons): "which balloon bursts last in `(i, j)`" is the trick that makes the subproblems independent).
- **LIS in `O(n log n)`** ([Longest Increasing Subsequence](/practice/longest-increasing-subsequence)): the `O(n²)` DP is the baseline; the patience-sorting array with binary search is the follow-up. Say both.
- **DP on a DAG / grid with memoised DFS** ([Longest Increasing Path](/practice/longest-increasing-path)): no natural fill order, so memoise the recursion; the strictly increasing condition guarantees no cycles.
- **State machine DP** ([Best Time with Cooldown](/practice/best-time-cooldown)): `hold`, `sold`, `rest` per day, three transitions. Draw the three-node diagram before writing code.
- **Regex and wildcard matching**: two-sequence DP where `*` produces a two-way choice (match zero, or consume one and stay); write the recurrence for `p[j−1] == '*'` separately and test on `("aa", "a*")` and `("ab", ".*")`.
- **Reconstruction**: keep a `choice` table or walk back through the recurrence.

## Pitfalls

- **A state that is not a full description.** If `dp[i]` "means the best so far" without saying whether element `i` is included, the recurrence will be wrong somewhere. Write the sentence.
- **Wrong sentinel.** `0` as "impossible" in a minimisation collides with a real answer of 0. Use `inf`, `-1` with explicit checks, or `None`.
- **Base case off by one.** `dp[0]` for the empty prefix is the base in nearly every string/sequence DP; sizing the table `n` instead of `n + 1` loses it.
- **Wrong loop nesting for counting.** Coin Change II with amounts outside and coins inside counts permutations (`1+2` and `2+1` separately).
- **Wrong direction for 0/1 knapsack.** Iterating amounts upward with a single row lets an item be used twice.
- **Recursion depth in top-down.** `lru_cache` on a state of depth 10⁴ overflows Python's stack. Either raise the limit or switch to bottom-up.
- **Slicing inside the loop.** `s[j:i] in words` is fine; `dp(s[i:])` with string slices as memo keys costs `O(n)` per key and `O(n²)` memory. Use indices.
- **Forgetting the greedy counterexample.** If you propose greedy for coins, be ready with `[1, 3, 4]` and amount 6.
- **`max_len` bound with an empty dictionary.** `max()` on an empty sequence raises; use `default=0`.
- **Optimising space before correctness.** Get the full table right, then collapse rows. Interviewers would rather see `O(m·n)` space and a correct answer than a clever one-row update with an off-by-one.

## Exercise

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

## Senior signals

- You **state the state in a sentence** before writing code, and the sentence says what the index means and whether the answer is "exactly" or "at most".
- You classify by **state shape** ("two sequences, prefixes as state") and can name three problems with the same shape, which tells the interviewer you will finish.
- You give the **greedy counterexample** for coins from memory and the general test (exchange argument exists or not).
- You know the **loop-order and direction rules** for counting combinations versus permutations and for 0/1 versus unbounded knapsack, and explain them by what each order allows.
- You write the **full table first** and then collapse it, stating the dependency that makes the collapse valid.
- You recognise **case-splitting** (House Robber II) and **"last element removed"** (Burst Balloons) as the two moves that turn a stuck DP into a standard one.
- You quote complexity as **states × transition** and can say which factor a follow-up would attack (LIS to `O(n log n)`, Word Break with the `max_len` bound).

## Check yourself

```quiz
- q: >-
    Coin Change II (count combinations) with coins [1, 2] and amount 3. Looping amounts outside and coins inside gives:
  options: ["2, which is the correct count", "1, since only 1+1+1 is found", "4, since 1+1+1 is counted twice", "3, since 1+2 and 2+1 both count"]
  answer: 3
  explanation: >-
    With amounts outermost, every ordering of the same multiset of coins reaches the amount by a different path and is added separately, so 1+1+1, 1+2 and 2+1 give 3. Putting the coin loop outermost fixes the coin order and counts each multiset once, giving the correct 2.
- q: >-
    Which statement of the DP state for Longest Common Subsequence is complete enough to derive the recurrence?
  options: ["dp[i] is the length of the LCS that ends at index i", "dp[i][j] is 1 if A[i] equals B[j], and 0 otherwise", "dp[i][j] is the LCS length of A[:i] and B[:j]", "dp[i][j] is the best answer found so far in the table"]
  answer: 2
  explanation: >-
    The state must describe a subproblem fully: which prefixes (the first i characters of A and the first j of B), and what quantity. From that sentence the two cases (last characters match or not) follow directly. The other options are vague, omit the second string, or describe a different problem.
- q: >-
    A 0/1 knapsack solution uses a single dp row and iterates capacities from 0 upward. What is the effect?
  options: ["It fails only when some item has a weight of exactly 1", "An item can be reused: dp[c - w] may already hold it", "It is still correct, and faster than iterating downward", "It undercounts, since each capacity is only read once"]
  answer: 1
  explanation: >-
    Upward iteration reads a cell updated in the same pass for the same item, which is the unbounded-knapsack behaviour. Capacities must be iterated downward for 0/1, so that each read sees only values from before this item was considered.
- q: >-
    Why does House Robber II run the linear solution twice rather than add a dimension to the state?
  options: ["Only the end houses conflict; an optimum skips one", "Because the array is too short to justify a 2D table", "Because DP cannot be applied to circular arrays at all", "Because the second run corrects errors left by the first"]
  answer: 0
  explanation: >-
    The circular constraint only links house 0 and house n-1, so any optimal solution omits at least one of them, and the answer is the better of two linear instances that each exclude one end. Case-splitting on the one constraint that breaks linearity reuses the existing solution. Adding a took-house-0 flag to the state also works but is more code for the same complexity.
- q: >-
    Word Break on a 10,000-character string with a dictionary whose longest word has 10 letters. What does bounding the inner loop by the longest word length change?
  options: ["It removes the need for the dp table altogether", "Substring checks drop from about n²/2 to about 10n", "It gives wrong answers for words longer than 10 letters", "Nothing, since the hash lookups dominate the cost anyway"]
  answer: 1
  explanation: >-
    No dictionary word can span more than L characters, so any split point further back than L cannot end a word at i. The bound is safe, each check is at most 10 characters, and it turns O(n^2) substring checks into O(n * L).
- q: >-
    The interviewer asks for the longest increasing subsequence on 100,000 elements after you wrote the O(n^2) DP. What is the expected follow-up answer?
  options: ["It cannot be done faster than O(n²) by any method", "Use a heap of the current tails for O(n log n)", "Sort the array first, then scan it once for runs", "Keep sorted tails and binary search into them"]
  answer: 3
  explanation: >-
    tails[k] is the smallest possible tail of an increasing subsequence of length k+1. Each element replaces the first tail not smaller than it, found by binary search because tails stays sorted, giving O(n log n); the final length of tails is the LIS length. It does not directly give the subsequence itself, which needs an extra predecessor array.
```
