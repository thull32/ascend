---
lesson: sequence-dp
source: 5a94bfae6f4cd3d7
fit: partial
desk:
  - "The quadratic LIS trace, the patience-sorting piles, and the two binary-search probe traces"
  - "Reconstructing the LIS with prev and top, and the LIS method comparison table"
  - "The Kadane and maximum-product traces"
  - "The stock state diagram, the cooldown table, and the two-transaction trace"
  - "Exercises: LIS with a hand-written binary search, and stock with cooldown"
---
## Introduction

Stock prices for a week: 7, 1, 5, 3, 6, 4. Buy once, sell once: buy at 1, sell at 6, profit 5. One pass tracking the lowest price so far does it. Now allow unlimited trades, but with a one-day cooldown after each sale. Or at most two trades. Or a fee per trade. Each variant seems to need a new trick, and the internet is full of ad-hoc solutions to each.

There is one idea that solves all of them: put what you are currently holding into the state. Then the transitions become a small state machine you can draw.

Sequence problems are the family where the state is an index, plus sometimes a little extra about the situation at that index: the last element chosen, whether you hold a share, how many trades remain. Three members: longest increasing subsequence, in quadratic time and then much faster; maximum subarray, which is Kadane's algorithm; and the buy-and-sell state machines.

## Longest increasing subsequence

The natural first state is the longest increasing subsequence among the first i elements. It fails. Knowing the answer for a prefix is 2 tells you nothing about whether the next element extends it, because you do not know what that subsequence ends with.

So make the state end there. The state: the length of the longest increasing subsequence that ends exactly at index i. The transition: the element before it is some earlier, smaller element j, and before that, the best subsequence ending at j. So it is one plus the best over every earlier smaller element, or just 1 if there is none.

The answer is the maximum over all cells, not the last cell, because the subsequence can end anywhere. Forgetting that is the classic bug. End the array on a small value, say 1, 2, 0, and the last cell says 1 while the answer is 2. The code is right whenever the array happens to end on its longest run, and wrong otherwise.

Why is "ends at i" a sufficient state? Whether a later element can extend a subsequence depends only on its last value, and i fixes the last value. Two subsequences ending at the same index are interchangeable for every future decision, so only the longer matters.

Each cell scans everything before it, so this is n squared. In Python, about 40 nanoseconds per inner step: 4,000 elements take a third of a second, and a hundred thousand would take about four minutes. The "ends at i" pattern recurs constantly. Whenever the transition needs the last element chosen, end the state at that element.

## Patience sorting

The faster algorithm stores something different, so that the scan becomes a binary search. It is easiest to see as a card game. Deal the numbers one at a time. Each card goes on the leftmost pile whose top card is greater than or equal to it. If there is none, it starts a new pile on the right.

A tiny deal: 2, 5, 3, 7. The 2 starts a pile. The 5 is bigger than every top, so it starts a second pile. The 3 goes on the 5, the leftmost top that is at least 3. The 7 starts a third pile. Three piles, and the longest increasing subsequence has length 3: 2, 3, 7.

Why does the pile count equal the answer?

[pause]

At most: within a pile, cards decrease from bottom to top, in the order they were dealt, so an increasing subsequence can use at most one card per pile. At least: when a card lands on a pile, the top of the pile to its left was smaller and dealt earlier, so it can be recorded as the card's predecessor, and following predecessors from the last pile gives one card per pile.

The code keeps only the pile tops, called tails. Tails at slot k is the smallest possible last element of an increasing subsequence of length k plus one. It is always sorted, so finding the pile is a binary search: the first tail at least as big as the new value. That is n log n. With 4,000 random values, the quadratic version took a third of a second and tails took 0.4 milliseconds, roughly 750 times faster.

Two things to say out loud. First, tails is not in general a valid subsequence. Run it on 3, 4, 1: tails becomes 3, 4, then the 1 replaces the 3, giving 1, 4. That is not a subsequence of the input, since the 1 comes after the 4. The length, 2, is still right. To recover the real subsequence, store each element's predecessor as you place it and walk back. Second, it is online: one pass, keeping only the pile tops, so it works on a stream.

And one line switches strict and non-strict. Searching for the first tail greater than or equal gives strictly increasing; three sevens give 1. Searching for the first tail strictly greater gives non-decreasing; three sevens give 3. Interviewers switch between the two to see whether you know which line changes.

## Maximum subarray

Find the contiguous run with the largest sum. Same trick: the state is the best sum of a subarray that ends exactly at i. The transition: either the element alone, or the element added to the best run ending one before. In words: add the previous run only if it is positive. The answer is the maximum over all cells.

Because each cell reads only the one before, one variable is enough. That is Kadane's algorithm. It is not a separate trick; it is this table with the rolling-variable optimisation.

The all-negative case matters. For minus 3, minus 1, minus 2, the answer is minus 1, because the subarray must be non-empty. Initialise the best to zero and you return zero, which is wrong. Initialise it to the first element.

Maximum product looks the same, but a negative times a negative is positive, so the best product ending here might come from the worst product ending one before. Track both. For minus 2, 3, minus 4: the worst run ending at the 3 is minus 6, and minus 4 times minus 6 is 24, the answer. A single-track version cannot find it.

## The buy and sell machine

Back to the stocks. What the transition needs to know on day i is whether you currently hold a share. So make two states: the most cash after day i if you end holding a share, and the most cash if you end holding none. Cash can be negative, because you bought.

The transitions, for unlimited trades. Holding today: either you were holding yesterday and rested, or you were free yesterday and bought today. Free today: either you were free and rested, or you were holding and sold today. The answer is the free state on the last day; ending with a share is never better than having sold it. On 7, 1, 5, 3, 6, 4 that gives 7: buy at 1, sell at 5, buy at 3, sell at 6.

Why is that enough? Tomorrow's legal moves depend only on whether you hold a share, and the goal is cash, so the best cash in each status summarises every history that matters. And on any day you rest, buy from free, or sell from holding; the two expressions list exactly those.

Now every variant is an edit to the diagram. Cooldown: add a third state, sold today. Selling moves you to sold, and sold moves to free the next day. On 1, 2, 3, 0, 2, the answer is 3: buy at 1, sell at 2, cool down, buy at 0, sell at 2. Without the cooldown it would be 4. A fee: subtract it when you sell. At most k trades: add the number of trades used to the state, and the work becomes n times k. And when k is at least half the number of days, the limit can never bind, because each trade needs two days, so solve the unlimited version.

One implementation trap. Every new value must be computed from yesterday's values. If you update holding, then compute sold from the new holding, you have bought and sold on the same day, and if free reads the new sold, you have skipped the cooldown. Python's tuple assignment does it right; in JavaScript, compute into temporaries first. The bug is invisible on most inputs and fatal on the right one, which is why interviewers like this problem.

## The recipe

Step back. In every one of these, the state is the index plus the minimum summary of the past that the next decision depends on. For longest increasing subsequence, "ends at i" encodes the last element. For maximum product, the best and the worst. For stocks, holding or not, plus cooldown, plus trades used. For painting houses, the colour used last.

So when a first state gives a transition you cannot justify, that summary is what is missing. Draw the situations you can be in after element i, and the legal moves between them, and you have both the state and the transition.

And know when this is the wrong tool. Maximum subarray of length at most k is a sliding-window problem with a deque over prefix sums, linear time; Kadane cannot enforce a length. Counting the longest increasing subsequences needs the quadratic table or a Fenwick tree, because tails throws away what it overwrites. And memoised recursion is rarely right here: the states are dense and the depth is n.

## In the interview

A follow-up the lesson expects. Russian doll envelopes: nest width and height pairs, strictly increasing in both.

[pause]

Sort by width ascending, and for equal widths by height descending, then run the longest increasing subsequence on heights. The descending tie-break stops two envelopes of the same width from chaining. n log n. The wrong answer is sorting both ascending, which nests a 5 by 4 envelope inside a 5 by 6.

Another: at most a billion trades on a hundred thousand days. A billion is far more than half the days, so the limit cannot bind; it is the unlimited problem, solved in one pass. Allocating days times trades is the wrong answer.

## Recap

Four things to remember. When the transition needs the last element, end the state there, and take the maximum over all cells. The fast increasing subsequence is patience sorting: one card per pile bounds it above, predecessors bound it below, and tails gives the length but is not the subsequence. Kadane is a table with one rolling variable; seed it with the first element. And every stock variant is a state machine: put what you hold into the state, and update all states from yesterday's values at once.

At your desk: the quadratic trace, the piles and the binary-search probes, reconstruction, the Kadane and product traces, the stock diagram and tables, and the two exercises.
