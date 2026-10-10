---
lesson: suffix-arrays-and-lcp
source: 03de163d2727b722
fit: partial
desk:
  - "The sorted suffixes of banana, and the two binary searches traced probe by probe"
  - "Prefix doubling on banana round by round, and the code"
  - "Kasai's walk on banana with the running h, and the code"
  - "LCP intervals and range-minimum over LCP, worked on banana"
  - "The FM-index memory table and the structure comparison table"
  - "Exercises: build a suffix array, and build the LCP array with Kasai's algorithm"
---
## Introduction

The previous lesson preprocessed the patterns. Flip the problem. The text is fixed and enormous, a 3.1-billion-base genome or every document your company has ever stored, and the queries arrive forever. You want to spend n log n once on the text, then answer "where does this pattern occur" in time that depends on the pattern's length, not the text's.

A suffix tree can do that, but it costs several times the memory of what follows, three to five times by Manber and Myers' account, and it is fiddly to build. A suffix array is the same information flattened into n integers, built with a sort and queried with binary search. Add the LCP array, the longest common prefix between neighbours in sorted order, and you recover nearly everything the tree could do.

Four ideas. The invariant that makes the search work. Prefix doubling, which builds the array without comparing whole suffixes. Kasai's "h minus one" argument, which builds LCP in linear time. And the FM-index arithmetic that lets a genome aligner fit on a laptop. Then why search engines use none of it.

## The invariant

Take banana. Its six suffixes are banana, anana, nana, ana, na and a. Sort them: a, ana, anana, banana, na, nana. Now write down where each one starts in the original string, in that sorted order: 5, 3, 1, 0, 4, 2. That list of six integers is the whole structure.

The invariant: every substring is a prefix of some suffix, so the occurrences of a pattern are exactly the suffixes that start with it, and those sort next to each other. Occurrences always form one contiguous block. The pattern ana appears as the second and third sorted suffixes, starting at positions 3 and 1, which are exactly its two occurrences in banana.

Notice one ordering rule. The suffix a sorts before ana, because a string that is a proper prefix of another is the smaller one. Every sentinel bug in this family is a violation of that rule.

To find the block, run two binary searches: one for the first suffix that is at least the pattern, and one for the first that is greater, comparing only as many characters as the pattern has. Each comparison costs the pattern length, so a query costs the pattern length times log n. For a billion characters that is about 30 probes per search. Each probe reads the array, then jumps to a random place in the text: two cache misses, roughly 120 for the whole query.

The trap here is comparing the whole suffix instead of the pattern's length of it. On repetitive text, like a log full of long repeats, every probe becomes linear in n.

## Prefix doubling

Sorting suffixes with an ordinary comparison sort takes n log n comparisons, and each can read up to n characters: n squared log n. On a genome, that is a heat death.

Prefix doubling sorts the suffixes by their first one character, then two, then four, then eight, reusing the previous round's ranks so that every comparison is constant time. The key fact: the first 2k characters of suffix i are the first k characters of suffix i, followed by the first k characters of the suffix k positions later. Both ranks are already known from the last round. So the sort key is a pair: my own rank, and the rank of the suffix k further on, with minus one for a suffix that runs off the end, so shorter suffixes sort first. That minus one is the prefix rule again.

On banana: after the first round of pairs, anana and ana still tie, since both begin "an". In the next round, each looks two characters further on. ana continues with the suffix a, which ranks first. anana continues with ana, which ranks after it. So ana sorts before anana, every rank is now distinct, and the loop stops. Two rounds.

The number of rounds is about the log of the longest repeated substring, not the log of n, because two suffixes stay tied only while the compared prefix fits inside what they share. Random text over four letters, a hundred thousand characters long, needs 5 rounds. A hundred thousand copies of one letter needs 17. With a comparison sort each round, the worst case is n log squared n; a radix sort on the pairs makes the whole build n log n.

Libraries ship a linear-time construction, SA-IS, from 2009. It sorts a reduced problem of at most half the size recursively, then induces the order of every other suffix in two linear scans. It is thirty to sixty lines of subtle index arithmetic. Prefix doubling is what you should be able to write from memory; SA-IS is what you should be able to name.

## Kasai and the LCP array

The LCP array stores, for each sorted position, the length of the longest common prefix with the suffix just before it. For banana it reads 0, 1, 3, 0, 0, 2. ana shares one character with a. anana shares three, ana, with ana. nana shares two, na, with na.

Computing each entry directly is quadratic overall. Kasai's algorithm, from 2001, makes it linear with one observation. If suffix i shares h characters with its predecessor in sorted order, then suffix i plus one shares at least h minus one with its own predecessor. Drop the first character of both strings and a common prefix of h minus one survives, and the true predecessor is at least that close.

So walk the suffixes in text order, not sorted order, carry a running h, and start each comparison at h instead of at zero. h rises at most n times in total and falls by at most one per step, so the total work is linear.

Hear it on banana. anana's predecessor is ana, and they share 3. Next in text order comes nana, which by the observation shares at least 2 with its predecessor, na. So you start comparing at offset 2, find that na has already ended, and you are done without matching a single new character. Next, ana against a: start at offset 1, a has ended, the answer is 1. All six entries cost eight character comparisons.

## What LCP unlocks

Four answers fall out of the two arrays.

The longest repeated substring is simply the maximum LCP entry: 3 for banana, which is ana, and 4 for mississippi, which is issi. The two occurrences of a repeat sort next to each other because they share a long prefix, so the largest neighbour overlap finds it in linear time after the build.

The number of distinct substrings is n times n plus one, over two, minus the sum of the LCP array. Each suffix contributes all its prefixes, minus the ones it shares with its sorted predecessor, which were already counted. banana has 21 prefixes across its suffixes, 6 of them shared, so 15 distinct substrings.

The longest common substring of two strings: join them with a separator that appears in neither, build both arrays, and take the largest LCP between neighbours that come from different sides of the separator. If the separator appears in an input, or one separator is reused for several strings, you get a "common" substring that runs across the join.

And the LCP of any two suffixes, not only neighbours, is the minimum of the LCP entries between them. That is a static range-minimum query, which the sparse table from the range-queries module answers in constant time. The runs of the LCP array, called LCP intervals, are the suffix tree's internal nodes in disguise, and one stack pass enumerates every repeat without building a tree.

## Genomes yes, search engines no

Short-read aligners ask "where does this read of 100 to 150 bases occur" against a 3.1-billion-base human reference, hundreds of millions of times per run. Do the arithmetic. The text at 2 bits per base is 0.78 gigabytes. A suffix array at 4 bytes an entry is 12.4 gigabytes, and 4-byte entries only work below about 4 billion positions; at 5 bytes, 15.5 gigabytes. Add an LCP array and you are near 25.

The FM-index keeps three small things instead. The Burrows-Wheeler transform, which records the character just before each sorted suffix, so it is the suffix array read sideways, at 2 bits per base. Occurrence counts every 128 bases. And every 32nd suffix-array entry. For the human genome, each of those is under a gigabyte.

Search runs backward through the pattern, from its last character, keeping the range of sorted suffixes that begin with what has been read so far, one constant-time step per character. Counting occurrences costs the pattern length and never touches the text. Locating each occurrence walks backward until it reaches a sampled entry: at most 31 steps, about 16 on average. So a query with a million occurrences pays that walk a million times. BWA samples every 32nd entry and counts every 128 bases, and Bowtie's offrate setting is the same dial. A human-genome aligner runs in a few gigabytes, against 12 to 16 for the suffix array alone.

Lucene and Elasticsearch use none of this. Their terms index is a finite-state transducer over tokens, which is what users type, and their posting lists update per document and shard by document. A suffix array does neither: it is static. For substring search over many changing documents, Elasticsearch's wildcard field, Google Code Search and Zoekt share one design: n-gram posting lists to find candidates, then verification.

In production, do not write your own: libsais, libdivsufsort and sdsl-lite exist. Watch three traps. 32-bit positions wrap once a concatenated corpus passes about 2.1 gigabytes. C++ or Java code that packs the pair key into one 32-bit integer overflows at about 46 thousand characters. And a Python list of integers costs 36 bytes per entry against 4 in an int32 array, so a 100-megabyte text becomes 3.6 gigabytes instead of 400 megabytes.

## In the interview

You will not build SA-IS on a whiteboard. You may be asked to write the suffix array and LCP of a short string by hand, write prefix doubling with a tuple sort, write Kasai and explain h minus one, and use the maximum LCP for the longest repeat. The senior move is choosing by the shape of the workload: Aho-Corasick for many patterns and one text, a suffix array for one text and many queries, an inverted index for word queries over many documents.

A follow-up the lesson expects. Your service does substring search over user documents that change hourly. Suffix array?

[pause]

No. The structure is static, and rebuilding it hourly over a concatenated corpus is a multi-gigabyte job. Use an n-gram or trigram index, which updates per document and verifies candidates, or the search engine's wildcard field, and keep suffix arrays for fixed reference texts. The wrong answer is incremental suffix-array updates, which exist in research but not in any library you would ship.

And another. Find the longest duplicate substring of a hundred-thousand-character string. Your rolling-hash solution can collide. Make it exact.

[pause]

Suffix array plus LCP, and the answer is the maximum LCP entry: exact by construction. Or keep the binary search with hashing and verify each candidate by direct comparison. The wrong answer is "use a 64-bit hash, so collisions are negligible", which offers a probabilistic argument where an exact one was asked for.

## Recap

Five things. All occurrences of a pattern form one contiguous block of the suffix array, found by two binary searches that compare only the pattern's length. Prefix doubling sorts by a pair of ranks, and needs about as many rounds as the log of the longest repeat. Kasai's algorithm is linear because the LCP drops by at most one from each suffix to the next in text order. The LCP array gives the longest repeat, the count of distinct substrings and the longest common substring. And the FM-index fits a human genome in a few gigabytes, while changing documents belong in an n-gram index, not a suffix array.

At your desk: the sorted suffixes and binary-search probes, the doubling and Kasai traces on banana, the LCP intervals, the memory and comparison tables, and the two exercises.
