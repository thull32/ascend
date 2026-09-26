---
slug: non-overlapping-intervals
title: Non-overlapping Intervals
difficulty: medium
patterns: [intervals]
lists: [core-75, ascend-150]
companies: [google, amazon, meta, bloomberg]
order: 3
lesson: interview-patterns/array-patterns/intervals
hints:
  - Removing the minimum number of intervals is the same as *keeping* the maximum number of pairwise non-overlapping ones. That is classic interval scheduling.
  - Sort by end time. Always keep the interval that ends earliest, because it leaves the most room for whatever comes next. Skip any interval that starts before the last kept end.
  - "Here touching is fine: `[1, 2]` and `[2, 3]` do not overlap. So the skip condition is `start < last_end`, strictly."
signatures:
  python:
    name: erase_overlap_intervals
    starter: |
      def erase_overlap_intervals(intervals: list[list[int]]) -> int:
          pass
  javascript:
    name: erase_overlap_intervals
    starter: |
      function erase_overlap_intervals(intervals) {
      }
tests:
  - args: [[[1, 2], [2, 3], [3, 4], [1, 3]]]
    expected: 1
  - args: [[[1, 2], [1, 2], [1, 2]]]
    expected: 2
    label: identical intervals
  - args: [[[1, 2], [2, 3]]]
    expected: 0
    label: touching is not overlapping
  - args: [[]]
    expected: 0
    label: empty
  - args: [[[1, 100], [11, 22], [1, 11], [2, 12]]]
    expected: 2
    hidden: true
    label: greedy by end beats greedy by start
  - args: [[[1, 3], [2, 4], [3, 5], [4, 6]]]
    expected: 2
    hidden: true
    label: chain of pairwise overlaps
  - args: [[[1, 5], [2, 3]]]
    expected: 1
    label: keep the short inner one
  - args: [[[0, 1], [3, 4], [1, 2]]]
    expected: 0
    hidden: true
    label: unsorted, already disjoint
  - args: [[[-5, -1], [-3, 2], [0, 4]]]
    expected: 1
    label: negatives
time_limit_ms: 4000
---
You are given a list of intervals `[start, end]`. Return the minimum number of intervals you must remove so that the remaining intervals are pairwise non-overlapping. Intervals that only touch at an endpoint, like `[1, 2]` and `[2, 3]`, are *not* considered overlapping.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[1, 2], [2, 3], [3, 4], [1, 3]]` | `1` | Remove `[1, 3]`; the other three only touch |
| `[[1, 2], [1, 2], [1, 2]]` | `2` | Only one copy can stay |
| `[[1, 5], [2, 3]]` | `1` | Either one can go; removing `[1, 5]` or `[2, 3]` both leave one interval |

### Constraints

- `0 ≤ len(intervals) ≤ 10⁵`
- `-5 × 10⁴ ≤ start < end ≤ 5 × 10⁴`

### Follow-up

The interviewer asks: "Why sort by end rather than by start? Give me an input where sorting by start and greedily keeping the first fails." Then: "Each interval now has a weight and I want to maximise the total weight kept. Does the greedy survive?"

## Solution

### The naive approach

Try every subset of intervals, keep the largest non-overlapping one. `O(2ⁿ)`. Even the more sensible "repeatedly remove the interval that overlaps the most others" is `O(n²)` per step and, more importantly, not always optimal.

### The insight

Minimum removals equals `n` minus the maximum number of intervals you can keep, and "maximum set of pairwise disjoint intervals" is the interval scheduling problem with a famous greedy: always keep the interval that *ends earliest* among those still compatible. The exchange argument: suppose an optimal solution keeps some other interval `X` as its first choice; the earliest-ending interval `E` ends no later than `X`, so replacing `X` with `E` cannot create a conflict with anything later. Repeat down the list and the greedy solution is at least as large as the optimal one.

Sorting by *start* and keeping the first does not work: `[[1, 100], [2, 3], [4, 5]]` would keep `[1, 100]` and remove two, when the answer is to remove `[1, 100]` alone.

### The optimal approach

```python
def erase_overlap_intervals(intervals: list[list[int]]) -> int:
    if not intervals:
        return 0
    intervals = sorted(intervals, key=lambda iv: iv[1])
    removed = 0
    last_end = intervals[0][1]
    for start, end in intervals[1:]:
        if start < last_end:
            removed += 1            # overlaps the kept one: drop it
        else:
            last_end = end          # compatible: keep it, advance the frontier
    return removed
```

Time `O(n log n)` for the sort, `O(n)` scan. Space `O(1)` beyond the sort.

Trace `[[1, 100], [11, 22], [1, 11], [2, 12]]`: sorted by end gives `[1, 11], [2, 12], [11, 22], [1, 100]`. Keep `[1, 11]`, frontier 11. `[2, 12]`: `2 < 11`, remove. `[11, 22]`: `11 ≥ 11`, keep, frontier 22. `[1, 100]`: `1 < 22`, remove. Total 2.

Notice that when an interval is dropped, `last_end` does not change. The interval being dropped ends *later* than the kept one (it came later in end-sorted order), so keeping the earlier frontier is always at least as good.

### Common mistakes

- Sorting by start. It happens to work on some inputs and fails on the one above.
- Using `<=` for the overlap check, which counts touching intervals as conflicts and over-removes on `[[1, 2], [2, 3]]`.
- Updating `last_end = min(last_end, end)` on the remove branch "to be safe". With end-sorted input `end >= last_end` always holds, so the `min` is a no-op; writing it suggests you are not sure why the greedy works.

### How to discuss it

Reframe as "keep the most, so interval scheduling; sort by end, greedy, exchange argument" and give the argument in two sentences. Answer the sort-by-start follow-up with the `[1, 100]` counterexample. For weighted intervals the greedy fails (a single heavy long interval can be worth more than many light short ones) and the problem becomes weighted interval scheduling: sort by end, and for each interval `i` compute `best[i] = max(best[i-1], weight[i] + best[p(i)])` where `p(i)` is the last interval ending at or before `start[i]`, found with binary search; `O(n log n)` DP. Saying "the greedy is the unweighted special case of that DP" is the senior framing. The same greedy solves Minimum Number of Arrows to Burst Balloons and appears again in [Meeting Rooms](/practice/meeting-rooms); the [Intervals](/learn/interview-patterns/array-patterns/intervals) lesson covers when the sort key is the end and when it is the start.
