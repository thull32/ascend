---
slug: matrix-traversal
title: "Matrix traversal: index discipline, shrinking boundaries and in-place tricks"
description: Walk, rotate and rewrite two-dimensional arrays without off-by-one errors, using direction vectors, boundary shrinking, transpose-and-reverse, first-row flag storage and the grid-as-graph view.
minutes: 30
difficulty: medium
tags: [pattern:matrix, arrays, two-dimensional, in-place, grids]
problems: [rotate-image, spiral-matrix, set-matrix-zeroes, spiral-matrix-ii, search-2d-matrix]
---
Matrix problems are rarely hard in the algorithmic sense. Spiral order is a walk; rotation is a permutation; zeroing rows and columns is bookkeeping. Yet they have one of the highest failure rates in coding rounds, because the difficulty is entirely in the indices: which of `i` and `j` is the row, when the boundary is inclusive, whether the last pass of a spiral revisits a row you have already emitted, and whether an in-place update reads a cell you have already overwritten.

Every technique in this lesson is a way of making those index decisions once, up front, so that the loop body cannot get them wrong. If you decide the conventions before writing code and choose the right decomposition (layers, transposition, flags), the rest is mechanical.

## The signal

You are in matrix territory when the input is `m × n` (a list of lists, a grid, a 2D array) and the question is about its **geometry** rather than its values:

- **Order of visitation.** Spiral, diagonal, zigzag, boundary-first, layer by layer.
- **Rigid transformation.** Rotate by 90°, transpose, reflect, "in place" or "without allocating a second matrix".
- **Propagation along rows and columns.** Set a whole row and column to zero, mark every cell in the same line, count cells reachable in straight lines.
- **Search over sorted structure.** Rows sorted, each row starting after the previous ends; or rows and columns sorted independently.

What rules it out, or rather what redirects you to a different lesson:

- **Connectivity between neighbouring cells** (islands, flood fill, shortest path through open cells) is a graph problem where the grid is the adjacency structure. The traversal skeleton below is the first half; the second half is BFS or DFS from [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal).
- **Optimal paths with costs** (minimum path sum, unique paths) are grid DP; see [Grid and two-dimensional DP](/learn/algorithms/dynamic-programming/grid-and-two-dimensional-dp).
- **Searching a fully sorted matrix** is binary search on a flattened index, which is a matrix lesson only for the index arithmetic and a [binary search](/learn/interview-patterns/array-patterns/binary-search) lesson for everything else.

The memory layout behind all of this is covered in [Two-dimensional arrays](/learn/data-structures/arrays-strings/two-dimensional-arrays): row-major storage means `grid[i][j]` is at flat offset `i * cols + j`, iterating `j` in the inner loop touches consecutive memory, and iterating `i` in the inner loop jumps by a full row per step. In an interview this only matters when you are asked why column-wise loops are slower; in production it is the difference between a cache-friendly pass and one that is five times slower.

## The template

Three conventions, fixed before any loop is written:

1. `rows = len(grid)`, `cols = len(grid[0])`. The first index is the row, the second the column. Never use `x` and `y`, because half the room assumes `x` is the column.
2. A cell `(i, j)` is in bounds when `0 <= i < rows and 0 <= j < cols`. Write the check once as a helper.
3. Movement is expressed as direction vectors `(di, dj)`, listed in a fixed order: right, down, left, up. Turning clockwise is `d = (d + 1) % 4`.

```python
DIRS = [(0, 1), (1, 0), (0, -1), (-1, 0)]   # right, down, left, up

def in_bounds(grid, i, j):
    return 0 <= i < len(grid) and 0 <= j < len(grid[0])

def spiral(grid):
    """Boundary-shrinking spiral: four inclusive edges that move inward."""
    if not grid or not grid[0]:
        return []
    out = []
    top, bottom, left, right = 0, len(grid) - 1, 0, len(grid[0]) - 1
    while top <= bottom and left <= right:
        for j in range(left, right + 1):            # top row, left to right
            out.append(grid[top][j])
        top += 1
        for i in range(top, bottom + 1):            # right column, top to bottom
            out.append(grid[i][right])
        right -= 1
        if top <= bottom:                           # bottom row, right to left
            for j in range(right, left - 1, -1):
                out.append(grid[bottom][j])
            bottom -= 1
        if left <= right:                           # left column, bottom to top
            for i in range(bottom, top - 1, -1):
                out.append(grid[i][left])
            left += 1
    return out
```

```javascript
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // right, down, left, up

function inBounds(grid, i, j) {
  return i >= 0 && i < grid.length && j >= 0 && j < grid[0].length;
}

function spiral(grid) {
  if (grid.length === 0 || grid[0].length === 0) return [];
  const out = [];
  let top = 0, bottom = grid.length - 1, left = 0, right = grid[0].length - 1;
  while (top <= bottom && left <= right) {
    for (let j = left; j <= right; j++) out.push(grid[top][j]);
    top++;
    for (let i = top; i <= bottom; i++) out.push(grid[i][right]);
    right--;
    if (top <= bottom) {
      for (let j = right; j >= left; j--) out.push(grid[bottom][j]);
      bottom--;
    }
    if (left <= right) {
      for (let i = bottom; i >= top; i--) out.push(grid[i][left]);
      left++;
    }
  }
  return out;
}
```

The invariant of the spiral: **every cell strictly outside the rectangle `[top..bottom] × [left..right]` has been emitted exactly once, and no cell inside it has.** Each of the four passes emits one edge and shrinks the rectangle by one on that side. The two `if` guards exist because after the top and right passes the rectangle may have collapsed to zero height or zero width; without them, a single remaining row is emitted twice (once left-to-right, once right-to-left).

The direction-vector form is the alternative: keep `(i, j)` and a direction index, step, and turn when the next cell is out of bounds or already visited. It needs a `visited` matrix (or a sentinel written into the grid) and is easier to adapt to unusual shapes; the boundary form uses `O(1)` extra space and is easier to get exactly right. Know both; write the boundary form under time pressure.

## Worked problems

### Spiral Matrix

Return every element of an `m × n` matrix in clockwise spiral order, starting at the top-left. [Spiral Matrix](/practice/spiral-matrix).

Insight: the spiral is a sequence of shrinking rectangular rings; emit one ring per iteration and shrink the four boundaries.

Trace on the `3 × 4` matrix

```text
 1  2  3  4
 5  6  7  8
 9 10 11 12
```

| pass | (top, bottom, left, right) at start | edge walked | emitted | boundary moved |
|---|---|---|---|---|
| 1a | (0, 2, 0, 3) | row 0, cols 0..3 | 1, 2, 3, 4 | top → 1 |
| 1b | (1, 2, 0, 3) | col 3, rows 1..2 | 8, 12 | right → 2 |
| 1c | (1, 2, 0, 2) | row 2, cols 2..0 (guard: 1 ≤ 2) | 11, 10, 9 | bottom → 1 |
| 1d | (1, 1, 0, 2) | col 0, rows 1..1 (guard: 0 ≤ 2) | 5 | left → 1 |
| 2a | (1, 1, 1, 2) | row 1, cols 1..2 | 6, 7 | top → 2 |
| 2b | (2, 1, 1, 2) | col 2, rows 2..1: empty range | nothing | right → 1 |
| 2c | (2, 1, 1, 1) | guard `top <= bottom` fails (2 > 1) | skipped | |
| 2d | (2, 1, 1, 1) | guard `left <= right` holds; rows 1..2 descending: empty range | nothing | left → 2 |
| end | (2, 1, 2, 1) | `top > bottom`, loop exits | | |

Output `[1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]`. Pass 2c is the one that matters: without the guard, row 1 would be emitted a second time as `7, 6`.

`O(mn)` time (each cell once), `O(1)` extra space beyond the output. [Spiral Matrix II](/practice/spiral-matrix-ii) is the same walk in reverse: instead of reading `grid[top][j]`, write the next counter value into it.

### Rotate Image

Rotate an `n × n` matrix 90° clockwise, in place. [Rotate Image](/practice/rotate-image).

Insight: a clockwise rotation sends `(i, j)` to `(j, n-1-i)`. That map factors into two simple in-place operations: **transpose** (`(i, j) → (j, i)`), then **reverse each row** (`(j, i) → (j, n-1-i)`). Each is a loop you cannot get wrong, and neither needs a temporary matrix.

Trace on

```text
1 2 3
4 5 6
7 8 9
```

Transpose, swapping `grid[i][j]` with `grid[j][i]` only for `j > i` (swapping both halves would undo itself):

| swap | pair | matrix after |
|---|---|---|
| 1 | (0,1) ↔ (1,0): 2 ↔ 4 | `[[1,4,3],[2,5,6],[7,8,9]]` |
| 2 | (0,2) ↔ (2,0): 3 ↔ 7 | `[[1,4,7],[2,5,6],[3,8,9]]` |
| 3 | (1,2) ↔ (2,1): 6 ↔ 8 | `[[1,4,7],[2,5,8],[3,6,9]]` |

Reverse each row:

| row | before | after |
|---|---|---|
| 0 | `[1,4,7]` | `[7,4,1]` |
| 1 | `[2,5,8]` | `[8,5,2]` |
| 2 | `[3,6,9]` | `[9,6,3]` |

Result `[[7,4,1],[8,5,2],[9,6,3]]`. Check one cell: the original `1` at `(0,0)` should land at `(0, n-1) = (0, 2)`, and it does.

`O(n²)` time, `O(1)` space. The alternative is the four-way cycle: for each cell in the top-left quadrant, rotate the four cells `(i,j) → (j,n-1-i) → (n-1-i,n-1-j) → (n-1-j,i)` through a single temporary. It is one loop instead of two, and it is where most in-interview rotation bugs come from; only use it if you can derive the four positions from the rotation map on the spot.

### Set Matrix Zeroes

If any cell of an `m × n` matrix is 0, set its whole row and column to 0, in place. [Set Matrix Zeroes](/practice/set-matrix-zeroes).

The trap is doing it in one pass: zeroing a row as you find a zero writes new zeros that later cells mistake for originals, and the entire matrix becomes 0. So you need to *record* which rows and columns to zero before writing anything. Two boolean arrays cost `O(m + n)` space. The `O(1)` version stores those flags in the matrix's own first row and first column, which is legal because those cells only need to be zero or non-zero at the end anyway.

Insight: use `grid[i][0]` as the "zero row `i`" flag and `grid[0][j]` as the "zero column `j`" flag. The cell `(0,0)` is shared by both, so keep two separate booleans for "first row has a zero" and "first column has a zero".

Trace on

```text
1  2  3  4
5  0  7  8
9 10 11 12
```

| step | action | matrix after |
|---|---|---|
| 1 | scan first row for a 0: none, `first_row_zero = false`; scan first column: none, `first_col_zero = false` | unchanged |
| 2 | scan inner cells `i ≥ 1, j ≥ 1`; find 0 at (1,1); set flags `grid[1][0] = 0`, `grid[0][1] = 0` | `[[1,0,3,4],[0,0,7,8],[9,10,11,12]]` |
| 3 | apply flags to inner cells: row 1 has `grid[1][0] = 0`, so (1,1),(1,2),(1,3) → 0; column 1 has `grid[0][1] = 0`, so (2,1) → 0 | `[[1,0,3,4],[0,0,0,0],[9,0,11,12]]` |
| 4 | `first_row_zero` is false: leave row 0; `first_col_zero` is false: leave column 0 | final |

Result `[[1,0,3,4],[0,0,0,0],[9,0,11,12]]`. The flag cells `(1,0)` and `(0,1)` are themselves correctly zero in the answer, which is why the trick is self-consistent: a flag saying "zero this row" sits in that row.

Order matters in step 3 and 4: apply the inner cells first using the flags, *then* zero the first row and column if their booleans say so. Doing the first row first would destroy the column flags before they are read.

`O(mn)` time, `O(1)` space.

## Grids as graphs and as flat arrays

Two reframings turn matrix problems into other patterns.

**A grid is an implicit graph.** Each cell is a node and the direction vectors define its edges. You never build an adjacency list; `neighbours(i, j)` is `[(i+di, j+dj) for di, dj in DIRS if in_bounds(...)]`. Islands, flood fill, rotting oranges and shortest path through a maze are all BFS or DFS with this neighbour function, as in [Breadth-first search](/learn/data-structures/graphs/breadth-first-search). The matrix skill is the neighbour function and the in-bounds check; the rest is graph traversal.

```viz
{"type": "graph", "algorithm": "grid-bfs", "grid": [[0, 0, 0, 1], [1, 1, 0, 1], [0, 0, 0, 0], [0, 1, 1, 0]], "title": "BFS over a grid using direction vectors", "caption": "Each cell's neighbours are the four in-bounds cells reached by the direction vectors; blocked cells are skipped. No adjacency list is ever built."}
```

**A row-major sorted matrix is a sorted array.** If every row is sorted and each row's first element is greater than the previous row's last (the [Search a 2D Matrix](/practice/search-2d-matrix) condition), then flat index `k` maps to `(k // cols, k % cols)` and you can binary search over `k` in `0..rows*cols - 1`. On a `3 × 4` matrix, `k = 7` is `(1, 3)`, the last cell of the second row.

```viz
{"type": "array", "algorithm": "binary-search", "values": [1, 3, 5, 7, 10, 11, 16, 20, 23, 30, 34, 60], "target": 16, "title": "Search a 2D matrix as a flat array", "caption": "The 3 × 4 matrix [[1,3,5,7],[10,11,16,20],[23,30,34,60]] flattened. The mid index 6 maps to row 6 // 4 = 1, column 6 % 4 = 2, which holds 16."}
```

When rows and columns are each sorted but rows do not chain (each row starts smaller than the previous row ended), the flat view fails. Start at the top-right corner instead: if the cell is larger than the target move left, if smaller move down. That staircase walk is `O(m + n)` and is the second answer the interviewer is waiting for.

## Variations

**Anticlockwise rotation, or rotation by 180°.** Anticlockwise is transpose then reverse the *column order* (reverse each column, or equivalently reverse the row order after transposing). 180° is reverse every row and then reverse the row order. Derive the map, factor it into transpose and reversals, and the code writes itself.

**Non-square rotation.** `m × n` rotated is `n × m`, so it cannot be done in place; allocate the output and use the map `(i, j) → (j, m-1-i)`.

**Spiral starting elsewhere or going anticlockwise.** Change the direction order in `DIRS` and the starting cell; the boundary-shrinking form needs its four passes reordered. This is where the direction-vector form with a `visited` grid is more robust.

**Diagonal traversal.** Cells on the same anti-diagonal share `i + j`. Iterate `s` from `0` to `rows + cols - 2`, then `i` over the valid range with `j = s - i`; alternate the direction of `i` for a zigzag.

**Propagate along lines other than rows and columns.** Marking every cell that a queen attacks, or every cell in the same diagonal, is the same flag idea with a different key: `i - j` for one diagonal family, `i + j` for the other.

**Sparse or huge matrices.** If the matrix is `10⁵ × 10⁵` and mostly empty, it is not a list of lists; it is a hash map from `(i, j)` to value, or a list of `(i, j, value)` triples. State this when the constraints do not fit in memory.

## Pitfalls

**Swapping `i` and `j`.** `grid[j][i]` where you meant `grid[i][j]` is a silent bug on square matrices and an index error on rectangular ones. Test on a non-square matrix (`2 × 3`) as your first test case; symmetric inputs hide the bug.

**Transposing with a full double loop.** Swapping `grid[i][j]` and `grid[j][i]` for all `i, j` swaps every pair twice and returns the original. Restrict to `j > i`.

**Double-emitting the middle row or column of a spiral.** Covered above; the two `if` guards are not optional. Test on a single row, a single column and a `1 × 1` matrix.

**Writing before you have finished reading.** In-place rotation via the four-way cycle, or zeroing rows on the fly, both fail when an update overwrites a value that a later step needed. Either order the reads before the writes (the flag pass) or use a single temporary per cycle.

**Mutating the matrix that a `visited` check reads.** Writing a sentinel like `-1` into the grid to mark visited cells is a fine `O(1)`-space trick, until the grid legitimately contains `-1`. Choose a sentinel outside the value range or use a separate boolean grid.

**Building a `visited` grid as `[[False] * cols] * rows`.** In Python this creates `rows` references to the *same* inner list; setting one cell sets the whole column. Use a comprehension: `[[False] * cols for _ in range(rows)]`. JavaScript's `Array(rows).fill(Array(cols).fill(false))` has the identical bug.

**Off-by-one on the boundary variables.** Decide that all four boundaries are inclusive and keep it that way; the loop condition is `top <= bottom and left <= right`, and each pass shrinks by exactly one. Mixing inclusive and exclusive boundaries is the most common source of a missed last element.

## Exercise

```exercise
id: ring-sums
title: Sum each concentric ring of a matrix
prompt: |
  Given an `m × n` matrix of integers, return a list containing the sum of
  each concentric rectangular ring, outermost first. The outer ring is the
  border; the next ring is the border of what remains after removing the
  outer ring, and so on. A ring that has collapsed to a single row or
  column is still one ring (each cell counted once).

  Return `[]` for an empty matrix.
languages: [python, javascript]
entry: ring_sums
starter:
  python: |
    def ring_sums(matrix):
        # shrink four inclusive boundaries, one ring per iteration
        return []
  javascript: |
    function ring_sums(matrix) {
      // shrink four inclusive boundaries, one ring per iteration
      return [];
    }
tests:
  - args: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]]
    expected: [40, 5]
  - args: [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]]
    expected: [65, 13]
    label: rectangular, inner ring is a single row
  - args: [[[1]]]
    expected: [1]
    label: one cell
  - args: [[[1, 2], [3, 4]]]
    expected: [10]
  - args: [[[1, 2, 3]]]
    expected: [6]
    label: single row
  - args: [[[1], [2], [3]]]
    expected: [6]
    label: single column
  - args: [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]]]
    expected: [102, 34]
    hidden: true
hints:
  - "Keep top, bottom, left, right inclusive; each iteration sums the four edges of the current rectangle and shrinks every boundary by one."
  - "Guard the bottom row with top < bottom and the left column with left < right so a single remaining row or column is not counted twice."
  - "The sum of all rings must equal the sum of the matrix; use that to check your answer."
```

## Senior signals

- You fix the conventions (row first, inclusive boundaries, direction order) out loud before writing a loop, and you test on a non-square matrix first.
- You factor a rotation into transpose plus reversal and can derive the factoring from the coordinate map, rather than recalling it.
- You explain the two guards in the spiral by naming the exact input they protect (a single remaining row or column).
- You know that the first-row/first-column flag trick works because those cells end up zero or untouched anyway, and you apply the flags in the right order.
- You reframe grid connectivity as BFS/DFS with an implicit neighbour function, and a chained-sorted matrix as a flat sorted array, without building either structure.
- You mention row-major locality when asked about performance, and hash-map representations when the matrix would not fit in memory.

## Check yourself

```quiz
- q: >-
    In the boundary-shrinking spiral, what goes wrong if you remove the `if top <= bottom` guard before the bottom-row pass?
  options: ["The bottom row is skipped on matrices wider than they are tall", "A lone remaining row is emitted a second time, in reverse", "The right column is emitted twice when only one column is left", "The loop never terminates on matrices with an odd row count"]
  answer: 1
  explanation: >-
    After the top-row pass, top has moved past bottom when only one row remained. Without the guard the bottom-row pass runs on that same row from right to left, duplicating it. A leftover single column is protected by the other guard, left <= right. The guards are what make each cell appear exactly once.
- q: >-
    Which two in-place operations compose to a 90° clockwise rotation of an n × n matrix?
  options: ["Reverse each row, then reverse each column", "Reverse the row order, then reverse each row", "Transpose, then reverse each row", "Transpose, then reverse each column"]
  answer: 2
  explanation: >-
    Transpose maps (i, j) to (j, i); reversing each row then maps (j, i) to (j, n-1-i), which is the clockwise rotation map. Transpose then reverse each column gives the anticlockwise rotation.
- q: >-
    In Set Matrix Zeroes with first-row and first-column flags, why must the inner cells be updated before the first row and first column?
  options: ["Zeroing the first row first would erase the column flags", "To keep the overall time complexity at O(mn)", "It does not matter; either order gives the same final matrix", "Inner cells come first in row-major memory, so it is faster"]
  answer: 0
  explanation: >-
    The flags live in the first row and column. If you zero those lines first, every flag reads as zero and the whole matrix is cleared. Read all flags for the inner cells, then apply the two booleans to the first row and column last.
- q: >-
    A matrix has every row sorted and every column sorted, but row 2 starts with a value smaller than the end of row 1. Why does flattening plus binary search fail?
  options: ["The flat index formula only works for square matrices", "Binary search requires every value to be distinct", "Flattening would cost O(mn) extra space to build", "The flattened sequence is not sorted end to end"]
  answer: 3
  explanation: >-
    Binary search needs the flat sequence to be sorted end to end, which requires each row to start after the previous row ends; otherwise the binary search invariant does not hold. The index formula works for any m × n shape. With independently sorted rows and columns, use the staircase walk from the top-right corner in O(m + n).
- q: >-
    In Python, `visited = [[False] * cols] * rows` is used to track visited cells during a grid BFS. What is the consequence?
  options: ["It works correctly but uses more memory than needed", "It builds the grid transposed, as cols lists of rows", "Every row is one shared list, so marks hit every row", "It raises an IndexError on grids that are not square"]
  answer: 2
  explanation: >-
    The outer multiplication copies the reference to one inner list rows times. Setting visited[2][3] sets index 3 in the single shared list, which every row sees, so marking one cell marks that column everywhere. Use a comprehension to build independent rows.
```
