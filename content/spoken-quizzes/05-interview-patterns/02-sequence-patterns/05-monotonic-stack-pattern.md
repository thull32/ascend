---
lesson: monotonic-stack-pattern
source: 3bb544973a15939c
---
## 1

A monotonic-stack pass over n elements has a while loop inside a for loop. What is the tightest bound on the number of times the while condition is checked?

A, about n log n, because pops shrink the stack geometrically. B, at most 2n, because each check either pops or ends that iteration's loop. C, about n squared over 2, in the worst case of a descending input. D, at most n, because each element is compared exactly once.

[think]

The answer is B: at most 2n.

Every check either pops, which happens at most n times over the whole run because each index is pushed once, or fails and ends the loop, which happens once per element. A descending input never pops, so it does n failing checks, not a quadratic number. And a single element can be compared several times, so exactly once per element is wrong.

## 2

Daily Temperatures asks for the wait until a strictly warmer day. The input has two consecutive days at 34 degrees. Which pop condition is correct, and what does the other one return for the first 34?

A, either condition works, since equal days are resolved later anyway. B, pop while the top is at most the current temperature; the other answers 1 for the first 34. C, pop while the top is at most the current temperature; the other answers 0 for the first 34. D, pop while the top is below the current temperature; the other answers 1 for the first 34.

[think]

The answer is D: pop while the top is below the current; the other answers 1.

Strictly warmer means an equal temperature must not resolve a waiting day, so the condition is strictly less than. With at most, the second 34 pops the first and records a wait of 1, claiming 34 is warmer than 34. In the traced input, that changes the answer from 2 to 1.

## 3

In the circular next-greater-element algorithm, you iterate i from 0 to 2n minus 1, reading the array at i modulo n. Why do you push indices only while i is less than n?

A, the maximum element must be popped before the second lap starts. B, pushing in the second lap would turn the stack from decreasing to increasing. C, otherwise the second lap reads values past the end of the array. D, pushing in the second lap would put each index on the stack twice.

[think]

The answer is D: every index would go on the stack twice.

The second lap exists so that waiting indices can see the elements before them, wrapping once. Pushing again adds a second copy of every index, and those copies would record answers from a third lap's point of view, or overwrite correct ones. The modulo already keeps reads in range, and the maximum correctly stays on the stack with an answer of minus 1.

## 4

Largest Rectangle in Histogram runs on the heights 3, 1, 3, 3, 2, 4, popping while the top bar is strictly taller than the current one. When index 4, of height 2, arrives, the right-hand 3, at index 3, is popped with a width of only 1. Is the algorithm wrong?

A, yes, and switching to taller-or-equal is needed to measure the width of 2. B, no: index 2 is popped next, with its left wall at index 1 and a width of 2. C, no, because the answer comes from the height-1 bar anyway. D, yes: the equal bar should have stopped the stack from growing.

[think]

The answer is B: no, index 2 is popped next, with width 2.

With a strict comparison, equal bars stack up, so the right copy's recorded left wall is the equal bar, and its width is understated. The left copy, popped immediately after, sees the true left wall at index 1 and gets width 2, an area of 6. One bar of each equal run always gets the full width, so the maximum, 8, is correct. With taller-or-equal the roles swap, and it is equally correct.

## 5

A JavaScript sliding-window maximum passes random tests, but times out on a long input sorted in descending order. What is the most likely cause?

A, the comparison should be at most, so that equal values are evicted. B, V8 falls back to dictionary mode for arrays of indices. C, shift moves every element, and the deque is full on this input. D, descending input makes the monotonic deque pop every element.

[think]

The answer is C: shift moves every element, and the deque is full.

On a descending input nothing is popped from the back, so the deque holds k indices, and each shift copies all of them: order n times k overall. It measured 313 milliseconds, against 2.3 with a head index. On random data the deque stays short, which hides the problem. A head index or a ring buffer restores linear time.

## 6

An interviewer asks for the maximum over many arbitrary ranges of a static array. What do you reach for?

A, a sparse table: constant time per query, after n log n preprocessing. B, a monotonic stack, rerun for each query range. C, a max-heap of all the elements, with lazy deletion. D, a monotonic deque slid across every query range.

[think]

The answer is A: a sparse table, constant time per query.

The monotonic stack answers nearest greater for every element in one pass. It has no way to answer an arbitrary range without rerunning, which is linear per query. A sparse table precomputes the maxima of power-of-two blocks, and answers any range with two overlapping blocks in constant time. With updates, a segment tree gives log n.
