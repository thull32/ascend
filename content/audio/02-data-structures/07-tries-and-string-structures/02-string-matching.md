---
lesson: string-matching
source: 7fde0eb66530c444
fit: partial
desk:
  - "The failure-function code and its trace on aabaaab, including the fall-back chain in row 5"
  - "The KMP search code and its trace on abababca with pattern abab"
  - "The Rabin-Karp code, the rolling-hash formula and the base-10, modulus-13 collision table"
  - "The Z-array code and the Z-box trace on aabxaab"
  - "The table of what each standard library's find really uses, and the algorithm-choice table"
  - "Exercises: compute the failure function, and find all occurrences with KMP"
---
## Introduction

Find every occurrence of a pattern of length m in a text of length n. The obvious loop tries each starting position and compares up to m characters, so its worst case is n times m. On ordinary English it runs close to linear, because most comparisons fail on the first character.

Now feed it a text of 5 thousand a's and a pattern of 49 a's followed by a b. Every alignment matches 49 characters before failing on the b. The naive loop does 247,550 comparisons, within one percent of n times m. A log scanner, a firewall rule or a find call in a request handler that goes quadratic on attacker-chosen input is a denial of service waiting to happen. It has happened, repeatedly, in regex engines.

The linear-time algorithms all share one insight. When a comparison fails after matching k characters, you have learned something about those k characters, and you should not throw it away by sliding one position and starting over. Three ways to keep it: Knuth-Morris-Pratt, rolling hashes, and the Z-algorithm. Then what your standard library actually does, and where the quadratic worst case still lives.

## When the naive loop is fine

Before reaching for something clever, know that the naive loop often wins. The lesson measured it in Python on 200 thousand a's against a pattern of nearly 2 thousand a's and a b, a properly adversarial input. The naive loop, comparing slices, took 13 milliseconds. A pure-Python KMP took 12. The built-in find took 0.4.

Why so close? Each slice comparison is a memcmp running at tens of gigabytes a second, so 400 million byte comparisons finish in about the time pure Python spends on 200 thousand loop iterations. But scale both lengths by ten and the naive loop grows a hundredfold, to over a second, while KMP grows tenfold. The naive loop is the right choice when the pattern is short, the text is not adversarial, and the inner comparison is tight. When you cannot promise all three, you need a guarantee.

## Knuth-Morris-Pratt and the failure function

Here is the idea with a pattern you can hold: a, b, a, b. Suppose you have just matched all four characters. The naive loop would slide one position and start again. KMP notices that the matched text has a border: its last two characters, a b, equal its first two, a b. So the next alignment, two positions on, already has two characters matched, and the scan continues from there without ever looking backward in the text.

That is all the failure function stores. For each prefix of the pattern, the length of its longest border: the longest proper prefix that is also a suffix. For a, b, a, b the values are zero, zero, one, two. On a mismatch after matching j characters, you do not reset to zero. You fall back to the border of what you matched, and if that cannot extend, to the border of that border, and so on.

That fall-back chain is the line people get wrong. Before I say what the bug does: what happens if you reset to zero instead of following the chain?

[pause]

The table misses shorter borders, and the search misses overlapping matches. It passes the simple tests and fails on something like searching for "aa" inside "aaaa", which should find three matches. That is the test to write.

Why is it linear when the inner loop can run several times for one character? An amortised argument. The matched count j goes up by at most one per text character, every step of the inner loop makes it strictly smaller, and it never drops below zero. So across the whole search there are at most n decreases. Total, n plus m, worst case, with no assumptions about the input.

And notice what KMP needs to remember: one integer, the matched count, and the table, order m memory however long the text is. That makes it a finite automaton you can feed one character at a time, which is why it suits a log stream or a file too large to hold. It is also the structure inside Aho-Corasick, which matches thousands of patterns at once.

The honest part: KMP's constant factor is worse than naive on typical text, and it is rarely the fastest on benchmarks. It is what you use when you cannot afford the naive worst case.

## Rabin-Karp and rolling hashes

A different trick: compare hashes, not characters. Hash the pattern once, hash every window of the text, and only when the hashes match, compare the characters. What makes it linear is that each window's hash comes from the previous one in constant time. Treat the window as a number in some base; sliding by one removes the leading digit, shifts, and adds the new digit, all modulo a prime.

The lesson's example uses ordinary digits and a deliberately tiny modulus of 13. Search the digits of pi for the pattern 59. Fifty-nine mod 13 is 7, and among the two-digit windows only 59 itself gives 7, so one candidate, verified, a match. But look at the other windows: 14, 92 and 53 all leave a remainder of 1. Search for 92 instead, and three windows match the hash. Only the character check rejects two of them. Skip it, and you report two false matches. That is the whole failure mode of Rabin-Karp.

With a real modulus, around two to the 61, accidental collisions are vanishingly rare. Three rules keep that promise. Use a large prime modulus. Pick the base at random at start-up, because with a fixed base an adversary can build colliding windows offline. And never just let a 64-bit integer wrap around. Hashing modulo a power of two is broken by a known family, the Thue-Morse strings, where two different strings of about 2 thousand characters collide for every odd base. A service that accepts user input will meet that input eventually.

So when is a rolling hash the right tool? When you have many patterns of the same length: put their hashes in a set, and each window costs one lookup, which KMP cannot do. For substring-equality queries in constant time after precomputing prefix hashes. And far outside interviews: rsync finds matching blocks with a cheap rolling checksum and confirms them with a strong one, the same candidate-then-verify shape. Backup tools like restic and Borg cut files into content-defined chunks wherever the rolling hash hits a chosen value, so inserting one byte moves one chunk boundary instead of all of them.

## The Z-algorithm

One more view of the same information. For each position in a string, the Z value is how far the string starting there agrees with the string's own prefix. In "aabxaab", position 4 starts "aab", which matches the prefix "aab", so its Z value is 3. To search, compute Z over the pattern, a separator, then the text; every position whose value equals the pattern length is a match.

It runs in linear time by keeping the rightmost matched stretch found so far, the Z-box. Inside that box, a position mirrors one in the prefix, so its value starts from the mirror's and only fresh comparisons extend it, which push the box to the right. Z and the failure function carry the same information and convert into each other in linear time. Z is often easier for periods and prefix counts. The failure function is what you need for streaming, because Z needs the whole concatenation in memory.

## What find and regex engines really do

Here is a fact worth knowing cold. None of the standard libraries the lesson surveys uses KMP. Python's find uses memchr for one character, a skip-based search for short needles, and since 3.10 an algorithm called Two-Way for long inputs. glibc uses a Horspool variant and Two-Way. Rust's find is Two-Way. Two-Way gives a linear worst case with constant extra memory, and the skip-based algorithms jump over most of the text. Go falls back to Rabin-Karp after too many failed alignments. Java's indexOf is the naive loop with a vectorised first-character scan, so it is quadratic in the worst case: a Java service scanning uploads full of repeated characters against a long repeated needle will show it in its 99th percentile.

Regex engines are where the naive worst case still lives. Backtracking engines, which include Python's re, Java's and JavaScript's, try alternatives recursively. A pattern with nested unbounded quantifiers, like "a plus, in a group, plus, then b", tries an exponential number of ways to split the input before failing. Measured in Python: 20 a's took 20 milliseconds, 22 took 79, 24 took 316. Doubling per character. Forty a's would take about a year. Cloudflare's July 2019 outage was a rule of this shape running on every request.

Automaton engines, RE2, Rust's regex and Go's regexp, run in guaranteed linear time, at the cost of not supporting backreferences. The senior rule: user-supplied patterns go through a linear-time engine, or through a backtracking engine with a step limit and a timeout.

## In the interview

A few appearances. Is a string some shorter string repeated? Take the smallest period, the length minus the last failure value; the string is periodic exactly when that period divides the length and is shorter than it. "abcabcabc" has period 3, which divides 9. Is one string a rotation of another? Same length, and it appears inside the other string doubled: one linear search. And the trap: anagram and sliding-window problems are not pattern matching at all. They compare character counts, which is a hash map and two pointers. Reaching for KMP there is a signal, the wrong one.

Now a follow-up from the lesson. The text is a live stream that does not fit in memory. Which algorithm, and what state do you keep?

[pause]

KMP, keeping only the failure table and the matched count: order m memory, one step per character. Rabin-Karp also works, with a buffer of the last m characters. The wrong answer is Z, which needs the whole concatenated string in memory.

And one more: why does the standard library not use KMP? Not because KMP is slow in theory. Because it reads every character, while skip-based searches and Two-Way run faster on real text, and Two-Way still guarantees linear time with constant space.

## Recap

Four things to remember. The naive loop is quadratic on inputs like many a's against a's ending in b, and still often the fastest choice on friendly text. KMP's failure function is the longest border, the fall-back follows the chain rather than resetting, and the amortised argument gives linear time with one integer of state, which makes it a streaming automaton. A rolling hash must be verified, with a large prime modulus and a random base, never 64-bit wrap-around. And standard libraries use skip-based search and Two-Way, while backtracking regexes on user input are a denial-of-service surface.

At your desk: the failure function and KMP traces, the Rabin-Karp collision table, the Z-box trace, the library and choice tables, and the two exercises.
