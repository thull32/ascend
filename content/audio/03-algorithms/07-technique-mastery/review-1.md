---
review: technique-mastery
source: a51b05c47972749b
---
## Introduction

Twelve questions from the technique mastery module: sliding windows, two pointers, prefix sums and hashing, meet in the middle and randomisation, bit tricks, and the sweep line. Two from each lesson. Each has four options. Answer out loud before the answer comes.

## Question 1

Which property makes the longest-window template correct, the one that grows on the right and shrinks on the left while the window is invalid?

A, each element is admitted and evicted at most once, so the loop runs in linear time. B, validity survives growing: every window that contains a valid one is valid. C, validity survives shrinking: every sub-window of a valid window is valid. D, the array is sorted, so the window's sum changes monotonically as it moves.

[think]

The answer is C: validity survives shrinking. That property gives two facts: the valid starts for a right end form a suffix, and the smallest valid start never decreases as the right end advances, so the left pointer never has to move back. Closure under growing is the mirror property, which justifies the shortest-window template instead. The admit-once argument proves the running time, not correctness, and sortedness is what two pointers need, not windows.

## Question 2

You need the number of subarrays with sum exactly S, in an array that contains negative numbers. What is the right tool?

A, at-most S minus at-most S minus 1, each with a sliding window. B, prefix sums with a hash map of prefix counts. C, sort the array and move two pointers toward the sum S. D, a sliding window that shrinks while the sum exceeds S.

[think]

The answer is B: prefix sums with a hash map of prefix counts. The at-most trick needs the at-most version to survive shrinking, and with negatives "sum at most S" does not: dropping a negative element can push the sum over S. Prefix sums turn "a range sums to S" into "two prefixes differ by S", which a hash map counts in linear time. Sorting destroys contiguity.

## Question 3

In Container With Most Water, the left wall has height 3 and the right wall has height 9. Why move the left pointer rather than the right?

A, the taller wall is more likely to be part of the best container overall. B, moving either pointer works, since both shrink the width by exactly one. C, every other container using the right wall is narrower, so each one is worse than this. D, every other container using the left wall is narrower, and still capped at height 3.

[think]

The answer is D: every other container using the left wall is narrower and still capped at height 3. The shorter wall caps the height of every pair it belongs to, and the width only shrinks inwards, so its whole row is dominated. Containers using the right wall are narrower too, but their height can exceed 3, so moving the right pointer would discard pairs that could be better and were never proven worse.

## Question 4

Which question is a better fit for sorting plus two pointers than for a hash map?

A, count the pairs whose sum is strictly less than t. B, group the words that are anagrams of each other. C, return the indices of two values that sum exactly to t. D, check whether any value in the array appears twice.

[think]

The answer is A: count the pairs whose sum is strictly less than t. A hash map answers exact-membership questions. Counting pairs below a threshold needs order, which two pointers exploit by adding a whole row of valid pairs per step. The other three are equality questions where hashing wins, and returning original indices is especially awkward after a sort.

## Question 5

The prefix-sum counting template seeds its map with a count of 1 for prefix 0, before the loop starts. Why?

A, it is the empty prefix, the partner for every subarray that starts at index 0. B, it handles negative numbers, whose prefix sums can come back down to zero. C, it prevents a missing-key error on the first lookup, before any prefix is inserted. D, it makes k equal to 0 work, since a zero-sum subarray needs a zero prefix to match.

[think]

The answer is A: it is the empty prefix, the partner for every subarray starting at index 0. A subarray from the very start corresponds to the pair made of the empty prefix and its end. Without the seed, no subarray starting at index 0 is ever counted, whatever k is. It has nothing to do with missing keys, and it is needed with or without negatives.

## Question 6

For "the longest substring in which every vowel appears an even number of times", you keep a 5-bit parity mask. What should the map store for each mask?

A, the longest length seen so far with that mask. B, the first index at which the mask occurred. C, the number of times the mask occurred. D, the last index at which the mask occurred.

[think]

The answer is B: the first index at which the mask occurred. Two equal masks bound a valid substring, and for the longest one ending here, you want the earliest matching start, so you store the first index and never overwrite it. Counts are for counting, last indices are for the shortest, and a stored length loses the start position that future matches need.

## Question 7

You have 36 integers, with absolute values up to a trillion, and must count the subsets that sum exactly to S. Which approach fits?

A, brute force over all 2 to the 36 subsets, pruning any branch whose sum passes S. B, meet in the middle: hash one half's 2 to the 18 sums, and look up S minus x for each sum x of the other half. C, greedy by largest value, adding each item while the running total stays within S. D, dynamic programming over reachable sums, with a count table indexed by every sum up to S.

[think]

The answer is B: meet in the middle. The value range rules out dynamic programming, and 2 to the 36 is about 69 billion subsets. Pruning at S does not help either, because values can be negative, and a sum that passes S can come back. Two halves of about 262 thousand sums each, combined through a hash map of one half's sums, take well under a second. Greedy has no correctness argument for subset sums.

## Question 8

Why do Python, Rust and Go all seed their string or map hashing with randomness chosen at startup, or per map?

A, so each process can use a faster, shorter hash than a fixed secure one. B, so typical keys spread more evenly across buckets than with a fixed hash. C, so an attacker cannot precompute many keys that all collide in one bucket. D, so a keyed hash can double as a checksum that detects corrupted entries.

[think]

The answer is C: so an attacker cannot precompute colliding keys. With a fixed, public hash function, crafted keys can all collide, degrading each operation from constant to linear time and making n inserts quadratic. That is hash flooding. A keyed hash with a secret random key makes collisions unpredictable, which restores the expected constant-time bound for any input. For ordinary keys, a good fixed hash spreads just as well; the randomness only matters against someone who knows the function.

## Question 9

A dynamic program iterates, for every mask of 18 elements, over every submask of that mask. Roughly how many mask and submask pairs is that?

A, 3 to the 18, about 387 million. B, 4 to the 18, about 69 billion. C, 18 times 2 to the 18, about 4.7 million. D, 2 to the 18, about 262 thousand.

[think]

The answer is A: 3 to the 18, about 387 million. Each element is in neither set, in the mask only, or in both, so the number of pairs is 3 to the n. 4 to the n would count every ordered pair of masks, including pairs where the second is not a submask. At 387 million simple steps, it is feasible in a compiled language and slow in Python.

## Question 10

Consecutive Gray codes, the code for i minus 1 and the code for i, differ in exactly one bit. Which one?

A, always bit 0, the least significant bit of the code. B, the lowest set bit of i, the position given by i's trailing zeros. C, the highest set bit of i. D, the lowest set bit of the new code itself.

[think]

The answer is B: the lowest set bit of i. Going from i minus 1 to i flips a block of low bits, one more than i's trailing zeros, and XORing that block with itself shifted right by one leaves only its top bit. That is why a Gray-code walk over subsets adds or removes exactly that element at step i. The bit is determined by i, not by the code: from code 1 to code 3, bit 1 flips, even though the lowest set bit of 3 is bit 0.

## Question 11

Half-open meetings from 0 to 10, 10 to 20, and 5 to 15 are swept with plus 1 and minus 1 events. Which tie rule gives the correct answer of 2 rooms, and why?

A, any order works, because the peak is taken over all events and ties cancel out. B, ends before starts at equal times, so a meeting finishing at 10 frees its room before the next one begins. C, starts before ends at equal times, so a meeting beginning at 10 is counted while its predecessor is still active. D, sort by duration first, because longer meetings should claim rooms before shorter ones.

[think]

The answer is B: ends before starts at equal times. With half-open intervals, a meeting ending at 10 does not overlap one starting at 10, so the minus 1 must be applied first, and sorting by time, then by the change with ends as minus 1, does exactly that. Starts first reports 3 rooms for this input. The order of ties does change the peak, and duration has nothing to do with concurrency.

## Question 12

Why is the integer cross product preferred over angles or slopes for deciding whether three points make a left turn?

A, it returns the turning angle directly, which the angle function only approximates. B, it works for any coordinate magnitude, in every language, without overflow. C, it is exact for integer coordinates, so collinear triples are detected without any tolerance. D, it is faster because it avoids division, although it still needs an epsilon for the zero case.

[think]

The answer is C: it is exact for integer coordinates. The cross product uses only subtraction and multiplication, so on integers its sign is exactly right, and zero means exactly collinear. It does not give an angle, and it can overflow: 8 times the largest coordinate squared must fit the integer type, or stay under 2 to the 53 in JavaScript. And no epsilon is needed, precisely because it is exact.

## Recap

Three ideas kept coming back. First, every technique rests on one property you can say in a sentence: windows need validity to survive shrinking, pointer moves need a whole row or column to be dominated, and prefix differences need an inverse. Second, equality goes to a hash map and order goes to sorting, in pairs, in prefix sums and in meet in the middle. And third, count the real cost before you trust it: 3 to the n for submasks, memory for meet in the middle, and exactness, with integers instead of floats, and seeded hashes against anyone who would pick your worst case.
