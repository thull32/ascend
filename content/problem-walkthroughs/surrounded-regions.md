---
problem: surrounded-regions
args: [[["O", "X", "X"], ["X", "O", "X"], ["X", "X", "X"]]]
frames: 109
source: 2fc5f26e8c314040
---
@0
A three by three board of X's, with two O's: one in the top left corner, and one in the centre. The centre O touches the corner O only diagonally, and diagonals do not connect. So the centre is surrounded and should be captured, while the corner O sits on the border and survives. The insight is to flip the question. Capture needs proof that a whole region never reaches the edge. Survival needs only one path to the edge. So we search inward from the border, mark every O we can reach as safe, and capture everything else.

@1-4
The board is not empty, it is three by three, and we start walking the left and right edges, row by row.

@5-8
Row zero, left edge: the corner holds an O. It is marked safe by changing it to a temporary hash sign, and pushed onto a stack for a flood fill. The hash is also the visited mark, so no separate set is needed.

@9-20
We pop the corner and try its four neighbours. Below it is an X. Above and to the left are off the board. To its right is an X. Nothing else joins the safe region. Note that the centre O is never even considered: it is diagonal.

@21-43
The rest of the left and right edges: every other edge cell is an X, so each call returns at once.

@44-71
Then the top and bottom edges, column by column. The corner is now a hash, not an O, so it is not flooded a second time, and every other edge cell is an X. The border search is finished. One cell is marked safe.

@72-83
Now one scan over the whole board decides everything. Row zero: the corner holds a hash, so it was reached from the border, and it is restored to O. The two X's stay as they are.

@84-91
Row one. The centre still holds an O. Any O left at this point was never reached from the border, so it is enclosed, and it becomes an X.

@92-108
The remaining cells are X's and stay put. The board is all X's, except the O in the corner.

Each cell is marked at most once by the border floods and visited once by the final scan, so time and space are proportional to the board. The mistakes are judging a region by one cell's neighbours instead of the whole region; flipping cells to X while still exploring, which can cut a safe region in half; letting diagonal neighbours connect; and using recursion for the flood, which on a large board of O's runs out of stack. The explicit stack avoids that.
