---
lesson: matrix-traversal
source: 7ee12bcde38d5682
---
## 1

In the boundary-shrinking spiral, what goes wrong if you remove the guard that checks top is still at most bottom before the bottom-row pass?

A, the bottom row is skipped on matrices wider than they are tall. B, the right column is emitted twice when only one column remains. C, the loop never terminates on matrices with an odd number of rows. D, a lone remaining row is emitted a second time, in reverse order.

[think]

The answer is D: a lone remaining row is emitted again, in reverse.

When only one row remained, the top-row pass moves top past bottom. Without the guard, the bottom-row pass runs on that same row from right to left, duplicating every cell except the last one, which the right-column pass had already claimed. A leftover single column is protected by the other guard, left at most right.

## 2

Which two in-place operations compose to a 90-degree clockwise rotation of a square matrix?

A, reverse the order of the rows, then reverse each row. B, reverse each row, then reverse each column. C, transpose, then reverse the entries of each row. D, transpose, then reverse the entries of each column.

[think]

The answer is C: transpose, then reverse each row.

Transposing sends row i, column j to row j, column i. Reversing each row then sends that to row j, column n minus 1 minus i, which is exactly the clockwise rotation. Transposing and then reversing each column gives the anticlockwise rotation, and the two double reversals give a rotation of 180 degrees.

## 3

In Set Matrix Zeroes, with the flags stored in the first row and first column, why must the interior be updated before the first row and column?

A, it does not matter; either order gives the same final matrix. B, it keeps the overall time at order m times n, instead of more. C, zeroing the first row first would erase the column flags stored in it. D, interior cells come first in row-major memory, which is faster.

[think]

The answer is C: zeroing the first row first would erase the column flags.

The flags live in the first row and column. Zero those lines first and every column flag reads as zero, so the whole matrix is cleared. Read the flags into the interior, then apply the two saved booleans to the borders last. Memory order and complexity are unaffected either way.

## 4

In Python, a grid BFS builds its visited grid by multiplying a list containing one row of False values by the number of rows. What is the consequence?

A, it works correctly, but uses more memory than a comprehension. B, it raises an IndexError on any grid that is not square. C, it builds the grid transposed, as one list per column. D, every row is one shared list, so a mark shows in every row.

[think]

The answer is D: every row is one shared list, so a mark shows in every row.

The outer multiplication repeats a reference to one inner list. Marking row 2, column 3 sets index 3 of that single list, which every row sees, so the BFS believes cells are visited that never were. Build independent rows with a comprehension. JavaScript's nested fill has the same bug.

## 5

Summing a 4096 by 4096 grid column by column was 9 times slower than row by row in Node, but only 1.6 times slower in CPython. Why the difference?

A, both pay a few nanoseconds per column step, and CPython adds about 11 nanoseconds per cell. B, CPython caches the whole grid in the fastest cache, which hides the column stride. C, CPython stores lists column-major, so both orders are strided. D, V8 cannot prefetch typed arrays, so it pays a full miss on every cell.

[think]

The answer is A: both pay a few nanoseconds per column step, and CPython adds about 11 per cell.

The cache penalty of a strided walk is similar in absolute terms, a few nanoseconds per cell, because each access lands on a new cache line. V8 compiles the row loop to a few instructions per cell, so the penalty dominates. CPython's interpreter overhead, about 11 nanoseconds per cell, dilutes it. CPython lists are row-major arrays of pointers, and a 128 megabyte grid does not fit in any cache level.

## 6

Rows of a large matrix arrive as a stream, and you must output Set Matrix Zeroes. Why can you not emit each row as soon as it arrives?

A, the first row holds the flags, so it must be emitted last of all. B, rows must be sorted before any flag can be written into them. C, a zero in a later row must zero that column in earlier rows too. D, streams cannot be traversed in row-major order without a copy.

[think]

The answer is C: a zero in a later row must zero that column in earlier rows too.

Column zeroing reaches backwards: a zero found in row 900 changes row 3. You need either the full set of zero columns before emitting, through a second pass or a buffer, or a representation that describes the output by its zero rows and columns. Row-wise transforms without that backward dependency, such as row sums, stream fine.
