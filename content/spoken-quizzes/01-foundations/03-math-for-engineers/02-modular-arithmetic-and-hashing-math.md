---
lesson: modular-arithmetic-and-hashing-math
source: c4c5b8d1c7084403
---
## 1

In Java, a key's hash code mod the table length throws an array-index-out-of-bounds exception in production once a week. What is happening?

A, the hash code can be negative, and Java's remainder keeps its sign. B, overflow in the hash code yields values the remainder cannot reduce. C, the table length is not prime, so some buckets overflow. D, the hash code can exceed the table length, and the remainder fails to wrap it.

[think]

The answer is A: the hash code can be negative, and Java's remainder keeps its sign.

Java's hash code is a signed integer, and Java's remainder truncates toward zero, so a negative hash gives a negative index. Exceeding the table length is exactly what the remainder fixes, and no integer is too large for it to reduce; only the sign escapes. Primality is irrelevant. Use floor mod, or mask with a power-of-two size.

## 2

You port a solution that computes products modulo 10 to the 9, plus 7, from Python to JavaScript, and it returns wrong answers on large inputs. Why?

A, JavaScript's remainder gives negative results for these inputs. B, the product can pass 2 to the 53, and is rounded before the remainder is taken. C, JavaScript's remainder is float division, and rounds the remainder. D, JavaScript integers are 32-bit, so the product wraps.

[think]

The answer is B: the product can pass 2 to the 53, and is rounded before the remainder is taken.

Two reduced operands can multiply to about 10 to the 18, above the 2 to the 53 limit where a 64-bit float holds integers exactly. The digits are rounded before the reduction, so the remainder is wrong. Bitwise operators are 32-bit, but ordinary arithmetic is not, and with non-negative operands the sign never comes into play. Use BigInt, multiply by doubling, or split the multiplication.

## 3

A rolling hash uses a base of 256 and a modulus of 2 to the 32, through unsigned overflow. What is wrong with it?

A, the hash can no longer be rolled forward in constant time. B, nothing: a power-of-two modulus is only faster to reduce. C, 256 to the 4th is 0 mod 2 to the 32, so only the last 4 characters count. D, 256 is too small a base to separate all ASCII strings.

[think]

The answer is C: 256 to the 4th is 0 mod 2 to the 32, so only the last 4 characters count.

256 to the 4th is exactly 2 to the 32, which is congruent to 0, so every character more than four positions from the end contributes nothing. A prime modulus shares no factor with the base, which keeps every position live. The speed is real but irrelevant when the hash is broken, and 256 already exceeds the ASCII alphabet.

## 4

Eight keys allocated in steps of 4, 1000, 1004, and so on up to 1028, are put into a table of 8 buckets by taking the key mod 8. How many buckets are used, and what fixes it?

A, 8 buckets: the modulus spreads any arithmetic sequence evenly. B, 4 buckets: doubling the table to 16 restores full spread. C, 2 buckets: a prime size, or a mixing step before the mask. D, 2 buckets: only a larger power-of-two size can fix it.

[think]

The answer is C: 2 buckets, fixed by a prime size, or a mixing step before the mask.

4 and 8 share a factor of 4, so the keys cycle through only 8 divided by 4 residues, 0 and 4. Doubling to 16 gives 4 buckets, still a quarter of the table. A prime size shares no factor with any smaller step and uses every bucket. A power-of-two size works only if the hash is mixed first, which is what Java's shift-and-XOR spread and CPython's perturbation do.

## 5

A service assigns each request to one of a billion cells by taking a random 32-bit number mod one billion. What is the distribution error?

A, none: the modulus maps the 32-bit values evenly onto a billion cells. B, about 25 percent: the lowest 295 million cells get 5 chances, the rest 4. C, about 50 percent: half the cells are unreachable by a 32-bit value. D, about 0.1 percent: a rounding effect from 2 to the 32 not dividing a billion.

[think]

The answer is B: about 25 percent, because the lowest 295 million cells get 5 chances, and the rest 4.

2 to the 32 is 4 billion plus about 295 million. So residues below that 295 million are hit by five 32-bit values, and the others by four: the low cells are 25 percent more likely. For a small number of cells, the extra chance is negligible, which is why the bug hides until the count is large. Rejection sampling, as in Python's random range, removes it.

## 6

Why does a to the power p minus 2, mod p, give the inverse of a modulo a prime p?

A, because a to the p minus 2 is congruent to a to the minus 2, and squaring both sides gives 1. B, because p minus 2 is the largest exponent that fits in the modulus. C, because a to the p minus 1 is congruent to 1 by Fermat, so a times a to the p minus 2 is congruent to 1. D, because every power of a is its own inverse when p is prime.

[think]

The answer is C: because a to the p minus 1 is congruent to 1 by Fermat, so a times a to the p minus 2 is congruent to 1.

Multiplying the residues 1 to p minus 1 by a only permutes them, which forces a to the p minus 1 to be congruent to 1. Then a times a to the p minus 2 is a to the p minus 1, which is 1, so a to the p minus 2 is the inverse. The argument needs p to be prime; for a composite modulus, use Euler's phi or extended Euclid.
