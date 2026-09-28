---
slug: k-way-merge
title: "K-way merge: one heap, one head per sorted input"
description: Merge k sorted lists, rows or streams in O(N log k) by keeping only the current head of each input in a heap, prove the root is always the global minimum, trace merge, sorted-matrix and smallest-range problems heap array by heap array, and know when concatenate-and-sort or binary search on the value beats the heap.
minutes: 30
difficulty: hard
tags: [heap, merge, sorted-lists, matrix, pattern:k-way-merge]
problems: [merge-k-sorted-lists, kth-smallest-sorted-matrix, smallest-range-k-lists, design-twitter]
---
Twelve shards each return their results sorted by timestamp and you need one sorted page. A log shipper receives ordered streams from two hundred hosts and must emit one ordered stream. A database sorts a table larger than memory by writing sorted runs to disk and merging them back. Each time the inputs are already sorted, and re-sorting everything throws that work away.

Merging pairwise (list 1 with list 2, the result with list 3, and so on) re-copies early elements on every merge: `O(N·k)` for `N` total elements. Measured with CPython 3.14 on a Ryzen 9 9950X3D desktop, merging 100 sorted lists of 1,000 elements that way took 146 ms; a heap of the 100 current heads took 15 ms. The heap works because at any moment you need exactly one fact, the smallest of the `k` current heads, and a heap of size `k` answers it in `O(log k)`.

The interview then probes three things: the invariant that makes the root safe to emit, the bookkeeping that crashes (exhausted inputs, unorderable tie-breaks), and the judgment call. Measured below, when every input is an in-memory array, concatenating and sorting beats the heap in both CPython and V8; the heap earns its place when inputs are streams, when you stop early, or when you must relink nodes in place.

## The signal

Reach for k-way merge when you see:

- **"k sorted lists/arrays/streams"** and **"merge"**: [Merge K Sorted Lists](/practice/merge-k-sorted-lists).
- **"kth smallest across"** several sorted inputs, or in a **row-and-column-sorted matrix** ([Kth Smallest Element in a Sorted Matrix](/practice/kth-smallest-sorted-matrix)): each row is a sorted input.
- **"Smallest range that includes an element from each of k lists"** ([Smallest Range Covering Elements from K Lists](/practice/smallest-range-k-lists)).
- **Implicit sorted sequences**: "k pairs with the smallest sums from two sorted arrays", "the nth ugly number". Row `i` is `a[i] + b[0], a[i] + b[1], …`; one heap entry per row.
- **"The 10 newest posts from everyone I follow"** ([Design Twitter](/practice/design-twitter)): one head per followee, stop after 10.
- **External sort, merging sorted runs, merging shard responses**: the production form.

Each row below looks like k-way merge and is not:

| Statement says | Pattern | Why |
|---|---|---|
| "Merge **two** sorted lists" ([problem](/practice/merge-two-sorted-lists)) | Two pointers | With `k = 2` the heap adds a `log` factor and an allocation per element for nothing |
| "k sorted lists; is `x` in any of them" or "which values appear in all" | [Hash set or counter](/learn/interview-patterns/sequence-patterns/hash-map-patterns) | Order is irrelevant to membership |
| "kth smallest in a sorted matrix", `k` near `n²/2` | [Binary search on the value](/learn/algorithms/sorting-searching/binary-search-on-the-answer) | A staircase counts cells `≤ x` in `O(n)`; the time does not depend on `k` |
| "Median of two sorted arrays" ([problem](/practice/median-two-sorted)) | Binary search on a partition | `O(log min(m, n))`; merging is `O(m + n)` |
| "Merge k **unsorted** lists" | Sort | The heap merge assumes sorted inputs and produces garbage without complaint |
| "All k sorted arrays are in memory; sort everything", in Python or JavaScript | Concatenate and call the built-in sort | Timsort finds each list as a run: 109 ms against 299 ms for the heap at `k = 1,000`, measured below |

The test: are the inputs sorted, is `k ≥ 3`, and do you need the merged *order* (or a prefix of it)? All three yes: k-way merge. Then ask whether the inputs are streams or arrays in memory.

## The template

```python
import heapq

def merge_k(arrays):
    """Merge sorted lists. O(N log k) time, O(k) extra space besides the output."""
    heap = [(a[0], i, 0) for i, a in enumerate(arrays) if a]  # skip empty inputs
    heapq.heapify(heap)                  # O(k)
    out = []
    while heap:
        value, i, pos = heap[0]          # peek: the global minimum of unemitted values
        out.append(value)
        if pos + 1 < len(arrays[i]):     # input i has a next element
            heapq.heapreplace(heap, (arrays[i][pos + 1], i, pos + 1))  # one sift
        else:
            heapq.heappop(heap)          # input i is exhausted; the heap shrinks
    return out
```

The entry is `(value, which, pos)`. `which` settles ties before anything else is compared and makes equal values leave in input order, so the merge is stable. Peeking and then calling `heapreplace` does one sift per element where `heappop` plus `heappush` does two; it is the same move `heapq.merge` makes. For linked lists the entry carries the node, and the index is mandatory because `ListNode` objects cannot be compared:

```python
def merge_k_lists(lists):
    heap = [(node.val, i, node) for i, node in enumerate(lists) if node]
    heapq.heapify(heap)
    dummy = tail = ListNode(0)
    while heap:
        _, i, node = heap[0]
        tail.next = node                 # relink; no new nodes
        tail = node
        if node.next:
            heapq.heapreplace(heap, (node.next.val, i, node.next))
        else:
            heapq.heappop(heap)
    return dummy.next
```

JavaScript needs the heap. The comparator breaks ties by input index, and the loop overwrites the root entry in place and sifts it, the equivalent of `heapreplace`:

```javascript
class MinHeap {
  constructor(cmp) { this.a = []; this.cmp = cmp; }
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

function mergeK(arrays) {
  const heap = new MinHeap((x, y) => x[0] - y[0] || x[1] - y[1]); // [value, which, pos]
  arrays.forEach((arr, which) => { if (arr.length) heap.push([arr[0], which, 0]); });
  const out = [];
  while (heap.size()) {
    const top = heap.peek();
    const [value, which, pos] = top;
    out.push(value);
    if (pos + 1 < arrays[which].length) {
      top[0] = arrays[which][pos + 1]; top[2] = pos + 1;   // new head of the same input
      heap.siftDown(0);
    } else {
      heap.pop();
    }
  }
  return out;
}
```

```viz
{"type": "linked-list", "algorithm": "merge-sorted", "values": [1, 4, 5], "values2": [1, 3, 4], "title": "Two-way merge: the k = 2 base case", "caption": "Each step compares the two heads and advances the smaller. With k inputs the heap does the comparison in O(log k)."}
```

### Why the root is always safe to emit

The invariant:

> The heap holds exactly one entry for each non-exhausted input: that input's smallest unemitted element.

It holds after seeding (each non-empty input contributes its first element, the smallest because it is sorted). Given the invariant, **the root is the smallest unemitted element overall**. Take any unemitted element `e`, from input `i`. Input `i` is not exhausted, so it has an entry `h_i` in the heap, and `h_i ≤ e` because the input is sorted and `h_i` is its smallest unemitted element. The heap property gives `root ≤ h_i`. So `root ≤ e` for every unemitted `e`, and emitting the root keeps the output sorted.

Emitting the root removes input `i`'s entry. Its next element is now its smallest unemitted one, so pushing it restores the invariant; if there is none, the input is exhausted and no entry should remain. Each iteration emits one element, so the loop ends after exactly `N` iterations with everything emitted. The argument uses only "each input is sorted" and "the root is the heap minimum", which is why an unsorted input breaks the output silently: the step `h_i ≤ e` is false and nothing checks it.

## Worked problems

### Merge K Sorted Lists

[Merge K Sorted Lists](/practice/merge-k-sorted-lists). Trace on `A = 2→7→9`, `B = 1→5`, `C = 3→4→8`, `D = (empty)`. Entries are shown as `value(list)` in heap array order:

| Step | Emit | Next from that list | Heap array after | Output |
|---|---|---|---|---|
| seed | – | D is empty, skipped; `heapify` | `[1(B), 2(A), 3(C)]` | – |
| 1 | 1(B) | 5: replace root | `[2(A), 5(B), 3(C)]` | 1 |
| 2 | 2(A) | 7: replace root | `[3(C), 5(B), 7(A)]` | 1 2 |
| 3 | 3(C) | 4: replace root | `[4(C), 5(B), 7(A)]` | 1 2 3 |
| 4 | 4(C) | 8: replace root | `[5(B), 8(C), 7(A)]` | … 4 |
| 5 | 5(B) | B exhausted: pop | `[7(A), 8(C)]` | … 5 |
| 6 | 7(A) | 9: replace root | `[8(C), 9(A)]` | … 7 |
| 7 | 8(C) | C exhausted: pop | `[9(A)]` | … 8 |
| 8 | 9(A) | A exhausted: pop | `[]` | 1 2 3 4 5 7 8 9 |

Eight emits, five replacements and three pops: one heap operation per element. Step 3 shows a list emitting twice in a row (C's 3 then its 4) with no other list involved; the heap does not care which input the minimum comes from. Time `O(N log k)`, extra space `O(k)`, and no node is allocated. Bottom-up pairwise merging (pairs, then pairs of pairs) is also `O(N log k)` with `O(1)` extra space; it is the answer to "no heap" and is traced in [merging and partitioning](/learn/data-structures/linked-lists/merging-and-partitioning).

```viz
{"type": "heap", "algorithm": "push-pop", "kind": "min", "operations": [["push", 2], ["push", 1], ["push", 3], ["pop"], ["push", 5], ["pop"], ["push", 7], ["pop"], ["push", 4], ["pop"], ["push", 8], ["pop"], ["pop"], ["push", 9], ["pop"], ["pop"]], "title": "The merge heap for 2-7-9, 1-5 and 3-4-8", "caption": "Each pop emits the global minimum; each push is the next element of the list whose head was popped. The heap never holds more than one entry per list."}
```

### Kth Smallest Element in a Sorted Matrix

[Kth Smallest in a Sorted Matrix](/practice/kth-smallest-sorted-matrix): every row and column ascending; return the kth smallest. Each row is a sorted input, so run the merge and stop at the kth emit. Row `r` cannot supply one of the `k` smallest unless `r < k` (its first element already has `r` elements no larger than it above it in column 0), so seed at most `min(n, k)` rows.

Matrix `[[2,6,9,14], [3,7,10,15], [5,8,12,20], [11,13,16,21]]`, `k = 7`, entries `value(row)`:

| Emit # | Value | Next in that row | Heap array after |
|---|---|---|---|
| seed | – | – | `[2(r0), 3(r1), 5(r2), 11(r3)]` |
| 1 | 2 | 6: replace | `[3(r1), 6(r0), 5(r2), 11(r3)]` |
| 2 | 3 | 7: replace | `[5(r2), 6(r0), 7(r1), 11(r3)]` |
| 3 | 5 | 8: replace | `[6(r0), 8(r2), 7(r1), 11(r3)]` |
| 4 | 6 | 9: replace | `[7(r1), 8(r2), 9(r0), 11(r3)]` |
| 5 | 7 | 10: replace | `[8(r2), 10(r1), 9(r0), 11(r3)]` |
| 6 | 8 | 12: replace | `[9(r0), 10(r1), 12(r2), 11(r3)]` |
| 7 | **9** | stop | – |

`O(min(n, k) + k log min(n, k))`.

### The same matrix by binary search on the value

When `k` is large, **binary search on the value** is better. `count(x)` walks a staircase from the bottom-left corner: if the cell is `≤ x`, the whole column above it is too, so add `row + 1` and step right; otherwise step up. That is at most `2n − 1` cell visits. Find the smallest `x` with `count(x) ≥ k`:

| lo | hi | mid | count(≤ mid) | Cells visited | Decision |
|---|---|---|---|---|---|
| 2 | 21 | 11 | 9 | 7 | `9 ≥ 7`: hi = 11 |
| 2 | 11 | 6 | 4 | 6 | `4 < 7`: lo = 7 |
| 7 | 11 | 9 | 7 | 7 | `7 ≥ 7`: hi = 9 |
| 7 | 9 | 8 | 6 | 6 | `6 < 7`: lo = 9 |

`lo == hi == 9`. The answer is always a matrix value, because `count` only changes at matrix values and the search returns the first `x` where it reaches `k`. Cost `O(n log(max − min))`: for `n = 300` and a 2×10⁹ value range, about 31 rounds of at most 599 cells, some 19,000 visits, against about `k log₂ 300 ≈ 370,000` comparisons for the heap at `k = 45,000`.

### Smallest Range Covering Elements from K Lists

[Smallest Range](/practice/smallest-range-k-lists): the narrowest `[a, b]` holding at least one element of each list (ties: smaller `a`). A candidate range is fixed by choosing one element per list, and its width is `max − min` of the choice. Walk the lists in merged order with one head per list; the root is the current minimum and a variable holds the current maximum. Advance the list that owns the minimum: moving any other list leaves the minimum where it is and can only raise the maximum. Stop when the minimum's list is exhausted, because every later range would omit that list.

Lists `L0 = [3, 8, 14, 20]`, `L1 = [1, 9, 15]`, `L2 = [6, 10, 17, 25]`:

| Step | Heap array | min | max | Width | Best | Then |
|---|---|---|---|---|---|---|
| 1 | `[1(L1), 3(L0), 6(L2)]` | 1 | 6 | 5 | [1, 6] | advance L1 to 9 |
| 2 | `[3(L0), 9(L1), 6(L2)]` | 3 | 9 | 6 | [1, 6] | advance L0 to 8 |
| 3 | `[6(L2), 9(L1), 8(L0)]` | 6 | 9 | 3 | [6, 9] | advance L2 to 10 |
| 4 | `[8(L0), 9(L1), 10(L2)]` | 8 | 10 | 2 | **[8, 10]** | advance L0 to 14 |
| 5 | `[9(L1), 14(L0), 10(L2)]` | 9 | 14 | 5 | [8, 10] | advance L1 to 15 |
| 6 | `[10(L2), 14(L0), 15(L1)]` | 10 | 15 | 5 | [8, 10] | advance L2 to 17 |
| 7 | `[14(L0), 17(L2), 15(L1)]` | 14 | 17 | 3 | [8, 10] | advance L0 to 20 |
| 8 | `[15(L1), 17(L2), 20(L0)]` | 15 | 20 | 5 | [8, 10] | L1 exhausted: stop |

Answer `[8, 10]` (8 from L0, 9 from L1, 10 from L2). The maximum is updated only on push (`max = max(max, pushed)`), `O(1)`; it never needs to fall, because it belongs to an element that is still a head until it becomes the minimum itself. Recomputing it by scanning the heap costs `O(k)` per step and turns `O(N log k)` into `O(N k)`.

### Why the smallest-range walk never misses the optimum

The problem's follow-up asks for this proof. Let `[a, b]` be an optimal range. While some head is below `a`, the minimum is below `a`, so the walk advances a list whose head is below `a`; that list still holds its chosen element in `[a, b]`, so it is not exhausted and the walk does not stop. Heads therefore reach a state where every head is at least `a`. At that step each head is its list's first element `≥ a`, which is at most that list's chosen element and so at most `b`. All heads lie in `[a, b]`, and the range the walk records there is no wider than the optimum.

### Design Twitter's feed, as a variant

[Design Twitter](/practice/design-twitter): a feed request seeds the heap with the newest tweet of the user and each followee (`f` entries, keyed by negated timestamp so the newest pops first), pops 10 times and pushes each popped user's next-older tweet. Cost `O(f + 10 log f)` per request regardless of how many tweets exist; this is the early-stop merge.

## Variants

| Variant | What changes in the template | Complexity |
|---|---|---|
| First `m` of the merged order | Pop `m` times, then stop | `O(k + m log k)` |
| Linked lists | Entries `(val, i, node)`; relink nodes | `O(N log k)`, `O(k)` extra |
| Iterators and streams | Entries hold `next`; `heapq.merge` | Lazy, `O(k)` memory |
| Implicit sequences (smallest pair sums, ugly numbers) | "Next of input `i`" is computed, e.g. `(a[i] + b[j+1], i, j+1)` | `O(k log k)` for `k` outputs |
| Union without duplicates | Skip a value equal to the last emitted | `O(N log k)` |
| Descending inputs | `reverse=True`, a max-heap, or negated keys | same |
| Smallest range | Track the max of the heads; stop at the first exhausted list | `O(N log k)` |
| No heap allowed | Bottom-up pairwise merging | `O(N log k)`, `O(1)` extra for lists |
| Merge that does not fit in memory | One buffered reader per run; multi-pass when runs exceed the fan-in | `⌈log_F r⌉` passes for `r` runs and fan-in `F` |

## Complexity, derived

Seeding is `O(k)` with `heapify`. Each of the `N` elements is emitted once and costs one `heapreplace` or `heappop` on a heap of at most `k` entries, about `log₂ k` comparisons each: `O(k + N log k)` time, `O(k)` extra space. Sequential pairwise merging copies the first list `k − 1` times, the second `k − 2` times and so on, `≈ N·k/2` element moves; bottom-up pairwise merging does `log₂ k` rounds of `N` moves.

| Approach | Time | Extra memory | Lazy on streams | Relinks lists in place |
|---|---|---|---|---|
| Concatenate, built-in sort | `O(N log k)` on `k` runs (Timsort) | `O(N)` | no | no |
| Heap of heads | `O(k + N log k)` | `O(k)` | yes | yes |
| Bottom-up pairwise merging | `O(N log k)` | `O(N)` for arrays, `O(1)` for lists | no | yes |
| Sequential pairwise merging | `O(N·k)` | `O(N)` | no | yes |

### Measured: where the heap loses and where it wins

The theory says the heap wins. The interpreters say it depends on where the data lives. Measured on 10⁶ random integers split evenly into `k` sorted lists (CPython 3.14, Node 24, same machine):

| `k` | `sorted(chain(*lists))` | `heapq.merge` | Hand loop above | Pairwise, pure Python | First 10 via `heapq.merge` |
|---|---|---|---|---|---|
| 10 | 76 ms | 165 ms | 196 ms | 372 ms | under 0.01 ms |
| 100 | 87 ms | 215 ms | 225 ms | 467 ms | 0.01 ms |
| 1,000 | 109 ms | 362 ms | 299 ms | 633 ms | 0.16 ms |

In Node at `k = 1,000`, the heap merge took 119 ms against 89 ms for `concat` plus `sort((a, b) => a - b)`. Both built-in sorts are TimSort, which treats each input list as an already-sorted run and merges runs in native code, so it is also `O(N log k)` on this input, with a far smaller constant. The last column is where the heap wins outright: the first 10 elements of a 1,000-way merge cost 0.16 ms, because only the `k` heads were touched, while any sort must read all 10⁶ elements first. On 10⁵ elements the sequential pairwise version took 19 ms at `k = 10` and 146 ms at `k = 100`, against 15 ms for the heap at both, the `O(N·k)` term showing up as `k` grows.

## Under the hood

### `heapq.merge`, line by line

Read from `Lib/heapq.py` in CPython 3.14.7 (the [merging lesson](/learn/data-structures/linked-lists/merging-and-partitioning) covers its outline and Timsort's run merging):

- Each input becomes a three-element **list** `[value, order * direction, next]`, where `next` is the iterator's bound `__next__`. Empty inputs are dropped during seeding by catching `StopIteration`.
- The hot loop reads `value, order, next = s = h[0]`, yields `value`, then assigns `s[0] = next()` and calls `heapreplace(h, s)`. The entry is mutated in place, so no tuple is allocated per element.
- When `next()` raises `StopIteration`, the handler calls `heappop(h)` and the loop continues while more than one input remains.
- With one input left it yields the pending value and then `yield from next.__self__`: the rest of the last input streams through with no heap work at all.
- With `key=`, entries are `[key(value), order, value, next]`, so the key is computed once per element. With `reverse=True` it uses `heapify_max`, `heappop_max` and `heapreplace_max`, public functions as of 3.14.

The generator is Python code calling C heap functions, which is why it measured 2.2 to 3.3 times slower than `sorted` on in-memory lists, and why its real advantage is laziness: `O(k)` memory and a first element after `O(k)` work, on inputs that may be files or network streams. It never checks that inputs are sorted.

### Where the loop runs in production

PostgreSQL's `Merge Append` plan node, which returns ordered rows from several sorted child scans (the partitions of a partitioned table, for example), keeps the children's current rows in a binary heap. Lucene evaluates an OR query by keeping one iterator per term's posting list in a priority queue ordered by the next document id (`DisiPriorityQueue` in the source), a k-way merge of sorted id lists. LSM compaction is the same loop over SSTable iterators with "newest version wins" as the tie rule ([LSM trees and SSTables](/learn/advanced-data-structures/log-structured-and-disk-structures/lsm-trees-and-sstables)), and scatter-gather search merges per-shard pages at a coordinator, whose deep-pagination cost the [top-k and k-way merge](/learn/data-structures/heaps/top-k-and-k-way-merge) lesson sizes.

## Failure modes

**Exhausted inputs crash the merge.** *Symptom:* `IndexError: list index out of range` on a hidden test, or `AttributeError: 'NoneType' object has no attribute 'val'` for linked lists. *Diagnosis:* seeding reads `a[0]` of an empty input, the refill reads `arrays[i][pos + 1]` without a bounds check, or the list version pushes `node.next` when it is `None`. *Fix:* skip empty inputs when seeding; refill only if `pos + 1 < len(arrays[i])` or `node.next` is not `None`, and otherwise pop.

**`TypeError` on equal values.** *Symptom:* `TypeError: '<' not supported between instances of 'ListNode' and 'ListNode'` when two lists share a value. *Diagnosis:* `(val, node)` entries; a tie falls through to the node. *Fix:* `(val, i, node)`, with `i` unique per input.

**Silently unsorted output.** *Symptom:* a merged audit log is "mostly" in time order with local inversions; no error anywhere. *Diagnosis:* one input was sorted by a different key (ingest time instead of event time) or in descending order, and neither the heap loop nor `heapq.merge` checks. *Fix:* assert each input is non-decreasing as you consume it (compare with the last value taken from the same input), and make the merge key the key the inputs are sorted by.

**Memory proportional to the data.** *Symptom:* a merge job's heap holds millions of entries and the process is killed. *Diagnosis:* every element of every input was pushed up front, which is heap sort with `O(N)` memory, not a merge. *Fix:* one entry per input, refilled from the input whose head was emitted.

**Smallest range that is quadratic.** *Symptom:* passes small tests, times out at `k = 3,500`. *Diagnosis:* the current maximum is recomputed with `max()` over the heap every step, `O(k)` each. *Fix:* update the maximum on push only.

## Interviewer follow-ups

**"The inputs are 200 unbounded streams, such as Kafka partitions ordered by timestamp."** Model answer: a lazy merge in `O(k)` memory, emitting as soon as every stream has offered a head. The catch is that a silent stream blocks all output, because the merge cannot know the idle stream's next value is not the smallest. Stream processors bound the wait with watermarks and idle-source timeouts ([stream processing model](/learn/big-data/streaming/stream-processing-model)). Common wrong answer: "buffer everything and sort every minute", which adds a minute of latency and still reorders late data wrongly.

**"There are 100,000 sorted runs on disk and memory for 1,000 read buffers."** Model answer: a multi-pass merge with fan-in 1,000: 100 merges of 1,000 runs, then one merge of the 100 results, `⌈log₁₀₀₀ 100,000⌉ = 2` passes, each reading and writing all data once. Common wrong answer: opening all 100,000 files, which exhausts file descriptors and thrashes with tiny buffers.

**"Merge k linked lists in O(1) extra memory."** Model answer: bottom-up pairwise merging, relinking nodes; `O(N log k)` time. The heap needs `O(k)`. Common wrong answer: calling the heap version `O(1)` space because "it only holds heads".

**"Everything is already in memory as Python lists."** Model answer: `sorted(chain(*lists))`, or `list.sort()` on the concatenation, because Timsort detects the runs; measured 109 ms against 299 ms for the heap at `k = 1,000`. Use the heap when you need laziness, an early stop, or `O(k)` memory. Common wrong answer: "the heap is `O(N log k)` so it must win", when the sort is `O(N log k)` on this input too.

**"Page 500 of results merged from 40 shards."** Model answer: offset pagination makes every shard return its top `offset + limit` rows and the coordinator merge `40 × (offset + limit)` entries to keep `limit`; switch to cursor (keyset) pagination so each shard returns rows after the last sort key seen. Common wrong answer: "the merge is `O(N log k)`, so it scales", ignoring that `N` grows with the page number.

## What mid-level engineers get wrong

- **Sequential pairwise merging.** `O(N·k)`: 146 ms against 15 ms at `k = 100`, and the gap grows linearly with `k`.
- **Pushing whole inputs into the heap.** `O(N)` memory and `O(N log N)` time for a problem that needs `O(k)` memory.
- **No index in the tuple.** Crashes on the first tie between `ListNode`s or dicts.
- **Refilling without a bounds check** or seeding with `a[0]` of an empty list.
- **Assuming the heap always wins.** On in-memory arrays in Python or JavaScript, the built-in sort is faster; say so and say when the heap is still the right call.
- **Using the heap for `k = 2`,** where two pointers are simpler and faster.

## Exercises

```exercise
id: merge-k-sorted-arrays
title: Merge k sorted arrays with a heap
prompt: |
  Given `arrays`, a list of sorted (ascending) integer arrays, return one
  sorted array containing every element. Some inner arrays may be empty and
  the outer list may be empty. Aim for O(N log k) with a heap of at most k
  entries. The JavaScript starter includes a `MinHeap` with a comparator;
  Python can use `heapq` with `(value, array_index, position)` tuples.
languages: [python, javascript]
entry: merge_k_sorted
starter:
  python: |
    import heapq

    def merge_k_sorted(arrays):
        # your code here
        return []
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

    function merge_k_sorted(arrays) {
      // your code here
      return [];
    }
tests:
  - args: [[[1, 4, 5], [1, 3, 4], [2, 6]]]
    expected: [1, 1, 2, 3, 4, 4, 5, 6]
  - args: [[]]
    expected: []
    label: no arrays
  - args: [[[]]]
    expected: []
    label: one empty array
  - args: [[[1], [0]]]
    expected: [0, 1]
  - args: [[[1, 2, 3]]]
    expected: [1, 2, 3]
    label: single array
  - args: [[[-5, 0], [-10, 10], []]]
    expected: [-10, -5, 0, 10]
    hidden: true
  - args: [[[1, 1, 1], [1, 1], [1]]]
    expected: [1, 1, 1, 1, 1, 1]
    hidden: true
hints:
  - "Seed the heap with the first element of every non-empty array, tagged with the array index and position 0."
  - "Pop the smallest, append it, and push the next element from the same array if there is one."
  - "Include the array index in the heap entry so ties never compare positions from different arrays in a confusing order."
```

```exercise
id: k-smallest-pair-sums
title: The k pairs with the smallest sums
prompt: |
  `a` and `b` are sorted ascending (values may repeat or be negative). A pair
  takes one element from each: `[a[i], b[j]]`. Return the first `k` pairs in
  increasing order of `a[i] + b[j]`, breaking ties by smaller `i`, then by
  smaller `j`. If fewer than `k` pairs exist, return all of them; if either
  array is empty or `k` is 0, return `[]`.

  Treat row `i` as the sorted sequence `a[i] + b[0], a[i] + b[1], ...` and
  k-way merge the rows: seed the heap with `(a[i] + b[0], i, 0)` for the first
  `min(k, len(a))` rows, and after popping `(s, i, j)` push `(a[i] + b[j + 1],
  i, j + 1)` if it exists. Do not build all `len(a) * len(b)` pairs.
languages: [python, javascript]
entry: k_smallest_pairs
starter:
  python: |
    import heapq

    def k_smallest_pairs(a, b, k):
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

    function k_smallest_pairs(a, b, k) {
      // your code here
      return [];
    }
tests:
  - args: [[1, 7, 11], [2, 4, 6], 3]
    expected: [[1, 2], [1, 4], [1, 6]]
  - args: [[1, 1, 2], [1, 2, 3], 2]
    expected: [[1, 1], [1, 1]]
    label: equal sums, ordered by i
  - args: [[], [1, 2], 3]
    expected: []
    label: empty input
  - args: [[1, 2], [3], 5]
    expected: [[1, 3], [2, 3]]
    label: fewer than k pairs
  - args: [[-3, 0, 5], [-2, 4], 4]
    expected: [[-3, -2], [0, -2], [-3, 4], [5, -2]]
    hidden: true
  - args: [[1, 2, 3], [1, 2, 3], 5]
    expected: [[1, 1], [1, 2], [2, 1], [1, 3], [2, 2]]
    hidden: true
    label: ties broken by i then j
  - args: [[4, 9], [1, 1, 8], 0]
    expected: []
    hidden: true
    label: k is zero
hints:
  - "The heap entry (sum, i, j) compares exactly by the required order: sum, then i, then j."
  - "Each row is sorted by (sum, i, j) because b is ascending, so the heap merge of the rows emits pairs in the required global order."
  - "Only the first min(k, len(a)) rows can contribute, because row i starts with i pairs of equal or smaller sum above it."
```

## Senior signals

- You state the invariant (one entry per non-exhausted input, holding its smallest unemitted element) and derive from it that the root is the global minimum, so emitting it is safe.
- You give `O(k + N log k)` time and `O(k)` memory, contrast `O(N·k)` sequential merging, and know bottom-up pairwise merging as the `O(1)`-extra-space alternative for lists.
- You say where the heap loses: in-memory arrays in Python or JavaScript, where the built-in run-adaptive sort measured faster, and you name what the heap buys instead (laziness, early stop, `O(k)` memory, relinking).
- For a sorted matrix with large `k` you offer binary search on the value with a staircase count, and for smallest range you track the maximum on push.
- You know `heapq.merge`'s mechanics (in-place entries, `heapreplace`, the single-input shortcut) and that it never checks sortedness.
- You connect the pattern to external sort passes, LSM compaction, `Merge Append`, search disjunctions and stream merging, including the idle-stream stall and deep pagination.

## Check yourself

```quiz
- q: >-
    In the k-way merge, why is the heap's root always the smallest element not yet emitted?
  options: ["The tie-break index forces equal values out in order, so the root is least", "The heap holds every unemitted value, so its root is the overall minimum", "Inputs are merged in index order, so earlier inputs always hold smaller values", "Unemitted values are at least their input's head; the root is the least head"]
  answer: 3
  explanation: >-
    Each input is sorted, so its head (smallest unemitted element) bounds everything left in it, and the heap property makes the root the smallest head. Together, the root is at most every unemitted element. The heap holds only one entry per input, not every value, and the index only settles ties.
- q: >-
    A thousand sorted Python lists totalling 10^6 integers are already in memory, and you need all of them in one sorted list. Which is the better call, and why?
  options: ["heapq.merge, since its O(N log k) beats any sort at O(N log N) here", "sorted(chain(*lists)), since Timsort merges the existing runs in C", "A hand-written heap loop, since heapreplace does one sift per element", "Pairwise merging in Python, since it avoids a heap and its tuples"]
  answer: 1
  explanation: >-
    Timsort detects each input list as a sorted run and merges runs, so on this input it is O(N log k) too, with the work in C; at k = 1,000 it measured 109 ms against 299 ms for a hand loop and 362 ms for heapq.merge. The heap is the right tool for streams, early stops and O(k) memory, and pure-Python pairwise merging was the slowest of all.
- q: >-
    What does heapq.merge do when only one of its input iterators still has elements?
  options: ["It yields the rest of that iterator directly, with no heap work", "It keeps calling heapreplace on a heap that holds a single entry", "It copies the remaining elements into a list and sorts them first", "It raises StopIteration, and the caller must drain the last input"]
  answer: 0
  explanation: >-
    Once the heap is down to one entry, heapq.merge yields the pending value and then does yield from on that iterator, so the tail streams through without comparisons. Before that, each step mutates the root entry in place and calls heapreplace; nothing is ever copied or sorted.
- q: >-
    A merge of k linked lists passes the samples but raises TypeError on a hidden test. The heap entries are (node.val, node). What is the fix?
  options: ["Push (node.val, i, node) with a unique input index i", "Define __eq__ on ListNode so that ties compare as equal", "Push (-node.val, node) so that the heap orders by value", "Push node.val only and look the node up in a dictionary"]
  answer: 0
  explanation: >-
    When two heads have equal values, tuple comparison falls through to the nodes, and ListNode defines no ordering. A unique integer before the node settles every tie, and also makes the merge stable. Negating keeps the same tie, a value-to-node map breaks on duplicate values, and __eq__ does not give the less-than that heapq needs.
- q: >-
    Merging 100 sorted lists of 1,000 elements by folding them in one at a time took 146 ms; the heap took 15 ms. Why does the fold lose?
  options: ["Each fold sorts its output again, adding N log N work per step", "The fold allocates a new heap per list, costing k log k per merge", "Each fold re-copies everything merged so far, about N·k/2 moves", "The fold compares every pair of heads, about k squared per element"]
  answer: 2
  explanation: >-
    Merge number i walks all elements merged before it, so the first list is copied k − 1 times and the total is about N·k/2 element moves, O(N·k). The heap moves each element once at O(log k). No sorting or heap allocation happens inside a two-way merge.
- q: >-
    You merge 200 Kafka partitions ordered by timestamp with a lazy heap merge. One partition stops receiving data. What happens?
  options: ["The merge emits out of order, since the idle head is now stale", "Nothing, since the heap drops a partition once it has no messages", "Output stalls: the idle partition might still hold the minimum", "Memory grows by the partition's size, since its entries are copied"]
  answer: 2
  explanation: >-
    The merge can emit the root only when every input has offered a head, because the idle partition's next record could be older than anything in the heap. Stream processors bound the wait with watermarks and idle-source timeouts, trading completeness for latency. The heap never drops a live input on its own, and it holds one entry per partition.
```
