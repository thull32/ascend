---
slug: matrix-traversal
title: "Matrix traversal: index discipline, shrinking boundaries and in-place tricks"
description: Walk, rotate and rewrite two-dimensional arrays without off-by-one errors, using direction vectors, boundary shrinking, transpose-and-reverse, first-row flag storage and the grid-as-graph view, with measured loop-order costs in Python and JavaScript.
minutes: 45
difficulty: medium
tags: [pattern:matrix, arrays, two-dimensional, in-place, grids]
problems: [rotate-image, spiral-matrix, set-matrix-zeroes, spiral-matrix-ii, search-2d-matrix, number-of-islands]
---
Matrix problems are rarely hard in the algorithmic sense. Spiral order is a walk; rotation is a permutation; zeroing rows and columns is bookkeeping. Yet they have one of the highest failure rates in coding rounds, because the difficulty is entirely in the indices: which of `i` and `j` is the row, whether a boundary is inclusive, whether the last pass of a spiral revisits a row already emitted, and whether an in-place update reads a cell it has already overwritten.

Every technique in this lesson is a way of making those index decisions once, up front, so the loop body cannot get them wrong: fixed conventions, shrinking inclusive boundaries, factoring a rotation into two loops you cannot get wrong, and borrowing storage inside the matrix for flags. The traversal order also has a cost that interviewers probe: on a 4,096 × 4,096 grid, walking columns instead of rows was 9× slower in Node 24 and 1.7× slower in CPython 3.14 on the machine this lesson was written on, with identical arithmetic. The measurements and the reason for the difference between runtimes are below.

## The signal

You are in matrix territory when the input is `m × n` (a list of lists, a grid, a 2D array) and the question is about its **geometry** rather than its values:

- **Order of visitation**: spiral, diagonal, zigzag, boundary-first, layer by layer.
- **Rigid transformation**: rotate by 90°, transpose, reflect, "in place" or "without allocating a second matrix".
- **Propagation along lines**: set a whole row and column to zero, mark every cell in the same row, column or diagonal.
- **Search over sorted structure**: rows that chain into one sorted sequence, or rows and columns sorted independently.
- **Connectivity between neighbouring cells**: islands, flood fill, regions; the grid is an implicit graph.

### Matrices the statement does not name

| Statement | The matrix technique |
|---|---|
| "Rotate this image, game board or puzzle piece" | Transpose, then reverse each row (clockwise) |
| "Is every top-left to bottom-right diagonal constant?" (Toeplitz) | Cells on one diagonal share `i − j`; compare each cell with `(i − 1, j − 1)` |
| "Update every cell from its neighbours, in place" (Game of Life) | Encode old and new state in the same cell, for example two bits, then shift in a second pass |
| "Can two queens attack each other?" | Diagonal keys `i − j` and `i + j`, as for rows and columns |
| "Each row and each column is sorted; find a value" | Staircase walk from the top-right corner, `O(m + n)` |
| "Print a string written in a zigzag across `k` rows" | Row index bounces between 0 and `k − 1`; a direction flag, no matrix needed |

### Near misses

| Statement | Needs instead | Why |
|---|---|---|
| "Minimum path sum from the top-left to the bottom-right, moving right or down" | [Grid DP](/learn/algorithms/dynamic-programming/grid-and-two-dimensional-dp) | An optimum over paths, not a traversal order |
| "Shortest path through open cells" | BFS ([graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal)) | Distances need a frontier, not a sweep |
| "Least-cost path where cells have weights" ([Swim in Rising Water](/practice/swim-in-rising-water)) | Dijkstra over the implicit graph | Non-uniform edge costs |
| "`k`-th smallest in a row- and column-sorted matrix" ([Kth Smallest in a Sorted Matrix](/practice/kth-smallest-sorted-matrix)) | Heap k-way merge, or binary search on the value | Neither the flat view nor the staircase gives ranks directly |
| "Largest rectangle containing only 1s" | Row-by-row histogram plus a monotonic stack | Each row reduces to [Largest Rectangle in Histogram](/practice/largest-rectangle-histogram) |
| "Rotate a non-square matrix in place" | Allocate the `n × m` output | The shape changes, so the flat layout changes |

## Four decisions before you type

| Problem | Conventions | Traversal | Extra space | The hazard |
|---|---|---|---|---|
| [Spiral Matrix](/practice/spiral-matrix) | four inclusive boundaries | four passes per ring, two guards | `O(1)` | a lone row or column emitted twice |
| [Spiral Matrix II](/practice/spiral-matrix-ii) | same | same walk, writing a counter | `O(1)` | same |
| [Rotate Image](/practice/rotate-image) | `n × n` only | transpose over `j > i`, then reverse rows | `O(1)` | a full-loop transpose swaps every pair twice |
| [Set Matrix Zeroes](/practice/set-matrix-zeroes) | first row and column hold flags | mark pass, apply pass, then the two borders | `O(1)` | writing zeros before the flags are read |
| [Search a 2D Matrix](/practice/search-2d-matrix) | flat index `k → (k // cols, k % cols)` | binary search over `0..rows·cols − 1` | `O(1)` | using the flat view when rows do not chain |
| [Number of Islands](/practice/number-of-islands) | `DIRS` plus one bounds check | BFS or iterative DFS from each unseen land cell | `O(rows × cols)` worst | marking on pop, or recursing 10⁶ deep |

Three conventions sit under every row of that table, fixed before any loop:

1. `rows = len(grid)`, `cols = len(grid[0])`. The first index is the row, the second the column. Avoid `x` and `y`, because half the room assumes `x` is the column.
2. A cell `(i, j)` is in bounds when `0 <= i < rows and 0 <= j < cols`. Write the check once.
3. Movement is a list of direction vectors `(di, dj)` in a fixed order: right, down, left, up. Turning clockwise is `d = (d + 1) % 4`.

## The template

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
        if top <= bottom:                           # a row is still left: bottom row, right to left
            for j in range(right, left - 1, -1):
                out.append(grid[bottom][j])
            bottom -= 1
        if left <= right:                           # a column is still left: left column, bottom to top
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

The invariant: **every cell strictly outside the rectangle `[top..bottom] × [left..right]` has been emitted exactly once, and no cell inside it has.** Each pass emits one edge and shrinks the rectangle by one on that side. The two `if` guards exist because after the top and right passes the rectangle may have collapsed to zero height or zero width; without them a single remaining row is emitted twice, once in each direction.

The direction-vector form is the alternative: keep `(i, j)` and a direction index, step, and turn when the next cell is out of bounds or already visited. It needs a `visited` grid (or a sentinel written into the matrix) and adapts better to unusual shapes; the boundary form uses `O(1)` extra space and is easier to get exactly right. Write the boundary form under time pressure.

## Worked problems

### Spiral Matrix

[Spiral Matrix](/practice/spiral-matrix). Trace on the `3 × 4` matrix `[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]`:

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

Output `[1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]`. Pass 2c is the one that matters: without its guard, row 1 would be emitted again as `7, 6`. [Spiral Matrix II](/practice/spiral-matrix-ii) is the same walk writing a counter into each cell instead of reading it.

### Rotate Image

[Rotate Image](/practice/rotate-image): rotate an `n × n` matrix 90° clockwise in place. A clockwise rotation sends `(i, j)` to `(j, n − 1 − i)`. That map factors into **transpose** (`(i, j) → (j, i)`) followed by **reverse each row** (`(j, i) → (j, n − 1 − i)`), two loops with no temporary matrix.

```python
def rotate(m):
    n = len(m)
    for i in range(n):
        for j in range(i + 1, n):                   # upper triangle only
            m[i][j], m[j][i] = m[j][i], m[i][j]     # safe: indices do not read m
    for row in m:
        row.reverse()
```

The tuple swap here is safe, unlike the one in [cyclic sort](/learn/interview-patterns/array-patterns/cyclic-sort), because neither target's index is computed from the matrix. Trace on `[[1, 2, 3], [4, 5, 6], [7, 8, 9]]`:

| step | operation | matrix after |
|---|---|---|
| 1 | swap (0,1) ↔ (1,0): 2 ↔ 4 | `[[1,4,3],[2,5,6],[7,8,9]]` |
| 2 | swap (0,2) ↔ (2,0): 3 ↔ 7 | `[[1,4,7],[2,5,6],[3,8,9]]` |
| 3 | swap (1,2) ↔ (2,1): 6 ↔ 8 | `[[1,4,7],[2,5,8],[3,6,9]]` |
| 4 | reverse each row | `[[7,4,1],[8,5,2],[9,6,3]]` |

Check one cell: the 1 at `(0, 0)` should land at `(0, n − 1) = (0, 2)`, and it does. The alternative, rotating four cells `(i,j) → (j,n−1−i) → (n−1−i,n−1−j) → (n−1−j,i)` through one temporary, is one loop instead of two and is where most in-interview rotation bugs come from.

### Set Matrix Zeroes

[Set Matrix Zeroes](/practice/set-matrix-zeroes): if a cell is 0, zero its whole row and column, in place. Zeroing as you scan creates new zeros that later cells mistake for originals, so record first, write second. The `O(1)` version stores the records in the first row and column, which is legal because those cells end up zero or untouched anyway; the shared corner `(0, 0)` is replaced by two booleans.

```python
def set_zeroes(m):
    rows, cols = len(m), len(m[0])
    first_row_zero = any(m[0][j] == 0 for j in range(cols))
    first_col_zero = any(m[i][0] == 0 for i in range(rows))
    for i in range(1, rows):                        # 1. record in the borders
        for j in range(1, cols):
            if m[i][j] == 0:
                m[i][0] = 0
                m[0][j] = 0
    for i in range(1, rows):                        # 2. apply to the interior
        for j in range(1, cols):
            if m[i][0] == 0 or m[0][j] == 0:
                m[i][j] = 0
    if first_row_zero:                              # 3. borders last: they held the flags
        for j in range(cols):
            m[0][j] = 0
    if first_col_zero:
        for i in range(rows):
            m[i][0] = 0
```

Trace on `[[1, 2, 3, 4], [5, 0, 7, 8], [9, 10, 11, 12]]`:

| step | action | matrix after |
|---|---|---|
| 0 | first row has no 0, first column has no 0: both booleans false | unchanged |
| 1 | interior scan finds 0 at (1,1): set flags `m[1][0] = 0`, `m[0][1] = 0` | `[[1,0,3,4],[0,0,7,8],[9,10,11,12]]` |
| 2 | row 1 flagged: (1,2), (1,3) → 0; column 1 flagged: (2,1) → 0 | `[[1,0,3,4],[0,0,0,0],[9,0,11,12]]` |
| 3 | both booleans false: borders stay | final |

The flag cells `(1, 0)` and `(0, 1)` are themselves correctly zero in the answer: a flag saying "zero this row" sits in that row. Swap steps 2 and 3 and a zeroed first row erases every column flag.

### Number of Islands

[Number of Islands](/practice/number-of-islands): count groups of `"1"` cells connected horizontally or vertically. The matrix skill is the neighbour loop and the bounds check; the rest is [breadth-first search](/learn/data-structures/graphs/breadth-first-search).

```python
from collections import deque

def num_islands(grid):
    if not grid or not grid[0]:
        return 0
    rows, cols = len(grid), len(grid[0])
    seen = [[False] * cols for _ in range(rows)]   # a comprehension: independent rows
    count = 0
    for i in range(rows):
        for j in range(cols):
            if grid[i][j] == "1" and not seen[i][j]:
                count += 1
                seen[i][j] = True
                queue = deque([(i, j)])
                while queue:
                    ci, cj = queue.popleft()
                    for di, dj in DIRS:
                        ni, nj = ci + di, cj + dj
                        if 0 <= ni < rows and 0 <= nj < cols and grid[ni][nj] == "1" and not seen[ni][nj]:
                            seen[ni][nj] = True    # mark on push, so no cell is queued twice
                            queue.append((ni, nj))
    return count
```

Trace on `[["1","1","0","0"], ["1","0","0","1"], ["0","0","1","1"]]`:

| event | cell | land neighbours pushed | queue after | `count` |
|---|---|---|---|---|
| scan finds unseen land | (0,0) | | [(0,0)] | 1 |
| pop | (0,0) | (0,1), (1,0) | [(0,1), (1,0)] | 1 |
| pop | (0,1) | none ((0,0) seen) | [(1,0)] | 1 |
| pop | (1,0) | none | [] | 1 |
| scan finds unseen land | (1,3) | | [(1,3)] | 2 |
| pop | (1,3) | (2,3) | [(2,3)] | 2 |
| pop | (2,3) | (2,2) | [(2,2)] | 2 |
| pop | (2,2) | none | [] | 2 |

Answer 2. Every cell is scanned once and enqueued at most once, so `O(rows × cols)`. Marking on push is what guarantees "at most once". The common alternative, marking when a cell is popped and skipping it if already marked, is also correct but lets a cell sit in the queue once per neighbour that saw it first. Measured on a 1,000 × 1,000 all-land grid from one corner (`mt_bfs.py`): 1,000,000 enqueues and a peak queue of 1,000 cells when marking on push, against 1,998,001 enqueues, a peak of 1,999 and 29% more time when marking on pop. Forget the skip check in the mark-on-pop version and cells are *processed* repeatedly, which is a correctness bug for anything that counts.

```viz
{"type": "graph", "algorithm": "grid-islands", "grid": [[1, 1, 0, 0], [1, 0, 0, 1], [0, 0, 1, 1]], "title": "Islands as components of an implicit graph", "caption": "The same 3 × 4 grid. Each land cell's edges are the in-bounds land cells reached by the four direction vectors; no adjacency list is built."}
```

## Grids as graphs and as flat arrays

**A grid is an implicit graph.** Each cell is a node and the direction vectors define its edges; `neighbours(i, j)` is the four `(i + di, j + dj)` that pass the bounds check. Flood fill, rotting oranges and maze shortest paths are the same BFS with a different start set.

```viz
{"type": "graph", "algorithm": "grid-bfs", "grid": [[0, 0, 0, 1], [1, 1, 0, 1], [0, 0, 0, 0], [0, 1, 1, 0]], "title": "BFS over a grid using direction vectors", "caption": "Each cell's neighbours are the four in-bounds cells reached by the direction vectors; blocked cells are skipped. No adjacency list is ever built."}
```

**A row-major chained matrix is a sorted array.** If every row is sorted and each row starts after the previous one ends ([Search a 2D Matrix](/practice/search-2d-matrix)), flat index `k` maps to `(k // cols, k % cols)` and you binary search over `k`. On a `3 × 4` matrix, `k = 7` is `(1, 3)`, the last cell of the second row.

```viz
{"type": "array", "algorithm": "binary-search", "values": [1, 3, 5, 7, 10, 11, 16, 20, 23, 30, 34, 60], "target": 16, "title": "Search a 2D matrix as a flat array", "caption": "The 3 × 4 matrix [[1,3,5,7],[10,11,16,20],[23,30,34,60]] flattened. The mid index 6 maps to row 6 // 4 = 1, column 6 % 4 = 2, which holds 16."}
```

When rows and columns are sorted independently but rows do not chain, the flat sequence is not sorted and the binary search is wrong. Start at the top-right corner instead: larger than the target, move left; smaller, move down. The top-right cell is the largest in its row and the smallest in its column, so each comparison discards a whole column or a whole row, and the staircase is `O(m + n)`. Trace for target 5 in `[[1, 4, 7, 11], [2, 5, 8, 12], [3, 6, 9, 16], [10, 13, 14, 17]]`:

| step | cell | value | compared with 5 | move | discarded |
|---|---|---|---|---|---|
| 1 | (0, 3) | 11 | larger | left | column 3 |
| 2 | (0, 2) | 7 | larger | left | column 2 |
| 3 | (0, 1) | 4 | smaller | down | row 0 |
| 4 | (1, 1) | 5 | equal | found | |

## Variants

| Variant | What changes | Cost |
|---|---|---|
| Anticlockwise rotation | Transpose, then reverse the row order (or reverse each column) | `O(n²)`, `O(1)` |
| 180° rotation | Reverse each row, then reverse the row order | `O(n²)`, `O(1)` |
| Non-square rotation | Allocate `n × m`; clockwise map `(i, j) → (j, m − 1 − i)` | `O(mn)` time and space |
| Anticlockwise or inner-start spiral | Reorder the four passes, or use direction vectors with a `visited` grid | `O(mn)` |
| Diagonal or zigzag order | Anti-diagonal `s = i + j` from 0 to `rows + cols − 2`; alternate the direction of `i` | `O(mn)` |
| Lines other than rows and columns | Flag keys `i − j` and `i + j` for the two diagonal families | `O(mn)` |
| In-place update from neighbours | Store old and new state in one cell (bit 0 old, bit 1 new), shift in a second pass | `O(mn)`, `O(1)` |
| Independently sorted rows and columns | Staircase from the top-right | `O(m + n)` |
| Sparse or huge matrix | Dictionary keyed by `(i, j)`, or compressed sparse row arrays | `O(nnz)` |

### Diagonal order, traced

Cells on one anti-diagonal share `s = i + j`, which runs from 0 to `rows + cols − 2`. For a given `s`, the valid rows are `max(0, s − cols + 1) ≤ i ≤ min(s, rows − 1)`; walking them upwards or downwards alternately gives the zigzag. Deriving that range, instead of stepping and bouncing off walls, is what removes the edge cases.

```python
def diagonal_order(m):
    if not m or not m[0]:
        return []
    rows, cols = len(m), len(m[0])
    out = []
    for s in range(rows + cols - 1):
        lo, hi = max(0, s - cols + 1), min(s, rows - 1)
        rng = range(hi, lo - 1, -1) if s % 2 == 0 else range(lo, hi + 1)
        for i in rng:                       # even s: up and to the right; odd s: down and to the left
            out.append(m[i][s - i])
    return out
```

On `[[1, 2, 3], [4, 5, 6], [7, 8, 9]]`:

| `s` | rows `lo..hi` | direction | cells | appended |
|---|---|---|---|---|
| 0 | 0..0 | up | (0,0) | 1 |
| 1 | 0..1 | down | (0,1), (1,0) | 2, 4 |
| 2 | 0..2 | up | (2,0), (1,1), (0,2) | 7, 5, 3 |
| 3 | 1..2 | down | (1,2), (2,1) | 6, 8 |
| 4 | 2..2 | up | (2,2) | 9 |

Output `[1, 2, 4, 7, 5, 3, 6, 8, 9]`.

### In place with spare bits: Game of Life

"Update every cell from its eight neighbours simultaneously, in place." Writing new states as you go corrupts the neighbour counts of cells not yet processed. Instead, keep the current state in bit 0 and write the next state into bit 1; counts read only bit 0, and a final pass shifts every cell right by one.

```python
def game_of_life(board):
    rows, cols = len(board), len(board[0])
    for i in range(rows):
        for j in range(cols):
            live = 0
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    if (di or dj) and 0 <= i + di < rows and 0 <= j + dj < cols:
                        live += board[i + di][j + dj] & 1   # bit 0: the current state only
            if live == 3 or (live == 2 and board[i][j] & 1):
                board[i][j] |= 2                            # bit 1: the next state
    for i in range(rows):
        for j in range(cols):
            board[i][j] >>= 1
```

On the vertical blinker `[[0, 1, 0], [0, 1, 0], [0, 1, 0]]` the live-neighbour counts are `[[2, 1, 2], [3, 2, 3], [2, 1, 2]]`. The two side cells of the middle row have three live neighbours and are born; the centre has two and survives; the top and bottom cells have one and die. After the shift the board is `[[0, 0, 0], [1, 1, 1], [0, 0, 0]]`, the horizontal blinker. The same borrow-a-bit idea is how Set Matrix Zeroes borrows its first row: find storage the output does not need yet.

## Complexity, derived

Every technique here touches each cell a constant number of times: the spiral emits each once (the invariant), rotation swaps each off-diagonal pair once and reverses each row once, set-zeroes makes three passes, island counting scans each cell once and enqueues each land cell at most once. So `O(mn)` time, which is also the lower bound, since every cell must be read. Space is what separates the methods:

| Approach | Extra space | Passes over memory | Bug risk under pressure | Works on non-square |
|---|---|---|---|---|
| Rotate into a new matrix | `O(n²)` | 1 read, 1 write | low | yes |
| Transpose + reverse rows | `O(1)` | 2 | low | no |
| Four-way cycle | `O(1)` | 1 | high (four index maps) | no |
| Set zeroes with two boolean arrays | `O(m + n)` | 2 | low | yes |
| Set zeroes with border flags | `O(1)` | 3 | medium (ordering) | yes |
| Spiral with boundaries | `O(1)` | 1 | medium (two guards) | yes |
| Spiral with direction vectors + `visited` | `O(mn)` | 1 | low | yes |

## Under the hood

### Loop order, measured in two runtimes

Row-major storage puts `grid[i][j]` and `grid[i][j + 1]` next to each other, so a row walk is sequential and a column walk jumps a full row per step; the byte-level trace and a C measurement (20× on a 64 MB matrix) are in [two-dimensional arrays](/learn/data-structures/arrays-strings/two-dimensional-arrays). Here is what the same choice costs in the two interview languages, summing a 4,096 × 4,096 grid, best of several runs on an AMD Ryzen 9 9950X3D (1 MB L2 per core, 96 MB L3), CPython 3.14 and Node 24 (`mt_bench.py`, `mt_bench.mjs`):

| Representation | Row order | Column order | Ratio |
|---|---|---|---|
| Python list of lists, `r = grid[i]` hoisted | 11.0 ns/cell | — | — |
| Python list of lists, `grid[i][j]` | 12.7 ns/cell | 20.3 ns/cell | 1.6× |
| Python flat list, `a[i * N + j]` | 14.4 ns/cell | 22.2 ns/cell | 1.5× |
| Python `sum(map(sum, grid))` / `sum(map(sum, zip(*grid)))` | 2.0 ns/cell | 5.9 ns/cell | 2.9× |
| Node flat `Float64Array` (128 MB) | 0.36 ns/cell | 3.3 ns/cell | 9× |
| Node flat `Int32Array` (64 MB) | 0.37 ns/cell | 3.0 ns/cell | 8× |
| Node nested `Array`s of doubles | 0.48 ns/cell | 4.5 ns/cell | 9× |

The column walk adds a few nanoseconds per cell in every runtime: each access lands on a different 64-byte cache line, and after 4,096 rows the line holding the next column's neighbour has usually been evicted from L1 and L2. The CPU's out-of-order core keeps several of those misses in flight at once, which is why the penalty is a few nanoseconds rather than a full memory latency. The hardware prefetcher helps the row walk most, because it recognises a sequential stream and fetches ahead. What differs between runtimes is the baseline. V8 compiles the row loop to a few instructions per cell, so a 3 ns penalty is a 9× slowdown. CPython spends about 11 ns interpreting each cell, so the same order of penalty is only 1.6×: the interpreter hides the memory system.

The nested JavaScript version is close to the flat one row-wise because each row is its own contiguous backing store of unboxed doubles; column-wise it is the slowest, because every step also loads a different row object's pointer before it can load the value. A flat buffer indexed by `i * cols + j` needs one multiply-add per access and no second load.

Two CPython details show up in the table. Hoisting `r = grid[i]` out of the inner loop saves one dependent load per cell (14%). And the values here are small integers, which CPython pre-allocates; with floats or large integers every cell is a pointer to a separate 24- or 28-byte object, so even the row walk chases pointers across the heap. For numeric grids at scale, a flat typed buffer (a NumPy array, a JavaScript typed array) stores the values themselves contiguously.

### What this means in the interview

Say the loop order you chose and why: "row-major, so the inner loop walks `j`". For transposition, where one side is always strided, mention tiling. Measured on the same 4,096 × 4,096 `Float64Array` in Node 24 (`mt_transpose.mjs`): a sequential copy took 6.8 ms, a naive transpose 131 ms, and a transpose in 16 × 16 tiles 30 ms, because each tile's rows and columns stay within a few hundred cache lines while it is processed. Larger tiles lost the benefit on this matrix (32 × 32: 67 ms; 64 × 64: 132 ms); a likely cause is that rows exactly 32 KB apart map onto the same few cache sets, so a tall tile evicts itself. Tile size is something you measure, not something you recite. For rotation of a large image, prefer the transpose-and-reverse form whose reversal pass is sequential. None of this changes the complexity; it changes the constant by up to an order of magnitude, and knowing which runtime shows it is the senior detail.

## Failure modes

**An image-rotation endpoint is several times slower than its benchmark.** *Symptom:* p99 latency grows with image size far faster than expected; a profile shows the whole time in one double loop. *Diagnosis:* the inner loop walks columns of a large row-major buffer (9× measured above in Node). *Fix:* reorder the loops so the inner index is the column, or transpose in cache-sized tiles.

**A flood fill crashes on large inputs.** *Symptom:* `RecursionError` on a 1,000 × 1,000 all-land image, or a stack overflow in JavaScript; small tests pass. *Diagnosis:* recursive DFS goes as deep as the island is large, 10⁶ frames, and CPython's default recursion limit is 1,000. *Fix:* iterative BFS or an explicit stack, as in the Number of Islands template.

**Correct on square matrices, wrong or crashing on rectangular ones.** *Symptom:* every 3 × 3 test passes; a 2 × 3 input raises `IndexError` or returns a transposed answer. *Diagnosis:* `grid[j][i]` where `grid[i][j]` was meant, or `range(rows)` used for columns. *Fix:* make a non-square matrix the first test case.

**Marking one cell marks a whole column.** *Symptom:* BFS visits far fewer cells than it should. *Diagnosis:* `visited = [[False] * cols] * rows` repeats one inner list `rows` times; JavaScript's `Array(rows).fill(Array(cols).fill(false))` has the identical bug. *Fix:* build each row separately with a comprehension or `Array.from`.

**The whole matrix becomes zero.** *Symptom:* Set Matrix Zeroes returns all zeros for any input with one zero. *Diagnosis:* rows were zeroed during the scan, or the first row was cleared before the column flags were read. *Fix:* record, apply to the interior, borders last.

**A sentinel collides with real data.** *Symptom:* cells holding −1 are silently skipped. *Diagnosis:* −1 was written into the grid to mean "visited". *Fix:* a sentinel outside the declared value range, or a separate `seen` grid.

## Interviewer follow-ups

**"The matrix is 10⁵ × 10⁵ and mostly zeros."** Model answer: 10¹⁰ cells is 10 GB even at one byte each, so store only the non-zeros, as a dictionary keyed by `(i, j)` or as compressed sparse row arrays. Set Matrix Zeroes becomes two sets, rows and columns containing a zero, and the output is described by those sets rather than materialised. Common wrong answer: allocating the dense matrix and then optimising the loop.

**"Rows arrive as a stream, one at a time."** Model answer: say which problems survive. Row sums and row-wise transforms stream in `O(cols)` memory. Set Matrix Zeroes cannot emit a row until the stream ends, because a zero in a later row zeroes that column in every earlier row; it needs the set of zero columns and a second pass, or a buffer. A 90° rotation's first output row is the input's first column, which needs every input row: buffer everything, `O(mn)`. Common wrong answer: claiming a one-pass streaming rotation.

**"Rotate a non-square matrix."** Model answer: an `m × n` matrix becomes `n × m`, so the flat layout changes and there is no in-place swap scheme; allocate the output and map `(i, j) → (j, m − 1 − i)`. In-place is possible only as a cycle-following permutation of the flat buffer, rarely worth its complexity. Common wrong answer: running transpose-and-reverse on it, which indexes out of range.

**"The grid is too large for memory, and rows arrive one at a time. Count the islands."** Model answer: the pattern changes from BFS to [union-find](/learn/interview-patterns/tree-and-graph-patterns/union-find-pattern) over two rows. Label the land cells of each new row, union each with its left neighbour and with the land cell above it in the previous row, and count a component as finished when none of its cells appears in the new row. Memory is `O(cols)` plus the live components, not `O(rows × cols)`. Common wrong answer: BFS on each row separately, which splits every island that spans rows.

**"Do it in place."** Model answer: name what "in place" borrows. Rotation borrows nothing (swaps are self-contained); Set Matrix Zeroes borrows the first row and column plus two booleans; Game of Life borrows spare bits in each cell. Each borrow must be read before it is overwritten, which is where the ordering rules come from. Common wrong answer: a hidden `copy.deepcopy`, which is `O(mn)` space.

## What mid-level engineers get wrong

- **Testing only square matrices.** Consequence: swapped `i` and `j` survive every test and crash on the first rectangular input.
- **Transposing with the full double loop.** Consequence: every pair is swapped twice and the matrix comes back unchanged.
- **Dropping the spiral guards.** Consequence: a single middle row or column is emitted twice; test `1 × n`, `n × 1` and `1 × 1`.
- **Writing before reading in place.** Consequence: zeroes that cascade across the whole matrix, or rotated values overwritten before they move.
- **Recursive flood fill on large grids.** Consequence: a crash at 1,000 frames in CPython on inputs that are routine in production.
- **Aliased rows in a `visited` grid.** Consequence: marks that appear in every row at once, and a BFS that stops early.

## Exercises

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

```exercise
id: rotate-rectangular
title: Rotate a rectangular matrix clockwise
prompt: |
  Given an `m × n` matrix (not necessarily square), return a new `n × m`
  matrix that is the input rotated 90° clockwise. Return `[]` for an empty
  matrix.

  A square matrix could be rotated in place; a rectangular one cannot,
  because its shape changes. Derive where cell `(i, j)` goes before you
  write the loop, and check it against one corner.
languages: [python, javascript]
entry: rotate_clockwise
starter:
  python: |
    def rotate_clockwise(matrix):
        # your code here
        return []
  javascript: |
    function rotate_clockwise(matrix) {
      // your code here
      return [];
    }
tests:
  - args: [[[1, 2, 3], [4, 5, 6]]]
    expected: [[4, 1], [5, 2], [6, 3]]
  - args: [[[1, 2, 3]]]
    expected: [[1], [2], [3]]
    label: single row becomes a column
  - args: [[[1], [2], [3]]]
    expected: [[3, 2, 1]]
    label: single column becomes a row
  - args: [[]]
    expected: []
    label: empty matrix
  - args: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]]
    expected: [[7, 4, 1], [8, 5, 2], [9, 6, 3]]
    label: square still works
  - args: [[[1, 2, 3, 4], [5, 6, 7, 8]]]
    expected: [[5, 1], [6, 2], [7, 3], [8, 4]]
    hidden: true
  - args: [[[7]]]
    expected: [[7]]
    hidden: true
hints:
  - "The output has n rows and m columns. Cell (i, j) of the input goes to row j, column m - 1 - i of the output."
  - "Check the top-left corner: (0, 0) must end up in the top-right corner of the output, (0, m - 1)."
  - "Build each output row as a fresh list; do not multiply one list reference."
```

## Senior signals

- You fix the **conventions** (row first, inclusive boundaries, direction order) out loud before writing a loop, and your first test is a non-square matrix.
- You **derive** transpose-and-reverse from the coordinate map `(i, j) → (j, n − 1 − i)` rather than recalling it, and you know why it cannot apply to a rectangle.
- You explain the spiral's two guards by naming the input they protect: a single remaining row or column.
- You say what **in place** borrows (border flags, spare bits) and read every borrowed cell before overwriting it.
- You treat a grid as an **implicit graph** with one neighbour loop, mark cells on push, and never recurse a million frames deep.
- You know **loop order** costs a few nanoseconds per cell, that it is 9× in compiled code and under 2× in CPython on the same data, and why.
- You switch to **sparse** representations when `rows × cols` would not fit, and you can say which problems survive a **stream** of rows.

## Check yourself

```quiz
- q: >-
    In the boundary-shrinking spiral, what goes wrong if you remove the top <= bottom guard before the bottom-row pass?
  options: ["The bottom row is skipped on matrices wider than they are tall", "The right column is emitted twice when only one column remains", "The loop never terminates on matrices with an odd number of rows", "A lone remaining row is emitted a second time, in reverse order"]
  answer: 3
  explanation: >-
    After the top-row pass, top has moved past bottom when only one row remained. Without the guard the bottom-row pass runs on that same row from right to left, duplicating it. A leftover single column is protected by the other guard, left <= right.
- q: >-
    Which two in-place operations compose to a 90-degree clockwise rotation of an n × n matrix?
  options: ["Reverse the row order, then reverse each row", "Reverse each row, then reverse each column", "Transpose, then reverse the entries of each row", "Transpose, then reverse the entries of each column"]
  answer: 2
  explanation: >-
    Transpose maps (i, j) to (j, i); reversing each row then maps (j, i) to (j, n-1-i), which is the clockwise rotation map. Transpose followed by reversing each column gives the anticlockwise rotation, and the two double reversals give a 180-degree rotation.
- q: >-
    In Set Matrix Zeroes with first-row and first-column flags, why must the interior be updated before the first row and column?
  options: ["It does not matter; either order gives the same final matrix", "It keeps the overall time complexity at O(mn) instead of more", "Zeroing the first row first would erase the column flags in it", "Interior cells come first in row-major memory, which is faster"]
  answer: 2
  explanation: >-
    The flags live in the first row and column. Zero those lines first and every column flag reads as zero, so the whole matrix is cleared. Read the flags into the interior, then apply the two booleans to the borders last. Memory order and complexity are unaffected either way.
- q: >-
    In Python, visited = [[False] * cols] * rows is used during a grid BFS. What is the consequence?
  options: ["It works correctly but uses more memory than a comprehension", "It raises an IndexError on any grid that is not square", "It builds the grid transposed, as cols lists of rows entries", "Every row is one shared list, so a mark shows in every row"]
  answer: 3
  explanation: >-
    The outer multiplication repeats a reference to one inner list. Setting visited[2][3] sets index 3 of that single list, which every row sees, so the BFS believes cells are visited that never were. Build independent rows with a comprehension; JavaScript's nested fill has the same bug.
- q: >-
    Summing a 4096 × 4096 grid column by column was 9 times slower than row by row in Node, but only 1.6 times slower in CPython. Why the difference?
  options: ["Both pay a few ns per column step; CPython adds ~11 ns per cell", "CPython caches the whole grid in L1, which hides the column stride", "CPython stores lists column-major, so both orders are strided", "V8 cannot prefetch typed arrays, so it pays a full miss on every cell"]
  answer: 0
  explanation: >-
    The cache penalty of a strided walk is similar in absolute terms, a few nanoseconds per cell, because each access lands on a new cache line. V8 compiles the row loop to a few instructions per cell, so the penalty dominates; CPython's interpreter overhead of about 11 ns per cell dilutes it. CPython lists are row-major arrays of pointers, and a 128 MB grid does not fit in any cache level.
- q: >-
    Rows of a large matrix arrive as a stream and you must output Set Matrix Zeroes. Why can you not emit each row as soon as it arrives?
  options: ["The first row holds the flags, so it must be emitted last of all", "Rows must be sorted before any flag can be written into them", "A zero in a later row must zero that column in earlier rows too", "Streams cannot be traversed in row-major order without a copy"]
  answer: 2
  explanation: >-
    Column zeroing reaches backwards: a zero found in row 900 changes row 3. You need either the full set of zero columns before emitting (a second pass or a buffer) or a representation that describes the output by its zero rows and columns. Row-wise transforms without that backward dependency, such as row sums, stream fine.
```
