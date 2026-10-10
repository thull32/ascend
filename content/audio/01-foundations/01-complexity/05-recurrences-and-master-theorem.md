---
lesson: recurrences-and-master-theorem
source: ddf8a1a7522e86bc
fit: partial
desk:
  - "The level-by-level recursion tree tables for the three regimes"
  - "The master theorem's three cases and the Karatsuba, merge sort and case 3 worked examples"
  - "The four shapes the theorem refuses, the Akra-Bazzi worked case and the substitution proofs"
  - "The table of recurrences to recognise on sight, and the merge sort timing check"
  - "Exercises: count the calls of a halving recursion, and generate the Towers of Hanoi moves"
---
## Introduction

You know merge sort is n log n because everyone says so. Then you write something that splits the input into three parts, recurses on two of them and combines with a linear scan, and you have no idea what it costs. Or a recursion that calls itself twice on n minus 1, which is exponential, and the interviewer is waiting for you to notice. Or a recursive binary search in Python that slices the list at each call, and is linear while you believe it is logarithmic.

Loops you can count directly. Recursion you have to unroll, and the tool for that is a recurrence: an equation giving the cost on n in terms of the cost on smaller inputs. Three ideas: how to write one from code, how to solve it by picturing the recursion tree, and the shortcut, the master theorem, along with the shapes it refuses. Most of the algebra belongs at your desk. The picture carries by ear.

## From code to recurrence

Ask two questions about any recursive function. How many recursive calls, on what size? And how much work outside the calls?

Merge sort makes two calls on half the input, then merges in linear time. So the cost on n is twice the cost on n over 2, plus n.

The second question is where mistakes hide. "Outside the calls" includes every slice, every concatenation, every membership test, not only the line you think of as the combine step. A binary search is the cost on half, plus a constant. The same binary search that slices its list before recursing is the cost on half, plus n. That one change turns it from log n into linear. Measured in Python on a million elements: 3.3 milliseconds for the slicing version, under a microsecond for the one that passes indexes.

## Picture the tree

The recursion tree is the method to try first, because it shows you where the cost lives. Each node is one call, labelled with the work it does outside its recursive calls. Add up the work level by level.

For merge sort on 16 elements: the root merges 16. The next level has two calls each merging 8: 16 again. Then four calls of 4: 16. Every level does n work, and there are about log n levels. So n log n.

What decides the answer is whether the work per level stays the same, shrinks, or grows as you go down. Three regimes.

Same at every level: multiply the work per level by the depth. That is merge sort, n log n.

Shrinking going down: say two calls on half, but n squared work outside. The root does 256, the next level 128, then 64. Each level is half the one above, so the total is less than twice the root. The root dominates. N squared.

Growing going down: say four calls on half, with linear work outside. Now the levels do 16, 32, 64, 128, and the leaves do 256. Each level doubles, so the last level dominates, and the number of leaves is n squared. N squared again, for the opposite reason.

Two more shapes to hold. Binary search makes one call on half with constant work: a chain, not a tree, log n deep, so log n. And the Towers of Hanoi makes two calls on n minus 1. The size only drops by one, so the tree is n deep, and it doubles in width at every level. Two to the n.

Naive Fibonacci is that same shape with an uneven split, one call on n minus 1 and one on n minus 2. The tree is not full, but it still grows exponentially, as the golden ratio, about 1.618, to the n. Fibonacci of 25 makes exactly 242,785 calls.

## The master theorem

For recurrences of the exact form "a calls on n over b, plus some work f of n", the tree argument has been done once and for all. The leaf level has n to the power log base b of a nodes. The theorem compares the root's work against that leaf count, and whichever is polynomially bigger wins.

If the leaves win, the answer is the leaf count. If they tie, it is the leaf count times log n. If the root wins, and its work really does shrink going down, the answer is the root's work.

Three examples, said aloud. Merge sort: two calls on half, so the leaf count is n, and the outside work is n. A tie. N log n. Karatsuba multiplication: three calls on half, so the leaf count is n to the log base 2 of 3, about n to the 1.585. The outside work, n, is polynomially smaller. Leaves win: n to the 1.585. And three calls on a third with linear work: the leaf count is n, a tie, n log n.

[pause]

Here is a check on yourself. Three calls on n over 3 is n log n. Three calls on n over 2 is n to the 1.585. Why the difference? Because with halves, three subproblems multiply faster than they shrink. With thirds, they exactly balance.

## Where the theorem goes silent

Four shapes come up regularly that the theorem refuses, and each takes a minute with the tree.

The gap. Two calls on half, with n log n work outside. The outside work beats the leaf count n, but only by a log factor, not by a polynomial. The theorem is silent. The tree is not: the levels do n log n, then a little less, then less again, and they sum to n log squared n. The rule: when the work matches the leaves times a log, you gain exactly one extra log.

Subtractive recurrences. One call on n minus 1 with linear work outside: unroll it, and you get n plus n minus 1 plus n minus 2, down to 1. That is n squared. This is quicksort when the pivot always lands at an end, and selection sort. With two or more calls on n minus a constant, it is exponential whatever the outside work.

Unequal splits. One call on a third, one on two thirds, plus n. The tree is lopsided, but every full level still does exactly n, because the two children's sizes add up to the parent's. So the answer is still n log n, with a bigger constant. When the sizes do not add up, say one call on a half and one on a quarter, a general tool called Akra-Bazzi handles it. But the tree is quicker: each level does three quarters of the level above, a shrinking series, so the root dominates and the answer is linear.

And a shrinking exponent: one call on the square root of n. Change variables and it becomes binary search on the number of bits, so log log n.

There is also substitution: guess the answer and prove it by induction. It is the method of record in proofs and the only one that gives you an explicit constant. Its trap: when the leftover in the induction step is a constant, strengthen the guess; when it grows with n, the guess is wrong.

## Recurrences in disguise

Memoisation changes the recurrence. Naive Fibonacci makes an exponential number of calls; with a memo, each distinct n is computed once. The cost of a memoised function is the number of distinct states times the work per state. Linear.

Lopsided pivots are not quadratic. A pivot that always lands at the 10th percentile still splits by a constant fraction, so the depth is still order log n, about 6.6 times log base 2 of n, and the cost is n log n with a bigger constant. Only removing a constant number of elements each time degrades to quadratic. That is why a random pivot suffices.

And a recurrence is a prediction you can test. Count calls: merge sort on 1,024 elements made exactly 2,047 calls, two n minus 1. Or time it and divide by the prediction. Pure-Python merge sort divided by n log n stayed flat at about 54 nanoseconds per unit, across a 256 times range of n. Flat means the recurrence is right. On quadratic code, that ratio would climb.

In production this shows up three ways. A quicksort with a first-element pivot meets already sorted data and goes quadratic: in Python, 8,000 pre-sorted elements took 589 milliseconds, against under 4 for random ones. A recursion that decrements by one hits the stack limit, 1,000 frames in CPython, the first time the input is long. And a merge step that builds its output by copying the list each time makes the whole thing quadratic, so the divide and conquer buys nothing.

## In the interview

A follow-up the lesson expects. One half's result is used twice, so you call the function three times on n over 2 instead of twice. How much does that cost?

[pause]

It changes two calls on half plus n, which is n log n, into three calls on half plus n, which is n to the 1.585. That is a polynomial factor, because the extra call is made at every node, not once at the top. Compute each subresult once and reuse it. The wrong answer is "one and a half times slower", which is only true if the extra call happened once.

And another: what is the recurrence for merge sort's space? The stack is the tree's depth, log n frames. The live buffers are the current call's n plus its ancestors' halves, which sums to under 2 n, so linear auxiliary space. The wrong answer is "n log n space, one n per level", which confuses total allocation with peak occupancy.

## Recap

Four things to remember. Write a recurrence by asking how many calls on what size, and what work happens outside the calls, including every slice. Picture the tree and name the regime: equal levels give a log factor, shrinking levels mean the root dominates, growing levels mean the leaves dominate. The master theorem compares the root's work with the leaf count, and it goes silent on log gaps, subtractive shapes, unequal splits and square roots. And two calls on n minus 1 is exponential, while any constant-fraction split, however lopsided, is n log n.

At your desk: the level tables, the master theorem's cases and worked examples, Akra-Bazzi and substitution, the recognise-on-sight table, the timing check, and the two exercises.
