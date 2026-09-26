---
slug: kth-largest-array
title: Kth Largest Element in an Array
difficulty: medium
patterns: [heap]
lists: [ascend-150]
companies: [meta, amazon, google, microsoft]
order: 4
lesson: interview-patterns/sequence-patterns/top-k-elements
hints:
  - "Sorting gives the answer in O(n log n). The interviewer wants to know whether you can avoid sorting everything."
  - "A min-heap holding the k largest elements seen so far has the answer at its root. Push each element, pop when the size exceeds k: O(n log k)."
  - "For O(n) average, use quickselect: partition around a pivot and recurse only into the side that contains the index you need."
signatures:
  python:
    name: find_kth_largest
    starter: |
      def find_kth_largest(nums: list[int], k: int) -> int:
          pass
  javascript:
    name: find_kth_largest
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

      function find_kth_largest(nums, k) {
      }
tests:
  - args: [[3, 2, 1, 5, 6, 4], 2]
    expected: 5
  - args: [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4]
    expected: 4
    label: duplicates count separately
  - args: [[1], 1]
    expected: 1
    label: single element
  - args: [[2, 2, 2], 2]
    expected: 2
  - args: [[-1, -5, -3], 1]
    expected: -1
    label: all negative
  - args: [[7, 7, 8], 3]
    expected: 7
  - args: [[10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 10]
    expected: 1
    hidden: true
    label: k equals n
  - args: [[5, -2, 0, 9, 9, 3], 3]
    expected: 5
    hidden: true
  - args: [[0, 0, 1, 0], 1]
    expected: 1
    hidden: true
time_limit_ms: 4000
---
Given an unsorted array of integers `nums` and an integer `k`, return the `k`-th largest element. This is the `k`-th element in sorted-descending order, so duplicates count as separate positions: the 2nd largest of `[5, 5, 1]` is `5`, not `1`.

### Examples

| Input | Output | Why |
|---|---|---|
| `[3, 2, 1, 5, 6, 4]`, `k = 2` | `5` | Descending: `6, 5, ...` |
| `[3, 2, 3, 1, 2, 4, 5, 5, 6]`, `k = 4` | `4` | Descending: `6, 5, 5, 4, ...` |
| `[7, 7, 8]`, `k = 3` | `7` | Descending: `8, 7, 7` |

### Constraints

- `1 ≤ k ≤ len(nums) ≤ 10⁵`
- `-10⁴ ≤ nums[i] ≤ 10⁴`

### Follow-up

The interviewer asks: "What is the worst case of quickselect and how do you defend against it?" Then: "The array does not fit in memory; it is on disk in chunks. What now?"

## Solution

### The naive approach

Sort descending and return index `k - 1`. `O(n log n)` time, `O(1)` extra space if you sort in place. Any interviewer accepts this as a starting point and nobody accepts it as the end.

### The insight

There are two ways to avoid sorting everything. The first keeps only what matters: a min-heap of the `k` largest seen so far, whose root is the answer. The second stops sorting early: quickselect partitions the array around a pivot, and since only one side can contain the `k`-th position, it recurses into that side alone. Each partition halves the expected remaining work, so the expected total is `n + n/2 + n/4 + ... = O(n)`.

### The optimal approach

The heap version is short, deterministic and works on streams:

```python
def find_kth_largest(nums: list[int], k: int) -> int:
    heap: list[int] = []
    for x in nums:
        heapq.heappush(heap, x)
        if len(heap) > k:
            heapq.heappop(heap)
    return heap[0]
```

Time `O(n log k)`, space `O(k)`.

Quickselect for `O(n)` average time and `O(1)` extra space:

```python
def find_kth_largest_quickselect(nums: list[int], k: int) -> int:
    target = len(nums) - k  # index in ascending order
    lo, hi = 0, len(nums) - 1
    while True:
        pivot = nums[(lo + hi) // 2]
        i, j = lo, hi
        while i <= j:
            while nums[i] < pivot:
                i += 1
            while nums[j] > pivot:
                j -= 1
            if i <= j:
                nums[i], nums[j] = nums[j], nums[i]
                i += 1
                j -= 1
        if target <= j:
            hi = j
        elif target >= i:
            lo = i
        else:
            return nums[target]
```

The Hoare-style partition leaves everything in `[lo, j]` ≤ pivot, everything in `[i, hi]` ≥ pivot, and the elements strictly between `j` and `i` equal to the pivot. If the target falls in the middle band the answer is the pivot. Expected `O(n)`; worst case `O(n²)` if the pivot is repeatedly the extreme, which the middle-element pivot makes unlikely on non-adversarial data and a random pivot makes unlikely on any data.

### Common mistakes

- Off-by-one on `target`: the `k`-th largest is index `n - k` in *ascending* order.
- A Lomuto partition without three-way handling, which degrades to `O(n²)` on arrays full of duplicates such as `[2, 2, 2, ...]`.
- Popping `k` times from a max-heap of all `n` elements: correct, `O(n + k log n)`, but it uses `O(n)` space and does not show you know the size-`k` trick.

### How to discuss it

Offer both: "heap for `O(n log k)` and streaming; quickselect for `O(n)` average in place." Then be honest about quickselect's worst case, name the random-pivot defence, and mention that median-of-medians makes it `O(n)` worst case at a constant factor nobody pays in practice. For the disk follow-up, quickselect is out and the heap is in: stream the chunks through a size-`k` heap, or if `k` is also huge, run quickselect within each chunk to keep its top `k` and merge those.
