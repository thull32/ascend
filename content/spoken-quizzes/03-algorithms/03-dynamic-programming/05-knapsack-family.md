---
lesson: knapsack-family
source: ea54115300b1299c
---
## 1

In the one-row zero-one knapsack, you accidentally sweep the capacity upward. With a single item weighing 2 and worth 3, and a capacity of 6, what do you get?

A, 6, because only capacity 4 reads an already-updated cell. B, 0, because the cell two lower is read before it is filled. C, 3, because each item is still used at most once. D, 9, because the one item is taken three times.

[think]

The answer is D: 9, because the one item is taken three times.

An upward sweep reads the cell two lower after it has already been updated with this item. So capacity 2 becomes 3, capacity 4 becomes 6, and capacity 6 becomes 9. That is the unbounded answer. Every cell from capacity 4 upwards reads an updated cell, not only capacity 4. A downward sweep reads the previous row's values and gives the correct 3.

## 2

Knapsack is NP-hard, yet it has an algorithm that runs in time proportional to n times the capacity W, which looks polynomial. Why is there no contradiction?

A, the table is exact only for small n; large n needs approximation. B, it is not truly NP-hard; the n times W table shows it is in P. C, n times W is exponential in the number of bits used to write W. D, caching states makes NP-hard problems polynomial.

[think]

The answer is C: n times W is exponential in the number of bits used to write W.

Input size is measured in bits. A capacity of 10 to the 12 is written in 40 bits, but it produces 10 to the 12 table cells. So the running time is polynomial in the value of W, but exponential in the input size. That is what pseudo-polynomial means, and it does not put knapsack in P. The table is exact for any n, and useful whenever W is small in absolute terms.

## 3

Target sum asks for the number of ways to put a plus or minus sign on each number so the total reaches T. Call the sum of all the numbers S. Which reduction is correct?

A, count subsets summing to S plus T, over 2, the total of the positives. B, count subsets summing to T, the net total of the positives. C, run unbounded knapsack up to T, since each sign can repeat. D, count subsets summing to S minus T, the total of the negatives.

[think]

The answer is A: count subsets summing to S plus T, over 2.

If the positives sum to P, then P minus the rest, S minus P, equals T, so P is S plus T, over 2. If S plus T is odd, or T is bigger than S in size, the answer is zero. Each such subset matches exactly one sign assignment. The negatives sum to S minus T over 2, not S minus T. Items are used once, so it is zero-one, swept downwards, not unbounded.

## 4

You need the best value with weight exactly W, not at most W. What changes?

A, the base cases: the zero cell is 0 and every other cell starts at minus infinity. B, the combine operator, so a take must land on the capacity exactly. C, nothing; the at-most and exactly answers always coincide. D, the sweep direction, so no capacity is left part-empty.

[think]

The answer is A: the base cases; zero at capacity 0, minus infinity everywhere else.

With every cell starting at zero, an unfilled capacity is worth zero, which is the at-most meaning. With minus infinity everywhere except the zero cell, a capacity can only become finite by adding an item to a capacity that was itself exactly fillable. The sweep and the combine are unchanged, and the two answers differ whenever W cannot be filled exactly.

## 5

A bounded knapsack has an item with 1,000 copies. Which of these is the fastest reasonable approach?

A, expand it into 1,000 identical zero-one items, and run zero-one once. B, split it into bundles of 1, 2, 4, and so on up to 256, plus a remainder, then run zero-one. C, run zero-one knapsack 1,000 times, once for each allowed count. D, run unbounded knapsack, since 1,000 copies is effectively unlimited.

[think]

The answer is B: split it into power-of-two bundles plus a remainder, then run zero-one.

Every count from 0 to 1,000 is the sum of some subset of the bundles, so zero-one on the 10 bundles, 1, 2, 4 up to 256, and then 489, is exact, with a logarithmic number of items instead of 1,000. Expanding is correct, but about 100 times slower. Unbounded ignores the limit and can overshoot it.

## 6

Counting the ways to make the amount 3 from coins of 1 and 2, a colleague loops over amounts on the outside and coins on the inside, and gets 3. The correct number of combinations is 2. What did the code count?

A, ordered sums, so 1 plus 2 and 2 plus 1 were counted separately. B, subsets of coins: 1 alone, 2 alone, and 1 and 2 together. C, each coin at most once, so it dropped the 1 plus 1 plus 1 option. D, nothing is wrong; 3 is the correct number of combinations.

[think]

The answer is A: ordered sums, so 1 plus 2 and 2 plus 1 were counted separately.

With the amount loop outside, each cell gathers every ordering of every multiset: 1 plus 1 plus 1, 1 plus 2, and 2 plus 1 make 3, the count of ordered sums. With coins outside, each multiset is built in one canonical order, and the answer is 2. Both loops sweep upward, so coins are still unlimited in either nesting.
