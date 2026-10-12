---
problem: number-of-islands
args: [[["1","1","0"],["0","1","0"],["1","0","1"]]]
frames: 107
source: c3ac598dd9077979
---
@0
A three by three grid. The top row is land, land, water. The middle row is water, land, water. The bottom row is land, water, land. The grid is a graph you never have to build: each land cell is a node, joined to the land directly above, below, left and right of it. An island is a connected component, and counting components has a simple recipe. Scan every cell, and each time you find land you have not seen, count one island and flood the whole island so it can never be counted again.

@1-5
Three rows, three columns, and a count of zero. The scan starts at the top-left corner, which is land.

@6-9
A new island: the count becomes 1. We sink the cell, turning it to water, and put it on a stack. Sinking is the visited marker, and we do it when a cell is pushed, not when it is popped, so no cell can be pushed twice.

@10-21
Pop the corner and look in four directions. Below is water. Above is off the grid. To the right is land, so it is sunk and pushed. To the left is off the grid.

@22-34
Pop the cell at row 0, column 1. Below it, the middle of the grid is land: sink it and push it. Its other neighbours are off the grid or already water.

@35-46
Pop the middle cell. Below it, above it, and to either side, everything is water now. Its corners, the two land cells in the bottom row, touch it only diagonally, and diagonals do not count. The stack is empty: the first island was three cells.

@47-66
The scan carries on. The rest of the top row and the whole middle row are water, partly because we sank them, so nothing is counted twice.

@67-71
Row 2, column 0 is land nobody has seen: count 2. Sink it and push it.

@72-82
Its neighbours are off the grid or water, so this island is a single cell.

@83-91
Row 2, column 2 is also unseen land: count 3. Sink it and push it.

@92-104
It is alone too, and the scan finishes.

@105-106
We return 3. Each cell is scanned once and pushed at most once, so time is rows times columns. We used an explicit stack rather than recursion, because an all-land grid of 300 by 300 would recurse 90,000 deep and blow Python's limit. Two classic mistakes: marking cells when popped, which lets the same cell be pushed by several neighbours, and treating diagonals as connected, which would have merged all five land cells into one island here.
