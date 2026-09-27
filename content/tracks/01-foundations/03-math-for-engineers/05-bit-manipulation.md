---
slug: bit-manipulation
title: "Bit manipulation: masks, XOR tricks and subsets as integers"
description: Two's complement, AND/OR/XOR/shift mechanics, the mask idioms for set/clear/test, the lowest-set-bit and popcount tricks, XOR cancellation, and enumerating subsets as integers, with the language traps (JavaScript's 32-bit operators, Python's infinite integers) named.
minutes: 50
difficulty: medium
tags: [math, bits, bitmask, xor, twos-complement]
problems: [single-number, number-of-1-bits, counting-bits, reverse-bits, missing-number, sum-of-two-integers, subsets]
---
Every array in an interview problem is "at most 20 items", every permissions system is a set of flags, every network address is a prefix and a mask, and every "find the element that appears once" problem has an $O(1)$-space solution that looks like magic. All of them come down to treating an integer as a row of switches and knowing a dozen operations on that row.

Bit manipulation has a reputation for being clever for its own sake. Most of it is not. Packing 64 booleans into one word makes a sieve or a DP table 64 times smaller and faster; a mask is the fastest possible set of small integers; XOR is the cheapest possible way to find a mismatch. The cleverness is in a few idioms that, once you see the mechanism, are as ordinary as `% 10`.

## Bits, words and two's complement

An unsigned 8-bit integer is eight switches read as a binary number: $\text{00001101}_2 = 8 + 4 + 1 = 13$. Bit $i$ (counting from 0 on the right) is worth $2^i$. A 32-bit word holds 0 to $2^{32} - 1$, a 64-bit word 0 to $2^{64} - 1$.

Signed integers use **two's complement**: the top bit is worth $-2^{w-1}$ instead of $+2^{w-1}$. In 8 bits, $10000000_2 = -128$, $11111111_2 = -128 + 127 = -1$, and $01111111_2 = 127$. The consequences:

| Fact | Why |
|---|---|
| $-1$ is all ones | $-128 + 64 + 32 + \cdots + 1 = -1$ |
| $-x = \sim x + 1$ | $x + \sim x$ is all ones, which is $-1$, so $\sim x = -x - 1$ |
| Range is $-2^{w-1}$ to $2^{w-1} - 1$ | One more negative than positive; $-\text{INT\_MIN}$ overflows |
| Addition needs no sign logic | The same adder circuit works for signed and unsigned |
| Right-shifting a negative can keep the sign | Arithmetic shift copies the top bit; see below |

Python integers have no fixed width, so `~x` is defined as $-x - 1$ and negative numbers behave as if they had infinitely many leading ones: `-1 & 0xFF` is `255`, and `-8 >> 1` is `-4`. JavaScript is the opposite trap: `Number` is a 64-bit float, but every bitwise operator first converts its operands to a **signed 32-bit integer**. So `1 << 31` is `-2147483648`, `2**31 | 0` is negative, `1 << 32` is `1` (the shift count is taken mod 32), and `4294967295 & 1` works only because the truncation happens to preserve the low bits. Use `>>> 0` to reinterpret as unsigned, and use `BigInt` when you need more than 32 bits of bitwise arithmetic.

## The six operators

```viz
{"type": "bits", "algorithm": "and-or-xor", "a": 12, "b": 10, "title": "12 and 10, bit by bit", "caption": "1100 AND 1010 = 1000 (8): bits set in both. OR = 1110 (14): set in either. XOR = 0110 (6): set in exactly one."}
```

| Operator | Symbol | Bit rule | Typical use |
|---|---|---|---|
| AND | `&` | 1 only if both are 1 | Test or clear bits, keep the low $k$ bits (`x & (2^k - 1)`) |
| OR | `\|` | 1 if either is 1 | Set bits, combine flags |
| XOR | `^` | 1 if exactly one is 1 | Toggle bits, find differences, cancel pairs |
| NOT | `~` | flip every bit | Build "all bits except" masks |
| Left shift | `<<` | move bits up, fill with 0 | Multiply by $2^k$, build $2^k$ |
| Right shift | `>>` | move bits down | Divide by $2^k$ (floor), extract high bits |

```viz
{"type": "bits", "algorithm": "shift", "a": 5, "title": "Shifting 5", "caption": "5 is 101. Left shift by 1 gives 1010 (10), by 2 gives 10100 (20): each shift multiplies by two. Right shift by 1 gives 10 (2): floor division by two."}
```

The right-shift subtlety: on a negative signed number, an **arithmetic** shift (`>>` in Python, Java, JavaScript, Rust on signed types, C on most compilers) fills with copies of the sign bit so that $-8 \gg 1 = -4$, preserving the meaning "divide by two, rounding toward negative infinity". A **logical** shift fills with zeros; JavaScript spells it `>>>`, Rust and Go get it from unsigned types, Java from `>>>`. `-1 >>> 1` in JavaScript is `2147483647`. Shifting by a count $\ge$ the word width is undefined in C, a panic in debug Rust, and silently mod 32 in JavaScript.

## Mask idioms

A mask is an integer whose set bits mark positions of interest. `1 << i` is the mask for bit $i$ alone. The idioms:

```python
x | (1 << i)          # set bit i
x & ~(1 << i)         # clear bit i
x ^ (1 << i)          # toggle bit i
(x >> i) & 1          # read bit i as 0 or 1
x & (1 << i) != 0     # WRONG in Python and C: == binds tighter than &
(x & (1 << i)) != 0   # test bit i, correctly parenthesised
(1 << k) - 1          # the low k bits all set: 0b0111 for k = 3
x & ((1 << k) - 1)    # keep the low k bits, i.e. x mod 2^k
(x >> lo) & ((1 << (hi - lo)) - 1)   # extract bits lo..hi-1 as a number
```

Operator precedence is the single most common bit-manipulation bug. In Python, C, C++, Java and JavaScript, comparison operators bind *tighter* than `&`, `|` and `^`, so `x & 1 == 0` parses as `x & (1 == 0)`, which is `x & 0`, which is always falsy. Parenthesise every bitwise sub-expression that sits next to a comparison.

The permissions example makes the idioms concrete. Unix mode bits use `4 = read`, `2 = write`, `1 = execute` per owner/group/other. `0o644` is `110 100 100`. "Can the group write?" is `(mode >> 3) & 2`. "Make it group-writable" is `mode | (2 << 3)`. "Remove all execute permission" is `mode & ~0o111`. A `chmod` call is three mask operations.

## The three tricks that power everything else

### Lowest set bit: `x & -x`

$-x$ is $\sim x + 1$. Complementing $x$ flips every bit; adding 1 carries through the trailing ones (which became zeros) and stops at the first zero-that-was-a-one, setting it. Everything above that bit is the complement of $x$, everything below is zero, and that one bit is set in both $x$ and $-x$. So `x & -x` isolates the lowest set bit.

$x = 12 = 1100_2$. $-x$ in 8 bits is $11110100_2$. AND: $00000100_2 = 4$. The lowest set bit of 12 is worth 4. This is `lowbit` in a Fenwick tree and the step that lets you iterate over set bits in $O(\text{popcount})$ rather than $O(\text{width})$.

### Clear lowest set bit: `x & (x - 1)`

Subtracting 1 borrows through the trailing zeros and clears the lowest one: $12 - 1 = 11 = 1011_2$, and $1100 \land 1011 = 1000 = 8$. Two direct consequences:

```viz
{"type": "bits", "algorithm": "power-of-two", "values": [16, 18], "title": "Power of two test", "caption": "16 = 10000 has one set bit, so 16 & 15 = 10000 & 01111 = 0. 18 = 10010 has two, so 18 & 17 = 10010 & 10001 = 10000, non-zero."}
```

A positive $x$ is a power of two exactly when `x & (x - 1) == 0` (one set bit, and clearing it leaves nothing). And repeatedly clearing the lowest bit until zero counts the set bits in as many steps as there are set bits, which is Kernighan's popcount:

```viz
{"type": "bits", "algorithm": "count-bits", "values": [13], "title": "Counting the bits of 13", "caption": "13 = 1101. x &= x - 1 clears one bit per step: 1101 -> 1100 -> 1000 -> 0000. Three steps, three set bits."}
```

```python
def popcount(x: int) -> int:
    count = 0
    while x:
        x &= x - 1      # strictly decreases x, so the loop terminates
        count += 1
    return count
```

In production use the hardware instruction: `int.bit_count()` in Python 3.10+, `Integer.bitCount` in Java, `x.count_ones()` in Rust, `bits.OnesCount` in Go, `__builtin_popcount` in C. JavaScript has no popcount, so use the loop or the SWAR (parallel bit-counting) trick. [Number of 1 Bits](/practice/number-of-1-bits) is this, and [Counting Bits](/practice/counting-bits) asks for all values $0..n$, where the DP `bits[i] = bits[i & (i - 1)] + 1` gives every answer in one operation each.

### XOR cancels pairs

$a \oplus a = 0$, $a \oplus 0 = a$, and XOR is commutative and associative. So XOR-ing a list of values cancels every value that appears an even number of times, leaving the XOR of the odd ones.

```viz
{"type": "bits", "algorithm": "single-number", "values": [4, 1, 2, 1, 2], "title": "XOR everything", "caption": "Pairs cancel regardless of position: 4 ^ 1 ^ 2 ^ 1 ^ 2 = 4 ^ (1 ^ 1) ^ (2 ^ 2) = 4. O(n) time, O(1) space, no hash set."}
```

Applications that follow directly:

- **[Single Number](/practice/single-number)**: every element appears twice except one. XOR the array.
- **[Missing Number](/practice/missing-number)**: an array holds $0..n$ with one value missing. XOR all indices $0..n$ and all array values; the present values cancel and the missing one remains. No sum, so no overflow concern.
- **Two singletons**: XOR everything to get $a \oplus b$; that value has some set bit where $a$ and $b$ differ (isolate it with `x & -x`); partition the array by that bit and XOR each half.
- **Swap without a temporary** (`a ^= b; b ^= a; a ^= b`), which is a party trick that breaks when `a` and `b` alias the same variable. Do not use it.
- **Parity, checksums and RAID**: XOR-ing $k$ data blocks gives a parity block; any one lost block is the XOR of the rest. That is RAID 5 in one operation.
- **[Sum of Two Integers](/practice/sum-of-two-integers)** without `+`: `a ^ b` is the sum without carries and `(a & b) << 1` is the carries; loop until the carry is zero. In Python you must mask to 32 bits each iteration or negative numbers loop forever, which is the kind of termination condition to check *before* running.

## Subsets as integers

An $n$-bit integer is a subset of $\{0, \ldots, n-1\}$: bit $i$ set means element $i$ is in. Counting from $0$ to $2^n - 1$ enumerates every subset exactly once, in a fixed order, with no recursion and no allocation beyond the output.

```viz
{"type": "bits", "algorithm": "subset-mask", "values": [1, 2, 3], "title": "Masks 0..7 as subsets of {1, 2, 3}", "caption": "Mask 5 = 101 selects elements 0 and 2, the subset {1, 3}. Eight masks, eight subsets, in the order of the integers."}
```

```python
def subsets_by_mask(values: list) -> list[list]:
    n = len(values)
    out = []
    for mask in range(1 << n):                       # 2^n masks
        out.append([values[i] for i in range(n) if (mask >> i) & 1])
    return out
```

This is the backbone of every "try every subset" solution for $n \le 20$ or so, and of **bitmask DP**, where the state is "which items have been used" and the table has $2^n$ rows. A few refinements you will see in such code:

- **Iterate over set bits only**: `while m: i = (m & -m).bit_length() - 1; ...; m &= m - 1`.
- **Enumerate submasks of a mask**: `sub = mask; while sub: ...; sub = (sub - 1) & mask`, then handle `sub = 0`. Over all masks this visits $3^n$ (mask, submask) pairs, which is the cost of many partition DPs.
- **Check membership** in $O(1)$: `(mask >> i) & 1`. For sets of small integers, a mask is faster than any hash set: an `int` in a register, and "union", "intersection" and "difference" are `|`, `&` and `& ~`.

## Bitsets: sixty-four booleans per word

The same idea scaled up. A `bytearray` of $n$ booleans uses $n$ bytes; a bitset uses $n/8$ bytes and, more importantly, does 64 comparisons per machine operation. Where it matters:

- **Sieve of Eratosthenes** to $10^9$: a byte-per-number sieve is 1 GB; a bitset is 125 MB, and skipping evens halves that.
- **Subset-sum / knapsack feasibility**: "which sums are reachable" is a bitset; adding an item of weight $w$ is `reach |= reach << w`, one shift-or for every reachable sum at once, turning $O(nW)$ into $O(nW / 64)$.
- **Bloom filters** are a bitset plus $k$ hash functions.
- **Allocators and free lists** track free pages with a bitset and find a free one with "count trailing zeros", a single instruction.
- **Graph adjacency** for dense graphs with $n \le$ a few thousand: neighbour sets as bitsets make "common neighbours" a single AND and popcount.

Python's `int` acts as an unbounded bitset (`reach |= reach << w` works on it directly), which is a genuinely good trick for competitive-style problems. Rust's `u64` arrays, C++'s `std::bitset`, and Java's `BitSet` are the production versions.

## Language traps, collected

| Trap | Where | What happens | Fix |
|---|---|---|---|
| `x & 1 == 0` | Python, C, Java, JS | Parses as `x & (1 == 0)` | Parenthesise |
| Bitwise ops on values $\ge 2^{31}$ | JavaScript | Truncated to signed 32-bit; `2**31 \| 0` is negative | `>>> 0`, `BigInt`, or arithmetic (`Math.floor(x / 2)`) |
| `1 << 32` | JavaScript | Shift count taken mod 32, result is `1` | Use `2 ** 32` or `BigInt` |
| `~x` on a huge Python int | Python | $-x - 1$, a negative number, not a bit flip of a fixed width | Mask: `~x & ((1 << w) - 1)` |
| Right shift of negative | C | Implementation-defined | Cast to unsigned first |
| `-INT_MIN` | Every fixed-width language | Overflows back to `INT_MIN` | Widen, or check before negating |
| `x & (x - 1)` on `x = 0` | Everywhere | `0 & -1 = 0`, so 0 passes the power-of-two test | Check `x > 0` |
| Infinite loop in carry-based add | Python | Negative carries never shrink | Mask to 32 bits each iteration |

## Exercises

```exercise
id: count-bits
title: Population count
prompt: |
  Return the number of set bits in the non-negative integer `n`. Use
  Kernighan's trick, `n &= n - 1` per set bit, or any exact method. Inputs
  go up to `2^32 - 1`; in JavaScript, `n & 1` and `n >>> 1` stay correct
  at that size, but `n >> 1` does not, and `n & (n - 1)` on values at or
  above 2^31 needs `>>> 0` or arithmetic instead.
languages: [python, javascript]
entry: count_bits
starter:
  python: |
    def count_bits(n):
        # your code here
        return 0
  javascript: |
    function count_bits(n) {
      // your code here
      return 0;
    }
tests:
  - args: [0]
    expected: 0
    label: zero has no set bits
  - args: [1]
    expected: 1
  - args: [13]
    expected: 3
    label: 1101
  - args: [255]
    expected: 8
  - args: [1024]
    expected: 1
    label: a single high bit
  - args: [2147483647]
    expected: 31
    label: 2^31 - 1
  - args: [4294967295]
    expected: 32
    hidden: true
    label: all 32 bits; beware signed truncation in JavaScript
hints:
  - "Loop while n > 0: add n % 2 (or n & 1) to the count, then halve n. Arithmetic halving avoids every 32-bit trap."
  - "Kernighan: while n != 0, n = n & (n - 1) and increment. In JavaScript apply >>> 0 to keep n unsigned."
```

```exercise
id: subsets-by-mask
title: Enumerate subsets with a bitmask
prompt: |
  Return every subset of `values` (a list of distinct items) as a list of
  lists, ordered by the integer mask that selects them: mask `m` includes
  `values[i]` exactly when bit `i` of `m` is set, and subsets appear in
  order of `m` from `0` to `2^n - 1`. Within a subset keep the elements in
  their original order. The empty list has one subset, the empty list.
languages: [python, javascript]
entry: subsets_by_mask
starter:
  python: |
    def subsets_by_mask(values):
        # your code here
        return []
  javascript: |
    function subsets_by_mask(values) {
      // your code here
      return [];
    }
tests:
  - args: [[1, 2, 3]]
    expected: [[], [1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]]
    label: the viz above
  - args: [[]]
    expected: [[]]
    label: empty input has exactly one subset
  - args: [[9]]
    expected: [[], [9]]
  - args: [["a", "b"]]
    expected: [[], ["a"], ["b"], ["a", "b"]]
  - args: [[5, 7]]
    expected: [[], [5], [7], [5, 7]]
    hidden: true
hints:
  - "Loop mask from 0 to (1 << n) - 1; for each, loop i from 0 to n - 1 and include values[i] when (mask >> i) & 1 is 1."
```

## Senior signals

- You explain two's complement as "the top bit is negative", derive $-x = \sim x + 1$ from it, and know that `-INT_MIN` overflows.
- You know JavaScript's bitwise operators are signed 32-bit and reach for `>>> 0`, `BigInt` or plain arithmetic when values exceed $2^{31}$; you know Python's `~` needs a mask to emulate fixed width.
- You use `x & -x`, `x & (x - 1)` and XOR cancellation as idioms and can state *why* each works, not just that it does.
- You parenthesise `(x & m) == 0` reflexively and can name the precedence bug.
- You reach for a bitmask when the set is small integers and for a bitset when a boolean array is large, and you can quantify the 64× win.
- You check loop termination on carry-based and clear-lowest-bit loops explicitly, especially with negative inputs.

## Check yourself

```quiz
- q: >-
    In JavaScript, `(1 << 31)` evaluates to -2147483648 and `(1 << 32)` evaluates to 1. Why?
  options: ["<< is an arithmetic shift in JavaScript, keeping the sign", "Shifting past bit 31 overflows and wraps back around to 1", "JavaScript stores all numbers as 32-bit signed integers", "Bitwise ops use signed 32 bits and shift counts mod 32"]
  answer: 3
  explanation: >-
    Numbers are 64-bit floats, but every bitwise operator works on a signed 32-bit view of its operands: bit 31 is the sign bit, and shift counts are masked to 5 bits, so 32 becomes 0 and 1 << 32 is 1 << 0. Overflowing past bit 31 would give 0, not 1.
- q: >-
    Why does `x & (x - 1) == 0` in Python not correctly test whether x is a power of two, even for positive x?
  options: ["Python ints have no fixed width, so the trick fails", "The test only works on unsigned, fixed-width integers", "== binds tighter than &, so it is x & ((x - 1) == 0)", "x - 1 underflows when x = 1, breaking the smallest case"]
  answer: 2
  explanation: >-
    Comparison has higher precedence than bitwise AND in Python (and C, Java, JavaScript), so the expression tests x & False, which is 0, for every x except 1. Parenthesise: (x & (x - 1)) == 0. The trick itself works fine on Python's arbitrary-width positive integers.
- q: >-
    An array holds every integer from 0 to n exactly once except one that is missing. Which approach finds it in O(n) time and O(1) space with no risk of overflow in a fixed-width language?
  options: ["Sort the array in place, then scan for the gap", "Sum 0..n with n(n+1)/2 and subtract the array sum", "XOR together all indices 0..n and all array values", "Insert all values into a hash set, then probe 0..n"]
  answer: 2
  explanation: >-
    XOR-ing each value that is present twice (once as an index, once as an element) cancels it, leaving the missing value. The sum approach is also O(1) space but n(n+1)/2 can overflow a 32-bit int for large n; sorting is O(n log n) and a hash set is O(n) space.
- q: >-
    `x & -x` for x = 40 (binary 101000) gives what, and why is it useful?
  options: ["32; it isolates the highest set bit of the number", "0; a number and its negation never share a set bit", "8; it isolates the lowest set bit, used by Fenwick trees", "40; negation leaves the magnitude bits of x unchanged"]
  answer: 2
  explanation: >-
    -x = ~x + 1 flips every bit then carries through the trailing zeros, so the only bit set in both x and -x is x's lowest set bit: 001000 = 8. That step drives Fenwick trees and set-bit iteration. Highest-bit isolation needs a different technique (bit_length or clz).
- q: >-
    A subset-sum feasibility DP over n items with total weight W runs in O(nW). Representing the reachable-sums set as a bitset and updating with `reach |= reach << w` changes the cost to what?
  options: ["Nothing; a bitset shift costs as much as a loop over sums", "It becomes O(W), since one shift handles every item", "Still O(nW), but each update is ~W/64 word operations", "The bound drops to O(n log W) because shifts are cheap"]
  answer: 2
  explanation: >-
    Each item's update is a word-parallel shift and OR over W/64 words. Asymptotically that is still O(nW) with a 1/64 constant, but the constant is exactly the point: the machine performs 64 boolean updates per instruction, a real order-of-magnitude difference. Nothing about the trick removes the dependence on n or turns W into log W.
```
