---
lesson: number-theory-essentials
source: 90662bcc24824040
fit: partial
desk:
  - "The Euclid trace and the halving argument behind its logarithmic bound"
  - "The extended Euclid trace, forward and backward, and the three-pair table for the inverse of 3 mod 11"
  - "The sieve trace to 30, and the Miller-Rabin rounds on 221"
  - "The fast exponentiation trace for 3 to the 13th, and the Fibonacci matrix power"
  - "The inverse-methods table and the binomials-mod-a-prime code"
  - "Exercises: sieve of Eratosthenes, modular inverse via extended Euclid"
---
## Introduction

You need to rotate an array by k in place, and the cycle structure depends on the greatest common divisor of n and k. You need x to the n in logarithmic time, because n is 10 to the 18. You need n choose k modulo 10 to the 9 plus 7, and there is no division under a modulus. You need to know whether a 64-bit number is prime in microseconds, not minutes. And someone says "make the hash table size prime".

Each of those needs one of four tools: the greatest common divisor, primes and how to find or test them, fast exponentiation, and the modular inverse. Together they are a couple of hundred lines a senior engineer can write from memory. More importantly, you should be able to explain what each one costs and how each one fails. That is what this episode carries; the hand traces are at your desk.

## The greatest common divisor

The GCD of two numbers is the largest integer dividing both. The GCD of 12 and 18 is 6. 17 and 5 have GCD 1, which makes them coprime.

Euclid's algorithm rests on one identity: the GCD of a and b equals the GCD of b and a mod b, because anything dividing both a and b also divides the remainder. Repeat until the second number is zero. One tiny example by ear: 252 and 105. 252 mod 105 is 42. 105 mod 42 is 21. 42 mod 21 is 0. The answer is 21, in three steps.

Why is it fast? Every two steps, the larger number at least halves. If b is at most half of a, the remainder is smaller than b. If b is more than half of a, the remainder is a minus b, which is less than half. So the step count is logarithmic. The worst case is consecutive Fibonacci numbers, where every quotient is 1: two 19-digit Fibonacci numbers take 89 steps, while two other numbers of the same size can take 3. Never write the subtraction version from school. The GCD of 10 to the 18 and 1, by subtraction, takes 10 to the 18 steps.

The least common multiple follows: a times b over the GCD. But order matters. Take a of 6 billion and b of 4 billion. Before I tell you: computed as a times b, then divided by the GCD, in a 64-bit language, what happens?

[pause]

a times b is 2.4 times 10 to the 19, which is past 2 to the 64. It wraps before the division ever happens, even though the true answer, 12 billion, fits easily. Divide first, then multiply: a divided by the GCD, times b. A scheduler computing the hyperperiod of two jobs that way fires them at the wrong times.

Where else the GCD shows up. Rotating 12 elements by 8 with cycle-following gives GCD of 12 and 8, four cycles, each of length 3. Two jobs every 6 and 10 minutes coincide every 30, the LCM. And a step size coprime to the table size is what lets double hashing visit every bucket.

## The extended algorithm and Bézout

Run Euclid backwards, substituting each remainder in terms of the two before it, and you can write the GCD as a combination of the inputs: some x times a plus some y times b. That is Bézout's identity, and it is the tool behind the modular inverse. For 240 and 46, the GCD is 2, and it equals minus 9 times 240 plus 47 times 46.

The iterative form carries three pairs, remainders and two sets of coefficients, and updates each with the same quotient. Its invariant is that each row is still a valid combination of the two inputs. Run it on 11 and 3 and the last row says that 3 times 4 is one more than a multiple of 11. So 4 is the inverse of 3 modulo 11. Its coefficients stay bounded by the inputs, which matters in a moment. This is the one table in the lesson most worth tracing by hand.

## Primes: sieving and testing

To test one number by trial division, you only need divisors up to its square root. Deciding that 10 to the 9 plus 7 is prime that way takes about 16 thousand divisions, 387 microseconds in CPython. Fine for one number. Hopeless for a 64-bit number, which needs over 4 billion.

To find all primes up to n, sieve. For each number still unmarked, cross out its multiples, starting at its square. Why is it safe to start at the square rather than at twice the prime?

[pause]

Because every smaller multiple, k times p with k less than p, has a smaller prime factor, so it was crossed out when that smaller prime was processed. The same fact lets the outer loop stop at the square root of n. The cost is n log log n, about 3n operations at 10 to the 8. Measured, the sieve to 10 million takes 34 milliseconds and finds 664,579 primes.

Memory is the real limit, and the representation decides it. At 10 to the 9, a Python list of booleans is 8 gigabytes of pointers. A byte array is 1 gigabyte. A bit-packed sieve is 125 megabytes. And a segmented sieve, processing one window at a time, needs almost nothing.

For testing large numbers, Miller-Rabin. It strengthens Fermat's little theorem: for a prime n, a certain sequence of squarings must either start at 1 or pass through n minus 1. If it does neither, n is certainly composite and the base is a witness. If it does, n is probably prime for that base, and the base might be a liar. With 221, which is 13 times 17, base 2 is a witness, while base 174 lies and says probably prime. One witness settles compositeness. At most a quarter of bases lie for any composite, so k random bases leave an error of at most one in 4 to the k. And for every 64-bit integer, the twelve fixed bases from 2 to 37 are known to be deterministic. Each base is one modular exponentiation, so the whole test is microseconds.

## Fast exponentiation

Computing x to the n by multiplying n times is unacceptable at 10 to the 18. Square-and-multiply does it in logarithmic time. Write n in binary. x to the 13 is x to the 8 times x to the 4 times x to the 1, because 13 is 1101. Squaring repeatedly gives x, x squared, x to the 4, x to the 8, one multiplication each; then you multiply in the ones whose bit is set. Four squarings, three multiplications.

For 10 to the 18, which is just under 2 to the 60, that is 60 squarings plus at most 60 multiplications. Measured, 3 to the 10 to the 18, mod 10 to the 9 plus 7, takes 2.9 microseconds. Put the modulus after each multiplication and this is modular exponentiation, the workhorse of RSA, Diffie-Hellman, Miller-Rabin and Fermat inverses. And because it only needs associativity, the same skeleton raises matrices, which computes the n-th Fibonacci number in logarithmic time.

The edge cases interviewers watch: n equal to zero, a negative exponent, and negating the most negative 32-bit integer, which overflows back to itself.

## The modular inverse, and the wrong way to get one

Under a modulus, dividing by b means multiplying by b's inverse, the number that times b leaves 1. It exists exactly when b and the modulus are coprime. Modulo 7, the inverse of 3 is 5. Modulo 4, 2 has no inverse at all, because 2 times anything is even.

Two ways to compute it. Fermat: for a prime modulus p, the inverse is a to the p minus 2, one fast exponentiation. That is what everyone uses with 10 to the 9 plus 7. And it is silently wrong if the modulus is not prime. Measured with a modulus of one million: Fermat's formula for the inverse of 3 returns 888,889. Three times that leaves 666,667, not 1. Nothing raises; the wrong number flows on into whatever you were computing.

Extended Euclid works for any coprime pair, reports when no inverse exists instead of returning garbage, and keeps its intermediates no larger than the inputs, so it is safe in JavaScript numbers. Fermat's squarings of numbers near a billion pass 2 to the 53 and round. Python 3.8 and later exposes extended Euclid as pow of a, minus 1, m, which raises an error when there is no inverse.

All four tools meet in one interview problem: n choose k modulo 10 to the 9 plus 7, for a million queries. Precompute factorials once. Take one Fermat inverse of the largest factorial, valid because the modulus is prime. Then walk downward, multiplying by i at each step, to get every inverse factorial in linear time; that walk is batch inversion in disguise. Each query is three multiplications.

## In the interview

Here is a follow-up the lesson expects. How would you test whether a 64-bit number is prime, fast?

[pause]

Trial-divide by the primes below a few hundred to discard most composites cheaply. Then run Miller-Rabin with the twelve fixed bases, 2 through 37, which is deterministic for every 64-bit input. Each base is one modular exponentiation, so the whole test takes microseconds. The wrong answers are trial division to the square root, which is billions of divisions, or a sieve up to n, which is impossible memory.

And another: why do hash tables use prime sizes, or do they? A prime size spreads keys that share a factor with the size, even under a weak hash. With a good mixing hash, a power-of-two size is just as good, and indexing by mask is far cheaper than a real modulo, which costs 10 to 40 cycles against 3 or 4 for a multiply. That is what CPython, Java and Rust do. The wrong answer is "primes are always better", stated as a law.

## Recap

Five things to remember. Euclid's algorithm halves every two steps, so it is logarithmic, with Fibonacci pairs as the worst case, and the LCM is computed as divide first, then multiply. The extended algorithm gives Bézout coefficients, and the coefficient is the inverse. The sieve is n log log n, and memory, not time, is its limit. Square-and-multiply raises anything associative in logarithmic steps. And Fermat's inverse needs a prime modulus and returns garbage otherwise, while extended Euclid works for any coprime pair and tells you when there is no inverse.

At your desk: the Euclid and extended Euclid traces, the sieve and Miller-Rabin traces, the exponentiation and matrix traces, the inverse-methods table with the binomial code, and the two exercises.
