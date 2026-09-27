---
slug: reverse-integer
title: Reverse Integer
difficulty: medium
patterns: [bit-manipulation]
lists: [ascend-150]
companies: [apple, amazon, bloomberg, adobe]
order: 7
lesson: interview-patterns/combinatorial-patterns/bit-manipulation-pattern
hints:
  - "Pop the last digit with % 10 and push it onto the result with result * 10 + digit. Handle the sign separately so Python's floor-division rules for negatives do not bite."
  - "The result must fit in a signed 32-bit integer or you return 0. Pretend you cannot store anything wider: check for overflow before the multiply-and-add, not after."
  - "result * 10 + digit exceeds LIMIT exactly when result > (LIMIT - digit) // 10. Use LIMIT = 2³¹ - 1 for positive inputs and 2³¹ for negative ones."
signatures:
  python:
    name: reverse
    starter: |
      def reverse(x: int) -> int:
          # Return 0 if the reversed value is outside [-2**31, 2**31 - 1].
          # Assume you cannot hold any value outside that range, even temporarily.
          pass
  javascript:
    name: reverse
    starter: |
      function reverse(x) {
        // Return 0 if the reversed value is outside [-2**31, 2**31 - 1].
        // Assume you cannot hold any value outside that range, even temporarily.
      }
tests:
  - args: [472]
    expected: 274
  - args: [-350]
    expected: -53
    label: negative with trailing zero
  - args: [0]
    expected: 0
  - args: [1200]
    expected: 21
    label: trailing zeros disappear
  - args: [1534236469]
    expected: 0
    label: reversal overflows
  - args: [-2147483648]
    expected: 0
    label: most negative input
  - args: [2147483641]
    expected: 1463847412
    label: large input, safe reversal
  - args: [1463847412]
    expected: 2147483641
    hidden: true
    label: lands just below the maximum
  - args: [1563847412]
    expected: 0
    hidden: true
    label: overflows by a few
  - args: [-1463847412]
    expected: -2147483641
    hidden: true
  - args: [-1563847412]
    expected: 0
    hidden: true
  - args: [-9]
    expected: -9
    hidden: true
time_limit_ms: 4000
---
Given a signed 32-bit integer `x`, return `x` with its decimal digits reversed, keeping the sign. If the reversed value falls outside the signed 32-bit range `[-2³¹, 2³¹ - 1]`, return `0`.

Assume your environment **cannot hold any integer outside the signed 32-bit range**, not even as an intermediate value. Python and JavaScript can, but your solution should detect overflow as if they could not.

### Examples

| Input | Output | Why |
|---|---|---|
| `x = 472` | `274` | Digits reversed |
| `x = -350` | `-53` | The sign stays in front; the reversed leading zero disappears |
| `x = 1534236469` | `0` | The reversal `9646324351` exceeds `2³¹ - 1 = 2147483647` |

### Constraints

- `-2³¹ ≤ x ≤ 2³¹ - 1`

### Follow-up

The interviewer asks: "Why must the overflow check happen *before* the multiplication?" Then: "Could you check for overflow by reversing back and comparing?"

## Solution

### The naive approach

Convert to a string, reverse it, parse it back, and compare against the 32-bit limits: `int(str(abs(x))[::-1])` with the sign reapplied. In Python this is correct, because the parse cannot overflow. It violates the stated rule, though: the reversed value `9646324351` is materialised before the range check, and in a 32-bit language that value has already wrapped around to garbage by the time you check it.

### The insight

Reversing digits is a pop/push loop. `x % 10` pops the last digit, `x // 10` removes it, and `result * 10 + digit` pushes it onto the result. The only danger is the push: it can exceed the 32-bit range. So check, **before** pushing, whether the push would overflow:

$$ result \cdot 10 + d > LIMIT \iff result > \left\lfloor \frac{LIMIT - d}{10} \right\rfloor $$

Every quantity in that comparison stays within range, so the check itself never overflows. That is the whole technique: rearrange the inequality so the dangerous operation is never performed.

### Two Python-specific traps

- **Floor division and modulo with negatives.** In C, Java and JavaScript, `-123 % 10` is `-3` and integer division truncates toward zero. In Python, `-123 % 10` is `7` and `-123 // 10` is `-13`, because `//` floors toward negative infinity. Porting a C solution directly into Python silently produces nonsense for negative input. Work on `abs(x)` and reapply the sign at the end.
- **The asymmetric range.** The limit on the negative side is `2³¹ = 2147483648`, one more than the positive limit `2147483647`. Using the magnitude-based loop, pick `LIMIT` by sign. (No valid 32-bit input can actually reverse to exactly `-2³¹`, since that would need the input `-8463847412`, which is out of range, but writing the bound correctly costs nothing and shows you know the range is asymmetric.)

Python has unbounded integers, so to honour "cannot hold wider values" we impose the 32-bit bounds by hand with explicit constants, the same way a mask imposes a bit width.

### The optimal approach

```python
INT_MAX = 2**31 - 1      #  2147483647
INT_MIN_MAG = 2**31      #  2147483648, magnitude of -2**31


def reverse(x: int) -> int:
    negative = x < 0
    limit = INT_MIN_MAG if negative else INT_MAX
    x = -x if negative else x    # safe in Python; in C you would widen first
    result = 0
    while x:
        d = x % 10
        x //= 10
        # Would result * 10 + d exceed the limit? Check without computing it.
        if result > (limit - d) // 10:
            return 0
        result = result * 10 + d
    return -result if negative else result
```

Trace `1563847412` (limit `2147483647`). After popping nine digits, `result = 214748365` and the last digit is `d = 1`. The check computes `(2147483647 - 1) // 10 = 214748364`, and `214748365 > 214748364`, so the push would overflow: return `0`. The true reversal, `2147483651`, is never formed.

Trace `1463847412`: after nine digits `result = 214748364`, `d = 1`, and `214748364 > 214748364` is false. The push gives `2147483641`, which fits.

Time `O(log |x|)`: one iteration per decimal digit, at most 10. Space `O(1)`.

In JavaScript, `%` truncates toward zero like C, so a sign-agnostic loop using `Math.trunc(x / 10)` works for negatives too; the overflow check must then compare against both `INT_MAX / 10` and `INT_MIN / 10` bounds.

### Common mistakes

- Checking `result > INT_MAX` *after* `result = result * 10 + d`. In Python it gives the right answer; in any fixed-width language the value has already wrapped and the check is meaningless. Interviewers set this problem to see whether you check first.
- Using Python's `%` and `//` on negative `x`. `-35 % 10` is `5`, not `-5`, so the digits come out wrong; worse, `-1 // 10` is `-1`, so a `while x != 0` loop never terminates.
- Negating `x = -2147483648` in a 32-bit type, which overflows back to itself. The test with the most negative input exists for this. In Python it is safe, and the loop then detects that the reversal overflows.
- Treating trailing zeros specially. `1200` reverses to `0021`, which is just `21`; the arithmetic handles it without any extra code.

### How to discuss it

Write the pop/push loop, then say "the only unsafe operation is the push, so I check `result > (LIMIT - d) // 10` before doing it". State the Python floor-division trap and the asymmetric range unprompted. For the follow-up about reversing back: undoing a push with `(result - d) / 10` and comparing works in C *only* because signed overflow happens to wrap on common hardware, but signed overflow is undefined behaviour in C and C++, so the compiler may assume it never happens and delete your check. That is a production bug class, not a hypothetical, and knowing it is a strong senior signal. The pre-check is portable; the post-check is not.
