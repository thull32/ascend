---
slug: k-way-merge
title: "K-way merge: one heap, one head per sorted input"
description: Merge k sorted lists, rows or streams in O(N log k) by keeping only the current head of each input in a heap, and know when binary search on the value beats it.
minutes: 30
difficulty: hard
tags: [heap, merge, sorted-lists, matrix, pattern:k-way-merge]
problems: [merge-k-sorted-lists, kth-smallest-sorted-matrix, smallest-range-k-lists]
---
Twelve shards each return their results sorted by timestamp and you need one sorted page. A log aggregator receives ordered streams from a hundred hosts and must emit a single ordered stream. A database executes `ORDER BY` on data too large for memory by sorting chunks to disk and merging them back. Each of these is the same problem: `k` inputs, each already sorted, and you want the combined order without re-sorting everything.

Concatenating and sorting costs `O(N log N)` and throws away the work already done. Merging pairwise, list 1 with list 2, then the result with list 3, and so on, costs `O(N · k)` because early elements are copied `k` times. The heap version does `O(N log k)`: at every moment you only need to know the smallest of the `k` current heads, and a heap of size `k` tells you that in `O(log k)`.

## The signal

Reach for k-way merge when you see:

- **"k sorted lists/arrays/streams"** and the word **"merge"**: [Merge K Sorted Lists](/practice/merge-k-sorted-lists).
- **"kth smallest across"** several sorted inputs, or in a **row-and-column-sorted matrix** ([Kth Smallest Element in a Sorted Matrix](/practice/kth-smallest-sorted-matrix)): each row is a sorted list, so the matrix is `n` sorted inputs.
- **"Smallest range that includes at least one element from each of k lists"** ([Smallest Range Covering Elements from K Lists](/practice/smallest-range-k-lists)): you walk all lists in merged order while tracking the maximum among the current heads.
- **"Pairs with the smallest sums from two sorted arrays"**, **"ugly numbers"**, **"super ugly numbers"**: the inputs are implicit sorted sequences (`nums1[i] + nums2[j]` for fixed `i`, or `ugly × prime`), one heap entry per sequence.
- **External sort**, **merging sorted runs**, **merging shard responses**: the production form.

What rules it out:

- **The inputs are not sorted.** Sort them first, or the pattern does not apply; if only one is sorted, the answer is usually binary search or a hash map.
- **`k = 2`.** Two pointers does it in `O(N)` with no heap, as in [Merging and partitioning](/learn/data-structures/linked-lists/merging-and-partitioning).
- **You need only the kth smallest and the inputs have structure you can count over.** Binary search on the *value* with an `O(k)` or `O(n)` counting step is often faster and needs `O(1)` space; the matrix trace below shows both.
- **Only the top few of the merged order matter and `k` is large.** Then the heap is still right, but you stop after the elements you need instead of draining it; this is what a feed merge does.

The confusable pattern is [top-k elements](/learn/interview-patterns/sequence-patterns/top-k-elements): both use a heap of size `k`. Top-k keeps the *best k of one input*; k-way merge keeps the *current head of each of k inputs*. If each heap entry carries "which list and where in it", you are merging.

## The template

The invariant: the heap holds exactly one entry per non-exhausted input, namely that input's smallest unconsumed element, tagged with the input's index and the position within it. The heap root is therefore the global smallest unconsumed element. Pop it, emit it, and push the next element from the same input.

```python
import heapq

def merge_k(arrays):
    heap = [(a[0], i, 0) for i, a in enumerate(arrays) if a]   # (value, which, pos)
    heapq.heapify(heap)
    out = []
    while heap:
        value, i, pos = heapq.heappop(heap)
        out.append(value)
        if pos + 1 < len(arrays[i]):
            heapq.heappush(heap, (arrays[i][pos + 1], i, pos + 1))
    return out
```

The tuple order `(value, which, pos)` matters: `which` is the tiebreaker that keeps Python from comparing anything unorderable and makes equal values come out in input order, which is the same stability a merge sort gives.

For linked lists the entry holds the node, and the tiebreaker is essential because `ListNode` objects are not comparable:

```python
def merge_k_lists(lists):
    heap = [(node.val, i, node) for i, node in enumerate(lists) if node]
    heapq.heapify(heap)
    dummy = tail = ListNode(0)
    while heap:
        _, i, node = heapq.heappop(heap)
        tail.next = node
        tail = node
        if node.next:
            heapq.heappush(heap, (node.next.val, i, node.next))
    return dummy.next
```

```javascript
// Assumes MinHeap with a comparator (push/pop/peek/size); see the top-k lesson.
function mergeK(arrays) {
  const heap = new MinHeap((a, b) => a.value - b.value || a.which - b.which);
  arrays.forEach((arr, which) => {
    if (arr.length) heap.push({ value: arr[0], which, pos: 0 });
  });
  const out = [];
  while (heap.size()) {
    const { value, which, pos } = heap.pop();
    out.push(value);
    if (pos + 1 < arrays[which].length) {
      heap.push({ value: arrays[which][pos + 1], which, pos: pos + 1 });
    }
  }
  return out;
}
```

Every element is pushed once and popped once, and the heap never holds more than `k` entries, so the total is `O(N log k)` time and `O(k)` extra space (plus the output). The two-list base case is the merge step of merge sort, which the animation below shows; the heap generalises the "compare the two heads" step to "compare the k heads".

```viz
{"type": "linked-list", "algorithm": "merge-sorted", "values": [1, 4, 5], "values2": [1, 3, 4], "title": "Two-way merge: the k = 2 base case", "caption": "Each step compares the two heads and advances the smaller. With k inputs the heap does the comparison in O(log k)."}
```

## Worked problems

### Merge k sorted lists

[Merge K Sorted Lists](/practice/merge-k-sorted-lists): given `k` sorted linked lists, return one sorted list containing all nodes.

Insight: the template with linked-list nodes as entries. Rewire nodes rather than copying values so the merge is `O(1)` extra space beyond the heap.

Trace on lists `A = 1→4→5`, `B = 1→3→4`, `C = 2→6`. Heap entries shown as `value(list)`.

| Step | Heap (root first) | Pop | Push next from that list | Output so far |
|---|---|---|---|---|
| 0 | `1(A) 1(B) 2(C)` | – | – | – |
| 1 | `1(B) 2(C) 4(A)` | 1(A) | 4(A) | 1 |
| 2 | `2(C) 3(B) 4(A)` | 1(B) | 3(B) | 1 1 |
| 3 | `3(B) 4(A) 6(C)` | 2(C) | 6(C) | 1 1 2 |
| 4 | `4(A) 4(B) 6(C)` | 3(B) | 4(B) | 1 1 2 3 |
| 5 | `4(B) 5(A) 6(C)` | 4(A) | 5(A) | 1 1 2 3 4 |
| 6 | `5(A) 6(C)` | 4(B) | B exhausted | 1 1 2 3 4 4 |
| 7 | `6(C)` | 5(A) | A exhausted | 1 1 2 3 4 4 5 |
| 8 | – | 6(C) | C exhausted | 1 1 2 3 4 4 5 6 |

At step 1 the tie between `1(A)` and `1(B)` is broken by list index, so `A`'s node goes first. The heap never exceeds 3 entries.

Complexity: `O(N log k)` with `N = 8`, `k = 3`. The alternative that interviewers like to hear: divide and conquer, merging lists in pairs, then pairs of pairs, is also `O(N log k)` with no heap and better cache behaviour on arrays; it is the sort-merge that databases use for sorted runs. Pairwise sequential merging (list 1 with 2, result with 3, and so on) is `O(N · k)` and the answer to "why not just merge them one at a time".

### Kth smallest element in a sorted matrix

[Kth Smallest Element in a Sorted Matrix](/practice/kth-smallest-sorted-matrix): an `n × n` matrix has every row and every column sorted ascending; return the kth smallest element.

Insight one: each row is a sorted list, so pop the heap `k` times. Insight two: because columns are sorted too, you can *count* how many elements are `≤ x` in `O(n)` by walking a staircase from the bottom-left corner, and binary search on `x` between the corners.

Heap trace on `matrix = [[1, 5, 9], [10, 11, 13], [12, 13, 15]]`, `k = 8`. Entries are `value(row)`.

| Pop # | Heap before | Popped | Pushed |
|---|---|---|---|
| 1 | `1(0) 10(1) 12(2)` | 1 | 5(0) |
| 2 | `5(0) 10(1) 12(2)` | 5 | 9(0) |
| 3 | `9(0) 10(1) 12(2)` | 9 | row 0 exhausted |
| 4 | `10(1) 12(2)` | 10 | 11(1) |
| 5 | `11(1) 12(2)` | 11 | 13(1) |
| 6 | `12(2) 13(1)` | 12 | 13(2) |
| 7 | `13(1) 13(2)` | 13 | row 1 exhausted |
| 8 | `13(2)` | **13** | – |

The 8th pop returns `13`. Cost `O(k log n)`, and you can start the heap with `min(n, k)` rows since row `r` cannot contribute before `r` elements have been popped.

Binary search on the value. `count(x)` starts at the bottom-left `(n-1, 0)`: if the cell is `≤ x`, the whole column above it is too, so add `r + 1` and step right; otherwise step up. The first `x` with `count(x) ≥ k` is the answer, and it is guaranteed to be an element of the matrix because the count only changes at matrix values.

| lo | hi | mid | count(≤ mid) | Decision |
|---|---|---|---|---|
| 1 | 15 | 8 | 2 (1, 5) | 2 < 8 → lo = 9 |
| 9 | 15 | 12 | 6 (1, 5, 9, 10, 11, 12) | 6 < 8 → lo = 13 |
| 13 | 15 | 14 | 8 | 8 ≥ 8 → hi = 14 |
| 13 | 14 | 13 | 8 | 8 ≥ 8 → hi = 13 |
| 13 | 13 | – | – | answer 13 |

`O(n log(max − min))` time, `O(1)` space. For `n = 300` and values in a 10⁹ range that is about 300 × 30 = 9,000 cell visits against `k log n ≈ 45,000 × 8` heap operations for `k = n²/2`. The [binary-search pattern](/learn/interview-patterns/array-patterns/binary-search) lesson covers the "first true" search this relies on; a senior answer gives both approaches and picks the binary search when `k` is large relative to `n`.

### Smallest range covering elements from k lists

[Smallest Range Covering Elements from K Lists](/practice/smallest-range-k-lists): given `k` sorted lists, find the smallest closed range `[a, b]` that contains at least one element from each list (smaller width wins; ties go to the smaller `a`).

Insight: any candidate range is determined by choosing one element per list; its width is `max − min` of the chosen elements. Walk the lists in merged order. The heap holds one current element per list; the root is the current `min`, and you track the current `max` separately as you push. Each step advances the list that owns the minimum, because that is the only move that can shrink the range: raising the min is the only way to narrow it while every list stays represented. When any list is exhausted, no further range can include it, so stop.

Trace on `lists = [[4, 10, 15, 24, 26], [0, 9, 12, 20], [5, 18, 22, 30]]`:

| Step | Heads (list 0, 1, 2) | min | max | Range | Width | Best |
|---|---|---|---|---|---|---|
| 1 | 4, 0, 5 | 0 | 5 | [0, 5] | 5 | [0, 5] |
| 2 | 4, 9, 5 | 4 | 9 | [4, 9] | 5 | [0, 5] |
| 3 | 10, 9, 5 | 5 | 10 | [5, 10] | 5 | [0, 5] |
| 4 | 10, 9, 18 | 9 | 18 | [9, 18] | 9 | [0, 5] |
| 5 | 10, 12, 18 | 10 | 18 | [10, 18] | 8 | [0, 5] |
| 6 | 15, 12, 18 | 12 | 18 | [12, 18] | 6 | [0, 5] |
| 7 | 15, 20, 18 | 15 | 20 | [15, 20] | 5 | [0, 5] |
| 8 | 24, 20, 18 | 18 | 24 | [18, 24] | 6 | [0, 5] |
| 9 | 24, 20, 22 | 20 | 24 | [20, 24] | 4 | **[20, 24]** |
| 10 | list 1 would need to advance past 20 and is exhausted | | | | | stop |

Answer `[20, 24]`. Notice steps 2, 3 and 7 tie the best width of 5 and do not replace `[0, 5]`, because ties keep the earlier (smaller) start. Only the strict improvement at step 9 updates the best.

Complexity: `O(N log k)` time, `O(k)` space. The `max` bookkeeping is `O(1)` per step because a pushed element is the only thing that can raise it, and the popped minimum can never lower it (a max is never the min unless `k = 1`).

## Variations

- **Stop early.** For "the first `m` elements of the merged order" (a feed page, the smallest `m` sums), pop only `m` times: `O(k + m log k)`.
- **Descending order or custom keys.** Negate the key or pass a comparator; the tiebreaker still has to be orderable.
- **Implicit inputs.** For "k smallest pairs from two sorted arrays", the inputs are the sequences `(a[i] + b[0]), (a[i] + b[1]), …` for each `i`; seed the heap with `(a[i] + b[0], i, 0)` for the first `min(k, len(a))` values of `i`. The template is unchanged; only the "next element of input `i`" rule differs.
- **Merge with deduplication.** Pop, and if the value equals the last emitted, skip it. Sorted-set unions in search engines work this way.
- **Iterator inputs / streams.** Store `(value, which, iterator)` and call `next()` to refill; this is exactly `heapq.merge` in Python's standard library and the external-sort merge phase in every database.
- **Divide and conquer instead of a heap.** Merge lists in pairs recursively: `O(N log k)`, no heap, arrays only; better constants and the answer when the interviewer says "without a priority queue".

## Pitfalls

- **Pushing whole lists into the heap.** The heap holds heads, not inputs. A heap of `N` elements is `O(N log N)` and the interviewer will ask why you bothered.
- **No tiebreaker in the tuple.** `(val, node)` in Python raises `TypeError` on equal values because nodes are not comparable. Insert the list index.
- **Off-by-one on the refill.** Push `pos + 1` only if it exists; pushing `None` or reading past the end is the most common runtime error in this pattern.
- **Forgetting empty inputs.** An empty list among the `k` must be skipped at seeding time, or `a[0]` throws.
- **Tracking max lazily in smallest-range.** The max must be updated on every push, not recomputed from the heap (which would be `O(k)` per step and turn the algorithm into `O(N k)`).
- **Stopping the range walk too late.** The moment any list is exhausted, stop; continuing produces ranges that miss that list and are therefore invalid.
- **Sequential pairwise merging.** `O(N k)`; say why it is wrong before someone asks.

## Exercise

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

## Senior signals

- You say "one heap entry per input, holding its current head" and give `O(N log k)` before writing code, and you can contrast it with `O(N k)` sequential merging and `O(N log N)` re-sorting.
- You know the divide-and-conquer pair-merge is also `O(N log k)` and is what external sorts and database sort-merge use, and you can say when its cache behaviour makes it faster than the heap.
- For a row-and-column-sorted matrix you offer binary search on the value with the staircase count and pick it when `k` is large.
- You recognise implicit sorted sequences (pair sums, multiples) and seed the heap accordingly instead of materialising them.
- You name `heapq.merge` and the merge phase of external sort as the production form, and you know that shard-merging in a query router is this pattern with network latency as the cost that actually matters.

## Check yourself

```quiz
- q: >-
    Merging k sorted lists with N total elements by merging list 1 into list 2, then the result into list 3, and so on, costs:
  options: ["O(N log k)", "O(N k)", "O(N log N)", "O(k log N)"]
  answer: 1
  explanation: >-
    The i-th merge touches all elements merged so far, so the first list's elements are copied about k times. The heap version and the pairwise divide-and-conquer version are both O(N log k).
- q: >-
    Why does the Python heap entry for a linked-list merge need the list index between the value and the node?
  options: ["To make the output stable", "Because heapq requires three-element tuples", "Because on equal values Python compares the next field and ListNode objects are not orderable", "To track which list is exhausted"]
  answer: 2
  explanation: >-
    Tuple comparison falls through to the second field on ties. An integer index resolves the tie before the node is ever compared; stability is a side effect, not the reason.
- q: >-
    For the kth smallest element in an n × n row-and-column-sorted matrix with k ≈ n²/2 and values spanning 10⁹, the better approach is:
  options: ["Heap of n row heads, pop k times", "Binary search on the value with an O(n) staircase count", "Flatten and sort", "Quickselect on the flattened matrix"]
  answer: 1
  explanation: >-
    The heap costs O(k log n) with k about n²/2. Binary search costs O(n log 10⁹) ≈ 30n cell visits with O(1) space. Flattening is O(n² log n²) and quickselect O(n²) with a copy.
- q: >-
    In the smallest-range problem, why is advancing the list that owns the current minimum the only sensible move?
  options: ["It is the cheapest heap operation", "Raising the minimum is the only way to narrow the range while every list stays represented; advancing any other list can only raise the max", "It keeps the heap balanced", "Because lists are processed in index order"]
  answer: 1
  explanation: >-
    The range is [min of heads, max of heads]. Advancing a non-minimum list leaves the min unchanged and can only increase the max. Advancing the minimum's list may raise the min, which is the only route to a smaller width.
- q: >-
    A query router receives sorted result pages from 40 shards and must return the first 50 results in order. The right cost to quote is:
  options: ["O(40 · 50)", "O(40 + 50 log 40)", "O(50 log 50)", "O(2000 log 2000)"]
  answer: 1
  explanation: >-
    Seed the heap with 40 heads (O(40) with heapify), then pop 50 times at O(log 40) each. You never merge all 2000 candidates; stopping early is the point of the heap version.
```
