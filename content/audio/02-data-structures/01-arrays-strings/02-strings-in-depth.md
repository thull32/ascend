---
lesson: strings-in-depth
source: f5fbbb0ce0d7bb17
fit: great
desk:
  - "The concatenation trace, copy-everything against extend-in-place"
  - "CPython's five in-place conditions, and the PEP 393 getsizeof table"
  - "The code points, code units and grapheme clusters table on real emoji"
  - "The string operation cost table and the representation trade-off table"
  - "The run-length and reverse-words visualisers"
  - "Exercises: run-length encode a string, and first non-repeating character"
---
## Introduction

A service builds a one megabyte report by appending 40 thousand lines to a string, one at a time. In one runtime it takes about a millisecond. In another it takes seconds, and a garbage-collection storm. Same algorithm, same complexity on paper. The difference is what plus-equals on a string means: whether it can extend the existing bytes in place, or has to allocate a fresh copy of everything so far.

Strings are arrays of characters with two extra rules on top. In most languages you cannot change them after creation. And "character" turns out to be a much harder word than it looks.

Three ideas, then. Why strings are immutable, and what that does to concatenation in a loop. How runtimes lay text out in memory, and how one emoji can quadruple a string. And the three different things "character" can mean, which is where the bugs live.

## Why strings are immutable

Python, JavaScript, Java, Go and C sharp all make strings immutable. Rust has both: an immutable view, and an owned, growable String. The reasons are practical.

Hashing first. A string used as a dictionary key must not change while it sits in the table, or it lands in the wrong bucket forever. Immutability also lets Python and Java cache the hash inside the object: the first hash is linear, every later one reads a field.

Sharing second. An immutable string can be passed anywhere and aliased freely with no defensive copies. Substrings can even share the parent's buffer. Java did this until 2012 and stopped, because a 10-character substring could pin a 10 megabyte parent in memory. Go still does it, so that pinning hazard is yours to manage.

Then interning, where identical strings are deduplicated into one object so a lookup becomes a pointer comparison. And safety: a filename or a SQL fragment cannot be changed by another thread between validation and use.

The cost is that every modification is a new allocation plus a copy. Fine for one concatenation. Disastrous for a loop of them.

## Concatenation in a loop

Here is the naive model, with lines of 25 bytes. The first append copies 25 bytes. The second copies the 25 already there plus 25 new, so 50. The third copies 75. After five appends you have copied 375 bytes to build a 125-byte string. An extend-in-place model would have copied exactly 125.

The copy-everything total grows with n squared. For 40 thousand lines of 25 bytes, that is about 20 gigabytes of copying to produce one megabyte of output.

So which runtimes do which? Java and Go are quadratic: each plus-equals allocates and copies both sides. Java's compiler fuses a single expression like a plus b plus c into one builder call, but never across loop iterations. Rust is linear: its String is a growable byte array, and appending writes in place, doubling capacity when full. V8 is linear by a different trick: when the result is 13 characters or longer, concatenation creates a cons string, a little node with two pointers, and copies nothing. The flat copy is deferred until something indexes, hashes or compares the string.

And CPython is the interesting case. It is linear, but only inside a function, on a local variable, with no other reference to the string. Before I give you the conditions, guess: what kind of innocent change would make it quadratic again?

[pause]

The interpreter resizes the string in place only when all of these hold. Its reference count is exactly one, so no alias, no container holding it. Its hash has never been computed, because a resized string would hash differently. It is not interned. It is exactly a str, not a subclass. And the new piece is not wider than the old string, for example ASCII text is not being extended with non-ASCII. On top of that, the result has to be stored straight back into the same local variable.

The lesson measured the 40 thousand line loop. One millisecond when all of that held. 690 milliseconds when the variable was a module global. 2.5 seconds when the string was hashed before each append. 4.1 seconds when a second reference to it existed. Those slow cases are all the same 20 gigabytes of copying. Which means a refactor that moves the loop to module scope, or logs the intermediate value, silently reintroduces a quadratic without changing a line of the loop.

The portable answer is a builder. Collect the pieces and join once. Join makes two passes: it sums the lengths and allocates exactly once, then copies each piece into place. The same loop with a list and a final join took one millisecond. Java's StringBuilder, Go's strings Builder and Rust's String with a reserved capacity all do the same job. The rule to carry: if you cannot say why your runtime makes plus-equals linear, use a builder.

## How text is laid out

Since Python 3.3, under a design called PEP 393, a Python string stores every code point at the same width: 1, 2 or 4 bytes, whichever is the smallest that fits the widest character in the string.

Put numbers on it. A thousand-character ASCII string is 1,041 bytes: a 40-byte header, a thousand bytes, and a terminator. Now append one emoji.

[pause]

It becomes 4,060 bytes. The emoji needs 4 bytes, so every code point in the string is now stored in 4 bytes, and the header grows to 56. One emoji quadrupled it. A gigabyte of ASCII text held as one Python string becomes 4 gigabytes the moment a single emoji is concatenated in. That is a real production story: a text index grew from one gigabyte to four after a deploy that added emoji support. The fix is to keep large text as UTF-8 bytes, or in chunks, so widening stays local.

The upside of fixed width: indexing by code point is constant time, because the string is a plain array of equal cells.

Other runtimes make other choices. Java since version 9 uses compact strings: one byte per char if everything fits Latin-1, otherwise UTF-16. V8 does the same split, one-byte or two-byte. Go and Rust store UTF-8 bytes, so their length counts bytes, and finding the i-th character means scanning. And Redis stores every key and value as a simple dynamic string with a small length header, so its length is constant time, and it doubles its allocation on growth while under a megabyte, then adds a megabyte at a time.

Slicing is the cost that matters most in interviews. In Python and Java, a slice copies. In Go and Rust, it is a view. So a recursive function that calls itself on the string minus its first character copies the rest of the string every call: n squared over 2 bytes in total. For a 20 thousand character string, that is 200 megabytes. Pass indices, not slices.

## What a character is

"Character" hides three things. A code point is a Unicode number: capital A is code point 41 in hexadecimal. A code unit is the storage chunk of an encoding: one byte in UTF-8, two bytes in UTF-16. And a grapheme cluster is what a person sees as one character.

Here is the example to say out loud. The letter e with an acute accent can be stored two ways. As one code point, it is 2 bytes of UTF-8. Or as a plain e followed by a combining accent: two code points, 3 bytes of UTF-8. Both are one grapheme cluster, and they print identically.

A smiling-face emoji is one code point, 4 bytes in UTF-8, and two UTF-16 code units, called a surrogate pair. That is why its length in JavaScript is 2. And the family emoji, man, woman, girl, is five code points joined by invisible joiners: Python's length says 5, JavaScript's says 8, Go's says 18 bytes, and a person sees one character.

Three consequences you will hit. First, reversing a string is not reversing its code points. Reverse e plus combining accent and the accent lands on the wrong letter. Reverse by UTF-16 unit in JavaScript and an emoji becomes two lone surrogates, which is garbage. In an interview, say "I will assume ASCII; for Unicode I would reverse grapheme clusters", and move on.

Second, byte length is not character length. A 255-byte column, a 280-character post limit and a header size limit all measure in different units. Truncate a UTF-8 buffer at byte 255 and you can cut through the middle of an emoji, which is how you get "invalid byte sequence" errors from the database on names with emoji.

Third, case changes length. The German sharp s, uppercased, becomes two letters, S S. Any index computed before uppercasing is wrong after it.

## Pitfalls that ship bugs

Normalisation is the most common. The word café typed on a Mac can arrive with a plain e plus a combining accent, while the database holds the single accented code point. The two forms are called NFD and NFC. They print identically, compare unequal and hash differently, and the symptom is users with accented names who can log in from one operating system and not another. Normalise to NFC at every input boundary, before comparing, deduplicating or hashing.

Case can be locale-sensitive. In Turkish, the lowercase of capital I is a dotless i. Java's no-argument lowercase uses the default locale, so the word TITLE, lowercased on a Turkish machine, comes back with a dotless i. Python's case functions are locale-independent. For case-insensitive comparison, use casefold in Python, not lower, and a root locale in Java.

Invalid bytes exist in every real dataset. Python raises an error, Go silently substitutes a replacement character, Rust hands you an error to handle. Decide what your service does before the first customer file arrives.

And attacker-chosen keys with colliding hashes can turn a dictionary into a linked list, which is why CPython randomises its string hash per process.

## Strings in interviews

Most string questions are array questions in a costume. For ASCII, an array of 128 counters, or 26 for lowercase letters, indexed by the character code, is a perfect hash table: no hashing, a cache line or two, and it makes "are these anagrams?" one linear pass in constant space. For arbitrary Unicode, use a hash map. Palindromes and word reversal are two pointers, and in Python that means converting to a list first, because the string is immutable. Run-length encoding is a read pointer that advances over each run, and a builder for the output.

Now a follow-up the lesson expects. Why is plus-equals in a loop fine in CPython but a bug in Java?

[pause]

CPython's interpreter resizes the buffer in place when the string has a reference count of one, no cached hash, is not interned, is exactly a str, and the loop stores back into the same local. Java strings are immutable with no such path, and the compiler only fuses concatenations within one expression. The common wrong answer is "Python strings are mutable".

And another: how would you truncate a display name to 20 characters safely? Normalise to NFC, split into grapheme clusters, keep the first 20, then encode and check the byte length against the storage limit. Never slice the string, and never slice the encoded bytes.

## Recap

Four things to remember. Strings are immutable for hashing, sharing and safety, and that makes concatenation in a loop quadratic in Java and Go; CPython's linear exception holds only for a local with no alias and no hash, so use a builder. Python stores every code point at the width of the widest one, so a single emoji quadruples a large ASCII string. "Character" means code point, code unit or grapheme cluster, and the family emoji is 5, 8, 18 or 1 depending on which you count. And normalise at the boundary, casefold for comparison, and pass indices rather than slices.

At your desk: the concatenation trace, the byte-count and Unicode tables, the two string visualisers, and the exercises, run-length encoding and the first non-repeating character.
