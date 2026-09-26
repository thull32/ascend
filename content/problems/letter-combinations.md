---
slug: letter-combinations
title: Letter Combinations of a Phone Number
difficulty: medium
patterns: [backtracking]
lists: [ascend-150]
companies: [amazon, google, meta, uber]
order: 8
lesson: interview-patterns/combinatorial-patterns/backtracking-pattern
hints:
  - "Each digit contributes exactly one letter. The result is the Cartesian product of the letter groups, one group per digit."
  - "Backtrack over digit positions: for the digit at index `i`, try each of its letters, append it, recurse to `i + 1`, and remove it. Record the string when `i` reaches the end."
  - "The empty input must return an empty list, not a list containing the empty string."
signatures:
  python:
    name: letter_combinations
    starter: |
      def letter_combinations(digits: str) -> list[str]:
          pass
  javascript:
    name: letter_combinations
    starter: |
      function letter_combinations(digits) {
      }
tests:
  - args: ["23"]
    expected: ["ad", "ae", "af", "bd", "be", "bf", "cd", "ce", "cf"]
    any_order: true
  - args: [""]
    expected: []
    any_order: true
    label: empty input
  - args: ["2"]
    expected: ["a", "b", "c"]
    any_order: true
    label: single digit
  - args: ["79"]
    expected: ["pw", "px", "py", "pz", "qw", "qx", "qy", "qz", "rw", "rx", "ry", "rz", "sw", "sx", "sy", "sz"]
    any_order: true
    label: four-letter keys
  - args: ["38"]
    expected: ["dt", "du", "dv", "et", "eu", "ev", "ft", "fu", "fv"]
    any_order: true
  - args: ["56"]
    expected: ["jm", "jn", "jo", "km", "kn", "ko", "lm", "ln", "lo"]
    any_order: true
    hidden: true
  - args: ["9"]
    expected: ["w", "x", "y", "z"]
    any_order: true
    hidden: true
  - args: ["234"]
    expected: ["adg", "adh", "adi", "aeg", "aeh", "aei", "afg", "afh", "afi", "bdg", "bdh", "bdi", "beg", "beh", "bei", "bfg", "bfh", "bfi", "cdg", "cdh", "cdi", "ceg", "ceh", "cei", "cfg", "cfh", "cfi"]
    any_order: true
    hidden: true
    label: three digits
time_limit_ms: 4000
---
On a classic phone keypad the digits `2` through `9` carry letters: `2 → abc`, `3 → def`, `4 → ghi`, `5 → jkl`, `6 → mno`, `7 → pqrs`, `8 → tuv`, `9 → wxyz`. Given a string `digits` containing only those digits, return every string that can be formed by choosing one letter for each digit, in order. The strings may be returned in any order. The empty input yields an empty list.

### Examples

| Input | Output | Why |
|---|---|---|
| `"23"` | `["ad","ae","af","bd","be","bf","cd","ce","cf"]` | `3 × 3` choices |
| `"79"` | 16 strings from `pw` to `sz` | `4 × 4` choices |
| `""` | `[]` | No digits, no strings |

### Constraints

- `0 ≤ len(digits) ≤ 4`
- Each character is a digit from `2` to `9`

### Follow-up

The interviewer asks: "Do this iteratively, and tell me how the memory behaves compared to the recursion." Then: "Now only strings that are real dictionary words should be returned, and the dictionary has a hundred thousand entries. Where does the pruning go?"

## Solution

### The naive approach

Nested loops, one per digit. It works for a fixed number of digits and breaks the moment the length is variable, which is the whole point of the exercise: the loop nesting has to become recursion or an explicit product.

### The insight

The output is the Cartesian product of `len(digits)` small sets. Backtracking builds it one position at a time: at position `i`, try each letter of `digits[i]`, recurse, undo. Each root-to-leaf path in that tree is exactly one output string, and there are `∏ |letters(dᵢ)|` leaves, so nothing is generated and discarded.

### The optimal approach

```python
def letter_combinations(digits: str) -> list[str]:
    if not digits:
        return []
    keypad = {
        "2": "abc", "3": "def", "4": "ghi", "5": "jkl",
        "6": "mno", "7": "pqrs", "8": "tuv", "9": "wxyz",
    }
    result: list[str] = []
    path: list[str] = []

    def backtrack(i: int) -> None:
        if i == len(digits):
            result.append("".join(path))
            return
        for ch in keypad[digits[i]]:
            path.append(ch)
            backtrack(i + 1)
            path.pop()

    backtrack(0)
    return result
```

Time `O(n · 4ⁿ)` for `n` digits: at most `4ⁿ` strings, each joined in `O(n)`. Space `O(n)` for the recursion and path, excluding the output.

The iterative version keeps a list of partial strings and, for each digit, replaces it with every extension by one letter:

```python
def letter_combinations_iterative(digits: str) -> list[str]:
    if not digits:
        return []
    keypad = {"2": "abc", "3": "def", "4": "ghi", "5": "jkl",
              "6": "mno", "7": "pqrs", "8": "tuv", "9": "wxyz"}
    result = [""]
    for d in digits:
        result = [prefix + ch for prefix in result for ch in keypad[d]]
    return result
```

Same time; memory peaks at the size of the output rather than `O(n)`, because every partial string of the current length is materialised at once.

### Common mistakes

- Returning `[""]` for empty input, which is what the iterative version does without the guard.
- Building strings by concatenation at every level of the recursion (`prefix + ch` passed down), which is fine for `n ≤ 4` but allocates `O(n)` per node; the path list with a single join at the leaf is the habit to build.
- Hard-coding two or three nested loops.

### How to discuss it

Say "Cartesian product, backtracking with one level per digit, output-bound at `4ⁿ`." Contrast recursion (`O(n)` working memory, output streamed) with the iterative rewrite (all partials of one length live at once), and note that for the dictionary follow-up the pruning belongs *inside* the recursion: walk a trie of the dictionary alongside the digits, and abandon any branch whose prefix has no trie node. With a hundred thousand words most branches die after two letters, which turns the `4ⁿ` into something close to the number of matching words.
