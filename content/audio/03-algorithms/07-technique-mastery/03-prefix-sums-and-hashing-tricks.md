---
lesson: prefix-sums-and-hashing-tricks
source: 6d520e00edb84717
fit: partial
desk:
  - "The table of operations and whether each has an inverse"
  - "The six-line counting template, and its trace on 1, 2, minus 1, 2, minus 2, 3 with k equal to 3"
  - "The remainder-bucket traces on the opening array, both the pairs count and the one-pass form"
  - "The equal-XOR-triples code, and the vowel-parity mask trace on baeaeo"
  - "The transform table, and the two-dimensional fix-a-pair-of-rows reduction"
  - "The hashing, memory, remainder-by-language and overflow details, and the structure comparison table"
  - "Exercises: count subarrays divisible by k, and longest substring with every vowel even"
---
## Introduction

How many contiguous subarrays of 4, 5, 0, minus 2, minus 3, 1 have a sum divisible by 5? A sliding window cannot help: "divisible by 5" survives neither shrinking nor growing a window, and with negative numbers the running sum is not even monotone. Extending from every start costs n squared. The answer is 7, and one pass with an array of five counters finds it.

The trick is not "use a hash map". It is an algebraic fact: the aggregate of a range is the difference of two prefix aggregates, whenever the operation can be undone. Once you see a subarray as a pair of prefixes, "sum equals k", "sum divisible by k", "XOR equals t" and "every vowel appears an even number of times" are the same six lines with a different key.

So: why it works and when it needs an inverse, the counting template and its two load-bearing details, remainder buckets, XOR and parity masks, and where an inequality forces a different structure.

## A range is the difference of two prefixes

Let the prefix at position j be the aggregate of everything before j, starting from the identity, which for sums is 0. Then the sum of the range from i up to just before j is the prefix at j minus the prefix at i. The shared beginning cancels.

That works whenever the operation is associative and every element has an inverse. Sum has subtraction. Sum modulo k has it too. XOR is its own inverse. A vector of per-letter counts subtracts letter by letter. Product only works without zeros, and floats drift.

Max, min, greatest common divisor, OR and AND have no inverse at all, so a prefix difference means nothing for them. Range queries on those need a structure built for the operation, like a sparse table or a segment tree.

This is why Product of Array Except Self uses a prefix product and a suffix product instead of dividing the total by each element. Division is the inverse, and a single zero takes it away.

## Counting subarrays is counting pairs of prefixes

Every subarray corresponds to exactly one pair of prefix positions, a start i before an end j. So counting subarrays with some property is counting pairs of prefixes with some relation. When that relation can be rearranged into an equality, a hash map of the prefixes seen so far answers each j in constant time.

For "sum equals k", the template is: scan left to right, keep a running prefix, add the number of earlier prefixes equal to the current prefix minus k, then record the current prefix. Every variation in this lesson turns one of three knobs: the prefix operation, the partner key you look up, and what the map stores. Store counts to count subarrays. Store the first index of each key to find the longest. Store the last index to find the shortest.

Two details are load-bearing. First, seed the map with one empty prefix, worth 0, before the loop. Without it, every subarray starting at index 0 is missed, because its partner is the empty prefix. Second, look up before you insert. That keeps the start strictly before the end. With k equal to 0, inserting first would match every prefix with itself and over-count by exactly n. One more question before moving on: why does the map store counts, and not just whether a prefix has been seen?

[pause]

Because the same prefix value can appear more than once. In the lesson's trace, a prefix value of 2 occurred twice, so one step found two subarrays at once: two different start positions.

Now the boundary. When the relation is an inequality, like "sum at least k", a hash map is useless, because it cannot answer "how many stored keys are at most this value". You need order: a Fenwick tree over the compressed prefix values, at n log n, a merge-sort count, or for "shortest subarray with sum at least k", a monotonic deque over the prefixes. Same split as in the two-pointer lesson: equality goes to a hash map, order goes to a sorted structure.

## Remainder buckets

Divisibility is equality in disguise. A range sum is divisible by k exactly when its two prefixes have the same remainder modulo k. So the partner key is the remainder itself, and since there are only k remainders, the hash map becomes an array of k counters. Every pair of equal remainders is one subarray.

Back to the opening array. Its prefix sums are 0, 4, 9, 9, 7, 4, 5. Their remainders modulo 5 are 0, 4, 4, 4, 2, 4, 0. Remainder 4 appears four times, which gives 6 pairs. Remainder 0 appears twice, which gives 1 pair. Remainder 2 appears once, which gives none. 6 plus 1 is 7. The pair of zeros is the whole array, which sums to 5.

Now the bug that survives into interviews. In JavaScript, Java, C, C plus plus, Go and Rust, the remainder operator takes the sign of the dividend: minus 7 modulo 5 comes out as minus 2, not 3. Minus 2 and 3 are the same class, but they land in different buckets, or at a negative array index, and the count comes out silently low. Tests without negative numbers still pass. Normalise by taking the remainder, adding k, and taking the remainder again. Python's remainder is already non-negative for positive k.

Two variations turn the other knobs. "Length at least 2, sum a multiple of k" stores the first index of each remainder, which keeps the longest span, the one most likely to clear the length bar. "Remove the shortest subarray so the rest is divisible by p" looks up the current remainder minus the total's, and stores the last index, because you want the shortest.

## XOR prefixes and parity masks

XOR is its own inverse: anything XOR itself is 0. So the XOR of a range is the XOR of its two prefixes, with no subtraction, no sign problem and no overflow. "Count subarrays with XOR equal to t" is the same template, looking up the current prefix XOR t.

XOR also allows a counting twist. "Count triples where the XOR of one range equals the XOR of the range right after it" looks cubic. But two values are equal exactly when their XOR is 0, so the condition says the combined range has XOR 0: its two outer prefixes are equal. And when they are, every split point inside works. So for each pair of equal prefixes, you add the number of split points between them. Keep, for each prefix value, both how many times it has occurred and the sum of those positions, and each new position's contribution is one multiplication and one subtraction. On five 1s, it returns 10. Storing a sum of positions beside a count, to get a sum of distances in constant time, recurs in hard problems.

Then parity masks. "Find the longest substring in which every vowel appears an even number of times." Only parities matter, so the prefix state is a 5-bit mask, one bit per vowel, and reading a vowel flips its bit. A substring has all-even vowel counts exactly when its two prefix masks are equal. You want the longest, so store the first index of each mask. There are only 32 masks, so use an array of 32 slots, not a hash map.

On the string b, a, e, a, e, o: the mask is empty after the b, flips through three non-empty masks, and is empty again after the second e, at position 5. The empty mask was first seen at position 0, so the best is 5, b, a, e, a, e. The trailing o is left out because its count is odd.

Two extensions. "At most one letter with an odd count", a substring that can be rearranged into a palindrome, also looks up the mask with each single bit flipped: one more lookup per letter, still linear. And "longest subarray with equal numbers of 0s and 1s" maps every 0 to minus 1, after which equal counts means a sum of zero, which means two equal prefixes.

## Transform first, and the second dimension

Most hard prefix problems become the template once you transform each element. Exactly k odd numbers: map odd to 1 and even to 0, and look up the prefix minus k. That one also falls to the at-most-k window, but the prefix route is the one that survives negatives. "Subarrays with average at least m": subtract m from every element, so the target becomes zero. That turns a ratio condition into a sum condition, though it is an inequality, so it needs an ordered structure and costs n log n.

For a grid, "count the submatrices that sum to a target", fix a top row and grow the bottom row downwards, keeping each column's sum between the two rows. Each pair of rows reduces the problem to the one-dimensional count over those column sums. The total is rows squared times columns, so put the smaller dimension in the squared factor, transposing if you need to. Reducing two dimensions to many one-dimensional problems by fixing a pair of rows is the move to remember. It also handles the maximum-sum rectangle, with Kadane on the column sums.

## In the interview

Here is the follow-up the lesson expects first. Now count subarrays with sum at least k, negatives allowed.

[pause]

Rearranged, it asks how many earlier prefixes are at most the current prefix minus k. That is an inequality, so a hash map cannot do it. Use a Fenwick tree over the sorted distinct prefix values, or a merge-sort count, in n log n. The wrong answer is a sliding window, which needs heredity, and negatives destroy it.

And a second: return the longest such subarray instead of the count. Store the first index of each key and never overwrite it; the candidate at each position is the distance back to that first index. For the shortest, store the last index. The wrong answer is keeping counts and trying to recover positions afterwards.

## Recap

Four things to remember. A range is the difference of two prefixes, but only when the operation has an inverse; max, greatest common divisor and OR do not. Counting subarrays is counting pairs of prefixes: seed the empty prefix, look up before inserting, and choose counts, first index or last index by the question. Divisibility, XOR and vowel parity are the same template with a different key, and normalise negative remainders in any language whose remainder keeps the sign. And equality goes to a hash map, inequality to a Fenwick tree, a merge-sort count or a deque.

At your desk: the counting template and its trace, the remainder-bucket traces, the XOR-triples code, the parity-mask trace, the transform table, the under-the-hood details, and the two exercises.
