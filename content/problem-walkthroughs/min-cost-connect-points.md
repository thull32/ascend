---
problem: min-cost-connect-points
args: [[[0, 0], [1, 1], [1, 0], [4, 4]]]
frames: 124
source: 456dadb8587e0e2b
---
@0
Four points: 0, 0; 1, 1; 1, 0; and 4, 4. Wiring two points costs their Manhattan distance, the horizontal gap plus the vertical gap. The cheapest set of wires that connects everything is a minimum spanning tree. And because every pair of points could be wired, the graph is complete, which is why we use Prim's algorithm with a plain array: grow one tree, and for every point outside it, remember the cheapest wire to anything inside it.

@1-6
That memory is the list called best. Every point starts at infinity except point 0, at zero, because the tree has to start somewhere and starting is free. Nothing is in the tree yet, and the total is zero.

@7-18
Round one. Scan the points outside the tree for the smallest best. Point 0, at zero, wins.

@19-21
Point 0 joins the tree, and its best, zero, goes into the total. Now we look at the point we just added, at 0, 0.

@22-38
For every point still outside, could a wire to this new point be cheaper than what it has? Point 1, at 1, 1, is distance 2 away. Point 2, at 1, 0, is distance 1. Point 3, at 4, 4, is distance 8. All beat infinity, so best becomes 0, 2, 1, 8.

@39-51
Round two. The scan first picks point 1, with best 2, then finds point 2 with best 1, which is smaller. This is the cut property at work: the cheapest wire leaving the tree is always safe to take.

@52-55
Point 2 joins, and the total becomes 1. Its coordinates are 1, 0.

@56-69
Relax from point 2. Point 1 is only 1 away now, better than 2. Point 3 is 7 away, better than 8. Best reads 1 for point 1 and 7 for point 3.

@70-85
Round three picks point 1, with cost 1, and the total becomes 2.

@86-96
From 1, 1, point 3 is 3 across and 3 up: distance 6, better than 7.

@97-111
Round four picks the last point, point 3, at cost 6, and the total becomes 8.

@112-123
Nothing is left outside, so the relaxation does nothing, and we return 8: wires of 1, 1 and 6. Each round is two linear scans, so the time is n squared, with linear memory and no edge list at all. That beats Kruskal, which would build and sort about n squared over two edges. Two classic mistakes: using straight-line distance, and confusing this with shortest paths. If you add the path length so far to the new distance, you have written Dijkstra, which minimises each point's distance to the start, not the total wire.
