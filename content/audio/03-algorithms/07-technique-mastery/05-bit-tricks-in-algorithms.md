---
lesson: bit-tricks-in-algorithms
source: bbaa305c86be6ea3
fit: partial
desk:
  - "The mask-as-set table, and the member loop that peels off the lowest set bit"
  - "The submask loop and its trace on 1011, and Gosper's hack traced on five bits"
  - "The Held-Karp code, and the sum-over-subsets code with its trace on 1, 2, 4, 8"
  - "The two's complement table for 12, the Fenwick query code, and the Gray code table with its one-bit proof"
  - "The Gray-code subset-sum loop, the bitset partition code, and the three-mask N-Queens code"
  - "Popcount, Python big-integer and JavaScript 32-bit details, the cost numbers, and the set representation table"
  - "Exercises: reflected Gray code, and maximum product of two words with no shared letters"
---
## Introduction

Partition Equal Subset Sum with 200 numbers, each at most 100, asks whether some subset reaches half the total. The textbook answer is a boolean dynamic program over sums up to 10 thousand: 200 times 10 thousand, 2 million cell updates, on the order of a second in Python.

The bitset answer keeps all those booleans as the bits of one integer. For each number x, it shifts the integer left by x and ORs it back in. That is 200 shift-and-OR operations, each running in C over a machine word at a time, and it finishes in milliseconds. Same recurrence, same answer. The speed-up comes from the processor updating dozens of booleans in one instruction.

This lesson is about the algorithms that are only fast because of bit operations. Masks as sets and how to enumerate them, dynamic programming whose states are sets, the lowest-set-bit walk inside a Fenwick tree, Gray codes that change one element at a time, and bitsets that divide the running time by the word size.

## Masks as sets, and how many there are

An n-bit integer is a subset of n elements: bit i is set when element i is in. Then every set operation is one or two machine instructions. Union is OR. Intersection is AND. Difference is AND with the complement. A is a subset of B when A AND NOT B is zero. The size is the popcount, the number of set bits.

Counting from 0 to 2 to the n, minus 1, visits every subset exactly once. And there is a loop worth memorising for every submask of a given mask: subtract 1, then AND with the mask, and repeat until you have yielded zero. Subtracting 1 clears the lowest set bit and sets every bit below it; the AND keeps only positions the mask owns. The result is the next smaller submask, so the loop visits each one once, in decreasing order. A mask with three set bits has 2 to the 3, eight, submasks.

Now the number that decides feasibility. Run that submask loop for every mask, and how many pairs do you visit?

[pause]

3 to the n, not 4 to the n. Each element is in neither set, in the mask only, or in both. Three choices per element. For 15 elements that is about 14 million, which is fine. For 20 it is 3.5 billion, which is not. Knowing it is 3 to the n is what tells you whether "for every set, try every way to split it" will run.

One more enumerator, for subsets of exactly k elements: Gosper's hack computes the next larger integer with the same number of set bits, in a handful of arithmetic and bit operations. Use it when n choose k is small but 2 to the n is not, like choosing 3 of 30 items.

## Dynamic programming over subsets

The shortest route visiting every one of n cities has an n factorial brute force. Held-Karp makes the state the set of cities visited so far, plus the current city: the cheapest path that starts at city 0, visits exactly the cities in the mask, and ends at this one. Each state extends to every unvisited city.

The iteration order deserves a sentence in an interview. Adding a bit to a mask always makes a larger integer, so plain numeric order processes every subset before any of its supersets. That is a valid topological order of the dependencies, and you need no other ordering logic. It is not popcount order, 3 comes before 4, and it does not need to be. If your transitions remove an element instead, iterate downwards.

The cost is 2 to the n times n squared. At 16 cities, about 17 million transitions: feasible. At 25, about 21 billion, and the table alone is about 3.4 gigabytes. Memory stops you before time does, so state it first. Store the table as a flat array, not a dictionary keyed by tuples, which costs about 100 bytes an entry.

Sometimes every mask needs a sum over all of its submasks: for each set of allowed letters, how many words use only those letters? Submask enumeration costs 3 to the n. The sum-over-subsets dynamic program costs n times 2 to the n: one pass per bit, and in pass i, every mask with bit i set adds in the value of the same mask with bit i cleared. The invariant: after the passes for the low bits, each entry sums over the submasks that agree with its mask on every higher bit. Each pass frees one more bit. For 20 elements, that is about 21 million steps instead of 3.5 billion.

## Lowbit and the Fenwick tree

In two's complement, minus x is NOT x, plus 1. Flipping every bit turns x's trailing zeros into ones, and the plus 1 carries through them and stops at x's lowest set bit. So x AND minus x is exactly that lowest set bit, usually called lowbit. Take 12, which is 8 plus 4. Its lowbit is 4. And x AND x minus 1 is the complementary operation: it removes that bit, leaving 8.

A Fenwick tree is built on this. Node i stores the sum of a range ending at i whose length is i's lowbit. A prefix query starts at i and repeatedly subtracts the lowbit. For 13, which is 8 plus 4 plus 1: visit node 13, covering just position 13; then 12, covering 9 through 12; then 8, covering 1 through 8. Three nodes for three set bits, never more than log n. Updates walk the other way, adding the lowbit, climbing to every node whose range contains the position.

## Gray codes: one bit at a time

The reflected binary Gray code orders all n-bit values so that neighbours differ in exactly one bit. For two bits: 0, 1, 3, 2, which in binary is 00, 01, 11, 10. The i-th code is i XOR i shifted right by one.

Why exactly one bit changes: going from i minus 1 to i flips a block of low bits, one more than i's trailing zeros. XOR that block with itself shifted right by one, and only its top bit survives. So the bit that flips at step i is the position of i's lowest set bit. It is determined by i, not by the code.

Engineers use Gray codes in rotary encoders and in counters read across clock domains, because a read taken mid-transition is off by at most one step, never garbage. In algorithms, the one-bit property lets you enumerate every subset while adding or removing one element per step. A running aggregate then costs constant time per subset instead of n. That is what lets a compiled brute force get through all 2 to the 30 subsets of 30 items in seconds: one add or subtract per subset instead of thirty. And the trap: a Gray code is an ordering, not a faster way to count.

## Bitsets and backtracking

Back to the partition problem. In the integer, bit s means "some subset sums to s". Shifting left by x marks every s plus x for every reachable s at once, and the OR is the dynamic program's "or". It is the same recurrence, all sums in parallel.

Be honest about what that buys. A bitset is a constant factor of the word size, 64, or more with vector instructions. It is not an asymptotic improvement: n times S becomes n times S over 64. But dividing by 64 turns 10 billion operations into about 160 million, which is the difference between impossible and a second. The same factor decides triangle counting in dense graphs, by ANDing two adjacency rows and counting the bits, and all-pairs reachability in a directed acyclic graph.

Bits also tighten backtracking. N-Queens keeps three masks: attacked columns, and the two diagonal directions. The diagonal masks shift one place per row, left for one and right for the other, because a queen in column c attacks column c plus 1 and c minus 1 in the next row. The safe squares in a row are one expression, everything not in any of the three masks, and trying them is a lowest-set-bit loop. On an 8 by 8 board it finds the 92 solutions with every safety check a single AND. In Sudoku, one 9-bit mask per row, column and box gives a cell's candidates in one expression, and choosing the cell with the fewest candidates prunes hard.

## In the interview

A follow-up the lesson expects. Your bitmask has 40 elements, and this is JavaScript.

[pause]

JavaScript's bitwise operators convert to 32-bit signed integers and use only the low five bits of a shift count. So 1 shifted left by 35 is 8: element 35 silently aliases element 3, and nothing throws. Use BigInt masks, or split the mask into two numbers of 20 bits each. The wrong answer is "numbers are 64-bit doubles, so 40 bits fit", which ignores what the operators do to them. Python has its own version of this trap: NOT on an unbounded integer gives a negative number, so complement within n bits by XOR with the full mask.

And the classic: derive x AND minus x. Minus x is NOT x plus 1; the carry runs through x's trailing zeros and stops at its lowest set bit, which is the only position where x and minus x are both 1. Quoting the identity without the carry argument fails on the next question, "so what does x AND x minus 1 do?"

## Recap

Four things to remember. Integers are sets: the submask loop visits every submask once, and doing it for every mask costs 3 to the n, which decides feasibility, while sum-over-subsets does it in n times 2 to the n. Numeric order is a topological order for subset dynamic programs that add elements, and memory stops Held-Karp before time does. Lowbit comes from the two's complement carry, and it is the Fenwick tree's walk and the bit a Gray code flips at each step. And bitsets are an honest factor of 64, not a better complexity, often the difference between timing out and passing.

At your desk: the set operation table, the submask and Gosper traces, the Held-Karp and sum-over-subsets code, the two's complement and Gray code tables, the bitset and N-Queens code, the language details, and the two exercises.
