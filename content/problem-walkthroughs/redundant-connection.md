---
problem: redundant-connection
args: [[[3, 4], [1, 2], [2, 4], [3, 5], [2, 5]]]
frames: 78
source: b6d4232b6fa67b10
---
@0
Five edges, in this order: 3 to 4, 1 to 2, 2 to 4, 3 to 5, and 2 to 5. A tree on five nodes has four edges, so one of these closes a cycle, and we want the last such edge in the input. The insight: add the edges one at a time. While each edge joins two nodes that were not yet connected, we are growing a forest. The first edge whose ends are already connected is the one that closes the cycle, and it is the answer. Are these two already connected, asked while edges are only ever added, is the question union-find is built for.

@1-4
Every node starts as its own root, with a group size of one.

@5-12
Edge 3 to 4. The root of 3 is 3, and the root of 4 is 4. Different groups.

@13-16
Link them: 4 goes under 3, and 3's group has size two.

@17-28
Edge 1 to 2. Again two separate roots, so 2 goes under 1. Now there are two groups: 1 with 2, and 3 with 4.

@29-35
Edge 2 to 4 is the one a careless solution gets wrong. Both 2 and 4 have been seen before. But seen is not connected. Find the root of 2: its parent is 1, and 1 is a root.

@36-42
The root of 4 is 3. The roots differ, so 2 and 4 are in different groups, and this edge is safe.

@43-46
Both groups have size two, so either can go under the other: 3 goes under 1, and group 1 now holds four nodes.

@47-61
Edge 3 to 5. 3's root is now 1, and 5 is on its own. The smaller group joins the larger: 5 goes under 1, and all five nodes are in one group.

@62-74
Edge 2 to 5. Find the root of 2: it is 1. Find the root of 5: also 1.

@75-77
Same root, so 2 and 5 were already connected, through 1. This edge closes the cycle, and we return 2, 5. Each find is nearly constant thanks to union by size and path halving, so the whole scan is effectively linear. Two mistakes to avoid: flagging an edge because both ends were seen before, which would have wrongly returned 2, 4; and linking the nodes themselves instead of their roots.
