---
lesson: intervals
source: d13e21c93434d6d8
fit: partial
desk:
  - "The merge and min-rooms templates, in Python and JavaScript"
  - "The traces: Merge Intervals, Insert Interval, Non-overlapping Intervals, Meeting Rooms II, Minimum Interval Query, Partition Labels"
  - "The weighted-interval DP and its trace"
  - "The signal, hidden-interval and near-miss tables, and the three-decisions table"
  - "The measured sort and room-counting tables"
  - "Exercises: total covered length, and overlap counts for every interval"
---
## Introduction

You are given ranges on a line. Meetings with a start and an end. Reservations. The spans of requests in a trace. Memory allocations. And the question is always about how they interact: merge the ones that touch, count how many are live at once, find the fewest to remove so none collide.

Written naively, every one of those is a pairwise comparison, and that is quadratic. For a day of one million requests, it is about five hundred billion comparisons. Sorted and swept, the same question took under half a second, in plain CPython.

The interval family is the most regular of the sorting patterns. Every problem sorts by one endpoint and sweeps left to right, and the whole design comes down to three decisions: which endpoint you sort by, what state the sweep carries, and whether two intervals that merely touch count as overlapping. Get those right and the sweep is five lines. Get one wrong and the greedy quietly returns wrong answers on inputs your tests never tried.

## Recognising it

The signal is two numbers per item that are a start and an end. The statement says intervals, meetings, bookings, events with start and end times, ranges or segments. Then the question names the variant.

If it asks for the union of overlapping ranges, that is merge: sort by start. If it asks whether one person can attend every meeting, sort by start and compare each start with the previous end. If it asks for the fewest removals so nothing overlaps, or the most intervals that can coexist, you sort by end. That one is the trap, and we will come back to it. If it asks for the peak number of meetings at once, or the minimum number of rooms, sort by start and keep a min-heap of end times. And if the list is already sorted and disjoint and you are adding one range, do not sort at all: one walk in three phases, before, overlapping and after, is linear.

The harder skill is spotting intervals the statement hides. "Split a string into as many parts as possible so each letter appears in only one part." Each letter spans from its first occurrence to its last. Those are intervals, and the parts are the merged blocks. "Fewest jumps to reach the end of the array": each index covers a stretch ahead of it, and you are covering a line with the fewest intervals. "Minimum arrows to burst all the balloons": sort by end and shoot at each kept end.

Know the near misses too. If each interval has a value and you want the most total value, the greedy is wrong and you need dynamic programming. If bookings arrive one at a time and each must be accepted or rejected now, there is no batch to sort. And if the coordinates are small integers, say minutes in a day, a difference array does it without any sort.

## Three decisions, and the merge

Before typing anything, ask one question out loud: do the interval from 1 to 3 and the interval from 3 to 5 overlap?

[pause]

There is no universal answer, and that is the point. For merging, the lesson treats intervals as closed, so those two touch and merge into 1 to 5. For meetings, intervals are half-open: a meeting that ends at 3 frees the room at 3, so a meeting starting at 3 does not collide. Most interval bugs live right here, a less-than in one place and a less-than-or-equal in another. Decide the convention once, then make the sort key, the overlap test and any tie rule agree with it.

Merge is the base shape. Sort by start. Each new interval either extends the last merged interval, or it starts a new one. Say it with three intervals: 1 to 3, 2 to 6, and 8 to 10. The first goes in. The second starts at 2, which is inside 1 to 3, so the last merged interval stretches to 1 to 6. The third starts at 8, past 6, so it starts a new one. The answer is 1 to 6, and 8 to 10.

Here is the invariant that makes one comparison per interval enough. The merged list is always sorted, disjoint, and covers exactly the union of everything seen so far. And because the input is sorted by start, a new interval can only overlap the last merged one. Anything earlier ended before the last one began, which is no later than the new start. That is why the whole family is linear after the sort.

One trap in that extension step. When you stretch the last interval, take the maximum of the two ends, never just the new end. Merge 1 to 10 with 2 to 3 by assigning the new end, and the result shrinks to 1 to 3. A test with one interval contained inside another catches it.

## Sort by end to keep the most

Now the problem everyone gets wrong the first time: the fewest removals so the rest do not overlap. Equivalently, keep as many as you can.

The rule: sort by end, and keep every interval that starts at or after the last kept end. The reason is an exchange argument. Keeping the interval that ends earliest leaves the most room for everything after it. Swap it into any optimal solution and that solution stays valid and the same size.

Before I give you the counterexample: why is sorting by start wrong?

[pause]

Because an early start can be a long interval that blocks many short ones. Take three intervals: 1 to 100, 2 to 3, and 4 to 5. Sorted by start, the greedy keeps 1 to 100 first and has to remove the other two. Sorted by end, it keeps 2 to 3 and 4 to 5 and removes only the long one. One removal, not two.

A detail in that loop: when you remove an interval, the last kept end does not change. The removed interval sorted later, so it ends no earlier than the one you kept.

## Counting rooms, and answering queries

The second shape counts concurrency. The minimum number of meeting rooms equals the maximum number of meetings running at once, and that number can only change when a meeting starts.

So sort by start, and keep a min-heap of the end times of meetings in progress. Before seating each meeting, pop every meeting that has already ended. With half-open intervals, that means ended at or before this start. Then push the new end. The heap's size is the number of rooms in use, and the largest size you ever see is the answer.

There is a second encoding that needs no heap. Sort all the starts and, separately, all the ends. You only need to know that some meeting ended, not which one, so the two lists do not have to stay paired. Walk the starts. If a start is at or after the earliest unused end, a room is freed and reused; otherwise you open a new one.

If you instead build plus-one and minus-one events and sort them, the tie rule matters. With half-open meetings, process an end before a start at the same time. Otherwise the counter briefly counts both, and over-reports the peak by one.

The same machinery stretches to queries. "For each query point, the length of the shortest interval that contains it." Asking every interval for every query is the product of the two counts. But all the queries are known up front, so you are allowed to answer them in sorted order. Sweep the queries from small to large. Push each interval onto a heap keyed by length once its start is reached. Pop from the top while the top interval ended before the query. Then read the top. Each interval is pushed once and expired once, and the lazy expiry is safe because queries only increase. Write each answer back by its original position.

## When the shape changes

The follow-up that breaks the greedy is a value on each interval: "maximise the total value of the meetings you attend." Sorting by end and keeping greedily maximises the count, and one valuable meeting can be worth more than three cheap ones. The fix keeps the sort by end and replaces the greedy with dynamic programming. For each interval, either skip it, or take it together with the best answer among the intervals that ended before it started. Those form a prefix of the sorted list, so a binary search finds it, and the whole thing stays n log n. The signal is the word value or weight next to an interval.

Online bookings are a different shape again. Keep the accepted intervals sorted and disjoint, binary search for the neighbours of the new booking, and check just those two. In production, a database exclusion constraint does this transactionally.

Two numbers from the lesson's measurements are worth keeping. First, a request log is written when each request finishes, so it is sorted by end, not by start. A job that skips the sort because "the log is already sorted" closes long requests before it has seen their starts, and its concurrency peaks come out too low, exactly during incidents. Sorting that nearly sorted log by start cost about half as much as sorting random data, because Timsort finds the long ascending runs. So never skip it.

Second, the encoding depends on the runtime. In CPython, sorting a million pairs with no key, comparing the inner lists, was about three times slower than sorting with an integer key from itemgetter. And for counting rooms, the small heap won in CPython, because heapq runs in C and the peak was only about 250 meetings. In Node, two sorted typed arrays won instead. Same algorithm; the runtime decides which encoding is cheap.

## In the interview

Here is a follow-up the lesson expects. Now bookings arrive one at a time, and each must be accepted or rejected immediately. What do you do?

[pause]

Keep the accepted intervals sorted and disjoint. Binary search for the first interval whose start is at least the new start, and check it and its predecessor for overlap, which is logarithmic. Inserting into a Python list is linear because of the shift, so a balanced tree or a sorted container gives logarithmic inserts, and in production you would reach for a database exclusion constraint. The wrong answer is re-sorting and re-merging on every request.

And one more: the coordinates now go up to a billion. A difference array is out, because a billion slots is gigabytes. Sort the endpoints instead, or compress the coordinates to their ranks and use the difference array on those.

## Recap

Four things to remember. Ask whether touching intervals overlap before you write a single comparison, and make every test agree with that answer. Sort by start to merge and to count rooms; sort by end to keep the most, and have the three-interval counterexample ready. Merging needs one comparison per interval, because a new interval can only overlap the last merged one, and the extension takes the maximum end. And when intervals carry a value, the greedy stops and dynamic programming with a binary search takes over.

At your desk: the merge and rooms templates, the six traces, the weighted-interval trace, the measurement tables, and the two exercises on covered length and overlap counts.
