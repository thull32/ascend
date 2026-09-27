---
slug: regular-expression-matching
title: Regular Expression Matching
difficulty: hard
patterns: [dynamic-programming]
lists: [ascend-150]
companies: [google, meta, amazon, uber]
order: 21
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Treat `x*` as a single pattern token. Such a token can match zero copies (skip both pattern characters) or one more copy (consume one string character and keep the token available)."
  - "Let `M[i][j]` say whether `s[:i]` matches `p[:j]`. For a plain character or `.`, compare the last characters and look at `M[i-1][j-1]`. For a star, use `M[i][j-2]` or (`M[i-1][j]` if the last string character fits)."
  - "Row 0 is not all false: the empty string matches patterns like `a*b*c*`."
signatures:
  python:
    name: is_match
    starter: |
      def is_match(s: str, p: str) -> bool:
          pass
  javascript:
    name: is_match
    starter: |
      function is_match(s, p) {
      }
tests:
  - args: ["abc", "abc"]
    expected: true
  - args: ["abc", "a.c"]
    expected: true
  - args: ["", "x*"]
    expected: true
    label: a star can match zero copies
  - args: ["", ""]
    expected: true
  - args: ["aaa", "a*"]
    expected: true
  - args: ["ab", ".*c"]
    expected: false
  - args: ["xz", "xy*z"]
    expected: true
  - args: ["abcd", "d*"]
    expected: false
    label: the whole string must match
  - args: ["abbbc", "ab*bbc"]
    expected: true
    hidden: true
    label: the star must leave characters for the rest of the pattern
  - args: ["bbbba", ".*a*a"]
    expected: true
    hidden: true
  - args: ["aaaaaaaaaaaaaaaaaaab", "a*a*a*a*a*a*a*a*a*c"]
    expected: false
    hidden: true
    label: exponential for naive backtracking
  - args: ["ab", ".*..."]
    expected: false
    hidden: true
time_limit_ms: 4000
---
Implement matching for a tiny regular-expression language. A pattern `p` is made of:

- lowercase letters, which match themselves;
- `.`, which matches any single character;
- `*`, which means "zero or more copies of the element immediately before it". Every `*` in a valid pattern is preceded by a letter or `.`.

Return `true` if the pattern matches the **entire** string `s`, not just part of it.

### Examples

| Input | Output | Why |
|---|---|---|
| `s = "xz"`, `p = "xy*z"` | `true` | `y*` matches zero `y`s |
| `s = "abbbc"`, `p = "ab*bbc"` | `true` | `b*` takes one `b` and leaves two for the literal `bb` |
| `s = "abcd"`, `p = "d*"` | `false` | The match must cover the whole string |

### Constraints

- `0 ≤ len(s) ≤ 1000`, `0 ≤ len(p) ≤ 1000`
- `s` contains only lowercase letters; `p` contains lowercase letters, `.` and `*`.
- Every `*` is preceded by a letter or `.`.

### Follow-up

The interviewer asks: "Add `+` (one or more) and `?` (zero or one). What changes?" Then: "Production regex engines in several popular languages use backtracking. What goes wrong, and how do engines that guarantee linear time avoid it?"

## Solution

### The naive approach

Match recursively from the left. For a starred element, try matching zero copies and recurse; if the current character fits, also try consuming it and recurse with the star still available. Every star is a branch point. With a pattern like `a*a*a*…a*c` against `aaaa…ab`, the recursion tries every way of dividing the `a`s among the stars before discovering that `c` never matches: the number of divisions grows combinatorially with the number of stars and the length of the run. Yet there are only `(len(s) + 1) · (len(p) + 1)` distinct (string position, pattern position) pairs.

### The insight

Whether the rest of the string matches the rest of the pattern depends only on the two positions, not on how you got there. So the state is a pair of prefix lengths. The only subtle part is the star: treat `x*` as one token that, at the end of a prefix, either

- matches **zero** copies, so drop the two pattern characters `x*` and keep the string as is, or
- matches **one more** copy, so the last string character must fit `x`, and you drop that character but keep `x*` (it may match more).

### The DP

- **State.** `M[i][j]` is true exactly when `s[:i]` matches `p[:j]` completely.
- **Transition.** Let `fits(c, t)` mean `t == '.' or t == c`.
  - If `p[j-1] == '*'`: `M[i][j] = M[i][j-2] or (i > 0 and fits(s[i-1], p[j-2]) and M[i-1][j])`.
  - Otherwise: `M[i][j] = i > 0 and fits(s[i-1], p[j-1]) and M[i-1][j-1]`.
- **Base cases.** `M[0][0] = True`. `M[i][0] = False` for `i > 0` (an empty pattern matches only the empty string). Row 0 is *not* all false: `M[0][j] = M[0][j-2]` when `p[j-1] == '*'`, so `""` matches `x*`, `x*y*` and so on. The transition above produces this automatically for `i = 0`.
- **Iteration order.** `i` from 0 to `len(s)`, and for each, `j` from 1 to `len(p)`. A cell reads the previous row (`M[i-1][…]`) and earlier columns in its own row (`M[i][j-2]`).
- **Answer.** `M[len(s)][len(p)]`.

### Worked table for `s = "xyyz"`, `p = "xy*z"`

Rows are prefixes of `s`, columns are prefixes of `p`.

| `s[:i]` \ `p[:j]` | "" | `x` | `xy` | `xy*` | `xy*z` |
|---|---|---|---|---|---|
| "" | T | F | F | F | F |
| `x` | F | T | F | T | F |
| `xy` | F | F | T | T | F |
| `xyy` | F | F | F | T | F |
| `xyyz` | F | F | F | F | **T** |

- `M[1][3]` (`"x"` vs `"xy*"`): zero copies of `y`, so it copies `M[1][1] = T`.
- `M[2][3]` and `M[3][3]`: one more `y` each time, reading the cell directly above (`M[i-1][3]`) because the star stays available.
- `M[4][4]`: `z` fits `z`, and `M[3][3]` is true.

### Tabulated version

```python
def is_match_table(s: str, p: str) -> bool:
    m, n = len(s), len(p)

    def fits(c: str, t: str) -> bool:
        return t == "." or t == c

    M = [[False] * (n + 1) for _ in range(m + 1)]
    M[0][0] = True
    for i in range(m + 1):
        for j in range(1, n + 1):
            if p[j - 1] == "*":
                M[i][j] = M[i][j - 2] or (i > 0 and fits(s[i - 1], p[j - 2]) and M[i - 1][j])
            else:
                M[i][j] = i > 0 and fits(s[i - 1], p[j - 1]) and M[i - 1][j - 1]
    return M[m][n]
```

Time `O(m · n)`, space `O(m · n)`. `j - 2` is never negative for a star because a valid pattern never starts with `*`.

### Space-optimised version

Row `i` reads only row `i - 1` and itself, so keep two rows.

```python
def is_match(s: str, p: str) -> bool:
    n = len(p)
    prev = [False] * (n + 1)
    for i in range(len(s) + 1):
        cur = [False] * (n + 1)
        cur[0] = i == 0
        for j in range(1, n + 1):
            if p[j - 1] == "*":
                cur[j] = cur[j - 2] or (
                    i > 0 and p[j - 2] in (".", s[i - 1]) and prev[j]
                )
            else:
                cur[j] = i > 0 and p[j - 1] in (".", s[i - 1]) and prev[j - 1]
        prev = cur
    return prev[n]
```

Time `O(m · n)`, space `O(n)`.

### Common mistakes

- Treating `*` as a wildcard on its own (shell-glob style) rather than as a modifier of the previous element.
- Initialising row 0 to all false, so `""` fails to match `a*`.
- In the "one more copy" branch, reading `M[i-1][j-2]` instead of `M[i-1][j]`. That lets a star match at most one character.
- Matching a prefix only: returning true as soon as the pattern is exhausted, as on `("abcd", "d*")`-style inputs.

### How to discuss it

Start by saying you will treat `x*` as a single token with two options, zero copies or one more copy. Give the state as a pair of prefixes, both transitions, and the row-0 subtlety. Fill a small table with a star in it, reading the "one more copy" cell from directly above.

For `+`, rewrite `x+` as `xx*`, or give it its own transition: `M[i][j] = fits(s[i-1], x) and (M[i-1][j] or M[i-1][j-2])` (consume one copy, then either allow more or stop). For `?`, it is `M[i][j] = M[i][j-2] or (fits(s[i-1], x) and M[i-1][j-2])`. On production engines: backtracking implementations (as in the naive approach) can take exponential time on patterns like `(a+)+$` against a long run of `a`s followed by a mismatch, which has caused real outages when user-controlled input met such a pattern (ReDoS). Engines built on automata, following Thompson's construction (RE2 and Go's `regexp`, for example), simulate all possible pattern positions at once, which is essentially this DP run one row at a time, and so guarantee time linear in the input for a fixed pattern. The price is giving up backreferences, which cannot be matched this way.
