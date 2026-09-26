---
slug: valid-palindrome
title: Valid Palindrome
difficulty: easy
patterns: [two-pointers]
lists: [core-75, ascend-150]
companies: [meta, microsoft, amazon]
order: 1
lesson: interview-patterns/array-patterns/two-pointers
hints:
  - Building a cleaned copy and comparing it with its reverse works, but costs O(n) extra space. Can you compare in place?
  - One pointer at each end. Skip characters that are not letters or digits, then compare case-insensitively and move both inward.
  - "Be careful with the skipping loops: they must not run past each other."
signatures:
  python:
    name: is_palindrome
    starter: |
      def is_palindrome(s: str) -> bool:
          pass
  javascript:
    name: is_palindrome
    starter: |
      function is_palindrome(s) {
      }
tests:
  - args: ["A man, a plan, a canal: Panama"]
    expected: true
  - args: ["race a car"]
    expected: false
  - args: ["Was it a car or a cat I saw?"]
    expected: true
  - args: [""]
    expected: true
    label: empty string
  - args: [" "]
    expected: true
    label: only non-alphanumeric characters
  - args: ["12321"]
    expected: true
  - args: ["1a2"]
    expected: false
  - args: ["0P"]
    expected: false
    hidden: true
    label: digit versus letter
  - args: ["ab_a"]
    expected: true
    hidden: true
    label: underscore is not alphanumeric
time_limit_ms: 4000
---
You are given a string `s`. Return `true` if it reads the same forwards and backwards after two normalisations: ignore every character that is not a letter or a digit, and treat upper and lower case as equal.

A string with no alphanumeric characters at all is considered a palindrome.

### Examples

| Input | Output | Why |
|---|---|---|
| `"A man, a plan, a canal: Panama"` | `true` | Reduces to `amanaplanacanalpanama` |
| `"race a car"` | `false` | Reduces to `raceacar`, which reversed is `racaecar` |
| `" "` | `true` | Nothing left after filtering |

### Constraints

- `0 ≤ len(s) ≤ 2 × 10⁵`
- `s` consists of printable ASCII characters.

### Follow-up

The interviewer asks: "Now allow at most one character to be deleted. Is it still a palindrome?" Then: "Unicode input: what does 'ignore non-alphanumeric' and 'case-insensitive' even mean?"

## Solution

### The naive approach

Filter the string to lowercase alphanumerics, then compare with its reverse: `t = [c.lower() for c in s if c.isalnum()]; return t == t[::-1]`. That is `O(n)` time and `O(n)` space, and it is a perfectly acceptable answer for an easy problem. The interviewer will ask you to do it without the copy.

### The insight

A palindrome check only ever compares position `i` with position `n - 1 - i`. You do not need the cleaned string to exist; you need to be able to *find* the next relevant character from each end. Two pointers walking inward, each skipping what should be ignored, do that in constant space.

### The optimal approach

```python
def is_palindrome(s: str) -> bool:
    lo, hi = 0, len(s) - 1
    while lo < hi:
        while lo < hi and not s[lo].isalnum():
            lo += 1
        while lo < hi and not s[hi].isalnum():
            hi -= 1
        if s[lo].lower() != s[hi].lower():
            return False
        lo += 1
        hi -= 1
    return True
```

Trace `"0P"`: `lo = 0`, `hi = 1`, both alphanumeric, `"0" != "p"`, return `false`. Trace `" "`: `lo = 0`, `hi = 0`, the outer loop does not run, return `true`.

Time `O(n)`: each pointer moves monotonically and they stop when they meet. Space `O(1)`.

### Common mistakes

- Skipping loops without the `lo < hi` guard, which runs a pointer off the end on inputs like `"a."` or `".,."`.
- Comparing `s[lo] == s[hi]` without lowercasing, so `"Aa"` fails.
- Treating `_` as alphanumeric because some regex `\w` definitions include it; `isalnum` does not, and the problem says letters and digits.
- Returning `false` for the empty string.

### How to discuss it

Give the filter-and-reverse version verbally in one sentence, name its `O(n)` space, then write the two-pointer version. Trace an input with punctuation at both ends to show the guards. For the one-deletion follow-up: run the same two pointers; on the first mismatch, check whether skipping `lo` or skipping `hi` yields a palindrome for the remaining range, using a helper that checks a sub-range. Still `O(n)`. For Unicode: `isalnum` and `lower` become locale and normalisation questions (the German `ß` lowercases to itself but uppercases to `SS`; combining accents split characters across code points), so the honest answer is to normalise with NFC or NFKC first and use case folding rather than lowercasing, and to say that "palindrome" over graphemes is a different problem from one over code points.
