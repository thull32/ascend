---
problem: pacific-atlantic
args: [[[1, 2], [4, 3]]]
frames: 130
source: 2e546c1e6179fd8a
---
@0
A two by two map. The top row has heights 1 and 2, the bottom row 4 and 3. The Pacific touches the top and left edges, the Atlantic the bottom and right edges. Which cells can drain into both? Asking where water from each cell can flow repeats the same work from every cell. Turn the question around: start at each ocean's shore and walk uphill. Water flows from a cell to a neighbour that is no higher, so walking backwards you may step to any neighbour that is at least as high. Every cell you reach can drain into that ocean.

@1-7
The climb function does one ocean's search. For the Pacific, the seeds are the top row and the left column: the cells with heights 1, 2, and 4. The corner appears twice in that list, which does no harm.

@8-10
The seeds go into the visited set, and all of them onto the stack at once. This is a multi-source search: the whole shore starts together.

@11-21
Pop the corner holding 1. Its neighbours are already visited or off the map.

@22-33
Pop the cell holding 4. Its neighbour to the right holds 3. Is 3 at least 4? No. Water cannot flow uphill from 3 to 4, so from here we cannot reach it.

@34-40
Pop the cell holding 2. The cell below it holds 3, and 3 is at least 2: water can run from 3 down to 2 and out to the Pacific. Mark it and push it.

@41-60
The 3 has nothing new around it. The Pacific search ends with all four cells.

@61-68
Now the Atlantic, with its own visited set. That matters: sharing one set would stop the second search from exploring cells the first one already claimed. Its seeds are the bottom row and the right column: the cells holding 4, 3 and 2.

@69-80
Pop the 2. Its left neighbour holds 1. Is 1 at least 2? No. Water from the 1 would have to climb to reach the 2.

@81-91
The 3 has no unvisited neighbours.

@92-105
The 4 looks up at the 1, and 1 is not at least 4, so the corner is unreachable from the Atlantic. The search ends with three cells: the 2, the 4 and the 3.

@106-129
Finally, keep the cells in both sets: the 2, the 4 and the 3. The corner holding 1 only reaches the Pacific, because every route from it to the Atlantic goes uphill. Each search visits every cell at most once, so the time is rows times columns, against rows times columns squared for a search from every cell. The classic mistake is comparing in the forward direction during the reverse search, or using strictly greater, which loses water flowing across equal heights.
