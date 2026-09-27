---
slug: sum-of-two-integers
title: Sum of Two Integers
difficulty: medium
patterns: [bit-manipulation]
lists: [ascend-150]
companies: [meta, amazon, apple, microsoft]
order: 6
lesson: interview-patterns/combinatorial-patterns/bit-manipulation-pattern
hints:
  - "Add two single bits by hand: 0+0=0, 0+1=1, 1+1=10. Which bitwise operator gives the sum bit without the carry, and which gives the carry?"
  - "a ^ b is the sum ignoring carries; (a & b) << 1 is the carries, already moved to where they must be added. Adding those two is the same problem again, and the carry eventually becomes zero."
  - "In Python integers are unbounded, so a negative number's carry marches left forever. Mask every step with & 0xFFFFFFFF to simulate 32-bit registers, and convert the final 32-bit pattern back to a signed value if bit 31 is set."
signatures:
  python:
    name: get_sum
    starter: |
      def get_sum(a: int, b: int) -> int:
          # Do not use + or - (or sum(), or anything that adds for you).
          pass
  javascript:
    name: get_sum
    starter: |
      function get_sum(a, b) {
        // Do not use + or - (or anything that adds for you).
      }
tests:
  - args: [1, 2]
    expected: 3
  - args: [-2, 3]
    expected: 1
    label: mixed signs
  - args: [-5, -7]
    expected: -12
    label: both negative
  - args: [0, 0]
    expected: 0
  - args: [15, 17]
    expected: 32
    label: long carry chain
  - args: [-1, 1]
    expected: 0
    label: carry runs off the top
  - args: [1000, -1000]
    expected: 0
    hidden: true
  - args: [-1000, -1000]
    expected: -2000
    hidden: true
  - args: [-8, 5]
    expected: -3
    hidden: true
  - args: [2147483646, 1]
    expected: 2147483647
    hidden: true
    label: largest 32-bit result
  - args: [-2147483647, -1]
    expected: -2147483648
    hidden: true
    label: smallest 32-bit result
time_limit_ms: 4000
---
Return the sum of two integers `a` and `b` **without using the `+` or `-` operators** (and without library calls that add for you, such as `sum`). Treat the integers as **32-bit signed two's-complement** values: the inputs and their true sum always fit in that range.

### Examples

| Input | Output | Why |
|---|---|---|
| `a = 1`, `b = 2` | `3` | `01 ^ 10 = 11`, no carries |
| `a = -2`, `b = 3` | `1` | In two's complement the carry out of bit 31 is simply dropped |
| `a = -5`, `b = -7` | `-12` | Negative plus negative still works bit by bit |

### Constraints

- `-2³¹ ≤ a, b ≤ 2³¹ - 1`
- `-2³¹ ≤ a + b ≤ 2³¹ - 1`

### Follow-up

The interviewer asks: "Why does your loop terminate?" Then: "How would you implement subtraction and multiplication the same way?"

## Solution

### The naive approach

Increment or decrement one operand `|b|` times (with `++`/`--`, if those count as allowed). It is `O(|b|)`, a billion steps in the worst case, and it dodges the question. The problem is really asking you to explain how an adder works.

### The insight

Look at a single bit position. The sum bit is 1 when exactly one input bit is 1: that is **XOR**. A carry is produced when both are 1: that is **AND**, and the carry belongs one position to the left, so shift it. For whole words:

- `a ^ b` is the sum with every carry ignored.
- `(a & b) << 1` is every carry, already in the position where it must be added.

`a + b == (a ^ b) + ((a & b) << 1)`. The right-hand side is another addition, so repeat with `a = a ^ b`, `b = carry` until the carry is zero. Each round, the lowest position where a carry could still be non-zero moves at least one place left. In a 32-bit register the carry is shifted out of the word after at most 32 rounds, so the loop terminates.

Trace `15 + 17` (`01111 + 10001`):

| round | a | b (carry) |
|---|---|---|
| start | 01111 | 10001 |
| 1 | 11110 | 00010 |
| 2 | 11100 | 00100 |
| 3 | 11000 | 01000 |
| 4 | 10000 | 10000 |
| 5 | 00000 | 100000 |
| 6 | 100000 | 0 |

Result `100000₂ = 32`. The carry ripples through every bit, which is exactly how a ripple-carry adder in hardware behaves.

### 32-bit semantics in Python

In C, Java or JavaScript this loop works as written, because the registers are 32 bits wide and a carry out of bit 31 disappears. **Python integers are unbounded**, and negative numbers behave as if they had infinitely many leading 1 bits. For `-1 + 1`, the carry never falls off a top bit; it moves left forever and the loop never ends.

The fix is to simulate 32-bit registers explicitly:

1. After every operation, **mask** with `0xFFFFFFFF` so only the low 32 bits survive. That is what "the carry out of bit 31 is dropped" means.
2. At the end, the result is a 32-bit pattern in the range `0..2³² - 1`. If bit 31 is set (`result > 0x7FFFFFFF`), the pattern represents a negative number. Convert it back with `~(result ^ 0xFFFFFFFF)`: XOR with the mask flips the low 32 bits, and `~` flips *all* bits, which restores the low 32 and sets the infinitely many high bits to 1, giving Python's negative value. (Equivalently, `result - 2**32`, but that uses the forbidden `-`.)

### The optimal approach

```python
MASK = 0xFFFFFFFF        # keep 32 bits
INT_MAX = 0x7FFFFFFF     # largest positive 32-bit signed value


def get_sum(a: int, b: int) -> int:
    a &= MASK
    b &= MASK
    while b:
        carry = ((a & b) << 1) & MASK   # carries, with bit 32 dropped
        a = (a ^ b) & MASK              # sum without carries
        b = carry
    # a is now a 32-bit pattern; reinterpret bit 31 as the sign.
    return a if a <= INT_MAX else ~(a ^ MASK)
```

Trace `-1 + 1`: `a = 0xFFFFFFFF`, `b = 1`. The carry moves up one bit per round: after round `k` the sum is 32 bits with the low `k` bits zero and the carry is `1 << k`. At round 32 the carry becomes `1 << 32`, the mask drops it to `0`, and the loop ends with `a = 0`.

Time `O(1)`: at most 32 rounds for 32-bit values, because after round `k` the carry has no set bits below position `k`. Space `O(1)`.

In JavaScript no masking is needed, because `^`, `&` and `<<` already produce signed 32-bit results:

```javascript
function get_sum(a, b) {
  while (b !== 0) {
    const carry = (a & b) << 1;
    a = a ^ b;
    b = carry;
  }
  return a;
}
```

### Common mistakes

- Porting the C/JavaScript loop straight into Python. It works for non-negative inputs and hangs forever on `-1 + 1`. The validator's time limit exists for exactly this.
- Masking only the inputs. The loop then terminates (both operands are non-negative after masking), but nothing drops the carry out of bit 31: `-1 + 1` becomes `0xFFFFFFFF + 1 = 2³²`, and the sign conversion turns that into `-8589934592` instead of `0`.
- Returning the masked pattern directly: `-2 + 3` gives `1` correctly, but `-5 + -7` returns `4294967284` instead of `-12`.
- Converting back with `a - 2**32` when the problem forbids `-`. Harmless in practice, but interviewers who set this problem notice.

### How to discuss it

Explain the single-bit truth table first, then the identity `a + b = (a ^ b) + ((a & b) << 1)`, then why it terminates (the carry moves left and falls off a finite word). In Python, raise the unbounded-integer issue *before* the interviewer does: "Python has no 32-bit wrap-around, so I simulate it with a `0xFFFFFFFF` mask and reinterpret bit 31 at the end." That single sentence is most of what this problem tests. For subtraction, `a - b = a + (~b + 1)` (two's-complement negation), using the same adder for the `+ 1`. Multiplication is shift-and-add: for each set bit `i` of `b`, add `a << i`. Real hardware replaces the ripple-carry loop with carry-lookahead adders that compute all carries in `O(log w)` gate depth, which is why addition is a single-cycle instruction.
