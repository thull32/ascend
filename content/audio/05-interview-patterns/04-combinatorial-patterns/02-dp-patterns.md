---
lesson: dp-patterns
source: d65f4c3468a723e1
fit: partial
desk:
  - "The Coin Change template, top-down and bottom-up, in Python and JavaScript"
  - "The six state shapes table with their canonical problems, and the near-misses table"
  - "The filled tables: Coin Change for amount 11, LCS of abcde and ace, Word Break, Cooldown, Burst Balloons"
  - "The variations and complexity tables"
  - "The measurements: recursion depth, memo key costs in Node, counts past 2 to the 53, table memory"
  - "Exercises: fewest coins, and counting the decodings of a digit string"
---
## Introduction

"Minimum number of coins." "How many ways." "Longest subsequence." "Can the array be split into two equal halves." Each is an optimisation or a count over an exponential set of choices, and each has a brute-force recursion that takes forever, because it solves the same subproblem again and again.

Take coins for an amount of 11. The recursion reaches amount 9 through three different first coins, and each of those reaches amount 7 several ways, and so on down. But there are only 12 distinct amounts, 0 to 11. Dynamic programming is the observation that if you store the answer for each distinct subproblem, the exponential tree collapses into a small table.

The hard part in an interview is not the table. It is naming the state: the smallest description of a partial solution such that the rest of the problem depends only on that description. Once you can say "dp of i is the answer for the first i items", the recurrence is usually one line and the code is ten.

Four things, then. The signal, and the shapes that state comes in. The four sentences to say before you write code. Why the table is correct, and what to do when a recurrence will not close. And the runtime details that decide whether a correct recurrence passes.

## The signal and the six shapes

Reach for DP when the statement contains a superlative or a count, "minimum", "longest", "number of ways", "is it possible", and the choices overlap: making a choice leaves a smaller instance of the same problem, and different sequences of choices lead to the same smaller instance.

Then classify by the shape of the state. Linear: one sequence, where the answer for a prefix depends on a few earlier positions, like House Robber or Decode Ways. Choice over a target: coins, sum to target, fill a capacity, indexed by the amount. Two sequences: two strings compared or aligned, indexed by a prefix of each, like Longest Common Subsequence and Edit Distance. Grid: paths moving right and down. Interval: substrings, both ends, or "remove one and its neighbours join", indexed by a range. And scan-back: the transition looks at every earlier position, like Word Break and Longest Increasing Subsequence. A seventh shape, the state machine, is a linear DP with a few modes per day, such as holding a stock, just sold, or resting.

Naming three problems with the same shape tells the interviewer you will finish.

What rules DP out? Needing every solution, because memoisation cannot shrink the output; that is backtracking. A local rule that is provably safe; that is greedy, linear where DP is quadratic. No overlap at all. Or a state that would need the whole history, unless that history is a set of at most about 20 items that fits in a bitmask.

The near misses are worth learning by heart, because "minimum" does not mean DP. Fewest jumps to the end is greedy, because the positions reachable in k jumps form one contiguous range. The cheapest path through a grid where you may move in all four directions is Dijkstra. The fewest one-letter changes from one word to another is breadth-first search, because every edge costs one. The most meetings in one room is greedy by earliest end; but the most valuable set of non-overlapping jobs is DP, because the values differ. And the largest contiguous sum is Kadane, linear, not a table over ranges.

## Four sentences before code

Write the brute-force recursion, name the arguments that change, because they are the state, cache it, and convert to a loop only if depth or speed demands it. Before any code, say four things.

The state, in a full sentence with "exactly" or "at most" in it. For Coin Change: dp of a is the fewest coins summing to exactly a. The recurrence, and which choice each term represents: dp of a is one plus the minimum of dp of a minus c, over every coin c, where c is the last coin used. The base cases and the sentinel for impossible: dp of 0 is 0, everything else starts at infinity, because 0 as "impossible" would collide with a real answer. And the order and the answer: fill amounts upward, so every smaller amount is final first, and the answer is dp of the full amount.

Complexity is states times transition cost, said as both factors: amount plus one states, each scanning every coin.

Here is the standard question that follows. "Why not just take the largest coin first?" Have the counterexample ready.

[pause]

Coins 1, 3 and 4, amount 6. Largest first takes 4, then 1 and 1: three coins. The table finds 3 plus 3: two coins. That input is the answer to "why not greedy".

## Why the table is correct

Two arguments, each short enough to say out loud. First, the cases must be exhaustive and optimal. The recurrence splits every solution of a state by one choice, the last coin, the last pair of characters, the last balloon, and each case must reduce to a smaller state whose optimal answer is the one to use. That second part is optimal substructure, argued by cut and paste: if an optimal way to make a ends with coin c, and a cheaper way to make a minus c existed, swapping it in would beat the optimum.

Second, induction over the fill order. If every cell a cell reads is already final when it is computed, then every cell is final when written, and so is the answer. That is why the order is part of the answer, and why four-direction movement breaks grid DP: cells depend on each other in cycles, so no order finalises every neighbour first.

The third idea is the one that unsticks you: state sufficiency. The state must capture everything the future depends on. Try "dp of i is the length of the longest increasing subsequence within the first i elements", on 1, 5, 2, 3. After three elements it is 2, achieved by 1, 5 and by 1, 2. Whether the 3 extends it depends on which one, and the state does not say. The fix changes the definition: the longest increasing subsequence ending exactly at index i. Now the needed fact, the last value, lives in the index. When a recurrence will not close, the state is missing a fact. Add the fact to the index, not to a global variable.

## The moves that unstick a DP

Two sequences. For the longest common subsequence, dp of i, j is the answer for the first i characters of one string and the first j of the other. If the last characters match, extend the diagonal by one. Otherwise take the better of dropping a character from either side. On abcde and ace, the answer is 3. The table has m times n cells, and since each row reads only the row before it, two rows are enough memory. Edit Distance and Interleaving String are the same grid with different three-way choices.

Case-splitting. House Robber on a circle: no two adjacent houses, and the first and last are adjacent. The circle only links those two, so an optimum skips at least one of them. Run the ordinary line version without the first house, then without the last, and take the better. On 1, 2, 3, 1, the two runs give 3 and 4, so the answer is 4. When one constraint links the ends of a linear structure, split on it and reuse the linear solution.

One variable per mode. Stock trading with a day of rest after each sale has three modes per day: holding, sold today, and resting. Today's hold is the better of yesterday's hold and yesterday's rest minus the price. Buying reads rest, never sold, and that one choice encodes the cooldown. The bug that survives most small tests: updating the three variables one after another instead of all from yesterday's values, so today's sale feeds today's purchase and the answer comes out too high.

Choose the last element. In Burst Balloons, bursting a balloon earns the product of it and its current neighbours. Choose which balloon bursts first, and the two halves still interact. Choose which bursts last in a range, and its neighbours at that moment are fixed as the range's two ends, so the halves become independent. Fill by increasing range length: n squared ranges, n choices each, order n cubed. On 3, 1, 5, 8, the best total is 167.

## Loop order, and the factor to attack

Loop order is meaning. Coin Change II counts combinations. With the coin loop outside and amounts inside, each multiset of coins is counted once. Flip them, and orderings are counted separately: coins 1 and 2 for amount 3 give 3, counting 1 plus 2 and 2 plus 1 as different, where the true count is 2. The same kind of rule holds for knapsack: sweep the capacity downward when each item is used once, upward when items are unlimited.

When the interviewer says "now n is 10 to the 5", name the factor to cut, which is usually the transition. Longest increasing subsequence goes from scanning every earlier position to a sorted list of tails plus binary search: on 10 thousand values, 832 milliseconds became 0.7. Word Break bounds its scan by the longest dictionary word: on a 5 thousand character string, 5 thousand checks instead of 12 and a half million, one millisecond instead of 3.4 seconds. "Memoise it" is the wrong answer, because it does not change the number of states.

## Under the hood

Top-down is the least code and the riskiest in Python. A memoised Coin Change with a coin of 1 descends one frame per unit of amount before anything is cached, and CPython stops at 1,000 frames: every amount above 997 raised a recursion error. Raising the limit does not rescue a cached recursion, because each call also passes through the cache's C wrapper: with the limit set to a million, a depth of 20 thousand stopped with a stack overflow. Top-down LCS on two strings of a thousand characters each also ran about four times slower than the table, at 242 milliseconds against 58, and used 128 megabytes for its cache. The expected fix is a loop over amounts upward, which has no depth at all.

In JavaScript, how you key the memo matters. Top-down LCS with a map keyed by a string built from i and j took 216 milliseconds; keyed by one number, 77; a typed array indexed the same way, 15.

And counts outgrow their numbers. JavaScript numbers are exact only up to 2 to the 53. Counting the ways to make an amount from the eight UK coins passes that at 13,512 pence, and from there the table silently drifts in its last digits, with no error. Reduce modulo the requested prime after every addition, or use BigInt.

## In the interview

"Return the actual subsequence, not its length."

[pause]

Keep the full table and walk back from the final cell: on a match, step diagonally and emit the character; otherwise move to the neighbour holding the same value. That is linear after the fill. The wrong answer is storing a best string in every cell, which copies strings everywhere.

"Return every segmentation, not whether one exists." The output is exponential, so backtrack over split points, and use the DP to refuse split points that lead nowhere. Storing lists of sentences in each cell holds the exponential output many times over.

And "memory is limited to order n": two rows, and if the path must be recovered, Hirschberg's divide and conquer, not one row with a claim that the path survives.

## Recap

Five things to remember. A superlative or a count, plus overlapping choices, selects DP; but four-direction grids are Dijkstra, fewest jumps is greedy, and unit-cost transformations are breadth-first search. Say the state in a full sentence, then the recurrence, the base and sentinel, and the order. When a recurrence will not close, add the missing fact to the state. The moves that unstick: case-split, one variable per mode, choose the last element. And cost is states times transition, so a follow-up attacks the transition.

At your desk: the Coin Change template in both languages, the shape and near-miss tables, the five filled tables, the runtime measurements, and the two exercises on fewest coins and decode ways.
