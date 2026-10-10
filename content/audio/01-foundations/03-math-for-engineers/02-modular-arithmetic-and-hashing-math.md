---
lesson: modular-arithmetic-and-hashing-math
source: 2c430ee8a6f2f755
fit: partial
desk:
  - "The two-line derivation of the addition and multiplication rules"
  - "The mulmod and modular exponentiation traces, and their code"
  - "The polynomial hash trace of the word hashing, and the Rabin-Karp rolling trace"
  - "The bucket tables for keys in steps of 4, Java's spread and CPython's perturbation sequence"
  - "Fermat's little theorem, derived, and the inverse traces"
  - "Exercises: modular exponentiation, polynomial hash, Rabin-Karp"
---
## Introduction

Every hash table does one piece of arithmetic on every operation: take the key's hash, and reduce it modulo the number of buckets. Every rolling-hash string search does it, every sharding function, every problem that says give the answer modulo 10 to the 9 plus 7. And every fixed-width integer in your program does it whether you asked or not: a 32-bit unsigned integer that overflows is doing arithmetic modulo 2 to the 32.

Most engineers know the percent operator returns a remainder. Fewer know four things. That minus 7 mod 3 is 2 in Python and minus 1 in JavaScript, Java, C, Go and Rust. That you cannot divide under a modulus without an inverse. That two 32-bit numbers multiplied need 64 bits. And why a hash table with a power-of-two size has to mix its hash first. Those four facts are the difference between hashing code that works and hashing code that works until it does not. They are the four chapters that follow.

## What mod really is, and the sign trap

A mod m is the remainder when a is divided by m: the unique r from zero up to m minus 1 such that a is some multiple of m plus r. So 17 mod 5 is 2, because 17 is three fives plus 2. And minus 7 mod 3 is 2, because minus 7 is minus three threes plus 2.

That second one is where languages disagree. Python follows the mathematical convention and always gives a non-negative remainder. JavaScript, Java, C, Go and Rust truncate the quotient toward zero, so the remainder takes the sign of the dividend. Minus 7 mod 3 comes out as minus 1.

The bug this causes is a negative array index. Java's hash code is a signed integer. Reduce it with percent, and once a week a key with a negative hash indexes slot minus 3. In Java that is an out-of-bounds exception; in C it is memory corruption.

The portable fix is the double-mod idiom: take a mod m, add m, and take mod m again. The answer is always in range, whatever the sign. Rust has a Euclidean remainder, Java has floor mod, and Python's operator already floors. Masking with a power-of-two size is also sign-safe, because it keeps only the low bits.

## The rules, and the one that fails

Two rules make modular computation possible. The remainder of a sum is the remainder of the sum of the remainders. The remainder of a product is the remainder of the product of the remainders. The proof is two lines: write each number as a multiple of m plus its remainder, expand, and everything except the remainders is a multiple of m.

What that buys you is this: you never need the true value of a giant expression. Reduce after every operation and the intermediates stay below m squared. A tiny check with m equal to 7: 12 times 13 is 156, which leaves 2. And 12 mod 7 is 5, 13 mod 7 is 6, 5 times 6 is 30, which also leaves 2.

Division is the exception. 12 divided by 4 is 3. But 12 mod 7 is 5, and 4 mod 7 is 4, and 5 over 4 is not even an integer. Under a modulus, dividing by b means multiplying by b's inverse, the number that times b gives 1. And that inverse exists only when b and m share no common factor.

For a prime modulus, Fermat's little theorem hands you the inverse. If p is prime and a is not a multiple of p, a to the p minus 1 is 1 mod p. So a times a to the p minus 2 is 1, which makes a to the p minus 2 the inverse. One example by ear: the inverse of 3 mod 7 is 5, because 3 times 5 is 15, which leaves 1. For a composite modulus, Fermat's shortcut is meaningless; use extended Euclid instead.

## Overflow and the width of a product

Fixed-width integers are modular arithmetic. What happens on overflow depends on the language. In C, unsigned types wrap and signed overflow is undefined. Rust panics in debug builds and wraps in release. Go and Java wrap silently. Python never overflows. And JavaScript has no integers at all, only 64-bit floats, so instead of wrapping it loses precision past 2 to the 53.

The rule for products: multiplying an a-bit number by a b-bit number needs up to a plus b bits. Two 32-bit values need 64.

Here is the row that matters in practice. 10 to the 9 plus 7 is prime, and the product of two values reduced by it is at most about 10 to the 18. That fits a signed 64-bit integer. Before I tell you: does it fit a JavaScript number?

[pause]

No. A JavaScript number loses integer precision above about 9 times 10 to the 15. The product is rounded before the reduction, and the remainder comes out wrong. A solution that works in Python and fails in JavaScript on large inputs is exactly this. The fix is BigInt, a 128-bit product where your language has one, or multiplying by doubling and adding, which keeps every intermediate below twice the modulus.

That same doubling idea gives you modular exponentiation. To raise 3 to the 13th mod 1000, you never form the full power. You square the base repeatedly, getting 3, 9, 81, and so on, and multiply in the squares whose bit is set in the exponent. The number of steps is the log of the exponent, and every value stays below the modulus squared.

## Polynomial and rolling hashes

A hash table needs an integer from a string. The standard construction treats the characters as the digits of a number in some base B, and reduces modulo M. You compute it left to right with one multiply and add per character: the running hash times B, plus the next character's code, reduced. Java's string hash uses base 31 and lets overflow do the reduction modulo 2 to the 32.

The base should exceed the alphabet, so short strings are distinct before reduction. The modulus should be large, because two random strings collide with probability about one in M. And both should be unpredictable to an attacker. With a fixed base and modulus, anyone can construct thousands of colliding strings and turn your constant-time map into a linear list.

The polynomial form has a gift: you can slide it. Rabin-Karp searches a text for a pattern of length m. Instead of rehashing every window, it drops the outgoing character's contribution, shifts everything up one place by multiplying by B, and adds the incoming character. Three operations per window, whatever the pattern's length.

Two details separate a working implementation from a broken one. First, the subtraction can go negative, and in a truncating language that negative value poisons every later step. Reduce the outgoing term, add M, then reduce. Second, a hash match is not a string match. Two windows share a hash with probability about one in M, so you must verify each hit character by character. Skip that, and with a modulus around a billion and a text of a million characters, roughly one search in a thousand returns a wrong answer.

And the modulus must be prime here. If M shares a factor with B, some power of B becomes zero and early characters stop counting. With base 256 and modulus 2 to the 32, 256 to the fourth is exactly 2 to the 32, which is zero. The hash depends only on the last four characters.

## Why primes keep appearing

Picture eight keys handed out in steps of 4: 1000, 1004, 1008, up to 1028. Aligned addresses, or IDs allocated four at a time. Put them in a table of 8 buckets by taking the key mod 8. How many buckets do they use?

[pause]

Two. Buckets 0 and 4, back and forth. Your table of 8 is effectively a table of 2, with chains four times longer than the load factor predicts. The reason is that 4 and 8 share a factor of 4, so the sequence only visits 8 divided by 4 residues. Double the table to 16 and you get 4 buckets, still a quarter of the table. With a prime size, 7, they use all seven buckets, because a prime shares no factor with any smaller step.

But dividing by a prime costs a division, around 10 to 20 cycles on recent cores, where masking with a power of two costs one. So Python's dict, Java's hash map, Rust and Go all use powers of two and mix the hash first, so the low bits depend on all the bits. Java XORs the hash with itself shifted right by 16. Python mixes during probing, feeding five more bits of the hash into each step. The rule: a power-of-two size with good mixing beats a prime size with a bad hash, and a power-of-two size with a bad hash is a disaster.

The same failure appears in sharding. Shard by user ID mod 16, with IDs allocated in steps of 8, and only two shards carry all the traffic. Hash the key first.

Last, collisions as a function of width, from the birthday bound. A 32-bit hash has about a 1 percent chance of a collision at 10 thousand items, and 69 percent at 100 thousand. A 64-bit hash is safe into the hundreds of millions, and reaches about 2.7 percent at a billion. So a 32-bit hash used as a key, for deduplication, breaks by 100 thousand items. As a bucket selector it is fine, because collisions there are expected and handled.

## In the interview

Here is a follow-up the lesson expects. Why do competitive programmers reduce modulo 10 to the 9 plus 7 specifically?

[pause]

Because it is prime, so every non-zero value has an inverse and division works. It is below 2 to the 30, so the product of two reduced values fits a signed 64-bit integer without a 128-bit multiply. And its sum with itself fits a 32-bit integer. The wrong answer is "because it is big". That would also be true of 10 to the 9 plus 8, an even number under which half the values have no inverse.

And a second: how would you defend a hash map against adversarial keys? A keyed hash with a random per-process seed, such as SipHash, so collisions cannot be precomputed. A cap on the number of keys parsed from untrusted input. And tree bins or bounded chains as a backstop. The wrong answer is a bigger table, which does nothing to the chain length of keys that all collide.

## Recap

Four things to remember. The remainder of a negative number is negative in most languages, so use the double-mod idiom, floor mod, or a mask before indexing. Sums and products can be reduced at every step, but division needs an inverse, and Fermat gives it as a to the p minus 2 only when the modulus is prime. A product needs the bits of both operands, and two values near a billion overflow a JavaScript number. And structured keys collapse a power-of-two table or shard count, so hash and mix before you reduce, and always verify a rolling-hash match.

At your desk: the derivation of the rules, the mulmod and exponentiation traces, the polynomial and rolling hash traces, the bucket tables, Fermat's derivation, and the three exercises.
