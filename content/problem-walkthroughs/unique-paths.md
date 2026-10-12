---
problem: unique-paths
args: [3, 4]
frames: 20
source: 509340ffa897429d
---
@0
A grid of three rows and four columns. A robot starts top left, may only move right or down, and we count its routes to the bottom right corner. There are 10. The insight: the last move into any cell came either from above or from the left. Those two groups of routes never overlap and between them cover everything, so a cell's count is the count above it plus the count to its left. And we only need one row of numbers, updated in place. The top row starts as all ones, because the only way along the top edge is straight right.

@1-3
Second row. The first column stays at one, because the only way down the left edge is straight down. At column 1, the cell still holds the value from the row above, 1, and the cell to its left, already updated for this row, also holds 1. Their sum, 2, replaces it. That in place trick is the whole space saving: before the update, a cell is "above"; the cell to its left is already "this row".

@4-8
Column 2: 1 from above plus 2 from the left gives 3. Column 3: 1 plus 3 gives 4. The second row reads 1, 2, 3, 4.

@9-13
Third row. Column 1: 2 from above plus 1 from the left is 3. Column 2: 3 from above plus 3 from the left is 6.

@14-16
Column 3: 4 from above plus 6 from the left is 10. The row reads 1, 3, 6, 10.

@17-19
We return the last cell: 10 routes.

Time is rows times columns, and space is one row, which you can make the shorter dimension. The numbers are Pascal's triangle turned on its side, and that gives a check: every route is two downs and three rights in some order, and there are 5 choose 2 ways to place the downs, which is 10. The common slips are setting the edges to zero instead of one, and mixing up which dimension the row runs along. With obstacles, the formula is gone but the same table still works: a blocked cell simply holds zero.
