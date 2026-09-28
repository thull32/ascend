---
slug: string-dp
title: "String DP: LCS, edit distance, palindromes and regex"
description: Two-string DP with prefix states, the LCS and edit-distance tables filled cell by cell, palindromes as interval states, and the regex-matching recurrence including the star case.
minutes: 55
difficulty: hard
tags: [dynamic-programming, string-dp, lcs, edit-distance, palindrome, regex]
problems: [longest-common-subsequence, edit-distance, longest-palindromic-substring, palindromic-substrings, regular-expression-matching, interleaving-string, distinct-subsequences]
---
`git diff` shows you which lines changed between two versions of a file. Your spell checker suggests "receive" when you type "recieve". A DNA pipeline aligns two sequences to find where they agree. All three are the same computation: compare two strings by finding the cheapest sequence of edits, or the longest shared skeleton, between them. Trying every alignment is exponential; the DP is `O(mn)` and has been the standard since the 1970s.

String DP is the family where the state is *a pair of prefixes*. `dp[i][j]` describes the first `i` characters of one string against the first `j` of the other. The transition always asks the same question: what happens to the *last* character of each prefix? That single question produces LCS, edit distance, distinct subsequences, interleaving and regex matching. Palindrome problems are the exception: they use a single string and an *interval* state, and this lesson covers them too because interviews love them.

## Longest common subsequence

A subsequence keeps characters in order but need not be contiguous. The LCS of `"AGGTAB"` and `"GXTXAYB"` is `"GTAB"`, length 4.

**State.** `dp[i][j]` = the length of the LCS of `a[0..i)` and `b[0..j)`, the first `i` and first `j` characters. Using half-open prefixes means `dp[0][·] = dp[·][0] = 0` with no special cases: the LCS with an empty string is empty.

**Transition.** Look at the last characters, `a[i-1]` and `b[j-1]`.

- If they are equal, they can be the last character of the LCS, and it is never worse to use them: `dp[i][j] = 1 + dp[i-1][j-1]`.
- If they differ, at least one of them is not in the LCS. Drop one or the other and take the better: `dp[i][j] = max(dp[i-1][j], dp[i][j-1])`.

$$dp[i][j] = \begin{cases} 1 + dp[i-1][j-1] & a[i-1] = b[j-1] \\ \max(dp[i-1][j],\, dp[i][j-1]) & \text{otherwise} \end{cases}$$

**Order.** Row by row, increasing `i` then `j`: the transition reads `(i-1, j-1)`, `(i-1, j)` and `(i, j-1)`, all filled earlier. **Answer.** `dp[m][n]`.

Fill `a = "abcde"`, `b = "ace"` cell by cell. Row 0 and column 0 are zeros. Then:

| cell | prefixes | last chars | reads | value |
|---|---|---|---|---|
| `dp[1][1]` | `a` / `a` | equal | `1 + dp[0][0]` | 1 |
| `dp[1][2]` | `a` / `ac` | `a ≠ c` | `max(dp[0][2], dp[1][1]) = max(0, 1)` | 1 |
| `dp[2][2]` | `ab` / `ac` | `b ≠ c` | `max(dp[1][2], dp[2][1]) = max(1, 1)` | 1 |
| `dp[3][2]` | `abc` / `ac` | equal | `1 + dp[2][1] = 1 + 1` | 2 |
| `dp[4][3]` | `abcd` / `ace` | `d ≠ e` | `max(dp[3][3], dp[4][2]) = max(2, 2)` | 2 |
| `dp[5][3]` | `abcde` / `ace` | equal | `1 + dp[4][2] = 1 + 2` | 3 |

| | `""` | a | c | e |
|---|---|---|---|---|
| `""` | 0 | 0 | 0 | 0 |
| **a** | 0 | **1** | 1 | 1 |
| **b** | 0 | 1 | 1 | 1 |
| **c** | 0 | 1 | **2** | 2 |
| **d** | 0 | 1 | 2 | 2 |
| **e** | 0 | 1 | 2 | **3** |

Bold cells are diagonal matches.

```viz
{"type": "dp", "algorithm": "lcs", "a": "abcde", "b": "ace", "title": "LCS: diagonal on match, max(up, left) otherwise", "caption": "Watch the diagonal steps: each one is a character both strings share, in order."}
```

```python
def lcs(a: str, b: str) -> int:
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

Time `O(mn)`, space `O(mn)`; with two rolling rows `O(min(m, n))`.

### Reconstructing the subsequence

Walk back from `(m, n) = (5, 3)`; on a match emit the character and go diagonally, otherwise move to the neighbour that holds the cell's value:

| at | last chars | move | emitted |
|---|---|---|---|
| `(5, 3) = 3` | `e = e` | diagonal to `(4, 2)` | `e` |
| `(4, 2) = 2` | `d ≠ c` | `dp[3][2] = 2 ≥ dp[4][1] = 1`, up to `(3, 2)` | |
| `(3, 2) = 2` | `c = c` | diagonal to `(2, 1)` | `c` |
| `(2, 1) = 1` | `b ≠ a` | `dp[1][1] = 1 ≥ dp[2][0] = 0`, up to `(1, 1)` | |
| `(1, 1) = 1` | `a = a` | diagonal to `(0, 0)` | `a` |

Reversed, `"ace"`. When up and left tie, either move yields a valid LCS, and different tie-breaks yield different (equally long) subsequences; `diff` tools care about which one, as the follow-ups discuss.

## Why the prefix state is sufficient

The interviewer's "why is that the whole recurrence?" has a precise answer. Consider any common subsequence of `a[0..i)` and `b[0..j)` and ask what it does with the two last characters. There are three possibilities and no others: it uses `a[i-1]` matched to `b[j-1]` (possible only when they are equal), it does not use `a[i-1]` (so it is a common subsequence of `a[0..i-1)` and `b[0..j)`), or it does not use `b[j-1]` (a common subsequence of `a[0..i)` and `b[0..j-1)`). The three terms of the recurrence are exactly these three cases, so the maximum over them is the true optimum. Nothing about *which* earlier characters were matched matters, because any common subsequence of two prefixes is a valid start for any continuation; that is what makes `(i, j)` a sufficient state.

The equal case still deserves a sentence, because the recurrence takes only the diagonal there instead of the maximum of all three. If `a[i-1] = b[j-1] = x`, take any LCS of the two prefixes that does not end by matching these two `x`s; it either uses at most one of them or neither. Replace its last match by the pair `(a[i-1], b[j-1])` (or append the pair if both were unused), and the result is a common subsequence at least as long. So an optimal solution that matches the pair always exists, and the other two terms can never exceed `1 + dp[i-1][j-1]`. That is an exchange argument, the same tool as in [greedy proofs](/learn/algorithms/greedy/greedy-and-exchange-arguments).

## Edit distance

The minimum number of single-character insertions, deletions or substitutions to turn `a` into `b`. `"kitten" → "sitting"` takes 3: substitute k→s, substitute e→i, insert g.

**State.** `dp[i][j]` = the edit distance between `a[0..i)` and `b[0..j)`.

**Base cases.** `dp[i][0] = i` (delete everything), `dp[0][j] = j` (insert everything). This is the first DP in the module where the border is not all zeros or all ones; get it wrong and every cell is wrong.

**Transition.** Consider the last characters again. If `a[i-1] = b[j-1]`, no edit is needed for them: `dp[i][j] = dp[i-1][j-1]`. Otherwise the last operation was one of three, and you take the cheapest:

- **Substitute** `a[i-1]` with `b[j-1]`: `1 + dp[i-1][j-1]`.
- **Delete** `a[i-1]`: `1 + dp[i-1][j]` (now match the shorter `a` against all of `b`'s prefix).
- **Insert** `b[j-1]` at the end of `a`: `1 + dp[i][j-1]`.

$$dp[i][j] = \begin{cases} dp[i-1][j-1] & a[i-1] = b[j-1] \\ 1 + \min(dp[i-1][j-1],\, dp[i-1][j],\, dp[i][j-1]) & \text{otherwise} \end{cases}$$

The case analysis is exhaustive for the same reason as in LCS: in any edit script, the last character of `a` is either kept (matched to `b[j-1]`), substituted into `b[j-1]`, or deleted; and if `b[j-1]` is not produced from `a[i-1]` it must have been inserted. Every script falls into one of the three branches, so the minimum over them is optimal.

Trace `a = "horse"`, `b = "ros"`:

| | `""` | r | o | s |
|---|---|---|---|---|
| `""` | 0 | 1 | 2 | 3 |
| **h** | 1 | 1 | 2 | 3 |
| **o** | 2 | 2 | 1 | 2 |
| **r** | 3 | 2 | 2 | 2 |
| **s** | 4 | 3 | 3 | 2 |
| **e** | 5 | 4 | 4 | **3** |

`dp[1][1]` (`h` vs `r`): `h ≠ r`, `1 + min(dp[0][0], dp[0][1], dp[1][0]) = 1 + min(0, 1, 1) = 1`, a substitution. `dp[2][2]` (`ho` vs `ro`): `o = o`, so `dp[1][1] = 1`. `dp[3][1]` (`hor` vs `r`): `r = r`, so `dp[2][0] = 2` (delete h and o). `dp[5][3]`: `e ≠ s`, `1 + min(dp[4][2], dp[4][3], dp[5][2]) = 1 + min(3, 2, 4) = 3`.

### Reconstructing the edit script

Walk back from `(5, 3)`, at each cell asking which neighbour explains the value:

| at | last chars | test | operation | move to |
|---|---|---|---|---|
| `(5, 3) = 3` | `e ≠ s` | `dp[4][3] = 2 = 3 − 1` (up) | delete `e` | `(4, 3)` |
| `(4, 3) = 2` | `s = s` | `dp[3][2] = 2` (diagonal, free) | keep `s` | `(3, 2)` |
| `(3, 2) = 2` | `r ≠ o` | `dp[2][2] = 1 = 2 − 1` (up) | delete `r` | `(2, 2)` |
| `(2, 2) = 1` | `o = o` | `dp[1][1] = 1` (diagonal, free) | keep `o` | `(1, 1)` |
| `(1, 1) = 1` | `h ≠ r` | `dp[0][0] = 0 = 1 − 1` (diagonal) | substitute `h→r` | `(0, 0)` |

In forward order: `horse → rorse` (substitute) `→ rose` (delete r) `→ ros` (delete e). Three edits, and the walk found *which* three, which is what a spell checker needs when it explains a suggestion and what `diff` prints as `+`/`-` lines.

```viz
{"type": "dp", "algorithm": "edit-distance", "a": "horse", "b": "ros", "title": "Edit distance: min of substitute (diagonal), delete (up), insert (left), each plus 1", "caption": "The border is i and j, not 0. Every interior cell reads three neighbours."}
```

Note the shape: LCS and edit distance read the same three neighbours; they differ in the combine operation and the border. When only insertions and deletions are allowed (no substitution), `distance = m + n − 2·LCS`: every character not in the LCS must be deleted from `a` or inserted from `b`. The two problems are the same computation seen from different sides.

## Counting instead of optimising: distinct subsequences

The same prefix state counts as well as optimises. [Distinct Subsequences](/practice/distinct-subsequences) asks how many ways `t` occurs as a subsequence of `s`. **State.** `dp[i][j]` = the number of ways `t[0..j)` appears in `s[0..i)`. **Transition.** The last character of `s` is either not used, contributing `dp[i-1][j]`, or, when `s[i-1] = t[j-1]`, used as the match for `t[j-1]`, contributing `dp[i-1][j-1]`. The two cases are disjoint (used or not), so they add. **Border.** `dp[i][0] = 1`: the empty `t` occurs exactly once in anything; `dp[0][j] = 0` for `j > 0`.

Trace `s = "rabbbit"`, `t = "rabbit"`:

| | `""` | r | a | b | b | i | t |
|---|---|---|---|---|---|---|---|
| `""` | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| **r** | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| **a** | 1 | 1 | 1 | 0 | 0 | 0 | 0 |
| **b** | 1 | 1 | 1 | 1 | 0 | 0 | 0 |
| **b** | 1 | 1 | 1 | 2 | 1 | 0 | 0 |
| **b** | 1 | 1 | 1 | 3 | 3 | 0 | 0 |
| **i** | 1 | 1 | 1 | 3 | 3 | 3 | 0 |
| **t** | 1 | 1 | 1 | 3 | 3 | 3 | **3** |

`dp[5][4]` (`rabbb` vs `rabb`): the last `b` is unused (`dp[4][4] = 1`) or matched (`dp[4][3] = 2`), total 3. The three answers are the three choices of which `b` to drop. Counts grow fast: with `s` thirty-four `a`s and `t` seventeen, the answer is `C(34, 17) = 2,333,606,220`, past 2³¹, which is why this problem's constraints promise the answer fits or ask for it modulo a prime. The counting variant is where fixed-width overflow bites first in this family.

## Palindromes: interval state on one string

"Longest palindromic substring of `"babad"`" is `"bab"` or `"aba"`. Palindromes are about the two *ends* of a range, so the natural state is an interval, not a prefix pair.

**State.** `pal[i][j]` = true if `s[i..j]` (inclusive) is a palindrome.

**Transition.** `s[i..j]` is a palindrome iff `s[i] = s[j]` and the inside, `s[i+1..j-1]`, is a palindrome (or has length ≤ 1). So `pal[i][j] = (s[i] == s[j]) and (j − i < 2 or pal[i+1][j-1])`.

**Order.** The transition reads `(i+1, j-1)`, a *shorter* interval. So fill by increasing length: all length-1 intervals (always true), then length 2, then 3, and so on. Equivalently, iterate `i` from `n-1` down to 0 and `j` from `i` up to `n-1`; then `(i+1, j-1)` has already been computed.

**Answer.** The longest `(i, j)` with `pal[i][j]` true, or the count of true cells for [Palindromic Substrings](/practice/palindromic-substrings): `"babad"` has 7 (`b, a, b, a, d, bab, aba`), `"aaaa"` has 10.

```viz
{"type": "dp", "algorithm": "palindrome-substrings", "a": "babad", "title": "Palindromic substrings: pal[i][j] = s[i]==s[j] and pal[i+1][j-1]", "caption": "The table fills by interval length. Each true cell is a palindrome; the longest one on the top-right diagonal band is the answer."}
```

```python
def longest_palindrome(s: str) -> str:
    n = len(s)
    if n == 0:
        return ""
    pal = [[False] * n for _ in range(n)]
    best_i, best_j = 0, 0
    for i in range(n - 1, -1, -1):
        for j in range(i, n):
            if s[i] == s[j] and (j - i < 2 or pal[i + 1][j - 1]):
                pal[i][j] = True
                if j - i > best_j - best_i:
                    best_i, best_j = i, j
    return s[best_i:best_j + 1]
```

`O(n²)` time and space. The honest senior answer is that for the *substring* problem, expand-around-centre is also `O(n²)` time, uses `O(1)` space, is shorter, and is usually faster: for each of the `2n − 1` centres (a character or a gap between two), widen while the ends match. Write that one in an interview and mention the DP. The DP earns its keep when many overlapping palindrome queries are needed (palindrome partitioning) or for the *subsequence* variant, which has no centre to expand from. The `O(n)` algorithm is [Manacher's](/learn/advanced-data-structures/advanced-strings/manacher-and-palindromes), rarely expected.

**Longest palindromic subsequence** (characters need not be contiguous): `dp[i][j]` = length of the longest palindromic subsequence within `s[i..j]`. If `s[i] = s[j]`, they pair up: `2 + dp[i+1][j-1]`. Otherwise drop one end: `max(dp[i+1][j], dp[i][j-1])`. Same fill order by length. Trace `"bbbab"` (rows `i`, columns `j`, only `j ≥ i` filled):

| | b | b | b | a | b |
|---|---|---|---|---|---|
| **b** | 1 | 2 | 3 | 3 | **4** |
| **b** | | 1 | 2 | 2 | 3 |
| **b** | | | 1 | 1 | 3 |
| **a** | | | | 1 | 1 |
| **b** | | | | | 1 |

`dp[0][4]`: `s[0] = s[4] = b`, so `2 + dp[1][3] = 2 + 2 = 4` (`"bbbb"`). `dp[2][4]` (`"bab"`): `b = b`, `2 + dp[3][3] = 3`. Or notice that the answer equals `LCS(s, reverse(s))` and reuse the LCS code; both are `O(n²)`.

## Regular-expression matching

Match a string `s` against a pattern `p` containing literals, `.` (any single character) and `*` (zero or more of the preceding element). This is the hardest classic string DP and a common senior-round question.

**State.** `dp[i][j]` = true if `s[0..i)` matches `p[0..j)`.

**Base cases.** `dp[0][0] = true`. `dp[0][j]` is true only if `p[0..j)` can match the empty string, which happens when it is a sequence of `x*` pairs: `dp[0][j] = (p[j-1] == '*') and dp[0][j-2]`.

**Transition.** Look at `p[j-1]`, the last pattern element.

- If it is a literal or `.`: the last characters must match and the rest must match: `dp[i][j] = (i > 0) and matches(s[i-1], p[j-1]) and dp[i-1][j-1]`.
- If it is `*`, it applies to `p[j-2]`, and there are two possibilities for `p[j-2]*`:
  - It matches **zero** characters: drop the pair, `dp[i][j-2]`.
  - It matches **at least one**: then `s[i-1]` must match `p[j-2]`, and after consuming `s[i-1]` the *same* `p[j-2]*` can keep going: `matches(s[i-1], p[j-2]) and dp[i-1][j]`.

$$dp[i][j] = \begin{cases} dp[i][j-2] \;\lor\; \big(\text{match}(s_{i-1}, p_{j-2}) \land dp[i-1][j]\big) & p_{j-1} = \texttt{*} \\ \text{match}(s_{i-1}, p_{j-1}) \land dp[i-1][j-1] & \text{otherwise} \end{cases}$$

The `dp[i-1][j]` term, staying at the same `j`, is what lets a star consume several characters; it is the part candidates most often get wrong (writing `dp[i-1][j-2]`, which allows exactly one).

Trace `s = "aab"`, `p = "c*a*b"`. Prefixes of `p`: `""`, `c`, `c*`, `c*a`, `c*a*`, `c*a*b`.

| | `""` | c | c* | c*a | c*a* | c*a*b |
|---|---|---|---|---|---|---|
| `""` | T | F | T | F | T | F |
| **a** | F | F | F | T | T | F |
| **aa** | F | F | F | F | T | F |
| **aab** | F | F | F | F | F | **T** |

`dp[0][2]` (`""` vs `c*`): star, zero copies, `dp[0][0] = T`. `dp[1][3]` (`a` vs `c*a`): literal `a` matches, `dp[0][2] = T`. `dp[2][4]` (`aa` vs `c*a*`): star on `a`; zero copies gives `dp[2][2] = F`; at-least-one gives `s[1] = a` matches `a` and `dp[1][4] = T`. `dp[3][5]`: literal `b` matches, `dp[2][4] = T`. Match. The same code says `"mississippi"` does not match `"mis*is*p*."`, because after `mis*is*` consumes `missis`, `p*` cannot absorb the `s` before `ippi`.

```python
def is_match(s: str, p: str) -> bool:
    m, n = len(s), len(p)
    dp = [[False] * (n + 1) for _ in range(m + 1)]
    dp[0][0] = True
    for j in range(2, n + 1):
        if p[j - 1] == '*':
            dp[0][j] = dp[0][j - 2]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if p[j - 1] == '*':
                zero = dp[i][j - 2]
                one_or_more = p[j - 2] in (s[i - 1], '.') and dp[i - 1][j]
                dp[i][j] = zero or one_or_more
            else:
                dp[i][j] = p[j - 1] in (s[i - 1], '.') and dp[i - 1][j - 1]
    return dp[m][n]
```

`O(mn)`.

### Why the DP is polynomial and a backtracker is not

Read each row of the table as a set: row `i` is the set of pattern positions that can be "alive" after consuming `s[0..i)`. That is exactly the state of a non-deterministic finite automaton being simulated character by character, which is how Thompson's 1968 construction and every automata-based engine (RE2, Go's `regexp`, Rust's `regex`) work: at most `n` alive states per character, so `O(mn)` in the worst case with no exponential blow-up. Backtracking engines (PCRE, Python's `re`, JavaScript) instead explore one alternative at a time and revisit the same `(i, j)` pairs without a memo. On the pattern `(a+)+b` against a string of `a`s, Python's `re.match` measured 0.02 s at 20 characters and 0.07 s at 22 on this machine, roughly tripling per added character; a few more characters and one regex call takes seconds, which is the whole of a ReDoS attack. The interview DP is polynomial *because* it memoises the `(i, j)` state that backtracking recomputes.

## Under the hood: memory, bands and bit-parallel rows

The cost model for a two-string DP is the table, and the table is bigger than it looks. Two strings of 10⁴ characters give 10⁸ cells: 800 MB as NumPy `int64`, 400 MB as `int32`, and several gigabytes as a Python list of lists (8 bytes of pointer plus a 28-byte `int` object per cell). Two rolling rows are 160 KB. Nobody allocates the full table for strings that long; they roll rows and, when they need the alignment itself, use the checkpointing trick in [DP craft](/learn/algorithms/dynamic-programming/dp-craft).

Three further reductions are worth knowing by name.

**Banding (Ukkonen, 1985).** If you only care whether the distance is at most `k`, cells with `|i − j| > k` cannot lie on a path of cost `≤ k` (each step away from the diagonal is at least one edit), so you fill a band of width `2k + 1`: `5,000` cells instead of `10⁶` for two 1,000-character strings and `k = 2`. Spell checkers and fuzzy search with a small distance cutoff live here. If the band's final cell exceeds `k`, the true distance does too.

**Bit-parallel rows (Myers, 1999).** For edit distance, the differences between adjacent cells are always in `{−1, 0, +1}`, so a whole row can be encoded as a few bit-vectors and updated with about 15 word operations per text character, processing 64 cells at once: `O(n ⌈m / 64⌉)` instead of `O(nm)`. Libraries such as RapidFuzz and Edlib use this and are tens of times faster than a scalar table on short-to-medium strings.

**Automata for many queries.** A Levenshtein automaton for a word `w` and bound `k` accepts exactly the strings within distance `k` of `w`; intersecting it with a dictionary trie enumerates all fuzzy matches without a DP per word. Lucene's fuzzy queries do this for `k ≤ 2`. [Aho–Corasick](/learn/advanced-data-structures/advanced-strings/aho-corasick) is the analogous move for exact multi-pattern matching.

And on `diff`: the LCS table is `O(mn)` regardless of how similar the files are, so `git diff` does not use it. It runs Myers' 1986 algorithm, whose time is `O((m + n) · D)` for edit distance `D`, near-linear on files that differ in a few lines; `--minimal`, `--patience` and `--histogram` select variants that trade time for nicer alignments. Python's `difflib.SequenceMatcher` is a different algorithm again (longest matching blocks with an "autojunk" heuristic that ignores elements appearing more than 1% of the time in sequences over 200 items), which is why its output sometimes disagrees with an LCS.

## Costs, and when the table is the wrong tool

| Situation | Cells | Right tool |
|---|---|---|
| Two 100-character strings, exact answer | 10⁴ | full table, reconstruct from it |
| Two 10⁴-character strings, distance only | 10⁸ | two rolling rows (160 KB), ~10 s in CPython at ~100 ns/cell, well under 1 s compiled |
| Same, but only "is distance ≤ 2?" | 5 × 10⁴ | banded DP |
| Two 10⁵-line files, human-readable diff | 10¹⁰ | Myers `O((m+n)D)`; the table does not fit |
| One query against 10⁶ dictionary words, distance ≤ 2 | 10⁶ small tables | Levenshtein automaton or BK-tree index |
| Regex on untrusted input in a service | | automata engine (RE2-class), never a backtracker |

Top-down memoisation beats the bottom-up table in this family when most cells are unreachable: the regex DP with a pattern of many literals reaches only a thin diagonal, and a memoised `match(i, j)` visits those cells alone. Bottom-up wins for LCS and edit distance, where every cell is needed and the loop's constant factor is 10–20× smaller than a memoised call in CPython.

## Failure modes

**`edit_distance("abc", "")` returns 0.** Symptom: distances are too small whenever one string is a prefix of the other. Diagnosis: the border was initialised to zeros, LCS-style, so deleting or inserting a whole prefix looks free and every interior cell that routes through the border inherits the underestimate. Fix: `dp[i][0] = i`, `dp[0][j] = j`; check `dp[3][0]` by hand before trusting the table.

**`is_match("aaa", "a*")` returns false.** Symptom: stars match exactly one character. Diagnosis: the one-or-more branch was written as `dp[i-1][j-2]`, advancing past the star after a single consumption. Fix: `dp[i-1][j]`, staying on the same pattern element; test with `"aaa"` vs `"a*"` and `""` vs `"a*b*"`.

**The two-row LCS disagrees with the full table.** Symptom: results off by one on some inputs. Diagnosis: the diagonal `dp[i-1][j-1]` was read from the current row after it had been overwritten (the [grid DP](/learn/algorithms/dynamic-programming/grid-and-two-dimensional-dp) lesson shows why no sweep direction fixes this). Fix: save the previous row's `j-1` value in a variable before overwriting it, or keep two rows and swap.

**A 2,000-character comparison takes minutes instead of a second.** Symptom: CPU-bound, memory churning. Diagnosis: the inner loop compares `a[:i]` or `s[i:j]` slices, copying `O(n)` characters per cell and turning `O(mn)` into `O(mn · n)`. Fix: index characters (`a[i-1]`), never slice inside the loop; [strings in depth](/learn/data-structures/arrays-strings/strings-in-depth) has the cost model.

**Distinct-subsequence counts come out negative.** Symptom: correct on short inputs, garbage past a few dozen characters in Java or C++. Diagnosis: `int` overflow; `C(34, 17)` already exceeds 2³¹. Fix: reduce modulo the requested prime at each cell, or use a 64-bit type and check the constraints.

**A regex endpoint pins a CPU core.** Symptom: p99 latency spikes with a handful of requests. Diagnosis: a backtracking engine given a pattern with nested quantifiers (`(a+)+b`) and adversarial input; each extra character multiplies the work. Fix: an automata-based engine for untrusted patterns or inputs, a match timeout, and a linter that rejects nested quantifiers.

## Trade-offs

| Approach | Time | Memory | Gives the alignment | When |
|---|---|---|---|---|
| Full `m × n` table | `O(mn)` | `O(mn)` | yes, by walking back | short strings; the interview default |
| Two rolling rows | `O(mn)` | `O(min(m, n))` | no | distance only |
| Banded, cutoff `k` | `O(k · n)` | `O(k · n)` or `O(k)` rolled | yes, within the band | "is it within k edits?" |
| Bit-parallel (Myers 1999) | `O(n ⌈m/64⌉)` | `O(⌈m/64⌉)` words | no (distance only) | many short comparisons |
| Myers `O((m+n)D)` diff | `O((m+n)D)` | `O(m+n)` | yes | long, similar sequences (`diff`) |
| Automata engine (regex) | `O(mn)` worst, linear typical | `O(n)` states | not applicable | untrusted patterns |

## Interviewer follow-ups

**"LCS of three strings?"** Model answer: the state becomes three prefixes, `dp[i][j][k]`, with the same last-character case analysis: all three equal gives `1 + dp[i-1][j-1][k-1]`, otherwise the max over dropping one character from any string. `O(n³)` time and space, so `n ≈ 300` is the comfortable limit in Python. Common wrong answer: `LCS(LCS(a, b), c)`, which is wrong because the intermediate LCS is not unique and the wrong choice loses matches.

**"Allow swapping two adjacent characters as one edit."** Model answer: Damerau–Levenshtein adds a fourth candidate when `a[i-1] = b[j-2]` and `a[i-2] = b[j-1]`: `1 + dp[i-2][j-2]`; the state is unchanged, only the transition reads one more cell. Common wrong answer: treating a transposition as two substitutions, which overcounts by one for every swap.

**"The strings are 10⁵ characters each."** Model answer: 10¹⁰ cells is out for any table. If the expected distance is small, banded DP in `O(nk)` or Myers' bit-parallel rows; if the strings are similar in the `diff` sense, Myers' `O((m+n)D)`; if neither, approximate (sketching, or align in chunks). Common wrong answer: "roll the rows", which fixes memory but still runs 10¹⁰ steps.

**"Why does `diff` sometimes produce an ugly alignment even though it is optimal?"** Model answer: many alignments tie on length, and the tie-break in the walk-back decides which lines are called "unchanged"; a run of blank lines or braces can be matched to the wrong block. Patience diff first aligns lines that are unique in both files and recurses between them, sacrificing optimality for readability. Common wrong answer: "the LCS is unique".

**"Would you ship this regex DP in a request path?"** Model answer: not this one, but the idea: use an automata engine (RE2, Go `regexp`, Rust `regex`) that gives the same `O(mn)` guarantee with real regex features, and never a backtracking engine on untrusted patterns; if you must use a backtracker, enforce a timeout and forbid nested quantifiers. Common wrong answer: "regex is fast", which is true until one crafted input takes seconds.

## What mid-level engineers get wrong

- **Copying the LCS border into edit distance.** Consequence: systematic underestimates that the small tests may not catch.
- **`dp[i-1][j-2]` in the star case.** Consequence: `a*` matches exactly one `a`; the bug is invisible on patterns whose stars need one repetition.
- **Slicing strings inside the inner loop.** Consequence: an extra factor of `n` in time and constant allocation; `O(n³)` disguised as `O(n²)`.
- **Choosing the palindrome DP for the substring problem.** Consequence: `O(n²)` memory for no gain over expand-around-centre; the DP is for the subsequence variant and for repeated queries.
- **Treating the counting variant like the optimising one.** Consequence: no `+`-disjointness check, so double counting, and no thought about overflow.
- **Reaching for the full table on long inputs.** Consequence: gigabytes of memory where two rows or a band would do.
- **Assuming a regex engine is linear.** Consequence: a ReDoS incident from a pattern that looked innocent.

## Exercises

```exercise
id: lcs-length
title: Longest common subsequence length
prompt: |
  Return the length of the longest common subsequence of strings `a` and
  `b`. Either string may be empty. Define `dp[i][j]` over prefix lengths
  and fill row by row.
languages: [python, javascript]
entry: lcs_length
starter:
  python: |
    def lcs_length(a, b):
        # dp[i][j] = LCS of a[:i] and b[:j]
        return 0
  javascript: |
    function lcs_length(a, b) {
      // dp[i][j] = LCS of a.slice(0, i) and b.slice(0, j)
      return 0;
    }
tests:
  - args: ["abcde", "ace"]
    expected: 3
  - args: ["abc", "abc"]
    expected: 3
  - args: ["abc", "def"]
    expected: 0
    label: nothing in common
  - args: ["", "abc"]
    expected: 0
    label: empty string
  - args: ["AGGTAB", "GXTXAYB"]
    expected: 4
  - args: ["bl", "yby"]
    expected: 1
    hidden: true
  - args: ["abcba", "abcbcba"]
    expected: 5
    hidden: true
hints:
  - "If the last characters are equal, take 1 + dp[i-1][j-1]; otherwise max(dp[i-1][j], dp[i][j-1])."
  - "Allocate (m+1) x (n+1) so the empty-prefix border is all zeros with no special cases."
```

```exercise
id: edit-distance
title: Edit distance
prompt: |
  Return the minimum number of single-character insertions, deletions and
  substitutions needed to turn `a` into `b`. Either string may be empty.
  Get the border right: `dp[i][0] = i` and `dp[0][j] = j`.
languages: [python, javascript]
entry: edit_distance
starter:
  python: |
    def edit_distance(a, b):
        # dp[i][j] = edits between a[:i] and b[:j]
        return 0
  javascript: |
    function edit_distance(a, b) {
      // dp[i][j] = edits between a.slice(0, i) and b.slice(0, j)
      return 0;
    }
tests:
  - args: ["horse", "ros"]
    expected: 3
  - args: ["intention", "execution"]
    expected: 5
  - args: ["", "abc"]
    expected: 3
    label: all insertions
  - args: ["abc", "abc"]
    expected: 0
    label: identical
  - args: ["kitten", "sitting"]
    expected: 3
  - args: ["flaw", "lawn"]
    expected: 2
    hidden: true
  - args: ["abcdef", "azced"]
    expected: 3
    hidden: true
hints:
  - "On equal last characters copy the diagonal; otherwise 1 + min(diagonal, up, left)."
  - "Trace 'horse' vs 'ros' by hand and check that dp[3][1] is 2 (delete h and o, keep r)."
```

## Senior signals

- You define two-string states as **half-open prefixes** so the empty-prefix border needs no special cases, and you state the border values explicitly (0 for LCS, `i`/`j` for edit distance, `dp[i][0] = 1` for counting).
- You can say **why the case analysis is exhaustive** (what happened to the last character of each prefix) and justify the LCS match case with an **exchange argument** rather than "it is obvious".
- You **walk the table back** to produce the subsequence or the edit script, and you know that ties give different, equally valid answers.
- You know that edit distance with insert/delete only is `m + n − 2·LCS`, that `diff` is LCS on lines in principle and Myers' `O((m+n)D)` inside `git`, and that `difflib` is neither.
- For palindromic substrings you **write expand-around-centre** and mention the DP; for the subsequence variant you reach for the interval DP or `LCS(s, reverse(s))`.
- You get the regex star case right, and you can explain the table as an **NFA simulation**: why the DP is polynomial and a backtracking engine is not.
- You put numbers on the table (10⁸ cells is 800 MB as `int64`, two rows are 160 KB) and you name **banding, bit-parallel rows and Levenshtein automata** as the production optimisations.

## Check yourself

```quiz
- q: >-
    In LCS, when a[i-1] == b[j-1], why is dp[i][j] = 1 + dp[i-1][j-1] safe without also considering dp[i-1][j] and dp[i][j-1]?
  options: ["Because any LCS can be rewritten to end with this matching pair", "Because dp[i-1][j] and dp[i][j-1] are always strictly smaller", "It is not safe; the recurrence must take the max of all three terms", "Because this matched pair must appear in every LCS of the prefixes"]
  answer: 0
  explanation: >-
    The exchange argument: take any LCS of the prefixes; if it does not use this final pair, swap its last match for this pair (or append) and it is at least as long, so matching is never worse. The pair need not be in every LCS, only in some optimal one. The other two terms are at most dp[i-1][j-1] + 1 (they can equal it, so they are not strictly smaller), so including them changes nothing, but the justification is the exchange, not the inequality.
- q: >-
    You compute edit distance and initialise the whole border to 0 as in LCS. What happens?
  options: ["Only the first row and column are wrong; the interior is right", "It returns m + n − 2·LCS, the insert/delete-only edit distance", "Nothing; the interior recurrence corrects the bad border", "The interior underestimates, as deleting a prefix now looks free"]
  answer: 3
  explanation: >-
    The border encodes the cost of deleting or inserting a whole prefix: dp[i][0] = i and dp[0][j] = j. With a zero border, dp['abc', ''] claims 0 edits instead of 3, and every interior cell that routes through the border inherits the error, so the answer underestimates. The border is the base case, and a wrong base case poisons the table rather than being corrected by it.
- q: >-
    Why is the star transition dp[i-1][j] (same j) rather than dp[i-1][j-2]?
  options: ["Because dp[i-1][j-2] is already covered by the zero-copies case", "They are equivalent; both let the star consume one or more characters", "Because j-2 could be negative when the star is the second character", "Because the same x* element may go on to consume more characters"]
  answer: 3
  explanation: >-
    After the star consumes s[i-1], the same 'x*' pattern element may consume more characters, so the pattern position must not advance. 'a*' matching 'aaa' consumes one character at a time while staying on the same element; advancing to j-2 after one character would allow exactly one copy. The zero-copies case is dp[i][j-2], with i unchanged, not dp[i-1][j-2].
- q: >-
    For the longest palindromic substring, which statement is accurate?
  options: ["Expand-around-centre is O(n), since each centre is expanded only once", "Expand-around-centre is also O(n²) time but needs only O(1) space", "The DP is O(n log n), since each length reads only one shorter length", "The O(n²) DP beats expand-around-centre, since it reuses subresults"]
  answer: 1
  explanation: >-
    Both are O(n²) time in the worst case (e.g. 'aaaa…'), since a single centre can expand O(n) times. Expand-around-centre avoids the n² table and is usually faster, since it allocates nothing. The DP table becomes worthwhile when many overlapping palindrome checks are needed, as in palindrome partitioning, which reuses pal[i][j] many times. Manacher's algorithm is the O(n) option, rarely expected.
- q: >-
    An interviewer asks how you would fuzzy-match a query against a million dictionary words with edit distance at most 2. The strongest first answer is:
  options: ["Sort the dictionary, then binary search for the closest word", "Compute only a band of width 2k+1 around the diagonal per word", "Use LCS instead, since it is cheaper to compute than edit distance", "Run the full O(mn) DP against every word, since a million is small"]
  answer: 1
  explanation: >-
    Cells far from the diagonal cannot have distance ≤ k, so the band suffices, costs O(k·n) per word, and is a direct optimisation of the DP you wrote. The next level is avoiding the linear scan altogether with a Levenshtein automaton over a trie or a BK-tree. Binary search does not apply to edit distance; LCS costs the same O(mn); and a million full DPs is wasteful when the interviewer wants the band idea first.
- q: >-
    The regex DP is O(mn) for every input, yet Python's re can take seconds on (a+)+b against thirty a's. What explains the difference?
  options: ["A backtracker must allocate a new table for every alternative it tries", "Python's re is implemented in pure Python, so each step is slower", "The DP memoises each (i, j) state once; a backtracker revisits them", "The DP supports only . and *, so it has fewer cases to check"]
  answer: 2
  explanation: >-
    Each row of the table is the set of pattern positions alive after consuming a prefix, which is an NFA simulation: at most n states per character, so mn work in total. A backtracking engine explores alternatives one at a time and recomputes the same (string position, pattern position) pairs without a memo, which on nested quantifiers is exponential. Python's re is C code, and feature count is not the issue; the missing memo is.
```
