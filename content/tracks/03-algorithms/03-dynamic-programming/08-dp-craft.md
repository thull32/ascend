---
slug: dp-craft
title: "DP craft: reconstruction, memory, disguises and when DP is wrong"
description: Recover the actual solution from a table, cut memory without losing correctness, spot DP in problems that do not announce themselves, debug a wrong table, and recognise the cases where DP is the wrong tool.
minutes: 45
difficulty: hard
tags: [dynamic-programming, reconstruction, space-optimisation, debugging, word-break, catalan]
problems: [word-break, longest-palindromic-substring, coin-change, distinct-subsequences, interleaving-string]
---
Your coin-change DP says the answer is 3 coins. The interviewer nods and asks "which coins?" The table holds counts, not choices, and the candidate who has only ever returned `dp[amount]` now has to improvise. Then: "your table is `n × m` and `n` is a million; can you do better?" And finally: "is DP even the right approach here, or is there something simpler?" Those three follow-ups are how a senior interviewer separates a candidate who has memorised recurrences from one who understands the technique. This lesson is about the craft that answers them.

## Reconstructing the solution

A DP table stores the *value* of the best solution at each state. To recover the solution itself you need to know, for each state, which transition produced its value. Two strategies.

**Parent pointers.** Alongside `dp`, keep `choice[state]` recording the winning option. Coin change: `choice[a]` = the last coin used to reach `dp[a]`. Reconstruct by walking `amount → amount − choice[amount] → …` until 0. Costs memory equal to the table, and the choice must be recorded at the moment the `min`/`max` is decided.

**Recomputation.** Store nothing extra. From the final state, re-run the transition's candidates and step to whichever one reproduces the stored value. Coin change: from `a`, find any coin `c` with `dp[a − c] == dp[a] − 1` and step to `a − c`. Costs an extra pass with the same per-state work as the fill, and it only works if the full table is still in memory.

```python
def coin_change_with_coins(coins: list[int], amount: int) -> list[int]:
    INF = amount + 1
    dp = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and dp[a - c] + 1 < dp[a]:
                dp[a] = dp[a - c] + 1
    if dp[amount] > amount:
        return []
    used, a = [], amount
    while a > 0:
        for c in coins:                      # recomputation: find a coin that explains dp[a]
            if c <= a and dp[a - c] == dp[a] - 1:
                used.append(c)
                a -= c
                break
    return sorted(used)
```

Trace `coins = [1, 3, 4]`, `amount = 6`: the table is `[0, 1, 2, 1, 1, 2, 2]`. From 6 (`dp = 2`): coin 1 → `dp[5] = 2`, no; coin 3 → `dp[3] = 1`, yes, take 3, go to 3. From 3: coin 1 → `dp[2] = 2`, no; coin 3 → `dp[0] = 0`, yes. Result `[3, 3]`.

For LCS, the walk goes from `(m, n)`: on a character match, emit it and step diagonally; otherwise step to whichever of `(i−1, j)` and `(i, j−1)` holds the larger value. The emitted characters come out in reverse. When both neighbours tie, either choice yields a valid LCS; if the problem wants a specific one (lexicographically smallest, say), the tie-break has to be designed, not left to chance.

```viz
{"type": "dp", "algorithm": "lcs", "a": "AGGTAB", "b": "GXTXAYB", "title": "Reconstruction walks the table backwards from the answer cell", "caption": "Diagonal steps on matches emit characters; on mismatches move toward the larger neighbour."}
```

The general rule: **reconstruction is the fill, run in reverse**. If you can state the transition, you can state the walk-back.

## Memory optimisation without losing correctness

The rolling-row trick from [grid DP](/learn/algorithms/dynamic-programming/grid-and-two-dimensional-dp) and the sweep-direction rule from [knapsack](/learn/algorithms/dynamic-programming/knapsack-family) both rest on one question: **which earlier states does the transition read?** If it reads only row `i−1`, keep two rows (or one, with the right sweep). If it reads `i−1` and `i−2`, keep three. If it reads an arbitrary earlier state (LIS reads all `j < i`), the full table stays.

Two subtler techniques come up at the senior level.

**Reconstruction with rolled rows: Hirschberg's trick.** Rolling rows destroys the table, so the walk-back is impossible... unless you divide and conquer. For LCS, compute the DP forward on the first half of `a` (rolled, `O(n)` memory) and backward on the second half, find the split point in `b` that maximises `forward[j] + backward[j]`, and recurse on the two halves. Total time stays `O(mn)`, memory drops to `O(m + n)`, and you get the actual subsequence. This is what `diff` implementations use on large files; naming it when the interviewer pushes on memory is a strong signal.

**Bitsets.** A boolean DP row (subset sum) of `target + 1` cells is `target + 1` bits. Python integers are arbitrary-precision, so `reach |= reach << x` updates the entire row in one operation that runs at machine-word speed:

```python
def can_partition(nums: list[int]) -> bool:
    total = sum(nums)
    if total % 2:
        return False
    reach = 1                               # bit c set <=> sum c is reachable
    for x in nums:
        reach |= reach << x
    return (reach >> (total // 2)) & 1 == 1
```

Same recurrence, same downward-sweep semantics (the shift reads the *old* bits), roughly 60× fewer operations. The technique generalises to any boolean DP whose transition is a shift and an OR.

**Compressing the state space.** Sometimes the state is bigger than it needs to be. Edit distance with a bound `k` only needs the band `|i − j| ≤ k`. Stock with `k` transactions where `k ≥ n / 2` degenerates to unlimited transactions. Detecting these is part of designing the state, not an afterthought.

## DP in disguise

Some of the most-asked DP problems do not say "count" or "minimum" and are missed as a result. The tells are subtler.

**Word break.** "Can `s` be segmented into dictionary words?" There is no optimisation and no count, but there *is* a prefix state: `dp[i]` = the prefix `s[0..i)` can be segmented. Transition: some word ends at `i`, and the prefix before it was segmentable: `dp[i] = any(dp[j] and s[j..i) in words for j < i)`. `O(n²)` prefix checks, or `O(n · L)` if you only try `j = i − len(word)` for each word.

```viz
{"type": "dp", "algorithm": "word-break", "s": "catsanddog", "words": ["cat", "cats", "and", "sand", "dog"], "title": "Word break: dp[i] = some dictionary word ends at i and the prefix before it is breakable", "caption": "A yes/no question with a prefix state is still DP. The table is a row of booleans."}
```

**Counting structures: Catalan numbers.** "How many structurally distinct BSTs hold keys 1..n?" Fix the root `r`; the left subtree is any BST on `r − 1` keys and the right is any BST on `n − r` keys: `dp[n] = Σᵣ dp[r−1] · dp[n−r]`. That is the Catalan recurrence, and it also counts balanced parenthesis strings, triangulations and binary-tree shapes. The tell is "choose a root/pivot and the two sides are independent instances".

**Paths in a DAG.** "How many ways to get from A to B" or "longest path" in a graph with no cycles is DP over a topological order: `paths[v] = Σ paths[u]` over predecessors. Unique paths on a grid is this with the grid as an implicit DAG. Longest path in a general graph is NP-hard; the acyclicity is what makes the DP valid.

**Longest valid parentheses.** `dp[i]` = length of the longest valid substring *ending at* `i`. If `s[i] = ')'` and the character before the matched-run `s[i − dp[i−1] − 1]` is `'('`, then `dp[i] = dp[i−1] + 2 + dp[i − dp[i−1] − 2]`. Ugly, but it is the "ends at `i`" pattern from [sequence DP](/learn/algorithms/dynamic-programming/sequence-dp), and a stack solves it too.

**Probability and expectation.** "Expected number of dice rolls to reach 100" or "probability the knight stays on the board after `k` moves" are DP with real-valued cells: the state is the position and remaining moves, the transition averages over outcomes. Interviewers use these to check whether you see past the integer-valued examples.

**Digit DP** (senior-level tail): "how many integers in `[1, N]` have digit sum 20" is a DP over the digits of `N` with state (position, tight-to-`N`, accumulated property). Rare in interviews, common in competitive programming; knowing the name is enough.

The shared tell across all of these: an exponential search over choices where the *future depends on a small summary of the past*. When you notice yourself writing a recursive search, ask what its arguments are and how many distinct combinations exist. If the count is polynomial, memoise.

## When DP is the wrong tool

DP is not always right, and saying so at the right moment is worth more than any recurrence.

**A greedy choice is provably safe.** Interval scheduling by earliest end, fractional knapsack by density, Huffman merging: DP would also work (`O(n²)` interval DP for scheduling) and would be strictly worse. If you can write an exchange argument, use it. [Greedy and exchange arguments](/learn/algorithms/greedy/greedy-and-exchange-arguments) covers the test.

**The state space is too big.** DP on subsets is `2ⁿ`; DP whose state must include the path taken is `n!`. When `n = 100` and the state is a subset, no memoisation saves you; the problem is NP-hard and the interviewer wants branch-and-bound, a heuristic, or a discussion of why exact is infeasible. Recognising this in the first two minutes, rather than after writing a recurrence, is the senior move.

**There is a closed form or a simpler structure.** Fibonacci has a matrix-power `O(log n)` solution; unique paths without obstacles is `C(m+n−2, m−1)`; the number of subarrays with sum `k` is a prefix-sum hash map, not a table. If the DP transition only ever reads `dp[i−1]` and is a fixed linear function, the "DP" is just a loop and calling it DP overstates it.

**Subproblems do not overlap.** Merge sort and quicksort have the recursive structure but no reuse. Memoising them costs memory and hashing for zero hits.

**The data is streaming or too large for a table.** If `n = 10⁹` items arrive one at a time and the DP would need `O(n)` states, you need a sketch, a sliding window, or a different question.

A useful sentence in an interview: "This has optimal substructure, and I think the subproblems overlap, so DP is a candidate; but let me check whether a greedy choice is safe first, because that would be `O(n log n)` instead of `O(n²)`."

## Debugging a wrong table

When a DP gives the wrong answer, the bug is almost always in one of four places. Check them in this order.

1. **State semantics.** Is `dp[i]` about the first `i` elements (half-open) or about index `i` (closed)? Half-open prefixes give an all-zero border with no special cases; mixing the two conventions inside one solution is the most common off-by-one.
2. **Base cases.** Does the transition produce the first real cell from the bases you set? `dp[0] = 1` in decode ways and coin-change counting is not a statement about the world; it is the value that makes `dp[1]` right. Check by computing `dp[1]` by hand.
3. **Fill order.** Does every state the transition reads exist when it is read? Interval DP by row instead of by length, knapsack sweeping the wrong way, LIS with `j > i`: each reads garbage silently.
4. **The answer cell.** `dp[n]` versus `max(dp)` versus `dp[0][n+1]`; LIS and maximum subarray need the max; padded tables shift the answer index.

The tool for all four is the same: **fill a 5-cell table by hand** for a tiny input and compare it with what the code produces. Print the table. Candidates who trace a small example before running the code find these bugs in a minute; candidates who run and stare find them in ten.

## Performance notes from production

A DP that is correct and `O(nm)` can still be too slow if `n = m = 10⁴` in Python: 10⁸ inner-loop iterations is about a minute of pure-Python time, versus well under a second in Rust or Go. Mitigations, in order of effort: reduce the state (band, prune unreachable), vectorise the inner loop with NumPy (edit distance rows can be computed with array operations), move the hot loop to a compiled extension, or accept an approximation. If a DP sits in a request path, precompute it offline where possible: Huffman tables, routing tables and pricing grids are all DP outputs that get computed once and served many times.

Recursion limits are the other production trap. Top-down memoisation with depth `n = 10⁵` will overflow the stack in Python (default limit about 1,000) and can in JavaScript; convert to bottom-up or an explicit stack before shipping. In an interview, say "I would write this bottom-up in production to avoid the recursion limit" as you write the memoised version.

## Exercises

```exercise
id: coin-change-reconstruct
title: Coin change with reconstruction
prompt: |
  Given coin denominations `coins` (distinct positive integers) and an
  `amount`, return the coins of a minimum-count combination that sums to
  `amount`, as a list sorted ascending. Return `[]` if the amount cannot be
  made (and for amount 0). The tests are chosen so that the optimal
  multiset is unique.

  Fill the count table, then walk back from `amount` by recomputation.
languages: [python, javascript]
entry: coin_change_coins
starter:
  python: |
    def coin_change_coins(coins, amount):
        # 1) dp[a] = min coins for a; 2) walk back finding c with dp[a - c] == dp[a] - 1
        return []
  javascript: |
    function coin_change_coins(coins, amount) {
      // 1) dp[a] = min coins for a; 2) walk back finding c with dp[a - c] == dp[a] - 1
      return [];
    }
tests:
  - args: [[1, 3, 4], 6]
    expected: [3, 3]
  - args: [[1, 2, 5], 11]
    expected: [1, 5, 5]
  - args: [[2, 5], 3]
    expected: []
    label: impossible
  - args: [[1], 0]
    expected: []
    label: zero amount
  - args: [[2, 3, 5], 10]
    expected: [5, 5]
  - args: [[1, 3, 4], 10]
    expected: [3, 3, 4]
    hidden: true
  - args: [[7, 3], 9]
    expected: [3, 3, 3]
    hidden: true
hints:
  - "Use amount + 1 as infinity so the table stays integer; if dp[amount] is still infinite, return []."
  - "In the walk-back, any coin c with dp[a - c] == dp[a] - 1 is a valid step; because the optimum is unique here, you will always end at the same multiset."
```

```exercise
id: lcs-reconstruct
title: Reconstruct a longest common subsequence
prompt: |
  Return one longest common subsequence of strings `a` and `b` as a
  string. Fill the standard LCS table, then walk back from `(m, n)`:
  on a match emit the character and move diagonally; otherwise move up
  (to `i-1`) if `dp[i-1][j] >= dp[i][j-1]`, else move left. Reverse the
  emitted characters at the end. Return `""` when there is no common
  character.
languages: [python, javascript]
entry: lcs_string
starter:
  python: |
    def lcs_string(a, b):
        # fill dp, then walk back with the tie-break: up when dp[i-1][j] >= dp[i][j-1]
        return ""
  javascript: |
    function lcs_string(a, b) {
      // fill dp, then walk back with the tie-break: up when dp[i-1][j] >= dp[i][j-1]
      return "";
    }
tests:
  - args: ["abcde", "ace"]
    expected: "ace"
  - args: ["abc", "def"]
    expected: ""
    label: nothing in common
  - args: ["", "a"]
    expected: ""
    label: empty string
  - args: ["AGGTAB", "GXTXAYB"]
    expected: "GTAB"
  - args: ["ab", "ba"]
    expected: "a"
    label: tie-break prefers moving up
  - args: ["programming", "gaming"]
    expected: "gaming"
    hidden: true
  - args: ["abcdef", "acf"]
    expected: "acf"
    hidden: true
hints:
  - "Build the (m+1) x (n+1) table exactly as in the string DP lesson."
  - "The walk-back is the fill in reverse: the same three neighbours, chosen by which one explains dp[i][j]."
```

## Senior signals

- When asked "which items?", you **walk the table backwards** (parent pointers or recomputation) and can say the memory cost of each.
- You justify every memory optimisation by naming **which states the transition reads**, and you know Hirschberg's trick for reconstructing after rolling rows.
- You recognise **word break, Catalan counting, DAG paths and expectation problems as DP** without the word "minimum" appearing in the statement.
- You **rule DP out** when a greedy exchange argument exists, when the state is exponential for `n = 100`, or when a closed form is available, and you say so early.
- You debug a wrong table by **checking state semantics, base cases, fill order and answer cell**, in that order, on a five-cell hand trace.
- You know the production traps: Python loop speed at `10⁸` cells, recursion limits on deep memoisation, and precomputing DP outputs that sit in a request path.

## Check yourself

```quiz
- q: >-
    You optimised LCS to two rolling rows and the interviewer asks for the actual subsequence. What are your options?
  options: ["None; rolling rows discard the table, so the path is gone", "Switch to a greedy scan that matches characters left to right", "Read the subsequence directly off the two rows still in memory", "Keep the full table, store parents, or use Hirschberg's trick"]
  answer: 3
  explanation: >-
    Rolling rows lose the walk-back path, but the full table (O(mn) memory), explicit parent pointers, or Hirschberg's divide-and-conquer each recover it; Hirschberg gets the subsequence in O(m + n) memory with the same O(mn) time. So the path is not gone for good. The two remaining rows hold only the last values, not the route, and greedy does not solve LCS.
- q: >-
    Which of these is NOT a reason to reject DP for a problem?
  options: ["A greedy choice is provably safe and gives a better complexity", "The state must include the set of visited items and n = 200", "The subproblems are disjoint, as in merge sort and quicksort", "The subproblems overlap heavily across the naive recursion"]
  answer: 3
  explanation: >-
    Overlap is the property that makes DP pay off. Safe greedy choices, exponential state spaces (2²⁰⁰ subsets), and disjoint subproblems are each a reason to use something else.
- q: >-
    Word break has no minimum or count in its statement. What makes it a DP problem anyway?
  options: ["Nothing; a trie over the dictionary solves it without DP", "Every split point must be tried, which is what DP means", "The dictionary is a set, so repeated lookups are cached", "A prefix's yes/no depends on shorter prefixes, which recur"]
  answer: 3
  explanation: >-
    The yes/no answer for a prefix depends only on yes/no answers for shorter prefixes, and a naive search revisits those prefixes many times: a boolean prefix state with a transition to smaller prefixes is exactly optimal substructure plus overlap. Trying every split is just brute force; the reuse is what makes it DP. A trie speeds up the word-lookup part but does not remove the exponential search without memoisation.
- q: >-
    Your coin-change table gives the right count but the walk-back loops forever. The most likely bug is:
  options: ["The table should have been filled backwards, from amount down", "The coins are not sorted, so the walk-back picks the wrong one", "The walk-back tests dp[a - c] == dp[a] instead of dp[a] - 1", "Infinity was stored as amount + 1, which the walk-back follows"]
  answer: 2
  explanation: >-
    Recomputation must step to a state whose value is exactly one less. With an equality test the walk soon reaches an amount where no coin qualifies (with coins [1, 3, 4] it goes 6 → 5 → 2 and then finds nothing), so a never changes and the loop spins. Sorting, fill direction and the amount + 1 sentinel are unrelated.
- q: >-
    A DP is correct and O(nm) with n = m = 20,000 in pure Python and must finish in under a second. The first thing to try is:
  options: ["Add a cache so that repeated cells are not recomputed", "Shrink the state space or vectorise the inner loop", "Switch to top-down so that only needed cells get computed", "Raise the recursion limit so the deep calls can finish"]
  answer: 1
  explanation: >-
    4 × 10⁸ pure-Python iterations is minutes, not a second, so the state count is the problem. Banding, pruning unreachable cells, NumPy vectorisation or a compiled inner loop are the real levers. Top-down adds call and hash overhead and here needs nearly every cell anyway; the recursion limit is irrelevant to bottom-up; a cache is what the DP already is.
```
