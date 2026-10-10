---
lesson: aho-corasick
source: d55a1737438ff6a1
fit: partial
desk:
  - "The trie and finished-automaton tables for he, she, his, hers, and the breadth-first build step by step"
  - "The build and search code, and the search trace on ushers"
  - "The full transition table and the memory table for the three representations"
  - "The production engine table: Snort, Suricata, Hyperscan, GNU grep, ClamAV, ModSecurity"
  - "Exercises: find every occurrence of every pattern, and censor banned words in one pass"
---
## Introduction

An intrusion-detection system checks every packet against forty thousand byte-string signatures. Running KMP once per signature costs forty thousand times the packet length, for every packet. That is not a design. It is an outage. What you want is to read each byte of the packet once and, at every position, know instantly which signatures end there.

Aho-Corasick does exactly that. Alfred Aho and Margaret Corasick published it in 1975 for a bibliographic search tool. Today it runs inside GNU grep when you give it many fixed strings, inside the intrusion-detection engines Snort and Suricata, the ClamAV virus scanner, ModSecurity's phrase-match operator, profanity filters, and the literal fast path of regex engines such as Rust's.

It builds an automaton from the patterns in time linear in their total length, then runs the text through it in time linear in the text length plus the number of matches.

Four ideas. The failure link, which is KMP's failure function spread across a trie. The dictionary link, without which you silently miss matches. The counting argument that makes the search linear. And the memory bill when you turn the automaton into a table.

## The trie and the failure link

Start with a trie of the patterns. Take four small ones you can hold in your head: he, she, his and hers. Shared prefixes share nodes, so twelve pattern characters become ten nodes, counting the root.

A trie on its own matches patterns that start at one fixed position. To search a text with it, you would start a fresh walk at every position, which costs the text length times the longest pattern in the worst case. Walk the text "ushers". From position 1 you read s, h, e, and land on she: a match. Then you go back to the root and start again from position 2, reading h, e, r, s, for hers.

Here is the waste. After matching she, the last two characters you read, h and e, are themselves a path from the root. They spell he. The automaton should jump straight there and keep going.

That jump is the failure link. For the string a node spells, the failure link points to the longest proper suffix of that string which is also a node in the trie. It is KMP's question, "what is the longest suffix that is also a prefix", asked of every node across all the patterns at once. For she, the answer is he. For sh, it is h. For his and for hers, it is s.

You compute the links breadth-first, level by level, so a node's parent already has its link. Start from the parent's failure link and walk the failure chain until some node has a child on the same character; that child is the link, or the root if no node has one. One invariant keeps everything linear: a failure link always points strictly shallower.

Now run "ushers" through the finished automaton. The u: the root has no u child, so stay at the root. Then s, h, e: down to she, and report it. Then r: she has no r child, so follow the failure link to he, which does have an r, and step to her. Then s: hers, report it. Every text character read once, and exactly one failure step in the whole run.

## Reporting every match

Arriving at a node means every pattern that is a suffix of its string ends right here. Those are exactly the pattern-ending nodes along its failure chain. When you land on she, the pattern he also ends at that position, but the walk never visits the he node. It only passes through it on the failure link, one character later.

A sharper case. Patterns abcd, bc and c, against the text abcd. After three characters you sit at the node abc, which is not a pattern. Its failure link goes to bc, which is a pattern, whose failure link goes to c, also a pattern. Both end at this position, and an implementation that only reports at the node it lands on misses both. That is the classic bug: a filter that leaks exactly the words nested inside longer words.

Walking the whole failure chain at every position gives the right output, but costs the trie depth per character and destroys the linear bound. Two techniques keep it.

The first merges output lists at build time: each node appends its failure target's list to its own, and reporting is a scan of one list. The cost shows up on pathological sets. For the patterns a, aa, aaa and so on up to a thousand a's, the lists total 500,500 entries, against a thousand nodes.

The second stores one dictionary link per node: the nearest node on the failure chain that ends a pattern. On arrival you follow dictionary links, not failure links, and every hop lands on a pattern, so every hop is a match you had to report anyway. Memory is one integer per node. Production engines do this.

## Why it is linear

The search loop looks quadratic: a while loop following failure links, inside a for loop over the text. The proof is a counter. Track the depth of the current state.

Each text character steps down into a child at most once, so depth rises at most once per character, at most n times over the whole text. Each failure step goes strictly shallower, so depth falls by at least one. Depth starts at zero and is never negative, so the total fall cannot exceed the total rise. Failure steps are bounded by n for the entire text, and the search is linear in the text plus the number of matches reported.

In the "ushers" run, depth rose five times and fell once. The same argument along each root-to-leaf path makes the build linear in the total pattern length.

And the matches term is real. The patterns a, aa, aaa, up to k of them, against a long run of a's produce about k matches per character, and nothing reports matches faster than it writes them. If you only need to know whether any pattern occurs, stop at the first match, and the search is linear in the text, full stop.

## The table and the memory

The automaton so far may take several failure steps to consume one byte. Precompute the answer for every pair of state and byte and you get a deterministic table: one array load per byte, no loop at all. Filling it costs states times alphabet. It removes a loop, not a complexity class.

The price is memory, and this is arithmetic you should be able to do in an interview: states, times 256 byte values, times 4 bytes per state number. A ruleset of forty thousand content strings averaging 15 to 20 bytes reaches roughly half a million states after prefix sharing; the lesson treats that as an order-of-magnitude estimate. Half a million times 256 times 4 is about 488 mebibytes. Call it half a gigabyte.

The first lever is byte classes. Bytes that appear in no pattern are indistinguishable to the automaton, and bytes that always lead to the same states can share a column. A ruleset over ASCII text with case folding rarely needs more than 30 to 60 classes out of 256. With about 40 classes, the same half million states take about 76 mebibytes. Shrinking the state number to two bytes, by contrast, saves at most a factor of two and stops working past 65,535 states.

That is why the engines differ. Snort's default is a compacted sparse automaton that follows failure links, trading extra loads per byte for a table that fits in cache; the full table is its high-memory option. Suricata splits its patterns per rule group so each automaton stays small. Rust's aho-corasick crate builds the full table only for small pattern sets, at most 100 patterns in the current version, and a flat contiguous automaton otherwise. For a few dozen patterns it adds Teddy, a SIMD prefilter borrowed from Hyperscan that screens 16 or 32 bytes of text at a time, which is why ripgrep with a few fixed strings runs near memory bandwidth.

## Semantics and production traps

The automaton as built reports every match, overlapping and nested. That is right for "which signatures fired" and wrong for "replace each banned word". With she and he on "ushers", standard semantics report both, and two replacements land on overlapping ranges. Leftmost-first reports she and resumes after it. Leftmost-longest takes the longest of the matches that start earliest: with he listed before hers, on the text hers, leftmost-first reports he and leftmost-longest reports hers.

You cannot get leftmost behaviour by filtering the standard output, because the standard automaton commits to he before it knows whether hers will complete. Libraries build a different automaton, pruning failure transitions out of match states. Decide the semantics before you build.

Three more traps. The automaton is static: adding one pattern rebuilds the trie and every failure link, so build the new one in the background and swap a pointer, the way Suricata reloads rules. Case-insensitive search must not lowercase the text with full Unicode rules: a capital I with a dot lowercases to two code points, and a German sharp s folds to two s's, so offsets stop lining up with the original. Fold with a length-preserving mapping, or build both cases into the transitions, as the Rust crate does. And signatures that straddle two packets are missed if each packet restarts at the root.

## In the interview

The tell is "many patterns, one text", or "a dictionary and a stream". The junior answer loops a find call per pattern. The mid-level answer is a trie with restarts. The senior answer names Aho-Corasick, states the linear bound, and explains the failure link as KMP generalised to a trie. If the interviewer flips it to one pattern and many texts, the answer changes: index the texts, with a suffix array, which is the next lesson.

A follow-up the lesson expects. A signature spans two packets. How do you detect it without buffering?

[pause]

Keep the automaton state per flow, between packets. The state encodes the longest pattern prefix that is a suffix of everything seen so far, which is exactly the information a straddling match needs, and it costs one integer. The common wrong answer is to buffer the last pattern-length bytes and scan them again: it works, but it re-reads bytes and reports duplicates unless you deduplicate.

And the classic. Why is the search linear, when there is a while loop inside the for loop?

[pause]

Depth rises at most once per character, and every failure step lowers it, so failure steps are bounded by n overall. The wrong answer is "the trie has bounded depth", which only bounds a single iteration by the longest pattern and gives n times the longest pattern, not n.

## Recap

Four things to keep. The failure link points to the longest proper suffix of a node's string that is also in the trie: KMP's failure function across all patterns, built breadth-first. Report through dictionary links or merged output lists, or you miss the he inside she, and the bc and c inside abcd. The search is linear because depth rises once per character and every failure step lowers it. And a full table costs states times alphabet times four bytes, about half a gigabyte for half a million states, with byte classes as the first lever.

At your desk: the trie and automaton tables, the breadth-first build, the code and the "ushers" trace, the full transition and memory tables, the production engine table, and the two exercises.
