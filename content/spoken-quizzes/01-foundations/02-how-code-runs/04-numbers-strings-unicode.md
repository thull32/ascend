---
lesson: numbers-strings-unicode
source: 3766f7b32c910aab
---
## 1

A Java method computes the midpoint of a binary search as lo plus hi, divided by 2, in 32-bit integers, over an array of 1.5 billion elements. What goes wrong, and when?

A, it fails at once, since Java arrays are capped at 1 billion elements. B, lo plus hi overflows when the search reaches the upper half, so the midpoint goes negative. C, nothing: integers are 32-bit and 1.5 billion fits. D, the division truncates, so the search skips the last element.

[think]

The answer is B: lo plus hi overflows when the search reaches the upper half, so the midpoint goes negative.

1.5 billion fits in a 32-bit integer, but lo plus hi can reach 3 billion once the search range is in the upper part of the array. That exceeds about 2.1 billion and wraps to a negative index. Write lo plus half of hi minus lo instead. The truncating division is normal and harmless.

## 2

A JSON API returns an id equal to 2 to the 53, plus 1. A JavaScript client parses it with the built-in JSON parser. What does the client hold?

A, exactly that value, since doubles hold integers. B, 2 to the 53, one less than sent, because it is rounded to the nearest double. C, a BigInt, because the parser detects large integers. D, a string, since the value is too big for a number.

[think]

The answer is B: 2 to the 53, one less than sent, because it is rounded to the nearest double.

The parser produces a double, and 2 to the 53, plus 1, is past the range where doubles hold every integer: there, the last bit of the fraction is worth 2. So it rounds to 2 to the 53. Neither a BigInt nor a string is produced automatically, which is why large IDs are sent as strings.

## 3

The exact sum of the doubles 0.1 and 0.2 lies exactly halfway between two representable doubles. Which one does the hardware return, and why?

A, the upper one, because ties round to the even significand. B, whichever is closer to the decimal 0.3, which is the lower one. C, the upper one, because the hardware always rounds up on ties. D, the lower one, because ties round toward zero.

[think]

The answer is A: the upper one, because ties round to the even significand.

The default rounding mode in the floating-point standard is round half to even: on an exact tie, pick the neighbour whose significand is even. The upper neighbour's is even, and the lower one's, the double nearest 0.3, is odd, so the result lands one unit in the last place above 0.3. Rounding toward zero and always rounding up are other modes, not the default, and the decimal value 0.3 plays no part in the decision.

## 4

You need to check whether two doubles, a and b, both around 10 to the 12, are equal. Which test is appropriate?

A, Python's is-close, with a relative tolerance of zero and an absolute tolerance of 10 to the minus 9. B, the absolute difference is at most 10 to the minus 9 times the larger of a and b. C, multiply both by 10 to the 9, truncate to integers, and compare. D, round both to 9 decimal places, and compare.

[think]

The answer is B: the absolute difference is at most 10 to the minus 9 times the larger of a and b.

Near 10 to the 12, adjacent doubles are about 1.2 times 10 to the minus 4 apart, so an absolute tolerance of 10 to the minus 9 is smaller than a single rounding step and will fail spuriously. A relative tolerance scales with the magnitude. Rounding or truncating to nine decimals changes nothing at that scale, so two values one rounding step apart still compare unequal.

## 5

In JavaScript, the length of a thumbs-up emoji with a skin-tone modifier is 4, but spreading it into an array gives an array of length 2. Why?

A, the first counts UTF-8 bytes, and the second counts characters. B, the first double-counts the emoji because of a V8 bug. C, the first counts code points, and the second counts grapheme clusters. D, the first counts UTF-16 units, and the second counts code points.

[think]

The answer is D: the first counts UTF-16 units, and the second counts code points.

Length counts UTF-16 units, and each of the two code points, the thumbs-up and the skin-tone modifier, needs a surrogate pair. Spreading iterates by code point, giving 2. The UTF-8 encoding would be 8 bytes, not 4. A human sees one grapheme cluster, and only a segmenter counts that.

## 6

A CPython loop builds a string by adding 100 thousand pieces to it with plus-equals, in 1.5 milliseconds. A colleague adds a line inside the loop that keeps a second variable pointing at the string, for logging, and the same loop now takes 668 milliseconds. What happened?

A, the interpreter switched from ropes to flat strings when memory grew. B, the extra assignment doubles the work, so it should be about 3 milliseconds. C, the second reference defeats the in-place resize, so every plus-equals now copies. D, logging forces the string to be re-encoded as UTF-8 on each iteration.

[think]

The answer is C: the second reference defeats the in-place resize, so every plus-equals now copies.

CPython extends the string's buffer in place only when its reference count is exactly one and the result is stored back to the same local. A second reference makes the string shared, so each plus-equals allocates and copies the whole accumulated string. That is quadratic, which is what a 450 times slowdown at 100 thousand pieces looks like. CPython has no ropes, that is V8, and no encoding happens on concatenation.
