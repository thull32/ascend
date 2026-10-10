---
lesson: fft-intuition
source: 68781c6c240b90d2
fit: partial
desk:
  - "The convolution code, and the evaluate-multiply-interpolate example at four points"
  - "The recursive FFT code and the even-odd split written as algebra"
  - "The eight-point butterfly trace with its twiddle-factor table and bit-reversed order"
  - "The fft-multiply code with padding, and the wrap-around example"
  - "Under the hood: numpy.fft and pocketfft, scipy.signal method choice, FFTW plans, the NTT prime, and the trade-off table"
  - "Exercises: polynomial multiplication, and the pair-sum histogram as a convolution"
---
## Introduction

Multiply two polynomials of degree n and you compute every product of a coefficient from one with a coefficient from the other: n squared multiplications. Multiply two n-digit integers and it is the same computation with carries. Blur an image with a kernel, correlate two signals, or count, for every total, how many pairs from two lists add up to it. All of these are the same n squared loop, called a convolution.

The fast Fourier transform does it in n log n, with a divide-and-conquer recurrence that is, structurally, merge sort. You will almost never implement one at work; a library does it in thousands of lines of carefully vectorised code. But knowing why it works lets you recognise a convolution in a problem that never mentions polynomials, and that turns a hopeless n squared into a routine n log n.

Three ideas. Multiplication is easy if you store values instead of coefficients. Roots of unity are the points that make evaluation divide and conquer. And where convolutions hide.

## Multiplication is convolution

Take 1 plus 2 x plus 3 x squared, times 4 plus 5 x. The coefficient of each power of x in the product collects every pair of coefficients whose powers add up to it. The constant term is 1 times 4, which is 4. The x term is 1 times 5 plus 2 times 4, which is 13. Then 22, then 15. That accumulation, every pair of indices adding into the output at their sum, is the convolution, and it costs the product of the two lengths.

Integers are the same computation with x set to 10 and carries applied afterwards. 4, 13, 22, 15 becomes 4 thousand plus 1,300 plus 220 plus 15: 5,535, which is 123 times 45. Multiply Strings is exactly this loop with carries.

## Values instead of coefficients

A polynomial of degree less than n is fixed by its n coefficients. It is also fixed by its values at any n distinct points: that is interpolation. And in the value representation, multiplication is trivial. The product's value at a point is the product of the two values there. Linear work.

So the plan is three steps. Evaluate both polynomials at enough points for the product. Multiply the values pointwise. Interpolate back to coefficients.

The lesson does it with the same two polynomials at four points: 0, 1, minus 1 and 2. The first gives 1, 6, 2 and 17. The second gives 4, 9, minus 1 and 14. Multiply pairwise: 4, 54, minus 2 and 238. The unique cubic through those four points has coefficients 4, 13, 22, 15, the same as the double loop. The multiplication itself took four scalar products.

The catch is that evaluating at n points naively costs n each, so n squared total, and interpolation is worse. The plan only pays if evaluation and interpolation are fast. They can be, if you choose the points carefully.

## Choose the points so halving works

Split a polynomial into its even-indexed and odd-indexed coefficients. Call them E and O, each half the size. Then the polynomial at x is E at x squared, plus x times O at x squared. And at minus x, it is E at x squared, minus x times O at x squared. The same two half-size evaluations, combined with a sign flip.

So if your points come in plus-and-minus pairs, evaluating at n points costs two evaluations at n over 2 points, the squares, plus linear combining. For the recursion to keep going, those squared points must also come in plus-and-minus pairs, and their squares too, all the way down.

Before I say it: can real numbers do that?

[pause]

No. Squares of real numbers are never negative, so after one level the pairs are gone. Complex numbers can. The n-th roots of unity are n points evenly spaced around the unit circle, and their squares are exactly the n over 2-th roots of unity, which again pair up as plus and minus, and so on down to one point. The recurrence is two calls on half plus linear work: n log n, merge sort's recurrence, with the merge replaced by a step called the butterfly, E plus or minus a twiddle factor times O.

Count the work on eight points: four butterflies per stage, three stages, 12 butterflies, against 64 multiplications for direct evaluation. At about a million points, two to the 20th, it is about 10 million butterflies against about a trillion multiplications. A factor of 100 thousand.

Evaluating at roots of unity is the discrete Fourier transform, and this recursion is the Cooley-Tukey FFT of 1965. It was a rediscovery: the same idea was traced to a Gauss treatise probably written in 1805.

## Back to coefficients, and two traps

Interpolation turns out to be the same transform, reversed. Replace the root of unity with its inverse, run the same FFT, and divide by n. No separate algorithm. So polynomial multiplication is three transforms and one linear pass: n log n.

The first trap is padding. Pointwise products of length-n transforms compute a circular convolution: any coefficient at index n or beyond wraps around to the front. Multiply 1, 2, 3 by 4, 5, 6. The true product is 4, 13, 28, 27, 18, five coefficients. With a transform of length 4, the 18 wraps onto index 0, and you get 22, 13, 28, 27. Three right entries, one silently corrupted, no error. Pad to at least the full output length, the sum of the two lengths minus one, rounded up to a power of two for the textbook version.

The second is precision. A floating-point FFT returns values with small errors, and you round to get integers back. In the lesson's measurement, outputs near 10 to the 14th came back within 0.05; outputs near 10 to the 15th were off by up to 0.5, exactly where rounding starts returning the wrong integer. Above that, use the number-theoretic transform, the NTT, which works modulo a prime with modular roots of unity and is exact. For larger coefficients, run it with two or three primes and combine with the Chinese remainder theorem.

## Where the convolution hides

The senior skill is spotting a convolution that is not labelled as one.

Pair-sum counting: given two lists of small non-negative integers, how many pairs sum to each total? Build a histogram of each list's values and convolve them. Pattern matching with wildcards: the mismatch count of a pattern at every position of a text is a sum of products, a convolution, so every position is checked in n log n rather than n times m. Big integers: GMP and Python's decimal module switch to FFT or NTT multiplication for tens of thousands of digits. Signal processing: every audio equaliser, noise-cancelling headphone and 5G modem. And generating functions: how many ways to pick one item from each of k groups with a given total value is a product of k polynomials.

The test: if a problem asks for a count for every possible total over pairs, or a sliding score of one sequence against another, write it as a sum of f at i times g at k minus i, and see if it fits.

And the lineage ties the module together. Karatsuba is evaluate, multiply, interpolate, at three points: zero, one and infinity. Toom-3 uses five. The FFT uses n roots of unity, chosen so that evaluation itself becomes divide and conquer.

## What to say, and what not to implement

In an interview, the FFT is a thing you mention, not a thing you write. "This is a convolution. Naive is n squared, FFT gets n log n. For these sizes naive is fine, and at a million I would use a library FFT or an NTT." That is a complete senior answer.

At work the same applies with more force. NumPy, FFTW and their peers are among the most optimised code on the planet. And the asymptotic winner is not the winner at every size: three transforms, complex arithmetic and padding give the FFT a large constant, so direct convolution wins below a few hundred elements. SciPy's convolve with the method set to auto estimates both costs from the actual sizes and picks one. Same story as Strassen and Karatsuba.

## In the interview

"One sequence has a million samples and the other has three. Which method?"

[pause]

Direct convolution: three multiply-adds per output sample, about 3 million operations. An FFT would pad both to two to the 21st and do tens of millions of operations for nothing. The wrong answer is "FFT, because n log n beats n times m", ignoring that m is 3.

"Why is the FFT n log n?" Evaluating at n roots of unity splits into two evaluations at n over 2 roots, the squares, plus n over 2 butterflies: merge sort's recurrence. "Because it uses complex numbers" names the mechanism that makes the split possible, not the reason for the bound.

## Recap

Four things to remember. Polynomial multiplication, integer multiplication and pair-sum counting are all convolutions, n squared done directly. In value form multiplication is pointwise, and roots of unity let evaluation split into even and odd halves forever, so the transform is merge sort's n log n, and the inverse is the same transform with the inverse root, divided by n. Pad to the full output length or the top coefficients wrap around, and do not trust rounding above about 10 to the 14th; use an NTT. And mention the FFT, use a library, and let small inputs go direct.

At your desk: the convolution and four-point example, the recursive FFT, the eight-point butterfly trace, the padded multiply and the wrap-around example, the library internals, and the two exercises.
