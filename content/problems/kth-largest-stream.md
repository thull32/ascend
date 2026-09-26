---
slug: kth-largest-stream
title: Kth Largest Element in a Stream
difficulty: easy
patterns: [heap]
lists: [ascend-150]
companies: [amazon, meta, google, apple]
order: 1
lesson: interview-patterns/sequence-patterns/top-k-elements
hints:
  - "You never need to know anything about elements outside the k largest. What is the smallest container that keeps exactly the k largest and can tell you the smallest of them in O(1)?"
  - "A min-heap of size k: its root is the k-th largest. When a new value arrives, push it, and if the heap has grown past k, pop the root."
  - "Build the initial heap the same way, one element at a time, or heapify and then pop down to size k. Either way the constructor handles fewer than k initial elements gracefully."
signatures:
  python:
    name: KthLargest
    starter: |
      class KthLargest:
          def __init__(self, k: int, nums: list[int]):
              pass

          def add(self, val: int) -> int:
              pass
  javascript:
    name: KthLargest
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

      class KthLargest {
        constructor(k, nums) {
        }
        add(val) {
        }
      }
tests:
  - args: [["__init__", 3, [4, 5, 8, 2]], ["add", 3], ["add", 5], ["add", 10], ["add", 9], ["add", 4]]
    expected: [null, 4, 5, 5, 8, 8]
  - args: [["__init__", 1, []], ["add", 3], ["add", -2], ["add", 7]]
    expected: [null, 3, 3, 7]
    label: k equals 1 with an empty start
  - args: [["__init__", 2, [1]], ["add", 2], ["add", 3], ["add", 0]]
    expected: [null, 1, 2, 2]
    label: fewer initial elements than k
  - args: [["__init__", 2, [5, 5, 5]], ["add", 5], ["add", 6], ["add", 7]]
    expected: [null, 5, 5, 6]
    label: duplicates
  - args: [["__init__", 3, [10, 20, 30, 40]], ["add", 5], ["add", 25], ["add", 35], ["add", 50]]
    expected: [null, 20, 25, 30, 35]
    hidden: true
  - args: [["__init__", 2, [-5, -10]], ["add", -3], ["add", -20], ["add", 0]]
    expected: [null, -5, -5, -3]
    hidden: true
    label: negatives
  - args: [["__init__", 4, [1, 2, 3]], ["add", 4], ["add", 5]]
    expected: [null, 1, 2]
  - args: [["__init__", 1, [2, 2]], ["add", 1], ["add", 2], ["add", 3]]
    expected: [null, 2, 2, 3]
    hidden: true
time_limit_ms: 4000
---
Design a class that tracks the `k`-th largest value in a growing stream of integers, counting duplicates as separate elements (the 2nd largest of `[5, 5, 5]` is `5`). Implement `KthLargest` with:

- `__init__(k, nums)` — `k` and the initial values, which may be fewer than `k`.
- `add(val)` — append `val` to the stream and return the current `k`-th largest value.

It is guaranteed that by the time `add` returns there are at least `k` values in the stream.

Tests are given as a sequence of method calls beginning with `__init__`; the expected output is the list of return values in order, with `null` for the constructor.

### Examples

| Calls | Returns | Why |
|---|---|---|
| `KthLargest(3, [4, 5, 8, 2]), add(3)` | `null, 4` | The three largest are `8, 5, 4` |
| `add(5), add(10)` (continuing) | `5, 5` | After adding 5: `8, 5, 5`; after 10: `10, 8, 5` |
| `KthLargest(2, [1]), add(2)` | `null, 1` | Only two values exist, the second largest is `1` |

### Constraints

- `1 ≤ k ≤ 10⁴`, `0 ≤ len(nums) ≤ 10⁴`
- `-10⁴ ≤ val ≤ 10⁴`
- At most `10⁴` calls to `add`

### Follow-up

The interviewer asks: "Now `k` can change between calls. What breaks?" Then: "What if values can also be *removed* from the stream?"

## Solution

### The naive approach

Keep every value in a list; on each `add`, sort and index. That is `O(n log n)` per call, `O(n² log n)` over the stream. Keeping the list sorted with `bisect.insort` cuts the sort but insertion into a Python list is still `O(n)` because of the shift. Both keep every value, which is more than the question needs.

### The insight

Only the `k` largest values can ever be the answer, and among them you only ever need the *smallest*. That is exactly the shape of a min-heap of size `k`: the root is the smallest of the `k` largest, which is the `k`-th largest overall. A new value either belongs in the top `k` (push it, evict the root) or does not (it is smaller than the root and can be discarded immediately, which the same push-then-pop handles).

### The optimal approach

```python
class KthLargest:
    def __init__(self, k: int, nums: list[int]):
        self.k = k
        self.heap: list[int] = []
        for x in nums:
            self.add(x)

    def add(self, val: int) -> int:
        heapq.heappush(self.heap, val)
        if len(self.heap) > self.k:
            heapq.heappop(self.heap)
        return self.heap[0]
```

`add` is `O(log k)`. The constructor is `O(n log k)`; heapifying `nums` in `O(n)` and popping down to `k` is an alternative with the same bound. Space is `O(k)`, independent of the length of the stream, which is the property that makes this a streaming algorithm.

### Common mistakes

- Using a max-heap "because we want the largest": you would then have to pop `k` times per query.
- Popping *before* pushing when the heap is full, which loses a value that might have belonged in the top `k`. Push first, then trim.
- Returning `heap[0]` before the stream has `k` values; the problem guarantees it will not happen on `add`, but the constructor must not assume `len(nums) ≥ k`.

### How to discuss it

State the invariant first: "the heap always holds exactly the `k` largest seen so far, so its minimum is the answer." Then give the cost per call and the memory bound, and point out that `O(k)` memory is why this scales to unbounded streams. If `k` can change: a smaller `k` means trim the heap; a larger `k` means you have thrown values away and cannot recover them, so you would need to keep everything (a balanced tree or an order-statistic structure) for `O(log n)` queries. Removals need the same: the fixed-size heap cannot delete arbitrary elements, so move to a sorted container or a heap with lazy deletion.
