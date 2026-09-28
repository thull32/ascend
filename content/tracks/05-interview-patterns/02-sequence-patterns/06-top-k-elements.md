---
slug: top-k-elements
title: "Top-k elements: the size-k heap and the greedy scheduler"
description: Recognise "k largest", "k closest", "most frequent" and "repeatedly take the biggest" problems, prove why a size-k min-heap never discards an answer, trace four problems heap array by heap array, and know when quickselect, buckets or an ordered set beat it.
minutes: 32
difficulty: medium
tags: [heap, priority-queue, top-k, greedy, pattern:heap]
problems: [kth-largest-array, k-closest-points, kth-largest-stream, last-stone-weight, top-k-frequent, task-scheduler, reorganize-string, design-twitter]
---
You have a million request latencies and need the ten slowest. The obvious code is `sorted(latencies, reverse=True)[:10]`, and it is correct: measured with CPython 3.14 on a Ryzen 9 9950X3D desktop, it takes about 137 ms for 10⁶ random floats. `heapq.nlargest(10, latencies)` returns the same list in about 5 ms. The sort spent almost all of its work ordering 999,990 values you then threw away.

The top-k pattern is the discipline of not doing that work. Keep the `k` best candidates seen so far in a heap whose root is the *weakest* of them. Each new element competes with that one root: it loses in one comparison, or it evicts the root in `O(log k)`. On a random stream almost everything loses; of those million latencies, 107 ever entered a size-10 heap. The pattern's second shape uses the heap as a greedy engine: pop the best candidate, act on it, push back what is left of it.

The interviewer is testing whether you pick the right polarity, can say why evicting the root never loses an answer, and know what breaks that argument (deletions, `k ≈ n`, frequencies split across shards) and which tool wins then.

## The signal

Reach for a size-k heap when the statement says:

- **"k largest / smallest / closest / most frequent"**, `k` a parameter much smaller than `n`. Return the heap's contents.
- **"kth largest"**. Same heap; return the root.
- **A stream with a query after each arrival**: "`add(x)` returns the kth largest so far" ([Kth Largest in a Stream](/practice/kth-largest-stream)). You cannot sort what has not arrived.
- **"Repeatedly take the largest and act on it"**: [Last Stone Weight](/practice/last-stone-weight), [Reorganize String](/practice/reorganize-string), [Task Scheduler](/practice/task-scheduler). The heap holds every candidate; the loop is pop, act, push back.
- **"The newest 10 across everyone I follow"** ([Design Twitter](/practice/design-twitter)): a [k-way merge](/learn/interview-patterns/sequence-patterns/k-way-merge) of per-user lists, stopped after 10.

Each row below reads like top-k and is not:

| Statement says | Pattern | Why |
|---|---|---|
| "kth largest", all `n` in memory, `k` near `n/2`, array may be modified | [Quickselect](/learn/algorithms/sorting-searching/selection-and-order-statistics) | At `k = n/2` the heap is `O(n log n)`; quickselect is `O(n)` expected: 107 ms against the heap's 234 ms, measured below |
| "kth smallest in a BST" ([problem](/practice/kth-smallest-bst)) | In-order traversal that stops at `k` | The tree is already ordered: `O(h + k)`, no heap |
| "Top k, but scores change or items are deleted" | [Indexed heap](/learn/data-structures/heaps/indexed-heaps-and-decrease-key) or a sorted container over all `n` | Eviction stops being permanent; the element you need back was evicted |
| "k most frequent", counts bounded by `n` | Buckets indexed by count | `O(n)` counting sort on frequencies, no `log` |
| "Maximum of every window of size k" ([problem](/practice/sliding-window-maximum)) | [Monotonic deque](/learn/data-structures/stacks-queues/monotonic-deque) | Elements expire by position, not rank; the deque is `O(n)` |
| "Median of a stream" | [Two heaps](/learn/interview-patterns/sequence-patterns/two-heaps) | The answer sits at a boundary, not at a top |
| "kth smallest across k sorted lists" or in a sorted matrix | [K-way merge](/learn/interview-patterns/sequence-patterns/k-way-merge) or binary search on the value | The inputs are sorted; the heap holds one head per list |
| "k closest values to `x`" in a sorted array | [Binary search](/learn/interview-patterns/array-patterns/binary-search) then two pointers | Sortedness gives `O(log n + k)` |

The one-line test: the answer is the best `k` of one pile, and the pile only grows. Anything else is one of the rows above.

## The template

To keep the `k` **largest** you keep a **min**-heap: its root is the weakest candidate, the one to evict when something better arrives.

```python
import heapq

def k_largest(nums, k):
    """The k largest values, largest first. O(n log k) time, O(k) space."""
    if k <= 0:
        return []
    heap = []                           # min-heap; heap[0] is the weakest kept value
    for x in nums:
        if len(heap) < k:
            heapq.heappush(heap, x)     # still filling: every value is a candidate
        elif x > heap[0]:               # beats the kth largest so far
            heapq.heapreplace(heap, x)  # overwrite the root, one sift down
        # else: rejected with a single comparison, heap untouched
    heap.sort(reverse=True)             # O(k log k); drop it if order does not matter
    return heap

def k_best(items, k, key):
    """The k items with the largest key(item). Items need not be comparable."""
    if k <= 0:
        return []                        # otherwise heap[0] below reads an empty list
    heap = []
    for seq, item in enumerate(items):
        entry = (key(item), -seq, item)  # -seq: among equal keys, later items are weaker
        if len(heap) < k:
            heapq.heappush(heap, entry)
        elif entry > heap[0]:            # decided by key, then -seq; never reaches item
            heapq.heapreplace(heap, entry)
    return [item for _, _, item in sorted(heap, reverse=True)]
```

`heapreplace` pops the root and pushes `x` in a single sift, which is why the `x > heap[0]` test must come first: called blindly, it evicts the root even when `x` is worse. For the `k` smallest, flip the polarity: push `-x` (or `(-key, seq, item)`) so the root is the largest kept value.

JavaScript has no heap in its standard library. This is the class to write, once, in any interview that needs one:

```javascript
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
  replace(x) { const top = this.a[0]; this.a[0] = x; this.siftDown(0); return top; }
  siftUp(i) {                            // move a[i] towards the root
    const a = this.a, x = a[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(x, a[p]) >= 0) break; // parent is not worse: stop
      a[i] = a[p]; i = p;                // shift the parent down into the hole
    }
    a[i] = x;
  }
  siftDown(i) {                          // move a[i] towards the leaves
    const a = this.a, n = a.length, x = a[i];
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && this.cmp(a[c + 1], a[c]) < 0) c++; // the smaller child
      if (this.cmp(a[c], x) >= 0) break;
      a[i] = a[c]; i = c;
    }
    a[i] = x;
  }
}

function kLargest(nums, k) {
  const heap = new MinHeap();
  for (const x of nums) {
    if (heap.size() < k) heap.push(x);
    else if (x > heap.peek()) heap.replace(x);
  }
  return heap.a.sort((a, b) => b - a);
}
```

The sifts move a *hole* rather than swapping at every level: one array write per level instead of two, and no destructuring swap, which builds a temporary array until V8's optimising compiler removes it. The comparator makes one class serve as a max-heap (`(a, b) => b - a`) or a heap of records (`(a, b) => a.d - b.d || a.i - b.i`). In an interview, say "JavaScript has no priority queue; I will write a 35-line binary heap with a comparator", or ask whether you may assume one. Do not keep an array sorted by calling `sort` after every insert: that is `O(n log n)` per operation in general and `O(n)` even on V8's TimSort for an already-sorted array. Measured on Node 24, 20,000 inserts with a sort after each took 2,276 ms; 20,000 heap pushes took 0.7 ms.

```viz
{"type": "heap", "algorithm": "top-k", "values": [3, 2, 1, 5, 6, 4], "k": 2, "kind": "min", "title": "Size-2 min-heap keeping the 2 largest", "caption": "Each new value competes only with the root; the root is always the kth largest seen so far."}
```

### Why evicting the root never loses an answer

The invariant, stated the way you would say it aloud:

> After the first `i` elements, the heap holds `min(i, k)` of them, and they are a largest-`k` multiset of the first `i`. So once `i ≥ k`, the root is the kth largest so far.

The root claim follows from the heap property: the root is the smallest of the kept elements, and the smallest of the top `k` is the kth largest. Each arrival `x` preserves the invariant. If `x ≤ root`, all `k` kept values are at least `x`, so they are still a valid top `k` of the first `i + 1`. If `x > root`, the `k + 1` candidates (kept plus `x`) contain `k` values larger than the root, so the root is at best the `(k+1)`th largest, and dropping it leaves a valid top `k`.

Why the evicted value can be forgotten forever: **the kth largest of a growing multiset never decreases.** Every arrival either leaves the threshold alone or raises it, so a value that fell below the threshold stays below it. That monotonicity is the whole pattern. Deletion breaks it (remove a top-`k` value and the threshold falls, and the value that should re-enter was already discarded), which is why "and scores can change" moves the problem to a different structure.

### The second shape: the heap as a greedy engine

```python
import heapq

def greedy_drain(counts):
    """Repeatedly take the item with the most units left, use one, put it back."""
    heap = [(-c, item) for item, c in counts.items() if c > 0]
    heapq.heapify(heap)                     # O(m) bottom-up build, not m pushes
    order = []
    while heap:
        c, item = heapq.heappop(heap)       # c is -(units left)
        order.append(item)
        if c + 1 < 0:                       # units remain after this one
            heapq.heappush(heap, (c + 1, item))
    return order
```

Termination: the total number of units left falls by exactly one per iteration, and an entry with none left is never pushed back. Real problems add a rule between pop and push: hold the item out for one turn (Reorganize String) or for `n` turns (Task Scheduler). `heapify` is `O(m)` because most nodes sit near the leaves and sift a level or two; the mechanics are in [binary heap mechanics](/learn/data-structures/heaps/binary-heap-mechanics).

```viz
{"type": "heap", "algorithm": "heapify", "kind": "max", "values": [3, 9, 2, 7, 5, 8, 1], "title": "Bottom-up heapify for the greedy engine", "caption": "Sift-down runs from the last internal node back to the root. Most nodes are near the leaves and move at most one level, which is why the build is O(n)."}
```

## Worked problems

### Kth largest element in an array

[Kth Largest Element in an Array](/practice/kth-largest-array): return the kth largest value, duplicates counted as separate positions.

Trace on `nums = [7, 10, 4, 3, 20, 15, 11, 9]`, `k = 3`. The heap column is the Python list in array order, so `heap[0]` is the root and `heap[1]`, `heap[2]` are its children:

| x | Root before | Test | Action | Heap array after |
|---|---|---|---|---|
| 7 | – | size 0 < 3 | push | `[7]` |
| 10 | 7 | size 1 < 3 | push | `[7, 10]` |
| 4 | 7 | size 2 < 3 | push; 4 < 7 sifts up | `[4, 10, 7]` |
| 3 | 4 | 3 > 4? no | reject, one comparison | `[4, 10, 7]` |
| 20 | 4 | 20 > 4 | replace root; 7 is the smaller child and moves up | `[7, 10, 20]` |
| 15 | 7 | 15 > 7 | replace root; 10 moves up | `[10, 15, 20]` |
| 11 | 10 | 11 > 10 | replace root; 11 is below both children, ends at the root | `[11, 15, 20]` |
| 9 | 11 | 9 > 11? no | reject | `[11, 15, 20]` |

Answer: the root, `11`. Sorted descending the input is `20, 15, 11, 10, 9, 7, 4, 3`, and the third value is `11`. Notice the root only ever rose (4, 7, 10, 11): that is the monotone threshold from the proof, visible in the table.

Time `O(n log k)`, space `O(k)`. For a one-shot query on a mutable array, name sort, heap and quickselect and choose by `k` and mutability.

### K closest points to the origin

[K Closest Points to Origin](/practice/k-closest-points): return the `k` points nearest `(0, 0)`.

You want the `k` *smallest* distances, so the root must be the *largest* kept distance: a max-heap of size `k`. Compare squared distances (the square root is monotone and costs time). Python gets the max-heap by storing `(-d², index)`; the index is the tiebreaker, so two points at equal distance never compare their coordinate lists.

Trace on `[[2,3], [-1,1], [4,-4], [0,2], [-3,-1], [1,-1]]`, `k = 3`:

| Point (index) | d² | Test | Action | Heap array after, as `(−d², index)` |
|---|---|---|---|---|
| (2,3) #0 | 13 | size < 3 | push | `[(-13,0)]` |
| (−1,1) #1 | 2 | size < 3 | push | `[(-13,0), (-2,1)]` |
| (4,−4) #2 | 32 | size < 3 | push; −32 sifts to the root | `[(-32,2), (-2,1), (-13,0)]` |
| (0,2) #3 | 4 | 4 < 32 | replace root; `(-13,0)` moves up | `[(-13,0), (-2,1), (-4,3)]` |
| (−3,−1) #4 | 10 | 10 < 13 | replace root; ends at the root | `[(-10,4), (-2,1), (-4,3)]` |
| (1,−1) #5 | 2 | 2 < 10 | replace root; `(-4,3)` moves up | `[(-4,3), (-2,1), (-2,5)]` |

Result: indices 3, 1, 5, the points `(0,2)`, `(−1,1)`, `(1,−1)`. The last row holds two entries with `−d² = −2`, ordered by index, never by the lists. Write the admission test as `d < -heap[0][0]`: one negation instead of two.

### Top k frequent elements

[Top K Frequent Elements](/practice/top-k-frequent): return the `k` values that occur most often.

Two passes. Count with a hash map (`O(n)`), then run the size-k min-heap over the `m` distinct `(count, value)` pairs (`O(m log k)`). Trace on `nums = [7, 1, 3, 5, 1, 3, 5, 3, 5, 5, 9]`, `k = 3`. The counter, in first-occurrence order, is `7:1, 1:2, 3:3, 5:4, 9:1`:

| Pair | Root before | Action | Heap array after |
|---|---|---|---|
| (1, 7) | – | push | `[(1,7)]` |
| (2, 1) | (1,7) | push | `[(1,7), (2,1)]` |
| (3, 3) | (1,7) | push | `[(1,7), (2,1), (3,3)]` |
| (4, 5) | (1,7) | (4,5) > (1,7): replace; `(2,1)` moves up | `[(2,1), (4,5), (3,3)]` |
| (1, 9) | (2,1) | (1,9) > (2,1)? no: reject | `[(2,1), (4,5), (3,3)]` |

Answer `{1, 5, 3}`. Because every count lies in `1..n`, an array of `n + 1` buckets indexed by count, walked from the top, answers in `O(n)` with no heap; the [hash-map patterns](/learn/interview-patterns/sequence-patterns/hash-map-patterns) lesson traces it. `Counter(nums).most_common(k)` is the heap version in one call (see "Under the hood").

### Reorganize String: the greedy engine with a hold-back

[Reorganize String](/practice/reorganize-string): rearrange so no two adjacent characters are equal, or return `""`.

Always place the character with the most copies left, except the one you placed last. A max-heap of `(-count, ch)` gives the first; holding the last character out of the heap for one turn gives the second.

```python
import heapq
from collections import Counter

def reorganize(s):
    heap = [(-c, ch) for ch, c in Counter(s).items()]
    heapq.heapify(heap)
    out, prev = [], None                  # prev: (neg count, ch) held out this turn
    while heap:
        c, ch = heapq.heappop(heap)
        out.append(ch)
        if prev and prev[0] < 0:
            heapq.heappush(heap, prev)    # last turn's character may return
        prev = (c + 1, ch)                # one copy used
    return "".join(out) if len(out) == len(s) else ""
```

Trace on `s = "aaabcc"`. `heapify` turns `[(-3,a), (-1,b), (-2,c)]` into the same array, already a valid heap:

| Turn | Pop | Heap array after pop | Push back | Heap array after push | Output | `prev` |
|---|---|---|---|---|---|---|
| 1 | (−3,a) | `[(-2,c), (-1,b)]` | – | `[(-2,c), (-1,b)]` | `a` | (−2,a) |
| 2 | (−2,c) | `[(-1,b)]` | (−2,a) | `[(-2,a), (-1,b)]` | `ac` | (−1,c) |
| 3 | (−2,a) | `[(-1,b)]` | (−1,c) | `[(-1,b), (-1,c)]` | `aca` | (−1,a) |
| 4 | (−1,b) | `[(-1,c)]` | (−1,a) | `[(-1,a), (-1,c)]` | `acab` | (0,b) |
| 5 | (−1,a) | `[(-1,c)]` | – (count 0) | `[(-1,c)]` | `acaba` | (0,a) |
| 6 | (−1,c) | `[]` | – | `[]` | `acabac` | (0,c) |

Six characters out, so `"acabac"` is returned. Turn 4 shows the tuple tiebreak at work: `(-1,b)` and `(-1,c)` tie on count and `b` wins on the character. On `"aaab"` the loop emits `aba` and stops with `prev = (-1, a)` still holding a copy; the length check fails and the function returns `""`. That check is the correctness argument: the greedy fails only when one character has more than `⌈n/2⌉` copies, and the leftover copy is what the length mismatch detects. Time `O(n log σ)` for an alphabet of `σ` letters; with `σ = 26` the heap never holds more than 26 entries, so each operation is at most 5 sift levels and the loop is linear in `n`.

### Last Stone Weight

[Last Stone Weight](/practice/last-stone-weight) is the engine with no hold-back: pop the two heaviest, push back a non-zero difference. On `[6, 3, 9, 2, 5]` the max-heap array after `heapify` is `[9, 5, 6, 2, 3]`; smashing 9 and 6 pushes 3 (`[5, 3, 3, 2]`), 5 and 3 push 2 (`[3, 2, 2]`), 3 and 2 push 1 (`[2, 1]`), 2 and 1 push 1: answer `1`. Each round removes at least one stone, so at most `n − 1` rounds of `O(log n)`.

```viz
{"type": "heap", "algorithm": "push-pop", "kind": "max", "operations": [["push", 6], ["push", 3], ["push", 9], ["push", 2], ["push", 5], ["pop"], ["pop"], ["push", 3], ["pop"], ["pop"], ["push", 2], ["pop"], ["pop"], ["push", 1], ["pop"], ["pop"], ["push", 1]], "title": "Last Stone Weight on 6, 3, 9, 2, 5", "caption": "Two pops take the heaviest pair; the push returns the difference. The heap shrinks by at least one stone per round."}
```

## Variants

| Variant | What changes in the template | Complexity |
|---|---|---|
| k smallest | Max-heap of size `k`: push `-x` and test `-x > heap[0]`, or `heappush_max` on Python 3.14 | `O(n log k)` |
| Kth largest in a stream (a class) | `__init__` heapifies the seed and pops down to `k`; `add` is one loop body, then returns `heap[0]` | `O(n + (n−k) log n)` to seed, `O(log k)` per `add` |
| k most frequent | Count, then the heap over `(count, value)`; or buckets by count | `O(n + m log k)`, or `O(n)` |
| k most frequent words, ties alphabetical | Weakest entry is the lower count, then the *later* word: a wrapper `__lt__`, or heapify all `(-count, word)` and pop `k` | `O(m log k)`, or `O(m + k log m)` |
| Greedy engine | Heap of all candidates; pop, act, push back the remainder | `O(n log n)`; `O(n log σ)` over an alphabet |
| Greedy with a cooldown ([Task Scheduler](/practice/task-scheduler)) | Popped tasks wait in a FIFO queue with a release time, then re-enter the heap | `O(T log σ)` for `T` time slots |
| Newest 10 across followees | One head per followee, a k-way merge stopped after 10 pops | `O(f + 10 log f)` |
| k largest with deletions or updates | Not this template: indexed heap or ordered set over all `n` | `O(log n)` per update |

## Complexity, derived

Each of the `n` elements costs one comparison against `heap[0]`. An element that enters costs one sift of at most `⌊log₂ k⌋` levels (CPython's `heapreplace` walks the hole to a leaf with one comparison per level, then bubbles back, usually one or two steps). So the bound is `n + E · c · log₂ k` comparisons, where `E ≤ n` is the number of entries and `c` is a small constant. The worst case, `E = n`, gives `O(n log k)`.

`E` is usually tiny. On random order, element `i` enters only if it is among the `k` largest of the first `i`, probability `k/i`, so `E ≈ k + Σ_{i=k+1}^{n} k/i ≈ k + k ln(n/k)`. Measured on 10⁶ random floats, and on the same floats sorted ascending, where every element beats the root:

| `k` | Entries, random | `k + k ln(n/k)` | Entries, ascending | Time, random | Time, ascending |
|---|---|---|---|---|---|
| 10 | 107 | 125 | 1,000,000 | 13 ms | 132 ms |
| 100 | 1,030 | 1,021 | 1,000,000 | 13 ms | 148 ms |

On random input the cost is the `n` root comparisons; ascending input costs ten times more.

The alternatives, on the same 10⁶ floats (CPython 3.14, best of three):

| Approach | Time | Extra space | Stream | Mutates input | `k = 10` | `k = 500,000` |
|---|---|---|---|---|---|---|
| `sorted(a, reverse=True)[:k]` | `O(n log n)` | `O(n)` | no | no | 137 ms | 141 ms |
| `heapq.nlargest(k, a)` | `O(n log k)` | `O(k)` | yes | no | 5 ms | 806 ms |
| Hand-written loop above | `O(n log k)` | `O(k)` | yes | no | 13 ms | 234 ms |
| Quickselect, pure Python, three-way partition | `O(n)` expected | `O(1)` | no | yes | 42 ms | 107 ms |

At `k = n/2`, `log k ≈ log n` and the heap does `n log n` interpreted work; even an interpreted quickselect wins there. Building a heap is `O(n)`: `heapify` on 10⁶ floats took 14 ms, against 47 ms for 10⁶ `heappush` calls.

## Under the hood

### `nlargest`, `nsmallest` and `Counter.most_common`

Read on this machine from `Lib/heapq.py` in CPython 3.14.7, `nlargest(n, iterable, key)` has three paths:

1. `n == 1`: `max(it, default=sentinel, key=key)`, no heap at all.
2. If `len(iterable)` works and `n >= size`: `sorted(iterable, key=key, reverse=True)[:n]`. A generator has no `len`, so it never takes this path: `nlargest(10**6, (x for x in a))` took 817 ms against 153 ms for the same call on the list.
3. Otherwise it decorates: `(elem, order)` without a key, `(key(elem), order, elem)` with one, where `order` counts 0, −1, −2 … for `nlargest` (0, 1, 2 … for `nsmallest`). It heapifies the first `n` entries, caches `top = result[0][0]`, and for each later element tests `top < elem` before touching the heap. Accepted elements go in with `heapreplace`, and the result is sorted before it is returned.

The decreasing `order` makes the output identical to `sorted(..., reverse=True)[:n]`, stable ties included, and guarantees the payload is never compared. The decoration is also why `nlargest` loses at `k = n/2`: half a million tuple comparisons, each comparing a float and then maybe an int. In 3.14 `nsmallest` uses the new public `heapify_max` and `heapreplace_max`.

`Counter.most_common(k)` is `heapq.nlargest(k, self.items(), key=itemgetter(1))`; `most_common()` with no argument is a full `sorted`. Because a `Counter` is a dict, ties come out in first-occurrence order. So `[v for v, _ in Counter(nums).most_common(k)]` is the size-k heap solution in one line. Offer it, then be ready to write the loop.

### Tuple comparison, `heappushpop` and the 3.14 max-heap functions

`heapq` compares whole entries with `<`. Tuples compare field by field, so a tie on the key falls through to the next field; if that is a dict or a `ListNode`, CPython 3.14 raises `TypeError: '<' not supported between instances of 'dict' and 'dict'`. The fix is an integer between key and payload. The [priority queues lesson](/learn/data-structures/heaps/priority-queues-in-practice) covers stability; the pattern-specific point is that the tiebreak also decides *which* tied element is evicted.

Two single-sift calls, from the 3.14.7 source:

- `heappushpop(h, x)`: if `h` is non-empty and `h[0] < x`, swap `x` into the root and sift; otherwise return `x` without touching the heap. For a full size-k heap it *is* the loop body: `heappushpop(h, x)` returns whichever of `x` and the root falls out.
- `heapreplace(h, x)`: read `h[0]` (raising `IndexError` if empty), overwrite it with `x`, sift, return the old root. The returned value may be larger than `x`, so use it only after checking `x > h[0]`.

Python 3.14 adds public, C-accelerated `heapify_max`, `heappush_max`, `heappop_max`, `heapreplace_max` and `heappushpop_max` (checked on 3.14.7). Earlier versions had only private helpers used internally by `nsmallest` and `merge`. They let you keep a max-heap of strings or tuples without negation, but they do not solve mixed directions ("count descending, word ascending"), and an interview environment may run an older Python: check the version before you rely on them.

### JavaScript and V8

A heap of floats stays in V8's packed double representation, a flat array. Measured on Node 24: 10⁶ pushes then 10⁶ pops took 124 ms with numbers and 930 ms with `{v, i}` objects and a two-field comparator, so push numbers (or parallel arrays) when the hot loop allows it. The top-10 loop over 10⁶ numbers took 6 ms against 227 ms for copying and sorting the array.

## Failure modes

**`TypeError` on a tie.** *Symptom:* passes the samples, crashes on a hidden test with two equal distances or counts: `'<' not supported between instances of 'ListNode' and 'ListNode'`. *Diagnosis:* `(key, payload)` tuples; equal keys fall through to the payload. *Fix:* `(key, seq, payload)` with a unique integer `seq`.

**Wrong polarity.** *Symptom:* kth largest of `[7, 10, 4, 3, 20, 15, 11, 9]` with `k = 3` returns 7, not 11. *Diagnosis:* "largest, so max-heap": push each value into a max-heap and pop when the size exceeds 3. Each pop removes the largest, so the heap ends as `[7, 3, 4]`, the three *smallest*. *Fix:* the heap's root must be the element you would evict; for the `k` largest that is the minimum.

**Negation mistakes.** *Symptom:* `TypeError: bad operand type for unary -: 'tuple'`, or an answer with the wrong sign, or every element rejected. *Diagnosis:* negating the whole entry (`-(count, word)`), trying to negate a string, forgetting to negate on the way out, or comparing a raw `x` against a negated `heap[0]`. *Fix:* negate only the numeric field (`(-count, word)`), convert back in one helper, and for descending strings use a wrapper with a reversed `__lt__` or the 3.14 max-heap functions.

**A top-by-timestamp job ten times slower than its twin.** *Symptom:* "top 100 newest" over a time-ordered log takes 148 ms per million records where the same job over a shuffled field takes 13 ms. *Diagnosis:* ascending input; every record beats the root, so `E = n`. *Fix:* nothing for correctness; if the input is known sorted, take the last `k` directly.

**Stream memory growing without bound.** *Symptom:* a consumer's RSS climbs linearly until it is killed, on a "keep the top 50" job. *Diagnosis:* every item is pushed and the heap is trimmed only when a report is requested. *Fix:* cap at `k` on every arrival (`heappushpop` once full); memory is then `O(k)` whatever the stream length.

## Interviewer follow-ups

**"The stream is infinite and I want the top k most *frequent* items."** Model answer: exact counts need one counter per distinct item, so memory grows with the number of distinct items. Bound it with a heavy-hitters sketch: Space-Saving keeps `m` counters and hands the smallest one to each new item (a min-heap finds it), or a [count-min sketch](/learn/advanced-data-structures/probabilistic-structures/count-min-sketch-and-hyperloglog) plus a size-k heap of candidates, with an error bound stated. Common wrong answer: "a size-k heap of counts", which cannot increment an item it has evicted.

**"k is close to n."** Model answer: the heap degrades to `O(n log n)`; at `k = n/2` both quickselect (107 ms) and `sorted()` (141 ms) beat it. Use quickselect for the kth value, or flip the problem: the `k` largest are everything except the `n − k` smallest, so a heap of size `n − k + 1` of the opposite polarity finds the threshold. Common wrong answer: "still `O(n log k)`, so still best".

**"O(1) extra memory."** Model answer: if the array may be modified, in-place quickselect (Hoare partition), or `heapify` the array itself as a max-heap in `O(n)` and pop `k` times, `O(n + k log n)`. Common wrong answer: calling the size-k heap `O(1)`; it is `O(k)`.

**"The data is spread over 50 shards."** Model answer: for a per-item score, each shard returns its top `k` and the coordinator runs the size-k heap over the `50k` candidates; a global winner is always a local winner. For frequencies that argument fails because counts add across shards; the [top-k and k-way merge](/learn/data-structures/heaps/top-k-and-k-way-merge) lesson has the counterexample, and the fixes are full count tables, a mergeable sketch or a second round. Common wrong answer: "merge each shard's top k by count".

**"Scores can decrease or items can be deleted."** Model answer: the size-k heap is now wrong, because the threshold can fall and the item that should re-enter was evicted. Keep all `n` in an ordered structure: a sorted container, a balanced tree, or a Redis sorted set (`ZADD` is `O(log n)`, `ZRANGE board 0 9 REV` is `O(log n + 10)`), the usual backing store for a leaderboard. Common wrong answer: "remove it from the heap", which is `O(k)` to find and still loses the 11th item.

## What mid-level engineers get wrong

- **A max-heap for the k largest.** It ends up holding the `k` smallest; the answer is wrong on every input with more than `k` distinct values.
- **Pushing all `n` and popping `k`.** `O(n)` memory and `O(n + k log n)`; on a stream it is an out-of-memory incident.
- **`heapreplace` without the `x > heap[0]` guard.** Evicts a top-k element for a worse one; the output looks plausible and is wrong.
- **`(count, value)` when the statement fixes the tie order.** The tuple silently decides which tied item is evicted, the alphabetically *smallest* one for strings, which is often the one you had to keep.
- **Sorting a JavaScript array after every insert as a priority queue.** Linear or worse per operation; more than 3,000 times slower than a heap at 20,000 elements.
- **Reading `heap[0]` before the heap has `k` elements** in a stream class seeded with fewer than `k` values: an `IndexError` or a wrong "kth largest".

## Exercises

```exercise
id: connect-ropes-min-cost
title: Minimum cost to connect ropes
prompt: |
  You have `lengths`, a list of rope lengths. Connecting two ropes of lengths
  `a` and `b` costs `a + b` and produces one rope of length `a + b`. Return
  the minimum total cost to connect all ropes into one. If there are zero or
  one ropes, the cost is 0.

  Aim for O(n log n) using a heap. The JavaScript starter includes a working
  `MinHeap`; Python can use `heapq`.
languages: [python, javascript]
entry: connect_ropes
starter:
  python: |
    import heapq

    def connect_ropes(lengths):
        # your code here
        return 0
  javascript: |
    class MinHeap {
      constructor() { this.a = []; }
      size() { return this.a.length; }
      push(x) {
        const a = this.a; a.push(x);
        let i = a.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (a[i] >= a[p]) break;
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
            if (l < a.length && a[l] < a[m]) m = l;
            if (r < a.length && a[r] < a[m]) m = r;
            if (m === i) break;
            [a[i], a[m]] = [a[m], a[i]]; i = m;
          }
        }
        return top;
      }
    }

    function connect_ropes(lengths) {
      // your code here
      return 0;
    }
tests:
  - args: [[4, 3, 2, 6]]
    expected: 29
  - args: [[1, 2, 3, 4, 5]]
    expected: 33
  - args: [[5]]
    expected: 0
    label: single rope
  - args: [[]]
    expected: 0
    label: no ropes
  - args: [[10, 10]]
    expected: 20
  - args: [[8, 4, 6, 12]]
    expected: 58
    hidden: true
  - args: [[2, 2, 3, 3]]
    expected: 20
    hidden: true
hints:
  - "Always join the two shortest ropes first; a min-heap gives you those in O(log n)."
  - "Pop two, add their sum to the total, push the sum back. Stop when one rope remains."
  - "Build the heap with heapify (Python) or by pushing each length; both are fine here."
```

```exercise
id: top-k-frequent-words
title: Top k frequent words with alphabetical ties
prompt: |
  Given a list of lowercase `words` and an integer `k`, return the `k` most
  frequent words, most frequent first. Words with equal counts are ordered
  alphabetically (so `"a"` comes before `"b"`, and `"b"` before `"bb"`).
  `k` is at least 1 and at most the number of distinct words.

  Do not sort all distinct words. Either heapify every (count, word) pair
  with the right ordering and pop `k` times, O(m + k log m), or keep a size-k
  heap whose root is the weakest entry, O(m log k). For the size-k version,
  decide which of two words with equal counts is weaker; you cannot negate
  a string in Python.
languages: [python, javascript]
entry: top_k_frequent_words
starter:
  python: |
    import heapq
    from collections import Counter

    def top_k_frequent_words(words, k):
        # your code here
        return []
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

    function top_k_frequent_words(words, k) {
      // your code here
      return [];
    }
tests:
  - args: [["go", "rust", "go", "java", "rust", "go"], 2]
    expected: ["go", "rust"]
  - args: [["b", "a", "c", "a", "b", "c"], 2]
    expected: ["a", "b"]
    label: every count ties
  - args: [["solo"], 1]
    expected: ["solo"]
    label: single word
  - args: [["x", "y", "z"], 3]
    expected: ["x", "y", "z"]
    label: k equals the number of distinct words
  - args: [["dog", "cat", "dog", "ant", "cat", "bee", "dog", "ant"], 3]
    expected: ["dog", "ant", "cat"]
    hidden: true
  - args: [["b", "bb", "a", "bb", "b", "a", "c"], 2]
    expected: ["a", "b"]
    hidden: true
    label: a prefix sorts first
  - args: [["zeta", "alpha", "zeta", "alpha", "mid", "zeta"], 1]
    expected: ["zeta"]
    hidden: true
hints:
  - "Count with Counter (or a Map). The heapify route is the easy one: (-count, word) tuples pop in exactly the required order."
  - "For the size-k route, the root must be the weakest entry: lower count first, and among equal counts the alphabetically later word. A tiny class with that __lt__ works in Python; in JavaScript it is the comparator."
  - "Pop the size-k heap into a list and reverse it, because it pops the weakest first."
```

## Senior signals

- You say "size-k **min**-heap for the k largest, because the root is the eviction candidate" and give the one-sentence safety argument: the kth largest of a growing set never falls.
- You name what breaks that argument (deletions, updates) and move to an indexed heap, an ordered set or a Redis sorted set without being led there.
- You choose between sort, heap, quickselect and buckets by `k`, mutability, value range and streaming, with a number: the heap won 5 ms to 137 ms at `k = 10` and lost at `k = n/2`.
- You know `heapq` precisely: `heapify` is `O(n)`, `heapreplace` versus `heappushpop`, the `seq` tiebreaker, what `nlargest` and `most_common(k)` do inside, and the 3.14 max-heap functions.
- In JavaScript you write a comparator heap in five minutes and refuse the sort-after-every-insert shortcut, with its cost.
- You recognise the greedy engine (pop, act, push back) and state its termination argument, and you know top-k by frequency does not compose across shards.

## Check yourself

```quiz
- q: >-
    In an insert-only stream, a value evicted from the size-k min-heap is never needed again. What property makes that safe?
  options: ["heapreplace keeps a copy of every root it evicts", "The heap keeps its values sorted, so the root is final", "An evicted value is the smallest of all values seen", "The kth largest so far can only rise as values arrive"]
  answer: 3
  explanation: >-
    Adding values can only raise the kth-largest threshold or leave it alone, so a value that fell below it stays below it forever. The heap is not sorted, and the evicted root is only the smallest of the k + 1 current candidates, not of everything seen. Deletions break exactly this monotonicity.
- q: >-
    A leaderboard must always show the top 10, and players' scores can also decrease. Why does a size-10 min-heap stop being correct?
  options: ["Heaps cannot store score decreases, only score increases", "A size-10 heap cannot hold ties between equal player scores", "When a top-10 score drops, the 11th player was already evicted", "The heap must become a max-heap once scores are allowed to fall"]
  answer: 2
  explanation: >-
    A decrease can lower the threshold, and the player who should now enter the top 10 is one the heap discarded earlier. Keep every player in an ordered structure (a sorted container, a balanced tree, a Redis sorted set) or an indexed heap over all n. Polarity is not the issue; eviction has stopped being permanent.
- q: >-
    Top 2 most frequent words, ties alphabetical. You keep a size-2 min-heap of (count, word) tuples. On the words b, a, c, a, b, c it returns:
  options: ["a and b, because tuples compare the word when the counts tie", "a and c, because the heap keeps the first word seen per count", "A TypeError, because Python cannot compare an int with a str", "b and c, because a tie evicts the alphabetically smallest word"]
  answer: 3
  explanation: >-
    All counts are 2, so the comparison falls through to the word and the root is the alphabetically smallest entry, which is the one evicted: the opposite of the tie rule. The weakest entry must be the lower count and then the alphabetically later word, via a wrapper __lt__, or heapify every (-count, word) pair and pop k times. Fields are compared position by position, so an int is never compared with a str.
- q: >-
    Measured on CPython 3.14 with 10^6 random floats and k = 500,000, which of these three is fastest?
  options: ["All three tie, since each one is O(n log k) here", "heapq.nlargest(k, a), since the heap loop runs in C", "A hand-written size-k heap loop with heapreplace", "sorted(a, reverse=True)[:k], since Timsort runs in C"]
  answer: 3
  explanation: >-
    At k = n/2, log k is about log n, so the heap does n log n work and gains nothing. sorted took about 141 ms, the hand loop about 234 ms, and nlargest about 806 ms because it decorates each candidate as a (value, order) tuple and compares tuples. An in-place quickselect beat all three at 107 ms. The heap wins only when k is much smaller than n: 5 ms against 137 ms at k = 10.
- q: >-
    A full size-k min-heap has root 5. You call heapq.heapreplace(heap, 3) without checking first. What happens?
  options: ["5 is evicted and 3 enters, so the heap no longer holds the top k", "The heap re-sifts itself so that 5 comes back up to the root", "3 is returned unchanged and the heap is left exactly as it was", "IndexError is raised, because 3 is smaller than the current root"]
  answer: 0
  explanation: >-
    heapreplace always returns the old root and puts the new item in its place, even when the new item is worse, which is why it must follow an x > heap[0] check. heappushpop is the call that returns 3 untouched when 3 is not larger than the root. IndexError happens only on an empty heap.
- q: >-
    Only 107 of 10^6 random floats entered a size-10 min-heap. Which input makes every element enter, and what does it cost?
  options: ["Ascending input: each value beats the root, about 10x slower", "Many duplicates: each tie evicts the root, about 10x slower", "Descending input: each value beats the root, about 10x slower", "Random input with k = 1: each value replaces the root, 10x slower"]
  answer: 0
  explanation: >-
    In ascending order every new value is the largest so far, so it beats the root and forces a sift: 1,000,000 entries and 132 ms against 13 ms on random order. Descending input is the best case (everything after the first k is rejected), a strict greater-than rejects ties, and random input with k = 1 enters only about ln n times.
```
