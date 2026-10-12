---
problem: rotate-image
args: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]]
frames: 23
source: 399c5b3fea7cf6c1
---
@0
We are turning a three by three grid a quarter turn clockwise, in place. The rows are 1, 2, 3, then 4, 5, 6, then 7, 8, 9. After the turn, the first row should read 7, 4, 1: the left column, read from the bottom up. The insight is to split the turn into two moves that are each easy to do in place. First a transpose, which flips the grid across its main diagonal, so rows become columns. Then reverse every row. Each move is a set of simple swaps, so no second grid is needed.

@1-6
The transpose. For row zero, the inner loop starts one past the diagonal, at column one. We swap the 2 above the diagonal with the 4 below it. Then column two: the 3 swaps with the 7. The first row now reads 1, 4, 7.

@7-10
Row one starts at column two, again one past the diagonal. The 6 swaps with the 8. The grid now reads 1, 4, 7, then 2, 5, 8, then 3, 6, 9: the original columns, laid out as rows.

@11-13
Row two has nothing to its right of the diagonal, so it swaps nothing. Starting each row one past the diagonal is the detail that matters. If the inner loop started at column zero, every pair would be swapped twice, putting it right back, and the transpose would quietly undo itself.

@14-20
Now reverse each row. 1, 4, 7 becomes 7, 4, 1. 2, 5, 8 becomes 8, 5, 2. And 3, 6, 9 becomes 9, 6, 3.

@21-22
The grid is 7, 4, 1, then 8, 5, 2, then 9, 6, 3, a quarter turn clockwise. The centre, 5, never moved. Together, the two moves send row r, column c to row c, column n minus one minus r, which is exactly the rotation.

Every cell is touched a constant number of times, so time is proportional to the number of cells, and the extra space is constant. Two mistakes are common. Starting the transpose's inner loop at zero undoes it, so you get a mirror image instead of a rotation. And reversing columns instead of rows gives the counter clockwise turn. In Python, building a fresh grid with zip looks neat, but it only rebinds a local name: the caller's matrix is untouched.
