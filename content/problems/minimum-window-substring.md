---
slug: minimum-window-substring
title: Minimum Window Substring
difficulty: hard
patterns: [sliding-window]
lists: [core-75, ascend-150]
companies: [meta, amazon, google, linkedin]
order: 5
lesson: interview-patterns/array-patterns/sliding-window
hints:
  - A window is "good" when it contains every character of `t` with at least the required multiplicity. Goodness is preserved when the window grows, and lost when it shrinks too far.
  - Expand the right edge until the window is good; then shrink the left edge as far as possible while it stays good, recording the length. Repeat.
  - Track one integer, the number of distinct characters whose requirement is currently satisfied, so that "is the window good?" is an O(1) check.
signatures:
  python:
    name: min_window
    starter: |
      def min_window(s: str, t: str) -> str:
          pass
  javascript:
    name: min_window
    starter: |
      function min_window(s, t) {
      }
tests:
  - args: ["ADOBECODEBANC", "ABC"]
    expected: "BANC"
  - args: ["a", "a"]
    expected: "a"
  - args: ["a", "aa"]
    expected: ""
    label: t needs more copies than s has
  - args: ["ab", "b"]
    expected: "b"
  - args: ["", "a"]
    expected: ""
    label: empty s
  - args: ["bba", "ab"]
    expected: "ba"
  - args: ["xyz", "zyx"]
    expected: "xyz"
    label: whole string is the only window
  - args: ["aaflslflsldkalskaaa", "aaa"]
    expected: "aaa"
    hidden: true
    label: repeated characters in t
  - args: ["abcabdebac", "cda"]
    expected: "cabd"
    hidden: true
time_limit_ms: 4000
---
You are given two strings `s` and `t`. Return the shortest contiguous substring of `s` that contains every character of `t`, counting multiplicity: if `t` has two `a`s, the window must contain at least two `a`s. If no such substring exists, return the empty string.

The inputs are chosen so that the shortest window, when it exists, is unique.

### Examples

| Input | Output | Why |
|---|---|---|
| `s = "ADOBECODEBANC"`, `t = "ABC"` | `"BANC"` | Shortest window with an `A`, a `B` and a `C` |
| `s = "a"`, `t = "aa"` | `""` | Only one `a` available |
| `s = "aaflslflsldkalskaaa"`, `t = "aaa"` | `"aaa"` | Three `a`s must all be inside the window |

### Constraints

- `0 ≤ len(s) ≤ 10⁵`
- `1 ≤ len(t) ≤ 10⁵`
- Both consist of printable ASCII characters.

### Follow-up

The interviewer asks: "Show me that the left pointer's total movement is O(n), so the nested loop is not quadratic." Then: "I now want the window that contains the characters of `t` *in order*. Does your approach survive?"

## Solution

### The naive approach

Every substring, checked for coverage with a histogram: `O(n²)` substrings times `O(n)` per check without incremental counting, `O(n²)` with it. Far too slow.

### The insight

"Contains all of `t`" is monotone under *growing*: if a window is good, every superset window is good. The complement, "not yet good", is monotone under shrinking. That means a two-edge window search works: push the right edge until the window is good, then pull the left edge in until it is about to become bad, and record the length. Then push right again. Each edge moves only forward, so the total number of edge moves is at most `2n`.

The bookkeeping that makes the check `O(1)` is a single counter, `formed`: how many *distinct* characters of `t` currently have their required count met inside the window. The window is good when `formed == len(distinct chars of t)`.

### The optimal approach

```python
def min_window(s: str, t: str) -> str:
    if not s or not t:
        return ""
    need: dict[str, int] = {}
    for ch in t:
        need[ch] = need.get(ch, 0) + 1
    required = len(need)

    have: dict[str, int] = {}
    formed = 0
    best_len = float("inf")
    best_lo = 0
    left = 0

    for right, ch in enumerate(s):
        have[ch] = have.get(ch, 0) + 1
        if ch in need and have[ch] == need[ch]:
            formed += 1

        while formed == required:
            if right - left + 1 < best_len:
                best_len = right - left + 1
                best_lo = left
            out = s[left]
            have[out] -= 1
            if out in need and have[out] < need[out]:
                formed -= 1
            left += 1

    return "" if best_len == float("inf") else s[best_lo:best_lo + best_len]
```

The `formed` updates are the two places where bugs live. On entry, a character contributes only at the moment its count *reaches* the requirement (`==`), not every time it exceeds it. On exit, it stops contributing only at the moment its count *drops below* the requirement (`<`), not while surplus copies remain.

Trace `s = "ADOBECODEBANC"`, `t = "ABC"`. The right edge reaches index 5 (`C`) and the window `ADOBEC` has `formed = 3`. Shrink: `A` leaves, `formed = 2`, `left = 1`; best is `ADOBEC` (6). Right edge continues: `O, D, E, B` at 9; still short an `A`. `A` at 10: `formed = 3`, window `DOBECODEBA` (10), not better. Shrink: `D, O, B` leave (surplus `B` at 9 remains), `E` leaves, `C` leaves at index 5 → `formed = 2`, `left = 6`. Right edge: `N` at 11, `C` at 12: `formed = 3`, window `ODEBANC` (7), not better; shrink `O, D, E` → `BANC` (4), best. Shrink `B` → `formed = 2`. End. Return `"BANC"`.

Time `O(n + m)`: each edge advances at most `n` times, and each step does `O(1)` dictionary work. Space `O(distinct characters)`.

### Common mistakes

- Using `have[ch] >= need[ch]` on entry, which increments `formed` once per surplus copy and reports a good window too early.
- Building the answer string inside the loop (`best = s[left:right+1]`), which is `O(n)` per update and can make the whole thing quadratic on long windows. Store indices, slice once.
- Ignoring multiplicity and treating `t` as a set; `"a"`, `"aa"` must return `""`.
- Forgetting `formed` counts *distinct* satisfied characters, not total matched characters.

### How to discuss it

Say "expand until good, shrink while good" and explain the monotonicity that makes it correct. Name the `formed` counter and its two update rules before writing code. Give the amortisation argument unprompted: the left pointer moves at most `n` steps in total across all iterations of the inner loop, so the nested loop is `O(n)`, not `O(n²)`. For the in-order follow-up: the histogram no longer captures the constraint, since order matters; the window still works but the summary becomes "how far into `t` has this window matched as a subsequence", which is not cheaply maintained when the left edge moves. The standard answer is a different algorithm (for each end position, greedily walk back through `t`, or a DP over positions of `t`), and recognising that the histogram trick specifically requires an order-free condition is the senior observation.
