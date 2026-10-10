---
lesson: selection-and-order-statistics
source: 47caa8efebe0f7a9
fit: partial
desk:
  - "The Lomuto partition trace and the full quickselect trace for the second smallest"
  - "The three-way partition code and its invariant"
  - "The median-of-medians trace on 15 elements, and the recurrence solved by substitution"
  - "The quickselect, heap and sort comparison table"
  - "The median of two sorted arrays cut condition and its trace"
  - "Exercises: quickselect the k-th smallest, and top k with a bounded heap"
---
## Introduction

You need the median response time from 50 million latency samples. Or the 100 most similar vectors out of ten million. Or the k-th largest salary. Sorting gives you all of that as a side effect, at n log n. But you asked for one number, and there is a linear-time algorithm that finds it by throwing away most of the array without ever putting it in order.

The k-th order statistic is the element that would sit at index k if the data were sorted. The median is the middle one. Selection is the problem of finding it, and it is fundamentally easier than sorting, by a logarithmic factor, for reasons that fall straight out of quicksort's partition.

Four ideas: quickselect and why it is linear on average. The duplicate trap. Median of medians, which guarantees linear time and is almost never used on its own. And when a small heap beats all of it.

## Quickselect

Quicksort partitions around a pivot and recurses on both sides. Quickselect notices something. After partitioning, the pivot sits at its final sorted index. Call it p. If p equals k, the pivot is the answer. If k is smaller, the answer is on the left, and the whole right side can be thrown away. If k is larger, the left side goes. Only one side is ever visited again.

A tiny example. Find the second smallest in 3, 2, 1, 5, 6, 4. Partition around the last element, 4. The pivot lands at index 3, with 3, 2 and 1 on its left and 6 and 5 on its right, neither side sorted. You want index 1, which is left of 3, so 6 and 5 are discarded without ever being looked at again. Two more small partitions on the left, and the answer is 2.

Why linear? With a random pivot, half the time the pivot lands in the middle half of the range, between the 25th and 75th percentiles. When it does, the side you keep has at most three quarters of the elements. So, roughly every two partitions, the problem shrinks to three quarters or less, and the total work is a geometric series: n plus three quarters of n plus nine sixteenths of n, and so on. That bounds it at 8n, and that bound is loose. The exact analysis gives about 2n comparisons for k near either end, and about 3.4n for the median. Three to four passes over the data.

Compare quicksort. It does work proportional to all n elements at every level, and there are log n levels. Throwing one side away is exactly where the logarithm disappears.

The worst case is still quadratic: a pivot sequence that strips one element per partition. Random pivots make that a matter of luck rather than input. With a deterministic pivot, the same killer-adversary attack that hits quicksort applies, and on data a client controls, that is a denial-of-service bug, not a performance nit.

## The duplicate trap

Here is a question. You run quickselect with random pivots and a two-way partition that moves elements strictly less than the pivot to the left. You ask it for the median of a million identical values. What happens?

[pause]

It takes minutes. No element is strictly less than the pivot, so the pivot lands at the start of the range and the range shrinks by exactly one. Every time, whatever pivot you pick. That is about 3n squared over 8 comparisons, some 4 times 10 to the 11 for a million elements. Minutes in C, hours in Python. And equal keys are not exotic: timestamps at one-second resolution, HTTP status codes, rounded scores.

The fix is the three-way partition, Dijkstra's Dutch national flag. One pass splits the range into less than, equal to, and greater than the pivot. If k falls inside the equal band, the pivot is the answer and you stop. An all-equal array finishes in one linear pass, and duplicates can only help.

## Median of medians

In 1973, Blum, Floyd, Pratt, Rivest and Tarjan showed how to pick a pivot that is guaranteed to be reasonably central, making selection linear in the worst case. Split the array into groups of 5. Sort each group and take its median. Then recursively select the median of those medians, and use it as the pivot.

Why is it central? At least half the group medians are at or below the pivot, and each of those has two more elements in its group below it. So at least three tenths of all elements are at or below the pivot, and by symmetry at least three tenths are at or above. The pivot is never in the outer 30 percent, and the side you keep has at most seven tenths of the elements.

Now the recurrence, in words. The time for n is the time to find the median of n over 5 medians, plus the time on at most seven tenths of n, plus linear work. The key is that one fifth plus seven tenths is nine tenths, less than one. The two recursive calls together handle less than the whole input, so the series converges and the total is linear.

Why not groups of 3? The pivot is still central. But the fractions become one third plus two thirds, which is exactly one. The recursion no longer shrinks, and the recurrence solves to n log n. Five is the smallest odd group size that works.

And why does almost nobody use it? The constant. The simple version's bound is 24n, and even the refined bound from the original paper is about 5.4n, against quickselect's expected 2 to 3.4. On every input that is not adversarial, random quickselect wins by a wide margin. So libraries use introselect: run quickselect, and if the number of partitions passes a small multiple of log n, switch to a guaranteed method. You get the average of one and the guarantee of the other. NumPy's portable path falls back to median of medians; Rust's select does too. The C plus plus standard only promises linear time on average.

## Heap, quickselect or sort

The other route to the k largest is a min-heap of size k. Push each element, pop the minimum whenever the heap holds more than k, and at the end the heap holds the k largest, with the k-th largest at the root. Anything smaller than the root is rejected with one comparison.

Two questions decide. First, is k small relative to n? For k equals 10, log k is about 3, most elements are rejected in one comparison, and the heap wins or ties. For k equals half of n, the heap does roughly 20n operations against quickselect's 3.4. A heap is the wrong tool for a median.

Second, is the data a stream? A stream of a billion events cannot be partitioned in place. A heap of size k needs k slots and one pass. Top k over a stream is the heap, full stop.

And sort only when you need the order anyway. Sorting for one statistic costs about log n times more: around 27 times more at 100 million elements. If you need the k smallest in order, quickselect to place the k-th, then sort just that prefix. Quickselect does not leave the prefix sorted.

Know what your library does. Python's statistics median sorts a full copy. Python's nlargest keeps a heap of size k. NumPy's partition and median use selection, so a median of 100 million floats is a few selections, not a sort.

For streams where an approximate answer is fine, quantile sketches keep a few kilobytes whatever the stream's size. That is how monitoring systems report the 99th percentile. Exact answers are a batch job over stored samples.

## In the interview

A follow-up the lesson expects. The exact median of 10 to the 10, 8-byte integers, on a machine with 16 gigabytes of RAM.

[pause]

The data is 80 gigabytes, so it does not fit. Make one pass counting values by their top 16 bits: 65,536 counters. Find the bucket that contains the middle rank. Then make a second pass keeping only that bucket's values, about 150 thousand on average, which fits trivially, and quickselect within it. Two passes over the file. The weaker answers: an external merge sort, which works but does n log n work and several passes; or a sketch, when the question said exact.

And a quick one: median of medians is linear, so why does NumPy not use it from the start? Because its constant is several times worse than a random pivot's. Introselect only falls back when a depth limit is hit. The wrong answer is "median of medians is approximate", which confuses it with the median-of-three heuristic.

## Recap

Four things to remember. Quickselect keeps only the side that holds index k, so the work is a geometric series: about 3.4n comparisons for a median with random pivots. A two-way partition on all-equal data is quadratic whatever the pivot; the three-way partition fixes it in one pass. Median of medians makes selection worst-case linear because one fifth plus seven tenths is less than one, but its constant means libraries use it only as an introselect fallback. And choose between quickselect, a size-k heap and a sort by how big k is, whether the data streams, and whether you need the order.

At your desk: the partition and quickselect traces, the three-way partition code, the median-of-medians trace and recurrence, the comparison table, the median of two sorted arrays, and the two exercises, quickselect and top k with a bounded heap.
