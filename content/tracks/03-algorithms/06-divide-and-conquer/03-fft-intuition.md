---
slug: fft-intuition
title: "FFT intuition: multiplying polynomials in n log n"
description: Why coefficient multiplication is a convolution, why evaluating at roots of unity turns it into pointwise products, how the even/odd split gives the n log n recurrence, and where the FFT is hiding in systems you already use.
minutes: 40
difficulty: hard
tags: [divide-and-conquer, fft, convolution, polynomial-multiplication, roots-of-unity, signal-processing]
problems: [multiply-strings]
---
Multiply two polynomials of degree `n` and you compute every product of a coefficient from one with a coefficient from the other: `n²` multiplications. Multiply two `n`-digit integers and it is the same computation with carries. Correlate two signals of length `n`, blur an image with a kernel, count for every sum `s` how many pairs `(a, b)` from two lists add to `s`, or compute the distribution of the sum of two dice-like random variables: all of these are the same `n²` loop, called a **convolution**. The fast Fourier transform does it in `O(n log n)`, and it does so with a divide-and-conquer recurrence that is, structurally, merge sort.

You will almost never implement an FFT at work; a library does it in a few thousand lines of carefully vectorised code. But knowing *why* it works lets you recognise a convolution in a problem that does not mention polynomials, and that recognition turns a hopeless `n²` into a routine `n log n`. That is the goal of this lesson: the idea, the recurrence, and the disguises.

## Multiplication is convolution

Write `A(x) = a₀ + a₁x + a₂x²` and `B(x) = b₀ + b₁x`. The product's coefficient of `x^k` is the sum of all `aᵢ · bⱼ` with `i + j = k`:

```python
def multiply(a, b):                        # coefficient lists, lowest degree first
    if not a or not b:
        return []
    out = [0] * (len(a) + len(b) - 1)
    for i, ai in enumerate(a):
        for j, bj in enumerate(b):
            out[i + j] += ai * bj
    return out
```

`multiply([1, 2, 3], [4, 5])` gives `[4, 13, 22, 15]`: `1·4`, then `1·5 + 2·4`, then `2·5 + 3·4`, then `3·5`. That `out[i + j] += aᵢ · bⱼ` is the convolution, written `a ∗ b`, and it costs `O(n · m)`. The integers `123 × 45` are the same computation with `x = 10` and carries applied afterwards: `[4, 13, 22, 15]` becomes 4·1000 + 13·100 + 22·10 + 15 = 5535, which is indeed 123 × 45. [Multiply Strings](/practice/multiply-strings) is exactly this loop with carries.

## The other representation: values instead of coefficients

A polynomial of degree less than `n` is determined by its `n` coefficients, but it is *also* determined by its values at any `n` distinct points (that is polynomial interpolation: `n` points, unique polynomial of degree `< n` through them). In the value representation multiplication is trivial: `(A · B)(x) = A(x) · B(x)`, so multiply the values pointwise, `O(n)` for `n` points.

That suggests a plan for multiplying degree-`n` polynomials:

1. Evaluate `A` and `B` at `2n` points (the product has degree up to `2n`).
2. Multiply the values pointwise: `2n` multiplications.
3. Interpolate the `2n` products back into coefficients.

Concretely, with `A = 1 + 2x + 3x²` and `B = 4 + 5x`, evaluate both at the four points `0, 1, −1, 2`: `A` gives `1, 6, 2, 17` and `B` gives `4, 9, −1, 14`. The pointwise products `4, 54, −2, 238` are the values of `A · B` at those points, and the unique cubic through `(0, 4), (1, 54), (−1, −2), (2, 238)` is `4 + 13x + 22x² + 15x³`, the same coefficients the double loop produced. The multiplication itself took four scalar products.

Naively, step 1 costs `O(n)` per point by Horner's rule, so `O(n²)` for `2n` points, and step 3 is worse. The plan only helps if evaluation and interpolation can be done fast. They can, if you choose the points with care.

## Choose the points so that halving works

Evaluate `A(x)` at `x` and at `−x`. Split `A` into even-indexed and odd-indexed coefficients: `A(x) = E(x²) + x · O(x²)`, where `E` and `O` are polynomials of half the degree. Then `A(−x) = E(x²) − x · O(x²)`: the same two half-size evaluations, combined with a sign flip. So evaluating `A` at `n` points that come in `±` pairs costs two half-size evaluations at `n/2` points (the squares), plus `O(n)` combining.

For the recursion to continue, the `n/2` squared points must *also* come in `±` pairs, and their squares too, all the way down. Real numbers cannot do this (squares are never negative), but complex numbers can: the `n`-th **roots of unity**, `ω^k = e^(2πik/n)` for `k = 0 … n−1`, are `n` points on the unit circle whose squares are exactly the `n/2`-th roots of unity, which again pair up as `±`, and so on. The recurrence is

$$ T(n) = 2T(n/2) + O(n) = O(n \log n), $$

the same as merge sort, with the merge replaced by the butterfly `E(ω²) ± ω · O(ω²)`.

```viz
{"type": "recursion", "algorithm": "merge-sort-tree", "values": [5, 3, 2, 1, 4, 6, 7, 0],
 "title": "The FFT's recursion tree has merge sort's shape: split even/odd, combine in O(n)"}
```

```python
import cmath

def fft(a):                                   # len(a) must be a power of two
    n = len(a)
    if n == 1:
        return a[:]
    even, odd = fft(a[0::2]), fft(a[1::2])
    out = [0] * n
    for k in range(n // 2):
        w = cmath.exp(2j * cmath.pi * k / n) * odd[k]
        out[k] = even[k] + w                  # A(ω^k)
        out[k + n // 2] = even[k] - w         # A(ω^(k + n/2)) = A(−ω^k)
    return out
```

Evaluating at roots of unity is the **discrete Fourier transform**; the recursion above is the Cooley–Tukey FFT of 1965 (rediscovered; Gauss had it in 1805). The name "Fourier" comes from the fact that evaluating at `e^(2πik/n)` is the same as decomposing the coefficient sequence into frequencies, which is why the same algorithm does audio spectra, image compression and polynomial multiplication.

## Interpolation is the same transform, reversed

The last piece is step 3, turning `2n` values at roots of unity back into coefficients. The DFT is a linear map (a matrix whose entry `(j, k)` is `ω^(jk)`), and its inverse is nearly the same matrix: replace `ω` by `ω⁻¹` and divide by `n`. So the inverse FFT is the FFT with a conjugated root and a final scaling: `O(n log n)` again, no separate interpolation algorithm.

The complete multiplication:

```python
def fft_multiply(a, b):
    n = 1
    while n < len(a) + len(b) - 1:
        n *= 2
    fa = fft(a + [0] * (n - len(a)))
    fb = fft(b + [0] * (n - len(b)))
    prod = [x * y for x, y in zip(fa, fb)]
    coeffs = inverse_fft(prod)                # fft with ω⁻¹, divided by n
    return [round(c.real) for c in coeffs][: len(a) + len(b) - 1]
```

Three transforms and one linear pass: `O(n log n)`. The `round(c.real)` is the honest part: floating-point FFT introduces errors around `10⁻¹²` relative, which is fine for coefficients up to about `10⁹` in double precision and dangerous beyond. Integer-exact variants exist (the number-theoretic transform, NTT, works modulo a prime `p` where `p − 1` is divisible by a large power of two, using modular roots of unity instead of complex ones) and are what competitive programmers and cryptographic libraries actually use.

## Where the convolution hides

The senior skill is spotting a convolution that is not labelled as one.

- **Pair-sum counting.** Given lists `A` and `B` of small non-negative integers, how many pairs sum to each `s`? Build histograms `hA[v]` and `hB[v]`; the answer is `hA ∗ hB`. Same for "how many pairs of dice rolls sum to 7 across two loaded dice".
- **Pattern matching with wildcards.** The number of mismatches between a pattern and every window of a text can be written as a sum of products of indicator sequences, which is a convolution. "Does the pattern with `?` wildcards match at position `i`" for every `i` in `O(n log n)` rather than `O(nm)`.
- **Big integer multiplication.** GMP and Python (via the `decimal` module's libmpdec for very large numbers) switch to FFT/NTT multiplication for operands of tens of thousands of digits. Computing a million digits of π is an FFT workload.
- **Signal processing.** Every audio equaliser, every noise-cancelling headphone, every JPEG (via the closely related discrete cosine transform), every MRI reconstruction, every 5G modem. The reason a `2048`-sample audio filter can run in real time on a phone is the `O(n log n)`.
- **Convolutional neural networks.** Small kernels are convolved directly (Winograd's algorithm is the Karatsuba of that world), but large-kernel convolutions and some inference libraries use FFT-based convolution.
- **Sums of subsets, generating functions.** "How many ways to pick one item from each of `k` groups with total value `s`" is a product of `k` polynomials, and a product of many polynomials is a sequence of FFT multiplications.

If a problem asks for a *count for every possible total* over pairs, or a *sliding score* of one sequence against another, write the quantity as `Σ f(i) · g(k − i)` and see if it fits. When it does, the `n²` loop is a library call away from `n log n`.

## What to say and what not to implement

In an interview, the FFT is a thing you mention, not a thing you write. "This is a convolution; naive is `O(n²)`, FFT gets `O(n log n)`; for the sizes in this problem naive is fine, and if `n` were 10⁶ I would use a library FFT or NTT" is a complete senior answer. Writing a correct iterative FFT with bit-reversal under time pressure is a competitive-programming skill, and even there people paste a template.

At work, the same applies with more force: `numpy.fft`, FFTW, cuFFT and Accelerate are among the most optimised code on the planet. Reach for `scipy.signal.fftconvolve` and check its threshold logic: it uses direct convolution for small kernels because the FFT's constant factor (three transforms, complex arithmetic, padding to a power of two) loses below a few hundred elements. That crossover is the same story as Strassen and Karatsuba: the asymptotic winner is not the winner at every size.

## Exercises

```exercise
id: multiply-polynomials
title: Polynomial multiplication (convolution)
prompt: |
  Implement `multiply_polynomials(a, b)`. `a` and `b` are coefficient lists,
  lowest degree first (`[1, 2, 3]` is `1 + 2x + 3x²`). Return the product's
  coefficient list of length `len(a) + len(b) - 1`, or `[]` if either input
  is empty. The direct O(n·m) convolution is expected here; the point is to
  get the index arithmetic `out[i + j] += a[i] * b[j]` exactly right.
languages: [python, javascript]
entry: multiply_polynomials
starter:
  python: |
    def multiply_polynomials(a, b):
        return []
  javascript: |
    function multiply_polynomials(a, b) {
      return [];
    }
tests:
  - args: [[1, 1], [1, 1]]
    expected: [1, 2, 1]
    label: (1 + x)²
  - args: [[1, 2, 3], [4, 5]]
    expected: [4, 13, 22, 15]
  - args: [[0], [1, 2]]
    expected: [0, 0]
    label: multiplying by zero keeps the length
  - args: [[], [1]]
    expected: []
  - args: [[2], [3]]
    expected: [6]
    hidden: true
  - args: [[1, 0, -1], [1, 0, 1]]
    expected: [1, 0, 0, 0, -1]
    hidden: true
    label: (1 − x²)(1 + x²)
  - args: [[1, -1], [1, -1]]
    expected: [1, -2, 1]
    hidden: true
hints:
  - "Allocate `len(a) + len(b) - 1` zeros, then double loop."
  - "The coefficient of x^(i+j) collects every product a[i]·b[j]; accumulate, do not assign."
```

```exercise
id: pair-sum-counts
title: Pair-sum histogram as a convolution
prompt: |
  `a` and `b` are lists of non-negative integers. Return a list `count` where
  `count[s]` is the number of index pairs `(i, j)` with `a[i] + b[j] == s`,
  for `s` from `0` to `max(a) + max(b)` inclusive. Return `[]` if either
  list is empty.

  Build the two value histograms and convolve them; the result is the same
  as the polynomial product of the histograms.
languages: [python, javascript]
entry: pair_sum_counts
starter:
  python: |
    def pair_sum_counts(a, b):
        # histogram of a, histogram of b, then convolve
        return []
  javascript: |
    function pair_sum_counts(a, b) {
      // histogram of a, histogram of b, then convolve
      return [];
    }
tests:
  - args: [[1, 2], [1, 2]]
    expected: [0, 0, 1, 2, 1]
  - args: [[0], [0]]
    expected: [1]
  - args: [[1, 1, 1], [1]]
    expected: [0, 0, 3]
    label: repeated values multiply
  - args: [[], [1, 2]]
    expected: []
  - args: [[0, 3], [0, 3]]
    expected: [1, 0, 0, 2, 0, 0, 1]
    hidden: true
  - args: [[2, 2], [1]]
    expected: [0, 0, 0, 2]
    hidden: true
hints:
  - "`hist_a` has length `max(a) + 1`; `hist_a[v]` counts occurrences of `v`."
  - "The convolution of the two histograms has length `max(a) + max(b) + 1`, exactly the required output."
  - "You can reuse `multiply_polynomials` from the previous exercise."
```

## Senior signals

- You can write the convolution sum `Σ aᵢ·b_{k−i}` from memory and recognise it in integer multiplication, pair-sum counting, sliding correlation and generating functions.
- You explain the FFT as "evaluate at roots of unity so the even/odd split recurses, multiply pointwise, invert with the conjugate transform" and you know the recurrence is merge sort's.
- You know floating-point FFT loses exactness for large integer coefficients and that NTT is the integer-exact alternative.
- You know the library crossover: direct convolution wins for small kernels, FFT for large ones, and you check the threshold rather than assuming.
- You name the FFT as a technique in interviews and use a library at work, and you can say why both are the right call.
- You can point to concrete systems running FFTs at scale (audio, imaging, modems, big-integer arithmetic) rather than describing it as a maths curiosity.

## Check yourself

```quiz
- q: >-
    Why does evaluating a polynomial at the n-th roots of unity allow the even/odd recursion to continue down to size 1?
  options: ["The even/odd split halves the degree, and that works for any set of n points", "They are evenly spaced on the real line, so each half is again evenly spaced", "Their squares are the n/2-th roots of unity, which again come in ± pairs", "Their magnitude is 1, so values never overflow as the recursion goes deeper"]
  answer: 2
  explanation: >-
    The split A(x) = E(x²) + x·O(x²) saves work only when the evaluation points come in ± pairs, so that x and −x share the half-size evaluations. The degree halves for any point set, but without ± pairs the number of points to evaluate would not. Roots of unity (complex points on the unit circle) are closed under squaring in exactly the way that keeps this true at every level; real point sets are not.
- q: >-
    You need the product of two polynomials with integer coefficients around 10^15 and degree 10^5. What goes wrong with a double-precision FFT?
  options: ["The product's length is not a power of two, so the transform cannot be applied", "Doubles cannot represent inputs as large as 10^15, so they are corrupted on load", "Nothing; the final round() step removes any floating-point error in the result", "Rounding error exceeds 0.5, so rounding back gives the wrong integers; use an NTT"]
  answer: 3
  explanation: >-
    Products of 10^15-scale values summed over 10^5 terms reach 10^35, far beyond the ~10^16 relative precision of doubles, so the error in each output is far larger than 1 and round() snaps to the wrong integer. The inputs themselves are fine (10^15 is below 2^53), and padding handles any length. Number-theoretic transforms work modulo a prime and stay exact; splitting each coefficient into smaller chunks is the other standard fix.
- q: >-
    Which problem is a convolution in disguise?
  options: ["Check whether two arrays are permutations of each other", "Find the maximum of a[i] + b[j] over all pairs (i, j)", "For each s, count pairs (i, j) with a[i] + b[j] = s", "Count pairs (i, j) with i < j and a[i] > a[j] in one array"]
  answer: 2
  explanation: >-
    Counting pairs by sum is the product of the two value histograms: count[s] = Σ_v histA[v]·histB[s − v], the convolution sum, with an answer for every total. The maximum pair sum is just max(a) + max(b); the permutation check is a sort or a hash count; and inversion counting compares values rather than summing them, which is merge sort's job.
- q: >-
    scipy.signal.fftconvolve chooses direct convolution for small inputs despite the FFT's better complexity. Why?
  options: ["The FFT's rounding error is largest on small inputs, so direct is more accurate", "Small inputs are rarely powers of two, and the FFT is only valid on those sizes", "The FFT's constant factor is large enough that O(n·m) wins on small inputs", "Direct convolution is O(n + m) for small kernels, beating O(n log n) outright"]
  answer: 2
  explanation: >-
    Asymptotics describe the limit. Three transforms, complex arithmetic and zero-padding give the FFT a large constant factor, so below a few hundred elements the O(n·m) loop with tiny constants beats O(n log n) with large ones, the same story as Strassen versus blocked matrix multiplication and Karatsuba versus schoolbook. Padding makes any size work, and the choice is about speed, not accuracy.
- q: >-
    How is the inverse FFT related to the forward FFT?
  options: ["The same FFT run on the reversed value array, with no scaling needed", "The same FFT applied twice, since two DFTs in a row return the input", "A different O(n²) interpolation, run once, so it does not dominate the cost", "The same FFT with ω replaced by ω⁻¹ and the result divided by n"]
  answer: 3
  explanation: >-
    The DFT matrix's inverse is its conjugate divided by n, so interpolation reuses the evaluation code. Applying the forward transform twice does not return the input; it returns n times the index-reversed input, which is why the conjugated root and the 1/n are needed. That symmetry is why polynomial multiplication is three transforms plus a linear pass and nothing more.
```
