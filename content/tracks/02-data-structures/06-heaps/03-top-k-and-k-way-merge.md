---
slug: top-k-and-k-way-merge
title: "Top-k, k-way merge and the streaming median"
description: The three problem families a heap owns outright, why the top-k heap is the size of k and not n, how to merge a thousand sorted streams in one pass and how external sorts and LSM compactions size that merge, the two-heap trick that tracks a median online, and what breaks when you distribute any of them.
minutes: 45
difficulty: medium
tags: [heaps, top-k, k-way-merge, two-heaps, median, streaming]
problems: [top-k-frequent, k-closest-points, kth-largest-array, merge-k-sorted-lists, kth-smallest-sorted-matrix, find-median-data-stream, smallest-range-k-lists]
---
"Give me the 10 most viewed videos out of 200 million." "Merge these 500 sorted log shards into one timeline." "What is the median latency so far?" Each of these has an obvious answer that sorts everything, and each has a heap answer that is faster by a factor of log(n)/log(k), uses memory proportional to `k` instead of `n`, and works on a stream you can only see once. The three families are close cousins: they all use a heap of *bounded* size as a window onto an unbounded input.

## Top-k: a heap of size k, of the opposite kind

Find the `k` largest of `n` items. Sorting is O(n log n) and needs all `n` in memory. The heap approach keeps only `k` candidates:

1. Maintain a **min**-heap of size `k`.
2. For each item: if the heap has fewer than `k` entries, push. Otherwise, if the item is larger than the heap's minimum (the *weakest* of the current top `k`), pop the minimum and push the item.
3. At the end the heap holds the `k` largest.

The kind of heap is the counter-intuitive part and the part interviewers probe. You want the `k` **largest**, so you keep a **min**-heap: its root is the smallest of your candidates, which is exactly the element that should be evicted when something better arrives. A max-heap of size `k` would tell you the best candidate, which you never need to know mid-stream.

```python
import heapq

def top_k(items, k):
    heap = []
    for x in items:
        if len(heap) < k:
            heapq.heappush(heap, x)
        elif x > heap[0]:
            heapq.heapreplace(heap, x)   # pop min, push x in one sift
    return sorted(heap, reverse=True)
```

Trace with `k = 3` on the stream 4, 9, 1, 7, 3, 8, 2, 6. The heap is shown in array order; the root is the current eviction candidate:

| Item | Root before | Decision | Heap after |
|---|---|---|---|
| 4 | — | fewer than 3, push | `[4]` |
| 9 | 4 | fewer than 3, push | `[4, 9]` |
| 1 | 4 | fewer than 3, push | `[1, 9, 4]` |
| 7 | 1 | 7 > 1, replace root | `[4, 9, 7]` |
| 3 | 4 | 3 ≤ 4, reject in O(1) | `[4, 9, 7]` |
| 8 | 4 | 8 > 4, replace root | `[7, 9, 8]` |
| 2 | 7 | reject | `[7, 9, 8]` |
| 6 | 7 | reject | `[7, 9, 8]` |

Result 9, 8, 7. Three of the eight items touched the heap after it filled; the rest cost one comparison each.

```viz
{"type": "heap", "algorithm": "top-k", "kind": "min", "k": 3, "values": [4, 9, 1, 7, 3, 8, 2, 6],
 "title": "Top-3 with a min-heap of size 3", "caption": "The root is the weakest of the current best three. An incoming value either loses to it in O(1) or replaces it in O(log k)."}
```

### How few items actually enter the heap

Cost: each of `n` items does at most one O(log k) operation, so O(n log k) time and O(k) space. On a stream in random order the real count is far lower. The `i`-th item enters the heap only if it is among the `k` largest of the first `i`, which has probability `k / i` for random order, so the expected number of heap operations is about `k · ln(n / k) + k`. For `n = 2 × 10⁸` and `k = 10` that is about 180 heap operations in total; the other 200 million items cost a single comparison against `heap[0]`. Measured: 105 heap operations for 100,000 random floats with `k = 10` (the formula gives 102), and 744 for `k = 100` (formula 791). The worst case is an **ascending** stream, where every item beats the root and the cost is the full `n log k`; a feed sorted by the very key you rank on, such as a timestamp-ordered log ranked by timestamp, is that worst case.

### Variants that are the same problem

- **k smallest**: max-heap of size `k`.
- **k most frequent**: count with a hash map (O(n)), then top-k over the `(count, value)` pairs (O(m log k) for `m` distinct values). Two passes, and the counting pass usually dominates. When the values are bounded (counts are at most `n`), bucket sort by count is O(n) and needs no heap.
- **k closest points to the origin**: max-heap of size `k` keyed by squared distance (skip the square root; it is monotonic and slow).
- **k-th largest element**: same heap, answer is the root at the end. But if all `n` are in memory, **quickselect** finds it in O(n) average; the heap is for streams or when `k` is tiny relative to `n`.
- **Python shortcut**: `heapq.nlargest(k, items, key=…)` and `nsmallest` implement exactly this loop in C. See "Under the hood" for what they do differently from the code above.

When `k` is close to `n`, the log k advantage disappears and sorting is simpler; when `k = 1`, a single running maximum is O(n) and no heap is needed. The heap is for `1 < k ≪ n`.

## K-way merge: a heap of one head per stream

You have `k` sorted sequences and want one sorted sequence. Concatenate and sort is O(N log N) for `N` total elements. Pairwise merging (merge 1 and 2, then the result with 3, …) is O(N k) because early elements get copied `k` times. The heap solution is O(N log k):

1. Push the first element of each sequence into a min-heap, tagged with which sequence it came from.
2. Pop the minimum; emit it; push the *next* element from the same sequence.
3. Repeat until the heap is empty.

The heap never holds more than `k` entries, one per sequence, so each of the `N` pops and pushes is O(log k).

```python
import heapq

def merge_k(lists):
    heap = [(lst[0], i, 0) for i, lst in enumerate(lists) if lst]
    heapq.heapify(heap)
    out = []
    while heap:
        val, i, j = heapq.heappop(heap)
        out.append(val)
        if j + 1 < len(lists[i]):
            heapq.heappush(heap, (lists[i][j + 1], i, j + 1))
    return out
```

The tuple `(val, i, j)` carries the sequence index and the position, and `i` also serves as the tiebreaker so that equal values never fall through to comparing something unorderable. Trace on `[1, 4, 5]`, `[1, 3, 4]`, `[2, 6]`; the heap column is the sorted view of its contents:

| Pop | Push (next from that list) | Heap after | Output so far |
|---|---|---|---|
| (1, list 0, pos 0) | (4, 0, 1) | `(1,1,0) (2,2,0) (4,0,1)` | 1 |
| (1, 1, 0) | (3, 1, 1) | `(2,2,0) (3,1,1) (4,0,1)` | 1 1 |
| (2, 2, 0) | (6, 2, 1) | `(3,1,1) (4,0,1) (6,2,1)` | 1 1 2 |
| (3, 1, 1) | (4, 1, 2) | `(4,0,1) (4,1,2) (6,2,1)` | 1 1 2 3 |
| (4, 0, 1) | (5, 0, 2) | `(4,1,2) (5,0,2) (6,2,1)` | 1 1 2 3 4 |
| (4, 1, 2) | list 1 exhausted | `(5,0,2) (6,2,1)` | … 4 4 |
| (5, 0, 2) | list 0 exhausted | `(6,2,1)` | … 5 |
| (6, 2, 1) | list 2 exhausted | empty | 1 1 2 3 4 4 5 6 |

Eight pops, five pushes, and the heap never held more than three entries.

### External sort: sizing the merge

This is the merge step of **external sorting**: sort chunks that fit in memory, write each as a sorted *run*, then k-way merge the runs reading one buffer per run. Size it for a 100 GB file with 1 GB of memory: 100 runs of 1 GB each, then a 100-way merge. Each run needs a read buffer; at 4 MB per buffer the merge holds 400 MB of buffers plus a heap of 100 entries, and every byte is read twice and written twice, once to make runs and once to merge them. If the buffers do not fit (10,000 runs at 4 MB is 40 GB), the merge becomes multi-pass: merge groups of runs into larger runs, then merge those, each pass reading and writing the whole file again. GNU `sort` merges 16 temporary files at a time by default (`--batch-size`), so more than 16 runs means a second pass. PostgreSQL spills a sort to disk when it exceeds `work_mem` (default 4 MB) and merges the runs with the same heap loop, which is why raising `work_mem` for a big `ORDER BY` can remove a pass from the plan.

### Where it runs in production

LSM-tree databases (RocksDB, Cassandra) **compact** several sorted SSTables into one with exactly this loop; RocksDB's `MergingIterator` is a min-heap over the input iterators, and the [LSM lesson](/learn/advanced-data-structures/log-structured-and-disk-structures/lsm-trees-and-sstables) covers when compaction runs. The same loop merges `k` sorted Kafka partitions by timestamp, `k` sorted posting lists in a search engine, and `k` per-shard result pages in a distributed query. Elasticsearch has each shard return its top `from + size` hits and the coordinator merge them with a heap; that is why deep pagination is bounded by `index.max_result_window` (10,000 by default): page 1,000 of size 10 (`from` = 9,990) over 5 shards means each shard returns 10,000 hits and the coordinator merges 50,000 entries to keep 10, and one page further is refused. Python exposes the loop as `heapq.merge`, which is lazy: it yields elements without materialising the output, so you can merge streams that do not fit in memory.

The variants: **k-th smallest in a sorted matrix** is a k-way merge over rows that stops after `k` pops. **Smallest range covering one element from each list** is a k-way merge that tracks the current maximum alongside the heap minimum; the range is `[min, max]` and it shrinks as you advance the minimum's list.

## The streaming median: two heaps

The median of a stream after each element, with no ability to re-read the stream. Sorting after every arrival is O(n log n) per element. A balanced BST with subtree sizes works at O(log n) per element but is heavy. The elegant answer uses two heaps as a **balanced partition**:

- A **max**-heap `low` holding the smaller half of the values seen so far.
- A **min**-heap `high` holding the larger half.
- Invariant 1: every element of `low` ≤ every element of `high`.
- Invariant 2: `len(low) == len(high)` or `len(low) == len(high) + 1`.

Then the median is `low`'s root when the count is odd, and the average of the two roots when it is even. Both roots are O(1) to read.

Inserting a value `x` must preserve both invariants. The clean way: always push into `low` first, then move `low`'s maximum into `high` (this guarantees invariant 1 whatever `x` was), then if `high` is now bigger, move its minimum back to `low` (restoring invariant 2). Two or three O(log n) heap operations, no case analysis.

```python
import heapq

class RunningMedian:
    def __init__(self):
        self.low = []    # max-heap via negation
        self.high = []   # min-heap

    def add(self, x):
        heapq.heappush(self.low, -x)
        heapq.heappush(self.high, -heapq.heappop(self.low))
        if len(self.high) > len(self.low):
            heapq.heappush(self.low, -heapq.heappop(self.high))

    def median(self):
        if len(self.low) > len(self.high):
            return -self.low[0]
        return (-self.low[0] + self.high[0]) / 2
```

### Six inserts, traced

Trace on 5, 16, 1, 4, 9, 2. Each row shows the heaps after the three-step insert, largest of `low` first and smallest of `high` first:

| Add | Step 1: push to low | Step 2: move low's max to high | Step 3: rebalance | low / high | Median |
|---|---|---|---|---|---|
| 5 | low {5} | low {}, high {5} | high bigger, move 5 back | {5} / {} | 5 |
| 16 | low {16, 5} | low {5}, high {16} | sizes 1 and 1, nothing | {5} / {16} | 10.5 |
| 1 | low {5, 1} | low {1}, high {5, 16} | move 5 back | {5, 1} / {16} | 5 |
| 4 | low {5, 4, 1} | low {4, 1}, high {5, 16} | sizes 2 and 2 | {4, 1} / {5, 16} | 4.5 |
| 9 | low {9, 4, 1} | low {4, 1}, high {5, 9, 16} | move 5 back | {5, 4, 1} / {9, 16} | 5 |
| 2 | low {5, 4, 2, 1} | low {4, 2, 1}, high {5, 9, 16} | sizes 3 and 3 | {4, 2, 1} / {5, 9, 16} | 4.5 |

Row 5 shows why the push-then-move sequence matters: 9 belongs in `high`, and it gets there without a comparison, because pushing it into `low` and moving `low`'s maximum across sends whichever value is largest, which is 9.

```viz
{"type": "heap", "algorithm": "two-heaps-median", "values": [5, 16, 1, 4, 9, 2],
 "title": "Running median with two heaps", "caption": "The max-heap holds the lower half, the min-heap the upper half, sizes kept within one. The median is read from the roots."}
```

The generalisation is the **two-heaps pattern**: any time you need the boundary between the "smaller" and "larger" parts of a changing set (a percentile, the k-th smallest in a stream, the split in a scheduling problem), two heaps facing each other maintain that boundary in O(log n). The [two heaps pattern lesson](/learn/interview-patterns/sequence-patterns/two-heaps) works through the variants. The limitation is deletion: a **sliding-window median** must remove the element leaving the window, which a plain heap cannot do; the fix is lazy deletion, the subject of the [next lesson](/learn/data-structures/heaps/indexed-heaps-and-decrease-key).

## Under the hood

### `heapq.nlargest`, `nsmallest` and `merge`

CPython's `nlargest(k, it)` special-cases `k == 1` to `max()` and `k >= len(it)` to `sorted(it, reverse=True)[:k]`, then runs the size-`k` heap loop over `(value, order)` tuples where `order` is a counter that *decreases* for `nlargest` and increases for `nsmallest`. The counter makes the result **stable**: among equal values, earlier items win, and ties never fall through to comparing the payload. It heapifies the first `k` entries in O(k) rather than pushing them, and the `key=` function is called once per item, not once per comparison. The result is sorted before return, so the total is O(n log k + k log k).

`heapq.merge(*iterables, key=None, reverse=False)` builds one `[value, order, next_method]` list per input, heapifies, and after each yield calls `heapreplace` with the input's next value, or `heappop` when the input is exhausted. It holds `k` small lists and nothing else, so merging a thousand multi-gigabyte sorted files through it costs a thousand file buffers and a heap of a thousand entries. A single input short-circuits to yielding it directly.

### Selection instead of a heap

When all `n` items are in memory and you need the `k` largest without ordering them, **quickselect** partitions around a pivot and recurses into one side: expected O(n) with roughly 2–3 comparisons per element, against the heap's `n log k`. Every systems library ships it with a worst-case guard (introselect: switch to a median-of-medians or heap-based selection when recursion gets deep): C++ `std::nth_element`, Rust `select_nth_unstable`, NumPy `np.partition`. The [order statistics lesson](/learn/algorithms/sorting-searching/selection-and-order-statistics) has the mechanics. For `k = 10` out of 10⁸ in memory, the heap does 10⁸ comparisons against the root plus about 170 heap operations, and quickselect does about 2–3 × 10⁸ comparisons plus writes for the partition; the heap wins, streams or not. For `k = n/2`, quickselect's O(n) beats the heap's O(n log n).

### Sketches for percentiles

A latency dashboard that shows p50 and p99 does not keep every sample in two heaps. It keeps a **t-digest** (clusters of samples whose sizes shrink toward the tails, a few kilobytes at a compression of 100, which the reference implementation calls a common value for normal use, more accurate at the extremes than in the middle) or an **HdrHistogram** (fixed buckets with a configured number of significant digits, tens to hundreds of kilobytes depending on the value range and precision, exact within the configured precision). Both are **mergeable**: two machines' digests combine into one that answers global quantiles, which two exact heaps cannot do without shipping every sample. Netflix's Spectator metrics library records percentile timers as a fixed set of bucket counters for the same reason: counters add across thousands of instances, medians do not. The two-heap median is exact and unmergeable. Know both and say which you would ship.

## Choosing between the three, and their alternatives

| Problem | Heap solution | Time | Space | Exact | Streaming | Mergeable across machines | When something else is better |
|---|---|---|---|---|---|---|---|
| k largest of n | min-heap of size k | O(n log k), about k ln(n/k) heap ops on random order | O(k) | yes | yes | yes for top-k by score; no for top-k by frequency | quickselect O(n) if all in memory and k is large; sort if k ≈ n; bucket sort for bounded counts |
| merge k sorted streams | min-heap of k heads | O(N log k) | O(k) plus one buffer per stream | yes | yes | n/a | k = 2: two-pointer merge; tiny k: linear scan of heads |
| running median or percentile | two heaps | O(log n) per insert | O(n) | yes | yes | no | t-digest or HdrHistogram when n is huge or results must merge; sorted list with bisect for small n |

## Production failure modes

**Top-k over a feed sorted by the ranking key.** Symptom: a "top 10 by timestamp" job takes several times longer than the same job over a different field, with no error. Diagnosis: ascending input makes every item beat the root, so the loop performs `n` heap replacements instead of about `k ln(n/k)`. Fix: none needed for correctness; budget for `n log k`, or if the input is known sorted, take the last `k` directly.

**Wrong answers from distributed top-k by frequency.** Symptom: the global "most frequent" list misses items that are popular everywhere but top-k nowhere. Diagnosis: with shard 1 counting a:5, b:4, c:3 and shard 2 counting d:5, c:3, b:1, each shard's local top-2 is {a, b} and {d, c}; the true global leader is c with 6, present in both shards' data but in neither's top-2 with the count needed. Local top-k by an *additive* score is not composable. Fix: each shard returns its full count table, or a mergeable sketch such as [Count-Min](/learn/advanced-data-structures/probabilistic-structures/count-min-sketch-and-hyperloglog) plus candidates, or a second round that asks every shard for the counts of the union of candidates. Top-k by a per-item score (the 10 highest-rated videos) *is* composable: the global top-k is within the union of local top-ks.

**Head-of-line blocking in a scatter-gather merge.** Symptom: p99 query latency equals the slowest shard's latency, every time. Diagnosis: the k-way merge cannot emit an element until every stream has offered its head, so one slow shard stalls the output. Fix: per-shard timeouts with partial results and a flag in the response, or adaptive replica selection so a slow shard is bypassed.

**Averaging medians across machines.** Symptom: a global p50 that is smooth and wrong. Diagnosis: quantiles are not additive; the mean of 500 per-machine medians is not the median of the union. Fix: a mergeable sketch per machine, merged at the coordinator.

**Sliding-window median with plain heaps.** Symptom: either O(n) per step (rebuilding) or a median that drifts after the first eviction. Diagnosis: the value leaving the window cannot be removed from a plain heap, so it stays in the partition and skews the balance. Fix: lazy deletion with live counts driving the balance invariant, or a balanced multiset.

**External merge that thrashes.** Symptom: a sort job's disk reads jump to several times the input size. Diagnosis: more runs than the merge fan-in allows, so the merge went multi-pass, or the per-run buffers exceeded memory and the OS started paging. Fix: larger in-memory runs (fewer of them), a larger fan-in with smaller buffers, or, for a database, raising `work_mem` for that query.

## Interviewer follow-ups

**"k-th largest of an unsorted array of 10⁷ integers in memory: heap or quickselect?"** Model answer: quickselect, expected O(n) with a worst-case guard; the size-k heap is O(n log k) and only wins when the data is a stream or `k` is tiny. Common wrong answer: "sort it", O(n log n) for a question that has an O(n) answer.

**"Each of 100 shards returns its top 10 by score. Is the merged top 10 correct?"** Model answer: yes, because any item in the global top 10 is in the top 10 of its own shard; but the same argument fails for top 10 by *count*, where an item's global count is spread across shards. Common wrong answer: "yes for both".

**"Merge 1,000 sorted files of 1 GB each with 4 GB of RAM."** Model answer: one pass needs 1,000 buffers; at 1 MB each that fits with room for the heap, so a single 1,000-way merge reads and writes the 1 TB once; if buffers must be larger for throughput, merge in two passes of about 32 files each. Common wrong answer: "merge them pairwise", which copies early data a thousand times.

**"The window slides and the oldest element must leave the two-heap median. How?"** Model answer: record it as pending removal, skip it when it reaches a root, and keep live counts per heap so the balance invariant counts only live elements. Common wrong answer: "search the heap and delete it", O(n) per step.

**"Median latency across 500 machines, a billion samples an hour?"** Model answer: a mergeable sketch per machine (t-digest or HdrHistogram) merged at the coordinator, with a stated error bound; exact two-heap medians cannot be combined. Common wrong answer: "average the per-machine medians".

## What mid-level engineers get wrong

- **A max-heap of size k for the k largest.** Its root is the strongest candidate, useless for eviction; the code either grows unbounded or evicts the wrong item.
- **`sorted(items)[:k]` on a stream.** Materialises all `n` and pays O(n log n) for an O(n log k) job.
- **Pairwise merging of k lists.** O(N k), and the reviewer who asks "why not a heap" is asking about this lesson.
- **Taking the square root in k-closest-points.** Monotonic, slow, and a source of float ties.
- **Averaging medians** or otherwise treating quantiles as additive.
- **Trusting local top-k by count across shards.** Correct for per-item scores, wrong for aggregated counts.
- **Routing the new value to a heap by comparison in the running median** and then getting the balance cases wrong. Push-then-move needs no cases.

## Exercises

```exercise
id: merge-k-sorted
title: Merge k sorted lists with a heap
prompt: |
  `lists` is a list of sorted (ascending) integer lists, possibly empty and
  possibly containing empty lists. Return a single ascending list of all the
  elements. Use a min-heap holding at most one entry per list; do not
  concatenate and sort.

  In Python, push `(value, list_index, position)` tuples. In JavaScript,
  write a small heap over `[value, listIndex, position]` arrays.
languages: [python, javascript]
entry: merge_k_sorted
starter:
  python: |
    import heapq

    def merge_k_sorted(lists):
        out = []
        return out
  javascript: |
    function merge_k_sorted(lists) {
      const out = [];
      return out;
    }
tests:
  - args: [[[1, 4, 5], [1, 3, 4], [2, 6]]]
    expected: [1, 1, 2, 3, 4, 4, 5, 6]
  - args: [[]]
    expected: []
    label: no lists
  - args: [[[]]]
    expected: []
    label: one empty list
  - args: [[[1], [0]]]
    expected: [0, 1]
  - args: [[[1, 2, 3], [], [0, 0], [5]]]
    expected: [0, 0, 1, 2, 3, 5]
    hidden: true
    label: empty list in the middle, duplicates
  - args: [[[-3, -1], [-2], [-5, 4]]]
    expected: [-5, -3, -2, -1, 4]
    hidden: true
hints:
  - "Seed the heap with (lists[i][0], i, 0) for every non-empty list i."
  - "After popping (v, i, j), push (lists[i][j+1], i, j+1) if it exists."
```

```exercise
id: stream-medians
title: Running median of a stream
prompt: |
  Given a list of integers arriving one at a time, return a list containing
  the median after each arrival. With an odd count the median is the middle
  value; with an even count it is the average of the two middle values (a
  possibly fractional number).

  Use two heaps: a max-heap for the lower half and a min-heap for the upper
  half, sizes differing by at most one. In Python, store negated values in
  `heapq` to get a max-heap. In JavaScript, write one small heap class that
  takes a comparator and instantiate it twice.
languages: [python, javascript]
entry: stream_medians
starter:
  python: |
    import heapq

    def stream_medians(nums):
        low, high = [], []   # low: max-heap (negated), high: min-heap
        out = []
        for x in nums:
            pass
        return out
  javascript: |
    function stream_medians(nums) {
      const out = [];
      return out;
    }
tests:
  - args: [[5, 16, 1, 4]]
    expected: [5, 10.5, 5, 4.5]
  - args: [[1]]
    expected: [1]
  - args: [[]]
    expected: []
    label: empty stream
  - args: [[7, 4, 9]]
    expected: [7, 5.5, 7]
  - args: [[1, 2, 3, 4, 5, 6]]
    expected: [1, 1.5, 2, 2.5, 3, 3.5]
    hidden: true
    label: ascending input
  - args: [[10, -1, 3, 8, 2]]
    expected: [10, 4.5, 3, 5.5, 3]
    hidden: true
hints:
  - "Push into low, move low's max to high, then if high is larger than low move high's min back to low."
  - "Median: low's root if len(low) > len(high), else (low root + high root) / 2."
```

## Senior signals

- You keep a **min**-heap for the k largest and can explain why in one sentence (the root is the eviction candidate).
- You state top-k as O(n log k) with O(k) space, you know only about k ln(n/k) items enter the heap on random input and that a feed sorted by the ranking key is the worst case, and you know when quickselect or a plain sort is the better tool.
- You recognise k-way merge as the engine of external sort, LSM compaction and scatter-gather query merging, you know it is O(N log k), and you can size the buffers and passes for a merge that does not fit in memory.
- You can write the two-heap median with the "push to low, rebalance" trick and no case analysis, and you know its limitation (no deletion).
- You know that top-k by score composes across shards and top-k by count does not, and you can produce the counterexample.
- You know that production percentiles use mergeable sketches (t-digest, HdrHistogram, bucketed timers) and can say what the two-heap approach cannot do that they can.
- You put a tiebreaker in every heap tuple without being asked.

## Check yourself

```quiz
- q: >-
    To find the 100 largest values in a stream of a billion numbers with minimal memory, you keep:
  options: ["A max-heap of size 100, evicting its root for smaller values", "A max-heap of all values seen, popping 100 times at the end", "A min-heap of size 100, evicting its root for larger values", "A sorted list of size 100, inserting each value by bisection"]
  answer: 2
  explanation: >-
    The root of a min-heap of the current best 100 is the weakest candidate, which is exactly the one to evict. A max-heap's root is the strongest, useless for eviction, and a heap of all values needs a billion slots. The sorted list works but insertion is O(k) versus O(log k).
- q: >-
    Merging k sorted lists with N total elements pairwise (merge 1 and 2, then with 3, and so on) costs O(N k). The heap-based merge costs O(N log k). For k = 1,000 lists of 1,000 elements each, roughly how many element operations does each perform?
  options: ["Pairwise about 10^6, heap about 10^6", "Pairwise about 10^7, heap about 10^9", "Pairwise about 10^9, heap about 10^7", "Pairwise about 10^9, heap about 10^9"]
  answer: 2
  explanation: >-
    N = 10^6. Pairwise: N × k = 10^9, because early elements are recopied in every merge. Heap: N × log2(1000) ≈ 10^6 × 10 = 10^7.
- q: >-
    In the two-heap running median, why does every new value go into the max-heap first and then get rebalanced, rather than being routed to the correct heap by comparison?
  options: ["The max-heap is always smaller, so it must receive new values", "It makes the ordering invariant hold without case analysis", "It is faster, since it skips a comparison on every insert", "Routing by comparison is incorrect when x equals a root"]
  answer: 1
  explanation: >-
    Whatever was pushed, the largest of low is then moved across, so max of low <= min of high holds unconditionally; one size check then restores the balance invariant. Routing by comparison is also correct (ties included) but needs cases for which heap is larger and which side x belongs to. Push-then-move does more heap operations, not fewer.
- q: >-
    A top-10 job over 200 million random-order items does far fewer than 200 million heap operations. About how many, and what input makes it do the full amount?
  options: ["About 200 heap operations; input sorted ascending by the ranking key", "About 200 heap operations; input with many duplicate keys", "About 20 million heap operations; input with many duplicate keys", "About 2 million heap operations; input sorted descending by the key"]
  answer: 0
  explanation: >-
    The i-th item enters the heap with probability k/i on random order, so the expected count is about k ln(n/k) + k, around 180 for k = 10 and n = 2 × 10^8; every other item costs one comparison against the root. Ascending input makes every item beat the root and forces the full n log k. Descending input is the best case, and duplicates are rejected by the comparison.
- q: >-
    Each of 100 shards returns its local top 10. For which ranking is the merged result guaranteed to be the true global top 10?
  options: ["Only for an aggregated count, because counts add across shards", "For neither, because shards can hold different numbers of items", "Only for a per-item score, because a global leader must lead its own shard", "For both, because the union of local top-10s always contains the global top-10"]
  answer: 2
  explanation: >-
    An item with the highest per-item score globally has that score in its own shard, so it is in that shard's top 10. An item's global count is spread across shards, so it can rank below the local top 10 everywhere while leading overall; the fix is to return full counts, a mergeable sketch, or a second round that fetches counts for the union of candidates.
- q: >-
    A metrics service reports p50 and p99 latency across 500 machines. The engineer proposes each machine keep an exact two-heap median and the coordinator average them. The problem is:
  options: ["Heaps cannot hold floating-point latencies, only integers", "Averaging 500 numbers per query is too slow for a dashboard", "The mean of medians is not the global median; use a sketch", "Two-heap medians cost O(n) per insert, too slow at scale"]
  answer: 2
  explanation: >-
    Quantiles are not additive, and exact two-heap structures cannot be merged without shipping all samples. Mergeable sketches such as t-digest or HdrHistogram trade a small error for bounded memory and mergeability, which is what a distributed dashboard needs. Each two-heap insert is O(log n), so speed is not the issue.
```
