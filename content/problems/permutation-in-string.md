---
slug: permutation-in-string
title: Permutation in String
difficulty: medium
patterns: [sliding-window]
lists: [ascend-150]
companies: [microsoft, meta, oracle]
order: 4
lesson: interview-patterns/array-patterns/sliding-window
hints:
  - A permutation of `s1` inside `s2` is a window of length `len(s1)` whose letter histogram equals that of `s1`.
  - "Slide a fixed-size window over `s2`: add the entering character, remove the leaving one, compare histograms."
  - Comparing 26 counts per step is fine, but you can do better by tracking how many of the 26 letters currently match and updating that number by at most two on each slide.
signatures:
  python:
    name: check_inclusion
    starter: |
      def check_inclusion(s1: str, s2: str) -> bool:
          pass
  javascript:
    name: check_inclusion
    starter: |
      function check_inclusion(s1, s2) {
      }
tests:
  - args: ["ab", "eidbaooo"]
    expected: true
  - args: ["ab", "eidboaoo"]
    expected: false
  - args: ["a", "a"]
    expected: true
    label: single characters
  - args: ["ab", "ba"]
    expected: true
  - args: ["abc", "ccccbbbbaaaa"]
    expected: false
    label: all letters present but never together
  - args: ["abc", ""]
    expected: false
    label: empty haystack
  - args: ["abb", "aabbb"]
    expected: true
  - args: ["adc", "dcda"]
    expected: true
    hidden: true
  - args: ["hello", "ooolleoooleh"]
    expected: false
    hidden: true
time_limit_ms: 4000
---
You are given two strings `s1` and `s2` of lowercase English letters. Return `true` if some contiguous substring of `s2` is a permutation of `s1`, that is, contains exactly the characters of `s1` with the same multiplicities in any order.

### Examples

| Input | Output | Why |
|---|---|---|
| `s1 = "ab"`, `s2 = "eidbaooo"` | `true` | `"ba"` at positions 3–4 |
| `s1 = "ab"`, `s2 = "eidboaoo"` | `false` | `a` and `b` never sit side by side |
| `s1 = "abc"`, `s2 = "ccccbbbbaaaa"` | `false` | Every letter is present, but no window of length 3 has one of each |

### Constraints

- `1 ≤ len(s1) ≤ 10⁴`
- `0 ≤ len(s2) ≤ 10⁴`
- Both consist of lowercase English letters.

### Follow-up

The interviewer asks: "Return all starting indices instead of a boolean." Then: "Why is this a sliding window and not a two-pointer problem, and what distinguishes the two?"

## Solution

### The naive approach

For every start position in `s2`, sort the window of length `len(s1)` and compare with sorted `s1`: `O(n · m log m)` where `m = len(s1)`. Or build a histogram of each window from scratch: `O(n · m)`. Both recompute work that the previous window already did.

### The insight

The window has a *fixed* size `m`. When it slides one position to the right, one character enters and one leaves; everything else is unchanged. So the histogram of the new window is the old histogram plus one and minus one. Maintaining it costs `O(1)` per slide, and the whole scan is `O(n)` plus the cost of the comparison at each step.

The comparison is 26 counts, so a straightforward version is `O(26n)`. To make the comparison `O(1)` as well, track `matches`: the number of letters (out of 26) whose count in the window equals its count in `s1`. A slide changes at most two letters, so `matches` changes by at most two, and the window is a permutation exactly when `matches == 26`.

### The optimal approach

```python
def check_inclusion(s1: str, s2: str) -> bool:
    m, n = len(s1), len(s2)
    if m > n:
        return False
    need = [0] * 26
    have = [0] * 26
    for i in range(m):
        need[ord(s1[i]) - 97] += 1
        have[ord(s2[i]) - 97] += 1
    matches = sum(1 for i in range(26) if need[i] == have[i])
    if matches == 26:
        return True
    for right in range(m, n):
        enter = ord(s2[right]) - 97
        leave = ord(s2[right - m]) - 97
        have[enter] += 1
        if have[enter] == need[enter]:
            matches += 1
        elif have[enter] == need[enter] + 1:
            matches -= 1
        have[leave] -= 1
        if have[leave] == need[leave]:
            matches += 1
        elif have[leave] == need[leave] - 1:
            matches -= 1
        if matches == 26:
            return True
    return False
```

The update rules are the part to get right. When a letter's count becomes equal to its target, `matches` goes up; when it was equal and is now off by one, `matches` goes down; in every other case (it was already wrong and is still wrong) nothing changes.

Trace `s1 = "ab"`, `s2 = "eidbaooo"`. Initial window `"ei"`: 22 letters match (every letter with count 0 in both); `a`, `b`, `e`, `i` do not. Slide to `"id"`: `e` leaves and now matches (23), `d` enters and stops matching (22). Slide to `"db"`: `i` leaves (23), `b` enters and matches (24). Slide to `"ba"`: `d` leaves (25), `a` enters and matches (26). Return `true`.

Time `O(n + m)`, space `O(26)`.

### Common mistakes

- Forgetting the `m > n` check, then indexing past the end while building the first window.
- Checking `matches == 26` before processing the leaving character, which tests a window of size `m + 1`.
- Using a `Counter` equality per step; correct, but each comparison is `O(26)` plus dictionary overhead, and the interviewer will ask you to make the step `O(1)`.
- Confusing "permutation as a substring" with "subsequence", which would make `"abc"`, `"ccccbbbbaaaa"` true.

### How to discuss it

Say "fixed window of size `len(s1)`, maintained histogram, one in, one out". Write the 26-count version first if you like, then show the `matches` optimisation and explain the four update cases. For the all-indices follow-up: collect `right - m + 1` whenever `matches == 26` instead of returning; that is Find All Anagrams in a String, same code. On window versus two-pointer: a sliding window is a two-pointer technique where the two pointers define a contiguous range and move in the same direction; "two pointers" more broadly includes pointers that converge from opposite ends (Three Sum) or move at different speeds (cycle detection). Here the size is fixed, which is the simplest window there is, and the whole difficulty is in maintaining the summary cheaply.
