---
lesson: bit-manipulation-pattern
source: 398795b3c0249e35
---
## 1

In Python, an add function built from XOR and a shifted AND never terminates when adding minus 1 and 1. Why?

A, XOR is undefined for negative integers in Python. B, the loop tests the carry when it should test the running sum. C, there is no fixed width, so the carry is never dropped off the top. D, Python's left shift on a negative raises instead of wrapping.

[think]

The answer is C: there is no fixed width, so the carry is never dropped.

A 32-bit adder discards the carry out of bit 31. Python integers are unbounded, so the carry keeps shifting left, and after 100 iterations the operands are about plus and minus 1.27 times 10 to the 30. Masking both values to 32 bits every iteration imposes the width, so the loop ends within 32 iterations, and a final conversion turns a result with bit 31 set back into a negative number.

## 2

In JavaScript, a reverse-bits function shifts its input right by one with the ordinary right-shift operator, and receives an input with bit 31 set. What goes wrong?

A, nothing, since JavaScript right shifts are unsigned. B, bit 0 is skipped, so the whole output is off by one place. C, the result grows a 33rd bit above the 32-bit word. D, the ordinary right shift copies the sign bit in, so use the unsigned right shift, and read the result with an unsigned shift by zero.

[think]

The answer is D: the ordinary shift copies the sign bit in; use the unsigned shift.

Bitwise operators work on 32-bit signed values, and the ordinary right shift is arithmetic: it fills from the top with the sign bit, so ones are fed into later iterations. The unsigned right shift fills with zeros, and an unsigned shift by zero reads the final pattern as unsigned instead of negative. Python has no such problem for non-negative input, because its right shift of a positive value fills with zeros.

## 3

Measured on CPython 3.14, Counting Bits up to a million took 26 milliseconds with the DP recurrence that reads the answer for i shifted right by one, and 11 milliseconds with a list comprehension calling the bit count method on each number. What explains it?

A, bit count caches earlier answers, making it linear too. B, the DP's steps are bytecodes, while bit count is a single C call. C, the measurement is noise, since linear must beat n log n. D, the DP is really n log n, because of each shift it does.

[think]

The answer is B: the DP's steps are bytecodes, and bit count is a single C call.

Asymptotics count operations, but a CPython bytecode costs tens of nanoseconds, while a C popcount costs about one. The comprehension does one C call per number; the DP does an index, a shift, an AND, an add and a store per number in the interpreter. In an interview the DP is the answer to the question asked, and naming the builtin, and why it wins in Python, is the senior addition.

## 4

Every element appears three times, except one. A candidate XORs the whole array. What comes back?

A, the sum of all the values, taken modulo 2 in each bit. B, the singleton XORed with every tripled value, because x XOR x XOR x is x. C, the singleton, which is the correct answer here. D, zero, since every value eventually cancels itself out.

[think]

The answer is B: the singleton XORed with each tripled value.

XOR computes the parity of each bit column, so every value with odd multiplicity survives, and three is odd. Counting each column modulo 3, or the ones-and-twos state machine, recovers the singleton in constant space.

## 5

A Java Missing Number solution computes n times n plus 1, over 2, in int, and fails a hidden test with n of 50 thousand. Why?

A, the array holds 50 thousand values, so the true n is 49,999. B, n times n plus 1 overflows int before the division runs. C, integer division truncates the odd products wrongly. D, the quotient also exceeds int above n of 46,341.

[think]

The answer is B: the product overflows int before the division runs.

50 thousand times 50,001 is about 2.5 billion, above the largest int, so the product wraps before it is halved. The product first overflows at n of 46,341, while the halved sum would fit until n of 65,535. The product of n and n plus 1 is always even, so the division is exact. The XOR fold cannot overflow, and a long accumulator also works.

## 6

Two threads set different bits of the same 64-bit word in a shared bitset, each with an OR-equals on that word. What can happen, and what fixes it?

A, nothing; each thread only touches its own bit. B, a torn 64-bit write, fixed by using 32-bit words. C, a lost bit, fixed with an atomic OR or a compare-and-swap retry loop. D, a deadlock, fixed by always locking lower words first.

[think]

The answer is C: a lost bit; use an atomic OR or a compare-and-swap loop.

OR-equals is a load, an OR and a store. Both threads can load the same old word, and the second store overwrites the first thread's bit. An atomic fetch-and-OR, or a compare-and-swap loop that retries when the word changed underneath it, makes the update indivisible. Smaller words reduce contention, but they do not remove the race.
