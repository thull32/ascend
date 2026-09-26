---
slug: top-k-and-k-way-merge
title: "Top-k, k-way merge and the streaming median"
description: The three problem families a heap owns outright, why the top-k heap is the size of k and not n, how to merge a thousand sorted streams in one pass, and the two-heap trick that tracks a median online.
minutes: 40
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

Cost: each of `n` items does at most one O(log k) operation, so O(n log k) time and O(k) space. For `k = 10` and `n = 2 × 10⁸`, that is about 4 comparisons per item and 10 words of memory, versus sorting 200 million items. The comparison `x > heap[0]` rejects most items in O(1) without touching the heap at all; for random input, after the first few thousand items almost nothing gets in.

```viz
{"type": "heap", "algorithm": "top-k", "kind": "min", "k": 3, "values": [4, 9, 1, 7, 3, 8, 2, 6],
 "title": "Top-3 with a min-heap of size 3", "caption": "The root is the weakest of the current best three. An incoming value either loses to it in O(1) or replaces it in O(log k)."}
```

### Variants that are the same problem

- **k smallest**: max-heap of size `k`.
- **k most frequent**: count with a hash map (O(n)), then top-k over the `(count, value)` pairs (O(m log k) for `m` distinct values). Two passes, and the counting pass usually dominates.
- **k closest points to the origin**: max-heap of size `k` keyed by squared distance (skip the square root; it is monotonic and slow).
- **k-th largest element**: same heap, answer is the root at the end. But if all `n` are in memory, **quickselect** finds it in O(n) average; the heap is for streams or when `k` is tiny relative to `n`.
- **Python shortcut**: `heapq.nlargest(k, items)` and `nsmallest` implement exactly this loop in C, with a `key=` parameter. For `k` close to `n` they switch to sorting.

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

The tuple `(val, i, j)` carries the sequence index and the position, and `i` also serves as the tiebreaker so that equal values never fall through to comparing something unorderable. Trace on `[1, 4, 5]`, `[1, 3, 4]`, `[2, 6]`: heap starts `{(1,0,0), (1,1,0), (2,2,0)}`. Pop (1,0,0), push (4,0,1). Pop (1,1,0), push (3,1,1). Pop (2,2,0), push (6,2,1). Pop (3,1,1), push (4,1,2). Pop (4,0,1), push (5,0,2). Pop (4,1,2), nothing left in list 1. Pop (5,0,2). Pop (6,2,1). Output 1 1 2 3 4 4 5 6.

### Where it runs in production

This is the merge step of **external sorting**: sort chunks that fit in memory, write each to disk, then k-way merge the chunks reading one buffer per chunk. It is how databases sort result sets larger than memory, how `sort(1)` handles multi-gigabyte files, and how LSM-tree databases (RocksDB, Cassandra) **compact** several sorted SSTables into one. The same loop merges `k` sorted Kafka partitions by timestamp, `k` sorted posting lists in a search engine, and `k` per-shard result pages in a distributed query (each shard returns its top 100 sorted; the coordinator merges and stops after 100). Python exposes it as `heapq.merge`, which is lazy: it yields elements without materialising the output, so you can merge streams that do not fit in memory.

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

Trace on 5, 16, 1, 4. Add 5: low {5}, move 5 to high, high is bigger, move back: low {5}, high {}. Median 5. Add 16: low {16, 5}, move 16 to high: low {5}, high {16}. Median (5 + 16)/2 = 10.5. Add 1: low {5, 1}, move 5 to high: low {1}, high {5, 16}, high is bigger, move 5 back: low {5, 1}, high {16}. Median 5. Add 4: low {5, 4, 1}, move 5 to high: low {4, 1}, high {5, 16}. Median (4 + 5)/2 = 4.5.

```viz
{"type": "heap", "algorithm": "two-heaps-median", "values": [5, 16, 1, 4, 9, 2],
 "title": "Running median with two heaps", "caption": "The max-heap holds the lower half, the min-heap the upper half, sizes kept within one. The median is read from the roots."}
```

The generalisation is the **two-heaps pattern**: any time you need the boundary between the "smaller" and "larger" parts of a changing set (a percentile, the k-th smallest in a stream, the split in a scheduling problem), two heaps facing each other maintain that boundary in O(log n). The [two heaps pattern lesson](/learn/interview-patterns/sequence-patterns/two-heaps) works through the variants. The limitation is deletion: a **sliding-window median** must remove the element leaving the window, which a plain heap cannot do; the fix is lazy deletion, the subject of the [next lesson](/learn/data-structures/heaps/indexed-heaps-and-decrease-key).

## Choosing between the three, and their alternatives

| Problem | Heap solution | Complexity | When something else is better |
|---|---|---|---|
| k largest of n | Min-heap of size k | O(n log k), O(k) space | Quickselect O(n) if all in memory and you do not need them sorted; sort if k ≈ n |
| Merge k sorted streams | Min-heap of k heads | O(N log k), O(k) space | k = 2: plain two-pointer merge; tiny k: linear scan of heads |
| Running median / percentile | Two heaps | O(log n) per insert, O(n) space | Approximate sketches (t-digest, HdrHistogram) when n is huge and exactness is not required; sorted list with bisect for small n |

The last row is the honest production note. A latency dashboard that shows p50 and p99 does not keep every sample in two heaps; it keeps a **t-digest** or an HdrHistogram, which use kilobytes, merge across machines, and are accurate to a fraction of a percent. The two-heap median is exact and unmergeable. Know both and say which you would ship.

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
- You state top-k as O(n log k) with O(k) space, and you know when quickselect or a plain sort is the better tool.
- You recognise k-way merge as the engine of external sort, LSM compaction and scatter-gather query merging, and you know it is O(N log k), not O(N log N).
- You can write the two-heap median with the "push to low, rebalance" trick and no case analysis, and you know its limitation (no deletion).
- You know that production percentiles use sketches (t-digest, HdrHistogram) and can say what the two-heap approach cannot do that they can (merge, bounded memory).
- You put a tiebreaker in every heap tuple without being asked.

## Check yourself

```quiz
- q: >-
    To find the 100 largest values in a stream of a billion numbers with minimal memory, you keep:
  options: ["A max-heap of all values seen", "A min-heap of size 100, evicting the root when a larger value arrives", "A max-heap of size 100, evicting the root when a smaller value arrives", "A sorted list of size 100 with binary insertion"]
  answer: 1
  explanation: >-
    The root of a min-heap of the current best 100 is the weakest candidate, which is exactly the one to evict. A max-heap's root is the strongest, useless for eviction. The sorted list works but insertion is O(k) versus O(log k).
- q: >-
    Merging k sorted lists with N total elements pairwise (merge 1 and 2, then with 3, and so on) costs O(N k). The heap-based merge costs O(N log k). For k = 1,000 lists of 1,000 elements each, roughly how many element operations does each perform?
  options: ["Both about 10^6", "Pairwise about 10^9, heap about 10^7", "Pairwise about 10^7, heap about 10^9", "Both about 10^9"]
  answer: 1
  explanation: >-
    N = 10^6. Pairwise: N × k = 10^9, because early elements are recopied in every merge. Heap: N × log2(1000) ≈ 10^6 × 10 = 10^7.
- q: >-
    In the two-heap running median, why does every new value go into the max-heap first and then get rebalanced, rather than being routed to the correct heap by comparison?
  options: ["It is faster", "It guarantees the ordering invariant (max of low <= min of high) without case analysis, because whatever was pushed, the largest of low is then moved across", "The max-heap is always smaller", "Comparison routing is incorrect"]
  answer: 1
  explanation: >-
    Routing by comparison is also correct but needs cases for which heap is larger and which side x belongs to. Push-then-move-max makes invariant 1 hold unconditionally; one size check then restores invariant 2.
- q: >-
    A sliding-window median needs to remove the element leaving the window. With two plain heaps this is hard because:
  options: ["Heaps cannot store duplicates", "A heap cannot find and remove an arbitrary element in O(log n) without an index; the standard fix is lazy deletion with a count of pending removals", "Two heaps cannot both shrink", "The median changes only when the window grows"]
  answer: 1
  explanation: >-
    Removal by value is O(n) in a plain heap. Lazy deletion records the value to remove and discards it when it reaches a root, adjusting the logical sizes so the balance invariant is computed on live elements only.
- q: >-
    A metrics service reports p50 and p99 latency across 500 machines. The engineer proposes each machine keep an exact two-heap median and the coordinator average them. The problem is:
  options: ["Two-heap medians are O(n) per insert", "Medians do not combine: the average of per-machine medians is not the global median, and exact structures cannot be merged; use a mergeable sketch like t-digest or HdrHistogram", "Averaging 500 numbers is too slow", "Heaps cannot store floating-point latencies"]
  answer: 1
  explanation: >-
    Quantiles are not additive, and exact two-heap structures cannot be merged without shipping all samples. Sketches trade a small error for bounded memory and mergeability, which is what a distributed dashboard needs.
```
