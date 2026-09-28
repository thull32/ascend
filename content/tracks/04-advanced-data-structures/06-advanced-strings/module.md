---
slug: advanced-strings
title: Advanced string algorithms
description: Aho-Corasick, suffix arrays with LCP, and Manacher's algorithm, the three linear-time string structures behind intrusion detection, full-text search and genome alignment, each built by hand with its failure links, ranks and radii traced and its production engines opened up.
prerequisites: [data-structures/tries-and-string-structures]
---
Single-pattern matching with KMP or Rabin-Karp gets you through most interviews. Production string work is rarely single-pattern: a WAF matches a request against ten thousand signatures at once, a search engine needs every occurrence of every query term across a corpus it indexed once, and a genome aligner looks up billions of short reads in a three-billion-character reference. Each of those has a structure that does the job in time linear in the input, and each is a small extension of something you already know.

Aho-Corasick is a trie with KMP's failure function grafted on, and it matches any number of patterns in one pass over the text; you will build its failure and dictionary links by hand with the BFS traced, compute the memory of its full-DFA form, and see what the Rust `aho-corasick` crate, Snort, Suricata, Hyperscan and ClamAV change. A suffix array is the sorted list of a string's suffixes, which turns substring search into binary search and, with the LCP array, answers "longest repeated substring" and "how many distinct substrings" directly; prefix doubling and Kasai's algorithm are traced round by round, and the FM-index arithmetic explains why genome aligners fit a human genome in a few gigabytes. Manacher's algorithm finds every palindrome in linear time by reusing work across mirrored centres, traced position by position, and it is the reason the naive expand-around-centre solution is only *usually* good enough; the lesson also covers what UTF-16 and combining characters do to a naive palindrome check.

Each lesson builds the structure by hand with traced examples, catalogues its production failure modes, gives you exercises verified in Python and JavaScript, and says plainly when the simpler tool is the right interview answer.
