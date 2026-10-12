---
lesson: strings-in-depth
source: 76936fa1b750fa2a
---
## 1

A Java method builds a 10 megabyte string by concatenating 200 thousand pieces with plus-equals in a loop. What is the dominant cost?

A, garbage-collecting the 200 thousand pieces, which are freed one at a time. B, recopying the accumulated string on every iteration, order n squared in total. C, hashing each intermediate string, which Java does on every allocation. D, encoding every piece to UTF-16, which doubles each ASCII character.

[think]

The answer is B: recopying the accumulated string on every iteration, order n squared in total.

Java strings are immutable, and the compiler only fuses concatenations within a single expression. Each plus-equals copies everything accumulated so far, giving roughly n squared over 2 character copies, on the order of 10 to the 12 here. The garbage is a symptom; the copying is the cause. And Java computes a string's hash lazily, only when something asks for it.

## 2

Inside a function, appending to a string with plus-equals in a loop runs in linear time on CPython 3.12. Which change makes the same loop quadratic?

A, keeping a second reference to the string alive across the iteration. B, storing the pieces as bytes objects rather than str objects. C, appending a piece that is longer than the accumulated string. D, running the loop more than 1,000 times, past the realloc threshold.

[think]

The answer is A: keeping a second reference to the string alive across the iteration.

The in-place resize needs a reference count of exactly one after the stack's reference is dropped. An alias, a container holding the string, a cached hash, interning, or storing into a global instead of a local all fall back to allocate and copy. Piece length and iteration count do not change the path, and bytes objects are a different type with their own copy behaviour.

## 3

In JavaScript, the length of a thumbs-up emoji is 2, and splitting it into characters, reversing, and joining produces garbage. Why?

A, the emoji is a grapheme cluster of two code points, which split separates. B, split works on UTF-16 code units, cutting the emoji's surrogate pair in half. C, split skips Unicode normalisation, so the reversed emoji ends up in NFD form. D, split works on UTF-8 bytes, so it breaks the emoji's multi-byte encoding apart.

[think]

The answer is B: split works on UTF-16 code units, cutting the emoji's surrogate pair in half.

The thumbs-up is a single code point outside the basic multilingual plane, stored as two UTF-16 code units, which is why its length is 2. Splitting by code unit separates the pair, and reversing produces two lone surrogates. It is not a grapheme cluster of several code points. Iterating with a for-of loop, or Array from, splits by code point instead.

## 4

A string of 1,000 ASCII characters occupies 1,041 bytes in CPython 3.14. About how large is it if its last character is replaced by an emoji?

A, 2,058 bytes, because the string switches to UTF-16 storage. B, 1,045 bytes, because only the emoji needs a 4-byte cell. C, 4,060 bytes, because every code point is now stored in 4 bytes. D, 1,057 bytes, because only the header grows to 56 bytes.

[think]

The answer is C: 4,060 bytes, because every code point is now stored in 4 bytes.

CPython chooses one width for the whole string, from its widest character. An emoji lies outside the basic plane, so it forces 4 bytes per code point for all 1,000 of them: a 56 byte header, plus 4 times 1,001 cells counting the terminator, is 4,060 bytes. A Latin-1 character such as e acute would only enlarge the header, to 1,057 bytes, and a character such as the euro sign would double the cells, to 2,058.

## 5

A recursive palindrome check calls itself on the string with its first and last characters sliced off. For a string of length n, what is the time complexity?

A, order n, because there are n over 2 calls that each compare two characters. B, order n, because Python slices are constant-time views into the original buffer. C, order n squared, because each call's slice copies the remaining string. D, order n log n, because the string halves at each level of the recursion.

[think]

The answer is C: order n squared, because each call's slice copies the remaining string.

Python slicing allocates and copies. The call at depth d copies about n minus 2 d characters, so the total is quadratic, even though there are only n over 2 calls. Slices are constant-time views in Go and Rust, not in Python. Passing indexes makes it linear.

## 6

Two user records have names that print identically, but they fail to match on login. What is the most likely cause?

A, one was stored as UTF-8 and the other as UTF-16 before being decoded. B, the column's collation sorts by code point, which breaks equality checks. C, they use different normalisation forms, NFC and NFD, of an accented letter. D, one string is interned, so equality compares object identity instead.

[think]

The answer is C: they use different normalisation forms, NFC and NFD, of an accented letter.

NFC and NFD encode the same visible text as different code point sequences: a single accented e, against a plain e followed by a combining accent. So equality and hashing differ. Normalise at the boundary before comparing. The storage encoding does not affect equality after decoding, and interning never changes what equality returns.
