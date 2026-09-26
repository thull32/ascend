---
slug: longest-repeating-replacement
title: Longest Repeating Character Replacement
difficulty: medium
patterns: [sliding-window]
lists: [core-75, ascend-150]
companies: [google, amazon, uber]
order: 3
lesson: interview-patterns/array-patterns/sliding-window
hints:
  - A window can be made uniform with at most k replacements exactly when `window length - count of its most frequent letter ≤ k`.
  - Grow the window on the right and keep a letter count. When the condition fails, move the left edge one step (and decrement that letter's count).
  - You do not need to recompute the maximum frequency when the window shrinks. Think about why a stale, too-large `max_count` cannot produce a wrong answer.
signatures:
  python:
    name: character_replacement
    starter: |
      def character_replacement(s: str, k: int) -> int:
          pass
  javascript:
    name: character_replacement
    starter: |
      function character_replacement(s, k) {
      }
tests:
  - args: ["ABAB", 2]
    expected: 4
  - args: ["AABABBA", 1]
    expected: 4
  - args: ["AAAA", 0]
    expected: 4
    label: no replacements needed
  - args: ["ABCDE", 1]
    expected: 2
  - args: ["", 3]
    expected: 0
    label: empty string
  - args: ["XYYX", 1]
    expected: 3
  - args: ["BAAAB", 2]
    expected: 5
  - args: ["ABBB", 2]
    expected: 4
    hidden: true
  - args: ["AAABBBCCC", 2]
    expected: 5
    hidden: true
time_limit_ms: 4000
---
You are given a string `s` of uppercase English letters and an integer `k`. You may change at most `k` characters of `s` to any other uppercase letter. Return the length of the longest contiguous substring consisting of a single repeated letter that you can obtain.

### Examples

| Input | Output | Why |
|---|---|---|
| `s = "ABAB"`, `k = 2` | `4` | Replace both `A`s (or both `B`s) |
| `s = "AABABBA"`, `k = 1` | `4` | Replace the middle `B` to get `"AAAA"`, or the middle `A` to get `"BBBB"` |
| `s = "AAABBBCCC"`, `k = 2` | `5` | `"AAABB"` → `"AAAAA"`; six would need three changes |

### Constraints

- `0 ≤ len(s) ≤ 10⁵`
- `s` consists of uppercase English letters.
- `0 ≤ k ≤ len(s)`

### Follow-up

The interviewer asks: "Your `max_count` variable can be stale after the window shrinks. Why is the answer still correct?" Then: "Now the alphabet is Unicode. Does anything change?"

## Solution

### The naive approach

For every substring, count its letters and check whether `length - max_count ≤ k`. Even with incremental counting that is `O(n²)`; too slow for `10⁵`.

### The insight

A window can be made uniform with `k` edits exactly when the number of characters that are *not* the majority letter is at most `k`, that is, `len - max_count ≤ k`. This condition is monotone under shrinking (removing a character can only reduce the non-majority count or keep it), so a sliding window applies: expand the right edge, and when the window becomes invalid, advance the left edge.

The subtle part is `max_count`. Maintaining it exactly as the window shrinks would require rescanning the 26 counts. The standard solution does not bother: it only ever *raises* `max_count` when the right edge adds a letter. This makes `max_count` an upper bound on the true value once the window has shrunk, and a stale upper bound cannot hurt, for a reason worth understanding rather than memorising.

### The optimal approach

```python
def character_replacement(s: str, k: int) -> int:
    counts: dict[str, int] = {}
    left = 0
    max_count = 0
    best = 0
    for right, ch in enumerate(s):
        counts[ch] = counts.get(ch, 0) + 1
        max_count = max(max_count, counts[ch])
        if (right - left + 1) - max_count > k:
            counts[s[left]] -= 1
            left += 1
        best = max(best, right - left + 1)
    return best
```

Note the `if` rather than `while`: the window shrinks by at most one on each step, so it never gets smaller than the best length found so far. It is a window that only ever grows or slides, never contracts.

Trace `"AABABBA"`, `k = 1`. Right edge at 0, 1: `AA`, `max_count = 2`, valid, best 2. `AAB`: `3 - 2 = 1 ≤ 1`, best 3. `AABA`: `max_count = 3`, `4 - 3 = 1`, best 4. `AABAB`: `5 - 3 = 2 > 1`, shrink: window `ABAB`, `left = 1`. Right edge 5 (`B`): `ABABB`, `counts[B] = 3`, `max_count = 3`, `5 - 3 = 2 > 1`, shrink: `BABB`. Right edge 6 (`A`): `BABBA`, `5 - 3 = 2 > 1`, shrink: `ABBA`. Best stays 4.

Time `O(n)`, space `O(26)` = `O(1)`.

### Why the stale maximum is safe

Two facts. First, with the `if` shrink the window size never decreases, so the answer is simply the final window size `L`. Second, the shrink only fires when `size - max_count > k`, so at the end `L ≤ max_count + k`.

*The answer is achievable.* `max_count = M` was set when some letter `c` genuinely had `M` copies inside the window at that time. Take that window and extend it (in either direction, along `s`) to length `min(n, M + k)`. It still contains at least `M` copies of `c`, so it needs at most `k` edits, and its length is at least `L`. So a valid window of length `≥ L` exists, and the algorithm never over-reports.

*The answer is not too small.* Take any valid window `[a, b]` of length `L*`. Once the right edge is at or past `a` and the left edge is at or past `a`, the window is inside `[a, b]`, so it is genuinely valid; since `max_count` is at least the true maximum, the check passes and the window grows every step until the right edge reaches `b`, at which point it has length `L*`. If instead the left edge is still before `a` when the right edge reaches `b`, the window is strictly longer than `L*`. Either way the size at that step is at least `L*`, and size never decreases afterwards. So the algorithm never under-reports.

The interviewer will not require that proof word for word, but "the stale value is an upper bound, it can only make the window bigger, and a bigger window is always backed by a real one of that size" is the sentence to have ready.

### Common mistakes

- Recomputing `max(counts.values())` on every step. Correct, and still `O(26n)`, but it signals that you did not see the monotonicity argument.
- Using `while` for the shrink with a stale `max_count`. It still works but wastes the "never contracts" property, and makes the stale-maximum argument harder to state.
- Counting the *minority* letters as the thing to replace; the answer keeps the majority letter and replaces everything else.
- Off-by-one in the window length.

### How to discuss it

State the validity condition `len - max_count ≤ k` and its monotonicity first. Write the window, then explain, before being asked, why `max_count` is only ever raised. Trace one shrink step. For the Unicode follow-up: the count map grows with the alphabet, so space becomes `O(distinct characters)`, and the "recompute the max in 26 steps" fallback becomes expensive, which makes the stale-maximum argument more than an optimisation. Also mention that combining characters and grapheme clusters mean "a character" needs a definition before the problem is well-posed.
