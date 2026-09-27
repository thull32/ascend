---
slug: number-theory-essentials
title: "Number theory essentials: GCD, primes, fast powers and modular inverses"
description: Euclid's algorithm and why it is logarithmic, the sieve and its real cost, binary exponentiation, and the two ways to divide under a modulus, with the places each shows up in hashing, sharding, cryptography and interview problems.
minutes: 50
difficulty: medium
tags: [math, number-theory, gcd, primes, sieve, modular-inverse, fast-exponentiation]
problems: [pow-x-n, plus-one, happy-number]
---
You need to rotate an array by $k$ in place and the cycle structure depends on $\gcd(n, k)$. You need `pow(x, n)` in $O(\log n)$ because $n$ is $10^{18}$. You need $\binom{n}{k} \bmod 10^9 + 7$ and there is no division under a modulus. You need to check whether a linear congruential generator will cycle through every value, which depends on whether two numbers are coprime. You need to size a hash table and someone says "make it prime".

Each of those needs one of four tools: the greatest common divisor, primes and how to find them, fast exponentiation, and the modular inverse. Together they are a couple of hundred lines of code that a senior engineer can write from memory and, more importantly, can explain the cost and the failure modes of. This lesson covers exactly those four and stops.

## The greatest common divisor

$\gcd(a, b)$ is the largest integer dividing both. $\gcd(12, 18) = 6$; $\gcd(17, 5) = 1$ (17 and 5 are **coprime**); $\gcd(0, b) = b$ (everything divides 0).

Euclid's algorithm rests on one identity: $\gcd(a, b) = \gcd(b, a \bmod b)$. Any common divisor of $a$ and $b$ also divides $a - qb = a \bmod b$, and conversely, so the pair $(b, a \bmod b)$ has the same common divisors as $(a, b)$. Apply it until the second number is zero:

```python
def gcd(a: int, b: int) -> int:
    while b:
        a, b = b, a % b
    return a
```

Trace $\gcd(252, 105)$:

| step | $a$ | $b$ | $a \bmod b$ |
|---|---|---|---|
| 1 | 252 | 105 | 42 |
| 2 | 105 | 42 | 21 |
| 3 | 42 | 21 | 0 |
| 4 | 21 | 0 | done |

Answer 21, and $252 = 12 \cdot 21$, $105 = 5 \cdot 21$. Three modulo operations for numbers in the hundreds.

**Why it is fast.** After any two steps, $a$ has at least halved: if $b \le a/2$ then $a \bmod b < b \le a/2$; if $b > a/2$ then $a \bmod b = a - b < a/2$. So the number of steps is $O(\log \min(a, b))$: at most about $2 \log_2 (10^{18}) \approx 120$ steps for 64-bit inputs. The worst case is consecutive Fibonacci numbers, where every quotient is 1 and the remainders shrink as slowly as possible (Lamé's theorem: at most about $1.44 \log_2 b$ steps). Never write the "subtract the smaller from the larger" version from school: $\gcd(10^{18}, 1)$ would take $10^{18}$ subtractions.

**LCM** follows: $\text{lcm}(a, b) = a \cdot b / \gcd(a, b)$. Compute it as `a // gcd(a, b) * b` so the division happens before the multiplication; `a * b // gcd` overflows a 64-bit integer for $a, b$ around $10^{10}$ even though the answer fits.

Where GCD shows up:

- **In-place rotation.** Rotating $n$ elements by $k$ positions with the cycle-following method produces exactly $\gcd(n, k)$ cycles, each of length $n / \gcd(n, k)$. With $n = 12, k = 8$: $\gcd = 4$ cycles of length 3.
- **Periodic tasks.** Two jobs running every 6 and 10 minutes coincide every $\text{lcm}(6, 10) = 30$ minutes; a full schedule of $m$ jobs repeats every lcm of all periods, which is why cron-based systems can have surprisingly long "hyperperiods".
- **Random number generators.** A linear congruential generator $x_{i+1} = (ax_i + c) \bmod m$ cycles through all $m$ values only if $\gcd(c, m) = 1$ (plus two other conditions). A step size coprime to the table size is likewise what lets double hashing visit every bucket.
- **Ratios and aspect ratios.** Reducing $1920 : 1080$ by $\gcd = 120$ gives $16 : 9$.
- **Fraction arithmetic** in exact-rational libraries reduces by the GCD after every operation.

## Primes and the sieve

A prime has exactly two divisors, 1 and itself. Testing whether $n$ is prime by trial division needs only divisors up to $\sqrt{n}$: if $n = ab$ with $a \le b$, then $a \le \sqrt{n}$. So $O(\sqrt{n})$ per number, about 31,623 divisions for $n$ near $10^9$, which is fine for one number and hopeless for a million of them.

To find *all* primes up to $n$, sieve. Mark 0 and 1 as composite, then for each $i$ from 2 upward that is still unmarked, mark every multiple $i^2, i^2 + i, i^2 + 2i, \ldots$ as composite. You can start at $i^2$ because smaller multiples of $i$ have a smaller prime factor and were marked already; you can stop the outer loop at $\sqrt{n}$ for the same reason.

```python
def primes_up_to(n: int) -> list[int]:
    if n < 2:
        return []
    is_prime = [True] * (n + 1)
    is_prime[0] = is_prime[1] = False
    i = 2
    while i * i <= n:                     # i grows each iteration: terminates
        if is_prime[i]:
            for j in range(i * i, n + 1, i):
                is_prime[j] = False
        i += 1
    return [k for k in range(n + 1) if is_prime[k]]
```

Trace to 30. $i = 2$: cross out 4, 6, 8, …, 30. $i = 3$: cross out 9, 15, 21, 27 (12, 18, 24, 30 already gone). $i = 4$ is marked, skip. $i = 5$: cross out 25 (and 30, already gone). $i = 6$: $36 > 30$, stop. Survivors: 2, 3, 5, 7, 11, 13, 17, 19, 23, 29. Ten primes.

**Cost.** The inner loop runs $n/2 + n/3 + n/5 + n/7 + \cdots$ times over the primes up to $\sqrt{n}$. That sum is $n \cdot \sum_{p \le n} 1/p \approx n \ln \ln n$, so the sieve is $O(n \log \log n)$: for $n = 10^8$, about $3n$ operations, effectively linear. Memory is the real limit: a byte per number is 100 MB at $10^8$, a bit per number is 12.5 MB, and a segmented sieve that processes windows of $\sqrt{n}$ at a time brings it to almost nothing.

**How many primes are there?** About $n / \ln n$ below $n$ (the prime number theorem). Below $10^6$: 78,498, and $10^6 / \ln(10^6) \approx 72{,}400$, so the estimate is a little low but the right order. Below $2^{32}$: about 203 million. The practical consequence: a random $b$-bit number is prime with probability about $1/(b \ln 2) \approx 1.44/b$, so finding a random 1024-bit prime for RSA means testing a few hundred candidates, which is why probabilistic primality tests (Miller–Rabin) matter.

Where primes show up beyond hashing: cryptography (RSA's modulus is the product of two large primes; Diffie–Hellman works in a prime-order group), the $10^9 + 7$ and $998244353$ moduli in competitive programming (the second is chosen so that FFT works modulo it), and problem statements like "count numbers with exactly three divisors" (squares of primes). The [modular arithmetic lesson](/learn/foundations/math-for-engineers/modular-arithmetic-and-hashing-math) explains why table sizes and hash moduli want to be prime.

## Fast exponentiation

Computing $x^n$ by multiplying $n$ times is $O(n)$, which is unacceptable when $n$ is $10^{18}$ and also silly when $n$ is 1000. Square-and-multiply does it in $O(\log n)$ multiplications.

The idea: write $n$ in binary. $x^{13}$ with $13 = 8 + 4 + 1 = 1101_2$ is $x^8 \cdot x^4 \cdot x^1$. Squaring repeatedly gives $x, x^2, x^4, x^8, \ldots$ in one multiplication each; multiply together the ones whose bit is set.

```python
def power(x: float, n: int) -> float:
    if n < 0:
        x, n = 1 / x, -n
    result = 1.0
    while n > 0:
        if n & 1:
            result *= x
        x *= x
        n >>= 1                  # n strictly decreases: terminates in O(log n) steps
    return result
```

Trace $3^{13}$: $n = 1101_2$. Bit 0 set: result $= 3$, $x = 9$. Bit 1 clear: $x = 81$. Bit 2 set: result $= 3 \cdot 81 = 243$, $x = 6561$. Bit 3 set: result $= 243 \cdot 6561 = 1{,}594{,}323$. Four squarings, three multiplications, and $3^{13} = 1{,}594{,}323$. [Pow(x, n)](/practice/pow-x-n) is exactly this function; the parts interviewers watch for are the negative exponent, $n = 0$, and not overflowing when negating `INT_MIN` in a 32-bit language.

The same skeleton with `% m` after each multiplication is **modular exponentiation**, the workhorse of RSA, Diffie–Hellman, Miller–Rabin and Fermat inverses (below). And the same skeleton with matrix multiplication in place of number multiplication computes the $n$-th term of any linear recurrence in $O(\log n)$: Fibonacci via $\begin{pmatrix}1&1\\1&0\end{pmatrix}^n$, or "number of length-$n$ walks in a graph" via the adjacency matrix. Anything associative can be exponentiated this way; that is why it is called *binary* exponentiation and not *numeric* exponentiation.

## The modular inverse: dividing without dividing

Under a modulus $m$, "$a / b$" means $a \cdot b^{-1}$, where $b^{-1}$ is the number with $b \cdot b^{-1} \equiv 1 \pmod m$. It exists exactly when $\gcd(b, m) = 1$. With $m = 7$, $3^{-1} = 5$ because $3 \cdot 5 = 15 \equiv 1$. With $m = 4$, $2$ has no inverse: $2 \cdot k$ is always even, never $\equiv 1 \pmod 4$.

There are two ways to compute it.

### Fermat's little theorem (prime modulus only)

If $p$ is prime and $p \nmid a$, then $a^{p-1} \equiv 1 \pmod p$. Multiply both sides by $a^{-1}$: $a^{p-2} \equiv a^{-1}$. So the inverse is one modular exponentiation:

```python
def inverse_fermat(a: int, p: int) -> int:
    return pow(a, p - 2, p)     # Python's built-in three-argument pow

inverse_fermat(3, 7)   # 5
```

$O(\log p)$ multiplications. This is what everyone uses with $m = 10^9 + 7$, and it is *wrong* if $m$ is not prime, silently returning garbage. It is also where JavaScript needs `BigInt`, because $a \cdot a$ with $a$ near $10^9$ exceeds $2^{53}$.

### Extended Euclid (any coprime pair)

Euclid's algorithm can be run backwards to express the GCD as a combination of the inputs: find $x, y$ with $ax + by = \gcd(a, b)$ (Bézout's identity). If $\gcd(a, m) = 1$ that reads $ax + my = 1$, so $ax \equiv 1 \pmod m$ and $x$ is the inverse.

```python
def extended_gcd(a: int, b: int) -> tuple[int, int, int]:
    """Return (g, x, y) with a*x + b*y == g == gcd(a, b)."""
    if b == 0:
        return a, 1, 0
    g, x1, y1 = extended_gcd(b, a % b)
    # b*x1 + (a % b)*y1 == g, and a % b == a - (a//b)*b, so:
    return g, y1, x1 - (a // b) * y1

def mod_inverse(a: int, m: int) -> int:
    g, x, _ = extended_gcd(a % m, m)
    if g != 1:
        return -1                 # no inverse: a and m share a factor
    return x % m                  # Python's % makes it non-negative
```

Trace the inverse of 3 mod 11 by hand. Forward Euclid: $11 = 3 \cdot 3 + 2$, then $3 = 1 \cdot 2 + 1$, then $2 = 2 \cdot 1 + 0$, so $\gcd = 1$. Backward substitution: $1 = 3 - 1 \cdot 2$, and $2 = 11 - 3 \cdot 3$, so $1 = 3 - 1 \cdot (11 - 3 \cdot 3) = 4 \cdot 3 - 1 \cdot 11$. Therefore $3 \cdot 4 \equiv 1 \pmod{11}$: the inverse is 4. Check: $12 = 11 + 1$.

The recursion depth is the number of Euclid steps, $O(\log m)$, at most about 90 for 64-bit inputs, so stack depth is not a concern. The coefficients stay bounded by $m$ in magnitude, so this version is safe in JavaScript for any $m$ below $2^{53}$, unlike Fermat. It also tells you *when there is no inverse* instead of returning nonsense, which is the right behaviour for library code.

### Where the inverse is used

- **Binomials modulo a prime**: $\binom{n}{k} \bmod p = n! \cdot (k!)^{-1} \cdot ((n-k)!)^{-1} \bmod p$. Precompute factorials and inverse factorials up to $n$ once ($O(n \log p)$, or $O(n)$ with a batch trick), then every binomial is three multiplications. This is the standard way to answer "count the lattice paths / combinations mod $10^9 + 7$" for $n$ up to $10^6$.
- **Rolling hash removal**: to remove a prefix's contribution from a hash you multiply by $B^{-1}$ rather than dividing, which requires $B$ and $M$ coprime, one more reason $M$ is prime.
- **Sharding and striding**: a stride $s$ coprime to $n$ visits every slot of a ring of size $n$; the inverse of $s$ tells you which step landed on a given slot.
- **RSA**: the private exponent is the inverse of the public exponent modulo $(p-1)(q-1)$, computed with extended Euclid because that modulus is not prime.
- **Elliptic-curve and other cryptographic arithmetic**, where a modular inverse is the most expensive step and engineers batch them (Montgomery's trick: one inverse for $n$ values plus $3n$ multiplications).

## Putting the four together: a worked interview problem

"Return $\binom{n}{k} \bmod 10^9 + 7$ for many queries with $n \le 10^6$." The mid-level solution recomputes each binomial with the multiplicative formula and fails because it needs division. The senior solution:

```python
MOD = 10**9 + 7
N = 10**6

fact = [1] * (N + 1)
for i in range(1, N + 1):
    fact[i] = fact[i - 1] * i % MOD              # O(N)

inv_fact = [1] * (N + 1)
inv_fact[N] = pow(fact[N], MOD - 2, MOD)         # one Fermat inverse, O(log MOD)
for i in range(N, 0, -1):
    inv_fact[i - 1] = inv_fact[i] * i % MOD      # (i-1)!^-1 = i!^-1 * i

def binom(n: int, k: int) -> int:
    if k < 0 or k > n:
        return 0
    return fact[n] * inv_fact[k] % MOD * inv_fact[n - k] % MOD   # O(1) per query
```

Fast exponentiation gives one inverse; the downward loop turns it into all of them in $O(N)$; the modulus being prime is what makes Fermat valid; and the whole thing is $O(N + Q)$ for $Q$ queries. Every piece of this lesson appears in eleven lines.

## Exercises

```exercise
id: primes-up-to
title: Sieve of Eratosthenes
prompt: |
  Return all primes less than or equal to `n`, in increasing order, as a
  list. Use a sieve: mark composites by striding through multiples of each
  prime starting at its square. `n` may be as small as 0.
languages: [python, javascript]
entry: primes_up_to
starter:
  python: |
    def primes_up_to(n):
        # your code here
        return []
  javascript: |
    function primes_up_to(n) {
      // your code here
      return [];
    }
tests:
  - args: [1]
    expected: []
    label: no primes below 2
  - args: [2]
    expected: [2]
  - args: [30]
    expected: [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
    label: the worked trace
  - args: [0]
    expected: []
    hidden: true
  - args: [100]
    expected: [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97]
    hidden: true
    label: 25 primes below 100
hints:
  - "Allocate a boolean array of size n + 1, set indices 0 and 1 to false."
  - "For i from 2 while i * i <= n: if i is still marked prime, mark i*i, i*i + i, ... as composite."
```

```exercise
id: mod-inverse
title: Modular inverse via extended Euclid
prompt: |
  Return the modular inverse of `a` modulo `m` (`m >= 2`): the integer `x`
  in `[0, m)` with `(a * x) % m == 1`. Return `-1` when no inverse exists,
  which is exactly when `gcd(a, m) != 1`. Use the extended Euclidean
  algorithm; it works for any modulus, prime or not, and its intermediate
  values stay small enough for plain JavaScript numbers on every test
  (Fermat's method would not, and would be wrong for the non-prime moduli).
languages: [python, javascript]
entry: mod_inverse
starter:
  python: |
    def mod_inverse(a, m):
        # your code here
        return -1
  javascript: |
    function mod_inverse(a, m) {
      // your code here
      return -1;
    }
tests:
  - args: [3, 11]
    expected: 4
    label: the worked trace
  - args: [3, 7]
    expected: 5
  - args: [2, 4]
    expected: -1
    label: gcd(2, 4) = 2, no inverse
  - args: [10, 17]
    expected: 12
  - args: [1, 5]
    expected: 1
    label: 1 is its own inverse
  - args: [17, 43]
    expected: 38
    hidden: true
  - args: [5, 5]
    expected: -1
    hidden: true
    label: a multiple of m has no inverse
  - args: [123456789, 1000000007]
    expected: 18633540
    hidden: true
    label: the usual competitive-programming prime
hints:
  - "extended_gcd(a, b) returns (g, x, y) with a*x + b*y = g; base case b == 0 returns (a, 1, 0)."
  - "From the recursive result (g, x1, y1) for (b, a % b), the answer for (a, b) is (g, y1, x1 - (a // b) * y1). Use Math.floor for the quotient in JavaScript."
  - "Normalise the result into [0, m) with ((x % m) + m) % m."
```

## Senior signals

- You can say why Euclid is $O(\log \min(a, b))$ (the argument halves every two steps) and that consecutive Fibonacci numbers are the worst case.
- You compute `a // gcd * b` for the LCM and can explain which order overflows.
- You quote the sieve's cost as $O(n \log \log n)$, know that memory rather than time is its limit, and mention segmented or bit-packed sieves when $n$ is large.
- You reach for binary exponentiation for anything associative (numbers, matrices, permutations) and handle $n = 0$, negative $n$ and `INT_MIN` without being prompted.
- You know that Fermat's inverse needs a prime modulus and that extended Euclid works for any coprime pair and reports when no inverse exists; you choose between them deliberately.
- You solve "binomials mod a prime for a million queries" with precomputed factorials and inverse factorials in $O(N + Q)$, and you can explain every line.

## Check yourself

```quiz
- q: >-
    Why is Euclid's algorithm with the modulo operation O(log min(a, b)) steps, while the subtraction-based version is not?
  options: ["Modulo is one CPU instruction, so each step is cheaper", "Every two modulo steps at least halve the larger number", "Both are logarithmic; subtraction is just slower per step", "The modulo version is iterative, so it avoids recursion"]
  answer: 1
  explanation: >-
    Whether b is above or below a/2, a mod b is below a/2, so the pair halves every two steps: logarithmic. Subtraction may shrink the larger number by only 1 per step, so gcd(10^18, 1) by repeated subtraction takes 10^18 steps. The instruction cost of modulo is irrelevant to the step count.
- q: >-
    You compute lcm(a, b) as `a * b / gcd(a, b)` in a 64-bit language with a and b around 10^10. What happens?
  options: ["a * b overflows 64 bits before the division happens", "The division truncates, since gcd need not divide a * b", "It is correct; the result is around 10^10 and fits", "gcd(a, b) overflows while reducing the large inputs"]
  answer: 0
  explanation: >-
    a * b is about 10^20, above 2^64 ≈ 1.8 × 10^19, so the product wraps before the division, giving a wrong answer even when the true lcm fits. Dividing first (a / gcd * b) keeps every intermediate value at or below the final answer. The gcd divides a exactly, so no truncation occurs.
- q: >-
    A colleague computes the modular inverse as `pow(a, m - 2, m)` for a modulus m = 1,000,000 (not prime). What is the outcome?
  options: ["Correct for odd a, since only even a shares a factor", "Wrong in general: the Fermat shortcut needs a prime m", "Correct, since Fermat's theorem holds for any modulus", "A runtime error, since Python rejects composite moduli"]
  answer: 1
  explanation: >-
    a^(m-2) is the inverse only when a^(m-1) ≡ 1, which Fermat guarantees for prime m. For composite m the result is an unrelated number even when a is coprime to m, and for a sharing a factor with m no inverse exists at all. Extended Euclid handles both cases and reports when no inverse exists.
- q: >-
    Computing x^n by repeated squaring for n = 10^18 takes about how many multiplications?
  options: ["About 10^18, one multiplication for each unit of n", "About 18, one per decimal digit of the exponent", "About 10^9, the square root of the exponent", "About 60 squarings plus up to 60 multiplications"]
  answer: 3
  explanation: >-
    10^18 is just under 2^60, so its binary representation has 60 bits: one squaring per bit and one extra multiplication per set bit. Around 120 multiplications total. 18 confuses the decimal digit count with the binary length.
- q: >-
    The sieve of Eratosthenes up to n starts marking multiples of prime p at p^2 rather than at 2p. Why is that safe?
  options: ["Every kp with k < p was marked by a smaller prime", "Because even numbers are skipped by the sieve anyway", "It is not safe; it misses composites such as 2p and 3p", "Because the outer loop only runs up to sqrt(n)"]
  answer: 0
  explanation: >-
    A multiple kp with k < p has a prime factor of k that is smaller than p, so it was crossed out when that smaller prime was processed. Starting at p^2 skips redundant work. Skipping evens only covers 2p, not 3p or 5p; the sqrt(n) bound on the outer loop is a separate consequence of the same fact.
```
