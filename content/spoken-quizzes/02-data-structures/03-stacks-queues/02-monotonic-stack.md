---
lesson: monotonic-stack
source: 589375f2073e5e1a
---
## 1

A monotonic stack algorithm has a while loop nested inside a for loop. Why is it linear rather than quadratic?

A, the inner loop only compares values, so its cost is not counted. B, the stack never holds more than a constant number of indexes. C, each index is pushed once and popped at most once over the whole run. D, the while loop pops at most one index per outer iteration.

[think]

The answer is C: each index is pushed once and popped at most once over the whole run.

The inner loop's iterations are pops. An index can only be popped after being pushed, and is never pushed again, so the while loop's iterations across the whole run total at most n. A single iteration can pop many indexes, which is why "at most one per iteration" is wrong. Uneven cost per step, linear total: that is amortised analysis.

## 2

For next greater element, what order must the values on the stack be in, from bottom to top?

A, unordered, since each index is only compared with the top. B, decreasing, so the top is the smallest value still waiting. C, increasing, so each pop yields the next greater element. D, increasing, so the top is the largest value still waiting.

[think]

The answer is B: decreasing, so the top is the smallest value still waiting.

Every index on the stack is still waiting for a greater element. If a larger value sat below a smaller one, the smaller one would have popped it when it arrived, which is a contradiction, so the stack is decreasing. An increasing stack answers the next smaller question instead.

## 3

In stock span, the span counts consecutive earlier days with a price less than or equal to today's. Scanning for the previous greater price, which pop condition is correct?

A, pop while the price at the top is greater than today's, so the stack stays increasing. B, pop while the top is greater than or equal to today's, so ties end the span. C, pop while the top is strictly less than today's, so ties stay as boundaries. D, pop while the top is less than or equal to today's, so ties join the span.

[think]

The answer is D: pop while the top is less than or equal to today's, so ties join the span.

Equal prices count toward the span, so they must be popped; they are not a boundary. Popping only on strictly less would stop at an equal price and undercount the span. Tie handling is a deliberate choice, not a default.

## 4

In the largest-rectangle-in-a-histogram algorithm, bar j is popped when bar i arrives with a smaller height. After popping j, call the new stack top left. What is the width of j's rectangle?

A, j minus left. B, i minus left, minus 1. C, i minus left. D, i minus j.

[think]

The answer is B: i minus left, minus 1.

The rectangle at j's height runs from one past the previous smaller bar, left, or minus 1 if the stack is empty, to one before the next smaller bar, i. Both boundaries are exclusive, giving i minus left, minus 1 bars. I minus left counts one boundary bar too many, and i minus j ignores the taller bars to j's left that were popped earlier.

## 5

The sum of subarray minimums over the array 2, 2 should be 6: the subarrays are 2, 2, and the pair. If you compute each element's contribution with previous-smaller and next-smaller boundaries that are both strict, what do you get?

A, 8, because the pair is credited to both elements. B, 6, because strict boundaries stop at the equal neighbour. C, 2, because only the first occurrence of a value is counted. D, 4, because the pair is credited to neither element.

[think]

The answer is A: 8, because the pair is credited to both elements.

With both boundaries strict, neither 2 sees the other as a boundary, so each claims two subarrays, and the pair is counted twice. Making one side non-strict credits the pair to exactly one element and gives 6. Making both non-strict gives 4.

## 6

Which problem is not naturally a monotonic stack problem?

A, sliding window maximum of size k. B, the sum of minimums over all subarrays. C, daily temperatures, waiting for a warmer day. D, the largest rectangle in a histogram.

[think]

The answer is A: sliding window maximum of size k.

Sliding window maximum has to discard elements that leave the window from the front, while keeping order at the back, and that needs a deque; the monotonic deque lesson covers it. The other three ask about the nearest greater or smaller boundaries.
