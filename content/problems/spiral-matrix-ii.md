---
slug: spiral-matrix-ii
title: Spiral Matrix II
difficulty: medium
patterns: [math]
lists: [ascend-150]
companies: [microsoft, amazon, apple, google]
order: 5
lesson: interview-patterns/combinatorial-patterns/math-and-geometry
hints:
  - "This is the inverse of reading a matrix in spiral order: instead of reading cells along the spiral, write 1, 2, 3, ... into them. The same four-boundary walk works."
  - "Keep top, bottom, left and right boundaries. Fill the top row left to right, then the right column downwards, then the bottom row right to left, then the left column upwards, shrinking the matching boundary after each leg."
  - "For a square matrix the loop can simply run while the next number is at most n². For odd n the last lap is the single centre cell; check that your legs do not overwrite it."
signatures:
  python:
    name: generate_matrix
    starter: |
      def generate_matrix(n: int) -> list[list[int]]:
          pass
  javascript:
    name: generate_matrix
    starter: |
      function generate_matrix(n) {
      }
tests:
  - args: [1]
    expected: [[1]]
    label: single cell
  - args: [2]
    expected: [[1, 2], [4, 3]]
  - args: [3]
    expected: [[1, 2, 3], [8, 9, 4], [7, 6, 5]]
    label: odd size ends in the centre
  - args: [4]
    expected: [[1, 2, 3, 4], [12, 13, 14, 5], [11, 16, 15, 6], [10, 9, 8, 7]]
    label: even size ends in a 2 × 2 core
  - args: [5]
    expected: [[1, 2, 3, 4, 5], [16, 17, 18, 19, 6], [15, 24, 25, 20, 7], [14, 23, 22, 21, 8], [13, 12, 11, 10, 9]]
    hidden: true
  - args: [6]
    expected: [[1, 2, 3, 4, 5, 6], [20, 21, 22, 23, 24, 7], [19, 32, 33, 34, 25, 8], [18, 31, 36, 35, 26, 9], [17, 30, 29, 28, 27, 10], [16, 15, 14, 13, 12, 11]]
    hidden: true
time_limit_ms: 4000
---
Given a positive integer `n`, build an `n × n` matrix containing the numbers `1` to `n²`, placed in **clockwise spiral order** starting from the top-left corner: `1, 2, …` along the top row, then down the right column, back along the bottom row, up the left column, and inwards until the matrix is full.

### Examples

| Input | Output | Why |
|---|---|---|
| `n = 2` | `[[1, 2], [4, 3]]` | Right, down, left: the spiral closes after one lap |
| `n = 3` | `[[1, 2, 3], [8, 9, 4], [7, 6, 5]]` | The outer ring holds `1–8`; the centre gets `9` |
| `n = 1` | `[[1]]` | |

### Constraints

- `1 ≤ n ≤ 20`

### Follow-up

The interviewer asks: "Without building the matrix, what number ends up at row `r`, column `c`?" Then: "Generate an `m × n` rectangle instead of a square."

## Solution

### The naive approach

Simulate a walker with a direction and turn right whenever the next cell is outside the matrix or already filled (a cell is "filled" when it is non-zero). `O(n²)` time, no extra space beyond the output since the matrix itself records what has been filled. It is a good answer; the boundary version below is the same idea with the "have I been here?" check replaced by four integers.

### The insight

The unfilled region is always a rectangle `[top..bottom] × [left..right]`. Each leg of the spiral fills one edge of that rectangle and moves the matching boundary inward. You never need to test a cell to see whether it is filled; the boundaries tell you. This is [Spiral Matrix](/practice/spiral-matrix) with writes instead of reads.

For a square, the rectangle shrinks symmetrically, so the degenerate cases are simpler than in the `m × n` read version: the last lap is either a single centre cell (odd `n`) or a 2 × 2 block (even `n`). A loop that stops once `n²` numbers are written handles both.

### The optimal approach

```python
def generate_matrix(n: int) -> list[list[int]]:
    grid = [[0] * n for _ in range(n)]        # not [[0] * n] * n: rows would alias
    top, bottom, left, right = 0, n - 1, 0, n - 1
    k = 1
    while k <= n * n:
        for c in range(left, right + 1):       # top row, left to right
            grid[top][c] = k; k += 1
        top += 1
        for r in range(top, bottom + 1):       # right column, downwards
            grid[r][right] = k; k += 1
        right -= 1
        for c in range(right, left - 1, -1):   # bottom row, right to left
            grid[bottom][c] = k; k += 1
        bottom -= 1
        for r in range(bottom, top - 1, -1):   # left column, upwards
            grid[r][left] = k; k += 1
        left += 1
    return grid
```

Why no guards are needed here, unlike the `m × n` read version: for a square, when the last lap is the centre cell of an odd `n`, the top-row leg writes it, `top` passes `bottom` and `right` passes `left`, so the remaining three ranges are empty. When the last lap is a 2 × 2 block, the top-row leg takes two cells, the right-column and bottom-row legs take one each, and the left-column leg is empty. Trace `n = 3`:

- Lap 1: top row `1, 2, 3`; right column `4, 5`; bottom row `6, 7`; left column `8`. Boundaries are now all `1`.
- Lap 2: top row writes `9` at `(1, 1)`. `top = 2 > bottom = 1` and `right = 0 < left = 1`, so the other three legs iterate over empty ranges. `k = 10 > 9`, and the loop ends.

Time `O(n²)`: each cell is written once. Space `O(1)` beyond the output.

### Common mistakes

- `[[0] * n] * n` in Python. It creates `n` references to the *same* row, so writing one cell writes a whole column. Build rows with a comprehension.
- Porting the square version to rectangles without adding the `top <= bottom` / `left <= right` guards; a single leftover row or column then gets written twice with the wrong numbers.
- Off-by-one on the ranges, for example starting the right-column leg at the old `top` and overwriting the corner the top-row leg just filled.

### How to discuss it

Present it as the write-side twin of spiral order and state the rectangle invariant. Mention why the square case needs no guards and the rectangular case does; that shows you understand the degenerate laps rather than having memorised the code. For the direct-lookup follow-up: the cell `(r, c)` is on ring `d = min(r, c, n - 1 - r, n - 1 - c)`. The rings outside it hold `n² - (n - 2d)²` numbers, and the position within ring `d` follows from which edge the cell is on, giving `O(1)` per lookup. Deriving that formula live is a good test of careful arithmetic, and it is the "math" in this problem: counting what comes before a position instead of simulating up to it.
