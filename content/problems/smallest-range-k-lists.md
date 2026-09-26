---
slug: smallest-range-k-lists
title: Smallest Range Covering Elements from K Lists
difficulty: hard
patterns: [k-way-merge]
lists: [ascend-150]
companies: [google, amazon, meta, snap]
order: 2
lesson: interview-patterns/sequence-patterns/k-way-merge
hints:
  - "A range is valid when it contains at least one element from every list. Consider ranges whose low end is an element of some list; there are only `total elements` of those."
  - "Merge the lists with a min-heap that holds one pointer per list. At any moment the heap's minimum and the largest value ever pushed form a valid range. Advancing the minimum's pointer is the only way to shrink the low end."
  - "Stop when any list is exhausted; from then on no valid range can have a larger low end."
signatures:
  python:
    name: smallest_range
    starter: |
      def smallest_range(nums: list[list[int]]) -> list[int]:
          pass
  javascript:
    name: smallest_range
    starter: |
      class MinHeap {
        constructor(compare = (a, b) => a - b) { this.a = []; this.cmp = compare; }
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
          const a = this.a; const top = a[0]; const last = a.pop();
          if (a.length) {
            a[0] = last;
            let i = 0;
            for (;;) {
              const l = 2 * i + 1, r = l + 1; let m = i;
              if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
              if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
              if (m === i) break;
              [a[i], a[m]] = [a[m], a[i]]; i = m;
            }
          }
          return top;
        }
      }

      function smallest_range(nums) {
      }
tests:
  - args: [[[4, 10, 15, 24, 26], [0, 9, 12, 20], [5, 18, 22, 30]]]
    expected: [20, 24]
  - args: [[[1, 2, 3], [1, 2, 3], [1, 2, 3]]]
    expected: [1, 1]
    label: a single value covers all lists
  - args: [[[7]]]
    expected: [7, 7]
    label: one list with one element
  - args: [[[1, 5], [2, 6]]]
    expected: [1, 2]
  - args: [[[10, 20], [1, 2], [15, 30]]]
    expected: [2, 15]
  - args: [[[1], [2], [3], [4]]]
    expected: [1, 4]
    label: every list has one element
  - args: [[[1, 3, 5, 7, 9], [2, 4, 6, 8, 10]]]
    expected: [1, 2]
    hidden: true
    label: ties broken by the smaller low end
  - args: [[[-5, 0, 5], [-1, 1], [3, 4]]]
    expected: [0, 3]
    hidden: true
  - args: [[[1, 100], [50, 60], [55, 200]]]
    expected: [55, 100]
    hidden: true
time_limit_ms: 4000
---
You are given `k` lists of integers, each sorted in non-decreasing order. Find the smallest closed range `[lo, hi]` that contains at least one number from every list. A range `[a, b]` is smaller than `[c, d]` if `b - a < d - c`, or if the widths are equal and `a < c`. Return `[lo, hi]`.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[4,10,15,24,26], [0,9,12,20], [5,18,22,30]]` | `[20, 24]` | `24` from list 1, `20` from list 2, `22` from list 3; no narrower range hits all three |
| `[[1,2,3], [1,2,3], [1,2,3]]` | `[1, 1]` | Width zero is possible when every list shares a value; `[1,1]` beats `[2,2]` on the low end |
| `[[10,20], [1,2], [15,30]]` | `[2, 15]` | Width 13; `[1,15]` also covers all lists but is wider |

### Constraints

- `1 ≤ k ≤ 3500`, `1 ≤ len(nums[i]) ≤ 50`
- `-10⁵ ≤ nums[i][j] ≤ 10⁵`

### Follow-up

The interviewer asks: "Prove that only ranges starting at an element the merge visits need to be considered." Then: "The lists are not sorted. What is the cheapest correct approach?"

## Solution

### The naive approach

Try every combination of one element per list: `O(∏ len)` combinations, each `O(k)` to evaluate. Exponential in `k`. A better brute force fixes each element as the low end and, for every other list, binary-searches the smallest element `≥ lo`; the maximum of those is `hi`. That is `O(N · k log m)` for `N` total elements, which is respectable and worth stating because it exposes the real structure: for a fixed low end, the best high end is forced.

### The insight

Walk the elements in merged sorted order, maintaining one pointer per list. At any moment the pointers select one element from each list; the minimum of the selected elements is `lo` and the maximum is `hi`, and that range is valid by construction. To find a narrower range you must raise `lo`, and the only way to do that without dropping a list is to advance the pointer of the list that currently holds the minimum. Each step advances exactly one pointer, so there are at most `N` steps, and a min-heap makes finding the minimum `O(log k)`. When the list holding the minimum has no next element, no further valid range exists with a larger `lo`, so stop.

### The optimal approach

```python
def smallest_range(nums: list[list[int]]) -> list[int]:
    heap: list[tuple[int, int, int]] = []
    hi = float("-inf")
    for i, lst in enumerate(nums):
        heap.append((lst[0], i, 0))
        hi = max(hi, lst[0])
    heapq.heapify(heap)
    best_lo, best_hi = heap[0][0], hi
    while True:
        lo, i, j = heapq.heappop(heap)
        if hi - lo < best_hi - best_lo:
            best_lo, best_hi = lo, hi
        if j + 1 == len(nums[i]):
            return [best_lo, best_hi]
        nxt = nums[i][j + 1]
        hi = max(hi, nxt)
        heapq.heappush(heap, (nxt, i, j + 1))
```

The strict `<` when updating the best range is what implements the tie-break: the merge visits low ends in increasing order, so the first range of a given width has the smallest `lo`, and later equal-width ranges never replace it.

Trace on `[[10,20], [1,2], [15,30]]`: pointers start at `10, 1, 15`, range `[1, 15]` width 14. Pop `1`, advance list 1 to `2`: range `[2, 15]` width 13, best. Pop `2`, list 1 is exhausted: stop. Answer `[2, 15]`.

Time `O(N log k)`; space `O(k)` for the heap.

### Common mistakes

- Tracking `hi` as the maximum of the *current* heap contents rather than the maximum ever pushed. They are the same thing here (the max is never popped before the loop ends), but computing it from the heap each step is `O(k)`.
- Using `≤` instead of `<` when updating the best range, which breaks the tie-break rule on equal widths.
- Continuing after a list is exhausted by skipping it, which produces ranges that do not cover every list.

### How to discuss it

State the two-part argument: for a fixed `lo` the best `hi` is forced, and the merge visits every candidate `lo` in order while the heap keeps the forced `hi` up to date. That is also the proof the first follow-up asks for: any valid range can have its `lo` raised to the smallest element `≥ lo` in some list without becoming invalid, and that element is one the merge visits. For unsorted lists, sort each one first (`O(N log m)`) and run the same merge; if you cannot sort, the two-pointer-over-merged-events formulation degenerates into the sliding-window-with-counts approach on the globally sorted `(value, list)` pairs, which is `O(N log N)` and equally correct.
