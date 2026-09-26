---
slug: minimum-interval-query
title: Minimum Interval to Include Each Query
difficulty: hard
patterns: [intervals]
lists: [ascend-150]
companies: [google, amazon]
order: 6
lesson: interview-patterns/array-patterns/intervals
hints:
  - Answering each query independently by scanning every interval is O(q·n). Sort the queries and the intervals so you can sweep both together, then restore the original query order at the end.
  - As the query point moves right, intervals become *active* when their left end is passed and can never become active again once their right end is passed. A min-heap keyed by size holds the active candidates.
  - "Lazily discard: before answering a query, pop from the heap while its top interval has already ended. Because each interval is pushed and popped at most once, the whole sweep is O((n + q) log n)."
signatures:
  python:
    name: min_interval
    starter: |
      def min_interval(intervals: list[list[int]], queries: list[int]) -> list[int]:
          pass
  javascript:
    name: min_interval
    starter: |
      function min_interval(intervals, queries) {
      }
tests:
  - args: [[[1, 4], [2, 4], [3, 6], [4, 4]], [2, 3, 4, 5]]
    expected: [3, 3, 1, 4]
  - args: [[[2, 3], [2, 5], [1, 8], [20, 25]], [2, 19, 5, 22]]
    expected: [2, -1, 4, 6]
    label: one query has no containing interval
  - args: [[[1, 1]], [1]]
    expected: [1]
    label: single point interval
  - args: [[[1, 10]], [0, 11]]
    expected: [-1, -1]
    label: queries just outside
  - args: [[[1, 3], [2, 2]], [2, 3]]
    expected: [1, 3]
    hidden: true
    label: the tiny interval wins, then expires
  - args: [[], [1, 2]]
    expected: [-1, -1]
    label: no intervals
  - args: [[[5, 10], [1, 20], [8, 9]], [9, 3, 15, 8, 10]]
    expected: [2, 20, 20, 2, 6]
    hidden: true
    label: unsorted queries, answers in original order
  - args: [[[1, 2], [3, 4]], [2, 3, 2]]
    expected: [2, 2, 2]
    hidden: true
    label: duplicate queries
time_limit_ms: 4000
---
You are given a list of closed integer intervals `[left, right]` and a list of integer `queries`. The *size* of an interval is `right - left + 1`. For each query value `q`, find the smallest size among all intervals that contain `q` (`left ≤ q ≤ right`); if no interval contains it, the answer is `-1`. Return the answers in the same order as the queries.

### Examples

| Input | Output | Why |
|---|---|---|
| `intervals = [[1, 4], [2, 4], [3, 6], [4, 4]]`, `queries = [2, 3, 4, 5]` | `[3, 3, 1, 4]` | `2` is in `[2, 4]` (size 3); `4` is in `[4, 4]` (size 1); `5` is only in `[3, 6]` (size 4) |
| `intervals = [[2, 3], [2, 5], [1, 8], [20, 25]]`, `queries = [2, 19, 5, 22]` | `[2, -1, 4, 6]` | `19` is in nothing |
| `intervals = [[1, 3], [2, 2]]`, `queries = [2, 3]` | `[1, 3]` | `[2, 2]` covers `2` but has expired by `3` |

### Constraints

- `0 ≤ len(intervals), len(queries) ≤ 10⁵`
- `1 ≤ left ≤ right ≤ 10⁷`
- `1 ≤ queries[i] ≤ 10⁷`

### Follow-up

The interviewer asks: "Queries now arrive online, one at a time, in arbitrary order, and must be answered immediately. What structure do you use and what does a query cost?" Then: "Instead of the smallest interval, return *how many* intervals contain each query."

## Solution

### The naive approach

For each query scan every interval, keep the smallest size that contains it. `O(q · n)`, which is `10¹⁰` at the limits. Correct and a useful oracle for testing, and nothing more.

### The insight

Process the queries in increasing order. As the query point moves right, an interval becomes a candidate once `left ≤ q`, and once `right < q` it can never be a candidate again. So candidates enter in order of `left` (sort the intervals by `left`) and leave in order of their own `right`, and at any moment you want the smallest-size candidate that has not yet expired.

A min-heap ordered by size answers "smallest candidate" in `O(log n)`. Expired intervals are handled lazily: when the heap's top has `right < q`, pop it and look again. Since sizes are what the heap orders by, an expired interval that is *not* on top is harmless (it never gets reported) and will be popped later, if ever. Each interval is pushed once and popped at most once, so the total heap work is `O(n log n)`; the queries add `O(q log q)` for their sort.

### The optimal approach

```python
import heapq


def min_interval(intervals: list[list[int]], queries: list[int]) -> list[int]:
    intervals = sorted(intervals, key=lambda iv: iv[0])
    order = sorted(range(len(queries)), key=lambda k: queries[k])
    answers = [-1] * len(queries)
    heap: list[tuple[int, int]] = []   # (size, right)
    i = 0
    for k in order:
        q = queries[k]
        while i < len(intervals) and intervals[i][0] <= q:
            left, right = intervals[i]
            heapq.heappush(heap, (right - left + 1, right))
            i += 1
        while heap and heap[0][1] < q:
            heapq.heappop(heap)
        if heap:
            answers[k] = heap[0][0]
    return answers
```

Time `O(n log n + q log q)`. Space `O(n + q)`.

Trace the first example: intervals sorted by left are `[1, 4], [2, 4], [3, 6], [4, 4]`; queries in order `2, 3, 4, 5`.

| q | pushed | heap top after expiry | answer |
|---|---|---|---|
| 2 | `(4, 4)` for `[1, 4]`, `(3, 4)` for `[2, 4]` | `(3, 4)` | 3 |
| 3 | `(4, 6)` for `[3, 6]` | `(3, 4)` | 3 |
| 4 | `(1, 4)` for `[4, 4]` | `(1, 4)` | 1 |
| 5 | | pop `(1, 4)`, pop `(3, 4)`, pop `(4, 4)`; top `(4, 6)` | 4 |

Why can it never report a stale interval? The only thing read is `heap[0]`, and the expiry loop guarantees `heap[0].right >= q` before it is read. Intervals with `left > q` have not been pushed yet. So the top is a genuine container, and by heap order it is the smallest.

### Common mistakes

- Answering in sorted-query order and forgetting to map back to the original positions. Sort *indices*, not the queries themselves.
- Keying the heap by `right` instead of size, which makes the expiry loop trivial but the "smallest" query wrong; or keying by size and trying to eagerly delete expired intervals, which a binary heap cannot do in `O(log n)` without an index.
- Off-by-one in size: `right - left + 1` for closed integer intervals. `[4, 4]` has size 1, not 0.

### How to discuss it

Say "offline: sort queries, sweep, intervals enter by left and expire by right; min-heap by size with lazy deletion" and state the push-once-pop-once amortisation. For online queries in arbitrary order, offline sorting is unavailable; the standard answer is a segment tree over the compressed coordinate range where each interval does a range-update "min with size" on `[left, right]` and a query is a point lookup, `O(log n)` each, with `O(n log n)` build. For counting containing intervals rather than minimising, the heap becomes unnecessary: with sorted lefts and sorted rights, the count for `q` is `#(left ≤ q) - #(right < q)`, two binary searches, which is `O(log n)` per query with no sweep at all; recognising that the count version is easier than the min version is the senior observation. Compare with [Meeting Rooms II](/practice/meeting-rooms-ii), which is the same sweep with a counter in place of the heap.
