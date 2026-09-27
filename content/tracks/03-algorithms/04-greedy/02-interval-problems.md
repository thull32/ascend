---
slug: interval-problems
title: "Interval problems: the sort key is the algorithm"
description: Merge, insert, maximum non-overlapping, minimum arrows, meeting rooms and sweep lines, organised by the one decision that matters, which endpoint you sort by.
minutes: 45
difficulty: medium
tags: [greedy, intervals, sweep-line, heap, pattern:intervals]
problems: [merge-intervals, insert-interval, non-overlapping-intervals, meeting-rooms, meeting-rooms-ii, minimum-interval-query]
---
A calendar service stores every meeting as a pair `[start, end)`. The product team wants five things by Friday: collapse overlapping busy blocks into one, add a new meeting into a sorted calendar, tell a user how many meetings they must decline so that none overlap, find out whether a person can attend all their meetings, and report how many rooms the office needs at peak. Five features, five interval problems, and they are all the same algorithm wearing different sort orders.

Interval problems are the most common greedy family in interviews because the greedy is *almost* obvious and the proof is short. The entire difficulty is a single decision: sort by start, or sort by end? Get that right and the loop writes itself. Get it wrong and you produce an answer that looks plausible and fails on the fourth test case.

## The shape of every interval problem

An interval is `[start, end)`; half-open by convention so that `[1, 4)` and `[4, 5)` do not overlap and a meeting ending at 4 frees the room for one starting at 4. Some problems use closed intervals (`[1, 4]` and `[4, 5]` *do* touch) and the difference is exactly one `<` versus `<=` in your code. Ask which convention applies before you write the comparison; it is the first thing an interviewer checks.

Two intervals `a` and `b` overlap when `a.start < b.end and b.start < a.end`. With intervals sorted by start, this simplifies: `b` overlaps `a` (where `a` came first) precisely when `b.start < a.end`. That simplification is why sorting is step one of everything below.

| Problem | Sort by | Greedy state | Rule |
|---|---|---|---|
| Merge overlapping | start | the current merged block | extend `end` if the next starts before it |
| Insert one interval | already sorted by start | three phases: before, overlapping, after | absorb everything that overlaps |
| Max non-overlapping (min removals) | **end** | end of the last kept interval | keep it if it starts at or after that end |
| Minimum arrows / points to cover all | **end** | position of the last arrow | new arrow when an interval starts after it |
| Can attend all (Meeting Rooms I) | start | end of the previous | any `next.start < prev.end` means no |
| Min rooms (Meeting Rooms II) | start | min-heap of end times | pop if the earliest end ≤ start, then push |
| Point-in-time load / sweep | events by time | running counter | `+1` at starts, `-1` at ends |

The pattern in the table: problems that *combine* intervals sort by start, because you need to know what came before to extend it. Problems that *select* intervals sort by end, because the interval that ends earliest leaves the most room for the rest, which is the activity-selection exchange argument from [the previous lesson](/learn/algorithms/greedy/greedy-and-exchange-arguments).

## Sort by start: merging

Sort by start, walk the list keeping a `current` block. If the next interval starts before (or, for closed intervals, at) `current.end`, extend `current.end = max(current.end, next.end)`. Otherwise emit `current` and start a new one.

Trace `[[1,3],[2,6],[8,10],[15,18]]` (closed intervals, as [Merge Intervals](/practice/merge-intervals) uses):

| next | current before | overlap? | current after |
|---|---|---|---|
| `[1,3]` | (none) | | `[1,3]` |
| `[2,6]` | `[1,3]` | `2 ≤ 3` yes | `[1,6]` |
| `[8,10]` | `[1,6]` | `8 ≤ 6` no, emit `[1,6]` | `[8,10]` |
| `[15,18]` | `[8,10]` | `15 ≤ 10` no, emit `[8,10]` | `[15,18]` |

Emit the last block: `[[1,6],[8,10],[15,18]]`.

```python
def merge(intervals):
    intervals.sort(key=lambda iv: iv[0])
    out = []
    for s, e in intervals:
        if out and s <= out[-1][1]:          # closed intervals: touching counts
            out[-1][1] = max(out[-1][1], e)  # max: [1,10] then [2,3] must not shrink
        else:
            out.append([s, e])
    return out
```

The `max` is the line people forget. With `[[1,10],[2,3]]`, the second interval is entirely inside the first; `out[-1][1] = e` would shrink the block to `[1,3]`. Contained intervals are the standard trap in this problem, and a good interviewer plants one.

Complexity is $O(n \log n)$ for the sort and $O(n)$ for the walk. If the input is already sorted, the walk alone is linear and you should say so.

### Inserting into a sorted calendar

[Insert Interval](/practice/insert-interval) hands you a sorted, non-overlapping list and one new interval. Do not append and re-merge; that is $O(n \log n)$ for an $O(n)$ problem. Walk in three phases:

1. Copy every interval that ends before `new.start`; they are untouched.
2. While intervals overlap `new`, absorb them: `new = [min(starts), max(ends)]`.
3. Emit `new`, then copy the rest.

With `[[1,2],[3,5],[6,7],[8,10],[12,16]]` and `new = [4,8]`: phase 1 copies `[1,2]`; phase 2 absorbs `[3,5]` (5 ≥ 4), `[6,7]`, `[8,10]` (8 ≤ 8) giving `[3,10]`; `[12,16]` starts after 10, so phase 3 copies it. Result `[[1,2],[3,10],[12,16]]`.

## Sort by end: selecting

[Non-overlapping Intervals](/practice/non-overlapping-intervals) asks for the minimum removals so that nothing overlaps. That is `n` minus the maximum number of mutually non-overlapping intervals, which is activity selection: sort by end, keep an interval if it starts at or after the end of the last one kept.

Trace `[[1,2],[2,3],[3,4],[1,3]]` with half-open semantics (touching is fine). Sorted by end: `[1,2],[2,3],[1,3],[3,4]`.

| interval | last kept end | keep? |
|---|---|---|
| `[1,2]` | −∞ | yes, end = 2 |
| `[2,3]` | 2 | `2 ≥ 2` yes, end = 3 |
| `[1,3]` | 3 | `1 < 3` no, remove |
| `[3,4]` | 3 | `3 ≥ 3` yes, end = 4 |

Three kept, one removed. Why end and not start? Sorting by start and keeping greedily fails on `[[1,100],[2,3],[4,5]]`: you keep `[1,100]` and remove two, when removing `[1,100]` alone is optimal. Sorting by end keeps `[2,3]` first, then `[4,5]`, and removes only the long one. The exchange argument is the activity-selection one: the earliest-ending interval can replace the first interval of any optimal solution.

Minimum arrows to burst balloons is the same sort with a different loop. Balloons are intervals on a line; an arrow at `x` pops every balloon whose interval contains `x`. Sort by end; shoot at the end of the first balloon; skip every balloon that starts at or before that point; shoot again at the end of the next survivor. For `[[10,16],[2,8],[1,6],[7,12]]` sorted by end: `[1,6],[2,8],[7,12],[10,16]`. Arrow at 6 pops `[1,6]` and `[2,8]` (2 ≤ 6). `[7,12]` starts after 6, so arrow at 12, which also pops `[10,16]`. Two arrows. The greedy choice is "place the arrow as far right as possible without missing the current balloon", and any optimal solution can be shifted to agree with it.

## Meeting rooms: from feasibility to capacity

[Meeting Rooms](/practice/meeting-rooms) is "can one person attend all of these?", which is "does anything overlap?". Sort by start; if any `intervals[i].start < intervals[i-1].end`, the answer is no. One sort, one pass.

[Meeting Rooms II](/practice/meeting-rooms-ii) asks for the *minimum number of rooms*, which is the maximum number of meetings in progress at any instant. Two standard solutions, and you should know both.

### The min-heap of end times

Sort by start. Keep a min-heap of the end times of meetings currently occupying a room. For each meeting, if the earliest-ending occupied room is free by now (`heap[0] <= start`), pop it: that room is reused. Then push this meeting's end. The heap's peak size is the answer.

Trace `[[1,4],[2,5],[3,6],[4,7],[5,8]]`:

| meeting | heap before | earliest end ≤ start? | heap after | size |
|---|---|---|---|---|
| `[1,4]` | `[]` | | `[4]` | 1 |
| `[2,5]` | `[4]` | `4 ≤ 2` no | `[4,5]` | 2 |
| `[3,6]` | `[4,5]` | `4 ≤ 3` no | `[4,5,6]` | **3** |
| `[4,7]` | `[4,5,6]` | `4 ≤ 4` yes, pop 4 | `[5,6,7]` | 3 |
| `[5,8]` | `[5,6,7]` | `5 ≤ 5` yes, pop 5 | `[6,7,8]` | 3 |

Three rooms. Watch the heap do it:

```viz
{"type": "heap", "algorithm": "push-pop", "kind": "min",
 "operations": [["push",4],["push",5],["push",6],["pop"],["push",7],["pop"],["push",8]],
 "title": "Meeting Rooms II: a min-heap of end times",
 "caption": "Each push is a meeting starting; each pop is the earliest-ending room being reused. The heap's largest size (3) is the number of rooms."}
```

Why only pop *one* room per meeting? Because you only need one room for this meeting; other free rooms stay in the heap harmlessly, and they will be popped when a later meeting needs them. Popping all rooms with `end <= start` also works and is sometimes clearer, but it does not change the peak.

```python
import heapq

def min_rooms(intervals):
    ends = []
    for s, e in sorted(intervals):
        if ends and ends[0] <= s:      # half-open: a room freed at s is usable at s
            heapq.heapreplace(ends, e) # pop the earliest end, push ours
        else:
            heapq.heappush(ends, e)
    return len(ends)
```

`len(ends)` at the finish equals the peak because the heap never shrinks: every meeting either replaces or adds. Complexity $O(n \log n)$. See [priority queues in practice](/learn/data-structures/heaps/priority-queues-in-practice) for what the heap costs in each language.

### The sweep line

The other solution treats each interval as two *events*: `+1` at `start`, `−1` at `end`. Sort the events by time and keep a running count; the maximum count is the answer. With half-open intervals, ties are broken so that `−1` comes before `+1` at the same time (a room freed at 4 is available for a meeting starting at 4). Flip that tie-break for closed intervals.

For the same five meetings the events are `(1,+1),(2,+1),(3,+1),(4,−1),(4,+1),(5,−1),(5,+1),(6,−1),(7,−1),(8,−1)`; the running count goes `1,2,3,2,3,2,3,2,1,0`, peaking at 3.

If times are small integers you can skip the sort entirely with a difference array: `diff[start] += 1`, `diff[end] -= 1`, then a prefix sum. The prefix-sum viz shows the count materialising from the difference array for these five meetings (index = time 0..8):

```viz
{"type": "array", "algorithm": "prefix-sum", "values": [0, 1, 1, 1, 0, 0, -1, -1, -1],
 "title": "Sweep line as a difference array",
 "caption": "diff[t] is (+1 per meeting starting at t) + (-1 per meeting ending at t). The running prefix sum 0,1,2,3,3,3,2,1,0 is the number of rooms in use; its peak, 3, is the answer."}
```

Which to use? The heap generalises: if meetings need *specific* rooms or you must report which room each meeting gets, the heap holds (end, room-id) pairs and answers that directly. The sweep line generalises the other way: it answers "how many at time t?" for *every* t in one pass, which is what you want for a load graph, and it is what production calendar and capacity systems actually run. Say both in an interview; implement whichever the follow-up favours.

## Minimum interval query: sort the queries too

[Minimum Interval to Include Each Query](/practice/minimum-interval-query) is the hard end of this family and combines everything above. For each query point `q`, return the size of the smallest interval containing `q`. The offline trick: sort intervals by start, sort the queries, and sweep the queries in increasing order. Maintain a min-heap keyed by interval *size* holding `(size, end)`. For each query, push every interval whose start ≤ `q` (they become candidates), then pop from the heap while the top's `end < q` (it has expired and can never contain a later query either, since queries only increase). The heap top, if any, is the answer for `q`. Each interval is pushed and popped at most once: $O((n + m) \log n)$.

The lesson is that "sort by start" and "sort by end" are not the only options: sometimes you sort the *queries* and process everything as one sweep. Whenever a problem hands you many point queries over intervals, sorting the queries is the first thing to try.

## The off-by-one that fails hidden tests

Every interval problem has one comparison where `<` versus `<=` decides the answer for touching intervals. Fix the convention before coding and write it as a comment:

- Merge (closed intervals, LeetCode-style): `[1,4]` and `[4,5]` merge; condition `s <= current_end`.
- Non-overlapping, meeting rooms (half-open): `[1,4)` and `[4,5)` do not conflict; keep-condition `s >= last_end`, heap-pop condition `heap[0] <= s`.
- Sweep line: process ends before starts at equal times for half-open, starts before ends for closed.

If the statement is silent, state your assumption out loud and pick half-open; then ask. That is a better signal than silently guessing either way.

## Exercises

```exercise
id: merge-intervals
title: Merge overlapping intervals
prompt: |
  Given a list of closed intervals `[start, end]` in any order, merge every
  overlapping or touching pair and return the merged list sorted by start.
  `[1,4]` and `[4,5]` touch and merge into `[1,5]`. An interval fully
  inside another must not shrink the result. The empty list returns `[]`.
languages: [python, javascript]
entry: merge_intervals
starter:
  python: |
    def merge_intervals(intervals):
        # sort by start, then extend or emit
        return []
  javascript: |
    function merge_intervals(intervals) {
      // sort by start, then extend or emit
      return [];
    }
tests:
  - args: [[[1, 3], [2, 6], [8, 10], [15, 18]]]
    expected: [[1, 6], [8, 10], [15, 18]]
  - args: [[[1, 4], [4, 5]]]
    expected: [[1, 5]]
    label: touching endpoints merge
  - args: [[]]
    expected: []
    label: empty input
  - args: [[[5, 7], [1, 3]]]
    expected: [[1, 3], [5, 7]]
    label: unsorted input
  - args: [[[1, 4], [2, 3]]]
    expected: [[1, 4]]
    hidden: true
    label: contained interval must not shrink the block
  - args: [[[2, 3], [4, 5], [6, 7], [8, 9], [1, 10]]]
    expected: [[1, 10]]
    hidden: true
hints:
  - "Sort by start. If the next start is <= the current block's end, set the block's end to max(block end, next end); otherwise push a new block."
  - "Copy the intervals (or their pairs) before mutating so you do not alias the input."
```

```exercise
id: min-meeting-rooms
title: Minimum meeting rooms
prompt: |
  Given meetings as half-open intervals `[start, end)`, return the minimum
  number of rooms needed so that no two meetings share a room while in
  progress. A meeting ending at time `t` frees its room for a meeting
  starting at `t`. No meetings means 0 rooms.

  Either a min-heap of end times or a sweep over +1/-1 events is fine.
  In JavaScript there is no built-in heap; the sweep line only needs a sort.
languages: [python, javascript]
entry: min_meeting_rooms
starter:
  python: |
    import heapq

    def min_meeting_rooms(intervals):
        # sort by start; reuse a room when its end <= this start
        return 0
  javascript: |
    function min_meeting_rooms(intervals) {
      // sweep line: sort starts and ends separately, or build (time, delta) events
      return 0;
    }
tests:
  - args: [[[0, 30], [5, 10], [15, 20]]]
    expected: 2
  - args: [[[7, 10], [2, 4]]]
    expected: 1
  - args: [[[1, 4], [4, 5]]]
    expected: 1
    label: touching meetings share a room
  - args: [[]]
    expected: 0
    label: no meetings
  - args: [[[1, 5], [1, 5], [1, 5]]]
    expected: 3
    label: identical meetings
  - args: [[[1, 4], [2, 5], [3, 6], [4, 7], [5, 8]]]
    expected: 3
    hidden: true
  - args: [[[1, 10], [2, 3], [4, 5], [6, 7]]]
    expected: 2
    hidden: true
hints:
  - "Sweep: sort all starts and all ends as two arrays; walk the starts, advancing an end pointer while ends[e] <= start; rooms = max over (s - e + 1)."
  - "Heap: for each meeting in start order, if heap[0] <= start pop it, then push end. The heap's final size is the answer."
```

## Senior signals

- You say **which endpoint you sort by and why** before writing the loop: start for combining, end for selecting.
- You state the **interval convention** (closed or half-open) and put the `<`/`<=` decision in a comment, because touching endpoints are where hidden tests live.
- You can give the **exchange argument** for sort-by-end selection in two sentences and the counterexample for sort-by-start (`[1,100],[2,3],[4,5]`).
- You know **two solutions to Meeting Rooms II**, the heap and the sweep line, and which one generalises to room assignment versus load-over-time.
- You reach for **difference arrays** when times are small integers and for **sorting the queries** when the problem is offline.
- You notice that every problem in this lesson is $O(n \log n)$ because of the sort, and you say when an already-sorted input makes it $O(n)$.

## Check yourself

```quiz
- q: >-
    You want the maximum number of non-overlapping intervals. Which sort key is correct, and what does the alternative get wrong?
  options: ["Sort by end; by start, one long early interval blocks short ones", "Sort by length; sorting by end can drop a short interval", "Sort by start; sorting by end skips intervals that begin early", "Either key works; only the tie-break on touching ends matters"]
  answer: 0
  explanation: >-
    The earliest-ending interval leaves the most room, which is the activity-selection exchange argument. Sorting by start keeps [1,100] in [[1,100],[2,3],[4,5]] and loses two intervals. Sorting by length fails too: a short interval in the middle can block two others.
- q: >-
    You merge the closed intervals [[1,10],[2,3],[4,5]] but write `current.end = next.end` instead of `max(current.end, next.end)`. What does the function return?
  options: ["[[1,5]]", "[[1,10]]", "[[1,10],[2,3],[4,5]]", "[[1,3],[4,5]]"]
  answer: 3
  explanation: >-
    [2,3] is inside [1,10]; without the max, the block shrinks to [1,3]. Then [4,5] starts after 3, so it is emitted separately. The correct answer is [[1,10]]; the shrink bug loses the interval 3..10 entirely, which is why contained intervals are the standard hidden test.
- q: >-
    In Meeting Rooms II with a min-heap of end times, why is it sufficient to pop at most one room per incoming meeting?
  options: ["One room per meeting; spare free rooms don't raise the peak", "It isn't; every room with end ≤ start must be popped first", "Popping more than one room would double-count the freed rooms", "The heap can only ever hold one free room at a time"]
  answer: 0
  explanation: >-
    Each meeting consumes one room; leaving other free rooms in the heap does not increase its size beyond what the meetings actually require, since the size only grows when no room is free. Extra free rooms stay in the heap and are popped by later meetings. Popping all free rooms is also correct, but not required: the peak size comes out the same.
- q: >-
    A sweep line over half-open intervals has a start event and an end event at the same time t. In which order must they be processed?
  options: ["Start first, so the peak count includes both meetings", "Either order, since the maximum is the same after both events", "Start first, unless the intervals are closed, then end first", "End first, so the room freed at t can host the new meeting"]
  answer: 3
  explanation: >-
    For [start, end), a meeting ending at t and one starting at t do not overlap, so the count must go down before it goes up. Processing the start first would report a phantom overlap and over-count rooms. Closed intervals require the opposite tie-break.
- q: >-
    You must answer 100,000 queries of the form "smallest interval containing point q" over 100,000 intervals. What is the key idea?
  options: ["Map each integer point to its smallest interval in a hash map", "Sort intervals by end and scan until one contains each query", "Sort intervals by start and binary search each query", "Sort the queries and sweep with a min-heap keyed by size"]
  answer: 3
  explanation: >-
    Sorting queries makes the problem offline: sweep queries in increasing order with a min-heap of (size, end); every interval enters the candidate heap once (when its start is passed) and leaves once (when its end is passed), giving O((n + m) log n). Binary search alone cannot handle nested intervals; per-query scans are quadratic, and a point-to-interval map is unbounded when coordinates are large.
```
