---
slug: spiral-matrix
title: Spiral Matrix
difficulty: medium
patterns: [matrix]
lists: [core-75, ascend-150]
companies: [microsoft, amazon, apple, google]
order: 2
lesson: interview-patterns/array-patterns/matrix-traversal
hints:
  - "Keep four boundaries: the top and bottom rows and the left and right columns that have not been visited yet. Each side of the spiral walks along one boundary and then moves it inward."
  - "One lap is: left to right along `top`, then `top += 1`; top to bottom along `right`, then `right -= 1`; right to left along `bottom`, then `bottom -= 1`; bottom to top along `left`, then `left += 1`."
  - "After the first two legs, re-check that `top <= bottom` before walking the bottom row and that `left <= right` before walking the left column. Without those checks a single leftover row or column is visited twice."
signatures:
  python:
    name: spiral_order
    starter: |
      def spiral_order(matrix: list[list[int]]) -> list[int]:
          pass
  javascript:
    name: spiral_order
    starter: |
      function spiral_order(matrix) {
      }
tests:
  - args: [[[3, 1, 4], [1, 5, 9], [2, 6, 5]]]
    expected: [3, 1, 4, 9, 5, 6, 2, 1, 5]
  - args: [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]]
    expected: [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]
    label: wide matrix
  - args: [[[7, 8, 9]]]
    expected: [7, 8, 9]
    label: single row
  - args: [[[1], [2], [3]]]
    expected: [1, 2, 3]
    label: single column
  - args: [[[42]]]
    expected: [42]
    label: 1 × 1
  - args: [[[1, 2], [3, 4], [5, 6], [7, 8]]]
    expected: [1, 2, 4, 6, 8, 7, 5, 3]
    label: tall and narrow
  - args: [[[1, 2, 3], [4, 5, 6]]]
    expected: [1, 2, 3, 6, 5, 4]
    hidden: true
  - args: [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]]]
    expected: [1, 2, 3, 4, 8, 12, 16, 15, 14, 13, 9, 5, 6, 7, 11, 10]
    hidden: true
  - args: [[[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14, 15]]]
    expected: [1, 2, 3, 6, 9, 12, 15, 14, 13, 10, 7, 4, 5, 8, 11]
    hidden: true
    label: leftover middle column
time_limit_ms: 4000
---
You are given an `m × n` matrix of integers. Return all of its elements in **clockwise spiral order**: start at the top-left corner, walk right along the top row, down the right column, left along the bottom row, up the left column, and then repeat on the remaining inner matrix until every element has been visited exactly once.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[3, 1, 4], [1, 5, 9], [2, 6, 5]]` | `[3, 1, 4, 9, 5, 6, 2, 1, 5]` | Outer ring clockwise, then the centre `5` |
| `[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]` | `[1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]` | The inner "ring" is the single row `6, 7` |
| `[[1], [2], [3]]` | `[1, 2, 3]` | A single column is just walked downwards |

### Constraints

- `1 ≤ m, n ≤ 10`
- `-100 ≤ matrix[r][c] ≤ 100`

### Follow-up

The interviewer asks: "Do it without four separate loops, using a direction vector." Then: "Now produce the matrix from the spiral, the inverse operation." (That is [Spiral Matrix II](/practice/spiral-matrix-ii).)

## Solution

### The naive approach

Simulate a walker with a `visited` matrix: move in the current direction, and turn right whenever the next cell is out of bounds or already visited. That is `O(mn)` time and `O(mn)` extra space for `visited`. It is a perfectly good answer, and it is the natural route to the direction-vector follow-up. The boundary version below drops the `visited` matrix.

### The insight

The unvisited part of the matrix is always a rectangle, described by four numbers: `top`, `bottom`, `left`, `right`. Each leg of the spiral consumes one side of that rectangle and then shrinks it by one. You never need to remember which cells you have seen; the boundaries say it.

The subtle part is the end. When the remaining rectangle is a single row, the "left to right" leg consumes it and `top` passes `bottom`. The "right to left" leg would then walk the same row backwards. Likewise a single remaining column would be walked twice. So legs three and four must re-check that the rectangle is still non-empty.

### The optimal approach

```python
def spiral_order(matrix: list[list[int]]) -> list[int]:
    out: list[int] = []
    top, bottom = 0, len(matrix) - 1
    left, right = 0, len(matrix[0]) - 1
    while top <= bottom and left <= right:
        for c in range(left, right + 1):            # top row, left to right
            out.append(matrix[top][c])
        top += 1
        for r in range(top, bottom + 1):            # right column, downwards
            out.append(matrix[r][right])
        right -= 1
        if top <= bottom:
            for c in range(right, left - 1, -1):    # bottom row, right to left
                out.append(matrix[bottom][c])
            bottom -= 1
        if left <= right:
            for r in range(bottom, top - 1, -1):    # left column, upwards
                out.append(matrix[r][left])
            left += 1
    return out
```

Trace the 5 × 3 hidden case (`1..15` in rows of three). Lap 1 visits `1, 2, 3`, then `6, 9, 12, 15`, then `14, 13`, then `10, 7, 4`; the rectangle is now rows 1–3, column 1. Lap 2 visits `5` (top row), then `8, 11` (right column), after which `right = 0 < left = 1`. The bottom-row leg runs an empty range and the left-column leg is skipped by its guard. Total: 15 elements, each once.

Time `O(mn)`: each element is appended exactly once. Space `O(1)` beyond the output.

### Common mistakes

- Omitting the `top <= bottom` / `left <= right` re-checks. On the 3 × 4 example, lap 2 walks the leftover row `6, 7` left to right, and then the unguarded bottom-row leg walks back along the same row and emits `6` a second time.
- Using inclusive/exclusive ranges inconsistently, for example walking the right column from `top - 1` and double-counting the corner.
- Assuming the matrix is square. A 1 × n or m × 1 input is the quickest way to find boundary bugs; test both before declaring victory.

### How to discuss it

Describe the invariant ("the unvisited cells always form the rectangle `[top..bottom] × [left..right]`") and the four legs, then call out the single-row and single-column edge cases before you code them, rather than discovering them while tracing. For the direction-vector follow-up, keep `dirs = [(0, 1), (1, 0), (0, -1), (-1, 0)]` and turn when the next cell is outside the current boundaries, shrinking the boundary you just finished; that version generalises to "walk a grid in some pattern" questions. Spiral traversal shows up in practice in image tiling, cache-friendly block traversals and printing matrices, but interviewers use it mainly to see whether you manage boundaries cleanly under pressure.
