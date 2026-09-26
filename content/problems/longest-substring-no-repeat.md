---
slug: longest-substring-no-repeat
title: Longest Substring Without Repeating Characters
difficulty: medium
patterns: [sliding-window]
lists: [core-75, ascend-150]
companies: [amazon, bloomberg, adobe, meta]
order: 2
lesson: interview-patterns/array-patterns/sliding-window
hints:
  - Grow a window to the right one character at a time. When the new character is already inside the window, the window must shrink from the left until it is not.
  - Store the last index of each character. Then instead of shrinking one step at a time you can jump the left edge straight past the previous occurrence.
  - Be careful never to move the left edge backwards. The previous occurrence may already be outside the window.
signatures:
  python:
    name: length_of_longest_substring
    starter: |
      def length_of_longest_substring(s: str) -> int:
          pass
  javascript:
    name: length_of_longest_substring
    starter: |
      function length_of_longest_substring(s) {
      }
tests:
  - args: ["abcabcbb"]
    expected: 3
  - args: ["bbbbb"]
    expected: 1
    label: all the same
  - args: ["pwwkew"]
    expected: 3
  - args: [""]
    expected: 0
    label: empty string
  - args: ["abcdef"]
    expected: 6
    label: already unique
  - args: ["dvdf"]
    expected: 3
  - args: ["abba"]
    expected: 2
    hidden: true
    label: previous occurrence is already outside the window
  - args: ["tmmzuxt"]
    expected: 5
    hidden: true
time_limit_ms: 4000
---
You are given a string `s`. Return the length of the longest contiguous substring in which no character appears more than once.

### Examples

| Input | Output | Why |
|---|---|---|
| `"abcabcbb"` | `3` | `"abc"`; the next `a` repeats |
| `"pwwkew"` | `3` | `"wke"`; note `"pwke"` is a subsequence, not a substring |
| `"abba"` | `2` | `"ab"` or `"ba"` |

### Constraints

- `0 ≤ len(s) ≤ 5 × 10⁴`
- `s` consists of printable ASCII characters.

### Follow-up

The interviewer asks: "Now allow each character to appear at most twice." Then: "The string is a stream of a billion characters and I want the answer at the end. What is your memory footprint?"

## Solution

### The naive approach

Check every substring for repeats: `O(n³)` naively, `O(n²)` if you extend each start point and stop at the first repeat. For `n = 5 × 10⁴` the quadratic version is over a billion steps; too slow.

### The insight

The `O(n²)` version restarts from scratch after every start index. But the property "no repeats" is *monotone under shrinking*: if a window has no repeats, every sub-window has none either. That is exactly the condition under which a sliding window works. Grow the right edge; whenever the window becomes invalid (the new character is already inside), move the left edge until it is valid again. Both edges only ever move forward, so the total work is `O(n)`.

### The optimal approach

Two forms. The first shrinks the left edge one step at a time with a set; the second stores each character's last index and jumps.

```python
def length_of_longest_substring(s: str) -> int:
    last: dict[str, int] = {}
    left = 0
    best = 0
    for right, ch in enumerate(s):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1          # jump past the previous occurrence
        last[ch] = right
        best = max(best, right - left + 1)
    return best
```

The guard `last[ch] >= left` is the whole difficulty of the problem. Without it, `"abba"` breaks: at the final `a`, the previous `a` is at index 0, but `left` is already 2 (moved there by the repeated `b`). Setting `left = 1` would move the window backwards and count `"ba"` plus a stale `b`, reporting 3. With the guard, the old `a` is recognised as outside the window and ignored.

Trace `"tmmzuxt"`. `t`: window `[0, 0]`. `m`: `[0, 1]`. `m` again at 2, last `m` at 1 ≥ 0 → `left = 2`, window `[2, 2]`. `z, u, x`: window grows to `[2, 5]`, length 4. `t` at 6: last `t` at 0 < `left`, ignore → window `[2, 6]`, length 5. Answer 5.

Time `O(n)`: one pass, each character does one dictionary lookup and one write. Space `O(min(n, alphabet))`.

The set-based variant is the same algorithm with `while ch in window: window.remove(s[left]); left += 1`. It is also `O(n)` overall because each character is removed at most once, but it does more steps per repeat and is a little easier to get right; either is a fine answer.

### Common mistakes

- The missing `>= left` guard, which fails on `"abba"`. Every interviewer knows this test.
- Using `right - left` instead of `right - left + 1` for the window length.
- Confusing substring with subsequence, and returning 4 for `"pwwkew"`.
- Clearing the whole map when a repeat is found; that is correct only if you also reset `left` to the position after the repeat, and it loses the `O(n)` guarantee.

### How to discuss it

Explain why a window works: "validity is preserved by shrinking, so I never need to look backwards". Write the last-index version, then show the `"abba"` trace unprompted; catching your own bug before the interviewer does is worth more than writing it correctly the first time. For the at-most-twice follow-up: replace the last-index map with a count map and shrink the left edge while the count of the new character exceeds 2; the same skeleton generalises to "at most k distinct characters" and to [Longest Repeating Character Replacement](/practice/longest-repeating-replacement). For the stream follow-up: the state is the map of last positions, bounded by the alphabet size, plus two integers; the string itself never needs to be stored, since the left edge only ever jumps to an index you have recorded. So memory is `O(alphabet)`, independent of the billion characters.
