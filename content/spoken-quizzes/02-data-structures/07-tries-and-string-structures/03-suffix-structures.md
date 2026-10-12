---
lesson: suffix-structures
source: 08326862489dfb77
---
## 1

Why does a suffix trie of a text of length n have a number of nodes that grows with n squared, while its suffix tree grows only linearly?

A, edge labels are stored as start and end positions, so each node costs constant space instead of order n. B, single-child chains merge into labelled edges, so every internal node branches. C, Ukkonen's algorithm adds each suffix in constant time, so only a linear number of nodes is ever created. D, the tree stores only the n suffixes, while the trie also stores every substring.

[think]

The answer is B: single-child chains merge into labelled edges, so every internal node branches.

A trie has one node per distinct substring, up to about n squared over 2, even though only n suffixes went in, because every substring is a prefix of some suffix and appears on its path. Compression removes every non-branching node, and a tree with n leaves whose internal nodes all branch has fewer than 2 n nodes. The compact edge labels keep each edge small, but they do not change how many nodes there are.

## 2

Prefix doubling sorts the suffixes by pairs: the rank of suffix i, then the rank of suffix i plus k. Why does that correctly order their first 2 k characters?

A, the rank of suffix i plus k orders it by its full length, so it settles every remaining tie. B, it does not: a final pass comparing the full suffixes is needed to break the last ties. C, suffix i's first 2 k characters are its first k, followed by the first k of suffix i plus k. D, ranks are unique after the first round, so later pairs never need a tie-break.

[think]

The answer is C: suffix i's first 2 k characters are its first k, followed by the first k of suffix i plus k.

Ordering the concatenation of two blocks is the same as ordering the pair of the blocks' ranks, provided each rank encodes order on exactly k characters, which the previous round guarantees. The rank of suffix i plus k reflects only its first k characters, not its full length, which is why ties can survive a round, and more rounds run until every rank is distinct.

## 3

The LCP array of a text has a maximum value of 7. What does that tell you?

A, the text contains 7 distinct substrings that each occur twice. B, the longest substring occurring at least twice has length 7. C, the two longest suffixes of the text share their first 7 characters. D, the text is periodic, repeating one block of length 7 throughout.

[think]

The answer is B: the longest substring occurring at least twice has length 7.

Any repeated substring is a common prefix of two suffixes, and the two suffixes sharing the longest prefix sit next to each other in sorted order. The LCP array records exactly those neighbour overlaps. It compares neighbours in sorted order, not the longest suffixes, and one repeat of length 7 says nothing about the whole text being periodic.

## 4

Kasai's algorithm computes all n LCP values in linear time, even though a single comparison may be long. What is the key invariant?

A, if suffix i shares h characters with its predecessor, then suffix i plus 1 shares at least h minus 1 with its own. B, processing suffixes in sorted order lets each comparison start from the previous entry's value. C, adjacent suffixes in sorted order always share a first character, so each scan starts at 1. D, LCP values never increase along the suffix array, so each new scan can stop at the previous value.

[think]

The answer is A: if suffix i shares h characters with its predecessor, then suffix i plus 1 shares at least h minus 1 with its own.

Remove the first character from both suffixes of a matching pair, and what remains still matches for h minus 1 characters and is still in order, so the true predecessor of suffix i plus 1 matches at least that much. That is why Kasai works in text order, not sorted order; neighbours in the sorted array have no such relationship. H drops by at most one per step, so its total rises are bounded by 2 n.

## 5

Backward search on the Burrows-Wheeler transform of banana, with its end marker, looks for the pattern a, n, a. The range of rows narrows from rows 1 up to 4, to rows 5 up to 7, to rows 2 up to 4, each range excluding its end. What does the final range mean?

A, the pattern occurs twice, at rows 2 and 3 of the sorted suffixes. B, the pattern's first character sits in rows 2 and 3 of the last column. C, the pattern occurs once, spanning rows 2 through 4. D, the pattern occurs at text positions 2 and 3.

[think]

The answer is A: the pattern occurs twice, at rows 2 and 3 of the sorted suffixes.

Each step prepends one pattern character, using the count table and an occurrence count, and the range is the block of sorted suffixes that start with the pattern processed so far. Its width, 2, is the number of occurrences. Turning rows into text positions needs the sampled suffix array, which here gives positions 3 and 1.

## 6

A team wants substring search over a repository that receives hundreds of commits an hour. Why is a suffix array over the whole repository a poor fit?

A, its queries cost order n each, because every search must scan the whole array. B, its memory is 40 to 80 bytes per character, which is too much for a large repository. C, it cannot index binary files, which most repositories contain in large numbers. D, it indexes a static text, so every commit forces a rebuild of the whole array.

[think]

The answer is D: it indexes a static text, so every commit forces a rebuild of the whole array.

Construction is linear or n log n, but it must be redone for every change, and that cannot keep up with a busy repository. Trigram indexes update per document and shard across machines, which is why code search engines use them. Queries are not the problem, since binary search costs m log n, and 40 to 80 bytes a character is the suffix tree's cost; the array needs 4 to 8.
