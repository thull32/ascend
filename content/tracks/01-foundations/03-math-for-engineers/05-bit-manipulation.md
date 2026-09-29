---
slug: bit-manipulation
title: "Bit manipulation: masks, XOR tricks and subsets as integers"
description: Two's complement, AND/OR/XOR/shift mechanics, the mask idioms for set/clear/test, the lowest-set-bit, Kernighan and SWAR popcount tricks each traced bit by bit, the hardware popcount instruction and what each runtime does to reach it, XOR cancellation, subset and submask enumeration with their 2^n and 3^n counts, and the language traps (JavaScript's 32-bit operators, Python's infinite integers) named and measured.
minutes: 50
difficulty: medium
tags: [math, bits, bitmask, xor, twos-complement, popcount]
problems: [single-number, number-of-1-bits, counting-bits, reverse-bits, missing-number, sum-of-two-integers, subsets]
---
Every array in an interview problem is "at most 20 items", every permissions system is a set of flags, every network address is a prefix and a mask, and every "find the element that appears once" problem has an $O(1)$-space solution that looks like magic. All of them come down to treating an integer as a row of switches and knowing a dozen operations on that row.

Bit manipulation has a reputation for being clever for its own sake. Most of it is not. Packing 64 booleans into one word makes a sieve or a DP table 64 times smaller and faster; a mask is the fastest possible set of small integers; XOR is the cheapest possible way to find a mismatch; and the hardware has a single instruction that counts set bits at one word per cycle. The cleverness is in a few idioms that, once you have traced them on actual bits, are as ordinary as `% 10`. This lesson traces every one of them.

## Bits, words and two's complement

An unsigned 8-bit integer is eight switches read as a binary number: $\text{00001101}_2 = 8 + 4 + 1 = 13$. Bit $i$ (counting from 0 on the right) is worth $2^i$. A 32-bit word holds 0 to $2^{32} - 1$, a 64-bit word 0 to $2^{64} - 1$.

Signed integers use **two's complement**: the top bit is worth $-2^{w-1}$ instead of $+2^{w-1}$. In 8 bits, $10000000_2 = -128$, $11111111_2 = -128 + 127 = -1$, and $01111111_2 = 127$. Trace the negation of 12:

| Step | Bits | Value |
|---|---|---|
| $x = 12$ | `00001100` | 12 |
| $\sim x$ (flip every bit) | `11110011` | $-128 + 64 + 32 + 16 + 2 + 1 = -13$ |
| $\sim x + 1$ | `11110100` | $-128 + 64 + 32 + 16 + 4 = -12$ |

So $-x = \sim x + 1$, and the reason is that $x + \sim x$ is all ones, which is $-1$, so $\sim x = -1 - x$. The consequences:

| Fact | Why |
|---|---|
| $-1$ is all ones | $-128 + 64 + 32 + \cdots + 1 = -1$ |
| $-x = \sim x + 1$ | $x + \sim x = -1$ |
| Range is $-2^{w-1}$ to $2^{w-1} - 1$ | one more negative than positive; $-\text{INT\_MIN}$ overflows back to itself |
| Addition needs no sign logic | the same adder circuit works for signed and unsigned; the [numbers lesson](/learn/foundations/how-code-runs/numbers-strings-unicode) traces $127 + 1$ |
| Right-shifting a negative can keep the sign | arithmetic shift copies the top bit; see below |

Python integers have no fixed width, so `~x` is defined as $-x - 1$ and negative numbers behave as if they had infinitely many leading ones: `-1 & 0xFF` is `255`, `-8 >> 1` is `-4`, and `bin(-5)` prints `'-0b101'` (a sign and a magnitude, not a bit pattern). JavaScript is the opposite trap: `Number` is a 64-bit float, but every bitwise operator first converts its operands to a **signed 32-bit integer**. So `1 << 31` is `-2147483648`, `2**31 | 0` is negative, `1 << 32` is `1` (the shift count is taken mod 32), and `4294967295 & 1` works only because the truncation happens to preserve the low bits. Use `>>> 0` to reinterpret as unsigned, and `BigInt` when you need more than 32 bits of bitwise arithmetic.

## The six operators

```viz
{"type": "bits", "algorithm": "and-or-xor", "a": 12, "b": 10, "title": "12 and 10, bit by bit", "caption": "1100 AND 1010 = 1000 (8): bits set in both. OR = 1110 (14): set in either. XOR = 0110 (6): set in exactly one."}
```

| Operator | Symbol | Bit rule | Typical use |
|---|---|---|---|
| AND | `&` | 1 only if both are 1 | test or clear bits, keep the low $k$ bits (`x & (2^k - 1)`) |
| OR | `\|` | 1 if either is 1 | set bits, combine flags |
| XOR | `^` | 1 if exactly one is 1 | toggle bits, find differences, cancel pairs |
| NOT | `~` | flip every bit | build "all bits except" masks |
| Left shift | `<<` | move bits up, fill with 0 | multiply by $2^k$, build $2^k$ |
| Right shift | `>>` | move bits down | divide by $2^k$ (floor), extract high bits |

```viz
{"type": "bits", "algorithm": "shift", "a": 5, "title": "Shifting 5", "caption": "5 is 101. Left shift by 1 gives 1010 (10), by 2 gives 10100 (20): each shift multiplies by two. Right shift by 1 gives 10 (2): floor division by two."}
```

The right-shift subtlety, traced on $-8$ in 8 bits (`11111000`): an **arithmetic** shift fills with copies of the sign bit, giving `11111100` $= -4$, which preserves "divide by two, rounding toward negative infinity". A **logical** shift fills with zeros, giving `01111100` $= 124$. Python, Java, JavaScript's `>>`, Rust on signed types and C on every mainstream compiler do the arithmetic shift for signed values; JavaScript spells the logical one `>>>` (`-1 >>> 1` is `2147483647`), Rust and Go get it from unsigned types, Java from `>>>`. Shifting by a count $\ge$ the word width is undefined behaviour in C, a panic in debug Rust, and silently mod 32 in JavaScript.

## Mask idioms

A mask is an integer whose set bits mark positions of interest. `1 << i` is the mask for bit $i$ alone. The idioms:

```python
x | (1 << i)          # set bit i
x & ~(1 << i)         # clear bit i
x ^ (1 << i)          # toggle bit i
(x >> i) & 1          # read bit i as 0 or 1
x & (1 << i) != 0     # WRONG in C and JavaScript: != binds tighter than &
(x & (1 << i)) != 0   # test bit i, correctly parenthesised
(1 << k) - 1          # the low k bits all set: 0b0111 for k = 3
x & ((1 << k) - 1)    # keep the low k bits, i.e. x mod 2^k
(x >> lo) & ((1 << (hi - lo)) - 1)   # extract bits lo..hi-1 as a number
```

Operator precedence is a classic bit-manipulation bug. In C, C++, Java and JavaScript, comparison operators bind *tighter* than `&`, `|` and `^`, so `x & 1 == 0` parses as `x & (1 == 0)`. In C and JavaScript that is `x & 0`, always falsy: an "is even" test that never fires (gcc's `-Wall` warns "suggest parentheses around comparison in operand of '&'"). In Java it does not compile, because `int & boolean` is a type error. Python is the exception: its bitwise operators bind tighter than comparisons, so there `x & 1 == 0` means what it looks like. Parenthesise every bitwise sub-expression that sits next to a comparison anyway; the habit survives a change of language.

Trace the idioms on a Unix mode. `0o644` is `110 100 100`: owner read+write, group read, others read. "Can the group write?" is bit 4 (the `2` of the middle triple): `(mode >> 3) & 2` → `110100 & 010` = `000`, no. "Make it group-writable" is `mode | (2 << 3)` = `110100100 | 000010000` = `110110100` = `0o664`. "Remove all execute permission" is `mode & ~0o111` = `& 110110110`, which leaves `0o664` unchanged because no execute bit was set. A `chmod` call is three mask operations.

## The three tricks that power everything else

### Lowest set bit: `x & -x`

$-x$ is $\sim x + 1$. Complementing $x$ flips every bit; adding 1 carries through the trailing ones of $\sim x$ (which were the trailing zeros of $x$) and stops at the first zero of $\sim x$, which was $x$'s lowest set bit, setting it. Everything above that bit is the complement of $x$, everything below is zero, and that one bit is set in both. So `x & -x` isolates the lowest set bit.

| | $x = 12$ | $x = 40$ |
|---|---|---|
| $x$ | `00001100` | `00101000` |
| $\sim x$ | `11110011` | `11010111` |
| $-x = \sim x + 1$ | `11110100` | `11011000` |
| $x \,\&\, {-x}$ | `00000100` $= 4$ | `00001000` $= 8$ |

This is `lowbit` in a Fenwick tree, and it is the step that lets you iterate over set bits in $O(\text{popcount})$ rather than $O(\text{width})$: `while m: low = m & -m; i = low.bit_length() - 1; ...; m ^= low`. On `m = 0b10100`: `low = 100`, bit 2, `m = 10000`; `low = 10000`, bit 4, `m = 0`. Two iterations for two bits.

### Clear lowest set bit: `x & (x - 1)`

Subtracting 1 borrows through the trailing zeros, turning them into ones and the lowest one into a zero: $12 - 1 = 11$ is `1100 - 1 = 1011`, and `1100 & 1011 = 1000` $= 8$. Two direct consequences:

```viz
{"type": "bits", "algorithm": "power-of-two", "values": [16, 18], "title": "Power of two test", "caption": "16 = 10000 has one set bit, so 16 & 15 = 10000 & 01111 = 0. 18 = 10010 has two, so 18 & 17 = 10010 & 10001 = 10000, non-zero."}
```

A positive $x$ is a power of two exactly when `x & (x - 1) == 0` (one set bit, and clearing it leaves nothing; guard `x > 0`, because `0 & -1 == 0` too). And repeatedly clearing the lowest bit until zero counts the set bits in as many steps as there are set bits, which is **Brian Kernighan's** popcount:

```viz
{"type": "bits", "algorithm": "count-bits", "values": [13], "title": "Counting the bits of 13", "caption": "13 = 1101. x &= x - 1 clears one bit per step: 1101 -> 1100 -> 1000 -> 0000. Three steps, three set bits."}
```

| Iteration | $x$ | $x - 1$ | $x \,\&\, (x - 1)$ | count |
|---|---|---|---|---|
| 1 | `1101` (13) | `1100` | `1100` (12) | 1 |
| 2 | `1100` (12) | `1011` | `1000` (8) | 2 |
| 3 | `1000` (8) | `0111` | `0000` (0) | 3 |

```python
def popcount(x: int) -> int:
    count = 0
    while x:
        x &= x - 1      # strictly decreases x, so the loop terminates
        count += 1
    return count
```

Kernighan's loop is $O(\text{set bits})$, which beats the $O(\text{width})$ shift-and-test loop when words are sparse (three iterations for a 64-bit word with three bits set) and loses when they are dense. Both lose to the hardware.

### Popcount in hardware, and the SWAR fallback

x86 has had a `POPCNT` instruction since the late 2000s (Intel added it with Nehalem, AMD with its ABM extension), and it counts a 64-bit word in one instruction with a throughput of about one per cycle. ARM's NEON `CNT` counts the bits of each byte in a vector register, so a 64-bit word takes `CNT` plus a horizontal add (Go's arm64 output for `bits.OnesCount64` is `VCNT` then `VUADDLV`). In every language the fastest popcount is the one that reaches that instruction: `int.bit_count()` in Python 3.10+, `Integer.bitCount` and `Long.bitCount` in Java (JIT intrinsics), `x.count_ones()` in Rust (`llvm.ctpop`), `bits.OnesCount64` in Go (a compiler intrinsic that, at the default `GOAMD64=v1`, tests a CPU-feature flag the runtime sets at start-up before each `POPCNTQ`), `__builtin_popcountll` in C. Measured in CPython 3.14 on 100,000 random 64-bit integers: Kernighan's loop 909 ns per value (about 32 iterations of interpreted bytecode each), `bin(x).count("1")` 90 ns, `x.bit_count()` 15 ns, of which nearly all is the method-call overhead.

JavaScript has no popcount, so it needs the **SWAR** trick ("SIMD within a register"): count bits in every 2-bit field in parallel, then every 4-bit field, then every byte. Trace it on the 8-bit value `10110101` (five set bits):

| Step | Operation | Result | Meaning |
|---|---|---|---|
| 0 | start | `10 11 01 01` | the four 2-bit fields |
| 1 | `x - ((x >> 1) & 0x55)` | `01 10 01 01` | each 2-bit field now holds its own count: 1, 2, 1, 1 |
| 2 | `(x & 0x33) + ((x >> 2) & 0x33)` | `0011 0010` | each 4-bit field holds the sum of its two pairs: 3, 2 |
| 3 | `(x + (x >> 4)) & 0x0F` | `0101` | the byte's total: 5 |

Step 1 works because a 2-bit field `ab` minus its own high bit `a` is exactly $a + b$ (`11 - 1 = 10`, `10 - 1 = 01`, `01 - 0 = 01`, `00 - 0 = 00`). For 32 bits the masks are `0x55555555`, `0x33333333`, `0x0F0F0F0F`, and the last step multiplies by `0x01010101` and shifts right by 24 to sum the four byte counts; twelve operations, no loop, no branch. This is the standard software fallback: rustc (LLVM) inlines exactly this sequence for `count_ones` when the target has no `POPCNT`, while gcc for a generic x86-64 target calls the libgcc helper `__popcountdi2` instead.

### XOR cancels pairs

$a \oplus a = 0$, $a \oplus 0 = a$, and XOR is commutative and associative. So XOR-ing a list of values cancels every value that appears an even number of times, leaving the XOR of the odd ones.

```viz
{"type": "bits", "algorithm": "single-number", "values": [4, 1, 2, 1, 2], "title": "XOR everything", "caption": "Pairs cancel regardless of position: 4 ^ 1 ^ 2 ^ 1 ^ 2 = 4 ^ (1 ^ 1) ^ (2 ^ 2) = 4. O(n) time, O(1) space, no hash set."}
```

Applications that follow directly:

- **[Single Number](/practice/single-number)**: every element appears twice except one. XOR the array.
- **[Missing Number](/practice/missing-number)**: an array holds $0..n$ with one value missing. XOR all indices $0..n$ and all array values; the present values cancel and the missing one remains. No sum, so no overflow concern.
- **Two singletons.** XOR everything to get $a \oplus b$; that value has some set bit where $a$ and $b$ differ; partition the array by that bit and XOR each part. Trace on `[2, 3, 7, 3, 2, 5]`: the total XOR is $7 \oplus 5 = 111 \oplus 101 = 010$; the lowest set bit is `010`; elements with bit 1 set are $2, 3, 7, 3, 2$ (XOR $= 7$) and without it $5$ (XOR $= 5$). Answer $\{7, 5\}$.
- **Swap without a temporary** (`a ^= b; b ^= a; a ^= b`), a party trick that zeroes both when `a` and `b` alias the same variable. Do not use it.
- **Parity, checksums and RAID.** XOR-ing $k$ data blocks gives a parity block; any one lost block is the XOR of the rest. That is RAID 5 in one operation.
- **[Sum of Two Integers](/practice/sum-of-two-integers)** without `+`: `a ^ b` is the sum without carries and `(a & b) << 1` is the carries; loop until the carry is zero. Trace $5 + 3$: `101 ^ 011 = 110`, carry `(101 & 011) << 1 = 010`; then `110 ^ 010 = 100`, carry `(110 & 010) << 1 = 100`; then `100 ^ 100 = 000`, carry `1000`; then `0 ^ 1000 = 1000`, carry `0`: $8$. In Python you must mask to 32 bits each iteration or a negative operand's infinite leading ones keep generating carries forever, which is the kind of termination condition to check *before* running.

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

This is the backbone of every "try every subset" solution for $n \le 20$ or so, and of **bitmask DP**, where the state is "which items have been used" and the table has $2^n$ rows. The [combinatorics lesson](/learn/foundations/math-for-engineers/counting-and-combinatorics) sizes these spaces; the refinements you will see in such code:

**Enumerate the submasks of a mask.** `sub = mask; while sub: ...; sub = (sub - 1) & mask`, then handle `sub = 0`. Trace on `mask = 1011`: `1011 → 1010 → 1001 → 1000 → 0011 → 0010 → 0001 → 0000`, eight submasks for three set bits, $2^3$. Subtracting 1 borrows through the trailing zeros of `sub` and clears its lowest set bit, and the `& mask` throws away any borrowed-in bits that are not in the mask, so each step lands on the next smaller submask. Over all masks, the number of (mask, submask) pairs is $3^n$, because each of the $n$ bits is in neither, in the mask only, or in both; that is the cost of partition-style DPs, and $3^{16} = 4.3 \times 10^7$ is where they stop being cheap.

**Check membership in $O(1)$**: `(mask >> i) & 1`. For sets of small integers a mask beats any hash set: an `int` in a register, and union, intersection, difference and "is subset" are `|`, `&`, `& ~` and `(a & b) == a`.

**Gray code order**: `mask ^ (mask >> 1)` visits every subset while changing one element per step, which lets an incremental cost (a running sum, a running hash) be updated in $O(1)$ per subset instead of $O(n)$.

| Representation of a set of small integers | Memory | Membership | Union / intersection | Universe limit | Ordered iteration |
|---|---|---|---|---|---|
| Bitmask in one machine word | 8 bytes | 1 instruction | 1 instruction | 64 elements | by index, via lowest-set-bit |
| Bitset (array of words) | $U / 8$ bytes | 2 instructions | $U / 64$ instructions | any $U$, fixed at creation | by index |
| Hash set | ~30–70 bytes per element | ~20 ns in CPython | $O(\lvert A \rvert + \lvert B \rvert)$ | unbounded | none |
| Sorted array | 8 bytes per element | $O(\log n)$ | merge, $O(\lvert A \rvert + \lvert B \rvert)$ | unbounded | yes |

## Bitsets: sixty-four booleans per word

The same idea scaled up. A `bytearray` of $n$ booleans uses $n$ bytes; a bitset uses $n/8$ bytes and, more importantly, does 64 comparisons per machine operation. Where it matters:

- **Sieve of Eratosthenes** to $10^9$: a byte-per-number sieve is 1 GB; a bitset is 125 MB, and skipping evens halves that. The [number theory lesson](/learn/foundations/math-for-engineers/number-theory-essentials) measures the byte version.
- **Subset-sum / knapsack feasibility**: "which sums are reachable" is a bitset; adding an item of weight $w$ is `reach |= reach << w`, one shift-or for every reachable sum at once. Trace with weights $\{3, 4\}$: start `reach = 1` (only sum 0); after 3, `1 | 1000 = 1001` (sums 0, 3); after 4, `1001 | 10010000 = 10011001` (sums 0, 3, 4, 7). The $O(nW)$ DP becomes $O(nW / 64)$ word operations.
- **Bloom filters** are a bitset plus $k$ hash functions.
- **Allocators and free lists** track free pages with a bitset and find a free one with "count trailing zeros" (`TZCNT` on x86, `RBIT` + `CLZ` on ARM), a single instruction.
- **Graph adjacency** for dense graphs with $n \le$ a few thousand: neighbour sets as bitsets make "common neighbours" a single AND and popcount per word.

Python's `int` acts as an unbounded bitset (`reach |= reach << w` works on it directly), which is a genuinely good trick for competitive-style problems. Rust's `u64` arrays, C++'s `std::bitset`, and Java's `BitSet` are the production versions.

## Under the hood

**The instructions.** Beyond `POPCNT`, x86 offers `LZCNT` and `TZCNT` (leading and trailing zero count; `bit_length` and lowest-set-bit index in one instruction), `BSF`/`BSR`, and the BMI2 pair `PDEP`/`PEXT` (scatter and gather bits by a mask, used by chess engines and some hash tables). AVX-512 adds `VPOPCNTDQ`, popcount over 512 bits at once. A single core can popcount memory at roughly one 64-bit word per cycle, so counting the bits of a billion words is about 0.3 s of arithmetic and is bounded by the 8 GB of memory traffic, not by the counting.

**CPython.** An `int` is an array of 30-bit digits, so `&`, `|`, `^` and shifts on big integers run digit by digit, $O(\text{digits})$; `x & -x` on a 10,000-bit integer walks 334 digits. `int.bit_count()` calls the C compiler's builtin, which becomes `POPCNT` when the interpreter is built with that target feature and a software routine otherwise (inline SWAR from clang, a libgcc call from gcc). `bit_length()` is a leading-zero count on the top digit plus 30 per lower digit.

**V8.** Small integers are tagged values (Smis, 32-bit in a default 64-bit Node build and 31-bit with pointer compression); a bitwise operator on two Smis is a few machine instructions in optimised code, but every result is re-tagged, and any operand that is not a Smi goes through `ToInt32`, which converts a double to an integer by the same mod-$2^{32}$ truncation that makes `2**32 | 0` zero. `Math.clz32` is the one bit instruction JavaScript exposes directly.

**Rust and Go.** `count_ones`, `leading_zeros`, `trailing_zeros` compile to the instructions above when the target has them (`-C target-cpu=native`, or Go's `GOAMD64=v2`+); otherwise Rust emits the SWAR sequence, and Go at `v1` emits a runtime feature check that branches to `POPCNTQ` or to a software routine.

## Language traps, collected

| Trap | Where | What happens | Fix |
|---|---|---|---|
| `x & 1 == 0` | C, C++, JS (a compile error in Java; correct in Python) | Parses as `x & (1 == 0)` | Parenthesise |
| Bitwise ops on values $\ge 2^{31}$ | JavaScript | Truncated to signed 32-bit; `2**31 \| 0` is negative | `>>> 0`, `BigInt`, or arithmetic (`Math.floor(x / 2)`) |
| `1 << 32` | JavaScript | Shift count taken mod 32, result is `1` | Use `2 ** 32` or `BigInt` |
| `~x` on a huge Python int | Python | $-x - 1$, a negative number, not a bit flip of a fixed width | Mask: `~x & ((1 << w) - 1)` |
| Right shift of negative | C | Implementation-defined | Cast to unsigned first |
| `-INT_MIN` | Every fixed-width language | Overflows back to `INT_MIN` | Widen, or check before negating |
| `x & (x - 1)` on `x = 0` | Everywhere | `0 & -1 = 0`, so 0 passes the power-of-two test | Check `x > 0` |
| Infinite loop in carry-based add | Python | Negative carries never shrink | Mask to 32 bits each iteration |
| Bit 64 of a bitset | Any language with word arrays | Lands in word 0 bit 0 via `i % 64` | Index by `i >> 6` and `i & 63`, and test the boundary |

## Failure modes in production

**Feature flags that started interfering.** *Symptom:* a Node service gains its 32nd flag and unrelated flags flip on and off together. *Diagnosis:* the flag set is a JavaScript `number` used with `|` and `&`; bit 31 is the sign bit and bit 32 wraps to bit 0 (`1 << 32 === 1`). *Fix:* a `BigInt` mask, two 31-bit words, or a `Set` of flag names; and a test that sets the highest flag alone.

**An "is even" check that never fires.** *Symptom:* every record takes the odd branch; a half-the-rows sampling returns everything. *Diagnosis:* in C or JavaScript, `n & 1 == 0` parsed as `n & (1 == 0)`, always 0, always falsy. *Fix:* `(n & 1) == 0`, and a warning or lint rule (gcc's `-Wparentheses`, part of `-Wall`, catches it).

**A bit-parallel loop that hangs.** *Symptom:* the XOR-and-carry adder passes every positive test and hangs on the first negative operand in Python. *Diagnosis:* Python's negative integers have infinitely many leading ones, so the carry never becomes zero. *Fix:* mask both operands and the carry to the intended width each iteration, and convert the result back with the two's-complement reinterpretation.

**Off-by-one at a word boundary.** *Symptom:* a bitset-based allocator hands out page 64 twice. *Diagnosis:* the index arithmetic used `i % 64` for the bit but forgot `i / 64` for the word, or used `1 << 64` on a 64-bit type (undefined in C, zero or a panic elsewhere). *Fix:* `word = i >> 6`, `bit = i & 63`, and tests at 63, 64, 127 and 128.

**A popcount loop that dominated a profile.** *Symptom:* a similarity service spends 60% of its time counting bits of 64-bit fingerprints. *Diagnosis:* a shift-and-test loop in Python, 64 iterations of bytecode per word (measured: about 900 ns per 64-bit word for Kernighan on dense words). *Fix:* `int.bit_count()` (15 ns), or NumPy over packed `uint64` arrays, or the whole loop in a compiled extension, where it is one instruction per word.

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

## Interviewer follow-ups

**"Prove that `x & (x - 1)` clears the lowest set bit."** *Model answer:* write $x$ as $P\,1\,0^k$ (some prefix, the lowest one, $k$ trailing zeros); then $x - 1 = P\,0\,1^k$, because subtracting one borrows through the zeros; AND-ing keeps $P$, and the positions from the lowest one downward are $1 \& 0$ and $0 \& 1$, all zero. *Common wrong answer:* "it works, I've used it", or a demonstration on one number.

**"Two numbers appear once and every other number twice; $O(1)$ space."** *Model answer:* XOR everything to get $a \oplus b$, which is non-zero; isolate any set bit with `x & -x`; $a$ and $b$ differ at that bit, so XOR-ing only the elements with that bit set yields one of them and XOR-ing the rest yields the other; the pairs fall on the same side and cancel. *Common wrong answer:* a hash map, or XOR-ing everything and stopping at $a \oplus b$.

**"How fast can you count the set bits of a billion 64-bit words?"** *Model answer:* with the hardware instruction, about one word per cycle per core, so around 0.3 s of arithmetic; the 8 GB of memory traffic at 20–40 GB/s is the real floor, and vectorised (`VPOPCNTDQ` or the SWAR-in-SIMD Harley–Seal method) it is memory-bound. In pure Python it is minutes. *Common wrong answer:* "$O(n)$", with no idea whether that is a second or an hour.

**"Enumerating all submasks of all $n$-bit masks: complexity?"** *Model answer:* $3^n$ pairs, because each bit is in neither, the mask only, or both; that is the bound for partition DPs and it is fine to about $n = 16$ ($4.3 \times 10^7$) and not at $n = 20$ ($3.5 \times 10^9$). *Common wrong answer:* $4^n$ (every pair of masks, ignoring the subset constraint) or $2^n \cdot n$.

**"Represent 40 boolean flags in JavaScript?"** *Model answer:* not in one `number` with bitwise operators, which truncate to 32 bits; a `BigInt`, two 31-bit numbers, a `Uint32Array` of two words, or a `Set` of names if the operations are membership rather than bulk AND/OR. *Common wrong answer:* "a number; it has 53 bits", which is true for arithmetic and false for `&`, `|` and `<<`.

## What mid-level engineers get wrong

- **Forgetting that comparison binds tighter than `&` in C and JavaScript.** `x & 1 == 0` is always false there; the branch never runs and the tests that would catch it were written with the same bug.
- **Using JavaScript bitwise operators past 31 bits.** Flags, hashes and masks silently wrap; `>>> 0` and `BigInt` exist for this.
- **Treating `~x` in Python as a fixed-width flip.** It is $-x - 1$; masking to a width is required to get the bit pattern you meant.
- **Writing an $O(\text{width})$ bit loop in an interpreted language on a hot path.** Sixty-four bytecode iterations per word against one instruction: a 60× gap before allocation.
- **Assuming a bitset shift-or is free.** It is 64× cheaper than the boolean loop, not $O(1)$; `reach << w` on a Python `int` of $W$ bits still costs $O(W/30)$ digit operations.
- **Skipping the termination check on carry loops and `x &= x - 1` loops.** Negative inputs in Python, or a mask that the loop never clears, hang the service.
- **Confusing $2^n$ with $3^n$.** Submask enumeration over all masks is $3^n$, which decides whether $n = 20$ is feasible.

## Senior signals

- You explain two's complement as "the top bit is negative", derive $-x = \sim x + 1$ from $x + \sim x = -1$, trace it on a value, and know that `-INT_MIN` overflows.
- You know JavaScript's bitwise operators are signed 32-bit and reach for `>>> 0`, `BigInt` or plain arithmetic when values exceed $2^{31}$; you know Python's `~` needs a mask to emulate fixed width.
- You use `x & -x`, `x & (x - 1)` and XOR cancellation as idioms, can prove why each works with the "prefix, one, trailing zeros" argument, and can trace the SWAR popcount on a byte.
- You know the hardware has `POPCNT`, `TZCNT` and `LZCNT`, which library call reaches them in your language, and the measured gap (about 900 ns versus 15 ns per word in CPython).
- You parenthesise `(x & m) == 0` reflexively and can name the precedence bug.
- You reach for a bitmask when the set is small integers and for a bitset when a boolean array is large, quantify the 64× win, and know that submask enumeration is $3^n$.
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
    Why does `x & (x - 1) == 0` in JavaScript not correctly test whether x is a positive power of two?
  options: ["The test only works on unsigned, fixed-width integers", "== binds tighter than &, so it is x & ((x - 1) == 0)", "x - 1 underflows when x = 1, breaking the smallest case", "JavaScript numbers are doubles, so the trick fails"]
  answer: 1
  explanation: >-
    Comparison has higher precedence than bitwise AND in JavaScript (and C), so the expression is x & false, which is 0, for every x except 1. Parenthesise: (x & (x - 1)) == 0. The trick itself works on JavaScript numbers below 2^31, whose bitwise operators see a 32-bit integer. Python gives & the higher precedence, so the unparenthesised form happens to work there, and in Java it does not compile.
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
    -x = ~x + 1 flips every bit then carries through the trailing zeros, so the only bit set in both x and -x is x's lowest set bit: 001000 = 8. That step drives Fenwick trees and set-bit iteration. Highest-bit isolation needs a different technique (bit_length or a leading-zero count).
- q: >-
    A subset-sum feasibility DP over n items with total weight W runs in O(nW). Representing the reachable-sums set as a bitset and updating with `reach |= reach << w` changes the cost to what?
  options: ["Nothing; a bitset shift costs as much as a loop over sums", "It becomes O(W), since one shift handles every item", "Still O(nW), but each update is ~W/64 word operations", "The bound drops to O(n log W) because shifts are cheap"]
  answer: 2
  explanation: >-
    Each item's update is a word-parallel shift and OR over W/64 words. Asymptotically that is still O(nW) with a 1/64 constant, but the constant is exactly the point: the machine performs 64 boolean updates per instruction, a real order-of-magnitude difference. Nothing about the trick removes the dependence on n or turns W into log W.
- q: >-
    A DP enumerates, for every n-bit mask, all of its submasks with `sub = (sub - 1) & mask`. How many (mask, submask) pairs does it visit in total, and why?
  options: ["4^n, since each of the 2^n masks is paired with 2^n submasks", "2^n × n, since each mask has at most n submasks", "2^n, since the submasks of all masks are the same 2^n sets", "3^n, since each bit is in neither, the mask only, or both"]
  answer: 3
  explanation: >-
    A (mask, submask) pair assigns each bit one of three states: absent from both, present in the mask only, or present in both. That is 3^n pairs, about 4.3 × 10^7 at n = 16. The 4^n figure ignores that the submask must be contained in the mask; a mask with k set bits has 2^k submasks, not n.
```
