---
slug: meeting-rooms
title: Meeting Rooms
difficulty: easy
patterns: [intervals]
lists: [core-75, ascend-150]
companies: [meta, google, amazon, microsoft]
order: 4
lesson: interview-patterns/array-patterns/intervals
hints:
  - One person can attend everything iff no two meetings overlap. Checking every pair is O(n²); sorting makes the only possible conflicts adjacent.
  - Sort by start time. If any meeting starts before the previous one ends, there is a conflict.
  - A meeting that starts exactly when the previous one ends is fine, so the conflict test is a strict `<`.
signatures:
  python:
    name: can_attend_meetings
    starter: |
      def can_attend_meetings(intervals: list[list[int]]) -> bool:
          pass
  javascript:
    name: can_attend_meetings
    starter: |
      function can_attend_meetings(intervals) {
      }
tests:
  - args: [[[0, 30], [5, 10], [15, 20]]]
    expected: false
  - args: [[[7, 10], [2, 4]]]
    expected: true
    label: unsorted, no conflict
  - args: [[]]
    expected: true
    label: no meetings
  - args: [[[1, 5]]]
    expected: true
    label: single meeting
  - args: [[[1, 5], [5, 10]]]
    expected: true
    label: back to back is allowed
  - args: [[[1, 5], [4, 10]]]
    expected: false
    hidden: true
    label: one minute of overlap
  - args: [[[10, 12], [1, 3], [3, 10]]]
    expected: true
    hidden: true
    label: three back-to-back meetings out of order
  - args: [[[2, 3], [1, 2], [2, 3]]]
    expected: false
    hidden: true
    label: duplicate meeting
time_limit_ms: 4000
---
You are given a list of meetings as half-open time intervals `[start, end)`, meaning a meeting occupies every moment from `start` up to but not including `end`. Return `true` if one person could attend all of them, and `false` if any two meetings overlap. A meeting that starts at exactly the moment another ends does not overlap it.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[0, 30], [5, 10], [15, 20]]` | `false` | `[5, 10]` sits inside `[0, 30]` |
| `[[7, 10], [2, 4]]` | `true` | Out of order, but `[2, 4]` finishes before `[7, 10]` starts |
| `[[1, 5], [5, 10]]` | `true` | Back to back is fine |

### Constraints

- `0 ≤ len(intervals) ≤ 10⁴`
- `0 ≤ start < end ≤ 10⁶`

### Follow-up

The interviewer asks: "Now tell me the *earliest* conflict, as a pair of meetings." Then: "The meetings are on a calendar that is modified over time; how do you check each new booking quickly?"

## Solution

### The naive approach

Check every pair for overlap: `O(n²)`. For `n = 10⁴` that is 5 × 10⁷ comparisons, which finishes but is still the wrong answer, because the sorted version is one line longer.

### The insight

Sort by start time. Then checking each meeting only against its immediate predecessor is enough. It is obviously *necessary*: if `start[k] < end[k-1]` those two overlap. It is also *sufficient*: if `start[k] >= end[k-1]` holds for every `k`, then since `end[k-1] > start[k-1] >= end[k-2] > …`, meeting `k` starts after every earlier meeting has ended, so no pair anywhere overlaps. One adjacent comparison per meeting settles the whole question.

### The optimal approach

```python
def can_attend_meetings(intervals: list[list[int]]) -> bool:
    intervals = sorted(intervals, key=lambda iv: iv[0])
    for i in range(1, len(intervals)):
        if intervals[i][0] < intervals[i - 1][1]:
            return False
    return True
```

Time `O(n log n)` for the sort, `O(n)` scan. Space `O(1)` extra beyond the sort (or `O(n)` if you must not mutate the input).

Trace `[[10, 12], [1, 3], [3, 10]]`: sorted, `[1, 3], [3, 10], [10, 12]`. `3 < 3`? No. `10 < 10`? No. `true`.

### Common mistakes

- Comparing with `<=`, which rejects back-to-back meetings. Ask which convention the interviewer wants; this problem uses half-open intervals.
- Forgetting to sort because the first example was already in order.
- Comparing `intervals[i]` with `intervals[0]` or with a running `max` end. The running `max` also works (and is what you need if you skip sorting by start and sort by something else), but the adjacent check is simpler to justify once sorted by start.

### How to discuss it

Say "sort by start, check each meeting against the previous one's end; overlaps can only be adjacent after sorting". For the earliest-conflict follow-up, return the first pair `(i - 1, i)` where the check fails; because you sorted by start, that pair has the earliest-starting second meeting of any conflict. For the calendar follow-up, keep the bookings in an ordered structure keyed by start (a balanced tree or `sortedcontainers.SortedList`); a new booking `[s, e)` conflicts iff the predecessor ends after `s` or the successor starts before `e`, which is two `O(log n)` lookups, and this is exactly what My Calendar I asks for. The natural next question is [Meeting Rooms II](/practice/meeting-rooms-ii): when they do overlap, how many rooms do you need.
