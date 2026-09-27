---
slug: longest-common-subsequence
title: Longest Common Subsequence
difficulty: medium
patterns: [dynamic-programming]
lists: [core-75, ascend-150]
companies: [google, amazon, microsoft]
order: 14
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Compare the last characters of the two strings. If they match, that character can end the common subsequence. If not, at least one of them is not used."
  - "Let `L[i][j]` be the LCS length of the prefixes `a[:i]` and `b[:j]`. On a match, `L[i][j] = L[i-1][j-1] + 1`; otherwise `max(L[i-1][j], L[i][j-1])`."
  - "Row `i` only reads row `i - 1` and the current row, so two rows (or one row plus a saved diagonal value) are enough."
signatures:
  python:
    name: longest_common_subsequence
    starter: |
      def longest_common_subsequence(a: str, b: str) -> int:
          pass
  javascript:
    name: longest_common_subsequence
    starter: |
      function longest_common_subsequence(a, b) {
      }
tests:
  - args: ["stone", "longest"]
    expected: 3
  - args: ["abc", "abc"]
    expected: 3
    label: identical strings
  - args: ["abc", "def"]
    expected: 0
    label: nothing in common
  - args: ["a", "a"]
    expected: 1
  - args: ["agcat", "gac"]
    expected: 2
  - args: ["kitchen", "thicken"]
    expected: 4
  - args: ["programming", "gaming"]
    expected: 6
    label: the second string is entirely a subsequence of the first
  - args: ["oxcpqrsvwf", "shmtulqrypy"]
    expected: 2
    hidden: true
  - args: ["aaaa", "aa"]
    expected: 2
    hidden: true
  - args: ["bsbininm", "jmjkbkjkv"]
    expected: 1
    hidden: true
  - args: ["dynamic", "programming"]
    expected: 3
    hidden: true
  - args: ["xmjyauzqq", "mzjawxuqq"]
    expected: 6
    hidden: true
time_limit_ms: 4000
---
Given two strings `a` and `b`, return the length of their longest common subsequence: the longest string that can be obtained from both `a` and `b` by deleting zero or more characters without reordering the rest. If they share no characters, return `0`.

### Examples

| Input | Output | Why |
|---|---|---|
| `a = "stone"`, `b = "longest"` | `3` | `"one"`: `o`, `n`, `e` appear in this order in both strings |
| `a = "agcat"`, `b = "gac"` | `2` | `"ga"`, `"gc"` and `"ac"` all work; no length-3 string does |
| `a = "abc"`, `b = "def"` | `0` | No character in common |

### Constraints

- `1 ≤ len(a), len(b) ≤ 1000`
- Both strings consist of lowercase English letters.

### Follow-up

The interviewer asks: "Return the subsequence itself, not just its length." Then: "The strings are two versions of a 100,000-line file and you are building `diff`. What do you change?"

## Solution

### The naive approach

Enumerate all `2^m` subsequences of `a` and test each against `b` in `O(n)`. Or recurse on the last characters without caching, which branches in two on every mismatch and is exponential for the same reason: the pair of prefixes `(a[:i], b[:j])` is reached by many different paths.

### The insight

Look at the last characters `a[i-1]` and `b[j-1]` of two prefixes:

- If they are equal, some LCS of the prefixes ends with that character (matching them can never hurt), so the answer is 1 plus the LCS of both prefixes shortened by one.
- If they differ, they cannot both be the last character of a common subsequence, so drop one of them. You do not know which, so try both and keep the better.

Either way the problem reduces to a pair of shorter prefixes. There are only `(m + 1)(n + 1)` pairs.

### The DP

- **State.** `L[i][j]` is the length of the LCS of `a[:i]` and `b[:j]`.
- **Transition.** If `a[i-1] == b[j-1]`: `L[i][j] = L[i-1][j-1] + 1`. Otherwise: `L[i][j] = max(L[i-1][j], L[i][j-1])`.
- **Base cases.** `L[0][j] = L[i][0] = 0`: an empty string has nothing in common with anything.
- **Iteration order.** Rows top to bottom, each row left to right. A cell reads its upper-left, upper and left neighbours.
- **Answer.** `L[m][n]`.

### Worked table for `a = "agcat"`, `b = "gac"`

| `a` \ `b` | "" | g | a | c |
|---|---|---|---|---|
| "" | 0 | 0 | 0 | 0 |
| a | 0 | 0 | 1 | 1 |
| g | 0 | 1 | 1 | 1 |
| c | 0 | 1 | 1 | 2 |
| a | 0 | 1 | 2 | 2 |
| t | 0 | 1 | 2 | **2** |

Two cells to read slowly. Row `c`, column `c`: the characters match, so take the upper-left value (`"ag"` vs `"ga"`, which is 1) and add 1, giving 2 (`"gc"`). Row `a`, column `a` (second `a` in `"agcat"`): a match again, upper-left is `L[3][1]` (`"agc"` vs `"g"`) = 1, so 2 (`"ga"`). Mismatched cells copy the larger of up and left.

### Tabulated version

```python
def longest_common_subsequence_table(a: str, b: str) -> int:
    m, n = len(a), len(b)
    L = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                L[i][j] = L[i - 1][j - 1] + 1
            else:
                L[i][j] = max(L[i - 1][j], L[i][j - 1])
    return L[m][n]
```

Time `O(m · n)`, one million cells at the limits. Space `O(m · n)`.

### Space-optimised version

Row `i` needs row `i - 1` (for "up" and "upper-left") and itself (for "left"). Keep one row and save the upper-left value in a variable before it is overwritten.

```python
def longest_common_subsequence(a: str, b: str) -> int:
    if len(b) > len(a):
        a, b = b, a                        # make the row the shorter string
    row = [0] * (len(b) + 1)
    for ch in a:
        diag = 0                           # L[i-1][0]
        for j in range(1, len(b) + 1):
            up = row[j]                    # L[i-1][j], about to be overwritten
            if ch == b[j - 1]:
                row[j] = diag + 1
            else:
                row[j] = max(up, row[j - 1])
            diag = up                      # becomes L[i-1][j-1] for the next j
    return row[len(b)]
```

Time `O(m · n)`, space `O(min(m, n))`.

```viz
{"type": "dp", "algorithm": "lcs", "a": "agcat", "b": "gac", "title": "LCS table for agcat and gac", "caption": "A match takes the diagonal plus one; a mismatch takes the larger of up and left."}
```

### Common mistakes

- On a match, taking `max(L[i-1][j], L[i][j-1]) + 1`. That can count one character twice (for `"aa"` vs `"a"` it returns 2).
- Confusing subsequence with substring. The longest common *substring* resets to 0 on a mismatch; LCS carries the best forward.
- In the one-row version, forgetting to save the diagonal before overwriting `row[j]`, so the "upper-left" read gets the current row's value.

### How to discuss it

This is the canonical two-sequence DP; say "state is a pair of prefixes" and the rest follows. Explain the match case (greedy matching of equal last characters is safe) and the mismatch case (one of them is unused; try both). Fill a small table and point at the three arrows.

For reconstruction, keep the full table and walk back from `(m, n)`: on a match go diagonal and emit the character, otherwise move towards the larger of up and left. That needs `O(mn)` memory; Hirschberg's divide-and-conquer recovers the sequence in `O(min(m, n))` space by computing forward and backward half-tables and splitting at the midpoint. For `diff`, `O(mn)` on 100,000-line files is `10¹⁰` cells, too slow. Real diff tools use Myers' algorithm, which runs in `O((m + n) · D)` where `D` is the size of the edit script: fast when the files are similar, which is the common case. Also hash each line first so the "characters" are line IDs compared in `O(1)`.
