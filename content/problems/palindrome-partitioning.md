---
slug: palindrome-partitioning
title: Palindrome Partitioning
difficulty: medium
patterns: [backtracking]
lists: [ascend-150]
companies: [amazon, bloomberg, google, microsoft]
order: 7
lesson: interview-patterns/combinatorial-patterns/backtracking-pattern
hints:
  - "Choose where the first piece ends. If `s[0..j]` is a palindrome, recurse on the rest; if not, that cut is dead, try the next `j`."
  - "The recursion carries a start index and the current list of pieces; when the start reaches the end of the string, record the pieces."
  - "Checking `is_palindrome` on every substring repeats work. Precompute a table `pal[i][j]` in O(n²) so each check is O(1)."
signatures:
  python:
    name: partition
    starter: |
      def partition(s: str) -> list[list[str]]:
          pass
  javascript:
    name: partition
    starter: |
      function partition(s) {
      }
tests:
  - args: ["aab"]
    expected: [["a", "a", "b"], ["aa", "b"]]
    any_order: true
  - args: ["a"]
    expected: [["a"]]
    any_order: true
    label: single character
  - args: ["aba"]
    expected: [["a", "b", "a"], ["aba"]]
    any_order: true
  - args: ["abc"]
    expected: [["a", "b", "c"]]
    any_order: true
    label: no multi-character palindromes
  - args: ["aaa"]
    expected: [["a", "a", "a"], ["a", "aa"], ["aa", "a"], ["aaa"]]
    any_order: true
  - args: ["ab"]
    expected: [["a", "b"]]
    any_order: true
  - args: ["abba"]
    expected: [["a", "b", "b", "a"], ["a", "bb", "a"], ["abba"]]
    any_order: true
    hidden: true
  - args: ["abab"]
    expected: [["a", "b", "a", "b"], ["a", "bab"], ["aba", "b"]]
    any_order: true
    hidden: true
    label: overlapping palindromes give different cuts
  - args: ["noon"]
    expected: [["n", "o", "o", "n"], ["n", "oo", "n"], ["noon"]]
    any_order: true
    hidden: true
time_limit_ms: 4000
---
Given a string `s`, split it into consecutive pieces so that every piece is a palindrome. Return every such partitioning as a list of pieces in left-to-right order. The partitionings may be returned in any order.

### Examples

| Input | Output | Why |
|---|---|---|
| `"aab"` | `[["a","a","b"], ["aa","b"]]` | `aab` and `ab` are not palindromes, so `b` is always alone |
| `"aaa"` | `[["a","a","a"], ["a","aa"], ["aa","a"], ["aaa"]]` | Every cut of a run of equal letters works |
| `"abab"` | `[["a","b","a","b"], ["a","bab"], ["aba","b"]]` | The two three-letter palindromes overlap, so they belong to different partitionings |

### Constraints

- `1 ≤ len(s) ≤ 16`
- `s` contains only lowercase English letters

### Follow-up

The interviewer asks: "I only want the *minimum* number of cuts. Is enumeration still the right tool?" Then: "What is the maximum number of partitionings a string of length 16 can have, and what input achieves it?"

## Solution

### The naive approach

There are `2ⁿ⁻¹` ways to place cuts in a string of length `n`; generate each, split, and test every piece. That is `O(2ⁿ · n)` with an `O(n)` palindrome check per piece, and most of the `2ⁿ⁻¹` cut patterns fail on their very first piece. The waste is in not abandoning a cut pattern the moment a piece fails.

### The insight

Decide the pieces left to right. The first piece is `s[0..j]` for some `j`; if it is not a palindrome, no partitioning starts that way, so skip it without exploring the rest. If it is, the remainder is the same problem on `s[j+1..]`. That is backtracking with a start index, and the palindrome test is the pruning rule. Since the same substring is tested many times across branches, precompute `pal[i][j]` with the recurrence `pal[i][j] = s[i] == s[j] and (j - i < 2 or pal[i+1][j-1])`, filling `i` from right to left.

### The optimal approach

```python
def partition(s: str) -> list[list[str]]:
    n = len(s)
    pal = [[False] * n for _ in range(n)]
    for i in range(n - 1, -1, -1):
        for j in range(i, n):
            pal[i][j] = s[i] == s[j] and (j - i < 2 or pal[i + 1][j - 1])

    result: list[list[str]] = []
    path: list[str] = []

    def backtrack(start: int) -> None:
        if start == n:
            result.append(path[:])
            return
        for j in range(start, n):
            if pal[start][j]:
                path.append(s[start:j + 1])
                backtrack(j + 1)
                path.pop()

    backtrack(0)
    return result
```

The table costs `O(n²)` time and space. The enumeration is output-bound: `O(n · 2ⁿ)` in the worst case (all letters equal, every cut pattern valid), and far less when few substrings are palindromes.

### Common mistakes

- Filling `pal` with `i` increasing, so `pal[i+1][j-1]` is read before it is written.
- Testing `s[start:j+1] == s[start:j+1][::-1]` inside the loop; correct, but `O(n)` per test and the interviewer will ask you to fix it.
- Recording the path when `start == n - 1` instead of `n`, which drops the last piece.

### How to discuss it

Present the cut-by-cut recursion and name the palindrome test as the prune, then the `O(n²)` table as the standard way to make the prune `O(1)`. For the minimum-cuts follow-up, enumeration is wrong: `min_cuts[j] = min over palindromic s[i..j] of min_cuts[i-1] + 1` is an `O(n²)` DP using the same table, and recognising when a "list all" problem turns into a "best one" problem is a DP-versus-backtracking judgement call interviewers explicitly probe. For the maximum count, all-equal letters make every cut pattern valid: `2¹⁵ = 32,768` partitionings for `n = 16`, which is why the constraint is small.
