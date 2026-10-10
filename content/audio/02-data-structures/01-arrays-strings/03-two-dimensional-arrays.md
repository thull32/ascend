---
lesson: two-dimensional-arrays
source: 62353ff8e5a8f26e
fit: partial
desk:
  - "The address trace of a 3 by 4 matrix, byte by byte"
  - "The loop-order measurements, and strides, pitches and tiles"
  - "The neighbours helper, the grid BFS visualiser and the spiral guards"
  - "The 3 by 3 rotation trace and its code"
  - "The set-matrix-zeroes walkthrough, and the grid storage trade-off table"
  - "Exercises: rotate a square matrix in place, and spiral order traversal"
---
## Introduction

You have a matrix of 4,096 by 4,096 integers, and you sum it with two nested loops. Swap the order of the loops, and the same code runs 20 times slower. Nothing about the algorithm changed. The only difference is which index moves in the inner loop.

Memory is one-dimensional. A two-dimensional array is a convention for folding a rectangle into a line, and every performance and correctness property of grids follows from that fold.

Four ideas. How the fold works, and why it makes loop order matter. How each language actually stores a grid, including one famous aliasing bug. Grids as graphs you never build. And rotating a matrix in place, with nothing but swaps.

## The fold

Most languages store a matrix in row-major order: all of row zero, then all of row one, and so on. C, Rust and NumPy do it by default, and a list of lists is row-major in spirit. So the cell at row r, column c lives at flat index r times the number of columns, plus c. Multiply by the element size and add the base, and you have its address. Going back is division and remainder: the row is the index divided by the column count, and the column is what is left over.

Picture a 3 by 4 matrix of 4-byte integers. Row zero takes bytes zero to 15. Row one starts immediately after, at byte 16. The whole thing is one 48-byte block. Fortran and MATLAB fold the other way, column by column, and everything that follows flips with it.

Two consequences. First, walking along a row is sequential memory, but walking down a column is a stride of the whole row width on every step. In a 4,096-column matrix of 4-byte integers, each step down a column jumps 16 kilobytes, four memory pages. Second, any grid can be stored as one flat block with that formula: one allocation, no pointer per row. That is how image buffers, game boards and NumPy arrays are stored.

## Why loop order costs 20 times

A 64-byte cache line holds 16 four-byte integers. Walking a row, the first access to a line misses and the next 15 hit, and the prefetcher runs ahead of the sequential stream, so the misses are mostly hidden. Walking a column, every access lands on a different line, and with a 16-kilobyte stride, a different page, so the address translation cache misses too. By the time the loop comes back to that line's neighbour, the line has been evicted.

The lesson measured it. A 256 by 256 matrix fits in the per-core cache, and the gap is about 2.6 times. At 1,024 by 1,024, 4 megabytes, the row walk took 0.2 milliseconds and the column walk 2.3: 12 times. At 4,096 by 4,096, 64 megabytes, it was 3 milliseconds against 62: 20 times. The number of additions is identical in both orders.

Your ratio will depend on your machine's caches. The order of magnitude, 10 times or more once the matrix outgrows the cache, will not. It is why numerical libraries obsess over loop order, and why transposing one operand so that both walk rows is a standard optimisation.

There is a sneaky version of this in NumPy. Its transpose is not a copy. It returns a view that swaps the strides, the byte step per axis, so it costs nothing. But a later row-wise loop over that view is secretly a column walk, with the full cache penalty.

## How languages store grids

A Python list of lists is a list of pointers to separate row lists. Reading one cell is two pointer dereferences and two bounds checks. A 1,000 by 1,000 grid of zeros is about 8 megabytes, with the rows scattered wherever the allocator put them. The same grid in NumPy as 32-bit integers is one 4-megabyte block, and as single bytes, one megabyte. For interviews, a list of lists is expected and readable. Mention the flat layout if the interviewer asks about performance.

Now the famous trap. You build a grid of 3 rows by writing "a list containing one row of four zeros, times three". Then you set the first cell of the first row to 1. Before I tell you what prints, think about what the times-three copied.

[pause]

Every row now starts with a 1. Multiplying a list copies the reference, not the object. Three references to one row. For the inner zeros that is harmless, because integers are immutable. For a list, it aliases. The fix is a comprehension that builds a fresh row on each iteration. JavaScript has the same bug when you fill an outer array with one inner array: every row is that same inner array. Use Array dot from with a function that makes a new row each time. The tell in a test: the bug only appears when two different rows are written.

## Grids are graphs

A grid is a graph where every cell is a node and every in-bounds neighbour is an edge. You never build an adjacency list. A small neighbours function, which adds up, down, left and right to a cell and keeps the ones inside the bounds, is the adjacency list. Flood fill is depth-first search. Shortest path through a maze is breadth-first search. Number of islands is counting connected components.

So traversal costs order rows times columns: each cell is visited once and has at most four edges. The bounds check is where most grid bugs live, and two habits remove them. Check bounds where you generate the neighbour, not where you consume it. And never read the first row's length before checking that the grid is not empty, or you crash on the empty input the interviewer asks about last.

One trap is specific to grids, and it is the one that fails hidden tests. A recursive flood fill on a 1,000 by 1,000 grid of open cells can recurse a million deep. CPython's default recursion limit is 1,000, and Node's stack overflows at roughly ten thousand frames. It passes on the 4 by 5 example and crashes on the big one. Use an explicit stack, or breadth-first search. Raising the recursion limit is the wrong answer.

Two more patterns to know by name. Spiral order keeps four boundaries, top, bottom, left and right, and peels one layer per loop: across the top, down the right, then, only if a row or column remains, back along the bottom and up the left. Those two "only if" guards are the whole difficulty; without them a single leftover row is walked twice. And diagonals: every cell on the same anti-diagonal shares row plus column, and every cell on the same main diagonal shares row minus column. Group by that key and you have diagonal traversal, and the N-queens attack check.

## Rotation in place

Rotate a square matrix 90 degrees clockwise, with constant extra space. The trick is that a rotation is two reflections, and each reflection can be done with swaps. First transpose: swap each cell with its mirror across the main diagonal. Then reverse each row.

Say it on a 3 by 3. The rows are 1 2 3, 4 5 6, 7 8 9. Transpose, and the rows become 1 4 7, 2 5 8, 3 6 9. Reverse each row, and you get 7 4 1, 8 5 2, 9 6 3. Check it against your picture of a clockwise turn: the left column, 7 4 1 read from the bottom up, is now the top row. That took three swaps for the transpose and three for the reversals.

The line that carries the bug is the transpose loop. It must only swap a cell with its mirror when the column is greater than the row. Iterate over every cell instead, and each pair gets swapped twice, which puts the matrix back exactly as it was. Counter-clockwise is transpose then reverse each column. All of these are order n squared time, which is linear in the number of cells, with constant extra space.

Two limits. A non-square matrix cannot be transposed in place with swaps, because the shape of the flat layout changes; elements move in permutation cycles, and allocating the output is almost always the right call. And on a huge image, the transpose must be done in tiles, say 32 by 32, so both the reads and the writes stay in cache.

## Borrowing storage in the input

Set matrix zeroes is the representative in-place grid problem. If a cell is zero, zero its whole row and column. The easy version records the zero rows and columns in two sets. The constant-space version uses the first row and the first column of the matrix as those sets: for each interior zero, write a zero marker into its row's first cell and its column's first cell. Two booleans remember whether the first row and first column themselves need clearing.

Then the order matters. Process the interior first, using the markers. Only then clear the first row and column. Clear the first row too early, and you destroy the column markers before you read them; if the first row was flagged, every marker reads zero and every interior cell gets wiped. The general lesson: in-place grid tricks are about finding storage inside the input you can borrow without destroying information you still need.

And when is a dense grid the wrong structure? When it is sparse. A world of a million by a million cells with ten thousand occupied ones is a trillion cells, a terabyte at one byte each. As a dictionary keyed by row and column, it is ten thousand entries, under 2 megabytes. Dictionaries also handle negative coordinates, which arrays cannot.

## In the interview

A follow-up the lesson expects. Your grid solution is order rows times columns. Can it run faster on real hardware?

[pause]

The bound is tight, but the constant depends on access order. Walking rows in the inner loop costs one cache miss per 16 integers. Walking columns costs one per element, a 10 to 20 times gap once the matrix outgrows the cache. The common wrong answer is "no, every cell must be visited", which is true and misses the question.

And another: number of islands on a 5,000 by 5,000 satellite tile. What breaks? Recursive depth-first search blows the stack on any large landmass, so use an explicit stack or breadth-first search. The visited array is 25 megabytes as bytes, and mutating the input instead is only acceptable if the caller does not reuse it.

## Recap

Four things to remember. A grid is a rectangle folded into a line: row times column count plus column. That makes the inner loop's direction worth 10 to 20 times once the matrix outgrows the cache. A list times three copies references, so build each row fresh. A grid is an implicit graph with a neighbours function as its adjacency list, and on anything large you never recurse per cell. And rotate clockwise by transposing, swapping only when the column is greater than the row, then reversing each row.

At your desk: the address trace, the loop-order measurements, the neighbours helper and the grid search visualiser, the rotation trace and code, the set-matrix-zeroes walkthrough, and the two exercises, in-place rotation and spiral order.
