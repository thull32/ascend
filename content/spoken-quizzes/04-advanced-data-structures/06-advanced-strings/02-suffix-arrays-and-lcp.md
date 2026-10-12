---
lesson: suffix-arrays-and-lcp
source: 29ebd56843c12de5
---
## 1

Why do all the occurrences of a pattern p appear as one contiguous block in the suffix array?

A, they do not; occurrences sit wherever their start positions fall. B, the array is built by scanning left to right, so matches come in order. C, each occurrence is a suffix that starts with p, and those sort together. D, the LCP array links suffixes with equal prefixes, and groups them.

[think]

The answer is C: each occurrence is a suffix starting with p, and those sort together.

Lexicographic order sorts by prefix first, so all suffixes beginning with p sit together, between the first suffix at or above p and the first suffix above p. Two binary searches find the block. The array is in sorted order, not text order, which is exactly why the start positions do not scatter it.

## 2

In prefix doubling, once suffixes are ranked by their first 4 characters, which key sorts them by their first 8?

A, the rank of suffix i, paired with the rank of suffix i plus 4, with minus 1 past the end. B, the rank of suffix i, paired with the rank of suffix i plus 8. C, the first 8 characters of suffix i, compared directly. D, the rank of suffix i, paired with the rank of suffix i plus 1.

[think]

The answer is A: the rank of suffix i, paired with the rank of suffix i plus 4.

The first 8 characters of suffix i are its first 4, followed by the first 4 of suffix i plus 4. Both ranks are known from the previous round, so each comparison is constant time. Using i plus 8 would skip characters 5 to 8, and comparing characters directly would cost linear time per comparison.

## 3

Kasai's algorithm computes the LCP array in linear time. What is the key observation?

A, each LCP is a range minimum of earlier ones, found with a sparse table. B, if suffix i has an LCP of h, then suffix i plus 1 has an LCP of at least h minus 1. C, suffixes adjacent in the text have equal LCPs with their predecessors. D, LCP values never decrease along the array, so h never resets.

[think]

The answer is B: if suffix i has an LCP of h, suffix i plus 1 has at least h minus 1.

Dropping the first character keeps a shared prefix of length h minus 1 with the same neighbour, and the true predecessor of suffix i plus 1 shares at least that much, so the comparison resumes from h minus 1. The running h rises at most n times, and falls by at most one per step. Range minimum answers non-adjacent pairs once the array exists; it does not build it.

## 4

For "banana", the suffix array is 5, 3, 1, 0, 4, 2, and the LCP array is 0, 1, 3, 0, 0, 2. How many distinct substrings does "banana" have, and why?

A, 21, because a string of length 6 has 6 times 7 over 2 substrings. B, 9: 15 prefixes in total, minus 6 shared with sorted predecessors. C, 15: 21 prefixes in total, minus 6 shared with sorted predecessors. D, 6, because each suffix contributes exactly one distinct substring.

[think]

The answer is C: 15, which is 21 prefixes minus 6 shared ones.

Each suffix contributes as many substrings as it has prefixes: 6, 5, 4, 3, 2 and 1, which is 21. The LCP value says how many of those it shares with its sorted predecessor, already counted: 0, 1, 3, 0, 0 and 2, which is 6. That leaves 15 distinct substrings.

## 5

You need the longest substring that appears at least twice in a 100 megabyte log. What is the cleanest approach?

A, dynamic programming over all pairs of positions, as in longest common subsequence. B, Aho-Corasick over all substrings, reporting the longest seen twice. C, a hash set of all substrings, keeping the longest that repeats. D, a suffix array plus an LCP array; the answer is the largest LCP entry.

[think]

The answer is D: a suffix array plus an LCP array; the answer is the largest LCP entry.

The two occurrences of the longest repeat are adjacent in sorted suffix order, so the maximum LCP finds it in linear time after a library build. Hashing all substrings takes quadratic space, all-pairs dynamic programming takes quadratic time, and Aho-Corasick needs the patterns up front, and all substrings is a quadratic number of them.

## 6

Why do short-read genome aligners use an FM-index rather than a plain suffix array?

A, it supports inserts, so newly sequenced reads join without a rebuild. B, its Burrows-Wheeler transform plus a sampled array take about half a byte per base, so it fits in memory. C, it builds in linear time, where a suffix array needs n squared log n. D, suffix arrays break on tiny alphabets, where most suffixes tie on rank.

[think]

The answer is B: it takes about half a byte per base, so it fits in memory.

A suffix array needs 4 to 5 bytes per base, 12 to 16 gigabytes for a human genome, before the text. The FM-index keeps the 2-bit transform, occurrence checkpoints and every 32nd suffix-array entry, about 1.6 gigabytes, and still answers pattern queries by backward search in time proportional to the pattern. Build time and alphabet are not the constraints: SA-IS builds a suffix array in linear time on any alphabet.
