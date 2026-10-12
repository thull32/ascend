---
lesson: prefix-sums-and-hashing-tricks
source: 648dd7cd4643c391
---
## 1

Why does the counting template seed its map with one occurrence of the prefix sum zero, before the loop?

A, it is the empty prefix, the partner for every subarray that starts at index 0. B, it handles negative numbers, whose prefix sums can come back down to zero. C, it prevents a key error on the first lookup, before any prefix is inserted. D, it makes k equal to 0 work, since a zero-sum subarray needs a zero prefix.

[think]

The answer is A: it is the empty prefix, the partner for every subarray starting at index 0.

A subarray from the start to j corresponds to the pair of prefixes 0 and j. Without the empty prefix in the map, no subarray starting at index 0 is ever counted, whatever k is. It has nothing to do with key errors, since the template uses a default dictionary, and it is needed with or without negatives.

## 2

You need the number of subarrays with a sum of at least k, in an array with negatives. Why does the hash-map template not apply directly?

A, it does apply; look up the prefix minus k, and the stored count covers larger sums too. B, the answer can be quadratic, more than one lookup per index can count. C, it is an inequality, and a hash map cannot count keys below a threshold. D, negative prefix sums cannot be hash-map keys without an offset.

[think]

The answer is C: it is an inequality, and a hash map cannot count keys below a threshold.

The condition asks how many stored prefixes are at most the current prefix minus k, and a hash map only answers exact-key lookups. Counting below a threshold needs order: a Fenwick tree over compressed prefix values, or a merge-sort count, gives n log n. Looking up the prefix minus k only counts sums of exactly k. Negative keys are fine, and each lookup returns a count, so large answers are no problem.

## 3

In JavaScript, you index a counts array by each prefix sum modulo k, where the prefix sums can go negative, and you do not normalise. What goes wrong?

A, residues minus 2 and 3 land in different slots, so the count comes out low. B, it over-counts, since residues minus 2 and 3 are merged into one slot. C, the program throws a range error as soon as it indexes the array at minus 2. D, nothing; JavaScript's remainder is always between 0 and k.

[think]

The answer is A: residues minus 2 and 3 land in different slots, so the count comes out low.

JavaScript's remainder takes the sign of the dividend, so minus 2 and 3, the same class modulo 5, land in different slots, or at a negative index, which does not throw, and their matches are silently missed. The fix adds k and takes the remainder again. Tests without negatives still pass, which is why this bug survives into interviews.

## 4

For "the longest substring where every vowel appears an even number of times", what should the map store for each 5-bit parity mask?

A, the longest length seen so far with that mask. B, the first index at which the mask occurred. C, the number of times the mask occurred. D, the last index at which the mask occurred.

[think]

The answer is B: the first index at which the mask occurred.

Two equal masks bound a valid substring. For the longest one ending at j, you want the earliest matching start, so you store the first index and never overwrite it. Counts are for counting, last indices are for the shortest, and a stored length loses the start position that future matches need.

## 5

Why does Product of Array Except Self use prefix and suffix products, instead of the total product divided by each element?

A, dividing out each element is linear per element, so the total becomes quadratic. B, division is slow on most CPUs, and n divisions would dominate. C, the total product overflows, while prefix and suffix products stay small. D, zero has no multiplicative inverse, so a single zero breaks the division.

[think]

The answer is D: zero has no multiplicative inverse, so a single zero breaks the division.

The prefix difference trick needs an inverse, and dividing out an element fails exactly when that element is zero. Prefix and suffix products compute each answer without undoing anything. Speed is not the issue, since it is one product and then n constant-time divisions, and prefix products can grow as large as the total.

## 6

A C plus plus solution uses an unordered map from 64-bit integers over prefix sums. It passes every test except one where all the values are multiples of the map's bucket count, and on that one it times out. What happened?

A, integers hash to themselves, so every prefix sum landed in one bucket, and each lookup became a linear scan. B, the prefix sums overflowed, so the map kept growing with wrapped-around keys. C, the unordered map costs log n per operation, and that test is just the largest. D, the bucket count is prime, so multiples of it are rejected and reinserted on every access.

[think]

The answer is A: integers hash to themselves, so every key landed in one bucket.

libstdc++ hashes an integer to its own value and picks the bucket modulo a prime bucket count, so keys that are all multiples of that prime share one bucket. Every insert and lookup walks the whole chain, and n operations cost n squared. Overflow would change the keys, not the speed, and the map is constant time expected. A randomised hash, or a mixer that scrambles the bits, is the fix.
