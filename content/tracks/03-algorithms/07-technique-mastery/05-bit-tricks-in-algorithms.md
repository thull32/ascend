---
slug: bit-tricks-in-algorithms
title: "Bit tricks in algorithms: masks as sets, submask loops, Gray codes and bitsets"
description: Use integers as sets to enumerate subsets, submasks and fixed-size combinations, run DP over subsets, walk a Fenwick tree with lowbit, step through Gray codes one bit at a time, and get a 64x speed-up from bitsets.
minutes: 38
difficulty: hard
tags: [bit-manipulation, bitmask, bitmask-dp, bitset, gray-code, lowbit]
problems: [subsets, partition-equal-subset, n-queens, sudoku-solver, counting-bits, single-number]
---
[Partition Equal Subset Sum](/practice/partition-equal-subset) with 200 numbers, each at most 100, asks whether some subset reaches half the total. The textbook answer is a boolean DP over sums up to 10,000: 200 × 10,000 = 2 million cell updates, which takes on the order of a second in Python. The bitset answer keeps all 10,001 booleans as the bits of one integer and does `reach |= reach << x` for each number. That is 200 shift-and-OR operations, each running in C over a machine word at a time, and it finishes in milliseconds. The recurrence is the same and the answer is the same. The speed-up comes from the processor updating dozens of booleans in one instruction.

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

```text
1011 → 1010 → 1001 → 1000 → 0011 → 0010 → 0001 → 0000
```

That is eight submasks, 2³ for three set bits. The cost of running this loop for *every* mask is the number of pairs `(mask, sub)` with `sub ⊆ mask`. Each element is either in neither, in `mask` only, or in both, so there are **`3^n`** pairs. For `n = 15` that is about 14 million, which is fine. For `n = 20` it is 3.5 billion, which is not. Knowing that the total is `3^n` rather than `4^n` is what tells you whether "for every set, try every way to split it" is feasible.

**Subsets of exactly `k` elements** come from Gosper's hack, which computes the next larger integer with the same number of set bits:

```python
def next_same_popcount(x):
    c = x & -x                      # lowest set bit
    r = x + c                       # the lowest block of 1s carries up one place
    return (((r ^ x) >> 2) // c) | r   # the leftover 1s go back to the bottom
```

Starting from `00111` it produces `01011`, `01101`, `01110`, `10011`, and so on through all `C(5, 3) = 10` masks. Stop when the value reaches `1 << n`. Use it when `C(n, k)` is small but `2^n` is not, for example choosing 3 of 30 items.

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

The invariant: after processing bits `0..i`, `f[mask]` sums over all submasks that *agree with `mask` on every bit above `i`*. Each pass frees one more bit, and after `n` passes every submask is included exactly once. For `n = 20` that is about 21 million loop steps instead of 3.5 billion. The complementary question, "how many pairs have `a & b == 0`?", runs SOS on the complement of each value.

## Lowbit and the Fenwick tree

In two's complement, `-x = ~x + 1`. `~x` flips every bit, and the `+1` carries through the trailing 1s of `~x`, which are the trailing 0s of `x`, and stops at the position of `x`'s lowest set bit. So `x & -x` is exactly that lowest set bit, often called **lowbit**.

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

## Machine reality and language traps

- **Popcount is one instruction on modern CPUs** (`POPCNT` on x86, `CNT` on ARM). Python 3.10+ has `int.bit_count()`; before that, `bin(x).count("1")`. JavaScript has no popcount, so use the `x &= x - 1` loop. `Math.clz32(x)` counts leading zeros, so the highest set bit is `31 - Math.clz32(x)`.
- **JavaScript bitwise operators work on 32-bit signed integers.** `1 << 31` is `-2147483648`, `1 << 32` is `1` (the shift count is taken mod 32), and `x >>> 0` reinterprets as unsigned. Masks over more than 30 or so elements need `BigInt` or two numbers.
- **Python integers are unbounded** and behave like infinitely sign-extended two's complement: `x & -x` works, but `~mask` is negative. When you complement within `n` bits, AND with `full` (or XOR with it).
- **Iteration order matters for subset DP.** Numeric order is a topological order when each state feeds states with one more element. If your transitions push from a mask to a mask with an element removed, iterate in decreasing order instead.

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

## Check yourself

```quiz
- q: >-
    A DP iterates, for every mask of n = 18 elements, over every submask of that mask. Roughly how many (mask, submask) pairs is that?
  options: ["4^18, about 69 billion", "18 * 2^18, about 4.7 million", "2^18, about 262 thousand", "3^18, about 387 million"]
  answer: 3
  explanation: >-
    Each element is in neither set, in the mask only, or in both, so the number of pairs is 3^n. 4^n would count all ordered pairs of masks, including pairs where the second is not a submask. At 387 million simple steps it is feasible in a compiled language and slow in Python.
- q: >-
    Why is iterating masks in increasing numeric order valid for dp[mask | (1 << u)] transitions?
  options: ["Adding a bit always gives a larger integer, so all subsets come before supersets", "Numeric order is also popcount order, so smaller sets are always done first", "The transitions commute, so the masks can be processed in any order at all", "It is not valid; masks must be sorted by popcount first, or states are missed"]
  answer: 0
  explanation: >-
    A transition that adds an element moves from mask to a strictly larger number. So numeric order finishes every predecessor before its successors, which makes it a topological order of the DP. It is not popcount order (3 = 011 comes before 4 = 100), and it does not need to be: sorting by popcount also works, but it is unnecessary.
- q: >-
    Consecutive Gray codes g(i - 1) and g(i) differ in which bit?
  options: ["Always bit 0, the least significant bit of the code", "The lowest set bit of g(i), that is, bit trailing_zeros(g(i))", "The highest set bit of i, that is, bit floor(log₂ i)", "The lowest set bit of i, that is, bit trailing_zeros(i)"]
  answer: 3
  explanation: >-
    i ^ (i - 1) is a block of t + 1 ones, where t is the number of trailing zeros of i. XORing that block with itself shifted right by one leaves only bit t. That is why a Gray-code walk over subsets adds or removes element t at step i. The bit is determined by i, not by the code: from g(1) = 01 to g(2) = 11 bit 1 flips, although the lowest set bit of g(2) is bit 0.
- q: >-
    Replacing a boolean subset-sum DP with reach |= reach << x in C++ std::bitset changes the complexity from O(n * S) to (w is the machine word size):
  options: ["O(S / w)", "O(n · S / w)", "O(n log S)", "O(n + S / w)"]
  answer: 1
  explanation: >-
    Each shift and OR processes w bits per instruction, so the work is divided by the word size, but each of the n items still needs a shift over all S / w words, so the n stays a factor. It is a constant-factor gain, not an asymptotic one, but a factor of 64 is often the difference between timing out and passing.
- q: >-
    In JavaScript, you build a mask for 40 items with mask |= 1 << i. What happens for i = 35?
  options: ["It throws a RangeError, because the shift count is larger than 31", "It silently sets bit 3, because the shift count is taken mod 32", "It works, because JavaScript numbers are 64-bit floating-point values", "It produces Infinity, because 2^35 overflows a 32-bit integer"]
  answer: 1
  explanation: >-
    Bitwise operators convert to 32-bit integers and use only the low five bits of the shift count, so 1 << 35 is 1 << 3 and item 35 silently aliases item 3; nothing throws. Numbers are 64-bit floats, but that does not help once a bitwise operator has converted them. Use BigInt (1n << 35n) or split the mask into two numbers when you need more than about 30 bits.
```
