---
slug: tries-and-string-structures
title: Tries and string structures
description: Prefix trees for autocomplete and routing, the linear-time string matching algorithms behind every search box, and the suffix structures that index a text once and answer substring questions forever.
prerequisites: [data-structures/hashing, data-structures/trees]
---
A hash table treats a string as an opaque blob: hash it, compare it, done. That is the right model for exact lookup and the wrong model for everything else you do with strings: "every key starting with `us-east`", "does this pattern occur in this log", "the longest substring these two documents share". Those questions need structures that know a string is a *sequence* and share work across strings that share characters.

This module covers three such structures, in order of how much of the string they index. A trie indexes prefixes and turns "all keys with this prefix" into a walk down a tree. The string-matching algorithms (KMP, Rabin-Karp, Z) preprocess a pattern so that scanning a text never backs up, which is the difference between O(nm) and O(n + m) and the difference between a search that finishes and one that times out on adversarial input. Suffix arrays and suffix trees index every suffix of a text so that any substring question becomes a binary search or a tree walk.

Each is also a production structure with a real address: tries in IP routers, HTTP routers and autocomplete backends; rolling hashes in rsync and deduplication; suffix arrays in compression and genome alignment. The [advanced strings module](/learn/advanced-data-structures/advanced-strings/aho-corasick) continues with multi-pattern matching and linear-time palindromes.
