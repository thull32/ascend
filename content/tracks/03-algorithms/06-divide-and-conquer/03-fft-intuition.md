---
slug: fft-intuition
title: "FFT intuition: multiplying polynomials in n log n"
description: Why coefficient multiplication is a convolution, why evaluating at roots of unity turns it into pointwise products, how the even/odd split gives the n log n recurrence, and where the FFT is hiding in systems you already use.
minutes: 50
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
{"type": "recursion", "algorithm": "merge-sort-tree", "split": "even-odd", "values": ["a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7"],
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

### Eight points, butterfly by butterfly

Run the code on `a = [1, 1, 1, 1, 0, 0, 0, 0]` (the polynomial `1 + x + x² + x³`). The recursion splits even and odd indices twice, so the size-1 base cases arrive in **bit-reversed** order: positions `0, 4, 2, 6, 1, 5, 3, 7` (write each index in three bits and reverse the bits: `1 = 001 → 100 = 4`). Their values are `1, 0, 1, 0, 1, 0, 1, 0`. The twiddle factors for `n = 8`, with this code's sign convention `ω = e^(2πi/8)`, are:

| `k` | `ω₈^k` exact | as a complex number |
|---|---|---|
| 0 | 1 | `1` |
| 1 | `(1 + i)/√2` | `0.707 + 0.707i` |
| 2 | `i` | `i` |
| 3 | `(−1 + i)/√2` | `−0.707 + 0.707i` |

Each butterfly takes `E[k]` and `O[k]`, computes `w = ω^k · O[k]`, and emits `E[k] + w` at index `k` and `E[k] − w` at index `k + n/2`.

| Stage | Inputs `E`, `O` | `k` | `ω^k · O[k]` | `out[k]` | `out[k + n/2]` |
|---|---|---|---|---|---|
| `n = 2`, four times | `1`, `0` | 0 | 0 | 1 | 1 |
| `n = 4`, twice | `[1, 1]`, `[1, 1]` | 0 | 1 | 2 | 0 |
| | | 1 | `i · 1 = i` | `1 + i` | `1 − i` |
| `n = 8`, once | `[2, 1+i, 0, 1−i]`, same | 0 | 2 | 4 | 0 |
| | | 1 | `(0.707 + 0.707i)(1 + i) = 1.414i` | `1 + 2.414i` | `1 − 0.414i` |
| | | 2 | `i · 0 = 0` | 0 | 0 |
| | | 3 | `(−0.707 + 0.707i)(1 − i) = 1.414i` | `1 + 0.414i` | `1 − 2.414i` |

Result: `X = [4, 1 + 2.414i, 0, 1 + 0.414i, 0, 1 − 0.414i, 0, 1 − 2.414i]`. Check one entry directly: `A(ω) = 1 + ω + ω² + ω³ = 1 + (0.707 + 0.707i) + i + (−0.707 + 0.707i) = 1 + 2.414i`, and `A(1) = 4` because all four coefficients are 1. A direct evaluation of all eight values agrees to `10⁻¹⁵`. The zeros at even indices above 0 are the polynomial's roots: `1 + x + x² + x³ = 0` at `x = −1, i, −i`, which are `ω⁴, ω², ω⁶`.

Count the work: `n/2 = 4` butterflies per stage, `log₂ 8 = 3` stages, 12 butterflies of one complex multiplication and two additions, against 64 multiplications for the direct `n²` evaluation. In general `(n/2) · log₂ n` butterflies, each `O(1)`: that is the `n log n`. NumPy's convention is `e^(−2πi/n)`, so `numpy.fft.fft(a)` returns the complex conjugates of the values above; either sign is a valid DFT as long as the inverse uses the opposite one.

Evaluating at roots of unity is the **discrete Fourier transform**; the recursion above is the Cooley–Tukey FFT of 1965, a rediscovery: Heideman, Johnson and Burrus (IEEE ASSP Magazine, 1984) traced the same idea to a Gauss treatise probably written in 1805 and published only posthumously in 1866. The name "Fourier" comes from the fact that evaluating at `e^(2πik/n)` is the same as decomposing the coefficient sequence into frequencies, which is why the same algorithm does audio spectra, image compression and polynomial multiplication.

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

Three transforms and one linear pass: `O(n log n)`. The padding to `n ≥ len(a) + len(b) − 1` is not optional. Pointwise products of length-`n` transforms compute the **circular** convolution: any coefficient at index `k ≥ n` wraps around to `k − n`. Multiply `[1, 2, 3]` by `[4, 5, 6]`: the true product is `[4, 13, 28, 27, 18]`, five coefficients. With `n = 8` the code returns exactly that. With `n = 4` the fifth coefficient, 18, wraps onto index 0 and the result is `[22, 13, 28, 27]`: three right entries and one silently corrupted, with no error raised.

The `round(c.real)` is the honest part: floating-point FFT introduces errors around `10⁻¹²` relative, which is fine for coefficients up to about `10⁹` in double precision and dangerous beyond. Measured with this lesson's textbook recursive `fft`: two random polynomials of 512 coefficients each below `10⁶` give products near `1.3 × 10¹⁴` with a worst error of 0.05; at 4,096 coefficients each, products near `10¹⁵` come back with a worst error of 0.5, exactly the point where `round` starts returning the wrong integer. Library FFTs have a smaller constant, but the same scaling: the error grows with the magnitude of the output and, slowly, with `log n`. Integer-exact variants exist (the number-theoretic transform, NTT, works modulo a prime `p` where `p − 1` is divisible by a large power of two, using modular roots of unity instead of complex ones) and are what competitive programmers and cryptographic libraries actually use.

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

At work, the same applies with more force: `numpy.fft`, FFTW, cuFFT and Accelerate are among the most optimised code on the planet. Reach for `scipy.signal.convolve(method="auto")` and check its threshold logic: it uses direct convolution for small kernels, and `fftconvolve` only when that pays, because the FFT's constant factor (three transforms, complex arithmetic, padding to a power of two) loses below a few hundred elements. That crossover is the same story as Strassen and Karatsuba: the asymptotic winner is not the winner at every size.

## Under the hood

**`numpy.fft`.** NumPy's transforms are pocketfft, a C implementation adopted in NumPy 1.17 to replace the Fortran-derived FFTPACK; NumPy 2 uses the C++ version of the same library, as did SciPy's `scipy.fft` until [SciPy 1.18](https://docs.scipy.org/doc/scipy/release/1.18.0-notes.html) (2026) moved to its successor, `ducc0.fft`. pocketfft is mixed-radix: it factors `n` into 2, 3, 5, 7 and 11 and runs a specialised butterfly for each factor, and for lengths with a large prime factor it switches to Bluestein's algorithm, which turns a length-`n` DFT into a convolution of a convenient length. So padding to a power of two is a speed choice with these libraries, not a correctness requirement, and `numpy.fft.fft` of a length-1000 array is fine. For real input, `numpy.fft.rfft` returns only the `n/2 + 1` non-redundant bins, because the spectrum of a real sequence satisfies `X[n − k] = conj(X[k])`; that halves the work and the memory, and `irfft` inverts it. The output is `complex128` (or `float64` from `irfft`) for integer or `float64` input (since NumPy 2.0 a `float32` input stays in single precision), which is why the polynomial code rounds and casts at the end.

**`scipy.signal`.** `fftconvolve` pads both inputs to a fast length (`scipy.fft.next_fast_len`, not necessarily a power of two), runs `rfft` on both, multiplies, and inverts. `scipy.signal.convolve(method="auto")` calls `choose_conv_method`, which estimates the cost of the direct and FFT paths from the sizes and picks the cheaper one, and `oaconvolve` implements overlap-add for a long signal against a short kernel, which beats one giant FFT because the transforms stay small. FFTW, the C library behind MATLAB's `fft` and many other packages, goes further: it *plans* each transform size by timing candidate algorithms at start-up (`FFTW_MEASURE`) and caches the choice as "wisdom".

**Exact integers: the NTT.** Replace the complex `e^(2πi/n)` with a primitive `n`-th root of unity modulo a prime `p` whose `p − 1` is divisible by a large power of two. The prime `998244353 = 119 · 2²³ + 1` with primitive root 3 supports transforms of length up to `2²³ ≈ 8.4 × 10⁶` and fits every intermediate product in 64-bit arithmetic. Results are exact modulo `p`; for coefficients larger than `p`, run two or three NTTs with different primes and combine with the Chinese remainder theorem. This is what competitive-programming libraries, some big-integer implementations, and lattice-based cryptography (Kyber's polynomial multiplication is an NTT over `q = 3329`) use.

**The lineage.** Karatsuba, in the [previous lesson](/learn/algorithms/divide-and-conquer/classic-divide-and-conquer), is evaluation and interpolation at three points (`0`, `1` and "infinity"); Toom-3 uses five points; the FFT uses `n` roots of unity so that evaluation itself becomes a divide-and-conquer with the recurrence from the [thinking lesson](/learn/algorithms/divide-and-conquer/divide-and-conquer-thinking). Schönhage–Strassen integer multiplication, GMP's top tier, is an FFT over a ring chosen so the arithmetic stays exact.

## Quantified costs

- **Butterflies.** `(n/2) log₂ n`: 12 for `n = 8`, `20 × 2¹⁹ ≈ 1.05 × 10⁷` for `n = 2²⁰`. A direct DFT of `2²⁰` points is `2⁴⁰ ≈ 10¹²` complex multiplications, a factor of `10⁵`.
- **Wall clock.** A tuned library transforms `2²⁰` complex doubles in on the order of ten milliseconds on one core (depends on the machine and cache; order of magnitude). The pure-Python recursive `fft` in this lesson is about a thousand times slower and allocates a list per call.
- **Memory.** `complex128` is 16 bytes, so a `2²⁰`-point transform is 16 MB per array; polynomial multiplication holds three of them plus the padding. `rfft` halves that for real input.
- **Multiplying two polynomials of `10⁶` coefficients.** Pad to `2²¹`, three transforms of `21 × 2²⁰ ≈ 2.2 × 10⁷` butterflies each, about `6.6 × 10⁷` in total: well under a second in a library. The direct convolution is `10¹²` multiply-adds.
- **Precision.** Double precision carries about 16 significant digits. With the textbook FFT, outputs near `10¹⁴` came back within 0.05 and outputs near `10¹⁵` within 0.5 in the measurement above; above that, rounding fails. Keep `max(a) · max(b) · min(len(a), len(b))` below roughly `10¹⁴` for a floating-point FFT, or use an NTT.
- **Crossover.** Direct convolution wins for kernels shorter than a few dozen to a few hundred taps (the exact point depends on the library and sizes, which is why `choose_conv_method` estimates from the actual sizes, and can time both paths with `measure=True`, instead of assuming).

## Trade-offs

| Method | Time | Exact for integers? | Size limit | Constant factor | Use it when |
|---|---|---|---|---|---|
| Direct convolution | `O(n · m)` | yes | none | tiny | one input is short, or both are under a few hundred |
| Karatsuba-style splitting | `O(n^1.585)` | yes | none | small | integers of hundreds to thousands of digits |
| Floating-point FFT | `O(n log n)` | only after rounding, outputs below about `10¹⁴` | memory | three transforms, complex arithmetic | signals, floats, moderate integer sizes |
| NTT | `O(n log n)` | yes, modulo `p` (CRT for larger) | `2²³` for the common prime | modular multiplications | exact big integers, counting problems modulo a prime |

## Failure modes

**Symptom: the low-order coefficients of a product are too large, and the length of the result is short by a few entries.** Diagnosis: circular convolution; the transform length is below `len(a) + len(b) − 1`, so the high coefficients wrapped around and were added at the front (`[22, 13, 28, 27]` in the example above). Fix: pad to at least the full output length before transforming, then truncate the inverse to that length.

**Symptom: the inverse returns the input reversed (except for index 0) and scaled by `n`.** Diagnosis: the forward transform was applied twice; the inverse needs the conjugate root and a division by `n`. Fix: conjugate the input, run the forward FFT, conjugate the output and divide by `n`, which is the standard trick when only a forward routine exists.

**Symptom: integer results are off by one for large inputs and correct for small ones.** Diagnosis: floating-point rounding; the outputs exceeded the range where the error stays below 0.5. Fix: an NTT, or split each coefficient into 15- or 16-bit halves and combine four (or three, with a trick) smaller convolutions, which is what big-integer libraries do.

**Symptom: `IndexError` inside a recursive FFT on an input of length 6, or 1,000.** Diagnosis: the radix-2 recursion assumes `n` is a power of two; at `n = 3` the even half has two entries and the odd half one, and the butterfly loop reads `odd[1]`. Fix: pad to the next power of two, or use a mixed-radix library transform.

**Symptom: comparisons against expected integers fail although the printed values look right.** Diagnosis: `numpy.fft.ifft` returns `complex128` with residual imaginary parts of `10⁻¹²`, and `==` against an integer array is false. Fix: `np.rint(result.real).astype(np.int64)` before comparing.

**Symptom: `fftconvolve` is slower than a plain loop.** Diagnosis: a short kernel (a 5-tap filter, a 3 × 3 image blur) against a long signal; the FFT's constant factor and padding dominate. Fix: `scipy.signal.convolve(method="auto")`, or `oaconvolve` for long signals with a kernel of a few hundred taps.

## Interviewer follow-ups

**"Why is the FFT `n log n` and not `n²`?"** Model answer: evaluating at `n` roots of unity splits into two evaluations at `n/2` roots (the squares) plus `n/2` butterflies to combine them, `T(n) = 2T(n/2) + O(n)`, which is merge sort's recurrence; per stage the work is `n`, and there are `log₂ n` stages. Common wrong answer: "because it uses complex numbers", which is the mechanism that makes the split possible, not the reason for the bound.

**"One sequence has a million samples and the other has three. Which method?"** Model answer: direct convolution, three multiply-adds per output sample, `3 × 10⁶` operations; an FFT would pad both to `2²¹` and do tens of millions of operations for nothing. For a kernel of a few thousand taps, overlap-add with block-sized FFTs. Common wrong answer: "FFT, because `n log n` beats `n · m`", ignoring that `m = 3`.

**"The coefficients are up to `10¹⁸` and I need the exact product."** Model answer: not a floating-point FFT; use an NTT modulo two or three large primes and reconstruct with the Chinese remainder theorem, or split each coefficient into 16-bit pieces so that each partial convolution stays under the precision limit. Common wrong answer: "use `float128`", which is neither widely available nor enough.

**"Real input. Can you halve the work?"** Model answer: yes: the spectrum of a real sequence is conjugate-symmetric, `X[n − k] = conj(X[k])`, so only `n/2 + 1` bins are needed; `rfft` computes them directly, and two real sequences can even share one complex transform by packing one into the real part and the other into the imaginary part. Common wrong answer: "no, the FFT is inherently complex."

**"How does this relate to Karatsuba?"** Model answer: both are evaluate-multiply-interpolate. Karatsuba evaluates a degree-1 split at three points (`0`, `1`, `∞`), Toom-3 at five, and the FFT at `n` roots of unity chosen so evaluation is itself divide and conquer; the exponents `1.585`, `1.465` and `n log n` are the number of evaluation points against the cost of evaluating. Common wrong answer: treating them as unrelated tricks.

## What mid-level engineers get wrong

- **Forgetting to pad.** Circular convolution wraps the high coefficients onto the low ones with no error message; the bug appears only when the product is longer than the transform.
- **Padding to the wrong length.** `max(len(a), len(b))` rounded to a power of two is not `len(a) + len(b) − 1` rounded up; the product can still wrap.
- **Trusting `round` at any size.** Double-precision FFT results are exact integers only while outputs stay below about `10¹⁴`.
- **Recursing on non-power-of-two lengths.** The textbook code needs padding; the library does not.
- **Reaching for the FFT on tiny inputs.** Below a few hundred elements the `n · m` loop wins; `choose_conv_method` exists for a reason.
- **Comparing complex outputs with integers.** Take the real part and round before comparing.
- **Implementing the FFT in an interview.** Recognise the convolution, quote `O(n log n)`, name the library or the NTT, and spend the time on the reduction.

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
- You size the precision before you trust `round`: a floating-point FFT loses exactness for large integer coefficients, products near `10¹⁵` are at the edge for double precision, and NTT (the integer-exact transform) or coefficient splitting is the fix.
- You know the library crossover: direct convolution wins for small kernels, FFT for large ones, and you check the threshold rather than assuming.
- You name the FFT as a technique in interviews and use a library at work, and you can say why both are the right call and point to concrete systems running FFTs at scale (audio, imaging, modems, big-integer arithmetic) rather than describing it as a maths curiosity.
- You can trace the eight-point butterflies with the four twiddle factors, count `(n/2) log₂ n` butterflies, and say why the base cases come out in bit-reversed order.
- You pad to `len(a) + len(b) − 1` because you know the pointwise product computes a circular convolution, and you can show the wrapped coefficient on a three-by-three example.
- You know what `numpy.fft` runs (pocketfft, mixed radix, Bluestein for awkward lengths) and that `rfft` halves the work for real input.

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
    Counting pairs by sum is the product of the two value histograms: count[s] = Σ_v histA[v]·histB[s − v], the convolution sum, with an answer for every total. The maximum pair sum is max(a) + max(b); the permutation check is a sort or a hash count; and inversion counting compares values rather than summing them, which is merge sort's job.
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
- q: >-
    You multiply [1, 2, 3] by [4, 5, 6] with transforms of length 4 and get [22, 13, 28, 27]. The correct product is [4, 13, 28, 27, 18]. What went wrong?
  options: ["Rounding error: the length-4 transform has too few points for double precision", "The inverse used the same sign as the forward transform, reversing the output", "Length 4 is not large enough to be a power of two for two inputs of length 3", "The transform length is below 5, so the coefficient 18 wrapped around and was added to index 0"]
  answer: 3
  explanation: >-
    Pointwise products of length-n transforms compute the circular convolution modulo n. The product has 5 coefficients, so with n = 4 the x⁴ term lands on index 0: 4 + 18 = 22, while the other three entries are untouched. Nothing was rounded wrongly, the output is not reversed, and 4 is a power of two; it is too short. Pad to at least len(a) + len(b) − 1, here 5, rounded up to 8 for a radix-2 FFT.
```
