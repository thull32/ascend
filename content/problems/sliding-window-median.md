---
slug: sliding-window-median
title: Sliding Window Median
difficulty: hard
patterns: [two-heaps]
lists: [ascend-150]
companies: [google, amazon, meta]
order: 2
lesson: interview-patterns/sequence-patterns/two-heaps
hints:
  - "The two-heap median works for a stream that only grows. The window also *removes* elements, and a heap cannot delete an arbitrary element cheaply."
  - "Lazy deletion: record the element to remove in a counter and only discard it when it surfaces at the top of a heap. Keep separate counts of how many *valid* elements each heap holds so balancing uses real sizes."
  - "After every add, remove or rebalance, prune the tops of both heaps so that a root is always a live element. The median is then read off the roots exactly as in the streaming version."
signatures:
  python:
    name: median_sliding_window
    starter: |
      def median_sliding_window(nums: list[int], k: int) -> list[float]:
          pass
  javascript:
    name: median_sliding_window
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

      function median_sliding_window(nums, k) {
      }
tests:
  - args: [[1, 3, -1, -3, 5, 3, 6, 7], 3]
    expected: [1.0, -1.0, -1.0, 3.0, 5.0, 6.0]
  - args: [[1, 2, 3, 4], 2]
    expected: [1.5, 2.5, 3.5]
    label: even window
  - args: [[7], 1]
    expected: [7.0]
    label: single element
  - args: [[4, 2, 1, 3], 4]
    expected: [2.5]
    label: window equals the array
  - args: [[2, 2, 2, 2, 2], 3]
    expected: [2.0, 2.0, 2.0]
    label: duplicates
  - args: [[9, 8, 7, 6, 5], 1]
    expected: [9.0, 8.0, 7.0, 6.0, 5.0]
  - args: [[1, 4, 2, 3], 3]
    expected: [2.0, 3.0]
    hidden: true
  - args: [[5, -1, 0, 8, -3, 2], 2]
    expected: [2.0, -0.5, 4.0, 2.5, -0.5]
    hidden: true
    label: negatives and even window
  - args: [[3, 1, 2, 5, 4, 6], 4]
    expected: [2.5, 3.0, 4.5]
    hidden: true
time_limit_ms: 4000
---
Given an integer array `nums` and a window size `k`, slide a window of `k` consecutive elements from left to right and return the median of each window, as a list of floats. The median of an odd count is the middle value in sorted order; of an even count, the mean of the two middle values.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 3, -1, -3, 5, 3, 6, 7]`, `k = 3` | `[1, -1, -1, 3, 5, 6]` | Windows `[1,3,-1]`, `[3,-1,-3]`, `[-1,-3,5]`, ... |
| `[1, 2, 3, 4]`, `k = 2` | `[1.5, 2.5, 3.5]` | Each pair's mean |
| `[4, 2, 1, 3]`, `k = 4` | `[2.5]` | One window; sorted `1, 2, 3, 4`, middle pair `2, 3` |

### Constraints

- `1 ≤ k ≤ len(nums) ≤ 10⁵`
- `-2³¹ ≤ nums[i] ≤ 2³¹ - 1`

### Follow-up

The interviewer asks: "The lazy-deleted elements never leave the heap until they surface. What is your worst-case memory, and does it matter?" Then: "What structure would give you true `O(log k)` deletion, and why don't we have it in Python's standard library?"

## Solution

### The naive approach

For each window, copy, sort, index the middle. `O(n · k log k)`. A sorted list maintained with `bisect.insort` and `list.remove` is `O(n · k)` because both operations shift the list; for `k` up to a few thousand it is fast in practice and worth mentioning as a pragmatic option, but it is not the answer.

### The insight

The two-heap median gives `O(log k)` inserts, and the window is a stream with one insert and one removal per step. The removal is the problem: a heap cannot find and delete an arbitrary element. But it does not need to. Mark the element as deleted in a counter and leave it in the heap; whenever a deleted element reaches the top, pop it. The roots, which are all the median needs, are always live after pruning, and as long as you track the number of *valid* elements in each heap separately from the physical length, the size-balancing logic is unchanged.

### The optimal approach

Maintain `small` (max-heap, negated) for the lower half and `large` (min-heap) for the upper half, with `sizes[0]` and `sizes[1]` counting live elements. Invariant: `sizes[0]` equals `sizes[1]` or exceeds it by one. Removal decides which heap the departing element lives in by comparing it with the top of `small`: anything `≤ small`'s top is in `small`, because every element of `small` is `≤` every element of `large`.

```python
def median_sliding_window(nums: list[int], k: int) -> list[float]:
    small: list[int] = []  # max-heap via negation
    large: list[int] = []  # min-heap
    delayed: dict[int, int] = collections.defaultdict(int)
    sizes = [0, 0]  # live counts for small, large

    def prune(heap: list[int], is_large: bool) -> None:
        while heap:
            x = heap[0] if is_large else -heap[0]
            if delayed[x]:
                delayed[x] -= 1
                heapq.heappop(heap)
            else:
                break

    def rebalance() -> None:
        if sizes[0] > sizes[1] + 1:
            heapq.heappush(large, -heapq.heappop(small))
            sizes[0] -= 1
            sizes[1] += 1
            prune(small, False)
        elif sizes[0] < sizes[1]:
            heapq.heappush(small, -heapq.heappop(large))
            sizes[1] -= 1
            sizes[0] += 1
            prune(large, True)

    def add(x: int) -> None:
        if not small or x <= -small[0]:
            heapq.heappush(small, -x)
            sizes[0] += 1
        else:
            heapq.heappush(large, x)
            sizes[1] += 1
        rebalance()

    def remove(x: int) -> None:
        delayed[x] += 1
        if x <= -small[0]:
            sizes[0] -= 1
            if x == -small[0]:
                prune(small, False)
        else:
            sizes[1] -= 1
            if x == large[0]:
                prune(large, True)
        rebalance()

    def median() -> float:
        if k % 2:
            return float(-small[0])
        return (-small[0] + large[0]) / 2

    out: list[float] = []
    for i, x in enumerate(nums):
        add(x)
        if i >= k:
            remove(nums[i - k])
        if i >= k - 1:
            out.append(median())
    return out
```

Why the roots are always live: `add` never covers a root with a deleted element; `remove` prunes immediately when the departing element *is* a root; and `rebalance` moves a (live) root across and then prunes the heap it came from, whose new root might be stale. Every path that could expose a deleted element at a root ends with a prune.

Each element is pushed once, moved at most once per rebalance, and popped once, so the total is `O(n log n)` (heaps may physically hold stale elements up to `n`, not `k`). Space `O(n)` in the worst case, `O(k)` typically.

### Common mistakes

- Balancing on `len(heap)` instead of the live counts, so stale elements skew the split and the wrong root is reported.
- Deciding which heap a removed element belongs to by re-examining both tops after pruning rather than before; compare with `small`'s top first, then prune.
- Forgetting to prune after a rebalance move, which is the one path that can leave a stale root and produce a wrong median several windows later.

### How to discuss it

Explain the streaming two-heap median first, then say exactly what removal breaks and how lazy deletion fixes it. Be precise that the live counts, not the heap lengths, drive balancing. For the memory follow-up: stale elements accumulate until they surface, so the physical heaps can grow to `O(n)` on adversarial input (a monotonically increasing array keeps pushing to `large` and deleting from `small`'s depths); it rarely matters, and a periodic rebuild bounds it. For true `O(log k)` deletion you want a balanced BST or an order-statistic tree (`SortedList` from the `sortedcontainers` package is the practical Python answer); the standard library omits it because a well-tuned skip list or B-tree in pure Python is slower than a bisected list for the sizes most programs see.
