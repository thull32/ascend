---
lesson: bit-manipulation
source: 4b28291399842fcc
---
## 1

In JavaScript, 1 shifted left by 31 evaluates to minus 2,147,483,648, and 1 shifted left by 32 evaluates to 1. Why?

A, left shift is an arithmetic shift in JavaScript, keeping the sign. B, shifting past bit 31 overflows and wraps back around to 1. C, JavaScript stores all numbers as 32-bit signed integers. D, bitwise operators use a signed 32-bit view, and shift counts are taken mod 32.

[think]

The answer is D: bitwise operators use a signed 32-bit view, and shift counts are taken mod 32.

JavaScript numbers are 64-bit floats, but every bitwise operator works on a signed 32-bit view of its operands. Bit 31 is the sign bit, and the shift count is masked to 5 bits, so 32 becomes 0, and 1 shifted by 32 is 1 shifted by 0. Overflowing past bit 31 would give 0, not 1.

## 2

In JavaScript, you test whether x is a positive power of two by writing x, bitwise AND x minus 1, double-equals zero, with no parentheses. Why does this not work?

A, the test only works on unsigned, fixed-width integers. B, double-equals binds tighter than AND, so it computes x AND the comparison of x minus 1 with zero. C, x minus 1 underflows when x is 1, breaking the smallest case. D, JavaScript numbers are doubles, so the trick fails.

[think]

The answer is B: double-equals binds tighter than AND, so it computes x AND the comparison of x minus 1 with zero.

Comparison has higher precedence than bitwise AND in JavaScript, as in C, so the expression is x AND false, which is 0, for every x except 1. Parenthesise the AND. The trick itself works on JavaScript numbers below 2 to the 31, whose bitwise operators see a 32-bit integer. Python gives AND the higher precedence, so the unparenthesised form happens to work there, and in Java it does not compile.

## 3

An array holds every integer from 0 to n exactly once, except one that is missing. Which approach finds it in linear time and constant space, with no risk of overflow in a fixed-width language?

A, sort the array in place, then scan for the gap. B, sum 0 to n with the formula n times n plus 1 over 2, and subtract the array's sum. C, XOR together all the indexes from 0 to n and all the array values. D, insert all values into a hash set, then probe 0 to n.

[think]

The answer is C: XOR together all the indexes and all the array values.

Every value that is present appears twice, once as an index and once as an element, and cancels, leaving the missing one. The sum approach is also constant space, but n times n plus 1 over 2 can overflow a 32-bit integer for large n. Sorting is n log n, and a hash set uses linear space.

## 4

What does x AND minus x give for x equal to 40, which is 101000 in binary, and why is it useful?

A, 32: it isolates the highest set bit of the number. B, 0: a number and its negation never share a set bit. C, 8: it isolates the lowest set bit, which Fenwick trees use. D, 40: negation leaves the magnitude bits of x unchanged.

[think]

The answer is C: 8, because it isolates the lowest set bit, which Fenwick trees use.

Minus x is every bit of x flipped, plus one, and that carry runs through the trailing zeros, so the only bit set in both x and minus x is x's lowest set bit: binary 1000, which is 8. That step drives Fenwick trees and iteration over set bits. Isolating the highest bit needs a different technique, such as the bit length or a leading-zero count.

## 5

A subset-sum feasibility DP over n items with total weight W runs in order n times W. You represent the set of reachable sums as a bitset, and update it for each item by OR-ing in the bitset shifted left by that item's weight. What does that change the cost to?

A, nothing: a bitset shift costs as much as a loop over the sums. B, order W, since one shift handles every item. C, still order n times W, but each update is about W over 64 word operations. D, order n log W, because shifts are cheap.

[think]

The answer is C: still order n times W, but each update is about W over 64 word operations.

Each item's update is a word-parallel shift and OR over W over 64 words. Asymptotically, that is still order n times W, with a constant of one sixty-fourth, but the constant is exactly the point: the machine performs 64 boolean updates per instruction, a real order-of-magnitude difference. Nothing about the trick removes the dependence on n, or turns W into log W.

## 6

A DP enumerates, for every n-bit mask, all of its submasks, by repeatedly setting the submask to the submask minus 1, AND the mask. How many mask and submask pairs does it visit in total, and why?

A, 4 to the n, since each of the 2 to the n masks is paired with 2 to the n submasks. B, 2 to the n times n, since each mask has at most n submasks. C, 2 to the n, since the submasks of all masks are the same 2 to the n sets. D, 3 to the n, since each bit is in neither, the mask only, or both.

[think]

The answer is D: 3 to the n, since each bit is in neither, the mask only, or both.

A mask and submask pair assigns each bit one of three states: absent from both, present in the mask only, or present in both. That is 3 to the n pairs, about 43 million at 16 bits. The 4 to the n figure ignores that the submask must be contained in the mask, and a mask with k set bits has 2 to the k submasks, not n.
