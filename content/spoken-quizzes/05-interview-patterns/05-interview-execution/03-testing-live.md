---
lesson: testing-live
source: be240c8590fe52eb
---
## 1

An LRU cache's put appends a new node for an existing key without unlinking the old one. The sequence is: put key 1, put key 2, update key 1 to 10, put key 3, get key 2, get key 1. Tracing only the return values, when does the bug first become visible?

A, at get 2, two operations after the cause. B, never, since every return value is right. C, at put 3, since the eviction raises an error. D, at the update of key 1, the operation with the bug.

[think]

The answer is A: at get 2, two operations after the cause.

The update leaves three nodes for two keys, but returns nothing. Put 3 evicts the stale node and deletes the live map entry for key 1, also silently. The first wrong return is get 2, which returns 2 instead of minus 1. Tracing the state, the map's keys and the list's order, or asserting that the list size equals the map size, exposes the bug at the update itself.

## 2

Draining a Python list by popping from the front took 0.21 seconds at 100 thousand elements, and 0.93 seconds at 200 thousand. What does that ratio tell you?

A, the loop is n log n, since the list re-sorts itself. B, the loop is linear, with a large constant factor. C, the timings are noise, and each pop is constant time. D, the loop is quadratic, because each pop shifts the rest.

[think]

The answer is D: the loop is quadratic, because each pop shifts the rest.

Doubling n multiplied the time by about four and a half, the signature of quadratic work. Each pop from the front moves every remaining pointer down one slot, so n pops move about half of n squared slots. A deque's pop-left measured about 2 and then about 5 milliseconds, a factor of about two, which is linear.

## 3

In CPython 3.14, building a string by appending one character at a time in a loop measured 1.6 milliseconds at 100 thousand characters, but 43 milliseconds when another variable also referred to the string. Why?

A, aliased strings are interned, and interning is slow. B, the garbage collector runs on every aliased step. C, a second reference blocks the in-place resize. D, the alias forces the string to be re-encoded as UTF-16.

[think]

The answer is C: a second reference blocks the in-place resize.

CPython can grow a string in place when the variable being assigned holds the only reference. Any other reference forces a full copy on each step, which is quadratic. That is why the advice is to collect the parts and join them, rather than rely on the optimisation. In V8, both appending and prepending were linear, because concatenation builds ropes.

## 4

You have six minutes to test Merge Intervals. Which third input gives the most value per traced row?

A, a 100-thousand-element input, to check the speed. B, the two intervals 1 to 10 and 2 to 3, aimed at the line that updates the end. C, a random list of 30 intervals from your head. D, the example again, traced more slowly.

[think]

The answer is B: 1 to 10 and 2 to 3, aimed at the end-update line.

Spoken tracing costs roughly 10 to 20 seconds a row, so six minutes is about 15 to 25 rows. The two-interval containment case reaches the riskiest line, assigning the end instead of taking a max, in two rows. A 30-interval list costs 30 rows and reaches no specific line. A huge input cannot be traced by hand, and scale is covered by the complexity check.

## 5

The interviewer asks what your merge returns for the intervals 1 to 10 and 2 to 3, and it is wrong. What is the strongest response?

A, rewrite the whole solution using another approach. B, point out that the input is unusual and unlikely to occur. C, add an if-statement for that particular input. D, trace it, fix the root cause, and re-run the earlier cases.

[think]

The answer is D: trace it, fix the root cause, and re-run the earlier cases.

How a found bug is handled is recorded alongside the bug. Tracing, naming the root cause, which is assigning the end instead of taking the max, fixing the logic and running a regression check show the habit interviewers want. A special case is noted as a patch-style fix, arguing about the input reads as defensive, and a rewrite is rarely needed for a local bug.

## 6

With time left and an editor that runs code, why add a randomised test that compares your merge against a brute force on small value ranges?

A, interviewers score the number of tests that ran. B, small ranges hit touching and nested cases often. C, random inputs find performance problems quickly. D, it replaces the need to trace the example by hand.

[think]

The answer is B: small ranges hit touching and nested cases often.

With starts from 0 to 10 and lengths from 0 to 4, collisions, touching endpoints and containment occur constantly. Measured over 20 seeds, the loop caught the touching bug within 13 trials, and the containment bug within 19. It checks logic, not speed, and it complements the hand trace rather than replacing it, because you still need to predict what correct output looks like.
