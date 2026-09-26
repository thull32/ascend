---
slug: merge-intervals
title: Merge Intervals
difficulty: medium
patterns: [intervals]
lists: [core-75, ascend-150]
companies: [meta, google, amazon, bloomberg, microsoft]
order: 2
lesson: interview-patterns/array-patterns/intervals
hints:
  - Overlaps are hard to find when intervals are in arbitrary order. What single preprocessing step makes every overlap involve *adjacent* intervals?
  - After sorting by start, walk the list keeping the last merged interval. If the next one starts at or before that interval's end, extend the end; otherwise start a new merged interval.
  - "Extend with `max`, not assignment: the next interval may be entirely inside the current one."
signatures:
  python:
    name: merge
    starter: |
      def merge(intervals: list[list[int]]) -> list[list[int]]:
          pass
  javascript:
    name: merge
    starter: |
      function merge(intervals) {
      }
tests:
  - args: [[[1, 3], [2, 6], [8, 10], [15, 18]]]
    expected: [[1, 6], [8, 10], [15, 18]]
  - args: [[[1, 4], [4, 5]]]
    expected: [[1, 5]]
    label: touching endpoints merge
  - args: [[[1, 4]]]
    expected: [[1, 4]]
    label: single interval
  - args: [[]]
    expected: []
    label: empty
  - args: [[[5, 7], [1, 3]]]
    expected: [[1, 3], [5, 7]]
    label: unsorted input, no overlap
  - args: [[[1, 4], [2, 3]]]
    expected: [[1, 4]]
    hidden: true
    label: second interval is contained in the first
  - args: [[[1, 10], [2, 3], [4, 5], [6, 12]]]
    expected: [[1, 12]]
    hidden: true
    label: one long interval absorbs several
  - args: [[[3, 3], [1, 1], [2, 2]]]
    expected: [[1, 1], [2, 2], [3, 3]]
    hidden: true
    label: zero-length intervals that do not touch
  - args: [[[1, 4], [0, 4]]]
    expected: [[0, 4]]
    label: later interval starts earlier
time_limit_ms: 4000
---
You are given a list of closed intervals `[start, end]` in no particular order. Merge every group of overlapping intervals into a single interval that covers them, and return the merged list sorted by start. Two intervals overlap if they share at least one point, so `[1, 4]` and `[4, 5]` merge into `[1, 5]`.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[1, 3], [2, 6], [8, 10], [15, 18]]` | `[[1, 6], [8, 10], [15, 18]]` | Only the first two overlap |
| `[[1, 4], [4, 5]]` | `[[1, 5]]` | They share the point `4` |
| `[[1, 10], [2, 3], [4, 5], [6, 12]]` | `[[1, 12]]` | Everything chains together through `[1, 10]` |

### Constraints

- `0 ≤ len(intervals) ≤ 10⁴`
- `0 ≤ start ≤ end ≤ 10⁴`

### Follow-up

The interviewer asks: "Instead of merging, return the total length covered by the union." Then: "The intervals now arrive one at a time and you must answer 'how many merged intervals are there?' after each one. What is the cost per insert?"

## Solution

### The naive approach

Repeatedly find any overlapping pair and merge it until no pair overlaps. Each scan is `O(n²)` and there can be `O(n)` merges, so `O(n³)` in the worst case. Nobody ships this, but it is worth saying that the difficulty is *finding* overlaps, not merging them.

### The insight

Sort by start. Now, if interval `B` comes after `A` in sorted order and overlaps *anything* that `A` has already been merged with, it must overlap the merged interval's end, because that end is the furthest point reached so far. So overlap checks only ever involve the current merged interval and the next input, and a single pass suffices.

### The optimal approach

```python
def merge(intervals: list[list[int]]) -> list[list[int]]:
    if not intervals:
        return []
    intervals = sorted(intervals, key=lambda iv: iv[0])
    merged: list[list[int]] = [list(intervals[0])]
    for start, end in intervals[1:]:
        last = merged[-1]
        if start <= last[1]:
            last[1] = max(last[1], end)   # overlap: extend
        else:
            merged.append([start, end])   # gap: start a new one
    return merged
```

Time `O(n log n)` for the sort; the scan is `O(n)`. Space `O(n)` for the output; `O(1)` extra if you are allowed to sort in place.

The `max` is not decoration. With `[[1, 10], [2, 3]]`, the second interval starts inside the first but ends earlier; assigning `last[1] = end` would shrink the merged interval to `[1, 3]`.

Trace `[[1, 3], [2, 6], [8, 10], [15, 18]]` (already sorted): start with `[1, 3]`. `[2, 6]`: `2 ≤ 3`, extend to `[1, 6]`. `[8, 10]`: `8 > 6`, new. `[15, 18]`: `15 > 10`, new.

### Common mistakes

- Comparing against the *previous input* interval instead of the *last merged* one, which breaks chains like `[[1, 10], [2, 3], [4, 5], [6, 12]]`.
- Using `<` instead of `<=` in the overlap test, leaving `[1, 4]` and `[4, 5]` unmerged. Read the problem's definition of overlap; some variants treat touching as separate, and you should ask.
- Sorting by end, or not sorting at all because "the examples looked sorted".

### How to discuss it

Say "sort by start; then every overlap is with the last merged interval, so one pass" and name the sort as the dominant cost. For total covered length, sum `end - start` over the merged output, or do it in the same pass without materialising the list. For the online version, a sorted list with `bisect` gives `O(log n)` to find neighbours but `O(n)` to splice; an ordered map (balanced tree) gives `O(log n)` per insert including the merge, and the count is just its size. That is [Insert Interval](/practice/insert-interval) done repeatedly, and knowing which structure makes it logarithmic is the senior answer. The sort-then-sweep shape here is the same one behind [Meeting Rooms](/practice/meeting-rooms) and [Non-overlapping Intervals](/practice/non-overlapping-intervals); the [Intervals](/learn/interview-patterns/array-patterns/intervals) lesson explains when to sort by start and when by end.
