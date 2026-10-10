---
review: stacks-queues
source: 612104d79e4f0bc5
---
## Introduction

Twelve questions from the stacks-queues module. Answer out loud before the answer comes.

They run through the module in order: ring buffers and the two-stack queue, the monotonic stack, the monotonic deque, and stack applications. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A ring buffer keeps only a head index and a tail index. Why is "head equals tail" ambiguous?

A, it only means empty, since tail can never lap head. B, it holds both when the buffer is empty and when it is full. C, it only means full, since an empty buffer resets both to slot zero. D, it signals a wrap bug, since valid indices never coincide.

[think]

The answer is B: it holds both when the buffer is empty and when it is full.

After you write exactly capacity elements, tail wraps around to equal head, which is the same state as an empty buffer. Tail can lap round to head, so the state does not only mean empty. Store a count, leave one slot unused, or use unbounded indices to tell the two apart.

## Question 2

In the queue built from two stacks, an inbox and an outbox, what breaks the amortised constant-time guarantee?

A, interleaving enqueues and dequeues instead of batching them. B, transferring from inbox to outbox while the outbox is not empty. C, backing both stacks with arrays that sometimes resize. D, calling peek, since it can trigger a transfer with no pop.

[think]

The answer is B: transferring while the outbox is not empty.

Each element should move from inbox to outbox exactly once. Transferring while the outbox still holds elements would mean moving them back to keep the order, and elements would bounce on every operation, making each one linear. Interleaving is fine: every element is still pushed, moved and popped once.

## Question 3

Python's deque gives constant time at both ends, yet indexing into the middle of a deque of a million elements is slow. Why?

A, Python copies the deque to a list before indexing into it. B, indexing rotates the deque to the position, then rotates it back. C, the deque is a linked list of 64-slot blocks, so indexing walks block links. D, the deque stores elements in hash order, so positions need a scan.

[think]

The answer is C: it is a linked list of 64-slot blocks.

Reaching position i means following about i over 64 block pointers from the nearer end, which is linear in the middle. C++'s deque keeps an array of chunk pointers and indexes in constant time. Nothing is rotated, copied or hashed. If you need random access with cheap ends, use a ring buffer.

## Question 4

A monotonic stack algorithm has a while loop nested inside a for loop. Why is it linear rather than quadratic?

A, the inner loop only compares values, so its cost is not counted. B, the stack never holds more than a constant number of indices. C, each index is pushed once and popped at most once over the whole run. D, the while loop pops at most one index per outer iteration.

[think]

The answer is C: each index is pushed once and popped at most once.

The inner loop's iterations are pops. An index can only be popped after being pushed, and is never pushed again, so the while loop's iterations across the whole run total at most n. A single iteration can pop many indices, which is why "at most one per iteration" is wrong. Uneven cost per step, linear total: that is amortised analysis.

## Question 5

In stock span, the span counts consecutive earlier days with a price less than or equal to today's. Scanning for the previous greater price, which pop condition is correct?

A, pop while the price at the top is greater than today's, so the stack stays increasing. B, pop while the top is greater than or equal to today's, so ties end the span. C, pop while the top is strictly less than today's, so ties stay as boundaries. D, pop while the top is less than or equal to today's, so ties join the span.

[think]

The answer is D: pop while the top is less than or equal to today's price.

Equal prices count toward the span, so they must be popped; they are not a boundary. Popping only on strictly less would stop at an equal price and undercount the span. Tie handling is a deliberate choice, not a default.

## Question 6

Sum of subarray minimums over the array 2, 2 should be 6: the subarrays are 2, 2, and the pair. If you compute each element's contribution with previous-smaller and next-smaller boundaries that are both strict, what do you get?

A, 8, because the pair is credited to both elements. B, 6, because strict boundaries stop at the equal neighbour. C, 2, because only the first occurrence of a value is counted. D, 4, because the pair is credited to neither element.

[think]

The answer is A: 8, because the pair is credited to both elements.

With both boundaries strict, neither 2 sees the other as a boundary, so each claims two subarrays, and the pair is counted twice. Making one side strict and the other non-strict credits it to exactly one element and gives 6. Making both non-strict gives 4.

## Question 7

In the sliding window maximum deque, an older element is popped from the back when a later element that is greater than or equal to it arrives. Why is it safe to forget the older element entirely?

A, it has already been reported as the maximum of its window. B, the deque must stay within k entries, so something must go. C, it can be recovered from the prefix maxima if it is needed again. D, every future window containing the older element also contains the larger, newer one.

[think]

The answer is D: every future window that contains it also contains the larger element.

Windows are contiguous, so a window that includes the older index and reaches the present includes the newer one, and its maximum is at least that newer value. This domination argument is the whole invariant. The older element may never have been reported at all, and nothing about capacity forces the pop.

## Question 8

For "shortest subarray with sum at least k" when negative numbers are allowed, why does a two-pointer sliding window fail?

A, the window sum must be recomputed from scratch after each move. B, extending the window no longer guarantees the sum grows. C, two pointers need the array sorted before the window slides. D, two pointers find the longest valid subarray, not the shortest.

[think]

The answer is B: extending the window no longer guarantees the sum grows.

The window technique relies on the sum rising as the right edge moves and falling as the left edge moves, so the decision to shrink or extend is monotone. Negatives break both directions. A running sum still updates in constant time; the problem is the decision rule, not the arithmetic. Prefix sums with a deque of increasing prefix values restore a usable monotone structure.

## Question 9

A rolling 60-second maximum, built on a monotonic deque of timestamp and value pairs, sometimes reports a spike from minutes ago. What is the most likely bug?

A, back pops use less-than-or-equal, so equal values evict the newer sample. B, the deque stores values only, so timestamps cannot be compared. C, the window is count-based, so 60 samples are kept instead of 60 seconds. D, front expiry uses an if, so after a gap in samples, stale entries remain.

[think]

The answer is D: front expiry uses an if instead of a loop.

With irregular samples, several front entries can cross the window edge between two arrivals. An if removes only one of them, and the next stale entry becomes the reported maximum. Expiry must loop. A count-based window would be wrong constantly, not sometimes, and a value-only deque could not expire at all.

## Question 10

A bracket checker pushes openers and pops on closers, and returns true whenever the loop finishes without a mismatch. Which input does it wrongly accept?

A, open round, open square, close round, close square. B, two open round brackets. C, an open curly brace followed by a close curly brace. D, a close round bracket followed by an open round bracket.

[think]

The answer is B: two open round brackets.

Leftover openers never trigger a mismatch inside the loop, so the function must also check that the stack is empty at the end. The crossed input in A fails on a mismatch, the closer-first input in D fails on an empty stack, and the balanced pair in C is correctly accepted.

## Question 11

A min-stack saves space by pushing onto its auxiliary stack only when a new minimum arrives. What subtle bug appears with duplicate values?

A, popping one of two equal minimums drops the auxiliary entry too early. B, the auxiliary stack keeps growing, because duplicates are pushed twice. C, get-min becomes linear, because the auxiliary stack must be rescanned. D, push becomes logarithmic, because the auxiliary stack must stay sorted.

[think]

The answer is A: popping one of two equal minimums drops the auxiliary entry too early.

If you push to the auxiliary stack only on strictly smaller values, two equal minimums on the main stack share one auxiliary entry. Popping the first of them removes that entry and leaves the second minimum unrepresented. Push on less-than-or-equal, or use the parallel-stack version. Every operation stays constant time either way.

## Question 12

In the shunting-yard algorithm, you read a plus sign while the top of the operator stack is a times sign. What happens?

A, both operators are output, because the stack must hold one operator. B, the plus is pushed on top, because later operators always go on top. C, the times is popped to the output first, because it binds at least as tightly. D, the times is discarded, because plus has lower precedence and replaces it.

[think]

The answer is C: the times is popped to the output first.

An incoming left-associative operator pops every stacked operator of greater or equal precedence before it is pushed, so 3 times 4 plus 2 becomes 3, 4, times, 2, plus. That rule, pop while the top binds at least as tightly, is the monotonic-stack invariant applied to precedence. Nothing is ever discarded except parentheses.

## Recap

Three ideas kept coming back. Amortised arguments: each element is pushed once and popped at most once, in the monotonic stack, the deque and the two-stack queue, and anything that moves elements twice breaks the bound. Ambiguity at the boundaries: head equal to tail, ties in the comparison, leftover openers, equal minimums, each needs a deliberate rule. And expiry: a window's oldest elements must leave from the front, with a loop, not a single check, whenever time can jump.
