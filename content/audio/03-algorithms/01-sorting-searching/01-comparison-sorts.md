---
lesson: comparison-sorts
source: 5f3c8b39608c5d4f
fit: partial
desk:
  - "The insertion sort, Lomuto and Hoare traces on the page, step by step"
  - "The heapify trace and the build-heap sum that makes it linear"
  - "The comparisons, moves and access-pattern table, and the explicit-stack quicksort code"
  - "Exercises: a stable merge sort, and Lomuto partition"
---
## Introduction

You have 10 million events and you need them in timestamp order, and within each timestamp, in the order they arrived. You call sort. What actually runs? Whether that call takes a second or a minute, whether it needs another 80 megabytes of memory, and whether the arrival order survives, all depend on the algorithm behind the name.

Every comparison sort answers three questions differently: how it picks the next two elements to compare, how it moves data once it knows the answer, and what that costs in memory. There are four that matter: insertion, merge, quick and heap. And the strange part is that the one with the worst worst case is the one everybody uses.

So, three ideas. The invariant behind each of the four. Why quicksort beats heap sort and merge sort on real hardware even though it does more comparisons. And the two hidden costs: stack depth and stability.

## Insertion sort

Insertion sort is the sort you do by hand with playing cards. Take the elements one at a time and slide each one left until it sits behind something smaller or equal. The invariant: after you have processed i elements, the first i are sorted.

Here is the fact that makes it useful. Every shift removes exactly one inversion, a pair of elements that are in the wrong order. So the number of moves equals the number of inversions. Take three, one, two. The inversions are three before one, and three before two. Two inversions, and insertion sort does exactly two moves: the three slides right once for the one, and once more for the two.

A random array has about n squared over four inversions, so insertion sort is quadratic on average. But a nearly sorted array has few inversions, so it runs close to linear time.

And it is stable, as long as you only shift elements that are strictly greater. An equal element is never moved past the one you are inserting.

That is why it is not a toy. Every production sort switches to insertion sort for small subarrays: up to 12 elements in Go, 16 in the C plus plus standard library, 44 in Java's primitive sort. Its inner loop is a tight run of compares and moves over memory already in cache, with no recursion and no allocation. At 16 elements, the roughly 64 moves cost less than the bookkeeping of a partition or a merge.

## Merge sort

Merge sort splits the array in the middle, sorts each half recursively, then merges the two sorted halves by repeatedly taking the smaller head.

The merge invariant: the output is sorted, and everything in it is less than or equal to both current heads. Each step takes the smaller head, which is no bigger than anything left on either side, because both sides are sorted. When one side runs out, you copy the rest of the other without comparing.

The recurrence is two half-size problems plus linear work to merge, which solves to n log n. The important word is theta. Merge sort does the same work on every input, sorted, reversed, random or all equal, because the split never looks at the values. That predictability is a feature.

The cost is memory. The merge needs somewhere to write that is not the input, so a straightforward merge sort needs order n extra space. Timsort gets that down to a buffer the size of the shorter run, at most half the array.

And merge sort is naturally stable: when the two heads are equal, take from the left first. Change that "less than or equal" to a strict "less than", and stability is gone.

## Quicksort and the pivot

Quicksort picks a pivot, rearranges the array so everything smaller is on the left and everything larger is on the right, and recurses on both sides. The work is in the partition. The recursion is bookkeeping.

The simplest scheme is Lomuto's. The pivot is the last element. One pointer sweeps across the array, and a second marks the end of the "less than or equal" region. Its invariant has four zones: elements known to be at most the pivot, elements known to be greater, the unexamined rest, and the pivot itself at the end. When the sweep finishes, one swap puts the pivot between the two zones, exactly where it will sit in the sorted output. It never moves again.

Lomuto has a trap. Before I tell you: what does it do on an array where every element is equal?

[pause]

Every element passes the "less than or equal" test, so the pivot lands at the very end, and the split is n minus 1 on one side and nothing on the other. That is quadratic. Hoare's original scheme runs two pointers inward from both ends, and both stop on elements equal to the pivot, so equal keys get swapped across the middle and the split stays balanced. On random input it does roughly a third as many swaps. The price is subtlety: the pivot does not end up in a known position, and getting the recursion bounds wrong gives you an infinite loop or a lost element. The lesson's advice for an interview: write Lomuto, and say that Hoare exists and why it is better. When duplicates are common, use a three-way partition into smaller, equal and larger, and an array of one repeated value sorts in linear time.

Now the worst case. Quicksort is n log n expected and n squared in the worst case, and the whole gap is about the pivot. If the pivot is always the smallest element, each partition peels off one element, and the recursion is n deep. With a first-element pivot, that happens on sorted input, which is not exotic. It is the most common input in the world.

The fixes, in rising paranoia. The middle element defeats sorted and reversed input. Median of three is cheap and good on real data, but a crafted input still beats it. A random pivot means no fixed input is bad. And introsort tracks recursion depth, and past about twice log n, it switches to heap sort for that subarray, which guarantees n log n. The adversary is real: in 1999 McIlroy published a procedure that makes any deterministic-pivot quicksort quadratic. Sorting attacker-controlled data with a fixed pivot rule hands them a denial of service.

## Heap sort and the cache

Heap sort builds a max-heap over the array in linear time, then repeatedly swaps the root, the largest element, to the end, shrinks the heap by one, and sifts the new root down. Each extraction is log n, so the sort is n log n in every case, with constant extra space. On paper, it has merge sort's guarantee and quicksort's memory.

On real hardware it is the slowest of the three on large inputs, often by a factor of two or three. Here is why, with numbers. For 10 million keys, merge sort makes about 220 million comparisons, quicksort about 320 million, and heap sort about 460 million. So quicksort does more comparisons than merge sort, and still wins. Comparing two integers in registers costs a cycle or less. A miss to main memory costs around 100 nanoseconds.

Sift-down jumps from index i to 2i plus 1 to 4i plus 3, and those addresses double each step. A heap of 10 million keys is 80 megabytes. The top 12 levels stay in cache, and the remaining 11 levels of every sift-down are misses: about ten trips to main memory, around a microsecond, for each of 10 million extractions. Quicksort's partition reads memory in address order, so the prefetcher has the next line ready before the loop reaches it, and a pass over the same 80 megabytes streams in about 10 milliseconds. The access pattern decides the race, not the comparison count.

## Stack depth and stability

Two more costs hide behind "extra space".

Quicksort needs a stack. Recurse naively on both sides, and the depth is the height of the recursion tree, which is n in the worst case. For a million elements that overflows every default thread stack, and Python's default limit is a thousand frames. The fix: recurse on the smaller side and loop on the larger. The smaller side is at most half the range, so the depth is at most log n, whatever the pivots do. The time is still quadratic in the worst case, but it no longer crashes.

Stability is the other. A sort is stable if elements that compare equal keep their input order. Insertion and merge sort are stable when written with the right inequality. Quicksort and heap sort are not, because partitioning and sifting move elements long distances past their equals. This is what solves the opening problem: leave the events in arrival order, then run a stable sort by timestamp. Python, Java's collection sort, JavaScript since 2019, and Rust's plain sort are all stable for exactly this reason. And if you need stability from an unstable sort, add the original index as a tiebreaker.

The canonical stability story: Chrome's JavaScript engine used an unstable quicksort until 2018. Code that relied on a secondary order surviving a sort worked by accident in Firefox, which used merge sort, and broke in Chrome. The engine switched to Timsort, and the next version of the standard made stability mandatory. Stability is a contract, not a detail.

One more trap: a comparator must be a consistent ordering. The classic bug is comparing integers by subtracting them, which overflows. Java's Timsort detects the inconsistency and throws "comparison method violates its general contract". The C plus plus sort, with the same comparator, can read outside the array.

## In the interview

Here is a follow-up the lesson expects. You have 1 terabyte of records on a machine with 16 gigabytes of RAM. How do you sort them?

[pause]

External merge sort. Read chunks of about 10 gigabytes, sort each in memory with the library sort, and write about 100 sorted runs. Then merge them in one pass with a min-heap holding the 100 run heads. Two passes, each reading and writing a terabyte, is 4 terabytes of I/O: a little over an hour at a gigabyte a second. The cost is I/O, not comparisons. The wrong answer is "quicksort, it is the fastest", which needs random access to the whole array.

And a second one: your comparator calls a locale-aware collation that costs 2 microseconds. What changes? Now comparisons dominate. Use the sort with the fewest, merge sort or Timsort, and better still, compute one sort key per element up front, so the expensive function runs n times instead of n log n times. In Python, a key function instead of a comparator costs n calls instead of n log n, roughly 20 times fewer at a million elements.

## Recap

Four things to remember. Insertion sort's moves equal the inversions, so it is near linear on nearly sorted data, and every real sort uses it below about 16 elements. Quicksort's quadratic worst case is a pivot problem; sorted input triggers it under a naive rule, and random pivots or introsort remove it. Heap sort loses on cache behaviour, not on big O. And recurse on the smaller side to cap the stack at log n, and treat stability as a contract.

At your desk: the insertion, Lomuto and Hoare traces, the heapify trace, the comparison and access-pattern table, and the two exercises, a stable merge sort and Lomuto partition.
