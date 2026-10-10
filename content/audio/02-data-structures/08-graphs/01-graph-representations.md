---
lesson: graph-representations
source: 25bf3b021b2c11bf
fit: partial
desk:
  - "The six-vertex running example drawn four ways: adjacency list, matrix, edge list and CSR"
  - "The three-pass CSR build, the build code, and why the cursor copy matters"
  - "The memory-per-edge table across Python, Java, CSR and matrices, with its arithmetic"
  - "Under the hood: networkx, scipy.sparse, Neo4j records, and BFS as a GraphBLAS matrix-vector product"
  - "The state-space size table and the full trade-off table"
  - "Exercises: build an adjacency list and an adjacency matrix from an edge list"
---
## Introduction

A graph is a set of vertices and a set of edges between them. That is a mathematical object. Before you can run anything on it, you have to decide how it sits in memory, and that choice decides whether "list my neighbours" costs the vertex's degree or the whole vertex count, whether "is there an edge from u to v" is one step or a scan, and whether a big graph fits in memory at all.

Here is the number that makes it concrete. A graph with a million vertices and 10 million edges is 44 megabytes in one layout, 1.4 gigabytes in another, and 125 gigabytes as a bit matrix. Same graph.

And most graph bugs in interviews are representation bugs: an undirected graph built with edges in one direction only, a matrix allocated for a hundred thousand vertices, a visited set keyed by the wrong thing. Three ideas, then: the layouts and what each operation costs in them, what an edge really costs in bytes, and the graphs you never build at all.

## The vocabulary that matters

Directed edges go one way; undirected edges go both ways, and most representations store each one as two directed edges. Weighted edges carry a number, a distance or a cost. The degree of a vertex is its number of edges.

Here is a tiny graph to hold in your head for the whole lesson. Four vertices, 0 to 3, undirected. Vertices 0, 1 and 2 form a triangle: 0 joins 1, 1 joins 2, and 2 joins back to 0. Then a tail: 2 also joins 3. Four edges. Vertex 2 has degree 3, vertices 0 and 1 have degree 2, and vertex 3 has degree 1.

Add those degrees up: 8, which is twice the 4 edges. That always holds for an undirected graph, because every edge is counted from both ends. It is the cheapest sanity check you have on a freshly built graph. If the sum is not twice the edge count, you dropped a direction.

Two more words. A sparse graph has about as many edges as vertices; a dense one has close to the square. Most real graphs are sparse. When Facebook had 721 million active users, the median user had 99 friends.

## Adjacency list and adjacency matrix

The adjacency list keeps one list per vertex. In our tiny graph, vertex 0's list holds 1 and 2; vertex 1's holds 0 and 2; vertex 2's holds 1, 0 and 3; vertex 3's holds just 2. Memory is order V plus E. Listing a vertex's neighbours costs its degree, which is exactly what breadth-first and depth-first search need, so both run in V plus E. The weakness: checking whether one specific edge exists costs the degree, unless you use a set per vertex, which roughly doubles the memory.

The adjacency matrix is a V by V grid, with a 1 wherever an edge exists. Edge lookup is a single step. Everything else is worse. Memory is V squared whatever the edge count. Listing neighbours means scanning a whole row, so a traversal becomes V squared too.

Before I give you the number: a sparse graph of a hundred thousand vertices, about ten edges each, stored as a matrix of Python lists. How big?

[pause]

Ten billion cells. That is 1.25 gigabytes even as bits, and 80 gigabytes as a Python list of lists, for a graph whose adjacency list is a few tens of megabytes.

So when does the matrix win? Three cases. The graph really is dense. The algorithm is V squared or V cubed anyway, like Floyd-Warshall all-pairs shortest paths. Or V is tiny, a few hundred at most, and the one-step edge test makes the code simpler. Otherwise, the interview default is the adjacency list, stated with its V plus E cost.

The edge list, just pairs of endpoints, is what you receive as input and what Kruskal's algorithm sorts. For any traversal, convert it once.

## CSR, and what an edge costs

The layout that wins at scale is compressed sparse row, CSR. Two flat arrays. One, targets, holds every neighbour of vertex 0, then every neighbour of vertex 1, and so on, back to back. The other, offsets, says where each vertex's run begins. A vertex's neighbours are the slice between its offset and the next one, and its degree is one subtraction. In our tiny graph, vertex 2's run starts at slot 4 and the next starts at 7, so vertex 2 has degree 3 without reading a single neighbour.

No per-vertex allocation, and every neighbour scan is one contiguous read that streams through memory at prefetch speed. The cost: it is immutable. Inserting one edge means rebuilding an array the size of E.

Now bytes, for that graph of a million vertices and 10 million edges. CSR with 32-bit integers: 4 bytes per edge plus 4 per vertex, 44 megabytes. A Python list of lists, measured: about 45 bytes per edge, roughly 450 megabytes. Why ten times more? Each neighbour is an 8-byte pointer to a separate 28-byte integer object. A dictionary of sets: about 100 bytes per edge, a gigabyte. And networkx, which stores a dictionary of dictionaries of attribute dictionaries: about 140 bytes per edge, 1.4 gigabytes. Flexible, and fine up to a few million edges on a laptop. Wrong for a billion.

The matrix is not even on the same axis. Its size depends only on V, so at a million vertices it sits three orders of magnitude above the sparse layouts, however few edges there are.

## The bugs between directed and undirected

The single most common graph bug: building an undirected graph with edges in one direction only, then wondering why a search from vertex 3 cannot reach vertex 0 when the input clearly joins them. The second is the reverse: adding both directions to a directed graph, and then finding a cycle in every dependency graph.

Read the statement for the words. Directed, one-way, depends on, prerequisite, follows: directed. Friends, connected, adjacent, a road between: undirected. Write the flag down before you write the loop.

Two smaller traps. Parallel edges, the same pair given twice, appear twice in a list but once in a dictionary of dictionaries, where the last weight silently wins. If the input can contain two flights between the same cities and you want the cheapest, take the minimum on insert, and say so. And if you build with a default dictionary keyed by vertex, a vertex with no outgoing edges never appears as a key. Iterate over a separate vertex set, or sinks vanish from your component count.

## Implicit graphs

Many graphs are never built. The vertices and edges are defined by a rule, and the traversal generates neighbours on demand. The design question is always the same: what is a vertex, what is an edge, and how many vertices could there be?

Grids. A thousand by a thousand grid has a million cells and about 2 million undirected adjacencies. Nobody builds that. The neighbour function is "up, down, left, right, if in bounds", and the adjacency list costs zero bytes. Number of islands, rotting oranges and every maze problem are grid graphs.

State spaces. The vertices are configurations and the edges are legal moves. The 8-puzzle, the three by three sliding tiles, has 181,440 reachable states: it fits, but you only touch the part you reach. The 15-puzzle has about 10 trillion, so you never build it. A Rubik's cube, about 43 quintillion. For these, a visited set keyed by the state is what keeps the search finite, and choosing what goes into that key, position only, or position plus keys held, is the whole design problem.

The visited key has a measurable cost. On a grid in Python, checking a set of coordinate pairs took about 97 nanoseconds per check, against 36 for a two-dimensional list of booleans: nearly three times slower in the hottest loop of the search. And one trap in JavaScript: a set of coordinate arrays never matches, because arrays compare by reference. Use a string key, a number like row times columns plus column, or a boolean grid.

## In the interview

The signal is saying "the vertices are X, the edges are Y, and there are about Z of them" before you write any code. Then the representation and its cost: adjacency list, V plus E memory, so the search is V plus E.

A follow-up from the lesson. The graph has a billion edges and 100 million vertices. How do you store it on one machine?

[pause]

CSR with 32-bit targets: 4 gigabytes of targets and 0.4 of offsets, which fits. Sorting each vertex's neighbours and storing the gaps between them, as web-graph compressors do, brings it down to a few bits or a couple of bytes per edge. The wrong answer is a dictionary of sets, at 100 bytes an edge: 100 gigabytes.

And the natural next question: the graph changes all day, friend and unfriend events. Still CSR? No. CSR is immutable, and inserting means an order-E rebuild. Keep the live graph as adjacency lists or sets, and rebuild a CSR snapshot periodically for analytics. Shifting the targets array on every insert would turn a million events a day into a quadrillion element moves.

## Recap

Four things to remember. The representation decides the cost: adjacency lists give V plus E traversals, a matrix gives one-step edge tests and V squared everything else. Put a number on an edge: about 45 bytes in a Python list of lists, about 140 in networkx, 4 in CSR, and a matrix that ignores the edge count entirely. Undirected means both directions, and the degree sum equal to twice the edges is your check. And grids and puzzles are implicit graphs: say what a vertex is, what an edge is, how many there are, and key the visited set deliberately.

At your desk: the running example in four layouts, the CSR build, the memory table, the under-the-hood section on networkx, scipy, Neo4j and GraphBLAS, the state-space and trade-off tables, and the two exercises.
