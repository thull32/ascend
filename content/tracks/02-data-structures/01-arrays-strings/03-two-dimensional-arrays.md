---
slug: two-dimensional-arrays
title: Two-dimensional arrays and grids
description: Row-major layout traced to the byte, why loop order changes speed 20× (measured), the aliasing bug in `[[0]*w]*h`, grids as implicit graphs, and in-place rotation and transposition traced swap by swap.
minutes: 45
difficulty: medium
tags: [arrays, matrix, grid, row-major, cache, in-place, strides]
problems: [rotate-image, spiral-matrix, set-matrix-zeroes, number-of-islands]
---
You have a 4,096 × 4,096 matrix of 32-bit integers and you sum it with two nested loops. Swap the order of the loops and the same code runs 20× slower on the machine this lesson was measured on. Nothing about the algorithm changed; the only difference is which of the two indices moves in the inner loop. Memory is one-dimensional, and a two-dimensional array is a convention for folding a rectangle into a line. Every performance and correctness property of grids follows from that fold.

## Row-major layout and index arithmetic

A `rows × cols` matrix stored in row-major order (C, Rust, NumPy by default, and conceptually every language's "list of lists") places row 0's elements first, then row 1's, and so on. Element `(r, c)` lives at flat index

$$\text{idx}(r, c) = r \times \text{cols} + c, \qquad \text{addr}(r, c) = \text{base} + \text{idx}(r, c) \times s$$

and the inverse is `r = idx // cols`, `c = idx % cols`. Column-major (Fortran, MATLAB, BLAS by default) swaps the roles: `idx = c × rows + r`.

```text
3 × 4 matrix, row-major:

(0,0) (0,1) (0,2) (0,3)      flat: [ a b c d | e f g h | i j k l ]
(1,0) (1,1) (1,2) (1,3)             row 0     row 1     row 2
(2,0) (2,1) (2,2) (2,3)
```

### Hand trace: addresses of a 3 × 4 matrix of `int32` at base `0x1000`

| cell | `r × cols + c` | byte offset (× 4) | address | note |
|---|---|---|---|---|
| (0, 0) | 0 | 0 | `0x1000` | first byte of the block |
| (0, 3) | 3 | 12 | `0x100C` | end of row 0 |
| (1, 0) | 4 | 16 | `0x1010` | 4 bytes after (0, 3): rows are adjacent |
| (1, 2) | 6 | 24 | `0x1018` | |
| (2, 3) | 11 | 44 | `0x102C` | last element; block is 48 bytes |

Going back: byte offset `0x18 = 24` is element `24 / 4 = 6`, so `r = 6 // 4 = 1`, `c = 6 % 4 = 2`. Two consequences of the fold:

1. **Walking along a row is sequential memory; walking down a column is a stride of `cols × s` bytes.** Stepping from (0, 0) to (1, 0) above skips 16 bytes; in a 4,096-column `int32` matrix it skips 16 KB, four pages of 4 KB, on every step.
2. **A 2D problem can be solved on a flat array.** Storing a grid as one `rows × cols` block with the index formula is one allocation, no pointer per row and no per-row bounds check, and it is how image buffers, game boards and NumPy arrays are stored.

## Hand trace: why loop order changes speed 20×

A 64-byte cache line holds 16 `int32` values. Row-wise, the first access to a row's line misses and the next 15 hit, and the hardware prefetcher runs ahead of a sequential stream: about one miss per 16 elements, often hidden. Column-wise, every access lands in a different line, and with a 16 KB stride, in a different page, so the TLB misses too; by the time the loop returns to the first column's neighbour, that line has been evicted unless the whole matrix fits in cache.

Measured with a 3-run minimum, `gcc -O1`, on a Ryzen 9 9950X3D (48 KB L1d and 1 MB L2 per core, 128 MB L3 in total):

| matrix | size | row inner loop | column inner loop | ratio |
|---|---|---|---|---|
| 256 × 256 `int32` | 256 KB (fits L2) | < 0.1 ms | < 0.1 ms | 2.6× |
| 1,024 × 1,024 | 4 MB (fits L3) | 0.2 ms | 2.3 ms | 12× |
| 4,096 × 4,096 | 64 MB | 3.0 ms | 61.8 ms | 20× |

The ratio grows with the matrix because a small matrix's column walk is served from L2 after the first pass, while a large one's is served from L3 or DRAM on every step. The number of additions is identical in both orders. Your ratio depends on cache sizes, line size and prefetcher behaviour; the order of magnitude, 10× or more once the matrix exceeds cache, does not. This is why numerical libraries obsess over loop order and why "transpose one operand so both walk rows" is a standard optimisation; [CPU caches and memory layout](/learn/systems/performance-engineering/cpu-caches-and-memory-layout) has the machinery.

## Representations in each language

**Python list of lists** is a list of pointers to separate row lists. `grid[r][c]` is two pointer dereferences and two bounds checks. A 1,000 × 1,000 grid of zeros costs 1,000 row lists of `56 + 8 × 1,000` bytes plus the outer list, about 8.1 MB, with the rows scattered wherever the allocator put them; a NumPy `int32` grid of the same shape is one 4 MB block and an `int8` grid 1 MB. It is fine for interview-sized inputs and it has one famous trap:

```python
grid = [[0] * 4] * 3      # WRONG: three references to the SAME row list
grid[0][0] = 1
print(grid)               # [[1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]]

grid = [[0] * 4 for _ in range(3)]   # correct: three distinct rows
```

`[x] * 3` copies the *reference* three times. For an immutable `0` that is harmless; for a list it aliases. The same bug exists in JavaScript with `new Array(3).fill(new Array(4).fill(0))` (one inner array shared by all rows); use `Array.from({length: 3}, () => new Array(4).fill(0))`. [Values, references and mutation](/learn/foundations/how-code-runs/values-references-and-mutation) covers the general rule.

**NumPy, typed arrays, Rust `Vec<T>` with manual indexing** are flat and contiguous. **Go `[][]int`** is a slice of slices, like Python; hot Go code allocates one `[]int` of `rows*cols` and indexes manually.

For interviews, list of lists is expected and readable. Mention the flat layout if the interviewer asks about performance; it signals you know what is under the abstraction.

## Under the hood: strides, tiles and pitches

**Strides.** A NumPy array is a pointer, a shape and a *strides* tuple: the byte step per axis. A C-order `(3, 4)` `int32` array has strides `(16, 4)`. `a.T` returns a view with shape `(4, 3)` and strides `(4, 16)`: no bytes move, the transpose is O(1), and a later row-wise loop over that view is secretly a column walk with all the cache cost above. `np.ascontiguousarray` pays the O(n) copy once to restore row-major layout. BLAS calls express the same idea as a "leading dimension" parameter.

**Pitches.** Image and video buffers are row-major with a *pitch* (bytes per row) that may exceed `cols × bytes per pixel` because rows are padded to a 16-, 32- or 64-byte boundary for SIMD and DMA alignment. A 1080p 8-bit 4:2:0 frame is 1920 × 1080 × 1.5 ≈ 3.1 MB; a 4K RGB frame is 3840 × 2160 × 3 ≈ 24.9 MB. Code that assumes `pitch == width × bpp` reads the wrong pixels on padded frames, a bug every video pipeline meets once.

**Tiles.** A naive transpose reads rows and writes columns, so one side is always strided. Production code transposes in tiles of, say, 32 × 32 doubles (8 KB, comfortably inside a 32–48 KB L1) so both reads and writes stay within a few cache lines. The same blocking is why matrix-multiplication libraries beat the textbook triple loop by 10–100×, and why a 2D DP table is walked in the order that keeps the previous row in cache; [Grid and two-dimensional DP](/learn/algorithms/dynamic-programming/grid-and-two-dimensional-dp) applies it.

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

The bounds check `0 <= nr < rows and 0 <= nc < cols` is where most grid bugs live. Two habits that eliminate them: check bounds at the *point of generation* (when you produce the neighbour, not when you consume it), and treat `grid[0]` as unsafe when `grid` may be empty (`cols = len(grid[0]) if grid else 0`).

### Grids as implicit graphs

A grid is a graph where every cell is a node and every in-bounds neighbour is an edge. You never build the adjacency list; the `neighbours` function *is* the adjacency list. Flood fill is DFS, shortest path through a maze is BFS, and "number of islands" is counting connected components. The visualiser runs BFS from the top-left over a grid where `1` is a wall:

```viz
{"type": "graph", "algorithm": "grid-bfs", "grid": [[0,0,0,1,0],[1,1,0,1,0],[0,0,0,0,0],[0,1,1,1,0],[0,0,0,1,0]], "title": "BFS on a grid: cells are nodes, 4-neighbours are edges"}
```

Because the graph is implicit, its size is `rows × cols` nodes and up to `4 × rows × cols` edges, so BFS/DFS on a grid is O(rows × cols). The visited set is a parallel boolean grid, or you mutate the input (set visited cells to a sentinel) when the problem permits. One trap is specific to grids: a recursive DFS on a 1,000 × 1,000 grid of open cells can recurse a million deep, which exceeds CPython's default recursion limit of 1,000 by three orders of magnitude and overflows Node's default stack at roughly 10⁴ frames. Use an explicit stack or BFS for anything larger than an interview example. [Breadth-first search](/learn/data-structures/graphs/breadth-first-search), [Depth-first search](/learn/data-structures/graphs/depth-first-search) and [Number of Islands](/practice/number-of-islands) build on this.

### Spiral, diagonal and boundary walks

Spiral order maintains four boundaries (`top`, `bottom`, `left`, `right`) and peels one layer per loop iteration: walk `top` row left→right, `right` column top→bottom, then, *only if a row or column remains*, `bottom` row right→left and `left` column bottom→top. The two `if` guards are the whole difficulty; without them a single-row or single-column remainder is traversed twice. [Spiral Matrix](/practice/spiral-matrix) is the practice problem and the second exercise below.

Diagonals: every cell on the same anti-diagonal shares `r + c`; every cell on the same main diagonal shares `r − c`. Group by that key and you have diagonal traversal and the N-queens attack check in one line. [Matrix traversal](/learn/interview-patterns/array-patterns/matrix-traversal) catalogues the rest.

## In-place rotation and transposition

Rotate a square matrix 90° clockwise. The output cell `(r, c)` takes the value of input cell `(n−1−c, r)`. With a second matrix that is one loop; the interview version asks for O(1) extra space. The trick is to decompose the rotation into two reflections that are each in place: **transpose** (swap `(r, c)` with `(c, r)` for `c > r`), then **reverse each row**.

### Hand trace on a 3 × 3

| step | action | matrix after |
|---|---|---|
| 0 | start | `[1 2 3] [4 5 6] [7 8 9]` |
| 1 | swap (0,1) ↔ (1,0): 2 ↔ 4 | `[1 4 3] [2 5 6] [7 8 9]` |
| 2 | swap (0,2) ↔ (2,0): 3 ↔ 7 | `[1 4 7] [2 5 6] [3 8 9]` |
| 3 | swap (1,2) ↔ (2,1): 6 ↔ 8 | `[1 4 7] [2 5 8] [3 6 9]` (transposed) |
| 4 | reverse row 0 | `[7 4 1] [2 5 8] [3 6 9]` |
| 5 | reverse row 1 | `[7 4 1] [8 5 2] [3 6 9]` |
| 6 | reverse row 2 | `[7 4 1] [8 5 2] [9 6 3]` |

Three swaps for the transpose (`n(n−1)/2` in general) and three swaps for the row reversals (`n × ⌊n/2⌋`). Check one cell against the formula: output `(0, 0)` should be input `(n−1−0, 0) = (2, 0) = 7`. It is. Check another: output `(2, 0)` should be input `(n−1−0, 2) = (2, 2) = 9`. It is.

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

The `c > r` bound is load-bearing: iterating all `(r, c)` swaps every pair twice and returns the original. Counter-clockwise is transpose then reverse each *column* (or reverse rows first, then transpose). 180° is reverse rows then reverse columns. All are O(n²) time with O(1) extra space.

**Transposition of a non-square matrix cannot be done with swaps in place.** A 2 × 3 becomes a 3 × 2; the flat layout changes, and element `k` must move to position `(k × rows) mod (rows × cols − 1)`, a permutation with cycles. Cycle-following algorithms exist and are rarely worth it; allocate the output.

## Worked example: set matrix zeroes in O(1) space

"If a cell is 0, set its whole row and column to 0." The naive answer stores the zero rows and columns in two sets: O(rows + cols) space. The O(1) version uses the first row and first column *as* the sets: for each zero at `(r, c)` with `r, c ≥ 1`, write 0 to `grid[r][0]` and `grid[0][c]`. Two booleans remember whether the first row and column themselves need clearing. Then walk the interior and zero cells whose row or column marker is 0; finally clear the first row and column if flagged.

The order matters: process the interior *before* clearing the first row and column, because they are your markers. Getting that order wrong is the entire difficulty of [Set Matrix Zeroes](/practice/set-matrix-zeroes), and it is representative of in-place grid problems: the trick is finding storage inside the input that you can borrow without destroying information you still need.

## When a dense 2D array is the wrong structure

A `rows × cols` array costs `rows × cols` cells whether or not they hold anything. That is right for images, game boards and DP tables, and wrong in three common situations.

**Sparse grids.** A 10⁶ × 10⁶ world with ten thousand occupied cells is 10¹² cells: 1 TB at one byte per cell, 8 TB as doubles. As a dictionary keyed by `(r, c)` it is ten thousand entries, under 2 MB in CPython. Conway's Life, tile maps and "infinite grid" interview problems all use the dictionary. Numerical code uses compressed sparse row (CSR) format instead: three flat arrays holding the non-zero values, their column indices and the offset where each row starts, so the same 10⁴-non-zero matrix is about 10⁴ × 12 bytes plus 10⁶ × 4 bytes of row offsets, roughly 4 MB, and contiguous for the matrix–vector product.

**Unbounded or negative coordinates.** Arrays start at zero. Coordinates that can go negative (robot walks, relative offsets) need a translation (add the minimum) or a dictionary. The translation is cheap if you know the bounds up front; the dictionary is safer when you do not.

**Bit-packed boards.** When each cell is a boolean and the width is at most 64, a row fits in one integer and an 8 × 8 chessboard in a single 64-bit word. Row operations become bit operations: "is any cell in this row set" is `row != 0`, "shift the board left" is `row << 1`, and N-queens column and diagonal conflicts are three integer masks updated with XOR. Chess engines, sudoku solvers and Life implementations use this layout because one instruction tests or updates up to 64 cells, where a list of lists needs a loop with a pointer dereference per cell. [Bit manipulation](/learn/foundations/math-for-engineers/bit-manipulation) covers the tricks.

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Every row of a grid changes when one cell is written | `[[0] * w] * h` or `fill(new Array(w))` aliased one row object | A comprehension or `Array.from` with a factory, one fresh row each |
| A matrix routine runs 10–20× slower than a colleague's identical-looking one | The inner loop walks a column: one cache line and often one page per element | Swap the loops, or transpose one operand once so both walk rows |
| `RecursionError` (Python) or `RangeError: Maximum call stack size exceeded` (Node) on a large open map | Recursive flood fill went as deep as the number of cells | Iterative DFS with an explicit stack, or BFS |
| `IndexError: list index out of range` on `grid[0]` in production only | The empty grid, or a ragged row, never appeared in tests | `cols = len(grid[0]) if grid else 0`; validate rectangularity at the boundary |
| Results depend on whether the function ran before; a second call returns wrong islands | The function marked visited cells by mutating the caller's grid | A separate visited array, or document and restore the mutation |
| Wrong pixels along the right edge of every frame | Pitch assumed equal to `width × bpp` on padded buffers | Index rows by pitch, columns by pixel size |

## Trade-offs: how to store a grid

| Representation | Bytes per cell (1,000 × 1,000 of small ints) | `grid[r][c]` | Cache behaviour | Sparse-friendly | Notes |
|---|---|---|---|---|---|
| Python list of lists | ~8 (plus 28 per non-cached int) | two dereferences, two bounds checks | rows scattered | no | the interview default |
| Flat Python list with index formula | ~8 | one dereference, one multiply-add | one block | no | avoids the aliasing trap by construction |
| NumPy / typed array / `Vec<T>` | 1–8 (the element size) | address arithmetic | one block, prefetchable | no | 10× less memory, vectorisable |
| Dict or set of `(r, c)` | ~100–150 per *occupied* cell (tuple, two ints, table slot) | hash lookup, ~50–100 ns | random | yes | unbounded and negative coordinates |
| CSR (values, column indices, row offsets) | ~12 per non-zero + 4 per row | binary search within a row | contiguous | yes | numerical kernels |
| Bitboard (one integer per row) | 1/8 | shift and mask | in registers | no | boolean cells, width ≤ 64 |

## Interviewer follow-ups

**"Your solution is O(rows × cols). Can it run faster on real hardware?"** Model answer: the asymptotic bound is tight, but the constant depends on access order; walking rows in the inner loop keeps one cache miss per 16 `int32`s, walking columns costs one per element, a 10–20× gap once the matrix exceeds cache. Common wrong answer: "no, every cell must be visited", which is true and misses the question.

**"Why does the transpose loop use `c > r`?"** Model answer: each unordered pair `{(r, c), (c, r)}` must be swapped exactly once; iterating the full square swaps every pair twice and restores the input, and iterating the diagonal swaps a cell with itself. Common wrong answer: "to skip the diagonal", which is half of it.

**"How would you rotate a 10,000 × 10,000 image in place?"** Model answer: the same transpose-then-reverse works, but the transpose must be tiled (32 × 32 blocks) so reads and writes both stay in cache, and for a non-square image the in-place version is a cycle-following permutation that is rarely worth it over allocating the output. Common wrong answer: apply the 3 × 3 code unchanged and expect it to be fast.

**"Number of islands on a 5,000 × 5,000 satellite tile: what breaks?"** Model answer: recursive DFS blows the stack on any large landmass, so use an explicit stack or BFS; the visited array is 25 MB as bytes, and mutating the input is only acceptable if the caller does not reuse it. Common wrong answer: raise the recursion limit.

## What mid-level engineers get wrong

- **Building grids with `[[0] * w] * h`.** Consequence: every write lands in every row; the bug appears only when a test writes to two different rows.
- **Writing `for c: for r:` because the problem said "columns".** Consequence: a 10–20× slowdown that no profiler attributes to a line, because every line is correct.
- **Recursing per cell.** Consequence: correct on the 4 × 5 example, crashes on the 1,000 × 1,000 hidden test.
- **Reading `len(grid[0])` before checking `grid`.** Consequence: an `IndexError` on the empty input the interviewer asks about last.
- **Treating `a.T` in NumPy as a copy.** Consequence: either a surprise mutation of the original, or a 10× slower loop over a strided view.

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

- You can compute the address of `(r, c)` by hand and explain why loop order changes speed by an order of magnitude in terms of cache lines, strides and pages, not "Python is slow".
- You know `[[0]*w]*h` aliases rows, why, and the comprehension that fixes it; and the JavaScript equivalent.
- You treat a grid as an implicit graph, reuse a `neighbours` helper with the bounds check at the point of generation, and you never recurse per cell on a large grid.
- You can derive the rotation formula `(r, c) ← (n−1−c, r)`, decompose it into transpose plus row reversal, and trace the swaps on a 3 × 3.
- You know that non-square in-place transposition is a permutation-cycle problem and that large transposes are done in cache-sized tiles.
- You know NumPy's transpose is a stride swap, not a copy, and what that does to a later loop.
- You can describe borrowing the first row and column as marker storage and why the processing order matters.

## Check yourself

```quiz
- q: >-
    Summing a large row-major matrix with the column index in the outer loop and the row index in the inner loop is much slower than the reverse. Why?
  options: ["The inner loop runs more iterations, so loop overhead dominates the total", "Each inner step jumps `cols` elements, so each access hits a new cache line", "Strided access mispredicts the loop branch on almost every iteration", "Column sums need extra additions to combine each column's partial result"]
  answer: 1
  explanation: >-
    The number of additions and iterations is identical either way. Row-major storage makes consecutive elements of a row adjacent, so row-wise scanning is sequential and prefetchable, one new cache line per 16 ints; column-wise scanning is strided, touching a new cache line (and often a new page) per element. Measured: 3 ms against 62 ms for a 64 MB matrix.
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
    A recursive flood fill passes on a 20 × 20 example and crashes on a 2,000 × 2,000 grid of open cells. What happened and what is the fix?
  options: ["The recursion went as deep as the number of cells; use an explicit stack or BFS", "The recursion revisited cells without a visited set; add one and it fits in the stack", "The grid exceeded the cache, so the recursion timed out; tile the grid into blocks", "The list of lists ran out of memory; switch to a flat array before recursing"]
  answer: 0
  explanation: >-
    On an open grid the DFS path can be as long as the number of cells, four million here, far past CPython's default limit of 1,000 frames and Node's stack of roughly 10⁴ frames. A visited set is needed for correctness but does not bound the depth, and a 4M-cell list of lists is only tens of megabytes. The iterative version keeps the same order with a heap-allocated stack.
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
