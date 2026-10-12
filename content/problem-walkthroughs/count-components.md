---
problem: count-components
args: [4, [[0, 1], [1, 2], [2, 0]]]
frames: 49
source: f6d5784447e1973f
---
@0-4
Four nodes, 0 to 3, and three edges forming a triangle: 0 to 1, 1 to 2, and 2 back to 0. Node 3 has no edges at all. Think of it as merging. Start with every node in a component of its own, four of them. Each edge between two different components merges them, and the count drops by one. An edge inside a component changes nothing. Union-find answers "same component?" in nearly constant time. Every node starts as its own parent, every size is one, and the count is 4. Starting the count at n is also what makes the lonely node 3 count, with no special handling.

@5-17
First edge: 0 and 1. Find walks each node up to its root. Both are roots already, 0 and 1, and they differ, so this edge merges something. Union by size hangs the smaller tree under the larger; here the sizes tie, so 1 goes under 0. The parent array now says 1's parent is 0, and the size of 0's tree is 2. The count drops to 3.

@18-27
Second edge: 1 and 2. Find of 1 climbs: 1's parent is 0. The line in the loop is path halving, which points each node at its grandparent as it climbs, keeping the trees flat. Here 1 already points at the root, so nothing changes. Root 0. Find of 2 is 2 itself.

@28-33
The roots, 0 and 2, differ. 0's tree has size 2 and 2's tree has size 1, so the smaller one, 2, goes under 0. Size of 0's tree is 3, and the count drops to 2.

@34-45
Third edge: 2 and 0, the one that closes the triangle. Find of 2 climbs to 0. Find of 0 is 0. Same root. This edge lies inside a component that is already connected, so we skip it. This is why you cannot simply subtract the number of edges: three edges here, but only two merges.

@46-48
We return 2: the triangle, and node 3 alone. With path halving and union by size, each find costs, on average, the inverse Ackermann function of n, a number that never exceeds 4 for any real input. So the whole thing is nearly linear in edges, with linear space. A traversal that starts a depth-first search from each unvisited node and counts the starts gives the same answer; union-find's advantage is that it handles edges arriving one at a time.

The common mistakes: forgetting isolated nodes by only looking at nodes that appear in edges; linking the two nodes directly instead of their roots, which tears a node out of its component; and subtracting one for every edge instead of every merge.
