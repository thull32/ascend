---
lesson: knapsack-family
source: 8301d52f016644be
fit: partial
desk:
  - "The 0/1 knapsack table for the four items and capacity 7, the worked cells, and the walk-back"
  - "The one-row code in both sweep directions, and the upward-sweep trace"
  - "The partition trace as a table and as a bitset, and the target-sum rows"
  - "The family table, the regimes table for huge capacities, and the trade-offs table"
  - "Exercises: 0/1 knapsack, and partition into equal sums"
---
## Introduction

You have a bag that holds 7 kilograms and four items. One kilogram worth 1. Three kilograms worth 4. Four kilograms worth 5. Five kilograms worth 7. Which items maximise value?

Greedy by value takes the 5-kilogram item, then the 1-kilogram one, for 8. Greedy by value per kilogram does the same thing, for 8. The optimum is the 3 and the 4 together, for 9. Greedy fails because items are indivisible: a half-full bag cannot be topped up with a fraction of the next-best item. Allow fractions and greedy by density is optimal; that is the fractional knapsack.

Zero-one knapsack is the template for every "choose a subset under a capacity" problem: subset sum, partition into equal halves, target sum with plus and minus signs, and the variants where items repeat. They are all one recurrence with the sweep direction flipped or the combine operator swapped. That is this lesson.

## The recurrence

The state: the best value using only the first i items, with total weight at most c.

The transition: is the last item in or out? If it is out, the best is the same capacity with one item fewer. If it is in, it uses its weight, and the rest is the best from the earlier items within the capacity that is left, plus this item's value. Take the larger. The base: no items, no value. The answer: all the items, full capacity.

Notice that the take branch reads the row for the earlier items, never the current one. That is what makes each item count at most once.

Why is it correct? Cut and paste. If the last item is in an optimal bag, the rest of that bag must be optimal for the smaller capacity, or swapping in something better would beat the optimum. And the state is sufficient, because the future of a partial packing depends only on which items remain and how much room is left, never on what you already chose.

The running time is the number of items times the capacity. That depends on the value of the capacity, not the number of digits it takes to write it down. So it is pseudo-polynomial: fine at a capacity of a hundred thousand, hopeless at 10 to the 12. A capacity of 10 to the 12 is written in 40 bits but makes 10 to the 12 cells, so the algorithm is exponential in the input size. That is how a polynomial-looking algorithm coexists with knapsack being NP-hard.

## One row and the sweep direction

The transition only reads the previous row, so one array is enough, if you are careful about when each cell is overwritten. To compute a capacity, you need the old value at that capacity, and the old value one item-weight lower.

Sweep the capacity downward, from the top. Then the lower cell has not been touched yet in this pass. It is still the previous row, and each item is used at most once.

What if you sweep upward? Take one item, 2 kilograms worth 3, and a capacity of 6.

[pause]

Upward, capacity 2 becomes 3. Capacity 4 reads capacity 2, which already includes the item, and becomes 6. Capacity 6 becomes 9. You get 9 from a single item worth 3: it was packed three times. Downward gives the correct 3. And on the lesson's four-item example only one cell differs, which is why the bug survives small tests.

Now use that behaviour on purpose. Upward means the item can be taken again and again, which is exactly the unbounded knapsack, where each item has unlimited copies. Same three lines, loop reversed. This is the single most useful thing to know: downward sweep, each item at most once. Upward sweep, unlimited copies. And coin change was unbounded knapsack all along: coins are items, swept upward, minimising the count.

## Subset sum, partition and target sum

Subset sum asks whether some subset sums to exactly a target. It is zero-one knapsack where value does not matter, only feasibility. The state: is this sum reachable with the items so far? The transition: a sum is reachable if it already was, or if the sum minus this item was. Downward sweep. Base: zero is reachable, by the empty subset.

Partition into two equal halves is subset sum on half the total. With 1, 5, 11 and 5, the total is 22, the target 11, and 11 is reachable: by the 11 alone, or by 1, 5 and 5. If the total is odd, the answer is no before you start.

A row of booleans is a row of bits. So "every sum, minus this item, ORed in" is one operation on a whole integer: shift it left by the item and OR it with itself. The shift reads the old bits, so the at-most-once rule comes for free, with no sweep to get wrong. In Python, with 100 items and a target of a hundred thousand, the list of booleans took 0.39 seconds and the bitset a third of a millisecond, about 1,200 times faster.

Target sum asks how many ways to put a plus or minus on each number to reach T. It looks new. Split the numbers into positives and negatives. Their difference is T and their sum is the total, S. So the positives must sum to S plus T, halved. Now it is counting subsets with that sum: subset sum with addition instead of OR. Five ones and a target of 3: the positives must sum to 4, and there are 5 ways to choose four of the five ones. If S plus T is odd, or T is bigger than S, the answer is zero.

The lesson is not the code; it is that problems that feel new are knapsack after an algebraic rewrite. The tell is "choose a subset" plus a numeric constraint.

## The family, and its base cases

Bounded knapsack gives each item a limited number of copies. Expanding into that many copies works but is slow. The standard trick is binary splitting: bundles of 1, 2, 4 and so on, plus a remainder, so every count is a sum of some bundles. Thirteen copies become bundles of 1, 2, 4 and 6. A thousand copies become ten bundles. Then run zero-one on the bundles.

Every row of the family is the same loop. For each item, for each capacity in the right direction, combine the old cell with the cell one weight lower. Before coding a new one, say out loud: how many copies, and therefore which sweep; what the combine is, max, min, OR or plus; and what the zero cell must be so the transition produces the first real cell.

One more ordering rule hides in the counting rows. Items outside and capacity inside counts each multiset once. Swap them, and you count ordered sums. For amount 3 with coins 1 and 2, the combinations are two: three ones, or one plus two. The ordered sums are three, because 1 then 2 and 2 then 1 both count.

And "at most W" versus "exactly W". The transition is the same; the base cases differ. For at most, every capacity starts at zero: an empty bag of any size is worth nothing. For exactly, only capacity zero starts at zero, and everything else starts at minus infinity, because you cannot fill a positive capacity with nothing. On the four items, capacity 2 stays at minus infinity, because no subset weighs exactly 2. Interviewers use this to check whether you know why the base cases are what they are.

## Past the table's limits

As a Python list, a million-cell row costs 8 to 36 megabytes; as a 64-bit array, 8; as a bitset, 125 kilobytes. Time is about 100 nanoseconds a cell in Python, so a hundred million cells is around ten seconds, and well under a second compiled.

When the capacity is huge, the tool changes. If the values are small, flip the axes: index the table by value, and store the minimum weight that achieves each value exactly. The answer is the largest value whose weight fits. With a capacity of a billion but values at most 1,000 and 100 items, that is about a hundred thousand values, and the problem is easy again. This is the one candidates forget.

If everything is huge but there are at most about 40 items, meet in the middle: enumerate the subsets of each half, about a million each, sort one side, and binary search for the best partner. And if an approximate answer is acceptable, there is a scaling scheme that guarantees a result within a chosen fraction of optimal.

## In the interview

A follow-up the lesson expects. Your one-row solution returns 9. Which items?

[pause]

The row cannot say. Keep the two-dimensional table and walk back: at each row, if the value equals the row above, the item was not needed; otherwise it was taken, so subtract its weight and continue. For the four items, that finds the 4-kilogram and 3-kilogram items. Or keep one "taken" bit per item and capacity next to the single row. The wrong answer is recomputing from the row, which has already lost the per-item information.

Another: the capacity is a billion and there are 40 items. The capacity table would be 40 billion cells. Meet in the middle: about a million subsets per half. "Compress the capacity" does not work when weights are arbitrary.

## Recap

Four things to remember. Zero-one knapsack is "is the last item in or out", and the take branch reads the previous row, which is why each item counts once. Downward sweep means at most once; upward means unlimited copies, and that one line turns zero-one into unbounded. Subset sum, partition and target sum are knapsack after a rewrite; use a bitset for large targets, and set the base cases by "at most" or "exactly". And the table is pseudo-polynomial; past it, index by value, meet in the middle, or approximate.

At your desk: the four-item table and walk-back, the one-row code in both directions, the partition and target-sum traces, the family and regimes tables, and the knapsack and partition exercises.
