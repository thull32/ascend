---
lesson: matrix-traversal
source: ce562f2d71cddc4c
fit: partial
desk:
  - "The spiral template with its two guards, in Python and JavaScript"
  - "The traces: Spiral Matrix, Rotate Image, Set Matrix Zeroes, Number of Islands, the staircase search, diagonal order"
  - "The Game of Life spare-bit code and the blinker example"
  - "The signal, near-miss, variants and space tables"
  - "The loop-order and tiled-transpose measurements"
  - "Exercises: ring sums, and rotating a rectangular matrix"
---
## Introduction

Matrix problems are rarely hard in the algorithmic sense. A spiral is a walk. A rotation is a permutation. Zeroing rows and columns is bookkeeping. Yet they have one of the highest failure rates in coding rounds, because all the difficulty is in the indices: which of the two is the row, whether a boundary is inclusive, whether the last pass of a spiral revisits a row it already emitted, and whether an in-place update reads a cell it has already overwritten.

Every technique in this lesson is a way of making those decisions once, up front, so the loop body cannot get them wrong. Shrinking boundaries for the spiral. A rotation factored into two loops you cannot get wrong. Flags borrowed from inside the matrix. And the grid read as a graph.

The traversal order also has a cost. On a grid of about four thousand by four thousand, walking columns instead of rows was 9 times slower in Node, and only 1.6 times slower in CPython, with identical arithmetic. We will get to why.

## Recognising it

You are in matrix territory when the input is a grid and the question is about its geometry rather than its values. The order you visit cells in: spiral, diagonal, zigzag, layer by layer. A rigid transformation: rotate, transpose, reflect, usually "in place". Propagation along lines: zero a whole row and column. Search over sorted structure. Or connectivity between neighbouring cells: islands, flood fill, regions.

Some statements do not say matrix at all. "Rotate this image, game board or puzzle piece" is transpose then reverse. "Is every diagonal constant?" uses the fact that cells on one diagonal share the row minus the column. "Can two queens attack each other?" uses that difference and the sum as diagonal keys, just like rows and columns.

And the near misses. A minimum path sum moving right or down is grid dynamic programming, an optimum over paths, not a visiting order. The shortest path through open cells needs breadth-first search, a frontier rather than a sweep. And rotating a non-square matrix in place is not possible as a swap scheme, because the shape changes: allocate the output.

Before any loop, fix three conventions and say them out loud. Rows is the length of the grid, columns is the length of its first row, and the first index is always the row. Avoid x and y, because half the room assumes x is the column. Write the bounds check once. And movement is a fixed list of four direction vectors, right, down, left, up, so turning clockwise is stepping to the next one.

## The spiral and its guards

Keep four inclusive boundaries: top, bottom, left, right. Each ring is four passes. Walk the top row left to right, then move top down by one. Walk the right column top to bottom, then move right in by one. Walk the bottom row right to left, then move bottom up. Walk the left column bottom to top, then move left in. Repeat while top has not passed bottom and left has not passed right.

The invariant: every cell strictly outside the current rectangle has been emitted exactly once, and no cell inside it has. Each pass emits one edge and shrinks the rectangle on that side.

But the last two passes need guards. Picture a matrix of three rows and four columns. Before I say it: what goes wrong there without the guards?

[pause]

After the outer ring, a single row of two cells is left in the middle. The top pass emits both and moves top past bottom. Without a guard, the bottom-row pass would then walk back along that same row and emit a cell a second time. So the bottom-row pass runs only if top is still at or above bottom, and the left-column pass only if left is still at or before right. Test a single row, a single column and a single cell.

There is an alternative form: keep a position and a direction, step, and turn when the next cell is out of bounds or already visited. It adapts better to odd shapes, but it needs a visited grid. The boundary form uses constant space and is easier to get exactly right under time pressure.

## Rotation and borrowed storage

Rotate an n by n matrix 90 degrees clockwise, in place. Do not memorise it; derive it. Clockwise rotation sends the cell at row i, column j to row j, column n minus 1 minus i. That map factors into two steps. Transpose, which swaps row and column. Then reverse each row, which turns column i into n minus 1 minus i. Two loops, no temporary matrix.

Check one cell aloud: in a 3 by 3 matrix, the top-left 1 should land in the top-right corner. Transpose leaves it at the top-left; reversing the first row moves it to the top-right. Correct.

The trap in the transpose: swap only the upper triangle, where the column is greater than the row. A full double loop swaps every pair twice, and the matrix comes back unchanged. The other approach, rotating four cells at a time through one temporary, is one loop instead of two, and it is where most in-interview rotation bugs come from. Transpose then reverse each column gives the anticlockwise rotation; two reversals give 180 degrees.

Set Matrix Zeroes: if a cell is 0, zero its whole row and column. Zeroing as you scan creates new zeros that later cells mistake for originals, so record first, write second. The constant-space trick stores the records in the first row and first column, which is legal because those cells end up zero or untouched anyway. The shared corner cell is replaced by two booleans: does the first row contain a zero, and does the first column.

The order is the whole problem. Record the flags. Apply them to the interior. Borders last. Zero the first row before the interior has read its column flags, and every column flag reads as zero, and the whole matrix is cleared.

That idea, borrow storage the output does not need yet, is general. The Game of Life updates every cell from its neighbours at once, in place, by keeping the current state in one bit of each cell and writing the next state into a spare bit, then shifting everything in a final pass.

## Grids as graphs and as sorted arrays

A grid is an implicit graph. Each cell is a node, and the four direction vectors that pass the bounds check are its edges. No adjacency list is ever built. Number of Islands, flood fill and maze shortest paths are the same breadth-first search with different starting cells.

Two traps here. First, mark a cell as seen when you push it onto the queue, not when you pop it. On a thousand by thousand all-land grid, marking on push enqueued a million cells, with a peak queue of a thousand. Marking on pop enqueued almost two million, with a queue twice as long and 29 percent more time. And forget the skip check in that version, and cells are processed repeatedly.

Second, never recurse. A recursive flood fill goes as deep as the island is large, a million frames on that grid, and CPython's default recursion limit is a thousand. Use an explicit queue or stack.

And a Python trap that hides in the visited grid: building it by multiplying one list of falses by the row count. That repeats a reference to a single inner list, so marking one cell marks it in every row, and the search stops early. Build each row separately. JavaScript's nested fill has the identical bug.

A grid can also be a sorted array. If every row is sorted and each row starts after the previous one ends, the matrix flattened row by row is one sorted sequence: binary search over flat positions and convert each position to a row and column with a division and a remainder. If instead rows and columns are sorted independently, the flattened sequence is not sorted, and that binary search is wrong. Start at the top-right corner. Larger than the target, move left; smaller, move down. That corner is the largest in its row and the smallest in its column, so every comparison discards a whole row or column, and the walk takes at most rows plus columns steps.

## Loop order, measured

Grids are stored row by row, so neighbouring cells in a row sit next to each other in memory. A row walk is sequential. A column walk jumps a whole row per step, landing on a different cache line every time.

That jump adds a few nanoseconds per cell in every runtime. What differs is the baseline. Node compiles the row loop to a few instructions per cell, so those few nanoseconds become a 9 times slowdown. CPython spends about 11 nanoseconds interpreting each cell anyway, so the same penalty is only 1.6 times. The interpreter hides the memory system.

So say your loop order and why: row-major, so the inner loop walks the column index. For a transpose, where one side is always strided, mention tiling. In Node, a naive transpose of that grid took 131 milliseconds, and one done in 16 by 16 tiles took 30. Bigger tiles lost the benefit on that matrix, so tile size is something you measure, not something you recite.

## In the interview

Here is a follow-up the lesson expects. Rows of a large matrix arrive as a stream, and you must output Set Matrix Zeroes. Why can you not emit each row as it arrives?

[pause]

Because column zeroing reaches backwards. A zero found in row 900 changes row 3. You need the full set of zero columns before emitting anything: a second pass, a buffer, or an output described by its zero rows and zero columns. Row-wise work without that backward dependency, like row sums, streams fine. A rotation does not: its first output row is the input's first column, which needs every input row.

And one more: the matrix is a hundred thousand by a hundred thousand and mostly zeros. That is ten billion cells, ten gigabytes even at one byte each. Store only the non-zeros, keyed by row and column, and Set Matrix Zeroes becomes two sets: rows and columns containing a zero.

## Recap

Four things to remember. Fix the conventions before any loop: row first, inclusive boundaries, a fixed direction order, and a non-square matrix as your first test. The spiral needs two guards, which exist for a lone remaining row or column. Rotation is transpose over the upper triangle, then reverse each row, derived from where one cell must go. And in place means borrowing storage, the first row and column or a spare bit, which must be read before it is overwritten.

At your desk: the spiral template, the six traces, the Game of Life code, the loop-order measurements, and the exercises on ring sums and rotating a rectangle.
