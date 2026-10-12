---
problem: valid-sudoku
args: [[["7", ".", ".", ".", ".", ".", ".", ".", "."], [".", "7", ".", ".", ".", ".", ".", ".", "."], [".", ".", ".", ".", ".", ".", ".", ".", "."], [".", ".", ".", ".", ".", ".", ".", ".", "."], [".", ".", ".", ".", ".", ".", ".", ".", "."], [".", ".", ".", ".", ".", ".", ".", ".", "."], [".", ".", ".", ".", ".", ".", ".", ".", "."], [".", ".", ".", ".", ".", ".", ".", ".", "."], [".", ".", ".", ".", ".", ".", ".", ".", "."]]]
frames: 70
source: 250018632570e252
---
@0
An almost empty board with just two sevens: one in the top left corner, and one diagonally below and to its right, at row 1, column 1. They share no row and no column, but they sit in the same three by three box, so the board is invalid. The insight is that all three rules ask one question: has this digit already appeared in this group? A row, a column and a box are all just groups. So one pass over the cells checks three keys per digit, row and number, column and number, box and number, against a single set.

@1-6
Row zero, column zero holds a 7. It is not empty, so we name its box. The box number is the row divided by three, rounded down, times three, plus the column divided by three, rounded down. For the corner, that is box zero.

@7-16
Its three keys are checked and added one by one: row zero has a 7, column zero has a 7, box zero has a 7. None was there before.

@17-50
The rest of row zero is empty. Each empty cell is skipped straight away, which matters: two empty cells in one row must not count as a duplicate.

@51-55
Row 1 begins, and its first cell is empty too.

@56-59
Row 1, column 1 holds the second 7. Its box: 1 divided by three rounds down to zero, for both the row and the column, so this is also box zero. That arithmetic is where bugs hide. Using the remainder after dividing by three instead would give box 4, a different box, and this conflict would go unnoticed.

@60-65
The row key, row 1 with a 7, is new, so it is added. The column key, column 1 with a 7, is new as well.

@66-69
But the box key, box zero with a 7, is already in the set, put there by the corner. So we return false.

Every cell does constant work, so a nine by nine board takes constant time, and the set holds at most three keys per cell. On a general board with side n squared, it is n to the fourth cells. The mistakes are the box formula, treating dots as digits, and checking that rows are complete, which a partial board never is. Validity is not solvability: deciding whether the board can be finished is a much harder backtracking problem. Test the box formula on two cells, such as row 1, column 1, and row 4, column 4: they must land in boxes zero and 4.
