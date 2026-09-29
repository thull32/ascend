---
slug: classic-divide-and-conquer
title: "Classic divide and conquer: exponentiation, Karatsuba, closest pair, majority"
description: Five algorithms where the recurrence explains the win, from squaring your way to a^n in log n steps to the three-multiplication trick that beats schoolbook multiplication, the strip argument in closest pair, and why Strassen's seven products matter.
minutes: 55
difficulty: medium
tags: [divide-and-conquer, fast-exponentiation, karatsuba, closest-pair, majority-element, strassen, recurrence]
problems: [pow-x-n, kth-largest-array, median-two-sorted]
---
Every algorithm in this lesson was, at the time it was found, a surprise. Multiplying two `n`-digit numbers was taken for granted to be `n²` work until Karatsuba showed it was not, in the early 1960s. Multiplying two matrices was assumed to be `n³` until Strassen found seven products where everyone had used eight. Finding the closest pair of points was assumed to need a comparison of every pair until the strip argument reduced it to `n log n`. In each case the surprise came from the same place: a recurrence where the number of subproblems, or the cost of combining them, was one notch better than the naive decomposition.

The previous lesson gave you the tool, the recurrence and the master theorem. This one gives you the five results you should be able to derive, implement and explain, and for each one the specific idea that makes the recurrence come out ahead.

## Fast exponentiation: halve the exponent

Computing `a^n` by multiplying `n` times is `O(n)`. But `a^n = (a^(n/2))²` when `n` is even, and `a · (a^((n−1)/2))²` when `n` is odd. One recursive call on half the exponent plus one or two multiplications: $T(n) = T(n/2) + O(1) = O(\log n)$.

```python
def power(a, n):
    if n == 0:
        return 1
    half = power(a, n // 2)
    return half * half if n % 2 == 0 else half * half * a
```

The iterative version reads the exponent's bits from least significant upward; each bit that is set multiplies the current power of `a` into the result, and `a` is squared at every step regardless.

```python
def power_mod(a, n, m):
    result, base = 1 % m, a % m
    while n:
        if n & 1:
            result = result * base % m
        base = base * base % m
        n >>= 1
    return result
```

Trace `3¹³`. The exponent is `13 = 1101₂`, read from the low bit up; `base` squares every step, `result` multiplies in the base only on a 1 bit:

| `n` (remaining bits) | low bit | `base` before | `result` after |
|---|---|---|---|
| 13 = `1101` | 1 | 3 | 3 |
| 6 = `110` | 0 | 9 | 3 |
| 3 = `11` | 1 | 81 | 243 |
| 1 = `1` | 1 | 6561 | 1,594,323 |

Four squarings and three multiplications for an exponent of 13, and `3¹³ = 1,594,323`. The bases are `3, 3², 3⁴, 3⁸`, and the result is the product of the ones whose bit is set: `3¹ · 3⁴ · 3⁸ = 3¹³`.

The `% m` on every multiplication is not optional: without it the intermediate values grow to `n` bits and each multiplication becomes as slow as the problem you were avoiding. This is the algorithm behind RSA (`c = m^e mod N` with a 2048-bit exponent takes about 2048 squarings, not 2^2048 multiplications), behind Diffie–Hellman, behind computing large Fibonacci numbers by raising a 2 × 2 matrix to a power, and behind every "compute `x^n` for a negative or huge `n`" interview question ([Pow(x, n)](/practice/pow-x-n) is this with floats and a negative-exponent edge case).

The general principle: any associative operation (`×`, matrix multiplication, function composition, string concatenation in a monoid) can be applied `n` times in `O(log n)` applications. "Apply this linear recurrence a billion times" is a matrix power; "what is the state after 10¹⁸ steps of this deterministic machine" is a function-composition power.

## Karatsuba: three multiplications instead of four

Split two `n`-digit numbers into halves: `x = x₁·B + x₀` and `y = y₁·B + y₀`, where `B = 10^(n/2)`. Then

$$ xy = x_1 y_1 B^2 + (x_1 y_0 + x_0 y_1) B + x_0 y_0. $$

That is four half-size multiplications plus linear-time shifts and additions, and $T(n) = 4T(n/2) + O(n) = O(n^2)$: no better than schoolbook. Karatsuba noticed that the middle term can be obtained from one multiplication instead of two:

$$ (x_1 + x_0)(y_1 + y_0) = x_1 y_1 + x_1 y_0 + x_0 y_1 + x_0 y_0, $$

so `x₁y₀ + x₀y₁ = (x₁ + x₀)(y₁ + y₀) − x₁y₁ − x₀y₀`. Three multiplications, a few extra additions: $T(n) = 3T(n/2) + O(n) = O(n^{\log_2 3}) \approx O(n^{1.585})$.

```python
def karatsuba(x, y):
    if x < 10 or y < 10:
        return x * y
    n = max(len(str(x)), len(str(y)))
    half = n // 2
    B = 10 ** half
    x1, x0 = divmod(x, B)
    y1, y0 = divmod(y, B)
    z2 = karatsuba(x1, y1)
    z0 = karatsuba(x0, y0)
    z1 = karatsuba(x1 + x0, y1 + y0) - z2 - z0
    return z2 * B * B + z1 * B + z0
```

Work it on `1234 × 5678` with `B = 100`, so `x₁ = 12, x₀ = 34, y₁ = 56, y₀ = 78`. The three multiplications:

| Product | Computation | Value |
|---|---|---|
| `z₂ = x₁ · y₁` | `12 × 56` | 672 |
| `z₀ = x₀ · y₀` | `34 × 78` | 2,652 |
| `(x₁ + x₀)(y₁ + y₀)` | `46 × 134` | 6,164 |
| `z₁ = 6,164 − 672 − 2,652` | subtraction only | 2,840 |

Assemble: `672 × 10⁴ + 2,840 × 10² + 2,652 = 6,720,000 + 284,000 + 2,652 = 7,006,652`, which is `1234 × 5678`. Schoolbook would have done four two-digit products (`12·56, 12·78, 34·56, 34·78`); Karatsuba did three plus some additions, and the third product has operands one digit wider (`46 × 134`), which is why the recursion is on inputs of size `n/2 + 1`, a detail that does not change the exponent.

For 1,000-digit numbers, `n²` is a million digit-multiplications and `n^1.585` is about 57,000. CPython's `int` switches to Karatsuba when both operands exceed 70 internal digits of 30 bits, about 2,100 bits or 630 decimal digits (the section on what happens under the hood has the details); GMP uses Karatsuba, then Toom-Cook (a three-way split with five multiplications instead of nine, then four-way), then FFT-based multiplication for numbers with tens of thousands of digits, which is where the [next lesson](/learn/algorithms/divide-and-conquer/fft-intuition) picks up. The lesson for interviews is not the code; it is the move: **find an algebraic identity that lets you recover a needed product from fewer multiplications**, and let the recurrence tell you what you gained.

## Strassen: the same move on matrices

Multiplying two `n × n` matrices by splitting each into four `n/2 × n/2` blocks needs eight block products: $T(n) = 8T(n/2) + O(n^2) = O(n^3)$, the same as the triple loop. Strassen found seven products of sums and differences of the blocks from which all four output blocks can be assembled: $T(n) = 7T(n/2) + O(n^2) = O(n^{\log_2 7}) \approx O(n^{2.807})$.

The seven products, each a single half-size multiplication of sums or differences of blocks:

| | Product | | Output block |
|---|---|---|---|
| `M₁` | `(A₁₁ + A₂₂)(B₁₁ + B₂₂)` | `C₁₁` | `M₁ + M₄ − M₅ + M₇` |
| `M₂` | `(A₂₁ + A₂₂) B₁₁` | `C₁₂` | `M₃ + M₅` |
| `M₃` | `A₁₁ (B₁₂ − B₂₂)` | `C₂₁` | `M₂ + M₄` |
| `M₄` | `A₂₂ (B₂₁ − B₁₁)` | `C₂₂` | `M₁ − M₂ + M₃ + M₆` |
| `M₅` | `(A₁₁ + A₁₂) B₂₂` | | |
| `M₆` | `(A₂₁ − A₁₁)(B₁₁ + B₁₂)` | | |
| `M₇` | `(A₁₂ − A₂₂)(B₂₁ + B₂₂)` | | |

### Checking the seven products

Check it with the blocks as plain numbers, `A = [[4, 9], [3, 6]]` and `B = [[8, 2], [1, 8]]`: `M₁ = 10 · 16 = 160`, `M₂ = 9 · 8 = 72`, `M₃ = 4 · (−6) = −24`, `M₄ = 6 · (−7) = −42`, `M₅ = 13 · 8 = 104`, `M₆ = (−1) · 10 = −10`, `M₇ = 3 · 9 = 27`. Then `C₁₁ = 160 − 42 − 104 + 27 = 41`, `C₁₂ = −24 + 104 = 80`, `C₂₁ = 72 − 42 = 30`, `C₂₂ = 160 − 72 − 24 − 10 = 54`, and the direct product is `[[4·8 + 9·1, 4·2 + 9·8], [3·8 + 6·1, 3·2 + 6·8]] = [[41, 80], [30, 54]]`. Ten block additions to form the operands and eight to assemble the result: eighteen `O(n²)` additions, which is the constant factor that makes Strassen lose at small sizes.

You are not expected to memorise the seven products. You are expected to know three things. First, that the exponent 2.807 comes from `log₂ 7` and would be `log₂ 8 = 3` with one more product, which is the whole insight in one line. Second, that Strassen's constant factor and weaker numerical stability mean production BLAS libraries implement `dgemm` as the `n³` algorithm with cache-blocking and SIMD, not as Strassen; "asymptotically better" and "faster on your workload" are different claims. Third, that the theoretical exponent has been pushed to about 2.37 by algorithms that are galactic (their constants make them useless at any physical size), which is a useful phrase to have when someone cites a paper.

## Closest pair of points: the strip argument

Given `n` points in the plane, find the pair with the smallest distance. Brute force compares all `n(n−1)/2` pairs: `O(n²)`. Divide and conquer sorts the points by `x`, splits at the median `x` into left and right halves, finds the closest pair in each recursively (distances `dₗ` and `dᵣ`, let `d = min(dₗ, dᵣ)`), and then handles the pairs that straddle the split.

The straddling pairs are where the recurrence is decided. Any pair closer than `d` with one point on each side must have both points within `d` of the dividing line, so only points in a vertical strip of width `2d` matter. That alone does not help in the worst case (all points could be in the strip). The argument that does help: sort the strip's points by `y`, and for each point compare it only with the points *following* it in `y` order whose `y` differs by less than `d`. Within a `d × 2d` rectangle of the strip there can be at most 8 points at pairwise distance at least `d` (pack `d/2 × d/2` squares, each holding at most one point because its diagonal is `d/√2 < d`), so each strip point is compared with at most 7 others. The combine step is `O(n)` after sorting, and if the `y`-sorted order is maintained through the recursion (merge the halves' `y`-orders, exactly like merge sort) rather than re-sorted, the recurrence is $T(n) = 2T(n/2) + O(n) = O(n \log n)$. Re-sorting the strip at each level gives $2T(n/2) + O(n \log n) = O(n \log^2 n)$, which is still fine and much simpler to write.

```python
def closest_pair_sq(points):                   # returns squared distance
    pts = sorted(points)                        # by x, then y
    def rec(p):
        n = len(p)
        if n <= 3:
            return min((a[0]-b[0])**2 + (a[1]-b[1])**2
                       for i, a in enumerate(p) for b in p[i+1:]) if n > 1 else float("inf")
        mid = n // 2
        mid_x = p[mid][0]
        d = min(rec(p[:mid]), rec(p[mid:]))
        strip = sorted((q for q in p if (q[0] - mid_x) ** 2 < d), key=lambda q: q[1])
        for i, a in enumerate(strip):
            for b in strip[i + 1:]:
                if (b[1] - a[1]) ** 2 >= d:
                    break                       # everything further down in y is too far
                d = min(d, (a[0]-b[0])**2 + (a[1]-b[1])**2)
        return d
    return rec(pts)
```

### The strip on eight points

Trace it on eight integer points, already sorted by `x`: `(1,1) (1,6) (3,3) (5,4) (6,5) (8,1) (9,6) (10,3)`. The top-level split is at `x = 6`. The left half recurses to `d_L = 5` (the pair `(3,3)–(5,4)`) and the right half to `d_R = 8` (`(8,1)–(10,3)`), so `d = 5`. The strip is every point with `(x − 6)² < 5`, that is `x` in `4..8`: `(5,4)`, `(6,5)`, `(8,1)`, sorted by `y` as `(8,1), (5,4), (6,5)`.

| Strip point `a` | Candidate `b` (next in `y` order) | `(b.y − a.y)²` | Action |
|---|---|---|---|
| `(8,1)` | `(5,4)` | 9 ≥ 5 | break: everything further down in `y` is further away |
| `(5,4)` | `(6,5)` | 1 < 5 | compare: `1² + 1² = 2`, new `d = 2` |
| `(6,5)` | none left | | |

One real comparison in the strip, and it found the closest pair, `(5,4)–(6,5)` at squared distance 2, which straddles the dividing line and was invisible to both halves. The `break` at the first row is the packing bound doing its work: with `d = 5`, no point more than `√5 ≈ 2.24` below in `y` can matter.

Two practical notes. Compare squared distances to avoid square roots and floating-point comparisons entirely when the coordinates are integers. And notice the `break`: without it the inner loop is `O(n)` per strip point and the whole combine step is quadratic again; the 7-neighbour bound is what the `break` enforces.

## Majority element: shrink the problem by cancellation

Find the element that appears more than `n/2` times, if one exists. A hash map of counts is `O(n)` time and `O(n)` space. Divide and conquer gets `O(n log n)` with `O(log n)` space: the majority of the whole array must be the majority of at least one half (if it were a minority in both halves it could not be a majority overall), so recurse, get the two candidates, and count each in the full array. $T(n) = 2T(n/2) + O(n)$.

The result worth carrying away is what the divide-and-conquer version points toward. **Boyer–Moore majority vote** does it in `O(n)` time and `O(1)` space by a cancellation argument: pair up any two *different* elements and discard both; the majority element remains the majority of what is left. The implementation keeps one candidate and a counter: matching elements increment, mismatching elements decrement, and a counter at zero adopts the next element as the new candidate. A second pass confirms the candidate actually exceeds `n/2` (the first pass finds the majority *if one exists*; on an array without a majority it returns garbage).

```python
def majority(nums):
    candidate, count = None, 0
    for x in nums:
        if count == 0:
            candidate = x
        count += 1 if x == candidate else -1
    return candidate if nums.count(candidate) > len(nums) // 2 else None
```

Trace `[2, 2, 1, 1, 1, 2, 2]`, where 2 appears four times out of seven:

| element | candidate after | count after |
|---|---|---|
| 2 | 2 | 1 |
| 2 | 2 | 2 |
| 1 | 2 | 1 |
| 1 | 2 | 0 |
| 1 | 1 | 1: count was 0, so 1 is adopted |
| 2 | 1 | 0 |
| 2 | 2 | 1: adopted again |

The survivor is 2, and the verification pass counts four occurrences, more than `7 // 2 = 3`. Now `[1, 2, 3]`, which has no majority: candidate 1 (count 1), then 2 cancels it (count 0), then 3 is adopted (count 1). The pass ends with candidate 3 and a positive count, and 3 appears once, not more than `3 // 2 = 1`. Without the second pass the function would return 3 as "the majority". A positive final count is not evidence.

The generalisation ("elements appearing more than `n/k` times") keeps `k − 1` candidates and cancels `k`-tuples of distinct elements, still in `O(n)` time and `O(k)` space. This is the algorithm behind heavy-hitter detection in streaming systems, and the count-min sketch in the [probabilistic structures module](/learn/advanced-data-structures/probabilistic-structures/count-min-sketch-and-hyperloglog) is its approximate cousin.

## Single-sided recursion: when one half is enough

The algorithms above recurse into both halves. The ones that recurse into *one* get a better recurrence: $T(n) = T(n/2) + O(n) = O(n)$ (case 3, the root dominates) or $T(n/2) + O(1) = O(\log n)$. Binary search is the second. Quickselect, which partitions around a pivot and recurses only into the side containing the `k`-th element, is the first; it finds a median in expected linear time and is the answer to [Kth Largest Element](/practice/kth-largest-array) when the interviewer says "faster than sorting". Median of medians makes the pivot choice deterministic with a recurrence, $T(n) = T(n/5) + T(7n/10) + O(n)$, whose two pieces sum to `9n/10 < n`, which is why it is still linear.

```viz
{"type": "recursion", "algorithm": "binary-search-recursive", "values": [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], "target": 23,
 "title": "Single-sided recursion: each call discards half"}
```

The habit these give you: when a divide-and-conquer recurrence comes out to $O(n \log n)$ and you need linear, ask whether you can decide *which* half contains the answer without solving both.

## Under the hood

**CPython integers.** A Python `int` is an array of 30-bit "digits" (`sys.int_info.bits_per_digit == 30`, four bytes each). `long_mul` uses schoolbook multiplication until both operands have more than `KARATSUBA_CUTOFF = 70` digits, about 2,100 bits or 630 decimal digits, then Karatsuba; there is no Toom-Cook or FFT step, so multiplying two million-digit numbers in Python is `O(n^1.585)` and takes seconds. The `decimal` module's C backend (libmpdec) does have number-theoretic-transform multiplication for very large operands. `pow(a, n, m)` is binary exponentiation with the modular reduction after each step, switching to a windowed variant (several exponent bits per multiplication) for large exponents; either way about `log₂ n` squarings.

**GMP and everything built on it.** GMP (used by Python's `gmpy2`, Julia's `BigInt`, GHC's GMP bignum backend, Ruby when built with it, and many computer-algebra systems) climbs a ladder of algorithms with machine-tuned thresholds: schoolbook, then Karatsuba from as little as ten 64-bit limbs, then Toom-3, Toom-4 and higher Toom variants, and Schönhage–Strassen FFT multiplication from roughly 3,000 to 10,000 limbs upward, per the [GMP manual](https://gmplib.org/manual/FFT-Multiplication). The thresholds are set per CPU by a tuning program, so quote them as orders of magnitude.

**BLAS.** `dgemm` in OpenBLAS, MKL and BLIS is the `n³` algorithm reorganised for hardware: the matrices are cut into blocks sized to the L1, L2 and L3 caches, packed into contiguous buffers, and multiplied by a hand-written SIMD micro-kernel that keeps a small tile of `C` in registers. Strassen is not how these libraries serve an ordinary `dgemm` call; one or two Strassen levels layered on top of a blocked kernel can pay only once matrices are large enough for the 12.5% saving per level to outweigh the extra additions and memory traffic, and always at some cost in rounding.

**RSA.** A 2,048-bit RSA private-key operation is `m^d mod N` with a 2,048-bit exponent: about 2,048 modular squarings plus up to 2,048 multiplications (fewer with windowing and the Chinese-remainder split), each on 2,048-bit operands that GMP or OpenSSL multiply with Karatsuba-level algorithms and reduce with Montgomery arithmetic.

**Heavy hitters.** The `n/k` generalisation of Boyer–Moore is the Misra–Gries summary, the exact ancestor of the streaming heavy-hitter sketches: keep `k − 1` counters, cancel `k`-tuples of distinct elements, and verify in a second pass when you can. The [count-min sketch lesson](/learn/advanced-data-structures/probabilistic-structures/count-min-sketch-and-hyperloglog) is the approximate, single-pass relative.

## Quantified costs

- **Karatsuba versus schoolbook.** 1,000 digits: `10⁶` versus `1000^1.585 ≈ 5.7 × 10⁴` digit products, 17× fewer; 10⁶ digits: `10¹²` versus about `3.2 × 10⁹`, 300× fewer. The crossover where Karatsuba's extra additions stop hurting is at tens of machine words, which is why CPython's cutoff is 70 limbs and not 2.
- **Strassen's arithmetic.** Seven products and 18 block additions per level. At `n = 512` one level replaces `8 × 256³ ≈ 1.3 × 10⁸` multiply-adds with `7 × 256³ ≈ 1.2 × 10⁸` plus `18 × 256² ≈ 1.2 × 10⁶` additions, a 12.5% saving on paper that a blocked `dgemm` running near peak erases; any crossover sits at much larger sizes and depends on the BLAS, the CPU and the accuracy you accept.
- **Exponentiation.** `a^n mod m` costs `⌊log₂ n⌋` squarings plus one multiplication per set bit: 13 → 4 squarings, 3 multiplications; a 2,048-bit exponent → 2,048 squarings and about 1,024 multiplications on average.
- **Closest pair.** `n = 10⁶` points: the `O(n log² n)` version with a strip sort per level does about `2 × 10⁷` comparisons in the strips plus 20 sorts of shrinking size; the `O(n log n)` version with merged `y`-orders roughly halves it. Brute force is `5 × 10¹¹` pair checks.
- **Majority.** One pass and one verification pass, `2n` comparisons and two integers of state; a hash map of counts is also `O(n)` but allocates a dictionary entry per distinct value, on the order of 100 bytes each in Python.

## Trade-offs

| Multiplication | Exponent | Half-size products per level | Extra additions | Wins from about |
|---|---|---|---|---|
| Schoolbook | 2 | 4 | few | 1 digit |
| Karatsuba | `log₂ 3 ≈ 1.585` | 3 | linear, a handful | tens of machine words |
| Toom-3 | `log₃ 5 ≈ 1.465` | 5 (of size `n/3`) | more, with divisions by small constants | hundreds of words |
| Schönhage–Strassen FFT | `n log n log log n` | transforms | complex or modular arithmetic | thousands of words |

| Majority element | Time | Space | Passes | Needs the whole array? |
|---|---|---|---|---|
| Hash map of counts | `O(n)` | `O(n)` entries | 1 | no |
| Divide and conquer | `O(n log n)` | `O(log n)` stack | recursive | yes |
| Boyer–Moore | `O(n)` | `O(1)` | 2 (vote, verify) | vote pass streams; verify needs a second look |
| Sort, take the middle | `O(n log n)` | `O(1)` or `O(n)` | 1 | yes, and still needs a count |

## Failure modes

**Symptom: a hand-written Karatsuba returns wrong results for some inputs and right ones for others.** Diagnosis: unequal operand lengths or negative operands. Splitting both numbers at `half` computed from the *longer* one keeps the powers of `B` aligned; splitting each at its own midpoint does not. Negative operands break `divmod`-based splitting in languages where `%` follows the dividend's sign. Fix: multiply absolute values, apply the sign at the end, and split both operands at the same position.

**Symptom: `power(x, n)` returns 0 or `Infinity` for a negative exponent, or hangs for `n = -2³¹`.** Diagnosis: the negative-exponent case was handled as `1 / power(x, -n)`, and negating the most negative 32-bit integer overflows back to itself, so the recursion never reaches zero. Fix: handle the exponent in a wider type or as an unsigned magnitude, and treat `x = 0` with a negative exponent as an error.

**Symptom: an integer `power` overflows in Java or C long before the exponent is large.** Diagnosis: `half * half` exceeds `2³¹` once `half ≥ 46,341` (and `2⁶³` once `half ≥ 3,037,000,500`); the answer is meaningless without a modulus. Fix: reduce modulo `m` at every step, or use arbitrary precision if the true value is needed. The [numbers lesson](/learn/foundations/how-code-runs/numbers-strings-unicode) has the widths.

**Symptom: the majority function returns an element that is not a majority.** Diagnosis: no verification pass. On `[1, 2, 3]` the vote ends with candidate 3 and count 1. Fix: count the candidate and compare with `n // 2`; return "none" otherwise.

**Symptom: closest pair is quadratic on some point sets, or returns a wrong answer on floating-point coordinates.** Diagnosis: the `break` is missing or written as `>` instead of `>=`, so ties in `y` (many points on a horizontal line) keep the inner loop running; with floats, comparing squared distances against a `d` that was rounded differently on the two sides can miss a pair by an ulp. Fix: keep the `>=` break, use integer or scaled-integer coordinates, and when floats are unavoidable compare with a tolerance.

**Symptom: Strassen-based multiplication gives results that differ from the library's in the last few digits, and a downstream solver diverges.** Diagnosis: the sums and differences of blocks cancel, so relative error grows with each recursion level; Strassen satisfies a weaker error bound than the classical algorithm. Fix: use `dgemm`, or apply at most one or two Strassen levels on top of it and validate against the classical result on your data.

## Interviewer follow-ups

**"Karatsuba does three multiplications. Can you do two?"** Model answer: not for a two-way split, because the product of two linear polynomials has three coefficients, each needing an independent evaluation; three is optimal for degree-1 splits. More parts help: Toom-3 evaluates at five points for a three-way split (`log₃ 5 ≈ 1.465`), and in the limit the FFT evaluates at `n` roots of unity for `n log n`. Common wrong answer: "yes, if you pick a cleverer identity", without noticing that the number of coefficients is the lower bound.

**"Why is `log₂ 7` the exponent and not 7/8 of `n³`?"** Model answer: the saving compounds at every level of the recursion tree; the leaf count is `7^(log₂ n) = n^(log₂ 7)`, and `n^2.807` is asymptotically smaller than `n³` by a growing factor, not by a constant. Common wrong answer: treating the seven-out-of-eight saving as a constant factor.

**"Boyer–Moore with the second pass is two passes. Can you do it in one?"** Model answer: not in general for a stream you cannot rewind; the vote pass identifies the only possible majority, and confirming it requires counting. If the problem guarantees a majority exists, one pass suffices. Common wrong answer: "return the candidate if the final count is positive", which fails on `[1, 2, 3]`.

**"Closest pair, but the points are on a line."** Model answer: sort and check adjacent pairs, `O(n log n)`; the divide-and-conquer machinery collapses to one dimension. And in three dimensions the strip becomes a slab and the packing constant grows, but the argument survives. Common wrong answer: running the 2D algorithm unchanged, which works but wastes the strip machinery.

**"Compute the `n`-th Fibonacci number for `n = 10¹⁸` modulo a prime."** Model answer: it is the `n`-th power of the matrix `[[1, 1], [1, 0]]`, so exponentiation by squaring with 2×2 matrix multiplication mod `p`: about 60 squarings of eight multiplications each. Common wrong answer: memoised recursion, which is `O(n)` time and memory and never finishes.

## What mid-level engineers get wrong

- **Quoting "Python switches to Karatsuba at 70 digits".** The cutoff is 70 thirty-bit limbs, about 630 decimal digits; below that everything is schoolbook.
- **Implementing Karatsuba for interview-sized inputs.** For numbers under a few hundred digits the library's schoolbook multiply is faster; the algorithm is worth knowing for the recurrence, not the speed.
- **Expecting Strassen from `numpy.dot`.** BLAS is a blocked `n³`; Strassen appears only in research code, for large matrices.
- **Skipping the modular reduction inside the loop.** Operands grow to millions of bits and the "logarithmic" algorithm becomes slower than the linear one.
- **Overflowing `half * half`.** A 32-bit `int` fails at `half = 46,341`; the test cases rarely reach it.
- **Trusting Boyer–Moore's candidate.** Without the verification pass the function is wrong on every input without a majority.
- **Dropping the `break` in the strip loop.** Correct answers, quadratic time; the benchmark that reveals it is the one with every point inside the strip.
- **Recursing into both halves out of habit.** When one half can be ruled out (order statistics, medians), the running time drops by a factor of `log n` or more.

## Exercises

```exercise
id: fast-pow-mod
title: Modular exponentiation by squaring
prompt: |
  Implement `fast_pow_mod(base, exp, mod)` returning `base^exp mod mod` for
  `exp >= 0` and `mod >= 1`, in O(log exp) multiplications. Reduce modulo
  `mod` after every multiplication. Treat `0^0` as `1`. Note that
  `x mod 1` is `0` for every `x`.

  Tests keep `mod <= 10^6`, so products fit in a JavaScript number.
languages: [python, javascript]
entry: fast_pow_mod
starter:
  python: |
    def fast_pow_mod(base, exp, mod):
        result = 1 % mod
        # square base, halve exp
        return result
  javascript: |
    function fast_pow_mod(base, exp, mod) {
      let result = 1 % mod;
      // square base, halve exp
      return result;
    }
tests:
  - args: [2, 10, 1000]
    expected: 24
  - args: [3, 0, 7]
    expected: 1
    label: exponent zero
  - args: [5, 3, 13]
    expected: 8
  - args: [2, 30, 1000000]
    expected: 741824
  - args: [3, 7, 100]
    expected: 87
    hidden: true
  - args: [5, 5, 7]
    expected: 3
    hidden: true
  - args: [10, 9, 1]
    expected: 0
    hidden: true
    label: modulus one
  - args: [0, 0, 5]
    expected: 1
    hidden: true
hints:
  - "`result = 1 % mod` handles `mod == 1` without a special case."
  - "Loop while `exp > 0`: if the low bit is set multiply `result` by `base`; then square `base`; then shift `exp` right."
  - "Reduce `base` modulo `mod` before the loop as well."
```

```exercise
id: closest-pair-squared
title: Closest pair of points
prompt: |
  Implement `closest_pair_squared(points)` for a list of at least two
  integer points `[x, y]`. Return the smallest squared Euclidean distance
  between two distinct indices (points may coincide, giving 0).

  Use divide and conquer with the strip argument: sort by x, split at the
  median, recurse, then check the strip of points within `d` of the dividing
  line in y order, breaking out when the y gap reaches `d`. O(n log² n) is
  fine.
languages: [python, javascript]
entry: closest_pair_squared
starter:
  python: |
    def closest_pair_squared(points):
        pts = sorted(points)

        def rec(p):
            # brute force for len(p) <= 3, otherwise split, recurse, strip
            return 0

        return rec(pts)
  javascript: |
    function closest_pair_squared(points) {
      const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      function rec(p) {
        // brute force for p.length <= 3, otherwise split, recurse, strip
        return 0;
      }
      return rec(pts);
    }
tests:
  - args: [[[0,0],[3,4],[1,1]]]
    expected: 2
  - args: [[[0,0],[0,0]]]
    expected: 0
    label: coincident points
  - args: [[[0,0],[5,5]]]
    expected: 50
  - args: [[[1,2],[4,6],[7,8],[2,2]]]
    expected: 1
  - args: [[[0,0],[10,0],[5,0],[5,1]]]
    expected: 1
    hidden: true
  - args: [[[0,0],[0,10],[1,5],[-1,5],[10,10],[10,0]]]
    expected: 4
    hidden: true
    label: closest pair straddles the split
  - args: [[[-3,-3],[3,3],[-3,3],[3,-3],[0,1]]]
    expected: 13
    hidden: true
hints:
  - "Work with squared distances throughout; never take a square root."
  - "The strip is every point whose squared x-distance to the dividing line is less than the current best `d`; sort it by y."
  - "In the strip's inner loop, `break` as soon as `(b.y - a.y)^2 >= d`; that is what keeps the combine step linear."
```

## Senior signals

- You can derive `a^n` in `O(log n)` from the identity `a^n = (a^(n/2))²`, and you generalise it to any associative operation (matrix powers for linear recurrences).
- You know Karatsuba's identity and can say why three half-size multiplications beat four by pointing at `log₂ 3` versus `log₂ 4`.
- You know Strassen's exponent comes from `log₂ 7`, that BLAS `dgemm` does not use it, and the phrase "galactic algorithm" for the 2.37 results.
- You can give the packing argument for why each strip point in closest pair is compared with at most 7 others, and you know the `break` is what makes it linear.
- You reach for Boyer–Moore for majority and can explain the cancellation argument and the necessity of the verification pass.
- You know single-sided recursion turns `n log n` into `n` (quickselect) or `log n` (binary search), and you ask "which half has the answer" before recursing into both.
- You know the real thresholds: CPython switches to Karatsuba at 70 thirty-bit limbs (about 630 decimal digits), GMP climbs through Toom-Cook to FFT multiplication, and BLAS `dgemm` is a blocked, vectorised `n³`.
- You can write the four-digit Karatsuba by hand, name the seven Strassen products, trace Boyer–Moore on an array with no majority, and show the strip comparison that finds a straddling pair.
- You size the integers before you multiply: `half * half` overflows a 32-bit `int` at `half ≥ 46,341`, and the modular version keeps every operand below `m²`.

## Check yourself

```quiz
- q: >-
    Computing a^n by repeated squaring on arbitrary-precision integers without a modulus is NOT O(log n) time. Why?
  options: ["The operands grow to about n·log a bits, so later multiplications are nowhere near O(1)", "It is O(log n); arbitrary-precision ints make each multiplication one O(1) step", "Odd exponents need an extra multiplication, so the multiplication count becomes O(n)", "The recursion depth becomes O(n) once the exponent no longer fits in a machine word"]
  answer: 0
  explanation: >-
    The count of multiplications is O(log n) (at most two per halving, odd exponents included), but a multiplication of k-bit numbers is not constant time, arbitrary precision or not. The final squaring handles numbers with roughly n·log₂ a bits, so the last few multiplications dominate. With a modulus every operand stays bounded, which is why modular exponentiation is genuinely fast.
- q: >-
    Karatsuba's algorithm replaces four half-size multiplications with three. What is the resulting complexity exponent, and where does it come from?
  options: ["2, unchanged, because the extra linear additions cancel the saving", "1.5, from the ratio of 3 subproblems to a split factor of 2", "log₃ 2 ≈ 0.63, from a recursion tree that is log₃ n levels deep", "log₂ 3 ≈ 1.585, from the 3^(log₂ n) leaves of the recursion tree"]
  answer: 3
  explanation: >-
    T(n) = 3T(n/2) + O(n) falls in master-theorem case 1: the tree is log₂ n levels deep with 3 children per node, so the leaves dominate and there are 3^(log₂ n) = n^(log₂ 3) of them. The exponent is log_b a, not the ratio a/b. The extra additions are linear and absorbed.
- q: >-
    In the closest-pair combine step, why can each point in the strip be compared with only a constant number of others?
  options: ["The strip is only 2d wide, so it can never contain more than 8 points in total", "It cannot; with every point inside the strip, the combine step becomes O(n²)", "Points on each side are ≥ d apart, so a d × 2d box holds at most 8 of them", "The strip is sorted by x, so only the next 7 points in x order can lie within d"]
  answer: 2
  explanation: >-
    Within one side, all points are ≥ d apart (d is the best distance found in that half), so a bounded region holds boundedly many. The strip itself can contain all n points; what is bounded is how many fit in one d × 2d window. Sorting the strip by y and breaking when the y gap reaches d limits comparisons to a constant (at most 7) per point.
- q: >-
    Boyer–Moore's single pass returns candidate 7 on an array. What must you do before returning 7 as the majority element?
  options: ["Count 7's occurrences in a second pass and check the count exceeds n/2", "Nothing, since the cancellation argument guarantees the survivor is the majority", "Check that the pass ended with a positive counter, which proves 7 exceeds n/2", "Run the pass again in reverse and check it also returns 7 as the candidate"]
  answer: 0
  explanation: >-
    The cancellation argument guarantees the majority survives if one exists. If no element has more than n/2 occurrences, the surviving candidate is arbitrary, and a positive final counter proves nothing: [1, 2, 3] ends with candidate 3 and counter 1 but has no majority. The verification pass makes the algorithm correct on all inputs.
- q: >-
    Production linear-algebra libraries multiply 500 × 500 matrices with the O(n³) algorithm rather than Strassen. Why?
  options: ["Cache blocking lowers the triple loop's exponent to 2.807, matching Strassen anyway", "It only works on power-of-two sizes, and padding 500 up to 512 costs too much", "Its seven products are valid only for symmetric matrices, which BLAS cannot assume", "Its constants and numerical instability outweigh the gain below a few thousand rows"]
  answer: 3
  explanation: >-
    Strassen's seven products come with eighteen block additions, temporaries, and worse rounding behaviour; the cache-blocked, SIMD-vectorised triple loop wins until the n^0.19 gap becomes large. Blocking improves the constant factor, not the exponent, and Strassen works on any matrices (odd sizes can be padded or peeled). Asymptotics describe the limit, not your matrix.
- q: >-
    In the closest-pair trace, the strip sorted by y is (8,1), (5,4), (6,5) with d = 5. Why is (8,1) never compared with (5,4)?
  options: ["Their y gap squared is 9, at least d, so that pair and every later one in y order are too far apart", "Their x gap is 3, more than the strip half-width, so (8,1) is not really in the strip", "The strip is scanned from the top, so (8,1) is only compared with points above it", "They lie on the same side of the dividing line, and same-side pairs were handled by the recursion"]
  answer: 0
  explanation: >-
    The inner loop breaks as soon as the y gap squared reaches d, because the strip is sorted by y and every later point is even further down. (8,1) and (5,4) are on opposite sides of x = 6, so the recursion never saw them; both are inside the strip because (8 − 6)² = 4 and (5 − 6)² = 1 are below 5. The break is what keeps the combine step linear, and here it also happens to be correct: their true squared distance is 18.
```
