---
slug: decode-ways
title: Decode Ways
difficulty: medium
patterns: [dynamic-programming]
lists: [core-75, ascend-150]
companies: [meta, google, amazon, uber]
order: 7
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Look at how a decoding of the prefix `s[:i]` ends: its last letter used either the last one digit or the last two digits."
  - "`ways[i] = (ways[i - 1] if s[i - 1] is 1–9) + (ways[i - 2] if s[i - 2:i] is 10–26)`. Start from `ways[0] = 1`."
  - "A `0` can never stand alone. It only survives as the second digit of `10` or `20`."
signatures:
  python:
    name: num_decodings
    starter: |
      def num_decodings(s: str) -> int:
          pass
  javascript:
    name: num_decodings
    starter: |
      function num_decodings(s) {
      }
tests:
  - args: ["7"]
    expected: 1
    label: single digit
  - args: ["12"]
    expected: 2
  - args: ["1226"]
    expected: 5
  - args: ["10"]
    expected: 1
    label: a zero must pair with the digit before it
  - args: ["05"]
    expected: 0
    label: leading zero
  - args: ["100"]
    expected: 0
    label: the second zero has nothing to pair with
  - args: ["2101"]
    expected: 1
  - args: ["27"]
    expected: 1
    label: 27 is not a letter
  - args: ["301"]
    expected: 0
    hidden: true
  - args: ["11213"]
    expected: 8
    hidden: true
  - args: ["1201234"]
    expected: 3
    hidden: true
  - args: ["111111111111111111111111111111111111111111111"]
    expected: 1836311903
    hidden: true
    label: forty-five ones; plain recursion times out
time_limit_ms: 4000
---
A message made of capital letters was encoded by replacing each letter with its position in the alphabet (`A → "1"`, `B → "2"`, …, `Z → "26"`) and joining the results with no separators. Given the encoded digit string `s`, return the number of different letter sequences it could have come from.

A group of digits decodes to a letter only if it is `"1"` to `"9"` or `"10"` to `"26"`. In particular `"0"` alone and groups with a leading zero such as `"05"` decode to nothing. If the string cannot be decoded at all, return `0`.

### Examples

| Input | Output | Why |
|---|---|---|
| `"1226"` | `5` | `1 2 2 6`, `12 2 6`, `1 22 6`, `1 2 26`, `12 26` |
| `"10"` | `1` | Only `10` (J); `1 0` fails because `0` is not a letter |
| `"27"` | `1` | Only `2 7`; `27` is past `Z` |

### Constraints

- `1 ≤ len(s) ≤ 100`
- `s` contains only digits.
- The answer fits in a signed 32-bit integer for every test.

### Follow-up

The interviewer asks: "Now the string may also contain `*`, which stands for any digit from 1 to 9, and the answer should be taken modulo `10⁹ + 7`." Then: "Instead of the count, return every decoding. What is the complexity now?"

## Solution

### The naive approach

Recurse from the left: take one digit (if it is not `0`) and recurse on the rest, or take two digits (if they form 10–26) and recurse on the rest. The branching is the same as Climbing Stairs, so on a string of all `1`s the call tree has Fibonacci-many leaves: about `1.8 × 10⁹` for 45 digits. The same suffix is decoded again every time two different split sequences reach it.

### The insight

The number of ways to decode a suffix (or prefix) does not depend on how the earlier digits were split. So there are only `n + 1` subproblems. Frame them as prefixes and ask how the last letter was formed: from the last digit alone, or from the last two digits together. Those two cases are disjoint and exhaustive, so the counts add.

### The DP

- **State.** `ways[i]` is the number of decodings of the prefix `s[:i]` (the first `i` digits).
- **Transition.** For `i ≥ 1`:
  - if `s[i - 1]` is `1`–`9`, add `ways[i - 1]` (last letter is one digit);
  - if `i ≥ 2` and `s[i - 2:i]` is `10`–`26`, add `ways[i - 2]` (last letter is two digits).
- **Base case.** `ways[0] = 1`: the empty prefix has exactly one decoding, the empty message. Without it, `ways[2]` for `"12"` would miss the `12 → L` decoding.
- **Iteration order.** Increasing `i`.
- **Answer.** `ways[n]`.

Checking the two-digit window as `"10" ≤ s[i-2:i] ≤ "26"` (string comparison) or as `s[i-2] != '0' and 10 ≤ int(...) ≤ 26` rejects leading zeros automatically.

### Worked table for `"2101"`

| `i` | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| last digit `s[i-1]` | – | `2` | `1` | `0` | `1` |
| one-digit term | – | +`ways[0]` = 1 | +`ways[1]` = 1 | `0`: none | +`ways[3]` = 1 |
| last two `s[i-2:i]` | – | – | `21` | `10` | `01` |
| two-digit term | – | – | +`ways[0]` = 1 | +`ways[1]` = 1 | leading zero: none |
| `ways[i]` | 1 | 1 | 2 | 1 | **1** |

At `i = 3` the zero kills the one-digit branch, and only the `10` pairing survives, so the `21`-based decodings of the first two digits are discarded. The single decoding is `2 10 1` (B J A).

### Tabulated version

```python
def num_decodings_table(s: str) -> int:
    n = len(s)
    ways = [0] * (n + 1)
    ways[0] = 1
    for i in range(1, n + 1):
        if s[i - 1] != "0":
            ways[i] += ways[i - 1]
        if i >= 2 and "10" <= s[i - 2:i] <= "26":
            ways[i] += ways[i - 2]
    return ways[n]
```

Time `O(n)`, space `O(n)`.

### Space-optimised version

```python
def num_decodings(s: str) -> int:
    two_back, one_back = 0, 1          # ways[i - 2], ways[i - 1]; ways[-1] is never used
    for i in range(1, len(s) + 1):
        current = 0
        if s[i - 1] != "0":
            current += one_back
        if i >= 2 and "10" <= s[i - 2:i] <= "26":
            current += two_back
        two_back, one_back = one_back, current
    return one_back
```

Time `O(n)`, space `O(1)`. The string comparison is safe because both sides are exactly two digit characters, and digit characters sort in numeric order.

### Common mistakes

- Treating `0` like any other digit, which makes `"10"` return 2 and `"100"` return 1.
- Accepting `"05"` as a two-digit letter because `int("05") = 5` lies in 1–26. Check for the leading zero first.
- Returning early with 0 on the first `0` seen. `"10"` and `"2101"` are valid; only a `0` that cannot pair is fatal (and the DP discovers that on its own, because `ways[i]` becomes 0 and every later value built on it inherits the 0).
- `ways[0] = 0`, which zeroes the whole table.

### How to discuss it

Say "this is Climbing Stairs with conditions on each step": the one-step move is allowed when the digit is non-zero, the two-step move when the pair is 10–26. Give the state, both conditional terms and the base case, then trace a string with a zero in it, because that is where interviewers look for bugs.

For the `*` follow-up, the structure is identical but each term gets a multiplier: a lone `*` contributes `9 · ways[i - 1]`; the pair `1*` contributes 9, `2*` contributes 6, `**` contributes 15, `*d` contributes 2 if `d ≤ 6` else 1, all multiplied by `ways[i - 2]`, with a modulo after each addition. For "return every decoding", the output itself can be exponential (Fibonacci-many strings for all `1`s), so no algorithm beats `O(answer × n)`; use backtracking, optionally with the DP table to prune suffixes that have zero decodings.
