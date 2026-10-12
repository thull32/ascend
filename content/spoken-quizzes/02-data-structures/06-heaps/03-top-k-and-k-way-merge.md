---
lesson: top-k-and-k-way-merge
source: cdd65de287086395
---
## 1

To find the 100 largest values in a stream of a billion numbers, with minimal memory, what do you keep?

A, a max-heap of size 100, evicting its root for smaller values. B, a max-heap of all values seen, popping 100 times at the end. C, a min-heap of size 100, evicting its root for larger values. D, a sorted list of size 100, inserting each value by bisection.

[think]

The answer is C: a min-heap of size 100, evicting its root for larger values.

The root of a min-heap of the current best 100 is the weakest candidate, exactly the one to evict. A max-heap's root is the strongest, useless for eviction, and a heap of all values needs a billion slots. The sorted list works, but each insert is order k instead of log k.

## 2

Merging k sorted lists of N total elements pairwise, the first two, then the result with the third, and so on, costs N times k. The heap-based merge costs N log k. For 1,000 lists of 1,000 elements each, roughly how many element operations does each perform?

A, pairwise about a million, heap about a million. B, pairwise about 10 million, heap about a billion. C, pairwise about a billion, heap about 10 million. D, pairwise about a billion, heap about a billion.

[think]

The answer is C: pairwise about a billion, heap about 10 million.

N is a million. Pairwise, that is a million times 1,000, a billion, because early elements are recopied in every merge. The heap does a million times log base 2 of 1,000, about 10, so about 10 million.

## 3

In the two-heap running median, why does every new value go into the max-heap first and then get rebalanced, rather than being routed to the correct heap by comparison?

A, the max-heap is always smaller, so it must receive new values. B, it makes the ordering invariant hold without case analysis. C, it is faster, since it skips a comparison on every insert. D, routing by comparison is incorrect when the value equals a root.

[think]

The answer is B: it makes the ordering invariant hold without case analysis.

Whatever was pushed, the largest of the low half is then moved across, so the low half's maximum is at most the high half's minimum, unconditionally, and one size check then restores the balance. Routing by comparison is also correct, ties included, but needs cases for which heap is larger and which side the value belongs to. Push then move does more heap operations, not fewer.

## 4

A top-10 job over 200 million items in random order does far fewer than 200 million heap operations. About how many, and what input makes it do the full amount?

A, about 200 heap operations; input sorted ascending by the ranking key. B, about 200 heap operations; input with many duplicate keys. C, about 20 million heap operations; input with many duplicate keys. D, about 2 million heap operations; input sorted descending by the key.

[think]

The answer is A: about 200 heap operations, and input sorted ascending by the ranking key does the full amount.

On random order, the i-th item enters the heap with probability k over i, so the expected count is about k times the natural log of n over k, plus k: around 180 for these numbers. Every other item costs one comparison against the root. Ascending input makes every item beat the root and forces the full n log k. Descending input is the best case, and duplicates are rejected by the comparison.

## 5

Each of 100 shards returns its local top 10. For which ranking is the merged result guaranteed to be the true global top 10?

A, only for an aggregated count, because counts add across shards. B, for neither, because shards can hold different numbers of items. C, only for a per-item score, because a global leader must lead its own shard. D, for both, because the union of local top tens always contains the global top ten.

[think]

The answer is C: only for a per-item score, because a global leader must lead its own shard.

An item with one of the highest scores globally has that same score in its own shard, so it is in that shard's top 10. An item's count is spread across shards, so it can rank below the local top 10 everywhere while leading overall. The fix for counts is returning full counts, a mergeable sketch, or a second round that fetches counts for every candidate.

## 6

A metrics service reports median and 99th percentile latency across 500 machines. An engineer proposes that each machine keep an exact two-heap median, and the coordinator average them. What is the problem?

A, heaps cannot hold floating-point latencies, only integers. B, averaging 500 numbers per query is too slow for a dashboard. C, the mean of the medians is not the global median: use a sketch. D, two-heap medians cost linear time per insert, too slow at scale.

[think]

The answer is C: the mean of the medians is not the global median, so use a sketch.

Quantiles do not add up, and exact two-heap structures cannot be merged without shipping every sample. Mergeable sketches, such as t-digest or HdrHistogram, trade a small error for bounded memory and mergeability, which is what a distributed dashboard needs. Each two-heap insert is logarithmic, so speed is not the issue.
