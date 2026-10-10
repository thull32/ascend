---
review: graph-algorithms
source: c21f2d736f31d4e4
---
## Introduction

Twelve questions from the graph algorithms module: Dijkstra, Bellman-Ford and Floyd-Warshall, spanning trees, union-find, strongly connected components, flow, and A-star. Each has four options. Answer out loud before the answer comes.

## Question 1

You write Dijkstra, but you mark a node as visited when you push it onto the heap, and refuse to push it again. The graph has three edges: A to B with weight 4, A to C with weight 2, and C to B with weight 1. What does the algorithm report for B?

A, 1, because only the last edge, C to B, is kept for B. B, 4, because the improvement through C is thrown away. C, 3, because the heap re-sorts B when C improves it. D, no value, because the refused duplicate push raises an error.

[think]

The answer is B: 4, because the improvement through C is thrown away. A pushes B at 4 and marks it visited. When C is popped and finds a path to B costing 3, B is already marked, so the push is refused, and nothing re-sorts B's old entry. Settling must happen on pop; a visited check at push time silently discards improvements.

## Question 2

Which of these problems is not solved correctly by plain Dijkstra with non-negative weights?

A, the shortest path, with an early exit when the target is popped. B, the path that minimises its maximum edge weight, the bottleneck path. C, the shortest path from several sources at once. D, the cheapest path that uses at most k edges from the source.

[think]

The answer is D: the cheapest path with at most k edges. An edge-count limit means the cheapest way into a node may be disqualified for using too many edges, so "settled means final" no longer holds per node. You need the state to be the node plus the edges used, or k plus 1 rounds of Bellman-Ford. Bottleneck paths work because a maximum never decreases along a path, several sources work by starting them all at zero, and early exit on pop is safe because popped means settled.

## Question 3

After Floyd-Warshall finishes, the distance from node 3 to itself is minus 5. What does that mean?

A, the cheapest edge out of node 3 weighs minus 5. B, it is a bug, because the diagonal starts at zero and can never change. C, node 3 lies on a cycle whose total weight is negative. D, node 3 cannot reach itself, and minus 5 marks it as unreachable.

[think]

The answer is C: node 3 lies on a cycle whose total weight is negative. The diagonal starts at zero and can only go down if some cycle through that node has negative total weight, which makes shortest paths through node 3 undefined. This is the global negative-cycle check that Bellman-Ford from a single source cannot give you.

## Question 4

You need the cheapest route between two airports with at most 3 stops. What is the right approach?

A, Floyd-Warshall, then read the entry for the two airports from the matrix. B, 4 rounds of Bellman-Ford, relaxing in place to save memory. C, Dijkstra, stopping as soon as the destination is popped. D, 4 rounds of Bellman-Ford, relaxing against a copy of the previous round.

[think]

The answer is D: 4 rounds of Bellman-Ford against a copied array. Three stops means at most four flights, and k rounds against a copy computes exactly the cheapest path using at most k edges. Relaxing in place can chain several edges inside one round and break the limit. Dijkstra's per-node settled rule fails when a cheaper path can be disqualified by its edge count, and Floyd-Warshall ignores the limit entirely.

## Question 5

You run Kruskal's algorithm, but stop as soon as there are exactly k components left. What have you computed?

A, a k-approximation of the spanning tree's total weight. B, complete-linkage clustering into k clusters. C, single-linkage clustering into k clusters. D, nothing useful, because Kruskal must run to completion.

[think]

The answer is C: single-linkage clustering into k clusters. Each Kruskal merge joins the two components with the closest pair of points, which is exactly single-linkage clustering; complete-linkage would merge on the farthest pair instead. Stopping at k components leaves the k minus 1 heaviest tree edges unused, and the lightest of those is the gap between the two closest clusters, which this clustering maximises.

## Question 6

You already hold a minimum spanning tree of a graph with V nodes and E edges, and one new edge, from u to v, is added. What is the cheapest way to get the new tree?

A, nothing changes unless the new edge is lighter than every edge at u or v, a check that costs the degree. B, add the edge, then remove the heaviest edge on the tree path from u to v, in order V. C, add the edge if it is lighter than the heaviest tree edge anywhere, in order V. D, rerun Kruskal on all the edges, because the sort must be redone.

[think]

The answer is B: add the edge, then remove the heaviest edge on the tree path from u to v. Adding an edge to a tree creates exactly one cycle, the tree path plus the new edge, and the cycle property says the heaviest edge on that cycle is in no minimum tree. Walking the tree path costs order V. The heaviest tree edge anywhere may not even be on the cycle, and the local degree test misses cases where the new edge displaces an edge several hops away.

## Question 7

Two union-find implementations both use full path compression. One hangs the smaller set under the larger. The other always hangs the second root under the first. Which statement is true?

A, the size-aware one is amortised inverse Ackermann; the other is amortised log n. B, the size-aware one is amortised log n; the other is inverse Ackermann. C, both are amortised log n, because inverse Ackermann needs a recursive find. D, both are amortised inverse Ackermann, because compression dominates.

[think]

The answer is A: size-aware is amortised inverse Ackermann, and the other is amortised log n. Path compression alone gives log n amortised; it is the combination with union by rank or by size that gives the inverse Ackermann bound. Whether find is recursive or a loop does not matter. Both are fast on typical inputs, but the guarantee differs, and interviewers ask precisely this.

## Question 8

To delete an element from its set, a colleague proposes setting its parent pointer to itself. In a forest where nodes 6 and 7 point to 4, and 4 points to 0, what happens after "deleting" 4 this way?

A, nodes 6 and 7 are silently cut off from 0's set, so asking whether 6 and 0 are connected now says no. B, nodes 6 and 7 are re-attached to 0 on their next find, so nothing is lost. C, node 4 leaves its set cleanly, because only its own pointer changed. D, it raises an error, because a non-root node cannot point to itself.

[think]

The answer is A: 6 and 7 are silently cut off from 0's set. Union-find has no delete. Node 4 is an internal node, so making it a root takes its whole subtree with it, and compression never re-attaches them, because find stops at the first node that points to itself. The honest options are replaying offline in reverse, rollback union-find, or a dynamic connectivity structure.

## Question 9

In Kosaraju's algorithm, why does the second pass, on the reversed graph, take nodes in decreasing finish time rather than increasing?

A, it keeps the recursion shallow on the reversed graph. B, the latest finisher is in a source component, which becomes a sink once the edges are reversed. C, the latest finisher is in a sink component, so its search stays inside it. D, either order works, since each search still finds one component.

[think]

The answer is B: the latest finisher is in a source component, which becomes a sink once reversed. Starting the second search from a sink collects exactly that component and cannot leak into any other. The latest finisher is in a source of the original graph, not a sink. Increasing order would start from a source of the reversed graph and swallow several components.

## Question 10

Which of these problems is 2-SAT, and therefore solvable in linear time?

A, each job goes in slot one or slot two, and given pairs must, or must not, share a slot. B, order the jobs so that every precedence pair is respected. C, each job goes in one of three slots, and given pairs must not share. D, pick the fewest jobs so that every conflicting pair has at least one picked.

[think]

The answer is A: two slots per job, with pairwise must-share or must-not-share constraints. Two choices per item with pairwise constraints is exactly 2-SAT: "must not share" and "must share" each become two clauses of two literals. Three slots is like graph colouring and hard in general, picking the fewest jobs to cover every conflict is vertex cover, also hard, and ordering by precedence is a topological sort.

## Question 11

In max-flow, why does the residual graph include a reverse edge whose capacity equals the flow already pushed?

A, as a speed-up that finds augmenting paths in fewer rounds. B, so the network can model undirected edges as two arcs. C, so a later path can cancel flow chosen by an earlier one. D, so the search terminates even when capacities are irrational.

[think]

The answer is C: so a later path can cancel flow chosen by an earlier one. Without reverse edges, the method is a greedy path packer and gets stuck below the maximum, at 1 instead of 2 on the lesson's four-node example, because an early choice blocks a better one. Reverse edges are what make Ford-Fulkerson correct, not merely faster. Termination with irrational capacities comes from choosing paths by BFS.

## Question 12

On a grid with eight directions of movement, where a diagonal step also costs 1, which A-star heuristic is both admissible and the tightest?

A, octile distance, which charges root two for each diagonal. B, Manhattan distance, the sum of the two axis differences. C, Euclidean distance, the straight line. D, Chebyshev distance, the larger of the two axis differences.

[think]

The answer is D: Chebyshev distance, the larger of the two axis differences. With diagonals costing 1, you cover the shorter axis for free while moving along the longer one, so the true distance is exactly the larger difference. Manhattan overestimates, and so does octile, which assumes diagonals cost root two; Euclidean never overestimates, but it underestimates more than it needs to.

## Recap

Three ideas kept coming back. Invariants and the exact place they break: settle on pop, never on push; a step limit or a negative diagonal changes which algorithm you need; and a union-find cannot delete. Order is part of correctness: Floyd-Warshall's stopover loop outside, Kosaraju's second pass by decreasing finish time, a copied array when the round count means stops. And recognising the reduction is the senior move: clustering is Kruskal stopped early, two choices with pairwise constraints is 2-SAT, and "undo an earlier choice" is what a residual edge is for.
