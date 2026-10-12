---
lesson: topological-sort-and-dags
source: 41c119eca1baffff
---
## 1

Kahn's algorithm finishes with 47 of 50 vertices in its output. What do you know about the other 3?

A, they sit in a separate component, which Kahn's algorithm never starts from. B, each is on a cycle or downstream of one, so it never reached in-degree zero. C, they have the highest in-degrees, so the queue ran dry before reaching them. D, they are isolated vertices, so they never entered the in-degree count.

[think]

The answer is B: each is on a cycle or downstream of one, so it never reached in-degree zero.

A vertex is emitted once all its predecessors are emitted. A vertex on a cycle waits on itself, and anything downstream of the cycle waits on it. Reporting those vertices tells the user what cannot be built, but it is not the cycle itself. Isolated vertices and other components are no problem: every vertex with in-degree zero is seeded into the queue at the start.

## 2

A DAG has the topological orders 0, 1, 2, 3 and also 1, 0, 2, 3. What does this imply?

A, neither 0 nor 1 reaches the other, so they could be processed in parallel. B, Kahn's algorithm is non-deterministic, so it can emit either order. C, the graph has a cycle through 0 and 1, so no single order is forced. D, the graph has only two edges, so most pairs of vertices are left unordered.

[think]

The answer is A: neither 0 nor 1 reaches the other, so they could be processed in parallel.

Two valid orders that differ only by swapping two neighbours mean neither depends on the other. A unique topological order requires a Hamiltonian path. A cycle would make no order valid at all, and the orders say nothing about the edge count: edges from 0 to 2, 1 to 2, and 2 to 3 fit, and so do other edge sets.

## 3

Why is longest path easy on a DAG, but NP-hard in general?

A, DAG edges are unweighted, so longest path reduces to a breadth-first depth. B, DAGs have at most V minus 1 edges, so the number of paths to search stays linear. C, general graphs have no topological order, so they have no longest path. D, in topological order, each predecessor's value is final before it is used.

[think]

The answer is D: in topological order, each predecessor's value is final before it is used.

The recurrence, the longest path to v is the best predecessor's longest path plus the edge weight, is well-founded only when the dependencies are acyclic, so one pass of relaxation in topological order is enough. With cycles, the simple-path constraint makes the problem combinatorial. General graphs still have longest simple paths; they are just hard to find. And DAGs can have weighted edges, and on the order of V squared of them.

## 4

Terraform applies resources in topological order, and destroys them in reverse topological order. Why reverse for destruction?

A, reverse order avoids the cycles that forward deletion would create. B, each resource must go before the resources it depends on are removed. C, order does not matter for deletion; reversing is only a convention. D, reverse order is faster, as leaf resources hold fewer dependencies.

[think]

The answer is B: each resource must go before the resources it depends on are removed.

If A depends on B, A must be created after B and destroyed before it; otherwise the dependency is deleted while it is still in use. Reversing a topological order reverses every edge constraint consistently. It cannot introduce cycles, because the graph is the same DAG with its edges flipped.

## 5

A build ran the same DAG twice, and independent targets ran in different orders, exposing a hidden shared-file dependency on the second run. What is the most likely cause?

A, the depth-first variant was used, and its finish order changes on every run. B, the ready set is a hash set, so ties break differently in each process. C, the DAG contained a cycle that the count check failed to detect. D, Kahn's algorithm is randomised by design, to balance the worker pool.

[think]

The answer is B: the ready set is a hash set, so ties break differently in each process.

Kahn's algorithm is deterministic, given a fixed adjacency order and a first-in, first-out queue. Nondeterminism enters when ready vertices are kept in a structure whose iteration order varies per process, such as a Python set of strings under hash randomisation. A cycle would make the order short, not reordered, and the depth-first variant is equally deterministic for a fixed input order. A sorted ready set, or a heap, makes the order reproducible.

## 6

A package manager is asked to install 200 packages with version ranges. Which step is a topological sort?

A, backtracking when a chosen version leads to a dead end. B, ordering the chosen versions so that dependencies install first. C, checking that no two packages require conflicting versions. D, choosing one version per package that satisfies every range.

[think]

The answer is B: ordering the chosen versions so that dependencies install first.

Selecting versions under range constraints is constraint satisfaction, which pip solves by backtracking search, and which can be slow or fail; conflict checking and backtracking are parts of that search. Only once one version per package is fixed does a concrete dependency DAG exist, and ordering it so that each package follows its dependencies is the topological sort.
