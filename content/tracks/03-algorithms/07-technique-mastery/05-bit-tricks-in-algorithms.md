---
slug: bit-tricks-in-algorithms
title: "Bit tricks in algorithms: masks as sets, submask loops, Gray codes and bitsets"
description: Use integers as sets to enumerate subsets, submasks and fixed-size combinations, run DP over subsets, walk a Fenwick tree with lowbit, step through Gray codes one bit at a time, and get a 64x speed-up from bitsets.
minutes: 50
difficulty: hard
tags: [bit-manipulation, bitmask, bitmask-dp, bitset, gray-code, lowbit]
problems: [subsets, partition-equal-subset, n-queens, sudoku-solver, counting-bits, single-number]
---
[Partition Equal Subset Sum](/practice/partition-equal-subset) with 200 numbers, each at most 100, asks whether some subset reaches half the total. The textbook answer is a boolean DP over sums up to 10,000: 200 × 10,000 = 2 million cell updates, which takes on the order of a second in Python. The bitset answer keeps the booleans as the bits of one integer (up to 20,001 of them, because the code below never trims sums above the half) and does `reach |= reach << x` for each number. That is 200 shift-and-OR operations, each running in C over a machine word at a time, and it finishes in milliseconds. The recurrence is the same and the answer is the same. The speed-up comes from the processor updating dozens of booleans in one instruction.

The [bit manipulation lesson](/learn/foundations/math-for-engineers/bit-manipulation) taught what `&`, `|`, `^`, `<<` and `x & (x - 1)` do. This lesson is about the algorithms that are only fast *because* of them: enumerating subsets and submasks, DP whose states are sets, the lowbit walk inside a Fenwick tree, Gray codes that change one element at a time, and bitsets that divide the running time by the word size.

## Masks as sets

An `n`-bit integer is a subset of `{0, …, n-1}`: bit `i` is set when element `i` is in. Every set operation is then one or two machine instructions:

| Set operation | Mask expression |
|---|---|
| Empty set, full set of `n` | `0`, `(1 << n) - 1` |
| Is `i` in `S`? | `S >> i & 1` |
| Add, remove, toggle `i` | `S \| 1 << i`, `S & ~(1 << i)`, `S ^ 1 << i` |
| Union, intersection | `A \| B`, `A & B` |
| Difference `A \ B` | `A & ~B` |
| Complement within `n` bits | `full ^ S` |
| `A ⊆ B` | `(A & ~B) == 0` |
| Size | popcount of `S` |
| Smallest element | index of `S & -S` |

Iterating over the members costs `O(|S|)`, not `O(n)`, if you peel off the lowest set bit each time:

```python
def members(s):
    while s:
        low = s & -s               # isolate the lowest set bit
        yield low.bit_length() - 1 # its index
        s ^= low                   # remove it (the same as s &= s - 1)
```

## Enumerating: all subsets, submasks, and subsets of size k

**All subsets** of `n` elements are the integers `0` to `2^n - 1`. Counting up visits every subset exactly once:

```viz
{"type": "bits", "algorithm": "subset-mask", "values": [2, 3, 5, 7], "title": "Sixteen masks, sixteen subsets", "caption": "Mask 1011 has bits 0, 1 and 3 set, so it names {2, 3, 7}. Counting from 0 to 15 visits every subset once."}
```

**All submasks of a given mask** use a loop worth memorising:

```python
def submasks(mask):
    sub = mask
    while True:
        yield sub
        if sub == 0:
            break
        sub = (sub - 1) & mask
```

Why it works: `sub - 1` clears the lowest set bit of `sub` and sets every bit below it. ANDing with `mask` keeps only the positions that belong to `mask`. The result is the largest submask of `mask` that is smaller than `sub`, so the loop visits every submask exactly once, in decreasing order. For `mask = 1011`:

| `sub` | `sub − 1` | `(sub − 1) & 1011` | what happened |
|---|---|---|---|
| `1011` | `1010` | `1010` | bit 0 cleared |
| `1010` | `1001` | `1001` | bit 1 cleared, bit 0 set |
| `1001` | `1000` | `1000` | bit 0 cleared |
| `1000` | `0111` | `0011` | bit 3 cleared, bits 0–2 set, bit 2 masked off |
| `0011` | `0010` | `0010` | bit 0 cleared |
| `0010` | `0001` | `0001` | bit 1 cleared, bit 0 set |
| `0001` | `0000` | `0000` | bit 0 cleared |
| `0000` | | | stop after yielding `0000` |

That is eight submasks, 2³ for three set bits. The fourth row is the one to study: subtracting 1 from `1000` borrows through every lower position, and the AND with `mask` is what removes bit 2, which `mask` does not have. The cost of running this loop for *every* mask is the number of pairs `(mask, sub)` with `sub ⊆ mask`. Each element is either in neither, in `mask` only, or in both, so there are **`3^n`** pairs. For `n = 15` that is about 14 million, which is fine. For `n = 20` it is 3.5 billion, which is not. Knowing that the total is `3^n` rather than `4^n` is what tells you whether "for every set, try every way to split it" is feasible.

**Subsets of exactly `k` elements** come from Gosper's hack, which computes the next larger integer with the same number of set bits:

```python
def next_same_popcount(x):
    c = x & -x                      # lowest set bit
    r = x + c                       # the lowest block of 1s carries up one place
    return (((r ^ x) >> 2) // c) | r   # the leftover 1s go back to the bottom
```

Trace it on five bits from `x = 00111`:

| step | `x` | `c = x & -x` | `r = x + c` | `r ^ x` | `(r ^ x) >> 2` | `÷ c` | result `\| r` |
|---|---|---|---|---|---|---|---|
| 1 | `00111` | `00001` | `01000` | `01111` | `00011` | `00011` | `01011` |
| 2 | `01011` | `00001` | `01100` | `00111` | `00001` | `00001` | `01101` |
| 3 | `01101` | `00001` | `01110` | `00011` | `00000` | `00000` | `01110` |
| 4 | `01110` | `00010` | `10000` | `11110` | `00111` | `00011` | `10011` |

Adding the lowest set bit `c` carries the lowest block of ones up by one place (`r`). `r ^ x` marks every bit that changed; shifting it right by two and dividing by `c` counts how many ones were in the block minus one and puts that many ones back at the bottom. Step 4 shows the block `0111` at positions 1–3 moving up to a single one at position 4 with two ones returned to positions 0–1. The sequence continues `10101, 10110, 11001, 11010, 11100`, ten masks in all, `C(5, 3)`. Stop when the value reaches `1 << n`. Use it when `C(n, k)` is small but `2^n` is not, for example choosing 3 of 30 items.

## DP over subsets

### Visiting every node: Held–Karp

"Shortest route that visits every one of `n` cities" has an `O(n!)` brute force. Held–Karp's DP makes the state *the set of cities visited so far* plus the current city: `dp[mask][v]` is the cheapest path that starts at city 0, visits exactly the cities in `mask`, and ends at `v`.

```python
def shortest_tour(w):
    n, INF = len(w), float("inf")
    dp = [[INF] * n for _ in range(1 << n)]
    dp[1][0] = 0                                  # at city 0, having visited {0}
    for mask in range(1 << n):                    # increasing order: subsets before supersets
        for v in range(n):
            cur = dp[mask][v]
            if cur == INF:
                continue
            for u in range(n):
                if not (mask >> u & 1):           # extend to an unvisited city
                    nxt = mask | (1 << u)
                    if cur + w[v][u] < dp[nxt][u]:
                        dp[nxt][u] = cur + w[v][u]
    full = (1 << n) - 1
    return min(dp[full][v] + w[v][0] for v in range(n))   # close the cycle
```

The iteration order deserves a sentence in an interview. Adding a bit to a mask always makes a larger integer, so plain numeric order processes every subset before any of its supersets. That order is a valid topological order of the DP's dependencies, and no other ordering logic is needed. The cost is `O(2^n · n²)`: for `n = 16` that is about 16.8 million transitions, which is feasible, while `n = 25` is not. The same state `(mask, node)` in a BFS solves "shortest path visiting every node" on unweighted graphs. The [interval and tree DP lesson](/learn/algorithms/dynamic-programming/interval-and-tree-dp) introduces this family.

### Sum over subsets

Sometimes every mask needs an aggregate over all of its submasks: `f[mask] = Σ a[sub]` for `sub ⊆ mask`. For example, "for each set of allowed letters, how many words use only those letters?" Submask enumeration costs `3^n`. The sum-over-subsets (SOS) DP costs `n · 2^n`:

```python
def sum_over_subsets(a, n):
    f = a[:]                                  # len(a) == 1 << n
    for i in range(n):                        # let bit i vary
        for mask in range(1 << n):
            if mask >> i & 1:
                f[mask] += f[mask ^ (1 << i)]
    return f
```

With `n = 2` and `a = [1, 2, 4, 8]` (indexed by mask `00, 01, 10, 11`):

| pass | `f[00]` | `f[01]` | `f[10]` | `f[11]` |
|---|---|---|---|---|
| start | 1 | 2 | 4 | 8 |
| after bit 0 | 1 | 2 + 1 = 3 | 4 | 8 + 4 = 12 |
| after bit 1 | 1 | 3 | 4 + 1 = 5 | 12 + 3 = 15 |

After bit 0, `f[11]` is `a[11] + a[10]`: the submasks of `11` that agree with it on bit 1. After bit 1 it is `12 + f[01] = a[11] + a[10] + a[01] + a[00] = 15`, all four submasks. The invariant: after processing bits `0..i`, `f[mask]` sums over all submasks that *agree with `mask` on every bit above `i`*. Each pass frees one more bit, and after `n` passes every submask is included exactly once. For `n = 20` that is about 21 million loop steps instead of 3.5 billion. The complementary question, "how many pairs have `a & b == 0`?", runs SOS on the complement of each value.

## Lowbit and the Fenwick tree

In two's complement, `-x = ~x + 1`. `~x` flips every bit, and the `+1` carries through the trailing 1s of `~x`, which are the trailing 0s of `x`, and stops at the position of `x`'s lowest set bit. So `x & -x` is exactly that lowest set bit, often called **lowbit**. On `x = 12`, in eight-bit two's complement:

| expression | bits | value |
|---|---|---|
| `x` | `0000 1100` | 12 |
| `~x` | `1111 0011` | −13 |
| `~x + 1 = -x` | `1111 0100` | −12 |
| `x & -x` | `0000 0100` | 4 |
| `x & (x − 1)` | `0000 1000` | 8 |

The `+1` turned the two trailing ones of `~x` into zeros and stopped at position 2, so `-x` agrees with `x` at that position and nowhere below it; every position above it is complemented, so the AND clears it. `x & (x − 1)` is the complementary operation: it removes that bit and leaves the rest.

A [Fenwick tree](/learn/advanced-data-structures/range-queries/fenwick-trees) is built on this. Node `i` stores the sum of the range `(i - lowbit(i), i]`. A prefix query starts at `i` and repeatedly subtracts the lowbit:

```python
def prefix_sum(tree, i):          # sum of a[1..i]; tree is 1-indexed
    s = 0
    while i > 0:
        s += tree[i]
        i -= i & -i               # drop the lowest set bit
    return s
```

For `i = 13 = 1101`, the query visits node 13, covering `(12, 13]`, then node 12 = `1100`, covering `(8, 12]`, then node 8 = `1000`, covering `(0, 8]`. That is three nodes for three set bits, and never more than `log₂ n`. Subtracting the lowbit is the same operation as `x & (x - 1)`, so the query path is exactly the bit-counting walk:

```viz
{"type": "bits", "algorithm": "count-bits", "values": [13], "title": "The Fenwick query path for index 13", "caption": "Each step clears the lowest set bit: 1101 (13), 1100 (12), 1000 (8), 0. Those are the three tree nodes whose ranges tile [1, 13]."}
```

Updates walk the other way, `i += i & -i`, climbing to every node whose range contains `i`.

## Gray codes: one bit at a time

The reflected binary Gray code orders all `n`-bit values so that neighbours differ in exactly one bit. For three bits it is `000, 001, 011, 010, 110, 111, 101, 100`. The `i`-th code is `g(i) = i ^ (i >> 1)`:

```viz
{"type": "bits", "algorithm": "and-or-xor", "a": 6, "b": 3, "title": "g(6) = 6 XOR (6 >> 1)", "caption": "6 is 110 and 6 >> 1 is 011; their XOR is 101 (5), the seventh Gray code. g(5) is 111, so exactly one bit changed."}
```

The whole three-bit sequence, with the bit that flipped on each step:

| `i` | `i` in binary | `i >> 1` | `g(i) = i ^ (i >> 1)` | flipped bit | trailing zeros of `i` |
|---|---|---|---|---|---|
| 0 | `000` | `000` | `000` | | |
| 1 | `001` | `000` | `001` | 0 | 0 |
| 2 | `010` | `001` | `011` | 1 | 1 |
| 3 | `011` | `001` | `010` | 0 | 0 |
| 4 | `100` | `010` | `110` | 2 | 2 |
| 5 | `101` | `010` | `111` | 0 | 0 |
| 6 | `110` | `011` | `101` | 1 | 1 |
| 7 | `111` | `011` | `100` | 0 | 0 |

The last two columns are always equal, which is the claim proved next.

**Why exactly one bit changes.** Let `t` be the number of trailing zeros of `i`. Going from `i - 1` to `i` flips bits `0..t`, so `i ^ (i - 1)` is a block of `t + 1` ones. Then

$$g(i) \oplus g(i-1) = (i \oplus (i-1)) \oplus \big((i \oplus (i-1)) \gg 1\big) = (2^{t+1}-1) \oplus (2^{t}-1) = 2^{t}$$

So exactly one bit flips, and it is bit `t`, the position of `i`'s lowest set bit. The recursive description gives the same sequence: `G(n)` is `G(n-1)` followed by `G(n-1)` in reverse with bit `n - 1` set. Each half changes one bit at a time, and at the seam the last code and its mirror image differ only in the new top bit.

Engineers use Gray codes in rotary encoders, and for counters read across clock domains: only one bit changes per step, so a read taken mid-transition is off by at most one step, never garbage. In algorithms, the one-bit property lets you **enumerate all subsets while changing one element per step**, so a running aggregate costs `O(1)` per subset instead of `O(n)`:

```python
def all_subset_sums_gray(nums):
    s, out = 0, [0]
    for i in range(1, 1 << len(nums)):
        t = (i & -i).bit_length() - 1        # the bit that flips between g(i-1) and g(i)
        if (i ^ (i >> 1)) >> t & 1:          # now set: element t joins the subset
            s += nums[t]
        else:                                # now clear: element t leaves
            s -= nums[t]
        out.append(s)
    return out
```

It is what lets a compiled brute force get through all `2^30` subsets of 30 items in seconds: one add or subtract per subset instead of thirty.

## Bitsets: 64 booleans per instruction

Back to the opening problem:

```python
def can_partition(nums):
    total = sum(nums)
    if total % 2:
        return False
    reach = 1                              # bit s is set  <=>  some subset sums to s
    for x in nums:
        reach |= reach << x                # every reachable s also reaches s + x
    return reach >> (total // 2) & 1 == 1
```

`reach << x` is the boolean DP's "`dp[s - x]` is true" for every `s` at once, and `|=` is the "or". In JavaScript the same code works with `BigInt` (`reach |= reach << BigInt(x)`). In C++ you would use `std::bitset<N>`.

Be honest about what this buys. Bitsets are a **constant factor** of the word size `w` (64, or more with SIMD), not an asymptotic improvement: `O(n · S)` becomes `O(n · S / w)`. But dividing by 64 turns 10¹⁰ operations into about 1.6 × 10⁸, which is the difference between impossible and a second. Other places where the factor decides feasibility:

- **Triangle counting in dense graphs.** Store each adjacency row as a bitset. For each edge `(u, v)`, `popcount(adj[u] & adj[v])` counts their common neighbours. The total counts every triangle three times, in `O(m · n / w)`.
- **Reachability in a DAG.** Process nodes in reverse topological order with `reach[v] = (1 << v) | OR of reach[child]`. All-pairs reachability then costs `O(n · m / w)`.
- **Constraint tracking in backtracking**, shown next.

## Bits in backtracking: N-Queens with three masks

```python
def total_n_queens(n):
    full = (1 << n) - 1
    def place(cols, diag, anti):
        if cols == full:
            return 1                                   # a queen in every row
        count = 0
        free = full & ~(cols | diag | anti)            # columns safe in this row
        while free:
            bit = free & -free                         # try the lowest safe column
            free ^= bit
            count += place(cols | bit, (diag | bit) << 1 & full, (anti | bit) >> 1)
        return count
    return place(0, 0, 0)
```

`cols` marks attacked columns. `diag` marks squares attacked along one diagonal direction: a queen in column `c` attacks column `c + 1` in the next row, so the whole mask shifts left by one per row, and `& full` drops attacks that fall off the board. `anti` handles the other diagonal by shifting right. Finding the safe squares in a row is one expression, and trying them is a lowbit loop. `total_n_queens(8)` returns 92, and every safety check is a single AND instead of three set lookups. [N-Queens](/practice/n-queens) and [Sudoku Solver](/practice/sudoku-solver) both benefit: in Sudoku, keep one 9-bit mask per row, column and box. The candidates for a cell are `~(row | col | box) & 0x1FF`, and choosing the cell with the fewest candidates (the smallest popcount) prunes hard.

## Under the hood

**Popcount.** `int.bit_count()` (Python 3.10+) runs a C popcount over the int's 30-bit digits. With GCC or Clang that is `__builtin_popcount`, which becomes a single `POPCNT` only when the build targets a CPU that has it (CPython's [source](https://raw.githubusercontent.com/python/cpython/3.14/Include/internal/pycore_bitutils.h) notes it does no runtime CPUID check; a baseline x86-64 build gets a short bit-twiddling sequence) and `CNT` on 64-bit ARM. Either way it is a few instructions per digit. Before 3.10 the idiom was `bin(x).count("1")`, which builds a string of `O(bits)` characters first. C and C++ expose `__builtin_popcountll`, Java `Long.bitCount`, Rust `count_ones`. For arrays of words, SIMD popcount routines (the Harley–Seal and lookup-table methods) beat one `POPCNT` per word: [Muła, Kurz and Lemire](https://arxiv.org/abs/1611.07612) measured AVX2 versions at about twice the speed on recent Intel processors, and the factor depends on the CPU generation. JavaScript has no popcount at all, so use the `x &= x - 1` loop, which costs one iteration per set bit.

**Python integers are arrays of 30-bit digits.** `reach` grows to `total + 1` bits, at most 20,001 here, which is 667 digits, and `reach << x` allocates a new object and copies every digit with a shift and carry: one `O(digits)` C loop per item, which is why 200 shift-or steps on an integer of up to 20,000 bits take on the order of a millisecond, against a second for the `200 × 10,000` Python-level boolean DP. There is no in-place mutation; `reach |= reach << x` allocates twice per step. `~mask` on a Python int is `-mask - 1`, an infinitely sign-extended negative number, so complement within `n` bits with `full ^ mask` or `full & ~mask`.

**`std::bitset<N>` and friends.** A C++ `std::bitset<10001>` is 157 64-bit words; `reach |= reach << x` becomes a word-wise shift with carries and a word-wise OR, about 300 word operations per item, and `count()` uses hardware popcount. Java's `BitSet` grows dynamically and stores `long[]`; Rust has no standard bitset, and the `bitvec` and `fixedbitset` crates fill the gap.

**JavaScript's 32-bit operators.** `|`, `&`, `^`, `<<`, `>>` convert their operands to 32-bit signed integers and use only the low five bits of a shift count. So `1 << 31` is `-2147483648`, `1 << 32` is `1`, and `1 << 35` is `8`: element 35 silently aliases element 3. `x >>> 0` reinterprets as unsigned; `Math.clz32(x)` counts leading zeros, so the highest set bit is `31 - Math.clz32(x)`. Masks over more than about 30 elements need `BigInt` (`1n << 35n`) or two numbers. Java and C have the same sign-bit trap on `int`: `1 << 31` is negative and `1 << 32` is undefined behaviour in C.

**Iteration order for subset DP.** Numeric order is a topological order when each state feeds states with one more element. If your transitions push from a mask to a mask with an element *removed*, iterate in decreasing order instead.

## Quantified costs

- **Submask enumeration.** `3^n` pairs in total: `3^15 ≈ 1.4 × 10^7` (under a second in C, a few seconds in Python), `3^18 ≈ 3.9 × 10^8` (seconds in C, minutes in Python), `3^20 ≈ 3.5 × 10^9` (out of reach for a single-threaded interpreter). Sum over subsets replaces it with `n · 2^n`: `2.1 × 10^7` at `n = 20`.
- **Held–Karp.** `2^n · n²` transitions: `1.7 × 10^7` at `n = 16` (milliseconds in C, tens of seconds in Python), `2.1 × 10^10` at `n = 25` (minutes in C, and the `dp` table alone is `2^25 × 25 × 4` bytes ≈ 3.4 GB as `int32`).
- **Bitsets.** Dividing by the word size turns `10^10` boolean updates into `1.6 × 10^8` word operations, or `4 × 10^7` with 256-bit AVX2 registers.
- **DP table memory.** `dp[2^20][20]` is `2.1 × 10^7` cells: 168 MB as a flat 8-byte array, several times that as a Python list of lists of boxed values. Memoising with a dict keyed on `(mask, v)` is worse still, at about 100 bytes per entry.

## Failure modes

**Symptom: a JavaScript solution is correct up to 31 elements and wrong from 32, with no error.** Diagnosis: `1 << i` with `i ≥ 32` wraps the shift count, and `1 << 31` is negative, so masks alias and comparisons flip sign. Fix: `BigInt` for masks above 30 bits, or two 30-bit halves; in Java, use `long` and `1L << i`.

**Symptom: a Python complement produces a negative mask and every membership test afterwards is wrong.** Diagnosis: `~mask` is `-mask - 1`; the "complement within `n` bits" was never restricted to `n` bits. Fix: `full ^ mask` with `full = (1 << n) - 1`.

**Symptom: a subset DP returns garbage for some masks and correct values for others.** Diagnosis: the iteration order is not a topological order of the transitions; a removal-style transition (`dp[mask] ← dp[mask ^ bit]` where the smaller mask is written *after* the larger one) was iterated in increasing order. Fix: decide whether transitions add or remove elements, and iterate masks in increasing or decreasing order accordingly.

**Symptom: the process is killed for memory on `n = 22` even though the algorithm is `O(2^n · n²)` time and "should be fine".** Diagnosis: the state table is `2^22 × 22` entries, and as a dict of tuples it is gigabytes. Fix: a flat array of fixed-width integers (`array('i')`, NumPy, or a language with real arrays), and drop the `v` dimension when the problem does not need "current position".

**Symptom: a hot loop spends most of its time counting bits.** Diagnosis: `bin(x).count("1")` in the inner loop, or a hand-rolled loop in a compiled language without `__builtin_popcount`. Fix: `int.bit_count()`, the hardware instruction, or precomputed popcounts for 16-bit chunks.

**Symptom: the submask loop never terminates.** Diagnosis: the loop was written `while sub: …; sub = (sub - 1) & mask` and the zero submask was skipped, or the `if sub == 0: break` was placed before the yield, so the empty subset was dropped and, in a variant that adds a "handle zero" case afterwards, double-counted. Fix: use the yield-then-check shape shown above and test with `mask = 0`.

## Representing a set

| Representation | Membership | Iterate members | Memory | Size limit | Usable as a DP key |
|---|---|---|---|---|---|
| Bitmask in a machine word | 1 instruction | `O(\|S\|)` with lowbit | 8 bytes | 63–64 elements | Yes, as an integer index |
| Python `int` mask | `O(1)` for small masks | `O(\|S\|)` | 28 bytes + 4 per 30 bits | Unbounded | Yes, hashable |
| Python `set` | `O(1)` expected | `O(\|S\|)` | ~200 bytes + 100 per element | Unbounded | No; `frozenset` is, at a cost |
| `list[bool]` / `bytearray` | `O(1)` | `O(n)` scan | 8 bytes or 1 byte per slot | Unbounded | No |
| `std::bitset<N>` / `BitSet` | `O(1)` | `O(n / w)` scan | 1 bit per element | `N` fixed at compile time (C++) | Hashable via `to_ullong` for small `N` |

## Interviewer follow-ups

**"Enumerate every submask of every mask. What is the cost, and can you do better for sums?"** Model answer: `3^n` pairs, because each element is in neither, in the mask only, or in both; for sums over submasks, SOS DP does it in `n · 2^n`. Common wrong answer: `4^n` (all pairs of masks) or `2^n · 2^n / 2`.

**"Why is numeric order a valid processing order for `dp[mask | bit]` transitions?"** Model answer: adding a bit always increases the integer, so every predecessor of a state is a smaller number and has been processed. Common wrong answer: "because it is sorted by popcount", which it is not: `3 = 011` precedes `4 = 100`.

**"What would you use a Gray code for in software?"** Model answer: enumerating all subsets with one element changing per step, so a running aggregate updates in `O(1)`; the reason it works is that `g(i) ^ g(i − 1)` is exactly bit `trailing_zeros(i)`. Common wrong answer: "faster counting", which it is not; a Gray code is an ordering, not a cheaper increment.

**"Derive `x & -x`."** Model answer: `-x = ~x + 1`; the `+1` carries through the trailing ones of `~x` (the trailing zeros of `x`) and stops at `x`'s lowest set bit, which is therefore the only position where `x` and `-x` are both 1. Common wrong answer: quoting the identity without the carry argument, then failing on the follow-up "so what does `x & (x − 1)` do?".

**"Your bitmask has 40 elements and this is JavaScript."** Model answer: bitwise operators truncate to 32 bits, so use `BigInt` masks (slower, and every literal needs the `n` suffix) or split into two numbers of 20 bits each and test membership with `i < 20 ? lo >> i & 1 : hi >> (i - 20) & 1`. Common wrong answer: "numbers are 64-bit doubles, so 40 bits fit", which ignores what the operators do to them.

## What mid-level engineers get wrong

- **Treating bitsets as an asymptotic improvement.** They divide by the word size; the algorithm is still `O(n · S)`, and a problem with `S = 10^9` is still infeasible.
- **Using `1 << i` in JavaScript or Java `int` beyond bit 30.** Silent aliasing, no exception.
- **Complementing with `~` in Python** and then testing membership on a negative number.
- **Iterating masks in the wrong direction** for a removal-style transition, so some states read values that were not yet written.
- **Memoising subset DP in a dict keyed by tuples** and running out of memory at `n = 20`, when a flat array is an order of magnitude smaller.
- **Counting `4^n` for the submask double loop**, then rejecting an approach that is feasible, or accepting one that is not.

## Exercises

```exercise
id: gray-code-sequence
title: Reflected Gray code
prompt: |
  Return the reflected binary Gray code sequence for `n` bits as a list of
  integers: `G(0) = [0]`, and `G(n)` is `G(n-1)` followed by `G(n-1)` in
  reverse order with bit `n - 1` set on each value. For `n = 2` that is
  `[0, 1, 3, 2]`.

  You can build it by reflection, or find a closed form for the i-th
  element (consecutive values differ in exactly one bit).
languages: [python, javascript]
entry: gray_code
starter:
  python: |
    def gray_code(n):
        # your code here
        return [0]
  javascript: |
    function gray_code(n) {
      // your code here
      return [0];
    }
tests:
  - args: [2]
    expected: [0, 1, 3, 2]
  - args: [3]
    expected: [0, 1, 3, 2, 6, 7, 5, 4]
  - args: [0]
    expected: [0]
    label: zero bits, one code
  - args: [1]
    expected: [0, 1]
  - args: [4]
    expected: [0, 1, 3, 2, 6, 7, 5, 4, 12, 13, 15, 14, 10, 11, 9, 8]
    hidden: true
hints:
  - "Reflection: start from [0]; for each bit b, append the current list reversed with (1 << b) ORed into each value."
  - "Closed form: the i-th code is i ^ (i >> 1)."
```

```exercise
id: max-product-disjoint-words
title: Maximum product of two words with no shared letters
prompt: |
  Given a list of lowercase words, return the largest value of
  `len(a) * len(b)` over pairs of words `a` and `b` (different positions
  in the list) that share no letter. Return 0 if no such pair exists.

  Precompute a 26-bit mask per word (bit c set if letter c occurs). Two
  words share no letter exactly when their masks AND to 0, which makes
  each pair check O(1).
languages: [python, javascript]
entry: max_product_word_lengths
starter:
  python: |
    def max_product_word_lengths(words):
        # your code here
        return 0
  javascript: |
    function max_product_word_lengths(words) {
      // your code here
      return 0;
    }
tests:
  - args: [["abcw", "baz", "foo", "bar", "xtfn", "abcdef"]]
    expected: 16
  - args: [["a", "ab", "abc", "d", "cd", "bcd", "abcd"]]
    expected: 4
  - args: [["a", "aa", "aaa", "aaaa"]]
    expected: 0
    label: every pair shares a letter
  - args: [[]]
    expected: 0
    label: no words
  - args: [["abc"]]
    expected: 0
    label: one word, no pair
  - args: [["eae", "ea", "aaf", "bda", "fcf", "dc", "ac", "ce", "cefde", "dabae"]]
    expected: 15
    hidden: true
  - args: [["zz", "yy", "zy"]]
    expected: 4
    hidden: true
hints:
  - "mask |= 1 << (ord(ch) - ord('a')) for each character; in JavaScript use ch.charCodeAt(0) - 97."
  - "Words with the same mask only need the longest one kept, which shrinks the pair loop on repetitive input."
```

## Senior signals

- You treat integers as **sets** fluently: union, difference, subset tests and member iteration in `O(|S|)` with lowbit.
- You know the **submask loop** `(sub - 1) & mask`, why it visits every submask exactly once, and that doing it for all masks costs **`3^n`**, which is what decides whether a partition DP is feasible.
- You explain why **numeric order is a topological order** for subset DP, and you quote Held–Karp's `O(2^n · n²)` with the `n` where it stops being practical.
- You can derive **`x & -x`** from two's complement and connect it to the Fenwick tree's `O(log n)` walks.
- You prove the **Gray code** one-bit property, and use it to enumerate subsets with an `O(1)` update per step.
- You describe **bitsets** honestly, as a factor-of-`w` speed-up that often turns infeasible into fast, and you know JavaScript's 32-bit operator trap.
- You know what the machine does: `bit_count` is a C popcount per 30-bit digit (hardware `POPCNT` when the build targets it), a Python int is 30-bit digits so a big shift is `O(digits)` in C, and `~x` on an unbounded int is negative.
- You put memory on the table before time: `2^n × n` states as a flat array versus a dict, and the point at which the DP table, not the transitions, is what stops you.

## Check yourself

```quiz
- q: >-
    A DP iterates, for every mask of n = 18 elements, over every submask of that mask. Roughly how many (mask, submask) pairs is that?
  options: ["3^18, about 387 million", "4^18, about 69 billion", "18 * 2^18, about 4.7 million", "2^18, about 262 thousand"]
  answer: 0
  explanation: >-
    Each element is in neither set, in the mask only, or in both, so the number of pairs is 3^n. 4^n would count all ordered pairs of masks, including pairs where the second is not a submask. At 387 million simple steps it is feasible in a compiled language and slow in Python.
- q: >-
    Why is iterating masks in increasing numeric order valid for dp[mask | (1 << u)] transitions?
  options: ["Adding a bit always gives a larger integer, so all subsets come before supersets", "It is not valid; masks must be sorted by popcount first, or states are missed", "Numeric order is also popcount order, so smaller sets are always done first", "The transitions commute, so the masks can be processed in any order at all"]
  answer: 0
  explanation: >-
    A transition that adds an element moves from mask to a strictly larger number. So numeric order finishes every predecessor before its successors, which makes it a topological order of the DP. It is not popcount order (3 = 011 comes before 4 = 100), and it does not need to be: sorting by popcount also works, but it is unnecessary.
- q: >-
    Consecutive Gray codes g(i - 1) and g(i) differ in which bit?
  options: ["Always bit 0, the least significant bit of the code", "The lowest set bit of i, that is, bit trailing_zeros(i)", "The highest set bit of i, that is, bit floor(log₂ i)", "The lowest set bit of g(i), that is, bit trailing_zeros(g(i))"]
  answer: 1
  explanation: >-
    i ^ (i - 1) is a block of t + 1 ones, where t is the number of trailing zeros of i. XORing that block with itself shifted right by one leaves only bit t. That is why a Gray-code walk over subsets adds or removes element t at step i. The bit is determined by i, not by the code: from g(1) = 01 to g(2) = 11 bit 1 flips, although the lowest set bit of g(2) is bit 0.
- q: >-
    Replacing a boolean subset-sum DP with reach |= reach << x in C++ std::bitset changes the complexity from O(n * S) to (w is the machine word size):
  options: ["O(n · S / w)", "O(n + S / w)", "O(S / w)", "O(n log S)"]
  answer: 0
  explanation: >-
    Each shift and OR processes w bits per instruction, so the work is divided by the word size, but each of the n items still needs a shift over all S / w words, so the n stays a factor. It is a constant-factor gain, not an asymptotic one, but a factor of 64 is often the difference between timing out and passing.
- q: >-
    In JavaScript, you build a mask for 40 items with mask |= 1 << i. What happens for i = 35?
  options: ["It silently sets bit 3, because the shift count is taken mod 32", "It works, because JavaScript numbers are 64-bit floating-point values", "It produces Infinity, because 2^35 overflows a 32-bit integer", "It throws a RangeError, because the shift count is larger than 31"]
  answer: 0
  explanation: >-
    Bitwise operators convert to 32-bit integers and use only the low five bits of the shift count, so 1 << 35 is 1 << 3 and item 35 silently aliases item 3; nothing throws. Numbers are 64-bit floats, but that does not help once a bitwise operator has converted them. Use BigInt (1n << 35n) or split the mask into two numbers when you need more than about 30 bits.
- q: >-
    Sum-over-subsets DP on n = 2 with a = [1, 2, 4, 8] (indexed by mask 00, 01, 10, 11) has finished the pass for bit 0 only. What does f[11] hold, and why?
  options: ["12, the sum over submasks of 11 that agree with it on bit 1, namely a[11] + a[10]", "8, unchanged, because f[11] is only updated during the pass for the highest bit", "10, the sum a[11] + a[01], because the pass for bit 0 adds the submask with bit 0 cleared", "15, the sum over all four submasks, because one pass already reaches every submask"]
  answer: 0
  explanation: >-
    The pass for bit i adds f[mask ^ (1 << i)] into f[mask] for every mask with bit i set, so after bit 0, f[11] = a[11] + a[10] = 12: the submasks that differ from 11 only in bit 0. The invariant is that after processing bits 0..i, f[mask] sums over the submasks agreeing with mask on all higher bits. The pass for bit 1 then adds f[01] = 3, which already contains a[01] + a[00], giving 15, so every submask is included exactly once.
```

