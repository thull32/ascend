---
lesson: sorting-based-patterns
source: 558c43cd9270f188
fit: partial
desk:
  - "The three-decisions table (key, tool, sweep body) for eight classic problems"
  - "The sort-then-sweep template and composite keys, in Python and JavaScript"
  - "Traces: Hand of Straights, quickselect for Kth Largest, Meeting Rooms and Group Anagrams"
  - "The Largest Number comparator and its proof as a key"
  - "The hidden-key, near-miss and variants tables, and the Timsort, composite-key, typed-array and top-k benchmarks"
  - "Exercises: pairs with the minimum difference, and arrange numbers into the largest number"
---
## Introduction

A problem asks you to relate elements to each other. Which pairs sum to zero, which meetings collide, which cards form consecutive runs, which strings are rearrangements of one another. The naive version compares every element with every other. For 100 thousand elements that is 5 billion comparisons, minutes in CPython.

Almost all of those comparisons are wasted, because the elements that matter to a given element are the ones near it in some ordering, and you do not know that ordering yet.

Sorting buys the ordering. After one sort by the right key, the nearest element by that key is an array neighbour, all elements with the same key form a contiguous run, and the smallest remaining element is wherever the sweep pointer stands. Sorting a million random integers took about 145 milliseconds in CPython, and 34 in Node with a typed array. So for 100 thousand elements the sort is a few milliseconds, and the sweep after it is linear.

Every sorting-based pattern is the same three steps: choose the key, sort, sweep once. Three ideas, then: choosing the key so the sweep is forced, proving the order when the key is really a comparator, and knowing when a heap, a counting array or quickselect answers the same question cheaper.

## The signal

Reach for a sort when the statement has a relation that depends on order: pairs that sum to something, the closest pair, the minimum difference, consecutive, overlapping, conflicting. Sorting puts related elements next to each other.

Or it says "group", or "same as", under a canonical form, such as anagrams. Or "k-th largest", "top k", "median": sorting answers it, and the real decision is whether something cheaper does. Or a greedy that needs "the smallest remaining", "the earliest ending", "the tallest first". The greedy is only correct because the sweep visits elements in key order.

The near-misses. "Return the indices of two numbers that sum to t" is a hash map: sorting scrambles the indices. Grouping by an exact key in linear time is a hash map too: grouping needs equality, not order. Integers in a small range, or "top k frequent", is counting or bucket sort, with no comparisons at all. Top k of a stream is a heap of size k, because you cannot sort what has not arrived. And one order statistic, the k-th largest, is quickselect.

## The invariant and the three decisions

The invariant after the sort is one sentence: for any earlier position and later position, the earlier key is at most the later one. Everything the sweep does follows from it. The nearest element by key is a neighbour, equal keys are contiguous, and the smallest element not yet consumed is at the pointer. That last fact is what makes a greedy choice forced rather than plausible.

Say three decisions before you type. The key decides what "adjacent" means. The tool is a full sort only when you need the whole order; one order statistic is quickselect, a stream is a heap, a small integer range is counting. And the sweep body should be forced by the order. If you cannot say what the element at the pointer must do, the greedy is probably wrong.

Hand of Straights shows a forced choice. Can the cards be split into groups of w consecutive values? The smallest remaining card has nothing smaller to precede it, so it must start a group. Consume that group now and you never remove an option. The trap is iterating the counts without sorting them. A Python dict visits keys in insertion order, which passes on sorted samples and fails on 3, 2, 1.

Meeting Rooms shows the adjacency argument. After sorting by start time, any overlap shows up between neighbours: if a meeting overlaps one further along, it also overlaps the very next one, because that one starts no later. So you compare each start with the previous end, once. And ask whether ends are inclusive before coding, because it flips the comparison.

Composite keys are where most of the design happens: intervals by start, then longest first on ties, or frequency descending, then value ascending. Both languages sort stably, so two stable passes, secondary key first, give the same composite order.

## When the order is a comparator

"Arrange non-negative integers to form the largest number" has no obvious key. The comparator is: put a before b when the string a followed by b is larger than b followed by a.

Try it with 3, 30, 34, 5 and 9. Nine goes before five, because 95 beats 59. Thirty-four goes before 3, because 343 beats 334. And 3 goes before 30, because 330 beats 303. So the order is 9, 5, 34, 3, 30, and the answer is 9534330.

[pause]

Is that comparator safe? A comparator is only safe if it is a real order: transitive, and consistent on ties. Here the proof is one line of algebra. The comparison rearranges to comparing each number divided by a run of nines as long as the number itself. Each side depends on one number only, so the comparator is "sort by this fraction", which is transitive, and it even gives you a key. Without such a proof, Java's sort may throw "comparison method violates its general contract", and "it passed the tests" is the wrong answer. One edge remains: two zeros must return a single zero.

## Kth largest: sort, heap or quickselect

Kth Largest has three correct answers, and the round is about choosing. Sort, and return the element k from the end: two lines, and the interviewer asks for better. A min-heap of size k: n log k, works on a stream, and wins when k is small. Or quickselect: linear on average, constant space, but it mutates the input.

Quickselect partitions around a pivot, which lands at its final sorted position, and then continues only on the side that holds the target. On 3, 2, 1, 5, 6 and 4, with k equal to 2, the target is the fifth position in ascending order. Two partitions place the 5 there, and that is the answer.

The random pivot is load-bearing. With the last element as pivot on an already sorted array, every partition removes one element. On 20 thousand sorted integers, the fixed-pivot version took 4.6 seconds in CPython; the random-pivot version took 2 milliseconds. Sorted inputs are exactly what test suites send.

The crossover between heap and sort was measured too. For the top 10 of a million, the heap was 26 times faster than a full sort. For the top half a million, it was six and a half times slower, because n log k is no longer smaller than n log n, and the heap's Python loop costs more per step than the sort's C loop.

## Under the hood

The lower bound first. A comparison sort must tell apart n factorial orderings with yes or no answers, so it needs roughly n log n comparisons in the worst case. The sweep after it is linear, so the pattern costs n log n.

Timsort, which both CPython and V8 use, scans for runs that are already in order before merging them. A sorted list of a million integers took 20 milliseconds instead of 145, and sorted with ten random swaps, 22. That is why nearly ordered data, like log lines by timestamp, sorts several times faster. It is also how a leaderboard that appends and re-sorts on every update hid its cost at small sizes, until latency grew with the number of players. The fix is a structure that keeps order under updates, or re-sorting once per interval.

Composite keys cost memory. Sorting a million records by department, then salary descending, with a tuple key took 708 milliseconds and 120 megabytes, because the key for every element is held in memory for the whole sort. Two stable passes with a C-level key function took 262 milliseconds and 24 megabytes. A comparator wrapped for Python's sort took nearly two seconds. The production version of this is a batch job killed for running out of memory while sorting.

In JavaScript, the default sort compares as strings, so 10, 9 and 1 sort to 1, 10, 9. A comparator that returns a boolean, a greater than b, says "equal" for half the pairs, and on 20 random values it left the array unsorted, with no error. Pass a minus b, or use a typed array, whose native sort is numeric and was four times faster than a plain array with a comparator. And in Python, a list containing not-a-number values does not come out sorted, because every comparison with it is false.

## In the interview

Here is a follow-up the lesson expects. Can you do it in linear time?

[pause]

Only by leaving comparisons. Counting or bucket sort for bounded keys, as in Top K Frequent. Hashing for grouping, as in Group Anagrams with letter-count keys. Quickselect for one order statistic, on average. The n log n lower bound applies to comparison sorting, not to the question. The common wrong answer is "Timsort is linear on nearly sorted data", which is true for that input and is not a worst-case bound.

And another: n is a billion. A billion 8-byte integers is 8 gigabytes, so decide what fits. If the range is small, counting sort in one pass. If only the top k is needed, a heap with k memory. Otherwise an external sort: sorted runs on disk, then a k-way merge. The wrong answer is calling sort and hoping.

## Recap

Four things to remember. Sorting-based patterns are three steps: choose the key, sort, sweep once, and the key is the design decision. The sort buys one invariant: the nearest by key is a neighbour, equal keys are contiguous, and the pointer holds the smallest remaining element, which is what makes a greedy forced. Prove a comparator is a real order before you trust it, ideally by finding the key it compares. And pick the tool from n, k, streaming and memory: a heap for small k, quickselect with a random pivot for one order statistic, counting for small ranges, and a full sort when you need the whole order.

At your desk: the decisions table, the template and composite keys, the four traces, the Largest Number proof, the benchmarks, and the two exercises.
