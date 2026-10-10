---
review: combinatorial-patterns
source: 49014b6d458bf4b8
---
## Introduction

Twelve questions from the combinatorial-patterns module. Answer out loud before the answer comes.

They run through the module in order, two from each lesson: backtracking, dynamic programming, greedy, bit manipulation, math and geometry, and design problems. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

On an input of ten 1s and ten 2s, generating every subset into a set of tuples makes about a million calls, while the version that skips equal siblings makes 121. Why is the gap so large?

A, hashing tuples is slow, and that cost dominates the run. B, the skip version returns fewer subsets than the set does. C, sorting the input first is what saves most of the work. D, the set version walks every duplicate subtree, and the skip version enters none of them.

[think]

The answer is D: the set walks each duplicate subtree, and the skip enters none.

Both return the same 121 distinct subsets. The set version still visits all the nodes of the unpruned tree, 2 to the 20 of them, and throws the duplicates away afterwards. The skip rule refuses to enter a subtree that would only repeat an earlier sibling, so the number of calls equals the size of the output.

## Question 2

Combination Sum sorts the candidates and breaks out of the loop when a candidate is bigger than what remains. The candidates are 2 to 40, and the target is 40. Compared with using continue, what does break change?

A, it skips the remaining loop iterations, while the number of calls stays the same. B, it makes the search incorrect when the candidates are sorted. C, nothing; the two keywords compile to identical bytecode. D, it cuts the number of recursive calls by a factor of 25.

[think]

The answer is A: it skips the remaining loop iterations, and the calls stay the same.

Continue already avoids the recursive call for a candidate that is too large, so both versions make about 37 thousand calls here. Break also stops scanning the larger candidates after it, which is only sound because the list is sorted and positive. In the measurement, that removed about three quarters of the running time.

## Question 3

Which statement of the DP state for the longest increasing subsequence lets the recurrence close?

A, dp of i is the length of the longest increasing subsequence within the first i elements. B, dp of i is the length of the longest increasing run that ends at index i. C, dp of i is 1 if element i exceeds the element before it, and 0 otherwise. D, dp of i is the largest value seen in the first i elements.

[think]

The answer is B: the longest increasing run ending at index i.

Whether a new element extends a subsequence depends on that subsequence's last value. The prefix version loses it: on 1, 5, 2, 3, the first three elements have a longest run of 2, through 1, 5 or through 1, 2, and only one of those accepts the 3. Fixing where the run ends puts the needed fact into the index.

## Question 4

You want the cheapest path from the top-left to the bottom-right of a grid of costs, and moves may go in all four directions. Why is grid DP the wrong tool?

A, the table would need one extra dimension per direction. B, DP cannot handle a grid wider than a few hundred cells. C, no fill order finalises every neighbour before the cell that reads it. D, grid DP needs every cost in the grid to be positive.

[think]

The answer is C: no fill order finalises each neighbour first.

DP is correct by induction over a fill order in which every state a cell reads is already final. With up and left moves allowed, cells depend on each other in cycles, so no such order exists. With non-negative costs this is a shortest-path problem, and Dijkstra settles cells in order of distance instead.

## Question 5

Earliest finish first is optimal for the number of meetings in one room. Why does it fail when each meeting has a value, and you want the largest total value?

A, it still works, as long as ties go to the higher value. B, the exchange keeps the schedule feasible, but can lose value. C, values make the problem NP-hard, so nothing is exact. D, the sort by end time becomes unstable once values tie.

[think]

The answer is B: the exchange keeps feasibility but can lose value.

The exchange argument swaps an optimum's meeting for one that ends no later. That preserves feasibility and the count, but the swapped-in meeting may be worth less: one from 0 to 2 worth 1, replacing one from 0 to 4 worth 5. Weighted scheduling is solved exactly by DP over meetings sorted by end, with binary search for the last compatible one, in n log n time.

## Question 6

The maximum subarray sum is wanted over an array split across 100 machines. What is the correct way to combine the machines' work?

A, run Kadane on each machine, then take the largest result. B, sort every chunk, then run Kadane on the merged output. C, have each machine send four numbers, its total, best prefix, best suffix and best subarray, and merge those summaries. D, send every element to one machine and run Kadane there.

[think]

The answer is C: merge the four-number summaries.

The best subarray may cross a chunk boundary, so the largest per-chunk answer misses it. Each chunk's summary combines with its neighbour's: the best of the two is the larger of each side's best and the left suffix plus the right prefix. Merging in a tree gives the exact answer with a constant amount of data per chunk. Sorting destroys contiguity.

## Question 7

Every element appears three times, except one. A candidate XORs the whole array. What comes back?

A, the sum of all the values, taken modulo 2 in each bit. B, the singleton XORed with every tripled value, because x XOR x XOR x is x. C, the singleton, which is the correct answer here. D, zero, since every value eventually cancels itself out.

[think]

The answer is B: the singleton XORed with each tripled value.

XOR computes the parity of each bit column, so every value with odd multiplicity survives, and three is odd. Counting each column modulo 3, or the ones-and-twos state machine, recovers the singleton in constant space.

## Question 8

Two threads set different bits of the same 64-bit word in a shared bitset, each with an OR-equals on that word. What can happen, and what fixes it?

A, nothing; each thread only touches its own bit. B, a torn 64-bit write, fixed by using 32-bit words. C, a lost bit, fixed with an atomic OR or a compare-and-swap retry loop. D, a deadlock, fixed by always locking lower words first.

[think]

The answer is C: a lost bit; use an atomic OR or a compare-and-swap loop.

OR-equals is a load, an OR and a store. Both threads can load the same old word, and the second store overwrites the first thread's bit. An atomic fetch-and-OR, or a compare-and-swap loop that retries when the word changed underneath it, makes the update indivisible. Smaller words reduce contention, but they do not remove the race.

## Question 9

A JavaScript robot simulation turns left by taking its direction index minus 1, modulo 4, and it crashes on its first left turn from direction 0. Why?

A, the remainder operator truncates toward zero, so 0 minus 1, modulo 4, is minus 1. B, the direction becomes not-a-number, because it was declared as a constant. C, the remainder operator throws a range error on a negative operand. D, the direction array must be declared with a length.

[think]

The answer is A: the remainder truncates toward zero, giving minus 1.

JavaScript's remainder takes the sign of the dividend, so minus 1 modulo 4 is minus 1, and the direction array at index minus 1 is undefined. Python's takes the sign of the divisor and gives 3. Turning left by adding 3, modulo 4, or normalising the remainder before using it, works in both languages.

## Question 10

Max Points on a Line keys each pair of points by its slope as a float. On three points, the origin, a point about a hundred million out along both axes, and a point one step further along each axis, it reports all three as collinear, but they are not. What is the robust fix?

A, compare slopes with a tolerance of 10 to the minus 9. B, round every slope to nine decimal places. C, key each slope by its rise and run divided by their greatest common divisor, with the sign fixed by one convention. D, use the angle from the arctangent instead of the slope.

[think]

The answer is C: key by the reduced fraction, with a fixed sign.

The two slopes differ by about 10 to the minus 16 and round to the same double, although the cross product is minus 1. Rounding, tolerances and angles are all floats, and only move the failure. Equal ratios have exactly one reduced form once the sign is normalised, so the integer pair is an exact key.

## Question 11

An LFU cache evicts the key with the fewest uses. Why can it run in constant time without a heap?

A, counts are capped at a constant, so a heap is constant time too. B, counts only rise by 1, so a bucket per count plus the minimum count suffice. C, eviction scans every bucket, but the buckets are small. D, hash maps keep their keys sorted by value automatically.

[think]

The answer is B: counts only rise by 1, so buckets and the minimum suffice.

A use moves a key from the bucket for count f to the bucket for f plus 1, and a new key enters bucket 1. So the minimum can only become f plus 1, when bucket f empties, or 1, on an insert. Tracking it in one variable avoids both a heap's decrease-key and any scan over the buckets.

## Question 12

Four Python threads share an unlocked LRU cache. Why can it end up above its capacity, even with the GIL?

A, Python threads have run truly in parallel since version 3.12. B, the GIL is released during every dictionary lookup. C, dictionaries are not thread-safe for concurrent reads. D, the GIL makes each bytecode atomic, not each method.

[think]

The answer is D: the GIL makes each bytecode atomic, not a method.

A thread switch can land between the pointer writes of an unlink and a push to the front, leaving the list and the map disagreeing. In the measurement, the map grew to 300 entries with a capacity of 100, and the list became a cycle. Every get writes to the list, so each public method needs a lock, or the cache must be sharded.

## Recap

Three ideas kept coming back. First, cost lives in the shape of the state: skip duplicate subtrees instead of filtering them, put the missing fact into the DP index, and exploit the fact that LFU counts rise by exactly 1. Second, correctness is an argument you can say: a fill order where every dependency is final, an exchange that keeps both feasibility and value, a summary that combines across boundaries. Third, the runtime has opinions: JavaScript's remainder and doubles, Python's GIL, floats that merge unequal slopes, and shared words that lose bits.
