---
problem: spiral-matrix-ii
args: [3]
frames: 45
source: 5f15909849ee16fb
---
@0
We are filling a three by three grid with 1 to 9 in a clockwise spiral, ending with 9 in the centre. The insight: the unfilled part is always a rectangle, described by four boundaries, top, bottom, left and right. Each leg of the spiral fills one edge of that rectangle, then moves that boundary inward. So you never check whether a cell is already filled. The boundaries tell you.

@1-3
First the grid of zeros, built one fresh row at a time. The comment on this line is the Python trap: multiplying a list of rows makes every row the same object, so writing one cell would write a whole column.

@4-6
The boundaries start at the edges: top and left are zero, bottom and right are 2. The counter k starts at 1, and we keep going until all nine numbers are written.

@7-14
Leg one, the top row, left to right: 1, 2, 3. Then top moves down to row 1, because that row is done.

@15-20
Leg two, the right column, downwards. It starts at the new top, row 1, so it does not overwrite the corner that already holds 3. It writes 4 and 5. Then right moves in to column 1.

@21-26
Leg three, the bottom row, right to left, starting at the new right: 6, then 7. Bottom moves up to row 1.

@27-30
Leg four, the left column, upwards, from the new bottom to the new top. That is just row 1, so it writes 8. Left moves in to column 1. All four boundaries are now 1: the remaining rectangle is the single centre cell.

@31-34
k is 9, which is still at most 9, so a second lap begins. The top row leg covers just column 1, and writes 9 in the centre.

@35-41
Now top moves past bottom, and right moves past left. The other three legs have empty ranges, so they write nothing. That is why the square version needs no extra guards.

@42-44
k is 10, past 9, so the loop ends. The grid reads 1, 2, 3, then 8, 9, 4, then 7, 6, 5.

Each cell is written once, so time is proportional to n squared, with constant space beyond the output. The mistakes are aliasing the rows, starting a leg at the old boundary and overwriting the corner the previous leg filled, and reusing this square code on a rectangle without guards, where a leftover single row or column gets written twice.
