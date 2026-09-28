---
slug: modular-arithmetic-and-hashing-math
title: "Modular arithmetic and the math behind hashing"
description: What mod really does (including to negative numbers in each language), how to compute without overflow, how polynomial and rolling hashes work, and why primes keep showing up in table sizes and multipliers.
minutes: 60
difficulty: medium
tags: [math, modular-arithmetic, hashing, overflow, rolling-hash]
problems: [pow-x-n, reverse-integer, happy-number]
---
Every hash table does one piece of arithmetic on every operation: `index = hash(key) % buckets`. Every rolling-hash string search, every sharding function, every "compute the answer modulo 10⁹+7" problem, and every fixed-width integer in your program does the same thing. Modular arithmetic is the arithmetic of remainders, and it is the arithmetic your CPU natively performs whether you asked for it or not: a `u32` that overflows is doing arithmetic mod $2^{32}$.

Most engineers know `%` returns a remainder. Fewer know that `-7 % 3` is `2` in Python and `-1` in JavaScript, Java, C, Go and Rust, that you cannot divide under a modulus without an inverse, that two 32-bit numbers multiplied need 64 bits, or why a hash table with a power-of-two size has to do extra mixing. Those four facts are the difference between hashing code that works and hashing code that works until it doesn't.

## What mod actually is

$a \bmod m$ is the remainder when $a$ is divided by $m$: the unique $r$ with $0 \le r < m$ such that $a = qm + r$ for some integer $q$. So $17 \bmod 5 = 2$ because $17 = 3 \cdot 5 + 2$, and $-7 \bmod 3 = 2$ because $-7 = (-3) \cdot 3 + 2$.

That last line is the one languages disagree on. The mathematical convention (floored or Euclidean division) always gives a non-negative remainder. Most languages instead truncate the quotient toward zero, which makes the remainder take the sign of the dividend:

| Expression | Python | JavaScript | Java / C / Go / Rust |
|---|---|---|---|
| `7 % 3` | 1 | 1 | 1 |
| `-7 % 3` | **2** | **-1** | **-1** |
| `7 % -3` | -2 | 1 | 1 |

The bug this causes is a negative array index. If `hash(key)` can be negative (Java's `hashCode()` is a signed `int`; a subtraction in your own hash can go negative), then `hash % buckets` can be negative, and `table[-1]` is an exception or, in C, memory corruption. The portable fix is the double-mod idiom:

```javascript
function mod(a, m) {
  return ((a % m) + m) % m;   // always in [0, m), for any sign of a
}
mod(-7, 3);   // 2
```

Rust has `rem_euclid`, Java has `Math.floorMod`, and Python's `%` already floors. Masking with a power-of-two size (`hash & (m - 1)`) is sign-safe because it keeps only low bits.

## The rules, derived

Write $a = q_a m + r_a$ and $b = q_b m + r_b$ with $0 \le r_a, r_b < m$. Then

$$a + b = (q_a + q_b)\,m + (r_a + r_b)$$

so $a + b$ and $r_a + r_b$ differ by a multiple of $m$ and have the same remainder. For the product,

$$ab = (q_a q_b m + q_a r_b + q_b r_a)\,m + r_a r_b$$

and again everything but $r_a r_b$ is a multiple of $m$. That is the whole proof of the two rules that make modular computation possible:

$$(a + b) \bmod m = \big((a \bmod m) + (b \bmod m)\big) \bmod m, \qquad (ab) \bmod m = \big((a \bmod m)(b \bmod m)\big) \bmod m$$

You never need the true value of a giant expression: reduce after every operation and the intermediates stay below $m^2$. Check with $m = 7$: $(12 \cdot 13) \bmod 7 = 156 \bmod 7 = 2$, and $(12 \bmod 7)(13 \bmod 7) = 5 \cdot 6 = 30 \equiv 2$. Subtraction is the same derivation with $r_a - r_b$, which can be negative, so in truncating languages compute `(a % m - b % m + m) % m`.

**Division does not distribute.** $(12 / 4) \bmod 7 = 3$, but $(12 \bmod 7) / (4 \bmod 7) = 5/4$ is not an integer. Under a modulus, "divide by $b$" means "multiply by the $b^{-1}$ with $b \cdot b^{-1} \equiv 1 \pmod m$", which exists only when $\gcd(b, m) = 1$. The Fermat section below derives it for a prime modulus; the [number theory lesson](/learn/foundations/math-for-engineers/number-theory-essentials) handles the general case with extended Euclid.

## Overflow-safe arithmetic

Fixed-width integers *are* modular arithmetic. A `u32` holds $0$ to $2^{32} - 1$ and `u32::MAX + 1` wraps to 0: the hardware computes mod $2^{32}$. In C that wrap is defined for unsigned types and undefined for signed ones; in Rust debug builds it panics; in Go, Java and release-mode Rust it silently wraps; in Python it never happens; in JavaScript there are no integers, only `float64`, so precision degrades past $2^{53}$ rather than wrapping.

Multiplying an $a$-bit number by a $b$-bit number needs up to $a + b$ bits:

| Operands | Product needs | Fits in |
|---|---|---|
| Two values $< 2^{16}$ | $< 2^{32}$ | `u32` |
| Two values $< 2^{32}$ | $< 2^{64}$ | `u64` |
| Two values $< 2^{26.5}$ (≈ 9.5 × 10⁷) | $< 2^{53}$ | JS `Number` exactly |
| Two values $< 10^9 + 7$ | $\approx 10^{18} < 2^{63}$ | `i64`, **not** JS `Number` |

The last row is the practical one. $10^9 + 7$ is prime, and the product of two reduced values, at most $(10^9 + 6)^2 \approx 1.0 \times 10^{18}$, fits a signed 64-bit integer. It does *not* fit a JavaScript `Number`, which loses integer precision above $9 \times 10^{15}$. A solution that "works in Python, fails in JS" is this row.

### mulmod: multiplying when the product does not fit

When the modulus itself is close to the word size (a 61-bit Mersenne prime, or 64-bit Miller–Rabin), even one product overflows. The fix is the same square-and-multiply idea applied to addition: build $a \cdot b$ from the bits of $b$ by doubling $a$ and adding, reducing after every step, so no intermediate exceeds $2m$. Trace $6 \cdot 13 \bmod 17$ with $13 = 1101_2$:

| Remaining bits of $b$ | Low bit | result before | $a$ before | result after | $a$ after ($2a \bmod 17$) |
|---|---|---|---|---|---|
| 1101 | 1 | 0 | 6 | $(0 + 6) \bmod 17 = 6$ | 12 |
| 110 | 0 | 6 | 12 | 6 | $24 \bmod 17 = 7$ |
| 11 | 1 | 6 | 7 | $13$ | 14 |
| 1 | 1 | 13 | 14 | $27 \bmod 17 = 10$ | $28 \bmod 17 = 11$ |

Result 10, and $6 \cdot 13 = 78 = 4 \cdot 17 + 10$. Every value stayed below $2 \cdot 17$, so the method needs one bit more than the modulus: safe in a `u64` for any $m < 2^{63}$, in a JavaScript `Number` for $m < 2^{52}$. Cost: $O(\log b)$ additions instead of one multiply, which is why production code prefers a 128-bit product (`__int128` in C, `u128` in Rust) when the compiler offers one, and `BigInt` in JavaScript.

```python
def mul_mod(a: int, b: int, m: int) -> int:
    """a * b mod m using only values below 2m (Python does not need this; C, Rust and JS do)."""
    result, a = 0, a % m
    while b:
        if b & 1:
            result = (result + a) % m
        a = (a * 2) % m
        b >>= 1
    return result
```

## Modular exponentiation, bit by bit

To compute $3^{13} \bmod 1000$ you never form $3^{13} = 1{,}594{,}323$. Write $13 = 1101_2$; square the base repeatedly to get $3, 3^2, 3^4, 3^8$ and multiply in the ones whose bit is set:

| Remaining bits of exp | Low bit | result before | base before | result after | base after (base² mod 1000) |
|---|---|---|---|---|---|
| 1101 | 1 | 1 | 3 | 3 | 9 |
| 110 | 0 | 3 | 9 | 3 | 81 |
| 11 | 1 | 3 | 81 | 243 | $6561 \bmod 1000 = 561$ |
| 1 | 1 | 243 | 561 | $136{,}323 \bmod 1000 = 323$ | 721 |

$3^{13} = 1{,}594{,}323$ ends in 323. Four squarings, three multiplications, every value below $1000^2$.

```python
def mod_pow(base: int, exp: int, m: int) -> int:
    result = 1 % m          # handles m == 1
    base %= m
    while exp > 0:
        if exp & 1:                     # this bit of exp is set
            result = result * base % m
        base = base * base % m          # base^1, base^2, base^4, ...
        exp >>= 1                       # exp halves: O(log exp) iterations
    return result
```

## Polynomial hashing, traced

A hash table needs an integer from a key. For a string $s = s_0 s_1 \dots s_{n-1}$ the standard construction treats the characters as digits of a number in base $B$ and reduces modulo $M$:

$$h(s) = \big(s_0 B^{n-1} + s_1 B^{n-2} + \cdots + s_{n-1}\big) \bmod M$$

Horner's rule computes it left to right with one multiply-add per character: `h = (h * B + code) % M`. Trace `"hashing"` with $B = 31$, $M = 10^9 + 7$:

| Char (code) | $h_{\text{before}} \cdot 31 + \text{code}$ | Reduced? | $h_{\text{after}}$ |
|---|---|---|---|
| h (104) | $0 \cdot 31 + 104 = 104$ | no | 104 |
| a (97) | $104 \cdot 31 + 97 = 3{,}321$ | no | 3,321 |
| s (115) | $3{,}321 \cdot 31 + 115 = 103{,}066$ | no | 103,066 |
| h (104) | $103{,}066 \cdot 31 + 104 = 3{,}195{,}150$ | no | 3,195,150 |
| i (105) | $3{,}195{,}150 \cdot 31 + 105 = 99{,}049{,}755$ | no | 99,049,755 |
| n (110) | $99{,}049{,}755 \cdot 31 + 110 = 3{,}070{,}542{,}515$ | yes, $- 3M$ | 70,542,494 |
| g (103) | $70{,}542{,}494 \cdot 31 + 103 = 2{,}186{,}817{,}417$ | yes, $- 2M$ | 186,817,403 |

The largest unreduced value is $3.07 \times 10^9$: it needs 32 bits, and with $M$ near $10^9$ the multiply never exceeds $31 \cdot 10^9 \approx 2^{35}$, so `i64` is comfortable and a JavaScript `Number` is exact. Row 4 is also $h(\text{"hash"})$, a fact the rolling hash uses next.

Why base and modulus matter: $B$ should exceed the alphabet size so that distinct short strings are distinct numbers before reduction ($B = 31$ is what Java's `String.hashCode` uses, with $M = 2^{32}$ by overflow). $M$ should be large (two random strings collide with probability about $1/M$) and, for the rolling trick, prime. Both should be unpredictable to an attacker if the input is untrusted: with fixed $B$ and $M$ anyone can construct thousands of colliding strings and turn your $O(1)$ map into an $O(n)$ list. The [hash functions lesson](/learn/data-structures/hashing/hash-functions) covers keyed hashes.

```viz
{"type": "hash-table", "algorithm": "chaining", "buckets": 7,
 "operations": [["set","apple",1],["set","banana",2],["set","cherry",3],["set","date",4],["set","elder",5],["get","cherry"],["delete","banana"],["get","banana"]],
 "title": "hash(key) mod 7", "caption": "The modulus turns an arbitrary integer into one of seven bucket indices. Two keys with the same remainder land in the same chain."}
```

## Rolling hashes: Rabin–Karp traced

Comparing a pattern of length $m$ against every window of a text of length $n$ by re-hashing costs $O(nm)$. The polynomial form lets you *slide*: given the hash of `text[i..i+m]`, the next window is

$$h_{i+1} = \big(h_i - s_i B^{m-1}\big) \cdot B + s_{i+m} \pmod M$$

Drop the outgoing character's contribution, shift everything up one place, add the incoming one. Trace it on `"hashing"` with $m = 4$, $B = 31$, $M = 10^9 + 7$, so $B^{m-1} = 31^3 = 29{,}791$ and $h(\text{"hash"}) = 3{,}195{,}150$ from the table above:

| Window | Out (code) | In (code) | $h - \text{out} \cdot 29{,}791$ | $\times 31$ | $+ \text{in}$, mod $M$ | Direct hash |
|---|---|---|---|---|---|---|
| hash → ashi | h (104) | i (105) | $3{,}195{,}150 - 3{,}098{,}264 = 96{,}886$ | 3,003,466 | 3,003,571 | 3,003,571 |
| ashi → shin | a (97) | n (110) | $3{,}003{,}571 - 2{,}889{,}727 = 113{,}844$ | 3,529,164 | 3,529,274 | 3,529,274 |
| shin → hing | s (115) | g (103) | $3{,}529{,}274 - 3{,}425{,}965 = 103{,}309$ | 3,202,579 | 3,202,682 | 3,202,682 |

Three operations per window regardless of $m$, and each rolled value equals the hash computed from scratch.

```viz
{"type": "string", "algorithm": "rabin-karp", "text": "abracadabra", "pattern": "abra", "title": "Rolling the window", "caption": "Each step subtracts the outgoing character times B^(m-1), multiplies by B, and adds the incoming character. Only windows whose hash matches are compared character by character."}
```

Two details separate a working implementation from a broken one:

1. **The subtraction goes negative.** Here the windows are short, so $h$ was never reduced and the subtraction stayed positive. With longer windows $h_i$ is a reduced value: if $h_i = 5$ and the outgoing term is $104 \cdot 29{,}791 = 3{,}098{,}264$, the difference is $-3{,}098{,}259$; Python's `%` gives $996{,}901{,}748$, but JavaScript, Java and C give $-3{,}098{,}259$ and the next multiply compounds it. Reduce the outgoing term, add $M$, then reduce.
2. **A hash match is not a string match.** Two windows share a hash with probability about $1/M$. Rabin–Karp verifies each hit character by character; skipping that makes a Monte Carlo algorithm wrong with probability roughly $n/M$, one search in a thousand at $M \approx 10^9$ and $n = 10^6$.

Why must $M$ be prime here? If $M$ shares a factor with $B$, then $B^k \equiv 0 \pmod M$ for some $k$ and every character more than $k$ positions from the end stops contributing. With $B = 256$ and $M = 2^{32}$, $B^4 \equiv 0$, so the hash depends only on the last four characters. A prime $M$ shares no factor with any $B < M$.

## Why primes keep appearing

There are three places primes show up in hashing, with three separate reasons.

### Prime table sizes against structured keys

Take eight keys allocated in steps of 4 (aligned addresses, IDs handed out four at a time): 1000, 1004, 1008, …, 1028.

| Table size | Buckets hit by the eight keys | Distinct |
|---|---|---|
| 8 | 0, 4, 0, 4, 0, 4, 0, 4 | 2 |
| 16 | 8, 12, 0, 4, 8, 12, 0, 4 | 4 |
| 7 | 6, 3, 0, 4, 1, 5, 2, 6 | 7 |
| 11 | 10, 3, 7, 0, 4, 8, 1, 5 | 8 |

With size 8 the table is effectively size 2: chains four times longer than the load factor predicts. The mechanism is that $\gcd(4, 8) = 4$, so the sequence $1000 + 4k \bmod 8$ cycles through only $8/4 = 2$ residues. A prime $m$ has $\gcd(d, m) = 1$ for every step $d < m$, so the arithmetic sequence visits all $m$ buckets before repeating. This is why libstdc++'s `std::unordered_map` and the old Java `Hashtable` size their bucket arrays with primes.

### Power-of-two sizes need mixing

`hash & (2^k - 1)` costs one cycle where `hash % prime` is a division, tens of cycles on older cores and around 10–20 on recent ones (microarchitecture dependent). So CPython's `dict`, Java's `HashMap`, Rust's `HashMap` and Go's map use powers of two and *mix* first so that the low bits depend on all the bits.

Java `HashMap` spreads with `h ^ (h >>> 16)` before masking. Watch it rescue keys whose low 16 bits are all zero (the pattern `Float.hashCode` and some object hashes produce):

| `hashCode()` | `h >>> 16` | `h ^ (h >>> 16)` | Bucket of 16, unmixed | Bucket of 16, mixed |
|---|---|---|---|---|
| `0x00010000` | `0x0001` | `0x00010001` | 0 | 1 |
| `0x00020000` | `0x0002` | `0x00020002` | 0 | 2 |
| `0x00030000` | `0x0003` | `0x00030003` | 0 | 3 |

CPython's `dict` mixes during probing instead. The first slot is `hash & mask`; each collision then sets `perturb >>= 5` and `i = (5*i + perturb + 1) & mask`, feeding five more bits of the hash into every step. For hash 1234 in an 8-slot table (mask 7): $1234 \,\&\, 7 = 2$; perturb becomes $1234 \gg 5 = 38$, $i = (10 + 38 + 1) \,\&\, 7 = 1$; perturb 1, $i = (5 + 1 + 1) \,\&\, 7 = 7$; perturb 0, $i = 36 \,\&\, 7 = 4$; then perturb stays 0 and $i \to 5i + 1 \bmod 8$ visits 5, 2, 3, 0, every remaining slot, because that recurrence has full period modulo a power of two. Sequence: 2, 1, 7, 4, 5, 2, 3, 0. A power-of-two size plus good mixing beats a prime size plus a bad hash; a power-of-two size plus a bad hash is a disaster.

### Prime multipliers and prime moduli

`h = h * 31 + c` uses 31 because it is odd (an odd multiplier is a bijection modulo $2^{32}$; an even one discards the top bit each step) and near a power of two (`31 * h` compiles to `(h << 5) - h`). Primeness matters less than oddness here. For polynomial hashing, a prime $M$ keeps $B^k$ non-zero and makes $\mathbb{Z}_M$ a field, so two random strings of length $n$ collide with probability at most $n/M$ (Schwartz–Zippel). Common choices: $10^9 + 7$, $10^9 + 9$, and $2^{61} - 1$, a Mersenne prime whose reduction is shifts and adds.

## How likely is a collision?

Hash width sets the collision floor through the birthday bound, $P \approx 1 - e^{-n^2 / 2N}$, which the [probability lesson](/learn/foundations/math-for-engineers/probability-for-engineers) derives:

| Items hashed | 32-bit hash ($N = 2^{32}$) | 64-bit hash ($N = 2^{64}$) |
|---|---|---|
| 10,000 | 1.2% | $2.7 \times 10^{-12}$ |
| 100,000 | 69% | $2.7 \times 10^{-10}$ |
| 1,000,000 | certain | $2.7 \times 10^{-8}$ |
| 10⁹ | certain | 2.7% |
| 5 × 10⁹ | certain | 49% |

A 32-bit hash used as a *key* (deduplication, content addressing) breaks by 100,000 items; a 64-bit one is safe into the hundreds of millions; a 128-bit one never collides by accident. A 32-bit hash used as a *bucket selector* is fine, because collisions there are expected and handled.

## Dividing under a modulus: Fermat and Euler

**Fermat's little theorem.** If $p$ is prime and $p \nmid a$, then $a^{p-1} \equiv 1 \pmod p$. Derivation: the map $x \mapsto ax$ on $\{1, \ldots, p-1\}$ is injective (if $ax \equiv ay$ then $p \mid a(x - y)$, and since $p \nmid a$, $x \equiv y$), so it permutes the set. Multiply everything together: $\prod x \equiv \prod ax = a^{p-1} \prod x$, and $\prod x = (p-1)!$ is coprime to $p$, so cancel it: $a^{p-1} \equiv 1$. Multiply both sides by $a^{-1}$ and the inverse appears: $a^{-1} \equiv a^{p-2}$.

Trace $3^{-1} \bmod 7 = 3^5 \bmod 7$ with square-and-multiply: squares $3, 3^2 = 9 \equiv 2, 3^4 \equiv 4$; $5 = 101_2$, so $3^5 = 3^4 \cdot 3^1 \equiv 4 \cdot 3 = 12 \equiv 5$. Check: $3 \cdot 5 = 15 \equiv 1 \pmod 7$.

**Euler's generalisation.** For any $m$ and $\gcd(a, m) = 1$, the same permutation argument on the $\varphi(m)$ residues coprime to $m$ gives $a^{\varphi(m)} \equiv 1$, so $a^{-1} \equiv a^{\varphi(m) - 1}$. For $m = 10$, $\varphi(10) = 4$ (the units are 1, 3, 7, 9), so $3^{-1} \equiv 3^3 = 27 \equiv 7$; check $3 \cdot 7 = 21 \equiv 1$. Euler needs $\varphi(m)$, which needs the factorisation of $m$, so for a non-prime modulus you want extended Euclid instead. Applications: $\binom{n}{k} \bmod p$ via inverse factorials, and removing a rolling hash's leading character by multiplying by $B^{-1}$.

## Under the hood

**CPython's `pow(a, b, m)`.** `long_pow` in `Objects/longobject.c` reduces the base first, then runs left-to-right binary exponentiation for small exponents and a fixed 5-bit window (a 32-entry table of $a^0 \ldots a^{31}$) for exponents beyond a few hundred bits, cutting multiplications by roughly a fifth. Since Python 3.8 a negative exponent with a modulus is allowed: `pow(a, -1, m)` computes the inverse with extended Euclid and raises `ValueError` when none exists. Python's `%` on ints is floored: `l_divmod` computes the truncated result and then adjusts the remainder by adding the divisor when the signs differ.

**How tables use the modulus.** CPython's `dict` keeps `mask = size - 1` and the perturbation loop above; sizes are powers of two starting at 8, resized when two-thirds full. Java's `HashMap` masks the spread hash and, since Java 8, converts a bin with 8 or more entries into a red-black tree once the table has 64 buckets, so a flood of colliding keys degrades to $O(\log n)$ rather than $O(n)$. Rust's `hashbrown` splits the 64-bit hash into a 7-bit tag stored in a control byte and low bits that select the group, so a probe compares 16 tags with one SIMD instruction; Go's classic map (before its Swiss-table rewrite) stores the top 8 bits as a `tophash` and uses the low bits for the bucket. libstdc++'s `unordered_map` keeps a table of primes and jumps to the next one on rehash.

**Keyed string hashes.** CPython has randomised `str` hashing by default since 3.3, using SipHash-2-4 from 3.4 (PEP 456) and SipHash-1-3 from 3.11; Rust's `HashMap` defaults to SipHash-1-3 with per-map random keys. Both exist so that an attacker who knows $B$ and $M$ cannot precompute colliding keys.

## Failure modes in production

**Hash flooding.** *Symptom:* one CPU core pinned by a single request whose body is a few hundred kilobytes of form fields or JSON keys. *Diagnosis:* the keys were crafted to share a hash under a deterministic string hash (fixed base and modulus, or an unkeyed hash), so every insert walks a chain of all previous keys: $n$ inserts cost $n^2/2$ comparisons, and $10^5$ keys is $5 \times 10^9$ steps. *Fix:* a keyed hash (SipHash) with a per-process random key, a cap on the number of parsed fields, and tree-bins as a backstop.

**Modulo bias in random sampling.** *Symptom:* an A/B split by `rand32() % n` over-assigns the low buckets; a random shard picker favours shards 0 to $k$. *Diagnosis:* $2^{32}$ is not divisible by $n$, so the first $2^{32} \bmod n$ residues get one extra chance in $\lfloor 2^{32}/n \rfloor$. For $n = 1000$ that is a relative bias of $2.3 \times 10^{-7}$, invisible; for $n = 10^9$ it is 25%; for $n = 3 \times 10^9$ the low residues are twice as likely. *Fix:* rejection sampling, which Python's `randrange` and Java's `nextInt(bound)` already do; never `rand() % n` in C for large $n$.

**Overflow in a modular product.** *Symptom:* a rolling hash or Miller–Rabin test agrees with the Python reference on small inputs and disagrees on large ones. *Diagnosis:* two reduced operands near $10^9$ multiply to $10^{18}$, past $2^{53}$ in JavaScript; two near $2^{61}$ multiply past $2^{64}$ in Rust or Go. *Fix:* `BigInt`, a 128-bit product, or `mul_mod` by doubling.

**Biased shards from a structured key.** *Symptom:* two of sixteen shards carry all the traffic. *Diagnosis:* `shard = user_id % 16` where IDs are allocated in steps of 8 by a sequence with a cache increment, so only residues 0 and 8 occur; the same failure as the size-8 table above. *Fix:* hash the key before reducing, use a prime shard count, or move to [consistent hashing](/learn/data-structures/hashing/hashing-at-scale), which also fixes the 8-to-9 shard reassignment problem.

**Negative index from a signed hash.** *Symptom:* `ArrayIndexOutOfBoundsException: -3` once a week in Java, or a segfault in C. *Diagnosis:* a signed hash and a truncating `%`. *Fix:* `floorMod`, the double-mod idiom, or a mask.

## Trade-offs

| Reduction | Cost per lookup | Structured keys (step $d$) | Needs a mixing step? | Resize |
|---|---|---|---|---|
| `h % prime` | one division (10–40 cycles) | all buckets used for any $d < m$ | no | jump to the next prime in a table |
| `h & (2^k - 1)` | one AND (1 cycle) | multiples of $2^j$ use only $2^{k-j}$ buckets | yes | double and rehash, or split buckets |
| Fibonacci hashing: `(h * 11400714819323198485) >> (64 - k)` | one multiply and shift | good | built in | double |
| `h mod (2^61 - 1)` for polynomial hashes | shifts and adds | not a table | no | not applicable |

## Interviewer follow-ups

**"Why do competitive programmers reduce modulo 10⁹ + 7 specifically?"** *Model answer:* it is prime, so every non-zero value has an inverse and division works; it is below $2^{30}$, so a product of two reduced values is below $2^{60}$ and fits an `i64` without a 128-bit multiply; and its sum with itself fits an `i32`. *Common wrong answer:* "because it is big", which would also be true of $10^9 + 8$, an even number under which half the values have no inverse.

**"Your rolling hash passes in Python and fails in JavaScript on long inputs. Why, and what do you change?"** *Model answer:* the multiply of two values near $10^9$ exceeds $2^{53}$ and is rounded before the `%`; and the subtraction step can go negative, which JS's `%` keeps negative. Fix by reducing the outgoing term, adding $M$ before the multiply, and either using `BigInt` or a modulus below $2^{26}$ so products stay exact. *Common wrong answer:* "JS integers are 32-bit", which is true of the bitwise operators, not of arithmetic.

**"We shard by `user_id % 16`. What could go wrong?"** *Model answer:* if IDs have structure (even-only, allocated in blocks of 8, timestamp-based), $\gcd(\text{step}, 16) > 1$ collapses the shards; and going from 16 to 17 shards moves 16/17 of the keys. Hash first, and use consistent hashing or fixed virtual partitions for growth. *Common wrong answer:* "use a prime like 17", which fixes the structure problem and leaves the resharding problem.

**"How would you defend a hash map against adversarial keys?"** *Model answer:* a keyed hash with a random per-process seed so collisions cannot be precomputed; bounds on the number of keys parsed from untrusted input; tree bins or a probing scheme with bounded chain length as a backstop; and a check that the hash is not being truncated to its low bits before masking. *Common wrong answer:* "use a bigger table", which does not change the chain length of colliding keys at all.

## What mid-level engineers get wrong

- **`hash % n` on a signed hash.** Works until a negative hash appears, then indexes `-3`.
- **Multiplying two values near $10^9$ in JavaScript.** Silent precision loss above $2^{53}$; the tests pass on small inputs.
- **Reducing only at the end.** The intermediate overflows long before the final `%`, and the wrapped value is unrelated to the right answer.
- **Sharding on a structured key with a power-of-two count.** Half the shards sit idle while two melt.
- **Skipping Rabin–Karp's verification.** One search in a thousand returns a wrong index at $M \approx 10^9$ and $n = 10^6$.
- **Using Fermat's inverse with a composite modulus.** The exponent $m - 2$ has no meaning without primality; the result is a random-looking wrong number.

## Exercises

```exercise
id: mod-pow
title: Modular exponentiation
prompt: |
  Return `base ** exp % mod` for integers `base >= 0`, `exp >= 0`, `mod >= 1`,
  without ever forming `base ** exp`. Square-and-multiply gives O(log exp)
  multiplications. Reduce after every multiplication so intermediate values
  stay below `mod * mod`. All test moduli are below 2^16, so plain JavaScript
  numbers are exact.
languages: [python, javascript]
entry: mod_pow
starter:
  python: |
    def mod_pow(base, exp, mod):
        # your code here
        return 0
  javascript: |
    function mod_pow(base, exp, mod) {
      // your code here
      return 0;
    }
tests:
  - args: [2, 10, 1000]
    expected: 24
    label: 1024 mod 1000
  - args: [3, 0, 7]
    expected: 1
    label: anything to the zero is 1
  - args: [5, 3, 13]
    expected: 8
  - args: [2, 30, 10007]
    expected: 731
  - args: [7, 222, 1000]
    expected: 49
  - args: [6, 1, 1]
    expected: 0
    label: everything is 0 mod 1
  - args: [10, 18, 65521]
    expected: 25342
    hidden: true
hints:
  - "Loop while exp > 0; if the lowest bit of exp is set, multiply result by base; then square base and halve exp."
  - "Initialise result as 1 % mod so that mod == 1 returns 0."
```

```exercise
id: poly-hash
title: Polynomial string hash with Horner's rule
prompt: |
  Compute the polynomial hash of `s` with base `base` and modulus `mod`:
  `h = (h * base + code(c)) % mod` for each character in order, starting
  from `h = 0`, where `code(c)` is the character's code point (`ord` in
  Python, `charCodeAt` in JavaScript). The empty string hashes to 0.
  Test moduli are small enough that `h * base` stays exact in JavaScript.
languages: [python, javascript]
entry: poly_hash
starter:
  python: |
    def poly_hash(s, base, mod):
        # your code here
        return 0
  javascript: |
    function poly_hash(s, base, mod) {
      // your code here
      return 0;
    }
tests:
  - args: ["", 31, 101]
    expected: 0
    label: empty string
  - args: ["a", 31, 101]
    expected: 97
  - args: ["ab", 31, 101]
    expected: 75
  - args: ["abc", 256, 101]
    expected: 90
  - args: ["bca", 256, 101]
    expected: 28
    label: same letters, different order, different hash
  - args: ["hashing", 31, 1000000007]
    expected: 186817403
    label: the worked trace
  - args: ["hello", 31, 1000003]
    expected: 162025
    hidden: true
  - args: ["world", 31, 1000003]
    expected: 318463
    hidden: true
hints:
  - "Reduce modulo mod inside the loop, not once at the end."
```

```exercise
id: rabin-karp
title: Rabin–Karp with a rolling hash
prompt: |
  Return every index at which `pattern` occurs in `text`, in increasing
  order (overlapping occurrences count). Hash the pattern and the first
  window with Horner's rule (`h = (h * base + code) % mod`), then roll:
  subtract the outgoing character times `base^(m-1) % mod`, add `mod` so
  the value is never negative, multiply by `base`, add the incoming
  character, reduce. Compare characters only when the hashes match, and
  return `[]` when the pattern is longer than the text. Bases and moduli
  keep every product below 2^53.
languages: [python, javascript]
entry: rabin_karp
starter:
  python: |
    def rabin_karp(text, pattern, base, mod):
        # your code here
        return []
  javascript: |
    function rabin_karp(text, pattern, base, mod) {
      // your code here
      return [];
    }
tests:
  - args: ["abracadabra", "abra", 31, 1000000007]
    expected: [0, 7]
    label: the viz above
  - args: ["hashing", "shin", 31, 1000000007]
    expected: [2]
    label: the worked trace
  - args: ["aaaaa", "aa", 31, 1000000007]
    expected: [0, 1, 2, 3]
    label: overlapping matches
  - args: ["abc", "abcd", 31, 101]
    expected: []
    label: pattern longer than text
  - args: ["abcabc", "xyz", 256, 101]
    expected: []
  - args: ["banana", "ana", 31, 1000000007]
    expected: [1, 3]
    hidden: true
  - args: ["abcdefghij", "cd", 31, 7]
    expected: [2]
    hidden: true
    label: modulus 7 forces hash collisions that verification must reject
hints:
  - "Precompute high = base^(m-1) % mod with a loop of m - 1 multiplications, reducing each time."
  - "Roll with h = (h - code(out) * high % mod + mod) % mod, then h = (h * base + code(in)) % mod."
  - "Check text[i:i+m] == pattern only when h equals the pattern's hash."
```

## Senior signals

- You know which languages give a negative remainder and reach for `((a % m) + m) % m`, `floorMod` or `rem_euclid` before a negative hash indexes an array.
- You can derive $(ab) \bmod m = ((a \bmod m)(b \bmod m)) \bmod m$ from $a = q_a m + r_a$ in two lines, and you know division is the exception, which needs an inverse and $\gcd(b, m) = 1$.
- You size intermediate values: two 32-bit operands need 64 bits, two values below $10^9 + 7$ need `i64`, JavaScript needs `BigInt` above $2^{53}$, and near-word-size moduli need `mul_mod` or a 128-bit product.
- You trace a rolling hash update with real numbers, know where the subtraction goes negative, and always verify a hash hit.
- You explain why a size-8 table with keys in steps of 4 uses two buckets, why Java spreads `h ^ (h >>> 16)` and CPython perturbs, and which one your language's map does.
- You quote the birthday floor: a 32-bit hash collides by 100,000 items, a 64-bit one by billions.
- You derive Fermat's inverse from the permutation argument and know Euler's version needs $\varphi(m)$, so composite moduli call for extended Euclid.
- You mention keyed hashing (SipHash) unprompted when a hash function's base and modulus are fixed and the input is user-controlled.

## Check yourself

```quiz
- q: >-
    In Java, `key.hashCode() % table.length` throws ArrayIndexOutOfBoundsException in production once a week. What is happening?
  options: ["hashCode() can be negative, and Java's % keeps its sign", "Overflow in hashCode() yields values % cannot reduce", "table.length is not prime, so some buckets overflow", "hashCode() can exceed table.length and % fails to wrap it"]
  answer: 0
  explanation: >-
    Java's hashCode() returns a signed int and Java's % truncates toward zero, so the remainder keeps the sign of the dividend and a negative hash gives a negative index. Exceeding table.length is exactly what % fixes, and no int value is too large for % to reduce; only the sign escapes it. Primality is irrelevant. Use Math.floorMod or mask with a power-of-two size.
- q: >-
    You port a solution that computes products modulo 10^9 + 7 from Python to JavaScript and it returns wrong answers on large inputs. Why?
  options: ["JavaScript's % gives negative results for these inputs", "The product can pass 2^53 and is rounded before the %", "JavaScript's % is float division and rounds the remainder", "JavaScript integers are 32-bit, so the product wraps"]
  answer: 1
  explanation: >-
    Two reduced operands can multiply to about 10^18, above the 2^53 exact-integer limit of a float64. The digits are rounded before the reduction, so the remainder is wrong. Bitwise operators are 32-bit but ordinary arithmetic is not, and with non-negative operands the sign of % never comes into play; use BigInt, mul_mod by doubling, or split the multiplication.
- q: >-
    A rolling hash uses base B = 256 and modulus M = 2^32 (via unsigned overflow). What is wrong with it?
  options: ["The hash can no longer be rolled forward in O(1) time", "Nothing; a power-of-two modulus is only faster to reduce", "256^4 is 0 mod 2^32, so only the last 4 chars count", "256 is too small a base to separate all ASCII strings"]
  answer: 2
  explanation: >-
    256^4 = 2^32 is congruent to 0, so every character more than four positions from the end contributes nothing. A prime modulus shares no factor with B, keeping every position live. Speed is real but irrelevant when the hash is broken, and 256 already exceeds the ASCII alphabet.
- q: >-
    Eight keys allocated in steps of 4 (1000, 1004, ..., 1028) are inserted into a table of 8 buckets by `key % 8`. How many buckets are used, and what fixes it?
  options: ["8 buckets; the modulus spreads any arithmetic sequence evenly", "4 buckets; doubling the table to 16 restores full spread", "2 buckets; a prime size or a mixing step before the mask", "2 buckets; only a larger power-of-two size can fix it"]
  answer: 2
  explanation: >-
    gcd(4, 8) = 4, so 1000 + 4k mod 8 cycles through only 8/4 = 2 residues (0 and 4). Doubling to 16 gives 4 buckets, still a quarter of the table. A prime size has gcd 1 with every smaller step and uses all buckets; a power-of-two size works only if the hash is mixed first, which is what Java's h ^ (h >>> 16) and CPython's perturbation do.
- q: >-
    A service assigns each request to one of 10^9 cells with `rand32() % 1000000000`. What is the distribution error?
  options: ["None; the modulus maps 2^32 values evenly onto 10^9 cells", "About 25%: the low 295 million cells get 5 chances, the rest 4", "About 50%: half the cells are unreachable by a 32-bit value", "About 0.1%: a rounding effect from 2^32 not dividing 10^9"]
  answer: 1
  explanation: >-
    2^32 = 4 × 10^9 + 294,967,296, so residues below 294,967,296 are hit by five 32-bit values and the others by four: the low cells are 25% more likely. For small n the extra chance is one in 2^32 / n and negligible, which is why the bug hides until n is large. Rejection sampling, as in Python's randrange, removes it.
- q: >-
    Why does `pow(a, p - 2, p)` give the inverse of a modulo a prime p?
  options: ["Because a^(p-2) ≡ a^(-2), and squaring both sides gives 1", "Because p - 2 is the largest exponent that fits in the modulus", "Because a^(p-1) ≡ 1 by Fermat, so a × a^(p-2) ≡ 1", "Because every power of a is its own inverse when p is prime"]
  answer: 2
  explanation: >-
    Multiplying the residues 1..p-1 by a permutes them, so a^(p-1) (p-1)! ≡ (p-1)! and a^(p-1) ≡ 1. Then a × a^(p-2) = a^(p-1) ≡ 1, so a^(p-2) is the inverse. The argument needs p prime (so the map is a permutation and (p-1)! is cancellable); for composite m use Euler's phi(m) or extended Euclid.
```
