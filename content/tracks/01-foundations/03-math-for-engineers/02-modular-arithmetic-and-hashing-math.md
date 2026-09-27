---
slug: modular-arithmetic-and-hashing-math
title: "Modular arithmetic and the math behind hashing"
description: What mod really does (including to negative numbers in each language), how to compute without overflow, how polynomial and rolling hashes work, and why primes keep showing up in table sizes and multipliers.
minutes: 45
difficulty: medium
tags: [math, modular-arithmetic, hashing, overflow, rolling-hash]
problems: [pow-x-n, reverse-integer, happy-number]
---
Every hash table does one piece of arithmetic on every operation: `index = hash(key) % buckets`. Every rolling-hash string search, every sharding function, every "compute the answer modulo 10⁹+7" problem, and every fixed-width integer in your program does the same thing. Modular arithmetic is the arithmetic of remainders, and it is the arithmetic your CPU natively performs, whether you asked for it or not: a `u32` that overflows is doing arithmetic mod $2^{32}$.

Most engineers know `%` returns a remainder. Fewer know that `-7 % 3` is `2` in Python and `-1` in JavaScript, Java, C, Go and Rust, that you cannot divide under a modulus without an inverse, that two 32-bit numbers multiplied need 64 bits, or why a hash table with a power-of-two size has to do extra mixing. Those four facts are the difference between hashing code that works and hashing code that works until it doesn't.

## What mod actually is

$a \bmod m$ is the remainder when $a$ is divided by $m$. Formally, it is the unique $r$ with $0 \le r < m$ such that $a = qm + r$ for some integer $q$. Under that definition:

- $17 \bmod 5 = 2$ because $17 = 3 \cdot 5 + 2$.
- $15 \bmod 5 = 0$.
- $-7 \bmod 3 = 2$ because $-7 = (-3) \cdot 3 + 2$.

That last line is the one languages disagree on. The mathematical convention (Euclidean or "floored" division) always gives a non-negative remainder. Most languages instead truncate the quotient toward zero, which makes the remainder take the sign of the dividend:

| Expression | Python | JavaScript | Java / C / Go / Rust |
|---|---|---|---|
| `7 % 3` | 1 | 1 | 1 |
| `-7 % 3` | **2** | **-1** | **-1** |
| `7 % -3` | -2 | 1 | 1 |

The bug this causes is a negative array index. If `hash(key)` can be negative (Java's `hashCode()` is a signed `int`; a subtraction in your own hash can go negative), then `hash % buckets` can be negative, and `table[-1]` is either an exception or, in C, memory corruption. The portable fix is the double-mod idiom:

```javascript
function mod(a, m) {
  return ((a % m) + m) % m;   // always in [0, m), for any sign of a
}
mod(-7, 3);   // 2
```

Rust has `rem_euclid` for exactly this reason, and Python's `%` already does it. Java's `Math.floorMod` does too. If you write a hash table in a language whose `%` truncates, use the idiom or mask with a power-of-two size (`hash & (m - 1)`, which is sign-safe because it only keeps low bits).

## The rules that make modular computation possible

The reason you can compute a hash of a gigabyte-long string in a 64-bit register is that reduction distributes over addition and multiplication:

$$(a + b) \bmod m = \big((a \bmod m) + (b \bmod m)\big) \bmod m$$
$$(a \cdot b) \bmod m = \big((a \bmod m) \cdot (b \bmod m)\big) \bmod m$$

So you never need the true value of a giant expression. Reduce after every operation and the intermediate values never exceed $m^2$. Check with $m = 7$: $(12 \cdot 13) \bmod 7 = 156 \bmod 7 = 2$, and $(12 \bmod 7)(13 \bmod 7) = 5 \cdot 6 = 30$, $30 \bmod 7 = 2$. Same answer.

Subtraction works the same way but is where negatives sneak in: $(a - b) \bmod m$ computed as `(a % m - b % m) % m` can be negative in truncating languages. Add $m$ first: `(a % m - b % m + m) % m`.

**Division does not distribute.** $(a / b) \bmod m$ is *not* $((a \bmod m) / (b \bmod m))$: $(12 / 4) \bmod 7 = 3$, but $(5 / 4)$ is not even an integer. Under a modulus, "divide by $b$" means "multiply by the number $b^{-1}$ such that $b \cdot b^{-1} \equiv 1 \pmod m$", which exists only when $\gcd(b, m) = 1$. The [number theory lesson](/learn/foundations/math-for-engineers/number-theory-essentials) shows how to find it. This is why competitive-programming problems say "modulo a prime": with a prime modulus every non-zero number has an inverse, so division is always possible.

## Overflow-safe arithmetic

Fixed-width integers *are* modular arithmetic. A `u32` holds $0$ to $2^{32} - 1$, and `u32::MAX + 1` wraps to 0: the hardware computes mod $2^{32}$. In C that wrap is defined for unsigned types and undefined for signed ones; in Rust debug builds it panics; in Go, Java and release-mode Rust it silently wraps; in Python it never happens because integers are arbitrary precision; in JavaScript there are no integers at all, only `float64`, so precision degrades past $2^{53}$ rather than wrapping.

The arithmetic fact you need: multiplying an $a$-bit number by a $b$-bit number needs up to $a + b$ bits.

| Operands | Product needs | Fits in |
|---|---|---|
| Two values $< 2^{16}$ | $< 2^{32}$ | `u32` |
| Two values $< 2^{32}$ | $< 2^{64}$ | `u64` |
| Two values $< 2^{31.5}$ (≈ 3 × 10⁹) | $< 2^{63}$ | `i64` |
| Two values $< 2^{26.5}$ (≈ 9.5 × 10⁷) | $< 2^{53}$ | JS `Number` exactly |
| Two values $< 10^9 + 7$ | up to $\approx 10^{18} < 2^{63}$ | `i64`, **not** JS `Number` |

That last row is the practical one. The modulus $10^9 + 7$ was chosen because it is prime and because the product of two reduced values, at most $(10^9 + 6)^2 \approx 10^{18}$, fits in a signed 64-bit integer with room to spare. The same product does *not* fit in a JavaScript `Number`, which loses integer precision above $9 \times 10^{15}$. In JS you either use `BigInt` or split the multiplication. A mid-level engineer's solution "works in Python, fails in JS" for exactly this reason.

Modular exponentiation is the standard example of reducing at every step. To compute $3^{13} \bmod 1000$ you never form $3^{13} = 1{,}594{,}323$:

```python
def mod_pow(base: int, exp: int, m: int) -> int:
    result = 1 % m          # handles m == 1
    base %= m
    while exp > 0:
        if exp & 1:                     # this bit of exp is set
            result = result * base % m
        base = base * base % m          # square: base^1, base^2, base^4, ...
        exp >>= 1
    return result

mod_pow(3, 13, 1000)   # 323
```

Trace it: $13 = 1101_2$. The squares are $3, 9, 81, 561$ (since $81^2 = 6561 \equiv 561$). The set bits are positions 0, 2, 3, so the result is $3 \cdot 81 \cdot 561 \bmod 1000$. $3 \cdot 81 = 243$; $243 \cdot 561 = 136{,}323 \equiv 323$. And $3^{13} = 1{,}594{,}323$, whose last three digits are indeed 323. The loop terminates because `exp` halves each iteration: $O(\log \text{exp})$ multiplications, each on a value below $m$.

## Polynomial hashing: turning a string into a number

A hash table needs an integer from a key. For a string $s = s_0 s_1 \dots s_{n-1}$, the standard construction treats the characters as digits of a number in base $B$ and reduces modulo $M$:

$$h(s) = \big(s_0 B^{n-1} + s_1 B^{n-2} + \cdots + s_{n-1} B^0\big) \bmod M$$

You compute it with Horner's rule, one multiply-add per character, reducing as you go:

```python
def poly_hash(s: str, B: int = 31, M: int = 1_000_000_007) -> int:
    h = 0
    for ch in s:
        h = (h * B + ord(ch)) % M
    return h
```

Worked example with small numbers so you can check by hand: `poly_hash("ab", B=31, M=101)`. Start with $h = 0$. After `'a'` (97): $h = (0 \cdot 31 + 97) \bmod 101 = 97$. After `'b'` (98): $h = (97 \cdot 31 + 98) \bmod 101 = 3105 \bmod 101$. $101 \cdot 30 = 3030$, remainder 75. So the hash is 75.

Why base and modulus matter:

- $B$ should exceed the alphabet size, so that distinct short strings map to distinct numbers before reduction. $B = 31$ is fine for lowercase letters (it is what Java's `String.hashCode` uses, with $M = 2^{32}$ by overflow); for full Unicode you want a larger $B$ or a mixing step.
- $M$ should be large (few collisions: two random strings collide with probability about $1/M$) and, for the rolling-hash trick below, prime.
- Both should be unpredictable to an attacker if the input is untrusted. With fixed $B$ and $M$ anyone can construct thousands of colliding strings and turn your $O(1)$ hash map into an $O(n)$ list. This is HashDoS, and it is why Python, Rust, Java and Go randomise or key their string hashes. The [hash functions lesson](/learn/data-structures/hashing/hash-functions) covers the defence.

Here is the same idea running inside a chaining hash table. Each string becomes a number, the number mod 7 picks a bucket, and colliding keys share a chain:

```viz
{"type": "hash-table", "algorithm": "chaining", "buckets": 7,
 "operations": [["set","apple",1],["set","banana",2],["set","cherry",3],["set","date",4],["set","elder",5],["get","cherry"],["delete","banana"],["get","banana"]],
 "title": "hash(key) mod 7", "caption": "The modulus turns an arbitrary integer into one of seven bucket indices. Two keys with the same remainder land in the same chain."}
```

## Rolling hashes: hashing every window in O(1) each

Searching for a pattern of length $m$ in a text of length $n$ by comparing hashes would cost $O(nm)$ if you re-hashed every window from scratch. The polynomial form lets you *slide*: given the hash of `text[i..i+m]`, the hash of `text[i+1..i+m+1]` is

$$h_{i+1} = \big(h_i - s_i B^{m-1}\big) \cdot B + s_{i+m} \pmod M$$

Drop the leading character's contribution, shift everything up one place, add the new character. Three operations regardless of $m$. This is Rabin-Karp:

```viz
{"type": "string", "algorithm": "rabin-karp", "text": "abracadabra", "pattern": "abra", "title": "Rolling the window", "caption": "Each step subtracts the outgoing character times B^(m-1), multiplies by B, and adds the incoming character. Only windows whose hash matches are compared character by character."}
```

Two details separate a working implementation from a broken one:

1. **The subtraction goes negative** in truncating languages. `(h - s_i * B_pow) * B` can be below zero before the final `% M`; add $M$ (or use the double-mod idiom) before multiplying.
2. **A hash match is not a string match.** Two different windows can share a hash (probability about $1/M$ per window with a good $B$ and prime $M$). Rabin-Karp verifies each hash hit by comparing characters. If you skip verification you have a Monte Carlo algorithm that is wrong with probability roughly $n/M$; with $M \approx 10^9$ and $n = 10^6$ that is one in a thousand searches, which is not acceptable for a substring search but is fine for, say, a deduplication heuristic backed by a later exact check.

Why must $M$ be prime here? Because the polynomial must not degenerate. If $M$ shares a factor with $B$, then $B^{k} \bmod M$ hits zero for some $k$ and every character more than $k$ positions from the end stops contributing to the hash. With $B = 256$ and $M = 2^{32}$, $B^4 \equiv 0$, so the hash of any string depends only on its last four characters. A prime $M$ shares no factor with any $B < M$, so every position keeps contributing.

## Why primes keep appearing

There are three separate places primes show up in hashing, with three separate reasons.

### Prime table sizes

Consider a table of size $m = 8$ and keys that happen to be multiples of 4 (pointer-derived hashes, aligned memory addresses, IDs allocated in steps of 4). $4k \bmod 8$ is always 0 or 4: every key lands in two of the eight buckets and the table is effectively size two. A prime $m$ has no factor in common with any step size below it, so an arithmetic sequence of keys $a, a + d, a + 2d, \ldots$ with $d < m$ cycles through all $m$ buckets before repeating. This is why classic implementations (early Java `Hashtable`, C++ `std::unordered_map` in libstdc++) size their bucket arrays with primes.

The cost is that `hash % prime` is a real division, tens of cycles, while `hash & (2^k - 1)` is one cycle. Modern implementations (Python `dict`, Rust `HashMap`, Java `HashMap`, Go `map`) pick powers of two for speed and compensate by *mixing the hash first* so its low bits depend on all its bits. Java `HashMap` XORs the high 16 bits into the low 16 before masking; Python's dict adds a "perturbation" step that folds the high bits in during probing. Power-of-two size plus a good mixing step beats a prime size plus a bad hash; a power-of-two size plus a bad hash is a disaster.

### Prime multipliers

`h = h * 31 + c` uses 31 because it is an odd prime near a power of two (`31 * h` compiles to `(h << 5) - h`), and because an odd multiplier is a bijection modulo $2^{32}$: multiplying by an even number would throw away the top bit of information on every step. Larger multipliers like 131 or 16777619 (FNV) mix faster. Primeness is less important here than oddness and size, but the folklore persists because prime multipliers avoid short cycles for the widest range of moduli.

### Prime moduli for polynomial hashing

Covered above: a prime modulus keeps $B^k$ non-zero for every $k$, and it makes $\mathbb{Z}_M$ a field, so the polynomial $h(s)$ has at most $n$ roots and the collision probability for two random strings of length $n$ is bounded by $n/M$ (the Schwartz–Zippel bound). Common choices: $10^9 + 7$, $10^9 + 9$, and $2^{61} - 1$, a Mersenne prime that lets you reduce with shifts and adds instead of division.

## Modular arithmetic beyond hashing

The same rules power a surprising amount of everyday engineering.

- **Ring buffers.** `write_index = (write_index + 1) % capacity`. With a power-of-two capacity, `& (capacity - 1)`.
- **Sharding.** `shard = hash(user_id) % num_shards`. Changing `num_shards` from 8 to 9 reassigns 8/9 of all keys, which is the motivation for [consistent hashing](/learn/data-structures/hashing/hashing-at-scale).
- **Clock arithmetic.** Hours mod 12, days mod 7, sequence numbers mod $2^{32}$ in TCP. Comparing TCP sequence numbers needs "serial number arithmetic" (RFC 1982) precisely because they wrap.
- **Checksums.** ISBN-10 check digits are a weighted sum mod 11 (a prime, so any single-digit error is detected); Luhn (credit cards) is mod 10.
- **Digit manipulation.** `n % 10` is the last digit and `n // 10` drops it, the engine behind [Reverse Integer](/practice/reverse-integer), [Happy Number](/practice/happy-number) and [Plus One](/practice/plus-one).
- **Cyclic shifts.** Rotating an array of length $n$ by $k$ positions maps index $i$ to $(i + k) \bmod n$; take $k \bmod n$ first, or $k = 10^9$ costs $10^9$ swaps.

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
    label: the worked example
  - args: ["abc", 256, 101]
    expected: 90
  - args: ["bca", 256, 101]
    expected: 28
    label: same letters, different order, different hash
  - args: ["hello", 31, 1000003]
    expected: 162025
    hidden: true
  - args: ["world", 31, 1000003]
    expected: 318463
    hidden: true
hints:
  - "Reduce modulo mod inside the loop, not once at the end."
```

## Senior signals

- You know which languages give a negative remainder and reach for `((a % m) + m) % m`, `floorMod` or `rem_euclid` before a negative hash indexes an array.
- You state that reduction distributes over `+`, `-` and `×` but not `/`, and that "division mod m" means multiplying by an inverse, which exists only when $\gcd(b, m) = 1$.
- You size intermediate values: two 32-bit operands need 64 bits, two values below $10^9 + 7$ need `i64`, and JavaScript needs `BigInt` above $2^{53}$.
- You can explain a rolling hash's update step, why the subtraction can go negative, and why a hash match must be verified.
- You can explain why power-of-two table sizes need a mixing step and why prime sizes do not, and you know which one your language's map uses.
- You mention HashDoS unprompted when a hash function's base and modulus are fixed and the input is user-controlled.

## Check yourself

```quiz
- q: >-
    In Java, `key.hashCode() % table.length` throws ArrayIndexOutOfBoundsException in production once a week. What is happening?
  options: ["hashCode() can be negative, and Java's % keeps its sign", "hashCode() can exceed table.length and % fails to wrap it", "Overflow in hashCode() yields values % cannot reduce", "table.length is not prime, so some buckets overflow"]
  answer: 0
  explanation: >-
    Java's hashCode() returns a signed int and Java's % truncates toward zero, so the remainder keeps the sign of the dividend and a negative hash gives a negative index. Exceeding table.length is exactly what % fixes, and no int value is too large for % to reduce; only the sign escapes it. Primality is irrelevant. Use Math.floorMod or mask with a power-of-two size.
- q: >-
    You port a solution that computes products modulo 10^9 + 7 from Python to JavaScript and it returns wrong answers on large inputs. Why?
  options: ["The product can pass 2^53 and is rounded before the %", "JavaScript's % is float division and rounds the remainder", "JavaScript integers are 32-bit, so the product wraps", "JavaScript's % gives negative results for these inputs"]
  answer: 0
  explanation: >-
    Two reduced operands can multiply to about 10^18, above the 2^53 exact-integer limit of a float64. The digits are rounded before the reduction, so the remainder is wrong. Bitwise operators are 32-bit but ordinary arithmetic is not, and with non-negative operands the sign of % never comes into play; use BigInt or split the multiplication.
- q: >-
    A rolling hash uses base B = 256 and modulus M = 2^32 (via unsigned overflow). What is wrong with it?
  options: ["256 is too small a base to separate all ASCII strings", "The hash can no longer be rolled forward in O(1) time", "256^4 is 0 mod 2^32, so only the last 4 chars count", "Nothing; a power-of-two modulus is just faster to reduce"]
  answer: 2
  explanation: >-
    256^4 = 2^32 is congruent to 0, so every character more than four positions from the end contributes nothing. A prime modulus shares no factor with B, keeping every position live. Speed is real but irrelevant when the hash is broken, and 256 already exceeds the ASCII alphabet.
- q: >-
    Why do Python's dict and Rust's HashMap use power-of-two bucket counts even though prime sizes spread structured keys better?
  options: ["They do not; both pick prime bucket counts for spread", "Masking beats dividing, and a mixing step fixes spread", "Prime sizes cannot be grown by doubling when resizing", "Power-of-two sizes eliminate collisions for integer keys"]
  answer: 1
  explanation: >-
    Masking with (size - 1) is a single cycle while modulo by a prime is a division, and doubling is trivial. The weakness (only low bits pick the bucket) is fixed by a mixing step or a hash whose bits are already well spread. Primes can of course be roughly doubled, and no size prevents collisions.
- q: >-
    Rabin-Karp reports that a window's hash equals the pattern's hash. What must the algorithm do next to be correct?
  options: ["Report a match immediately; the hashes agree", "Compare the window and pattern character by character", "Recompute both hashes with a second base to confirm", "Nothing; equal hashes imply equal strings when M is prime"]
  answer: 1
  explanation: >-
    Different strings can share a hash with probability about 1/M per window. Verification keeps the algorithm exact; skipping it makes it Monte Carlo with an error rate near n/M. A prime modulus, or a second hash, reduces collisions but cannot eliminate them.
```
