---
lesson: sliding-window-mastery
source: 0b5c83acd10910e4
fit: partial
desk:
  - "The heredity table: which window properties survive shrinking, and which survive growing"
  - "The product-below-100 counting trace and its code, with the k at most 1 guard"
  - "The two at-most passes on 1, 2, 1, 2, 3, side by side, and the at-most and exactly code"
  - "The two-stack window aggregate code and the queue animation"
  - "The when-the-window-is-wrong table, the tool comparison table, and the runtime numbers"
  - "Exercises: exactly k distinct, and longest subarray with max minus min within a limit"
---
## Introduction

Count the contiguous subarrays of 1, 2, 1, 2, 3 that contain exactly two distinct values. You know the sliding-window template: grow on the right, shrink on the left while the window is invalid, record. Try it here and it breaks at once.

Stand at the fourth element. The window 1, 2, 1, 2 has two distinct values, and so do 2, 1, 2 and 1, 2. But the single 2 on its own has only one. So the valid starts are not "everything from some left pointer up to the right end". If you shrink, you lose valid subarrays. If you do not, you count invalid ones. There is no correct place for the left pointer to stand.

The template is easy. What this lesson is after is the theorem behind it, which lets you see in ten seconds that the template fails here, and hands you a two-line fix that makes it work anyway. So: the one property a window needs, why the nested loop is linear and the three ways that quietly stops being true, how to count windows and the at-most-k trick, and what to do when the thing you track, a maximum or a greatest common divisor, cannot be subtracted.

## When a window may slide

The template is correct exactly when validity is closed under shrinking: if a window is valid, every window inside it is valid too. Call that property hereditary.

Heredity buys two facts. Fix a right end, and call the smallest valid left end for it L of r. First, the valid starts form a suffix: every start from L of r up to r is valid, because each of those windows sits inside the valid one. Second, L of r never decreases as r moves right. The best window for the next right end, cut back by one element, is a valid window for this right end, so its left end cannot be further left than this one's.

That second fact is the whole algorithm. The left pointer never has to move backwards, so advancing it until the window is valid finds L of r for every right end in one sweep.

Here is the test to run in your head. "At most k distinct values" is hereditary, because removing elements cannot add new values. "Sum at most S, all values non-negative" is hereditary, because removing a non-negative element cannot raise the sum. "Max minus min at most a limit" is hereditary. But "sum at most S" with negatives allowed is not: 5 and minus 5 sum to 0, and the sub-window holding just the 5 sums to 5. And "exactly k distinct" is not: 1, 2 has two distinct values, and 2 alone has one.

There is a mirror image. Some properties survive growing instead: "sum at least S with non-negative values", or "contains every character of a pattern". For those, the same argument turned around gives the shortest-window template: shrink while the window is still valid, and record before each eviction. Longest and shortest are one theorem viewed from two sides.

So in an interview, ask two questions. If I drop an element from either end of a valid window, is it still valid? If I add one, is it still valid? A yes to the first means the longest or counting template. A yes to the second means the shortest template. Two noes means stop reaching for a window, and go to prefix sums with a hash map, a deque over prefix sums, or dynamic programming.

## Why it is linear, and when it quietly is not

The standard objection: there is a while loop inside a for loop, so it must be quadratic. The answer is an amortised argument. Every iteration of either loop moves the left or the right pointer forward by one. Neither ever moves back, and each stops at n, so the total across the whole run is at most 2n iterations. One inner loop may run for many steps, but those steps are paid for by moves of the left pointer that can never happen again. Before going on: what does that argument quietly assume about each step?

[pause]

That every admit, every evict and every validity check is constant time. Three habits break it without changing how the code looks.

The first is checking validity by scanning the state, like counting the non-zero entries of the map on every step. That costs the number of distinct keys per step. For 26 letters you can call it a constant. For arbitrary integers it is quadratic. In the lesson's measurement, on 20 thousand elements with a thousand distinct values, the scanning version was 126 times slower than the incremental one. The fix is a distinct counter updated only when a count goes from 0 to 1 or from 1 to 0, or deleting zero-count keys so the map's size is the distinct count.

The second is an aggregate with no inverse. Sum has subtraction. Maximum, minimum, greatest common divisor and bitwise OR do not, and that gets its own chapter.

The third is copying the window: slicing out the current substring inside the loop copies up to n characters per step. Keep indices, and slice once at the end.

## Counting windows, and the at-most-k trick

Fact one says the valid starts for right end r are exactly L of r through r. That is r minus L of r, plus 1, valid subarrays ending at r. Every subarray has exactly one right end, so adding that up across all right ends counts every valid subarray exactly once, in the same linear pass that would have found the longest.

A tiny example: subarrays of 10, 5, 2, 6 with product below 100. At the 10, one window. At the 5, two. At the 2 the product hits 100, so the 10 is evicted, leaving two windows. At the 6, three. One plus two plus two plus three is 8. There are 10 subarrays in total and exactly two fail, 10, 5, 2 at 100 and the whole array at 600, so 8 is right.

One trap hides in that code. If k is 1 or less, no product of positive integers is below it, and the shrink loop empties the window, still finds it invalid, because an empty product is 1, and keeps evicting past the right end. Depending on the language you get an index error, a corrupted product, or a negative count. Make the empty window a legal place for every shrink loop to stop.

Now the opening problem. "Exactly k distinct" is not hereditary, but "at most k distinct" is. And the windows with at most k distinct values split cleanly into those with exactly k and those with at most k minus 1. So exactly k is at-most k minus at-most k minus 1, and each term is one hereditary counting pass.

On 1, 2, 1, 2, 3 with k equal to 2: the at-most-two pass adds 1, 2, 3, 4, and then at the 3 it has to evict three elements before only two distinct values remain, and adds 2. That is 12. The at-most-one pass adds 1 at every position: 5. The answer is 12 minus 5, which is 7.

The same subtraction handles exactly k odd numbers, binary subarrays with sum exactly S, and exactly k zeros. It does not rescue "sum exactly S with negatives", because "sum at most S" is not hereditary there. That one needs prefix sums and a hash map.

## Shrink discipline

While is the default shrink, not if. A single admit can need several evictions: in that trace, one admit forced three.

The famous exception is Longest Repeating Character Replacement. A window is valid when its length minus the count of its most common letter is at most k. The accepted solution uses if, never really shrinks, and never lowers the best frequency it has seen, even after that letter leaves the window. Candidates memorise this and cannot defend it. Here is the defence.

The window's length is always the best answer so far, and the answer can grow by at most one per step. So the only question at each step is whether a valid window one longer now exists. If the check passes with the stale frequency, that frequency was reached in some earlier window no longer than the new length, and stretching that window to the new length keeps it valid. So growing is justified, even when the current window is not that valid window. If the check fails, the only new candidate is the current window, and its true maximum count is no higher than the stale one, so it really is invalid. Two sentences in an interview. If you cannot produce them under pressure, write the honest while version, recompute the maximum over 26 letters, and say so.

Where to record follows from the theorem too. For longest and for counting, record after the shrink, when the window is valid. For shortest, record inside the shrink loop, before each eviction.

## Aggregates you cannot subtract

"Longest subarray where max minus min is within a limit" is hereditary, so the pointers move correctly. The trouble is the state. When the current maximum leaves, a single running number cannot tell you the next one.

For max and min, use a monotonic deque. Keep indices whose values are decreasing. Before adding a new element, pop from the back everything no larger than it: those values can never be the maximum again, because the new one is at least as big and will stay in the window longer. The front is the maximum, and when the left pointer passes it, pop it from the front. Each index goes in once and out at most once, so it is amortised constant time.

For any associative operation, greatest common divisor, bitwise AND and OR, use a queue built from two stacks. Each stack entry stores its value plus the aggregate of everything beneath it, so the top of each stack holds that stack's whole aggregate, and the window's aggregate is those two combined. When the front stack runs dry, move the back stack across and recompute on the way. Each element crosses once, so it is amortised constant time too. That is about 3 million operations for a million elements, where a segment tree's log n per query does about 20 million.

And for bitwise OR specifically, there is a cheaper trick: keep 32 per-bit counters. Counts can be subtracted, and the OR is every bit with a positive counter. Turning an aggregate you cannot invert into a vector of ones you can is worth trying first.

## In the interview

The pivot to see coming is negative numbers. The moment the array can hold them, "sum" stops being monotone under shrinking, and the sum window is dead. Say so out loud before switching tools.

Here is the follow-up the lesson expects. The array now contains negative numbers. Which of your window solutions survive?

[pause]

Anything whose property does not depend on sign, like at most k distinct or at most k zeros, is unaffected. Anything about sums or products loses heredity and moves to prefix sums. The wrong answers are a blanket "negatives break sliding windows", or the opposite, not noticing that the sum-based window is now quietly wrong.

And the classic: prove the running time. The left plus the right pointer starts at 0, rises by one on every iteration of either loop, and never exceeds 2n. So there are at most 2n iterations, each constant given incremental state. The wrong answer is "the inner loop rarely runs", which is an observation about typical data, not a bound.

## Recap

Four things to remember. A window works when validity is closed under shrinking; that is why the left pointer never moves back, and closure under growing gives the shortest-window mirror. The linear bound is 2n pointer moves, and it silently fails with scanned validity checks, aggregates without an inverse, and copied windows. Count with r minus L of r plus 1, and turn exactly k into at-most k minus at-most k minus 1. And when an element leaving cannot be subtracted, reach for a monotonic deque, a two-stack queue, or per-bit counters.

At your desk: the heredity table, the counting and at-most traces with their code, the two-stack aggregate, the comparison tables, and the two exercises.
