---
slug: longest-palindromic-substring
title: Longest Palindromic Substring
difficulty: medium
patterns: [dynamic-programming]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, google, meta]
order: 5
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "A substring `s[i..j]` is a palindrome exactly when its two end characters match and the part strictly inside, `s[i+1..j-1]`, is a palindrome."
  - "That makes `pal[i][j]` depend on `pal[i+1][j-1]`: a shorter interval. Fill by increasing length, or with `i` running downwards."
  - "Every palindrome has a centre: a character (odd length) or a gap between two characters (even length). Expanding outwards from all `2n - 1` centres needs no table at all."
signatures:
  python:
    name: longest_palindrome
    starter: |
      def longest_palindrome(s: str) -> str:
          pass
  javascript:
    name: longest_palindrome
    starter: |
      function longest_palindrome(s) {
      }
tests:
  - args: ["a"]
    expected: "a"
    label: single character
  - args: ["zzcivicq"]
    expected: "civic"
  - args: ["abccbx"]
    expected: "bccb"
    label: even length
  - args: ["noonday"]
    expected: "noon"
  - args: ["banana"]
    expected: "anana"
  - args: ["aaaa"]
    expected: "aaaa"
    label: all the same character
  - args: ["tattarrattat"]
    expected: "tattarrattat"
    label: the whole string
  - args: ["caabbaaxy"]
    expected: "aabbaa"
  - args: ["qwerracecarzx"]
    expected: "racecar"
    hidden: true
  - args: ["mississippi"]
    expected: "ississi"
    hidden: true
  - args: ["7x7y1221z"]
    expected: "1221"
    hidden: true
    label: digits, a shorter palindrome appears first
  - args: ["pqrstuvwxyzzyxwvutsrqpq"]
    expected: "pqrstuvwxyzzyxwvutsrqp"
    hidden: true
time_limit_ms: 4000
---
Given a string `s`, return its longest contiguous substring that reads the same forwards and backwards.

Every input to this problem has exactly one longest palindromic substring, so the answer is unambiguous.

### Examples

| Input | Output | Why |
|---|---|---|
| `"zzcivicq"` | `"civic"` | `"zz"` is a palindrome too, but shorter |
| `"abccbx"` | `"bccb"` | Even-length palindromes have no middle character |
| `"banana"` | `"anana"` | Palindromes can overlap: `"ana"` appears twice inside it |

### Constraints

- `1 ≤ len(s) ≤ 1000`
- `s` consists of ASCII letters and digits.

### Follow-up

The interviewer asks: "Your solution is quadratic. Is linear time possible?" Then: "Now I want the longest palindromic *subsequence* (characters need not be contiguous). Which parts of your DP change?"

## Solution

### The naive approach

Check every substring: there are about `n²/2` of them, and checking one costs `O(n)`, so `O(n³)`. For `n = 1000` that is on the order of `10⁸` character comparisons, and it throws away a useful fact: checking `s[i..j]` repeats almost all the work of checking `s[i+1..j-1]`.

### The insight

A palindrome is defined recursively from the outside in: `s[i..j]` is a palindrome if `s[i] == s[j]` and `s[i+1..j-1]` is a palindrome. That turns the `O(n)` check into an `O(1)` lookup, provided the inner interval was decided first. There are `O(n²)` intervals, so `O(n²)` total.

### The DP

- **State.** `pal[i][j]` is true exactly when `s[i..j]` (inclusive) is a palindrome, for `i ≤ j`.
- **Transition.** `pal[i][j] = (s[i] == s[j]) and (j - i < 2 or pal[i + 1][j - 1])`.
- **Base cases.** Length 1: `pal[i][i] = True`. Length 2: `pal[i][i+1] = (s[i] == s[i+1])`. The `j - i < 2` guard in the transition covers both, because their "inside" is empty.
- **Iteration order.** `pal[i][j]` reads the cell one row down and one column left. Either fill by increasing length, or run `i` from `n - 1` down to `0` and `j` from `i` up to `n - 1`.
- **Answer.** Among the true cells, the one with the largest `j - i`; return `s[i..j]`.

### Worked table for `"abaab"`

Rows are `i`, columns are `j`; only `i ≤ j` is meaningful.

| `i \ j` | 0 `a` | 1 `b` | 2 `a` | 3 `a` | 4 `b` |
|---|---|---|---|---|---|
| 0 `a` | T | F | T | F | F |
| 1 `b` | | T | F | F | **T** |
| 2 `a` | | | T | T | F |
| 3 `a` | | | | T | F |
| 4 `b` | | | | | T |

`pal[1][4]` is true because `s[1] = s[4] = 'b'` and `pal[2][3]` (`"aa"`) is true. `pal[0][3]` is false even though both ends are `'a'`, because `pal[1][2]` (`"ba"`) is false. The longest true cell is `(1, 4)`: `"baab"`.

### Tabulated version

```python
def longest_palindrome_table(s: str) -> str:
    n = len(s)
    pal = [[False] * n for _ in range(n)]
    best_i, best_len = 0, 1
    for i in range(n - 1, -1, -1):
        for j in range(i, n):
            if s[i] == s[j] and (j - i < 2 or pal[i + 1][j - 1]):
                pal[i][j] = True
                if j - i + 1 > best_len:
                    best_i, best_len = i, j - i + 1
    return s[best_i:best_i + best_len]
```

Time `O(n²)`, space `O(n²)`: a million booleans at `n = 1000`, which in Python is a list of lists of about 8 MB of pointers.

### Space-optimised versions

Row `i` reads only row `i + 1`, so one row suffices. Update it in place with `j` running *downwards*: cell `j` reads index `j - 1` of the previous row, which has not been overwritten yet.

```python
def longest_palindrome_row(s: str) -> str:
    n = len(s)
    row = [False] * n                  # row[j] holds pal[i + 1][j] until overwritten
    best_i, best_len = 0, 1
    for i in range(n - 1, -1, -1):
        for j in range(n - 1, i - 1, -1):
            row[j] = s[i] == s[j] and (j - i < 2 or row[j - 1])
            if row[j] and j - i + 1 > best_len:
                best_i, best_len = i, j - i + 1
    return s[best_i:best_i + best_len]
```

That is `O(n)` space. Going further, notice that the DP only ever extends a palindrome by one character on each side. So instead of a table, grow each palindrome directly from its centre. There are `2n - 1` centres (each character, and each gap between neighbours); expanding from one costs at most `O(n)`.

```python
def longest_palindrome(s: str) -> str:
    best_i, best_len = 0, 1
    for centre in range(2 * len(s) - 1):
        lo = centre // 2
        hi = lo + centre % 2               # odd centres sit between lo and lo + 1
        while lo >= 0 and hi < len(s) and s[lo] == s[hi]:
            lo -= 1
            hi += 1
        length = hi - lo - 1               # the loop overshot by one on each side
        if length > best_len:
            best_i, best_len = lo + 1, length
    return s[best_i:best_i + best_len]
```

Time `O(n²)` worst case (all one letter), `O(1)` extra space, and much faster in practice than the table because most expansions stop after one or two comparisons.

```viz
{"type": "dp", "algorithm": "palindrome-substrings", "a": "abaab", "title": "Palindrome table for abaab", "caption": "pal[i][j] is true when the ends match and the inside is a palindrome."}
```

### Common mistakes

- Filling `i` upwards. `pal[i][j]` needs `pal[i + 1][j - 1]`, which has not been computed yet, so every interval of length 3 or more reads `False`.
- Forgetting even-length palindromes in the expansion version. Only expanding from characters misses `"bccb"` and `"noon"`.
- Confusing substring (contiguous) with subsequence. The problem wants contiguous.
- The "reverse the string and take the longest common substring" trick. On `"abcxycba"` the reverse is `"abcyxcba"`, and their longest common substring is `"abc"`, which is not a palindrome. It only works if you also check that the matched positions mirror each other.

### How to discuss it

Start from the recursive definition and say the state and transition. Draw the triangle for a five-character string and point at the one-down-one-left dependency to justify the iteration order. Then say: "the table is `O(n²)` space, but each cell only extends its inner palindrome by one character on each side, so I can expand around centres instead: same time, `O(1)` space". Most interviewers expect the expansion version as the final code.

For linear time, name Manacher's algorithm: inside the rightmost palindrome found so far, the radius at a position is at least the (clipped) radius already computed at its mirror position, so comparisons are never repeated, giving `O(n)`. Say that it exists and what it exploits; implementing it from memory is rarely expected. For the subsequence follow-up, the state becomes `lps[i][j]` = length of the longest palindromic subsequence inside `s[i..j]`, with `lps[i][j] = lps[i+1][j-1] + 2` when the ends match and `max(lps[i+1][j], lps[i][j-1])` otherwise. Same triangle, same order, integer cells instead of booleans; it is also the LCS of `s` and its reverse.
