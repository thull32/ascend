---
lesson: aho-corasick
source: 6a972104c551446e
---
## 1

In Aho-Corasick, what does the failure link of a trie node u point to?

A, the node for the longest pattern that is a proper prefix of u's string. B, the root, so every mismatch restarts matching from the empty string. C, the parent of u, so a mismatch backs off by exactly one character. D, the node for u's longest proper suffix that is also in the trie.

[think]

The answer is D: the node for u's longest proper suffix that is also in the trie.

It is KMP's failure function, applied across all the patterns at once. After a mismatch, it gives the automaton the deepest state consistent with the text read so far, so no text character is read twice. Always failing to the root would throw away a suffix that may still be part of a match.

## 2

Why is the Aho-Corasick search loop linear in the text plus the number of matches, despite the nested loop over failure links?

A, depth rises by at most 1 per character, and each failure step lowers it. B, failure targets are cached, so each node's chain is walked only once. C, the inner loop runs at most once for each character of the text. D, the trie's depth is bounded, so each failure chain has constant length.

[think]

The answer is A: depth rises by at most 1 per character, and each failure step lowers it.

Depth starts at 0, rises by at most one per character, and every failure step strictly lowers it, so the failure steps are bounded by the total rise: the text's length. The inner loop can run many times for one character, but not many times overall. Bounding by the trie's depth gives only the text length times the longest pattern.

## 3

The patterns are a b c d, b c, and c, and the text is a b c d. An implementation that reports only at the node it lands on finds a b c d alone. What is missing?

A, dictionary links: the failure chain from a b c reaches the patterns b c and c. B, overlap support: after a match, the search jumps past the matched text. C, a second pass with the patterns reversed, to catch suffix matches. D, failure links from leaf nodes such as a b c d, which the breadth-first build skips.

[think]

The answer is A: dictionary links, since the failure chain from a b c reaches b c and c.

The node for a b c is not itself a pattern end, but its failure link is the node b c, a pattern, whose failure link is c, also a pattern, and both end at the same text position. A dictionary link per node, or output lists merged along failure links at build time, reports both, at constant cost per match. The automaton never skips text, so overlap is not the issue.

## 4

A full-table Aho-Corasick automaton has 500 thousand states, a 256-byte alphabet, and 4-byte state ids. About how much memory does it need, and what is the first lever to pull?

A, about 500 megabytes; shrink the alphabet with byte classes. B, about 50 megabytes; switch to 2-byte state ids to halve it. C, about 5 gigabytes; shard the text and run several automata. D, about 2 megabytes; nothing, the table is already small.

[think]

The answer is A: about 500 megabytes; shrink the alphabet with byte classes.

500 thousand states, times 256 columns, times 4 bytes, is 512 million bytes. Byte classes merge columns that behave identically, since bytes that appear in no pattern share one class, often cutting 256 columns to between 30 and 60, a five to eight times saving. 2-byte ids save at most half, and stop working past 65,535 states. Sharding the text does not shrink the automaton.

## 5

You build a profanity filter with the standard, all-matches automaton, over the patterns "she" and "he", and replace each match with asterisks. What happens on the word "ushers", and what is the fix?

A, nothing is reported, since u is not in the trie; strip unknown bytes first. B, the search loops forever on the failure links; add the root guard. C, both "she" and the nested "he" are reported; build with leftmost-first semantics. D, only "she" is reported, since "he" is nested inside it; add dictionary links.

[think]

The answer is C: both "she" and the nested "he" are reported; build with leftmost-first semantics.

Standard semantics report every match, including "he" nested inside "she", so two replacements land on overlapping ranges, and the result depends on the order they are applied. Leftmost-first semantics report "she" and resume after it. Dictionary links are what makes "he" appear in the first place, and unknown bytes are handled by staying at the root.

## 6

Signatures are being missed exactly when they straddle two TCP segments. Which fix keeps the scan linear, and avoids re-reading bytes?

A, rebuild the automaton per flow, with the segment boundary as a pattern. B, carry the automaton state from the end of one segment into the next. C, re-scan the last pattern-length of bytes from the previous segment. D, buffer the whole flow, and scan it once the connection closes.

[think]

The answer is B: carry the automaton state from one segment into the next.

The current state already summarises the longest pattern prefix that ends the text seen so far, which is exactly what a straddling match needs, and keeping it per flow costs one integer. Re-scanning a tail works, but re-reads bytes and duplicates reports unless deduplicated. Buffering whole flows destroys the streaming property that made Aho-Corasick attractive.
