---
lesson: minimum-spanning-trees
source: 7da39e8e7645a603
---
## 1

All the edge weights in a connected graph are distinct. How many minimum spanning trees does it have?

A, as many as it has simple cycles. B, at least one for every node. C, exactly one, whatever its shape. D, one for each cut of the graph.

[think]

The answer is C: exactly one, whatever its shape.

With distinct weights, the lightest edge crossing every cut is unique, and the exchange argument shows every minimum spanning tree must contain it. Two different trees would disagree on some cut's lightest edge, which is impossible. Ties are the only source of multiple minimum spanning trees.

## 2

You need to connect 5,000 points in the plane with the minimum total length of wire, and any two points may be joined directly. Which implementation is best?

A, Prim with a binary heap, E log V. B, Dijkstra from any point, E log V. C, Kruskal on all 12.5 million edges, E log E. D, Prim with a best-distance array scan, V squared.

[think]

The answer is D: Prim with an array scan, V squared.

The graph is complete, so there are about half of V squared edges, and V squared is already linear in the number of edges. Kruskal has to sort 12.5 million edges, and Prim with a heap pays log factors on the same 12.5 million pushes. The array version does 25 million cheap operations with no allocation. And Dijkstra builds a shortest-path tree, which is not a minimum spanning tree.

## 3

A graph's minimum spanning tree contains the path A, C, E, D. Is that necessarily the shortest path from A to D?

A, yes, because a spanning-tree path minimises its heaviest edge. B, yes, provided all edge weights are distinct, so the tree is unique. C, yes, because every tree edge lies on some shortest path. D, no, because the tree minimises total weight, not each path.

[think]

The answer is D: no, the tree minimises total weight, not each path.

In the lesson's graph, the tree path A, C, E, D costs 11, while A, C, D costs 10. The objectives differ: the tree minimises a global sum, a shortest path is per pair, and uniqueness does not change that. The tree does minimise the heaviest edge on the path, the bottleneck, which is a different guarantee from minimising the path's total.

## 4

Running Kruskal, you stop as soon as exactly k components are left. What have you computed?

A, a k-approximation of the tree's total weight. B, complete-linkage clustering into k clusters. C, single-linkage clustering into k clusters. D, nothing useful; Kruskal must run to completion.

[think]

The answer is C: single-linkage clustering into k clusters.

Each Kruskal merge joins the two components with the closest pair of points, which is exactly single-linkage clustering; complete linkage would merge on the farthest pair. Stopping at k components leaves the k minus 1 heaviest tree edges unused, and the lightest of those is the distance between the two closest clusters, which this clustering maximises.

## 5

Which operation is the reason union-find is Kruskal's natural partner?

A, finding the lightest remaining edge in near-constant time. B, detecting negative-weight edges before they are added. C, checking and merging components in near-constant time. D, sorting the edge list faster than a comparison sort.

[think]

The answer is C: checking and merging components in near-constant time.

Kruskal's only question per edge is whether its endpoints are already in the same tree. Union-find answers that, and merges, in amortised near-constant time. The lightest edge comes from the sort, which is done separately and dominates the total cost.

## 6

You already hold a minimum spanning tree of a graph, and one new edge from u to v is added. What is the cheapest way to get the new tree?

A, nothing changes unless the new edge is lighter than every edge at u or v, checked in time proportional to their degree. B, add the edge, then remove the heaviest edge on the tree path from u to v, in linear time. C, add the edge if it is lighter than the heaviest tree edge anywhere, in linear time. D, rerun Kruskal on all the edges, because the sort must be redone.

[think]

The answer is B: add the edge, then remove the heaviest edge on the tree path from u to v.

Adding an edge to a tree creates exactly one cycle: the tree path from u to v, plus the new edge. The cycle property says the heaviest edge on that cycle is in no minimum spanning tree, and walking the path costs linear time in V. The heaviest tree edge anywhere may not lie on the cycle, and the local-degree test misses cases where the new edge displaces an edge several hops away.
