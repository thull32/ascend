---
lesson: prefix-sums-and-difference-arrays
source: dcb25ac4f5fc28d1
fit: partial
desk:
  - "The prefix array build trace, and the prefix-sum visualiser"
  - "The subarray-sum-equals-k code and its hash map trace"
  - "The 2D prefix build traced cell by cell, and the three rectangle queries"
  - "The difference array trace with three updates"
  - "The choice table: prefix sum, difference array, Fenwick tree, segment tree"
  - "Exercises: range sum queries, and range additions with a difference array"
---
## Introduction

A dashboard shows revenue for any date range the user drags out. With one row per day for ten years, that is 3,650 numbers, and summing the range on every mouse move is fine. Now make it one row per second: 300 million rows, 2.4 gigabytes. Summing the whole decade is a quarter-second scan, and the user drags the slider forty times a second. You need every query to cost the same, however wide it is.

The prefix sum does that: two memory reads per query, whatever the width. And it is the simplest case of a very general idea. Precompute cumulative state, so that any interval is the difference of two endpoints. Once you see that shape, you find it in bank ledgers, image processing, Kafka offsets and metrics counters.

Four ideas. The prefix array and its one formula. Pairing it with a hash map, which is how the interview problems use it. Its two-dimensional form. And its inverse, the difference array, which makes range updates cheap instead of range reads.

## The prefix array

Take an array a of n numbers. Build a prefix array P that is one longer, with P of zero equal to zero, and each next entry equal to the previous entry plus the next element. So P of i is the sum of the first i elements. Then the sum from position l to position r, inclusive, is P of r plus one, minus P of l. Everything before l cancels, and what remains is exactly the range.

Say it with small numbers. The array is 3, 1, 4, 1, 5. The prefix array is 0, 3, 4, 8, 9, 14. What is the sum of positions one through three, the 1, 4 and 1?

[pause]

P of four minus P of one: 9 minus 3, which is 6. And 1 plus 4 plus 1 is 6. Building P is one pass with one addition per element. Each query is one subtraction. For q queries, the total goes from n times q to n plus q.

Why the extra leading zero? You will also see prefix arrays of length n, which need a special case whenever the range starts at zero. The leading zero stands for "the sum of nothing" and removes that branch. Off-by-one errors in prefix sums come almost entirely from mixing the two conventions in one codebase, so pick the n plus one version and stay with it.

The trick is not specific to addition. It works for any operation with an inverse. Prefix XOR works, because XOR undoes itself. Prefix counts work: how many vowels in this substring is two lookups and a subtraction. But prefix maximum does not. Knowing the maximum of the first r elements and of the first l tells you nothing about the maximum between them, because max has no inverse. Range maximum needs a sparse table or a segment tree.

One more simplification. If you only ever need the current prefix, the "array" is a single running variable. Finding a pivot index, where the sum to the left equals the sum to the right, needs only the total and a running left sum: linear time, constant space.

## Prefix sums plus a hash map

Here is the interview workhorse. Count the subarrays whose sum is k. The prefix array turns that into a different question: a subarray from l to r sums to k exactly when two prefix values differ by k. So walk the array once, keeping a running sum s, and at each step ask a hash map: how many earlier prefixes equal s minus k? Add that to the count, then record s in the map.

The map must start with zero already seen once. That is the empty prefix, and it is what lets you count subarrays that start at index zero. Leave it out and nothing crashes; every subarray starting at the beginning is silently missed, and tests where the answer sits in the middle still pass.

The lesson traces the array 1, 2, 1, 2, 1 with k equal to 3, and finds four subarrays: 1 then 2, 2 then 1, 1 then 2, and 2 then 1.

Why not a sliding window? A window relies on the sum growing as the window extends. That holds only for positive numbers. The hash map version handles negatives, which is exactly where the sliding window answer goes wrong the first time.

The same table answers three variants with a different key. Store the running sum modulo m, and you count subarrays divisible by m. Store prefix XOR, and you count subarrays with a given XOR. Store the first index of each prefix instead of a count, and you find the longest subarray with sum k.

## Two dimensions

For a grid, the prefix cell at row r, column c holds the sum of the whole rectangle from the top-left corner down to just before that cell. Again there is an extra zero row and zero column.

You build it with inclusion and exclusion. A cell's prefix is its own value, plus the prefix above, plus the prefix to the left, minus the prefix diagonally above-left. Why the minus? Because the rectangle above and the rectangle to the left overlap in that above-left rectangle, so it was counted twice.

A query for any rectangle runs the same idea in reverse. Take the big prefix at its bottom-right corner, subtract the strip above the rectangle, subtract the strip to its left, and add back the top-left corner, which you just subtracted twice. Four reads, constant time. Forgetting that add-back is the classic bug: every rectangle that does not touch the top-left corner comes out short by its overlap.

This is the integral image of computer vision. In the Viola-Jones face detector, any rectangle sum is four array reads, which is what let a cascade of about 6 thousand features run in real time.

## Difference arrays

Prefix sums make reads over a range cheap. The inverse structure makes writes over a range cheap. Suppose you must apply many updates of the form "add v to every element from l to r", and you only read the array at the end. Doing each update literally costs the width of the range.

Instead, keep a difference array: each entry is the step from the previous element to this one. Adding v to a range changes only two steps. The step into l grows by v, and the step out of r, into r plus one, shrinks by v. Two writes per update, however wide the range. At the end, take the prefix sum of the difference array, and you get the real array back.

Say it aloud. Five zeros. Add 2 to positions one through three. The difference array gets plus 2 at position one and minus 2 at position four: 0, 2, 0, 0, minus 2. Running sums: 0, 2, 2, 2, 0. Exactly the update. Each update is constant time, the final pass is linear, and as with prefix sums, giving the array one spare slot removes the range check at the end.

Where it shows up: how many meetings overlap at each minute, bulk price changes over date ranges, seat bookings. When the coordinates are sparse, the same idea with a sorted map instead of an array is the sweep line.

## Overflow, floats and real systems

A prefix array holds sums, not values, so it needs a wider type than the input. A hundred thousand elements of size a hundred thousand sum to ten billion, far past the signed 32-bit limit of about 2.1 billion. A Java int array or a Go 32-bit prefix wraps silently to a negative number. The symptom is memorable: small ranges are correct, week-long ranges come back negative. Short ranges subtract two values that both wrapped by the same amount, so they still look right. Use 64-bit cells. In JavaScript, stay under the safe-integer limit, about 9 times 10 to the 15th.

Floats are worse in a different way. A 32-bit float count stops increasing at about 16.8 million, two to the 24th, because adding one no longer changes it. A long running sum of 64-bit floats drifts: over 100 million terms it can be off in the eighth significant digit. Fine for a dashboard, wrong for a ledger. Money is integers in the smallest unit.

Real systems are full of prefix sums. Kafka offsets are prefix counts, so consumer lag is a subtraction. Prometheus counters are prefix sums over time, and rate is a range difference divided by the window; the counter-reset handling exists because a restarted process makes that difference negative. SQL window functions compute running totals, and ledgers store running balances so any statement is two lookups.

## In the interview

The classic follow-up. Now the elements can change between queries. What do you do?

[pause]

Each change invalidates every prefix after it, a linear rebuild. So switch structures: a Fenwick tree gives logarithmic point updates and range sums, and a segment tree handles range updates too, and operations with no inverse, like max. The common wrong answer is to update the prefix array in place from the changed index, which is the linear rebuild with extra steps.

And: can you answer range minimum the same way? No. Minimum has no inverse, so prefix minima cannot be subtracted. Use a sparse table for a static array, a segment tree for a changing one, or a monotonic deque for a sliding window.

## Recap

Four things to remember. With a prefix array one longer than the input and a leading zero, the sum from l to r is P of r plus one minus P of l, and it works only for operations with an inverse. Subarray sum equals k is a running sum plus a hash map of earlier prefixes, seeded with zero seen once, and it handles negatives where a sliding window cannot. In two dimensions, subtract the strip above and the strip to the left, and add the corner back. And the difference array flips the trade: two writes per range update, one prefix pass to read, with the prefix cells always wider than the input.

At your desk: the build trace and visualiser, the hash map code and trace, the 2D cell-by-cell trace, the difference array trace, the structure choice table, and the two exercises, range sums and range additions.
