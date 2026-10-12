---
problem: spiral-matrix
args: [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]]
frames: 50
source: de107dcda3ffd335
---
@0
Three rows of four: 1 to 4, 5 to 8, 9 to 12. Read clockwise in a spiral, that is 1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7. The insight: the unvisited cells always form a rectangle, described by four numbers, top, bottom, left and right. Each leg of the spiral reads one side of that rectangle, then pulls that side in by one. No visited set is needed. Watch the end of this trace, because a wide matrix leaves a single row in the middle, and that is where the bugs live.

@1-3
The rectangle starts as the whole grid: rows zero to 2, columns zero to 3.

@4-13
Leg one reads the top row, left to right: 1, 2, 3, 4. Then top moves down to row 1.

@14-19
Leg two reads the right column, downwards, starting at the new top so the corner 4 is not read twice: 8, then 12. Then right moves in to column 2.

@20-28
Before leg three, a guard: is there still a row left between top and bottom? Yes, rows 1 and 2. So we read the bottom row, right to left: 11, 10, 9. Then bottom moves up to row 1.

@29-33
Leg four has its own guard: is there still a column left between left and right? Yes. It reads the left column upwards, which is now just row 1: 5. Then left moves in to column 1. The rectangle left over is a single row, row 1, columns 1 to 2.

@34-40
Second lap. The rectangle is still non empty, so leg one reads that row: 6, 7. top moves down to 2, which is now below bottom. The rectangle is empty.

@41-42
Leg two reads the right column from row 2 down to row 1: an empty range, so nothing is read. right moves in to 1.

@43
Here is the guard that matters. top is 2 and bottom is 1, so there is no row left, and the bottom row leg is skipped. Without this check, it would walk row 1 again, backwards, and emit 6 a second time.

@44-46
The left column guard passes, since left and right are both 1, but its range from bottom up to top is empty, so it reads nothing. left moves to 2.

@47-49
The loop condition now fails, and we return all twelve numbers, each exactly once.

Each element is appended once, so time is proportional to the grid, with constant space beyond the output. The mistakes are leaving out the two re-checks before the last two legs, which double counts a leftover row or column, and starting a leg at the old boundary, which reads a corner twice. Test a single row and a single column before you trust your code.
