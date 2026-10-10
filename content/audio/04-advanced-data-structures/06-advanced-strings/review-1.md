---
review: advanced-strings
source: 3ced7dc5a66b5616
---
## Introduction

Twelve questions from the advanced-strings module: four on Aho-Corasick, four on suffix arrays, four on Manacher's algorithm. Each has four options. Answer out loud before the answer comes.

## Question 1

What does the failure link of a trie node point to?

A, the node for the longest pattern that is a proper prefix of the node's string. B, the root, so every mismatch restarts matching from the empty string. C, the node's parent, so a mismatch backs off by exactly one character. D, the node for the longest proper suffix of the node's string that is also in the trie.

[think]

The answer is D: the longest proper suffix that is also in the trie. It is exactly KMP's failure function, applied across all the patterns at once. It tells the automaton the deepest state still consistent with the text read so far after a mismatch, so no text character is read twice. Always failing to the root would throw away a suffix that may still be part of a match.

## Question 2

Aho-Corasick's search is linear in the text length plus the number of matches, even though it has a while loop over failure links inside the loop over the text. Why?

A, depth rises by at most one per character, and each failure step lowers it. B, failure targets are cached, so each node's chain is walked only once. C, the while loop runs at most once for each character of the text. D, the trie's depth is bounded, so each failure chain has constant length.

[think]

The answer is A. Depth starts at zero, rises by at most one per character, and every failure step strictly lowers it, so the failure steps in total are bounded by the total rise, which is the text length. The while loop can run many times for one character, just not many times overall. Bounding it by the trie's depth only gives the text length times the longest pattern.

## Question 3

You build a profanity filter with the standard, all-matches automaton over the words she and he, and replace each match with asterisks. On the text "ushers", what happens, and what is the fix?

A, nothing is reported, because u is not in the trie; strip unknown bytes first. B, the search loops forever on the failure links; add a guard at the root. C, both she and the he nested inside it are reported; build the automaton with leftmost-first semantics. D, only she is reported, because he is nested inside it; add dictionary links.

[think]

The answer is C. Standard semantics report every match, including he at position 2, nested inside she at position 1, so two replacements land on overlapping ranges and the result depends on the order you apply them. Leftmost-first semantics report she and resume after it. Dictionary links are what makes he appear in the first place, and unknown bytes are handled by staying at the root.

## Question 4

An intrusion-detection system misses signatures exactly when they straddle two TCP segments. Which fix keeps the scan linear and avoids reading any byte twice?

A, rebuild the automaton per flow, with the segment boundary as a pattern. B, carry the automaton's state from the end of one segment into the next. C, re-scan the last maximum-pattern-length bytes of the previous segment. D, buffer the whole flow and scan it once the connection closes.

[think]

The answer is B: carry the state across. The current state already summarises the longest pattern prefix that is a suffix of everything seen, which is exactly what a straddling match needs, and keeping it per flow costs one integer. Re-scanning a tail works, but re-reads bytes and duplicates reports unless you deduplicate. Buffering whole flows destroys the streaming property that made Aho-Corasick attractive.

## Question 5

Why do all occurrences of a pattern appear as one contiguous block in the suffix array?

A, they do not; occurrences sit wherever their start positions happen to fall. B, the array is built by scanning left to right, so matches come out in order. C, each occurrence is a suffix that starts with the pattern, and those sort together. D, the LCP array links suffixes with equal prefixes and groups them.

[think]

The answer is C. Lexicographic order sorts by prefix first, so all suffixes that begin with the pattern sit together, bounded by the first suffix at least the pattern and the first suffix greater than it. Two binary searches find the block. The array is in sorted order, not text order, which is exactly why scattered start positions do not scatter the block.

## Question 6

Kasai's algorithm computes the LCP array in linear time. What is the key observation?

A, each LCP value is a range minimum of earlier ones, found with a sparse table. B, if suffix i has LCP h with its sorted predecessor, then suffix i plus one has LCP at least h minus one. C, suffixes that are adjacent in the text have equal LCP with their predecessors. D, LCP values never decrease along the array, so h never has to reset.

[think]

The answer is B: h minus one. Dropping the first character keeps a shared prefix of length h minus one, and the true predecessor of the next suffix shares at least that much, so the comparison resumes from h minus one instead of from zero. The running h rises at most n times and falls by at most one per step. Range minimum over LCP answers non-adjacent pairs once the array exists; it does not build it.

## Question 7

You need the longest substring that appears at least twice in a 100-megabyte log. What is the cleanest approach?

A, dynamic programming over all pairs of positions, as in longest common subsequence. B, Aho-Corasick over all substrings, reporting the longest one seen twice. C, a hash set of all substrings, keeping the longest that repeats. D, a suffix array plus LCP array; the answer is the largest LCP entry.

[think]

The answer is D. The two occurrences of the longest repeat are adjacent in sorted suffix order, so the maximum LCP finds it in linear time after a library build. Hashing every substring is quadratic in space, all-pairs dynamic programming is quadratic in time, and Aho-Corasick needs the patterns up front, where all substrings would be a quadratic number of them.

## Question 8

Why do short-read genome aligners use an FM-index rather than a plain suffix array?

A, it supports inserts, so newly sequenced reads join without a rebuild. B, its Burrows-Wheeler transform plus a sampled suffix array take about half a byte per base, so it fits in memory. C, it builds in linear time, where a suffix array needs n squared log n to build. D, suffix arrays break on tiny alphabets, where most suffixes tie on rank.

[think]

The answer is B: it fits in memory. A suffix array needs 4 to 5 bytes per base, 12 to 16 gigabytes for a human genome before the text itself. The FM-index keeps the 2-bit transform, occurrence checkpoints and every 32nd suffix-array entry, about half a byte per base or 1.6 gigabytes, and the aligners run in a few gigabytes with their working memory. It still answers queries by backward search in time proportional to the pattern. Build time and alphabet are not the constraints: SA-IS builds a suffix array in linear time on any alphabet.

## Question 9

In Manacher's algorithm you are at a position inside the current rightmost palindrome, with centre C and right edge R. The mirror position has radius 5, and the distance from the current position to R is 3. What is the starting radius, and why not 5?

A, 8: the mirror's radius plus the distance to R. B, 3, because the reflection is only known up to R. C, 0, because nothing is known about this position until it expands. D, 5, because the mirror's radius carries over exactly.

[think]

The answer is B: 3. The mirror's palindrome pokes out past the big palindrome's left edge, so its reflection is only guaranteed up to the boundary, at distance 3. Copying 5 would assume characters beyond R match, which nothing has checked. The expansion loop then tests whether it really extends further.

## Question 10

Which input makes expand-around-centre quadratic but leaves Manacher linear?

A, a string with no palindromes longer than one character, such as a, b, c, d, e, f, g, h. B, a long run of one repeated character, such as eight a's. C, one long palindrome of distinct letters, such as a, b, c, d, c, b, a. D, a random string of lowercase letters.

[think]

The answer is B: a run of one character. Every centre in a run of identical characters expands to the nearest edge, so the successful comparisons add up to about n squared over two: 4.9 seconds for twenty thousand characters in CPython. Manacher's mirror step supplies most of each radius for free. A single long palindrome costs expansion only at its one centre, so it stays linear.

## Question 11

A JavaScript function reverses a string and compares it with the original. It reports that a one-character string holding a single emoji is not a palindrome. Why?

A, emoji have no defined ordering, so comparing them is unspecified. B, the reverse step drops non-ASCII characters, so the reversed string is empty. C, the engine normalises the original to NFD but not the reversed copy. D, JavaScript strings are UTF-16 code units, so reversing swaps the emoji's two surrogate halves.

[think]

The answer is D. An emoji occupies two UTF-16 code units, and reversing unit by unit swaps them, producing a different sequence. Iterating by code point, with Array.from or the spread operator, or by grapheme with Intl.Segmenter, fixes it. No normalisation happens on its own, and reversal drops nothing.

## Question 12

In a 45-minute interview you are asked for the longest palindromic substring. What is the strongest opening?

A, the quadratic dynamic-programming table, since it is the textbook answer and easy to verify. B, brute force over all substrings, then optimise once it passes the tests. C, expand-around-centre, stating its quadratic bound and naming Manacher's linear one. D, Manacher straight away, since linear time is what earns the credit.

[think]

The answer is C. The simple correct solution with an honest bound, plus knowledge of the linear alternative, shows judgement. Leading with Manacher risks a sentinel bug under time pressure for no extra credit, and the table uses n squared memory for the same time bound as expansion.

## Recap

Three ideas kept coming back. Linear bounds come from counting a quantity that only moves one way: depth in Aho-Corasick, the running h in Kasai, the right edge R in Manacher. Each structure has a trap that silently gives wrong answers, from unreported nested matches to overlapping replacements to swapped surrogate halves. And the right tool follows the shape of the workload: many patterns and one text, one text and many queries, or a short input where the simple quadratic answer is the strongest opening.
