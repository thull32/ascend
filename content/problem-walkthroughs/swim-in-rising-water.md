---
problem: swim-in-rising-water
args: [[[0, 3], [2, 1]]]
frames: 38
source: dc38ccdc6c021331
---
@0
A two by two grid of heights: 0 and 3 on the top row, 2 and 1 on the bottom. We start top left and want the bottom right corner. At time t, the water covers every cell of height at most t, and we can swim freely through covered cells. The corner itself is only 1 high, but the answer is 2, because every route must cross either the 3 or the 2. Reframe it: the time to arrive is the highest cell on your path, so we want the path whose highest cell is lowest. That is a shortest path problem where costs combine with max instead of plus. Max never makes a path cheaper, so Dijkstra's greedy argument still holds.

@1-3
The heap starts with the start cell at its own height, zero. Seeding it with the start's height matters: you cannot move until the water covers the cell you are standing on. The start is marked seen.

@4-5
Pop the lowest level: zero, at the start. It is not the corner.

@6-10
Neighbours. Below is the 2. Its level is the larger of where we came from, zero, and its own height, 2. So it goes into the heap at level 2, marked seen as it is pushed.

@11-18
Above and to the left are off the grid. To the right is the 3, pushed at level 3. The heap now holds level 2 and level 3.

@19-21
Pop the lowest: level 2, the bottom left cell. Not the corner yet.

@22-26
Its neighbour below is off the grid, and the start above it is already seen.

@27-32
To its right is the corner, height 1. Its level is the larger of 2 and 1, which is 2. The 2 we crossed to get here is the bottleneck, and it carries forward. The corner is pushed at level 2.

@33-37
Pop the lowest again: level 2, which is the corner. The first time the corner comes off the heap, its level is the best possible, so we return 2. The route through the 3 is never explored.

Each cell is pushed and popped once, so time is n squared log n for an n by n grid, with n squared space. Marking cells when they are pushed is safe here only because entering a cell costs its own height, whichever side you come from. The mistakes are summing heights instead of taking the maximum, seeding the heap with zero instead of the start's height, and walking greedily to the lowest neighbour, which can lead into a dead end. Binary search on the time with a reachability check, or union find adding cells in height order, are the two other good answers.
