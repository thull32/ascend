---
slug: bit-manipulation-pattern
title: "Bit manipulation: the six tricks and when a problem is secretly asking for them"
description: Recognise the constraints that point at XOR, masks and bit counting, memorise the handful of identities that solve the whole family, and see Single Number, Counting Bits, Sum of Two Integers and Reverse Bits traced bit by bit.
minutes: 28
difficulty: medium
tags: [bit-manipulation, xor, bitmask, twos-complement, pattern:bit-manipulation]
problems: [single-number, number-of-1-bits, counting-bits, reverse-bits, missing-number, sum-of-two-integers, reverse-integer]
---
"Every element appears twice except one; find it in O(1) space." "Add two integers without using `+`." "Count the set bits of every number from 0 to `n` in linear time." These read as puzzles, and candidates who have not seen them either freeze or reach for a hash map that violates the space constraint. They are not puzzles. They are a small, closed set of identities about how integers are stored, and the constraint in the statement ("O(1) space", "without arithmetic operators", "linear") is the interviewer telling you which identity to use.

There are about six of them. XOR cancels pairs. `n & (n − 1)` clears the lowest set bit. `n & −n` isolates it. A mask selects bits. Shifts multiply and divide by two. And two's complement means negative numbers are just large unsigned ones, which is the fact that makes the "no `+`" problem work and the fact that bites you in JavaScript. Know the six, know the signal for each, and this family goes from intimidating to ten minutes.

## The signal

Reach for bits when the statement contains any of these:

- **"Appears twice / an even number of times, except one"** with **"O(1) extra space"**: XOR everything ([Single Number](/practice/single-number)). Pairs cancel; the survivor remains.
- **"Missing one number from 0..n"** with the same space constraint ([Missing Number](/practice/missing-number)): XOR the indices with the values, or use the sum formula.
- **"Count the 1 bits"**, "Hamming weight", "for every number up to n" ([Number of 1 Bits](/practice/number-of-1-bits), [Counting Bits](/practice/counting-bits)): `n & (n − 1)` per bit, or the `dp[i] = dp[i >> 1] + (i & 1)` recurrence.
- **"Without using + or −"**, "implement addition/multiplication with bitwise ops" ([Sum of Two Integers](/practice/sum-of-two-integers)): XOR is the sum without carries, AND shifted left is the carries; iterate until no carry.
- **"Reverse the bits", "swap nibbles", "is a power of two"** ([Reverse Bits](/practice/reverse-bits)): masks and shifts.
- **Subsets of a small set (`n ≤ 20`) as integers**: iterate `mask` from 0 to `2ⁿ − 1`, test membership with `mask >> i & 1`. This is the bridge to bitmask DP and to the [Backtracking](/learn/interview-patterns/combinatorial-patterns/backtracking-pattern) lesson's N-Queens sets.
- **Overflow language** ("32-bit signed", "return 0 if it overflows") ([Reverse Integer](/practice/reverse-integer)): the problem is about the width, not the bits, but it lives here because the check is a comparison against `2³¹ − 1`.

What rules it out:

- **The constraint permits `O(n)` space and the input is not about bits.** A frequency map solves Single Number in one line, and if the interviewer allows it, use it and mention XOR as the `O(1)`-space version.
- **"Appears three times except one".** XOR alone does not work; you need per-bit counting mod 3 (or the two-mask state machine). Recognise the difference.
- **Floating-point.** Bit tricks assume integers.

## The template

The identities, each with its one-line reason:

```python
x ^ x == 0; x ^ 0 == x              # XOR is its own inverse: pairs cancel, order irrelevant
n & (n - 1)                         # clears the lowest set bit (borrow ripples up to it)
n & -n                              # isolates the lowest set bit (two's complement flips above it)
n & (n - 1) == 0 and n > 0          # power of two: exactly one bit set
(n >> i) & 1                        # read bit i
n | (1 << i); n & ~(1 << i)         # set / clear bit i
n ^ (1 << i)                        # toggle bit i
x << k == x * 2**k; x >> k == x // 2**k   # for non-negative x
```

The two loops that recur across the family:

```python
def popcount(n):
    count = 0
    while n:
        n &= n - 1                        # one iteration per set bit
        count += 1
    return count


def add(a, b):
    MASK, MAX = 0xFFFFFFFF, 0x7FFFFFFF    # simulate 32-bit two's complement
    while b:
        a, b = (a ^ b) & MASK, ((a & b) << 1) & MASK   # sum without carry, carry
    return a if a <= MAX else ~(a ^ MASK)  # reinterpret as signed
```

```javascript
function popcount(n) {
  let count = 0;
  n >>>= 0;                                // treat as unsigned 32-bit
  while (n) { n &= n - 1; count++; }
  return count;
}

function add(a, b) {
  while (b !== 0) {
    const carry = (a & b) << 1;           // JS bitwise ops are already 32-bit signed
    a = a ^ b;
    b = carry;
  }
  return a;
}
```

The language differences matter and interviewers ask about them:

| | Python | JavaScript |
|---|---|---|
| integer width | arbitrary precision; `~x` is `-x - 1` with infinite sign bits | bitwise operators convert to **32-bit signed**; `>>>` gives unsigned |
| consequence for `add` | must mask to 32 bits and reinterpret the sign at the end | works directly; overflow wraps as the problem expects |
| consequence for `reverse bits` | `n >> 1` on a 32-bit value is fine; result needs no mask | use `>>>` or the sign bit poisons the shift |
| `1 << 31` | 2147483648 | −2147483648 (sign bit set) |

Watch XOR cancel pairs and leave the singleton:

```viz
{"type": "bits", "algorithm": "single-number", "values": [4, 1, 2, 1, 2], "title": "Single Number by XOR", "caption": "Each pair of equal values XORs to zero; only the unpaired value survives."}
```

## Worked problems

### Single Number

[Single Number](/practice/single-number): every element appears exactly twice except one. Find it in `O(n)` time and `O(1)` space.

```python
def single_number(nums):
    acc = 0
    for x in nums:
        acc ^= x
    return acc
```

Trace on `[4, 1, 2, 1, 2]` in binary:

| `x` | binary | `acc` after | binary |
|---|---|---|---|
| 4 | 100 | 4 | 100 |
| 1 | 001 | 5 | 101 |
| 2 | 010 | 7 | 111 |
| 1 | 001 | 6 | 110 |
| 2 | 010 | 4 | 100 |

The second 1 undid the first, the second 2 undid the first, and 4 remained. XOR is associative and commutative, so the order of appearance is irrelevant: the accumulator is `4 ^ (1 ^ 1) ^ (2 ^ 2) = 4 ^ 0 ^ 0`. Negative numbers work unchanged because XOR operates on the two's complement representation, which is unique per value.

[Missing Number](/practice/missing-number) is the same identity: XOR `0..n` together with every element; each present value cancels with its index and the missing one survives. The sum formula `n(n+1)/2 − sum(nums)` is equally valid and the interviewer will accept either; mention overflow if the language has fixed-width ints.

### Counting Bits

[Counting Bits](/practice/counting-bits): for every `i` in `0..n`, the number of 1 bits, in `O(n)` total.

Running `popcount` on each number is `O(n log n)`. The `O(n)` version notices that `i` and `i >> 1` differ by exactly the lowest bit: `bits(i) = bits(i >> 1) + (i & 1)`. Or equivalently `bits(i) = bits(i & (i − 1)) + 1`, since clearing one set bit leaves a smaller number with one fewer.

```python
def count_bits(n):
    dp = [0] * (n + 1)
    for i in range(1, n + 1):
        dp[i] = dp[i >> 1] + (i & 1)
    return dp
```

Trace for `n = 8`:

| `i` | binary | `i >> 1` | `i & 1` | `dp[i]` |
|---|---|---|---|---|
| 1 | 1 | 0 | 1 | 1 |
| 2 | 10 | 1 | 0 | 1 |
| 3 | 11 | 1 | 1 | 2 |
| 4 | 100 | 2 | 0 | 1 |
| 5 | 101 | 2 | 1 | 2 |
| 6 | 110 | 3 | 0 | 2 |
| 7 | 111 | 3 | 1 | 3 |
| 8 | 1000 | 4 | 0 | 1 |

`[0, 1, 1, 2, 1, 2, 2, 3, 1]`. Each entry is one array lookup and one addition; `O(n)` time and the output array is the only space. This is a DP with the smallest possible state, and saying "the recurrence is on `i >> 1`" is enough for the interviewer.

```viz
{"type": "bits", "algorithm": "count-bits", "values": [0, 1, 2, 3, 4, 5, 6, 7, 8], "title": "Counting bits from i >> 1", "caption": "Each count is the count of the number with its lowest bit shifted away, plus that lowest bit."}
```

### Sum of Two Integers

[Sum of Two Integers](/practice/sum-of-two-integers): add two 32-bit signed integers without `+` or `−`.

Binary addition, column by column: the sum bit is `a ^ b` (1 when exactly one is 1) and the carry into the next column is `(a & b) << 1` (1 when both are 1, moved left). Apply both to the whole word at once and repeat with the new pair until the carry is zero. Each iteration moves every carry at least one column left, so at most 32 iterations.

Trace `add(5, 3)`:

| iteration | `a` | `b` (carry) | `a ^ b` | `(a & b) << 1` |
|---|---|---|---|---|
| 0 | 101 | 011 | 110 | 010 |
| 1 | 110 | 010 | 100 | 100 |
| 2 | 100 | 100 | 000 | 1000 |
| 3 | 000 | 1000 | 1000 | 0 |

Carry is 0, answer `1000` = 8. Now the negative case, `add(-1, 1)` in Python. `-1` masked to 32 bits is `0xFFFFFFFF`. Iteration: `a ^ b = 0xFFFFFFFE`, carry `(0xFFFFFFFF & 1) << 1 = 2`. Next: `0xFFFFFFFE ^ 2 = 0xFFFFFFFC`, carry `(0xFFFFFFFE & 2) << 1 = 4`. The carry marches up one bit per iteration until it reaches bit 32, where the mask drops it: `a = 0`, `b = 0`. Result 0, correct. Without the mask, Python's unbounded integers let the carry march forever and the loop never terminates; that is the bug every Python candidate hits the first time.

The final reinterpretation handles results with bit 31 set: `a` above `0x7FFFFFFF` is a negative number in two's complement, and `~(a ^ MASK)` converts it. Check with `add(-2, -3)`: the masked loop produces `0xFFFFFFFB`; `0xFFFFFFFB ^ 0xFFFFFFFF = 4`; `~4 = -5`. Correct.

### Reverse Bits

[Reverse Bits](/practice/reverse-bits): reverse the 32 bits of an unsigned integer.

Peel the lowest bit off `n` and push it onto the bottom of the result, 32 times:

```python
def reverse_bits(n):
    out = 0
    for _ in range(32):
        out = (out << 1) | (n & 1)
        n >>= 1
    return out
```

Trace on a 4-bit example (`n = 0b1011`, four iterations instead of 32):

| iteration | `n` | `n & 1` | `out` after |
|---|---|---|---|
| 1 | 1011 | 1 | 1 |
| 2 | 101 | 1 | 11 |
| 3 | 10 | 0 | 110 |
| 4 | 1 | 1 | 1101 |

`1011` reversed is `1101`. Exactly 32 iterations, not "while `n`", because leading zeros of the input become trailing zeros of the output and must be shifted in. In JavaScript, use `n >>>= 1` and finish with `out >>> 0` so a set bit 31 does not produce a negative number. The follow-up is "if called many times": reverse byte by byte with a 256-entry lookup table, four lookups and three shifts per call.

## Variations

- **Single Number II** (every element three times except one): count each bit position mod 3 across all numbers; the bits with count 1 mod 3 belong to the answer. `O(32n)`, `O(1)` space. Or the two-variable state machine `ones`, `twos`.
- **Single Number III** (two singletons): XOR all to get `a ^ b`, isolate any set bit with `x & -x` (a bit where `a` and `b` differ), partition the array by that bit and XOR each half.
- **Power of two / four**: `n & (n − 1) == 0`; for four also require the set bit at an even position (`n & 0x55555555`).
- **Bitmask enumeration**: `for mask in range(1 << n)`; iterate the submasks of `m` with `sub = (sub − 1) & m` until 0. Used in bitmask DP (travelling salesman on 15 cities, assignment problems).
- **Gray code**: `i ^ (i >> 1)`; consecutive values differ in one bit.
- **Swapping without a temporary**: `a ^= b; b ^= a; a ^= b`. A party trick that breaks when `a` and `b` alias the same memory; do not use it in real code, but know why it works.
- **Reverse Integer** ([Reverse Integer](/practice/reverse-integer)): pop digits with `% 10` and `// 10`; before each `out = out * 10 + d`, check `out > (2³¹ − 1) // 10` (or equal with `d > 7`). In Python, integers do not overflow, so the check is against the stated bound; in JavaScript, numbers are doubles and the check is the same comparison.
- **Hamming distance**: `popcount(a ^ b)`.

## Pitfalls

- **Unbounded integers in Python.** `add` never terminates without the 32-bit mask; `~x` has infinitely many sign bits. Mask, then reinterpret.
- **Sign propagation in JavaScript.** `>>` is arithmetic (copies the sign bit); use `>>>` for unsigned semantics, and `>>> 0` to read a result as unsigned. `1 << 31` is negative.
- **Off-by-one in `n & (n − 1)` for zero.** `0 & -1 == 0`, so "power of two" must also check `n > 0`.
- **Using `while n` for a fixed-width reversal.** Leading zeros are lost. Loop exactly 32 times.
- **Forgetting XOR is only for even multiplicities.** "Appears three times" needs mod-3 counting.
- **Operator precedence.** In Python and JavaScript, `&`, `^` and `|` bind *looser* than `==` and comparison: `n & 1 == 1` parses as `n & (1 == 1)`. Parenthesise bitwise expressions.
- **Assuming 32 bits when the problem says 64.** Read the width; mask and sign-bit position both change.
- **Overflow checks after the fact.** `out * 10 + d > MAX` may itself overflow in a fixed-width language; compare before multiplying.

## Exercise

```exercise
id: counting-bits-linear
title: Counting bits in linear time
prompt: |
  Given a non-negative integer `n`, return a list `bits` of length `n + 1`
  where `bits[i]` is the number of 1s in the binary representation of `i`.
  The whole list must be computed in O(n) total time, so do not call a
  per-number popcount inside the loop.

  Use the recurrence bits[i] = bits[i >> 1] + (i & 1), or the equivalent
  bits[i] = bits[i & (i - 1)] + 1.
languages: [python, javascript]
entry: count_bits
starter:
  python: |
    def count_bits(n):
        # your code here
        return []
  javascript: |
    function count_bits(n) {
      // your code here
      return [];
    }
tests:
  - args: [2]
    expected: [0, 1, 1]
  - args: [5]
    expected: [0, 1, 1, 2, 1, 2]
  - args: [0]
    expected: [0]
    label: only zero
  - args: [1]
    expected: [0, 1]
  - args: [8]
    expected: [0, 1, 1, 2, 1, 2, 2, 3, 1]
  - args: [15]
    expected: [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]
    hidden: true
  - args: [16]
    expected: [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4, 1]
    hidden: true
    label: a new power of two resets to a single bit
hints:
  - "Allocate a list of n + 1 zeros; bits[0] is 0."
  - "For i from 1 to n, bits[i] = bits[i >> 1] + (i & 1): shifting right drops the lowest bit, which you add back."
  - "Parenthesise (i & 1); bitwise operators bind looser than + in both languages."
```

## Senior signals

- You name the **identity** you are using and its one-line reason ("XOR is its own inverse, so pairs cancel") rather than presenting the trick as magic.
- You explain **why `n & (n − 1)` clears the lowest set bit** (subtracting 1 borrows through the trailing zeros up to that bit) and use it to make popcount proportional to the number of set bits.
- You know the **Python-versus-JavaScript width story** cold: mask and reinterpret in Python, `>>>` in JavaScript, and `1 << 31` differs between them.
- You see Counting Bits as a **DP with state `i >> 1`** and say why it is `O(n)` rather than `O(n log n)`.
- You know the **limits of XOR** (even multiplicity only) and the mod-3 counting generalisation.
- You mention **bitmask enumeration and bitmask DP** as where these tricks pay off beyond puzzles, and can write the submask iteration.
- You **parenthesise bitwise expressions** and say why, because precedence bugs in this family are silent.

## Check yourself

```quiz
- q: >-
    Why does XOR-ing every element of [4, 1, 2, 1, 2] yield 4, regardless of the order of the elements?
  options: ["Because XOR implicitly sorts the values bit by bit", "Because 4 is the largest value, so it dominates the bits", "It only works because the singleton happens to come first", "XOR is commutative and x ^ x = 0, so pairs cancel"]
  answer: 3
  explanation: >-
    Reordering does not change the result of a commutative, associative operation, so the expression can be regrouped as pairs of equal values, each of which is zero. The survivor is the element with no partner, wherever it sits and whatever its size.
- q: >-
    In Python, a candidate's add(a, b) using XOR and shifted AND never terminates for add(-1, 1). Why?
  options: ["Python's << on negatives raises instead of wrapping", "XOR is undefined for negative integers in Python's model", "The loop condition should test a, not b, to end the carry", "Unbounded ints let the carry climb forever without a mask"]
  answer: 3
  explanation: >-
    In fixed-width arithmetic the carry out of bit 31 is discarded. Python integers are unbounded, so there is no bit 31 to fall off and the carry keeps shifting left forever. Masking with 0xFFFFFFFF each iteration simulates the width, and a final sign reinterpretation recovers negative results.
- q: >-
    In JavaScript, reverse_bits uses n >>= 1 and the input has bit 31 set. What goes wrong?
  options: ["Nothing, since JavaScript shifts are always unsigned", "The result is off by one because bit 0 is skipped", ">> copies the sign bit; use >>> and read with >>> 0", "The output gains a spurious 33rd bit at the very top"]
  answer: 2
  explanation: >-
    JavaScript bitwise operators work on 32-bit signed integers. >> is an arithmetic shift that preserves the sign, so ones are shifted in from the top; >>> fills with zeros, and >>> 0 reads the result as unsigned. The same input in Python is a positive integer and needs no special handling.
- q: >-
    Counting Bits with bits[i] = bits[i >> 1] + (i & 1) is O(n), while calling popcount on each number is O(n log n). Where does the log n go?
  options: ["The recurrence skips every even number in the range", "Each count reuses a smaller number's count in O(1)", "The log n is hidden inside the cost of each shift", "Nowhere; both approaches are really O(n) overall"]
  answer: 1
  explanation: >-
    This is a dynamic programme whose state is i >> 1. Reusing the already-computed smaller answer replaces a per-number loop over up to log n bits with one lookup and one addition.
- q: >-
    Every element appears three times except one. A candidate XORs everything. What is returned?
  options: ["Singleton XOR each tripled value, as x^x^x = x", "Zero, since every value cancels out in the end", "The singleton, which is the correct answer", "The sum of the array, taken bit by bit modulo 2"]
  answer: 0
  explanation: >-
    XOR cancels pairs, not triples: a value appearing three times contributes itself. Counting each bit position modulo 3 (or the ones/twos state machine) recovers the singleton in O(1) space.
```
