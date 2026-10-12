---
problem: n-queens
args: [4]
max_frames: 400
frames: 314
source: aed9ea1e6dce07ab
---
@0
Four queens on a four by four board. It is the smallest board with more than one solution, so you will see the search reach the bottom twice, and abandon a lot of dead ends on the way. The insight: two queens in a row always clash, so place exactly one queen per row and choose only its column. Each choice must be checkable in constant time, so keep three sets: the used columns, the used down-right diagonals, where every square shares row minus column, and the used down-left diagonals, where every square shares row plus column.

@1-12
The sets start empty, and we call backtrack for row 0. Column 0 is free, so the first queen goes in the corner. Column 0, diagonal 0 and anti-diagonal 0 are now taken, and the placement reads 0.

@13-24
Row 1. Column 0 is taken. Column 1 sits on the corner's diagonal: row minus column is zero. Column 2 is free, so the placement becomes 0, 2.

@25-39
Row 2 has nothing. Column 0 and column 2 are taken, column 1 is on the anti-diagonal of the queen we just placed, and column 3 is on its diagonal. This call returns, and the branch dies after only two queens.

@40-46
Back in row 1, we undo the queen: pop it from the placement and remove its column and diagonals from the sets. This undo is the line people forget. Without it, stale entries block squares that are actually free. Row 1 tries column 3, which is free: 0, 3.

@47-55
In row 2, column 0 is taken, but column 1 is free on every count. Three queens: 0, 3, 1.

@56-70
Row 3 fails. Columns 0, 1 and 3 are taken, and column 2 shares a diagonal with the queen in row 2.

@71-91
So we unwind. Row 2's last columns fail, row 1 has none left, and row 0 lifts the corner queen and tries column 1. Every placement with a queen in the corner has now been ruled out.

@92-106
Row 1: column 0 is on the new queen's anti-diagonal, column 1 is its column, and column 2 is its diagonal. Column 3 is free: 1, 3.

@107-124
Row 2 takes column 0 at once. In row 3, columns 0 and 1 are taken, but column 2 is clear of every diagonal. The placement is 1, 3, 0, 2.

@125-132
Now backtrack is called for row 4, which equals n: all four rows have a queen. This is where a solution is recorded. Each column in the placement becomes a string with a Q in that position, and the result holds the first board: dot Q dot dot, dot dot dot Q, Q dot dot dot, dot dot Q dot.

@133-163
Recording does not stop the search. We return, undo, and keep looking: row 3's last column and row 2's remaining columns fail, row 1 has none left, and row 0 moves its queen to column 2.

@164-193
This half of the search mirrors the first. Row 1 takes column 0. Row 2 skips column 1, on the diagonal of the row 1 queen, and takes column 3. Row 3 takes column 1. The placement is 2, 0, 3, 1.

@194-201
Row 4 again, and the second board is recorded: the first one flipped left to right.

@202-241
We unwind to row 0 once more, and it tries its last column, 3. Row 1 takes column 0.

@242-268
Row 2 takes column 2, but row 3 is blocked everywhere: three columns taken, and column 1 on the anti-diagonal of the queen in row 2.

@269-311
The remaining tries fail quickly. Row 1 moves to column 1, row 2 finds nothing, and row 1 runs out of columns. Row 0 has no columns left either.

@312-313
The search returns its two boards. One queen per row means at most n factorial leaves, and the diagonal checks prune far more than that: here most branches died after two or three queens. The classic bug, besides forgetting the undo, is using row plus column for both diagonals, which merges two different diagonals into one set.
