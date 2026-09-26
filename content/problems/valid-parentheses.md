---
slug: valid-parentheses
title: Valid Parentheses
difficulty: easy
patterns: [stack]
lists: [core-75, ascend-150]
companies: [amazon, google, meta, bloomberg]
order: 1
lesson: interview-patterns/sequence-patterns/stack-patterns
hints:
  - Every closing bracket must match the most recently opened bracket that has not yet been closed. Which data structure gives you "most recent" in O(1)?
  - Push opening brackets. On a closing bracket, pop and compare; a mismatch or an empty stack means the string is invalid.
  - The string is only valid if the stack is empty when you finish. `"(("` never closes anything but also never mismatches.
signatures:
  python:
    name: is_valid
    starter: |
      def is_valid(s: str) -> bool:
          pass
  javascript:
    name: is_valid
    starter: |
      function is_valid(s) {
      }
tests:
  - args: ["()"]
    expected: true
  - args: ["()[]{}"]
    expected: true
  - args: ["(]"]
    expected: false
    label: wrong bracket type
  - args: ["([)]"]
    expected: false
    label: interleaved
  - args: ["{[]}"]
    expected: true
    label: nested
  - args: [""]
    expected: true
    label: empty string
  - args: ["("]
    expected: false
    hidden: true
    label: never closed
  - args: [")"]
    expected: false
    hidden: true
    label: close with nothing open
  - args: ["([{}])({})"]
    expected: true
    hidden: true
  - args: ["(()"]
    expected: false
    hidden: true
time_limit_ms: 4000
---
You are given a string `s` made only of the six bracket characters `(`, `)`, `[`, `]`, `{` and `}`. Decide whether the brackets are balanced: every opening bracket is closed by the same kind of bracket, and brackets close in the reverse order they were opened. Return `true` if the string is balanced and `false` otherwise.

The empty string is balanced.

### Examples

| Input | Output | Why |
|---|---|---|
| `"()[]{}"` | `true` | Three independent balanced pairs |
| `"{[]}"` | `true` | `[]` is nested inside `{}` and closes first |
| `"([)]"` | `false` | `)` arrives while `[` is the most recent open bracket |
| `"(("` | `false` | Nothing is mismatched, but two brackets are never closed |

### Constraints

- `0 ≤ len(s) ≤ 10⁴`
- `s` contains only `()[]{}`

### Follow-up

The interviewer asks: "Now the input arrives as a stream and you cannot buffer it all. What is the minimum state you need?" Then: "What if I only had one bracket type; can you do it in O(1) space?"

## Solution

### The naive approach

Repeatedly delete any adjacent `()`, `[]` or `{}` pair until nothing changes; the string is valid if it ends up empty. Each pass is `O(n)` and there can be `O(n)` passes, so `O(n²)`. It also rebuilds strings constantly. It is correct, and it is the kind of answer that says you have not seen a stack before.

### The insight

A closing bracket is only ever allowed to match the *most recently opened, not yet closed* bracket. "Most recent thing I have not dealt with" is exactly what a stack tracks: push opens, and the top is always the one a close must match.

### The optimal approach

Walk the string once. Push each opening bracket. On a closing bracket, the stack must be non-empty and its top must be the matching opener; pop it. If either check fails, return `false` immediately. At the end, the string is valid only if the stack is empty; leftovers are unclosed openers.

```python
def is_valid(s: str) -> bool:
    pairs = {")": "(", "]": "[", "}": "{"}
    stack: list[str] = []
    for ch in s:
        if ch in pairs:
            if not stack or stack[-1] != pairs[ch]:
                return False
            stack.pop()
        else:
            stack.append(ch)
    return not stack
```

Time `O(n)`: each character is pushed and popped at most once. Space `O(n)` in the worst case (`"((((("`).

A cheap early exit: an odd-length string can never be balanced. It does not change the complexity but interviewers notice it.

### Common mistakes

- Forgetting the final `not stack` check, which accepts `"(("`.
- Popping from an empty stack on `")"` and crashing instead of returning `false`.
- Checking only that counts match (`3` opens and `3` closes), which accepts `")("`.

### How to discuss it

Say what the stack represents ("the open brackets I still owe a close for") before writing code. Trace `"([)]"` by hand to show the mismatch at the third character. For the streaming follow-up: the state is the stack itself and it is unbounded in general, because `"((((...)))"` needs to remember its depth. With a single bracket type the stack degenerates to a counter (increment on open, decrement on close, never below zero, zero at the end), which is `O(1)` space; that counter is the seed of the greedy trick behind [Valid Parenthesis String](/practice/valid-parenthesis-string).
