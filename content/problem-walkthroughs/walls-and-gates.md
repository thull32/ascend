---
problem: walls-and-gates
args: [[[0, 2147483647, 2147483647, 2147483647, 0]]]
frames: 78
source: e04c8d8788a46226
---
@0
A corridor of five cells: a gate at each end, zero, and three empty rooms between them, each holding infinity, which here is the largest 32 bit integer. Each room should end up holding the distance to its nearest gate: 1, 2, 1. Searching from every room is far too slow. The insight: "distance to the nearest of several sources" is one breadth first search, if every gate goes into the queue at the start. It is as if a single super gate were joined to all of them. The search then spreads in waves, and the first wave to reach a room carries the shortest distance.

@1-14
The grid is not empty, it is one row of five, and a scan collects every gate into the queue: positions zero and 4.

@15-23
Pop the left gate. Its neighbours above and below are off the grid. To its right is a room still at infinity, so it gets the gate's distance plus one, 1, and joins the queue. Writing the distance as we enqueue is what makes the grid its own visited set: a room that is no longer infinity has already been claimed.

@24-27
To its left is off the grid.

@28-39
Pop the right gate. The same thing happens on its side: the room at position 3 gets 1 and joins the queue. Both gates have now spread one step, and the first wave is complete.

@40-49
Pop position 1, at distance 1. Its right neighbour, the middle room, is still infinity, so it gets 2.

@50-52
Its left neighbour is the gate, which is zero, not infinity, so it is left alone. Gates and walls are never infinity, so they can never be overwritten.

@53-63
Pop position 3, at distance 1. The middle room already holds 2, so it is skipped. It was claimed first by the left side, at the same distance the right side would have given it.

@64-75
Pop the middle room. Every neighbour is either off the grid or already claimed. The queue is empty.

@76-77
The corridor reads 0, 1, 2, 1, 0.

Every cell joins the queue at most once, so time and space are proportional to the grid. Why is the first visit optimal? The queue hands out cells in order of distance from the set of gates, so any shorter route would have been expanded first. The mistakes are using a depth first search, which finds some path rather than the shortest; popping from the end of a Python list, which quietly turns the search into a depth first one; and running the search one gate at a time, where the first gate claims rooms that are really closer to a later gate, and the infinity check means they are never corrected.
