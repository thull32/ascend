---
slug: intervals
title: "Intervals: sort by the right endpoint, then sweep"
description: The interval family (merge, insert, remove-to-fit, count rooms, answer range queries, and the problems that hide intervals) as one sort-then-sweep shape, with the rule for which endpoint to sort by, the boundary convention that decides every comparison, and measured sort costs on log-ordered data.
minutes: 40
difficulty: medium
tags: [intervals, sweep-line, greedy, heap, pattern:intervals]
problems: [insert-interval, merge-intervals, non-overlapping-intervals, meeting-rooms, meeting-rooms-ii, minimum-interval-query, partition-labels]
---
You are given ranges on a line: meetings with start and end times, reservations, request spans in a trace, IP blocks, memory allocations. The questions are always about how the ranges interact: merge the ones that touch, count how many are live at once, find the fewest to remove so none collide, find the shortest one covering a point. Written naively each question is a pairwise comparison, `O(n²)`: for a day of one million requests that is 5 × 10¹¹ comparisons. Sorted and swept, the same question took under half a second in CPython on the machine this lesson was measured on.

The interval family is the most regular of the sorting-based patterns. Every problem sorts by one endpoint and sweeps left to right, and the whole design is three decisions: *which endpoint* to sort by, *what state* the sweep carries (the last merged interval, the last kept end, a heap of ends), and *whether touching intervals overlap*. Get them right and the sweep is five lines; get one wrong and the greedy silently returns wrong answers on inputs your tests do not include. The greedy proofs are in [Interval problems](/learn/algorithms/greedy/interval-problems) and the event-sweep machinery in [Sweep line and geometry](/learn/algorithms/technique-mastery/sweep-line-and-geometry); this lesson is about recognising the variant in a minute and executing it cleanly.

## The signal

Two numbers per item that are a start and an end: "intervals", "meetings", "bookings", "events with start and end times", "ranges", "segments". Then the question names the variant:

| The question asks for | Sort by | Sweep state | Problem |
|---|---|---|---|
| The union of overlapping ranges | start | the last merged interval | [Merge Intervals](/practice/merge-intervals) |
| Add one range to a sorted, disjoint list | no sort: already sorted | three phases: before, overlapping, after | [Insert Interval](/practice/insert-interval) |
| Can one person attend all | start | the previous end | [Meeting Rooms](/practice/meeting-rooms) |
| Fewest removals so none overlap, or most that coexist | **end** | the last kept end | [Non-overlapping Intervals](/practice/non-overlapping-intervals) |
| Peak concurrency, minimum rooms | start, plus a min-heap of ends (or sorted ends) | heap of ends | [Meeting Rooms II](/practice/meeting-rooms-ii) |
| For each query point, the shortest interval containing it | start, with the queries sorted too | heap keyed by length | [Minimum Interval to Include Each Query](/practice/minimum-interval-query) |

### Intervals the statement hides

| Statement | The intervals | Then |
|---|---|---|
| "Split a string into as many parts as possible so each letter appears in one part" ([Partition Labels](/practice/partition-labels)) | each letter's `[first, last]` occurrence | merge; the merged blocks are the parts |
| "Fewest jumps to reach the end" ([Jump Game II](/practice/jump-game-ii)) | index `i` covers `[i, i + nums[i]]` | cover `[0, n − 1]` with fewest intervals: extend to the farthest reach |
| "Free time common to every employee" | every busy slot, from all schedules | merge all, report the gaps |
| "Can the car carry all trips without exceeding capacity?" | each trip's `[pickup, drop)` with a weight | events with `+w` and `−w`, or a difference array |
| "Remove intervals covered by another interval" | as given | sort by `(start, −end)`, keep those whose end exceeds the running maximum |
| "Minimum arrows to burst all balloons" | each balloon's `[x_start, x_end]` | sort by end; shoot at each kept end |

### Near misses

| Statement | Needs instead | Why |
|---|---|---|
| **Weighted**: maximise the total value of non-overlapping intervals | DP over intervals sorted by end, binary search for the last compatible one | Greedy by end ignores value; one heavy interval can beat three light ones |
| Bookings arrive **online** and each must be accepted or rejected now | Sorted structure with `bisect`, a balanced tree, or a database exclusion constraint | No batch to sort; each insert is a query |
| Coordinates are **small integers** (minutes in a day) | Difference array, `O(n + range)` | No sort needed; the range is the index |
| **Rectangles**: area of the union | Sweep over x with a segment tree over y | Two dimensions; one sort is not enough |
| "Longest run of consecutive integers" | Hash set of values | Points, not intervals; `O(n)` without sorting |

## Three decisions before you type

| Problem | Sort key | Boundary convention | Overlap test |
|---|---|---|---|
| Merge Intervals | start | closed: `[1, 3]` and `[3, 5]` touch and merge | `start <= last_end` |
| Insert Interval | none | closed | `iv.start <= new.end and iv.end >= new.start` |
| Meeting Rooms | start | half-open: a meeting ending at 3 frees the room at 3 | `start < prev_end` |
| Non-overlapping Intervals | end | half-open | keep if `start >= last_end` |
| Meeting Rooms II | start (heap) or two sorted lists | half-open | evict while `ends[0] <= start` |
| Minimum Interval Query | start; queries sorted | closed: `query` in `[l, r]` | expire while `top.end < query` |

The third column is where most interval bugs live. Ask "do `[1, 3]` and `[3, 5]` overlap?" before writing any comparison, then make the sort key, the overlap test and any event tie rule agree with the answer. With half-open `[start, end)` intervals, an event sweep must process an end before a start at the same time, or it over-reports the peak by one.

## The template

Merge is the base shape. Sort by start; each new interval either extends the last merged one or starts a new one.

```python
def merge(intervals: list[list[int]]) -> list[list[int]]:
    intervals = sorted(intervals, key=lambda iv: iv[0])  # a copy: the caller's list survives
    merged: list[list[int]] = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:       # overlaps or touches the last one
            merged[-1][1] = max(merged[-1][1], end) # max: the new one may be contained
        else:
            merged.append([start, end])             # a new list, not the caller's
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

The invariant after each interval: `merged` is sorted, pairwise disjoint, and its union equals the union of every interval seen so far. Because the input is sorted by start, a new interval can only overlap the *last* merged one: anything earlier ended before the last one started, which is no later than this one's start. One comparison per interval is enough, which is why the family is linear after the sort.

The second shape counts concurrency. Sort by start; keep a min-heap of the ends of meetings in progress; before seating a meeting, evict every meeting that has ended; the heap's size is the rooms in use.

```python
import heapq

def min_rooms(intervals: list[list[int]]) -> int:
    ends: list[int] = []                     # min-heap of end times in progress
    rooms = 0
    for start, end in sorted(intervals, key=lambda iv: iv[0]):
        while ends and ends[0] <= start:     # half-open: ended at or before this start
            heapq.heappop(ends)
        heapq.heappush(ends, end)            # evict first, then push, then measure
        rooms = max(rooms, len(ends))
    return rooms
```

```javascript
// No built-in heap: sort starts and ends separately. You only need to know THAT
// a meeting ended, not which one, so the two lists need not stay paired.
function minRooms(intervals) {
  const starts = Float64Array.from(intervals, (iv) => iv[0]).sort();  // numeric sort
  const ends = Float64Array.from(intervals, (iv) => iv[1]).sort();
  let rooms = 0, best = 0, e = 0;
  for (const s of starts) {
    if (s >= ends[e]) e++;      // the earliest-ending meeting is over; reuse its room
    else rooms++;               // no room is free; open one
    best = Math.max(best, rooms);
  }
  return best;
}
```

The JavaScript version is the two-sorted-lists sweep, and the typed arrays are deliberate: they sort numerically without a comparator and, as measured below, make the whole count 2.5× faster than sorting arrays of pairs.

## Worked problems

### Merge Intervals

[Merge Intervals](/practice/merge-intervals). Trace `[[1, 3], [8, 10], [2, 6], [15, 18], [9, 12], [16, 17]]`, sorted by start to `[[1, 3], [2, 6], [8, 10], [9, 12], [15, 18], [16, 17]]`:

| Interval | Last merged | `start <= last.end`? | Action | `merged` after |
|---|---|---|---|---|
| `[1, 3]` | none | | append | `[[1, 3]]` |
| `[2, 6]` | `[1, 3]` | `2 <= 3` yes | end = `max(3, 6)` = 6 | `[[1, 6]]` |
| `[8, 10]` | `[1, 6]` | `8 <= 6` no | append | `[[1, 6], [8, 10]]` |
| `[9, 12]` | `[8, 10]` | `9 <= 10` yes | end = 12 | `[[1, 6], [8, 12]]` |
| `[15, 18]` | `[8, 12]` | `15 <= 12` no | append | `[[1, 6], [8, 12], [15, 18]]` |
| `[16, 17]` | `[15, 18]` | `16 <= 18` yes | end = `max(18, 17)` = 18 | unchanged |

The last row is the contained case: writing `merged[-1][1] = end` would shrink `[15, 18]` to `[15, 17]`.

### Insert Interval

[Insert Interval](/practice/insert-interval): the list is sorted and disjoint; add one interval. Appending and re-merging is `O(n log n)` and ignores the promise; one walk in three phases is `O(n)`.

```python
def insert(intervals: list[list[int]], new: list[int]) -> list[list[int]]:
    out, i, n = [], 0, len(intervals)
    s, e = new
    while i < n and intervals[i][1] < s:          # 1. ends before new starts
        out.append(intervals[i]); i += 1
    while i < n and intervals[i][0] <= e:         # 2. overlaps (closed): absorb
        s = min(s, intervals[i][0]); e = max(e, intervals[i][1]); i += 1
    out.append([s, e])
    out.extend(intervals[i:])                     # 3. starts after new ends
    return out
```

Trace `[[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]]` with `new = [4, 8]`:

| Interval | Phase | Test | Growing interval | `out` after |
|---|---|---|---|---|
| `[1, 2]` | before | `2 < 4` | `[4, 8]` | `[[1, 2]]` |
| `[3, 5]` | absorb | `3 <= 8` | `[3, 8]` | |
| `[6, 7]` | absorb | `6 <= 8` | `[3, 8]` | |
| `[8, 10]` | absorb | `8 <= 8` (touching counts) | `[3, 10]` | |
| `[12, 16]` | after | `12 <= 10` fails | emit `[3, 10]` | `[[1, 2], [3, 10], [12, 16]]` |

### Non-overlapping Intervals

[Non-overlapping Intervals](/practice/non-overlapping-intervals): fewest removals so the rest do not overlap. **Sort by end, keep every interval that starts at or after the last kept end.** Keeping the earliest-ending interval leaves the most room for everything after it; swapping it into any optimal solution keeps that solution valid and the same size. Sorting by start is the tempting wrong answer: on `[[1, 100], [2, 3], [4, 5]]` it keeps `[1, 100]` and removes two, where one removal suffices.

```python
def erase_overlap_intervals(intervals: list[list[int]]) -> int:
    removed, last_end = 0, float("-inf")
    for start, end in sorted(intervals, key=lambda iv: iv[1]):
        if start >= last_end:
            last_end = end              # keep it
        else:
            removed += 1                # drop it; last_end stays the earlier end
    return removed
```

Trace `[[1, 4], [2, 3], [3, 5], [4, 6], [5, 9], [6, 7]]`, sorted by end to `[[2, 3], [1, 4], [3, 5], [4, 6], [6, 7], [5, 9]]`, half-open:

| Interval | Last kept end | `start >= last end`? | Action | Removed |
|---|---|---|---|---|
| `[2, 3]` | −∞ | yes | keep; end 3 | 0 |
| `[1, 4]` | 3 | no | remove | 1 |
| `[3, 5]` | 3 | yes | keep; end 5 | 1 |
| `[4, 6]` | 5 | no | remove | 2 |
| `[6, 7]` | 5 | yes | keep; end 7 | 2 |
| `[5, 9]` | 7 | no | remove | 3 |

Three removals, kept `[2, 3], [3, 5], [6, 7]`. On removal `last_end` is not updated: the removed interval sorted later, so it ends no earlier than the kept one.

### Meeting Rooms II

[Meeting Rooms II](/practice/meeting-rooms-ii): the answer is the maximum number of meetings live at once, and that can only change at a start. Trace `min_rooms` on `[[1, 5], [2, 6], [4, 8], [6, 9], [8, 10], [9, 12]]`:

| Meeting | Evict (`end <= start`) | Push | Heap | Rooms | Max |
|---|---|---|---|---|---|
| `[1, 5]` | nothing | 5 | `[5]` | 1 | 1 |
| `[2, 6]` | nothing | 6 | `[5, 6]` | 2 | 2 |
| `[4, 8]` | nothing | 8 | `[5, 6, 8]` | 3 | 3 |
| `[6, 9]` | 5, 6 | 9 | `[8, 9]` | 2 | 3 |
| `[8, 10]` | 8 | 10 | `[9, 10]` | 2 | 3 |
| `[9, 12]` | 9 | 12 | `[10, 12]` | 2 | 3 |

Three rooms: at time 4.5, `[1, 5]`, `[2, 6]` and `[4, 8]` are all running.

```viz
{"type": "heap", "algorithm": "push-pop", "kind": "min", "operations": [["push", 5], ["push", 6], ["push", 8], ["pop"], ["pop"], ["push", 9], ["pop"], ["push", 10], ["pop"], ["push", 12]], "title": "Meeting Rooms II: end times in a min-heap", "caption": "End times of meetings in progress. Each pop is a meeting that has ended before the next start; the heap size is the number of rooms in use."}
```

The two-sorted-lists sweep gives the same count: starts `[1, 2, 4, 6, 8, 9]`, ends `[5, 6, 8, 9, 10, 12]`; starts 1, 2 and 4 each open a room, then 6, 8 and 9 each find `start >= ends[e]` and reuse one. Replacing the eviction `while` with a single `if` still gives the right *maximum* (the heap only grows when its smallest end is live, so every end in it is live), but the heap size then overstates current use, which breaks the follow-up "how many rooms at time `t`?".

### Minimum Interval to Include Each Query

[Minimum Interval to Include Each Query](/practice/minimum-interval-query): for each query point, the length of the shortest interval `[l, r]` (closed, length `r − l + 1`) that contains it, or −1. Per-query scanning is `O(q · n)`. The queries are all known up front, so process them **offline** in sorted order: push each interval once when its start is reached, expire it once when its end falls behind the query.

```python
import heapq

def min_interval(intervals: list[list[int]], queries: list[int]) -> list[int]:
    intervals = sorted(intervals)
    heap, i, ans = [], 0, [-1] * len(queries)
    for qi in sorted(range(len(queries)), key=queries.__getitem__):
        q = queries[qi]
        while i < len(intervals) and intervals[i][0] <= q:
            l, r = intervals[i]
            heapq.heappush(heap, (r - l + 1, r)); i += 1
        while heap and heap[0][1] < q:          # ended before q: useless for every later query
            heapq.heappop(heap)
        if heap:
            ans[qi] = heap[0][0]                # write back by the query's original index
    return ans
```

Trace intervals `[[1, 4], [2, 4], [3, 6], [4, 4]]`, queries `[2, 3, 4, 5]`:

| Query | Pushed `(length, end)` | Expired (`end < q`) | Heap top | Answer |
|---|---|---|---|---|
| 2 | `(4, 4)` from `[1, 4]`, `(3, 4)` from `[2, 4]` | none | `(3, 4)` | 3 |
| 3 | `(4, 6)` from `[3, 6]` | none | `(3, 4)` | 3 |
| 4 | `(1, 4)` from `[4, 4]` | none | `(1, 4)` | 1 |
| 5 | none | `(1, 4)`, `(3, 4)`, `(4, 4)` | `(4, 6)` | 4 |

`O((n + q) log(n + q))`. The expiry is lazy: an expired interval is removed only when it reaches the top, which is safe because queries only increase.

```viz
{"type": "heap", "algorithm": "push-pop", "kind": "min", "operations": [["push", 4], ["push", 3], ["push", 4], ["push", 1], ["pop"], ["pop"], ["pop"]], "title": "Minimum interval per query: lengths in a min-heap", "caption": "Interval lengths in the query heap. Queries 2 to 4 push four intervals; query 5 pops the three whose ends fell behind it, and the remaining top, 4, is the answer."}
```

### Partition Labels, a hidden interval problem

[Partition Labels](/practice/partition-labels): split a string into as many parts as possible so each letter appears in only one part. Each letter spans `[first, last]`; the parts are the merged intervals. Because a left-to-right scan visits starts in order, you merge without sorting: track the farthest `last` seen, and cut when the index reaches it.

```python
def partition_labels(s: str) -> list[int]:
    last = {ch: i for i, ch in enumerate(s)}     # each letter's interval end
    sizes, start, end = [], 0, 0
    for i, ch in enumerate(s):
        end = max(end, last[ch])                 # extend the current merged interval
        if i == end:                             # no letter in the part reaches further
            sizes.append(i - start + 1)
            start = i + 1
    return sizes
```

Trace `"abaccbdeffed"`:

| `i` | char | `last[ch]` | `end` | Cut? |
|---|---|---|---|---|
| 0 | a | 2 | 2 | |
| 1 | b | 5 | 5 | |
| 2–4 | a, c, c | 2, 4, 4 | 5 | |
| 5 | b | 5 | 5 | yes: size 6 |
| 6 | d | 11 | 11 | |
| 7–10 | e, f, f, e | 10, 9, 9, 10 | 11 | |
| 11 | d | 11 | 11 | yes: size 6 |

Answer `[6, 6]`.

## Variants

| Variant | What changes | Cost |
|---|---|---|
| Union / merge | sort by start; extend with `max` | `O(n log n)` |
| Insert into sorted disjoint list | three-phase walk, no sort | `O(n)` |
| Maximum non-overlapping, arrows, removals | sort by end; count keeps | `O(n log n)` |
| Remove covered intervals | sort by `(start, −end)`; keep if end exceeds running max | `O(n log n)` |
| Peak concurrency | heap of ends, two sorted lists, or events with an end-first tie rule | `O(n log n)` |
| Peak with small integer coordinates | difference array | `O(n + range)` |
| Which room each meeting gets | heap of `(end, room_id)` | `O(n log n)` |
| Offline point queries | sort queries; heap with lazy expiry | `O((n + q) log(n + q))` |
| Overlap count for every interval | `#starts ≤ e − #ends < s − 1` via `bisect` on sorted starts and ends | `O(n log n)` |
| Weighted selection | DP by end + binary search | `O(n log n)` |
| Online bookings | sorted list + `bisect`, or a balanced tree | `O(log n)` search per booking |

## When the greedy stops: weighted intervals

The follow-up that changes the pattern is a value on each interval: "maximise the total value of meetings you attend". Sorting by end and keeping greedily maximises the *count*, and one valuable interval can be worth more than several cheap ones. The fix keeps the sort by end and replaces the greedy with a DP over the sorted order: `dp[i]` is the best value using the first `i` intervals, and interval `i` either is skipped (`dp[i − 1]`) or taken together with the best solution among the intervals that end at or before its start. Those form a prefix of the sorted list, so a binary search on the sorted ends finds it.

```python
from bisect import bisect_right

def max_value(intervals: list[tuple[int, int, int]]) -> int:
    """intervals are (start, end, value), half-open."""
    iv = sorted(intervals, key=lambda t: t[1])
    ends = [e for _, e, _ in iv]
    dp = [0] * (len(iv) + 1)
    for i, (s, e, v) in enumerate(iv, start=1):
        p = bisect_right(ends, s, 0, i - 1)      # how many earlier intervals end <= s
        dp[i] = max(dp[i - 1], v + dp[p])         # skip it, or take it after the best compatible prefix
    return dp[-1]
```

Trace on `(start, end, value)` = `(1, 3, 5), (2, 5, 6), (4, 6, 5), (6, 7, 4), (5, 8, 11), (7, 9, 2)`, already in end order:

| `i` | interval | compatible prefix `p` | skip: `dp[i − 1]` | take: `v + dp[p]` | `dp[i]` |
|---|---|---|---|---|---|
| 1 | `(1, 3, 5)` | 0 | 0 | 5 | 5 |
| 2 | `(2, 5, 6)` | 0 | 5 | 6 | 6 |
| 3 | `(4, 6, 5)` | 1 | 6 | 5 + 5 = 10 | 10 |
| 4 | `(6, 7, 4)` | 3 | 10 | 4 + 10 = 14 | 14 |
| 5 | `(5, 8, 11)` | 2 | 14 | 11 + 6 = 17 | 17 |
| 6 | `(7, 9, 2)` | 4 | 17 | 2 + 14 = 16 | 17 |

The answer is 17, from `(2, 5)` and `(5, 8)`. The unweighted greedy keeps the four intervals ending at 3, 6, 7 and 9, worth 16: the most intervals, not the most value. The cost is `O(n log n)`, the same as the greedy, and the signal is the word "value" or "weight" next to an interval. The DP pattern itself is in [DP patterns](/learn/interview-patterns/combinatorial-patterns/dp-patterns).

## Complexity, derived

The sort is `O(n log n)`. The merge sweep does one comparison per interval: `O(n)`. The heap sweep pushes each end once and pops it at most once, `2n` heap operations of `O(log k)` each for a peak of `k` rooms, so `O(n log k)`, bounded by the sort. The two-lists sweep advances `e` at most `n` times across the whole loop: `O(n)` after two sorts. The offline query sweep pushes and pops each interval at most once and sorts both inputs: `O((n + q) log(n + q))`. Space is `O(n)` for a sorted copy, `O(k)` for the heap.

| Approach for "peak concurrency" | Time | Extra memory | Online updates | Answers |
|---|---|---|---|---|
| Pairwise comparison | `O(n²)` | `O(1)` | yes | peak, slowly |
| Heap of ends | `O(n log n)` | `O(k)` | append in start order | peak; which room each meeting uses |
| Two sorted lists | `O(n log n)` | `O(n)` | no | peak only |
| Events with a tie rule | `O(n log n)` | `O(n)` | no | load at every event time |
| Difference array | `O(n + range)` | `O(range)` | yes, if the range is small | load at every time slot |
| Interval tree or database range index | `O(log n + m)` per query | `O(n)` | yes | overlaps of any query |

## Under the hood

Measured on CPython 3.14.7 and Node 24.21, AMD Ryzen 9 9950X3D: one million synthetic requests, starts rising by 0–2 ms, durations exponential with a 200 ms mean, times in integer microseconds.

### Log-ordered data is nearly sorted

A request log is written when each request *finishes*, so it arrives sorted by end. Sorted by start, the same list is nearly sorted: in this data no request was more than 3,149 positions from its place in start order. Timsort finds the long ascending runs and merges them:

| Input order (10⁶ intervals) | CPython `key=itemgetter(0)` | CPython, no key | CPython `key=lambda` | Node, pairs + comparator |
|---|---|---|---|---|
| random | 329 ms | 967 ms | 404 ms | 402 ms |
| log order (sorted by end) | 156 ms | 218 ms | 187 ms | 120 ms |
| already sorted by start | 23 ms | 19 ms | 27 ms | 13 ms |

Two lessons. Sorting a log by start costs about half as much as sorting random data, so never skip the sort on the grounds that "logs are already sorted": they are sorted by the wrong endpoint. And `sorted(intervals)` with no key, which compares the inner lists lexicographically, was three times slower than `key=itemgetter(0)` on random data: every list comparison goes through the generic rich-comparison path element by element, while an `int` key lets CPython's pre-sort check select its specialised integer comparison. `itemgetter` also beats a `lambda` because it is a C function.

### Room counting, measured

| Method (10⁶ random intervals) | Time |
|---|---|
| CPython: heap of ends | 451 ms |
| CPython: two sorted lists | 777 ms |
| CPython: `(time, delta)` events, one sort | 1,866 ms |
| Node: two sorted lists of plain arrays with a comparator | 418 ms |
| Node: two sorted `Float64Array`s | 170 ms |

In CPython the heap version wins because the heap stays small (peak concurrency here was about 250) and `heapq` runs in C, while the two-lists version pays for two full sorts and the event version builds and sorts two million tuples with a tuple key. In V8 the ranking flips: typed arrays sort natively, so the two-lists sweep is the fast one. The algorithm is the same; the runtime decides which encoding is cheap.

### At scale

A calendar or booking service answers "does this overlap anything?" per insert, not with a batch sweep; PostgreSQL range types with a GiST index and an exclusion constraint do it transactionally ([indexes](/learn/databases/relational-fundamentals/indexes)). Batch questions over request spans (peak concurrency per minute, which requests overlapped an incident window) are this lesson's sweep over millions of events.

## Failure modes

**A concurrency dashboard under-reports during incidents.** *Symptom:* peak concurrent requests per minute look low exactly when latency is high. *Diagnosis:* the job skipped the sort because "the log is sorted", but the log is ordered by end time; long requests appear late, and the sweep closed them before seeing their starts. *Fix:* sort by start, which on log-ordered data costs half a random sort.

**Double bookings at the boundary.** *Symptom:* two meetings share a room from 10:00 to 10:00; or the reverse, back-to-back meetings are refused. *Diagnosis:* one service stores closed `[start, end]` minutes and another half-open `[start, end)`, and each uses its own comparison. *Fix:* normalise to half-open at the API boundary, and write the convention next to every overlap test.

**Negative-length intervals after a clock change.** *Symptom:* around a daylight-saving fall-back, a meeting from 01:50 to 01:10 appears; merges produce intervals with `end < start`, and room counts go wrong. *Diagnosis:* intervals were stored in local wall-clock time. *Fix:* store UTC instants, and reject `start > end` at ingestion with an error rather than letting the sweep absorb it.

**The merge result shrinks.** *Symptom:* `[[1, 10], [2, 3]]` merges to `[[1, 3]]`. *Diagnosis:* the extension assigned `end` instead of `max(last_end, end)`. *Fix:* `max`, and a test with a contained interval.

**Query answers name intervals that do not contain the query.** *Symptom:* Minimum Interval Query returns 1 for query 5 in the trace above. *Diagnosis:* no expiry loop, so `[4, 4]` stays on top. *Fix:* pop while the top's end is below the query before reading it.

## Interviewer follow-ups

**"Now bookings arrive one at a time, and each must be accepted or rejected immediately."** Model answer: keep accepted intervals sorted and disjoint; `bisect` for the first interval whose start is at least the new start, and check it and its predecessor for overlap, `O(log n)`. Inserting into a Python list is `O(n)` for the shift, so a balanced tree or a sorted container gives `O(log n)` inserts; in production, a database exclusion constraint. Common wrong answer: re-sorting and re-merging on every request.

**"Now some intervals have `start > end`" or "negative coordinates".** Model answer: negative coordinates change nothing for comparison sweeps (a difference array needs an offset); `start > end` is invalid input, so decide with the interviewer whether to reject or swap, and never let the sweep see it. Common wrong answer: assuming the sort will sort it out.

**"Coordinates go up to 10⁹."** Model answer: the difference array is out (10⁹ slots is gigabytes); sort the `2n` endpoints, or compress coordinates to `0 … 2n − 1` and use the difference array on the compressed indices. Common wrong answer: allocating an array indexed by time.

**"For every interval, how many others does it overlap?"** Model answer: sort starts and ends separately; closed intervals overlapping `[s, e]` are those with start `≤ e` and end `≥ s`, so count `bisect_right(starts, e) − bisect_left(ends, s) − 1`, `O(n log n)` for all. Common wrong answer: the `O(n²)` pairwise loop, or the sweep that finds only the peak.

**"Each meeting has a value; maximise the total value you can attend."** Model answer: the greedy by end is now wrong; sort by end, `dp[i] = max(dp[i − 1], value[i] + dp[j])` where `j` is the last interval ending at or before `start[i]`, found by binary search: `O(n log n)`. Common wrong answer: greedy by value or by value per unit length.

## What mid-level engineers get wrong

- **Sorting by start for the removal problem.** Consequence: `[[1, 100], [2, 3], [4, 5]]` removes two instead of one.
- **Deciding the boundary convention implicitly.** Consequence: `<` in one place and `<=` in another, and off-by-one peaks on back-to-back meetings.
- **Assigning `end` instead of `max`.** Consequence: contained intervals shrink the merge.
- **Re-sorting input that was promised sorted.** Consequence: Insert Interval at `O(n log n)`, and the interviewer notes you missed the constraint.
- **Mutating the caller's intervals.** Consequence: `merged.append(iv)` followed by `merged[-1][1] = …` changes the input list.
- **Missing the hidden intervals.** Consequence: Partition Labels and Jump Game II get backtracking or DP instead of a five-line sweep.

## Exercises

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

```exercise
id: overlap-counts
title: How many other intervals does each one overlap?
prompt: |
  Given closed intervals `[start, end]` (with `start <= end`), return a list
  whose i-th entry is the number of OTHER intervals that share at least one
  point with interval i. Touching counts: `[1, 3]` and `[3, 5]` overlap.

  Do not compare every pair. Two closed intervals overlap exactly when each
  starts no later than the other ends; sort the starts and the ends
  separately and count with binary search. Aim for O(n log n).
languages: [python, javascript]
entry: overlap_counts
starter:
  python: |
    from bisect import bisect_left, bisect_right

    def overlap_counts(intervals):
        # your code here
        return []
  javascript: |
    function overlap_counts(intervals) {
      // your code here (write a small lower/upper bound helper)
      return [];
    }
tests:
  - args: [[[1, 3], [2, 5], [6, 8]]]
    expected: [1, 1, 0]
  - args: [[[1, 3], [3, 5]]]
    expected: [1, 1]
    label: touching intervals overlap
  - args: [[]]
    expected: []
    label: empty input
  - args: [[[4, 4]]]
    expected: [0]
    label: a single point interval
  - args: [[[1, 10], [2, 3], [4, 5], [11, 12]]]
    expected: [2, 1, 1, 0]
  - args: [[[1, 2], [1, 2], [1, 2]]]
    expected: [2, 2, 2]
    hidden: true
    label: duplicates overlap each other but not themselves
  - args: [[[5, 9], [1, 4], [4, 5], [9, 20], [21, 22]]]
    expected: [2, 1, 2, 1, 0]
    hidden: true
hints:
  - "Interval [s, e] overlaps [s2, e2] exactly when s2 <= e and e2 >= s."
  - "With sorted starts S and sorted ends E: the intervals with start <= e number bisect_right(S, e); among those, the ones with end < s number bisect_left(E, s), and all of them fail. Subtract, then subtract 1 for the interval itself."
  - "An interval with end < s necessarily has start <= e too, so the subtraction never removes an interval that was not counted."
```

## Senior signals

- You ask about the **boundary convention** before writing any comparison, and your sort key, overlap test and event tie rule all agree with it.
- You state **which endpoint you sort by and why** (start for merging and counting, end for keeping the most) and can produce the three-interval input where the wrong choice fails.
- You spot **hidden intervals**: letter spans in Partition Labels, reach in Jump Game II, busy slots across schedules.
- You recognise **offline query processing**: sorting the queries is allowed because they are all known, and lazy expiry is safe because queries only increase.
- You pick the **encoding by runtime**: a small `heapq` heap in CPython, two typed arrays in V8, and `key=itemgetter(0)` instead of comparing interval lists.
- You treat "the log is sorted" with suspicion: sorted by end is not sorted by start, and re-sorting it is cheap.

## Check yourself

```quiz
- q: >-
    To keep the maximum number of non-overlapping intervals, you sort by end time and keep greedily. Why is sorting by start time wrong?
  options: ["Start order fails only when several intervals share the same start", "An early start can be a long interval that blocks many short ones", "It is not wrong; both orders keep the same number of intervals", "Start order is fine for the count but cannot name which to remove"]
  answer: 1
  explanation: >-
    On [[1,100],[2,3],[4,5]] the start-time greedy keeps [1,100] and removes two, while the optimum removes one. The exchange argument shows the earliest-ending interval belongs to some optimal solution and leaves the most room for the rest; no such argument exists for the earliest-starting one.
- q: >-
    A job computes peak concurrent requests from an access log without sorting it, because the log is already in time order. Peaks come out too low. Why?
  options: ["Access logs interleave hosts, so timestamps are only sorted per host", "Each line is written at completion, so the log is ordered by end", "The sweep needs half-open intervals and the log stores closed ones", "Timsort was skipped, so the heap receives its ends in reverse order"]
  answer: 1
  explanation: >-
    Each line is written when the request finishes, so long requests appear after short ones that started later. A sweep that assumes start order closes intervals before it has seen all of their overlapping starts. Sorting by start fixes it, and because the data is nearly sorted it cost about half a random sort in the measurements. Host interleaving and boundary conventions can cause other bugs, but not this systematic undercount.
- q: >-
    In CPython, sorting a million [start, end] lists with no key took 967 ms, and with key=itemgetter(0) took 329 ms. What explains the gap?
  options: ["The keyless sort also compares ends, which doubles the number of comparisons", "List comparison is generic per element; int keys use the specialised compare", "itemgetter caches each start, so repeated comparisons avoid list indexing", "Without a key Timsort cannot detect runs, so it falls back to plain merges"]
  answer: 1
  explanation: >-
    Comparing two lists goes through the generic rich comparison, element by element. With an int key, CPython's pre-sort check sees that every key is an int and uses a specialised integer comparison, and itemgetter extracts keys in C. Ends are compared only on equal starts, keys are computed once per element for any key function, and run detection works either way.
- q: >-
    Meetings are half-open [start, end). In an event sweep with +1 at each start and -1 at each end, how must ties at the same time be ordered?
  options: ["Starts before ends, so the new meeting is counted straight away", "Ends first, so the room is freed before the count rises", "No rule is needed, since half-open intervals can never tie", "Either order, since a tie can never change the maximum count"]
  answer: 1
  explanation: >-
    If the start is processed first, the counter briefly counts both meetings and over-reports the peak by one. Releasing first matches the convention that the room is free at the exact end time. With closed intervals that touch, the order flips.
- q: >-
    Minimum Interval to Include Each Query has n intervals and q queries. What makes the O((n + q) log(n + q)) solution valid?
  options: ["All queries are known up front, so you may answer them sorted", "The queries are integers, so they can be bucketed by coordinate", "The intervals fit in a segment tree built once over all endpoints", "The intervals never overlap, so each query hits at most one"]
  answer: 0
  explanation: >-
    Sweeping queries in increasing order lets each interval be pushed once, when its start is reached, and expired once, when its end falls behind the query; results are written back by original index. That amortisation depends on choosing the query order. If queries had to be answered as they arrived, you would need an interval tree or segment tree instead.
- q: >-
    Partition Labels asks for as many parts as possible so each letter appears in one part. Which view solves it in one pass?
  options: ["A sliding window that shrinks whenever a letter would appear twice", "Backtracking over cut positions, pruned when a letter spans a cut", "Sort the letters by frequency and cut after each letter's final copy", "Each letter spans [first, last]; merge spans and cut where they end"]
  answer: 3
  explanation: >-
    Every letter defines an interval from its first to its last occurrence, and a part is a merged block of those intervals. Scanning left to right visits interval starts in order, so tracking the farthest last index and cutting when i reaches it merges without a sort. Frequency order is irrelevant, the window condition does not describe the parts, and backtracking is exponential for a linear problem.
```
