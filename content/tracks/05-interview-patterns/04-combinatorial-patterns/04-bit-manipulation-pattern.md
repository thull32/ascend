---
slug: bit-manipulation-pattern
title: "Bit manipulation: the six tricks and when a problem is secretly asking for them"
description: Recognise the constraints that point at XOR, masks and bit counting, execute the six identities without the width bugs that differ between Python and JavaScript, and see Single Number, Counting Bits, Sum of Two Integers, Reverse Bits and Single Number III traced bit by bit, with the costs measured.
minutes: 28
difficulty: medium
tags: [bit-manipulation, xor, bitmask, twos-complement, pattern:bit-manipulation]
problems: [single-number, number-of-1-bits, counting-bits, reverse-bits, missing-number, sum-of-two-integers, reverse-integer, find-duplicate-number]
---
"Every element appears twice except one; find it in O(1) space." "Add two integers without using `+`." "Count the set bits of every number from 0 to `n` in linear time." These read as puzzles, and candidates who have not seen them either freeze or reach for a hash map that violates the space constraint. They are not puzzles. They are a small, closed set of identities about how integers are stored, and the constraint in the statement ("O(1) space", "without arithmetic operators", "linear", "32-bit") is the interviewer telling you which identity to use.

There are six. XOR cancels pairs. `n & (n − 1)` clears the lowest set bit. `n & −n` isolates it. A mask reads, sets, clears or toggles one bit. Shifts multiply and divide by powers of two. And two's complement makes a negative number a large unsigned one with the same low bits, which is what makes "add without `+`" work, and what breaks it in Python, whose integers have no width, and in JavaScript, whose bitwise operators silently force 32 bits. The identities and their proofs live in [Bit manipulation](/learn/foundations/math-for-engineers/bit-manipulation); masks as sets, submask DP and bitsets live in [Bit tricks in algorithms](/learn/algorithms/technique-mastery/bit-tricks-in-algorithms). This lesson is about the interview: reading which identity a statement asks for, writing it with the width pinned down, and answering the follow-ups that change the pattern.

## The signal

Reach for bits when the statement contains any of these:

- **"Appears twice (or an even number of times) except one" plus "O(1) extra space"**: XOR-fold the array ([Single Number](/practice/single-number)). Pairs cancel; the survivor remains.
- **"One number missing from `0..n`"** with the same space constraint ([Missing Number](/practice/missing-number)): XOR every index `0..n` with every value; each present value cancels its index.
- **"Number of 1 bits", "Hamming weight", "for every number up to `n`"** ([Number of 1 Bits](/practice/number-of-1-bits), [Counting Bits](/practice/counting-bits)): `n & (n − 1)` once per set bit, or the recurrence `bits[i] = bits[i >> 1] + (i & 1)`.
- **"Without using `+` or `−`", "using only bitwise operators"** ([Sum of Two Integers](/practice/sum-of-two-integers)): XOR is the sum without carries, `(a & b) << 1` is the carries; repeat until the carry is zero.
- **"Reverse the bits", "rotate", "is a power of two"** ([Reverse Bits](/practice/reverse-bits)): a fixed-count loop of shift and mask.
- **A set of at most about 20 items that must be enumerated, memoised or passed around cheaply**: an integer mask where bit `i` means "item `i` is in". Enumerating masks is the [backtracking](/learn/interview-patterns/combinatorial-patterns/backtracking-pattern) include/exclude tree flattened into a counter; memoising on the mask is bitmask [DP](/learn/interview-patterns/combinatorial-patterns/dp-patterns).
- **An explicit width** ("32-bit signed", "unsigned integer", "return 0 on overflow"): the width is part of the specification, so impose it in Python and respect it in JavaScript. [Reverse Integer](/practice/reverse-integer) is a decimal problem that belongs here for its overflow check.

What rules it out:

- **Space is not constrained.** A `Counter` solves Single Number in one line; write it if allowed, then offer XOR as the `O(1)`-space answer (measured below, also 2.5 times faster in CPython).
- **A multiplicity other than two.** XOR cancels pairs only. "Three times except one" needs per-bit counting modulo 3, and "one value repeated an unknown number of times" is not a parity problem at all.
- **Floating point.** The identities assume integers; `x & 1` in JavaScript truncates a double first.
- **Sets far beyond 20 elements.** An `n`-bit mask ranges over `2ⁿ` subsets: about 10⁶ at `n = 20`, 10¹² at `n = 40`. At `n = 10⁵`, "subset" means DP over values or greed, not masks.

### Near misses

| Statement | Looks like | Actually | The tell |
|---|---|---|---|
| "Every value appears three times except one" | XOR-fold | Per-bit count mod 3, or the `ones`/`twos` automaton | XOR keeps every value with odd multiplicity |
| "`n + 1` values in `1..n`, one repeated, possibly many times; read-only, `O(1)` space" ([Find the Duplicate Number](/practice/find-duplicate-number)) | XOR values with `1..n` | Floyd's cycle detection on `i → nums[i]` | The duplicate may appear three or more times, so parity isolates nothing |
| "Missing number from `0..n`", in Java or C++ | Sum formula `n(n + 1)/2` | XOR, or the sum in 64 bits | `n * (n + 1)` overflows `int32` from `n = 46,341`, although the halved result fits until `n = 65,535` |
| "Is `n` a power of two", `n` may be 0 or negative | `n & (n − 1) == 0` | The same test plus `n > 0` | `0 & −1` is 0, so 0 passes the bare test |
| "The input is a 64-bit integer", in JavaScript | `&`, `^`, `>>` on a Number | `BigInt` with `BigInt.asUintN(64, …)`, or two 32-bit halves | `2 ** 40 ^ 1` evaluates to 1: the operator kept the low 32 bits |
| "Reverse the digits of a 32-bit integer" | Reverse Bits | Pop decimal digits with `% 10`; check overflow before `* 10` | "Digits" means base 10 |
| "Maximum XOR of any two numbers in the array" | A nested loop, or an XOR-fold | A binary [trie](/learn/interview-patterns/tree-and-graph-patterns/trie-pattern) of the numbers, walked greedily from the top bit | The answer is a pair, and a higher bit outweighs all lower bits together |

## The template

Six identities, each with the one-line reason you say when asked:

| Identity | Expression | Why, in one line | The statement that asks for it |
|---|---|---|---|
| XOR cancels | `x ^ x == 0`, `x ^ 0 == x` | Each column is addition modulo 2 | "twice except one", "missing from `0..n`" |
| Clear the lowest set bit | `n & (n - 1)` | Subtracting 1 borrows through the trailing zeros | "count the 1 bits", power of two |
| Isolate the lowest set bit | `n & -n` | `-n` is `~n + 1`, which flips every bit above the lowest 1 | Split a set by one differing bit; Fenwick trees |
| Read, set, clear, toggle bit `i` | `(n >> i) & 1`, `n \| (1 << i)`, `n & ~(1 << i)`, `n ^ (1 << i)` | A one-hot mask touches one column | Masks as sets, packed flags |
| Shift | `x << k`, `x >> k` | Base-2 place value | Multiply by 2ᵏ; floor-divide by 2ᵏ for `x ≥ 0` |
| Add without `+` | `a ^ b` and `(a & b) << 1` | `a + b = (a ^ b) + 2(a & b)` | "without `+` or `−`" |

The loops that recur across the family, complete and runnable:

```python
MASK32 = 0xFFFFFFFF

def to_signed32(u):
    """Read the low 32 bits of u as a two's-complement signed value."""
    u &= MASK32
    return u - (1 << 32) if u >> 31 else u      # bit 31 set: the value was negative

def popcount(n):
    """Kernighan: one iteration per set bit. Mask negatives first (n & MASK32)."""
    count = 0
    while n:
        n &= n - 1                              # clears exactly the lowest set bit
        count += 1
    return count                                # production: n.bit_count(), Python 3.10+

def lowbit(n):
    return n & -n                               # 12 = 1100 -> 4 = 0100; 0 -> 0

def add32(a, b):
    """a + b in 32-bit two's complement, with bitwise operators only."""
    a, b = a & MASK32, b & MASK32               # Python ints have no width: impose one
    while b:                                    # at most 32 iterations (argued below)
        a, b = (a ^ b) & MASK32, ((a & b) << 1) & MASK32   # partial sum, carries
    return to_signed32(a)

def reverse32(n):
    out = 0
    for _ in range(32):                         # exactly 32: leading zeros must move too
        out = (out << 1) | (n & 1)
        n >>= 1
    return out

def submasks(mask):
    """Every submask of mask, largest first, ending with 0."""
    sub = mask
    while True:
        yield sub
        if sub == 0:
            return
        sub = (sub - 1) & mask                  # next smaller number using only mask's bits
```

```javascript
function popcount(n) {
  n >>>= 0;                                     // unsigned view: bit 31 is a bit, not a sign
  let count = 0;
  while (n !== 0) { n &= n - 1; count++; }      // `!== 0`, not `> 0`: & returns int32
  return count;
}

const lowbit = (n) => n & -n;                   // lowbit(-(2 ** 31)) is negative: test with !== 0

function add(a, b) {
  while (b !== 0) {                             // the operators are already 32-bit signed
    const carry = (a & b) << 1;                 // bit 31's carry falls off the word
    a = a ^ b;
    b = carry;
  }
  return a;
}

function reverse32(n) {
  let out = 0;
  for (let k = 0; k < 32; k++) {
    out = (out << 1) | (n & 1);
    n >>>= 1;                                   // logical shift: >> would copy the sign bit in
  }
  return out >>> 0;                             // read the result as unsigned
}

function* submasks(mask) {
  let sub = mask;
  for (;;) {
    yield sub;
    if (sub === 0) return;
    sub = (sub - 1) & mask;
  }
}
```

`submasks(0b1011)` yields `1011, 1010, 1001, 1000, 0011, 0010, 0001, 0000`: the decrement borrows through the low bits, and the AND discards any bit the mask does not own.

The same expression means different things in the two languages, and interviewers ask:

| | Python | JavaScript |
|---|---|---|
| Integer width | Unbounded; negatives act as if the sign bit repeats forever | Every bitwise operand goes through ToInt32 (ToUint32 for `>>>`); results are 32-bit signed |
| `1 << 31` | `2147483648` | `-2147483648` |
| `1 << 32` | `4294967296` | `1` (the shift count is taken mod 32) |
| `-1 >> 1`, `-1 >>> 1` | `-1`; there is no `>>>` | `-1`, `2147483647` |
| `2 ** 40 ^ 1` | `1099511627777` | `1` |
| Add without `+` | Mask every iteration, reinterpret at the end | Works as written; overflow wraps |
| Popcount builtin | `int.bit_count()` (3.10+) | None; `Math.clz32` is the only bit builtin |

Addition splits into the two operators the loop repeats. Watch 5 and 3 column by column: XOR gives 6, the sum without carries; AND gives 1, the column that carries:

```viz
{"type": "bits", "algorithm": "and-or-xor", "a": 5, "b": 3, "title": "5 and 3: XOR is the carry-less sum, AND marks the carries", "caption": "5 ^ 3 = 6 and 5 & 3 = 1. Shifting the AND left by one gives the carry, 2, and 6 + 2 = 8 is the sum; the add loop repeats this split until the carry is 0."}
```

## Why the identities hold

Four arguments, each short enough to say out loud when the interviewer asks "why does that work?".

**`n & (n − 1)` removes exactly one set bit.** Write `n` as a prefix `P`, its lowest 1, then `k` zeros: `P 1 0…0`. Subtracting 1 borrows through the zeros, so `n − 1 = P 0 1…1`. The AND keeps `P` and zeroes every position from the lowest 1 down. `12 = 1100`, `11 = 1011`, `12 & 11 = 1000`. A loop of these runs once per set bit, not once per bit of the word.

**`n & −n` keeps only the lowest set bit.** In two's complement `−n = ~n + 1`. Inverting `P 1 0…0` gives `~P 0 1…1`, and adding 1 carries through the trailing ones to give `~P 1 0…0`. The AND with `n` turns the prefix into `P & ~P = 0` and leaves `1 0…0`. `12 & −12 = 0100 = 4`.

**An XOR-fold is a column-wise parity.** In each bit column, XOR is addition modulo 2, so it is associative and commutative, 0 is its identity, and every value is its own inverse. A fold therefore computes each column's parity: values with even multiplicity vanish, and the result is the XOR of the values with odd multiplicity. That is the recognition test: exactly one value with odd multiplicity means XOR; anything else means counting.

**The carry loop is correct and stops within 32 iterations.** In every column the XOR is the sum digit and the AND is the carry out, so `a + b = (a ^ b) + 2 · (a & b)` for any integers. Replacing `(a, b)` with `(a ^ b, (a & b) << 1)` preserves the sum modulo 2³², which is the loop invariant; when the carry is zero, `a` alone is the sum. The new carry's set bits are a subset of the old carry's, shifted up one place, so the lowest set bit of `b` rises by at least one position per iteration and leaves a 32-bit word within 32 iterations. Measured on CPython 3.14 over 200,000 random pairs of 32-bit signed values: 5.2 iterations on average and 20 at worst; `add32(−1, 1)` needs all 32 because its carry climbs one bit per iteration.

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

Trace on `[4, 1, 2, 1, 2]`:

| `x` | binary | `acc` after | binary |
|---|---|---|---|
| 4 | 100 | 4 | 100 |
| 1 | 001 | 5 | 101 |
| 2 | 010 | 7 | 111 |
| 1 | 001 | 6 | 110 |
| 2 | 010 | 4 | 100 |

The second 1 undid the first, the second 2 undid the first, and 4 remained. Because XOR is associative and commutative the accumulator equals `4 ^ (1 ^ 1) ^ (2 ^ 2) = 4`, whatever the order. Negative numbers need no special handling: XOR acts on the two's-complement pattern, and in Python the repeated sign bits cancel in pairs like any other column.

```viz
{"type": "bits", "algorithm": "single-number", "values": [4, 1, 2, 1, 2], "title": "Single Number by XOR", "caption": "Each pair of equal values XORs to zero; only the unpaired value survives."}
```

[Missing Number](/practice/missing-number) is the same fold with the indices as the partners. On `[3, 0, 1]` with `n = 3`: `(0 ^ 1 ^ 2 ^ 3) ^ (3 ^ 0 ^ 1) = 0 ^ 2 = 2`. The sum formula `n(n + 1)/2 − sum(nums)` is equally correct in Python; in a fixed-width language it overflows, which the near-miss table quantifies.

### Counting Bits

[Counting Bits](/practice/counting-bits): for every `i` in `0..n`, the number of 1 bits, in `O(n)` total.

A popcount per number is `O(n log n)` in the worst case, because `i` has up to `⌊log₂ i⌋ + 1` bits. The linear version is a DP whose state is one smaller number: `i` and `i >> 1` differ by exactly the bit shifted out, so `bits[i] = bits[i >> 1] + (i & 1)`. Equivalently, clearing the lowest set bit leaves a smaller number with one fewer 1: `bits[i] = bits[i & (i − 1)] + 1`.

```python
def count_bits(n):
    dp = [0] * (n + 1)
    for i in range(1, n + 1):
        dp[i] = dp[i >> 1] + (i & 1)       # parenthesise: + binds tighter than &
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

Result `[0, 1, 1, 2, 1, 2, 2, 3, 1]`. Every `dp[i >> 1]` read is already filled because `i >> 1 < i`, which is the whole correctness argument for the fill order. The second recurrence relies on Kernighan's step, shown here one cleared bit at a time:

```viz
{"type": "bits", "algorithm": "count-bits", "values": [12, 7, 8], "title": "Kernighan's step: n & (n − 1) clears one set bit", "caption": "12 = 1100 empties in two steps, 7 = 0111 in three, 8 = 1000 in one. One step per set bit is why bits[i & (i − 1)] + 1 is a valid recurrence and why the popcount loop costs O(set bits)."}
```

The interviewer wants the recurrence; the runtime is less tidy. In CPython 3.14 on this machine, `n = 10⁶` took 26 ms with the DP and 11 ms with `[i.bit_count() for i in range(n + 1)]`: the `O(n log n)` comprehension does one C call per number, the DP several bytecodes. Say both: the DP answers the question; the builtin is what you would ship in Python.

### Sum of Two Integers

[Sum of Two Integers](/practice/sum-of-two-integers): add two 32-bit signed integers without `+` or `−`.

`add32(5, 3)`, positive values, binary:

| iteration | `a` | `b` (carry) | `a ^ b` | `(a & b) << 1` |
|---|---|---|---|---|
| 1 | 101 | 011 | 110 | 010 |
| 2 | 110 | 010 | 100 | 100 |
| 3 | 100 | 100 | 000 | 1000 |
| 4 | 000 | 1000 | 1000 | 0 |

The carry is 0 after four iterations: `1000` = 8. Every row has the same `a + b`: 5 + 3, 6 + 2, 4 + 4, 0 + 8. That is the invariant, visible.

`add32(−1, 1)` is the worst case. Masked, −1 is `0xFFFFFFFF`, and the carry walks up one bit per iteration (hexadecimal, values after each iteration):

| iteration | `a` | `b` |
|---|---|---|
| start | FFFFFFFF | 00000001 |
| 1 | FFFFFFFE | 00000002 |
| 2 | FFFFFFFC | 00000004 |
| 3 | FFFFFFF8 | 00000008 |
| 31 | 80000000 | 80000000 |
| 32 | 00000000 | 00000000 |

At iteration 32 the carry `0x100000000` has 33 bits and the mask drops the top one: the sum is 0. A 32-bit adder discards that bit in hardware; Python never does without the mask.

`add32(−2, −3)` shows the reinterpretation at the end:

| iteration | `a` | `b` |
|---|---|---|
| start | FFFFFFFE | FFFFFFFD |
| 1 | 00000003 | FFFFFFF8 |
| 2 | FFFFFFFB | 00000000 |

`0xFFFFFFFB` has bit 31 set, so `to_signed32` returns `0xFFFFFFFB − 2³² = −5`. The older idiom `~(a ^ 0xFFFFFFFF)` computes the same value: `0xFFFFFFFB ^ 0xFFFFFFFF = 4`, and `~4 = −5`. In JavaScript none of this appears: `(a & b) << 1` already discards bit 32, and every result is already signed.

### Reverse Bits

[Reverse Bits](/practice/reverse-bits): reverse the 32 bits of an unsigned integer. Peel the lowest bit off `n` and push it onto the bottom of `out`, exactly 32 times.

A 4-bit version on `n = 0011` shows why the count is fixed:

| iteration | `n` before | `n & 1` | `out` after |
|---|---|---|---|
| 1 | 0011 | 1 | 1 |
| 2 | 0001 | 1 | 11 |
| 3 | 0000 | 0 | 110 |
| 4 | 0000 | 0 | 1100 |

`0011` reversed is `1100` = 12. A `while n:` loop stops after iteration 2 with `out = 11` = 3: leading zeros must become trailing zeros, and only a fixed count shifts them in. At 32 bits the bug turns `reverse_bits(1)` into 1 instead of 2,147,483,648. In JavaScript, `n >>>= 1` and `out >>> 0`; with `>>`, an input with bit 31 set feeds ones in from the top.

### Single Number III

Two values appear once and every other value twice; return the two in `O(1)` space. Fold everything to get `x = a ^ b`, which is non-zero because `a ≠ b`. Any set bit of `x` is a column where `a` and `b` differ; take the lowest, `x & −x`, and fold each side of the split separately. Each pair falls on one side and cancels.

Trace on `[1, 2, 1, 3, 2, 5]`: the fold is `6 = 110`, the split bit is `010`.

| `v` | binary | `v & 010` | side | fold of set side | fold of clear side |
|---|---|---|---|---|---|
| 1 | 001 | 0 | clear | 0 | 1 |
| 2 | 010 | 1 | set | 2 | 1 |
| 1 | 001 | 0 | clear | 2 | 0 |
| 3 | 011 | 1 | set | 1 | 0 |
| 2 | 010 | 1 | set | 3 | 0 |
| 5 | 101 | 0 | clear | 3 | 5 |

Answer `{3, 5}`. In JavaScript the split test must be `(v & bit) !== 0`. If the singletons differ only in bit 31, `bit` is −2³¹ and `(v & bit) > 0` is never true: on `[-2147483645, 3, 9, 9]` the `> 0` version puts everything on one side and returns `[-2147483648, 0]` instead of `[-2147483645, 3]`.

## Variations

| Variant | Change to the template | Why it stays correct |
|---|---|---|
| Single Number II: every value three times except one | Count bit `b` across all values and keep it when the count mod 3 is 1; or `ones = (ones ^ x) & ~twos`, then `twos = (twos ^ x) & ~ones` | Columns are independent, and tripled values add multiples of 3 to every column |
| Single Number III: two singletons | Fold to `a ^ b`, split by its lowest set bit, fold each side | `a` and `b` differ in that column; each pair lands on one side |
| Missing Number | Fold the indices `0..n` together with the values | Each present value cancels its index |
| Hamming distance | `popcount(a ^ b)` | XOR marks exactly the differing columns |
| Total Hamming distance of an array | Per bit, add `ones · (n − ones)` | A column's differing pairs are its ones times its zeros: `O(32n)`, not `O(n²)` |
| Power of four | `n > 0 and n & (n - 1) == 0 and n & 0x55555555` | One set bit, at an even position |
| Bitwise AND of the range `[m, n]` | Shift both right until equal, then shift back | Every bit below the common prefix is 0 in some number of the range |
| All subsets of `n ≤ 20` items | `for mask in range(1 << n)`, item `i` in when `(mask >> i) & 1` | Each `n`-bit number is one include/exclude pattern |
| All submasks of one mask | `sub = (sub - 1) & mask` until 0 | Decrement, then discard the bits the mask does not own |
| Gray code | `i ^ (i >> 1)` | Consecutive codes differ in exactly one bit |

The per-bit count for Single Number II on `[2, 2, 3, 2]`:

| bit | column across (2, 2, 3, 2) | count | count mod 3 | answer bit |
|---|---|---|---|---|
| 0 | 0, 0, 1, 0 | 1 | 1 | 1 |
| 1 | 1, 1, 1, 1 | 4 | 1 | 1 |
| 2..31 | all 0 | 0 | 0 | 0 |

Answer `11` = 3. In Python the assembled 32-bit pattern must go through `to_signed32` when bit 31 is set; in JavaScript `out |= 1 << 31` already produces the negative number. The `ones`/`twos` automaton avoids the 32 passes: a bit enters `ones` on its first sighting, moves to `twos` on the second, and leaves both on the third, so after the scan `ones` holds the bits seen once. In Python it also handles negatives unaided, because the infinitely repeated sign bits run through the same three-state cycle as every other column.

Masks as sets are the other half of this pattern. Counting from 0 to `2ⁿ − 1` visits every subset once, and bit `i` of the counter is the include/exclude decision for item `i`:

```viz
{"type": "bits", "algorithm": "subset-mask", "values": [3, 5, 9], "title": "Every subset of three items as a 3-bit mask", "caption": "Mask 5 = 101 selects items 0 and 2, {3, 9}. The counter replaces the backtracking tree's include/exclude recursion, and a mask is a hashable, O(1)-copy key for memoising on a subset."}
```

## Complexity, derived

| Operation | Iterations | Why |
|---|---|---|
| XOR fold, Missing Number | `n` | One pass, one word of state |
| Kernighan popcount | popcount(`n`) ≤ 32 | One set bit cleared per iteration |
| Counting Bits by DP | `n` | One lookup and one addition per index |
| Counting Bits, popcount per number | at most `n(⌊log₂ n⌋ + 1)` | `i` has at most that many bits |
| Carry add | ≤ 32 | The carry's lowest set bit rises each iteration |
| Reverse Bits | 32, or 4 byte-table lookups | Fixed width |
| Single Number II | `32n` per-bit, or `n` with the automaton | 32 independent columns |
| All subsets | `2ⁿ` masks, `O(n · 2ⁿ)` listed | `n` to decode each mask |
| All submasks of all masks | `3ⁿ` | Each bit is out of the mask, in the mask only, or in both |

For fixed-width values `O(32n)` and `O(n)` are the same class; say the 32 anyway. Python adds a caveat: an `int` operation costs time proportional to its 30-bit digits. A 32-bit value is two digits, but a 10⁵-bit mask is 3,334, and every `&` on it is a loop.

## Under the hood

### CPython

An `int` is an arbitrary-precision object: a header and an array of 30-bit digits, sign stored separately, so the bitwise operators emulate an infinite two's complement. That is why `~x == −x − 1`, why `−1 >> 1 == −1`, and why `x & 0xFFFFFFFF` produces the 32-bit pattern of a negative `x`. The integers −5 to 256 are preallocated; every other value is a separate object of about 28 to 32 bytes. A `Counter` over 10⁶ distinct integers measured 42 MB after construction and 63 MB at peak, against one integer for the XOR fold.

`int.bit_count()` (3.10+) is a C popcount. Measured on CPython 3.14 on this machine, in milliseconds:

| Task | Python-level bit loop | String route | C builtin |
|---|---|---|---|
| Popcount of 10⁶ random 32-bit values | Kernighan 440 | `bin(x).count("1")` 64 | `int.bit_count()` 16 |
| Counting Bits to `n = 10⁶` | Kernighan per number 195; DP 26 | | `bit_count` comprehension 11 |
| Reverse Bits, 10⁶ calls | 32-step loop 1,167; byte table 147 | `int(f"{n:032b}"[::-1], 2)` 207 | |
| Single Number over about 2 × 10⁶ values | XOR loop 97; `reduce(xor)` 89 | | `Counter` 246 |

In every row a CPython bytecode costs tens of nanoseconds, so the fewest Python-level steps wins, whatever the asymptotics.

### V8 in Node 24

Numbers are IEEE doubles (small integers unboxed as "Smis"). Every bitwise operator applies ToInt32 to each operand (truncate toward zero, reduce mod 2³², read as signed), `>>>` applies ToUint32, and shift counts are taken mod 32. Hence `1 << 31 === −2147483648`, `2 ** 32 | 0 === 0`, `(2 ** 32 + 5) | 0 === 5`, and `2 ** 40 ^ 1 === 1`. Doubles hold integers exactly only up to 2⁵³: `Number("9007199254740993")` is `9007199254740992`, so a 64-bit identifier must arrive as a string and become `BigInt(str)`.

JavaScript has no popcount; `Math.clz32` is the only bit builtin. Measured on Node 24.21 on this machine, per 10⁶ values: Kernighan popcount 12.2 ms, the SWAR sequence (the classic five-step mask-and-add popcount) 0.9 ms, a 65,536-entry table 0.7 ms; Counting Bits DP 4.0 ms into a plain `Array` and 0.9 ms into a `Uint8Array`; Reverse Bits 9.1 ms looping, 1.2 ms with a 256-entry table. `BigInt` is arbitrary precision and heap-allocated: a 64-bit XOR-and-rotate loop over 10⁶ values with `& mask` took 34 ms against 0.4 ms for the 32-bit Number version, and an XOR-and-shift loop wrapped in `BigInt.asUintN(64, …)` took 2.5 ms.

### The hardware

x86-64 has `POPCNT`, `LZCNT` and `TZCNT`; AArch64 counts bits with `CNT` on a vector register and reverses them with `RBIT`. x86 has no single bit-reverse instruction (`BSWAP` reverses bytes). Rust's `count_ones` and `reverse_bits` compile to these when the target supports them, so in a compiled language the interview loop explains the builtin rather than replacing it.

## Failure modes

**Symptom: Sum of Two Integers passes positive tests and times out on any negative input, in Python.** Diagnosis: no width. The carry out of bit 31 is never dropped, so it climbs forever; after 100 iterations of `add(−1, 1)` the operands are near ±1.27 × 10³⁰. Fix: mask both values to 32 bits every iteration and reinterpret the result with `to_signed32`.

**Symptom: Reverse Bits or Number of 1 Bits in JavaScript returns a negative number, or a popcount of 0, when the input has bit 31 set.** Diagnosis: `>>` is an arithmetic shift that copies the sign bit in, results of `|` are signed, and a loop guarded by `n > 0` stops at the first negative intermediate. Fix: `>>>` inside the loop, `>>> 0` on the result, `!== 0` in loop guards and split tests.

**Symptom: an "is even" branch never runs, with no error.** Diagnosis: precedence. `n & 1 == 0` parses as `n & (1 == 0)`, which is `n & False`, always 0 in Python; `n & 1 === 0` is `n & false` in JavaScript. `x ^ y == 0` fails the same way. Fix: parenthesise every bitwise sub-expression, `(n & 1) == 0`.

**Symptom: a JavaScript service treats two different 64-bit IDs as equal, or a bit test on an ID beyond 2³² always says 0.** Diagnosis: the IDs were parsed into Numbers (exact only to 2⁵³) and then passed through a bitwise operator, which kept the low 32 bits. Fix: parse with `BigInt(str)`, operate with `n`-suffixed literals and `BigInt.asUintN(64, …)`, and serialise back as strings.

**Symptom: Missing Number in Java passes unit tests and fails the 50,000-element hidden test.** Diagnosis: `n * (n + 1) / 2` in `int` overflows in the multiplication from `n = 46,341`. Fix: the XOR fold, which cannot overflow, or `long`.

## Trade-offs

| Approach (Single Number, Missing Number) | Time | Extra space | Multiplicities handled | Overflow risk |
|---|---|---|---|---|
| Hash counter | `O(n)`; 246 ms here for 2 × 10⁶ | `O(n)`; 42 MB for 10⁶ keys | Any | None |
| Sort, then scan neighbours | `O(n log n)` | `O(1)` if sorting in place is allowed, which mutates the input | Any | None |
| XOR fold | `O(n)`; 97 ms here | `O(1)` | Exactly one odd multiplicity | None |
| Per-bit count mod `k` | `O(32n)` | `O(1)` | "`k` times except one", any `k` | Sign of bit 31 in Python |
| Sum formula (missing number) | `O(n)` | `O(1)` | Exactly one missing | Overflows 32-bit from `n = 46,341` |

## Interviewer follow-ups

**"Now every element appears three times except one."** Model answer: each tripled value survives the fold, so count the 32 columns and keep those whose count is not a multiple of 3, `O(32n)` time and `O(1)` space, or run the `ones`/`twos` automaton; in Python, convert a bit-31 result back to a negative. Common wrong answer: XOR anyway.

**"The input is a 64-bit integer, and you are writing JavaScript."** Model answer: a Number is exact only to 2⁵³ and bitwise operators truncate to 32 bits: `2 ** 40 ^ 1` is 1. Receive it as a string, convert with `BigInt(str)` and keep the width with `BigInt.asUintN(64, x)`, or carry two 32-bit halves by hand; measured, the masked BigInt loop ran about 85 times slower than 32-bit Numbers. Common wrong answer: "Numbers are 64-bit doubles, so 64-bit integers fit."

**"`reverse_bits` is now called 10⁹ times."** Model answer: a 256-entry table of reversed bytes and four lookups, measured 8 times faster than the loop in CPython and 7 times in Node (10⁹ calls: about 9 s down to 1 s); or five mask-and-shift swaps of halves, quarters and so on down to bits. Common wrong answer: memoising results in a dictionary, which is slower than the arithmetic and could grow toward 2³² entries.

**"Several threads set bits in one shared bitset."** Model answer: `words[i >> 6] |= 1 << (i & 63)` is a read-modify-write. Two threads setting different bits of one word both read the old word, and the second store erases the first bit. Use an atomic OR (`fetch_or`, or `Atomics.or` over a `SharedArrayBuffer`) or a compare-and-swap loop that retries when the word changed. See [atomics and lock-free programming](/learn/systems/concurrency/atomics-and-lock-free). Common wrong answer: "OR is one instruction, so it is atomic"; without the `lock` prefix or an atomic API it is a load, an OR and a store.

**"Count the subsets whose XOR is `k` for `n ≤ 20`. Now `n = 10⁵`. Now return them all."** Model answer: for `n ≤ 20`, loop over the 10⁶ masks. For `n = 10⁵`, build a linear basis over GF(2) (at most 32 vectors); if `k` reduces to 0 against it the count is `2^(n − rank)`, else 0, in `O(32n)`, because subset-XOR is linear and every reachable value has equally many preimages. Returning them all means an output of up to `2ⁿ` sets, so masks or [backtracking](/learn/interview-patterns/combinatorial-patterns/backtracking-pattern) are forced and only small `n` is feasible. Common wrong answer: "read the subsets out of the counting structure"; counts do not store the sets.

## What mid-level engineers get wrong

- **Using XOR for "three times except one".** Consequence: the answer is the singleton XOR every tripled value, correct only when the tripled values happen to cancel.
- **Porting a C solution to Python without a mask.** Consequence: an infinite loop on the first negative input, and `~x` that means `−x − 1` rather than "flip 32 bits".
- **Using `>>`, `> 0` or `|` results unconverted in JavaScript.** Consequence: negative outputs for any input with bit 31 set, which the problem's tests always include.
- **Writing `while n` for a fixed-width reversal.** Consequence: leading zeros are lost; `reverse_bits(1)` returns 1.
- **Unparenthesised bitwise tests.** Consequence: silent wrong branches, because `&`, `^` and `|` bind looser than `==`.
- **Presenting the trick as memorised magic.** Consequence: no answer to "why does `n & (n − 1)` work?" or "why does the carry loop stop?".
- **Choosing the asymptotically better loop and never measuring.** Consequence: a Python DP that is slower than the `O(n log n)` builtin, presented as the optimisation.

## Exercises

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

```exercise
id: single-number-ii
title: Single number when the others appear three times
prompt: |
  Every value in `nums` appears exactly three times except one value,
  which appears once. Return that value. Values are 32-bit signed
  integers and may be negative. Use O(1) extra space: no hash map and no
  sorted copy.

  Count each of the 32 bit positions across all values and keep the bits
  whose count is not a multiple of 3, or run the ones/twos state machine.
  In Python, a result assembled bit by bit with bit 31 set must be
  converted back to a negative number.
languages: [python, javascript]
entry: single_number_ii
starter:
  python: |
    def single_number_ii(nums):
        # your code here
        return 0
  javascript: |
    function single_number_ii(nums) {
      // your code here
      return 0;
    }
tests:
  - args: [[2, 2, 3, 2]]
    expected: 3
  - args: [[0, 1, 0, 1, 0, 1, 99]]
    expected: 99
  - args: [[-2, -2, 1, 1, 4, 1, 4, 4, -5, -2]]
    expected: -5
    label: negative singleton
  - args: [[7]]
    expected: 7
    label: single element
  - args: [[5, -1, -1, -1]]
    expected: 5
    label: a negative value appears three times
  - args: [[-2147483648, 3, 3, 3]]
    expected: -2147483648
    hidden: true
    label: the minimum 32-bit value
  - args: [[2147483647, 0, 0, 0, -8, -8, -8]]
    expected: 2147483647
    hidden: true
  - args: [[30000, 500, 100, 30000, 100, 30000, 100]]
    expected: 500
    hidden: true
hints:
  - "For bit b from 0 to 31, count the values with (x >> b) & 1 set; if the count mod 3 is 1, the answer has bit b."
  - "In Python, if the assembled result has bit 31 set, subtract 1 << 32; in JavaScript, out |= 1 << 31 already yields the negative value."
  - "One-pass alternative: ones = (ones ^ x) & ~twos, then twos = (twos ^ x) & ~ones; return ones."
```

## Senior signals

- You name the **identity and its one-line reason** ("XOR is its own inverse, so pairs cancel") and can prove `n & (n − 1)` and the carry loop's termination when asked.
- You state the **recognition test for XOR**: exactly one value with odd multiplicity. Anything else means counting per bit, a basis over GF(2), or a different pattern altogether.
- You know the **width story in both languages** cold: mask and reinterpret in Python; ToInt32, `>>>` and `>>> 0` in JavaScript; `BigInt` past 32 bits and strings past 2⁵³.
- You see Counting Bits as a **DP whose state is `i >> 1`**, and you also know that in CPython the `bit_count` comprehension beats it, because interpreter steps, not asymptotics, dominate.
- You **parenthesise bitwise expressions** and say why, because precedence bugs in this family are silent.
- You treat **masks as sets** for `n ≤ 20` and connect them to backtracking and bitmask DP, and you name `3ⁿ` as the cost of enumerating submasks of every mask.
- You carry the pattern into production: **atomic OR or CAS for shared bitsets**, lookup tables or hardware instructions for hot bit loops, and `BigInt` or string transport for 64-bit identifiers in JavaScript.

## Check yourself

```quiz
- q: >-
    In Python, add(a, b) built from XOR and a shifted AND never terminates for add(-1, 1). Why?
  options: ["XOR is undefined for negative integers in Python", "The loop tests the carry when it should test the running sum", "No fixed width, so the carry is never dropped off the top", "Python's << on a negative raises instead of wrapping"]
  answer: 2
  explanation: >-
    A 32-bit adder discards the carry out of bit 31. Python integers are unbounded, so the carry keeps shifting left, and after 100 iterations the operands are about plus and minus 1.27 x 10^30. Masking both values to 0xFFFFFFFF every iteration imposes the width; the loop then ends within 32 iterations, and to_signed32 turns a result with bit 31 set back into a negative number.
- q: >-
    In JavaScript, reverse_bits shifts with n >>= 1 and receives an input with bit 31 set. What goes wrong?
  options: ["Nothing, since JavaScript right shifts are unsigned", "Bit 0 is skipped, so the whole output is off by one place", "The result grows a 33rd bit above the 32-bit word", ">> copies the sign bit in; use >>> and read with >>> 0"]
  answer: 3
  explanation: >-
    Bitwise operators work on 32-bit signed values, and >> is an arithmetic shift that fills from the top with the sign bit, so ones are fed into later iterations. >>> fills with zeros, and >>> 0 reads the final pattern as unsigned instead of negative. Python has no such problem for non-negative input because its right shift of a positive value fills with zeros.
- q: >-
    Measured on CPython 3.14, Counting Bits to n = 10^6 took 26 ms with the dp[i >> 1] recurrence and 11 ms with [i.bit_count() for i in range(n + 1)]. What explains it?
  options: ["bit_count caches earlier answers, making it O(n) too", "DP steps are bytecodes; bit_count is a single C call", "The measurement is noise; O(n) must beat O(n log n)", "The DP is really O(n log n) because of each shift it does"]
  answer: 1
  explanation: >-
    Asymptotics count operations, but a CPython bytecode costs tens of nanoseconds while a C popcount costs about one. The comprehension does one C call per number; the DP does an index, a shift, an AND, an add and a store per number in the interpreter. In an interview the DP is the answer to the question asked, and naming the builtin and why it wins in Python is the senior addition.
- q: >-
    Every element appears three times except one. A candidate XORs the whole array. What comes back?
  options: ["The sum of all the array values, taken modulo 2 per bit", "Singleton XOR each tripled value, as x ^ x ^ x = x", "The singleton, which is the correct answer here", "Zero, since every value eventually cancels itself out"]
  answer: 1
  explanation: >-
    XOR computes the parity of each bit column, so every value with odd multiplicity survives, and three is odd. Counting each column modulo 3, or the ones/twos state machine, recovers the singleton in O(1) space.
- q: >-
    A Java Missing Number solution computes n * (n + 1) / 2 in int and fails a hidden test with n = 50,000. Why?
  options: ["The array holds 50,000 values, so the true n is 49,999", "n * (n + 1) overflows int before the division runs", "Integer division truncates the odd products wrongly", "The quotient exceeds int above n = 46,341 as well"]
  answer: 1
  explanation: >-
    50,000 * 50,001 is about 2.5 x 10^9, above 2^31 - 1, so the product wraps before it is halved; the product first overflows at n = 46,341, while the halved sum would fit until n = 65,535. n(n + 1) is always even, so the division is exact. The XOR fold cannot overflow, and a long accumulator also works.
- q: >-
    Two threads set different bits of the same 64-bit word in a shared bitset with words[i >> 6] |= 1L << (i & 63). What can happen and what fixes it?
  options: ["Nothing; each thread only touches its own bit", "A torn 64-bit write, fixed by using 32-bit words", "A lost bit; use an atomic OR or a CAS retry loop", "A deadlock, fixed by always locking lower words first"]
  answer: 2
  explanation: >-
    |= is a load, an OR and a store. Both threads can load the same old word, and the second store overwrites the first thread's bit. An atomic fetch-or, or a compare-and-swap loop that retries when the word changed underneath it, makes the update indivisible. Smaller words reduce contention but do not remove the race.
```
