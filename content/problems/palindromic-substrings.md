---
slug: palindromic-substrings
title: Palindromic Substrings
difficulty: medium
patterns: [dynamic-programming]
lists: [ascend-150]
companies: [meta, amazon, google, linkedin]
order: 6
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Substrings at different positions count separately, even when they spell the same thing. So you are counting `(i, j)` pairs, not strings."
  - "`s[i..j]` is a palindrome when `s[i] == s[j]` and the inside `s[i+1..j-1]` is one. Fill a boolean table and count the true cells."
  - "Every palindrome grows outward from a centre. From each of the `2n - 1` centres, every successful expansion step is one more palindrome."
signatures:
  python:
    name: count_palindromic_substrings
    starter: |
      def count_palindromic_substrings(s: str) -> int:
          pass
  javascript:
    name: count_palindromic_substrings
    starter: |
      function count_palindromic_substrings(s) {
      }
tests:
  - args: ["a"]
    expected: 1
    label: single character
  - args: ["abc"]
    expected: 3
    label: only the single characters
  - args: ["aaa"]
    expected: 6
  - args: ["abba"]
    expected: 6
  - args: ["racecar"]
    expected: 10
  - args: ["aabaa"]
    expected: 9
  - args: ["zq"]
    expected: 2
  - args: ["xyzyxq"]
    expected: 8
    hidden: true
  - args: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
    expected: 1275
    hidden: true
    label: fifty identical characters, every substring counts
  - args: ["abacaba"]
    expected: 12
    hidden: true
time_limit_ms: 4000
---
Given a string `s`, return how many of its contiguous substrings are palindromes (read the same forwards and backwards).

A substring is identified by its start and end positions, so two occurrences of the same text at different positions are counted twice. Every single character is a palindrome.

### Examples

| Input | Output | Why |
|---|---|---|
| `"abc"` | `3` | `"a"`, `"b"`, `"c"` |
| `"aaa"` | `6` | Three `"a"`, two `"aa"` (positions 0–1 and 1–2), one `"aaa"` |
| `"abba"` | `6` | Four single letters, `"bb"`, `"abba"` |

### Constraints

- `1 ≤ len(s) ≤ 1000`
- `s` consists of lowercase English letters.

### Follow-up

The interviewer asks: "Now count *distinct* palindromic substrings, so `"aaa"` gives 3. How large can that answer get?" Then: "Can the original count be done in linear time?"

## Solution

This is the counting twin of [Longest Palindromic Substring](/practice/longest-palindromic-substring): the same table, but you add up the true cells instead of tracking the longest one.

### The naive approach

Enumerate all `n(n + 1)/2` substrings and check each in `O(n)`: `O(n³)` total, on the order of `10⁸` character comparisons at `n = 1000`. The waste is that checking `s[i..j]` re-checks everything `s[i+1..j-1]` already established.

### The insight

Palindromes nest: `s[i..j]` is a palindrome if and only if its ends match and `s[i+1..j-1]` is a palindrome. So one `O(1)` step decides each interval from a shorter one, and there are `O(n²)` intervals.

### The DP

- **State.** `pal[i][j]` is true exactly when `s[i..j]` (inclusive) is a palindrome.
- **Transition.** `pal[i][j] = (s[i] == s[j]) and (j - i < 2 or pal[i + 1][j - 1])`.
- **Base cases.** Length 1 is always true; length 2 is true when the two characters match. The `j - i < 2` guard handles both.
- **Iteration order.** Each cell reads one row down and one column left, so run `i` from `n - 1` down to `0` and `j` from `i` up to `n - 1` (or fill by increasing length).
- **Answer.** The number of true cells.

### Worked table for `"aabaa"`

| `i \ j` | 0 `a` | 1 `a` | 2 `b` | 3 `a` | 4 `a` | true in row |
|---|---|---|---|---|---|---|
| 0 `a` | T | T | F | F | T | 3 |
| 1 `a` | | T | F | T | F | 2 |
| 2 `b` | | | T | F | F | 1 |
| 3 `a` | | | | T | T | 2 |
| 4 `a` | | | | | T | 1 |

Total **9**: five single letters, `"aa"` twice (0–1 and 3–4), `"aba"` (1–3), and the whole string (0–4), which is true because `pal[1][3]` is. Note `pal[0][3]` (`"aaba"`) is false despite matching ends: its inside `"ab"` is not a palindrome.

### Tabulated version

```python
def count_palindromic_substrings_table(s: str) -> int:
    n = len(s)
    pal = [[False] * n for _ in range(n)]
    count = 0
    for i in range(n - 1, -1, -1):
        for j in range(i, n):
            if s[i] == s[j] and (j - i < 2 or pal[i + 1][j - 1]):
                pal[i][j] = True
                count += 1
    return count
```

Time `O(n²)`, space `O(n²)`.

### Space-optimised version

The table only ever extends a palindrome by one character on each side, so skip the table: expand outward from each of the `2n - 1` centres (each character for odd lengths, each gap for even lengths) and count one palindrome per successful step.

```python
def count_palindromic_substrings(s: str) -> int:
    n = len(s)
    count = 0
    for centre in range(2 * n - 1):
        lo = centre // 2
        hi = lo + centre % 2
        while lo >= 0 and hi < n and s[lo] == s[hi]:
            count += 1
            lo -= 1
            hi += 1
    return count
```

Time `O(n²)` in the worst case (a string of one repeated letter, where the answer itself is `n(n + 1)/2`), `O(1)` extra space. On typical text most expansions stop immediately, so it runs close to `O(n)`. A one-row rolling version of the table (as in Longest Palindromic Substring) also gives `O(n)` space, but the expansion is simpler.

```viz
{"type": "dp", "algorithm": "palindrome-substrings", "a": "aabaa", "title": "Counting palindromes in aabaa", "caption": "Each true cell is one palindromic substring; the answer is the number of true cells."}
```

### Common mistakes

- Counting distinct strings with a set. `"aaa"` must give 6, not 3.
- Only expanding around characters, which misses every even-length palindrome: `"abba"` would give 4 instead of 6.
- Filling the table with `i` ascending, so the inner cell is always still `False`.

### How to discuss it

Say that this is the same table as Longest Palindromic Substring, then go straight to the centre expansion: "`2n - 1` centres, each successful expansion is exactly one new palindrome, so the count falls out of the loop". Point out that the worst case is quadratic because the *number of palindromes* is: a string of `n` identical letters has `n(n + 1)/2` palindromic substrings, so any method that discovers them one at a time cannot beat `O(n²)`. Only a method that counts them in bulk can, which is exactly what the next paragraph does. That is the kind of lower-bound reasoning senior interviewers like.

For linear time on the count, Manacher's algorithm computes the maximal palindrome radius at every centre in `O(n)`; the count is then the sum of those radii, since a maximal palindrome of radius `r` contains exactly `r` palindromes sharing its centre. For distinct palindromes, a useful fact is that a string of length `n` has at most `n` distinct non-empty palindromic substrings, because appending one character can create at most one new one (the longest palindromic suffix). A palindromic tree (eertree) builds all of them in `O(n)`; in an interview, "expand around centres and insert each palindrome's hash into a set" at `O(n²)` is an acceptable answer if you name the better one.
