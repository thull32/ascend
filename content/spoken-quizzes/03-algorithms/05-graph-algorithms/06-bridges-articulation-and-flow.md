---
lesson: bridges-articulation-and-flow
source: 3ec36ffc1ce6baf7
---
## 1

In an undirected depth-first search, node u has a child v whose low value equals u's discovery time. Which statements are true?

A, the edge u v is not a bridge, and a non-root u is an articulation point. B, neither, because the back edge lets v's subtree climb above u. C, the edge u v is a bridge, and a non-root u is an articulation point. D, the edge u v is a bridge, but u is never an articulation point.

[think]

The answer is A: the edge is not a bridge, and a non-root u is an articulation point.

The low value means v's subtree can climb back to u, but no higher. Removing the edge leaves the subtree connected through that back edge, so it is not a bridge; that needs v's low to be above u's discovery time. Removing u itself strands the subtree, so u is a cut vertex, except at the root, which needs two children.

## 2

Your bridge finder skips the parent by node: if the neighbour is the parent, continue. On a graph with two parallel edges between nodes 0 and 1, and nothing else, what does it report?

A, one bridge, 0 to 1, which is wrong. B, two bridges, one per parallel edge. C, it loops forever between nodes 0 and 1. D, no bridges, which is correct.

[think]

The answer is A: one bridge, 0 to 1, which is wrong.

From node 1, both edges lead back to node 0, and both are skipped as "the parent". So node 1 sees no back edge, its low value stays above 0's discovery time, and the edge is reported as a bridge. The visited check prevents any loop. Skipping by edge index leaves the second edge as a real back edge, and gives the correct answer: no bridges.

## 3

Why does the residual graph include a reverse edge with capacity equal to the flow already pushed?

A, as a speed-up that finds augmenting paths in fewer rounds. B, to let the network model undirected edges as two arcs. C, so a later path can cancel flow chosen by an earlier one. D, so breadth-first search terminates even when capacities are irrational.

[think]

The answer is C: so a later path can cancel flow chosen by an earlier one.

Without reverse edges, the method is a greedy path packer, and it can get stuck below the maximum, at a flow of 1 instead of 2 in the lesson's example, because an early choice can block a better solution. Reverse edges are what make Ford-Fulkerson correct, not merely faster. Termination with irrational capacities comes from choosing paths by breadth-first search.

## 4

You need to assign 10 thousand volunteers to 8 thousand shifts. Each volunteer lists the shifts they can take, and you want to cover as many shifts as possible. Which formulation and algorithm?

A, bipartite matching as a unit-capacity flow, using Hopcroft-Karp. B, greedy: give each volunteer their first free listed shift. C, shortest paths: Dijkstra from a super-source to every shift. D, a spanning tree: Kruskal over the volunteer-shift edges.

[think]

The answer is A: bipartite matching as a unit-capacity flow, using Hopcroft-Karp.

Each one used at most once, maximise the pairs: that is bipartite matching. Greedy fails whenever re-homing an earlier assignment would free a shift. Hopcroft-Karp is the scalable choice at this size; Kuhn's algorithm also works, but its worst case is V times E.

## 5

After Edmonds-Karp terminates, how do you get a minimum cut between the source and the sink?

A, split the nodes by whether the source reaches them in the residual graph. B, take the edges of the last augmenting path found. C, take the minimum-capacity edge on every augmenting path found. D, take every edge whose final flow equals its full capacity.

[think]

The answer is A: split the nodes by whether the source reaches them in the residual graph.

The nodes the source can still reach form one side, and the edges leaving that side form the cut. Termination means no residual path to the sink, so every original edge leaving the side is saturated, and every edge into it carries no flow. Their total capacity equals the flow, which by max-flow min-cut is the minimum. Saturated edges elsewhere are not necessarily in the cut.

## 6

On the lesson's six-node network, whose maximum flow is 4, an implementation returns 3. It stops after two paths: s, a, b, t and s, a, c, t. What is the most likely defect?

A, it stores capacities as floats, so the third bottleneck rounds to zero. B, it never adds reverse residual edges, so the path s, d, b, a, c, t is invisible. C, it runs one search from t instead of s, so it finds paths in the wrong direction. D, it uses depth-first instead of breadth-first search, so it picks long paths and stops early.

[think]

The answer is B: it never adds reverse residual edges.

The third augmenting path steps from b back to a, along the reverse edge the first path created. Without reverse edges, b has no outgoing residual capacity, and the search stops at 3. Depth-first versus breadth-first changes which paths are found and how many rounds run, not whether the maximum is reached, and small integer capacities cannot round away.
