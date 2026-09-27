---
slug: classic-divide-and-conquer
title: "Classic divide and conquer: exponentiation, Karatsuba, closest pair, majority"
description: Five algorithms where the recurrence explains the win, from squaring your way to a^n in log n steps to the three-multiplication trick that beats schoolbook multiplication, the strip argument in closest pair, and why Strassen's seven products matter.
minutes: 50
difficulty: medium
tags: [divide-and-conquer, fast-exponentiation, karatsuba, closest-pair, majority-element, strassen, recurrence]
problems: [pow-x-n, kth-largest-array, median-two-sorted]
---
Every algorithm in this lesson was, at the time it was found, a surprise. Multiplying two `n`-digit numbers was "obviously" `n²` work until Karatsuba showed it was not in 1960, in direct response to Kolmogorov's conjecture that it was. Multiplying two matrices was "obviously" `n³` until Strassen found seven products where everyone had used eight. Finding the closest pair of points was "obviously" a comparison of every pair until the strip argument reduced it to `n log n`. In each case the surprise came from the same place: a recurrence where the number of subproblems, or the cost of combining them, was one notch better than the naive decomposition.

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

The `% m` on every multiplication is not optional in practice: without it the intermediate values grow to `n` bits and each multiplication becomes as slow as the problem you were avoiding. This is the algorithm behind RSA (`c = m^e mod N` with a 2048-bit exponent takes about 2048 squarings, not 2^2048 multiplications), behind Diffie–Hellman, behind computing large Fibonacci numbers by raising a 2 × 2 matrix to a power, and behind every "compute `x^n` for a negative or huge `n`" interview question ([Pow(x, n)](/practice/pow-x-n) is this with floats and a negative-exponent edge case).

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

For 1,000-digit numbers, `n²` is a million digit-multiplications and `n^1.585` is about 57,000. Python's `int` switches to Karatsuba above about 70 digits; GMP uses Karatsuba, then Toom-Cook (a five-way split with nine multiplications instead of twenty-five), then FFT-based multiplication for numbers with tens of thousands of digits, which is where the [next lesson](/learn/algorithms/divide-and-conquer/fft-intuition) picks up. The lesson for interviews is not the code; it is the move: **find an algebraic identity that lets you recover a needed product from fewer multiplications**, and let the recurrence tell you what you gained.

## Strassen: the same move on matrices

Multiplying two `n × n` matrices by splitting each into four `n/2 × n/2` blocks needs eight block products: $T(n) = 8T(n/2) + O(n^2) = O(n^3)$, the same as the triple loop. Strassen found seven products of sums and differences of the blocks from which all four output blocks can be assembled: $T(n) = 7T(n/2) + O(n^2) = O(n^{\log_2 7}) \approx O(n^{2.807})$.

You are not expected to memorise the seven products. You are expected to know three things. First, that the exponent 2.807 comes from `log₂ 7` and would be `log₂ 8 = 3` with one more product, which is the whole insight in one line. Second, that Strassen's constant factor and numerical instability mean production BLAS libraries use the `n³` algorithm with cache-blocking and SIMD for matrices below a few thousand on a side, and Strassen only above that; "asymptotically better" and "faster on your workload" are different claims. Third, that the theoretical exponent has been pushed to about 2.37 by algorithms that are galactic (their constants make them useless at any physical size), which is a useful phrase to have when someone cites a paper.

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

Two practical notes. Compare squared distances to avoid square roots and floating-point comparisons entirely when the coordinates are integers. And notice the `break`: without it the inner loop is `O(n)` per strip point and the whole combine step is quadratic again; the 7-neighbour bound is what the `break` enforces in practice.

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

The generalisation ("elements appearing more than `n/k` times") keeps `k − 1` candidates and cancels `k`-tuples of distinct elements, still in `O(n)` time and `O(k)` space. This is the algorithm behind heavy-hitter detection in streaming systems, and the count-min sketch in the [probabilistic structures module](/learn/advanced-data-structures/probabilistic-structures/count-min-sketch-and-hyperloglog) is its approximate cousin.

## Single-sided recursion: when one half is enough

The algorithms above recurse into both halves. The ones that recurse into *one* get a better recurrence: $T(n) = T(n/2) + O(n) = O(n)$ (case 3, the root dominates) or $T(n/2) + O(1) = O(\log n)$. Binary search is the second. Quickselect, which partitions around a pivot and recurses only into the side containing the `k`-th element, is the first; it finds a median in expected linear time and is the answer to [Kth Largest Element](/practice/kth-largest-array) when the interviewer says "faster than sorting". Median of medians makes the pivot choice deterministic with a recurrence, $T(n) = T(n/5) + T(7n/10) + O(n)$, whose two pieces sum to `9n/10 < n`, which is why it is still linear.

```viz
{"type": "recursion", "algorithm": "binary-search-recursive", "values": [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], "target": 23,
 "title": "Single-sided recursion: each call discards half"}
```

The habit these give you: when a divide-and-conquer recurrence comes out to $O(n \log n)$ and you need linear, ask whether you can decide *which* half contains the answer without solving both.

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
- You know Strassen's exponent comes from `log₂ 7`, that BLAS does not use it below a few thousand rows, and the phrase "galactic algorithm" for the 2.37 results.
- You can give the packing argument for why each strip point in closest pair is compared with at most 7 others, and you know the `break` is what makes it linear.
- You reach for Boyer–Moore for majority and can explain the cancellation argument and the necessity of the verification pass.
- You know single-sided recursion turns `n log n` into `n` (quickselect) or `log n` (binary search), and you ask "which half has the answer" before recursing into both.

## Check yourself

```quiz
- q: >-
    Computing a^n by repeated squaring on arbitrary-precision integers without a modulus is NOT O(log n) time. Why?
  options: ["Because squaring is O(1) only for small n", "Because the intermediate numbers grow to n·log a bits, so each multiplication gets more expensive and the last ones dominate", "Because the recursion depth is n", "It is O(log n); the statement is false"]
  answer: 1
  explanation: >-
    The count of multiplications is O(log n), but a multiplication of k-bit numbers is not constant time. The final squaring handles numbers with roughly n·log₂ a bits. With a modulus every operand stays bounded, which is why modular exponentiation is genuinely fast.
- q: >-
    Karatsuba's algorithm replaces four half-size multiplications with three. What is the resulting complexity exponent, and where does it come from?
  options: ["1.5, from 3/2", "log₂ 3 ≈ 1.585, the number of leaves in a recursion tree with 3 children per node and log₂ n depth", "2, unchanged; the additions cost as much as the saved multiplication", "log₃ 2 ≈ 0.63"]
  answer: 1
  explanation: >-
    T(n) = 3T(n/2) + O(n) falls in master-theorem case 1: the leaves dominate and there are 3^(log₂ n) = n^(log₂ 3) of them. The extra additions are linear and absorbed.
- q: >-
    In the closest-pair combine step, why can each point in the strip be compared with only a constant number of others?
  options: ["Because the strip contains at most 8 points", "Because points in the strip are at least d apart within each half, so a d × 2d rectangle holds at most 8 of them, and anything further down in y than d cannot be closer", "Because the strip is sorted by x", "It cannot; the combine step is O(n²) in the worst case"]
  answer: 1
  explanation: >-
    Within one side, all points are ≥ d apart (d is the best distance found in that half), so a bounded region holds boundedly many. Sorting the strip by y and breaking when the y gap reaches d limits comparisons to a constant per point.
- q: >-
    Boyer–Moore's single pass returns candidate 7 on an array. What must you do before returning 7 as the majority element?
  options: ["Nothing; the candidate is always the majority", "Count 7's occurrences in a second pass and check the count exceeds n/2", "Run the pass again in reverse", "Sort the array"]
  answer: 1
  explanation: >-
    The cancellation argument guarantees the majority survives if one exists. If no element has more than n/2 occurrences, the surviving candidate is arbitrary. The verification pass makes the algorithm correct on all inputs.
- q: >-
    Production linear-algebra libraries multiply 500 × 500 matrices with the O(n³) algorithm rather than Strassen. Why?
  options: ["Strassen is incorrect for non-power-of-two sizes", "Strassen's constant factor, extra memory and numerical instability outweigh the asymptotic gain until n is in the thousands", "The O(n³) algorithm is also O(n^2.807) with good blocking", "Strassen requires the matrices to be symmetric"]
  answer: 1
  explanation: >-
    Strassen's seven products come with eighteen block additions, temporaries, and worse rounding behaviour; the cache-blocked, SIMD-vectorised triple loop wins until the n^0.19 gap becomes large. Asymptotics describe the limit, not your matrix.
```
