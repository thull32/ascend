---
lesson: string-matching
source: 61ee95ea1e185316
---
## 1

On which input does the naive string search do its worst-case work, proportional to n times m?

A, random text over a small alphabet, and a random pattern. B, text of all a's, and a pattern of a's ending in a b. C, a pattern whose first character never appears in the text. D, text of all a's, and a pattern of b's ending in an a.

[think]

The answer is B: text of all a's, and a pattern of a's ending in a b.

Every alignment matches m minus 1 characters before failing on the final b, so each of the n alignments costs about m. Swap the letters, b's ending in an a, and every alignment fails on the first character, which is linear. Random inputs also fail almost immediately, and so does a pattern whose first character never appears.

## 2

The KMP inner loop can run several times for a single text character. Why is the whole search still linear, n plus m?

A, the failure table is precomputed, so each fall-back step is a single constant-time lookup. B, the matched count j grows at most once per text character, and every inner iteration makes j smaller. C, the inner loop runs only on a mismatch, and every mismatch moves the text index forward. D, mismatches after a partial match are rare, so the fall-back chain is short on average.

[think]

The answer is B: the matched count j grows at most once per text character, and every inner iteration makes j smaller.

It is an amortised argument. J rises by at most one per text character, every inner iteration strictly lowers it, and it never goes below zero, so there are at most n fall-backs in total. A precomputed table makes each step cheap, but says nothing about how many steps there are, and the bound is a worst case, not a claim about typical input.

## 3

A Rabin-Karp implementation reports a match whenever a window's hash equals the pattern's hash, with no character comparison. What is the consequence?

A, missed matches when the rolling update wraps around the modulus. B, false positives whenever two different windows collide on the hash. C, missed matches wherever two occurrences of the pattern overlap. D, nothing, because a hash modulo a large prime is unique for each window.

[think]

The answer is B: false positives whenever two different windows collide on the hash.

A hash maps a large space into a small one, so collisions exist, and with a fixed base and modulus an adversary can build colliding windows on purpose. The rolling update is exact, so a true occurrence always hashes equal and is never missed; the error is only ever a false positive. Verify on a hash match, or use a random base and a large prime modulus, and accept a stated error probability.

## 4

A rolling hash uses 64-bit wrap-around arithmetic, modulo 2 to the 64, with a fixed odd base, to avoid the cost of a modulo. What is the risk?

A, nothing, since 2 to the 64 possible values make accidental collisions negligible. B, known input families collide for every odd base, so an adversary can force n times m work or false matches. C, the hash of a window can exceed the modulus, so the rolling update loses characters. D, wrap-around makes the rolling update non-invertible, so windows cannot be removed.

[think]

The answer is B: known input families collide for every odd base, so an adversary can force n times m work or false matches.

Polynomial hashing modulo a power of two is broken by the Thue-Morse strings: two different strings of length about 2,000 collide whatever the base. Accidental collisions are indeed rare, but adversarial ones are not, which is why a large prime modulus and a random base are the rule. The rolling update stays invertible under any modulus.

## 5

A string s has length n, and lps is its KMP failure array. When is s a repetition of a shorter string?

A, when the period, n minus the last lps value, divides n, and is less than n. B, when the last lps value is above zero, meaning s has a non-empty border. C, when the last lps value is exactly n over 2, so the two halves are equal. D, when every lps value after index 0 is non-zero.

[think]

The answer is A: when the period, n minus the last lps value, divides n, and is less than n.

N minus the last lps value is the smallest period of s, and the string is a whole number of repetitions exactly when that period divides n. A positive last value only says some border exists: a, b, c, a, b has one, but is not periodic. And a, b, c repeated three times is periodic, with a last lps value of 6, not n over 2.

## 6

Python's string find, glibc's memmem and Rust's string find do not use KMP. What do they use, and why?

A, Horspool-style skipping and the Two-Way algorithm: faster than linear on typical text, with a linear worst case. B, suffix arrays built over the text, which answer each query in m log n time. C, Rabin-Karp rolling hashes, which scan at memory bandwidth with constant extra space. D, naive search with a SIMD scan for the first byte: fast on typical text, but n times m in the worst case.

[think]

The answer is A: Horspool-style skipping and the Two-Way algorithm, faster than linear on typical text, with a linear worst case.

KMP looks at every text character. Skip-based algorithms jump over most of the text on large alphabets, and Two-Way gives the linear worst-case guarantee with constant extra memory. Naive search with a first-byte scan is Java's indexOf, and Rabin-Karp is Go's fallback for longer patterns, but these three libraries chose Two-Way precisely to avoid the naive worst case. KMP's value is its guarantee and its failure function, not raw speed.
