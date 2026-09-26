---
slug: generate-parentheses
title: Generate Parentheses
difficulty: medium
patterns: [stack]
lists: [core-75, ascend-150]
companies: [google, amazon, meta, microsoft]
order: 4
lesson: interview-patterns/sequence-patterns/stack-patterns
hints:
  - Generating all 2^(2n) strings and filtering is far too slow. Which partial strings can you rule out *before* finishing them?
  - A prefix is extendable to a valid sequence iff its open count is at most `n` and its close count never exceeds its open count. Those two checks are your only branching rules.
  - Build the string character by character in a recursive function carrying `(open_used, close_used)`. Each leaf at length `2n` is a valid answer, so there is no wasted work.
signatures:
  python:
    name: generate_parentheses
    starter: |
      def generate_parentheses(n: int) -> list[str]:
          pass
  javascript:
    name: generate_parentheses
    starter: |
      function generate_parentheses(n) {
      }
tests:
  - args: [1]
    expected: ["()"]
    any_order: true
  - args: [2]
    expected: ["(())", "()()"]
    any_order: true
  - args: [3]
    expected: ["((()))", "(()())", "(())()", "()(())", "()()()"]
    any_order: true
  - args: [0]
    expected: [""]
    any_order: true
    label: zero pairs gives the empty string
  - args: [4]
    expected: ["(((())))", "((()()))", "((())())", "((()))()", "(()(()))", "(()()())", "(()())()", "(())(())", "(())()()", "()((()))", "()(()())", "()(())()", "()()(())", "()()()()"]
    any_order: true
    hidden: true
  - args: [5]
    expected: ["((((()))))", "(((()())))", "(((())()))", "(((()))())", "(((())))()", "((()(())))", "((()()()))", "((()())())", "((()()))()", "((())(()))", "((())()())", "((())())()", "((()))(())", "((()))()()", "(()((())))", "(()(()()))", "(()(())())", "(()(()))()", "(()()(()))", "(()()()())", "(()()())()", "(()())(())", "(()())()()", "(())((()))", "(())(()())", "(())(())()", "(())()(())", "(())()()()", "()(((())))", "()((()()))", "()((())())", "()((()))()", "()(()(()))", "()(()()())", "()(()())()", "()(())(())", "()(())()()", "()()((()))", "()()(()())", "()()(())()", "()()()(())", "()()()()()"]
    any_order: true
    hidden: true
time_limit_ms: 4000
---
Given an integer `n`, return every string of exactly `n` opening and `n` closing parentheses that is well-formed (balanced and correctly nested). Each string must appear exactly once; the order of the list does not matter.

For `n = 0` the only well-formed string is the empty string, so return `[""]`.

### Examples

| Input | Output |
|---|---|
| `1` | `["()"]` |
| `2` | `["(())", "()()"]` |
| `3` | `["((()))", "(()())", "(())()", "()(())", "()()()"]` |

Note what is *not* in the `n = 2` answer: `")(()"` has two of each bracket but is not well-formed.

### Constraints

- `0 ≤ n ≤ 8`

### Follow-up

The interviewer asks: "How many strings does your function return for `n`, and can you justify the count without enumerating?" Then: "What if I wanted only the `k`-th string in lexicographic order, without generating the others?"

## Solution

### The naive approach

Enumerate all `2^(2n)` strings over `{(, )}` and keep those that pass [Valid Parentheses](/practice/valid-parentheses). For `n = 8` that is 65,536 candidates for 1,430 answers, and the ratio gets worse exponentially. The interviewer will accept this as a baseline for about ten seconds.

### The insight

You never need to build a string that cannot be finished. A partial string can be completed to a valid one exactly when two conditions hold: it has used at most `n` opens, and it has never closed more than it opened. Enforce both while building and every leaf you reach is an answer. This is backtracking with pruning so tight there is no rejection at all.

### The optimal approach

Recurse with the current prefix and the counts of opens and closes used. Add `(` if `open < n`. Add `)` if `close < open`. Emit when the length hits `2n`.

```python
def generate_parentheses(n: int) -> list[str]:
    out: list[str] = []

    def build(prefix: str, opened: int, closed: int) -> None:
        if len(prefix) == 2 * n:
            out.append(prefix)
            return
        if opened < n:
            build(prefix + "(", opened + 1, closed)
        if closed < opened:
            build(prefix + ")", opened, closed + 1)

    build("", 0, 0)
    return out
```

The number of results is the `n`-th Catalan number, `C(2n, n) / (n + 1)`: 1, 2, 5, 14, 42, 132, 429, 1430 for `n = 1..8`. Each result costs `O(n)` to build, so the total is `O(n · Catalan(n))`, which is the size of the output; you cannot do better. Recursion depth is `2n`.

### Common mistakes

- Allowing `)` whenever `close < n` instead of `close < open`, which produces `")("`.
- Building strings by list mutation and forgetting to pop after the recursive call (the classic backtracking bug). String concatenation, as above, sidesteps it at the cost of `O(n)` copies per step, which is fine at this size.
- Deduplicating with a set "just in case". If you need a set, the branching rules are wrong.

### How to discuss it

Frame it as "I'll grow the string one character at a time and only take steps that can still be completed", then name the two rules. Mention the Catalan count and that it is also the number of binary trees with `n` nodes and of monotone lattice paths that never cross the diagonal; interviewers at the senior bar like hearing that these are the same object. For the `k`-th string follow-up: precompute how many completions each prefix has (a DP over `(open, close)` states, again Catalan-shaped) and descend greedily, choosing `(` if `k` falls within its subtree count and otherwise subtracting and choosing `)`. That converts an enumeration into an `O(n²)` ranking query, the same idea behind unranking permutations.
