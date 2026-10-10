---
lesson: bit-manipulation
source: 4e5c34c8ec33e164
fit: partial
desk:
  - "The two's complement negation trace and the right-shift table"
  - "The mask idioms, and the Unix permission mode worked in bits"
  - "Bit-by-bit traces of x and minus x, x and x minus 1, Kernighan's loop and the SWAR popcount"
  - "The two-singletons trace, the carry-based adder and the submask enumeration trace"
  - "The set-representation table and the language-traps table"
  - "Exercises: population count, subsets by bitmask"
---
## Introduction

Every array in an interview problem is at most 20 items. Every permissions system is a set of flags. Every network address is a prefix and a mask. And every find-the-element-that-appears-once problem has a constant-space solution that looks like magic. All of them come down to treating an integer as a row of switches, and knowing a dozen operations on that row.

Bit manipulation has a reputation for cleverness for its own sake. Most of it is not. Packing 64 booleans into one word makes a sieve or a table 64 times smaller and faster. A mask is the fastest possible set of small integers. And the hardware has a single instruction that counts set bits.

Bits are a visual subject, so this is the version for the ear: each idiom as a sentence you can say, one tiny example, and the traps. The bit-by-bit traces are at your desk. Five parts: two's complement and the language traps, masks, the three tricks everything else is built on, subsets as integers, and bitsets.

## Two's complement and the language traps

An unsigned integer is a row of switches read as binary: bit i, counting from zero on the right, is worth 2 to the i. Signed integers use two's complement, and the one sentence to keep is this: the top bit is negative. In 8 bits, the top bit is worth minus 128 instead of plus 128. So all ones is minus 128 plus 127, which is minus 1.

From that, negation: minus x equals flip every bit, then add one. Why? Because x plus its bitwise complement is all ones, which is minus 1. One consequence to remember: there is one more negative number than positive, so negating the most negative integer overflows back to itself.

Now the two languages that break the model in opposite directions. Python integers have no fixed width. Its bitwise not is defined as minus x minus 1, and negative numbers behave as if they had infinitely many leading ones. So if you want a fixed-width flip in Python, you must mask to the width yourself.

JavaScript is the opposite trap. Its numbers are 64-bit floats, but every bitwise operator first converts its operands to a signed 32-bit integer. So 1 shifted left by 31 is a large negative number, and 1 shifted left by 32 is 1, because the shift count is taken mod 32. Use an unsigned right shift by zero to reinterpret as unsigned, and BigInt when you need more than 32 bits.

Here is that trap in production. A Node service gains its 32nd feature flag, and unrelated flags start flipping on and off together. Bit 31 is the sign bit, and bit 32 wraps around to bit 0. The fix is a BigInt mask, two words, or a set of flag names, plus a test that sets the highest flag alone.

## Masks and precedence

A mask is an integer whose set bits mark the positions you care about. One shifted left by i is the mask for bit i alone. Then the idioms are short. OR with the mask sets the bit. AND with the inverted mask clears it. XOR with the mask toggles it. Shift right by i and AND with one reads it as zero or one. And one shifted left by k, minus one, is the low k bits all set, so AND-ing with it keeps x mod 2 to the k.

A chmod call is three of these. Making a file group-writable is OR-ing in the group write bit. Removing every execute permission is AND-ing with the complement of the execute bits.

Now a bug worth hearing once. In C, C++, Java and JavaScript, comparison binds tighter than bitwise AND. So "x and 1 equals equals 0", written without parentheses, parses as x AND the result of "1 equals 0". Before I tell you: in C or JavaScript, what does that evaluate to?

[pause]

Always zero, always false. An is-even test that never fires, and every record takes the odd branch. In Java it does not compile, and in Python bitwise operators bind tighter, so it happens to work. The habit to keep: parenthesise every bitwise sub-expression next to a comparison, in every language.

## The three tricks

The first trick: x AND minus x isolates the lowest set bit. Negating flips every bit and adds one, and the carry runs through the trailing zeros and stops exactly at x's lowest set bit. So that one bit is the only bit set in both. One example by ear: 40 is 101000 in binary. Its lowest set bit is worth 8, and 40 AND minus 40 is 8. This is the step a Fenwick tree uses, and it lets you visit only the set bits of a word instead of every position.

The second trick: x AND x minus 1 clears the lowest set bit. Subtracting one borrows through the trailing zeros, turning them to ones and the lowest one to zero, so the AND wipes it. Two consequences follow. A positive x is a power of two exactly when x AND x minus 1 is zero, and you must check x is positive, because zero passes too. And clearing the lowest bit repeatedly until nothing is left counts the set bits, in as many steps as there are set bits. That is Brian Kernighan's popcount. On 13, which is 1101, it takes three steps: 1100, 1000, zero.

But the hardware beats both loops. x86 has a POPCNT instruction that counts a 64-bit word in one instruction, about one per cycle. In every language the fastest popcount is the library call that reaches it: bit count in Python 3.10 and later, Long dot bit count in Java, count ones in Rust. Measured in CPython on random 64-bit integers: Kernighan's loop, 909 nanoseconds per value. The built-in bit count, 15 nanoseconds. JavaScript has no popcount, so it uses a trick called SWAR, counting bits in every pair, then every nibble, then every byte, in parallel, with no loop and no branch. Trace it at your desk.

The third trick: XOR cancels pairs. A value XOR itself is zero, a value XOR zero is itself, and order does not matter. So XOR-ing a list cancels every value that appears an even number of times. Single Number: every element appears twice but one; XOR the whole array, and the survivor is the answer, in linear time and constant space with no hash set.

Missing Number: an array holds 0 to n with one value missing. Which approach finds it in constant space with no risk of overflow?

[pause]

XOR all the indices from 0 to n with all the array values. Every present value appears twice and cancels, and the missing one remains. The sum formula also uses constant space, but n times n plus 1 over 2 can overflow a 32-bit integer. And XOR is also RAID 5 in one operation: XOR the data blocks to get a parity block, and any one lost block is the XOR of the rest.

## Subsets as integers

An n-bit integer is a subset of n elements: bit i set means element i is in. Counting from 0 to 2 to the n, minus 1, enumerates every subset exactly once, with no recursion. Mask 5, which is 101, selects elements 0 and 2. This is the backbone of every try-every-subset solution for n up to about 20, and of bitmask dynamic programming, where the state is which items have been used.

For sets of small integers, a mask beats any hash set. It sits in a register. Union is OR, intersection is AND, difference is AND NOT, and membership is one shift and AND.

Then the counting fact that decides feasibility. Some DPs enumerate, for every mask, all of its submasks. How many pairs is that? Not 4 to the n. It is 3 to the n, because each bit is in neither, in the mask only, or in both. 3 to the 16 is about 43 million, which is fine. 3 to the 20 is about 3.5 billion, which is not.

## Bitsets

Scale the idea up and you get a bitset: 64 booleans per word, an eighth of the memory of a byte array, and 64 comparisons per machine operation. A sieve of primes up to a billion is a gigabyte as bytes and 125 megabytes as bits.

The neatest use is subset-sum feasibility. Keep the set of reachable sums as a bitset. Adding an item of weight w is one line: reach becomes reach OR reach shifted left by w. One shift-or updates every reachable sum at once. With weights 3 and 4: start with only sum zero, add 3 to reach 0 and 3, add 4 to reach 0, 3, 4 and 7. Asymptotically the cost is still n times W, but each update is W over 64 word operations, a real order of magnitude.

Bloom filters are a bitset plus some hash functions. Page allocators track free pages with a bitset and find a free one with a single count-trailing-zeros instruction. And Python's unbounded integer works as a bitset directly, which is a genuinely good trick. One boundary trap: bit 64 of a bitset lands in word 1, bit 0. Compute the word as i shifted right by 6 and the bit as i AND 63, and test at 63, 64, 127 and 128.

## In the interview

Here is a follow-up the lesson expects. Two numbers appear once and every other number twice. Find both in constant space.

[pause]

XOR everything to get a XOR b, which is non-zero. Isolate any set bit of it with x AND minus x. The two numbers differ at that bit, so split the array by that bit and XOR each side. The pairs fall on the same side and cancel, leaving one singleton per side. The wrong answers are a hash map, or XOR-ing everything and stopping at a XOR b.

And another: how fast can you count the set bits of a billion 64-bit words? With the hardware instruction, about one word per cycle per core, roughly 0.3 seconds of arithmetic, and the 8 gigabytes of memory traffic is the real floor. In pure Python it is minutes. The wrong answer is "order n", with no idea whether that means a second or an hour.

## Recap

Five things to remember. In two's complement the top bit is negative, so minus x is flip and add one, and JavaScript's bitwise operators see only a signed 32-bit view while Python's integers never end. Parenthesise every bitwise expression next to a comparison. x AND minus x isolates the lowest set bit, x AND x minus 1 clears it, and XOR cancels pairs. Use the hardware popcount through your language's library call. And masks enumerate 2 to the n subsets, submask enumeration costs 3 to the n, and a bitset does 64 booleans per instruction.

At your desk: the two's complement and shift traces, the mask idioms and the permission example, the bit-by-bit traces of each trick and the SWAR popcount, the two-singletons and adder traces, the submask trace, the tables, and the two exercises.
