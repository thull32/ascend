---
lesson: connectivity-and-cycles
source: 693db05788c26afb
fit: partial
desk:
  - "The component labeller and its nine-vertex, three-component trace"
  - "The union-find code and its six-element trace with path compression"
  - "The undirected cycle trace, and the parallel-edge case where the parent check reports the wrong thing"
  - "The three-colour directed trace with its cross edge and back edge, and the cycle-reporting code"
  - "The two-colouring trace that finds the conflict edge on the triangle"
  - "The trade-off table: three-colour DFS, Kahn's algorithm and union-find"
  - "Exercises: count connected components, and detect a cycle in a directed graph"
---
## Introduction

Three questions come up whenever a graph appears in a design review. Which things are connected to which: clusters of users, groups of duplicate accounts. Is there a cycle: a circular dependency, a deadlock, an infinite redirect chain. And can this be split into two sides: conflicting pairs in different slots, or a matching problem.

Each is one traversal plus a few lines. And each has a well-known wrong answer that passes the easy tests. The undirected check that reports the edge you arrived by. The directed check that reports every diamond. The two-sides check that forgets the second component. This episode is those three questions, the step where the wrong version goes wrong, and where the same code runs inside a database.

## Connected components

In an undirected graph, a component is a maximal set of vertices with paths between all of them. To find them all: loop over every vertex, and whenever you hit one without a label, traverse from it with BFS or DFS, it does not matter which, and paint everything you reach with a new label. The number of times the outer loop starts a traversal is the component count.

That is order V plus E in total, and the label array pays twice. It is the visited set, and it answers "are these two in the same group?" in one comparison after the preprocessing. Rebuilding labels for every query is the mistake.

Now a shortcut worth knowing. A connected undirected graph with n vertices has no cycle if and only if it has exactly n minus 1 edges, because a tree on n vertices has n minus 1 edges. So "is this graph a tree?" is two checks: connected, and n minus 1 edges. Either one alone is not enough. A square of four vertices plus a separate path of six has 10 vertices and 9 edges, and it is not a tree.

The forest version: a graph with n vertices and c components and no cycles has n minus c edges. So the edge count, minus the quantity n minus c, counts the independent cycles, the edges you must remove to make it a forest.

If edges arrive over time and you need "same component?" between arrivals, re-traversing every time is too slow. Union-find answers each in nearly constant time.

Every vertex points at a parent, and a root points at itself. Find follows parents up to the root, then rewires every vertex on that path to point straight at it. That is path compression. Union finds both roots and hangs the smaller tree under the larger. That is union by size. Together, the amortised cost per operation is bounded by the inverse Ackermann function, which is at most 4 for any input that fits in memory. And memory is two integer arrays, nothing per edge.

It is also the shortest correct cycle detector for an undirected edge list. Process the edges in order. If an edge joins two vertices whose roots are already the same, that edge closes a cycle. That is the redundant connection problem in three lines.

## Cycles in undirected graphs

With DFS, any edge to a visited vertex is a cycle, except one. In an undirected graph every edge appears in both endpoints' lists. Take the simplest graph there is: two vertices, 0 and 1, one edge. Start at 0, step to 1, and look at 1's list. It contains 0, which is visited. A naive check reports a cycle in a single edge.

So carry the parent, and skip the edge you arrived by. In an undirected graph, any other visited neighbour is an ancestor still on the current path, because undirected DFS produces only tree edges and back edges. That is why a plain visited array is enough here.

There is a subtlety the lesson insists on. The parent check compares vertices, which is only right when at most one edge joins any pair. With two parallel edges between the same pair, which is a genuine cycle of length 2, skipping by parent vertex skips both copies. The boolean answer can survive by luck of order, but the reported cycle is wrong, and code that walks parents to print it runs off the root. If parallel edges can appear, store an edge id with each neighbour and skip only the id you arrived by.

## Cycles in directed graphs

The parent trick does not work here, and neither does a visited flag. Here is the example to hold. Three vertices. 0 points to 1, 0 points to 2, and 1 points to 2. Is there a cycle?

[pause]

No. It is a diamond: two routes to vertex 2, no loop. But walk it with a visited flag. Enter 0, then 1, then 2. Vertex 2 has no edges, so it finishes. So does 1. Back at 0, the edge to 2 finds 2 visited, and the naive check shouts "cycle". Every dependency graph where two things depend on the same library would be rejected.

The fix is three colours. White is undiscovered. Grey is discovered and still on the current path. Black is finished. An edge to a grey vertex is a back edge and means a cycle. An edge to a black vertex is harmless. In the diamond, 2 was black when 0 reached it, so no cycle. Now add one edge, from 2 back to 0. When DFS is inside 2, vertex 0 is grey, still on the path 0, 1, 2. That edge closes the cycle 0, 1, 2, 0.

A build tool must print the loop, not just say "cycle". Keep a parent array. When an edge hits a grey vertex, walk parents from where you are back to that vertex, and you have the cycle. That walk is safe precisely because grey means "on the current path".

The alternative is Kahn's algorithm, from the next lesson: repeatedly remove vertices with nothing left pointing into them, and if some are never removed, there is a cycle. But the leftovers include everything downstream of the cycle too, not just the loop. So use Kahn's to say what cannot be built, and three-colour DFS when the error message must name the loop. And in production, write it iteratively: dependency graphs are exactly the long chains that blow recursion limits.

## Two sides: bipartite graphs

A graph is bipartite if its vertices split into two sets with every edge crossing between them. Equivalently, you can colour it with two colours so that no edge joins two of the same colour. In disguise: split these people into two teams so no two who dislike each other are together, or schedule this in two slots.

Colour the start 0, give every neighbour the other colour, and spread with BFS. If you ever find an edge whose ends already share a colour, it is not bipartite. Picture a square of four vertices: the colours alternate all the way round, 0, 1, 0, 1, and it works. Now add a fifth vertex joined to two neighbouring corners of the square. That makes a triangle, and a triangle cannot be two-coloured. BFS finds an edge with matching colours.

That is the theorem in one picture: a graph is bipartite if and only if it has no odd cycle. Walking round a cycle flips the colour at every step, so you only get back to where you started after an even number of steps.

And the trap: the outer loop. A disconnected graph is bipartite only if every component is. Colour from vertex 0 alone, and a triangle in another component is never examined.

## Where it runs

A database deadlock detector is a directed cycle detector. The database keeps a wait-for graph: transaction A points to B when A waits for a lock B holds. A deadlock is a cycle. PostgreSQL does not check on every lock wait. A backend waits for the deadlock timeout, one second by default, before checking, on the assumption that deadlocks are rare and the check is relatively expensive. When it finds one, it usually aborts the transaction of the backend that ran the check, which is why the victim looks arbitrary from the application. InnoDB checks on every lock wait and rolls back the transaction that changed the fewest rows. Turn detection off for very high write concurrency, and the fallback is a lock wait timeout of 50 seconds.

Toolchains too. Go rejects an import cycle between packages at compile time. Cargo refuses a cycle among regular dependencies. And Node's CommonJS loader allows cycles by handing the second requirer a half-filled exports object, the source of "imported value is undefined" bugs.

One memory number: for a million vertices in Python, a byte array of colours is 1 megabyte, a list is 8, and a set of visited ids is about 61. The third colour costs nothing extra in a byte array.

## In the interview

A follow-up from the lesson. Count the components of an undirected graph whose million edges arrive as a stream.

[pause]

Union-find over the vertex ids. Start the count at the number of vertices, and subtract one for every union that merges two different roots. Memory is two integer arrays, the edges are never stored, and each edge costs nearly constant time. The wrong answer buffers every edge into an adjacency list and traverses at the end, which needs memory for all the edges.

And another: why does Floyd's tortoise and hare not generalise from linked lists to graphs? Because it relies on every node having at most one outgoing edge, so there is a single walk. A graph branches, and a two-pointer walk explores one path and misses cycles on the others. You need a colour per vertex.

## Recap

Four things to remember. Label components once in V plus E and answer "same group?" in one comparison; switch to union-find when edges arrive over time. Undirected and directed cycle detection are different algorithms: undirected skips the edge you came in on, directed needs three colours, because an edge to a finished vertex is a diamond, not a loop. Connected plus n minus 1 edges means tree, and bipartite means no odd cycle, checked across every component. And Kahn's leftovers say what cannot be built; to name the cycle, walk parents from the grey vertex.

At your desk: the component and union-find traces, the undirected and parallel-edge traces, the three-colour trace and cycle-reporting code, the two-colouring trace, the trade-off table, and the two exercises.
