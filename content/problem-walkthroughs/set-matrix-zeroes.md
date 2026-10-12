---
problem: set-matrix-zeroes
args: [[[1, 2, 0], [4, 5, 6], [7, 0, 9]]]
frames: 66
source: 10fef412d5167764
---
@0
Three rows: 1, 2, 0, then 4, 5, 6, then 7, 0, 9. Every zero must wipe out its whole row and column, using constant extra space. The easy answer keeps a set of zero rows and a set of zero columns. The insight is that the matrix already has room for those markers: the first row can say which columns to clear, and the first column can say which rows to clear. The cost is that the first row and column hold real data too, so before marking anything we record, in two booleans, whether they had zeros of their own.

@1-10
First check: does the first row contain a zero? It does, the 0 in its last cell. So first row zero is true.

@11-22
Does the first column contain a zero? It holds 1, 4 and 7, so no. First column zero is false.

@23-30
Step one: scan the interior, everything below the first row and right of the first column, for zeros. Row one holds 5 and 6. No zeros there.

@31-33
Row two, column one holds a 0. So we mark its row head, the 7 at the start of row two, with a zero, and its column head, the 2 at the top of column one, with a zero. Writing a zero early loses nothing, because those cells are about to be cleared anyway. The grid now reads 1, 0, 0, then 4, 5, 6, then 0, 0, 9.

@34-37
Column two of row two holds 9. Nothing to mark. Notice the top of column two already held an original zero. It now acts as a column mark too, which is exactly right: that column must be cleared.

@38-45
Step two clears the interior from the marks. A cell is cleared if its row head or its column head is zero. Row one: the 5 sits under a marked column head, so it becomes zero. The 6 sits under the original zero at the top of column two, so it also becomes zero. Row one now reads 4, 0, 0.

@46-54
Row two has a zero at its head, so its interior is cleared: the 0 stays, and the 9 becomes zero.

@55-62
Only now do we touch the first row and column themselves. The order is the whole trick. Clearing the first row earlier would have erased the column marks while step two still needed them. First row zero is true, so the entire first row is cleared: 0, 0, 0.

@63-65
First column zero is false, so the first column keeps its 4. The result is 0, 0, 0, then 4, 0, 0, then 0, 0, 0. Row one keeps its 4 because nothing in row one or column zero was originally zero.

A constant number of passes over the grid, so time is proportional to its size, and the extra space is two booleans. The famous mistake is clearing rows and columns the moment you see a zero: the zeros you write are then mistaken for original ones, and the whole grid cascades to zero. The other is clearing the first row or column before the interior, which destroys the marks you still need.
