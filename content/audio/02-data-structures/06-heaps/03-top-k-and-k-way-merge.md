---
lesson: top-k-and-k-way-merge
source: 8316997ac318a10e
fit: partial
desk:
  - "The top-k code and its trace with k equal to 3 over eight items"
  - "The k-way merge code and its eight-pop trace over three lists"
  - "The running-median class and its six-insert trace"
  - "What heapq's nlargest, nsmallest and merge do inside"
  - "The comparison table across the three families and their alternatives"
  - "Exercises: merge k sorted lists with a heap, and running median of a stream"
---
## Introduction

"Give me the 10 most viewed videos out of 200 million." "Merge these 500 sorted log shards into one timeline." "What is the median latency so far?"

Each of these has an obvious answer that sorts everything. And each has a heap answer that is faster, uses memory proportional to k instead of n, and works on a stream you can only see once. The three families are close cousins: each uses a heap of bounded size as a window onto an unbounded input.

So three ideas: top-k, k-way merge, and the streaming median with two heaps. Then what breaks when you distribute any of them.

## Top-k: the opposite kind of heap

Find the k largest of n items. Sorting is n log n and needs all n in memory. The heap approach keeps only k candidates. If the heap holds fewer than k, push. Otherwise, if the new item beats the weakest candidate, replace the weakest. At the end, the heap holds the k largest.

Here is the part interviewers probe. You want the k largest. Which kind of heap do you keep?

[pause]

A min-heap. Its root is the smallest of your candidates, which is exactly the one to evict when something better arrives. A max-heap would tell you the strongest candidate, which you never need mid-stream, and the code either grows without bound or evicts the wrong item.

A tiny run, with k equal to 2, on the stream 4, 9, 1, 7, 3. Push 4. Push 9. Now the heap is full, with 4 at the root. 1 arrives: it does not beat 4, rejected with one comparison. 7 arrives: it beats 4, so 4 is evicted and 7 goes in. Now the root is 7. 3 arrives: rejected. The answer is 9 and 7.

The cost: each item does at most one log k operation, so n log k time and order k space. But on a stream in random order, the real count is far lower. The i-th item only enters the heap if it is among the k largest of the first i items, which happens with probability k over i. Summed up, that is about k times the natural log of n over k. For a top 10 out of 200 million, about 180 heap operations in total. Every other item costs one comparison against the root. Measured, on 100 thousand random values with k of 10: 105 heap operations.

The worst case is an ascending stream, where every item beats the root, and you pay the full n log k. A feed sorted by the very key you rank on, like a timestamp-ordered log ranked by timestamp, is exactly that.

The variants are the same problem. k smallest: a max-heap of size k. k closest points: a max-heap keyed by squared distance; skip the square root, it is monotonic and slow. k most frequent: count with a hash map, then top-k over the counts. And when all n are already in memory and k is not tiny, quickselect finds the k-th largest in expected linear time. The heap is for streams, or for k much smaller than n. When k is 1, a running maximum is enough.

## K-way merge: one head per stream

You have k sorted sequences and want one. Concatenating and sorting is order N log N for N total elements. Merging pairwise, the first two, then the result with the third, and so on, is order N times k, because early elements get copied again in every merge.

The heap solution is N log k. Push the first element of each sequence, tagged with which sequence it came from. Pop the minimum, emit it, and push the next element from that same sequence. Repeat until empty. The heap never holds more than k entries.

Small example. Three lists: 1 and 4; 2 and 3; and 5 alone. The heap starts with 1, 2 and 5. Pop 1, and push 4 from its list. Pop 2, push 3. Pop 3; that list is done. Pop 4, pop 5. Out comes 1, 2, 3, 4, 5, and the heap never held more than three entries. The list number tagged on each entry also serves as a tiebreaker, so equal values never fall through to comparing something unorderable.

How big is the gap? A thousand lists of a thousand elements each: pairwise is about a billion element operations, the heap about 10 million.

This loop is the engine of external sorting: sort chunks that fit in memory, write each as a sorted run, then merge the runs with one read buffer per run. Size it for 100 gigabytes with 1 gigabyte of memory. That is 100 runs, and a 100-way merge with 4-megabyte buffers holds 400 megabytes of buffers plus a heap of 100 entries. Every byte is read twice and written twice. If the buffers do not fit, the merge goes multi-pass, and each pass reads and writes the whole file again. GNU sort merges 16 files at a time by default, so more than 16 runs means a second pass. PostgreSQL spills a sort to disk past its work memory setting, 4 megabytes by default, and merges with the same loop.

It runs everywhere. LSM-tree databases compact sorted tables with exactly this loop; RocksDB's merging iterator is a min-heap over its inputs. Search engines merge per-shard result pages the same way. That is why Elasticsearch limits deep pagination to 10 thousand results by default: page 1,000 over 5 shards means each shard returns 10 thousand hits, and the coordinator merges 50 thousand to keep 10.

## The streaming median: two heaps

The median after every element, without re-reading the stream. Sorting after every arrival is far too slow. The elegant answer uses two heaps as a balanced partition. A max-heap called low holds the smaller half. A min-heap called high holds the larger half. Two invariants: everything in low is at most everything in high, and low has the same size as high, or one more. Then the median is low's root when the count is odd, and the average of the two roots when it is even. Both roots are constant time to read.

The clean insert has no case analysis. Push the new value into low. Move low's maximum into high. Then, if high is now bigger, move its minimum back to low. The middle step guarantees the ordering invariant whatever the value was; the last step restores the sizes.

Trace it on 5, 16, 1 and 4. Add 5: it goes into low, crosses to high, then comes back because high was bigger. Low holds 5, and the median is 5. Add 16: into low, and 16 is low's maximum, so it crosses to high. One each, and the median is the average of 5 and 16, which is 10.5. Add 1: into low, then low's maximum, 5, crosses to high; high is now bigger, so its minimum, 5, comes back. Low holds 5 and 1, high holds 16, median 5. Add 4: into low, low's maximum, 5, crosses to high. Low holds 4 and 1, high holds 5 and 16. The median is 4.5. Correct: the sorted values are 1, 4, 5, 16.

Its limitation is deletion. A sliding-window median must remove the value leaving the window, which a plain heap cannot do. That is the next lesson's lazy deletion.

## When you distribute it

Top-k across shards hides a trap. Each of 100 shards returns its top 10. Is the merged list the true top 10?

[pause]

It depends on the ranking. For a per-item score, like the highest-rated videos, yes: a global leader has the same score in its own shard, so it is in that shard's top 10. For an aggregated count, no. The lesson's counterexample: shard one counts a 5, b 4 and c 3; shard two counts d 5, c 3 and b 1. Merge the local top twos and c shows only 3. But c's true total is 6, the highest of all. Counts add across shards, and local top lists throw that away. The fix: return full count tables, or a mergeable sketch, or a second round asking every shard for the counts of all candidates.

The same holds for percentiles. Averaging 500 per-machine medians does not give the global median; quantiles are not additive. And an exact two-heap median cannot be merged without shipping every sample. Production dashboards keep a mergeable sketch instead, a t-digest or an HdrHistogram, a few kilobytes per machine, combined at the coordinator with a stated error bound. Know both, and say which you would ship.

And the k-way merge across shards has head-of-line blocking: it cannot emit until every stream offers its head, so the 99th percentile equals the slowest shard's latency. The fix is per-shard timeouts with partial results.

## In the interview

One more follow-up. The k-th largest of 10 million integers already in memory: heap or quickselect?

[pause]

Quickselect: expected linear time, with a worst-case guard, as C++, Rust and NumPy all ship it. The size-k heap is n log k and wins only on a stream or when k is tiny; for k of 10 out of 100 million, the heap's single comparison per item still beats quickselect's partitioning. Saying "sort it" pays n log n for a question with a linear answer.

## Recap

Four things to remember. For the k largest keep a min-heap of size k, because its root is the eviction candidate; on random input only about k times the log of n over k items ever enter it, and a feed sorted by the key is the worst case. K-way merge is a heap of one head per stream, N log k, and it is the engine of external sort, LSM compaction and scatter-gather queries. The streaming median is two facing heaps: push to low, move its maximum across, rebalance. And distributed top-k by count and averaged medians are both wrong; use full counts or mergeable sketches.

At your desk: the top-k, merge and median code with their traces, the heapq internals, the comparison table, and the two exercises.
