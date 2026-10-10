---
lesson: prefix-sum
source: df580ee948666e23
fit: partial
desk:
  - "The three-decisions table: form, key and stored value, seed and order"
  - "The array, count-map and first-position templates, in Python and JavaScript"
  - "Traces: Range Sum Query, Find Pivot Index, Subarray Sum Equals K and Product of Array Except Self"
  - "The inequality case: binary search on the running prefix maximum, with its trace"
  - "The hidden-transform, near-miss and variants tables, and the build and container benchmarks"
  - "Exercises: longest subarray with sum exactly k, and longest subarray with equal 0s and 1s"
---
## Introduction

You are asked for the sum of a range of an array, and then asked again for a different range, thousands of times. Each query is a loop. In the lesson's measurement, 2,000 random range queries on a list of 100 thousand elements took 867 milliseconds in CPython, about 433 microseconds each. The prefix version answered each one in 33 nanoseconds, roughly 13 thousand times faster.

Or you are asked how many contiguous subarrays sum to exactly k, and the array holds negative numbers, so a sliding window cannot shrink safely. Or which index has the same total on its left as on its right.

All three are one idea. Spend one linear pass computing running totals, and every range sum becomes the difference of two stored numbers. The hash-map extension goes further: "how many subarrays sum to k" becomes "how many earlier running totals equal the current one minus k", which a dictionary answers in constant time. A problem that looks quadratic becomes six lines.

Three things, then. How to spot it, including the problems that need a transform first. The three decisions that fix every prefix problem. And the three classic off-by-ones, plus one precision trap.

## The signal

Reach for prefix sums when the statement has one of these. Many range totals on data that does not change. With one query, a plain loop is optimal; the table pays for itself from about the third random query. "How many subarrays" have a sum exactly equal to a target, or divisible by k. Equality is the word that selects the hash map. "Longest subarray" with an exact sum, especially with negative values. Negatives are the tell that a window is out. "Left total equals right total". And "everything except index i", which is a prefix from the left combined with a suffix from the right.

The most valuable signals are statements that only become "subarray sum equals k" after one transform. "Longest subarray with equal numbers of zeros and ones": count each zero as minus 1, and you want the longest subarray summing to zero. "Number of subarrays with exactly k odd numbers": count odd as 1 and even as 0. "Fewest elements removed from the two ends so the removed total is x": the removed ends are the complement of a kept middle, so you want the longest middle summing to the total minus x.

And the near-misses. Range sums with point updates in between: one update invalidates every later prefix, so that is a Fenwick tree. Range minimum or maximum: min has no inverse, so two prefix minima cannot be subtracted. Maximum subarray sum is Kadane. And counting pairs of elements, not ranges, is a plain hash map of values.

## Three decisions before you type

Every prefix problem is fixed by three choices.

First, the form: an array of prefixes, a running scalar, or a map. Second, what the map stores for each prefix value, and the question's wording picks it. "How many" stores a count. "Longest" stores the first position the value appeared. "Shortest" stores the last.

Third, the seed and the order. The seed is what the empty prefix contributes, before any element. The order is whether you look up before you insert. For counting, the seed is "prefix zero, seen once", and you always look up first.

Here is why, in one tiny example. The array is 1, 2, 3, and k is 3. The running totals are 1, then 3, then 6. At the total of 3, you look up 3 minus 3, which is zero. Only the seed holds it, so you count the subarray 1, 2. At 6, you look up 3, which you stored a step ago, and count the subarray holding just 3. The answer is 2.

[pause]

Drop the seed, and 1, 2 is never counted, because a subarray that starts at the very beginning needs the empty prefix as its left end. Insert before you look up, and with k equal to zero every position matches itself, so the count is too high by n.

The invariant to say out loud: when you process element j, the map holds the counts of exactly the prefixes before the current one. A subarray is a pair of positions, and it is counted once, when its right end is processed, for each earlier position with the matching prefix. That is also why the map stores counts and not a set: a repeated prefix means two different subarrays can end at the same place.

One convention removes most bugs. Let a position mean the number of elements consumed so far. Then the empty prefix sits at position zero, and every length is a plain subtraction. Mixing that with element indices is the most common off-by-one in this pattern, and it only shows up on subarrays starting at index zero, which the sample may not contain.

## The classic problems

Range Sum Query is the plain array form. The prefix array has one more entry than the input, starting with zero, and the sum from i to j is the prefix after j minus the prefix at i. The leading zero means a query starting at index zero needs no special case. If the interviewer adds "now an element can change", say before they finish that an update invalidates every later prefix, and name the Fenwick tree.

Find Pivot Index needs no array at all. Keep a running left total, and the right total is the grand total minus the left minus the current element. The trap is the order: test before you add the current element to the left. The input 2, 1, minus 1 has its pivot at index zero, with nothing on the left and 1 minus 1 on the right. A loop that adds first, or starts at index 1, misses it.

Product of Array Except Self is a prefix of products, and product has no safe inverse, because a zero makes division undefined. So instead of subtracting, you combine. One pass from the left writes the product of everything before each index into the output. A pass from the right multiplies in the product of everything after. On 2, 3, 0, 4 the answer is zero everywhere except the zero's own slot, which gets 24. A division solution crashes on that index, and cannot recover the 24 from a total of zero anyway.

For "longest with sum k", the trap is overwriting. You must store only the first position of each prefix value. Overwrite it every time, and on three zeros with k equal to zero you return 1 instead of 3, because every match is now as short as possible.

## When the question is an inequality

The follow-up that changes the pattern most is "longest subarray with sum at most k, negatives allowed". The window fails, because dropping a negative raises the sum. And the hash map fails too, because it only finds prefixes exactly equal to a value, while you need the earliest prefix at least as big as one.

The fix is one observation. The running maximum of the prefixes never decreases, and the first position where it reaches a value is the first position where the prefix itself does. So you binary-search the running maximum. That is n log n time. On the lesson's example, it finds a subarray of length 5 where a sliding window reports 2, because the window evicted values it could never get back.

The general routing to remember: equality goes to a hash map, inequality goes to a sorted structure or a binary search, an aggregate without an inverse goes to a sparse table or segment tree, and updates go to a Fenwick tree.

## Under the hood

Building the table: in CPython, itertools accumulate with an initial value of zero was the fastest build, because the loop runs in C. For bounded prefix values, an array of counters can replace the map. In CPython that made no difference at all, because interpreter dispatch dominates either way. In Node, a typed array was a ninefold win over a Map, worth writing.

Floats are the real trap. Adding 0.1 a million times gives 100 thousand plus a small error with a plain loop, with accumulate, and in JavaScript. CPython's built-in sum returns exactly 100 thousand, because since Python 3.12 it uses compensated summation for floats. So sum and the last prefix now disagree.

Worse, a range sum computed as a difference of two prefixes inherits the rounding of both, and that rounding scales with the size of the prefixes, not of the range. Over short random ranges in a million-element array, the error was around 10 to the minus 14 near the start, and around 10 to the minus 10 near the end. Four orders of magnitude worse for the same range length, purely because of where it sits. The lesson's production version: a reconciliation job flagging thousands of mismatches that are not real, only late in the month. Money and counts should be integers.

## In the interview

Here is a follow-up the lesson expects. Now the input is a stream.

[pause]

The count and longest forms are already one pass that never looks back, so they run online, with memory equal to the number of distinct prefixes seen. Range queries over an append-only stream extend the prefix array in constant time per element. The common wrong answer is "prefix sums need the whole array first".

And a sizing one. Values go up to a billion, and n to 100 thousand. Prefixes reach 10 to the 14: fine in Python, in 64-bit integers and in a JavaScript number, fatal in a 32-bit integer. For "divisible by k" with k a billion, an array of residues would be 4 gigabytes, so use the map. The wrong answer is sizing an array by k or by the value range.

## Recap

Four things to remember. Prefix sums turn any range total into a difference of two stored numbers, and the map form turns "subarrays summing to k" into "earlier prefixes equal to the current one minus k". Make three decisions: the form, what the map stores, which is a count for how many, the first position for longest and the last for shortest, and the seed and order: seed the empty prefix, and look up before you insert. Look for the transform, such as zero becomes minus 1, when nothing says "sum". And route inequalities to binary search, not to the hash map, and keep money out of float prefixes.

At your desk: the decisions table, the three templates, the four problem traces, the inequality trace, the benchmarks, and the two exercises.
