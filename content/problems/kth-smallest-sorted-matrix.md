---
slug: kth-smallest-sorted-matrix
title: Kth Smallest Element in a Sorted Matrix
difficulty: medium
patterns: [k-way-merge]
lists: [ascend-150]
companies: [amazon, google, meta, apple]
order: 1
lesson: interview-patterns/sequence-patterns/k-way-merge
hints:
  - "Each row is a sorted list. The k-th smallest of the whole matrix is the k-th element produced by merging the rows."
  - "Seed a min-heap with the first element of each row (value, row, column). Pop the smallest, push the next element of that row. The k-th pop is the answer, and the heap never exceeds n entries."
  - "Only the first min(k, n) rows can contribute, since the k-th smallest cannot come from a row whose first element is already beyond k others."
signatures:
  python:
    name: kth_smallest
    starter: |
      def kth_smallest(matrix: list[list[int]], k: int) -> int:
          pass
  javascript:
    name: kth_smallest
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

      function kth_smallest(matrix, k) {
      }
tests:
  - args: [[[1, 5, 9], [10, 11, 13], [12, 13, 15]], 8]
    expected: 13
  - args: [[[-5]], 1]
    expected: -5
    label: single cell
  - args: [[[1, 2], [1, 3]], 2]
    expected: 1
    label: duplicates across rows
  - args: [[[1, 3, 5], [2, 4, 6]], 4]
    expected: 4
  - args: [[[1, 1, 1], [1, 1, 1], [1, 1, 1]], 9]
    expected: 1
    label: all equal
  - args: [[[1, 2], [3, 4]], 3]
    expected: 3
    label: answer at a row boundary
  - args: [[[2, 6, 8], [3, 7, 10], [5, 8, 11]], 5]
    expected: 7
    hidden: true
  - args: [[[1, 4], [2, 5]], 4]
    expected: 5
    hidden: true
    label: k equals the cell count
  - args: [[[-10, -8, -3], [-9, -7, 0], [-4, -2, 1]], 6]
    expected: -3
    hidden: true
time_limit_ms: 4000
---
You are given an `n × n` matrix in which every row and every column is sorted in non-decreasing order, and an integer `k`. Return the `k`-th smallest element of the matrix, counting duplicates as separate elements (the 2nd smallest of `[[1, 2], [1, 3]]` is `1`).

### Examples

| Input | Output | Why |
|---|---|---|
| `[[1, 5, 9], [10, 11, 13], [12, 13, 15]]`, `k = 8` | `13` | Sorted: `1, 5, 9, 10, 11, 12, 13, 13, 15` |
| `[[1, 3, 5], [2, 4, 6]]`, `k = 4` | `4` | Sorted: `1, 2, 3, 4, ...` |
| `[[1, 2], [1, 3]]`, `k = 2` | `1` | Both `1`s count |

### Constraints

- `1 ≤ n ≤ 300`
- `-10⁹ ≤ matrix[i][j] ≤ 10⁹`
- `1 ≤ k ≤ n²`

### Follow-up

The interviewer asks: "Can you get the time independent of `k`?" Then: "The matrix is a billion cells on disk, sorted rows and columns. Which approach reads the fewest cells?"

## Solution

### The naive approach

Flatten to a list of `n²` values and sort: `O(n² log n)`. Or flatten and quickselect: `O(n²)` average. Both ignore that the rows are already sorted, and both need all `n²` values in memory.

### The insight

Each row is a sorted list, so the whole matrix is `n` sorted lists, and the `k`-th smallest overall is the `k`-th element the merge of those lists would produce. You do not need to finish the merge: seed a min-heap with the head of each row, pop the smallest `k` times, and after each pop push the next element from the row it came from. The heap holds at most `n` candidates at any moment, one per row.

### The optimal approach

```python
def kth_smallest(matrix: list[list[int]], k: int) -> int:
    rows, cols = len(matrix), len(matrix[0])
    heap = [(matrix[r][0], r, 0) for r in range(min(rows, k))]
    heapq.heapify(heap)
    val = 0
    for _ in range(k):
        val, r, c = heapq.heappop(heap)
        if c + 1 < cols:
            heapq.heappush(heap, (matrix[r][c + 1], r, c + 1))
    return val
```

Time `O(k log n)`; with `k ≤ n²` that is at worst `O(n² log n)`, but for small `k` it touches only a sliver of the matrix. Space `O(n)`.

The `k`-independent alternative is a binary search on the *value*: between `matrix[0][0]` and `matrix[n-1][n-1]`, guess a value `mid` and count how many cells are `≤ mid` by walking from the bottom-left corner (step up when the cell exceeds `mid`, right when it does not), which is `O(n)` per count because rows and columns are both sorted. If the count is at least `k`, the answer is `≤ mid`. Total `O(n log(max - min))`, `O(1)` space, and the answer is guaranteed to be a matrix element because the search converges on the smallest value with count `≥ k`.

### Common mistakes

- Seeding the heap with the whole first row *and* the whole first column; the row heads alone are enough because each row is fully sorted.
- Using `k` to bound the number of rows seeded but forgetting it when pushing, which does not break correctness but wastes work.
- Off-by-one in the loop: the answer is the value from the `k`-th pop, not the heap's root afterwards.

### How to discuss it

Frame it as "k-way merge, stopped early", give the `O(k log n)` bound, and volunteer the binary-search-on-value approach as the way to beat it when `k` is large. For the disk follow-up, the heap reads `k + n` cells at most, which wins for small `k`; the binary search reads `O(n)` cells per probe times `~30` probes, which wins when `k` is a large fraction of the matrix. Choosing based on `k` relative to `n` is the point.
