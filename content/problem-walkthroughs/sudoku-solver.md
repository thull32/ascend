---
problem: sudoku-solver
args: [[[".", ".", "5", "3", "2", "4", "1", "6", "8"], ["3", "2", "4", "8", "6", "1", "5", "9", "7"], ["8", "6", "1", "7", "9", "5", "4", "2", "3"], ["1", "3", "2", "5", "8", "6", "9", "7", "4"], ["4", "7", "9", "1", "3", "2", "6", "8", "5"], ["5", "8", "6", "4", "7", "9", "2", "3", "1"], ["6", "1", "3", "9", "5", "8", "7", "4", "2"], ["2", "4", "7", "6", "1", "3", "8", "5", "9"], [".", "5", "8", "2", "4", "7", "3", "1", "6"]]]
max_frames: 700
frames: 611
source: 7f214c024582204e
---
@0
This board is almost solved: only three cells are empty, the first two cells of the top row and the first cell of the bottom row. That keeps the search short enough to follow. Sudoku is a constraint problem. Keep a set of the digits already used in every row, every column and every box, and the candidates for a cell are simply the digits missing from all three. Then always fill the empty cell with the fewest candidates first.

@1-31
The setup builds nine empty sets for the rows, nine for the columns and nine for the boxes, and an empty list for the cells still to fill.

@32-47
Now one scan of the whole board. Row 0, column 0 is a dot, so it goes on the empty list; so does column 1. Column 2 holds a five, and the five goes into three sets: row 0's, column 2's, and box 0's.

@48-83
The rest of the top row is all digits, each added to its row, its column and its box the same way.

@84-475
Rows 1 to 7 are complete, so the scan just files every digit, one cell at a time. It is the longest stretch of the trace, but it is only 81 cells, done once.

@476-530
In the bottom row, column 0 is empty and joins the list, which now holds three cells: row 0 column 0, row 0 column 1, and row 8 column 0. Every other digit is filed. Row 0's set now has every digit except seven and nine.

@531-535
The two helpers are defined and the search starts. The empty list is not empty, so there is work to do. The first job is to choose which cell to fill.

@536-539
For each empty cell, count its candidates. Row 0 column 0 is missing seven and nine from its row, its column and its box, so it has two candidates.

@540-547
Row 0 column 1 has only nine, because its column already holds a seven. Row 8 column 0 also has only nine. The minimum is one candidate, and the first cell that reaches it is index 1, row 0 column 1. Reading order would have started with the two-candidate cell instead.

@548-556
Its options are just nine, so this cell is forced. It is swapped with the last entry of the empty list and popped off in constant time, leaving row 0 column 0 and row 8 column 0. Its box is box 0.

@557-559
Nine goes on the board and into the row, column and box sets, and we recurse.

@560-569
The second call counts candidates again, and something changed. Row 0 column 0 now has only seven, because nine is in its row now. Placing one digit turned a two-way choice into a forced one. Row 8 column 0 still has one candidate, nine. The first cell with one candidate is index 0.

@570-581
So seven goes into the top-left corner, and the empty list shrinks to the single cell in the bottom row.

@582-599
The third call finds that cell forced too: nine, in box 6. Place it, update the sets, recurse.

@600-608
The fourth call finds the empty list empty: every cell is filled, so it returns true. Each call above it sees true and returns true at once, without undoing its digit. That early return is what keeps the solution on the board.

@609-610
The function returns the completed board: the top row now starts seven, nine, five, and the bottom row starts with nine. Here no guess was ever wrong, but when one is, the loop removes the digit from the three sets, tries the next option, and finally puts the dot back and restores the empty list. Worst-case time is exponential in the empty cells, but choosing the most constrained cell first turns most puzzles into chains of forced moves like these. The bug to watch for is the box index: it is the row divided by three, rounded down, times three, plus the column divided by three, rounded down. Adding the two quotients without the times three merges different boxes.
