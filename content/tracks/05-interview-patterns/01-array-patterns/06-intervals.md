---
slug: intervals
title: "Intervals: sort by the right endpoint, then sweep"
description: The interval family (merge, insert, remove-to-fit, count rooms, answer range queries) as one sort-then-sweep shape, with the rule for which endpoint to sort by and the heap or event sweep that counts concurrency.
minutes: 33
difficulty: medium
tags: [intervals, sweep-line, greedy, heap, pattern:intervals]
problems: [insert-interval, merge-intervals, non-overlapping-intervals, meeting-rooms, meeting-rooms-ii, minimum-interval-query]
---
You are given ranges on a line: meetings with start and end times, reservations, IP blocks, memory allocations, time series segments. The questions are always about how the ranges interact: merge the ones that touch, count how many are live at once, find the fewest to remove so that none collide, find the shortest one covering a point. Written naively each question is a pairwise comparison, `O(n²)`, and for a calendar service or an allocator that is the difference between milliseconds and minutes.

The interval family is the most regular of the sorting-based patterns. Every problem sorts by one endpoint and sweeps left to right, and the entire design decision is *which endpoint* and *what state the sweep carries*: the last merged interval, the last kept end time, a heap of end times. Get the endpoint right and the sweep is five lines; get it wrong and the greedy silently returns wrong answers on inputs your tests will not include. This lesson assumes [Interval problems](/learn/algorithms/greedy/interval-problems), which proves the greedy choices; here the goal is recognising the variant in a minute and executing it cleanly.

## The signal

Anything with two numbers per item where the numbers are a start and an end: "intervals", "meetings", "events with start and end times", "ranges", "segments", `[start, end]`. Then the question tells you the variant:

| The question asks for | Sort by | Sweep state | Problem |
|---|---|---|---|
| The union of overlapping ranges | start | the last merged interval | [Merge Intervals](/practice/merge-intervals) |
| Add one range to an already sorted, disjoint list | already sorted; no sort | three phases: before, overlapping, after | [Insert Interval](/practice/insert-interval) |
| Can one person attend all / is there any overlap | start | the previous interval's end | [Meeting Rooms](/practice/meeting-rooms) |
| Fewest to remove so that none overlap (or most that can coexist) | **end** | the last kept end | [Non-overlapping Intervals](/practice/non-overlapping-intervals) |
| Peak concurrency, minimum rooms | start, plus a min-heap of ends (or sorted ends) | heap of end times | [Meeting Rooms II](/practice/meeting-rooms-ii) |
| For each query point, the shortest interval containing it | start, with queries sorted too | heap keyed by length | [Minimum Interval to Include Each Query](/practice/minimum-interval-query) |

Two words in a statement change the pattern entirely. **"Weighted"** (each interval has a value and you want the maximum total value of a non-overlapping subset) is no longer greedy; it is DP with binary search over the sorted ends. **"Many queries against a fixed set"** with updates pushes you toward a segment tree or an interval tree instead of an offline sweep.

The confusable neighbour is the prefix-sum difference array. When coordinates are small integers (minutes in a day, days in a year), "how many are live at each point" is `+1` at each start and `-1` at each end, then a running sum: `O(n + range)`. When coordinates are arbitrary (Unix timestamps), the sort-based sweep is the same idea compressed to the `2n` interesting points. Know both and pick by the coordinate range.

Before any of this, settle the boundary convention. `[1, 3]` and `[3, 5]`: do they overlap? For merging, most statements say yes (closed intervals, they touch). For meeting rooms, most say no (a meeting ending at 3 frees the room for one starting at 3). Ask, and then write the comparison (`<` versus `<=`) to match. Most interval bugs are this one.

## The template

Merge is the base shape. Sort by start; keep a list of merged intervals; each new interval either extends the last merged one or starts a new one.

```python
def merge(intervals: list[list[int]]) -> list[list[int]]:
    intervals.sort(key=lambda iv: iv[0])
    merged: list[list[int]] = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:       # overlaps or touches the last one
            merged[-1][1] = max(merged[-1][1], end) # max: the new one may be contained
        else:
            merged.append([start, end])
    return merged
```

```javascript
function merge(intervals) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
```

The invariant after processing each interval: `merged` is sorted, pairwise disjoint, and its union equals the union of every interval seen so far. Because the input is sorted by start, a new interval can only overlap the *last* merged one (anything earlier ended before the last one started, which is before this one starts), so one comparison per interval is enough. That single fact is why the whole family is linear after the sort.

The second shape is the concurrency counter. Sort by start; keep a min-heap of the end times of meetings in progress; before seating a new meeting, evict every meeting that has already ended; the heap's size is the number of rooms in use, and its maximum over time is the answer.

```python
import heapq

def min_rooms(intervals: list[list[int]]) -> int:
    intervals.sort(key=lambda iv: iv[0])
    ends: list[int] = []                     # min-heap of end times in progress
    rooms = 0
    for start, end in intervals:
        while ends and ends[0] <= start:     # those meetings are over; free rooms
            heapq.heappop(ends)
        heapq.heappush(ends, end)
        rooms = max(rooms, len(ends))
    return rooms
```

```javascript
// JavaScript has no built-in heap; sorting the ends separately gives the same count.
function minRooms(intervals) {
  const starts = intervals.map((iv) => iv[0]).sort((a, b) => a - b);
  const ends = intervals.map((iv) => iv[1]).sort((a, b) => a - b);
  let rooms = 0, best = 0, e = 0;
  for (const s of starts) {
    if (s >= ends[e]) e++;      // the earliest-ending meeting is over; reuse its room
    else rooms++;               // no room is free; open one
    best = Math.max(best, rooms);
  }
  return best;
}
```

The JavaScript version is the **two-sorted-lists sweep**: you do not need to know *which* meeting ended, only *that* one did, so the ends can be sorted independently of the starts. It is the version to write when there is no heap library at hand, and it is `O(n log n)` with `O(n)` space either way.

## Worked problems

### Merge Intervals

[Merge Intervals](/practice/merge-intervals): given a list of closed intervals in any order, return the list of merged, non-overlapping intervals that cover the same points.

The insight is above: after sorting by start, each interval can only overlap the most recently merged one. The one detail that separates a passing solution from a failing one is the `max` when extending, because a later interval can be entirely inside the current merged one.

Trace `[[1, 3], [8, 10], [2, 6], [15, 18], [9, 12], [16, 17]]`. Sorted by start: `[[1, 3], [2, 6], [8, 10], [9, 12], [15, 18], [16, 17]]`.

| Interval | Last merged | `start <= last.end`? | Action | `merged` after |
|---|---|---|---|---|
| `[1, 3]` | none | | append | `[[1, 3]]` |
| `[2, 6]` | `[1, 3]` | `2 <= 3` yes | extend end to `max(3, 6) = 6` | `[[1, 6]]` |
| `[8, 10]` | `[1, 6]` | `8 <= 6` no | append | `[[1, 6], [8, 10]]` |
| `[9, 12]` | `[8, 10]` | `9 <= 10` yes | extend to `12` | `[[1, 6], [8, 12]]` |
| `[15, 18]` | `[8, 12]` | `15 <= 12` no | append | `[[1, 6], [8, 12], [15, 18]]` |
| `[16, 17]` | `[15, 18]` | `16 <= 18` yes | extend to `max(18, 17) = 18` | unchanged |

The last row is the contained case. Writing `merged[-1][1] = end` there would shrink `[15, 18]` to `[15, 17]` and lose the point 18. Time `O(n log n)` for the sort, `O(n)` sweep; space `O(n)` for the output (plus the sort's own space).

[Insert Interval](/practice/insert-interval) is this problem with a promise: the input is already sorted and disjoint, and you are adding one interval. Do not append and re-merge (`O(n log n)`). Walk once: copy intervals that end before the new one starts, absorb every interval that overlaps it into a growing `[min start, max end]`, then copy the rest. That is `O(n)` and it is the answer the promise is asking for.

### Non-overlapping Intervals

[Non-overlapping Intervals](/practice/non-overlapping-intervals): return the minimum number of intervals to remove so that the remaining ones do not overlap. Equivalently, `n` minus the maximum number of mutually non-overlapping intervals you can keep.

The insight is the classic activity-selection greedy: **sort by end time and keep every interval that starts at or after the last kept end**. Keeping the interval that ends earliest leaves the most room for everything after it, and an exchange argument makes that rigorous: in any optimal set, swap its first interval for the earliest-ending interval overall and the set stays valid and the same size.

Sorting by start and keeping greedily is the tempting wrong answer. On `[[1, 100], [2, 3], [4, 5]]` it keeps `[1, 100]` and removes two; the correct answer removes one. The interval that starts first can be the one that blocks everything.

Trace `[[1, 4], [2, 3], [3, 5], [4, 6], [5, 9], [6, 7]]`. Sorted by end: `[[2, 3], [1, 4], [3, 5], [4, 6], [6, 7], [5, 9]]`. Treat `[a, b)` as overlapping `[c, d)` when `c < b`, so an interval starting exactly at the last end is fine.

| Interval | Last kept end | `start >= last end`? | Action | Removed so far |
|---|---|---|---|---|
| `[2, 3]` | `-inf` | yes | keep; end = 3 | 0 |
| `[1, 4]` | 3 | `1 >= 3` no | remove | 1 |
| `[3, 5]` | 3 | `3 >= 3` yes | keep; end = 5 | 1 |
| `[4, 6]` | 5 | `4 >= 5` no | remove | 2 |
| `[6, 7]` | 5 | `6 >= 5` yes | keep; end = 7 | 2 |
| `[5, 9]` | 7 | `5 >= 7` no | remove | 3 |

Three removals, three kept: `[2, 3], [3, 5], [6, 7]`. Check that four cannot be kept: `[1, 4]` collides with `[2, 3]`, `[4, 6]` with `[3, 5]`, `[5, 9]` with `[6, 7]`; each removed interval collides with a kept one, and the kept ones end as early as possible, so there is no room for a fourth.

```python
def erase_overlap_intervals(intervals: list[list[int]]) -> int:
    intervals.sort(key=lambda iv: iv[1])
    removed, last_end = 0, float("-inf")
    for start, end in intervals:
        if start >= last_end:
            last_end = end
        else:
            removed += 1
    return removed
```

`O(n log n)` time, `O(1)` extra space. Notice that when you remove, you do not update `last_end`: the removed interval ends later than the kept one (it sorted after it), so the kept end is the better boundary to carry forward.

### Meeting Rooms II

[Meeting Rooms II](/practice/meeting-rooms-ii): given meeting intervals, return the minimum number of rooms needed so that no two overlapping meetings share a room.

The answer is the maximum number of meetings live at any instant, and the insight is that this maximum can only change at a start time. So sort by start, and at each start ask "how many meetings are still running?" The min-heap of end times answers that: everything with `end <= start` is over and can be evicted; whatever remains is occupying a room.

Trace `[[1, 5], [2, 6], [4, 8], [6, 9], [8, 10], [9, 12]]` (already sorted by start):

| Meeting | Evict (`end <= start`) | Push | Heap (sorted view) | Rooms in use | Max so far |
|---|---|---|---|---|---|
| `[1, 5]` | nothing | 5 | `[5]` | 1 | 1 |
| `[2, 6]` | `5 <= 2`? no | 6 | `[5, 6]` | 2 | 2 |
| `[4, 8]` | `5 <= 4`? no | 8 | `[5, 6, 8]` | 3 | 3 |
| `[6, 9]` | 5 and 6 | 9 | `[8, 9]` | 2 | 3 |
| `[8, 10]` | 8 | 10 | `[9, 10]` | 2 | 3 |
| `[9, 12]` | 9 | 12 | `[10, 12]` | 2 | 3 |

Three rooms. Sanity check at time 4.5: `[1, 5]`, `[2, 6]` and `[4, 8]` are all running, and nothing else ever has three at once. Watch the heap the sweep maintains: the animation replays exactly the pushes and pops from the table, and the heap's size at each step is the room count.

```viz
{"type": "heap", "algorithm": "push-pop", "kind": "min", "operations": [["push", 5], ["push", 6], ["push", 8], ["pop"], ["pop"], ["push", 9], ["pop"], ["push", 10], ["pop"], ["push", 12]], "caption": "End times of meetings in progress. Each pop is a meeting that has ended before the next start; the heap size is the number of rooms in use."}
```

The two-sorted-lists sweep gives the same count. Starts `[1, 2, 4, 6, 8, 9]`, ends `[5, 6, 8, 9, 10, 12]`, pointer `e = 0`: start 1, 2, 4 each see `start < ends[e]` and open a room (3 rooms); start 6 sees `6 >= 5`, so a room is reused and `e` advances; likewise 8 and 9. Max is 3. It is the same algorithm with the heap replaced by a sorted array, possible because you only ever consume ends in increasing order.

A common shortcut is to pop at most one end per new meeting (`if ends[0] <= start: heapreplace`). It is also correct for the *maximum*: stale ends can remain in the heap, but the heap only grows when its smallest end is later than the new start, which means every end in it is genuinely live. The `while` loop is easier to defend and keeps `len(ends)` equal to the true concurrency at every step, which matters if the follow-up asks for the count at a given time rather than the maximum.

`O(n log n)` for the sort and the heap operations, `O(n)` space.

## Variations

**Insert without re-sorting.** [Insert Interval](/practice/insert-interval) is the `O(n)` three-phase walk described above. Interviewers use it to check that you notice the "already sorted and disjoint" promise rather than reaching for the merge template blindly.

**Maximum non-overlapping instead of minimum removal.** Same sweep as non-overlapping intervals; count the keeps instead of the removes. "Minimum number of arrows to burst balloons" is the same greedy again: each kept interval's end is where you shoot an arrow.

**Concurrency with small integer coordinates.** Minutes in a day, days in a year: use a difference array, `+1` at start and `-1` at end, and take the running maximum. `O(n + range)`, no sort, no heap. Mention it, then say why arbitrary timestamps push you back to the sweep.

**Event sweep with tie rules.** Turn each interval into two events `(time, +1)` and `(time, -1)`, sort, and run a counter. The tie rule is the design: if a meeting ending at 5 frees the room for one starting at 5, sort ends before starts at equal times (`-1` before `+1`); if touching counts as overlap, sort starts first. This one sort key encodes the boundary convention explicitly, which is why some seniors prefer it to the heap.

**Offline queries.** [Minimum Interval to Include Each Query](/practice/minimum-interval-query) asks, for each of many query points, the length of the shortest interval containing it. Answering each query independently is `O(q · n)`. The offline trick: sort the intervals by start, sort the queries, and sweep the queries in increasing order. At each query push every interval whose start is `<= query` into a min-heap keyed by `(length, end)`; then pop from the top while the top's end is `< query` (it has expired and can never serve a later query either, since queries only increase). The heap top is the answer. Write results back by the query's original index. `O((n + q) log(n + q))`. The word "offline" is the senior signal: you are allowed to reorder the queries because they are all known up front.

**Weighted intervals.** With a value per interval and "maximise total value of a non-overlapping subset", the greedy fails. Sort by end; `dp[i]` = best value using the first `i` intervals; for interval `i`, binary search the last interval that ends at or before its start. `O(n log n)`. The signal that you have crossed from greedy into DP is the weight.

## Pitfalls

- **Extending with `end` instead of `max(last.end, end)`.** Fails only when an interval is contained in the previous merged one (`[15, 18]` then `[16, 17]`), which is the case most hand-written tests omit.
- **Sorting by start for the removal problem.** `[[1, 100], [2, 3], [4, 5]]` breaks it. The removal and "maximum non-overlapping" problems sort by *end*; merging, attendance and room counting sort by *start*. Say which and why.
- **Boundary convention.** `<` versus `<=` in the overlap test decides whether `[1, 3]` and `[3, 5]` merge, whether a meeting ending at 3 frees the room at 3, and which event goes first at a tie. Ask, decide, and be consistent in the sort key and the comparison.
- **Pushing before evicting in the room counter.** Pushing the new end first and then evicting can pop the *new* meeting if it is zero-length, and it inflates the count by one at every step where a meeting ended exactly at the new start. Evict, then push, then measure.
- **Aliasing the input.** `merged.append(interval)` followed by `merged[-1][1] = ...` mutates the caller's list in Python and JavaScript alike. Append a copy (`[start, end]`) if the input must survive, and say so.
- **Re-sorting an already sorted input.** Insert Interval and minimum-interval-query both hand you sorted data; sorting it again is not wrong, but it turns an `O(n)` solution into `O(n log n)` and signals that you did not read the constraints.
- **Not evicting expired intervals in the query sweep.** Leaving intervals whose end is before the current query at the top of the heap returns lengths of intervals that do not contain the query. The `while top.end < query: pop` loop is load-bearing.

## Exercise

```exercise
id: covered-length
title: Total length covered by intervals
prompt: |
  Given a list of closed intervals `[start, end]` with integer endpoints and
  `start <= end`, in any order and possibly overlapping, return the total
  length of the line they cover: the sum of `end - start` over the merged,
  non-overlapping intervals. Touching intervals such as `[1, 4]` and `[4, 5]`
  count as one covered stretch of length 4.

  Return 0 for an empty list. Aim for O(n log n).
languages: [python, javascript]
entry: covered_length
starter:
  python: |
    def covered_length(intervals):
        # sort by start, merge into disjoint intervals, sum their lengths
        return 0
  javascript: |
    function covered_length(intervals) {
      // sort by start, merge into disjoint intervals, sum their lengths
      return 0;
    }
tests:
  - args: [[[1, 3], [2, 6], [8, 10]]]
    expected: 7
  - args: [[[1, 4], [4, 5]]]
    expected: 4
    label: touching intervals merge
  - args: [[]]
    expected: 0
    label: empty input
  - args: [[[5, 5]]]
    expected: 0
    label: zero-length interval
  - args: [[[1, 10], [2, 3], [4, 5]]]
    expected: 9
    hidden: true
    label: contained intervals add nothing
  - args: [[[3, 7], [1, 2], [6, 9], [10, 12], [11, 11]]]
    expected: 9
    hidden: true
hints:
  - "Sort by start. Each interval either extends the last merged interval (when its start is <= that interval's end) or begins a new one."
  - "When extending, take the max of the two ends; an interval can sit entirely inside the previous merged one."
  - "Sum end - start over the merged list at the end, or keep a running total as you close each merged interval."
```

## Senior signals

- You ask about the **boundary convention** before writing the comparison, and your sort key, overlap test and event tie rule all agree with it.
- You state **which endpoint you sort by and why**: start for merging and counting, end for keeping the most; and you can produce the three-interval input where the wrong choice fails.
- You justify the greedy with an **exchange argument** in one sentence, and you know that a weight on the intervals moves the problem from greedy to DP.
- You reach for the **difference array** when coordinates are small integers and the **sorted-ends sweep** when they are arbitrary, and you say what each costs.
- You recognise **offline query processing**: sorting the queries is allowed because they are all known, and the heap with lazy expiry is the standard shape.
- You know the room-count sweep only needs to know *that* a meeting ended, not which one, and that this is why two independently sorted arrays work as well as a heap.

## Check yourself

```quiz
- q: >-
    To keep the maximum number of non-overlapping intervals, you sort by end time and keep greedily. Why is sorting by start time wrong?
  options: ["Start order is fine for the count but cannot name which to remove", "It is not wrong; both orders keep the same number of intervals", "An early start can be a long interval that blocks many short ones", "Start order fails only when several intervals share the same start"]
  answer: 2
  explanation: >-
    On [[1,100],[2,3],[4,5]] the start-time greedy keeps [1,100] and removes two, while the optimum removes one, so the counts differ. The exchange argument shows the earliest-ending interval belongs to some optimal solution and leaves the most room for the rest; no such argument exists for the earliest-starting one.
- q: >-
    A merge implementation returns [[1, 3]] for the input [[1, 10], [2, 3]]. What is the bug?
  options: ["It sorted by end instead of by start before sweeping", "It never sorted the input before starting the sweep", "It compared start with < instead of <= against the last end", "It set the merged end to the new end, not the max of both"]
  answer: 3
  explanation: >-
    [2, 3] is contained in [1, 10]. Assigning `last[1] = 3` overwrites the larger end; `max(10, 3)` keeps it. Sorting by end would put [2,3] first and yield two intervals, the comparison direction only affects touching intervals, and this input is already sorted by start.
- q: >-
    In the meeting-rooms heap sweep, you replace the `while ends[0] <= start: pop` loop with a single `if`. What is true?
  options: ["The answer is wrong whenever two meetings end before the next starts", "The sweep drops to O(n) time, since each step pops at most once", "The maximum is still right, but heap size can overstate current use", "It stays correct only when the intervals are treated as half-open"]
  answer: 2
  explanation: >-
    The heap only grows when its smallest end is later than the new start, which means every end in it is live, so the recorded maximum is exact. Stale entries can linger, so the heap size no longer equals the current concurrency, and a follow-up asking for concurrency at a given time needs the while loop. Complexity is unchanged: sorting and heap pushes still cost O(n log n).
- q: >-
    Meetings are given as half-open [start, end): a room freed at time 5 can host a meeting starting at 5. In an event sweep with (+1 at start, -1 at end), how must ties be ordered?
  options: ["No rule is needed, since half-open intervals never tie", "Ends before starts, so the room is freed before the count rises", "Starts before ends, so the new meeting is counted first", "Either order, since ties cannot change the maximum count"]
  answer: 1
  explanation: >-
    If the start is processed first, the counter briefly counts both meetings and over-reports the peak by one. Releasing first matches the convention that the room is free at the exact end time. With closed intervals that touch, the order would flip.
- q: >-
    Minimum Interval to Include Each Query has n intervals and q queries. What makes the O((n + q) log(n + q)) offline solution possible?
  options: ["The queries are integers, so they can be bucketed by coordinate", "The queries are all known up front, so they can be processed sorted", "The intervals fit in a segment tree built once over all endpoints", "The intervals never overlap, so each query hits at most one"]
  answer: 1
  explanation: >-
    Sweeping queries in increasing order lets each interval be pushed once (when its start is reached) and expired once (when its end falls behind the query), with results written back by original index. That amortisation is only valid because the query order is yours to choose. If queries arrived one at a time and had to be answered immediately, you would need an interval tree or segment tree instead.
- q: >-
    Insert Interval gives you a sorted, disjoint list and one new interval. Which solution shows you read the constraints?
  options: ["Build a difference array over the coordinates: O(n + range)", "Append the new interval, sort, and run merge: O(n log n)", "One pass: copy before, absorb overlaps, copy after: O(n)", "Binary search the slot, insert, merge neighbours: O(log n)"]
  answer: 2
  explanation: >-
    The sorted, disjoint promise makes a single linear pass sufficient: copy intervals ending before the new start, absorb overlapping ones into a growing interval, copy the rest. Re-sorting works but wastes the promise; the difference array depends on the coordinate range, which may be huge. Binary search finds the slot in O(log n), but inserting still shifts O(n) elements, so that version is not O(log n).
```
