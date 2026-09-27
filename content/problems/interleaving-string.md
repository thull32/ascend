---
slug: interleaving-string
title: Interleaving String
difficulty: medium
patterns: [dynamic-programming]
lists: [ascend-150]
companies: [google, amazon, microsoft]
order: 18
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "If the lengths do not add up, the answer is false. Otherwise, after using `i` characters of `s1` and `j` of `s2`, you have produced exactly `s3[:i + j]`."
  - "Let `can[i][j]` say whether `s3[:i+j]` is an interleaving of `s1[:i]` and `s2[:j]`. Its last character came from `s1` or from `s2`; check both."
  - "When both strings offer the needed character, greedily choosing one can fail later. The table keeps both options alive."
signatures:
  python:
    name: is_interleave
    starter: |
      def is_interleave(s1: str, s2: str, s3: str) -> bool:
          pass
  javascript:
    name: is_interleave
    starter: |
      function is_interleave(s1, s2, s3) {
      }
tests:
  - args: ["ab", "cd", "acbd"]
    expected: true
  - args: ["ab", "cd", "abdc"]
    expected: false
    label: each string's own order must be kept
  - args: ["", "", ""]
    expected: true
    label: all empty
  - args: ["abc", "", "abc"]
    expected: true
    label: one input empty
  - args: ["a", "b", "ab"]
    expected: true
  - args: ["abc", "d", "abcde"]
    expected: false
    label: lengths do not add up
  - args: ["ca", "cb", "cbca"]
    expected: true
    label: preferring s1 on a tie leads to a dead end
  - args: ["aa", "ab", "aaba"]
    expected: true
    hidden: true
  - args: ["xxy", "xxz", "xxxzxy"]
    expected: true
    hidden: true
  - args: ["aabd", "abdc", "aabdbadc"]
    expected: false
    hidden: true
  - args: ["abc", "abc", "aabcbc"]
    expected: true
    hidden: true
  - args: ["abc", "abc", "abcacb"]
    expected: false
    hidden: true
time_limit_ms: 4000
---
Given strings `s1`, `s2` and `s3`, decide whether `s3` can be formed by interleaving `s1` and `s2`: splitting each of `s1` and `s2` into pieces and merging the pieces so that every character of both strings is used exactly once and the characters of `s1` stay in their original order, as do the characters of `s2`.

Equivalently: can you colour each character of `s3` red or blue so that the red characters, read left to right, spell `s1` and the blue characters spell `s2`?

### Examples

| Input | Output | Why |
|---|---|---|
| `s1 = "ab"`, `s2 = "cd"`, `s3 = "acbd"` | `true` | `a`(1) `c`(2) `b`(1) `d`(2) |
| `s1 = "ab"`, `s2 = "cd"`, `s3 = "abdc"` | `false` | `d` would have to come before `c`, breaking `s2`'s order |
| `s1 = "ca"`, `s2 = "cb"`, `s3 = "cbca"` | `true` | `c`(2) `b`(2) `c`(1) `a`(1); taking the first `c` from `s1` fails |

### Constraints

- `0 ≤ len(s1), len(s2) ≤ 100`
- `0 ≤ len(s3) ≤ 200`
- All strings consist of lowercase English letters.

### Follow-up

The interviewer asks: "Can you use `O(len(s2))` extra memory?" Then: "Now there are `k` strings to interleave instead of two. How does the cost grow?"

## Solution

### The naive approach

Walk `s3` left to right; at each character, if it matches the next unused character of `s1`, try taking it from `s1`; if it matches the next of `s2`, try that too; backtrack on failure. When both match, the search branches. On inputs such as `s1 = "aaa…ab"`, `s2 = "aaa…ac"` with an `s3` that fails only at its last character, it tries every way of splitting the run of `a`s between the two strings: exponentially many. Most of those branches arrive at the same `(i, j)` position pair and redo the same work.

Pure greedy (always prefer `s1` on a tie) is wrong: on `"ca"`, `"cb"`, `"cbca"` it takes the first `c` from `s1`, then needs `b` but `s1` offers `a` and `s2` offers `c`.

### The insight

The state of the search is fully described by how many characters of each input have been used, `(i, j)`. The position in `s3` is then forced: `i + j`. There are `(m + 1)(n + 1)` such pairs. For each, the last character placed, `s3[i + j - 1]`, came from either `s1[i - 1]` or `s2[j - 1]`.

### The DP

- **State.** `can[i][j]` is true exactly when `s3[:i + j]` is an interleaving of `s1[:i]` and `s2[:j]`.
- **Transition.** With `c = s3[i + j - 1]`: `can[i][j] = (i > 0 and can[i-1][j] and s1[i-1] == c) or (j > 0 and can[i][j-1] and s2[j-1] == c)`.
- **Base case.** `can[0][0] = True`. The first row (only `s2` used) and first column (only `s1` used) follow from the same transition with one term missing: they stay true only while the prefixes match `s3` exactly.
- **Iteration order.** Rows top to bottom, each left to right; a cell reads the cell above and the cell to its left.
- **Answer.** `can[m][n]`, after returning false if `m + n != len(s3)`.

### Worked table for `s1 = "ca"`, `s2 = "cb"`, `s3 = "cbca"`

Rows are prefixes of `s1`, columns prefixes of `s2`. Cell `(i, j)` has just placed `s3[i + j - 1]`.

| `s1` \ `s2` | "" | c | cb |
|---|---|---|---|
| "" | T | T | T |
| c | T | F | **T** |
| ca | F | F | **T** |

- `(0, 1)`, `(0, 2)`: `s2 = "cb"` matches `s3[:2] = "cb"`, so the first row is true.
- `(1, 0)`: `s1[0] = 'c' = s3[0]`, true. `(2, 0)`: `s1[:2] = "ca"` is not `"cb"`, false.
- `(1, 1)`: needs `s3[1] = 'b'` from `s1[0] = 'c'` or `s2[0] = 'c'`: false. This is where greedy dies.
- `(1, 2)`: needs `s3[2] = 'c'`; from above, `can[0][2]` is true and `s1[0] = 'c'`: true.
- `(2, 2)`: needs `s3[3] = 'a'`; from above, `can[1][2]` is true and `s1[1] = 'a'`: true.

### Tabulated version

```python
def is_interleave_table(s1: str, s2: str, s3: str) -> bool:
    m, n = len(s1), len(s2)
    if m + n != len(s3):
        return False
    can = [[False] * (n + 1) for _ in range(m + 1)]
    can[0][0] = True
    for i in range(m + 1):
        for j in range(n + 1):
            if i == 0 and j == 0:
                continue
            c = s3[i + j - 1]
            from_s1 = i > 0 and can[i - 1][j] and s1[i - 1] == c
            from_s2 = j > 0 and can[i][j - 1] and s2[j - 1] == c
            can[i][j] = from_s1 or from_s2
    return can[m][n]
```

Time `O(m · n)`, space `O(m · n)`.

### Space-optimised version

A cell reads the cell above (same column, previous row) and the cell to its left (current row, already updated). One array indexed by `j`, updated left to right, holds exactly those two values: before the update `row[j]` is "above", and `row[j - 1]` is "left".

```python
def is_interleave(s1: str, s2: str, s3: str) -> bool:
    m, n = len(s1), len(s2)
    if m + n != len(s3):
        return False
    row = [False] * (n + 1)
    for i in range(m + 1):
        for j in range(n + 1):
            if i == 0 and j == 0:
                row[0] = True
                continue
            c = s3[i + j - 1]
            from_s1 = i > 0 and row[j] and s1[i - 1] == c         # row[j] is still the row above
            from_s2 = j > 0 and row[j - 1] and s2[j - 1] == c     # row[j - 1] is this row
            row[j] = from_s1 or from_s2
    return row[n]
```

Time `O(m · n)`, space `O(n)`; swap the roles of `s1` and `s2` to make it `O(min(m, n))`.

### Common mistakes

- Forgetting the length check; `("abc", "d", "abcde")` can otherwise read past the end of `s3` or return true on a prefix.
- Greedy tie-breaking, as shown.
- Using a separate index `k` for `s3` as part of the state. It is redundant (`k = i + j`), and adding it makes the table three-dimensional for no reason.
- Treating it as "is `s1` a subsequence of `s3` and `s2` a subsequence of `s3`". Both checks can pass, with the right letter counts, when no interleaving exists: `("ab", "ab", "abba")` passes both, but `s3` ends in `a` while both inputs end in `b`, so the last character cannot come from either.

### How to discuss it

Point out that `(i, j)` determines the position in `s3`, so the state is two-dimensional. Say the transition as "the last character of `s3[:i+j]` came from `s1` or from `s2`", give the base case and the length check, fill a small table, then reduce to one row. Kill greedy with the `"ca" / "cb"` example.

For `k` strings the state becomes a `k`-tuple of indices, so the table has `Π(len + 1)` cells: exponential in `k`. That is correct but only practical for small `k`, and it is worth saying so. You can also frame the problem as reachability in a grid DAG from `(0, 0)` to `(m, n)`, where a BFS or memoised DFS visits each cell once; same complexity, sometimes faster in practice because it only explores reachable cells.
