---
lesson: intervals
source: 9dbe78ad28bc7bbc
---
## 1

To keep the maximum number of non-overlapping intervals, you sort by end time and keep greedily. Why is sorting by start time wrong?

A, start order fails only when several intervals share the same start. B, an early start can be a long interval that blocks many short ones. C, it is not wrong; both orders keep the same number of intervals. D, start order is fine for the count, but cannot name which intervals to remove.

[think]

The answer is B: an early start can be a long interval that blocks many short ones.

On the intervals 1 to 100, 2 to 3, and 4 to 5, the start-order greedy keeps 1 to 100 and removes the other two, while the optimum removes only one. The exchange argument shows the earliest-ending interval belongs to some optimal solution and leaves the most room for the rest. No such argument exists for the earliest-starting one.

## 2

A job computes peak concurrent requests from an access log without sorting it, because the log is already in time order. The peaks come out too low. Why?

A, access logs interleave hosts, so timestamps are only sorted per host. B, each line is written when the request completes, so the log is ordered by end time. C, the sweep needs half-open intervals, and the log stores closed ones. D, Timsort was skipped, so the heap receives its end times in reverse order.

[think]

The answer is B: each line is written at completion, so the log is ordered by end.

Long requests appear after short ones that started later. A sweep that assumes start order closes intervals before it has seen all the starts that overlap them. Sorting by start fixes it, and because the data is nearly sorted, it cost about half as much as sorting random data. Host interleaving and boundary conventions cause other bugs, but not this systematic undercount.

## 3

In CPython, sorting a million two-element start and end lists with no key took 967 milliseconds, and with a key of itemgetter zero took 329 milliseconds. What explains the gap?

A, the keyless sort also compares the ends, which doubles the number of comparisons. B, comparing lists is generic, element by element, while integer keys use the specialised comparison. C, itemgetter caches each start, so repeated comparisons avoid list indexing. D, without a key, Timsort cannot detect runs, so it falls back to plain merges.

[think]

The answer is B: list comparison is generic, while integer keys use the specialised comparison.

Comparing two lists goes through the generic rich comparison, element by element. With an integer key, CPython's pre-sort check sees that every key is an integer and switches to a specialised integer comparison, and itemgetter extracts the keys in C. Ends are compared only when starts are equal, keys are computed once per element for any key function, and run detection works either way.

## 4

Meetings are half-open: each includes its start time but not its end time. In an event sweep that adds 1 at each start and subtracts 1 at each end, how must ties at the same time be ordered?

A, starts before ends, so the new meeting is counted straight away. B, ends first, so the room is freed before the count rises. C, no rule is needed, since half-open intervals can never tie. D, either order, since a tie can never change the maximum count.

[think]

The answer is B: ends first, so the room is freed before the count rises.

If the start is processed first, the counter briefly counts both meetings and over-reports the peak by one. Releasing first matches the convention that the room is free at the exact end time. With closed intervals that touch, the order flips.

## 5

Minimum Interval to Include Each Query has n intervals and q queries. What makes the solution that runs in n plus q, times log of n plus q, valid?

A, all the queries are known up front, so you may answer them in sorted order. B, the queries are integers, so they can be bucketed by coordinate. C, the intervals fit in a segment tree built once over all the endpoints. D, the intervals never overlap, so each query hits at most one.

[think]

The answer is A: all the queries are known up front, so you may answer them sorted.

Sweeping the queries in increasing order lets each interval be pushed once, when its start is reached, and expired once, when its end falls behind the query. Results are written back by original index. That amortisation depends on choosing the query order. If queries had to be answered as they arrived, you would need an interval tree or a segment tree instead.

## 6

Partition Labels asks you to cut a string into as many parts as possible, so that each letter appears in only one part. Which view solves it in one pass?

A, a sliding window that shrinks whenever a letter would appear twice. B, backtracking over cut positions, pruned when a letter spans a cut. C, sort the letters by frequency, and cut after each letter's final copy. D, each letter spans from its first to its last occurrence; merge the spans and cut where they end.

[think]

The answer is D: each letter spans first to last occurrence; merge the spans and cut where they end.

Every letter defines an interval, and a part is a merged block of those intervals. Scanning left to right visits the interval starts in order, so tracking the farthest last index and cutting when the scan reaches it merges without a sort. Frequency order is irrelevant, the window condition does not describe the parts, and backtracking is exponential for a linear problem.
