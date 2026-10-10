---
review: tries-and-string-structures
source: 2e64d6c8e5f70154
---
## Introduction

Twelve questions from the tries and string structures module. Answer out loud before the answer comes.

They run through the module in order: four on tries, four on string matching, and four on suffix arrays and their relatives. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A trie contains the word "cart" and nothing else. What do search for "car" and starts with "car" return?

A, false, then true. B, true, then false. C, false and false. D, true and true.

[think]

The answer is A: search is false and starts with is true.

The path c, a, r exists, because it is a prefix of cart. But the node it reaches is not marked terminal, so search says false, while the prefix check only needs the node to exist. Confusing the two is the canonical trie bug.

## Question 2

Why is a plain trie, with an array of 26 child pointers in every node, usually larger than a hash set of the same words?

A, hash sets compress their keys into one shared buffer, so they use less than the raw text. B, shared prefixes are copied at every branch point, so popular prefixes end up stored many times. C, most nodes have one child, so about 25 of the 26 pointers sit empty, and there is a node per character. D, each node also stores the full key string, so every word is duplicated along its path.

[think]

The answer is C: most nodes have a single child, and each still pays for 26 pointers.

Prefix sharing saves a little near the root, but most nodes sit near the leaves with one child each, 58 percent of them in the measured corpus, and every one pays for a full 208-byte pointer array. Nothing is duplicated: a trie stores each shared prefix exactly once, which is why the intuition that it saves memory is so tempting. Compact child vectors and path compression win the memory back.

## Question 3

You delete the word "cat" from a trie that also holds "car" and "cart". What must the deletion do?

A, unmark the terminal flag only, leaving all the nodes in place for later reuse. B, remove every node on the path c, a, t, since the key is no longer present. C, unmark the terminal, then on the way back up remove only nodes that are childless and non-terminal. D, rebuild the trie from the remaining keys, since deleting in place is unsafe.

[think]

The answer is C: unmark, then unwind only the childless, non-terminal nodes.

After unmarking, the t under a is childless and non-terminal, so it goes. The a and the c are shared with car and cart, so the unwinding stops there. Removing the whole path corrupts the shared keys, and clearing only the flag leaks a node for every deleted key.

## Question 4

You need all keys with a given prefix, over a static set of 10 million short strings, with minimal memory, in Rust. What is the pragmatic choice?

A, a hand-written trie with a hash map of children in every node, walking to the prefix and enumerating below it. B, a hash set of the keys, scanning every key and testing whether it starts with the prefix. C, a min-heap of the keys, popping in order until a key no longer starts with the prefix. D, a sorted vector or an ordered B-tree map, range-scanning from the prefix until keys stop matching.

[think]

The answer is D: sorted storage with a range scan.

Sorted storage finds the prefix with a binary search and then reads forward, order L log n plus the output, with almost no overhead per key. A trie saves the log factor but costs far more memory, especially with a hash map in every node. For a static set the log factor is a bargain, and a double-array or finite state transducer build is the next step only if it matters.

## Question 5

On which input does the naive string search do its worst-case work, proportional to n times m?

A, random text over a small alphabet, and a random pattern. B, text of all a's, and a pattern of a's ending in a b. C, a pattern whose first character never appears in the text. D, text of all a's, and a pattern of b's ending in an a.

[think]

The answer is B: all a's against a's ending in b.

Every alignment matches m minus 1 characters before failing on the final b, so each of the n alignments costs about m. Swap the letters, b's ending in an a, and every alignment fails on the first character, which is linear. Random inputs also fail almost immediately, and so does a pattern whose first character never appears.

## Question 6

The KMP inner loop can run several times for a single text character. Why is the whole search still linear, n plus m?

A, the failure table is precomputed, so each fall-back step is a single constant-time lookup. B, the matched count j grows at most once per text character, and every inner iteration makes j smaller. C, the inner loop runs only on a mismatch, and every mismatch moves the text index forward. D, mismatches after a partial match are rare, so the fall-back chain is short on average.

[think]

The answer is B: j grows at most once per character and every fall-back shrinks it.

It is an amortised argument. j rises by at most one per text character, every inner iteration strictly lowers it, and it never goes below zero, so there are at most n fall-backs in total. A precomputed table makes each step cheap but says nothing about how many steps there are, and the bound is a worst case, not a claim about typical input.

## Question 7

A Rabin-Karp implementation reports a match whenever a window's hash equals the pattern's hash, with no character comparison. What is the consequence?

A, missed matches when the rolling update wraps around the modulus. B, false positives whenever two different windows collide on the hash. C, missed matches wherever two occurrences of the pattern overlap. D, nothing, because a hash modulo a large prime is unique for each window.

[think]

The answer is B: false positives on collisions.

A hash maps a large space into a small one, so collisions exist, and with a fixed base and modulus an adversary can build colliding windows on purpose. The rolling update is exact, so a true occurrence always hashes equal and is never missed; the error is only ever a false positive. Verify on a hash match, or use a random base and a large prime modulus and accept a stated error rate.

## Question 8

Python's find, glibc's memmem and Rust's find do not use KMP. What do they use, and why?

A, Horspool-style skipping and the Two-Way algorithm: faster than linear on typical text, with a linear worst case. B, suffix arrays built over the text, which answer each query in m log n time. C, Rabin-Karp rolling hashes, which scan at memory bandwidth with constant extra space. D, naive search with a SIMD scan for the first byte: fast on typical text, but n times m in the worst case.

[think]

The answer is A: skip-based search and Two-Way.

KMP looks at every text character. Skip-based algorithms jump over most of the text on large alphabets, and Two-Way gives the linear worst-case guarantee with constant extra memory. Naive with a first-byte scan is Java's indexOf, and Rabin-Karp is Go's fallback, but these three libraries chose Two-Way precisely to avoid the naive worst case. KMP's value is its guarantee and its failure function, not raw speed.

## Question 9

Why does a suffix trie of a text of length n have a number of nodes that grows with n squared, while its suffix tree grows only linearly?

A, edge labels are stored as start and end positions, so each node costs constant space instead of order n. B, single-child chains merge into labelled edges, so every internal node branches. C, Ukkonen's algorithm adds each suffix in constant time, so only a linear number of nodes is ever created. D, the tree stores only the n suffixes, while the trie also stores every substring.

[think]

The answer is B: path compression leaves only branching nodes.

A trie has one node per distinct substring, up to about n squared over two, even though only n suffixes went in, because every substring is a prefix of some suffix and appears on its path. Compression removes every non-branching node, and a tree with n leaves whose internal nodes all branch has fewer than 2n nodes. The compact edge labels keep each edge small, but they do not change how many nodes there are.

## Question 10

The LCP array of a text has a maximum value of 7. What does that tell you?

A, the text contains 7 distinct substrings that each occur twice. B, the longest substring occurring at least twice has length 7. C, the two longest suffixes of the text share their first 7 characters. D, the text is periodic, repeating one block of length 7 throughout.

[think]

The answer is B: the longest repeated substring has length 7.

Any repeated substring is a common prefix of two suffixes, and the two suffixes sharing the longest prefix sit next to each other in sorted order. The LCP array records exactly those neighbour overlaps. It compares neighbours in sorted order, not the longest suffixes, and one repeat of length 7 says nothing about the whole text being periodic.

## Question 11

Kasai's algorithm computes all n LCP values in linear time, even though a single comparison may be long. What is the key invariant?

A, if suffix i shares h characters with its predecessor, then suffix i plus 1 shares at least h minus 1 with its own predecessor. B, processing suffixes in sorted order lets each comparison start from the previous entry's value. C, adjacent suffixes in sorted order always share a first character, so each scan starts at 1. D, LCP values never increase along the suffix array, so each new scan can stop at the previous value.

[think]

The answer is A: drop one character and at least h minus 1 still match.

Remove the first character from both suffixes of a matching pair, and what remains still matches for h minus 1 characters and is still in order, so the true predecessor of the shorter suffix matches at least that much. That is why Kasai works in text order, not sorted order; neighbours in the sorted array have no such relationship. h drops by at most one per step, so its total rises are bounded by 2n.

## Question 12

A team wants substring search over a repository that receives hundreds of commits an hour. Why is a suffix array over the whole repository a poor fit?

A, its queries cost order n each, because every search must scan the whole array. B, its memory is 40 to 80 bytes per character, which is too much for a large repository. C, it cannot index binary files, which most repositories contain in large numbers. D, it indexes a static text, so every commit forces a rebuild of the whole array.

[think]

The answer is D: it indexes a static text, so every change means a rebuild.

Construction is linear or close to it, but it must be redone for every change, and that cannot keep up with a busy repository. Trigram indexes update per document and shard across machines, which is why code search engines use them. Queries are not the problem, binary search is order m log n, and 40 to 80 bytes a character is the suffix tree's cost; the array needs 4 to 8.

## Recap

Three ideas kept coming back. A structure is only as good as the question it answers: a trie for prefixes, a hash set for membership, sorted storage when memory is tight, a suffix array when the text is fixed. Guarantees come from amortised arguments, like KMP's matched count that can only fall as often as it rose, and Kasai's carried value. And hashes and flags lie unless you check them: verify every rolling-hash match, and never confuse a path existing with a key existing.
