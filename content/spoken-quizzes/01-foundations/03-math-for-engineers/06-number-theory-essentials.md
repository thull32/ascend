---
lesson: number-theory-essentials
source: fcda30fa8cf240c9
---
## 1

Why is Euclid's algorithm with the modulo operation logarithmic in the smaller number, while the version based on subtraction is not?

A, modulo is one processor instruction, so each step is cheaper. B, every two modulo steps at least halve the larger number. C, both are logarithmic: subtraction is only slower per step. D, the modulo version is iterative, so it avoids recursion.

[think]

The answer is B: every two modulo steps at least halve the larger number.

Whether b is above or below half of a, a mod b is below half of a, so the pair halves every two steps: logarithmic. Subtraction may shrink the larger number by only 1 per step, so the greatest common divisor of 10 to the 18 and 1, by repeated subtraction, takes 10 to the 18 steps. The instruction cost of modulo is irrelevant to the step count.

## 2

In a 64-bit language, you compute the least common multiple as a times b, divided by their greatest common divisor, with a equal to 6 billion and b equal to 4 billion. What happens?

A, the division truncates, since the divisor need not divide a times b. B, a times b overflows 64 bits before the division happens. C, it is correct: the result is 12 billion, and it fits. D, the greatest common divisor overflows while reducing the large inputs.

[think]

The answer is B: a times b overflows 64 bits before the division happens.

A times b is 24 billion billion, above 2 to the 64, which is about 18 billion billion, so the product wraps before the division and gives a wrong answer, even though the true result, 12 billion, fits easily. Dividing first, a divided by the common divisor, then times b, keeps every intermediate value at or below the final answer. The common divisor divides a exactly, so no truncation occurs.

## 3

A colleague computes the modular inverse as a to the m minus 2, mod m, for a modulus m of one million, which is not prime. What is the outcome?

A, correct for odd a, since only even a shares a factor with m. B, wrong in general: the Fermat shortcut needs a prime modulus. C, correct, since Fermat's theorem holds for any modulus. D, a runtime error, since Python rejects composite moduli.

[think]

The answer is B: wrong in general, because the Fermat shortcut needs a prime modulus.

A to the m minus 2 is the inverse only when a to the m minus 1 is 1, which Fermat guarantees for a prime modulus. Measured: for 3, it returns 888,889, and 3 times that leaves 666,667, not 1, even though 3 and one million are coprime and the true inverse, 666,667, exists. Extended Euclid handles both cases, and reports when no inverse exists.

## 4

Computing x to the n by repeated squaring, for n equal to 10 to the 18, takes about how many multiplications?

A, about 10 to the 18, one for each unit of n. B, about 18, one per decimal digit of the exponent. C, about a billion, the square root of the exponent. D, about 60 squarings, plus up to 60 multiplications.

[think]

The answer is D: about 60 squarings, plus up to 60 multiplications.

10 to the 18 is a little under 2 to the 60, so its binary form has 60 bits: one squaring per bit, and one extra multiplication per set bit. That came to around 90 multiplications in the measured case, 2.9 microseconds in CPython with a modulus. The answer 18 confuses the count of decimal digits with the binary length.

## 5

The sieve of Eratosthenes up to n starts marking the multiples of a prime p at p squared, rather than at 2 p. Why is that safe?

A, every multiple k times p, with k below p, was already marked by a smaller prime. B, because even numbers are skipped by the sieve anyway. C, it is not safe: it misses composites such as 2 p and 3 p. D, because the outer loop only runs up to the square root of n.

[think]

The answer is A: every multiple k times p, with k below p, was already marked by a smaller prime.

Such a multiple has a prime factor of k that is smaller than p, so it was crossed out when that smaller prime was processed. Starting at p squared skips redundant work. Skipping evens only covers 2 p, not 3 p or 5 p, and the square-root bound on the outer loop is a separate consequence of the same fact.

## 6

A Miller-Rabin round on 221, with n minus 1 written as 4 times 55, gives the sequence 128 then 30 for base 2. For base 174 it gives 47 then 220. What do the two rounds tell you?

A, the rounds conflict, so Miller-Rabin cannot decide 221. B, both rounds prove 221 prime, since neither sequence starts at 1. C, base 2 proves 221 composite; base 174 is a liar that says probably prime. D, base 2 says probably prime; base 174 proves 221 composite.

[think]

The answer is C: base 2 proves 221 composite, and base 174 is a liar that says probably prime.

A prime must produce a sequence that starts at 1 or passes through n minus 1, here 220. Base 2 gives 128 then 30, neither, so 221 is certainly composite and 2 is a witness. Base 174 reaches 220, which is consistent with primality, so it is a liar; 221 is 13 times 17. One witness settles it, and at most a quarter of bases lie for any composite, which is why several bases are used.
