---
lesson: monotonic-stack-pattern
source: 94986e7152834ad9
fit: partial
desk:
  - "The template in Python and JavaScript, and the direction and tie-rule table"
  - "Full traces: Daily Temperatures with a tie, circular Next Greater, Largest Rectangle with equal bars, Remove K Digits"
  - "The Sliding Window Maximum code and its visualisation"
  - "The near-miss table, the variants table and the approach comparison table"
  - "Exercises: stock span, and next greater element in a circular array"
---
## Introduction

For every day in a list of temperatures, how many days until a warmer one? For every bar in a histogram, how far left and right does its height extend? Delete k digits from a number to make it as small as possible.

Each has an obvious order n squared answer: for each element, scan outward until you find what you need. At 100 thousand elements that brute force is up to 5 billion comparisons. Each also has a linear answer, built on a stack whose contents are always sorted. That is the monotonic stack.

It uses push and pop like any stack, but nothing is nested. The invariant is on the values the stack holds, and every pop answers a query. Three ideas, then: how to spot the pattern when the statement hides it, the invariant and the exact bound that makes it linear, and how to choose the direction and the tie rule from the wording instead of by trial and error.

## The signal

The phrase that selects the pattern is some version of "for each element, the nearest element to its left or right that is greater, or smaller". It is almost always disguised.

"How many days until a warmer temperature" is next greater to the right, reported as a distance. "Largest rectangle in a histogram" is nearest smaller on both sides of each bar, because those shorter bars are the walls. "Sum of subarray minimums" is nearest smaller on both sides again, which counts the subarrays in which each element is the minimum. "Remove k digits to make the smallest number" is greedy removal: a monotonic stack with a budget on pops. And "maximum of every window of size k" is the same invariant in a deque, with eviction from the front.

The structural tell is worth more than any keyword. The brute force is "for each i, scan outward until the condition holds", and the scans overlap. The stack removes the overlap by remembering only the candidates that could still be somebody's answer.

Now the near-misses. "Range maximum for q arbitrary queries" is not nearest-from-each-element; a static array wants a sparse table, constant time per query after an n log n build, and with updates between queries, a segment tree. "Smallest element greater than x anywhere in the array" is greater by value, not nearest by position, so sort and binary search. Trapping rain water can be done with a stack, but two pointers solve it in constant space. And "longest subarray where max minus min is within a limit" is a sliding window with two monotonic deques, because the left edge moves by the constraint, not by a fixed k.

## The invariant, and why it is linear

Keep a stack of indices whose values are monotone from bottom to top. For next greater to the right, the values never increase going up. Scan left to right. When a new value x arrives, pop while the top's value is smaller than x. Each popped index has just found its answer: x is the nearest greater element to its right. Then push x's index.

Why is the popped answer right? Everything between the popped index and x was pushed later, and either still sits above it or was popped by something earlier. Either way it was not greater, or it would have popped our index first. So nothing in between qualifies, and x does. Whatever is left on the stack at the end has no greater element to its right.

Here is a tiny example, five temperatures: 34, 38, 34, 34, 36. The 34 goes on. The 38 pops it: answer, one day. The next 34 goes on, and the second 34 goes on above it, because 34 is not warmer than 34. Then 36 arrives and pops both: the later 34 waited one day, the earlier one waited two. The 38 is still waiting.

Now the part interviewers probe. There is a while loop inside a for loop. Is it quadratic?

[pause]

No. Each index is pushed once, so there are n pushes, and each pop removes something pushed earlier, so there are at most n pops in total. Each check of the while condition either pops, at most n times overall, or ends that iteration's loop, once per element. So at most 2n comparisons. Say "at most n pops in total, so at most 2n comparisons" before you are asked. It is the amortised argument with the stack height as the potential.

Store indices, not values. The value is one lookup away, and the index is what distances, widths and window eviction need. Candidates who push values end up rewriting halfway through under time pressure.

## Direction and the tie rule

The template has three knobs: the comparison, what you write at pop time, and whether you read the top before pushing.

The comparison is the tie rule, and you read it from the statement. Daily Temperatures says strictly warmer, so you pop while the top is less than the current value. If you pop while it is less than or equal, the second 34 in our example resolves the first one and reports a wait of one day, claiming 34 is warmer than 34. That solution passes samples without repeated values and fails the hidden tests. Trace an input with a repeated value before you run anything.

For next smaller, flip the comparison and keep the stack non-decreasing. And one left-to-right pass gives you both directions at once. Popped indices get their next answer. The new element gets its previous answer: whatever is on top after the popping, before the push. Most problems that need walls on both sides need only one pass.

Three classic variations. Circular arrays: iterate 2n times over i modulo n, and push only during the first lap. The second lap exists to pop. Pushing again would put every index on the stack twice. The maximum correctly stays on the stack with no answer, because nothing in a circle beats it.

Counting subarrays with walls on both sides: strict on one side, non-strict on the other, so each run of equal values is counted once.

And the online stock span: store the price with its span, so a popped entry's span is added to the new one. Constant amortised time per call.

## Histogram and digit removal

Largest Rectangle in Histogram is the showpiece. The best rectangle has some bar as its limiting height and extends until a strictly shorter bar on each side. Keep an increasing stack. When a bar pops another, it is the popped bar's right wall, and the new top is its left wall. The width is the right wall minus the left wall minus one, because the walls are exclusive, with minus one standing in for "no left wall".

Two traps. Forget the sentinel, a zero-height bar at the end, and anything still on the stack is never measured: the input 1, 2, 3, 4, 5 returns 0 instead of 9. And compute the width without that minus one, or take no left wall as 0 instead of minus one, and you report rectangles wider than any that exist.

Equal bars look like a bug and are not. With a strict comparison, equal heights stack up, so the right copy is popped first and gets an understated width. The left copy is popped immediately after and gets the true width. One bar of each equal run always gets the full width, so the maximum is right.

The follow-up "maximal rectangle of ones in a binary matrix" is this algorithm in disguise. For each row, the height of a column is the count of consecutive ones ending there. Run the histogram on every row: rows times columns in total.

Remove K Digits is a budget on pops. The leftmost digit that exceeds its successor is the highest-value place you can lower, so removing it is the best single deletion. Keep a non-decreasing stack and pop while budget remains. The lesson's example: the digits 4, 2, 0, 5, 1, 2, 3, with k equal to 3, give 1, 2, 3. Two edges to say out loud. If the input never descends, like 1, 2, 3, 4, 5, nothing pops, so leftover budget must cut the tail. And the number 10 with k equal to 2 empties the stack and must return "0", not an empty string. The wrong answer is "remove the k largest digits", which turns that example into 2, 0, 1, 2 instead of 1, 2, 3.

## The deque and the JavaScript trap

Sliding Window Maximum is the decreasing stack plus one move: evict the front when its index leaves the window. The front is always the window's maximum, because anything larger would have popped it and anything older has been evicted.

JavaScript has no deque, and shift moves every remaining element down a slot. On a descending input nothing pops from the back, so the deque holds all k indices and every shift copies them. Measured in Node on 200 thousand values with a window of 50 thousand: 313 milliseconds with shift, against 2.3 milliseconds with a preallocated typed array and head and tail indices. On random data the deque stays short and the two were 5 and 3 milliseconds, so the bug hides until the adversarial test. In Python, use collections dot deque, never popping from the front of a list.

The same lesson applies to memory. The stack's size is a property of the data, not of n. Over a million random values, it never exceeded 37 entries. On a descending input, nothing ever resolves, and it holds all million. A service computing "next higher price" for every tick grows steadily through a falling market and releases it all when the price recovers. Bound it by time, which turns the stack into a deque.

## In the interview

Here is a follow-up the lesson expects. Now answer arbitrary range-maximum queries.

[pause]

The pattern changes. The stack answers "nearest greater for every element" in one pass; it cannot answer an arbitrary range without rerunning, linear per query. For a static array, a sparse table answers in constant time after an n log n build. With updates, a segment tree gives log n queries and updates. Knowing where the pattern stops is a senior signal.

And another: give me the previous smaller element instead. The model answer is the same single pass with an increasing stack: pop while the top is greater than or equal to x, and then the top, if any, is the previous strictly smaller element. The weaker answer reverses the array and reruns next smaller. It works, but it shows you did not see that one pass yields both directions.

## Recap

Four things to remember. The signal is "nearest greater or smaller, for each element", hidden behind days until warmer, histogram walls and digit removal, and the tell is overlapping outward scans. The invariant: popped indices have found their answer, and there are at most n pops, so at most 2n comparisons. Read the direction and the tie rule from the wording, store indices, and remember the sentinel and the leftover budget. And the pattern stops at arbitrary range queries, where a sparse table or segment tree takes over.

At your desk: the template and the tie-rule table, the four traces, the window-maximum code, the comparison tables, and the stock span and circular next-greater exercises.
