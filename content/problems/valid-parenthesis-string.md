---
slug: valid-parenthesis-string
title: Valid Parenthesis String
difficulty: medium
patterns: [greedy]
lists: [ascend-150]
companies: [meta, amazon, google, bloomberg]
order: 7
lesson: interview-patterns/combinatorial-patterns/greedy-pattern
hints:
  - "Without wildcards, one counter of open brackets decides validity. With a `*` the counter could be three different values. Instead of tracking every possibility, what if you tracked the smallest and largest possible open count?"
  - "Keep `lo` and `hi`: the fewest and most unmatched `(` possible so far. `(` raises both, `)` lowers both, `*` lowers `lo` and raises `hi`."
  - "If `hi` ever drops below zero, even treating every `*` as `(` cannot save the prefix: return false. Never let `lo` go below zero, because a negative open count is not a real state. At the end the string is valid if `lo == 0`."
signatures:
  python:
    name: check_valid_string
    starter: |
      def check_valid_string(s: str) -> bool:
          pass
  javascript:
    name: check_valid_string
    starter: |
      function check_valid_string(s) {
      }
tests:
  - args: ["(*"]
    expected: true
  - args: ["*)"]
    expected: true
  - args: [")*("]
    expected: false
    label: closer before any opener
  - args: ["((*)"]
    expected: true
  - args: ["(((*)"]
    expected: false
    label: too many openers for one star
  - args: [""]
    expected: true
    label: empty string
  - args: ["*"]
    expected: true
  - args: ["(*()"]
    expected: true
  - args: ["**(("]
    expected: false
    hidden: true
    label: stars before openers cannot close them
  - args: ["((*)*)(*"]
    expected: true
    hidden: true
  - args: ["(()*))("]
    expected: false
    hidden: true
  - args: ["*(()"]
    expected: false
    hidden: true
time_limit_ms: 4000
---
You are given a string `s` made of the characters `(`, `)` and `*`. Each `*` is a wildcard that you may independently replace with `(`, with `)`, or with nothing. Return `true` if some choice of replacements turns `s` into a balanced bracket string, and `false` otherwise.

A balanced string has every `(` closed by a later `)`, and no `)` without an earlier unmatched `(`. The empty string is balanced.

### Examples

| Input | Output | Why |
|---|---|---|
| `s = "((*)"` | `true` | Treat the `*` as `)`: `"(())"` |
| `s = "(((*)"` | `false` | Three openers, but at most two closers (`*` and `)`) |
| `s = "*(()"` | `false` | The unmatched `(` at index 1 needs a closer *after* it; the only `*` is before it |

### Constraints

- `0 ≤ len(s) ≤ 100`
- `s[i]` is one of `(`, `)`, `*`.

### Follow-up

The interviewer asks: "Why is it safe to clamp `lo` at zero?" Then: "Return one concrete replacement that makes the string valid, not just `true`."

## Solution

### The naive approach

Try all three choices for every `*`: `3ᵏ` strings for `k` stars, each checked in `O(n)`. With 100 stars that is hopeless. A memoised DP over `(index, open_count)` works in `O(n²)` time and space and is a respectable fallback; the greedy below is its compression.

### The insight

Without wildcards, validity is decided by one counter: the number of currently unmatched `(`. It must never go negative and must end at zero.

A `*` makes the counter uncertain. But the set of counts reachable after any prefix is always a **contiguous range** `[lo, hi]`: each `*` can shift a count by `-1`, `0` or `+1`, so a range stays a range. You therefore only need its two ends.

- `(`: every possibility gains an opener. `lo += 1`, `hi += 1`.
- `)`: every possibility loses one. `lo -= 1`, `hi -= 1`.
- `*`: the range widens. `lo -= 1` (use it as `)`), `hi += 1` (use it as `(`).

Two boundary rules finish it. If `hi < 0`, even the most opener-heavy interpretation has an unmatched `)`: fail immediately. If `lo < 0`, that particular endpoint describes an invalid history, so discard it by clamping `lo` to `0`; the smallest *valid* count is then 0 (some star that was read as `)` could have been read as empty instead). At the end, the string is valid exactly when `0` is in the range, which given the clamp means `lo == 0`.

### The optimal approach

```python
def check_valid_string(s: str) -> bool:
    lo = hi = 0   # min and max possible number of unmatched '('
    for ch in s:
        if ch == "(":
            lo += 1
            hi += 1
        elif ch == ")":
            lo -= 1
            hi -= 1
        else:  # '*'
            lo -= 1
            hi += 1
        if hi < 0:
            return False          # too many ')' even if every '*' is '('
        lo = max(lo, 0)           # a negative open count is not a real state
    return lo == 0
```

Trace `"(((*)"`:

| ch | lo | hi |
|---|---|---|
| ( | 1 | 1 |
| ( | 2 | 2 |
| ( | 3 | 3 |
| * | 2 | 4 |
| ) | 1 | 3 |

`lo = 1` at the end: at least one opener is always left unmatched, so `false`.

Time `O(n)`, space `O(1)`.

### Why clamping is safe

Clamping raises `lo` from `-1` to `0`. The endpoint `-1` came from reading some `*` as `)` when nothing was open; reading that same `*` as empty gives count `0` instead, so `0` really is achievable. Any count between the clamped `lo` and `hi` is still reachable because the range is contiguous. The clamp never invents a count that no replacement produces.

### Common mistakes

- Only counting `(` against `)` and treating every `*` as a free fix. `"*(()"` has enough stars in total, but in the wrong place; order matters.
- Checking `lo < 0` as a failure instead of clamping it. On `"(*)"` the star as `)` would drive `lo` to `-1` at the end, yet the string is valid with the star as empty.
- Forgetting the `hi < 0` early exit, which lets `"())*"`-style strings "recover" when a later star raises `hi` again.
- Using a stack of indices without the second pass: the two-stack solution (one for `(` indices, one for `*` indices, then match remaining `(` with later `*`) is also `O(n)` and valid, but the matching step must check the star index is *after* the opener.

### How to discuss it

Start from the single-counter check for plain brackets, then say "a star makes the count a range, and the range stays contiguous, so I track its min and max". Explain both boundary rules before writing code; interviewers usually probe the clamp. Mention the `O(n²)` DP as what you would reach for if you could not see the range argument, since it is the systematic path to the same answer. For the construction follow-up, the two-stack method is easier to turn into an explicit assignment: match `)` with the latest `(` first, then with the latest `*`; afterwards pair each leftover `(` with a later unused `*` read as `)`, and set every remaining star to empty.
