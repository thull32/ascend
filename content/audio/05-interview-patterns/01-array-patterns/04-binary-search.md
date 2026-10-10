---
lesson: binary-search
episode: binary-search-pattern
source: 2e82a54dd86edd6a
fit: partial
desk:
  - "The five-decisions table, and the predicate table for lower bound, upper bound, last true and exact match"
  - "The first-true template and the closed-interval exact template, in Python and JavaScript"
  - "Traces: Koko Eating Bananas, Search in Rotated Sorted Array, Time-Based Key-Value Store and Median of Two Sorted Arrays"
  - "The hidden-predicate, near-miss and variants tables"
  - "The per-probe cost table across array sizes, and what bisect calls"
  - "Exercises: minimum ship capacity, and search a rotated array with duplicates"
---
## Introduction

You have a range of candidates too large to try one by one. But for any single candidate, you can answer a yes or no question, and the answers, laid out across the range, go false, false, false, then true, true, true. That shape is the whole pattern.

Every binary search problem, whether the statement says "sorted array", "minimum eating speed" or "first bad version", is a search for the place where false turns into true. Each probe halves the candidates, so a billion candidates need 30 probes. When each probe is an API call that takes a second, that is half a minute, against about sixteen years for a linear scan.

Candidates who learn binary search as "find the target in a sorted array" stall when there is no array, when the array is sorted only in pieces, or when the thing being searched is a cut rather than an element. Candidates who learn it as a boundary search do not stall. The predicate is the thing they write, and the loop is the thing they never touch.

Three ideas, then. How to spot the predicate, including when there is no array. The one loop, and its invariant. And where the off-by-ones and the hangs come from.

## The signal

Any one of three things in the statement selects the pattern. Sorted input, or sorted in pieces: sorted, non-decreasing, rotated, or timestamps that are strictly increasing. Sortedness is monotonicity handed to you.

Second, a minimum or maximum that satisfies a feasibility condition. "The minimum speed such that she finishes within h hours." "The smallest capacity that ships everything in d days." The answer is a number, checking one number is cheap, and a bigger number is never worse at satisfying the condition.

Third, an explicit hint: "order log n", or "each call is expensive, minimise calls".

Underneath all three is one requirement: a monotone predicate, false for a prefix of the candidates and true for the rest. If you cannot name the predicate and argue in one sentence that it flips exactly once, do not binary search. Here is the sentence for the eating-speed problem: "Small speeds fail, and once some speed succeeds, every larger speed succeeds, so I search for the first true speed." That sentence is the correctness proof.

The statements that hide a predicate are worth knowing by name. "Minimise the largest piece" searches the value of the largest piece, asking "can I do it with every piece at most x?". "Maximise the smallest gap" searches the gap. The k-th smallest in a sorted matrix searches values, not positions. The minimum of a rotated array searches indices, with the predicate "this element is at most the last element".

And the near-misses. A pair with a sum in a sorted array is two pointers; binary search per element adds an extra log factor, and interviewers notice. A value in an unsorted array is a hash set; sorting first is n log n for a linear job. And "best batch size", where throughput rises then falls, is unimodal, not monotone: the predicate flips twice.

## One loop, one invariant

Search a half-open range, from low up to but not including high, for the first index where the predicate is true. The invariant is the sentence to say: everything before low is false, and everything at or after high is true. When low meets high, the two regions touch, and low is the boundary.

Each step takes the floored midpoint. If the predicate is true there, high moves to the midpoint, because the boundary is there or earlier. If it is false, low moves to one past the midpoint, because the boundary is strictly later. The floored midpoint is always strictly below high, so both moves shrink the range, and the loop terminates.

Here it is on Koko Eating Bananas. The piles are 3, 6, 7 and 11, and she has 8 hours. At each speed, a pile takes its size divided by the speed, rounded up. At speed 3 that is 1, 2, 3 and 4 hours: 10 hours, too slow. At speed 4 it is 1, 2, 2 and 3: exactly 8. So the predicate flips between 3 and 4. Search speeds 1 up to 11, and the loop probes 6, then 3, then 5, then 4, and returns 4. Four predicate checks instead of up to eleven.

The range is 1 to the largest pile, because at that speed every pile takes one hour. And the top of the half-open range must be one past the largest pile, because the largest pile itself must be a candidate.

Now the trap in that same problem. What if you divide without rounding up?

[pause]

At speed 3, the rounded-down hours are 1, 2, 2 and 3, which is 8, so an infeasible speed looks feasible and you return 3. The fix is the integer ceiling, and the habit is to check the predicate by hand at the two values around the expected answer.

## Five decisions, and deriving the rest

Five decisions before you type. The candidate space, as a half-open range whose top is one past the last candidate. The predicate, written so it goes false then true. Whether the answer is the first true or the one before it. And what "nothing is true" means. That last one is where hidden-test failures come from, so say it before you code.

Everything else derives from the one loop. The first element at least t: predicate "at least t", first true. The last element at most t: predicate "greater than t", first true, minus one. The number of copies of t: upper bound minus lower bound. And any maximisation, "the largest k such that", is always first false, minus one. You never write a separate last-true loop. That loop needs low to move to the midpoint, and with a floored midpoint on a two-element range, it hangs.

The Time-Based Key-Value Store is exactly this. Each key holds timestamps that arrive in order, and a read at time t wants the newest version at or before t. That is first timestamp greater than t, minus one, and minus one landing below zero means "nothing", so you return the empty string. It is the question a multi-version database answers for every read.

## Hidden predicates: rotation and the median

In a rotated sorted array, "this element is less than the target" is not monotone. The insight: at every midpoint, at least one half is sorted, and comparing the first element with the middle one tells you which. If the target lies in the sorted half's value range, go there; otherwise go to the other half. Many seniors prefer two boundary searches instead: find the rotation point with the predicate "at most the last element", then run an ordinary lower bound on the half that can hold the target. No four-way branch.

With duplicates, the rotated search breaks. When the first, middle and last elements are all equal, nothing tells you where the pivot is. The fix is to step both ends inward and accept linear time in the worst case, as on all ones with a single zero. Claiming log n by discarding a half on a tie can discard the target.

The median of two sorted arrays hides the predicate best. You are not searching for an element; you are searching for a cut. Choose how many elements the shorter array puts on the left, and the longer array must supply the rest of the left half. As you take more from the shorter array, its first right element grows, and the other array's last left element shrinks. So "the other array's last left element is at most my first right element" goes false then true. First true over the cut, and the median is read off the elements beside it, in log of the shorter length.

## What a probe really costs

The loop runs at most about log base 2 of the range plus one times: 10 for a thousand, 20 for a million, 30 for a billion, 60 for 10 to the 18. The total cost is that times the predicate's cost, so anything inside the predicate that does not depend on the midpoint, such as a sort, belongs outside the loop.

Python's bisect is this loop in C, and it calls only less-than. On a million objects, one search made exactly 20 comparisons. With a key function, the key is called on every probe, not cached, so precompute a list of keys if you search the same data repeatedly. And bisect never checks that the list is sorted.

At scale, memory matters more than the probe count. In Node, a search on a thousand integers took 51 nanoseconds, and on 100 million it took 343, nearly seven times longer, though the probes only went from 10 to 27. The big array is far bigger than the cache, so the middle probes, landing on elements no recent search touched, each wait on main memory. That is why B-trees exist.

Two language traps. In Java, C or Go, adding low and high and dividing by two truncates toward zero, so on the range minus 3 to minus 2, the midpoint equals high, and the loop never ends. Low plus half the difference floors in every language. And in JavaScript, the default sort compares as strings, so an array "sorted" that way is not sorted, and every search on it is wrong.

## In the interview

Here is a follow-up the lesson expects. The sorted data is 100 gigabytes on SSD.

[pause]

That is about 12.5 billion keys, so 34 probes. The last nine share one 4-kilobyte page, which leaves about 25 random page reads of around 100 microseconds each: a few milliseconds per lookup. A B-tree with a few hundred keys per page answers in three or four page reads, and its top levels stay in memory. The wrong answer is "still log n, so still fast".

And the production one. A versioned store starts returning stale values after a deploy. Writes now come from several hosts, timestamps arrive out of order, appending no longer keeps the list sorted, and bisect does not check. Reject out-of-order writes, insert in sorted position, or use a sorted structure per key, and assert that timestamps never decrease.

## Recap

Four things to remember. Binary search finds a boundary, not a value: name the predicate and say why it flips exactly once before writing a loop. Use one loop: half-open, first true, where everything before low is false and everything from high on is true; derive lower bound, upper bound, last true and maximisation as first false minus one. Say the five decisions, especially the range and what "nothing true" returns. And name the degradations before the interviewer does: duplicates make the rotated search linear, C-family division breaks the midpoint on negatives, and the predicate itself can overflow or round the wrong way.

At your desk: the decisions and predicate tables, the two templates, the four traces, the probe-cost table, and the two exercises.
