---
slug: meeting-rooms-ii
title: Meeting Rooms II
difficulty: medium
patterns: [intervals]
lists: [core-75, ascend-150]
companies: [meta, google, amazon, microsoft, uber]
order: 5
lesson: interview-patterns/array-patterns/intervals
hints:
  - The number of rooms you need is the maximum number of meetings happening at the same moment. So the question is really "what is the peak concurrency?"
  - Separate the starts from the ends and sort each. Walk through the starts in order; before allocating a room for a start, release every room whose meeting has already ended.
  - Two sorted pointers do it in O(n log n). A min-heap of end times is the other standard solution and generalises to "which room" rather than "how many".
signatures:
  python:
    name: min_meeting_rooms
    starter: |
      def min_meeting_rooms(intervals: list[list[int]]) -> int:
          pass
  javascript:
    name: min_meeting_rooms
    starter: |
      function min_meeting_rooms(intervals) {
      }
tests:
  - args: [[[0, 30], [5, 10], [15, 20]]]
    expected: 2
  - args: [[[7, 10], [2, 4]]]
    expected: 1
    label: no overlap, one room
  - args: [[]]
    expected: 0
    label: no meetings
  - args: [[[1, 5]]]
    expected: 1
    label: single meeting
  - args: [[[1, 5], [5, 10]]]
    expected: 1
    label: back to back reuses the room
  - args: [[[1, 10], [2, 7], [3, 19], [8, 12], [10, 20], [11, 30]]]
    expected: 4
    hidden: true
    label: peak of four at time 11
  - args: [[[1, 4], [2, 5], [3, 6]]]
    expected: 3
    hidden: true
    label: everything overlaps
  - args: [[[1, 2], [2, 3], [3, 4]]]
    expected: 1
    hidden: true
    label: chain of back-to-back meetings
  - args: [[[4, 9], [1, 3], [5, 7], [8, 10]]]
    expected: 2
    label: unsorted, peak of two
time_limit_ms: 4000
---
You are given a list of meetings as half-open intervals `[start, end)`. Return the minimum number of conference rooms needed so that every meeting has a room and no two meetings share a room while they overlap. A meeting may start in a room at the exact moment the previous one ends.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[0, 30], [5, 10], [15, 20]]` | `2` | `[0, 30]` occupies one room the whole time; the other two take turns in a second |
| `[[1, 5], [5, 10]]` | `1` | Back to back |
| `[[1, 4], [2, 5], [3, 6]]` | `3` | At time 3 all three are running |

### Constraints

- `0 ≤ len(intervals) ≤ 10⁴`
- `0 ≤ start < end ≤ 10⁶`

### Follow-up

The interviewer asks: "Now assign each meeting a room number, using the fewest rooms." Then: "Meetings are booked and cancelled continuously and you need the current room count after each change. What is the cost per operation?"

## Solution

### The naive approach

For every meeting, count how many others overlap it, and take the max: `O(n²)`. It is also *wrong*: three meetings that pairwise overlap but never all at once (`[1, 3], [2, 5], [4, 6]`) each overlap two others, but you only need two rooms. The count you want is the maximum number *simultaneously* in progress, not the maximum degree in the overlap graph.

### The insight

The number of rooms equals the peak number of concurrent meetings. Concurrency changes only at start and end events, so sort all the events and sweep. A start increments the count, an end decrements it, and with ties an end must be processed before a start (so a meeting that begins the instant another finishes can reuse its room). The peak count during the sweep is the answer.

The two-pointer form avoids building an event list: sort starts and ends separately, walk the starts, and for each one, first advance the end pointer past every meeting that has finished. The number of started meetings minus the number of finished ones is the current concurrency.

### The optimal approach

```python
def min_meeting_rooms(intervals: list[list[int]]) -> int:
    starts = sorted(iv[0] for iv in intervals)
    ends = sorted(iv[1] for iv in intervals)
    rooms = 0
    e = 0
    for s in starts:
        if s >= ends[e]:
            e += 1          # a meeting ended before (or as) this one starts: reuse
        else:
            rooms += 1      # still all busy: open a new room
    return rooms
```

Time `O(n log n)` for two sorts; the sweep is `O(n)`. Space `O(n)` for the sorted copies.

Why is one `e += 1` per start enough, rather than a `while`? Think of each start as being *paired* with the earliest end that has not yet been paired, if that end is `≤ s`. A start needs exactly one free room, so pairing it with one finished meeting is all it takes; any other finished meetings stay unpaired and are available to later starts. `rooms` counts the starts that could not be paired, and after processing the starts up to `s` it equals the largest value of (starts so far − ends paired so far), which is the peak concurrency. It never decreases, so the final value is the peak over the whole day.

Trace `[[1, 10], [2, 7], [3, 19], [8, 12], [10, 20], [11, 30]]`: `starts = [1, 2, 3, 8, 10, 11]`, `ends = [7, 10, 12, 19, 20, 30]`.

| s | ends[e] | action | rooms |
|---|---|---|---|
| 1 | 7 | 1 < 7, new room | 1 |
| 2 | 7 | new | 2 |
| 3 | 7 | new | 3 |
| 8 | 7 | 8 ≥ 7, reuse, e → 1 | 3 |
| 10 | 10 | 10 ≥ 10, reuse, e → 2 | 3 |
| 11 | 12 | 11 < 12, new room | 4 |

Answer 4.

The min-heap version keeps the end times of meetings currently occupying rooms. For each meeting in start order, pop the heap while its top is `≤ start` (those rooms are free), push the new end, and track the heap's peak size. Same complexity; more memory traffic; but it naturally tells you *which* room (the popped one) each meeting reuses.

### Common mistakes

- Using `>` instead of `>=` for the reuse test, so a meeting cannot start the moment another ends, and the chain `[[1, 2], [2, 3], [3, 4]]` needs 3 rooms instead of 1.
- Sorting the intervals by start and then reading ends in that order; the ends must be sorted independently.
- Returning the final `rooms - e` or some other "current" count instead of the peak. With the formulation above `rooms` *is* the peak, but in the heap version you must track `max(len(heap))`, not the final size.

### How to discuss it

Say "rooms needed equals peak concurrency; sort starts and ends, sweep, ends win ties" and state the tie rule out loud because it is where the half-open convention lives. For room assignment, use the heap and store `(end, room_id)`; a popped room is reused, otherwise assign `room_id = len(rooms_so_far)`; this is the greedy that provably uses the minimum, the same greedy behind interval graph colouring. For the dynamic version, keep a `start → +1, end → -1` map in an ordered structure and maintain prefix sums; naive recomputation is `O(n)` per change, and a segment tree or Fenwick tree over compressed times gets each update and the max query to `O(log n)`, which is what My Calendar III asks for. Contrast with [Meeting Rooms](/practice/meeting-rooms), where the question is only whether the peak exceeds one.
