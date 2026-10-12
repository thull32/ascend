---
lesson: grid-and-two-dimensional-dp
source: 3a32ba09c51af149
---
## 1

In unique paths on a grid, why are the paths counted from the cell above and the paths counted from the cell to the left guaranteed not to overlap?

A, because each path's final move is either down or right. B, because the grid has no obstacles, so no path is shared. C, because two distinct paths never pass through the same cell. D, they do overlap, and the double count is divided out at the end.

[think]

The answer is A: each path's final move is either down or right.

Partitioning by the last move gives disjoint sets: a path's final move is down or right, never both, so each path is counted in exactly one term. Paths certainly share cells along the way; what matters is only the last move. It is the same "what was the last decision" argument as in one-dimensional problems, and it is why the combine is a plain sum.

## 2

A grid transition reads three cells: the one diagonally up and left, the one above, and the one to the left. You want to keep a single rolling row. Which direction should the inner sweep go?

A, either; every cell is read before it is overwritten. B, right to left, so the cell to the left still holds the previous row. C, neither; one row cannot hold both versions of the column to the left. D, left to right, so the cell to the left already holds the current row.

[think]

The answer is C: neither; one row cannot hold both versions of the column to the left.

That column is needed twice: from the current row, which needs a left-to-right sweep, and from the previous row, the diagonal, which needs right to left. Left to right gets the first and has already destroyed the second; right to left keeps the second but has not computed the first. You need a second row, or one saved variable holding the diagonal before it is overwritten.

## 3

You compute the minimum path sum in place, overwriting each grid cell with its running minimum. The interviewer then asks for the actual path. What is the situation?

A, recompute from scratch, since backtracking needs the original costs. B, only parent pointers help, since the table values cannot show the route. C, it is lost, since in-place updating is a rolling row in disguise. D, backtrack by comparing table values, which the grid still holds in full.

[think]

The answer is D: backtrack by comparing table values, which the grid still holds in full.

Reconstruction only needs the table, not the original costs: from the end cell, step to whichever of the cell above and the cell to the left is smaller. Overwriting in place keeps the full table, so the path is recoverable without a separate parent grid. It is the rolling-row optimisation, which keeps only one row, that destroys it.

## 4

Longest increasing path in a matrix allows moves in four directions. Why can it still be solved with dynamic programming, without infinite loops?

A, it cannot; four-way moves force a breadth-first search instead. B, because a row-by-row fill visits every neighbour before the cell. C, because the grid is finite, so every recursion bottoms out. D, because values strictly increase, so the dependencies form a directed acyclic graph.

[think]

The answer is D: values strictly increase, so the dependencies form a directed acyclic graph.

Strict increase means no cell can depend on itself, however indirectly, so memoised recursion terminates. Row-by-row order does not respect these dependencies, since a larger neighbour can be below or to the right, but memoisation, or sorting cells by value, does. Finiteness alone would not prevent cycles if equal values were allowed.

## 5

A grid table with a constant-time transition is 10 thousand by 10 thousand cells, and it must fit in 100 megabytes. What is the right call?

A, switch to 32-bit integers, halving the table to fit the budget. B, it is too big at 8 bytes a cell, 800 megabytes, so roll to one row of 10 thousand. C, keep the full table, since 100 million cells is small for a grid. D, use memoisation, so unreachable cells are never stored.

[think]

The answer is B: too big at 800 megabytes; roll to one row of 10 thousand.

100 million cells at 8 bytes each is 800 megabytes, even as a typed array, and several times more as Python integer objects. Halving to 32-bit integers still leaves 400 megabytes, over the budget. Memoisation still stores every reachable state, which here is all of them. A rolling row of 10 thousand cells uses about 80 kilobytes.

## 6

A colleague builds the table in Python by making one row of n zeros, wrapping it in a list, and multiplying that list by m. What happens when the fill runs?

A, it works, because the multiplication copies the inner list m times. B, it works, but the table uses m times more memory than needed. C, every row aliases one list, so each write appears in all rows. D, an index error, since the outer list has n rows rather than m.

[think]

The answer is C: every row aliases one list, so each write appears in all rows.

List multiplication repeats the same reference m times, so one inner list is shared by every row, and a write to row 1 shows up in row 0 and row 2 as well. The shape is right, so there is no index error, and the memory is smaller rather than larger. Build the rows with a comprehension so each one is a fresh list. JavaScript's array fill has the same aliasing.
