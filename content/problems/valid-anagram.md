---
slug: valid-anagram
title: Valid Anagram
difficulty: easy
patterns: [hash-map]
lists: [core-75, ascend-150]
companies: [amazon, bloomberg, uber]
order: 3
lesson: interview-patterns/sequence-patterns/hash-map-patterns
hints:
  - Two strings are anagrams when they contain the same multiset of characters. How do you compare two multisets?
  - Count the characters of one string and subtract the characters of the other; every count must end at zero.
  - Check the lengths first. If they differ, no counting is needed.
signatures:
  python:
    name: is_anagram
    starter: |
      def is_anagram(s: str, t: str) -> bool:
          pass
  javascript:
    name: is_anagram
    starter: |
      function is_anagram(s, t) {
      }
tests:
  - args: ["listen", "silent"]
    expected: true
  - args: ["rat", "car"]
    expected: false
  - args: ["anagram", "nagaram"]
    expected: true
  - args: ["", ""]
    expected: true
    label: both empty
  - args: ["a", "ab"]
    expected: false
    label: different lengths
  - args: ["ab", "ba"]
    expected: true
  - args: ["aab", "abb"]
    expected: false
    hidden: true
    label: same letters, different counts
  - args: ["Aa", "aA"]
    expected: true
    hidden: true
    label: case matters, but the multiset matches
  - args: ["abc", "abd"]
    expected: false
    hidden: true
time_limit_ms: 4000
---
You are given two strings `s` and `t`. Return `true` if `t` is an anagram of `s`: that is, if `t` can be formed by rearranging exactly the characters of `s`, using each character exactly once.

Comparison is case-sensitive: `A` and `a` are different characters.

### Examples

| Input | Output | Why |
|---|---|---|
| `s = "listen"`, `t = "silent"` | `true` | Same six letters, rearranged |
| `s = "rat"`, `t = "car"` | `false` | `c` is not in `s` |
| `s = "aab"`, `t = "abb"` | `false` | Same letters, but `s` has two `a`s and `t` has one |

### Constraints

- `0 ≤ len(s), len(t) ≤ 5 × 10⁴`
- `s` and `t` consist of printable ASCII characters.

### Follow-up

The interviewer asks: "The strings may contain any Unicode text, including combining characters. Does your solution still work?" And then: "Now I have a million strings and I need to answer anagram queries between any two of them. How would you preprocess?"

## Solution

### The naive approach

Sort both strings and compare: `sorted(s) == sorted(t)`. That is `O(n log n)` time and `O(n)` space, correct, and a perfectly fine first answer. The problem is that sorting does more work than the question needs: you do not care about the order of characters, only about how many of each there are.

### The insight

Two strings are anagrams exactly when their character histograms are equal. Building a histogram is `O(n)`; comparing two histograms costs the size of the alphabet. A hash map from character to count is the histogram.

### The optimal approach

If the lengths differ, return `false` immediately. Otherwise walk `s` incrementing counts and walk `t` decrementing them. If any count goes negative while processing `t`, `t` has a character `s` cannot supply, so return `false`. Because the lengths are equal, no count can end positive if none went negative.

```python
def is_anagram(s: str, t: str) -> bool:
    if len(s) != len(t):
        return False
    counts: dict[str, int] = {}
    for ch in s:
        counts[ch] = counts.get(ch, 0) + 1
    for ch in t:
        c = counts.get(ch, 0) - 1
        if c < 0:
            return False
        counts[ch] = c
    return True
```

Time `O(n)`, space `O(k)` where `k` is the number of distinct characters, at most 128 for ASCII. With a fixed alphabet you can use a 26- or 128-slot array instead of a dictionary; it is faster by a constant factor and it lets you say "O(1) space" honestly.

### Common mistakes

- Skipping the length check and only verifying that `t`'s characters all appear in `s`; `s = "aab"`, `t = "ab"` would then pass.
- Using a 26-slot array indexed by `ord(ch) - ord('a')` on input that is not guaranteed lowercase. Ask before assuming.
- Building two full `Counter`s and comparing. It is correct and short (`Counter(s) == Counter(t)`), but it cannot exit early. Know both and explain the difference.

### How to discuss it

Lead with the sort, state its cost, then say "the order is irrelevant, only the counts matter" and write the histogram. For the Unicode follow-up: code-point counting works on strings that are already normalised, but `é` may be one code point or `e` plus a combining accent, so you normalise (NFC or NFD) first, and grapheme-level comparison needs a proper library. For the million-string follow-up: canonicalise each string once (its sorted form, or its histogram serialised) and store the canonical key; an anagram query becomes a key comparison, and grouping all anagrams together becomes the next problem, [Group Anagrams](/practice/group-anagrams).
