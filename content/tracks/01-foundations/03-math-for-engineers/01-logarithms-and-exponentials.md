---
slug: logarithms-and-exponentials
title: "Logarithms and exponentials: halving, doubling and the powers of two"
description: What log n actually counts, why base does not matter in Big-O, why O(log n) is effectively free, and the dozen powers of two that let you size systems in your head.
minutes: 65
difficulty: intro
tags: [math, logarithms, powers-of-two, complexity, estimation]
problems: [pow-x-n, binary-search-basic, sqrt-x]
---
A colleague says the new index lookup is "O(log n), so it doesn't matter how big the table gets". A product manager asks how many users a 32-bit ID space supports. An interviewer asks whether trying every subset of 40 items is feasible. An on-call engineer asks why a dependency was hit by 1,000 retries in the same millisecond. All four questions have the same shape: how fast does something grow when you keep doubling, and how many times can you halve before you hit one?

That shape is the logarithm, and its mirror image is the exponential. Engineers fluent with both size caches, pick algorithms, tune retry policies and reject infeasible brute force in seconds. This lesson derives the handful of rules from the definition, then applies each one to an engineering problem with real numbers.

## What a logarithm counts

$\log_2 n$ answers one question: *how many times do you have to double 1 to reach n?* Equivalently, *how many times can you halve n before you get down to 1?*

Trace it for $n = 1000$ with integer halving, the version code uses:

| Halving | Value |
|---|---|
| 0 | 1000 |
| 1 | 500 |
| 2 | 250 |
| 3 | 125 |
| 4 | 62 |
| 5 | 31 |
| 6 | 15 |
| 7 | 7 |
| 8 | 3 |
| 9 | 1 (stop) |

Nine halvings, so $\lfloor \log_2 1000 \rfloor = 9$: $2^9 = 512 \le 1000 < 1024 = 2^{10}$. Doubling from 1 gives the ceiling: 512 after nine doublings (still below 1000), 1024 after ten, so $\lceil \log_2 1000 \rceil = 10$. Floor and ceiling differ exactly when $n$ is not a power of two. The number of bits needed to write $n$ in binary is $\lfloor \log_2 n \rfloor + 1$, which is why Python's `n.bit_length()` returns 10 for 1000.

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
(999).bit_length()    # 10  -> ceil_log2(1000), for n >= 1 use (n - 1).bit_length()
```

The loop form is worth internalising because the loop *is* the definition: every algorithm that halves its problem each step runs for exactly this many steps. Binary search halves the candidate range every comparison, so on 8 elements it needs at most $\log_2 8 = 3$:

```viz
{"type": "array", "algorithm": "binary-search", "values": [2, 5, 8, 12, 16, 23, 38, 56], "target": 23, "title": "Three halvings", "caption": "Eight candidates become four, then two, then one. The step count is log2 of the array length, not the array length."}
```

## The rules, derived from the exponent rules

Every log rule is an exponent rule read backwards. The definition is $\log_2 a = x \iff 2^x = a$. Write $a = 2^x$ and $b = 2^y$, so $x = \log_2 a$ and $y = \log_2 b$, and apply the three exponent facts you already know:

| Exponent rule | Applied to $a = 2^x$, $b = 2^y$ | Log rule it becomes |
|---|---|---|
| $2^x \cdot 2^y = 2^{x+y}$ | $ab = 2^{x+y}$, so $\log_2(ab) = x + y$ | $\log(ab) = \log a + \log b$ |
| $2^x / 2^y = 2^{x-y}$ | $a/b = 2^{x-y}$, so $\log_2(a/b) = x - y$ | $\log(a/b) = \log a - \log b$ |
| $(2^x)^k = 2^{xk}$ | $a^k = 2^{xk}$, so $\log_2(a^k) = kx$ | $\log(a^k) = k \log a$ |

Change of base comes from the definition alone. Start with $n = b^{\log_b n}$ (that is what $\log_b n$ means). Take $\log_c$ of both sides and use the power rule:

$$\log_c n = \log_b n \cdot \log_c b \quad\Longrightarrow\quad \log_b n = \frac{\log_c n}{\log_c b}$$

So a log in base $b$ is a log in base $c$ divided by the constant $\log_c b$. For $b = 1000$ and $c = 2$ the constant is $\log_2 1000 \approx 9.97$: a base-1000 logarithm is a base-2 logarithm shrunk ten-fold, for every $n$.

Three consequences you use daily:

- **Base is irrelevant inside Big-O.** $\log_2 n$ and $\log_{10} n$ differ by the factor $\log_2 10 \approx 3.32$ for every $n$, and Big-O drops constant factors, so $O(\log_2 n)$, $O(\ln n)$ and $O(\log_{10} n)$ are one class. The base matters again in an actual step count, which the B-tree section quantifies.
- **Log of a polynomial is a constant times log.** $\log(n^3) = 3 \log n$, so $O(\log n^3) = O(\log n)$.
- **Log of a factorial is $n \log n$.** By the product rule $\log(n!) = \log 1 + \cdots + \log n \approx n \log_2 n - 1.44n$ (Stirling). That is the comparison-sorting lower bound: $n!$ orderings to distinguish, one bit per comparison, so $\log_2(n!) \approx n \log_2 n$ comparisons.

## Why log n is "free": the numbers

The most important table in this lesson:

| $n$ | $\log_2 n$ | $n \log_2 n$ | $n^2$ |
|---|---|---|---|
| 10 | 3.3 | 33 | 100 |
| 1,000 | 10 | 10,000 | 10⁶ |
| 10⁶ | 20 | 2 × 10⁷ | 10¹² |
| 10⁹ | 30 | 3 × 10¹⁰ | 10¹⁸ |
| 10¹² | 40 | 4 × 10¹³ | 10²⁴ |
| 2⁶⁴ ≈ 1.8 × 10¹⁹ | 64 | ≈ 10²¹ | ≈ 3 × 10³⁸ |

A thousand items to a trillion, a billion-fold increase, moves $\log_2 n$ from 10 to 40; anything in a 64-bit integer has a log of at most 64, so an $O(\log n)$ operation costs "a few dozen steps" whatever $n$ is. The third column is why $O(n \log n)$ is treated as almost linear: sorting a million items costs about 20 million comparisons. The fourth is the warning: $n^2$ at a billion is $10^{18}$, thirty years at $10^9$ operations per second.

"Free" has a precise meaning once you attach nanoseconds. Order-of-magnitude costs, which depend on the CPU generation and memory system (treat each as within a factor of two): a register or L1 operation ~1 ns, an L3 hit ~10–20 ns, a DRAM access on a cache miss ~100 ns, an NVMe random read ~100 µs, a cross-region round trip ~100 ms.

**Case A: binary search over 1,000 sorted 4-byte integers.** The array is 4 KB and sits in L1. Ten comparisons at ~1 ns each: about 10 ns, a tenth of *one* DRAM miss. An "O(1)" hash lookup whose bucket is not in cache costs one or two misses, 100–200 ns, and loses ten-fold: the log is free because the constant it competes with is bigger than the whole log.

**Case B: binary search over $10^9$ sorted 4-byte integers.** The array is 4 GB. Thirty probes, and the first 26 of them each land on a fresh cache line, because the remaining range is larger than any cache until the last 16 elements share one 64-byte line ($\log_2 16 = 4$ probes). About $26 \times 100$ ns $\approx 2.6$ µs against the hash table's 200 ns: thirteen times worse, because every step *is* the expensive constant.

The rule: $O(\log n)$ is free when each step is a register or cache operation and dear when each step is a dependent memory access, disk read or network hop. That distinction is the entire motivation for B-trees, for cache-friendly layouts, and for why the [benchmarking lesson](/learn/foundations/complexity/benchmarking-reality) shows "slower" classes winning outright.

### A rule of thumb for feasibility

A core does on the order of $10^8$ to $10^9$ simple operations per second, so $n \log n$ at $n = 10^7$ ($2.3 \times 10^8$) finishes well under a second, $n^2$ at $n = 10^5$ ($10^{10}$) takes tens of seconds, and $2^n$ at $n = 40$ ($1.1 \times 10^{12}$) takes eighteen minutes. When an interviewer gives you $n \le 10^5$, they are telling you $n^2$ will not pass and $n \log n$ will.

## The base matters when you count disk reads

A B-tree node is one disk page, and a lookup reads one page per level, so the height of the tree is the number of reads. Height is $\lceil \log_f n \rceil$ for fan-out $f$, and change of base says $\log_f n = \log_2 n / \log_2 f$. Derive the fan-out first: InnoDB's default page is 16 KiB, PostgreSQL's is 8 KiB; an index entry with an 8-byte key and an 8-byte child pointer is 16 bytes, so a 16 KiB page holds about 1,000 entries (fewer after headers and larger keys; a few hundred is typical for string keys). Now the height for $n = 10^9$ keys:

| Fan-out $f$ | $\log_f 10^9$ | Height (page reads) | Cost if every read is a 100 µs SSD read | Cost with the top two levels cached |
|---|---|---|---|---|
| 2 (binary tree on disk) | 29.9 | 30 | 3 ms | 2.8 ms |
| 256 | 3.7 | 4 | 0.4 ms | 0.2 ms |
| 1,000 (16 KiB page, 16 B entries) | 3.0 | 3 | 0.3 ms | 0.1 ms |
| 4,096 | 2.5 | 3 | 0.3 ms | 0.1 ms |

Change of base is what turned 30 into 3: $\log_2 10^9 \approx 29.9$ divided by $\log_2 1000 \approx 9.97$. The returns then diminish: fan-out 4,096 still needs three levels for a billion keys because the ceiling absorbs the fractional saving, and a 64 KiB page costs more per read and per split. The last column is why real lookups are cheaper still: the root plus its 1,000 children is about 16 MB, which lives in the buffer pool, so a billion-row index lookup is typically one physical read, never thirty. The [B-tree lesson](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees) covers splits, fill factor and why leaves are chained.

## The powers of two you must know

Every capacity estimate in your career is a power of two dressed up. Memorise these; you will use them weekly.

| Power | Exact | As bytes | Where you meet it |
|---|---|---|---|
| $2^8$ | 256 | 256 B | Byte values, one octet of an IPv4 address |
| $2^{10}$ | 1,024 | 1 KiB | The base unit of every size prefix |
| $2^{12}$ | 4,096 | 4 KiB | The standard virtual-memory page |
| $2^{16}$ | 65,536 | 64 KiB | TCP/UDP ports, `u16`, UTF-16 code units |
| $2^{20}$ | 1,048,576 | 1 MiB | A million entries |
| $2^{24}$ | 16,777,216 | 16 MiB | 24-bit colour; largest exact integer in a `float32` |
| $2^{30}$ | 1,073,741,824 | 1 GiB | A billion operations, one second of CPU |
| $2^{31}$ | 2,147,483,648 | 2 GiB | `INT_MAX + 1`; the 2038 problem |
| $2^{32}$ | 4,294,967,296 | 4 GiB | IPv4 address space, `u32`, a 4-byte hash, a 32-bit address space |
| $2^{40}$ | ≈ 1.1 × 10¹² | 1 TiB | |
| $2^{53}$ | 9,007,199,254,740,992 | 8 PiB | Largest integer a `float64`, and so a JavaScript `Number`, holds exactly |
| $2^{64}$ | ≈ 1.8 × 10¹⁹ | 16 EiB | `u64`; a 64-bit hash or ID space |
| $2^{128}$ | ≈ 3.4 × 10³⁸ | | UUIDs, IPv6 |

Two conversions make the table usable without a calculator. **$2^{10} \approx 10^3$**, so $2^{10k} \approx 10^{3k}$; the error compounds at 2.4% per step ($2^{40}$ is $1.10 \times 10^{12}$, $2^{60}$ is $1.15 \times 10^{18}$), which is why a "1 TB" drive shows as 931 GiB and a cache sized as "4 billion bytes" is 6.9% short of 4 GiB. **Split the exponent**: $2^{27} = 2^{20} \cdot 2^7 = 1\text{M} \times 128 \approx 134$ million.

A worked capacity question: "We assign each event a random 32-bit ID. Is that enough for 50,000 events per second?" $2^{32} \approx 4.3 \times 10^9$, and at 50,000 per second you generate that many in about 86,000 seconds, one day. The space is exhausted in a day, and (as the [probability lesson](/learn/foundations/math-for-engineers/probability-for-engineers) derives) the first *collision* is more likely than not after only about 77,000 IDs, two seconds in. Use 64 bits, or 128.

## Exponentials: the other direction

If $\log n$ is the friendly function, $2^n$ is its hostile twin: each additional item doubles the work. It counts every subset of $n$ items (each in or out), every bit string of length $n$, the calls of an unmemoised Fibonacci-style recursion (about $1.618^n$), and the requests of a fan-out that doubles at each of $d$ levels ($2^d$).

Exponentials feel abstract because they start slowly. $2^{10}$ is a thousand. $2^{20}$ is a million. $2^{30}$ is a billion, about one second of work. $2^{40}$ is a trillion, eighteen minutes. $2^{50}$ is thirteen days. Each +10 in the exponent multiplies the time by a thousand, so "can I enumerate all subsets of 40 items?" is no, while 25 items is routine, and the [meet-in-the-middle lesson](/learn/algorithms/technique-mastery/meet-in-the-middle-and-randomisation) turns a $2^{40}$ search into two $2^{20}$ ones.

Factorials are worse still: $10! = 3{,}628{,}800$; $12! \approx 4.8 \times 10^8$, about the last feasible value for brute force; $20! \approx 2.4 \times 10^{18}$ barely fits in a `u64` and $21!$ does not. When a problem says "try every ordering" and $n$ can be 15, an interviewer expects you to notice that $15! \approx 1.3 \times 10^{12}$ and find structure that prunes the search.

## Doubling you want: growth, backoff, averages and decay

Not every exponential is a cost. The same doubling that makes brute force infeasible is what makes dynamic arrays cheap, retry storms survivable and moving averages forgetful.

**Geometric series.** A dynamic array that doubles copies its contents at sizes 1, 2, 4, …, up to $n$, and $1 + 2 + 4 + \cdots + n < 2n$ because a geometric series is dominated by its last term. That is the whole reason `append` is amortised $O(1)$; the [amortised analysis lesson](/learn/foundations/complexity/amortized-analysis) makes it rigorous. Growing by a fixed 100 slots instead copies $100 + 200 + \cdots + n \approx n^2/200$ elements: quadratic. Between the two, a factor of 1.5 (Java's `ArrayList`, MSVC's `vector`) copies under $3n$ and wastes at most 50% of capacity, against $2n$ and 100% for doubling (libstdc++, Rust's `Vec`); CPython's `list` grows by about 1.125×, copying around $9n$ for 12.5% slack. The principle, **the total of a halving or doubling series is a constant times its largest term**, is also the fact behind the [master theorem](/learn/foundations/complexity/recurrences-and-master-theorem).

### Retry backoff with jitter, step by step

Exponential backoff sleeps $\text{base} \cdot 2^{i}$ before retry $i$, capped. *Full jitter* replaces that with a uniform draw from $[0, \min(\text{cap}, \text{base} \cdot 2^i))$. With base 100 ms, cap 10 s, and uniform draws $u = 0.37, 0.82, 0.15, 0.64, 0.50$:

| Attempt $i$ | Window $\min(10000, 100 \cdot 2^i)$ | $u_i$ | Sleep $\lfloor u_i \cdot \text{window} \rfloor$ | Cumulative wait | Cumulative without jitter |
|---|---|---|---|---|---|
| 0 | 100 ms | 0.37 | 37 ms | 37 ms | 100 ms |
| 1 | 200 ms | 0.82 | 164 ms | 201 ms | 300 ms |
| 2 | 400 ms | 0.15 | 60 ms | 261 ms | 700 ms |
| 3 | 800 ms | 0.64 | 512 ms | 773 ms | 1,500 ms |
| 4 | 1,600 ms | 0.50 | 800 ms | 1,573 ms | 3,100 ms |

The cap bites from attempt 7, where $100 \cdot 2^7 = 12{,}800 > 10{,}000$; after that every window is 10 s. The expected sleep with full jitter is half the window, so the mean total wait to the fifth retry is about 1.55 s against 3.1 s without jitter, and the tenth retry without jitter has waited 42.7 s in total.

Why the jitter matters is a counting argument. Suppose 1,000 clients all fail at $t = 0$. Without jitter they retry together at $t = 100$ ms, 300 ms, 700 ms and 1.5 s: four spikes of 1,000 requests each landing within a few milliseconds, which is the thundering herd that keeps a recovering dependency down. With full jitter, attempt 0's retries are spread over 100 ms (about 10 per millisecond) and attempt 4's over 1.6 s (about 0.6 per millisecond). The dependency sees a trickle that halves each round instead of a hammer. The AWS Architecture Blog analysis that popularised the terms also names *equal jitter* (half the window fixed, half random) and *decorrelated jitter* (sleep $= \min(\text{cap}, \text{uniform}(\text{base}, 3 \cdot \text{previous}))$). Pair any of them with a retry budget (retries capped at, say, 10% of the request rate): backoff bounds the wait, the budget bounds the load.

### Exponential moving averages

An EMA updates as $\text{ema}_t = \alpha x_t + (1 - \alpha)\, \text{ema}_{t-1}$. Unroll it once and the structure appears:

$$\text{ema}_t = \alpha x_t + \alpha(1-\alpha) x_{t-1} + \alpha(1-\alpha)^2 x_{t-2} + \cdots$$

The weights form a geometric series with ratio $(1 - \alpha)$ and sum $\alpha / (1 - (1 - \alpha)) = 1$, so the EMA is a weighted average in which each sample's weight decays by a factor $(1 - \alpha)$ per step. Its **half-life** is the $h$ with $(1 - \alpha)^h = 1/2$:

$$h = \frac{\ln 2}{-\ln(1 - \alpha)} \approx \frac{0.693}{\alpha} \text{ for small } \alpha$$

Trace $\alpha = 0.2$ on a latency series sitting at 100 ms, then one 500 ms spike, then 100 ms again:

| Sample | $x_t$ | $\text{ema}_t = 0.2 x_t + 0.8\, \text{ema}_{t-1}$ | Excess over 100 |
|---|---|---|---|
| start | | 100.0 | 0 |
| 1 | 500 | 180.0 | 80.0 |
| 2 | 100 | 164.0 | 64.0 |
| 3 | 100 | 151.2 | 51.2 |
| 4 | 100 | 141.0 | 41.0 |
| 5 | 100 | 132.8 | 32.8 |
| 6 | 100 | 126.2 | 26.2 |

The excess shrinks by 0.8 each step and is halved after $\ln 2 / \ln 1.25 = 3.1$ samples, which is what the formula predicts. Choosing $\alpha$ is choosing a half-life:

| $\alpha$ | Half-life (samples) | Where |
|---|---|---|
| 0.5 | 1.0 | almost "the last two samples" |
| 0.2 | 3.1 | the trace above |
| 1/8 | 5.2 | TCP's smoothed RTT, RFC 6298 (`SRTT = 7/8 SRTT + 1/8 R`) |
| 0.1 | 6.6 | |
| 0.01 | 69.0 | metrics that react a minute late at one sample per second |

Linux's load average is the same series in fixed point: sampled every 5 s, the 1-minute figure decays by $e^{-5/60} = 0.920$, stored as `EXP_1 = 1884` out of 2048 in `include/linux/sched/loadavg.h`.

### Half-life and decay in caches

Exponential decay is the continuous version. If each unit is lost at rate $\lambda$, the remaining amount is $N(t) = N_0 e^{-\lambda t}$, and the half-life $T_{1/2}$ solves $e^{-\lambda T} = 1/2$, giving $T_{1/2} = \ln 2 / \lambda$. Doubling at rate $r$ is the mirror: doubling time $= \ln 2 / r$, which is the "rule of 70" ($70 / r$ periods for $r\%$ growth). Traffic growing 10% a month doubles every 7.3 months (the rule says 7) and grows $1.1^{12} = 3.1\times$ in a year.

Apply it to cache staleness. Objects in a cache are backed by rows that change at random moments, on average once every 10 minutes per key, so $\lambda = 0.1$ per minute. The fraction of entries still fresh after $t$ minutes is $e^{-0.1t}$, and half the cache is stale after $\ln 2 / 0.1 = 6.9$ minutes. That is the arithmetic behind choosing a TTL against a staleness budget:

| TTL | Fraction stale at expiry, $1 - e^{-\lambda \cdot \text{TTL}}$ | Average staleness across the TTL |
|---|---|---|
| 1 min | 9.5% | 4.8% |
| 5 min | 39% | 21% |
| 10 min | 63% | 37% |

If the product can tolerate 5% stale reads on average, a 1-minute TTL meets it and a 5-minute TTL does not; "a few minutes feels fine" is not a substitute for the exponential. The same $e^{-\lambda t}$ describes warm-up after a cold restart, and the [caching lesson](/learn/system-design/building-blocks/caching-strategies) builds TTL and invalidation design on it.

## Reading logs off code

Three code shapes produce a logarithm:

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

One shape is often misread as $O(n^2)$. This harmonic-series loop is $O(n \log n)$:

```python
for i in range(1, n + 1):
    for j in range(0, n, i):   # n/i iterations
        ...
```

Total work is $n/1 + n/2 + n/3 + \cdots + n/n = n \cdot H_n \approx n \ln n$. The harmonic number $H_n$ grows like $\ln n$, which is why "for each $i$, step through multiples of $i$" (the sieve of Eratosthenes, divisor enumeration) is $O(n \log n)$ and not $O(n^2)$.

## Under the hood

**Integer logs are one instruction.** x86 has had `BSR` (bit scan reverse: index of the highest set bit) since the 386, and `LZCNT` (count leading zeros) since Haswell in 2013; ARM has `CLZ`. `floor_log2(n)` is `63 - LZCNT(n)` for a 64-bit register. They differ on zero (`BSR` undefined, `LZCNT` returns the operand width), and each language picks a convention: Python's `(0).bit_length()` is 0, `Math.clz32(0)` is 32, Rust's `0u32.ilog2()` panics.

**CPython.** `int.bit_length()` on a value that fits one 30-bit digit calls `_Py_bit_length` (in `Include/internal/pycore_bitutils.h` since 3.10), which uses the compiler's `__builtin_clz` when available and a small lookup table otherwise; for multi-digit ints it counts whole digits and applies the same routine to the top digit. `int.bit_count()` (added in 3.10) goes through `__builtin_popcount`, which becomes a `POPCNT` instruction when the build targets a CPU that has it and a bit-twiddling sequence when it does not. `math.log2(n)` on an int converts to a `float64` first when it fits, so integers above $2^{53}$ are rounded before the log: `math.log2(2**60 - 1)` returns `60.0`, and flooring it gives 60 where `(2**60 - 1).bit_length() - 1` correctly gives 59. Only an int too large for a double is split as $m \cdot 2^e$, which is why `math.log2(2**1000)` is exactly `1000.0`.

**JavaScript.** `Math.clz32` compiles to `LZCNT`/`BSR` in V8, so `31 - Math.clz32(n)` is the exact floor log for $1 \le n < 2^{32}$; above that, loop over `Math.floor(n / 2)`, because `>>` and `<<` work on signed 32-bit views (`1 << 32` is 1). `Math.log2` is a floating-point library routine: correctly rounded builds return exactly $k$ for $2^k$, but engines have shipped results a rounding error below $k$, so never floor it to bucket integers.

**Rust and Go.** `u64::ilog2` (stable since 1.67) is `63 - leading_zeros()` with a panic on zero; Go's `bits.Len64` is a compiler intrinsic that lowers to the same instruction. The [bit manipulation lesson](/learn/foundations/math-for-engineers/bit-manipulation) covers the rest of the family.

## Failure modes in production

**Synchronised retry spikes.** *Symptom:* after a brief outage, a dependency's request graph shows sharp bursts at 1 s, 2 s, 4 s, 8 s, each burst re-triggering its overload. *Diagnosis:* every client backs off exponentially from the same failure instant with no jitter, so the arrivals stay in lockstep; the dependency never sees the smooth decay the exponent promised. *Fix:* full jitter on every sleep, a cap, a retry budget per client (retries at most 10% of first attempts) and a circuit breaker so clients stop retrying an open failure. The [resilience patterns lesson](/learn/system-design/building-blocks/resilience-patterns) covers the breaker.

**A moving average that lags an incident by ten minutes.** *Symptom:* latency doubled at 10:00 but the smoothed line only crosses the alert threshold at 10:12. *Diagnosis:* the EMA uses $\alpha = 0.001$ at one sample per second, a half-life of 693 s; it is doing what the formula says. A cousin failure is a running-sum average kept in `float32`: past $2^{24}$ (16.7 million) the sum can no longer absorb small additions (`16777216.0 + 0.5` is `16777216.0`) and the average silently freezes. *Fix:* choose $\alpha$ from the half-life you want (about $0.693 / h$); keep sums in `float64` or as integer nanoseconds; prefer histograms (HDR, DDSketch) for latency, which have no decay to tune.

**Off-by-one buckets at powers of two.** *Symptom:* a size histogram puts 1,024-byte payloads in the 512–1,023 bucket on one platform and the 1,024–2,047 bucket on another. *Diagnosis:* the bucket index is `floor(log2(size))` computed in floating point, and one engine returns $9.999\ldots$ for $\log_2 1024$. *Fix:* integer bit length (`bit_length`, `clz32`, `ilog2`), which cannot be off by rounding.

**A doubling loop that overflows.** *Symptom:* a hand-rolled buffer throws `NegativeArraySizeException` or hangs once it reaches a billion elements. *Diagnosis:* `capacity *= 2` in a 32-bit `int` turns $2^{30}$ into $2^{31}$, which is `INT_MIN`; in JavaScript `1 << 31` is $-2^{31}$ and `1 << 32` is 1. *Fix:* check `capacity > MAX / 2` before doubling, cap at the largest representable size (Java's `ArrayList` caps at `Integer.MAX_VALUE - 8`), or use 64-bit arithmetic.

## Trade-offs

Retry policies, measured for 1,000 clients that fail together, base 100 ms, cap 10 s:

| Policy | Peak arrival rate at the dependency | Mean wait to the 5th retry | Worst-case wait to the 5th retry | State needed |
|---|---|---|---|---|
| Fixed 1 s delay | 1,000 in one instant, every second | 5 s | 5 s | none |
| Exponential, no jitter | 1,000 in one instant at 0.1, 0.3, 0.7, 1.5, 3.1 s | 3.1 s | 3.1 s | attempt count |
| Exponential, full jitter | ~10 per ms in window 0, ~0.6 per ms by window 4 | 1.55 s | 3.1 s | attempt count, one random draw |
| Decorrelated jitter | spread, windows grow up to 3× | varies | cap × attempts | previous sleep |

## Interviewer follow-ups

**"You said O(log n) is basically free. When is it not?"** *Model answer:* when each step is a dependent memory access rather than a register operation. Binary search over 4 GB of integers is about 26 cache misses, roughly 2.6 µs, while a hash lookup is one or two misses; over 4 KB the same search is 10 ns and beats the hash. So the answer depends on where the data lives, and that is why B-trees, Eytzinger layouts and hash indexes exist. *Common wrong answer:* "It is always negligible because 30 is a small number", which ignores that each of the 30 can cost 100 ns.

**"Both a binary tree and a B-tree are O(log n). Why does the B-tree win on disk?"** *Model answer:* the base of the log is the fan-out and the height is the number of page reads. For $10^9$ keys, fan-out 2 gives 30 reads, fan-out 1,000 gives 3, and with the top two levels cached, one. Change of base, $\log_{1000} n = \log_2 n / 9.97$, is the whole argument. *Common wrong answer:* "Because the B-tree is balanced", which is true of both.

**"Design the retry policy for a client of a flaky downstream."** *Model answer:* exponential base with a cap, full jitter, a maximum attempt count, a deadline on the total wait, a retry budget capping retries at a fraction of live traffic, and only for idempotent calls; then trace it: base 100 ms, cap 10 s, five attempts, mean wait 1.55 s. *Common wrong answer:* "Retry three times with a one-second sleep", which synchronises every client and triples the load on a dependency that is already failing.

**"How do you choose alpha for a smoothed latency metric?"** *Model answer:* from the half-life you want, $\alpha \approx 0.693 / h$; TCP uses 1/8 for a five-sample half-life, and a dashboard that should react within about ten samples wants $\alpha \approx 0.07$. Smaller is smoother and later; larger is noisier and sooner. *Common wrong answer:* "0.5 sounds balanced", which has a one-sample half-life and is barely smoother than the raw series.

## What mid-level engineers get wrong

- **Treating $O(\log n)$ as $O(1)$ in a memory-bound loop.** A billion binary searches over a 4 GB array cost 2.6 µs each, thirteen times a hash lookup; the "free" log became the whole runtime.
- **Fixed-delay retries.** Every client retries at the same instant; the dependency sees the outage repeat every second until someone turns the clients off.
- **Sizing memory with $10^9$ for a GiB.** Off by 7% at gigabytes and 10% at terabytes, which is exactly the headroom the plan claimed to leave.
- **Flooring a float log to bucket integers.** Correct on the developer's machine, off by one at powers of two on another engine.
- **Confusing "log n is small" with "n log n is n".** At $n = 10^9$ the log factor is 30×; when a linear-time alternative exists, a 30× gap is worth an afternoon.

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

```exercise
id: backoff-schedule
title: Exponential backoff with full jitter
prompt: |
  Compute the sleep before each retry under exponential backoff with full
  jitter. For attempt `i` (0-based) the window is
  `min(cap_ms, base_ms * 2**i)` and the sleep is
  `floor(draws[i] * window)`, where `draws[i]` is a number in `[0, 1)`
  standing in for the random draw. Return the list of sleeps, one per
  draw. Attempt numbers can exceed 31, so compute `2**i` with arithmetic
  that does not truncate to 32 bits (`2 ** i`, not `1 << i`).
languages: [python, javascript]
entry: backoff_schedule
starter:
  python: |
    def backoff_schedule(base_ms, cap_ms, draws):
        # your code here
        return []
  javascript: |
    function backoff_schedule(base_ms, cap_ms, draws) {
      // your code here
      return [];
    }
tests:
  - args: [100, 10000, [0.37, 0.82, 0.15, 0.64, 0.5]]
    expected: [37, 164, 60, 512, 800]
    label: the worked trace
  - args: [100, 10000, []]
    expected: []
    label: no retries
  - args: [100, 50, [0.5, 0.5, 0.5]]
    expected: [25, 25, 25]
    label: the cap is below the base
  - args: [100, 10000, [0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999]]
    expected: [99, 199, 399, 799, 1598, 3196, 6393, 9990, 9990]
    label: the cap bites from attempt 7
  - args: [250, 30000, [0.0, 0.25]]
    expected: [0, 125]
    hidden: true
    label: a zero draw sleeps zero
  - args: [1, 10000000000, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]]
    expected: [0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576, 2097152, 4194304, 8388608, 16777216, 33554432, 67108864, 134217728, 268435456, 536870912, 1073741824, 2147483648, 4294967296]
    hidden: true
    label: 34 attempts; a 32-bit shift would wrap at attempt 32
hints:
  - "Loop over draws with the index i; window = min(cap_ms, base_ms * 2 ** i)."
  - "Use Math.floor in JavaScript and math.floor (or int()) in Python on the product."
```

## Senior signals

- You decode constraints: "$n \le 10^5$" means quadratic is out and $n \log n$ is expected; "$n \le 20$" means $2^n$ is intended.
- You derive the log rules from the exponent rules in four lines and use change of base as a tool: $\log_{1000} n = \log_2 n / 9.97$ is why a B-tree over a billion keys is three page reads and, with the top levels cached, one.
- You say when $O(\log n)$ is free (register-level steps, 30 ns) and when it is not (30 dependent cache misses, 3 µs), with a hash lookup's cost beside both.
- You do capacity arithmetic from $2^{10} \approx 10^3$, carry the 2.4%-per-step error, and know that 32-bit IDs run out in a day at 50k/s and collide within seconds.
- You recognise "the total is a constant times the largest term" as the reason doubling arrays are amortised $O(1)$ and exponential backoff halves load each round.
- You specify a retry policy with numbers (base, cap, full jitter, attempt limit, deadline, budget) and can trace five attempts by hand.
- You pick an EMA's $\alpha$ from a half-life ($0.693/\alpha$), quote TCP's 1/8, and reach for a histogram when the question is a percentile.
- You use `bit_length` / `clz` / `ilog2` for integer logs and can explain why `math.log2(2**60 - 1)` floors to the wrong answer.

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
    A B-tree index over 10^9 keys has fan-out about 1,000. How many page reads does a lookup need, and what changes if the fan-out rises to 4,096?
  options: ["10 reads; fan-out 4,096 drops the height to about 2 and a half", "3 reads; fan-out 4,096 still needs 3 because the ceiling absorbs it", "30 reads; fan-out does not change the height of a balanced tree", "3 reads; fan-out 4,096 halves the height to a single read"]
  answer: 1
  explanation: >-
    Height is ceil(log_f n) = ceil(log2 n / log2 f): 29.9 / 9.97 = 3.0 at fan-out 1,000 and 29.9 / 12 = 2.5, which rounds up to 3, at 4,096. Change of base is what shrinks 30 to 3; beyond about 1,000 the ceiling swallows further gains for a billion keys. Heights are whole page reads, never fractions.
- q: >-
    A latency dashboard smooths one sample per second with an EMA using alpha = 0.01. About how long after latency doubles does the smoothed line get halfway there?
  options: ["About 100 seconds, since the EMA remembers 1/alpha samples", "About 10 seconds, since 0.01 is one percent of the range", "About 1 second, since the EMA weights the newest sample most", "About 69 seconds, the half-life ln 2 / -ln(1 - alpha)"]
  answer: 3
  explanation: >-
    Each sample's weight decays by (1 - alpha) per step, so the response to a step change reaches half after ln 2 / -ln(0.99) ≈ 69 samples, here 69 seconds. 1/alpha = 100 is the mean age of the weights, not the half-life, and the newest sample carries only 1% of the weight.
- q: >-
    Why does adding full jitter to exponential backoff help a dependency recover, given that it does not reduce the number of retries?
  options: ["It shortens the average wait, so clients succeed before the outage ends", "It spreads each round's retries across the window instead of one instant", "It reduces the total retries by randomly skipping some attempts", "It makes clients give up sooner, so fewer retries reach the dependency"]
  answer: 1
  explanation: >-
    Without jitter, 1,000 clients that failed together retry together at 100 ms, 300 ms, 700 ms: spikes of 1,000. Full jitter draws each sleep uniformly from the window, so the same retries arrive at about 10 per millisecond in the first window and 0.6 per millisecond by the fifth. The retry count is unchanged; only its timing is spread. The shorter mean wait is a side effect, not the mechanism.
- q: >-
    Binary search over a 4 GB sorted array of 4-byte integers takes about 2.6 µs, while the same search over a 4 KB array takes about 10 ns. Both are O(log n). What explains the gap?
  options: ["Each probe on the large array is a cache miss of about 100 ns, not a 1 ns compare", "The larger array has 30 probes instead of 10, so it is three times slower", "The small search is O(1) because the whole array fits in one cache line", "The large array needs 64-bit indices, which double the cost of every probe"]
  answer: 0
  explanation: >-
    The step count only grows from 10 to 30, but on the 4 GB array about 26 of the 30 probes land on fresh cache lines and each costs a DRAM access, roughly 100 ns. The 4 KB array sits in L1 and each probe is a register-speed compare. O(log n) is free when the constant per step is tiny and expensive when each step is a memory stall; 4 KB is 64 cache lines, not one.
```
