---
lesson: two-pointers
source: c8727e6bc7c45136
---
## 1

In the opposite-ends template on a sorted array, the current pair sums to less than the target. Moving the left pointer, lo, one step right: which candidate pairs does that eliminate, and why is it safe?

A, every pair that keeps hi and uses any index from lo upward, because the value at lo is the smallest partner hi has left. B, every pair that keeps lo and uses any index up to hi, because the value at hi is the largest partner lo has left. C, none for certain, because moving lo is a guess that the loop may need to revisit later. D, only the pair lo and hi itself, because lo's other partners have not been compared with it yet.

[think]

The answer is B: every pair that keeps lo, because the value at hi is the largest partner lo has left.

Sortedness bounds every remaining partner of lo by the value at hi. If even the value at lo plus the value at hi is too small, no remaining partner works, so index lo and all its pairs are retired in one move. Retiring every pair that keeps hi is the mirror argument, which justifies moving hi when the sum is too large.

## 2

Your Three Sum solution, run on minus 1, 0, 1, 2, minus 1, minus 4, returns only the triple minus 1, 0, 1. The expected output also contains minus 1, minus 1, 2. What is the most likely bug?

A, duplicate lo and hi values are skipped after a match is recorded. B, the result list is deduplicated through a set of tuples at the end. C, the inner loop keeps running while lo is at most hi, rather than strictly below it. D, the skip for repeated anchors compares each anchor with the next element, not the previous one.

[think]

The answer is D: the anchor skip compares with the next element, not the previous one.

Comparing with the next element skips the first minus 1 as an anchor, so the triple that needs two minus 1s is never formed. Comparing with the previous anchor skips only repeated anchors. Skipping lo and hi duplicates after recording a match is the correct placement, not a bug, and letting lo reach hi adds bad triples rather than losing good ones.

## 3

In Container With Most Water, the left line has height 5 and the right line has height 9. Why is moving the right pointer inward never beneficial?

A, it can be; a taller line to the left of the right pointer might raise the area, so you should try both moves. B, because every container that keeps the left line and uses a line further in is narrower, and still capped at height 5. C, because 9 is the tallest line, so no container without it can be taller. D, because width dominates the area, so the widest pair seen so far always wins.

[think]

The answer is B: every such container is narrower and still capped at 5.

A container's height is the shorter of its two lines. With the shorter line fixed at 5, the height cannot rise, and moving inward only shrinks the width. Only moving the shorter line can raise the cap. Nothing says 9 is the tallest line overall, and trying both moves would make the search exponential.

## 4

The problem asks for the two indices in an unsorted array whose values sum to a target. A candidate sorts the array and runs two pointers from the ends. What is wrong?

A, two pointers needs non-negative values, and the input may hold negatives. B, nothing; sorting and then sweeping two pointers is the optimal approach here. C, sorting loses the original indices, so a map from value to index fits better. D, two pointers breaks when the array holds duplicate values that could pair.

[think]

The answer is C: sorting loses the original indices.

The positions the sweep returns refer to the sorted array, not the input. You would have to carry the indices through the sort, and at that point a single pass with a value-to-index map is simpler and linear. Negatives and duplicates are no problem for two pointers. Its signal is sorted input where the values, not the positions, are the answer.

## 5

In the constant-space Trapping Rain Water solution, the running maximum from the left is 4 and the running maximum from the right is 6. Which position can be settled now, and how much water does it hold?

A, the next right position, holding the updated right maximum minus its height. B, neither side, until the full arrays of left and right maxima are built. C, the next left position, holding the updated left maximum minus its height. D, either side, since both running maxima bound the water from above.

[think]

The answer is C: the next left position, holding the updated left maximum minus its height.

Because the left maximum is no larger than the right one, the true right-side maximum for the next left position is at least 6. So the smaller of its two walls is the updated left maximum, and that side is fully determined. The right side is not, because its left wall might still grow.

## 6

You are intersecting two sorted arrays with multiplicity, and both pointers sit on the value 2. After recording the 2, which move keeps the counts right?

A, advance neither, and count the run of 2s on each side first. B, advance only the first pointer, so the second array's 2 can still match the next 2. C, advance both pointers, because that 2 in each array has been consumed. D, advance only the second pointer, so the first array's 2 can still match the next 2.

[think]

The answer is C: advance both pointers, because each 2 has been consumed.

Each matched element is used once, so both pointers move. Advancing only one side pairs the same element repeatedly, and turns two 2s against one 2 into two matches. Counting the runs gives the same answer with more code, and advancing neither never terminates. The rule that every branch moves at least one pointer is also what bounds the loop by the two lengths combined.
