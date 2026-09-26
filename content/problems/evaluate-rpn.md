---
slug: evaluate-rpn
title: Evaluate Reverse Polish Notation
difficulty: medium
patterns: [stack]
lists: [ascend-150]
companies: [amazon, linkedin, google]
order: 3
lesson: interview-patterns/sequence-patterns/stack-patterns
hints:
  - In postfix notation an operator always applies to the two most recent values that have not yet been consumed. Which structure hands you "the two most recent"?
  - Push numbers. On an operator, pop the right operand first, then the left, apply, and push the result. The final stack holds exactly one number.
  - Division truncates toward zero; Python's `//` floors toward negative infinity. `int(a / b)` gives the required behaviour for the input range.
signatures:
  python:
    name: eval_rpn
    starter: |
      def eval_rpn(tokens: list[str]) -> int:
          pass
  javascript:
    name: eval_rpn
    starter: |
      function eval_rpn(tokens) {
      }
tests:
  - args: [["2", "1", "+", "3", "*"]]
    expected: 9
  - args: [["4", "13", "5", "/", "+"]]
    expected: 6
  - args: [["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]]
    expected: 22
    label: division result truncates toward zero
  - args: [["3"]]
    expected: 3
    label: single number
  - args: [["7", "2", "/"]]
    expected: 3
  - args: [["-7", "2", "/"]]
    expected: -3
    hidden: true
    label: negative division truncates toward zero, not down
  - args: [["5", "3", "-"]]
    expected: 2
    label: operand order for subtraction
  - args: [["2", "3", "4", "*", "+"]]
    expected: 14
    hidden: true
  - args: [["1", "-1", "*"]]
    expected: -1
    hidden: true
    label: negative literal token
  - args: [["0", "5", "-", "3", "*"]]
    expected: -15
time_limit_ms: 4000
---
You are given a list of string tokens representing an arithmetic expression in Reverse Polish Notation (postfix): operands come first and each operator applies to the two values immediately before it. Evaluate the expression and return the result as an integer.

Tokens are either integers (possibly negative, like `"-11"`) or one of the four operators `+`, `-`, `*`, `/`. Division between two integers truncates toward zero, so `7 / 2 = 3` and `-7 / 2 = -3`. The expression is always well-formed, no division by zero occurs, and no intermediate value overflows a 32-bit signed integer.

### Examples

| Input | Output | Why |
|---|---|---|
| `["2", "1", "+", "3", "*"]` | `9` | `(2 + 1) * 3` |
| `["4", "13", "5", "/", "+"]` | `6` | `4 + (13 / 5)` and `13 / 5` truncates to `2` |
| `["5", "3", "-"]` | `2` | The *earlier* operand is on the left: `5 - 3`, not `3 - 5` |

### Constraints

- `1 ≤ len(tokens) ≤ 10⁴`
- Every token is an operator or an integer in `[-200, 200]`

### Follow-up

The interviewer asks: "Now give me the infix version: evaluate `"3 + 4 * (2 - 1)"` with precedence. How does your stack change?" Then: "What does a compiler do with this, and why does postfix need no parentheses?"

## Solution

### The naive approach

Find the leftmost operator, apply it to the two tokens before it, splice the result back into the list, repeat. Each splice is `O(n)`, so `O(n²)` overall. It works, but list splicing in a loop is a signal you have not recognised the shape of the problem.

### The insight

Postfix is designed so that an operator consumes the two *most recently produced* values. "Most recent, not yet consumed" is a stack. There is never any ambiguity about which values an operator takes, which is why postfix needs no parentheses and no precedence table.

### The optimal approach

Walk the tokens. A number is pushed. An operator pops `b` (the right operand, pushed last) then `a`, pushes `a op b`. When the tokens run out the stack contains exactly one value.

```python
def eval_rpn(tokens: list[str]) -> int:
    stack: list[int] = []
    for tok in tokens:
        if tok in ("+", "-", "*", "/"):
            b = stack.pop()
            a = stack.pop()
            if tok == "+":
                stack.append(a + b)
            elif tok == "-":
                stack.append(a - b)
            elif tok == "*":
                stack.append(a * b)
            else:
                stack.append(int(a / b))  # truncates toward zero
        else:
            stack.append(int(tok))
    return stack[-1]
```

Time `O(n)`: every token is processed once and each push/pop is `O(1)`. Space `O(n)` for the stack in the worst case (an expression like `1 2 3 4 5 + + + +` pushes everything before any operator runs).

`int(a / b)` uses floating-point division, which is exact for the magnitudes here (well under 2⁵³). For arbitrary-size integers use `abs(a) // abs(b)` with the sign restored, because Python's `//` floors: `-7 // 2 == -4`, not `-3`.

### Common mistakes

- Popping in the wrong order and computing `b - a`. Test with `["5", "3", "-"]`.
- Using `//` for division and failing on negatives.
- Testing `tok.isdigit()` to detect numbers; it returns `False` for `"-11"`. Check for the operator set instead.

### How to discuss it

Say "postfix is the trace of a stack machine" and walk `["2", "1", "+", "3", "*"]` showing the stack after each token. For the infix follow-up, describe the shunting-yard algorithm: a second stack for operators, popping to the output while the top has higher-or-equal precedence, and parentheses acting as a barrier. That is exactly how a compiler front-end lowers expressions, and the postfix output is the instruction stream for a stack-based VM (the JVM and CPython bytecode are both stack machines). Related: [Decode String](/practice/decode-string) uses the same "push state, resolve on the closing token" shape.
