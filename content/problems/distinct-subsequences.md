---
slug: distinct-subsequences
title: Distinct Subsequences
difficulty: hard
patterns: [dynamic-programming]
lists: [ascend-150]
companies: [google, amazon, bloomberg]
order: 22
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Count by the last character of `s`. Either it is not used in the occurrence, or it is used, in which case it must be matched to the last character of `t`."
  - "Let `W[i][j]` be the number of ways `t[:j]` occurs as a subsequence of `s[:i]`. Then `W[i][j] = W[i-1][j] + (W[i-1][j-1] if s[i-1] == t[j-1] else 0)`."
  - "The empty target occurs exactly once in any string, so column 0 is all 1s. In one dimension, loop `j` downwards so `W[j-1]` still holds the previous row."
signatures:
  python:
    name: num_distinct
    starter: |
      def num_distinct(s: str, t: str) -> int:
          pass
  javascript:
    name: num_distinct
    starter: |
      function num_distinct(s, t) {
      }
tests:
  - args: ["aab", "ab"]
    expected: 2
  - args: ["abc", "abc"]
    expected: 1
  - args: ["abc", "d"]
    expected: 0
  - args: ["abc", ""]
    expected: 1
    label: the empty target occurs exactly once
  - args: ["", "a"]
    expected: 0
    label: empty source
  - args: ["banana", "ban"]
    expected: 3
  - args: ["aaaa", "aa"]
    expected: 6
    label: choose any two of four positions
  - args: ["coocoon", "con"]
    expected: 6
    hidden: true
  - args: ["xyxyxyxy", "xy"]
    expected: 10
    hidden: true
  - args: ["ab", "abc"]
    expected: 0
    hidden: true
    label: target longer than source
  - args: ["subsequence", "sue"]
    expected: 7
    hidden: true
  - args: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaa"]
    expected: 155117520
    hidden: true
    label: answer is C(30, 15)
time_limit_ms: 4000
---
Given strings `s` and `t`, return the number of different ways to pick characters of `s`, keeping their order, so that the picked characters spell `t`. Two ways are different if they pick a different set of positions in `s`.

In other words, count the subsequences of `s` that equal `t`, where subsequences are identified by the positions they use.

### Examples

| Input | Output | Why |
|---|---|---|
| `s = "aab"`, `t = "ab"` | `2` | Positions `(0, 2)` and `(1, 2)` |
| `s = "banana"`, `t = "ban"` | `3` | `b` at 0; then `a` at 1 with `n` at 2 or 4, or `a` at 3 with `n` at 4 |
| `s = "abc"`, `t = ""` | `1` | Picking nothing spells the empty string, in exactly one way |

### Constraints

- `0 ≤ len(s), len(t) ≤ 1000`
- Both strings consist of lowercase English letters.
- The answer fits in a signed 32-bit integer for every test.

### Follow-up

The interviewer asks: "The answer is guaranteed to fit in 32 bits. Can your intermediate values overflow anyway?" Then: "Now count the *distinct strings* among all subsequences of `s` (no `t`). Same technique?"

## Solution

### The naive approach

Enumerate all `C(len(s), len(t))` position sets and check each: for 30 characters and a 15-character target, that is over 155 million sets. The recursive version ("match `t[j]` at some later position of `s`, recurse") recomputes the same `(position in s, position in t)` pairs over and over.

### The insight

Look at the last character of `s[:i]`. Every occurrence of `t[:j]` inside `s[:i]` either

- **does not use** `s[i-1]`, so it is an occurrence of `t[:j]` inside `s[:i-1]`; or
- **uses** `s[i-1]`, which is then the last picked character, so it must equal `t[j-1]`, and the rest is an occurrence of `t[:j-1]` inside `s[:i-1]`.

The two groups are disjoint and cover everything, so their counts add. Each reduces to a pair of shorter prefixes.

### The DP

- **State.** `W[i][j]` is the number of ways `t[:j]` occurs as a subsequence of `s[:i]`.
- **Transition.** `W[i][j] = W[i-1][j] + (W[i-1][j-1] if s[i-1] == t[j-1] else 0)`.
- **Base cases.** `W[i][0] = 1` for every `i` (the empty target occurs once, by picking nothing). `W[0][j] = 0` for `j > 0` (a non-empty target cannot come from an empty string).
- **Iteration order.** Rows `i = 1..m`, and within a row any order of `j`, since everything read is in row `i - 1`.
- **Answer.** `W[m][n]`.

### Worked table for `s = "banana"`, `t = "ban"`

| `s[:i]` \ `t[:j]` | "" | b | ba | ban |
|---|---|---|---|---|
| "" | 1 | 0 | 0 | 0 |
| b | 1 | 1 | 0 | 0 |
| ba | 1 | 1 | 1 | 0 |
| ban | 1 | 1 | 1 | 1 |
| bana | 1 | 1 | 2 | 1 |
| banan | 1 | 1 | 2 | **3** |
| banana | 1 | 1 | 3 | 3 |

At row `bana`, column `ba`: the new `a` matches, so add the ways to make `b` from `ban` (1) to the ways to make `ba` without it (1), giving 2. At row `banan`, column `ban`: the new `n` matches, so add the `ba` count from the row above (2) to the previous `ban` count (1), giving 3. The last `a` does not match `n`, so the answer column just copies down.

### Tabulated version

```python
def num_distinct_table(s: str, t: str) -> int:
    m, n = len(s), len(t)
    W = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        W[i][0] = 1
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            W[i][j] = W[i - 1][j]
            if s[i - 1] == t[j - 1]:
                W[i][j] += W[i - 1][j - 1]
    return W[m][n]
```

Time `O(m · n)`, space `O(m · n)`.

### Space-optimised version

Row `i` reads row `i - 1` at `j` and `j - 1`. In a single array, loop `j` **downwards**: when you update `W[j]`, the entry `W[j - 1]` has not been touched in this row yet, so it is still the previous row's value. (Upwards would read the already-updated `W[j - 1]` and let one character of `s` be matched twice.)

```python
def num_distinct(s: str, t: str) -> int:
    n = len(t)
    W = [0] * (n + 1)
    W[0] = 1                                   # the empty target
    for ch in s:
        for j in range(n, 0, -1):              # downwards
            if ch == t[j - 1]:
                W[j] += W[j - 1]
    return W[n]
```

Time `O(m · n)`, space `O(n)`. Early exits are available: if `len(t) > len(s)` the answer is 0 immediately.

### Common mistakes

- Setting `W[0][0] = 1` but leaving the rest of column 0 at 0. Every row needs `W[i][0] = 1`, or later characters can never start a new occurrence.
- On a match, using only `W[i-1][j-1]` (forgetting the "skip this character" term), which counts at most one occurrence per alignment.
- Looping `j` upwards in the 1-D version.
- Assuming intermediate values are bounded by the final answer. They are not (see below).

### How to discuss it

This is another "two sequences, prefixes as state" problem, but *counting*, so the two cases (skip the last character of `s`, or use it) add instead of taking a max. Say why they are disjoint. Give the base column of 1s with its reason, fill the `banana` table, then collapse to one row and explain the downward loop.

On overflow: the answer `W[m][n]` may fit in 32 bits while intermediate cells do not fit in 64. With `s` = a thousand `a`s and `t` = ten `a`s followed by `b`, the answer is 0 (there is no `b`), but the cell counting occurrences of the ten `a`s is `C(1000, 10) ≈ 2.6 × 10²³`. Python's big integers absorb this. In fixed-width languages, notice that the recurrence only ever *adds*, so computing every cell modulo `2⁶⁴` (unsigned wrap-around arithmetic, which is well defined in C++ and Rust's `wrapping_add`, and what Java's `long` does anyway) yields the true answer whenever the true answer is below `2⁶⁴`. Signed overflow in C++ is undefined behaviour, so use unsigned types. Saying *why* wrap-around is safe here, and that it would not be for a recurrence with `max` or division, is a strong senior signal.

For counting distinct subsequence *strings* of `s`, the state changes: `D[i]` = distinct subsequences of `s[:i]` (including empty) satisfies `D[i] = 2·D[i-1] - D[last[s[i-1]] - 1]`, where `last[c]` is the 1-based position of the previous occurrence of `c` (drop the subtraction if there is none): doubling adds `s[i-1]` to every earlier subsequence, and the subtraction removes the strings the previous occurrence already created. Same idea (split on the last character), different correction.
