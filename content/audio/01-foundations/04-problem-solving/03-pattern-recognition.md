---
lesson: pattern-recognition
source: af813d8b0b5016a0
fit: great
desk:
  - "The full catalogue of thirty patterns and their signals, and the decision flowchart"
  - "The daily-temperatures stack code and its trace"
  - "The subarray-sum code and its prefix trace on 1, minus 1, 1, minus 1"
  - "The measured loop-rate table for CPython, Node and C"
  - "The when-two-patterns-fit table"
  - "Exercises: days until a warmer day, count subarrays that sum to k"
---
## Introduction

Interview problems are not infinite. The ones in circulation number in the thousands, and most of them are one of about thirty techniques wearing a costume. The costume changes: candies, meeting rooms, servers, gas stations, DNA strings. The technique underneath is decided by a few properties of the input and the question. Is the input sorted? Is the question about contiguous ranges? Is the answer monotone in some parameter? Is there a dependency order?

Experienced engineers do not solve interview problems from scratch. They read the statement, notice two or three signals, map them to a pattern, and spend their time on what is new. This episode will not make you good at any one pattern; each has its own lesson. What it gives you is the first thirty seconds of every problem: what kind of thing is this?

Coming up: the four properties to read for, the questions that settle between two candidates, two problems taken from signal to solution, one of whose loudest signals is a trap, and where the operations-per-second budget really comes from.

## Read four properties first

The signal comes from the problem, not the solution. Read for four things before you think about any technique.

First, the input's structure. Array, string, linked list, tree, graph, intervals, a stream, a grid. Sorted or not. Small alphabet or arbitrary values.

Second, the question's shape. A single value such as a max, a count or yes or no; a subset; an ordering; a boundary; all of them; or an object that supports operations.

Third, the constraints. n up to 20 means exponential is fine: backtracking, bitmasks. n up to a hundred thousand means n log n or better. Values up to a million put counting arrays on the table. Constant extra space removes the hash map. And a constraint allowing negative values removes the sliding window from sum problems, which is the trap we will walk into shortly.

Fourth, the answer's structure. Is it contiguous? Is it monotone, so that if capacity c works, c plus 1 also works? Is there an order things must happen in?

The catalogue on the page maps signals to patterns, and a few are worth saying aloud. For each element, the next greater one: monotonic stack. Top k, or k closest: a heap. Prerequisites or build order: topological sort. "Minimum capacity such that" something works: binary search on the answer. Islands, regions, connected: graph traversal. All subsets, or n up to 20: backtracking. Number of ways, or minimum cost with choices at each step: dynamic programming. The table summarises a habit, not a lookup to memorise.

## Settling between two candidates

When two patterns fit, ask the questions in order. Is the answer a contiguous range? If so, is the property monotone as the window grows? Monotone means sliding window. A sum that is not monotone means prefix sums with a hash map. A maximum sum means Kadane. If it is not contiguous: is the input sorted, or the answer monotone in a parameter? Then two pointers or binary search. Otherwise, is there a dependency order? Is n tiny? Are there choices with optimal substructure? Is it frequency, membership or grouping?

"Monotone as the window grows" is the question that separates sliding window from the harder cases. Longest substring with all distinct characters is monotone: if a window is distinct, every sub-window is, so shrinking from the left always fixes a violation. A subarray summing to k with negative numbers is not: growing the window can push the sum past k and then back again.

## Walkthrough one: days until a warmer day

For each day's temperature, how many days until a strictly warmer one, or zero if none comes. Up to a hundred thousand days, temperatures from 0 to 200.

The signal: for each element, the next element to the right satisfying a comparison. That is the monotonic-stack row, nearly verbatim. But run the loop rather than stopping at the name.

Understand: strictly warmer, so an equal temperature does not count, and the answer is a distance in days, not an index. Brute force: for each day, scan right. Its worst case is a decreasing array, where every scan runs to the end: about 5 billion comparisons, minutes in CPython against a 4-second limit. The repeated work: a day that has already found its answer gets scanned again by every earlier day.

Optimise: keep a stack of the days still waiting for a warmer day. Their temperatures never increase from oldest to newest, because a warmer newer day would already have resolved the older one. So when a new day arrives, compare it with the newest waiting day, and pop every waiting day colder than it, recording the distance. Then push the new day.

Why is that linear, when one arrival can pop many days at once?

[pause]

Because each index is pushed once and popped at most once. However the pops are distributed, the total is at most n, so at most 2n stack operations. That amortised argument is what makes it linear; the temperature range plays no part in it.

And the strict comparison matters. With 70, 70, 70, 75, the answer is 3, 2, 1, 0. Pop on less-than-or-equal and day one would resolve day zero with an equal temperature.

## Walkthrough two: subarrays that sum to k

Count the contiguous subarrays whose sum is exactly k. n up to 20 thousand, values from minus 1000 to 1000.

This is the trap. Contiguous and sum both shout sliding window. But a window needs the sum to be monotone in the window, and the constraints say negatives exist. So the sum can pass k and come back, and there is no rule for when to shrink. The honest signal is "subarray with sum k", the prefix-sum row, combined with "how many earlier prefixes have I seen with a given value", the hash-map row. The constraints line is where the answer was.

Brute force: every start, extending the end with a running sum. About 200 million additions. Measured in CPython, 3 seconds natively, against a 4-second limit enforced by WebAssembly runtimes that are slower than native. Not safe.

Optimise: a subarray's sum is the difference of two prefix sums. So "a subarray ending here sums to k" becomes "some earlier prefix equals the current prefix minus k". Walk once with a frequency map of prefixes seen so far, and at each position add the count of the prefix you need. Measured: 2.2 milliseconds, about 1,400 times faster.

One subtlety, a favourite follow-up. Why seed the map with zero, seen once, before you start?

[pause]

It represents the empty prefix before index zero. Without it, subarrays that start at index zero are never counted: the array containing just 5, with k equal to 5, returns 0 instead of 1. The wrong answer is "to avoid a missing-key error", which a default lookup already handles. And as in Two Sum, count before you record the current prefix.

If every value were positive, you would go back to the window and drop the map, for constant space. Naming when the rejected pattern becomes right is a senior move.

## Where the budget comes from

Every pattern decision leaned on a number: 10 to the 8 simple operations a second. Here is what it is made of, measured on one fast desktop.

Compiled C: about a billion simple operations a second, more when the loop vectorises. So 10 to the 8 is ten times pessimistic. A JIT, like Node: about a billion on integer arithmetic, and about 10 to the 8 once each iteration touches a hash map. CPython: an empty loop reaches about 2 times 10 to the 8, but any real body, a dict operation, a call, an append, runs at 2 to 5 times 10 to the 7. One hash-map store per iteration measured 20 nanoseconds in CPython and 4 in Node.

So the honest budget: 10 to the 9 compiled, 10 to the 8 under a JIT with real work, 10 to the 7 in CPython, then scale by what one iteration does. And a laptop or a judge's shared server runs two to three times slower than this desktop. Time limits are set with slack above a reference solution in the intended complexity, so that solution passes and one class worse does not. At n of 20 thousand, the gap between quadratic and linear is not "faster"; it is failing versus 2 milliseconds.

## Signals that mislead

Pattern matching on surface words has failure modes, and knowing them separates mid-level from senior.

Sorted does not always mean binary search. Sorted plus pair-with-sum is two pointers; sorted plus merge is k-way merge. Subarray does not always mean sliding window; only when the property is monotone. Otherwise prefix sums, Kadane, or DP.

Minimum does not always mean greedy. Greedy needs an exchange argument. The canonical counter-example: coins of 1, 3 and 4, target 6. Largest-first takes 4, 1, 1, three coins. DP finds 3 plus 3, two. Greedy works for 1, 5, 10, 25, but not here.

Graph does not always mean breadth-first or depth-first search. Weighted edges push you to Dijkstra, merging groups over time to union-find, dependencies to topological sort. And recursion is not a pattern. It is an implementation strategy that backtracking, tree DFS and top-down DP all use, and naming it says nothing about whether your algorithm is linear or exponential. The same goes for "I'll use a hash map". Name the signal, then the pattern, then the tool: "for each end position I need the count of an earlier prefix, so a frequency map over prefixes."

## In the interview

Here is a follow-up the lesson expects. Top k frequent elements: heap or bucket sort?

[pause]

The heap is n log k time and k extra space beyond the counts, and it works on a stream. Bucket sort is linear time and linear space, and needs all the counts first. With k near n, the heap's log factor buys nothing. With k small and memory tight, or a stream, the heap wins. The wrong answer is "heap, because it's the top-k pattern", with no reference to k, n or memory. When two patterns fit, say both with their costs and let the constraints choose; the follow-up then becomes a one-line switch rather than a restart.

## Recap

Four things to remember. Read the constraints before the examples, and turn them into an operation budget tied to a runtime: about 10 to the 9 compiled, 10 to the 8 under a JIT, 10 to the 7 in CPython. Read four properties, structure, question, constraints and the answer's shape, and let them choose the pattern. For every pattern you name, state the property it needs and check it: a sliding window needs monotonicity, so negatives send sum problems to prefix sums with a hash map; greedy needs an exchange argument. And when two patterns fit, say both with their costs.

At your desk: the full catalogue and decision chart, the two walkthroughs' code and traces, the loop-rate table, the two-options table, and the two exercises.
