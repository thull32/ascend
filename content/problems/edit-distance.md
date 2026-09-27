---
slug: edit-distance
title: Edit Distance
difficulty: hard
patterns: [dynamic-programming]
lists: [ascend-150]
companies: [google, amazon, microsoft, netflix]
order: 19
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Compare the last characters of the two prefixes. If they are equal, they can be matched for free. If not, the last operation touched one of them: an insert, a delete or a replace."
  - "Let `D[i][j]` be the distance from `a[:i]` to `b[:j]`. Mismatch: `1 + min(D[i-1][j], D[i][j-1], D[i-1][j-1])` for delete, insert, replace."
  - "The base row and column are not zeros: turning `a[:i]` into the empty string takes `i` deletions, and building `b[:j]` from nothing takes `j` inserts."
signatures:
  python:
    name: edit_distance
    starter: |
      def edit_distance(a: str, b: str) -> int:
          pass
  javascript:
    name: edit_distance
    starter: |
      function edit_distance(a, b) {
      }
tests:
  - args: ["", "abc"]
    expected: 3
    label: insert everything
  - args: ["abc", ""]
    expected: 3
    label: delete everything
  - args: ["same", "same"]
    expected: 0
  - args: ["flaw", "lawn"]
    expected: 2
  - args: ["park", "spake"]
    expected: 3
  - args: ["gumbo", "gambol"]
    expected: 2
  - args: ["a", "b"]
    expected: 1
  - args: ["intelligent", "elegant"]
    expected: 6
    hidden: true
  - args: ["abcdef", "azced"]
    expected: 3
    hidden: true
  - args: ["dinitrophenylhydrazine", "benzalphenylhydrazone"]
    expected: 7
    hidden: true
  - args: ["sunday", "saturday"]
    expected: 3
    hidden: true
  - args: ["cart", "march"]
    expected: 3
    hidden: true
time_limit_ms: 4000
---
Given two strings `a` and `b`, return the minimum number of single-character operations needed to turn `a` into `b`. The allowed operations are:

- **insert** a character anywhere,
- **delete** a character,
- **replace** a character with a different one.

Each operation costs 1. This number is the Levenshtein distance between the strings.

### Examples

| Input | Output | Why |
|---|---|---|
| `a = "flaw"`, `b = "lawn"` | `2` | Delete `f`, insert `n` at the end |
| `a = "gumbo"`, `b = "gambol"` | `2` | Replace `u` with `a`, insert `l` at the end |
| `a = ""`, `b = "abc"` | `3` | Three inserts |

### Constraints

- `0 ≤ len(a), len(b) ≤ 500`
- Both strings consist of lowercase English letters.

### Follow-up

The interviewer asks: "I only need to know whether the distance is at most `k`, for a small `k`. Can you beat `O(m · n)`?" Then: "You are building a spell checker over a 100,000-word dictionary. How do you find all words within distance 2 of a typo without comparing against every word?"

## Solution

### The naive approach

Recurse from the end of both strings: if the last characters match, drop both; otherwise try all three operations and take the cheapest. Each mismatch branches three ways, so the call tree is `O(3^(m+n))`. The same pair of prefix lengths `(i, j)` is reached through many different operation sequences.

### The insight

Consider an optimal edit script and look at what happens to the last characters, `a[i-1]` and `b[j-1]`:

- If they are equal, there is an optimal script that leaves them alone and matches them, so the cost is that of the shorter prefixes.
- Otherwise, the last character of `b` is produced by inserting it (then solve `a[:i]` → `b[:j-1]`), or the last character of `a` is deleted (then `a[:i-1]` → `b[:j]`), or the one is replaced by the other (then `a[:i-1]` → `b[:j-1]`).

Every case lands on a pair of prefixes, so the state is `(i, j)`: `(m + 1)(n + 1)` states, three options each.

### The DP

- **State.** `D[i][j]` is the minimum number of operations turning `a[:i]` into `b[:j]`.
- **Transition.** If `a[i-1] == b[j-1]`: `D[i][j] = D[i-1][j-1]`. Otherwise `D[i][j] = 1 + min(D[i-1][j], D[i][j-1], D[i-1][j-1])`: delete, insert, replace.
- **Base cases.** `D[i][0] = i` (delete all `i` characters) and `D[0][j] = j` (insert all `j`).
- **Iteration order.** Rows top to bottom, each left to right: every cell reads up, left and upper-left.
- **Answer.** `D[m][n]`.

### Worked table for `a = "cart"`, `b = "march"`

| `a` \ `b` | "" | m | a | r | c | h |
|---|---|---|---|---|---|---|
| "" | 0 | 1 | 2 | 3 | 4 | 5 |
| c | 1 | 1 | 2 | 3 | 3 | 4 |
| a | 2 | 2 | 1 | 2 | 3 | 4 |
| r | 3 | 3 | 2 | 1 | 2 | 3 |
| t | 4 | 4 | 3 | 2 | 2 | **3** |

Trace the answer back from the bottom-right: `t` vs `h` is a replace from `D[3][4] = 2`; that cell (`"car"` → `"marc"`) is an insert of `c` from `D[3][3] = 1`; `r` matches `r` and `a` matches `a` (diagonal, free); and `D[1][1] = 1` is replacing `c` with `m`. The script is: replace `c → m` (`mart`), insert `c` after `r` (`marct`), replace `t → h` (`march`). Three operations.

Note the diagonal of 1s from `(1, 1)` to `(3, 3)`: once `c → m` is paid, the matching `a` and `r` ride along for free.

### Tabulated version

```python
def edit_distance_table(a: str, b: str) -> int:
    m, n = len(a), len(b)
    D = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        D[i][0] = i
    for j in range(n + 1):
        D[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                D[i][j] = D[i - 1][j - 1]
            else:
                D[i][j] = 1 + min(D[i - 1][j],       # delete a[i-1]
                                  D[i][j - 1],       # insert b[j-1]
                                  D[i - 1][j - 1])   # replace
    return D[m][n]
```

Time `O(m · n)`: 250,000 cells at the limits. Space `O(m · n)`.

### Space-optimised version

As in Longest Common Subsequence: one row, plus a variable holding the upper-left value before it is overwritten. The only differences are the base values (`row[j] = j` initially and `i` at the start of each row) and the three-way `min`.

```python
def edit_distance(a: str, b: str) -> int:
    if len(b) > len(a):
        a, b = b, a                        # distance is symmetric; keep the row short
    row = list(range(len(b) + 1))          # D[0][j] = j
    for i in range(1, len(a) + 1):
        diag = row[0]                      # D[i-1][0]
        row[0] = i                         # D[i][0]
        for j in range(1, len(b) + 1):
            up = row[j]                    # D[i-1][j]
            if a[i - 1] == b[j - 1]:
                row[j] = diag
            else:
                row[j] = 1 + min(up, row[j - 1], diag)
            diag = up
    return row[len(b)]
```

Time `O(m · n)`, space `O(min(m, n))`. Swapping the strings is safe because insert and delete are mirror images, so the distance is symmetric.

```viz
{"type": "dp", "algorithm": "edit-distance", "a": "cart", "b": "march", "title": "Edit distance from cart to march", "caption": "Matches copy the diagonal; mismatches take 1 + min(up, left, diagonal)."}
```

### Common mistakes

- Initialising the first row and column to 0 (copying the LCS template). Then `("", "abc")` returns 0.
- On a match, still paying 1 (`1 + min(up, left, diag)` for every cell). The match case is the diagonal at no cost. Writing `min(diag, 1 + up, 1 + left)` is also correct, just unnecessary: neighbouring cells differ by at most 1, so the free diagonal is never worse.
- Mixing up which neighbour is insert and which is delete. It does not change the number, but it matters when you reconstruct the script, and interviewers ask.
- In the one-row version, overwriting `row[0]` before saving it as the first `diag`.

### How to discuss it

Say "two sequences, prefixes as state", give the three operations as three arrows (up = delete, left = insert, diagonal = replace or free match), and insist on the non-zero base row and column. Fill a small table and read an edit script back out of it.

For "distance at most `k`": any cell with `|i - j| > k` already costs more than `k` (you need at least `|i - j|` inserts or deletes to fix the length difference), so only a diagonal band of width `2k + 1` matters. That gives `O(k · min(m, n))` time. For the spell checker, running the full DP against every word is `O(dictionary × m × n)`. Better options: put the dictionary in a trie and run the DP row by row down the trie, pruning any branch whose row minimum exceeds 2, so shared prefixes share work; or index words in a BK-tree, which uses the triangle inequality of edit distance to skip most of the dictionary. Production spell checkers also weight operations (a substitution between adjacent keys is cheaper), which only changes the costs in the same recurrence, and often allow swapping two adjacent characters as one operation (Damerau–Levenshtein), which adds a fourth term reading `D[i-2][j-2]`.
