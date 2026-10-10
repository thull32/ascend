---
lesson: bit-manipulation-pattern
source: b62f67da81f2fdc1
fit: partial
desk:
  - "The six identities table, and the template loops in Python and JavaScript: popcount, lowest bit, 32-bit add, reverse, submasks"
  - "The Python versus JavaScript table: width, shifts, and what each expression returns"
  - "The bit-by-bit traces: Single Number, Counting Bits, the add loop on 5 and 3, on minus 1 and 1, and on minus 2 and minus 3, Reverse Bits, Single Number III"
  - "The variations table, including the ones and twos automaton for Single Number II"
  - "The measured costs in CPython and Node, and the hardware instructions"
  - "Exercises: counting bits in linear time, and single number when the others appear three times"
---
## Introduction

"Every element appears twice except one; find it in constant space." "Add two integers without using plus." "Count the set bits of every number from 0 to n in linear time." These read as puzzles, and candidates who have not seen them either freeze or reach for a hash map that breaks the space constraint.

They are not puzzles. They are a small, closed set of identities about how integers are stored, and the constraint in the statement, "constant space", "without arithmetic operators", "linear", "32-bit", is the interviewer telling you which identity to use. There are six. The one that bites is two's complement, which stores a negative number as a large unsigned one with the same low bits. That is what makes "add without plus" work, and what breaks it in Python, whose integers have no width, and in JavaScript, whose bitwise operators silently force 32 bits.

Three things, then: reading the identity off the statement, the reason each one holds, said in a line, and the width traps in each language.

## The signal

"Appears twice, or an even number of times, except one", plus constant space: fold the array with XOR. Pairs cancel and the survivor remains. "One number missing from 0 to n", with the same constraint: XOR every index with every value, and each present value cancels its index. "Number of 1 bits", or "for every number up to n": clear the lowest set bit once per set bit, or a one-line DP. "Without plus or minus": XOR is the sum without carries, and AND shifted left one place is the carries. "Reverse the bits" or "is a power of two": a fixed-count loop of shift and mask. A set of at most about 20 items to enumerate or memoise: an integer mask, where bit i means item i is in. And an explicit width, "32-bit signed", "return 0 on overflow": the width is part of the specification.

What rules it out? Space that is not constrained: a counter solves Single Number in one line, so write it if allowed, then offer XOR as the constant-space answer. A multiplicity other than two: XOR cancels pairs only, and "three times except one" needs per-bit counting. Floating point. And sets far beyond 20 elements, because a mask over n items ranges over 2 to the n subsets: about a million at 20, 10 to the 12 at 40.

One near miss deserves a sentence. "n plus 1 values from 1 to n, one repeated, possibly many times, read-only, constant space" looks like XOR, but the duplicate may appear three or more times, so parity isolates nothing. That one is Floyd's cycle detection.

## The six identities, said in a line each

XOR cancels: x XOR x is 0, and x XOR 0 is x, because in each column XOR is addition modulo 2.

n AND n minus 1 clears the lowest set bit. Subtracting 1 borrows through the trailing zeros: the lowest 1 becomes 0, the zeros below it become 1s, and the AND wipes everything from that position down. 12 is 1100; 11 is 1011; their AND is 1000, which is 8. A loop of these runs once per set bit, not once per bit of the word. It also gives the power-of-two test, with one trap: 0 passes the bare test, so add "n is positive".

n AND minus n keeps only the lowest set bit. In two's complement, minus n is n with every bit flipped, plus one, and the result keeps the lowest 1 in place while every bit above it is flipped. The AND keeps just that one bit: 12 AND minus 12 is 4.

Read, set, clear or toggle bit i, with a mask that has a single 1 at position i: a one-hot mask touches one column.

Shifts are base-2 place value: shifting left by k multiplies by 2 to the k, and shifting right floor-divides, for non-negative values.

And add without plus: a plus b equals a XOR b, plus twice a AND b. Replace the pair with the XOR and the shifted AND, and the sum does not change. Watch it on 5 and 3. 5 plus 3 becomes 6 plus 2, then 4 plus 4, then 0 plus 8, and with the carry at zero, the answer is 8. Every row has the same sum; that is the invariant, visible.

The loop stops within 32 iterations in a 32-bit word, because the carry's lowest set bit rises at least one position each time. On 200 thousand random pairs, it averaged about 5 iterations and needed 20 at worst. Minus 1 plus 1 needs all 32, because its carry climbs one bit at a time.

## XOR folds: the recognition test

Why does folding the whole array with XOR leave the single value? XOR is associative and commutative, 0 is its identity, and every value is its own inverse. So a fold computes each column's parity. Values that appear an even number of times vanish. The result is the XOR of the values with odd multiplicity. On 4, 1, 2, 1, 2: the second 1 undoes the first, the second 2 undoes the first, and 4 remains, in any order.

That gives the recognition test. Exactly one value with odd multiplicity means XOR. Anything else means counting.

So what does XOR return when every value appears three times except one? Before I answer, use the parity rule.

[pause]

Three is odd, so every tripled value survives too. You get the singleton XORed with every tripled value, which is correct only by accident. The fix counts each of the 32 columns and keeps the bits whose count is not a multiple of 3. On 2, 2, 3, 2: bit 0 is set only in the 3, a count of 1; bit 1 is set in all four values, a count of 4, which leaves 1 modulo 3. Both bits survive, and the answer is binary 11, which is 3.

Two singletons, every other value twice: fold everything to get the XOR of the two, which is non-zero because they differ. Any set bit of it is a column where they differ; take the lowest, and split the array by that bit. Each pair lands on one side and cancels, and each side folds to one singleton. On 1, 2, 1, 3, 2, 5, the fold is 6, the split bit is 2, and the two sides give 3 and 5.

## Counting Bits as a DP

Counting Bits wants the number of 1s for every value from 0 to n, in linear total time. A popcount per number costs up to the number of bits in each, so order n log n. The linear version is a DP whose state is one smaller number. A number and its right shift by one differ by exactly the bit shifted out, so the count for i is the count for i shifted right, plus the lowest bit of i. Seven is 111; shifted right it is 11, with two 1s, plus the low bit, 1: three. Every value it reads is smaller than i, so it is already filled. That is the whole correctness argument.

The runtime is less tidy. In CPython, to a million, the DP took 26 milliseconds, and a comprehension calling the built-in bit count on each number took 11, even though it is asymptotically worse. A CPython bytecode costs tens of nanoseconds; a C popcount costs about one. The DP is the answer to the question asked; naming the built-in, and why it wins in Python, is the senior addition.

## Width: where the bugs live

Python integers have no width. Port the add loop from C, and it passes every positive test and never terminates on minus 1 plus 1: the carry out of bit 31 is never dropped, so it climbs forever. After 100 iterations, the operands are around 10 to the 30. The fix: mask both values to 32 bits every iteration, and at the end, if bit 31 is set, read the pattern as negative by subtracting 2 to the 32. Minus 2 plus minus 3 ends as the 32-bit pattern for minus 5, and the reinterpretation turns it back into minus 5.

JavaScript has the opposite problem. Every bitwise operator converts its operands to 32-bit signed integers first. So 1 shifted left 31 places is negative. 2 to the 40, XOR 1, evaluates to 1, because the operator kept only the low 32 bits. The signed right shift copies the sign bit in from the top, so a bit-reversal loop on an input with bit 31 set feeds ones into later iterations. Use the unsigned right shift inside the loop, and an unsigned shift by zero to read the final result as unsigned. Test loop guards with "not equal to zero", never "greater than zero", because an intermediate may be negative.

Reverse Bits has its own trap: the loop must run exactly 32 times. Stopping when n reaches zero loses the leading zeros, which must become trailing zeros. Reversing 1 should give 2,147,483,648; the early-stopping loop returns 1.

Precedence differs by language too. In JavaScript, C and Java, "n AND 1 equals 0" parses as n AND the comparison, which is always 0, so the branch silently never runs. Python binds the bitwise operators tighter than comparisons, so the same text means something else there. Parenthesise every bitwise sub-expression.

And a 64-bit identifier in JavaScript must arrive as a string and become a BigInt, because doubles are exact only to 2 to the 53, and bitwise operators keep only 32 bits.

## Masks as sets

The other half of the pattern is a mask as a set of up to about 20 items. Counting from 0 to 2 to the n minus 1 visits every subset once, and bit i of the counter is the include-or-exclude decision for item i: the backtracking tree flattened into a counter. A mask is also a cheap, hashable key for memoising on a subset, which is bitmask DP. Enumerating every submask of one mask uses a decrement followed by an AND with the mask, which discards the bits the mask does not own. Doing that for every mask costs 3 to the n, because each bit is outside the mask, in the mask only, or in both.

## In the interview

"Several threads set different bits in one shared bitset. What can happen?"

[pause]

Setting a bit with OR-equals is a read-modify-write: a load, an OR, and a store. Two threads can load the same old word, and the second store erases the first thread's bit. The fix is an atomic OR, or a compare-and-swap loop that retries when the word changed underneath it. The wrong answer is "OR is one instruction, so it is atomic". Smaller words reduce contention but do not remove the race.

"Reverse Bits is now called a billion times." A 256-entry table of reversed bytes and four lookups per call: measured eight times faster than the loop in CPython and seven times in Node. Memoising results in a dictionary is slower than the arithmetic and could grow toward 2 to the 32 entries.

"The input is a 64-bit integer, and you are writing JavaScript." Receive it as a string, convert it to a BigInt, and pin the width with the unsigned 64-bit conversion, or carry two 32-bit halves by hand. "Numbers are 64-bit doubles, so 64-bit integers fit" is the wrong answer.

## Recap

Five things to remember. The constraint names the identity: constant space with pairs means XOR, "without plus" means XOR plus shifted AND, "every number up to n" means a DP on the shifted value. The recognition test for XOR is exactly one value with odd multiplicity; three times except one means counting columns. n AND n minus 1 clears one set bit, so loops cost one step per set bit. Pin the width: mask and reinterpret in Python, unsigned shifts and "not equal to zero" in JavaScript, BigInt past 32 bits. And a mask is a set for up to about 20 items.

At your desk: the identities table and template loops in both languages, the language comparison table, the bit-by-bit traces, the variations table, the measured costs, and the two exercises on counting bits and the three-times singleton.
