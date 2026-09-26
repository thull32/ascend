---
slug: advanced-strings
title: Advanced string algorithms
description: Aho-Corasick, suffix arrays with LCP, and Manacher's algorithm, the three linear-time string structures behind intrusion detection, full-text search and genome alignment.
prerequisites: [data-structures/tries-and-string-structures]
---
Single-pattern matching with KMP or Rabin-Karp gets you through most interviews. Production string work is rarely single-pattern: a WAF matches a request against ten thousand signatures at once, a search engine needs every occurrence of every query term across a corpus it indexed once, and a genome aligner looks up billions of short reads in a three-billion-character reference. Each of those has a structure that does the job in time linear in the input, and each is a small extension of something you already know.

Aho-Corasick is a trie with KMP's failure function grafted on, and it matches any number of patterns in one pass over the text. A suffix array is the sorted list of a string's suffixes, which turns substring search into binary search and, with the LCP array, answers "longest repeated substring" and "how many distinct substrings" directly. Manacher's algorithm finds every palindrome in linear time by reusing work across mirrored centres, and it is the reason the naive expand-around-centre solution is only *usually* good enough.

Each lesson builds the structure by hand with traced examples, gives you an exercise verified in Python and JavaScript, and says plainly when the simpler tool is the right interview answer.
