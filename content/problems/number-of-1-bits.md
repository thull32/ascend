---
slug: number-of-1-bits
title: Number of 1 Bits
difficulty: easy
patterns: [bit-manipulation]
lists: [ascend-150]
companies: [apple, microsoft, amazon, qualcomm]
order: 2
lesson: interview-patterns/combinatorial-patterns/bit-manipulation-pattern
hints:
  - "You can test the lowest bit with n & 1 and then shift n right by one. That takes exactly 32 iterations for a 32-bit value. Can you make the loop run once per set bit instead?"
  - "n & (n - 1) clears the lowest set bit of n. Subtracting 1 flips the lowest 1 to 0 and every 0 below it to 1; the AND then wipes out that whole low section."
  - "In JavaScript, bitwise operators work on signed 32-bit integers. Values at or above 2³¹ look negative, and >> copies the sign bit forever; use >>> or the n & (n - 1) loop."
signatures:
  python:
    name: hamming_weight
    starter: |
      def hamming_weight(n: int) -> int:
          # n is an unsigned 32-bit value: 0 <= n < 2**32
          pass
  javascript:
    name: hamming_weight
    starter: |
      function hamming_weight(n) {
        // n is an unsigned 32-bit value: 0 <= n < 2**32
      }
tests:
  - args: [11]
    expected: 3
  - args: [128]
    expected: 1
    label: power of two
  - args: [0]
    expected: 0
    label: zero
  - args: [4294967295]
    expected: 32
    label: all 32 bits set
  - args: [255]
    expected: 8
  - args: [1]
    expected: 1
  - args: [2147483648]
    expected: 1
    hidden: true
    label: only the top bit
  - args: [4294967293]
    expected: 31
    hidden: true
  - args: [2863311530]
    expected: 16
    hidden: true
    label: alternating bits 1010...
  - args: [1431655765]
    expected: 16
    hidden: true
    label: alternating bits 0101...
time_limit_ms: 4000
---
Given an unsigned 32-bit integer `n`, return the number of bits in its binary representation that are `1`. This count is called the **Hamming weight** or **population count** (popcount).

`n` is passed as an ordinary non-negative integer in the range `0 ≤ n < 2³²`.

### Examples

| Input | Output | Why |
|---|---|---|
| `n = 11` | `3` | `11 = 1011₂` |
| `n = 128` | `1` | `128 = 1000 0000₂`, a single set bit |
| `n = 4294967293` | `31` | `0xFFFFFFFD`: every bit except bit 1 |

### Constraints

- `0 ≤ n ≤ 2³² - 1`

### Follow-up

The interviewer asks: "This function is called billions of times in a hot loop. How would you make it faster?" Then: "What does the CPU give you for free?"

## Solution

### The naive approach

Convert to a binary string and count the `'1'` characters: `bin(n).count("1")`. It is correct and in Python it is even fast, but it allocates a string and tells the interviewer nothing about bits. State it and move on.

### Shift and test

Check the lowest bit, shift right, repeat until `n` is 0:

```python
def hamming_weight_shift(n: int) -> int:
    count = 0
    while n:
        count += n & 1
        n >>= 1
    return count
```

This runs once per bit position up to the highest set bit, so at most 32 iterations.

### The insight

`n & (n - 1)` clears the **lowest set bit**. Subtracting 1 from `n` turns its lowest `1` into `0` and every `0` below it into `1`; the bits above are unchanged. AND-ing with the original keeps the high part and zeroes everything from the lowest set bit down:

```text
n       = 1011 0100
n - 1   = 1011 0011
n & n-1 = 1011 0000   (the 1 at bit 2 is gone)
```

Repeat until `n` is 0, counting iterations. The loop runs exactly once per set bit (Brian Kernighan's method), which is fewer iterations for sparse values and never more than 32.

### The optimal approach

```python
def hamming_weight(n: int) -> int:
    count = 0
    while n:
        n &= n - 1       # drop the lowest set bit
        count += 1
    return count
```

Trace `n = 11 = 1011₂`: `1011 & 1010 = 1010`, `1010 & 1001 = 1000`, `1000 & 0111 = 0000`. Three iterations, count 3.

Time `O(k)` where `k` is the number of set bits (at most 32), space `O(1)`.

### The 32-bit trap in JavaScript

JavaScript numbers are doubles, but its bitwise operators first convert to **signed** 32-bit integers. `2147483648` (only bit 31 set) becomes `-2147483648` inside `&`, `|` and `>>`. Consequences:

- `n >> 1` on that value gives `-1073741824`, and repeated `>>` converges to `-1`, never 0. A `while (n !== 0)` shift loop runs forever. Use the unsigned shift `n >>>= 1`.
- The `n &= n - 1` loop is safe: `2147483648 & 2147483647` is `0`, and once a value is negative the loop still clears one bit per step until it reaches 0.

Python has no fixed width at all: integers grow as needed and `>>` on a non-negative value reaches 0. That is why this problem states the input is non-negative; for a negative Python int, `bin(n)` shows a minus sign and `n & (n - 1)` would never reach 0. Mask first with `n & 0xFFFFFFFF` if you ever need the 32-bit view of a negative value.

### Common mistakes

- Using `>>` instead of `>>>` in JavaScript (or Java), creating an infinite loop for inputs with the top bit set. The hidden test with `2147483648` catches it.
- Looping a fixed 32 times but shifting a *mask* left instead of `n` right, then comparing `(n & mask) == 1` rather than `!= 0`.
- Believing `n & (n - 1)` is a magic incantation; be ready to explain the borrow that makes it work.

### How to discuss it

Write the shift loop, then improve it: "`n & (n - 1)` removes the lowest set bit, so the loop runs once per set bit". Draw the three-line binary example. For the performance follow-up, there are two real answers. First, a lookup table of popcounts for every byte (256 entries) gives four lookups per 32-bit value. Second, and better, the hardware: x86 has a `POPCNT` instruction and ARM has an equivalent, exposed as `__builtin_popcount` in C, `u32::count_ones` in Rust, `Integer.bitCount` in Java and `int.bit_count()` in Python 3.10+. A senior answer mentions that popcount is a genuinely hot operation in practice: bitmap indexes, Bloom filters, chess engines and similarity search over binary embeddings all lean on it.
