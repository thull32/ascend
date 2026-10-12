---
lesson: interval-problems
source: 50acf37a87976210
---
## 1

You want the maximum number of non-overlapping intervals. Which sort key is correct, and what does the alternative get wrong?

A, sort by end; sorting by start lets one long early interval block short ones. B, sort by length; sorting by end can drop a short interval. C, sort by start; sorting by end skips intervals that begin early. D, either key works; only the tie-break on touching ends matters.

[think]

The answer is A: sort by end; by start, one long early interval blocks short ones.

The interval that ends earliest leaves the most room, which is the activity-selection exchange argument. Sorting by start, on the intervals 1 to 100, 2 to 3 and 4 to 5, keeps 1 to 100 and loses two intervals. Sorting by length fails too: a short interval in the middle can block two others.

## 2

You merge the closed intervals 1 to 10, 2 to 3, and 4 to 5, but on overlap you set the current end to the next interval's end, instead of the larger of the two ends. What does the function return?

A, one interval, 1 to 5. B, one interval, 1 to 10. C, all three intervals, unchanged. D, two intervals, 1 to 3, and 4 to 5.

[think]

The answer is D: two intervals, 1 to 3, and 4 to 5.

2 to 3 lies inside 1 to 10, and without the maximum, the block shrinks to 1 to 3. Then 4 to 5 starts after 3, so it is emitted separately. The correct answer is the single interval 1 to 10. The shrink bug loses the stretch from 3 to 10 entirely, which is why contained intervals are the standard hidden test.

## 3

In Meeting Rooms Two, with a min-heap of end times, why is it enough to pop at most one room for each incoming meeting?

A, each meeting takes one room, and spare free rooms do not raise the peak. B, it is not; every room that ends by the start time must be popped first. C, popping more than one room would double-count the freed rooms. D, the heap can only ever hold one free room at a time.

[think]

The answer is A: each meeting takes one room, and spare free rooms do not raise the peak.

The heap's size only grows when no room is free, so leaving other free rooms in it does not push its size beyond what the meetings need. Extra free rooms stay in the heap and are popped by later meetings. Popping all the free rooms is also correct, but not required: the peak comes out the same.

## 4

A sweep line over half-open intervals has a start event and an end event at the same time t. In which order must they be processed?

A, start first, so the peak count includes both meetings. B, either order, since the maximum is the same after both events. C, start first, unless the intervals are closed, then end first. D, end first, so the room freed at t can host the new meeting.

[think]

The answer is D: end first, so the room freed at t can host the new meeting.

With half-open intervals, a meeting ending at t and one starting at t do not overlap, so the count must go down before it goes up. Processing the start first reports a phantom overlap and over-counts rooms. Closed intervals need the opposite tie-break.

## 5

You must answer 100 thousand queries of the form "the smallest interval containing point q", over 100 thousand intervals. What is the key idea?

A, map each integer point to its smallest interval in a hash map. B, sort the intervals by end, and scan until one contains each query. C, sort the intervals by start, and binary search each query. D, sort the queries, and sweep with a min-heap keyed by size.

[think]

The answer is D: sort the queries, and sweep with a min-heap keyed by size.

Sorting the queries makes the problem offline. Sweep the queries in increasing order with a min-heap of size and end: every interval enters the heap once, when its start is passed, and leaves once, when its end is passed, giving n plus m, times log n. Binary search alone cannot handle nested intervals, per-query scans are quadratic, and a point map is unbounded when coordinates are large.

## 6

A job that computes concurrent sessions at peak ran fine on per-minute data, and now runs out of memory on millisecond timestamps over a day. What happened, and what is the fix?

A, it used a heap of end times; switch to a difference array. B, it sorted by end time; sorting by start would halve the memory. C, it kept every session in memory; sample 10 percent and scale the peak. D, it used a difference array over time; sort the 2n events instead.

[think]

The answer is D: it used a difference array over time; sort the 2n events instead.

A difference array is indexed by time, so a day of milliseconds is about 86 million slots, however few sessions there are: roughly 0.7 gigabytes of pointers in a Python list. Sorting the start and end events costs memory in proportion to the sessions, not the clock, and gives the same exact peak. Sampling turns a capacity number you must provision into an estimate.
