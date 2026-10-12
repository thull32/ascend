---
lesson: manacher-and-palindromes
source: b8d028f576d54d17
---
## 1

Why does Manacher's algorithm insert a separator between every pair of characters?

A, so both odd and even palindromes are centred on a single index of the transformed string. B, so the expansion loop can never run past either end of the string. C, to mark character boundaries, so radii count characters, not bytes. D, to double the length, so the mirror step has more work to amortise.

[think]

The answer is A: so odd and even palindromes are both centred on a single index.

Even-length palindromes are centred between characters. With separators, that gap becomes a real index, a hash character, so one radius array and one expansion loop cover both kinds, and the radius in the transformed string equals the palindrome's length in the original. Guarding the ends is what the optional sentinel characters do, not the separators.

## 2

Position i lies inside the current rightmost palindrome, with centre C and right edge R. Its mirror position has a radius of 5, and R minus i is 3. What is the starting radius for i, and why not 5?

A, 8, the mirror's radius plus the distance to R. B, 3, because the reflection is only known up to R. C, 0, because nothing is known about i until it expands. D, 5, because the mirror's radius carries over exactly.

[think]

The answer is B: 3, because the reflection is only known up to R.

The palindrome at the mirror pokes outside the big palindrome on the left, so its reflection is only guaranteed up to the boundary, 3 positions away. Copying 5 would assume that characters beyond R match, which nothing has checked; the expansion loop then tests whether it extends further.

## 3

Which input makes expand-around-centre quadratic, but leaves Manacher linear?

A, a string with no palindromes longer than 1, such as a b c d e f g h. B, a long run of one repeated character, such as eight a's. C, one long palindrome of distinct letters, such as a b c d c b a. D, a random string of lowercase letters.

[think]

The answer is B: a long run of one repeated character.

Every centre in a run of identical characters expands to the nearest edge, so the successful comparisons add up to about n squared over 2: 4.9 seconds for 20 thousand characters in CPython. Manacher's mirror step supplies most of each radius for free, and the total expansion work stays bounded by the string's length. A single long palindrome costs expansion only at its one centre, so it stays linear.

## 4

You need to answer 100 thousand queries of the form "is the substring from l to r a palindrome?", on a fixed string of length 100 thousand. What do you precompute?

A, nothing; checking each query with two pointers is fast enough. B, a hash set of every palindromic substring, looked up per query. C, the quadratic table of every l and r, filled once and read per query. D, Manacher's radius array, then one check at each query's centre.

[think]

The answer is D: Manacher's radius array, then one check at each query's centre.

One linear pass gives the maximal radius at every centre, and the substring is a palindrome exactly when the radius at its centre covers its whole length: a constant-time check. Checking directly is linear per query, up to 10 to the 10 steps in total, and the table needs 10 to the 10 cells.

## 5

A JavaScript function reverses a string and compares it with the original. It reports that a one-character string, containing a single emoji, is not a palindrome. Why?

A, emoji have no defined ordering, so comparing them is unspecified. B, the reverse method drops non-ASCII characters, so the reversed string is empty. C, the engine normalises the original string, but not the reversed copy. D, strings are UTF-16 code units, so reversing swaps the emoji's two surrogate halves.

[think]

The answer is D: reversing swaps the emoji's two surrogate halves.

An emoji outside the basic plane occupies two UTF-16 code units, and reversing unit by unit swaps them, producing a different sequence. Iterating by code point, with Array from or the spread operator, or by grapheme, with the Intl segmenter, fixes it. No normalisation happens on its own, and reversal drops nothing.

## 6

In a 45-minute interview, you are asked for the longest palindromic substring. What is the strongest opening?

A, the quadratic table, since it is the textbook answer and easy to verify. B, brute force over all substrings, then optimise once it passes tests. C, expand-around-centre, stating its n squared bound, and Manacher's linear one. D, Manacher straight away, since linear time is what earns the credit.

[think]

The answer is C: expand-around-centre, stating its n squared bound, and Manacher's linear one.

The simple correct solution with an honest bound, plus knowledge of the linear alternative, shows judgement. Leading with Manacher risks a sentinel bug under time pressure, for no extra credit, and the table uses n squared memory for the same time bound as expansion.
