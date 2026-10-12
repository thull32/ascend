---
problem: max-area-island
args: [[[1, 0, 1], [0, 1, 1]]]
frames: 86
source: 6ffe6feccece3b84
---
@0-5
A small grid of two rows. The top row is land, water, land; the bottom row is water, land, land. Land connects up, down, left and right, never diagonally. So there are two islands: the lone cell in the top left, and three cells on the right that form an L. We want the largest area, which should be three. The insight: every land cell belongs to exactly one island, so measure each island once. Scan the grid, and each time you hit unvisited land, flood fill that island, sinking every cell you reach to water so it is never counted again, and count as you sink. The scan starts at the top left, which is land.

@6-9
We sink it, push it on the stack, and start the area at one. Marking and counting happen at the same moment, when a cell is pushed. That is what stops a cell from being counted twice.

@10-21
Pop it and look at its four neighbours. Below is water, above is off the grid, the right is water, and the left is off the grid. Nothing to add, so the stack empties. The area is one, and best becomes one.

@22-26
The scan moves right. The middle of the top row is water, so we skip it. The top right is land: a new island.

@27-30
Sink it, push it, area one.

@31-37
Pop it. Its neighbour below, row one, column two, is land. Sink it, push it, and the area becomes two.

@38-43
The other neighbours are off the grid or water.

@44-57
Pop the bottom right cell. Below and to the right are off the grid. Above is the cell we just came from, already sunk, so it is not counted again. To the left, the bottom middle is land. Sink it, push it, area three.

@58-70
Pop the bottom middle. Its neighbours are off the grid, or water, or already sunk. The stack is empty, so the island is done, with area three. Best becomes three.

@71-83
The scan finishes the grid. The bottom row is all water now, including the two cells we sank, so the scan skips them. That is the payoff: no island is measured twice.

@84-85
We return three.

The scan visits every cell once, and every land cell is pushed and popped once, so time is linear in the grid. The stack can hold the whole grid in the worst case, but sinking cells in place means no separate visited set. The classic mistakes: marking cells when popped instead of pushed, so a cell can be pushed twice and counted twice; only updating the best when a new island starts, which forgets the last one; quietly destroying the caller's grid, which you should mention; and recursive depth first search on a large all-land grid, which runs past Python's recursion limit.
