---
lesson: two-heaps
source: cf0cfe25c7f830fe
fit: partial
desk:
  - "The MedianFinder template in Python and the JavaScript comparator heap"
  - "The Find Median trace, heap array by heap array"
  - "The WindowMedian code with lazy deletion, and its eight-step trace"
  - "The Kth Largest in a Stream trace and the maximise-capital walk-through"
  - "The near-miss, variants, timing and structure-choice tables"
  - "Exercises: maximise capital with two heaps, and a median bag with removals"
---
## Introduction

A service records one latency per request, and the on-call dashboard wants the median of everything so far, refreshed after every sample. Re-sorting on each arrival is n log n per sample. A sorted Python list with a binary-search insert looks better, but every insert shifts half the list in memory, so each one is linear. On 300 thousand samples that took about 1.8 seconds, and it grew quadratically. Two heaps took 124 milliseconds, well under a microsecond per sample.

The median is not a largest or smallest question, so one heap cannot answer it. It is a boundary question: the value that separates the lower half of the data from the upper half. Keep each half in its own heap, facing each other, a max-heap for the lower half and a min-heap for the upper half, and the two values next to the boundary are always at the two roots.

The interview adds three twists in a predictable order: prove the invariants, make it slide, and scale it. That is the plan here.

## The signal

Reach for two heaps when the statement asks for the median of a stream, or the median of each window. Also any fixed quantile of a growing set, like the 90th percentile so far, which is the median with a different balance rule. And a third, less obvious shape: two populations where you keep needing the maximum of one and the minimum of the other, with elements migrating between them as a threshold moves. "Of the projects I can afford, take the most profitable."

The test fits in one question. Does the answer sit at the top of one group, or at the boundary between two? Top means one heap. Boundary means two.

The near-misses are where interviewers probe. Median of two sorted arrays: nothing arrives, both inputs are sorted, so binary search on a partition beats building heaps. The median of an array, once: quickselect, linear expected time. The 99th percentile across 500 machines: a mergeable sketch, because exact heaps need every sample and cannot be combined. Kth largest in a stream with k fixed: one heap of size k. And minimum meeting rooms: one min-heap of end times, because only the earliest end matters. That is a top, not a boundary.

## The invariants

Call the max-heap low and the min-heap high. Two invariants hold after every operation. Order: the largest value in low is at most the smallest value in high. Balance: low holds either the same number of elements as high, or exactly one more.

Why is the median at a top? By the order invariant, low in ascending order followed by high in ascending order is the whole data set in sorted order. So low's root is the middle element when the count is odd, and the average of the two roots is the median when the count is even. Both are roots, so reading the median is constant time.

Insertion is three steps, and they are worth memorising. Push the new value onto low. Move low's maximum across to high. If high is now bigger than low, move high's minimum back. The middle step is what makes it unconditional: whatever the new value was, the element that crosses is at least everything left in low, so order holds.

Here is the tiny example, the stream 9, 4, 12, 7, 3. After 9, the median is 9. After 4, low holds 4 and high holds 9, and the median is 6.5. After 12, low holds 4 and 9, high holds 12, and the median is 9. After 7, two and two, and the median is the average of 7 and 9, which is 8. After 3, low's root is 7, and the median is 7. Sorted, that stream is 3, 4, 7, 9, 12, and 7 is indeed the middle.

The cost: each insert is three to five heap operations on heaps of about half the data, so log n. The read is constant. Memory is every value.

One small trap for the even case. Integer division of the sum truncates 6.5 to 6 in Python, and in a language with 32-bit integers, adding two middle values near the top of the range overflows. Halve each first, or widen.

## Making it slide

Sliding Window Median asks for the median of every window of k elements. Now elements leave, and the leaving element is somewhere inside a heap. A binary heap can only remove its root.

The fix is lazy deletion. Record the departing value in a pending map, decrement a live count for the heap it belongs to, and only physically discard it when it surfaces at a root. Two extra invariants make this safe, and they are where candidates fail.

First: both roots are always live. Prune whenever you retire a root, and also after every rebalancing pop, because a stale entry can rise into the root. Forget the second one and the lesson's example returns 3 as the median of a window that 3 left three steps earlier.

Second: balance uses live counts, never the heaps' physical lengths. The lengths include stale entries. Balance on them and odd windows start reporting averages; the lesson's example returns 7.5 and 2.5 where the right answers are 7 and 4. The bug only appears after the first removal that is not at a root, so small tests miss it.

Here is a question before the next part. The window is a thousand elements. How big can the heaps get?

[pause]

Not a thousand. Removed values far below the median sit at the bottom of low and never surface. Over 100 thousand random values with a window of about a thousand, the heaps peaked at almost 92 thousand physical entries. On sorted input, all 100 thousand. In production that is a rolling-median service whose memory tracks the stream, not the window, until it restarts.

The fix is compaction: when physical entries exceed twice the window, rebuild both heaps from the current window. A rebuild costs k log k and cannot happen more often than every k steps, so the amortised cost stays log k. Measured, the peak fell to about 2 thousand entries, and the run got faster.

Be honest about the alternative too. For small windows, a plain sorted list won in CPython: with a window of a thousand, 37 milliseconds against 68, because shifting a thousand pointers is one memory move. At windows of 10 thousand and 100 thousand, the heaps won clearly.

## One side, and migration

Kth Largest in a Stream is the same boundary, placed k from the top instead of in the middle. The upper side is the k largest, a min-heap whose root is the answer. The lower side is everything else, and in an insert-only stream it is never read again, because the boundary only moves up. Drop it, and two heaps become one.

Add deletions, and that argument fails. Delete one of the top k, and the new kth largest may be a value you threw away. So "kth largest with deletions" is two heaps again: exactly k live elements in the upper heap, the rest in the lower, lazy deletion on both.

The migration shape is "maximise capital". You start with some capital, each project needs a minimum capital and pays a profit, and you may do k projects. One min-heap holds projects you cannot yet afford, keyed by capital. One max-heap holds profits you can afford. Each round, move everything now affordable across, then take the most profitable. Each project crosses once and is taken at most once, so the total is n plus k, times log n.

## In the interview

Here is a follow-up the lesson expects. The data is spread over 50 shards. Give me the exact median.

[pause]

Binary search on the value, not the position. Each round asks every shard how many of its values are at most the midpoint. About 32 rounds cover a 32-bit range, each costing 50 small messages. For an approximate answer, merge per-shard sketches. The common wrong answer is averaging the 50 shard medians, which is not the median of anything.

And another: the stream is unbounded and memory is fixed. An exact median in one pass needs memory on the order of the stream; that is a proven lower bound. So state an error bound, and use a quantile sketch such as t-digest, or histogram buckets, or a reservoir sample. "Two heaps capped at a size limit" is wrong, because it silently discards the elements that decide the median.

One more, short. All values are integers from 0 to 100. Use a count array with 101 slots: constant-time insert, and the median is a walk over at most 101 counts. Keeping the heaps spends log n on a problem with a constant-time answer.

## Recap

Four things to remember. Two heaps answer boundary questions: if the answer is at a top, use one heap; if it is between two groups, use two. The invariants are order and balance, and insertion is push to low, move low's maximum across, and move back if high got bigger. Sliding windows need lazy deletion with live counts, live roots, and compaction, or memory tracks the stream. And every near-miss is an interviewer changing one condition: static inputs mean binary search or quickselect, many machines or unbounded streams mean sketches, and a small value range means a count array.

At your desk: the template and JavaScript heap, the stream trace, the window-median code and its trace, the kth-largest and capital walk-throughs, the tables, and the capital and median-bag exercises.
