---
lesson: depth-first-search
source: 0d8794e8c9eece1a
---
## 1

During a depth-first search on a directed graph, you examine the edge from u to v, and v has already been visited and finished. What can you conclude?

A, v is an ancestor of u, so the edge is a back edge to the current path. B, the search is incorrect, since a finished vertex is never examined again. C, it is a forward or cross edge, which alone does not signal a cycle. D, the graph has a cycle, because v is being reached a second time.

[think]

The answer is C: it is a forward or cross edge, which alone does not signal a cycle.

A cycle is signalled by an edge to a vertex that is discovered but not finished: grey, still on the current path. A finished vertex cannot be an ancestor of u, because an ancestor is still open while u is being explored, so the edge points forward or across. Treating any visited vertex as a cycle is the classic false positive.

## 2

You convert a recursive depth-first search to an explicit stack by pushing all of a vertex's neighbours and marking visited on pop. Compared with the recursive version, what changes?

A, nothing changes, since the stack is exactly what recursion used anyway. B, some reachable vertices are missed, since a vertex pushed twice is skipped. C, running time grows to V squared, since each pop rescans the whole visited set. D, the stack can grow to the number of edges from repeated pushes, and the finish order is lost.

[think]

The answer is D: the stack can grow to the number of edges from repeated pushes, and the finish order is lost.

Pushing in reverse keeps the discovery order the same as recursion, and every reachable vertex is still visited; a duplicate is skipped only because it was already marked. But duplicates can pile up on the stack, and the moment a vertex finishes is never observable. A stack of iterators fixes both, with a stack no larger than V and the same pre-order and post-order as recursion.

## 3

In a depth-first search, vertex u was discovered at time 3 and finished at time 6. Vertex v was discovered at time 1 and finished at time 16. The graph has an edge from u to v. What kind of edge is it?

A, a forward edge, because v was discovered before u and finished after it. B, a back edge, because v's interval contains u's, so v is an ancestor of u. C, a tree edge, because v's discovery time is the smallest in the graph. D, a cross edge, because the two intervals overlap without being equal.

[think]

The answer is B: a back edge, because v's interval contains u's, so v is an ancestor of u.

3 to 6 nests inside 1 to 16, so by the parenthesis theorem v is an ancestor of u, and an edge from a descendant to an ancestor is a back edge: v was grey when u examined the edge. A forward edge runs the other way, from ancestor to descendant. A cross edge needs disjoint intervals, and a tree edge into v would need u to be discovered first.

## 4

A recursive flood fill on a 2,000 by 2,000 grid of all-land cells crashes. What is the cause?

A, recursive depth-first search revisits cells without a queue, so it loops forever. B, the recursion depth reaches millions of frames, beyond the stack limit. C, the visited set grows to the square of the cell count, and exhausts the heap. D, the grid does not fit in memory, since 4 million cells need gigabytes.

[think]

The answer is B: the recursion depth reaches millions of frames, beyond the stack limit.

A depth-first search on a fully connected grid can snake through every cell before backing up, so the depth equals the cell count, far beyond CPython's 1,000 frames or a thread's native stack. The grid itself is only a few megabytes, and the visited set holds one entry per cell. Use an explicit stack, or breadth-first search.

## 5

Why is a chess engine's search depth-first, with a depth limit, rather than breadth-first?

A, breadth-first search cannot alternate two players, since its levels mix both sides. B, depth-first search explores the strongest line first, so it finds better moves sooner. C, depth-first holds one path of length d, while breadth-first must store a level of size b to the d. D, depth-first spends less time per node, since a stack push beats a queue push.

[think]

The answer is C: depth-first holds one path of length d, while breadth-first must store a level of size b to the d.

The game tree's width explodes exponentially: with a branching factor around 35, a whole level is infeasible to store, while depth-first search keeps memory linear in the depth. Move quality comes from evaluation and pruning, not traversal order. Iterative deepening gives the level-by-level behaviour when it is needed, at about 1.03 times the work.

## 6

In a depth-first path search, a vertex v failed to reach the target. When exploring other branches, what about keeping v marked visited?

A, it is needed to stop infinite loops, but it can make the search miss paths. B, it is correct only in undirected graphs, because directed edges are one-way. C, it is correct, because reachability from v does not depend on how v was reached. D, it is a bug, because v might still reach the target along a route through different vertices.

[think]

The answer is C: it is correct, because reachability from v does not depend on how v was reached.

Reachability is a property of v alone: if no route from v reached the target the first time, no other way into v will find one. Unmarking would re-explore the same dead subtree from every entry point, and could become exponential. Only path-dependent constraints, such as no reused cells or a resource limit, require undoing visited marks.
