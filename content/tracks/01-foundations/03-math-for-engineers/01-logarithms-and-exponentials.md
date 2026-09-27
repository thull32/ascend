---
slug: logarithms-and-exponentials
title: "Logarithms and exponentials: halving, doubling and the powers of two"
description: What log n actually counts, why base does not matter in Big-O, why O(log n) is effectively free, and the dozen powers of two that let you size systems in your head.
minutes: 40
difficulty: intro
tags: [math, logarithms, powers-of-two, complexity, estimation]
problems: [pow-x-n, binary-search-basic, sqrt-x]
---
A colleague says the new index lookup is "O(log n), so it doesn't matter how big the table gets". A product manager asks how many users a 32-bit ID space supports. An interviewer asks whether trying every subset of 40 items is feasible. All three questions have the same shape: how fast does something grow when you keep doubling, and how many times can you halve before you hit one?

That shape is the logarithm. Engineers who are fluent with it size caches, pick algorithms and reject infeasible brute force in seconds. Engineers who are not reach for a calculator, or worse, guess. This lesson makes the logarithm mechanical rather than mysterious, and then hands you the powers of two you need to keep in your head.

## What a logarithm counts

$\log_2 n$ answers one question: *how many times do you have to double 1 to reach n?* Equivalently, *how many times can you halve n before you get down to 1?*

Take $n = 1024$. Halve it: 512, 256, 128, 64, 32, 16, 8, 4, 2, 1. Ten halvings, so $\log_2 1024 = 10$. Nothing about that requires calculus; it is just counting.

The relationship with exponentiation is exact:

$$2^{10} = 1024 \quad\Longleftrightarrow\quad \log_2 1024 = 10$$

For an $n$ that is not a power of two, the logarithm is not an integer. $\log_2 1000 \approx 9.97$: you can halve 1000 nine times and still be above 1 (1000 → 500 → 250 → 125 → 62.5 → … → 1.95), and the tenth halving takes you below it. In code you almost always want the integer version: the number of whole halvings, which is $\lfloor \log_2 n \rfloor$, or the number of bits needed to write $n$ in binary, which is $\lfloor \log_2 n \rfloor + 1$.

```python
def floor_log2(n: int) -> int:
    """Largest k with 2**k <= n, for n >= 1. No floats."""
    k = 0
    while n > 1:
        n //= 2
        k += 1
    return k

floor_log2(1)         # 0
floor_log2(1000)      # 9
floor_log2(1024)      # 10
(1000).bit_length()   # 10  -> floor_log2(1000) + 1
```

The loop form is worth internalising because the loop *is* the definition: every algorithm that halves its problem each step runs for exactly this many steps.

Watch it happen. Binary search halves the candidate range every comparison, so on 8 elements it needs at most $\log_2 8 = 3$ comparisons:

```viz
{"type": "array", "algorithm": "binary-search", "values": [2, 5, 8, 12, 16, 23, 38, 56], "target": 23, "title": "Three halvings", "caption": "Eight candidates become four, then two, then one. The step count is log2 of the array length, not the array length."}
```

## The rules you use daily

There are only four log rules that show up in engineering, and each corresponds to a fact about counting halvings.

| Rule | Formula | Why it is true |
|---|---|---|
| Product | $\log(ab) = \log a + \log b$ | Doubling $a$ times then $b$ times |
| Quotient | $\log(a/b) = \log a - \log b$ | Undo $b$ of the doublings |
| Power | $\log(a^k) = k \log a$ | $a^k$ is $a$ multiplied $k$ times |
| Change of base | $\log_b n = \dfrac{\log_c n}{\log_c b}$ | Halvings and "thirdings" differ by a fixed ratio |

The power rule is why $\log_2(n^2) = 2\log_2 n$, so "log of a polynomial" is still just a constant times $\log n$. An algorithm that is $O(\log(n^3))$ is $O(\log n)$.

The change-of-base rule is why **the base does not matter inside Big-O**. $\log_2 n$ and $\log_{10} n$ differ by the constant factor $\log_2 10 \approx 3.32$, always, for every $n$. Big-O drops constant factors, so $O(\log_2 n)$, $O(\log_{10} n)$ and $O(\ln n)$ are the same class, and people just write $O(\log n)$. Where the base *does* matter is in an actual step count: a B-tree with fan-out 256 has height $\log_{256} n = \log_2 n / 8$, which is the difference between 3 disk reads and 24.

The product rule is the one you use for factorials and for multiplying probabilities. $\log(n!) = \log 1 + \log 2 + \cdots + \log n$, which is $\Theta(n \log n)$ (Stirling's approximation). That single fact is the heart of the proof that comparison sorting needs $\Omega(n \log n)$ comparisons: you must distinguish $n!$ orderings, each comparison gives one bit, so you need $\log_2(n!) \approx n \log_2 n$ bits.

## Why log n is "free"

The most important table in this lesson:

| $n$ | $\log_2 n$ | $n \log_2 n$ | $n^2$ |
|---|---|---|---|
| 10 | 3.3 | 33 | 100 |
| 1,000 | 10 | 10,000 | 10⁶ |
| 10⁶ | 20 | 2 × 10⁷ | 10¹² |
| 10⁹ | 30 | 3 × 10¹⁰ | 10¹⁸ |
| 10¹² | 40 | 4 × 10¹³ | 10²⁴ |
| 2⁶⁴ ≈ 1.8 × 10¹⁹ | 64 | ≈ 10²¹ | ≈ 3 × 10³⁸ |

Read the second column. Going from a thousand items to a trillion items, a million-fold increase, moves $\log_2 n$ from 10 to 40. Any quantity you could ever fit in a 64-bit integer has a log of at most 64. So an $O(\log n)$ operation costs "a few dozen steps" no matter what $n$ is, which for practical purposes is a constant. This is why engineers say a balanced tree lookup or a binary search is "basically free": not because it is $O(1)$, but because 64 is a small number.

The third column is why $O(n \log n)$ is treated as "almost linear". Sorting a million items costs about 20 million comparisons, not a trillion. When you have a choice between an $O(n \log n)$ approach with simple code and an $O(n)$ approach with fiddly code, the $\log n$ factor is usually worth less than the bug you avoid. The [benchmarking lesson](/learn/foundations/complexity/benchmarking-reality) shows real cases where the "slower" class wins outright.

The fourth column is the warning. $n^2$ at a billion is $10^{18}$; at roughly $10^9$ simple operations per second per core, that is thirty years. Quadratic is where "just loop over it" stops being an option.

### A rule of thumb for feasibility

An interview or a capacity estimate often reduces to "will this finish?". A modern core does on the order of $10^8$ to $10^9$ simple operations per second. So:

- $n \log n$ with $n = 10^7$: about $2.3 \times 10^8$ operations, well under a second.
- $n^2$ with $n = 10^5$: $10^{10}$, tens of seconds. Too slow for an interview constraint of $10^5$.
- $n^2$ with $n = 5{,}000$: $2.5 \times 10^7$, fine.
- $2^n$ with $n = 25$: $3.4 \times 10^7$, fine. With $n = 40$: $1.1 \times 10^{12}$, hours. See the section on exponentials.

When an interviewer gives you $n \le 10^5$, they are telling you $n^2$ will not pass and $n \log n$ will. Learn to decode the constraint.

## The powers of two you must know

Every capacity estimate in your career is a power of two dressed up. Memorise these; you will use them weekly.

| Power | Exact | Approximate | Where you meet it |
|---|---|---|---|
| $2^8$ | 256 | | Byte values, one octet of an IPv4 address |
| $2^{10}$ | 1,024 | ≈ 10³ (1 Ki) | The base unit of every size prefix |
| $2^{12}$ | 4,096 | 4 Ki | The standard virtual-memory page size |
| $2^{16}$ | 65,536 | 64 Ki | TCP/UDP port numbers, `u16`, UTF-16 code units |
| $2^{20}$ | 1,048,576 | ≈ 10⁶ (1 Mi) | A mebibyte; 1 M entries |
| $2^{24}$ | 16,777,216 | ≈ 1.7 × 10⁷ | 24-bit colour; largest exact integer in a `float32` |
| $2^{30}$ | 1,073,741,824 | ≈ 10⁹ (1 Gi) | A gibibyte; a billion operations |
| $2^{31}$ | 2,147,483,648 | ≈ 2.1 × 10⁹ | `INT_MAX + 1`; the 2038 problem |
| $2^{32}$ | 4,294,967,296 | ≈ 4.3 × 10⁹ | IPv4 address space, `u32`, a 4-byte hash |
| $2^{40}$ | ≈ 1.1 × 10¹² | 1 Ti | A tebibyte |
| $2^{53}$ | 9,007,199,254,740,992 | ≈ 9 × 10¹⁵ | Largest integer a `float64` (and therefore JavaScript `Number`) represents exactly |
| $2^{64}$ | ≈ 1.8 × 10¹⁹ | | `u64`; a 64-bit hash or ID space |
| $2^{128}$ | ≈ 3.4 × 10³⁸ | | UUIDs, IPv6 |

Two conversions make the table usable without a calculator:

1. **$2^{10} \approx 10^3$.** So $2^{30} \approx 10^9$, $2^{40} \approx 10^{12}$, and in general $2^{10k} \approx 10^{3k}$. The error compounds (2.4% per step), so $2^{60}$ is $1.15 \times 10^{18}$ rather than $10^{18}$, but for estimates that is fine.
2. **Split the exponent.** $2^{27} = 2^{20} \cdot 2^7 = 1\text{M} \times 128 \approx 134$ million. $2^{35} = 2^{30} \cdot 2^5 \approx 32$ billion.

A worked capacity question: "We assign each event a random 32-bit ID. Is that enough for 50,000 events per second?" $2^{32} \approx 4.3 \times 10^9$, and at 50,000 per second you generate $4.3 \times 10^9$ IDs in about 86,000 seconds, one day. The space is exhausted in a day, and (as the [probability lesson](/learn/foundations/math-for-engineers/probability-for-engineers) shows) you get your first *collision* after only about 77,000 IDs, roughly two seconds in. Use 64 bits, or 128.

## Exponentials: the other direction

If $\log n$ is the friendly function, $2^n$ is its hostile twin. Each additional item *doubles* the work. Places where $2^n$ shows up:

- **Every subset** of $n$ items: $2^n$ of them, because each item is in or out.
- **Every bit string** of length $n$: $2^n$.
- **Naive recursion without memoisation** for Fibonacci-like problems: about $2^n$ calls (actually $\phi^n \approx 1.618^n$, but exponential all the same).
- **Retry storms**: a request that fans out to 2 services, each fanning out to 2, for $d$ levels, makes $2^d$ calls.

The reason exponentials feel abstract is that they start slowly. $2^{10}$ is a thousand, unremarkable. $2^{20}$ is a million, a lot but fine. $2^{30}$ is a billion, roughly one second of work. $2^{40}$ is a trillion, twenty minutes at best. $2^{50}$ is two weeks. Each +10 in the exponent multiplies the time by a thousand. So the answer to "can I enumerate all subsets of 40 items?" is no, but for 25 items it is a routine technique, and the [meet-in-the-middle lesson](/learn/algorithms/technique-mastery/meet-in-the-middle-and-randomisation) shows how to turn a $2^{40}$ search into two $2^{20}$ ones.

Factorials are worse still. $n!$ counts orderings, and:

| $n$ | $n!$ |
|---|---|
| 10 | 3,628,800 |
| 12 | 4.8 × 10⁸ (about the last feasible value for brute force) |
| 13 | 6.2 × 10⁹ |
| 20 | 2.4 × 10¹⁸ (barely fits in a `u64`) |
| 21 | overflows `u64` |

When a problem says "try every ordering" and $n$ can be 15, an interviewer expects you to notice that $15! \approx 1.3 \times 10^{12}$ and find structure that prunes the search.

## Exponentials you actually want: doubling

Not every exponential is a cost. The same doubling that makes brute force infeasible is what makes **dynamic arrays** and **exponential backoff** work.

A dynamic array that grows by doubling copies its contents at sizes 1, 2, 4, 8, …, $2^k$. The total copied while reaching $n$ elements is $1 + 2 + 4 + \cdots + n < 2n$, because a geometric series is dominated by its last term. That is the entire reason `append` is amortised $O(1)$; the [amortised analysis lesson](/learn/foundations/complexity/amortized-analysis) makes it rigorous. If the array instead grew by a fixed 100 slots at a time, reaching $n$ would copy $100 + 200 + \cdots + n \approx n^2 / 200$ elements: quadratic.

Exponential backoff uses doubling in time: retry after 1 s, 2 s, 4 s, 8 s. After $k$ retries you have waited about $2^k$ seconds total, so ten retries span about seventeen minutes and the retry rate against a struggling dependency halves each round. A linear backoff (1 s, 2 s, 3 s, …) takes $k^2/2$ seconds to reach the same total but never reduces the hammering rate below $1/k$.

The general principle: **a geometric series sums to a constant multiple of its largest term**. $1 + 1/2 + 1/4 + \cdots = 2$. $1 + 2 + 4 + \cdots + 2^k < 2^{k+1}$. Whenever you see work that halves or doubles per level, the total is proportional to the biggest level, not to the number of levels. This is the fact behind the [master theorem](/learn/foundations/complexity/recurrences-and-master-theorem).

## Reading logs off code

Three code shapes produce a logarithm.

```python
# 1. A loop whose control variable halves or doubles: O(log n) iterations
i = n
while i > 1:
    i //= 2

i = 1
while i < n:
    i *= 2

# 2. A recursion that discards a constant fraction each call: O(log n) depth
def search(lo, hi):
    if lo > hi: return -1
    mid = (lo + hi) // 2
    ...
    return search(lo, mid - 1)  # or search(mid + 1, hi)

# 3. A balanced tree of n nodes: O(log n) height, so O(log n) per root-to-leaf walk
```

And one shape that is often misread. This is $O(n \log n)$, not $O(n^2)$, because the inner loop's work shrinks as a geometric series in $j$'s doubling:

```python
for i in range(n):        # n times
    j = 1
    while j < n:          # log n times
        j *= 2
```

Whereas this harmonic-series shape is also $O(n \log n)$, for a less obvious reason:

```python
for i in range(1, n + 1):
    for j in range(0, n, i):   # n/i iterations
        ...
```

Total work is $n/1 + n/2 + n/3 + \cdots + n/n = n \cdot H_n \approx n \ln n$. The harmonic number $H_n$ grows like $\ln n$, which is why "for each $i$, step through multiples of $i$" (the sieve of Eratosthenes, divisor enumeration) is $O(n \log n)$ and not $O(n^2)$.

## Logs in the wild: scales and doubling times

Beyond complexity, a logarithmic mental model helps with any quantity spanning orders of magnitude.

**Latency numbers** are best held on a log scale: an L1 cache hit is about 1 ns, main memory about 100 ns, an SSD read about 100 µs, a cross-region round trip about 100 ms. Each step is two orders of magnitude, so "the database call is 10⁵ times slower than the cache hit" is the fact to reason with, not the absolute numbers.

**Doubling time.** Something growing $r\%$ per period doubles in about $70/r$ periods (because $\ln 2 \approx 0.693$). Traffic growing 10% month over month doubles every seven months and grows about $2^{12/7} \approx 3.3\times$ a year. If you provision for 2× headroom and growth is 10% a month, you will re-provision in seven months.

**Logarithmic buckets.** Histograms of latency, sizes or counts use exponentially spaced buckets (1, 2, 4, 8 ms …) because the interesting variation is relative, not absolute. Percentile estimators like HDR histograms and DDSketch are built on this idea.

**Integer log in production code.** Python: `n.bit_length() - 1`. JavaScript: `31 - Math.clz32(n)` for 32-bit values, and a loop otherwise; do not trust `Math.floor(Math.log2(n))` at exact powers of two on every engine, because floating-point rounding can put `Math.log2(2**k)` a hair under $k$. Rust: `n.ilog2()` or `63 - n.leading_zeros()`.

## Exercises

```exercise
id: floor-log2
title: Integer log base 2 without floats
prompt: |
  Return $\lfloor \log_2 n \rfloor$ for an integer `n >= 1`: the largest `k`
  such that `2**k <= n`. Do not use floating-point logarithms; halving in a
  loop or counting bits is exact, `Math.log2` is not always.
languages: [python, javascript]
entry: floor_log2
starter:
  python: |
    def floor_log2(n):
        # your code here
        return 0
  javascript: |
    function floor_log2(n) {
      // your code here
      return 0;
    }
tests:
  - args: [1]
    expected: 0
    label: log2(1) is 0
  - args: [2]
    expected: 1
  - args: [3]
    expected: 1
    label: not a power of two, round down
  - args: [1024]
    expected: 10
  - args: [1023]
    expected: 9
  - args: [1000000]
    expected: 19
  - args: [4294967296]
    expected: 32
    hidden: true
    label: beyond 32 bits (JS bitwise operators would truncate)
hints:
  - "Count how many times you can integer-divide n by 2 before it drops to 1."
  - "In JavaScript use Math.floor(n / 2), not n >> 1, so values above 2^31 work."
```

```exercise
id: next-power-of-two
title: Round up to a power of two
prompt: |
  Return the smallest power of two that is greater than or equal to `n`
  (for `n >= 1`). This is what a dynamic array or hash table does when it
  picks a capacity: `next_power_of_two(1000)` is `1024`.
languages: [python, javascript]
entry: next_power_of_two
starter:
  python: |
    def next_power_of_two(n):
        # your code here
        return 1
  javascript: |
    function next_power_of_two(n) {
      // your code here
      return 1;
    }
tests:
  - args: [1]
    expected: 1
    label: 1 is 2^0
  - args: [5]
    expected: 8
  - args: [8]
    expected: 8
    label: already a power of two
  - args: [1000]
    expected: 1024
  - args: [1025]
    expected: 2048
  - args: [3000000000]
    expected: 4294967296
    hidden: true
    label: above 2^31
hints:
  - "Start at p = 1 and double until p >= n. The loop runs at most about 40 times for any test."
```

## Senior signals

- You decode constraints: "$n \le 10^5$" means quadratic is out and $n \log n$ is expected; "$n \le 20$" means $2^n$ is intended.
- You state that the base of a logarithm is a constant factor and therefore irrelevant to Big-O, but you also know that base 256 vs base 2 is the difference between 3 and 24 disk reads in a B-tree.
- You can say why $O(\log n)$ is "practically constant": anything in a 64-bit integer has a log of at most 64.
- You do capacity arithmetic from $2^{10} \approx 10^3$ without a calculator, and you know that 32-bit IDs run out in a day at 50k/s and collide within seconds.
- You recognise the geometric-series argument, "the total is a constant times the largest term", as the reason doubling arrays are amortised $O(1)$ and why exponential backoff halves load each round.
- You use `bit_length` / `clz` / `ilog2` for integer logs and know that the floating-point version is not exact at powers of two.

## Check yourself

```quiz
- q: >-
    A balanced binary search tree holds 2^40 keys (about a trillion). About how many node visits does a lookup take?
  options: ["About 2^20", "About 40", "About 1,000", "About a million"]
  answer: 1
  explanation: >-
    A balanced tree's height is log2 of its size, so 40 visits. This is the sense in which O(log n) is "free": a trillion keys cost forty steps. The tempting answers scale with n itself, which is what the logarithm avoids.
- q: >-
    Why does Big-O notation write O(log n) without specifying the base?
  options: ["Because asymptotic analysis always uses the natural log e", "Because the base changes the space cost, not the time", "Because any two bases differ only by a constant factor", "Because computers use base 2, so it is always implied"]
  answer: 2
  explanation: >-
    The change-of-base rule gives log_a n = log_b n / log_b a, and 1/log_b a is a constant independent of n, which Big-O ignores. Base 2 is a convention for step counts, not a requirement; the base matters again only when you want an actual number, such as the height of a B-tree.
- q: >-
    A brute-force solution tries every subset of an input of size n. For which n does it stop being feasible (about a second of CPU at ~10^9 simple operations per second)?
  options: ["Around n = 10", "Around n = 30", "Around n = 100", "Around n = 1,000"]
  answer: 1
  explanation: >-
    There are 2^n subsets and 2^30 is about a billion, so n around 30 is the edge of one second; n = 40 is a thousand times worse (twenty minutes). n = 10 is trivial (1,024 subsets), and 100 or 1,000 are astronomically out of reach.
- q: >-
    A dynamic array grows by doubling. After appending n elements one at a time, roughly how many element copies have been performed in total by all the resizes?
  options: ["Exactly n", "About n log n", "About n^2 / 2", "Less than 2n"]
  answer: 3
  explanation: >-
    Resizes copy 1 + 2 + 4 + ... + (largest size <= n) elements. A geometric series is bounded by twice its largest term, so the total is under 2n. That constant-times-largest-term fact is what makes append amortised O(1); a fixed-increment growth policy would give the quadratic answer.
- q: >-
    You generate random 32-bit identifiers at 50,000 per second. Which statement is correct?
  options: ["The space lasts about a year at that rate, so it is safe", "It is safe: 2^32 is about 4 trillion, decades of headroom", "The space lasts a day, and collisions start within seconds", "No collision is possible until about half the space is used"]
  answer: 2
  explanation: >-
    2^32 is about 4.3 billion (not trillion), so at 50k/s the space is exhausted in roughly 86,000 seconds, a day. Random IDs collide long before the space fills: the birthday bound puts the first expected collision near 1.18 * sqrt(2^32), about 77,000 IDs, under two seconds of generation. The "half full" intuition is exactly what the birthday bound refutes.
- q: >-
    The code `for i in range(1, n+1): for j in range(0, n, i): work()` runs `work()` how many times, asymptotically?
  options: ["O(n)", "O(n log n)", "O(n^2)", "O(n sqrt n)"]
  answer: 1
  explanation: >-
    The inner loop runs n/i times, so the total is n(1 + 1/2 + 1/3 + ... + 1/n) = n * H_n, and the harmonic number H_n grows like ln n. O(n^2) is the tempting misread of two nested loops; the shrinking inner loop is what saves it.
```
