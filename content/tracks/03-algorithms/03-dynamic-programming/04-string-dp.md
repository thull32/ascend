---
slug: string-dp
title: "String DP: LCS, edit distance, palindromes and regex"
description: Two-string DP with prefix states, the LCS and edit-distance tables filled cell by cell, palindromes as interval states, and the regex-matching recurrence including the star case.
minutes: 50
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

The equal case deserves a sentence of justification because interviewers ask: if `a[i-1] = b[j-1] = x`, why not also consider dropping one of them? Because any LCS of the two prefixes that does not end with this pair of `x`s can be modified to end with them without getting shorter (replace its last match, or append this one), so matching them is always safe. That is an exchange argument, the same tool as in [greedy proofs](/learn/algorithms/greedy/greedy-and-exchange-arguments).

**Order.** Row by row, increasing `i` then `j`: the transition reads `(i-1, j-1)`, `(i-1, j)` and `(i, j-1)`, all filled earlier. **Answer.** `dp[m][n]`.

Trace `a = "abcde"`, `b = "ace"`:

| | `""` | a | c | e |
|---|---|---|---|---|
| `""` | 0 | 0 | 0 | 0 |
| **a** | 0 | **1** | 1 | 1 |
| **b** | 0 | 1 | 1 | 1 |
| **c** | 0 | 1 | **2** | 2 |
| **d** | 0 | 1 | 2 | 2 |
| **e** | 0 | 1 | 2 | **3** |

Bold cells are diagonal matches. `dp[3][2]` (`"abc"` vs `"ac"`): `c = c`, so `1 + dp[2][1] = 1 + 1 = 2`. `dp[4][3]` (`"abcd"` vs `"ace"`): `d ≠ e`, so `max(dp[3][3], dp[4][2]) = max(2, 2) = 2`.

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

Time `O(mn)`, space `O(mn)`; with two rolling rows `O(min(m, n))`. To recover the subsequence itself, walk back from `(m, n)`: on a match, emit the character and go diagonally; otherwise go to whichever of up/left holds the larger value. `diff` is LCS on lines instead of characters: lines in the LCS are unchanged, everything else is an insertion or deletion.

## Edit distance

The minimum number of single-character insertions, deletions or substitutions to turn `a` into `b`. `"kitten" → "sitting"` takes 3: substitute k→s, substitute e→i, insert g.

**State.** `dp[i][j]` = the edit distance between `a[0..i)` and `b[0..j)`.

**Base cases.** `dp[i][0] = i` (delete everything), `dp[0][j] = j` (insert everything). This is the first DP in the module where the border is not all zeros or all ones; get it wrong and every cell is wrong.

**Transition.** Consider the last characters again. If `a[i-1] = b[j-1]`, no edit is needed for them: `dp[i][j] = dp[i-1][j-1]`. Otherwise the last operation was one of three, and you take the cheapest:

- **Substitute** `a[i-1]` with `b[j-1]`: `1 + dp[i-1][j-1]`.
- **Delete** `a[i-1]`: `1 + dp[i-1][j]` (now match the shorter `a` against all of `b`'s prefix).
- **Insert** `b[j-1]` at the end of `a`: `1 + dp[i][j-1]`.

$$dp[i][j] = \begin{cases} dp[i-1][j-1] & a[i-1] = b[j-1] \\ 1 + \min(dp[i-1][j-1],\, dp[i-1][j],\, dp[i][j-1]) & \text{otherwise} \end{cases}$$

Trace `a = "horse"`, `b = "ros"`:

| | `""` | r | o | s |
|---|---|---|---|---|
| `""` | 0 | 1 | 2 | 3 |
| **h** | 1 | 1 | 2 | 3 |
| **o** | 2 | 2 | 1 | 2 |
| **r** | 3 | 2 | 2 | 2 |
| **s** | 4 | 3 | 3 | 2 |
| **e** | 5 | 4 | 4 | **3** |

`dp[2][2]` (`"ho"` vs `"ro"`): `o = o`, so `dp[1][1] = 1` (substitute h→r). `dp[3][1]` (`"hor"` vs `"r"`): `r = r`, so `dp[2][0] = 2` (delete h and o). `dp[5][3]`: `e ≠ s`, `1 + min(dp[4][2], dp[4][3], dp[5][2]) = 1 + min(3, 2, 4) = 3`. The answer is 3: delete h, substitute... one optimal script is `horse → rorse → rose → ros` (substitute, delete, delete).

```viz
{"type": "dp", "algorithm": "edit-distance", "a": "horse", "b": "ros", "title": "Edit distance: min of substitute (diagonal), delete (up), insert (left), each plus 1", "caption": "The border is i and j, not 0. Every interior cell reads three neighbours."}
```

Note the shape: LCS and edit distance read the same three neighbours; they differ in the combine operation and the border. In fact, when only insertions and deletions are allowed (no substitution), `distance = m + n − 2·LCS`. The two problems are the same computation seen from different sides.

A practical note: spell checkers and fuzzy search do not run full edit distance against every dictionary word. They bound the distance (`k ≤ 2`) and only compute a band of width `2k + 1` around the diagonal, giving `O(k·n)` per comparison, or use precomputed structures (BK-trees, Levenshtein automata). If an interviewer asks "how would you fuzzy-match a query against a million strings", the banded DP is the first optimisation to name.

## Palindromes: interval state on one string

"Longest palindromic substring of `"babad"`" is `"bab"` or `"aba"`. Palindromes are about the two *ends* of a range, so the natural state is an interval, not a prefix pair.

**State.** `pal[i][j]` = true if `s[i..j]` (inclusive) is a palindrome.

**Transition.** `s[i..j]` is a palindrome iff `s[i] = s[j]` and the inside, `s[i+1..j-1]`, is a palindrome (or has length ≤ 1). So `pal[i][j] = (s[i] == s[j]) and (j − i < 2 or pal[i+1][j-1])`.

**Order.** The transition reads `(i+1, j-1)`, a *shorter* interval. So fill by increasing length: all length-1 intervals (always true), then length 2, then 3, and so on. Equivalently, iterate `i` from `n-1` down to 0 and `j` from `i` up to `n-1`; then `(i+1, j-1)` has already been computed.

**Answer.** The longest `(i, j)` with `pal[i][j]` true, or the count of true cells for [Palindromic Substrings](/practice/palindromic-substrings).

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

`O(n²)` time and space. The honest senior answer is that for the *substring* problem, expand-around-centre is also `O(n²)` time, uses `O(1)` space, is shorter, and is usually faster in practice; write that one in an interview and mention the DP. The DP earns its keep when many overlapping palindrome queries are needed (palindrome partitioning) or for the *subsequence* variant, which has no centre to expand from.

Longest palindromic *subsequence* (characters need not be contiguous): `dp[i][j]` = length of the longest palindromic subsequence within `s[i..j]`. If `s[i] = s[j]`, they pair up: `2 + dp[i+1][j-1]`. Otherwise drop one end: `max(dp[i+1][j], dp[i][j-1])`. Same fill order by length. Or notice that it equals `LCS(s, reverse(s))` and reuse the LCS code; both are `O(n²)`.

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

`dp[0][2]` (`""` vs `c*`): star, zero copies, `dp[0][0] = T`. `dp[1][3]` (`a` vs `c*a`): literal `a` matches, `dp[0][2] = T`. `dp[2][4]` (`aa` vs `c*a*`): star on `a`; zero copies gives `dp[2][2] = F`; at-least-one gives `s[1] = a` matches `a` and `dp[1][4] = T`. `dp[3][5]`: literal `b` matches, `dp[2][4] = T`. Match.

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

`O(mn)`. Production regex engines are not this: they compile to automata (RE2, Rust's `regex`) for guaranteed linear time, or backtrack (PCRE, JavaScript) and can go exponential on patterns like `(a*)*b`, which is the source of ReDoS vulnerabilities. Knowing that the interview DP is polynomial *because* the state space is `m × n` while a backtracking matcher's state is the whole call history is exactly the kind of connection a senior engineer makes.

## The two-string template

| Problem | State `dp[i][j]` | Match case | Mismatch case | Border |
|---|---|---|---|---|
| LCS | LCS length of prefixes | `1 + diag` | `max(up, left)` | 0 |
| Edit distance | min edits between prefixes | `diag` | `1 + min(diag, up, left)` | `i`, `j` |
| Distinct subsequences | ways `b[0..j)` appears in `a[0..i)` | `diag + up` | `up` | `dp[i][0] = 1` |
| Interleaving string | `c[0..i+j)` is an interleaving of `a[0..i)`, `b[0..j)` | `(a[i-1]==c[i+j-1] and up) or (b[j-1]==c[i+j-1] and left)` | same | from the two strings alone |
| Regex | `s[0..i)` matches `p[0..j)` | `diag` | star: `dp[i][j-2] or (match and up)` | star chains |

Every one of them is "look at the last character of each prefix, enumerate what could have happened to it". Once that reflex is installed, an unfamiliar two-string problem is a ten-minute derivation instead of a guess.

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

- You define two-string states as **half-open prefixes** so the empty-prefix border needs no special cases, and you state the border values explicitly (0 for LCS, `i`/`j` for edit distance).
- You justify the LCS match case with an **exchange argument** rather than "it is obvious".
- You know that edit distance with insert/delete only is `m + n − 2·LCS`, and that `diff` is LCS on lines.
- For palindromic substrings you **write expand-around-centre** and mention the DP; for the subsequence variant you reach for the interval DP or `LCS(s, reverse(s))`.
- You get the regex star case right: `dp[i][j-2]` for zero copies **or** `match and dp[i-1][j]` for one-or-more, and you can say why `dp[i-1][j-2]` is wrong.
- You connect the interview DP to production: banded edit distance for fuzzy search, automata-based regex engines for guaranteed linear time, and ReDoS as the failure mode of backtracking engines.

## Check yourself

```quiz
- q: >-
    In LCS, when a[i-1] == b[j-1], why is dp[i][j] = 1 + dp[i-1][j-1] safe without also considering dp[i-1][j] and dp[i][j-1]?
  options: ["Because those two values are always smaller", "Because any common subsequence of the two prefixes can be rearranged to end with this matching pair without becoming shorter, so matching is never worse", "Because the strings are sorted", "It is not safe; the full recurrence needs all three"]
  answer: 1
  explanation: >-
    The exchange argument: take any LCS of the prefixes; if it does not use this final pair, swap its last match for this pair (or append) and it is at least as long. The other two terms are at most dp[i-1][j-1] + 1 anyway, so including them changes nothing, but the justification is the exchange, not the inequality.
- q: >-
    You compute edit distance and initialise the whole border to 0 as in LCS. What happens?
  options: ["Only the first row and column are wrong", "Every cell is wrong because the border encodes the cost of deleting or inserting a whole prefix; dp[i][j] then underestimates", "Nothing; the interior recurrence corrects it", "The result is m + n − 2·LCS"]
  answer: 1
  explanation: >-
    With a zero border, dp['abc', ''] claims 0 edits instead of 3, and every cell that routes through the border inherits the error. The border is the base case, and a wrong base case poisons the table.
- q: >-
    Why is the star transition dp[i-1][j] (same j) rather than dp[i-1][j-2]?
  options: ["Because j-2 could be negative", "Because after the star consumes s[i-1], the same 'x*' pattern element may consume more characters, so the pattern position must not advance", "Because dp[i-1][j-2] is the zero-copies case", "They are equivalent"]
  answer: 1
  explanation: >-
    'a*' matching 'aaa' consumes one character at a time while staying on the same pattern element; advancing to j-2 after one character would allow exactly one copy. The zero-copies case is dp[i][j-2], with i unchanged.
- q: >-
    For the longest palindromic substring, which statement is accurate?
  options: ["The O(n²) DP is strictly better than expand-around-centre", "Expand-around-centre matches the DP's O(n²) time with O(1) space and is usually faster; the DP table becomes worthwhile when many overlapping palindrome checks are needed", "Expand-around-centre is O(n)", "The DP is O(n log n)"]
  answer: 1
  explanation: >-
    Both are O(n²) time in the worst case (e.g. 'aaaa…'). Expand-around-centre avoids the n² table. Palindrome partitioning and similar problems reuse pal[i][j] many times, which is when precomputing the table pays. Manacher's algorithm is the O(n) option, rarely expected.
- q: >-
    An interviewer asks how you would fuzzy-match a query against a million dictionary words with edit distance at most 2. The strongest first answer is:
  options: ["Run the full O(mn) DP against every word; a million is small", "Bound the distance and compute only a band of width 2k+1 around the diagonal (O(k·n) per word), then discuss indexing structures such as BK-trees or Levenshtein automata to avoid scanning every word", "Sort the dictionary and binary search", "Use LCS instead"]
  answer: 1
  explanation: >-
    Cells far from the diagonal cannot have distance ≤ k, so the band suffices and is a direct optimisation of the DP you just wrote. The next level is avoiding the linear scan altogether. Binary search does not apply to edit distance; a million full DPs is wasteful but the interviewer wants the band idea first.
```
