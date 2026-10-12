---
lesson: math-and-geometry
source: 8745b9ad3a05169d
---
## 1

How many loop iterations does iterative repeated squaring take for an exponent of a billion?

A, about a billion, one per unit of the exponent. B, about 30, one per binary digit of the exponent. C, about 31,623, the square root of the exponent. D, about 500 million, one per pair of factors.

[think]

The answer is B: about 30, one per binary digit.

Each iteration halves the exponent, so the loop runs once per binary digit, which is 30 for a billion. The multiplications into the result happen once per set bit, so there are at most 30 of those too.

## 2

In Multiply Strings, the two inputs have m and n digits. Why is a result array of m plus n slots always enough?

A, because every carry between slots is at most 1. B, it is not always enough; you need m plus n plus 1 slots. C, because each single-digit product is at most 81. D, because the product of the two numbers is below 10 to the m plus n.

[think]

The answer is D: the product is below 10 to the m plus n.

An m-digit number is below 10 to the m, and an n-digit number is below 10 to the n, so their product is below 10 to the m plus n, and has at most m plus n digits. Individual slots can temporarily exceed 9, and carries can exceed 1, but the final value fits, so the first slot never overflows.

## 3

A JavaScript robot simulation turns left by taking its direction index minus 1, modulo 4, and it crashes on its first left turn from direction 0. Why?

A, the remainder operator truncates toward zero, so 0 minus 1, modulo 4, is minus 1. B, the direction becomes not-a-number, because it was declared as a constant. C, the remainder operator throws a range error on a negative operand. D, the direction array must be declared with a length.

[think]

The answer is A: the remainder truncates toward zero, giving minus 1.

JavaScript's remainder takes the sign of the dividend, so minus 1 modulo 4 is minus 1, and the direction array at index minus 1 is undefined. Python's takes the sign of the divisor and gives 3. Turning left by adding 3, modulo 4, or normalising the remainder before using it, works in both languages.

## 4

In JavaScript, 999,999,999 times 999,999,998, modulo a billion and 7, returns 70, but the true value is 72. What went wrong?

A, the remainder on large numbers rounds the divisor down. B, the literals were parsed as 32-bit integers. C, the product passed 2 to the 53, and was rounded before the remainder. D, integer multiplication wrapped around at 2 to the 63.

[think]

The answer is C: the product passed 2 to the 53, and was rounded first.

The product is about 10 to the 18, above 2 to the 53, so the double that holds it has lost its low bits before the remainder is taken. Multiplying as BigInt, or splitting one factor so each partial product stays below 2 to the 53, gives the exact 72. Nothing wraps; the error is silent rounding.

## 5

Max Points on a Line keys each pair of points by its slope as a float. On three points, the origin, a point about a hundred million out along both axes, and a point one step further along each axis, it reports all three as collinear, but they are not. What is the robust fix?

A, compare slopes with a tolerance of 10 to the minus 9. B, round every slope to nine decimal places. C, key each slope by its rise and run divided by their greatest common divisor, with the sign fixed by one convention. D, use the angle from the arctangent instead of the slope.

[think]

The answer is C: key by the reduced fraction, with a fixed sign.

The two slopes differ by about 10 to the minus 16 and round to the same double, although the cross product is minus 1. Rounding, tolerances and angles are all floats, and only move the failure. Equal ratios have exactly one reduced form once the sign is normalised, so the integer pair is an exact key.

## 6

Your repeated-squaring power function, raising 1.0000001 to the power 2 to the 31, differs from the library's math pow in the eighth significant digit. Why, and does it matter?

A, an early rounding error is raised to later powers. B, it is a bug; squaring must match math pow exactly. C, squaring overflows to infinity and then recovers. D, math pow is less accurate, since it uses logarithms.

[think]

The answer is A: an early rounding error is raised to later powers.

A small relative error in an early square is itself squared on every later step, so it grows with the exponent, roughly n times machine epsilon. Here 1.2 times 10 to the minus 8 was measured, against about 10 to the minus 17 for the library, which evaluates the power through the exponential of n times the log with extra precision. Judges for this problem accept about 10 to the minus 5, so the template passes, but production code calls the library.
