---
lesson: numbers-strings-unicode
source: 0ff3479da57605b5
fit: partial
desk:
  - "The overflow table, each language's behaviour as run"
  - "The bit layout of real doubles, and the full rounding trace of 0.1 plus 0.2"
  - "The string-building timings in CPython and V8"
  - "The UTF-8 and UTF-16 byte dumps, and deriving them by hand"
  - "Exercises: simulate 32-bit wrapping, and count UTF-8 bytes without encoding"
---
## Introduction

A billing job sums a day of transactions in cents and reports a negative total. A JavaScript client receives a 64-bit order ID as JSON and stores it with the last digit changed. A test asserts that 0.1 plus 0.2 equals 0.3 and fails, so someone "fixes" it with rounding and introduces a drift of a few cents. A username validator says a name is 7 characters long to a human, 8 in Python, 10 in JavaScript and 15 in Go. Same name.

Every one comes from the gap between the number or text you think you have and the bits the machine stores. Three ideas: what happens when integers run out of bits, why floating point gives the answers it does, and why a string has four different lengths.

## Integers at the edge

A fixed-width integer has a set number of bits. Signed integers use two's complement, where the top bit counts as a large negative number. So 8 bits hold minus 128 to 127, and 32 bits hold about minus 2.1 billion to plus 2.1 billion.

Here is the whole idea in one example. In 8 bits, add 1 to 127. The bit pattern becomes a 1 followed by seven 0s. Read as unsigned, that is 128. Read as signed, that top bit is worth minus 128. No circuit checked anything; the interpretation changed. That is why two's complement is used: one adder works for signed and unsigned alike.

What happens when a result does not fit is the first thing to know about a language. Python integers cannot overflow: the object just grows, and arithmetic slows with the number of digits. JavaScript has no integer type at all: every number is a 64-bit double, so integers silently lose precision above two to the 53. Go wraps silently in every build. Rust panics in a debug build and wraps in release, and gives you checked, wrapping and saturating additions so you choose. Java wraps.

And C is the dangerous one. Signed overflow is undefined behaviour, so the compiler assumes it never happens. Write the textbook overflow check, "is x plus 1 greater than x", and gcc folds it to the constant true. Your check compiles to nothing, in the build you tested and the build you shipped.

The overflow bugs that recur. The midpoint in binary search: lo plus hi, divided by 2, overflows a 32-bit integer once the sum passes about 2.1 billion. With lo at 2 billion and hi at 2.1 billion, it gives a negative number. Java's standard library shipped this bug for about nine years. Write lo plus half of hi minus lo, everywhere, even in Python, because your interviewer may be reading it as Java.

And the 64-bit ID in JSON. Parse an ID of two to the 53, plus 1, in Node, and you get two to the 53: the parser produces a double, and that number is not representable. That is why APIs that hand out 64-bit IDs send them as strings, and why a client that needs arithmetic on them uses BigInt.

## The bits of a double

A 64-bit double is one sign bit, 11 exponent bits and 52 fraction bits, with an implied leading 1, so 53 significant bits in all. That one fact explains JavaScript's limit. At two to the 53, the last fraction bit is worth 2, so the next double after two to the 53 is two to the 53 plus 2. There is no double for the odd number in between.

Now 0.1. One tenth in binary is a repeating fraction, 0.000110011001100 and so on forever. A double cuts it off after 53 significant bits, and the bits after the cut are more than half a unit, so the stored value rounds up, to a hair above 0.1. 0.2 is the same pattern one exponent higher, so it rounds up too. And 0.3, stored on its own, rounds down, to a hair below.

[pause]

So why does 0.1 plus 0.2 not equal 0.3? The hardware adds the two stored values exactly, then rounds once to the nearest double. The exact sum lands precisely halfway between two neighbouring doubles: the one that is the stored 0.3, and the next one up. On an exact tie, the default rule is round half to even: pick the neighbour whose last bit is even. That is the upper one. So the result is one unit in the last place above 0.3, printed as 0.30000000000000004.

It is not "floating point is imprecise". It is two representation roundings and one tie broken by a rule you can name. Halves and quarters, by contrast, are exact binary fractions, so 0.5 plus 0.25 is exactly 0.75.

## Rules that follow

Precision is relative. The gap between adjacent doubles is about two times ten to the minus 16 near 1, about one ten-thousandth near a trillion, and 2 at two to the 53. Roughly 16 significant decimal digits, everywhere.

So compare with a tolerance whose scale you chose. Near a trillion, an absolute tolerance of ten to the minus 9 is smaller than a single rounding step, and the test fails spuriously. Use a relative tolerance, or an absolute one in the units of the quantity.

Order of operations changes the answer. Ten to the 16, plus 1, minus ten to the 16, is zero, because adding 1 rounds straight back. Summing many values of mixed size accumulates this; compensated summation exists to control it.

NaN is not equal to anything, including itself, and it poisons ordering. Sort a list containing NaNs in Python and it can come back unchanged, because every comparison with NaN is false and the sort's assumptions collapse. Filter NaNs first.

And money is not a float. 0.1 times 3 is 0.30000000000000004; a decimal type gives 0.3. Store cents as integers, or use a decimal type. A float ledger's drift is tiny per transaction and unbounded over time. Single precision is worse still: a 32-bit float counter stops incrementing at about 16.8 million, a real bug in machine learning pipelines and game engines.

## Building strings

In Python, JavaScript, Java and Go, strings are immutable. No operation changes an existing string; every "modification" makes a new one. That is what makes them safe as dictionary keys, and what makes building one with plus-equals in a loop quadratic in principle: each append copies everything so far.

The measured reality is more interesting, because runtimes rescue it in fragile ways. Building a string from 100 thousand six-character pieces with plus-equals on a local variable in CPython took about 1.5 milliseconds: linear. CPython has a fast path that sees the string has exactly one reference and extends it in place. Add one innocent line inside the loop that keeps a second reference to the string, say for logging, and the same loop took 668 milliseconds: about 450 times slower, because now every append copies. At module level instead of in a function, it took 4 seconds. V8 rescues it differently, by building a rope of pieces and flattening it once.

Joining a list of pieces is linear in every runtime: one measuring pass, one allocation. So are string builders in Go, Rust and Java. When the code must be fast everywhere, use join.

## Four lengths for one string

"Character" is not a unit of storage. There are four things you might mean. A code point: one number from the Unicode table, like the one for é. A code unit: the storage unit of an encoding. UTF-8 uses bytes, one to four per code point; UTF-16 uses 16-bit units, one per code point, or two, a surrogate pair, for anything beyond the first 65 thousand or so. A byte: what goes on the wire, almost always UTF-8. And a grapheme cluster: what a human calls one character.

Take "héllo", a space, and a thumbs-up emoji with a skin-tone modifier. A human sees 7 characters. Python's length counts code points: 8, because the emoji and its modifier are two. JavaScript's length counts UTF-16 units: 10, because each of those two code points needs a surrogate pair. Go's length counts UTF-8 bytes: 15. The family emoji, four people joined by invisible joiners, is 1 grapheme, 7 code points, 11 UTF-16 units and 25 bytes. No language's built-in length counts graphemes; you need a segmentation library.

The bugs this produces. Truncating by index can cut a character in half: Go can leave half of an é, invalid UTF-8; JavaScript can leave a lone surrogate that cannot be encoded at all. Reversing a string by its units breaks emoji and moves accents to the wrong letter; the honest answer is to reverse by grapheme cluster, with a library. Two strings that render as the same é can compare unequal, one composed and one with a combining accent, so normalise user input before comparing it. And length limits mean different things in each layer: a 255-character limit enforced by JavaScript's length admits up to 765 bytes of three-byte characters. MySQL's legacy utf8 charset only holds three bytes per character, so emoji are rejected; the real UTF-8 there is utf8mb4.

## In the interview

A follow-up the lesson expects: what is the length of a thumbs-up emoji with a skin-tone modifier?

[pause]

It depends on the unit. One grapheme cluster. Two code points. Four UTF-16 units, which is what JavaScript's length reports. Eight UTF-8 bytes. Ask which one the requirement means before validating, and count bytes if the limit is about storage. The wrong answer is a single number.

And: your binary search computes the midpoint as lo plus hi over 2. Any issue? In a 32-bit language it overflows once lo plus hi passes about 2.1 billion, which happens for arrays over about a billion elements. Lo plus half the difference cannot overflow. The wrong answer is "the array can't be that big", the assumption that shipped the bug in Java's standard library.

## Recap

Four things to remember. Know your language's overflow behaviour: Python grows, Go and Java wrap, Rust lets you choose, C deletes your check, and JavaScript loses integer precision above two to the 53. 0.1 plus 0.2 is two roundings up and one tie broken to even; compare floats with a scaled tolerance and keep money in integers or decimals. Build strings with join or a builder, because the plus-equals fast path breaks with one extra reference. And a string has four lengths, graphemes, code points, UTF-16 units and bytes, so pick one deliberately and enforce it the same way at every layer.

At your desk: the overflow table, the double bit layouts and the full addition trace, the string-building timings, the byte dumps and hand derivations, and the two exercises.
