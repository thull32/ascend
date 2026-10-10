---
lesson: suffix-structures
source: 5eb015c5fa02ce7f
fit: partial
desk:
  - "The suffix tree diagram of banana with its terminator, and the suffix array table"
  - "The binary search code and its five-probe trace for ana in banana"
  - "The prefix doubling code and its two rounds traced on banana"
  - "Kasai's LCP code and its trace, especially the carried value in row 2"
  - "The Burrows-Wheeler table of sorted rotations and the backward search arithmetic"
  - "The cost table across suffix trie, tree, array, FM-index and trigram index"
  - "Exercises: build a suffix array, and compute the LCP array with Kasai's algorithm"
---
## Introduction

KMP preprocesses the pattern, so that one pass over the text is linear. That is the right shape when the text keeps changing and the pattern is fixed, like a filter over a log stream. Now flip it. A fixed text, say a genome or a code base, and thousands of different patterns. Every query re-reads the whole text, and a 3-billion-character genome cannot be rescanned for every 20-character read.

So preprocess the text instead. Here is the observation that makes it work: every substring of a text is a prefix of some suffix. Index all n suffixes, and "does this pattern occur?" becomes "does any suffix start with it?", which is a prefix query over a set of strings. The trie lesson already showed what to do with those.

Three ideas. Why the obvious structure, a trie of suffixes, is unaffordable and what replaces it. The suffix array and the LCP array, which together answer almost every whole-text question. And what genomics and code search actually run, which is not quite either.

## Suffix tries and suffix trees

Put every suffix of "banana" into a trie: banana, anana, nana, ana, na, and a. Searching for "nan" walks n, a, n and succeeds. Searching for "nab" fails at b. Any substring query costs the length of the pattern. Perfect, except for size. The trie has one node per distinct substring, up to about n squared over two. For a one-megabyte text that is on the order of 500 billion nodes.

A suffix tree applies the radix-tree trick: merge every single-child chain into one labelled edge. With only n leaves and every internal node branching, it has fewer than 2n nodes. Ukkonen's algorithm builds it in linear time, and it answers substring search, longest repeated substring and longest common substring of two texts, all in linear time.

And it is rarely built. Each node needs a child map, a parent pointer, a suffix link and an edge label, so a straightforward implementation costs 40 to 80 bytes per character of text. For a human genome that is well over 100 gigabytes, and the pointer-chasing construction is hostile to the cache. The suffix array holds the same ordering in 4 to 8 bytes per character.

## The suffix array

Sort all the suffixes and write down their starting positions in that order. That list of integers is the suffix array. The text itself supplies the characters.

For "banana", the sorted suffixes are: a, then ana, then anana, then banana, then na, then nana. Their starting positions, in that order, are 5, 3, 1, 0, 4, 2. Six integers. It is exactly the suffix tree's leaves read from left to right.

Now the search. Every suffix that starts with your pattern sits in one contiguous block of that sorted order, so two binary searches find the block: the first suffix at or after the pattern, and the first one that no longer starts with it. Every entry in the block is an occurrence, and the block's width is the count. Search "ana" and the block is ana and anana, positions 3 and 1. Two occurrences, found in five comparisons.

Each comparison reads at most m characters, so the search is order m log n. One trap lives here. Compare only the first m characters of each suffix, not the whole suffix. On repetitive text, comparing whole suffixes costs order n per probe, and the search crawls.

Building the array has its own trap. The naive build sorts suffixes by slicing them, which in Python materialises every suffix: n squared over two characters, 32 megabytes at 8 thousand characters and about 500 gigabytes at a million. The standard hand-written algorithm is prefix doubling. Sort the suffixes by their first character, then by their first two, then four, then eight. The trick: the first 2k characters of a suffix are its first k characters followed by the first k of the suffix k positions later. So each round sorts pairs of ranks from the previous round, which are small integers.

How many rounds? Before I tell you: is it log n?

[pause]

No, and that is a common mistake. Ranks stay tied as long as suffixes agree, so the number of rounds is set by the longest repeated substring. "Banana" needs 2 rounds; a string of 64 a's needs 6; a genome with long repeats needs many. In production, nobody writes this by hand. Linear-time builds such as SA-IS, in libraries like libsais, are what real code uses.

## The LCP array

The suffix array loses one thing the tree had: the internal nodes, which record how much neighbouring suffixes share. The LCP array gives it back. For each suffix in sorted order, it stores the length of the longest common prefix with the suffix just before it.

For "banana", walk the sorted list. "Ana" shares 1 character with "a". "Anana" shares 3 with "ana". "Nana" shares 2 with "na". Every other neighbour shares nothing. So the values are zero, one, three, zero, zero, two.

Computing each value by direct comparison is quadratic in the worst case. Kasai's algorithm does it in linear time with one fact. If a suffix shares h characters with its predecessor, then the suffix that starts one position later, the same suffix minus its first character, shares at least h minus 1 with its own predecessor. So process suffixes in text order, and each comparison starts from h minus 1 instead of from zero. "Anana" shares 3; drop the first character and "nana" is guaranteed to share at least 2, so its scan starts at 2.

Now what it gives you, with banana's numbers. The longest repeated substring is the maximum LCP value: 3, which is "ana". The number of distinct substrings is n times n plus one over two, minus the sum of the LCP array: 21 minus 6, so 15. The longest common substring of two texts comes from building one array over both, joined by a separator, and taking the largest LCP between neighbours that start on different sides. For banana and bandana, the answer has three characters. And the longest substring that appears at least k times is a sliding-window minimum over the LCP values, which is the monotonic deque from an earlier module.

## The FM-index and what really runs

Sort every rotation of "banana" with an end marker, read off the last column, and you have the Burrows-Wheeler transform: one byte per character, derived straight from the suffix array. It clusters characters that share what follows them, which is why bzip2 applies it to blocks and then compresses the runs.

More importantly, it is an index. Using a small table of character counts, you can search for a pattern backwards, one character at a time, narrowing a range of rows at each step. The range's width at the end is the number of occurrences, found in order m steps without the text and without the full suffix array. The FM-index adds a sampled suffix array, say every 32nd entry, to turn rows back into positions. A human genome's suffix ordering then fits in a few gigabytes, about a byte per base, instead of the 25 gigabytes a 64-bit suffix array would need. Read aligners such as BWA and Bowtie answer "where does this 100-base read occur" in microseconds against it.

Now the honest caveat, which you should say before anyone asks. Suffix structures index a static text. Append one character and, in general, the whole array is rebuilt. That is why code search mostly does not use them. Google Code Search and its descendants, like Zoekt behind Sourcegraph, use trigram indexes: a posting list for every three-character sequence, intersected to find candidate documents, then verified with a regex. Trigram indexes update per document and shard trivially. Suffix arrays win when the text is fixed and the queries are arbitrary substrings with exact counts.

One more number, for Python. A list of a million integers is about 36 megabytes, against 4 for a 32-bit array. So a suffix array of a 100-megabyte text is 3.6 gigabytes as a list and 400 megabytes as an array.

## In the interview

Recognise the shape: a fixed string and many substring questions, or a question about all substrings, like longest repeated, count distinct, or longest common. Say "suffix array plus LCP" and give the complexity of prefix doubling. Then, unless the interviewer wants the construction, use the naive sort and spend your time on the LCP reasoning, because that is where the insight is. Suffix arrays also show up as the follow-up to a hashing answer: your rolling hash could collide, can you make it exact?

A follow-up from the lesson. The corpus receives a thousand edits an hour. Do you build a suffix array?

[pause]

No. Use a trigram or n-gram index with per-document updates, and verify candidates with a regex or an exact search. The wrong answer is "rebuild the array on each edit".

And the scale question: a 3-billion-base genome and millions of short reads. The answer is an FM-index, about a byte per base, with backward search to count in order m and samples to locate. The wrong answer is a suffix tree, which needs well over 100 gigabytes.

## Recap

Four things to remember. Every substring is a prefix of a suffix, so indexing suffixes turns substring search into a prefix search, and that pays when the text is fixed and the queries are many. The suffix tree is linear but costs 40 to 80 bytes a character; the suffix array keeps the same ordering in 4 to 8, and binary search finds a pattern's block in order m log n. The LCP array, built in linear time by Kasai's carried value, answers longest repeat, distinct substrings and longest common substring. And the FM-index gets a genome to about a byte per base, while changing corpora use trigram indexes instead.

At your desk: the suffix tree diagram and the array table, the binary search trace, prefix doubling traced on banana, Kasai's trace, the Burrows-Wheeler table and backward search, the cost table, and the two exercises.
