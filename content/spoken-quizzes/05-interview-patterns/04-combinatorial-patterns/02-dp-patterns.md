---
lesson: dp-patterns
source: 1847d885a1ed0bab
---
## 1

Coin Change Two counts combinations. With coins 1 and 2 and an amount of 3, a solution loops over amounts on the outside and coins on the inside. What does it return?

A, 2, which is the correct count. B, 1, since only 1 plus 1 plus 1 is found. C, 4, since 1 plus 1 plus 1 is counted twice. D, 3, since 1 plus 2 and 2 plus 1 both count.

[think]

The answer is D: 3, since 1 plus 2 and 2 plus 1 both count.

With amounts outermost, every ordering of the same coins reaches the amount by a different path and is added separately, so three ones, 1 plus 2, and 2 plus 1 give 3. Putting the coin loop outermost fixes the coin order and counts each combination once, giving the correct 2.

## 2

Which statement of the DP state for the longest increasing subsequence lets the recurrence close?

A, dp of i is the length of the longest increasing subsequence within the first i elements. B, dp of i is the length of the longest increasing run that ends at index i. C, dp of i is 1 if element i exceeds the element before it, and 0 otherwise. D, dp of i is the largest value seen in the first i elements.

[think]

The answer is B: the longest increasing run ending at index i.

Whether a new element extends a subsequence depends on that subsequence's last value. The prefix version loses it: on 1, 5, 2, 3, the first three elements have a longest run of 2, through 1, 5 or through 1, 2, and only one of those accepts the 3. Fixing where the run ends puts the needed fact into the index.

## 3

You want the cheapest path from the top-left to the bottom-right of a grid of costs, and moves may go in all four directions. Why is grid DP the wrong tool?

A, the table would need one extra dimension per direction. B, DP cannot handle a grid wider than a few hundred cells. C, no fill order finalises every neighbour before the cell that reads it. D, grid DP needs every cost in the grid to be positive.

[think]

The answer is C: no fill order finalises each neighbour first.

DP is correct by induction over a fill order in which every state a cell reads is already final. With up and left moves allowed, cells depend on each other in cycles, so no such order exists. With non-negative costs this is a shortest-path problem, and Dijkstra settles cells in order of distance instead.

## 4

A memoised top-down Coin Change in CPython passes every sample, then raises a RecursionError on an amount of 5,000 with a coin of 1 present. What is the fix an interviewer expects?

A, replace the cache decorator with an unbounded LRU cache decorator. B, store the memo in a global dictionary instead of a decorator. C, sort the coins so that the largest one is tried first. D, rewrite it bottom-up, looping over the amounts upward.

[think]

The answer is D: rewrite it bottom-up, looping over amounts upward.

The first call descends one frame per unit of amount before anything is cached, and CPython stops at 1,000 frames. The cache type and where it lives do not change the depth, and trying larger coins first only moves the problem to inputs without them. A loop over amounts has no depth at all.

## 5

Counting coin combinations for large amounts in JavaScript, the answers differ from Python's in the last digit, with no error. What happened?

A, Array fill shared one object across every cell. B, the loop order counted orderings for large amounts. C, integer addition in JavaScript wraps at 2 to the 31, minus 1. D, the counts passed 2 to the 53, and Number rounded them.

[think]

The answer is D: the counts passed 2 to the 53, and were rounded.

JavaScript numbers are doubles, exact for integers only up to 2 to the 53. The count for UK coins passes that near 13,500 pence, and from there on the sums are rounded silently. Reducing modulo the requested prime after each addition, or using BigInt, restores exactness. Plain addition does not wrap at 2 to the 31.

## 6

Burst Balloons defines its table entry for an open interval, between balloons i and j, by the balloon burst last inside it, not the one burst first. Why?

A, choosing first would count every order twice over. B, it lets the table be filled in a single left-to-right pass. C, bursting last means its neighbours are balloons i and j, so the two halves split cleanly. D, it reduces the running time from order n cubed to order n squared.

[think]

The answer is C: its neighbours are i and j, so the halves split.

If balloon k is burst last in the interval, everything between i and k, and between k and j, is gone before it, so its neighbours at that moment are exactly i and j, and the two sides never interact. Bursting k first leaves its neighbours adjacent, so the halves depend on each other. The table is still order n squared intervals with order n choices each, filled by increasing length.
