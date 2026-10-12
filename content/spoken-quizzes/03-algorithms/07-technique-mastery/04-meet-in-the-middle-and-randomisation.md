---
lesson: meet-in-the-middle-and-randomisation
source: 73fa2767d2d91c57
---
## 1

You have 36 integers, with absolute values up to 10 to the 12, and must count the subsets that sum to exactly S. Which approach fits?

A, brute force over all 2 to the 36 subsets, pruning branches whose sum passes S. B, meet in the middle: hash one half's 2 to the 18 sums, and look up S minus x for the other half. C, greedy by largest value, adding each item while the total stays within S. D, a table over reachable sums, with a count for every sum up to S.

[think]

The answer is B: meet in the middle, hashing one half's sums.

The value range rules out a table, and 2 to the 36 is about 69 billion subsets. Pruning at S does not help, because values can be negative and a sum that passes S can come back. Two halves of about 262 thousand sums each, combined by counting one half's sums in a hash map and looking up S minus each sum of the other, take well under a second. Greedy has no correctness argument here.

## 2

Why is a random pivot better than a median-of-three pivot against an adversary?

A, median-of-three is quadratic on every input, while random pivots average n log n. B, an adversary can target a known rule's bad input, but not your coin flips. C, random pivots guarantee n log n even in the worst case, whatever the input. D, a random pivot is cheaper to compute than the median of three sampled values.

[think]

The answer is B: an adversary can target a known rule's bad input, but not your coin flips.

Every deterministic rule has a known bad input, and "median-of-three killer" sequences exist. With random pivots the expected time is n log n for every input, because the adversary chooses the input but not the coin flips. It is still an expected bound, not a worst case, and median-of-three is fast on most inputs, just not on crafted ones.

## 3

A shuffle goes through every position i and swaps it with a position chosen uniformly from the whole array. What is wrong with it?

A, nothing; every element can reach every position, so all orders can occur. B, its n to the n equally likely runs cannot split evenly over the n factorial permutations. C, it can swap an element with itself, which wastes a draw and skews the odds. D, it makes n swaps instead of n minus 1, so the last swap undoes part of the mixing.

[think]

The answer is B: its n to the n runs cannot split evenly over the n factorial permutations.

For 3 elements there are 27 equally likely runs and 6 permutations, and 27 is not divisible by 6, so some orders must be more likely than others. Every order being possible is not the same as every order being equally likely. Fisher-Yates draws from a shrinking range, giving exactly n factorial runs, one per permutation. It allows self-swaps too, so those are not the problem.

## 4

Freivalds' check multiplies by a random vector of zeros and ones, r, and compares A times B r with C r. If A times B is not C, what bounds the chance that one round wrongly reports equality?

A, close to 1 for some inputs, when the difference has only a single non-zero entry. B, at most one half, because at most one value of a single coordinate of r hides a non-zero row. C, at most 1 over n, since each of the n rows gets its own chance to differ. D, it is 0, because a non-zero difference always shows up for any r.

[think]

The answer is B: at most one half.

Some row of the difference is non-zero. Pick a position where it is non-zero, fix the rest of r, and at most one of the two values at that position makes the product zero. Even a single non-zero entry is caught half the time. So each round catches a wrong C with probability at least a half, and k rounds miss it with probability at most 2 to the minus k, at n squared work per round.

## 5

Why do Python, Rust and Go all seed their string or map hashing with randomness chosen at start-up, or per map?

A, so each process can use a faster, shorter hash than a fixed secure one. B, so typical keys spread more evenly across buckets than with a fixed hash. C, so an attacker cannot precompute many keys that all collide in one bucket. D, so a keyed hash can double as a checksum that detects corrupted entries.

[think]

The answer is C: so an attacker cannot precompute keys that all collide in one bucket.

With a fixed, public hash function, crafted keys can all collide, turning each operation from constant to linear and n inserts into n squared work: hash flooding. A secret random key makes collisions unpredictable, which restores the expected constant bound for any input. For ordinary keys, a good fixed hash spreads them just as well; the randomness matters only against someone who knows the function.

## 6

A polynomial string hash uses base 31, with unsigned 64-bit overflow as its modulus. It passes thousands of random tests, and fails one crafted test. What is the crafted input, and what is the fix?

A, a Thue-Morse string and its complement, which collide for any odd base modulo 2 to the 64; use a random base and a prime modulus. B, two anagrams, which any polynomial hash confuses; add the sorted letters to the key. C, a string of identical characters, which makes every prefix hash equal. D, a string longer than 2 to the 32 characters, which overflows the length counter.

[think]

The answer is A: a Thue-Morse string and its complement; use a random base and a prime modulus.

Under a power-of-two modulus, the Thue-Morse string of length 1,024, or any longer power of two, and its complement hash the same for every odd base. A random base chosen at run time, with a prime modulus such as 2 to the 61 minus 1, makes such a collision vanishingly unlikely. Anagrams do not collide, because position matters, and repeated characters give distinct prefix hashes.
