---
lesson: connectivity-and-cycles
source: 7a9ddc250885c9ed
---
## 1

In an undirected graph, a depth-first cycle check that flags any edge to an already-visited vertex reports a cycle on a graph with the single edge between 0 and 1. Why?

A, the edge sits in both adjacency lists, so from 1 it leads back to the visited parent, 0. B, a single undirected edge is a cycle of length 2, going from 0 to 1 and back. C, the search marks both endpoints at once, so the edge finds 1 already visited. D, the graph is disconnected, so the search restarts from 1 and then sees 0 as visited.

[think]

The answer is A: the edge sits in both adjacency lists, so from 1 it leads back to the visited parent, 0.

Every undirected edge is seen from both ends, and the edge back to the vertex you arrived from is the same edge, not a cycle. Carry the parent, or the parent edge's id, and ignore it. Only two distinct edges between the same pair, a multi-edge, form a cycle of length 2.

## 2

A directed graph has edges from 0 to 1, 0 to 2, and 1 to 2. A cycle check that treats any edge to a visited vertex as a cycle returns what?

A, true, correctly, because the edge from 0 to 2 reaches a vertex on the current path. B, true, incorrectly, because 2 was visited but is already finished. C, true, correctly, because the paths 0, 1, 2 and 0, 2 together form a loop. D, false, correctly, because both edges into 2 lead into a sink.

[think]

The answer is B: true, incorrectly, because 2 was visited but is already finished.

This is a DAG. Whichever edge into 2 is examined second finds 2 visited, so the naive check returns true, but 2 is black, finished, not grey. Only an edge to a vertex still on the current path indicates a cycle; two paths converging on one vertex are a diamond, not a loop. Telling grey from black is the whole algorithm.

## 3

An undirected graph has 10 vertices and 9 edges. It is a tree if and only if what?

A, every vertex has degree at least 1. B, it is connected, or equivalently, acyclic. C, no vertex has a degree greater than 2. D, it has exactly two vertices of degree one.

[think]

The answer is B: it is connected, or equivalently, acyclic.

With n minus 1 edges, connected implies acyclic and acyclic implies connected, so either check is enough. An acyclic graph with 10 vertices and 9 edges has 10 minus 9, one, component. Degree conditions are not enough: a 4-cycle plus a separate path of six vertices has 10 vertices, 9 edges and no isolated vertex, yet it is not a tree.

## 4

A two-colouring by breadth-first search finds an edge whose endpoints have the same colour. What does that prove?

A, the graph contains an odd-length cycle, so it is not bipartite. B, the graph has a self-loop, the only same-colour edge possible. C, the graph contains an even-length cycle, so it is not bipartite. D, the search started at the wrong vertex, and should be retried from another.

[think]

The answer is A: the graph contains an odd-length cycle, so it is not bipartite.

Colours alternate along the search tree's paths, so two same-coloured vertices joined by an edge close a cycle of odd length through their common ancestor. Even cycles colour consistently: a 4-cycle is bipartite. And bipartiteness does not depend on where you start.

## 5

Edges of an undirected graph are added one at a time, and after each addition you must answer whether two given vertices are connected. What is the efficient structure?

A, an adjacency matrix, with its transitive closure kept updated. B, union-find with path compression and union by rank. C, a topological sort, maintained incrementally per edge. D, a breadth-first search recomputing all component labels after each edge.

[think]

The answer is B: union-find with path compression and union by rank.

Each union and find takes near-constant amortised time, against a full traversal of vertices plus edges after every insertion. Union-find handles only additions; deletions need different techniques. And a topological order is defined only for directed acyclic graphs, so it says nothing about undirected connectivity.

## 6

A build tool detects a cycle with Kahn's algorithm, and prints the vertices that were never emitted as the circular dependency. A user reports that the printed list contains targets that are not in any loop. Why?

A, Kahn's algorithm emits vertices in reverse, so the printed set is the acyclic part. B, Kahn's algorithm cannot detect cycles at all, so the leftover set is random. C, Kahn's algorithm leaves out every vertex on a cycle, and everything downstream of it. D, the in-degree count was off by one for vertices with parallel edges.

[think]

The answer is C: Kahn's algorithm leaves out every vertex on a cycle, and everything downstream of it.

A vertex is emitted only after all its predecessors, so a vertex that depends on a cycle waits forever along with the cycle itself. The leftover set names everything that cannot be built, which is useful, but it is not the cycle. To print the loop itself, run the three-colour depth-first search, and walk the parent array back from the grey vertex.
