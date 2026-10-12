---
lesson: prefix-sums-and-difference-arrays
source: 6f61a51c5674c6e1
---
## 1

A prefix array P has length n plus 1, and its entry at 0 is 0. Which expression gives the sum of the elements from index l to index r, inclusive?

A, the entry at r, minus the entry at l minus 1. B, the entry at r plus 1, minus the entry at l. C, the entry at r, minus the entry at l. D, the entry at r plus 1, minus the entry at l plus 1.

[think]

The answer is B: the entry at r plus 1, minus the entry at l.

The entry at i holds the sum of the first i elements. The sum up to and including index r is the entry at r plus 1, and subtracting the sum of the first l elements leaves exactly l to r. The entry at r minus the entry at l minus 1 is the length-n convention, and it breaks when l is 0.

## 2

Why can a prefix array not answer range maximum queries the way it answers range sums?

A, max is not associative, so prefix maxima cannot be combined. B, max has no inverse, so a prefix max cannot be subtracted away. C, range max needs the values sorted first, which loses their positions. D, max needs a comparison per element, which costs more than an addition.

[think]

The answer is B: max has no inverse, so a prefix max cannot be subtracted away.

Range sums work because subtraction undoes addition. Nothing removes the first part of the array's contribution from the maximum of a longer prefix, so the maximum of a prefix tells you nothing about the maximum of a later stretch of it. Max is associative, which is exactly why a sparse table or a segment tree can answer range maximum; a monotonic deque handles sliding windows.

## 3

You have a million updates of the form "add v to indexes l to r", followed by a single read of the whole array. What is the best approach?

A, a difference array: constant time per update, and one linear prefix pass to read. B, a Fenwick tree: log n per update, and n log n to read everything. C, a loop per update: proportional to the range per update, then linear to read. D, a lazy segment tree: log n per update, and linear to read at the end.

[think]

The answer is A: a difference array, constant time per update, and one linear prefix pass to read.

Because there are no reads between updates, the difference array's constant-time update plus one reconstruction is optimal. A lazy segment tree also works, but costs log n per update and far more code; it earns its keep only when reads and writes interleave. The literal loop is linear per update in the worst case.

## 4

Counting the subarrays whose sum equals k, with a running sum and a map of prefix-sum counts, why must the map start with a count of 1 for the sum 0?

A, it handles k equal to 0, where every element would otherwise be counted twice. B, it records the empty prefix, so subarrays starting at index 0 are counted. C, it prevents a missing-key error the first time the running sum minus k is looked up. D, it is only an optimisation that saves one lookup, and could be omitted.

[think]

The answer is B: it records the empty prefix, so subarrays starting at index 0 are counted.

The empty prefix has sum 0, and a subarray that starts at index 0 with sum k needs that earlier prefix of 0 to subtract. Omitting the seed does not crash, because the lookup uses a default. It silently undercounts every subarray that starts at index 0, whatever k is.

## 5

A Java service stores a prefix array of request byte counts in an int array. Small ranges are correct, but week-long ranges come back negative. What happened?

A, integer division in the average step truncated toward negative infinity. B, the array was rebuilt concurrently, and a reader saw a half-built prefix. C, the prefix array used the length-n convention and read index minus 1. D, the running total passed the signed 32-bit limit and wrapped, so later prefixes are negative.

[think]

The answer is D: the running total passed the signed 32-bit limit and wrapped, so later prefixes are negative.

A prefix array holds sums, which grow without bound, so it needs a wider type than the values. A few gigabytes of traffic exceeds the signed 32-bit limit of about 2.1 billion, and Java wraps silently. Short ranges subtract two values that both wrapped by the same amount, which is why they still look right. Use long for the prefix cells.
