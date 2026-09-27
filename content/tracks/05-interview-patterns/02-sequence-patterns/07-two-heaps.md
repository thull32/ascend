---
slug: two-heaps
title: "Two heaps: the running median and other split-the-stream problems"
description: Keep a stream partitioned into a lower half and an upper half with a max-heap and a min-heap, so the median (or any balance point) is always one comparison away.
minutes: 30
difficulty: hard
tags: [heap, median, streaming, lazy-deletion, pattern:two-heaps]
problems: [find-median-data-stream, sliding-window-median]
---
A latency dashboard shows p50 for the last minute of requests. New timings arrive a thousand times a second; old ones fall out of the window. Recomputing the median by sorting the window on every tick is `O(n log n)` per tick, which is fine at a hundred requests and hopeless at a million. You need a structure where inserting is cheap and the median is always sitting somewhere you can read it.

The median is not a "largest" or "smallest" question, so one heap will not do. But it *is* a boundary question: it separates the smaller half of the data from the larger half. Two heaps, one per half, facing each other, keep that boundary current after every insert.

## The signal

Two heaps is the pattern when the statement asks for:

- **"Median of a stream"** or **"median of each window"**: [Find Median from Data Stream](/practice/find-median-data-stream), [Sliding Window Median](/practice/sliding-window-median).
- **A partition point that moves.** "The k-th smallest so far where k tracks half the size", or any quantile, is the same structure with a different balance rule.
- **Two populations where you repeatedly need the max of one and the min of the other.** The classic is the "maximise capital" shape: projects become *affordable* in order of capital (min-heap) and you always want the most *profitable* affordable one (max-heap). Elements migrate from one heap to the other as a threshold rises.
- **Scheduling with a moving threshold**: "of all jobs available now, run the highest priority", where availability is by start time.

What rules it out:

- **You only need the maximum or minimum.** One heap; go to [Top-k elements](/learn/interview-patterns/sequence-patterns/top-k-elements).
- **All data is present up front and you need the median once.** Sort, or quickselect in `O(n)`.
- **You need arbitrary-rank queries** (the 37th percentile, then the 90th). Two heaps only track one boundary. Use a balanced BST or an order-statistics tree; see [Ordered maps vs hash maps](/learn/data-structures/hashing/ordered-maps-vs-hash-maps).
- **Values are small integers.** A count array of size `V` gives the median by a prefix scan in `O(V)`, which for `V = 1000` beats any heap.

The confusable pattern is the single size-k heap. Ask yourself: does the answer sit at the *top* of a group of candidates, or at the *boundary* between two groups? Top means one heap; boundary means two.

## The template

Keep `low`, a max-heap holding the smaller half, and `high`, a min-heap holding the larger half. Two invariants hold after every operation:

1. **Order:** every element of `low` is `≤` every element of `high`.
2. **Balance:** `len(low)` equals `len(high)` or exceeds it by exactly one.

With those invariants the median is `low.top()` when the total is odd and `(low.top() + high.top()) / 2` when it is even. Insert by pushing onto `low`, then moving `low`'s max to `high` (this repairs order), then moving `high`'s min back to `low` if `high` became larger (this repairs balance). Two or three `O(log n)` heap operations per insert, and the median read is `O(1)`.

```python
import heapq

class MedianFinder:
    def __init__(self):
        self.low = []    # max-heap via negation: smaller half
        self.high = []   # min-heap: larger half

    def add(self, x):
        heapq.heappush(self.low, -x)                          # 1. into low
        heapq.heappush(self.high, -heapq.heappop(self.low))   # 2. low's max -> high (order)
        if len(self.high) > len(self.low):                    # 3. rebalance
            heapq.heappush(self.low, -heapq.heappop(self.high))

    def median(self):
        if len(self.low) > len(self.high):
            return -self.low[0]
        return (-self.low[0] + self.high[0]) / 2
```

The "push to low, then bubble the max over" sequence is deliberately unconditional. A version that decides up front which heap to push onto (`if x <= low.top()`) saves one operation but needs an empty-heap guard and is where most bugs live. Write the unconditional version first; optimise if asked.

```javascript
// Assumes a MinHeap class with push/pop/peek/size and a comparator
// (see the top-k lesson for a 30-line implementation).
class MedianFinder {
  constructor() {
    this.low = new MinHeap((a, b) => b - a);   // max-heap
    this.high = new MinHeap((a, b) => a - b);  // min-heap
  }
  add(x) {
    this.low.push(x);
    this.high.push(this.low.pop());
    if (this.high.size() > this.low.size()) this.low.push(this.high.pop());
  }
  median() {
    if (this.low.size() > this.high.size()) return this.low.peek();
    return (this.low.peek() + this.high.peek()) / 2;
  }
}
```

```viz
{"type": "heap", "algorithm": "two-heaps-median", "values": [5, 15, 1, 3, 8, 7], "title": "Two heaps tracking the median of 5, 15, 1, 3, 8, 7", "caption": "Every element enters the max-heap, its largest element crosses to the min-heap, and the sizes are rebalanced so the median stays at the tops."}
```

The reason the order invariant survives step 2 is worth being able to say aloud: after pushing `x` onto `low`, the only element that could violate "all of low ≤ all of high" is `low`'s new maximum (it might be bigger than `high`'s minimum). Moving exactly that element across fixes it. Step 3 moves `high`'s *minimum* back, which is by construction `≥` everything remaining in `low`, so order still holds.

## Worked problems

### Find median from data stream

[Find Median from Data Stream](/practice/find-median-data-stream): support `add(x)` and `median()` over an unbounded stream, with `median()` returning the average of the two middle values when the count is even.

Insight: the template above, unchanged. The trace shows every step of the three-step insert so you can see the invariants being repaired.

Stream `5, 15, 1, 3, 8, 7`. Heaps are shown as sets with the top marked with `*`.

| Insert | After step 1 (push low) | After step 2 (low max → high) | After step 3 (rebalance) | Median |
|---|---|---|---|---|
| 5 | low `{5*}` high `{}` | low `{}` high `{5*}` | low `{5*}` high `{}` | 5 |
| 15 | low `{15*, 5}` | low `{5*}` high `{15*}` | balanced, no change | (5+15)/2 = 10 |
| 1 | low `{5*, 1}` | low `{1*}` high `{5*, 15}` | low `{5*, 1}` high `{15*}` | 5 |
| 3 | low `{5*, 1, 3}` | low `{3*, 1}` high `{5*, 15}` | balanced | (3+5)/2 = 4 |
| 8 | low `{8*, 1, 3}` | low `{3*, 1}` high `{5*, 8, 15}` | low `{5*, 1, 3}` high `{8*, 15}` | 5 |
| 7 | low `{7*, 1, 3, 5}` | low `{5*, 1, 3}` high `{7*, 8, 15}` | balanced | (5+7)/2 = 6 |

Check against the sorted prefixes: after four elements the sorted data is `1, 3, 5, 15` with median 4; after six it is `1, 3, 5, 7, 8, 15` with median 6. Both match.

Complexity: `O(log n)` per insert, `O(1)` per median, `O(n)` space. The follow-up every interviewer asks: "what if all numbers are in `[0, 100]`?" Then a 101-slot count array with a running total gives `O(1)` insert and `O(100)` median, and the heaps are the wrong tool. "What if 99% of the numbers are in `[0, 100]`?" Count array for the range plus two small heaps for the outliers, and the median scan checks which region it lands in.

### Sliding window median

[Sliding Window Median](/practice/sliding-window-median): given `nums` and a window size `k`, return the median of every window as it slides one position at a time.

Insight: inserting is the template; the new difficulty is *removing* the element that leaves the window, and a binary heap cannot delete from the middle. The fix is **lazy deletion**: record the value in a `delayed` map of pending removals, keep separate live counts for each heap so the balance rule uses real sizes, and physically discard a stale element only when it surfaces at a heap's top. Every element is pushed once and popped once, so the amortised cost stays `O(log k)`.

```python
def window_medians(nums, k):
    low, high = [], []                   # max-heap (negated), min-heap
    delayed = defaultdict(int)           # value -> pending removals
    live = {"low": 0, "high": 0}         # live counts, not len(heap)

    def prune(heap, name):               # discard stale tops
        while heap:
            v = -heap[0] if name == "low" else heap[0]
            if not delayed[v]:
                break
            delayed[v] -= 1
            heapq.heappop(heap)

    def rebalance():
        if live["low"] > live["high"] + 1:
            heapq.heappush(high, -heapq.heappop(low))
            live["low"] -= 1; live["high"] += 1
            prune(low, "low")
        elif live["low"] < live["high"]:
            heapq.heappush(low, -heapq.heappop(high))
            live["high"] -= 1; live["low"] += 1
            prune(high, "high")

    def add(x):
        if not low or x <= -low[0]:
            heapq.heappush(low, -x); live["low"] += 1
        else:
            heapq.heappush(high, x); live["high"] += 1
        rebalance()

    def remove(x):
        delayed[x] += 1
        if x <= -low[0]:
            live["low"] -= 1
            if x == -low[0]:
                prune(low, "low")
        else:
            live["high"] -= 1
            if x == high[0]:
                prune(high, "high")
        rebalance()

    def median():
        return -low[0] if k % 2 else (-low[0] + high[0]) / 2

    out = []
    for i, x in enumerate(nums):
        add(x)
        if i >= k:
            remove(nums[i - k])
        if i >= k - 1:
            out.append(median())
    return out
```

The invariant that makes lazy deletion safe: **the top of each heap is always live.** `remove` prunes immediately if it removes a top; `rebalance` prunes after every pop because a stale element may have risen to the top. Since only tops are ever read, stale elements deeper in the heap are harmless.

Trace on `nums = [1, 3, -1, -3, 5, 3, 6]`, `k = 3`. Live elements shown; `~x` marks a stale element still physically in a heap.

| i | Event | low (live, max first) | high (live, min first) | Pending | Median |
|---|---|---|---|---|---|
| 0 | add 1 | `1` | – | – | – |
| 1 | add 3 | `1` | `3` | – | – |
| 2 | add -1 | `1, -1` | `3` | – | **1** |
| 3 | add -3, remove 1 | `-1, -3` | `3` | – | **-1** |
| 4 | add 5, remove 3 | `-1, -3` | `5` | – | **-1** |
| 5 | add 3, remove -1 | `3, -3` | `5` | – | **3** |
| 6 | add 6, remove -3 | `5, 3` | `6` | – | **5** |

At `i = 3`, removing `1` hits `low`'s top, so it is pruned at once and `-1` takes over. At `i = 5`, adding `3` goes to `high` (3 > -1), the live counts become low 2 / high 2, then removing `-1` (low's top) prunes it to low 1 / high 2, and rebalance moves `3` from `high` to `low`. The medians `[1, -1, -1, 3, 5]` match a brute-force sort of each window.

Where a pending removal actually lingers: remove a value that sits *below* the top of its heap. Say the window is `[4, 9, 6]` and `4` leaves while `low = {6*, 4}`. `4` is marked delayed, `live["low"]` drops, but `4` stays in the heap until `6` is popped and `4` rises to the top, at which point `prune` discards it.

Complexity: `O(n log n)` time in the worst case (stale elements can accumulate up to `n`), `O(n)` space for the same reason. A sorted container (a balanced BST with size augmentation, or `SortedList` in Python's `sortedcontainers`) gives true `O(log k)` deletion and `O(k)` space; mention it and say why you would not implement a red-black tree in a 45-minute round. See [Indexed heaps and decrease-key](/learn/data-structures/heaps/indexed-heaps-and-decrease-key) for the alternative of a heap that supports deletion by index.

### Maximise capital (the threshold-migration shape)

There is no Ascend practice problem for this shape, but it is asked often enough to trace. You have `k` rounds, starting capital `w`, and projects with `capital[i]` (required to start) and `profits[i]` (added to `w` on completion). Pick at most `k` projects to maximise final capital.

Insight: two heaps with elements *migrating* between them. `by_cap` is a min-heap of projects by required capital: the ones you cannot afford yet. `avail` is a max-heap of profits: the ones you can. Each round, move everything with `capital ≤ w` from `by_cap` to `avail`, then take the top of `avail`.

Trace with `k = 3`, `w = 1`, `profits = [3, 1, 4, 1, 5]`, `capital = [1, 1, 2, 3, 10]`:

| Round | w before | Migrated to `avail` (profit) | `avail` max | w after |
|---|---|---|---|---|
| 1 | 1 | projects with cap ≤ 1: 3, 1 | 3 | 4 |
| 2 | 4 | cap ≤ 4: 4, 1 | 4 | 8 |
| 3 | 8 | cap ≤ 8: none new | 1 | 9 |

Final capital 9. Each project migrates once and is popped at most once, so the total is `O(n log n + k log n)`. The exercise below asks you to implement exactly this.

## Variations

- **Odd/even conventions.** Some statements want the lower median for even counts, some the upper, some the mean. The balance invariant (`low` may be one bigger) gives you the lower median at `low.top()`; flip it if the statement wants the upper. Decide before coding and say it.
- **Weighted median** ("the point where cumulative weight crosses half"). Keep total weight per heap instead of counts and rebalance on weight; the heap operations are the same.
- **Any fixed quantile.** For the p-th percentile keep `len(low) ≈ p · n`. The rebalance condition changes; the two-heap structure does not.
- **Median with deletions in arbitrary order** (not a sliding window). Lazy deletion still works as long as every deleted value was inserted; the `delayed` map handles duplicates by counting.
- **Merge intervals of availability** ("meeting rooms with a running count of concurrent meetings"): the min-heap of end times in the [intervals](/learn/interview-patterns/array-patterns/intervals) lesson is the one-heap cousin; add a second heap when you also need the *largest* thing among the active set.

## Pitfalls

- **Reading `len(heap)` for balance after lazy deletion.** Stale elements inflate the length. Keep explicit live counts and use those in every balance decision.
- **Forgetting to prune after a rebalance pop.** The element that rises to the top after a pop may be stale. Prune after every pop, not only in `remove`.
- **Deciding the heap by comparing with an empty `low`.** `x <= -low[0]` throws on the first insert. Either guard `not low` or use the unconditional push-then-migrate form of the template.
- **Integer division for the even-count median.** `(a + b) // 2` in Python truncates and `(a + b) >> 1` in JavaScript overflows past 2³¹; use `/ 2` and return a float, or return the pair if the statement allows.
- **Negation sign errors.** Every read of `low[0]` must be negated; every push must negate. A helper (`low_top = lambda: -low[0]`) removes a whole class of bugs.
- **Recomputing from scratch in the sliding window.** Sorting each window is `O(n k log k)`. Interviewers accept it as a baseline for ten seconds, then expect the two-heap or sorted-container version.

## Exercise

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

## Senior signals

- You state both invariants (order between the heaps, sizes within one) before writing code, and you can say which step of the insert repairs which invariant.
- You know a binary heap cannot delete from the middle and reach for lazy deletion with live counts, or name a sorted container as the alternative and explain the trade-off.
- You ask about the value range and switch to a count array when it is small, and you can describe the hybrid for mostly-bounded data.
- You recognise the threshold-migration shape (affordable vs not-yet-affordable) as the same pattern with elements crossing between heaps.
- You mention that production percentile tracking uses approximate sketches (t-digest, HdrHistogram) because exact medians over billions of events are neither necessary nor affordable, and you know when exactness actually matters.

## Check yourself

```quiz
- q: >-
    After inserting into the two-heap median structure, why is the element moved from low to high always the correct one to move?
  options: ["Because the median always lives at the top of high", "It is low's max, the only element that can exceed high's min", "Because it is the newest element, which is unplaced", "Because moving it is what keeps the two heap sizes within one"]
  answer: 1
  explanation: >-
    Pushing onto low can only break "all of low ≤ all of high" via low's new maximum. Moving exactly that element across restores order. Balance is a separate invariant, repaired afterwards by the size check, which may move high's minimum back.
- q: >-
    In the sliding window median with lazy deletion, which quantity must the rebalance rule use?
  options: ["The number of pending removals in the delayed map", "The window size k, compared with the larger heap's size", "len(low) and len(high), read directly off the heaps", "Live element counts for each heap, tracked separately"]
  answer: 3
  explanation: >-
    Stale elements still sit inside the heaps and inflate len(). Balancing on physical sizes lets the median drift to the wrong element. Explicit live counts, decremented at logical removal time, are the only correct basis.
- q: >-
    A stream median service receives 50 million values per second and only needs p50 within 1%. The senior choice is:
  options: ["A sorted list kept up to date with bisect insertion", "Two heaps, rebuilt for each second of incoming data", "An approximate quantile sketch such as t-digest", "A balanced BST augmented with its subtree sizes"]
  answer: 2
  explanation: >-
    Exact structures are O(n) memory and O(log n) per event; at that rate the memory alone is prohibitive and the accuracy is not needed. Sketches give bounded error in constant memory and are what monitoring systems actually use.
- q: >-
    You decide the target heap by comparing x with low's top before pushing. What extra case must you handle that the push-then-migrate version avoids?
  options: ["Even totals, where both tops are needed", "The first insert, when low is empty", "Duplicate values equal to low's top", "Negative values that flip when negated"]
  answer: 1
  explanation: >-
    The conditional version reads low[0] on every insert, which throws on the first one. The unconditional push-then-migrate sequence never reads an empty heap.
- q: >-
    Which problem shape is NOT a fit for two heaps?
  options: ["The lower median of an unbounded stream of values", "The median of every window as it slides one step", "The 37th and 90th percentiles of one stream on demand", "The most profitable affordable project as capital grows"]
  answer: 2
  explanation: >-
    Two heaps track a single boundary. Multiple arbitrary quantiles need an order-statistics tree or a sketch. The other three are all one moving partition point.
```
