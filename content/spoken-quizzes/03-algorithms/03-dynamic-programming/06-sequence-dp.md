---
lesson: sequence-dp
source: d3cfbeefe186ef21
---
## 1

For longest increasing subsequence, you define cell i as the longest length among the first i elements. Why does the transition fail?

A, because the prefix's best length does not reveal its last element. B, because the answer must then be the maximum cell rather than the last one. C, it does not fail; this prefix state is the usual definition. D, because duplicate values make the prefix's best length ambiguous.

[think]

The answer is A: the prefix's best length does not reveal its last element.

Two subsequences of the same length can end in very different values, and whether the next element extends one depends on that ending value, which the length alone does not carry. The "ends at i" state carries that information, at the cost of taking a maximum over all cells for the answer. A prefix state would have its answer in the last cell, so the answer's location is not the problem.

## 2

After processing 3, 4, 1 with the fast increasing-subsequence method, the tails array is 1, 4. Which statement is true?

A, the longest increasing subsequence has length 1, because the new 1 replaced the 3. B, tails must be re-sorted after every replacement. C, 1, 4 is a longest increasing subsequence of the input, with length 2. D, the length is 2, but 1, 4 is not a subsequence of the input.

[think]

The answer is D: the length is 2, but 1, 4 is not a subsequence of the input.

The 1 replaced the 3 in the first slot. Each slot only guarantees that some increasing subsequence of that length ends in that value; the slots together need not form a subsequence, and here the 1 comes after the 4. The real answer is 3, 4, length 2, which is the length of tails. And tails stays sorted by construction.

## 3

Kadane's algorithm, with the best sum initialised to zero, is run on minus 3, minus 1, minus 2. What happens?

A, it returns 0, which is wrong, since a subarray must be non-empty. B, it returns minus 3, since the first element seeds the best sum. C, it returns minus 6, since every element joins the run. D, it returns minus 1, the correct answer for this input.

[think]

The answer is A: it returns 0, which is wrong, since a subarray must be non-empty.

Starting the best at zero effectively allows an empty subarray. The running values are correct, minus 3, minus 1 and minus 2, but the initial zero wins the maximum, so it returns 0 instead of minus 1. Initialise the best to the first element, or to minus infinity.

## 4

In the unlimited-transactions stock problem, there are two states per day: free, holding no share, and hold, holding one. Why is the answer free on the last day, rather than the better of free and hold?

A, because selling on the last day beats still holding. B, because the problem forbids buying on the final day. C, it should be the better of the two; free can miss the optimum. D, because hold is always minus infinity by the final day.

[think]

The answer is A: selling on the last day beats still holding.

Cash while holding is cash after the purchase, and selling on the last day at any positive price strictly increases it. The free state already includes that option, so it is always above hold. Hold is finite once any purchase is possible. Taking the maximum is harmless, but it shows you have not reasoned about the states.

## 5

You implement the stock-with-cooldown states in JavaScript as three statements in a row. First, hold becomes the better of hold, and free minus the price. Then sold becomes hold plus the price. Then free becomes the better of free and sold. What is wrong?

A, later lines read today's new values, allowing illegal moves. B, Math max mishandles minus infinity, so hold is never set. C, the three states must be arrays indexed by day to be correct. D, nothing, since JavaScript runs the three statements in order.

[think]

The answer is A: later lines read today's new values, allowing illegal moves.

Each new state must be computed from the previous day's values. Here sold uses the already-updated hold, which buys and sells on the same day, and free uses the already-updated sold, which skips the cooldown. Running in order is exactly the problem. Use temporaries or destructuring assignment; arrays are not required, and Math max handles minus infinity correctly.

## 6

In patience sorting, why can the number of piles never be smaller than the length of the longest increasing subsequence?

A, each pile top is the smallest tail of its length, so the tops form the subsequence. B, cards go on the leftmost possible pile, so piles are never merged. C, each pile decreases from top to bottom, so an increasing run takes at most one card per pile. D, because bisect left returns the pile whose top equals the card.

[think]

The answer is C: each pile decreases top-down, so an increasing run takes at most one card per pile.

Cards in a pile were dealt in order, and each is at most the one below it, so two cards from the same pile can never both be in an increasing subsequence. So the longest one uses at most one card per pile. The matching bound in the other direction comes from predecessor pointers, not from the tops, which need not form a subsequence at all.
