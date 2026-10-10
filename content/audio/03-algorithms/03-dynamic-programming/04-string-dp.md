---
lesson: string-dp
source: c905f15c529fa1d5
fit: partial
desk:
  - "The LCS and edit-distance tables filled cell by cell, with both walk-backs"
  - "The distinct-subsequences table for rabbbit, and the palindromic-subsequence table for bbbab"
  - "The regex table for aab against c-star a-star b, and the matching code"
  - "Under the hood: banding, bit-parallel rows, Levenshtein automata, how git diff works, and the cost and trade-off tables"
  - "Exercises: LCS length, and edit distance"
---
## Introduction

Git diff shows which lines changed between two versions of a file. Your spell checker suggests "receive" when you type it with the i and e swapped. A DNA pipeline aligns two sequences to find where they agree. All three are the same computation: compare two strings by finding the cheapest set of edits, or the longest shared skeleton, between them. Trying every alignment is exponential. The table is the length of one string times the length of the other, and it has been the standard since the 1970s.

String problems are the family where the state is a pair of prefixes: the first i characters of one string against the first j of the other. The transition always asks the same question: what happens to the last character of each prefix?

The plan: longest common subsequence and why its recurrence is complete, edit distance and its border, palindromes as intervals on one string, regular-expression matching with its star, and what production systems actually run.

## Longest common subsequence

A subsequence keeps characters in order but need not be contiguous. The state: the length of the longest common subsequence of the first i characters of a and the first j of b. Use prefix lengths, so the empty prefix is index 0, and the border is all zeros with no special cases.

The transition looks at the last two characters. If they are equal, they can be the last character of the answer: one plus the diagonal cell, both prefixes shortened. If they differ, at least one of them is not in the answer, so drop one or the other and take the better: the maximum of the cell above and the cell to the left.

A tiny example: a, b, c, d, e against a, c, e. The table finds three diagonal matches, a, c and e, so the answer is 3. Walk back from the corner, emitting a character on every diagonal, and you get "ace". When up and left tie, either move gives a valid answer of the same length, and different tie-breaks give different subsequences. That matters to diff tools.

Why is that the whole recurrence? Any common subsequence of the two prefixes does one of three things with the last characters: matches them to each other, which is only possible when they are equal; does not use a's last character; or does not use b's last character. The recurrence's terms are exactly those three cases. And nothing about which earlier characters were matched matters, so the pair of prefix lengths is a sufficient state.

The equal case deserves one more sentence, because there the recurrence takes only the diagonal. Take any optimal answer that does not end by matching this pair. Swap its last match for this pair, or append the pair, and it is at least as long. So matching is never worse. That is an exchange argument, the same tool as in greedy proofs.

## Edit distance

The fewest single-character insertions, deletions or substitutions to turn one string into another. Kitten to sitting takes 3: k to s, e to i, and insert a g.

The state is the edit distance between the two prefixes. And here, for the first time in this module, the border is not all zeros. Turning i characters into nothing takes i deletions. Turning nothing into j characters takes j insertions. Get that wrong and every cell is wrong.

The transition: if the last characters are equal, they cost nothing, so copy the diagonal. Otherwise the last operation was one of three, each costing one. Substitute: the diagonal plus one. Delete a's last character: the cell above plus one. Insert b's last character: the cell to the left plus one. Take the cheapest. Every edit script falls into exactly one of those branches.

Before I go on: what happens if you copy the zero border from longest common subsequence?

[pause]

Deleting a whole prefix looks free. Edit distance from a, b, c to the empty string comes out as 0 instead of 3, and every interior cell that routes through the border inherits the underestimate. A wrong base case is not corrected by the table; it poisons it.

Walking back gives the script itself, which is what a spell checker needs to explain a suggestion. For horse to ros, the walk finds three edits: substitute h with r, delete the r in the middle, delete the e.

Notice the shape. Both problems read the same three neighbours; they differ in the combine operation and the border. And with insertions and deletions only, the distance is the two lengths added, minus twice the common subsequence: everything not shared must be deleted from one side or inserted from the other.

The same prefix state also counts. Distinct subsequences asks how many ways one string occurs as a subsequence of another: the last character is either unused, or used as a match, and those two cases add. The counts grow fast and overflow 32 bits early, so that variant is where fixed-width overflow bites first in this family.

## Palindromes

Palindromes are about the two ends of a range, so the natural state is an interval of one string, not a pair of prefixes. The state: is the substring from i to j a palindrome? The transition: yes if its two end characters match and the inside is a palindrome, or the inside has length one or less.

The order is new. The transition reads a shorter interval, so fill by increasing length: every single character, then every pair, then every triple. The string b, a, b, a, d has 7 palindromic substrings: the five single letters, plus "bab" and "aba". Four a's in a row have 10.

Now the honest senior answer. For the longest palindromic substring, expanding around each centre is also quadratic, uses constant space, is shorter, and is usually faster. Write that one, and mention the table. The table earns its keep for the subsequence variant, which has no centre to expand from, or when many overlapping palindrome checks are needed, as in palindrome partitioning.

For the longest palindromic subsequence: if the two ends match, two plus the inside; otherwise drop one end and take the better. Same fill by length. Or notice it equals the longest common subsequence of the string and its reverse.

## Regular expressions

Match a string against a pattern of literals, a dot for any single character, and a star for zero or more of the previous element. This is the hardest classic string table and a common senior-round question.

The state: does the first i characters of the string match the first j characters of the pattern? For a literal or a dot, the last characters must match and the rest must match: the diagonal. For a star, two possibilities. It matches zero copies: drop the element and its star, two pattern positions back on the same row. Or it matches at least one: the last string character must match the starred element, and then you stay on the same pattern position, one string character shorter.

That "stay on the same pattern position" is what lets a star consume several characters, and it is the part candidates most often get wrong. Advance past the star after one character and the pattern a-star matches exactly one a. Test it with three a's against a-star; the buggy version says no.

Why is this table polynomial when real regex engines can take seconds? Read each row as a set: the pattern positions that are still alive after consuming that prefix. That is a nondeterministic automaton being simulated one character at a time, which is how Thompson's 1968 construction and engines like RE2 and Rust's regex work. Backtracking engines, like Python's, explore one alternative at a time and revisit the same pairs of positions without a memo. On a pattern with nested quantifiers and a string of a's, the work roughly triples with each added character, and a few dozen characters take seconds. That is a regular-expression denial-of-service attack, and the table is immune because it memoises the state the backtracker recomputes.

## What production runs

The table is bigger than it looks. Two strings of ten thousand characters give a hundred million cells: 800 megabytes as 64-bit integers, several gigabytes as a Python list of lists. Two rolling rows are 160 kilobytes. Nobody allocates the full table for strings that long.

Three reductions are worth knowing by name. Banding: if you only care whether the distance is at most k, cells further than k from the diagonal cannot be on a cheap enough path, so fill a band of width two k plus one. Spell checkers live here. Bit-parallel rows: adjacent edit-distance cells differ by at most one, so a column of 64 cells fits in a few machine words and updates in a handful of operations. And Levenshtein automata: one automaton per query, intersected with a dictionary trie, finds every word within distance k without a table per word. Lucene's fuzzy queries do this.

And git diff does not use the common-subsequence table at all. It runs Myers' 1986 algorithm, whose time is the total length times the edit distance, nearly linear when the files differ in a few lines.

## In the interview

A follow-up the lesson expects. The strings are a hundred thousand characters each. What now?

[pause]

Ten billion cells rules out any table. If the expected distance is small, use a band, or bit-parallel rows. If the strings are similar in the diff sense, Myers' algorithm. If neither, approximate. The wrong answer is "roll the rows", which fixes memory but still runs ten billion steps.

Another: allow swapping two adjacent characters as one edit. The state is unchanged; the transition gains a fourth candidate, two back in both strings, when the last two characters are swapped. Treating a swap as two substitutions overcounts by one.

## Recap

Four things to remember. Two-string states are pairs of prefix lengths, and every transition asks what happened to the last characters; say why the cases are exhaustive, and justify the match case with an exchange argument. The border is the base case: zeros for common subsequence, i and j for edit distance. Palindromes are intervals filled by length, and for the substring version, expand around the centre. And the regex star stays on the same pattern position; the table is an automaton simulation, which is why it is polynomial and a backtracker is not.

At your desk: the common-subsequence and edit-distance tables with both walk-backs, the counting and palindrome tables, the regex table and code, the production techniques and cost tables, and the two exercises.
