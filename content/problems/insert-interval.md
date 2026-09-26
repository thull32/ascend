---
slug: insert-interval
title: Insert Interval
difficulty: medium
patterns: [intervals]
lists: [core-75, ascend-150]
companies: [google, meta, amazon, linkedin]
order: 1
lesson: interview-patterns/array-patterns/intervals
hints:
  - The existing intervals are already sorted and disjoint. That means the ones that overlap the new interval form one contiguous run in the middle.
  - Walk the list in three phases. Intervals that end before the new one starts go straight to the output. Intervals that overlap get absorbed by widening the new interval. Once you pass an interval that starts after the new one ends, emit the merged interval and copy the rest.
  - Two intervals overlap when `a.start <= b.end` and `b.start <= a.end`. Touching endpoints (`[1, 2]` and `[2, 5]`) count as overlapping here.
signatures:
  python:
    name: insert
    starter: |
      def insert(intervals: list[list[int]], new_interval: list[int]) -> list[list[int]]:
          pass
  javascript:
    name: insert
    starter: |
      function insert(intervals, new_interval) {
      }
tests:
  - args: [[[1, 3], [6, 9]], [2, 5]]
    expected: [[1, 5], [6, 9]]
  - args: [[[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]], [4, 8]]
    expected: [[1, 2], [3, 10], [12, 16]]
    label: swallows three intervals
  - args: [[], [5, 7]]
    expected: [[5, 7]]
    label: empty list
  - args: [[[1, 5]], [2, 3]]
    expected: [[1, 5]]
    label: new interval is fully contained
  - args: [[[1, 5]], [6, 8]]
    expected: [[1, 5], [6, 8]]
    label: goes after everything
  - args: [[[3, 5]], [1, 2]]
    expected: [[1, 2], [3, 5]]
    hidden: true
    label: goes before everything
  - args: [[[1, 2], [5, 6]], [2, 5]]
    expected: [[1, 6]]
    hidden: true
    label: touching endpoints merge on both sides
  - args: [[[1, 5]], [0, 10]]
    expected: [[0, 10]]
    hidden: true
    label: new interval swallows the only existing one
  - args: [[[2, 4], [7, 9]], [5, 6]]
    expected: [[2, 4], [5, 6], [7, 9]]
    label: fits in a gap without touching
time_limit_ms: 4000
---
You are given a list of closed intervals `intervals`, sorted by start and pairwise non-overlapping, and one more interval `new_interval`. Insert `new_interval` into the list so that the result is still sorted by start and still non-overlapping, merging any intervals that overlap the new one. Two intervals overlap if they share at least one point, so `[1, 2]` and `[2, 5]` overlap.

Return the resulting list.

### Examples

| Input | Output | Why |
|---|---|---|
| `intervals = [[1, 3], [6, 9]]`, `new = [2, 5]` | `[[1, 5], [6, 9]]` | `[2, 5]` overlaps `[1, 3]` only |
| `intervals = [[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]]`, `new = [4, 8]` | `[[1, 2], [3, 10], [12, 16]]` | `[4, 8]` touches `[3, 5]`, `[6, 7]` and `[8, 10]`, which collapse into `[3, 10]` |
| `intervals = [[2, 4], [7, 9]]`, `new = [5, 6]` | `[[2, 4], [5, 6], [7, 9]]` | No overlap; it slots into the gap |

### Constraints

- `0 ≤ len(intervals) ≤ 10⁴`
- `0 ≤ start ≤ end ≤ 10⁵` for every interval

### Follow-up

The interviewer asks: "Can you avoid the O(n) scan if there are millions of intervals and a stream of inserts?" Then: "Now support `delete(interval)` too; what structure do you reach for?"

## Solution

### The naive approach

Append the new interval, sort, and run [Merge Intervals](/practice/merge-intervals). `O(n log n)` and it throws away the fact that the input is already sorted and disjoint. It also does not tell the interviewer that you noticed.

### The insight

Because the input is sorted and disjoint, the intervals that overlap `new_interval` are contiguous: everything before them ends before `new.start`, everything after them starts after `new.end`. So the list splits into three runs, and only the middle run needs any work. Absorbing the middle run is just widening `new_interval` to the min start and max end of everything it touches.

### The optimal approach

```python
def insert(intervals: list[list[int]], new_interval: list[int]) -> list[list[int]]:
    start, end = new_interval
    result: list[list[int]] = []
    i, n = 0, len(intervals)

    # 1. everything that ends before the new interval starts
    while i < n and intervals[i][1] < start:
        result.append(intervals[i])
        i += 1

    # 2. everything that overlaps: widen the new interval
    while i < n and intervals[i][0] <= end:
        start = min(start, intervals[i][0])
        end = max(end, intervals[i][1])
        i += 1
    result.append([start, end])

    # 3. everything that starts after the new interval ends
    result.extend(intervals[i:])
    return result
```

Time `O(n)`: each interval is visited once. Space `O(n)` for the output (which is unavoidable) and `O(1)` beyond that.

Why do the two `while` conditions partition correctly? Phase 1 stops at the first interval with `end >= start`, that is, the first one that could overlap. Phase 2 continues while `interval.start <= end`; since we are past phase 1, these intervals satisfy `interval.end >= start` too, so they genuinely overlap the (possibly widened) new interval. Phase 2 stops at the first interval with `start > end`, which by sortedness means all remaining intervals are strictly after.

Trace the second example with `new = [4, 8]`: phase 1 copies `[1, 2]` (ends at 2 < 4) and stops at `[3, 5]` (ends at 5 ≥ 4). Phase 2 absorbs `[3, 5]` → `[3, 8]`, `[6, 7]` → `[3, 8]`, `[8, 10]` (starts at 8 ≤ 8) → `[3, 10]`, and stops at `[12, 16]`. Emit `[3, 10]`, copy `[12, 16]`.

### Common mistakes

- Using `<` where `<=` is needed at the boundaries, which fails to merge touching intervals like `[1, 2]` and `[2, 5]`.
- Forgetting to emit the merged interval when the loop runs off the end (phase 2 consumed everything). The `append` after the loop, not inside it, handles that.
- Mutating `new_interval` in place and surprising the caller; unpack it into locals.

### How to discuss it

Say "sorted and disjoint means the overlapping ones are contiguous; three phases: before, merge, after" and write the three loops with their conditions stated in words. For the streaming follow-up, binary search (`bisect`) finds the first candidate in `O(log n)`, but splicing a Python list is still `O(n)`; to get `O(log n)` inserts you need an ordered map keyed by start (a balanced tree; `sortedcontainers` in Python, `TreeMap` in Java), which also makes `delete` a matter of finding the interval that contains a point, splitting it, and removing the middle. That structure is an interval set, and it is what a memory allocator's free list or a calendar's busy-time index looks like. See [Merge Intervals](/practice/merge-intervals) for the unsorted case and the lesson on [Intervals](/learn/interview-patterns/array-patterns/intervals) for the general toolkit.
