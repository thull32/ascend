---
slug: two-heaps
title: "Two heaps: the running median and other split-the-stream problems"
description: Keep a stream partitioned into a lower half and an upper half with a max-heap and a min-heap, prove the median is always at a top, add lazy deletion for sliding windows without letting stale entries eat your memory, and know when a sorted list, a count array or a sketch is the better answer.
minutes: 45
difficulty: hard
tags: [heap, median, streaming, lazy-deletion, pattern:two-heaps]
problems: [find-median-data-stream, sliding-window-median, kth-largest-stream]
---
A service records one latency per request and the on-call dashboard wants the median of everything so far, refreshed after every sample. Re-sorting on each arrival is `O(n log n)` per sample. A sorted Python list maintained with `bisect.insort` is `O(n)` per sample because the insert shifts half the list in memory: measured with CPython 3.14 on a Ryzen 9 9950X3D desktop, 300,000 samples took 1,777 ms that way, and grew quadratically. Two heaps took 124 ms, about 0.4 µs per sample.

The median is not a "largest" or "smallest" question, so one heap cannot answer it. It is a *boundary* question: the value that separates the lower half of the data from the upper half. Keep each half in its own heap, facing each other (a max-heap for the lower half, a min-heap for the upper half), and the two values next to the boundary are always at the two roots.

The interview version adds three twists in a predictable order: prove the invariants, make it slide (elements leave, and a heap cannot delete from the middle), and scale it (the data is bounded, infinite, or spread over shards). This lesson traces all three.

## The signal

Reach for two heaps when the statement asks for:

- **"Median of a stream"** or **"median of each window"**: [Find Median from Data Stream](/practice/find-median-data-stream), [Sliding Window Median](/practice/sliding-window-median).
- **A moving partition point**: any fixed quantile of a growing set ("the p90 so far"), which is the median with a different balance rule.
- **Two populations where you repeatedly need the max of one and the min of the other**, with elements migrating between them as a threshold moves: "of the projects I can afford, take the most profitable", "of the jobs released so far, run the highest priority".

Each row below looks like two heaps and is not:

| Statement says | Pattern | Why |
|---|---|---|
| "Median of two sorted arrays" ([problem](/practice/median-two-sorted)) | [Binary search](/learn/interview-patterns/array-patterns/binary-search) on a partition | Nothing arrives; both inputs are sorted, so `O(log min(m, n))` beats building heaps in `O(m + n)` |
| "Median of this array", once | [Quickselect](/learn/algorithms/sorting-searching/selection-and-order-statistics) | `O(n)` expected, no extra structure |
| "p99 latency across 500 machines" | Mergeable sketch (t-digest, HdrHistogram, histogram buckets) | Exact heaps need every sample and cannot be combined |
| "kth largest in a stream", `k` fixed | One size-k min-heap ([top-k](/learn/interview-patterns/sequence-patterns/top-k-elements)) | The boundary sits `k` from the top and the lower side is never read (worked below) |
| "The 37th and then the 90th percentile, on demand" | Sorted container or order-statistics tree | Two heaps track one boundary |
| "Median of each window", values in `0..100` | Count array of 101 slots | `O(V)` per query with `V = 101` beats any heap |
| "Maximum of each window" | [Monotonic deque](/learn/data-structures/stacks-queues/monotonic-deque) | One side only, and expiry is by position |
| "Minimum meeting rooms" ([problem](/practice/meeting-rooms-ii)) | One min-heap of end times ([intervals](/learn/interview-patterns/array-patterns/intervals)) | Only the earliest end matters: a top, not a boundary |

The test: does the answer sit at the *top* of one group, or at the *boundary* between two? Top means one heap; boundary means two.

## The template

Keep `low`, a max-heap of the smaller half, and `high`, a min-heap of the larger half. Insert by pushing onto `low`, moving `low`'s maximum to `high`, and moving `high`'s minimum back if `high` became larger.

```python
import heapq

class MedianFinder:
    def __init__(self):
        self.low = []    # max-heap via negation: the smaller half
        self.high = []   # min-heap: the larger half

    def add_num(self, x):
        heapq.heappush(self.low, -x)                          # 1. into low
        heapq.heappush(self.high, -heapq.heappop(self.low))   # 2. low's max -> high
        if len(self.high) > len(self.low):                    # 3. rebalance
            heapq.heappush(self.low, -heapq.heappop(self.high))

    def find_median(self):
        if len(self.low) > len(self.high):
            return float(-self.low[0])
        return (-self.low[0] + self.high[0]) / 2
```

JavaScript needs the heap written out; one comparator class serves both sides:

```javascript
class Heap {
  constructor(cmp) { this.a = []; this.cmp = cmp; }  // cmp(a, b) < 0: a comes out first
  size() { return this.a.length; }
  peek() { return this.a[0]; }
  push(x) { this.a.push(x); this.siftUp(this.a.length - 1); }
  pop() {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0], last = a.pop();
    if (a.length > 0) { a[0] = last; this.siftDown(0); }
    return top;
  }
  siftUp(i) {
    const a = this.a, x = a[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(x, a[p]) >= 0) break;
      a[i] = a[p]; i = p;
    }
    a[i] = x;
  }
  siftDown(i) {
    const a = this.a, n = a.length, x = a[i];
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && this.cmp(a[c + 1], a[c]) < 0) c++;
      if (this.cmp(a[c], x) >= 0) break;
      a[i] = a[c]; i = c;
    }
    a[i] = x;
  }
}

class MedianFinder {
  constructor() {
    this.low = new Heap((a, b) => b - a);   // max-heap: smaller half
    this.high = new Heap((a, b) => a - b);  // min-heap: larger half
  }
  add_num(x) {
    this.low.push(x);
    this.high.push(this.low.pop());
    if (this.high.size() > this.low.size()) this.low.push(this.high.pop());
  }
  find_median() {
    if (this.low.size() > this.high.size()) return this.low.peek();
    return (this.low.peek() + this.high.peek()) / 2;
  }
}
```

In an interview, write the class once (about 35 lines) or ask to assume one with `push`, `pop`, `peek`, `size`. A sorted array with `splice` is the tempting shortcut: `O(n)` per insert, the same trap as `insort`.

```viz
{"type": "heap", "algorithm": "two-heaps-median", "values": [5, 15, 1, 3, 8, 7], "title": "Two heaps tracking the median of 5, 15, 1, 3, 8, 7", "caption": "Every element enters the max-heap, its largest element crosses to the min-heap, and the sizes are rebalanced so the median stays at the tops."}
```

### The two invariants, and why the median is at a top

After every operation:

1. **Order:** `max(low) ≤ min(high)`.
2. **Balance:** `|low| − |high| ∈ {0, 1}`.

*Claim: the median is `max(low)` when the count is odd and the mean of `max(low)` and `min(high)` when it is even.* By the order invariant, listing `low` in ascending order and then `high` in ascending order gives the whole multiset in sorted order: every element of `low` is at most `max(low) ≤ min(high)`, which is at most every element of `high`. So `max(low)` is sorted position `|low|` and `min(high)` is position `|low| + 1`. If the count is `2m + 1`, balance forces `|low| = m + 1`, and position `m + 1` is the median. If the count is `2m`, balance forces `|low| = |high| = m`, and the median is the mean of positions `m` and `m + 1`. Both are roots, so the read is `O(1)`.

*Each insert preserves both.* Step 1 can break order only through `low`'s new maximum. Step 2 moves exactly that element to `high`, and whatever `x` was, the element moved is at least everything left in `low`, so order holds again. After step 2, `|low| − |high|` is the old difference minus 1, so it is −1 or 0. Step 3 fixes −1 by moving `min(high)` back; that element is at most everything left in `high` and at least everything in `low`, so order survives the move.

Routing `x` by comparison (`x ≤ max(low)` goes to `low`) is also correct, and does 1 or 3 heap operations where push-then-migrate does 3 or 5; it needs an empty-`low` guard. The sliding-window code below routes, because it must know which heap each element went to.

## Worked problems

### Find Median from Data Stream

[Find Median from Data Stream](/practice/find-median-data-stream) is the template unchanged. Trace on `9, 4, 12, 7, 3, 15, 1`. Heaps are shown in array order, `low` with its real values (Python stores them negated; the array layout is identical):

| x | After 1: push low | After 2: low's max → high | After 3: rebalance | Median |
|---|---|---|---|---|
| 9 | low `[9]` | low `[]`, high `[9]` | move 9 back: low `[9]`, high `[]` | 9 |
| 4 | low `[9, 4]` | low `[4]`, high `[9]` | sizes 1/1 | 6.5 |
| 12 | low `[12, 4]` | low `[4]`, high `[9, 12]` | move 9: low `[9, 4]`, high `[12]` | 9 |
| 7 | low `[9, 4, 7]` | low `[7, 4]`, high `[9, 12]` | sizes 2/2 | 8 |
| 3 | low `[7, 4, 3]` | low `[4, 3]`, high `[7, 12, 9]` | move 7: low `[7, 3, 4]`, high `[9, 12]` | 7 |
| 15 | low `[15, 7, 4, 3]` | low `[7, 3, 4]`, high `[9, 12, 15]` | sizes 3/3 | 8 |
| 1 | low `[7, 3, 4, 1]` | low `[4, 3, 1]`, high `[7, 9, 15, 12]` | move 7: low `[7, 4, 1, 3]`, high `[9, 12, 15]` | 7 |

Row 6 shows the unconditional sequence earning its keep: 15 belongs in `high`, and it gets there because pushing it into `low` makes it `low`'s maximum, which step 2 moves. Check the last row against the sorted data `1, 3, 4, 7, 9, 12, 15`: the fourth value is 7. Row 7's step 2 also shows array order differing from sorted order: `high` is `[7, 9, 15, 12]`, a valid heap whose last two entries are out of order.

### Sliding Window Median, with lazy deletion

[Sliding Window Median](/practice/sliding-window-median): the median of every window of `k` consecutive elements. The new problem is removal: the element leaving the window is somewhere inside a heap, and a binary heap can only remove its root. **Lazy deletion** records the value in a `pending` map, decrements a *live* count for its heap, and physically discards it only when it surfaces at a root. The single-heap version of the technique, and the position-map alternative, are in [indexed heaps and decrease-key](/learn/data-structures/heaps/indexed-heaps-and-decrease-key); here it runs on two heaps at once.

```python
import heapq
from collections import defaultdict

class WindowMedian:
    def __init__(self):
        self.low, self.high = [], []        # low: max-heap of negated values; high: min-heap
        self.pending = defaultdict(int)     # value -> removals not yet applied
        self.n_low = self.n_high = 0        # live sizes; len() counts stale entries too

    def _prune(self, heap, sign):           # sign = -1 for low, +1 for high
        while heap and self.pending[sign * heap[0]]:
            self.pending[sign * heap[0]] -= 1
            heapq.heappop(heap)

    def _balance(self):
        if self.n_low > self.n_high + 1:
            heapq.heappush(self.high, -heapq.heappop(self.low))
            self.n_low -= 1; self.n_high += 1
            self._prune(self.low, -1)       # a stale entry may now be low's root
        elif self.n_low < self.n_high:
            heapq.heappush(self.low, -heapq.heappop(self.high))
            self.n_high -= 1; self.n_low += 1
            self._prune(self.high, 1)

    def add(self, x):
        if not self.low or x <= -self.low[0]:
            heapq.heappush(self.low, -x); self.n_low += 1
        else:
            heapq.heappush(self.high, x); self.n_high += 1
        self._balance()

    def remove(self, x):                    # x is known to be in the window
        self.pending[x] += 1
        if x <= -self.low[0]:
            self.n_low -= 1
            if x == -self.low[0]:
                self._prune(self.low, -1)
        else:
            self.n_high -= 1
            if x == self.high[0]:
                self._prune(self.high, 1)
        self._balance()

    def median(self):
        if self.n_low > self.n_high:
            return float(-self.low[0])
        return (-self.low[0] + self.high[0]) / 2

def median_sliding_window(nums, k):
    w, out = WindowMedian(), []
    for i, x in enumerate(nums):
        w.add(x)
        if i >= k:
            w.remove(nums[i - k])
        if i >= k - 1:
            out.append(w.median())
    return out
```

Two extra invariants make it safe. **Both roots are always live**: `remove` prunes when it retires a root, and `_balance` prunes after every pop because a stale entry may rise into the root. Since only roots are read, stale entries deeper down are harmless. **Balance uses live counts**, never `len()`. The `x <= -low[0]` test routes a removal correctly because the root is live and order holds among live elements; with duplicate values it does not matter which physical copy is discarded, and this code matched a brute-force sort of every window on 20,000 random arrays drawn from as few as three distinct values.

### The lazy-deletion trace

Trace on `[11, 3, 7, 8, 4, 1, 12, 2]`, `k = 3`. Arrays in array order with real values; `pending` lists values removed but still physically present:

| i | x | Events | low | high | pending | live low/high | Median |
|---|---|---|---|---|---|---|---|
| 0 | 11 | add to low | `[11]` | `[]` | – | 1/0 | – |
| 1 | 3 | add to low; move 11 to high | `[3]` | `[11]` | – | 1/1 | – |
| 2 | 7 | add to high; move 7 to low | `[7, 3]` | `[11]` | – | 2/1 | 7 |
| 3 | 8 | add to high; remove 11 (below high's root 8) | `[7, 3]` | `[8, 11]` | {11} | 2/1 | 7 |
| 4 | 4 | add to low; move 7 to high; remove 3 (not a root); move 7 back | `[7, 3, 4]` | `[8, 11]` | {3, 11} | 2/1 | 7 |
| 5 | 1 | add to low; move 7 to high; remove 7, a root: prune | `[4, 3, 1]` | `[8, 11]` | {3, 11} | 2/1 | 4 |
| 6 | 12 | add to high; remove 8, a root: prune 8, then 11 surfaces and is pruned | `[4, 3, 1]` | `[12]` | {3} | 2/1 | 4 |
| 7 | 2 | add to low; move 4 to high; 3 surfaces in low, pruned; remove 4, a root: prune | `[2, 1]` | `[12]` | – | 2/1 | 2 |

At `i = 4` the heaps physically hold five entries for a window of three, and `len()` would say the halves are 3 and 2 when they are really 2 and 1. At `i = 6` one prune cascades: removing 8 exposes the stale 11 at the root, and the loop discards it too. Output `[7, 7, 7, 4, 4, 2]`, which matches sorting each window.

### Kth Largest in a Stream: the one-sided boundary

[Kth Largest in a Stream](/practice/kth-largest-stream) is the same boundary problem, placed `k` from the top instead of in the middle. The "upper side" is the `k` largest, a min-heap whose root is the answer. The "lower side" is everything else, and in an insert-only stream it is never read again: the boundary only moves up (the top-k lesson proves this), so nothing below it can return. Drop the lower heap and two heaps become one.

Trace for `KthLargest(3, [6, 1, 9, 3, 11])`, then `add` 4, 12, 7, 10:

| Step | Heap array after | Returns |
|---|---|---|
| `heapify` the seed | `[1, 3, 9, 6, 11]` | – |
| pop 1, pop 3 (trim to `k`) | `[6, 11, 9]` | `null` |
| add 4: 4 ≤ 6, reject | `[6, 11, 9]` | 6 |
| add 12: replace root | `[9, 11, 12]` | 9 |
| add 7: 7 ≤ 9, reject | `[9, 11, 12]` | 9 |
| add 10: replace root | `[10, 11, 12]` | 10 |

Add deletions and the argument fails: delete 12 and the new third largest is 9, which was evicted. So "kth largest with deletions" is two heaps again: the top `k` in a min-heap, the rest in a max-heap, with the balance rule "upper holds exactly `k` live elements" and lazy deletion on both sides.

```viz
{"type": "heap", "algorithm": "top-k", "kind": "min", "k": 3, "values": [6, 1, 9, 3, 11, 4, 12, 7, 10], "title": "Kth largest in a stream: the upper side only", "caption": "The root is the boundary between the top three and the rest. In an insert-only stream the rest is never read again, so it is not stored."}
```

### Variant: maximise capital (elements migrate between heaps)

You may complete at most `k` projects, start with capital `w`, and project `i` needs `capital[i]` to start and pays `profits[i]`. `by_cap` is a min-heap of projects you cannot yet afford, keyed by capital; `avail` is a max-heap of profits you can. Each round, migrate everything with `capital ≤ w` from `by_cap` to `avail`, then take `avail`'s root. With `k = 3`, `w = 1`, `profits = [3, 1, 4, 1, 5]`, `capital = [1, 1, 2, 3, 10]`: round 1 migrates profits 3 and 1 and takes 3 (`w = 4`); round 2 migrates 4 and 1 and takes 4 (`w = 8`); round 3 migrates nothing and takes 1 (`w = 9`). Each project migrates once and is taken at most once: `O((n + k) log n)`. The exercise below implements it.

## Variants

| Variant | What changes in the template | Complexity |
|---|---|---|
| Upper median instead of lower | Let `high` hold the extra element; read `min(high)` for odd counts | same |
| Fixed quantile `p` | Target size of `low` is `⌈p·n⌉` instead of `⌈n/2⌉`; rebalance to that target | `O(log n)` per insert |
| Weighted median | Balance on total weight per heap; one insert may move several elements | `O(log n)` per move |
| Sliding window | Lazy deletion, live counts, prune after every pop; rebuild from the window when stale entries pile up | amortised `O(log k)` |
| Arbitrary deletions (by value) | Also track live copies per value, so removing an absent value is a no-op | amortised `O(log n)` |
| kth largest in a stream | Upper side only, a size-`k` min-heap | `O(log k)` per add |
| kth largest with deletions | Upper side of exactly `k` live, lower side for the rest, lazy deletion on both | amortised `O(log n)` |
| Threshold migration (IPO, job release) | Min-heap by threshold feeds a max-heap by value; each element crosses once | `O((n + k) log n)` |

## Complexity, derived

An insert does three or five heap operations on heaps of about `n/2` entries, each at most `log₂(n/2) + 1` levels, so `O(log n)`; the median read is two root reads, `O(1)`; memory is the `n` values. Measured on the same machine (CPython 3.14, random integers, a median read after every insert):

| Inserts | Two heaps, negation | Two heaps, 3.14 `heappush_max` | Sorted list, `bisect.insort` |
|---|---|---|---|
| 100,000 | 39 ms | 34 ms | 208 ms |
| 300,000 | 124 ms | 110 ms | 1,777 ms |
| 1,000,000 | 475 ms | – | – |

`insort` finds the slot in `O(log n)` and then shifts on average `n/2` pointers, so `n` inserts move about `n²/4` pointers: tripling `n` multiplied its time by 8.5. On ascending input `insort` appends at the end and 100,000 inserts took 12 ms, which is why a test on sorted data hides the problem.

For the sliding window, every element is pushed once and popped at most once, and each rebalance moves one element, so the total is `O(n log n)`. What is *not* bounded by `k` is the garbage. Measured over 100,000 random values with `k = 1,001`, the heaps peaked at 91,741 physical entries: removed values far below the median sit at the bottom of `low` and never surface. On ascending or descending input the peak was all 100,000. The fix is a compaction rule: when physical entries exceed `2k`, rebuild both heaps from the current window (sort it, split it, `heapify` the lower half). A rebuild costs `O(k log k)` and cannot happen more often than every `k` steps, so the amortised cost is `O(log k)`; measured, the peak fell to 2,003 entries after 96 rebuilds and the run got faster (78 ms to 68 ms).

For small windows a plain sorted list wins in CPython: with `k = 1,001` it took 37 ms against 68 ms, because shifting 1,000 pointers is one `memmove`. At `k = 10,001` over 400,000 values the heaps won 292 ms to 718 ms, and at `k = 100,001` they won 307 ms to 3,992 ms.

## Choosing the structure

| Structure | Insert | Delete a given value | Median read | Memory | Exact | Mergeable across machines |
|---|---|---|---|---|---|---|
| Two heaps | `O(log n)` | not supported | `O(1)` | `O(n)` | yes | no |
| Two heaps, lazy deletion, compaction | `O(log n)` amortised | `O(log n)` amortised | `O(1)` | `O(k)` for a window | yes | no |
| Sorted list with `bisect` | `O(n)` shift | `O(n)` shift | `O(1)` | `O(n)` | yes | only by shipping all data |
| `SortedList`, `std::multiset`, order-statistics tree | `O(log n)` | `O(log n)` | `O(log n)`, or `O(1)` with a parked iterator | `O(n)` | yes | only by shipping all data |
| Count array over values `0..V` | `O(1)` | `O(1)` | `O(V)` | `O(V)` | yes | yes, add the arrays |
| Quantile sketch (t-digest, KLL, histogram) | `O(1)` amortised | no | small, fixed | kilobytes | bounded error | yes |

Two heaps win when the data arrives one element at a time, only the middle matters, and one machine holds it all. Every other row is the answer to an interviewer changing one of those three conditions.

## Under the hood

### Negation and the 3.14 max-heap functions

`heapq` is min-only before 3.14, so `low` stores `-x`. That works for numbers only: `-(value, index)` raises `TypeError: bad operand type for unary -: 'tuple'`, and strings cannot be negated at all. For tuple entries negate each numeric field (`(-value, -index)`). CPython 3.14 adds public `heappush_max`, `heappop_max`, `heapify_max`, `heapreplace_max` and `heappushpop_max` (checked on 3.14.7); with them `low` holds real values, no negation code exists to get wrong, and the median finder ran about 12% faster (34 ms against 39 ms for 100,000 inserts). Check the interpreter version first; many environments still run 3.12 or 3.13, where only private underscore helpers exist.

### What the other languages give you

C++'s answer to the sliding median is a `std::multiset` with an iterator parked on the median: insert and erase are `O(log k)`, and the iterator moves one step per operation. Java's `TreeMap<Integer, Integer>` of counts, or two `TreeSet`s of `(value, index)` pairs, plays the same role. Java's `PriorityQueue.remove(Object)` is a linear scan plus a sift, `O(k)` per step, acceptable for `k` in the hundreds. In Python the equivalent is `sortedcontainers.SortedList`, a third-party package (not in the standard library, and not installed on the machine used for these measurements) that many online judges preinstall. In any language with 32-bit integers, `(a + b) / 2` overflows when both middle values are near `2³¹`, which Sliding Window Median's constraints allow; compute `a / 2.0 + b / 2.0` or widen first. JavaScript numbers are doubles, exact to `2⁵³`, so the sum is safe there.

### Production percentiles are not two heaps

Exact streaming medians need memory proportional to the stream: Munro and Paterson (1980) showed that any one-pass algorithm computing the exact median of `n` items must store on the order of `n` of them. Monitoring systems therefore keep approximate, mergeable summaries. Prometheus histograms count samples into fixed buckets and `histogram_quantile()` interpolates linearly inside the bucket that contains the quantile, so its error is set by the bucket boundaries. t-digest and HdrHistogram trade bounded error for kilobytes of memory; the [top-k and k-way merge](/learn/data-structures/heaps/top-k-and-k-way-merge) lesson compares them, and the [metrics and logging platform](/learn/system-design/case-studies/metrics-and-logging-platform) case study shows where they sit in a pipeline.

## Failure modes

**Balancing on `len()`.** *Symptom:* on `[11, 3, 7, 8, 4, 1, 12, 2]` with `k = 3` the output is `[7, 7.5, 7, 4, 2.5, 2]` instead of `[7, 7, 7, 4, 4, 2]`: odd windows report averages. *Diagnosis:* `len(low)` and `len(high)` count stale entries, so the code believes the halves are balanced, or even, when they are not. *Fix:* live counts, adjusted on every add, remove and move, used in every balance and median decision.

**A stale root.** *Symptom:* the same input returns 3 for the last window `[1, 12, 2]`, a value that left the window three steps earlier. *Diagnosis:* `_balance` pops `low`'s root without pruning afterwards, so the stale 3 rises to the root and is read. *Fix:* prune after every pop and after every removal of a root; the invariant is "both roots are live".

**Memory that tracks the stream, not the window.** *Symptom:* a service computing a 1,000-sample rolling median grows its RSS until it restarts; heap sizes in a dump are in the hundreds of thousands. *Diagnosis:* lazy deletion with no compaction; removed values far from the median never surface (measured: 91,741 entries for a window of 1,001). *Fix:* rebuild from the live window when physical size exceeds `2k`, or use a sorted container.

**A removal that eats a later insert.** *Symptom:* after `remove(7)` on a bag without a 7, a later `add(7)` has no effect on the median. *Diagnosis:* the pending count for 7 was recorded anyway, so the next 7 to reach a root is discarded as stale and the live counts go wrong. *Fix:* track live copies per value and make `remove` of an absent value a no-op that returns `False`.

**Negation slips.** *Symptom:* medians with the wrong sign, or an even-count median of `(−7 + 9) / 2 = 1`. *Diagnosis:* reading `low[0]` without negating it, or negating on push and again on pop. *Fix:* one helper for the root of `low`, or the 3.14 `*_max` functions.

## Interviewer follow-ups

**"All values are integers in 0 to 100."** Model answer: a 101-slot count array; insert is `O(1)` and the median is a walk over at most 101 counts, or `O(1)` amortised with a pointer that moves as values arrive. For "99% of values in range", count the range and keep two small heaps for the outliers. Common wrong answer: keeping the heaps, which spends `O(log n)` on a problem that has an `O(1)` answer.

**"The stream is unbounded and memory is fixed."** Model answer: an exact median is impossible in one pass with less than linear memory, so state an error bound and use a quantile sketch (t-digest, KLL) or histogram buckets; reservoir sampling gives an estimate from a fixed-size uniform sample. Common wrong answer: "two heaps capped at a size limit", which silently discards the elements that decide the median.

**"The data is spread over 50 shards."** Model answer: for an exact answer, binary search on the *value*: each round asks every shard for `count(≤ mid)`, and about 32 rounds cover a 32-bit range, each costing 50 small messages. For an approximate answer, merge per-shard sketches. Common wrong answer: averaging the 50 shard medians, which is not the median of anything.

**"Support deleting arbitrary values, not only the oldest."** Model answer: lazy deletion generalises unchanged, plus a live-copies map so deleting an absent value is a no-op; or a sorted container with `O(log n)` removal and no garbage. Common wrong answer: `heap.remove(x)` then `heapify`, `O(n)` per deletion.

**"Now I want p90, and later p50 and p99 together."** Model answer: one quantile is the same structure with `|low| = ⌈0.9n⌉`; several quantiles on demand need an order-statistics structure (sorted container, a tree with subtree sizes, or a Fenwick tree over compressed values). Common wrong answer: two heaps per quantile, which multiplies memory and every update.

## What mid-level engineers get wrong

- **Balancing on `len()` after lazy deletion.** Odd windows report averages; the bug appears only after the first removal that is not at a root.
- **Pruning only in `remove`.** The rebalance pop exposes stale roots, and a value that left the window is returned as the median.
- **No bound on stale entries.** Memory grows with the stream; fine in the interview, an incident in production.
- **Recording a pending removal for an absent value.** A later insert of that value disappears.
- **`(a + b) // 2` or `(a + b) >> 1` for the even median.** Truncates 6.5 to 6 in Python, and overflows in 32-bit languages.
- **Reaching for two heaps when the inputs are static.** Median of two sorted arrays is a binary search; a one-off median is quickselect.

## Exercises

```exercise
id: max-capital-two-heaps
title: Maximise capital with two heaps
prompt: |
  You may complete at most `k` projects. You start with capital `w`. Project
  `i` requires at least `capital[i]` to start and pays `profits[i]` when
  finished (added to your capital immediately, and you may then start another).
  Return the maximum capital you can end with.

  Use a min-heap of projects keyed by required capital and a max-heap of
  profits for the affordable ones. The JavaScript starter provides a
  `MinHeap` with a comparator; Python can use `heapq` (negate for a max-heap).
languages: [python, javascript]
entry: max_capital
starter:
  python: |
    import heapq

    def max_capital(k, w, profits, capital):
        # your code here
        return w
  javascript: |
    class MinHeap {
      constructor(cmp = (a, b) => a - b) { this.a = []; this.cmp = cmp; }
      size() { return this.a.length; }
      peek() { return this.a[0]; }
      push(x) {
        const a = this.a; a.push(x);
        let i = a.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (this.cmp(a[i], a[p]) >= 0) break;
          [a[i], a[p]] = [a[p], a[i]]; i = p;
        }
      }
      pop() {
        const a = this.a, top = a[0], last = a.pop();
        if (a.length) {
          a[0] = last;
          let i = 0;
          for (;;) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
            if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
            if (m === i) break;
            [a[i], a[m]] = [a[m], a[i]]; i = m;
          }
        }
        return top;
      }
    }

    function max_capital(k, w, profits, capital) {
      // your code here
      return w;
    }
tests:
  - args: [2, 0, [1, 2, 3], [0, 1, 1]]
    expected: 4
  - args: [3, 0, [1, 2, 3], [0, 1, 2]]
    expected: 6
  - args: [1, 0, [5, 10], [1, 1]]
    expected: 0
    label: nothing affordable
  - args: [2, 5, [4, 1, 7], [5, 2, 10]]
    expected: 10
  - args: [0, 3, [1], [0]]
    expected: 3
    label: zero rounds
  - args: [3, 1, [3, 1, 4, 1, 5], [1, 1, 2, 3, 10]]
    expected: 9
    hidden: true
  - args: [2, 0, [2, 2], [0, 0]]
    expected: 4
    hidden: true
hints:
  - "Push every (capital, profit) pair into a min-heap by capital. Each round, move every pair whose capital is at most w into a max-heap of profits."
  - "If the profit heap is empty after migrating, no project is affordable and you can stop early."
  - "Each project migrates once and is taken at most once, so the total cost is O((n + k) log n)."
```

```exercise
id: median-bag-lazy-deletion
title: A median bag with removals
prompt: |
  Implement `MedianBag`, a multiset of integers with three methods:

  - `add(x)`: add one copy of `x`; returns nothing.
  - `remove(x)`: remove one copy of `x` and return `true`; if `x` is not in
    the bag, change nothing and return `false`.
  - `median()`: the median of the current contents (the mean of the two
    middle values for an even count), or `null`/`None` when the bag is empty.

  Use two heaps with lazy deletion: a pending-removal count per value, live
  sizes for each heap (never the physical lengths), and pruning whenever a
  stale entry could be at a root. A removal of a value that is absent must
  not affect later operations. Tests are method-call sequences; the expected
  output lists each call's return value.
languages: [python, javascript]
entry: MedianBag
starter:
  python: |
    import heapq
    from collections import defaultdict

    class MedianBag:
        def __init__(self):
            self.low, self.high = [], []   # max-heap (negated), min-heap
            self.pending = defaultdict(int)
            self.live = defaultdict(int)
            self.n_low = self.n_high = 0

        def add(self, x):
            pass

        def remove(self, x):
            return False

        def median(self):
            return None
  javascript: |
    class MinHeap {
      constructor(cmp = (a, b) => a - b) { this.a = []; this.cmp = cmp; }
      size() { return this.a.length; }
      peek() { return this.a[0]; }
      push(x) { this.a.push(x); this.siftUp(this.a.length - 1); }
      pop() {
        const a = this.a;
        if (a.length === 0) return undefined;
        const top = a[0], last = a.pop();
        if (a.length > 0) { a[0] = last; this.siftDown(0); }
        return top;
      }
      siftUp(i) {
        const a = this.a, x = a[i];
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (this.cmp(x, a[p]) >= 0) break;
          a[i] = a[p]; i = p;
        }
        a[i] = x;
      }
      siftDown(i) {
        const a = this.a, n = a.length, x = a[i];
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && this.cmp(a[c + 1], a[c]) < 0) c++;
          if (this.cmp(a[c], x) >= 0) break;
          a[i] = a[c]; i = c;
        }
        a[i] = x;
      }
    }

    class MedianBag {
      constructor() {
        this.low = new MinHeap((a, b) => b - a);   // max-heap
        this.high = new MinHeap((a, b) => a - b);  // min-heap
        this.pending = new Map();
        this.live = new Map();
        this.nLow = 0; this.nHigh = 0;
      }
      add(x) {}
      remove(x) { return false; }
      median() { return null; }
    }
tests:
  - args: [["add", 5], ["add", 1], ["add", 9], ["median"], ["remove", 5], ["median"]]
    expected: [null, null, null, 5, true, 5]
  - args: [["median"], ["remove", 3], ["add", 3], ["median"], ["remove", 3], ["median"]]
    expected: [null, false, null, 3, true, null]
    label: empty bag and absent removal
  - args: [["add", 2], ["add", 2], ["add", 2], ["remove", 2], ["median"], ["add", 7], ["median"]]
    expected: [null, null, null, true, 2, null, 2]
    label: duplicates
  - args: [["add", 4], ["add", 8], ["add", 1], ["add", 6], ["add", 3], ["remove", 1], ["median"], ["remove", 8], ["median"]]
    expected: [null, null, null, null, null, true, 5, true, 4]
    label: removals below the roots
  - args: [["add", 5], ["remove", 7], ["add", 7], ["median"]]
    expected: [null, false, null, 6]
    hidden: true
    label: an absent removal must not eat a later add
  - args: [["add", -3], ["add", -8], ["add", 10], ["add", 1], ["median"], ["remove", -3], ["median"], ["remove", 10], ["median"]]
    expected: [null, null, null, null, -1, true, 1, true, -3.5]
    hidden: true
  - args: [["add", 1], ["add", 2], ["remove", 1], ["remove", 2], ["median"], ["add", 4], ["median"]]
    expected: [null, null, true, true, null, null, 4]
    hidden: true
    label: emptied and refilled
hints:
  - "remove: if live[x] is 0 return False before touching anything else. Otherwise decrement live[x], increment pending[x], and decrement the live size of the heap x belongs to (x <= low's root means low)."
  - "Prune a heap (pop its root while pending[root] > 0) after removing its root and after every rebalance pop, so both roots are always live."
  - "Balance and the median read use the live sizes: low may hold one more live element than high, never fewer."
```

## Senior signals

- You state both invariants (order, balance), prove from them that the median sits at a root, and say which insert step repairs which invariant.
- You know a binary heap cannot delete from the middle, reach for lazy deletion with live counts and "roots are always live", and know that its garbage is bounded by the stream, not the window, unless you compact.
- You put numbers on the alternatives: `insort` is `O(n)` per insert and lost 124 ms to 1,777 ms at 300,000 samples, yet a sorted list beats lazy heaps for windows of about a thousand in CPython.
- You see kth-largest-in-a-stream as the one-sided degenerate case, and know that deletions bring the second heap back.
- You ask about the value range (count array), the memory budget (exact is `Ω(n)`, so sketches), and distribution (binary search on the value, never an average of medians).
- You know the tooling: 3.14's `*_max` functions, `SortedList`, `std::multiset`, `TreeMap`, and the 32-bit overflow in the even median.

## Check yourself

```quiz
- q: >-
    With max(low) ≤ min(high) and low holding exactly one more element than high, why is max(low) the median?
  options: ["Listing low then high gives sorted order; max(low) is in the middle", "Because low is a max-heap, its root is always the largest value overall", "Because the two heaps are sorted arrays, so their roots sit at the center", "Because balance alone makes the root of either heap the median value"]
  answer: 0
  explanation: >-
    The order invariant means low's elements all precede high's in sorted order, so max(low) is sorted position |low|. With a total of 2m + 1 and |low| = m + 1, that is the middle. max(low) is the largest of the lower half only, heaps are not sorted arrays, and balance without order says nothing about where values sit.
- q: >-
    A sliding-window median with lazy deletion balances the heaps using len(low) and len(high). What goes wrong?
  options: ["Nothing, because stale entries are always removed before balancing", "Balancing becomes O(n), since len() scans the heap for stale entries", "Stale entries inflate the lengths, so odd windows report averages", "The heaps overflow, since len() is only valid for arrays without gaps"]
  answer: 2
  explanation: >-
    Removed values stay physically in the heaps until they surface at a root, so len() overcounts one side. On the lesson's trace the len() version returns 7.5 and 2.5 for windows whose true medians are 7 and 4. Live counts, updated on every add, remove and move, are the only correct basis; len() itself is O(1).
- q: >-
    Over 100,000 random values with a window of 1,001 and no compaction, roughly how many entries did the lazy heaps hold at peak?
  options: ["About 91,000, since values far from the median never surface", "About 2,000, because each heap is bounded by the size of the window", "About 500, because half of each window is pruned on every step", "About 1,000, because every stale entry surfaces within one window"]
  answer: 0
  explanation: >-
    A removed value is discarded only when it reaches a root. Values well below the median sit at the bottom of the max-heap and stay there, so garbage grows with the stream (91,741 entries measured). Rebuilding from the window when physical size exceeds 2k brought the peak down to 2,003, which is where the 2,000 figure comes from.
- q: >-
    Fifty shards each hold part of a dataset. What finds the exact global median without moving the data?
  options: ["Binary search on the value, with per-shard counts at or below mid", "Averaging the fifty shard medians, weighted by each shard's element count", "The median of the fifty shard medians, which is exact when shards are equal", "Merging the fifty shards' two-heap structures into one pair of heaps"]
  answer: 0
  explanation: >-
    Counts add across shards, so count(≤ mid) is exact globally, and about 32 rounds of fifty small messages cover a 32-bit value range. Medians do not add, so neither a weighted average nor a median of medians is the global median, even for equal shards. Merging the heaps is exact but moves every element, which the question rules out.
- q: >-
    A bag records pending[7] += 1 when asked to remove a 7 it does not contain. What happens later?
  options: ["The median shifts once, then corrects itself on the next add", "A later 7 is discarded as stale when it reaches a root", "Nothing, since pending counts are ignored for absent values", "The bag raises KeyError the next time 7 is added to low"]
  answer: 1
  explanation: >-
    Pruning cannot tell a genuinely removed 7 from a new one: whenever a 7 reaches a root while pending[7] > 0 it is popped, and the live counts no longer match what is physically present. Tracking live copies per value and making the removal of an absent value a no-op prevents it; the error does not correct itself.
- q: >-
    Why can Kth Largest in a Stream keep only a min-heap of size k, while kth largest with deletions needs a second heap?
  options: ["A size-k min-heap cannot delete, but a max-heap of the rest can delete anything", "With deletions the answer becomes the median, which always needs two heaps", "Insert-only, the boundary never falls; a deletion can need an evicted value", "Deletions make the min-heap unstable, so a max-heap is needed to break ties"]
  answer: 2
  explanation: >-
    In an insert-only stream the kth largest never falls, so nothing below it is read again and the lower side need not be stored. Deleting a top-k value lowers the boundary, and the replacement is the largest of the rest, which is exactly what a max-heap of the rest provides. Stability and heap-specific deletion are not the issue.
```
