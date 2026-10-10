---
lesson: classic-divide-and-conquer
source: 144efda44e828577
fit: partial
desk:
  - "Fast exponentiation: the recursive and iterative code, and the bit-by-bit trace of 3 to the 13th"
  - "Karatsuba: the algebra, the code, and the 1234 times 5678 table"
  - "Strassen's seven products and the numeric check on two 2 by 2 matrices"
  - "Closest pair: the strip code and the eight-point strip trace"
  - "Boyer-Moore majority vote: code and the two traces"
  - "Under the hood and the trade-off tables: CPython integers, GMP's algorithm ladder, BLAS, RSA, heavy hitters"
  - "Exercises: modular exponentiation by squaring, and closest pair of points"
---
## Introduction

Every algorithm in this episode was a surprise when it was found. Multiplying two n-digit numbers was taken for granted to be n squared work, until Karatsuba showed it was not, in the early 1960s. Multiplying two matrices was assumed to be n cubed, until Strassen found seven products where everyone had used eight. The closest pair of points was assumed to need every pair compared, until the strip argument brought it to n log n.

In each case the surprise came from the same place: a recurrence where the number of subproblems, or the cost of combining them, was one notch better than the naive decomposition. Five results, then, and for each the one idea that makes the recurrence come out ahead.

## Fast exponentiation: halve the exponent

Computing a to the n by multiplying n times is linear. But a to the n is the square of a to the n over 2 when n is even, and that times one more a when n is odd. One recursive call on half the exponent plus one or two multiplications. Logarithmic.

The iterative version reads the exponent's bits from the lowest up. At every step it squares the base; when the bit is set, it multiplies the base into the result. Take 3 to the 13th. 13 in binary is 1101. The bases are 3, 9, 81 and 6,561, which are 3 to the 1, 2, 4 and 8. The bits for 1, 4 and 8 are set, so the result is 3 to the 1 times 3 to the 4 times 3 to the 8: 3 to the 13th, 1,594,323. Four squarings and three multiplications, instead of twelve.

Two warnings. Without a modulus, this is not really logarithmic time. The number of multiplications is, but the operands grow to about n times log a bits, and the last few multiplications on huge numbers dominate. With a modulus taken after every multiplication, every operand stays bounded, and that is why modular exponentiation is genuinely fast. RSA with a 2,048-bit exponent is about 2,048 squarings, not 2 to the 2,048 multiplications.

The general principle: any associative operation can be applied n times in about log n applications. Multiplication, matrix multiplication, function composition. "Compute the n-th Fibonacci number for n equal to 10 to the 18th, modulo a prime" is the n-th power of the 2 by 2 matrix 1, 1, 1, 0: about 60 squarings of eight multiplications each. Memoised recursion would be linear and never finish.

## Karatsuba: three multiplications instead of four

Split two n-digit numbers into a high half and a low half. Their product needs high times high, low times low, and the middle term, high-one times low-two plus low-one times high-two. That is four half-size multiplications plus linear shifts and additions. Four calls on half with linear combining: n squared, no better than school.

Karatsuba's identity: multiply the sum of the first number's halves by the sum of the second number's halves. That one product contains all four cross terms. Subtract high times high and low times low, which you already have, and what is left is the middle term. Three multiplications.

The lesson works it on 1234 times 5678. The halves are 12 and 34, and 56 and 78. High times high: 12 times 56 is 672. Low times low: 34 times 78 is 2,652. The sums are 46 and 134, and 46 times 134 is 6,164. Subtract 672 and 2,652 and you get 2,840, the middle term. Assemble: 672 shifted four places, plus 2,840 shifted two, plus 2,652: 7,006,652, which is 1234 times 5678.

Three calls on half with linear combining puts you in the leaves-dominate case, with exponent log base 2 of 3, about 1.585. For 1,000-digit numbers that is about 57 thousand digit products instead of a million, 17 times fewer.

And the threshold is real. CPython switches to Karatsuba only when both operands exceed 70 internal digits of 30 bits each, about 630 decimal digits. Below that, schoolbook is faster. The common misquote is "70 digits". GMP climbs further, from Karatsuba to Toom-Cook to FFT-based multiplication for numbers of tens of thousands of digits, which is where the next lesson picks up.

## Strassen: the same move on matrices

Split two matrices into four blocks each, and the product needs eight block products: n cubed, same as the triple loop. Strassen found seven products of sums and differences of blocks from which all four output blocks can be assembled. Exponent log base 2 of 7, about 2.807.

You are not expected to memorise the seven products. You are expected to know three things. The exponent comes from log base 2 of 7, and would be 3 with one more product; that is the whole insight. The saving compounds at every level of the tree, so it is not a constant seven eighths; it is a factor that grows with n. And production linear algebra libraries do not use it. BLAS matrix multiply is the n cubed algorithm, cut into blocks that fit the caches and run on vector instructions. Strassen's 18 block additions, its temporaries and its worse rounding behaviour outweigh the gain at ordinary sizes. Asymptotically better and faster on your workload are different claims.

One phrase to have ready: the theoretical exponent has been pushed to about 2.37, by algorithms called galactic, because their constants make them useless at any physical size.

## Closest pair: the strip argument

Given n points in a plane, find the closest pair. Brute force checks every pair. Divide and conquer sorts by x, splits at the median x, solves each half recursively, and takes d as the smaller of the two best distances. The recurrence is decided by the pairs that straddle the split.

Any straddling pair closer than d must have both points within d of the dividing line, so only a vertical strip of width 2 d matters. That alone does not help: every point could be in the strip. The argument that helps is packing. Sort the strip by y, and compare each point only with the points after it whose y differs by less than d. Points on one side are all at least d apart, so a box d tall and 2 d wide holds at most 8 of them. Each strip point is compared with at most 7 others. The combine step is linear.

Here is the lesson's example, trimmed to the strip. The best distances in the two halves give d with a squared value of 5. Three points fall in the strip: 8, 1 and 5, 4 and 6, 5, in y order. Start at 8, 1. The next point, 5, 4, is 3 higher, and 3 squared is 9, at least 5. Break: everything further up is further away. Then 5, 4 against 6, 5: one apart in each direction, a squared distance of 2. That is the closest pair, and it straddles the line, so neither half could see it.

The break is what makes it linear. Drop it and you still get correct answers, in quadratic time, which only shows up on the benchmark with every point in the strip. Keep the y order merged through the recursion like merge sort and the total is n log n. Re-sort the strip at each level and it is n log squared n, which is still fine and simpler to write.

## Majority: shrink by cancellation

Find the element that appears more than half the time, if one exists. Divide and conquer works: the majority of the whole must be the majority of at least one half, so recurse, get two candidates, count each. n log n.

But the result to carry is Boyer-Moore majority vote: linear time, constant space. Pair up any two different elements and discard both; the majority remains the majority of what is left. In code, keep one candidate and a counter. A matching element increments, a different one decrements, and at zero the next element becomes the candidate.

Before I say it: on the array 1, 2, 3, which has no majority, what does that pass return?

[pause]

1 becomes the candidate, 2 cancels it, 3 is adopted, and the pass ends with candidate 3 and a positive count. 3 appears once. So you must verify: a second pass counts the candidate and checks it exceeds half. A positive final count is not evidence. Only if the problem guarantees a majority exists does one pass suffice. The generalisation, elements appearing more than n over k times, keeps k minus 1 candidates and is the Misra-Gries summary behind streaming heavy-hitter detection.

## Single-sided recursion

All of these recurse into both halves. Recurse into one, and the recurrence improves. Binary search: one half, constant work, logarithmic. Quickselect: partition, then recurse only into the side containing the k-th element, linear expected time, which is the answer to Kth Largest when the interviewer says "faster than sorting". Median of medians makes the pivot deterministic; its two recursive pieces add up to nine tenths of n, less than n, which is why it stays linear.

The habit: when a recurrence comes out n log n and you need linear, ask whether you can decide which half contains the answer without solving both.

## In the interview

"Karatsuba does three multiplications. Can you do two?"

[pause]

Not for a two-way split. The product of two degree-one polynomials has three coefficients, each needing an independent evaluation, so three is optimal there. More parts help: Toom-3 uses five products for a three-way split, and in the limit the FFT evaluates at n roots of unity. The wrong answer is "yes, with a cleverer identity", without noticing that the number of coefficients is the lower bound.

## Recap

Five things to remember. Squaring gives a to the n in log n multiplications, but only with a modulus does each multiplication stay cheap. Karatsuba's identity turns four half-size products into three, and the exponent falls from 2 to log base 2 of 3. Strassen does the same with seven of eight, and BLAS still uses the cubed algorithm. Closest pair works because packing caps each strip point at 7 comparisons, enforced by the break. And Boyer-Moore's candidate must be verified.

At your desk: the exponentiation code and trace, the Karatsuba table, Strassen's seven products and their check, the closest-pair code and strip trace, the majority traces, the library internals, and the two exercises.
