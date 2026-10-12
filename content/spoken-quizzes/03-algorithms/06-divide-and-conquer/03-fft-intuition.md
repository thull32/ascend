---
lesson: fft-intuition
source: 62900c5037741312
---
## 1

Why does evaluating a polynomial at the n-th roots of unity let the even and odd recursion continue all the way down to size 1?

A, the even and odd split halves the degree, and that works for any set of n points. B, they are evenly spaced on the real line, so each half is again evenly spaced. C, their squares are the n over 2-th roots of unity, which again come in plus-and-minus pairs. D, their magnitude is 1, so values never overflow as the recursion goes deeper.

[think]

The answer is C: their squares are the half-size roots of unity, which again come in plus-and-minus pairs.

Splitting into even and odd coefficients only saves work when the points come in pairs, x and minus x, which share the half-size evaluations. The degree halves for any point set, but without such pairs the number of points would not. Roots of unity, complex points on the unit circle, keep this true at every level when squared; real point sets do not.

## 2

You need the product of two polynomials of degree 100 thousand, with integer coefficients around 10 to the 15. What goes wrong with a double-precision FFT?

A, the product's length is not a power of two, so the transform cannot be applied. B, doubles cannot represent inputs as large as 10 to the 15, so they are corrupted on load. C, nothing; the final rounding step removes any floating-point error. D, the rounding error exceeds one half, so rounding back gives the wrong integers; use a number-theoretic transform.

[think]

The answer is D: the rounding error exceeds one half; use a number-theoretic transform.

Products of values near 10 to the 15, summed over 100 thousand terms, reach 10 to the 35, far beyond the roughly 16 digits a double holds, so each output's error is much larger than 1, and rounding snaps to the wrong integer. The inputs themselves are fine, below 2 to the 53, and padding handles any length. A number-theoretic transform works modulo a prime and stays exact; splitting coefficients into smaller chunks is the other fix.

## 3

Which problem is a convolution in disguise?

A, check whether two arrays are permutations of each other. B, find the maximum of an element of a plus an element of b, over all pairs. C, for each total s, count the pairs, one from a and one from b, that add up to s. D, count the pairs in one array where the earlier element is larger.

[think]

The answer is C: for each total, count the pairs that add up to it.

Counting pairs by sum is the product of the two value histograms: for each total, add up the counts of v in a times the counts of s minus v in b, which is the convolution sum, with an answer for every total. The maximum pair sum is just the two maximums added. The permutation check is a sort or a hash count, and inversion counting compares values, which is merge sort's job.

## 4

SciPy's FFT convolution chooses direct convolution for small inputs, despite the FFT's better complexity. Why?

A, the FFT's rounding error is largest on small inputs, so direct is more accurate. B, small inputs are rarely powers of two, and the FFT only works on those sizes. C, the FFT's constant factor is large enough that the n times m loop wins on small inputs. D, direct convolution is linear for small kernels, beating n log n outright.

[think]

The answer is C: the FFT's constant factor is large enough that the direct loop wins on small inputs.

Asymptotics describe the limit. Three transforms, complex arithmetic and zero-padding give the FFT a large constant, so below a few hundred elements the n times m loop with tiny constants wins. It is the same story as Strassen against blocked matrix multiplication, and Karatsuba against schoolbook. Padding makes any size work, and the choice is about speed, not accuracy.

## 5

How is the inverse FFT related to the forward FFT?

A, the same FFT run on the reversed value array, with no scaling needed. B, the same FFT applied twice, since two transforms in a row return the input. C, a different, quadratic interpolation, run once, so it does not dominate the cost. D, the same FFT, with the root of unity replaced by its inverse, and the result divided by n.

[think]

The answer is D: the same FFT with the inverse root, and the result divided by n.

The transform matrix's inverse is its conjugate divided by n, so interpolation reuses the evaluation code. Applying the forward transform twice does not return the input; it returns n times the input in reversed index order, which is why the conjugated root and the division are needed. That symmetry is why polynomial multiplication is three transforms plus a linear pass, and nothing more.

## 6

You multiply 1, 2, 3 by 4, 5, 6 with transforms of length 4, and get 22, 13, 28, 27. The correct product is 4, 13, 28, 27, 18. What went wrong?

A, rounding error: a length-4 transform has too few points for double precision. B, the inverse used the same sign as the forward transform, reversing the output. C, length 4 is not large enough to be a power of two for two inputs of length 3. D, the length is below 5, so the coefficient 18 wrapped around and was added to the first entry.

[think]

The answer is D: the length is below 5, so 18 wrapped around onto the first entry.

Pointwise products of length-n transforms compute the circular convolution. The product has 5 coefficients, so with length 4 the last one lands on the first entry: 4 plus 18 is 22, and the other three are untouched. Nothing was rounded wrongly, the output is not reversed, and 4 is a power of two; it is just too short. Pad to the two lengths added, minus one, here 5, rounded up to 8.
