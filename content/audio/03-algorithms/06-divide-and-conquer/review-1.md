---
review: divide-and-conquer
source: 52bccf8454e8b496
---
## Introduction

Twelve questions from the divide-and-conquer module. Answer out loud before the answer comes.

They run through the module in order: reading and solving recurrences, the classic algorithms from fast exponentiation to Strassen, and the FFT. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A recursive function makes four calls on inputs of half the size, and does linear work to combine. What is its complexity?

A, order n squared. B, order n log n. C, order n to the 1.585. D, order n.

[think]

The answer is A: order n squared.

Log base 2 of 4 is 2, so the leaves contribute n squared. The linear combine is polynomially smaller, which is case 1: the leaves dominate and the total is n squared. Four half-size subproblems is exactly what naive divide-and-conquer multiplication does, which is why it gains nothing.

## Question 2

Merge sort written with list slices in Python is still n log n, but binary search written with slices becomes linear. Why the difference?

A, merge sort already does linear work per call, so the slice is absorbed; binary search did constant work. B, merge sort splits the slice cost across its two calls, so each call pays only half. C, merge sort frees each slice after merging, while binary search keeps every slice alive in memory. D, merge sort slices only at the top level; its deeper calls reuse the same list objects.

[think]

The answer is A: merge sort already does linear work per call, so the slice is absorbed; binary search did constant work.

The combine term of the recurrence absorbs the slice cost. For merge sort it goes from n to about 2 n, the same class, because the merge was already linear. For binary search it goes from constant to linear, turning a logarithmic recurrence into a linear one. Sharing the cost between two calls is not the reason: every call on n elements pays for its own slices, and that only hurts when the combine work was smaller than linear.

## Question 3

During a merge, the left half is 2, 4, 7 and the right half is 1, 5, 6, and the 1 is taken first. How many inversions does that single step account for?

A, 0. B, 1. C, 2. D, 3.

[think]

The answer is D: 3.

Every element still waiting in the left half, 2, 4 and 7, is greater than 1 and came before it in the original array, so three inversions are found at once. That is why the count added is the number of left elements still waiting, not 1, and why nothing needs to be counted separately at the end.

## Question 4

Which recurrence does the master theorem not directly solve?

A, T of n equals T of n minus 1, plus n. B, T of n equals T of n over 2, plus 1. C, T of n equals 2 T of n over 2, plus n. D, T of n equals 7 T of n over 2, plus n squared.

[think]

The answer is A: T of n equals T of n minus 1, plus n.

The theorem needs the input to shrink by a constant factor greater than 1. Subtracting one is not a divide-and-conquer shape: the recursion tree has n levels of decreasing linear work, which sums to n squared, and the recursion is really a loop.

## Question 5

Computing a to the n by repeated squaring, on arbitrary-precision integers with no modulus, is not logarithmic time. Why?

A, the operands grow to about n times log a bits, so the later multiplications are nowhere near constant time. B, it is logarithmic; arbitrary-precision integers make each multiplication one constant-time step. C, odd exponents need an extra multiplication, so the multiplication count becomes linear. D, the recursion depth becomes linear once the exponent no longer fits in a machine word.

[think]

The answer is A: the operands grow to about n times log a bits, so the later multiplications are nowhere near constant time.

The number of multiplications is logarithmic, at most two per halving, odd exponents included. But multiplying k-bit numbers is not constant time, arbitrary precision or not. The final squaring handles numbers with roughly n times log base 2 of a bits, so the last few multiplications dominate. With a modulus every operand stays bounded, which is why modular exponentiation is genuinely fast.

## Question 6

Karatsuba's algorithm replaces four half-size multiplications with three. What is the resulting exponent, and where does it come from?

A, 2, unchanged, because the extra linear additions cancel the saving. B, 1.5, from the ratio of 3 subproblems to a split factor of 2. C, log base 3 of 2, about 0.63, from a tree that is log base 3 of n levels deep. D, log base 2 of 3, about 1.585, from the 3 to the log base 2 of n leaves of the recursion tree.

[think]

The answer is D: log base 2 of 3, about 1.585, from the 3 to the log base 2 of n leaves of the recursion tree.

Three calls on half with linear combining is master-theorem case 1. The tree is log base 2 of n levels deep with three children per node, so the leaves dominate, and there are 3 to the log base 2 of n of them, which is n to the log base 2 of 3. The exponent is log base b of a, not the ratio a over b. The extra additions are linear and absorbed.

## Question 7

In the closest-pair combine step, why can each point in the strip be compared with only a constant number of others?

A, the strip is only 2 d wide, so it can never contain more than 8 points in total. B, it cannot; with every point inside the strip, the combine step becomes quadratic. C, points on each side are at least d apart, so a box d tall and 2 d wide holds at most 8 of them. D, the strip is sorted by x, so only the next 7 points in x order can lie within d.

[think]

The answer is C: points on each side are at least d apart, so a box d tall and 2 d wide holds at most 8 of them.

Within one side, all points are at least d apart, since d is the best distance found in that half, so a bounded region holds boundedly many. The strip itself can contain all n points; what is bounded is how many fit in one window of that size. Sorting the strip by y and breaking when the y gap reaches d limits each point to at most 7 comparisons.

## Question 8

Boyer-Moore's single pass returns candidate 7 on an array. What must you do before returning 7 as the majority element?

A, count the 7s in a second pass and check the count exceeds half of n. B, nothing, since the cancellation argument guarantees the survivor is the majority. C, check that the pass ended with a positive counter, which proves 7 exceeds half of n. D, run the pass again in reverse and check it also returns 7.

[think]

The answer is A: count the 7s in a second pass and check the count exceeds half of n.

The cancellation argument guarantees the majority survives if one exists. If no element appears more than half the time, the survivor is arbitrary, and a positive final counter proves nothing: 1, 2, 3 ends with candidate 3 and a counter of 1, but has no majority. The verification pass makes the algorithm correct on all inputs.

## Question 9

Production linear-algebra libraries multiply 500 by 500 matrices with the n cubed algorithm rather than Strassen. Why?

A, cache blocking lowers the triple loop's exponent to 2.807, matching Strassen anyway. B, Strassen only works on power-of-two sizes, and padding 500 up to 512 costs too much. C, Strassen's seven products are valid only for symmetric matrices, which BLAS cannot assume. D, Strassen's constants and numerical instability outweigh the gain below a few thousand rows.

[think]

The answer is D: Strassen's constants and numerical instability outweigh the gain below a few thousand rows.

Strassen's seven products come with eighteen block additions, temporaries and worse rounding behaviour. The cache-blocked, vectorised triple loop wins until the gap between the exponents becomes large. Blocking improves the constant factor, not the exponent, and Strassen works on any matrices, since odd sizes can be padded or peeled. Asymptotics describe the limit, not your matrix.

## Question 10

Why does evaluating a polynomial at the n-th roots of unity let the even-odd recursion continue all the way down to size 1?

A, the even-odd split halves the degree, and that works for any set of n points. B, the roots are evenly spaced on the real line, so each half is again evenly spaced. C, their squares are the n over 2-th roots of unity, which again come in plus-and-minus pairs. D, their magnitude is 1, so values never overflow as the recursion goes deeper.

[think]

The answer is C: their squares are the n over 2-th roots of unity, which again come in plus-and-minus pairs.

The even-odd split saves work only when the evaluation points come in plus-and-minus pairs, so that x and minus x share the half-size evaluations. The degree halves for any point set, but without those pairs the number of points to evaluate would not. Roots of unity, complex points on the unit circle, are closed under squaring in exactly the way that keeps this true at every level. Real point sets are not.

## Question 11

Which problem is a convolution in disguise?

A, check whether two arrays are permutations of each other. B, find the maximum of an element from the first array plus an element from the second, over all pairs. C, for each total s, count the pairs, one element from each array, that add up to s. D, count the pairs within one array where an earlier value is bigger than a later one.

[think]

The answer is C: for each total s, count the pairs, one element from each array, that add up to s.

Counting pairs by sum is the product of the two value histograms: for each total, you sum the first histogram at v times the second at s minus v, which is the convolution, with an answer for every total. The maximum pair sum is just the two maxima added. The permutation check is a sort or a hash count. And inversion counting compares values rather than summing them, which is merge sort's job.

## Question 12

You multiply 1, 2, 3 by 4, 5, 6 using transforms of length 4, and get 22, 13, 28, 27. The correct product is 4, 13, 28, 27, 18. What went wrong?

A, rounding error: the length-4 transform has too few points for double precision. B, the inverse used the same sign as the forward transform, reversing the output. C, 4 is not large enough to be a power of two for two inputs of length 3. D, the transform length is below 5, so the coefficient 18 wrapped around and was added to index 0.

[think]

The answer is D: the transform length is below 5, so the coefficient 18 wrapped around and was added to index 0.

Pointwise products of length-n transforms compute the circular convolution. The product has five coefficients, so with length 4 the x to the 4th term lands on index 0: 4 plus 18 is 22, while the other three entries are untouched. Nothing was rounded wrongly, the output is not reversed, and 4 is a power of two; it is simply too short. Pad to at least the sum of the lengths minus one, here 5, rounded up to 8 for a radix-2 FFT.

## Recap

Three ideas kept coming back. Write the recurrence and compare the combine work with the leaf count: four half-size calls give n squared, three give n to the 1.585, and a slice or a hidden linear step changes the answer. Asymptotics are not the whole story: Strassen loses to the blocked cubed loop at ordinary sizes, and repeated squaring is only fast when a modulus keeps the operands small. And the combine step is where the work happens, whether it counts inversions, caps the strip at 7 comparisons, or, in the FFT, needs enough padding to avoid wrapping around.
