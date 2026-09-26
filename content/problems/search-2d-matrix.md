---
slug: search-2d-matrix
title: Search a 2D Matrix
difficulty: medium
patterns: [binary-search]
lists: [ascend-150]
companies: [amazon, microsoft, google]
order: 2
lesson: interview-patterns/array-patterns/binary-search
hints:
  - Read the guarantee carefully. If each row starts after the previous one ends, then reading the matrix row by row gives one fully sorted list.
  - Binary search over indices `0 .. rows*cols - 1` and translate an index `i` to the cell `matrix[i // cols][i % cols]`. No copying needed.
  - The alternative is two binary searches, first for the row, then within it. Both are O(log(rows*cols)); be able to explain why they are the same bound.
signatures:
  python:
    name: search_matrix
    starter: |
      def search_matrix(matrix: list[list[int]], target: int) -> bool:
          pass
  javascript:
    name: search_matrix
    starter: |
      function search_matrix(matrix, target) {
      }
tests:
  - args: [[[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]], 3]
    expected: true
  - args: [[[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]], 13]
    expected: false
    label: absent, would fall between rows
  - args: [[[1]], 1]
    expected: true
    label: single cell present
  - args: [[[1]], 2]
    expected: false
    label: single cell absent
  - args: [[[1, 3]], 3]
    expected: true
    label: single row
  - args: [[[1], [3], [5]], 5]
    expected: true
    hidden: true
    label: single column, last cell
  - args: [[[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]], 60]
    expected: true
    hidden: true
    label: last element
  - args: [[[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]], 0]
    expected: false
    hidden: true
    label: smaller than everything
  - args: [[[-5, -3], [0, 2]], -3]
    expected: true
    label: negatives
time_limit_ms: 4000
---
You are given an `m × n` integer matrix with two properties: every row is sorted in ascending order, and the first element of each row is strictly greater than the last element of the row above it. Given a `target`, return `true` if it appears in the matrix and `false` otherwise, in `O(log(m · n))` time.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]]`, `target = 3` | `true` | Row 0, column 1 |
| same matrix, `target = 13` | `false` | `13` would belong between `11` and `16`, which is not there |
| `[[1], [3], [5]]`, `target = 5` | `true` | A single column still satisfies both properties |

### Constraints

- `1 ≤ m, n ≤ 100`
- `-10⁴ ≤ matrix[i][j], target ≤ 10⁴`

### Follow-up

The interviewer asks: "Now drop the second property: rows are sorted and columns are sorted, but a row may overlap the next. Does your algorithm still work, and what is the best you can do?"

## Solution

### The naive approach

Scan every cell: `O(m · n)`. A slightly better idea is to binary search each row independently, `O(m log n)`. Both waste the second property, which is the one that makes the problem interesting.

### The insight

Row `i` ends below where row `i + 1` starts. So if you concatenate the rows you get a single sorted array of length `m · n`, and you do not need to build it: index `k` in that virtual array is cell `(k // n, k % n)`. One ordinary binary search on the virtual array is `O(log(m · n))`.

### The optimal approach

```python
def search_matrix(matrix: list[list[int]], target: int) -> bool:
    if not matrix or not matrix[0]:
        return False
    m, n = len(matrix), len(matrix[0])
    lo, hi = 0, m * n - 1
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        value = matrix[mid // n][mid % n]
        if value == target:
            return True
        if value < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return False
```

Time `O(log(m · n)) = O(log m + log n)`. Space `O(1)`.

Trace `target = 13` on the example: `lo = 0, hi = 11`. `mid = 5 → (1, 1) = 11 < 13`, so `lo = 6`. `mid = 8 → (2, 0) = 23 > 13`, so `hi = 7`. `mid = 6 → (1, 2) = 16 > 13`, so `hi = 5`. Loop ends, `false`.

The two-stage alternative, binary search over rows by first element to find the only row that could contain `target` and then binary search within that row, has the same bound, since `log m + log n = log(m · n)`. It has more code and two places for off-by-ones, but it also generalises to jagged rows. Pick the flattened version in the interview and mention the other.

### Common mistakes

- Using `mid // m` and `mid % m` (swapping rows and columns). Index arithmetic is `row = k // cols`, `col = k % cols`.
- Doing the row-finding binary search and then linearly scanning the row, which is `O(log m + n)`, and claiming it is logarithmic.
- Solving the *other* matrix-search problem (the staircase walk, below) and getting `O(m + n)` when `O(log(m · n))` was asked for.

### How to discuss it

Say "the second property means the matrix is a sorted array in disguise; I'll binary search on the flat index and map it to a cell." For the follow-up without the cross-row guarantee, the flat array is no longer sorted and binary search is invalid. The standard answer is the staircase: start at the top-right corner; if the cell is larger than `target` move left, if smaller move down; each step eliminates a row or a column, so `O(m + n)`. You can prove `O(m + n)` is not improvable to logarithmic for that variant by noting that the anti-diagonal of an `n × n` sorted-rows-sorted-columns matrix can hold `n` values in any order, so any algorithm must examine `Ω(n)` cells. Being able to say *which* guarantee you are exploiting, and what breaks without it, is the answer the interviewer is grading. Compare with [Binary Search](/practice/binary-search-basic).
