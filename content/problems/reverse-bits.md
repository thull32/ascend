---
slug: reverse-bits
title: Reverse Bits
difficulty: easy
patterns: [bit-manipulation]
lists: [ascend-150]
companies: [apple, amazon, microsoft, airbnb]
order: 4
lesson: interview-patterns/combinatorial-patterns/bit-manipulation-pattern
hints:
  - "Reversing means bit 0 moves to bit 31, bit 1 to bit 30, and so on. Leading zeros matter: 1 becomes 2³¹, not 1. So the loop must run exactly 32 times, not 'until n is zero'."
  - "Build the result one bit at a time: shift the result left by one, OR in the lowest bit of n, then shift n right by one. After 32 rounds, the first bit you read is in the highest position."
  - "In Python, keep the result inside 32 bits with & 0xFFFFFFFF if you ever shift without a fixed count. In JavaScript, bitwise results are signed; finish with >>> 0 to read the value as unsigned."
signatures:
  python:
    name: reverse_bits
    starter: |
      def reverse_bits(n: int) -> int:
          # n is an unsigned 32-bit value; return an unsigned 32-bit value.
          pass
  javascript:
    name: reverse_bits
    starter: |
      function reverse_bits(n) {
        // n is an unsigned 32-bit value; return an unsigned 32-bit value.
      }
tests:
  - args: [1]
    expected: 2147483648
    label: lowest bit becomes the top bit
  - args: [0]
    expected: 0
  - args: [4294967295]
    expected: 4294967295
    label: all ones
  - args: [2147483648]
    expected: 1
    label: top bit becomes the lowest bit
  - args: [6]
    expected: 1610612736
  - args: [13]
    expected: 2952790016
  - args: [305419896]
    expected: 510274632
    label: "0x12345678 reversed"
  - args: [4294967294]
    expected: 2147483647
    hidden: true
  - args: [65535]
    expected: 4294901760
    hidden: true
    label: low half moves to high half
  - args: [2863311530]
    expected: 1431655765
    hidden: true
    label: 1010... becomes 0101...
time_limit_ms: 4000
---
Given a 32-bit **unsigned** integer `n`, reverse the order of its 32 bits and return the result as an unsigned integer. Bit 0 (the least significant) becomes bit 31, bit 1 becomes bit 30, and so on. All 32 positions count, including leading zeros.

Inputs and outputs are ordinary non-negative integers in the range `0 ≤ value < 2³²`.

### Examples

| Input | Output | Why |
|---|---|---|
| `n = 1` | `2147483648` | `000…0001` reversed is `1000…000` = `2³¹` |
| `n = 6` | `1610612736` | `…0110` reversed puts 1s at bits 30 and 29: `2³⁰ + 2²⁹` |
| `n = 305419896` | `510274632` | `0x12345678` reversed is `0x1E6A2C48` |

### Constraints

- `0 ≤ n ≤ 2³² - 1`

### Follow-up

The interviewer asks: "This function is called millions of times. How would you optimise it?" Then: "Can you do it without a loop?"

## Solution

### The naive approach

Format as a zero-padded 32-character binary string, reverse the string, and parse it back: `int(format(n, "032b")[::-1], 2)`. It is correct, and the zero padding is the part candidates forget. It allocates strings on every call and avoids the actual bit manipulation.

### The insight

Think of `n` as a stack of 32 bits you pop from the bottom, and the result as a stack you push onto from the bottom. Popping gives bits in order 0, 1, 2, …; pushing each onto the result shifts the earlier ones up. After 32 pushes, the first bit popped (bit 0 of `n`) has been shifted up 31 times and sits at bit 31.

The loop count must be **exactly 32**. Stopping when `n` becomes 0 loses the leading-zero positions: reversing `1` that way gives `1` instead of `2³¹`.

### The optimal approach

```python
MASK32 = 0xFFFFFFFF


def reverse_bits(n: int) -> int:
    n &= MASK32                    # treat the input as exactly 32 bits
    result = 0
    for _ in range(32):
        result = (result << 1) | (n & 1)   # push n's lowest bit onto result
        n >>= 1                            # pop it from n
    return result & MASK32         # a no-op after exactly 32 rounds, but explicit
```

Trace with 4-bit words for readability, `n = 0110`:

| round | n & 1 | result |
|---|---|---|
| 1 | 0 | 0000 |
| 2 | 1 | 0001 |
| 3 | 1 | 0011 |
| 4 | 0 | 0110 |

In 4 bits, `0110` is its own reverse. In 32 bits, the same bits end up at positions 30 and 29, which is why `reverse_bits(6)` is `1610612736`.

Time `O(1)`: exactly 32 iterations. Space `O(1)`.

### Handling 32-bit semantics explicitly

Python and JavaScript both lack a native `uint32`, in opposite ways.

- **Python** integers are unbounded. Shifting left never overflows; it just makes the number bigger. The algorithm above stays inside 32 bits only because it runs exactly 32 rounds. The `& 0xFFFFFFFF` on entry and exit makes the width explicit: the entry mask turns any out-of-range or negative input into its 32-bit pattern, and the exit mask guarantees a 32-bit result even if someone later changes the loop. When a problem says "32-bit", masking with `0xFFFFFFFF` is how you impose that width in Python.
- **JavaScript** bitwise operators convert to **signed** 32-bit integers. After the loop, `result` holds the right bit pattern, but if bit 31 is set it reads as negative: reversing `1` gives `-2147483648`. Finish with `result >>> 0`, which reinterprets the same 32 bits as unsigned (`2147483648`). Inside the loop, use `n >>>= 1` rather than `n >>= 1` so a set top bit does not smear across the word.

```javascript
function reverse_bits(n) {
  let result = 0;
  for (let i = 0; i < 32; i++) {
    result = (result << 1) | (n & 1);
    n >>>= 1;
  }
  return result >>> 0;
}
```

### Common mistakes

- Looping `while n:` instead of exactly 32 times; the leading zeros are dropped and small inputs come back unchanged.
- Returning a negative number in JavaScript (or Java) because the signed interpretation of bit 31 was never converted.
- Placing each bit with `result |= (n & 1) << (31 - i)` in Python without masks and then, on a later refactor, shifting past bit 31. Unbounded integers make that silently produce a 33-bit or larger value.

### How to discuss it

State why the count must be 32, write the push/pop loop, and explain the language-specific width handling: "Python has no overflow, so I impose 32 bits with `& 0xFFFFFFFF`; in JavaScript the operators are signed 32-bit, so I convert with `>>> 0`." For the performance follow-up, cache: precompute the reversal of every byte (256 entries), then reverse a word as four table lookups placed in swapped byte order. For the loop-free version, swap progressively larger groups with masks: adjacent bits (`0x55555555`), then pairs (`0x33333333`), nibbles (`0x0F0F0F0F`), bytes (`0x00FF00FF`), and finally the two 16-bit halves. Five mask-and-shift steps instead of 32 iterations; it is the same divide-and-conquer idea as the parallel popcount. Some CPUs expose it directly (ARM has an `RBIT` instruction), which is worth knowing even if you never write assembly.
