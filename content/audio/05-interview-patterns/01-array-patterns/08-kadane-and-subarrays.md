---
lesson: kadane-and-subarrays
source: 0b41c2ce22576307
fit: partial
desk:
  - "The Kadane and span templates in Python and JavaScript, and the four-decisions table"
  - "The traces: Maximum Subarray, Maximum Product, Best Time to Buy and Sell, flip one segment"
  - "The one-deletion and at-least-L variant traces"
  - "The hidden-Kadane, near-miss, variants and complexity tables"
  - "The measured per-element costs and the product overflow measurements"
  - "Exercises: maximum circular subarray, and the array repeated k times"
---
## Introduction

An array of integers, some of them negative. Find the contiguous run with the largest sum. There are about n squared over 2 subarrays, so trying them all is quadratic, and at a hundred thousand elements that is five billion additions. Sorting does not help, because contiguity is the whole constraint.

A sliding window looks tempting until you notice that a negative number sometimes helps. In 4, minus 1, 2, 1, the minus 1 is worth keeping, because it connects the 4 to the 2 and the 1. So there is no rule for when to shrink.

Kadane's algorithm solves it in one pass with two variables. A million elements took 19 milliseconds in CPython and under one millisecond in Node. The idea is one question you ask at every index: what is the best subarray that ends exactly here?

Three things, then: how to tell a Kadane problem from its look-alikes, the recurrence and why restarting is safe, and the follow-ups that change it.

## Recognising it

Reach for it when two things hold. You are optimising over contiguous subarrays: the largest or smallest sum, product or score of some run. And the best run ending at one index can be computed from the best run ending at the index before, plus the new element, with a constant amount of state.

The quickest way to separate it from a sliding window is to ask whether the statement gives you an objective or a predicate. "Largest sum", "maximum product", "best profit" are objectives: every subarray has a score, and you want the best score. "Longest subarray with at most k distinct values" or "shortest with sum at least S" are predicates: each subarray is valid or not, and you want the longest or shortest valid one. Objectives go to Kadane. Predicates go to a window. And an exact target, "sum equals k", is neither: that is prefix sums with a hash map.

Kadane often hides. Best Time to Buy and Sell Stock is the maximum subarray of the daily price differences. "Flip one contiguous segment of a bit array to maximise the ones" is Kadane after mapping each 0 to plus 1 and each 1 to minus 1. The largest peak-to-trough fall in a price series, maximum drawdown, is the minimum subarray of the differences. The test is whether a segment's score is a sum of per-element contributions.

## The recurrence

Keep a running value, call it current: the largest sum of any subarray that ends exactly at this index. Every subarray ending here is either this element alone, or some subarray ending one step earlier with this element appended. The best of the second kind is current plus this element. So the new current is the larger of the element alone and current plus the element. Keep a separate best, the largest current you have ever seen.

Take the larger of x and current plus x, and notice when x alone wins: exactly when current is negative. That is the restart rule. If the run ending one step back has a negative sum, throw it away and start fresh.

Why is throwing it away safe? Suppose the best subarray began with a stretch whose sum is negative. Drop that stretch, and what remains has a strictly larger sum. Contradiction. So no optimal subarray starts with a negative-sum prefix, and when current goes negative, it is exactly such a prefix for anything that would extend it.

Say it with a tiny example: 2, minus 1, 3. Current goes 2, then 1, still positive, so keep it, then 4. Best is 4. Now 2, minus 5, 3. Current goes 2, then minus 3, negative, so at the 3 you restart, and the best is 3. Any rule that reacts to "the sum just went down" sees those two arrays the same way, and must get one of them wrong. Kadane does not drop negative elements. It drops prefixes whose sum is negative.

There are two views of the same code. As dynamic programming, it is a one-dimensional table compressed to one variable, and that view extends to products and deletions, because each extra decision adds a state. As prefix sums, the best subarray ending here is the current prefix sum minus the smallest earlier prefix sum. That view handles length constraints. It is one pass, constant space, and optimal, because any algorithm that skips an element cannot know whether it was a huge positive.

## Seeds, products and stock

The first decision to say out loud: is the empty subarray allowed? It decides the seed. If the answer must be non-empty, seed from the first element. For all negatives, say minus 3, minus 1, minus 2, the answer is minus 1, and a reflexive seed of 0 returns the empty subarray instead. That is the most common Kadane bug: every test with a positive element passes, and every all-negative test fails.

The stock problem is the opposite case. Not trading is a legal answer, so seed with 0 and clamp current at 0. Buying on one day and selling on a later one earns the sum of the daily differences in between, so the best trade is the maximum subarray of differences. And current in that form always equals today's price minus the lowest price so far, which is the version most people write. Seeing that equivalence is what lets you find Kadane in a statement that never says subarray.

Products need two running values. Before I say why, think about what a negative number does to a product.

[pause]

A negative element turns the smallest product ending one step back into the largest product ending here. So keep both the largest and the smallest product ending at each index, and compute both from the old pair: the candidates are the element alone, the old high times it, and the old low times it. Zeros need no special case; they reset both to 0.

The trap is updating the high first and then using the new high to compute the low. On minus 1, minus 2, minus 1, that returns 4, a product that multiplies the minus 2 twice. The true answer is 2. Build all three candidates from the old pair, then assign.

Products also leave the numeric range, differently in each runtime. In Python, a long run without zeros becomes a huge integer, and each multiplication slows down with its size, so the linear loop turns quadratic. In JavaScript, the product overflows to infinity, and infinity times a later zero is not a number, which then propagates. The problem's guarantee that the answer fits rules these inputs out.

## The follow-ups that change it

Circular arrays. The answer is either an ordinary Kadane maximum, or the wrapped case: the total minus the minimum subarray, because what you skip is one block in the middle. One trap: if every element is negative, the wrapped formula describes the empty subarray, so return the ordinary answer.

Length at least L. Plain Kadane followed by a length check discards the constrained optimum. Use the prefix-sum view instead: at each position, take the prefix sum minus the minimum of the prefixes at least L positions back. Still one pass. With length at most k, the allowed starts form a sliding range, so you need a monotonic deque of prefix minima.

The array repeated a billion times. A best subarray either fits within two adjacent copies, or it spans whole middle copies, each worth the total. Those help only when the total is positive. So: Kadane on two copies, plus k minus 2 times the total when the total is positive. For minus 1, 3, minus 1, two copies give 4, the total is 1, and the answer is just over a billion: one billion and two.

Data split across a hundred machines. Each machine sends four numbers: its total, its best prefix, its best suffix, and its best subarray. Those combine associatively, left to right, and the combined best is the larger of each side's best and the left suffix plus the right prefix. Sending only each shard's best misses every subarray that crosses a boundary.

## In the interview

Here is the follow-up that comes up most. Now the input is a stream. What changes?

[pause]

Nothing. Kadane is online: it reads each element once, keeps constant state, and has an answer after every element. If you report the span, keep absolute indices for the start and the end. The wrong answer is buffering the stream to run a "real" algorithm at the end.

And the boundary question: which of these is not a Kadane problem? Counting the subarrays whose sum equals k. An exact target has no best-ending-here structure. You need prefix sums and a hash map of prefix counts.

## Recap

Four things to remember. The recurrence: the best subarray ending here is this element alone, or this element appended to the best ending one step back, and restarting is safe because a negative-sum prefix never helps. Ask whether the empty subarray is allowed before you seed; non-empty means seed from the first element. Products need both the largest and the smallest running value, computed from the old pair. And know the boundaries: exact targets go to prefix sums, fixed lengths to a window, length constraints to the prefix-minimum view.

At your desk: the templates, the four worked traces, the deletion and at-least-L traces, the measurements, and the exercises on the circular sum and the repeated array.
