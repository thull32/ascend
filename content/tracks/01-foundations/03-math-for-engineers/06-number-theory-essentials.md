---
slug: number-theory-essentials
title: "Number theory essentials: GCD, primes, fast powers and modular inverses"
description: Euclid's algorithm with its logarithmic bound and measured worst case, the extended algorithm traced forward and backward, the sieve with its real cost and memory, Miller–Rabin traced on a composite and a liar, binary exponentiation traced for numbers, residues and matrices, and the two ways to divide under a modulus with the failure of the wrong one demonstrated.
minutes: 55
difficulty: medium
tags: [math, number-theory, gcd, primes, sieve, modular-inverse, fast-exponentiation, miller-rabin]
problems: [pow-x-n, plus-one, happy-number]
---
You need to rotate an array by $k$ in place and the cycle structure depends on $\gcd(n, k)$. You need `pow(x, n)` in $O(\log n)$ because $n$ is $10^{18}$. You need $\binom{n}{k} \bmod 10^9 + 7$ and there is no division under a modulus. You need to know whether a 64-bit number is prime in microseconds, not minutes. You need to size a hash table and someone says "make it prime".

Each of those needs one of four tools: the greatest common divisor, primes and how to find or test them, fast exponentiation, and the modular inverse. Together they are a couple of hundred lines of code that a senior engineer can write from memory and, more importantly, can explain the cost and the failure modes of. This lesson traces every one of them on concrete numbers, measures the costs in CPython 3.14, and shows what the wrong tool returns when it is used anyway.

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

**Why it is fast.** After any two steps, $a$ has at least halved: if $b \le a/2$ then $a \bmod b < b \le a/2$; if $b > a/2$ then $a \bmod b = a - b < a/2$. So the number of steps is $O(\log \min(a, b))$: at most about $2 \log_2 (10^{18}) \approx 120$ for 64-bit inputs. The worst case is consecutive Fibonacci numbers, where every quotient is 1 and the remainders shrink as slowly as possible; Lamé's theorem bounds the steps by $\log_\varphi b + 1 \approx 1.44 \log_2 b + 1$. Measured: $\gcd(F_{91}, F_{90})$, two 19-digit numbers, takes exactly 89 steps (the bound gives 89.3; $1.44 \log_2 b$ alone is 88.3, so the $+1$ matters), while $\gcd(2^{63} - 1, 2^{62})$, numbers of the same size, takes 3. Never write the "subtract the smaller from the larger" version from school: $\gcd(10^{18}, 1)$ would take $10^{18}$ subtractions.

**LCM** follows: $\text{lcm}(a, b) = a \cdot b / \gcd(a, b)$. Compute it as `a // gcd(a, b) * b` so the division happens before the multiplication. With $a = 6 \times 10^9$ and $b = 4 \times 10^9$, $\gcd = 2 \times 10^9$ and the LCM is $1.2 \times 10^{10}$, which fits comfortably in 64 bits, but $a \cdot b = 2.4 \times 10^{19}$ exceeds $2^{64}$ and wraps before the division ever happens. Python does not care; Go, Java, Rust in release mode and C do.

Where GCD shows up:

- **In-place rotation.** Rotating $n$ elements by $k$ positions with the cycle-following method produces exactly $\gcd(n, k)$ cycles, each of length $n / \gcd(n, k)$. With $n = 12, k = 8$: $\gcd = 4$ cycles of length 3.
- **Periodic tasks.** Two jobs running every 6 and 10 minutes coincide every $\text{lcm}(6, 10) = 30$ minutes; a full schedule of $m$ jobs repeats every lcm of all periods, which is why cron-based systems can have surprisingly long "hyperperiods".
- **Random number generators and probing.** A linear congruential generator $x_{i+1} = (ax_i + c) \bmod m$ cycles through all $m$ values only if $\gcd(c, m) = 1$ (plus two other conditions). A step size coprime to the table size is likewise what lets double hashing visit every bucket.
- **Ratios.** Reducing $1920 : 1080$ by $\gcd = 120$ gives $16 : 9$; exact-rational libraries reduce by the GCD after every operation.

## The extended algorithm: Bézout's coefficients

Euclid's algorithm can be run backwards to express the GCD as a combination of the inputs: integers $x, y$ with $ax + by = \gcd(a, b)$ (Bézout's identity). This is the tool behind the modular inverse, and it deserves a full trace. Take $a = 240$, $b = 46$. Forward, recording the quotients:

| step | equation | quotient | remainder |
|---|---|---|---|
| 1 | $240 = 5 \cdot 46 + 10$ | 5 | 10 |
| 2 | $46 = 4 \cdot 10 + 6$ | 4 | 6 |
| 3 | $10 = 1 \cdot 6 + 4$ | 1 | 4 |
| 4 | $6 = 1 \cdot 4 + 2$ | 1 | 2 |
| 5 | $4 = 2 \cdot 2 + 0$ | 2 | 0 |

So $\gcd = 2$. Backward, substituting each remainder in terms of the two before it:

| from step | expression for the GCD |
|---|---|
| 4 | $2 = 6 - 1 \cdot 4$ |
| 3 ($4 = 10 - 1 \cdot 6$) | $2 = 6 - (10 - 6) = 2 \cdot 6 - 1 \cdot 10$ |
| 2 ($6 = 46 - 4 \cdot 10$) | $2 = 2(46 - 4 \cdot 10) - 10 = 2 \cdot 46 - 9 \cdot 10$ |
| 1 ($10 = 240 - 5 \cdot 46$) | $2 = 2 \cdot 46 - 9(240 - 5 \cdot 46) = 47 \cdot 46 - 9 \cdot 240$ |

Therefore $240 \cdot (-9) + 46 \cdot 47 = -2160 + 2162 = 2$. The coefficients are $x = -9$, $y = 47$.

The recursive code does the same substitution on the way back up the call stack:

```python
def extended_gcd(a: int, b: int) -> tuple[int, int, int]:
    """Return (g, x, y) with a*x + b*y == g == gcd(a, b)."""
    if b == 0:
        return a, 1, 0
    g, x1, y1 = extended_gcd(b, a % b)
    # b*x1 + (a % b)*y1 == g, and a % b == a - (a//b)*b, so:
    return g, y1, x1 - (a // b) * y1
```

The iterative form carries three pairs (remainders, $x$-coefficients, $y$-coefficients) and updates each by the same quotient. Trace it for $(11, 3)$, which is the computation behind "the inverse of 3 modulo 11":

| $q$ | $(r_{\text{old}}, r)$ | $(s_{\text{old}}, s)$ | $(t_{\text{old}}, t)$ |
|---|---|---|---|
| start | $(11, 3)$ | $(1, 0)$ | $(0, 1)$ |
| 3 | $(3, 2)$ | $(0, 1)$ | $(1, -3)$ |
| 1 | $(2, 1)$ | $(1, -1)$ | $(-3, 4)$ |
| 2 | $(1, 0)$ | $(-1, 3)$ | $(4, -11)$ |

Stop when $r = 0$: $\gcd = r_{\text{old}} = 1 = 11 \cdot (-1) + 3 \cdot 4$. The coefficient of 3 is 4, so $3 \cdot 4 = 12 \equiv 1 \pmod{11}$. The invariant that makes the table work is that at every row $11 \cdot s_{\text{old}} + 3 \cdot t_{\text{old}} = r_{\text{old}}$ and $11 s + 3 t = r$; check the second row: $11 \cdot 0 + 3 \cdot 1 = 3$ and $11 \cdot 1 + 3 \cdot (-3) = 2$. The recursion depth (or row count) is the number of Euclid steps, $O(\log m)$, and the coefficients stay bounded by the inputs in magnitude, which is why this version is safe in JavaScript for any modulus below $2^{53}$.

## Primes: the sieve, and testing one number

A prime has exactly two divisors. Testing whether $n$ is prime by trial division needs only divisors up to $\sqrt{n}$: if $n = ab$ with $a \le b$, then $a \le \sqrt{n}$. Measured: deciding that $10^9 + 7$ is prime by trial division over odd numbers takes 15,811 divisions and 387 µs in CPython. Fine for one number; hopeless for a million of them, or for one 64-bit number ($\sqrt{2^{64}} = 4.3 \times 10^9$ divisions).

To find *all* primes up to $n$, sieve. Mark 0 and 1 as composite, then for each $i$ from 2 upward that is still unmarked, mark every multiple $i^2, i^2 + i, i^2 + 2i, \ldots$ as composite. You can start at $i^2$ because smaller multiples of $i$ have a smaller prime factor and were marked already; you can stop the outer loop at $\sqrt{n}$ for the same reason.

```python
def primes_up_to(n: int) -> list[int]:
    if n < 2:
        return []
    is_prime = bytearray([1]) * (n + 1)      # one byte per number, not one object
    is_prime[0] = is_prime[1] = 0
    i = 2
    while i * i <= n:                        # i grows each iteration: terminates
        if is_prime[i]:
            is_prime[i * i::i] = bytes(len(range(i * i, n + 1, i)))   # one C-level slice write
        i += 1
    return [k for k in range(n + 1) if is_prime[k]]
```

Trace to 30. $i = 2$: cross out 4, 6, 8, …, 30. $i = 3$: cross out 9, 15, 21, 27 (12, 18, 24, 30 already gone). $i = 4$ is marked, skip. $i = 5$: cross out 25 (and 30, already gone). $i = 6$: $36 > 30$, stop. Survivors: 2, 3, 5, 7, 11, 13, 17, 19, 23, 29. Ten primes.

**Cost.** The inner loop runs $n/2 + n/3 + n/5 + n/7 + \cdots$ times over the primes up to $\sqrt{n}$. That sum is $n \cdot \sum_{p \le n} 1/p \approx n \ln \ln n$, so the sieve is $O(n \log \log n)$: for $n = 10^8$ about $3n$ operations. Measured: the sieve to $10^7$ above takes 34 ms and finds 664,579 primes. Memory is the real limit, and the representation decides it: the `bytearray` is 10 MB; a Python `list` of `True`/`False` is 80 MB of pointers at $10^7$ and 8 GB at $10^9$; a bit-packed sieve is 1.25 MB at $10^7$ and 125 MB at $10^9$ (the [bit manipulation lesson](/learn/foundations/math-for-engineers/bit-manipulation) covers bitsets); a segmented sieve that processes windows of $\sqrt{n}$ numbers at a time needs almost nothing.

**How many primes are there?** About $n / \ln n$ below $n$ (the prime number theorem), and the refinement $n / (\ln n - 1)$ is much closer: below $10^6$ there are 78,498 primes; $n/\ln n$ gives 72,382 and $n/(\ln n - 1)$ gives 78,030. Below $2^{32}$: 203,280,221. The practical consequence: a random $b$-bit odd number is prime with probability about $2/(b \ln 2)$, which for $b = 1024$ is 0.28%, so finding a random 1024-bit prime for RSA means testing on the order of 350 candidates, which is why a fast probabilistic test matters.

### Miller–Rabin, traced

Fermat's little theorem says that for prime $p$ and $a$ not divisible by $p$, $a^{p-1} \equiv 1 \pmod p$. Miller–Rabin strengthens it: write $n - 1 = 2^s d$ with $d$ odd, compute $x = a^d \bmod n$, and square it $s - 1$ times. If $n$ is prime, the sequence must either start at 1 or pass through $n - 1$ (the only square roots of 1 modulo a prime are $\pm 1$). If it does neither, $n$ is composite, and $a$ is a *witness*. If it does, $n$ is "probably prime" for this base, and $a$ might be a *liar*.

Take $n = 221 = 13 \cdot 17$. $n - 1 = 220 = 2^2 \cdot 55$, so $d = 55$, $s = 2$.

| base $a$ | $a^{55} \bmod 221$ | squared once | verdict |
|---|---|---|---|
| 2 | 128 | 30 | neither 1 nor 220 appeared: **composite**, 2 is a witness |
| 174 | 47 | 220 | hit $n - 1$: "probably prime", 174 is a liar |
| 21 | 200 | 220 | also a liar |

For a composite $n$ at most a quarter of the bases lie, so $k$ random bases give an error rate of at most $4^{-k}$, and for $n < 3.3 \times 10^{24}$ (which covers every 64-bit integer) the twelve bases $2, 3, 5, \ldots, 37$ are known to be *deterministic*: no composite fools all of them ([Sorenson and Webster](https://arxiv.org/abs/1509.00864) found the smallest composite that does). Each base costs one modular exponentiation, $O(\log n)$ multiplications; testing a 64-bit number is microseconds, against the $4 \times 10^9$ divisions of trial division. For contrast, the prime 97 with base 2: $96 = 2^5 \cdot 3$, and the sequence $8, 64, 22, 96, 1$ passes through $96 = n - 1$ as it must.

## Fast exponentiation

Computing $x^n$ by multiplying $n$ times is $O(n)$, which is unacceptable when $n$ is $10^{18}$ and also silly when $n$ is 1000. Square-and-multiply does it in $O(\log n)$ multiplications: write $n$ in binary, $x^{13} = x^8 \cdot x^4 \cdot x^1$ because $13 = 1101_2$; squaring repeatedly gives $x, x^2, x^4, x^8$ in one multiplication each; multiply together the ones whose bit is set. The loop reads the exponent's bits from the low end by shifting it right, which is the halving the visualisation shows:

```viz
{"type": "bits", "algorithm": "shift", "a": 13, "title": "The exponent 13 = 1101, shifted right", "caption": "Each right shift drops the lowest bit, which is the bit the loop has just consumed; four shifts empty a four-bit exponent, so the loop runs log n times."}
```

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

Trace $3^{13}$ and, in the same table, $3^{13} \bmod 7$ (apply `% 7` after every multiplication):

| bit of $n$ (low to high) | `result` (plain) | `x` after squaring (plain) | `result` mod 7 | `x` mod 7 after squaring |
|---|---|---|---|---|
| 1 | 3 | 9 | 3 | 2 |
| 0 | 3 | 81 | 3 | 4 |
| 1 | 243 | 6,561 | $3 \cdot 4 = 12 \to 5$ | 2 |
| 1 | $243 \cdot 6561 = 1{,}594{,}323$ | | $5 \cdot 2 = 10 \to 3$ | |

$3^{13} = 1{,}594{,}323$, and $1{,}594{,}323 = 7 \cdot 227{,}760 + 3$, so the modular column's 3 is right. Four squarings, three multiplications. [Pow(x, n)](/practice/pow-x-n) is exactly this function; the parts interviewers watch for are the negative exponent, $n = 0$, and not overflowing when negating `INT_MIN` in a 32-bit language ($-(-2^{31})$ is $2^{31}$, which does not fit; negate into a wider type or handle the exponent as unsigned).

With `% m` after each multiplication this is **modular exponentiation**, the workhorse of RSA, Diffie–Hellman, Miller–Rabin and Fermat inverses. Measured: `pow(3, 10**18, 10**9 + 7)` returns 246,336,683 in 2.9 µs, sixty squarings and about thirty multiplications of numbers that never exceed $10^{18}$.

The same skeleton with matrix multiplication computes the $n$-th term of any linear recurrence in $O(\log n)$ matrix products. For Fibonacci, $M = \begin{pmatrix}1&1\\1&0\end{pmatrix}$ and $M^n = \begin{pmatrix}F_{n+1}&F_n\\F_n&F_{n-1}\end{pmatrix}$. Trace $n = 5 = 101_2$: $M^2 = \begin{pmatrix}2&1\\1&1\end{pmatrix}$, $M^4 = \begin{pmatrix}5&3\\3&2\end{pmatrix}$, and $M^5 = M^4 \cdot M = \begin{pmatrix}8&5\\5&3\end{pmatrix}$, whose top-right entry is $F_5 = 5$. Anything associative can be exponentiated this way (numbers, matrices, permutations, string transformations), which is why it is called *binary* exponentiation and not *numeric* exponentiation.

## The modular inverse: dividing without dividing

Under a modulus $m$, "$a / b$" means $a \cdot b^{-1}$, where $b^{-1}$ is the number with $b \cdot b^{-1} \equiv 1 \pmod m$. It exists exactly when $\gcd(b, m) = 1$. With $m = 7$, $3^{-1} = 5$ because $3 \cdot 5 = 15 \equiv 1$. With $m = 4$, $2$ has no inverse: $2k$ is always even, never $\equiv 1 \pmod 4$.

### Fermat's little theorem (prime modulus only)

If $p$ is prime and $p \nmid a$, then $a^{p-1} \equiv 1 \pmod p$; multiply both sides by $a^{-1}$ to get $a^{p-2} \equiv a^{-1}$. So the inverse is one modular exponentiation:

```python
def inverse_fermat(a: int, p: int) -> int:
    return pow(a, p - 2, p)     # Python's built-in three-argument pow

inverse_fermat(3, 7)   # 5
```

$O(\log p)$ multiplications. This is what everyone uses with $m = 10^9 + 7$, and it is *wrong* if $m$ is not prime, silently. Measured with $m = 10^6$: `pow(3, m - 2, m)` returns 888,889, and $3 \cdot 888{,}889 \bmod 10^6 = 666{,}667$, not 1; the real inverse is 666,667. `pow(7, m - 2, m)` returns 122,449 while the real inverse is 857,143. Nothing raises; the wrong number flows into whatever you were computing.

### Extended Euclid (any coprime pair)

From $ax + my = 1$ (Bézout, when $\gcd(a, m) = 1$), $ax \equiv 1 \pmod m$, so $x$ is the inverse:

```python
def mod_inverse(a: int, m: int) -> int:
    g, x, _ = extended_gcd(a % m, m)
    if g != 1:
        return -1                 # no inverse: a and m share a factor
    return x % m                  # Python's % makes it non-negative
```

The $(11, 3)$ table above is this computation for $a = 3$, $m = 11$: inverse 4. It works for any modulus, reports when no inverse exists instead of returning garbage, and its intermediate values never exceed the inputs, so it is safe in JavaScript numbers up to $2^{53}$, unlike Fermat, whose squarings of numbers near $10^9$ exceed $2^{53}$ and round (see the failure modes). Python 3.8+ exposes it directly as `pow(a, -1, m)`, which raises `ValueError` when the inverse does not exist.

| Method | Modulus | Cost | Reports "no inverse" | Safe in JS doubles | Use when |
|---|---|---|---|---|---|
| Fermat, `pow(a, p-2, p)` | prime only | $O(\log p)$ multiplications | no (returns garbage) | no ($a^2$ exceeds $2^{53}$ for $a > 9.5 \times 10^7$) | $p$ is a known prime and you are in Python or have 128-bit multiply |
| Extended Euclid | any, coprime | $O(\log m)$ divisions | yes | yes | library code, composite moduli, JavaScript |
| Batch (Montgomery's trick) | any | one inverse plus $3n$ multiplications for $n$ values | per value | as above | thousands of inverses at once, elliptic-curve code |
| Precomputed inverse factorials | prime | $O(N)$ once | n/a | as above | binomials for many queries |

**Batch inversion**, since it appears in every serious modular-arithmetic library: to invert $a_1, \ldots, a_n$, form prefix products $p_i = a_1 \cdots a_i$, invert only $p_n$, then unwind: $a_n^{-1} = p_{n-1} \cdot p_n^{-1}$ and $p_{n-1}^{-1} = a_n \cdot p_n^{-1}$, and so on down. One inverse (the expensive operation) plus about $3n$ multiplications.

### Where the inverse is used

- **Binomials modulo a prime**: $\binom{n}{k} \bmod p = n! \cdot (k!)^{-1} \cdot ((n-k)!)^{-1} \bmod p$. Precompute factorials and inverse factorials once, then every binomial is three multiplications.
- **Rolling hash removal**: to remove a prefix's contribution from a hash you multiply by $B^{-1}$ rather than dividing, which requires $B$ and $M$ coprime, one more reason $M$ is prime. The [modular arithmetic lesson](/learn/foundations/math-for-engineers/modular-arithmetic-and-hashing-math) has the hash.
- **Sharding and striding**: a stride $s$ coprime to $n$ visits every slot of a ring of size $n$; the inverse of $s$ tells you which step landed on a given slot.
- **RSA**: the private exponent is the inverse of the public exponent modulo $\lambda(n) = \text{lcm}(p-1, q-1)$ in the current standard ([RFC 8017](https://www.rfc-editor.org/rfc/rfc8017)), or $(p-1)(q-1)$ in the original scheme, computed with extended Euclid because neither modulus is prime.
- **Elliptic-curve arithmetic**, where a modular inverse is the most expensive step and batch inversion is standard.

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

Fast exponentiation gives one inverse; the downward loop turns it into all of them in $O(N)$ (it is batch inversion in disguise); the modulus being prime is what makes Fermat valid; and the whole thing is $O(N + Q)$ for $Q$ queries. Every piece of this lesson appears in eleven lines. The [combinatorics lesson](/learn/foundations/math-for-engineers/counting-and-combinatorics) is where the binomial itself comes from.

## Under the hood

**`pow(a, b, m)` in CPython** is left-to-right binary exponentiation on big integers, with a 5-bit sliding window for exponents above 60 bits: it precomputes the 16 odd powers $a^1, a^3, \ldots, a^{31}$ and consumes up to five exponent bits per step. The squarings stay (one per exponent bit); the other multiplications drop from about $e/2$ to about $16 + e/5$ for an $e$-bit exponent, per the source's own comment, which for 1024 bits is roughly 512 down to 221. Each step is a big-integer multiply followed by a big-integer modulo; for cryptographic sizes, libraries (OpenSSL, BoringSSL) instead use Montgomery multiplication, which replaces every division-by-$m$ with shifts and multiplies by precomputing one constant from $m$.

**`math.gcd`** in CPython uses plain Euclid when both values fit in two 30-bit digits and Lehmer's variant on larger ones, which simulates several Euclid steps at once on the leading digits before doing one expensive big-integer division. Binary GCD (Stein's algorithm: strip factors of two with shifts, subtract, repeat) is the other common choice in native libraries because it never divides.

**Why `%` is the expensive operation.** A 64-bit integer division or modulo costs roughly 10–40 cycles depending on the core (recent designs sit at the low end) against 3–4 for a multiply, so in a hashing or sieving loop `% m` dominates. Compilers remove it when $m$ is a compile-time constant: `x % 2**k` becomes `x & (2**k - 1)`, and `x % m` for other constant $m$ becomes a multiply by a precomputed reciprocal and a shift (the same trick as Barrett reduction). A modulus held in a variable gets the real `DIV`. That is one reason CPython's `dict`, Java's `HashMap` and Rust's `HashMap` size their tables as powers of two and index with a mask, while libstdc++'s `unordered_map` uses prime bucket counts and a real modulo. Prime sizes protect a weak hash (keys that share a factor with the size collide less); a power-of-two size is fine when the hash function already mixes its bits, which is what "make it prime" advice is really about.

**Miller–Rabin in the standard libraries.** Java's `BigInteger.isProbablePrime` runs Miller–Rabin rounds (and adds a Lucas–Lehmer test for numbers of 100 bits or more), and OpenSSL's primality check is Miller–Rabin, usually after trial division by small primes, which eliminates most composites cheaply; the deterministic base sets for 64-bit inputs are what fast primality checks in competitive programming and in hash-table sizing use.

## Failure modes in production

**The LCM that wrapped.** *Symptom:* a scheduler computing the hyperperiod of two jobs gets a negative or tiny number and fires them at the wrong times. *Diagnosis:* `a * b / gcd` with $a \cdot b$ above $2^{63}$; the product wrapped before the division. *Fix:* `a / gcd(a, b) * b`, and a test with inputs near $10^{10}$.

**Fermat on a composite modulus.** *Symptom:* modular "division" produces plausible-looking wrong answers; a checksum or a share reconstruction is off by a seemingly random amount. *Diagnosis:* `pow(a, m - 2, m)` with $m$ not prime returns garbage without raising; measured above with $m = 10^6$. *Fix:* extended Euclid (or `pow(a, -1, m)`), which also reports non-invertible inputs.

**Modular multiplication past $2^{53}$ in JavaScript.** *Symptom:* a rolling hash or a binomial modulo $10^9 + 7$ computed in Node disagrees with the Python reference on large inputs. *Diagnosis:* `(a * b) % MOD` with $a, b$ near $10^9$ forms a product near $10^{18}$, which a double rounds to the nearest multiple of 128; the residue is then wrong. Measured in Node 24: $999{,}999{,}937 \times 999{,}999{,}929 \bmod (10^9 + 7)$ is 5,467 in doubles and 5,460 exactly; the product $9.99 \times 10^{17}$ was rounded to a multiple of 128. ($10^9 \times 10^9$ happens to be exactly representable, which is why a test with round numbers can pass.) *Fix:* `BigInt`, or a `mulmod` that splits one operand into 16-bit halves so every intermediate stays below $2^{53}$, or `Math.imul`-based arithmetic modulo $2^{32}$ when that suffices.

**A sieve that exhausted memory.** *Symptom:* `MemoryError` at $n = 10^9$. *Diagnosis:* a `list` of Python booleans is 8 bytes of pointer per number, 8 GB; even the `bytearray` is 1 GB. *Fix:* a bit-packed sieve (125 MB), a segmented sieve (windows of $\sqrt{n} \approx 32{,}000$ numbers), or, if only a few numbers need testing, no sieve at all: Miller–Rabin per number.

**Trial division at 64-bit scale.** *Symptom:* a primality check that was instant on test data times out on real IDs. *Diagnosis:* $\sqrt{n}$ divisions is 31,623 at $10^9$ and $4.3 \times 10^9$ at $2^{64}$. *Fix:* trial division by primes below a few hundred, then deterministic Miller–Rabin with the twelve bases.

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

## Interviewer follow-ups

**"How would you test whether a 64-bit number is prime, fast?"** *Model answer:* trial-divide by the primes below a few hundred to discard most composites, then Miller–Rabin with the twelve fixed bases $2$ through $37$, which is deterministic for every 64-bit input; each base is one modular exponentiation, so the whole test is microseconds. *Common wrong answer:* trial division to $\sqrt{n}$ (billions of divisions) or a sieve to $n$ (impossible memory).

**"Your `pow(x, n)` handles negative $n$ by negating it. What input breaks it?"** *Model answer:* `INT_MIN` in a 32-bit language: $-(-2^{31})$ overflows back to $-2^{31}$, and the loop either runs forever or returns nonsense; widen the exponent to 64 bits, or treat it as unsigned, or handle $|n|$ via `-(n + 1)` plus one extra multiply. *Common wrong answer:* "use `abs`", which has the same overflow.

**"Why do hash tables use prime sizes, or do they?"** *Model answer:* a prime size makes keys that share a factor with the size spread out even under a weak hash; with a good mixing hash a power-of-two size is equally good and indexing by mask is far cheaper than a real modulo, which is what CPython, Java and Rust do; libstdc++ uses primes and pays for the division. *Common wrong answer:* "primes are always better", stated as a law.

**"How many steps can Euclid's algorithm take on 64-bit inputs?"** *Model answer:* at most about $1.44 \log_2 b + 1 \approx 93$, approached by consecutive Fibonacci numbers ($\gcd(F_{91}, F_{90})$ measured at 89); typical inputs take far fewer because quotients are usually larger than 1. *Common wrong answer:* "about 64" (a halving per step, which is the two-step bound divided by the wrong constant) or "it depends on the size of the numbers, so thousands".

**"Rotate an array of 12 elements by 8 in place with cycle-following. How many cycles?"** *Model answer:* $\gcd(12, 8) = 4$ cycles of length $12 / 4 = 3$, so the outer loop runs 4 times and each element moves exactly once; the alternative three-reversal method needs no GCD and is usually simpler. *Common wrong answer:* "one cycle", which is only true when $\gcd(n, k) = 1$.

## What mid-level engineers get wrong

- **Computing `a * b / gcd` in that order.** Wraps for inputs near $10^{10}$ in 64 bits even when the LCM fits.
- **Using Fermat's inverse with a modulus that might not be prime.** Returns garbage silently; extended Euclid or `pow(a, -1, m)` reports the problem.
- **Multiplying residues near $10^9$ in JavaScript numbers.** The product exceeds $2^{53}$ and the residue is wrong; `BigInt` or a splitting `mulmod`.
- **Sieving with a list of Python booleans.** 8 bytes per number; a `bytearray` is 8× smaller and a bitset 64×.
- **Testing primality by trial division on large inputs.** Fine to $10^{12}$, hopeless at $2^{64}$; Miller–Rabin with fixed bases is the tool.
- **Negating `INT_MIN` in `pow`.** The one input the negative-exponent branch cannot handle in 32-bit code.
- **Writing the subtraction version of Euclid.** $\gcd(10^{18}, 1)$ takes $10^{18}$ steps.

## Senior signals

- You can say why Euclid is $O(\log \min(a, b))$ (the argument halves every two steps), that consecutive Fibonacci numbers are the worst case, and roughly how many steps 64-bit inputs need.
- You compute `a // gcd * b` for the LCM and can explain which order overflows and at what magnitude.
- You can run the extended algorithm forward and backward by hand, keep the three-pair table's invariant in your head, and read the inverse off the last row.
- You quote the sieve's cost as $O(n \log \log n)$, know that memory rather than time is its limit, and choose between `bytearray`, bit-packed and segmented representations by $n$.
- You know how Miller–Rabin works, can trace a round, and know that twelve fixed bases make it deterministic for 64-bit inputs.
- You reach for binary exponentiation for anything associative (numbers, residues, matrices, permutations) and handle $n = 0$, negative $n$ and `INT_MIN` without being prompted.
- You know that Fermat's inverse needs a prime modulus and returns garbage otherwise, that extended Euclid works for any coprime pair and reports when no inverse exists, that JavaScript needs the latter for large moduli, and you choose deliberately.
- You solve "binomials mod a prime for a million queries" with precomputed factorials and inverse factorials in $O(N + Q)$, and you can explain every line, including why the downward loop is batch inversion.

## Check yourself

```quiz
- q: >-
    Why is Euclid's algorithm with the modulo operation O(log min(a, b)) steps, while the subtraction-based version is not?
  options: ["Modulo is one CPU instruction, so each step is cheaper", "Every two modulo steps at least halve the larger number", "Both are logarithmic; subtraction is only slower per step", "The modulo version is iterative, so it avoids recursion"]
  answer: 1
  explanation: >-
    Whether b is above or below a/2, a mod b is below a/2, so the pair halves every two steps: logarithmic. Subtraction may shrink the larger number by only 1 per step, so gcd(10^18, 1) by repeated subtraction takes 10^18 steps. The instruction cost of modulo is irrelevant to the step count.
- q: >-
    You compute lcm(a, b) as `a * b / gcd(a, b)` in a 64-bit language with a = 6 × 10^9 and b = 4 × 10^9. What happens?
  options: ["The division truncates, since gcd need not divide a * b", "a * b overflows 64 bits before the division happens", "It is correct; the result is 1.2 × 10^10 and fits", "gcd(a, b) overflows while reducing the large inputs"]
  answer: 1
  explanation: >-
    a * b is 2.4 × 10^19, above 2^64 ≈ 1.8 × 10^19, so the product wraps before the division, giving a wrong answer even though the true LCM, 1.2 × 10^10, fits easily. Dividing first (a / gcd * b) keeps every intermediate value at or below the final answer. The gcd divides a exactly, so no truncation occurs.
- q: >-
    A colleague computes the modular inverse as `pow(a, m - 2, m)` for a modulus m = 1,000,000 (not prime). What is the outcome?
  options: ["Correct for odd a, since only even a shares a factor", "Wrong in general: the Fermat shortcut needs a prime m", "Correct, since Fermat's theorem holds for any modulus", "A runtime error, since Python rejects composite moduli"]
  answer: 1
  explanation: >-
    a^(m-2) is the inverse only when a^(m-1) ≡ 1, which Fermat guarantees for prime m. Measured: pow(3, m - 2, m) returns 888,889, and 3 × 888,889 mod m is 666,667, not 1, even though 3 and m are coprime and the true inverse (666,667) exists. Extended Euclid handles both cases and reports when no inverse exists.
- q: >-
    Computing x^n by repeated squaring for n = 10^18 takes about how many multiplications?
  options: ["About 10^18, one multiplication for each unit of n", "About 18, one per decimal digit of the exponent", "About 10^9, the square root of the exponent", "About 60 squarings plus up to 60 multiplications"]
  answer: 3
  explanation: >-
    10^18 is a little under 2^60, so its binary representation has 60 bits: one squaring per bit and one extra multiplication per set bit. Around 90 multiplications total in the measured case (2.9 µs in CPython with a modulus). 18 confuses the decimal digit count with the binary length.
- q: >-
    The sieve of Eratosthenes up to n starts marking multiples of prime p at p^2 rather than at 2p. Why is that safe?
  options: ["Every kp with k < p was marked by a smaller prime", "Because even numbers are skipped by the sieve anyway", "It is not safe; it misses composites such as 2p and 3p", "Because the outer loop only runs up to sqrt(n)"]
  answer: 0
  explanation: >-
    A multiple kp with k < p has a prime factor of k that is smaller than p, so it was crossed out when that smaller prime was processed. Starting at p^2 skips redundant work. Skipping evens only covers 2p, not 3p or 5p; the sqrt(n) bound on the outer loop is a separate consequence of the same fact.
- q: >-
    A Miller–Rabin round on n = 221 with base 2 produces the sequence 128, 30 (for n - 1 = 2^2 × 55); with base 174 it produces 47, 220. What do the two rounds tell you?
  options: ["The rounds conflict, so Miller–Rabin cannot decide 221", "Both rounds prove 221 prime, since neither sequence starts at 1", "Base 2 proves 221 composite; base 174 is a liar that says probably prime", "Base 2 says probably prime; base 174 proves 221 composite"]
  answer: 2
  explanation: >-
    A prime must produce a sequence that starts at 1 or passes through n - 1 = 220. Base 2 gives 128 then 30, neither, so 221 is composite for certain and 2 is a witness. Base 174 reaches 220, which is consistent with primality, so that base is a liar (221 = 13 × 17). One witness settles compositeness; liars are why several bases are needed, and at most a quarter of bases lie for any composite.
```
