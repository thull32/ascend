---
lesson: classic-divide-and-conquer
source: e14c6f56995e452e
---
## 1

Computing a to the n by repeated squaring, on arbitrary-precision integers with no modulus, is not log n time. Why?

A, the operands grow to about n times log a bits, so later multiplications are nowhere near constant time. B, it is log n; arbitrary-precision integers make each multiplication one constant-time step. C, odd exponents need an extra multiplication, so the count becomes linear. D, the recursion depth becomes linear once the exponent no longer fits in a machine word.

[think]

The answer is A: the operands grow to about n log a bits, so later multiplications are far from constant time.

The number of multiplications is logarithmic, at most two per halving, odd exponents included. But multiplying k-bit numbers is not constant time, arbitrary precision or not. The final squaring handles numbers of roughly n times log a bits, so the last few multiplications dominate. With a modulus, every operand stays bounded, which is why modular exponentiation is genuinely fast.

## 2

Karatsuba's algorithm replaces four half-size multiplications with three. What is the resulting exponent, and where does it come from?

A, 2, unchanged, because the extra linear additions cancel the saving. B, 1.5, from the ratio of 3 subproblems to a split factor of 2. C, log base 3 of 2, about 0.63, from a tree log base 3 of n levels deep. D, log base 2 of 3, about 1.585, from the number of leaves of the recursion tree.

[think]

The answer is D: log base 2 of 3, about 1.585, from the leaves of the recursion tree.

The tree is log base 2 of n levels deep with 3 children per node, so the leaves dominate, and there are 3 to the log 2 of n of them, which is n to the log 2 of 3. The exponent is the log of a to the base b, not the ratio of a to b. The extra additions are linear, and absorbed.

## 3

In the closest-pair combine step, why can each point in the strip be compared with only a constant number of others?

A, the strip is only 2 d wide, so it never contains more than 8 points in total. B, it cannot; with every point inside the strip, the combine becomes quadratic. C, points on each side are at least d apart, so a d by 2 d box holds at most 8 of them. D, the strip is sorted by x, so only the next 7 points in x order can lie within d.

[think]

The answer is C: points on each side are at least d apart, so a d by 2 d box holds at most 8.

Within one side, all points are at least d apart, since d is the best distance found in either half, so a bounded region holds boundedly many. The strip itself can contain all n points; what is bounded is how many fit in one window. Sorting the strip by y, and breaking when the y gap reaches d, limits the comparisons to at most 7 per point.

## 4

The Boyer-Moore majority vote, in a single pass, returns the candidate 7. What must you do before returning 7 as the majority element?

A, count 7's occurrences in a second pass, and check the count exceeds half of n. B, nothing, since the cancellation argument guarantees the survivor is the majority. C, check that the pass ended with a positive counter, which proves 7 exceeds half. D, run the pass again in reverse, and check it also returns 7.

[think]

The answer is A: count 7's occurrences in a second pass, and check it exceeds half of n.

The cancellation argument guarantees the majority survives, if one exists. If none does, the surviving candidate is arbitrary, and a positive final counter proves nothing: 1, 2, 3 ends with candidate 3 and a counter of 1, but has no majority. The verification pass makes the algorithm correct on every input.

## 5

Production linear-algebra libraries multiply 500 by 500 matrices with the cubic algorithm, not Strassen. Why?

A, cache blocking lowers the triple loop's exponent to 2.807, matching Strassen anyway. B, Strassen only works on power-of-two sizes, and padding 500 up to 512 costs too much. C, its seven products are valid only for symmetric matrices. D, its constants and numerical instability outweigh the gain below a few thousand rows.

[think]

The answer is D: its constants and numerical instability outweigh the gain below a few thousand rows.

Strassen's seven products come with eighteen block additions, temporaries, and worse rounding. The cache-blocked, vectorised triple loop wins until the gap in exponents, about 0.19, becomes large. Blocking improves the constant factor, not the exponent, and Strassen works on any matrices, since odd sizes can be padded or peeled. Asymptotics describe the limit, not your matrix.

## 6

In the lesson's closest-pair trace, the dividing line is at x equals 6, d is 5, a squared distance, and the strip sorted by y holds the points 8 1, then 5 4, then 6 5. Why is the point 8 1 never compared with 5 4?

A, their y gap squared is 9, at least d, so that pair and every later one in y order are too far apart. B, their x gap is 3, more than the strip's half-width, so 8 1 is not really in the strip. C, the strip is scanned from the top, so 8 1 is only compared with points above it. D, they lie on the same side of the line, and same-side pairs were handled by the recursion.

[think]

The answer is A: their y gap squared is 9, at least d, so every later pair is too far apart.

The inner loop breaks as soon as the squared y gap reaches d, because the strip is sorted by y and every later point is further still. The two points are on opposite sides of the line, so the recursion never saw them, and both are inside the strip. The break keeps the combine linear, and here it is also correct: their true squared distance is 18.
