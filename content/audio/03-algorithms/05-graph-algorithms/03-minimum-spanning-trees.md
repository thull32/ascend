---
lesson: minimum-spanning-trees
source: 4ba4f2a2e9812f9c
fit: partial
desk:
  - "The cut-property proof run on the six-node graph, and the cycle property beside it"
  - "The Prim heap trace, the array-version trace, and the Kruskal trace with the union-find parent column"
  - "The Prim and Kruskal code"
  - "The comparison table of Prim, Kruskal and Borůvka, and the quantified costs"
  - "Exercises: Prim with a heap, and Kruskal with union-find"
---
## Introduction

You have a handful of data centres and a price list for laying fibre between any pair. Every centre must reach every other, and you want to pay as little as possible. The answer is never a cycle: remove any edge from a cycle and everything stays connected, for less money. So the answer is a tree that touches every node, a spanning tree, and specifically the one with the smallest total weight. The minimum spanning tree.

What makes it special among optimisation problems is that a greedy algorithm solves it exactly, and the proof of why fits in one paragraph. Once you own that proof, Prim's and Kruskal's algorithms are just two schedules for the same safe choice, and every variant question is a corollary.

So: the cut property and its one-paragraph proof, Prim and Kruskal as two ways of applying it, when each one wins, and the trap of confusing a spanning tree with a shortest-path tree.

## The cut property

A cut splits the nodes into two non-empty groups. An edge crosses the cut if it has one end in each group. The cut property: for any cut, the lightest edge crossing it belongs to some minimum spanning tree.

The proof is an exchange. Call the lightest crossing edge e, and suppose some minimum tree T leaves e out. T connects e's two endpoints somehow, and since they are on opposite sides, that path crosses the cut somewhere, at some edge f. Remove f, add e. It is still a spanning tree, and since e was the lightest crossing edge, it weighs no more than before. So there is a minimum tree containing e.

That is the entire theory. Any algorithm that keeps picking a cut, takes the lightest edge across it, and never closes a cycle, builds a minimum spanning tree. Prim and Kruskal differ only in which cuts they look at.

There is a mirror image, the cycle property: when weights are distinct, the heaviest edge on any cycle is in no minimum spanning tree. You will use it in a moment.

## Prim: grow one tree

Prim keeps a single growing tree. The cut is always "in the tree" against "not yet in the tree", and each step adds the lightest edge crossing it. Start anywhere.

A tiny example, four nodes. A to B costs 4. A to C costs 2. B to C costs 5. C to E costs 3. Start at A. The crossing edges are A to B at 4 and A to C at 2, so take A to C. Now the crossing edges are A to B at 4, C to B at 5, and C to E at 3, so take C to E. Now only A to B at 4 and C to B at 5 cross, so B joins through A at 4. Total weight 9. The edge from B to C, at 5, was never taken, and the cycle property says why: it is the heaviest edge on the triangle A, B, C.

The code looks exactly like Dijkstra with one change to the heap key. Dijkstra keys on distance from the source, the tail's distance plus the edge. Prim keys on the edge weight alone, distance from the tree. Lazy deletion and settling on pop carry over unchanged. In the example, B sat in the heap twice, at 4 via A and at 5 via C, and the cheaper one won because it popped first.

Which brings the classic bug, the same one Dijkstra has. Suppose you refuse to push a node that is already in the heap. Three nodes: A to B costs 10, A to C costs 1, C to B costs 2. What tree do you get?

[pause]

A pushes B at 10. C joins at 1, then finds B at 2, but the push is refused. B joins at 10, for a tree of 11 instead of 3. Heavier tree, no error. Mark a node as in the tree when it is popped, never when it is pushed.

Complexity. Each edge is pushed at most twice, once from each end, so the heap version is order E log V. But on a dense or complete graph, "connect all the points", there is something better. Keep, for each outside node, the lightest edge to the tree, and scan that array for the minimum each round. That is order V squared with a tiny constant and no heap, and on a complete graph V squared is the number of edges, which is optimal. For 5 thousand points with every pair joinable, that is 25 million cheap scans against 12 and a half million edges pushed through a heap. Reaching for the heap there is the classic sign of pattern-matching over thinking.

## Kruskal: many trees, lightest edge first

Kruskal sorts every edge by weight and walks the list, adding an edge if and only if its endpoints are currently in different trees. The cut that justifies each addition is "the tree containing one endpoint" against everything else. Every lighter edge has already been considered, so this one is the lightest crossing it.

On the same four nodes: sorted, the edges are A to C at 2, C to E at 3, A to B at 4, B to C at 5. Take A to C. Take C to E. Take A to B. Now B to C: B and C are already in the same tree, so reject it. Three edges for four nodes, done, total 9. With distinct weights the minimum tree is unique, so every correct algorithm finds the same one.

"Are these two in the same tree?" followed by "merge the trees" is exactly what a union-find structure does in near-constant time, which is why the next lesson exists. With union-find, Kruskal's cost is the sort: order E log E, which is the same as E log V.

Kruskal has one property Prim lacks. On a disconnected graph it produces a minimum spanning forest, one tree per component, with no change. Prim spans the start's component and stops, so it needs an outer loop, and if you forget, it reports a tree that is too light.

## Choosing, and the variants

Prim with a heap wins on sparse graphs held as adjacency lists. Prim with an array wins on dense and complete graphs. Kruskal wins when the edges are already sorted or arrive as a list, or you want a forest. And Borůvka, where every component picks its own lightest outgoing edge each round, is the one that parallelises: components choose independently, at least halving their number each round, so a logarithmic number of rounds suffices.

Variants worth having ready. Maximum spanning tree: negate the weights, or sort descending. Clustering: run Kruskal but stop when k components are left. That is single-linkage clustering into k clusters, the same as building the full tree and deleting the k minus 1 heaviest edges. Graph Valid Tree, where you check whether n minus 1 edges form a tree, is Kruskal with the sort removed: union-find must never see a cycle.

## What the tree is not

The minimum spanning tree is not a shortest-path tree. Four nodes: A to C costs 2, C to E costs 3, E to D costs 6, and C to D costs 8. The minimum tree takes the first three, total 11, and leaves out C to D. So in the tree, the path from A to D is A, C, E, D, costing 11. But the shortest path is A, C, D, costing 10. Minimising the total of the tree and minimising each distance are different objectives, and the gap can be arbitrarily large. If the question mentions a source and "shortest", it is Dijkstra. If it says "connect everything" and "total cost", it is a spanning tree.

What the tree does guarantee is the bottleneck: the path between any two nodes in it minimises the heaviest edge on the way. That is why "smallest maximum capacity" problems can be solved by building the tree and walking it, though Dijkstra with a maximum instead of a sum is usually simpler for a single pair.

The name misleads in one famous place. Ethernet's Spanning Tree Protocol builds a shortest-path tree from an elected root bridge, the Dijkstra shape, not a minimum-weight tree. "Spanning" there means loop-free.

## In the interview

A follow-up from the lesson. You already hold the minimum spanning tree, and one new edge is added to the graph. Update the tree faster than rebuilding it.

[pause]

Add the edge to the tree. That creates exactly one cycle: the tree path between its endpoints, plus the new edge. By the cycle property, drop the heaviest edge on that cycle. Finding the path is a walk over the tree, order V. The wrong answers are rerunning Kruskal, or comparing the new edge with the heaviest tree edge anywhere, which may not be on the cycle at all.

And the mirror question: a tree edge is deleted. The tree splits in two. Label the two sides, then scan once for the lightest surviving edge that crosses between them, order E. The wrong answer is taking the next edge in sorted order, which may not cross the cut.

And if some weights are equal? The algorithms still work, since a lightest crossing edge still exists, but the tree may not be unique, and which one you get depends on tie order. That is how clustering results change between runs on the same data: break ties deterministically.

## Recap

Four things to remember. The cut property, proved by one exchange, is the whole theory: the lightest edge across any cut is safe. Prim grows one tree from a heap keyed on edge weight alone, settling on pop; on a complete graph use the array version, order V squared. Kruskal sorts, then asks union-find "same tree?", costs order E log E, and gives a forest for free. And a spanning tree minimises total weight and every bottleneck, not distances.

At your desk: the proof run on the six-node graph, the three traces with their heap, array and parent columns, the code for both algorithms, the comparison table and cost numbers, and the Prim and Kruskal exercises.
