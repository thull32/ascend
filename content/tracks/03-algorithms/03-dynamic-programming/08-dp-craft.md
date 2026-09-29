---
slug: dp-craft
title: "DP craft: reconstruction, memory, disguises and when DP is wrong"
description: Recover the actual solution from a table, cut memory without losing correctness, spot DP in problems that do not announce themselves, debug a wrong table, and recognise the cases where DP is the wrong tool.
minutes: 55
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

### LCS, cell by cell

For LCS the walk goes from `(m, n)`: on a character match, emit it and step diagonally; otherwise step to whichever of `(i−1, j)` and `(i, j−1)` holds the larger value, with a fixed tie-break. `a = "AGGTAB"`, `b = "GXTXAYB"`:

| | `""` | G | X | T | X | A | Y | B |
|---|---|---|---|---|---|---|---|---|
| `""` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **A** | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 |
| **G** | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| **G** | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| **T** | 0 | 1 | 1 | 2 | 2 | 2 | 2 | 2 |
| **A** | 0 | 1 | 1 | 2 | 2 | 3 | 3 | 3 |
| **B** | 0 | 1 | 1 | 2 | 2 | 3 | 3 | **4** |

| at `(i, j)` | `a[i−1]`, `b[j−1]` | up `dp[i−1][j]` | left `dp[i][j−1]` | move | emitted |
|---|---|---|---|---|---|
| (6, 7) | B, B | | | match → (5, 6) | B |
| (5, 6) | A, Y | 2 | 3 | left → (5, 5) | |
| (5, 5) | A, A | | | match → (4, 4) | A |
| (4, 4) | T, X | 1 | 2 | left → (4, 3) | |
| (4, 3) | T, T | | | match → (3, 2) | T |
| (3, 2) | G, X | 1 | 1 | tie: up → (2, 2) | |
| (2, 2) | G, X | 0 | 1 | left → (2, 1) | |
| (2, 1) | G, G | | | match → (1, 0) | G |

`j = 0` ends the walk; the emitted characters reversed are `GTAB`. The tie at `(3, 2)` is where the choice of LCS is made: going up skips the second `G` of `a`, going left would skip the `X` of `b`, and both lead to a length-4 answer. If the problem wants a specific one (lexicographically smallest, say), the tie-break has to be designed, not left to chance.

```viz
{"type": "dp", "algorithm": "lcs", "a": "AGGTAB", "b": "GXTXAYB", "title": "Reconstruction walks the table backwards from the answer cell", "caption": "Diagonal steps on matches emit characters; on mismatches move toward the larger neighbour."}
```

### 0/1 knapsack: which items?

With the two-dimensional table from the [knapsack lesson](/learn/algorithms/dynamic-programming/knapsack-family) (weights `[1, 3, 4, 5]`, values `[1, 4, 5, 7]`, `W = 7`), item `i−1` is in the optimal bag exactly when `dp[i][c] != dp[i−1][c]`: the row for item `i−1` improved on the row without it, and the only way it could is by taking the item.

| row `i` | `dp[i]` over capacities 0..7 |
|---|---|
| 0 | `0 0 0 0 0 0 0 0` |
| 1 (1 kg, 1) | `0 1 1 1 1 1 1 1` |
| 2 (3 kg, 4) | `0 1 1 4 5 5 5 5` |
| 3 (4 kg, 5) | `0 1 1 4 5 6 6 9` |
| 4 (5 kg, 7) | `0 1 1 4 5 7 8 9` |

Walk from `(4, 7)`: `dp[4][7] = 9 == dp[3][7] = 9`, so the 5 kg item is out; `(3, 7)`: `9 != dp[2][7] = 5`, the 4 kg item is in, `c = 3`; `(2, 3)`: `4 != dp[1][3] = 1`, the 3 kg item is in, `c = 0`; `(1, 0)`: `0 == 0`, the 1 kg item is out. Items `{3 kg, 4 kg}`, value 9. The one-row version cannot do this, because the "without this item" row has been overwritten, which is the subject of the next section.

The general rule: **reconstruction is the fill, run in reverse**. If you can state the transition, you can state the walk-back.

## Memory optimisation without losing correctness

The rolling-row trick from [grid DP](/learn/algorithms/dynamic-programming/grid-and-two-dimensional-dp) and the sweep-direction rule from [knapsack](/learn/algorithms/dynamic-programming/knapsack-family) both rest on one question: **which earlier states does the transition read?** If it reads only row `i−1`, keep two rows (or one, with the right sweep). If it reads `i−1` and `i−2`, keep three. If it reads an arbitrary earlier state (LIS reads all `j < i`), the full table stays.

### Hirschberg's trick, traced

Rolling rows destroy the table, so the walk-back is impossible, unless you divide and conquer. For LCS, split `a` in half. Compute the last row of the forward DP for the first half of `a` against all of `b` (rolled, `O(n)` memory): `fwd[j]` = LCS of `a[:mid]` and `b[:j]`. Compute the same for the *reversed* second half of `a` against reversed `b`, and un-reverse it: `bwd[j]` = LCS of `a[mid:]` and `b[j:]`. Some split point `j*` of `b` lies on an optimal alignment, and it is the one maximising `fwd[j] + bwd[j]`. Recurse on the two halves.

On `a = "AGGTAB"`, `mid = 3`, `a[:3] = "AGG"`, `a[3:] = "TAB"`:

| `j` | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| `b[:j]` / `b[j:]` | `""` / `GXTXAYB` | `G` / `XTXAYB` | `GX` / `TXAYB` | `GXT` / `XAYB` | `GXTX` / `AYB` | `GXTXA` / `YB` | `GXTXAY` / `B` | `GXTXAYB` / `""` |
| `fwd[j]` = LCS(`AGG`, `b[:j]`) | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `bwd[j]` = LCS(`TAB`, `b[j:]`) | 3 | 3 | 3 | 2 | 2 | 1 | 1 | 0 |
| sum | 3 | **4** | **4** | 3 | 3 | 2 | 2 | 1 |

The maximum is 4, the LCS length, at `j = 1` (or 2). Take `j* = 1`: recurse on (`"AGG"`, `"G"`), which yields `G`, and (`"TAB"`, `"XTXAYB"`), which yields `TAB`; concatenated, `GTAB`. Each level of recursion does `O(mn)` work on the current subproblem and the subproblem sizes halve, so the total is `O(mn) + O(mn/2) + … = O(2mn)`: twice the fill, with `O(m + n)` memory, and the actual subsequence. The same split-at-the-middle-and-recurse idea is how git's `xdiff` keeps Myers' diff in linear space (its `xdl_split` finds a middle point of the edit path, then recurses on both boxes). A cheaper cousin is **checkpointing**: keep every `k`-th row, then rebuild each `k`-row band on the way back for `O(mn/k)` memory and `k×` recomputation of the walk.

### Bitsets

A boolean DP row (subset sum) of `target + 1` cells is `target + 1` bits. Python integers are arbitrary-precision, so `reach |= reach << x` updates the entire row in one operation that runs at machine-word speed:

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

Same recurrence, same downward-sweep semantics (the shift reads the *old* bits), 64 cells per machine word instead of one per list slot. The technique generalises to any boolean DP whose transition is a shift and an OR.

**Compressing the state space.** Sometimes the state is bigger than it needs to be. Edit distance with a bound `k` only needs the band `|i − j| ≤ k`. Stock with `k` transactions where `k ≥ n / 2` degenerates to unlimited transactions. Detecting these is part of designing the state, not an afterthought.

## Memory, in bytes

The question "can you do better than `O(mn)`" deserves numbers. For a `10⁴ × 10⁴` table, `10⁸` cells:

| representation | bytes per cell | total | notes |
|---|---|---|---|
| Python list of lists of `int` | 8 (pointer) + 28 per distinct int object | 0.8 GB + up to 2.8 GB | ints in −5..256 are shared singletons; larger values are separate objects, so an edit-distance table with values up to 10⁴ is mostly distinct objects |
| NumPy `int32` array | 4 | 400 MB | one allocation, cache-friendly sweeps |
| NumPy `int64` array | 8 | 800 MB | needed only if values exceed 2 × 10⁹ |
| memoisation dict on `(i, j)` | 100–200 (entry, tuple key, value) | 10–20 GB | measured in [the memoisation lesson](/learn/algorithms/recursion-backtracking/from-backtracking-to-memoisation) |
| two rolling rows, `int32` | 4 × 2 × 10⁴ | 80 KB | fits in L2 cache |
| one boolean row as a bitset | 1/8 | 1.25 KB | subset sum, `reach |= reach << x` |
| Hirschberg | `O(m + n)` | ~80 KB | plus the reconstructed answer |

The same 10⁸ cells are 3 GB or 80 KB depending on the representation, and the interviewer asking "can you do better" is usually asking whether you know which row of this table you are in. [Space complexity and the memory hierarchy](/learn/foundations/complexity/space-complexity-and-memory-hierarchy) has the cache sizes behind the "fits in L2" remark.

## DP in disguise

Some of the most-asked DP problems do not say "count" or "minimum" and are missed as a result. The tells are subtler.

**Word break.** "Can `s` be segmented into dictionary words?" There is no optimisation and no count, but there *is* a prefix state: `dp[i]` = the prefix `s[0..i)` can be segmented. Transition: some word ends at `i`, and the prefix before it was segmentable: `dp[i] = any(dp[j] and s[j..i) in words for j < i)`. `O(n²)` prefix checks, or `O(n · L)` if you only try `j = i − len(word)` for each word.

```viz
{"type": "dp", "algorithm": "word-break", "s": "catsanddog", "words": ["cat", "cats", "and", "sand", "dog"], "title": "Word break: dp[i] = some dictionary word ends at i and the prefix before it is breakable", "caption": "A yes/no question with a prefix state is still DP. The table is a row of booleans."}
```

**Counting structures: Catalan numbers.** "How many structurally distinct BSTs hold keys 1..n?" Fix the root `r`; the left subtree is any BST on `r − 1` keys and the right is any BST on `n − r` keys: `dp[n] = Σᵣ dp[r−1] · dp[n−r]`. That is the Catalan recurrence (`1, 1, 2, 5, 14, 42, 132, …`), and it also counts balanced parenthesis strings, triangulations and binary-tree shapes. The tell is "choose a root/pivot and the two sides are independent instances".

### Graphs, parentheses and probabilities

**Paths in a DAG.** "How many ways to get from A to B" or "longest path" in a graph with no cycles is DP over a topological order: `paths[v] = Σ paths[u]` over predecessors. Unique paths on a grid is this with the grid as an implicit DAG. Longest path in a general graph is NP-hard; the acyclicity is what makes the DP valid.

**Longest valid parentheses.** `dp[i]` = length of the longest valid substring *ending at* `i`. If `s[i] = ')'` and the character before the matched run, `s[i − dp[i−1] − 1]`, is `'('`, then `dp[i] = dp[i−1] + 2 + dp[i − dp[i−1] − 2]`. Ugly, but it is the "ends at `i`" pattern from [sequence DP](/learn/algorithms/dynamic-programming/sequence-dp), and a stack solves it too.

**Probability and expectation.** "Expected number of dice rolls to reach 100" or "probability the knight stays on the board after `k` moves" are DP with real-valued cells: the state is the position and remaining moves, the transition averages over outcomes. Interviewers use these to check whether you see past the integer-valued examples.

**Digit DP** (senior-level tail): "how many integers in `[1, N]` have digit sum 20" is a DP over the digits of `N` with state (position, tight-to-`N`, accumulated property). Rare in interviews, common in competitive programming; knowing the name is enough.

The shared tell across all of these: an exponential search over choices where the *future depends on a small summary of the past*. When you notice yourself writing a recursive search, ask what its arguments are and how many distinct combinations exist. If the count is polynomial, memoise.

## When DP is the wrong tool

DP is not always right, and saying so at the right moment is worth more than any recurrence. Each case below comes with the `n` that makes it obvious.

**A greedy choice is provably safe.** Interval scheduling by earliest end, fractional knapsack by density, Huffman merging: DP would also work (`O(n²)` interval DP for scheduling) and would be strictly worse. At `n = 10⁵`, the greedy is `n log n ≈ 1.7 × 10⁶` operations and the DP is `10¹⁰`, a factor of 6,000. If you can write an exchange argument, use it. [Greedy and exchange arguments](/learn/algorithms/greedy/greedy-and-exchange-arguments) covers the test.

**The state space is too big.** DP on subsets is `2ⁿ`: fine at `n = 20` (10⁶ states), out of reach at `n = 40` (10¹²), and at `n = 100` the state count is `2¹⁰⁰ ≈ 1.3 × 10³⁰`: at a billion states per second, about 4 × 10¹³ years. DP whose state must include the path taken is `n!`. When `n = 100` and the state is a subset, no memoisation saves you; the problem is NP-hard and the interviewer wants branch-and-bound, a heuristic, or a discussion of why exact is infeasible. Recognising this in the first two minutes, rather than after writing a recurrence, is the senior move.

**There is a closed form or a simpler structure.** Fibonacci has a matrix-power `O(log n)` solution; unique paths without obstacles is `C(m+n−2, m−1)`; the number of subarrays with sum `k` is a prefix-sum hash map, not a table. If the DP transition only ever reads `dp[i−1]` and is a fixed linear function, the "DP" is a loop and calling it DP overstates it.

**Subproblems do not overlap.** Merge sort and quicksort have the recursive structure but no reuse: every call has a distinct input. Memoising them costs memory and hashing for zero hits.

**The data is streaming or too large for a table.** If `n = 10⁹` items arrive one at a time and the DP would need `O(n)` states, that is 8 GB of `int64` before the transition runs; you need a sketch, a sliding window, or a different question.

A useful sentence in an interview: "This has optimal substructure, and I think the subproblems overlap, so DP is a candidate; but let me check whether a greedy choice is safe first, because that would be `O(n log n)` instead of `O(n²)`."

## Debugging a wrong table

When a DP gives the wrong answer, the bug is almost always in one of four places. Check them in this order, and look at what each one does to a five-cell table.

1. **State semantics.** Is `dp[i]` about the first `i` elements (half-open) or about index `i` (closed)? Half-open prefixes give an all-zero border with no special cases; mixing the two conventions inside one solution is the most common off-by-one, and its usual symptom is a table one cell too small: `dp = [[0] * n for _ in range(m)]` for a prefix DP raises `IndexError` at `dp[m][n]`, and if the loops are shrunk to fit, the border row that encodes the empty prefix is gone and every cell reads garbage in its place.
2. **Base cases.** Does the transition produce the first real cell from the bases you set? Coin change over `[1, 3, 4]` with `dp[0] = INF` instead of `0` gives `[INF, INF, INF, INF, INF, INF, INF]`, because every cell is `min` over infinities plus one; with `dp[0] = 0` the table is `[0, 1, 2, 1, 1, 2, 2]`. `dp[0] = 1` in decode ways and coin-change counting is not a statement about the world; it is the value that makes `dp[1]` right. Check by computing `dp[1]` by hand.
3. **Fill order.** Does every state the transition reads exist when it is read? Interval DP by row instead of by length, knapsack sweeping the wrong way, LIS with `j > i`: each reads garbage silently. A one-row 0/1 knapsack swept upward on weight `[2]`, value `[3]`, capacity 6 returns 9 instead of 3, because the row being read is already the row being written.
4. **The answer cell.** `dp[n]` versus `max(dp)` versus `dp[0][n+1]`; LIS on `[1, 2, 3, 0]` has `dp = [1, 2, 3, 1]`, so `dp[n−1] = 1` and `max(dp) = 3`; padded tables shift the answer index by one.

The tool for all four is the same: **fill a 5-cell table by hand** for a tiny input and compare it with what the code produces. Print the table. Candidates who trace a small example before running the code find these bugs in a minute; candidates who run and stare find them in ten.

## Under the hood

### What a cell costs in CPython

A two-row LCS over two random 2,000-character strings took 0.15 s here, 38 ns per cell (CPython 3.14, one machine, tight loop with local variables). At that rate 10⁸ cells is about 4 s, and the figure varies by a factor of a few across interpreter versions and machines; a compiled inner loop is 1–3 ns per cell. If a DP sits in a request path, that difference is the difference between a feature and an outage, and the fixes in order of effort are: reduce the state (band, prune unreachable), vectorise the inner loop, move the hot loop to a compiled extension, or precompute offline. Routing tables and pricing grids are typical DP outputs that get computed once and served many times.

### Vectorising a row

Edit distance looks unvectorisable because `dp[i][j]` reads `dp[i][j−1]` in the same row. The trick: compute the substitute and delete candidates for the whole row from the previous row with two array operations, `best[j] = min(prev[j−1] + (a[i−1] != b[j−1]), prev[j] + 1)`, then note that the insert chain makes `cur[j] = min over k ≤ j of best[k] + (j − k)`, which is a cumulative minimum of `best[k] − k` plus `j`: one `np.minimum.accumulate` per row. Rows of 10⁴ then cost a handful of NumPy calls instead of 10⁴ interpreted iterations; the speedup depends on the row length and was not measured here. The other classic is the anti-diagonal sweep, where every cell on a diagonal depends only on the two previous diagonals and can be computed in one vector operation; that wavefront order is a common way GPU alignment code parallelises.

### What `diff` runs

`git diff` does not fill an `O(mn)` table. It runs Myers' 1986 algorithm, which finds the shortest edit script in `O((N + M) · D)` time where `D` is the size of that script: near-linear for similar files, which is the common case. `--diff-algorithm=minimal` spends extra effort to guarantee the smallest script; `patience` (match unique lines first) and `histogram` produce more readable diffs on code that moves blocks around. Python's `difflib.SequenceMatcher` is different again: a refinement of Ratcliff/Obershelp that recursively finds the longest contiguous junk-free matching block, with an "autojunk" heuristic that treats as junk any item making up more than 1% of the second sequence once it has 200 or more items; the docs state it does not produce minimal edit sequences, so it is not LCS and should not be used where minimality matters.

### Recursion limits

Top-down memoisation with depth `n = 10⁵` overflows CPython's default 1,000-frame limit, and raising the limit pushes the failure to the C stack because the `lru_cache` wrapper re-enters the interpreter on every level; JavaScript engines fail at around 10⁴ frames. Convert to bottom-up or an explicit stack before shipping. In an interview, say "I would write this bottom-up in production to avoid the recursion limit" as you write the memoised version.

## Failure modes

**`IndexError` at `dp[m][n]`, or an answer that is one too small.** Symptom: the LCS of two non-empty strings raises, or returns the LCS of the strings minus their last characters. Diagnosis: the table was allocated `m × n` for a prefix-indexed DP that needs `(m + 1) × (n + 1)`, and either the answer cell is out of range or the loops were shrunk and the empty-prefix border is missing. Fix: allocate `n + 1` and index prefixes half-open; check by hand that `dp[1][1]` reads the border.

**The rolling-array version returns a value larger than any subset can produce.** Symptom: 0/1 knapsack returns 9 on a single item of value 3. Diagnosis: the single row is swept upward, so `dp[c − w]` is already this item's row and the item is counted repeatedly. Fix: sweep capacities downward for at-most-once semantics; keep the two-row version until the one-row version matches it on a hand-traced example.

**The walk-back loops forever.** Symptom: the count is right, the reconstruction hangs. Diagnosis: the recomputation test is `dp[a − c] == dp[a]` instead of `dp[a] − 1`; with coins `[1, 3, 4]` and amount 6 it goes 6 → 5 → 2 and then no coin qualifies, so `a` never changes. Fix: the walk must step to a state whose value is exactly one transition away; and guard the loop with a step counter in production code.

**Path counts go negative in Java, or drift in JavaScript.** Symptom: unique paths on a 32 × 32 grid comes out 32 too small in JavaScript, with no error; on 35 × 35 a Java `long` goes negative. Diagnosis: from 30 × 30 the count `C(58, 29) ≈ 3.0 × 10¹⁶` exceeds `2⁵³ ≈ 9.0 × 10¹⁵`, the largest magnitude at which a double represents every integer, so additions are no longer guaranteed exact; on a row-by-row fill the first actual rounding error appears at 32 × 32 (measured: the corner is `465,428,353,255,261,088` and the double sum ends `…056`). `C(68, 34) ≈ 2.8 × 10¹⁹` exceeds `2⁶³ − 1 ≈ 9.2 × 10¹⁸`, and a 100 × 100 grid's count has 59 digits. Fix: count modulo a prime (`10⁹ + 7`) when the problem allows, use `BigInt`/`BigInteger` when it does not, and in Python rely on arbitrary-precision ints while remembering they cost 28 bytes and up per cell.

**Stale answers from a memoised DP.** Symptom: the same call returns different results before and after an unrelated update. Diagnosis: the memo is keyed on the arguments but the function reads a grid or price list that was mutated. Fix: include a version of the mutable input in the key, or clear the cache on every write; the memoisation lesson has the demonstration.

## Reconstruction strategies compared

| strategy | extra memory | extra time | gives the solution | code |
|---|---|---|---|---|
| full table + recomputation | none beyond the table (`O(mn)`) | one walk, `O(m + n)` steps × transition cost | yes | +10 lines |
| full table + parent pointers | a second `O(mn)` table (1 byte per cell suffices) | none | yes, without re-evaluating the transition | +5 lines |
| rolling rows | `O(n)` | none | **no** | 0 |
| rolling rows + Hirschberg | `O(m + n)` | about 2× the fill | yes | +30 lines, recursive |
| rolling rows + checkpoints every `k` rows | `O(mn / k)` | `k` extra row fills per band | yes | +20 lines |

## Interviewer follow-ups

**"Which coins?"** Model answer: walk back from `amount` with recomputation (`dp[a − c] == dp[a] − 1`), or record the last coin per amount during the fill; both are `O(amount)` extra work, the pointer version is faster to walk and costs one more array. Common wrong answer: re-run a search for a combination of size `dp[amount]`, which is exponential.

**"The table is `10⁶ × 10³`. What do you do?"** Model answer: `10⁹` cells is 4 GB as `int32`, so look at the transition: if it reads only the previous row, two rows of 10³; if the path is needed, Hirschberg for `O(m + n)` memory at 2× time, or checkpoints every 1,000 rows for 4 MB of memory and a bounded recomputation. Common wrong answer: "spill the table to disk", which is slower than recomputing.

**"Is DP even the right tool here?"** Model answer: check for a safe greedy choice with an exchange argument first (interval scheduling, fractional knapsack), then check the state count in bytes; if the state is a subset of 100 items, say so and switch to branch-and-bound or approximation. Common wrong answer: writing the recurrence first and discovering the `2¹⁰⁰` states later.

**"Your path counts overflow `long` in Java. Now what?"** Model answer: ask whether the answer is wanted modulo a prime (usual in problem statements), and if so reduce after every addition; otherwise `BigInteger`; a double is never the answer because it silently loses exactness above 2⁵³. Common wrong answer: "use `double` for the big ones".

**"The table is all zeros. Where do you look first?"** Model answer: the base case; a `min`-DP with `dp[0] = INF` or a count-DP with `dp[0] = 0` propagates the wrong base into every cell; compute `dp[1]` by hand and compare. Common wrong answer: rewriting the transition.

## What mid-level engineers get wrong

- **Returning the value and stopping.** Consequence: no answer to "which items", the most common senior-round follow-up.
- **Rolling the table before being asked for the path.** Consequence: having to explain that the optimisation destroyed the answer, then not knowing Hirschberg.
- **Quoting `O(mn)` without bytes.** Consequence: proposing a 3 GB table when 80 KB would do, or the reverse, proposing rolling rows that lose the reconstruction.
- **Treating overflow as someone else's problem.** Consequence: correct recurrences that print wrong numbers at `n = 30` in JavaScript.
- **Debugging by rerunning.** Consequence: ten minutes staring at output instead of one minute tracing five cells.
- **Never asking whether greedy works.** Consequence: an `O(n²)` DP for a problem with an `O(n log n)` exchange-argument solution.

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

- When asked "which items?", you **walk the table backwards** (parent pointers or recomputation), you can trace it cell by cell, and you can say the memory cost of each option.
- You justify every memory optimisation by naming **which states the transition reads**, you put the table size in bytes, and you know Hirschberg's trick and checkpointing for reconstructing after rolling rows.
- You recognise **word break, Catalan counting, DAG paths and expectation problems as DP** without the word "minimum" appearing in the statement.
- You **rule DP out** when a greedy exchange argument exists (and quote the 6,000× at `n = 10⁵`), when the state is `2¹⁰⁰`, or when a closed form is available, and you say so early.
- You debug a wrong table by **checking state semantics, base cases, fill order and answer cell**, in that order, on a five-cell hand trace, and you know what each bug does to the table.
- You know the production traps: tens of nanoseconds per cell in CPython, path counts that pass 2⁵³ at 30 × 30 and first round wrongly at 32 × 32, recursion limits on deep memoisation, and that `git diff` runs Myers rather than a table.

## Check yourself

```quiz
- q: >-
    You optimised LCS to two rolling rows and the interviewer asks for the actual subsequence. What are your options?
  options: ["None; rolling rows discard the table, so the path is gone", "Switch to a greedy scan that matches characters left to right", "Read the subsequence directly off the two rows still in memory", "Keep the full table, store parents, or use Hirschberg's trick"]
  answer: 3
  explanation: >-
    Rolling rows lose the walk-back path, but the full table (O(mn) memory), explicit parent pointers, or Hirschberg's divide-and-conquer each recover it; Hirschberg gets the subsequence in O(m + n) memory with about twice the fill time. So the path is not gone for good. The two remaining rows hold only the last values, not the route, and greedy does not solve LCS.
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
    The yes/no answer for a prefix depends only on yes/no answers for shorter prefixes, and a naive search revisits those prefixes many times: a boolean prefix state with a transition to smaller prefixes is exactly optimal substructure plus overlap. Trying every split is brute force; the reuse is what makes it DP. A trie speeds up the word-lookup part but does not remove the exponential search without memoisation.
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
    4 × 10⁸ cells at tens of nanoseconds each is many seconds, so the state count is the problem. Banding, pruning unreachable cells, NumPy vectorisation or a compiled inner loop are the real levers. Top-down adds call and hash overhead and here needs nearly every cell anyway; the recursion limit is irrelevant to bottom-up; a cache is what the DP already is.
- q: >-
    A JavaScript unique-paths solution using plain numbers is exact on small grids but comes out 32 too small on a 32 × 32 grid. Why?
  options: ["The count passes 2⁵³, beyond which doubles cannot represent every integer", "Floating-point addition is not associative, so row sums drift", "The table exceeds the engine's array length limit at 900 cells", "Recursion depth reaches the engine's frame limit at 30 rows"]
  answer: 0
  explanation: >-
    Square-grid counts pass 2⁵³ ≈ 9.0 × 10¹⁵ at 30 × 30 (C(58, 29) ≈ 3.0 × 10¹⁶), beyond which doubles are spaced 2 or more apart and an addition may round; the 30 × 30 and 31 × 31 results happen to land on representable values, and 32 × 32 is the first grid where the fill actually loses 32. A 1,024-cell array is tiny, a bottom-up fill has no recursion, and the sums are exact integers until they exceed 2⁵³. Use BigInt or count modulo a prime.
```
