---
slug: two-dimensional-arrays
title: Two-dimensional arrays and grids
description: Row-major layout and why loop order changes speed 10×, the aliasing bug in `[[0]*w]*h`, grids as implicit graphs, and in-place rotation and transposition.
minutes: 40
difficulty: medium
tags: [arrays, matrix, grid, row-major, cache, in-place]
problems: [rotate-image, spiral-matrix, set-matrix-zeroes, number-of-islands]
---
You have a 10,000 × 10,000 matrix of floats and you sum it with two nested loops. Swap the order of the loops and the same code runs 10× slower. Nothing about the algorithm changed; the only difference is which of the two indices moves in the inner loop. Memory is one-dimensional, and a two-dimensional array is a convention for folding a rectangle into a line. Every performance and correctness property of grids follows from that fold.

## Row-major layout and index arithmetic

A `rows × cols` matrix stored in row-major order (C, Rust, NumPy by default, every language's "list of lists" conceptually) places row 0's elements first, then row 1's, and so on. Element `(r, c)` lives at flat index

$$\text{idx}(r, c) = r \times \text{cols} + c$$

and the inverse is `r = idx // cols`, `c = idx % cols`. Column-major (Fortran, MATLAB, some BLAS routines) swaps the roles: `idx = c × rows + r`.

```text
3 × 4 matrix, row-major:

(0,0) (0,1) (0,2) (0,3)      flat: [ a b c d | e f g h | i j k l ]
(1,0) (1,1) (1,2) (1,3)             row 0     row 1     row 2
(2,0) (2,1) (2,2) (2,3)
```

Two consequences of the fold:

1. **Walking along a row is sequential memory; walking down a column is a stride of `cols` elements.** Sequential access hits one new cache line every 16 ints and gets prefetched. Strided access with `cols = 10,000` touches a new cache line, and probably a new page, for every element. That is the 10× in the opening paragraph, and it is why numerical libraries obsess over loop order and why "transpose one operand so both walk rows" is a standard optimisation.
2. **A 2D problem can be solved on a flat array.** Storing a grid as a single `cols × rows` array with the index formula is faster (one allocation, no pointer per row, no bounds check per row) and is how image buffers, game boards and NumPy arrays actually work. NumPy's `strides` attribute exposes the byte step per axis; a transpose in NumPy is O(1) because it just swaps the strides.

## Representations in each language

**Python list of lists** is a list of pointers to separate row lists. `grid[r][c]` is two pointer dereferences and two bounds checks. It is fine for interview-sized inputs and it has one famous trap:

```python
grid = [[0] * 4] * 3      # WRONG: three references to the SAME row list
grid[0][0] = 1
print(grid)               # [[1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]]

grid = [[0] * 4 for _ in range(3)]   # correct: three distinct rows
```

`[x] * 3` copies the *reference* three times. For immutable `0` that is harmless; for a list it aliases. The same bug exists in JavaScript with `new Array(3).fill(new Array(4).fill(0))` (one inner array shared by all rows); use `Array.from({length: 3}, () => new Array(4).fill(0))`. [Values, references and mutation](/learn/foundations/how-code-runs/values-references-and-mutation) covers the general rule.

**NumPy / typed arrays / Rust `Vec<T>` with manual indexing** are flat and contiguous. `ndarray` in Rust and `Array2` types give you the index formula with bounds checks.

**Go `[][]int`** is a slice of slices, like Python. For hot code, Go programmers allocate one `[]int` of `rows*cols` and index manually.

For interviews, list of lists is expected and readable. Mention the flat layout if the interviewer asks about performance; it signals you know what is under the abstraction.

## Traversal patterns

Nearly every grid problem is one of a handful of traversals. Write the helpers once and reuse them.

### Neighbours and bounds

```python
DIRS4 = [(-1, 0), (1, 0), (0, -1), (0, 1)]                 # up, down, left, right
DIRS8 = DIRS4 + [(-1, -1), (-1, 1), (1, -1), (1, 1)]

def neighbours(grid, r, c, dirs=DIRS4):
    rows, cols = len(grid), len(grid[0])
    for dr, dc in dirs:
        nr, nc = r + dr, c + dc
        if 0 <= nr < rows and 0 <= nc < cols:
            yield nr, nc
```

The bounds check `0 <= nr < rows and 0 <= nc < cols` is where most grid bugs live. Two habits that eliminate them: check bounds at the *point of use* (when you generate the neighbour, not when you consume it), and treat `grid[0]` as unsafe when `grid` may be empty (`cols = len(grid[0]) if grid else 0`).

### Grids as implicit graphs

A grid is a graph where every cell is a node and every in-bounds neighbour is an edge. You never build the adjacency list; the `neighbours` function *is* the adjacency list. Flood fill is DFS, shortest path through a maze is BFS, and "number of islands" is counting connected components. The visualiser runs BFS from the top-left over a grid where `1` is a wall:

```viz
{"type": "graph", "algorithm": "grid-bfs", "grid": [[0,0,0,1,0],[1,1,0,1,0],[0,0,0,0,0],[0,1,1,1,0],[0,0,0,1,0]], "title": "BFS on a grid: cells are nodes, 4-neighbours are edges"}
```

Because the graph is implicit, its size is `rows × cols` nodes and up to `4 × rows × cols` edges, so BFS/DFS on a grid is O(rows × cols). The visited set is usually a parallel boolean grid, or you mutate the input (set visited cells to a sentinel) when the problem permits. [Breadth-first search](/learn/data-structures/graphs/breadth-first-search) and [Number of Islands](/practice/number-of-islands) build on this.

### Spiral, diagonal and boundary walks

Spiral order maintains four boundaries (`top`, `bottom`, `left`, `right`) and peels one layer per loop iteration: walk `top` row left→right, `right` column top→bottom, then, *only if a row/column remains*, `bottom` row right→left and `left` column bottom→top. The two `if` guards are the whole difficulty; without them a single-row or single-column remainder is traversed twice. [Spiral Matrix](/practice/spiral-matrix) is the practice problem and the second exercise below.

Diagonals: every cell on the same anti-diagonal shares `r + c`; every cell on the same main diagonal shares `r − c`. Group by that key and you have "diagonal traversal" and the N-queens attack check in one line.

## In-place rotation and transposition

Rotate a square matrix 90° clockwise. The output cell `(r, c)` takes the value of input cell `(n−1−c, r)`. With a second matrix that is one loop; the interview version asks for O(1) extra space.

The trick is to decompose the rotation into two reflections that are each trivially in place:

1. **Transpose** (reflect over the main diagonal): swap `(r, c)` with `(c, r)` for `c > r`.
2. **Reverse each row** (reflect left–right).

Worked on a 3 × 3:

```text
input          transpose      reverse rows
1 2 3          1 4 7          7 4 1
4 5 6    →     2 5 8    →     8 5 2
7 8 9          3 6 9          9 6 3
```

Check one cell against the formula: output `(0, 0)` should be input `(n−1−0, 0) = (2, 0) = 7`. It is.

```python
def rotate_clockwise(m):
    n = len(m)
    for r in range(n):
        for c in range(r + 1, n):          # c > r: touch each pair once
            m[r][c], m[c][r] = m[c][r], m[r][c]
    for row in m:
        row.reverse()
    return m
```

Counter-clockwise is transpose then reverse each *column* (or reverse rows first, then transpose). 180° is reverse rows then reverse columns. All are O(n²) time with O(1) extra space.

Two things worth knowing beyond the trick:

- **Transposition of a non-square matrix cannot be done in place with swaps.** A 2 × 3 becomes a 3 × 2; the flat layout changes. In-place algorithms exist (cycle-following on the flat index permutation) but are rarely worth it; allocate the output.
- **Cache-oblivious transposition** for large matrices is a real problem: the naive double loop reads rows and writes columns, so one side is strided. Production code transposes in blocks (say 32 × 32 tiles) so both reads and writes stay within a few cache lines. The same blocking idea is why matrix multiplication libraries beat the textbook triple loop by 10–100×.

## Worked example: set matrix zeroes in O(1) space

"If a cell is 0, set its whole row and column to 0." The naive answer stores the zero rows and columns in two sets: O(rows + cols) space. The O(1) version uses the first row and first column *as* the sets: for each zero at `(r, c)` with `r, c ≥ 1`, write 0 to `grid[r][0]` and `grid[0][c]`. Two booleans remember whether the first row and column themselves need clearing. Then walk the interior and zero cells whose row or column marker is 0; finally clear the first row/column if flagged.

The order matters: process the interior *before* clearing the first row and column, because they are your markers. Getting that order wrong is the entire difficulty of [Set Matrix Zeroes](/practice/set-matrix-zeroes), and it is representative of in-place grid problems: the trick is finding storage inside the input that you can borrow without destroying information you still need.

## When a dense 2D array is the wrong structure

A `rows × cols` array costs `rows × cols` cells whether or not they hold anything. That is right for images, game boards and DP tables, and wrong in three common situations.

**Sparse grids.** A 10⁶ × 10⁶ world with ten thousand occupied cells is a 1 TB array or a 10,000-entry dictionary keyed by `(r, c)`. The dictionary (a set of coordinates, or a map from coordinate to value) costs O(1) per lookup and only stores what exists. Conway's Life, tile maps in games and "infinite grid" interview problems all use this. Numerical code uses compressed sparse row (CSR) format instead: three flat arrays holding the non-zero values, their column indices and the offset where each row starts, which keeps the memory contiguous for the matrix–vector product.

**Unbounded or negative coordinates.** Arrays start at zero. Coordinates that can go negative (robot walks, relative offsets) either need a translation (add the minimum) or a dictionary. The translation is cheap if you know the bounds up front; the dictionary is safer when you do not.

**Bit-packed boards.** When each cell is a boolean and the width is at most 64, a row fits in one integer and the whole board in a small array of integers. Row operations become bit operations: "is any cell in this row set" is `row != 0`, "shift the board left" is `row << 1`, and N-queens column/diagonal conflicts are three integer masks updated with XOR. This is why competitive and engine code for chess, sudoku and Life runs 50× faster than the list-of-lists version. [Bit manipulation](/learn/foundations/math-for-engineers/bit-manipulation) covers the tricks.

The decision rule: if most cells are meaningful and coordinates are bounded, use a dense array (flat if performance matters). If most cells are empty or coordinates are open-ended, use a hash set or map of coordinates. If cells are booleans and rows are narrow, consider bit-packing.

## Exercises

```exercise
id: rotate-clockwise
title: Rotate a square matrix in place
prompt: |
  Rotate the `n × n` matrix 90° clockwise in place (transpose, then reverse
  each row) and return it. Use O(1) extra space: no second matrix. The
  matrix may be empty (`[]`).
languages: [python, javascript]
entry: rotate_clockwise
starter:
  python: |
    def rotate_clockwise(matrix):
        # your code here
        return matrix
  javascript: |
    function rotate_clockwise(matrix) {
      // your code here
      return matrix;
    }
tests:
  - args: [[[1, 2], [3, 4]]]
    expected: [[3, 1], [4, 2]]
  - args: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]]
    expected: [[7, 4, 1], [8, 5, 2], [9, 6, 3]]
  - args: [[[1]]]
    expected: [[1]]
    label: single cell
  - args: [[]]
    expected: []
    label: empty matrix
  - args: [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]]]
    expected: [[13, 9, 5, 1], [14, 10, 6, 2], [15, 11, 7, 3], [16, 12, 8, 4]]
    hidden: true
hints:
  - "Transpose by swapping `m[r][c]` and `m[c][r]` only for `c > r`, or you will swap every pair back."
  - "After the transpose, reversing each row completes the clockwise rotation."
```

```exercise
id: spiral-order
title: Spiral order traversal
prompt: |
  Return the elements of a `rows × cols` matrix in clockwise spiral order,
  starting at the top-left. The matrix may be empty and need not be square.
  Maintain four boundaries and guard the bottom row and left column so that
  a single remaining row or column is not visited twice.
languages: [python, javascript]
entry: spiral_order
starter:
  python: |
    def spiral_order(matrix):
        # your code here
        return []
  javascript: |
    function spiral_order(matrix) {
      // your code here
      return [];
    }
tests:
  - args: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]]
    expected: [1, 2, 3, 6, 9, 8, 7, 4, 5]
  - args: [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]]
    expected: [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]
    label: wider than tall
  - args: [[[1]]]
    expected: [1]
  - args: [[]]
    expected: []
    label: empty matrix
  - args: [[[1], [2], [3]]]
    expected: [1, 2, 3]
    label: single column
  - args: [[[1, 2], [3, 4], [5, 6]]]
    expected: [1, 2, 4, 6, 5, 3]
    hidden: true
    label: taller than wide
  - args: [[[1, 2, 3]]]
    expected: [1, 2, 3]
    hidden: true
    label: single row
hints:
  - "Loop while `top <= bottom and left <= right`; after walking the top row do `top += 1`, after the right column do `right -= 1`."
  - "Walk the bottom row only if `top <= bottom` still holds, and the left column only if `left <= right` still holds."
```

## Senior signals

- You explain why loop order changes speed by an order of magnitude in terms of cache lines and strides, not "Python is slow".
- You know `[[0]*w]*h` aliases rows, why, and the comprehension that fixes it; and the JavaScript equivalent.
- You treat a grid as an implicit graph and reuse a `neighbours` helper with the bounds check at the point of generation.
- You can derive the rotation formula `(r, c) ← (n−1−c, r)` and decompose it into transpose plus row reversal in place.
- You know that non-square in-place transposition is a different problem and that large transposes are done in cache-sized tiles.
- You can describe borrowing the first row and column as marker storage and why the processing order matters.

## Check yourself

```quiz
- q: >-
    Summing a large row-major matrix with the column index in the outer loop and the row index in the inner loop is much slower than the reverse. Why?
  options: ["The inner loop runs more iterations, so loop overhead dominates the total", "Each inner step jumps `cols` elements, so each access hits a new cache line", "Strided access mispredicts the loop branch on almost every iteration", "Column sums need extra additions to combine each column's partial result"]
  answer: 1
  explanation: >-
    The number of additions and iterations is identical either way. Row-major storage makes consecutive elements of a row adjacent, so row-wise scanning is sequential and prefetchable, one new cache line per 16 ints; column-wise scanning is strided, touching a new cache line (and often a new page) per element and defeating the cache.
- q: >-
    After `g = [[0] * 3] * 2; g[1][2] = 5`, what is `g`?
  options: ["An IndexError is raised", "[[0, 0, 5], [0, 0, 5]]", "[[0, 0, 0], [0, 0, 5]]", "[[5, 5, 5], [5, 5, 5]]"]
  answer: 1
  explanation: >-
    The outer multiplication copies the reference to one inner list twice, so both rows are the same object and a write through either is visible through both. The inner `[0] * 3` is fine because integers are immutable.
- q: >-
    Rotating an n × n matrix 90° clockwise in place is usually done as transpose then reverse each row. What is the complexity?
  options: ["O(n²) time, O(n²) extra space", "O(n²) time, O(1) extra space", "O(n log n) time, O(n) extra space", "O(n) time, O(1) extra space"]
  answer: 1
  explanation: >-
    Both passes touch every cell once, so O(n²) time (linear in the number of cells), and both reflections swap in place, so no extra matrix is needed. O(n²) extra space is the cost of the simpler version that writes into a second matrix.
- q: >-
    Which statement about a grid treated as a graph is correct?
  options: ["BFS on a grid needs a priority queue to find the shortest path", "You must build an explicit adjacency list before running BFS on it", "Traversal costs O((rows × cols)²), since any cell can reach any other", "A bounds-checked neighbours function serves as the adjacency list"]
  answer: 3
  explanation: >-
    The graph is implicit: nodes are cells and edges are in-bounds neighbours generated on demand. Each cell has at most 4 (or 8) edges, so BFS/DFS cost O(rows × cols), linear in the number of cells. A priority queue is only needed for weighted shortest paths.
- q: >-
    In the O(1)-space set-matrix-zeroes algorithm, what goes wrong if you clear the first row before processing the interior?
  options: ["It destroys the column markers stored in the first row", "Nothing, since the two saved flags already record every zero column", "It zeroes the first column twice, which double-counts its marker", "It forces O(rows + cols) extra space to hold the markers elsewhere"]
  answer: 0
  explanation: >-
    The first row is borrowed as the set of columns to clear. Overwriting it early destroys that information before it is consumed: if the first row was flagged and is zeroed first, every column marker reads 0 and every interior cell gets wiped. The two flags only record whether the first row and column themselves need clearing. Process the interior using the markers, then clear the first row and column.
```
