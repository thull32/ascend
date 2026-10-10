---
lesson: manacher-and-palindromes
source: 866d8479b9dc0c40
fit: partial
desk:
  - "The transformed string for abaab and the mirror-rule trace, position by position"
  - "Expand-around-centre and Manacher code, and the index mapping with and without sentinels"
  - "Recovering answers from the radius array: the slice formula, the count and the range-query checks on abaab"
  - "The choosing-the-tool table and the per-language string notes for CPython, JavaScript and Rust"
  - "The restriction-enzyme table and the eertree"
  - "Exercises: longest palindromic substring in linear time, and palindrome range queries"
---
## Introduction

"Find the longest palindromic substring" is one of the most-asked string questions there is, and almost everyone answers it with expand-around-centre: for each of the 2n minus 1 centres, grow outward while the characters match. It is short, it is correct, and it is quadratic in the worst case.

On a twenty-character interview input nobody notices. On a million characters made of long runs, or a service answering "is this range a palindrome" a hundred thousand times per request, quadratic is the difference between milliseconds and minutes.

Manacher's algorithm finds the longest palindrome centred at every position in linear time, from one observation: inside a palindrome you already know about, the left half tells you about the right half.

The plan. Where the quadratic time goes. The separator trick and the mirror rule, and why they are linear. What the radius array answers. Then what the textbooks skip: what your runtime does to the string, and why a DNA palindrome is not a string palindrome at all.

## Where the time goes

Expand-around-centre costs the sum of the radii. On random text most radii are zero or one, so it is effectively linear. On a hundred thousand random lowercase letters it took 0.02 seconds against 0.03 for Manacher, which is slightly slower because it builds a transformed string.

Now a run of one letter. Every centre expands all the way to the nearest edge. Ten thousand a's cost about 50 million successful comparisons. Measured in CPython: ten thousand a's take 1.2 seconds, and twenty thousand take 4.9 seconds. Twice the input, four times the time: the quadratic signature. Manacher does the twenty thousand in 6 milliseconds.

And this input is not theoretical. Runs of one character and long periodic blocks are exactly what shows up in genomic data, padding and compressed-log corpora. The lesson's production example is a validation endpoint with a 10-kilobyte limit whose 99th percentile hits seconds on inputs of repeated padding.

The waste is that the expansions overlap. Once you know abacaba is a palindrome around its middle c, you know the palindrome around the b to the right of centre is at least as wide as the one around the b to the left, because the right half mirrors the left. Expand-around-centre throws that knowledge away and checks those characters again.

## Separators and the mirror rule

Palindromes come in odd and even lengths, so there are two kinds of centre: a character, or the gap between two characters. Manacher removes the difference by putting a separator, usually written as a hash sign, between every pair of characters and at both ends. A string of n characters becomes one of 2n plus 1, every gap becomes a real position, and every palindrome is now odd-length around a single position.

There is a bonus. A maximal palindrome in the transformed string always starts and ends on a separator, so its radius equals the palindrome's length in the original. The even palindrome aa becomes separator, a, separator, a, separator: radius 2 around the middle separator, and length 2 in the original.

A trap to know about. Some implementations add sentinels as well, a caret at the start and a dollar sign at the end, so the loop needs no bounds check. That shifts every index by one and changes the formula for where a palindrome starts. Mixing the two conventions is the most common off-by-one in this algorithm.

Now the mirror rule. Keep track of the palindrome that reaches furthest to the right: its centre, C, and its right edge, R. For a new position before R, its mirror is the position the same distance on the other side of C. Everything inside the big palindrome reflects, so the neighbourhood of the new position is the reflection of the neighbourhood of its mirror.

Two cases. If the mirror's palindrome fits strictly inside the big one, the new position's radius is exactly the mirror's, and the first expansion attempt fails by construction. If the mirror's palindrome pokes out past the big one's left edge, the reflection is only guaranteed up to the boundary, so the radius is at least the distance to R, and you expand from there. Both cases collapse into one line: start at the smaller of the mirror's radius and the distance to R, then try to expand. At or beyond R you know nothing, and start from zero.

Try it. The mirror has radius 5, and R is 3 positions away. Where do you start?

[pause]

At 3. Copying 5 would assume characters beyond R match, and nothing has checked them. In the lesson's trace on abaab, that same clip, a mirror radius of 3 cut down to 1, is what stops the algorithm claiming a palindrome that runs past the end of the string.

Why is it linear? Count comparisons. Each position finishes its loop with exactly one failed comparison or bounds check, so failures total the length of the transformed string. Every successful comparison pushes R to a new maximum, because a position either copied a mirror that fitted inside, and then has no successes at all, or began with its palindrome already reaching R or beyond. R never moves left and cannot pass the end, so successes are bounded by the length too. On abaab: 8 successes and 11 loop exits, for a transformed string of 11.

## What the radius array answers

From the array of radii, everything about palindromes follows.

The longest palindromic substring is the largest radius, and its position tells you where it sits. For abaab the largest radius is 4, on a separator, giving the even palindrome baab.

The number of palindromic substrings is the sum, over every centre, of half its radius rounded up. A centre of radius r holds nested palindromes of length r, r minus 2, r minus 4, down to 1 or 2. For abaab that is 8: five single letters, plus aba, aa and baab. The plain sum of radii counts nothing meaningful; that is a common mistake.

Range queries become constant time. Is the substring from l to r a palindrome? Its centre in the transformed string is at l plus r plus 1, and the answer is yes exactly when the radius there is at least the substring's length. A hundred thousand queries on a hundred-thousand-character string cost one linear pass and a hundred thousand lookups, where checking each directly could cost ten billion steps, and a table of every pair would need ten billion cells.

And the longest palindromic prefix, which is what "shortest palindrome by adding characters to the front" needs.

What the array does not answer: which palindromes are distinct. A string of length n has at most n distinct palindromic substrings, because appending a character creates at most one new one. The eertree, from 2015, stores one node per distinct palindrome and builds online. abaab has five distinct ones. And palindromic subsequences or partitioning need interval dynamic programming; the radius array says nothing about subsequences.

## Strings are not arrays of letters

The inner loop compares characters by index, and what that compares depends on your language.

In JavaScript, a string is UTF-16 code units, and an emoji is two of them. Reverse it unit by unit and you swap the two halves, so a naive check reports that a one-character string containing an emoji is not a palindrome. Iterate by code point with Array.from, or by grapheme with Intl.Segmenter. In Rust, a string is UTF-8, so a byte-level check breaks on any multi-byte character.

Combining characters bite every language. An e with an acute accent can be one precomposed code point, or a plain e followed by a combining accent. Two strings that look identical compare as different. Normalise to NFC before any character-level comparison. Case folding changes lengths: the capital I with a dot lowercases to two code points, and the German sharp s folds to two s's, so an index in the folded copy is not an index in the original.

Then DNA. A biologist's palindrome is a sequence equal to its reverse complement: reverse it and swap A with T, C with G. The EcoRI restriction site, G A A T T C, reversed reads C T T A A G, so it is not a string palindrome, but its reverse complement is itself. No base is its own complement, so every such palindrome is even-length. And Manacher generalises: compare each character with the complement of its mirror, and the mirror argument still holds. Real genome tools search for something looser, inverted repeats with a loop in the middle and a few mismatches, which are alignment problems, not palindrome problems.

## In the interview

An interviewer asking for the longest palindromic substring in a 45-minute slot is usually checking that you handle odd and even centres and write a clean helper. Write expand-around-centre first. State its complexity honestly: quadratic in the worst case, on a run of one letter, near-linear on typical text. Then name Manacher, sketch the mirror rule in two sentences, and offer to write it. Leading with Manacher risks a sentinel bug under time pressure for no extra credit. Write it when n is up to a million, the input is adversarial, you need every centre, or linear time is asked for.

A follow-up the lesson expects. A biologist asks you for palindromes in a genome. What do you build?

[pause]

First clarify that they mean reverse-complement palindromes, which are even-length and can be found exactly with Manacher using a complement-aware comparison over the gap centres. Then ask about mismatches and loops, because real inverted-repeat and hairpin searches allow them, and those are alignment or folding problems. The wrong answer is to run the string-palindrome code, which finds A T T A and misses G A A T T C.

## Recap

Four things. Expand-around-centre is quadratic on runs of one letter, 4.9 seconds for twenty thousand a's against 6 milliseconds for Manacher, and near-linear on random text. Separators turn every palindrome into an odd one around a single position, and the radius there equals the length in the original. The mirror rule starts each radius at the smaller of the mirror's radius and the distance to R, and the algorithm is linear because every success pushes R right. And the radius array gives the longest palindrome, the count, and constant-time range checks, but not distinct palindromes and not subsequences.

At your desk: the transformed string and the mirror-rule trace on abaab, both implementations and the sentinel index mapping, the formulas for recovering answers, the language and DNA tables, and the two exercises.
