---
lesson: two-pointers
source: 9e9f8f5a4ee98fa6
fit: partial
desk:
  - "The pair-with-sum and read-write compaction templates, in Python and JavaScript"
  - "The Three Sum, Container With Most Water and Trapping Rain Water traces, step by step"
  - "The keep-at-most-k-copies compaction and its trace"
  - "The variants table and the pair-with-sum approaches compared"
  - "Exercises: count pairs below a target, and intersect two sorted arrays with multiplicity"
---
## Introduction

You need a pair of elements with some property. They sum to a target, or they hold the most water, or they mirror each other. The obvious code is a nested loop that checks every pair. That is order n squared, and for 100 thousand elements it is 5 billion checks. At the roughly 10 million simple loop iterations a second that CPython manages, that is about eight minutes for one test case.

The interviewer knows you can write the nested loop. The question is whether you can see the structure that lets you skip almost all of it.

Two pointers is that structure. When the input has an order, one comparison tells you that an entire row of pairs cannot contain the answer. You throw that row away by moving one pointer, and after at most n moves you are done. The pattern is not "use two variables". It is "each step eliminates many candidates, and I can say which ones and why."

Three things, then. How to recognise it from the problem statement. The invariant that makes it correct, for each of its two shapes. And the classic problems, with the traps that cost people the round.

## The signal

Reach for two pointers when the statement gives you one of these. The array is sorted, or you are allowed to sort it, and you want pairs or triples with a condition on their sum or difference. Sortedness is what makes moving a pointer a safe decision.

Or the statement says "in place", or "constant extra space", on an array you are compacting, partitioning or reordering. That is the same-direction form: one pointer reads, one writes.

Or it is a palindrome, or anything phrased as comparing the front to the back. Or a value depends on both ends, and only the weaker end is worth moving, which is the water problems. Or you have two sorted sequences to merge, intersect or compare.

The near-misses matter just as much. If the array is unsorted and you must return the original indices, it is a hash map: sorting destroys the indices, and a map from value to index finds the complement in one pass. If the question asks for the longest substring or subarray such that something holds, it is a sliding window. If it asks for a subarray summing to k and values can be negative, it is a prefix sum, because removing an element can raise the sum, and no pointer move is provably safe. And anything on a linked list with "middle" or "cycle" in it is fast and slow pointers, which move by speed, not by comparison.

Here is the one test to keep. If you care about the elements at the two indices, it is two pointers. If you care about everything between them, it is a window.

## The invariant

There are two shapes. Opposite ends: the pointers start at both boundaries and walk towards each other. Same direction: a read pointer scans, and a write pointer trails behind it.

The opposite-ends invariant is the sentence to say out loud: every pair that uses an index outside the two pointers has been ruled out, so if a matching pair exists, both of its indices lie between them.

Why does a move keep that true? Say the sum is too small. The right pointer holds the largest value still in play, so the left value plus anything remaining is too small as well. The left index cannot be part of any answer, and you retire it, with every pair it belongs to, in one step. The mirror argument retires the right index when the sum is too big.

Try it in your head. The sorted values are 1, 3, 4, 6 and 8, and the target is 10. One plus 8 is 9, too small, so 1 is finished: it cannot reach 10 even with the largest partner. Three plus 8 is 11, too big, so 8 is finished. Three plus 6 is 9, too small, retire 3. Four plus 6 is 10. Found, in four comparisons instead of ten.

[pause]

Termination comes from a potential function. The gap between the pointers starts at n minus 1, shrinks by exactly one on every step that does not return, and stops at zero. That is at most n minus 1 iterations, so order n. When the pointers meet, every index has been ruled out, and "no pair" is the correct answer.

The same-direction form has a different invariant. Everything before the write pointer is exactly the kept elements seen so far, in their original order, and the write pointer never passes the read pointer. That second clause is what makes overwriting safe: you never clobber an element you have not read yet.

The most common mid-level mistake is to treat these as one trick, and write an invariant that does not match the code in front of you.

## Three Sum and the duplicate trap

Three Sum: return every unique triple in an unsorted array that sums to zero. The insight is to sort, then fix the smallest element as an anchor. The problem collapses to finding pairs that sum to minus the anchor in the sorted part after it, which is exactly the template.

The algorithm is not where people lose this round. Uniqueness is. You skip repeated values at all three positions, and you have to skip them at the right moment.

Take the lesson's input: minus 1, 0, 1, 2, minus 1, minus 4. Sorted, it starts minus 4, minus 1, minus 1. The anchor at the first minus 1 finds the triple minus 1, minus 1, 2, using the second minus 1 as its partner. That is allowed. So the anchor skip must compare each anchor with the previous anchor, not with the next element.

[pause]

Compare with the next element, and you skip the first minus 1 as an anchor, and the triple that needs two of them is gone, on exactly the inputs the hidden tests use. After recording a match, advance both pointers, then skip repeats, and keep "left below right" in every skip loop. Without that bound, Python raises an index error on three zeros, while JavaScript silently reads undefined and hides the bug until someone ports it.

And do not deduplicate with a set at the end. On an all-zero input of 3 thousand elements, the result list grows to about 2.25 million identical triples before the set collapses them. The interviewer reads it as not understanding the pointer moves.

Three Sum is order n squared: n anchors, each with a linear sweep, and the sort disappears under the square. With the usual limit of 3 thousand elements, that is about 4.5 million inner steps, well under a second even in CPython.

## Water between the walls

Container With Most Water: given line heights, choose two lines that hold the most water, which is the shorter height times the distance between them. Say this sentence before writing any code: moving the taller line can never help.

If the left line is the shorter one, every container that pairs it with something further in is narrower, and its height is still capped by that left line. So the left index is finished, and one comparison has eliminated every pair it was still in. Move the taller line instead and you get 8 instead of 49 on the sample, because the short line is never retired and caps every area. On a tie, either move is safe; pick one and do not special-case it. Linear time, constant space.

Trapping Rain Water goes one step further. The water above any position is the smaller of the tallest bar on its left and the tallest on its right, minus its own height. The easy version precomputes both maxima into two arrays. The two-pointer version notices you do not need both exactly.

Keep a running maximum from each end. If the left maximum is no bigger than the right one, then the true right maximum for the next left position is at least that big, so the left maximum alone decides the water there, and you can settle that position now. Otherwise, settle the right side. In one sentence: the side with the smaller running maximum is fully determined, so settle it. Interviewers usually accept the two-array version first, then ask for this constant-space one.

## Variants and failure modes

A few variants change one line of the template. To count pairs below a target, when the sum is small enough, the left element works with every index up to the right pointer, so you add the gap between the pointers and advance, counting a whole row instead of discarding it. For the closest sum rather than an exact one, track the best difference and never return early. For k-Sum, peel one anchor per level of recursion until two remain, which costs n to the power k minus 1.

For two sorted arrays, one pointer per array. To intersect, advance the smaller, or both on equality. For the three-way partition, the Dutch national flag, after swapping the middle element with the high end, do not advance the middle pointer, because the element just swapped in has not been read.

The failure modes worth naming. A loop that runs while the pointers are equal pairs an element with itself: with 1, 3 and 6 and a target of 6, it returns 3 plus 3. The fix is strictly less than. Sorting an array when the answer needs original indices passes the sorted sample and fails every hidden test. And a merge where the equal-keys branch advances neither pointer never terminates. The lesson's version is a nightly reconciliation job pegging a core forever. Every branch must move at least one pointer.

## In the interview

Here is a follow-up the lesson expects. The array is not sorted, and I need the original indices, in linear time.

[pause]

A hash map from value to index. For each element, look up the target minus the value before inserting the element itself, which handles a target that is twice one value correctly. The common wrong answer is to sort value and index pairs and run two pointers. It works, but it costs n log n and more code for no benefit.

And the scaling one: Three Sum with a million elements. Half of n squared is 5 times 10 to the 11 steps, out of reach in any language, and the best known algorithms only shave logarithmic factors off n squared. So the senior answer is a conversation about what else is constrained, such as bounded values. The wrong answer is "use a hash set to get linear time", which is still n squared, because every anchor pair needs a lookup.

## Recap

Four things to remember. Two pointers is elimination: each comparison retires a whole row of pairs, and you should say which row and why before you write the loop. It has two shapes with two invariants: opposite ends, where every pair outside the pointers is ruled out, and read and write, where the write pointer never passes the read pointer. Sorted input, or freedom to sort, means two pointers; original indices required means a hash map. And handle duplicates by design, comparing the anchor with the previous anchor and bounding every skip, not with a set at the end.

At your desk: the two templates, the traces for Three Sum, the container and rain water, the at-most-k-copies compaction, and the two exercises.
