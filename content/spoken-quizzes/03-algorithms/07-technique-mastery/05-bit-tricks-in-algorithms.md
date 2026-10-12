---
lesson: bit-tricks-in-algorithms
source: 6dbbe79da6177775
---
## 1

A table loops, for every mask of 18 elements, over every submask of that mask. Roughly how many pairs of mask and submask is that?

A, 3 to the 18, about 387 million. B, 4 to the 18, about 69 billion. C, 18 times 2 to the 18, about 4.7 million. D, 2 to the 18, about 262 thousand.

[think]

The answer is A: 3 to the 18, about 387 million.

Each element is in neither set, in the mask only, or in both, so the number of pairs is 3 to the n. 4 to the n would count every ordered pair of masks, including pairs where the second is not a submask. At 387 million simple steps, it is feasible in a compiled language and slow in Python.

## 2

Why is it valid to iterate masks in increasing numeric order, for transitions that add one element to a mask?

A, adding a bit always gives a larger integer, so every subset comes before its supersets. B, it is not valid; masks must be sorted by the number of set bits first, or states are missed. C, numeric order is also set-bit-count order, so smaller sets are always done first. D, the transitions commute, so masks can be processed in any order.

[think]

The answer is A: adding a bit always gives a larger integer.

A transition that adds an element moves to a strictly larger number, so numeric order finishes every predecessor before its successors, a valid order for the table. It is not set-bit-count order, since 3, binary 0 1 1, comes before 4, binary 1 0 0, and it does not need to be: sorting by bit count also works, but is unnecessary.

## 3

Consecutive Gray codes, for i minus 1 and for i, differ in which bit?

A, always bit 0, the least significant bit of the code. B, the lowest set bit of i, the bit at i's count of trailing zeros. C, the highest set bit of i. D, the lowest set bit of the Gray code for i.

[think]

The answer is B: the lowest set bit of i.

i XOR i minus 1 is a block of ones, one longer than i's trailing zeros. XOR that block with itself shifted right by one, and only the bit at the trailing-zero count is left. That is why a Gray-code walk over subsets adds or removes exactly that element at step i. The bit depends on i, not on the code: from the code for 1 to the code for 2, bit 1 flips, although the code for 2 has bit 0 as its lowest set bit.

## 4

You replace a boolean subset-sum table with a C plus plus bitset, where each item combines the bitset, with a bitwise or, with itself shifted by the item's value. The table took n times S time. With w the machine word size, what does it become?

A, n times S over w. B, n plus S over w. C, S over w. D, n log S.

[think]

The answer is A: n times S over w.

Each shift and bitwise or processes w bits per instruction, so the work is divided by the word size, but each of the n items still needs a shift over all S over w words, so n stays a factor. It is a constant-factor gain, not an asymptotic one, but a factor of 64 is often the difference between timing out and passing.

## 5

In JavaScript, you build a mask for 40 items by setting bit i with a bitwise or of 1 shifted left by i. What happens for i equal to 35?

A, it silently sets bit 3, because the shift count is taken modulo 32. B, it works, because JavaScript numbers are 64-bit floating-point values. C, it produces infinity, because 2 to the 35 overflows a 32-bit integer. D, it throws a range error, because the shift count is larger than 31.

[think]

The answer is A: it silently sets bit 3, because the shift count is taken modulo 32.

Bitwise operators convert to 32-bit integers and use only the low five bits of the shift count, so shifting by 35 is shifting by 3, and item 35 silently aliases item 3; nothing throws. Numbers are 64-bit floats, but that does not help once a bitwise operator has converted them. Use BigInt, or split the mask into two numbers, when you need more than about 30 bits.

## 6

A sum-over-subsets pass runs on 2 bits, with values 1, 2, 4 and 8 for the masks 0 0, 0 1, 1 0 and 1 1. Only the pass for bit 0 has finished. What does the entry for mask 1 1 hold, and why?

A, 12: the submasks that agree with 1 1 on bit 1, so 8 plus 4. B, 8, unchanged, because 1 1 is only updated during the pass for the highest bit. C, 10: 8 plus 2, because the pass for bit 0 adds the mask with bit 0 cleared. D, 15, the sum over all four submasks, because one pass already reaches every submask.

[think]

The answer is A: 12, the submasks that agree with 1 1 on bit 1.

The pass for bit 0 adds, into every mask with bit 0 set, the entry with bit 0 cleared, which for 1 1 is mask 1 0, worth 4. So it holds 8 plus 4. After each pass, an entry sums the submasks that agree with it on all higher bits. The pass for bit 1 then adds mask 0 1's entry, already 3, giving 15, with every submask counted exactly once.
