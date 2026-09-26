---
slug: k-closest-points
title: K Closest Points to Origin
difficulty: medium
patterns: [heap]
lists: [ascend-150]
companies: [amazon, meta, google, linkedin]
order: 3
lesson: interview-patterns/sequence-patterns/top-k-elements
hints:
  - "Comparing distances does not need the square root; compare `x² + y²` and stay in integers."
  - "You want the k smallest distances from a stream of n. Keep a heap of size k that evicts the *largest* distance it holds: a max-heap keyed on distance."
  - "In Python push `(-dist, x, y)` so the min-heap root is the farthest point in the current top k. Pop it when the heap exceeds k."
signatures:
  python:
    name: k_closest
    starter: |
      def k_closest(points: list[list[int]], k: int) -> list[list[int]]:
          pass
  javascript:
    name: k_closest
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

      function k_closest(points, k) {
      }
tests:
  - args: [[[1, 3], [-2, 2]], 1]
    expected: [[-2, 2]]
    any_order: true
  - args: [[[3, 3], [5, -1], [-2, 4]], 2]
    expected: [[3, 3], [-2, 4]]
    any_order: true
  - args: [[[0, 0]], 1]
    expected: [[0, 0]]
    any_order: true
    label: single point at the origin
  - args: [[[1, 1], [2, 2], [3, 3], [4, 4]], 3]
    expected: [[1, 1], [2, 2], [3, 3]]
    any_order: true
  - args: [[[0, 5], [4, 0], [1, 1], [-1, -1], [10, 10]], 3]
    expected: [[1, 1], [-1, -1], [4, 0]]
    any_order: true
    label: mixed quadrants
  - args: [[[2, -1], [-3, 0], [0, 4]], 3]
    expected: [[2, -1], [-3, 0], [0, 4]]
    any_order: true
    hidden: true
    label: k equals n
  - args: [[[-2, -3], [1, 1], [0, -4], [3, 0], [-1, 2]], 2]
    expected: [[1, 1], [-1, 2]]
    any_order: true
    hidden: true
  - args: [[[6, 8], [-6, -8], [3, 4], [0, 1]], 2]
    expected: [[3, 4], [0, 1]]
    any_order: true
    hidden: true
    label: equal distances outside the answer
time_limit_ms: 4000
---
You are given a list of points `[x, y]` on the integer plane and an integer `k`. Return the `k` points closest to the origin `(0, 0)` by Euclidean distance, in any order. Inputs are chosen so the answer is unique: the `k`-th closest point is strictly closer than the `(k+1)`-th.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[1, 3], [-2, 2]]`, `k = 1` | `[[-2, 2]]` | Squared distances are `10` and `8` |
| `[[3, 3], [5, -1], [-2, 4]]`, `k = 2` | `[[3, 3], [-2, 4]]` | Squared distances `18, 26, 20`; drop the `26` |
| `[[0, 5], [4, 0], [1, 1], [-1, -1], [10, 10]]`, `k = 3` | `[[1, 1], [-1, -1], [4, 0]]` | `2, 2, 16` beat `25` and `200` |

### Constraints

- `1 ≤ k ≤ len(points) ≤ 10⁴`
- `-10⁴ ≤ x, y ≤ 10⁴`

### Follow-up

The interviewer asks: "Can you beat `O(n log k)`?" Then: "The points now arrive as an infinite stream and `k` is a million. Which approach survives?"

## Solution

### The naive approach

Compute every squared distance, sort the points by it, take the first `k`. `O(n log n)` time, `O(n)` space. It is correct and for `n = 10⁴` it is fast; the interviewer wants to hear that you know it sorts `n - k` points you will throw away.

### The insight

You want the `k` smallest of `n` values, and you can decide for each incoming point whether it beats the *worst* point currently in your candidate set. That worst point is the maximum distance among the candidates, so keep the candidates in a max-heap of size `k`: push each point, and if the heap grows past `k`, pop the farthest. Everything in the heap at the end is the answer.

Distances compare identically whether or not you take the square root, so use `x² + y²` and avoid floating point entirely.

### The optimal approach

```python
def k_closest(points: list[list[int]], k: int) -> list[list[int]]:
    heap: list[tuple[int, int, int]] = []
    for x, y in points:
        heapq.heappush(heap, (-(x * x + y * y), x, y))
        if len(heap) > k:
            heapq.heappop(heap)
    return [[x, y] for _, x, y in heap]
```

Time `O(n log k)`: one push and possibly one pop per point on a heap that never exceeds `k + 1`. Space `O(k)`.

The `O(n)` average alternative is quickselect on the array of squared distances: partition around a pivot until the `k`-th smallest is in place, then return the first `k`. It is faster for one-shot batch input but it needs the whole array in memory and its worst case is `O(n²)` without a careful pivot.

### Common mistakes

- Using a min-heap and popping `k` times, which is `O(n + k log n)` and, more to the point, does not describe a bounded-memory candidate set.
- Pushing `(dist, point)` where `point` is a list; if two distances tie Python tries to compare the lists, which works for lists of ints but fails for other payloads. Unpack into scalars.
- Calling `math.sqrt` per point: not wrong, just needless floating point.

### How to discuss it

Say "top-k of a stream is a size-`k` heap keyed the opposite way: max-heap for the `k` smallest." Give both complexities, and answer the "beat it" follow-up with quickselect and its trade-offs. For the streaming follow-up, quickselect is out (it needs the array), the heap is in: `O(k)` memory and `O(log k)` per point regardless of how many arrive. If `k` is a million and points are millions per second, mention that the heap's random memory access pattern is the bottleneck and that batching points and running quickselect on each batch before merging into the heap amortises it.
