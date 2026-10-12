---
lesson: selection-and-order-statistics
source: f634a39993e9f100
---
## 1

Quickselect with random pivots is expected linear time, while quicksort is expected n log n. What accounts for the difference?

A, its random pivot guarantees an even split every time. B, its partition does fewer comparisons per element scanned. C, quicksort must also keep equal keys in their input order. D, recursing on only one side makes the work a geometric series.

[think]

The answer is D: one-sided recursion makes the work a geometric series.

Both use the same partition. Sorting must process every element at every level, n per level for log n levels. Selection discards the side that cannot hold index k, so the surviving sizes shrink geometrically: n, plus three quarters of n, and so on. A random pivot guarantees nothing about any single split; it only makes good splits likely, which is why the bound is expected.

## 2

Median of medians uses groups of 5. Why not groups of 3?

A, the fractions one third and two thirds sum to one, so it becomes n log n. B, the pivot is no longer guaranteed to avoid the outer 30 percent. C, sorting groups of 3 costs more comparisons per element. D, the recursion on the n over 3 medians makes it quadratic in the worst case.

[think]

The answer is A: one third plus two thirds is one, so it becomes n log n.

The linear bound needs the two recursive fractions to sum to less than one. With groups of 5 they are one fifth plus seven tenths, which is nine tenths. With groups of 3 they sum to one, and the recurrence solves to n log n, not n squared. The pivot is still central, with at least a third on each side; the problem is that the recursive call on the medians is too large.

## 3

You need the 20 largest scores from a stream of 500 million events that does not fit in memory. What is the right approach?

A, median of medians: linear worst case, no bad pivots. B, a max-heap of all events: a linear build, then pop 20. C, quickselect for rank 20: linear expected time, constant extra space. D, a min-heap of size 20: n log 20 time, and space for 20.

[think]

The answer is D: a min-heap of size 20.

Quickselect, median of medians and a heap of all the events each need the whole data set in memory, which is exactly what you do not have. A bounded min-heap does one pass with constant memory, and rejects most elements with a single comparison against its root.

## 4

A colleague uses quickselect, with the first element as pivot, on data received from external clients. What is the risk?

A, crafted input can make it return the wrong element. B, duplicate values in the input can make it never finish. C, its expected linear time becomes n log n on any input. D, crafted input can force quadratic time and exhaust the CPU.

[think]

The answer is D: crafted input can force quadratic time and exhaust the CPU.

A deterministic pivot has inputs that force the worst case, where every partition removes one element, and an adversary who controls the data can supply one. That is a CPU-exhaustion attack. Correctness is not affected, and it always terminates. Random pivots, or introselect, remove the attack.

## 5

Which statement about C plus plus nth element, or NumPy's partition, is accurate?

A, it sorts the prefix up to k and leaves the rest alone. B, it moves the k largest elements to the front, sorted. C, it is n log n, since it is built on a heap sort. D, it places the k-th element, and leaves both sides unsorted.

[think]

The answer is D: it places the k-th element, and leaves both sides unsorted.

It is a partition-based selection, introselect in libstdc++, and linear on average. The k-th element lands in its sorted position, with smaller elements before it and larger after, but the two sides are otherwise unordered, and that is what makes it linear. Sorting any part of it, the prefix or the top k, would cost more.

## 6

Selecting the median of one million identical values, with the two-way Lomuto partition on strict less-than and random pivots, takes minutes. Why?

A, every partition strips one element, so the work is quadratic. B, random pivots repeat, so the same partition is redone many times. C, equal keys break the invariant, and the loop restarts from lo. D, the comparisons are all ties, which the CPU cannot branch-predict.

[think]

The answer is A: every partition strips one element, so the work is quadratic.

No element is strictly less than the pivot, so the pivot lands at the start and the range shrinks by exactly one each time: about three eighths of n squared comparisons, some 400 billion for a million elements, whatever pivot is chosen. A three-way partition puts the whole equal band in place in one pass and stops. The invariant is intact, and branch prediction is not the issue.
